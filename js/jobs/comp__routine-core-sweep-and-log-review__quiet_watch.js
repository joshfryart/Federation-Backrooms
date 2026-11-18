// Computer specialist: routine core sweep and log review. The core log opens on its last page. Scroll back through the whole shift with the
// arrows (short holds read; a long hold skims and the lines that fly past are not read), find the stack ID that keeps repeating in the warning
// and error lines, and tick it on the sweep card by its number. Answering before every warning line has been read is the classic miss.
import { define, machine, ARROW, DIG, ri, pick, shuffle, clamp, txt, box, bar, COL } from './kit.js';

const LINES = 24, WIN = 6, STACKS = 6;
export default define({
  job: { billet: 'comp', label: 'Routine core sweep and log review', type: 'task:quiet_watch' },
  title: 'Core log repeat hunt', dept: 'operations', host: 'console', tool: 'Datacore console core log',
  how: 'Scroll the whole core log (Up / Down; keep holds short, a long hold skims without reading). Find the stack ID that repeats in warning and error lines, then tick that stack (1-6) on the sweep card.',
  keys: ['Up / Down hold: scroll', '1-6 tick the repeating stack'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'scroll for repeats', input: 'arrows-hold+digits', win: 'two shift logs read through at reading speed and the stack repeating in their warnings ticked each time',
    fail: 'ticking a stack before every warning line of the shift has been read, or ticking a stack that does not repeat',
    rule: 'Holding an arrow scrolls slowly for about a second, then skims; skimmed lines stay unread. Read every warning line, then press the digit of the stack that appears in three or more of them.' },
  rush: 'Glanced at the last page of the log and ticked the card.',
  captions: { 'unread page': 'sweep card rejected', 'missed repeat': 'repeat fault left in the log' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, slow = m.calm ? 3.2 : 4.2;
    const mk = (h0) => {
      const rep = ri(r, 1, STACKS), others = shuffle(r, [1, 2, 3, 4, 5, 6].filter(s => s !== rep)), warn = shuffle(r, Array.from({ length: LINES }, (_, i) => i)).slice(0, 8);
      const ids = shuffle(r, [rep, rep, rep, others[0], others[0], others[1], others[2], others[3]]);
      const lines = Array.from({ length: LINES }, (_, i) => ({ time: `${String(h0 + Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15 + ri(r, 0, 14)).padStart(2, '0')}`, sev: 'INFO', stack: 0, msg: pick(r, ['heartbeat', 'cache flush', 'index rebuilt', 'sync ok', 'queue idle']), read: false }));
      warn.forEach((li, k) => Object.assign(lines[li], { sev: r() < 0.6 ? 'WARN' : 'ERR', stack: ids[k], msg: pick(r, ['cache parity', 'slow write', 'retry on read', 'scan marker drop']) }));
      return { rep, lines, top: LINES - WIN };
    };
    m.logs = [mk(ri(r, 0, 6)), mk(ri(r, 8, 14))]; m.li = 0; m.dir = null; m.ht = 0; m.rounds = 2; m.round = 0;
    const log = () => m.logs[m.li], allRead = () => log().lines.every(l => l.sev === 'INFO' || l.read);
    const markRead = () => { const L = log(), a = Math.floor(L.top); for (let k = a; k < Math.min(LINES, a + WIN); k++) L.lines[k].read = true; };
    markRead();
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'U' || a === 'D') { if (down) { if (m.dir !== a) { m.dir = a; m.ht = 0; } } else if (m.dir === a) m.dir = null; return true; }
      const d = DIG(code); if (!d || !down) return false; if (d > STACKS) return true;
      if (!allRead()) { m.fault('unread page'); return true; }
      if (d !== log().rep) { m.fault('missed repeat'); return true; }
      m.round++; m.ev('ticked', { stack: d }); if (m.li + 1 >= m.logs.length) m.win(); else { m.li++; m.dir = null; markRead(); }
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt) || !m.dir) return; m.ht += dt; const L = log(), fast = m.ht > 0.9, v = fast ? 14 : slow;
      L.top = clamp(L.top + (m.dir === 'U' ? -v : v) * dt, 0, LINES - WIN); if (!fast) markRead();
    };
    m.hint = () => {
      if (allRead()) return m.dir ? [['Arrow' + (m.dir === 'U' ? 'Up' : 'Down'), false]] : [['Digit' + log().rep, true]];
      const L = log(), want = L.lines.findIndex(l => l.sev !== 'INFO' && !l.read) < L.top ? 'U' : 'D', code = want === 'U' ? 'ArrowUp' : 'ArrowDown';
      if (m.dir && (m.ht > 0.6 || m.dir !== want)) return [['Arrow' + (m.dir === 'U' ? 'Up' : 'Down'), false]];
      return [[code, true]];
    };
    m.bad = () => 'Digit' + log().rep;
    m.view = () => ({ l: m.logs.map(L => [L.rep, L.lines.map(l => l.stack)]) });
    m.buttons = () => [['ArrowUp', '▲ scroll'], ['ArrowDown', '▼ scroll'], ...Array.from({ length: STACKS }, (_, i) => ['Digit' + (i + 1), `Stack ${i + 1}`])];
    m.draw = (c, W, H, P) => {
      const L = log(), a = Math.floor(L.top); box(c, 10, 8, 270, 6 * 22 + 6, 'rgba(255,255,255,.04)', COL.peri, 8);
      for (let k = 0; k < WIN && a + k < LINES; k++) {
        const l = L.lines[a + k], y = 26 + k * 22, w = l.sev !== 'INFO';
        txt(c, l.time, 18, y, { size: 11, col: COL.dim }); txt(c, l.sev, 64, y, { size: 11, col: l.sev === 'ERR' ? P.bad : w ? COL.warn : COL.dim });
        txt(c, w ? `S${l.stack} ${l.msg}` : l.msg, 108, y, { size: 11, col: w ? COL.ink : COL.dim });
      }
      bar(c, 288, 8, 8, 138, 0, {}); c.fillStyle = COL.gold; c.fillRect(288, 8 + (a / LINES) * 138, 8, (WIN / LINES) * 138);
      const un = L.lines.filter(l => l.sev !== 'INFO' && !l.read).length;
      txt(c, `Shift log ${m.li + 1}/2`, 306, 24, { size: 12, col: COL.gold }); txt(c, `${un} warning`, 306, 50, { size: 11, col: un ? COL.warn : P.good }); txt(c, `lines unread`, 306, 64, { size: 11, col: un ? COL.warn : P.good });
      txt(c, m.dir && m.ht > 0.9 ? 'SKIMMING' : m.dir ? 'reading' : '', 306, 92, { size: 11, col: m.dir && m.ht > 0.9 ? P.bad : COL.peri });
      txt(c, 'Tick the stack that repeats 3×', 14, H - 6, { size: 10, col: COL.dim });
    };
    return m;
  },
});
