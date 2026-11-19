// Cartographer, cargo run: plot the shortest safe course to the drop point. The course is two legs, ship → turn point → drop point. Move the
// turn point with the arrows; the console shows the clearance at each hazard's closest point and the course length. A leg inside the safety
// margin turns red and cannot be saved. The skill is taking the shortest course that still clears every margin, not the widest berth:
// Space saves the course; a safe course that is longer than it needs to be is sent back as well.
import { define, machine, ARROW, SPACE, ri, rf, txt, lamp, COL } from './kit.js';

function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - ax - t * dx, py - ay - t * dy); }
const XS = Array.from({ length: 13 }, (_, k) => 80 + k * 20), YS = Array.from({ length: 31 }, (_, k) => 10 + k * 5);
export default define({
  job: { billet: 'carto', label: 'Plot the shortest safe course to the drop point', type: 'task:cargo_run' },
  title: 'Shortest course past the margin', dept: 'sciences', host: 'console', tool: 'Lab console course line tool over the hazard map',
  how: 'Move the turn point with the arrows until every hazard clears the safety margin with the shortest total length you can find, then save with Space.',
  keys: ['arrows move turn point', 'Space save course'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'skim the margin', input: 'arrows+space', win: 'a two-leg course saved whose closest approach to every hazard clears the safety margin and whose length is the shortest that does so',
    fail: 'saving a leg that clips a hazard inside the margin, or a safe course that wastes distance with a wide berth',
    rule: 'Arrows move the turn point; read each hazard\'s clearance and the total length. Red means inside the margin. Find the shortest course with no red, then Space.' },
  rush: 'Drew the straight line to the drop point and trusted the margin to be generous.',
  captions: { 'clips hazard': 'proximity alarm', 'long way': 'navigation query: "why the detour?"' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, MARGIN = 10, S = [24, ri(r, 50, 120)], D = [376, ri(r, 50, 120)];
    const at = (t) => [S[0] + (D[0] - S[0]) * t, S[1] + (D[1] - S[1]) * t];
    const h1 = at(rf(r, 0.4, 0.6)), h2 = at(rf(r, 0.2, 0.3)), h3 = at(rf(r, 0.7, 0.8));
    m.hz = [[h1[0], h1[1] + rf(r, -6, 6), rf(r, 14, 20)], [h2[0], h2[1] + (r() < 0.5 ? -1 : 1) * rf(r, 22, 34), rf(r, 8, 12)], [h3[0], h3[1] + (r() < 0.5 ? -1 : 1) * rf(r, 22, 34), rf(r, 8, 12)]].map(h => h.map(v => +v.toFixed(1)));
    const clr = (x, y) => m.hz.map(h => Math.min(segDist(h[0], h[1], ...S, x, y), segDist(h[0], h[1], x, y, ...D)) - h[2]);
    const len = (x, y) => Math.hypot(x - S[0], y - S[1]) + Math.hypot(D[0] - x, D[1] - y);
    const safe = (x, y) => clr(x, y).every(c => c >= MARGIN);
    let best = null; for (const x of XS) for (const y of YS) if (safe(x, y) && (!best || len(x, y) < best[2])) best = [x, y, len(x, y)];
    m.best = best; m.xi = 6; m.yi = YS.reduce((b, y, k) => Math.abs(y - at(0.5)[1]) < Math.abs(YS[b] - at(0.5)[1]) ? k : b, 0);
    const T = () => [XS[m.xi], YS[m.yi]];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), sp = SPACE(code); if (!a && !sp) return false; if (!down) return true;
      if (a === 'L') m.xi = Math.max(0, m.xi - 1); else if (a === 'R') m.xi = Math.min(XS.length - 1, m.xi + 1);
      else if (a === 'U') m.yi = Math.max(0, m.yi - 1); else if (a === 'D') m.yi = Math.min(YS.length - 1, m.yi + 1);
      if (sp) { const [x, y] = T(); if (!safe(x, y)) m.fault('clips hazard'); else if (len(x, y) > best[2] + 0.5) m.fault('long way'); else m.win(); }
      return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const [x, y] = T(); if (x === best[0] && y === best[1]) return [['Space', true]]; if (x !== best[0]) return [[x < best[0] ? 'ArrowRight' : 'ArrowLeft', true]]; return [[y < best[1] ? 'ArrowDown' : 'ArrowUp', true]]; };
    m.bad = () => 'Space';
    m.view = () => ({ hz: m.hz, S, D });
    m.buttons = () => [['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['ArrowUp', '▲'], ['ArrowDown', '▼'], ['Space', 'Save course']];
    m.draw = (c, W, H, P) => {
      const [x, y] = T(), cl = clr(x, y);
      m.hz.forEach((h, k) => { c.beginPath(); c.arc(h[0], h[1], h[2], 0, 6.283); c.fillStyle = 'rgba(255,90,72,.25)'; c.fill();
        c.beginPath(); c.arc(h[0], h[1], h[2] + MARGIN, 0, 6.283); c.setLineDash?.([3, 3]); c.strokeStyle = cl[k] < MARGIN ? P.bad : COL.dim; c.lineWidth = 1; c.stroke(); c.setLineDash?.([]);
        txt(c, `${cl[k] < MARGIN ? '▲ ' : ''}${Math.max(0, cl[k] + MARGIN).toFixed(0)}`, h[0] - 8, h[1] + 4, { size: 10, col: cl[k] < MARGIN ? P.bad : COL.ink }); });
      const ok = safe(x, y); c.strokeStyle = ok ? COL.gold : P.bad; c.lineWidth = ok ? 2 : 3; c.setLineDash?.(ok ? [] : [5, 3]);
      c.beginPath(); c.moveTo(...S); c.lineTo(x, y); c.lineTo(...D); c.stroke(); c.setLineDash?.([]);
      lamp(c, S[0], S[1], 6, COL.peri, 'square'); lamp(c, D[0] - 6, D[1], 6, COL.lav, 'diamond'); lamp(c, x, y, 5, COL.ink, 'circle');
      txt(c, `length ${len(x, y).toFixed(0)} · margin ${MARGIN} · ${ok ? 'CLEAR' : 'INSIDE MARGIN'}`, 14, 162, { size: 11, col: ok ? COL.ink : P.bad });
    };
    return m;
  },
});
