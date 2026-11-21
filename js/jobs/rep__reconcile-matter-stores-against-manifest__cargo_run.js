// Replicator tech: reconcile matter stores against the manifest. Work down the manifest lines in order. Find the canister with that label on the shelf
// (Left/Right) and scan it (Space): it moves to the done shelf and cannot be scanned again. If no canister on the shelf carries the label, report the shortage (Enter).
import { define, machine, SPACE, ENTER, ARROW, ri, shuffle, txt, box, COL } from './kit.js';

const LAB = ['M4', 'H2', 'C7', 'K1', 'D9', 'R3', 'N5', 'B8', 'T6', 'F2'];
export default define({
  job: { billet: 'rep', label: 'Reconcile matter stores against manifest', type: 'task:cargo_run' },
  title: 'Scan once, shelve, report short', dept: 'services', host: 'console', tool: 'Label scanner',
  how: 'Move the cursor with Left/Right to the canister matching the current manifest line and press Space to scan it. If that label is nowhere on the shelf, press Enter to report it short.',
  keys: ['Left/Right move', 'Space scan', 'Enter report short'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'scan and shelve', input: 'arrows+space+enter', win: 'four manifest lines each scanned once to the done shelf or reported short when no matching canister remains',
    fail: 'scanning a canister that is already counted, scanning the wrong label for the line or reporting a shortage that is on the shelf',
    rule: 'Manifest lines come in order. Space scans the canister under the cursor: it must match the line and not be already done. Enter reports a line whose label is not on the shelf.' },
  rush: 'Ticked the manifest from the total count without scanning each label.',
  captions: { 'double count': 'scanner double-beep', 'wrong line': 'scanner reject tone', 'false shortage': 'dull double tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; const L = shuffle(r, LAB);
    m.shelf = L.slice(0, 6).map(l => ({ l, done: false }));
    m.lines = shuffle(r, [m.shelf[1].l, m.shelf[3].l, m.shelf[5].l, L[8]]); m.k = 0; m.cur_ = 0; m.rounds = 4; m.round = 0;
    const adv = () => { m.k++; m.round = m.k; if (m.k >= 4) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code); if (!SPACE(code) && !ENTER(code) && a !== 'L' && a !== 'R') return false; if (!down) return true; const want = m.lines[m.k]; if (!want) return true;
      if (a === 'L') m.cur_ = Math.max(0, m.cur_ - 1); else if (a === 'R') m.cur_ = Math.min(5, m.cur_ + 1);
      else if (SPACE(code)) { const c = m.shelf[m.cur_]; if (c.done) m.fault('double count'); else if (c.l !== want) m.fault('wrong line'); else { c.done = true; adv(); } }
      else if (m.shelf.some(c => c.l === want && !c.done)) m.fault('false shortage'); else adv();
      return true;
    };
    m.hint = () => { const want = m.lines[m.k]; if (!want) return []; const i = m.shelf.findIndex(c => c.l === want && !c.done); if (i < 0) return [['Enter', true]]; return [[i === m.cur_ ? 'Space' : i > m.cur_ ? 'ArrowRight' : 'ArrowLeft', true]]; };
    m.bad = () => 'Space';
    m.view = () => ({ shelf: m.shelf.map(c => c.l), lines: m.lines.slice() });
    m.buttons = () => [['ArrowLeft', '<'], ['ArrowRight', '>'], ['Space', 'Scan'], ['Enter', 'Report short']];
    m.draw = (c, W, H, P) => {
      txt(c, 'Manifest: ' + m.lines.map((l, i) => i < m.k ? '[' + l + ' ✓]' : i === m.k ? '>' + l + '<' : l).join('  '), 14, 22, { size: 13, col: COL.gold });
      m.shelf.forEach((s, i) => { const x = 14 + i * 63; box(c, x, 50, 54, 46, s.done ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.1)', i === m.cur_ ? COL.orange : COL.dim, 8); txt(c, s.l, x + 12, 80, { size: 16, col: s.done ? COL.dim : COL.ink }); if (s.done) txt(c, 'done', x + 10, 108, { size: 10, col: P.good }); });
      txt(c, 'shelf', 14, 130, { size: 11, col: COL.dim });
    };
    return m;
  },
});
