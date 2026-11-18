// Transporter chief: decontaminate the pattern buffer. At each decon port, hold the flush lever (hold E) and the effluent light runs from amber
// toward clear. But a running flush dilutes the effluent: the light looks clear while solution pours through even if contamination is left.
// Let the lever rest and watch: diluted effluent clouds back to amber within a second or two; truly clean effluent stays clear. Seal the port
// (a quick tap of E) only once the light has stayed clear with the lever at rest.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'tchief', label: 'Decontaminate buffer', type: 'task:medical_relief' },
  title: 'Effluent clear at rest, not diluted', dept: 'operations', host: 'room', siteName: 'Decon port', verb: 'Flush',
  how: 'Hold E on the flush lever until the effluent light reads clear, then let go and watch it rest. If it clouds back to amber it was only diluted: flush again. Once it stays clear at rest, tap E to seal the port.',
  keys: ['E hold: flush', 'let go: let it rest', 'E tap: seal the port'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'flush and settle', input: 'e-hold+e-tap', win: 'every buffer decon port flushed until the effluent stays clear with the lever at rest, and only then sealed',
    fail: 'sealing a port whose effluent only looked clear because the flush was diluting it',
    rule: 'Flushing (E held) makes the effluent read cleaner than it is. Release and let it rest: the reading drifts back to the true level. Tap E to seal only after it has rested clear for the settle time.' },
  rush: 'Flushed until the light went clear and sealed it while the solution was still running.',
  captions: { contaminated: 'biohazard alarm' }, says: { contaminated: 'Sealed while contamination was left: the clear light was only dilution. Let it rest before you seal.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Buffer decon port A', prop: 'buffertank' }, { name: 'Buffer decon port B', prop: 'buffertank' }]), r = m.rnd;
    const settle = m.calm ? 1.6 : 1.4, clear = 0.12, tapMax = 0.25;
    m.ports = m.sites.map(() => ({ c: rf(r, 0.8, 1), rate: rf(r, 0.22, 0.34), vis: 1, held: 0, rest: 0 }));
    m.ports.forEach(p => { p.vis = p.c; });
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, p = m.ports[i];
      if (rel) {
        if (p.held < tapMax) { if (p.c > clear) m.fault('contaminated'); else { m.ev('seal', { site: i }); m.finish(i); return; } }
        p.held = 0; p.rest = 0;
      }
      if (inp.hold) { p.held += dt; if (p.held >= tapMax) { p.c = Math.max(0, p.c - p.rate * dt); p.vis += (p.c * 0.25 - p.vis) * Math.min(1, 4 * dt); p.rest = 0; } }
      else { p.vis += (p.c - p.vis) * Math.min(1, 2.2 * dt); p.rest += dt; }
      s.prog = clamp((1 - p.c) * 0.9);
    };
    m.hint = (f = 0) => {
      const i = m.next; if (i < 0) return { at: -1 }; const p = m.ports[i];
      if (p.held >= tapMax) return { at: i, hold: p.vis > 0.03 };
      if (p.rest < settle) return { at: i, hold: false };
      return p.vis <= clear * 0.8 ? { at: i, hold: f % 8 === 0 } : { at: i, hold: true };
    };
    m.bad = (f = 0) => { const k = f % 70; return { at: m.next, hold: k < 35 || k === 45 }; };
    m.view = () => ({ ports: m.ports.map(p => [+p.c.toFixed(2), +p.rate.toFixed(2)]) });
    m.panel = (i) => {
      const p = m.ports[i]; if (!p) return null; const amber = p.vis > clear;
      return { label: p.held >= tapMax ? 'Effluent (flushing — diluted)' : `Effluent at rest ${Math.min(p.rest, 9).toFixed(1)} s`, value: amber ? `AMBER ${Math.round(p.vis * 100)}` : `clear ${Math.round(p.vis * 100)}`, bar: 1 - p.vis, band: [1 - clear, 1] };
    };
    m.prompt = (i) => {
      const p = m.ports[i]; if (!p) return ''; if (p.held >= tapMax) return 'Flushing: let go of [E] and watch the effluent rest';
      return p.rest >= settle && p.vis <= clear ? 'Stayed clear at rest: tap [E] to seal the port' : p.rest < settle ? 'Lever at rest: watch whether the light clouds back' : 'Clouded back to amber: hold [E] to flush again';
    };
    return m;
  },
});
