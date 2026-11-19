// Medical technician: sterile field sweep. Each surface of the field has three zones (left, centre, right of where you face it) that must be
// wiped in the fixed pattern on the tray card, top to bottom. Aim the cloth at the named zone and hold E until it reads clean. Wiping a zone
// ahead of its turn drags dirt onto a cleaned one: the field is marked unsterile and that surface starts over.
import { define, machine, room, shuffle, clamp } from './kit.js';

const SURF = [['Biobed rails', 'biobed', ['head rail', 'near rail', 'foot rail']], ['Instrument tray', 'surgical_table', ['hypo row', 'swab row', 'drape edge']],
  ['Exam couch', 'exam_couch', ['headrest', 'side rail', 'footboard']], ['Infusion stand', 'infusion_stand', ['hook', 'pole', 'base']]];
const AIM = [0.34, 0, -0.34], SIDE = ['◀ left', 'centre', 'right ▶'];
export default define({
  job: { billet: 'medtech', label: 'Sterile field sweep and tray check', type: 'loop' },
  title: 'Sterile field pattern wipe', dept: 'medical', host: 'room', siteName: 'Surface', verb: 'Wipe',
  how: 'At each surface aim at the zone the tray card names next and hold E until it reads clean. Follow the card order exactly: wiping a zone early drags dirt back over the clean ones.',
  keys: ['look: aim at the named zone', 'E hold: wipe it'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'pattern wipe', input: 'e-hold+look', win: 'every surface wiped zone by zone in the tray-card order without touching a zone ahead of its turn',
    fail: 'wiping a zone out of the card order so the field is marked unsterile and the surface must be redone',
    rule: 'The panel names the next zone and whether it is left, centre or right. Aim there and hold E to wipe it clean. Holding E on any other unwiped zone for a moment breaks the pattern.' },
  rush: 'Gave the bed one quick swipe and called the field clean.',
  captions: { 'out of order': 'drape rustles, warning chirp' }, says: { 'out of order': 'Out of pattern — that zone was not next. The field is unsterile; start this surface again from the top.' },
  create(seed, opts) {
    const m = machine(this, seed, opts), rr = m.rnd, chosen = shuffle(rr, SURF).slice(0, 3); room(m, chosen.map(([name, prop]) => ({ name, prop })));
    const wipeT = m.calm ? 0.7 : 0.9;
    m.surf = chosen.map(([, , zones]) => ({ zones, order: shuffle(rr, [0, 1, 2]), k: 0, prog: 0, slip: 0 }));
    const zoneAt = (look) => AIM.findIndex(a => Math.abs((look || 0) - a) < 0.13);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, u = m.surf[i];
      if (!inp.hold) { u.slip = 0; return; }
      const z = zoneAt(inp.look), want = u.order[u.k];
      if (z === want) { u.slip = 0; u.prog += dt / wipeT; if (u.prog >= 1) { u.prog = 0; u.k++; if (u.k >= 3) { m.finish(i); return; } } }
      else if (z >= 0 && u.order.indexOf(z) > u.k) { u.slip += dt; if (u.slip > 0.35) { m.fault('out of order'); u.k = 0; u.prog = 0; u.slip = 0; } }
      s.prog = s.done ? 1 : clamp((u.k + u.prog) / 3 * 0.95);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const u = m.surf[i]; return { at: i, hold: true, look: AIM[u.order[u.k]] }; };
    m.bad = () => { const i = m.next; if (i < 0) return { at: -1 }; const u = m.surf[i]; return { at: i, hold: true, look: AIM[u.order[2]] }; };
    m.view = () => ({ s: chosen.map(c => c[0]), o: m.surf.map(u => u.order.join('')) });
    m.panel = (i) => { const u = m.surf[i]; if (!u) return null; if (u.k >= 3) return { label: 'Clean', value: 'done', bar: 1 }; const z = u.order[u.k]; return { label: `Card step ${u.k + 1}/3: ${u.zones[z]}`, value: `${SIDE[z]} · ${Math.round(u.prog * 100)} %`, bar: u.prog }; };
    m.prompt = (i) => { const u = m.surf[i]; if (!u || u.k >= 3) return ''; const z = u.order[u.k]; return `Aim at the ${u.zones[z]} (${SIDE[z]}) and hold [E] to wipe it; only that zone is next`; };
    return m;
  },
});
