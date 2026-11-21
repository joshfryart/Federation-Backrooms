// Medtech: sickbay power shakedown. Tap E to start a unit's self-test, then tap E again to log it: pass once it lights UP (slow is still a pass),
// or FAIL once it has stalled past the limit. Logging early, or logging a slow unit as failed, is wrong.
import { define, machine, room, rf, shuffle, clamp } from './kit.js';
const LIM = 3.2;

export default define({
  job: { billet: 'medtech', label: 'Test sickbay power, bed monitors and hologram trigger', type: 'task:shakedown' },
  title: 'Slow versus dead unit timing', dept: 'medical', host: 'room', siteName: 'Unit', verb: 'Test',
  how: 'Tap E to start a unit. Watch the clock: tap E again when it lights UP. If nothing has come up by the 3.2 s limit, tap E to log the failure.',
  keys: ['E tap: start, then log'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'fire and time', input: 'e-tap', win: 'three units each started and logged right, slow ones passed and the stalled one logged failed at the limit',
    fail: 'logging a unit before it is up, or logging a slow but working unit as failed',
    rule: 'Tap to start the self-test and watch the seconds. UP lights at a unit-dependent time; log it then. A unit still dark at 3.2 s is the dead one: log it failed.' },
  rush: 'Ticked every unit pass off the shakedown sheet without waiting for any of them.',
  captions: { early: 'log rejected', 'false fail': 'working unit tagged out' }, says: { early: 'You logged it before it came up.', 'false fail': 'That unit was only slow: it came up inside the limit.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Bed 1 monitor', prop: 'bunk' }, { name: 'Bed 2 monitor', prop: 'bunk' }, { name: 'Hologram trigger', prop: 'nursestation' }]), r = m.rnd;
    const k = shuffle(r, ['fast', 'slow', 'dead']); m.u = k.map(x => ({ kind: x, up: x === 'fast' ? rf(r, 0.9, 1.5) : x === 'slow' ? rf(r, 2.1, 2.7) : 1e9, run: false, el: 0 }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); for (const u of m.u) if (u.run) u.el += dt; if (!s) return; const i = m.next, u = m.u[i];
      if (inp.press) {
        if (!u.run) { u.run = true; u.el = 0; m.ev('start', { site: i }); }
        else if (u.el >= u.up) m.finish(i);
        else if (u.el >= LIM) { u.kind === 'dead' ? m.finish(i) : m.fault('false fail'); }
        else m.fault('early');
      }
      s.prog = s.done ? 1 : u.run ? clamp(u.el / LIM) * 0.9 : 0;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const u = m.u[i]; return { at: i, press: !u.run || u.el >= u.up || (u.kind === 'dead' && u.el >= LIM + 0.1) }; };
    m.bad = () => ({ at: m.next, press: true });
    m.view = () => ({ k: m.u.map(u => [u.kind, +u.up.toFixed(2)]) });
    m.panel = (i) => { const u = m.u[i]; return u ? { label: u.run ? 'Self-test running' : 'Idle', value: !u.run ? 'tap to start' : u.el >= u.up ? 'UP at ' + u.up.toFixed(1) + ' s' : u.el.toFixed(1) + ' s ...', bar: clamp(u.el / LIM), band: [0.8, 1] } : null; };
    m.prompt = (i) => m.u[i]?.run ? 'Tap [E] when it lights UP, or at 3.2 s to log a failure' : 'Tap [E] to start the self-test';
    return m;
  },
});
