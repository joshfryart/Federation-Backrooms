// Navigator: update the charts. The sensor log gives each tracked contact's new grid reference; pick up each marker on the lab chart, move it
// to its new cell and drop it. Dropping on any other cell (including leaving it where it was) is a fault and the marker springs back.
import { define, machine, DIG, ARROW, ENTER, ri, shuffle, txt, box, lamp, COL, MARKS } from './kit.js';

const COLS = 'ABCDEFGH', NAMES = ['Freighter Tolan', 'Ion cell', 'Comet fragment', 'Buoy 7', 'Survey drone', 'Derelict hull', 'Gas plume', 'Tug Arrow'];
const ref = (x, y) => COLS[x] + (y + 1);
export default define({
  job: { billet: 'nav', label: 'Update charts with the latest sensor data', type: 'task:quiet_watch' },
  title: 'Chart marker update', dept: 'flight', host: 'console', tool: 'Lab chart table',
  how: 'Read each contact\'s new grid reference in the sensor log, pick its marker up (1 – 4), walk it across the chart (arrows) and drop it (Enter).',
  keys: ['1 – 4 pick up', 'arrows move', 'Enter drop'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'relocate', input: 'digits+arrows+enter', win: 'every contact marker sits on the grid cell the sensor log gives',
    fail: 'dropping a marker on a wrong cell or leaving it on its old position',
    rule: 'The log lists each contact\'s new reference (column letter, row number). Pick up a marker with its number, move it with the arrows and press Enter on the new cell.' },
  rush: 'Updated the log and left the chart markers where they were.',
  captions: { 'wrong cell': 'chart table buzz' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, names = shuffle(r, NAMES).slice(0, 4), used = new Set();
    const cell = () => { for (;;) { const x = ri(r, 0, 7), y = ri(r, 0, 4); if (!used.has(x + ',' + y)) { used.add(x + ',' + y); return [x, y]; } } };
    m.cs = names.map((name) => { const old = cell(); let nw; do { nw = cell(); } while (Math.abs(nw[0] - old[0]) + Math.abs(nw[1] - old[1]) < 2); return { name, old, nw, pos: old.slice(), done: false }; });
    m.sel = -1; m.cur = [0, 0]; m.rounds = 4; m.round = 0;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code), a = ARROW(code);
      if (d >= 1 && d <= 4) { if (!m.cs[d - 1].done) { m.sel = d - 1; m.cur = m.cs[d - 1].pos.slice(); } return true; }
      if (a && m.sel >= 0) { const [dx, dy] = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] }[a]; m.cur = [Math.max(0, Math.min(7, m.cur[0] + dx)), Math.max(0, Math.min(4, m.cur[1] + dy))]; return true; }
      if (ENTER(code) && m.sel >= 0) { const c = m.cs[m.sel]; if (m.cur[0] === c.nw[0] && m.cur[1] === c.nw[1]) { c.pos = c.nw.slice(); c.done = true; m.sel = -1; m.round++; if (m.cs.every(x => x.done)) m.win(); } else { m.fault('wrong cell'); m.cur = c.pos.slice(); } return true; }
      return !!a || ENTER(code);
    };
    m.hint = () => {
      if (m.sel < 0) { const i = m.cs.findIndex(c => !c.done); return i >= 0 ? [['Digit' + (i + 1), true]] : []; }
      const c = m.cs[m.sel], dx = c.nw[0] - m.cur[0], dy = c.nw[1] - m.cur[1];
      return [[dx > 0 ? 'ArrowRight' : dx < 0 ? 'ArrowLeft' : dy > 0 ? 'ArrowDown' : dy < 0 ? 'ArrowUp' : 'Enter', true]];
    };
    m.bad = () => { if (m.sel < 0) { const i = m.cs.findIndex(c => !c.done); return 'Digit' + (i + 1); } return 'Enter'; };
    m.view = () => ({ cs: m.cs.map(c => [c.name, c.old, c.nw]) });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['ArrowUp', '▲'], ['ArrowDown', '▼'], ['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['Enter', 'Drop']];
    m.draw = (c, W, H, P) => {
      const gx = 12, gy = 14, cw = 30, ch = 28;
      for (let x = 0; x < 8; x++) txt(c, COLS[x], gx + x * cw + cw / 2, gy - 2, { size: 9, col: COL.dim, align: 'center' });
      for (let y = 0; y < 5; y++) for (let x = 0; x < 8; x++) box(c, gx + x * cw + 1, gy + y * ch + 1, cw - 2, ch - 2, 'rgba(125,151,232,.08)', null, 3);
      if (m.sel >= 0) box(c, gx + m.cur[0] * cw, gy + m.cur[1] * ch, cw, ch, null, COL.orange, 4);
      m.cs.forEach((q, i) => { const [x, y] = q.pos; lamp(c, gx + x * cw + cw / 2, gy + y * ch + ch / 2, 9, q.done ? P.good : i === m.sel ? COL.orange : COL.lav, MARKS[i]); txt(c, String(i + 1), gx + x * cw + cw / 2, gy + y * ch + ch / 2 + 22, { size: 8, align: 'center', col: COL.dim }); });
      txt(c, 'SENSOR LOG', 268, 22, { size: 11, col: COL.peri });
      m.cs.forEach((q, i) => txt(c, `${i + 1} ${q.name.slice(0, 15)}  ${ref(...q.old)}→${ref(...q.nw)}${q.done ? ' ✓' : ''}`, 260, 44 + i * 26, { size: 10, col: q.done ? P.good : COL.ink }));
    };
    return m;
  },
});
