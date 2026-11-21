// Holodeck tech: calm recovery program. Three emitters flicker. At each one face it (the panel says which way it sits), hold E and keep
// your view on it: the flicker settles while you stay aimed and creeps back if you look away. Holding E while looking the wrong way is a fault.
import { define, machine, room, pick, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'holo', label: "Switch grid emitters to a calm recovery program for patients' families", type: 'task:medical_relief' },
  title: 'Steady the flickering emitter', dept: 'services', host: 'room', siteName: 'Emitter', verb: 'Steady',
  how: 'Face each flickering emitter, hold E and keep your view on it until the flicker bar settles. Looking away makes it flicker again.',
  keys: ['look at the emitter', 'E hold: steady it'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'steady the flicker', input: 'e-hold+look', win: 'three flickering emitters settled by holding E while aimed at each for two seconds',
    fail: 'holding E while aimed well away from the emitter, again and again',
    rule: 'The panel gives the emitter bearing. Hold E with your view within a narrow cone of it and the flicker falls. Aimed far off for half a second is a fault.' },
  rush: 'Switched the grid over and left a flickering emitter for the visitors to notice.',
  captions: { 'wrong emitter': 'emitter flares' }, says: { 'wrong emitter': 'You were steadying the wrong spot: the emitter flared.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Emitter 1', prop: null }, { name: 'Emitter 2', prop: null }, { name: 'Emitter 3', prop: null }]), r = m.rnd, cone = m.calm ? 0.3 : 0.22;
    m.em = m.sites.map(() => ({ b: pick(r, [-1, 1]) * rf(r, 0.15, 0.35), f: 1, off: 0 }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const e = m.em[m.next], d = Math.abs((inp.look || 0) - e.b);
      if (inp.hold && d <= cone) { e.f -= dt / 2; e.off = 0; if (e.f <= 0) m.finish(m.next); } else { e.f = Math.min(1, e.f + dt * 0.25); if (inp.hold && d > 0.5) { e.off += dt; if (e.off > 0.5) { m.fault('wrong emitter'); e.off = 0; } } }
      s.prog = s.done ? 1 : clamp(1 - e.f, 0, 0.95);
    };
    m.hint = () => ({ at: m.next, hold: true, look: m.next >= 0 ? m.em[m.next].b : 0 });
    m.bad = () => ({ at: m.next, hold: true, look: m.next >= 0 ? m.em[m.next].b + 0.9 : 0.9 });
    m.view = () => ({ b: m.em.map(e => +e.b.toFixed(2)) });
    m.panel = (i) => { const e = m.em[i]; return e ? { label: `Emitter on your ${e.b > 0 ? 'LEFT' : 'RIGHT'}`, value: `flicker ${Math.round(e.f * 100)} %`, bar: 1 - e.f } : null; };
    m.prompt = (i) => { const e = m.em[i]; return e ? `Face the emitter (${e.b > 0 ? 'left' : 'right'}) and hold [E]` : ''; };
    return m;
  },
});
