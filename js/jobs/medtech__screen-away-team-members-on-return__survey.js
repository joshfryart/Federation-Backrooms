// Medical technician: screen away-team members on return. Each returning crew member is checked at boots, hands and hair: aim the
// contamination sensor at a zone and hold E steady until the reading settles. A zone that settles AMBER gets a swab (a single tap of E on it)
// for the lab. Swabbing a zone that read clear holds a healthy crew member back and wastes a swab kit.
import { define, machine, room, ri, shuffle, clamp } from './kit.js';

const Z = ['boots', 'hands', 'hair'], AIM = [-0.3, 0, 0.3], SIDE = ['right ▶', 'centre', '◀ left'];
const TEAM = ['Lt Reyes', 'Ensign Kaur', 'Crewman Brandt', 'Lt Tamsin', 'Ensign Mbeki', 'Specialist Orr'];
export default define({
  job: { billet: 'medtech', label: 'Screen away-team members on return', type: 'task:survey' },
  title: 'Settle, read and swab amber', dept: 'medical', host: 'room', item: 'tricorder_med', siteName: 'Returning crew', verb: 'Screen',
  how: 'For each returning crew member, aim the sensor at boots, hands and hair and hold E until each reading settles. Tap E once on any zone that settles AMBER to swab it. Never swab a clear zone.',
  keys: ['look: aim at a zone', 'E hold: let the reading settle', 'E tap on AMBER: swab'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'settle and swab', input: 'e-hold+e-tap+look', win: 'every returning crew member read clear or amber at boots, hands and hair with a swab taken from each amber zone and none from clear ones',
    fail: 'swabbing a zone that settled clear, holding a healthy crew member back for nothing',
    rule: 'Aim at a zone and keep E held for most of a second: it settles CLEAR or AMBER. Release, then tap E once while aimed at an AMBER zone to bag a swab. A person is cleared once all three zones are read and every amber swabbed.' },
  rush: 'Waved the sensor once over the whole group at the door.',
  captions: { 'needless swab': 'swab packet tears' }, says: { 'needless swab': 'That zone read clear — no swab needed. You have held a healthy crew member back.' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, who = shuffle(r, TEAM).slice(0, 3); room(m, [{ name: who[0], prop: 'airlock_doors' }, { name: who[1], prop: 'biobed' }, { name: who[2], prop: 'exam_couch' }]);
    const dwell = m.calm ? 0.55 : 0.7;
    m.p = who.map(() => { const n = ri(r, 0, 2), amb = new Set(shuffle(r, [0, 1, 2]).slice(0, Math.min(n, 2))); return { amber: [0, 1, 2].map(k => amb.has(k)), read: [false, false, false], swab: [false, false, false], d: 0, z: -1 }; });
    const zoneAt = (look) => AIM.findIndex(a => Math.abs((look || 0) - a) < 0.12);
    const clear = (u) => u.read.every(Boolean) && u.amber.every((a, k) => !a || u.swab[k]);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, u = m.p[i], z = zoneAt(inp.look);
      if (z !== u.z) { u.z = z; u.d = 0; }
      if (z >= 0 && inp.press && u.read[z]) { if (!u.amber[z]) m.fault('needless swab'); else u.swab[z] = true; }
      else if (z >= 0 && inp.hold && !u.read[z]) { u.d += dt; if (u.d >= dwell) { u.read[z] = true; u.d = 0; } }
      if (clear(u)) { m.finish(i); return; }
      s.prog = clamp((u.read.filter(Boolean).length + u.swab.filter(Boolean).length) / (3 + u.amber.filter(Boolean).length) * 0.95);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const u = m.p[i], z = [0, 1, 2].find(k => !u.read[k] || (u.amber[k] && !u.swab[k]));
      return !u.read[z] ? { at: i, look: AIM[z], hold: true } : { at: i, look: AIM[z], hold: f % 6 === 0, press: f % 6 === 0 }; };
    m.bad = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const u = m.p[i], z = u.amber.findIndex(a => !a);
      return !u.read[z] ? { at: i, look: AIM[z], hold: true } : { at: i, look: AIM[z], hold: f % 6 === 0, press: f % 6 === 0 }; };
    m.view = () => ({ who, a: m.p.map(u => u.amber.map(Number).join('')) });
    m.panel = (i) => { const u = m.p[i]; if (!u) return null; const z = u.z;
      const line = Z.map((n, k) => `${n} ${u.read[k] ? (u.amber[k] ? (u.swab[k] ? 'AMBER✚swab' : 'AMBER▲') : 'clear') : '?'}`).join(' · ');
      return { label: z >= 0 ? `Aimed: ${Z[z]}${u.read[z] ? '' : ' (settling)'}` : 'Aim: boots ▶ · hands centre · ◀ hair', value: line, bar: z >= 0 && !u.read[z] ? clamp(u.d / dwell) : u.read.filter(Boolean).length / 3 }; };
    m.prompt = (i) => { const u = m.p[i]; if (!u) return ''; const z = u.z; return z >= 0 && u.read[z] && u.amber[z] && !u.swab[z] ? `AMBER at the ${Z[z]}: tap [E] once to take a swab` : `Aim at boots (${SIDE[0]}), hands (${SIDE[1]}) or hair (${SIDE[2]}) and hold [E] until it settles`; };
    return m;
  },
});
