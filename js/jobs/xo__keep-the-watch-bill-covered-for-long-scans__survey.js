// XO: keep the watch bill covered for long scans. The bill is a grid: two posts, nine hours of scan. Every officer on the reserve list covers a fixed
// block (1 = two hours, 2 = three hours, 3 = four hours). Move the cursor to the first uncovered hour of a post with the arrow keys and press an
// officer's number to lay their block from there. Blocks may not overlap or run past the end of the scan, and no hour may be left bare.
import { define, machine, ARROW, DIG, ri, pick, txt, box, COL } from './kit.js';

const H = 9, LEN = [0, 2, 3, 4];
export default define({
  job: { billet: 'xo', label: 'Keep the watch bill covered for long scans', type: 'task:survey' },
  title: 'Tile the watch bill', dept: 'command', host: 'console', tool: 'Ready room watch bill grid',
  how: 'Arrows move the cursor over the two posts\' nine hours. Press 1 (2 h), 2 (3 h) or 3 (4 h) to lay that officer\'s block starting at the cursor. Cover every hour exactly.',
  keys: ['arrows: move the cursor', '1 / 2 / 3: lay a 2 / 3 / 4 hour block'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'tile the hours', input: 'arrows+digits',
    win: 'both posts\' nine scan hours exactly covered by laid officer blocks of two, three and four hours with no overlap',
    fail: 'laying a block over hours already covered, or running one past the end of the scan',
    rule: 'Put the cursor on an uncovered hour and press a block length (1, 2, 3). The block must fit in uncovered hours up to the end of the scan; the bill is done when every hour is covered.' },
  rush: 'Asked the watch already on post to stay on for the whole scan.',
  captions: { overlap: 'officer double-booked on those hours', overrun: 'block runs past the end of the scan' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; m.cr = 0; m.cc = 0; m.rows = 2; m.grid = Array.from({ length: 2 }, () => Array(H).fill(0)); m.plan = [];
    for (let row = 0; row < 2; row++) { let parts; do { parts = []; let s = 0; while (s < H) { const l = pick(r, [2, 3, 4]); parts.push(l); s += l; } } while (parts.reduce((a, b) => a + b, 0) !== H); let at = 0; for (const l of parts) { m.plan.push({ row, at, d: l - 1 }); at += l; } }
    m.plan.sort((a, b) => a.at - b.at || a.row - b.row);
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), d = DIG(code);
      if (a) { if (down) { if (a === 'L') m.cc = Math.max(0, m.cc - 1); if (a === 'R') m.cc = Math.min(H - 1, m.cc + 1); if (a === 'U') m.cr = 0; if (a === 'D') m.cr = 1; } return true; }
      if (d < 1 || d > 3) return false; if (!down) return true; const len = LEN[d];
      if (m.cc + len > H) { m.fault('overrun'); return true; } if (m.grid[m.cr].slice(m.cc, m.cc + len).some(x => x)) { m.fault('overlap'); return true; }
      for (let i = 0; i < len; i++) m.grid[m.cr][m.cc + i] = d; if (m.grid.every(g => g.every(x => x))) m.win(); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => {
      if (m.state !== 'play') return []; const p = m.plan.find(q => !m.grid[q.row][q.at]); if (!p) return [];
      if (m.cr !== p.row) return [[p.row ? 'ArrowDown' : 'ArrowUp', true]]; if (m.cc !== p.at) return [[m.cc < p.at ? 'ArrowRight' : 'ArrowLeft', true]]; return [['Digit' + (p.d), true]];
    };
    m.bad = () => 'Digit3';
    m.view = () => ({ plan: m.plan.map(p => [p.row, p.at, p.d]) });
    m.buttons = () => [['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['ArrowUp', '▲ post A'], ['ArrowDown', '▼ post B'], ['Digit1', '2 h'], ['Digit2', '3 h'], ['Digit3', '4 h']];
    m.draw = (c, W, H2, P) => {
      for (let row = 0; row < 2; row++) { txt(c, row ? 'Post B' : 'Post A', 10, 52 + row * 54, { size: 11, col: COL.dim });
        for (let i = 0; i < H; i++) { const x = 64 + i * 36, y = 30 + row * 54, v = m.grid[row][i]; box(c, x, y, 34, 32, v ? ['', '#3a4a7a', '#4a3a7a', '#7a4a4a'][v] : COL.panel, m.cr === row && m.cc === i ? COL.gold : COL.dim, 3); if (v) txt(c, `${LEN[v]}h`, x + 17, y + 20, { size: 11, align: 'center' }); } }
      for (let i = 0; i < H; i++) txt(c, `h${i + 1}`, 81 + i * 36, 24, { size: 8, align: 'center', col: COL.dim }); txt(c, 'hours bare: ' + m.grid.flat().filter(x => !x).length, 14, 160, { size: 10, col: COL.dim });
    };
    return m;
  },
});
