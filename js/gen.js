// Level generation (pure data, no three.js): maze + rooms + props + Jiffy tubes, masked to the ship's hull.
// Used by the game (js/world.js re-exports it) and by standalone tools (ship map page, tests).
import { ROOMS, mulberry32 } from './data.js';
import { deckOptions, requirePlan } from './ships.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const shuffleWith = (a, rnd) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
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
  // o.only 'corner': corners only; o.free: reserve nothing in front (small props reached from the side); o.along: long axis along the wall (+z turned a quarter);
  // o.ok(x, y): extra filter on the ring tile
  const ringPut = (r, kind, o = {}) => {
    const doors = doorsOf(r); if (!doors.length) return null; const cands = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      if (x !== r.x && y !== r.y && x !== r.x + r.w - 1 && y !== r.y + r.h - 1) continue;
      if (o.ok && !o.ok(x, y)) continue;
      const out = DIRS.filter(([dx, dy]) => !inRect(r, x + dx, y + dy)); if (out.some(([dx, dy]) => grid[y + dy]?.[x + dx] === 0)) continue;   // a doorway
      if (out.length > 1 && !o.corner && o.only !== 'corner') continue; if (out.length < 2 && o.only === 'corner') continue;
      const [ox, oy] = out.length > 1 ? [out[0][0] + out[1][0], out[0][1] + out[1][1]] : out[0], ix = -Math.sign(ox), iy = out.length > 1 ? 0 : -Math.sign(oy);   // corners face along one wall
      const dd = Math.min(...doors.map(([a, b]) => Math.abs(a - x) + Math.abs(b - y)));
      cands.push({ x, y, ix: out.length > 1 ? ix : -ox, iy: out.length > 1 ? iy : -oy, s: (o.door ? Math.abs(dd - 2) : dd <= 1 ? 3 : 0) + prnd() * 1.5 });
    }
    cands.sort((a, b) => a.s - b.s);
    for (const c of cands) {
      if (grid[c.y + c.iy]?.[c.x + c.ix] === undefined) continue;
      const rot = (o.face === 'out' ? faceTo(-c.ix, -c.iy) : faceTo(c.ix, c.iy)) + (o.along ? Math.PI / 2 : 0), p = safePut(r, c.x, c.y, kind, { rot, wall: true, ...(o.extra || {}) });
      if (p) { if (!o.free) reserved.add((c.x + c.ix) + ',' + (c.y + c.iy)); p.front = [c.x + c.ix, c.y + c.iy]; return p; }
    }
    return null;
  };
  // an interior prop turned toward an open neighbour (the walkable side), preferring the direction (px, py)
  const faceOpen = (x, y, px = 0, py = 1) => { const o = DIRS.filter(([dx, dy]) => grid[y + dy]?.[x + dx] === 0).sort((a, b) => (b[0] * px + b[1] * py) - (a[0] * px + a[1] * py))[0]; return o ? faceTo(o[0], o[1]) : 0; };
  // a prop on any free interior tile through safePut: o.near [x, y] closest first (and turned toward it), o.min [x, y, d] at least d steps from that tile, o.rot a fixed rotation
  const anyPut = (r, interior, kind, o = {}) => {
    const c = interior.filter(([x, y]) => grid[y][x] === 0 && !reserved.has(x + ',' + y) && (!o.min || Math.abs(x - o.min[0]) + Math.abs(y - o.min[1]) >= o.min[2]))
      .map(t => [t, o.near ? Math.abs(t[0] - o.near[0]) + Math.abs(t[1] - o.near[1]) + prnd() * 0.5 : prnd()]).sort((a, b) => a[1] - b[1]);
    for (const [[x, y]] of c) { const p = safePut(r, x, y, kind, { rot: o.rot ?? faceOpen(x, y, o.near ? o.near[0] - x : 0, o.near ? o.near[1] - y : 1), ...(o.extra || {}) }); if (p) return p; }
    return null;
  };
  const has = (r, kind) => props.some(p => p.kind === kind && inRect(r, p.tx, p.ty));
  // on a wall if the edge ring has room, else (rooms of more than one interior tile whose ring is all doorways) on a free interior tile
  const wallPut = (r, interior, kind, o = {}) => ringPut(r, kind, o) || (interior.length > 1 ? anyPut(r, interior, kind) : null);
  for (const r of rooms) {
    const ix0 = r.x + 1, iy0 = r.y + 1, ix1 = r.x + r.w - 2, iy1 = r.y + r.h - 2;
    const cx = r.x + (r.w >> 1), cy = r.y + (r.h >> 1);
    const interior = [];
    if (r.w >= 5 || r.h >= 5) { for (let y = iy0; y <= iy1; y++) for (let x = ix0; x <= ix1; x++) interior.push([x, y]); }
    else interior.push([cx, cy]);
    const freeIn = () => interior.filter(([x, y]) => grid[y][x] === 0 && !reserved.has(x + ',' + y));
    switch (r.type) {
      case 'bridge': put(cx, cy, 'chair', { rot: 0 }); put(ix1, iy0, 'console', { rot: 0 }); put(ix0, iy0, 'helm', { rot: 0 }); put(cx, iy0, 'viewscreen', { rot: 0 });   // helm forward port (FLT-1), facing the viewscreen; the console comes first so crew.js hosts alert on it and helm on the helm
        safePut(r, ix1, cy, 'navstation', { rot: 0 });                                                            // FLT-4 behind the forward starboard console
        for (const k of ['opsstation', 'commsstation', 'sensorstation']) ringPut(r, k, { ok: (x, y) => y !== r.y });   // OPS-2, OPS-3, SCI-2 on the side and aft walls (the forward wall is the viewscreen's)
        break;
      case 'engineering': {
        put(cx, cy, 'warpcore'); put(ix0, iy0, 'console'); put(ix1, iy1, 'console');
        put(cx, cy - 1, 'reactorstation', { rot: Math.PI }); reserved.add(cx + ',' + (cy - 2));   // ENG-3 beside the core, its back to it: the operator looks over the desk at the core
        // ENG-6 field generators (2.2 m long): away from the core, both ends of the long axis clear
        const gens = interior.length >= 4 ? ['fieldgen', 'fieldgen_damp'] : ['fieldgen'];
        for (const k of gens) {
          let done = false;
          for (const [x, y] of shuffleWith(freeIn(), prnd)) {   // Fisher-Yates: a random sort comparator gave a different order per JS engine (node vs Chromium built different decks from one seed)
            if (Math.abs(x - cx) + Math.abs(y - cy) < 2) continue;
            for (const [ax, ay] of prnd() < 0.5 ? [[1, 0], [0, 1]] : [[0, 1], [1, 0]]) {
              const ends = [[x + ax, y + ay], [x - ax, y - ay]]; if (!ends.every(([ex, ey]) => grid[ey]?.[ex] === 0)) continue;
              if (safePut(r, x, y, k, { rot: ax ? 0 : Math.PI / 2 })) { for (const [ex, ey] of ends) reserved.add(ex + ',' + ey); done = true; break; }
            }
            if (done) break;
          }
        }
        anyPut(r, interior, 'plottable', { near: [cx, cy - 1], min: [cx, cy, 1], rot: 0 }) || ringPut(r, 'plottable');   // ENG-15 on the open floor near the reactor station, else on a wall
        ringPut(r, 'injector_crate', { only: 'corner', free: true });                       // ENG-13 spare injector
        if (interior.length >= 15) { for (const k of ['desk', 'workbench']) { const t = freeIn().find(([x, y]) => Math.abs(x - cx) + Math.abs(y - cy) >= 2); if (t) safePut(r, t[0], t[1], k, { rot: faceOpen(t[0], t[1], cx - t[0], cy - t[1]) }); } }   // big layout: CE desk and a bench (asset-gaps 11.8)
        break; }
      case 'shuttlebay': {   // the shuttle sits on its cradle (FLT-3, world.js adds cradle and pad marking) with its long axis on x: both end tiles kept clear
        put(cx, cy, 'shuttle', { rot: prnd() < 0.5 ? 0 : Math.PI }); reserved.add((cx - 1) + ',' + cy); reserved.add((cx + 1) + ',' + cy);
        put(ix0, iy0, 'crate'); put(ix1, iy1, 'pallet_loaded'); ringPut(r, 'baycontrol', { door: true }); ringPut(r, 'workbench');
        anyPut(r, interior, 'workpod'); anyPut(r, interior, 'maint_stand', { near: [cx, cy] });              // FLT-8 work pod, FLT-9 maintenance stand
        ringPut(r, 'fuelbowser', { along: true }); ringPut(r, 'hoversled', { door: true, along: true });     // FLT-5, SVC-9 parked against the walls
        break; }
      case 'holodeck': put(cx, cy, 'holocube'); ringPut(r, 'holodesk'); break;
      case 'transporter': put(cx, cy, 'pad'); ringPut(r, 'beampedestal', { face: 'out' }); ringPut(r, 'workbench');
        for (let i = 0; i < 2; i++) ringPut(r, 'buffertank', { only: 'corner', free: true });   // OPS-6 pattern buffers x2 in the corners
        break;   // OPS-1 with its back to the pad: the chief looks over it at the pad
      case 'quarters': put(cx, cy, prnd() < 0.3 ? 'platform_bed' : 'bunk'); ringPut(r, 'desk'); break;   // CMD-3 in about a third of the cabins (gen has no billets: senior cabins are not known here)
      case 'mess': {   // SVC-1 range against a wall, SVC-2 servery in front of it (staff side to the range), SVC-13 dishwasher on another wall
        const rg = ringPut(r, 'range');
        if (rg && interior.length > 1 && interior.some(([x, y]) => x === rg.front[0] && y === rg.front[1])) { reserved.delete(rg.front.join(',')); put(rg.front[0], rg.front[1], 'servery', { rot: rg.rot }); }
        else ringPut(r, 'servery');
        if (r.big) { for (const [x, y] of interior) { if (grid[y][x] !== 0) continue; if (y === iy0) { if ((x - ix0) % 2 === 0) safePut(r, x, y, 'replicator', { rot: 0 }); } else if ((x - ix0) % 2 === 0 && (y - iy0) % 2 === 0) safePut(r, x, y, 'table', { rot: 0 }); } }   // serving line along one wall, tables in rows
        else for (const [x, y] of interior) if (grid[y][x] === 0 && ((x + y) % 2 === 0 || r.w < 5)) safePut(r, x, y, 'table') || (interior.length === 1 && put(x, y, 'table'));
        if (interior.length > 1) ringPut(r, 'dishwasher');
        if (r.big) ringPut(r, 'wastebin', { corner: true });
        if (r.big) { ringPut(r, 'range'); ringPut(r, 'servery'); ringPut(r, 'dishwasher'); }   // a proper kitchen in the galley hall: a second cooking line and dishwasher (ringPut keeps every front walkable)
        if (interior.length > 1) ringPut(r, 'feedstock_silo');                           // SVC-17
        if (r.big) ringPut(r, 'galley_trolley', { only: 'corner', free: true });         // SVC-14
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
      case 'cargo': for (const [x, y] of interior) if (prnd() < 0.65) { const u = prnd(); put(x, y, u < 0.45 ? 'crate' : u < 0.75 ? 'pallet_loaded' : 'pallet'); }   // SVC-6 pallets among the crates
        ringPut(r, 'console', { door: true }); ringPut(r, 'workbench', { door: true }); ringPut(r, 'hoversled', { door: true, along: true }); ringPut(r, 'cargo_pad');
        if (r.big) for (let i = 0; i < 4; i++) ringPut(r, 'shelving', { along: true, free: true });   // cargo racking along the walls of a big bay
        break;
      case 'arboretum': {   // SCI-1 grow beds in rows (long axis x, every other row a walkway), trees at the rim, SCI-6 dosing tanks on a wall
        let beds = 0; for (const [x, y] of interior) if ((y - iy0) % 2 === 0 && beds < 6 && prnd() < 0.9) { if (safePut(r, x, y, 'growbed', { rot: prnd() < 0.5 ? 0 : Math.PI })) beds++; } else if ((y - iy0) % 2 === 1 && prnd() < 0.3) safePut(r, x, y, 'tree');
        for (let i = 0; i < 2; i++) ringPut(r, 'tree', { only: 'corner', free: true }); if (!has(r, 'tree')) anyPut(r, interior, 'tree') || ringPut(r, 'tree');   // SYSTEMS.hydro is hosted on a tree
        wallPut(r, interior, 'nutrient_tanks'); if (prnd() < 0.5) ringPut(r, 'specimen_tank');
        break; }
      // rooms from the ship inventory: laid out from the existing prop kinds (a 3×3 room gets one centrepiece, bigger ones a pattern)
      case 'readyroom': put(cx, cy, 'briefing_table', { rot: r.w >= r.h ? 0 : Math.PI / 2 }); ringPut(r, 'desk'); break;   // CMD-2 at the centre, the desk on a wall
      case 'brig': for (const [x, y] of interior) if ((x + y) % 2 === 0 && prnd() < 0.8) put(x, y, prnd() < 0.5 ? 'cellfield' : 'cell');   // SEC-2 field cells among the barred ones
        ringPut(r, 'secdesk', { door: true }); ringPut(r, 'scan_arch', { door: true, along: true }); break;   // SEC-1 and the SEC-6 scanner arch by the entrance
      case 'armory': put(cx, cy, 'weaponrack'); wallPut(r, interior, 'issuecounter', { door: true }); ringPut(r, 'chargerack', { only: 'corner', free: true }); ringPut(r, 'desk'); ringPut(r, 'workbench'); break;   // SEC-7, SEC-3
      case 'gym': {   // SVC-11 sparring mat first (the 'mat' spot), then the machines (SVC-18) on a checkerboard; rack and dummy on the walls
        const G = ['sparring_set', 'treadmill', 'exercise_bike', 'rower', 'weightbench', 'mat']; let i = 0;
        for (const [x, y] of interior) if ((x + y) % 2 === (cx + cy) % 2 && safePut(r, x, y, G[i % G.length], { rot: prnd() < 0.5 ? 0 : Math.PI })) i++;
        wallPut(r, interior, 'dumbbell_rack'); for (const k of ['treadmill', 'exercise_bike']) if (!has(r, k)) ringPut(r, k, { along: k === 'treadmill' }); ringPut(r, 'grapple_dummy', { only: 'corner', free: true });
        break; }
      case 'lab': for (const [x, y] of interior) if (x === cx && y === cy) put(x, y, 'charttable', { rot: r.w >= r.h ? 0 : Math.PI / 2 }); else if ((x + y) % 2 === 0) put(x, y, (x + y) % 4 === 0 ? 'console' : 'labbench');   // SCI-3 chart table at the centre
        for (const k of ['spectrometer', 'sensorstation', 'fumehood']) wallPut(r, interior, k); ringPut(r, 'samplefridge', { only: 'corner', free: true }); ringPut(r, 'specimen_tank'); break;   // SCI-4, SCI-8, SCI-2, SCI-9, SCI-5 on the walls
      case 'laundry': put(cx, cy, 'washer'); wallPut(r, interior, 'dryer'); ringPut(r, 'folding_table', { corner: true, free: true }); ringPut(r, 'linen_cart', { only: 'corner', free: true }); break;   // SVC-15
      case 'atrium': { put(cx, cy, 'tree'); for (const [x, y] of interior) if (grid[y][x] === 0 && (x + y) % 3 === 0 && !(x === cx && y === cy)) put(x, y, (x + y) % 2 ? 'plant' : 'tree'); ringPut(r, 'sofa', { along: true }); ringPut(r, 'sofa', { along: true }); break; }   // garden court under a 5.6 m ceiling
      case 'lounge': ringPut(r, 'bar'); wallPut(r, interior, 'arcade');   // SVC-3 bar (+ back bar) on one wall, SVC-16 games
        if (interior.length >= 3) safePut(r, cx, cy, 'pool_table', { rot: r.w >= r.h ? 0 : Math.PI / 2 }); if (interior.length >= 5) anyPut(r, interior, 'card_table', { min: [cx, cy, 2] });
        for (const [x, y] of interior) if (grid[y][x] === 0 && (x + y) % 2 === 0) safePut(r, x, y, (x * 3 + y) % 4 === 0 ? 'table' : (x + 2 * y) % 3 === 0 ? 'lonechair' : 'sofa'); break;
      case 'workshop': { let lathes = 0;   // ENG-14: every other lathe a knee mill, a drill press on the wall
        for (const [x, y] of interior) if ((x + y) % 2 === 0) put(x, y, (x + y) % 4 === 0 ? (lathes++ % 2 ? 'knee_mill' : 'lathe') : (x + y) % 8 === 2 ? 'fabricator' : 'workbench');
        if (!props.some(p => p.kind === 'fabricator' && inRect(r, p.tx, p.ty))) { const wb = props.find(p => p.kind === 'workbench' && inRect(r, p.tx, p.ty)); if (wb) wb.kind = 'fabricator'; else ringPut(r, 'fabricator'); }   // at least one ENG-7 per shop
        wallPut(r, interior, 'drill_press'); break; }
      case 'plant': { const PLANT = ['pumpskid', 'heatexch', 'scrubber', 'tank', 'console', 'pumpskid'];   // ENG-1/4/5 among the old vessels and consoles, on a diagonal grid
        let i = Math.floor(prnd() * 3); for (const [x, y] of interior) if ((x + y) % 2 === 0 || interior.length === 1) { const k = PLANT[i++ % PLANT.length]; put(x, y, k, k === 'heatexch' || k === 'pumpskid' ? { rot: prnd() < 0.5 ? 0 : Math.PI } : {}); }
        break; }
      case 'morgue': put(cx, cy, 'autopsy_table', { rot: prnd() < 0.5 ? 0 : Math.PI }); for (const [x, y] of interior) if (grid[y][x] === 0 && (x + y) % 2 === 0) put(x, y, 'drawers'); ringPut(r, 'drawers'); break;   // MED-7; drawers get a pulled-out tray in world.js
      case 'datacore': { let n = 0; for (const [x, y] of interior) if ((x + y) % 2 === 0) put(x, y, (x + y) % 4 === 0 ? 'console' : n++ % 2 ? 'relayrack' : 'servers');   // OPS-4 relay racks among the stacks
        wallPut(r, interior, 'commsstation'); break; }
      case 'stores': for (const [x, y] of interior) if (prnd() < 0.7) put(x, y, (x + y) % 3 === 0 ? 'cart' : (x + y) % 2 ? 'shelving' : 'crate'); ringPut(r, 'desk');
        ringPut(r, 'reachin_cooler'); ringPut(r, 'feedstock_silo'); ringPut(r, 'injector_crate', { only: 'corner', free: true }); break;   // SVC-5 cooler (the walk-in door is a wall piece, world.js), SVC-17, ENG-13
      case 'airlock': put(cx, cy, 'suitrack'); ringPut(r, 'airlock_doors'); break;   // R-2 chamber against the hull wall, inner door into the room
      case 'washroom': put(cx, cy, 'sinkunit'); break;
    }
    // mezzanine: tall rooms (world.js TALL_H) get catwalk modules along the walls, 2.6 m up, reached by grapple or mantle from a neighbouring prop; own random stream
    if ((r.big || r.type === 'atrium') && (r.type === 'shuttlebay' || r.type === 'cargo' || r.type === 'engineering' || r.type === 'arboretum' || r.type === 'mess' || r.type === 'atrium')) {   // pillars hold up the tall ceiling: a lattice every third tile, only where the room stays walkable (safePut)
      for (const [x, y] of interior) if ((x - ix0) % 3 === 1 && (y - iy0) % 3 === 1 && grid[y][x] === 0 && !reserved.has(x + ',' + y)) safePut(r, x, y, 'pillar', { rot: 0 });
    }
    if ((r.big || r.type === 'atrium') && (r.type === 'shuttlebay' || r.type === 'cargo' || r.type === 'engineering' || r.type === 'arboretum' || r.type === 'mess' || r.type === 'atrium')) { const n = r.type === 'shuttlebay' ? 2 : 3; for (let i = 0; i < n; i++) ringPut(r, 'catwalk', { along: true, free: true }); }
  }
  // liminal (opts.liminal, madness mode from deck 3): two rooms of one type and size are furnished identically, so walking into the second feels like the first again.
  // Only plain rooms (no ship hardware): B's props are removed and A's re-placed through safePut, so reachability rules still hold.
  if (opts.liminal && deck >= 2) {
    const OK = new Set(['lounge', 'lab', 'gym', 'quarters', 'stores', 'laundry', 'cargo', 'workshop']);
    outer: for (const A of rooms) { if (!OK.has(A.type) || A.required) continue; for (const B of rooms) {
      if (B === A || B.type !== A.type || B.w !== A.w || B.h !== A.h || B.required) continue;
      const srcP = props.filter(p => inRect(A, p.tx, p.ty)); if (!srcP.length) continue;
      for (let i = props.length - 1; i >= 0; i--) if (inRect(B, props[i].tx, props[i].ty)) { grid[props[i].ty][props[i].tx] = 0; props.splice(i, 1); }
      for (const p of srcP) { const { kind, tx, ty, rot, ...rest } = p; delete rest.front; safePut(B, tx - A.x + B.x, ty - A.y + B.y, kind, { ...rest, rot }); }
      B.twin = A.type + '@' + A.x + ',' + A.y; break outer; } }
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

  // Jiffy tubes: crawl-height maintenance ducts bored through solid bulkhead between two open tiles: straight, or with one 90-degree bend (L).
  // Only worth having when they are a real shortcut (or the only link). Movement inside follows the tube (js/tube.js: tubeOpen).
  // Per tile: tubeAxis 'x' | 'y' (straight) or 'xy' (the bend tile; tubeBend[i] = [dir toward the previous tile, dir toward the next]).
  const tubeAxis = {}, tubeLevel = {}, tubeBend = {}, tubes = [];
  {
    const wantT = Math.min(3, 1 + Math.floor(deck / 2)), cands = [];
    const wall = (x, y) => grid[y]?.[x] === 1;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (grid[y][x] !== 0 || (x === s0[0] && y === s0[1])) continue;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        let n = 0; while (n < 7 && grid[y + dy * (n + 1)]?.[x + dx * (n + 1)] === 1) n++;
        const ex = x + dx * (n + 1), ey = y + dy * (n + 1);
        if (n < 1 || n > 6 || ex > W - 2 || ey > H - 2 || grid[ey]?.[ex] !== 0) continue;
        cands.push({ x, y, dx, dy, n, ex, ey, s: n + rnd() * 1.5, tiles: null });
      }
      // one bend (scored 3.5 below a straight bore of the same length so about 40 % of tubes bend): k1 wall tiles along d1 (the last is the corner), then k2 along the perpendicular d2, ending on an open tile
      for (const [dx, dy] of DIRS) for (const sg of [-1, 1]) {
        const ex2 = dy ? sg : 0, ey2 = dy ? 0 : sg;   // d2 is perpendicular to d1
        for (let k1 = 1; k1 <= 5 && wall(x + dx * k1, y + dy * k1); k1++) {
          const cx = x + dx * k1, cy = y + dy * k1;
          for (let k2 = 1; k1 + k2 <= 7 && wall(cx + ex2 * k2, cy + ey2 * k2); k2++) {
            const ex = cx + ex2 * (k2 + 1), ey = cy + ey2 * (k2 + 1);
            if (ex < 1 || ey < 1 || ex > W - 2 || ey > H - 2 || grid[ey][ex] !== 0) continue;
            const tiles = []; for (let i = 1; i <= k1; i++) tiles.push([x + dx * i, y + dy * i]); for (let i = 1; i <= k2; i++) tiles.push([cx + ex2 * i, cy + ey2 * i]);
            cands.push({ x, y, dx, dy, n: k1 + k2, ex, ey, s: k1 + k2 - 3.5 + rnd() * 1.5, tiles, corner: k1 - 1, d1: [dx, dy], d2: [ex2, ey2] });
          }
        }
      }
    }
    cands.sort((a, b) => b.s - a.s);
    for (const c of cands.slice(0, 120)) {
      if (tubes.length >= wantT) break;
      const bent = !!c.tiles, tiles = c.tiles || []; if (!bent) for (let i = 1; i <= c.n; i++) tiles.push([c.x + c.dx * i, c.y + c.dy * i]);
      if (tiles.some(([tx, ty]) => !hull(tx, ty))) continue;                                                             // never tunnel through open space
      if (tiles.some(([tx, ty]) => [[0, 0], ...DIRS].some(([a, b]) => tubeAxis[(tx + a) + (ty + b) * W]))) continue;   // keep tubes apart
      const dAB = bfsFrom(c.x, c.y)[c.ex + c.ey * W]; if (dAB >= 0 && dAB < (c.n >= 2 ? 8 : 14)) continue;                // not a shortcut
      // longer tubes usually climb: lower run from mouth a, a ladder shaft (never on the bend), then an upper run that opens high in the wall at b
      let ladder = -1;
      if (c.n >= 3 && rnd() < 0.65) { const ok = []; for (let i = 1; i <= c.n - 2; i++) if (i !== c.corner) ok.push(i); if (ok.length) ladder = ok[Math.floor(rnd() * ok.length)]; }
      tiles.forEach(([tx, ty], i) => {
        const id = tx + ty * W; grid[ty][tx] = 0; room[ty][tx] = 'jefferies'; tubeLevel[id] = ladder < 0 || i < ladder ? 'lo' : i === ladder ? 'lad' : 'up';
        if (bent && i === c.corner) { tubeAxis[id] = 'xy'; tubeBend[id] = [[-c.d1[0], -c.d1[1]], c.d2]; } else tubeAxis[id] = (i > c.corner && bent ? c.d2[0] : c.dx) ? 'x' : 'y';
      });
      tubes.push({ tiles, a: [c.x, c.y], b: [c.ex, c.ey], axis: bent ? 'xy' : c.dx ? 'x' : 'y', bend: bent ? c.corner : -1, ladder });
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

  const data = { deck, W, H, grid, room, rooms, props, start, exit, exitDir, exitBlocks, chips, gornSpawn, tubes, tubeAxis, tubeLevel, tubeBend,
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
