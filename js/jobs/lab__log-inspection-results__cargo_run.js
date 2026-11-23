// Lab technician, cargo run: log inspection results. The printout lines and the log entries are all face down on the bench, eight cards: four
// printout readings and four log entries, each carrying a crate ID, and some IDs differ by one character. Turn two cards over with the digit keys (1-8).
// If both carry exactly the same crate ID they stay turned up as a filed pair; if they only look alike they turn back down and the mismatch is a fault.
import { define, machine, DIG, ri, shuffle, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'lab', label: 'Log inspection results', type: 'task:cargo_run' },
  title: 'Turn up the matching crate IDs', dept: 'sciences', host: 'console', tool: 'Printout and log cards',
  how: 'Eight cards face down. Press 1-8 to turn two over; if their crate IDs match exactly they stay up as a filed pair. Look-alike IDs turn back down and count against you.',
  keys: ['1-8 turn a card over'], limit: 34, maxFaults: 5,
  fingerprint: { verb: 'turn pairs', input: 'digits',
    win: 'all four printout readings filed by turning up each with the log card carrying exactly its crate ID',
    fail: 'turning up look-alike crate IDs that differ by one character, five times, because the cards were not remembered',
    rule: 'Turn over any two cards: an exact ID match stays up, a mismatch flips back after a moment. Remember where the look-alike IDs lie so each card is turned only against its partner.' },
  rush: 'Typed the readings into the log top to bottom in printout order.',
  captions: { mismatch: 'ID mismatch: cards turned back' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, back = m.calm ? 1 : 0.7; m.up = []; m.lock = 0; m.pend = null;
    const base = ri(r, 1000, 8900), ids = [base, base + 1, base + 10, base + 100].map(v => 'C-' + v), vals = Array.from({ length: 4 }, () => (ri(r, 20, 99) / 10).toFixed(1));
    m.cards = shuffle(r, ids.flatMap((id, i) => [{ id, kind: 'printout', v: vals[i], ok: false }, { id, kind: 'log', v: '', ok: false }]));
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code); if (d < 1 || d > 8) return false; if (!down || m.lock > 0) return true; const c = m.cards[d - 1]; if (c.ok || m.up.includes(d - 1)) return true;
      m.up.push(d - 1); if (m.up.length === 2) { const [a, b] = m.up.map(i => m.cards[i]); if (a.id === b.id && a.kind !== b.kind) { a.ok = b.ok = true; m.up = []; m.lock = 0.2; if (m.cards.every(x => x.ok)) m.win(); } else { m.fault('mismatch'); m.lock = back; } } return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.lock > 0) { m.lock -= dt; if (m.lock <= 0) { m.lock = 0; if (m.up.length === 2) m.up = []; } } };
    const partner = (i) => m.cards.findIndex((x, j) => j !== i && x.id === m.cards[i].id);
    m.hint = () => { if (m.state !== 'play' || m.lock > 0) return []; if (m.up.length === 1) return [['Digit' + (partner(m.up[0]) + 1), true]]; const i = m.cards.findIndex(x => !x.ok); return i < 0 ? [] : [['Digit' + (i + 1), true]]; };
    m.bad = () => (m.up.length ? null : 'Digit1');
    m.view = () => ({ c: m.cards.map(c => c.id + c.kind[0]) });
    m.buttons = () => Array.from({ length: 8 }, (_, i) => ['Digit' + (i + 1), String(i + 1)]);
    m.draw = (c, W, H, P) => {
      m.cards.forEach((q, i) => { const x = 14 + (i % 4) * 94, y = 10 + Math.floor(i / 4) * 74, open = q.ok || m.up.includes(i); box(c, x, y, 86, 66, open ? '#25304f' : '#161428', q.ok ? P.good : COL.peri, 6);
        if (open) { txt(c, q.id, x + 43, y + 26, { size: 13, align: 'center', font: 'monospace' }); txt(c, q.kind === 'log' ? 'LOG ENTRY' : `READ ${q.v}`, x + 43, y + 46, { size: 9, align: 'center', col: COL.dim }); } else txt(c, String(i + 1), x + 43, y + 40, { size: 20, align: 'center', col: COL.dim }); });
      txt(c, `filed ${m.cards.filter(q => q.ok).length / 2}/4`, 386, 164, { size: 10, align: 'right', col: COL.dim });
    };
    return m;
  },
});
