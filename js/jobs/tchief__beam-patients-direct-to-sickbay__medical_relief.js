// Transporter chief: beam patients direct to sickbay. Each numbered pad spot is keyed to one sickbay bed and one patient beacon. The
// stretchers wait in a row beside the pad, each with a triage tag clipped on. At each spot, look along the row to read the tags, and hold E
// on the stretcher whose tag beacon is identical to the spot's to set it down there. The tags include transposed look-alikes; a swapped
// patient arrives at the wrong bed.
import { define, machine, room, ri, shuffle, clamp } from './kit.js';

const POS = [0.38, 0, -0.38], SIDE = ['left', 'centre', 'right'];
const bc = (a, b) => `B-${a}${b}`;
export default define({
  job: { billet: 'tchief', label: 'Beam patients direct to sickbay', type: 'task:medical_relief' },
  title: 'Stretcher to its numbered pad spot', dept: 'operations', host: 'room', siteName: 'Pad spot', verb: 'Set',
  how: 'At each pad spot, read its bed and beacon on the panel, then look along the stretcher row to read each triage tag. Hold E on the stretcher whose beacon is identical to set it on the spot.',
  keys: ['look along the row: read a tag', 'E hold: set that stretcher on the spot'], limit: 36, maxFaults: 2,
  fingerprint: { verb: 'set by tag', input: 'e-hold+look', win: 'every patient stretcher set on the pad spot whose bed beacon is character-for-character the one on its triage tag',
    fail: 'setting a stretcher whose tag is a look-alike or transposed beacon onto the spot, so the patient arrives at the wrong bed',
    rule: 'The spot panel names its bed and beacon. Aim at a stretcher (left, centre or right) to read its tag. Hold E for a second on the identical beacon; looking away mid-lift sets nothing.' },
  rush: 'Loaded the stretchers onto the nearest spots and let sickbay sort the beds.',
  captions: { swapped: 'medical alert tone' }, says: { swapped: 'That tag\'s beacon does not match this spot: the patient would arrive at the wrong bed.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [1, 2, 3].map(n => ({ name: `Pad spot ${n}`, prop: 'pad' }))), r = m.rnd, aim = m.calm ? 0.13 : 0.1, lift = m.calm ? 0.8 : 1.0;
    let a = ri(r, 1, 9), b = ri(r, 1, 9); if (a === b) b = b % 9 + 1; let c = ri(r, 1, 9); while (c === a || c === b) c = c % 9 + 1;
    const pairs = shuffle(r, [[a, b], [b, a], [a, c]]);   // two transposed beacons and a near look-alike
    const beds = shuffle(r, [2, 4, 5, 7, 8, 9]).slice(0, 3);
    m.spots = pairs.map((p, k) => ({ bed: beds[k], beacon: bc(p[0], p[1]) }));
    // the row: the three real tags in shuffled order; each placement leaves its slot empty
    m.row = shuffle(r, [0, 1, 2]).map(k => ({ tag: m.spots[k].beacon, placed: false }));
    m.aimed = -1; m.lift = 0; m.last = -1;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, sp = m.spots[i];
      m.aimed = POS.findIndex(p => Math.abs((inp.look || 0) - p) < aim); const st = m.row[m.aimed];
      if (!inp.hold || !st || st.placed || m.aimed !== m.last) { m.lift = 0; m.last = m.aimed; s.prog = 0; return; }
      m.lift += dt; s.prog = clamp(m.lift / lift * 0.9);
      if (m.lift >= lift) { m.lift = 0; if (st.tag === sp.beacon) { st.placed = true; m.finish(i); } else { m.fault('swapped'); m.last = -2; } }
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const k = m.row.findIndex(x => !x.placed && x.tag === m.spots[i].beacon); return { at: i, look: POS[k], hold: true }; };
    m.bad = (f = 0) => { const i = m.next, k = m.row.findIndex(x => !x.placed && x.tag !== m.spots[i].beacon); return { at: i, look: POS[k < 0 ? 0 : k], hold: f % 50 < 45 }; };
    m.view = () => ({ spots: m.spots.map(s => [s.bed, s.beacon]), row: m.row.map(x => x.tag) });
    m.panel = (i) => {
      const sp = m.spots[i]; if (!sp) return null; const st = m.row[m.aimed];
      const tagTxt = !st ? 'look along the stretcher row' : st.placed ? `${SIDE[m.aimed]}: empty` : `${SIDE[m.aimed]} tag ${st.tag}`;
      return { label: `Spot → sickbay bed ${sp.bed} · beacon ${sp.beacon}`, value: tagTxt, bar: m.lift / lift };
    };
    m.prompt = (i) => (m.spots[i] ? `Find the tag reading exactly ${m.spots[i].beacon} and hold [E] to set it on this spot` : '');
    return m;
  },
});
