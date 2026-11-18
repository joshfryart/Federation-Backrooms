// Transporter chief: verify the manifest and run the buffer purge. Work down the completed manifest one line at a time and find that crate's
// tag in the cargo bay list, which is in a different order and holds look-alike tags. Pair the line with its exact tag (Enter). A line with no
// exact tag in the bay is marked red and the batch held for a recount (Space). With every line checked, press Enter again to run the purge.
import { define, machine, ARROW, SPACE, ENTER, ri, shuffle, txt, box, COL } from './kit.js';

const tag = (d) => 'C-' + d.join('');
function nearMiss(r, d) { const x = d.slice(), i = ri(r, 0, 2); if (x[i] !== x[i + 1] && r() < 0.6) { [x[i], x[i + 1]] = [x[i + 1], x[i]]; } else { x[i + 1] = (x[i + 1] + ri(r, 1, 8)) % 10; } return x; }
export default define({
  job: { billet: 'tchief', label: 'Verify manifest and buffer purge', type: 'task:cargo_run' },
  title: 'Manifest to bay tag pairing', dept: 'operations', host: 'console', tool: 'Manifest and cargo bay list',
  how: 'For each manifest line, move the cursor (Up/Down) to its exact tag in the bay list and press Enter to pair them. If the bay holds no exact tag, press Space to mark the line red. Then Enter runs the purge.',
  keys: ['↑ ↓ bay list cursor', 'Enter pair / run purge', 'Space mark line red'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'pair the tags', input: 'arrows+space+enter', win: 'every manifest line paired with its own exact bay tag or held red when the bay has none, then the purge run',
    fail: 'pairing a line with a look-alike tag, or holding a line red that the bay does list',
    rule: 'Manifest lines go top to bottom; the bay list is shuffled and contains transposed look-alikes. Pair only an identical tag; if none is identical, Space marks the line red. Enter after the last line runs the purge.' },
  rush: 'Counted the crates, matched the total and purged.',
  captions: { 'mismatched pair': 'reject tone', 'false hold': 'hold buzzer' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, N = 5, digs = () => Array.from({ length: 4 }, () => ri(r, 0, 9));
    m.lines = Array.from({ length: N }, () => ({ d: digs(), done: 0 })); const missing = ri(r, 0, N - 1), decoy = (missing + ri(r, 1, N - 1)) % N;
    const bay = []; m.lines.forEach((l, k) => { if (k === missing) bay.push(tag(nearMiss(r, l.d))); else bay.push(tag(l.d)); if (k === decoy) bay.push(tag(nearMiss(r, l.d))); });
    bay.push(tag(digs())); m.bay = shuffle(r, bay).map(t => ({ t, used: false }));
    m.k = 0; m.cur = 0; m.purged = false; m.rounds = N; m.round = 0;
    const L = () => m.lines[m.k], exact = () => { const l = L(); return l ? m.bay.findIndex(b => !b.used && b.t === tag(l.d)) : -1; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (!a && !SPACE(code) && !ENTER(code)) return false; if (!down) return true;
      const l = L();
      if (a === 'U') m.cur = Math.max(0, m.cur - 1); else if (a === 'D') m.cur = Math.min(m.bay.length - 1, m.cur + 1);
      else if (ENTER(code)) {
        if (!l) { m.purged = true; m.ev('purge'); m.win(); return true; }
        const b = m.bay[m.cur]; if (!b.used && b.t === tag(l.d)) { b.used = true; l.done = 1; m.k++; m.round++; } else m.fault('mismatched pair');
      } else if (SPACE(code) && l) { if (exact() >= 0) m.fault('false hold'); else { l.done = 2; m.k++; m.round++; } }
      return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { if (!L()) return [['Enter', true]]; const e = exact(); if (e < 0) return [['Space', true]]; if (e === m.cur) return [['Enter', true]]; return [[e < m.cur ? 'ArrowUp' : 'ArrowDown', true]]; };
    m.bad = () => { const l = L(); if (!l) return null; return m.bay[m.cur].t !== tag(l.d) ? 'Enter' : 'ArrowDown'; };
    m.view = () => ({ lines: m.lines.map(l => tag(l.d)), bay: m.bay.map(b => b.t) });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['Enter', 'Pair / Purge'], ['Space', 'Mark red']];
    m.draw = (c, W, H, P) => {
      txt(c, 'MANIFEST', 14, 16, { size: 10, col: COL.dim }); txt(c, 'CARGO BAY LIST', 220, 16, { size: 10, col: COL.dim });
      m.lines.forEach((l, k) => {
        const y = 22 + k * 24, on = k === m.k; box(c, 10, y, 180, 20, on ? 'rgba(240,147,58,.18)' : 'rgba(255,255,255,.04)', on ? COL.orange : null, 5);
        txt(c, `${k + 1}  ${tag(l.d)}`, 20, y + 15, { size: 13, font: 'monospace', col: l.done === 2 ? P.bad : COL.ink });
        if (l.done) txt(c, l.done === 1 ? '✓ paired' : '✗ HOLD', 180, y + 15, { size: 10, align: 'right', col: l.done === 1 ? P.good : P.bad });
      });
      const top = Math.max(0, Math.min(m.cur - 2, m.bay.length - 6));
      m.bay.slice(top, top + 6).forEach((b, j) => {
        const k = top + j, y = 22 + j * 22, on = k === m.cur; box(c, 214, y, 170, 18, on ? 'rgba(125,151,232,.25)' : null, on ? COL.peri : null, 4);
        txt(c, (on ? '▶ ' : '  ') + b.t, 222, y + 14, { size: 13, font: 'monospace', col: b.used ? COL.dim : COL.ink });
        if (b.used) { c.fillStyle = COL.dim; c.fillRect(240, y + 9, 70, 1.5); }
      });
      txt(c, L() ? `line ${m.k + 1}: pair (Enter) or mark red (Space)` : 'ALL LINES CHECKED — Enter runs the buffer purge', 14, H - 12, { size: 11, col: L() ? COL.dim : P.good });
    };
    return m;
  },
});
