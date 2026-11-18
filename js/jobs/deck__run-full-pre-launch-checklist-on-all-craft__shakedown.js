// Deck crew: run the full pre-launch checklist on all craft. Each gauge only reads while you hold its test button (Space); the needle swings
// and settles, and some old gauges take a long time to settle. Tick the line (Enter, still holding) only once the needle has stopped moving:
// ticking a swinging needle writes down a reading you never read. The control stick line is ticked by moving it through its full travel
// (Left, Right, Down); ticking it before all three is skipping the awkward item.
import { define, machine, SPACE, ENTER, ARROW, rf, txt, box, COL } from './kit.js';

const GAUGES = ['Fuel', 'Pressure', 'Battery'];
export default define({
  job: { billet: 'deck', label: 'Run full pre-launch checklist on all craft', type: 'task:shakedown' },
  title: 'Pre-launch needle-settle checklist', dept: 'flight', host: 'console', tool: 'Craft checklist and gauge panel',
  how: 'Hold Space to power the gauge and wait for the needle to stop swinging, then press Enter while still holding to tick it. For the stick line move it Left, Right and Down, then Enter.',
  keys: ['Space hold: power the gauge', 'Enter: tick the line', 'Left / Right / Down: stick travel'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'read and tick', input: 'space-hold+enter+arrows', win: 'every gauge line on all three craft ticked only after its needle settled, and every stick moved through full travel',
    fail: 'ticking a gauge while its needle is still swinging, or ticking the stick before testing all of its travel',
    rule: 'A gauge reads only while Space is held, and its needle rings down at its own pace (some slowly). Enter ticks the current line; a needle still moving is an unread tick. Stick line: Left, Right and Down in any order, then Enter.' },
  rush: 'Ticked down the sheet from memory of yesterday’s readings.',
  captions: { 'unread tick': 'pen scratch', 'stick skipped': 'checklist flagged' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, k = m.calm ? 1.3 : 1;
    m.lines = []; for (let c = 1; c <= 3; c++) { for (const g of GAUGES.slice(0, 2 + (c === 2 ? 1 : 0))) m.lines.push({ craft: c, g, fin: rf(r, 0.45, 0.8), amp: rf(r, 0.25, 0.4), tau: rf(r, 0.2, 0.75) / k, w: rf(r, 9, 14), t: 0 }); m.lines.push({ craft: c, g: 'Stick', trav: {} }); }
    m.i = 0; m.rounds = 3; m.round = 1;
    const L = () => m.lines[m.i];
    m.env = (l) => l.amp * Math.exp(-l.t / l.tau);
    m.needle = (l) => (m.held.S ? l.fin + m.env(l) * Math.cos(l.w * l.t) : 0);
    m.settled = (l) => m.held.S && m.env(l) < 0.02;
    const tick = () => { m.ev('tick', { line: m.i }); m.i++; if (m.i >= m.lines.length) { m.win(); return; } m.round = L().craft; L().t = 0; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), l = L(); if (!l) return false;
      if (SPACE(code)) { m.held.S = down; if (!down && l.g !== 'Stick') l.t = 0; return true; }
      if (a) { if (down && l.g === 'Stick' && 'LRD'.includes(a)) l.trav[a] = 1; return true; }
      if (ENTER(code)) { if (!down) return true;
        if (l.g === 'Stick') { if (Object.keys(l.trav).length < 3) { m.fault('stick skipped'); return true; } tick(); return true; }
        if (!m.settled(l)) { m.fault('unread tick'); return true; } tick(); return true; }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const l = L(); if (l && l.g !== 'Stick' && m.held.S) l.t += dt; };
    m.hint = () => { const l = L(); if (!l) return []; if (l.g === 'Stick') { const miss = ['L', 'R', 'D'].find(a => !l.trav[a]); return miss ? [['Space', false], [{ L: 'ArrowLeft', R: 'ArrowRight', D: 'ArrowDown' }[miss], true]] : [['Enter', true]]; }
      if (!m.held.S) return [['Space', true]]; return m.env(l) < 0.012 ? [['Enter', true]] : []; };
    m.bad = () => { const l = L(); if (!l) return null; if (l.g !== 'Stick' && !m.held.S) return ['Space', true]; return 'Enter'; };
    m.view = () => ({ lines: m.lines.map(l => (l.g === 'Stick' ? 'S' : [+l.fin.toFixed(2), +l.tau.toFixed(2)])) });
    m.buttons = () => [['Space', 'Test (hold)'], ['Enter', 'Tick'], ['ArrowLeft', 'Stick ◀'], ['ArrowRight', 'Stick ▶'], ['ArrowDown', 'Stick ▼']];
    m.draw = (c, W, H, P) => {
      const l = L(); if (!l) return; txt(c, `Craft ${l.craft} / 3`, 16, 18, { size: 13, col: COL.gold });
      m.lines.filter(x => x.craft === l.craft).forEach((x, j) => { const idx = m.lines.indexOf(x), done = idx < m.i; txt(c, `${done ? '✓' : idx === m.i ? '▶' : '·'} ${x.g}`, 16, 42 + j * 18, { size: 12, col: done ? P.good : idx === m.i ? COL.ink : COL.dim }); });
      if (l.g === 'Stick') { box(c, 200, 30, 120, 110, 'rgba(255,255,255,.04)', COL.dim, 6); [['L', 220, 85], ['R', 300, 85], ['D', 260, 128]].forEach(([a, x, y]) => txt(c, l.trav[a] ? '●' : '○', x, y, { size: 18, align: 'center', col: l.trav[a] ? P.good : COL.dim })); txt(c, '+', 260, 90, { size: 20, align: 'center' }); return; }
      const cx = 270, cy = 120, R = 70; c.strokeStyle = COL.dim; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R, Math.PI, 0); c.stroke();
      const v = m.needle(l), ang = Math.PI + v * Math.PI; c.strokeStyle = m.held.S ? COL.orange : COL.dim; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(ang) * (R - 6), cy + Math.sin(ang) * (R - 6)); c.stroke();
      txt(c, l.g, cx, cy + 22, { size: 11, align: 'center', col: COL.pale }); txt(c, m.held.S ? `${Math.round(v * 100)}` : 'no power', cx, cy - 20, { size: 14, align: 'center' });
    };
    return m;
  },
});
