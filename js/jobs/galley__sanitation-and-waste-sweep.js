// Galley: sanitation and waste sweep. At each low spot something is hidden off to one side and only shows when the view sweeps across it. A
// spill is mopped with a held E (it must stay in view); droppings are only flagged with a quick tap, never mopped. Wiping where nothing shows,
// dabbing a spill, or smearing droppings are faults.
import { define, machine, room, rf, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'galley', label: 'Sanitation and waste sweep', type: 'loop' },
  title: 'Sweep the floor for spills and pests', dept: 'services', host: 'room', siteName: 'Floor spot', verb: 'Sweep',
  how: 'Turn your view slowly across the floor at each spot until something shows. A spill: hold E to mop it. Droppings: tap E once to flag them, never hold.',
  keys: ['look: sweep until it shows', 'E hold: mop a spill', 'E tap: flag droppings'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'spot and mop', input: 'e-tap+e-hold+look', win: 'three floor spots swept by eye, every spill mopped dry with a held stroke and every pest dropping flagged with a single tap',
    fail: 'wiping where nothing shows, dabbing a spill with a tap, or mopping droppings and smearing them',
    rule: 'The hidden mess shows only when your view is on it. SPILL: hold E until the floor is dry. DROPPINGS: one quick tap of E. Anything else is wasted effort and noted.' },
  rush: 'Wiped the counters and walked the floor without looking under the tables.',
  captions: { 'wiped nothing': 'cloth squeak', dabbed: 'wet slap', smeared: 'cloth squeak' },
  says: { 'wiped nothing': 'You wiped clean floor: look for the mess first.', dabbed: 'A spill needs a held mop stroke, not a dab.', smeared: 'You smeared the droppings: tap to flag, never wipe.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Table 1 floor', prop: 'console' }, { name: 'Table 2 floor', prop: 'locker' }, { name: 'Corner by the bins', prop: 'shelving' }]), r = m.rnd;
    const kinds = shuffle(r, [true, false, r() < 0.5]);
    m.W = m.sites.map((_, i) => ({ y: (r() < 0.5 ? -1 : 1) * rf(r, 0.25, 0.4), spill: kinds[i], hd: 0, seen: false }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, w = m.W[i], sp = Math.abs((inp.look || 0) - w.y) < 0.15;
      if (inp.hold) { w.hd += dt; w.seen = w.seen || sp;
        if (sp && w.spill && w.hd >= 1.0) { w.hd = 0; w.seen = false; m.finish(i); return; }
        if (sp && !w.spill && w.hd >= 0.55) { w.hd = 0; w.seen = false; m.fault('smeared'); return; } }
      if (rel && w.hd > 0) { const tap = w.hd < 0.3, saw = w.seen; w.hd = 0; w.seen = false;
        if (!saw) m.fault('wiped nothing'); else if (tap && w.spill) m.fault('dabbed'); else if (tap) m.finish(i); }
      s.prog = s.done ? 1 : sp ? 0.5 + Math.min(0.4, w.hd * 0.4) : 0.1;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const w = m.W[i]; return { at: i, look: w.y, hold: w.spill ? true : f % 6 < 3 }; };
    m.bad = (f = 0) => ({ at: Math.max(0, m.next), look: 0, hold: f % 10 < 4 });
    m.view = () => ({ W: m.W.map(w => [+w.y.toFixed(2), w.spill]) });
    m.panel = (i) => { const w = m.W[i], inp = m.W[i]; return w ? { label: 'Floor scan', value: w.seen ? (w.spill ? 'SPILL' : 'DROPPINGS') : 'sweep your view...', bar: w.hd > 0 && w.spill ? clamp(w.hd) : 0 } : null; };
    m.prompt = (i) => 'Sweep the view across the floor; spill: hold [E] to mop; droppings: tap [E] once';
    return m;
  },
});
