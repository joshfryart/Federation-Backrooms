// Yeoman: draft the cargo status note for the captain. The cargo status board keeps moving: crates come aboard, the ETA slips, a delay is
// posted. Copy each figure from the board into the note, and file the note while every line still agrees with the board. A line the board has
// changed since you copied it turns amber (stale); filing a stale note is how the captain gets surprised by a delay that was already known.
import { define, machine, ARROW, ENTER, ri, rf, pick, txt, box, COL } from './kit.js';

const FIELDS = ['Crates aboard', 'Crates to load', 'ETA at drop', 'Delay posted'];
const DELAYS = ['none', 'lift 2 jammed', 'QM recount', 'sled recharge', 'deck crew short', 'hatch seal check'];

export default define({
  job: { billet: 'yeoman', label: 'Draft cargo status note for captain', type: 'task:cargo_run' },
  title: 'Status note filed while the board agrees', dept: 'command', host: 'console', tool: 'Cargo status board and note pad',
  how: 'Pick a note line (↑ ↓) and copy its figure from the live board (→). The board keeps changing: a copied line it has since changed turns amber. File the note (Enter) only when no line is blank or amber.',
  keys: ['↑ ↓ pick a line', '→ copy from the board', 'Enter file the note'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'refresh and file', input: 'arrows+enter', win: 'three status notes sent to the captain each matching the moving cargo board at the instant of sending',
    fail: 'sending a note with a blank line or a figure the board has already moved past',
    rule: 'The board ticks over at random. Copy lines with →; any copied line the board later changes goes amber and must be copied again. Press Enter in a moment when all four lines are fresh.' },
  rush: 'Wrote "cargo on schedule" and dropped it in the tray.',
  captions: { 'stale note': 'captain\'s comm chirps', 'blank line': 'tray rejects the note' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, k = m.calm ? 1.6 : 1;
    let eta = ri(r, 30, 70); m.board = [ri(r, 8, 20), ri(r, 20, 40), eta, 'none']; m.next = FIELDS.map(() => rf(r, 1.2, 3.5) * k);
    m.note = [null, null, null, null]; m.cur = 0; m.filed = 0; m.rounds = 3; m.round = 1;
    const fmt = (i, v) => (i === 2 ? `+${v} min` : String(v));
    const change = (i) => {
      if (i === 0) { const n = ri(r, 1, 3); m.board[0] += n; m.board[1] = Math.max(0, m.board[1] - n); }
      else if (i === 1) m.board[1] += ri(r, 1, 2); else if (i === 2) m.board[2] += pick(r, [-2, 3, 5, 8]); else m.board[3] = pick(r, DELAYS.filter(d => d !== m.board[3]));
      m.next[i] = m.t + rf(r, 2.4, 4.6) * k;
    };
    const stale = (i) => m.note[i] !== null && m.note[i] !== m.board[i];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a) { if (down) { if (a === 'U') m.cur = (m.cur + 3) % 4; if (a === 'D') m.cur = (m.cur + 1) % 4; if (a === 'R' || a === 'L') m.note[m.cur] = m.board[m.cur]; } return true; }
      if (!ENTER(code)) return false; if (!down) return true;
      if (m.note.some(v => v === null)) m.fault('blank line'); else if (m.note.some((_, i) => stale(i))) m.fault('stale note');
      else { m.filed++; m.ev('filed'); if (m.filed >= 3) { m.win(); return true; } m.round = m.filed + 1; }
      m.note = [null, null, null, null]; return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; for (let i = 0; i < 4; i++) if (m.t >= m.next[i]) change(i); };
    m.hint = () => { const need = [0, 1, 2, 3].find(i => m.note[i] === null || stale(i)); if (need == null) return [['Enter', true]];
      if (need !== m.cur) return [[((need - m.cur + 4) % 4) <= 2 ? 'ArrowDown' : 'ArrowUp', true]]; return [['ArrowRight', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ board: m.board.slice(), next: m.next.map(v => +v.toFixed(2)) });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['ArrowRight', 'Copy ▶'], ['Enter', 'File']];
    m.draw = (c, W, H, P) => {
      box(c, 8, 8, 180, 128, 'rgba(255,255,255,.05)', COL.peri, 6); txt(c, 'CARGO STATUS BOARD (live)', 16, 24, { size: 9, col: COL.peri });
      box(c, 204, 8, 188, 128, 'rgba(255,255,255,.05)', COL.lav, 6); txt(c, 'NOTE TO CAPTAIN', 212, 24, { size: 9, col: COL.lav });
      FIELDS.forEach((f, i) => { const y = 46 + i * 24, st = stale(i), on = i === m.cur;
        txt(c, f, 16, y, { size: 10, col: COL.dim }); txt(c, fmt(i, m.board[i]), 180, y, { size: 12, align: 'right', col: COL.gold });
        box(c, 208, y - 13, 180, 19, on ? 'rgba(244,194,91,.18)' : null, on ? COL.gold : null, 4);
        txt(c, m.note[i] === null ? '— blank —' : fmt(i, m.note[i]), 214, y, { size: 12, col: m.note[i] === null ? COL.dim : st ? COL.warn : P.good });
        if (st) txt(c, '▲ stale', 384, y, { size: 9, align: 'right', col: COL.warn }); });
      txt(c, `notes filed ${m.filed} / 3`, 8, H - 12, { size: 11, col: COL.pale });
    };
    return m;
  },
});
