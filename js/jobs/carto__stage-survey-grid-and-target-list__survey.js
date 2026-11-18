// Cartographer, survey: stage the survey grid and target list. The grid is laid over the sector; nudge its origin with the arrows until no
// target sits on a cell line (a target on an edge is split between two sweep cells and gets half the dwell). Rank the targets by pressing
// their numbers from highest science value to lowest. Space freezes the staged grid and list for the sweep.
import { define, machine, ARROW, DIG, SPACE, ri, shuffle, txt, box, lamp, COL } from './kit.js';

const X0 = 16, Y0 = 14, GW = 270, GH = 145, CELL = 40, STEP = 5;
export default define({
  job: { billet: 'carto', label: 'Stage survey grid and target list', type: 'task:survey' },
  title: 'Survey grid origin and priority stage', dept: 'sciences', host: 'console', tool: 'Lab console grid layout and candidate pool',
  how: 'Nudge the grid origin with the arrows until no target sits on a cell line, press the target numbers from highest to lowest science value, then Space to freeze.',
  keys: ['arrows nudge grid origin', '1-5 rank targets', 'Space freeze'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'shift and rank', input: 'arrows+digits+space', win: 'grid origin shifted so every target sits clear inside a cell, and the target list ranked by science value before it is frozen',
    fail: 'freezing with a target on a cell line or an unranked list, or ranking a lower-value target ahead of a higher one',
    rule: 'Arrows slide the whole grid by one notch; targets touching a cell line show a triangle. Press target numbers in falling value order. Space freezes the stage.' },
  rush: 'Froze the default grid and the pool in the order it came in.',
  captions: { 'edge target': 'coverage warning', misranked: 'priority query', unranked: 'freeze refused' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = 5, tol = 5;
    const sx = ri(r, 0, 7) * STEP, sy = ri(r, 0, 7) * STEP, vals = shuffle(r, [12, 19, 27, 34, 41, 48, 56, 63]).slice(0, n);
    const cells = shuffle(r, Array.from({ length: 18 }, (_, k) => [k % 6, Math.floor(k / 6)])).slice(0, n);
    m.tg = cells.map(([cx, cy], i) => ({ x: X0 + sx + cx * CELL + ri(r, 11, 29), y: Y0 + sy + cy * CELL + ri(r, 11, 29), v: vals[i], rank: 0 }));
    const edges = (ox, oy) => m.tg.map(t => { const ex = ((t.x - X0 - ox) % CELL + CELL) % CELL, ey = ((t.y - Y0 - oy) % CELL + CELL) % CELL; return Math.min(ex, CELL - ex) <= tol || Math.min(ey, CELL - ey) <= tol; });
    do { m.ox = ri(r, 0, 7) * STEP; m.oy = ri(r, 0, 7) * STEP; } while (!edges(m.ox, m.oy).some(Boolean));
    m.sol = [sx, sy]; m.order = m.tg.map((t, i) => i).sort((a, b) => m.tg[b].v - m.tg[a].v); m.ranked = 0;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), d = DIG(code), sp = SPACE(code); if (!a && !d && !sp) return false; if (!down) return true;
      if (a) { const dx = a === 'L' ? -STEP : a === 'R' ? STEP : 0, dy = a === 'U' ? -STEP : a === 'D' ? STEP : 0; m.ox = Math.max(0, Math.min(35, m.ox + dx)); m.oy = Math.max(0, Math.min(35, m.oy + dy)); return true; }
      if (d >= 1 && d <= n) { const t = m.tg[d - 1]; if (t.rank) return true; if (m.order[m.ranked] !== d - 1) { m.fault('misranked'); return true; } t.rank = ++m.ranked; return true; }
      if (sp) { if (edges(m.ox, m.oy).some(Boolean)) m.fault('edge target'); else if (m.ranked < n) m.fault('unranked'); else m.win(); }
      return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { if (m.ranked < n) return [[`Digit${m.order[m.ranked] + 1}`, true]];
      if (!edges(m.ox, m.oy).some(Boolean)) return [['Space', true]];
      if (m.ox !== sx) return [[m.ox < sx ? 'ArrowRight' : 'ArrowLeft', true]]; return [[m.oy < sy ? 'ArrowDown' : 'ArrowUp', true]]; };
    m.bad = () => 'Space';
    m.view = () => ({ tg: m.tg.map(t => [t.x, t.y, t.v]), o: [m.ox, m.oy] });
    m.buttons = () => [['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['ArrowUp', '▲'], ['ArrowDown', '▼'], ...m.tg.map((t, i) => [`Digit${i + 1}`, `T${i + 1}`]), ['Space', 'Freeze']];
    m.draw = (c, W, H, P) => {
      box(c, X0, Y0, GW, GH, 'rgba(125,151,232,.06)', COL.dim, 2);
      c.strokeStyle = 'rgba(244,194,91,.55)'; c.lineWidth = 1;
      for (let x = X0 + m.ox; x <= X0 + GW; x += CELL) { c.beginPath(); c.moveTo(x, Y0); c.lineTo(x, Y0 + GH); c.stroke(); }
      for (let y = Y0 + m.oy; y <= Y0 + GH; y += CELL) { c.beginPath(); c.moveTo(X0, y); c.lineTo(X0 + GW, y); c.stroke(); }
      const e = edges(m.ox, m.oy);
      m.tg.forEach((t, i) => { lamp(c, t.x, t.y, 6, e[i] ? P.bad : P.good, e[i] ? 'triangle' : 'circle'); txt(c, i + 1, t.x + 8, t.y - 5, { size: 10 }); });
      txt(c, 'CANDIDATE POOL', 300, 22, { size: 9, col: COL.dim });
      m.tg.forEach((t, i) => { const y = 40 + i * 20; box(c, 298, y - 13, 94, 17, t.rank ? COL.panel : null, t.rank ? COL.gold : COL.dim, 3);
        txt(c, `T${i + 1}  value ${t.v}`, 303, y, { size: 10 }); if (t.rank) txt(c, `#${t.rank}`, 370, y, { size: 10, col: COL.gold }); });
      txt(c, `edges ${e.filter(Boolean).length} · ranked ${m.ranked}/${n}`, 300, 160, { size: 10, col: COL.dim });
    };
    return m;
  },
});
