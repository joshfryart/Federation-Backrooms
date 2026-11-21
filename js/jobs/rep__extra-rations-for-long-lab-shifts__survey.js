// Replicator tech: extra rations for long lab shifts. For each shift, count the techs marked ON on the roster and key that number (1-9), then check the
// nutrition tag the output tray shows. A MISMATCH tag has to be swapped (Space) before Enter prints the batch.
import { define, machine, SPACE, ENTER, DIG, ri, pick, shuffle, txt, box, COL } from './kit.js';

const NAMES = ['Okafor', 'Lindqvist', 'Reyes', 'Hale', 'Tanaka', 'Moreau', 'Bishop', 'Adeyemi', 'Costa', 'Novak'];
export default define({
  job: { billet: 'rep', label: 'Extra rations for long lab shifts', type: 'task:survey' },
  title: 'Roster count then print', dept: 'services', host: 'console', tool: 'Replicator touch screen',
  how: 'Count the techs marked ON in the shift roster and press that digit. If the nutrition tag reads MISMATCH, press Space to swap the pattern. Then press Enter to print.',
  keys: ['1-9 key the count', 'Space swap tag', 'Enter print'], limit: 34, maxFaults: 2,
  fingerprint: { verb: 'key roster count', input: 'digits+enter+space', win: 'three shift batches each printed at the exact ON-roster count with any mismatched nutrition tag swapped first',
    fail: 'printing a quantity that differs from the number of techs on shift or printing with a mismatched tag',
    rule: 'Count the ON names, press that digit, swap a MISMATCH tag with Space, then Enter prints. Off-shift names do not get a ration.' },
  rush: 'Printed the usual number of rations for every shift without reading the roster.',
  captions: { 'count off': 'touch screen reject beep', 'wrong tag': 'nutrition tag alarm', 'needless swap': 'dull double tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; m.k = 0; m.qty = 0; m.swapped = false; m.rounds = 3; m.round = 0;
    m.shifts = Array.from({ length: 3 }, (_, i) => { const n = ri(r, 4, 8), on = shuffle(r, NAMES).slice(0, n).map(x => [x, r() < 0.65]); if (!on.some(x => x[1])) on[0][1] = true; return { roster: on, need: on.filter(x => x[1]).length, bad: i === 1 || r() < 0.3 }; });
    const S = () => m.shifts[Math.min(m.k, 2)];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code); if (!SPACE(code) && !ENTER(code) && (d < 1 || d > 9)) return false; if (!down) return true; const s = S();
      if (d) m.qty = d; else if (SPACE(code)) { if (s.bad && !m.swapped) m.swapped = true; else m.fault('needless swap'); }
      else if (m.qty !== s.need) m.fault('count off'); else if (s.bad && !m.swapped) m.fault('wrong tag');
      else { m.k++; m.round = m.k; m.qty = 0; m.swapped = false; if (m.k >= 3) m.win(); }
      return true;
    };
    m.hint = () => { const s = S(); if (m.qty !== s.need) return [['Digit' + s.need, true]]; if (s.bad && !m.swapped) return [['Space', true]]; return [['Enter', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ shifts: m.shifts.map(s => [s.roster, s.bad]) });
    m.buttons = () => [['Space', 'Swap tag'], ['Enter', 'Print']];
    m.draw = (c, W, H, P) => {
      const s = S(); txt(c, `Shift ${Math.min(m.k + 1, 3)} roster`, 14, 22, { size: 14, col: COL.gold });
      s.roster.forEach(([n, on], i) => { const x = 14 + (i % 4) * 96, y = 36 + Math.floor(i / 4) * 30; box(c, x, y, 88, 24, on ? 'rgba(125,151,232,.25)' : 'rgba(255,255,255,.04)', on ? COL.peri : null, 6); txt(c, `${n} ${on ? 'ON' : 'off'}`, x + 6, y + 16, { size: 11, col: on ? COL.ink : COL.dim }); });
      txt(c, `quantity keyed: ${m.qty || '-'}`, 14, 120, { size: 14 }); txt(c, `tag: ${s.bad && !m.swapped ? 'MISMATCH' : 'matches'}`, 14, 144, { size: 12, col: s.bad && !m.swapped ? P.bad : P.good });
    };
    return m;
  },
});
