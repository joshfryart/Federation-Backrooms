// CMO: check the medical hologram. The emitter has drifted on three axes. At each axis's fine-adjust wheel hold E to grip it and turn your
// view to roll the wheel: turning left closes a positive drift, turning right a negative one. Turn gently: whipping the wheel slips the
// gear and throws the drift. Let go only when the calibration rings close concentric (drift inside a quarter millimetre).
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'cmo', label: 'Check the medical hologram', type: 'loop' },
  title: 'Emitter fine-adjust wheel trim', dept: 'medical', host: 'room', siteName: 'Axis wheel', verb: 'Trim',
  how: 'Hold E to grip each fine-adjust wheel and turn your view slowly to roll it, left for a plus drift and right for a minus drift; let go when the calibration rings close.',
  keys: ['E hold: grip the wheel', 'Turn the view: roll it'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'trim the emitter', input: 'e-hold+swing', win: 'all three emitter axes rolled back to concentric rings and released inside a quarter millimetre of zero drift',
    fail: 'whipping the wheel so the gear slips, or letting go with the rings still open',
    rule: 'Grip with E; the direction you turn sets which way the wheel rolls and your turn speed sets how far. The panel shows the drift in mm with its sign. Too fast slips. Release inside the closed band.' },
  rush: 'Asked the hologram to state the nature of the emergency, heard an answer and logged the emitter fine.',
  captions: { 'gear slipped': 'wheel clacks', 'rings left open': 'diagnostic beeps twice' },
  says: { 'gear slipped': 'Too fast — the fine-adjust gear slipped and threw the drift.', 'rings left open': 'The rings are still open — keep rolling before you let go.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'X-axis wheel', prop: 'holocube' }, { name: 'Y-axis wheel', prop: 'holocube' }, { name: 'Z-axis wheel', prop: 'holocube' }]), r = m.rnd;
    const tol = m.calm ? 0.35 : 0.25, vmax = m.calm ? 2.6 : 2.0, gain = 1.0;
    m.ax = m.sites.map(() => { const d = rf(r, 1.4, 3.8) * (r() < 0.5 ? -1 : 1); return { d0: +d.toFixed(2), d }; });
    m.slip = 0;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, a = m.ax[i];
      m.slip = Math.max(0, m.slip - dt);
      if (inp.hold) {
        const w = inp.swing || 0;
        if (Math.abs(w) > vmax) { if (m.slip <= 0) { m.slip = 0.6; a.d += (r() < 0.5 ? -1 : 1) * rf(r, 0.8, 1.6); m.fault('gear slipped'); } }
        else a.d -= w * gain * dt;
      } else if (rel) { if (Math.abs(a.d) <= tol) { m.finish(i); return; } m.fault('rings left open'); }
      s.prog = clamp(1 - Math.abs(a.d) / Math.abs(a.d0)) * 0.95;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const a = m.ax[i]; if (Math.abs(a.d) <= tol * 0.5) return { at: i, hold: false }; return { at: i, hold: true, swing: Math.sign(a.d) * Math.min(vmax * 0.6, 0.4 + Math.abs(a.d) * 2) }; };
    m.bad = (f = 0) => ({ at: m.next, hold: true, swing: f % 2 ? 4 : -4 });
    m.view = () => ({ d: m.ax.map(a => a.d0) });
    m.panel = (i) => { const a = m.ax[i]; if (!a) return null; return { label: Math.abs(a.d) <= tol ? 'Rings concentric' : 'Rings open', value: `drift ${a.d >= 0 ? '+' : '−'}${Math.abs(a.d).toFixed(2)} mm`, bar: clamp(0.5 + a.d / 8), band: [0.5 - tol / 8, 0.5 + tol / 8] }; };
    m.prompt = (i) => { const a = m.ax[i]; return !a ? '' : `Hold [E] and turn ${a.d > 0 ? 'left' : 'right'} slowly to close the rings; let go when concentric`; };
    return m;
  },
});
