// Cargo: test the cargo lift and sled. Hold E to raise the platform toward each marked stop. Let go and it sags under load: tap E (a quick tap)
// to set the brake while the platform is inside the stop band. A brake set outside the band drops the platform; raising it past the top overruns.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'cargo', label: 'Test the cargo lift and sled', type: 'task:shakedown' },
  title: 'Raise, release, brake', dept: 'services', host: 'room', siteName: 'Lift', verb: 'Test',
  how: 'Hold E to raise the platform. Let go near the marked stop band, then quickly tap E to set the brake before it sags out of the band.',
  keys: ['E hold: raise', 'E tap: set the brake'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'raise and brake', input: 'e-hold+e-tap',
    win: 'the lift and the sled hoist each raised to every marked stop and braked there inside the band',
    fail: 'braking outside the stop band so the load drops, or raising the platform past the top',
    rule: 'Holding E raises the platform. Release near the stop band: it sags slowly under load. Tap E briefly while it is inside the band to brake it there. Too early, too late or too high is a fault.' },
  rush: 'Cycled the lift once without testing the brake at the stops.',
  captions: { dropped: 'platform drops with a clang', overrun: 'limit switch trips' },
  says: { dropped: 'The brake was set outside the stop band: the platform dropped.', overrun: 'You ran the platform past the top stop.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Cargo lift', prop: 'cargo_pad' }, { name: 'Sled hoist', prop: 'pallet_loaded' }]), r = m.rnd, bw = m.calm ? 0.07 : 0.05;
    m.lifts = [[rf(r, 0.2, 0.3), rf(r, 0.5, 0.6), rf(r, 0.78, 0.88)], [rf(r, 0.3, 0.45), rf(r, 0.7, 0.85)]].map(stops => ({ stops, k: 0, pos: 0 }));
    m.hd = 0; const rate = 0.26, sag = 0.12;
    const inBand = (l) => Math.abs(l.pos - l.stops[l.k]) <= bw;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) { m.hd = 0; return; } const i = m.next, l = m.lifts[i];
      if (inp.hold) { m.hd += dt; if (m.hd > 0.25) { l.pos += rate * dt; if (l.pos >= 1) { m.fault('overrun'); l.pos = 0.6; } } } else l.pos = Math.max(0, l.pos - sag * dt);
      if (rel) { const d = m.hd; m.hd = 0; if (d < 0.25 && l.pos > 0) { if (inBand(l)) { l.k++; if (l.k >= l.stops.length) m.finish(i); } else { m.fault('dropped'); l.pos = 0; } } }
      s.prog = s.done ? 1 : clamp((l.k + l.pos) / (l.stops.length + 1), 0, 0.95);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const l = m.lifts[i], t = l.stops[l.k]; if (l.pos < t - 0.025) return { at: i, hold: true };
      return { at: i, hold: (m.hd > 0 && m.hd < 0.12) || m.hd === 0 && !m.prevHold }; };
    const orig = m.step; m.step = (dt, inp = {}) => { orig(dt, inp); m.prevHold = !!inp.hold; };
    m.bad = () => ({ at: m.next, hold: true });
    m.view = () => ({ stops: m.lifts.map(l => l.stops.map(x => +x.toFixed(2))) });
    m.panel = (i) => { const l = m.lifts[i]; return l ? { label: `Stop ${l.k + 1} of ${l.stops.length}`, value: inBand(l) ? 'IN BAND: tap to brake' : l.pos < l.stops[l.k] ? 'raise' : 'above', bar: l.pos, band: [l.stops[l.k] - bw, l.stops[l.k] + bw] } : null; };
    m.prompt = () => 'Hold [E] to raise; let go near the band and tap [E] to brake';
    return m;
  },
});
