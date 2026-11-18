// CFO: update flight schedule and sign-offs. The schedule grid (shuttles across, shifts down) has been pencilled in from the request tray.
// Check every booking against the pilot cards: cleared craft, rest log and one craft per pilot per shift. Move the cursor (arrows), strike any
// booking that breaks a rule (Space), and send the sheet to the XO (Enter) only when nothing illegal is left on it.
import { define, machine, SPACE, ENTER, ARROW, ri, pick, shuffle, txt, box, COL } from './kit.js';

const NAMES = ['Okafor', 'Reyes', 'Lindqvist', 'Tanaka', 'Moreau', 'Haddad', 'Novak', 'Petrov'], CRAFT = ['Galileo', 'Kepler', 'Yeager'];
export default define({
  job: { billet: 'cfo', label: 'Update flight schedule and sign-offs', type: 'loop' },
  title: 'Strike illegal schedule bookings', dept: 'flight', host: 'console', tool: 'Schedule grid and pilot cards',
  how: 'Check each booking against the pilot cards (cleared craft, rest ends, one craft per shift). Arrows move, Space strikes an illegal booking, Enter sends the sheet to the XO.',
  keys: ['Arrows move', 'Space strikes a booking', 'Enter sends the sheet'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'strike bookings', input: 'arrows+space+enter', win: 'sheet sent to the XO with every uncleared, unrested or double-booked pilot struck and every legal booking kept',
    fail: 'sending a sheet that still holds an illegal booking, or striking a legal one',
    rule: 'A booking is illegal if the pilot is not cleared for that craft, is still resting in that shift, or flies two craft in one shift. Strike those with Space; Enter sends.' },
  rush: 'Initialled the pencilled grid as it came off the tray.',
  captions: { 'illegal sent': 'XO sends it back', 'legal struck': 'pilot protests' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    m.pilots = shuffle(r, NAMES).slice(0, 5).map(n => ({ n, ok: shuffle(r, [0, 1, 2]).slice(0, 2), rest: r() < 0.35 ? 2 : 1 }));
    const legal = (p, x, y, g) => p.ok.includes(x) && y + 1 >= p.rest && !g[y].some((q, k) => k !== x && q === p);
    m.g = [0, 1, 2].map(() => [null, null, null]);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) { const c = shuffle(r, m.pilots).find(p => legal(p, x, y, m.g)); m.g[y][x] = c || null; }
    const cells = shuffle(r, [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(k => m.g[Math.floor(k / 3)][k % 3])).slice(0, ri(r, 2, 3));
    for (const k of cells) { const y = Math.floor(k / 3), x = k % 3, bad = shuffle(r, m.pilots).find(p => !legal(p, x, y, m.g)); if (bad) m.g[y][x] = bad; }
    m.struck = new Set(); m.cx = 0; m.cy = 0;
    m.illegal = (x, y) => { const p = m.g[y][x]; if (!p || m.struck.has(y * 3 + x)) return false; return !p.ok.includes(x) || y + 1 < p.rest || m.g[y].some((q, k) => k !== x && q === p && !m.struck.has(y * 3 + k)); };
    const first = () => { for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) if (m.illegal(x, y)) return [x, y]; return null; };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a) { if (a === 'L') m.cx = Math.max(0, m.cx - 1); if (a === 'R') m.cx = Math.min(2, m.cx + 1); if (a === 'U') m.cy = Math.max(0, m.cy - 1); if (a === 'D') m.cy = Math.min(2, m.cy + 1); return true; }
      if (SPACE(code)) { const k = m.cy * 3 + m.cx; if (!m.g[m.cy][m.cx] || m.struck.has(k)) return true; if (!m.illegal(m.cx, m.cy)) m.fault('legal struck'); m.struck.add(k); return true; }
      if (ENTER(code)) { if (first()) { m.fault('illegal sent'); return true; } m.win(); return true; }
      return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const f = first(); if (!f) return [['Enter', true]]; const [x, y] = f; if (x < m.cx) return [['ArrowLeft', true]]; if (x > m.cx) return [['ArrowRight', true]]; if (y < m.cy) return [['ArrowUp', true]]; if (y > m.cy) return [['ArrowDown', true]]; return [['Space', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ g: m.g.map(row => row.map(p => p ? p.n : '')), p: m.pilots.map(p => [p.ok, p.rest]) });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['Space', 'Strike'], ['Enter', 'Send to XO']];
    m.draw = (c, W, H, P) => {
      CRAFT.forEach((n, x) => txt(c, n, 70 + x * 72, 16, { size: 11, col: COL.dim }));
      for (let y = 0; y < 3; y++) { txt(c, `Shift ${y + 1}`, 10, 40 + y * 30, { size: 11, col: COL.dim }); for (let x = 0; x < 3; x++) {
        const p = m.g[y][x], k = y * 3 + x, cur = x === m.cx && y === m.cy; box(c, 64 + x * 72, 24 + y * 30, 68, 25, COL.panel, cur ? COL.gold : null, 4);
        if (p) { txt(c, p.n, 70 + x * 72, 41 + y * 30, { size: 11, col: m.struck.has(k) ? COL.dim : COL.ink }); if (m.struck.has(k)) { c.fillStyle = P.bad; c.fillRect(68 + x * 72, 36 + y * 30, 60, 2); } } else txt(c, 'open', 70 + x * 72, 41 + y * 30, { size: 11, col: COL.dim });
      } }
      txt(c, 'PILOT CARDS', 290, 16, { size: 10, col: COL.dim });
      m.pilots.forEach((p, k) => txt(c, `${p.n}: ${p.ok.map(x => CRAFT[x][0]).join('/')} · rest to S${p.rest}`, 290, 32 + k * 15, { size: 10, col: COL.pale }));
      txt(c, 'Strike: not cleared · resting · two craft in one shift', 14, 132, { size: 10, col: COL.dim });
      txt(c, `struck ${m.struck.size}`, 14, 152, { size: 12, col: COL.warn });
    };
    return m;
  },
});
