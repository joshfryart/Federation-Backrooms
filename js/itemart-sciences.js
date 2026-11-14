// itemart-sciences.js: batch 5 item art (botany hand kit), same row format as js/itemart.js DEFS / KW. Pure three.js, no game imports.
//   import { DEFS_SCIENCES, KW_SCIENCES, buildSciencesItem } from './itemart-sciences.js';
//   integrator: in itemart.js `Object.assign(DEFS, DEFS_SCIENCES)` and `KW.unshift(...KW_SCIENCES)` (same snippet as docs/propart-medical.md).
//   DEFS_SCIENCES[kind] = { name, cls, build(g, M, o), base?, lie?, rest? }; M is itemart's material table (steel, alu, white, red, amber, rubber, dark, gun, grey, cloth, cloth2, glass, gGreen, gAmber, gCyan).
// Budget 500 triangles each, chamfered boxes, no text. Grip frame: origin at the grip, working end +y (soil_meter, pruning_shears); harvest_tote uses the base frame (origin bottom centre).
//   soil_meter    SCI-7  pH / EC / moisture handset 0.16 m with a 0.12 m probe
//   pruning_shears SCI-7 0.2 m bypass secateurs with a sprung handle
//   harvest_tote  SCI-7  vented 0.5 x 0.35 x 0.25 m crate with green tops showing (two-handed carry)
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


export const DEFS_SCIENCES = {};
const def = (kind, name, cls, build, x = {}) => { DEFS_SCIENCES[kind] = { name, cls, build, ...x }; };
const toteGreen = () => memo('toteG', () => new THREE.MeshStandardMaterial({ color: 0x3a8a4a, roughness: 0.55 }));
const leafM = (i) => memo('leaf' + i, () => new THREE.MeshStandardMaterial({ color: [0x46b04c, 0x6cc455, 0x2f8a3c][i], roughness: 0.8 }));
const tomato = () => memo('tomato', () => new THREE.MeshStandardMaterial({ color: 0xd8382a, roughness: 0.45 }));
const meterBody = () => memo('meterB', () => new THREE.MeshStandardMaterial({ color: 0x2f8a48, roughness: 0.5 }));

// pH / EC / moisture handset (frame: grip). Rubber-banded body, a screen with a bar and two buttons, a collar and a 0.12 m steel probe with a second short tine.
def('soil_meter', 'pH and EC meter', 'tool', (g, M) => {
  g.add(rb(0.062, 0.15, 0.032, 0.012, meterBody(), 0, 0, 0)); g.add(rb(0.066, 0.03, 0.036, 0.01, M.rubber, 0, -0.05, 0)); g.add(rb(0.044, 0.04, 0.004, 0.006, M.dark, 0, 0.03, 0.017)); g.add(rb(0.03, 0.012, 0.004, 0.003, M.gGreen, 0, 0.034, 0.0195));
  g.add(rb(0.014, 0.014, 0.006, 0.004, M.white, -0.012, -0.012, 0.017)); g.add(rb(0.014, 0.014, 0.006, 0.004, M.amber, 0.012, -0.012, 0.017));
  g.add(cy(0.014, 0.014, 0.02, M.dark, 0, 0.085, 0, 10)); g.add(cy(0.005, 0.003, 0.12, M.steel, 0, 0.155, 0, 8)); g.add(cy(0.0025, 0.0025, 0.05, M.alu, 0.012, 0.12, 0, 6)); g.add(rb(0.02, 0.012, 0.006, 0.003, M.rubber, 0, -0.082, -0.017));
}, { lie: true });

// bypass secateurs (frame: grip), 0.2 m: two handles (red lower, dark upper) crossing at a pivot bolt, hooked cutting blade over a flat anvil, coil spring, thumb latch. Blades toward +y.
def('pruning_shears', 'pruning shears', 'tool', (g, M) => {
  const red = M.red;
  g.add(rb(0.02, 0.105, 0.016, 0.007, red, -0.012, -0.045, 0).rotateZ(0.12)); g.add(rb(0.02, 0.105, 0.016, 0.007, M.dark, 0.012, -0.045, 0).rotateZ(-0.12));
  g.add(cyz(0.012, 0.012, 0.024, M.steel, 0, 0.012, 0, 10)); g.add(bx(0.012, 0.075, 0.006, M.steel, -0.004, 0.058, 0).rotateZ(0.04));   // anvil blade
  g.add(bx(0.014, 0.07, 0.006, M.alu, 0.01, 0.052, 0.008).rotateZ(-0.1)); g.add(tor(0.02, 0.0045, M.alu, 0.012, 0.09, 0.008, PI * 0.55, 3, 8).rotateZ(PI * 0.4));   // hooked blade
  g.add(tor(0.01, 0.0018, M.steel, 0, -0.012, 0.012, PI * 2, 3, 8)); g.add(bx(0.006, 0.02, 0.01, M.amber, 0.016, -0.02, 0.012)); g.add(rb(0.022, 0.03, 0.018, 0.006, M.rubber, -0.02, -0.075, 0).rotateZ(0.12));
}, { lie: true });

// harvest tote (frame: base), 0.5 x 0.35 x 0.25 m: vented green crate, hand slots at both short ends, stacking feet, heaped with produce (tomatoes and leafy heads) so the green tops show.
def('harvest_tote', 'harvest tote', 'tool', (g, M) => {
  const G = toteGreen(), W = 0.5, D = 0.35, H = 0.25;
  g.add(bx(W, 0.02, D, G, 0, 0.03, 0));
  for (const sz of [-1, 1]) { g.add(bx(W, H - 0.04, 0.016, G, 0, 0.14, sz * (D / 2 - 0.008))); for (let i = 0; i < 4; i++) g.add(bx(0.07, 0.03, 0.018, M.dark, -0.18 + i * 0.12, 0.12, sz * (D / 2 - 0.008))); }
  for (const sx of [-1, 1]) { g.add(bx(0.016, H - 0.04, D - 0.03, G, sx * (W / 2 - 0.008), 0.14, 0)); g.add(bx(0.018, 0.026, 0.12, M.dark, sx * (W / 2 - 0.008), 0.2, 0)); for (const sz of [-1, 1]) g.add(bx(0.03, 0.03, 0.03, G, sx * (W / 2 - 0.03), 0.015, sz * (D / 2 - 0.03))); }
  for (const sz of [-1, 1]) g.add(bx(W + 0.01, 0.014, 0.02, G, 0, 0.258, sz * (D / 2 - 0.008)));
  const rn = (i) => ((i * 7919) % 100) / 100;
  for (let i = 0; i < 3; i++) g.add(sph(0.036, tomato(), -0.15 + (i % 3) * 0.12 + rn(i) * 0.02, 0.2 + (i > 2 ? 0.04 : 0), -0.07 + (i > 2 ? 0.07 : -0.01) + rn(i + 3) * 0.03));
  for (let i = 0; i < 3; i++) { g.add(cy(0.0, 0.06, 0.1, leafM(i), -0.14 + i * 0.14, 0.2, 0.09, 6)); g.add(cy(0.0, 0.05, 0.08, leafM((i + 1) % 3), -0.14 + i * 0.14 + 0.02, 0.24, 0.07, 6)); }
}, { base: true, rest: 0 });

// name keywords -> kind. Prepend to itemart's KW (first match wins).
export const KW_SCIENCES = [
  [/ph and ec|ph meter|ec meter|soil meter|moisture meter|nutrient meter|conductivity meter|ph probe|soil probe/i, 'soil_meter'],
  [/pruning|shears|secateurs|pruner|loppers|bypass cutter/i, 'pruning_shears'],
  [/harvest tote|harvest crate|produce tote|produce crate|picking tote|vented crate|harvest bin|picking crate/i, 'harvest_tote'],
];

// ---------------------------------------------------------------- stand-alone builder (viewer and tests; itemart.js buildItem does the same once DEFS_SCIENCES is spread in)
let FM = null;
function fallbackMats() {
  if (FM) return FM; const S = (o) => new THREE.MeshStandardMaterial(o), glow = (c) => S({ color: new THREE.Color(c).multiplyScalar(0.25), emissive: c, emissiveIntensity: 1.8 });
  return FM = { steel: S({ color: 0xb4bac2, metalness: 0.9, roughness: 0.3 }), alu: S({ color: 0xd0d4da, metalness: 0.75, roughness: 0.45 }), white: S({ color: 0xe9edef, roughness: 0.36 }), red: S({ color: 0xc4382e, roughness: 0.4 }),
    amber: S({ color: 0xe19a22, roughness: 0.42 }), rubber: S({ color: 0x15161a, roughness: 0.92 }), dark: S({ color: 0x24272d, roughness: 0.5 }), gun: S({ color: 0x3b414b, metalness: 0.8, roughness: 0.38 }), grey: S({ color: 0x9aa1a8, roughness: 0.5 }),
    cloth: S({ color: 0xaec2d8, roughness: 0.95 }), cloth2: S({ color: 0xe7e9e4, roughness: 0.95 }), glass: S({ color: 0xcfe6ee, roughness: 0.05, transparent: true, opacity: 0.38, depthWrite: false }), gGreen: glow(0x38ff8c), gAmber: glow(0xffa21a), gCyan: glow(0x30d4ff) };
}
export function buildSciencesItem(kind, opts = {}, M = null) {
  const d = DEFS_SCIENCES[kind]; if (!d) return null; M = M || fallbackMats();
  const inner = new THREE.Group(); inner.name = 'item:' + kind; d.build(inner, M, opts);
  const frame = opts.frame || (d.base ? 'base' : 'grip'), out = new THREE.Group(); out.name = 'item:' + kind; out.add(inner);
  if (frame === 'base' || d.base) { const b = new THREE.Box3().setFromObject(out); inner.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); out.userData.rest = 0; }
  else out.userData.rest = d.rest ?? 0.01;
  let n = 0; out.traverse(m => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
  out.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(out);
  Object.assign(out.userData, { item: kind, lie: false, frame, size: b.getSize(new THREE.Vector3()).toArray(), tris: Math.round(n) }); return out;
}
