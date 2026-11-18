// Transporter chief: report the shakedown results to ops. Each line of the test log gives a subsystem's reading against its limit and the
// script step it came from. Grade each line on the report form: 1 pass (at most 90 % of the limit), 3 conditional (over 90 % but within the
// limit), 2 fail (over the limit). A fail must carry its step number, keyed next, so ops can act on it. Submit (Enter) only when the form's
// tally matches the number of steps in the script.
import { define, machine, DIG, ENTER, ri, rf, shuffle, txt, box, COL } from './kit.js';

const SUB = ['Buffer residual', 'Emitter coil 2 offset', 'Lock acquire time', 'Coil 4 temperature', 'Biofilter flow loss', 'Phase drift', 'Pad 3 alignment', 'Inert mass loss'];
const UNIT = ['ppm', 'mm', 's', 'K', '%', 'µrad', 'mm', 'kg'];
export default define({
  job: { billet: 'tchief', label: 'Report results to ops', type: 'task:shakedown' },
  title: 'Shakedown report graded line by line', dept: 'operations', host: 'console', tool: 'Ops report form',
  how: 'For each log line key 1 pass, 3 conditional (over 90 % of the limit) or 2 fail (over the limit); after a fail, key the step number it came from. Press Enter to send once every script step is on the form.',
  keys: ['1 pass · 2 fail · 3 conditional', '1-9 step number after a fail', 'Enter send to ops'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'grade and cite', input: 'digits+enter', win: 'every test log line graded pass, conditional or fail from its reading against the limit, each failure cited with its step number, and the report sent with a full tally',
    fail: 'grading a reading on the wrong side of its limit, citing the wrong step for a failure, or sending the report short',
    rule: 'Reading ≤ 90 % of limit: 1. Over 90 % but ≤ limit: 3. Over the limit: 2, then the step digit shown on that line. Enter only when the tally equals the script count.' },
  rush: 'Sent ops a one-line summary: "some issues, details to follow".',
  captions: { 'wrong grade': 'form error tone', 'vague entry': 'form error tone', 'sent short': 'send rejected' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, N = 5, steps = shuffle(r, [1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, N).sort((a, b) => a - b);
    const idx = shuffle(r, SUB.map((_, k) => k)).slice(0, N), grades = shuffle(r, [2, 3, 1, ...Array.from({ length: N - 3 }, () => ri(r, 1, 3))]);
    m.lines = idx.map((k, j) => { const lim = +rf(r, 1, 9).toFixed(1), g = grades[j], f = g === 1 ? rf(r, 0.4, 0.85) : g === 3 ? rf(r, 0.93, 0.99) : rf(r, 1.08, 1.4);
      return { name: SUB[k], unit: UNIT[k], lim, val: +(lim * f).toFixed(2), step: steps[j], grade: g, mark: 0, cite: 0 }; });
    m.k = 0; m.awaitStep = false; m.sent = false; m.rounds = N; m.round = 0;
    const L = () => m.lines[m.k];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code);
      if (!d && !ENTER(code)) return false; if (!down) return true; const l = L();
      if (ENTER(code)) { if (l) m.fault('sent short'); else { m.sent = true; m.win(); } return true; }
      if (!l) return true;
      if (m.awaitStep) { if (d === l.step) { l.cite = d; m.awaitStep = false; m.k++; m.round++; } else m.fault('vague entry'); return true; }
      if (d > 3) return true; if (d !== l.grade) { m.fault('wrong grade'); return true; }
      l.mark = d; if (d === 2) m.awaitStep = true; else { m.k++; m.round++; }
      return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const l = L(); if (!l) return [['Enter', true]]; return [['Digit' + (m.awaitStep ? l.step : l.grade), true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ lines: m.lines.map(l => [l.name, l.val, l.lim, l.step]) });
    m.buttons = () => [...Array.from({ length: 9 }, (_, i) => ['Digit' + (i + 1), String(i + 1)]), ['Enter', 'Send']];
    m.draw = (c, W, H, P) => {
      txt(c, 'TEST LOG', 14, 14, { size: 10, col: COL.dim }); txt(c, 'GRADE', 320, 14, { size: 10, col: COL.dim });
      m.lines.forEach((l, j) => {
        const y = 20 + j * 24, on = j === m.k; box(c, 8, y, W - 16, 21, on ? 'rgba(240,147,58,.16)' : 'rgba(255,255,255,.03)', on ? COL.orange : null, 5);
        txt(c, `step ${l.step}`, 14, y + 15, { size: 10, col: COL.dim }); txt(c, l.name, 60, y + 15, { size: 11, col: COL.ink });
        txt(c, `${l.val} / limit ${l.lim} ${l.unit}`, 300, y + 15, { size: 11, align: 'right', col: COL.gold, font: 'monospace' });
        const g = l.mark === 1 ? 'PASS' : l.mark === 3 ? 'COND' : l.mark === 2 ? (l.cite ? `FAIL @${l.cite}` : 'FAIL @?') : '';
        txt(c, g, W - 14, y + 15, { size: 11, align: 'right', col: l.mark === 1 ? P.good : l.mark === 2 ? P.bad : COL.warn });
      });
      const done = m.lines.filter(l => l.mark && (l.mark !== 2 || l.cite)).length;
      txt(c, m.awaitStep ? 'Key the step number of this failure' : L() ? '1 pass · 3 conditional (>90 %) · 2 fail (> limit)' : 'Tally matches the script: Enter sends to ops', 14, H - 12, { size: 11, col: L() ? COL.dim : P.good });
      txt(c, `tally ${done} / ${m.lines.length}`, W - 14, H - 12, { size: 11, align: 'right', col: COL.dim });
    };
    return m;
  },
});
