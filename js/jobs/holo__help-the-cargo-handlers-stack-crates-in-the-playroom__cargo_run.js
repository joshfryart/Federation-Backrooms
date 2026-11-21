// Holodeck tech: stack crates. A crate swings side to side above the pallet; press Space to drop it. It must land within a hand's width of the
// crate below, and the whole stack must not lean toward the doorway. Five crates level the stack.
import { define, machine, SPACE, rf, txt, COL } from './kit.js';

export default define({
  job: { billet: 'holo', label: 'Help the cargo handlers stack crates in the playroom', type: 'task:cargo_run' },
  title: 'Drop the swinging crate on the stack', dept: 'services', host: 'console', tool: 'Pallet and crate hoist',
  how: 'The crate swings over the pallet. Press Space as it passes directly above the crate below so the stack stays level.',
  keys: ['Space drop the crate'], limit: 26, maxFaults: 3,
  fingerprint: { verb: 'drop and align', input: 'space', win: 'five crates dropped square on the one below with the stack never leaning toward the doorway',
    fail: 'dropping a crate far off the one below so it topples, or letting the whole stack lean toward the door',
    rule: 'A crate swings across the pallet. Space drops it; it must land within a hand of the crate below. The stack centre drifting past the lean mark is a fault.' },
  rush: 'Stacked the crates quickly as they came and let the pile lean over the doorway.',
  captions: { tipped: 'crate topples', lean: 'stack groans toward the door' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, A = 0.6, w = m.calm ? 1.7 : 2.3, ok = m.calm ? 0.14 : 0.1; m.n = 5; m.round = 0; m.prev = 0; m.t0 = 0.4; m.ph = rf(r, 0, 1.2); m.xs = [];
    const x = () => A * Math.sin(w * (m.t - m.t0) + 0); const live = () => m.t >= m.t0;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down || !SPACE(code) || !live()) return false; const px = x(), off = px - m.prev;
      if (Math.abs(off) > ok) { m.fault('tipped'); m.t0 = m.t + 0.5; return true; }
      m.prev = px; m.xs.push(+px.toFixed(2)); m.round++; m.t0 = m.t + 0.5 + m.ph * 0; if (Math.abs(m.prev) > 0.3) { m.fault('lean'); m.prev = 0; }
      if (m.round >= m.n) m.win(); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => live() && Math.abs(x() - m.prev) < 0.035 ? [['Space', true]] : [];
    m.bad = () => live() && Math.abs(x() - m.prev) > 0.35 ? 'Space' : null;
    m.view = () => ({ w: +w.toFixed(2), ph: +m.ph.toFixed(2) });
    m.buttons = () => [['Space', 'Drop']];
    m.draw = (c, W, H, P) => { c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(60, 150, 280, 6); c.fillStyle = COL.peri; c.fillRect(200 + m.prev * 200 - 22, 126, 44, 24);
      if (live()) { c.fillStyle = COL.gold; c.fillRect(200 + x() * 200 - 22, 40, 44, 24); } c.strokeStyle = P.bad; c.lineWidth = 2; c.beginPath(); c.moveTo(200 + 0.3 * 200, 30); c.lineTo(200 + 0.3 * 200, 150); c.stroke(); txt(c, 'DOOR', 200 + 0.3 * 200 + 4, 28, { size: 10, col: P.bad });
      txt(c, `${m.round} / ${m.n} stacked`, 16, 14, { size: 11, col: COL.dim }); };
    return m;
  },
});
