// Chief of security: guard the hold during loading. Crates ride the loader belt past your tally line. Tap Space as each sealed crate crosses
// the line to count it in; pull an unsealed crate off the belt (↓) for inspection. Anything that crosses untouched is a missing crate.
import { define, machine, ARROW, SPACE, rf, txt, box, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'cos', label: 'Guard hold during loading', type: 'task:cargo_run' },
  title: 'Loader belt tally line', dept: 'security', host: 'console', tool: 'Tally clicker at the belt',
  how: 'Crates cross your tally line on the loader belt: tap Space to count a sealed crate as it crosses, press ↓ to pull an unsealed one off for inspection.',
  keys: ['Space count in', '↓ pull off'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'belt tally', input: 'arrows+space', win: 'every crate on the belt counted in or pulled off as it crossed the line',
    fail: 'letting a crate cross untouched, counting an unsealed crate, or clicking at an empty belt',
    rule: 'The belt speeds up as loading goes on. When a crate is on the line: Space if its seal tag is intact (◆), ↓ if the seal is broken (▲). Any key with nothing on the line is a miscount.' },
  rush: 'Counted the pallets at the end and wrote the manifest number down.',
  captions: { 'missed crate': 'belt rattles on', 'counted unsealed': 'tally beep', 'empty belt': 'clicker clicks' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, win = m.calm ? 0.55 : 0.4;
    m.crates = []; let x = -1.5; for (let k = 0; k < 10; k++) { m.crates.push({ x, sealed: r() > 0.3, res: 0 }); x -= rf(r, 1.1, 1.9); }
    m.speed = 0.8; m.done = 0; m.rounds = 10; m.round = 0;
    const onLine = () => m.crates.find(c => !c.res && Math.abs(c.x) <= win);
    const settle = (c, res) => { c.res = res; m.done++; m.round++; if (m.done >= m.crates.length) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code); if (!SPACE(code) && a !== 'D') return false; const c = onLine();
      if (!c) { m.fault('empty belt'); return true; }
      if (SPACE(code)) { if (!c.sealed) { m.fault('counted unsealed'); settle(c, 3); } else settle(c, 1); } else { if (c.sealed) { m.fault('pulled a sealed crate'); settle(c, 3); } else settle(c, 2); }
      return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.speed = 0.8 + m.done * 0.06; for (const c of m.crates) { if (c.res !== 2) c.x += m.speed * dt; if (!c.res && c.x > win) { m.fault('missed crate'); settle(c, 3); } } };
    m.hint = () => { const c = onLine(); return c && c.x > -win * 0.5 ? [[c.sealed ? 'Space' : 'ArrowDown', true]] : []; };
    m.bad = () => (onLine() ? null : 'Space');
    m.view = () => ({ crates: m.crates.map(c => [+c.x.toFixed(2), c.sealed]) });
    m.buttons = () => [['Space', 'Count in'], ['ArrowDown', '▼ Pull off']];
    m.draw = (c, W, H, P) => {
      const cx = W / 2, sc = 60, y = 70; box(c, 6, y - 26, W - 12, 52, 'rgba(255,255,255,.05)', null, 6);
      c.fillStyle = COL.gold; c.fillRect(cx - 1, y - 34, 3, 68); txt(c, 'TALLY LINE', cx, y - 38, { size: 9, col: COL.gold, align: 'center' });
      for (const q of m.crates) { const px = cx + q.x * sc; if (px < -30 || px > W + 30 || q.res === 2) continue; box(c, px - 18, y - 18, 36, 36, q.res === 1 ? 'rgba(79,208,106,.25)' : '#2a2748', COL.lav, 4); lamp(c, px, y, 8, q.sealed ? P.good : COL.warn, q.sealed ? 'diamond' : 'triangle'); }
      txt(c, `counted ${m.crates.filter(q => q.res === 1).length} · pulled ${m.crates.filter(q => q.res === 2).length} · of ${m.crates.length}`, 14, H - 14, { size: 12, col: COL.pale });
      txt(c, `belt ${(m.speed * 1.2).toFixed(1)} m/s`, W - 14, H - 14, { size: 11, col: COL.peri, align: 'right' });
    };
    return m;
  },
});
