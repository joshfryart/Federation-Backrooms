// Transporter chief: hold the transporter lock on the away team. Three beacon signal bars ride up and down through the mission window. Leave
// the gain alone while a bar wobbles above the marked floor: an extra gain step on a healthy lock overcorrects and can drop the team. Only
// when a bar sinks under the floor, press its number once to step that lock's gain up. A bar left under the floor too long loses the lock.
import { define, machine, DIG, rf, pick, shuffle, txt, bar, lamp, COL } from './kit.js';

const NAMES = ['Cmdr. Hale', 'Lt. Okafor', 'Ens. Varga', 'Dr. Imre', 'PO Sato', 'Lt. Brandt', 'Ens. Diaz'];
export default define({
  job: { billet: 'tchief', label: 'Hold transporter lock on team', type: 'task:survey' },
  title: 'Beacon lock gain discipline', dept: 'operations', host: 'console', tool: 'Lock controls and signal bars',
  how: 'Let the beacon signal bars ride. Only when a bar falls below the marked floor, press its number (1-3) once to step that gain up. Hold all three locks until the mission window closes.',
  keys: ['1-3 gain up one step on that beacon'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'ride the gain', input: 'digits', win: 'all three away team locks kept through the whole mission window with single gain steps only on real dips below the floor',
    fail: 'stepping the gain on a lock still above the floor, or leaving a sunken signal under the floor until the lock drops',
    rule: 'Each beacon bar wobbles; that is normal. If a bar is under the white floor mark, press its number once. Pressing on a bar above the floor overcorrects; a bar under the floor for too long drops.' },
  rush: 'Turned all three gains up to maximum and left them there.',
  captions: { overcorrected: 'gain surge tone', 'lock dropped': 'lock-lost alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, floor = 0.4, late = m.calm ? 2.4 : 1.6;
    m.window = +(m.limit * 0.7).toFixed(1);
    m.bea = shuffle(r, NAMES).slice(0, 3).map(n => ({ n, base: rf(r, 0.58, 0.68), ph: rf(r, 0, 6), fr: rf(r, 1.3, 2.4), next: rf(r, 1.5, 6), fall: 0, under: 0, s: 0.6 }));
    m.dips = m.bea.map(b => { const a = []; let t = b.next; while (t < m.window) { a.push(+t.toFixed(2)); t += rf(r, 4, 8); } return a; });
    const S = (b) => b.base + 0.06 * Math.sin(m.t * b.fr + b.ph);
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code); if (!d || d > 3) return false; if (!down) return true;
      const b = m.bea[d - 1]; if (b.s >= floor) m.fault('overcorrected'); b.base = Math.min(0.95, b.base + 0.22); b.fall = 0; b.under = 0; m.ev('gain', { b: d });
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return;
      m.bea.forEach((b, k) => {
        if (m.dips[k].length && m.t >= m.dips[k][0]) { m.dips[k].shift(); b.fall = rf(r, 0.18, 0.28); }
        if (b.fall) b.base -= b.fall * dt; else if (b.base > 0.66) b.base -= 0.05 * dt;
        b.s = S(b);
        if (b.s < floor) { b.under += dt; if (b.under > late) { m.fault('lock dropped'); b.base = 0.62; b.fall = 0; b.under = 0; } } else b.under = 0;
      });
      if (m.t >= m.window && m.state === 'play') m.win();
    };
    m.hint = () => { const k = m.bea.findIndex(b => b.s < floor); return k >= 0 ? [['Digit' + (k + 1), true]] : []; };
    m.bad = () => { const k = m.bea.findIndex(b => b.s >= floor); return k >= 0 ? 'Digit' + (k + 1) : null; };
    m.view = () => ({ bea: m.bea.map(b => b.n), dips: m.dips });
    m.buttons = () => [['Digit1', '1 gain'], ['Digit2', '2 gain'], ['Digit3', '3 gain']];
    m.draw = (c, W, H, P) => {
      txt(c, `MISSION WINDOW ${Math.max(0, m.window - m.t).toFixed(1)} s`, W - 14, 18, { size: 11, align: 'right', col: COL.dim });
      txt(c, 'BEACON LOCKS', 14, 18, { size: 11, col: COL.dim });
      m.bea.forEach((b, k) => {
        const y = 36 + k * 40, low = b.s < floor;
        txt(c, `${k + 1}  ${b.n}`, 14, y + 12, { size: 12, col: COL.gold });
        bar(c, 130, y, 200, 16, b.s, { mark: floor, col: low ? P.bad : P.good });
        lamp(c, 350, y + 8, 8, low ? P.bad : P.good, low ? 'triangle' : 'circle');
        txt(c, low ? `UNDER ${(late - b.under).toFixed(1)}s` : 'riding', 364, y + 12, { size: 10, col: low ? COL.warn : COL.dim });
      });
    };
    return m;
  },
});
