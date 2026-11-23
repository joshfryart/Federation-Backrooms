// Galley: restock the mess before the second sweep. The sacks are heavy: lifting one takes two hands. Hold the sack's number key AND Space together,
// both held, for three quarters of a second to hoist it onto the trolley; let either go early and the sack drops. The trolley is loaded in the order the
// items run out, soonest first, where meals left is the stock divided by the use per meal. Two pantry sheets of four sacks each.
import { define, machine, DIG, SPACE, ri, shuffle, txt, box, bar, COL } from './kit.js';

const NAMES = ['rice', 'flour', 'beans', 'oats', 'lentils', 'sugar', 'salt', 'pasta'];
export default define({
  job: { billet: 'galley', label: 'Restock the mess before the second sweep', type: 'task:survey' },
  title: 'Two-handed sack lift, soonest first', dept: 'services', host: 'console', tool: 'Pantry sheet and sack trolley',
  how: 'Work out meals left for each sack (stock / use). Hold its number and Space together for three quarters of a second to hoist it, soonest-to-run-out first. Release Space between lifts.',
  keys: ['hold 1-4 + hold Space: hoist that sack', 'release Space between lifts'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'hoist two-handed', input: 'digits+space-hold',
    win: 'two sheets of four sacks each hoisted onto the trolley by holding the sack number and Space together, in order of fewest meals left',
    fail: 'hoisting a sack that does not run out next, or letting go of either key before the lift finished so the sack drops',
    rule: 'Meals left = stock divided by use. Hold the sack\'s number and Space together for 0.75 s to lift it; start with the one that runs out first. Let go of Space between sacks.' },
  rush: 'Grabbed whatever was at the front of the locker and filled the shelves.',
  captions: { 'wrong sack': 'sack lifted out of order', dropped: 'sack dropped: lift let go early' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, need = m.calm ? 0.95 : 0.75; m.sheet = 0; m.rounds = 2; m.round = 0; m.dig = 0; m.sp = false; m.prog = 0; m.lock = false; m.cur = -1;
    const mk = () => { const seen = new Set(), l = []; while (l.length < 4) { const use = ri(r, 2, 6), left = ri(r, 3, 24); if (seen.has(left)) continue; seen.add(left); l.push({ n: '', use, stock: left * use + ri(r, 0, use - 1), left, done: false }); } const nm = shuffle(r, NAMES); l.forEach((q, i) => { q.n = nm[i]; }); return l; };
    m.sheets = [mk(), mk()]; const sh = () => m.sheets[Math.min(m.sheet, 1)], nxt = () => { const o = sh().map((q, i) => [q, i]).filter(([q]) => !q.done).sort((a, b) => a[0].left - b[0].left); return o.length ? o[0][1] : -1; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code);
      if (d >= 1 && d <= 4) { if (down) { m.dig = d; } else if (m.dig === d) m.dig = 0; return true; } if (!SPACE(code)) return false; m.sp = down; if (!down) m.lock = false; return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const live = m.dig && m.sp && !m.lock;
      if (live) { if (m.cur !== m.dig - 1) { m.cur = m.dig - 1; m.prog = 0; if (m.cur !== nxt()) { m.fault('wrong sack'); m.lock = true; m.cur = -1; return; } } m.prog += dt;
        if (m.prog >= need) { sh()[m.cur].done = true; m.prog = 0; m.cur = -1; m.lock = true; if (sh().every(q => q.done)) { m.sheet++; m.round = m.sheet; if (m.sheet >= 2) m.win(); } } }
      else if (m.cur >= 0) { if (m.prog > 0.1) m.fault('dropped'); m.prog = 0; m.cur = -1; }
    };
    m.hint = () => { if (m.state !== 'play') return []; if (m.lock) return [['Space', false], ['Digit1', false], ['Digit2', false], ['Digit3', false], ['Digit4', false]]; const n = nxt(); return n < 0 ? [] : [['Digit' + (n + 1), true], ['Space', true]]; };
    m.bad = () => 'Digit1';
    m.view = () => ({ s: m.sheets.map(s => s.map(q => [q.n, q.stock, q.use])) });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['Space', 'Hold: lift']];
    m.draw = (c, W, H, P) => {
      sh().forEach((q, i) => { const y = 8 + i * 34, on = m.cur === i; box(c, 10, y, 280, 30, q.done ? '#25402f' : COL.panel, on ? COL.gold : null, 4); txt(c, `${i + 1} ${q.n}`, 18, y + 19, { size: 12, col: q.done ? COL.dim : COL.ink }); txt(c, `${q.stock} stock / ${q.use} per meal`, 110, y + 19, { size: 10, col: COL.dim }); if (q.done) txt(c, `${q.left} meals ✓`, 282, y + 19, { size: 10, align: 'right', col: P.good }); });
      box(c, 304, 8, 86, 90, '#14202a', COL.peri, 6); txt(c, 'HOIST', 347, 24, { size: 9, align: 'center', col: COL.dim }); bar(c, 312, 36, 70, 12, m.prog / need, {}); txt(c, m.dig && m.sp ? 'lifting…' : m.dig ? 'add Space' : 'hold a number', 347, 70, { size: 10, align: 'center', col: COL.gold });
      txt(c, `sheet ${Math.min(m.sheet + 1, 2)}/2`, 14, 160, { size: 10, col: COL.dim });
    };
    return m;
  },
});
