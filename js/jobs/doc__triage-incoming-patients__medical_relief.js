// Doc: triage incoming patients. Three casualties come in together and each one's oxygen saturation is sliding at its own rate. There is one
// bag-valve mask: hold a patient's number (1-3) to bag them (their oxygen climbs while you hold it, and only one can be bagged at once).
// Keep every patient above the red line until the transport crew arrives. A patient who is quiet is not a patient who is stable: read the figures.
import { define, machine, DIG, rf, txt, box, bar, COL } from './kit.js';

const RED = 88, DUR = 18;
export default define({
  job: { billet: 'doc', label: 'Triage incoming patients', type: 'task:medical_relief' },
  title: 'One mask, three falling sats', dept: 'medical', host: 'console', tool: 'Bag-valve mask and sat monitors',
  how: 'Three patients\' oxygen is falling. Hold 1, 2 or 3 to bag that patient (it rises while held, one at a time). Keep all above the red line until transport arrives.',
  keys: ['hold 1-3: bag that patient'], limit: 28, maxFaults: 3,
  fingerprint: { verb: 'bag the lowest', input: 'digits',
    win: 'three patients held above the red oxygen line for eighteen seconds by sharing one mask between them',
    fail: 'letting a patient\'s oxygen drop under the red line, three times, because the mask was on someone else',
    rule: 'Each patient\'s sat falls at its own rate. Holding a number bags that patient and lifts their sat; only one mask. Whoever is closest to the red line needs it next.' },
  rush: 'Tagged them by who was shouting loudest and left the quiet ones to wait.',
  captions: { desat: 'sat alarm: patient under the red line' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, k = m.calm ? 0.75 : 1; m.bag = -1;
    m.p = [0, 1, 2].map(() => ({ s: rf(r, 94, 98), d: rf(r, 0.55, 1.15) * k, low: false }));
    m.key = (code, down = true) => { if (m.state !== 'play') return false; const d = DIG(code); if (d < 1 || d > 3) return false; if (down) m.bag = d - 1; else if (m.bag === d - 1) m.bag = -1; return true; };
    m.tick = (dt) => {
      if (!m.live(dt)) return;
      m.p.forEach((p, i) => { p.s = Math.min(100, p.s + (i === m.bag ? 4 : -p.d) * dt); if (p.s < RED && !p.low) { p.low = true; m.fault('desat'); } else if (p.s >= RED + 2) p.low = false; });
      if (m.state === 'play' && m.t >= DUR) m.win();
    };
    m.hint = () => { if (m.state !== 'play') return []; let w = 0; m.p.forEach((p, i) => { if (p.s < m.p[w].s) w = i; }); return m.bag === w ? [] : [['Digit' + (w + 1), true]]; };
    m.bad = () => null;
    m.view = () => ({ p: m.p.map(p => [+p.s.toFixed(1), +p.d.toFixed(2)]) });
    m.buttons = () => [['Digit1', 'Bag 1'], ['Digit2', 'Bag 2'], ['Digit3', 'Bag 3']];
    m.draw = (c, W, H, P) => {
      m.p.forEach((p, i) => { const y = 14 + i * 46, on = m.bag === i; box(c, 10, y, 380, 40, COL.panel, on ? COL.gold : null);
        txt(c, `${i + 1}  SpO2 ${p.s.toFixed(0)}`, 18, y + 16, { size: 13, col: p.s < RED ? P.bad : COL.ink }); txt(c, on ? 'BAGGING' : p.s < RED + 3 ? 'LOW' : '', 18, y + 33, { size: 10, col: COL.gold });
        bar(c, 130, y + 14, 240, 14, (p.s - 70) / 30, { band: [(RED - 70) / 30, 1], mark: (RED - 70) / 30, col: p.s < RED ? P.bad : COL.peri }); });
      txt(c, `transport in ${Math.max(0, DUR - m.t).toFixed(0)} s`, 296, 160, { size: 10, col: COL.dim });
    };
    return m;
  },
});
