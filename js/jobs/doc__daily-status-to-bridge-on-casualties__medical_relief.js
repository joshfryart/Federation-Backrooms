// Doc: daily status to the bridge on casualties. The sickbay board shows red, amber and green bed counts. Key the three figures in that order
// (digits 1 to 9), then press Enter to read the report aloud. Mid-way the board changes by a bed or two and the half-typed form is wiped: a
// report sent with a count that is under or stale is a fault. Two reports to give.
import { define, machine, DIG, ENTER, ri, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'doc', label: 'Daily status to bridge on casualties', type: 'task:medical_relief' },
  title: 'Casualty figures to the bridge', dept: 'medical', host: 'console', tool: 'Status form',
  how: 'Type the red, amber and green counts from the board with the digit keys, in that order, then press Enter to read it aloud. If the board updates, the form clears: type it again.',
  keys: ['1 to 9 key a figure', 'Enter read it to the bridge'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'key the figures', input: 'digits+enter', win: 'two status reports keyed with the true red, amber and green counts from the live board and read aloud to the bridge',
    fail: 'reading out a count that understates the board or was keyed before a board update',
    rule: 'Copy the three counts from the board into the form in order, then press Enter. When the board flashes UPDATED the form wipes itself and the new counts are the ones to send.' },
  rush: 'Told the bridge roughly how many were hurt from memory.',
  captions: { understated: 'comms chirp', stale: 'comms chirp' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; m.rounds = 2; m.round = 0; m.rt = 0; m.flash = 0;
    const fresh = () => [ri(r, 1, 5), ri(r, 2, 7), ri(r, 2, 8)];
    m.board = fresh(); m.buf = []; m.upAt = ri(r, 2, 3) + 0.5; m.upDone = false;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code);
      if (d) { if (m.buf.length < 3) m.buf.push(d); return true; }
      if (!ENTER(code)) return false;
      if (m.buf.length === 3 && m.buf.every((x, i) => x === m.board[i])) { m.round++; m.rt = 0; m.buf = []; m.upDone = false; m.upAt = ri(r, 2, 3) + 0.5; m.board = fresh(); if (m.round >= 2) m.win(); }
      else { m.fault(m.flash > 0 ? 'stale' : 'understated'); m.buf = []; }
      return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.rt += dt; m.flash = Math.max(0, m.flash - dt);
      if (!m.upDone && m.rt >= m.upAt) { m.upDone = true; const k = ri(r, 0, 2); m.board[k] = m.board[k] % 9 + 1; m.buf = []; m.flash = 1.5; } };
    m.hint = () => (m.buf.length < 3 ? [['Digit' + m.board[m.buf.length], true]] : [['Enter', true]]);
    m.bad = () => 'Enter';
    m.view = () => ({ board: m.board.slice(), upAt: m.upAt });
    m.buttons = () => [['Enter', 'Read aloud']];
    m.draw = (c, W, H, P) => {
      txt(c, 'SICKBAY BOARD', 20, 24, { size: 12, col: COL.dim }); if (m.flash > 0) txt(c, 'UPDATED', 150, 24, { size: 12, col: COL.warn });
      [['RED', P.bad], ['AMBER', COL.warn], ['GREEN', P.good]].forEach(([n, col], k) => { box(c, 20 + k * 80, 36, 72, 54, 'rgba(255,255,255,.06)', col, 6);
        txt(c, n, 56 + k * 80, 52, { size: 11, col, align: 'center' }); txt(c, m.board[k], 56 + k * 80, 82, { size: 26, align: 'center' }); });
      txt(c, 'FORM', 20, 118, { size: 12, col: COL.dim }); for (let k = 0; k < 3; k++) { box(c, 70 + k * 40, 102, 32, 26, null, COL.peri, 4); txt(c, m.buf[k] ?? '', 86 + k * 40, 122, { size: 18, align: 'center' }); }
      txt(c, `report ${Math.min(2, m.round + 1)} / 2`, 260, 120, { size: 12, col: COL.pale });
    };
    return m;
  },
});
