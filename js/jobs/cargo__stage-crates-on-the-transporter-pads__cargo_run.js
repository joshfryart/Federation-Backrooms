// Cargo: stage crates on the transporter pads. The pad footprint has three slots across your view: left, centre, right. Each crate on the
// padd has a weight. Look at the slot and tap E to set the crate down: heavy crates go in the centre slot, light ones go on either side.
import { define, machine, room, ri, shuffle } from './kit.js';

const POS = [0.42, 0, -0.42];   // look is + to the left
export default define({
  job: { billet: 'cargo', label: 'Stage crates on the transporter pads', type: 'task:cargo_run' },
  title: 'Heavy to the centre slot', dept: 'services', host: 'room', siteName: 'Pad', verb: 'Stage',
  how: 'Read the next crate on the padd. Look at a footprint slot and tap E to set it down: HEAVY crates in the centre slot, LIGHT ones in a side slot.',
  keys: ['look: aim at a slot', 'E tap: set the crate down'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'place by weight', input: 'e-tap+look',
    win: 'every crate set in the footprint with heavy loads in the centre slot and light ones to the sides, each slot used once',
    fail: 'putting a heavy crate off-centre, a light crate in the centre, or setting one in an occupied slot',
    rule: 'The panel names the next crate and its weight. Aim at the left, centre or right slot of the footprint and tap E. Heavy goes centre; light goes left or right. A slot holds one crate.' },
  rush: 'Dropped the crates on the pad in whatever order they came.',
  captions: { 'off centre': 'pad alarm', 'wasted slot': 'footprint blocked', occupied: 'crate bump' },
  says: { 'off centre': 'A heavy crate off the centre slot would miss the transfer.', 'wasted slot': 'Keep the centre slot for the heavy crate.', occupied: 'That slot already holds a crate.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Pad 1', prop: 'pad' }, { name: 'Pad 2', prop: 'cargo_pad' }]), r = m.rnd;
    m.pads = m.sites.map(() => ({ crates: shuffle(r, [ri(r, 60, 90), ri(r, 5, 20), ri(r, 5, 20)]).map((w, k) => ({ w, id: 'C-' + ri(r, 100, 999) + 'AB'[k % 2] })), used: [0, 0, 0], k: 0 }));
    const slotOf = (look) => { let b = -1; POS.forEach((p, k) => { if (Math.abs(look - p) < 0.17) b = k; }); return b; }, heavy = (c) => c.w > 40;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, p = m.pads[i], c = p.crates[p.k], z = slotOf(inp.look || 0);
      if (inp.press && z >= 0 && c) {
        if (p.used[z]) m.fault('occupied'); else if (heavy(c) && z !== 1) m.fault('off centre'); else if (!heavy(c) && z === 1) m.fault('wasted slot');
        else { p.used[z] = 1; p.k++; if (p.k >= 3) m.finish(i); }
      }
      s.prog = s.done ? 1 : p.k / 3 * 0.95;
    };
    const target = (p) => { const c = p.crates[p.k]; return heavy(c) ? 1 : p.used[0] ? 2 : 0; };
    m.hint = (f = 0) => { const i = m.next; return i < 0 ? { at: -1 } : { at: i, look: POS[target(m.pads[i])], press: f % 5 === 0 }; };
    m.bad = (f = 0) => { const i = m.next, c = m.pads[i].crates[m.pads[i].k]; return { at: i, look: POS[c && heavy(c) ? 0 : 1], press: f % 5 === 0 }; };
    m.view = () => ({ pads: m.pads.map(p => p.crates.map(c => [c.id, c.w])) });
    m.panel = (i) => { const p = m.pads[i], c = p && p.crates[p.k]; return c ? { label: `Crate ${c.id}`, value: `${c.w} kg  ${heavy(c) ? 'HEAVY: centre' : 'light: side'}`, bar: p.k / 3 } : null; };
    m.prompt = () => 'Look at a footprint slot and tap [E]: heavy in the centre, light to a side';
    return m;
  },
});
