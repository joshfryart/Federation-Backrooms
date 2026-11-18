// Computer specialist: load manifest database and seal records. Each record's crate ID is checked digit by digit against the paper clipboard
// line. Move the cursor (Left / Right) onto any digit that differs and overtype it (the digit keys); press Enter to seal the record. A sealed
// record cannot be reopened, so sealing a crate ID that still differs from the clipboard is the fault.
import { define, machine, ARROW, DIG, ENTER, ri, txt, box, COL } from './kit.js';

const LEN = 5;
export default define({
  job: { billet: 'comp', label: 'Load manifest database and seal records', type: 'task:cargo_run' },
  title: 'Crate ID overtype and seal', dept: 'operations', host: 'console', tool: 'Manifest database record field',
  how: 'Compare the record\'s crate ID with the clipboard line under it. Move the cursor with Left / Right onto a wrong digit and type the right one (1-9). When the two lines agree, press Enter to seal the record.',
  keys: ['Left / Right move cursor', '1-9 overtype digit', 'Enter seal record'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'overtype and seal', input: 'digits+arrows+enter', win: 'every manifest record corrected digit by digit to its clipboard crate ID and sealed, seal count equal to crate count',
    fail: 'sealing a record whose crate ID still differs from the clipboard, mislabelling that crate from then on',
    rule: 'The record line sits above the clipboard line. Put the cursor on each digit that differs and type the clipboard digit (the cursor then steps right). Enter seals; seal only when every digit agrees.' },
  rush: 'Pressed seal down the whole manifest without looking at the clipboard.',
  captions: { 'sealed wrong ID': 'seal lock thunk, mismatch alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = 4, clean = ri(r, 0, n - 1);
    m.recs = Array.from({ length: n }, (_, i) => {
      const truth = Array.from({ length: LEN }, () => ri(r, 1, 9)), rec = truth.slice();
      if (i !== clean) {
        if (r() < 0.5) { const p = ri(r, 0, LEN - 2); if (rec[p] === rec[p + 1]) rec[p + 1] = rec[p + 1] % 9 + 1; else [rec[p], rec[p + 1]] = [rec[p + 1], rec[p]]; }
        else { const p = ri(r, 0, LEN - 1); rec[p] = (rec[p] + ri(r, 0, 7)) % 9 + 1; if (rec[p] === truth[p]) rec[p] = rec[p] % 9 + 1; }
      }
      return { pre: `C${ri(r, 1, 9)}-`, truth, rec, sealed: false, ok: false };
    });
    m.i = 0; m.cur = 0; m.rounds = n; m.round = 0;
    const R = () => m.recs[m.i], diff = () => R().rec.findIndex((d, k) => d !== R().truth[k]);
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), d = DIG(code), q = R();
      if (a === 'L' || a === 'R') { m.cur = Math.max(0, Math.min(LEN - 1, m.cur + (a === 'R' ? 1 : -1))); return true; }
      if (d) { q.rec[m.cur] = d; m.cur = Math.min(LEN - 1, m.cur + 1); return true; }
      if (!ENTER(code)) return false;
      q.sealed = true; q.ok = diff() < 0; if (!q.ok) m.fault('sealed wrong ID'); m.round++; m.ev('seal', { rec: m.i, ok: q.ok });
      if (m.state !== 'play') return true; if (m.i + 1 >= n) m.win(); else { m.i++; m.cur = 0; } return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const p = diff(); if (p < 0) return [['Enter', true]]; if (m.cur !== p) return [[m.cur < p ? 'ArrowRight' : 'ArrowLeft', true]]; return [['Digit' + R().truth[p], true]]; };
    m.bad = () => { const p = diff(); return p >= 0 ? 'Enter' : 'Digit' + (R().truth[m.cur] % 9 + 1); };
    m.view = () => ({ r: m.recs.map(q => [q.truth.join(''), q.rec.join('')]) });
    m.buttons = () => [['ArrowLeft', '◀'], ['ArrowRight', '▶'], ...Array.from({ length: 9 }, (_, k) => ['Digit' + (k + 1), String(k + 1)]), ['Enter', 'Seal']];
    m.draw = (c, W, H, P) => {
      const q = R(); txt(c, `RECORD ${m.i + 1} / ${m.recs.length}`, 14, 18, { size: 11, col: COL.dim });
      txt(c, 'DATABASE', 14, 52, { size: 10, col: COL.dim }); txt(c, 'CLIPBOARD', 14, 96, { size: 10, col: COL.dim });
      txt(c, q.pre, 90, 54, { size: 18, font: 'monospace', col: COL.gold }); txt(c, q.pre, 90, 98, { size: 18, font: 'monospace', col: COL.pale });
      for (let k = 0; k < LEN; k++) {
        const x = 130 + k * 30; box(c, x, 32, 26, 30, 'rgba(255,255,255,.05)', k === m.cur ? COL.orange : null, 4);
        txt(c, q.rec[k], x + 13, 54, { size: 18, font: 'monospace', align: 'center' }); txt(c, q.truth[k], x + 13, 98, { size: 18, font: 'monospace', align: 'center', col: COL.pale });
        if (k === m.cur) txt(c, '▲', x + 13, 74, { size: 10, align: 'center', col: COL.orange });
      }
      m.recs.forEach((x, k) => txt(c, `${k + 1} ${x.sealed ? (x.ok ? '■ sealed' : '✗ sealed wrong') : k === m.i ? '▶ open' : '· waiting'}`, 310, 30 + k * 20, { size: 11, col: x.sealed ? (x.ok ? P.good : P.bad) : COL.dim }));
      txt(c, `Sealed ${m.recs.filter(x => x.sealed).length} / crates ${m.recs.length}`, 14, H - 10, { size: 11, col: COL.dim });
    };
    return m;
  },
});
