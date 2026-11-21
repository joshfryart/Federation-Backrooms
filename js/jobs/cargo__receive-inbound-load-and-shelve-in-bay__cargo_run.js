// Cargo: receive the inbound load and shelve it in the bay. Crates arrive one at a time with a weight. Pick a shelf column with Left/Right and
// set the crate down with Space. A crate may only go on a shelf that is empty or whose top crate is at least as heavy: heavy at the bottom.
import { define, machine, ARROW, SPACE, ri, shuffle, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'cargo', label: 'Receive inbound load and shelve in bay', type: 'task:cargo_run' },
  title: 'Heavy-first shelf stacking', dept: 'services', host: 'console', tool: 'Bay shelf columns',
  how: 'Choose a shelf column with Left/Right and press Space to put the next crate on it. Never put a crate on a lighter one: heavy goes at the bottom.',
  keys: ['Left/Right pick a column', 'Space set the crate down'], limit: 28, maxFaults: 3,
  fingerprint: { verb: 'shelve heavy-first', input: 'arrows+space',
    win: 'all six inbound crates shelved across three columns, each resting on an equal or heavier crate',
    fail: 'setting a heavy crate on a lighter one, three times, so the stack crushes',
    rule: 'The next crates and their weights show at the top. Pick one of three columns and press Space. A column accepts a crate only if it is empty or its top crate weighs at least as much.' },
  rush: 'Stacked the crates wherever there was floor and left the heavy ones on top.',
  captions: { crush: 'crate crushes' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, w = shuffle(r, [1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 6).sort((a, b) => b - a), plan = [[], [], []];
    w.forEach((x, k) => plan[k % 3].push(x)); const q = [];
    for (const s of shuffle(r, [0, 0, 1, 1, 2, 2])) q.push({ w: plan[s].shift(), s });
    m.q = q; m.col = [[], [], []]; m.sel = 1; m.rounds = 6; m.round = 0;
    const ok = (c, w2) => !m.col[c].length || m.col[c][m.col[c].length - 1] >= w2;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a === 'L' || a === 'R') { m.sel = Math.max(0, Math.min(2, m.sel + (a === 'R' ? 1 : -1))); return true; }
      if (SPACE(code) && m.q.length) { const c = m.q[0]; if (!ok(m.sel, c.w)) m.fault('crush'); else { m.col[m.sel].push(c.w); m.q.shift(); m.round++; if (!m.q.length) m.win(); } return true; }
      return false;
    };
    m.hint = () => { const c = m.q[0]; if (!c) return []; return m.sel < c.s ? [['ArrowRight', true]] : m.sel > c.s ? [['ArrowLeft', true]] : [['Space', true]]; };
    m.bad = () => { const c = m.q[0]; if (!c) return null; let t = [0, 1, 2].findIndex(k => !ok(k, c.w)); if (t < 0) t = c.s; return m.sel < t ? 'ArrowRight' : m.sel > t ? 'ArrowLeft' : 'Space'; };
    m.view = () => ({ q: m.q.map(c => [c.w, c.s]) });
    m.buttons = () => [['ArrowLeft', '< col'], ['ArrowRight', 'col >'], ['Space', 'Set down']];
    m.draw = (c, W, H, P) => {
      txt(c, 'INBOUND', 12, 18, { size: 11, col: COL.peri }); m.q.slice(0, 5).forEach((k, i) => { box(c, 70 + i * 52, 6, 46, 18, i ? 'rgba(255,255,255,.05)' : 'rgba(244,194,91,.25)', i ? null : COL.gold, 4); txt(c, k.w + ' t', 93 + i * 52, 19, { size: 11, align: 'center' }); });
      for (let s = 0; s < 3; s++) { const x = 40 + s * 120; box(c, x - 6, 34, 110, 130, 'rgba(255,255,255,.03)', s === m.sel ? COL.gold : COL.dim, 6);
        m.col[s].forEach((wt, k) => { box(c, x + 10, 146 - k * 26, 20 + wt * 7, 22, 'rgba(244,194,91,.3)', COL.ink, 3); txt(c, wt, x + 14, 162 - k * 26 - 4, { size: 10 }); }); }
    };
    return m;
  },
});
