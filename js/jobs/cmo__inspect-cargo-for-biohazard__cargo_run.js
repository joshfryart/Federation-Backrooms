// CMO: inspect cargo for biohazard (cargo run). Unseal each crate and run the biohazard wand along its seam: hold E and turn your view
// slowly from one end of the seam to the other; the tone climbs as the wand nears a leak. A leaking crate: let go right on the leak to tag
// it yellow. A sound crate: carry the wand the full length of the seam, then let go to pass it. Sweeping too fast skips the seam.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'cmo', label: 'Inspect cargo for biohazard', type: 'task:cargo_run' },
  title: 'Biohazard wand seam sweep', dept: 'medical', host: 'room', siteName: 'Crate', verb: 'Wand',
  how: 'Hold E and turn slowly along each crate seam with the biohazard wand; let go on the leak if the tone crosses the line, or at the far end of the seam if it never does.',
  keys: ['E hold: wand on the seam', 'Turn slowly along it'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'wand the seams', input: 'e-hold+look+turn', win: 'every crate swept end to end at a slow pace, leaks tagged where the tone crossed the line and sound crates passed',
    fail: 'sweeping too fast, letting go off the leak, or passing a crate before the whole seam is covered',
    rule: 'Hold E and turn steadily along the seam, under the speed limit. Tone over the line marks a leak: let go there to tag it. If the tone never crosses, sweep from end to end and let go to pass the crate.' },
  rush: 'Sniffed the crate lids, felt nothing and signed the manifest.',
  captions: { 'swept too fast': 'wand tone stutters', 'leak missed': 'air sensor alarm', 'seam unchecked': 'manifest line blank' },
  says: { 'swept too fast': 'Too fast — the wand skipped part of the seam.', 'leak missed': 'The tone peaked elsewhere: that is not the leak.', 'seam unchecked': 'Cover the whole seam before you pass the crate.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Crate A', prop: 'crate' }, { name: 'Crate B', prop: 'crate' }, { name: 'Crate C', prop: 'crate' }]), r = m.rnd;
    const vmax = m.calm ? 1.5 : 1.2, tol = m.calm ? 0.08 : 0.06, END = 0.36;
    m.cr = m.sites.map(() => ({ leak: r() < 0.6 ? rf(r, -0.3, 0.3) : null, lo: 9, hi: -9, base: rf(r, 0.1, 0.25) }));
    if (m.cr.every(c => c.leak == null)) m.cr[0].leak = rf(r, -0.3, 0.3); if (m.cr.every(c => c.leak != null)) m.cr[2].leak = null;
    m.cool = 0; m.look = 0; m.hl = null;
    const tone = (c, x) => clamp(c.base + (c.leak == null ? 0.12 * Math.sin(x * 23) : 0.95 * Math.max(0, 1 - Math.abs(x - c.leak) / 0.22) ** 2));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, c = m.cr[i], x = inp.look || 0; m.look = x;
      m.cool = Math.max(0, m.cool - dt);
      if (inp.hold) { if ((inp.turn || 0) > vmax) { if (m.cool <= 0) { m.cool = 0.5; m.fault('swept too fast'); c.lo = 9; c.hi = -9; } } else { c.lo = Math.min(c.lo, x); c.hi = Math.max(c.hi, x); } }
      else if (rel) {
        if (c.leak != null) { if (Math.abs(x - c.leak) <= tol && c.hi >= c.leak - 0.02 && c.lo <= c.leak + 0.02) { m.finish(i); m.hl = null; return; } m.fault('leak missed'); }
        else { if (c.lo <= -END && c.hi >= END) { m.finish(i); m.hl = null; return; } m.fault('seam unchecked'); }
        c.lo = 9; c.hi = -9;
      }
      s.prog = c.hi > c.lo ? clamp((c.hi - c.lo) / (2 * END)) * 0.9 : 0;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const c = m.cr[i];
      if (m.hl == null) m.hl = 0.4; const stop = c.leak != null ? c.leak : -0.4;
      if (m.hl - stop > 0.012) { m.hl -= 0.5 / 30; return { at: i, hold: true, look: m.hl, turn: 0.5 }; }
      return { at: i, hold: false, look: c.leak != null ? c.leak : m.hl, turn: 0 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: true, look: Math.sin(f / 5) * 0.4, turn: 3 });
    m.view = () => ({ c: m.cr.map(c => c.leak == null ? null : +c.leak.toFixed(3)) });
    m.panel = (i) => { const c = m.cr[i]; if (!c) return null; const t = tone(c, m.look);
      return { label: t > 0.8 ? 'TONE OVER THE LINE: leak' : 'Wand tone', value: `${Math.round(t * 100)} · seam covered ${Math.round(clamp((c.hi - c.lo) / (2 * END)) * 100)} %`, bar: t, band: [0.8, 1] }; };
    m.prompt = () => 'Hold [E] and turn slowly along the seam; let go on the leak, or at the far end if the tone never crosses the line';
    return m;
  },
});
