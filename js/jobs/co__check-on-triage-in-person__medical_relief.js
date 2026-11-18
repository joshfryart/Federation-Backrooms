// Captain: check on triage in person. At each bed look right at the triage tag clipped to the frame, then left at the patient's face and
// breathing, long enough to read each. Then judge: a quick tap of E means the tag fits what you see; holding E for a second calls a
// re-triage (the patient looks worse than the tag). Judging before you have looked at the patient, or judging wrong, is a fault.
import { define, machine, room, ri, shuffle, pick, clamp } from './kit.js';

const TAG = ['GREEN ●', 'YELLOW ▲', 'RED ■'];
const LOOK = [['pink, breathing easy, talking', 'flushed, steady breathing'], ['pale, wincing, breathing quick', 'sweating, guarding the wound'], ['grey, laboured breathing, drowsy', 'blue lips, shallow gasps']];

export default define({
  job: { billet: 'co', label: 'Check on triage in person', type: 'task:medical_relief' },
  title: 'Bedside tag versus patient check', dept: 'command', host: 'room', siteName: 'Bed', verb: 'Check',
  how: 'At each bed look right to read the triage tag and left to see the patient, then tap E if the tag fits or hold E to call a re-triage.',
  keys: ['look right: tag', 'look left: patient', 'E tap: tag fits', 'E hold 1 s: re-triage'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'see the patient', input: 'e-tap+e-hold+look', win: 'every bed judged in person after reading both its tag and the patient, with each under-tagged patient sent for re-triage',
    fail: 'judging a bed from the tag or monitor without looking at the patient, passing an under-tagged patient, or re-triaging one whose tag fits',
    rule: 'Aim right at the tag until it reads, then left at the patient until their colour and breathing show. Compare: tap E if they match the tag colour, hold E for a second if they look a grade worse.' },
  rush: 'Read the tags from the ward door and went back to the bridge.',
  captions: { 'trusted the monitor': 'monitor beeps on, unheeded', 'missed deterioration': 'nurse looks worried', 'needless re-triage': 'nurse: "she is fine, sir"' },
  says: { 'trusted the monitor': 'You judged without looking at the patient. Look left at them first.', 'missed deterioration': 'That patient looks worse than the tag. Hold E to call a re-triage.', 'needless re-triage': 'The tag fits — tap E, do not re-triage.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Bed 1', prop: 'biobed' }, { name: 'Bed 2', prop: 'exam_couch' }, { name: 'Bed 3', prop: 'biobed' }, { name: 'Bed 4', prop: 'infusion_stand' }]), r = m.rnd;
    const tol = m.calm ? 0.2 : 0.14, worse = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 1, 2)));
    m.beds = m.sites.map((_, i) => { const tag = ri(r, 0, worse.has(i) ? 1 : 2), real = worse.has(i) ? tag + 1 : tag; return { tag, real, look: pick(r, LOOK[real]), tq: 0, pq: 0, ht: 0 }; });
    const TAGL = -0.35, PATL = 0.35, tRead = 0.4, pRead = m.calm ? 0.6 : 0.8;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, b = m.beds[i], lk = inp.look || 0;
      if (Math.abs(lk - TAGL) < tol) b.tq += dt; if (Math.abs(lk - PATL) < tol) b.pq += dt;
      const seen = b.pq >= pRead, fits = b.real === b.tag;
      if (inp.hold) { b.ht += dt; if (b.ht >= 1.0) { b.ht = -99; if (!seen) m.fault('trusted the monitor'); else if (fits) m.fault('needless re-triage'); else { m.ev('retriage', { site: i }); m.finish(i); return; } } }
      else if (rel) { const t = b.ht; b.ht = 0; if (t > 0 && t < 0.4) { if (!seen) m.fault('trusted the monitor'); else if (!fits) m.fault('missed deterioration'); else { m.finish(i); return; } } }
      if (!inp.hold) b.ht = 0;
      s.prog = clamp(Math.min(1, b.tq / tRead) * 0.3 + Math.min(1, b.pq / pRead) * 0.5, 0, 0.9);
    };
    m.hint = () => {
      const i = m.next; if (i < 0) return { at: -1 }; const b = m.beds[i];
      if (b.tq < tRead) return { at: i, look: TAGL }; if (b.pq < pRead + 0.05) return { at: i, look: PATL };
      return { at: i, look: PATL, hold: b.real === b.tag ? !m.prev : true };
    };
    m.bad = (f = 0) => ({ at: m.next, look: 0, hold: f % 4 < 1 });
    m.view = () => ({ beds: m.beds.map(b => [b.tag, b.real, b.look]) });
    m.panel = (i) => {
      const b = m.beds[i]; if (!b) return null; const tag = b.tq >= tRead ? TAG[b.tag] : '—', pat = b.pq >= pRead ? b.look : '—';
      return { label: `Tag (right): ${tag}`, value: `Patient (left): ${pat}`, bar: clamp(b.ht > 0 ? b.ht : (Math.min(1, b.tq / tRead) + Math.min(1, b.pq / pRead)) / 2) };
    };
    m.prompt = (i) => { const b = m.beds[i]; return !b ? '' : b.tq < tRead ? 'Look right at the triage tag on the frame' : b.pq < pRead ? 'Look left at the patient: colour and breathing' : 'Tap [E] if the tag fits, hold [E] to call a re-triage'; };
    return m;
  },
});
