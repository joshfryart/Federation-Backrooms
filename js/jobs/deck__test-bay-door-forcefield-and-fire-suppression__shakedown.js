// Deck crew: test bay door, forcefield and fire suppression, in script order. Each test runs only while you hold its test switch (E), and a
// test only counts if you watched it all the way: keep your view on the moving thing (the door's leading edge along its track, the test tag
// pushed out to the field line, then the suppression spray front falling to the drain). Lose sight of it and the test is void and restarts.
import { define, machine, room, rf, pick, clamp } from './kit.js';

export default define({
  job: { billet: 'deck', label: 'Test bay door, forcefield and fire suppression', type: 'task:shakedown' },
  title: 'Watched test script: door, field, spray', dept: 'flight', host: 'room', siteName: 'Test', verb: 'Run',
  how: 'At each test point hold E to run the test and follow the moving marker with your view the whole way: door edge, test tag, then the spray front to the drain. Lose it and the test restarts.',
  keys: ['E hold: run the test', 'Look: keep your eye on it'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'follow by eye', input: 'e-hold+look', win: 'door cycle, field tag push and suppression burst each run to the end in script order with the moving part kept in view throughout',
    fail: 'letting the door edge, tag or spray front out of sight mid-test, or letting go of the switch before the test ends',
    rule: 'While E is held the test runs and a marker moves across your field of view on its own path. Keep your view within the sight cone of it; half a second out of sight voids the test. Release only when the panel says COMPLETE.' },
  rush: 'Ran the script with the console on auto and read the green lights.',
  captions: { unwatched: 'test void tone', aborted: 'switch clicks off' },
  says: { unwatched: 'You lost sight of it — that test does not count. Keep your eye on it.', aborted: 'Let go mid-test — run it again to the end.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Bay door control', prop: 'baycontrol' }, { name: 'Field emitter', prop: 'fieldgen' }, { name: 'Suppression head', prop: 'pumpskid' }]), r = m.rnd;
    const cone = m.calm ? 0.17 : 0.12, sl = m.calm ? 1.25 : 1;
    const d1 = pick(r, [1, -1]), d2 = pick(r, [1, -1]), d3 = pick(r, [1, -1]), line = rf(r, 0.1, 0.3), drain = rf(r, 0.25, 0.42);
    m.tests = [
      { dur: rf(r, 3.2, 4.0) * sl, at: (u) => d1 * 0.42 * Math.cos(Math.PI * 2 * u) },                       // door opens and closes along its track
      { dur: rf(r, 2.6, 3.2) * sl, at: (u) => d2 * (-0.4 + (0.4 + line) * Math.min(1, u * 1.6) - 0.06 * Math.max(0, u * 1.6 - 1)) },   // tag out to the field, nudged back
      { dur: rf(r, 2.8, 3.6) * sl, at: (u) => d3 * (-0.35 + (0.35 + drain) * u * u + 0.04 * Math.sin(u * 12)) },  // spray front accelerating to the drain
    ].map(t => ({ ...t, u: 0, lost: 0 }));
    const reset = (t) => { t.u = 0; t.lost = 0; };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, t = m.tests[i]; m.lk = inp.look || 0;
      if (inp.hold) { t.u = Math.min(1, t.u + dt / t.dur); if (Math.abs((inp.look || 0) - t.at(t.u)) > cone) { t.lost += dt; if (t.lost > 0.5) { m.fault('unwatched'); reset(t); } } else t.lost = 0; }
      if (rel) { if (t.u >= 1) { m.finish(i); return; } if (t.u > 0.05) m.fault('aborted'); reset(t); }
      s.prog = s.done ? 1 : clamp(t.u * 0.9, 0, 0.9);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const t = m.tests[i]; if (t.u >= 1) return { at: i, hold: false }; return { at: i, hold: true, look: t.at(Math.min(1, t.u + 1 / 30 / t.dur)) }; };
    m.bad = () => ({ at: m.next, hold: true, look: 0.6 });
    m.view = () => ({ t: m.tests.map(t => [+t.dur.toFixed(2), +t.at(0.5).toFixed(2)]) });
    m.panel = (i) => { const t = m.tests[i]; if (!t) return null; const d = t.at(t.u) - (m.lk || 0); return { label: t.u >= 1 ? 'COMPLETE — let go' : `${['Door edge', 'Test tag', 'Spray front'][i]} ${d > cone / 2 ? '◀ turn left' : d < -cone / 2 ? 'turn right ▶' : '● in sight'}`, value: t.lost > 0 ? 'OUT OF SIGHT' : `${Math.round(t.u * 100)} %`, bar: t.u, band: [0.98, 1] }; };
    m.prompt = (i) => { const t = m.tests[i]; return !t ? '' : t.u >= 1 ? 'Test complete: let go of [E]' : 'Hold [E] to run the test and keep your view on the moving part'; };
    return m;
  },
});
