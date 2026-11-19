// Lab technician, shakedown: test lab instruments under load. The load test runs every instrument flat out for a set time. Their throughput
// dials sag, so keep nudging them back to the top (↑); if the stack's average throughput falls under the test floor the run stalls. Meanwhile
// each instrument's temperature needle sits steady, except a weak one that creeps up into the red: pull that instrument off load at once
// (its number). Pulling a healthy instrument wastes the test; leaving one in the red burns it out with a sample inside.
import { define, machine, ARROW, DIG, ri, rf, shuffle, txt, bar, lamp, COL } from './kit.js';

const NAMES = ['Centrifuge', 'Spectrometer', 'Sequencer', 'Incubator', 'Chromatograph', 'Microscope'];
export default define({
  job: { billet: 'lab', label: 'Test lab instruments under load', type: 'task:shakedown' },
  title: 'Hold the load, pull the hot one', dept: 'sciences', host: 'console', tool: 'Instrument stack load test',
  how: 'Keep the throughput dials up (↑) so the average stays over the test floor, and pull an instrument off load (1-4) the moment its temperature needle enters the red. Run the test to the end.',
  keys: ['↑ top up the throughput dials', '1-4 pull an instrument off load'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'load and pull', input: 'arrows+digits', win: 'the load test run to its end with throughput held over the floor and each overheating instrument pulled as its needle reaches red',
    fail: 'letting throughput sag under the floor, pulling a healthy instrument, or leaving one cooking in the red',
    rule: 'Throughput dials drift down; ↑ tops them all up. Temperature needles hold steady unless the instrument is weak: when a needle crosses into red, press that instrument\'s number within a second.' },
  rush: 'Ran the test at half load so nothing got hot.',
  captions: { stalled: 'load test stalls', 'false pull': 'healthy unit stopped', 'burned out': 'instrument fault alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, grace = m.calm ? 1.6 : 1.1, sag = m.calm ? 0.06 : 0.08;
    m.testT = 15; const weak = shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 1, 2)), names = shuffle(r, NAMES);
    m.ins = [0, 1, 2, 3].map(k => ({ name: names[k], dial: 1, temp: rf(r, 0.3, 0.45), cap: rf(r, 0.5, 0.65), weak: weak.includes(k), at: 0, on: true, red: 0 }));
    weak.forEach((k, j) => { m.ins[k].at = rf(r, 2 + j * 5, 5 + j * 5); });
    m.floor = 0.6;
    const RED = 0.82;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), d = DIG(code);
      if (a === 'U') { for (const i of m.ins) if (i.on) i.dial = Math.min(1, i.dial + 0.12); return true; }
      if (d >= 1 && d <= 4) { const i = m.ins[d - 1]; if (!i.on) return true; if (i.temp < RED) { m.fault('false pull'); } i.on = false; m.ev('pull', { k: d - 1 }); return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const run = m.ins.filter(i => i.on);
      for (const i of m.ins) {
        if (!i.on) { i.temp = Math.max(0.2, i.temp - dt * 0.2); continue; }
        i.dial = Math.max(0, i.dial - sag * dt);
        const goal = i.weak && m.t >= i.at ? 1 : i.cap; i.temp += (goal - i.temp) * dt * (i.weak && m.t >= i.at ? 0.5 : 1.2);
        if (i.temp >= RED) { i.red += dt; if (i.red > grace) { m.fault('burned out'); i.on = false; } } else i.red = 0;
      }
      const avg = run.length ? run.reduce((a, i) => a + i.dial, 0) / run.length : 0;
      if (avg < m.floor) { m.fault('stalled'); for (const i of m.ins) if (i.on) i.dial = 1; }
      if (m.state === 'play' && m.t >= m.testT) { if (m.ins.some(i => i.on && i.weak)) { m.fault('burned out'); m.ins.forEach(i => { if (i.weak) i.on = false; }); } m.win(); }
    };
    m.hint = () => {
      if (m.state !== 'play') return []; const hot = m.ins.findIndex(i => i.on && i.temp >= RED); if (hot >= 0) return [[`Digit${hot + 1}`, true]];
      const run = m.ins.filter(i => i.on), avg = run.reduce((a, i) => a + i.dial, 0) / Math.max(1, run.length); return avg < 0.8 ? [['ArrowUp', true]] : [];
    };
    m.bad = () => { const k = m.ins.findIndex(i => i.on && i.temp < RED); return k >= 0 ? `Digit${k + 1}` : null; };
    m.view = () => ({ w: m.ins.map(i => [i.weak, +i.at.toFixed(2)]), n: m.ins.map(i => i.name) });
    m.buttons = () => [['ArrowUp', 'Top up ↑'], ...[1, 2, 3, 4].map(n => [`Digit${n}`, `Pull ${n}`])];
    m.draw = (c, W, H, P) => {
      m.ins.forEach((i, k) => {
        const y = 14 + k * 30, red = i.temp >= RED; txt(c, `${k + 1} ${i.name}`, 10, y + 12, { size: 11, col: i.on ? COL.ink : COL.dim });
        if (!i.on) { txt(c, 'OFF LOAD', 130, y + 12, { size: 11, col: COL.dim }); return; }
        bar(c, 130, y + 2, 110, 10, i.dial, { col: COL.peri }); bar(c, 255, y + 2, 110, 10, i.temp, { col: red ? P.bad : COL.gold, band: [RED, 1] });
        lamp(c, 380, y + 7, 7, red ? P.bad : P.good, red ? 'triangle' : 'circle');
      });
      const run = m.ins.filter(i => i.on), avg = run.reduce((a, i) => a + i.dial, 0) / Math.max(1, run.length);
      txt(c, 'throughput', 130, 136, { size: 9, col: COL.dim }); txt(c, 'temperature (red band)', 255, 136, { size: 9, col: COL.dim });
      txt(c, `avg ${Math.round(avg * 100)} % (floor ${m.floor * 100})   test ${Math.max(0, m.testT - m.t).toFixed(1)} s left`, 10, 158, { size: 12, col: avg < m.floor + 0.1 ? COL.warn : COL.pale });
    };
    return m;
  },
});
