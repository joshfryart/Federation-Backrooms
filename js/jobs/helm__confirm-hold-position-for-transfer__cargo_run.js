// Helm: confirm hold position for the cargo transfer. The range display gives the collar offset front and side in metres. The lateral
// thrust keys accelerate the ship for as long as they are held, and it coasts on after you let go, so you thrust, coast, and counter-thrust
// to stop inside the printed box. Only when the offset has sat in the box, not moving, for the full hold window may you report hold
// confirmed (Enter). Confirming while it still drifts aborts the transfer; leaving the deck crew waiting too long is a fault too.
import { define, machine, ARROW, ENTER, rf, pick, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'helm', label: 'Confirm hold position for transfer', type: 'task:cargo_run' },
  title: 'Coast-and-counter collar hold confirm', dept: 'flight', host: 'console', tool: 'Lateral thrust keys and collar range display',
  how: 'Hold the arrows to thrust: the ship keeps coasting after you let go, so counter-thrust to stop with the offset in the box. When the hold meter is full, press Enter to report hold confirmed.',
  keys: ['← → hold: side thrust', '↑ ↓ hold: fore / aft thrust', 'Enter report hold confirmed'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'confirm the hold', input: 'arrows-hold+enter', win: 'two transfers confirmed after the collar offset sat still inside the box for the full hold window',
    fail: 'reporting hold while the offset is still drifting or outside the box, or leaving the deck crew waiting after the window has run',
    rule: 'Held arrows accelerate the ship on that axis and it coasts after release. Stop it in the box; the hold meter fills only while the offset is in the box and steady. Press Enter once it is full, within a few seconds.' },
  rush: 'Called hold confirmed as soon as the numbers looked small.',
  captions: { 'confirmed early': 'deck chief: collar is moving, abort', 'crew kept waiting': 'deck chief: helm, are we holding?' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, A = 0.22, B = 0.1, win = m.calm ? 2.0 : 2.5, wait = m.calm ? 5 : 4;
    m.xs = Array.from({ length: 2 }, () => [pick(r, [-1, 1]) * rf(r, 0.3, 0.55), pick(r, [-1, 1]) * rf(r, 0.3, 0.55)]);
    m.n = 0; m.rounds = 2; m.round = 0; m.held = {};
    const load = () => { [m.x, m.y] = m.xs[m.n]; m.vx = 0; m.vy = 0; m.hold = 0; m.full = 0; };
    load(); const steady = () => Math.abs(m.x) < B && Math.abs(m.y) < B && Math.abs(m.vx) < 0.02 && Math.abs(m.vy) < 0.02;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code); if (a) { m.held[a] = down; return true; }
      if (ENTER(code)) { if (!down) return true; if (m.hold < win) { m.fault('confirmed early'); m.hold = 0; return true; }
        m.n++; m.round = m.n; if (m.n >= 2) m.win(); else load(); return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const d = Math.exp(-0.25 * dt), h = m.held;
      m.vx = (m.vx + ((h.R ? A : 0) - (h.L ? A : 0)) * dt) * d; m.vy = (m.vy + ((h.D ? A : 0) - (h.U ? A : 0)) * dt) * d; m.x += m.vx * dt; m.y += m.vy * dt;
      if (steady()) { m.hold += dt; if (m.hold >= win) { m.full += dt; if (m.full > wait) { m.fault('crew kept waiting'); m.full = 0; } } } else { m.hold = 0; m.full = 0; }
    };
    const axis = (p, v, neg, pos) => {
      const want = -Math.sign(p) * Math.min(0.14, Math.sqrt(2 * A * Math.max(0, Math.abs(p) - 0.02)) * 0.6), e = want - v;
      return Math.abs(e) < 0.008 ? [[neg, false], [pos, false]] : e > 0 ? [[pos, true], [neg, false]] : [[neg, true], [pos, false]];
    };
    m.hint = () => (m.hold >= win + 0.05 ? [['ArrowLeft', false], ['ArrowRight', false], ['ArrowUp', false], ['ArrowDown', false], ['Enter', true]]
      : [...axis(m.x, m.vx, 'ArrowLeft', 'ArrowRight'), ...axis(m.y, m.vy, 'ArrowUp', 'ArrowDown')]);
    m.bad = () => (m.hold < win ? 'Enter' : null);
    m.view = () => ({ xs: m.xs.map(p => p.map(v => +v.toFixed(3))) });
    m.buttons = () => [['ArrowLeft', '◀ side'], ['ArrowUp', '▲ fore'], ['ArrowDown', '▼ aft'], ['ArrowRight', 'side ▶'], ['Enter', 'Hold confirmed']];
    m.draw = (c, W, H, P) => {
      const cx = 92, cy = 85, S = 120; c.strokeStyle = P.good; c.lineWidth = 2; c.strokeRect(cx - B * S, cy - B * S, B * S * 2, B * S * 2);
      c.strokeStyle = 'rgba(255,255,255,.15)'; c.beginPath(); c.moveTo(cx - 70, cy); c.lineTo(cx + 70, cy); c.moveTo(cx, cy - 70); c.lineTo(cx, cy + 70); c.stroke();
      c.fillStyle = COL.gold; c.beginPath(); c.arc(cx + Math.max(-70, Math.min(70, m.x * S)), cy + Math.max(-70, Math.min(70, m.y * S)), 6, 0, 6.283); c.fill();
      box(c, 200, 14, 186, 58, COL.panel, null, 6);
      txt(c, `side ${(m.x * 10).toFixed(1)} m  ${m.vx > 0.02 ? '▶' : m.vx < -0.02 ? '◀' : '·'}`, 212, 36, { size: 13, col: Math.abs(m.x) < B ? COL.ink : COL.warn });
      txt(c, `front ${(m.y * 10).toFixed(1)} m  ${m.vy > 0.02 ? '▼' : m.vy < -0.02 ? '▲' : '·'}`, 212, 60, { size: 13, col: Math.abs(m.y) < B ? COL.ink : COL.warn });
      txt(c, 'HOLD WINDOW', 200, 92, { size: 10, col: COL.dim }); bar(c, 200, 98, 186, 10, m.hold / win, { col: m.hold >= win ? P.good : COL.peri });
      txt(c, m.hold >= win ? 'FULL: report hold (Enter)' : steady() ? 'holding…' : 'still moving', 200, 128, { size: 12, col: m.hold >= win ? P.good : COL.pale });
      txt(c, `transfer ${Math.min(2, m.n + 1)} / 2`, 200, 150, { size: 11, col: COL.dim });
    };
    return m;
  },
});
