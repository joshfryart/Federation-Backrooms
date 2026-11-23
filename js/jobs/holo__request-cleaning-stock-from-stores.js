// Holodeck tech: request cleaning stock from stores. Each of three shelves has ten box slots in a row, and some are empty: the shortfall to par is the
// number of empty slots. A scanner beam sweeps along the shelf once, at a steady pace. Press Space as it passes over each EMPTY slot to put a box on the
// request; boxes already on the shelf are not requested and no slot is requested twice. At the end of the sweep the request goes out as it stands.
import { define, machine, SPACE, ri, shuffle, txt, box, COL } from './kit.js';

const N = 10;
export default define({
  job: { billet: 'holo', label: 'Request cleaning stock from stores', type: 'loop' },
  title: 'Beam over the empty slots', dept: 'services', host: 'console', tool: 'Shelf scanner beam and request slip',
  how: 'A beam sweeps each shelf once. Press Space while it is over an empty slot to request a box for it. Skip full slots; each empty slot is requested once.',
  keys: ['Space: request a box for the slot under the beam'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'tap empties', input: 'space',
    win: 'three shelves each swept with a request made for exactly their empty slots as the beam passed over them',
    fail: 'requesting a slot that is full or already requested, or sending a shelf request that misses an empty slot',
    rule: 'The beam crosses ten slots in about three seconds. Space on an empty slot adds one box to the request; Space on a full slot or twice on one slot is a fault; a missed empty slot spoils the request.' },
  rush: 'Ordered a round number of everything and hoped it would cover the month.',
  captions: { 'full slot': 'requested a slot that is full', twice: 'slot requested twice', short: 'request short of the shortfall' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, speed = m.calm ? 2.4 : 3; m.n = 0; m.bt = 0; m.rounds = 3;
    m.shelves = Array.from({ length: 3 }, () => { const e = new Set(shuffle(r, Array.from({ length: N }, (_, i) => i)).slice(0, ri(r, 2, 5))); return { empty: Array.from({ length: N }, (_, i) => e.has(i)), req: Array(N).fill(false) }; });
    m.slot = () => Math.min(N - 1, Math.floor(m.bt * speed));
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; if (!SPACE(code)) return false; if (!down) return true; const s = m.shelves[m.n], i = m.slot();
      if (!s.empty[i]) m.fault('full slot'); else if (s.req[i]) m.fault('twice'); else s.req[i] = true; return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.bt += dt; if (m.bt * speed < N + 0.4) return; const s = m.shelves[m.n];
      if (s.empty.some((e, i) => e && !s.req[i])) m.fault('short'); m.bt = 0; m.n++; m.round = m.n; if (m.n >= 3 && m.state === 'play') m.win();
    };
    m.hint = () => { if (m.state !== 'play' || m.n >= 3) return []; const s = m.shelves[m.n], i = m.slot(), c = (m.bt * speed) - i; return s.empty[i] && !s.req[i] && c > 0.25 && c < 0.75 ? [['Space', true]] : []; };
    m.bad = () => 'Space';
    m.view = () => ({ s: m.shelves.map(s => s.empty.map(e => (e ? 1 : 0)).join('')) });
    m.buttons = () => [['Space', 'Request']];
    m.draw = (c, W, H, P) => {
      m.shelves.forEach((s, k) => { const y = 14 + k * 50, on = k === m.n; txt(c, `shelf ${k + 1}`, 8, y + 26, { size: 9, col: on ? COL.gold : COL.dim });
        for (let i = 0; i < N; i++) { const x = 52 + i * 33; box(c, x, y + 8, 30, 30, s.empty[i] ? '#14101e' : '#33407a', on ? COL.dim : null, 3); if (s.req[i]) txt(c, '+', x + 15, y + 29, { size: 16, align: 'center', col: P.good }); else if (!s.empty[i]) txt(c, '▣', x + 15, y + 28, { size: 14, align: 'center', col: COL.peri }); } });
      if (m.n < 3) { const x = 52 + m.bt * speed * 33; c.fillStyle = 'rgba(244,194,91,.55)'; c.fillRect(Math.min(x, 52 + N * 33), 14 + m.n * 50 + 2, 3, 42); }
    };
    return m;
  },
});
