// itemart.js — original procedural models for everything you can pick up or hold: world pickups, floor/table clutter, carried and handheld items.
// Pure three.js (no game imports). Rounded geometry, emissive details, generated label textures (glyphs and bars only: no text, no insignia),
// shared materials / geometries / textures, every model < ~400 triangles. See docs/itemart.md for where to call it.
//
//   buildItem(kind, opts)       -> THREE.Group | null (unknown kind)
//        opts.frame   'grip' (default for ids that exist in carry.js makeItemMesh: origin at the grip, working end +y, hanging items
//                     hang below the handle, guns point +z; userData.rest / userData.lie follow carry.js, so it is a drop-in for makeItemMesh)
//                     | 'base' (origin at the bottom centre, lying items already laid down: for surfaces, clutter, pickups)
//        opts.scale   uniform scale (pickups are drawn bigger than life so they read)
//        opts.color   a hex colour for kinds with variants (bottle, canister, book, case, ...)
//        group.userData = { item: kind, rest, lie, size:[x,y,z], tris }
//   buildInstanced(kind, placements, opts)  -> { group, hide(i), count }   placements = [{ x, y, z, ry, s }]; merges parts per material so one kind
//        costs a few draw calls however many copies there are (this is what world.clutter should use).
//   ITEM_KINDS (ordered list), ITEM_INFO[kind] = { name, cls, frame, lie }, kindForName(name, shape) -> kind  (keyword map for ship-items.json names)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PI = Math.PI;
const HAS_DOM = typeof document !== 'undefined';

// ---------------------------------------------------------------- caches
const GEO = new Map(), TEX = new Map(), LABMAT = new Map(); let MATS = null;
const geo = (key, f) => { let g = GEO.get(key); if (!g) { g = f(); GEO.set(key, g); } return g; };
function canvasTex(key, w, h, draw) {
  if (!HAS_DOM) return null; if (TEX.has(key)) return TEX.get(key);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d'); draw(c, w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; TEX.set(key, t); return t;
}
const hex = (n) => '#' + new THREE.Color(n).getHexString();

function mats() {
  if (MATS) return MATS; const S = (o) => new THREE.MeshStandardMaterial(o);
  const glow = (c, i = 1.8) => S({ color: new THREE.Color(c).multiplyScalar(0.25), emissive: c, emissiveIntensity: i, roughness: 0.4 });
  return MATS = {
    steel: S({ color: 0xb4bac2, metalness: 0.9, roughness: 0.3 }), gun: S({ color: 0x3b414b, metalness: 0.8, roughness: 0.38 }), alu: S({ color: 0xd0d4da, metalness: 0.75, roughness: 0.45 }),
    dark: S({ color: 0x24272d, metalness: 0.15, roughness: 0.5 }), rubber: S({ color: 0x15161a, roughness: 0.92 }), white: S({ color: 0xe9edef, roughness: 0.36 }), grey: S({ color: 0x9aa1a8, roughness: 0.5, metalness: 0.2 }),
    red: S({ color: 0xc4382e, roughness: 0.4, metalness: 0.1 }), amber: S({ color: 0xe19a22, roughness: 0.42, metalness: 0.1 }), teal: S({ color: 0x2b9c98, roughness: 0.4, metalness: 0.15 }),
    blue: S({ color: 0x3463ad, roughness: 0.42, metalness: 0.15 }), olive: S({ color: 0x5c6a4a, roughness: 0.65, metalness: 0.15 }), card: S({ color: 0xb48c58, roughness: 0.9 }),
    brass: S({ color: 0xc9a24a, metalness: 0.9, roughness: 0.3 }), copper: S({ color: 0xb8683a, metalness: 0.85, roughness: 0.35 }), cloth: S({ color: 0xaec2d8, roughness: 0.95 }), cloth2: S({ color: 0xe7e9e4, roughness: 0.95 }),
    pcb: S({ color: 0x1d6b4c, roughness: 0.5, metalness: 0.2 }), black: S({ color: 0x0e0f12, roughness: 0.6, metalness: 0.3 }), food1: S({ color: 0xd08a3a, roughness: 0.8 }), food2: S({ color: 0x6a9a3c, roughness: 0.8 }), food3: S({ color: 0xc7a76e, roughness: 0.85 }),
    glass: S({ color: 0xcfe6ee, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.38, depthWrite: false }), shell: S({ color: 0x2a3036, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.72 }),
    gCyan: glow(0x30d4ff), gAmber: glow(0xffa21a), gRed: glow(0xff3c2a), gGreen: glow(0x38ff8c, 1.5), gWhite: glow(0xfff2d0, 2.2),
  };
}

// ---------------------------------------------------------------- tiny geometry helpers (all return shadow-casting meshes; geometry is cached by shape)
const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; return o; };
// chamfered box: 44 triangles (6 faces + 12 edge strips + 8 corners), flat-shaded so the bevel catches the light. r = chamfer width.
function bevelGeo(w, h, d, r) {
  const H = [w / 2, h / 2, d / 2], P = [], idx = new Map(), at = (a, s0, s1, s2) => { const k = a + '|' + s0 + s1 + s2; if (idx.has(k)) return idx.get(k); const sg = [s0, s1, s2], v = [0, 0, 0]; for (let i = 0; i < 3; i++) v[i] = sg[i] * (i === a ? H[i] : H[i] - r); P.push(v); idx.set(k, P.length - 1); return P.length - 1; };
  const T = [], S = [-1, 1], tri = (a, b, c) => T.push([a, b, c]), quad = (a, b, c, d2) => { tri(a, b, c); tri(a, c, d2); };
  for (let a = 0; a < 3; a++) for (const sa of S) { const o = [0, 1, 2].filter(i => i !== a), g = (t, u) => { const sg = [0, 0, 0]; sg[a] = sa; sg[o[0]] = t; sg[o[1]] = u; return at(a, ...sg); }; quad(g(-1, -1), g(1, -1), g(1, 1), g(-1, 1)); }
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) { const c = 3 - a - b; for (const sa of S) for (const sb of S) { const g = (aa, sc) => { const sg = [0, 0, 0]; sg[a] = sa; sg[b] = sb; sg[c] = sc; return at(aa, ...sg); }; quad(g(a, -1), g(a, 1), g(b, 1), g(b, -1)); } }
  for (const sx of S) for (const sy of S) for (const sz of S) tri(at(0, sx, sy, sz), at(1, sx, sy, sz), at(2, sx, sy, sz));
  const pos = []; for (const t of T) { const [A, B, C] = t.map(i => P[i]); const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]], n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const dot = n[0] * (A[0] + B[0] + C[0]) + n[1] * (A[1] + B[1] + C[1]) + n[2] * (A[2] + B[2] + C[2]); pos.push(...A, ...(dot < 0 ? [C, B] : [B, C]).flat()); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); const uv = []; const nr = g.attributes.normal; for (let i = 0; i < pos.length / 3; i++) { const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], ax = Math.abs(nr.getX(i)), ay = Math.abs(nr.getY(i)), az = Math.abs(nr.getZ(i)); if (ay >= ax && ay >= az) uv.push(x / w + 0.5, z / d + 0.5); else if (ax >= az) uv.push(z / d + 0.5, y / h + 0.5); else uv.push(x / w + 0.5, y / h + 0.5); }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return g;
}
const rb = (w, h, d, r, m, x = 0, y = 0, z = 0) => { r = Math.min(r * 0.8, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4); return mesh(geo(`rb${w}|${h}|${d}|${r}`, () => bevelGeo(w, h, d, r)), m, x, y, z); };
const bx = (w, h, d, m, x = 0, y = 0, z = 0) => mesh(geo(`bx${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d)), m, x, y, z);
const cy = (rt, rbm, h, m, x = 0, y = 0, z = 0, seg = 10) => mesh(geo(`cy${rt}|${rbm}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rbm, h, seg)), m, x, y, z);
const cyx = (rt, rbm, h, m, x = 0, y = 0, z = 0, seg = 12) => { const o = cy(rt, rbm, h, m, x, y, z, seg); o.rotation.z = PI / 2; return o; };   // axis along x
const cyz = (rt, rbm, h, m, x = 0, y = 0, z = 0, seg = 12) => { const o = cy(rt, rbm, h, m, x, y, z, seg); o.rotation.x = PI / 2; return o; };   // axis along z
const lathe = (key, pts, m, x = 0, y = 0, z = 0, seg = 10) => mesh(geo(`lt${key}|${seg}`, () => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg)), m, x, y, z);
const cap = (r, len, m, x = 0, y = 0, z = 0, seg = 8) => mesh(geo(`cp${r}|${len}|${seg}`, () => new THREE.CapsuleGeometry(r, len, 2, seg)), m, x, y, z);
const tor = (R, r, m, x = 0, y = 0, z = 0, arc = PI * 2, rs = 4, ts = 8) => mesh(geo(`tr${R}|${r}|${arc}|${rs}|${ts}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc)), m, x, y, z);
const sph = (r, m, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => { const o = mesh(geo(`sp${r}`, () => new THREE.SphereGeometry(r, 6, 4)), m, x, y, z); o.scale.set(sx, sy, sz); return o; };
const label = (tex, w, h, x, y, z, ry = 0, rx = 0, key = '') => {   // a flat decal quad with a canvas texture (alpha-tested, no text: glyphs / bars only)
  let m = LABMAT.get(tex?.uuid + key); if (!m) { m = new THREE.MeshStandardMaterial({ map: tex || null, color: tex ? 0xffffff : 0x888888, roughness: 0.6, alphaTest: 0.35, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); LABMAT.set(tex?.uuid + key, m); }
  const o = mesh(geo(`pl${w}|${h}`, () => new THREE.PlaneGeometry(w, h)), m, x, y, z); o.castShadow = false; o.rotation.set(rx, ry, 0); return o;
};
const screenMat = (tex, tint = 0xffffff) => new THREE.MeshStandardMaterial({ color: 0x050608, map: tex, emissiveMap: tex, emissive: tint, emissiveIntensity: 1.25, roughness: 0.25 });
const SCR = {}; const screen = (name, tint) => SCR[name] || (SCR[name] = screenMat(tex_screen(name), tint));
const grp = (...ch) => { const g = new THREE.Group(); ch.forEach(c => g.add(c)); return g; };
const tilt = (o, rx = 0, ry = 0, rz = 0) => { o.rotation.set(rx, ry, rz); return o; };

// ---------------------------------------------------------------- generated textures (128-256 px canvases; glyphs, bars and lines only)
function tex_screen(name) {
  return canvasTex('scr_' + name, 256, 256, (c, s) => {
    c.fillStyle = '#03080c'; c.fillRect(0, 0, s, s);
    const col = { sci: '#35e6d8', med: '#ff6a5a', eng: '#ffb028', sec: '#5aa8ff', padd: '#6ad8ff', wafer: '#7affc8' }[name] || '#6ad8ff';
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 3; c.globalAlpha = 0.28;
    for (let i = 1; i < 8; i++) { c.beginPath(); c.moveTo(i * 32, 0); c.lineTo(i * 32, s); c.moveTo(0, i * 32); c.lineTo(s, i * 32); c.stroke(); }
    c.globalAlpha = 1; c.lineWidth = 5; c.lineJoin = 'round';
    if (name === 'sci') { c.beginPath(); for (let x = 0; x <= s; x += 4) { const y = 90 + Math.sin(x * 0.07) * 36 + Math.sin(x * 0.19) * 12; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); for (let i = 0; i < 6; i++) c.fillRect(24 + i * 38, 220 - (20 + ((i * 53) % 70)), 24, 20 + ((i * 53) % 70)); c.strokeRect(10, 10, s - 20, 150); }
    else if (name === 'med') { c.beginPath(); for (let x = 0; x < s; x += 2) { const p = x % 70; const y = 100 - (p < 6 ? 0 : p < 12 ? 50 : p < 18 ? -34 : p < 26 ? 0 : 0) - Math.sin(x * 0.2) * 3; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); c.fillRect(20, 170, 90, 12); c.fillRect(20, 196, 150, 12); c.fillRect(20, 222, 60, 12); c.beginPath(); c.arc(200, 200, 28, 0, 7); c.stroke(); }
    else if (name === 'eng') { for (let i = 0; i < 5; i++) { c.fillRect(24, 28 + i * 34, 40 + ((i * 71) % 150), 20); } c.beginPath(); c.arc(190, 150, 50, 0, 7); c.stroke(); c.beginPath(); c.moveTo(190, 150); c.lineTo(222, 120); c.stroke(); c.fillRect(24, 210, 208, 10); }
    else if (name === 'sec') { c.beginPath(); c.arc(128, 128, 90, 0, 7); c.stroke(); c.beginPath(); c.arc(128, 128, 46, 0, 7); c.stroke(); c.beginPath(); c.moveTo(128, 128); c.lineTo(200, 70); c.stroke(); c.fillStyle = '#ff5040'; c.beginPath(); c.arc(92, 160, 9, 0, 7); c.fill(); c.beginPath(); c.arc(170, 104, 7, 0, 7); c.fill(); }
    else if (name === 'wafer') { c.globalAlpha = 1; for (let i = 0; i < 5; i++) { c.fillRect(30, 30 + i * 44, 196, 10); c.fillRect(30 + i * 30, 40 + i * 44, 20, 24); } }
    else { for (let i = 0; i < 4; i++) { c.globalAlpha = 0.9; c.strokeRect(18, 18 + i * 58, 220, 46); c.fillRect(28, 28 + i * 58, 20 + ((i * 97) % 90), 8); c.fillRect(28, 44 + i * 58, 120, 6); } }
  });
}
const tex_stripes = (a, b) => canvasTex(`stripes${a}${b}`, 128, 32, (c, w, h) => { c.fillStyle = hex(a); c.fillRect(0, 0, w, h); c.fillStyle = hex(b); for (let x = -h; x < w + h; x += 32) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 16, h); c.lineTo(x + 16 + h, 0); c.lineTo(x + h, 0); c.fill(); } });
const tex_plus = (fg, bg) => canvasTex(`plus${fg}${bg}`, 128, 128, (c, s) => { c.fillStyle = hex(bg); c.fillRect(0, 0, s, s); c.fillStyle = hex(fg); c.fillRect(46, 18, 36, 92); c.fillRect(18, 46, 92, 36); });
const tex_stencil = (fg, bg) => canvasTex(`stencil${fg}${bg}`, 256, 128, (c, w, h) => {   // cargo markings: arrows, bars, dot rows, hazard diamond
  c.fillStyle = hex(bg); c.fillRect(0, 0, w, h); c.fillStyle = hex(fg);
  for (let i = 0; i < 5; i++) c.fillRect(16, 16 + i * 14, 40 + ((i * 37) % 60), 7);
  c.beginPath(); c.moveTo(190, 20); c.lineTo(236, 64); c.lineTo(190, 108); c.lineTo(144, 64); c.closePath(); c.lineWidth = 8; c.strokeStyle = hex(fg); c.stroke(); c.fillRect(184, 44, 12, 28); c.fillRect(184, 80, 12, 12);
  for (let i = 0; i < 6; i++) c.fillRect(16 + i * 18, 100, 10, 10);
});
const tex_barcode = () => canvasTex('barcode', 128, 64, (c, w, h) => { c.fillStyle = '#f2f0e8'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; let x = 8, k = 7; while (x < w - 10) { const bw = 1 + (k = (k * 13 + 5) % 7) % 4; c.fillRect(x, 8, bw, h - 28); x += bw + 1 + (k % 3); } c.fillRect(8, h - 14, 50, 5); c.fillRect(66, h - 14, 40, 5); });
const tex_label = (bg, fg) => canvasTex(`wrap${bg}${fg}`, 128, 64, (c, w, h) => { c.fillStyle = hex(bg); c.fillRect(0, 0, w, h); c.fillStyle = hex(fg); c.fillRect(0, 0, w, 10); c.fillRect(0, h - 10, w, 10); c.beginPath(); c.arc(30, 32, 14, 0, 7); c.fill(); for (let i = 0; i < 4; i++) c.fillRect(56, 18 + i * 9, 56 - i * 8, 5); });
const tex_paper = () => canvasTex('paper', 128, 192, (c, w, h) => { c.fillStyle = '#ece8da'; c.fillRect(0, 0, w, h); c.fillStyle = '#9a9a96'; for (let i = 0; i < 14; i++) c.fillRect(12, 32 + i * 10, 104 - ((i * 37) % 40), 3); c.fillStyle = '#3a6aa8'; c.fillRect(12, 10, 50, 10); c.fillStyle = '#c04a3a'; c.fillRect(96, 10, 20, 10); });
const tex_pcb = () => canvasTex('pcb', 128, 128, (c, s) => { c.fillStyle = '#12593f'; c.fillRect(0, 0, s, s); c.strokeStyle = '#d8b24a'; c.lineWidth = 2; for (let i = 0; i < 18; i++) { const y = 8 + i * 7, j = (i * 41) % 60; c.beginPath(); c.moveTo(0, y); c.lineTo(30 + j, y); c.lineTo(46 + j, y + 8); c.lineTo(s, y + 8); c.stroke(); } c.fillStyle = '#d8b24a'; for (let i = 0; i < 12; i++) c.fillRect(8 + i * 10, 118, 6, 8); });
const tex_cellwin = () => canvasTex('cellwin', 64, 128, (c, w, h) => { c.fillStyle = '#04141c'; c.fillRect(0, 0, w, h); for (let i = 0; i < 6; i++) { c.fillStyle = i < 5 ? '#3ad8ff' : '#16414f'; c.fillRect(10, 104 - i * 18, w - 20, 12); } });
const tex_weave = (col) => canvasTex('weave' + col, 64, 64, (c, s) => { c.fillStyle = hex(col); c.fillRect(0, 0, s, s); c.fillStyle = 'rgba(0,0,0,0.18)'; for (let i = 0; i < s; i += 4) { c.fillRect(i, 0, 1, s); c.fillRect(0, i, s, 1); } });
const MM = {}; const memo = (k, f) => MM[k] || (MM[k] = f());

// ---------------------------------------------------------------- the kinds. Each builder fills group `g`; frames are documented in the header.
// DEFS[kind] = { name, cls (medical|engineering|science|security|food|container|tool|data|part|household), lie?, base? (authored with its origin at the bottom centre), build(g, M, o) }
const DEFS = {};
const def = (kind, name, cls, build, x = {}) => { DEFS[kind] = { name, cls, build, ...x }; };

// --- power / parts
def('battery', 'charge cell', 'engineering', (g, M, o) => {   // upright cell: finned gunmetal body, glowing charge window, brass terminal, carry loop
  const body = [[0.001, 0], [0.03, 0], [0.036, 0.008], [0.04, 0.02], [0.04, 0.13], [0.036, 0.148], [0.03, 0.155], [0.02, 0.158], [0.001, 0.158]];
  g.add(lathe('cell', body, M.gun, 0, 0, 0, 10));
  for (const y of [0.034, 0.108]) g.add(cy(0.0415, 0.0415, 0.008, M.dark, 0, y, 0, 10));
  const win = mesh(geo('cellwin', () => new THREE.CylinderGeometry(0.0425, 0.0425, 0.07, 4, 1, true, -0.6, 1.2)), memo('cellwin', () => screenMat(tex_cellwin(), 0x6ae0ff)), 0, 0.071, 0); win.rotation.y = 0; g.add(win);
  const w2 = win.clone(); w2.rotation.y = PI; g.add(w2);
  g.add(cy(0.014, 0.014, 0.016, M.brass, 0, 0.166, 0, 10)); g.add(cy(0.022, 0.022, 0.005, M.brass, 0, 0.158, 0, 10));
  g.add(tor(0.02, 0.003, M.steel, 0, 0.172, 0, PI, 4, 8));
  g.add(bx(0.012, 0.002, 0.003, M.gAmber, 0, 0.145, 0.03));
}, { base: true });
def('chip', 'data wafer', 'data', (g, M) => {   // translucent wafer with a glowing lattice inside, gold contacts, latch tab
  g.add(rb(0.05, 0.005, 0.078, 0.004, M.shell, 0, 0, 0, 1));
  g.add(label(tex_screen('wafer'), 0.036, 0.05, 0, 0.0035, 0.004, 0, -PI / 2, 'wf'));
  g.add(bx(0.034, 0.004, 0.012, M.brass, 0, 0, 0.041)); for (let i = 0; i < 6; i++) g.add(bx(0.003, 0.0052, 0.01, M.black, -0.0125 + i * 0.005, 0, 0.042));
  g.add(rb(0.016, 0.006, 0.01, 0.002, M.amber, 0, 0.001, -0.037, 1)); g.add(bx(0.006, 0.0058, 0.006, M.gCyan, 0.019, 0, -0.03));
}, { base: true });
def('circuit', 'circuit board', 'part', (g, M) => {   // green board: traces, black ICs, capacitors, gold edge connector, heat-sink
  g.add(bx(0.11, 0.004, 0.08, M.pcb, 0, 0.002, 0)); g.add(label(tex_pcb(), 0.11, 0.08, 0, 0.0042, 0, 0, -PI / 2, 'pcb'));
  for (const [x, z, w, d] of [[-0.025, -0.012, 0.03, 0.03], [0.02, 0.014, 0.022, 0.016], [0.03, -0.022, 0.02, 0.014]]) g.add(rb(w, 0.006, d, 0.002, M.black, x, 0.007, z, 1));
  for (const [x, z] of [[-0.04, 0.025], [-0.03, 0.025], [0.045, 0.0]]) g.add(cy(0.004, 0.004, 0.012, M.blue, x, 0.01, z, 8));
  g.add(bx(0.03, 0.002, 0.008, M.brass, -0.01, 0.0045, 0.0405)); for (let i = 0; i < 4; i++) g.add(bx(0.026, 0.01, 0.002, M.alu, -0.025, 0.012, -0.03 + i * 0.006 - 0.0)); g.add(bx(0.004, 0.004, 0.004, M.gGreen, 0.045, 0.006, -0.03));
}, { base: true });
def('coupling', 'power coupling', 'engineering', (g, M) => {   // conduit coupling lying on a cradle: twin bolted flanges, glowing gland ring, cable stubs
  const y = 0.05; g.add(bx(0.17, 0.012, 0.07, M.dark, 0, 0.006, 0)); g.add(cyx(0.038, 0.038, 0.12, M.gun, 0, y, 0, 10));
  for (const sx of [-1, 1]) { g.add(cyx(0.05, 0.05, 0.014, M.steel, sx * 0.045, y, 0, 10)); for (let i = 0; i < 4; i++) { const a = i / 4 * PI * 2 + 0.4; g.add(cyx(0.005, 0.005, 0.008, M.dark, sx * 0.045, y + Math.sin(a) * 0.04, Math.cos(a) * 0.04, 4)); } g.add(cyx(0.028, 0.026, 0.05, M.rubber, sx * 0.085, y, 0, 10)); }
  g.add(cyx(0.042, 0.042, 0.014, M.gCyan, 0, y, 0, 10)); g.add(rb(0.03, 0.01, 0.012, 0.003, M.amber, 0, y + 0.044, 0, 1));
}, { base: true });
def('part', 'spare module', 'part', (g, M) => {   // relay module: ribbed heatsink block, pull-handle, connector pins, status light
  g.add(rb(0.1, 0.05, 0.14, 0.008, M.gun, 0, 0.025, 0)); for (let i = 0; i < 6; i++) g.add(bx(0.09, 0.012, 0.006, M.alu, 0, 0.056, -0.05 + i * 0.02));
  g.add(rb(0.07, 0.01, 0.012, 0.004, M.amber, 0, 0.03, 0.075, 1)); for (let i = 0; i < 5; i++) g.add(bx(0.006, 0.01, 0.014, M.brass, -0.03 + i * 0.015, 0.012, -0.075)); g.add(bx(0.01, 0.006, 0.004, M.gGreen, 0.04, 0.04, 0.071));
}, { base: true });

// --- medical
def('medkit', 'medical kit', 'medical', (g, M) => {   // frame: origin at the carry handle, the case hangs below
  g.add(rb(0.3, 0.2, 0.11, 0.022, M.red, 0, -0.14, 0)); g.add(rb(0.304, 0.014, 0.114, 0.005, M.dark, 0, -0.085, 0, 1));
  for (const sz of [-1, 1]) g.add(label(tex_plus(0xffffff, 0xc4382e), 0.1, 0.1, 0, -0.145, sz * 0.0562, sz < 0 ? PI : 0, 0, 'med'));
  for (const sx of [-0.09, 0.09]) g.add(rb(0.03, 0.026, 0.008, 0.003, M.steel, sx, -0.085, 0.058, 1));
  g.add(tor(0.05, 0.008, M.dark, 0, -0.04, 0, PI, 4, 10)); g.add(rb(0.07, 0.016, 0.03, 0.006, M.rubber, 0, -0.037 + 0.0, 0, 1)); g.add(rb(0.01, 0.01, 0.004, 0.002, M.gGreen, 0.12, -0.185, 0.0575, 1));
  for (const sx of [-1, 1]) g.add(rb(0.02, 0.2, 0.116, 0.006, M.dark, sx * 0.152, -0.14, 0, 1));
});
def('hypospray', 'hypospray', 'medical', (g, M) => {   // frame: origin at the grip, nozzle toward +y
  g.add(lathe('hypo', [[0.001, -0.075], [0.016, -0.075], [0.021, -0.065], [0.022, -0.04], [0.02, 0.0], [0.018, 0.03], [0.014, 0.05], [0.0, 0.052]], M.white, 0, 0, 0, 10));
  g.add(cy(0.0225, 0.0225, 0.012, M.blue, 0, -0.045, 0, 12)); g.add(cy(0.015, 0.015, 0.04, M.steel, 0, 0.065, 0, 10)); g.add(cy(0.004, 0.0055, 0.026, M.alu, 0, 0.098, 0, 8));
  const amp = cy(0.009, 0.009, 0.06, M.glass, 0.016, 0.006, 0, 8); g.add(amp); g.add(cy(0.0065, 0.0065, 0.054, M.gGreen, 0.016, 0.006, 0, 8)); g.add(rb(0.026, 0.008, 0.026, 0.003, M.dark, 0.016, 0.04, 0, 1));
  g.add(rb(0.014, 0.012, 0.024, 0.004, M.red, 0, 0.012, -0.0215, 1)); g.add(tor(0.0235, 0.002, M.gCyan, 0, 0.037, 0, PI * 2, 4, 10).rotateX(PI / 2));
}, { lie: true });
def('dermal', 'dermal regenerator', 'medical', (g, M) => {   // wand: white handle, flared emitter head with a green lens
  g.add(lathe('derm', [[0.001, -0.07], [0.013, -0.07], [0.017, -0.05], [0.018, 0.0], [0.014, 0.04], [0.012, 0.06], [0.026, 0.07], [0.03, 0.09], [0.001, 0.09]], M.white, 0, 0, 0, 10));
  g.add(cy(0.025, 0.025, 0.004, M.gGreen, 0, 0.092, 0, 12)); g.add(tor(0.027, 0.003, M.blue, 0, 0.07, 0, PI * 2, 4, 10).rotateX(PI / 2)); g.add(rb(0.012, 0.03, 0.006, 0.003, M.teal, 0, 0.0, 0.017, 1)); g.add(cy(0.0185, 0.0185, 0.012, M.rubber, 0, -0.04, 0, 12));
}, { lie: true });
def('scalpel', 'laser scalpel', 'medical', (g, M) => {
  g.add(cap(0.0075, 0.075, M.steel, 0, -0.01, 0)); g.add(cy(0.0082, 0.0082, 0.02, M.rubber, 0, -0.03, 0, 8)); g.add(cy(0.004, 0.006, 0.03, M.alu, 0, 0.045, 0, 8)); g.add(bx(0.0025, 0.03, 0.0025, M.gRed, 0, 0.075, 0)); g.add(bx(0.006, 0.004, 0.002, M.gCyan, 0, 0.01, 0.0078));
}, { lie: true });
def('scanner', 'medical scanner', 'medical', (g, M) => {   // paddle bio-scanner: white body, wide sensor dome, teal readout
  g.add(rb(0.07, 0.03, 0.14, 0.012, M.white, 0, 0, 0)); g.add(rb(0.05, 0.004, 0.06, 0.002, screen('med'), 0, 0.0155, 0.01, 1)); g.add(sph(0.022, M.teal, 0, 0, 0.07, 1, 0.7, 0.6)); g.add(bx(0.014, 0.003, 0.014, M.gRed, -0.02, 0.016, -0.05)); g.add(rb(0.07, 0.034, 0.03, 0.01, M.rubber, 0, -0.001, -0.055, 1));
}, { lie: false });
def('vial', 'sample vial', 'science', (g, M, o) => {
  g.add(lathe('vial', [[0.001, -0.04], [0.009, -0.04], [0.012, -0.036], [0.012, 0.03], [0.009, 0.036], [0.001, 0.036]], M.glass, 0, 0, 0, 10));
  g.add(lathe('vialq', [[0.001, -0.037], [0.0095, -0.037], [0.0095, 0.0], [0.001, 0.003]], M.gGreen, 0, 0, 0, 10)); g.add(cy(0.0135, 0.0135, 0.014, M.dark, 0, 0.044, 0, 10)); g.add(cy(0.0127, 0.0127, 0.03, memo('vlab', () => new THREE.MeshStandardMaterial({ map: tex_label(0xe9e2cf, 0x2b9c98), roughness: 0.6 })), 0, 0.0, 0, 10));
});
def('ration', 'ration pouch', 'food', (g, M, o) => {   // foil pouch, crimped ends, printed wrapper (colour band + icon + barcode)
  const base = o.color ?? 0xb98a2c, tw = tex_label(base, 0x2a2a2a);
  g.add(rb(0.12, 0.022, 0.08, 0.009, memo('foil', () => new THREE.MeshStandardMaterial({ color: 0xc9ccd0, metalness: 0.85, roughness: 0.3 })), 0, 0, 0, 1));
  g.add(label(tw, 0.1, 0.06, 0, 0.0112, 0, 0, -PI / 2, 'rt' + base)); g.add(label(tex_barcode(), 0.04, 0.02, 0.0, -0.0112, 0.0, 0, PI / 2, 'bc'));
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) g.add(bx(0.002, 0.0225, 0.072, M.grey, sx * (0.05 + i * 0.004), 0, 0));
}, { base: true });
def('mug', 'mug', 'food', (g, M, o) => {
  const c = memo('mug' + (o.color ?? 0), () => new THREE.MeshStandardMaterial({ color: o.color ?? 0xeceae2, roughness: 0.3 }));
  g.add(lathe('mug', [[0.001, -0.05], [0.032, -0.05], [0.04, -0.045], [0.043, 0.0], [0.045, 0.05], [0.04, 0.05], [0.04, 0.0], [0.034, -0.044], [0.001, -0.042]], c, 0, 0, 0, 10));
  g.add(cy(0.0405, 0.0405, 0.004, memo('coffee', () => new THREE.MeshStandardMaterial({ color: 0x2a1608, roughness: 0.15 })), 0, 0.036, 0, 14)); g.add(tor(0.02, 0.006, c, 0.05, 0.0, 0, PI * 2, 4, 8));
});
def('glass', 'glass', 'food', (g, M, o) => {
  g.add(lathe('gls', [[0.001, -0.055], [0.026, -0.055], [0.03, -0.05], [0.036, 0.055], [0.033, 0.055], [0.027, -0.048], [0.001, -0.046]], M.glass, 0, 0, 0, 10)); g.add(cy(0.03, 0.027, 0.06, memo('drink', () => new THREE.MeshStandardMaterial({ color: 0xe0902a, roughness: 0.1, emissive: 0x602a00, emissiveIntensity: 0.4 })), 0, -0.02, 0, 12));
});
def('tray', 'meal tray', 'food', (g, M) => {   // moulded compartment tray: plate section with food, side dish, cup, utensils
  g.add(rb(0.44, 0.02, 0.32, 0.015, M.grey, 0, 0, 0, 1)); g.add(rb(0.2, 0.008, 0.2, 0.012, M.dark, -0.1, 0.01, -0.02, 1)); g.add(rb(0.1, 0.008, 0.12, 0.01, M.dark, 0.1, 0.01, -0.07, 1)); g.add(rb(0.1, 0.008, 0.08, 0.01, M.dark, 0.1, 0.01, 0.07, 1));
  g.add(sph(0.06, M.food1, -0.14, 0.02, -0.02, 1, 0.5, 1)); g.add(sph(0.05, M.food2, -0.06, 0.02, 0.0, 1, 0.45, 1)); g.add(sph(0.04, M.food3, -0.1, 0.022, 0.05, 1.2, 0.5, 0.9)); g.add(sph(0.035, M.food3, 0.1, 0.018, -0.07, 1, 0.45, 1));
  g.add(cy(0.032, 0.028, 0.06, M.white, 0.12, 0.04, 0.07, 10)); g.add(cy(0.029, 0.029, 0.004, memo('soup', () => new THREE.MeshStandardMaterial({ color: 0xc9562a, roughness: 0.2 })), 0.12, 0.071, 0.07, 10));
  g.add(bx(0.006, 0.004, 0.11, M.steel, 0.19, 0.012, -0.03)); g.add(bx(0.006, 0.004, 0.11, M.steel, 0.2, 0.012, -0.03));
}, { base: true });
def('bottle', 'bottle', 'food', (g, M, o) => {
  const c = o.color ?? 0x2f6f4a, gm = memo('bot' + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.08, transparent: true, opacity: 0.6, depthWrite: false }));
  g.add(lathe('bottle', [[0.001, 0], [0.026, 0], [0.032, 0.008], [0.034, 0.03], [0.034, 0.12], [0.028, 0.15], [0.012, 0.17], [0.011, 0.21], [0.001, 0.21]], gm, 0, 0, 0, 10));
  g.add(cy(0.0145, 0.0145, 0.022, M.alu, 0, 0.215, 0, 10)); g.add(cy(0.0348, 0.0348, 0.05, memo('blab' + c, () => new THREE.MeshStandardMaterial({ map: tex_label(0xe9e2cf, c), roughness: 0.6 })), 0, 0.07, 0, 12));
}, { base: true });
def('canister', 'canister', 'container', (g, M, o) => {   // pressure/sealant canister: metal body, colour shoulder, valve and guard ring, band label
  const c = o.color ?? 0xd3a019, cm = memo('can' + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.4 }));
  g.add(lathe('canister', [[0.001, 0], [0.05, 0], [0.056, 0.01], [0.058, 0.025], [0.058, 0.2], [0.05, 0.235], [0.03, 0.252], [0.001, 0.252]], M.steel, 0, 0, 0, 10));
  g.add(lathe('canister_s', [[0.05, 0.236], [0.0585, 0.2], [0.0585, 0.16], [0.0495, 0.16], [0.03, 0.253]], cm, 0, 0, 0, 10)); g.add(cy(0.0592, 0.0592, 0.07, memo('canlab' + c, () => new THREE.MeshStandardMaterial({ map: tex_stencil(0x151515, c), roughness: 0.5, metalness: 0.2 })), 0, 0.1, 0, 14));
  g.add(cy(0.012, 0.016, 0.03, M.brass, 0, 0.267, 0, 8)); g.add(tor(0.034, 0.005, M.dark, 0, 0.262, 0, PI * 2, 4, 10).rotateX(PI / 2)); g.add(cy(0.005, 0.005, 0.04, M.brass, 0.018, 0.272, 0, 6).rotateZ(PI / 2));
}, { base: true });

// --- containers
const strapCrate = (g, M, body, tex, w, h, d) => {
  g.add(rb(w, h, d, 0.018, body, 0, h / 2, 0, 1));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(bx(0.05, 0.05, 0.05, M.dark, sx * (w / 2 - 0.02), 0.025, sz * (d / 2 - 0.02))), g.add(bx(0.05, 0.05, 0.05, M.dark, sx * (w / 2 - 0.02), h - 0.025, sz * (d / 2 - 0.02)));
  g.add(bx(w + 0.004, 0.012, d + 0.004, M.dark, 0, h * 0.78, 0)); for (const sx of [-1, 1]) g.add(rb(0.012, 0.045, 0.16, 0.004, M.rubber, sx * (w / 2 + 0.003), h * 0.55, 0, 1));
  for (const sz of [-1, 1]) { g.add(label(tex, w * 0.5, h * 0.32, 0, h * 0.5, sz * (d / 2 + 0.0025), sz < 0 ? PI : 0, 0, 'cr')); for (const sx of [-0.15, 0.15]) g.add(rb(0.03, 0.03, 0.012, 0.004, M.steel, sx * w, h * 0.78, sz * (d / 2 + 0.006), 1)); }
};
def('crate', 'supply crate', 'container', (g, M) => { strapCrate(g, M, M.olive, tex_stencil(0xe6c34a, 0x5c6a4a), 0.52, 0.4, 0.44); }, { base: true });
def('crate_hazard', 'hazard crate', 'container', (g, M) => { strapCrate(g, M, memo('cHaz', () => new THREE.MeshStandardMaterial({ color: 0xe0b020, roughness: 0.5 })), tex_stencil(0x15161a, 0xe0b020), 0.46, 0.34, 0.36); g.add(label(tex_stripes(0xe0b020, 0x15161a), 0.4, 0.04, 0, 0.065, 0.182, 0, 0, 'hz')); }, { base: true });
def('crate_med', 'medical supply crate', 'medical', (g, M) => { strapCrate(g, M, M.white, tex_plus(0xc4382e, 0xe9edef), 0.46, 0.3, 0.34); g.add(bx(0.47, 0.03, 0.35, M.red, 0, 0.1, 0)); }, { base: true });
def('smallbox', 'parts box', 'container', (g, M) => {   // cardboard carton: tape strip, shipping label, barcode
  g.add(rb(0.36, 0.24, 0.3, 0.008, M.card, 0, 0.12, 0, 1)); { const tp = memo('tape', () => new THREE.MeshStandardMaterial({ color: 0xc8b490, roughness: 0.35 })); g.add(bx(0.06, 0.002, 0.302, tp, 0, 0.241, 0)); g.add(bx(0.06, 0.242, 0.002, tp, 0, 0.12, 0.151)); g.add(bx(0.06, 0.242, 0.002, tp, 0, 0.12, -0.151)); }
  g.add(label(tex_barcode(), 0.13, 0.065, -0.07, 0.14, 0.1515, 0, 0, 'bc')); g.add(label(tex_stencil(0x2a2a2a, 0xb48c58), 0.12, 0.06, 0.09, 0.07, 0.1515, 0, 0, 'cs'));
}, { base: true });
def('case', 'storage case', 'container', (g, M, o) => {   // hard-shell case: ribbed shell, two latches, folding handle, corner bumpers
  const c = memo('case' + (o.color ?? 0), () => new THREE.MeshStandardMaterial({ color: o.color ?? 0x3d454f, roughness: 0.55, metalness: 0.1 }));
  g.add(rb(0.4, 0.14, 0.3, 0.02, c, 0, 0.07, 0, 1)); g.add(bx(0.402, 0.01, 0.302, M.dark, 0, 0.075, 0));
  for (const sx of [-0.12, 0.12]) { g.add(rb(0.04, 0.03, 0.016, 0.004, M.steel, sx, 0.075, 0.152, 1)); }
  g.add(tor(0.05, 0.008, M.rubber, 0, 0.14, 0, PI, 4, 10).rotateZ(0)); for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(rb(0.04, 0.04, 0.04, 0.012, M.rubber, sx * 0.19, 0.02, sz * 0.14, 1));
  g.add(label(tex_stencil(0xe9edef, 0x3d454f), 0.12, 0.05, 0, 0.1, -0.1515, PI, 0, 'cs2'));
}, { base: true });
def('toolbox', 'toolbox', 'engineering', (g, M) => {   // frame: origin at the handle; tray and lid hang below it
  g.add(rb(0.42, 0.12, 0.2, 0.018, M.amber, 0, -0.17, 0, 1)); g.add(rb(0.43, 0.06, 0.205, 0.02, M.gun, 0, -0.08, 0, 1));
  g.add(tor(0.08, 0.008, M.rubber, 0, -0.045, 0, PI, 4, 10)); g.add(rb(0.12, 0.018, 0.03, 0.007, M.rubber, 0, -0.04, 0, 1));
  for (const sx of [-0.14, 0.14]) g.add(rb(0.04, 0.05, 0.016, 0.004, M.steel, sx, -0.115, 0.104, 1));
  g.add(bx(0.38, 0.004, 0.002, M.gun, 0, -0.17, 0.1005)); g.add(label(tex_stencil(0x15161a, 0xe19a22), 0.14, 0.06, 0, -0.165, 0.1025, 0, 0, 'tb'));
  g.add(label(tex_stencil(0x15161a, 0xe19a22), 0.14, 0.06, 0, -0.165, -0.1025, PI, 0, 'tb'));
});
def('toolbag', 'tool bag', 'engineering', (g, M) => {
  const w = memo('weaveolive', () => new THREE.MeshStandardMaterial({ map: tex_weave(0x56604a), roughness: 0.95 }));
  g.add(rb(0.36, 0.2, 0.17, 0.06, w, 0, -0.16, 0, 1)); g.add(rb(0.34, 0.03, 0.15, 0.012, M.dark, 0, -0.06, 0, 1)); g.add(bx(0.3, 0.004, 0.002, M.brass, 0, -0.05, 0.081));
  for (const sz of [-1, 1]) g.add(tor(0.07, 0.007, M.rubber, 0, -0.045, sz * 0.045, PI, 4, 10)); g.add(rb(0.1, 0.07, 0.01, 0.01, M.amber, 0.08, -0.17, 0.088, 1)); g.add(rb(0.06, 0.012, 0.014, 0.005, M.rubber, 0, -0.04, 0, 1));
});
def('linen', 'folded linen', 'household', (g, M) => { for (let i = 0; i < 4; i++) g.add(rb(0.34, 0.046, 0.26, 0.016, i % 2 ? M.cloth2 : M.cloth, (i % 2) * 0.01, i * 0.046, 0, 1)); });
def('hose', 'hose coil', 'tool', (g, M) => {   // frame: centred. Spiral coil (a real helix) with brass couplings
  const pts = []; for (let i = 0; i <= 36; i++) { const a = i / 36 * PI * 5, r = 0.15 - i * 0.0008; pts.push(new THREE.Vector3(Math.cos(a) * r, -0.14 + i * 0.0018, Math.sin(a) * r)); }
  g.add(mesh(geo('hosecoil', () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.022, 4, false)), memo('hosem', () => new THREE.MeshStandardMaterial({ color: 0xc89a1c, roughness: 0.55 })), 0, 0, 0));
  g.add(cy(0.028, 0.028, 0.05, M.brass, pts[36].x, pts[36].y, pts[36].z, 8)); g.add(cy(0.028, 0.028, 0.05, M.brass, pts[0].x, pts[0].y, pts[0].z, 8));
});
def('dumbbell', 'dumbbell', 'household', (g, M) => { g.add(cyx(0.014, 0.014, 0.3, M.steel, 0, 0, 0, 8)); for (const sx of [-1, 1]) { g.add(cyx(0.06, 0.06, 0.05, M.gun, sx * 0.12, 0, 0, 6)); g.add(cyx(0.045, 0.045, 0.055, M.dark, sx * 0.12, 0, 0, 6)); } });
def('clipboard', 'clipboard', 'data', (g, M) => {
  g.add(rb(0.17, 0.012, 0.24, 0.006, M.dark, 0, 0.006, 0, 1)); g.add(label(tex_paper(), 0.145, 0.205, 0, 0.0125, 0.005, 0, -PI / 2, 'pp')); g.add(rb(0.07, 0.016, 0.026, 0.005, M.steel, 0, 0.016, -0.108, 1)); g.add(bx(0.01, 0.006, 0.12, M.blue, 0.072, 0.014, 0.01));
}, { base: true });
def('book', 'binder', 'data', (g, M, o) => {
  const c = memo('book' + (o.color ?? 0x2f5aa0), () => new THREE.MeshStandardMaterial({ color: o.color ?? 0x2f5aa0, roughness: 0.7 }));
  g.add(rb(0.15, 0.034, 0.21, 0.004, c, 0, 0.017, 0, 1)); g.add(bx(0.138, 0.026, 0.2, M.cloth2, 0.006, 0.017, 0.0015)); g.add(bx(0.008, 0.036, 0.04, M.amber, -0.06, 0.017, 0.0)); g.add(bx(0.004, 0.036, 0.15, M.dark, -0.071, 0.017, 0));
}, { base: true });
def('padd', 'data slate', 'data', (g, M) => {
  g.add(rb(0.14, 0.012, 0.2, 0.01, M.gun, 0, 0, 0, 1)); g.add(rb(0.124, 0.002, 0.18, 0.006, M.black, 0, 0.0065, 0, 1)); g.add(rb(0.116, 0.002, 0.146, 0.004, screen('padd'), 0, 0.0078, -0.006, 1)); g.add(bx(0.012, 0.003, 0.006, M.gGreen, 0.04, 0.0075, 0.087)); g.add(bx(0.024, 0.003, 0.006, M.gAmber, -0.02, 0.0075, 0.087));
}, { base: true });
def('badge', 'comm badge', 'data', (g, M) => {   // round gilt badge with a glowing touch dot (no emblem)
  g.add(cy(0.022, 0.022, 0.006, M.brass, 0, 0, 0, 16)); g.add(cy(0.017, 0.017, 0.0064, M.dark, 0, 0, 0, 16)); g.add(cy(0.006, 0.006, 0.0068, M.gCyan, 0, 0, 0, 10)); g.add(tor(0.017, 0.0016, M.steel, 0, 0.003, 0, PI * 2, 4, 10).rotateX(PI / 2));
  g.children.forEach(c => c.rotation.x = PI / 2);
});

// --- tricorders: same shell, different colour code and screen
const tricorder = (id, body, accent, scr) => def(id, ({ tricorder_med: 'medical tricorder', tricorder_sec: 'security tricorder', tricorder_eng: 'engineering tricorder', tricorder_sci: 'science tricorder', tricorder: 'tricorder' })[id], ({ tricorder_med: 'medical', tricorder_sec: 'security', tricorder_eng: 'engineering', tricorder_sci: 'science', tricorder: 'science' })[id], (g, M) => {
  const b = M[body], a = M[accent];   // frame: grip at the origin, body up +y, screen faces +z, lid folded open behind the screen
  g.add(rb(0.078, 0.13, 0.03, 0.012, b, 0, 0.03, 0, 1)); g.add(rb(0.07, 0.05, 0.034, 0.01, M.rubber, 0, -0.03, 0, 1)); g.add(rb(0.07, 0.07, 0.003, 0.004, M.black, 0, 0.055, 0.0155, 1)); g.add(rb(0.062, 0.052, 0.002, 0.003, screen(scr), 0, 0.058, 0.0172, 1));
  const lid = rb(0.074, 0.05, 0.008, 0.005, b, 0, 0.115, -0.014, 1); lid.rotation.x = -0.45; g.add(lid); g.add(rb(0.04, 0.008, 0.012, 0.003, a, 0, 0.1, 0.0, 1));
  g.add(cy(0.011, 0.011, 0.01, M.gCyan, -0.02, 0.098, 0.0155, 10).rotateX(PI / 2)); for (let i = 0; i < 3; i++) g.add(cy(0.0045, 0.0045, 0.004, i === 0 ? M.gAmber : a, -0.02 + i * 0.02, 0.012, 0.0155, 8).rotateX(PI / 2));
  g.add(cy(0.01, 0.01, 0.006, M.steel, 0.026, 0.02, 0.0165, 10).rotateX(PI / 2)); g.add(bx(0.004, 0.06, 0.02, a, 0.0385, 0.04, 0)); g.add(bx(0.004, 0.06, 0.02, a, -0.0385, 0.04, 0));
}, { lie: true, flat: true });
tricorder('tricorder', 'gun', 'teal', 'sci'); tricorder('tricorder_sci', 'gun', 'teal', 'sci'); tricorder('tricorder_med', 'white', 'red', 'med'); tricorder('tricorder_eng', 'dark', 'amber', 'eng'); tricorder('tricorder_sec', 'gun', 'blue', 'sec');

// --- sidearms: original chunky "emitter" designs; origin at the grip, barrel toward +z
def('phaser1', 'type-1 emitter', 'security', (g, M) => {
  g.add(rb(0.03, 0.09, 0.04, 0.01, M.dark, 0, -0.035, -0.004, 1).rotateX(-0.18)); g.add(rb(0.036, 0.04, 0.13, 0.014, M.alu, 0, 0.02, 0.035, 2)); g.add(rb(0.03, 0.012, 0.09, 0.005, M.gun, 0, 0.045, 0.03, 1));
  g.add(cyz(0.009, 0.012, 0.028, M.steel, 0, 0.022, 0.108, 8)); g.add(cyz(0.006, 0.006, 0.004, M.gAmber, 0, 0.022, 0.123, 8)); g.add(bx(0.004, 0.012, 0.05, M.gAmber, 0.0185, 0.022, 0.04)); g.add(bx(0.004, 0.012, 0.05, M.gAmber, -0.0185, 0.022, 0.04));
  g.add(rb(0.012, 0.016, 0.01, 0.003, M.red, 0, -0.012, 0.018, 1)); g.add(cy(0.009, 0.009, 0.008, M.gGreen, 0, 0.0476, 0.0, 8));
}, { lie: true });
def('phaser2', 'type-2 emitter', 'security', (g, M) => {
  g.add(rb(0.03, 0.1, 0.04, 0.01, M.dark, 0, -0.03, -0.01, 1).rotateX(-0.15)); g.add(rb(0.04, 0.05, 0.2, 0.016, M.gun, 0, 0.035, 0.07, 2)); g.add(rb(0.028, 0.02, 0.14, 0.008, M.alu, 0, 0.068, 0.07, 1));
  g.add(cyz(0.014, 0.018, 0.05, M.steel, 0, 0.035, 0.18, 10)); g.add(cyz(0.01, 0.01, 0.004, M.gRed, 0, 0.035, 0.206, 10)); g.add(rb(0.042, 0.02, 0.06, 0.008, M.blue, 0, 0.034, 0.08, 1)); g.add(bx(0.004, 0.014, 0.1, M.gCyan, 0.0205, 0.044, 0.07)); g.add(bx(0.004, 0.014, 0.1, M.gCyan, -0.0205, 0.044, 0.07));
  g.add(cy(0.012, 0.012, 0.008, M.dark, 0, 0.0795, 0.02, 8)); g.add(rb(0.012, 0.016, 0.01, 0.003, M.red, 0, -0.005, 0.02, 1));
}, { lie: true });
def('rifle', 'emitter rifle', 'security', (g, M) => {
  g.add(rb(0.03, 0.1, 0.04, 0.01, M.dark, 0, -0.04, 0, 1).rotateX(-0.12)); g.add(rb(0.05, 0.075, 0.3, 0.014, M.gun, 0, 0.02, 0.06, 2)); g.add(rb(0.04, 0.09, 0.2, 0.014, M.dark, 0, 0.0, -0.2, 2)); g.add(rb(0.044, 0.018, 0.22, 0.007, M.alu, 0, 0.06, 0.2, 1));
  g.add(rb(0.04, 0.06, 0.22, 0.012, M.gun, 0, 0.02, 0.33, 1)); g.add(cyz(0.016, 0.02, 0.07, M.steel, 0, 0.02, 0.48, 10)); g.add(cyz(0.01, 0.01, 0.006, M.gRed, 0, 0.02, 0.516, 10)); g.add(bx(0.004, 0.016, 0.16, M.gAmber, 0.0215, 0.025, 0.34)); g.add(bx(0.004, 0.016, 0.16, M.gAmber, -0.0215, 0.025, 0.34));
  g.add(rb(0.04, 0.03, 0.08, 0.008, M.rubber, 0, 0.1, 0.1, 1)); g.add(cyz(0.012, 0.012, 0.07, M.black, 0, 0.115, 0.1, 8)); g.add(cyz(0.008, 0.008, 0.004, M.gCyan, 0, 0.115, 0.138, 8));
}, { lie: true });
def('zapper', 'stun zapper', 'security', (g, M) => {
  g.add(rb(0.035, 0.12, 0.045, 0.012, M.dark, 0, 0, 0, 1)); g.add(rb(0.04, 0.05, 0.16, 0.016, M.amber, 0, 0.07, 0.05, 2)); for (let i = 0; i < 3; i++) g.add(cyz(0.021, 0.021, 0.008, M.steel, 0, 0.07, 0.04 + i * 0.03, 10)); g.add(cyz(0.012, 0.014, 0.025, M.gun, 0, 0.07, 0.14, 8)); g.add(cyz(0.007, 0.007, 0.004, M.gRed, 0, 0.07, 0.155, 8));
}, { lie: true });

// --- hand tools (origin at the grip, working end +y)
const jawGeo = (open) => geo('jaw' + open, () => {
  const s = new THREE.Shape(), R = 0.027; s.absarc(0, 0, R, 0, PI * 2, false); const h = new THREE.Path(); h.moveTo(-0.0105, 0.04); h.lineTo(-0.0105, 0.005); h.absarc(0, 0, 0.0105, PI * 1.5 - 0.0, PI * 1.5 + PI * 2, false); h.lineTo(0.0105, 0.04); h.lineTo(-0.0105, 0.04);
  const s2 = new THREE.Shape(); s2.moveTo(-R, 0); s2.absarc(0, 0, R, PI, 0, true); s2.lineTo(R * 0.4, R * 0.95); s2.lineTo(0.0105, 0.012); s2.absarc(0, 0, 0.0105, PI / 2 - 0.4, PI / 2 + 0.4, true); s2.lineTo(-0.0105, 0.012); s2.lineTo(-R * 0.4, R * 0.95); s2.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: false, curveSegments: 8 }); g.translate(0, 0, -0.004); return g;
});
def('wrench', 'spanner', 'tool', (g, M) => {
  const sh = rb(0.02, 0.2, 0.007, 0.003, M.steel, 0, 0.04, 0, 1); g.add(sh);
  const headM = M.steel; for (const sy of [-1, 1]) { const j = mesh(jawGeo(sy), headM, 0, 0.04 + sy * 0.113, 0); if (sy < 0) j.rotation.z = PI; g.add(j); }
  g.add(cy(0.0105, 0.0105, 0.0085, M.rubber, 0, 0.04, 0, 8).rotateX(PI / 2)); g.add(bx(0.016, 0.07, 0.0074, M.amber, 0, 0.04, 0));
}, { lie: true });
def('tool', 'hydrospanner', 'engineering', (g, M) => {   // powered driver: rubber grip, amber housing, glowing torque ring, hex socket
  g.add(cap(0.0185, 0.1, M.rubber, 0, -0.03, 0)); g.add(rb(0.052, 0.07, 0.044, 0.014, M.amber, 0, 0.07, 0, 1)); g.add(cy(0.011, 0.011, 0.034, M.steel, 0, 0.125, 0, 6)); g.add(cy(0.026, 0.026, 0.008, M.gun, 0, 0.1, 0, 10));
  g.add(tor(0.0265, 0.003, M.gAmber, 0, 0.1, 0, PI * 2, 4, 10).rotateX(PI / 2)); g.add(rb(0.012, 0.03, 0.012, 0.004, M.dark, 0, 0.03, 0.026, 1)); g.add(bx(0.004, 0.03, 0.002, M.gCyan, 0.0268, 0.07, 0.0)); g.add(bx(0.004, 0.03, 0.002, M.gCyan, -0.0268, 0.07, 0.0));
}, { lie: true });
def('torch', 'plasma torch', 'engineering', (g, M) => {
  g.add(cap(0.02, 0.12, M.rubber, 0, -0.02, 0)); g.add(rb(0.04, 0.05, 0.05, 0.012, M.amber, 0, 0.065, 0, 1)); g.add(cy(0.016, 0.01, 0.12, M.copper, 0, 0.15, 0, 8)); g.add(cy(0.011, 0.011, 0.02, M.gWhite, 0, 0.22, 0, 6)); g.add(rb(0.012, 0.03, 0.02, 0.004, M.dark, 0, 0.03, 0.032, 1));
  g.add(tor(0.05, 0.007, M.rubber, 0, -0.075, 0, PI * 1.2, 4, 10).rotateY(PI / 2)); g.add(cy(0.012, 0.012, 0.04, M.steel, 0, -0.07, -0.0, 6));
}, { lie: true });
def('flashlight', 'hand lamp', 'tool', (g, M) => {
  g.add(lathe('flash', [[0.001, -0.075], [0.016, -0.075], [0.019, -0.065], [0.017, -0.02], [0.017, 0.045], [0.026, 0.075], [0.029, 0.115], [0.001, 0.115]], M.dark, 0, 0, 0, 10)); for (let i = 0; i < 3; i++) g.add(cy(0.0195, 0.0195, 0.0025, M.rubber, 0, -0.05 + i * 0.015, 0, 10));
  g.add(cy(0.027, 0.027, 0.004, M.gWhite, 0, 0.115, 0, 10)); g.add(tor(0.0285, 0.003, M.alu, 0, 0.115, 0, PI * 2, 4, 10).rotateX(PI / 2)); g.add(rb(0.012, 0.01, 0.01, 0.003, M.gAmber, 0, 0.0, 0.018, 1)); g.add(tor(0.012, 0.0025, M.rubber, 0, -0.078, 0, PI * 2, 4, 8));
}, { lie: true });
def('extinguisher', 'fire extinguisher', 'tool', (g, M) => {   // frame: origin at the carry handle; the cylinder hangs below
  g.add(lathe('ext', [[0.001, -0.43], [0.05, -0.43], [0.068, -0.41], [0.07, -0.37], [0.07, -0.15], [0.062, -0.1], [0.04, -0.075], [0.001, -0.07]], M.red, 0, 0, 0, 10)); g.add(cy(0.0705, 0.0705, 0.09, memo('extlab', () => new THREE.MeshStandardMaterial({ map: tex_stencil(0x15161a, 0xe9e2c8), roughness: 0.5 })), 0, -0.26, 0, 14));
  g.add(cy(0.022, 0.026, 0.09, M.brass, 0, -0.035, 0, 10)); g.add(rb(0.13, 0.014, 0.024, 0.005, M.dark, 0.025, -0.012, 0, 1)); g.add(rb(0.1, 0.012, 0.022, 0.005, M.dark, 0.02, -0.04, 0, 1)); g.add(cy(0.022, 0.022, 0.012, M.alu, 0.04, -0.07, 0.03, 10).rotateX(PI / 2)); g.add(cy(0.015, 0.015, 0.004, M.gGreen, 0.04, -0.07, 0.037, 8).rotateX(PI / 2));
  g.add(tor(0.07, 0.008, M.rubber, -0.07, -0.19, 0, PI * 1.1, 4, 10).rotateY(0)); g.add(cy(0.015, 0.02, 0.03, M.dark, -0.095, -0.2, 0, 8));
});
def('mop', 'mop', 'household', (g, M) => {
  g.add(cy(0.011, 0.011, 1.3, M.alu, 0, 0.1, 0, 8)); g.add(cy(0.014, 0.014, 0.16, M.rubber, 0, 0.55, 0, 8)); g.add(rb(0.28, 0.03, 0.08, 0.01, M.blue, 0, -0.55, 0, 1)); g.add(cy(0.006, 0.006, 0.06, M.steel, 0, -0.52, 0, 6));
  for (let i = 0; i < 7; i++) g.add(rb(0.034, 0.1, 0.07, 0.012, i % 2 ? M.cloth2 : M.cloth, -0.108 + i * 0.036, -0.62, 0, 1));
}, { rest: 0.68 });
def('hook', 'cargo hook', 'tool', (g, M) => {
  g.add(cap(0.019, 0.08, M.amber, 0, 0, 0)); g.add(cy(0.0195, 0.0195, 0.014, M.rubber, 0, -0.04, 0, 8)); g.add(cy(0.008, 0.008, 0.07, M.steel, 0, 0.08, 0, 6)); g.add(tor(0.05, 0.0075, M.steel, 0.05, 0.115, 0, PI * 1.35, 4, 10).rotateZ(PI * 0.5 + 0.0)); g.add(cy(0.0005, 0.0075, 0.03, M.steel, 0.095, 0.075, 0, 6).rotateZ(0.3));
}, { lie: true });
def('crowbar', 'pry bar', 'tool', (g, M) => {
  g.add(cy(0.011, 0.011, 0.6, M.steel, 0, 0.12, 0, 8)); g.add(cy(0.0128, 0.0128, 0.26, M.red, 0, 0.1, 0, 8)); g.add(tor(0.05, 0.011, M.steel, 0.05, 0.41, 0, PI * 0.45, 4, 8).rotateZ(PI)); g.add(rb(0.022, 0.06, 0.008, 0.002, M.steel, 0.088, 0.46, 0, 1).rotateZ(0.0));
  g.add(rb(0.036, 0.05, 0.008, 0.002, M.steel, 0.0, -0.2, 0, 1)); g.add(bx(0.003, 0.03, 0.01, M.dark, 0.062, 0.462, 0));
}, { lie: true });


export const ITEM_KINDS = Object.keys(DEFS);
export const ITEM_INFO = Object.fromEntries(ITEM_KINDS.map(k => [k, { name: DEFS[k].name, cls: DEFS[k].cls, frame: DEFS[k].base ? 'base' : 'grip', lie: !!DEFS[k].lie }]));

// ---------------------------------------------------------------- building
const _b = new THREE.Box3(), _v = new THREE.Vector3();
const countTris = (o) => { let n = 0; o.traverse(m => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return Math.round(n); };
export function buildItem(kind, opts = {}) {
  const d = DEFS[kind]; if (!d) return null; const M = mats();
  const inner = new THREE.Group(); inner.name = 'item:' + kind; inner.userData.item = kind; d.build(inner, M, opts);
  const frame = opts.frame || (d.base ? 'base' : 'grip'), lie = !!d.lie;
  inner.updateMatrixWorld(true); _b.setFromObject(inner);
  let out = inner;
  if (frame === 'base') {   // origin at the bottom centre, laid down if it is a lying item
    out = new THREE.Group(); out.name = 'item:' + kind; out.add(inner); if (d.flat) inner.rotation.x = -PI / 2; else if (lie) inner.rotation.z = PI / 2; if (d.base) { /* already authored on its base */ }
    out.updateMatrixWorld(true); _b.setFromObject(out); inner.position.set(-(_b.min.x + _b.max.x) / 2, -_b.min.y, -(_b.min.z + _b.max.z) / 2);
    out.userData.rest = 0;
  } else out.userData.rest = d.rest ?? Math.max(0.004, -(lie ? _b.min.x : _b.min.y));
  out.userData.item = kind; out.userData.lie = frame === 'base' ? false : lie; out.userData.frame = frame; out.updateMatrixWorld(true); _b.setFromObject(out);
  out.userData.size = _b.getSize(new THREE.Vector3()).toArray(); out.userData.tris = countTris(out);
  if (opts.scale && opts.scale !== 1) { out.scale.setScalar(opts.scale); out.userData.rest *= opts.scale; }
  return out;
}

// one InstancedMesh per (kind, material): [{x, y, z, ry, s}] -> { group, hide(i), count }. Items are in the 'base' frame (y = the surface they sit on).
export function buildInstanced(kind, placements, opts = {}) {
  const group = new THREE.Group(); group.name = 'items:' + kind; const proto = buildItem(kind, { ...opts, frame: 'base' }); if (!proto || !placements.length) return { group, hide() {}, count: 0 };
  proto.updateMatrixWorld(true); const byMat = new Map();
  proto.traverse(m => { if (!m.isMesh) return; const gg = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()); gg.applyMatrix4(m.matrixWorld); for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gg.deleteAttribute(k); (byMat.get(m.material) || byMat.set(m.material, []).get(m.material)).push(gg); });
  const ims = [], A = new THREE.Matrix4(), B = new THREE.Matrix4(), O = new THREE.Object3D();
  for (const [material, list] of byMat) {
    const merged = list.length > 1 ? mergeGeometries(list, false) : list[0]; const im = new THREE.InstancedMesh(merged, material, placements.length); im.castShadow = im.receiveShadow = true; im.frustumCulled = false;
    placements.forEach((p, i) => { O.position.set(p.x, p.y, p.z); O.rotation.set(0, p.ry || 0, 0); O.scale.setScalar(p.s || 1); O.updateMatrix(); im.setMatrixAt(i, O.matrix); }); im.instanceMatrix.needsUpdate = true; ims.push(im); group.add(im);
  }
  const Z = new THREE.Matrix4().makeScale(0, 0, 0);
  return { group, count: placements.length, hide(i) { for (const im of ims) { im.setMatrixAt(i, Z); im.instanceMatrix.needsUpdate = true; } } };
}

// ---------------------------------------------------------------- name -> kind (ship-items.json clutter names; first match wins). shape: 0 box, 1 cylinder, 2 flat (as in js/world.js)
const KW = [
  [/tricorder|bioscanner|sensor wand|survey meter|scanner, handheld/i, 'tricorder_sci'], [/hypospray|auto-?injector|injector/i, 'hypospray'], [/dermal|wound|cold-laser/i, 'dermal'], [/scalpel|cautery/i, 'scalpel'],
  [/med ?kit|first.?aid|trauma kit|medical kit|medpac|aid kit/i, 'medkit'], [/vial|sample tube|specimen|test tube|ampoule|cuvette/i, 'vial'],
  [/tool ?bag/i, 'toolbag'], [/tool ?box|tool ?kit|tool ?case|toolbox|socket set|torx|hex key set/i, 'toolbox'], [/spanner|wrench|pliers/i, 'wrench'], [/pry bar|crowbar|jemmy/i, 'crowbar'],
  [/\bmop\b/i, 'mop'], [/extinguisher/i, 'extinguisher'], [/torch|flashlight|lamp, hand|headlamp|lantern/i, 'flashlight'], [/driver|drill|impact|hydrospanner|soldering|multimeter|clamp meter/i, 'tool'],
  [/hook\b/i, 'hook'], [/hose|tubing|fibre cable|cable spool|patch cords?|coil|extension lead/i, 'hose'],
  [/comm(unicator| badge| pin)|combadge|\bbadge|name tag/i, 'badge'], [/data slate|padd|tablet|duty tablet|e-?reader|handheld terminal/i, 'padd'], [/clipboard/i, 'clipboard'],
  [/book|manual|binder|log\b|journal|notebook|handbook|dictionary|folder|register|ledger|logbook|paperback|atlas/i, 'book'],
  [/isolinear|data chip|memory card|chip(?!s? test)|wafer|cartridge|crystal/i, 'chip'], [/circuit|pcb|\bcard\b|board\b|processor|module card|damper controller/i, 'circuit'],
  [/power coupl|coupling|conduit|relay|junction|fuse|\bplug|connector|capacitor/i, 'coupling'], [/battery|batteries|\bcells?\b|power ?pack|charge|accumulator/i, 'battery'],
  [/crate/i, 'crate'], [/hazard|biohazard|toxic|radiation/i, 'crate_hazard'], [/medical (stores|supply)|medicine|pharma|dressing/i, 'crate_med'],
  [/hard case|case\b|lockbox|pelican|kit bag|holdall|\bbag\b|satchel/i, 'case'],
  [/canister|cylinder|gas|foam|sealant|aerosol|spray|propellant|drum|tank|flask\b|thermos|\btin\b|can\b|extinguish/i, 'canister'],
  [/bottle|jar\b|flagon|decanter|carafe|syrup|oil|wine|beer|spirit|whisk|brandy|vinegar|sauce|juice|pourer/i, 'bottle'],
  [/mug|cup\b|cups\b|coffee|teacup|tea\b/i, 'mug'], [/glass|flute|coupe|tumbler|goblet|beaker|synthehol/i, 'glass'],
  [/tray|plate|meal|bowl|soup|dish\b/i, 'tray'], [/ration|snack|biscuit|bar\b|nutrient|pouch|jerky|sachet|noodle|packet|crackers|sweets|candy|chocolate|cereal|fruit/i, 'ration'],
  [/linen|towel|blanket|sheet|uniform|laundry|cloth|sock|glove|cushion|pillow|mat\b/i, 'linen'], [/dumbbell|weight|kettlebell/i, 'dumbbell'],
  [/box|carton|parts|spares|kit\b|bagged|pack\b|set\b|stock|refill|supply|supplies|bundle/i, 'smallbox'],
  [/spare|part\b|module|unit\b|assembly|bracket|valve|pump|filter|gear|motor|actuator|emitter|node|panel|insert|fitting|bearing|gasket|nozzle|piston|sensor/i, 'part'],
];
const BY_SHAPE = [['smallbox', 'case', 'part', 'smallbox', 'crate_hazard', 'circuit'], ['canister', 'bottle', 'mug', 'canister', 'bottle', 'vial'], ['clipboard', 'padd', 'book', 'circuit', 'clipboard', 'book']];
export function kindForName(name = '', shape = 0, hash = 0) {
  for (const [re, k] of KW) if (re.test(name)) return k;
  const l = BY_SHAPE[shape] || BY_SHAPE[0]; return l[Math.floor(hash * l.length) % l.length];
}
