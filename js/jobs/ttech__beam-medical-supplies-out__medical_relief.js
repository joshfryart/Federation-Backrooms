// Transporter tech: beam medical supplies out. Pick the requisition from the supply cabinet into the relief kit, in order. The cabinet's bins
// hold look-alike stock (5 cc beside 10 cc, the -B variant beside the plain one) and one requested item's front bin is empty, with more of it
// in an overflow bin elsewhere. Move the cursor (arrows), Space packs the item under it, Enter seals the kit and energizes. A wrong item or
// an empty bin is a fault; sealing a kit that is still missing a line is the worst one, because the team cannot improvise a dose.
import { define, machine, ARROW, SPACE, ENTER, shuffle, ri, txt, box, COL } from './kit.js';

const STOCK = [['Tricordrazine', '5 cc', '10 cc'], ['Inaprovaline', 'std', '-B'], ['Hyronalyn', '20 mg', '2 mg'], ['Dermaline gel', 'tube', 'sachet'], ['Kelotane', '10 cc', '1 cc']];
export default define({
  job: { billet: 'ttech', label: 'Beam medical supplies out', type: 'task:medical_relief' },
  title: 'Relief kit pick from the cabinet', dept: 'operations', host: 'console', tool: 'Supply cabinet and relief kit',
  how: 'Arrows move to a cabinet bin, Space packs it: take the requisition lines in order, mind look-alike doses and empty bins, then Enter to seal and energize.',
  keys: ['Arrows move in the cabinet', 'Space pack this item', 'Enter seal kit and energize'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'pick and pack', input: 'arrows+space+enter', win: 'every requisition line picked from a stocked bin with the exact dose, in order, then the kit sealed and beamed',
    fail: 'packing a look-alike dose or reaching into an empty bin, or sealing the kit with a line still missing',
    rule: 'Find the next requisition line in the 3 × 3 cabinet: match name AND dose, check the bin count is not 0 (the overflow bin holds more), press Space. When the list is all ticked press Enter.' },
  rush: 'Grabbed an armful of what looked right from the cabinet and sealed the kit.',
  captions: { 'wrong item': 'error buzz', 'empty bin': 'hollow clunk', 'short kit': 'relief team: kit incomplete' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, fam = shuffle(r, STOCK).slice(0, 4);
    const items = fam.flatMap(([n, a, b]) => [{ n: `${n} ${a}` }, { n: `${n} ${b}` }]);
    m.req = shuffle(r, fam.map(([n, a, b]) => `${n} ${r() < 0.5 ? a : b}`));
    const emptyName = m.req[ri(r, 0, 3)]; let cells = items.map(it => ({ ...it, q: ri(r, 2, 9) })); cells.push({ n: emptyName, q: ri(r, 3, 6), over: true });
    cells = shuffle(r, cells); const firstIdx = cells.findIndex(c => c.n === emptyName); cells.forEach((c, i) => { c.over = c.n === emptyName && i !== firstIdx; }); cells[firstIdx].q = 0;
    m.cells = cells; m.cx = 1; m.cy = 1; m.got = 0; m.sealed = false; m.rounds = 4; m.round = 0;
    const at = () => m.cells[m.cy * 3 + m.cx];
    m.key = (code, down = true) => {
      const a = ARROW(code), sp = SPACE(code), en = ENTER(code); if (!a && !sp && !en) return false; if (m.state !== 'play' || !down) return true;
      if (a) { if (a === 'L') m.cx = Math.max(0, m.cx - 1); if (a === 'R') m.cx = Math.min(2, m.cx + 1); if (a === 'U') m.cy = Math.max(0, m.cy - 1); if (a === 'D') m.cy = Math.min(2, m.cy + 1); return true; }
      if (en) { if (m.got < m.req.length) m.fault('short kit'); else m.win(); return true; }
      const c = at(); if (m.got >= m.req.length) return true; if (c.n !== m.req[m.got]) { m.fault('wrong item'); return true; } if (!c.q) { m.fault('empty bin'); return true; }
      c.q--; m.got++; m.round++; return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => {
      if (m.got >= m.req.length) return [['Enter', true]]; const ti = m.cells.findIndex(c => c.n === m.req[m.got] && c.q > 0), tx = ti % 3, ty = Math.floor(ti / 3);
      if (tx !== m.cx) return [[tx < m.cx ? 'ArrowLeft' : 'ArrowRight', true]]; if (ty !== m.cy) return [[ty < m.cy ? 'ArrowUp' : 'ArrowDown', true]]; return [['Space', true]];
    };
    m.bad = () => (m.got < m.req.length ? 'Enter' : null);
    m.view = () => ({ req: m.req, cells: m.cells.map(c => [c.n, c.q]) });
    m.buttons = () => [['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['ArrowUp', '▲'], ['ArrowDown', '▼'], ['Space', 'Pack'], ['Enter', 'Seal + energize']];
    m.draw = (c, W, H, P) => {
      txt(c, 'REQUISITION', 16, 18, { size: 10, col: COL.dim });
      m.req.forEach((n, i) => txt(c, `${i < m.got ? '✓' : i === m.got ? '▶' : ' '} ${n}`, 16, 36 + i * 18, { size: 11, col: i < m.got ? COL.dim : i === m.got ? COL.ink : COL.pale }));
      txt(c, `kit: ${m.got} / ${m.req.length} packed`, 16, 120, { size: 11, col: m.got >= m.req.length ? P.good : COL.ink }); if (m.got >= m.req.length) txt(c, 'Enter: seal and energize', 16, 138, { size: 11, col: P.good });
      m.cells.forEach((cl, i) => { const x = 170 + (i % 3) * 74, y = 8 + Math.floor(i / 3) * 52, sel = i === m.cy * 3 + m.cx;
        box(c, x, y, 70, 48, cl.q ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.3)', sel ? COL.peri : null, 4);
        const [a, b] = [cl.n.split(' ').slice(0, -1).join(' '), cl.n.split(' ').slice(-1)[0]]; txt(c, a, x + 35, y + 15, { size: 9, align: 'center' }); txt(c, b, x + 35, y + 29, { size: 11, col: COL.gold, align: 'center' });
        txt(c, cl.q ? `× ${cl.q}${cl.over ? ' overflow' : ''}` : 'EMPTY', x + 35, y + 43, { size: 9, col: cl.q ? COL.dim : P.bad, align: 'center' }); });
    };
    return m;
  },
});
