// Pilot: smooth recovery with medics aboard. The altitude tape carries a printed descent limit that shrinks as the ground comes up. Ease the
// throttle back notch by notch (digits 1-5, 5 is the fastest descent) so the descent rate always sits under the limit for your height, but
// not so slow that the patients wait. Touch down on notch 1 or 2 for a soft settle. Then the medics check the beds: only open the hatch
// (Enter) once they call BEDS SECURE. A rate over the limit, a hard touchdown or an early hatch are faults.
import { define, machine, ri, rf, txt, box, bar, lamp, COL, DIG, ENTER } from './kit.js';

const RATE = [0, 0.6, 1.1, 2.2, 3.6, 5.2];

export default define({
  job: { billet: 'pilot', label: 'Smooth recovery with medics aboard', type: 'task:medical_relief' },
  title: 'Notch down under the descent limit', dept: 'flight', host: 'console', tool: 'Altitude tape and throttle',
  how: 'Pick a throttle notch with 1-5 (5 descends fastest). Keep the descent rate under the limit printed on the tape for your height, step down as you get lower, land on notch 1 or 2. Press Enter to open the hatch only after BEDS SECURE.',
  keys: ['1-5 throttle notch', 'Enter open hatch'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'ease the notches', input: 'digits+enter',
    win: 'descent kept under the shrinking printed limit all the way to a soft touchdown, hatch opened only after the medics call beds secure',
    fail: 'a notch that descends faster than the limit for the height, a hard touchdown, or opening the hatch before the beds are secured',
    rule: 'Number keys choose the descent notch; the limit on the tape falls as you descend, so step down to slower notches in time and press Enter only after BEDS SECURE shows.' },
  rush: 'Dropped the last few metres and opened the hatch straight away.',
  captions: { 'over limit': 'sink-rate warning', 'hard touchdown': 'gear thumps, patient groans', 'hatch early': 'medic: wait!' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, K = m.calm ? 0.14 : 0.12, SOFT = 1.2;
    m.alt0 = ri(r, 34, 44); m.alt = m.alt0; m.n = ri(r, 4, 5); m.landed = false; m.secureAt = +rf(r, 1, 2.2).toFixed(2); m.lt = 0; m.over = 0; m.flash = 0; m.msg = '';
    const lim = (a) => 0.8 + K * Math.max(0, a);
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code), e = ENTER(code); if (!(d >= 1 && d <= 5) && !e) return false; if (!down) return true;
      if (d && !m.landed) m.n = d;
      if (e) { if (!m.landed || m.lt < m.secureAt) { m.fault('hatch early'); m.flash = 0.7; m.msg = 'MEDICS: WAIT'; } else { m.ev('hatch'); m.win(); } }
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.flash = Math.max(0, m.flash - dt);
      if (m.landed) { m.lt += dt; return; }
      const v = RATE[m.n]; m.alt -= v * dt;
      if (v > lim(m.alt)) { m.over += dt; if (m.over > 0.25) { m.fault('over limit'); m.over = -1.2; m.flash = 0.7; m.msg = 'SINK RATE'; if (m.state !== 'play') return; } } else m.over = m.over > 0 ? 0 : Math.min(0, m.over + dt);
      if (m.alt <= 0) { if (v > SOFT) { m.fault('hard touchdown'); m.alt = 4; m.flash = 0.7; m.msg = 'HARD LANDING'; } else { m.alt = 0; m.landed = true; m.ev('touchdown', { v }); } }
    };
    m.hint = () => { if (m.landed) return m.lt >= m.secureAt + 0.1 ? [['Enter', true], ['Enter', false]] : [];
      let best = 1; for (let k = 5; k >= 1; k--) if (RATE[k] <= lim(m.alt - RATE[k] * 0.6) - 0.15 && (m.alt > 2 || RATE[k] <= SOFT)) { best = k; break; }
      if (m.alt < 3) best = Math.min(best, 2); return best !== m.n ? [['Digit' + best, true], ['Digit' + best, false]] : []; };
    m.bad = () => 'Digit5';
    m.view = () => ({ alt0: m.alt0, n0: m.n, secure: m.secureAt });
    m.buttons = () => [1, 2, 3, 4, 5].map(k => ['Digit' + k, `Notch ${k}`]).concat([['Enter', 'Open hatch']]);
    m.draw = (c, W, H, P) => {
      txt(c, 'ALTITUDE TAPE', 12, 18, { size: 11, col: COL.peri }); box(c, 12, 26, 60, 130, 'rgba(255,255,255,.05)', null, 4);
      for (let a = 0; a <= 50; a += 10) { const y = 150 - a * 2.4; txt(c, `${a}`, 20, y + 4, { size: 9, col: COL.dim }); txt(c, `≤${lim(a).toFixed(1)}`, 40, y + 4, { size: 9, col: COL.lav }); }
      const y = 150 - Math.max(0, m.alt) * 2.4; c.fillStyle = COL.gold; c.fillRect(12, y - 1, 60, 3);
      const v = m.landed ? 0 : RATE[m.n], L = lim(m.alt);
      txt(c, `Height ${Math.max(0, m.alt).toFixed(1)} m`, 90, 40, { size: 12 }); txt(c, `Descent ${v.toFixed(1)} m/s   limit ${L.toFixed(1)}`, 90, 62, { size: 12, col: v > L ? P.bad : COL.ink });
      bar(c, 90, 70, 200, 10, v / 6, { band: [0, L / 6] }); txt(c, v > L ? '▲ OVER LIMIT' : 'under limit', 296, 80, { size: 10, col: v > L ? P.bad : P.good });
      for (let k = 1; k <= 5; k++) box(c, 90 + (k - 1) * 40, 92, 34, 24, k === m.n ? 'rgba(244,194,91,.3)' : 'rgba(255,255,255,.06)', k === m.n ? COL.gold : null, 4), txt(c, k, 107 + (k - 1) * 40, 109, { size: 12, align: 'center' });
      const sec = m.landed && m.lt >= m.secureAt; lamp(c, 310, 136, 10, sec ? P.good : '#2a2838', sec ? 'circle' : 'square');
      txt(c, !m.landed ? 'hatch shut' : sec ? 'BEDS SECURE' : 'medics checking beds…', 326, 140, { size: 10, col: sec ? COL.ink : COL.dim });
      if (m.flash > 0) txt(c, m.msg, 90, 140, { size: 12, col: P.bad });
    };
    return m;
  },
});
