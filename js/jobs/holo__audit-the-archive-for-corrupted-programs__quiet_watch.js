// Holodeck tech: archive integrity scan. Program blocks stream past the scan frame one after another, each with a header checksum and a
// computed one. Press Space while a block whose two checksums differ is in the scan frame to flag it; flagging a good block, or letting a corrupt one
// pass, is a fault.
import { define, machine, SPACE, ri, shuffle, txt, COL } from './kit.js';

export default define({
  job: { billet: 'holo', label: 'Audit the archive for corrupted programs', type: 'task:quiet_watch' },
  title: 'Flag the bad block in the scan frame', dept: 'services', host: 'console', tool: 'Integrity scan stream',
  how: 'Blocks slide through the scan frame. When the header checksum and the computed checksum on a block differ, press Space to flag it.',
  keys: ['Space flag the block in the frame'], limit: 26, maxFaults: 3,
  fingerprint: { verb: 'flag on stream', input: 'space', win: 'every corrupt block in a nine-block scan stream flagged as it passed the window with no good block flagged',
    fail: 'flagging a block whose checksums match, or letting a mismatched block slide past unflagged',
    rule: 'Each block sits in the frame for about a second. Compare its header and computed checksums; press Space only if they differ.' },
  rush: 'Flagged every tenth block on a hunch and let the scan run unwatched.',
  captions: { 'false flag': 'wrong-flag tone', skipped: 'bad block loaded' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, H = '0123456789ABCDEF', gap = 1.4, win = m.calm ? 1.3 : 1.0; m.n = 9; m.round = 0; m.blocks = []; const bad = new Set(shuffle(r, [0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, ri(r, 3, 4)));
    for (let i = 0; i < m.n; i++) { const a = Array.from({ length: 4 }, () => H[ri(r, 0, 15)]).join(''); let b = a; if (bad.has(i)) { const k = ri(r, 0, 3); b = a.slice(0, k) + H[(H.indexOf(a[k]) + ri(r, 1, 15)) % 16] + a.slice(k + 1); } m.blocks.push({ t: 1 + i * gap, a, b, bad: bad.has(i), done: false }); }
    const cur = () => m.blocks.find(b => !b.done && m.t >= b.t && m.t < b.t + win);
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down || !SPACE(code)) return false; const b = cur(); if (!b) { m.fault('false flag'); return true; }
      b.done = true; m.round++; if (!b.bad) m.fault('false flag'); if (m.round >= m.n && m.state === 'play') m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; for (const b of m.blocks) if (!b.done && m.t >= b.t + win) { b.done = true; m.round++; if (b.bad) m.fault('skipped'); if (m.round >= m.n && m.state === 'play') m.win(); } };
    m.hint = () => { const b = cur(); return b && b.bad && m.t - b.t > 0.25 ? [['Space', true]] : []; };
    m.bad = () => { const b = cur(); return b && !b.bad ? 'Space' : null; };
    m.view = () => ({ blocks: m.blocks.map(b => [b.a, b.b]) });
    m.buttons = () => [['Space', 'Flag']];
    m.draw = (c, W, H2, P) => { c.strokeStyle = COL.gold; c.lineWidth = 2; c.strokeRect(150, 24, 100, 100);
      for (const b of m.blocks) { const x = 150 + (b.t - m.t) * 70; if (x < -90 || x > 400) continue; c.fillStyle = 'rgba(125,151,232,.25)'; c.fillRect(x, 34, 96, 80); txt(c, `hdr ${b.a}`, x + 6, 62, { size: 12 }); txt(c, `calc ${b.b}`, x + 6, 90, { size: 12, col: COL.pale }); }
      txt(c, `${m.round} / ${m.n} blocks`, 16, 14, { size: 11, col: COL.dim }); };
    return m;
  },
});
