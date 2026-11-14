// itemart-medical.js — batch 4 item art (sickbay and morgue), same row format as js/itemart.js DEFS / KW. Pure three.js, no game imports.
//   import { DEFS_MEDICAL, KW_MEDICAL, buildMedicalItem } from './itemart-medical.js';
//   integrator: in itemart.js add `Object.assign(DEFS, DEFS_MEDICAL)` after the `def(...)` block and `KW.unshift(...KW_MEDICAL)` (the rows must come before the
//   existing ones: 'dressing', 'clamp', 'tube' would otherwise match crate_med / tool / hose first). docs/propart-medical.md has the exact snippet.
//   DEFS_MEDICAL[kind] = { name, cls, build(g, M, o), base?, lie?, flat?, rest? }: build gets itemart's material table M (steel, alu, white, red, amber, rubber,
//   dark, gun, grey, cloth, cloth2, glass, gGreen, gAmber, gCyan, brass...) and the same opts as buildItem; the helpers below are local copies of itemart's.
//   buildMedicalItem(kind, opts, M?) is a stand-alone buildItem for the viewer (uses a small material table of its own when M is not given).
// Budget: 500 triangles each, chamfered boxes, no text. Grip frame: origin at the grip, working end +y (hand tools); the stretcher is two-handed: its origin is its
// centre, long axis z, laid flat (carry.js tickHeld puts the item midway between both hands, level, facing the body's forward).
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

export const DEFS_MEDICAL = {};
const def = (kind, name, cls, build, x = {}) => { DEFS_MEDICAL[kind] = { name, cls, build, ...x }; };

// MED-3 folding stretcher, two-handed. Default: folded (1.0 x 0.5 x 0.13 m: orange bed doubled over, two aluminium poles with rubber handle ends, two straps, a hinge sleeve,
// the legs tucked under). opts.open = true: unfolded 2.0 x 0.5 m on four short legs (floor clutter / a patient carrier prop).
def('stretcher', 'folding stretcher', 'medical', (g, M, o) => {
  const O = orange(), open = !!(o && o.open);
  if (!open) {
    g.add(rb(0.46, 0.026, 0.96, 0.01, O, 0, 0.0, 0)); g.add(rb(0.46, 0.026, 0.96, 0.01, O, 0, 0.034, 0));   // the bed folded in half
    for (const sx of [-1, 1]) { g.add(cyz(0.014, 0.014, 1.1, M.alu, sx * 0.25, 0.017, 0, 8)); g.add(cyz(0.019, 0.019, 0.13, M.rubber, sx * 0.25, 0.017, 0.5, 8)); g.add(cyz(0.019, 0.019, 0.13, M.rubber, sx * 0.25, 0.017, -0.5, 8)); }
    g.add(rb(0.54, 0.062, 0.07, 0.014, M.steel, 0, 0.017, 0));   // hinge sleeve across the fold
    for (const z of [-0.27, 0.27]) { g.add(rb(0.5, 0.072, 0.045, 0.01, M.dark, 0, 0.017, z)); g.add(rb(0.05, 0.03, 0.016, 0.005, M.amber, 0.1, 0.017, z + 0.03)); }
    for (const z of [-0.36, 0.36]) g.add(rb(0.5, 0.016, 0.018, 0.005, M.alu, 0, -0.03, z));   // folded leg frames
  } else {
    g.add(rb(0.46, 0.022, 1.92, 0.01, O, 0, 0, 0)); g.add(rb(0.28, 0.03, 0.3, 0.01, M.white, 0, 0.026, -0.7));   // bed and a head pad
    for (const sx of [-1, 1]) { g.add(cyz(0.014, 0.014, 2.1, M.alu, sx * 0.25, 0.0, 0, 8)); g.add(cyz(0.019, 0.019, 0.13, M.rubber, sx * 0.25, 0.0, 1.03, 8)); g.add(cyz(0.019, 0.019, 0.13, M.rubber, sx * 0.25, 0.0, -1.03, 8)); for (const z of [-0.8, 0.8]) g.add(cy(0.012, 0.012, 0.15, M.alu, sx * 0.25, -0.075, z, 6)); }
    for (const z of [-0.4, 0.05, 0.5]) { g.add(rb(0.5, 0.03, 0.05, 0.01, M.dark, 0, 0.018, z)); g.add(rb(0.05, 0.025, 0.02, 0.005, M.amber, 0.1, 0.034, z)); }
    g.add(rb(0.54, 0.05, 0.06, 0.012, M.steel, 0, 0.0, 0));
  }
}, { cls2: 'two-handed', rest: 0.03 });

// IV fluid bag, lying flat (frame: base): 0.15 x 0.25 m clear pouch with fluid, a hang hole, a spike port and a drip-tube coil
def('iv_bag', 'IV fluid bag', 'medical', (g, M) => {
  const fluid = memo('ivfluid', () => new THREE.MeshStandardMaterial({ color: 0xe6d78a, roughness: 0.3, transparent: true, opacity: 0.8, emissive: 0x403a10 }));
  g.add(rb(0.15, 0.026, 0.25, 0.011, M.glass, 0, 0.013, 0)); g.add(rb(0.12, 0.02, 0.17, 0.008, fluid, 0, 0.013, 0.025)); g.add(rb(0.15, 0.028, 0.03, 0.01, M.cloth2, 0, 0.014, -0.115));
  g.add(cy(0.012, 0.012, 0.02, M.white, 0, 0.012, 0.135, 8).rotateX(PI / 2)); g.add(cy(0.008, 0.008, 0.018, M.red, 0.03, 0.012, 0.135, 8).rotateX(PI / 2)); g.add(cy(0.006, 0.006, 0.03, M.steel, 0, 0.012, 0.155, 6).rotateX(PI / 2));
  g.add(tor(0.012, 0.003, M.rubber, 0, 0.014, -0.125, PI * 2, 4, 8).rotateX(PI / 2)); g.add(bx(0.04, 0.003, 0.012, M.red, -0.045, 0.0285, -0.02));
}, { base: true });

// surgical forceps (haemostat), 0.18 m: two crossed arms with finger rings at the grip end, locking ratchet, serrated tips toward +y
def('forceps', 'surgical forceps', 'medical', (g, M) => {
  for (const s of [-1, 1]) {
    g.add(tor(0.014, 0.0035, M.steel, s * 0.017, -0.045, 0, PI * 2, 4, 10)); g.add(bx(0.007, 0.07, 0.005, M.steel, s * 0.012, -0.01, 0).rotateZ(-s * 0.1));
    g.add(bx(0.007, 0.12, 0.005, M.steel, s * 0.004, 0.08, 0).rotateZ(-s * 0.03)); g.add(bx(0.005, 0.02, 0.005, M.steel, s * 0.0, 0.14, 0));
  }
  g.add(bx(0.024, 0.01, 0.01, M.steel, 0, 0.03, 0)); g.add(rb(0.03, 0.012, 0.008, 0.003, M.alu, 0, 0.018, 0.0)); for (let i = 0; i < 4; i++) g.add(bx(0.016, 0.002, 0.007, M.steel, 0, -0.005 - i * 0.003, 0.0));
  g.add(bx(0.012, 0.012, 0.006, M.dark, 0, 0.145, 0));
}, { lie: true });

// kidney dish (emesis basin), 0.25 x 0.12 x 0.035 m, stainless, with two instruments in it (frame: base)
def('kidney_dish', 'kidney dish', 'medical', (g, M) => {
  const dbl = memo('kdmat', () => new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.85, roughness: 0.3, side: THREE.DoubleSide }));
  const wall = mesh(geo('kdwall', () => new THREE.CylinderGeometry(0.12, 0.09, 0.035, 22, 1, true)), dbl, 0, 0.0175, 0); wall.scale.set(1, 1, 0.5); g.add(wall);
  const fl = cy(0.09, 0.09, 0.004, M.alu, 0, 0.002, 0, 22); fl.scale.set(1, 1, 0.5); g.add(fl);
  g.add(tor(0.12, 0.004, M.steel, 0, 0.035, 0, PI * 2, 4, 22).rotateX(PI / 2)); g.children[g.children.length - 1].scale.set(1, 0.5, 1);
  g.add(bx(0.012, 0.005, 0.1, M.steel, -0.03, 0.012, 0.0).rotateY(0.2)); g.add(bx(0.01, 0.005, 0.085, M.alu, 0.03, 0.012, 0.01).rotateY(-0.15)); g.add(bx(0.06, 0.012, 0.03, M.cloth2, -0.01, 0.01, -0.02));
}, { base: true });

// gauze / crepe bandage roll, 0.1 m wide, 0.07 m diameter, loose tail and a tape strip (frame: base)
def('bandage', 'bandage roll', 'medical', (g, M) => {
  const tape = memo('tape', () => new THREE.MeshStandardMaterial({ color: 0xd9c9a0, roughness: 0.8 }));
  g.add(cy(0.035, 0.035, 0.1, M.cloth2, 0, 0.05, 0, 14)); g.add(cy(0.012, 0.012, 0.102, M.dark, 0, 0.05, 0, 8)); g.add(cy(0.0355, 0.0355, 0.012, tape, 0, 0.05, 0, 14));
  g.add(rb(0.09, 0.004, 0.14, 0.001, M.cloth2, 0, 0.002, 0.09)); g.add(bx(0.012, 0.006, 0.02, M.red, 0, 0.005, 0.15));
}, { base: true });

// name keywords -> kind. Prepend to itemart's KW (first match wins).
export const KW_MEDICAL = [
  [/stretcher|gurney|patient litter|casualty litter|\blitter\b/i, 'stretcher'],
  [/iv bag|iv fluid|infusion bag|saline|drip bag|plasma bag|blood bag|fluid bag|ringer/i, 'iv_bag'],
  [/forceps|haemostat|hemostat|retractor|needle holder|tweezers|suture|surgical clamp|arterial clamp/i, 'forceps'],
  [/kidney dish|kidney tray|emesis|bedpan|dressing dish|specimen pot/i, 'kidney_dish'],
  [/bandage|gauze|splint|crepe|dressing roll|medical tape|surgical tape/i, 'bandage'],
];

// ---------------------------------------------------------------- stand-alone builder (viewer and tests; itemart.js buildItem does the same once DEFS_MEDICAL is spread in)
let FM = null;
function fallbackMats() {
  if (FM) return FM; const S = (o) => new THREE.MeshStandardMaterial(o), glow = (c) => S({ color: new THREE.Color(c).multiplyScalar(0.25), emissive: c, emissiveIntensity: 1.8 });
  return FM = { steel: S({ color: 0xb4bac2, metalness: 0.9, roughness: 0.3 }), alu: S({ color: 0xd0d4da, metalness: 0.75, roughness: 0.45 }), white: S({ color: 0xe9edef, roughness: 0.36 }), red: S({ color: 0xc4382e, roughness: 0.4 }),
    amber: S({ color: 0xe19a22, roughness: 0.42 }), rubber: S({ color: 0x15161a, roughness: 0.92 }), dark: S({ color: 0x24272d, roughness: 0.5 }), gun: S({ color: 0x3b414b, metalness: 0.8, roughness: 0.38 }), grey: S({ color: 0x9aa1a8, roughness: 0.5 }),
    cloth: S({ color: 0xaec2d8, roughness: 0.95 }), cloth2: S({ color: 0xe7e9e4, roughness: 0.95 }), glass: S({ color: 0xcfe6ee, roughness: 0.05, transparent: true, opacity: 0.38, depthWrite: false }), gGreen: glow(0x38ff8c), gAmber: glow(0xffa21a), gCyan: glow(0x30d4ff) };
}
export function buildMedicalItem(kind, opts = {}, M = null) {
  const d = DEFS_MEDICAL[kind]; if (!d) return null; M = M || fallbackMats();
  const inner = new THREE.Group(); inner.name = 'item:' + kind; d.build(inner, M, opts);
  const frame = opts.frame || (d.base ? 'base' : 'grip'), out = new THREE.Group(); out.name = 'item:' + kind; out.add(inner);
  if (frame === 'base' || d.base) { const b = new THREE.Box3().setFromObject(out); inner.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); out.userData.rest = 0; }
  else out.userData.rest = d.rest ?? 0.01;
  let n = 0; out.traverse(m => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
  out.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(out);
  Object.assign(out.userData, { item: kind, lie: false, frame, size: b.getSize(new THREE.Vector3()).toArray(), tris: Math.round(n) }); return out;
}
