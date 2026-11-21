// Cargo: haul crates to sickbay and shelve them. The sickbay rack is a grid of three columns (dressings, drugs, cold chain) and two rows (low,
// high). Move the cursor with the arrows and drop the crate with Enter: heavy crates on the low row, the crate's own category column.
import { define, machine, ARROW, ENTER, ri, txt, box, COL } from './kit.js';

const COLS = ['Dressings', 'Drugs', 'Cold chain'];
export default define({
  job: { billet: 'cargo', label: 'Haul crates to sickbay and shelve them', type: 'task:medical_relief' },
  title: 'Sickbay rack drop', dept: 'services', host: 'console', tool: 'Sickbay rack and hand truck',
  how: 'Steer the cursor round the rack with the arrows and press Enter to drop the crate: its own category column, and heavy crates on the LOW row.',
  keys: ['arrows move the cursor', 'Enter drop the crate'], limit: 28, maxFaults: 3,
  fingerprint: { verb: 'drop on rack', input: 'arrows+enter',
    win: 'five crates dropped on the rack, each in its category column and every heavy one on the low row',
    fail: 'dropping a crate in the wrong column or a heavy crate on the high row',
    rule: 'The next crate shows its category and a weight tag. Move the cursor across the three columns and two rows and press Enter. Heavy crates need the low row; the column must match the category.' },
  rush: 'Dumped the crates inside the sickbay door for the nurses to sort.',
  captions: { 'wrong column': 'wrong shelf buzz', 'too high': 'heavy crate strain' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = m.calm ? 4 : 5;
    m.q = Array.from({ length: n }, () => ({ cat: ri(r, 0, 2), heavy: r() < 0.5 })); m.cx = 1; m.cy = 0; m.placed = []; m.rounds = n; m.round = 0;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), c = m.q[0]; if (!c) return false;
      if (a === 'L') m.cx = Math.max(0, m.cx - 1); else if (a === 'R') m.cx = Math.min(2, m.cx + 1); else if (a === 'U') m.cy = 0; else if (a === 'D') m.cy = 1;
      else if (ENTER(code)) { if (m.cx !== c.cat) m.fault('wrong column'); else if (c.heavy && m.cy === 0) m.fault('too high'); else { m.placed.push([m.cx, m.cy]); m.q.shift(); m.round++; if (!m.q.length) m.win(); } return true; }
      else return false; return true;
    };
    m.hint = () => { const c = m.q[0]; if (!c) return []; const ty = c.heavy ? 1 : m.cy; return m.cx < c.cat ? [['ArrowRight', true]] : m.cx > c.cat ? [['ArrowLeft', true]] : m.cy !== ty ? [['ArrowDown', true]] : [['Enter', true]]; };
    m.bad = () => { const c = m.q[0]; return m.cx === c.cat ? (m.cx === 0 ? 'ArrowRight' : 'ArrowLeft') : 'Enter'; };
    m.view = () => ({ q: m.q.map(c => [c.cat, c.heavy]) });
    m.buttons = () => [['ArrowLeft', '<'], ['ArrowUp', '^ high'], ['ArrowDown', 'low v'], ['ArrowRight', '>'], ['Enter', 'Drop']];
    m.draw = (c, W, H, P) => {
      const k = m.q[0]; txt(c, k ? `NEXT: ${COLS[k.cat]} crate, ${k.heavy ? 'HEAVY' : 'light'}   (${m.q.length} left)` : 'rack stocked', 12, 18, { size: 12, col: COL.gold });
      COLS.forEach((cn, x) => { txt(c, cn, 66 + x * 134, 40, { size: 11, align: 'center', col: COL.peri }); for (let y = 0; y < 2; y++) { const sel = x === m.cx && y === m.cy; box(c, 10 + x * 134, 48 + y * 58, 124, 50, sel ? 'rgba(244,194,91,.2)' : 'rgba(255,255,255,.05)', sel ? COL.gold : COL.dim, 6);
        const n = m.placed.filter(p => p[0] === x && p[1] === y).length; if (n) txt(c, `${n} crate${n > 1 ? 's' : ''}`, 72 + x * 134, 78 + y * 58, { size: 12, align: 'center' }); } });
      txt(c, 'high', 4, 76, { size: 8, col: COL.dim }); txt(c, 'low', 4, 134, { size: 8, col: COL.dim });
    };
    return m;
  },
});
