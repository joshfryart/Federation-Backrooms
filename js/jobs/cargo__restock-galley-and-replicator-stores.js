// Cargo: restock galley and replicator stores. A stores-lift carriage runs along the shelf front. Each carton has a lot expiry day; the shelf is kept
// in lot order, so a good carton goes into the gap between its neighbours (the oldest lot at the front), and an expired carton goes to the reject
// chute at the far left. Hold Left / Right to drive the carriage over the gap, then Space drops the carton there. The carriage has no brakes worth
// mentioning: it moves only while a key is held.
import { define, machine, ARROW, SPACE, ri, rf, txt, box, COL } from './kit.js';

const GAP = (k) => 0.22 + k * 0.14, CHUTE = 0.06;
export default define({
  job: { billet: 'cargo', label: 'Restock galley and replicator stores', type: 'loop' },
  title: 'Lift carriage to the lot gap', dept: 'services', host: 'console', tool: 'Stores lift carriage and shelf rail',
  how: 'Hold Left / Right to drive the lift over the shelf. Drop each carton (Space) in the gap that keeps the lots in expiry order, or in the left chute if it is expired.',
  keys: ['hold Left / Right: drive carriage', 'Space: drop the carton'], limit: 26, maxFaults: 3,
  fingerprint: { verb: 'drive and drop', input: 'arrows-hold+space',
    win: 'four cartons dropped, each into the shelf gap between an older and a newer lot, or into the chute when expired',
    fail: 'dropping a carton over the wrong gap, or an expired carton onto the shelf',
    rule: 'The carriage moves while Left or Right is held. Find where the carton\'s expiry day fits among the shelf lots, stop over that gap and press Space. Expired (before today): the chute at the far left.' },
  rush: 'Slid the new cartons in wherever there was room and sorted the lots out later.',
  captions: { misshelved: 'carton dropped in the wrong place', 'dropped late': 'carton fell off the lift' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, speed = m.calm ? 0.36 : 0.45, tol = m.calm ? 0.045 : 0.035, today = ri(r, 10, 14);
    m.x = 0.57; m.n = 0; m.cartons = []; m.held = { L: false, R: false };
    const mk = () => { const s = new Set(); while (s.size < 5) s.add(ri(r, today + 1, today + 20)); const shelf = [...s].sort((a, b) => a - b); let e; do e = ri(r, today - 3, today + 21); while (shelf.includes(e));
      const dead = e < today; return { shelf, e, dead, gap: dead ? -1 : shelf.filter(v => v < e).length }; };
    for (let i = 0; i < 4; i++) m.cartons.push(mk());
    const cur = () => m.cartons[m.n], tx = () => cur().dead ? CHUTE : GAP(cur().gap);
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'L' || a === 'R') { m.held[a] = down; return true; } if (a) return true;
      if (!SPACE(code)) return false; if (!down) return true;
      if (Math.abs(m.x - tx()) <= tol) { m.n++; if (m.n >= m.cartons.length) m.win(); } else m.fault('misshelved'); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const d = (m.held.R ? 1 : 0) - (m.held.L ? 1 : 0); m.x = Math.max(0, Math.min(1, m.x + d * speed * dt)); };
    m.hint = () => { if (m.state !== 'play') return []; const dx = tx() - m.x; if (Math.abs(dx) < tol * 0.55) return [['ArrowLeft', false], ['ArrowRight', false], ['Space', true]]; return dx > 0 ? [['ArrowLeft', false], ['ArrowRight', true]] : [['ArrowRight', false], ['ArrowLeft', true]]; };
    m.bad = () => 'Space';
    m.view = () => ({ today, c: m.cartons.map(c => [c.e, ...c.shelf]) });
    m.buttons = () => [['ArrowLeft', '◀ drive'], ['ArrowRight', 'drive ▶'], ['Space', 'Drop']];
    m.draw = (c) => {
      const q = m.cartons[Math.min(m.n, m.cartons.length - 1)]; txt(c, `today day ${today}`, 14, 16, { size: 10, col: COL.dim }); txt(c, `carton ${Math.min(m.n + 1, 4)}/4  expiry ${q.e}`, 200, 16, { size: 12, col: COL.gold });
      box(c, 4, 60, 40, 34, '#2a1620', COL.warn, 4); txt(c, 'CHUTE', 24, 80, { size: 9, align: 'center', col: COL.warn });
      q.shelf.forEach((v, i) => { const x = (GAP(i) + 0.07) * 400 - 20, y = 96; box(c, x, y, 40, 30, COL.panel, COL.peri, 4); txt(c, String(v), x + 20, y + 20, { size: 12, align: 'center' }); });
      c.fillStyle = COL.gold; c.fillRect(m.x * 400 - 14, 40, 28, 6); c.fillRect(m.x * 400 - 2, 46, 4, 22); box(c, m.x * 400 - 16, 66, 32, 22, '#3a3220', COL.gold, 3); txt(c, String(q.e), m.x * 400, 82, { size: 11, align: 'center' });
      txt(c, `placed ${m.n}/4`, 14, 156, { size: 10, col: COL.dim });
    };
    return m;
  },
});
