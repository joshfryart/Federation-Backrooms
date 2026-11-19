// Armory, shakedown: report all findings to the Deputy. The readiness form on the armory console arrives pre-filled from memory, and some figures
// are off. For each field, hold Space to pull up its source (the rack count, a test card, a log line) and read the true figure; the source closes
// when you let go. Hold ↑ or ↓ to roll the form figure to match, then Enter to commit the field. Committing a figure you have not traced, or one
// that differs from its source, is a fault. With every field committed, Enter sends the form; wait for the Deputy's receipt tone, do not resend.
import { define, machine, ARROW, SPACE, ENTER, ri, shuffle, txt, box, COL } from './kit.js';

const FIELDS = [['Weapons on the rack', 'rack count', 18, 26], ['Test cards filed', 'card box', 10, 18], ['Lowest cell reading %', 'charge log', 62, 79], ['Lowest emitter reading', 'emitter log', 48, 66], ['Items below spec', 'bench sheet', 1, 5]];
export default define({
  job: { billet: 'armory', label: 'Report all findings to the Deputy', type: 'task:shakedown' },
  title: 'Readiness form traced to source', dept: 'security', host: 'console', tool: 'Armory console readiness form',
  how: 'For each field hold Space to open its source and read the true figure, roll the form figure to it with ↑ / ↓ held, then Enter to commit. When all fields are in, Enter sends; wait for the receipt tone.',
  keys: ['hold Space: open the source', 'hold ↑ ↓ roll the figure', 'Enter commit / send'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'trace and roll', input: 'arrows-hold+space-hold+enter', win: 'every readiness-form figure traced to its source log, rolled to match it exactly and committed, then the form sent once and receipted',
    fail: 'committing a figure without opening its source, committing one that differs from the source, or resending before the receipt tone',
    rule: 'Hold Space to see the source figure (it hides when you let go). Hold ↑ or ↓ to roll the form figure to it, Enter to commit. Last Enter sends; then wait for RECEIPT.' },
  rush: 'Filled in the readiness form from memory and pressed send.',
  captions: { 'from memory': 'Deputy: where did that number come from?', mismatch: 'form field flashes', 'sent twice': 'duplicate report chime', receipt: 'receipt tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, rate = m.calm ? 3 : 4, wrong = new Set(shuffle(r, [0, 1, 2, 3, 4]).slice(0, ri(r, 2, 4)));
    m.f = FIELDS.map(([n, src, a, b], i) => { const L = ri(r, a, b); let F = L; if (wrong.has(i)) { do F = L + ri(r, -4, 4); while (F === L || F < 0); } return { n, src, L, F, traced: 0, ok: false }; });
    m.i = 0; m.acc = 0; m.phase = 'fill'; m.wait = 0; m.rounds = 5; m.round = 0;
    const cur = () => m.f[m.i];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'U' || a === 'D') { m.held[a] = down; return true; } if (a) return true;
      if (SPACE(code)) { m.held.S = down; return true; }
      if (!ENTER(code)) return false; if (!down) return true;
      if (m.phase === 'sent') { m.fault('sent twice'); return true; }
      if (m.phase === 'send') { m.phase = 'sent'; m.wait = 0; return true; }
      const q = cur(); if (q.traced < 0.4) { m.fault('from memory'); return true; } if (q.F !== q.L) { m.fault('mismatch'); return true; }
      q.ok = true; m.i++; m.round++; m.acc = 0; m.held.S = false; if (m.i >= m.f.length) m.phase = 'send'; return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return;
      if (m.phase === 'sent') { m.wait += dt; if (m.wait >= 1.4) { m.ev('receipt'); m.win(); } return; }
      const q = cur(); if (!q || m.phase !== 'fill') return; if (m.held.S) q.traced += dt;
      const dir = (m.held.U ? 1 : 0) - (m.held.D ? 1 : 0);
      if (dir) { m.acc += rate * dt; while (m.acc >= 1) { m.acc -= 1; q.F = Math.max(0, q.F + dir); } } else m.acc = 0;
    };
    m.hint = () => {
      if (m.phase === 'send') return [['Enter', true]]; if (m.phase !== 'fill') return [];
      const q = cur(); if (q.traced < 0.5) return [['Space', true]];
      if (q.F !== q.L) return [['Space', false], [q.F < q.L ? 'ArrowUp' : 'ArrowDown', true]];
      return [['Space', false], ['ArrowUp', false], ['ArrowDown', false], ['Enter', true]];
    };
    m.bad = () => 'Enter';
    m.view = () => ({ f: m.f.map(q => [q.L, q.F]) });
    m.buttons = () => [['Space', 'Source (hold)'], ['ArrowUp', '▲ roll'], ['ArrowDown', '▼ roll'], ['Enter', 'Commit / Send']];
    m.draw = (c, W, H, P) => {
      txt(c, 'DEFENSIVE READINESS FORM', 14, 16, { size: 10, col: COL.dim });
      m.f.forEach((q, k) => {
        const y = 34 + k * 20, here = k === m.i && m.phase === 'fill'; if (here) box(c, 8, y - 14, 236, 19, 'rgba(244,194,91,.16)', COL.gold, 4);
        txt(c, q.n, 14, y, { size: 11, col: q.ok ? COL.dim : COL.ink }); txt(c, String(q.F), 236, y, { size: 13, align: 'right', font: 'monospace', col: q.ok ? P.good : COL.gold });
      });
      const q = cur();
      box(c, 256, 24, 132, 90, '#201c10', COL.pale, 6);
      if (m.phase === 'fill' && q) { txt(c, `SOURCE: ${q.src}`, 264, 42, { size: 10, col: COL.dim }); txt(c, m.held.S ? String(q.L) : 'hold Space', 322, 82, { size: m.held.S ? 28 : 12, align: 'center', font: 'monospace', col: COL.pale }); }
      else txt(c, m.phase === 'sent' ? 'awaiting receipt…' : 'all fields in: Enter sends', 322, 72, { size: 11, align: 'center', col: COL.warn });
      txt(c, `committed ${m.f.filter(x => x.ok).length} / ${m.f.length}`, 14, H - 10, { size: 10, col: COL.dim });
    };
    return m;
  },
});
