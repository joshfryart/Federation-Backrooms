// Quartermaster: rotate expiring stock. The shelf is a row of dated tins, earliest at the front (left). A new tin is carried in: slide the
// insertion marker (Left/Right) to the slot that keeps the dates in order and press Enter.
import { define, machine, ARROW, ENTER, shuffle, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'qm', label: 'Rotate expiring stock to the galley', type: 'task:quiet_watch' },
  title: 'Slot by best-before date', dept: 'services', host: 'console', tool: 'Galley shelf and expiry list',
  how: 'Slide the marker with Left/Right to where the tin\'s best-before day fits in the shelf order (earliest at the front, left) and press Enter to set it down.',
  keys: ['Left/Right slide marker', 'Enter set down'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'slot by date', input: 'arrows+enter', win: 'four tins each set into the shelf gap that keeps the best-before dates running earliest to latest',
    fail: 'setting a tin down where a later-dated tin is ahead of it or an earlier one behind it',
    rule: 'The shelf shows day numbers, earliest in front. Move the marker to the gap between a smaller and a larger date than the carried tin and press Enter.' },
  rush: 'Stacked the new tins in front without reading the dates so the oldest sat at the back.',
  captions: { 'out of order': 'old tin buried' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, all = shuffle(r, Array.from({ length: 40 }, (_, i) => i + 3));
    m.shelf = all.slice(0, 3).sort((a, b) => a - b); m.carry = all.slice(3, 7); m.k = 0; m.mark = 0; m.round = 0; m.rounds = 4;
    const slot = () => m.shelf.filter(d => d < m.carry[m.k]).length;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a === 'L') m.mark = Math.max(0, m.mark - 1); else if (a === 'R') m.mark = Math.min(m.shelf.length, m.mark + 1);
      else if (ENTER(code)) { if (m.mark !== slot()) m.fault('out of order'); else { m.shelf.splice(m.mark, 0, m.carry[m.k]); m.k++; m.round = m.k; m.mark = 0; if (m.k >= 4) m.win(); } } else return false;
      return true;
    };
    m.hint = () => { if (m.k >= 4) return []; const t = slot(); return m.mark === t ? [['Enter', true]] : [[m.mark < t ? 'ArrowRight' : 'ArrowLeft', true]]; };
    m.bad = () => { if (m.k >= 4) return null; const t = slot(); return m.mark === t ? [t > 0 ? 'ArrowLeft' : 'ArrowRight', true] : ['Enter', true]; };
    m.view = () => ({ shelf: m.shelf.slice(), carry: m.carry });
    m.buttons = () => [['ArrowLeft', '<'], ['ArrowRight', '>'], ['Enter', 'Set down']];
    m.draw = (c, W, H, P) => {
      txt(c, 'FRONT', 10, 16, { size: 10, col: COL.dim }); txt(c, `carried tin: day ${m.carry[Math.min(m.k, 3)]}`, 200, 16, { size: 13, col: COL.gold });
      const n = m.shelf.length; for (let i = 0; i <= n; i++) { const x = 14 + i * 50; c.fillStyle = i === m.mark ? COL.gold : 'rgba(255,255,255,.12)'; c.fillRect(x - 4, 40, 4, 70); if (i < n) { box(c, x + 2, 52, 38, 46, COL.panel, COL.peri, 5); txt(c, m.shelf[i], x + 21, 80, { size: 14, align: 'center' }); } }
      txt(c, 'earliest date at the front (left)', 10, 150, { size: 11, col: COL.dim });
    };
    return m;
  },
});
