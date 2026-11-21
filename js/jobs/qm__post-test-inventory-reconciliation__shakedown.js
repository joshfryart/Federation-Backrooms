// Quartermaster: post-test reconciliation. Five bins show before and after counts, plus the test log's relocation entries. Up/Down moves the
// cursor, then Space marks a bin balanced, Left marks it relocated (the log explains it), Right marks it lost (nothing explains it).
import { define, machine, ARROW, SPACE, ri, shuffle, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'qm', label: 'Post-test inventory reconciliation', type: 'task:shakedown' },
  title: 'Classify the stock diff against the log', dept: 'services', host: 'console', tool: 'Reconciliation sheet and test log',
  how: 'For each bin compare before and after. Same: Space. Different and the test log lists that move: Left (relocated). Different with no log entry: Right (lost).',
  keys: ['Up/Down bin', 'Space balanced', 'Left relocated', 'Right lost'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'classify the diff', input: 'arrows+space', win: 'five bins each marked balanced, relocated when the test log shows the move, or lost when no entry explains the difference',
    fail: 'recording a loss the log explains, hiding a real loss as a move, or calling a changed bin balanced',
    rule: 'Check the before/after counts. A bin that differs and has a RELOCATION line in the log is relocated. A bin that differs with no log line is lost. Unchanged bins are balanced.' },
  rush: 'Wrote a loss against every bin that moved and never opened the test log.',
  captions: { 'wrong mark': 'ledger query raised' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, kinds = shuffle(r, ['same', 'same', 'move', 'lost', r() < 0.5 ? 'move' : 'lost']);
    m.b = kinds.map((k, i) => { const pre = ri(r, 6, 20); return { name: 'Bin ' + 'ABCDE'[i], pre, post: k === 'same' ? pre : pre - ri(r, 1, 3), kind: k, mark: null }; });
    m.log = m.b.filter(b => b.kind === 'move').map(b => `RELOC ${b.name}: ${b.pre - b.post} moved to Bay 9`); m.cur = 0; m.round = 0; m.rounds = 5;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), b = m.b[m.cur];
      if (a === 'U') m.cur = (m.cur + 4) % 5; else if (a === 'D') m.cur = (m.cur + 1) % 5;
      else if (b && !b.mark && (a === 'L' || a === 'R' || SPACE(code))) { const mk = SPACE(code) ? 'same' : a === 'L' ? 'move' : 'lost'; if (mk !== b.kind) m.fault('wrong mark'); else { b.mark = mk; m.round++; if (m.b.every(x => x.mark)) m.win(); } }
      else return false; return true;
    };
    m.hint = () => { const t = m.b.findIndex(b => !b.mark); if (t < 0) return []; if (m.cur !== t) return [['ArrowDown', true]]; const k = m.b[t].kind; return [[k === 'same' ? 'Space' : k === 'move' ? 'ArrowLeft' : 'ArrowRight', true]]; };
    m.bad = () => { const t = m.b.findIndex(b => !b.mark); if (t < 0) return null; if (m.cur !== t) return ['ArrowDown', true]; return [m.b[t].kind === 'same' ? 'ArrowRight' : 'Space', true]; };
    m.view = () => ({ b: m.b.map(b => [b.pre, b.post]), log: m.log });
    m.buttons = () => [['ArrowUp', 'Up'], ['ArrowDown', 'Down'], ['Space', 'Same'], ['ArrowLeft', 'Moved'], ['ArrowRight', 'Lost']];
    m.draw = (c, W, H, P) => {
      m.b.forEach((b, i) => { const y = 8 + i * 24, on = i === m.cur; if (on) { c.fillStyle = 'rgba(244,194,91,.2)'; c.fillRect(6, y, 230, 22); } txt(c, `${b.name}  ${b.pre} -> ${b.post}`, 12, y + 16, { size: 12, col: b.mark ? COL.dim : COL.ink }); if (b.mark) txt(c, b.mark.toUpperCase(), 190, y + 16, { size: 10, col: P.good }); });
      txt(c, 'TEST LOG', 260, 18, { size: 11, col: COL.gold }); (m.log.length ? m.log : ['(no relocations)']).forEach((l, i) => txt(c, l, 250, 40 + i * 16, { size: 10, col: COL.pale }));
    };
    return m;
  },
});
