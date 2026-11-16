// Batch 6 prop art: flight deck and cargo handling (docs/asset-gaps.md section 12, batch 6; docs/propart-flight.md).
//   FLT-3 shuttle_cradle + padmark, FLT-5 fuelbowser, SVC-6 pallet / pallet_loaded, SVC-9 hoversled, SVC-5 coldstore_door (wall piece) / reachin_cooler.
// Contract: `export const kinds = { name: (m, h) => THREE.Group }`. `m` / `h` (world.js mats / helpers) are accepted and ignored: this module owns its few shared materials, so it
// also runs stand-alone in viewer-flight.html. Origin at the floor centre, +z front, metres, one mesh per material.
// userData: top (climbable surface), box [x0,x1,z0,z1], spots (EQUIPMENT-style [[x,z,ry]]), use {name:{x,z,ry}}, size [w,h,d], tris, name, dept; carts (fuelbowser, hoversled) add handle (1.16) and portable.
// Cart-like props have their long axis on z and the push handle at the REAR (-z), as CARTS in js/carry.js. The cradle has its long axis on x (nose +x) like the `shuttle` prop.
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
  readout(g, w, h, R) {
    g.fillStyle = '#04070a'; g.fillRect(0, 0, w, h); const nd = 3, dw = (w - 20) / nd;
    for (let d = 0; d < nd; d++) { const x = 10 + d * dw + 6, y = 14, W = dw - 22, H = h * 0.52; for (const [sx, sy, sw, sh] of [[0, 0, W, 8], [0, H / 2 - 4, W, 8], [0, H - 8, W, 8], [0, 0, 8, H / 2], [W - 8, 0, 8, H / 2], [0, H / 2, 8, H / 2], [W - 8, H / 2, 8, H / 2]]) { g.fillStyle = R() < 0.65 ? '#58d0ff' : '#161a20'; g.fillRect(x + sx, y + sy, sw, sh); } }
    rr(g, 10, h * 0.8, w - 20, 10, 5, '#161a20'); rr(g, 10, h * 0.8, (w - 20) * 0.4, 10, 5, '#58d0ff'); scan(g, w, h, 0.18);
  },
  net(g, w, h) {      // cargo net: transparent ground, diamond-free square mesh of dark cord
    g.clearRect(0, 0, w, h); g.strokeStyle = "#1c1e22"; g.lineWidth = 3; for (let x = 0; x <= w; x += w / 6) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y <= h; y += h / 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  },
};
const SM = {};
function scr(kind, seed = 1, w = 160, h = 100) { const k = `${kind}|${seed}`; return SM[k] || (SM[k] = new THREE.MeshBasicMaterial({ map: ctex(w, h, (g, W, H) => TEXD[kind](g, W, H, rng(seed * 9973 + 17))), color: new THREE.Color(1.3, 1.3, 1.3) })); }

let MT = null;
function mats() {
  if (MT) return MT;
  const std = (c, m = 0.3, r = 0.5, o = {}) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r, ...o }), bas = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, ...o });
  const net = new THREE.MeshBasicMaterial({ map: ctex(256, 256, (g, w, h) => TEXD.net(g, w, h), true), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
  return MT = {
    white: std(0xe6ecef, 0.05, 0.35), steel: std(0x9aa0a8, 0.85, 0.38), dark: std(0x1d2026, 0.55, 0.5), rubber: std(0x0f1012, 0, 0.85), grey: std(0x6a707a, 0.5, 0.5), frame: std(0x2e3846, 0.5, 0.5),
    yellow: std(0xe0b020, 0.2, 0.55), hv: std(0xf26a1b, 0.15, 0.55), red: std(0xc02820, 0.3, 0.5), green: std(0x2f8a48, 0.3, 0.55), blue: std(0x2a6ab0, 0.4, 0.5), olive: std(0x5a6340, 0.2, 0.7),
    tank: std(0xd9dde0, 0.45, 0.4), pal: std(0x3c4652, 0.1, 0.7), palDk: std(0x262d36, 0.1, 0.7), crateA: std(0x6f7a52, 0.2, 0.7), crateB: std(0xa98a4e, 0.2, 0.7), crateC: std(0x5a6f86, 0.2, 0.7), crateD: std(0x8a6a58, 0.2, 0.7),
    sled: std(0x3a4658, 0.55, 0.45), cavity: std(0x0a1014, 0.1, 0.9), panelW: std(0xe4e8ea, 0.1, 0.45), strip: std(0x9ab8d0, 0, 0.3, { transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }),
    paint: std(0xe8c020, 0.1, 0.6, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), cable: std(0x4a9a30, 0.1, 0.6), net, hose: std(0x1a1c20, 0, 0.8),
    glowC: bas(0x58f0ff), glowA: bas(0xffb030), glowG: bas(0x40ff70), glowR: bas(0xff3a2a), padGlow: bas(0x58e8ff, { transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending }),
  };
}
function finish(g, name, extra = {}) {
  g.name = name; let tris = 0; g.traverse(o => { if (o.isMesh) tris += o.geometry.attributes.position.count / 3; });
  Object.assign(g.userData, { name, tris }, extra); return g;
}
const TOR = (r, t, s = 8) => G(`tor${r},${t},${s}`, () => new THREE.TorusGeometry(r, t, 4, s));

// ---------------------------------------------------------------- FLT-3 landing cradle (aircraft dolly) 3.2 x 1.6 x 0.25 m
// Long axis x (nose +x, like the world.js `shuttle`: lift the craft by 0.25 m to sit on the keel pads). Steel frame, two padded keel rails, four castor bogies, corner bumpers and tie-down rings.
function shuttle_cradle() {
  const M = mats(), b = new B();
  for (const sz of [-1, 1]) { b.box(3.2, 0.08, 0.1, M.frame, 0, 0.1, sz * 0.7); b.box(3.2, 0.012, 0.1, M.yellow, 0, 0.18, sz * 0.7); }
  for (const x of [-1.4, -0.7, 0, 0.7, 1.4]) b.box(0.1, 0.08, 1.5, M.frame, x, 0.1, 0);
  for (const sz of [-1, 1]) { b.box(2.7, 0.04, 0.16, M.steel, 0, 0.18, sz * 0.32); b.box(2.6, 0.05, 0.2, M.rubber, 0, 0.2, sz * 0.32); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * 1.4, z = sz * 0.66; b.box(0.2, 0.03, 0.2, M.dark, x, 0.075, z); b.box(0.02, 0.1, 0.14, M.steel, x - 0.045, 0.0, z); b.box(0.02, 0.1, 0.14, M.steel, x + 0.045, 0.0, z);
    b.cyl(0.065, 0.065, 0.05, M.rubber, x, 0.04, z, 14, PI / 2); b.cyl(0.03, 0.03, 0.062, M.steel, x, 0.034, z, 8, PI / 2);
    b.box(0.16, 0.1, 0.16, M.yellow, sx * 1.56, 0.1, sz * 0.74 - sz * 0.0 * 1); b.box(0.1, 0.02, 0.1, M.steel, sx * 1.5, 0.18, sz * 0.74); b.put(TOR(0.032, 0.008), M.steel, sx * 1.5, 0.2, sz * 0.76 + sz * 0.02, PI / 2, 0, 0);
  }
  b.box(0.06, 0.05, 0.4, M.steel, 1.62, 0.1, 0); b.put(TOR(0.06, 0.012, 10), M.steel, 1.69, 0.12, 0, 0, PI / 2, 0);
  const g = new THREE.Group(); g.add(b.done('cradle'));
  return finish(g, 'shuttle_cradle', { top: 0.25, size: [3.2, 0.25, 1.6], box: [-1.6, 1.6, -0.8, 0.8], spots: [[0, 1.05, PI]], use: { walk: { x: 0, z: 1.1, ry: PI }, tie_fwd: { x: 1.5, z: 1.0, ry: PI }, tie_aft: { x: -1.5, z: 1.0, ry: PI }, craftLift: { y: 0.25 } }, dept: 'flight' });
}

// ---------------------------------------------------------------- FLT-3 pad marking (flat decal): 4 x 4 m outline, corner chevrons, centre cross. y 0.008, no collision.
function padmark() {
  const M = mats(), b = new B(), H = 0.008, Y = M.paint;
  for (const s of [-1, 1]) { b.box(4, H, 0.12, Y, 0, 0, s * 1.94); b.box(0.12, H, 3.76, Y, s * 1.94, 0, 0); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const k of [0, 1]) {
    const ax = sx * (1.66 - k * 0.42), az = sz * (1.66 - k * 0.42);
    for (const sgn of [-1, 1]) { const a = Math.atan2(-sz, -sx) + sgn * 0.6, dx = Math.cos(a), dz = Math.sin(a); b.box(0.55, H, 0.1, Y, ax + dx * 0.27, 0, az + dz * 0.27, 0, -a, 0); }
  }
  b.box(0.9, H, 0.1, Y, 0, 0, 0); b.box(0.1, H, 0.9, Y, 0, 0, 0);
  for (const s of [-1, 1]) { b.box(0.5, H, 0.08, Y, s * 1.1, 0, 0); b.box(0.08, H, 0.5, Y, 0, 0, s * 1.1); }
  const g = new THREE.Group(); g.add(b.done('marking'));
  return finish(g, 'padmark', { decal: true, size: [4, 0.01, 4], noCollide: true, spots: [], dept: 'flight' });
}

// ---------------------------------------------------------------- FLT-5 fuel bowser (wheeled tank, hose reel, earth-bond reel, tow bar, push handle at 1.16 m)
// Long axis z. Tank 1.4 m x 0.7 m dia (with dished ends) on a chassis; hose reel with 5 m of hose at the REAR next to the push handle (z -1.05, 1.16 m, the `push` clip's hand height); tow eye at the front (+z).
function fuelbowser() {
  const M = mats(), b = new B(), ty = 0.56;
  for (const sx of [-1, 1]) { b.box(0.06, 0.08, 1.95, M.frame, sx * 0.3, 0.14, -0.08); b.box(0.04, 0.08, 0.5, M.frame, sx * 0.4, 0.14, 0.55); }
  for (const z of [-0.5, 0.5]) b.box(0.8, 0.06, 0.08, M.frame, 0, 0.15, z);
  for (const z of [-0.4, 0.4]) { b.box(0.6, 0.12, 0.1, M.grey, 0, 0.22, z); }
  b.cyl(0.35, 0.35, 1.24, M.tank, 0, ty - 0.62, 0, 22, PI / 2);
  b.put(G('dishF', () => { const d = new THREE.SphereGeometry(0.35, 22, 5, 0, PI * 2, 0, PI / 2); d.scale(1, 0.25, 1); d.rotateX(PI / 2); return d; }), M.tank, 0, ty, 0.62);
  b.put(G('dishB', () => { const d = new THREE.SphereGeometry(0.35, 22, 5, 0, PI * 2, 0, PI / 2); d.scale(1, 0.25, 1); d.rotateX(-PI / 2); return d; }), M.tank, 0, ty, -0.62);
  b.cyl(0.352, 0.352, 0.14, M.hv, 0, ty - 0.07, 0, 22, PI / 2); for (const z of [-0.45, 0.45]) b.cyl(0.356, 0.356, 0.03, M.steel, 0, ty - 0.015, z, 22, PI / 2);
  // manhole dome, filler cap, vent, level gauge and sight tube
  b.cyl(0.13, 0.15, 0.07, M.steel, 0, ty + 0.34, 0.1, 14); b.cyl(0.09, 0.09, 0.04, M.dark, 0, ty + 0.41, 0.1, 12); b.cyl(0.02, 0.02, 0.07, M.steel, 0.16, ty + 0.34, -0.2, 8); b.cyl(0.04, 0.04, 0.02, M.steel, 0.16, ty + 0.41, -0.2, 8);
  b.cyl(0.06, 0.06, 0.04, M.dark, -0.15, ty + 0.08, 0.7, 14, PI / 2); b.disc(0.05, M.panelW, -0.15, ty + 0.1, 0.722, 0, 0, 0, 16); b.box(0.025, 0.2, 0.02, M.panelW, 0.36, ty - 0.2, -0.45);
  // fill coupling and valve on the -x side, nozzle holster on the +x side with a bayonet nozzle
  b.cyl(0.035, 0.035, 0.12, M.steel, -0.38, ty - 0.2, 0.2, 10, 0, 0, PI / 2); b.cyl(0.05, 0.05, 0.03, M.red, -0.44, ty - 0.155, 0.2, 10, 0, 0, PI / 2); b.box(0.05, 0.05, 0.08, M.red, -0.4, ty - 0.02, 0.2);
  b.box(0.08, 0.12, 0.3, M.dark, 0.38, ty - 0.15, 0.25); b.cyl(0.025, 0.03, 0.3, M.yellow, 0.43, ty - 0.12 - 0.15, 0.24, 10, PI / 2); b.cyl(0.015, 0.012, 0.16, M.steel, 0.43, ty - 0.12 - 0.08, 0.5, 8, PI / 2);
  // hose reel at the rear: flanges, hub, two wound layers, spare hose to the holster
  const rz = -0.92, ry = 0.58;
  for (const sx of [-1, 1]) b.cyl(0.23, 0.23, 0.012, M.dark, sx * 0.09, ry - 0.006 - 0.0, rz, 18, 0, 0, PI / 2); b.cyl(0.06, 0.06, 0.18, M.steel, 0, ry - 0.09, rz, 10, 0, 0, PI / 2);
  b.put(TOR(0.15, 0.032, 14), M.hose, -0.035, ry, rz, 0, PI / 2, 0); b.put(TOR(0.15, 0.032, 14), M.hose, 0.035, ry, rz, 0, PI / 2, 0); b.put(TOR(0.19, 0.03, 14), M.hose, 0.0, ry, rz, 0, PI / 2, 0);
  for (const sx of [-1, 1]) b.box(0.03, 0.34, 0.04, M.frame, sx * 0.14, ry - 0.34, rz);
  b.rod(0.0, ry - 0.24, rz + 0.18, 0.42, ty - 0.2, 0.5, 0.032, M.hose);
  // earth-bond reel on the -x side with a green-yellow cable and a clamp
  b.cyl(0.07, 0.07, 0.05, M.dark, -0.44, 0.42 - 0.0, -0.3, 12, 0, 0, PI / 2); b.cyl(0.04, 0.04, 0.06, M.cable, -0.44, 0.42, -0.3, 10, 0, 0, PI / 2); b.box(0.04, 0.12, 0.12, M.frame, -0.42, 0.33, -0.3); b.box(0.05, 0.05, 0.09, M.steel, -0.48, 0.25, -0.18); b.box(0.016, 0.1, 0.016, M.steel, -0.48, 0.25, -0.1);
  // wheels: rubber tyre + hub, front pair on a turntable plate
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const x = sx * 0.4, z = sz * 0.6 - sz * 0.0 + (sz < 0 ? -0.05 : 0); b.cyl(0.11, 0.11, 0.07, M.rubber, x, 0.11 - 0.035, z, 14, 0, 0, PI / 2); b.cyl(0.05, 0.05, 0.08, M.steel, x, 0.11 - 0.04, z, 8, 0, 0, PI / 2); }
  b.box(0.7, 0.03, 0.2, M.dark, 0, 0.2, 0.62);
  // tow bar: two arms converging on a tow eye
  b.rod(-0.3, 0.2, 0.6, 0, 0.22, 1.28, 0.04, M.frame); b.rod(0.3, 0.2, 0.6, 0, 0.22, 1.28, 0.04, M.frame); b.put(TOR(0.055, 0.012, 10), M.steel, 0, 0.24, 1.33, PI / 2, 0, 0);
  // push handle: two posts from the rear rails up to the 1.16 m bar
  const hz = -1.05; for (const sx of [-1, 1]) b.box(0.035, 1.16 - 0.18, 0.035, M.steel, sx * 0.32, 0.18, hz); b.box(0.7, 0.035, 0.035, M.steel, 0, 1.16 - 0.0175, hz); for (const sx of [-1, 1]) b.cyl(0.02, 0.02, 0.14, M.rubber, sx * 0.24, 1.07, hz, 8, 0, 0, PI / 2);
  b.box(0.7, 0.03, 0.12, M.hv, 0, 0.24, hz + 0.03); b.box(0.2, 0.22, 0.012, M.yellow, 0.0, ty - 0.12, 0.7);
  const g = new THREE.Group(); g.add(b.done('bowser'));
  return finish(g, 'fuelbowser', { top: 0.91, size: [0.95, 1.16, 2.4], box: [-0.5, 0.5, -1.2, 1.4], handle: 1.16, spots: [[0, -1.35, 0]], use: { push: { x: 0, z: -1.35, ry: 0 }, reel: { x: 0, z: -1.35, ry: 0 }, nozzle: { x: 0.75, z: 0.25, ry: -PI / 2 }, earth: { x: -0.8, z: -0.3, ry: PI / 2 }, filler: { x: 0, z: 0.1, y: 0.97 } }, portable: true, dept: 'flight' });
}

// ---------------------------------------------------------------- SVC-6 cargo pallet (empty) and loaded variant
// Composite 1.2 x 1.0 x 0.15 m, nine feet and fork pockets (forks enter along x or z), dark non-slip deck with raised lip. Loaded: four 0.56 x 0.5 x 0.46 m crates, a net and two hi-vis straps with ratchet buckles.
function palletBase(b, M) {
  b.box(1.2, 0.035, 1.0, M.pal, 0, 0.115, 0); for (const sx of [-1, 0, 1]) for (const sz of [-1, 0, 1]) b.box(0.14, 0.115, 0.14, M.palDk, sx * 0.5, 0, sz * 0.4);
  for (const sz of [-1, 1]) b.box(1.2, 0.012, 0.03, M.dark, 0, 0.15, sz * 0.485); for (const sx of [-1, 1]) b.box(0.03, 0.012, 0.94, M.dark, sx * 0.585, 0.15, 0);
  for (const x of [-0.3, 0.3]) for (const z of [-0.3, 0, 0.3]) b.box(0.3, 0.002, 0.05, M.palDk, x, 0.15, z);
  for (const sx of [-1, 1]) b.box(0.12, 0.012, 0.03, M.yellow, sx * 0.52, 0.15, 0.4);
}
function pallet() {
  const M = mats(), b = new B(); palletBase(b, M); const g = new THREE.Group(); g.add(b.done('pallet'));
  return finish(g, 'pallet', { top: 0.15, size: [1.2, 0.15, 1.0], box: [-0.6, 0.6, -0.5, 0.5], spots: [[0, 0.95, PI]], use: { stand: { x: 0, z: 0.95, ry: PI }, pocket_x: { x: 0.8, z: 0, ry: -PI / 2 } }, dept: 'cargo' });
}
function pallet_loaded() {
  const M = mats(), b = new B(); palletBase(b, M); const cm = [M.crateA, M.crateB, M.crateC, M.crateD];
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], i) => {
    const x = sx * 0.29, z = sz * 0.245, m = cm[i], ry = (i % 2 ? 0.03 : -0.02);
    b.push(x, 0.15, z, 0, ry); b.box(0.56, 0.46, 0.46, m, 0, 0, 0); b.box(0.58, 0.04, 0.48, M.dark, 0, 0.42, 0); b.box(0.58, 0.04, 0.48, M.dark, 0, 0, 0);
    for (const s of [-1, 1]) b.box(0.04, 0.46, 0.48, M.dark, s * 0.27, 0, 0); b.box(0.1, 0.06, 0.012, M.steel, 0, 0.3, 0.236 * 1.02); b.box(0.12, 0.05, 0.004, M.yellow, -0.12, 0.2, 0.232 * 1.02 + 0.006); b.pop();
  });
  b.box(1.18, 0.5, 0.98, M.net, 0, 0.15, 0);
  for (const x of [-0.2, 0.25]) { b.box(0.06, 0.012, 1.0, M.hv, x, 0.65, 0); for (const sz of [-1, 1]) b.box(0.06, 0.5, 0.012, M.hv, x, 0.15, sz * 0.495); b.box(0.09, 0.03, 0.06, M.steel, x, 0.67, 0.28); b.box(0.025, 0.04, 0.05, M.dark, x, 0.69, 0.28); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.05, 0.05, 0.05, M.steel, sx * 0.59, 0.62, sz * 0.49);
  const g = new THREE.Group(); g.add(b.done('pallet'));
  return finish(g, 'pallet_loaded', { top: 0.67, size: [1.2, 0.67, 1.0], box: [-0.6, 0.6, -0.5, 0.5], spots: [[0, 0.95, PI]], use: { stand: { x: 0, z: 0.95, ry: PI }, strap: { x: 0.25, y: 0.67, z: 0.28 } }, loaded: true, dept: 'cargo' });
}

// ---------------------------------------------------------------- SVC-9 hover sled (air-caster pallet mover). Long axis z, T-handle tiller at the REAR (-z), 1.16 m; no wheels.
// Deck 0.9 x 1.3 x 0.12 m floating 0.08 m up on four glowing pads (a faint additive pool of light on the floor under each), tie-down slots along both edges, thumb control on the tiller.
function hoversled() {
  const M = mats(), b = new B();
  b.box(0.9, 0.12, 1.3, M.sled, 0, 0.08, 0); b.box(0.86, 0.01, 1.26, M.rubber, 0, 0.2, 0); for (const sx of [-1, 1]) b.box(0.025, 0.025, 1.3, M.dark, sx * 0.44, 0.2, 0); for (const sz of [-1, 1]) b.box(0.9, 0.025, 0.025, M.dark, 0, 0.2, sz * 0.64);
  b.box(0.9, 0.02, 0.02, M.yellow, 0, 0.2, 0.655);
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) b.box(0.07, 0.012, 0.2, M.slot, sx * 0.395, 0.2, -0.45 + i * 0.3);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const x = sx * 0.3, z = sz * 0.46; b.cyl(0.15, 0.15, 0.02, M.dark, x, 0.06, z, 16); b.cyl(0.13, 0.13, 0.012, M.glowC, x, 0.056, z, 16); b.disc(0.27, M.padGlow, x, 0.004, z, -PI / 2, 0, 0, 20); }
  for (const sx of [-1, 1]) b.box(0.02, 0.025, 1.3, M.dark, sx * 0.43, 0.06, 0); b.box(0.9, 0.025, 0.02, M.dark, 0, 0.06, 0.64); b.box(0.9, 0.025, 0.02, M.dark, 0, 0.06, -0.64);
  b.box(0.8, 0.012, 0.012, M.glowC, 0, 0.13, 0.656);
  // tiller: bracket, shaft angled back to the T bar at 1.16 m, grips, thumb control
  b.box(0.12, 0.05, 0.1, M.steel, 0, 0.21, -0.58); b.rod(0, 0.24, -0.6, 0, 1.1, -0.98, 0.04, M.steel); b.box(0.5, 0.036, 0.036, M.dark, 0, 1.14, -0.98);
  for (const sx of [-1, 1]) b.cyl(0.022, 0.022, 0.12, M.rubber, sx * 0.24, 1.08, -0.98, 8, 0, 0, PI / 2);
  b.box(0.05, 0.03, 0.06, M.dark, 0.17, 1.176, -0.98); b.sph(0.018, M.glowA, 0.17, 1.2, -0.98, 7); b.box(0.04, 0.025, 0.02, M.glowG, -0.17, 1.175, -0.98);
  const g = new THREE.Group(); g.add(b.done('sled'));
  return finish(g, 'hoversled', { top: 0.2, size: [0.9, 1.2, 1.3], box: [-0.5, 0.5, -0.7, 0.7], handle: 1.16, spots: [[0, -1.35, 0]], use: { push: { x: 0, z: -1.35, ry: 0 }, load: { x: 0.8, z: 0, ry: -PI / 2 } }, portable: true, hover: 0.08, dept: 'cargo' });
}

// ---------------------------------------------------------------- SVC-5 cold store door unit (wall piece)
// Origin on the wall line at floor level, +z out of the wall. Insulated white panel 2.2 x 2.3 m (joint ribs, cam-lock dots) with a 0.9 x 1.9 m opening: door swung 55 degrees open on its right hinge
// (lever latch, gasket, steel kick plate), strip curtain behind it, dark cold-room interior, temperature display and alarm lamp above.
function coldstore_door() {
  const M = mats(), b = new B(), T = 0.1;
  for (const s of [-1, 1]) { b.box(0.65, 2.3, T, M.panelW, s * 0.775, 0, T / 2); }
  b.box(0.9, 0.35, T, M.panelW, 0, 1.95, T / 2); b.box(0.9, 0.05, T, M.steel, 0, 0, T / 2);
  b.box(0.9, 1.9, 0.012, M.cavity, 0, 0.05, 0.006);
  for (const x of [-1.0, -0.8, 0.8, 1.0]) b.box(0.012, 2.3, 0.008, M.steel, x, 0, T + 0.004);
  for (const x of [-0.9, 0.9]) for (const y of [0.3, 1.0, 1.7, 2.15]) b.cyl(0.014, 0.014, 0.006, M.steel, x, y, T + 0.001, 8, PI / 2);
  b.box(0.06, 1.96, 0.02, M.steel, -0.48, 0.03, T + 0.01); b.box(0.06, 1.96, 0.02, M.steel, 0.48, 0.03, T + 0.01); b.box(0.9, 0.05, 0.02, M.steel, 0, 1.96, T + 0.01);
  for (let i = 0; i < 12; i++) b.box(0.07, 1.8, 0.006, M.strip, -0.4125 + i * 0.075, 0.1, T - 0.03);
  // door on the right hinge, swung out
  b.push(0.45, 0.05, T + 0.01, 0, 0.96); b.box(0.9, 1.9, 0.08, M.panelW, -0.45, 0, 0.0); b.box(0.9, 0.2, 0.014, M.steel, -0.45, 0.0, 0.047); b.box(0.9, 0.06, 0.01, M.dark, -0.45, 1.84, 0.044);
  b.box(0.02, 1.9, 0.01, M.dark, -0.9, 0, 0.04); b.box(0.12, 0.03, 0.03, M.steel, -0.78, 0.95, 0.06); b.box(0.03, 0.2, 0.03, M.steel, -0.84, 0.88, 0.06); b.box(0.06, 0.2, 0.012, M.steel, -0.8, 0.88, 0.046);
  for (const y of [0.15, 0.95, 1.7]) b.cyl(0.018, 0.018, 0.14, M.steel, 0.0, y, -0.02, 8); b.pop();
  b.panel(0.3, 0.12, scr('readout', 21), M.dark, 0, 2.06, T + 0.012, 0, 0); b.cyl(0.025, 0.025, 0.012, M.glowR, 0.28, 2.1, T + 0.03, 10, PI / 2); b.cyl(0.025, 0.025, 0.012, M.glowG, -0.28, 2.1, T + 0.03, 10, PI / 2);
  const g = new THREE.Group(); g.add(b.done('door'));
  return finish(g, 'coldstore_door', { wall: true, size: [2.2, 2.3, 0.95], spots: [[0, 1.1, PI]], use: { stand: { x: 0, z: 1.1, ry: PI }, enter: { x: 0, z: 0.4, ry: PI }, display: { x: 0, y: 2.1, z: 0.1 }, latch: { x: -0.4, y: 0.95, z: 0.5 } }, dept: 'support' });
}

// ---------------------------------------------------------------- SVC-5 variant: free-standing two-door reach-in cooler 1.4 x 0.8 x 2.0 m (stainless, vertical door handles, display header)
function reachin_cooler() {
  const M = mats(), b = new B();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.035, 0.04, 0.1, M.dark, sx * 0.62, 0, sz * 0.32, 8);
  b.box(1.4, 1.62, 0.8, M.steel, 0, 0.1, 0); b.box(1.4, 0.28, 0.8, M.dark, 0, 1.72, 0);
  for (const sx of [-1, 1]) { b.box(0.67, 1.5, 0.03, M.steel, sx * 0.34, 0.14, 0.41); b.box(0.69, 1.52, 0.012, M.dark, sx * 0.34, 0.13, 0.405); b.box(0.03, 0.6, 0.03, M.steel, sx * 0.04, 0.7, 0.46); for (const y of [0.78, 1.18]) b.box(0.02, 0.02, 0.05, M.steel, sx * 0.04, y, 0.43); }
  b.box(1.36, 0.1, 0.01, M.slot, 0, 0.02, 0.4); for (let i = 0; i < 6; i++) b.box(0.5, 0.01, 0.01, M.slot, 0, 1.76 + i * 0.03, 0.402 + 0.0);
  b.box(0.3, 0.1, 0.012, scr('readout', 22), 0.45, 1.8, 0.41); b.cyl(0.02, 0.02, 0.012, M.glowG, -0.55, 1.88, 0.41, 10, PI / 2); b.cyl(0.02, 0.02, 0.012, M.glowR, -0.47, 1.88, 0.41, 10, PI / 2);
  const g = new THREE.Group(); g.add(b.done('cooler'));
  return finish(g, 'reachin_cooler', { top: 2.0, size: [1.4, 2.0, 0.8], box: [-0.7, 0.7, -0.4, 0.4], spots: [[0, 0.75, PI]], use: { stand: { x: 0, z: 0.75, ry: PI }, display: { x: 0.45, y: 1.8, z: 0.42 } }, dept: 'support' });
}

export const kinds = { shuttle_cradle, padmark, fuelbowser, pallet, pallet_loaded, hoversled, coldstore_door, reachin_cooler };
export const KIND_NAMES = Object.keys(kinds);
// gap-list id, suggested rooms and which EQUIPMENT script each can reuse (docs/propart-flight.md)
export const META = {
  shuttle_cradle: { id: 'FLT-3', rooms: ['shuttlebay'], equip: 'pad / shuttle alias' }, padmark: { id: 'FLT-3', rooms: ['shuttlebay'], equip: 'pad', noref: true },
  fuelbowser: { id: 'FLT-5', rooms: ['shuttlebay'], equip: 'cart' }, pallet: { id: 'SVC-6', rooms: ['cargo', 'stores'], equip: 'crate' }, pallet_loaded: { id: 'SVC-6', rooms: ['cargo', 'stores'], equip: 'crate' },
  hoversled: { id: 'SVC-9', rooms: ['cargo', 'shuttlebay', 'stores'], equip: 'cart' }, coldstore_door: { id: 'SVC-5', rooms: ['stores'], equip: 'cabinet', wall: true }, reachin_cooler: { id: 'SVC-5', rooms: ['stores', 'mess'], equip: 'cabinet' },
};
