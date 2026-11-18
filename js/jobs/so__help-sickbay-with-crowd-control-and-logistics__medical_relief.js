// Second officer: help sickbay with crowd control. Stand at the sickbay door and direct each arrival with a look and a tap of E: look right
// into the ward to admit, left to the corridor bench to send them to wait, or straight ahead to hold them at the door. Medics always go in.
// A patient badge goes in only if a bed is free (otherwise hold them until one frees) and only if the name is not on the visitor list: a
// visitor wearing a patient badge goes to the bench. Every wrong direction is a fault.
import { define, machine, room, ri, rf, pick, shuffle } from './kit.js';

const PPL = ['Ens Rhee', 'Lt Abara', 'Mr Teague', 'Ms Ostrova', 'PO Lindqvist', 'Ens Kader', 'Lt Fenwick', 'Ms Iwu', 'Mr Salas', 'Dr Pell'];

export default define({
  job: { billet: 'so', label: 'Help sickbay with crowd control and logistics', type: 'task:medical_relief' },
  title: 'Sickbay door marshal', dept: 'command', host: 'room', siteName: 'Door', verb: 'Marshal',
  how: 'Look right and tap E to admit, left and tap E to send to the bench, or straight ahead and tap E to hold at the door: medics in, patients in only with a free bed, visitors (even on a patient badge) to the bench.',
  keys: ['look right + E: into the ward', 'look left + E: corridor bench', 'look ahead + E: hold at door'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'wave through', input: 'look+e-tap', win: 'every arrival sent the right way by badge, visitor list and free beds, with no visitor on a patient badge let into the ward',
    fail: 'letting a visitor into the ward on a patient badge, admitting a patient to a full ward, or turning a medic away',
    rule: 'Face right (ward), left (bench) or straight (hold) and tap E. Check the badge, then the visitor list; patients need a free bed or they wait at the door.' },
  rush: 'Propped the sickbay door open and let the queue sort itself out.',
  captions: { 'visitor let in': 'ward chatter rises', 'ward overfull': 'medic shouts', 'medic turned away': 'annoyed sigh', 'patient benched': 'groan from the bench', 'needless hold': 'queue shuffles' },
  says: { 'visitor let in': 'That name is on the visitor list: a visitor on a patient badge. Bench, not ward.', 'ward overfull': 'No bed free: hold the patient at the door until one frees.', 'medic turned away': 'Medics always go straight in.', 'patient benched': 'A real patient belongs in the ward or held at the door, not on the bench.', 'needless hold': 'No reason to hold them: send them on.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Sickbay door', prop: 'nursestation' }]), r = m.rnd, walk = m.calm ? 0.5 : 0.35;
    const names = shuffle(r, PPL); m.visitors = new Set();
    const kinds = shuffle(r, ['medic', 'patient', 'patient', 'fake', pick(r, ['visitor', 'patient']), pick(r, ['medic', 'visitor', 'fake'])]);
    m.q = kinds.map((k, i) => { if (k === 'fake' || k === 'visitor') m.visitors.add(names[i]); return { n: names[i], kind: k, badge: k === 'fake' ? 'PATIENT' : k.toUpperCase() }; });
    m.beds = ri(r, 1, 2); m.qi = 0; m.ready = walk; m.freeAt = -1;
    const want = (p) => p.kind === 'medic' ? 'R' : p.kind === 'patient' ? (m.beds > 0 ? 'R' : 'C') : 'L';
    const dir = (look) => look > 0.25 ? 'L' : look < -0.25 ? 'R' : Math.abs(look) < 0.12 ? 'C' : null;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp);
      if (m.freeAt > 0 && m.t >= m.freeAt && !inp.press) { m.beds++; m.freeAt = -1; m.ev('bed'); }
      if (!s || m.t < m.ready || !inp.press) return; const p = m.q[m.qi], d = dir(inp.look || 0), w = want(p); if (!d) return;
      if (d === w) { if (d === 'C') { if (m.freeAt < 0) m.freeAt = m.t + rf(r, 1.2, 2.2); return; } if (d === 'R' && p.kind === 'patient') m.beds--; m.qi++; m.ready = m.t + walk; s.prog = m.qi / m.q.length * 0.95; if (m.qi >= m.q.length) m.finish(0); return; }
      m.fault(d === 'R' ? (p.kind === 'patient' ? 'ward overfull' : 'visitor let in') : d === 'L' ? (p.kind === 'medic' ? 'medic turned away' : 'patient benched') : p.kind === 'medic' ? 'medic turned away' : 'needless hold');
      m.ready = m.t + walk;
    };
    m.hint = (f = 0) => { if (m.next < 0 || m.qi >= m.q.length) return { at: -1 }; const w = want(m.q[m.qi]); return { at: 0, look: w === 'R' ? -0.4 : w === 'L' ? 0.4 : 0, press: f % 2 === 0 }; };
    m.bad = (f = 0) => ({ at: 0, look: -0.4, press: f % 2 === 0 });
    m.view = () => ({ q: m.q.map(p => p.n + ':' + p.kind), beds: m.beds });
    m.panel = () => {
      const p = m.q[m.qi]; if (!p) return { label: 'Door', value: 'queue clear', bar: 1 };
      const listed = m.visitors.has(p.n);
      return { label: `${p.n} · badge ${p.badge}`, value: `visitor list: ${listed ? 'LISTED (visitor)' : 'not listed'} · beds free ${m.beds}${m.t < m.ready ? ' · stepping up…' : ''}`, bar: m.qi / m.q.length };
    };
    m.prompt = () => 'Look right + [E] to admit, left + [E] to the bench, straight ahead + [E] to hold at the door';
    return m;
  },
});
