// Doc: check cargo manifest for medical supplies. At each crate the stencil is read against the manifest line. A matching crate is opened and its
// drug pallets counted by tapping E once per pallet; hold E to sign the line (received, or short if the pallets ran out early). A misrouted
// crate is rejected with a hold before anything is counted. Counting a misrouted crate, or signing before the pallets are counted, is a fault.
import { define, machine, room, ri, pick, shuffle } from './kit.js';

export default define({
  job: { billet: 'doc', label: 'Check cargo manifest for medical supplies', type: 'task:cargo_run' },
  title: 'Stencil match and pallet count', dept: 'medical', host: 'room', siteName: 'Crate', verb: 'Count',
  how: 'Compare the crate stencil with its manifest line. If it matches, tap E once per pallet until none are left, then hold E to sign. If not, hold E to reject it.',
  keys: ['E tap: count a pallet', 'E hold: sign or reject the line'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'match and count', input: 'e-tap+e-hold', win: 'three crates each stencil-matched to the manifest, their pallets counted one by one and signed, the misrouted one rejected unopened',
    fail: 'counting into a crate that does not match its line, or signing a line before every pallet is counted',
    rule: 'Panel: stencil against manifest line. Same: tap per pallet, hold to sign when none are left. Different: hold to reject at once.' },
  rush: 'Ticked every manifest line received from the crate count on the clip.',
  captions: { 'took misrouted': 'lid thud', 'signed early': 'pen scratch', 'over-count': 'lid thud' },
  says: { 'took misrouted': 'That crate is not on this line: reject it, do not count it.', 'signed early': 'Pallets still uncounted: count them before you sign.', 'over-count': 'No pallet left to count.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Crate A', prop: 'crate' }, { name: 'Crate B', prop: 'crate' }, { name: 'Crate C', prop: 'crate' }]), r = m.rnd;
    const wrong = ri(r, 0, 2), ids = shuffle(r, [11, 23, 34, 47, 52, 68, 75, 81]);
    m.C = m.sites.map((_, i) => { const q = ri(r, 3, 5); return { id: ids[i], line: i === wrong ? ids[i + 3] : ids[i], bad: i === wrong, q, have: r() < 0.4 && i !== wrong ? q - 1 : q, n: 0 }; });
    m.hd = 0; m.lock = -1;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp);
      if (!s) { m.hd = 0; return; } const i = m.next, c = m.C[i];
      if (inp.hold && m.lock !== i) { m.hd += dt; if (m.hd >= 0.5) { m.lock = i; m.hd = 0;
        if (c.bad || c.n >= c.have) { m.ev('sign', { site: i, short: c.n < c.q }); m.finish(i); } else m.fault('signed early'); return; } }
      if (rel) { const tap = m.hd > 0 && m.hd < 0.3 && m.lock !== i; m.hd = 0; if (!inp.hold) m.lock = -1;
        if (tap) { if (c.bad) m.fault('took misrouted'); else if (c.n >= c.have) m.fault('over-count'); else c.n++; } }
      s.prog = s.done ? 1 : (c.n / Math.max(1, c.have)) * 0.8;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const c = m.C[i];
      return { at: i, hold: c.bad || c.n >= c.have ? true : f % 6 < 3 }; };
    m.bad = (f = 0) => ({ at: Math.max(0, m.next), hold: f % 25 < 20 });
    m.view = () => ({ C: m.C.map(c => [c.id, c.line, c.q, c.have]) });
    m.panel = (i) => { const c = m.C[i]; return c ? { label: `stencil ${c.id} / line ${c.line}`, value: c.id !== c.line ? 'MISROUTED' : `${c.n} of ${c.q}, ${c.have - c.n} left`, bar: c.n / c.q } : null; };
    m.prompt = (i) => { const c = m.C[i]; return !c ? '' : c.id !== c.line ? 'Stencil does not match the line: hold [E] to reject' : c.n >= c.have ? 'Pallets all counted: hold [E] to sign the line' : 'Tap [E] once for each pallet'; };
    return m;
  },
});
