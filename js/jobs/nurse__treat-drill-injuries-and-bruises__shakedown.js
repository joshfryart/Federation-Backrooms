// Nurse: treat drill injuries and bruises. Press gently around each bruise to find the tender edge: sweep your view along the bruise and watch the
// wince meter, then tap E where it peaks. Pressing away from the tender spot over and over is rough handling.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'nurse', label: 'Treat drill injuries and bruises', type: 'task:shakedown' },
  title: 'Find the tender edge', dept: 'medical', host: 'room', siteName: 'Bruise', verb: 'Press',
  how: 'Turn your view along the bruise and read the wince meter on the panel. Tap E when it peaks to mark the tender edge. Three light presses off the peak makes the patient flinch.',
  keys: ['look along the bruise', 'E tap: press'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'find tender edge', input: 'e-tap+look', win: 'three bruises each pressed at the wince peak found by sweeping the view along the bruise',
    fail: 'three presses off the wince peak on one bruise, which hurts the patient',
    rule: 'The wince meter climbs as your view nears the tender point. Tap E at the peak; each off-peak tap counts toward rough handling.' },
  rush: 'Pressed once at the centre of each bruise and handed out cold packs.',
  captions: { 'too rough': 'patient hisses in pain' }, says: { 'too rough': 'Three presses off the tender point. Sweep first, press at the wince peak.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Forearm bruise', prop: 'bunk' }, { name: 'Shoulder bruise', prop: 'bunk' }, { name: 'Shin bruise', prop: 'nursestation' }]), r = m.rnd, win = m.calm ? 0.16 : 0.1;
    m.pt = m.sites.map(() => rf(r, -0.34, 0.34)); m.pain = 0; m.wince = 0;
    const wincer = (look, i) => clamp(1 - Math.abs(look - m.pt[i]) / 0.5);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) { m.wince = 0; return; } const i = m.next; m.wince = wincer(inp.look || 0, i);
      if (inp.press) { if (Math.abs((inp.look || 0) - m.pt[i]) < win) { m.pain = 0; m.finish(i); return; } m.pain++; if (m.pain >= 3) { m.fault('too rough'); m.pain = 0; } }
      s.prog = m.wince * 0.9;
    };
    m.hint = (f = 0) => ({ at: m.next, look: m.pt[m.next] || 0, press: f % 3 === 0 });
    m.bad = () => ({ at: m.next, look: m.pt[m.next] > 0 ? -0.5 : 0.5, press: true });
    m.view = () => ({ pt: m.pt.map(p => +p.toFixed(2)) });
    m.panel = (i) => ({ label: 'Wince', value: `${Math.round(m.wince * 100)} %`, bar: m.wince, band: [1 - win / 0.5, 1] });
    m.prompt = () => 'Sweep your view along the bruise, then tap [E] at the wince peak';
    return m;
  },
});
