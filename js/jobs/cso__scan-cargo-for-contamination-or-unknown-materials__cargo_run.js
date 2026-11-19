// Chief science officer: scan cargo for contamination or unknown materials. At each crate, sweep the handheld reader along the seam by
// turning your view steadily either way: the seam position advances with the speed of the sweep. Where the reader ticks, slow down and tap E
// to swab before the tick passes. Sweeping a ticking spot too fast skips it (a fault, back up); passing it unswabbed misses the leak (a fault).
// At the seam's end compare the swab peaks with the manifest: tap E to clear the crate, or hold E to tag it suspect if any peak differs.
import { define, machine, room, ri, rf, pick, clamp } from './kit.js';

const MAT = ['duranium alloy', 'ration packs', 'medical gel', 'coolant salts', 'polymer sheet', 'seed stock'];
export default define({
  job: { billet: 'cso', label: 'Scan cargo for contamination or unknown materials', type: 'task:cargo_run' },
  title: 'Crate seam sweep and swab', dept: 'sciences', host: 'room', item: 'tricorder_sci', siteName: 'Crate', verb: 'Sweep',
  how: 'Turn your view steadily to run the reader along the crate seam. Where it ticks, slow down and tap E to swab. At the end tap E to clear the crate, or hold E to tag it suspect if a peak does not match the manifest.',
  keys: ['turn view: sweep the seam', 'E tap: swab / clear', 'E hold: tag suspect'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'sweep and swab', input: 'e-tap+e-hold+swing', win: 'every crate seam swept end to end at a reading pace, each ticking spot swabbed, and each crate cleared or tagged against its manifest',
    fail: 'sweeping over a ticking spot too fast, leaving a tick unswabbed, or clearing a crate whose swab disagrees with the manifest',
    rule: 'Turning the view moves the reader along the seam (faster turn, faster sweep). Inside a TICK zone keep the turn slow and tap E to swab. At the end: all peaks match the manifest = tap E; any differ = hold E.' },
  rush: 'Waved the reader over the crate tops and stamped them all clear.',
  captions: { 'rushed past leak': 'reader ticks fade', 'leak missed': 'reader tick lost', 'loaded hazard': 'cargo stamp thud', 'false suspect': 'tag ratchet' },
  says: { 'rushed past leak': 'Too fast over a ticking spot — back up and sweep it slowly.', 'leak missed': 'The reader ticked and you went past — back up and swab it.', 'loaded hazard': 'A swab peak did not match the manifest — that crate is suspect (hold [E]).', 'false suspect': 'Every peak matched the manifest — clear it (tap [E]).' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Crate A-12', prop: 'crate' }, { name: 'Loaded pallet', prop: 'pallet_loaded' }, { name: 'Sealed crate C-3', prop: 'injector_crate' }]), r = m.rnd, slow = m.calm ? 1.3 : 1.0, win = 0.14, k = 0.35;
    m.cr = m.sites.map(() => { const man = pick(r, MAT), n = ri(r, 1, 2), bad = r() < 0.5, pos = n === 1 ? [rf(r, 0.25, 0.8)] : [rf(r, 0.2, 0.45), rf(r, 0.6, 0.85)];
      return { man, s: 0, ph: 0, h: 0, ign: false, spots: pos.map((p, j) => ({ p, sw: false, peak: bad && j === n - 1 ? pick(r, MAT.filter(x => x !== man)) : man })) }; });
    const sus = (c) => c.spots.some(x => x.peak !== c.man);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, c = m.cr[i], sw = Math.abs(inp.swing || 0);
      if (c.ph === 0) {
        c.s = Math.min(1, c.s + sw * k * dt);
        for (const x of c.spots) { if (x.sw) continue; const d = c.s - x.p;
          if (Math.abs(d) < win / 2) { if (sw > slow) { m.fault('rushed past leak'); c.s = x.p - 0.12; } else if (inp.press) x.sw = true; }
          else if (d >= win / 2) { m.fault('leak missed'); c.s = x.p - 0.12; } break; }
        if (c.s >= 1) { c.ph = 1; c.h = 0; c.ign = !!inp.hold; }
      } else {
        if (c.ign) { if (!inp.hold) c.ign = false; }
        else { if (inp.hold) { c.h += dt; if (c.h >= 0.9) { c.h = -99; if (sus(c)) m.finish(i); else m.fault('false suspect'); } }
          if (rel) { if (c.h >= 0 && c.h < 0.35) { if (sus(c)) m.fault('loaded hazard'); else m.finish(i); } c.h = 0; } }
      }
      if (!s.done) s.prog = clamp(c.s * 0.85 + c.ph * 0.1, 0, 0.95);
    };
    const inZone = (c) => c.spots.find(x => !x.sw && Math.abs(c.s - x.p) < win / 2);
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const c = m.cr[i];
      if (c.ph === 0) { const z = inZone(c), t = z && Math.abs(c.s - z.p) < win * 0.3; return { at: i, swing: t ? 0.15 : 0.7, press: !!t, hold: !!t }; }
      if (c.ign) return { at: i }; return sus(c) ? { at: i, hold: c.h >= 0 } : { at: i, hold: f % 4 === 0, press: f % 4 === 0 }; };
    m.bad = () => ({ at: m.next, swing: 2.2 });
    m.view = () => ({ cr: m.cr.map(c => [c.man, c.spots.map(x => [+x.p.toFixed(2), x.peak])]) });
    m.panel = (i) => { const c = m.cr[i]; if (!c) return null; if (c.ph === 1) { const pk = c.spots.map(x => x.peak).join(', '); return { label: `Manifest: ${c.man} · peaks: ${pk}`, value: sus(c) ? 'MISMATCH' : 'all match', bar: Math.max(0, c.h) / 0.9 }; }
      const z = inZone(c); return { label: `Seam ${Math.round(c.s * 100)} % · manifest ${c.man}`, value: z ? 'TICK TICK — slow, swab' : 'quiet', bar: c.s }; };
    m.prompt = (i) => { const c = m.cr[i]; if (!c) return ''; if (c.ph === 1) return sus(c) ? 'A peak differs from the manifest — hold [E] to tag the crate suspect' : 'Peaks match the manifest — tap [E] to clear the crate';
      return inZone(c) ? 'Reader ticking — turn slowly and tap [E] to swab' : 'Turn your view steadily to run the reader along the seam'; };
    return m;
  },
});
