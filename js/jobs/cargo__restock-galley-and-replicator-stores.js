// Cargo: restock galley and replicator stores. Cartons come off the bay rack one at a time with a lot expiry day. Today is on the wall.
// Expired cartons go aside (Left); a carton older than the one at the shelf front goes in front of it (Up); a newer one goes behind (Down).
import { define, machine, ARROW, ri, shuffle, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'cargo', label: 'Restock galley and replicator stores', type: 'loop' },
  title: 'Oldest lot to the front', dept: 'services', host: 'console', tool: 'Carton lot labels and stores shelf',
  how: 'Read each carton\'s expiry day. Expired: Left, set aside. Older than the shelf front: Up, shelve in front. Newer: Down, shelve behind.',
  keys: ['Left set aside', 'Up shelve in front', 'Down shelve behind'], limit: 26, maxFaults: 3,
  fingerprint: { verb: 'oldest to front', input: 'arrows',
    win: 'all cartons handled: expired stock set aside and every good carton shelved with the oldest lot at the front',
    fail: 'shelving an expired carton, setting aside good stock, or putting a newer lot in front of an older one',
    rule: 'Each carton shows its expiry day; today is on the wall. Expired goes Left. A good carton older than the shelf front goes Up (to the front); a newer one goes Down (behind).' },
  rush: 'Slid the new cartons in at the front without reading the dates.',
  captions: { expired: 'expired stock alarm', waste: 'good stock binned', order: 'shelf out of order' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = m.calm ? 6 : 7;
    m.today = ri(r, 20, 60); m.q = shuffle(r, Array.from({ length: 14 }, (_, k) => m.today - 4 + k * 1)).slice(0, n).map(d => ({ d, item: ['soup', 'rice', 'tea', 'beans', 'flour', 'oil', 'salt'][ri(r, 0, 6)] }));
    if (!m.q.some(c => c.d < m.today)) m.q[0].d = m.today - 2; m.front = null; m.shelf = 0; m.aside = 0; m.rounds = n; m.round = 0;
    const want = (c) => c.d < m.today ? 'L' : m.front === null || c.d < m.front ? 'U' : 'D';
    m.key = (code, down = true) => {
      const a = ARROW(code), c = m.q[0]; if (m.state !== 'play' || !down || !c || !'LUD'.includes(a || '-')) return false;
      if (a === 'L') { if (c.d >= m.today) m.fault('waste'); else m.aside++; } else if (c.d < m.today) m.fault('expired'); else if (a !== want(c)) m.fault('order'); else { m.shelf++; if (a === 'U') m.front = c.d; else if (m.front === null) m.front = c.d; }
      m.q.shift(); m.round = n - m.q.length; if (!m.q.length) m.win(); return true;
    };
    m.hint = () => m.q[0] ? [[{ L: 'ArrowLeft', U: 'ArrowUp', D: 'ArrowDown' }[want(m.q[0])], true]] : [];
    m.bad = () => m.q[0] ? (want(m.q[0]) === 'L' ? 'ArrowUp' : 'ArrowLeft') : null;
    m.view = () => ({ today: m.today, cartons: m.q.map(c => [c.item, c.d]) });
    m.buttons = () => [['ArrowLeft', '< aside'], ['ArrowUp', 'front'], ['ArrowDown', 'behind']];
    m.draw = (c, W, H, P) => {
      txt(c, `TODAY  DAY ${m.today}`, 12, 18, { size: 12, col: COL.peri }); txt(c, `SHELF FRONT  ${m.front === null ? 'empty' : 'exp ' + m.front}`, W - 12, 18, { size: 12, col: COL.gold, align: 'right' });
      m.q.slice(0, 4).forEach((k, i) => { const x = 20 + i * 90; box(c, x, 40 + (i ? 14 : 0), 80, i ? 46 : 60, i ? 'rgba(255,255,255,.05)' : 'rgba(244,194,91,.18)', i ? null : COL.gold, 6);
        txt(c, k.item, x + 8, 62 + (i ? 14 : 0), { size: 11 }); txt(c, 'exp ' + k.d, x + 8, 84 + (i ? 14 : 0), { size: i ? 11 : 15, col: k.d < m.today && !i ? P.bad : COL.ink }); });
      txt(c, `shelved ${m.shelf}   set aside ${m.aside}`, 12, H - 12, { size: 11, col: COL.pale });
    };
    return m;
  },
});
