// Sensor officer: locate the target vessel and its lifesign count (medical relief). The filtered return shows one lifesign cluster at a time,
// with square hull-noise specks the filter left behind. Hold ← / → to drag the count cursor across the cluster; the nearest mark under it
// lights. Press Space once on each round lifesign to count it. Counting a point a second time, or counting a square hull speck, is a fault.
// When every lifesign in the cluster is counted, send the cluster figure (Enter); sending short leaves the relief team unprepared.
import { define, machine, ARROW, SPACE, ENTER, ri, shuffle, txt, box, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'sensor', label: 'Locate the target vessel and lifesign count', type: 'task:medical_relief' },
  title: 'Count cursor across lifesign clusters', dept: 'sciences', host: 'console', tool: 'Lifesign array',
  how: 'Hold ← / → to drag the count cursor across the cluster and press Space once on each round lifesign (not the square hull specks), then Enter to send the cluster count.',
  keys: ['← / → hold: drag cursor', 'Space count the lit point', 'Enter send cluster'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'drag count cursor', input: 'arrows-hold+enter+space', win: 'three lifesign clusters counted point by point with the cursor, each person once, no hull specks, and each cluster total sent',
    fail: 'counting the same lifesign twice, counting a hull-noise speck as a person, or sending a cluster total with people left uncounted',
    rule: 'The mark nearest the cursor line lights. Round = lifesign: Space once. Square = hull noise: skip. Counted points turn into ticks. When none are left, Enter sends the figure.' },
  rush: 'Read the cluster brightness off the meter and guessed a headcount.',
  captions: { 'double count': 'count tone repeats', 'hull speck': 'noise click', 'short count': 'relief team queries' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, X0 = 40, sp = m.calm ? 55 : 70, near = 3.2, N = 3;
    m.cl = Array.from({ length: N }, () => { const slots = shuffle(r, Array.from({ length: 24 }, (_, j) => X0 + 10 + j * 13)), np = ri(r, 5, 8), nn = ri(r, 2, 4);
      return { pts: slots.slice(0, np + nn).map((x, j) => ({ x, y: 50 + r() * 70, life: j < np, cnt: false })), deck: ri(r, 2, 9) }; });
    m.i = 0; m.x = X0; m.hd = {}; m.round = 1; m.rounds = N; m.sent = [];
    const C = () => m.cl[m.i], under = () => { let b = null, d = near; for (const p of C().pts) { const e = Math.abs(p.x - m.x); if (e < d) { d = e; b = p; } } return b; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'L' || a === 'R') { m.hd[a] = down; return true; } if (!SPACE(code) && !ENTER(code)) return !!a; if (!down) return true;
      if (SPACE(code)) { const p = under(); if (!p) return true; if (!p.life) m.fault('hull speck'); else if (p.cnt) m.fault('double count'); else p.cnt = true; return true; }
      const left = C().pts.filter(p => p.life && !p.cnt).length; if (left) { m.fault('short count'); return true; }
      m.sent.push(C().pts.filter(p => p.life).length); m.i++; m.x = X0; if (m.i >= N) m.win(); else m.round++; return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.hd.R) m.x += sp * dt; if (m.hd.L) m.x -= sp * dt; m.x = Math.max(X0, Math.min(X0 + 330, m.x)); };
    m.hint = () => {
      if (m.i >= N) return []; const todo = C().pts.filter(p => p.life && !p.cnt); const off = [['ArrowLeft', false], ['ArrowRight', false]];
      if (!todo.length) return [...off, ['Enter', true]]; const t = todo.reduce((a, b) => (Math.abs(b.x - m.x) < Math.abs(a.x - m.x) ? b : a));
      if (Math.abs(t.x - m.x) < 1.6 && under() === t) return [...off, ['Space', true]];
      return t.x > m.x ? [['ArrowLeft', false], ['ArrowRight', true]] : [['ArrowRight', false], ['ArrowLeft', true]];
    };
    m.bad = () => (m.t > 0.5 ? 'Enter' : null);
    m.view = () => ({ c: m.cl.map(c => c.pts.map(p => [p.x, p.life])) });
    m.buttons = () => [['ArrowLeft', '◀ cursor'], ['ArrowRight', 'cursor ▶'], ['Space', 'Count'], ['Enter', 'Send']];
    m.draw = (c, W, H, P) => {
      if (m.i >= N) return; const cl = C(), u = under(); txt(c, `CLUSTER ${m.i + 1} / ${N} · deck ${cl.deck} est.`, 14, 18, { size: 11, col: COL.gold });
      box(c, X0, 34, 340, 100, 'rgba(255,255,255,.04)', COL.dim, 6);
      for (const p of cl.pts) { const lit = p === u; if (p.life) lamp(c, p.x, p.y, lit ? 6 : 4.5, p.cnt ? P.good : lit ? COL.gold : COL.pale, p.cnt ? 'diamond' : 'circle');
        else { c.fillStyle = lit ? COL.warn : 'rgba(185,155,230,.7)'; c.fillRect(p.x - 3, p.y - 3, 6, 6); } }
      c.fillStyle = COL.gold; c.fillRect(m.x - 1, 30, 2, 108);
      const n = cl.pts.filter(p => p.cnt).length; txt(c, `count ${n}`, 14, 152, { size: 13 }); txt(c, m.sent.length ? `sent ${m.sent.join(' · ')}` : '', 120, 152, { size: 10, col: COL.dim });
      txt(c, 'round = person · square = hull noise', 230, 152, { size: 9, col: COL.dim });
    };
    return m;
  },
});
