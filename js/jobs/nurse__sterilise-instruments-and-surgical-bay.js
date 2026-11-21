// Nurse: sterilise instruments and surgical bay. Residue hides in one joint of each instrument. Look at it under the inspection lamp (the panel
// says which way) and hold E to brush only while you are looking at it. When it is gone, press E to load the instrument into the basket.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'nurse', label: 'Sterilise instruments and surgical bay', type: 'loop' },
  title: 'Brush the hidden residue', dept: 'medical', host: 'room', siteName: 'Instrument', verb: 'Brush',
  how: 'Turn your view toward the joint where the lamp shows residue and hold E to brush it. Brushing elsewhere does nothing and scuffs the steel. Once clean, press E to load it.',
  keys: ['E hold: brush', 'aim at the joint', 'E press: load'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'spot-brush then load', input: 'e-hold+e-tap+look', win: 'three instruments each brushed on the residue joint under the lamp until clear and then loaded into the basket',
    fail: 'brushing clean metal away from the joint for over a second, so the instrument is scuffed',
    rule: 'The residue sits at a different side for each instrument. Face it, hold E until the meter hits zero, then press E to load.' },
  rush: 'Rinsed the tray and loaded the instruments without brushing the joints.',
  captions: { scuffed: 'brush scrapes steel' }, says: { scuffed: 'You brushed bare steel. Face the glinting joint before you hold E.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Forceps', prop: 'shelving' }, { name: 'Scalpel handle', prop: 'locker' }, { name: 'Retractor', prop: 'console' }]), r = m.rnd, win = m.calm ? 0.2 : 0.14;
    m.ins = m.sites.map(() => ({ at: rf(r, -0.38, 0.38), res: 1, off: 0 })); m.win_ = win;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const d = m.ins[m.next], aimed = Math.abs((inp.look || 0) - d.at) < win;
      if (d.res > 0) { if (inp.hold) { if (aimed) { d.res = Math.max(0, d.res - 0.7 * dt); d.off = 0; } else { d.off += dt; if (d.off > 1) { m.fault('scuffed'); d.off = 0; } } } }
      else if (inp.press) { m.finish(m.next); return; }
      s.prog = 1 - d.res;
    };
    m.hint = (f = 0) => { const d = m.ins[m.next]; if (!d) return { at: -1 }; return d.res > 0 ? { at: m.next, look: d.at, hold: true } : { at: m.next, look: d.at, press: f % 2 === 0, hold: f % 2 === 0 }; };
    m.bad = () => ({ at: m.next, look: 0.5 * (m.ins[m.next].at > 0 ? -1 : 1), hold: true });
    m.view = () => ({ at: m.ins.map(d => +d.at.toFixed(2)) });
    m.panel = (i) => { const d = m.ins[i]; return d ? { label: d.res > 0 ? 'Residue' : 'Clean', value: d.res > 0 ? (d.at < -0.05 ? 'joint to the right' : d.at > 0.05 ? 'joint to the left' : 'joint ahead') : 'press E to load', bar: 1 - d.res } : null; };
    m.prompt = (i) => m.ins[i] && m.ins[i].res > 0 ? 'Face the glinting joint and hold [E] to brush' : 'Press [E] to load it into the basket';
    return m;
  },
});
