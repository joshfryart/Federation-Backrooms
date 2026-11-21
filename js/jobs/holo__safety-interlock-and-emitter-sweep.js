// Holodeck tech: emitter sweep. Each emitter hums at its own beat. Tap E at the casing in time with that hum; three taps in a row spaced like
// the hum "match the tone" and the emitter is cleared. Mashing E (taps closer than a quarter second) cracks the probe's reading and is a fault.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'holo', label: 'Safety interlock and emitter sweep', type: 'loop' },
  title: 'Tap the casing to the emitter hum', dept: 'services', host: 'room', siteName: 'Emitter', verb: 'Tap',
  how: 'Each emitter hums at its own steady beat, shown on the panel. Tap E at the same spacing three times in a row to match its tone.',
  keys: ['E tap on the hum beat'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'match the hum', input: 'e-tap+rhythm', win: 'three emitters cleared by tapping three matching beats at each casing',
    fail: 'mashing taps faster than the hum until the probe reading is spoilt, three times',
    rule: 'The panel gives the emitter hum interval. Tap E each interval, within a tolerance; three in a row clears it. A tap quicker than a quarter second is a mash fault.' },
  rush: 'Rapped on each casing once and signed the sweep sheet from the corridor.',
  captions: { mash: 'probe chatter' }, says: { mash: 'Tapped too fast: the probe chattered and the reading is spoilt.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Emitter A', prop: null }, { name: 'Emitter B', prop: null }, { name: 'Emitter C', prop: null }]), r = m.rnd, tol = m.calm ? 0.2 : 0.13;
    m.em = m.sites.map(() => ({ p: +rf(r, 0.6, 1.0).toFixed(2), last: null, chain: 0 }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const e = m.em[m.next];
      if (e.last !== null && m.t - e.last > e.p + tol + 0.5) { e.last = null; e.chain = 0; }
      if (inp.press) { const g = e.last === null ? null : m.t - e.last;
        if (g !== null && g < 0.25) { m.fault('mash'); e.chain = 0; } else if (g !== null && Math.abs(g - e.p) <= tol) e.chain++; else e.chain = 0;
        e.last = m.t; if (e.chain >= 3) m.finish(m.next); }
      s.prog = s.done ? 1 : clamp(e.chain / 3, 0, 0.95);
    };
    m.hint = () => { const e = m.em[Math.max(0, m.next)]; return { at: m.next, press: e.last === null || m.t - e.last >= e.p }; };
    m.bad = (f = 0) => ({ at: m.next, press: f % 3 === 0 });
    m.view = () => ({ p: m.em.map(e => e.p) });
    m.panel = (i) => { const e = m.em[i]; return e ? { label: `Hum every ${e.p.toFixed(2)} s`, value: `${e.chain} / 3 matched`, bar: e.chain / 3 } : null; };
    m.prompt = (i) => { const e = m.em[i]; return e ? `Tap [E] every ${e.p.toFixed(2)} s, in time with the hum` : ''; };
    return m;
  },
});
