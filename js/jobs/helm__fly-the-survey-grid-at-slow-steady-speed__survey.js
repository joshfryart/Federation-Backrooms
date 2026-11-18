// Helm: fly the survey grid at slow, steady speed. Two hands, two jobs: feather the throttle (hold Space) to keep the speed readout inside
// the slow notch band, where tail currents on some lines make it creep, and hold the yaw keys to keep the ship on the amber grid line as it
// swings round each corner in a wide arc. Speed out of the band, or the track off the amber lane, smears the sensor sweep.
import { define, machine, ARROW, SPACE, rf, pick, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'helm', label: 'Fly the survey grid at slow, steady speed', type: 'task:survey' },
  title: 'Feathered throttle survey grid', dept: 'flight', host: 'console', tool: 'Throttle, yaw wheel and survey grid chart',
  how: 'Feather Space to keep the speed inside the slow notch (it creeps on some lines), and hold ← / → to keep the ship on the amber lane as it arcs round each corner.',
  keys: ['Space hold: throttle', '← / → hold: yaw'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'feather and track', input: 'arrows-hold+space-hold', win: 'the whole survey grid flown with speed held inside the slow notch and the track on the amber line through every corner',
    fail: 'speed creeping out of the slow notch on a straight, or a corner flown jerky so the track leaves the amber lane',
    rule: 'Holding Space adds power and speed climbs; releasing it lets speed bleed off. Tail currents push it too. Holding ← / → swings the track; the amber lane curves at each corner and you follow it.' },
  rush: 'Flew the grid at cruise and let the sensor team stitch the smeared sweeps.',
  captions: { 'off speed': 'sweep smear warning', 'off the line': 'grid tracker pips' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, len = 8, Lw = m.calm ? 0.15 : 0.12, sb = m.calm ? [0.42, 0.62] : [0.45, 0.6];
    m.segs = []; for (let d = 0, k = 0; d < len; k++) { const straight = rf(r, 1.2, 1.8); m.segs.push({ a: d, b: d + straight, turn: 0, tail: rf(r, -0.12, 0.14) }); d += straight; m.segs.push({ a: d, b: d + 0.6, turn: pick(r, [-1, 1]), tail: 0 }); d += 0.6; }
    m.d = 0; m.s = 0.52; m.y = 0; m.c = 0; m.cv = 0; m.offS = 0; m.offL = 0; m.held = {};
    const seg = () => m.segs.find(s => m.d >= s.a && m.d < s.b) || m.segs[m.segs.length - 1];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; if (SPACE(code)) { m.held.S = down; return true; }
      const a = ARROW(code); if (a === 'L' || a === 'R') { m.held[a] = down; return true; } return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const g = seg();
      m.s = Math.max(0, m.s + ((m.held.S ? 0.35 : -0.3) + g.tail) * dt); m.d += m.s * dt;
      m.cv = g.turn * 0.4 * m.s; m.c += m.cv * dt; m.y += ((m.held.R ? 0.3 : 0) - (m.held.L ? 0.3 : 0)) * dt;
      if (m.s < sb[0] || m.s > sb[1]) { m.offS += dt; if (m.offS > 0.6) { m.fault('off speed'); m.offS = 0; m.s = 0.52; } } else m.offS = 0;
      if (Math.abs(m.y - m.c) > Lw) { m.offL += dt; if (m.offL > 0.3) { m.fault('off the line'); m.offL = 0; m.y = m.c; } } else m.offL = 0;
      if (m.d >= len) m.win();
    };
    m.hint = () => {
      const e = m.c + m.cv * 0.3 - m.y, out = [['Space', m.s < 0.525]];
      out.push(['ArrowRight', e > 0.015], ['ArrowLeft', e < -0.015]); return out;
    };
    m.bad = () => ['Space', true];
    m.view = () => ({ segs: m.segs.map(s => [+s.a.toFixed(2), s.turn, +s.tail.toFixed(2)]) });
    m.buttons = () => [['ArrowLeft', '◀ yaw'], ['Space', 'Throttle (hold)'], ['ArrowRight', 'yaw ▶']];
    m.draw = (c, W, H, P) => {
      const x0 = 30, sc = 70, cy = 80, S = 160; c.strokeStyle = COL.warn; c.lineWidth = Lw * S * 2; c.globalAlpha = 0.25; c.beginPath();
      let cc = m.c; for (let k = 0; k <= 30; k++) { const dd = m.d + k * 0.1, gs = m.segs.find(s => dd >= s.a && dd < s.b); if (k) cc += (gs ? gs.turn * 0.4 * 0.52 : 0) * 0.1 / 0.52; const X = x0 + k * 0.1 * sc, Y = cy + (cc - m.c) * S; if (k) c.lineTo(X, Y); else c.moveTo(X, Y); }
      c.stroke(); c.globalAlpha = 1; c.lineWidth = 2;
      c.fillStyle = COL.gold; c.beginPath(); c.moveTo(x0 + 10, cy + (m.y - m.c) * S); c.lineTo(x0 - 6, cy + (m.y - m.c) * S - 7); c.lineTo(x0 - 6, cy + (m.y - m.c) * S + 7); c.closePath(); c.fill();
      box(c, 262, 12, 126, 60, COL.panel, null, 6); txt(c, 'SPEED', 272, 30, { size: 10, col: COL.dim });
      bar(c, 272, 38, 106, 10, m.s / 0.9, { band: [sb[0] / 0.9, sb[1] / 0.9], col: m.s < sb[0] || m.s > sb[1] ? COL.warn : COL.gold });
      txt(c, m.s > sb[1] ? 'creeping up' : m.s < sb[0] ? 'too slow' : 'slow notch', 272, 64, { size: 11, col: COL.pale });
      txt(c, `grid ${Math.round(Math.min(1, m.d / len) * 100)} %`, W - 12, H - 12, { size: 12, align: 'right', col: COL.peri });
      if (seg().turn) txt(c, 'CORNER ' + (seg().turn > 0 ? '▼' : '▲'), 262, 96, { size: 12, col: COL.warn });
    };
    return m;
  },
});
