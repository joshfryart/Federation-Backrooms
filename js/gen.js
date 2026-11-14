// Level generation (pure data, no three.js): maze + rooms + props + Jiffy tubes, masked to the ship's hull.
// Used by the game (js/world.js re-exports it) and by standalone tools (ship map page, tests).
import { ROOMS, mulberry32 } from './data.js';
import { deckOptions, requirePlan } from './ships.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function generate(deck, seed, opts = {}) {
  const rnd = mulberry32(seed);
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  // opts.inside(u, v): hull outline for this deck (u port..starboard, v bow..stern, both -1..1); opts.weights: room-type weights
  const N = Math.min(6 + Math.floor(deck * 0.7), 11) + (opts.inside ? 2 : 0) + (opts.grow || 0);   // grow: a ship-level required room did not fit, so retry on a bigger deck
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
  // opts.require: room types that must exist on this deck (ship-level guarantees, requirePlan in js/ships.js). Placed first, wherever they fit and join the maze.
  const missing = [];
  for (const type of opts.require || []) {
    const def = ROOMS[type]; let placed = false;
    for (const [w, h] of [[ri(def.size[0], def.size[1]) | 1, ri(def.size[0], def.size[1]) | 1], [def.size[0] | 1, def.size[0] | 1]]) {
      const cands = [];
      for (let y0 = 1; y0 <= H - 1 - h; y0++) for (let x0 = 1; x0 <= W - 1 - w; x0++) {
        if (rooms.some(r => x0 < r.x + r.w + 1 && x0 + w + 1 > r.x && y0 < r.y + r.h + 1 && y0 + h + 1 > r.y)) continue;
        let ok = true, touch = false; for (let y = y0; y < y0 + h && ok; y++) for (let x = x0; x < x0 + w; x++) { if (!hull(x, y)) { ok = false; break; } if (grid[y][x] === 0) touch = true; }
        if (ok && touch) cands.push([x0, y0]);
      }
      if (!cands.length) continue;
      const [x0, y0] = cands[Math.floor(rnd() * cands.length)];
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { grid[y][x] = 0; room[y][x] = type; }
      rooms.push({ type, x: x0, y: y0, w, h, big: false, required: true }); if (type === 'bridge') bridgeUsed = true; placed = true; break;
    }
    if (!placed) missing.push(type);
  }
  if (missing.length && (opts.grow || 0) < 9) return generate(deck, seed, { ...opts, grow: (opts.grow || 0) + 1 });
  const nReq = rooms.length;
  for (let tries = 0; tries < 200 && rooms.length < want + nReq; tries++) {
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

  // props (mark blocked tiles = 2). Props draw from their own random stream, so layout changes here do not reshuffle tubes, chips or the exit.
  const prnd = mulberry32((seed ^ 0x5bd1e995) >>> 0);
  const props = [];
  const put = (tx, ty, kind, extra = {}) => {
    grid[ty][tx] = 2; const p = { kind, tx, ty, rot: extra.rot ?? Math.floor(prnd() * 4) * Math.PI / 2, ...extra }; props.push(p); return p;
  };
  const faceTo = (dx, dy) => Math.atan2(dx, dy);   // prop rot that turns its +z (front / operator side) toward grid direction (dx, dy)
  const inRect = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  const reserved = new Set();                        // tiles kept clear: in front of wall props, along a field generator's long sides
  const isStart = (x, y) => x === s0[0] && y === s0[1];
  const doorsOf = (r) => { const out = []; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (grid[y][x] === 0 && DIRS.some(([dx, dy]) => !inRect(r, x + dx, y + dy) && grid[y + dy]?.[x + dx] === 0)) out.push([x, y]); return out; };
  const reachIn = (r, from) => { const seen = new Set([from[0] + ',' + from[1]]), q = [from]; while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (!inRect(r, nx, ny) || grid[ny][nx] !== 0 || seen.has(k)) continue; seen.add(k); q.push([nx, ny]); } } return seen; };
  // block (x, y) only if every open tile of the room that a door reached before still reaches it (the room stays one walkable piece, doors stay clear)
  // and every prop of the room that had a reachable side still has one (someone can still walk up to use it)
  const safePut = (r, x, y, kind, extra = {}) => {
    if (grid[y]?.[x] !== 0 || isStart(x, y) || reserved.has(x + ',' + y)) return null;
    const doors = doorsOf(r); if (!doors.length || doors.some(([a, b]) => a === x && b === y)) return null;
    const side = (S, px, py) => DIRS.some(([dx, dy]) => S.has((px + dx) + ',' + (py + dy)));
    const before = reachIn(r, doors[0]), mine = props.filter(p => inRect(r, p.tx, p.ty) && side(before, p.tx, p.ty));
    grid[y][x] = 2; const after = reachIn(r, doors[0]); grid[y][x] = 0;
    return after.size === before.size - 1 && side(after, x, y) && mine.every(p => side(after, p.tx, p.ty)) ? put(x, y, kind, extra) : null;
  };
  // against the room wall, on its edge ring (props normally stand on interior tiles only): o.face 'in' (+z into the room, default) or 'out' (+z to the wall:
  // the operator stands between the prop and the wall, looking over it into the room); o.door: prefer two tiles from a doorway; o.corner: corners allowed
  const ringPut = (r, kind, o = {}) => {
    const doors = doorsOf(r); if (!doors.length) return null; const cands = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      if (x !== r.x && y !== r.y && x !== r.x + r.w - 1 && y !== r.y + r.h - 1) continue;
      const out = DIRS.filter(([dx, dy]) => !inRect(r, x + dx, y + dy)); if (out.some(([dx, dy]) => grid[y + dy]?.[x + dx] === 0)) continue;   // a doorway
      if (out.length > 1 && !o.corner) continue;
      const [ox, oy] = out.length > 1 ? [out[0][0] + out[1][0], out[0][1] + out[1][1]] : out[0], ix = -Math.sign(ox), iy = out.length > 1 ? 0 : -Math.sign(oy);   // corners face along one wall
      const dd = Math.min(...doors.map(([a, b]) => Math.abs(a - x) + Math.abs(b - y)));
      cands.push({ x, y, ix: out.length > 1 ? ix : -ox, iy: out.length > 1 ? iy : -oy, s: (o.door ? Math.abs(dd - 2) : dd <= 1 ? 3 : 0) + prnd() * 1.5 });
    }
    cands.sort((a, b) => a.s - b.s);
    for (const c of cands) {
      if (grid[c.y + c.iy]?.[c.x + c.ix] === undefined) continue;
      const rot = o.face === 'out' ? faceTo(-c.ix, -c.iy) : faceTo(c.ix, c.iy), p = safePut(r, c.x, c.y, kind, { rot, wall: true, ...(o.extra || {}) });
      if (p) { reserved.add((c.x + c.ix) + ',' + (c.y + c.iy)); p.front = [c.x + c.ix, c.y + c.iy]; return p; }
    }
    return null;
  };
  // an interior prop turned toward an open neighbour (the walkable side), preferring the direction (px, py)
  const faceOpen = (x, y, px = 0, py = 1) => { const o = DIRS.filter(([dx, dy]) => grid[y + dy]?.[x + dx] === 0).sort((a, b) => (b[0] * px + b[1] * py) - (a[0] * px + a[1] * py))[0]; return o ? faceTo(o[0], o[1]) : 0; };
  for (const r of rooms) {
    const ix0 = r.x + 1, iy0 = r.y + 1, ix1 = r.x + r.w - 2, iy1 = r.y + r.h - 2;
    const cx = r.x + (r.w >> 1), cy = r.y + (r.h >> 1);
    const interior = [];
    if (r.w >= 5 || r.h >= 5) { for (let y = iy0; y <= iy1; y++) for (let x = ix0; x <= ix1; x++) interior.push([x, y]); }
    else interior.push([cx, cy]);
    const freeIn = () => interior.filter(([x, y]) => grid[y][x] === 0 && !reserved.has(x + ',' + y));
    switch (r.type) {
      case 'bridge': put(cx, cy, 'chair', { rot: 0 }); put(ix0, iy0, 'helm', { rot: 0 }); put(ix1, iy0, 'console', { rot: 0 }); put(cx, iy0, 'viewscreen', { rot: 0 }); break;   // helm forward port (FLT-1), facing the viewscreen
      case 'engineering': {
        put(cx, cy, 'warpcore'); put(ix0, iy0, 'console'); put(ix1, iy1, 'console');
        put(cx, cy - 1, 'reactorstation', { rot: Math.PI }); reserved.add(cx + ',' + (cy - 2));   // ENG-3 beside the core, its back to it: the operator looks over the desk at the core
        // ENG-6 field generators (2.2 m long): away from the core, both ends of the long axis clear
        const gens = interior.length >= 4 ? ['fieldgen', 'fieldgen_damp'] : ['fieldgen'];
        for (const k of gens) {
          let done = false;
          for (const [x, y] of freeIn().sort(() => prnd() - 0.5)) {
            if (Math.abs(x - cx) + Math.abs(y - cy) < 2) continue;
            for (const [ax, ay] of prnd() < 0.5 ? [[1, 0], [0, 1]] : [[0, 1], [1, 0]]) {
              const ends = [[x + ax, y + ay], [x - ax, y - ay]]; if (!ends.every(([ex, ey]) => grid[ey]?.[ex] === 0)) continue;
              if (safePut(r, x, y, k, { rot: ax ? 0 : Math.PI / 2 })) { for (const [ex, ey] of ends) reserved.add(ex + ',' + ey); done = true; break; }
            }
            if (done) break;
          }
        }
        if (interior.length >= 15) { for (const k of ['desk', 'workbench']) { const t = freeIn().find(([x, y]) => Math.abs(x - cx) + Math.abs(y - cy) >= 2); if (t) safePut(r, t[0], t[1], k, { rot: faceOpen(t[0], t[1], cx - t[0], cy - t[1]) }); } }   // big layout: CE desk and a bench (asset-gaps 11.8)
        break; }
      case 'shuttlebay': put(cx, cy, 'shuttle'); put(ix0, iy0, 'crate'); put(ix1, iy1, 'crate'); ringPut(r, 'baycontrol', { door: true }); ringPut(r, 'workbench'); break;
      case 'holodeck': put(cx, cy, 'holocube'); ringPut(r, 'holodesk'); break;
      case 'transporter': put(cx, cy, 'pad'); ringPut(r, 'beampedestal', { face: 'out' }); ringPut(r, 'workbench'); break;   // OPS-1 with its back to the pad: the chief looks over it at the pad
      case 'quarters': put(cx, cy, 'bunk'); ringPut(r, 'desk'); break;
      case 'mess': {   // SVC-1 range against a wall, SVC-2 servery in front of it (staff side to the range), SVC-13 dishwasher on another wall
        const rg = ringPut(r, 'range');
        if (rg && interior.length > 1 && interior.some(([x, y]) => x === rg.front[0] && y === rg.front[1])) { reserved.delete(rg.front.join(',')); put(rg.front[0], rg.front[1], 'servery', { rot: rg.rot }); }
        else ringPut(r, 'servery');
        if (r.big) { for (const [x, y] of interior) { if (grid[y][x] !== 0) continue; if (y === iy0) { if ((x - ix0) % 2 === 0) safePut(r, x, y, 'replicator', { rot: 0 }); } else if ((x - ix0) % 2 === 0 && (y - iy0) % 2 === 0) safePut(r, x, y, 'table', { rot: 0 }); } }   // serving line along one wall, tables in rows
        else for (const [x, y] of interior) if (grid[y][x] === 0 && ((x + y) % 2 === 0 || r.w < 5)) safePut(r, x, y, 'table') || (interior.length === 1 && put(x, y, 'table'));
        if (interior.length > 1) ringPut(r, 'dishwasher');
        if (r.big) ringPut(r, 'wastebin', { corner: true });
        break; }
      case 'sickbay': {
        if (interior.length >= 9) {   // two biobeds beside the centre bed, the medical kit round them, one side of the centre left open
          const sg = prnd() < 0.5 ? 1 : -1;
          for (const [dx, dy, k] of [[0, 0, 'biobed'], [-1, 0, 'biobed'], [1, 0, 'biobed'], [0, -1, 'nursestation'], [-1, -1, 'surgical_table'], [1, -1, 'exam_couch'], [-1, 1, 'steriliser'], [1, 1, 'med_dispenser']]) {
            const x = cx + dx, y = cy + dy * sg; if (grid[y][x] !== 0) continue;
            put(x, y, k, k === 'nursestation' ? { rot: faceTo(0, sg) } : k === 'steriliser' || k === 'med_dispenser' ? { rot: faceTo(0, sg) } : k === 'surgical_table' || k === 'exam_couch' ? { rot: prnd() < 0.5 ? 0 : Math.PI } : {});
          }
          ringPut(r, 'infusion_stand', { corner: true });
        } else {
          for (const [x, y] of interior) if (prnd() < 0.7 || (x === cx && y === cy)) put(x, y, 'biobed');
          ringPut(r, 'nursestation');
          if (interior.length > 1) { ringPut(r, 'exam_couch'); ringPut(r, 'med_dispenser'); }
        }
        break; }
      case 'cargo': for (const [x, y] of interior) if (prnd() < 0.65) put(x, y, 'crate'); ringPut(r, 'console', { door: true }); ringPut(r, 'workbench', { door: true }); break;
      case 'arboretum': for (const [x, y] of interior) if (prnd() < 0.8) put(x, y, 'tree'); break;
      // rooms from the ship inventory: laid out from the existing prop kinds (a 3×3 room gets one centrepiece, bigger ones a pattern)
      case 'readyroom': put(cx, cy, 'desk'); break;
      case 'brig': for (const [x, y] of interior) if ((x + y) % 2 === 0 && prnd() < 0.8) put(x, y, 'cell'); ringPut(r, 'secdesk', { door: true }); break;   // SEC-1 by the entrance
      case 'armory': put(cx, cy, 'weaponrack'); ringPut(r, 'desk'); ringPut(r, 'workbench'); break;
      case 'gym': for (const [x, y] of interior) if ((x + y) % 3 === 0) put(x, y, (x * 2 + y) % 2 ? 'treadmill' : 'weightbench'); break;
      case 'lab': for (const [x, y] of interior) if ((x + y) % 2 === 0) put(x, y, (x + y) % 4 === 0 ? 'console' : 'labbench'); break;
      case 'laundry': put(cx, cy, 'washer'); break;
      case 'lounge': ringPut(r, 'bar'); for (const [x, y] of interior) if (grid[y][x] === 0 && (x + y) % 2 === 0) safePut(r, x, y, (x * 3 + y) % 4 === 0 ? 'table' : (x + 2 * y) % 3 === 0 ? 'lonechair' : 'sofa'); break;   // SVC-3 bar (+ back bar) on one wall
      case 'workshop': {
        for (const [x, y] of interior) if ((x + y) % 2 === 0) put(x, y, (x + y) % 4 === 0 ? 'lathe' : (x + y) % 8 === 2 ? 'fabricator' : 'workbench');
        if (!props.some(p => p.kind === 'fabricator' && inRect(r, p.tx, p.ty))) { const wb = props.find(p => p.kind === 'workbench' && inRect(r, p.tx, p.ty)); if (wb) wb.kind = 'fabricator'; else ringPut(r, 'fabricator'); }   // at least one ENG-7 per shop
        break; }
      case 'plant': { const PLANT = ['pumpskid', 'heatexch', 'scrubber', 'tank', 'console', 'pumpskid'];   // ENG-1/4/5 among the old vessels and consoles, on a diagonal grid
        let i = Math.floor(prnd() * 3); for (const [x, y] of interior) if ((x + y) % 2 === 0 || interior.length === 1) { const k = PLANT[i++ % PLANT.length]; put(x, y, k, k === 'heatexch' || k === 'pumpskid' ? { rot: prnd() < 0.5 ? 0 : Math.PI } : {}); }
        break; }
      case 'morgue': put(cx, cy, 'autopsy_table', { rot: prnd() < 0.5 ? 0 : Math.PI }); for (const [x, y] of interior) if (grid[y][x] === 0 && (x + y) % 2 === 0) put(x, y, 'drawers'); ringPut(r, 'drawers'); break;   // MED-7; drawers get a pulled-out tray in world.js
      case 'datacore': for (const [x, y] of interior) if ((x + y) % 2 === 0) put(x, y, (x + y) % 4 === 0 ? 'console' : 'servers'); break;
      case 'stores': for (const [x, y] of interior) if (prnd() < 0.7) put(x, y, (x + y) % 3 === 0 ? 'cart' : (x + y) % 2 ? 'shelving' : 'crate'); ringPut(r, 'desk'); break;
      case 'airlock': put(cx, cy, 'suitrack'); break;
      case 'washroom': put(cx, cy, 'sinkunit'); break;
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
  if (!exitCands.length) exitCands = openTiles.filter(([x, y]) => dist(x, y) >= maxD * 0.5 && openNeighbors(x, y) === 1 && !room[y][x]);   // the lift car never opens inside a room (wall props can leave dead-end pockets there)
  if (!exitCands.length) exitCands = openTiles.filter(([x, y]) => dist(x, y) >= maxD * 0.25 && openNeighbors(x, y) === 1 && !room[y][x]);
  let exit;
  if (exitCands.length) exit = exitCands[Math.floor(rnd() * exitCands.length)];
  else exit = openTiles.slice().sort((a, b) => (room[a[1]][a[0]] ? 1 : 0) - (room[b[1]][b[0]] ? 1 : 0) || dist(b[0], b[1]) - dist(a[0], a[1]))[0];
  if (opts.require && openNeighbors(exit[0], exit[1]) !== 1) {   // Systems Nominal: the tubelift car is the exit tile, so it must be a dead end
    const de = openTiles.filter(([x, y]) => openNeighbors(x, y) === 1 && !room[y][x] && !(x === start[0] && y === start[1])).sort((a, b) => dist(b[0], b[1]) - dist(a[0], a[1]));
    if (de.length) exit = de[Math.floor(rnd() * Math.min(3, de.length))];
    let best = null;
    if (!de.length) {   // no dead end at all: carve an alcove off the farthest corridor
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        if (grid[y][x] !== 1 || !hull(x, y)) continue;
        const nb = DIRS.filter(([dx, dy]) => grid[y + dy][x + dx] === 0); if (nb.length !== 1 || DIRS.some(([dx, dy]) => grid[y + dy]?.[x + dx] === 0 && (room[y + dy][x + dx] || (x + dx === start[0] && y + dy === start[1])))) continue;
        if (DIRS.some(([dx, dy]) => grid[y + dy]?.[x + dx] === 2)) continue;
        const dd = dist(x + nb[0][0], y + nb[0][1]); if (!best || dd > best.dd) best = { x, y, dd };
      }
      if (best) { grid[best.y][best.x] = 0; openTiles.push([best.x, best.y]); reach[best.x + best.y * W] = best.dd + 1; exit = [best.x, best.y]; }
    }
    if (!best && !de.length && (opts.grow || 0) < 9) return generate(deck, seed, { ...opts, grow: (opts.grow || 0) + 1 });   // too cramped for a lift alcove: bigger deck
  }
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
           masked: !!opts.inside, inHull: hull, missing,
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

// ---- whole ship (Systems Nominal): every deck's data at once ----
export const deckSeed = (seed, i) => seed * 131 + i * 7919 + 11;
// data for every deck of a ship, with the ship-level room guarantees applied (deterministic per ship + seed)
export function genShip(ship, seed = 0) { return Array.from({ length: ship.decks }, (_, i) => generate(i, deckSeed(seed, i), deckOptions(ship, i, { require: true }))); }
// where each room type landed: { roomType: [{ deck (0 = top, Deck N = deck + 1), deckNo, tx, ty }] } (tile coordinates of the room centre on that deck's grid)
export function shipPlan(ship, seed = 0, decks = genShip(ship, seed)) {
  const out = {};
  decks.forEach((d, i) => { for (const r of d.rooms) { const tx = r.x + (r.w >> 1), ty = r.y + (r.h >> 1); let live = false; for (let y = r.y; y < r.y + r.h && !live; y++) for (let x = r.x; x < r.x + r.w; x++) if (d.grid[y][x] !== 1) { live = true; break; } if (live) (out[r.type] ||= []).push({ deck: i, deckNo: i + 1, tx, ty }); } });
  return out;
}
