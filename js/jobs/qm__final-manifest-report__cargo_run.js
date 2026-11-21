// Quartermaster: final manifest report. The loading log lists pallets per deck line and sealed drums; key each total with the digits,
// Enter to submit the field (a wrong total is rejected), and press Space to sign only once both fields agree with the log.
import { define, machine, DIG, SPACE, ENTER, ri, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'qm', label: 'Final manifest report', type: 'task:cargo_run' },
  title: 'Sum the log, then sign', dept: 'services', host: 'console', tool: 'Stores console report',
  how: 'Add up the pallet lines and the drum lines from the loading log. Key the totals with the digits and Enter each field. When both are accepted, press Space to sign.',
  keys: ['1-9 key the total', 'Enter submit field', 'Space sign'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'sum and sign', input: 'digits+enter+space', win: 'pallet and drum totals keyed to match the loading log lines and the handover signed only after both were accepted',
    fail: 'submitting a total that does not equal the log lines, or pressing sign before both counts agree',
    rule: 'Add the loading log lines for pallets, key the total, Enter. Same for sealed drums. A wrong total is rejected and cleared. Space signs, and only works after both fields agree.' },
  rush: 'Signed the report off the manifest header without adding the loading log up.',
  captions: { mismatch: 'field rejected', 'signed early': 'signature refused' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, lines = (n, lo, hi) => Array.from({ length: n }, () => ri(r, lo, hi));
    let pal = lines(3, 2, 5); while ((pal.reduce((a, b) => a + b, 0) % 10) === 0) pal = lines(3, 2, 5);
    const dr = lines(2, 1, 4); m.F = [{ name: 'Pallets', lines: pal, want: pal.reduce((a, b) => a + b, 0), typed: '', ok: false }, { name: 'Sealed drums', lines: dr, want: dr.reduce((a, b) => a + b, 0), typed: '', ok: false }];
    m.f = 0; m.signed = false;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const F = m.F[m.f], d = DIG(code);
      if (d && F && F.typed.length < 2) F.typed += d;
      else if (ENTER(code) && F && F.typed) { if (+F.typed === F.want) { F.ok = true; m.f++; } else { m.fault('mismatch'); F.typed = ''; } }
      else if (SPACE(code)) { if (m.F.every(x => x.ok)) { m.signed = true; m.win(); } else m.fault('signed early'); } else return false; return true;
    };
    m.hint = () => { const F = m.F[m.f]; if (!F) return [['Space', true]]; const s = String(F.want); return F.typed.length < s.length ? [['Digit' + s[F.typed.length], true]] : [['Enter', true]]; };
    m.bad = () => { const F = m.F[m.f]; if (!F) return null; return F.typed ? ['Enter', true] : ['Space', true]; };
    m.view = () => ({ F: m.F.map(f => [f.name, f.lines]) });
    m.buttons = () => [['Enter', 'Submit'], ['Space', 'Sign']];
    m.draw = (c, W, H, P) => {
      m.F.forEach((F, i) => { const y = 14 + i * 62, on = i === m.f; box(c, 10, y, 380, 54, on ? COL.panel : 'rgba(255,255,255,.04)', on ? COL.gold : null);
        txt(c, `${F.name} log lines: ${F.lines.join(' + ')}`, 20, y + 20, { size: 12 }); txt(c, F.ok ? 'accepted ' + F.want : 'total: ' + (F.typed || '_'), 20, y + 42, { size: 14, col: F.ok ? P.good : COL.gold }); });
      txt(c, m.F.every(x => x.ok) ? 'both agree: Space to sign' : 'sign locked until both agree', 10, 150, { size: 11, col: COL.dim });
    };
    return m;
  },
});
