// Galley: draw fresh stock from incoming cargo. Each crate lid is levered open with one firm turn of the view (a gentle one does nothing, a wild
// one cracks the contents). Then every item shows its days left: three or more is kept (tap E to bin it in the insulated bin), under three is left
// in the crate (hold E). Binning a rotten item or leaving a good one is a fault.
import { define, machine, room, ri } from './kit.js';

export default define({
  job: { billet: 'galley', label: 'Draw fresh stock from incoming cargo', type: 'task:cargo_run' },
  title: 'Lever the lid and bin the fresh', dept: 'services', host: 'room', siteName: 'Crate', verb: 'Unpack',
  how: 'Lever each lid with one firm sweep of the view (not gentle, not wild). Then for each item: tap E to bin it if it has 3 or more days left, or hold E to leave it if it has fewer.',
  keys: ['turn the view firmly: lever the lid', 'E tap: bin it (3+ days)', 'E hold: leave it (under 3)'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'lever and bin', input: 'turn+e-tap+e-hold', win: 'three crates levered open with a firm sweep and every item binned if it has days left or left if it is going off',
    fail: 'cracking a crate with a wild sweep, binning an item with under three days, or leaving a fresh item to rot in the hold',
    rule: 'A firm sweep of the view pops the lid; too hard cracks it. Then each item shows days left: tap E to bin 3 or more, hold E to leave less than 3.' },
  rush: 'Hauled whole crates onto the trolley without opening them.',
  captions: { cracked: 'crate cracks', 'binned rotten': 'sour smell', 'left good': 'crate lid thud' },
  says: { cracked: 'You wrenched the lid and cracked the contents.', 'binned rotten': 'That item was going off: it should stay in the hold.', 'left good': 'That one was fresh: it should have gone in the bin.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Crate 1', prop: 'crate' }, { name: 'Crate 2', prop: 'crate' }, { name: 'Crate 3', prop: 'crate' }]), r = m.rnd;
    m.C = m.sites.map(() => ({ open: false, k: 0, it: [ri(r, 1, 6), ri(r, 1, 6), ri(r, 1, 6)] })); m.hd = 0; m.ser = 0; m.lock = -1; m.cd = 0;
    const go = (i) => { const c = m.C[i]; c.k++; m.ser++; if (c.k >= 3) m.finish(i); };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); m.cd = Math.max(0, m.cd - dt); if (!s) { m.hd = 0; return; } const i = m.next, c = m.C[i], t = inp.turn || 0;
      if (!c.open) { if (t > 1.8 && m.cd <= 0) { m.fault('cracked'); m.cd = 0.8; } else if (t > 0.9 && t <= 1.8) c.open = true; s.prog = c.open ? 0.3 : 0.05; return; }
      const d = c.it[c.k];
      if (inp.hold && m.lock !== m.ser) { m.hd += dt; if (m.hd >= 0.5) { m.lock = m.ser; m.hd = 0; if (d >= 3) m.fault('left good'); go(i); return; } }
      if (rel) { const tap = m.hd > 0 && m.hd < 0.3 && m.lock !== m.ser; m.hd = 0; if (!inp.hold) m.lock = -1; if (tap) { if (d < 3) m.fault('binned rotten'); go(i); return; } }
      s.prog = s.done ? 1 : 0.3 + c.k * 0.2;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const c = m.C[i]; if (!c.open) return { at: i, turn: 1.3 }; return { at: i, turn: 0, hold: c.it[c.k] < 3 ? true : f % 6 < 3 }; };
    m.bad = () => ({ at: Math.max(0, m.next), turn: 2.5 });
    m.view = () => ({ it: m.C.map(c => c.it.slice()) });
    m.panel = (i) => { const c = m.C[i]; return c ? { label: c.open ? `Item ${c.k + 1} of 3` : 'Lid shut', value: c.open ? `${c.it[Math.min(2, c.k)]} days left` : 'sweep the view firmly', bar: c.k / 3 } : null; };
    m.prompt = (i) => (m.C[i] && m.C[i].open ? 'Tap [E] to bin 3+ days; hold [E] to leave under 3' : 'Sweep the view firmly to lever the lid');
    return m;
  },
});
