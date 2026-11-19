// Environmental tech: sickbay air filtration to isolation grade (medical relief). Read the isolation grade off the biobed filter label (hold E),
// click the wall-panel isolation dial round to that grade (hold E and swing your view: each swing step is one click, left = up, right = down;
// let go on the grade), then go to the sickbay door and wait for the negative pressure needle to settle before you confirm it (tap E).
import { define, machine, room, ri, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'env', label: 'Sickbay air filtration to isolation grade', type: 'task:medical_relief' },
  title: 'Isolation dial clicks and door needle', dept: 'engineering', host: 'room', siteName: 'Station', verb: 'Set',
  how: 'Hold E at the biobed to read the grade. At the wall panel hold E and swing your view to click the dial (left up, right down); let go on the grade. At the door tap E once the pressure needle has stopped swinging.',
  keys: ['E hold: read label / grip dial', 'swing view: click the dial', 'E tap: confirm the needle'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'click the dial', input: 'e-hold+e-tap+swing', win: 'isolation dial clicked to the grade on the biobed label and the door negative pressure confirmed on a settled needle',
    fail: 'letting go of the dial off the grade, or confirming the door gauge while its needle is still swinging',
    rule: 'Each 0.3 rad of view swing with E held is one click. Let go of E exactly on the label grade. At the door the needle rings after the change: tap E only when SETTLED shows.' },
  rush: 'Turned the dial to about isolation and reported it set without looking at the door gauge.',
  captions: { 'wrong grade': 'dial clacks', unsettled: 'gauge flutters' },
  says: { 'wrong grade': 'Off grade: the dial is not on the label grade. Grip it again and click it round.', unsettled: 'Too soon: the needle was still swinging. Wait for it to settle.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Biobed filter label', prop: 'biobed' }, { name: 'Sickbay wall panel', prop: 'nursestation' }, { name: 'Sickbay door gauge', prop: 'airlock_doors' }]), r = m.rnd;
    m.g = ri(r, 3, 5); m.dial = ri(r, 0, 1); m.acc = 0; m.read = 0; m.gt = 0; m.A = rf(r, 0.25, 0.4); m.w = rf(r, 5, 7); m.held = false;
    const thr = m.calm ? 0.05 : 0.035;
    m.needle = () => { const e = m.A * Math.exp(-m.gt / 0.8); return { v: 0.6 + e * Math.cos(m.w * m.gt), amp: e }; };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); const rel = m.released(inp); if (!s) return; const i = m.next;
      if (i === 0) { if (inp.hold) m.read += dt; if (m.read >= 1) m.finish(0); s.prog = clamp(m.read); return; }
      if (i === 1) {
        if (inp.hold) { m.acc += (inp.swing || 0) * dt; while (m.acc >= 0.3) { m.acc -= 0.3; m.dial = Math.min(6, m.dial + 1); } while (m.acc <= -0.3) { m.acc += 0.3; m.dial = Math.max(0, m.dial - 1); } }
        if (rel) { m.acc = 0; if (m.dial === m.g) m.finish(1); else m.fault('wrong grade'); }
        s.prog = s.done ? 1 : clamp(m.dial / m.g * 0.9, 0, 0.9); return;
      }
      m.gt += dt; if (inp.press) { if (m.needle().amp < thr) m.finish(2); else m.fault('unsettled'); }
      s.prog = s.done ? 1 : clamp(1 - m.needle().amp / m.A, 0, 0.9);
    };
    m.hint = (f = 0) => {
      const i = m.next; if (i < 0) return { at: -1 }; if (i === 0) return { at: 0, hold: true };
      if (i === 1) { const d = m.g - m.dial; return d === 0 ? { at: 1, hold: false } : { at: 1, hold: true, swing: d > 0 ? 1.0 : -1.0 }; }
      const go = m.needle().amp < thr * 0.8 && f % 2 === 0; return { at: 2, press: go, hold: go };
    };
    m.bad = (f = 0) => { const i = m.next; if (i === 0) return { at: 0, hold: true }; if (i === 1) return { at: 1, hold: f % 40 < 30, swing: 2 }; return { at: 2, press: f % 6 === 0, hold: f % 6 < 2 }; };
    m.view = () => ({ g: m.g, d0: m.dial, A: +m.A.toFixed(3) });
    m.panel = (i) => {
      if (i === 0) return { label: 'Filter label', value: m.read >= 1 ? `isolation grade ${m.g}` : 'reading…', bar: clamp(m.read) };
      if (i === 1) return { label: `Dial ${m.dial === m.g ? '● ON GRADE' : '■ off grade'}`, value: `click ${m.dial} · label grade ${m.g}`, bar: m.dial / 6, band: [m.g / 6 - 0.02, m.g / 6 + 0.02] };
      const n = m.needle(); return { label: n.amp < thr ? 'Needle SETTLED' : 'Needle swinging…', value: `${(-n.v * 10).toFixed(1)} Pa`, bar: clamp(n.v), band: [0.55, 0.65] };
    };
    m.prompt = (i) => i === 0 ? 'Hold [E] to read the biobed filter label' : i === 1 ? 'Hold [E] and swing your view to click the dial (left up, right down); let go on the grade' : 'Tap [E] once the door needle has settled';
    return m;
  },
});
