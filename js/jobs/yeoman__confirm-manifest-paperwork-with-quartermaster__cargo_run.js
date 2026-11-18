// Yeoman: confirm the manifest paperwork with the Quartermaster. Walk the cargo floor with the manifest. At each stack the next manifest line
// names a crate number; the stack holds several crates whose stencilled numbers differ by a transposed or swapped figure. Look along the stack
// until the crate under your eye carries exactly the manifest number, then tap E to tick the line. Ticking a near-miss number is the paperwork
// error that holds up the handover.
import { define, machine, room, ri, shuffle, pick, clamp } from './kit.js';

const AIM = [-0.42, -0.14, 0.14, 0.42];
const mutate = (r, s) => { const a = s.split(''), i = ri(r, 0, 2); [a[i], a[i + 1]] = [a[i + 1], a[i]]; if (a.join('') === s) a[i] = String((+a[i] + ri(r, 1, 8)) % 10); return a.join(''); };

export default define({
  job: { billet: 'yeoman', label: 'Confirm manifest paperwork with Quartermaster', type: 'task:cargo_run' },
  title: 'Eye the stencils against the manifest line', dept: 'command', host: 'room', item: 'padd', siteName: 'Stack', verb: 'Tick',
  how: 'At each stack, turn your view along the crates: the panel reads the stencil of the crate you are looking at. Tap E only when it is exactly the number on the manifest line.',
  keys: ['look along the stack', 'E tap: tick the line'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'eye-match stencils', input: 'e-tap+look', win: 'every manifest line ticked against the one crate in its stack whose stencil reads the same figures in the same order',
    fail: 'ticking a crate whose number has two figures swapped or one figure off',
    rule: 'Turn your view across the stack; the panel shows the stencil under your eye beside the manifest number. Compare figure by figure and tap E only on an exact match.' },
  rush: 'Counted heads of crates and signed the total.',
  captions: { mismatch: 'Quartermaster clears throat', 'no crate': 'pen taps the padd' },
  says: { mismatch: 'Wrong crate: two figures differ from the manifest line. The QM will hold the handover.', 'no crate': 'Look at a crate first: turn until a stencil is under your eye.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Stack A', prop: 'crate' }, { name: 'Stack B', prop: 'pallet_loaded' }, { name: 'Stack C', prop: 'pallet' }, { name: 'Stack D', prop: 'crate' }]), r = m.rnd;
    const tol = m.calm ? 0.12 : 0.09;
    m.st = m.sites.map(() => { const num = String(ri(r, 1000, 9899)), slots = shuffle(r, [0, 1, 2, 3]), crates = AIM.map(() => '');
      crates[slots[0]] = num; for (let k = 1; k < 4; k++) { let d; do { d = mutate(r, num); } while (d === num || crates.includes(d)); crates[slots[k]] = d; }
      return { num, crates, ok: slots[0], units: pick(r, [4, 6, 8, 12]) }; });
    const eye = (look) => { let b = -1; AIM.forEach((a, k) => { if (Math.abs((look || 0) - a) < tol) b = k; }); return b; };
    m.look = 0;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, u = m.st[i], k = eye(inp.look); m.look = inp.look || 0;
      if (inp.press) { if (k < 0) m.fault('no crate'); else if (k !== u.ok) m.fault('mismatch'); else { m.finish(i); return; } }
      s.prog = k >= 0 ? 0.3 : 0.1;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; return { at: i, look: AIM[m.st[i].ok], press: f % 4 === 3 }; };
    m.bad = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const u = m.st[i]; return { at: i, look: AIM[(u.ok + 1) % 4], press: f % 4 === 3 }; };
    m.view = () => ({ st: m.st.map(u => [u.num, u.crates]) });
    m.panel = (i) => { const u = m.st[i]; if (!u) return null; const k = eye(m.look); return { label: `Manifest: crate ${u.num} · ${u.units} units`, value: k < 0 ? 'between crates' : `stencil ${u.crates[k]}`, bar: clamp(i / m.sites.length) }; };
    m.prompt = (i) => (m.st[i] ? `Find crate ${m.st[i].num}: turn along the stack, tap [E] on the exact stencil` : '');
    return m;
  },
});
