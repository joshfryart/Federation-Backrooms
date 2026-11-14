// propart-medical.js — batch 4 (sickbay and morgue): original procedural props, pure three.js (no game imports).
//   import { kinds, META, KIND_LIST } from './propart-medical.js';
//   kinds.surgical_table(m, h) -> THREE.Group      (m, h are world.js' mats()/helpers; accepted for the batch contract but unused: every material,
//                                                   geometry and canvas texture below is created once and shared)
// Conventions (as buildProp in js/world.js): origin at the floor centre of a TS (2.5 m) tile, front faces +z, y up, metres.
// Wall pieces (gas_panel, stretcher_rack) have the origin on the wall line at floor level and stand out toward +z (wall at z = 0).
// Ceiling pieces (holo_emitter) are built for the 3.2 m wall height (CEIL below) with the origin at floor level, so the group is placed at the tile centre.
// group.userData = { top, mount, size:[w,h,d], spots:{ name: { pos:[x,y,z], ry } }, ... }: documented in docs/propart-medical.md.
//   spots[...].ry is the yaw a person standing there needs to face the work (forward = (sin ry, cos ry) on x, z).
// Triangle budget ~1500 per prop (chamfered boxes are 44 triangles, round parts are 10-24 segments).
import * as THREE from 'three';

const PI = Math.PI, CEIL = 3.2;
const HAS_DOM = typeof document !== 'undefined';

// ---------------------------------------------------------------- caches
const GEO = new Map(), TEX = new Map(); let MATS = null;
const geo = (key, f) => { let g = GEO.get(key); if (!g) { g = f(); GEO.set(key, g); } return g; };
function canvasTex(key, w, h, draw) {
  if (!HAS_DOM) return null; if (TEX.has(key)) return TEX.get(key);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d'); draw(c, w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; TEX.set(key, t); return t;
}

// ---------------------------------------------------------------- generated screens and decals (bars, dials and dots only: no text)
const tex_dial = () => canvasTex('dial', 128, 128, (c, s) => {
  c.fillStyle = '#f2f2ec'; c.fillRect(0, 0, s, s); c.translate(64, 70); c.strokeStyle = '#222'; c.lineWidth = 3;
  for (let i = 0; i <= 12; i++) { const a = PI * 0.8 + (i / 12) * PI * 1.4; const r0 = i % 3 ? 44 : 38; c.beginPath(); c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); c.lineTo(Math.cos(a) * 52, Math.sin(a) * 52); c.stroke(); }
  c.strokeStyle = '#c0382e'; c.lineWidth = 7; c.beginPath(); c.arc(0, 0, 58, PI * 1.85, PI * 2.2); c.stroke();
  c.strokeStyle = '#111'; c.lineWidth = 4; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(PI * 1.45) * 40, Math.sin(PI * 1.45) * 40); c.stroke(); c.fillStyle = '#111'; c.beginPath(); c.arc(0, 0, 6, 0, 7); c.fill();
});
const tex_touch = () => canvasTex('touch', 256, 160, (c, w, h) => {   // dispenser touch panel: six drawer tiles, status bars
  c.fillStyle = '#04100c'; c.fillRect(0, 0, w, h); c.fillStyle = '#2ee89a';
  for (let i = 0; i < 6; i++) { const x = 12 + (i % 3) * 80, y = 14 + Math.floor(i / 3) * 56; c.globalAlpha = i === 4 ? 1 : 0.55; c.fillRect(x, y, 68, 44); c.globalAlpha = 1; c.fillStyle = '#04100c'; c.fillRect(x + 8, y + 10, 38, 6); c.fillRect(x + 8, y + 24, 24, 6); c.fillStyle = '#2ee89a'; }
  c.fillRect(12, 128, 160, 8); c.fillStyle = '#f0a24a'; c.fillRect(182, 124, 56, 16);
});
const tex_cycle = () => canvasTex('cycle', 128, 64, (c, w, h) => {   // steriliser control display: temperature curve and cycle bar
  c.fillStyle = '#05080c'; c.fillRect(0, 0, w, h); c.strokeStyle = '#ffb028'; c.lineWidth = 3; c.beginPath(); for (let x = 4; x < w - 4; x += 3) { const y = 48 - Math.min(34, x * 0.55) + (x > 96 ? (x - 96) * 0.8 : 0); x < 8 ? c.moveTo(x, y) : c.lineTo(x, y); } c.stroke();
  c.fillStyle = '#ffb028'; c.fillRect(8, 54, 74, 5); c.fillStyle = '#38ff8c'; c.fillRect(92, 8, 28, 10);
});
const tex_pump = () => canvasTex('pump', 64, 64, (c, s) => { c.fillStyle = '#04100c'; c.fillRect(0, 0, s, s); c.fillStyle = '#58f0a0'; c.fillRect(6, 8, 34, 10); c.fillRect(6, 24, 22, 8); c.fillStyle = '#f0a24a'; c.fillRect(6, 40, 46, 5); c.fillStyle = '#58f0a0'; c.fillRect(6, 50, 12, 5); });
const tex_perf = () => canvasTex('perf', 64, 256, (c, w, h) => { c.fillStyle = '#3d434b'; c.fillRect(0, 0, w, h); c.fillStyle = '#0b0d10'; for (let y = 6; y < h; y += 10) for (let x = 7; x < w; x += 10) { c.beginPath(); c.arc(x + ((y / 10) % 2) * 5, y, 2.4, 0, 7); c.fill(); } });
const tex_flow = () => canvasTex('flow', 32, 128, (c, w, h) => { c.fillStyle = '#e8eef0'; c.fillRect(0, 0, w, h); c.fillStyle = '#222'; for (let i = 0; i < 12; i++) c.fillRect(i % 2 ? 6 : 2, 8 + i * 9.5, i % 2 ? 20 : 28, 2); });
const tex_bars = (key, col) => canvasTex('bars' + key, 64, 32, (c, w, h) => { c.fillStyle = '#04070c'; c.fillRect(0, 0, w, h); c.fillStyle = col; for (let i = 0; i < 5; i++) c.fillRect(4, 3 + i * 6, 14 + ((i * 23) % 44), 3); });

// ---------------------------------------------------------------- shared materials
function mm() {
  if (MATS) return MATS; const S = (o) => new THREE.MeshStandardMaterial(o), B = (c) => new THREE.MeshBasicMaterial({ color: c });
  const scr = (tex, k = 1.35) => new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(k, k, k) });
  return MATS = {
    steel: S({ color: 0xd2d6dc, metalness: 0.8, roughness: 0.34 }), steelD: S({ color: 0xa2a8b0, metalness: 0.75, roughness: 0.5 }), white: S({ color: 0xe8edef, roughness: 0.34, metalness: 0.05 }),
    panel: S({ color: 0xc6ccd2, roughness: 0.45, metalness: 0.3 }), dark: S({ color: 0x23262d, roughness: 0.5, metalness: 0.4 }), rubber: S({ color: 0x131417, roughness: 0.9 }),
    teal: S({ color: 0x2f7f7a, roughness: 0.55 }), blue: S({ color: 0x4f7d9c, roughness: 0.55 }), green: S({ color: 0x2f9a5a, roughness: 0.45 }), orange: S({ color: 0xe0661e, roughness: 0.6 }),
    paper: S({ color: 0xeef1ee, roughness: 0.95 }), cloth: S({ color: 0xd3dbdf, roughness: 0.97 }), brass: S({ color: 0xc9a24a, metalness: 0.85, roughness: 0.35 }),
    glass: S({ color: 0xcfe6ee, roughness: 0.06, transparent: true, opacity: 0.3, depthWrite: false }), bag: S({ color: 0xe3eef2, roughness: 0.2, transparent: true, opacity: 0.5, depthWrite: false }),
    fluid: S({ color: 0xe6d78a, roughness: 0.3, transparent: true, opacity: 0.75, emissive: 0x403a10 }), fluid2: S({ color: 0xc9dff2, roughness: 0.3, transparent: true, opacity: 0.7, emissive: 0x10202c }),
    gGreen: B(0x38ff8c), gAmber: B(0xffa21a), gRed: B(0xff3c2a), gCyan: B(0x30d4ff), led: B(0xfff4d8),
    o2: S({ color: 0xf4f4f0, roughness: 0.4 }), air: S({ color: 0x17181a, roughness: 0.4 }), vac: S({ color: 0xe3b812, roughness: 0.4 }),
    dial: scr(tex_dial(), 1.1), touch: scr(tex_touch()), cycle: scr(tex_cycle()), pump: scr(tex_pump()), flow: scr(tex_flow(), 1.0), bars: scr(tex_bars('c', '#38e8c0')),
    perf: S({ map: tex_perf(), roughness: 0.6, metalness: 0.6 }),
    holoGlow: new THREE.MeshBasicMaterial({ color: 0x6ad8ff, transparent: true, opacity: 0.85 }),
  };
}

// ---------------------------------------------------------------- geometry helpers. y is the BOTTOM of boxes and cylinders (like buildProp's rbox / cyl); yc = centre for the lying parts.
function bevelGeo(w, h, d, r) {   // chamfered box, 44 triangles, flat shaded (same construction as js/itemart.js)
  const H = [w / 2, h / 2, d / 2], P = [], idx = new Map(), at = (a, s0, s1, s2) => { const k = a + '|' + s0 + s1 + s2; if (idx.has(k)) return idx.get(k); const sg = [s0, s1, s2], v = [0, 0, 0]; for (let i = 0; i < 3; i++) v[i] = sg[i] * (i === a ? H[i] : H[i] - r); P.push(v); idx.set(k, P.length - 1); return P.length - 1; };
  const T = [], S = [-1, 1], tri = (a, b, c) => T.push([a, b, c]), quad = (a, b, c, d2) => { tri(a, b, c); tri(a, c, d2); };
  for (let a = 0; a < 3; a++) for (const sa of S) { const o = [0, 1, 2].filter(i => i !== a), g = (t, u) => { const sg = [0, 0, 0]; sg[a] = sa; sg[o[0]] = t; sg[o[1]] = u; return at(a, ...sg); }; quad(g(-1, -1), g(1, -1), g(1, 1), g(-1, 1)); }
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) { const c = 3 - a - b; for (const sa of S) for (const sb of S) { const g = (aa, sc) => { const sg = [0, 0, 0]; sg[a] = sa; sg[b] = sb; sg[c] = sc; return at(aa, ...sg); }; quad(g(a, -1), g(a, 1), g(b, 1), g(b, -1)); } }
  for (const sx of S) for (const sy of S) for (const sz of S) tri(at(0, sx, sy, sz), at(1, sx, sy, sz), at(2, sx, sy, sz));
  const pos = []; for (const t of T) { const [A, B, C] = t.map(i => P[i]); const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]], n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const dot = n[0] * (A[0] + B[0] + C[0]) + n[1] * (A[1] + B[1] + C[1]) + n[2] * (A[2] + B[2] + C[2]); pos.push(...A, ...(dot < 0 ? [C, B] : [B, C]).flat()); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  const uv = [], nr = g.attributes.normal; for (let i = 0; i < pos.length / 3; i++) { const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], ax = Math.abs(nr.getX(i)), ay = Math.abs(nr.getY(i)), az = Math.abs(nr.getZ(i)); if (ay >= ax && ay >= az) uv.push(x / w + 0.5, z / d + 0.5); else if (ax >= az) uv.push(z / d + 0.5, y / h + 0.5); else uv.push(x / w + 0.5, y / h + 0.5); }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return g;
}
const put = (o, x, y, z) => { o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o; };
const rb = (w, h, d, r, m, x = 0, y = 0, z = 0) => { r = Math.min(r * 0.8, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4); return put(new THREE.Mesh(geo(`rb${w}|${h}|${d}|${r}`, () => bevelGeo(w, h, d, r)), m), x, y + h / 2, z); };
const bx = (w, h, d, m, x = 0, y = 0, z = 0) => put(new THREE.Mesh(geo(`bx${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d)), m), x, y + h / 2, z);
const cy = (rt, rbm, h, m, x = 0, y = 0, z = 0, seg = 14) => put(new THREE.Mesh(geo(`cy${rt}|${rbm}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rbm, h, seg)), m), x, y + h / 2, z);
const cyX = (rt, rbm, len, m, x = 0, yc = 0, z = 0, seg = 12) => { const o = put(new THREE.Mesh(geo(`cy${rt}|${rbm}|${len}|${seg}`, () => new THREE.CylinderGeometry(rt, rbm, len, seg)), m), x, yc, z); o.rotation.z = PI / 2; return o; };   // axis along x
const cyZ = (rt, rbm, len, m, x = 0, yc = 0, z = 0, seg = 12) => { const o = put(new THREE.Mesh(geo(`cy${rt}|${rbm}|${len}|${seg}`, () => new THREE.CylinderGeometry(rt, rbm, len, seg)), m), x, yc, z); o.rotation.x = PI / 2; return o; };   // axis along z
const sph = (r, m, x = 0, yc = 0, z = 0, sx = 1, sy = 1, sz = 1, sw = 8, sh = 5) => { const o = put(new THREE.Mesh(geo(`sp${r}|${sw}|${sh}`, () => new THREE.SphereGeometry(r, sw, sh)), m), x, yc, z); o.scale.set(sx, sy, sz); return o; };
const tor = (R, r, m, x = 0, yc = 0, z = 0, arc = PI * 2, rs = 4, ts = 14) => put(new THREE.Mesh(geo(`tr${R}|${r}|${arc}|${rs}|${ts}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc)), m), x, yc, z);   // ring in the xy plane (axis z)
const face = (w, h, m, x, yc, z, rx = 0, ry = 0) => { const o = new THREE.Mesh(geo(`pl${w}|${h}`, () => new THREE.PlaneGeometry(w, h)), m); o.position.set(x, yc, z); o.rotation.set(rx, ry, 0); return o; };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
const rod = (x1, y1, z1, x2, y2, z2, r, m, seg = 6) => {   // a thin cylinder between two points
  _a.set(x1, y1, z1); _b.set(x2, y2, z2); const len = _a.distanceTo(_b); const o = put(new THREE.Mesh(geo(`rd${r}|${len.toFixed(3)}|${seg}`, () => new THREE.CylinderGeometry(r, r, len, seg)), m), (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
  _q.setFromUnitVectors(_up, _b.sub(_a).normalize()); o.quaternion.copy(_q); return o;
};
const tube = (pts, r, m, seg = 16, rs = 4) => { const o = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), seg, r, rs, false), m); o.castShadow = true; return o; };
const grp = (x, y, z, ...ch) => { const g = new THREE.Group(); g.position.set(x, y, z); ch.forEach(c => g.add(c)); return g; };
const tris = (o) => { let n = 0; o.traverse(m => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return Math.round(n); };
const finish = (g, ud) => { Object.assign(g.userData, ud); g.userData.tris = tris(g); return g; };

// ---------------------------------------------------------------- the kinds
export const kinds = {};

// MED-2 instrument steriliser on a clean bench: 1.5 x 0.7 m stainless bench at 0.9 m, benchtop autoclave 0.6 x 0.6 x 0.45 m, instrument tray
kinds.steriliser = (m, h) => {
  const M = mm(), g = new THREE.Group(); g.name = 'steriliser_bench';
  g.add(rb(1.4, 0.07, 0.62, 0.01, M.dark, 0, 0, 0)); g.add(rb(1.5, 0.78, 0.7, 0.015, M.steel, 0, 0.07, 0));
  for (const sx of [-1, 1]) {   // two doors with a vertical pull each
    g.add(rb(0.7, 0.68, 0.02, 0.008, M.steelD, sx * 0.365, 0.12, 0.35)); g.add(cy(0.01, 0.01, 0.22, M.steel, sx * 0.1, 0.35, 0.385, 8));
    for (const y of [0.37, 0.53]) g.add(bx(0.014, 0.014, 0.03, M.steel, sx * 0.1, y, 0.368));
  }
  g.add(bx(0.01, 0.7, 0.006, M.dark, 0, 0.11, 0.352));
  g.add(rb(1.52, 0.05, 0.72, 0.012, M.steel, 0, 0.85, 0)); g.add(rb(1.5, 0.18, 0.03, 0.008, M.steel, 0, 0.9, -0.33));
  // benchtop autoclave (left)
  const ax = -0.38; g.add(rb(0.6, 0.45, 0.6, 0.02, M.white, ax, 0.9, 0)); g.add(rb(0.62, 0.03, 0.62, 0.01, M.steel, ax, 1.35, 0));
  g.add(rb(0.56, 0.39, 0.012, 0.004, M.steelD, ax, 0.93, 0.306));
  g.add(tor(0.162, 0.014, M.dark, ax - 0.1, 1.1, 0.318, PI * 2, 4, 20)); g.add(cyZ(0.15, 0.15, 0.04, M.steel, ax - 0.1, 1.1, 0.33, 20));
  g.add(cyZ(0.03, 0.03, 0.04, M.dark, ax - 0.1, 1.1, 0.375, 8)); g.add(tor(0.065, 0.008, M.steel, ax - 0.1, 1.1, 0.395, PI * 2, 4, 14));
  for (let i = 0; i < 3; i++) { const s = bx(0.13, 0.012, 0.012, M.steel, ax - 0.1, 1.1 - 0.006, 0.395); s.rotation.z = i * PI / 3; s.position.y = 1.1; g.add(s); }
  g.add(cyZ(0.052, 0.052, 0.02, M.steel, ax + 0.2, 1.25, 0.318, 14)); g.add(face(0.09, 0.09, M.dial, ax + 0.2, 1.25, 0.3285));
  g.add(rb(0.12, 0.07, 0.01, 0.003, M.dark, ax + 0.2, 1.04, 0.31)); g.add(face(0.1, 0.05, M.cycle, ax + 0.2, 1.075, 0.3165));
  g.add(cyZ(0.012, 0.012, 0.012, M.gGreen, ax + 0.15, 0.97, 0.316, 8)); g.add(cyZ(0.012, 0.012, 0.012, M.gAmber, ax + 0.2, 0.97, 0.316, 8)); g.add(cyZ(0.012, 0.012, 0.012, M.gRed, ax + 0.25, 0.97, 0.316, 8));
  g.add(cy(0.02, 0.02, 0.1, M.steel, ax + 0.2, 1.38, -0.16, 8));
  // instrument tray (right): rim, a wrapped pack, a lidded drum and a spread of instruments
  const tx = 0.34; g.add(rb(0.44, 0.016, 0.32, 0.004, M.steel, tx, 0.9, 0.05)); for (const sz of [-1, 1]) g.add(bx(0.44, 0.022, 0.01, M.steel, tx, 0.9, 0.05 + sz * 0.155));
  for (const sx of [-1, 1]) g.add(bx(0.01, 0.022, 0.3, M.steel, tx + sx * 0.215, 0.9, 0.05));
  g.add(rb(0.15, 0.03, 0.17, 0.01, M.cloth, tx - 0.12, 0.916, 0.05));
  for (let i = 0; i < 5; i++) { const ln = i === 2 ? 0.1 : 0.15; const b = rb(0.012, 0.006, ln, 0.002, M.steel, tx + 0.04 + i * 0.026, 0.916, 0.04); b.rotation.y = (i - 2) * 0.06; g.add(b); if (i % 2 === 0) { const t = rb(0.02, 0.008, 0.045, 0.003, M.steel, tx + 0.04 + i * 0.026, 0.916, 0.12); t.rotation.y = (i - 2) * 0.06; g.add(t); } }
  g.add(cy(0.06, 0.06, 0.1, M.steel, 0.62, 0.9, -0.14, 14)); g.add(cy(0.062, 0.062, 0.02, M.steelD, 0.62, 1.0, -0.14, 14)); g.add(cy(0.012, 0.012, 0.02, M.dark, 0.62, 1.02, -0.14, 6));
  return finish(g, {
    top: 0.9, mount: 'floor', size: [1.5, 1.45, 0.72],
    spots: { stand: { pos: [-0.2, 0, 0.7], ry: PI }, autoclave_door: { pos: [ax - 0.1, 1.1, 0.4] }, tray: { pos: [tx, 0.92, 0.05] } },
  });
};

// MED-4 surgical table (2.0 x 0.55 m three-section top on one 0.3 m column, 1.0 x 0.6 base, top at 0.9 m) with a ceiling-boom twin-head LED lamp
kinds.surgical_table = (m, h) => {
  const M = mm(), g = new THREE.Group(); g.name = 'surgical_table';
  g.add(rb(0.6, 0.09, 1.0, 0.02, M.steelD, 0, 0, 0)); g.add(cy(0.2, 0.24, 0.05, M.steel, 0, 0.09, 0, 20)); g.add(cy(0.15, 0.15, 0.62, M.steel, 0, 0.14, 0, 18));
  for (const y of [0.3, 0.52]) g.add(cy(0.17, 0.17, 0.025, M.dark, 0, y, 0, 18));
  g.add(rb(0.4, 0.04, 0.9, 0.012, M.steel, 0, 0.78, 0));
  const sect = (z0, len, rx, ctr) => { const s = grp(0, 0.82, z0); s.rotation.x = rx; s.add(rb(0.56, 0.04, len, 0.01, M.steel, 0, 0, ctr)); s.add(rb(0.55, 0.04, len - 0.01, 0.016, M.teal, 0, 0.04, ctr)); return s; };
  g.add(sect(-0.5, 0.5, 0.1, -0.25)); g.add(sect(-0.5, 0.9, 0, 0.45)); g.add(sect(0.4, 0.6, 0.1, 0.3));   // head raised 0.1 rad, torso flat, legs lowered 0.1 rad
  for (const sx of [-1, 1]) {
    g.add(bx(0.02, 0.035, 1.15, M.steel, sx * 0.29, 0.80, -0.1));   // accessory rails
    const ab = grp(sx * 0.29, 0.86, -0.32); ab.rotation.y = -sx * 0.32; ab.add(rb(0.5, 0.02, 0.2, 0.008, M.steel, sx * 0.25, 0, 0)); ab.add(rb(0.48, 0.03, 0.18, 0.012, M.teal, sx * 0.25, 0.02, 0)); g.add(ab);   // arm boards
    g.add(rb(0.05, 0.075, 0.06, 0.01, M.steelD, sx * 0.29, 0.79, -0.32));
  }
  g.add(rb(0.28, 0.06, 0.16, 0.02, M.dark, 0.55, 0, 0.72)); g.add(bx(0.04, 0.01, 0.04, M.gGreen, 0.62, 0.06, 0.72)); g.add(bx(0.04, 0.01, 0.04, M.gAmber, 0.5, 0.06, 0.72));   // foot control
  // lamp: canopy, drop tube, hub, two arms, two LED heads
  g.add(cy(0.18, 0.18, 0.05, M.white, 0, CEIL - 0.05, 0, 20)); g.add(cy(0.05, 0.05, 0.52, M.white, 0, CEIL - 0.57, 0, 12)); g.add(sph(0.085, M.white, 0, 2.62, 0, 1, 1, 1, 10, 6));
  for (const s of [-1, 1]) {
    g.add(cyX(0.025, 0.025, 0.36, M.white, s * 0.18, 2.62, 0, 10)); g.add(cy(0.02, 0.02, 0.22, M.steel, s * 0.36, 2.42, 0, 8));
    const hd = grp(s * 0.36, 2.42, 0); hd.rotation.z = -s * 0.14;
    hd.add(cy(0.3, 0.3, 0.06, M.white, 0, -0.1, 0, 24)); hd.add(cy(0.15, 0.28, 0.05, M.white, 0, -0.05, 0, 24)); hd.add(cy(0.26, 0.26, 0.012, M.led, 0, -0.11, 0, 24));
    hd.add(tor(0.275, 0.011, M.steel, 0, -0.1, 0, PI * 2, 4, 24).rotateX(PI / 2)); hd.add(cy(0.028, 0.028, 0.08, M.steel, 0, -0.19, 0, 8)); hd.add(sph(0.03, M.steel, 0, -0.19, 0, 1, 0.7, 1, 8, 4));
    g.add(hd);
  }
  return finish(g, {
    top: 0.9, mount: 'floor', size: [1.55, CEIL, 2.0], lampY: 2.2,
    patient: { pos: [0, 0.9, 0], head: [0, 0.9, -0.9], axis: 'z', headDir: -1 },   // a lying body: origin at the sternum, head toward -z
    spots: { surgeon_l: { pos: [-0.78, 0, 0.05], ry: PI / 2 }, surgeon_r: { pos: [0.78, 0, 0.05], ry: -PI / 2 }, anaesthesia: { pos: [0, 0, -1.15], ry: 0 }, instruments: { pos: [-0.78, 0, 0.75], ry: PI / 2 } },
  });
};

// MED-5 automated medication dispensing cabinet: 0.8 x 0.6 x 1.3 m, touch panel on top, six lockable drawers with lamps, output hatch, keypad
kinds.med_dispenser = (m, h) => {
  const M = mm(), g = new THREE.Group(); g.name = 'med_dispenser';
  g.add(rb(0.76, 0.08, 0.56, 0.01, M.dark, 0, 0, 0)); g.add(rb(0.8, 1.0, 0.6, 0.02, M.white, 0, 0.08, 0)); g.add(rb(0.81, 0.045, 0.61, 0.008, M.green, 0, 0.86, 0));
  g.add(rb(0.8, 0.22, 0.5, 0.02, M.white, 0, 1.08, -0.05));
  const bez = rb(0.58, 0.2, 0.025, 0.006, M.dark, 0, 1.12, 0.215); bez.rotation.x = -0.5; g.add(bez); g.add(face(0.52, 0.16, M.touch, 0, 1.19, 0.227, -0.5));
  g.add(rb(0.09, 0.1, 0.02, 0.004, M.dark, 0.31, 1.13, 0.235));   // card reader beside the screen
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
    const x = -0.26 + c * 0.26, y = 0.14 + r * 0.31;
    g.add(rb(0.235, 0.27, 0.02, 0.006, M.panel, x, y, 0.3)); g.add(bx(0.12, 0.016, 0.025, M.steelD, x, y + 0.2, 0.316)); g.add(bx(0.022, 0.012, 0.01, (r * 3 + c) === 4 ? M.gAmber : M.gGreen, x + 0.085, y + 0.245, 0.312));
    g.add(cyZ(0.012, 0.012, 0.012, M.steel, x - 0.08, y + 0.2, 0.314, 8));   // lock barrel
  }
  g.add(rb(0.26, 0.11, 0.02, 0.006, M.dark, -0.14, 0.76, 0.3)); g.add(rb(0.22, 0.08, 0.025, 0.006, M.steelD, -0.14, 0.775, 0.31));   // output hatch and its flap
  g.add(rb(0.12, 0.17, 0.02, 0.005, M.dark, 0.24, 0.72, 0.3)); for (let i = 0; i < 9; i++) g.add(bx(0.026, 0.026, 0.008, M.steelD, 0.2 + (i % 3) * 0.04, 0.745 + Math.floor(i / 3) * 0.04, 0.315));
  return finish(g, {
    top: 1.3, mount: 'floor', size: [0.8, 1.3, 0.6],
    spots: { stand: { pos: [0, 0, 0.62], ry: PI }, screen: { pos: [0, 1.19, 0.24] }, hatch: { pos: [-0.14, 0.82, 0.32] }, drawers: { pos: [0, 0.45, 0.32] } },
  });
};

// MED-6 examination couch: 1.9 x 0.65 m padded top at 0.6 m, head section raised ~30 degrees, paper roll at the head end, two-step stool beside it
kinds.exam_couch = (m, h) => {
  const M = mm(), g = new THREE.Group(); g.name = 'exam_couch';
  g.add(rb(0.46, 0.06, 1.0, 0.01, M.dark, 0, 0, 0.35)); g.add(rb(0.4, 0.46, 0.84, 0.02, M.white, 0, 0.06, 0.35));
  g.add(rb(0.64, 0.04, 1.2, 0.01, M.steel, 0, 0.52, 0.35)); g.add(rb(0.65, 0.04, 1.2, 0.016, M.blue, 0, 0.56, 0.35)); g.add(bx(0.56, 0.004, 1.17, M.paper, 0, 0.6, 0.35));
  const hd = grp(0, 0.52, -0.25); hd.rotation.x = 0.52;   // head section: raised 30 degrees
  hd.add(rb(0.64, 0.04, 0.7, 0.01, M.steel, 0, 0, -0.35)); hd.add(rb(0.65, 0.04, 0.7, 0.016, M.blue, 0, 0.04, -0.35)); hd.add(bx(0.56, 0.004, 0.68, M.paper, 0, 0.08, -0.35));
  hd.add(cyX(0.065, 0.065, 0.58, M.paper, 0, 0.065, -0.77, 16)); hd.add(cyX(0.025, 0.025, 0.62, M.steelD, 0, 0.065, -0.77, 8));
  for (const sx of [-1, 1]) hd.add(bx(0.02, 0.1, 0.03, M.steel, sx * 0.315, 0.02, -0.77));
  g.add(hd);
  g.add(rod(0, 0.42, 0.0, 0, 0.56, -0.5, 0.016, M.steelD, 8));   // gas strut
  // two-step stool on the +x side
  const st = grp(0.66, 0, 0.35); st.rotation.y = PI / 2;
  st.add(rb(0.44, 0.16, 0.4, 0.015, M.dark, 0, 0, 0.0)); st.add(rb(0.44, 0.16, 0.2, 0.015, M.dark, 0, 0.16, -0.1)); st.add(bx(0.4, 0.008, 0.34, M.rubber, 0, 0.16, 0.02)); st.add(bx(0.4, 0.008, 0.16, M.rubber, 0, 0.32, -0.1));
  g.add(st);
  return finish(g, {
    top: 0.6, mount: 'floor', size: [1.1, 0.88, 1.9],
    patient: { pos: [0, 0.6, 0.05], head: [0, 0.78, -0.55], axis: 'z', headDir: -1, headRaise: 0.52 },
    spots: { doctor: { pos: [-0.75, 0, 0.1], ry: PI / 2 }, stool: { pos: [0.66, 0.32, 0.35] } },
  });
};

// MED-7 autopsy table: 2.1 x 0.75 m stainless dished top at 0.85 m with a perimeter gutter, drain at the foot, downdraft strips, sink pedestal with hand spray, hanging scale
kinds.autopsy_table = (m, h) => {
  const M = mm(), g = new THREE.Group(); g.name = 'autopsy_table';
  for (const z of [-0.7, 0.7]) { g.add(rb(0.5, 0.04, 0.5, 0.01, M.steelD, 0, 0, z)); g.add(rb(0.34, 0.77, 0.34, 0.02, M.steel, 0, 0.04, z)); }
  const T = grp(0, 0.81, 0); T.rotation.x = 0.02;   // foot end slopes down toward the drain
  T.add(rb(0.75, 0.04, 2.1, 0.01, M.steel, 0, 0, 0));
  for (const sx of [-1, 1]) T.add(rb(0.04, 0.04, 2.1, 0.008, M.steel, sx * 0.355, 0.04, 0));
  for (const sz of [-1, 1]) T.add(rb(0.67, 0.04, 0.04, 0.008, M.steel, 0, 0.04, sz * 1.03));
  for (const sx of [-1, 1]) T.add(bx(0.022, 0.006, 1.98, M.dark, sx * 0.31, 0.04, 0));   // gutters
  T.add(bx(0.58, 0.006, 0.022, M.dark, 0, 0.04, 0.96)); T.add(bx(0.58, 0.006, 0.022, M.dark, 0, 0.04, -0.96)); T.add(bx(0.03, 0.006, 1.9, M.dark, 0, 0.04, 0));
  for (const sx of [-1, 1]) T.add(face(0.07, 1.6, M.perf, sx * 0.255, 0.0455, 0, -PI / 2));   // perforated downdraft strips
  T.add(cy(0.04, 0.04, 0.008, M.dark, 0, 0.04, 0.96, 14)); T.add(tor(0.042, 0.006, M.steel, 0, 0.046, 0.96, PI * 2, 4, 14).rotateX(PI / 2));
  g.add(T); g.add(cy(0.03, 0.03, 0.72, M.steel, 0, 0.06, 0.98, 10)); g.add(cy(0.09, 0.09, 0.03, M.steelD, 0, 0, 0.98, 14));
  // sink pedestal at the head end, +x side
  const sx0 = 0.7, sz0 = -0.55; g.add(rb(0.42, 0.8, 0.5, 0.02, M.steel, sx0, 0, sz0)); g.add(rb(0.46, 0.04, 0.54, 0.01, M.steel, sx0, 0.8, sz0));
  g.add(cy(0.17, 0.17, 0.006, M.dark, sx0, 0.844, sz0, 18)); g.add(tor(0.17, 0.014, M.steel, sx0, 0.846, sz0, PI * 2, 4, 18).rotateX(PI / 2));
  g.add(cy(0.015, 0.015, 0.34, M.steel, sx0, 0.84, sz0 - 0.2, 8)); g.add(cyZ(0.012, 0.012, 0.16, M.steel, sx0, 1.17, sz0 - 0.13, 8)); g.add(cy(0.012, 0.012, 0.06, M.steel, sx0, 1.11, sz0 - 0.05, 8));
  for (const s of [-1, 1]) g.add(cy(0.014, 0.014, 0.05, M.dark, sx0 + s * 0.09, 0.84, sz0 - 0.2, 8));
  g.add(tube([[sx0 + 0.15, 0.96, sz0 - 0.2], [sx0 + 0.2, 0.9, sz0 - 0.1], [sx0 + 0.18, 0.88, sz0 + 0.05], [sx0 + 0.12, 0.93, sz0 + 0.1]], 0.008, M.dark, 14, 4));
  g.add(cy(0.014, 0.022, 0.1, M.steel, sx0 + 0.12, 0.93, sz0 + 0.1, 8)); g.add(cyZ(0.01, 0.01, 0.1, M.steel, sx0 + 0.14, 0.97, sz0 - 0.2, 6));
  // hanging scale from a ceiling post
  const px = -0.8, pz = -0.35; g.add(cy(0.03, 0.03, 1.2, M.steelD, px, 2.0, pz, 8)); g.add(cy(0.12, 0.12, 0.02, M.steel, px, CEIL - 0.02, pz, 12));
  g.add(cy(0.012, 0.012, 0.4, M.steel, px, 1.78, pz, 6)); g.add(cyZ(0.1, 0.1, 0.06, M.white, px, 1.72, pz, 18)); g.add(face(0.17, 0.17, M.dial, px, 1.72, pz + 0.0315));
  g.add(tor(0.02, 0.004, M.steel, px, 1.6, pz, PI * 2, 4, 8)); g.add(cy(0.01, 0.01, 0.06, M.steel, px, 1.58, pz, 6));
  for (let i = 0; i < 3; i++) { const a = i * PI * 2 / 3 + 0.3; g.add(rod(px, 1.58, pz, px + Math.cos(a) * 0.15, 1.34, pz + Math.sin(a) * 0.15, 0.003, M.steel, 4)); }
  g.add(cy(0.17, 0.12, 0.05, M.steel, px, 1.3, pz, 18));
  return finish(g, {
    top: 0.85, mount: 'floor', size: [1.7, CEIL, 2.1],
    patient: { pos: [0, 0.85, 0], head: [0, 0.85, -0.95], axis: 'z', headDir: -1 },
    spots: { pathologist_l: { pos: [-0.78, 0, 0.1], ry: PI / 2 }, pathologist_r: { pos: [0.78, 0, 0.35], ry: -PI / 2 }, sink: { pos: [0.7, 0, -0.12], ry: PI }, scale: { pos: [-0.8, 0, -0.1], ry: PI } },
  });
};

// MED-8 infusion stand (portable): five-star castor base 0.5 m, telescoping pole to 1.95 m, four-hook top, two fluid bags, clamped pump box at 1.1 m
kinds.infusion_stand = (m, h) => {
  const M = mm(), g = new THREE.Group(); g.name = 'infusion_stand';
  g.add(cy(0.045, 0.055, 0.05, M.steel, 0, 0.06, 0, 12));
  for (let i = 0; i < 5; i++) {
    const a = i * PI * 2 / 5, c = Math.cos(a), s = Math.sin(a);
    const leg = rb(0.24, 0.026, 0.034, 0.008, M.steelD, c * 0.14, 0.05, s * 0.14); leg.rotation.y = -a; g.add(leg);
    g.add(cy(0.008, 0.008, 0.05, M.dark, c * 0.25, 0.04, s * 0.25, 6));
    const w = cyZ(0.026, 0.026, 0.018, M.rubber, c * 0.25, 0.026, s * 0.25, 10); w.rotation.set(0, -a, 0); w.rotateX(PI / 2); g.add(w);
  }
  g.add(cy(0.0125, 0.0125, 1.42, M.steel, 0, 0.1, 0, 10)); g.add(cy(0.02, 0.02, 0.06, M.dark, 0, 1.4, 0, 10)); g.add(cy(0.01, 0.01, 0.56, M.steel, 0, 1.44, 0, 8));
  g.add(cy(0.028, 0.028, 0.04, M.dark, 0, 1.96, 0, 10));
  for (const r of [0, PI / 2]) { const b = cyX(0.008, 0.008, 0.44, M.steel, 0, 1.94, 0, 6); b.rotation.set(0, r, PI / 2); g.add(b); }
  const hooks = [[0.22, 0], [-0.22, 0], [0, 0.22], [0, -0.22]]; for (const [x, z] of hooks) g.add(tor(0.018, 0.0035, M.steel, x, 1.92, z, PI * 1.4, 4, 8).rotateY(Math.atan2(x, z)));
  const bag = (x, fm, fh) => {   // 0.15 x 0.25 m fluid bag, hanging from a hook, drip chamber and tube below
    const b = grp(x, 1.64, 0); b.add(rb(0.15, 0.25, 0.03, 0.01, M.bag, 0, 0, 0)); b.add(rb(0.12, fh, 0.026, 0.008, fm, 0, 0.01, 0)); b.add(bx(0.06, 0.02, 0.008, M.white, 0, 0.23, 0)); b.add(cy(0.012, 0.012, 0.03, M.white, 0, -0.03, 0, 6)); b.add(cy(0.011, 0.011, 0.07, M.glass, 0, -0.1, 0, 8));
    b.add(rod(0, 0.25, 0, x > 0 ? -0.0 : 0, 0.28, 0, 0.002, M.steel, 3)); return b;
  };
  g.add(bag(0.22, mm().fluid, 0.17)); g.add(bag(-0.22, mm().fluid2, 0.13));
  g.add(tube([[0.22, 1.5, 0.0], [0.15, 1.3, 0.1], [0.04, 1.2, 0.1], [0.0, 1.0, 0.08], [0.2, 0.9, 0.2], [0.4, 0.95, 0.45], [0.45, 1.1, 0.6]], 0.004, M.glass, 24, 4));
  g.add(tube([[-0.22, 1.5, 0.0], [-0.12, 1.32, 0.08], [0.0, 1.2, 0.1]], 0.004, M.glass, 10, 4));
  g.add(rb(0.05, 0.1, 0.06, 0.008, M.dark, 0, 1.05, -0.04)); g.add(cy(0.01, 0.01, 0.05, M.steelD, 0, 1.1, 0.02, 6).rotateX(PI / 2));
  g.add(rb(0.13, 0.2, 0.1, 0.014, M.white, 0, 1.0, 0.065)); g.add(rb(0.1, 0.07, 0.01, 0.003, M.dark, 0, 1.12, 0.12)); g.add(face(0.09, 0.055, M.pump, 0, 1.153, 0.1255));
  g.add(cyZ(0.01, 0.01, 0.01, M.gGreen, -0.03, 1.07, 0.121, 8)); g.add(bx(0.07, 0.03, 0.008, M.steelD, 0, 1.0 + 0.04, 0.119));
  return finish(g, { top: 1.97, mount: 'floor', portable: true, size: [0.52, 1.97, 0.52], spots: { handle: { pos: [0, 1.15, 0.2], ry: PI }, bedside: { pos: [0.55, 0, 0] } }, hooks: hooks.map(([x, z]) => [x, 1.92, z]) });
};

// MED-3 wall bracket with a folded stretcher: two hook arms and a lower cradle, plain green marker plate. Origin on the wall line, +z out of the wall
kinds.stretcher_rack = (m, h) => {
  const M = mm(), g = new THREE.Group(); g.name = 'stretcher_rack';
  g.add(rb(0.62, 0.14, 0.02, 0.006, M.steelD, 0, 1.66, 0.01)); g.add(rb(0.62, 0.1, 0.02, 0.006, M.steelD, 0, 0.7, 0.01));
  for (const sx of [-1, 1]) {
    g.add(rb(0.035, 0.03, 0.14, 0.006, M.steel, sx * 0.22, 1.66, 0.09)); g.add(rb(0.035, 0.055, 0.03, 0.006, M.steel, sx * 0.22, 1.66, 0.175));
    g.add(rb(0.035, 0.03, 0.14, 0.006, M.steel, sx * 0.22, 0.68, 0.09)); g.add(rb(0.035, 0.05, 0.03, 0.006, M.steel, sx * 0.22, 0.68, 0.175));
  }
  const z = 0.13;   // the folded stretcher: orange doubled bed, two aluminium poles, three straps with buckles, rubber handle ends
  g.add(rb(0.46, 0.96, 0.06, 0.014, M.orange, 0, 0.76, z));
  for (const sx of [-1, 1]) { g.add(cy(0.014, 0.014, 1.08, M.steel, sx * 0.25, 0.7, z, 8)); g.add(cy(0.018, 0.018, 0.1, M.rubber, sx * 0.25, 1.78 - 0.02, z, 8)); g.add(cy(0.018, 0.018, 0.1, M.rubber, sx * 0.25, 0.64, z, 8)); }
  for (const y of [1.5, 1.2, 0.95]) { g.add(rb(0.5, 0.045, 0.072, 0.008, M.dark, 0, y, z)); g.add(rb(0.05, 0.035, 0.012, 0.004, M.steelD, 0.1, y + 0.005, z + 0.04)); }
  g.add(cyX(0.012, 0.012, 0.5, M.steel, 0, 1.78, z, 8)); g.add(cyX(0.012, 0.012, 0.5, M.steel, 0, 0.7, z, 8));
  g.add(rb(0.2, 0.14, 0.012, 0.004, M.green, 0, 1.92, 0.006)); g.add(rb(0.16, 0.1, 0.004, 0.002, M.white, 0, 1.94, 0.014));   // plain green marker plate with a blank card
  return finish(g, { mount: 'wall', size: [0.7, 2.1, 0.22], spots: { take: { pos: [0, 0, 0.75], ry: PI }, grab: { pos: [0, 1.25, 0.2] } }, item: 'stretcher' });
};

// MED-9 ceiling holo-emitter: 0.3 m disc with a ring of six lenses and a centre lamp, on a short gimbal. Built at ceiling height (CEIL), origin at floor level
kinds.holo_emitter = (m, h) => {
  const M = mm(), g = new THREE.Group(); g.name = 'holo_emitter';
  g.add(cy(0.1, 0.1, 0.03, M.white, 0, CEIL - 0.03, 0, 18)); g.add(cy(0.035, 0.035, 0.1, M.steelD, 0, CEIL - 0.13, 0, 8));
  const p = grp(0, CEIL - 0.13, 0); p.rotation.x = 0.14;
  for (const s of [-1, 1]) p.add(rb(0.015, 0.2, 0.04, 0.004, M.steel, s * 0.1, -0.19, 0));
  p.add(cyX(0.012, 0.012, 0.22, M.steel, 0, -0.06, 0, 8));
  p.add(cy(0.15, 0.15, 0.05, M.white, 0, -0.17, 0, 24)); p.add(cy(0.12, 0.15, 0.03, M.panel, 0, -0.14, 0, 24)); p.add(cy(0.14, 0.14, 0.012, M.dark, 0, -0.182, 0, 24));
  p.add(tor(0.148, 0.007, M.holoGlow, 0, -0.17, 0, PI * 2, 4, 24).rotateX(PI / 2));
  for (let i = 0; i < 6; i++) { const a = i * PI / 3; p.add(cy(0.022, 0.026, 0.014, M.steel, Math.cos(a) * 0.09, -0.196, Math.sin(a) * 0.09, 10)); p.add(cy(0.016, 0.016, 0.004, M.holoGlow, Math.cos(a) * 0.09, -0.2, Math.sin(a) * 0.09, 10)); }
  p.add(cy(0.03, 0.03, 0.012, M.led, 0, -0.194, 0, 12));
  g.add(p);
  return finish(g, { mount: 'ceiling', size: [0.32, 0.3, 0.32], projectFrom: [0, CEIL - 0.34, 0], spots: {} });
};

// MED-10 medical gas outlet panel (bed-head trunking): 1.2 x 0.25 m rail at 1.4 m, O2 (white), air (black/white), vacuum (yellow), two flow meters, four sockets, nurse-call button
kinds.gas_panel = (m, h) => {
  const M = mm(), g = new THREE.Group(); g.name = 'gas_panel'; const y = 1.4, z = 0.06;
  g.add(rb(1.2, 0.25, 0.06, 0.012, M.white, 0, y - 0.125, 0.03)); g.add(bx(1.14, 0.008, 0.008, M.steelD, 0, y + 0.1, z + 0.002)); g.add(bx(1.14, 0.008, 0.008, M.steelD, 0, y - 0.108, z + 0.002));
  const outlet = (x, ring, ring2) => { g.add(cyZ(0.05, 0.05, 0.02, M.steel, x, y, z + 0.01, 16)); g.add(cyZ(0.04, 0.04, 0.026, ring, x, y, z + 0.013, 16)); if (ring2) { g.add(cyZ(0.026, 0.026, 0.03, ring2, x, y, z + 0.015, 12)); } g.add(cyZ(0.015, 0.015, 0.032, M.dark, x, y, z + 0.016, 8)); g.add(bx(0.03, 0.012, 0.02, M.steelD, x, y - 0.075, z + 0.01)); };
  outlet(-0.5, M.o2); outlet(-0.38, M.air, M.o2); outlet(-0.26, M.vac);
  for (const x of [-0.1, 0.02]) { g.add(rb(0.06, 0.2, 0.03, 0.006, M.dark, x, y - 0.1, z)); g.add(cy(0.014, 0.014, 0.14, M.flow ? M.glass : M.glass, x, y - 0.06, z + 0.02, 8)); g.add(face(0.02, 0.14, M.flow, x + 0.0, y + 0.01, z + 0.0365)); g.add(sph(0.007, M.gAmber, x, y + (x < 0 ? 0.0 : 0.04), z + 0.024, 1, 1, 1, 6, 4)); g.add(cyZ(0.018, 0.018, 0.02, M.steelD, x, y - 0.105, z + 0.024, 8)); }
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) { const x = 0.18 + c * 0.1, yy = y + (r ? 0.015 : -0.07); g.add(rb(0.075, 0.07, 0.02, 0.006, M.panel, x, yy, z)); g.add(bx(0.008, 0.026, 0.006, M.dark, x - 0.013, yy + 0.022, z + 0.012)); g.add(bx(0.008, 0.026, 0.006, M.dark, x + 0.013, yy + 0.022, z + 0.012)); g.add(bx(0.026, 0.006, 0.006, M.dark, x, yy + 0.01, z + 0.012)); }
  g.add(cyZ(0.038, 0.038, 0.02, M.steelD, 0.5, y - 0.02, z + 0.01, 14)); g.add(cyZ(0.028, 0.03, 0.02, M.gRed, 0.5, y - 0.02, z + 0.028, 14)); g.add(bx(0.07, 0.01, 0.006, M.gGreen, 0.5, y - 0.1, z + 0.004));
  return finish(g, { mount: 'wall', size: [1.2, 0.25, 0.08], height: y, spots: { stand: { pos: [0, 0, 0.7], ry: PI }, outlets: { pos: [-0.38, y, z + 0.04] } } });
};

// MED-11 morgue drawer pulled out on rails with a sheet-covered form. Origin = the `drawers` prop origin (add as a child of it or at the same position);
// h = { col: 0..2, row: 0..1, pull: metres } (defaults 0, 0, 0.75: a full 1.8 m pull would leave the 2.5 m tile)
kinds.morgue_tray = (m, h) => {
  const M = mm(), g = new THREE.Group(); g.name = 'morgue_tray'; const col = h?.col ?? 0, row = h?.row ?? 0, pull = h?.pull ?? 0.75;
  const x = -0.52 + col * 0.52, y = 0.06 + row * 0.52 + 0.1, z0 = 0.47;
  for (const sx of [-1, 1]) g.add(cyZ(0.012, 0.012, pull + 0.1, M.steel, x + sx * 0.2, y + 0.005, z0 + pull / 2 - 0.05, 8));
  g.add(rb(0.42, 0.02, pull + 0.05, 0.006, M.steel, x, y, z0 + pull / 2 - 0.025)); g.add(rb(0.46, 0.012, 0.04, 0.004, M.steelD, x, y + 0.02, z0 + pull - 0.03));
  const zs = (f) => z0 + pull * f;   // f 0 = at the drawer face, 1 = the foot end
  g.add(rb(0.4, 0.012, pull * 0.97, 0.004, M.cloth, x, y + 0.02, z0 + pull / 2));
  g.add(sph(0.1, M.cloth, x - 0.08, y + 0.05, zs(0.88), 1, 0.6, 1.5)); g.add(sph(0.1, M.cloth, x + 0.08, y + 0.05, zs(0.88), 1, 0.6, 1.5));   // feet and shins
  g.add(sph(0.12, M.cloth, x - 0.08, y + 0.08, zs(0.58), 1, 0.85, 2.2)); g.add(sph(0.12, M.cloth, x + 0.08, y + 0.08, zs(0.58), 1, 0.85, 2.2));
  g.add(sph(0.18, M.cloth, x, y + 0.1, zs(0.22), 1, 0.7, 1.4));
  g.add(rb(0.05, 0.003, 0.08, 0.002, M.paper, x + 0.02, y + 0.055, zs(1.0) + 0.04));   // blank toe tag
  g.add(rod(x + 0.03, y + 0.045, zs(0.97), x + 0.03, y + 0.058, zs(1.0) + 0.0, 0.002, M.dark, 3));
  g.add(cy(0.01, 0.01, 0.01, M.gGreen, x + 0.2, y + 0.0, z0 - 0.02, 6));
  return finish(g, { mount: 'floor', addon: 'drawers', size: [0.5, 0.36, pull + 0.5], spots: { stand: { pos: [x, 0, z0 + pull + 0.35], ry: PI } }, lie: { pos: [x, y + 0.02, z0 + pull / 2], axis: 'z', headDir: -1 } });
};

export const KIND_LIST = Object.keys(kinds);
export const META = {
  steriliser: { id: 'MED-2', name: 'instrument steriliser bench', size: '1.5 x 0.7 x 1.45', top: 0.9 }, surgical_table: { id: 'MED-4', name: 'surgical table + overhead lamp', size: '1.55 x 2.0 (lamp to the ceiling)', top: 0.9 },
  med_dispenser: { id: 'MED-5', name: 'medication dispenser', size: '0.8 x 0.6 x 1.3', top: 1.3 }, exam_couch: { id: 'MED-6', name: 'exam couch + step stool', size: '1.1 x 1.9 x 0.9', top: 0.6 },
  autopsy_table: { id: 'MED-7', name: 'autopsy table + sink + scale', size: '1.7 x 2.1', top: 0.85 }, infusion_stand: { id: 'MED-8', name: 'infusion stand', size: '0.52 x 1.97', top: 1.97 },
  stretcher_rack: { id: 'MED-3', name: 'stretcher wall bracket', size: '0.7 wide, wall piece', top: 0 }, holo_emitter: { id: 'MED-9', name: 'ceiling holo-emitter', size: '0.3 disc, ceiling', top: 0 },
  gas_panel: { id: 'MED-10', name: 'medical gas outlet panel', size: '1.2 x 0.25 at 1.4 m, wall piece', top: 0 }, morgue_tray: { id: 'MED-11', name: 'morgue drawer tray with shrouded form', size: 'add-on to `drawers`', top: 0 },
};
