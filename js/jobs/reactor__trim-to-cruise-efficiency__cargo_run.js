// Reactor specialist: trim to cruise efficiency. Hold the trim down and watch the fuel-draw trace draw itself as output falls: it drops, then
// flattens, then climbs again once the core runs too lean. Ease off at the bottom of the trough, or at the demand line if the trough sits
// below demand, and commit the cruise point (Space). Sliding the output under demand starves the cargo run; committing up the curve wastes fuel.
import { define, machine, ARROW, SPACE, rf, clamp, txt, COL } from './kit.js';

export default define({
  job: { billet: 'reactor', label: 'Trim to cruise efficiency', type: 'task:cargo_run' },
  title: 'Cruise curve trough trim', dept: 'engineering', host: 'console', tool: 'Cruise curve',
  how: 'Hold Left to lower the output trim (Right raises it) and watch the fuel trace. Stop where fuel draw is lowest without going under the demand line, then press Space to set cruise.',
  keys: ['Left hold lower trim', 'Right hold raise trim', 'Space set cruise'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'sweep to trough', input: 'arrows-hold+space', win: 'cruise point set at the bottom of the traced fuel-draw trough, or at the demand line when the trough lies below it, on two legs',
    fail: 'sliding the output under the demand line, or setting cruise up the side of the curve',
    rule: 'Holding an arrow sweeps the output and paints fuel draw on the curve. The lowest painted point above the demand line is the cruise point; release there and press Space. Crossing the demand line is an instant starve.' },
  rush: 'Wound the trim down to the cruise figure in the manual and did not look at the fuel readout.',
  captions: { starved: 'grid sag tone', 'wasted fuel': 'fuel flow ticker' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, rate = m.calm ? 0.1 : 0.13, tol = m.calm ? 0.045 : 0.035;
    const leg = () => { const xs = rf(r, 0.3, 0.6), below = r() < 0.4, d = below ? xs + rf(r, 0.07, 0.15) : xs - rf(r, 0.1, 0.2); return { xs, d, opt: Math.max(xs, d), k: rf(r, 90, 140) }; };
    m.legs = [leg(), leg()]; m.round = 1; m.rounds = 2; m.x = 0.92; m.trail = [];
    const L = () => m.legs[m.round - 1];
    m.fuel = (x) => 18 + L().k * (x - L().xs) ** 2;
    m.key = (code, down = true) => {
      const a = ARROW(code); if (m.state !== 'play') return false;
      if (a === 'L' || a === 'R') { m.held[a] = down; return true; }
      if (!SPACE(code)) return false; if (!down) return true;
      if (Math.abs(m.x - L().opt) > tol) { m.fault('wasted fuel'); return true; }
      m.ev('cruise', { x: +m.x.toFixed(3) }); if (m.round >= 2) { m.win(); return true; } m.round++; m.x = 0.92; m.trail = []; m.held = {}; return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const v = (m.held.R ? rate : 0) - (m.held.L ? rate : 0); if (!v) return;
      m.x = clamp(m.x + v * dt, 0.05, 0.95); m.trail.push([m.x, m.fuel(m.x)]); if (m.trail.length > 400) m.trail.shift();
      if (m.x < L().d) { m.fault('starved'); m.x = L().d + 0.08; m.held = {}; }
    };
    m.hint = () => { const o = L().opt; if (m.x > o + 0.006) return [['ArrowLeft', true]]; if (m.held.L) return [['ArrowLeft', false]]; if (m.x < o - tol * 0.5) return [['ArrowRight', true]]; if (m.held.R) return [['ArrowRight', false]]; return [['Space', true]]; };
    m.bad = () => ['ArrowLeft', true];
    m.view = () => ({ legs: m.legs.map(l => [+l.xs.toFixed(3), +l.d.toFixed(3)]) });
    m.buttons = () => [['ArrowLeft', 'Trim down'], ['ArrowRight', 'Trim up'], ['Space', 'Set cruise']];
    m.draw = (c, W, H, P) => {
      const gx = 20, gy = 16, gw = 260, gh = 130, X = (x) => gx + x * gw, Y = (f) => gy + gh - clamp((f - 10) / 70) * gh;
      c.strokeStyle = 'rgba(255,255,255,.2)'; c.lineWidth = 1; c.strokeRect(gx, gy, gw, gh);
      c.fillStyle = 'rgba(255,179,71,.12)'; c.fillRect(gx, gy, X(L().d) - gx, gh); c.fillStyle = P.bad; c.fillRect(X(L().d) - 1, gy, 3, gh);
      txt(c, 'DEMAND', X(L().d) + 4, gy + 12, { size: 9, col: P.bad });
      c.fillStyle = COL.gold; for (const [x, f] of m.trail) c.fillRect(X(x) - 1, Y(f) - 1, 3, 3);
      c.fillStyle = '#fff'; c.beginPath(); c.arc(X(m.x), Y(m.fuel(m.x)), 5, 0, 6.283); c.fill();
      txt(c, 'output →', gx + gw - 48, gy + gh + 14, { size: 9, col: COL.dim });
      txt(c, `leg ${m.round} / 2`, 296, 30, { size: 12, col: COL.gold }); txt(c, 'FUEL DRAW', 296, 58, { size: 10, col: COL.dim });
      txt(c, `${m.fuel(m.x).toFixed(1)}`, 296, 84, { size: 22, col: COL.ink }); txt(c, `output ${Math.round(m.x * 100)} %`, 296, 108, { size: 11, col: COL.pale });
      txt(c, m.held.L ? '◀ lowering' : m.held.R ? 'raising ▶' : '■ holding', 296, 128, { size: 11, col: COL.peri });
    };
    return m;
  },
});
