// Botanist, medical relief: deliver extracts to sickbay. At each biobed the nurse holds up the patient chart. Pick the vial from the padded case
// whose label names this patient and this extract (the case also carries look-alikes for other beds), then speak the dose aloud by keying its
// figures and Enter so the nurse can confirm and sign. A vial for the wrong patient goes back (a fault); a dose read back wrong is unverified and
// has to be said again (a fault).
import { define, machine, DIG, ENTER, pick, shuffle, txt, box, COL } from './kit.js';

const NAMES = ['Ens. Tavik', 'Lt. Okafor', 'CPO Brannigan', 'Ens. Sato', 'Lt. Rhee', 'Crewman Dax', 'Ens. Vossberg', 'Lt. Amaro'];
const EXTRACTS = ['Willow bark', 'Feverfew', 'Comfrey', 'Valerian', 'Leola tincture', 'Calendula'];
const DOSES = [12, 15, 25, 35, 45, 75, 125, 225, 18, 64];
export default define({
  job: { billet: 'bot', label: 'Deliver extracts to sickbay', type: 'task:medical_relief' },
  title: 'Vial handover with dose read-back', dept: 'sciences', host: 'console', tool: 'Padded vial case and patient chart',
  how: 'Press the number of the vial whose label matches the chart’s patient and extract, then key the dose figures from the label and Enter to say it aloud for the nurse.',
  keys: ['1-4 hand over vial', '1-9 dose figures', 'Enter say the dose'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'read back', input: 'digits+enter', win: 'three vials handed to the right patients with each dose spoken back exactly and signed',
    fail: 'handing a look-alike vial to the wrong patient, or speaking a dose that does not match the chart',
    rule: 'Match the chart name and extract against four vial labels, press that vial, then type the dose in mg and press Enter. The nurse signs only on an exact read-back.' },
  rush: 'Left the vials on the nurse station with a sticky note.',
  captions: { 'wrong patient': 'nurse hands the vial back', 'misspoken dose': 'nurse: say again?' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, names = shuffle(r, NAMES);
    m.beds = [0, 1, 2].map(k => ({ who: names[k], ext: pick(r, EXTRACTS), dose: pick(r, DOSES) }));
    m.cases = m.beds.map((b, k) => { const decoy = [{ who: names[3 + k], ext: b.ext, dose: pick(r, DOSES) }, { who: b.who, ext: pick(r, EXTRACTS.filter(e => e !== b.ext)), dose: b.dose }, { who: names[6 + (k % 2)], ext: pick(r, EXTRACTS), dose: pick(r, DOSES) }];
      return shuffle(r, [{ ...b, ok: true }, ...decoy]); });
    m.k = 0; m.ph = 0; m.typed = ''; m.rounds = 3; m.round = 0;
    const B = () => m.beds[m.k];
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code);
      if (m.ph === 0 && d >= 1 && d <= 4) { if (m.cases[m.k][d - 1].ok) m.ph = 1; else m.fault('wrong patient'); return true; }
      if (m.ph === 1 && d) { if (m.typed.length < 4) m.typed += d; return true; }
      if (m.ph === 1 && ENTER(code)) { if (m.typed === String(B().dose)) { B().signed = true; m.k++; m.round++; m.ph = 0; m.typed = ''; if (m.k >= 3) m.win(); } else { m.fault('misspoken dose'); m.typed = ''; } return true; }
      return d > 0 || ENTER(code);
    };
    m.hint = () => { const b = B(); if (!b) return []; if (m.ph === 0) return [['Digit' + (m.cases[m.k].findIndex(v => v.ok) + 1), true]];
      const s = String(b.dose); return m.typed.length < s.length ? [['Digit' + s[m.typed.length], true]] : [['Enter', true]]; };
    m.bad = () => { if (!B()) return null; return m.ph === 0 ? 'Digit' + (m.cases[m.k].findIndex(v => !v.ok) + 1) : 'Enter'; };
    m.view = () => ({ beds: m.beds.map(b => [b.who, b.ext, b.dose]), cases: m.cases.map(c => c.map(v => v.who)) });
    m.buttons = () => [...'123456789'].map(n => ['Digit' + n, n]).concat([['Enter', 'Say']]);
    m.draw = (c, W, H, P) => {
      const b = B() || m.beds[2]; box(c, 12, 12, 150, 70, 'rgba(255,255,255,.05)', COL.peri, 8);
      txt(c, 'PATIENT CHART', 20, 28, { size: 10, col: COL.peri }); txt(c, b.who, 20, 46, { size: 13 }); txt(c, `${b.ext}  ${b.dose} mg`, 20, 64, { size: 11, col: COL.gold });
      (m.cases[Math.min(m.k, 2)]).forEach((v, i) => { const x = 176 + (i % 2) * 110, y = 12 + Math.floor(i / 2) * 38; box(c, x, y, 104, 32, 'rgba(255,255,255,.05)', m.ph === 1 && v.ok ? P.good : null, 6);
        txt(c, `${i + 1}  ${v.who}`, x + 6, y + 13, { size: 9 }); txt(c, `${v.ext} ${v.dose} mg`, x + 6, y + 26, { size: 9, col: COL.pale }); });
      txt(c, m.ph === 0 ? 'Hand over a vial: press 1-4' : `Say the dose: ${m.typed || '_'} mg  [Enter]`, 12, 108, { size: 12, col: m.ph ? COL.gold : COL.ink });
      m.beds.forEach((x, i) => txt(c, `${x.signed ? '✓ signed' : i === m.k ? '◀ now' : '·'} ${x.who}`, 12 + i * 128, 150, { size: 10, col: x.signed ? P.good : COL.dim }));
    };
    return m;
  },
});
