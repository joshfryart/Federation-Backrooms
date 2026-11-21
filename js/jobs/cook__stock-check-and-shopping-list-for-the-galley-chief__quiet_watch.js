// Cook: stock check and shopping list. Four shelf lines each show days of stock left; one is already on the pending order slip. Build the list
// by pressing each line's digit in order of how soon it runs out (fewest days first), skipping the one already on order.
import { define, machine, DIG, ri, shuffle, txt, COL } from './kit.js';
const NAMES = ['rice sacks', 'flour', 'tinned beans', 'tomato tins', 'oil', 'stock cubes', 'oats', 'salt', 'dried fruit', 'tea'];

export default define({
  job: { billet: 'cook', label: 'Stock check and shopping list for the Galley Chief', type: 'task:quiet_watch' },
  title: 'Shopping list by days left', dept: 'services', host: 'console', tool: 'Stock card and order slip',
  how: 'Press each shelf line number in order of days left, fewest first. Do not add a line already on the pending order slip.',
  keys: ['1-4 add that line to the list'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'rank by urgency', input: 'digits', win: 'two shopping lists built soonest-to-run-out first without any line already on order',
    fail: 'putting a less urgent line ahead of a sooner one, or ordering stock that is already pending',
    rule: 'Four lines show days of stock left; one is marked PENDING. Press digits from the line with the fewest days to the most, skipping the pending one.' },
  rush: 'Wrote down whatever looked low and ordered the same bags twice.',
  captions: { 'out of order': 'wrong-entry buzz', 'double order': 'duplicate order tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; m.rounds = 2; m.round = 0;
    const deal = () => { const names = shuffle(r, NAMES).slice(0, 4), days = shuffle(r, [1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 4), pend = ri(r, 0, 3);
      m.lines = names.map((n, i) => ({ n, d: days[i], pend: i === pend })); m.order = m.lines.map((l, i) => i).filter(i => !m.lines[i].pend).sort((a, b) => m.lines[a].d - m.lines[b].d); m.got = 0; m.said = []; };
    deal();
    m.key = (code, down = true) => {
      const d = DIG(code); if (m.state !== 'play' || !down || d < 1 || d > 4) return false; const i = d - 1;
      if (m.lines[i].pend) { m.fault('double order'); return true; } if (m.said.includes(i)) return true;
      if (i !== m.order[m.got]) { m.fault('out of order'); return true; }
      m.said.push(i); m.got++; if (m.got >= m.order.length) { m.round++; if (m.round >= m.rounds) m.win(); else deal(); } return true;
    };
    m.hint = () => [['Digit' + (m.order[m.got] + 1), true]];
    m.bad = () => 'Digit' + (m.lines.findIndex(l => l.pend) + 1);
    m.view = () => ({ lines: m.lines.map(l => [l.n, l.d, l.pend]) });
    m.buttons = () => [1, 2, 3, 4].map(i => ['Digit' + i, String(i)]);
    m.draw = (c, W, H, P) => { m.lines.forEach((l, i) => { const y = 32 + i * 30; txt(c, `${i + 1}  ${l.n}`, 20, y, { size: 13, col: m.said.includes(i) ? COL.dim : COL.ink });
      txt(c, `${l.d} days`, 200, y, { size: 13, col: COL.pale }); if (l.pend) txt(c, 'PENDING', 290, y, { size: 12, col: P.bad }); const k = m.said.indexOf(i); if (k >= 0) txt(c, `list #${k + 1}`, 340, y, { size: 12, col: P.good }); });
      txt(c, `list ${m.round + 1} / ${m.rounds}`, 20, 14, { size: 11, col: COL.dim }); };
    return m;
  },
});
