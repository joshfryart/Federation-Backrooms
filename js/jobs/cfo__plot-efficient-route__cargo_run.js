// CFO: plot efficient route for the cargo run. The lane chart is a grid of sectors, five rows by seven columns; the shuttle starts at the left edge
// and the dock is the right edge. Each sector shows its fuel cost; a few are debris fields. Step with the arrows from sector to sector: every sector
// entered burns its cost from the reserve budget, and you must reach the dock column inside the budget without running through debris.
import { define, machine, ARROW, ri, txt, box, bar, COL } from './kit.js';

const C = 7, R = 5;
export default define({
  job: { billet: 'cfo', label: 'Plot efficient route', type: 'task:cargo_run' },
  title: 'Cheapest path through the sectors', dept: 'flight', host: 'console', tool: 'Sector chart and fuel budget',
  how: 'Step the shuttle across the chart with the arrow keys. Each sector entered burns its fuel cost; keep out of debris and reach the right edge within the budget.',
  keys: ['arrows: step to the next sector'], limit: 30, maxFaults: 2,
  fingerprint: { verb: 'path the sectors', input: 'arrows',
    win: 'the shuttle stepped across the sector grid from the left edge to the dock column within the fuel budget and clear of debris',
    fail: 'entering a debris sector, or burning past the fuel budget before reaching the dock',
    rule: 'Each sector has a fuel cost; the budget is the cheapest path plus a little slack. Arrows move one sector. Debris is a fault. Reaching the right edge with fuel left wins.' },
  rush: 'Took the fastest lane at every junction and hoped the tanks held.',
  captions: { debris: 'hull strike: debris field', reserve: 'fuel reserve gone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; m.px = 0; m.py = ri(r, 0, R - 1); m.used = 0;
    m.cost = Array.from({ length: R }, () => Array.from({ length: C }, () => ri(r, 1, 3))); m.deb = Array.from({ length: R }, () => Array(C).fill(false));
    for (let n = 0; n < 7; n++) { const x = ri(r, 1, C - 2), y = ri(r, 0, R - 1); if (!(x === 0 && y === m.py)) m.deb[y][x] = true; }
    const path = (sx, sy) => { const D = Array.from({ length: R }, () => Array(C).fill(1e9)), P = Array.from({ length: R }, () => Array(C).fill(null)); D[sy][sx] = 0; const todo = [[sx, sy]];
      while (todo.length) { todo.sort((a, b) => D[b[1]][b[0]] - D[a[1]][a[0]]); const [x, y] = todo.pop(); for (const [dx, dy] of [[1, 0], [0, 1], [0, -1], [-1, 0]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= C || ny >= R || m.deb[ny][nx]) continue; const d = D[y][x] + m.cost[ny][nx]; if (d < D[ny][nx]) { D[ny][nx] = d; P[ny][nx] = [x, y]; todo.push([nx, ny]); } } }
      let bx = -1, bd = 1e9; for (let y = 0; y < R; y++) if (D[y][C - 1] < bd) { bd = D[y][C - 1]; bx = y; } if (bx < 0) return null; const out = []; let cx = C - 1, cy = bx; while (P[cy][cx]) { out.push([cx, cy]); [cx, cy] = P[cy][cx]; } return { cost: bd, steps: out.reverse() }; };
    let p0 = path(0, m.py); while (!p0) { m.deb = m.deb.map(row => row.map(() => false)); p0 = path(0, m.py); } m.budget = p0.cost + 2; m.path = path;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code); if (!a) return false; if (!down) return true; const nx = m.px + (a === 'R' ? 1 : a === 'L' ? -1 : 0), ny = m.py + (a === 'D' ? 1 : a === 'U' ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= C || ny >= R) return true; m.px = nx; m.py = ny; m.used += m.cost[ny][nx];
      if (m.deb[ny][nx]) { m.fault('debris'); if (m.state !== 'play') return true; } if (m.used > m.budget) { m.fail('reserve'); return true; } if (m.px === C - 1) m.win(); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { if (m.state !== 'play') return []; const p = m.path(m.px, m.py); if (!p) return []; const s = p.steps[0]; return [[s[0] > m.px ? 'ArrowRight' : s[0] < m.px ? 'ArrowLeft' : s[1] > m.py ? 'ArrowDown' : 'ArrowUp', true]]; };
    m.bad = () => 'ArrowUp';
    m.view = () => ({ c: m.cost, d: m.deb.map(row => row.map(x => (x ? 1 : 0))), y: m.py, b: m.budget });
    m.buttons = () => [['ArrowLeft', '◀'], ['ArrowUp', '▲'], ['ArrowDown', '▼'], ['ArrowRight', '▶']];
    m.draw = (c, W, H, P) => {
      for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) { const X = 10 + x * 42, Y = 8 + y * 28, here = x === m.px && y === m.py; box(c, X, Y, 40, 26, m.deb[y][x] ? '#4a2020' : COL.panel, here ? COL.gold : null, 3); txt(c, m.deb[y][x] ? 'XXX' : String(m.cost[y][x]), X + 20, Y + 18, { size: 12, align: 'center', col: m.deb[y][x] ? P.bad : COL.ink }); if (here) txt(c, '▶', X + 6, Y + 18, { size: 11, col: COL.gold }); }
      txt(c, 'FUEL', 316, 24, { size: 10, col: COL.dim }); bar(c, 316, 32, 70, 12, Math.min(1, m.used / m.budget), { col: m.used > m.budget * 0.85 ? P.bad : COL.peri }); txt(c, `${m.used} / ${m.budget}`, 316, 62, { size: 12 }); txt(c, 'DOCK ▶', 360, 160, { size: 10, align: 'right', col: COL.gold });
    };
    return m;
  },
});
