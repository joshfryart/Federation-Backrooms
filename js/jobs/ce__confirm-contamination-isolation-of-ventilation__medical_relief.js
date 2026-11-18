// Chief engineer: confirm contamination isolation of the ventilation (medical relief). The damper's position indicator reads CLOSED well
// before the blade actually seals, so wind the damper wheel (E held, turn the view) watching the airflow probe, not the indicator, and stop
// when the flow reads zero. Wind past the seal and the wheel jams. Then sweep the probe slowly across each sickbay-duct grille (E held, view
// across the whole grille face) to prove no air moves; a sweep too fast for the probe to register does not count.
import { define, machine, room, rf, clamp } from './kit.js';

const BINS = 8, SPAN = 0.4;
export default define({
  job: { billet: 'ce', label: 'Confirm contamination isolation of ventilation', type: 'task:medical_relief' },
  title: 'Damper seal by airflow, not indicator', dept: 'engineering', host: 'room', item: 'tricorder_atmo', siteName: 'Point', verb: 'Seal',
  how: 'At the damper hold E and turn your view to wind the wheel until the airflow probe reads zero, whatever the indicator says, and stop there. At each grille hold E and sweep your view slowly across the whole face.',
  keys: ['E hold + turn: wind the damper', 'E hold + slow sweep: probe the grille'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'wind to zero-flow', input: 'e-hold+turn+look', win: 'the isolation damper wound to the point the airflow reads zero, and every grille face swept slowly end to end at zero flow',
    fail: 'letting go on the indicator\'s CLOSED while air still moves, winding past the seal so the wheel jams, or sweeping a grille too fast for the probe',
    rule: 'Winding the wheel lowers the airflow figure; the indicator says CLOSED early, ignore it. Release at zero flow, before the wheel binds. At a grille, every strip of its face must pass under the probe at a slow sweep.' },
  rush: 'Saw the damper indicator read CLOSED and called sickbay isolated.',
  captions: { 'trusted the indicator': 'air hisses through the grille', jammed: 'wheel binds with a squeal', 'swept too fast': 'probe chirps: no reading' },
  says: { 'trusted the indicator': 'The indicator says closed but the probe still shows flow. Keep winding to zero.', jammed: 'Wound past the seal — the wheel bound. Backed it off; stop at zero flow.', 'swept too fast': 'Too fast for the probe to register. Sweep slowly across the grille.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Sickbay duct isolation damper', prop: 'heatexch' }, { name: 'Grille A', prop: 'scrubber' }, { name: 'Grille B', prop: 'pumpskid' }]), r = m.rnd;
    const over = m.calm ? 0.1 : 0.07, fast = m.calm ? 2.6 : 2.2;
    m.seal = rf(r, 0.82, 0.95); m.w = rf(r, 0.05, 0.2); m.cov = [null, Array(BINS).fill(false), Array(BINS).fill(false)]; m.idx = -1;
    const flow = () => clamp((m.seal - m.w) / m.seal) * 100;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const st = m.cur(inp), rel = m.released(inp); if (!st) return; const i = m.next;
      if (i === 0) {
        if (inp.hold && (inp.turn || 0) > 0.2) { m.w += 0.3 * Math.min(2, inp.turn) * (m.w > 0.7 ? 0.6 : 1) * dt; if (m.w > m.seal + over) { m.fault('jammed'); m.w = m.seal - 0.2; } }
        if (rel) { if (flow() < 1.2) m.finish(0); else if (m.w >= 0.7) m.fault('trusted the indicator'); }
        if (!st.done) st.prog = clamp(m.w / m.seal * 0.9, 0, 0.9); return;
      }
      const c = m.cov[i];
      if (inp.hold) { if ((inp.turn || 0) > fast) { m.fault('swept too fast'); c.fill(false); }
        else { const b = Math.floor((clamp(inp.look || 0, -SPAN, SPAN - 1e-6) + SPAN) / (2 * SPAN) * BINS); m.idx = b; if (Math.abs(inp.look || 0) <= SPAN + 0.05) c[b] = true; } }
      if (c.every(Boolean)) m.finish(i);
      if (!st.done) st.prog = c.filter(Boolean).length / BINS * 0.9;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 0) return m.w < m.seal ? { at: 0, hold: true, turn: 1.2 } : { at: 0, hold: false };
      const ph = f * 0.08; return { at: i, hold: true, look: 0.45 * Math.sin(ph), turn: Math.abs(0.45 * 0.08 * 30 * Math.cos(ph)) }; };
    m.bad = () => ({ at: m.next, hold: true, turn: 1.5, look: 0 });
    m.view = () => ({ seal: +m.seal.toFixed(3), w0: +m.w.toFixed(3) });
    m.panel = (i) => i === 0 ? { label: `Indicator: ${m.w >= 0.7 ? 'CLOSED' : 'open'}`, value: `airflow ${flow().toFixed(1)} L/s`, bar: 1 - flow() / 100, band: [0.988, 1] }
      : m.cov[i] ? { label: `Probe sweep ${m.cov[i].filter(Boolean).length}/${BINS} strips`, value: 'flow 0.0 L/s', bar: m.cov[i].filter(Boolean).length / BINS } : null;
    m.prompt = (i) => i === 0 ? 'Hold [E] and turn your view to wind the damper; stop at zero airflow, not at CLOSED' : i > 0 && i < 3 ? 'Hold [E] and sweep your view slowly across the whole grille' : '';
    return m;
  },
});
