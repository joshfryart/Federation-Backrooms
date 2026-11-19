// Doctor: test the emergency medical systems. Three units, one test each, all done by hand: charge the defibrillator into the test load (hold E
// until fully charged, release to fire), seal the suction tube (hold E until the vacuum gauge levels off), and open the oxygen regulator one turn
// (hold E and turn). The panel then shows what the unit delivered against what it was set to, with the tolerance. Tag it: one tap of E = PASS,
// two quick taps = red OUT OF SERVICE. A unit that passes its self-test lights but delivers outside tolerance must come out of service.
import { define, machine, room, rf, shuffle, clamp } from './kit.js';

const UNITS = [{ name: 'Defibrillator', what: 'delivered', unit: 'J', set: 200, tol: 15, how: 'Hold [E] to charge into the test load; let go when full to fire' },
  { name: 'Suction unit', what: 'vacuum', unit: 'mmHg', set: 400, tol: 30, how: 'Hold [E] to seal the tube until the gauge levels off' },
  { name: 'Oxygen regulator', what: 'flow', unit: 'L/min', set: 10, tol: 0.8, how: 'Hold [E] and turn to open the valve one full turn' }];
export default define({
  job: { billet: 'doc', label: 'Test emergency medical systems', type: 'task:shakedown' },
  title: 'Defib, suction and O2 delivery test', dept: 'medical', host: 'room', siteName: 'Unit', verb: 'Test',
  how: 'Run each unit\'s test by hand (hold E; turn for the regulator), read delivered against set, then tag it: one tap of E for PASS, two quick taps for OUT OF SERVICE.',
  keys: ['E hold: run the test', 'turn: open the valve', 'E tap = pass · tap-tap = out of service'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'fire and tag', input: 'e-hold+e-tap+turn', win: 'defibrillator, suction and oxygen regulator each run through a full delivery test and tagged pass or out of service by delivered value against tolerance',
    fail: 'passing a unit whose delivered energy, vacuum or flow is outside tolerance, or cutting a delivery test short',
    rule: 'Hold E through the whole test (charge to full, gauge level, or one full turn of the valve). Then one tap tags PASS and two taps inside half a second tag OUT OF SERVICE. Self-test lights do not count.' },
  rush: 'Watched the self-test lights go green and initialled the log.',
  captions: { 'passed weak': 'pass tag snaps on', 'pulled good': 'red tag snaps on', 'cut short': 'unit whines down', untested: 'tag gun clicks' },
  says: { 'passed weak': 'That unit delivers outside tolerance. It goes out of service, whatever its self-test says.', 'pulled good': 'Delivered inside tolerance: that unit is fine.', 'cut short': 'You let go before the test finished. Run it right through.', untested: 'Run the delivery test before you tag the unit.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Defibrillator', prop: 'nursestation' }, { name: 'Suction unit', prop: 'med_dispenser' }, { name: 'Oxygen regulator', prop: 'exam_couch' }]), r = m.rnd;
    const weak = new Set(shuffle(r, [0, 1, 2]).slice(0, 1 + Math.floor(r() * 2))), TAP = 0.3, WIN = m.calm ? 0.6 : 0.5;
    m.units = UNITS.map((u, i) => { const sign = r() < 0.5 ? -1 : 1, d = weak.has(i) ? sign * rf(r, 1.6, 2.6) * u.tol : rf(r, -0.6, 0.6) * u.tol;
      return { ...u, got: +(u.set + d).toFixed(u.tol < 1 ? 1 : 0), weak: weak.has(i), p: 0, phase: 'test', pend: -1 }; });
    let down = 0;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) { down = 0; return; } const i = m.next, u = m.units[i];
      if (inp.hold) down += dt; const tap = rel && down < TAP, let_go = rel && down >= TAP; if (!inp.hold) down = 0;
      if (u.phase === 'test') {
        if (inp.hold) u.p = clamp(u.p + (i === 2 ? Math.abs(inp.turn || 0) / 6.3 : 0.8) * dt);
        if (tap && u.p < 0.05) m.fault('untested'); else if (let_go || tap) { if (u.p >= 1) u.phase = 'tag'; else { m.fault('cut short'); u.p = 0; } }
      } else {
        if (tap) { if (u.pend < 0) u.pend = m.t; else { u.pend = -1; if (!u.weak) m.fault('pulled good'); else { m.finish(i); return; } } }
        if (u.pend >= 0 && m.t - u.pend > WIN) { u.pend = -1; if (u.weak) m.fault('passed weak'); else { m.finish(i); return; } }
      }
      s.prog = s.done ? 1 : u.phase === 'test' ? 0.7 * u.p : 0.8;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const u = m.units[i];
      if (u.phase === 'test') return { at: i, hold: u.p < 1, turn: 2.5 };
      const tap = f % 6 < 2; if (u.weak) return { at: i, hold: tap, press: f % 6 === 0 };
      return u.pend < 0 ? { at: i, hold: tap, press: f % 6 === 0 } : { at: i, hold: false }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 6 < 2, press: f % 6 === 0 });
    m.view = () => ({ got: m.units.map(u => u.got) });
    m.panel = (i) => { const u = m.units[i]; if (!u) return null;
      if (u.phase === 'test') return { label: `${u.name}: self-test ● OK · set ${u.set} ${u.unit}`, value: `${Math.round(u.p * 100)} %`, bar: u.p, band: [0.98, 1] };
      const off = u.got - u.set; return { label: `${u.what} ${u.got} ${u.unit} vs set ${u.set} ±${u.tol}`, value: `${off >= 0 ? '+' : ''}${+off.toFixed(1)} ${Math.abs(off) > u.tol ? '▲ OUT' : '● in'}`, bar: clamp(0.5 + off / (u.tol * 6)), band: [0.5 - 1 / 6, 0.5 + 1 / 6] }; };
    m.prompt = (i) => { const u = m.units[i]; return !u ? '' : u.phase === 'test' ? u.how : 'Tap [E] once to tag PASS, twice quickly for OUT OF SERVICE'; };
    return m;
  },
});
