// itemart-polish.js: batch 11 item art (polish): FLT-7 tether, OPS-7 headset, ENG-12 light panel, ENG-13 injector spare, X-2 stool / lamp / meter / snips / tape / frame.
// Same row format as js/itemart.js DEFS / KW. Pure three.js, no game imports.
//   import { DEFS_POLISH, KW_POLISH, buildPolishItem } from './itemart-polish.js';
//   integrator: in itemart.js `Object.assign(DEFS, DEFS_POLISH)` after the `def(...)` block and `KW.unshift(...KW_POLISH)` (rows must come before the generic ones:
//   'lamp' / 'tape' / 'meter' / 'tether' would otherwise fall to flashlight / tool / hose). docs/propart-polish.md has the exact snippet.
//   DEFS_POLISH[kind] = { name, cls, build(g, M, o), base?, lie?, rest?, cls2? }: build gets itemart's material table M (steel, alu, white, red, amber, rubber, dark, gun, grey,
//   cloth, cloth2, glass, gGreen, gAmber, gCyan, brass) and the same opts as buildItem. buildPolishItem(kind, opts, M?) is a stand-alone buildItem for the viewer.
// Budget 500 triangles each, chamfered boxes, no text. Frame 'base' = origin at the bottom centre (lying on a surface); grip frame = origin at the grip, working end +y.
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
const S = (o) => new THREE.MeshStandardMaterial(o);
const webbing = () => memo('webbing', () => S({ color: 0xe0b020, roughness: 0.9 }));
const frost = () => memo('frost', () => new THREE.MeshStandardMaterial({ color: 0xf4f8ff, emissive: 0xdfe8ff, emissiveIntensity: 0.9, roughness: 0.5 }));
const picture = () => memo('picture', () => S({ color: 0x8fb0c4, roughness: 0.6 }));
const wood = () => memo('wood', () => S({ color: 0x8a5a34, roughness: 0.7 }));

export const DEFS_POLISH = {};
const def = (kind, name, cls, build, x = {}) => { DEFS_POLISH[kind] = { name, cls, build, ...x }; };

// FLT-7 safety tether (fall-arrest lanyard), 0.2 m coiled bundle: five webbing loops, a shock-absorber pack, a double-action hook at each end (frame: base)
def('tether', 'safety tether', 'tools', (g, M) => {
  const W = webbing();
  for (let i = 0; i < 4; i++) g.add(tor(0.075, 0.011, W, 0, 0.02 + i * 0.026, 0, PI * 2, 3, 12).rotateX(PI / 2));
  g.add(rb(0.07, 0.15, 0.04, 0.012, M.red, 0.0, 0.06, 0.09));                                  // shock-absorber pack
  g.add(bx(0.05, 0.12, 0.006, M.dark, 0.0, 0.06, 0.112));
  for (const s of [-1, 1]) {
    const x = s * 0.085;
    g.add(bx(0.03, 0.01, 0.004, W, x, 0.075, 0.0));
    g.add(rb(0.025, 0.05, 0.016, 0.005, M.steel, x, 0.035, 0.0));                                  // hook body
    g.add(bx(0.008, 0.045, 0.006, M.amber, x + s * 0.012, 0.058, 0.0).rotateZ(-s * 0.4));         // gate
  }
}, { base: true, cls2: 'tool' });

// OPS-7 headset with boom microphone, 0.18 m wide: padded band, one 70 mm ear cup, a 0.12 m boom with a foam mic tip (frame: base, standing on the cup)
def('headset', 'headset with boom mic', 'tools', (g, M) => {
  g.add(tor(0.09, 0.007, M.dark, 0, 0.1, 0, PI, 3, 10));                                        // band, arc over the top
  g.add(rb(0.12, 0.016, 0.03, 0.007, M.rubber, 0, 0.19, 0));                                   // head pad
  for (const s of [-1, 1]) g.add(bx(0.007, 0.07, 0.01, M.alu, s * 0.09, 0.075, 0));
  g.add(cyx(0.035, 0.035, 0.03, M.dark, 0.1, 0.035, 0, 10)); g.add(cyx(0.028, 0.028, 0.008, M.rubber, 0.087, 0.035, 0, 8)); g.add(cyx(0.03, 0.03, 0.01, M.gun, 0.118, 0.035, 0, 8));
  g.add(cyx(0.03, 0.03, 0.012, M.rubber, -0.1, 0.035, 0, 8));                                  // plain pad on the other side
  g.add(tor(0.05, 0.004, M.gun, 0.115, 0.01, 0.045, PI * 0.6, 3, 6).rotateY(0.3));            // boom arc forward
  g.add(cy(0.011, 0.011, 0.03, M.dark, 0.1, 0.012, 0.095, 8)); g.add(sph(0.012, M.red, 0.1, 0.012, 0.115));
}, { base: true });

// ENG-12 spare light panel: LED troffer 0.6 x 0.3 x 0.04 m, frosted face, two spring clips, a pigtail connector; carried flat in both hands (frame: base, face up)
def('light_panel', 'spare light panel', 'engineering', (g, M) => {
  g.add(rb(0.6, 0.04, 0.3, 0.008, M.alu, 0, 0.02, 0)); g.add(bx(0.56, 0.004, 0.26, frost(), 0, 0.041, 0));
  g.add(bx(0.57, 0.006, 0.008, M.steel, 0, 0.041, 0.13)); g.add(bx(0.57, 0.006, 0.008, M.steel, 0, 0.041, -0.13));
  for (const x of [-0.2, 0.2]) { g.add(rb(0.05, 0.012, 0.02, 0.004, M.steel, x, 0.046, 0.155)); g.add(bx(0.04, 0.02, 0.004, M.steel, x, 0.012, 0.162)); }
  g.add(cy(0.004, 0.004, 0.14, M.rubber, 0.26, 0.004, -0.2, 6).rotateZ(PI / 2)); g.add(rb(0.03, 0.016, 0.02, 0.004, M.white, 0.36, 0.01, -0.2));
}, { base: true, cls2: 'two-handed' });

// ENG-13 spare plasma injector, 0.5 m, in a slatted open crate 0.62 x 0.3 x 0.3: ribbed barrel, nozzle cone, feed fitting, trim wheel (frame: base)
def('injector_spare', 'spare plasma injector', 'engineering', (g, M) => {
  const W = wood();
  g.add(bx(0.62, 0.02, 0.3, W, 0, 0.01, 0));
  for (const z of [-0.14, 0.14]) { g.add(bx(0.62, 0.02, 0.02, W, 0, 0.03, z)); g.add(bx(0.62, 0.02, 0.02, W, 0, 0.17, z)); g.add(bx(0.62, 0.02, 0.02, W, 0, 0.29, z)); }
  for (const x of [-0.3, 0.3]) for (const z of [-0.14, 0.14]) g.add(bx(0.02, 0.3, 0.02, W, x, 0.15, z));
  g.add(bx(0.02, 0.2, 0.26, W, -0.3, 0.12, 0)); g.add(bx(0.02, 0.2, 0.26, W, 0.3, 0.12, 0));
  g.add(cyx(0.06, 0.06, 0.36, M.steel, -0.02, 0.17, 0, 10));
  for (let i = 0; i < 4; i++) g.add(cyx(0.068, 0.068, 0.02, M.gun, -0.12 + i * 0.07, 0.17, 0, 10));
  g.add(cyx(0.0, 0.06, 0.12, M.alu, 0.22, 0.17, 0, 8).rotateZ(0)); g.children[g.children.length - 1].rotation.z = -PI / 2;
  g.add(cyx(0.03, 0.03, 0.06, M.brass, -0.23, 0.17, 0, 10)); g.add(cy(0.014, 0.014, 0.08, M.brass, -0.12, 0.24, 0, 8));
  g.add(tor(0.025, 0.005, M.red, -0.12, 0.29, 0, PI * 2, 3, 8).rotateX(PI / 2));
}, { base: true, cls2: 'two-handed' });

// X-2 stool: 0.3 m round seat on three splayed legs at 0.45 m with a foot ring (frame: base)
def('stool', 'stool', 'furniture', (g, M) => {
  g.add(cy(0.15, 0.15, 0.03, M.cloth, 0, 0.43, 0, 16)); g.add(cy(0.155, 0.155, 0.015, M.dark, 0, 0.42, 0, 16));
  for (let i = 0; i < 3; i++) { const a = i * PI * 2 / 3 + 0.5, c = Math.cos(a), s = Math.sin(a); const l = cy(0.014, 0.011, 0.44, M.steel, c * 0.12, 0.21, s * 0.12, 6); l.rotation.set(s * 0.12, 0, -c * 0.12); g.add(l); g.add(cy(0.018, 0.018, 0.012, M.rubber, c * 0.14, 0.006, s * 0.14, 6)); }
  g.add(tor(0.135, 0.007, M.steel, 0, 0.19, 0, PI * 2, 4, 14).rotateX(PI / 2));
}, { base: true });

// X-2 desk / bench lamp, 0.4 m: weighted base, two arm segments with a spring, a conical hood and a bulb (frame: base)
def('lamp', 'articulated lamp', 'furniture', (g, M) => {
  g.add(cy(0.07, 0.075, 0.025, M.dark, 0, 0.0125, 0, 16)); g.add(cy(0.012, 0.012, 0.04, M.steel, 0, 0.045, 0, 8));
  g.add(bx(0.012, 0.2, 0.012, M.steel, 0, 0.14, 0).rotateZ(0.0)); const a2 = bx(0.012, 0.2, 0.012, M.steel, 0.05, 0.31, 0); a2.rotation.z = -0.5; g.add(a2);
  g.add(sph(0.016, M.amber, 0, 0.23, 0)); g.add(sph(0.016, M.amber, 0.105, 0.39, 0));
  const hood = cy(0.07, 0.025, 0.07, M.amber, 0.14, 0.38, 0, 14); hood.rotation.z = -1.0; g.add(hood);
  g.add(sph(0.022, M.gAmber, 0.168, 0.35, 0, 8));
}, { base: true });

// X-2 hand meter / tester, 0.15 m: handset with a lit screen, a dial, two buttons and a probe on a coiled lead (frame: base, lying)
def('meter', 'hand meter', 'tools', (g, M) => {
  g.add(rb(0.075, 0.03, 0.15, 0.01, M.amber, 0, 0.015, 0)); g.add(rb(0.05, 0.004, 0.045, 0.002, M.gGreen, 0, 0.031, -0.03)); g.add(cy(0.015, 0.015, 0.012, M.dark, 0, 0.036, 0.03, 10));
  g.add(bx(0.012, 0.006, 0.012, M.red, -0.02, 0.033, 0.058)); g.add(bx(0.012, 0.006, 0.012, M.grey, 0.02, 0.033, 0.058));
  g.add(cy(0.006, 0.006, 0.06, M.rubber, 0, 0.016, -0.105, 6).rotateX(PI / 2));
  g.add(tor(0.025, 0.004, M.rubber, 0.1, 0.005, -0.08, PI * 2, 3, 10).rotateX(PI / 2));
  g.add(cy(0.007, 0.004, 0.09, M.steel, 0.12, 0.007, -0.03, 6).rotateX(PI / 2));
}, { base: true });

// X-2 snips / scissors, 0.18 m: two finger rings, crossed blades, a pivot screw (grip frame: origin at the pivot, tips +y)
def('snips', 'snips', 'tools', (g, M) => {
  for (const s of [-1, 1]) {
    g.add(tor(0.016, 0.004, M.red, s * 0.02, -0.055, 0, PI * 2, 4, 12)); g.add(bx(0.007, 0.05, 0.004, M.steel, s * 0.012, -0.025, 0).rotateZ(-s * 0.2));
    g.add(bx(0.008, 0.11, 0.003, M.steel, s * 0.004, 0.06, s * 0.002).rotateZ(-s * 0.05));
  }
  g.add(cy(0.006, 0.006, 0.012, M.dark, 0, 0, 0, 8).rotateX(PI / 2));
}, { lie: true });

// X-2 tape roll, 0.1 m: a 0.05 m wide band on a card core with a free tail (frame: base)
def('tape', 'tape roll', 'tools', (g, M) => {
  const T = memo('tapeyel', () => S({ color: 0xd8a818, roughness: 0.6 }));
  g.add(cy(0.05, 0.05, 0.045, T, 0, 0.0225, 0, 18)); g.add(cy(0.03, 0.03, 0.047, M.cloth2, 0, 0.0235, 0, 14)); g.add(cy(0.0495, 0.0495, 0.012, M.dark, 0, 0.012, 0, 18));
  g.add(rb(0.05, 0.002, 0.07, 0.0005, T, 0.07, 0.001, 0.02));
}, { base: true });

// X-2 stand-up photo frame, 0.18 x 0.13 m: wooden frame, plain blue-grey picture, a folding back strut (frame: base)
def('frame', 'photo frame', 'furniture', (g, M) => {
  const W = wood(), t = -0.18;
  const fr = new THREE.Group(); fr.position.set(0, 0.065, 0); fr.rotation.x = t; g.add(fr);
  fr.add(rb(0.18, 0.13, 0.014, 0.004, W, 0, 0, 0)); fr.add(bx(0.15, 0.1, 0.004, picture(), 0, 0, 0.008)); fr.add(bx(0.06, 0.02, 0.003, M.cloth2, -0.03, 0.01, 0.011));
  const st = bx(0.012, 0.11, 0.004, W, 0, 0.05, -0.04); st.rotation.x = 0.5; g.add(st);
}, { base: true });

// name keywords -> kind. Prepend to itemart's KW (first match wins).
export const KW_POLISH = [
  [/safety tether|tether|lanyard|fall.?arrest|safety line|lifeline/i, 'tether'],
  [/head ?set|boom mic|headphone/i, 'headset'],
  [/light panel|troffer|led panel|ceiling panel|spare panel|lighting panel/i, 'light_panel'],
  [/plasma injector|fuel injector|injector, spare|constrictor coil segment/i, 'injector_spare'],
  [/step stool|\bstool\b|footstool/i, 'stool'],
  [/desk lamp|bench lamp|task lamp|\blamp\b(?!, hand)|reading light/i, 'lamp'],
  [/multimeter|hand meter|soil meter|\btester\b|probe meter|moisture meter|\bmeter\b(?!, wall)/i, 'meter'],
  [/scissors|shears|snips|tin snips|trauma shears/i, 'snips'],
  [/\btape\b|duct tape|masking tape|gaffer|tape roll/i, 'tape'],
  [/photo frame|picture frame|\bframe\b, photo|framed photo|model ship|photograph/i, 'frame'],
];

// ---------------------------------------------------------------- stand-alone builder (viewer and tests; itemart.js buildItem does the same once DEFS_POLISH is spread in)
let FM = null;
function fallbackMats() {
  if (FM) return FM; const glow = (c) => S({ color: new THREE.Color(c).multiplyScalar(0.25), emissive: c, emissiveIntensity: 1.8 });
  return FM = { steel: S({ color: 0xb4bac2, metalness: 0.9, roughness: 0.3 }), alu: S({ color: 0xd0d4da, metalness: 0.75, roughness: 0.45 }), white: S({ color: 0xe9edef, roughness: 0.36 }), red: S({ color: 0xc4382e, roughness: 0.4 }),
    amber: S({ color: 0xe19a22, roughness: 0.42 }), rubber: S({ color: 0x15161a, roughness: 0.92 }), dark: S({ color: 0x24272d, roughness: 0.5 }), gun: S({ color: 0x3b414b, metalness: 0.8, roughness: 0.38 }), grey: S({ color: 0x9aa1a8, roughness: 0.5 }),
    cloth: S({ color: 0xaec2d8, roughness: 0.95 }), cloth2: S({ color: 0xe7e9e4, roughness: 0.95 }), glass: S({ color: 0xcfe6ee, roughness: 0.05, transparent: true, opacity: 0.38, depthWrite: false }), brass: S({ color: 0xc09040, metalness: 0.8, roughness: 0.4 }), gGreen: glow(0x38ff8c), gAmber: glow(0xffa21a), gCyan: glow(0x30d4ff) };
}
export function buildPolishItem(kind, opts = {}, M = null) {
  const d = DEFS_POLISH[kind]; if (!d) return null; M = M || fallbackMats();
  const inner = new THREE.Group(); inner.name = 'item:' + kind; d.build(inner, M, opts);
  const frame = opts.frame || (d.base ? 'base' : 'grip'), out = new THREE.Group(); out.name = 'item:' + kind; out.add(inner);
  if (frame === 'base' || d.base) { const b = new THREE.Box3().setFromObject(out); inner.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); out.userData.rest = 0; }
  else out.userData.rest = d.rest ?? 0.01;
  let n = 0; out.traverse(m => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
  out.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(out);
  Object.assign(out.userData, { item: kind, lie: false, frame, size: b.getSize(new THREE.Vector3()).toArray(), tris: Math.round(n) }); return out;
}
export const POLISH_ITEM_KINDS = Object.keys(DEFS_POLISH);
