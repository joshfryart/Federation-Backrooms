// Cartographer, medical relief: update the plot as the target drifts. The stricken ship keeps drifting; your intercept line ends where it
// was at the last update, and the drift error bar grows as it moves away. Press Space to redraw the intercept to its present position.
// But a redraw is checked against the hazards: while the target sits behind a hazard (the dashed preview turns red) a redraw would route
// through it. Keep the line fresh, time the redraws around the hazard shadows, and hold the intercept until the burn.
import { define, machine, SPACE, ri, rf, txt, bar, lamp, COL } from './kit.js';

function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - ax - t * dx, py - ay - t * dy); }
export default define({
  job: { billet: 'carto', label: 'Update the plot as the target drifts', type: 'task:medical_relief' },
  title: 'Drifting intercept re-plot', dept: 'sciences', host: 'console', tool: 'Nav screen intercept line and drift error bar',
  how: 'Press Space to redraw the intercept to the drifting target before the drift error bar fills, but never while the preview line crosses a hazard.',
  keys: ['Space redraw intercept'], limit: 26, maxFaults: 3,
  fingerprint: { verb: 're-plot ahead', input: 'space', win: 'the intercept kept within the drift error limit from start to burn with every redraw on a hazard-free line',
    fail: 'letting the drift error outgrow the limit so the stale line misses, or redrawing while the line would pass through a hazard',
    rule: 'The error bar grows as the target drifts from your line\'s end. Space redraws to the target, but only when the dashed preview is clear of hazards. Hold it until the burn.' },
  rush: 'Plotted the intercept once at the last fix and let the burn sort out the rest.',
  captions: { 'stale intercept': 'intercept-lost tone', 'through hazard': 'hazard alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, S = [24, 85], LIM = m.calm ? 44 : 34, burn = Math.round(m.limit * 0.62 * 10) / 10;
    const shadow = (hz, p) => hz.some(h => segDist(h[0], h[1], ...S, ...p) < h[2] + 2);
    // lay out the drift and hazards, then check by simulation that a careful plotter can keep the line fresh and an idle one cannot
    for (let tries = 0; tries < 40; tries++) {
      const cy = ri(r, 70, 100), A = rf(r, 40, 50), w = rf(r, 0.48, 0.56) * (m.calm ? 0.8 : 1), ph = rf(r, 0, 6.28), x0 = ri(r, 330, 360), vx = rf(r, -4, -2);
      m.pos = (t) => [x0 + vx * t, cy + A * Math.sin(ph + w * t)];
      m.hz = [0, 1].map(k => { const t = rf(r, 2, 6) + k * rf(r, 5, 8), p = m.pos(t), f = rf(r, 0.68, 0.78); return [+(S[0] + (p[0] - S[0]) * f).toFixed(1), +(S[1] + (p[1] - S[1]) * f).toFixed(1), ri(r, 5, 7)]; });
      let aim = m.pos(0), worst = 0, idleF = 0, ia = aim; for (let t = 0; t < burn; t += 1 / 30) { const p = m.pos(t);
        if (!shadow(m.hz, p) && Math.hypot(p[0] - aim[0], p[1] - aim[1]) > 3) aim = p; worst = Math.max(worst, Math.hypot(p[0] - aim[0], p[1] - aim[1]));
        if (Math.hypot(p[0] - ia[0], p[1] - ia[1]) > LIM) { idleF++; ia = p; } }
      if (worst < LIM * 0.8 && idleF >= 3) break;
    }
    m.aim = m.pos(0); m.burn = burn;
    const tp = () => m.pos(m.t), err = () => Math.hypot(tp()[0] - m.aim[0], tp()[1] - m.aim[1]);
    m.blocked = () => shadow(m.hz, tp());
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !SPACE(code)) return false; if (!down) return true;
      if (m.blocked()) m.fault('through hazard'); else m.aim = tp(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (err() > LIM) { m.fault('stale intercept'); m.aim = tp(); } if (m.state === 'play' && m.t >= burn) m.win(); };
    m.hint = () => !m.blocked() && err() > 3 ? [['Space', true]] : [];
    m.bad = () => m.blocked() ? 'Space' : null;
    m.view = () => ({ hz: m.hz, p0: m.pos(0).map(Math.round) });
    m.buttons = () => [['Space', 'Redraw intercept']];
    m.draw = (c, W, H, P) => {
      for (const h of m.hz) { c.beginPath(); c.arc(h[0], h[1], h[2], 0, 6.283); c.fillStyle = 'rgba(255,90,72,.35)'; c.fill(); txt(c, '✕', h[0] - 4, h[1] + 4, { size: 9, col: P.bad }); }
      const p = tp(), bl = m.blocked();
      c.strokeStyle = bl ? P.bad : 'rgba(168,166,185,.6)'; c.lineWidth = 1; c.setLineDash?.([4, 4]); c.beginPath(); c.moveTo(...S); c.lineTo(...p); c.stroke(); c.setLineDash?.([]);
      c.strokeStyle = COL.gold; c.lineWidth = 2; c.beginPath(); c.moveTo(...S); c.lineTo(...m.aim); c.stroke(); lamp(c, m.aim[0], m.aim[1], 4, COL.gold, 'circle');
      lamp(c, S[0], S[1], 6, COL.peri, 'square'); lamp(c, p[0], p[1], 7, COL.pale, 'diamond');
      const e = err() / LIM; txt(c, 'DRIFT ERROR', 14, 14, { size: 10, col: COL.dim }); bar(c, 90, 6, 150, 10, e, { col: e > 0.7 ? P.bad : COL.gold, mark: 1 });
      txt(c, bl ? '▲ preview crosses a hazard' : 'preview clear', 250, 15, { size: 10, col: bl ? P.bad : P.good });
      txt(c, `burn in ${Math.max(0, burn - m.t).toFixed(1)} s`, 14, 162, { size: 11 });
    };
    return m;
  },
});
