// Navigator: compare dampers and deflector against nav predictions. Each junction logger opens on the LATEST reading, which is already
// out of tolerance; the job is to find when it first strayed. Scroll the trace back through the last hour by swinging your view (left goes
// back in time, right forward) and tap E on the earliest segment past the limit. Tapping a later segment, or one still inside the
// limit, is a fault.
import { define, machine, room, ri, rf, clamp } from './kit.js';

const N = 12;
export default define({
  job: { billet: 'nav', label: 'Compare dampers and deflector against nav predictions', type: 'task:shakedown' },
  title: 'Logger scroll-back to first drift', dept: 'flight', host: 'room', siteName: 'Logger', verb: 'Trace',
  how: 'At each junction logger swing your view left to scroll the trace back in time (right to come forward) and tap E on the earliest segment past the limit.',
  keys: ['swing view: scroll the trace', 'E tap: mark first drift'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'scroll back', input: 'e-tap+swing', win: 'on every logger the earliest segment where the difference from prediction passes tolerance is marked, not a later one',
    fail: 'marking the latest or a later out-of-limit segment so the start of the slow rise is missed, or marking one still inside the limit',
    rule: 'The cursor starts on the newest segment. Swinging the view left moves it back five minutes at a time. Find the oldest segment still over the limit with a good one before it, and tap E there.' },
  rush: 'Checked only the latest reading on each logger and wrote "over" against it.',
  captions: { 'late find': 'logger buzz', 'in limits': 'logger chirp' },
  says: { 'late find': 'The drift started earlier than that. Scroll further back to its first segment over the limit.', 'in limits': 'That segment is still inside the limit.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Damper logger A', prop: 'relayrack' }, { name: 'Deflector logger', prop: 'fieldgen' }, { name: 'Damper logger B', prop: 'fieldgen_damp' }]), r = m.rnd, k = m.calm ? 2 : 2.6;
    m.lg = m.sites.map(() => { const lim = ri(r, 3, 6), F = ri(r, 2, 8), v = []; for (let i = 0; i < N; i++) v.push(+(i < F ? rf(r, 0.2, lim - 0.6) : lim + 0.4 + (i - F) * rf(r, 0.25, 0.5)).toFixed(1)); return { lim, F, v, pos: N - 1 }; });
    const seg = (L) => Math.round(clamp(L.pos, 0, N - 1));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next, L = m.lg[i];
      L.pos = clamp(L.pos - (inp.swing || 0) * k * dt, 0, N - 1);
      if (inp.press) { const g = seg(L); if (L.v[g] <= L.lim) m.fault('in limits'); else if (g > L.F) m.fault('late find'); else { m.ev('drift', { site: i, seg: g }); m.finish(i); return; } }
      s.prog = clamp((N - 1 - L.pos) / (N - 1 - L.F + 0.01) * 0.9, 0, 0.9);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const L = m.lg[i], g = seg(L); return g === L.F ? { at: i, swing: 0, press: f % 3 === 0 } : { at: i, swing: g > L.F ? 1.2 : -1.2 }; };
    m.bad = (f = 0) => ({ at: m.next, swing: 0, press: f % 10 === 0 });
    m.view = () => ({ lg: m.lg.map(L => [L.lim, L.F]) });
    m.panel = (i) => { const L = m.lg[i]; if (!L) return null; const g = seg(L), v = L.v[g], over = v > L.lim; return { label: `T-${(N - 1 - g) * 5} min · Δ from prediction`, value: `${v} (limit ${L.lim}) ${over ? 'OVER' : 'ok'}`, bar: clamp(v / (L.lim * 2)), band: [0, 0.5] }; };
    m.prompt = (i) => { const L = m.lg[i]; return !L ? '' : `Swing your view left to scroll back, right to come forward; tap [E] on the first segment over the limit (now T-${(N - 1 - seg(L)) * 5} min)`; };
    return m;
  },
});
