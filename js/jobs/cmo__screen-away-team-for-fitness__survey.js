// CMO: screen the away team for fitness (survey). For each team member: tap E to send them walking the length of the bay and follow them
// with your eyes (keep your view on them; lose sight and the walk starts again), which shows whether the gait is even. Then hold E with the
// oximeter clipped on until the reading settles. Then aim at the right stamp and tap E: fit, conditionally fit (a limp, or oxygen 93-95 %)
// or unfit (oxygen under 93 %).
import { define, machine, room, ri, clamp } from './kit.js';

const STAMP = [['FIT', 0.28], ['CONDITIONAL', 0], ['UNFIT', -0.28]];
export default define({
  job: { billet: 'cmo', label: 'Screen away team for fitness', type: 'task:survey' },
  title: 'Gait walk and oximeter clearance', dept: 'medical', host: 'room', siteName: 'Team member', verb: 'Screen',
  how: 'Tap E to send each team member across the bay and keep your eyes on them, hold E on the oximeter until it settles, then aim at the right stamp and tap E.',
  keys: ['E tap: walk / stamp', 'Follow them with the view', 'E hold: oximeter'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'screen fitness', input: 'e-tap+e-hold+look', win: 'each team member watched across the bay, oximetry settled and the clearance card stamped by gait and oxygen',
    fail: 'losing sight of the walker, reading the oximeter before it settles, or stamping a low-oxygen crewman fit',
    rule: 'Tap E, then track the walker with your view to see the gait. Hold E until the oxygen reading settles. Stamp: under 93 % unfit; a limp or 93-95 % conditional; otherwise fit. Aim at the stamp, tap E.' },
  rush: 'Asked the team if anyone felt unwell, heard silence and stamped them all fit.',
  captions: { 'lost sight': 'footsteps fade', 'unsettled reading': 'oximeter beeps', 'cleared a sick crewman': 'team leader raises an eyebrow', 'wrong stamp': 'card smudges' },
  says: { 'lost sight': 'You looked away — have them walk again.', 'unsettled reading': 'Wait for the oximeter to settle before you read it.', 'cleared a sick crewman': 'That oxygen figure is too low to clear fit.', 'wrong stamp': 'Wrong stamp for that gait and reading.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Team member 1', prop: 'biobed' }, { name: 'Team member 2', prop: 'exam_couch' }, { name: 'Team member 3', prop: 'biobed' }]), r = m.rnd;
    const dur = m.calm ? 3.0 : 2.4, tol = m.calm ? 0.2 : 0.15, settle = 1.4, stol = m.calm ? 0.1 : 0.08;
    m.tm = m.sites.map(() => { const spo = r() < 0.3 ? ri(r, 89, 92) : r() < 0.5 ? ri(r, 93, 95) : ri(r, 96, 99), limp = r() < 0.4; return { spo, limp, ph: 0, w: 0, off: 0, ox: 0, ans: spo < 93 ? 2 : limp || spo <= 95 ? 1 : 0 }; });
    const tgt = (p) => 0.45 - 0.9 * clamp(p.w / dur);
    const aimStamp = (look) => STAMP.findIndex(([, b]) => Math.abs((look || 0) - b) < stol);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; m.lastLook = inp.look || 0; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, p = m.tm[i];
      if (p.ph === 0) { if (inp.press) { p.ph = 1; p.w = 0; p.off = 0; } }
      else if (p.ph === 1) { p.w += dt; if (Math.abs((inp.look || 0) - tgt(p)) > tol) { p.off += dt; if (p.off > 0.4) { m.fault('lost sight'); p.w = 0; p.off = 0; } } else p.off = 0; if (p.w >= dur) p.ph = 2; }
      else if (p.ph === 2) { if (inp.hold) p.ox += dt; else if (rel) { if (p.ox >= settle) p.ph = 3; else { m.fault('unsettled reading'); p.ox = 0; } } }
      else if (inp.press) { const a = aimStamp(inp.look); if (a < 0) return; if (a === p.ans) { m.finish(i); return; } m.fault(a === 0 && p.ans === 2 ? 'cleared a sick crewman' : 'wrong stamp'); }
      s.prog = s.done ? 1 : [0, 0.1 + 0.3 * clamp(p.w / dur), 0.4 + 0.3 * clamp(p.ox / settle), 0.8][p.ph];
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const p = m.tm[i];
      if (p.ph === 0) return { at: i, press: true, hold: true }; if (p.ph === 1) return { at: i, look: tgt(p) };
      if (p.ph === 2) return { at: i, hold: p.ox < settle + 0.1 }; return { at: i, look: STAMP[p.ans][1], press: f % 2 === 0, hold: f % 2 === 0 }; };
    m.bad = (f = 0) => { const i = m.next, p = m.tm[i]; if (p.ph === 0) return { at: i, press: true, hold: true }; if (p.ph === 1) return { at: i, look: -0.5 }; return { at: i, hold: f % 10 < 3 }; };
    m.view = () => ({ t: m.tm.map(p => [p.spo, p.limp]) });
    m.panel = (i) => { const p = m.tm[i]; if (!p) return null;
      if (p.ph === 0) return { label: 'Walk test', value: 'tap E to send them across the bay', bar: 0 };
      if (p.ph === 1) return { label: 'Watching the gait', value: p.w > dur * 0.5 ? (p.limp ? 'favouring the left leg: LIMP' : 'even stride') : 'walking…', bar: p.w / dur };
      const g = p.limp ? 'limp' : 'even gait';
      if (p.ph === 2) return { label: `Oximeter (${g})`, value: p.ox >= settle ? `SpO₂ ${p.spo} % settled` : `SpO₂ ${p.spo + Math.round(3 * Math.sin(m.t * 9))} % settling…`, bar: p.ox / settle };
      const a = aimStamp(m.lastLook); return { label: `Stamp card · ${g} · SpO₂ ${p.spo} %`, value: 'fit ← conditional → unfit' + (a >= 0 ? ` (${STAMP[a][0]})` : ''), bar: 1 };
    };
    m.prompt = (i) => { const p = m.tm[i]; if (!p) return ''; return ['Tap [E] to have them walk the bay', 'Keep your view on them as they walk', 'Hold [E] with the oximeter on until the reading settles, then let go', 'Aim at FIT (left), CONDITIONAL (centre) or UNFIT (right) and tap [E]'][p.ph]; };
    return m;
  },
});
