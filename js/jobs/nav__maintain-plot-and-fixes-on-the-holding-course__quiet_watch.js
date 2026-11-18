// Navigator: maintain the plot on the holding course. The dead-reckoning mark sits on the holding line while the real ship drifts off it
// unseen. Every watch interval take a bearing fix on a star the sensor can see (1 – 3): the mark jumps to the real position and the
// correction goes to the helm. A star below the sensor horizon gives no bearing; fixing before the interval wastes it; letting the
// interval lapse lets the drift build unchecked.
import { define, machine, DIG, rf, ri, shuffle, txt, box, bar, lamp, COL } from './kit.js';

const STARS = ['Vega', 'Deneb', 'Altair', 'Rigel', 'Canopus', 'Arcturus', 'Spica', 'Capella', 'Sirius'];
export default define({
  job: { billet: 'nav', label: 'Maintain plot and fixes on the holding course', type: 'task:quiet_watch' },
  title: 'Holding-course interval fixes', dept: 'flight', host: 'console', tool: 'Holding course chart and star sensor',
  how: 'When the interval clock reaches the fix band, take a bearing (1 – 3) on a star marked UP. Too early wastes it; too late lets the drift build.',
  keys: ['1 – 3 bearing on a star'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'interval fix', input: 'digits', win: 'five fixes taken inside the interval band, each on a star above the sensor horizon, so the dead-reckoning mark never runs unchecked',
    fail: 'letting the interval lapse so drift builds, fixing too early, or calling a star that is below the horizon',
    rule: 'The interval clock fills after each fix. Inside its green band press the number of any star showing UP; before the band is a wasted fix, past it the drift has run unchecked.' },
  rush: 'Left the dead-reckoning mark running and logged the hour as on the line.',
  captions: { 'no bearing': 'sensor null tone', early: 'chart chime', unchecked: 'drift alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, lo = 2.6, hi = m.calm ? 8 : 6, P = 6, V = 2.6, ph = shuffle(r, [0, 2, 4]).map(p => p + rf(r, -0.2, 0.2));
    m.stars = shuffle(r, STARS).slice(0, 3).map((name, i) => ({ name, ph: ph[i] + rf(r, 0, 0.3) }));
    m.rate = rf(r, 0.5, 1.2) * (r() < 0.5 ? -1 : 1); m.drift = 0; m.since = 0; m.fixes = []; m.rounds = 5; m.round = 0;
    const up = (i) => ((m.t + m.stars[i].ph) % P) < V;
    const fix = () => { m.fixes.push(+m.drift.toFixed(2)); if (m.fixes.length > 6) m.fixes.shift(); m.drift = 0; m.since = 0; m.rate = rf(r, 0.5, 1.2) * (r() < 0.5 ? -1 : 1); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code); if (d < 1 || d > 3) return false;
      if (!up(d - 1)) { m.fault('no bearing'); return true; }
      if (m.since < lo) { m.fault('early'); return true; }
      fix(); m.round++; if (m.round >= 5) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.since += dt; m.drift += m.rate * dt * 4; if (m.since > hi) { m.fault('unchecked'); fix(); } };
    m.hint = () => { if (m.since < lo + 0.15) return []; const i = [0, 1, 2].find(up); return i != null ? [['Digit' + (i + 1), true]] : []; };
    m.bad = () => { const i = [0, 1, 2].find(k => !up(k)); return i != null ? 'Digit' + (i + 1) : 'Digit1'; };
    m.view = () => ({ s: m.stars.map(s => [s.name, +s.ph.toFixed(2)]), rate: +m.rate.toFixed(2) });
    m.buttons = () => m.stars.map((s, i) => ['Digit' + (i + 1), `${i + 1} ${s.name}`]);
    m.draw = (c, W, H, P2) => {
      const ly = 80; box(c, 12, 12, 220, 146, 'rgba(125,151,232,.07)', COL.peri, 4);
      c.strokeStyle = COL.peri; c.lineWidth = 1; c.beginPath(); c.moveTo(16, ly); c.lineTo(228, ly); c.stroke(); txt(c, 'HOLDING LINE', 18, ly - 6, { size: 9, col: COL.dim });
      m.fixes.forEach((d, k) => lamp(c, 40 + k * 30, ly + Math.max(-60, Math.min(60, d * 6)), 4, COL.lav, 'diamond'));
      lamp(c, 40 + m.fixes.length * 30, ly, 7, COL.gold, 'triangle'); txt(c, 'DR', 50 + m.fixes.length * 30, ly + 16, { size: 9, col: COL.gold });
      txt(c, 'INTERVAL', 246, 24, { size: 11, col: COL.peri });
      bar(c, 246, 32, 140, 10, m.since / (hi + 1), { band: [lo / (hi + 1), hi / (hi + 1)], col: m.since > hi - 1 ? COL.warn : COL.gold });
      m.stars.forEach((s, i) => { const u = up(i); lamp(c, 254, 70 + i * 26, 8, u ? P2.good : COL.dim, u ? 'triangle' : 'square'); txt(c, `${i + 1} ${s.name}  ${u ? 'UP' : 'down'}`, 268, 74 + i * 26, { size: 11, col: u ? COL.ink : COL.dim }); });
      txt(c, `fixes ${m.round} / 5`, 246, 156, { size: 11, col: COL.pale });
    };
    return m;
  },
});
