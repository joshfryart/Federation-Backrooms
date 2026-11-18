// CFO: clear the approach with nav. Returns are scattered across the approach; some are real obstacles, some are stale echoes of debris long
// gone. Steer the sensor cone (hold ← / →) and rest it on each return until the sweep says REAL or STALE. Only when every return is resolved,
// draw the corridor (1-4) through the lane that holds no real obstacle. Stale returns in a lane do not block it.
import { define, machine, ARROW, DIG, ri, rf, shuffle, clamp, txt, lamp, COL } from './kit.js';

const LANES = [[-60, -30], [-30, 0], [0, 30], [30, 60]];
export default define({
  job: { billet: 'cfo', label: 'Clear the approach with nav', type: 'task:medical_relief' },
  title: 'Sensor cone sweep before the corridor', dept: 'flight', host: 'console', tool: 'Nav station sensor sweep and chart overlay',
  how: 'Hold ← / → to swing the sensor cone and rest it on each return until it reads REAL or STALE. Then press the lane (1-4) with no real obstacle to draw the corridor.',
  keys: ['← / → hold: swing the cone', '1-4 draw the corridor'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'sweep then corridor', input: 'arrows-hold+digits', win: 'every return on the approach resolved as real or stale under the cone, then the corridor drawn through the one lane free of real obstacles',
    fail: 'drawing the corridor before every return is resolved, or through a lane holding a real obstacle',
    rule: 'Swing the cone with held arrows; a return under the cone for a moment resolves. Stale echoes do not block a lane. When none is left unresolved, press the clear lane number.' },
  rush: 'Drew the corridor down the middle and told the helm to watch for rocks.',
  captions: { unswept: 'nav objects: not swept', blocked: 'collision warning' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, half = m.calm ? 10 : 7, dwell = m.calm ? 0.45 : 0.6;
    m.clear = ri(r, 0, 3); m.blips = [];
    LANES.forEach(([a, b], i) => { const real = i === m.clear ? 0 : 1, stale = i === m.clear ? ri(r, 1, 2) : ri(r, 0, 1); for (let k = 0; k < real + stale; k++) m.blips.push({ brg: rf(r, a + 4, b - 4), rng: rf(r, 0.35, 0.9), real: k < real, seen: 0, res: false }); });
    m.blips = shuffle(r, m.blips); m.cone = rf(r, -50, 50); m.lane = null;
    const inCone = (b) => Math.abs(b.brg - m.cone) <= half;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), d = DIG(code);
      if (a === 'L' || a === 'R') { m.held[a] = down; return true; } if (a) return true;
      if (d >= 1 && d <= 4 && down) {
        if (m.blips.some(b => !b.res)) { m.fault('unswept'); return true; }
        if (m.blips.some(b => b.real && b.brg >= LANES[d - 1][0] && b.brg < LANES[d - 1][1])) { m.fault('blocked'); return true; }
        m.lane = d - 1; m.win(); return true;
      }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const v = (m.held.R ? 55 : 0) - (m.held.L ? 55 : 0); m.cone = clamp(m.cone + v * dt, -60, 60);
      for (const b of m.blips) if (!b.res) { if (inCone(b) && !v) { b.seen += dt; if (b.seen >= dwell) b.res = true; } else b.seen = 0; }
    };
    m.hint = () => {
      const open = m.blips.filter(b => !b.res); if (!open.length) return [['ArrowLeft', false], ['ArrowRight', false], [`Digit${m.clear + 1}`, true]];
      const b = open.reduce((p, q) => Math.abs(q.brg - m.cone) < Math.abs(p.brg - m.cone) ? q : p), e = b.brg - m.cone;
      if (Math.abs(e) <= half * 0.5) return [['ArrowLeft', false], ['ArrowRight', false]];
      return e > 0 ? [['ArrowLeft', false], ['ArrowRight', true]] : [['ArrowRight', false], ['ArrowLeft', true]];
    };
    m.bad = () => `Digit${((m.clear + 1) % 4) + 1}`;
    m.view = () => ({ b: m.blips.map(b => [Math.round(b.brg), b.real]), c: m.clear });
    m.buttons = () => [['ArrowLeft', '◀ cone'], ['ArrowRight', 'cone ▶'], ['Digit1', 'Lane 1'], ['Digit2', 'Lane 2'], ['Digit3', 'Lane 3'], ['Digit4', 'Lane 4']];
    m.draw = (c, W, H, P) => {
      const cx = 200, cy = 160, R = 140, xy = (brg, rr) => { const a = (brg - 90) * Math.PI / 180; return [cx + Math.cos(a) * rr * R, cy + Math.sin(a) * rr * R]; };
      LANES.forEach(([a], i) => { const [x, y] = xy(a, 1); c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 1; c.beginPath(); c.moveTo(cx, cy); c.lineTo(x, y); c.stroke(); const [lx, ly] = xy(a + 15, 1.04); txt(c, i + 1, lx - 3, ly + 4, { size: 11, col: m.lane === i ? P.good : COL.dim }); });
      c.fillStyle = 'rgba(125,151,232,.22)'; c.beginPath(); c.moveTo(cx, cy); const a0 = (m.cone - half - 90) * Math.PI / 180, a1 = (m.cone + half - 90) * Math.PI / 180; c.arc(cx, cy, R, a0, a1); c.closePath(); c.fill();
      for (const b of m.blips) { const [x, y] = xy(b.brg, b.rng); if (!b.res) { lamp(c, x, y, 6, COL.warn, 'diamond'); txt(c, '?', x + 8, y + 4, { size: 10, col: COL.warn }); } else if (b.real) { lamp(c, x, y, 6, P.bad, 'triangle'); txt(c, 'REAL', x + 8, y + 4, { size: 9, col: P.bad }); } else { lamp(c, x, y, 5, COL.dim, 'circle'); txt(c, 'stale', x + 8, y + 4, { size: 9, col: COL.dim }); } }
      txt(c, `unresolved ${m.blips.filter(b => !b.res).length}`, 10, 16, { size: 11, col: COL.pale });
    };
    return m;
  },
});
