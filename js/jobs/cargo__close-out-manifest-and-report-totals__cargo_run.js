// Cargo: close out the manifest and report the totals. Each category row lists received, late, damaged and returned crates. The net is received plus
// late minus damaged minus returned, and the tally counter has no keypad: hold Space and it counts up at a steady five a second; let go on the net
// and the row locks. Let go on any other number and the row resets. When all rows are locked, Enter sends the totals to the quartermaster.
import { define, machine, SPACE, ENTER, ri, txt, box, COL } from './kit.js';

const CATS = ['Rations', 'Spares', 'Medical', 'Science kit', 'Linens'];
export default define({
  job: { billet: 'cargo', label: 'Close out manifest and report totals', type: 'task:cargo_run' },
  title: 'Run the tally counter to the net', dept: 'services', host: 'console', tool: 'Manifest tally counter',
  how: 'Work out each row\'s net (received + late - damaged - returned). Hold Space to run the counter up and let go exactly on the net. Enter sends when all rows are locked.',
  keys: ['hold Space: run the counter', 'release: lock the row', 'Enter: send the totals'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'count and release', input: 'space-hold+enter',
    win: 'three manifest rows each locked by releasing the running counter on exactly their net total, then the totals sent',
    fail: 'releasing the counter on the wrong number, repeatedly, or sending the totals with a row still unlocked',
    rule: 'Net = received + late - damaged - returned. The counter climbs five a second while Space is held; release on the net to lock the row, any other release resets it.' },
  rush: 'Reported the received counts as the totals and left the discrepancies for the quartermaster to find.',
  captions: { 'wrong total': 'tally rejected: counter released on the wrong number', 'unsent rows': 'report sent with an open row' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, rate = m.calm ? 4 : 5; m.i = 0; m.cnt = 0; m.acc = 0; m.held = {}; m.rounds = 3; m.round = 0; m.phase = 'rows';
    m.rows = Array.from({ length: 3 }, (_, k) => { const rec = ri(r, 6, 12), late = ri(r, 0, 3), dam = ri(r, 0, 3), ret = ri(r, 0, 2); return { n: CATS[(k * 2 + ri(r, 0, 1)) % 5], rec, late, dam, ret, net: rec + late - dam - ret, done: false }; });
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false;
      if (SPACE(code)) { if (m.phase !== 'rows') return true; if (down && !m.held.S) { m.held.S = true; m.cnt = 0; m.acc = 0; } else if (!down && m.held.S) { m.held.S = false; const q = m.rows[m.i]; if (m.cnt === q.net) { q.done = true; m.i++; m.round = m.i; if (m.i >= m.rows.length) m.phase = 'send'; } else { m.fault('wrong total'); } m.cnt = 0; m.acc = 0; } return true; }
      if (!ENTER(code)) return false; if (!down) return true; if (m.phase === 'send') m.win(); else m.fault('unsent rows'); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.held.S && m.phase === 'rows') { m.acc += rate * dt; m.cnt = Math.floor(m.acc); } };
    m.hint = () => { if (m.state !== 'play') return []; if (m.phase === 'send') return [['Enter', true]]; const q = m.rows[m.i]; return m.held.S && m.cnt >= q.net ? [['Space', false]] : [['Space', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ rows: m.rows.map(q => [q.rec, q.late, q.dam, q.ret]) });
    m.buttons = () => [['Space', 'Hold: count'], ['Enter', 'Send']];
    m.draw = (c, W, H, P) => {
      m.rows.forEach((q, k) => { const y = 10 + k * 34, on = k === m.i && m.phase === 'rows'; box(c, 8, y, 262, 30, COL.panel, on ? COL.gold : null, 4); txt(c, q.n, 14, y + 12, { size: 11, col: q.done ? COL.dim : COL.ink });
        txt(c, `rec ${q.rec}  +late ${q.late}  -dam ${q.dam}  -ret ${q.ret}`, 14, y + 25, { size: 10, col: COL.dim, font: 'monospace' }); if (q.done) txt(c, `= ${q.net} ✓`, 262, y + 20, { size: 13, align: 'right', col: P.good }); });
      box(c, 286, 10, 106, 100, '#14202a', COL.peri, 6); txt(c, 'COUNTER', 339, 28, { size: 9, align: 'center', col: COL.dim }); txt(c, String(m.cnt), 339, 82, { size: 40, align: 'center', font: 'monospace', col: m.held.S ? COL.gold : COL.ink });
      txt(c, m.phase === 'send' ? 'all rows locked: Enter sends' : 'hold Space to count', 200, 150, { size: 11, align: 'center', col: m.phase === 'send' ? P.good : COL.dim });
    };
    return m;
  },
});
