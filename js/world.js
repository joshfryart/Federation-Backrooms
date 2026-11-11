import * as THREE from 'three';
import { ROOMS, mulberry32 } from './data.js';

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
function mats() {
  if (M.metal) return M;
  M.metal = new THREE.MeshLambertMaterial({ color: 0x8a8f99 });
  M.dark = new THREE.MeshLambertMaterial({ color: 0x2a2d35 });
  M.fabric = new THREE.MeshLambertMaterial({ color: 0x7a3a3a });
  M.white = new THREE.MeshLambertMaterial({ color: 0xdfe6ea });
  M.wood = new THREE.MeshLambertMaterial({ color: 0x6b4a32 });
  M.crate = new THREE.MeshLambertMaterial({ color: 0x6a6f5a });
  M.crate2 = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });
  M.leaf = new THREE.MeshLambertMaterial({ color: 0x2f7a38 });
  M.trunk = new THREE.MeshLambertMaterial({ color: 0x5a3f2a });
  M.screenB = new THREE.MeshBasicMaterial({ color: 0x4ac0ff });
  M.screenO = new THREE.MeshBasicMaterial({ color: 0xffa040 });
  M.screenG = new THREE.MeshBasicMaterial({ color: 0x60ff90 });
  M.core = new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.85 });
  M.holo = new THREE.MeshBasicMaterial({ color: 0xffcc33, wireframe: true });
  M.pad = new THREE.MeshBasicMaterial({ color: 0x6fd0ff, transparent: true, opacity: 0.6 });
  M.view = new THREE.MeshBasicMaterial({ map: textures().stars });
  return M;
}
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y + h / 2, z); return m;
}
export function buildProp(kind) {
  const m = mats(); const g = new THREE.Group();
  switch (kind) {
    case 'console':
      g.add(box(1.6, 1.0, 0.7, m.dark)); const s = box(1.4, 0.05, 0.5, m.screenB, 0, 1.0, 0); s.rotation.x = -0.3; g.add(s);
      g.add(box(0.2, 0.05, 0.2, m.screenO, 0.4, 1.02, 0.1)); break;
    case 'chair':
      g.add(box(0.8, 0.45, 0.8, m.fabric)); g.add(box(0.8, 0.9, 0.15, m.fabric, 0, 0.45, 0.35)); g.add(box(0.3, 0.3, 0.3, m.metal, 0, -0.0, 0)); g.add(box(0.1, 0.3, 0.8, m.dark, 0.55, 0.45, 0)); g.add(box(0.1, 0.3, 0.8, m.dark, -0.55, 0.45, 0)); break;
    case 'viewscreen': {
      const v = box(2.2, 1.4, 0.1, m.view, 0, 0.8, 0); g.add(v); g.add(box(2.4, 0.8, 0.5, m.dark)); break; }
    case 'warpcore': {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, WH, 12), m.core); c.position.y = WH / 2; c.name = 'core'; g.add(c);
      g.add(box(1.1, 0.4, 1.1, m.metal)); g.add(box(1.1, 0.3, 1.1, m.metal, 0, WH - 0.3, 0)); break; }
    case 'shuttle':
      g.add(box(2.0, 0.9, 1.5, m.white, 0, 0.2, 0)); g.add(box(0.8, 0.5, 1.2, m.metal, 1.1, 0.2, 0)); g.add(box(0.6, 0.35, 0.05, m.screenB, 1.0, 0.75, 0.0)); g.add(box(0.5, 0.15, 1.8, m.metal, -0.3, 0.55, 0)); break;
    case 'holocube': {
      const c = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), m.holo); c.position.y = 1.0; c.name = 'spin'; g.add(c); g.add(box(0.3, 0.3, 0.3, m.dark)); break; }
    case 'pad': {
      g.add(box(1.9, 0.12, 1.9, m.dark));
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.05, 20), m.pad); p.position.y = 0.15; g.add(p);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.05, 20), m.pad); top.position.y = WH - 0.2; g.add(top); break; }
    case 'bunk':
      g.add(box(1.6, 0.4, 0.9, m.dark, 0, 0, 0)); g.add(box(1.5, 0.2, 0.8, m.fabric, 0, 0.4, 0)); g.add(box(0.4, 0.15, 0.6, m.white, -0.5, 0.6, 0)); g.add(box(0.6, 0.9, 0.5, m.metal, 0.75, 0, 0.8)); break;
    case 'table':
      g.add(box(1.5, 0.08, 1.0, m.wood, 0, 0.75, 0)); g.add(box(0.15, 0.75, 0.15, m.dark, 0.5, 0, 0.3)); g.add(box(0.15, 0.75, 0.15, m.dark, -0.5, 0, -0.3));
      g.add(box(0.4, 0.45, 0.4, m.dark, 0, 0, 0.95)); g.add(box(0.4, 0.45, 0.4, m.dark, 0, 0, -0.95)); break;
    case 'biobed':
      g.add(box(0.9, 0.5, 1.8, m.metal)); g.add(box(0.8, 0.12, 1.6, m.white, 0, 0.5, 0)); g.add(box(0.7, 0.15, 0.05, m.screenG, 0, 1.4, -0.9)); g.add(box(0.1, 1.4, 0.1, m.dark, 0, 0, -0.9)); break;
    case 'crate': {
      const mt = Math.random() < 0.5 ? m.crate : m.crate2; const h = 0.8 + Math.random() * 0.9;
      g.add(box(1.5, h, 1.5, mt)); if (Math.random() < 0.5) g.add(box(0.8, 0.6, 0.8, m.crate2, 0.1, h, 0.1)); g.add(box(1.52, 0.1, 1.52, m.dark, 0, h * 0.5, 0)); break; }
    case 'tree': {
      g.add(box(0.25, 1.5, 0.25, m.trunk));
      for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6 + Math.random() * 0.3, 0), m.leaf); l.position.set((Math.random() - 0.5) * 0.7, 1.7 + Math.random() * 0.8, (Math.random() - 0.5) * 0.7); g.add(l); }
      g.add(box(1.1, 0.35, 1.1, m.dark)); break; }
    default: g.add(box(0.8, 0.8, 0.8, m.metal));
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
    this._build();
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
    const normal = open.filter(([x, y]) => d.room[y][x] !== 'holodeck');
    const holo = open.filter(([x, y]) => d.room[y][x] === 'holodeck');
    const dummy = new THREE.Object3D();
    const mkFloor = (list, map, colorFn) => {
      if (!list.length) return;
      const geo = new THREE.PlaneGeometry(TS, TS); geo.rotateX(-Math.PI / 2);
      const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ map }), list.length);
      list.forEach(([x, y], i) => { dummy.position.set((x + 0.5) * TS, 0, (y + 0.5) * TS); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, colorFn(x, y)); });
      g.add(im);
    };
    mkFloor(normal, T.floor, (x, y) => {
      const r = d.room[y][x]; const c = floorCol.clone();
      if (r) c.lerp(new THREE.Color(ROOMS[r].floor), 0.6);
      const v = 0.88 + rndv() * 0.18; return c.multiplyScalar(v);
    });
    mkFloor(holo, T.holo, () => new THREE.Color(0xffffff));
    // ceiling
    {
      const geo = new THREE.PlaneGeometry(TS, TS); geo.rotateX(Math.PI / 2);
      const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ map: T.ceil }), open.length);
      open.forEach(([x, y], i) => { dummy.position.set((x + 0.5) * TS, WH, (y + 0.5) * TS); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, wallCol.clone().multiplyScalar(0.8)); });
      g.add(im);
    }
    // light panels (steady + flickering + dead)
    {
      const lightCol = new THREE.Color(ship.light);
      const geo = new THREE.PlaneGeometry(1.5, 0.6); geo.rotateX(Math.PI / 2);
      const steady = [], flick = [];
      for (const [x, y] of open) {
        const r = d.room[y][x];
        const lit = r ? true : ((x + y) % 2 === 0);
        if (!lit) continue;
        const roll = rndv();
        if (roll < 0.06) continue; // dead panel
        (roll < 0.14 ? flick : steady).push([x, y]);
      }
      const mkPanels = (list, name) => {
        if (!list.length) return null;
        const mat = new THREE.MeshBasicMaterial({ color: lightCol.clone() });
        const im = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach(([x, y], i) => { dummy.position.set((x + 0.5) * TS, WH - 0.02, (y + 0.5) * TS); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
        g.add(im); return mat;
      };
      mkPanels(steady);
      const fm = mkPanels(flick);
      if (fm) this.flickMat = fm;
      this.lightCol = lightCol;
    }
    // walls
    {
      const geo = new THREE.BoxGeometry(TS, WH, TS);
      const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ map: T.wall }), walls.length);
      walls.forEach(([x, y], i) => {
        dummy.position.set((x + 0.5) * TS, WH / 2, (y + 0.5) * TS); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
        im.setColorAt(i, wallCol.clone().multiplyScalar(0.82 + rndv() * 0.22));
      });
      g.add(im);
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
      m.traverse(o => { if (o.name === 'spin') this.spin.push(o); if (o.name === 'core') this.core = o; });
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

  setLiftOpen(open) {
    this.liftStatus.material.color.set(open ? 0x40ff70 : 0xff3030);
    this.liftOpen = open;
  }

  update(dt, t) {
    for (const s of this.spin) { s.rotation.y += dt * 0.8; s.rotation.x += dt * 0.3; }
    if (this.core) this.core.material.opacity = 0.7 + Math.sin(t * 3) * 0.15;
    if (this.flickMat) {
      const f = (Math.sin(t * 31) + Math.sin(t * 17.3) + Math.sin(t * 5.1)) > 1.4 ? 0.15 : (Math.random() < 0.03 ? 0.4 : 1);
      this.flickMat.color.copy(this.lightCol).multiplyScalar(f);
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
