// Medical technician: carry samples to the lab. The tubes ride in the transport case, so turn steadily: a sharp spin of the view shakes the
// case. At each analyser tray the four slots are labelled with chart IDs that differ by a swapped digit or two. Aim at the slot whose chart
// ID matches the tube in hand and tap E to seat it; a tube offered to the wrong ID is rejected by the analyser.
import { define, machine, room, ri, shuffle, clamp } from './kit.js';

const AIM = [0.36, 0.12, -0.12, -0.36];
export default define({
  job: { billet: 'medtech', label: 'Carry samples to the lab', type: 'loop' },
  title: 'Sample tube to matching chart slot', dept: 'medical', host: 'room', siteName: 'Analyser tray', verb: 'Load',
  how: 'Carry the case steadily (no sharp turns). At each analyser tray, read the ID on the tube in hand, aim at the slot with the same chart ID and tap E to seat it.',
  keys: ['look: aim at a slot', 'E tap: seat the tube', 'turn gently while carrying'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'match the ID', input: 'e-tap+look+turn', win: 'every sample tube seated in the analyser slot whose chart ID matches its label, carried without shaking the case',
    fail: 'seating a tube against a look-alike chart ID, or whipping the view round so the case shakes',
    rule: 'The panel shows the tube ID and the four slot IDs left to right. Aim at the slot with exactly the same ID and tap E. Turning faster than a brisk walk shakes the case.' },
  rush: 'Dropped the tubes in the tray in whatever order they came out.',
  captions: { 'wrong ID': 'analyser reject buzz', jostled: 'tubes rattle' }, says: { 'wrong ID': 'Rejected — that slot\'s chart ID is not this tube. Read every digit.', jostled: 'The case jolted. Keep it level and turn gently.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Analyser tray A', prop: 'labbench' }, { name: 'Analyser tray B', prop: 'samplefridge' }]), r = m.rnd;
    const fast = m.calm ? 4.2 : 3.4, perm = (s) => { const a = s.split(''), i = ri(r, 0, 2); [a[i], a[i + 1]] = [a[i + 1], a[i]]; return a.join(''); };
    m.trays = m.sites.map(() => {
      const L = String.fromCharCode(65 + ri(r, 0, 25)); let base = String(ri(r, 1000, 9999)); while (new Set(base).size < 4) base = String(ri(r, 1000, 9999));
      const ids = [base]; while (ids.length < 4) { const v = perm(ids[ri(r, 0, ids.length - 1)]); if (!ids.includes(v)) ids.push(v); }
      const slots = shuffle(r, ids).map(x => `${L}-${x}`); return { slots, tubes: shuffle(r, slots).slice(0, 3), k: 0, filled: [] };
    });
    m.shake = 0;
    const slotAt = (look) => AIM.findIndex(a => Math.abs((look || 0) - a) < 0.1);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return;
      if ((inp.turn || 0) > fast) { m.shake += dt; if (m.shake > 0.25) { m.fault('jostled'); m.shake = 0; } } else m.shake = Math.max(0, m.shake - dt);
      const s = m.cur(inp); if (!s) return; const i = m.next, t = m.trays[i];
      if (inp.press) { const z = slotAt(inp.look); if (z >= 0 && !t.filled.includes(z)) { if (t.slots[z] === t.tubes[t.k]) { t.filled.push(z); t.k++; if (t.k >= 3) { m.finish(i); return; } } else m.fault('wrong ID'); } }
      s.prog = s.done ? 1 : clamp(t.k / 3 * 0.95);
    };
    const want = () => { const t = m.trays[m.next]; return t ? t.slots.indexOf(t.tubes[t.k]) : -1; };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; return { at: i, look: AIM[want()], press: f % 6 === 0, turn: 0 }; };
    m.bad = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const t = m.trays[i], w = want(), z = [0, 1, 2, 3].find(k => k !== w && !t.filled.includes(k)); return { at: i, look: AIM[z], press: f % 6 === 0, turn: 0 }; };
    m.view = () => ({ t: m.trays.map(t => t.slots.join(',') + '|' + t.tubes.join(',')) });
    m.panel = (i) => { const t = m.trays[i]; if (!t) return null; if (t.k >= 3) return { label: 'Tray loaded', value: 'done', bar: 1 };
      return { label: `Tube ${t.tubes[t.k]} (${t.k + 1}/3)`, value: t.slots.map((x, k) => t.filled.includes(k) ? '[full]' : x.slice(2)).join(' · '), bar: t.k / 3 }; };
    m.prompt = (i) => { const t = m.trays[i]; return !t || t.k >= 3 ? '' : `Find chart ID ${t.tubes[t.k]} among the slots (left to right), aim at it and tap [E]`; };
    return m;
  },
});
