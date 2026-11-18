// Damage control: repair locker audit on a quiet watch. Each manifest line has its shelf bin drawn below it. Someone has been borrowing:
// some items in the bin carry another tray's tag (a triangle with that tray's number) and make the bin look like it matches the printed
// quantity. Type the honest count of this tray's own items (digit) and Enter it. Entering a figure that includes borrowed items is a false
// tally; any other wrong figure is a miscount.
import { define, machine, DIG, ENTER, ri, shuffle, txt, box, lamp, COL } from './kit.js';

const ITEMS = ['Patch plate', 'Hose clamp', 'Sealant tube', 'Breather', 'Wedge set', 'Shoring strut'];
export default define({
  job: { billet: 'dc', label: 'Repair locker audit', type: 'task:quiet_watch' },
  title: 'Honest count against the manifest', dept: 'engineering', host: 'console', tool: 'Locker manifest clipboard',
  how: 'Count only the items in the bin that carry this tray\'s round tag; triangle-tagged items were borrowed from another tray. Type the honest count and press Enter, even when it falls short of the manifest.',
  keys: ['1-9 type the count', 'Enter write it on the manifest'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'tally honestly', input: 'digits+enter', win: 'four manifest lines written with the honest own-tray count, shortfalls shown rather than hidden',
    fail: 'writing a figure that only matches the manifest by counting items borrowed from another tray',
    rule: 'Each bin shows its items with a tag: round = this tray, triangle with a number = borrowed. Type how many round-tagged items there are and press Enter. The printed quantity is not the answer.' },
  rush: 'Ticked every line on the manifest without opening the bins.',
  captions: { 'false tally': 'pencil snaps', miscount: 'eraser squeak' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, borrowedLines = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 2, 3)));
    m.lines = shuffle(r, ITEMS).slice(0, 4).map((name, k) => { const own = ri(r, 1, 6), bor = borrowedLines.has(k) ? ri(r, 1, 2) : 0;
      return { name, own, bor, qty: bor ? own + bor : own + ri(r, 0, 1), tray: ri(r, 2, 7), order: shuffle(r, [...Array(own).fill(0), ...Array(bor).fill(1)]) }; });
    m.round = 0; m.rounds = 4; m.entry = 0; m.done = [];
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code), L = m.lines[m.round];
      if (d) { m.entry = d; return true; }
      if (ENTER(code)) { if (!m.entry) return true; const e = m.entry; m.entry = 0;
        if (e === L.own) { m.done.push(e); m.round++; if (m.round >= 4) m.win(); return true; }
        m.fault(L.bor && e === L.own + L.bor ? 'false tally' : 'miscount'); return true; }
      return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const L = m.lines[m.round]; if (!L) return []; return m.entry === L.own ? [['Enter', true]] : [['Digit' + L.own, true]]; };
    m.bad = () => { const L = m.lines[m.round]; if (!L) return null; const v = L.bor ? L.own + L.bor : (L.own % 9) + 1; return m.entry === v ? 'Enter' : 'Digit' + v; };
    m.view = () => ({ l: m.lines.map(L => [L.name, L.own, L.bor, L.qty]) });
    m.buttons = () => [...Array.from({ length: 9 }, (_, k) => ['Digit' + (k + 1), String(k + 1)]), ['Enter', 'Write']];
    m.draw = (c, W, H, P) => {
      const L = m.lines[Math.min(3, m.round)]; m.lines.forEach((x, k) => txt(c, `${k + 1}. ${x.name}  qty ${x.qty}  ${m.done[k] != null ? '→ ' + m.done[k] : ''}`, 14, 18 + k * 15, { size: 11, col: k === m.round ? COL.gold : COL.dim }));
      box(c, 14, 82, 300, 60, 'rgba(255,255,255,.06)', COL.peri, 6); txt(c, `Bin: ${L.name}`, 20, 96, { size: 10, col: COL.pale });
      L.order.forEach((b, k) => { const x = 34 + k * 34, y = 122; box(c, x - 12, y - 12, 24, 24, COL.panel, COL.dim, 4); lamp(c, x, y, 8, b ? COL.warn : COL.peri, b ? 'triangle' : 'circle'); if (b) txt(c, 'T' + L.tray, x - 8, y + 22, { size: 9, col: COL.warn }); });
      txt(c, 'count', 330, 96, { size: 10, col: COL.dim }); box(c, 326, 102, 54, 36, COL.dark, COL.gold, 6); txt(c, m.entry || '_', 353, 128, { size: 22, align: 'center' });
      txt(c, '● this tray   ▲ borrowed', 14, 162, { size: 10, col: COL.dim });
    };
    return m;
  },
});
