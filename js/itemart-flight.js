// itemart-flight.js: batch 6 item art (flight deck and cargo handling), same row format as js/itemart.js DEFS / KW. Pure three.js, no game imports.
//   import { DEFS_FLIGHT, KW_FLIGHT, buildFlightItem } from './itemart-flight.js';
//   integrator: in itemart.js `Object.assign(DEFS, DEFS_FLIGHT)` and `KW.unshift(...KW_FLIGHT)` (same snippet as docs/propart-medical.md).
//   DEFS_FLIGHT[kind] = { name, cls, build(g, M, o), base?, lie?, rest? }; M is itemart's material table (steel, alu, white, red, amber, rubber, dark, gun, grey, cloth, cloth2, glass, gGreen, gAmber, gCyan).
// Budget 500 triangles each, chamfered boxes, no text. Frames: tag_scanner is a grip item (origin at the grip, aims +z like the guns); the other three lie on the floor (base frame).
//   wheel_chocks   FLT-6  pair of 0.25 x 0.12 x 0.12 m yellow rubber wedges joined by 0.5 m of rope
//   tiedown_strap  FLT-6  25 mm blue webbing with a ratchet buckle and two snap hooks, laid in a loose loop
//   ratchet_strap  SVC-7  50 mm hi-vis webbing rolled to a 0.15 m coil, 0.2 m ratchet buckle with handle, two J-hooks
//   tag_scanner    SVC-8  warehouse scanner: pistol grip 0.18 m, head with a red window, screen on the back, wrist lanyard
import * as THREE from 'three';

const PI = Math.PI;
const GEO = new Map(); const geo = (key, f) => { let g = GEO.get(key); if (!g) { g = f(); GEO.set(key, g); } return g; };
function bevelGeo(w, h, d, r) {   // chamfered box: 44 triangles, flat shaded (copy of itemart.js)
  const H = [w / 2, h / 2, d / 2], P = [], idx = new Map(), at = (a, s0, s1, s2) => { const k = a + '|' + s0 + s1 + s2; if (idx.has(k)) return idx.get(k); const sg = [s0, s1, s2], v = [0, 0, 0]; for (let i = 0; i < 3; i++) v[i] = sg[i] * (i === a ? H[i] : H[i] - r); P.push(v); idx.set(k, P.length - 1); return P.length - 1; };
  const T = [], S = [-1, 1], tri = (a, b, c) => T.push([a, b, c]), quad = (a, b, c, d2) => { tri(a, b, c); tri(a, c, d2); };
  for (let a = 0; a < 3; a++) for (const sa of S) { const o = [0, 1, 2].filter(i => i !== a), g = (t, u) => { const sg = [0, 0, 0]; sg[a] = sa; sg[o[0]] = t; sg[o[1]] = u; return at(a, ...sg); }; quad(g(-1, -1), g(1, -1), g(1, 1), g(-1, 1)); }
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) { const c = 3 - a - b; for (const sa of S) for (const sb of S) { const g = (aa, sc) => { const sg = [0, 0, 0]; sg[a] = sa; sg[b] = sb; sg[c] = sc; return at(aa, ...sg); }; quad(g(a, -1), g(a, 1), g(b, 1), g(b, -1)); } }
  for (const sx of S) for (const sy of S) for (const sz of S) tri(at(0, sx, sy, sz), at(1, sx, sy, sz), at(2, sx, sy, sz));
  const pos = []; for (const t of T) { const [A, B, C] = t.map(i => P[i]); const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]], n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const dot = n[0] * (A[0] + B[0] + C[0]) + n[1] * (A[1] + B[1] + C[1]) + n[2] * (A[2] + B[2] + C[2]); pos.push(...A, ...(dot < 0 ? [C, B] : [B, C]).flat()); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); const uv = []; const nr = g.attributes.normal; for (let i = 0; i < pos.length / 3; i++) { const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], ax = Math.abs(nr.getX(i)), ay = Math.abs(nr.getY(i)), az = Math.abs(nr.getZ(i)); if (ay >= ax && ay >= az) uv.push(x / w + 0.5, z / d + 0.5); else if (ax >= az) uv.push(z / d + 0.5, y / h + 0.5); else uv.push(x / w + 0.5, y / h + 0.5); }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return g;
}
const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; return o; };
const rb = (w, h, d, r, m, x = 0, y = 0, z = 0) => { r = Math.min(r * 0.8, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4); return mesh(geo(`rb${w}|${h}|${d}|${r}`, () => bevelGeo(w, h, d, r)), m, x, y, z); };   // y = centre (as itemart.js)
const bx = (w, h, d, m, x = 0, y = 0, z = 0) => mesh(geo(`bx${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d)), m, x, y, z);
const cy = (rt, rbm, h, m, x = 0, y = 0, z = 0, seg = 10) => mesh(geo(`cy${rt}|${rbm}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rbm, h, seg)), m, x, y, z);
const cyx = (rt, rbm, h, m, x = 0, y = 0, z = 0, seg = 10) => { const o = cy(rt, rbm, h, m, x, y, z, seg); o.rotation.z = PI / 2; return o; };
const cyz = (rt, rbm, h, m, x = 0, y = 0, z = 0, seg = 10) => { const o = cy(rt, rbm, h, m, x, y, z, seg); o.rotation.x = PI / 2; return o; };
const tor = (R, r, m, x = 0, y = 0, z = 0, arc = PI * 2, rs = 4, ts = 10) => mesh(geo(`tr${R}|${r}|${arc}|${rs}|${ts}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc)), m, x, y, z);
const sph = (r, m, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => { const o = mesh(geo(`sp${r}`, () => new THREE.SphereGeometry(r, 8, 5)), m, x, y, z); o.scale.set(sx, sy, sz); return o; };
const own = {}; const memo = (k, f) => own[k] || (own[k] = f());
const orange = () => memo('orange', () => new THREE.MeshStandardMaterial({ color: 0xe0661e, roughness: 0.6 }));


export const DEFS_FLIGHT = {};
const def = (kind, name, cls, build, x = {}) => { DEFS_FLIGHT[kind] = { name, cls, build, ...x }; };
const col = (k, c, r = 0.6, m = 0) => memo(k, () => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m }));
const yel = () => col('fyel', 0xe6b422), webB = () => col('fwebB', 0x2a5ab0, 0.85), webO = () => col('fwebO', 0xf26a1b, 0.85), rope = () => col('frope', 0xb89c6a, 0.95), body = () => col('fscan', 0xd8a818, 0.5);
const shape = (key, pts, depth) => geo(key, () => { const s = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1]))); const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }); g.translate(0, 0, -depth / 2); return g; });

// wheel chocks (frame: base): two wedges (length along x, ramp rising to +x... tall end at -x with a rope eye, grooves on the ramp) 0.25 x 0.12 x 0.12 m, rope 0.5 m sagging between them (along z).
def('wheel_chocks', 'wheel chocks', 'tool', (g, M) => {
  const Y = yel(), R = rope();
  for (const sz of [-1, 1]) {
    g.add(mesh(shape('chockw', [[-0.125, 0], [0.125, 0], [-0.125, 0.12]], 0.12), Y, 0, 0, sz * 0.31)); g.add(rb(0.02, 0.1, 0.12, 0.004, M.rubber, -0.125, 0.06, sz * 0.31));
    for (let i = 0; i < 4; i++) g.add(bx(0.006, 0.006, 0.1, M.dark, -0.07 + i * 0.05, 0.1 - 0.0 - i * 0.025 + 0.0 - 0.07 + 0.07, sz * 0.31).rotateZ(-0.46));
    g.add(tor(0.014, 0.004, R, -0.125, 0.085, sz * 0.31 - sz * 0.07, PI * 2, 3, 8).rotateY(PI / 2));
  }
  for (let i = 0; i < 10; i++) { const t = i / 9, z = -0.25 + t * 0.5, y = 0.085 - Math.sin(t * PI) * 0.07; g.add(bx(0.008, 0.008, 0.06, R, -0.125 - Math.sin(t * PI) * 0.03, Math.max(0.01, y), z).rotateX((i - 4.5) * 0.04)); }
}, { base: true });

// tie-down strap (frame: base): 25 mm blue webbing laid in a loose oval, ratchet buckle (frame, spool, handle) at one end, snap hooks at both ends.
def('tiedown_strap', 'tie-down strap', 'tool', (g, M) => {
  const W = webB();
  g.add(rb(0.4, 0.006, 0.025, 0.002, W, 0, 0.003, -0.055)); g.add(rb(0.4, 0.006, 0.025, 0.002, W, 0, 0.009, 0.055)); g.add(tor(0.055, 0.0125, W, 0.2, 0.006, 0, PI, 3, 8).rotateX(PI / 2).rotateZ(-PI / 2)); g.add(tor(0.055, 0.0125, W, -0.2, 0.006, 0, PI, 3, 8).rotateX(PI / 2).rotateZ(PI / 2));
  g.add(rb(0.06, 0.018, 0.04, 0.005, M.steel, -0.04, 0.019, 0.055)); g.add(rb(0.12, 0.008, 0.032, 0.003, M.alu, -0.07, 0.03, 0.055).rotateZ(0.12)); g.add(cyz(0.006, 0.006, 0.04, M.steel, -0.04, 0.022, 0.055, 8));
  for (const [x, z] of [[0.275, -0.055], [-0.18, -0.055]]) { g.add(tor(0.016, 0.0035, M.steel, x, 0.01, z, PI * 1.6, 3, 10).rotateX(PI / 2)); g.add(bx(0.016, 0.008, 0.012, M.steel, x - 0.014, 0.01, z)); g.add(bx(0.01, 0.012, 0.01, M.amber, x - 0.008, 0.015, z)); }
}, { base: true });

// ratchet strap (frame: base): hi-vis orange 50 mm webbing rolled to a 0.15 m coil, a ratchet buckle 0.2 m with a long handle beside it, two J-hooks, tail running to the coil.
def('ratchet_strap', 'ratchet strap', 'tool', (g, M) => {
  const W = webO();
  g.add(cy(0.075, 0.075, 0.052, W, -0.07, 0.0, 0, 14)); g.add(cy(0.03, 0.03, 0.054, M.dark, -0.07, 0.0, 0, 12)); g.add(cy(0.077, 0.077, 0.004, M.rubber, -0.07, 0.024, 0, 14));
  g.add(rb(0.12, 0.006, 0.05, 0.002, W, 0.06, 0.003, 0.0)); g.add(rb(0.12, 0.03, 0.06, 0.008, M.steel, 0.17, 0.02, 0.0)); g.add(rb(0.2, 0.012, 0.05, 0.004, M.alu, 0.19, 0.045, 0.0).rotateZ(0.05)); g.add(cyz(0.008, 0.008, 0.07, M.dark, 0.15, 0.025, 0.0, 8)); g.add(rb(0.07, 0.02, 0.026, 0.006, M.rubber, 0.285, 0.05, 0.0));
  for (const [x, z, s] of [[0.27, 0.0, 1], [-0.17, 0.08, -1]]) { g.add(bx(0.03, 0.006, 0.04, M.steel, x - s * 0.01, 0.006, z)); g.add(tor(0.022, 0.0045, M.steel, x + s * 0.025, 0.012, z, PI * 1.5, 3, 10).rotateX(PI / 2).rotateZ(s > 0 ? 0 : PI)); g.add(bx(0.014, 0.006, 0.014, M.steel, x + s * 0.045, 0.01, z - 0.015)); }
}, { base: true });

// warehouse tag scanner (frame: grip, aims +z): pistol grip 0.18 m with a trigger and a wrist lanyard loop, head 0.08 x 0.07 x 0.1 m on top with a red scan window on the front, small screen on the back.
def('tag_scanner', 'tag scanner', 'tool', (g, M) => {
  const B = body();
  g.add(rb(0.036, 0.1, 0.045, 0.012, M.dark, 0, -0.03, -0.01).rotateX(0.18)); g.add(rb(0.04, 0.05, 0.05, 0.01, M.rubber, 0, -0.065, -0.018).rotateX(0.18));
  g.add(rb(0.08, 0.07, 0.1, 0.014, B, 0, 0.04, 0.0)); g.add(bx(0.07, 0.02, 0.012, M.rubber, 0, 0.04, 0.052)); g.add(bx(0.062, 0.03, 0.004, M.gCyan, 0, 0.042, 0.0575)); g.add(bx(0.05, 0.004, 0.004, M.red, 0, 0.042, 0.0597));
  g.add(bx(0.05, 0.003, 0.04, M.dark, 0, 0.0765, -0.015).rotateX(-0.2)); g.add(bx(0.044, 0.036, 0.004, M.dark, 0, 0.045, -0.052)); g.add(bx(0.034, 0.022, 0.002, M.gGreen, 0, 0.047, -0.0545));
  g.add(bx(0.012, 0.03, 0.012, M.dark, 0, -0.005, 0.03).rotateX(0.3)); g.add(tor(0.016, 0.0028, M.cloth, 0, -0.12, -0.025, PI * 2, 3, 10).rotateY(PI / 2)); g.add(bx(0.01, 0.012, 0.012, M.red, 0.03, 0.025, -0.052));
}, { lie: true });

// name keywords -> kind. Prepend to itemart's KW (first match wins).
export const KW_FLIGHT = [
  [/wheel chock|skid chock|\bchocks?\b|wheel stop/i, 'wheel_chocks'],
  [/ratchet|cargo strap|load strap|lashing strap|cargo lashing/i, 'ratchet_strap'],
  [/tie-?down|webbing strap|restraint strap|lashing|snap hook/i, 'tiedown_strap'],
  [/tag scanner|cargo scanner|barcode|rfid|manifest scanner|warehouse scanner|inventory scanner|scanner gun|transit hand-?held/i, 'tag_scanner'],
];

// ---------------------------------------------------------------- stand-alone builder (viewer and tests; itemart.js buildItem does the same once DEFS_FLIGHT is spread in)
let FM = null;
function fallbackMats() {
  if (FM) return FM; const S = (o) => new THREE.MeshStandardMaterial(o), glow = (c) => S({ color: new THREE.Color(c).multiplyScalar(0.25), emissive: c, emissiveIntensity: 1.8 });
  return FM = { steel: S({ color: 0xb4bac2, metalness: 0.9, roughness: 0.3 }), alu: S({ color: 0xd0d4da, metalness: 0.75, roughness: 0.45 }), white: S({ color: 0xe9edef, roughness: 0.36 }), red: S({ color: 0xc4382e, roughness: 0.4 }),
    amber: S({ color: 0xe19a22, roughness: 0.42 }), rubber: S({ color: 0x15161a, roughness: 0.92 }), dark: S({ color: 0x24272d, roughness: 0.5 }), gun: S({ color: 0x3b414b, metalness: 0.8, roughness: 0.38 }), grey: S({ color: 0x9aa1a8, roughness: 0.5 }),
    cloth: S({ color: 0xaec2d8, roughness: 0.95 }), cloth2: S({ color: 0xe7e9e4, roughness: 0.95 }), glass: S({ color: 0xcfe6ee, roughness: 0.05, transparent: true, opacity: 0.38, depthWrite: false }), gGreen: glow(0x38ff8c), gAmber: glow(0xffa21a), gCyan: glow(0x30d4ff) };
}
export function buildFlightItem(kind, opts = {}, M = null) {
  const d = DEFS_FLIGHT[kind]; if (!d) return null; M = M || fallbackMats();
  const inner = new THREE.Group(); inner.name = 'item:' + kind; d.build(inner, M, opts);
  const frame = opts.frame || (d.base ? 'base' : 'grip'), out = new THREE.Group(); out.name = 'item:' + kind; out.add(inner);
  if (frame === 'base' || d.base) { const b = new THREE.Box3().setFromObject(out); inner.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); out.userData.rest = 0; }
  else out.userData.rest = d.rest ?? 0.01;
  let n = 0; out.traverse(m => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
  out.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(out);
  Object.assign(out.userData, { item: kind, lie: false, frame, size: b.getSize(new THREE.Vector3()).toArray(), tris: Math.round(n) }); return out;
}
