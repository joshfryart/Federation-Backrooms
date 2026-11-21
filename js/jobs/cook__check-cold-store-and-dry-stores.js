// Cook: check the cold store and dry stores. At each stop push the probe in (hold E) and read the needle; it falls toward its true value and
// the panel shows how fast it is still moving. Let go only once it has settled. Writing the number early is a fault; holding on far past
// settling warms the probe.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'cook', label: 'Check cold store and dry stores', type: 'loop' },
  title: 'Probe in until the needle settles', dept: 'services', host: 'room', siteName: 'Tub', verb: 'Probe',
  how: 'Hold E to push the probe into the tub and watch the needle. Let go of E once the needle has stopped moving, then the number is written down.',
  keys: ['E hold: probe in', 'let go: write the number'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'probe to settle', input: 'e-hold', win: 'three tubs read with the probe let go only once the needle had stopped drifting',
    fail: 'writing a number while the needle is still drifting, or leaving the probe in so long it warms',
    rule: 'The needle starts warm and falls toward the true reading, slowing as it nears. The panel shows its drift per second; release E when that is almost zero.' },
  rush: 'Wrote the first number the needle showed and moved on to the dry shelves.',
  captions: { unsettled: 'needle still falling', 'probe warms': 'probe warming beep' }, says: { unsettled: 'Written down too early: the needle was still moving.', 'probe warms': 'Left the probe in too long; it warmed up.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Milk tub', prop: 'reachin_cooler' }, { name: 'Flour crates', prop: 'shelving' }, { name: 'Bean crates', prop: 'crate' }]), r = m.rnd;
    m.tub = m.sites.map(() => ({ F: +rf(r, 2.5, 5.5).toFixed(1), off: rf(r, 4.5, 6.5), tau: rf(r, 0.7, 1), h: 0, settledFor: 0 }));
    const val = (u) => u.F + u.off * Math.exp(-u.h / u.tau), drift = (u) => Math.abs(u.off / u.tau * Math.exp(-u.h / u.tau));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const u = m.tub[m.next];
      if (inp.hold) { u.h += dt; if (drift(u) < 0.15) u.settledFor += dt; if (u.settledFor > 3) { m.fault('probe warms'); u.h = 0; u.settledFor = 0; } }
      if (rel) { if (drift(u) < 0.25) m.finish(m.next); else { m.fault('unsettled'); u.h = 0; u.settledFor = 0; } }
      s.prog = s.done ? 1 : clamp(u.h / 3.5, 0, 0.95);
    };
    m.hint = () => { const u = m.tub[Math.max(0, m.next)]; return { at: m.next, hold: m.next >= 0 && drift(u) > 0.18 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 20 < 6 });
    m.view = () => ({ F: m.tub.map(u => u.F), tau: m.tub.map(u => +u.tau.toFixed(2)) });
    m.panel = (i) => { const u = m.tub[i]; return u ? { label: 'Needle', value: `${val(u).toFixed(1)} C, drifting ${drift(u).toFixed(2)}/s`, bar: clamp(1 - drift(u) / 5) } : null; };
    m.prompt = () => 'Hold [E] to probe; let go when the needle has stopped moving';
    return m;
  },
});
