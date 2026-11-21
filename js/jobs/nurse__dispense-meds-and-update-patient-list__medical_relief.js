// Nurse: dispense meds and update the patient list. Three checks per dose: pick the drug whose name matches the order (digit), draw the syringe
// to the dose line (hold Up, let go inside the band), then give it to the patient who says their own name back (digit).
import { define, machine, DIG, ARROW, ri, rf, shuffle, pick, txt, box, bar, COL } from './kit.js';

const DRUGS = ['Paracetamol', 'Ibuprofen', 'Cortizine', 'Hypospray A', 'Saline'], NAMES = ['Ens. Park', 'Lt. Nasser', 'PO Wick', 'Cpl. Duarte', 'Spc. Lowe'];
export default define({
  job: { billet: 'nurse', label: 'Dispense meds and update patient list', type: 'task:medical_relief' },
  title: 'Drug, dose and patient match', dept: 'medical', host: 'console', tool: 'Drug cabinet and syringe',
  how: 'For each order: press the digit of the drug named in the order, hold Up to draw the syringe and let go inside the dose band, then press the digit of the patient who answers to the order name.',
  keys: ['1-3 drug / patient', 'Up hold: draw', 'release at the line'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'match, draw, give', input: 'digits+arrows-hold', win: 'two doses each with the ordered drug taken, the syringe drawn to the dose band and given to the patient who says the ordered name',
    fail: 'taking the wrong drug, drawing past or short of the dose band, or giving to the wrong patient',
    rule: 'Step 1 digit picks the drug on the order. Step 2 hold Up draws; release with the plunger in the band. Step 3 digit picks the patient whose name matches.' },
  rush: 'Gave the usual dose from the tray without reading the order line.',
  captions: { 'wrong drug': 'cabinet lock clack', 'bad dose': 'syringe plunger click', 'wrong patient': 'patient chart buzz' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, band = m.calm ? 0.16 : 0.1; m.k = 0; m.st = 0; m.draw_ = 0; m.rounds = 2; m.round = 0;
    m.orders = Array.from({ length: 2 }, () => { const d = shuffle(r, DRUGS).slice(0, 3), p = shuffle(r, NAMES).slice(0, 3), a = ri(r, 0, 2), b = ri(r, 0, 2); return { drugs: d, pats: p, drug: a, pat: b, dose: rf(r, 0.45, 0.8) }; });
    const O = () => m.orders[Math.min(m.k, 1)];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code), up = ARROW(code) === 'U'; if (!up && (d < 1 || d > 3)) return false; const o = O();
      if (up) { if (m.st === 1) m.held.U = down; if (!down && m.st === 1 && m.draw_ > 0) { if (Math.abs(m.draw_ - o.dose) <= band) m.st = 2; else { m.fault('bad dose'); m.draw_ = 0; } } return true; }
      if (!down) return true;
      if (m.st === 0) { if (d - 1 === o.drug) m.st = 1; else m.fault('wrong drug'); } else if (m.st === 2) { if (d - 1 === o.pat) { m.k++; m.round = m.k; m.st = 0; m.draw_ = 0; if (m.k >= 2) m.win(); } else m.fault('wrong patient'); }
      return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.st === 1 && m.held.U) { m.draw_ = Math.min(1, m.draw_ + dt * 0.5); if (m.draw_ > O().dose + band + 0.12) { m.fault('bad dose'); m.draw_ = 0; m.held.U = false; } } };
    m.hint = () => { const o = O(); if (m.st === 0) return [['Digit' + (o.drug + 1), true]]; if (m.st === 2) return [['Digit' + (o.pat + 1), true]]; return [['ArrowUp', m.draw_ < o.dose]]; };
    m.bad = () => m.st === 0 ? 'Digit' + ((O().drug + 1) % 3 + 1) : 'Digit1';
    m.view = () => ({ orders: m.orders.map(o => [o.drugs, o.pats, o.drug, o.pat, +o.dose.toFixed(2)]) });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['ArrowUp', 'Draw (hold)']];
    m.draw = (c, W, H, P) => {
      const o = O(); txt(c, `Order: ${o.drugs[o.drug]} for ${o.pats[o.pat]}`, 14, 22, { size: 13, col: COL.gold });
      txt(c, m.st === 0 ? o.drugs.map((d, i) => `${i + 1} ${d}`).join('   ') : m.st === 2 ? o.pats.map((d, i) => `${i + 1} ${d}`).join('   ') : 'hold Up to draw, release in the band', 14, 54, { size: 12, col: COL.ink });
      bar(c, 14, 80, W - 28, 18, m.draw_, { band: [o.dose - band, o.dose + band], good: P.good }); txt(c, `step ${m.st + 1} of 3: ${['drug', 'dose', 'patient'][m.st]}`, 14, 130, { size: 12, col: COL.dim });
    };
    return m;
  },
});
