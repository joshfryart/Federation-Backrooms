// Batch 3: plant and engineering hardware (ENG-1, 2, 4, 5, 6, 7).
// kinds: pumpskid, heatexch, scrubber, fieldgen, fieldgen_damp, fabricator   -> (m, h) => THREE.Group
// open junction: makeJunctionOpen(sys, code, deptName, color) -> { group, lamp, door, insert }, same contract as makeJunction in sysview.js
// Conventions as buildProp in world.js: origin at floor centre of a TS (2.5 m) tile, front faces +z, shared materials, userData.top / userData.use documented in docs/propart-plant.md.
// Each prop is built from primitives merged per material (a handful of draw calls, 800-1500 triangles). `m` (world.js materials) is used when present, fallbacks otherwise.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- materials and generated textures
let SH = null;
function mats(m = {}) {
  if (SH) return SH;
  const std = (color, metalness = 0.4, roughness = 0.55, o = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...o });
  const basic = (color) => new THREE.MeshBasicMaterial({ color });
  return SH = {
    steel: m.metal || std(0x8f959e, 0.85, 0.42), dark: m.dark || std(0x23262d, 0.6, 0.5), rubber: m.rubber || std(0x0c0c0e, 0, 0.9), pipe: m.pipe || std(0x70757d, 0.9, 0.35),
    hazard: m.hazard || std(0xd8a818, 0.2, 0.6), galv: std(0xa9b0b8, 0.7, 0.5), insul: std(0xd5d9dc, 0.25, 0.6), cream: std(0xd8d2bc, 0.25, 0.55),
    pumpBlue: std(0x2f5f98, 0.45, 0.45), motorBlue: std(0x26496f, 0.45, 0.5), red: std(0xb02820, 0.3, 0.5), green: std(0x2f8a48, 0.3, 0.55), teal: std(0x2a8a8a, 0.35, 0.5),
    brass: std(0xc8a13c, 0.9, 0.35), copper: std(0xb8703c, 0.9, 0.3), cabinet: std(0xc4cbd2, 0.35, 0.5), fabGrey: std(0xb9bec6, 0.3, 0.5), fabDark: std(0x3a3f48, 0.5, 0.5), dgreen: std(0x2f4a3a, 0.4, 0.5),
    junc: std(0x2b3038, 0.8, 0.45), blue: std(0x2a6ab0, 0.4, 0.5), orange: std(0xc8601c, 0.4, 0.5),
    glass: m.glass || std(0x9fd0ff, 0, 0.05, { transparent: true, opacity: 0.25 }), clear: std(0xcfe6ee, 0.1, 0.1, { transparent: true, opacity: 0.22, depthWrite: false }),
    glowB: m.glowB || basic(0x4ac0ff), glowO: m.glowO || basic(0xffa040), glowG: m.blinkG || basic(0x30ff60), glowR: m.blinkR || basic(0xff3020), glowW: basic(0xe8f0f6), glowY: basic(0xffd040), chamber: basic(0xb8c4cc),
  };
}
const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
const gaugeCache = {};
// dial gauge face: cream disc, tick ring, coloured band, needle at `v` (0..1)
function gaugeMat(v = 0.5) {
  const k = Math.round(v * 20); if (gaugeCache[k]) return gaugeCache[k];
  const t = tex(128, 128, (g, s) => {
    g.fillStyle = '#e8e2cc'; g.fillRect(0, 0, s, s); const c = s / 2, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    g.lineWidth = 9; g.strokeStyle = '#3a8a4a'; g.beginPath(); g.arc(c, c, 46, a0 + (a1 - a0) * 0.3, a0 + (a1 - a0) * 0.72); g.stroke();
    g.strokeStyle = '#b02820'; g.beginPath(); g.arc(c, c, 46, a0 + (a1 - a0) * 0.82, a1); g.stroke();
    g.strokeStyle = '#1c1e22'; g.lineWidth = 2; for (let i = 0; i <= 20; i++) { const a = a0 + (a1 - a0) * i / 20, r = i % 5 ? 36 : 32; g.beginPath(); g.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r); g.lineTo(c + Math.cos(a) * 40, c + Math.sin(a) * 40); g.stroke(); }
    const a = a0 + (a1 - a0) * (k / 20); g.lineWidth = 4; g.strokeStyle = '#c01810'; g.beginPath(); g.moveTo(c - Math.cos(a) * 12, c - Math.sin(a) * 12); g.lineTo(c + Math.cos(a) * 40, c + Math.sin(a) * 40); g.stroke();
    g.fillStyle = '#1c1e22'; g.beginPath(); g.arc(c, c, 6, 0, 7); g.fill();
  });
  return gaugeCache[k] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.3, metalness: 0.1 });
}
let _hmi;
function hmiMat() {   // generic machine panel: progress bars and a layer graph, no text
  return _hmi || (_hmi = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.4, 1.4), map: tex(256, 192, (g, s, h) => {
    g.fillStyle = '#05080c'; g.fillRect(0, 0, s, h); const cols = ['#ffb040', '#58d0ff', '#60f0a0'];
    g.fillStyle = cols[0]; g.fillRect(8, 8, s - 16, 14); for (let i = 0; i < 4; i++) { g.fillStyle = '#20303c'; g.fillRect(12, 34 + i * 20, 160, 10); g.fillStyle = cols[i % 3]; g.fillRect(12, 34 + i * 20, 40 + ((i * 53) % 110), 10); }
    g.strokeStyle = cols[1]; g.lineWidth = 2; g.beginPath(); for (let x = 0; x < 70; x++) g.lineTo(180 + x, 80 + Math.sin(x * 0.3) * 14 * Math.sin(x * 0.07)); g.stroke();
    g.fillStyle = cols[2]; for (let i = 0; i < 6; i++) g.fillRect(12 + i * 40, 130, 32, 22); g.fillStyle = 'rgba(0,0,0,0.3)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, s, 1);
  }) }));
}
const labelCache = {};
function labelTex(name, code, deptName, color) {
  const k = [name, code, deptName, color].join('|'); if (labelCache[k]) return labelCache[k];
  return labelCache[k] = tex(256, 160, (g) => {
    g.fillStyle = '#0b0e14'; g.fillRect(0, 0, 256, 160); g.fillStyle = '#' + color.toString(16).padStart(6, '0'); g.fillRect(0, 0, 256, 16);
    g.fillStyle = '#e8b81c'; for (let x = -20; x < 256; x += 24) { g.beginPath(); g.moveTo(x, 160); g.lineTo(x + 12, 160); g.lineTo(x + 24, 146); g.lineTo(x + 12, 146); g.fill(); }
    g.fillStyle = '#c8d2e0'; g.font = 'bold 12px Arial'; g.fillText('MAINTENANCE JUNCTION', 12, 36); g.fillStyle = '#ffffff'; g.font = 'bold 21px Arial';
    let line = '', y = 66; for (const w of name.toUpperCase().split(' ')) { if (g.measureText(line + w).width > 230 && line) { g.fillText(line.trim(), 12, y); line = ''; y += 24; } line += w + ' '; } g.fillText(line.trim(), 12, y);
    g.fillStyle = '#8a96a8'; g.font = '12px monospace'; g.fillText(`${code} · ${deptName.toUpperCase()}`, 12, 132);
  });
}
const diagCache = {};
function diagMat(c) {   // inside of the door: a single-line diagram card (lines, nodes, a bus), no text
  const k = c; if (diagCache[k]) return diagCache[k];
  const t = tex(128, 192, (g, w, h) => {
    g.fillStyle = '#e8e4d0'; g.fillRect(0, 0, w, h); g.strokeStyle = '#' + c.toString(16).padStart(6, '0'); g.lineWidth = 3; g.fillStyle = g.strokeStyle;
    g.beginPath(); g.moveTo(12, 30); g.lineTo(116, 30); g.moveTo(64, 30); g.lineTo(64, 70); g.moveTo(24, 70); g.lineTo(104, 70); for (const x of [24, 54, 84, 104]) { g.moveTo(x, 70); g.lineTo(x, 110); } g.stroke();
    for (const x of [24, 54, 84, 104]) { g.beginPath(); g.arc(x, 120, 7, 0, 7); g.stroke(); } g.fillRect(56, 14, 16, 12); g.fillRect(10, 150, 108, 5); g.fillRect(10, 164, 70, 5);
    g.strokeStyle = '#1c1e22'; g.lineWidth = 2; g.strokeRect(2, 2, w - 4, h - 4);
  });
  return diagCache[k] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, metalness: 0 });
}

// ---------------------------------------------------------------- geometry builder: primitives merged per material
const LOD = 0.62;   // segment scale: keeps each prop near the ~1500 triangle budget
class B {
  constructor() { this.parts = new Map(); }
  put(mat, geo, x, y, z, rot) {
    if (rot) { if (rot[0]) geo.rotateX(rot[0]); if (rot[1]) geo.rotateY(rot[1]); if (rot[2]) geo.rotateZ(rot[2]); }
    geo.translate(x, y, z); if (!this.parts.has(mat)) this.parts.set(mat, []); this.parts.get(mat).push(geo); return this;
  }
  axis(geo, a) { if (a === 'x') geo.rotateZ(-Math.PI / 2); else if (a === '-x') geo.rotateZ(Math.PI / 2); else if (a === 'z') geo.rotateX(Math.PI / 2); else if (a === '-z') geo.rotateX(-Math.PI / 2); else if (a === '-y') geo.rotateX(Math.PI); return geo; }
  box(mat, w, h, d, x, y, z, rot) { return this.put(mat, new THREE.BoxGeometry(w, h, d), x, y, z, rot); }
  // centred cylinder (or cone frustum when r2 differs: r at the -axis end, r2 at the +axis end)
  cyl(mat, r, len, x, y, z, axis = 'y', seg = 14, r2 = r) { seg = Math.max(7, Math.round(seg * LOD)); return this.put(mat, this.axis(new THREE.CylinderGeometry(r2, r, len, seg), axis), x, y, z); }
  tor(mat, R, r, x, y, z, axis = 'z', seg = 20, tseg = 6, arc = Math.PI * 2) { seg = Math.max(8, Math.round(seg * LOD)); tseg = Math.max(3, Math.round(tseg * 0.7)); const g = new THREE.TorusGeometry(R, r, tseg, seg, arc); if (axis === 'y') g.rotateX(Math.PI / 2); else if (axis === 'x') g.rotateY(Math.PI / 2); return this.put(mat, g, x, y, z); }
  dome(mat, r, x, y, z, axis = 'y', seg = 14) { seg = Math.max(8, Math.round(seg * LOD)); return this.put(mat, this.axis(new THREE.SphereGeometry(r, seg, 6, 0, Math.PI * 2, 0, Math.PI / 2), axis), x, y, z); }
  plane(mat, w, h, x, y, z, ry = 0) { return this.put(mat, new THREE.PlaneGeometry(w, h), x, y, z, [0, ry, 0]); }
  disc(mat, r, x, y, z, seg = 18) { return this.put(mat, new THREE.CircleGeometry(r, seg), x, y, z); }
  // dial gauge on a stalk, face toward +z
  gauge(P, x, y, z, v = 0.5, r = 0.05) { this.cyl(P.dark, r, 0.03, x, y, z, 'z', 14); return this.disc(gaugeMat(v), r * 0.84, x, y, z + 0.0155, 16).tor(P.steel, r * 0.95, r * 0.09, x, y, z + 0.015, 'z', 14, 4); }
  done(g) {
    for (const [mat, list] of this.parts) { const geo = mergeGeometries(list, false); for (const l of list) l.dispose(); const me = new THREE.Mesh(geo, mat); const tr = mat.transparent; me.castShadow = !tr && !mat.isMeshBasicMaterial; me.receiveShadow = !tr; if (tr) me.renderOrder = 2; g.add(me); }
    this.parts.clear(); return g;
  }
}
const rim = (b, mat, r, x, y, z, axis, n, rr, size) => {   // bolt heads around a flange
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, c = Math.cos(a) * rr, s = Math.sin(a) * rr; if (axis === 'x') b.box(mat, size * 1.4, size, size, x, y + c, z + s); else if (axis === 'z') b.box(mat, size, size, size * 1.4, x + c, y + s, z); else b.box(mat, size, size * 1.4, size, x + c, y, z + s); }
};

// ---------------------------------------------------------------- ENG-1 coolant pump skid: 1.3 x 0.5 x 0.7 m (x long, z wide)
function pumpskid(m) {
  const P = mats(m), b = new B(), g = new THREE.Group(), SY = 0.355;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(P.rubber, 0.12, 0.03, 0.1, sx * 0.55, 0.015, sz * 0.18);       // isolation pads
  b.box(P.galv, 1.3, 0.012, 0.5, 0, 0.036, 0);                                                                           // drip tray
  for (const sz of [-1, 1]) b.box(P.galv, 1.3, 0.04, 0.012, 0, 0.056, sz * 0.244); for (const sx of [-1, 1]) b.box(P.galv, 0.012, 0.04, 0.5, sx * 0.644, 0.056, 0);
  for (const sz of [-1, 1]) b.box(P.motorBlue, 1.22, 0.07, 0.07, 0, 0.1, sz * 0.18);                                     // base frame rails
  for (const x of [-0.5, 0.1, 0.5]) b.box(P.motorBlue, 0.07, 0.06, 0.3, x, 0.1, 0);
  b.box(P.motorBlue, 1.22, 0.015, 0.4, 0, 0.1425, 0);
  // motor: 0.35 m finned TEFC body, fan cowl, terminal box
  b.box(P.motorBlue, 0.4, 0.03, 0.3, -0.3, 0.165, 0); b.cyl(P.motorBlue, 0.175, 0.5, -0.3, SY, 0, 'x', 20);
  for (let i = 0; i < 7; i++) b.cyl(P.motorBlue, 0.186, 0.014, -0.52 + i * 0.07, SY, 0, 'x', 14);
  b.cyl(P.motorBlue, 0.16, 0.1, -0.6, SY, 0, 'x', 16, 0.145); b.cyl(P.dark, 0.1, 0.012, -0.656, SY, 0, 'x', 12); b.cyl(P.motorBlue, 0.15, 0.06, -0.02, SY, 0, 'x', 16, 0.1);
  b.box(P.motorBlue, 0.14, 0.1, 0.16, -0.3, 0.57, 0); b.box(P.steel, 0.1, 0.012, 0.12, -0.3, 0.626, 0); b.box(P.glowG, 0.03, 0.012, 0.03, -0.3, 0.634, 0.0); b.cyl(P.steel, 0.016, 0.1, -0.3, 0.57, 0.12, 'z', 8); b.box(P.steel, 0.12, 0.06, 0.004, -0.3, SY, 0.178);
  // coupling guard (yellow), bearing housing, pedestal
  b.cyl(P.hazard, 0.1, 0.22, 0.07, SY, 0, 'x', 14); b.cyl(P.pumpBlue, 0.075, 0.13, 0.235, SY, 0, 'x', 14); b.box(P.pumpBlue, 0.14, 0.13, 0.16, 0.235, 0.215, 0);
  // volute casing with axial suction (150 mm flange) and top discharge
  b.cyl(P.pumpBlue, 0.2, 0.12, 0.37, SY, 0, 'x', 22); b.cyl(P.pumpBlue, 0.17, 0.04, 0.3, SY, 0, 'x', 18); b.tor(P.steel, 0.19, 0.012, 0.432, SY, 0, 'x', 20, 4);
  b.cyl(P.pumpBlue, 0.085, 0.22, 0.54, SY, 0, 'x', 14); b.cyl(P.steel, 0.14, 0.03, 0.635, SY, 0, 'x', 16); rim(b, P.dark, 0.1, 0.65, SY, 0, 'x', 4, 0.11, 0.025);
  b.cyl(P.pumpBlue, 0.09, 0.14, 0.37, 0.555 + 0.04, 0, 'y', 14); b.cyl(P.steel, 0.14, 0.03, 0.37, 0.685, 0, 'y', 16); rim(b, P.dark, 0.1, 0.37, 0.7, 0, 'y', 4, 0.11, 0.025);
  // isolation valve on the suction line: body, stem, handwheel
  b.cyl(P.red, 0.1, 0.05, 0.485, SY, 0, 'x', 14); b.cyl(P.steel, 0.012, 0.13, 0.485, SY + 0.14, 0, 'y', 8); b.tor(P.red, 0.06, 0.009, 0.485, SY + 0.21, 0, 'y', 16, 4); b.cyl(P.red, 0.016, 0.02, 0.485, SY + 0.2, 0, 'y', 8);
  // two dial gauges on stalks: suction (compound) and discharge
  b.cyl(P.brass, 0.01, 0.1, 0.585, SY, 0.13, 'z', 6); b.gauge(P, 0.585, SY, 0.19, 0.3);
  b.cyl(P.brass, 0.01, 0.09, 0.37, 0.62, 0.13, 'z', 6); b.gauge(P, 0.37, 0.62, 0.185, 0.62);
  // drain valve (lever) and a name plate on the volute
  b.cyl(P.brass, 0.014, 0.06, 0.37, 0.14, 0.0, 'y', 8); b.box(P.red, 0.07, 0.014, 0.014, 0.37, 0.115, 0.0);
  b.done(g); g.userData.top = 0.7; g.userData.size = [1.3, 0.5, 0.7];
  g.userData.use = { read: new THREE.Vector3(0.5, SY, 0.9), gaugeSuction: new THREE.Vector3(0.585, SY, 0.205), gaugeDischarge: new THREE.Vector3(0.37, 0.62, 0.2), valve: new THREE.Vector3(0.485, 0.57, 0.15), motor: new THREE.Vector3(-0.3, 0.55, 0.3) };
  return g;
}

// ---------------------------------------------------------------- ENG-4 shell-and-tube heat exchanger on saddles: 2.0 x 0.56 x 1.12 m (x long)
function heatexch(m) {
  const P = mats(m), b = new B(), g = new THREE.Group(), CY = 0.72, SR = 0.22, HX = 0.75;
  b.box(P.dark, 1.5, 0.05, 0.5, 0, 0.025, 0);                                                      // grout plate / skid
  for (const sx of [-1, 1]) { b.box(P.steel, 0.16, 0.38, 0.3, sx * 0.5, 0.05 + 0.19, 0); b.box(P.dark, 0.22, 0.04, 0.4, sx * 0.5, 0.07, 0); b.box(P.steel, 0.14, 0.04, 0.34, sx * 0.5, CY - SR - 0.02, 0); for (const sz of [-1, 1]) b.box(P.dark, 0.03, 0.03, 0.03, sx * 0.5, 0.09, sz * 0.17); }
  b.cyl(P.insul, SR, HX * 2, 0, CY, 0, 'x', 24);                                                   // insulated shell
  for (const x of [-0.5, 0, 0.5]) b.cyl(P.galv, SR + 0.006, 0.04, x, CY, 0, 'x', 24);             // cladding bands
  for (const sx of [-1, 1]) {                                                                      // shell flange, channel / bonnet, dished end
    b.cyl(P.steel, 0.285, 0.06, sx * (HX + 0.03), CY, 0, 'x', 24); rim(b, P.dark, 0, sx * (HX + 0.03), CY, 0, 'x', 10, 0.25, 0.03);
    b.cyl(P.pumpBlue, 0.235, 0.22, sx * (HX + 0.17), CY, 0, 'x', 20); b.cyl(P.steel, 0.285, 0.05, sx * (HX + 0.3), CY, 0, 'x', 24);
    b.dome(P.pumpBlue, 0.235, sx * (HX + 0.325), CY, 0, sx > 0 ? 'x' : '-x', 16);
    b.cyl(P.pumpBlue, 0.065, 0.14, sx * (HX + 0.17), CY + SR + 0.08, 0, 'y', 12); b.cyl(P.steel, 0.115, 0.03, sx * (HX + 0.17), CY + SR + 0.165, 0, 'y', 14);   // tube-side nozzle
    b.cyl(P.pipe, 0.065, 0.14, sx * 0.55, CY + SR + 0.06, 0, 'y', 12); b.cyl(P.steel, 0.115, 0.03, sx * 0.55, CY + SR + 0.14, 0, 'y', 14);                     // shell-side nozzle
  }
  b.cyl(P.red, 0.05, 0.12, 0.55, CY + SR + 0.14 - 0.04, 0, 'y', 10, 0.05); b.tor(P.red, 0.07, 0.01, -0.55, CY + SR + 0.17, 0.0, 'y', 14, 4); b.cyl(P.blue, 0.022, 0.02, -0.55, CY + SR + 0.17, 0, 'y', 8);
  b.cyl(P.blue, 0.248, 0.05, -0.62, CY, 0, 'x', 20); b.cyl(P.red, 0.248, 0.05, 0.62, CY, 0, 'x', 20);         // cold / hot side colour bands
  b.cyl(P.steel, 0.018, 0.22, 0.2, CY + SR + 0.11, 0, 'y', 8); b.cyl(P.dark, 0.03, 0.04, 0.2, CY + SR + 0.23, 0, 'y', 8);                           // vent
  b.cyl(P.steel, 0.022, 0.12, 0, CY - SR - 0.06, 0, 'y', 8); b.box(P.red, 0.07, 0.012, 0.012, 0, CY - SR - 0.12, 0);                                  // drain with lever
  b.cyl(P.brass, 0.01, 0.08, 0.2, CY + 0.0, SR + 0.04, 'z', 6); b.gauge(P, 0.2, CY, SR + 0.1, 0.55, 0.055);   // dial thermometer
  b.cyl(P.brass, 0.01, 0.08, -0.25, CY + 0.0, SR + 0.04, 'z', 6); b.gauge(P, -0.25, CY, SR + 0.1, 0.35, 0.055);
  b.box(P.steel, 0.2, 0.09, 0.006, 0.0, CY - 0.1, SR + 0.004);                                       // name plate
  b.done(g); g.userData.top = 1.12; g.userData.size = [2.0, 0.56, 1.12];
  g.userData.use = { read: new THREE.Vector3(0, 0.72, 0.9), gaugeHot: new THREE.Vector3(0.2, CY, SR + 0.13), gaugeCold: new THREE.Vector3(-0.25, CY, SR + 0.13), ventValve: new THREE.Vector3(0.2, 1.1, 0), drain: new THREE.Vector3(0, 0.45, 0.1) };
  return g;
}

// ---------------------------------------------------------------- ENG-5 twin-bed CO2 scrubber cabinet: 0.9 x 0.7 x 2.0 m
function scrubber(m) {
  const P = mats(m), b = new B(), g = new THREE.Group();
  b.box(P.dark, 0.9, 0.1, 0.7, 0, 0.05, 0);                                                                // plinth
  b.box(P.cabinet, 0.9, 1.45, 0.02, 0, 0.1 + 0.725, -0.34); for (const sx of [-1, 1]) b.box(P.cabinet, 0.02, 1.45, 0.7, sx * 0.44, 0.825, 0); b.box(P.cabinet, 0.9, 0.02, 0.7, 0, 1.56, 0);
  b.box(P.cabinet, 0.86, 0.14, 0.03, 0, 1.46 + 0.0, 0.33);                                                  // header panel above the door
  // canisters behind the mesh door
  for (const sx of [-1, 1]) { const x = sx * 0.2; b.cyl(P.teal, 0.15, 1.2, x, 0.78 + 0.0, 0.0, 'y', 16); b.dome(P.teal, 0.15, x, 1.38, 0, 'y', 14); b.dome(P.teal, 0.15, x, 0.18, 0, '-y', 14);
    for (const y of [0.5, 1.05]) b.cyl(P.steel, 0.158, 0.04, x, y, 0, 'y', 16); b.cyl(P.pipe, 0.035, 0.18, x, 1.56, 0, 'y', 8); b.cyl(P.pipe, 0.03, 0.4, x, 0.2, -0.15, 'y', 8); }
  b.cyl(P.pipe, 0.03, 0.4, 0, 1.5, -0.1, 'x', 8);
  // door: frame, clear mesh pane, hinge and handle
  b.box(P.steel, 0.82, 0.03, 0.03, 0, 1.38, 0.355); b.box(P.steel, 0.82, 0.03, 0.03, 0, 0.17, 0.355); for (const sx of [-1, 1]) b.box(P.steel, 0.03, 1.24, 0.03, sx * 0.4, 0.78, 0.355);
  b.box(P.clear, 0.78, 1.18, 0.008, 0, 0.78, 0.36);
  for (let i = 0; i < 9; i++) b.box(P.dark, 0.78, 0.008, 0.004, 0, 0.26 + i * 0.125, 0.364);
  b.cyl(P.steel, 0.012, 0.22, 0.34, 0.78, 0.385, 'y', 6); for (const y of [0.3, 1.3]) b.cyl(P.dark, 0.014, 0.1, -0.41, y, 0.355, 'y', 6);
  // fan housing, round duct collar, flange
  b.box(P.fabGrey, 0.62, 0.26, 0.5, 0, 1.58 + 0.13, 0);   for (let i = 0; i < 4; i++) { for (const sx of [-1, 1]) b.box(P.dark, 0.004, 0.14, 0.04, sx * 0.31, 1.71, -0.14 + i * 0.09); }
  b.cyl(P.galv, 0.16, 0.16, 0, 1.92, 0, 'y', 18); b.cyl(P.steel, 0.2, 0.03, 0, 1.985, 0, 'y', 18); b.cyl(P.dark, 0.12, 0.004, 0, 2.001, 0, 'y', 14);
  // gauge, lamps and the slide-out filter tray
  b.cyl(P.dark, 0.06, 0.03, -0.3, 1.46, 0.35, 'z', 14); b.disc(gaugeMat(0.38), 0.05, -0.3, 1.46, 0.3665, 16); b.tor(P.steel, 0.057, 0.006, -0.3, 1.46, 0.366, 'z', 14, 4);
  b.box(P.glowG, 0.04, 0.025, 0.01, 0.12, 1.47, 0.346); b.box(P.glowO, 0.04, 0.025, 0.01, 0.2, 1.47, 0.346); b.box(P.dark, 0.04, 0.025, 0.01, 0.28, 1.47, 0.346);
  b.box(P.galv, 0.7, 0.07, 0.6, 0, 0.1, 0.12); b.box(P.fabDark, 0.72, 0.1, 0.03, 0, 0.1, 0.43); b.box(P.steel, 0.3, 0.02, 0.03, 0, 0.12, 0.465); b.box(P.hazard, 0.84, 0.03, 0.02, 0, 0.065, 0.352);
  for (let i = 0; i < 6; i++) b.box(P.insul, 0.62, 0.008, 0.02, 0, 0.14, -0.12 + i * 0.07);      // pleated filter tray
  b.done(g); g.userData.top = 2.0; g.userData.size = [0.9, 0.7, 2.0];
  g.userData.use = { read: new THREE.Vector3(0, 1.46, 0.8), gauge: new THREE.Vector3(-0.3, 1.46, 0.4), door: new THREE.Vector3(0, 0.9, 0.5), tray: new THREE.Vector3(0, 0.12, 0.6), fan: new THREE.Vector3(0, 1.7, 0.4) };
  return g;
}

// ---------------------------------------------------------------- ENG-6 field generator: drum 1.0 x 1.2 m with eight coil pods, compressor, keep-out box. 2.2 x 1.6 x 1.55 m. scheme 'grav' (cyan) or 'damp' (amber)
function fieldgen(m, scheme = 'grav') {
  const P = mats(m), b = new B(), g = new THREE.Group(), GL = scheme === 'damp' ? P.glowO : P.glowB, paint = scheme === 'damp' ? P.orange : P.pumpBlue, DX = -0.35;
  // painted yellow keep-out box on the deck
  for (const sz of [-1, 1]) b.box(P.hazard, 2.2, 0.006, 0.07, 0, 0.003, sz * 0.765); for (const sx of [-1, 1]) b.box(P.hazard, 0.07, 0.006, 1.6, sx * 1.065, 0.003, 0);
  // shock-mounted skid
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.cyl(P.rubber, 0.06, 0.1, sx * 0.85, 0.05, sz * 0.5, 'y', 10, 0.05); b.cyl(P.steel, 0.07, 0.015, sx * 0.85, 0.005 + 0.002, sz * 0.5, 'y', 10); }
  for (const sz of [-1, 1]) b.box(P.fabDark, 1.9, 0.1, 0.1, 0, 0.15, sz * 0.5); for (const x of [-0.8, 0, 0.8]) b.box(P.fabDark, 0.1, 0.08, 1.0, x, 0.15, 0); b.box(P.galv, 1.9, 0.02, 1.1, 0, 0.21, 0);
  // drum: lower skirt, body, domed head with cold head
  b.cyl(P.steel, 0.46, 0.14, DX, 0.29, 0, 'y', 22); b.cyl(paint, 0.5, 1.1, DX, 0.88, 0, 'y', 28); b.dome(paint, 0.5, DX, 1.43, 0, 'y', 22); b.cyl(P.steel, 0.52, 0.04, DX, 0.345, 0, 'y', 28); b.cyl(P.steel, 0.52, 0.04, DX, 1.38, 0, 'y', 28);
  b.cyl(P.steel, 0.11, 0.2, DX, 1.9 - 0.2 - 0.07, 0, 'y', 12); for (let i = 0; i < 4; i++) b.cyl(P.pipe, 0.14, 0.012, DX, 1.54 + i * 0.03, 0, 'y', 12);
  // eight coil pods round the waist, each with a lit end cap
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const pod = new THREE.CylinderGeometry(0.1, 0.1, 0.2, 10); pod.rotateZ(Math.PI / 2); pod.rotateY(-a); b.put(P.copper, pod, DX + c * 0.57, 0.9, s * 0.57);
    const cap = new THREE.CircleGeometry(0.075, 10); cap.rotateY(Math.PI / 2 - a); b.put(GL, cap, DX + c * 0.675, 0.9, s * 0.675); b.put(P.steel, new THREE.BoxGeometry(0.06, 0.2, 0.06), DX + c * 0.5, 0.9, s * 0.5); }
  b.tor(P.steel, 0.54, 0.025, DX, 0.9, 0, 'y', 28, 5);
  // status ring (lit)
  b.tor(GL, 0.505, 0.012, DX, 1.2, 0, 'y', 28, 4);
  // compressor / cryocooler box beside the drum
  b.box(P.fabDark, 0.6, 0.78, 0.8, 0.72, 0.6, 0); b.box(P.fabGrey, 0.64, 0.04, 0.84, 0.72, 1.0, 0); for (let i = 0; i < 7; i++) b.box(P.dark, 0.012, 0.3, 0.004, 0.55 + i * 0.05, 0.42, 0.404);
  b.box(P.glowW, 0.0 + 0.2, 0.01, 0.01, 0.72, 0.84, 0.404); b.box(P.dark, 0.26, 0.16, 0.02, 0.72, 0.88, 0.41); b.plane(hmiMat(), 0.22, 0.12, 0.72, 0.88, 0.421);
  b.box(P.glowG, 0.03, 0.02, 0.01, 0.88, 0.84, 0.406); b.box(GL, 0.03, 0.02, 0.01, 0.58, 0.84, 0.406);
  // helium lines drum -> compressor
  for (const [y, z] of [[0.5, -0.12], [0.62, 0.12]]) { b.cyl(P.pipe, 0.025, 0.55, 0.0, y, z, 'x', 8); b.cyl(P.pipe, 0.025, y - 0.2, -0.08, y / 2 + 0.1, z, 'y', 8); }
  b.cyl(P.hazard, 0.05, 0.08, 0.95, 1.06, -0.25, 'y', 10);     // pressure relief stack
  b.done(g); g.userData.top = 1.5; g.userData.size = [2.2, 1.6, 1.55]; g.userData.scheme = scheme;
  g.userData.use = { read: new THREE.Vector3(0.72, 0.88, 0.8), panel: new THREE.Vector3(0.72, 0.88, 0.5), drumNorth: new THREE.Vector3(DX, 0.9, 0.9), coilRing: new THREE.Vector3(DX, 0.9, 0.7) };
  return g;
}

// ---------------------------------------------------------------- ENG-7 industrial fabricator: 1.6 x 1.0 x 1.9 m (+0.3 hopper on +x), glazed door, pendant arm, beacon
function fabricator(m) {
  const P = mats(m), b = new B(), g = new THREE.Group();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(P.dark, 0.04, 0.05, sx * 0.72, 0.025, sz * 0.42, 'y', 8);   // levelling feet
  b.box(P.fabDark, 1.6, 0.06, 1.0, 0, 0.08, 0);
  b.box(P.fabGrey, 1.6, 0.66, 1.0, 0, 0.44, 0); for (let i = 0; i < 6; i++) b.box(P.dark, 0.5, 0.012, 0.004, -0.4, 0.28 + i * 0.07, 0.503); b.box(P.dark, 0.34, 0.28, 0.01, 0.45, 0.4, 0.5); b.box(P.steel, 0.3, 0.04, 0.02, 0.45, 0.4, 0.51);
  b.box(P.hazard, 1.6, 0.03, 0.004, 0, 0.12, 0.503);
  // enclosure upper: corner posts, side + back panels, roof
  const y0 = 0.77, y1 = 1.75, hh = y1 - y0, yc = (y0 + y1) / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(P.fabDark, 0.06, hh, 0.06, sx * 0.765, yc, sz * 0.465);
  b.box(P.fabGrey, 1.54, hh, 0.02, 0, yc, -0.49); for (const sx of [-1, 1]) b.box(P.fabGrey, 0.02, hh, 0.94, sx * 0.79, yc, 0); b.box(P.fabGrey, 1.62, 0.05, 1.02, 0, y1 + 0.025, 0); b.box(P.fabDark, 1.62, 0.04, 1.02, 0, y0 - 0.02, 0);
  // front: left strip with the machine panel, glazed interlocked door 1.0 x 0.8 on the right
  b.box(P.fabGrey, 0.52, hh, 0.02, -0.5, yc, 0.49); b.box(P.dark, 0.34, 0.26, 0.02, -0.5, 1.35, 0.505); b.plane(hmiMat(), 0.3, 0.22, -0.5, 1.35, 0.516);
  b.box(P.glowG, 0.05, 0.03, 0.01, -0.62, 1.12, 0.505); b.box(P.glowO, 0.05, 0.03, 0.01, -0.5, 1.12, 0.505); b.box(P.dark, 0.05, 0.03, 0.01, -0.38, 1.12, 0.505); b.cyl(P.red, 0.04, 0.03, -0.5, 0.95, 0.505, 'z', 12);   // e-stop
  const dx = 0.26, dy = 1.27;
  b.box(P.fabDark, 1.04, 0.05, 0.04, dx, dy - 0.425, 0.5); b.box(P.fabDark, 1.04, 0.05, 0.04, dx, dy + 0.425, 0.5); for (const sx of [-1, 1]) b.box(P.fabDark, 0.05, 0.8, 0.04, dx + sx * 0.495, dy, 0.5);
  b.box(P.clear, 0.98, 0.8, 0.006, dx, dy, 0.5); b.box(P.steel, 0.03, 0.26, 0.04, dx - 0.4, dy, 0.54); b.box(P.dark, 0.06, 0.08, 0.02, dx + 0.45, dy + 0.3, 0.52); b.box(P.glowG, 0.03, 0.02, 0.012, dx + 0.45, dy + 0.3, 0.531);   // handle + interlock
  for (const y of [dy - 0.25, dy + 0.25]) b.cyl(P.dark, 0.016, 0.1, dx + 0.52, y, 0.5, 'y', 6);
  // lit build chamber seen through the glass: back wall, ceiling light, gantry, plate, part
  b.box(P.chamber, 1.4, 0.88, 0.01, 0.0, yc, -0.47); b.box(P.glowW, 1.1, 0.01, 0.1, 0, y1 - 0.02, 0.0); b.box(P.steel, 0.04, 0.04, 0.9, -0.5, 1.5, 0); b.box(P.steel, 0.04, 0.04, 0.9, 0.5, 1.5, 0); b.box(P.steel, 1.04, 0.05, 0.06, 0, 1.5, 0.05); b.box(P.fabDark, 0.18, 0.12, 0.14, 0.15, 1.4, 0.05); b.cyl(P.brass, 0.012, 0.1, 0.15, 1.29, 0.05, 'y', 6, 0.004);
  b.box(P.fabDark, 0.7, 0.04, 0.6, 0, 0.88, 0.0); b.box(P.steel, 0.66, 0.012, 0.56, 0, 0.91, 0.0); b.box(P.orange, 0.2, 0.2, 0.18, 0.05, 1.02, 0.0); b.box(P.orange, 0.1, 0.12, 0.12, -0.15, 0.97, 0.05); b.cyl(P.orange, 0.06, 0.16, 0.18, 0.99, -0.05, 'y', 10);
  // material hopper with a feed tube on +x, funnel lid
  b.box(P.fabGrey, 0.3, 0.5, 0.42, 0.95, 1.1 + 0.0, 0.0); b.box(P.fabDark, 0.34, 0.04, 0.46, 0.95, 1.37, 0); b.cyl(P.green, 0.16, 0.14, 0.95, 1.5, 0, 'y', 14, 0.08); b.cyl(P.dark, 0.17, 0.02, 0.95, 1.57, 0, 'y', 14); b.cyl(P.pipe, 0.025, 0.25, 0.86, 1.05, 0, 'x', 8); b.box(P.glowO, 0.012, 0.3, 0.02, 1.1, 1.1, 0.215);
  // pendant control arm on the front-left corner
  b.cyl(P.steel, 0.03, 0.62, -0.74, 1.4, 0.56, 'y', 8); b.cyl(P.dark, 0.04, 0.06, -0.74, 1.7, 0.56, 'y', 8); b.box(P.fabDark, 0.07, 0.07, 0.5, -0.74, 1.66, 0.8, [0, 0.0, 0]); b.cyl(P.dark, 0.018, 0.2, -0.74, 1.55, 1.04, 'y', 6);
  b.box(P.fabDark, 0.34, 0.24, 0.07, -0.74, 1.3, 1.04, [-0.35, 0, 0]); b.plane(hmiMat(), 0.28, 0.17, -0.74, 1.31, 1.08 - 0.001); b.cyl(P.red, 0.025, 0.02, -0.62, 1.2, 1.09, 'z', 10);
  // status beacon tower on the roof (green / amber / red)
  b.cyl(P.dark, 0.04, 0.05, 0.62, 1.8 + 0.025, -0.3, 'y', 10); b.cyl(P.glowG, 0.04, 0.05, 0.62, 1.87, -0.3, 'y', 10); b.cyl(P.glowO, 0.04, 0.05, 0.62, 1.92, -0.3, 'y', 10); b.cyl(P.glowR, 0.04, 0.05, 0.62, 1.97, -0.3, 'y', 10);
  b.done(g); g.userData.top = 2.02; g.userData.size = [1.9, 1.0, 2.02];
  g.userData.use = { load: new THREE.Vector3(0.26, 0.0, 0.85), pendant: new THREE.Vector3(-0.74, 1.3, 1.25), hopper: new THREE.Vector3(1.1, 0.0, 0.5), inspect: new THREE.Vector3(0.26, 1.2, 0.7), beacon: new THREE.Vector3(0.62, 1.97, -0.3) };
  return g;
}

export const kinds = { pumpskid, heatexch, scrubber, fieldgen: (m) => fieldgen(m, 'grav'), fieldgen_damp: (m) => fieldgen(m, 'damp'), fabricator };

// ---------------------------------------------------------------- ENG-2 open junction (wall mounted, +z out of the wall, origin at the box centre like makeJunction)
// 0.62 x 0.86 m cabinet 0.14 deep, door hinged on the left and swung 100 degrees, dead-front with a row of 8 toggle breakers, two bus bars behind a clear shield, a cable loom, and one insert module in the top bay.
export const INSERT_OF = { eps: 'tap', life: 'fan', coolant: 'manifold', comms: 'cards', security: 'cards', lighting: 'cards', armory: 'cards', gravity: 'coil', dampers: 'coil' };
export const DOOR_OPEN = -1.75;   // rad, door pivot rotation.y when fully open
function insertModule(b, P, kind, x, y, z) {   // 0.5 x 0.24 bay, protruding up to 0.06 m from the dead-front at z
  b.box(P.dark, 0.5, 0.25, 0.012, x, y, z + 0.006);
  if (kind === 'tap') {   // power tap: transformer block, three terminals and an ammeter
    b.box(P.steel, 0.2, 0.17, 0.05, x - 0.12, y, z + 0.035); for (let i = 0; i < 5; i++) b.box(P.dark, 0.18, 0.01, 0.052, x - 0.12, y - 0.06 + i * 0.03, z + 0.036);
    for (let i = 0; i < 3; i++) { b.cyl(P.copper, 0.022, 0.05, x + 0.05 + i * 0.06, y - 0.04, z + 0.04, 'z', 8); b.cyl(P.dark, 0.012, 0.01, x + 0.05 + i * 0.06, y - 0.04, z + 0.07, 'z', 6); }
    b.gauge(P, x + 0.12, y + 0.06, z + 0.012, 0.58, 0.04); b.box(P.glowG, 0.03, 0.015, 0.01, x + 0.05, y + 0.08, z + 0.014);
  } else if (kind === 'fan') {   // slide-in fan cartridge
    b.box(P.fabGrey, 0.4, 0.2, 0.05, x, y, z + 0.035); b.tor(P.steel, 0.085, 0.01, x, y, z + 0.065, 'z', 16, 4); b.cyl(P.dark, 0.025, 0.02, x, y, z + 0.064, 'z', 8);
    for (let i = 0; i < 4; i++) b.box(P.steel, 0.075, 0.025, 0.008, x + Math.cos(i * 1.57 + 0.4) * 0.045, y + Math.sin(i * 1.57 + 0.4) * 0.045, z + 0.06, [0, 0, i * 1.57 + 0.4 + 0.3]);
    b.box(P.steel, 0.012, 0.15, 0.03, x - 0.17, y, z + 0.07); b.box(P.glowG, 0.025, 0.012, 0.01, x + 0.17, y + 0.08, z + 0.062);
  } else if (kind === 'manifold') {   // valve manifold
    b.cyl(P.blue, 0.018, 0.46, x, y + 0.06, z + 0.04, 'x', 8);
    for (let i = 0; i < 3; i++) { const vx = x - 0.15 + i * 0.15; b.cyl(P.blue, 0.014, 0.1, vx, y, z + 0.04, 'y', 8); b.cyl(P.brass, 0.03, 0.03, vx, y - 0.01, z + 0.04, 'y', 8); b.cyl(P.steel, 0.008, 0.06, vx, y + 0.1 - 0.0, z + 0.04, 'y', 6); b.tor(i === 1 ? P.red : P.hazard, 0.032, 0.007, vx, y + 0.1, z + 0.04, 'y', 12, 4); }
    b.gauge(P, x + 0.2, y - 0.03, z + 0.012, 0.45, 0.032);
  } else if (kind === 'cards') {   // relay card cage
    b.box(P.steel, 0.46, 0.012, 0.07, x, y + 0.11, z + 0.04); b.box(P.steel, 0.46, 0.012, 0.07, x, y - 0.11, z + 0.04);
    for (let i = 0; i < 8; i++) { const cx = x - 0.2 + i * 0.057; b.box(i % 3 === 1 ? P.green : P.dgreen, 0.035, 0.2, 0.06, cx, y, z + 0.04); b.box(i === 5 ? P.glowR : i % 2 ? P.glowG : P.glowO, 0.02, 0.012, 0.01, cx, y + 0.08, z + 0.072); b.box(P.steel, 0.02, 0.02, 0.012, cx, y - 0.075, z + 0.072); }
  } else if (kind === 'coil') {   // field coil with a lit ring
    b.tor(P.copper, 0.075, 0.032, x - 0.08, y, z + 0.05, 'z', 18, 8); b.tor(P.glowB, 0.075, 0.008, x - 0.08, y, z + 0.082, 'z', 18, 4); b.cyl(P.dark, 0.035, 0.04, x - 0.08, y, z + 0.03, 'z', 10);
    b.box(P.steel, 0.14, 0.18, 0.04, x + 0.15, y, z + 0.03); for (const dy of [-0.05, 0.05]) { b.cyl(P.copper, 0.02, 0.05, x + 0.15, y + dy, z + 0.065, 'z', 8); } b.cyl(P.hazard, 0.15, 0.012, x - 0.08, y + 0.0, z + 0.012, 'z', 4, 0.15);
  }
}
export function makeJunctionOpen(sys, code, deptName, color, open = 1) {
  const P = mats(), b = new B(), g = new THREE.Group(), kind = INSERT_OF[sys.id] || 'cards', D = 0.14, zf = 0.1;   // zf = dead-front face z
  // cabinet shell (open front)
  b.box(P.junc, 0.62, 0.86, 0.02, 0, 0, 0.01); for (const sx of [-1, 1]) b.box(P.junc, 0.03, 0.86, D, sx * 0.295, 0, D / 2); for (const sy of [-1, 1]) b.box(P.junc, 0.62, 0.03, D, 0, sy * 0.415, D / 2);
  for (const sy of [0.46, -0.46]) b.box(P.hazard, 0.66, 0.05, 0.11, 0, sy, 0.055);
  b.box(P.fabDark, 0.56, 0.8, 0.012, 0, 0, zf - 0.006);                                                    // dead-front
  insertModule(b, P, kind, 0, 0.27, zf);
  // breaker row: 8 toggles (a couple tripped) on a label strip
  b.box(P.steel, 0.52, 0.014, 0.005, 0, 0.115, zf + 0.002); b.box(P.cream, 0.5, 0.05, 0.004, 0, 0.0, zf + 0.002);
  for (let i = 0; i < 8; i++) { const x = -0.2 + i * 0.057, tripped = i === 5; b.box(P.dark, 0.04, 0.085, 0.026, x, 0.06, zf + 0.013); b.box(tripped ? P.red : P.cream, 0.014, 0.04, 0.02, x, 0.06 + (tripped ? -0.025 : 0.025), zf + 0.034); b.box(i % 3 === 0 ? P.glowG : P.dark, 0.016, 0.01, 0.006, x, 0.01, zf + 0.004); }
  // bus bars behind a clear shield, then the cable loom into the gland plate
  b.box(P.clear, 0.54, 0.12, 0.012, 0, -0.14, zf + 0.026); for (const dy of [-0.11, -0.17]) b.box(P.copper, 0.5, 0.025, 0.012, 0, -0.14 + (dy + 0.14) * 0.9, zf + 0.012); for (const sx of [-1, 1]) b.cyl(P.steel, 0.008, 0.02, sx * 0.26, -0.14, zf + 0.032, 'z', 6);
  for (let i = 0; i < 6; i++) { const x = -0.12 + i * 0.048; b.cyl(i === 4 ? P.red : P.rubber, 0.011, 0.19, x, -0.28, zf + 0.012 + (i % 2) * 0.008, 'y', 6); b.cyl(P.rubber, 0.011, 0.07, x, -0.18, zf + 0.012 + (i % 2) * 0.008, 'y', 6); }
  b.box(P.steel, 0.54, 0.03, 0.02, 0, -0.37, zf + 0.012); for (const y of [-0.24, -0.31]) b.box(P.dark, 0.3, 0.012, 0.03, 0, y, zf + 0.024);
  b.done(g);
  // door: pivot on the left hinge; outside = label, inside = single-line diagram card and a hazard strip
  const pivot = new THREE.Group(); pivot.position.set(-0.31, 0, D + 0.0125); g.add(pivot); const db = new B();
  db.box(P.junc, 0.62, 0.86, 0.025, 0.31, 0, 0); db.box(P.hazard, 0.62, 0.03, 0.03, 0.31, -0.415, 0.004); db.box(P.hazard, 0.62, 0.03, 0.03, 0.31, 0.415, 0.004);
  db.box(P.steel, 0.02, 0.12, 0.03, 0.56, 0, 0.006); for (const y of [-0.3, 0.3]) db.cyl(P.dark, 0.018, 0.1, 0.0, y, 0, 'y', 8); db.box(P.cream, 0.28, 0.2, 0.004, 0.31, 0.0, -0.014);
  db.done(pivot);
  const lt = labelTex(sys.name, code, deptName, color), outside = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.31), new THREE.MeshStandardMaterial({ map: lt, emissive: 0xffffff, emissiveMap: lt, emissiveIntensity: 0.35, roughness: 0.4 })); outside.position.set(0.31, 0.2, 0.0135); pivot.add(outside);
  const inside = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.4), diagMat(color)); inside.position.set(0.31, 0.2, -0.0135); inside.rotation.y = Math.PI; pivot.add(inside);
  pivot.rotation.y = DOOR_OPEN * open;
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.03), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 1.4, 0.55) })); lamp.position.set(0.22, 0.38, 0.1); g.add(lamp);
  g.userData.insert = kind; g.userData.door = pivot; g.userData.top = 0.43;
  g.userData.use = { breakers: new THREE.Vector3(0, 0.06, 0.2), insert: new THREE.Vector3(0, 0.27, 0.2), door: new THREE.Vector3(-0.3, 0, 0.5) };
  return { group: g, lamp, door: pivot, insert: kind };
}
export function setJunctionOpen(jn, t) { jn.door.rotation.y = DOOR_OPEN * Math.max(0, Math.min(1, t)); }
