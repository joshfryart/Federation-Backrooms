// Environmental tech: ventilation check on the cargo bay before loading (cargo run). Carry the atmospheric tricorder to the corridor vent and each
// bay corner. At each one sweep your view slowly across the whole corner: the fume reading follows where the probe points. A stale pocket shows as
// a peak over the fume mark in one direction: tap E while pointing at it to flag it. A corner is only clear once you have swept both sides.
import { define, machine, room, rf, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'env', label: 'Ventilation check on cargo bay before loading', type: 'task:cargo_run' },
  title: 'Corner sweep for stale fume pockets', dept: 'engineering', host: 'room', item: 'tricorder_atmo', siteName: 'Corner', verb: 'Sniff',
  how: 'At each vent and bay corner sweep your view from one side to the other. If the fume reading peaks over the mark, tap E while pointing at the peak to flag it; if both sides are swept and nothing peaks, tap E to clear it.',
  keys: ['look: point the probe', 'E tap: flag the pocket / clear the corner'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'sniff the corners', input: 'e-tap+look', win: 'every bay corner swept side to side, stale fume pockets flagged at their peak and clean corners cleared',
    fail: 'clearing a corner before sweeping both sides of it, or clearing one that holds a fume pocket',
    rule: 'The probe reads where you look. Sweep until both LEFT and RIGHT show swept. Peak over the fume mark: tap E pointing at it. No peak after a full sweep: tap E to clear.' },
  rush: 'Took one sniff in the corridor doorway and passed the whole bay for loading.',
  captions: { unswept: 'tricorder double-beep', 'pocket passed': 'fume alarm chirps' },
  says: { unswept: 'Not swept: you have not covered both sides of this corner yet.', 'pocket passed': 'There is a fume pocket in this corner: find the peak and flag it before passing it.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Corridor vent', prop: 'airlock_doors' }, { name: 'Bay corner fore', prop: 'crate' }, { name: 'Bay corner aft', prop: 'pallet_loaded' }, { name: 'Bay corner far', prop: 'shelving' }]), r = m.rnd;
    const MARK = 0.6, wid = m.calm ? 0.15 : 0.12, pocks = ri(r, 1, 2);
    m.c = m.sites.map(() => ({ a: null, lo: 0, hi: 0, wob: rf(r, 0, 6) }));
    for (let k = 0; k < pocks; k++) { const i = ri(r, 1, 3); m.c[i].a = rf(r, 0.15, 0.38) * (r() < 0.5 ? -1 : 1); }
    m.read = (i, look) => { const c = m.c[i]; return clamp(0.18 + 0.04 * Math.sin(look * 9 + c.wob) + (c.a == null ? 0 : 0.8 * Math.exp(-(((look - c.a) / wid) ** 2)))); };
    m.lk = 0;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, c = m.c[i], L = inp.look || 0; m.lk = L;
      c.lo = Math.min(c.lo, L); c.hi = Math.max(c.hi, L); const swept = c.lo <= -0.35 && c.hi >= 0.35;
      if (inp.press) { if (c.a != null && m.read(i, L) > MARK) m.finish(i); else if (c.a == null && swept) m.finish(i); else m.fault(c.a != null ? 'pocket passed' : 'unswept'); }
      s.prog = s.done ? 1 : clamp((Math.min(0.35, -c.lo) + Math.min(0.35, c.hi)) / 0.7 * 0.9, 0, 0.9);
    };
    m.hint = (f = 0) => {
      const i = m.next; if (i < 0) return { at: -1 }; const c = m.c[i], look = 0.45 * Math.sin(f * 0.07);
      const go = c.a != null ? m.read(i, look) > MARK + 0.05 : c.lo <= -0.35 && c.hi >= 0.35; return { at: i, look, press: go, hold: go };
    };
    m.bad = (f = 0) => ({ at: m.next, look: 0, press: f % 10 === 0, hold: f % 10 < 2 });
    m.view = () => ({ a: m.c.map(c => c.a == null ? null : +c.a.toFixed(3)) });
    m.panel = (i) => { const c = m.c[i]; if (!c) return null; const v = m.read(i, m.lk); return { label: `Fumes ${v > MARK ? '▲ OVER MARK' : '● under mark'}`, value: `swept L ${c.lo <= -0.35 ? '✓' : '·'}  R ${c.hi >= 0.35 ? '✓' : '·'}`, bar: v, band: [0, MARK] }; };
    m.prompt = (i) => { const c = m.c[i]; if (!c) return ''; return c.lo <= -0.35 && c.hi >= 0.35 ? 'Swept both sides: tap [E] on a peak to flag it, or tap [E] to clear' : 'Sweep your view slowly across the whole corner'; };
    return m;
  },
});
