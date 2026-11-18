// Helm: smooth deceleration, minimal jolt, with casualties aboard. The retro-brake lever has notches 0 to 9 (digit keys). Every notch moved
// kicks the casualty jolt meter, and moving several at once kicks it over the printed line. So start early and walk the brake down one
// notch at a time, letting the meter settle in between, until the ship coasts onto the handoff marker slow enough to stop in the green.
import { define, machine, DIG, rf, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'helm', label: 'Smooth deceleration, minimal jolt', type: 'task:medical_relief' },
  title: 'Notch-by-notch retro-brake', dept: 'flight', host: 'console', tool: 'Retro-brake lever notches and casualty jolt meter',
  how: 'Press 0 to 9 to set the retro-brake notch. Move one notch at a time, early, so the jolt meter stays under its line, and reach the marker slow enough to stop in the green.',
  keys: ['1 to 9 brake notch', '0 brake off'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'notch down', input: 'digits', win: 'the ship eased onto the handoff marker inside the green with the jolt meter never crossing the casualty line',
    fail: 'jumping several brake notches at once so the jolt spikes, braking late and overrunning the marker, or stopping short of it',
    rule: 'A digit sets the brake notch; braking force follows the notch. Each notch of change adds to the jolt meter, which drains in about half a second per notch. Arrive at the marker under the green speed limit.' },
  rush: 'Held off the brake and threw it to full at the last moment; sickbay reports patients thrown.',
  captions: { 'casualty thrown': 'sickbay: we have a patient on the deck', 'overran marker': 'handoff marker passes underneath', 'stopped short': 'ship hangs short of the marker' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, G = m.calm ? 0.07 : 0.06;
    m.D0 = rf(r, 1.7, 2.2); m.V0 = rf(r, 0.36, 0.44); m.lineJ = m.calm ? 1.1 : 1;
    const load = () => { m.d = m.D0; m.v = m.V0; m.notch = 0; m.j = 0; }; load(); m.last = -9;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = code === 'Digit0' || code === 'Numpad0' ? 0 : DIG(code); if (!d && !/^(Digit|Numpad)0$/.test(code || '')) return false;
      if (!down) return true; m.j += Math.abs(d - m.notch) * 0.3; m.notch = d; m.last = m.t; if (m.j > m.lineJ) { m.fault('casualty thrown'); m.j = 0.5; } return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.j = Math.max(0, m.j - 0.6 * dt); m.v = Math.max(0, m.v - m.notch * 0.012 * dt); m.d -= m.v * dt;
      if (m.d <= 0) { if (m.v > G) { m.fault('overran marker'); load(); } else m.win(); return; }
      if (m.v <= 0.004) { m.fault('stopped short'); load(); }
    };
    m.hint = () => {
      if (m.t - m.last < 0.4 || m.j + 0.3 > m.lineJ * 0.8) return []; const req = (m.v * m.v - 0.035 * 0.035) / (2 * Math.max(0.03, m.d));
      const want = m.v < 0.045 ? 0 : Math.max(0, Math.min(9, Math.round(req / 0.012))); if (want === m.notch) return [];
      return [['Digit' + (m.notch + Math.sign(want - m.notch)), true]];
    };
    m.bad = () => (m.notch < 5 ? 'Digit9' : 'Digit1');
    m.view = () => ({ d: +m.D0.toFixed(3), v: +m.V0.toFixed(3) });
    m.buttons = () => Array.from({ length: 10 }, (_, i) => ['Digit' + i, String(i)]);
    m.draw = (c, W, H, P) => {
      const x0 = 20, x1 = 250, px = x1 - Math.max(0, m.d) / m.D0 * (x1 - x0);
      c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(x0, 30, x1 - x0 + 12, 22); c.fillStyle = P.good; c.fillRect(x1, 24, 4, 34); txt(c, 'HANDOFF', x1 - 20, 18, { size: 10, col: P.good });
      c.fillStyle = COL.gold; c.beginPath(); c.moveTo(px + 10, 41); c.lineTo(px - 6, 33); c.lineTo(px - 6, 49); c.closePath(); c.fill();
      txt(c, `speed ${(m.v * 10).toFixed(2)}  ·  green under ${(G * 10).toFixed(2)}`, x0, 78, { size: 12, col: m.v <= G ? P.good : COL.ink });
      txt(c, 'RETRO-BRAKE', x0, 104, { size: 10, col: COL.dim });
      for (let i = 0; i <= 9; i++) box(c, x0 + i * 23, 110, 19, 22, i === m.notch ? COL.gold : 'rgba(255,255,255,.07)', null, 3), txt(c, String(i), x0 + i * 23 + 9, 126, { size: 11, align: 'center', col: i === m.notch ? COL.dark : COL.dim });
      box(c, 290, 14, 96, 140, COL.panel, null, 6); txt(c, 'JOLT', 300, 32, { size: 10, col: COL.dim });
      const hj = 100, jy = 44; c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(326, jy, 22, hj); c.fillStyle = m.j > m.lineJ * 0.75 ? COL.warn : COL.lav;
      const fh = Math.min(1, m.j / (m.lineJ * 1.4)) * hj; c.fillRect(328, jy + hj - fh, 18, fh); c.fillStyle = P.bad; c.fillRect(318, jy + hj - hj / 1.4 - 1, 38, 3);
      txt(c, 'line', 358, jy + hj - hj / 1.4 + 4, { size: 9, col: P.bad });
    };
    return m;
  },
});
