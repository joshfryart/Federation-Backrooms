// CFO: confirm docking approach. The ship coasts in toward the dock; the approach profile lowers the allowed closing speed as the range falls.
// Each Space calls one short braking pulse from the helm (it takes a fixed share off the closing speed). Keep the speed inside the profile band at every
// range gate: too fast is a hot approach, too slow stalls short of the dock. Reach the stop mark under docking speed.
import { define, machine, SPACE, rf, clamp, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'cfo', label: 'Confirm docking approach', type: 'task:cargo_run' },
  title: 'Pulse-brake down the docking profile', dept: 'flight', host: 'console', tool: 'Approach display and helm throttle',
  how: 'Call a braking pulse (Space) whenever the closing speed creeps up to the top of the profile band. Pass every range gate inside the band and reach the dock under docking speed.',
  keys: ['Space one braking pulse'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'pulse-brake', input: 'space', win: 'every range gate crossed with the closing speed inside the profile band and the dock reached below docking speed',
    fail: 'crossing a gate too fast, over-braking so the ship stalls short, or arriving hot at the dock',
    rule: 'The band slides down as the range closes; the speed only drops when you call a pulse. Call one each time the speed nears the top of the band, never so many that it falls under.' },
  rush: 'Called a long burn at the last minute and let the dock bumpers take it.',
  captions: { 'hot approach': 'proximity alarm', 'stalled short': 'helm reports no way on', 'hard dock': 'docking clamps bang' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, band = m.calm ? 0.42 : 0.35, bite = rf(r, 0.15, 0.21), slope = rf(r, 0.045, 0.055), floor = rf(r, 3.5, 4.5);
    m.c = { R: 500, v: 0, cd: 0, gates: [400, 300, 200, 100], bite, slope, floor, n: 0 }; m.c.v = floor + 500 * slope + rf(r, 0, 2);
    m.vmax = (R) => m.c.floor + Math.max(0, R) * m.c.slope; m.vmin = (R) => m.vmax(R) * (1 - band);
    m.rounds = 5; m.round = 1;
    m.key = (code, down = true) => { if (m.state !== 'play' || !down || !SPACE(code)) return false; const c = m.c; if (c.cd > 0) return true; c.v *= 1 - c.bite; c.cd = 0.3; c.n++; return true; };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const c = m.c; c.cd -= dt; const R0 = c.R; c.R -= c.v * dt * 3.2;
      if (c.v < 0.8) { m.fault('stalled short'); c.v = m.vmax(c.R) * (1 - band / 2); }
      for (const g of c.gates) if (R0 > g && c.R <= g) { m.round++; if (c.v > m.vmax(g)) { m.fault('hot approach'); c.v = m.vmax(g) - 1; } else if (c.v < m.vmin(g)) { m.fault('stalled short'); c.v = m.vmax(g) - 1; } }
      if (c.R <= 0) { if (c.v <= c.floor + 1) m.win(); else { m.fault('hard dock'); c.R = 120; c.v = m.vmax(120) - 1; } }
    };
    m.hint = () => { const c = m.c; return c.cd <= 0 && c.v > m.vmax(c.R) * 0.96 ? [['Space', true]] : []; };
    m.bad = () => 'Space';
    m.view = () => ({ b: +bite.toFixed(2), s: +slope.toFixed(4), v: +m.c.v.toFixed(2) });
    m.buttons = () => [['Space', 'Brake pulse']];
    m.draw = (c, W, H, P) => {
      const k = m.c, x0 = 20, w = 360, X = (R) => x0 + (1 - R / 500) * w, Y = (v) => 110 - v / 34 * 90;
      c.fillStyle = 'rgba(79,208,106,.18)'; c.beginPath(); c.moveTo(X(500), Y(m.vmax(500))); c.lineTo(X(0), Y(m.vmax(0))); c.lineTo(X(0), Y(m.vmin(0))); c.lineTo(X(500), Y(m.vmin(500))); c.closePath(); c.fill();
      c.strokeStyle = P.good; c.lineWidth = 1; c.stroke();
      for (const g of k.gates) { c.fillStyle = 'rgba(255,255,255,.3)'; c.fillRect(X(g), 14, 1, 100); txt(c, g, X(g) - 9, 124, { size: 9, col: COL.dim }); }
      const inB = k.v <= m.vmax(k.R) && k.v >= m.vmin(k.R); c.beginPath(); c.arc(X(Math.max(0, k.R)), Y(k.v), 5, 0, 6.283); c.fillStyle = inB ? COL.gold : P.bad; c.fill();
      txt(c, `range ${Math.max(0, k.R).toFixed(0)} m`, 20, 146, { size: 13 }); txt(c, `closing ${k.v.toFixed(1)} m/s`, 150, 146, { size: 13, col: inB ? COL.ink : P.bad });
      txt(c, `profile ${m.vmin(k.R).toFixed(1)}–${m.vmax(k.R).toFixed(1)}`, 290, 146, { size: 11, col: COL.pale }); txt(c, 'STOP', X(0) - 18, 12, { size: 9, col: COL.gold });
      bar(c, 20, 156, 360, 6, 1 - Math.max(0, k.R) / 500, { col: COL.peri });
    };
    return m;
  },
});
