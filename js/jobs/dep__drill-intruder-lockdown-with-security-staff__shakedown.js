// Deputy security chief, shakedown: run the intruder lockdown drill and walk the corridor behind your officers. At each door the officer
// reports SEALED, but the seal strip has to be traced end to end: hold E and sweep your view steadily along the strip (too fast and the
// sweep skips sections). If the trace finds a gap, let go: the door is sent back and the officer re-seats it, then trace it again. Letting go
// with sections untraced passes a door on paper.
import { define, machine, room, ri, shuffle } from './kit.js';

const N = 8, LO = -0.45, HI = 0.45;
export default define({
  job: { billet: 'dep', label: 'Drill intruder lockdown with security staff', type: 'task:shakedown' },
  title: 'Lockdown drill seal-strip trace', dept: 'security', host: 'room', siteName: 'Door', verb: 'Trace',
  how: 'At each drilled door hold E and sweep your view steadily from one end of the seal strip to the other. If a GAP shows, let go to send the door back, then trace it again once re-sealed.',
  keys: ['E hold + steady sweep: trace the seal', 'let go on a gap: send it back'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'trace the seal', input: 'e-hold+look+swing', win: 'every drilled door has its whole seal strip traced at a steady sweep, and each gap sent back and traced again clean',
    fail: 'letting go before the whole strip is traced, so a door passes on paper with sections never checked',
    rule: 'Hold E and turn at a steady, moderate speed across the strip: each section lights as it is traced (fast sweeps skip). A GAP means release to send the door back; a full clean trace passes it.' },
  rush: 'Took each officer\'s word that the door was sealed and stopped the clock.',
  captions: { 'half-traced': 'drill clock ticks on', gap: 'draught whistles', 'sent back': 'officer re-seats the door' },
  says: { 'half-traced': 'You let go with sections untraced — trace the whole strip before you pass a door.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Brig entry door', prop: 'airlock_doors' }, { name: 'Cell block door', prop: 'cellfield' }, { name: 'Armory link door', prop: 'weaponrack' }, { name: 'Corridor bulkhead', prop: 'airlock_doors' }]), r = m.rnd;
    const gaps = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 1, 2))), fast = m.calm ? 1.6 : 1.3;
    m.d = m.sites.map((_, i) => ({ gap: gaps.has(i) ? ri(r, 0, N - 1) : -1, cov: Array(N).fill(false), ph: 'trace', t: 0, seen: false }));
    const bin = (look) => Math.max(0, Math.min(N - 1, Math.floor((look - LO) / (HI - LO) * N)));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, d = m.d[i];
      if (d.ph === 'reseal') { d.t += dt; if (d.t >= 1.2) { d.ph = 'trace'; d.gap = -1; d.seen = false; d.cov.fill(false); } s.prog = 0.3; return; }
      const sw = Math.abs(inp.swing || 0);
      if (inp.hold && sw >= 0.2 && sw <= fast) { const b = bin(inp.look || 0); d.cov[b] = true; if (b === d.gap && !d.seen) { d.seen = true; m.ev('gap', { site: i }); } }
      if (rel) { if (d.seen) { d.ph = 'reseal'; d.t = 0; m.ev('sent back', { site: i }); return; } if (d.cov.some(x => x)) { m.fault('half-traced'); d.cov.fill(false); } }
      if (!d.seen && d.cov.every(x => x)) { m.finish(i); return; }
      s.prog = 0.9 * d.cov.filter(x => x).length / N;
    };
    const sweep = (f) => { const p = (f % 72) / 36, k = p < 1 ? p : 2 - p; return { look: LO + 0.02 + (HI - LO - 0.04) * k, swing: (p < 1 ? 1 : -1) * (HI - LO - 0.04) / 36 * 30 }; };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const d = m.d[i]; return { at: i, hold: d.ph === 'trace' && !d.seen, ...sweep(f) }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 24 < 14, ...sweep(f) });
    m.view = () => ({ gaps: m.d.map(d => d.gap) });
    m.panel = (i) => { const d = m.d[i]; if (!d) return null; return d.ph === 'reseal' ? { label: 'Sent back', value: 'officer re-seating…', bar: d.t / 1.2 } : { label: d.seen ? 'GAP FOUND' : 'Seal strip', value: d.cov.map((c, k) => k === d.gap && d.seen ? 'X' : c ? '■' : '□').join(''), bar: d.cov.filter(x => x).length / N }; };
    m.prompt = (i) => { const d = m.d[i]; return !d ? '' : d.ph === 'reseal' ? 'Officer re-seating the door — wait' : d.seen ? 'Gap! Let go of [E] to send the door back' : 'Hold [E] and sweep steadily along the seal strip, end to end'; };
    return m;
  },
});
