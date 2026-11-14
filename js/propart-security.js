// Batch 8 prop art: security and damage control (docs/asset-gaps.md section 12, batch 8).
//   SEC-2 field cell (`cellfield`: the brig cell with a force-field emitter portal instead of bars), SEC-3 power-cell charging rack (`chargerack`),
//   SEC-7 armoury issue hatch counter (`issuecounter`).  Wall fixtures (ENG-8 DC locker, SEC-4 emitter / camera / reader) are in js/decorart-security.js;
//   items (ENG-9 patch / clamp / gauge, ENG-10 breather, SEC-5 cuffs) are in js/itemart-security.js.
// Same contract and conventions as js/propart-stations1.js (docs/propart-stations1.md): `export const kinds = { name: (m, h) => THREE.Group }`, origin at the floor centre of
// a 2.5 m tile, +z front, metres, one mesh per material.  Helpers from js/propart-kit2.js.
import { THREE, PI, B, mats, scr, finish, TH, KINDS_TEX, ctex, rr, rng } from './propart-kit2.js';

const SM = {};
const studMat = () => SM.stud || (SM.stud = new THREE.MeshBasicMaterial({ color: 0x7cd0ff }));
const fieldMat = () => SM.field || (SM.field = new THREE.MeshBasicMaterial({ color: 0x58b8ff, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
let _mesh; const meshMat = () => _mesh || (_mesh = new THREE.MeshStandardMaterial({ map: ctex(128, 128, (g, W, H) => { g.fillStyle = '#8a929e'; for (let x = 0; x < W; x += 8) g.fillRect(x, 0, 2, H); for (let y = 0; y < H; y += 8) g.fillRect(0, y, W, 2); }), alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.45 }));

// ---------------------------------------------------------------- SEC-2 force-field cell (real analogue: custody cell with a glazed or beam front; here an emitter portal)
// Same footprint and use as the barred `cell` (box [-0.95, 0.95, -0.9, 0.6], one standing spot 1.05 m in front): bunk with mattress and pillow, steel toilet, a lit ceiling-less
// back plate, and at the front (z = 0.55) a portal: top and bottom rails 1.9 m x 0.12 m square with emitter studs every 0.15 m on the faces that look at each other,
// two upright posts, a faint translucent field plane between them, and a wall control pedestal on the right with a status lamp and three keys.
// userData.field = the plane's material (set .opacity / .color: 0.14 live, 0.0 = field down; the integrator can drive it from the cell state).
function cellfield() {
  const th = 'security', M = mats(th), b = new B(), fm = fieldMat();
  // bunk, mattress, pillow
  b.box(1.9, 0.3, 0.8, M.dark, 0, 0, -0.5); b.box(1.84, 0.1, 0.74, M.seat, 0, 0.3, -0.5); b.box(0.4, 0.06, 0.3, M.white, -0.65, 0.4, -0.5); b.box(1.9, 0.04, 0.02, M.glow, 0, 0.14, -0.09);
  // steel toilet with cistern and a hand basin on the back plate
  b.cyl(0.16, 0.12, 0.38, M.metal, 0.75, 0, 0.1, 14); b.cyl(0.14, 0.14, 0.03, M.dark, 0.75, 0.38, 0.1, 14); b.box(0.3, 0.3, 0.12, M.metal, 0.75, 0.38, -0.08);
  b.box(0.3, 0.2, 0.1, M.metal, -0.5, 0.9, -0.86); b.box(0.24, 0.02, 0.06, M.dark, -0.5, 1.1, -0.84);
  // portal: rails, posts
  const z = 0.55;
  b.box(1.9, 0.12, 0.12, M.metal, 0, 0, z); b.box(1.9, 0.12, 0.12, M.metal, 0, 1.95, z);
  for (const sx of [-1, 1]) b.box(0.07, 1.95, 0.1, M.dark, sx * 0.915, 0.12, z);
  b.box(1.9, 0.02, 0.01, M.hazard, 0, 0.05, z + 0.062);                                                       // hazard line on the bottom rail
  for (let i = 0; i < 13; i++) { const x = -0.9 + i * 0.15; b.box(0.04, 0.03, 0.04, studMat(), x, 0.12, z); b.box(0.04, 0.03, 0.04, studMat(), x, 1.92, z); }   // emitter studs (26)
  b.box(1.82, 1.83, 0.004, fm, 0, 0.12, z);                                                                   // field plane
  // control pedestal outside the right post
  b.box(0.2, 1.3, 0.1, M.body, 1.06, 0, 0.55); b.box(0.16, 0.26, 0.012, M.dark, 1.06, 1.0, 0.65); b.box(0.12, 0.05, 0.012, M.greenLit, 1.06, 1.18, 0.662); b.sph(0.016, M.redLit, 1.1, 1.08, 0.667, 6);
  for (let i = 0; i < 3; i++) b.box(0.035, 0.03, 0.014, i === 1 ? M.amberLit : M.white, 1.0 + i * 0.05, 1.03, 0.66);
  const g = new THREE.Group(); g.add(b.done('cell'));
  return finish(g, 'cellfield', 'security', { box: [-0.95, 0.95, -0.9, 0.6], size: [2.3, 1.55, 2.07], field: fm, variant: 'cell', spots: [[0, 1.05, PI]], use: { emitter: { x: 0, z: 1.05, yaw: PI }, panel: { x: 1.06, z: 1.05, yaw: PI }, bunk: { x: 0, z: -0.5 } } });
}

// ---------------------------------------------------------------- SEC-3 power-cell charging rack (real analogue: battery charging cabinet)
// 0.9 x 0.5 x 1.8 m open-front cabinet, five shelves of eight slots (40 bays: 37 cells and 3 empty, a lamp per slot: green charged / amber charging / red fault), a fan grille at the
// bottom, a master gauge at eye height with a load lamp and a lever isolator, side vents.  Standing use from +z.
function chargerack() {
  const th = 'security', M = mats(th), b = new B(), W = 0.9, D = 0.5;
  b.box(W, 0.08, D, M.dark, 0, 0, 0); b.box(W, 0.04, D, M.body, 0, 1.76, 0); b.box(0.04, 1.68, D, M.body, -W / 2 + 0.02, 0.08, 0); b.box(0.04, 1.68, D, M.body, W / 2 - 0.02, 0.08, 0); b.box(W - 0.08, 1.68, 0.02, M.dark, 0, 0.08, -D / 2 + 0.01);
  for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) b.box(0.006, 0.02, 0.3, M.slot, sx * (W / 2 + 0.001), 0.5 + k * 0.1, 0);              // side vent slots
  // fan grille at the bottom: frame, slats, a round fan behind
  b.box(W - 0.1, 0.22, 0.02, M.metal, 0, 0.1, D / 2 - 0.05); for (let k = 0; k < 7; k++) b.box(W - 0.14, 0.012, 0.02, M.dark, 0, 0.13 + k * 0.025, D / 2 - 0.035); b.cyl(0.09, 0.09, 0.01, M.slot, 0.0, 0.3 - 0.2, D / 2 - 0.06, 16, PI / 2);
  const R = rng(7);
  for (let s = 0; s < 5; s++) {
    const y = 0.46 + s * 0.235;
    b.box(W - 0.08, 0.02, D - 0.04, M.metal, 0, y, 0);                                                                                           // shelf
    b.box(W - 0.1, 0.07, 0.012, M.dark, 0, y + 0.02, D / 2 - 0.03);                                                                            // slot rail with the lamp row
    for (let i = 0; i < 8; i++) {
      const x = -0.35 + i * 0.1, empty = (s === 1 && i === 5) || (s === 3 && i === 2) || (s === 4 && i === 7), v = R();
      if (!empty) { b.box(0.062, 0.15, 0.3, M.metal, x, y + 0.02, 0.0); b.box(0.05, 0.02, 0.012, M.dark, x, y + 0.12, D / 2 - 0.045); }
      b.box(0.026, 0.014, 0.008, empty ? M.slot : v < 0.08 ? M.redLit : v < 0.4 ? M.amberLit : M.greenLit, x, y + 0.045, D / 2 - 0.022);
    }
  }
  // master gauge and isolator at eye height
  b.box(W - 0.08, 0.22, 0.03, M.top, 0, 1.54, D / 2 - 0.05); b.cyl(0.085, 0.085, 0.03, M.dark, -0.2, 1.57, D / 2 - 0.03, 16, PI / 2); b.cyl(0.07, 0.07, 0.006, scr('dial', th, 3, 128, 128), -0.2, 1.57, D / 2 - 0.012, 16, PI / 2);
  b.box(0.28, 0.1, 0.01, scr('readout', th, 5, 128, 64), 0.1, 1.58, D / 2 - 0.032); b.box(0.04, 0.04, 0.01, M.amberLit, 0.34, 1.62, D / 2 - 0.032); b.box(0.025, 0.1, 0.02, M.red, 0.34, 1.54, D / 2 - 0.03, 0, 0, 0.5);
  const g = new THREE.Group(); g.add(b.done('rack'));
  return finish(g, 'chargerack', 'security', { box: [-0.46, 0.46, -0.26, 0.26], size: [0.9, 0.5, 1.8], spots: [[0, 0.78, PI], [-0.3, 0.78, PI], [0.3, 0.78, PI]], use: { read: { x: -0.2, z: 0.78, yaw: PI }, swap: { x: 0.1, z: 0.78, yaw: PI }, shelves: [1, 2, 3, 4, 5].map(i => ({ y: 0.5 + (i - 1) * 0.235 })) } });
}

// ---------------------------------------------------------------- SEC-7 issue hatch counter (real analogue: stores / armourer's issue counter)
// 1.5 m wide, counter top 1.05 m (steel with an ESD mat), cabinet body with drawer fronts on the staff side (+z), a mesh screen above (1.05 to 2.1 m) with a 0.5 x 0.3 m
// pass-through at 1.1 m and a ledge tray, a sign-out board on the right upright facing the staff side, a log tablet and a status lamp.  Staff stand at +z, the customer at -z.
function issuecounter() {
  const th = 'security', M = mats(th), b = new B(), MS = meshMat();
  b.box(1.46, 0.08, 0.62, M.dark, 0, 0, 0); b.box(1.46, 0.93, 0.6, M.body, 0, 0.08, 0);
  for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) { const x = -0.48 + j * 0.48; b.box(0.44, 0.26, 0.015, M.top, x, 0.14 + k * 0.29, 0.305); b.box(0.16, 0.025, 0.02, M.metal, x, 0.34 + k * 0.29 - 0.04, 0.32); }   // 9 drawer fronts
  b.box(1.54, 0.04, 0.74, M.metal, 0, 1.01, 0); b.box(1.54, 0.02, 0.02, M.hazard, 0, 1.0, -0.37);                                                                // steel top, hazard edge on the customer side
  b.box(1.3, 0.006, 0.5, M.rubber, 0, 1.05, 0.12);                                                                                                               // ESD mat
  b.box(0.5, 0.02, 0.2, M.metal, 0, 1.05, -0.22);                                                                                                                  // pass-through ledge tray
  // screen: two uprights, top beam, mesh panels left / right / above the hatch
  for (const sx of [-1, 1]) b.box(0.06, 1.1, 0.06, M.metal, sx * 0.75, 1.05, -0.25); b.box(1.56, 0.06, 0.06, M.metal, 0, 2.1, -0.25);
  for (const sx of [-1, 1]) b.push(sx * 0.5, 1.58, -0.25).box(0.5, 1.0, 0.012, MS, 0, -0.5, 0).pop();
  b.box(0.5, 0.7, 0.012, MS, 0, 1.4, -0.25);
  for (const [w, h, x, y] of [[0.52, 0.03, 0, 1.38], [0.52, 0.03, 0, 1.08], [0.03, 0.33, -0.255, 1.08], [0.03, 0.33, 0.255, 1.08]]) b.box(w, h, 0.05, M.metal, x, y, -0.25);   // hatch frame
  b.box(0.4, 0.012, 0.012, M.amberLit, 0, 1.43, -0.22);                                                                                                            // hatch light bar
  // sign-out board on the right upright, facing the staff
  b.box(0.3, 0.42, 0.02, M.dark, 0.6, 1.2, -0.215); b.box(0.26, 0.36, 0.006, scr('charts', th, 3, 256, 128), 0.6, 1.23, -0.2); b.box(0.1, 0.03, 0.03, M.metal, 0.6, 1.62, -0.21);
  // log tablet, scanner puck, status lamp
  b.box(0.3, 0.015, 0.2, M.dark, -0.3, 1.05, 0.25, -0.2); b.box(0.27, 0.004, 0.17, scr('screen', th, 51, 192, 128), -0.3, 1.066, 0.25, -0.2);
  b.cyl(0.05, 0.055, 0.02, M.plastic, 0.3, 1.05, 0.25, 12); b.cyl(0.03, 0.03, 0.06, M.greenLit, -0.72, 1.05, 0.28, 10);
  const g = new THREE.Group(); g.add(b.done('counter'));
  return finish(g, 'issuecounter', 'security', { top: 1.05, box: [-0.78, 0.78, -0.4, 0.4], size: [1.56, 0.8, 2.1], spots: [[0, 0.75, PI], [-0.4, 0.75, PI], [0.4, 0.75, PI]], use: { staff: { x: 0, z: 0.75, yaw: PI }, hatch: { x: 0, y: 1.25, z: -0.25 }, customer: { x: 0, z: -0.85, yaw: 0 }, board: { x: 0.6, z: 0.75, yaw: PI } } });
}

export const kinds = { cellfield, chargerack, issuecounter };
export const KIND_NAMES = Object.keys(kinds);
void TH; void KINDS_TEX; void rr;
