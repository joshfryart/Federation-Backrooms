// Galley: restock the mess before the second sweep. The pantry sheet gives each item's stock left and its use per meal. The item that runs
// out first must reach the trolley first: work out stock divided by use for each, then press the item digits in that order, soonest first.
// Loading an item before one that runs out sooner is a fault. Two sheets of five items.
import { define, machine, DIG, ri, shuffle, txt, box, COL } from './kit.js';

const ITEMS = ['rice', 'flour', 'broth', 'oats', 'beans', 'tea', 'sugar', 'greens', 'eggs', 'oil'];

export default define({
  job: { billet: 'galley', label: 'Restock the mess before the second sweep', type: 'task:survey' },
  title: 'Load the trolley by run-out time', dept: 'services', host: 'console', tool: 'Pantry sheet and sack trolley',
  how: 'Each line gives stock left and use per meal. Meals left is stock divided by use. Press the item digits in order of fewest meals left first to load the trolley.',
  keys: ['1 to 5 load that item'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'load by run-out', input: 'digits', win: 'two pantry sheets of five items each loaded onto the trolley in order of fewest meals left, found by dividing stock by use',
    fail: 'loading an item while another that runs out sooner is still on the shelf',
    rule: 'Work out meals left for every line (stock over use). The smallest goes first: press its digit, then the next smallest, until the sheet is loaded.' },
  rush: 'Grabbed whatever was at the front of the locker and filled the shelves.',
  captions: { 'out of order': 'sack thump' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; m.rounds = 2; m.round = 0;
    const sheet = () => { const names = shuffle(r, ITEMS), runs = shuffle(r, [1, 2, 3, 4, 5, 6, 7, 8]).slice(0, 5); return runs.map((run, k) => { const u = ri(r, 1, 3); return { n: names[k], u, s: run * u, run, in: false }; }); };
    m.S = [sheet(), sheet()];
    m.key = (code, down = true) => {
      const d = DIG(code); if (m.state !== 'play' || !down || d < 1 || d > 5) return false; const sh = m.S[m.round], it = sh[d - 1]; if (it.in) return true;
      const min = Math.min(...sh.filter(x => !x.in).map(x => x.run)); if (it.run !== min) { m.fault('out of order'); return true; }
      it.in = true; if (sh.every(x => x.in)) { m.round++; if (m.round >= 2) m.win(); } return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const sh = m.S[Math.min(1, m.round)], min = Math.min(...sh.filter(x => !x.in).map(x => x.run)); return [['Digit' + (sh.findIndex(x => !x.in && x.run === min) + 1), true]]; };
    m.bad = () => { const sh = m.S[Math.min(1, m.round)], mx = Math.max(...sh.filter(x => !x.in).map(x => x.run)); return 'Digit' + (sh.findIndex(x => !x.in && x.run === mx) + 1); };
    m.view = () => ({ S: m.S.map(s => s.map(x => [x.n, x.s, x.u])) });
    m.buttons = () => [1, 2, 3, 4, 5].map(k => ['Digit' + k, String(k)]);
    m.draw = (c, W, H, P) => {
      const sh = m.S[Math.min(1, m.round)]; txt(c, `sheet ${Math.min(2, m.round + 1)} / 2: stock, use per meal`, 20, 20, { size: 12, col: COL.dim });
      sh.forEach((x, k) => { const y = 28 + k * 24; box(c, 20, y, 300, 20, x.in ? 'rgba(125,200,140,.2)' : 'rgba(255,255,255,.06)', null, 4);
        txt(c, `${k + 1}  ${x.n}`, 28, y + 15, { size: 13 }); txt(c, `${x.s} left, ${x.u} per meal`, 130, y + 15, { size: 12, col: COL.pale }); txt(c, x.in ? 'loaded' : '', 270, y + 15, { size: 11, col: P.good }); });
    };
    return m;
  },
});
