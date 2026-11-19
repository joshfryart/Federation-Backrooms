// CMO: set up triage and isolation in sickbay (medical relief). At each biobed read how far it sits from surgery and from the door, aim at
// the right roll of floor tape and tap E: red within 4 m of surgery, green within 4 m of the door, amber otherwise. Then hold E to bring
// the bed's field up in isolation mode. If the panel settles AMBER the field has not sealed: let go and cycle it again. Release on GREEN.
import { define, machine, room, ri } from './kit.js';

const TAPE = [['RED', 0.25], ['AMBER', 0], ['GREEN', -0.25]];
export default define({
  job: { billet: 'cmo', label: 'Set up triage and isolation in sickbay', type: 'task:medical_relief' },
  title: 'Triage zone tape and isolation field', dept: 'medical', host: 'room', siteName: 'Biobed', verb: 'Set up',
  how: 'Tape each bed\'s zone by its distance (red near surgery, green near the door, amber between) with an aimed E tap, then hold E to raise the isolation field and release only when it reads green.',
  keys: ['Aim + E tap: lay tape', 'E hold: isolation field'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'zone and isolate', input: 'e-tap+e-hold+look', win: 'four biobeds taped to the zone their distance from surgery and door demands, each with its isolation field sealed green',
    fail: 'taping a bed the wrong zone colour, or holding an isolation field that has settled amber',
    rule: 'Panel shows metres to surgery and to the door: within 4 m of surgery red, within 4 m of the door green, else amber. Aim at that tape, tap E. Then hold E: field reads GREEN, let go; AMBER, let go and cycle.' },
  rush: 'Pushed the beds into a row and switched every field on without looking.',
  captions: { 'wrong zone': 'tape torn up', 'amber field left set': 'field hums unevenly' },
  says: { 'wrong zone': 'Wrong zone for that distance — re-tape it.', 'amber field left set': 'The field is amber — let go and cycle it.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [1, 2, 3, 4].map(n => ({ name: `Biobed ${n}`, prop: 'biobed' }))), r = m.rnd;
    const tol = m.calm ? 0.09 : 0.07, chg = m.calm ? 0.8 : 1.0, grace = m.calm ? 1.0 : 0.7;
    m.beds = m.sites.map(() => { const z = ri(r, 0, 2), sur = z === 0 ? ri(r, 1, 4) : ri(r, 5, 11), door = z === 2 ? ri(r, 1, 4) : z === 0 ? ri(r, 8, 14) : ri(r, 5, 10); return { z, sur, door, taped: false, tries: r() < 0.5 ? 1 : 0, f: 0, res: '' }; });
    m.aim = -1;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, b = m.beds[i];
      if (!b.taped) { m.aim = TAPE.findIndex(([, x]) => Math.abs((inp.look || 0) - x) < tol); if (inp.press && m.aim >= 0) { if (m.aim === b.z) { b.taped = true; m.prev = true; } else m.fault('wrong zone'); } s.prog = 0; return; }
      if (inp.hold) { b.f += dt; if (b.f >= chg && !b.res) { b.res = b.tries > 0 ? 'AMBER' : 'GREEN'; } if (b.res === 'AMBER' && b.f > chg + grace) { m.fault('amber field left set'); b.f = chg; } }
      else if (rel) { if (b.res === 'GREEN') { m.finish(i); return; } if (b.res === 'AMBER') b.tries--; b.f = 0; b.res = ''; }
      s.prog = 0.4 + 0.5 * Math.min(1, b.f / chg);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const b = m.beds[i];
      if (!b.taped) return { at: i, look: TAPE[b.z][1], press: f % 2 === 0, hold: f % 2 === 0 };
      return { at: i, hold: !b.res }; };
    m.bad = (f = 0) => { const i = m.next, b = m.beds[i]; return !b.taped ? { at: i, look: TAPE[(b.z + 1) % 3][1], press: f % 4 === 0, hold: f % 4 === 0 } : { at: i, hold: true }; };
    m.view = () => ({ b: m.beds.map(b => [b.sur, b.door, b.tries]) });
    m.panel = (i) => { const b = m.beds[i]; if (!b) return null;
      if (!b.taped) return { label: `Surgery ${b.sur} m · door ${b.door} m`, value: m.aim >= 0 ? `tape: ${TAPE[m.aim][0]}` : 'aim: red (left) · amber · green (right)', bar: 0 };
      return { label: 'Isolation field', value: b.res ? `reads ${b.res}${b.res === 'AMBER' ? ': let go and cycle' : ': let go'}` : b.f > 0 ? 'charging…' : 'hold [E] to raise', bar: Math.min(1, b.f / chg) }; };
    m.prompt = (i) => { const b = m.beds[i]; return !b ? '' : !b.taped ? 'Aim at the tape for this bed\'s zone and tap [E]' : 'Hold [E] to raise the isolation field; release on GREEN, re-cycle on AMBER'; };
    return m;
  },
});
