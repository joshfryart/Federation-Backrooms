// Level generation (pure data, no three.js): maze + rooms + props + Jiffy tubes, masked to the ship's hull.
// Used by the game (js/world.js re-exports it) and by standalone tools (ship map page, tests).
import { ROOMS, mulberry32 } from './data.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function generate(deck, seed, opts = {}) {
  const rnd = mulberry32(seed);
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  // opts.inside(u, v): hull outline for this deck (u port..starboard, v bow..stern, both -1..1); opts.weights: room-type weights
  const N = Math.min(6 + Math.floor(deck * 0.7), 11) + (opts.inside ? 2 : 0);
  const W = 2 * N + 1, H = 2 * N + 1;
  const grid = Array.from({ length: H }, () => new Uint8Array(W).fill(1));
  const room = Array.from({ length: H }, () => Array(W).fill(null));

  // maze (iterative DFS)
  const hull = (x, y) => !opts.inside || opts.inside((x - (W - 1) / 2) / ((W - 3) / 2), (y - (H - 1) / 2) / ((H - 3) / 2));
  // first maze cell inside the hull, scanning from the bow
  let s0 = [1, 1]; if (opts.inside) { s0 = null; for (let y = 1; y < H - 1 && !s0; y += 2) for (let x = 1; x < W - 1; x += 2) if (hull(x, y)) { s0 = [x, y]; break; } if (!s0) return generate(deck, seed, { ...opts, inside: null }); }
  const stack = [s0]; grid[s0[1]][s0[0]] = 0; let cells = 1;
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const opts = DIRS.map(([dx, dy]) => [cx + dx * 2, cy + dy * 2, dx, dy])
      .filter(([nx, ny]) => nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && grid[ny][nx] === 1 && hull(nx, ny));
    if (!opts.length) { stack.pop(); continue; }
    const [nx, ny, dx, dy] = opts[Math.floor(rnd() * opts.length)];
    grid[cy + dy][cx + dx] = 0; grid[ny][nx] = 0; stack.push([nx, ny]); cells++;
  }
  if (opts.inside && cells < 16) return generate(deck, seed, { ...opts, inside: null });   // hull section too small or split up at this size: fall back to a full deck
  // loops (braid some walls) so the maze isn't a pure tree
  let loops = Math.floor(N * 1.4);
  for (let tries = 0; tries < 300 && loops > 0; tries++) {
    const x = ri(1, W - 2), y = ri(1, H - 2);
    if (grid[y][x] !== 1) continue;
    if ((x % 2 === 0) === (y % 2 === 0)) continue; // only edge-walls between cells
    const horiz = x % 2 === 0;
    const a = horiz ? grid[y][x - 1] : grid[y - 1][x];
    const b = horiz ? grid[y][x + 1] : grid[y + 1][x];
    if (a === 0 && b === 0) { grid[y][x] = 0; loops--; }
  }

  // rooms
  const rooms = [];
  const typeBag = [];
  for (const [k, v] of Object.entries(ROOMS)) for (let i = 0; i < (opts.weights ? (opts.weights[k] || 0) : v.weight); i++) typeBag.push(k);
  const want = Math.floor(N * 0.9) + 1;
  let bridgeUsed = false, bigRooms = 0;
  for (let tries = 0; tries < 200 && rooms.length < want; tries++) {
    let type = typeBag[Math.floor(rnd() * typeBag.length)];
    if (type === 'bridge' && (bridgeUsed || (deck < 1 && !opts.weights))) continue;
    const def = ROOMS[type];
    // some rooms come in a large variant (galley, cargo bay, shuttlebay…): at most a couple per deck, and only where the deck is big enough
    const big = def.big && bigRooms < (N >= 9 ? 2 : 1) && W >= 15 && rnd() < def.bigP, sz = big ? def.big : def.size;
    const w = ri(sz[0], sz[1]) | 1, h = big ? ri(def.big[0] - 2, sz[1]) | 1 : ri(sz[0], sz[1]) | 1;
    if (w >= W - 2 || h >= H - 2) continue;
    const x0 = ri(1, W - 1 - w), y0 = ri(1, H - 1 - h);
    if (rooms.some(r => x0 < r.x + r.w + 1 && x0 + w + 1 > r.x && y0 < r.y + r.h + 1 && y0 + h + 1 > r.y)) continue;
    if (opts.inside) { let ok = true, touch = false; for (let y = y0; y < y0 + h && ok; y++) for (let x = x0; x < x0 + w; x++) { if (!hull(x, y)) { ok = false; break; } if (grid[y][x] === 0) touch = true; } if (!ok || !touch) continue; }   // whole room inside the hull and joined to the maze
    if (type === 'bridge') bridgeUsed = true; if (big) bigRooms++;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { grid[y][x] = 0; room[y][x] = type; }
    rooms.push({ type, x: x0, y: y0, w, h, big: !!big });
  }

  // props (mark blocked tiles = 2)
  const props = [];
  const put = (tx, ty, kind, extra = {}) => {
    grid[ty][tx] = 2; props.push({ kind, tx, ty, rot: extra.rot ?? Math.floor(rnd() * 4) * Math.PI / 2, ...extra });
  };
  for (const r of rooms) {
    const ix0 = r.x + 1, iy0 = r.y + 1, ix1 = r.x + r.w - 2, iy1 = r.y + r.h - 2;
    const cx = r.x + (r.w >> 1), cy = r.y + (r.h >> 1);
    const interior = [];
    if (r.w >= 5 || r.h >= 5) { for (let y = iy0; y <= iy1; y++) for (let x = ix0; x <= ix1; x++) interior.push([x, y]); }
    else interior.push([cx, cy]);
    switch (r.type) {
      case 'bridge': put(cx, cy, 'chair'); put(ix0, iy0, 'console'); put(ix1, iy0, 'console'); put(cx, iy0, 'viewscreen', { rot: 0 }); break;
      case 'engineering': put(cx, cy, 'warpcore'); put(ix0, iy0, 'console'); put(ix1, iy1, 'console'); break;
      case 'shuttlebay': put(cx, cy, 'shuttle'); put(ix0, iy0, 'crate'); put(ix1, iy1, 'crate'); break;
      case 'holodeck': put(cx, cy, 'holocube'); break;
      case 'transporter': put(cx, cy, 'pad'); break;
      case 'quarters': put(cx, cy, 'bunk'); break;
      case 'mess':
        if (r.big) { for (const [x, y] of interior) { if (y === iy0) { if ((x - ix0) % 2 === 0) put(x, y, 'replicator', { rot: 0 }); } else if ((x - ix0) % 2 === 0 && (y - iy0) % 2 === 0) put(x, y, 'table', { rot: 0 }); } }   // serving line along one wall, tables in rows
        else for (const [x, y] of interior) if ((x + y) % 2 === 0 || r.w < 5) put(x, y, 'table');
        break;
      case 'sickbay': for (const [x, y] of interior) if (rnd() < 0.7 || (x === cx && y === cy)) put(x, y, 'biobed'); break;
      case 'cargo': for (const [x, y] of interior) if (rnd() < 0.65) put(x, y, 'crate'); break;
      case 'arboretum': for (const [x, y] of interior) if (rnd() < 0.8) put(x, y, 'tree'); break;
      // rooms from the ship inventory: laid out from the existing prop kinds (a 3×3 room gets one centrepiece, bigger ones a pattern)
      case 'readyroom': put(cx, cy, 'table'); break;
      case 'brig': for (const [x, y] of interior) if ((x + y) % 2 === 0 && rnd() < 0.8) put(x, y, 'bunk'); break;
      case 'armory': put(cx, cy, 'crate'); break;
      case 'gym': for (const [x, y] of interior) if ((x + y) % 3 === 0) put(x, y, 'cart'); break;
      case 'lab': for (const [x, y] of interior) if ((x + y) % 2 === 0) put(x, y, (x + y) % 4 === 0 ? 'console' : 'table'); break;
      case 'laundry': put(cx, cy, 'crate'); break;
      case 'lounge': for (const [x, y] of interior) if ((x + y) % 2 === 0) put(x, y, (x * 3 + y) % 4 === 0 ? 'table' : 'lonechair'); break;
      case 'workshop': for (const [x, y] of interior) if ((x + y) % 2 === 0) put(x, y, (x + y) % 4 === 0 ? 'cart' : 'table'); break;
      case 'plant': for (const [x, y] of interior) if ((x + y) % 3 === 0) put(x, y, (x + y) % 2 ? 'console' : 'crate'); break;
      case 'morgue': for (const [x, y] of interior) if ((x + y) % 2 === 0) put(x, y, 'biobed'); break;
      case 'datacore': for (const [x, y] of interior) if ((x + y) % 2 === 0) put(x, y, 'console'); break;
      case 'stores': for (const [x, y] of interior) if (rnd() < 0.7) put(x, y, (x + y) % 3 === 0 ? 'cart' : 'crate'); break;
      case 'airlock': put(cx, cy, 'crate'); break;
    }
  }
  // connectivity safety: a tile put as prop must not isolate things. Verify below.

  // BFS helpers on generated grid
  const bfsFrom = (sx, sy) => {
    const d = new Int16Array(W * H).fill(-1);
    const q = [sx + sy * W]; d[q[0]] = 0;
    for (let i = 0; i < q.length; i++) {
      const x = q[i] % W, y = (q[i] / W) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || grid[ny][nx] !== 0 || d[nx + ny * W] >= 0) continue;
        d[nx + ny * W] = d[q[i]] + 1; q.push(nx + ny * W);
      }
    }
    return d;
  };
  const openNeighbors = (x, y) => DIRS.filter(([dx, dy]) => grid[y + dy]?.[x + dx] === 0).length;

  // Jiffy tubes: crawl-height maintenance ducts bored straight through solid bulkhead between two open tiles.
  // Only worth having when they are a real shortcut (or the only link). Movement inside is along the axis only.
  const tubeAxis = {}, tubeLevel = {}, tubes = [];
  {
    const wantT = Math.min(3, 1 + Math.floor(deck / 2)), cands = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (grid[y][x] !== 0 || (x === s0[0] && y === s0[1])) continue;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        let n = 0; while (n < 7 && grid[y + dy * (n + 1)]?.[x + dx * (n + 1)] === 1) n++;
        const ex = x + dx * (n + 1), ey = y + dy * (n + 1);
        if (n < 1 || n > 6 || ex > W - 2 || ey > H - 2 || grid[ey]?.[ex] !== 0) continue;
        cands.push({ x, y, dx, dy, n, ex, ey, s: n + rnd() * 1.5 });
      }
    }
    cands.sort((a, b) => b.s - a.s);
    for (const c of cands.slice(0, 80)) {
      if (tubes.length >= wantT) break;
      const tiles = []; for (let i = 1; i <= c.n; i++) tiles.push([c.x + c.dx * i, c.y + c.dy * i]);
      if (tiles.some(([tx, ty]) => !hull(tx, ty))) continue;                                                             // never tunnel through open space
      if (tiles.some(([tx, ty]) => [[0, 0], ...DIRS].some(([a, b]) => tubeAxis[(tx + a) + (ty + b) * W]))) continue;   // keep tubes apart
      const dAB = bfsFrom(c.x, c.y)[c.ex + c.ey * W]; if (dAB >= 0 && dAB < (c.n >= 2 ? 8 : 14)) continue;                // not a shortcut
      // longer tubes usually climb: lower run from mouth a, a ladder shaft, then an upper run that opens high in the wall at b
      const ladder = c.n >= 3 && rnd() < 0.65 ? 1 + Math.floor(rnd() * (c.n - 2)) : -1;
      tiles.forEach(([tx, ty], i) => { grid[ty][tx] = 0; room[ty][tx] = 'jefferies'; tubeAxis[tx + ty * W] = c.dx ? 'x' : 'y'; tubeLevel[tx + ty * W] = ladder < 0 || i < ladder ? 'lo' : i === ladder ? 'lad' : 'up'; });
      tubes.push({ tiles, a: [c.x, c.y], b: [c.ex, c.ey], axis: c.dx ? 'x' : 'y', ladder });
    }
  }

  // start tile: a normal maze cell near one corner
  let start = s0.slice();
  const d0 = bfsFrom(s0[0], s0[1]);
  // Any open tile unreachable (blocked off by props)? Turn into walls (neat) so nothing spawns there.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (grid[y][x] === 0 && d0[x + y * W] < 0) grid[y][x] = 1;
  const reach = d0;
  const openTiles = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (grid[y][x] === 0) openTiles.push([x, y]);
  const dist = (x, y) => reach[x + y * W];
  let maxD = 0; for (const [x, y] of openTiles) maxD = Math.max(maxD, dist(x, y));

  // exit: dead-end far away
  let exitCands = openTiles.filter(([x, y]) => dist(x, y) >= maxD * 0.6 && openNeighbors(x, y) === 1 && !room[y][x]);
  if (!exitCands.length) exitCands = openTiles.filter(([x, y]) => dist(x, y) >= maxD * 0.5 && openNeighbors(x, y) === 1);
  let exit;
  if (exitCands.length) exit = exitCands[Math.floor(rnd() * exitCands.length)];
  else exit = openTiles.slice().sort((a, b) => dist(b[0], b[1]) - dist(a[0], a[1]))[0];
  const exitBlocks = openNeighbors(exit[0], exit[1]) === 1;
  const exitDir = DIRS.find(([dx, dy]) => grid[exit[1] + dy]?.[exit[0] + dx] === 0) || [1, 0];
  if (exitBlocks) grid[exit[1]][exit[0]] = 2;

  const used = new Set([start.join(','), exit.join(',')]);
  for (const t of tubes) for (const [x, y] of t.tiles) used.add(x + ',' + y);   // nothing spawns in a tube by accident
  const free = () => openTiles.filter(([x, y]) => grid[y][x] === 0 && !used.has(x + ',' + y));
  const pickTile = (pred) => {
    const c = free().filter(pred);
    if (!c.length) return null;
    const t = c[Math.floor(rnd() * c.length)]; used.add(t.join(',')); return t;
  };

  // chips: spread out
  const chipCount = Math.min(2 + Math.floor(deck / 2), 5);
  const chips = [];
  for (let i = 0; i < chipCount; i++) {
    let t = null;
    for (let minGap = 9; minGap >= 0 && !t; minGap -= 3) {
      t = pickTile(([x, y]) => dist(x, y) > maxD * 0.25 && chips.every(c => Math.abs(c[0] - x) + Math.abs(c[1] - y) >= minGap));
    }
    if (t) chips.push(t);
  }

  // gorn spawn: far from start
  const gornSpawn = (pickTile(([x, y]) => dist(x, y) >= maxD * 0.55 && !(Math.abs(x - exit[0]) + Math.abs(y - exit[1]) < 4)) || exit).slice();
  used.delete(gornSpawn.join(','));

  const data = { deck, W, H, grid, room, rooms, props, start, exit, exitDir, exitBlocks, chips, gornSpawn, tubes, tubeAxis, tubeLevel,
           masked: !!opts.inside, inHull: hull,
           openTiles, maxD, dist: reach, rnd, used, pickTile, bfsFrom };
  furnish(data);
  return data;
}

// lonely furniture in dead ends: chairs facing walls, plants, carts, replicator alcoves (liminal set dressing).
// Part of generation so every consumer (game, deck-plans page, tests) sees the same props and blocked tiles.
function furnish(d) {
  const rnd = mulberry32(d.deck * 191 + 7);
  for (const [x, y] of d.openTiles) {
    if (d.grid[y][x] !== 0 || d.room[y][x] || d.used.has(x + ',' + y)) continue;
    if (Math.abs(x - d.exit[0]) + Math.abs(y - d.exit[1]) < 3 || (x === d.gornSpawn[0] && y === d.gornSpawn[1])) continue;
    const open = DIRS.filter(([a, b]) => d.grid[y + b]?.[x + a] === 0);
    if (open.length !== 1 || rnd() > 0.55) continue;
    const [ox, oy] = open[0];
    const kind = ['lonechair', 'plant', 'cart', 'replicator', 'lonechair'][Math.floor(rnd() * 5)];
    d.grid[y][x] = 2; d.used.add(x + ',' + y);
    d.props.push({ kind, tx: x, ty: y, rot: kind === 'lonechair' ? Math.atan2(ox, oy) : Math.atan2(-ox, -oy), liminal: true });
  }
}
