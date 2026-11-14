// propart-galley.js — batch 2 (galley and lounge) prop art: range with hood, servery counter, bar + stools + back bar, waste bin, dishwasher line.
// Contract (docs/asset-gaps.md section 12): `export const kinds = { name: (m, h) => THREE.Group }`.
//   m = the world material set from js/world.js (optional: everything here uses its own shared materials so it also works standalone, e.g. in viewer-galley.html)
//   h = optional helper bag (unused)
// Conventions as js/world.js buildProp: origin at the floor centre of a TS (2.5 m) tile, front faces +z, shared materials, no per-call material creation.
// Every kind is baked to one mesh per material (few draw calls). Per-kind userData (see docs/propart-galley.md):
//   top      height of the usable surface (m)
//   box      [x0, x1, z0, z1] footprint rectangle (the form EQUIPMENT.*.box uses)
//   spots    [[x, z, ry], ...]  EQUIPMENT-style standing/seat offsets (ry = facing, PI faces -z, i.e. toward the prop's back)
//   seat     seat height for stance 'sit' (bar: 0.75)
//   use      named use points, each { x, z, ry }
//   tris     triangle count
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PI = Math.PI, HAS_DOM = typeof document !== 'undefined';

// ------------------------------------------------------------------ caches and generated textures
const GEO = new Map(), TEX = new Map(); let MATS = null;
const geo = (k, f) => { let g = GEO.get(k); if (!g) { g = f(); GEO.set(k, g); } return g; };
function canvasTex(key, w, h, draw) {
  if (!HAS_DOM) return null; if (TEX.has(key)) return TEX.get(key);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d'); draw(c, w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.wrapS = t.wrapT = THREE.RepeatWrapping; TEX.set(key, t); return t;
}
const rnd = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const texBrushed = () => canvasTex('gl_brushed', 256, 256, (c, w, h) => {   // satin stainless: long horizontal grain
  c.fillStyle = '#d6d9dc'; c.fillRect(0, 0, w, h); const r = rnd(11);
  for (let i = 0; i < 700; i++) { const y = r() * h, l = 40 + r() * 200, x = r() * w, a = r() * 0.14; c.fillStyle = r() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(60,66,74,${a})`; c.fillRect(x, y, l, 1); if (x + l > w) c.fillRect(x - w, y, l, 1); }
});
const texWood = () => canvasTex('gl_wood', 256, 256, (c, w, h) => {   // walnut veneer, grain runs along u
  c.fillStyle = '#8a5a3a'; c.fillRect(0, 0, w, h); const r = rnd(5);
  for (let i = 0; i < 90; i++) { const y = r() * h, th = 1 + r() * 4; c.fillStyle = `rgba(${r() < 0.5 ? '50,26,12' : '170,116,76'},${0.1 + r() * 0.2})`; c.beginPath(); c.moveTo(0, y); for (let x = 0; x <= w; x += 16) c.lineTo(x, y + Math.sin(x * 0.03 + i) * 3 + (r() - 0.5) * 1.5); c.lineTo(w, y + th); c.lineTo(0, y + th); c.fill(); }
});
const texSlats = () => canvasTex('gl_slats', 256, 128, (c, w, h) => {   // dark vertical slat panelling for the bar front
  c.fillStyle = '#2c241f'; c.fillRect(0, 0, w, h); const r = rnd(9);
  for (let x = 0; x < w; x += 16) { c.fillStyle = `rgb(${52 + (r() * 22 | 0)},${38 + (r() * 14 | 0)},${28 + (r() * 10 | 0)})`; c.fillRect(x + 1, 0, 14, h); c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x, 0, 1, h); c.fillStyle = 'rgba(255,200,150,0.08)'; c.fillRect(x + 2, 0, 2, h); }
});
const texHob = () => canvasTex('gl_hob', 576, 512, (c, w, h) => {   // induction top: six zone rings, canvas x = +x, canvas y = +z (front)
  c.fillStyle = '#16181c'; c.fillRect(0, 0, w, h);
  const z = [[-0.285, -0.19], [0, -0.19], [0.285, -0.19], [-0.285, 0.17], [0, 0.17], [0.285, 0.17]];
  z.forEach(([x, y], i) => {
    const cx = (x / 0.9 + 0.5) * w, cy = (y / 0.8 + 0.5) * h, lit = i === 0 || i === 5;
    c.lineWidth = 5; c.strokeStyle = lit ? '#ff6a2a' : '#4a4f58'; c.beginPath(); c.arc(cx, cy, 70, 0, 7); c.stroke();
    c.lineWidth = 3; c.strokeStyle = lit ? '#ff9a50' : '#30343b'; c.beginPath(); c.arc(cx, cy, 44, 0, 7); c.stroke(); c.beginPath(); c.arc(cx, cy, 20, 0, 7); c.stroke();
    c.fillStyle = lit ? '#ff9a50' : '#3a3f48'; c.fillRect(cx - 2, cy + 76, 4, 10);
  });
  c.strokeStyle = '#2a2d33'; c.lineWidth = 3; c.strokeRect(8, 8, w - 16, h - 16);
});
const texLevels = () => canvasTex('gl_levels', 128, 32, (c, w, h) => { c.fillStyle = '#05100c'; c.fillRect(0, 0, w, h); for (let i = 0; i < 6; i++) { c.fillStyle = i < 4 ? '#38ff8c' : '#16412a'; c.fillRect(8 + i * 19, 8, 14, 16); } });

function mats() {
  if (MATS) return MATS; const S = (o) => new THREE.MeshStandardMaterial(o);
  const glow = (c, i = 1.6) => S({ color: new THREE.Color(c).multiplyScalar(0.25), emissive: c, emissiveIntensity: i, roughness: 0.4 });
  return MATS = {
    ss: S({ color: 0xffffff, map: texBrushed(), metalness: 0.85, roughness: 0.36 }), ss2: S({ color: 0x9aa0a6, metalness: 0.85, roughness: 0.42 }),
    dark: S({ color: 0x23262c, metalness: 0.45, roughness: 0.5 }), black: S({ color: 0x0d0e11, roughness: 0.55 }), rubber: S({ color: 0x131417, roughness: 0.92 }),
    hob: S({ color: 0xffffff, map: texHob(), roughness: 0.12, metalness: 0.2 }),
    glass: S({ color: 0xc8e8f0, roughness: 0.04, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
    smoked: S({ color: 0x14181c, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85 }),
    wood: S({ color: 0xffffff, map: texWood(), roughness: 0.42 }), slats: S({ color: 0xffffff, map: texSlats(), roughness: 0.6 }),
    leather: S({ color: 0x7a2e2a, roughness: 0.55 }), brass: S({ color: 0xc9a24a, metalness: 0.9, roughness: 0.28 }), chrome: S({ color: 0xe4e8ec, metalness: 1, roughness: 0.12 }),
    white: S({ color: 0xe9edef, roughness: 0.4 }), plate: S({ color: 0xf2f4f2, roughness: 0.25 }), tray: S({ color: 0x4d7f94, roughness: 0.5 }), rack: S({ color: 0x6d8fa0, roughness: 0.6 }),
    binlid: S({ color: 0x2f3a44, roughness: 0.45 }), green: S({ color: 0x3c8a4e, roughness: 0.5 }),
    mirror: S({ color: 0x8fa4ae, metalness: 1, roughness: 0.06 }),
    food1: S({ color: 0x7a4a22, roughness: 0.7 }), food2: S({ color: 0x5f9a3a, roughness: 0.7 }), food3: S({ color: 0xe2d4a2, roughness: 0.7 }), sauce: S({ color: 0xb0452a, roughness: 0.4 }),
    bAmber: S({ color: 0x8a4a12, roughness: 0.12, transparent: true, opacity: 0.88 }), bGreen: S({ color: 0x1f5a34, roughness: 0.12, transparent: true, opacity: 0.88 }),
    bClear: S({ color: 0xcfe4ec, roughness: 0.08, transparent: true, opacity: 0.5, depthWrite: false }), bBlue: S({ color: 0x244f8a, roughness: 0.12, transparent: true, opacity: 0.88 }), bRed: S({ color: 0x8a2a24, roughness: 0.12, transparent: true, opacity: 0.88 }),
    levels: S({ color: 0x050608, map: texLevels(), emissiveMap: texLevels(), emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.3 }),
    gAmber: glow(0xffa21a), gRed: glow(0xff3c2a), gGreen: glow(0x38ff8c, 1.4), gCyan: glow(0x30d4ff), gWhite: glow(0xfff2d0, 2.0),
    cA: S({ color: 0xd8942a, roughness: 0.4 }), cT: S({ color: 0x2b9c98, roughness: 0.4 }), cR: S({ color: 0xc4382e, roughness: 0.4 }),
  };
}

// ------------------------------------------------------------------ geometry helpers (B and C take the FLOOR-side y; tube/sph are centred)
const mesh = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; };
const B = (w, h, d, m, x = 0, y = 0, z = 0, r = 0.008) => { r = Math.min(r, w / 2.02, h / 2.02, d / 2.02); return mesh(geo(`b${w}|${h}|${d}|${r}`, () => r < 0.002 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 1, r)), m, x, y + h / 2, z); };
const C = (rt, rb, h, m, x = 0, y = 0, z = 0, seg = 14) => mesh(geo(`c${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), m, x, y + h / 2, z);
const tube = (axis, len, r, m, x, y, z, seg = 8) => { const o = mesh(geo(`c${r}|${r}|${len}|${seg}`, () => new THREE.CylinderGeometry(r, r, len, seg)), m, x, y, z); if (axis === 'x') o.rotation.z = PI / 2; else if (axis === 'z') o.rotation.x = PI / 2; return o; };
const L = (key, pts, m, x = 0, y = 0, z = 0, seg = 14) => mesh(geo(`l${key}|${seg}`, () => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg)), m, x, y, z);
const T = (R, r, m, x, y, z, arc = PI * 2, rs = 4, ts = 12) => mesh(geo(`t${R}|${r}|${arc}|${rs}|${ts}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc)), m, x, y, z);
const grp = (...c) => { const g = new THREE.Group(); c.forEach(o => g.add(o)); return g; };
const rot = (o, x = 0, y = 0, z = 0) => { o.rotation.set(x, y, z); return o; };

// merge every mesh of a prop into one mesh per material (world transforms baked in): a handful of draw calls per prop instance
const _a = [];
function bake(g, ud = {}) {
  g.updateMatrixWorld(true); const by = new Map();
  g.traverse(o => { if (!o.isMesh) return; let gg = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); gg.applyMatrix4(o.matrixWorld); for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gg.deleteAttribute(k); (by.get(o.material) || by.set(o.material, []).get(o.material)).push(gg); });
  const out = new THREE.Group(); let tris = 0;
  for (const [m, list] of by) { const mg = list.length > 1 ? mergeGeometries(list, false) : list[0]; const me = new THREE.Mesh(mg, m); me.castShadow = !m.transparent; me.receiveShadow = true; out.add(me); tris += mg.attributes.position.count / 3; }
  Object.assign(out.userData, ud, { tris: Math.round(tris) }); return out;
}

// ------------------------------------------------------------------ small dressing shared by several kinds (local, simple lathes)
const bottleGeo = (k) => ({
  wine: [[0.001, 0], [0.034, 0], [0.036, 0.01], [0.036, 0.16], [0.03, 0.2], [0.014, 0.23], [0.014, 0.29], [0.001, 0.29]],
  spirit: [[0.001, 0], [0.04, 0], [0.042, 0.01], [0.042, 0.15], [0.036, 0.19], [0.016, 0.21], [0.016, 0.25], [0.001, 0.25]],
  flask: [[0.001, 0], [0.03, 0], [0.032, 0.008], [0.032, 0.12], [0.012, 0.17], [0.012, 0.2], [0.001, 0.2]],
})[k];
function bottle(M, kind, mat, x, y, z) { return L('bt' + kind, bottleGeo(kind), mat, x, y, z, 8); }
const GLASS_PTS = [[0.001, 0], [0.026, 0], [0.03, 0.002], [0.036, 0.1], [0.033, 0.1], [0.026, 0.008], [0.001, 0.008]];
const glassAt = (M, x, y, z) => L('gl', GLASS_PTS, M.glass, x, y, z, 8);

// ------------------------------------------------------------------ SVC-1 range (+ canopy hood)
function buildRange(withHood) {
  const M = mats(), g = new THREE.Group();
  g.add(B(0.84, 0.1, 0.7, M.dark, 0, 0, -0.01, 0.004));                                  // plinth, set back 0.05 at the front
  g.add(B(0.9, 0.76, 0.8, M.ss, 0, 0.1, 0, 0.012));                                      // body
  g.add(B(0.9, 0.04, 0.8, M.hob, 0, 0.86, 0, 0.008));                                    // glass-ceramic top 0.90 m
  g.add(B(0.9, 0.16, 0.07, M.ss, 0, 0.9, -0.365, 0.01)); g.add(B(0.92, 0.02, 0.1, M.ss2, 0, 1.06, -0.36, 0.006));   // rear riser and its cap
  // front pot rail: a tube across the front of the top on two posts
  for (const sx of [-1, 1]) g.add(C(0.012, 0.012, 0.075, M.ss2, sx * 0.43, 0.9, 0.37, 8));
  g.add(tube('x', 0.88, 0.013, M.chrome, 0, 0.972, 0.37, 8));
  // control fascia and knobs
  g.add(B(0.86, 0.12, 0.02, M.dark, 0, 0.72, 0.405, 0.006));
  for (let i = 0; i < 6; i++) { const x = -0.355 + i * 0.142; g.add(rot(C(0.024, 0.028, 0.036, M.black, x, 0.775, 0.43, 12), PI / 2, 0, 0).translateY(0)); g.add(B(0.006, 0.02, 0.006, M.ss2, x, 0.785, 0.452, 0.001)); g.add(B(0.012, 0.005, 0.004, i === 0 || i === 5 ? M.gAmber : M.gGreen, x, 0.835, 0.416, 0.001)); }
  // two oven doors, each with a tubular handle on stand-offs and a smoked window
  for (const sx of [-1, 1]) {
    const x = sx * 0.2; g.add(B(0.4, 0.58, 0.04, M.ss, x, 0.12, 0.39, 0.01)); g.add(B(0.28, 0.24, 0.006, M.smoked, x, 0.27, 0.412, 0.002));
    g.add(tube('x', 0.32, 0.013, M.chrome, x, 0.63, 0.47, 8)); for (const k of [-1, 1]) g.add(tube('z', 0.06, 0.008, M.chrome, x + k * 0.14, 0.63, 0.44, 6));
  }
  g.add(B(0.02, 0.58, 0.04, M.dark, 0, 0.12, 0.39, 0.002));
  // a stock pot (0.40 x 0.35) over the rear-left zones and a frying pan on the front-right zone, both stainless
  const pot = grp(L('rpot', [[0.001, 0], [0.19, 0], [0.2, 0.012], [0.2, 0.34], [0.206, 0.346], [0.206, 0.354], [0.194, 0.354], [0.194, 0.02], [0.001, 0.02]], M.ss2, 0, 0, 0, 20),
    L('rplid', [[0.001, 0.4], [0.03, 0.396], [0.14, 0.382], [0.2, 0.358], [0.212, 0.35], [0.19, 0.345]], M.ss2, 0, 0, 0, 20), C(0.014, 0.018, 0.026, M.rubber, 0, 0.4, 0, 8), T(0.04, 0.009, M.ss2, 0.222, 0.28, 0, PI, 4, 8).rotateZ(-PI / 2), T(0.04, 0.009, M.ss2, -0.222, 0.28, 0, PI, 4, 8).rotateZ(PI / 2));
  pot.position.set(-0.22, 0.9, -0.17); g.add(pot);
  const pan = grp(L('rpan', [[0.001, 0], [0.108, 0], [0.13, 0.01], [0.148, 0.045], [0.152, 0.05], [0.147, 0.05], [0.126, 0.018], [0.108, 0.008], [0.001, 0.008]], M.dark, 0, 0, 0, 18), C(0.0105, 0.0105, 0.22, M.rubber, 0, 0.0, 0, 8));
  pan.children[1].rotation.z = PI / 2; pan.children[1].position.set(0.26, 0.03, 0); pan.position.set(0.285, 0.9, 0.17); pan.rotation.y = 0.35; g.add(pan);
  if (withHood) {   // stainless canopy 1.0 x 0.9 m at 2.0 m, two baffle filters, light strip, duct to the 3.2 m ceiling
    g.add(B(1.0, 0.2, 0.9, M.ss, 0, 2.0, 0, 0.012)); g.add(B(0.9, 0.012, 0.8, M.dark, 0, 1.998, 0, 0.002));
    for (const sx of [-1, 1]) { g.add(B(0.4, 0.016, 0.62, M.ss2, sx * 0.215, 1.986, 0.0, 0.004)); for (let i = 0; i < 6; i++) g.add(B(0.4, 0.008, 0.012, M.dark, sx * 0.215, 1.97, -0.25 + i * 0.1, 0.002)); }
    g.add(B(0.8, 0.012, 0.04, M.gWhite, 0, 1.995, 0.38, 0.002));
    const fr = mesh(geo('hoodfr', () => new THREE.CylinderGeometry(0.2, 0.707, 0.38, 4, 1).rotateY(PI / 4)), M.ss, 0, 2.39, 0); fr.scale.z = 0.9; g.add(fr);
    g.add(B(0.28, 0.63, 0.28, M.ss, 0, 2.57, 0, 0.008)); g.add(B(0.34, 0.03, 0.34, M.ss2, 0, 3.17, 0, 0.004));
  }
  return bake(g, { top: 0.9, box: [-0.45, 0.45, -0.4, 0.4], use: { cook: { x: 0, z: 0.62, ry: PI } }, spots: [[0, 0.62, PI]], size: [0.9, withHood ? 3.2 : 1.07, 0.8] });
}

// ------------------------------------------------------------------ SVC-2 servery counter (hot pass): 2.2 x 0.8 m, top 1.0 m, sneeze guard, tray rail, plates and trays
function buildServery() {
  const M = mats(), g = new THREE.Group();
  g.add(B(2.12, 0.08, 0.7, M.dark, 0, 0, 0, 0.004));
  g.add(B(2.2, 0.86, 0.78, M.ss, 0, 0.08, 0, 0.012)); g.add(B(2.2, 0.06, 0.8, M.ss, 0, 0.94, 0, 0.012));        // body and top slab: working top 1.0 m
  // diner-side doors with bar pulls, and a staff-side rear lip
  for (let i = 0; i < 3; i++) { const x = -0.74 + i * 0.74; g.add(B(0.68, 0.64, 0.012, M.ss2, x, 0.2, 0.392, 0.004)); g.add(tube('x', 0.2, 0.01, M.chrome, x, 0.7, 0.425, 6)); for (const k of [-1, 1]) g.add(tube('z', 0.03, 0.006, M.chrome, x + k * 0.09, 0.7, 0.405, 5)); }
  g.add(B(2.2, 0.025, 0.04, M.ss2, 0, 1.0, -0.38, 0.005));
  // three inset wells: two lidded, the middle one open with food and a spoon
  const wx = [-0.8, -0.24, 0.32];
  wx.forEach((x, i) => {
    g.add(B(0.56, 0.006, 0.44, M.black, x, 1.0, 0.0, 0.002));
    if (i === 1) { g.add(B(0.5, 0.04, 0.38, M.ss2, x, 0.999, 0, 0.004)); g.add(B(0.46, 0.012, 0.34, M.food1, x, 1.018, 0, 0.004)); g.add(B(0.2, 0.014, 0.15, M.food2, x - 0.1, 1.026, 0.0, 0.006)); g.add(tube('x', 0.26, 0.007, M.chrome, x, 1.05, 0.12, 6).rotateZ(0.12)); }
    else { g.add(B(0.54, 0.028, 0.42, M.ss, x, 1.0, 0, 0.008)); g.add(B(0.22, 0.014, 0.035, M.chrome, x, 1.028, 0.17, 0.004)); }
  });
  // plate stack (right end of the top) and a tray stack on the rails
  for (let i = 0; i < 6; i++) g.add(C(0.125, 0.11, 0.02, M.plate, 0.82, 1.0 + i * 0.021, -0.05, 16));
  for (let i = 0; i < 5; i++) g.add(B(0.44, 0.02, 0.32, M.tray, 0.84, 0.885 + i * 0.022, 0.5, 0.01));
  // three-bar tray rail on the diner side, on four brackets
  for (const z of [0.46, 0.54, 0.62]) g.add(tube('x', 2.2, 0.013, M.chrome, 0, 0.87, z, 8));
  for (const x of [-1.0, -0.34, 0.34, 1.0]) { g.add(B(0.05, 0.05, 0.25, M.ss2, x, 0.82, 0.5, 0.004)); }
  // sneeze guard: three posts, a top rail, a sloping glass roof and a vertical front lip over the wells
  const gx = [-1.07, -0.24, 0.6];
  for (const x of gx) g.add(C(0.014, 0.014, 0.44, M.chrome, x, 1.0, -0.32, 8));
  g.add(tube('x', 1.68, 0.014, M.chrome, -0.235, 1.44, -0.32, 8));
  const roof = B(1.66, 0.012, 0.46, M.glass, -0.235, 1.375, -0.07, 0.002); roof.rotation.x = 0.28; roof.position.y = 1.36; g.add(roof);
  g.add(B(1.66, 0.14, 0.012, M.glass, -0.235, 1.17, 0.14, 0.002)); g.add(tube('x', 1.68, 0.01, M.chrome, -0.235, 1.168, 0.14, 6)); g.add(tube('x', 1.66, 0.012, M.gAmber, -0.235, 1.4, -0.12, 6));   // heat lamp bar under the roof
  for (const x of gx) { g.add(tube('z', 0.4, 0.008, M.chrome, x, 1.36, -0.07, 6).rotateX(0)); }
  return bake(g, { top: 1.0, box: [-1.1, 1.1, -0.4, 0.4], use: { staff: { x: -0.24, z: -0.7, ry: 0 }, diner: { x: -0.24, z: 0.95, ry: PI } }, spots: [[-0.24, -0.7, 0]], size: [2.2, 1.45, 0.8] });
}

// ------------------------------------------------------------------ SVC-3 bar stool and bar
const stoolParts = (M, g, x, z) => {   // seat top 0.75 m, deck-bolted base plate, post, foot ring
  g.add(C(0.2, 0.22, 0.02, M.ss2, x, 0, z, 18)); for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; g.add(C(0.012, 0.012, 0.008, M.chrome, x + Math.cos(a) * 0.17, 0.02, z + Math.sin(a) * 0.17, 6)); }
  g.add(C(0.03, 0.036, 0.64, M.chrome, x, 0.02, z, 12)); g.add(C(0.045, 0.045, 0.04, M.dark, x, 0.64, z, 12));
  g.add(T(0.17, 0.012, M.chrome, x, 0.27, z, PI * 2, 5, 20).rotateX(PI / 2));
  for (let i = 0; i < 3; i++) { const a = i * 2 * PI / 3 + 0.5; const s = tube('x', 0.14, 0.008, M.chrome, x + Math.cos(a) * 0.085, 0.27, z + Math.sin(a) * 0.085, 6); s.rotation.set(0, -a, PI / 2); s.rotation.order = 'YXZ'; g.add(s); }
  g.add(L('seat', [[0.001, 0.68], [0.17, 0.68], [0.19, 0.695], [0.192, 0.725], [0.17, 0.746], [0.1, 0.752], [0.001, 0.75]], M.leather, x, 0, z, 18)); g.add(C(0.178, 0.178, 0.012, M.dark, x, 0.672, z, 18));
};
function buildStool() { const M = mats(), g = new THREE.Group(); stoolParts(M, g, 0, 0); return bake(g, { top: 0.75, seat: 0.75, box: [-0.22, 0.22, -0.22, 0.22], size: [0.44, 0.75, 0.44] }); }

function buildBar(withStools) {
  const M = mats(), g = new THREE.Group();
  g.add(B(2.18, 0.08, 0.3, M.dark, 0, 0, -0.1, 0.004));                                    // recessed kick
  g.add(B(2.2, 0.92, 0.34, M.slats, 0, 0.08, -0.12, 0.008));                              // front panel body (z -0.29 .. 0.05)
  g.add(B(2.2, 0.05, 0.6, M.wood, 0, 1.0, 0, 0.012));                                      // 0.60 deep top at 1.05 m: 0.25 overhang toward +z
  g.add(B(2.2, 0.025, 0.04, M.brass, 0, 0.975, 0.28, 0.006));                              // brass edge under the overhang
  g.add(tube('x', 2.2, 0.03, M.leather, 0, 1.065, 0.265, 10));                              // padded arm rail along the customer edge
  g.add(B(0.02, 0.92, 0.36, M.ss2, -1.09, 0.08, -0.12, 0.004)); g.add(B(0.02, 0.92, 0.36, M.ss2, 1.09, 0.08, -0.12, 0.004));   // end trim (tiles in a row)
  // foot rail at 0.22 m, 0.11 m out from the panel, on three brackets
  g.add(tube('x', 2.14, 0.026, M.brass, 0, 0.22, 0.17, 10)); for (const x of [-0.95, 0, 0.95]) g.add(tube('z', 0.12, 0.012, M.brass, x, 0.22, 0.11, 6));
  // service well and tap tower at the right-hand end, drip tray with grille
  g.add(B(0.5, 0.02, 0.2, M.ss2, 0.55, 1.05, 0.12, 0.004)); for (let i = 0; i < 6; i++) g.add(B(0.4, 0.006, 0.012, M.dark, 0.55, 1.07, 0.06 + i * 0.03, 0.001));
  g.add(B(0.3, 0.025, 0.14, M.chrome, 0.55, 1.05, -0.05, 0.005)); g.add(C(0.04, 0.045, 0.34, M.chrome, 0.55, 1.075, -0.05, 14)); g.add(C(0.055, 0.04, 0.05, M.chrome, 0.55, 1.41, -0.05, 14));
  g.add(tube('z', 0.14, 0.012, M.chrome, 0.55, 1.35, 0.03, 6));
  for (const [dx, mm] of [[-0.11, M.cA], [0, M.cT], [0.11, M.cR]]) { g.add(tube('z', 0.06, 0.012, M.chrome, 0.55 + dx, 1.3, 0.0, 6)); g.add(B(0.032, 0.12, 0.03, mm, 0.55 + dx, 1.31, 0.05, 0.01)); }
  // bar top dressing: a bottle, two glasses, a coaster pair
  g.add(bottle(M, 'wine', M.bGreen, -0.7, 1.05, 0.0)); g.add(glassAt(M, -0.3, 1.05, 0.12)); g.add(glassAt(M, -0.12, 1.05, 0.04)); g.add(C(0.05, 0.05, 0.004, M.dark, -0.3, 1.05, 0.12, 12)); g.add(C(0.05, 0.05, 0.004, M.dark, -0.12, 1.05, 0.04, 12));
  if (withStools) for (const x of [-0.7, 0, 0.7]) stoolParts(M, g, x, 0.55);
  const seats = [-0.7, 0, 0.7].map(x => ({ x, z: 0.55, ry: PI, seat: 0.75 }));
  return bake(g, { top: 1.05, box: [-1.1, 1.1, -0.3, 0.3], seat: 0.75, spots: seats.map(s => [s.x, s.z, PI]), use: { seats, tap: { x: 0.55, z: 0.45, ry: PI } }, size: [2.2, 1.46, withStools ? 0.77 : 0.6] });
}

// back bar: wall unit for behind the counter, 2.2 x 0.4 m, 2.0 m high, mirror, two lit shelves of bottles and glasses
function buildBarBack() {
  const M = mats(), g = new THREE.Group(), r = rnd(3);
  g.add(B(2.2, 0.9, 0.5, M.slats, 0, 0, 0, 0.008)); g.add(B(2.24, 0.04, 0.54, M.wood, 0, 0.9, 0, 0.01));
  g.add(B(2.2, 1.1, 0.04, M.mirror, 0, 0.94, -0.23, 0.004)); g.add(B(2.2, 0.05, 0.4, M.wood, 0, 1.94, -0.08, 0.008));
  for (const x of [-1.1, 1.1]) g.add(B(0.04, 1.1, 0.3, M.wood, x, 0.94, -0.1, 0.006));
  const shelves = [1.3, 1.65];
  shelves.forEach((y, si) => {
    g.add(B(2.1, 0.025, 0.26, M.glass, 0, y, -0.1, 0.004)); g.add(B(2.1, 0.01, 0.02, M.gAmber, 0, y - 0.02, 0.02, 0.002));
    const bs = [M.bAmber, M.bGreen, M.bClear, M.bBlue, M.bRed], ks = ['wine', 'spirit', 'flask'];
    for (let i = 0; i < 17; i++) { const x = -1.0 + i * 0.125 + (r() - 0.5) * 0.02; if (si === 0 && i % 4 === 3) { for (let k = 0; k < 2; k++) g.add(glassAt(M, x + k * 0.04, y + 0.025, -0.05 - k * 0.05)); } else g.add(bottle(M, ks[(i + si) % 3], bs[(i * 3 + si * 2) % 5], x, y + 0.025, -0.1 + (r() - 0.5) * 0.04)); }
  });
  for (let i = 0; i < 14; i++) g.add(glassAt(M, -0.96 + i * 0.07 + (i > 6 ? 0.35 : 0), 0.94, 0.04 + (i % 2) * 0.07));
  return bake(g, { top: 0.94, box: [-1.1, 1.1, -0.25, 0.25], size: [2.24, 1.99, 0.54] });
}

// ------------------------------------------------------------------ SVC-12 pedal bin (20 L): 0.30 m dia x 0.45 m with domed lid
function buildBin() {
  const M = mats(), g = new THREE.Group();
  g.add(L('bin', [[0.001, 0.0], [0.13, 0.0], [0.14, 0.02], [0.15, 0.04], [0.15, 0.36], [0.152, 0.38], [0.001, 0.38]], M.ss, 0, 0, 0, 20)); g.add(C(0.14, 0.14, 0.03, M.rubber, 0, 0, 0, 20));
  g.add(L('binlid', [[0.001, 0.46], [0.07, 0.455], [0.13, 0.43], [0.158, 0.395], [0.158, 0.378], [0.001, 0.378]], M.binlid, 0, 0, 0, 20)); g.add(C(0.02, 0.02, 0.012, M.dark, 0, 0.46, 0, 8));
  g.add(C(0.05, 0.05, 0.03, M.dark, 0, 0.35, -0.155, 8).rotateX(PI / 2)); g.add(T(0.151, 0.008, M.dark, 0, 0.375, 0, PI * 2, 4, 20).rotateX(PI / 2));   // rear hinge, rim ring
  g.add(B(0.12, 0.016, 0.1, M.rubber, 0, 0.02, 0.19, 0.005)); g.add(B(0.02, 0.02, 0.1, M.dark, 0, 0.03, 0.15, 0.003));                                    // pedal and arm
  g.add(B(0.1, 0.012, 0.02, M.green, 0, 0.3, 0.151, 0.004));                                                                                             // recycling stripe
  return bake(g, { top: 0.46, box: [-0.17, 0.17, -0.17, 0.17], use: { drop: { x: 0, z: 0.5, ry: PI } }, size: [0.31, 0.46, 0.38] });
}

// ------------------------------------------------------------------ SVC-13 pass-through hood dishwasher: inlet table (sink, pre-rinse spray, loaded rack) | machine | exit table
function buildDishwasher() {
  const M = mats(), g = new THREE.Group(), D = 0.75;
  const table = (x0, x1) => { const w = x1 - x0, cx = (x0 + x1) / 2; g.add(B(w, 0.04, D, M.ss, cx, 0.82, 0, 0.008)); g.add(B(w - 0.1, 0.02, D - 0.1, M.ss2, cx, 0.22, 0, 0.004)); for (const sx of [x0 + 0.04, x1 - 0.04]) for (const sz of [-1, 1]) g.add(C(0.025, 0.025, 0.82, M.ss2, sx, 0, sz * 0.32, 8)); g.add(B(w, 0.06, 0.02, M.ss, cx, 0.86, -D / 2 + 0.01, 0.004)); };
  table(-1.15, -0.25); table(0.45, 1.0);
  // sink bowl and pre-rinse
  g.add(B(0.34, 0.006, 0.5, M.black, -1.0, 0.86, 0.04, 0.002)); g.add(B(0.36, 0.014, 0.52, M.ss2, -1.0, 0.845, 0.04, 0.004));
  g.add(C(0.018, 0.018, 0.64, M.chrome, -1.08, 0.86, -0.3, 10)); g.add(T(0.07, 0.016, M.chrome, -1.01, 1.5, -0.3, PI, 5, 10)); g.add(C(0.016, 0.016, 0.06, M.chrome, -0.94, 1.44, -0.3, 8));
  g.add(C(0.012, 0.012, 0.3, M.ss2, -0.94, 1.14, -0.3, 6)); for (let i = 0; i < 8; i++) g.add(T(0.014, 0.003, M.ss2, -0.94, 1.17 + i * 0.033, -0.3, PI * 2, 3, 6).rotateX(PI / 2));
  g.add(C(0.022, 0.016, 0.14, M.rubber, -0.94, 1.0, -0.3, 8)); g.add(C(0.032, 0.022, 0.04, M.chrome, -0.94, 0.96, -0.3, 8)); g.add(B(0.02, 0.05, 0.02, M.cR, -0.94, 1.05, -0.275, 0.004));
  g.add(B(0.18, 0.02, 0.05, M.chrome, -1.08, 0.86, -0.3 + 0.07, 0.004));
  // 0.5 m square rack of plates on the inlet table
  const rx = -0.6, rz = 0.0; g.add(B(0.5, 0.025, 0.5, M.rack, rx, 0.86, rz, 0.004));
  for (const sx of [-1, 1]) g.add(B(0.012, 0.045, 0.5, M.rack, rx + sx * 0.244, 0.885, rz, 0.003)); for (const sz of [-1, 1]) g.add(B(0.5, 0.045, 0.012, M.rack, rx, 0.885, rz + sz * 0.244, 0.003));
  for (let i = 0; i < 9; i++) { const o = C(0.115, 0.115, 0.012, M.plate, rx, 0.99, rz - 0.2 + i * 0.05, 14); o.rotation.x = PI / 2; o.position.y = 0.985; g.add(o); }
  // exit table: an empty rack and a stack of clean plates
  g.add(B(0.5, 0.025, 0.5, M.rack, 0.74, 0.86, 0.0, 0.004)); for (let i = 0; i < 6; i++) g.add(C(0.115, 0.105, 0.016, M.plate, 0.82, 0.885 + i * 0.017, 0.0, 16));
  // machine: tank cabinet, hood with tunnel openings and curtains, side lift handle, control panel, vent
  g.add(B(0.7, 0.62, D, M.ss, 0.1, 0.22, 0, 0.012)); g.add(B(0.66, 0.2, D - 0.06, M.ss2, 0.1, 0.02, 0, 0.006));
  g.add(B(0.7, 0.66, D, M.ss, 0.1, 0.84, 0, 0.014));
  for (const sx of [-1, 1]) { g.add(B(0.012, 0.3, 0.55, M.black, 0.1 + sx * 0.356, 0.86, 0, 0.002)); for (let i = 0; i < 9; i++) g.add(B(0.008, 0.3, 0.05, M.rubber, 0.1 + sx * 0.364, 0.86, -0.25 + i * 0.062, 0.002)); }
  g.add(tube('x', 0.34, 0.014, M.chrome, 0.1, 1.35, 0.42, 8)); for (const k of [-1, 1]) g.add(tube('z', 0.05, 0.009, M.chrome, 0.1 + k * 0.14, 1.35, 0.395, 6));
  g.add(B(0.34, 0.16, 0.02, M.dark, 0.1, 1.08, 0.38, 0.005)); g.add(B(0.24, 0.04, 0.004, M.levels, 0.1, 1.17, 0.392, 0.001));
  for (let i = 0; i < 3; i++) g.add(C(0.016, 0.016, 0.014, i === 0 ? M.gGreen : i === 1 ? M.gAmber : M.gRed, -0.02 + i * 0.07, 1.1, 0.393, 8).rotateX(PI / 2));
  g.add(B(0.1, 0.05, 0.03, M.dark, 0.1 + 0.2, 1.14, 0.39, 0.004));
  g.add(B(0.3, 0.1, 0.3, M.ss2, 0.1, 1.5, 0, 0.008)); g.add(C(0.05, 0.05, 0.12, M.ss2, 0.1, 1.6, 0, 10));
  g.add(B(0.12, 0.02, 0.3, M.ss2, 0.1, 0.0, 0.0, 0.003));
  return bake(g, { top: 0.86, box: [-1.15, 1.0, -0.38, 0.38], use: { load: { x: -0.6, z: 0.62, ry: PI }, unload: { x: 0.72, z: 0.62, ry: PI }, rinse: { x: -1.0, z: 0.62, ry: PI } }, spots: [[-0.6, 0.62, PI], [0.72, 0.62, PI]], size: [2.15, 1.72, 0.75] });
}

export const kinds = {
  range: () => buildRange(true),
  range_bare: () => buildRange(false),
  servery: () => buildServery(),
  bar: () => buildBar(true),
  bar_plain: () => buildBar(false),
  barstool: () => buildStool(),
  barback: () => buildBarBack(),
  wastebin: () => buildBin(),
  dishwasher: () => buildDishwasher(),
};
export const KINDS = Object.keys(kinds);
