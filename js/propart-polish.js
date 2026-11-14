// Batch 11 prop art: polish and leftovers (docs/asset-gaps.md section 12, batch 11; docs/propart-polish.md has the full list).
//   CMD-2 briefing_table, CMD-3 platform_bed, FLT-8 workpod, FLT-9 maint_stand, OPS-8 cargo_pad, ENG-13 warpcore_detail + injector_crate, ENG-14 knee_mill + drill_press,
//   SEC-6 scan_arch, SCI-9 specimen_tank, SVC-11 mat + grapple_dummy + sparring_set, SVC-14 galley_trolley, SVC-15 dryer + folding_table + linen_cart,
//   SVC-16 pool_table + card_table + arcade, SVC-17 feedstock_silo, SVC-18 exercise_bike + rower + dumbbell_rack, R-2 airlock_doors, R-3 bay_door, R-4 catwalk + ship_ladder.
// Contract: `export const kinds = { name: (m, h) => THREE.Group }`. `m` and `h` are accepted but unused: the module owns its (few, shared) materials so it also runs in viewer-polish.html.
// Conventions (as buildProp / the other batches): origin at the floor centre of a 2.5 m tile, +z is the front (the side a person stands or sits on), metres, one merged mesh per
// material. userData: top (climbable height), box [x0, x1, z0, z1], spots [[x, z, ry]] (EQUIPMENT form: root point + yaw, ry = PI faces -z), use {name: {x,z,ry}|{x,y,z}}, seat
// ({x,y,z,yaw} for seated props, same as batch 1), size [x, y, z] m, tris, name, dept.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PI = Math.PI, UP = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);
// ---------------------------------------------------------------- generated textures (patterns only, no text)
const texCache = {};
function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function ctex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
const rr = (g, x, y, w, h, r, c) => { g.fillStyle = c; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
const TEX = {
  diamond(g, w, h) { g.fillStyle = '#5b6068'; g.fillRect(0, 0, w, h); const n = 8, s = w / n; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = i * s, y = j * s, o = (i + j) % 2 ? 0 : 1; g.fillStyle = '#8a9099'; g.save(); g.translate(x + s / 2, y + s / 2); g.rotate(o ? 0.7 : -0.7); g.fillRect(-s * 0.4, -s * 0.09, s * 0.8, s * 0.18); g.restore(); } },
  grate(g, w, h) { g.fillStyle = '#0d0f12'; g.fillRect(0, 0, w, h); g.fillStyle = '#7d848d'; for (let i = 0; i < 8; i++) { g.fillRect(i * w / 8, 0, 3, h); g.fillRect(0, i * h / 8, w, 3); } g.fillStyle = '#4e545c'; for (let i = 0; i < 8; i++) g.fillRect(i * w / 8 + 3, 0, 2, h); },
  felt(g, w, h) { const R = rng(5); g.fillStyle = '#1d6a3e'; g.fillRect(0, 0, w, h); for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '0,0,0'},0.04)`; g.fillRect(R() * w, R() * h, 2, 2); } },
  marquee(g, w, h) { g.fillStyle = '#12081e'; g.fillRect(0, 0, w, h); const cs = ['#ff4aa0', '#ffb030', '#40e0ff', '#9a5aff']; for (let i = -2; i < 12; i++) { g.fillStyle = cs[(i + 8) % 4]; g.beginPath(); g.moveTo(i * 40, h); g.lineTo(i * 40 + 30, h); g.lineTo(i * 40 + 70, 0); g.lineTo(i * 40 + 40, 0); g.fill(); } rr(g, w * 0.3, h * 0.2, w * 0.4, h * 0.6, 14, '#12081e'); g.fillStyle = '#fff0c0'; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(w * 0.36 + i * w * 0.07, h * 0.5, h * 0.12, 0, 7); g.fill(); } },
  arcscreen(g, w, h) { const R = rng(9); g.fillStyle = '#04060c'; g.fillRect(0, 0, w, h); const cs = ['#40ff80', '#ffd030', '#ff5060', '#60b0ff']; for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) { g.fillStyle = cs[r]; g.fillRect(24 + c * 26, 20 + r * 18, 18, 10); } g.fillStyle = '#e8f0ff'; g.fillRect(w / 2 - 14, h - 26, 28, 8); g.fillRect(w / 2 - 3, h - 34, 6, 8); for (let i = 0; i < 24; i++) { g.fillStyle = '#fff'; g.fillRect(R() * w, 70 + R() * (h - 120), 2, 2); } g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1); },
  scanlcd(g, w, h) { g.fillStyle = '#04100a'; g.fillRect(0, 0, w, h); g.fillStyle = '#40ff90'; for (let i = 0; i < 3; i++) g.fillRect(10, 8 + i * 12, 30 + (i * 53) % 90, 5); rr(g, w - 54, 6, 44, h - 12, 4, '#15602e'); g.fillStyle = '#9affc0'; g.fillRect(w - 46, 14, 28, 6); },
  tape(g, w, h) { g.fillStyle = '#d8a818'; g.fillRect(0, 0, w, h); g.fillStyle = '#15161a'; for (let i = -4; i < 12; i++) { g.beginPath(); g.moveTo(i * 32, h); g.lineTo(i * 32 + 16, h); g.lineTo(i * 32 + 48, 0); g.lineTo(i * 32 + 32, 0); g.fill(); } },
};
function tex(k, rx = 1, ry = 1, w = 128, h = 128) {
  const key = `${k}|${rx}|${ry}`; if (texCache[key]) return texCache[key];
  const t = ctex(w, h, (g, W, H) => TEX[k](g, W, H)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); return texCache[key] = t;
}

// ---------------------------------------------------------------- shared materials
const MT = {};
function mats() {
  if (MT.dark) return MT;
  const S = (o) => new THREE.MeshStandardMaterial(o), L = (c) => new THREE.MeshBasicMaterial({ color: c });
  Object.assign(MT, {
    dark: S({ color: 0x23262d, metalness: 0.5, roughness: 0.5 }), steel: S({ color: 0x9aa0a8, metalness: 0.85, roughness: 0.38 }), body: S({ color: 0x4a525c, metalness: 0.4, roughness: 0.5 }),
    rubber: S({ color: 0x101114, roughness: 0.85 }), white: S({ color: 0xe6ecef, roughness: 0.35 }), cream: S({ color: 0xd8d2bc, roughness: 0.9 }),
    yellow: S({ color: 0xd8a818, roughness: 0.55, metalness: 0.15 }), red: S({ color: 0xb02820, roughness: 0.45 }), blue: S({ color: 0x2c4a7a, roughness: 0.8 }), tan: S({ color: 0xc9b27c, roughness: 0.85 }),
    wood: S({ color: 0x6a4328, roughness: 0.6 }), woodLt: S({ color: 0x9a7248, roughness: 0.65 }), pad: S({ color: 0x6a3a3a, roughness: 0.9 }), canvas: S({ color: 0xa8402c, roughness: 0.95 }),
    felt: S({ color: 0xffffff, map: tex('felt', 3, 2), roughness: 0.95 }), feltPlain: S({ color: 0x1d6a3e, roughness: 0.95 }), bedcloth: S({ color: 0x5a7a9a, roughness: 0.95 }), linen: S({ color: 0xe8ebe6, roughness: 0.95 }),
    linen2: S({ color: 0xa8c0d8, roughness: 0.95 }), quilt: S({ color: 0x3a5a4a, roughness: 0.95 }), leather: S({ color: 0x3a3028, roughness: 0.8 }),
    glass: S({ color: 0xaed4ff, roughness: 0.1, transparent: true, opacity: 0.22, depthWrite: false }), smoke: S({ color: 0x20262e, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.55, depthWrite: false }),
    water: S({ color: 0x4aa0b8, roughness: 0.1, transparent: true, opacity: 0.38, depthWrite: false }), canopy: S({ color: 0x9ad0ff, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.35, depthWrite: false }),
    plant: S({ color: 0x3a9a4a, roughness: 0.8 }), plant2: S({ color: 0x6aa83a, roughness: 0.8 }), gravel: S({ color: 0xb8a888, roughness: 0.95 }), rock: S({ color: 0x6a6a68, roughness: 0.9 }),
    podBody: S({ color: 0xe0e4e8, roughness: 0.4, metalness: 0.2 }), podOrange: S({ color: 0xe0661e, roughness: 0.5 }), brass: S({ color: 0xc09040, metalness: 0.8, roughness: 0.4 }),
    siloGrey: S({ color: 0xc4c8cc, roughness: 0.45, metalness: 0.6 }), pipeGreen: S({ color: 0x3a8a5a, roughness: 0.5, metalness: 0.4 }), fuel: S({ color: 0x5ac8e8, roughness: 0.3, transparent: true, opacity: 0.8 }),
    gridCyan: L(0x1a7a90), cyan: L(0x40e0ff), amber: L(0xffb030), green: L(0x40ff70), redLit: L(0xff3a2a), white2: L(0xf0f4ff), slot: L(0x050607),
    diamond: S({ color: 0xffffff, map: tex('diamond', 5, 5), metalness: 0.7, roughness: 0.45 }), grate: S({ color: 0xffffff, map: tex('grate', 4, 2), metalness: 0.6, roughness: 0.5 }),
    hazardTape: S({ color: 0xffffff, map: tex('tape', 4, 1), roughness: 0.6 }),
    marquee: new THREE.MeshBasicMaterial({ map: tex('marquee'), color: new THREE.Color(1.3, 1.3, 1.3) }), arcscreen: new THREE.MeshBasicMaterial({ map: tex('arcscreen') }), scanlcd: new THREE.MeshBasicMaterial({ map: tex('scanlcd') }),
    ball: ['#e8c020', '#2050c0', '#c02020', '#5a2a80', '#e07020', '#208040', '#701818', '#101010', '#f4f4ee'].map(c => S({ color: c, roughness: 0.25 })),
  });
  return MT;
}
const matCache = {};
const gm = (k, rx, ry, extra = {}) => { const key = k + rx + 'x' + ry; return matCache[key] || (matCache[key] = new THREE.MeshStandardMaterial({ map: tex(k, rx, ry), metalness: 0.6, roughness: 0.5, ...extra })); };

// ---------------------------------------------------------------- geometry collector (boxes, cylinders, ellipsoids, rods) under a matrix stack, merged per material
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const geoCache = {};
const G = (k, f) => geoCache[k] || (geoCache[k] = f());
class B {
  constructor() { this.by = new Map(); this.st = [new THREE.Matrix4()]; this.tris = 0; }
  push(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { this.st.push(this.st[this.st.length - 1].clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), ONE))); return this; }
  pop() { this.st.pop(); return this; }
  putM(geo, mat, m) {
    const g = geo.clone(); g.applyMatrix4(this.st[this.st.length - 1].clone().multiply(m));
    const ng = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ng.deleteAttribute(k);
    if (!this.by.has(mat)) this.by.set(mat, []); this.by.get(mat).push(ng); this.tris += ng.attributes.position.count / 3;
  }
  put(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) { this.putM(geo, mat, new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz))); return this; }
  box(w, h, d, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { return this.put(G(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), mat, x, y + h / 2, z, rx, ry, rz); }
  cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 14, rx = 0, ry = 0, rz = 0) { return this.put(G(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), mat, x, y + h / 2, z, rx, ry, rz); }
  hc(r, len, mat, x, y, z, axis = 'x', seg = 12) { return this.put(G(`c${r},${r},${len},${seg}`, () => new THREE.CylinderGeometry(r, r, len, seg)), mat, x, y, z, axis === 'z' ? PI / 2 : 0, 0, axis === 'x' ? PI / 2 : 0); }
  ell(rx, ry, rz, mat, x, y, z, seg = 12, rot = [0, 0, 0]) { return this.put(G(`e${seg}`, () => new THREE.SphereGeometry(1, seg, Math.max(4, Math.round(seg * 0.7)))), mat, x, y, z, rot[0], rot[1], rot[2], rx, ry, rz); }
  sph(r, mat, x, y, z, seg = 8) { return this.ell(r, r, r, mat, x, y, z, seg); }
  ovl(rx, rz, h, mat, x = 0, y = 0, z = 0, seg = 24) { return this.put(G(`o${seg}`, () => new THREE.CylinderGeometry(1, 1, 1, seg)), mat, x, y + h / 2, z, 0, 0, 0, rx, h, rz); }
  tor(R, r, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 16, ts = 6) { return this.put(G(`t${R},${r},${seg},${ts}`, () => new THREE.TorusGeometry(R, r, ts, seg)), mat, x, y, z, rx, ry, rz); }
  rod(mat, r, a, b, seg = 8) {
    const A = new THREE.Vector3(...a), Z = new THREE.Vector3(...b), d = Z.clone().sub(A), L = d.length(); if (L < 1e-5) return this;
    const geo = G(`r${r},${L.toFixed(4)},${seg}`, () => new THREE.CylinderGeometry(r, r, L, seg)); const qq = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
    this.putM(geo, mat, new THREE.Matrix4().compose(A.add(Z).multiplyScalar(0.5), qq, ONE)); return this;
  }
  beam(mat, w, d, a, b) {     // box w x d in section running from a to b
    const A = new THREE.Vector3(...a), Z = new THREE.Vector3(...b), dir = Z.clone().sub(A), L = dir.length();
    const geo = G(`m${w},${d},${L.toFixed(4)}`, () => new THREE.BoxGeometry(w, L, d)); const qq = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
    this.putM(geo, mat, new THREE.Matrix4().compose(A.add(Z).multiplyScalar(0.5), qq, ONE)); return this;
  }
  // side-profile prism: pts = [[z, y], ...], extruded across width w centred on x
  prism(pts, w, mat, x = 0) {
    const sh = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1]))); const g = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false }); g.rotateY(-PI / 2); g.translate(w / 2, 0, 0);
    return this.putM(g, mat, new THREE.Matrix4().makeTranslation(x, 0, 0));
  }
  panel(w, h, smat, bez, x, y, z, rx = 0, ry = 0) { this.push(x, y, z, rx, ry); this.box(w + 0.04, h + 0.04, 0.05, bez, 0, 0, 0); this.box(w, h, 0.01, smat, 0, 0.02, 0.026); this.pop(); return this; }
  done(name) {
    const grp = new THREE.Group(); if (name) grp.name = name;
    for (const [mat, geos] of this.by) { const m = new THREE.Mesh(geos.length > 1 ? mergeGeometries(geos) : geos[0], mat); m.castShadow = !mat.transparent; m.receiveShadow = true; if (mat.transparent) m.renderOrder = 2; grp.add(m); }
    grp.userData.tris = this.tris; return grp;
  }
}
function fin(g, name, dept, ud = {}) {
  g.name = name; let t = 0; g.traverse(o => { if (o.isMesh) t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  Object.assign(g.userData, { name, dept, tris: Math.round(t) }, ud); return g;
}
const one = (b, name, dept, ud) => { const g = new THREE.Group(); g.add(b.done(name)); return fin(g, name, dept, ud); };

// ================================================================ CMD-2 briefing table (oval 2.4 x 1.1, top 0.74, two steel pedestal bases)
function briefing_table() {
  const P = mats(), b = new B();
  b.ovl(1.2, 0.55, 0.04, P.woodLt, 0, 0.70, 0, 32); b.ovl(1.215, 0.565, 0.016, P.steel, 0, 0.705, 0, 32);               // top and edge band
  b.ovl(1.0, 0.38, 0.07, P.dark, 0, 0.63, 0, 24);                                                                      // apron
  for (const sx of [-1, 1]) {
    b.ovl(0.4, 0.28, 0.04, P.steel, sx * 0.58, 0, 0, 20); b.ovl(0.3, 0.2, 0.6, P.body, sx * 0.58, 0.04, 0, 20); b.ovl(0.34, 0.24, 0.04, P.steel, sx * 0.58, 0.64, 0, 20);
    for (const a of [0.8, 2.4, 3.9, 5.5]) b.cyl(0.012, 0.012, 0.012, P.dark, sx * 0.58 + Math.cos(a) * 0.34, 0.04, Math.sin(a) * 0.23, 6);       // base bolts
    b.box(0.24, 0.012, 0.02, P.cyan, sx * 0.58, 0.3, 0.205);                                                           // pedestal light strip
  }
  b.box(0.5, 0.012, 0.24, P.dark, 0, 0.74, 0); b.box(0.46, 0.006, 0.2, P.steel, 0, 0.752, 0); b.box(0.12, 0.008, 0.03, P.dark, 0, 0.758, 0.06);   // cable hatch
  b.box(1.3, 0.004, 0.035, P.cyan, 0, 0.74, 0.42); b.box(1.3, 0.004, 0.035, P.cyan, 0, 0.74, -0.42);                   // recessed display strips
  return one(b, 'briefing_table', 'command', { top: 0.74, box: [-1.25, 1.25, -0.6, 0.6], size: [2.4, 0.74, 1.1],
    spots: [[0, 0.95, PI], [-0.7, 0.95, PI], [0.7, 0.95, PI], [-0.7, -0.95, 0], [0.7, -0.95, 0], [0, -0.95, 0], [1.55, 0, -PI / 2], [-1.55, 0, PI / 2]], use: { head: { x: 0, z: -0.95, ry: 0 }, display: { x: 0, y: 0.74, z: 0.42 } } });
}

// ================================================================ CMD-3 platform bed with drawers (2.0 x 1.4, mattress top 0.55, headboard at -z)
function platform_bed() {
  const P = mats(), b = new B();
  b.box(1.3, 0.04, 1.9, P.rubber, 0, 0, 0); b.box(1.4, 0.31, 2.0, P.body, 0, 0.04, 0);                                        // plinth and base
  for (const sx of [-1, 1]) { b.box(0.6, 0.2, 0.02, P.dark, sx * 0.34, 0.1, 1.005); b.box(0.2, 0.025, 0.03, P.steel, sx * 0.34, 0.26, 1.03); b.box(0.64, 0.24, 0.005, P.steel, sx * 0.34, 0.08, 1.0); }   // two drawer fronts and pulls
  b.box(1.36, 0.2, 1.94, P.bedcloth, 0, 0.35, 0.0);                                                                       // mattress, top 0.55
  b.box(1.42, 0.56, 0.1, P.leather, 0, 0.35, -1.0); for (const x of [-0.45, -0.15, 0.15, 0.45]) b.box(0.02, 0.5, 0.012, P.dark, x, 0.38, -0.945);   // padded headboard
  b.box(0.04, 0.03, 0.3, P.cyan, 0.5, 0.86, -0.92);                                                                       // reading light strip
  for (const sx of [-0.33, 0.33]) b.box(0.55, 0.12, 0.36, P.linen, sx, 0.55, -0.74);                                       // pillows
  b.box(1.38, 0.035, 1.25, P.quilt, 0, 0.55, 0.22); b.box(1.38, 0.06, 0.12, P.quilt, 0, 0.55, -0.4);                         // blanket and its fold
  for (const z of [-0.5, 0.15, 0.8]) b.cyl(0.012, 0.012, 0.3, P.steel, 0.7, 0.55, z, 6);                                  // lee rail posts
  b.rod(P.steel, 0.013, [0.7, 0.85, -0.5], [0.7, 0.85, 0.8]); b.box(0.008, 0.22, 1.2, P.bedcloth, 0.705, 0.55, 0.15);       // rail and lee-cloth
  return one(b, 'platform_bed', 'command', { top: 0.55, seat: 0.55, box: [-0.72, 0.72, -1.05, 1.0], size: [1.4, 0.95, 2.1], spots: [[-1.05, 0.15, PI / 2], [1.05, 0.15, -PI / 2]], use: { sleep: { x: 0, y: 0.55, z: -0.1 }, drawers: { x: 0, z: 1.3, ry: PI } } });
}

// ================================================================ FLT-8 work pod (single seat, bubble canopy, two folded manipulators, skids)
function workpod() {
  const P = mats(), b = new B();
  for (const sx of [-1, 1]) {                                                                                       // skids
    b.hc(0.03, 1.9, P.dark, sx * 0.58, 0.05, 0, 'z', 8); b.cyl(0.02, 0.02, 0.3, P.steel, sx * 0.55, 0.05, 0.5, 6); b.cyl(0.02, 0.02, 0.3, P.steel, sx * 0.55, 0.05, -0.5, 6);
    b.box(0.08, 0.08, 0.06, P.hazard ?? P.yellow, sx * 0.55, 0.3, 0.5);
  }
  b.ell(0.68, 0.3, 1.0, P.podBody, 0, 0.55, 0, 16);                                                                 // hull
  b.box(1.0, 0.05, 0.5, P.podOrange, 0, 0.8, -0.62, -0.05); b.ell(0.5, 0.14, 0.4, P.podOrange, 0, 0.82, -0.7, 12);       // rear spine
  b.box(1.0, 0.4, 0.4, P.body, 0, 0.4, -1.0); for (const sx of [-1, 1]) { b.cyl(0.16, 0.12, 0.2, P.dark, sx * 0.28, 0.5, -1.3, 12, PI / 2); b.cyl(0.1, 0.17, 0.12, P.steel, sx * 0.28, 0.5, -1.4, 12, PI / 2); b.cyl(0.14, 0.14, 0.008, P.amber, sx * 0.28, 0.5, -1.455, 12, PI / 2); }
  for (const z of [0.2, 0.55]) b.box(1.36, 0.03, 0.06, P.yellow, 0, 0.55, z, 0, 0, 0);
  for (const sx of [-1, 1]) { b.box(0.06, 0.03, 0.05, sx > 0 ? P.green : P.redLit, sx * 0.64, 0.6, 0.5); b.box(0.1, 0.07, 0.06, P.white2, sx * 0.3, 0.5, 0.96); }   // nav and head lamps
  // seat and controls inside the canopy
  b.box(0.42, 0.08, 0.42, P.leather, 0, 0.82, 0.1); b.box(0.42, 0.5, 0.08, P.leather, 0, 0.86, -0.14, -0.15); b.box(0.04, 0.3, 0.04, P.steel, 0, 0.85, 0.5); b.box(0.3, 0.2, 0.2, P.dark, 0, 0.82, 0.58, -0.5); b.box(0.2, 0.1, 0.008, P.cyan, 0, 0.93, 0.6, -0.5);
  b.ell(0.52, 0.52, 0.64, P.canopy, 0, 0.85, 0.3, 16);                                                                // canopy bubble
  b.tor(0.51, 0.025, P.steel, 0, 0.85, 0.3, PI / 2, 0, 0, 20);                                                          // canopy seal ring
  b.rod(P.steel, 0.012, [0, 1.35, 0.1], [0, 1.78, 0.0], 6); b.sph(0.02, P.redLit, 0, 1.79, 0);                       // mast and beacon
  for (const sx of [-1, 1]) {                                                                                     // folded manipulator arms at the nose
    b.sph(0.07, P.steel, sx * 0.48, 0.45, 0.82); b.rod(P.podOrange, 0.045, [sx * 0.48, 0.45, 0.82], [sx * 0.52, 0.25, 1.1]); b.sph(0.05, P.steel, sx * 0.52, 0.25, 1.1);
    b.rod(P.podOrange, 0.035, [sx * 0.52, 0.25, 1.1], [sx * 0.4, 0.5, 1.35]); b.sph(0.04, P.steel, sx * 0.4, 0.5, 1.35);
    b.box(0.03, 0.12, 0.03, P.dark, sx * 0.4 + 0.03, 0.45, 1.4); b.box(0.03, 0.12, 0.03, P.dark, sx * 0.4 - 0.03, 0.45, 1.4);   // claw fingers
  }
  return one(b, 'workpod', 'flight', { box: [-0.75, 0.75, -1.15, 1.15], size: [1.6, 1.8, 2.2], use: { hatch: { x: 0, z: 1.6, ry: PI }, service: { x: 0, z: -1.7, ry: 0 } }, spots: [[0, 1.5, PI]] });
}

// ================================================================ FLT-9 maintenance stand (wheeled B-stand, grated platform 1.2 x 0.8 at 1.75 m, four-step stair)
function maint_stand() {
  const P = mats(), b = new B(), top = 1.75, zc = -0.3;
  b.box(1.2, 0.05, 0.8, P.grate, 0, top - 0.05, zc);
  b.box(1.22, 0.04, 0.82, P.dark, 0, top - 0.09, zc);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.box(0.06, top - 0.18, 0.06, P.body, sx * 0.55, 0.14, zc + sz * 0.35);
    b.hc(0.07, 0.04, P.rubber, sx * 0.55, 0.08, zc + sz * 0.35, 'x', 10); b.box(0.08, 0.06, 0.1, P.dark, sx * 0.55, 0.1, zc + sz * 0.35);
  }
  b.box(1.1, 0.04, 0.04, P.body, 0, 0.5, zc + 0.35); b.box(1.1, 0.04, 0.04, P.body, 0, 0.5, zc - 0.35); b.beam(P.body, 0.03, 0.03, [-0.55, 0.3, zc - 0.35], [0.55, 1.1, zc - 0.35]); b.beam(P.body, 0.03, 0.03, [0.55, 0.3, zc - 0.35], [-0.55, 1.1, zc - 0.35]);
  b.box(0.04, 0.2, 0.04, P.redLit, 0.55, 0.0, zc + 0.46);                                                          // brake lever
  // stair on the +z side: three treads then the platform
  for (let i = 0; i < 3; i++) { const h = 0.44 * (i + 1), z = 0.8 - i * 0.25; b.box(0.9, 0.04, 0.25, P.grate, 0, h - 0.04, z); b.box(0.9, h - 0.04, 0.02, P.dark, 0, 0.0, z - 0.11); }
  for (const sx of [-1, 1]) b.beam(P.body, 0.04, 0.05, [sx * 0.46, 0.0, 0.95], [sx * 0.46, top - 0.05, 0.1]);       // stringers
  // yellow guard rails on three sides and along the stair
  const y1 = top + 0.45, y2 = top + 0.95;
  for (const sx of [-1, 1]) { for (const z of [zc - 0.38, zc + 0.38]) b.cyl(0.02, 0.02, 0.95, P.yellow, sx * 0.58, top, z, 8); b.rod(P.yellow, 0.02, [sx * 0.58, y2, zc - 0.38], [sx * 0.58, y2, zc + 0.38], 8); b.rod(P.yellow, 0.016, [sx * 0.58, y1, zc - 0.38], [sx * 0.58, y1, zc + 0.38], 6); b.box(0.02, 0.1, 0.8, P.yellow, sx * 0.59, top, zc); }
  b.rod(P.yellow, 0.02, [-0.58, y2, zc - 0.38], [0.58, y2, zc - 0.38], 8); b.rod(P.yellow, 0.016, [-0.58, y1, zc - 0.38], [0.58, y1, zc - 0.38], 6); b.box(1.18, 0.1, 0.02, P.yellow, 0, top, zc - 0.39);
  for (const sx of [-1, 1]) b.rod(P.yellow, 0.02, [sx * 0.46, 0.95, 0.9], [sx * 0.46, y2 - 0.05, 0.1], 8);        // stair handrails
  return one(b, 'maint_stand', 'flight', { box: [-0.65, 0.65, -0.75, 1.0], size: [1.2, 2.7, 1.8], use: { stairFoot: { x: 0, z: 1.2, ry: PI }, platform: { x: 0, y: top, z: zc } }, spots: [[0, 1.25, PI]] });
}

// ================================================================ OPS-8 cargo beam pad (2.3 x 2.3 x 0.12, diamond plate, emitter tile grid, yellow edge band, two chocks)
function cargo_pad() {
  const P = mats(), b = new B();
  b.box(2.3, 0.08, 2.3, P.dark, 0, 0, 0); b.box(2.24, 0.04, 2.24, P.diamond, 0, 0.08, 0);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { b.box(0.58, 0.004, 0.58, P.dark, i * 0.68, 0.12, j * 0.68); b.box(0.5, 0.004, 0.5, P.gridCyan, i * 0.68, 0.124, j * 0.68); }
  b.box(2.3, 0.01, 0.1, P.hazardTape, 0, 0.11, 1.1); b.box(2.3, 0.01, 0.1, P.hazardTape, 0, 0.11, -1.1); b.box(0.1, 0.01, 2.1, P.hazardTape, 1.1, 0.11, 0); b.box(0.1, 0.01, 2.1, P.hazardTape, -1.1, 0.11, 0);
  for (const sx of [-0.5, 0.5]) { b.prism([[1.15, 0], [1.29, 0], [1.15, 0.12]], 0.28, P.yellow, sx); b.prism([[-1.15, 0], [-1.29, 0], [-1.15, 0.12]], 0.28, P.yellow, sx); }   // chocks
  return one(b, 'cargo_pad', 'operations', { top: 0.12, box: [-1.15, 1.15, -1.15, 1.15], size: [2.3, 0.12, 2.3], spots: [[0, 1.45, PI]], use: { stage: { x: 0, y: 0.12, z: 0 } } });
}

// ================================================================ ENG-13 reactor detail: add-on children for the `warpcore` prop (origin = column axis at the floor; column r 0.42, 3.2 m)
function warpcore_detail() {
  const P = mats(), b = new B();
  for (let i = 0; i < 12; i++) { const y = 0.62 + i * 0.185; b.cyl(0.445, 0.445, 0.09, P.dark, 0, y, 0, 16); b.box(0.06, 0.1, 0.05, P.yellow, 0.455 * Math.cos(i * 0.5), y - 0.005, 0.455 * Math.sin(i * 0.5)); }          // constrictor clamp rings
  for (let k = 0; k < 4; k++) {                                                                                      // injector nozzle housings at the waist
    const a = k * PI / 2 + 0.78 + PI / 4; b.push(0, 0, 0, 0, -a + PI / 2, 0);                                      // local +z = radial outward
    b.cyl(0.075, 0.075, 0.3, P.steel, 0, 1.55, 0.42, 12, PI / 2); b.cyl(0.095, 0.095, 0.04, P.dark, 0, 1.55, 0.44, 12, PI / 2); b.cyl(0.095, 0.095, 0.04, P.dark, 0, 1.55, 0.7, 12, PI / 2);
    b.cyl(0.04, 0.075, 0.1, P.brass, 0, 1.55, 0.72, 10, PI / 2); b.tor(0.06, 0.012, P.red, 0, 1.55, 0.82, 0, 0, 0, 12, 4); for (let s = 0; s < 3; s++) b.rod(P.red, 0.008, [0, 1.55, 0.82], [Math.cos(s * 2.09) * 0.06, 1.55 + Math.sin(s * 2.09) * 0.06, 0.82], 4);
    b.rod(P.pipeGreen, 0.02, [0.07, 1.62, 0.55], [0.07, 0.8, 0.62], 6); b.rod(P.pipeGreen, 0.02, [0.07, 0.8, 0.62], [0.2, 0.3, 0.7], 6); b.box(0.06, 0.04, 0.02, P.amber, -0.07, 1.64, 0.7);
    b.pop();
  }
  return one(b, 'warpcore_detail', 'engineering', { size: [1.7, 3.2, 1.7], note: 'add-on: child of the warpcore prop, same origin', use: { injector: [0, 1, 2, 3].map(k => { const a = k * PI / 2 + 0.78 + PI / 4; return { x: Math.cos(a) * 1.25, z: Math.sin(a) * 1.25, y: 1.55 }; }) } });
}
// spare injector in an open slatted crate (0.9 x 0.5 x 0.45)
function injector_crate() {
  const P = mats(), b = new B();
  b.box(0.9, 0.04, 0.5, P.wood, 0, 0, 0); for (const sz of [-0.23, 0.23]) { b.box(0.9, 0.06, 0.04, P.wood, 0, 0.04, sz); b.box(0.9, 0.06, 0.04, P.wood, 0, 0.2, sz); b.box(0.9, 0.06, 0.04, P.wood, 0, 0.36, sz); }
  for (const sx of [-0.43, 0.43]) { for (const sz of [-0.23, 0.23]) b.box(0.05, 0.42, 0.05, P.woodLt, sx, 0, sz); b.box(0.04, 0.06, 0.46, P.wood, sx, 0.04, 0); b.box(0.04, 0.06, 0.46, P.wood, sx, 0.2, 0); b.box(0.04, 0.06, 0.46, P.wood, sx, 0.36, 0); }
  b.hc(0.09, 0.62, P.steel, -0.03, 0.2, 0, 'x', 14); for (let i = 0; i < 5; i++) b.hc(0.1, 0.03, P.dark, -0.25 + i * 0.11, 0.2, 0, 'x', 14);
  b.cyl(0.0, 0.09, 0.2, P.siloGrey, 0.42, 0.2, 0, 12, 0, 0, -PI / 2); b.hc(0.045, 0.1, P.brass, -0.4, 0.2, 0, 'x', 10); b.hc(0.02, 0.1, P.brass, -0.2, 0.31, 0, 'z', 8); b.tor(0.04, 0.008, P.red, -0.2, 0.31, 0.06, PI / 2, 0, 0, 10, 4);
  return one(b, 'injector_crate', 'engineering', { top: 0.42, box: [-0.45, 0.45, -0.26, 0.26], size: [0.9, 0.42, 0.52], spots: [[0, 0.7, PI]] });
}

// ================================================================ ENG-14 machine tools
function knee_mill() {
  const P = mats(), b = new B(), gy = P.body;
  b.box(1.0, 0.16, 0.95, P.dark, 0, 0, -0.1); b.box(1.04, 0.03, 0.99, P.yellow, 0, 0.0, -0.1);                                  // base and keep-out edge
  b.box(0.5, 1.55, 0.42, gy, 0, 0.16, -0.45); b.box(0.52, 1.0, 0.03, P.dark, 0, 0.6, -0.23);                                   // column and its way cover
  b.box(0.62, 0.3, 0.55, gy, 0, 0.45, -0.12); b.box(0.64, 0.025, 0.2, P.steel, 0, 0.75, -0.2);                                   // knee
  b.box(0.7, 0.1, 0.5, gy, 0, 0.75, -0.05);                                                                                        // saddle
  b.box(1.2, 0.06, 0.3, P.steel, 0, 0.85, 0.0);                                                                                   // table
  for (const z of [-0.08, 0, 0.08]) b.box(1.16, 0.005, 0.016, P.dark, 0, 0.91, z);                                                  // T slots
  b.box(0.1, 0.1, 0.08, P.steel, 0.2, 0.91, 0.0); b.box(0.12, 0.05, 0.1, P.dark, -0.35, 0.91, 0.0);                                 // clamp and a vise jaw
  b.box(0.5, 0.45, 0.42, gy, 0, 1.45, -0.28); b.box(0.46, 0.08, 0.2, P.dark, 0, 1.4, -0.0);                                      // head, nose
  b.hc(0.12, 0.28, P.dark, 0, 1.95, -0.28, 'y', 16); b.cyl(0.06, 0.06, 0.1, P.steel, 0, 1.25, -0.28, 12); b.cyl(0.04, 0.05, 0.12, P.dark, 0, 1.11, -0.28, 10); b.cyl(0.012, 0.012, 0.14, P.steel, 0, 0.98, -0.28, 6);
  b.box(0.2, 0.2, 0.08, P.dark, 0.2, 1.4, -0.05); b.box(0.16, 0.12, 0.004, P.scanlcd, 0.2, 1.44, -0.008);                            // control panel
  b.cyl(0.03, 0.03, 0.04, P.redLit, 0.28, 1.35, -0.015, 8, PI / 2);
  // handwheels: table (both ends), saddle (front), knee crank (side), quill wheel (head side)
  const wheel = (x, y, z, ax, r = 0.09) => { b.push(x, y, z, ax === 'x' ? 0 : 0, 0, ax === 'x' ? 0 : 0); b.pop(); b.hc(r, 0.025, P.steel, x, y, z, ax, 14); b.hc(0.02, 0.06, P.dark, x, y, z, ax, 8); const dx = ax === 'x' ? 0.05 : 0, dz = ax === 'z' ? 0.05 : 0; b.sph(0.02, P.red, x + dx, y + r * 0.9, z + dz, 6); };
  wheel(-0.68, 0.88, 0.0, 'x'); wheel(0.68, 0.88, 0.0, 'x'); wheel(0, 0.8, 0.22, 'z', 0.1); wheel(0.33, 0.55, -0.12, 'x', 0.08);
  for (let s = 0; s < 3; s++) { const a = s * 2.09; b.rod(P.steel, 0.01, [0.27, 1.5, -0.28], [0.27 + 0.0, 1.5 + Math.cos(a) * 0.14, -0.28 + Math.sin(a) * 0.14], 5); b.sph(0.016, P.dark, 0.27, 1.5 + Math.cos(a) * 0.14, -0.28 + Math.sin(a) * 0.14, 6); }
  b.rod(P.steel, 0.008, [0.25, 1.15, -0.5], [0.25, 1.45, -0.5], 5); b.rod(P.steel, 0.008, [0.25, 1.45, -0.5], [0.15, 1.2, 0.0], 5); b.cyl(0.01, 0.0, 0.05, P.steel, 0.15, 1.15, 0.0, 6);   // coolant line
  b.box(1.3, 0.025, 0.55, P.rubber, 0, 0.0, 0.5);                                                                                 // anti-fatigue mat at the operator's feet
  return one(b, 'knee_mill', 'engineering', { box: [-0.75, 0.75, -0.7, 0.7], size: [1.5, 1.95, 1.4], spots: [[0, 0.55, PI], [0.6, 0.5, PI]], use: { table: { x: 0, z: 0.55, ry: PI } } });
}
function drill_press() {
  const P = mats(), b = new B();
  b.box(0.4, 0.05, 0.62, P.dark, 0, 0, 0.0); b.box(0.42, 0.012, 0.64, P.yellow, 0, 0.0, 0.0);
  b.cyl(0.045, 0.045, 1.5, P.steel, 0, 0.05, -0.2, 14); b.cyl(0.08, 0.08, 0.05, P.dark, 0, 0.05, -0.2, 14);
  b.cyl(0.19, 0.19, 0.03, P.steel, 0, 0.78, -0.05, 20); b.box(0.04, 0.03, 0.3, P.dark, 0, 0.78, -0.05); b.cyl(0.07, 0.07, 0.1, P.dark, 0, 0.7, -0.2, 12); b.box(0.02, 0.02, 0.14, P.dark, 0.1, 0.72, -0.2); b.sph(0.02, P.red, 0.1, 0.72, -0.07);
  b.box(0.22, 0.26, 0.3, P.body, 0, 1.28, -0.12); b.box(0.2, 0.18, 0.12, P.dark, 0, 1.54, -0.15); b.hc(0.07, 0.18, P.dark, 0, 1.64, -0.2, 'z', 12);       // head, belt cover, motor
  b.cyl(0.045, 0.045, 0.14, P.steel, 0, 1.12, -0.07, 12); b.cyl(0.03, 0.04, 0.1, P.dark, 0, 1.0, -0.07, 10); b.cyl(0.008, 0.008, 0.18, P.steel, 0, 0.84, -0.07, 6);
  for (let s = 0; s < 3; s++) { const a = s * 2.09 + 0.4, y = 1.28 + Math.cos(a) * 0.17, z = -0.12 + Math.sin(a) * 0.17; b.rod(P.steel, 0.01, [0.115, 1.28, -0.12], [0.2, y, z], 5); b.sph(0.022, P.dark, 0.2, y, z, 6); }
  b.hc(0.03, 0.04, P.steel, 0.115, 1.28, -0.12, 'x', 10); b.box(0.06, 0.06, 0.04, P.redLit, 0.0, 1.48, 0.04); b.box(0.1, 0.03, 0.01, P.amber, 0, 1.5, 0.036);
  return one(b, 'drill_press', 'engineering', { box: [-0.25, 0.25, -0.4, 0.4], size: [0.4, 1.7, 0.7], spots: [[0, 0.55, PI]], use: { chuck: { x: 0, y: 1.0, z: -0.07 } } });
}

// ================================================================ SEC-6 walk-through scan arch (1.1 w x 2.1 h x 0.6 d, opening 0.7 x 2.0, lamp columns, lintel display)
function scan_arch() {
  const P = mats(), b = new B();
  b.box(1.3, 0.02, 0.85, P.dark, 0, 0, 0); b.box(0.5, 0.004, 0.8, P.yellow, 0, 0.02, 0); b.box(0.04, 0.004, 0.8, P.dark, 0.24, 0.024, 0); b.box(0.04, 0.004, 0.8, P.dark, -0.24, 0.024, 0);
  for (const sx of [-1, 1]) {
    b.box(0.2, 2.0, 0.6, P.body, sx * 0.45, 0.02, 0); b.box(0.014, 1.8, 0.5, P.steel, sx * 0.348, 0.1, 0);               // upright and sensor strip
    for (let i = 0; i < 6; i++) b.box(0.01, 0.2, 0.46, P.dark, sx * 0.345, 0.15 + i * 0.3, 0);
    for (let i = 0; i < 3; i++) b.box(0.06, 0.06, 0.012, [P.green, P.amber, P.redLit][i], sx * 0.45, 1.55 + i * 0.1, 0.306);   // lamp column on the front face
    b.box(0.08, 0.28, 0.02, P.dark, sx * 0.45, 1.5, 0.3);
  }
  b.box(1.1, 0.25, 0.6, P.body, 0, 1.97, 0); b.box(0.5, 0.12, 0.012, P.scanlcd, 0, 2.03, 0.306); b.box(0.54, 0.16, 0.01, P.dark, 0, 2.01, 0.302); b.box(1.04, 0.02, 0.5, P.dark, 0, 2.2, 0);
  b.box(0.04, 0.04, 0.02, P.amber, -0.4, 2.1, 0.31); b.box(0.04, 0.04, 0.02, P.green, 0.4, 2.1, 0.31);
  return one(b, 'scan_arch', 'security', { box: [-0.65, 0.65, -0.42, 0.42], size: [1.1, 2.2, 0.6], spots: [[0.9, 0.5, -PI / 2], [0, 1.1, PI]], use: { pass: { x: 0, z: 0.9, ry: PI }, display: { x: 0, y: 2.03, z: 0.31 }, guard: { x: 0.9, z: 0.5, ry: -PI / 2 } } });
}

// ================================================================ SCI-9 specimen tank on stand (1.0 x 0.4 x 0.5 aquarium on a 0.8 m steel stand, lid light bar, filter)
function specimen_tank() {
  const P = mats(), b = new B(), R = rng(3);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.045, 0.8, 0.045, P.body, sx * 0.47, 0, sz * 0.17);
  for (const y of [0.0, 0.3]) { b.box(1.0, 0.03, 0.04, P.body, 0, y + 0.03, 0.17); b.box(1.0, 0.03, 0.04, P.body, 0, y + 0.03, -0.17); }
  b.box(0.04, 0.03, 0.34, P.body, -0.47, 0.33, 0); b.box(0.04, 0.03, 0.34, P.body, 0.47, 0.33, 0); b.box(1.04, 0.04, 0.44, P.dark, 0, 0.8, 0);
  b.box(0.3, 0.2, 0.3, P.cream, -0.25, 0.04, 0); b.box(0.2, 0.25, 0.25, P.dark, 0.25, 0.08, 0);                                  // spare media and a battery pack on the lower shelf
  b.box(1.0, 0.04, 0.4, P.gravel, 0, 0.84, 0);                                                                                     // sand bed
  b.box(0.98, 0.42, 0.38, P.water, 0, 0.88, 0);                                                                                    // water volume
  b.box(1.04, 0.025, 0.04, P.steel, 0, 1.3, 0.2); b.box(1.04, 0.025, 0.04, P.steel, 0, 1.3, -0.2); b.box(0.04, 0.025, 0.4, P.steel, 0.5, 1.3, 0); b.box(0.04, 0.025, 0.4, P.steel, -0.5, 1.3, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.03, 0.5, 0.03, P.steel, sx * 0.5, 0.82, sz * 0.2);
  b.box(1.0, 0.04, 0.4, P.dark, 0, 1.31, 0); b.box(0.9, 0.02, 0.06, P.white2, 0, 1.3, 0.06); b.box(0.9, 0.012, 0.06, P.cyan, 0, 1.295, -0.08);   // lid and light bar
  for (let i = 0; i < 4; i++) b.ell(0.06 + R() * 0.04, 0.035 + R() * 0.02, 0.05, P.rock, -0.3 + i * 0.22 + R() * 0.08, 0.89, -0.05 + R() * 0.1, 7);
  for (let i = 0; i < 7; i++) { const x = -0.4 + i * 0.13 + R() * 0.04, z = -0.1 + R() * 0.2, h = 0.15 + R() * 0.2; b.rod(i % 2 ? P.plant : P.plant2, 0.008, [x, 0.88, z], [x + (R() - 0.5) * 0.08, 0.88 + h, z], 4); b.ell(0.035, 0.06, 0.02, i % 2 ? P.plant : P.plant2, x, 0.9 + h * 0.8, z, 6); }
  b.box(0.2, 0.3, 0.14, P.dark, 0.64, 0.98, 0); b.box(0.16, 0.012, 0.1, P.steel, 0.64, 1.28, 0); b.rod(P.rubber, 0.012, [0.64, 1.25, 0.04], [0.4, 1.28, 0.04], 5); b.rod(P.rubber, 0.012, [0.64, 1.0, -0.04], [0.4, 0.95, -0.04], 5);   // filter box and hoses
  b.cyl(0.012, 0.012, 0.4, P.glass, -0.45, 0.86, 0.1, 6);
  return one(b, 'specimen_tank', 'sciences', { box: [-0.5, 0.78, -0.26, 0.26], size: [1.04, 1.34, 0.5], spots: [[0, 0.6, PI]], use: { view: { x: 0, z: 0.6, ry: PI }, feed: { x: 0, y: 1.3, z: 0 } } });
}

// ================================================================ SVC-11 exercise mat (1.0 x 2.0, four tiles) and grappling dummy (1.7 m)
function mat_build(b) {
  const P = mats();
  for (let i = 0; i < 4; i++) { b.box(0.99, 0.04, 0.49, i % 2 ? P.tan : P.blue, 0, 0, -0.75 + i * 0.5); b.box(0.9, 0.006, 0.4, i % 2 ? P.tan : P.blue, 0, 0.04, -0.75 + i * 0.5); }
  b.box(1.0, 0.006, 0.02, P.dark, 0, 0.04, 0.0);
}
function dummy_build(b, z = 0) {
  const P = mats();
  b.cyl(0.3, 0.3, 0.05, P.dark, 0, 0, z, 18); b.cyl(0.26, 0.28, 0.06, P.rubber, 0, 0.05, z, 18);                                    // weighted base
  b.cyl(0.11, 0.13, 1.05, P.canvas, 0, 0.11, z, 12); b.cyl(0.14, 0.12, 0.2, P.pad, 0, 1.16, z, 12);                                 // post and waist
  b.ell(0.19, 0.28, 0.12, P.canvas, 0, 1.42, z, 12); b.box(0.5, 0.1, 0.16, P.pad, 0, 1.54, z);                                      // torso and shoulders
  for (const sx of [-1, 1]) { b.rod(P.canvas, 0.055, [sx * 0.27, 1.56, z], [sx * 0.38, 1.18, z + 0.08], 8); b.sph(0.065, P.pad, sx * 0.38, 1.14, z + 0.09, 8); }   // arms and fists
  b.cyl(0.04, 0.05, 0.08, P.canvas, 0, 1.6, z, 8); b.sph(0.1, P.canvas, 0, 1.74 - 0.04, z, 10);                                        // neck and head
  for (const y of [0.4, 0.75]) b.box(0.28, 0.012, 0.012, P.dark, 0, y, z + 0.115); b.box(0.01, 0.9, 0.01, P.dark, 0, 0.15, z + 0.125);   // stitched panels
  b.box(0.36, 0.012, 0.012, P.dark, 0, 1.42, z + 0.12); b.box(0.012, 0.4, 0.012, P.dark, 0, 1.22, z + 0.12);
}
const mat = () => { const b = new B(); mat_build(b); return one(b, 'mat', 'support', { top: 0.04, box: [-0.5, 0.5, -1.0, 1.0], size: [1.0, 0.04, 2.0], spots: [[0, 0, PI], [0, 0.3, 0]] }); };
const grapple_dummy = () => { const b = new B(); dummy_build(b); return one(b, 'grapple_dummy', 'support', { box: [-0.3, 0.3, -0.3, 0.3], size: [0.6, 1.74, 0.6], spots: [[0, 0.75, PI]] }); };
const sparring_set = () => { const b = new B(); mat_build(b); dummy_build(b, -0.7); return one(b, 'sparring_set', 'support', { top: 0.04, box: [-0.5, 0.5, -1.0, 1.0], size: [1.0, 1.74, 2.0], spots: [[0, 0.3, PI], [0, 0.6, 0]], use: { dummy: { x: 0, z: -0.7, y: 1.4 } } }); };

// ================================================================ SVC-14 galley trolley (0.6 x 0.8 x 1.6, ten tray runners, push bar at 1.16 m)
function galley_trolley() {
  const P = mats(), b = new B();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.box(0.03, 1.5, 0.03, P.steel, sx * 0.28, 0.1, sz * 0.36); b.hc(0.04, 0.025, P.rubber, sx * 0.28, 0.045, sz * 0.36, 'x', 10); b.box(0.04, 0.05, 0.05, P.dark, sx * 0.28, 0.07, sz * 0.36); }
  for (let i = 0; i < 10; i++) for (const sx of [-1, 1]) b.box(0.03, 0.015, 0.7, P.steel, sx * 0.25, 0.3 + i * 0.12, 0);
  for (const z of [-0.36, 0.36]) { b.box(0.58, 0.02, 0.03, P.steel, 0, 0.18, z); b.box(0.58, 0.02, 0.03, P.steel, 0, 1.58, z); }
  b.box(0.58, 0.025, 0.74, P.steel, 0, 1.6, 0); b.box(0.5, 0.02, 0.66, P.steel, 0, 0.14, 0);
  for (const i of [1, 2, 4, 7]) { b.box(0.46, 0.012, 0.66, P.white, 0, 0.31 + i * 0.12, 0); b.box(0.46, 0.02, 0.012, P.white, 0, 0.31 + i * 0.12, 0.34); b.box(0.46, 0.02, 0.012, P.white, 0, 0.31 + i * 0.12, -0.34); if (i === 4) b.hc(0.035, 0.05, P.white, 0.1, 0.38 + i * 0.12, 0.1, 'y', 10); }
  b.rod(P.steel, 0.018, [-0.28, 1.16, 0.5], [0.28, 1.16, 0.5], 8); for (const sx of [-1, 1]) b.rod(P.steel, 0.015, [sx * 0.28, 1.16, 0.36], [sx * 0.28, 1.16, 0.5], 6);
  b.box(0.05, 0.05, 0.02, P.redLit, 0.25, 1.52, 0.38);
  return one(b, 'galley_trolley', 'support', { box: [-0.32, 0.32, -0.4, 0.55], size: [0.6, 1.6, 0.95], spots: [[0, 0.95, PI]], use: { push: { x: 0, z: 0.5, y: 1.16 }, handle: { x: 0, z: 0.5, y: 1.16 } }, note: 'cart-style: use as a CARTS entry (docs/propart-polish.md)' });
}

// ================================================================ SVC-15 laundry set
function dryer() {
  const P = mats(), b = new B();
  b.box(0.9, 1.52, 0.95, P.white, 0, 0.08, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.035, 0.04, 0.08, P.dark, sx * 0.38, 0, sz * 0.4, 8);
  b.box(0.9, 0.22, 0.95, P.steel, 0, 1.38, 0, 0, 0, 0); b.box(0.88, 0.2, 0.012, P.dark, 0, 1.39, 0.479);                          // control band
  b.box(0.3, 0.07, 0.008, P.amber, -0.2, 1.46, 0.487); for (const x of [0.05, 0.2, 0.35]) { b.cyl(0.032, 0.035, 0.03, P.steel, x, 1.4, 0.49, 12, PI / 2); }
  for (const x of [-0.35, -0.2, -0.05]) b.box(0.06, 0.03, 0.012, P.cyan, x, 1.37, 0.49);
  b.tor(0.28, 0.04, P.steel, 0, 0.7, 0.48, 0, 0, 0, 24, 8); b.cyl(0.26, 0.26, 0.03, P.smoke, 0, 0.7 - 0.0, 0.48, 24, PI / 2); b.cyl(0.24, 0.24, 0.3, P.dark, 0, 0.7, 0.33, 20, PI / 2);
  b.box(0.04, 0.12, 0.03, P.steel, 0.3, 0.64, 0.51);                                                                               // door handle
  b.box(0.62, 0.06, 0.012, P.dark, 0, 0.17, 0.478); b.box(0.2, 0.015, 0.02, P.steel, 0, 0.2, 0.49);                                // lint drawer
  b.cyl(0.08, 0.08, 0.7, P.steel, 0.0, 1.6, -0.35, 12); b.cyl(0.1, 0.1, 0.04, P.dark, 0, 1.6, -0.35, 12);                          // exhaust duct stub
  return one(b, 'dryer', 'support', { box: [-0.45, 0.45, -0.5, 0.5], size: [0.9, 2.3, 1.0], spots: [[0, 0.8, PI]], use: { door: { x: 0, z: 0.8, ry: PI }, controls: { x: 0.0, y: 1.4, z: 0.5 } } });
}
function folding_table() {
  const P = mats(), b = new B();
  b.box(1.8, 0.04, 0.8, P.woodLt, 0, 0.86, 0); b.box(1.82, 0.02, 0.82, P.steel, 0, 0.84, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.05, 0.84, 0.05, P.steel, sx * 0.82, 0, sz * 0.33);
  for (const sz of [-1, 1]) b.box(1.64, 0.03, 0.03, P.steel, 0, 0.25, sz * 0.33); for (const sx of [-1, 1]) b.box(0.03, 0.03, 0.66, P.steel, sx * 0.82, 0.25, 0);
  b.box(1.6, 0.02, 0.7, P.wood, 0, 0.28, 0);
  const st = (x, z, n, c1, c2, ry = 0, y0 = 0.9, w = 0.45, d = 0.3) => { for (let i = 0; i < n; i++) b.box(w - (i % 2) * 0.01, 0.035, d, i % 3 ? c1 : c2, x + (i % 2) * 0.008, y0 + i * 0.036, z, 0, ry); };
  st(-0.55, -0.1, 6, P.linen, P.linen2); st(0.05, 0.1, 4, P.linen2, P.linen, 0.05); st(0.6, -0.05, 7, P.linen, P.linen2, -0.04); st(-0.2, 0.28, 3, P.cream, P.linen, 0, 0.9, 0.3, 0.2);
  st(-0.3, 0.0, 5, P.linen, P.linen2, 0.03, 0.3, 0.5, 0.35); st(0.35, 0.0, 4, P.linen2, P.linen, 0, 0.3, 0.45, 0.3);
  return one(b, 'folding_table', 'support', { top: 0.9, box: [-0.95, 0.95, -0.42, 0.42], size: [1.8, 1.1, 0.8], spots: [[0, 0.65, PI], [-0.6, 0.65, PI], [0.6, 0.65, PI]], use: { fold: { x: 0, z: 0.65, ry: PI } } });
}
function linen_cart() {
  const P = mats(), b = new B();
  for (const sx of [-1, 1]) {
    b.rod(P.steel, 0.014, [sx * 0.27, 0.14, -0.38], [sx * 0.27, 0.6, 0.38], 6); b.rod(P.steel, 0.014, [sx * 0.27, 0.14, 0.38], [sx * 0.27, 0.6, -0.38], 6);
    b.rod(P.steel, 0.015, [sx * 0.27, 0.6, -0.4], [sx * 0.27, 0.6, 0.4], 6); b.rod(P.steel, 0.015, [sx * 0.27, 0.14, -0.4], [sx * 0.27, 0.14, 0.4], 6);
    for (const sz of [-1, 1]) { b.hc(0.05, 0.03, P.rubber, sx * 0.27, 0.05, sz * 0.38, 'x', 10); b.box(0.04, 0.06, 0.05, P.dark, sx * 0.27, 0.08, sz * 0.38); }
  }
  b.rod(P.steel, 0.015, [-0.27, 0.62, 0.42], [0.27, 0.62, 0.42], 6); b.rod(P.steel, 0.014, [-0.27, 0.6, 0.4], [-0.27, 0.85, 0.42], 6); b.rod(P.steel, 0.014, [0.27, 0.6, 0.4], [0.27, 0.85, 0.42], 6); b.rod(P.steel, 0.018, [-0.27, 0.85, 0.42], [0.27, 0.85, 0.42], 8);
  b.put(G('o4', () => new THREE.CylinderGeometry(1, 1, 1, 4)), P.canvas, 0, 0.36, -0.02, 0, PI / 4, 0, 0.4, 0.5, 0.58);                // canvas bag (square section)
  b.box(0.6, 0.03, 0.84, P.dark, 0, 0.6, -0.02);
  b.ell(0.2, 0.09, 0.28, P.linen, -0.1, 0.9, -0.1, 8); b.ell(0.18, 0.08, 0.25, P.linen2, 0.12, 0.88, 0.08, 8); b.ell(0.14, 0.06, 0.18, P.linen, 0.0, 0.86, -0.28, 8);
  return one(b, 'linen_cart', 'support', { box: [-0.32, 0.32, -0.45, 0.5], size: [0.6, 0.95, 0.9], spots: [[0, 0.8, PI]], use: { load: { x: 0, z: 0.8, y: 0.85 } } });
}

// ================================================================ SVC-16 lounge games
function pool_table() {
  const P = mats(), b = new B();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.box(0.14, 0.62, 0.14, P.wood, sx * 0.9, 0, sz * 0.46); b.box(0.16, 0.03, 0.16, P.dark, sx * 0.9, 0, sz * 0.46); }
  b.box(1.9, 0.14, 1.0, P.wood, 0, 0.54, 0); b.box(1.86, 0.02, 0.96, P.feltPlain, 0, 0.7, 0); b.box(1.86, 0.03, 0.96, P.felt, 0, 0.71, 0);   // body and felt
  b.box(2.1, 0.07, 0.12, P.wood, 0, 0.73, 0.54); b.box(2.1, 0.07, 0.12, P.wood, 0, 0.73, -0.54); b.box(0.12, 0.07, 1.2, P.wood, 1.0, 0.73, 0); b.box(0.12, 0.07, 1.2, P.wood, -1.0, 0.73, 0);
  b.box(1.78, 0.04, 0.04, P.feltPlain, 0, 0.74, 0.46); b.box(1.78, 0.04, 0.04, P.feltPlain, 0, 0.74, -0.46); b.box(0.04, 0.04, 0.88, P.feltPlain, 0.93, 0.74, 0); b.box(0.04, 0.04, 0.88, P.feltPlain, -0.93, 0.74, 0);
  for (const [x, z] of [[-0.98, -0.52], [0.98, -0.52], [-0.98, 0.52], [0.98, 0.52], [0, -0.55], [0, 0.55]]) { b.cyl(0.065, 0.065, 0.015, P.slot, x, 0.742, z, 12); b.cyl(0.05, 0.03, 0.14, P.leather, x * 0.97, 0.58, z * 0.97, 8); }
  for (let i = 1; i < 4; i++) for (const sz of [-1, 1]) b.box(0.025, 0.004, 0.025, P.brass, -0.7 + i * 0.35 + (i - 2) * 0.0, 0.8, sz * 0.57);
  // rack: 15 balls in a triangle at +x end, cue ball at -x
  let n = 0; for (let r = 0; r < 5; r++) for (let c = 0; c <= r; c++) { b.sph(0.028, P.ball[n++ % 8], 0.5 + r * 0.05, 0.768, (c - r / 2) * 0.057, 6); }
  b.sph(0.028, P.ball[8], -0.5, 0.768, 0.02, 6);
  b.rod(P.woodLt, 0.012, [-0.9, 0.9, 0.7], [0.5, 1.0, 0.7], 5);                                                                      // a cue lying against the wall-side rail
  b.box(0.04, 0.03, 0.04, P.cyan, -0.2, 0.74, -0.3);                                                                                   // chalk
  return one(b, 'pool_table', 'support', { top: 0.8, box: [-1.05, 1.05, -0.6, 0.6], size: [2.1, 0.8, 1.2], spots: [[0, 0.95, PI], [-0.6, 0.95, PI], [0.6, 0.95, PI], [0, -0.95, 0], [1.4, 0, -PI / 2]], use: { cue: { x: -0.5, z: 0.0 } } });
}
function card_table() {
  const P = mats(), b = new B(), R = rng(11);
  b.cyl(0.6, 0.6, 0.04, P.wood, 0, 0.7, 0, 6); b.cyl(0.5, 0.5, 0.008, P.feltPlain, 0, 0.738, 0, 6); b.cyl(0.61, 0.61, 0.012, P.dark, 0, 0.695, 0, 6);
  b.cyl(0.07, 0.09, 0.64, P.dark, 0, 0.06, 0, 12); b.cyl(0.26, 0.26, 0.05, P.dark, 0, 0.0, 0, 6); for (let i = 0; i < 3; i++) { const a = i * 2.09; b.rod(P.dark, 0.025, [0, 0.62, 0], [Math.cos(a) * 0.38, 0.03, Math.sin(a) * 0.38], 6); }
  for (let i = 0; i < 6; i++) { const a = i * PI / 3 + PI / 6; b.cyl(0.032, 0.032, 0.006, P.slot, Math.cos(a) * 0.52, 0.738, Math.sin(a) * 0.52, 8); }
  for (let i = 0; i < 6; i++) { const a = i * PI / 3, x = Math.cos(a) * 0.3, z = Math.sin(a) * 0.3; for (let k = 0; k < 3; k++) b.box(0.05, 0.005, 0.07, P.white2, x + (k - 1) * 0.02, 0.745, z, 0, -a + k * 0.2); }
  for (let p = 0; p < 4; p++) for (let k = 0; k < 4 + p; k++) b.cyl(0.02, 0.02, 0.008, [P.red, P.blue, P.yellow, P.white][(p + k) % 4], -0.08 + p * 0.06, 0.746 + k * 0.008, 0.06 + R() * 0.01, 8);
  b.cyl(0.02, 0.02, 0.01, P.redLit, 0.0, 0.746, -0.1, 8); b.box(0.06, 0.012, 0.09, P.dark, 0.1, 0.746, -0.1);                          // dealer button and the deck
  return one(b, 'card_table', 'support', { top: 0.74, box: [-0.62, 0.62, -0.62, 0.62], size: [1.2, 0.74, 1.04], spots: [[0, 0.9, PI], [0.78, 0.45, PI * 1.5], [-0.78, 0.45, PI / 2], [0.78, -0.45, PI * 1.5], [-0.78, -0.45, PI / 2], [0, -0.9, 0]] });
}
function arcade() {
  const P = mats(), b = new B();
  const prof = [[-0.4, 0], [0.36, 0], [0.36, 0.8], [0.32, 0.88], [0.22, 0.95], [0.22, 1.1], [0.1, 1.5], [0.3, 1.5], [0.3, 1.7], [-0.4, 1.7]];
  b.prism(prof, 0.7, P.dark, 0); b.box(0.01, 0.8, 0.01, P.cyan, 0.352, 0.0, 0.363); b.box(0.01, 0.8, 0.01, P.cyan, -0.352, 0.0, 0.363);   // body, two glow trim lines
  b.box(0.5, 0.2, 0.01, P.slot, 0, 0.3, 0.365); for (const x of [-0.08, 0.08]) { b.box(0.02, 0.05, 0.012, P.amber, x, 0.36, 0.37); b.box(0.014, 0.12, 0.01, P.slot, x, 0.28, 0.372); }
  b.box(0.7, 0.14, 0.01, P.rubber, 0, 0.0, 0.365);                                                                                      // kick plate
  b.box(0.72, 0.14, 0.04, P.marquee, 0, 1.56, 0.29);                                                                                    // marquee
  b.push(0, 1.12, 0.16, -0.25); b.box(0.56, 0.42, 0.01, P.arcscreen, 0, 0, 0); b.box(0.62, 0.48, 0.008, P.rubber, 0, -0.03, -0.01); b.pop();   // screen tilted back
  b.push(0, 0.9, 0.28, 0.28); b.box(0.64, 0.04, 0.3, P.dark, 0, 0, 0); b.box(0.64, 0.01, 0.3, P.body, 0, 0.04, 0);
  for (const sx of [-1, 1]) { b.cyl(0.012, 0.012, 0.07, P.steel, sx * 0.14, 0.05, 0.0, 6); b.sph(0.03, sx > 0 ? P.red : P.blue, sx * 0.14, 0.13, 0.0, 8); for (let k = 0; k < 3; k++) b.cyl(0.017, 0.017, 0.012, [P.yellow, P.green, P.cyan][k], sx * 0.14 + 0.07 + k * 0.045 * sx * 0.0 + (k - 1) * 0.04 * (sx > 0 ? 1 : 1) + sx * 0.12 + 0.0, 0.05, 0.05 + (k % 2) * 0.05, 8); }
  b.pop();
  b.box(0.5, 0.04, 0.012, P.slot, 0, 1.43, 0.12);
  return one(b, 'arcade', 'support', { box: [-0.38, 0.38, -0.42, 0.42], size: [0.7, 1.7, 0.8], spots: [[0, 0.85, PI], [-0.2, 0.85, PI], [0.2, 0.85, PI]], use: { play1: { x: -0.15, z: 0.85, ry: PI }, play2: { x: 0.15, z: 0.85, ry: PI } } });
}

// ================================================================ SVC-17 feedstock silos (two 0.7 m x 1.6 m silos on legs, hopper, level gauges, feed lines into the wall at -z)
function feedstock_silo() {
  const P = mats(), b = new B();
  for (const sx of [-1, 1]) {
    const x = sx * 0.42, z = -0.1;
    for (let k = 0; k < 4; k++) { const a = k * PI / 2 + PI / 4; b.rod(P.dark, 0.025, [x + Math.cos(a) * 0.3, 0.55, z + Math.sin(a) * 0.3], [x + Math.cos(a) * 0.33, 0, z + Math.sin(a) * 0.33], 6); }
    b.cyl(0.06, 0.35, 0.3, P.siloGrey, x, 0.45, z, 16);                                                                                     // cone bottom
    b.cyl(0.35, 0.35, 0.65, P.siloGrey, x, 0.75, z, 18); b.cyl(0.12, 0.35, 0.12, P.siloGrey, x, 1.4, z, 18); b.cyl(0.1, 0.1, 0.04, P.dark, x, 1.52, z, 12);   // body and dome
    for (const y of [0.9, 1.3]) b.cyl(0.355, 0.355, 0.03, P.steel, x, y, z, 18);
    b.cyl(0.04, 0.04, 0.12, P.dark, x, 0.3, z, 8); b.rod(P.pipeGreen, 0.025, [x, 0.3, z], [x, 0.18, z - 0.5], 6); b.rod(P.pipeGreen, 0.025, [x, 0.18, z - 0.5], [x, 1.0, z - 0.62], 6);   // outlet and feed line to the wall
    b.box(0.07, 0.6, 0.02, P.glass, x + 0.1, 0.8, z + 0.355); b.box(0.04, 0.34 + sx * 0.0, 0.01, P.fuel, x + 0.1, 0.8, z + 0.36); b.box(0.11, 0.03, 0.025, P.dark, x + 0.1, 0.77, z + 0.36); b.box(0.11, 0.03, 0.025, P.dark, x + 0.1, 1.4, z + 0.36);   // level gauge
    b.box(0.22, 0.2, 0.22, P.steel, x - 0.2, 1.1, z + 0.37, 0, 0, 0); b.box(0.24, 0.02, 0.24, P.yellow, x - 0.2, 1.3, z + 0.35, -0.5); b.rod(P.dark, 0.01, [x - 0.3, 1.3, z + 0.46], [x - 0.1, 1.3, z + 0.46], 5);   // hopper and hinged lid
  }
  b.box(1.5, 0.05, 0.05, P.dark, 0, 1.0, -0.62);
  return one(b, 'feedstock_silo', 'support', { box: [-0.8, 0.8, -0.55, 0.62], size: [1.6, 1.6, 1.2], spots: [[-0.42, 0.85, PI], [0.42, 0.85, PI]], use: { hopper1: { x: -0.62, z: 0.85, ry: PI }, hopper2: { x: 0.22, z: 0.85, ry: PI }, gauge1: { x: -0.32, z: 0.9, ry: PI }, gauge2: { x: 0.52, z: 0.9, ry: PI } } });
}

// ================================================================ SVC-18 gym machines
function exercise_bike() {
  const P = mats(), b = new B();
  b.box(0.06, 0.05, 1.0, P.dark, 0, 0.0, 0); b.box(0.5, 0.04, 0.06, P.dark, 0, 0.0, -0.45); b.box(0.5, 0.04, 0.06, P.dark, 0, 0.0, 0.45); for (const sx of [-1, 1]) for (const z of [-0.45, 0.45]) b.cyl(0.03, 0.03, 0.03, P.rubber, sx * 0.24, -0.0, z, 6);
  b.hc(0.24, 0.09, P.steel, 0, 0.32, -0.35, 'x', 20); b.hc(0.2, 0.1, P.dark, 0, 0.32, -0.35, 'x', 20); b.tor(0.23, 0.02, P.red, 0.052, 0.32, -0.35, 0, PI / 2, 0, 18, 5);
  for (const sx of [-1, 1]) b.rod(P.dark, 0.02, [sx * 0.07, 0.05, -0.35], [sx * 0.07, 0.32, -0.35], 6);
  b.rod(P.body, 0.035, [0, 0.05, -0.3], [0, 1.12, -0.28], 8);                                                                          // handlebar post
  b.rod(P.steel, 0.02, [-0.23, 1.14, -0.25], [0.23, 1.14, -0.25], 8); for (const sx of [-1, 1]) { b.rod(P.steel, 0.018, [sx * 0.23, 1.14, -0.25], [sx * 0.2, 1.0, -0.05], 6); b.cyl(0.022, 0.022, 0.12, P.rubber, sx * 0.2, 0.95, -0.05, 8, PI / 2); }
  b.box(0.2, 0.12, 0.05, P.dark, 0, 1.18, -0.3, -0.4); b.box(0.16, 0.07, 0.006, P.cyan, 0, 1.21, -0.275, -0.4);
  b.rod(P.body, 0.03, [0, 0.3, 0.0], [0, 0.88, 0.32], 8); b.rod(P.steel, 0.022, [0, 0.85, 0.32], [0, 0.97, 0.32], 8);                    // seat tube and post
  b.box(0.26, 0.06, 0.28, P.leather, 0, 0.96, 0.32); b.box(0.12, 0.05, 0.12, P.leather, 0, 0.98, 0.16);
  b.hc(0.025, 0.1, P.steel, 0, 0.3, 0.0, 'x', 8); for (const sx of [-1, 1]) { b.rod(P.steel, 0.012, [sx * 0.05, 0.3, 0.0], [sx * 0.05, 0.3 - sx * 0.14, 0.0], 5); b.box(0.1, 0.025, 0.07, P.rubber, sx * 0.14, 0.3 - sx * 0.15, 0.0); }
  return one(b, 'exercise_bike', 'support', { box: [-0.3, 0.3, -0.55, 0.55], size: [0.5, 1.3, 1.1], seat: { x: 0, y: 0.98, z: 0.32, yaw: PI }, spots: [[0, -0.09, PI]], use: { mount: { x: 0.5, z: 0.3, ry: -PI / 2 } } });
}
function rower() {
  const P = mats(), b = new B();
  b.beam(P.body, 0.07, 0.12, [0, 0.3, -1.0], [0, 0.18, 1.2]); b.box(0.08, 0.04, 0.5, P.dark, 0, 0.0, 1.05); b.box(0.55, 0.05, 0.06, P.dark, 0, 0.0, 1.15);
  b.box(0.12, 0.28, 0.08, P.dark, 0, 0.0, -0.8); b.box(0.6, 0.04, 0.08, P.dark, 0, 0.0, -0.8);
  b.hc(0.26, 0.1, P.dark, 0, 0.38, -0.95, 'x', 20); b.tor(0.27, 0.018, P.steel, 0.055, 0.38, -0.95, 0, PI / 2, 0, 20, 5); b.tor(0.27, 0.018, P.steel, -0.055, 0.38, -0.95, 0, PI / 2, 0, 20, 5);
  for (let i = 0; i < 6; i++) { const a = i * PI / 3; b.rod(P.steel, 0.008, [0.056, 0.38 + Math.cos(a) * 0.26, -0.95 + Math.sin(a) * 0.26], [0.056, 0.38 - Math.cos(a) * 0.26, -0.95 - Math.sin(a) * 0.26], 4); }
  for (const sx of [-1, 1]) { b.box(0.14, 0.03, 0.3, P.dark, sx * 0.17, 0.38, -0.6, 0.5); b.box(0.12, 0.012, 0.04, P.rubber, sx * 0.17, 0.5, -0.65, 0.5); }                  // foot plates and straps
  b.box(0.28, 0.07, 0.3, P.dark, 0, 0.29, 0.7); b.box(0.28, 0.05, 0.3, P.leather, 0, 0.36, 0.7); for (const sx of [-1, 1]) b.hc(0.02, 0.03, P.steel, sx * 0.1, 0.27, 0.7, 'x', 6);
  b.rod(P.steel, 0.012, [0, 0.38, -0.8], [0, 0.5, -0.4], 4); b.rod(P.steel, 0.018, [-0.22, 0.5, -0.4], [0.22, 0.5, -0.4], 6); for (const sx of [-1, 1]) b.cyl(0.02, 0.02, 0.1, P.rubber, sx * 0.2, 0.46, -0.4, 6, PI / 2, 0, 0);   // handle and cord
  b.rod(P.dark, 0.02, [0, 0.4, -0.95], [0, 0.85, -1.0], 8); b.box(0.2, 0.14, 0.04, P.dark, 0, 0.84, -0.98, -0.3); b.box(0.16, 0.09, 0.006, P.cyan, 0, 0.865, -0.955, -0.3);
  return one(b, 'rower', 'support', { box: [-0.3, 0.3, -1.2, 1.25], size: [0.6, 0.95, 2.45], seat: { x: 0, y: 0.4, z: 0.7, yaw: PI }, spots: [[0, 0.29, PI]], use: { mount: { x: 0.5, z: 0.4, ry: -PI / 2 } } });
}
function dumbbell_rack() {
  const P = mats(), b = new B();
  for (const sx of [-1, 1]) { b.box(0.05, 0.8, 0.46, P.body, sx * 0.58, 0.0, 0); b.box(0.07, 0.025, 0.5, P.dark, sx * 0.58, 0.0, 0); }
  const tiers = [[0.18, 0.06, 0.04], [0.44, 0.052, 0.038], [0.7, 0.045, 0.035]];
  for (const [y, hr, hl] of tiers) {
    b.box(1.16, 0.025, 0.4, P.steel, 0, y - 0.025, 0.02); b.box(1.16, 0.05, 0.015, P.dark, 0, y - 0.025, 0.225);
    for (let i = 0; i < 6; i++) { const x = -0.48 + i * 0.19; b.hc(0.011, 0.14, P.steel, x, y + hr, 0.02, 'z', 5); for (const sz of [-1, 1]) b.hc(hr, 0.05, P.dark, x, y + hr, 0.02 + sz * 0.08, 'z', 6); b.box(0.005, 0.005, 0.0, P.dark, x, y, 0); }
  }
  b.box(1.2, 0.03, 0.06, P.steel, 0, 0.8, -0.2);
  return one(b, 'dumbbell_rack', 'support', { top: 0.8, box: [-0.62, 0.62, -0.28, 0.28], size: [1.2, 0.8, 0.5], spots: [[0, 0.7, PI]], use: { take: { x: 0, z: 0.7, ry: PI } } });
}

// ================================================================ R-2 airlock doors (two 1.0 x 2.0 round-cornered doors 1.5 m apart, chamber between, gauge and lamps); fixture 2.5 wide
function airlock_doors() {
  const P = mats(), b = new B(), zs = [0.75, -0.75], W = 3.2;
  b.box(2.5, 0.02, 1.7, P.dark, 0, 0, 0); b.box(1.0, 0.004, 1.5, P.hazardTape, 0, 0.02, 0); b.box(0.9, 0.005, 1.5, P.diamond, 0, 0.022, 0);
  for (const z of zs) { b.box(0.75, W, 0.16, P.body, -0.875, 0, z); b.box(0.75, W, 0.16, P.body, 0.875, 0, z); b.box(1.0, W - 2.1, 0.16, P.body, 0, 2.1, z); b.box(1.04, 0.05, 0.19, P.yellow, 0, 2.05, z); b.box(0.05, 2.05, 0.19, P.yellow, -0.52, 0, z); b.box(0.05, 2.05, 0.19, P.yellow, 0.52, 0, z); }
  for (const sx of [-1, 1]) b.box(0.12, W, 1.5, P.body, sx * 1.0 + sx * 0.12 + 0.0, 0, 0);    // chamber side walls (outside the 1.0 m opening)
  b.box(2.5, 0.06, 1.5, P.dark, 0, 3.12, 0);
  // doors: slabs sit in the openings; the group `doors` has [inner, outer] nodes that slide along x
  const doors = [];
  zs.forEach((z, i) => {
    const d = new B();
    d.box(0.96, 2.0, 0.14, P.steel, 0, 0, 0); d.box(0.86, 1.9, 0.012, P.dark, 0, 0.05, i ? -0.077 : 0.077); d.cyl(0.14, 0.14, 0.03, P.dark, 0, 1.45, i ? -0.1 : 0.1, 16, PI / 2); d.cyl(0.11, 0.11, 0.032, P.canopy, 0, 1.45, i ? -0.1 : 0.1, 16, PI / 2);
    const s = i ? -1 : 1; d.tor(0.17, 0.017, P.yellow, 0, 1.0, s * 0.1, 0, 0, 0, 16, 5); for (let k = 0; k < 3; k++) d.rod(P.yellow, 0.01, [0, 1.0, s * 0.1], [Math.cos(k * 2.09) * 0.17, 1.0 + Math.sin(k * 2.09) * 0.17, s * 0.1], 5);
    d.box(0.05, 0.12, 0.05, P.dark, 0.35, 0.95, s * 0.1);
    const gr = d.done('door' + i); gr.position.set(0, 0, z + (i ? -0.0 : 0.0)); doors.push(gr);
  });
  for (const z of zs) { const s = z > 0 ? 1 : -1; b.box(0.08, 0.08, 0.02, P.redLit, -0.4, 2.2, z + s * 0.1); b.box(0.08, 0.08, 0.02, P.green, -0.28, 2.2, z + s * 0.1); b.cyl(0.07, 0.07, 0.03, P.dark, 0.4, 2.25, z + s * 0.1, 14, PI / 2); b.cyl(0.055, 0.055, 0.006, P.cream, 0.4, 2.25, z + s * 0.115, 14, PI / 2); b.box(0.006, 0.05, 0.004, P.red, 0.41, 2.26, z + s * 0.12, 0, 0, -0.5); }
  b.box(0.02, 0.5, 0.5, P.dark, 1.07, 1.2, 0); b.box(0.01, 0.4, 0.4, P.arcscreen, 1.07, 1.25, 0);
  b.box(0.02, 0.5, 0.5, P.dark, -1.07, 1.2, 0, 0, 0, 0);
  const g = new THREE.Group(); g.add(b.done('frame'), ...doors);
  return fin(g, 'airlock_doors', 'operations', { box: [-1.25, 1.25, -0.85, 0.85], size: [2.5, 3.2, 1.7], doors, slide: 0.9, use: { inner: { x: 0, z: 1.3, ry: PI }, outer: { x: 0, z: -1.3, ry: 0 }, chamber: { x: 0, z: 0 } }, note: 'doors[i].position.x = slide * open (0..1); both start closed' });
}

// ================================================================ R-3 bay space door (4.8 m two-leaf segmented door, hazard edging, field-emitter posts, status light bar); wall fixture, origin on the wall line
function bay_door() {
  const P = mats(), b = new B(), Wd = 4.8, H = 3.0;
  b.box(Wd + 0.4, 0.3, 0.3, P.dark, 0, H, 0.0); b.box(0.22, H, 0.3, P.dark, -Wd / 2 - 0.1, 0, 0); b.box(0.22, H, 0.3, P.dark, Wd / 2 + 0.1, 0, 0);       // frame
  for (const sx of [-1, 1]) {                                                                                                                              // leaves
    for (let i = 0; i < 6; i++) b.box(Wd / 2 - 0.04, H / 6 - 0.03, 0.12 + (i % 2) * 0.02, i % 2 ? P.body : P.steel, sx * (Wd / 4 + 0.01), i * H / 6 + 0.01, 0.0);
    for (const x of [0.5, 1.5]) b.box(0.08, H - 0.1, 0.05, P.dark, sx * x, 0.05, 0.08);
  }
  b.box(0.06, H, 0.16, P.rubber, 0, 0, 0.0);
  for (const sx of [-1, 1]) { b.box(0.22, H, 0.04, P.hazardTape, sx * (Wd / 2 + 0.1), 0, 0.17); b.box(Wd / 2, 0.14, 0.02, P.hazardTape, sx * (Wd / 4 + 0.01), 0.0, 0.08); }
  b.box(Wd + 0.4, 0.14, 0.04, P.hazardTape, 0, H - 0.14, 0.17);
  for (const sx of [-1, 1]) { b.cyl(0.07, 0.09, 1.7, P.steel, sx * (Wd / 2 - 0.15), 0.1, 0.28, 10); for (let i = 0; i < 4; i++) b.cyl(0.11, 0.11, 0.03, P.cyan, sx * (Wd / 2 - 0.15), 0.35 + i * 0.4, 0.28, 12); b.cyl(0.1, 0.07, 0.15, P.dark, sx * (Wd / 2 - 0.15), 1.8, 0.28, 10); }   // field emitter posts
  b.box(Wd - 0.5, 0.1, 0.05, P.dark, 0, 3.12, 0.16); for (let i = 0; i < 12; i++) b.box(0.3, 0.06, 0.02, i < 4 ? P.green : i < 8 ? P.amber : P.redLit, -Wd / 2 + 0.6 + i * 0.33, 3.13, 0.19);   // status bar above
  b.box(0.3, 0.4, 0.1, P.dark, Wd / 2 + 0.4, 1.2, 0.1); b.box(0.2, 0.12, 0.01, P.scanlcd, Wd / 2 + 0.4, 1.45, 0.155); b.box(0.06, 0.06, 0.012, P.redLit, Wd / 2 + 0.34, 1.3, 0.155); b.box(0.06, 0.06, 0.012, P.green, Wd / 2 + 0.46, 1.3, 0.155);
  return one(b, 'bay_door', 'flight', { size: [Wd + 0.4, 3.2, 0.3], use: { panel: { x: Wd / 2 + 0.4, z: 0.6, ry: PI } }, note: 'wall fixture: origin on the wall line, +z into the room, 5.2 m wide (spans two tiles)' });
}

// ================================================================ R-4 catwalk module (2.5 x 1.0 grated deck at 2.6 m on posts, 1.1 m rail with mid bar and toe board) and 60 degree ship ladder
function catwalk() {
  const P = mats(), b = new B(), y = 2.6;
  b.box(2.5, 0.05, 1.0, gm('grate', 5, 2), 0, y - 0.05, 0);
  for (const x of [-1.2, 1.2]) { for (const z of [-0.45, 0.45]) b.box(0.08, y - 0.05, 0.08, P.body, x, 0, z); b.box(0.06, 0.06, 1.0, P.dark, x, y - 0.12, 0); }
  b.box(2.5, 0.06, 0.06, P.dark, 0, y - 0.12, -0.45); b.box(2.5, 0.06, 0.06, P.dark, 0, y - 0.12, 0.45);
  for (const x of [-1.2, 1.2]) for (const z of [-0.45, 0.45]) b.beam(P.steel, 0.03, 0.03, [x, 1.2, z], [x * 0.9, y - 0.12, z * 0.55]);
  b.rod(P.steel, 0.02, [-1.2, 0.8, -0.45], [-1.2, 0.8, 0.45], 5);
  for (const sz of [-1, 1]) {                                                                                             // rails on both long edges
    for (const x of [-1.22, -0.6, 0, 0.6, 1.22]) b.box(0.04, 1.1, 0.04, P.yellow, x, y, sz * 0.48);
    b.rod(P.yellow, 0.022, [-1.22, y + 1.1, sz * 0.48], [1.22, y + 1.1, sz * 0.48], 8); b.rod(P.yellow, 0.016, [-1.22, y + 0.55, sz * 0.48], [1.22, y + 0.55, sz * 0.48], 6); b.box(2.5, 0.12, 0.012, P.yellow, 0, y, sz * 0.5);
  }
  return one(b, 'catwalk', 'engineering', { box: [-1.25, 1.25, -0.5, 0.5], size: [2.5, 3.7, 1.0], use: { deck: { x: 0, y, z: 0 } }, note: 'deck top 2.6 m: needs a taller room (TODO.md:97); modules tile along x' });
}
function ship_ladder() {
  const P = mats(), b = new B(), top = 2.6, run = top / Math.tan(1.047);   // 60 degrees
  for (const sx of [-1, 1]) b.beam(P.steel, 0.05, 0.03, [sx * 0.25, 0, run - 0.2], [sx * 0.25, top, -0.2]);
  const n = 9; for (let i = 0; i <= n; i++) { const t = (i + 0.5) / (n + 1); b.box(0.5, 0.05, 0.12, P.grate, 0, top * t - 0.025, run - 0.2 - (run * t), 0); }
  for (const sx of [-1, 1]) { b.rod(P.yellow, 0.02, [sx * 0.3, 0.95, run - 0.6], [sx * 0.3, top + 1.0, -0.2], 6); }
  return one(b, 'ship_ladder', 'engineering', { box: [-0.32, 0.32, -0.25, run], size: [0.6, top + 1.0, run + 0.2], use: { foot: { x: 0, z: run + 0.4, ry: PI }, top: { x: 0, y: top, z: -0.4 } }, note: 'top rail meets the catwalk edge at z -0.2' });
}

export const kinds = {
  briefing_table, platform_bed, workpod, maint_stand, cargo_pad, warpcore_detail, injector_crate, knee_mill, drill_press, scan_arch, specimen_tank,
  mat, grapple_dummy, sparring_set, galley_trolley, dryer, folding_table, linen_cart, pool_table, card_table, arcade, feedstock_silo,
  exercise_bike, rower, dumbbell_rack, airlock_doors, bay_door, catwalk, ship_ladder,
};
export const KIND_NAMES = Object.keys(kinds);
// asset-gaps id per kind (gallery labels, docs)
export const META = {
  briefing_table: 'CMD-2', platform_bed: 'CMD-3', workpod: 'FLT-8', maint_stand: 'FLT-9', cargo_pad: 'OPS-8', warpcore_detail: 'ENG-13', injector_crate: 'ENG-13', knee_mill: 'ENG-14', drill_press: 'ENG-14', scan_arch: 'SEC-6',
  specimen_tank: 'SCI-9', mat: 'SVC-11', grapple_dummy: 'SVC-11', sparring_set: 'SVC-11', galley_trolley: 'SVC-14', dryer: 'SVC-15', folding_table: 'SVC-15', linen_cart: 'SVC-15', pool_table: 'SVC-16', card_table: 'SVC-16', arcade: 'SVC-16',
  feedstock_silo: 'SVC-17', exercise_bike: 'SVC-18', rower: 'SVC-18', dumbbell_rack: 'SVC-18', airlock_doors: 'R-2', bay_door: 'R-3', catwalk: 'R-4', ship_ladder: 'R-4',
};
