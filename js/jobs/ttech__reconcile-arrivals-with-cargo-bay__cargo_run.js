// Transporter tech: reconcile the arrivals with the cargo bay. Walk the bay row touching each crate lid. The panel shows the stencil on the
// lid next to the manifest line it should match; misdelivered crates carry stencils that differ by one swapped or changed character. Tap E to
// tick a stencil that matches its line exactly; hold E until the red tag is on for one that does not. Ticking a stencil that does not match
// leaves a crate unaccounted for; tagging a good one sends the chief hunting for a crate that is sitting right there.
import { define, machine, room, ri, shuffle, pick } from './kit.js';

export default define({
  job: { billet: 'ttech', label: 'Reconcile arrivals with cargo bay', type: 'task:cargo_run' },
  title: 'Crate stencil tick-or-tag walk', dept: 'operations', host: 'room', siteName: 'Crate', verb: 'Reconcile',
  how: 'At each crate compare the lid stencil with its manifest line character by character: tap E to tick an exact match, hold E until the red tag is on for any mismatch.',
  keys: ['E tap: tick the line', 'E hold: red-tag the crate'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'tick or tag', input: 'e-tap+e-hold', win: 'every crate stencil in the bay row ticked when it matches its manifest line exactly and red-tagged when it does not',
    fail: 'ticking a stencil that differs from its line, or red-tagging a crate whose stencil matches',
    rule: 'Read the lid stencil against the manifest line one character at a time. Identical: tap E (a quick press). Any swapped or changed character: hold E for a second until RED TAG shows.' },
  rush: 'Counted lids in the bay, got the right number and sent the count.',
  captions: { 'ticked a mismatch': 'warning chirp', 'tagged a good crate': 'error buzz' },
  says: { 'ticked a mismatch': 'That stencil does not match its manifest line: it needed a red tag.', 'tagged a good crate': 'That stencil matches its line exactly: just tick it.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Bay row crate 1', prop: 'crate' }, { name: 'Bay row crate 2', prop: 'pallet_loaded' }, { name: 'Bay row crate 3', prop: 'crate' }, { name: 'Bay row crate 4', prop: 'pallet' }]), r = m.rnd;
    const TAG = m.calm ? 1.1 : 0.9, TAP = 0.3, bad = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, 1 + Math.floor(r() * 2)));
    const code = () => pick(r, ['C', 'K', 'R']) + '-' + Array.from({ length: 4 }, () => ri(r, 1, 9)).join('');
    const twist = (s) => { const a = s.split(''), i = ri(r, 2, 4);
      if (a[i] !== a[i + 1] && r() < 0.6) [a[i], a[i + 1]] = [a[i + 1], a[i]]; else { const j = ri(r, 2, 5); a[j] = String((+a[j] % 9) + 1); }
      return a.join(''); };
    m.cr = m.sites.map((_, i) => { const line = code(); return { line, sten: bad.has(i) ? twist(line) : line, h: 0 }; });
    m.cr.forEach(c => { c.match = c.sten === c.line; });
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, c = m.cr[i];
      if (inp.hold) { c.h += dt; s.prog = Math.min(0.9, c.h / TAG * 0.9); if (c.h >= TAG) { if (c.match) m.fault('tagged a good crate'); c.h = 0; if (m.state === 'play') m.finish(i); } return; }
      if (rel) { if (c.h > 0 && c.h <= TAP) { if (!c.match) m.fault('ticked a mismatch'); if (m.state === 'play') m.finish(i); } c.h = 0; s.prog = 0; }
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const c = m.cr[i]; return { at: i, hold: c.match ? f % 6 === 0 : true }; };
    m.bad = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const c = m.cr[i]; return { at: i, hold: c.match ? true : f % 6 === 0 }; };
    m.view = () => ({ cr: m.cr.map(c => [c.line, c.sten]) });
    m.panel = (i) => { const c = m.cr[i]; return c ? { label: `Lid ${c.sten}  ·  list ${c.line}`, value: c.h > TAP ? (c.h >= TAG ? 'RED TAG' : 'tagging…') : 'tap = tick · hold = tag', bar: Math.min(1, c.h / TAG) } : null; };
    m.prompt = (i) => { const c = m.cr[i]; return !c ? '' : `Stencil ${c.sten} vs manifest ${c.line}: tap [E] if identical, hold [E] to red-tag if not`; };
    return m;
  },
});
