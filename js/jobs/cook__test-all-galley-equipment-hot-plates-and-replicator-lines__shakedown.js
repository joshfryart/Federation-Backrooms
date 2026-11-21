// Cook: test galley equipment. Each unit's test button must be pressed twice, a beat apart: too quick and the panel reads it as one bounce,
// too slow and the first press times out. A green light after the second press clears the unit.
import { define, machine, room, clamp, rf } from './kit.js';

export default define({
  job: { billet: 'cook', label: 'Test all galley equipment, hot plates and replicator lines', type: 'task:shakedown' },
  title: 'Double-press test button', dept: 'services', host: 'room', siteName: 'Unit', verb: 'Test',
  how: 'At each unit tap E once, wait about a second, and tap E again. Too quick is read as a bounce and the test resets.',
  keys: ['E tap, pause, E tap'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'double-press test', input: 'e-tap', win: 'three units cleared by two test presses spaced a beat apart',
    fail: 'pressing twice in a rush so the panel logs a bounce, three times over',
    rule: 'The second press must come between a third of a second and a second and a half after the first. Sooner is a bounce fault; later and the test resets.' },
  rush: 'Pressed the test button once on each unit and assumed the green light meant fine.',
  captions: { bounce: 'test panel buzzes' }, says: { bounce: 'Pressed twice too fast: the panel read it as one bounce.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Hot plate 1', prop: 'range' }, { name: 'Hot plate 2', prop: 'range' }, { name: 'Replicator line', prop: 'servery' }]), hi = m.calm ? 2.0 : 1.5; m.lows = [0, 1, 2].map(() => +rf(m.rnd, 0.3, 0.42).toFixed(2));
    m.first = [null, null, null];
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, f = m.first[i];
      if (f !== null && m.t - f > hi) m.first[i] = null;
      if (inp.press) { if (m.first[i] === null) m.first[i] = m.t; else if (m.t - m.first[i] < m.lows[i]) { m.fault('bounce'); m.first[i] = null; } else m.finish(i); }
      s.prog = s.done ? 1 : m.first[i] === null ? 0 : 0.5;
    };
    m.hint = () => { const i = m.next, f = i >= 0 ? m.first[i] : null; return { at: i, press: f === null || m.t - f >= 0.6 }; };
    m.bad = (f = 0) => ({ at: m.next, press: f % 3 === 0 });
    m.view = () => ({ lows: m.lows, hi });
    m.panel = (i) => ({ label: 'Test lamp', value: m.first[i] === null ? 'off' : 'amber: press again', bar: m.first[i] === null ? 0 : clamp(1 - (m.t - m.first[i]) / hi) });
    m.prompt = () => 'Tap [E], wait a beat, tap [E] again';
    return m;
  },
});
