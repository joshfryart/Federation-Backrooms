// itemart-security.js: batch 8 item art (damage control and security), same row format as js/itemart.js DEFS / KW. Pure three.js, no game imports.
//   import { DEFS_SECURITY, KW_SECURITY, buildSecurityItem } from './itemart-security.js';
//   integrator: in itemart.js `Object.assign(DEFS, DEFS_SECURITY)` after the `def(...)` block and `KW.unshift(...KW_SECURITY)` (rows must come before the existing ones: 'clamp', 'gauge', 'patch'
//   would otherwise match tool / part kinds).  ITEMS (js/equipment.js) gains `patch_plate`, `pipe_clamp`, `seal_gauge`, `breather`, `cuffs` (ids equal to the model kinds); the `dc` loadout in
//   js/handhelds.js can use `seal_gauge` as its model.  See docs/propart-security.md.
//   DEFS_SECURITY[kind] = { name, cls, build(g, M, o), base?, lie?, rest? }; M is itemart's material table (steel, alu, white, red, amber, rubber, dark, gun, grey, cloth, cloth2, glass, gGreen, gAmber, gCyan, brass).
// Budget 500 triangles each, chamfered boxes, no text.  Frame: base (origin at the bottom centre, lying flat as clutter) unless `base` is unset (origin at the grip, working end +y).
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

export const DEFS_SECURITY = {};
const def = (kind, name, cls, build, x = {}) => { DEFS_SECURITY[kind] = { name, cls, build, ...x }; };
const orange = () => memo('orange', () => new THREE.MeshStandardMaterial({ color: 0xe0661e, roughness: 0.6 }));
const graphite = () => memo('graphite', () => new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.7, roughness: 0.4 }));
const hose = () => memo('gaugehose', () => new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.8 }));

// ENG-9a hull patch plate: 0.3 m square dished plate (steel) with a rubber sealing rim, four corner bolts, a hazard-amber edge band and a T-handle strongback. Lies rim down (base frame).
def('patch_plate', 'hull patch plate', 'engineering', (g, M) => {
  g.add(rb(0.3, 0.018, 0.3, 0.008, M.rubber, 0, 0.009, 0));                                                          // rubber rim
  g.add(rb(0.25, 0.014, 0.25, 0.01, M.steel, 0, 0.025, 0)); g.add(rb(0.2, 0.01, 0.2, 0.008, M.alu, 0, 0.036, 0));      // dished steps
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cy(0.011, 0.011, 0.014, M.gun, sx * 0.11, 0.04, sz * 0.11, 6));
  g.add(bx(0.25, 0.004, 0.02, M.amber, 0, 0.028, 0.128)); g.add(bx(0.25, 0.004, 0.02, M.amber, 0, 0.028, -0.128));
  g.add(rb(0.22, 0.026, 0.03, 0.008, M.gun, 0, 0.056, 0));                                                           // strongback
  for (const s of [-1, 1]) g.add(bx(0.022, 0.03, 0.026, M.gun, s * 0.07, 0.04, 0));
  g.add(cyz(0.012, 0.012, 0.1, M.rubber, 0, 0.082, 0, 8)); g.add(bx(0.022, 0.03, 0.022, M.gun, 0, 0.066, 0));         // T-handle grip
}, { base: true });

// ENG-9b split-sleeve pipe repair clamp: 0.15 m long x 0.11 m across, two half shells with flange lugs, two through-bolts with nuts, rubber gasket ends (lies on its side, axis z).
def('pipe_clamp', 'pipe repair clamp', 'engineering', (g, M) => {
  g.add(cyz(0.05, 0.05, 0.13, M.steel, 0, 0.056, 0, 14));                                                           // sleeve
  for (const s of [-1, 1]) g.add(cyz(0.0525, 0.0525, 0.012, M.rubber, 0, 0.056, s * 0.071, 14));                      // gasket ends
  for (const s of [-1, 1]) g.add(rb(0.04, 0.026, 0.132, 0.006, M.gun, s * 0.062, 0.056, 0));                          // flange lugs at the seam
  for (const z of [-0.04, 0.04]) { g.add(cyx(0.0075, 0.0075, 0.17, M.alu, 0, 0.056, z, 6)); for (const s of [-1, 1]) g.add(cyx(0.014, 0.014, 0.012, M.gun, s * 0.088, 0.056, z, 6)); }   // bolts and hex heads
  g.add(bx(0.07, 0.003, 0.05, M.amber, 0, 0.1, 0));                                                                  // marker tag on the crown
}, { base: true });

// ENG-9c seal gauge: hand-held differential manometer, body 0.08 x 0.15 x 0.04 m with a lit dial window and two ports, a pistol grip below, and a 0.3 m probe hose with a flat nozzle.
// Grip frame: origin at the grip, body above (+y), hose hanging down and forward.
def('seal_gauge', 'seal gauge', 'engineering', (g, M) => {
  g.add(rb(0.026, 0.07, 0.034, 0.008, M.rubber, 0, -0.03, 0));                                                       // grip
  g.add(rb(0.08, 0.15, 0.04, 0.012, M.gun, 0, 0.1, 0)); g.add(rb(0.062, 0.06, 0.004, 0.004, M.dark, 0, 0.13, 0.021)); g.add(cy(0.022, 0.022, 0.004, M.gGreen, 0, 0.13, 0.024, 12).rotateX(PI / 2));
  g.add(bx(0.01, 0.036, 0.003, M.red, 0.0, 0.135, 0.0275).rotateZ(0.5)); g.add(bx(0.05, 0.012, 0.004, M.gAmber, 0, 0.085, 0.021));
  for (const s of [-1, 1]) g.add(cy(0.008, 0.008, 0.03, M.steel, s * 0.02, 0.185, 0, 8)); g.add(bx(0.03, 0.014, 0.01, M.gCyan, 0, 0.05, 0.021));
  const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0.02, 0.2, 0), new THREE.Vector3(0.07, 0.22, 0.03), new THREE.Vector3(0.1, 0.12, 0.1), new THREE.Vector3(0.05, -0.02, 0.2), new THREE.Vector3(0.0, -0.05, 0.3)]);
  g.add(mesh(new THREE.TubeGeometry(c, 14, 0.0065, 5, false), hose()));                                              // probe hose
  g.add(rb(0.03, 0.008, 0.05, 0.003, M.steel, 0, -0.05, 0.325));                                                    // flat nozzle
}, { rest: 0.01 });

// ENG-10 escape breather, stowed: sealed foil pouch 0.25 x 0.08 x 0.2 m (orange) with a red pull tab, a tear notch, a perimeter weld seam and a neck strap loop. Lies flat (base frame).
def('breather', 'escape breather pouch', 'engineering', (g, M) => {
  const O = orange();
  g.add(rb(0.25, 0.07, 0.2, 0.026, O, 0, 0.035, 0)); g.add(rb(0.27, 0.012, 0.22, 0.005, M.amber, 0, 0.006, 0)); g.add(rb(0.27, 0.012, 0.22, 0.005, M.amber, 0, 0.064, 0));   // seam flanges
  g.add(rb(0.07, 0.006, 0.05, 0.003, M.red, 0.09, 0.078, -0.07)); g.add(rb(0.03, 0.01, 0.07, 0.004, M.red, 0.13, 0.04, -0.12));                                              // pull tab
  g.add(rb(0.2, 0.004, 0.035, 0.002, M.white, -0.0, 0.074, 0.02));                                                    // blank label band
  g.add(tor(0.035, 0.005, M.rubber, -0.09, 0.074, 0.055, PI * 2, 4, 10).rotateX(PI / 2));                             // strap loop
}, { base: true });

// SEC-5 restraint cuffs, magnetic pair as stored: two rigid 80 mm rings joined by a 60 mm hinge bar, graphite finish, lock bosses and one status lamp. Lies flat (base frame).
def('cuffs', 'restraint cuffs', 'security', (g, M) => {
  const G = graphite();
  for (const s of [-1, 1]) {
    g.add(tor(0.034, 0.0068, G, s * 0.066, 0.0075, 0, PI * 2, 4, 14).rotateX(PI / 2));                               // ring (outer 82 mm)
    g.add(bx(0.02, 0.016, 0.014, M.gun, s * 0.066, 0.008, 0.039)); g.add(bx(0.008, 0.004, 0.006, M.steel, s * 0.066, 0.016, 0.04));   // lock boss and slot
  }
  g.add(bx(0.06, 0.012, 0.016, G, 0, 0.007, 0)); for (const s of [-1, 1]) g.add(cy(0.006, 0.006, 0.014, M.steel, s * 0.027, 0.007, 0, 8)); g.add(bx(0.01, 0.004, 0.01, M.gAmber, 0, 0.015, 0));   // bar, hinge pins, status lamp
}, { base: true });

export const KW_SECURITY = [
  [/patch plate|hull patch|breach patch|hull plate|repair patch|breach plate/i, 'patch_plate'],
  [/pipe clamp|repair clamp|pipe repair|sleeve clamp|leak clamp/i, 'pipe_clamp'],
  [/seal gauge|manometer|differential gauge|leak detector|leak tester|gasket gauge/i, 'seal_gauge'],
  [/breather|breathing hood|escape hood|breathing mask|emergency hood|emergency breathing|escape mask/i, 'breather'],
  [/cuffs|restraint|manacle|handcuff|shackle/i, 'cuffs'],
];

// ---------------------------------------------------------------- stand-alone builder (viewer and tests; itemart.js buildItem does the same once DEFS_SECURITY is spread in)
let FM = null;
function fallbackMats() {
  if (FM) return FM; const S = (o) => new THREE.MeshStandardMaterial(o), glow = (c) => S({ color: new THREE.Color(c).multiplyScalar(0.25), emissive: c, emissiveIntensity: 1.8 });
  return FM = { steel: S({ color: 0xb4bac2, metalness: 0.9, roughness: 0.3 }), alu: S({ color: 0xd0d4da, metalness: 0.75, roughness: 0.45 }), white: S({ color: 0xe9edef, roughness: 0.36 }), red: S({ color: 0xc4382e, roughness: 0.4 }),
    amber: S({ color: 0xe19a22, roughness: 0.42 }), rubber: S({ color: 0x15161a, roughness: 0.92 }), dark: S({ color: 0x24272d, roughness: 0.5 }), gun: S({ color: 0x3b414b, metalness: 0.8, roughness: 0.38 }), grey: S({ color: 0x9aa1a8, roughness: 0.5 }),
    cloth: S({ color: 0xaec2d8, roughness: 0.95 }), cloth2: S({ color: 0xe7e9e4, roughness: 0.95 }), glass: S({ color: 0xcfe6ee, roughness: 0.05, transparent: true, opacity: 0.38, depthWrite: false }), gGreen: glow(0x38ff8c), gAmber: glow(0xffa21a), gCyan: glow(0x30d4ff) };
}
export function buildSecurityItem(kind, opts = {}, M = null) {
  const d = DEFS_SECURITY[kind]; if (!d) return null; M = M || fallbackMats();
  const inner = new THREE.Group(); inner.name = 'item:' + kind; d.build(inner, M, opts);
  const frame = opts.frame || (d.base ? 'base' : 'grip'), out = new THREE.Group(); out.name = 'item:' + kind; out.add(inner);
  if (frame === 'base' || d.base) { const b = new THREE.Box3().setFromObject(out); inner.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); out.userData.rest = 0; }
  else out.userData.rest = d.rest ?? 0.01;
  let n = 0; out.traverse(m => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
  out.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(out);
  Object.assign(out.userData, { item: kind, lie: false, frame, size: b.getSize(new THREE.Vector3()).toArray(), tris: Math.round(n) }); return out;
}
