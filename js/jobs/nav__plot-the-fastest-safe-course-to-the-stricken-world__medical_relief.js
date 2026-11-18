// Navigator: plot the fastest safe course to the stricken world. The pencil runs the direct line toward the world while the sensor overlay
// lights hazard zones just ahead of it. Before the pencil reaches a lit zone, bend the line round it above (↑) or below (↓): the side with
// the smaller added distance, unless that side is blocked. Running into a lit zone, bending on the slow side, or bending where nothing is
// lit is a fault.
import { define, machine, ARROW, rf, ri, txt, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'nav', label: 'Plot the fastest safe course to the stricken world', type: 'task:medical_relief' },
  title: 'Hazard bend on the direct line', dept: 'flight', host: 'console', tool: 'Chart and sensor hazard overlay',
  how: 'The pencil follows the direct line. When a hazard lights ahead, bend round it above (↑) or below (↓) on the side with less added distance, unless that side is blocked.',
  keys: ['↑ bend above', '↓ bend below'], limit: 26, maxFaults: 3,
  fingerprint: { verb: 'bend around', input: 'arrows', win: 'the course reaches the stricken world with every lit hazard bent round on its shorter open side in time',
    fail: 'letting the line run into a lit hazard, bending on the longer or blocked side, or bending where no hazard is lit',
    rule: 'Each lit hazard shows the added distance above and below, and a blocked side shows a warning. Press ↑ or ↓ for the shorter open side before the pencil gets there; never bend for nothing.' },
  rush: 'Sent the straight line through the hazard field to save ten minutes.',
  captions: { 'in hazard': 'hull alarm', 'slow detour': 'chart chime', 'needless bend': 'pencil scratch' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, spd = m.calm ? 0.045 : 0.06, look = 0.22;
    m.hz = []; let x = rf(r, 0.24, 0.3); for (let k = 0; k < 4; k++) { const up = ri(r, 2, 9); let dn = ri(r, 2, 9); if (dn === up) dn = up + 2; const blk = r() < 0.35 ? (r() < 0.5 ? 'U' : 'D') : null; m.hz.push({ x, up, dn, blk, bent: null }); x += rf(r, 0.16, 0.19); }
    m.pen = 0; m.rounds = 4; m.round = 0;
    const best = (h) => h.blk ? (h.blk === 'U' ? 'D' : 'U') : (h.up < h.dn ? 'U' : 'D');
    const ahead = () => m.hz.find(h => !h.bent && h.x - m.pen > 0 && h.x - m.pen < look);
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code); if (a !== 'U' && a !== 'D') return !!a;
      const h = ahead(); if (!h) { m.fault('needless bend'); return true; }
      h.bent = a; m.round++; if (a === h.blk) m.fault('in hazard'); else if (a !== best(h)) m.fault('slow detour'); return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.pen += spd * dt;
      for (const h of m.hz) if (!h.bent && m.pen >= h.x) { h.bent = 'X'; m.round++; m.fault('in hazard'); }
      if (m.pen >= 1 && m.state === 'play') m.win();
    };
    m.hint = () => { const h = ahead(); return h && h.x - m.pen < look * 0.7 ? [[best(h) === 'U' ? 'ArrowUp' : 'ArrowDown', true]] : []; };
    m.bad = () => (ahead() ? null : 'ArrowUp');
    m.view = () => ({ hz: m.hz.map(h => [+h.x.toFixed(3), h.up, h.dn, h.blk]) });
    m.buttons = () => [['ArrowUp', '▲ above'], ['ArrowDown', '▼ below']];
    m.draw = (c, W, H, P) => {
      const x0 = 20, w = 340, y = 88, X = (v) => x0 + v * w;
      txt(c, 'DIRECT LINE → stricken world', x0, 20, { size: 11, col: COL.peri }); lamp(c, X(1) + 10, y, 9, COL.lav, 'circle');
      c.strokeStyle = 'rgba(168,166,185,.4)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x0, y); c.lineTo(X(1), y); c.stroke();
      c.fillStyle = 'rgba(125,151,232,.10)'; c.fillRect(X(m.pen), 30, look * w, 116);
      for (const h of m.hz) {
        const lit = h.x - m.pen < look; if (!lit && !h.bent) continue; const hx = X(h.x);
        c.fillStyle = 'rgba(255,90,72,.28)'; c.fillRect(hx - 12, y - 14, 24, 28); lamp(c, hx, y, 6, P.bad, 'triangle');
        txt(c, h.blk === 'U' ? 'BLOCKED' : `+${h.up}`, hx, y - 36, { size: 10, col: h.blk === 'U' ? P.bad : COL.ink, align: 'center' });
        txt(c, h.blk === 'D' ? 'BLOCKED' : `+${h.dn}`, hx, y + 44, { size: 10, col: h.blk === 'D' ? P.bad : COL.ink, align: 'center' });
        if (h.bent === 'U' || h.bent === 'D') { const s = h.bent === 'U' ? -1 : 1; c.strokeStyle = COL.gold; c.lineWidth = 2; c.beginPath(); c.moveTo(hx - 22, y); c.lineTo(hx, y + s * 24); c.lineTo(hx + 22, y); c.stroke(); }
      }
      c.strokeStyle = COL.gold; c.lineWidth = 2; c.beginPath(); c.moveTo(x0, y); c.lineTo(X(m.pen), y); c.stroke(); lamp(c, X(m.pen), y, 5, COL.gold, 'diamond');
    };
    return m;
  },
});
