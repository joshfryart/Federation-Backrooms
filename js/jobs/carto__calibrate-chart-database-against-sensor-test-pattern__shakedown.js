// Cartographer, shakedown: calibrate the chart database against the sensor test pattern. Two dials correct the database: the offset (← / →)
// shifts every test star equally, the scale (↑ / ↓) moves outer stars more than inner ones. Each star's residual bar shows how far it sits
// from its known position. Chasing one star (zeroing the offset on a single outer star) drags the others out of band: fit the whole
// pattern. Enter runs the pattern check; it passes only when every test star is inside the tolerance band.
import { define, machine, ARROW, ENTER, ri, rf, shuffle, txt, box, lamp, COL } from './kit.js';

const STEP = 0.6, KMAX = 6;
export default define({
  job: { billet: 'carto', label: 'Calibrate chart database against sensor test pattern', type: 'task:shakedown' },
  title: 'Offset and scale pattern fit', dept: 'sciences', host: 'console', tool: 'Chart database offset and scale dials, ruler residuals',
  how: 'Turn the offset dial (← / →) and the scale dial (↑ / ↓) until every test star\'s residual sits inside the tolerance band, then run the pattern check with Enter.',
  keys: ['← / → offset dial', '↑ / ↓ scale dial', 'Enter run pattern check'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'two-dial fit', input: 'arrows+enter', win: 'offset and scale dials set so that every test star, inner and outer, lands inside the tolerance band on the pattern check',
    fail: 'running the check while any test star is out of band, typically after fitting the offset to one outer star and leaving scale error',
    rule: 'Offset moves all residuals together; scale tilts them (outer stars move most, opposite sides opposite ways). Level the whole row into the band, then Enter.' },
  rush: 'Zeroed the offset on the brightest test star and saved the calibration.',
  captions: { 'out of band': 'pattern check fail tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, band = m.calm ? 0.4 : 0.35;
    const xs = shuffle(r, [-1, -0.95, -0.5, -0.1, 0.15, 0.55, 0.92, 1]).slice(0, 5); if (!xs.some(x => x <= -0.9)) xs[0] = -0.95; if (!xs.some(x => x >= 0.9)) xs[1] = 0.95;
    m.stars = xs.map(x => ({ x, n: +rf(r, -0.12, 0.12).toFixed(2), id: `TP-${ri(r, 10, 99)}` }));
    m.K = [ri(r, -4, 4), ri(r, -4, 4)]; do { m.k = [ri(r, -KMAX, KMAX), ri(r, -KMAX, KMAX)]; } while (Math.abs(m.k[0] - m.K[0]) + Math.abs(m.k[1] - m.K[1]) < 3);
    m.res = () => m.stars.map(s => (m.K[0] - m.k[0]) * STEP + (m.K[1] - m.k[1]) * STEP * s.x + s.n);
    const pass = () => m.res().every(v => Math.abs(v) <= band);
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), en = ENTER(code); if (!a && !en) return false; if (!down) return true;
      if (a === 'L') m.k[0] = Math.max(-KMAX, m.k[0] - 1); else if (a === 'R') m.k[0] = Math.min(KMAX, m.k[0] + 1);
      else if (a === 'D') m.k[1] = Math.max(-KMAX, m.k[1] - 1); else if (a === 'U') m.k[1] = Math.min(KMAX, m.k[1] + 1);
      if (en) { if (pass()) m.win(); else m.fault('out of band'); } return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { if (pass()) return [['Enter', true]]; if (m.k[0] !== m.K[0]) return [[m.k[0] < m.K[0] ? 'ArrowRight' : 'ArrowLeft', true]]; return [[m.k[1] < m.K[1] ? 'ArrowUp' : 'ArrowDown', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ s: m.stars.map(s => [s.x, s.n]), K: m.K });
    m.buttons = () => [['ArrowLeft', '◀ offset'], ['ArrowRight', 'offset ▶'], ['ArrowUp', 'scale ▲'], ['ArrowDown', 'scale ▼'], ['Enter', 'Run check']];
    m.draw = (c, W, H, P) => {
      const res = m.res(), cx = 200, cy = 82, sx = 160, sy = 44;
      txt(c, `OFFSET ${m.k[0] >= 0 ? '+' : ''}${m.k[0]}   SCALE ${m.k[1] >= 0 ? '+' : ''}${m.k[1]}`, 14, 16, { size: 11, col: COL.gold });
      c.fillStyle = 'rgba(79,208,106,.15)'; c.fillRect(cx - sx - 14, cy - band * sy, 2 * sx + 28, 2 * band * sy); c.strokeStyle = P.good; c.lineWidth = 1; c.strokeRect(cx - sx - 14, cy - band * sy, 2 * sx + 28, 2 * band * sy);
      c.strokeStyle = COL.dim; c.beginPath(); c.moveTo(cx - sx - 14, cy); c.lineTo(cx + sx + 14, cy); c.stroke();
      m.stars.forEach((s, i) => { const x = cx + s.x * sx, v = Math.max(-1.6, Math.min(1.6, res[i])), y = cy - v * sy, ok = Math.abs(res[i]) <= band;
        c.strokeStyle = ok ? P.good : P.bad; c.lineWidth = 3; c.beginPath(); c.moveTo(x, cy); c.lineTo(x, y); c.stroke();
        lamp(c, x, y, 5, ok ? P.good : P.bad, ok ? 'circle' : 'triangle'); txt(c, s.id, x - 14, 160, { size: 9, col: COL.dim }); });
      const inb = res.filter(v => Math.abs(v) <= band).length; box(c, 300, 6, 92, 18, COL.panel, null, 4); txt(c, `in band ${inb}/${m.stars.length}`, 306, 19, { size: 10 });
    };
    return m;
  },
});
