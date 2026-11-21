// Quartermaster: audit the stores bins. Tally each bin item by item with the clicker (Space), including the rows behind the front row, then
// judge it against the ledger line: Up when it matches, Down when the count is short.
import { define, machine, ARROW, SPACE, ri, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'qm', label: 'Audit food and spares stores', type: 'loop' },
  title: 'Tally behind the front row', dept: 'services', host: 'console', tool: 'Tally clicker and bin ledger',
  how: 'Press Space once per item in the bin, front and back rows. When your tally is the full count, press Up if it equals the ledger line, Down if it is short.',
  keys: ['Space click per item', 'Up matches ledger', 'Down short'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'tally and judge', input: 'arrows+space', win: 'three bins counted item by item, each judged matching or short against its ledger line',
    fail: 'clicking past or short of the true count, or calling a short bin matching or a full bin short',
    rule: 'Click the tally once for every item including the dim rows behind the front row. Then Up if the total equals the ledger figure, Down if the ledger says more than you counted.' },
  rush: 'Copied last watch\'s figures off the ledger and counted only the front of each bin.',
  captions: { miscount: 'tally buzzer', 'wrong call': 'ledger mismatch flagged' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    m.bins = [0, 1, 2].map(i => { const w = ri(r, 2, 3), d = ri(r, 2, 3), gap = ri(r, 0, 1), n = w * d - gap, short = i === 1 || r() < 0.3; return { w, d, n, ledger: n + (short ? ri(r, 1, 3) : 0), tally: 0 }; });
    m.k = 0; m.round = 0; m.rounds = 3;
    const done = () => { m.k++; m.round = m.k; if (m.k >= 3) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const b = m.bins[m.k]; if (!b) return true; const a = ARROW(code);
      if (SPACE(code)) { b.tally++; if (b.tally > b.n) { m.fault('miscount'); b.tally = 0; } return true; }
      if (a === 'U' || a === 'D') { const shortLedger = b.ledger > b.n; if (b.tally !== b.n) { m.fault('miscount'); b.tally = 0; } else if ((a === 'D') !== shortLedger) m.fault('wrong call'); else done(); return true; }
      return false;
    };
    m.hint = () => { const b = m.bins[m.k]; if (!b) return []; return b.tally < b.n ? [['Space', true]] : [[b.ledger > b.n ? 'ArrowDown' : 'ArrowUp', true]]; };
    m.bad = () => { const b = m.bins[m.k]; return b ? [b.ledger > b.n ? 'ArrowUp' : 'ArrowDown', true] : null; };
    m.view = () => ({ bins: m.bins.map(b => [b.w, b.d, b.n, b.ledger]) });
    m.buttons = () => [['Space', 'Click'], ['ArrowUp', 'Matches'], ['ArrowDown', 'Short']];
    m.draw = (c, W, H, P) => {
      const b = m.bins[m.k] || m.bins[2]; txt(c, `Bin ${m.k + 1} of 3   ledger ${b.ledger}`, 10, 18, { size: 13, col: COL.pale }); txt(c, `tally ${b.tally}`, 300, 18, { size: 16, col: COL.gold });
      let left = b.n; for (let row = 0; row < b.d; row++) for (let k = 0; k < b.w; k++) { const on = left-- > 0; box(c, 30 + k * 40 + row * 18, 40 + row * 16, 32, 24, on ? (row ? COL.dim : COL.peri) : null, on ? '#05060b' : COL.dim, 4); }
      txt(c, 'front row bright, rows behind are dim', 10, 150, { size: 10, col: COL.dim });
    };
    return m;
  },
});
