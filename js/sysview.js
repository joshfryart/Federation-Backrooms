// In-world hardware for ship systems: wall-mounted maintenance junction panels with a readable label and a status lamp.
import * as THREE from 'three';
import { makeJunctionOpen, setJunctionOpen } from './propart-plant.js';

const STATUS = { nominal: new THREE.Color(0.25, 1.4, 0.55), degraded: new THREE.Color(1.6, 0.9, 0.15), offline: new THREE.Color(1.8, 0.18, 0.12) };
let shared = null;
function mats() {
  if (shared) return shared;
  shared = {
    box: new THREE.MeshStandardMaterial({ color: 0x2b3038, metalness: 0.8, roughness: 0.45 }),
    hazard: new THREE.MeshStandardMaterial({ color: 0xd8a818, roughness: 0.6, metalness: 0.2 }),
    grille: new THREE.MeshStandardMaterial({ color: 0x15181d, metalness: 0.6, roughness: 0.7 }),
  };
  return shared;
}
function labelTex(name, code, deptName, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160; const g = c.getContext('2d');
  g.fillStyle = '#0b0e14'; g.fillRect(0, 0, 256, 160);
  g.fillStyle = '#' + color.toString(16).padStart(6, '0'); g.fillRect(0, 0, 256, 16);
  g.fillStyle = '#e8b81c'; for (let x = -20; x < 256; x += 24) { g.beginPath(); g.moveTo(x, 160); g.lineTo(x + 12, 160); g.lineTo(x + 24, 146); g.lineTo(x + 12, 146); g.fill(); }
  g.fillStyle = '#c8d2e0'; g.font = 'bold 12px Arial'; g.fillText('MAINTENANCE JUNCTION', 12, 36);
  g.fillStyle = '#ffffff'; g.font = 'bold 21px Arial';
  const words = name.toUpperCase().split(' '); let line = '', y = 66;
  for (const w of words) { if (g.measureText(line + w).width > 230 && line) { g.fillText(line.trim(), 12, y); line = ''; y += 24; } line += w + ' '; } g.fillText(line.trim(), 12, y);
  g.fillStyle = '#8a96a8'; g.font = '12px monospace'; g.fillText(`${code} · ${deptName.toUpperCase()}`, 12, 132);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// returns { group, lamp, door } — group's +Z faces out of the wall. ENG-2 cabinet (js/propart-plant.js): a hinged door carrying the label over a dead-front,
// breakers and one insert module per system (power tap, fan cartridge, valve manifold, relay cards, field coil). Built closed; the status lamp rides on the
// door so it stays in view. setJunctionDoor(j, t) swings it (t 0 shut .. 1 open, the door then sticks 0.6 m out of the wall).
export function makeJunction(sys, code, deptName, color) {
  const j = makeJunctionOpen(sys, code, deptName, color, 0), door = j.door, lamp = j.lamp;
  lamp.removeFromParent(); lamp.position.set(0.53, 0.38, 0.0175); door.add(lamp);   // was at (0.22, 0.38, 0.1) inside the cabinet, behind the shut door
  j.group.userData.junction = { door, open: 0, want: 0 };
  return { group: j.group, lamp, door, insert: j.insert };
}
export function setJunctionDoor(j, t) { setJunctionOpen({ door: j.door || j.userData?.junction?.door }, t); }
// the old plain box (no door): kept for anything that wants the flat panel
export function makeJunctionPlain(sys, code, deptName, color) {
  const m = mats(), g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.86, 0.09), m.box); body.position.z = 0.045; g.add(body);
  const lt = labelTex(sys.name, code, deptName, color);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.31), new THREE.MeshStandardMaterial({ map: lt, emissive: 0xffffff, emissiveMap: lt, emissiveIntensity: 0.35, roughness: 0.4 })); label.position.set(0, 0.2, 0.092); g.add(label);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.02), m.grille); grille.position.set(0, -0.2, 0.09); g.add(grille);
  for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.012, 0.012), m.box); s.position.set(0, -0.3 + i * 0.05, 0.104); g.add(s); }
  for (const sy of [0.46, -0.46]) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.05, 0.11), m.hazard); h.position.set(0, sy, 0.05); g.add(h); }
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.03), new THREE.MeshBasicMaterial({ color: STATUS.nominal.clone() })); lamp.position.set(0.22, 0.38, 0.1); g.add(lamp);
  return { group: g, lamp };
}
export function setLamp(lamp, status, t) {
  lamp.material.color.copy(STATUS[status]); if (status === 'offline' && Math.sin(t * 9) < 0) lamp.material.color.multiplyScalar(0.15);
}
// a floating status beacon over main hardware (warp core, biobeds…) while it is faulted
export function makeBeacon() {
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), new THREE.MeshBasicMaterial({ color: STATUS.degraded.clone() })); return m;
}
