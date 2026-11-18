// Navigator: final approach plot to the station. The docking corridor bends and narrows toward the collar. For each of the three last legs,
// swing the plotting ruler (hold ← or →) until the pencil line from the current waypoint lands between the corridor walls at the next
// range ring, then lay it (Enter). A leg laid with its end or its middle outside the walls clips the corridor: the helm would have to
// fight it at the last second.
import { define, machine, ARROW, ENTER, rf, txt, lamp, COL } from './kit.js';

const Y = [150, 110, 70, 30];
export default define({
  job: { billet: 'nav', label: 'Final approach plot to the station', type: 'task:cargo_run' },
  title: 'Approach corridor ruler swing', dept: 'flight', host: 'console', tool: 'Station approach chart and plotting ruler',
  how: 'Hold ← or → to swing the ruler from the waypoint; when the line lands inside the corridor at the next ring, press Enter to lay the leg. Three legs to the collar.',
  keys: ['hold ← → swing the ruler', 'Enter lay the leg'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'swing and lay', input: 'arrows-hold+enter', win: 'three approach legs laid from waypoint to waypoint with every leg clear of the narrowing corridor walls to the collar',
    fail: 'laying a leg whose end or middle clips a corridor wall',
    rule: 'The ruler pivots on the current waypoint while ← or → is held, slowly. Watch where its tip meets the next range ring; once the tip and the middle sit between the walls, Enter lays it.' },
  rush: 'Drew one straight line at the collar and left the helm to follow the corridor.',
  captions: { wall: 'corridor alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, rate = m.calm ? 0.45 : 0.6, A = rf(r, 10, 22), f = rf(r, 0.015, 0.025), ph = rf(r, 0, 6.283), cx0 = rf(r, 150, 200);
    const cl = (y) => cx0 + A * Math.sin(y * f + ph), wid = [22, 16, 11].map(w => w + (m.calm ? 4 : 0));
    m.rounds = 3; m.round = 0; m.P = [cl(Y[0])]; m.th = 0;
    const tgt = () => { const k = m.round, dy = Y[k] - Y[k + 1]; return Math.atan((cl(Y[k + 1]) - m.P[k]) / dy); };
    const endX = (th) => m.P[m.round] + Math.tan(th) * (Y[m.round] - Y[m.round + 1]);
    const midX = (th) => m.P[m.round] + Math.tan(th) * (Y[m.round] - Y[m.round + 1]) / 2;
    const clear = (th) => { const k = m.round, ym = (Y[k] + Y[k + 1]) / 2, wm = (wid[k] + (k ? wid[k - 1] : wid[k] + 6)) / 2; return Math.abs(endX(th) - cl(Y[k + 1])) < wid[k] && Math.abs(midX(th) - cl(ym)) < wm; };
    const newLeg = () => { const t = tgt(), w = wid[m.round] / 40; m.th = t + (r() < 0.5 ? -1 : 1) * (w + rf(r, 0.15, 0.4)); };
    newLeg();
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'L' || a === 'R') { m.held[a] = down; return true; }
      if (!ENTER(code) || !down) return !!a;
      if (!clear(m.th)) { m.fault('wall'); return true; }
      m.P.push(endX(m.th)); m.round++; m.ev('leg'); if (m.round >= 3) m.win(); else newLeg(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.th += ((m.held.R ? 1 : 0) - (m.held.L ? 1 : 0)) * rate * dt; m.th = Math.max(-1.2, Math.min(1.2, m.th)); };
    m.hint = () => { const e = tgt() - m.th; if (Math.abs(e) < 0.03) return [['ArrowLeft', false], ['ArrowRight', false], ['Enter', true]]; return e > 0 ? [['ArrowLeft', false], ['ArrowRight', true]] : [['ArrowRight', false], ['ArrowLeft', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ A: +A.toFixed(2), cx0: +cx0.toFixed(1), th: +m.th.toFixed(3) });
    m.buttons = () => [['ArrowLeft', '◀ swing'], ['ArrowRight', 'swing ▶'], ['Enter', 'Lay leg']];
    m.draw = (c, W, H, P) => {
      c.lineWidth = 2; for (const s of [-1, 1]) { c.strokeStyle = COL.peri; c.beginPath(); for (let y = 152; y >= 22; y -= 4) { const k = y > 110 ? 0 : y > 70 ? 1 : 2, x = cl(y) + s * wid[k]; if (y === 152) c.moveTo(x, y); else c.lineTo(x, y); } c.stroke(); }
      Y.forEach((y, i) => { c.fillStyle = 'rgba(168,166,185,.4)'; c.fillRect(cl(y) - 40, y, 80, 1); if (i) txt(c, `ring ${i}`, cl(y) + 46, y + 3, { size: 8, col: COL.dim }); });
      lamp(c, cl(Y[3]), Y[3] - 6, 6, COL.lav, 'square'); txt(c, 'collar', cl(Y[3]) + 10, Y[3] - 3, { size: 9, col: COL.lav });
      c.strokeStyle = COL.gold; c.beginPath(); m.P.forEach((x, i) => { if (i) c.lineTo(x, Y[i]); else c.moveTo(x, Y[i]); }); c.stroke();
      if (m.round < 3) { const ok = clear(m.th); c.strokeStyle = ok ? P.good : COL.orange; c.setLineDash?.([4, 3]); c.beginPath(); c.moveTo(m.P[m.round], Y[m.round]); c.lineTo(endX(m.th), Y[m.round + 1]); c.stroke(); c.setLineDash?.([]); lamp(c, endX(m.th), Y[m.round + 1], 5, ok ? P.good : P.bad, ok ? 'circle' : 'triangle'); }
      txt(c, `LEG ${Math.min(3, m.round + 1)} / 3`, 290, 30, { size: 12, col: COL.peri }); txt(c, m.round < 3 && clear(m.th) ? 'clear of walls' : 'clips a wall', 290, 50, { size: 11, col: m.round < 3 && clear(m.th) ? P.good : P.bad });
    };
    return m;
  },
});
