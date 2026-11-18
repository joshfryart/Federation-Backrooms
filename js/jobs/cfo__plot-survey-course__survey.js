// CFO: plot survey course. Bend the probe pass across the chart: pick a waypoint (1-3) and slide it up or down (↑ / ↓). Every survey target
// must sit inside its sensor arc at closest approach: not too far for the sensors, not so close that the angle is wasted. No leg may cross a
// nebula or debris marker. Enter commits the course; a course that misses a target or crosses a hazard is sent back.
import { define, machine, ENTER, DIG, ARROW, ri, rf, txt, box, lamp, COL } from './kit.js';

const WX = [110, 200, 290], RMIN = 18, RMAX = 38;
function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - ax - t * dx, py - ay - t * dy); }
export default define({
  job: { billet: 'cfo', label: 'Plot survey course', type: 'task:survey' },
  title: 'Survey pass sensor-arc plot', dept: 'flight', host: 'console', tool: 'Chart table with sensor arc templates',
  how: 'Pick a waypoint with 1-3 and slide it with ↑ / ↓ until every target sits inside its sensor arc ring and no leg crosses a hazard, then commit with Enter.',
  keys: ['1-3 pick waypoint', '↑ / ↓ slide it', 'Enter commit'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'bend the pass', input: 'digits+arrows+enter', win: 'one probe pass that brings every survey target between the inner and outer sensor arc and clears all nebula and debris markers',
    fail: 'committing a pass that leaves a target outside its arc ring or that cuts through a hazard',
    rule: 'Each target has an arc ring: the route must pass between its inner and outer circle. Slide the three waypoints vertically; red legs cross hazards. Enter commits.' },
  rush: 'Drew a straight line through the targets and let the probes sort it out.',
  captions: { 'target missed': 'science sends it back', hazard: 'hazard alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; let sol, tg, hz, ys, ye;
    const pts = (w) => [[20, ys], ...WX.map((x, i) => [x, w[i]]), [380, ye]];
    m.dist = (w, t) => { const p = pts(w); let d = 1e9; for (let i = 0; i < 4; i++) d = Math.min(d, segDist(t[0], t[1], ...p[i], ...p[i + 1])); return d; };
    const legBad = (w) => { const p = pts(w), out = []; for (let i = 0; i < 4; i++) out.push(hz.some(h => segDist(h[0], h[1], ...p[i], ...p[i + 1]) < h[2])); return out; };
    m.ok = (w) => tg.every(t => { const d = m.dist(w, t); return d >= RMIN && d <= RMAX; }) && !legBad(w).some(Boolean);
    for (let tries = 0; tries < 50; tries++) {
      ys = ri(r, 4, 12) * 10; ye = ri(r, 4, 12) * 10; sol = WX.map(() => ri(r, 3, 13) * 10);
      tg = WX.map((x, i) => [x + ri(r, -12, 12), sol[i] + (r() < 0.5 ? -1 : 1) * rf(r, 24, 32)]);
      hz = [0, 1].map(k => { const i = ri(r, 0, 2), above = r() < 0.5; return [WX[i] + (k ? 45 : -45), sol[i] + (above ? -1 : 1) * rf(r, 30, 40), rf(r, 9, 13)]; });
      if (m.ok(sol) && tg.every(t => t[1] > 8 && t[1] < 162)) break;
    }
    m.tg = tg; m.hz = hz; m.sol = sol; m.w = sol.map(y => { let v; do v = ri(r, 3, 13) * 10; while (Math.abs(v - y) < 20); return v; }); m.sel = 0; m.legBad = legBad; m.pts = pts;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code), a = ARROW(code);
      if (d >= 1 && d <= 3) { m.sel = d - 1; return true; }
      if (a === 'U' || a === 'D') { m.w[m.sel] = Math.max(20, Math.min(150, m.w[m.sel] + (a === 'U' ? -10 : 10))); return true; }
      if (a) return true;
      if (ENTER(code)) { if (m.ok(m.w)) m.win(); else m.fault(legBad(m.w).some(Boolean) ? 'hazard' : 'target missed'); return true; }
      return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const i = m.w.findIndex((y, k) => y !== sol[k]); if (i < 0 || m.ok(m.w)) return [['Enter', true]]; if (m.sel !== i) return [[`Digit${i + 1}`, true]]; return [[m.w[i] > sol[i] ? 'ArrowUp' : 'ArrowDown', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ tg: tg.map(t => t.map(Math.round)), hz: hz.map(h => h.map(Math.round)) });
    m.buttons = () => [['Digit1', 'WP 1'], ['Digit2', 'WP 2'], ['Digit3', 'WP 3'], ['ArrowUp', '▲'], ['ArrowDown', '▼'], ['Enter', 'Commit']];
    m.draw = (c, W, H, P) => {
      for (const h of hz) { c.beginPath(); c.arc(h[0], h[1], h[2], 0, 6.283); c.fillStyle = 'rgba(255,90,72,.25)'; c.fill(); c.strokeStyle = P.bad; c.lineWidth = 1; c.stroke(); txt(c, '✕', h[0] - 4, h[1] + 4, { size: 10, col: P.bad }); }
      for (const t of tg) { const d = m.dist(m.w, t), ok = d >= RMIN && d <= RMAX; for (const rr of [RMIN, RMAX]) { c.beginPath(); c.arc(t[0], t[1], rr, 0, 6.283); c.strokeStyle = ok ? P.good : COL.dim; c.lineWidth = 1; c.stroke(); } lamp(c, t[0], t[1], 5, ok ? P.good : COL.warn, ok ? 'circle' : 'triangle'); }
      const p = pts(m.w), lb = legBad(m.w); for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(...p[i]); c.lineTo(...p[i + 1]); c.strokeStyle = lb[i] ? P.bad : COL.gold; c.lineWidth = lb[i] ? 3 : 2; c.setLineDash?.(lb[i] ? [4, 3] : []); c.stroke(); } c.setLineDash?.([]);
      WX.forEach((x, i) => { box(c, x - 6, m.w[i] - 6, 12, 12, i === m.sel ? COL.gold : COL.panel, COL.ink, 3); txt(c, i + 1, x - 3, m.w[i] - 9, { size: 10 }); });
    };
    return m;
  },
});
