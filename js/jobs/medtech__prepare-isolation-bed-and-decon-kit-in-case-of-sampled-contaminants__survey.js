// Medical technician: prepare an isolation bed and decon kit. The bed layers come off the trolley as a stack: the big mattress cover is at the
// bottom, then the sheet, the blanket and the curtain on top. They have to be re-stacked on the bed (peg 2) or the cart (peg 3) in the same order,
// and a bigger layer can never be put down on a smaller one. Three pegs: 1 trolley, 2 bed, 3 cart. Press the number to lift from, then the number to put on.
import { define, machine, DIG, ri, shuffle, txt, box, COL } from './kit.js';

const ITEMS = ['mattress cover', 'bedsheet', 'blanket', 'curtain set', 'decon towel', 'fastener tray'];
export default define({
  job: { billet: 'medtech', label: 'Prepare isolation bed and decon kit in case of sampled contaminants', type: 'task:survey' },
  title: 'Restack the bed layers by size', dept: 'medical', host: 'console', tool: 'Trolley, bed and cart stacks',
  how: 'Four layers sit on the trolley (1). Move the top layer: press its stack\'s number, then the stack to put it on. A bigger layer never goes on a smaller one. Rebuild the stack on the bed (2).',
  keys: ['1 / 2 / 3: lift from, then put on'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'restack layers', input: 'digits',
    win: 'a stack of four bed layers rebuilt on the bed in size order through the cart, never putting a bigger layer on a smaller one',
    fail: 'lifting from an empty stack or putting a bigger layer on a smaller one, three times',
    rule: 'Press a stack number to lift its top layer, then another to put it down. Only the top layer moves, and it may only go on an empty stack or a larger layer. Rebuild the whole stack on the bed.' },
  rush: 'Threw a sheet on the bed and pulled the curtain round it.',
  captions: { 'empty stack': 'nothing to lift', 'too big': 'bigger layer on a smaller one' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, N = 4, goal = 1; m.names = shuffle(r, ITEMS).slice(0, N); m.s = [[3, 2, 1, 0], [], []]; m.sel = -1; m.mv = 0; m.rounds = 15;
    const plan = []; const hanoi = (n, a, b, c) => { if (!n) return; hanoi(n - 1, a, c, b); plan.push([a, b]); hanoi(n - 1, c, b, a); }; hanoi(N, 0, goal, 2); m.plan = plan;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code); if (d < 1 || d > 3) return false; if (!down) return true; const i = d - 1;
      if (m.sel < 0) { if (!m.s[i].length) m.fault('empty stack'); else m.sel = i; return true; }
      if (i === m.sel) { m.sel = -1; return true; } const from = m.s[m.sel], top = from[from.length - 1], to = m.s[i];
      if (to.length && to[to.length - 1] < top) { m.fault('too big'); m.sel = -1; return true; }
      to.push(from.pop()); m.sel = -1; m.mv++; m.round = m.mv; if (m.s[goal].length === N) m.win(); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { if (m.state !== 'play') return []; const p = m.plan[m.mv]; if (!p) return []; return [['Digit' + ((m.sel < 0 ? p[0] : p[1]) + 1), true]]; };
    m.bad = () => 'Digit3';
    m.view = () => ({ names: m.names, s: m.s });
    m.buttons = () => [['Digit1', '1 Trolley'], ['Digit2', '2 Bed'], ['Digit3', '3 Cart']];
    m.draw = (c, W, H, P) => {
      ['1 Trolley', '2 Bed', '3 Cart'].forEach((nm, i) => { const x = 20 + i * 126; box(c, x, 8, 112, 140, COL.panel, m.sel === i ? COL.gold : COL.dim, 6); txt(c, nm, x + 56, 160, { size: 10, align: 'center', col: i === goal ? COL.gold : COL.dim });
        m.s[i].forEach((v, k) => { const w = 36 + v * 20, y = 124 - k * 26; box(c, x + 56 - w / 2, y, w, 22, ['#3a4a7a', '#4a3a7a', '#7a4a4a', '#4a7a5a'][v], m.sel === i && k === m.s[i].length - 1 ? COL.gold : null, 3); txt(c, m.names[v], x + 56, y + 15, { size: 8, align: 'center' }); }); });
    };
    return m;
  },
});
