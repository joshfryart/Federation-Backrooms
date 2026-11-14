// Batch 7 prop art: stations II and operations hardware (docs/asset-gaps.md section 12, batch 7).
//   FLT-4 nav station with plot table, OPS-2 operations station, OPS-3 communications station, OPS-4 transceiver cabinet and relay rack,
//   OPS-6 pattern buffer tank, ENG-15 systems plotting table.  (CMD-1 systems board is a wall kit: js/decorart-bridge.js; OPS-5 coil cartridge is an item: js/itemart-stations2.js.)
// Same contract and conventions as js/propart-stations1.js (see docs/propart-stations1.md): `export const kinds = { name: (m, h) => THREE.Group }`, origin at the floor
// centre of a 2.5 m tile, +z is the operator side, metres, one mesh per material, glyph-bar textured screens, seated stations carry a child group 'chair'.
// Helpers come from js/propart-kit2.js (a copy of the stations1 helper half).
import { THREE, PI, B, mats, scr, finish, seated, stationChair, TH, KINDS_TEX, ctex, rr, bars, scan, rng } from './propart-kit2.js';

// ---------------------------------------------------------------- extra screen textures (registered into the shared table)
Object.assign(KINDS_TEX, {
  chart(g, w, h, a, R) {              // backlit navigation chart: blue field, grid, stars, hazard discs, a plotted leg with waypoint ticks
    g.fillStyle = '#0c2236'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(120,190,255,0.28)'; g.lineWidth = 1;
    for (let x = 0; x <= w; x += w / 12) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y <= h; y += h / 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(220,240,255,${0.3 + R() * 0.6})`; g.fillRect(R() * w, R() * h, 2, 2); }
    for (let i = 0; i < 3; i++) { const x = w * (0.2 + R() * 0.6), y = h * (0.2 + R() * 0.6); g.strokeStyle = '#ff6a3a'; g.lineWidth = 2; g.setLineDash([6, 5]); g.beginPath(); g.arc(x, y, 14 + R() * 18, 0, 7); g.stroke(); g.setLineDash([]); }
    g.strokeStyle = '#ffd060'; g.lineWidth = 3; g.beginPath(); const pts = [[0.08, 0.8], [0.3, 0.55], [0.52, 0.62], [0.74, 0.3], [0.92, 0.2]]; pts.forEach(([x, y], i) => i ? g.lineTo(x * w, y * h) : g.moveTo(x * w, y * h)); g.stroke();
    for (const [x, y] of pts) { g.fillStyle = '#ffd060'; g.fillRect(x * w - 4, y * h - 4, 8, 8); } bars(g, R, 8, 8, w * 0.3, 1, '#9ad0ff', 5, 9);
  },
  cutaway(g, w, h, a, R) {            // ship side-view cutaway with deck lines and a lamp tile per system
    g.fillStyle = '#071018'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,160,64,0.14)'; g.lineWidth = 1; for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = '#ffa040'; g.lineWidth = 3; g.beginPath(); g.moveTo(w * 0.06, h * 0.55); g.lineTo(w * 0.2, h * 0.38); g.lineTo(w * 0.62, h * 0.36); g.lineTo(w * 0.78, h * 0.26); g.lineTo(w * 0.95, h * 0.3); g.lineTo(w * 0.95, h * 0.7); g.lineTo(w * 0.78, h * 0.72); g.lineTo(w * 0.62, h * 0.66); g.lineTo(w * 0.2, h * 0.64); g.closePath(); g.stroke();
    g.lineWidth = 1.5; for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(w * 0.2, h * (0.38 + i * 0.052)); g.lineTo(w * 0.62, h * (0.38 + i * 0.052)); g.stroke(); }
    for (let i = 0; i < 22; i++) { const x = w * (0.12 + R() * 0.78), y = h * (0.34 + R() * 0.34); g.fillStyle = R() < 0.14 ? '#ff3a2a' : R() < 0.5 ? '#40ff70' : '#ffb030'; g.fillRect(x, y, 7, 5); }
    g.strokeStyle = '#ffd890'; g.lineWidth = 2; g.strokeRect(w * 0.7, h * 0.12, w * 0.2, h * 0.1); bars(g, R, 10, h * 0.84, w * 0.5, 2, '#ffa040', 5, 9);
  },
  patch(g, w, h, a, R) {              // patch panel: rows of jacks with lamps above, a few cables plugged (coloured stubs)
    g.fillStyle = '#10151c'; g.fillRect(0, 0, w, h); const cols = 16, rows = 4, cw = w / cols, rh = h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const x = c * cw + cw / 2, y = r * rh + rh * 0.62; g.fillStyle = R() < 0.3 ? a[(r + c) % 3] : '#2a303a'; g.fillRect(x - 3, r * rh + 5, 6, 5); g.fillStyle = '#000'; g.beginPath(); g.arc(x, y, cw * 0.28, 0, 7); g.fill(); g.strokeStyle = '#6a7384'; g.lineWidth = 1.5; g.stroke(); if (R() < 0.18) { g.fillStyle = ['#d83a3a', '#40a0ff', '#e8e8e8'][Math.floor(R() * 3)]; g.fillRect(x - 2, y, 4, rh * 0.5); } }
  },
});
const perfTex = (() => { let t; return () => t || (t = ctex(128, 256, (g, W, H) => { g.fillStyle = '#3a404c'; g.fillRect(0, 0, W, H); for (let y = 4; y < H; y += 8) for (let x = 4 + ((y / 8) % 2) * 4; x < W; x += 8) g.clearRect(x - 2, y - 2, 4, 4); })); })();
const PM = {};
const perfMat = () => PM.perf || (PM.perf = new THREE.MeshStandardMaterial({ map: perfTex(), alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.5 }));

// ---------------------------------------------------------------- FLT-4 navigation station with plot table (real analogue: ship chart table / pilotage desk)
// 1.2 (x) x 0.9 (z) backlit chart top at 0.95 m over a drawer cabinet (three shallow chart drawers on the operator side), an arm-mounted repeater screen at the back right,
// parallel rule and dividers lying on the chart, a lit left edge and a pencil/stylus tray.  Standing use from +z.
function navstation() {
  const th = 'flight', M = mats(th), b = new B(), top = 0.95;
  b.box(1.16, 0.08, 0.84, M.dark, 0, 0, 0);                                                   // plinth
  b.box(1.2, 0.77, 0.86, M.body, 0, 0.08, 0);                                                 // cabinet
  for (let k = 0; k < 3; k++) { const y = 0.12 + k * 0.24; b.box(1.1, 0.21, 0.02, M.top, 0, y, 0.435); b.box(0.3, 0.025, 0.03, M.metal, 0, y + 0.15, 0.455); b.box(0.04, 0.03, 0.01, k === 1 ? M.amberLit : M.glow, 0.5, y + 0.03, 0.447); }
  b.box(1.26, 0.05, 0.96, M.top, 0, 0.85, 0);                                                 // top frame
  b.box(1.26, 0.02, 0.03, M.glow, 0, 0.84, 0.48);                                             // lit front edge
  b.box(1.14, 0.012, 0.84, scr('chart', th, 4, 256, 192), 0, 0.9, 0.0);                       // chart surface (top 0.912 + frame 0.95 lip)
  b.box(1.26, 0.04, 0.03, M.top, 0, 0.91, -0.465); b.box(0.03, 0.04, 0.96, M.top, -0.615, 0.91, 0); b.box(0.03, 0.04, 0.96, M.top, 0.615, 0.91, 0);   // raised lip 0.95
  // parallel rule: two rollers on a bar, lying across the chart; dividers: two legs hinged
  b.push(-0.12, 0.915, 0.05, 0, 0.35, 0); b.box(0.62, 0.008, 0.045, M.white, 0, 0, 0); b.cyl(0.012, 0.012, 0.05, M.dark, -0.28, 0.004, 0, 8, 0, 0, PI / 2); b.cyl(0.012, 0.012, 0.05, M.dark, 0.28, 0.004, 0, 8, 0, 0, PI / 2); b.pop();
  b.push(0.25, 0.915, 0.15, 0, -0.5, 0); b.box(0.008, 0.006, 0.18, M.metal, -0.012, 0, 0, 0, 0.08, 0); b.box(0.008, 0.006, 0.18, M.metal, 0.012, 0, 0, 0, -0.08, 0); b.sph(0.012, M.metal, 0, 0.006, -0.09, 6); b.pop();
  b.box(0.3, 0.02, 0.05, M.dark, -0.35, 0.95, -0.4); b.cyl(0.006, 0.006, 0.18, M.amber, -0.42, 0.96, -0.4, 6, 0, 0, PI / 2); b.cyl(0.006, 0.006, 0.16, M.white, -0.32, 0.96, -0.4, 6, 0, 0, PI / 2);   // pencil tray
  // repeater screen on a pivot arm from the back-right corner
  b.cyl(0.035, 0.04, 0.5, M.metal, 0.58, 0.95, -0.44, 10); b.box(0.06, 0.06, 0.06, M.dark, 0.58, 1.43, -0.44); b.push(0.58, 1.45, -0.44, 0, 0.0, 0); b.box(0.045, 0.04, 0.36, M.metal, 0, 0, 0.18); b.pop();
  b.cyl(0.02, 0.02, 0.07, M.metal, 0.58, 1.43, -0.08, 8); b.panel(0.46, 0.3, scr('screen', th, 11, 256, 160), M.dark, 0.58, 1.45, -0.04, -0.35, 0);
  const g = new THREE.Group(); g.add(b.done('station'));
  return finish(g, 'navstation', 'flight', { top: top, box: [-0.63, 0.63, -0.48, 0.48], size: [1.26, 0.96, 1.7], spots: [[0, 0.75, PI], [-0.4, 0.75, PI], [0.4, 0.75, PI]], use: { read: { x: 0, z: 0.75, yaw: PI }, plot: { x: 0.2, z: 0.75, yaw: PI }, repeater: { x: 0.58, z: 0.75, yaw: PI } } });
}

// ---------------------------------------------------------------- OPS-2 operations station (real analogue: sit-stand operations desk / control-room job desk)
// 1.6 m wide, sit-stand (telescoping legs, surface at 0.74), four tiled screens in an arc on a rear bar, a job-queue strip of 12 lit keys along the front,
// a handset in a cradle at the right end.  Seated, pelvis (0, 0.48, 0.72).
function opsstation() {
  const th = 'ops', M = mats(th), b = new B();
  for (const sx of [-1, 1]) { b.box(0.08, 0.04, 0.7, M.dark, sx * 0.72, 0, 0); b.cyl(0.05, 0.05, 0.38, M.dark, sx * 0.72, 0.04, -0.1, 12); b.cyl(0.04, 0.04, 0.3, M.metal, sx * 0.72, 0.4, -0.1, 12); }   // sit-stand telescoping legs
  b.box(1.5, 0.03, 0.1, M.dark, 0, 0.4, -0.35); b.box(1.2, 0.34, 0.02, M.dark, 0, 0.1, -0.36);                                                       // cross rail and modesty panel
  b.box(1.64, 0.04, 0.78, M.top, 0, 0.7, 0); b.box(1.64, 0.02, 0.02, M.glow, 0, 0.69, 0.39);
  b.box(1.44, 0.006, 0.12, scr('keys', th, 6, 256, 40), 0, 0.741, 0.3);                                                                               // queue strip base
  for (let i = 0; i < 12; i++) b.box(0.1, 0.014, 0.07, i < 7 ? M.glow : i < 10 ? M.amberLit : M.white, -0.66 + i * 0.12, 0.742, 0.3);                    // 12 job-queue keys
  b.box(0.5, 0.012, 0.16, M.plastic, -0.15, 0.74, 0.08); b.box(0.46, 0.004, 0.13, scr('keys', th, 8, 256, 90), -0.15, 0.752, 0.08);                   // keyboard
  b.cyl(0.04, 0.045, 0.02, M.plastic, 0.2, 0.74, 0.1, 12);                                                                                            // trackball
  // four screens in an arc on a rear bar
  b.box(1.5, 0.05, 0.05, M.metal, 0, 0.8, -0.33);
  for (const [x, ry, y, id] of [[-0.56, 0.45, 0.93, 1], [-0.19, 0.15, 0.93, 2], [0.19, -0.15, 0.93, 3], [0.56, -0.45, 0.93, 4]]) { b.cyl(0.015, 0.015, 0.14, M.metal, x, 0.82, -0.33, 8); b.panel(0.34, 0.26, scr('screen', th, 20 + id, 256, 160), M.dark, x + Math.sin(ry) * 0.05, y, -0.3 + (1 - Math.cos(ry)) * 0.2 + Math.abs(ry) * 0.06, -0.12, ry); }
  // handset in its cradle at the right end
  b.box(0.1, 0.1, 0.06, M.dark, 0.66, 0.74, -0.18); b.box(0.04, 0.02, 0.18, M.plastic, 0.64, 0.84, -0.17, 0.1); b.box(0.025, 0.04, 0.03, M.plastic, 0.64, 0.8, -0.12); b.box(0.025, 0.04, 0.03, M.plastic, 0.64, 0.8, -0.22); b.sph(0.012, M.amberLit, 0.7, 0.8, -0.14, 6);
  const g = new THREE.Group(); g.add(b.done('station')); g.add(stationChair(th, 0, 0.72, true));
  return finish(g, 'opsstation', 'ops', Object.assign(seated(0, 0.72), { box: [-0.83, 0.83, -0.4, 0.4], size: [1.64, 0.8, 1.2], use: { read: { x: 0, z: 0.31, yaw: PI }, handset: { x: 0.66, z: 0.5, yaw: PI } } }));
}

// ---------------------------------------------------------------- OPS-3 communications station (real analogue: radio operator position / dispatch desk)
// 1.4 m desk, sloped patch panel (16 x 4 jacks with lamps) over a block of channel keys, two rotary gain knobs, gooseneck microphone, a headset hook on the left
// cheek, a small status screen.  Seated, pelvis (0, 0.48, 0.72).
function commsstation() {
  const th = 'ops', M = mats(th), b = new B();
  for (const sx of [-1, 1]) b.box(0.06, 0.71, 0.74, M.body, sx * 0.67, 0, 0); b.box(1.28, 0.5, 0.03, M.dark, 0, 0.1, -0.34);
  b.box(1.4, 0.04, 0.76, M.top, 0, 0.71, 0); b.box(1.4, 0.02, 0.02, M.glow, 0, 0.69, 0.38);
  // upright with the patch panel (sloped back) and the status screen
  b.box(1.3, 0.06, 0.18, M.body, 0, 0.75, -0.26);
  b.panel(0.9, 0.34, scr('patch', th, 2, 256, 96), M.dark, -0.15, 0.82, -0.3, -0.5, 0); b.box(0.04, 0.34, 0.1, M.body, -0.65, 0.78, -0.3); b.box(0.04, 0.34, 0.1, M.body, 0.35, 0.78, -0.3);
  b.panel(0.28, 0.3, scr('screen', th, 31, 160, 160), M.dark, 0.53, 0.9, -0.3, -0.25, -0.2);
  // channel keys (sloped block), 2 rows x 8, and two gain knobs with pointers
  b.push(0, 0.74, 0.12, 0.15); b.box(0.86, 0.025, 0.2, M.dark, -0.15, 0, 0); for (let r = 0; r < 2; r++) for (let c = 0; c < 8; c++) b.box(0.08, 0.016, 0.07, (c + r) % 3 === 0 ? M.glow : (c * 3 + r) % 5 === 0 ? M.amberLit : M.white, -0.5 + c * 0.1, 0.02, -0.04 + r * 0.09); b.pop();
  for (const x of [0.3, 0.46]) { b.cyl(0.04, 0.045, 0.035, M.dark, x, 0.75, 0.15, 14); b.box(0.008, 0.01, 0.035, M.white, x, 0.785, 0.145); b.cyl(0.05, 0.05, 0.004, M.metal, x, 0.75, 0.15, 14); }
  // gooseneck microphone: base, three tilted stem segments, capsule
  b.cyl(0.04, 0.05, 0.02, M.dark, 0.0, 0.75, 0.28, 12); b.cyl(0.006, 0.006, 0.14, M.metal, 0, 0.77, 0.28, 6, 0.2); b.cyl(0.006, 0.006, 0.14, M.metal, 0.0, 0.89, 0.255, 6, 0.55); b.cyl(0.006, 0.006, 0.1, M.metal, 0, 0.96, 0.2, 6, 1.1); b.cyl(0.016, 0.014, 0.05, M.plastic, 0, 0.975, 0.14, 10, 1.5);
  // headset hook on the left cheek
  b.box(0.012, 0.012, 0.1, M.metal, -0.71, 0.55, 0.15); b.box(0.012, 0.06, 0.012, M.metal, -0.71, 0.5, 0.2); b.box(0.04, 0.014, 0.012, M.red, -0.69, 0.43, 0.21);
  const g = new THREE.Group(); g.add(b.done('station')); g.add(stationChair(th, 0, 0.72, true));
  return finish(g, 'commsstation', 'ops', Object.assign(seated(0, 0.72), { box: [-0.73, 0.73, -0.4, 0.4], size: [1.4, 0.76, 1.25], use: { read: { x: 0, z: 0.31, yaw: PI }, hook: { x: -0.71, z: 0.5, yaw: PI } } }));
}

// ---------------------------------------------------------------- OPS-4 transceiver cabinet and relay rack (real analogue: 19-inch 42U equipment cabinet)
// 0.6 x 0.8 x 2.0 m, perforated front door hinged open on the left (child group 'door'), six pull-out relay modules (handle + two lamps each; the fourth is drawn
// out 0.3 m), cable duct on the right, a rectangular waveguide leaving the top and bending toward the wall (-z).
function relayrack() {
  const th = 'ops', M = mats(th), b = new B(), PF = perfMat();
  b.box(0.6, 0.05, 0.8, M.dark, 0, 0, 0); b.box(0.6, 0.05, 0.8, M.body, 0, 1.95, 0); b.box(0.025, 1.9, 0.8, M.body, -0.2875, 0.05, 0); b.box(0.025, 1.9, 0.8, M.body, 0.2875, 0.05, 0); b.box(0.55, 1.9, 0.02, M.dark, 0, 0.05, -0.39);
  for (const sx of [-1, 1]) b.box(0.03, 1.9, 0.03, M.metal, sx * 0.255, 0.05, 0.37);                       // front mounting rails
  for (let i = 0; i < 6; i++) {
    const y = 0.28 + i * 0.26, out = i === 3 ? 0.3 : 0;
    b.box(0.48, 0.2, 0.6, M.dark, 0, y, -0.06 + out * 0.4);                                                 // module body
    b.box(0.5, 0.22, 0.03, M.top, 0, y - 0.01, 0.37 + out); b.box(0.2, 0.02, 0.03, M.metal, 0, y + 0.12, 0.395 + out);   // front plate and handle
    b.box(0.03, 0.03, 0.01, i === 3 ? M.amberLit : M.greenLit, -0.18, y + 0.14, 0.388 + out); b.box(0.03, 0.03, 0.01, i === 1 ? M.redLit : M.glow, -0.12, y + 0.14, 0.388 + out);
    b.box(0.3, 0.012, 0.01, scr('keys', th, 40 + i, 128, 20), 0.0, y + 0.03, 0.388 + out);
    if (out) b.box(0.46, 0.01, 0.34, M.metal, 0, y - 0.02, 0.2 + out * 0.5);                                // slide rails of the drawn module
  }
  b.box(0.06, 1.7, 0.06, M.plastic, 0.23, 0.15, -0.3); for (let i = 0; i < 6; i++) b.cyl(0.012, 0.012, 0.2, M.plastic, 0.2, 0.3 + i * 0.26, -0.3, 6, 0, 0, PI / 2);
  // waveguide: flange, vertical run, elbow, run toward the wall, flange
  b.box(0.14, 0.02, 0.08, M.metal, -0.1, 2.0, -0.1); b.box(0.1, 0.34, 0.05, M.acc, -0.1, 2.02, -0.1); b.box(0.12, 0.02, 0.07, M.metal, -0.1, 2.2, -0.1); b.box(0.1, 0.1, 0.05, M.acc, -0.1, 2.36, -0.1);
  b.box(0.1, 0.05, 0.45, M.acc, -0.1, 2.36, -0.4); for (const z of [-0.25, -0.5]) b.box(0.14, 0.09, 0.015, M.metal, -0.1, 2.34, z);
  b.box(0.1, 0.05, 0.05, M.body, -0.1, 2.31, -0.1);
  const g = new THREE.Group(); g.add(b.done('rack'));
  const d = new B(); d.box(0.56, 1.88, 0.02, M.dark, 0.28, 0.0, 0); d.box(0.02, 1.88, 0.03, M.metal, 0.55, 0, 0); d.box(0.03, 0.16, 0.035, M.metal, 0.5, 0.9, 0.02);
  const dm = d.done('door'); const perf = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 1.8), PF); perf.position.set(0.28, 0.94, 0.012); dm.add(perf); dm.userData.tris += 2; dm.position.set(-0.28, 0.05, 0.41); dm.rotation.y = -1.75; g.add(dm);
  return finish(g, 'relayrack', 'ops', { box: [-0.3, 0.3, -0.4, 0.4], size: [0.6, 0.8, 2.0], spots: [[0, 0.85, PI]], door: dm, use: { read: { x: 0, z: 0.85, yaw: PI }, module: { x: 0.0, z: 0.55, yaw: PI }, pulled: { x: 0, y: 1.3, z: 0.6 } } });
}

// ---------------------------------------------------------------- OPS-6 pattern buffer tank (real analogue: vertical pressure vessel / cryogenic dewar)
// 0.6 m diameter x 1.8 m, dome ends, four cooling rings, a vertical sight window with a slow glow (userData.sight = its material, pulse its colour or opacity),
// a valve block with handwheel at the base and two armoured cables running back toward the wall.
function buffertank() {
  const th = 'ops', M = mats(th), b = new B(), sight = new THREE.MeshBasicMaterial({ color: 0x40ffe0 });
  b.cyl(0.32, 0.34, 0.12, M.dark, 0, 0, 0, 20); b.cyl(0.29, 0.31, 0.1, M.body, 0, 0.12, 0, 20);                                    // plinth
  b.cyl(0.28, 0.28, 1.3, M.metal, 0, 0.24, 0, 20); b.cyl(0.2, 0.28, 0.1, M.metal, 0, 1.54, 0, 20); b.cyl(0.11, 0.2, 0.08, M.metal, 0, 1.64, 0, 20); b.cyl(0.07, 0.07, 0.07, M.dark, 0, 1.72, 0, 12);   // shell, shoulder, dome, vent cap
  for (const y of [0.4, 0.74, 1.08, 1.42]) b.cyl(0.305, 0.305, 0.06, M.acc, 0, y, 0, 20);                                            // cooling rings
  b.box(0.2, 0.62, 0.05, M.dark, 0, 0.58, 0.27); b.box(0.12, 0.54, 0.012, sight, 0, 0.62, 0.3); for (const y of [0.45, 0.65, 0.85]) b.box(0.15, 0.012, 0.012, M.metal, 0, y, 0.305);   // sight window
  b.box(0.2, 0.2, 0.14, M.body, 0.0, 0.14, 0.3); b.cyl(0.05, 0.05, 0.03, M.red, 0, 0.2, 0.4, 14, PI / 2); b.cyl(0.012, 0.012, 0.12, M.metal, 0, 0.14, 0.38, 6, PI / 2); b.cyl(0.02, 0.02, 0.1, M.dark, -0.12, 0.2, 0.3, 8, 0, 0, PI / 2);   // valve block, handwheel, side outlet
  b.cyl(0.03, 0.03, 0.2, M.dark, 0.0, 1.55, 0.3, 8, PI / 2);                                                                         // pressure tap
  // armoured cables: tubes from the shell base to the floor behind the tank (ring ridges via a second thinner tube pass is skipped for budget)
  for (const sx of [-1, 1]) { const c = new THREE.CatmullRomCurve3([new THREE.Vector3(sx * 0.14, 0.26, -0.28), new THREE.Vector3(sx * 0.2, 0.2, -0.4), new THREE.Vector3(sx * 0.34, 0.07, -0.5), new THREE.Vector3(sx * 0.4, 0.035, -0.68)]); b.put(new THREE.TubeGeometry(c, 12, 0.032, 6, false), M.rubber, 0, 0, 0); b.cyl(0.04, 0.04, 0.04, M.metal, sx * 0.14, 0.24, -0.28, 8, PI / 2); }
  const g = new THREE.Group(); g.add(b.done('tank'));
  return finish(g, 'buffertank', 'ops', { top: undefined, box: [-0.45, 0.45, -0.5, 0.45], size: [0.6, 0.6, 1.8], sight, spots: [[0, 0.85, PI]], use: { read: { x: 0, z: 0.85, yaw: PI }, valve: { x: 0, z: 0.55, yaw: PI }, sightGlass: { x: 0, y: 0.62, z: 0.45 } } });
}

// ---------------------------------------------------------------- ENG-15 systems plotting table (real analogue: large light table / master systems display table)
// 2.0 x 1.1 m glass top at 0.95 m on two vented cabinets with a knee gap, ship cutaway and system lamps on the surface, a touch-key strip on each long side;
// people stand on both long sides (+z and -z, spots listed).
function plottable() {
  const th = 'eng', M = mats(th), b = new B();
  for (const sx of [-1, 1]) { b.box(0.72, 0.84, 0.96, M.body, sx * 0.64, 0.06, 0); for (const z of [-1, 1]) for (let k = 0; k < 5; k++) b.box(0.5, 0.012, 0.01, M.slot, sx * 0.64, 0.3 + k * 0.08, z * 0.485); b.box(0.74, 0.06, 0.98, M.dark, sx * 0.64, 0, 0); b.box(0.74, 0.015, 0.98, M.hazard, sx * 0.64, 0.06, 0); }
  b.box(0.58, 0.8, 0.03, M.dark, 0, 0.1, -0.2); b.box(0.5, 0.012, 0.4, M.slot, 0, 0.11, 0.0);                                         // knee gap back panel
  b.box(2.04, 0.07, 1.14, M.top, 0, 0.88, 0); b.box(2.04, 0.02, 0.02, M.glow, 0, 0.87, 0.57); b.box(2.04, 0.02, 0.02, M.glow, 0, 0.87, -0.57);
  b.box(1.94, 0.012, 1.04, scr('cutaway', th, 9, 320, 176), 0, 0.944, 0);                                                              // lit surface (top 0.956)
  b.box(2.04, 0.025, 0.04, M.top, 0, 0.95, 0.55); b.box(2.04, 0.025, 0.04, M.top, 0, 0.95, -0.55); b.box(0.04, 0.025, 1.14, M.top, -1.0, 0.95, 0); b.box(0.04, 0.025, 1.14, M.top, 1.0, 0.95, 0);   // bezel lip (0.975)
  for (const z of [-1, 1]) { b.box(0.9, 0.006, 0.12, scr('keys', th, 12 + z, 256, 40), 0, 0.956, z * 0.45); for (let i = 0; i < 6; i++) b.box(0.05, 0.008, 0.05, i % 2 ? M.glow : M.white, -0.5 + i * 0.1, 0.957, z * 0.45); }
  const g = new THREE.Group(); g.add(b.done('table'));
  return finish(g, 'plottable', 'engineering', { top: 0.975, box: [-1.02, 1.02, -0.58, 0.58], size: [2.04, 1.14, 0.98], spots: [[0, 0.85, PI], [-0.6, 0.85, PI], [0.6, 0.85, PI], [0, -0.85, 0], [0.6, -0.85, 0]], use: { read: { x: 0, z: 0.85, yaw: PI }, readFar: { x: 0, z: -0.85, yaw: 0 }, touchNear: { x: 0, z: 0.7, yaw: PI } } });
}

export const kinds = { navstation, opsstation, commsstation, relayrack, buffertank, plottable };
export const KIND_NAMES = Object.keys(kinds);
