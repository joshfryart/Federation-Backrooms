// Holodeck tech: program archive audit. Each row is a program with its stored checksum and the checksum the scan just computed. Move the
// cursor with Up/Down and press Enter to quarantine a row whose two checksums differ; quarantining a good program is a fault.
import { define, machine, ARROW, ENTER, ri, shuffle, txt, COL } from './kit.js';

export default define({
  job: { billet: 'holo', label: 'Audit the program archive', type: 'loop' },
  title: 'Quarantine the mismatched checksum', dept: 'services', host: 'console', tool: 'Archive scan table',
  how: 'Compare the stored and scanned checksum on each row. Move the cursor with Up and Down and press Enter on every row that does not match.',
  keys: ['Up / Down: move the cursor', 'Enter quarantine this row'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'quarantine mismatch', input: 'arrows+enter', win: 'every corrupt program quarantined after comparing character by character, no good one touched',
    fail: 'quarantining a program whose checksums match, three times',
    rule: 'Each row shows stored and scanned checksums that differ by one character on a corrupt program. Cursor to it with Up/Down and press Enter.' },
  rush: 'Quarantined the programs with the oldest dates and trusted the rest unread.',
  captions: { 'good program': 'wrong quarantine tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, H = '0123456789ABCDEF', rows = 7; m.cur = 0; m.q = [];
    const hex = () => Array.from({ length: 4 }, () => H[ri(r, 0, 15)]).join('');
    m.rows = Array.from({ length: rows }, (_, i) => ({ n: `PRG-${ri(r, 100, 899)}`, a: hex(), bad: false }));
    for (const i of shuffle(r, [1, 2, 3, 4, 5, 6]).slice(0, ri(r, 2, 3))) m.rows[i].bad = true;
    for (const x of m.rows) { x.b = x.a; if (x.bad) { const k = ri(r, 0, 3); x.b = x.a.slice(0, k) + H[(H.indexOf(x.a[k]) + ri(r, 1, 15)) % 16] + x.a.slice(k + 1); } }
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a === 'U') m.cur = Math.max(0, m.cur - 1); else if (a === 'D') m.cur = Math.min(rows - 1, m.cur + 1);
      else if (ENTER(code)) { const x = m.rows[m.cur]; if (m.q.includes(m.cur)) return true; if (!x.bad) m.fault('good program'); else { m.q.push(m.cur); if (m.rows.every((y, i) => !y.bad || m.q.includes(i))) m.win(); } } else return false;
      return true;
    };
    m.hint = () => { const t = m.rows.findIndex((x, i) => x.bad && !m.q.includes(i)); if (t < 0) return []; return t === m.cur ? [['Enter', true]] : [[t > m.cur ? 'ArrowDown' : 'ArrowUp', true]]; };
    m.bad = () => { m.cur = 0; return 'Enter'; };
    m.view = () => ({ rows: m.rows.map(x => [x.n, x.a, x.b]) });
    m.buttons = () => [['ArrowUp', 'Up'], ['ArrowDown', 'Down'], ['Enter', 'Quarantine']];
    m.draw = (c, W, H2, P) => { m.rows.forEach((x, i) => { const y = 16 + i * 22; if (i === m.cur) { c.fillStyle = 'rgba(244,194,91,.2)'; c.fillRect(10, y - 13, 380, 18); }
      txt(c, x.n, 18, y, { size: 12 }); txt(c, `stored ${x.a}`, 120, y, { size: 12, col: COL.pale }); txt(c, `scanned ${x.b}`, 230, y, { size: 12, col: COL.pale }); if (m.q.includes(i)) txt(c, 'QUARANTINED', 340, y, { size: 10, col: P.good, align: 'center' }); }); };
    return m;
  },
});
