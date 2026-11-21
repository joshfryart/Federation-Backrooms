// Medtech: draw blood for the doctor's rapid scan. Line the needle up with the vein (look), hold E to draw and keep the view steady: a missed
// vein or a jerk ruins the sample. Then hold E at the analyser to load the tube.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'medtech', label: 'Run rapid scans and bloodwork for the doctor', type: 'task:medical_relief' },
  title: 'Steady draw from the vein', dept: 'medical', host: 'room', siteName: 'Bench', verb: 'Draw',
  how: 'Aim the view at the vein mark, hold E to draw and keep the view still until the tube fills. A jerk or a drift off the vein spoils the sample. Hold E at the analyser to load it.',
  keys: ['look: line up on the vein', 'E hold: draw', 'keep the swing slow'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'draw steady', input: 'e-hold+look+swing', win: 'two tubes drawn clean from the aimed vein and loaded into the analyser',
    fail: 'drawing with the needle off the vein, or jerking the view mid-draw so the sample is haemolysed',
    rule: 'Turn until the needle marker sits on the vein, hold E: the tube fills only while you stay on it and the view stays slow. A sudden swing or drift spoils the tube.' },
  rush: 'Took the first sample from the first vein felt and sent the figure without checking the tube.',
  captions: { 'missed vein': 'patient flinches', jerk: 'haemolysed sample alarm' }, says: { 'missed vein': 'Off the vein. Line the needle up before you draw.', jerk: 'Jerked mid-draw: haemolysed sample. Start the tube again.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Draw: patient 1', prop: 'bunk' }, { name: 'Draw: patient 2', prop: 'nursestation' }, { name: 'Analyser', prop: 'console' }]), r = m.rnd;
    m.vein = [rf(r, -0.3, 0.3), rf(r, -0.3, 0.3)]; m.fill = 0; m.cool = 0; m.cur2 = 0; const tol = m.calm ? 0.13 : 0.09;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); m.cool = Math.max(0, m.cool - dt); if (!s) return; const i = m.next;
      if (!inp.hold) { m.fill = Math.max(0, m.fill - dt * 0.5); s.prog = m.fill * 0.9; return; }
      if (i === 2) m.fill += dt / 1.0;
      else if (m.cool <= 0) {
        const err = Math.abs((inp.look || 0) - m.vein[i]);
        if (Math.abs(inp.swing || 0) > 1.0) { m.fault('jerk'); m.fill = 0; m.cool = 0.6; }
        else if (err > 0.22) { m.fault('missed vein'); m.fill = 0; m.cool = 0.6; }
        else if (err <= tol) m.fill += dt / 1.5;
      }
      if (m.fill >= 1) { m.fill = 0; m.finish(i); } else s.prog = m.fill * 0.9;
    };
    m.hint = () => { const i = m.next; return i < 0 ? { at: -1 } : { at: i, hold: true, look: i < 2 ? m.vein[i] : 0, swing: 0 }; };
    m.bad = () => ({ at: m.next, hold: true, look: (m.vein[m.next] || 0) + 0.5, swing: 0 });
    m.view = () => ({ vein: m.vein.map(v => +v.toFixed(3)) });
    m.panel = (i) => ({ label: i < 2 ? 'Vein mark ' + (m.vein[i] > 0 ? 'left' : 'right') + ' ' + Math.abs(m.vein[i]).toFixed(2) : 'Analyser load', value: Math.round(m.fill * 100) + ' % filled', bar: clamp(m.fill) });
    m.prompt = (i) => i === 2 ? 'Hold [E] to load the tube' : 'Aim at the vein mark, hold [E] to draw, keep the view slow';
    return m;
  },
});
