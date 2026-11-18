// Quartermaster: meals and water for the evacuees. Read each evacuee's diet tag and pick the one meal that suits every line of it; probe the
// portion (hold Space until the reading settles), send a cold one back to reheat (↑), and lid it (Enter) only when it reads 74 °C or more.
import { define, machine, DIG, ARROW, SPACE, ENTER, ri, rf, shuffle, txt, box, COL } from './kit.js';

const MEALS = [['Lentil stew', ['vegan', 'soft', 'halal']], ['Fish broth', ['soft', 'halal']], ['Chicken rice', ['halal']], ['Cheese pasta', ['vegetarian', 'soft']], ['Bean wrap', ['vegan', 'vegetarian', 'halal']],
  ['Pork dumplings', []], ['Oat porridge', ['vegetarian', 'soft', 'halal']], ['Egg noodles', ['vegetarian']], ['Tofu curry', ['vegan', 'vegetarian', 'halal', 'soft']], ['Beef hash', ['halal']]];
const NEEDS = ['vegan', 'vegetarian', 'soft', 'halal'];
export default define({
  job: { billet: 'qm', label: 'Prepare extra meals and water for evacuees', type: 'task:medical_relief' },
  title: 'Diet tag to tray', dept: 'services', host: 'console', tool: 'Ration line and food probe',
  how: 'For each evacuee pick the meal (1 – 4) that fits every line of their diet tag, probe it (hold Space), send it back if it is under 74 °C (↑), then lid it (Enter).',
  keys: ['1 – 4 pick', 'Space hold: probe', '↑ reheat', 'Enter lid'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'match and probe', input: 'digits+space-hold+arrows+enter', win: 'five evacuees each given the meal that fits their whole diet tag, probed hot and lidded',
    fail: 'giving a meal that breaks a diet line, lidding without a settled probe reading, or lidding a portion under 74 °C',
    rule: 'Only one of the four meals fits every line of the tag. Hold Space until the probe reading stops climbing. 74 °C or more: Enter lids it; under 74: ↑ sends it back to reheat, then probe again.' },
  rush: 'Handed out whatever was hottest on the counter.',
  captions: { 'wrong diet': 'evacuee shakes their head', 'served cold': 'evacuee complains', 'did not probe': 'supervisor tuts' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, probeT = m.calm ? 1.0 : 0.8;
    m.ev5 = []; for (let k = 0, tries = 0; k < 5 && tries < 200; tries++) {
      const need = shuffle(r, NEEDS).slice(0, ri(r, 1, 2)), fits = MEALS.filter(([, tags]) => need.every(n => tags.includes(n))), not = MEALS.filter(([, tags]) => !need.every(n => tags.includes(n)));
      if (!fits.length || not.length < 3) continue; const right = fits[ri(r, 0, fits.length - 1)], opts4 = shuffle(r, [right, ...shuffle(r, not).slice(0, 3)]);
      m.ev5.push({ need, opts: opts4.map(o => o[0]), ans: opts4.indexOf(right), temp: r() < 0.4 ? ri(r, 58, 70) : ri(r, 75, 88), pick: -1, read: 0, reading: 20 }); k++;
    }
    m.k = 0; m.rounds = 5; m.round = 0; m.heat = 0;
    const E = () => m.ev5[m.k];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const e = E(), d = DIG(code);
      if (SPACE(code)) { m.held.S = down && e.pick >= 0 && !m.heat; return true; }
      if (!down) return !!(d || ARROW(code) || ENTER(code));
      if (d >= 1 && d <= 4) { if (e.pick >= 0) return true; if (d - 1 !== e.ans) { m.fault('wrong diet'); return true; } e.pick = d - 1; return true; }
      if (ARROW(code) === 'U') { if (e.pick >= 0 && !m.heat) { m.heat = 1.0; e.read = 0; e.reading = 20; m.held.S = false; } return true; }
      if (ENTER(code)) { if (e.pick < 0) return true; if (e.read < probeT) { m.fault('did not probe'); return true; } if (e.temp < 74) { m.fault('served cold'); return true; } m.k++; m.round++; if (m.k >= m.ev5.length) m.win(); return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const e = E(); if (!e) return;
      if (m.heat) { m.heat = Math.max(0, m.heat - dt); if (!m.heat) e.temp = ri(r, 76, 86); }
      if (m.held.S) { e.read += dt; e.reading += (e.temp - e.reading) * Math.min(1, dt * 5); } else if (e.read < probeT) { e.read = 0; e.reading = 20; }
    };
    m.hint = () => {
      const e = E(); if (!e) return []; if (e.pick < 0) return [['Digit' + (e.ans + 1), true]]; if (m.heat) return [];
      if (e.read < probeT + 0.1) return [['Space', true]]; if (e.temp < 74) return [['Space', false], ['ArrowUp', true]]; return [['Space', false], ['Enter', true]];
    };
    m.bad = () => { const e = E(); return e.pick < 0 ? 'Digit' + (((e.ans + 1) % 4) + 1) : 'Enter'; };
    m.view = () => ({ ev: m.ev5.map(e => [e.need.join('+'), e.opts[e.ans], e.temp]) });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['Space', 'Probe (hold)'], ['ArrowUp', '▲ Reheat'], ['Enter', 'Lid']];
    m.draw = (c, W, H, P) => {
      const e = E() || m.ev5.at(-1); txt(c, `EVACUEE ${Math.min(m.k + 1, 5)} / 5  ·  tag: ${e.need.join(', ')}`, 14, 20, { size: 12, col: COL.gold });
      e.opts.forEach((o, i) => { box(c, 14, 30 + i * 26, 220, 22, i === e.pick ? 'rgba(79,208,106,.25)' : 'rgba(255,255,255,.05)', i === e.pick ? P.good : null, 10); txt(c, `${i + 1}  ${o}`, 24, 45 + i * 26, { size: 11 }); });
      const shown = e.read > 0 ? Math.round(e.reading) : null; txt(c, 'PROBE', 260, 46, { size: 10, col: COL.dim }); txt(c, m.heat ? 'reheating…' : shown == null ? '— °C' : `${shown} °C`, 260, 76, { size: 22, col: shown != null && e.read >= probeT ? (e.temp >= 74 ? P.good : COL.warn) : COL.ink });
      txt(c, e.read >= probeT ? 'settled' : e.read > 0 ? 'climbing…' : '', 260, 96, { size: 10, col: COL.dim }); txt(c, 'lid at 74 °C or more', 260, 120, { size: 10, col: COL.pale });
    };
    return m;
  },
});
