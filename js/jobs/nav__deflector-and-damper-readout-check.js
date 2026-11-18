// Navigator: deflector and damper readout check. The junction gauges are mounted at odd angles, and a needle read off-square picks up
// parallax that happens to land right on nav's assumed figure. At each gauge turn your view until the needle covers its own reflection in
// the mirror strip, then tap E to write the reading on the damper sheet. A reading taken off-square is a fault: it hides the drift.
import { define, machine, room, rf, ri } from './kit.js';

export default define({
  job: { billet: 'nav', label: 'Deflector and damper readout check', type: 'loop' },
  title: 'Mirror-strip gauge reading', dept: 'flight', host: 'room', siteName: 'Gauge', verb: 'Read',
  how: 'At each junction gauge turn your view until the needle hides its reflection in the mirror strip (gap 0), then tap E to note the reading.',
  keys: ['look: square up to the dial', 'E tap: note the reading'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'parallax read', input: 'e-tap+look', win: 'every junction gauge read square-on, needle over its reflection, so the true drift from the assumed value is on the sheet',
    fail: 'noting a reading from an angle, where parallax shifts the needle onto the assumed figure and hides the drift',
    rule: 'Each dial is square to you at its own view angle. Turn until the panel shows the mirror gap closed, then tap E; a tap with the gap open writes a skewed figure.' },
  rush: 'Copied nav\'s assumed figures onto the damper sheet from across the junction.',
  captions: { parallax: 'pencil scratch' }, says: { parallax: 'Read from an angle: the needle sat on the assumed figure by parallax. Square up until the needle hides its reflection.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Deflector gauge 1', prop: 'fieldgen' }, { name: 'Deflector gauge 2', prop: 'fieldgen_damp' }, { name: 'Damper bank gauge', prop: 'relayrack' }]), r = m.rnd, tol = m.calm ? 0.09 : 0.06;
    m.g = m.sites.map(() => { const assumed = ri(r, 40, 80); return { sq: (r() < 0.5 ? -1 : 1) * rf(r, 0.2, 0.4), assumed, real: assumed + (r() < 0.5 ? -1 : 1) * ri(r, 3, 7), look: 0 }; });
    const gap = (k) => k.look - k.sq, shown = (k) => { const e = Math.min(1, Math.abs(gap(k)) / 0.2); return Math.round(k.real + (k.assumed - k.real) * e); };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next, k = m.g[i];
      k.look = inp.look || 0;
      if (inp.press) { if (Math.abs(gap(k)) <= tol) { m.ev('read', { site: i, v: k.real }); m.finish(i); return; } m.fault('parallax'); }
      s.prog = Math.max(0, 0.6 - Math.abs(gap(k))) * 1.2;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; return { at: i, look: m.g[i].sq, press: f % 3 === 0 }; };
    m.bad = (f = 0) => ({ at: m.next, look: 0, press: f % 10 === 0 });
    m.view = () => ({ g: m.g.map(k => [+k.sq.toFixed(2), k.assumed, k.real]) });
    m.panel = (i) => { const k = m.g[i]; if (!k) return null; const gp = gap(k), sq = Math.abs(gp) <= tol; return { label: sq ? 'Square: gap closed' : `Mirror gap ${gp > 0 ? 'turn right' : 'turn left'}`, value: `${shown(k)} (assumed ${k.assumed})`, bar: Math.max(0, 1 - Math.abs(gp) / 0.5), band: [1 - tol / 0.5, 1] }; };
    m.prompt = (i) => { const k = m.g[i]; return !k ? '' : Math.abs(gap(k)) <= tol ? 'Needle covers its reflection: tap [E] to note the reading' : 'Turn your view until the needle hides its reflection in the mirror strip'; };
    return m;
  },
});
