// CFO: test shuttle launch (shakedown). From the pilot seat, feather the lift: holding E spools the thrust up, letting go spools it down, and the
// craft answers late. Bring her up into the hover band and hold her there for the hover reading, then set her down gently on the pad. Then
// check the landing gear lamps after touchdown. Overshooting the bay ceiling or a hard touchdown aborts the test.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'cfo', label: 'Test shuttle launch', type: 'task:shakedown' },
  title: 'Feathered lift to hover and set-down', dept: 'flight', host: 'room', siteName: 'Station', verb: 'Fly',
  how: 'In the pilot seat, hold and release E to feather the lift: the thrust spools up while held and down when released. Hover in the band until the reading is taken, then land softly. Finish by reading the gear lamps.',
  keys: ['E hold: spool thrust up', 'E released: spool down'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'feather hover', input: 'e-hold', win: 'the shuttle lifted into the hover band, held there for the thrust reading and set down below touchdown speed, gear lamps then read',
    fail: 'overshooting into the bay ceiling or dropping onto the pad faster than touchdown speed',
    rule: 'Thrust lags the switch. Pulse E to climb into the band and hold her there two seconds; then ease off so she sinks slowly and touches down under the speed limit.' },
  rush: 'Popped her up, called the hover good and dropped her back on the pad.',
  captions: { ceiling: 'proximity klaxon', 'hard landing': 'landing gear bangs', unread: 'lamp panel unread' },
  says: { ceiling: 'Too high — the bay ceiling alarm. She is back on the pad; feather it.', 'hard landing': 'Hard landing — ease the thrust so she settles.', unread: 'Let go before the gear lamps were read.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Pilot seat', prop: 'shuttle' }, { name: 'Gear lamps', prop: 'pad' }]), r = m.rnd;
    const lo = rf(r, 0.4, 0.5), band = [lo, lo + (m.calm ? 0.24 : 0.18)], touch = m.calm ? 0.3 : 0.22, need = rf(r, 1.8, 2.4), spool = rf(r, 1.0, 1.4);
    m.c = { T: 0, v: 0, alt: 0, hov: 0, phase: 'lift', band, need, spool, lamp: 0 };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const c = m.c;
      if (m.next === 1) { if (inp.hold) { c.lamp += dt; if (c.lamp >= 1) { m.finish(1); return; } } if (rel && c.lamp > 0.1) { m.fault('unread'); c.lamp = 0; } s.prog = clamp(c.lamp); return; }
      c.T = clamp(c.T + (inp.hold ? c.spool : -c.spool) * dt); c.v += (c.T - 0.5) * 2 * dt; c.alt += c.v * dt;
      if (c.alt <= 0) { if (c.v < -touch) { m.fault('hard landing'); c.phase = 'lift'; c.hov = 0; } else if (c.phase === 'land') { m.finish(0); return; } c.alt = 0; c.v = Math.max(0, c.v); }
      if (c.alt > 0.95) { m.fault('ceiling'); Object.assign(c, { T: 0, v: 0, alt: 0, hov: 0, phase: 'lift' }); }
      if (c.phase === 'lift' && c.alt >= band[0] && c.alt <= band[1]) { c.hov += dt; if (c.hov >= c.need) c.phase = 'land'; }
      s.prog = clamp(c.phase === 'land' ? 0.6 + (1 - c.alt) * 0.3 : c.hov / c.need * 0.6);
    };
    m.hint = () => {
      const i = m.next; if (i < 0) return { at: -1 }; if (i === 1) return { at: 1, hold: true }; const c = m.c;
      const tgt = c.phase === 'lift' ? (band[0] + band[1]) / 2 : -0.2, vd = clamp((tgt - c.alt) * 1.5, c.phase === 'land' ? -0.12 : -0.3, 0.3);
      return { at: 0, hold: c.T < 0.5 + (vd - c.v) * 1.5 };
    };
    m.bad = () => ({ at: m.next, hold: true });
    m.view = () => ({ band: band.map(x => +x.toFixed(3)), need: +need.toFixed(2), spool: +spool.toFixed(2) });
    m.panel = (i) => {
      const c = m.c; if (i === 1) return { label: 'Gear lamps', value: c.lamp >= 1 ? 'all down and locked' : 'reading…', bar: clamp(c.lamp) };
      return { label: c.phase === 'land' ? 'SET DOWN' : 'Hover', value: `alt ${Math.round(c.alt * 100)} · ${c.v >= 0 ? '+' : ''}${(c.v * 10).toFixed(1)} m/s · thrust ${Math.round(c.T * 100)} %`, bar: clamp(c.alt), band: c.phase === 'land' ? [0, 0.05] : band };
    };
    m.prompt = (i) => i === 1 ? 'Hold [E] to read the landing gear lamps' : m.c.phase === 'land' ? 'Hover logged — ease off [E] and set her down gently' : 'Pulse [E] to feather the lift up into the hover band and hold her there';
    return m;
  },
});
