import * as THREE from 'three';
import { ROOMS, mulberry32 } from './data.js';
import { pbr, has as hasModel, instance } from './assets.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const TS = 2.5;      // tile size (m)
export const WH = 3.2;      // wall height (m)

// ------------------------------------------------------------------
// Procedural textures
// ------------------------------------------------------------------
const texCache = {};
function canvasTex(size, draw, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat, repeat);
  return t;
}
function noise(g, s, n, a) {
  for (let i = 0; i < n; i++) {
    const v = Math.random() * 255 | 0;
    g.fillStyle = `rgba(${v},${v},${v},${a})`;
    g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
}
// derive a normal map and roughness map from an albedo canvas (Sobel on luminance)
function derive(tex, strength = 2.0, rBase = 0.55, rVar = 0.4) {
  const src = tex.image, w = src.width, h = src.height, ctx = src.getContext('2d'), d = ctx.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h); for (let i = 0; i < w * h; i++) lum[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
  const nc = document.createElement('canvas'); nc.width = w; nc.height = h; const rc = document.createElement('canvas'); rc.width = w; rc.height = h;
  const nctx = nc.getContext('2d'), rctx = rc.getContext('2d'); const nimg = nctx.createImageData(w, h), rimg = rctx.createImageData(w, h);
  const L = (x, y) => lum[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (L(x + 1, y - 1) + 2 * L(x + 1, y) + L(x + 1, y + 1)) - (L(x - 1, y - 1) + 2 * L(x - 1, y) + L(x - 1, y + 1));
    const dy = (L(x - 1, y + 1) + 2 * L(x, y + 1) + L(x + 1, y + 1)) - (L(x - 1, y - 1) + 2 * L(x, y - 1) + L(x + 1, y - 1));
    let nx = -dx * strength, ny = dy * strength, nz = 1; const il = 1 / Math.hypot(nx, ny, nz); nx *= il; ny *= il; nz *= il;
    const i = (y * w + x) * 4; nimg.data[i] = (nx * 0.5 + 0.5) * 255; nimg.data[i + 1] = (ny * 0.5 + 0.5) * 255; nimg.data[i + 2] = (nz * 0.5 + 0.5) * 255; nimg.data[i + 3] = 255;
    const r = Math.min(1, rBase + (1 - lum[y * w + x]) * rVar) * 255; rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = r; rimg.data[i + 3] = 255;
  }
  nctx.putImageData(nimg, 0, 0); rctx.putImageData(rimg, 0, 0);
  const mk = (c) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
  return { normal: mk(nc), rough: mk(rc) };
}
export function textures() {
  if (texCache.wall) return texCache;
  texCache.wall = canvasTex(256, (g, s) => {
    g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, s, s);
    noise(g, s, 1500, 0.08);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3;
    g.strokeRect(4, 4, s - 8, s - 8);
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2;
    g.strokeRect(20, 20, s - 40, s * 0.5 - 24);
    g.strokeRect(20, s * 0.5 + 4, s - 40, s * 0.5 - 24);
    g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(0, s - 22, s, 22);   // skirting
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, 0, s, 6);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    for (const [x, y] of [[12, 12], [s - 12, 12], [12, s - 30], [s - 12, s - 30]]) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
  });
  texCache.floor = canvasTex(256, (g, s) => {
    g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, s, s);
    noise(g, s, 5000, 0.12);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
    g.strokeRect(0, 0, s, s);
    g.strokeStyle = 'rgba(0,0,0,0.07)';
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(i * s / 4, 0); g.lineTo(i * s / 4, s); g.moveTo(0, i * s / 4); g.lineTo(s, i * s / 4); g.stroke(); }
  });
  texCache.carpet = canvasTex(256, (g, s) => {
    g.fillStyle = '#cfcfcf'; g.fillRect(0, 0, s, s);
    noise(g, s, 9000, 0.16);
    g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 3;
    for (let i = 0; i <= 2; i++) for (let j = 0; j <= 2; j++) { const cx = i * s / 2, cy = j * s / 2; g.beginPath(); g.moveTo(cx, cy - 48); g.lineTo(cx + 48, cy); g.lineTo(cx, cy + 48); g.lineTo(cx - 48, cy); g.closePath(); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 2; g.strokeRect(10, 10, s - 20, s - 20);
  });
  texCache.holo = canvasTex(256, (g, s) => {
    g.fillStyle = '#111'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#e8b81c'; g.lineWidth = 3;
    g.strokeRect(1, 1, s - 2, s - 2);
    g.lineWidth = 1; g.strokeStyle = 'rgba(232,184,28,0.5)';
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(i * s / 4, 0); g.lineTo(i * s / 4, s); g.moveTo(0, i * s / 4); g.lineTo(s, i * s / 4); g.stroke(); }
  });
  texCache.ceil = canvasTex(256, (g, s) => {
    g.fillStyle = '#d0d0d0'; g.fillRect(0, 0, s, s);
    noise(g, s, 3000, 0.1);
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 3;
    g.strokeRect(0, 0, s, s); g.strokeRect(s / 2, 0, 0, s);
    g.beginPath(); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
  });
  texCache.aoGrad = (() => { const c = document.createElement('canvas'); c.width = 4; c.height = 64; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, 4, 64); return new THREE.CanvasTexture(c); })();
  texCache.stars = canvasTex(256, (g, s) => {
    g.fillStyle = '#02030a'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 120; i++) {
      const v = 120 + Math.random() * 135 | 0;
      g.fillStyle = `rgb(${v},${v},${v + 20})`;
      const r = Math.random() < 0.1 ? 2 : 1;
      g.fillRect(Math.random() * s, Math.random() * s, r, r);
    }
    const grd = g.createRadialGradient(s * 0.7, s * 0.65, 4, s * 0.7, s * 0.65, 70);
    grd.addColorStop(0, '#3b6fb0'); grd.addColorStop(0.6, '#1a3560'); grd.addColorStop(1, 'rgba(2,3,10,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
  });
  texCache.fur = canvasTex(64, (g, s) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 400; i++) { const v = 150 + Math.random() * 105 | 0; g.strokeStyle = `rgb(${v},${v},${v})`; g.beginPath(); const x = Math.random() * s, y = Math.random() * s; g.moveTo(x, y); g.lineTo(x + Math.random() * 4 - 2, y + Math.random() * 6 - 3); g.stroke(); }
  });
  texCache.scales = canvasTex(128, (g, s) => {
    g.fillStyle = '#b8b8b8'; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2;
    for (let y = 0; y < s; y += 12) for (let x = (y / 12 % 2) * 6; x < s; x += 12) { g.beginPath(); g.arc(x + 6, y + 6, 6, 0, Math.PI); g.stroke(); }
    noise(g, s, 400, 0.2);
  });
  texCache.d = { wall: derive(texCache.wall, 3.2, 0.78, 0.2), floor: derive(texCache.floor, 2.2, 0.8, 0.2), carpet: derive(texCache.carpet, 3.0, 0.9, 0.1), holo: derive(texCache.holo, 1.0, 0.2, 0.2) };
  texCache.deck = texCache.tile = texCache.floor; texCache.d.deck = texCache.d.tile = texCache.d.floor;
  // real CC0 PBR sets replace the procedural ones when they loaded (call textures() only after assets are ready)
  for (const k of ['wall', 'deck', 'carpet', 'tile', 'ceil']) { const p = pbr(k); if (p) { texCache[k] = p.c; texCache.d[k] = { normal: p.n, rough: p.r }; texCache.real = true; } }
  if (pbr('wall')) {   // bulkhead = real metal plating (tiled 2×) with starship panel seams, kick plate and header band drawn over it
    const p = pbr('wall');
    texCache.wall = canvasTex(1024, (g, s) => {
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) g.drawImage(p.c.image, i * s / 2, j * s / 2, s / 2, s / 2);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, 0, s, s);                                  // flatten plate contrast a little
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, s * 0.925, s, s * 0.075);                          // kick plate
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, s * 0.92, s, 5);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 0, s, s * 0.05); g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, s * 0.05, s, 4);   // header band
      g.fillStyle = 'rgba(0,0,0,0.42)'; g.fillRect(0, 0, 5, s); g.fillRect(s - 5, 0, 5, s); g.fillRect(s / 2 - 2, s * 0.05, 4, s * 0.87);   // vertical seams
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(5, 0, 3, s); g.fillRect(s / 2 + 2, s * 0.05, 3, s * 0.87);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, s * 0.6, s, 4); g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(0, s * 0.6 + 4, s, 2);   // chair-rail seam
      g.fillStyle = 'rgba(0,0,0,0.5)'; for (const x of [22, s / 2 - 20, s / 2 + 20, s - 22]) for (const y of [s * 0.08, s * 0.57, s * 0.64, s * 0.9]) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
      const gr = g.createLinearGradient(0, s * 0.75, 0, s); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(20,14,8,0.28)'); g.fillStyle = gr; g.fillRect(0, s * 0.75, s, s * 0.25);   // grime towards the floor
    });
    texCache.wall.anisotropy = 8;
    const n = p.n.clone(), r = p.r.clone(); n.repeat.set(2, 2); r.repeat.set(2, 2); n.needsUpdate = r.needsUpdate = true; texCache.d.wall = { normal: n, rough: r };
  }
  return texCache;
}

// ------------------------------------------------------------------
// Level generation (pure data)
// ------------------------------------------------------------------
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function generate(deck, seed) {
  const rnd = mulberry32(seed);
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const N = Math.min(6 + Math.floor(deck * 0.7), 11);
  const W = 2 * N + 1, H = 2 * N + 1;
  const grid = Array.from({ length: H }, () => new Uint8Array(W).fill(1));
  const room = Array.from({ length: H }, () => Array(W).fill(null));

  // maze (iterative DFS)
  const stack = [[1, 1]]; grid[1][1] = 0;
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const opts = DIRS.map(([dx, dy]) => [cx + dx * 2, cy + dy * 2, dx, dy])
      .filter(([nx, ny]) => nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && grid[ny][nx] === 1);
    if (!opts.length) { stack.pop(); continue; }
    const [nx, ny, dx, dy] = opts[Math.floor(rnd() * opts.length)];
    grid[cy + dy][cx + dx] = 0; grid[ny][nx] = 0; stack.push([nx, ny]);
  }
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
  for (const [k, v] of Object.entries(ROOMS)) for (let i = 0; i < v.weight; i++) typeBag.push(k);
  const want = Math.floor(N * 0.9) + 1;
  let bridgeUsed = false;
  for (let tries = 0; tries < 200 && rooms.length < want; tries++) {
    let type = typeBag[Math.floor(rnd() * typeBag.length)];
    if (type === 'bridge' && (bridgeUsed || deck < 1)) continue;
    const def = ROOMS[type];
    const w = ri(def.size[0], def.size[1]) | 1, h = ri(def.size[0], def.size[1]) | 1;
    if (w >= W - 2 || h >= H - 2) continue;
    const x0 = ri(1, W - 1 - w), y0 = ri(1, H - 1 - h);
    if (rooms.some(r => x0 < r.x + r.w + 1 && x0 + w + 1 > r.x && y0 < r.y + r.h + 1 && y0 + h + 1 > r.y)) continue;
    if (type === 'bridge') bridgeUsed = true;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { grid[y][x] = 0; room[y][x] = type; }
    rooms.push({ type, x: x0, y: y0, w, h });
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
      case 'mess': for (const [x, y] of interior) if ((x + y) % 2 === 0 || r.w < 5) put(x, y, 'table'); break;
      case 'sickbay': for (const [x, y] of interior) if (rnd() < 0.7 || (x === cx && y === cy)) put(x, y, 'biobed'); break;
      case 'cargo': for (const [x, y] of interior) if (rnd() < 0.65) put(x, y, 'crate'); break;
      case 'arboretum': for (const [x, y] of interior) if (rnd() < 0.8) put(x, y, 'tree'); break;
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

  // start tile: a normal maze cell near one corner
  let start = [1, 1];
  const d0 = bfsFrom(1, 1);
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

  return { deck, W, H, grid, room, rooms, props, start, exit, exitDir, exitBlocks, chips, gornSpawn,
           openTiles, maxD, dist: reach, rnd, used, pickTile, bfsFrom };
}

// ------------------------------------------------------------------
// Prop meshes
// ------------------------------------------------------------------
const M = {};
function screenTex(kind) {
  return canvasTex(256, (g, s) => {
    g.fillStyle = '#04070c'; g.fillRect(0, 0, s, s);
    const cols = kind === 'med' ? ['#58f0a0', '#2aa870', '#e8f8f0'] : kind === 'eng' ? ['#ffa040', '#ff5a30', '#ffd890'] : ['#58b8ff', '#f0a050', '#c890f0'];
    const rr = (x, y, w, h, r, c) => { g.fillStyle = c; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
    rr(8, 8, 60, 96, [28, 0, 0, 28], cols[0]); rr(74, 8, 174, 18, 9, cols[1]); rr(8, 110, 60, 138, [28, 0, 0, 28], cols[2]); rr(74, 230, 174, 18, 9, cols[0]);
    for (let i = 0; i < 6; i++) rr(74 + (i % 3) * 60, 36 + Math.floor(i / 3) * 30, 52, 22, 11, cols[(i * 7) % 3]);
    g.fillStyle = cols[0]; g.font = 'bold 13px monospace';
    for (let i = 0; i < 7; i++) g.fillText(String(Math.floor(Math.random() * 9e5)).padStart(6, '0') + '  ' + (Math.random() * 99).toFixed(1), 80, 118 + i * 15);
    g.strokeStyle = cols[2]; g.lineWidth = 2; g.beginPath();
    for (let x = 0; x < 60; x++) { const y = kind === 'med' ? ((x % 20 === 8) ? -26 : (x % 20 === 10) ? 14 : 0) : Math.sin(x * 0.5) * 9 * Math.sin(x * 0.13); g.lineTo(182 + x, 150 + y); } g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < s; y += 3) g.fillRect(0, y, s, 1);
  });
}
function mats() {
  if (M.metal) return M;
  const T = textures(), w = T.d.wall, dk = T.d.deck, cp = T.d.carpet;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  M.metal = std({ color: 0x8f959e, metalness: 0.85, roughness: 0.42, normalMap: dk.normal, normalScale: new THREE.Vector2(0.25, 0.25) });
  M.panel = std({ color: 0xb9bec6, metalness: 0.5, roughness: 0.5, normalMap: w.normal, roughnessMap: w.rough });
  M.dark = std({ color: 0x23262d, metalness: 0.6, roughness: 0.5 });
  M.fabric = std({ color: 0x7a2f2f, roughness: 0.95, normalMap: cp.normal, normalScale: new THREE.Vector2(1.5, 1.5) });
  M.sheet = std({ color: 0x9aa7b8, roughness: 0.95, normalMap: cp.normal });
  M.white = std({ color: 0xdfe6ea, roughness: 0.32, metalness: 0.05 });
  M.wood = std({ color: 0x6b4a32, roughness: 0.6 });
  M.crate = std({ color: 0x6a6f5a, roughness: 0.7, metalness: 0.3, normalMap: w.normal });
  M.crate2 = std({ color: 0x8a6a3a, roughness: 0.75, metalness: 0.2, normalMap: w.normal });
  M.leaf = std({ color: 0x2f7a38, roughness: 0.8 });
  M.trunk = std({ color: 0x5a3f2a, roughness: 0.9 });
  M.glass = std({ color: 0x9fd0ff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.25 });
  M.rubber = std({ color: 0x0c0c0e, roughness: 0.9 });
  M.hazard = std({ color: 0xd8a818, roughness: 0.6, metalness: 0.2 });
  M.screenB = new THREE.MeshBasicMaterial({ map: screenTex('ops'), color: new THREE.Color(1.5, 1.5, 1.5) });
  M.screenO = new THREE.MeshBasicMaterial({ map: screenTex('eng'), color: new THREE.Color(1.5, 1.5, 1.5) });
  M.screenG = new THREE.MeshBasicMaterial({ map: screenTex('med'), color: new THREE.Color(1.5, 1.5, 1.5) });
  M.glowB = new THREE.MeshBasicMaterial({ color: 0x4ac0ff }); M.glowO = new THREE.MeshBasicMaterial({ color: 0xffa040 });
  M.core = new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.85 });
  M.holo = new THREE.MeshBasicMaterial({ color: 0xffcc33, wireframe: true });
  M.pad = new THREE.MeshBasicMaterial({ color: 0x6fd0ff, transparent: true, opacity: 0.6 });
  M.view = new THREE.MeshBasicMaterial({ map: textures().stars });
  M.blinkR = new THREE.MeshBasicMaterial({ color: 0xff3020 });
  M.blinkG = new THREE.MeshBasicMaterial({ color: 0x30ff60 });
  M.pipe = std({ color: 0x70757d, metalness: 0.9, roughness: 0.35 });
  return M;
}
const geoCache = {};
function rbox(w, h, d, mat, x = 0, y = 0, z = 0, r = 0.04) {
  const k = `${w},${h},${d},${r}`; const geo = geoCache[k] || (geoCache[k] = new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.01, h / 2.01, d / 2.01)));
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y + h / 2, z); return m;
}
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y + h / 2, z); return m;
}
function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 16) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y + h / 2, z); return m; }
// CC0 scanned prop (Poly Haven) scaled to `height`; null if the file did not load
function model(name, height, x = 0, z = 0, ry = 0, y = 0) {
  if (!hasModel(name)) return null; const i = instance(name, { height }); i.root.position.set(x, y, z); i.root.rotation.y = ry;
  i.root.traverse(o => { if (o.isMesh) { o.frustumCulled = true; o.material.envMapIntensity = 0.6; } }); return i.root;
}
export function buildProp(kind) {
  const m = mats(); const g = new THREE.Group(); const R = Math.random;
  switch (kind) {
    case 'console': {
      g.add(rbox(1.7, 0.86, 0.75, m.dark, 0, 0, 0, 0.06)); g.add(rbox(1.78, 0.06, 0.82, m.metal, 0, 0.86, 0, 0.02));
      const desk = rbox(1.6, 0.04, 0.6, m.screenB, 0, 0.93, 0.06, 0.01); desk.rotation.x = 0.22; g.add(desk);
      const back = rbox(1.6, 0.62, 0.08, m.dark, 0, 0.95, -0.33, 0.03); back.rotation.x = -0.12; g.add(back);
      const scr = box(1.46, 0.5, 0.01, m.screenO, 0, 1.01, -0.275); scr.rotation.x = -0.12; g.add(scr);
      g.add(box(0.07, 0.03, 0.07, m.blinkR, -0.72, 0.93, 0.33)); g.add(box(0.07, 0.03, 0.07, m.blinkG, -0.6, 0.93, 0.33));
      g.add(box(1.5, 0.03, 0.02, m.glowB, 0, 0.1, 0.38)); g.add(rbox(1.3, 0.5, 0.02, m.panel, 0, 0.22, 0.375, 0.01)); break; }
    case 'chair': {   // command chair on a swivel pedestal
      g.add(cyl(0.34, 0.4, 0.06, m.metal)); g.add(cyl(0.07, 0.09, 0.36, m.dark, 0, 0.06, 0));
      g.add(rbox(0.72, 0.16, 0.7, m.fabric, 0, 0.42, 0, 0.07)); const bk = rbox(0.7, 0.95, 0.16, m.fabric, 0, 0.5, 0.33, 0.07); bk.rotation.x = 0.12; g.add(bk);
      g.add(rbox(0.5, 0.22, 0.12, m.dark, 0, 1.4, 0.4, 0.05));
      for (const sx of [-1, 1]) { g.add(rbox(0.12, 0.28, 0.66, m.dark, sx * 0.43, 0.46, 0.0, 0.05)); g.add(rbox(0.13, 0.03, 0.3, m.screenB, sx * 0.43, 0.745, -0.14, 0.01)); }
      break; }
    case 'viewscreen': {
      g.add(rbox(2.5, 1.56, 0.12, m.dark, 0, 0.72, 0, 0.05)); g.add(box(2.3, 1.36, 0.02, m.view, 0, 0.82, 0.062));
      g.add(rbox(2.6, 0.72, 0.5, m.dark, 0, 0, 0, 0.06)); g.add(box(2.2, 0.03, 0.02, m.glowB, 0, 0.6, 0.26)); g.add(rbox(2.2, 0.3, 0.02, m.screenB, 0, 0.2, 0.255, 0.01)); break; }
    case 'warpcore': {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, WH, 20), m.core); c.position.y = WH / 2; c.name = 'core'; g.add(c);
      g.add(cyl(0.75, 0.9, 0.42, m.metal, 0, 0, 0, 24)); g.add(cyl(0.9, 0.75, 0.36, m.metal, 0, WH - 0.36, 0, 24)); g.add(cyl(0.56, 0.56, 0.1, m.hazard, 0, 0.42, 0, 24));
      for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.045, 8, 28), m.metal); r.rotation.x = Math.PI / 2; r.position.y = 0.72 + i * 0.4; g.add(r); }
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.78; g.add(cyl(0.05, 0.05, WH, m.pipe, Math.cos(a) * 0.72, 0, Math.sin(a) * 0.72, 8)); g.add(rbox(0.16, 0.5, 0.16, m.dark, Math.cos(a) * 0.72, 1.3, Math.sin(a) * 0.72, 0.03)); }
      break; }
    case 'shuttle': {
      const hull = rbox(2.1, 0.95, 1.5, m.white, 0, 0.28, 0, 0.22); g.add(hull);
      const nose = rbox(0.9, 0.62, 1.3, m.white, 1.2, 0.28, 0, 0.25); g.add(nose);
      const win = rbox(0.5, 0.3, 1.1, m.glass, 1.32, 0.66, 0, 0.1); win.material = m.dark; g.add(win);
      for (const sz of [-1, 1]) { const nac = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 1.5, 6, 12), m.metal); nac.rotation.z = Math.PI / 2; nac.position.set(-0.25, 0.3, sz * 0.92); g.add(nac); g.add(box(0.5, 0.06, 0.02, m.glowB, -0.25, 0.27, sz * 1.085)); g.add(rbox(0.5, 0.08, 0.3, m.metal, -0.2, 0.26, sz * 0.78, 0.02)); }
      g.add(box(1.2, 0.05, 0.02, m.hazard, -0.1, 0.72, 0.755)); g.add(rbox(0.7, 0.72, 0.02, m.panel, -0.6, 0.36, 0.752, 0.01)); break; }
    case 'holocube': {
      const c = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), m.holo); c.position.y = 1.0; c.name = 'spin'; g.add(c); g.add(cyl(0.22, 0.3, 0.3, m.dark)); g.add(cyl(0.18, 0.18, 0.02, m.glowO, 0, 0.3, 0)); break; }
    case 'pad': {
      g.add(cyl(1.0, 1.08, 0.14, m.dark, 0, 0, 0, 28)); g.add(cyl(0.98, 0.98, 0.02, m.metal, 0, 0.14, 0, 28));
      const p = cyl(0.7, 0.7, 0.03, m.pad, 0, 0.155, 0, 28); g.add(p); const top = cyl(0.7, 0.7, 0.05, m.pad, 0, WH - 0.2, 0, 28); g.add(top); g.add(cyl(0.9, 0.8, 0.14, m.dark, 0, WH - 0.14, 0, 28));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.03, 6, 32), m.glowB); ring.rotation.x = Math.PI / 2; ring.position.y = 0.17; g.add(ring); break; }
    case 'bunk': {
      g.add(rbox(1.9, 0.34, 0.95, m.dark, 0, 0, 0, 0.05)); g.add(rbox(1.84, 0.16, 0.88, m.sheet, 0, 0.34, 0, 0.07)); g.add(rbox(0.42, 0.12, 0.6, m.white, -0.66, 0.48, 0, 0.06));
      const blanket = rbox(1.1, 0.06, 0.92, m.fabric, 0.36, 0.47, 0, 0.03); g.add(blanket);
      g.add(rbox(1.9, 0.9, 0.08, m.panel, 0, 0.34, -0.47, 0.03)); g.add(box(0.5, 0.03, 0.02, m.glowO, -0.6, 1.1, -0.42));
      g.add(model('ph_utilbox', 1.15, 0.6, 0.85, Math.PI) || rbox(0.6, 0.9, 0.5, m.metal, 0.75, 0, 0.8)); break; }
    case 'table': {
      g.add(rbox(1.5, 0.06, 1.0, m.white, 0, 0.72, 0, 0.03)); g.add(cyl(0.06, 0.06, 0.7, m.metal, 0, 0.02, 0)); g.add(cyl(0.36, 0.4, 0.03, m.metal));
      for (const sz of [-1, 1]) { g.add(cyl(0.2, 0.2, 0.06, m.fabric, 0, 0.42, sz * 0.95)); g.add(cyl(0.04, 0.04, 0.42, m.metal, 0, 0, sz * 0.95)); g.add(cyl(0.2, 0.22, 0.02, m.metal, 0, 0, sz * 0.95)); }
      const tray = rbox(0.4, 0.02, 0.28, m.metal, 0.3, 0.78, 0.1, 0.008); tray.rotation.y = 0.3; g.add(tray); g.add(cyl(0.035, 0.03, 0.1, m.glass, 0.34, 0.8, 0.08, 10)); g.add(cyl(0.035, 0.03, 0.1, m.white, -0.35, 0.78, -0.2, 10)); break; }
    case 'biobed': {
      g.add(rbox(0.7, 0.5, 1.5, m.metal, 0, 0, 0, 0.1)); g.add(rbox(0.95, 0.1, 2.0, m.white, 0, 0.5, 0, 0.04)); g.add(rbox(0.85, 0.08, 1.85, m.sheet, 0, 0.6, 0.02, 0.04)); g.add(rbox(0.5, 0.08, 0.34, m.white, 0, 0.67, -0.72, 0.04));
      const arch = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.05, 8, 20, Math.PI), m.white); arch.position.set(0, 0.6, 0.1); g.add(arch);
      g.add(rbox(0.12, 1.5, 0.1, m.dark, 0, 0, -1.02, 0.03)); const mon = rbox(0.9, 0.5, 0.06, m.dark, 0, 1.25, -1.0, 0.03); mon.rotation.x = 0.15; g.add(mon);
      const scr = box(0.82, 0.42, 0.01, m.screenG, 0, 1.29, -0.962); scr.rotation.x = 0.15; g.add(scr); break; }
    case 'crate': {
      const roll = R();
      if (roll < 0.55 && hasModel('ph_crate')) {   // stacked ammunition-style cargo cases
        const n = 2 + Math.floor(R() * 3); let y = 0;
        for (let i = 0; i < n; i++) { const c = model('ph_crate', 0.34, (R() - 0.5) * 0.12, (R() - 0.5) * 0.12, (R() - 0.5) * 0.25 + (R() < 0.2 ? Math.PI / 2 : 0), y); g.add(c); y += 0.335; }
        if (R() < 0.6) g.add(model('ph_barrel', 0.95, 0.75, 0.75, R() * 6));
      } else if (roll < 0.8 && hasModel('ph_barrel')) {
        for (const [x, z] of [[-0.4, -0.35], [0.42, -0.3], [0.0, 0.42]]) if (R() < 0.85) g.add(model('ph_barrel', 0.95, x, z, R() * 6));
        g.add(box(1.7, 0.08, 1.7, m.crate2, 0, -0.02, 0));
      } else {
        const mt = R() < 0.5 ? m.crate : m.crate2; const h = 0.8 + R() * 0.9;
        g.add(rbox(1.5, h, 1.5, mt, 0, 0, 0, 0.05)); if (R() < 0.5) g.add(rbox(0.8, 0.6, 0.8, m.crate2, 0.1, h, 0.1, 0.04));
        g.add(box(1.53, 0.1, 1.53, m.dark, 0, h * 0.5, 0)); g.add(box(0.5, 0.2, 0.02, m.hazard, 0, h * 0.7, 0.756));
      }
      break; }
    case 'tree': {
      g.add(rbox(1.2, 0.4, 1.2, m.dark, 0, 0, 0, 0.06)); g.add(box(1.05, 0.02, 1.05, m.trunk, 0, 0.4, 0));
      const t = model('ph_plant', 2.6, 0, 0, R() * 6, 0.1);
      if (t) g.add(t); else { g.add(box(0.25, 1.5, 0.25, m.trunk)); for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6 + R() * 0.3, 1), m.leaf); l.position.set((R() - 0.5) * 0.7, 1.7 + R() * 0.8, (R() - 0.5) * 0.7); g.add(l); } }
      break; }
    case 'lonechair': { const c = model('ph_armchair', 0.95, 0, 0, Math.PI); if (c) g.add(c); else { g.add(box(0.5, 0.08, 0.5, m.fabric, 0, 0.45, 0)); g.add(box(0.5, 0.55, 0.08, m.fabric, 0, 0.55, 0.23)); g.add(box(0.06, 0.4, 0.06, m.metal, 0, 0.08, 0)); } break; }
    case 'plant': { const p = model('ph_plant', 1.25, 0, 0, R() * 6); if (p) g.add(p); else { g.add(box(0.5, 0.45, 0.5, m.dark)); for (let i = 0; i < 7; i++) { const l = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.8, 5), m.leaf); l.position.set((R() - 0.5) * 0.2, 0.9, (R() - 0.5) * 0.2); l.rotation.set((R() - 0.5) * 1.2, 0, (R() - 0.5) * 1.2); g.add(l); } } break; }
    case 'cart':
      g.add(rbox(0.9, 0.04, 0.55, m.metal, 0, 0.33, 0, 0.015)); g.add(rbox(0.9, 0.04, 0.55, m.metal, 0, 0.8, 0, 0.015));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { g.add(cyl(0.018, 0.018, 0.8, m.pipe, sx * 0.42, 0.06, sz * 0.25, 8)); g.add(cyl(0.045, 0.045, 0.03, m.rubber, sx * 0.42, 0.0, sz * 0.25, 10)).rotation.z = Math.PI / 2; }
      g.add(rbox(0.3, 0.2, 0.3, m.crate2, 0.15, 0.37, 0, 0.02)); g.add(rbox(0.22, 0.14, 0.3, m.white, -0.2, 0.84, 0, 0.03)); g.add(cyl(0.04, 0.04, 0.16, m.glowB, 0.2, 0.84, 0.1, 10)); break;
    case 'replicator':
      g.add(rbox(1.5, 2.1, 0.42, m.panel, 0, 0, 0.4, 0.05)); g.add(rbox(0.9, 0.62, 0.3, m.dark, 0, 0.85, 0.3, 0.06)); g.add(box(0.8, 0.5, 0.02, m.glowO, 0, 0.9, 0.42)).material = m.screenO;
      g.add(cyl(0.3, 0.3, 0.02, m.glowO, 0, 0.86, 0.26, 20)); g.add(rbox(0.3, 0.22, 0.03, m.dark, 0.5, 1.6, 0.18, 0.02)); g.add(box(0.25, 0.17, 0.01, m.screenB, 0.5, 1.625, 0.163)); g.add(box(1.3, 0.03, 0.02, m.glowB, 0, 1.95, 0.185)); break;
    default: g.add(rbox(0.8, 0.8, 0.8, m.metal));
  }
  return g;
}

export function buildLift(accent) {
  const g = new THREE.Group();
  const frame = new THREE.MeshLambertMaterial({ color: 0x3a3f48 });
  const door = new THREE.MeshLambertMaterial({ color: 0x9aa0aa });
  g.add(box(2.4, 0.25, 0.3, frame, 0, 2.55, 0));
  g.add(box(0.25, 2.8, 0.3, frame, -1.1, 0, 0)); g.add(box(0.25, 2.8, 0.3, frame, 1.1, 0, 0));
  const l = box(0.95, 2.5, 0.12, door, -0.5, 0, 0); const r = box(0.95, 2.5, 0.12, door, 0.5, 0, 0);
  l.name = 'doorL'; r.name = 'doorR'; g.add(l, r);
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.05), new THREE.MeshBasicMaterial({ color: 0xff3030 }));
  light.position.set(0, 2.85, 0.16); light.name = 'status'; g.add(light);
  const txt = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), new THREE.MeshBasicMaterial({ color: accent }));
  txt.position.set(0, 2.3, 0.16); g.add(txt);
  return g;
}

// ------------------------------------------------------------------
// Scene construction from level data
// ------------------------------------------------------------------
export class World {
  constructor(data, ship) {
    this.d = data; this.ship = ship;
    this.W = data.W; this.H = data.H; this.grid = data.grid;
    this.group = new THREE.Group();
    this.flickers = [];
    this.spin = [];
    this.explored = new Uint8Array(this.W * this.H);
    this.wallFaces = []; this.sparkers = []; this.steamers = []; this.alertAmt = 0;
    this.panels = []; this.powerAmt = 1; this.powerTarget = 1; this.flickerF = 1; this.drips = [];
    this.flooded = !!data.flooded; this.cones = new THREE.Group();
    this._furnish();
    this._build();
    this._details();
    this._liminal();
  }

  ceilAt(x, y) {
    if (this.d.room[y]?.[x]) return WH;
    const h = Math.sin((x >> 1) * 12.9898 + (y >> 1) * 78.233 + this.d.deck * 3.1) * 43758.5453; const f = h - Math.floor(h);
    return f < 0.3 ? 2.45 : WH;
  }
  _furnish() {
    // lonely furniture in dead ends: chairs facing walls, plants, carts, replicator alcoves
    const d = this.d, rnd = mulberry32(d.deck * 191 + 7);
    const DIR = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [x, y] of d.openTiles) {
      if (d.grid[y][x] !== 0 || d.room[y][x] || d.used.has(x + ',' + y)) continue;
      if (Math.abs(x - d.exit[0]) + Math.abs(y - d.exit[1]) < 3 || (x === d.gornSpawn[0] && y === d.gornSpawn[1])) continue;
      const open = DIR.filter(([a, b]) => d.grid[y + b]?.[x + a] === 0);
      if (open.length !== 1 || rnd() > 0.55) continue;
      const [ox, oy] = open[0];
      const kind = ['lonechair', 'plant', 'cart', 'replicator', 'lonechair'][Math.floor(rnd() * 5)];
      d.grid[y][x] = 2; d.used.add(x + ',' + y);
      d.props.push({ kind, tx: x, ty: y, rot: kind === 'lonechair' ? Math.atan2(ox, oy) : Math.atan2(-ox, -oy), liminal: true });
    }
  }
  tile(x, z) { return [Math.floor(x / TS), Math.floor(z / TS)]; }
  center(tx, ty) { return [(tx + 0.5) * TS, (ty + 0.5) * TS]; }
  solid(tx, ty) { return tx < 0 || ty < 0 || tx >= this.W || ty >= this.H || this.grid[ty][tx] !== 0; }
  solidAt(x, z) { const [tx, ty] = this.tile(x, z); return this.solid(tx, ty); }

  // push circle out of solid tiles
  resolve(p, r) {
    const [tx, ty] = this.tile(p.x, p.z);
    for (let iter = 0; iter < 2; iter++) {
      for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) {
        if (!this.solid(x, y)) continue;
        const prop = this.grid[y]?.[x] === 2;
        const half = prop ? TS * 0.36 : TS / 2;
        const cx = (x + 0.5) * TS, cz = (y + 0.5) * TS;
        const nx = Math.max(cx - half, Math.min(p.x, cx + half));
        const nz = Math.max(cz - half, Math.min(p.z, cz + half));
        let dx = p.x - nx, dz = p.z - nz; const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 < 1e-8) { // center inside box: push along smallest axis
            const ox = half - Math.abs(p.x - cx), oz = half - Math.abs(p.z - cz);
            if (ox < oz) p.x += Math.sign(p.x - cx || 1) * (ox + r); else p.z += Math.sign(p.z - cz || 1) * (oz + r);
          } else { const d = Math.sqrt(d2); p.x += dx / d * (r - d); p.z += dz / d * (r - d); }
        }
      }
    }
  }

  los(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, dist = Math.hypot(dx, dz);
    const n = Math.ceil(dist / 0.4);
    for (let i = 1; i < n; i++) { if (this.solidAt(ax + dx * i / n, az + dz * i / n)) return false; }
    return true;
  }

  // distance field (BFS) from a tile, over walkable tiles (grid==0)
  field(tx, ty) {
    const W = this.W, H = this.H, g = this.grid;
    const d = new Int16Array(W * H).fill(-1);
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return d;
    const q = [tx + ty * W]; d[q[0]] = 0;
    for (let i = 0; i < q.length; i++) {
      const x = q[i] % W, y = (q[i] / W) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || g[ny][nx] !== 0 || d[nx + ny * W] >= 0) continue;
        d[nx + ny * W] = d[q[i]] + 1; q.push(nx + ny * W);
      }
    }
    return d;
  }

  reveal(x, z, r = 2) {
    const [tx, ty] = this.tile(x, z);
    for (let y = ty - r; y <= ty + r; y++) for (let xx = tx - r; xx <= tx + r; xx++) {
      if (xx < 0 || yy(y, this.H)) continue;
      if (xx >= this.W) continue;
      // only reveal if line-of-sight-ish (cheap): within radius and either open or adjacent
      const [cx, cz] = this.center(xx, y);
      if (this.los(x, z, cx, cz) || (Math.abs(xx - tx) <= 1 && Math.abs(y - ty) <= 1)) this.explored[xx + y * this.W] = 1;
    }
  }

  _build() {
    const T = textures(); const d = this.d, ship = this.ship, W = this.W, H = this.H;
    const g = this.group;
    const rndv = mulberry32(d.deck * 977 + 13);
    const wallCol = new THREE.Color(ship.wall), floorCol = new THREE.Color(ship.floor);
    const open = [], walls = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (this.grid[y][x] !== 1) open.push([x, y]);
      else {
        let near = false;
        for (let oy = -1; oy <= 1 && !near; oy++) for (let ox = -1; ox <= 1; ox++) if (this.grid[y + oy]?.[x + ox] !== undefined && this.grid[y + oy][x + ox] !== 1) { near = true; break; }
        if (near) walls.push([x, y]);
      }
    }
    // floors
    const FLOOR_OF = { engineering: 'deck', shuttlebay: 'deck', cargo: 'deck', transporter: 'deck', jefferies: 'deck', sickbay: 'tile', mess: 'tile', holodeck: 'holo' };
    const FLOOR_MAT = { deck: { metalness: 0.55, roughness: 0.9, ns: 1.3 }, tile: { metalness: 0.0, roughness: 0.55, ns: 0.8 }, carpet: { metalness: 0, roughness: 1, ns: T.real ? 1.6 : 0.9 }, holo: { metalness: 0, roughness: 0.3, ns: 0.9 } };
    const byKind = { deck: [], tile: [], carpet: [], holo: [] };
    for (const t of open) byKind[FLOOR_OF[d.room[t[1]][t[0]]] || 'carpet'].push(t);
    const dummy = new THREE.Object3D();
    for (const [kind, list] of Object.entries(byKind)) {
      if (!list.length) continue;
      const geo = new THREE.PlaneGeometry(TS, TS); geo.rotateX(-Math.PI / 2);
      const fm = FLOOR_MAT[kind], dm = T.d[kind];
      const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ map: T[kind], normalMap: dm.normal, normalScale: new THREE.Vector2(fm.ns, fm.ns), roughnessMap: dm.rough, roughness: fm.roughness, metalness: fm.metalness }), list.length);
      list.forEach(([x, y], i) => {
        dummy.position.set((x + 0.5) * TS, 0, (y + 0.5) * TS); dummy.rotation.y = kind === 'holo' ? 0 : Math.floor(rndv() * 4) * Math.PI / 2; dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
        const r = d.room[y][x]; const c = kind === 'holo' ? new THREE.Color(0xffffff) : floorCol.clone();
        if (r && kind !== 'holo') c.lerp(new THREE.Color(ROOMS[r].floor), 0.6);
        if (kind === 'tile') c.lerp(new THREE.Color(0xffffff), 0.35);
        if (kind !== 'holo') c.multiplyScalar((r ? 0.9 : 0.82) + rndv() * 0.2);
        im.setColorAt(i, c);
      });
      im.receiveShadow = true; g.add(im);
    }
    dummy.rotation.set(0, 0, 0);
    // ceiling
    {
      const geo = new THREE.PlaneGeometry(TS, TS); geo.rotateX(Math.PI / 2);
      const im = new THREE.InstancedMesh(geo, T.d.ceil ? new THREE.MeshStandardMaterial({ map: T.ceil, normalMap: T.d.ceil.normal, roughnessMap: T.d.ceil.rough, roughness: 1, metalness: 0 }) : new THREE.MeshLambertMaterial({ map: T.ceil }), open.length);
      open.forEach(([x, y], i) => { dummy.position.set((x + 0.5) * TS, this.ceilAt(x, y), (y + 0.5) * TS); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, wallCol.clone().multiplyScalar(0.8)); });
      g.add(im);
    }
    // light panels (steady + flickering + dead)
    {
      const lightCol = new THREE.Color(ship.light).multiplyScalar(3.4);
      const geo = new THREE.PlaneGeometry(1.5, 0.6); geo.rotateX(Math.PI / 2);
      const steady = [], flick = [];
      for (const [x, y] of open) {
        const r = d.room[y][x];
        const lit = r ? true : ((x + y) % 2 === 0);
        if (!lit) continue;
        { const hz = Math.sin((x >> 2) * 91.7 + (y >> 2) * 17.3 + d.deck * 5.7) * 9871.3; if (!r && hz - Math.floor(hz) < 0.2) continue; } // pitch-black stretches
        const roll = rndv();
        if (roll < 0.06) continue; // dead panel
        (roll < 0.14 ? flick : steady).push([x, y]);
      }
      const mkPanels = (list, name) => {
        if (!list.length) return null;
        const mat = new THREE.MeshBasicMaterial({ color: lightCol.clone() });
        const im = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach(([x, y], i) => { const ch = this.ceilAt(x, y); dummy.position.set((x + 0.5) * TS, ch - 0.02, (y + 0.5) * TS); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); this.panels.push({ x: (x + 0.5) * TS, y: ch - 0.3, z: (y + 0.5) * TS, flick: name === 'flick' }); });
        g.add(im); return mat;
      };
      this.steadyMat = mkPanels(steady, 'steady'); this.alertCol = new THREE.Color(0xff1808);
      const fm = mkPanels(flick, 'flick');
      if (fm) this.flickMat = fm;
      this.lightCol = lightCol;
    }
    // walls
    {
      const geo = new THREE.BoxGeometry(TS, WH, TS);
      const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ map: T.wall, normalMap: T.d.wall.normal, normalScale: new THREE.Vector2(1, 1), roughnessMap: T.d.wall.rough, roughness: T.real ? 0.85 : 1, metalness: T.real ? 0.3 : 0.05 }), walls.length);
      walls.forEach(([x, y], i) => {
        dummy.position.set((x + 0.5) * TS, WH / 2, (y + 0.5) * TS); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
        im.setColorAt(i, wallCol.clone().multiplyScalar(0.82 + rndv() * 0.22));
      });
      im.castShadow = true; im.receiveShadow = true; g.add(im);
    }
    // wall decorations on faces adjoining open tiles
    {
      const stripes = [], lcars = [], windows = [];
      for (const [x, y] of walls) for (const [dx, dy] of DIRS) {
        if (this.grid[y + dy]?.[x + dx] === undefined || this.grid[y + dy][x + dx] === 1) continue;
        const px = (x + 0.5) * TS + dx * (TS / 2 + 0.02), pz = (y + 0.5) * TS + dy * (TS / 2 + 0.02), ry = Math.atan2(dx, dy);
        const roomT = d.room[y + dy][x + dx];
        const roll = rndv();
        stripes.push({ px, pz, ry });
        this.wallFaces.push({ tx: x, ty: y, dx, dy, px, pz, ry, room: roomT });
        if (roll < 0.18) lcars.push({ px, pz, ry, n: 1 + Math.floor(rndv() * 3) });
        else if (roll < 0.26 || (roomT === 'bridge' && roll < 0.6)) windows.push({ px, pz, ry });
      }
      const sg = new THREE.PlaneGeometry(TS, 0.14);
      const sm = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ color: 0xffffff }), stripes.length || 1);
      stripes.forEach((s, i) => { dummy.position.set(s.px, 1.05, s.pz); dummy.rotation.set(0, s.ry, 0); dummy.updateMatrix(); sm.setMatrixAt(i, dummy.matrix); sm.setColorAt(i, new THREE.Color(ship.accent).multiplyScalar(0.55)); });
      sm.count = stripes.length; g.add(sm);
      const pal = [ship.accent, 0xcc99cc, 0x9999ff, 0xff9966, 0xffcc99].map(c => new THREE.Color(c).multiplyScalar(0.8));
      const items = []; lcars.forEach(l => { for (let k = 0; k < l.n; k++) items.push({ ...l, k }); });
      const lg = new THREE.PlaneGeometry(0.42, 0.26);
      const lm = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ color: 0xffffff }), items.length || 1);
      items.forEach((l, i) => {
        const off = (l.k - (l.n - 1) / 2) * 0.55;
        const cx = Math.cos(l.ry), sx = Math.sin(l.ry);
        dummy.position.set(l.px + cx * off, 1.75 + (rndv() - 0.5) * 0.2, l.pz - sx * off); dummy.rotation.set(0, l.ry, 0); dummy.updateMatrix();
        lm.setMatrixAt(i, dummy.matrix); lm.setColorAt(i, pal[Math.floor(rndv() * pal.length)]);
      });
      lm.count = items.length; g.add(lm);
      const wg = new THREE.PlaneGeometry(1.7, 1.0);
      const wm = new THREE.InstancedMesh(wg, new THREE.MeshBasicMaterial({ map: T.stars }), windows.length || 1);
      windows.forEach((w, i) => { dummy.position.set(w.px, 1.7, w.pz); dummy.rotation.set(0, w.ry, 0); dummy.updateMatrix(); wm.setMatrixAt(i, dummy.matrix); });
      wm.count = windows.length; g.add(wm);
      dummy.rotation.set(0, 0, 0);
    }
    // props
    for (const p of d.props) {
      const m = buildProp(p.kind);
      const [cx, cz] = this.center(p.tx, p.ty);
      m.position.set(cx, 0, cz); m.rotation.y = p.kind === 'viewscreen' ? 0 : p.rot;
      if (p.kind === 'viewscreen') { m.position.z -= TS * 0.35; }
      g.add(m);
      m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } if (o.name === 'spin') this.spin.push(o); if (o.name === 'core') this.core = o; });
    }
    // lift
    {
      const lift = buildLift(ship.accent);
      const [ex, ey] = d.exit; const [cx, cz] = this.center(ex, ey);
      const [dx, dy] = d.exitDir;
      lift.position.set(cx - dx * (TS / 2 - 0.2), 0, cz - dy * (TS / 2 - 0.2));
      lift.rotation.y = Math.atan2(dx, dy);
      g.add(lift); this.lift = lift; this.liftPos = new THREE.Vector3(cx, 0, cz);
      this.liftStatus = lift.getObjectByName('status');
    }
  }

  _details() {
    const d = this.d, ship = this.ship, g = this.group, T = textures();
    const rnd = mulberry32(d.deck * 4421 + 5);
    const dummy = new THREE.Object3D();
    const accent = new THREE.Color(ship.accent);
    // --- signs
    const signTex = {};
    const sign = (text, col) => {
      const key = text + col;
      if (!signTex[key]) signTex[key] = canvasTex(256, (c, sz) => {
        c.fillStyle = '#0b0e16'; c.fillRect(0, 0, sz, sz);
        c.fillStyle = '#' + new THREE.Color(col).getHexString(); c.fillRect(0, 0, sz, 10); c.fillRect(0, sz - 10, sz, 10);
        c.fillStyle = '#fff'; c.font = 'bold 28px Helvetica, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        const words = text.split('\n'); words.forEach((w, i) => c.fillText(w, sz / 2, sz / 2 + (i - (words.length - 1) / 2) * 34));
      });
      return signTex[key];
    };
    const place = (f, text, y = 2.6, w = 1.4) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w), new THREE.MeshBasicMaterial({ map: sign(text, ship.accent), color: 0xdddddd }));
      m.scale.set(1, 0.3, 1); m.position.set(f.px + f.dx * 0.01, y, f.pz + f.dy * 0.01); m.rotation.y = f.ry; g.add(m);
    };
    for (const r of d.rooms) {
      const fs = this.wallFaces.filter(f => f.room === r.type && f.tx + f.dx >= r.x && f.tx + f.dx < r.x + r.w && f.ty + f.dy >= r.y && f.ty + f.dy < r.y + r.h);
      if (fs.length) place(fs[Math.floor(rnd() * fs.length)], ROOMS[r.type].label.toUpperCase().replace(' ', '\n'));
    }
    const corr = ['SECTION ' + (10 + Math.floor(rnd() * 40)) + '-' + 'ABCD'[Math.floor(rnd() * 4)], 'DECK ' + (d.deck + 1), 'MAINTENANCE\nDUCT ' + (1 + Math.floor(rnd() * 9)), 'EMERGENCY\nBULKHEAD', 'TUBELIFT →', '← AUX CONTROL', 'DO NOT\nENTER', 'RADIATION\nHAZARD'];
    for (const f of this.wallFaces) if (!f.room && rnd() < 0.045) place(f, corr[Math.floor(rnd() * corr.length)], 2.55, 1.2);
    // --- handrails and floor light strips along walls
    {
      const rails = [], strips = [];
      for (const f of this.wallFaces) { const r = rnd(); if (r < 0.28) rails.push(f); else if (r < 0.5) strips.push(f); }
      if (rails.length) {
        const im = new THREE.InstancedMesh(new THREE.BoxGeometry(TS, 0.05, 0.07), new THREE.MeshStandardMaterial({ color: 0x9aa0aa, metalness: 0.8, roughness: 0.3 }), rails.length);
        rails.forEach((f, i) => { dummy.position.set(f.px + f.dx * 0.06, 0.95, f.pz + f.dy * 0.06); dummy.rotation.set(0, f.ry, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
        im.castShadow = true; g.add(im);
      }
      if (strips.length) {
        const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(TS * 0.92, 0.05), new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(1.6) }), strips.length);
        strips.forEach((f, i) => { dummy.position.set(f.px + f.dx * 0.005, 0.12, f.pz + f.dy * 0.005); dummy.rotation.set(0, f.ry, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
        g.add(im);
      }
      dummy.rotation.set(0, 0, 0);
    }
    // --- door frames between rooms and corridors
    const frames = [];
    for (const r of d.rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy; if (nx >= r.x && nx < r.x + r.w && ny >= r.y && ny < r.y + r.h) continue;
      if (d.grid[ny]?.[nx] !== 0) continue; // 0 = open corridor
      frames.push({ x: (x + 0.5) * TS + dx * TS / 2, z: (y + 0.5) * TS + dy * TS / 2, ax: dx !== 0 });
    }
    if (frames.length) {
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), frames.length * 3);
      let i = 0; const c = accent.clone().multiplyScalar(0.55), c2 = new THREE.Color(0x30343c);
      for (const f of frames) {
        const lat = TS / 2 - 0.12;
        const parts = [[0, 0, -lat, 0.28, WH, 0.24, c2], [0, 0, lat, 0.28, WH, 0.24, c2], [0, WH - 0.25, 0, 0.3, 0.5, TS, c]];
        for (const [ox, oy, oz, sx, sy, sz, col] of parts) {
          const X = f.ax ? ox : oz, Z = f.ax ? oz : ox;
          dummy.position.set(f.x + X, oy + sy / 2, f.z + Z); dummy.scale.set(f.ax ? sx : sz, sy, f.ax ? sz : sx); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
          im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, col); i++;
        }
      }
      im.castShadow = true; g.add(im);
    }
    // --- ceiling pipes + vents
    const pipes = [], vents = [];
    for (const [x, y] of d.openTiles) {
      if (d.grid[y][x] === 2) continue;
      const r = d.room[y][x];
      if (rnd() < (r ? 0.1 : 0.22)) pipes.push({ x, y, ax: d.grid[y][x + 1] === 0 || d.grid[y][x - 1] === 0 ? 0 : 1, off: (rnd() - 0.5) * 1.8, col: rnd() < 0.3 ? accent : null });
      else if ((x + y) % 2 === 1 && rnd() < 0.35) vents.push({ x, y });
    }
    if (pipes.length) {
      const geo = new THREE.CylinderGeometry(0.07, 0.07, TS, 7);
      const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), pipes.length);
      pipes.forEach((p, i) => {
        dummy.position.set((p.x + 0.5) * TS + (p.ax ? p.off : 0), this.ceilAt(p.x, p.y) - 0.2, (p.y + 0.5) * TS + (p.ax ? 0 : p.off));
        dummy.rotation.set(p.ax ? 0 : Math.PI / 2, 0, p.ax ? 0 : Math.PI / 2); dummy.scale.set(1, 1, 1);
        if (!p.ax) dummy.rotation.set(0, 0, Math.PI / 2); else dummy.rotation.set(Math.PI / 2, 0, 0);
        dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, (p.col || new THREE.Color(0x777b83)).clone());
      });
      im.castShadow = true; g.add(im);
    }
    if (vents.length) {
      const geo = new THREE.PlaneGeometry(0.9, 0.5); geo.rotateX(Math.PI / 2);
      const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x15171b }), vents.length);
      vents.forEach((v, i) => { dummy.position.set((v.x + 0.5) * TS, this.ceilAt(v.x, v.y) - 0.03, (v.y + 0.5) * TS); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
      g.add(im);
    }
    // --- floor markings: hazard tape at the lift, launch ring in shuttlebays
    const haz = canvasTex(128, (c, sz) => { c.fillStyle = '#e0b020'; c.fillRect(0, 0, sz, sz); c.fillStyle = '#111'; for (let i = -sz; i < sz * 2; i += 32) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 16, 0); c.lineTo(i + 16 - sz, sz); c.lineTo(i - sz, sz); c.fill(); } });
    const [ex, ey] = d.exit, [edx, edy] = d.exitDir; const [ecx, ecz] = this.center(ex, ey);
    const hm = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), new THREE.MeshLambertMaterial({ map: haz })); hm.rotation.x = -Math.PI / 2; hm.rotation.z = Math.atan2(edx, edy) + Math.PI / 2 * 0;
    hm.rotation.set(-Math.PI / 2, 0, 0); hm.rotation.order = 'YXZ'; hm.rotation.y = Math.atan2(edx, edy); hm.position.set(ecx, 0.014, ecz); g.add(hm);
    const ring = canvasTex(256, (c, sz) => { c.clearRect(0, 0, sz, sz); c.strokeStyle = '#e8c840'; c.lineWidth = 10; c.beginPath(); c.arc(sz / 2, sz / 2, sz / 2 - 12, 0, 7); c.stroke(); c.lineWidth = 4; c.beginPath(); c.arc(sz / 2, sz / 2, sz / 2 - 34, 0, 7); c.stroke(); c.fillStyle = '#e8c840'; c.font = 'bold 22px Helvetica'; c.textAlign = 'center'; c.fillText('LANDING ZONE', sz / 2, sz / 2 + 100); });
    for (const r of d.rooms) {
      if (r.type === 'shuttlebay') {
        const [cx, cz] = this.center(r.x + (r.w >> 1), r.y + (r.h >> 1));
        const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: ring, transparent: true, depthWrite: false, opacity: 0.8, color: 0xaaaaaa }));
        m.rotation.x = -Math.PI / 2; m.position.set(cx, 0.014, cz); g.add(m);
      }
      if (r.type === 'engineering') { for (const [ox, oy] of [[0, 0], [r.w - 1, 0], [0, r.h - 1], [r.w - 1, r.h - 1]]) { const [sx, sz] = this.center(r.x + ox, r.y + oy); this.steamers.push({ x: sx, z: sz, t: rnd() * 2 }); } }
    }
    for (const p of d.props) if (p.kind === 'console' && rnd() < 0.4) { const [sx, sz] = this.center(p.tx, p.ty); this.sparkers.push({ x: sx, z: sz, t: 2 + rnd() * 8 }); }
  }

  _liminal() {
    const d = this.d, ship = this.ship, g = this.group, T = textures();
    const rnd = mulberry32(d.deck * 7331 + 11), dummy = new THREE.Object3D();
    // --- ambient-occlusion gradients at wall base and ceiling line
    if (this.wallFaces.length) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: T.aoGrad, transparent: true, opacity: 0.55, depthWrite: false });
      const geo = new THREE.PlaneGeometry(TS, 0.55);
      const lo = new THREE.InstancedMesh(geo, mat, this.wallFaces.length), hi = new THREE.InstancedMesh(geo, mat, this.wallFaces.length);
      this.wallFaces.forEach((f, i) => {
        dummy.position.set(f.px - f.dx * 0.008, 0.275, f.pz - f.dy * 0.008); dummy.rotation.set(0, f.ry, Math.PI); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); lo.setMatrixAt(i, dummy.matrix);
        const ch = this.ceilAt(f.tx + f.dx, f.ty + f.dy);
        dummy.position.set(f.px - f.dx * 0.008, ch - 0.275, f.pz - f.dy * 0.008); dummy.rotation.set(0, f.ry, 0); dummy.updateMatrix(); hi.setMatrixAt(i, dummy.matrix);
      });
      g.add(lo, hi);
    }
    // --- rows of identical sealed doors (the same door, again and again)
    const nums = ['4-117', '4-118', '4-121', '4-122', '4-130'];
    const doorTex = nums.map(n => {
      const c = document.createElement('canvas'); c.width = 128; c.height = 256; const x = c.getContext('2d');
      x.fillStyle = '#b9bdc4'; x.fillRect(0, 0, 128, 256); x.strokeStyle = '#555a63'; x.lineWidth = 4; x.strokeRect(2, 2, 124, 252);
      x.fillStyle = '#7a808a'; x.fillRect(14, 20, 100, 90); x.fillRect(14, 130, 100, 100); x.fillStyle = '#1b2230'; x.fillRect(46, 34, 36, 50);
      x.fillStyle = '#10141c'; x.fillRect(86, 120, 30, 16); x.fillStyle = '#' + new THREE.Color(ship.accent).getHexString(); x.fillRect(90, 124, 22, 8);
      x.fillStyle = '#222'; x.font = 'bold 18px Helvetica'; x.textAlign = 'center'; x.fillText(n, 64, 250);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    });
    const doors = nums.map(() => []);
    for (const f of this.wallFaces) if (!f.room && rnd() < 0.13) doors[Math.floor(rnd() * nums.length)].push(f);
    doors.forEach((list, k) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.15, 2.3), new THREE.MeshStandardMaterial({ map: doorTex[k], roughness: 0.5, metalness: 0.3 }), list.length);
      list.forEach((f, i) => { dummy.position.set(f.px + f.dx * 0.012, 1.15, f.pz + f.dy * 0.012); dummy.rotation.set(0, f.ry, 0); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
      im.receiveShadow = true; g.add(im);
    });
    // --- bureaucratic safety posters
    const posters = ['REPORT ALL\nREPTILIAN\nACTIVITY', 'NO RUNNING\nIN\nCORRIDORS', 'ARE YOU\nSLEEPING\nENOUGH?', 'THE GRONK\nIS NOT\nYOUR FRIEND', 'WASH YOUR\nHANDS', 'SAFETY\nFIRST', 'STAY CALM.\nSTAY QUIET.', 'IF YOU SEE\nSOMETHING,\nSAY NOTHING'];
    const free = this.wallFaces.filter(f => !f.room);
    for (let i = 0; i < Math.min(10, free.length); i++) {
      const f = free[Math.floor(rnd() * free.length)], txt = posters[Math.floor(rnd() * posters.length)];
      const c = document.createElement('canvas'); c.width = 256; c.height = 340; const x = c.getContext('2d');
      x.fillStyle = ['#e8e0c8', '#c9d8e0', '#e0c9c9'][Math.floor(rnd() * 3)]; x.fillRect(0, 0, 256, 340);
      x.strokeStyle = '#' + new THREE.Color(ship.accent).getHexString(); x.lineWidth = 12; x.strokeRect(6, 6, 244, 328);
      x.fillStyle = '#' + new THREE.Color(ship.accent).getHexString(); x.beginPath(); x.arc(128, 90, 42, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(114, 82, 8, 0, 7); x.arc(142, 82, 8, 0, 7); x.fill();
      x.fillStyle = '#222'; x.font = 'bold 30px Helvetica'; x.textAlign = 'center'; txt.split('\n').forEach((l, j, a) => x.fillText(l, 128, 190 + j * 38));
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.93), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
      m.position.set(f.px + f.dx * 0.018, 1.55, f.pz + f.dy * 0.018); m.rotation.y = f.ry + (rnd() - 0.5) * 0.06; g.add(m);
    }
    // --- puddles / wet carpet, or the whole deck flooded
    const puddleGeo = new THREE.CircleGeometry(1, 20); puddleGeo.rotateX(-Math.PI / 2);
    const wet = new THREE.MeshStandardMaterial({ color: 0x0a1218, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.72, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const pl = [];
    const np = this.flooded ? 0 : 6 + d.deck * 2;
    for (let i = 0; i < np; i++) { const t = d.openTiles[Math.floor(rnd() * d.openTiles.length)]; if (d.grid[t[1]][t[0]] === 1) continue; pl.push([(t[0] + 0.5) * TS + (rnd() - 0.5) * 1.5, (t[1] + 0.5) * TS + (rnd() - 0.5) * 1.5, 0.4 + rnd() * 0.9]); }
    if (pl.length) { const im = new THREE.InstancedMesh(puddleGeo, wet, pl.length); pl.forEach(([x, z, r], i) => { dummy.position.set(x, 0.016, z); dummy.scale.set(r, 1, r * (0.7 + rnd() * 0.5)); dummy.rotation.set(0, rnd() * 6, 0); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); }); g.add(im); }
    if (this.flooded) {
      const geo = new THREE.PlaneGeometry(TS, TS); geo.rotateX(-Math.PI / 2);
      const tiles = d.openTiles;
      const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x1c3a42, roughness: 0.03, metalness: 0.1, transparent: true, opacity: 0.62, depthWrite: false }), tiles.length);
      tiles.forEach(([x, y], i) => { dummy.position.set((x + 0.5) * TS, 0.07, (y + 0.5) * TS); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
      g.add(im);
      for (let i = 0; i < 14; i++) { const t = tiles[Math.floor(rnd() * tiles.length)]; this.drips.push({ x: (t[0] + 0.5) * TS + (rnd() - 0.5) * 2, z: (t[1] + 0.5) * TS + (rnd() - 0.5) * 2, t: rnd() * 3, y: this.ceilAt(t[0], t[1]) }); }
    }
    // --- faint volumetric cones under working ceiling panels
    if (this.panels.length) {
      const mkCones = (list, tag) => {
        if (!list.length) return null;
        const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(ship.light).multiplyScalar(0.9), transparent: true, opacity: 0.04, alphaMap: T.aoGrad, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const geo = new THREE.ConeGeometry(0.85, 2.0, 14, 1, true);
        const im = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach((p, i) => { dummy.position.set(p.x, p.y + 0.3 - 1.1 + 0.2, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
        im.frustumCulled = false; this.cones.add(im); return mat;
      };
      this.cones = new THREE.Group(); g.add(this.cones);
      this.coneMat = mkCones(this.panels.filter(p => !p.flick)); this.coneFlickMat = mkCones(this.panels.filter(p => p.flick));
    }
    // --- a beacon at the end of the hall
    const [ex, ey] = d.exit; const [cx, cz] = this.center(ex, ey);
    this.liftLight = new THREE.PointLight(0xff3030, 5, 11, 1.6); this.liftLight.position.set(cx, 2.3, cz); g.add(this.liftLight);
  }

  setFancy(on) { this.cones.visible = on; }
  setPower(on) { this.powerTarget = on ? 1 : 0; if (on) this.restoreT = 1.4; }
  setAlert(on) { this.alertTarget = on ? 1 : 0; }

  setLiftOpen(open) {
    this.liftStatus.material.color.set(open ? 0x40ff70 : 0xff3030);
    if (this.liftLight) this.liftLight.color.set(open ? 0x40ff70 : 0xff3030);
    this.liftOpen = open;
  }

  update(dt, t) {
    this.alertAmt += ((this.alertTarget || 0) - this.alertAmt) * Math.min(1, dt * 4);
    if (this.coneMat) this.coneMat.opacity = 0.04 * this.powerAmt * (1 - this.alertAmt * 0.5);
    if (this.coneFlickMat) this.coneFlickMat.opacity = 0.04 * this.powerAmt * this.flickerF;
    if (this.restoreT > 0) { this.restoreT -= dt; this.powerAmt = Math.random() < 0.5 ? this.powerTarget : this.powerAmt * 0.4; if (this.restoreT <= 0) this.powerAmt = 1; }
    else this.powerAmt += (this.powerTarget - this.powerAmt) * Math.min(1, dt * (this.powerTarget ? 8 : 5));
    if (this.drips.length) for (const dr of this.drips) { dr.t -= dt; if (dr.t <= 0) { dr.t = 1.5 + Math.random() * 4; dr.fire = true; } }
    M.blinkR.color.setRGB(0.4 + 0.6 * (Math.sin(t * 5) > 0 ? 1 : 0), 0.1, 0.07); M.blinkG.color.setRGB(0.1, 0.4 + 0.6 * (Math.sin(t * 3.1 + 1) > 0 ? 1 : 0), 0.2);
    for (const s of this.spin) { s.rotation.y += dt * 0.8; s.rotation.x += dt * 0.3; }
    if (this.core) this.core.material.opacity = 0.7 + Math.sin(t * 3) * 0.15;
    if (this.flickMat) {
      const f = (Math.sin(t * 31) + Math.sin(t * 17.3) + Math.sin(t * 5.1)) > 1.4 ? 0.15 : (Math.random() < 0.03 ? 0.4 : 1);
      this.flickerF = f; this.flickMat.color.copy(this.lightCol).multiplyScalar(f * this.powerAmt);
    }
    if (this.steadyMat) {
      const a = this.alertAmt, pulse = 0.55 + 0.45 * Math.sin(t * 6);
      this.steadyMat.color.copy(this.lightCol).lerp(this.alertCol, a * pulse).multiplyScalar((1 - a * 0.35) * this.powerAmt);
    }
    if (this.liftOpen) {
      const L = this.lift.getObjectByName('doorL'), R = this.lift.getObjectByName('doorR');
      L.position.x += (-1.3 - L.position.x) * Math.min(1, dt * 2); R.position.x += (1.3 - R.position.x) * Math.min(1, dt * 2);
    }
  }

  dispose() {
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}
function yy(y, H) { return y < 0 || y >= H; }
export const PROP_KINDS = ['console', 'chair', 'viewscreen', 'warpcore', 'shuttle', 'holocube', 'pad', 'bunk', 'table', 'biobed', 'crate', 'tree', 'lonechair', 'plant', 'cart', 'replicator'];
