// Cargo: pull medical supply crates from the bay. Each request names an item. Slide the cursor along the bay shelf (Left/Right) and pull
// (Enter) the crate of that item with the OLDEST lot number: several crates of the item sit on the shelf. Wrong item or a newer lot is a fault.
import { define, machine, ARROW, ENTER, ri, pick, shuffle, txt, box, COL } from './kit.js';

const ITEMS = ['Dermal regen', 'Hypospray', 'Saline bags', 'Splints', 'Burn gel', 'Trauma kit'];
export default define({
  job: { billet: 'cargo', label: 'Pull medical supply crates from the bay', type: 'task:medical_relief' },
  title: 'Oldest lot off the shelf', dept: 'services', host: 'console', tool: 'Bay shelf and request list',
  how: 'Read the requested item. Move along the shelf with Left/Right and press Enter on the crate of that item with the lowest (oldest) lot number.',
  keys: ['Left/Right slide the cursor', 'Enter pull the crate'], limit: 28, maxFaults: 3,
  fingerprint: { verb: 'pull oldest lot', input: 'arrows+enter',
    win: 'three requested items pulled, each the oldest lot of that item on the shelf',
    fail: 'pulling the wrong item or a newer lot while an older one waits on the shelf',
    rule: 'The request names an item. Several crates of it sit on the shelf with different lot numbers. Move the cursor with Left/Right and press Enter on the one with the lowest lot.' },
  rush: 'Grabbed the nearest crates and hoped the lots were fine.',
  captions: { 'wrong item': 'wrong crate buzz', 'newer lot': 'stock-rotation tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; m.i = 0; m.sel = 0; m.rounds = 3; m.round = 0;
    const mk = () => { const want = pick(r, ITEMS), others = shuffle(r, ITEMS.filter(x => x !== want)), n = m.calm ? 5 : 6, k = ri(r, 2, 3), lots = shuffle(r, Array.from({ length: 12 }, (_, j) => 100 + j * 37 + ri(r, 0, 20))).slice(0, n);
      const items = shuffle(r, [...Array(k).fill(want), ...Array.from({ length: n - k }, (_, j) => others[j % others.length])]); const sh = items.map((it, j) => ({ it, lot: lots[j] }));
      const ok = sh.reduce((b, c, j) => c.it === want && (b < 0 || c.lot < sh[b].lot) ? j : b, -1); return { want, sh, ok }; };
    m.reqs = [mk(), mk(), mk()];
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const q = m.reqs[m.i], a = ARROW(code); if (!q) return false;
      if (a === 'L' || a === 'R') { m.sel = Math.max(0, Math.min(q.sh.length - 1, m.sel + (a === 'R' ? 1 : -1))); return true; }
      if (ENTER(code)) { const c = q.sh[m.sel]; if (c.it !== q.want) m.fault('wrong item'); else if (m.sel !== q.ok) m.fault('newer lot'); else { m.i++; m.round = m.i; m.sel = 0; if (m.i >= 3) m.win(); } return true; }
      return false;
    };
    m.hint = () => { const q = m.reqs[m.i]; return !q ? [] : m.sel < q.ok ? [['ArrowRight', true]] : m.sel > q.ok ? [['ArrowLeft', true]] : [['Enter', true]]; };
    m.bad = () => { const q = m.reqs[m.i], t = q.sh.findIndex((c, j) => c.it === q.want && j !== q.ok); return m.sel < t ? 'ArrowRight' : m.sel > t ? 'ArrowLeft' : 'Enter'; };
    m.view = () => ({ reqs: m.reqs.map(q => [q.want, q.sh.map(c => [c.it, c.lot])]) });
    m.buttons = () => [['ArrowLeft', '<'], ['ArrowRight', '>'], ['Enter', 'Pull']];
    m.draw = (c, W, H, P) => {
      const q = m.reqs[Math.min(m.i, 2)]; txt(c, `REQUEST ${Math.min(3, m.i + 1)} OF 3: ${q.want}`, 12, 20, { size: 14, col: COL.gold });
      const w = (W - 20) / q.sh.length; q.sh.forEach((k, j) => { const x = 10 + j * w; box(c, x + 2, 44, w - 4, 76, 'rgba(255,255,255,.06)', j === m.sel ? COL.gold : COL.dim, 5); txt(c, k.it.split(' ')[0], x + w / 2, 72, { size: 10, align: 'center' }); txt(c, 'lot', x + w / 2, 92, { size: 9, align: 'center', col: COL.dim }); txt(c, k.lot, x + w / 2, 110, { size: 13, align: 'center', col: COL.pale }); });
      txt(c, 'pull the oldest (lowest) lot of the item', W / 2, H - 14, { size: 11, align: 'center', col: COL.dim });
    };
    return m;
  },
});
