// Pilot: ready the casualty shuttle with biobeds. An unlocked leg looks exactly like a locked one; the only way to find it is to rock the
// bed. Grip the rail at the middle (aim straight ahead) and hold E: after a moment the bed leans toward any loose leg. Let go, aim at that leg
// and tap E to clamp it, then rock again. When a rock comes back STEADY, let go and the bed is passed. Clamping a leg that is already locked
// (or bare frame) is a fault, because you were guessing instead of rocking.
import { define, machine, room, ri, shuffle } from './kit.js';

const LEGS = ['head-port', 'foot-port', 'foot-starboard', 'head-starboard'];

export default define({
  job: { billet: 'pilot', label: 'Ready casualty shuttle with biobeds', type: 'task:medical_relief' },
  title: 'Rock the bed, clamp the loose leg', dept: 'flight', host: 'room', siteName: 'Bed', verb: 'Rock',
  how: 'Aim at the middle of the bed and hold E to rock it: it leans toward a loose leg. Let go, aim at that leg and tap E to clamp it. Rock again; when the bed stays STEADY, let go.',
  keys: ['E hold (aim centre): rock', 'E tap (aim at leg): clamp'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'rock and clamp', input: 'e-hold+e-tap+look',
    win: 'each biobed rocked until it comes back steady, with every loose leg found by its lean and clamped',
    fail: 'clamping legs by guesswork (a locked leg or bare frame), so the real loose leg stays free to tip the bed',
    rule: 'Hold E with your aim on the bed centre to rock it and read which leg it leans to; tap E aimed at that leg to clamp it; a steady rock passes the bed.' },
  rush: 'Unfolded the beds and pushed each leg with a foot in passing.',
  captions: { 'wrong leg': 'clamp clacks on a locked stop', rock: 'bed creaks' },
  says: { 'wrong leg': 'That leg was already locked. Rock the bed first and clamp the one it leans to.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Port biobed', prop: 'biobed' }, { name: 'Starboard biobed', prop: 'exam_couch' }, { name: 'Rear stretcher bed', prop: 'shuttle' }]), r = m.rnd;
    const tol = m.calm ? 0.09 : 0.07, ROCK = m.calm ? 0.5 : 0.6, AT = [0.42, 0.2, -0.2, -0.42];
    m.beds = m.sites.map(() => { const loose = shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 1, 2)); return { loose: [0, 1, 2, 3].map(k => loose.includes(k)), rockT: 0, shows: null }; });
    const legAt = (look) => AT.findIndex(a => Math.abs(look - a) < tol);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, b = m.beds[i], look = inp.look || 0; m.look = look;
      if (inp.press) { const k = legAt(look); if (k >= 0 || Math.abs(look) > 0.1) { if (k >= 0 && b.loose[k]) { b.loose[k] = false; b.shows = null; m.ev('clamped', { site: i, k }); } else m.fault('wrong leg'); } }
      if (inp.hold && Math.abs(look) <= 0.1) { b.rockT += dt; if (b.rockT >= ROCK && b.shows == null) { const k = b.loose.indexOf(true); b.shows = k < 0 ? 'STEADY' : k; m.ev('rock', { site: i }); } }
      if (rel) { if (b.shows === 'STEADY') { m.finish(i); return; } b.rockT = 0; }
      s.prog = s.done ? 1 : (4 - b.loose.filter(Boolean).length) / 4 * 0.9;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const b = m.beds[i];
      if (b.shows == null) return { at: i, hold: true, look: 0 };
      if (b.shows === 'STEADY') return { at: i, hold: false, look: 0 };
      if (m.prev) return { at: i, hold: false, look: 0 };
      return { at: i, hold: true, press: true, look: AT[b.shows] }; };
    m.bad = (f = 0) => { const b = m.beds[m.next], k = b ? b.loose.indexOf(false) : 0; return { at: m.next, hold: f % 3 === 0, press: f % 3 === 0, look: AT[Math.max(0, k)] }; };
    m.view = () => ({ loose: m.beds.map(b => b.loose.map(Number).join('')) });
    m.panel = (i) => { const b = m.beds[i]; if (!b) return null; const k = legAt(m.look || 0);
      return { label: b.shows === 'STEADY' ? 'STEADY' : b.shows != null ? `Leans to ${LEGS[b.shows]}` : 'Rock', value: k >= 0 ? `aim: ${LEGS[k]} leg` : Math.abs(m.look || 0) <= 0.1 ? 'aim: bed centre' : 'aim: frame', bar: Math.min(1, b.rockT / ROCK) }; };
    m.prompt = (i) => { const b = m.beds[i]; if (!b) return ''; return b.shows === 'STEADY' ? 'Steady: let go of [E]' : b.shows != null ? `Aim at the ${LEGS[b.shows]} leg and tap [E] to clamp it` : 'Aim at the bed centre and hold [E] to rock it'; };
    return m;
  },
});
