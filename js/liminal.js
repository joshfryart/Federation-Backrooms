// Liminal set dressing maths (madness mode), pure: no three.js, so node tests can run it (tools/test.mjs `liminal-unit`).
//  - findLoopRun: the impossible corridor (deck 4+): the longest straight, enclosed corridor run of 5+ tiles.
//  - loopCheck: one step of the loop state machine (main.js loopStep wraps it with the player's tile and speed).
//  - findEmptyRuns: other long straight corridor stretches left empty and unlit (deck 3+), away from the loop run and the lift.
//  - shiftedSign: what a sign reads after the k-th loop (loops change the deck: World.loopShift relabels its signs).

// liminal.run = { ax, fixed, a, b } in tile units along the axis ('x': row `fixed`, columns a..b; 'y': column `fixed`, rows a..b)
export function findLoopRun(data) {
  let best = null; const g = data.grid, W = data.W, H = data.H, open = (x, y) => g[y]?.[x] === 0 && !data.room[y]?.[x] && !data.tubeAxis?.[x + y * W];
  for (let y = 1; y < H - 1; y++) { let x = 0; while (x < W) { if (!(open(x, y) && g[y - 1][x] === 1 && g[y + 1][x] === 1)) { x++; continue; } let e = x; while (open(e + 1, y) && g[y - 1][e + 1] === 1 && g[y + 1][e + 1] === 1) e++; if (e - x + 1 >= 5 && (!best || e - x > best.b - best.a)) best = { ax: 'x', fixed: y, a: x, b: e }; x = e + 1; } }
  for (let x = 1; x < W - 1; x++) { let y = 0; while (y < H) { if (!(open(x, y) && g[y][x - 1] === 1 && g[y][x + 1] === 1)) { y++; continue; } let e = y; while (open(x, e + 1) && g[e + 1][x - 1] === 1 && g[e + 1][x + 1] === 1) e++; if (e - y + 1 >= 5 && (!best || e - y > best.b - best.a)) best = { ax: 'y', fixed: x, a: y, b: e }; y = e + 1; } }
  return best;
}

// tiles of a run as [x, y]
export const runTiles = (r) => { const out = []; for (let u = r.a; u <= r.b; u++) out.push(r.ax === 'x' ? [u, r.fixed] : [r.fixed, u]); return out; };
export const inRun = (r, x, y) => !!r && (r.ax === 'x' ? y === r.fixed && x >= r.a && x <= r.b : x === r.fixed && y >= r.a && y <= r.b);

// L = { run, count, walked }; u = tile along the run axis, v = tile across it, speed = velocity along the axis.
// Returns the tile (along the axis) to send the player back to, or null. Mutates L (walked / count) like the old in-line loopStep did.
export function loopCheck(L, u, v, speed) {
  if (!L || L.count >= 2) return null; const run = L.run;
  if (v !== run.fixed || u < run.a || u > run.b || Math.abs(speed) < 0.5) return null;
  const dir = Math.sign(speed), atEnd = dir > 0 ? u >= run.b - 1 : u <= run.a + 1; if (!atEnd) { L.walked = dir; return null; }
  if (L.walked !== dir) return null;                              // only after really walking the run toward this end
  const back = Math.min(3, run.b - run.a - 2); L.count++; L.walked = 0;
  return dir > 0 ? run.a + back : run.b - back;
}

// empty stretches (deck 3+ in madness): up to `max` straight corridor runs of 4+ open tiles (walls not required on both sides), no room / tube / prop tiles,
// not on or beside the loop run, no tile within 2 of the lift. Chosen longest first, ties broken by a hash of deck and position (stable per deck).
export function findEmptyRuns(data, loopRun = null, max = 2) {
  const g = data.grid, W = data.W, H = data.H, [ex, ey] = data.exit || [-99, -99];
  const ok = (x, y) => g[y]?.[x] === 0 && !data.room[y]?.[x] && !data.tubeAxis?.[x + y * W] && Math.abs(x - ex) + Math.abs(y - ey) > 2
    && !(loopRun && [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => inRun(loopRun, x + a, y + b)));
  const cands = [];
  for (let y = 0; y < H; y++) { let x = 0; while (x < W) { if (!ok(x, y)) { x++; continue; } let e = x; while (ok(e + 1, y)) e++; if (e - x + 1 >= 4) cands.push({ ax: 'x', fixed: y, a: x, b: e }); x = e + 1; } }
  for (let x = 0; x < W; x++) { let y = 0; while (y < H) { if (!ok(x, y)) { y++; continue; } let e = y; while (ok(x, e + 1)) e++; if (e - y + 1 >= 4) cands.push({ ax: 'y', fixed: x, a: y, b: e }); y = e + 1; } }
  const hz = (r) => { const h = Math.sin(r.a * 12.9898 + r.fixed * 78.233 + (data.deck || 0) * 3.7 + (r.ax === 'x' ? 0 : 19.1)) * 43758.5453; return h - Math.floor(h); };
  cands.sort((p, q) => (q.b - q.a) - (p.b - p.a) || hz(p) - hz(q));
  const out = [], near = (p, q) => runTiles(p).some(([x, y]) => runTiles(q).some(([x2, y2]) => Math.abs(x - x2) + Math.abs(y - y2) <= 1));
  for (const c of cands) { if (out.length >= max) break; if (!out.some(o => near(o, c))) out.push(c); }   // crossing / touching runs would merge into one dark blob
  return out;
}

// sign text after the k-th loop through the corridor (k >= 1): ~45 % of signs read something else, a different pick per loop (hash of tile, deck, k)
export function shiftedSign(text, tx, ty, deck, k) {
  if (!k) return text; const h = Math.sin(tx * 12.9898 + ty * 78.233 + deck * 3.7 + k * 97.13 + 500) * 43758.5453, u = h - Math.floor(h); if (u > 0.45) return text;
  const alt = ['NO EXIT', 'DECK ' + ((deck + k * 3) % 9 + 1), 'YOU WERE\nHERE', 'DO NOT\nRETURN', 'THIS WAY', 'SECTION ' + (10 + ((tx * 7 + ty * 3 + k) % 40)), text.split('\n').map(s => s.split('').reverse().join('')).join('\n')];
  const t = alt[Math.floor(u / 0.45 * alt.length) % alt.length]; return t === text ? alt[(alt.indexOf(t) + 1) % alt.length] : t;
}
