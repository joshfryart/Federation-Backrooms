// Assistant Chief Engineer: full systems stress test. Step the ramp up through three marked levels (Space). After each step the four subsystem
// needles climb to the level; a lagging subsystem stalls short. Flag the laggard (1-4) before stepping on, or its fault surfaces later and costs
// more. Stepping before the needles settle, flagging a subsystem that kept up, or stepping past an unflagged laggard are faults.
import { define, machine, DIG, SPACE, ri, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'ace', label: 'Full systems stress test', type: 'task:shakedown' },
  title: 'Flag the lagger on the ramp', dept: 'engineering', host: 'console', tool: 'Stress-ramp bench console',
  how: 'Space steps the ramp. When the needles settle, a laggard stalls short of the others: flag it (1-4) before stepping on. No laggard: just step.',
  keys: ['Space step the ramp', '1-4 flag a subsystem'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'flag the lagger', input: 'digits+space',
    win: 'ramp stepped through all three levels with every laggard flagged once settled and nothing flagged that kept up',
    fail: 'stepping the ramp before the needles settle, flagging a subsystem that kept pace, or stepping past a lagging one',
    rule: 'After each Space step the four needles climb. Once they stop, a laggard sits short of the level: press its number. Then step again.' },
  rush: 'Ran the ramp to peak without reading the gauges at each stop.',
  captions: { 'stepped early': 'ramp advanced early', 'false flag': 'flag struck from log', 'missed peak': 'subsystem fault surfaces' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, set = m.calm ? 1.9 : 1.4, names = ['Impulse', 'EPS grid', 'Dampers', 'Life sup'], lv = [0.3, 0.65, 1];
    m.lag = [ri(r, 0, 3), -1, ri(r, 0, 3)]; if (r() < 0.5) m.lag = [-1, ri(r, 0, 3), ri(r, 0, 3)]; m.L = 0; m.since = 9; m.flag = -1; m.v = [0, 0, 0, 0];
    m.cur = () => m.lag[m.L - 1] ?? -1; m.tgt = (i) => (m.L ? lv[m.L - 1] * (i === m.cur() ? 0.7 : 1) : 0);
    m.key = (code, down = true) => { if (m.state !== 'play' || !down) return false;
      if (SPACE(code)) { if (m.since < set) { m.fault('stepped early'); return true; } if (m.L && m.cur() >= 0 && m.flag !== m.cur()) { m.fault('missed peak'); return true; } if (m.L >= 3) m.win(); else { m.L++; m.since = 0; m.flag = -1; } return true; }
      const d = DIG(code); if (d >= 1 && d <= 4) { if (m.since < set) m.fault('stepped early'); else if (d - 1 !== m.cur()) m.fault('false flag'); else m.flag = d - 1; return true; } return false; };
    m.tick = (dt) => { if (!m.live(dt)) return; m.since += dt; for (let i = 0; i < 4; i++) m.v[i] += (m.tgt(i) - m.v[i]) * Math.min(1, dt * 3.2); };
    m.hint = () => { if (m.since < set + 0.1) return []; return m.L && m.cur() >= 0 && m.flag !== m.cur() ? [['Digit' + (m.cur() + 1), true]] : [['Space', true]]; };
    m.bad = () => 'Space';
    m.view = () => ({ lag: m.lag });
    m.buttons = () => [['Space', 'Step ramp'], ['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4']];
    m.draw = (c) => { txt(c, `RAMP LEVEL ${m.L} / 3`, 14, 20, { size: 13, col: COL.gold }); names.forEach((n, i) => { const y = 34 + i * 28; txt(c, `${i + 1} ${n}`, 14, y + 12, { size: 11 }); bar(c, 100, y, 230, 14, m.v[i], { mark: m.L ? lv[m.L - 1] : null, col: m.flag === i ? COL.warn : COL.peri }); if (m.flag === i) txt(c, 'FLAGGED', 338, y + 12, { size: 10, col: COL.warn }); });
      txt(c, m.since < set ? 'needles climbing' : 'settled', 14, 160, { size: 11, col: m.since < set ? COL.warn : COL.pale }); };
    return m;
  },
});
