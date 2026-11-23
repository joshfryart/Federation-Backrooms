// Damage control: pre-stage patch kits near the lab. The carry case is a carousel: six foam slots round a ring, five cut for one kit and size each and
// one marked REJECT. The loading arm is at the top of the ring. Left / Right turn the ring one slot; Space loads the item in your hand into the slot
// under the arm. An item must go in the slot cut for its kind and size, and a sealant tube past its expiry stamp goes in REJECT, never in a kit slot.
import { define, machine, ARROW, SPACE, ri, shuffle, txt, box, COL } from './kit.js';

const KITS = ['patch S', 'patch L', 'sealant S', 'sealant L', 'clamp M'];
export default define({
  job: { billet: 'dc', label: 'Pre-stage patch kits near the lab', type: 'task:survey' },
  title: 'Turn the case carousel to the slot', dept: 'engineering', host: 'console', tool: 'Patch kit carousel case',
  how: 'Left / Right turn the ring one slot at a time; Space loads the item in your hand into the slot under the arm. Match kind and size; the expired tube goes in REJECT.',
  keys: ['Left / Right: turn the ring', 'Space: load under the arm'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'turn and load', input: 'arrows+space',
    win: 'six items each loaded by turning the carousel ring the short way to the slot cut for it, with the expired tube turned to REJECT',
    fail: 'loading an item into a slot not cut for it, or an expired sealant tube into a kit slot',
    rule: 'The arm is fixed at the top. Turn the ring so the slot cut for the item in hand is under it, then Space. The tube with a past EXP stamp belongs in the REJECT slot.' },
  rush: 'Tipped the shelf into the case and shut the lid.',
  captions: { 'wrong slot': 'item forced into the wrong slot', 'expired tube': 'expired tube packed' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, lock = m.calm ? 0.2 : 0.12; m.ring = shuffle(r, [...KITS, 'REJECT']); m.top = ri(r, 0, 5); m.lk = 0; m.loaded = new Set();
    const exp = ri(r, 0, 1) ? 'sealant S' : 'sealant L'; m.items = shuffle(r, [...KITS.map(k => ({ k, dead: false })), { k: exp, dead: true }]); m.n = 0;
    const want = () => { const it = m.items[m.n]; return it.dead ? m.ring.indexOf('REJECT') : m.ring.indexOf(it.k); };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'L' || a === 'R') { if (down && m.lk <= 0) { m.top = (m.top + (a === 'R' ? 1 : 5)) % 6; m.lk = lock; } return true; } if (a) return true; if (!SPACE(code)) return false; if (!down) return true; if (m.lk > 0) return true;
      const it = m.items[m.n], slot = m.ring[m.top];
      if (it.dead && slot !== 'REJECT') { m.fault('expired tube'); return true; } if (!it.dead && (slot !== it.k || m.loaded.has(m.top))) { m.fault('wrong slot'); return true; } if (it.dead && slot === 'REJECT' && m.loaded.has(m.top)) { m.fault('wrong slot'); return true; }
      m.loaded.add(m.top); m.n++; if (m.n >= m.items.length) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.lk > 0) m.lk -= dt; };
    m.hint = () => { if (m.state !== 'play') return []; const w = want(); if (w === m.top) return [['Space', true]]; const d = (w - m.top + 6) % 6; return [[d <= 3 ? 'ArrowRight' : 'ArrowLeft', true]]; };
    m.bad = () => 'Space';
    m.view = () => ({ ring: m.ring, top: m.top, items: m.items.map(i => i.k + (i.dead ? '!' : '')) });
    m.buttons = () => [['ArrowLeft', '◀ turn'], ['ArrowRight', 'turn ▶'], ['Space', 'Load']];
    m.draw = (c, W, H, P) => {
      const cx = 130, cy = 88; for (let i = 0; i < 6; i++) { const k = (i - m.top + 6) % 6, ang = -1.5708 + k * 1.0472, x = cx + Math.cos(ang) * 62, y = cy + Math.sin(ang) * 62; box(c, x - 30, y - 12, 60, 24, m.loaded.has(i) ? '#25402f' : m.ring[i] === 'REJECT' ? '#3a2020' : COL.panel, k === 0 ? COL.gold : COL.dim, 4); txt(c, m.loaded.has(i) ? '✓' : m.ring[i], x, y + 4, { size: 9, align: 'center', col: m.ring[i] === 'REJECT' ? P.bad : COL.ink }); }
      txt(c, '▼ arm', cx, 14, { size: 9, align: 'center', col: COL.gold }); const it = m.items[Math.min(m.n, 5)];
      box(c, 250, 40, 130, 70, '#201c10', it.dead ? P.bad : COL.pale, 6); txt(c, 'IN HAND', 315, 56, { size: 9, align: 'center', col: COL.dim }); txt(c, it.k, 315, 82, { size: 14, align: 'center' }); if (/sealant/.test(it.k)) txt(c, it.dead ? 'EXP past' : 'EXP ok', 315, 100, { size: 10, align: 'center', col: it.dead ? P.bad : P.good });
      txt(c, `loaded ${m.n}/6`, 250, 150, { size: 10, col: COL.dim });
    };
    return m;
  },
});
