// XO: brief the chiefs on the test sequence. The sequence card fixes the order the shakedown tests run in. Chiefs keep calling in, keen to
// start their own system: clear a test to start only when it is the next one on the card, and hold every request that jumps the queue.
// Clearing a test out of order, holding the one that is due, or leaving a chief hanging on the comm is a fault.
import { define, machine, ARROW, shuffle, rf, txt, box, lamp, COL } from './kit.js';

const SYS = [['Structural integrity field', 'Engineering'], ['Inertial dampers', 'Engineering'], ['Impulse engines', 'Flight'], ['Sensor arrays', 'Science'], ['Shield grid', 'Tactical'], ['Transporters', 'Operations'], ['Life support', 'Environmental']];
export default define({
  job: { billet: 'xo', label: 'Brief chiefs on test sequence', type: 'task:shakedown' },
  title: 'Test sequence gatekeeper', dept: 'command', host: 'console', tool: 'Ready room test sequence card and desk comm',
  how: 'Chiefs call in asking to start their test: ↑ clears it only if it is next on the sequence card, ↓ holds any request that jumps ahead.',
  keys: ['↑ clear to start', '↓ hold: not yet'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'hold the order', input: 'arrows', win: 'every shakedown test cleared strictly in sequence card order with each queue-jumping request held',
    fail: 'clearing a chief who asked out of turn, holding the test that is due, or leaving a request unanswered',
    rule: 'A request names a system. ↑ if it is the next unchecked line on the card, ↓ if it is further down. Answer each request before its timer runs out.' },
  rush: 'Let each chief start their test as soon as they said they were ready.',
  captions: { 'out of order': 'two tests collide', 'held the due test': 'chief protests', 'left hanging': 'comm times out' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = 5, ttl = m.calm ? 3 : 2.2;
    m.seq = shuffle(r, SYS).slice(0, n); m.k = 0; m.req = null; m.at = 0.8; m.rounds = n; m.round = 0; m.log = [];
    const ask = () => { const later = m.seq.slice(m.k + 1), early = later.length && r() < 0.5; m.req = { s: early ? later[Math.floor(r() * later.length)] : m.seq[m.k], t: m.t, early }; };
    const answered = () => { m.req = null; m.at = m.t + rf(r, 0.3, 0.6); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code); if (a !== 'U' && a !== 'D') return false; const q = m.req; if (!q) return true;
      if (a === 'U') { if (q.early) { m.fault('out of order'); answered(); return true; } m.log.push(q.s[0]); m.k++; m.round++; answered(); if (m.k >= n) m.win(); return true; }
      if (!q.early) { m.fault('held the due test'); answered(); return true; } m.log.push('held: ' + q.s[0]); answered(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (!m.req && m.t >= m.at) ask(); else if (m.req && m.t - m.req.t > ttl) { m.fault('left hanging'); answered(); } };
    m.hint = () => m.req && m.t - m.req.t > 0.3 ? [[m.req.early ? 'ArrowDown' : 'ArrowUp', true]] : [];
    m.bad = () => m.req ? (m.req.early ? 'ArrowUp' : 'ArrowDown') : null;
    m.view = () => ({ seq: m.seq.map(s => s[0]) });
    m.buttons = () => [['ArrowUp', '▲ Clear to start'], ['ArrowDown', '▼ Hold']];
    m.draw = (c, W, H, P) => {
      txt(c, 'SEQUENCE CARD', 14, 18, { size: 11, col: COL.gold });
      m.seq.forEach((s, i) => { const y = 26 + i * 22, due = i === m.k; box(c, 8, y, 190, 19, due ? 'rgba(240,147,58,.2)' : 'rgba(255,255,255,.04)', due ? COL.orange : null, 6);
        txt(c, `${i + 1}. ${s[0]}`, 14, y + 14, { size: 10, col: i < m.k ? COL.dim : COL.ink }); if (i < m.k) txt(c, '✓', 192, y + 14, { size: 11, col: P.good, align: 'right' }); });
      const q = m.req; box(c, 210, 26, W - 218, 80, 'rgba(255,255,255,.05)', q ? COL.peri : null, 8);
      if (q) { lamp(c, 226, 44, 7, COL.gold, 'diamond'); txt(c, `${q.s[1]} chief:`, 240, 48, { size: 11, col: COL.pale }); txt(c, `"Ready to test`, 222, 70, { size: 11 }); txt(c, `${q.s[0]}?"`, 222, 86, { size: 11 });
        c.fillStyle = COL.warn; c.fillRect(218, 98, (W - 234) * Math.max(0, 1 - (m.t - q.t) / ttl), 4); } else txt(c, 'comm quiet', 222, 70, { size: 11, col: COL.dim });
      m.log.slice(-3).forEach((l, i) => txt(c, l, 214, 124 + i * 13, { size: 9, col: COL.dim }));
    };
    return m;
  },
});
