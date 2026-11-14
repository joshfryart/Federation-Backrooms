// Batch 5 prop art: sciences (docs/asset-gaps.md section 12, batch 5; docs/propart-sciences.md).
//   SCI-1 growbed, SCI-6 nutrient_tanks, SCI-2 sensorstation, SCI-3 charttable, SCI-4 spectrometer, SCI-5 samplefridge, SCI-8 fumehood.
// Contract: `export const kinds = { name: (m, h) => THREE.Group }`. `m` / `h` (world.js mats / helpers) are accepted and ignored: this module owns its few shared materials, so it
// also runs stand-alone in viewer-sciences.html. Origin at the floor centre, +z is the operator side, metres, one mesh per material.
// userData: top (climbable surface, only where one exists), box [x0,x1,z0,z1], spots (EQUIPMENT-style [[x,z,ry]]), use {name:{x,z,ry}}, seat {x,y,z,yaw} (sensorstation), size, tris, name, dept.
// The seated sensorstation carries a child group named 'chair' (toggle .visible).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PI = Math.PI;
// ---------------------------------------------------------------- generated textures (glyph bars, rings, grids only: no text)
function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function ctex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const rr = (g, x, y, w, h, r, c) => { g.fillStyle = c; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
const scan = (g, w, h, a = 0.2) => { g.fillStyle = `rgba(0,0,0,${a})`; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1); };
import { buildChair } from './propart-stations1.js';

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const geoCache = {};
const G = (k, f) => geoCache[k] || (geoCache[k] = f());
class B {
  constructor() { this.by = new Map(); this.st = [new THREE.Matrix4()]; this.tris = 0; }
  push(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { const m = new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s); this.st.push(this.st[this.st.length - 1].clone().multiply(m)); return this; }
  pop() { this.st.pop(); return this; }
  put(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
    const g = geo.clone(); g.applyMatrix4(this.st[this.st.length - 1].clone().multiply(new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s)));
    const ng = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ng.deleteAttribute(k);
    if (!this.by.has(mat)) this.by.set(mat, []); this.by.get(mat).push(ng); this.tris += ng.attributes.position.count / 3;
  }
  box(w, h, d, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { this.put(G(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), mat, x, y + h / 2, z, rx, ry, rz); return this; }
  cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 14, rx = 0, ry = 0, rz = 0) { this.put(G(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), mat, x, y + h / 2, z, rx, ry, rz); return this; }
  sph(r, mat, x, y, z, seg = 10) { this.put(G(`s${r},${seg}`, () => new THREE.SphereGeometry(r, seg, seg - 3)), mat, x, y, z); return this; }
  // screen with bezel: local frame origin at the bottom centre of the panel; the picture faces +z
  panel(w, h, smat, bez, x, y, z, rx = 0, ry = 0) { this.push(x, y, z, rx, ry); this.box(w + 0.04, h + 0.04, 0.05, bez, 0, 0, 0); this.box(w, h, 0.01, smat, 0, 0.02, 0.026); this.pop(); return this; }
  // side-profile prism: profile = [[z,y],...] (counter-clockwise seen from +x), extruded across width w centred on x
  prism(pts, w, mat, x = 0) {
    const s = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1]))); const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.rotateY(-PI / 2); g.translate(w / 2, 0, 0);
    this.put(g, mat, x, 0, 0); return this;
  }
  disc(r, mat, x, y, z, rx = 0, ry = 0, rz = 0, seg = 24) { this.put(G(`d${r},${seg}`, () => new THREE.CircleGeometry(r, seg)), mat, x, y, z, rx, ry, rz); return this; }
  // square rod of thickness t between two points
  rod(x0, y0, z0, x1, y1, z1, t, mat) {
    const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1), d = b.clone().sub(a), L = d.length(), m = a.clone().add(b).multiplyScalar(0.5);
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()), 'YXZ');
    this.put(G(`r${t},${L.toFixed(4)}`, () => new THREE.BoxGeometry(t, t, L)), mat, m.x, m.y, m.z, e.x, e.y, e.z); return this;
  }
  done(name) {
    const grp = new THREE.Group(); if (name) grp.name = name;
    for (const [mat, geos] of this.by) { const m = new THREE.Mesh(geos.length > 1 ? mergeGeometries(geos) : geos[0], mat); m.castShadow = m.receiveShadow = true; grp.add(m); }
    grp.userData.tris = this.tris; return grp;
  }
}

const TEXD = {
  plot(g, w, h, R) {   // round plot: range rings, sweep wedge, rim ticks, blips, no characters
    g.fillStyle = '#020c08'; g.fillRect(0, 0, w, h); const c = w / 2;
    g.fillStyle = '#04180f'; g.beginPath(); g.arc(c, c, c - 2, 0, 7); g.fill();
    g.strokeStyle = '#2fd890'; g.lineWidth = 2; for (let i = 1; i <= 4; i++) { g.globalAlpha = 0.55; g.beginPath(); g.arc(c, c, (c - 8) * i / 4, 0, 7); g.stroke(); } g.globalAlpha = 0.5;
    g.beginPath(); g.moveTo(c, 6); g.lineTo(c, w - 6); g.moveTo(6, c); g.lineTo(w - 6, c); g.stroke(); g.globalAlpha = 1;
    for (let i = 0; i < 72; i++) { const a = i / 72 * PI * 2, l = i % 6 ? 6 : 12; g.strokeStyle = '#7affc0'; g.beginPath(); g.moveTo(c + Math.cos(a) * (c - 6), c + Math.sin(a) * (c - 6)); g.lineTo(c + Math.cos(a) * (c - 6 - l), c + Math.sin(a) * (c - 6 - l)); g.stroke(); }
    const sw = -0.9; for (let k = 0; k < 24; k++) { g.fillStyle = `rgba(80,255,170,${0.32 * (1 - k / 24)})`; g.beginPath(); g.moveTo(c, c); g.arc(c, c, c - 8, sw - k * 0.04, sw - k * 0.04 + 0.05); g.fill(); }
    for (let i = 0; i < 14; i++) { const a = R() * 7, d = (0.15 + R() * 0.8) * (c - 14); g.fillStyle = i % 5 === 0 ? '#ffb040' : '#c8ffe0'; g.beginPath(); g.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, 3 + R() * 3, 0, 7); g.fill(); }
    g.strokeStyle = '#ffb040'; g.lineWidth = 2; g.beginPath(); g.arc(c + 40, c - 50, 12, 0, 7); g.stroke();
  },
  water(g, w, h, R) {  // waterfall (time-frequency) display: noise rows with a few bright tracks
    g.fillStyle = '#02060e'; g.fillRect(0, 0, w, h); const tr = [0.2 + R() * 0.15, 0.55 + R() * 0.1, 0.8]; const cw = 4;
    for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += cw) { let v = R() * 0.35; for (let t = 0; t < tr.length; t++) { const xc = (tr[t] + Math.sin(y * 0.02 + t) * 0.04) * w; v += Math.max(0, 1 - Math.abs(x - xc) / 10) * 0.8; } v = Math.min(1, v);
      g.fillStyle = v > 0.7 ? '#ffd860' : v > 0.45 ? '#38e0a8' : `rgb(${10},${Math.floor(30 + v * 200)},${Math.floor(60 + v * 260)})`; g.fillRect(x, y, cw, 3); }
    g.fillStyle = '#7aa0c0'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6); scan(g, w, h, 0.12);
  },
  grid(g, w, h, R) {   // projection table surface: grid, contour ovals, markers
    g.fillStyle = '#04141c'; g.fillRect(0, 0, w, h); g.lineWidth = 1;
    for (let x = 0; x <= w; x += 32) { g.strokeStyle = x % 128 ? '#0f4a5c' : '#2aa8c0'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 32) { g.strokeStyle = y % 128 ? '#0f4a5c' : '#2aa8c0'; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = '#48d8ff'; g.lineWidth = 2; for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(w * 0.5, h * 0.5, 30 + i * 34, 20 + i * 22, 0.3, 0, 7); g.stroke(); }
    for (let i = 0; i < 10; i++) { const x = R() * w, y = R() * h; g.strokeStyle = i % 3 ? '#ffb040' : '#ffffff'; g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x + 6, y); g.moveTo(x, y - 6); g.lineTo(x, y + 6); g.stroke(); }
    g.strokeStyle = '#ffb040'; g.lineWidth = 3; g.beginPath(); g.moveTo(w * 0.1, h * 0.8); g.lineTo(w * 0.4, h * 0.55); g.lineTo(w * 0.7, h * 0.62); g.lineTo(w * 0.9, h * 0.25); g.stroke();
  },
  keys(g, w, h, R) {
    g.fillStyle = '#0a0d12'; g.fillRect(0, 0, w, h); const cols = 12, rows = 4, cw = (w - 16) / cols, ch = (h - 16) / rows, ac = ['#58f0c8', '#f0a050', '#d8ecff'];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) rr(g, 8 + c * cw + 2, 8 + r * ch + 2, cw - 4, ch - 4, 4, R() < 0.3 ? ac[(r + c) % 3] : '#2a303c');
  },
  readout(g, w, h, R) {
    g.fillStyle = '#04070a'; g.fillRect(0, 0, w, h); const nd = 3, dw = (w - 20) / nd;
    for (let d = 0; d < nd; d++) { const x = 10 + d * dw + 6, y = 14, W = dw - 22, H = h * 0.52; for (const [sx, sy, sw, sh] of [[0, 0, W, 8], [0, H / 2 - 4, W, 8], [0, H - 8, W, 8], [0, 0, 8, H / 2], [W - 8, 0, 8, H / 2], [0, H / 2, 8, H / 2], [W - 8, H / 2, 8, H / 2]]) { g.fillStyle = R() < 0.65 ? '#58f0c8' : '#161a20'; g.fillRect(x + sx, y + sy, sw, sh); } }
    rr(g, 10, h * 0.8, w - 20, 10, 5, '#161a20'); rr(g, 10, h * 0.8, (w - 20) * 0.55, 10, 5, '#ffb040'); scan(g, w, h, 0.18);
  },
  hmi(g, w, h, R) {
    g.fillStyle = '#05080c'; g.fillRect(0, 0, w, h); const cols = ['#ffb040', '#58d0ff', '#60f0a0'];
    g.fillStyle = cols[0]; g.fillRect(6, 6, w - 12, 8); for (let i = 0; i < 3; i++) { g.fillStyle = '#20303c'; g.fillRect(8, 22 + i * 16, w - 16, 8); g.fillStyle = cols[i]; g.fillRect(8, 22 + i * 16, 20 + R() * (w - 40), 8); } scan(g, w, h, 0.2);
  },
};
const TC = {}, SM = {};
function scr(kind, seed = 1, w = 256, h = 160) { const k = `${kind}|${seed}|${w}|${h}`; return SM[k] || (SM[k] = new THREE.MeshBasicMaterial({ map: TC[k] = ctex(w, h, (g, W, H) => TEXD[kind](g, W, H, rng(seed * 9973 + 17))), color: new THREE.Color(1.3, 1.3, 1.3) })); }

let MT = null;
function mats() {
  if (MT) return MT;
  const std = (c, m = 0.3, r = 0.5, o = {}) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r, ...o }), bas = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, ...o });
  return MT = {
    white: std(0xe6ecef, 0.05, 0.35), cream: std(0xd8d4c4, 0.1, 0.5), steel: std(0x9aa0a8, 0.85, 0.38), dark: std(0x1d2026, 0.55, 0.5), rubber: std(0x0f1012, 0, 0.85), grey: std(0x6a707a, 0.5, 0.5),
    frame: std(0xb9c0c8, 0.7, 0.4), tray: std(0xdfe5e8, 0.1, 0.45), pipe: std(0x4a78a8, 0.4, 0.45), pipeG: std(0x5a6068, 0.6, 0.45), cab: std(0x4d5e6e, 0.3, 0.5), cabLt: std(0x8fa0ae, 0.3, 0.5),
    body: std(0x233c3e, 0.5, 0.5), top: std(0x16262a, 0.4, 0.45), seat: std(0x2d5658, 0, 0.92), yellow: std(0xe0b020, 0.2, 0.55), red: std(0xc02820, 0.3, 0.5), green: std(0x2f8a48, 0.3, 0.55), blue: std(0x2a6ab0, 0.4, 0.5), orange: std(0xe0661e, 0.2, 0.6),
    cup: std(0x1c2a22, 0.1, 0.8), leaf: std(0x3fa84a, 0, 0.8), leaf2: std(0x6cc455, 0, 0.8), leaf3: std(0x2c8a3c, 0, 0.8), glass: std(0xaed4ff, 0.05, 0.08, { transparent: true, opacity: 0.2, depthWrite: false }), clear: std(0xcfe6ee, 0.1, 0.1, { transparent: true, opacity: 0.25, depthWrite: false }),
    fluidG: std(0x58c070, 0, 0.2, { transparent: true, opacity: 0.55, depthWrite: false }), fluidB: std(0x4a9ad8, 0, 0.2, { transparent: true, opacity: 0.55, depthWrite: false }), fluidA: std(0xe0a030, 0, 0.2, { transparent: true, opacity: 0.55, depthWrite: false }),
    shellG: std(0x58c070, 0, 0.1, { transparent: true, opacity: 0.2, depthWrite: false }), shellB: std(0x4a9ad8, 0, 0.1, { transparent: true, opacity: 0.2, depthWrite: false }), shellA: std(0xe0a030, 0, 0.1, { transparent: true, opacity: 0.2, depthWrite: false }),
    dome: std(0x7ad8ff, 0, 0.1, { transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }), vialA: std(0xe8c070, 0, 0.3), vialB: std(0xa8d0e8, 0, 0.3), vialC: std(0xd86060, 0, 0.3), vialD: std(0x70c890, 0, 0.3),
    work: std(0x2a3036, 0.1, 0.4, { emissive: 0x6a7e8c, emissiveIntensity: 0.55 }), slot: bas(0x050607),
    led: bas(0xffb0f0), glowW: bas(0xe8f0f6), glowC: bas(0x58f0ff), glowA: bas(0xffb030), glowG: bas(0x40ff70), glowR: bas(0xff3a2a), glowT: bas(0x2fe0c8),
  };
}
function finish(g, name, extra = {}) {
  g.name = name; let tris = 0; g.traverse(o => { if (o.isMesh) tris += o.geometry.attributes.position.count / 3; });
  Object.assign(g.userData, { name, tris }, extra); return g;
}
const seated = (x, z) => ({ seat: { x, y: 0.48, z, yaw: PI }, spots: [[x, +(z - 0.41).toFixed(2), PI]] });
const chairAt = (x, z) => { const c = buildChair('ops', true); c.position.set(x, 0, z); c.rotation.y = PI; const grp = new THREE.Group(); grp.name = 'chair'; grp.add(c); grp.userData.tris = c.userData.tris; return grp; };

// ---------------------------------------------------------------- SCI-1 hydroponic grow bed (NFT bench)
// 2.0 x 0.9 m frame, top 0.9 m. Five white channels 0.1 m wide along x (cups every 0.2 m = 45 plants), LED bar 0.6 m above on two posts,
// 60 L reservoir and pump under the low (-x) end, drain manifold on the +x end. Operator side +z.
function growbed() {
  const M = mats(), b = new B(); const zs = [-0.32, -0.16, 0, 0.16, 0.32];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.05, 0.76, 0.05, M.frame, sx * 0.95, 0, sz * 0.4);
  for (const sz of [-1, 1]) b.box(1.96, 0.05, 0.04, M.frame, 0, 0.62, sz * 0.4);
  for (const sx of [-1, 1]) b.box(0.04, 0.05, 0.76, M.frame, sx * 0.95, 0.62, 0);
  b.box(2.0, 0.06, 0.92, M.tray, 0, 0.74, 0);
  for (const z of zs) { b.box(1.9, 0.08, 0.1, M.white, 0, 0.8, z); b.box(1.9, 0.02, 0.11, M.tray, 0, 0.88, z); }
  let n = 0; const rn = rng(7);
  for (const z of zs) for (let i = 0; i < 9; i++) {
    const x = -0.8 + i * 0.2; b.cyl(0.032, 0.025, 0.04, M.cup, x, 0.9, z, 5);
    const lf = [M.leaf, M.leaf2, M.leaf3][(n++) % 3], a = rn() * 6;
    b.cyl(0.0, 0.08, 0.08, lf, x, 0.92, z, 6, 0, a, 0); b.cyl(0.0, 0.065, 0.06, lf, x + 0.012, 0.935, z - 0.01, 5, 0.3, a + 1, 0.3);
  }
  for (const sx of [-1, 1]) { b.box(0.04, 0.68, 0.04, M.frame, sx * 1.0, 0.88, -0.38); b.box(0.04, 0.04, 0.8, M.frame, sx * 1.0, 1.52, -0.02); }
  b.box(1.9, 0.05, 0.14, M.dark, 0, 1.48, 0); b.box(1.84, 0.012, 0.1, M.led, 0, 1.468, 0);
  // reservoir and pump (under the tray at the low end), feed riser and manifold, drain manifold at the +x end and its return run
  b.box(0.6, 0.4, 0.5, M.clear, -0.5, 0.06, -0.02); b.box(0.56, 0.24, 0.46, M.fluidG, -0.5, 0.08, -0.02); b.box(0.62, 0.03, 0.52, M.white, -0.5, 0.46, -0.02);
  b.cyl(0.07, 0.07, 0.2, M.blue, -0.88, 0.0, 0.2, 10, 0, 0, PI / 2); b.cyl(0.08, 0.08, 0.06, M.dark, -0.74, 0.07, 0.2, 10, 0, 0, PI / 2);
  b.cyl(0.016, 0.016, 0.58, M.pipe, -0.98, 0.14, 0.2, 8); b.cyl(0.016, 0.016, 0.8, M.pipe, -0.98, 0.32, 0, 8, PI / 2);
  b.cyl(0.02, 0.02, 0.8, M.pipeG, 0.98, 0.32, 0, 8, PI / 2); for (const z of zs) b.box(0.06, 0.02, 0.02, M.pipeG, 0.96, 0.82, z);
  b.cyl(0.02, 0.02, 0.62, M.pipeG, 0.98, 0.08, 0.38, 8); b.cyl(0.02, 0.02, 1.5, M.pipeG, 0.23, -0.67, 0.38, 8, 0, 0, PI / 2);
  const g = new THREE.Group(); g.add(b.done('bench'));
  return finish(g, 'growbed', { top: 0.9, size: [2.0, 1.55, 0.9], box: [-1.05, 1.05, -0.5, 0.5], spots: [[0, 0.75, PI]], use: { tend: { x: 0, z: 0.75, ry: PI }, pump: { x: -0.85, z: 0.6, ry: PI } }, dept: 'sciences' });
}

// ---------------------------------------------------------------- SCI-6 nutrient reservoirs and dosing pump
// Bund tray 2.3 x 1.2 m (0.1 m walls). Three clear 0.6 m x 1.2 m tanks (A green, B blue, C amber) with level strips and bottom valves, and a 0.8 x 0.5 m dosing-pump board on
// a frame in front (three pump heads, colour-coded tubing to the tanks). Operator side +z.
function nutrient_tanks() {
  const M = mats(), b = new B(), tint = [['shellG', 'fluidG', 0x58c070], ['shellB', 'fluidB', 0x4a9ad8], ['shellA', 'fluidA', 0xe0a030]], xs = [-0.72, 0, 0.72];
  b.box(2.3, 0.03, 1.2, M.dark, 0, 0, 0); for (const sz of [-1, 1]) b.box(2.3, 0.1, 0.04, M.yellow, 0, 0, sz * 0.58); for (const sx of [-1, 1]) b.box(0.04, 0.1, 1.12, M.yellow, sx * 1.13, 0, 0);
  const tz = -0.25; const tubeCol = [M.green, M.blue, M.orange];
  tint.forEach(([sh, fl], i) => {
    const x = xs[i]; b.cyl(0.3, 0.3, 1.2, M[sh], x, 0.14, tz, 16); b.cyl(0.285, 0.285, 0.86, M[fl], x, 0.15, tz, 16); b.cyl(0.31, 0.31, 0.04, M.white, x, 1.34, tz, 16); b.cyl(0.07, 0.07, 0.05, M.dark, x, 1.38, tz, 10);
    b.cyl(0.06, 0.09, 0.06, M.grey, x, 0.08, tz, 10);
    b.box(0.045, 0.9, 0.012, M.white, x, 0.32, tz + 0.305); for (let k = 0; k < 7; k++) b.box(0.05, 0.008, 0.016, M.dark, x, 0.36 + k * 0.12, tz + 0.307);
    b.cyl(0.02, 0.02, 0.12, M.steel, x, 0.08, tz + 0.34, 8, PI / 2); b.box(0.04, 0.05, 0.03, tubeCol[i], x, 0.2, tz + 0.44);   // outlet and ball-valve handle
  });
  // dosing board on a frame: 0.8 x 0.5 panel at 0.62-1.12 m, tilted back 0.12
  const bz = 0.42; for (const sx of [-1, 1]) b.box(0.04, 0.64, 0.04, M.frame, sx * 0.4, 0.03, bz - 0.04); b.box(0.84, 0.04, 0.3, M.dark, 0, 0.03, bz);
  b.push(0, 0.62, bz, -0.12); b.box(0.8, 0.5, 0.03, M.white, 0, 0, 0); b.box(0.5, 0.1, 0.012, scr('hmi', 3, 200, 60), 0, 0.37, 0.021);
  [-0.25, 0, 0.25].forEach((px, i) => { b.cyl(0.055, 0.055, 0.06, tubeCol[i], px, 0.14, 0.05, 12, PI / 2); b.cyl(0.07, 0.07, 0.025, M.dark, px, 0.14, 0.095, 12, PI / 2); b.box(0.05, 0.022, 0.02, M.glowG, px + 0.0, 0.31, 0.02); b.cyl(0.012, 0.012, 0.04, M.steel, px, 0.05, 0.1, 8, PI / 2); });
  b.pop();
  [-0.25, 0, 0.25].forEach((px, i) => { const x0 = px, x1 = xs[i], zr = 0.3 + i * 0.05; b.rod(x0, 0.74, bz + 0.1, x0, 0.19 + i * 0.01, bz + 0.13, 0.014, tubeCol[i]); b.rod(x0, 0.19 + i * 0.01, bz + 0.13, x1, 0.19 + i * 0.01, tz + 0.44 + (i - 1) * 0.0, 0.014, tubeCol[i]); });
  const g = new THREE.Group(); g.add(b.done('tanks'));
  return finish(g, 'nutrient_tanks', { size: [2.3, 1.42, 1.2], box: [-1.15, 1.15, -0.6, 0.6], spots: [[0, 1.0, PI]], use: { board: { x: 0, z: 1.0, ry: PI }, tankA: { x: -0.72, z: 0.5, ry: PI }, tankC: { x: 0.72, z: 0.5, ry: PI } }, dept: 'sciences' });
}

// ---------------------------------------------------------------- SCI-2 sensor station (seated, wrap-around)
// 1.5 m wide seated stack: one 0.5 m round plot display centre, two waterfall screens on the wings, filter-key row, trackball. Operator pelvis (0, 0.48, 0.72).
function sensorstation() {
  const M = mats(), b = new B(), ang = Math.atan2(0.18, 0.6), yAt = (z) => 0.72 + (0.4 - z) * 0.18 / 0.6;
  for (const sx of [-1, 1]) { b.box(0.14, 0.7, 0.76, M.body, sx * 0.68, 0, 0); b.box(0.02, 0.4, 0.02, M.glowT, sx * 0.6, 0.15, 0.38); }
  b.box(1.3, 0.62, 0.04, M.dark, 0, 0.05, -0.36);
  b.push(0, 0.695, 0.06, ang); b.box(1.5, 0.05, 0.7, M.top, 0, 0, 0); b.box(0.9, 0.006, 0.12, scr('keys', 2, 256, 64), 0, 0.05, 0.2); b.pop();
  b.box(1.5, 0.04, 0.03, M.glowT, 0, 0.705, 0.41);
  // trackball (right) with wrist pad, left hand pad
  b.box(0.2, 0.035, 0.2, M.dark, 0.45, yAt(0.1) - 0.01, 0.1, ang); b.sph(0.035, M.red, 0.45, yAt(0.1) + 0.035, 0.1, 9); b.box(0.18, 0.025, 0.06, M.rubber, 0.45, yAt(0.0), 0.3, ang);
  // round plot: pillar + bezel + face, tilted 0.2 rad toward the operator
  b.cyl(0.035, 0.035, 0.3, M.steel, 0, 0.74, -0.3, 8); const th = -0.2, cyc = 1.12, cz = -0.3;
  b.cyl(0.285, 0.285, 0.05, M.dark, 0, cyc - 0.025, cz, 28, PI / 2 + th); b.disc(0.25, scr('plot', 4, 256, 256), 0, cyc - 0.03 * Math.sin(th), cz + 0.03 * Math.cos(th), th, 0, 0, 32);
  for (const sx of [-1, 1]) { b.cyl(0.025, 0.025, 0.2, M.steel, sx * 0.6, 0.9, -0.24, 8); b.panel(0.36, 0.48, scr('water', 5 + (sx > 0), 192, 256), M.dark, sx * 0.62, 0.9, -0.24, -0.1, -sx * 0.5); }
  b.cyl(0.02, 0.02, 0.8, M.steel, 0, -0.2, 0.32, 10, 0, 0, PI / 2);
  const g = new THREE.Group(); g.add(b.done('station')); g.add(chairAt(0, 0.72));
  return finish(g, 'sensorstation', { ...seated(0, 0.72), size: [1.5, 1.6, 0.8], box: [-0.78, 0.78, -0.4, 0.4], dept: 'sciences' });
}

// ---------------------------------------------------------------- SCI-3 chart table (holographic projection table)
// 1.6 x 1.0 m, top 0.9 m, dark glass surface with a glowing grid, a translucent dome of points above it (emissive, no text), a pull-out keyboard drawer on the +z long side.
function charttable() {
  const M = mats(), b = new B(), rn = rng(11);
  b.box(1.4, 0.06, 0.8, M.dark, 0, 0, 0); b.box(1.5, 0.78, 0.9, M.body, 0, 0.06, 0); for (const sx of [-1, 1]) b.box(0.02, 0.5, 0.5, M.top, sx * 0.755, 0.2, 0);
  b.box(1.6, 0.06, 1.0, M.top, 0, 0.84, 0); b.box(1.44, 0.004, 0.84, scr('grid', 8, 256, 160), 0, 0.9, 0); b.box(1.6, 0.012, 0.012, M.glowT, 0, 0.855, 0.506);
  b.box(0.7, 0.04, 0.08, M.steel, 0, 0.7, 0.48);
  // keyboard drawer pulled out
  b.box(0.66, 0.028, 0.34, M.dark, 0, 0.76, 0.58); b.box(0.6, 0.004, 0.22, scr('keys', 9, 256, 90), 0, 0.788, 0.6); b.box(0.68, 0.05, 0.02, M.steel, 0, 0.75, 0.76);
  // dome ring and glass dome (flattened hemisphere), points inside
  b.cyl(0.52, 0.55, 0.04, M.steel, 0, 0.9, 0.0, 24); b.put(G('dome', () => { const d = new THREE.SphereGeometry(0.5, 18, 6, 0, PI * 2, 0, PI / 2); d.scale(1, 0.62, 0.78); return d; }), M.dome, 0, 0.94, 0);
  for (let i = 0; i < 34; i++) { const a = rn() * 6.28, r = Math.sqrt(rn()) * 0.42, y = 0.99 + rn() * 0.2 * (1 - r / 0.5), m = i % 4 === 0 ? M.glowA : M.glowC; b.put(G('oct', () => new THREE.OctahedronGeometry(0.014)), m, Math.cos(a) * r, y, Math.sin(a) * r * 0.75); }
  const g = new THREE.Group(); g.add(b.done('table'));
  return finish(g, 'charttable', { top: 0.9, size: [1.6, 1.25, 1.0], box: [-0.8, 0.8, -0.5, 0.5], spots: [[0, 0.95, PI]], use: { stand: { x: 0, z: 0.95, ry: PI }, side_l: { x: -1.1, z: 0, ry: PI / 2 }, side_r: { x: 1.1, z: 0, ry: -PI / 2 }, keyboard: { x: 0, z: 0.95, ry: PI } }, dept: 'sciences' });
}

// ---------------------------------------------------------------- SCI-4 bench analyser (spectrometer on its own bench)
// Bench 1.2 x 0.7 m, top 0.9 m (cabinet with two doors and a drawer). Instrument 0.6 x 0.5 x 0.35 m on the left: sliding sample door front-left, 8-position carousel in a round window,
// small screen and three keys on the right, vent grille on the back. Sample rack, waste bottle and a wash bottle on the right of the bench.
function spectrometer() {
  const M = mats(), b = new B(); const ix = -0.22, iz = -0.02, T = 0.9;
  b.box(1.1, 0.07, 0.6, M.dark, 0, 0, 0); b.box(1.16, 0.77, 0.66, M.cabLt, 0, 0.07, 0); b.box(1.2, 0.06, 0.7, M.dark, 0, 0.84, 0);
  for (const sx of [-1, 1]) { b.box(0.012, 0.6, 0.012, M.dark, sx * 0.29, 0.12, 0.335); b.box(0.02, 0.2, 0.02, M.steel, sx * 0.07, 0.4, 0.345); }
  b.box(1.1, 0.012, 0.012, M.dark, 0, 0.66, 0.335); b.box(0.3, 0.025, 0.02, M.steel, 0.0, 0.58, 0.345); b.box(1.15, 0.012, 0.012, M.dark, 0, 0.12, 0.335);
  // instrument body
  b.box(0.6, 0.3, 0.5, M.white, ix, T, iz); b.box(0.6, 0.05, 0.5, M.grey, ix, T + 0.3, iz); b.box(0.5, 0.012, 0.3, M.dark, ix, T + 0.35, iz - 0.05);
  const fz = iz + 0.25;
  b.box(0.2, 0.2, 0.012, M.dark, ix - 0.18, T + 0.05, fz + 0.002); b.box(0.22, 0.02, 0.03, M.steel, ix - 0.18, T + 0.26, fz + 0.012); b.box(0.22, 0.02, 0.03, M.steel, ix - 0.18, T + 0.03, fz + 0.012); b.box(0.03, 0.06, 0.03, M.steel, ix - 0.06, T + 0.14, fz + 0.02);
  b.cyl(0.075, 0.075, 0.012, M.dark, ix + 0.04, T + 0.12, fz + 0.002, 20, PI / 2); for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; b.cyl(0.011, 0.011, 0.02, i === 0 ? M.vialC : M.vialB, ix + 0.04 + Math.cos(a) * 0.05, T + 0.12 + Math.sin(a) * 0.05 - 0.01, fz + 0.012, 5, PI / 2); }
  b.cyl(0.082, 0.082, 0.006, M.steel, ix + 0.04, T + 0.12, fz + 0.001, 20, PI / 2);
  b.panel(0.14, 0.09, scr('readout', 12, 160, 100), M.dark, ix + 0.22, T + 0.18, fz, 0, 0);
  for (let i = 0; i < 3; i++) b.box(0.03, 0.016, 0.012, [M.glowG, M.glowA, M.red][i], ix + 0.17 + i * 0.045, T + 0.12, fz + 0.01);
  for (let i = 0; i < 6; i++) b.box(0.4, 0.01, 0.01, M.slot, ix, T + 0.06 + i * 0.035, iz - 0.252);   // back vent grille
  for (const sx of [-1, 1]) b.cyl(0.02, 0.025, 0.02, M.rubber, ix + sx * 0.25, T - 0.0, iz + 0.2, 6);
  // right of the bench: sample rack with 8 vials, waste bottle, wash bottle
  b.box(0.22, 0.03, 0.1, M.steel, 0.32, T, 0.12); const vm = [M.vialA, M.vialB, M.vialC, M.vialD]; for (let i = 0; i < 8; i++) b.cyl(0.013, 0.013, 0.075, vm[i % 4], 0.235 + (i % 4) * 0.05, T + 0.03, 0.095 + Math.floor(i / 4) * 0.05, 5);
  b.cyl(0.07, 0.07, 0.24, M.orange, 0.45, T, -0.18, 12); b.cyl(0.03, 0.03, 0.03, M.dark, 0.45, T + 0.24, -0.18, 8); b.cyl(0.03, 0.035, 0.18, M.white, 0.32, T, -0.22, 10); b.cyl(0.012, 0.015, 0.05, M.dark, 0.32, T + 0.18, -0.22, 6);
  const g = new THREE.Group(); g.add(b.done('bench'));
  return finish(g, 'spectrometer', { top: 0.9, size: [1.2, 1.3, 0.7], box: [-0.6, 0.6, -0.35, 0.35], spots: [[ix, 0.65, PI]], use: { stand: { x: ix, z: 0.65, ry: PI }, door: { x: ix - 0.18, y: 0.97, z: 0.25 }, rack: { x: 0.32, y: 0.92, z: 0.12 } }, dept: 'sciences' });
}

// ---------------------------------------------------------------- SCI-5 sample refrigerator
// 0.7 x 0.7 x 1.9 m: glass door with four wire shelves of vial racks, a header with a temperature readout and an alarm lamp, a door lock, a kick plate. Door side +z.
function samplefridge() {
  const M = mats(), b = new B(), rn = rng(5); const W = 0.7, D = 0.7, H = 1.9;
  b.box(W, 0.1, D, M.dark, 0, 0, 0); b.box(W, 0.04, D, M.white, 0, 0.1, 0);
  b.box(W, H - 0.14, 0.04, M.white, 0, 0.14, -D / 2 + 0.02); for (const sx of [-1, 1]) b.box(0.04, H - 0.14, D, M.white, sx * (W / 2 - 0.02), 0.14, 0); b.box(W, 0.04, D, M.white, 0, H - 0.04, 0);
  b.box(W - 0.08, 0.012, 0.014, M.glowW, 0, H - 0.28, 0.28);
  // shelves and racks
  const rows = [0.34, 0.66, 0.98, 1.3]; rows.forEach((y, k) => {
    b.box(0.62, 0.008, 0.012, M.steel, 0, y, 0.29); b.box(0.62, 0.008, 0.012, M.steel, 0, y, -0.28); for (const sx of [-1, 1]) b.box(0.012, 0.008, 0.58, M.steel, sx * 0.3, y, 0); for (let i = 0; i < 5; i++) b.box(0.6, 0.006, 0.006, M.steel, 0, y, -0.2 + i * 0.12);
    [-0.15, 0.15].forEach((x, j) => { b.box(0.22, 0.04, 0.3, (k + j) % 2 ? M.blue : M.orange, x, y + 0.008, 0.0); for (let v = 0; v < 4; v++) b.cyl(0.015, 0.015, 0.085, [M.vialA, M.vialB, M.vialC, M.vialD][(v + k + j) % 4], x - 0.06 + (v % 2) * 0.12, y + 0.04, -0.07 + Math.floor(v / 2) * 0.14, 5); });
  });
  // door: frame around glass, lock, handle, hinges
  const dz = D / 2 + 0.01, fh = 1.52, fy = 0.14;
  b.box(0.04, fh, 0.05, M.white, -0.33, fy, dz); b.box(0.04, fh, 0.05, M.white, 0.33, fy, dz); b.box(W - 0.04, 0.04, 0.05, M.white, 0, fy, dz); b.box(W - 0.04, 0.04, 0.05, M.white, 0, fy + fh - 0.04, dz);
  b.box(W - 0.08, fh - 0.08, 0.012, M.glass, 0, fy + 0.04, dz + 0.006); b.box(0.03, 0.55, 0.03, M.steel, 0.28, fy + 0.5, dz + 0.06); for (const y of [0.6, 1.05]) b.box(0.03, 0.03, 0.05, M.steel, 0.28, fy + y - 0.05, dz + 0.035);
  for (const y of [0.1, 0.7, 1.3]) b.cyl(0.012, 0.012, 0.08, M.steel, -0.345, fy + y, dz + 0.01, 8);
  // header: readout, alarm lamps, mute button, key lock
  b.box(W, 0.26, 0.05, M.dark, 0, fy + fh + 0.0, dz - 0.01); b.box(0.2, 0.1, 0.01, scr('readout', 14, 160, 100), 0, fy + fh + 0.08, dz + 0.016); b.cyl(0.018, 0.018, 0.01, M.glowG, -0.18, fy + fh + 0.17, dz + 0.016, 10, PI / 2); b.cyl(0.018, 0.018, 0.01, M.glowA, -0.26, fy + fh + 0.17, dz + 0.016, 10, PI / 2);
  b.box(0.05, 0.025, 0.012, M.red, 0.18, fy + fh + 0.17, dz + 0.016); b.cyl(0.025, 0.025, 0.012, M.steel, 0.27, fy + fh + 0.1, dz + 0.016, 10, PI / 2); b.box(0.004, 0.03, 0.014, M.dark, 0.27, fy + fh + 0.087, dz + 0.019);
  const g = new THREE.Group(); g.add(b.done('fridge'));
  return finish(g, 'samplefridge', { size: [W, H, D], box: [-0.4, 0.4, -0.4, 0.4], spots: [[0, 0.75, PI]], use: { stand: { x: 0, z: 0.75, ry: PI }, door: { x: 0.28, y: 1.0, z: 0.4 }, readout: { x: 0, y: 1.76, z: 0.4 } }, dept: 'sciences' });
}

// ---------------------------------------------------------------- SCI-8 fume hood
// 1.5 x 0.8 x 2.3 m ducted fume cupboard: base cabinet with blank hazard diamond, lit work surface at 0.9 m, glass sash half raised (opening 0.9 to 1.55 m), valve strip on the front right
// post, airflow monitor in the header, and a 0.3 m duct collar rising to the ceiling (3.1 m).
function fumehood() {
  const M = mats(), b = new B();
  b.box(1.5, 0.82, 0.8, M.cab, 0, 0, 0); b.box(0.01, 0.74, 0.01, M.dark, 0, 0.04, 0.405); for (const sx of [-0.3, 0.3]) b.box(0.02, 0.16, 0.02, M.steel, sx, 0.5, 0.41);
  b.box(0.012, 0.012, 0.01, M.dark, 0, 0.82, 0.4); b.box(1.46, 0.02, 0.01, M.dark, 0, 0.06, 0.402); b.box(1.46, 0.02, 0.01, M.dark, 0, 0.76, 0.402);
  b.box(0.17, 0.17, 0.006, M.dark, -0.5, 0.35, 0.403, 0, 0, PI / 4); b.box(0.135, 0.135, 0.008, M.yellow, -0.5, 0.35 + 0.0175 * 0, 0.405, 0, 0, PI / 4);
  b.box(1.5, 0.06, 0.8, M.dark, 0, 0.82, 0); b.box(1.2, 0.004, 0.55, M.work, 0, 0.88, -0.05);
  for (const sx of [-1, 1]) b.box(0.08, 1.42, 0.8, M.cream, sx * 0.71, 0.88, 0); b.box(1.34, 1.42, 0.05, M.white, 0, 0.88, -0.375); b.box(1.2, 0.04, 0.02, M.slot, 0, 0.96, -0.34);
  b.box(1.5, 0.14, 0.8, M.cream, 0, 2.16, 0); b.box(1.5, 0.14, 0.04, M.dark, 0, 2.02, 0.38); b.box(1.2, 0.02, 0.12, M.glowW, 0, 2.14, 0.0);
  b.box(0.24, 0.1, 0.02, M.dark, -0.4, 2.04, 0.41); b.box(0.2, 0.07, 0.006, scr('readout', 15, 160, 100), -0.4, 2.055, 0.42); b.box(0.025, 0.025, 0.012, M.glowG, -0.15, 2.07, 0.41);
  // sash: glass pane at 1.55 to 2.17 with frame and a handle bar
  b.box(1.32, 0.62, 0.012, M.glass, 0, 1.55, 0.33); for (const sx of [-1, 1]) b.box(0.03, 0.64, 0.03, M.steel, sx * 0.66, 1.54, 0.33); b.box(1.36, 0.03, 0.04, M.steel, 0, 1.53, 0.33); b.cyl(0.015, 0.015, 0.7, M.steel, 0, 1.47 - 0.35 + 0.35, 0.37, 10, 0, 0, PI / 2);
  // valve strip on the front right post
  b.box(0.14, 1.12, 0.07, M.cream, 0.68, 0.88, 0.37); for (let i = 0; i < 3; i++) { const y = 1.45 - i * 0.2, c = [M.yellow, M.blue, M.green][i]; b.cyl(0.025, 0.025, 0.05, M.steel, 0.68, y, 0.44, 8, PI / 2); b.box(0.09, 0.025, 0.025, c, 0.68, y + 0.0, 0.49); }
  b.box(0.08, 0.1, 0.02, M.dark, 0.68, 1.1, 0.44); b.cyl(0.014, 0.014, 0.01, M.glowG, 0.68, 1.12, 0.455, 8, PI / 2);
  // duct collar, flange and duct
  b.cyl(0.19, 0.22, 0.1, M.steel, 0, 2.3, -0.05, 16); b.cyl(0.15, 0.15, 0.8, M.pipeG, 0, 2.4, -0.05, 14); b.cyl(0.2, 0.2, 0.03, M.steel, 0, 2.55, -0.05, 14);
  const g = new THREE.Group(); g.add(b.done('hood'));
  return finish(g, 'fumehood', { size: [1.5, 3.2, 0.8], box: [-0.78, 0.78, -0.42, 0.5], spots: [[0, 0.75, PI]], use: { stand: { x: 0, z: 0.75, ry: PI }, sash: { x: 0, y: 1.5, z: 0.4 }, valves: { x: 0.68, y: 1.3, z: 0.5 } }, dept: 'sciences' });
}

export const kinds = { growbed, nutrient_tanks, sensorstation, charttable, spectrometer, samplefridge, fumehood };
export const KIND_NAMES = Object.keys(kinds);
// gap-list id, real analogue, suggested rooms and which EQUIPMENT script each can reuse (docs/propart-sciences.md)
export const META = {
  growbed: { id: 'SCI-1', rooms: ['arboretum'], equip: 'tree' }, nutrient_tanks: { id: 'SCI-6', rooms: ['arboretum'], equip: 'tank' }, sensorstation: { id: 'SCI-2', rooms: ['lab', 'bridge'], equip: 'desk' },
  charttable: { id: 'SCI-3', rooms: ['lab'], equip: 'console' }, spectrometer: { id: 'SCI-4', rooms: ['lab', 'sickbay'], equip: 'workbench' }, samplefridge: { id: 'SCI-5', rooms: ['lab', 'sickbay'], equip: 'cabinet' }, fumehood: { id: 'SCI-8', rooms: ['lab'], equip: 'workbench' },
};
