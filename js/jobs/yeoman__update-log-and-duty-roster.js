// Yeoman: update the log and the duty roster. Six names, three watches of two. Every name carries the time they last came off duty; a watch
// may only take someone who has had the full rest gap since then, and nobody stands two watches. Move the cursor over the roster grid and
// write a name into each slot: the grid shows each name's rest gap against the watch under the cursor.
import { define, machine, DIG, ARROW, pick, shuffle, txt, box, COL } from './kit.js';

const NAMES = ['Abara', 'Brandt', 'Chen', 'Dasari', 'Eklund', 'Fonseca', 'Gale', 'Huang', 'Ivers', 'Juarez'];
const WATCH = [['Alpha', 0], ['Beta', 6], ['Gamma', 12]], REST = 10;
const clock = (h) => String(((h % 24) + 24) % 24).padStart(2, '0') + '00';

export default define({
  job: { billet: 'yeoman', label: 'Update log and duty roster', type: 'loop' },
  title: 'Watch bill with rest gaps', dept: 'command', host: 'console', tool: 'Watch roster grid',
  how: 'Move to a roster slot (arrows) and write a name into it (1-6). Each name shows its rest since last duty against that watch: it needs 10 hours, and nobody may stand two watches.',
  keys: ['arrows pick a slot', '1-6 write a name'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'ink watch bill', input: 'digits+arrows', win: 'all six watch slots inked with distinct crew who each had the full rest since their last duty',
    fail: 'writing a name onto a watch inside their rest gap, or onto a second watch',
    rule: 'Arrows move the cursor across the Alpha, Beta and Gamma slots. The name list shows each person\'s rest gap to the watch under the cursor; press their number only if it reads 10 h or more and they are not already on the bill.' },
  rush: 'Copied yesterday\'s roster forward and initialled it.',
  captions: { 'short rest': 'roster clerk tuts', 'two watches': 'double-booking chime' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, names = shuffle(r, NAMES).slice(0, 6);
    const off = [-10, -10, pick(r, [-8, -6, -4]), pick(r, [-8, -6, -4]), pick(r, [-8, -6, -4, -2]), pick(r, [-8, -6, -4, -2])];
    const order = shuffle(r, [0, 1, 2, 3, 4, 5]); m.crew = order.map(i => ({ name: names[i], off: off[i], sol: i }));   // sol: the slot index 0..5 that works
    m.slots = Array(6).fill(-1); m.cx = 0; m.cy = 2; m.rounds = 6; m.round = 0;
    const gap = (p, w) => WATCH[w][1] - p.off;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), d = DIG(code);
      if (a) { if (down) { if (a === 'U') m.cy = (m.cy + 2) % 3; if (a === 'D') m.cy = (m.cy + 1) % 3; if (a === 'L' || a === 'R') m.cx = 1 - m.cx; } return true; }
      if (d < 1 || d > 6) return false; if (!down) return true; const p = m.crew[d - 1], s = m.cy * 2 + m.cx;
      if (m.slots.includes(d - 1) && m.slots[s] !== d - 1) { m.fault('two watches'); return true; }
      if (gap(p, m.cy) < REST) { m.fault('short rest'); return true; }
      m.slots[s] = d - 1; m.round = m.slots.filter(x => x >= 0).length; m.ev('ink', { s, p: d - 1 });
      if (m.slots.every(x => x >= 0)) m.win(); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => {
      const s = m.cy * 2 + m.cx; if (m.slots[s] < 0) return [[`Digit${m.crew.findIndex(p => p.sol === s) + 1}`, true]];
      const todo = m.slots.findIndex(x => x < 0); if (todo < 0) return []; return [[Math.floor(todo / 2) !== m.cy ? 'ArrowDown' : 'ArrowRight', true]];
    };
    m.bad = () => { const i = m.crew.findIndex(p => gap(p, m.cy) < REST); return i < 0 ? 'ArrowUp' : `Digit${i + 1}`; };
    m.view = () => ({ crew: m.crew.map(p => [p.name, p.off]) });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['ArrowLeft', '◀▶'], ...m.crew.map((p, i) => [`Digit${i + 1}`, `${i + 1}`])];
    m.draw = (c, W, H, P) => {
      txt(c, 'WATCH BILL', 10, 16, { size: 10, col: COL.peri });
      WATCH.forEach(([w, h], y) => { txt(c, `${w} ${clock(h)}`, 10, 42 + y * 34, { size: 11, col: COL.gold });
        for (let x = 0; x < 2; x++) { const s = y * 2 + x, on = y === m.cy && x === m.cx, p = m.slots[s]; box(c, 92 + x * 74, 28 + y * 34, 68, 24, on ? 'rgba(244,194,91,.2)' : 'rgba(255,255,255,.05)', on ? COL.gold : COL.dim, 4);
          txt(c, p >= 0 ? m.crew[p].name : '—', 126 + x * 74, 44 + y * 34, { size: 10, align: 'center', col: p >= 0 ? COL.ink : COL.dim }); } });
      txt(c, `REST TO ${WATCH[m.cy][0].toUpperCase()} (need ${REST} h)`, 252, 16, { size: 10, col: COL.peri });
      m.crew.forEach((p, i) => { const g = gap(p, m.cy), used = m.slots.includes(i), ok = g >= REST; const y = 32 + i * 21;
        txt(c, `${i + 1} ${p.name}`, 252, y, { size: 11, col: used ? COL.dim : COL.ink }); txt(c, `off ${clock(p.off)}`, 252, y + 9, { size: 8, col: COL.dim });
        txt(c, used ? 'on bill' : `${ok ? '✓' : '✗'} ${g} h`, 392, y, { size: 11, align: 'right', col: used ? COL.dim : ok ? P.good : P.bad }); });
      txt(c, `${m.slots.filter(x => x >= 0).length} / 6 inked`, 10, H - 10, { size: 11, col: COL.pale });
    };
    return m;
  },
});
