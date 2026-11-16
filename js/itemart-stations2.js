// itemart-stations2.js: batch 7 item art (transporter room), same row format as js/itemart.js DEFS / KW. Pure three.js, no game imports.
//   import { DEFS_STATIONS2, KW_STATIONS2, buildStations2Item } from './itemart-stations2.js';
//   integrator: in itemart.js `Object.assign(DEFS, DEFS_STATIONS2)` after the `def(...)` block and `KW.unshift(...KW_STATIONS2)` (rows must come before the existing ones: 'coil' would otherwise
//   match a wall-coil / part kind).  ITEMS (js/equipment.js) gains `coil_cartridge`, id equal to the model kind.  See docs/propart-stations2.md.
//   DEFS_STATIONS2[kind] = { name, cls, build(g, M, o), base?, lie?, rest? }; M is itemart's material table (steel, alu, white, red, amber, rubber, dark, gun, grey, cloth, cloth2, glass, gGreen, gAmber, gCyan, brass).
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

export const DEFS_STATIONS2 = {};
const def = (kind, name, cls, build, x = {}) => { DEFS_STATIONS2[kind] = { name, cls, build, ...x }; };
const copper = () => memo('copper', () => new THREE.MeshStandardMaterial({ color: 0xb8703c, metalness: 0.85, roughness: 0.35 }));
const sleeve = () => memo('coilsleeve', () => new THREE.MeshStandardMaterial({ color: 0xcfe6ee, roughness: 0.08, transparent: true, opacity: 0.3, depthWrite: false }));

// OPS-5 emitter coil cartridge: plug-in induction coil, copper-wound ring 0.25 m across x 0.08 m thick in a clear sleeve, two blade contacts on a keyed shoe at the rim,
// a fold-flat carry handle (shown folded across the ring's bore) and a drift-status lamp. Lies flat (base frame).
def('coil_cartridge', 'emitter coil cartridge', 'engineering', (g, M) => {
  const R = 0.087, r = 0.037, C = copper();
  g.add(tor(R, r, C, 0, 0.04, 0, PI * 2, 5, 14).rotateX(PI / 2));                                                   // copper winding
  g.add(tor(R, r + 0.005, sleeve(), 0, 0.04, 0, PI * 2, 4, 14).rotateX(PI / 2));                                    // clear sleeve
  for (let i = 0; i < 4; i++) { const a = i * PI / 2 + 0.4; g.add(bx(0.014, 0.084, 0.02, M.dark, Math.cos(a) * R, 0.04, Math.sin(a) * R).rotateY(-a)); }   // binding clips round the ring
  g.add(bx(0.07, 0.05, 0.05, M.gun, R + 0.052, 0.04, 0));                                                          // keyed shoe
  for (const s of [-1, 1]) g.add(bx(0.04, 0.014, 0.008, M.brass, R + 0.098, 0.04, s * 0.014));                      // blade contacts
  g.add(bx(0.012, 0.012, 0.012, M.gAmber, R + 0.05, 0.068, 0));                                                    // drift lamp
  g.add(bx(0.21, 0.012, 0.02, M.alu, 0, 0.082, 0)); for (const s of [-1, 1]) g.add(bx(0.016, 0.03, 0.026, M.steel, s * 0.104, 0.07, 0));   // handle folded flat + hinge lugs
  g.add(bx(0.06, 0.014, 0.024, M.rubber, 0, 0.09, 0));                                                             // handle grip pad
}, { base: true });

export const KW_STATIONS2 = [
  [/emitter coil|coil cartridge|induction coil|transporter coil|pad coil|spare coil|coil module/i, 'coil_cartridge'],
];

// ---------------------------------------------------------------- stand-alone builder (viewer and tests; itemart.js buildItem does the same once DEFS_STATIONS2 is spread in)
let FM = null;
function fallbackMats() {
  if (FM) return FM; const S = (o) => new THREE.MeshStandardMaterial(o), glow = (c) => S({ color: new THREE.Color(c).multiplyScalar(0.25), emissive: c, emissiveIntensity: 1.8 });
  return FM = { steel: S({ color: 0xb4bac2, metalness: 0.9, roughness: 0.3 }), alu: S({ color: 0xd0d4da, metalness: 0.75, roughness: 0.45 }), white: S({ color: 0xe9edef, roughness: 0.36 }), red: S({ color: 0xc4382e, roughness: 0.4 }),
    amber: S({ color: 0xe19a22, roughness: 0.42 }), rubber: S({ color: 0x15161a, roughness: 0.92 }), dark: S({ color: 0x24272d, roughness: 0.5 }), gun: S({ color: 0x3b414b, metalness: 0.8, roughness: 0.38 }), grey: S({ color: 0x9aa1a8, roughness: 0.5 }),
    cloth: S({ color: 0xaec2d8, roughness: 0.95 }), cloth2: S({ color: 0xe7e9e4, roughness: 0.95 }), glass: S({ color: 0xcfe6ee, roughness: 0.05, transparent: true, opacity: 0.38, depthWrite: false }), gGreen: glow(0x38ff8c), gAmber: glow(0xffa21a), gCyan: glow(0x30d4ff) };
}
export function buildStations2Item(kind, opts = {}, M = null) {
  const d = DEFS_STATIONS2[kind]; if (!d) return null; M = M || fallbackMats();
  const inner = new THREE.Group(); inner.name = 'item:' + kind; d.build(inner, M, opts);
  const frame = opts.frame || (d.base ? 'base' : 'grip'), out = new THREE.Group(); out.name = 'item:' + kind; out.add(inner);
  if (frame === 'base' || d.base) { const b = new THREE.Box3().setFromObject(out); inner.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); out.userData.rest = 0; }
  else out.userData.rest = d.rest ?? 0.01;
  let n = 0; out.traverse(m => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
  out.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(out);
  Object.assign(out.userData, { item: kind, lie: false, frame, size: b.getSize(new THREE.Vector3()).toArray(), tris: Math.round(n) }); return out;
}
