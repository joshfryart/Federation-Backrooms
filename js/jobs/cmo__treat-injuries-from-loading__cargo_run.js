// CMO: treat injuries from loading (cargo run). Two injured loaders. For each: at the hypospray's dose menu aim at the weight band that
// matches the loader's chart weight and tap E. At the arm, hold E to press the hypospray on and count two seconds in your head (there is
// no meter): lift off between about 1.8 and 2.6 s. Then hold the moulded splint on the wrist with E and keep perfectly still until it sets.
import { define, machine, room, ri } from './kit.js';

const BANDS = [['50 – 65 kg', 0.3, 50, 65], ['66 – 80 kg', 0.1, 66, 80], ['81 – 95 kg', -0.1, 81, 95], ['96 – 110 kg', -0.3, 96, 110]];
export default define({
  job: { billet: 'cmo', label: 'Treat injuries from loading', type: 'task:cargo_run' },
  title: 'Weight-band hypo and still splint', dept: 'medical', host: 'room', siteName: 'Treatment step', verb: 'Treat', item: 'hypospray',
  how: 'Aim at the dose row for the loader\'s weight and tap E, press the hypospray with E for a counted two seconds, then hold the splint on with E without moving until it sets.',
  keys: ['Aim + E tap: dose row', 'E hold: hypospray (count 2 s)', 'E hold, keep still: splint'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'dose and splint', input: 'e-tap+e-hold+look+turn', win: 'both loaders dosed from the right weight band, the hypospray held a counted two seconds and the wrist splint set without movement',
    fail: 'picking a dose row for the wrong weight, lifting the hypospray early or late, or moving while the splint sets',
    rule: 'Read the chart weight and tap E on its row. Hold E on the arm and count two seconds yourself: no meter. Then hold E on the splint and keep your view still; any turn before it sets loosens it.' },
  rush: 'Gave a standard dose without the weight and strapped the wrist with tape.',
  captions: { 'wrong dose for weight': 'dose menu buzzes', 'dose not delivered': 'hypo hisses short', 'bruised the arm': 'patient yelps', 'loose splint': 'splint slips' },
  says: { 'wrong dose for weight': 'That row does not match the loader\'s weight.', 'dose not delivered': 'Lifted too soon — count the full two seconds.', 'bruised the arm': 'Held too long — that will bruise.', 'loose splint': 'You moved — the splint slipped before it set.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Dose menu, loader 1', prop: 'med_dispenser' }, { name: 'Arm, loader 1', prop: 'biobed' }, { name: 'Wrist splint, loader 1', prop: 'biobed' },
      { name: 'Dose menu, loader 2', prop: 'med_dispenser' }, { name: 'Arm, loader 2', prop: 'exam_couch' }, { name: 'Wrist splint, loader 2', prop: 'exam_couch' }]), r = m.rnd;
    const tol = m.calm ? 0.08 : 0.065, lo = m.calm ? 1.6 : 1.8, hi = m.calm ? 2.9 : 2.6, still = m.calm ? 0.45 : 0.3, set = 1.8;
    m.pt = [0, 1].map(() => { const b = ri(r, 0, 3); return { band: b, kg: ri(r, BANDS[b][2], BANDS[b][3]) }; });
    m.hold = 0; m.aim = -1;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, p = m.pt[i / 3 | 0], k = i % 3;
      if (k === 0) { m.aim = BANDS.findIndex(([, b]) => Math.abs((inp.look || 0) - b) < tol); if (inp.press && m.aim >= 0) { if (m.aim === p.band) { m.finish(i); m.hold = 0; return; } m.fault('wrong dose for weight'); } return; }
      if (k === 1) { if (inp.hold) { m.hold += dt; if (m.hold > 3.4) { m.fault('bruised the arm'); m.hold = -9; } }
        else if (rel) { if (m.hold >= lo && m.hold <= hi) { m.finish(i); m.hold = 0; return; } if (m.hold > 0) m.fault('dose not delivered'); m.hold = 0; }
        if (!inp.hold && m.hold < 0) m.hold = 0; s.prog = 0.3; return; }
      if (inp.hold) { if ((inp.turn || 0) > still) { m.fault('loose splint'); m.hold = -0.6; } else { m.hold += dt; if (m.hold >= set) { m.finish(i); m.hold = 0; return; } } } else m.hold = 0;
      s.prog = Math.max(0, m.hold / set);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const p = m.pt[i / 3 | 0], k = i % 3;
      if (k === 0) return { at: i, look: BANDS[p.band][1], press: f % 2 === 0, hold: f % 2 === 0 };
      if (k === 1) return { at: i, hold: m.hold < (lo + hi) / 2 }; return { at: i, hold: true, turn: 0 }; };
    m.bad = (f = 0) => { const i = m.next, p = m.pt[i / 3 | 0], k = i % 3; if (k === 0) return { at: i, look: BANDS[(p.band + 2) % 4][1], press: f % 4 === 0, hold: f % 4 === 0 }; return { at: i, hold: f % 30 < 8 }; };
    m.view = () => ({ p: m.pt.map(p => p.kg) });
    m.panel = (i) => { const p = m.pt[i / 3 | 0], k = i % 3; if (!p) return null;
      if (k === 0) return { label: `Loader ${(i / 3 | 0) + 1}: chart weight ${p.kg} kg`, value: m.aim >= 0 ? `row ${BANDS[m.aim][0]}` : 'aim at a dose row', bar: 0 };
      if (k === 1) return { label: 'Hypospray on the arm', value: m.hold > 0 ? 'pressing… count it' : 'hold [E] and count two seconds', bar: 0 };
      return { label: 'Moulded splint', value: m.hold > 0 ? 'setting: keep still' : 'hold [E] to press it on', bar: Math.max(0, m.hold / set) }; };
    m.prompt = (i) => ['Aim at the dose row for the chart weight and tap [E]', 'Hold [E] to press the hypospray and let go after two seconds', 'Hold [E] on the splint and do not move until it sets'][i % 3] || '';
    return m;
  },
});
