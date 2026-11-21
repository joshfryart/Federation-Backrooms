// Holodeck tech: cycle through every program class. The sample cycles Calm, Crowd, Combat every 1.5 s. At each emitter watch the glow readout
// through one full cycle: if it dips below the band during one class, tap E during that dip to circle it. A healthy emitter simply clears
// after one clean cycle. Tapping when it is not dipping is a fault.
import { define, machine, room, ri, pick, clamp } from './kit.js';
const CL = ['Calm', 'Crowd', 'Combat'];

export default define({
  job: { billet: 'holo', label: 'Cycle the emitters through every program class', type: 'task:shakedown' },
  title: 'Catch the glow dip in its class', dept: 'services', host: 'room', siteName: 'Emitter', verb: 'Watch',
  how: 'Stand at each emitter while the classes cycle. If its glow readout drops under the band, tap E during the dip. A healthy emitter clears after a full cycle.',
  keys: ['E tap during a glow dip'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'catch the dip', input: 'e-tap', win: 'three emitters watched through every program class with each dip circled during the class it dipped in',
    fail: 'tapping to circle an emitter that is not dipping, or watching a weak emitter dip a full cycle uncircled, three times',
    rule: 'Calm, Crowd and Combat classes loop. A weak emitter dips under one class: tap E while its readout is low. A healthy one never dips and clears after a full cycle.' },
  rush: 'Ran one class and signed the sweep sheet for the rest.',
  captions: { 'false circle': 'false circle noted', 'missed dip': 'weak emitter noted too late' }, says: { 'false circle': 'That emitter was not dipping.', 'missed dip': 'A full cycle passed with the dip uncircled.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Emitter 1', prop: null }, { name: 'Emitter 2', prop: null }, { name: 'Emitter 3', prop: null }]), r = m.rnd, per = m.calm ? 2 : 1.5;
    m.dip = m.sites.map(() => pick(r, [-1, 0, 1, 2])); if (m.dip.every(d => d < 0)) m.dip[ri(r, 0, 2)] = ri(r, 0, 2); m.seen = [0, 0, 0];
    const cls = () => Math.floor(m.t / per) % 3, dipping = (i) => m.dip[i] === cls();
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next; m.seen[i] += dt;
      if (inp.press) { if (dipping(i)) m.finish(i); else m.fault('false circle'); }
      else if (m.seen[i] > per * 3 + 0.2) { if (m.dip[i] >= 0) { m.fault('missed dip'); m.seen[i] = 0; } else m.finish(i); }
      s.prog = s.done ? 1 : clamp(m.seen[i] / (per * 3), 0, 0.95);
    };
    m.hint = () => { const i = m.next; return { at: i, press: i >= 0 && dipping(i) && m.dip[i] >= 0 }; };
    m.bad = (f = 0) => ({ at: m.next, press: f % 3 === 0 && !(m.next >= 0 && dipping(m.next)) });
    m.view = () => ({ dip: m.dip.slice() });
    m.panel = (i) => ({ label: `Class: ${CL[cls()]}`, value: `glow ${dipping(i) ? 'LOW 35 %' : 'ok 82 %'}`, bar: dipping(i) ? 0.35 : 0.82, band: [0.6, 1] });
    m.prompt = () => 'Watch the glow through every class; tap [E] while it dips below the band';
    return m;
  },
});
