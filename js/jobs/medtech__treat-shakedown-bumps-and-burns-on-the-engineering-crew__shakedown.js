// Medtech: treat burns with regen spray. Sweep the view across the burn while holding E; every patch needs the dose for the burn's depth, no more.
import { define, machine, room, pick, clamp } from './kit.js';
const N = 5, X0 = -0.25, W = 0.1;

export default define({
  job: { billet: 'medtech', label: 'Treat shakedown bumps and burns on the engineering crew', type: 'task:shakedown' },
  title: 'Even regen spray over a burn', dept: 'medical', host: 'room', siteName: 'Burn', verb: 'Spray',
  how: 'Hold E and sweep the view over the burn so each of the five patches gets the dose for its depth. Do not park on one patch, it pools. Let go when every patch is covered.',
  keys: ['E hold: spray', 'look: sweep the patches'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'even spray', input: 'e-hold+look', win: 'every patch of two burns dosed to the depth target without a pooled patch',
    fail: 'lingering on one patch until the regen pools, or letting go while patches are still short',
    rule: 'Hold E, the patch under the view takes the dose. Deep burns need more per patch than light ones. Keep moving; a patch past target+ pools.' },
  rush: 'Sprayed one pass at the middle of each burn and taped over it.',
  captions: { pooled: 'regen pools and runs', gap: 'bare patch noted' }, says: { pooled: 'Regen pooled on one patch. Keep the spray moving.', gap: 'Let go with a patch still bare.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Burn: engineer 1', prop: 'bunk' }, { name: 'Burn: engineer 2', prop: 'nursestation' }]), r = m.rnd;
    m.goal = [0, 1].map(() => pick(r, [0.5, 0.8, 1.1])); m.dose = [0, 1].map(() => new Array(N).fill(0)); const over = m.calm ? 0.65 : 0.5;
    const cell = (look) => { const c = Math.floor((look - X0) / W); return c >= 0 && c < N ? c : -1; };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, d = m.dose[i], T = m.goal[i];
      if (inp.hold) { const c = cell(inp.look || 0); if (c >= 0) { d[c] += dt; if (d[c] > T + over) { m.fault('pooled'); d[c] = T; } } }
      if (rel) { if (d.every(x => x >= T)) m.finish(i); else m.fault('gap'); }
      s.prog = s.done ? 1 : clamp(d.reduce((a, x) => a + Math.min(x, T), 0) / (N * T)) * 0.95;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const d = m.dose[i], T = m.goal[i]; let c = 0; for (let k = 1; k < N; k++) if (d[k] < d[c]) c = k; return d[c] >= T ? { at: i, hold: false } : { at: i, hold: true, look: X0 + W * (c + 0.5) }; };
    m.bad = () => ({ at: m.next, hold: true, look: 0 });
    m.view = () => ({ goal: m.goal });
    m.panel = (i) => { const d = m.dose[i]; return d ? { label: `Dose target ${m.goal[i].toFixed(1)} s per patch`, value: d.map(x => x >= m.goal[i] ? '#' : x > 0 ? '+' : '.').join(' '), bar: clamp(d.reduce((a, x) => a + Math.min(x, m.goal[i]), 0) / (N * m.goal[i])) } : null; };
    m.prompt = () => 'Hold [E] and sweep across the burn patches; let go when all are covered';
    return m;
  },
});
