// Navigator: hold station on each survey point. The current pushes the ship off the point; you cannot fly it, only call corrections to the
// helm over comm. Each call (an arrow) adds one trim step in that direction, and the helm applies it after the comm delay, so over-calling
// overshoots. Keep the drift marker in the ring while the sensor scan runs, then log the hold (Enter) once sensors give the go-ahead.
import { define, machine, ARROW, ENTER, rf, txt, bar, lamp, COL } from './kit.js';

const DIRS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] }, KEY = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' };
export default define({
  job: { billet: 'nav', label: 'Hold station on each survey point', type: 'task:survey' },
  title: 'Talk the helm onto station', dept: 'flight', host: 'console', tool: 'Drift mirror and helm comm',
  how: 'Call trim corrections to the helm (arrows): each call lands after a short comm delay. Keep the marker in the ring until the scan go-ahead, then log the hold (Enter).',
  keys: ['arrows call a trim step', 'Enter log the hold'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'talk the helm', input: 'arrows+enter', win: 'each of three survey points held inside the ring through the whole sensor scan and logged only after the go-ahead',
    fail: 'letting the drift carry the marker out of the ring and blur the scan, or logging the hold before sensors finish',
    rule: 'An arrow tells the helm to add one trim step that way; it takes effect after the comm delay shown by the pending ticks. Lead the drift, do not chase it. Enter logs the point once the go-ahead lamp lights.' },
  rush: 'Called the hold done on each point as soon as the ship was roughly there.',
  captions: { blurred: 'sensor complaint chirp', 'early log': 'sensor query tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, R = m.calm ? 1.3 : 1, step = 0.15, lag = 0.5, need = 3;
    m.rounds = 3; m.round = 0;
    m.newPoint = () => { const a = rf(r, 0, 6.283), s = rf(r, 0.22, 0.38); m.p = { x: 0, y: 0, cx: Math.cos(a) * s, cy: Math.sin(a) * s, ux: 0, uy: 0, q: [], scan: 0, gust: rf(r, 1.2, 2.2), ga: rf(r, 0, 6.283), done: false }; };
    m.newPoint();
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a) { m.p.q.push({ at: m.t + lag, d: DIRS[a] }); return true; }
      if (!ENTER(code)) return false;
      if (m.p.scan < need) { m.fault('early log'); return true; }
      m.round++; m.ev('held'); if (m.round >= 3) m.win(); else m.newPoint(); return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const p = m.p;
      while (p.q.length && p.q[0].at <= m.t) { const { d } = p.q.shift(); p.ux += d[0] * step; p.uy += d[1] * step; }
      if (p.gust > 0) { p.gust -= dt; if (p.gust <= 0) { p.cx += Math.cos(p.ga) * 0.12; p.cy += Math.sin(p.ga) * 0.12; } }
      p.x += (p.cx + p.ux) * dt; p.y += (p.cy + p.uy) * dt;
      if (Math.hypot(p.x, p.y) > R) { m.fault('blurred'); p.x = 0; p.y = 0; p.scan = 0; p.ux = -p.cx; p.uy = -p.cy; p.q = []; }
      else p.scan = Math.min(need, p.scan + dt);
    };
    m.hint = () => {
      const p = m.p; if (p.scan >= need) return [['Enter', true]];
      const pend = p.q.reduce((s, c) => [s[0] + c.d[0] * step, s[1] + c.d[1] * step], [0, 0]);
      const ex = -0.6 * p.x - (p.cx + p.ux + pend[0]), ey = -0.6 * p.y - (p.cy + p.uy + pend[1]);
      if (Math.max(Math.abs(ex), Math.abs(ey)) < step * 0.6) return [];
      return [[Math.abs(ex) >= Math.abs(ey) ? KEY[ex > 0 ? 'R' : 'L'] : KEY[ey > 0 ? 'D' : 'U'], true]];
    };
    m.bad = () => 'Enter';
    m.view = () => ({ cx: +m.p.cx.toFixed(3), cy: +m.p.cy.toFixed(3), ga: +m.p.ga.toFixed(2) });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['Enter', 'Log hold']];
    m.draw = (c, W, H, P) => {
      const p = m.p, cx = 90, cy = 85, k = 55 / R;
      c.strokeStyle = COL.peri; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R * k, 0, 6.283); c.stroke();
      c.strokeStyle = COL.dim; c.lineWidth = 1; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + p.cx * 120, cy + p.cy * 120); c.stroke(); txt(c, 'current', cx + p.cx * 120, cy + p.cy * 120, { size: 8, col: COL.dim });
      const off = Math.hypot(p.x, p.y) / R; lamp(c, cx + p.x * k, cy + p.y * k, 7, off > 0.75 ? P.bad : COL.gold, off > 0.75 ? 'triangle' : 'circle');
      txt(c, `POINT ${m.round + 1} / 3`, 180, 24, { size: 12, col: COL.peri });
      txt(c, `helm trim  ${p.ux >= 0 ? '+' : ''}${p.ux.toFixed(2)} , ${p.uy >= 0 ? '+' : ''}${p.uy.toFixed(2)}`, 180, 46, { size: 11 });
      txt(c, `calls in transit: ${'▸'.repeat(p.q.length) || 'none'}`, 180, 66, { size: 11, col: COL.pale });
      txt(c, 'SENSOR SCAN', 180, 96, { size: 11, col: COL.peri }); bar(c, 180, 104, 190, 10, p.scan / need, { col: COL.lav });
      const go = p.scan >= need; lamp(c, 190, 138, 8, go ? P.good : COL.dim, go ? 'circle' : 'square'); txt(c, go ? 'GO-AHEAD: log the hold' : 'scan running', 204, 142, { size: 11, col: go ? P.good : COL.dim });
    };
    return m;
  },
});
