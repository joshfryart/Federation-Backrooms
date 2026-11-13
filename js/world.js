import * as THREE from 'three';
import { SEARCHABLE, clutterFor } from './items.js';
import { ROOMS, mulberry32 } from './data.js';
import { pbr, PBR_SETS, has as hasModel, instance } from './assets.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const TS = 2.5;      // tile size (m)
export const WH = 3.2;      // wall height (m)
export const TUBE_H = 1.25; // crawl height of a Jiffy tube (m)
export const TUBE_UP = 1.7; // floor height of a tube's upper run (reached by ladder)
const TUBE_SIDE = 0.65;     // thickness of the tube's own side walls: leaves a 1.2 m wide crawlway in a 2.5 m tile

// ------------------------------------------------------------------
// Procedural textures
// ------------------------------------------------------------------
const texCache = {};
let OWN = null;   // while a World is being built: collects the canvas textures it creates so dispose() can free them
function canvasTex(size, draw, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat, repeat);
  if (OWN) OWN.push(t);
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
  for (const k of PBR_SETS) { const p = pbr(k); if (p) { texCache[k] = p.c; texCache.d[k] = { normal: p.n, rough: p.r, orm: p.orm }; texCache.real = true; } }
  if (pbr('wall')) {   // bulkhead = real metal plating (tiled 2×) with starship panel seams, kick plate and header band drawn over it
    const p = pbr('wall');
    texCache.wall = canvasTex(1024, (g, s) => {
      g.drawImage(p.c.image, 0, 0, s, s);
      g.fillStyle = 'rgba(232,232,232,0.42)'; g.fillRect(0, 0, s, s);                                  // flatten plate contrast: smooth panels, not blockwork
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
    const n = p.n.clone(), r = p.r.clone(); n.repeat.set(1, 1); r.repeat.set(2, 2); n.needsUpdate = r.needsUpdate = true; texCache.d.wall = { normal: n, rough: r };
  }
  return texCache;
}

// ------------------------------------------------------------------
// Level generation (pure data)
// ------------------------------------------------------------------
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export { generate, genShip, shipPlan } from './gen.js';

// ------------------------------------------------------------------
// Prop meshes
// ------------------------------------------------------------------
const M = {};
// wall label display: dark glass, a tinted coloured bar, glyph-like text rows, a status chip and scanlines (tinted per instance; white = lit)
let _label;
function labelTex() {
  if (_label) return _label;
  return _label = canvasTex(256, (g, s) => {
    const r = (a) => { a = (a * 9301 + 49297) % 233280; return a / 233280; }; let q = 7;
    g.fillStyle = '#1a1c22'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, s * 0.3, s);                    // tinted block
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(s * 0.3, 0, s * 0.7, s * 0.07);
    for (let row = 0; row < 5; row++) { let x = s * 0.34; const y = s * (0.14 + row * 0.095);
      while (x < s * 0.94) { q = Math.floor(r(q + row) * 1e5); const w = 6 + (q % 26); g.fillStyle = `rgba(255,255,255,${0.55 + (q % 4) * 0.1})`; g.fillRect(x, y, Math.min(w, s * 0.94 - x), 7); x += w + 5; } }
    g.fillStyle = '#ffffff'; g.fillRect(s * 0.06, s * 0.1, s * 0.18, s * 0.06); g.fillRect(s * 0.06, s * 0.2, s * 0.18, s * 0.025);
    g.fillStyle = 'rgba(0,0,0,0.28)'; for (let y = 0; y < s; y += 3) g.fillRect(0, y, s, 1);   // scanlines
    g.strokeStyle = '#555b66'; g.lineWidth = 6; g.strokeRect(3, 3, s - 6, s);
  });
}
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
  M.glass = std({ color: 0x9fd0ff, roughness: 1, metalness: 0, transparent: true, opacity: 0.25, ...(T.d.glass ? { normalMap: T.d.glass.normal, roughnessMap: T.d.glass.rough } : { roughness: 0.05 }) });
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
  M.keys = new THREE.MeshBasicMaterial({ color: 0xffffff }); M.keyDark = std({ color: 0x15171c, roughness: 0.4, metalness: 0.3 }); M.vial = std({ color: 0xaaddcc, roughness: 0.1, transparent: true, opacity: 0.55 });
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
// instanced button/key grid (one draw call): cols x rows boxes centred on the origin; colours = per-instance tints (needs a basic, white material)
function grid(cols, rows, dx, dz, sx, sy, sz, mat, colors) {
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(sx, sy, sz), mat, cols * rows), mx = new THREE.Matrix4(), c = new THREE.Color(); let n = 0;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { mx.makeTranslation((i - (cols - 1) / 2) * dx, 0, (j - (rows - 1) / 2) * dz); im.setMatrixAt(n, mx); if (colors) im.setColorAt(n, c.set(colors[Math.floor(Math.random() * colors.length)]).multiplyScalar(0.55 + Math.random() * 0.6)); n++; }
  im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; return im;
}
const at = (o, x, y, z, rx = 0, ry = 0, rz = 0) => { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; };
// CC0 scanned prop (Poly Haven) scaled to `height`; null if the file did not load
function model(name, height, x = 0, z = 0, ry = 0, y = 0) {
  if (!hasModel(name)) return null; const i = instance(name, { height }); i.root.position.set(x, y, z); i.root.rotation.y = ry;
  i.root.traverse(o => { if (o.isMesh) { o.frustumCulled = true; o.material.envMapIntensity = 0.6; } }); return i.root;
}
const _psz = new THREE.Vector3();
export function buildProp(kind) {
  const m = mats(); const g = new THREE.Group(); const R = Math.random;
  switch (kind) {
    case 'console': { g.userData.top = 0.92;
      g.add(rbox(1.7, 0.86, 0.75, m.dark, 0, 0, 0, 0.06)); g.add(rbox(1.78, 0.06, 0.82, m.metal, 0, 0.86, 0, 0.02));
      const desk = rbox(1.6, 0.04, 0.6, m.screenB, 0, 0.93, 0.06, 0.01); desk.rotation.x = 0.22; g.add(desk);
      const back = rbox(1.6, 0.62, 0.08, m.dark, 0, 0.95, -0.33, 0.03); back.rotation.x = -0.12; g.add(back);
      g.add(rbox(1.56, 0.05, 0.1, m.metal, 0, 1.56, -0.36, 0.02)); for (const sx of [-1, 1]) { g.add(box(0.03, 0.5, 0.012, m.glowB, sx * 0.78, 1.01, -0.27)); }
      const scr = box(1.46, 0.5, 0.01, m.screenO, 0, 1.01, -0.275); scr.rotation.x = -0.12; g.add(scr);
      const cols = [0x4ac0ff, 0x4ac0ff, 0xffa040, 0x30ff60, 0xff3020, 0xffffff];   // keypad blocks, a lit button bank and sliders on the tilted desk
      g.add(at(grid(8, 4, 0.052, 0.05, 0.04, 0.012, 0.038, m.keyDark), -0.42, 1.0, 0.1, 0.22));
      g.add(at(grid(6, 3, 0.07, 0.07, 0.05, 0.01, 0.05, m.keys, cols), 0.44, 1.0, 0.1, 0.22));
      for (let i = 0; i < 4; i++) { g.add(at(box(0.012, 0.012, 0.18, m.keyDark), -0.12 + i * 0.07, 1.0, 0.2, 0.22)); g.add(at(box(0.03, 0.02, 0.03, m.blinkG), -0.12 + i * 0.07, 1.01, 0.15 + (i % 3) * 0.05, 0.22)); }
      g.add(at(cyl(0.035, 0.035, 0.012, m.metal, 0, 0, 0, 12), 0.05, 0.99, 0.25, 0.22));   // trackball
      g.add(box(0.07, 0.03, 0.07, m.blinkR, -0.72, 0.93, 0.33)); g.add(box(0.07, 0.03, 0.07, m.blinkG, -0.6, 0.93, 0.33));
      for (let i = 0; i < 7; i++) g.add(box(1.1, 0.012, 0.02, m.keyDark, 0, 0.08 + i * 0.045, 0.377));   // intake louvres
      g.add(box(1.5, 0.03, 0.02, m.glowB, 0, 0.1, 0.38)); g.add(rbox(0.5, 0.4, 0.02, m.panel, -0.5, 0.3, 0.375, 0.01)); g.add(rbox(0.5, 0.4, 0.02, m.panel, 0.5, 0.3, 0.375, 0.01)); g.add(box(0.4, 0.2, 0.01, m.screenG, 0.5, 0.4, 0.388));
      g.add(cyl(0.025, 0.025, 0.5, m.pipe, 0.82, 0.05, -0.3, 8)); break; }
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
      const sl = cyl(0.51, 0.51, WH - 0.9, m.glass, 0, 0.5, 0, 24); g.add(sl);   // glass reaction sleeve
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.add(box(0.05, WH - 1.0, 0.05, m.glowB, Math.cos(a) * 0.44, 0.55, Math.sin(a) * 0.44)); }   // plasma injector rods
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.add(at(box(0.1, 0.04, 0.06, i % 3 ? m.blinkG : m.glowO), Math.cos(a) * 0.86, 0.34, Math.sin(a) * 0.86, 0, -a, 0)); }   // status lamps round the base
      g.add(cyl(1.0, 1.0, 0.025, m.dark, 0, 0, 0, 28));
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.78, x = Math.cos(a) * 0.72, z = Math.sin(a) * 0.72; g.add(cyl(0.05, 0.05, WH, m.pipe, x, 0, z, 8)); g.add(rbox(0.16, 0.5, 0.16, m.dark, x, 1.3, z, 0.03));
        g.add(box(0.03, 0.2, 0.03, m.glowO, x * 1.1, 1.45, z * 1.1)); for (const h of [0.9, 1.8, 2.5]) { const p = cyl(0.025, 0.025, 0.3, m.metal, 0, -0.15, 0, 8); p.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a))); p.position.set(x * 0.66, h, z * 0.66); g.add(p); } }
      break; }
    case 'shuttle': { g.userData.top = 1.24;
      const hull = rbox(2.1, 0.95, 1.5, m.white, 0, 0.28, 0, 0.22); g.add(hull);
      const nose = rbox(0.9, 0.62, 1.3, m.white, 1.2, 0.28, 0, 0.25); g.add(nose);
      const win = rbox(0.5, 0.3, 1.1, m.glass, 1.32, 0.66, 0, 0.1); win.material = m.dark; g.add(win);
      g.add(at(box(0.46, 0.03, 0.9, m.glowB), 1.36, 0.82, 0, 0, 0, -0.35));   // cockpit glass glint
      for (const sz of [-1, 1]) { const nac = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 1.5, 6, 12), m.metal); nac.rotation.z = Math.PI / 2; nac.position.set(-0.25, 0.3, sz * 0.92); g.add(nac); g.add(box(0.5, 0.06, 0.02, m.glowB, -0.25, 0.27, sz * 1.085));
        const ex = cyl(0.13, 0.15, 0.1, m.dark, 0, 0, 0, 14); at(ex, -1.04, 0.3, sz * 0.92, 0, 0, Math.PI / 2); g.add(ex); g.add(at(cyl(0.09, 0.09, 0.02, m.glowO, 0, 0, 0, 14), -1.1, 0.3, sz * 0.92, 0, 0, Math.PI / 2));   // engine bell + glow
        g.add(box(0.06, 0.06, 0.06, sz < 0 ? m.blinkR : m.blinkG, 0.3, 0.3, sz * 1.1));   // port / starboard running lights
        for (const sx of [-0.6, 0.7]) { g.add(cyl(0.025, 0.025, 0.28, m.pipe, sx, 0.05, sz * 0.8, 8)); g.add(cyl(0.09, 0.09, 0.03, m.dark, sx, 0, sz * 0.8, 10)); } }   // landing struts + pads
      g.add(box(1.2, 0.05, 0.02, m.hazard, -0.1, 0.72, 0.755)); g.add(rbox(0.7, 0.72, 0.02, m.panel, -0.6, 0.36, 0.752, 0.01));
      for (const sx of [-0.8, -0.35, 0.2, 0.7]) g.add(box(0.012, 0.8, 0.012, m.dark, sx, 0.34, 0.752));   // hull panel seams
      g.add(box(0.3, 0.1, 0.02, m.dark, 0.4, 0.5, 0.756)); g.add(box(0.1, 0.06, 0.01, m.blinkG, 0.42, 0.52, 0.768));   // registry plate
      g.add(cyl(0.012, 0.012, 0.35, m.metal, -0.5, 1.22, 0, 6)); g.add(box(0.2, 0.012, 0.012, m.metal, -0.5, 1.5, 0));   // comm antenna
      g.add(rbox(0.5, 0.05, 1.0, m.dark, -0.6, 1.22, 0, 0.02)); break; }
    case 'holocube': {
      const c = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), m.holo); c.position.y = 1.0; c.name = 'spin'; g.add(c); g.add(cyl(0.22, 0.3, 0.3, m.dark)); g.add(cyl(0.18, 0.18, 0.02, m.glowO, 0, 0.3, 0)); break; }
    case 'pad': {
      g.add(cyl(1.0, 1.08, 0.14, m.dark, 0, 0, 0, 28)); g.add(cyl(0.98, 0.98, 0.02, m.metal, 0, 0.14, 0, 28));
      const p = cyl(0.7, 0.7, 0.03, m.pad, 0, 0.155, 0, 28); g.add(p); const top = cyl(0.7, 0.7, 0.05, m.pad, 0, WH - 0.2, 0, 28); g.add(top); g.add(cyl(0.9, 0.8, 0.14, m.dark, 0, WH - 0.14, 0, 28));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.03, 6, 32), m.glowB); ring.rotation.x = Math.PI / 2; ring.position.y = 0.17; g.add(ring);
      for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.2 + i * 0.17, 0.008, 4, 36), m.glowB); r.rotation.x = Math.PI / 2; r.position.y = 0.175; g.add(r); }
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.add(at(box(0.16, 0.02, 0.07, i % 2 ? m.hazard : m.dark), Math.cos(a) * 0.9, 0.14, Math.sin(a) * 0.9, 0, -a, 0)); g.add(at(box(0.1, 0.1, 0.1, m.dark), Math.cos(a) * 0.82, WH - 0.24, Math.sin(a) * 0.82, 0, -a, 0)); g.add(at(box(0.04, 0.04, 0.04, i % 2 ? m.glowB : m.glowO), Math.cos(a) * 0.82, WH - 0.26, Math.sin(a) * 0.82)); }
      for (const a of [0.8, 2.4, 4.0, 5.5]) g.add(cyl(0.025, 0.025, WH - 0.3, m.pipe, Math.cos(a) * 0.95, 0.14, Math.sin(a) * 0.95, 8));   // guide posts to the overhead emitter
      const beam = cyl(0.55, 0.55, WH - 0.4, m.pad, 0, 0.2, 0, 24); beam.material = beam.material.clone(); beam.material.opacity = 0.08; beam.material.depthWrite = false; beam.userData.ownMat = true; g.add(beam); break; }
    case 'bunk': { g.userData.top = 0.52;
      g.add(rbox(1.9, 0.34, 0.95, m.dark, 0, 0, 0, 0.05)); g.add(rbox(1.84, 0.16, 0.88, m.sheet, 0, 0.34, 0, 0.07)); g.add(rbox(0.42, 0.12, 0.6, m.white, -0.66, 0.48, 0, 0.06));
      const blanket = rbox(1.1, 0.06, 0.92, m.fabric, 0.36, 0.47, 0, 0.03); g.add(blanket);
      g.add(rbox(1.9, 0.9, 0.08, m.panel, 0, 0.34, -0.47, 0.03)); g.add(box(0.5, 0.03, 0.02, m.glowO, -0.6, 1.1, -0.42));
      g.add(model('ph_utilbox', 1.15, 0.6, 0.85, Math.PI) || rbox(0.6, 0.9, 0.5, m.metal, 0.75, 0, 0.8)); break; }
    case 'table': { g.userData.top = 0.78;
      g.add(rbox(1.5, 0.06, 1.0, m.white, 0, 0.72, 0, 0.03)); g.add(cyl(0.06, 0.06, 0.7, m.metal, 0, 0.02, 0)); g.add(cyl(0.36, 0.4, 0.03, m.metal));
      for (const sz of [-1, 1]) { g.add(cyl(0.2, 0.2, 0.06, m.fabric, 0, 0.42, sz * 0.95)); g.add(cyl(0.04, 0.04, 0.42, m.metal, 0, 0, sz * 0.95)); g.add(cyl(0.2, 0.22, 0.02, m.metal, 0, 0, sz * 0.95)); }
      const tray = rbox(0.4, 0.02, 0.28, m.metal, 0.3, 0.78, 0.1, 0.008); tray.rotation.y = 0.3; g.add(tray); g.add(cyl(0.035, 0.03, 0.1, m.glass, 0.34, 0.8, 0.08, 10)); g.add(cyl(0.035, 0.03, 0.1, m.white, -0.35, 0.78, -0.2, 10)); break; }
    case 'biobed': { g.userData.top = 0.7;
      g.add(rbox(0.7, 0.5, 1.5, m.metal, 0, 0, 0, 0.1)); g.add(rbox(0.95, 0.1, 2.0, m.white, 0, 0.5, 0, 0.04)); g.add(rbox(0.85, 0.08, 1.85, m.sheet, 0, 0.6, 0.02, 0.04)); g.add(rbox(0.5, 0.08, 0.34, m.white, 0, 0.67, -0.72, 0.04));
      const arch = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.05, 8, 20, Math.PI), m.white); arch.position.set(0, 0.6, 0.1); g.add(arch);
      g.add(rbox(0.14, 0.07, 0.62, m.dark, 0, 1.13, 0.1, 0.03)); g.add(box(0.1, 0.02, 0.5, m.glowB, 0, 1.11, 0.1)); for (const sx of [-1, 1]) g.add(box(0.02, 0.06, 0.02, m.blinkG, sx * 0.52, 0.64, 0.1));   // diagnostic sensor bar
      for (const sx of [-1, 1]) { g.add(rbox(0.04, 0.03, 1.2, m.metal, sx * 0.5, 0.74, 0.05, 0.01)); for (const z of [-0.5, 0.5]) g.add(box(0.03, 0.14, 0.03, m.metal, sx * 0.5, 0.6, z)); }   // side rails
      g.add(rbox(0.3, 0.06, 0.1, m.dark, 0.58, 0.45, -0.3, 0.02)); g.add(at(grid(4, 2, 0.05, 0.05, 0.035, 0.008, 0.035, m.keys, [0x4ac0ff, 0x30ff60, 0xffa040]), 0.58, 0.485, -0.3));
      g.add(rbox(0.12, 1.5, 0.1, m.dark, 0, 0, -1.02, 0.03)); const mon = rbox(0.9, 0.5, 0.06, m.dark, 0, 1.25, -1.0, 0.03); mon.rotation.x = 0.15; g.add(mon);
      const scr = box(0.82, 0.42, 0.01, m.screenG, 0, 1.29, -0.962); scr.rotation.x = 0.15; g.add(scr);
      g.add(cyl(0.02, 0.02, 1.7, m.metal, -0.75, 0, -0.55, 8)); g.add(box(0.28, 0.03, 0.03, m.metal, -0.65, 1.68, -0.55)); g.add(rbox(0.12, 0.2, 0.05, m.glass, -0.55, 1.45, -0.55, 0.02)); g.add(box(0.09, 0.1, 0.03, m.glowB, -0.55, 1.47, -0.55));   // IV stand + bag
      g.add(cyl(0.05, 0.05, 0.02, m.dark, -0.75, 0, -0.55, 10)); g.add(rbox(0.5, 0.03, 0.34, m.metal, 0.9, 0.72, -0.55, 0.01)); g.add(cyl(0.02, 0.02, 0.72, m.pipe, 0.9, 0, -0.55, 8)); for (let i = 0; i < 4; i++) g.add(at(box(0.03, 0.01, 0.15, m.white), 0.78 + i * 0.07, 0.755, -0.55, 0, 0.1 * i, 0));   // instrument tray
      break; }
    case 'crate': {
      const roll = R();
      if (roll < 0.55 && hasModel('ph_crate')) {   // stacked ammunition-style cargo cases
        const n = 2 + Math.floor(R() * 3); let y = 0;
        for (let i = 0; i < n; i++) { const c = model('ph_crate', 0.34, (R() - 0.5) * 0.12, (R() - 0.5) * 0.12, (R() - 0.5) * 0.25 + (R() < 0.2 ? Math.PI / 2 : 0), y); g.add(c); y += 0.335; }
        g.userData.top = y;
        if (R() < 0.6) g.add(model('ph_barrel', 0.95, 0.75, 0.75, R() * 6));
      } else if (roll < 0.8 && hasModel('ph_barrel')) {
        for (const [x, z] of [[-0.4, -0.35], [0.42, -0.3], [0.0, 0.42]]) if (R() < 0.85) g.add(model('ph_barrel', 0.95, x, z, R() * 6));
        g.add(box(1.7, 0.08, 1.7, m.crate2, 0, -0.02, 0)); g.userData.top = 0.95;
      } else {
        const mt = R() < 0.5 ? m.crate : m.crate2; const h = 0.8 + R() * 0.9;
        g.userData.top = h; g.add(rbox(1.5, h, 1.5, mt, 0, 0, 0, 0.05)); if (R() < 0.5) g.add(rbox(0.8, 0.6, 0.8, m.crate2, 0.1, h, 0.1, 0.04));
        g.add(box(1.53, 0.1, 1.53, m.dark, 0, h * 0.5, 0)); g.add(box(0.5, 0.2, 0.02, m.hazard, 0, h * 0.7, 0.756));
      }
      break; }
    // ---- props for the rooms added from the ship inventory ----
    case 'desk': { g.userData.top = 0.76;   // ready room desk: wood top, drawer pedestals, a flat screen, a lamp and a stack of binders
      g.add(rbox(1.8, 0.05, 0.85, m.wood, 0, 0.7, 0, 0.02)); for (const sx of [-1, 1]) g.add(rbox(0.5, 0.7, 0.78, m.dark, sx * 0.62, 0, 0, 0.03));
      g.add(rbox(0.5, 0.34, 0.03, m.dark, -0.1, 0.78, -0.2, 0.01)); g.add(box(0.44, 0.28, 0.01, m.screenB, -0.1, 0.81, -0.18)); g.add(cyl(0.02, 0.02, 0.3, m.metal, 0.5, 0.75, 0.15, 8)); g.add(cyl(0.1, 0.12, 0.02, m.metal, 0.5, 0.75, 0.15, 12));
      g.add(rbox(0.3, 0.07, 0.22, m.crate2, -0.65, 0.75, 0.2, 0.01)); g.add(rbox(0.28, 0.06, 0.2, m.fabric, -0.65, 0.82, 0.2, 0.01)); break; }
    case 'cell': {   // brig cell: bunk, steel toilet and a bar front
      g.add(rbox(1.9, 0.3, 0.8, m.dark, 0, 0, -0.5, 0.04)); g.add(rbox(1.84, 0.1, 0.74, m.sheet, 0, 0.3, -0.5, 0.04)); g.add(cyl(0.16, 0.12, 0.38, m.metal, 0.75, 0, 0.1, 12)); g.add(box(1.9, 0.06, 0.06, m.metal, 0, 1.95, 0.55)); g.add(box(1.9, 0.06, 0.06, m.metal, 0, 0.0, 0.55));
      for (let i = 0; i < 13; i++) g.add(cyl(0.017, 0.017, 1.95, m.metal, -0.9 + i * 0.15, 0, 0.55, 6)); g.add(box(0.1, 0.1, 0.1, m.blinkR, 0.9, 1.1, 0.55)); break; }
    case 'weaponrack': {   // armory cabinet with a lit status strip and racked zappers
      g.add(box(1.7, 1.95, 0.04, m.dark, 0, 0, -0.26)); for (const sx of [-1, 1]) g.add(box(0.05, 1.95, 0.55, m.dark, sx * 0.825, 0, 0)); g.add(box(1.7, 0.05, 0.55, m.dark, 0, 0, 0)); g.add(box(1.5, 1.7, 0.02, m.glass, 0, 0.12, 0.28));
      for (let r = 0; r < 4; r++) for (let i = 0; i < 5; i++) g.add(rbox(0.24, 0.14, 0.08, m.metal, -0.62 + i * 0.31, 0.25 + r * 0.42, 0.18, 0.02));
      g.add(box(1.5, 0.05, 0.02, m.glowO, 0, 1.82, 0.29)); g.add(rbox(1.78, 0.05, 0.6, m.metal, 0, 1.95, 0, 0.02)); break; }
    case 'treadmill': { g.userData.top = 0.24;
      g.add(rbox(0.8, 0.14, 1.75, m.dark, 0, 0.05, 0, 0.04)); g.add(rbox(0.7, 0.04, 1.5, m.rubber, 0, 0.19, 0.02, 0.01)); for (const sx of [-1, 1]) g.add(cyl(0.025, 0.025, 1.15, m.metal, sx * 0.4, 0.1, -0.7, 8));
      g.add(rbox(0.7, 0.2, 0.12, m.dark, 0, 1.15, -0.7, 0.03)); g.add(box(0.5, 0.12, 0.01, m.screenO, 0, 1.19, -0.63)); break; }
    case 'weightbench': { g.userData.top = 0.5;
      g.add(rbox(0.46, 0.1, 1.25, m.fabric, 0, 0.4, 0, 0.04)); for (const z of [-0.5, 0.5]) g.add(rbox(0.5, 0.4, 0.06, m.dark, 0, 0, z, 0.01));
      for (const sx of [-1, 1]) g.add(rbox(0.06, 0.55, 0.06, m.metal, sx * 0.55, 0.45, -0.45, 0.01)); const bar = cyl(0.015, 0.015, 1.7, m.metal, 0, 0.98, -0.45, 8); bar.rotation.z = Math.PI / 2; g.add(bar);
      for (const sx of [-1, 1]) for (const k of [0, 1]) { const pl = cyl(0.22 - k * 0.04, 0.22 - k * 0.04, 0.05, m.dark, sx * (0.68 - k * 0.07), 0.98 - 0.22 + k * 0.04, -0.45, 16); pl.rotation.z = Math.PI / 2; pl.position.y = 0.98; g.add(pl); } break; }
    case 'labbench': { g.userData.top = 0.92;
      g.add(rbox(1.7, 0.06, 0.8, m.white, 0, 0.86, 0, 0.02)); g.add(rbox(1.6, 0.86, 0.7, m.dark, 0, 0, 0, 0.03)); g.add(box(1.4, 0.02, 0.02, m.glowB, 0, 0.6, 0.355));
      const mic = cyl(0.04, 0.05, 0.3, m.dark, -0.5, 0.92, 0, 10); mic.rotation.z = 0.35; g.add(mic); g.add(cyl(0.1, 0.12, 0.03, m.metal, -0.5, 0.92, 0, 12));
      for (const [x, z, h] of [[0.1, 0.1, 0.16], [0.28, -0.1, 0.2], [0.45, 0.12, 0.12]]) { g.add(cyl(0.05, 0.05, h, m.glass, x, 0.92, z, 10)); g.add(cyl(0.04, 0.04, h * 0.5, m.glowB, x, 0.92, z, 8)); }
      g.add(rbox(0.3, 0.2, 0.25, m.panel, 0.6, 0.92, -0.2, 0.02)); g.add(box(0.1, 0.06, 0.01, m.blinkG, 0.6, 1.0, -0.07)); break; }
    case 'washer': { g.userData.top = 0.96;
      for (const sx of [-1, 1]) { g.add(rbox(0.8, 0.95, 0.8, m.white, sx * 0.45, 0, 0, 0.05)); const door = cyl(0.27, 0.27, 0.05, m.dark, sx * 0.45, 0.35, 0.4, 20); door.rotation.x = Math.PI / 2; g.add(door); const gl = cyl(0.21, 0.21, 0.02, m.glass, sx * 0.45, 0.4, 0.43, 20); gl.rotation.x = Math.PI / 2; g.add(gl); g.add(box(0.5, 0.1, 0.01, m.screenG, sx * 0.45, 0.8, 0.405)); } break; }
    case 'sofa': { g.userData.top = 0.46;
      g.add(rbox(1.9, 0.38, 0.9, m.fabric, 0, 0, 0, 0.1)); g.add(rbox(1.9, 0.55, 0.2, m.fabric, 0, 0.3, -0.36, 0.09)); for (const sx of [-1, 1]) g.add(rbox(0.16, 0.3, 0.9, m.fabric, sx * 0.87, 0.3, 0, 0.07));
      g.add(rbox(0.5, 0.14, 0.3, m.white, -0.4, 0.38, -0.1, 0.06)); break; }
    case 'lathe': { g.userData.top = 1.0;
      g.add(rbox(1.5, 0.72, 0.55, m.dark, 0, 0, 0, 0.03)); g.add(rbox(1.75, 0.16, 0.5, m.metal, 0, 0.72, 0, 0.02)); g.add(rbox(0.4, 0.45, 0.46, m.panel, -0.65, 0.88, 0, 0.03));
      const chuck = cyl(0.13, 0.13, 0.12, m.pipe, -0.4, 1.05, 0, 14); chuck.rotation.z = Math.PI / 2; g.add(chuck); const rod = cyl(0.03, 0.03, 0.9, m.metal, 0.1, 1.05, 0, 8); rod.rotation.z = Math.PI / 2; g.add(rod);
      g.add(rbox(0.3, 0.3, 0.4, m.panel, 0.65, 0.88, 0, 0.03)); g.add(box(0.08, 0.2, 0.12, m.hazard, 0.1, 0.88, 0.25)); g.add(box(1.0, 0.03, 0.01, m.hazard, 0, 0.3, 0.28)); break; }
    case 'workbench': { g.userData.top = 0.95;
      g.add(rbox(1.7, 0.08, 0.8, m.wood, 0, 0.86, 0, 0.02)); for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.07, 0.86, 0.07, m.metal, sx * 0.78, 0, sz * 0.33)); g.add(rbox(1.5, 0.12, 0.6, m.dark, 0, 0.2, 0, 0.02));
      g.add(rbox(0.16, 0.14, 0.16, m.dark, -0.7, 0.94, 0.25, 0.02)); g.add(box(0.05, 0.1, 0.18, m.metal, -0.7, 1.08, 0.25)); g.add(box(0.5, 0.12, 0.06, m.hazard, 0.2, 0.94, -0.25)); g.add(rbox(0.3, 0.06, 0.18, m.metal, 0.5, 0.94, 0.1, 0.01)); break; }
    case 'tank': {   // plant room pressure vessel with a gauge, valve wheel and piping
      g.add(cyl(0.55, 0.55, 1.7, m.metal, 0, 0.12, 0, 22)); const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.metal); dome.position.y = 1.82; g.add(dome); g.add(cyl(0.6, 0.6, 0.12, m.dark, 0, 0, 0, 22));
      for (const y of [0.5, 1.2]) { const band = cyl(0.57, 0.57, 0.06, m.hazard, 0, y, 0, 22); g.add(band); } g.add(cyl(0.05, 0.05, 0.9, m.pipe, 0.6, 0.2, 0.3, 10)); g.add(cyl(0.04, 0.04, 0.5, m.pipe, 0.35, 2.0, 0, 8));
      const gauge = cyl(0.1, 0.1, 0.04, m.glowB, 0.0, 1.0, 0.56, 14); gauge.rotation.x = Math.PI / 2; g.add(gauge); break; }
    case 'drawers': { g.userData.top = 1.12;
      g.add(rbox(1.6, 1.1, 0.9, m.metal, 0, 0, 0, 0.03)); for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) { g.add(rbox(0.46, 0.46, 0.02, m.panel, -0.52 + c * 0.52, 0.06 + r * 0.52, 0.46, 0.01)); g.add(box(0.2, 0.03, 0.04, m.dark, -0.52 + c * 0.52, 0.3 + r * 0.52, 0.49)); } g.add(box(0.2, 0.05, 0.01, m.blinkG, 0.7, 1.0, 0.46)); break; }
    case 'servers': {   // computer core stacks
      for (let i = 0; i < 3; i++) { const x = (i - 1) * 0.66; g.add(rbox(0.6, 2.0, 0.85, m.dark, x, 0, 0, 0.03)); g.add(box(0.5, 1.7, 0.01, m.glass, x, 0.12, 0.43));
        for (let k = 0; k < 9; k++) g.add(box(0.09, 0.02, 0.01, (k + i) % 4 === 0 ? m.blinkR : m.blinkG, x - 0.15 + (k % 3) * 0.15, 0.3 + Math.floor(k / 3) * 0.45, 0.435)); g.add(box(0.5, 0.04, 0.01, m.glowB, x, 1.9, 0.43)); } break; }
    case 'shelving': {   // stores: steel shelving with boxed stock
      for (const sx of [-1, 1]) g.add(box(0.05, 2.0, 0.6, m.metal, sx * 0.82, 0, 0)); for (let r = 0; r < 4; r++) { g.add(box(1.62, 0.04, 0.6, m.pipe, 0, 0.1 + r * 0.55, 0)); for (let b = 0; b < 3; b++) if (R() < 0.85) g.add(rbox(0.4 + R() * 0.12, 0.3 + R() * 0.12, 0.4, R() < 0.5 ? m.crate : m.crate2, -0.5 + b * 0.5, 0.14 + r * 0.55, 0, 0.02)); } break; }
    case 'suitrack': {   // airlock locker bay with pressure suits hanging inside
      g.add(box(1.5, 2.0, 0.04, m.panel, 0, 0, -0.28)); for (const sx of [-1, 1]) g.add(box(0.04, 2.0, 0.6, m.panel, sx * 0.73, 0, 0)); g.add(box(1.5, 0.04, 0.6, m.panel, 0, 1.96, 0)); g.add(box(0.04, 2.0, 0.6, m.panel, 0, 0, 0)); for (const sx of [-1, 1]) { g.add(cyl(0.2, 0.22, 0.9, m.white, sx * 0.36, 0.7, 0.05, 14)); const hel = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10), m.white); hel.position.set(sx * 0.36, 1.78, 0.05); g.add(hel); const vis = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI), m.glass); vis.position.set(sx * 0.36, 1.78, 0.17); g.add(vis); g.add(box(0.1, 0.14, 0.02, m.glowO, sx * 0.36, 1.2, 0.27)); }
      g.add(box(1.5, 0.04, 0.62, m.hazard, 0, 0.0, 0)); break; }
    case 'sinkunit': { g.userData.top = 0.9;
      g.add(rbox(1.5, 0.8, 0.55, m.white, 0, 0, 0, 0.04)); g.add(rbox(1.56, 0.05, 0.6, m.metal, 0, 0.8, 0, 0.02)); for (const sx of [-1, 1]) { g.add(cyl(0.16, 0.12, 0.06, m.glass, sx * 0.4, 0.8, 0.02, 14)); g.add(cyl(0.015, 0.015, 0.2, m.metal, sx * 0.4, 0.85, -0.2, 8)); }
      g.add(rbox(1.4, 0.8, 0.03, m.glass, 0, 1.1, -0.25, 0.01)); break; }
    case 'tree': {
      g.add(rbox(1.2, 0.4, 1.2, m.dark, 0, 0, 0, 0.06)); g.add(box(1.05, 0.02, 1.05, m.trunk, 0, 0.4, 0));
      const t = model('ph_plant', 2.6, 0, 0, R() * 6, 0.1);
      if (t) g.add(t); else { g.add(box(0.25, 1.5, 0.25, m.trunk)); for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6 + R() * 0.3, 1), m.leaf); l.position.set((R() - 0.5) * 0.7, 1.7 + R() * 0.8, (R() - 0.5) * 0.7); g.add(l); } }
      break; }
    case 'lonechair': { const c = model('ph_armchair', 0.95, 0, 0, Math.PI); if (c) g.add(c); else { g.add(box(0.5, 0.08, 0.5, m.fabric, 0, 0.45, 0)); g.add(box(0.5, 0.55, 0.08, m.fabric, 0, 0.55, 0.23)); g.add(box(0.06, 0.4, 0.06, m.metal, 0, 0.08, 0)); } break; }
    case 'plant': { const p = model('ph_plant', 1.25, 0, 0, R() * 6); if (p) g.add(p); else { g.add(box(0.5, 0.45, 0.5, m.dark)); for (let i = 0; i < 7; i++) { const l = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.8, 5), m.leaf); l.position.set((R() - 0.5) * 0.2, 0.9, (R() - 0.5) * 0.2); l.rotation.set((R() - 0.5) * 1.2, 0, (R() - 0.5) * 1.2); g.add(l); } } break; }
    case 'cart':
      g.userData.top = 0.86; g.add(rbox(0.9, 0.04, 0.55, m.metal, 0, 0.33, 0, 0.015)); g.add(rbox(0.9, 0.04, 0.55, m.metal, 0, 0.8, 0, 0.015));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { g.add(cyl(0.018, 0.018, 0.8, m.pipe, sx * 0.42, 0.06, sz * 0.25, 8)); g.add(cyl(0.045, 0.045, 0.03, m.rubber, sx * 0.42, 0.0, sz * 0.25, 10)).rotation.z = Math.PI / 2; }
      g.add(rbox(0.3, 0.2, 0.3, m.crate2, 0.15, 0.37, 0, 0.02)); g.add(rbox(0.22, 0.14, 0.3, m.white, -0.2, 0.84, 0, 0.03)); g.add(cyl(0.04, 0.04, 0.16, m.glowB, 0.2, 0.84, 0.1, 10)); break;
    case 'replicator':   // front faces -z
      g.add(rbox(1.5, 2.1, 0.42, m.panel, 0, 0, 0.4, 0.05));
      g.add(box(1.0, 0.56, 0.01, m.screenO, 0, 0.84, 0.186));   // glowing back wall of the dispense alcove
      g.add(rbox(1.04, 0.1, 0.3, m.dark, 0, 1.4, 0.04, 0.02)); for (const sx of [-1, 1]) g.add(rbox(0.06, 0.7, 0.3, m.dark, sx * 0.5, 0.76, 0.04, 0.02)); g.add(rbox(1.04, 0.07, 0.3, m.metal, 0, 0.77, 0.04, 0.015));
      g.add(at(grid(9, 3, 0.03, 0.03, 0.026, 0.01, 0.026, m.keyDark), 0, 0.84, 0.04));   // drip-tray grille
      g.add(box(0.9, 0.03, 0.02, m.glowO, 0, 1.38, 0.0)); g.add(cyl(0.035, 0.03, 0.08, m.white, 0.12, 0.84, 0.05, 12)); g.add(cyl(0.028, 0.028, 0.012, m.glowO, 0.12, 0.92, 0.05, 12));   // light strip, a waiting mug
      g.add(rbox(0.3, 0.22, 0.03, m.dark, 0.5, 1.6, 0.16, 0.02)); g.add(box(0.25, 0.17, 0.01, m.screenB, 0.5, 1.625, 0.145)); g.add(box(1.3, 0.03, 0.02, m.glowB, 0, 1.95, 0.175));
      g.add(at(grid(4, 4, 0.06, 0.06, 0.045, 0.012, 0.045, m.keys, [0x4ac0ff, 0xffa040, 0x30ff60, 0xffffff]), -0.5, 1.6, 0.18, Math.PI / 2));   // menu buttons
      for (let i = 0; i < 6; i++) g.add(box(0.5, 0.012, 0.02, m.keyDark, 0.35, 1.72 + i * 0.03, 0.175));   // vent slots
      for (const sx of [-1, 1]) g.add(rbox(0.04, 2.1, 0.02, m.dark, sx * 0.72, 0, 0.18, 0.01)); g.add(box(0.06, 0.06, 0.02, m.blinkG, -0.6, 0.3, 0.175)); g.add(box(0.8, 0.05, 0.015, m.hazard, 0, 0.1, 0.18)); break;
    // ---- new: freestanding lockers, a lab rack and a centrifuge ----
    case 'lockers': {   // bank of three crew lockers: louvred doors, handles, number plates
      g.add(rbox(1.62, 1.9, 0.52, m.panel, 0, 0.05, 0, 0.03)); g.add(box(1.7, 0.05, 0.6, m.dark, 0, 0, 0)); g.add(rbox(1.66, 0.05, 0.56, m.metal, 0, 1.95, 0, 0.015));
      for (let i = 0; i < 3; i++) { const x = (i - 1) * 0.53; g.add(rbox(0.5, 1.8, 0.03, i === 1 ? m.metal : m.crate, x, 0.1, 0.27, 0.01)); for (let k = 0; k < 6; k++) g.add(at(box(0.3, 0.012, 0.012, m.dark), x, 1.45 + k * 0.05, 0.288, -0.5)); g.add(box(0.025, 0.14, 0.03, m.metal, x + 0.18, 1.0, 0.3)); g.add(box(0.1, 0.05, 0.01, m.screenG, x, 1.7, 0.288)); g.add(box(0.03, 0.03, 0.01, i === 2 ? m.blinkR : m.blinkG, x - 0.17, 1.82, 0.288)); }
      break; }
    case 'labrack': {   // lab shelving unit: vials in racks, a microscope, specimen jars
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.04, 1.8, 0.04, m.metal, sx * 0.78, 0, sz * 0.28));
      for (let i = 0; i < 4; i++) { const y = 0.2 + i * 0.5; g.add(rbox(1.62, 0.04, 0.6, m.white, 0, y, 0, 0.01)); }
      for (let i = 0; i < 24; i++) { const x = -0.7 + (i % 12) * 0.127, y = i < 12 ? 0.24 : 1.24; const v = cyl(0.025, 0.025, 0.14 + (i % 3) * 0.02, i % 4 ? m.vial : m.vial, x, y, i % 2 ? 0.1 : -0.1, 8); g.add(v); g.add(cyl(0.017, 0.017, 0.07, i % 3 === 0 ? m.glowB : i % 3 === 1 ? m.blinkG : m.glowO, x, y, i % 2 ? 0.1 : -0.1, 6)); }
      g.add(cyl(0.1, 0.12, 0.03, m.metal, -0.4, 0.74, 0, 14)); g.add(at(cyl(0.035, 0.035, 0.26, m.dark, 0, 0, 0, 10), -0.4, 0.78, 0, -0.5)); g.add(cyl(0.03, 0.03, 0.12, m.metal, -0.4, 0.78, 0.07, 8));   // microscope
      for (let i = 0; i < 3; i++) { g.add(cyl(0.07, 0.07, 0.16, m.glass, 0.1 + i * 0.17, 0.74, 0, 12)); g.add(cyl(0.05, 0.05, 0.05, m.leaf, 0.1 + i * 0.17, 0.74, 0, 10)); }
      g.add(rbox(0.5, 0.16, 0.36, m.dark, 0.3, 1.74, 0, 0.02)); g.add(box(0.4, 0.07, 0.01, m.screenG, 0.3, 1.78, 0.185)); g.add(rbox(0.5, 0.25, 0.4, m.crate2, -0.4, 1.24, 0, 0.02)); break; }
    case 'centrifuge': { g.userData.top = 0.98;
      g.add(rbox(0.9, 0.86, 0.8, m.white, 0, 0, 0, 0.08)); g.add(cyl(0.34, 0.36, 0.12, m.dark, 0, 0.86, 0, 24)); const lid = cyl(0.36, 0.36, 0.05, m.glass, 0, 0.98, 0, 24); g.add(lid);
      g.add(cyl(0.06, 0.06, 0.06, m.metal, 0, 0.98, 0, 10)); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.add(at(cyl(0.03, 0.03, 0.1, m.vial, 0, 0, 0, 8), Math.cos(a) * 0.22, 0.88, Math.sin(a) * 0.22)); }
      g.add(rbox(0.5, 0.2, 0.03, m.dark, 0, 0.5, 0.41, 0.01)); g.add(box(0.4, 0.1, 0.01, m.screenG, 0, 0.55, 0.43)); g.add(at(grid(4, 1, 0.06, 0.05, 0.04, 0.012, 0.04, m.keys, [0x4ac0ff, 0x30ff60, 0xff3020]), 0, 0.52, 0.42, Math.PI / 2)); g.add(box(0.5, 0.03, 0.02, m.glowB, 0, 0.1, 0.41)); break; }
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
  const sign = canvasTex(256, (c, s) => {
    c.fillStyle = '#0b0e16'; c.fillRect(0, 0, s, s); c.fillStyle = '#' + new THREE.Color(accent).getHexString(); c.fillRect(0, 0, s, 44); c.fillRect(0, s - 44, s, 44);
    c.fillStyle = '#fff'; c.font = 'bold 54px Helvetica, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('TUBELIFT', s / 2, s / 2 + 3, s - 20);
    c.fillStyle = '#0b0e16'; c.font = 'bold 24px Helvetica, Arial, sans-serif'; c.fillText('▼  ALL DECKS  ▼', s / 2, s - 21);
  });
  const txt = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.42), new THREE.MeshBasicMaterial({ map: sign, color: 0xdddddd }));
  txt.position.set(0, 2.3, 0.16); g.add(txt);
  // call panel on the right-hand post, hazard kick plates, header lamp bar
  const haz = new THREE.MeshLambertMaterial({ color: 0xd8a818 }), dk = new THREE.MeshLambertMaterial({ color: 0x15181d });
  g.add(box(0.16, 0.26, 0.04, dk, 1.1, 1.15, 0.16)); const btn = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.02), new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(1.6) })); btn.position.set(1.1, 1.3, 0.19); g.add(btn);
  for (const sx of [-1.1, 1.1]) { g.add(box(0.27, 0.12, 0.32, haz, sx, 0, 0)); g.add(box(0.27, 0.06, 0.32, dk, sx, 0.12, 0)); }
  g.add(box(2.0, 0.05, 0.34, dk, 0, 2.5, 0));
  return g;
}

// ------------------------------------------------------------------
// Set dressing: room light colours, grime textures and merged, vertex-coloured wall fixtures (instanced per kind)
// ------------------------------------------------------------------
// which bulkhead / deck variant a room gets (see tools/build-textures.mjs for the generated sets)
const WALL_OF = { quarters: 'wallq', holodeck: 'wallq', sickbay: 'wallp', mess: 'wallp', bridge: 'wallp', arboretum: 'wallp', engineering: 'wallg', cargo: 'wallg', shuttlebay: 'wallg', transporter: 'wallg',
  readyroom: 'wallq', lounge: 'wallq', gym: 'wallp', lab: 'wallp', datacore: 'wallp', laundry: 'wallp', morgue: 'wallp', washroom: 'wallp', brig: 'wallg', armory: 'wallg', workshop: 'wallg', plant: 'wallg', stores: 'wallg', airlock: 'wallg' };
const CORRIDOR_WALL = { cairn: 'wall', longhouse: 'wallp', tandem: 'wall', cruller: 'wallp', plough: 'wall' };
export const ROOM_LIGHT = { bridge: 0xbcd6ff, engineering: 0xffb060, sickbay: 0xd2fff2, mess: 0xffd49a, transporter: 0x9cc2ff, shuttlebay: 0xfff0b4, cargo: 0xffc472, holodeck: 0xffe070, quarters: 0xffc48c, arboretum: 0xd6ffae,
  readyroom: 0xffd8a8, brig: 0xc8d4ff, armory: 0xffe8c0, gym: 0xf4fff0, lab: 0xe8f4ff, laundry: 0xf0f0e8, lounge: 0xffcf9a, workshop: 0xffe2a0, plant: 0xffd0a0, morgue: 0xcfe8ff, datacore: 0x9cb8ff, stores: 0xffe0b0, washroom: 0xf0fbff, airlock: 0xfff0c0 };
let dressCache = null;
function dressTex() {
  if (dressCache) return dressCache;
  const alpha = (size, draw) => { const t = canvasTex(size, (g, s) => { g.clearRect(0, 0, s, s); draw(g, s); }); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; };
  const R = mulberry32(4242), rr = (a, b) => a + R() * (b - a);
  const blot = (g, x, y, r, col, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(0.6, `rgba(${col},${a * 0.7})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
  dressCache = {
    // ceiling vent: frame + slats
    vent: canvasTex(128, (g, s) => { g.fillStyle = '#3a3e45'; g.fillRect(0, 0, s, s); g.fillStyle = '#0a0b0d'; g.fillRect(8, 8, s - 16, s - 16); g.fillStyle = '#4a4f57'; for (let y = 14; y < s - 12; y += 12) g.fillRect(8, y, s - 16, 5); g.fillStyle = '#23262b'; g.fillRect(s / 2 - 2, 8, 4, s - 16); g.fillStyle = '#8a9099'; for (const [x, y] of [[4, 4], [s - 4, 4], [4, s - 4], [s - 4, s - 4]]) { g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); } }),
    // grime running down from the ceiling line
    drip: alpha(256, (g, s) => { for (let i = 0; i < 26; i++) { const x = rr(10, s - 10), len = rr(30, s * 0.95), w = rr(2, 9); const gr = g.createLinearGradient(0, 0, 0, len); gr.addColorStop(0, 'rgba(30,22,14,0.6)'); gr.addColorStop(1, 'rgba(30,22,14,0)'); g.fillStyle = gr; g.fillRect(x, 0, w, len); } const top = g.createLinearGradient(0, 0, 0, 40); top.addColorStop(0, 'rgba(24,18,12,0.55)'); top.addColorStop(1, 'rgba(24,18,12,0)'); g.fillStyle = top; g.fillRect(0, 0, s, 40); const e = g.createLinearGradient(0, 0, s, 0); e.addColorStop(0, 'rgba(0,0,0,1)'); e.addColorStop(0.12, 'rgba(0,0,0,0)'); e.addColorStop(0.88, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = e; g.fillRect(0, 0, s, s); g.globalCompositeOperation = 'source-over'; }),
    // boot scuffs and trolley rubs along the kick plate
    scuff: alpha(256, (g, s) => { g.lineCap = 'round'; for (let i = 0; i < 70; i++) { const x = rr(14, s - 50), y = rr(s * 0.25, s - 12); g.strokeStyle = `rgba(${R() < 0.3 ? '190,190,185' : '14,13,12'},${rr(0.15, 0.5)})`; g.lineWidth = rr(1, 5); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + rr(8, 30), y + rr(-8, 8), x + rr(16, 46), y + rr(-10, 10)); g.stroke(); } for (let i = 0; i < 5; i++) blot(g, rr(30, s - 30), rr(s * 0.6, s - 20), rr(14, 34), '18,15,12', 0.3); }),
    // floor stain: spill with a tide ring
    stain: alpha(256, (g, s) => { for (let i = 0; i < 9; i++) blot(g, s / 2 + rr(-50, 50), s / 2 + rr(-50, 50), rr(24, 62), '16,13,10', 0.34); g.strokeStyle = 'rgba(12,10,8,0.3)'; g.lineWidth = 3; g.beginPath(); for (let a = 0; a <= 6.4; a += 0.2) { const r = 86 + Math.sin(a * 3) * 10 + Math.sin(a * 7.1) * 5; g.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r); } g.stroke(); for (let i = 0; i < 30; i++) blot(g, rr(20, s - 20), rr(20, s - 20), rr(1.5, 5), '10,9,8', 0.5); }),
    // ceiling water stain: brown rings
    cstain: alpha(256, (g, s) => { for (let k = 0; k < 3; k++) { const cx = s / 2 + rr(-40, 40), cy = s / 2 + rr(-40, 40), r0 = rr(36, 70); blot(g, cx, cy, r0, '96,70,36', 0.28); g.strokeStyle = 'rgba(70,48,22,0.5)'; g.lineWidth = rr(2, 4); g.beginPath(); for (let a = 0; a <= 6.4; a += 0.25) { const r = r0 * 0.82 + Math.sin(a * 4 + k) * 6 + Math.sin(a * 9) * 3; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.closePath(); g.stroke(); } }),
    // burnt-out wall panel: soot, exposed frame and wiring
    burn: alpha(256, (g, s) => { for (let i = 0; i < 16; i++) blot(g, s / 2 + rr(-46, 46), s / 2 + rr(-60, 30), rr(30, 70), '8,7,6', 0.5); g.fillStyle = 'rgba(4,4,5,0.95)'; g.beginPath(); g.moveTo(84, 86); g.lineTo(176, 78); g.lineTo(184, 150); g.lineTo(150, 182); g.lineTo(92, 172); g.closePath(); g.fill(); g.strokeStyle = 'rgba(120,112,100,0.8)'; g.lineWidth = 3; g.stroke(); g.lineWidth = 2; for (const c of ['170,40,30', '200,170,40', '40,90,170', '200,200,200']) { g.strokeStyle = `rgba(${c},0.85)`; g.beginPath(); const x = rr(96, 170); g.moveTo(x, 84); g.bezierCurveTo(x + rr(-30, 30), 120, x + rr(-30, 30), 150, rr(100, 170), rr(165, 200)); g.stroke(); } for (let i = 0; i < 5; i++) { const x = rr(80, 180); const gr = g.createLinearGradient(0, 40, 0, 0); gr.addColorStop(0, 'rgba(8,7,6,0.5)'); gr.addColorStop(1, 'rgba(8,7,6,0)'); g.fillStyle = gr; g.fillRect(x, 0, rr(8, 22), 90); } }),
    // soft radial glow (emergency lamp halo, light pool under a vent)
    halo: (() => { const t = canvasTex(64, (g, s) => { g.fillStyle = '#000'; g.fillRect(0, 0, s, s); const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, '#666'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; })(),
    // light through vent slats: bright at the top, striped
    shaft: (() => { const t = canvasTex(64, (g, s) => { g.fillStyle = '#000'; g.fillRect(0, 0, s, s); const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, '#fff'); gr.addColorStop(0.5, '#555'); gr.addColorStop(1, '#000'); g.fillStyle = gr; for (let x = 3; x < s; x += 9) g.fillRect(x, 0, 5, s); g.globalAlpha = 0.25; g.fillRect(0, 0, s, s); }); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; })(),
    // floor way-finding: chevrons and a word, white so the ship's accent can tint it
    arrow: alpha(256, (g, s) => { g.fillStyle = 'rgba(255,255,255,0.92)'; for (let k = 0; k < 3; k++) { const y = 26 + k * 34; g.beginPath(); g.moveTo(s / 2, y); g.lineTo(s / 2 + 52, y + 40); g.lineTo(s / 2 + 52, y + 62); g.lineTo(s / 2, y + 22); g.lineTo(s / 2 - 52, y + 62); g.lineTo(s / 2 - 52, y + 40); g.closePath(); g.fill(); } g.font = 'bold 44px Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.fillText('LIFT', s / 2, s - 26); g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(0,0,0,${rr(0.2, 0.9)})`; g.fillRect(rr(0, s), rr(0, s), rr(1, 7), rr(1, 4)); } g.globalCompositeOperation = 'source-over'; }),
    // hazard chevrons for door thresholds
    haz: canvasTex(128, (g, s) => { g.fillStyle = '#d2a41c'; g.fillRect(0, 0, s, s); g.fillStyle = '#121212'; for (let i = -s; i < s * 2; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 - s, s); g.lineTo(i - s, s); g.fill(); } g.fillStyle = 'rgba(40,30,20,0.25)'; for (let i = 0; i < 200; i++) g.fillRect(R() * s, R() * s, 3, 2); }),
  };
  return dressCache;
}

// merged, vertex-coloured geometry: origin on the floor at the wall face, +X along the wall, +Z out into the room
class Kit {
  constructor() { this.solid = []; this.glow = []; }
  _add(geo, x, y, z, col, glow) {
    geo.translate(x, y, z); const c = Array.isArray(col) ? new THREE.Color(col[0], col[1], col[2]) : new THREE.Color(col), n = geo.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); (glow ? this.glow : this.solid).push(geo); return this;
  }
  // box sitting z0 off the wall, centred at (x, y)
  box(w, h, d, x, y, col, z0 = 0, glow = false, rz = 0) { const g = new THREE.BoxGeometry(w, h, d); if (rz) g.rotateZ(rz); return this._add(g, x, y, z0 + d / 2, col, glow); }
  // cylinder: axis 'y' (upright), 'z' (facing out of the wall) or 'x' (along the wall)
  cyl(r, h, x, y, col, z0 = 0, axis = 'y', glow = false, seg = 10) { const g = new THREE.CylinderGeometry(r, r, h, seg); if (axis === 'z') g.rotateX(Math.PI / 2); else if (axis === 'x') g.rotateZ(Math.PI / 2); return this._add(g, x, y, z0 + (axis === 'z' ? h / 2 : r), col, glow); }
  cone(r, h, x, y, col, z0 = 0, rx = 0, rz = 0) { const g = new THREE.ConeGeometry(r, h, 6); g.rotateX(rx); g.rotateZ(rz); return this._add(g, x, y, z0 + r, col, false); }
  done() { const m = (l) => l.length ? mergeGeometries(l, false) : null; return { solid: m(this.solid), glow: m(this.glow) }; }
}
const DK = 0x23262d, MT = 0x8f959e, WHT = 0xdfe6ea, RD = 0xb02820, YL = 0xd8a818, GRN = 0x2f8a48, STEEL = 0x5a6068;
const GB = [0.35, 1.25, 2.0], GO = [2.0, 0.85, 0.25], GG = [0.3, 1.7, 0.75], GR = [2.0, 0.2, 0.12], GM = [1.7, 0.5, 1.5];
function screenKit(K, c0, c1, c2, y = 1.6) {   // a wall display built from glowing blocks
  K.box(1.3, 0.84, 0.06, 0, y, DK).box(1.36, 0.05, 0.09, 0, y - 0.45, STEEL);
  K.box(1.14, 0.07, 0.006, 0, y + 0.32, c0, 0.06, true); K.box(0.2, 0.22, 0.006, -0.47, y + 0.14, c1, 0.06, true); K.box(0.2, 0.3, 0.006, -0.47, y - 0.16, c2, 0.06, true);
  [0.82, 0.6, 0.74, 0.4, 0.66].forEach((w, i) => K.box(w * 0.55, 0.035, 0.006, -0.32 + w * 0.275, y + 0.2 - i * 0.075, i % 2 ? c1 : c0, 0.06, true));
  [0.3, 0.55, 0.42, 0.7, 0.5, 0.24, 0.6].forEach((h, i) => K.box(0.05, h * 0.36, 0.006, 0.2 + i * 0.065, y - 0.33 + h * 0.18, i === 3 ? c2 : c0, 0.06, true));
  K.box(0.52, 0.03, 0.006, -0.08, y - 0.3, c2, 0.06, true);
}
const DECOR = {
  locker(K) { for (const sx of [-0.47, 0.47]) { K.box(0.9, 1.95, 0.2, sx, 0.98, 0x8f96a0).box(0.86, 1.88, 0.012, sx, 0.98, 0xa2a9b3, 0.2).box(0.03, 0.14, 0.03, sx + 0.3, 1.02, DK, 0.212).box(0.26, 0.07, 0.006, sx - 0.18, 1.78, 0xe0d8c0, 0.212); for (let i = 0; i < 4; i++) K.box(0.34, 0.018, 0.006, sx, 1.52 + i * 0.05, DK, 0.212); K.box(0.03, 0.03, 0.006, sx + 0.33, 1.8, GG, 0.212, true); } K.box(1.9, 0.06, 0.22, 0, 0.03, DK); },
  shelf(K) { for (const y of [1.25, 1.72]) { K.box(1.5, 0.04, 0.22, 0, y, MT); for (const sx of [-0.62, 0.62]) K.box(0.04, 0.16, 0.2, sx, y - 0.1, DK); }
    K.box(0.2, 0.22, 0.15, -0.55, 1.38, 0x7a5a3a, 0.03).box(0.12, 0.3, 0.12, -0.3, 1.42, 0x2a5a8a, 0.04).cyl(0.05, 0.16, -0.08, 1.35, WHT, 0.05).box(0.34, 0.12, 0.17, 0.3, 1.33, 0x8a8a7a, 0.02).cyl(0.06, 0.2, 0.6, 1.37, 0x6a2a2a, 0.04);
    [0x7a2a2a, 0x2a4a7a, 0x8a7a3a, 0x3a6a4a, 0x5a3a6a, 0x9a9a8a, 0x2a2a3a].forEach((c, i) => K.box(0.045, 0.22 + (i % 3) * 0.03, 0.16, -0.6 + i * 0.05, 1.85 + (i % 3) * 0.015, c, 0.02)); K.box(0.22, 0.16, 0.16, 0.25, 1.82, 0x4a4f58, 0.03).cyl(0.07, 0.1, 0.55, 1.79, 0xc8a13c, 0.06); },
  monitorB(K) { screenKit(K, GB, GO, [1.4, 0.9, 1.8]); }, monitorO(K) { screenKit(K, GO, [2.0, 0.4, 0.2], [2.0, 1.5, 0.7]); }, monitorG(K) { screenKit(K, GG, [0.2, 1.0, 0.6], [1.6, 1.9, 1.8]); },
  medcab(K) { K.box(1.05, 0.72, 0.22, 0, 1.56, WHT).box(0.012, 0.68, 0.006, 0, 1.56, 0x7a8a90, 0.22).box(0.2, 0.06, 0.006, -0.27, 1.62, GRN, 0.22).box(0.06, 0.2, 0.006, -0.27, 1.62, GRN, 0.22).box(0.03, 0.12, 0.03, 0.06, 1.5, MT, 0.22).box(0.03, 0.12, 0.03, -0.06, 1.5, MT, 0.22);
    K.box(1.05, 0.03, 0.2, 0, 1.12, MT); [[-0.4, 0x4a8ac8], [-0.27, WHT], [-0.14, 0xc8a13c], [0.2, WHT], [0.36, 0x9a3a3a]].forEach(([x, c]) => K.cyl(0.04, 0.14, x, 1.205, c, 0.06)); K.box(0.2, 0.08, 0.14, 0.02, 1.175, 0x9ac0c8, 0.04); K.box(0.04, 0.04, 0.006, 0.45, 1.85, GG, 0.22, true); },
  gauges(K) { K.box(1.05, 1.2, 0.08, 0, 1.5, 0x3a3f48); for (let i = 0; i < 6; i++) { const x = -0.32 + (i % 3) * 0.32, y = 1.82 - Math.floor(i / 3) * 0.36; K.cyl(0.125, 0.03, x, y, DK, 0.08, 'z', false, 16).cyl(0.105, 0.012, x, y, 0xe8e0c8, 0.11, 'z', false, 16).box(0.012, 0.09, 0.006, x + 0.02, y + 0.03, RD, 0.122, false, -0.5 + i * 0.4); }
    [GG, GG, GO, GR, GG].forEach((c, i) => K.box(0.05, 0.05, 0.01, -0.36 + i * 0.18, 1.1, c, 0.08, true)); K.cyl(0.13, 0.03, -0.3, 0.72, RD, 0.14, 'z', false, 12).cyl(0.025, 0.14, -0.3, 0.72, MT, 0, 'z').cyl(0.04, 0.9, -0.3, 0.45, MT, 0.02).cyl(0.04, 0.9, 0.3, 0.45, 0x7a5a2a, 0.02).box(0.9, 0.05, 0.1, 0, 0.88, DK); },
  pipes(K) { [[-0.62, 0.05, MT], [-0.4, 0.075, YL], [-0.08, 0.04, MT], [0.26, 0.065, 0x7a3a2a], [0.58, 0.05, 0x4a6a8a]].forEach(([x, r, c]) => { K.cyl(r, WH, x, WH / 2, c, 0.03); for (const y of [0.9, 2.2]) K.cyl(r + 0.028, 0.06, x, y, STEEL, 0.002); });
    for (const y of [0.5, 1.55, 2.7]) K.box(1.5, 0.05, 0.05, 0, y, DK); K.cyl(0.09, 0.03, -0.4, 1.3, RD, 0.19, 'z', false, 12).box(0.22, 0.12, 0.006, 0.26, 1.5, WHT, 0.16); },
  toolboard(K) { K.box(1.4, 0.9, 0.03, 0, 1.5, 0xb0642a); const T = 0x1c1e22; K.box(0.06, 0.42, 0.02, -0.55, 1.55, T, 0.03).box(0.14, 0.1, 0.02, -0.55, 1.78, T, 0.03).box(0.05, 0.36, 0.02, -0.35, 1.52, 0x7a5a3a, 0.03).box(0.17, 0.08, 0.03, -0.35, 1.73, T, 0.03);
    for (let i = 0; i < 4; i++) K.box(0.03, 0.2 + i * 0.03, 0.02, -0.15 + i * 0.09, 1.66, i % 2 ? RD : YL, 0.03).box(0.016, 0.12, 0.016, -0.15 + i * 0.09, 1.46 - i * 0.015, MT, 0.03);
    K.box(0.42, 0.13, 0.015, 0.4, 1.72, MT, 0.03).box(0.12, 0.1, 0.03, 0.56, 1.63, T, 0.03).cyl(0.09, 0.03, 0.35, 1.38, T, 0.03, 'z', false, 12).cyl(0.06, 0.03, 0.55, 1.36, MT, 0.03, 'z', false, 12).box(1.4, 0.04, 0.2, 0, 1.0, MT).box(0.36, 0.2, 0.18, -0.4, 1.12, RD, 0.01).box(0.2, 0.12, 0.14, 0.3, 1.08, 0x4a4f58, 0.02); },
  hose(K) { K.box(0.86, 0.86, 0.03, 0, 1.25, 0x8a1a14).cyl(0.34, 0.05, 0, 1.25, RD, 0.03, 'z', false, 18).cyl(0.29, 0.12, 0, 1.25, 0x18181a, 0.08, 'z', false, 18).cyl(0.34, 0.03, 0, 1.25, RD, 0.2, 'z', false, 18).cyl(0.08, 0.04, 0, 1.25, MT, 0.23, 'z').box(0.06, 0.34, 0.06, 0.4, 0.95, MT, 0.04).box(0.5, 0.16, 0.01, 0, 1.85, WHT).box(0.4, 0.05, 0.006, 0, 1.85, RD, 0.01); },
  rack(K) { for (const sx of [-0.98, 0.98]) K.box(0.05, 2.3, 0.24, sx, 1.15, 0x4a4f58); for (const y of [0.32, 0.98, 1.64, 2.28]) K.box(2.0, 0.04, 0.24, 0, y, STEEL);
    [[-0.68, 0.34, 0.5, 0.42, 0x6a6f5a], [-0.1, 0.34, 0.44, 0.3, 0x8a6a3a], [0.5, 0.34, 0.62, 0.5, 0x5a5448], [-0.55, 1.0, 0.6, 0.36, 0x8a6a3a], [0.15, 1.0, 0.5, 0.5, 0x4a5a6a], [0.7, 1.0, 0.36, 0.28, 0x6a6f5a], [-0.3, 1.66, 0.8, 0.3, 0x5a5448], [0.52, 1.66, 0.46, 0.44, 0x7a3a2a]].forEach(([x, y, w, h, c]) => { K.box(w, h, 0.2, x, y + h / 2, c, 0.02).box(w * 0.5, 0.07, 0.006, x, y + h * 0.6, 0xe0d8c0, 0.22); }); K.cyl(0.11, 0.3, -0.75, 1.81, 0x3a5a7a, 0.01); },
  picture(K) { K.box(0.86, 0.62, 0.04, 0, 1.62, 0x2a2a2e).box(0.76, 0.52, 0.006, 0, 1.62, 0x4a6a9a, 0.04).box(0.76, 0.2, 0.006, 0, 1.46, 0x3a5a3a, 0.042).box(0.2, 0.2, 0.004, -0.14, 1.56, 0x6a7a8a, 0.043, false, Math.PI / 4).box(0.26, 0.26, 0.004, 0.1, 1.56, 0x5a6a7a, 0.044, false, Math.PI / 4).box(0.76, 0.12, 0.004, 0, 1.42, 0x35553a, 0.046).cyl(0.06, 0.004, 0.22, 1.76, 0xe8b050, 0.043, 'z', false, 14); },
  mirror(K) { K.box(0.56, 0.96, 0.03, 0, 1.55, DK).box(0.5, 0.9, 0.006, 0, 1.55, 0xbfd0dc, 0.03).box(0.6, 0.03, 0.16, 0, 1.0, MT).cyl(0.035, 0.1, -0.15, 1.065, WHT, 0.05).box(0.12, 0.04, 0.08, 0.12, 1.035, 0x7a9ac8, 0.04).box(0.4, 0.04, 0.06, 0, 2.08, DK).box(0.34, 0.02, 0.04, 0, 2.055, [1.6, 1.4, 1.1], 0.01, true); },
  planter(K) { K.box(1.8, 0.3, 0.24, 0, 0.95, 0x3a3530).box(1.7, 0.02, 0.2, 0, 1.1, 0x2a2018, 0.02); const G = [0x2f7a38, 0x3d8a3a, 0x256030, 0x4a9a48];
    for (let i = 0; i < 11; i++) { const x = -0.78 + i * 0.156, h = 0.3 + ((i * 7) % 5) * 0.07; K.cone(0.07, h, x, 1.1 + h / 2, G[i % 4], 0.05, ((i * 3) % 5 - 2) * 0.12, ((i * 5) % 7 - 3) * 0.1); if (i % 2) K.box(0.02, 0.3 + (i % 3) * 0.12, 0.012, x, 0.92 - (i % 3) * 0.06, G[(i + 1) % 4], 0.24); }
    K.box(1.6, 0.05, 0.12, 0, 2.2, DK).box(1.5, 0.02, 0.08, 0, 2.165, GM, 0.02, true); for (const sx of [-0.7, 0.7]) K.box(0.02, 0.5, 0.02, sx, 2.45, MT, 0.03); },
  coil(K) { for (const x of [-0.62, 0, 0.62]) { K.box(0.3, 2.3, 0.1, x, 1.3, DK).box(0.11, 2.1, 0.02, x, 1.3, GB, 0.1, true); for (let i = 0; i < 6; i++) K.box(0.32, 0.045, 0.14, x, 0.4 + i * 0.36, MT); } K.box(1.7, 0.1, 0.16, 0, 2.5, STEEL).box(1.7, 0.1, 0.16, 0, 0.1, STEEL); },
  menu(K) { K.box(1.2, 0.76, 0.05, 0, 1.72, DK).box(1.0, 0.08, 0.006, 0, 2.0, GO, 0.05, true); [0.9, 0.7, 0.8, 0.5, 0.75, 0.6].forEach((w, i) => { K.box(w * 0.7, 0.035, 0.006, -0.5 + w * 0.35, 1.86 - i * 0.075, i % 3 === 2 ? [1.9, 1.7, 1.2] : GO, 0.05, true).box(0.12, 0.035, 0.006, 0.42, 1.86 - i * 0.075, GG, 0.05, true); });
    K.box(1.2, 0.04, 0.2, 0, 1.15, MT); [-0.4, -0.25, -0.1].forEach((x, i) => K.cyl(0.04, 0.1, x, 1.22, i === 1 ? 0x9ac0e0 : WHT, 0.06)); K.box(0.3, 0.02, 0.16, 0.3, 1.18, 0x9a6a3a, 0.02); },
  extinguisher(K) { K.box(0.34, 0.66, 0.03, 0, 1.0, DK).cyl(0.085, 0.44, 0, 0.96, RD, 0.04, 'y', false, 12).cyl(0.03, 0.08, 0, 1.22, MT, 0.095).box(0.14, 0.03, 0.03, 0.05, 1.27, DK, 0.11).box(0.02, 0.3, 0.02, 0.11, 1.08, 0x18181a, 0.12).box(0.1, 0.1, 0.006, 0, 1.0, 0xe0d8c0, 0.21).box(0.26, 0.26, 0.01, 0, 1.62, RD).box(0.16, 0.05, 0.006, 0, 1.62, WHT, 0.01).box(0.05, 0.16, 0.006, 0, 1.62, WHT, 0.01); },
  comm(K) { K.box(0.36, 0.52, 0.05, 0, 1.45, 0x30343c); for (let i = 0; i < 5; i++) K.box(0.22, 0.014, 0.006, 0, 1.3 + i * 0.03, 0x121418, 0.05); K.box(0.24, 0.1, 0.006, 0, 1.6, GO, 0.05, true).box(0.07, 0.07, 0.012, -0.08, 1.49, GB, 0.05, true).box(0.07, 0.07, 0.012, 0.08, 1.49, 0x5a6068, 0.05); },
  fountain(K) { K.box(0.52, 0.56, 0.06, 0, 1.22, MT).box(0.52, 0.18, 0.3, 0, 0.95, 0xc8ccd0).box(0.4, 0.012, 0.2, 0, 1.042, 0x3a3f45, 0.05).cyl(0.014, 0.1, 0.12, 1.09, MT, 0.12).box(0.1, 0.05, 0.02, -0.12, 0.95, DK, 0.3).box(0.3, 0.16, 0.006, 0, 1.36, 0x9ac0e0, 0.06).box(0.04, 0.04, 0.008, 0.2, 1.36, GB, 0.06, true).cyl(0.03, 0.5, 0, 0.55, MT, 0.04); },
  ventgrille(K) { K.box(0.96, 0.44, 0.03, 0, 0.45, 0x2f333a); for (let i = 0; i < 7; i++) K.box(0.84, 0.022, 0.016, 0, 0.3 + i * 0.05, 0x121418, 0.03); for (const sx of [-0.44, 0.44]) for (const y of [0.27, 0.63]) K.cyl(0.012, 0.01, sx, y, MT, 0.03, 'z', false, 6); },
  breaker(K) { K.box(0.52, 0.72, 0.12, 0, 1.5, 0x6a6f58).box(0.46, 0.6, 0.006, 0, 1.47, 0x777c66, 0.12).box(0.52, 0.06, 0.004, 0, 1.83, YL, 0.122).box(0.03, 0.1, 0.03, 0.18, 1.47, DK, 0.126).cyl(0.03, WH - 1.86, -0.12, (WH + 1.86) / 2, MT, 0.03).cyl(0.02, WH - 1.86, 0.1, (WH + 1.86) / 2, 0x4a4f58, 0.03); [GG, GG, GR].forEach((c, i) => K.box(0.035, 0.035, 0.008, -0.16 + i * 0.07, 1.7, c, 0.126, true)); K.box(0.2, 0.1, 0.004, -0.08, 1.4, 0xe0d8c0, 0.127); },
  kit(K) { K.box(0.5, 0.38, 0.14, 0, 1.4, WHT).box(0.2, 0.06, 0.006, 0, 1.4, RD, 0.14).box(0.06, 0.2, 0.006, 0, 1.4, RD, 0.14).box(0.16, 0.03, 0.03, 0, 1.62, DK, 0.05).box(0.5, 0.02, 0.145, 0, 1.3, 0xb8c0c4); },
};
const ROOM_DECOR = {
  bridge: ['monitorB', 'monitorO', 'monitorB', 'comm'], engineering: ['gauges', 'pipes', 'toolboard', 'monitorO', 'breaker', 'pipes'], sickbay: ['medcab', 'monitorG', 'medcab', 'kit', 'locker'], mess: ['menu', 'shelf', 'fountain', 'shelf'],
  transporter: ['coil', 'monitorB', 'comm'], shuttlebay: ['hose', 'toolboard', 'pipes', 'rack', 'extinguisher'], cargo: ['rack', 'rack', 'rack', 'extinguisher', 'breaker'], holodeck: ['comm'], quarters: ['locker', 'picture', 'mirror', 'shelf', 'picture'], arboretum: ['planter', 'planter', 'fountain'],
  corridor: ['extinguisher', 'comm', 'fountain', 'ventgrille', 'ventgrille', 'breaker', 'kit'],
  readyroom: ['picture', 'shelf', 'monitorB', 'locker'], brig: ['locker', 'monitorO', 'comm', 'extinguisher'], armory: ['rack', 'locker', 'rack', 'extinguisher'], gym: ['mirror', 'fountain', 'shelf', 'extinguisher'],
  lab: ['monitorG', 'shelf', 'locker', 'medcab', 'monitorB'], laundry: ['shelf', 'pipes', 'locker', 'hose'], lounge: ['picture', 'shelf', 'fountain', 'mirror', 'monitorB'], workshop: ['toolboard', 'rack', 'toolboard', 'pipes', 'breaker', 'hose'],
  plant: ['pipes', 'gauges', 'pipes', 'breaker', 'monitorO', 'hose'], morgue: ['medcab', 'locker', 'monitorG', 'kit'], datacore: ['monitorB', 'monitorO', 'comm', 'breaker', 'coil'], stores: ['rack', 'rack', 'shelf', 'locker', 'extinguisher'],
  washroom: ['mirror', 'fountain', 'shelf', 'kit'], airlock: ['locker', 'hose', 'rack', 'extinguisher', 'comm'],
};
const kitCache = {};
function kitGeo(name, build) { return kitCache[name] || (kitCache[name] = (() => { const K = new Kit(); build(K); return K.done(); })()); }
function kitMats() { const m = mats(); if (!m.kit) { m.kit = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 }); m.kitGlow = new THREE.MeshBasicMaterial({ vertexColors: true }); } return m; }
export const DECOR_KINDS = Object.keys(DECOR);
// one wall fixture as a stand-alone group (model viewer)
export function buildDecor(kind) { const m = kitMats(), geo = kitGeo(kind, DECOR[kind]), g = new THREE.Group(); if (geo.solid) g.add(new THREE.Mesh(geo.solid, m.kit)); if (geo.glow) g.add(new THREE.Mesh(geo.glow, m.kitGlow)); return g; }

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
    this.tops = {}; this.propHalf = TS * 0.36; this.tubeMouths = []; this.ladders = [];
    OWN = this.own = [];
    try { this._build(); this._details(); this._liminal(); this._dressing(); } finally { OWN = null; }
  }

  isTube(x, y) { return !!this.d.tubeAxis[x + y * this.W]; }
  tubeKind(x, y) { return this.d.tubeLevel[x + y * this.W]; }   // 'lo' | 'lad' | 'up' | undefined
  floorAt(x, y) { return this.tubeKind(x, y) === 'up' ? TUBE_UP : 0; }
  headroomAt(x, y) { return this.ceilAt(x, y) - this.floorAt(x, y); }
  ceilAt(x, y) {
    if (this.d.room[y]?.[x] === 'jefferies') return this.tubeKind(x, y) === 'lo' ? TUBE_H : TUBE_UP + TUBE_H;
    if (this.d.room[y]?.[x]) return WH;
    const h = Math.sin((x >> 1) * 12.9898 + (y >> 1) * 78.233 + this.d.deck * 3.1) * 43758.5453; const f = h - Math.floor(h);
    return f < 0.3 ? 2.45 : WH;
  }

  tile(x, z) { return [Math.floor(x / TS), Math.floor(z / TS)]; }
  center(tx, ty) { return [(tx + 0.5) * TS, (ty + 0.5) * TS]; }
  solid(tx, ty) { return tx < 0 || ty < 0 || tx >= this.W || ty >= this.H || this.grid[ty][tx] !== 0; }
  solidAt(x, z) { const [tx, ty] = this.tile(x, z); return this.solid(tx, ty); }
  // parkour helpers: climbable prop height on a tile (Infinity = not climbable / not a prop)
  topAt(tx, ty) { return this.grid[ty]?.[tx] === 2 ? (this.tops[tx + ty * this.W] ?? Infinity) : this.tubeKind(tx, ty) === 'up' ? TUBE_UP : Infinity; }
  groundAt(x, z, feetY = 0) {
    const [tx, ty] = this.tile(x, z);
    if (this.tubeKind(tx, ty) === 'up') return feetY >= TUBE_UP - 0.4 ? TUBE_UP : 0; const top = this.topAt(tx, ty); if (!isFinite(top) || feetY < top - 0.3) return 0;
    const h = this.propHalf + 0.12; return Math.abs(x - (tx + 0.5) * TS) <= h && Math.abs(z - (ty + 0.5) * TS) <= h ? top : 0;
  }
  // march a ray through the deck: returns { x, y, z, dist, kind: 'wall'|'ceiling'|'floor'|'prop', tx, ty } or null
  raycast(ox, oy, oz, dx, dy, dz, max = 20) {
    const st = 0.08;
    for (let t = 0.3; t <= max; t += st) {
      const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t; const [tx, ty] = this.tile(x, z); const c = this.grid[ty]?.[tx];
      let kind = null;
      if (c === undefined || c === 1 || (y < TUBE_UP && this.tubeKind(tx, ty) === 'up')) kind = 'wall'; else if (y <= 0) kind = 'floor'; else if (y >= this.ceilAt(tx, ty)) kind = 'ceiling';
      else if (c === 2) { const top = this.topAt(tx, ty), h = this.propHalf; if (y <= (isFinite(top) ? top : 2.2) && Math.abs(x - (tx + 0.5) * TS) <= h && Math.abs(z - (ty + 0.5) * TS) <= h) kind = 'prop'; }
      if (kind) { const b = t - st; return { x: ox + dx * b, y: Math.max(0.05, oy + dy * b), z: oz + dz * b, dist: b, kind, tx, ty }; }
    }
    return null;
  }

  // push circle out of solid tiles (and out of the side walls of Jiffy tubes)
  resolve(p, r) {
    const [tx, ty] = this.tile(p.x, p.z);
    const push = (cx, cz, hx, hz) => {
      const nx = Math.max(cx - hx, Math.min(p.x, cx + hx)), nz = Math.max(cz - hz, Math.min(p.z, cz + hz));
      const dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz; if (d2 >= r * r) return;
      if (d2 < 1e-8) { // center inside box: push along smallest axis
        const ox = hx - Math.abs(p.x - cx), oz = hz - Math.abs(p.z - cz);
        if (ox < oz) p.x += Math.sign(p.x - cx || 1) * (ox + r); else p.z += Math.sign(p.z - cz || 1) * (oz + r);
      } else { const d = Math.sqrt(d2); p.x += dx / d * (r - d); p.z += dz / d * (r - d); }
    };
    for (let iter = 0; iter < 2; iter++) {
      for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) {
        const cx = (x + 0.5) * TS, cz = (y + 0.5) * TS;
        const ax = this.d.tubeAxis[x + y * this.W];
        const tk = ax && this.d.tubeLevel[x + y * this.W], py = p.y || 0;
        if (ax && ((tk === 'up' && py < TUBE_UP - 0.4) || (tk === 'lo' && py > 0.45))) { push(cx, cz, TS / 2, TS / 2); continue; }   // wrong level: it is just bulkhead
        if (ax) { const o = TS / 2 - TUBE_SIDE / 2; for (const sgn of [-1, 1]) ax === 'x' ? push(cx, cz + sgn * o, TS / 2, TUBE_SIDE / 2) : push(cx + sgn * o, cz, TUBE_SIDE / 2, TS / 2); continue; }
        if (!this.solid(x, y)) continue;
        const prop = this.grid[y]?.[x] === 2;
        if (prop && (p.y || 0) >= this.topAt(x, y) - 0.03) continue;   // standing on / passing over a climbable prop
        const half = prop ? TS * 0.36 : TS / 2; push(cx, cz, half, half);
      }
    }
  }

  // line of sight; a tube's side walls block it unless one end is inside a tube
  los(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, dist = Math.hypot(dx, dz);
    const n = Math.ceil(dist / 0.4);
    const inTube = this.isTube(...this.tile(ax, az)) || this.isTube(...this.tile(bx, bz));
    for (let i = 1; i < n; i++) { const x = ax + dx * i / n, z = az + dz * i / n; if (this.solidAt(x, z) || (!inTube && this.isTube(...this.tile(x, z)))) return false; }
    return true;
  }

  // distance field from a tile (lower = closer), over walkable tiles. Weighted: tubes cost 2, ladders/upper runs 3,
  // vaulting over a climbable prop 4, so hostiles prefer the floor. Tubes are entered end-on only.
  // noTube = too big to crawl; climb = can vault props and use ladders / upper runs (crazed crew).
  field(tx, ty, noTube = false, climb = false) {
    const W = this.W, H = this.H, g = this.grid, T = this.d.tubeAxis, L = this.d.tubeLevel;
    const d = new Int16Array(W * H).fill(-1);
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return d;
    const cost = (x, y, i) => {
      const c = g[y][x];
      if (c === 0) { const k = L[i]; if (k === 'up' || k === 'lad') return climb ? 3 : -1; return T[i] ? (noTube ? -1 : 2) : 1; }
      if (c === 2 && climb && isFinite(this.topAt(x, y))) return 4;
      return -1;
    };
    const q0 = tx + ty * W; d[q0] = 0; const buckets = [[q0]];
    for (let c = 0; c < buckets.length; c++) {
      const b = buckets[c]; if (!b) continue;
      for (let j = 0; j < b.length; j++) {
        const id = b[j]; if (d[id] !== c) continue;
        const x = id % W, y = (id / W) | 0, ta = T[id];
        for (const [dx, dy] of DIRS) {
          const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const n = nx + ny * W, w = cost(nx, ny, n); if (w < 0) continue;
          const tb = T[n];
          if ((ta === 'x' || tb === 'x') && dy !== 0) continue; if ((ta === 'y' || tb === 'y') && dx !== 0) continue;
          const nd = c + w; if (d[n] < 0 || nd < d[n]) { d[n] = nd; (buckets[nd] || (buckets[nd] = [])).push(n); }
        }
      }
    }
    return d;
  }
  // where a climbing hostile's feet are at (x, z): prop top, upper tube run, or partway up a ladder
  hostileGround(x, z) {
    const [tx, ty] = this.tile(x, z), i = tx + ty * this.W, k = this.d.tubeLevel[i];
    if (this.grid[ty]?.[tx] === 2) { const t = this.topAt(tx, ty); return isFinite(t) ? t : 0; }
    if (k === 'up') return TUBE_UP;
    if (k === 'lad') {
      const t = this.d.tubes.find(t => t.ladder >= 0 && t.tiles[t.ladder][0] === tx && t.tiles[t.ladder][1] === ty); if (!t) return 0;
      const up = t.tiles[t.ladder + 1], ux = up[0] - tx, uz = up[1] - ty, cx = (tx + 0.5) * TS, cz = (ty + 0.5) * TS;
      const s = ((x - cx) * ux + (z - cz) * uz) / TS + 0.5; return TUBE_UP * Math.max(0, Math.min(1, s * 1.5 - 0.3));
    }
    return 0;
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
    // per-room floor material; corridors follow the ship's hull class. Generated sets (ORM-packed) fall back to the scans if missing.
    const FLOOR_MAT = { deck: { metalness: 0.55, roughness: 0.9, ns: 1.3 }, tile: { metalness: 0.0, roughness: 0.55, ns: 0.8 }, carpet: { metalness: 0, roughness: 1, ns: T.real ? 1.6 : 0.9 }, holo: { metalness: 0, roughness: 0.3, ns: 0.9 },
      grate: { ns: 1.2, gain: 1.15 }, rubber: { ns: 1.0, gain: 1.1 }, hex: { ns: 0.8, white: 0.4 }, paver: { ns: 1.3, gain: 1.15 } };
    const fk = (k, fb) => T.d[k] ? k : fb;
    const FLOOR_OF = { engineering: fk('grate', 'deck'), shuttlebay: 'deck', cargo: 'deck', transporter: fk('rubber', 'deck'), jefferies: fk('grate', 'deck'), sickbay: fk('hex', 'tile'), mess: 'tile', holodeck: 'holo', arboretum: fk('paver', 'carpet'),
      brig: 'deck', armory: 'deck', airlock: 'deck', workshop: 'deck', stores: 'deck', plant: fk('grate', 'deck'), gym: fk('rubber', 'deck'), datacore: fk('rubber', 'deck'), laundry: 'tile', morgue: 'tile', lab: 'tile', washroom: fk('hex', 'tile') };
    const corridorFloor = fk({ longhouse: 'rubber', plough: 'rubber', cruller: 'tile' }[ship.hull] || 'carpet', 'carpet');
    const byKind = {};
    for (const t of open) { const r = d.room[t[1]][t[0]], k = r ? FLOOR_OF[r] || 'carpet' : corridorFloor; (byKind[k] || (byKind[k] = [])).push(t); }
    const dummy = new THREE.Object3D();
    for (const [kind, list] of Object.entries(byKind)) {
      if (!list.length) continue;
      const geo = new THREE.PlaneGeometry(TS, TS); geo.rotateX(-Math.PI / 2);
      const fm = FLOOR_MAT[kind], dm = T.d[kind];
      const fmat = new THREE.MeshStandardMaterial({ map: T[kind], normalMap: dm.normal, normalScale: new THREE.Vector2(fm.ns, fm.ns), roughnessMap: dm.rough, roughness: dm.orm ? 1 : fm.roughness, metalness: dm.orm ? 1 : fm.metalness });
      if (dm.orm) { fmat.aoMap = dm.rough; fmat.metalnessMap = dm.rough; }
      const im = new THREE.InstancedMesh(geo, fmat, list.length);
      list.forEach(([x, y], i) => {
        dummy.position.set((x + 0.5) * TS, 0, (y + 0.5) * TS); dummy.rotation.y = kind === 'holo' ? 0 : Math.floor(rndv() * 4) * Math.PI / 2; dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
        const r = d.room[y][x]; const c = kind === 'holo' ? new THREE.Color(0xffffff) : floorCol.clone();
        if (r && kind !== 'holo') c.lerp(new THREE.Color(ROOMS[r].floor), 0.6);
        if (kind === 'tile' || fm.white) c.lerp(new THREE.Color(0xffffff), fm.white || 0.35);
        if (kind !== 'holo') c.multiplyScalar(((r ? 0.9 : 0.82) + rndv() * 0.2) * (fm.gain || 1));
        im.setColorAt(i, c);
      });
      im.receiveShadow = true; g.add(im);
    }
    dummy.rotation.set(0, 0, 0);
    // ceiling: per-room variants (acoustic tile, riveted metal, slatted baffle); corridors follow the hull class
    {
      const geo = new THREE.PlaneGeometry(TS, TS); geo.rotateX(Math.PI / 2);
      const ck = (k) => T.d[k] ? k : 'ceil';
      const CEIL_OF = { engineering: ck('ceilg'), transporter: ck('ceilg'), cargo: ck('ceilm'), shuttlebay: ck('ceilm'), jefferies: ck('ceilm'), brig: ck('ceilm'), armory: ck('ceilm'), stores: ck('ceilm'), airlock: ck('ceilm'), workshop: ck('ceilm'), plant: ck('ceilg'), datacore: ck('ceilg') };
      const corridorCeil = ck({ longhouse: 'ceilm', plough: 'ceilm', tandem: 'ceilg' }[ship.hull] || 'ceilt');
      const byC = {}; for (const t of open) { const r = d.room[t[1]][t[0]], k = r ? CEIL_OF[r] || ck('ceilt') : corridorCeil; (byC[k] || (byC[k] = [])).push(t); }
      for (const [kind, list] of Object.entries(byC)) {
        const dm = T.d[kind]; if (!dm) continue;
        const cm = new THREE.MeshStandardMaterial(dm.orm ? { map: T[kind], normalMap: dm.normal, roughnessMap: dm.rough, aoMap: dm.rough, metalnessMap: dm.rough, roughness: 1, metalness: 1 } : { map: T[kind], normalMap: dm.normal, roughnessMap: dm.rough, roughness: 1, metalness: 0 });
        const im = new THREE.InstancedMesh(geo, cm, list.length);
        list.forEach(([x, y], i) => { dummy.position.set((x + 0.5) * TS, this.ceilAt(x, y), (y + 0.5) * TS); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, wallCol.clone().multiplyScalar(kind === 'ceilt' ? 1.0 : 0.85)); });
        g.add(im);
      }
    }
    // Jiffy tubes: the tube's own side walls, header/base blocks, ribs, conduit, amber guide strips, ladders and hatch frames
    if (d.tubes?.length) {
      const m = mats();
      const shell = new THREE.MeshStandardMaterial({ map: T.wall, normalMap: T.d.wall.normal, roughness: 0.8, metalness: 0.3, color: wallCol.clone().multiplyScalar(0.8) });
      const inner = new THREE.MeshStandardMaterial({ color: 0x4a4f57, metalness: 0.7, roughness: 0.5, normalMap: T.d.deck.normal, normalScale: new THREE.Vector2(0.4, 0.4) });
      const amber = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.75, 0.2) });
      const inst = (geo, mat, list) => { if (!list.length) return null; const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach(([px, py, pz, ry], i) => { dummy.position.set(px, py, pz); dummy.rotation.set(0, ry || 0, 0); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); }); im.castShadow = im.receiveShadow = true; g.add(im); return im; };
      const headLo = [], headHi = [], base = [], side = [], sideTall = [], rib = [], strip = [], pipe = [], post = [], bar = [], rail = [], rung = [];
      const o = TS / 2 - TUBE_SIDE / 2, hw = TS / 2 - TUBE_SIDE, FULL = TUBE_UP + TUBE_H;   // side-wall offset, half width of the crawlway, shaft height
      for (const t of d.tubes) t.tiles.forEach(([x, y], i) => {
        const ax = t.axis, kind = d.tubeLevel[x + y * W], y0 = kind === 'up' ? TUBE_UP : 0;
        const cx = (x + 0.5) * TS, cz = (y + 0.5) * TS, ry = ax === 'x' ? Math.PI / 2 : 0, P = (along, across) => ax === 'x' ? [cx + along, cz + across] : [cx + across, cz + along];
        if (kind === 'lo') headLo.push([cx, (WH + TUBE_H) / 2, cz, 0]); else headHi.push([cx, (WH + FULL) / 2, cz, 0]);
        if (kind === 'up') base.push([cx, TUBE_UP / 2, cz, 0]);
        for (const sg of [-1, 1]) {
          let q = P(0, sg * o); (kind === 'lad' ? sideTall : side).push([q[0], kind === 'lad' ? FULL / 2 : y0 + TUBE_H / 2, q[1], ry]);
          q = P(0, sg * (hw - 0.02)); strip.push([q[0], y0 + 0.025, q[1], ry]);
          if (kind !== 'lad') { q = P(0, sg * (hw - 0.07)); pipe.push([q[0], y0 + TUBE_H - 0.08, q[1], ry]); for (const al of [-TS / 4, TS / 4]) { q = P(al, sg * (hw - 0.03)); rib.push([q[0], y0 + TUBE_H / 2, q[1], ry]); } }
        }
        if (kind !== 'lad') for (const al of [-TS / 4, TS / 4]) { const q = P(al, 0); bar.push([q[0], y0 + TUBE_H - 0.03, q[1], ry]); }
        else {   // ladder on the face of the upper run's base block
          const nxt = t.tiles[i + 1], dir = ax === 'x' ? Math.sign(nxt[0] - x) : Math.sign(nxt[1] - y), al = dir * (TS / 2 - 0.07);
          for (const sg of [-1, 1]) { const q = P(al, sg * 0.24); rail.push([q[0], (TUBE_UP + 0.95) / 2, q[1], ry]); }
          for (let h = 0.3; h < TUBE_UP + 0.9; h += 0.3) { const q = P(al, 0); rung.push([q[0], h, q[1], ry]); }
          const q = P(-dir * (TS / 2 - 0.05), 0); const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.03), amber); lamp.position.set(q[0], FULL - 0.25, q[1]); lamp.rotation.y = ry; g.add(lamp);
          this.ladders.push({ x: cx, z: cz });
        }
      });
      // hazard-striped hatch frame on each mouth (the far mouth of a laddered tube sits high in the wall)
      for (const t of d.tubes) for (const [end, first] of [[t.a, t.tiles[0]], [t.b, t.tiles[t.tiles.length - 1]]]) {
        const y0 = d.tubeLevel[first[0] + first[1] * W] === 'up' ? TUBE_UP : 0;
        const bx = ((end[0] + first[0]) / 2 + 0.5) * TS, bz = ((end[1] + first[1]) / 2 + 0.5) * TS, ry = t.axis === 'x' ? Math.PI / 2 : 0;
        const ox = t.axis === 'x' ? 0 : 1, oz = t.axis === 'x' ? 1 : 0, sx = Math.sign(end[0] - first[0]) * 0.05, sz = Math.sign(end[1] - first[1]) * 0.05;
        for (const sg of [-1, 1]) post.push([bx + sx + ox * sg * (hw + 0.07), y0 + TUBE_H / 2, bz + sz + oz * sg * (hw + 0.07), ry]);
        for (const yy of y0 ? [y0 + TUBE_H + 0.07, y0 - 0.07] : [TUBE_H + 0.07]) { const top = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.28, 0.14, 0.14), m.hazard); top.position.set(bx + sx, yy, bz + sz); top.rotation.y = ry; g.add(top); }
        if (!y0) { const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.03), amber); lamp.position.set(bx + sx * 3, TUBE_H + 0.24, bz + sz * 3); lamp.rotation.y = ry; g.add(lamp); }
        this.tubeMouths.push({ x: bx, z: bz, y: y0 });
      }
      inst(new THREE.BoxGeometry(TS, WH - TUBE_H, TS), shell, headLo);
      inst(new THREE.BoxGeometry(TS, WH - FULL, TS), shell, headHi);
      inst(new THREE.BoxGeometry(TS, TUBE_UP, TS), shell, base);
      inst(new THREE.BoxGeometry(TUBE_SIDE, TUBE_H, TS), shell, side);
      inst(new THREE.BoxGeometry(TUBE_SIDE, FULL, TS), shell, sideTall);
      inst(new THREE.BoxGeometry(0.06, TUBE_H, 0.1), inner, rib);
      inst(new THREE.BoxGeometry(hw * 2, 0.06, 0.1), inner, bar);
      inst(new THREE.BoxGeometry(0.14, TUBE_H, 0.14), m.hazard, post);
      inst(new THREE.BoxGeometry(0.045, TUBE_UP + 0.95, 0.045), m.pipe, rail);
      inst(new THREE.BoxGeometry(0.5, 0.035, 0.035), m.pipe, rung);
      const pg = new THREE.CylinderGeometry(0.045, 0.045, TS, 8); pg.rotateX(Math.PI / 2); inst(pg, m.pipe, pipe);
      const st = inst(new THREE.BoxGeometry(0.03, 0.03, TS), amber, strip); if (st) st.castShadow = false;
    }
    // light panels (steady + flickering + dead)
    {
      const lightCol = new THREE.Color(ship.light).multiplyScalar(3.4);
      const geo = new THREE.PlaneGeometry(1.5, 0.6); geo.rotateX(Math.PI / 2);
      const steady = [], flick = [];
      for (const [x, y] of open) {
        const r = d.room[y][x];
        if (r === 'jefferies') continue;   // tubes are lit only by their floor strips
        const lit = r ? true : ((x + y) % 2 === 0);
        if (!lit) continue;
        { const hz = Math.sin((x >> 2) * 91.7 + (y >> 2) * 17.3 + d.deck * 5.7) * 9871.3; if (!r && hz - Math.floor(hz) < 0.2) continue; } // pitch-black stretches
        const roll = rndv();
        if (roll < 0.06) continue; // dead panel
        (roll < 0.14 ? flick : steady).push([x, y]);
      }
      const mkPanels = (list, name) => {
        if (!list.length) return null;
        const mat = new THREE.MeshBasicMaterial({ color: lightCol.clone(), map: T.lens || null });
        const im = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach(([x, y], i) => {
          const ch = this.ceilAt(x, y); dummy.position.set((x + 0.5) * TS, ch - 0.02, (y + 0.5) * TS); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
          // room-specific light colour; corridor tubes vary a little in age (some yellowed, some dim)
          const r = d.room[y][x], col = new THREE.Color(ROOM_LIGHT[r] || 0xffffff); if (!r) col.lerp(new THREE.Color(0xffdfae), rndv() * 0.55).multiplyScalar(0.78 + rndv() * 0.22);
          im.setColorAt(i, col); this.panels.push({ x: (x + 0.5) * TS, y: ch - 0.3, z: (y + 0.5) * TS, flick: name === 'flick', col, room: r });
        });
        g.add(im); return mat;
      };
      this.steadyMat = mkPanels(steady, 'steady'); this.alertCol = new THREE.Color(0xff1808);
      const fm = mkPanels(flick, 'flick');
      if (fm) this.flickMat = fm;
      this.lightCol = lightCol;
    }
    // walls
    {
      // bulkhead variant per block: the room it faces decides (painted panel, padded, grille); corridors follow the hull class
      const geo = new THREE.BoxGeometry(TS, WH, TS);
      const corridorWall = T.d[CORRIDOR_WALL[ship.hull]] ? CORRIDOR_WALL[ship.hull] : 'wall', groups = {}; this.wallKind = {};
      for (const [x, y] of walls) {
        const cnt = {}; let best = null;
        for (const [dx, dy] of DIRS) { const c = this.grid[y + dy]?.[x + dx]; if (c === undefined || c === 1) continue; const k = WALL_OF[d.room[y + dy][x + dx]]; if (k && T.d[k]) { cnt[k] = (cnt[k] || 0) + 1; if (!best || cnt[k] > cnt[best]) best = k; } }
        const kind = best || corridorWall; this.wallKind[x + y * W] = kind; (groups[kind] || (groups[kind] = [])).push([x, y]);
      }
      for (const [kind, list] of Object.entries(groups)) {
        const dm = T.d[kind], ns = kind === 'wall' ? (T.real ? 0.55 : 1) : 0.9;
        const mat = new THREE.MeshStandardMaterial({ map: T[kind], normalMap: dm.normal, normalScale: new THREE.Vector2(ns, ns), roughnessMap: dm.rough, roughness: dm.orm ? 1 : T.real ? 0.8 : 1, metalness: dm.orm ? 1 : T.real ? 0.3 : 0.05 });
        if (dm.orm) { mat.aoMap = dm.rough; mat.metalnessMap = dm.rough; }
        const im = new THREE.InstancedMesh(geo, mat, list.length), base = kind === 'wallq' ? wallCol.clone().lerp(new THREE.Color(ship.accent), 0.14) : kind === 'wallg' ? wallCol.clone().multiplyScalar(0.92) : wallCol;
        list.forEach(([x, y], i) => {
          dummy.position.set((x + 0.5) * TS, WH / 2, (y + 0.5) * TS); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
          im.setColorAt(i, base.clone().multiplyScalar(0.82 + rndv() * 0.22));
        });
        im.castShadow = true; im.receiveShadow = true; g.add(im);
      }
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
        const face = { tx: x, ty: y, dx, dy, px, pz, ry, room: roomT, wall: this.wallKind[x + y * W] }; this.wallFaces.push(face);   // .deco = something already hangs here
        if (roll < 0.18) { lcars.push({ px, pz, ry, n: 1 + Math.floor(rndv() * 3) }); face.deco = true; }
        else if (roll < 0.26 || (roomT === 'bridge' && roll < 0.6)) { windows.push({ px, pz, ry }); face.deco = true; face.win = true; }
      }
      const sg = new THREE.PlaneGeometry(TS, 0.14);
      const sm = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ color: 0xffffff }), stripes.length || 1);
      stripes.forEach((s, i) => { dummy.position.set(s.px, 1.05, s.pz); dummy.rotation.set(0, s.ry, 0); dummy.updateMatrix(); sm.setMatrixAt(i, dummy.matrix); sm.setColorAt(i, new THREE.Color(ship.accent).multiplyScalar(0.55)); });
      sm.count = stripes.length; g.add(sm);
      const pal = [ship.accent, 0xcc99cc, 0x9999ff, 0xff9966, 0xffcc99].map(c => new THREE.Color(c).multiplyScalar(0.8));
      const items = []; lcars.forEach(l => { for (let k = 0; k < l.n; k++) items.push({ ...l, k }); });
      const lg = new THREE.PlaneGeometry(0.42, 0.26);
      const lm = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ color: 0xffffff, map: labelTex() }), items.length || 1);
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
      if (windows.length && T.d.glass) {   // smudged, scratched pane in front of the view
        const gm = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.7, 1.0), new THREE.MeshStandardMaterial({ color: 0xbfe4ff, transparent: true, opacity: 0.16, depthWrite: false, roughness: 1, metalness: 0, normalMap: T.d.glass.normal, roughnessMap: T.d.glass.rough, envMapIntensity: 1.5 }), windows.length);
        windows.forEach((w, i) => { dummy.position.set(w.px - Math.sin(w.ry) * 0.012, 1.7, w.pz - Math.cos(w.ry) * 0.012); dummy.rotation.set(0, w.ry, 0); dummy.updateMatrix(); gm.setMatrixAt(i, dummy.matrix); });
        gm.renderOrder = 2; g.add(gm);
      }
      dummy.rotation.set(0, 0, 0);
    }
    // props
    for (const p of d.props) {
      const m = buildProp(p.kind);
      const [cx, cz] = this.center(p.tx, p.ty);
      m.position.set(cx, 0, cz); m.rotation.y = p.kind === 'viewscreen' ? 0 : p.rot;
      if (p.kind === 'viewscreen') { m.position.z -= TS * 0.35; }
      g.add(m); if (m.userData.top) this.tops[p.tx + p.ty * this.W] = m.userData.top;
      m.traverse(o => { if (o.isMesh) { const gb = o.geometry; if (!gb.boundingBox) gb.computeBoundingBox(); const bs = gb.boundingBox.getSize(_psz); o.castShadow = Math.max(bs.x * o.scale.x, bs.y * o.scale.y, bs.z * o.scale.z) >= 0.03; o.receiveShadow = true; } if (o.name === 'spin') this.spin.push(o); if (o.name === 'core') this.core = o; });
    }
    // loose clutter from the ship inventory: small things on the floor near walls and on tables (look at one for its name; see nearestClutter in js/main.js)
    this.clutter = [];
    {
      const shapes = [new THREE.BoxGeometry(1, 1, 1), new THREE.CylinderGeometry(0.5, 0.5, 1, 10), new THREE.BoxGeometry(1, 1, 1)], lists = [[], [], []];
      const ph = (str) => { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };
      const add = (it, x, y, z, k) => { const h = ph(it[0]), sz = [[0.12 + h * 0.16, 0.08 + h * 0.12, 0.1 + h * 0.14], [0.07 + h * 0.05, 0.12 + h * 0.14, 0.07 + h * 0.05], [0.26, 0.025, 0.2]][it[2]]; const rec = { x, y: y + sz[1] / 2, z, name: it[0], real: it[1], gone: false }; lists[it[2]].push({ x, y: y + sz[1] / 2, z, sx: sz[0], sy: sz[1], sz: sz[2], ry: rndv() * 6.28, h, rec });
        this.clutter.push(rec); };
      for (const r of d.rooms) {
        const pool = clutterFor(r.type); if (!pool.length) continue;
        const tiles = []; for (let ty = r.y; ty < r.y + r.h; ty++) for (let tx = r.x; tx < r.x + r.w; tx++) if (this.grid[ty][tx] === 0 && (tx === r.x || ty === r.y || tx === r.x + r.w - 1 || ty === r.y + r.h - 1)) tiles.push([tx, ty]);
        const n = Math.min(tiles.length, 3 + Math.floor(r.w * r.h / 9)); for (let i = 0; i < n; i++) { const [tx, ty] = tiles.splice(Math.floor(rndv() * tiles.length), 1)[0]; const it = pool[Math.floor(rndv() * pool.length)]; add(it, (tx + 0.5 + (rndv() - 0.5) * 0.7) * TS, 0, (ty + 0.5 + (rndv() - 0.5) * 0.7) * TS, 0); }
        for (const p of d.props) if (p.kind === 'table' && p.tx >= r.x && p.tx < r.x + r.w && p.ty >= r.y && p.ty < r.y + r.h && rndv() < 0.7) { const [cx, cz] = this.center(p.tx, p.ty); add(pool[Math.floor(rndv() * pool.length)], cx + (rndv() - 0.5) * 0.7, 0.78, cz + (rndv() - 0.5) * 0.7, 0); }
      }
      const cm = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.2 });
      shapes.forEach((geo, k) => { const l = lists[k]; if (!l.length) return; const im = new THREE.InstancedMesh(geo, cm, l.length); l.forEach((c, i) => { c.rec.inst = { im, i }; dummy.position.set(c.x, c.y, c.z); dummy.rotation.set(0, c.ry, 0); dummy.scale.set(c.sx, c.sy, c.sz); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, new THREE.Color().setHSL(c.h, k === 2 ? 0.08 : 0.35, k === 2 ? 0.75 : 0.45)); }); im.castShadow = im.receiveShadow = true; g.add(im); });
      dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0);
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
      m.scale.set(1, 0.3, 1); m.position.set(f.px + f.dx * 0.01, y, f.pz + f.dy * 0.01); m.rotation.y = f.ry; g.add(m); f.sign = true;
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
      frames.push({ x: (x + 0.5) * TS + dx * TS / 2, z: (y + 0.5) * TS + dy * TS / 2, ax: dx !== 0, room: r.type });
    }
    this.doorFrames = frames;
    if (frames.length) {
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), T.d.trim ? new THREE.MeshStandardMaterial({ map: T.trim, normalMap: T.d.trim.normal, roughnessMap: T.d.trim.rough, metalnessMap: T.d.trim.rough, aoMap: T.d.trim.rough, roughness: 1, metalness: 1, color: 0xffffff }) : new THREE.MeshLambertMaterial({ color: 0xffffff }), frames.length * 3);
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
      const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ map: dressTex().vent, roughness: 0.6, metalness: 0.5 }), vents.length);
      vents.forEach((v, i) => { dummy.position.set((v.x + 0.5) * TS, this.ceilAt(v.x, v.y) - 0.03, (v.y + 0.5) * TS); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
      g.add(im);
    }
    this.vents = vents;
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
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; this.own.push(t); return t;
    });
    const doors = nums.map(() => []);
    for (const f of this.wallFaces) if (!f.room && rnd() < 0.13) { doors[Math.floor(rnd() * nums.length)].push(f); f.deco = true; }
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
      const f = free[Math.floor(rnd() * free.length)], txt = posters[Math.floor(rnd() * posters.length)]; f.deco = true;
      const c = document.createElement('canvas'); c.width = 256; c.height = 340; const x = c.getContext('2d');
      x.fillStyle = ['#e8e0c8', '#c9d8e0', '#e0c9c9'][Math.floor(rnd() * 3)]; x.fillRect(0, 0, 256, 340);
      x.strokeStyle = '#' + new THREE.Color(ship.accent).getHexString(); x.lineWidth = 12; x.strokeRect(6, 6, 244, 328);
      x.fillStyle = '#' + new THREE.Color(ship.accent).getHexString(); x.beginPath(); x.arc(128, 90, 42, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(114, 82, 8, 0, 7); x.arc(142, 82, 8, 0, 7); x.fill();
      x.fillStyle = '#222'; x.font = 'bold 30px Helvetica'; x.textAlign = 'center'; txt.split('\n').forEach((l, j, a) => x.fillText(l, 128, 190 + j * 38));
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; this.own.push(t);
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
        list.forEach((p, i) => { dummy.position.set(p.x, p.y + 0.3 - 1.1 + 0.2, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); im.setColorAt(i, p.col); });
        im.frustumCulled = false; this.cones.add(im); return mat;
      };
      this.cones = new THREE.Group(); g.add(this.cones);
      this.coneMat = mkCones(this.panels.filter(p => !p.flick)); this.coneFlickMat = mkCones(this.panels.filter(p => p.flick));
    }
    // --- a beacon at the end of the hall
    const [ex, ey] = d.exit; const [cx, cz] = this.center(ex, ey);
    this.liftLight = new THREE.PointLight(0xff3030, 5, 11, 1.6); this.liftLight.position.set(cx, 2.3, cz); g.add(this.liftLight);
  }

  // Visual density on top of the structural build: wall fixtures per room type, ribs, conduit, emergency lamps,
  // vent light shafts, grime, floor way-finding, window frames. Nothing here collides (all of it is under 0.25 m deep).
  _dressing() {
    const d = this.d, ship = this.ship, g = this.group, T = dressTex(), m = kitMats();
    const rnd = mulberry32(d.deck * 9173 + 29), dummy = new THREE.Object3D(), accent = new THREE.Color(ship.accent);
    const inst = (geo, mat, list, each, parent = g) => {
      if (!geo || !list.length) return null; const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => { dummy.position.set(0, 0, 0); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); const c = each(it, dummy, i); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); if (c) im.setColorAt(i, c); });
      im.receiveShadow = true; parent.add(im); return im;
    };
    const onFace = (f, o, y = 0, out = 0) => { o.position.set(f.px + f.dx * out, y, f.pz + f.dy * out); o.rotation.y = f.ry; };
    const kit = (name, build, list, each = (f, o) => onFace(f, o)) => { const geo = kitGeo(name, build); inst(geo.solid, m.kit, list, each); const gl = inst(geo.glow, m.kitGlow, list, each); if (gl) gl.receiveShadow = false; };
    const hash = (a, b) => { const h = Math.sin(a * 12.9898 + b * 78.233 + d.deck * 4.1) * 43758.5453; return h - Math.floor(h); };
    const [ex, ey] = d.exit;
    const faces = this.wallFaces.filter(f => { const ox = f.tx + f.dx, oy = f.ty + f.dy; return f.room !== 'jefferies' && !this.isTube(ox, oy) && !(ox === ex && oy === ey); });
    const ceilOf = (f) => this.ceilAt(f.tx + f.dx, f.ty + f.dy);
    const decal = (map, opacity, color = 0xffffff) => new THREE.MeshLambertMaterial({ map, color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });

    // --- emergency lamps: dim red normally, pulse on alert, hold steady when the power is out
    {
      const list = faces.filter(f => !f.room && !f.deco && rnd() < 0.085); list.forEach(f => { f.deco = true; });
      for (const r of d.rooms) { const fs = faces.filter(f => !f.deco && f.room === r.type && f.tx + f.dx >= r.x && f.tx + f.dx < r.x + r.w && f.ty + f.dy >= r.y && f.ty + f.dy < r.y + r.h); if (fs.length) { const f = fs[Math.floor(rnd() * fs.length)]; f.deco = true; list.push(f); } }
      kit('emerg', K => { K.box(0.4, 0.16, 0.08, 0, 0, DK).box(0.44, 0.03, 0.11, 0, 0.09, STEEL).box(0.44, 0.03, 0.11, 0, -0.09, STEEL); for (const x of [-0.1, 0, 0.1]) K.box(0.012, 0.15, 0.012, x, 0, STEEL, 0.1); K.box(0.2, 0.06, 0.004, 0, -0.2, 0xe0d8c0).box(0.14, 0.02, 0.002, 0, -0.2, RD, 0.004); }, list, (f, o) => onFace(f, o, Math.min(2.15, ceilOf(f) - 0.3)));
      this.emergMat = new THREE.MeshBasicMaterial({ color: 0x400806 });
      const lens = inst(new THREE.BoxGeometry(0.3, 0.09, 0.03), this.emergMat, list, (f, o) => onFace(f, o, Math.min(2.15, ceilOf(f) - 0.3), 0.085)); if (lens) lens.receiveShadow = false;
      this.emergHalo = new THREE.MeshBasicMaterial({ map: T.halo, color: 0xff2a14, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false });
      const halo = inst(new THREE.PlaneGeometry(2.2, 1.7), this.emergHalo, list, (f, o) => onFace(f, o, Math.min(2.15, ceilOf(f) - 0.3), 0.012)); if (halo) halo.receiveShadow = false;
      this.emerg = list.map(f => ({ x: f.px + f.dx * 0.3, y: Math.min(2.15, ceilOf(f) - 0.3), z: f.pz + f.dy * 0.3 }));
    }
    // --- wall fixtures by room type; corridors get the odd extinguisher, comm panel, drinking fountain…
    {
      const byKind = {};
      for (const f of faces) {
        if (f.deco) continue; const pool = ROOM_DECOR[f.room || 'corridor']; if (!pool) continue;
        if (rnd() > (f.room ? (f.room === 'holodeck' ? 0.08 : 0.5) : 0.085)) continue;
        let k = pool[Math.floor(rnd() * pool.length)]; if ((k === 'pipes' || k === 'breaker' || k === 'planter' || k === 'coil' || k === 'rack') && ceilOf(f) < WH) k = 'ventgrille';
        f.deco = true; (byKind[k] || (byKind[k] = [])).push(f);
      }
      // guaranteed searchable fixtures: two per room (suited to the room), two along corridors, on wall faces the random pass left free
      {
        const FIT = { sickbay: ['medcab', 'kit'], engineering: ['toolboard', 'locker'], shuttlebay: ['toolboard', 'hose', 'locker'], cargo: ['rack', 'locker'], mess: ['shelf', 'locker'], quarters: ['locker', 'shelf'], bridge: ['locker', 'kit'], transporter: ['locker', 'toolboard'], holodeck: ['locker'], arboretum: ['shelf', 'toolboard'], corridor: ['kit', 'locker'],
          readyroom: ['locker', 'shelf'], brig: ['locker'], armory: ['rack', 'locker'], gym: ['locker', 'shelf'], lab: ['medcab', 'shelf', 'locker'], laundry: ['shelf', 'locker'], lounge: ['shelf'], workshop: ['toolboard', 'rack', 'hose'], plant: ['toolboard', 'hose', 'locker'], morgue: ['medcab', 'kit', 'locker'], datacore: ['toolboard', 'locker'], stores: ['rack', 'shelf', 'locker'], washroom: ['kit', 'shelf'], airlock: ['locker', 'hose', 'rack'] };
        const free = {}; for (const f of faces) { if (f.deco || f.win || f.sign) continue; const r = f.room || 'corridor'; if (FIT[r] && (r !== 'corridor' || (f.tx + f.ty) % 3 === 0)) (free[r] || (free[r] = [])).push(f); }
        for (const [r, fl] of Object.entries(free)) { for (let i = fl.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [fl[i], fl[j]] = [fl[j], fl[i]]; }
          for (const f of fl.slice(0, 2)) { let k = FIT[r][Math.floor(rnd() * FIT[r].length)]; if (k === 'rack' && ceilOf(f) < WH) k = 'locker'; f.deco = true; (byKind[k] || (byKind[k] = [])).push(f); } }
      }
      for (const [k, list] of Object.entries(byKind)) kit(k, DECOR[k], list);
      // searchable fixtures (see js/items.js): a spot just in front of the wall face, facing back at it
      this.searchSites = []; for (const [k, list] of Object.entries(byKind)) if (SEARCHABLE.has(k)) for (const f of list) this.searchSites.push({ x: f.px + f.dx * 0.35, z: f.pz + f.dy * 0.35, nx: f.dx, nz: f.dy, kind: k, room: f.room || 'corridor', used: false });
      this.decorCount = Object.values(byKind).reduce((a, l) => a + l.length, 0);
    }
    // --- ribbed bulkheads and conduit runs along corridor walls
    {
      const ribs = faces.filter(f => !f.room && (f.tx + f.ty) % 2 === 0);
      kit('rib', K => { K.box(0.16, WH, 0.07, TS / 2 - 0.08, WH / 2, 0x7d838c).box(0.06, WH, 0.02, TS / 2 - 0.08, WH / 2, 0x4a4f58, 0.07).box(0.2, 0.3, 0.1, TS / 2 - 0.08, 0.15, 0x3a3e45).box(0.17, 0.05, 0.075, TS / 2 - 0.08, 1.05, YL); }, ribs);
      const runs = faces.filter(f => !f.room && !f.win && !f.sign && hash(f.dy ? f.ty * 2 + (f.dy > 0 ? 1 : 0) : 500 + f.tx * 2 + (f.dx > 0 ? 1 : 0), 7.7) < 0.42);
      kit('conduit', K => { K.cyl(0.035, TS, 0, 2.33 - 0.035, 0x6a7078, 0.03, 'x', false, 8).cyl(0.022, TS, 0, 2.25 - 0.022, 0x8a3a2a, 0.03, 'x', false, 6).cyl(0.016, TS, 0, 2.2 - 0.016, 0xb8a040, 0.03, 'x', false, 6); for (const x of [-0.7, 0.7]) K.box(0.05, 0.2, 0.09, x, 2.26, DK); K.box(0.16, 0.12, 0.08, 0.25, 2.27, STEEL, 0.02); }, runs);
    }
    // --- door thresholds (hazard-edged plate) and a lamp bar in the room's light colour over each doorway
    if (this.doorFrames?.length) {
      const fr = this.doorFrames;
      inst(new THREE.BoxGeometry(0.34, 0.012, TS - 0.52), new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.8, roughness: 0.45 }), fr, (f, o) => { o.position.set(f.x, 0.007, f.z); o.rotation.y = f.ax ? 0 : Math.PI / 2; });
      const hz = new THREE.PlaneGeometry(0.14, TS - 0.52); hz.rotateX(-Math.PI / 2); T.haz.repeat.set(1, 6);
      const hm = new THREE.MeshLambertMaterial({ map: T.haz });
      inst(hz, hm, fr.flatMap(f => [-1, 1].map(s => ({ f, s }))), ({ f, s }, o) => { o.position.set(f.x + (f.ax ? s * 0.24 : 0), 0.008, f.z + (f.ax ? 0 : s * 0.24)); o.rotation.y = f.ax ? 0 : Math.PI / 2; });
      const lamp = inst(new Kit().box(0.02, 0.05, 1.3, 0, 0, 0xffffff, -0.65).done().solid, m.kitGlow, fr.flatMap(f => [-1, 1].map(s => ({ f, s }))), ({ f, s }, o) => { o.position.set(f.x + (f.ax ? s * 0.16 : 0), WH - 0.13, f.z + (f.ax ? 0 : s * 0.16)); o.rotation.y = f.ax ? 0 : Math.PI / 2; return new THREE.Color(ROOM_LIGHT[f.room] || 0xffffff).multiplyScalar(1.7); });
      if (lamp) lamp.receiveShadow = false;
      // sliding door leaves: two panels per doorway that part when someone walks up (World.slideDoors, driven by main.js)
      { const dm = new THREE.MeshStandardMaterial({ color: 0x8a94a2, metalness: 0.7, roughness: 0.4 }), hw = (TS - 0.52) / 2, pg = new THREE.BoxGeometry(0.07, 2.42, hw);
        this.doors = fr.map(f => { const g = new THREE.Group(); g.position.set(f.x, 1.25, f.z); if (!f.ax) g.rotation.y = Math.PI / 2; const L = new THREE.Mesh(pg, dm), R = new THREE.Mesh(pg, dm); L.position.z = -hw / 2; R.position.z = hw / 2; g.add(L, R); this.group.add(g); return { f, g, L, R, hw, open: 0, near: false }; }); }
    }
    // --- window frames with depth and a glass pane
    {
      const wins = this.wallFaces.filter(f => f.win);
      kit('winframe', K => { const y = 1.7, W2 = 0.85, H2 = 0.5, c = 0x3a3f48; K.box(1.86, 0.1, 0.12, 0, y + H2 + 0.03, c).box(1.92, 0.08, 0.16, 0, y - H2 - 0.03, 0x4a4f58).box(0.1, 1.06, 0.12, -W2 - 0.03, y, c).box(0.1, 1.06, 0.12, W2 + 0.03, y, c).box(0.03, 1.0, 0.05, 0, y, c).box(0.3, 0.04, 0.006, 0.6, y - H2 - 0.03, 0xe0d8c0, 0.16); for (const sx of [-0.9, 0.9]) for (const sy of [-0.52, 0.52]) K.cyl(0.018, 0.02, sx, y + sy, MT, 0.12, 'z', false, 6); }, wins);
      const gl = inst(new THREE.PlaneGeometry(1.7, 1.0), new THREE.MeshStandardMaterial({ color: 0x9fc8ff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false }), wins, (f, o) => onFace(f, o, 1.7, 0.035));
    }
    // --- grime: drips under the ceiling line, scuffs at the kick plate, burnt panels, floor and ceiling stains
    {
      const drip = [], scuff = [], burn = [];
      for (const f of faces) { const r = rnd(); if (r < 0.2) drip.push(f); else if (r < 0.42) scuff.push(f); if (!f.deco && rnd() < 0.012 + d.deck * 0.004) { burn.push(f); f.deco = true; } }
      inst(new THREE.PlaneGeometry(TS, 1.5), decal(T.drip, 0.75), drip, (f, o, i) => { onFace(f, o, ceilOf(f) - 0.75, 0.006); o.scale.set(1, 0.7 + hash(i, 1) * 0.5, 1); o.position.y = ceilOf(f) - 0.75 * o.scale.y; });
      inst(new THREE.PlaneGeometry(TS, 0.7), decal(T.scuff, 0.8), scuff, (f, o, i) => { onFace(f, o, 0.36, 0.007); });
      inst(new THREE.PlaneGeometry(1.5, 1.5), decal(T.burn, 0.95), burn, (f, o, i) => { onFace(f, o, 1.35 + hash(i, 3) * 0.4, 0.01); o.position.x += f.dy * (hash(i, 5) - 0.5) * 0.6; o.position.z += f.dx * (hash(i, 5) - 0.5) * 0.6; });
      for (const f of burn) this.sparkers.push({ x: f.px + f.dx * 0.25, z: f.pz + f.dy * 0.25, t: 3 + rnd() * 9 });
      const fl = [], cl = [];
      for (const [x, y] of d.openTiles) { if (d.grid[y][x] !== 0 || this.isTube(x, y)) continue; const r = rnd(); if (r < 0.09) fl.push([x, y, rnd(), rnd(), rnd()]); else if (r < 0.15 && d.room[y][x] !== 'holodeck') cl.push([x, y, rnd(), rnd(), rnd()]); }
      const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2); const cg = new THREE.PlaneGeometry(1, 1); cg.rotateX(Math.PI / 2);
      inst(pg, decal(T.stain, 0.7), fl.filter(t => d.room[t[1]][t[0]] !== 'holodeck'), ([x, y, a, b, c], o) => { o.position.set((x + 0.3 + a * 0.4) * TS, 0.011, (y + 0.3 + b * 0.4) * TS); o.rotation.y = c * 6.28; o.scale.setScalar(1.1 + a * 1.3); });
      inst(cg, decal(T.cstain, 0.8), cl, ([x, y, a, b, c], o) => { o.position.set((x + 0.3 + a * 0.4) * TS, this.ceilAt(x, y) - 0.008, (y + 0.3 + b * 0.4) * TS); o.rotation.y = c * 6.28; o.scale.setScalar(1.0 + b * 1.2); });
    }
    // --- way-finding painted on corridor floors: chevrons that follow the shortest route to the tubelift
    {
      const fld = this.field(ex, ey), W = this.W, list = [];
      for (const [x, y] of d.openTiles) {
        if (d.room[y][x] || d.grid[y][x] !== 0 || fld[x + y * W] < 3 || hash(x * 3.1, y * 1.7) > 0.075) continue;
        let best = null; for (const [dx, dy] of DIRS) { const v = fld[x + dx + (y + dy) * W]; if (v >= 0 && v < fld[x + y * W] && (!best || v < best.v)) best = { dx, dy, v }; }
        if (best) list.push({ x, y, ry: Math.atan2(-best.dx, -best.dy) });
      }
      const pg = new THREE.PlaneGeometry(1.25, 1.25); pg.rotateX(-Math.PI / 2);
      inst(pg, decal(T.arrow, 0.5, accent.clone().lerp(new THREE.Color(0xffffff), 0.35)), list, (a, o) => { o.position.set((a.x + 0.5) * TS, 0.012, (a.y + 0.5) * TS); o.rotation.y = a.ry; });
      // deck number stencilled at the start and outside the lift
      const st = canvasTex(256, (c, s) => { c.clearRect(0, 0, s, s); c.fillStyle = 'rgba(255,255,255,0.85)'; c.font = 'bold 150px Helvetica, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(d.deck + 1).padStart(2, '0'), s / 2, s / 2 - 10); c.font = 'bold 34px Helvetica, Arial, sans-serif'; c.fillText('D E C K', s / 2, s - 34); c.fillRect(20, 20, s - 40, 8); c.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(0,0,0,${0.2 + rnd() * 0.7})`; c.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 8, 1 + rnd() * 4); } });
      const sg = new THREE.PlaneGeometry(1.9, 1.9); sg.rotateX(-Math.PI / 2);
      const [edx, edy] = d.exitDir; const spots = [{ x: d.start[0], y: d.start[1], ry: 0 }, { x: ex + edx, y: ey + edy, ry: Math.atan2(edx, edy) }].filter(s => d.grid[s.y]?.[s.x] === 0);
      inst(sg, decal(st, 0.42, accent.clone().lerp(new THREE.Color(0xffffff), 0.5)), spots, (s, o) => { o.position.set((s.x + 0.5) * TS, 0.0125, (s.y + 0.5) * TS); o.rotation.y = s.ry; });
    }
    // --- ceiling: hanging cable loops, dropped ceiling tiles, light shafts under some vents
    {
      const cab = [], broken = [];
      for (const [x, y] of d.openTiles) {
        if (d.grid[y][x] !== 0 || this.isTube(x, y)) continue; const r = d.room[y][x], h = hash(x * 5.3 + 1, y * 2.9);
        if (h < (r === 'engineering' || r === 'cargo' || r === 'shuttlebay' ? 0.14 : r ? 0.02 : 0.06)) cab.push([x, y, h]);
        else if (!r && h > 0.972 && (x + y) % 2 === 1) broken.push([x, y, h]);
      }
      const pts = []; for (let i = 0; i <= 10; i++) { const u = i / 10 - 0.5; pts.push(new THREE.Vector3(u * 1.9, -0.42 * (1 - 4 * u * u) - 0.01, 0)); }
      const cgeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.016, 5);
      const ci = inst(cgeo, m.rubber, cab, ([x, y, h], o) => { o.position.set((x + 0.5) * TS + (h * 37 % 1 - 0.5) * 0.8, this.ceilAt(x, y), (y + 0.5) * TS + (h * 91 % 1 - 0.5) * 0.8); o.rotation.y = h * 400; o.scale.set(0.7 + (h * 53 % 1) * 0.5, 0.5 + (h * 71 % 1) * 1.1, 1); }); if (ci) ci.castShadow = true;
      kit('broken', K => { K.box(1.24, 0.004, 0.64, 0, -0.012, 0x08090b, -0.32).box(0.02, 0.5, 0.02, -0.3, -0.26, 0x18181a, -0.1).box(0.016, 0.34, 0.016, 0.1, -0.18, 0x7a2a22, 0.1).box(0.016, 0.62, 0.016, 0.34, -0.32, 0x18181a, -0.2);
        const t = new THREE.BoxGeometry(0.6, 0.025, 0.6); t.translate(0, 0, 0.3); t.rotateX(1.15); K._add(t, -0.28, -0.02, -0.3, 0xb8b8b0, false); K.box(1.3, 0.03, 0.03, 0, -0.02, 0x6a7078, -0.34).box(1.3, 0.03, 0.03, 0, -0.02, 0x6a7078, 0.31); }, broken, ([x, y, h], o) => { o.position.set((x + 0.5) * TS, this.ceilAt(x, y), (y + 0.5) * TS); o.rotation.y = h > 0.986 ? Math.PI / 2 : 0; });
      const sh = (this.vents || []).filter((v, i) => hash(v.x * 1.3, v.y * 4.7) < 0.55);
      this.shaftMat = new THREE.MeshBasicMaterial({ map: T.shaft, color: 0xbfd8ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      this.poolMat = new THREE.MeshBasicMaterial({ map: T.halo, color: 0xbfd8ff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false });
      const sgeo = new THREE.CylinderGeometry(0.2, 0.42, 1, 4, 1, true); sgeo.rotateY(Math.PI / 4); sgeo.translate(0, -0.5, 0);
      const lean = (v) => (hash(v.x, v.y * 9.1) - 0.5) * 0.5;
      const s1 = inst(sgeo, this.shaftMat, sh, (v, o) => { const ch = this.ceilAt(v.x, v.y); o.position.set((v.x + 0.5) * TS, ch - 0.03, (v.y + 0.5) * TS); o.scale.set(1.35, ch - 0.05, 0.8); o.rotation.z = lean(v); }, this.cones);
      const pg = new THREE.PlaneGeometry(1.7, 1.1); pg.rotateX(-Math.PI / 2);
      const s2 = inst(pg, this.poolMat, sh, (v, o) => { const ch = this.ceilAt(v.x, v.y); o.position.set((v.x + 0.5) * TS + Math.sin(lean(v)) * ch, 0.02, (v.y + 0.5) * TS); }, this.cones);
      for (const s of [s1, s2]) if (s) { s.receiveShadow = false; s.frustumCulled = false; }
      if (!this.cones.parent) g.add(this.cones);
    }
  }

  setFancy(on) { this.cones.visible = on; }
  setPower(on) { this.powerTarget = on ? 1 : 0; if (on) this.restoreT = 1.4; }
  setAlert(on) { this.alertTarget = on ? 1 : 0; }

  setLiftOpen(open, keepWalkable = false) {
    this.liftStatus.material.color.set(open ? 0x40ff70 : 0xff3030);
    if (this.liftLight && !this.carMode) this.liftLight.color.set(open ? 0x40ff70 : 0xff3030);
    this.liftOpen = open;
    if (this.carMode && this.d.exitBlocks && !keepWalkable) this.grid[this.car.ty][this.car.tx] = open ? 0 : 2;   // closed doors block the car tile
  }
  // Systems Nominal: the exit tile (a dead end) becomes the lift car and the doors move to its mouth; closed doors block it, open ones do not
  mountCar() {
    const d = this.d, [ex, ey] = d.exit, [dx, dy] = d.exitDir, [cx, cz] = this.center(ex, ey);
    this.carMode = true; this.car = { tx: ex, ty: ey, x: cx, z: cz, dx, dy };
    this.lift.position.set(cx + dx * (TS / 2 - 0.12), 0, cz + dy * (TS / 2 - 0.12));
    const fill = box(TS, WH - 2.8, 0.3, new THREE.MeshLambertMaterial({ color: 0x3a3f48 }), 0, 2.8, 0); this.lift.add(fill);
    if (this.liftLight) { this.liftLight.color.set(0xfff0d8); this.liftLight.intensity = 3.5; this.liftLight.distance = 6; }
    this.setLiftOpen(false);
  }
  setCarLocked(on) { if (this.carMode && this.carLocked !== on) { this.carLocked = on; if (on) this.liftStatus.material.color.set(0xff3030); } }
  // live guide (Systems Nominal, js/nav-hud.js): <=24 small cyan chevrons flowing along the first ~22 m of the pinned route (an extension of the
  // painted lift chevrons above, but toward the pin), and a light beam + floating badge at the destination (badge drawn through walls).
  // route: {pts:[[x,y]] in tiles, cum, len} or null; beacon: {tx, ty, canvas, key} or null. Cost: one matrix update per instance per call.
  setGuide(route, t = 0, beacon = null) {
    if (!this.guide) {
      const sh = new THREE.Shape(); sh.moveTo(0.5, 0); sh.lineTo(-0.1, 0.5); sh.lineTo(-0.4, 0.5); sh.lineTo(0.2, 0); sh.lineTo(-0.4, -0.5); sh.lineTo(-0.1, -0.5); sh.closePath();
      const geo = new THREE.ShapeGeometry(sh); geo.rotateX(-Math.PI / 2);
      const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 24);
      im.frustumCulled = false; im.renderOrder = 3; im.setColorAt(0, new THREE.Color()); this.group.add(im);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 3, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x8ef3ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 1.5; const spr = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, opacity: 0.9 })); spr.position.y = 2.45; spr.scale.setScalar(0.85); spr.renderOrder = 4;
      const bg = new THREE.Group(); bg.add(beam, spr); bg.visible = false; this.group.add(bg);
      this.guide = { im, bg, spr, o: new THREE.Object3D(), c: new THREE.Color(), key: null };
    }
    const G = this.guide, o = G.o; let n = 0;
    if (route && route.len > 0.3) {
      const L = Math.min(route.len * TS, 22), gap = 1.35;
      for (let s = 1.0 + (t * 1.6) % gap; s < L && n < 24; s += gap, n++) {
        const st = s / TS; let k = 1; while (k < route.cum.length - 1 && route.cum[k] < st) k++;
        const a = route.pts[k - 1], b = route.pts[k], f = (st - route.cum[k - 1]) / Math.max(1e-6, route.cum[k] - route.cum[k - 1]);
        o.position.set((a[0] + (b[0] - a[0]) * f) * TS, 0.03, (a[1] + (b[1] - a[1]) * f) * TS); o.rotation.set(0, -Math.atan2(b[1] - a[1], b[0] - a[0]), 0); o.scale.setScalar(0.62); o.updateMatrix();
        G.im.setMatrixAt(n, o.matrix); const fd = Math.max(0.12, (1 - s / 22) * Math.min(1, (s - 0.6) / 1.2)); G.im.setColorAt(n, G.c.setRGB(0.12 * fd, 0.75 * fd, fd));
      }
    }
    G.im.count = n; G.im.instanceMatrix.needsUpdate = true; if (G.im.instanceColor) G.im.instanceColor.needsUpdate = true;
    G.bg.visible = !!beacon;
    if (beacon) {
      G.bg.position.set((beacon.tx + 0.5) * TS, 0, (beacon.ty + 0.5) * TS); G.spr.position.y = 2.45 + Math.sin(t * 2) * 0.06;
      if (beacon.key !== G.key && beacon.canvas) { G.key = beacon.key; G.spr.material.map?.dispose(); G.spr.material.map = new THREE.CanvasTexture(beacon.canvas); G.spr.material.map.colorSpace = THREE.SRGBColorSpace; G.spr.material.needsUpdate = true; }
    }
  }

  // pick a piece of clutter up: hide its instance and drop it from the look list
  takeClutter(c) { if (c.gone) return false; c.gone = true; if (c.inst) { const d = new THREE.Object3D(); d.scale.set(0, 0, 0); d.updateMatrix(); c.inst.im.setMatrixAt(c.inst.i, d.matrix); c.inst.im.instanceMatrix.needsUpdate = true; } const i = this.clutter.indexOf(c); if (i >= 0) this.clutter.splice(i, 1); return true; }
  // doors part for the player (and anyone in `who`, [{x, z}]) within reach and close again behind them
  slideDoors(dt, px, pz, who = [], onOpen = null) {
    if (!this.doors) return; const k = Math.min(1, dt * 7);
    for (const d of this.doors) {
      const dx = d.f.x - px, dz = d.f.z - pz; let near = dx * dx + dz * dz < 2.7 * 2.7;
      if (!near) for (const w of who) { const ex = d.f.x - w.x, ez = d.f.z - w.z; if (ex * ex + ez * ez < 2.1 * 2.1) { near = true; break; } }
      if (near && !d.near && dx * dx + dz * dz < 14 * 14) onOpen?.(Math.hypot(dx, dz)); d.near = near;
      const target = near ? 1 : 0; if (Math.abs(d.open - target) < 0.002) continue; d.open += (target - d.open) * k;
      const o = d.open * (d.hw - 0.04); d.L.position.z = -d.hw / 2 - o; d.R.position.z = d.hw / 2 + o;
    }
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
      const lf = this.lightFault || 0, dip = lf && (Math.sin(t * 13.1) + Math.sin(t * 5.3) + Math.sin(t * 29.7)) > 2.2 - lf * 0.9 ? (lf > 1 ? 0.04 : 0.3) : 1;   // lighting grid faults
      this.steadyMat.color.copy(this.lightCol).lerp(this.alertCol, a * pulse).multiplyScalar((1 - a * 0.35) * this.powerAmt * dip * (lf > 1 ? 0.45 : 1));
    }
    // emergency lamps: faint when all is well, beating on alert, steady and bright when the power is out
    if (this.emergMat) { const a = this.alertAmt, off = 1 - this.powerAmt, k = Math.max(0.1, off * 0.85, a * (0.35 + 0.9 * (0.5 + 0.5 * Math.sin(t * 6 + 1.5)))); this.emergMat.color.setRGB(2.6 * k, 0.2 * k, 0.12 * k); this.emergHalo.opacity = Math.min(0.55, k * 0.5); }
    if (M.kitGlow) M.kitGlow.color.setScalar(0.12 + 0.88 * this.powerAmt * (this.flickerF < 0.5 && Math.random() < 0.02 ? 0.6 : 1));
    if (this.shaftMat) { this.shaftMat.opacity = 0.05 * (0.45 + 0.55 * this.powerAmt); this.poolMat.opacity = 0.07 * (0.45 + 0.55 * this.powerAmt); }
    if (this.liftOpen || this.carMode) {
      const L = this.lift.getObjectByName('doorL'), R = this.lift.getObjectByName('doorR'), o = this.liftOpen ? 1.3 : 0.5, k = Math.min(1, dt * (this.carMode ? 3 : 2));
      L.position.x += (-o - L.position.x) * k; R.position.x += (o - R.position.x) * k;
    }
  }

  dispose() {
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.userData.ownMat) o.material.dispose(); });
    for (const t of this.own) t.dispose();   // per-deck canvas textures (signs, posters, stencils); shared ones simply re-upload on next use
  }
}
function yy(y, H) { return y < 0 || y >= H; }
export const PROP_KINDS = ['console', 'chair', 'viewscreen', 'warpcore', 'shuttle', 'holocube', 'pad', 'bunk', 'table', 'biobed', 'crate', 'tree', 'lonechair', 'plant', 'cart', 'replicator', 'desk', 'cell', 'weaponrack', 'treadmill', 'weightbench', 'labbench', 'washer', 'sofa', 'lathe', 'workbench', 'tank', 'drawers', 'servers', 'shelving', 'suitrack', 'sinkunit', 'lockers', 'labrack', 'centrifuge'];
