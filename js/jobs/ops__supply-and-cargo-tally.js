// Ops: supply and cargo tally. Count the critical spares off the shelf, not off last week's sheet: aim the view at each item in turn, left to
// right, and tap E as you point at it. Pointing at the same item twice, at an empty gap, or jumping past an item spoils the count. When every
// item on a shelf has been pointed at, the count is compared with the manifest copy and any shortage is flagged for the quartermaster.
import { define, machine, room, ri, rf, pick, clamp } from './kit.js';

const PARTS = ['isolinear chips', 'relay cards', 'EPS couplers', 'plasma seals', 'gel packs', 'field coils', 'phase inducers', 'duranium bolts'];

export default define({
  job: { billet: 'ops', label: 'Supply and cargo tally', type: 'loop' },
  title: 'Point-and-recite shelf count', dept: 'operations', host: 'room', item: 'padd', siteName: 'Shelf', verb: 'Count',
  how: 'At each shelf aim your view at each spare in turn, left to right, and tap E as you point at it. Every item once, no gaps, no skipping; the count is then checked against the manifest.',
  keys: ['look: point at the next item', 'E tap: say its number'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'point and recite', input: 'e-tap+look', win: 'every spare on every shelf pointed at exactly once in left-to-right order so the shelf count is true',
    fail: 'pointing at an empty gap, counting an item twice, or jumping past an item so the tally copies a wrong number',
    rule: 'The items sit at fixed bearings along the shelf. Turn to the leftmost uncounted one and tap E; repeat to the right end. Taps off an item, on a counted one or past the next one are faults.' },
  rush: 'Copied last week\'s numbers onto the tally sheet.',
  captions: { 'double count': 'quartermaster tuts', 'empty gap': 'pen taps the shelf', skipped: 'count stumbles' },
  says: { 'double count': 'That one is already counted — move on to the next item.', 'empty gap': 'Nothing there — point at an item before you say its number.', skipped: 'You jumped past one. Count them in order, left to right.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Spares shelf A', prop: 'shelving' }, { name: 'Spares shelf B', prop: 'drawers' }, { name: 'Spares shelf C', prop: 'shelving' }]), r = m.rnd, tol = m.calm ? 0.09 : 0.065;
    m.shelves = m.sites.map(() => { const n = ri(r, 4, 6), at = Array.from({ length: n }, (_, k) => +(0.42 - k * 0.84 / (n - 1) + rf(r, -0.02, 0.02)).toFixed(3)); return { part: pick(r, PARTS), at, n, got: 0, man: n + ri(r, -1, 1), last: n + ri(r, 1, 2) }; });
    m.flags = [];
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, h = m.shelves[i];
      if (inp.press) {
        const look = inp.look || 0, k = h.at.findIndex(a => Math.abs(a - look) < tol);
        if (k < 0) m.fault('empty gap'); else if (k < h.got) m.fault('double count'); else if (k > h.got) m.fault('skipped');
        else { h.got++; m.ev('count', { site: i, n: h.got }); if (h.got >= h.n) { if (h.n !== h.man) m.flags.push([i, h.n - h.man]); m.finish(i); return; } }
      }
      s.prog = clamp(h.got / h.n) * 0.95;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const h = m.shelves[i]; return { at: i, look: h.at[h.got], press: f % 3 === 0 }; };
    m.bad = (f = 0) => ({ at: m.next, look: 0.6, press: f % 3 === 0 });
    m.view = () => ({ shelves: m.shelves.map(h => [h.part, h.n, h.man, h.at]) });
    m.panel = (i) => { const h = m.shelves[i]; return h ? { label: h.part, value: `counted ${h.got} · manifest ${h.man} · last week ${h.last}`, bar: h.got / h.n } : null; };
    m.prompt = (i) => { const h = m.shelves[i]; return !h ? '' : h.got ? `Point at item ${h.got + 1} (next to the right) and tap [E]` : 'Point at the leftmost spare and tap [E] to say "one"'; };
    return m;
  },
});
