// CFO: plot the fastest safe route to the casualty pick-up. Trace the route on the touch chart with a held direction (arrows): the trace runs
// on cell by cell for as long as you hold, so let go or turn in time. Touching a radiation, nebula or debris cell flashes it and snaps the
// trace back to the last waypoint (where you last turned or stopped). The patient window counts down; the trace must reach the pick-up in it.
import { define, machine, ARROW, ri, txt, box, bar, COL } from './kit.js';

const GW = 14, GH = 6, CS = 24, OX = 32, OY = 10, DIRS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] }, KEY = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' };
export default define({
  job: { billet: 'cfo', label: 'Plot fastest safe route', type: 'task:medical_relief' },
  title: 'Touch-chart trace inside the patient window', dept: 'flight', host: 'console', tool: 'Touch chart and hazard list',
  how: 'Hold an arrow to run the route trace across the chart; it keeps going while held. Steer round the hazard cells and reach the pick-up before the patient window closes.',
  keys: ['Arrows hold: run the trace'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'trace the route', input: 'arrows-hold', win: 'the route line drawn from the ship to the casualty pick-up inside the patient window without touching a hazard cell',
    fail: 'running the trace into a radiation, nebula or debris cell (it snaps back), or letting the patient window close',
    rule: 'Holding a direction extends the trace one cell per beat. Release or turn before a hazard; a touch snaps it back to your last turn. Reach the pick-up before the window runs out.' },
  rush: 'Drew the straight line to the pick-up and told the helm to go.',
  captions: { hazard: 'hazard flash', window: 'patient alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, beat = m.calm ? 0.28 : 0.2;
    const hz = new Set(); const sy = ri(r, 0, GH - 1), gy = ri(r, 0, GH - 1);
    for (let k = 0; k < 4; k++) { const x = 2 + k * 3 + ri(r, 0, 1), gap = ri(r, 0, GH - 1); for (let y = 0; y < GH; y++) if (Math.abs(y - gap) > (k % 2 ? 0 : 1) && r() < 0.85) hz.add(x + ',' + y); }
    m.hz = hz; m.goal = [GW - 1, gy]; hz.delete(m.goal.join(','));
    const bfs = (sx, sy2) => { const prev = new Map([[sx + ',' + sy2, null]]), q = [[sx, sy2]]; while (q.length) { const [x, y] = q.shift(); if (x === m.goal[0] && y === m.goal[1]) { const path = []; let k = x + ',' + y; while (k) { path.unshift(k.split(',').map(Number)); k = prev.get(k); } return path; } for (const [dx, dy] of Object.values(DIRS)) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH || hz.has(k) || prev.has(k)) continue; prev.set(k, x + ',' + y); q.push([nx, ny]); } } return null; };
    hz.delete('0,' + sy); while (!bfs(0, sy) && hz.size) hz.delete([...hz][ri(r, 0, hz.size - 1)]);
    m.bfs = bfs; const p0 = bfs(0, sy); m.window = (p0 ? p0.length : 30) * beat * 1.7 + 3;
    m.trail = [[0, sy]]; m.wp = 1; m.dir = null; m.acc = 0; m.flash = 0;
    m.key = (code, down = true) => { if (m.state !== 'play') return false; const a = ARROW(code); if (!a) return false; m.held[a] = down; if (down && m.dir !== a) { m.dir = a; m.acc = beat; m.wp = m.trail.length; } if (!down && m.dir === a) { m.dir = null; m.wp = m.trail.length; } return true; };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.flash = Math.max(0, m.flash - dt); if (m.t > m.window) { m.fail('window'); return; }
      if (!m.dir || !m.held[m.dir]) return; m.acc += dt; if (m.acc < beat) return; m.acc -= beat;
      const [x, y] = m.trail[m.trail.length - 1], [dx, dy] = DIRS[m.dir], nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) return;
      if (hz.has(nx + ',' + ny)) { m.fault('hazard'); m.flash = 0.6; m.flashAt = [nx, ny]; m.trail.length = Math.max(1, m.wp); m.dir = null; return; }
      m.trail.push([nx, ny]); if (nx === m.goal[0] && ny === m.goal[1]) m.win();
    };
    m.hint = () => {
      const [x, y] = m.trail[m.trail.length - 1], p = bfs(x, y); if (!p || p.length < 2) return [];
      const [nx, ny] = p[1], d = nx > x ? 'R' : nx < x ? 'L' : ny > y ? 'D' : 'U';
      return Object.keys(KEY).map(k => [KEY[k], k === d]);
    };
    m.bad = () => ['ArrowRight', true];
    m.view = () => ({ hz: [...hz].sort(), g: m.goal, s: sy });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['ArrowLeft', '◀'], ['ArrowRight', '▶']];
    m.draw = (c, W, H, P) => {
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { const h = hz.has(x + ',' + y), fl = m.flash > 0 && m.flashAt && m.flashAt[0] === x && m.flashAt[1] === y; box(c, OX + x * CS, OY + y * CS, CS - 2, CS - 2, h ? (fl ? P.bad : 'rgba(255,90,72,.28)') : 'rgba(255,255,255,.05)', null, 3); if (h) txt(c, '☢', OX + x * CS + 6, OY + y * CS + 16, { size: 11, col: P.bad }); }
      const [gx, gy2] = m.goal; box(c, OX + gx * CS, OY + gy2 * CS, CS - 2, CS - 2, null, P.good, 3); txt(c, '+', OX + gx * CS + 7, OY + gy2 * CS + 17, { size: 14, col: P.good });
      c.strokeStyle = COL.gold; c.lineWidth = 3; c.beginPath(); m.trail.forEach(([x, y], i) => { const px = OX + x * CS + 11, py = OY + y * CS + 11; i ? c.lineTo(px, py) : c.moveTo(px, py); }); c.stroke();
      const left = Math.max(0, m.window - m.t); txt(c, `patient window ${left.toFixed(1)} s`, OX, 166, { size: 11, col: left < 4 ? P.bad : COL.pale }); bar(c, 170, 158, 210, 8, left / m.window, { col: COL.peri });
    };
    return m;
  },
});
