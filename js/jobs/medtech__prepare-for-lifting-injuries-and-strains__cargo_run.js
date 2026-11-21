// Medtech: prepare for lifting injuries. Each bed side has an injury on the dose sheet; tap E to cycle the tray's supports, hold E to fit the
// shown one. A belt on a fracture or a splint on a strain moves the patient on the wrong support.
import { define, machine, room, shuffle } from './kit.js';
const INJ = [['STRAIN, lower back', 'support belt'], ['FRACTURE, forearm', 'splint'], ['STRAIN, shoulder', 'sling'], ['BRUISE, knee', 'cold pack']];

export default define({
  job: { billet: 'medtech', label: 'Prepare for lifting injuries and strains', type: 'task:cargo_run' },
  title: 'Support to injury fit', dept: 'medical', host: 'room', siteName: 'Bed side', verb: 'Fit',
  how: 'At each bed side read the injury. Tap E to cycle the tray supports, then hold E to fit the shown one. Belt for back, sling for shoulder, splint for fracture, cold pack for bruise.',
  keys: ['E tap: next support', 'E hold: fit it'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'cycle and fit', input: 'e-tap+e-hold', win: 'four injuries each fitted with the support that suits the injury type',
    fail: 'fitting a belt, splint, sling or cold pack that does not suit the strain or fracture shown',
    rule: 'Tap E to step through the tray, hold E to fit what is shown. Fractures want a splint, strains a belt or sling by site, bruises a cold pack.' },
  rush: 'Laid the supports out by habit, belts first, and shifted the patient on whichever was nearest.',
  captions: { 'wrong support': 'patient groans' }, says: { 'wrong support': 'Wrong support for that injury. A strain is not a fracture.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [0, 1, 2, 3].map(i => ({ name: `Bed side ${i + 1}`, prop: i % 2 ? 'nursestation' : 'bunk' }))), r = m.rnd;
    m.inj = shuffle(r, INJ); m.tray = shuffle(r, INJ.map(x => x[1])); m.sel = m.inj.map(() => 0); m.h = 0; m.lock = false;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next;
      if (m.li !== i) { m.li = i; m.lock = false; m.h = 0; }
      if (inp.hold && !m.lock) { m.h += dt; if (m.h >= 0.5) { m.lock = true; if (m.tray[m.sel[i]] === m.inj[i][1]) { m.finish(i); m.h = 0; } else { m.fault('wrong support'); m.h = 0; } } }
      if (rel) { if (m.lock) m.lock = false; else if (m.h > 0.01 && m.h < 0.3) m.sel[i] = (m.sel[i] + 1) % m.tray.length; m.h = 0; }
      s.prog = s.done ? 1 : m.h * 1.2;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; return { at: i, hold: m.tray[m.sel[i]] === m.inj[i][1] ? true : f % 2 === 0 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 40 < 20 && m.tray[m.sel[m.next]] !== m.inj[m.next][1] });
    m.view = () => ({ inj: m.inj.map(x => x[0]), tray: m.tray });
    m.panel = (i) => { const j = m.inj[i]; return j ? { label: j[0], value: 'tray: ' + m.tray[m.sel[i]], bar: Math.min(1, m.h * 2) } : null; };
    m.prompt = () => 'Tap [E] to cycle the supports, hold [E] to fit the one shown';
    return m;
  },
});
