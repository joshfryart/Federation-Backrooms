// Held items and carts: small procedural meshes (crate, parts box, cup, meal tray, toolbox, medkit, PADD, hose coil, ration bar, tools…),
// attaching them to a rigged human's hand bones (js/humans.js) and pushable carts with rolling wheels.
//   makeItemMesh(id)                 a mesh for an ITEMS id from js/equipment.js (metres, origin at the grip)
//   holdItem(H, id, hand='hand_r')   parent the item to the hand bone so it follows the animation; two-handed items sit between both hands
//   dropItem(H, hand)  /  heldIn(H, hand)  /  tickHeld(H)  (call after H.update for two-handed items)
//   makeCart(kind='cargo', loaded)   flat cargo cart, medical trolley or tool cart: userData { kind, handle, half, wheels, load[] }
//   rollCart(cart, dist)  spin the wheels;  cartLoad(cart, id) / cartUnload(cart) -> id;  cartHandle(cart) world point the pusher holds
import * as THREE from 'three';
import { ITEMS, CARTS, handsFor } from './equipment.js';

const M = {};
function mats() {
  if (M.metal) return M; const std = (o) => new THREE.MeshStandardMaterial(o);
  Object.assign(M, {
    metal: std({ color: 0x9aa0a8, metalness: 0.85, roughness: 0.38 }), dark: std({ color: 0x24272e, metalness: 0.5, roughness: 0.5 }), white: std({ color: 0xe4e8ea, roughness: 0.35 }),
    red: std({ color: 0xb8322a, roughness: 0.45, metalness: 0.2 }), olive: std({ color: 0x5f6650, roughness: 0.7, metalness: 0.3 }), card: std({ color: 0x9a7a4a, roughness: 0.85 }),
    hazard: std({ color: 0xd8a818, roughness: 0.6 }), rubber: std({ color: 0x111114, roughness: 0.9 }), brown: std({ color: 0x4a2a14, roughness: 0.3 }), food: std({ color: 0xc98b3a, roughness: 0.8 }),
    green: std({ color: 0x5f9a3a, roughness: 0.8 }), cloth: std({ color: 0xa9bfd6, roughness: 0.95 }), hose: std({ color: 0xc8a020, roughness: 0.6 }), blue: std({ color: 0x2f5fa8, roughness: 0.5, metalness: 0.3 }),
    glass: std({ color: 0xd8b060, roughness: 0.1, transparent: true, opacity: 0.6 }),
    screen: new THREE.MeshBasicMaterial({ color: 0x5ac8ff }), glowG: new THREE.MeshBasicMaterial({ color: 0x40ff90 }), glowR: new THREE.MeshBasicMaterial({ color: 0xff4030 }),
  });
  return M;
}
const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; return o; };
const cyl = (r0, r1, h, m, x = 0, y = 0, z = 0, seg = 12) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m); o.position.set(x, y, z); o.castShadow = true; return o; };

// ---- item meshes. Local frame: +y up (when the item rests on a surface), origin at the grip; ud.rest = height of the origin above a surface
export function makeItemMesh(id) {
  const m = mats(), g = new THREE.Group(); g.name = 'item:' + id; g.userData.item = id; let rest = 0;
  switch (id) {
    case 'cup': g.add(cyl(0.042, 0.036, 0.1, m.white, 0, 0, 0)); g.add(cyl(0.037, 0.037, 0.005, m.brown, 0, 0.046, 0)); { const h = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.007, 6, 12), m.white); h.position.set(0.05, 0, 0); g.add(h); } rest = 0.05; break;
    case 'glass': g.add(cyl(0.035, 0.03, 0.11, m.glass)); g.add(cyl(0.031, 0.028, 0.06, m.food, 0, -0.02, 0)); rest = 0.055; break;
    case 'tray': g.add(box(0.44, 0.018, 0.32, m.metal)); g.add(cyl(0.1, 0.09, 0.015, m.white, -0.08, 0.016, 0, 16)); g.add(cyl(0.05, 0.06, 0.04, m.food, -0.1, 0.035, 0.02)); g.add(box(0.06, 0.03, 0.05, m.green, -0.03, 0.03, -0.04)); g.add(cyl(0.036, 0.032, 0.09, m.white, 0.13, 0.055, 0.07)); g.add(box(0.12, 0.012, 0.016, m.metal, 0.12, 0.016, -0.08)); rest = 0.01; break;
    case 'ration': g.add(box(0.13, 0.022, 0.045, m.hazard)); g.add(box(0.04, 0.024, 0.046, m.dark, 0.045, 0, 0)); rest = 0.011; break;
    case 'padd': g.add(box(0.14, 0.012, 0.2, m.dark)); { const s = box(0.12, 0.002, 0.15, m.screen, 0, 0.007, 0.012); s.castShadow = false; g.add(s); } g.add(box(0.03, 0.003, 0.012, m.glowG, 0.04, 0.007, -0.085)); rest = 0.006; break;
    case 'tool': g.add(cyl(0.017, 0.017, 0.16, m.dark, 0, 0, 0)); g.add(box(0.05, 0.05, 0.035, m.metal, 0, 0.1, 0)); g.add(cyl(0.008, 0.008, 0.08, m.metal, 0, 0.16, 0)); g.add(box(0.012, 0.012, 0.012, m.glowG, 0, 0.12, 0.02)); rest = 0.017; g.userData.lie = true; break;
    case 'toolbox': g.add(box(0.42, 0.17, 0.2, m.red, 0, -0.14, 0)); g.add(box(0.43, 0.02, 0.21, m.dark, 0, -0.06, 0)); g.add(box(0.2, 0.025, 0.025, m.dark, 0, 0, 0)); for (const sx of [-1, 1]) g.add(box(0.02, 0.06, 0.02, m.dark, sx * 0.1, -0.03, 0)); rest = 0.235; break;
    case 'medkit': g.add(box(0.3, 0.2, 0.11, m.white, 0, -0.13, 0)); g.add(box(0.1, 0.03, 0.115, m.red, 0, -0.12, 0)); g.add(box(0.03, 0.1, 0.115, m.red, 0, -0.12, 0)); g.add(box(0.14, 0.02, 0.02, m.dark, 0, -0.02, 0)); rest = 0.23; break;
    case 'scanner': g.add(box(0.07, 0.03, 0.14, m.dark)); g.add(box(0.05, 0.004, 0.06, m.screen, 0, 0.017, 0.02)); g.add(box(0.02, 0.02, 0.02, m.glowR, 0, 0, 0.075)); rest = 0.015; break;
    case 'vial': g.add(cyl(0.012, 0.012, 0.08, m.glass)); g.add(cyl(0.01, 0.01, 0.04, m.glowG, 0, -0.015, 0, 8)); g.add(cyl(0.014, 0.014, 0.012, m.dark, 0, 0.045, 0)); rest = 0.04; break;
    case 'chip': g.add(box(0.05, 0.004, 0.08, m.glowR)); g.add(box(0.052, 0.003, 0.02, m.metal, 0, 0, -0.04)); rest = 0.002; break;
    case 'zapper': g.add(box(0.035, 0.12, 0.045, m.dark, 0, 0, 0)); g.add(box(0.035, 0.05, 0.16, m.metal, 0, 0.07, 0.05)); g.add(box(0.02, 0.02, 0.02, m.glowR, 0, 0.07, 0.135)); rest = 0.02; g.userData.lie = true; break;
    case 'dumbbell': { const b = cyl(0.014, 0.014, 0.3, m.metal); b.rotation.z = Math.PI / 2; g.add(b); for (const sx of [-1, 1]) { const d = cyl(0.06, 0.06, 0.05, m.dark, sx * 0.12, 0, 0, 14); d.rotation.z = Math.PI / 2; g.add(d); } rest = 0.06; break; }
    case 'linen': for (let i = 0; i < 4; i++) g.add(box(0.34, 0.045, 0.26, m.cloth, (i % 2) * 0.01, i * 0.046, 0)); rest = 0.023; break;
    case 'smallbox': g.add(box(0.36, 0.24, 0.3, m.card)); g.add(box(0.365, 0.03, 0.06, m.hazard, 0, 0.11, 0)); rest = 0.12; break;
    case 'crate': g.add(box(0.52, 0.4, 0.44, m.olive)); g.add(box(0.53, 0.05, 0.45, m.dark, 0, 0.02, 0)); g.add(box(0.2, 0.08, 0.005, m.hazard, 0, 0.1, 0.223)); for (const sx of [-1, 1]) g.add(box(0.02, 0.05, 0.14, m.dark, sx * 0.27, 0.12, 0)); rest = 0.2; break;
    case 'hose': for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.15 - i * 0.012, 0.022, 6, 20), m.hose); t.rotation.x = Math.PI / 2; t.position.y = -0.15 + i * 0.02; t.castShadow = true; g.add(t); } g.add(cyl(0.025, 0.025, 0.06, m.metal, 0.15, -0.1, 0)); rest = 0.17; break;
    // ---- handhelds (js/handhelds.js): grip at the origin, working end along +y
    case 'tricorder': case 'tricorder_med': case 'tricorder_sec': { const c = id === 'tricorder_med' ? m.blue : id === 'tricorder_sec' ? m.red : m.dark; g.add(box(0.075, 0.12, 0.03, c, 0, 0.02, 0)); const lid = box(0.075, 0.06, 0.012, m.metal, 0, 0.1, -0.025); lid.rotation.x = -0.5; g.add(lid); { const sc = box(0.06, 0.045, 0.002, m.screen, 0, 0.05, 0.016); sc.castShadow = false; g.add(sc); } g.add(box(0.05, 0.012, 0.004, m.glowG, 0, -0.01, 0.016)); rest = 0.015; g.userData.lie = true; break; }
    case 'badge': g.add(box(0.035, 0.045, 0.008, m.hazard)); rest = 0.004; break;
    case 'phaser1': g.add(box(0.035, 0.03, 0.11, m.dark, 0, 0.0, 0.03)); g.add(box(0.012, 0.012, 0.02, m.glowR, 0, 0, 0.09)); rest = 0.015; g.userData.lie = true; break;
    case 'phaser2': g.add(box(0.03, 0.1, 0.035, m.dark, 0, -0.03, 0)); g.add(box(0.035, 0.04, 0.17, m.metal, 0, 0.03, 0.06)); g.add(box(0.014, 0.014, 0.02, m.glowR, 0, 0.03, 0.15)); rest = 0.02; g.userData.lie = true; break;
    case 'rifle': g.add(box(0.04, 0.06, 0.55, m.dark, 0, 0.02, 0.12)); g.add(box(0.03, 0.1, 0.04, m.dark, 0, -0.04, 0)); g.add(box(0.035, 0.08, 0.14, m.metal, 0, 0.0, -0.19)); g.add(box(0.016, 0.016, 0.03, m.glowR, 0, 0.03, 0.41)); rest = 0.03; g.userData.lie = true; break;
    case 'hypospray': g.add(cyl(0.016, 0.016, 0.1, m.metal, 0, 0, 0)); g.add(cyl(0.02, 0.02, 0.03, m.blue, 0, -0.05, 0)); g.add(cyl(0.006, 0.01, 0.025, m.white, 0, 0.06, 0, 8)); rest = 0.016; g.userData.lie = true; break;
    case 'dermal': g.add(cyl(0.018, 0.014, 0.13, m.white, 0, 0, 0)); g.add(cyl(0.012, 0.012, 0.01, m.glowG, 0, 0.07, 0, 8)); rest = 0.018; g.userData.lie = true; break;
    case 'scalpel': g.add(box(0.012, 0.11, 0.008, m.metal, 0, 0, 0)); g.add(box(0.004, 0.025, 0.003, m.glowR, 0, 0.065, 0)); rest = 0.004; g.userData.lie = true; break;
    case 'wrench': g.add(box(0.025, 0.24, 0.008, m.metal, 0, 0.04, 0)); for (const sy of [-1, 1]) g.add(box(0.05, 0.03, 0.009, m.metal, 0, 0.04 + sy * 0.12, 0)); rest = 0.005; g.userData.lie = true; break;
    case 'torch': g.add(cyl(0.022, 0.022, 0.18, m.dark, 0, 0, 0)); g.add(cyl(0.012, 0.018, 0.12, m.metal, 0, 0.14, 0, 8)); g.add(cyl(0.006, 0.006, 0.02, m.glowR, 0, 0.21, 0, 6)); g.add(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 14), m.hose)); rest = 0.022; g.userData.lie = true; break;
    case 'flashlight': g.add(cyl(0.017, 0.017, 0.15, m.dark, 0, 0, 0)); g.add(cyl(0.026, 0.018, 0.04, m.metal, 0, 0.09, 0)); g.add(cyl(0.022, 0.022, 0.004, m.screen, 0, 0.112, 0)); rest = 0.02; g.userData.lie = true; break;
    case 'extinguisher': g.add(cyl(0.07, 0.07, 0.38, m.red, 0, -0.24, 0)); g.add(cyl(0.02, 0.02, 0.05, m.dark, 0, -0.03, 0)); g.add(box(0.12, 0.015, 0.025, m.dark, 0.03, 0.0, 0)); { const h = cyl(0.008, 0.008, 0.25, m.rubber, 0.08, -0.12, 0, 6); h.rotation.z = 0.2; g.add(h); } rest = 0.43; break;
    case 'mop': g.add(cyl(0.012, 0.012, 1.3, m.metal, 0, 0.1, 0, 8)); g.add(box(0.28, 0.03, 0.08, m.blue, 0, -0.55, 0)); g.add(box(0.26, 0.05, 0.07, m.cloth, 0, -0.59, 0)); rest = 0.62; break;
    case 'hook': g.add(cyl(0.018, 0.018, 0.1, m.brown, 0, 0, 0)); { const t = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.006, 6, 12, Math.PI * 1.3), m.metal); t.position.set(0.0, 0.1, 0); t.rotation.y = Math.PI / 2; g.add(t); } rest = 0.02; g.userData.lie = true; break;
    case 'crowbar': g.add(cyl(0.012, 0.012, 0.7, m.red, 0, 0.15, 0, 8)); g.add(box(0.02, 0.05, 0.012, m.metal, 0.012, 0.51, 0)); g.add(box(0.03, 0.015, 0.012, m.metal, 0.02, -0.2, 0)); rest = 0.012; g.userData.lie = true; break;
    default: g.add(box(0.12, 0.08, 0.1, m.metal)); rest = 0.04;
  }
  g.userData.rest = rest; return g;
}

// ---- grip frames per item in the hand bone's frame (metres). Hand bones (UAL rig): +Y runs wrist -> fingertips, the palm faces -X on the
// right hand and +X on the left, +Z points out along the thumb side. Values were set from rendered checks (models.html?set=held).
const GRIP = {
  default: { p: [0, 0.085, 0.02], r: [Math.PI / 2, 0, 0] },        // item up = thumb direction (a cup stands upright when the forearm is level)
  hang: { p: [0, 0.095, 0.0], r: [Math.PI, 0, Math.PI / 2] },        // handle across the fingers, the body hangs below the fist (toolbox, medkit, hose)
  rod: { p: [0, 0.085, 0.015], r: [0, 0, 0] },                       // tool shaft along the fingers' wrap axis
  flat: { p: [0.02, 0.07, 0.03], r: [0, 0, Math.PI / 2] },           // PADD / scanner face up in the palm
  gun: { p: [0, 0.07, 0.02], r: [-Math.PI / 2, 0, 0] },              // pistol grip in the fist, muzzle along the fingers' pointing line
};
// worn on the body (js/handhelds.js holster): pelvis frame (+x the character's left, +y up, +z forward), metres
const HOLSTER = { hip_r: { p: [-0.2, -0.06, 0.02], r: [0, 0, 0] }, hip_l: { p: [0.2, -0.06, 0.02], r: [0, 0, 0] }, back: { p: [0.05, 0.28, -0.2], r: [0, 0, 2.4] }, belt_back: { p: [0, -0.02, -0.17], r: [0, 0, Math.PI / 2] } };
export function holsterItem(H, id, slot = 'hip_r') {
  const bone = H?.bones?.pelvis; if (!bone) return null; H.worn = H.worn || {}; if (H.worn[slot]) { H.worn[slot].parent?.remove(H.worn[slot]); }
  const holder = new THREE.Group(); holder.name = 'worn:' + slot; bone.add(holder); bone.updateWorldMatrix(true, false); bone.matrixWorld.decompose(_v, _q, _s); holder.scale.set(1 / _s.x, 1 / _s.y, 1 / _s.z);
  const mesh = makeItemMesh(id), h = HOLSTER[slot] || HOLSTER.hip_r; mesh.position.set(...h.p); mesh.rotation.set(...h.r); if (mesh.userData.lie && slot.startsWith('hip')) mesh.rotation.x = Math.PI;   // muzzle / tip down
  holder.add(mesh); holder.userData = { id, slot }; H.worn[slot] = holder; return holder;
}
const GRIP_OF = { cup: 'default', glass: 'default', vial: 'default', toolbox: 'hang', medkit: 'hang', hose: 'hang', extinguisher: 'hang', tool: 'rod', zapper: 'rod', dumbbell: 'rod', padd: 'flat', scanner: 'flat', chip: 'flat', ration: 'flat',
  tricorder: 'flat', tricorder_med: 'flat', tricorder_sec: 'flat', badge: 'flat', phaser1: 'gun', phaser2: 'gun', rifle: 'gun', hypospray: 'rod', dermal: 'rod', scalpel: 'rod', wrench: 'rod', torch: 'rod', flashlight: 'rod', mop: 'rod', hook: 'rod', crowbar: 'rod' };
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

// parent an item (id or mesh) to a hand bone. Returns the holder. The holder cancels the bone's scale so offsets are in metres.
export function holdItem(H, item, hand = 'hand_r') {
  if (!H) return null; const id = typeof item === 'string' ? item : item?.userData?.item; const mesh = typeof item === 'string' ? makeItemMesh(item) : item; if (!mesh) return null;
  const two = ITEMS[id]?.two; H.held = H.held || {};
  if (two) { for (const h of ['hand_r', 'hand_l']) dropItem(H, h); const root = H.inner.parent || H.inner, holder = new THREE.Group(); holder.name = 'held2'; holder.add(mesh); root.add(holder); holder.userData = { id, two: true, mesh }; H.held.hand_r = H.held.hand_l = holder; tickHeld(H); return holder; }
  dropItem(H, hand); const bone = H.bones[hand] || H.inner.getObjectByName(hand); if (!bone) return null;
  const holder = new THREE.Group(); holder.name = 'held:' + hand; bone.add(holder); bone.updateWorldMatrix(true, false); bone.matrixWorld.decompose(_v, _q, _s);
  holder.scale.set(1 / _s.x, 1 / _s.y, 1 / _s.z);   // world-scale 1 under the scaled skeleton
  const gr = GRIP[GRIP_OF[id] || 'default'], mir = hand === 'hand_l' ? -1 : 1; mesh.position.set(gr.p[0] * mir, gr.p[1], gr.p[2]); mesh.rotation.set(gr.r[0], gr.r[1] * mir, gr.r[2] * mir);
  holder.add(mesh); holder.userData = { id, hand, mesh }; H.held[hand] = holder; return holder;
}
export function dropItem(H, hand = 'hand_r') {
  const h = H?.held?.[hand]; if (!h) return null; h.parent?.remove(h); const id = h.userData.id;
  if (h.userData.two) { H.held.hand_r = H.held.hand_l = null; } else H.held[hand] = null;
  h.traverse(o => { if (o.isMesh) o.geometry?.dispose?.(); }); return id;
}
export const heldIn = (H, hand = 'hand_r') => H?.held?.[hand]?.userData.id || null;
// two-handed items ride at the midpoint of both hands, level, facing the body's forward; call after H.update(dt)
export function tickHeld(H) {
  const h = H?.held?.hand_r; if (!h || !h.userData.two) return; const r = H.bones.hand_r, l = H.bones.hand_l, root = h.parent; if (!r || !l || !root) return;
  r.updateWorldMatrix(true, false); l.updateWorldMatrix(true, false); _v.setFromMatrixPosition(r.matrixWorld).add(_w.setFromMatrixPosition(l.matrixWorld)).multiplyScalar(0.5);
  root.updateWorldMatrix(true, false); root.worldToLocal(_v); root.getWorldScale(_s); const id = h.userData.id, lift = id === 'tray' ? 0.05 : id === 'linen' ? 0.02 : 0.06;
  h.position.set(_v.x, _v.y + lift / _s.y, _v.z + 0.06 / _s.z); h.scale.set(1 / _s.x, 1 / _s.y, 1 / _s.z); h.rotation.set(0, 0, 0);
}

// ---- carts. Local frame: +z is the front (direction of travel), the handle is at the back (-z). ud.handle = distance centre -> grip
export function makeCart(kind = 'cargo', loaded = false) {
  const m = mats(), C = CARTS[kind] || CARTS.cargo, g = new THREE.Group(), w = C.w, l = C.l, wheels = [], wr = kind === 'cargo' ? 0.075 : 0.055, HY = 1.16;   // handle bar at the height of the 'push' clip's hands
  g.name = 'cart:' + kind; const deckY = kind === 'cargo' ? 0.22 : 0.18;
  const wheel = (x, z) => { const p = new THREE.Group(); p.position.set(x, wr, z); const t = cyl(wr, wr, 0.045, m.rubber, 0, 0, 0, 14); t.rotation.z = Math.PI / 2; p.add(t); const hub = cyl(wr * 0.45, wr * 0.45, 0.05, m.metal, 0, 0, 0, 8); hub.rotation.z = Math.PI / 2; p.add(hub); const sp = box(0.05, wr * 1.6, 0.012, m.hazard); p.add(sp); g.add(p); wheels.push(p); g.add(box(0.02, deckY - wr, 0.03, m.dark, x, wr + (deckY - wr) / 2, z)); };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheel(sx * (w / 2 - 0.08), sz * (l / 2 - 0.12));
  if (kind === 'cargo') {
    g.add(box(w, 0.05, l, m.olive, 0, deckY + 0.025, 0)); g.add(box(w + 0.02, 0.02, 0.04, m.hazard, 0, deckY + 0.04, l / 2)); for (const sx of [-1, 1]) g.add(box(0.03, 0.06, l, m.dark, sx * w / 2, deckY + 0.05, 0));
    for (const sx of [-1, 1]) g.add(box(0.035, HY - deckY, 0.035, m.metal, sx * (w / 2 - 0.05), (HY + deckY) / 2, -l / 2 + 0.03)); g.add(box(w - 0.06, 0.04, 0.04, m.dark, 0, HY, -l / 2 + 0.03)); g.add(box(w - 0.1, 0.03, 0.03, m.metal, 0, deckY + 0.45, -l / 2 + 0.03));
  } else if (kind === 'med') {
    for (const y of [deckY, deckY + 0.42, 0.86]) g.add(box(w, 0.035, l, m.white, 0, y, 0)); for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.025, 0.86 - deckY, 0.025, m.metal, sx * (w / 2 - 0.02), (0.86 + deckY) / 2, sz * (l / 2 - 0.02)));
    g.add(box(w - 0.1, 0.12, 0.02, m.white, 0, 0.75, l / 2 - 0.01)); g.add(box(0.12, 0.02, 0.02, m.dark, 0, 0.76, l / 2 + 0.005)); g.add(box(0.1, 0.03, 0.003, m.red, 0.18, 0.79, l / 2)); g.add(box(0.03, 0.1, 0.003, m.red, 0.18, 0.79, l / 2));
    g.add(cyl(0.012, 0.012, 1.0, m.metal, w / 2 - 0.05, 0.86 + 0.5, l / 2 - 0.05, 8)); g.add(box(0.12, 0.16, 0.04, m.glass, w / 2 - 0.05, 1.7, l / 2 - 0.05));
    for (const sx of [-1, 1]) g.add(box(0.02, HY - 0.86, 0.02, m.metal, sx * (w / 2 - 0.03), (HY + 0.86) / 2, -l / 2 - 0.03)); g.add(box(w - 0.04, 0.03, 0.03, m.metal, 0, HY, -l / 2 - 0.03));
  } else {   // tool cart: a drawer chest on castors
    g.add(box(w, 0.62, l * 0.92, m.red, 0, deckY + 0.31, 0)); for (let i = 0; i < 4; i++) { g.add(box(w + 0.005, 0.012, l * 0.92 - 0.04, m.dark, 0, deckY + 0.12 + i * 0.14, 0)); g.add(box(0.008, 0.02, l * 0.4, m.metal, w / 2 + 0.006, deckY + 0.07 + i * 0.14, 0)); }
    g.add(box(w + 0.02, 0.03, l, m.dark, 0, deckY + 0.635, 0)); for (const sx of [-1, 1]) g.add(box(0.025, HY - deckY - 0.64, 0.025, m.metal, sx * (w / 2 - 0.04), (HY + deckY + 0.64) / 2, -l / 2 - 0.02)); g.add(box(w - 0.05, 0.03, 0.03, m.metal, 0, HY, -l / 2 - 0.02));
  }
  const topY = kind === 'cargo' ? deckY + 0.05 : kind === 'med' ? 0.875 : deckY + 0.65;
  g.userData = { kind, cart: true, wheels, wr, handle: l / 2 + 0.12, half: [w / 2, l / 2], topY, load: [], loadMeshes: [], name: C.name };
  if (loaded) for (const id of C.load) cartLoad(g, id);
  return g;
}
// stack an item on the cart's top; returns false when full
export function cartLoad(cart, id) {
  const u = cart.userData, n = u.load.length, cap = u.kind === 'cargo' ? 4 : 3; if (n >= cap) return false;
  const mesh = makeItemMesh(id), big = ITEMS[id]?.two, slots = u.kind === 'cargo' ? [[0, 0.3], [0, -0.25], [0, 0.03, 1], [0.0, -0.1, 1]] : [[-0.12, 0.1], [0.12, -0.12], [0, 0, 1]];
  const s = slots[n] || [0, 0, 1]; let y = u.topY + (mesh.userData.rest || 0); if (s[2]) { const below = u.loadMeshes[n - 2] || u.loadMeshes[0]; if (below) { const bb = new THREE.Box3().setFromObject(below); y = bb.max.y - cart.position.y + (mesh.userData.rest || 0) + 0.005; } }
  if (!big && GRIP_OF[id] === 'hang') y = u.topY + 0.235;   // hanging items rest on their base
  if (mesh.userData.lie) mesh.rotation.z = Math.PI / 2;
  mesh.position.set(s[0], y, s[1]); mesh.rotation.y = (n % 2) * 0.3 - 0.15; cart.add(mesh); u.load.push(id); u.loadMeshes.push(mesh); return true;
}
export function cartUnload(cart) { const u = cart.userData; if (!u.load.length) return null; const m = u.loadMeshes.pop(); cart.remove(m); return u.load.pop(); }
// spin the wheels for a distance rolled (metres, + forward)
export function rollCart(cart, dist) { const u = cart.userData; for (const w of u.wheels) w.rotation.x += dist / u.wr; }
// world point of the handle grip (where a pusher's hands go) for a cart at (x, z) heading `yaw`
export function cartHandle(cart) { const u = cart.userData, y = cart.rotation.y; return [cart.position.x - Math.sin(y) * u.handle, cart.position.z - Math.cos(y) * u.handle]; }
export { handsFor };
