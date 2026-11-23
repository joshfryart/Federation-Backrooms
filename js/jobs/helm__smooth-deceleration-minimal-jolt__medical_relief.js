// Helm: smooth deceleration, minimal jolt, with casualties aboard. The retro-brake lever is a slow analogue lever (hold Up to bring it on, Down to ease
// it off; it moves at a fixed gentle rate) and the ship's speed falls in proportion to how far it is on. The medical officer's ghost trace shows the
// speed the casualties can stand at each moment. Keep the ship within the ghost's band the whole way down and arrive at the handoff marker nearly stopped.
import { define, machine, ARROW, rf, txt, box, bar, COL } from './kit.js';

const V0 = 12, DUR = 16, BAND = 1.3, K = 1.5;
const ghost = (t) => V0 * Math.pow(Math.max(0, 1 - t / DUR), 1.3), dghost = (t) => -V0 * 1.3 / DUR * Math.pow(Math.max(0.0001, 1 - t / DUR), 0.3);
export default define({
  job: { billet: 'helm', label: 'Smooth deceleration, minimal jolt', type: 'task:medical_relief' },
  title: 'Ride the ghost trace down', dept: 'flight', host: 'console', tool: 'Retro-brake lever and speed trace',
  how: 'Hold Up to bring the retro-brake lever on, Down to ease it off. Keep the ship\'s speed marker within the band of the ghost trace as it falls to the handoff, arriving nearly stopped.',
  keys: ['hold Up / Down: brake lever'], limit: 28, maxFaults: 3,
  fingerprint: { verb: 'follow ghost', input: 'arrows-hold',
    win: 'ship speed kept within the casualty ghost trace band for the whole sixteen second descent and arrived nearly stopped at the handoff',
    fail: 'riding outside the ghost band for more than a second, three times, or arriving at the marker still moving fast',
    rule: 'Lever position sets how hard the ship brakes; it moves slowly while Up or Down is held. The ghost trace falls steeply at first and flattens near the end: bring the lever on early and ease it back.' },
  rush: 'Held off the brake and threw it to full at the last moment; sickbay reports patients thrown.',
  captions: { 'off trace': 'casualty alarm: deceleration off the trace', fast: 'arrived at the handoff too fast' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, band = m.calm ? BAND * 1.3 : BAND, rate = m.calm ? 0.9 : 0.8, off = rf(r, -0.12, 0.12); m.v = V0 + off; m.L = 0; m.out = 0; m.held = { U: false, D: false }; m.shift = off;
    m.key = (code, down = true) => { if (m.state !== 'play') return false; const a = ARROW(code); if (a === 'U' || a === 'D') { m.held[a] = down; return true; } return !!a; };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.L = Math.max(0, Math.min(1, m.L + ((m.held.U ? 1 : 0) - (m.held.D ? 1 : 0)) * rate * dt)); m.v = Math.max(0, m.v - K * m.L * 1.4 * dt * (V0 / 12));
      if (Math.abs(m.v - ghost(m.t)) > band) { m.out += dt; if (m.out > 1) { m.out = 0; m.fault('off trace'); } } else m.out = 0;
      if (m.state === 'play' && m.t >= DUR) { if (m.v <= 1.6) m.win(); else m.fail('fast'); }
    };
    m.hint = () => { if (m.state !== 'play') return []; const want = Math.max(0, Math.min(1, (-dghost(m.t) + 1.6 * (m.v - ghost(m.t))) / (K * 1.4))); return m.L < want - 0.05 ? [['ArrowDown', false], ['ArrowUp', true]] : m.L > want + 0.05 ? [['ArrowUp', false], ['ArrowDown', true]] : [['ArrowUp', false], ['ArrowDown', false]]; };
    m.bad = () => 'ArrowUp';
    m.view = () => ({ off: +m.shift.toFixed(3), calm: !!m.calm });
    m.buttons = () => [['ArrowUp', '▲ brake on'], ['ArrowDown', '▼ ease off']];
    m.draw = (c, W, H, P) => {
      const X = (t) => 20 + t / DUR * 280, Y = (v) => 130 - v / V0 * 110; c.strokeStyle = COL.dim; c.lineWidth = 1; c.beginPath(); for (let i = 0; i <= 32; i++) { const t = i / 2; c[i ? 'lineTo' : 'moveTo'](X(t), Y(ghost(t))); } c.stroke();
      c.strokeStyle = 'rgba(79,208,106,.35)'; c.beginPath(); for (let i = 0; i <= 32; i++) { const t = i / 2; c[i ? 'lineTo' : 'moveTo'](X(t), Y(ghost(t) + BAND)); } c.stroke(); c.beginPath(); for (let i = 0; i <= 32; i++) { const t = i / 2; c[i ? 'lineTo' : 'moveTo'](X(t), Y(Math.max(0, ghost(t) - BAND))); } c.stroke();
      c.beginPath(); c.arc(X(Math.min(DUR, m.t)), Y(m.v), 5, 0, 6.283); c.fillStyle = Math.abs(m.v - ghost(m.t)) > BAND ? P.bad : COL.gold; c.fill();
      txt(c, 'BRAKE', 330, 22, { size: 9, col: COL.dim }); box(c, 336, 30, 22, 100, COL.panel, COL.dim, 4); c.fillStyle = COL.gold; c.fillRect(338, 130 - m.L * 98, 18, m.L * 98); txt(c, `${m.v.toFixed(1)} m/s`, 200, 158, { size: 11, align: 'center', col: COL.dim });
    };
    return m;
  },
});
