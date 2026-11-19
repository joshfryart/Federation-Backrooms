// CMO: ward rounds. Walk the biobed row with the medical tricorder: at each bed hold E with the tricorder on the patient's chest until the
// vitals settle (waving it off the chest restarts the read). Then at the duty nurse's station point at the one bed whose respiration has
// crept up from its chart figure and hold E to brief her. A patient with high but steady numbers is a decoy: the trend is what matters.
import { define, machine, room, ri, shuffle } from './kit.js';

const BEAR = [0.3, 0.1, -0.1, -0.3];
export default define({
  job: { billet: 'cmo', label: 'Ward rounds', type: 'loop' },
  title: 'Biobed row respiration drift', dept: 'medical', host: 'room', siteName: 'Bed', verb: 'Read', item: 'tricorder_med',
  how: 'Hold E with the tricorder on each patient until the vitals settle, then at the nurse station point at the bed whose breathing has crept up from its chart and hold E to brief.',
  keys: ['Aim with the view', 'E hold: read / brief'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'spot the drift', input: 'e-hold+look', win: 'all biobeds read on the chest and the patient whose respiration rose from the chart named to the duty nurse',
    fail: 'briefing a bed with high but steady numbers, or a bed that has not drifted at all',
    rule: 'Keep the tricorder on the chest while holding E until the read settles. At the station, aim at a bed number: the panel shows chart then now. Brief the bed whose breaths rose most, not the highest one.' },
  rush: 'Glanced at the monitors from the door and signed the ward round off.',
  captions: { 'missed deterioration': 'nurse frowns', 'off the chest': 'tricorder chirps' },
  says: { 'missed deterioration': 'That patient is steady — look for the one whose breathing has crept up from the chart.', 'off the chest': 'Keep the tricorder on the chest until the read settles.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Bed 1', prop: 'biobed' }, { name: 'Bed 2', prop: 'biobed' }, { name: 'Bed 3', prop: 'biobed' }, { name: 'Bed 4', prop: 'biobed' }, { name: 'Duty nurse', prop: 'nursestation' }]), r = m.rnd;
    const need = m.calm ? 1.1 : 0.9, tol = m.calm ? 0.09 : 0.07;
    const [drift, decoy] = shuffle(r, [0, 1, 2, 3]); m.beds = [];
    for (let k = 0; k < 4; k++) {
      let chart, now;
      if (k === drift) { chart = ri(r, 13, 15); now = chart + ri(r, 5, 7); } else if (k === decoy) { chart = ri(r, 21, 23); now = chart + ri(r, -1, 0); } else { chart = ri(r, 12, 17); now = chart + ri(r, -1, 1); }
      m.beds.push({ chart, now, hr: ri(r, 62, 88), read: 0, done: false });
    }
    m.drift = drift; m.decoy = decoy; m.brief = 0; m.aim = -1; m.wasOn = false;
    const aimBed = (look) => BEAR.findIndex(b => Math.abs((look || 0) - b) < tol);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next;
      if (i < 4) {
        const b = m.beds[i], on = Math.abs(inp.look || 0) < 0.2;
        if (inp.hold && on) { b.read += dt; m.wasOn = true; if (b.read >= need) { b.done = true; m.finish(i); m.wasOn = false; return; } }
        else if (inp.hold && m.wasOn && b.read > 0.3) { m.fault('off the chest'); b.read = 0; m.wasOn = false; }
        else if (!inp.hold) b.read = Math.max(0, b.read - dt);
        s.prog = b.read / need; return;
      }
      m.aim = aimBed(inp.look);
      if (inp.hold && m.aim >= 0) { m.brief += dt; if (m.brief >= 0.8) { if (m.aim === m.drift) { m.finish(i); return; } m.fault('missed deterioration'); m.brief = 0; } }
      else m.brief = 0;
      s.prog = m.brief / 0.8;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; if (i < 4) return { at: i, hold: true, look: 0 }; return { at: i, hold: true, look: BEAR[m.drift] }; };
    m.bad = (f = 0) => { const i = m.next; if (i < 4) return { at: i, hold: true, look: f % 40 < 20 ? 0 : 0.4 }; return { at: i, hold: true, look: BEAR[m.decoy] }; };
    m.view = () => ({ beds: m.beds.map(b => [b.chart, b.now]), drift: m.drift });
    m.panel = (i) => {
      if (i < 4) { const b = m.beds[i]; if (!b) return null; return { label: `Bed ${i + 1} vitals`, value: b.read >= need * 0.5 || b.done ? `RR ${b.now} · HR ${b.hr} (chart RR ${b.chart})` : 'settling…', bar: b.read / need }; }
      const a = m.aim; return a < 0 ? { label: 'Point at a bed', value: 'beds 1 – 4 left to right', bar: 0 } : { label: `Bed ${a + 1}`, value: `RR chart ${m.beds[a].chart} → now ${m.beds[a].now}`, bar: m.brief / 0.8 };
    };
    m.prompt = (i) => i < 4 ? 'Hold [E] with the tricorder on the chest until the vitals settle' : 'Aim at the bed whose breathing has crept up from its chart and hold [E] to brief the nurse';
    return m;
  },
});
