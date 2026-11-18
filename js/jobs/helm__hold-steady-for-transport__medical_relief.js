// Helm: hold steady for transport. The transporter chief calls stand-by, then energises. While the beam is energising, any thruster pulse
// breaks the lock, so all the steering happens in the stand-by gap: tap the attitude pad (arrows) to set the beacon UPSTREAM of the centre,
// so the current carries it across the locking ring during the beam instead of out of it. Three transports complete wins.
import { define, machine, ARROW, rf, txt, box, bar, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'helm', label: 'Hold steady for transport', type: 'task:medical_relief' },
  title: 'Pre-set the beacon, hands off for the beam', dept: 'flight', host: 'console', tool: 'Attitude thruster pad and lock lamp',
  how: 'During STAND BY, tap the arrows to set the beacon upstream of the ring centre. When the chief energises, take your hands off: any pulse breaks the lock, and the current must not carry the beacon out.',
  keys: ['← ↑ → ↓ one thruster pulse'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'pre-set, hands off', input: 'arrows', win: 'three transports completed with the beacon carried through the locking ring and no pulse fired during the beam',
    fail: 'firing a thruster while the beam is energising, or letting the current carry the beacon out of the ring mid-transport',
    rule: 'Each arrow tap nudges the beacon one pulse. Pulses are allowed only during STAND BY. During ENERGISE the beacon drifts with the current and must stay inside the ring until the chief calls complete.' },
  rush: 'Kept jabbing the thruster pad through the beam and made the chief restart twice.',
  captions: { 'lock broken': 'transporter whine dies', 'no lock': 'chief: no lock, stand by' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, ang = rf(r, 0, 6.283), sp = (m.calm ? 0.055 : 0.07), R = 0.22, P1 = 0.05;
    m.dx = Math.cos(ang) * sp; m.dy = Math.sin(ang) * sp; m.bx = rf(r, -0.15, 0.15); m.by = rf(r, -0.15, 0.15);
    m.beam = [rf(r, 2.6, 3.2), rf(r, 2.6, 3.2), rf(r, 2.6, 3.2)]; m.sb = m.calm ? 4.2 : 3.4;
    m.phase = 'standby'; m.pt = 0; m.done = 0; m.rounds = 3; m.round = 0; m.lastTap = -9;
    const inRing = () => Math.hypot(m.bx, m.by) <= R;
    m.key = (code, down = true) => {
      const a = ARROW(code); if (m.state !== 'play' || !a) return false; if (!down) return true;
      if (m.phase === 'beam') { m.fault('lock broken'); m.phase = 'standby'; m.pt = 0; return true; }
      m.bx += a === 'L' ? -P1 : a === 'R' ? P1 : 0; m.by += a === 'U' ? -P1 : a === 'D' ? P1 : 0; m.lastTap = m.t; return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.pt += dt; m.bx += m.dx * dt; m.by += m.dy * dt;
      if (m.phase === 'standby' && m.pt >= m.sb) { m.pt = 0; if (inRing()) m.phase = 'beam'; else m.fault('no lock'); }
      else if (m.phase === 'beam') {
        if (!inRing()) { m.fault('lock broken'); m.phase = 'standby'; m.pt = 0; }
        else if (m.pt >= m.beam[m.done]) { m.done++; m.round = m.done; m.phase = 'standby'; m.pt = 0; if (m.done >= 3) m.win(); }
      }
    };
    m.hint = () => {
      if (m.phase !== 'standby' || m.t - m.lastTap < 0.12) return [];
      const tx = -m.dx / sp * 0.12 - m.bx, ty = -m.dy / sp * 0.12 - m.by;
      if (Math.max(Math.abs(tx), Math.abs(ty)) < P1 * 0.6) return [];
      return [[Math.abs(tx) > Math.abs(ty) ? (tx > 0 ? 'ArrowRight' : 'ArrowLeft') : (ty > 0 ? 'ArrowDown' : 'ArrowUp'), true]];
    };
    m.bad = () => (m.phase === 'beam' ? 'ArrowUp' : null);
    m.view = () => ({ d: [+m.dx.toFixed(3), +m.dy.toFixed(3)], beam: m.beam.map(b => +b.toFixed(2)) });
    m.buttons = () => [['ArrowLeft', '◀'], ['ArrowUp', '▲'], ['ArrowDown', '▼'], ['ArrowRight', '▶']];
    m.draw = (c, W, H, P) => {
      const cx = 95, cy = 85, S = 300; c.strokeStyle = P.good; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R * S, 0, 6.283); c.stroke();
      c.strokeStyle = COL.lav; c.beginPath(); c.moveTo(cx - m.dx * 400, cy - m.dy * 400); c.lineTo(cx + m.dx * 400, cy + m.dy * 400); c.stroke();
      lamp(c, cx + m.dx * 400, cy + m.dy * 400, 4, COL.lav, 'triangle');
      c.fillStyle = COL.gold; c.beginPath(); c.arc(cx + m.bx * S, cy + m.by * S, 6, 0, 6.283); c.fill();
      const beam = m.phase === 'beam'; box(c, 210, 14, 176, 48, COL.panel, null, 6);
      lamp(c, 228, 38, 9, beam ? P.good : COL.dim, beam ? 'circle' : 'square');
      txt(c, beam ? 'ENERGISE · hands off' : 'STAND BY · set beacon', 244, 43, { size: 12, col: beam ? P.good : COL.pale });
      bar(c, 210, 74, 176, 8, m.pt / (beam ? m.beam[m.done] || 3 : m.sb), { col: beam ? P.good : COL.peri });
      txt(c, `transports complete ${m.done} / 3`, 210, 104, { size: 12, col: COL.ink });
      txt(c, 'current ⟶ shown by the lilac line', 210, 124, { size: 10, col: COL.dim });
    };
    return m;
  },
});
