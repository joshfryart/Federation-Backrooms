import * as THREE from 'three';
import { textures } from './world.js';

const mk = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };

// ---------------- Gorn ----------------
export function makeGorn() {
  const T = textures();
  const skin = new THREE.MeshLambertMaterial({ color: 0x6f7f3a, map: T.scales });
  const belly = new THREE.MeshLambertMaterial({ color: 0x9a9a52, map: T.scales });
  const dark = new THREE.MeshLambertMaterial({ color: 0x3b4420 });
  const eye = new THREE.MeshBasicMaterial({ color: 0xffd23a });
  const tooth = new THREE.MeshLambertMaterial({ color: 0xe8e2c0 });
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const torso = mk(new THREE.BoxGeometry(1.0, 1.2, 0.8), skin, 0, 1.55, 0); torso.rotation.x = 0.25; body.add(torso);
  body.add(mk(new THREE.BoxGeometry(0.7, 0.9, 0.1), belly, 0, 1.5, 0.43));
  body.add(mk(new THREE.BoxGeometry(0.9, 0.7, 0.7), dark, 0, 0.95, 0));  // hips
  // head
  const head = new THREE.Group(); head.position.set(0, 2.25, 0.35); body.add(head);
  head.add(mk(new THREE.BoxGeometry(0.75, 0.6, 0.75), skin, 0, 0, 0.1));
  head.add(mk(new THREE.BoxGeometry(0.6, 0.2, 0.55), skin, 0, -0.28, 0.35)); // snout lower
  const jaw = mk(new THREE.BoxGeometry(0.55, 0.12, 0.5), dark, 0, -0.38, 0.35); jaw.name = 'jaw'; head.add(jaw);
  for (const sx of [-1, 1]) {
    const e = mk(new THREE.SphereGeometry(0.17, 10, 8), eye, sx * 0.34, 0.2, 0.28); head.add(e);
    head.add(mk(new THREE.SphereGeometry(0.07, 6, 6), dark, sx * 0.34, 0.2, 0.42));
    for (let i = 0; i < 4; i++) head.add(mk(new THREE.ConeGeometry(0.035, 0.12, 4), tooth, sx * (0.08 + i * 0.09) * 1.0 - 0, -0.33, 0.6));
  }
  for (let i = 0; i < 5; i++) { const c = mk(new THREE.ConeGeometry(0.06, 0.25, 5), dark, 0, 0.3, -0.1 - i * 0.1); head.add(c); c.rotation.x = -0.3; }
  // arms
  const arms = [];
  for (const sx of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(sx * 0.65, 2.0, 0.15); body.add(a);
    a.add(mk(new THREE.BoxGeometry(0.25, 0.9, 0.25), skin, 0, -0.4, 0.15));
    const claw = mk(new THREE.BoxGeometry(0.3, 0.25, 0.3), dark, 0, -0.9, 0.25); a.add(claw);
    for (let i = -1; i <= 1; i++) { const c = mk(new THREE.ConeGeometry(0.04, 0.2, 4), tooth, i * 0.09, -1.1, 0.3); c.rotation.x = Math.PI; a.add(c); }
    a.rotation.x = -0.5; arms.push(a);
  }
  // legs
  const legs = [];
  for (const sx of [-1, 1]) {
    const l = new THREE.Group(); l.position.set(sx * 0.35, 0.8, 0); g.add(l);
    l.add(mk(new THREE.BoxGeometry(0.34, 0.85, 0.38), skin, 0, -0.4, 0));
    l.add(mk(new THREE.BoxGeometry(0.4, 0.14, 0.6), dark, 0, -0.8, 0.12));
    legs.push(l);
  }
  // tail
  const tail = mk(new THREE.ConeGeometry(0.32, 1.7, 6), skin, 0, 0.9, -1.05); tail.rotation.x = -Math.PI / 2 - 0.2; body.add(tail);
  g.userData = { arms, legs, head, body, tail, jaw };
  g.scale.setScalar(1.1);
  return g;
}

export function animateGorn(g, speed, t, roaring) {
  const u = g.userData;
  const f = Math.min(1, speed / 3);
  const ph = t * (3 + speed * 1.4);
  u.legs[0].rotation.x = Math.sin(ph) * 0.7 * f;
  u.legs[1].rotation.x = -Math.sin(ph) * 0.7 * f;
  u.arms[0].rotation.x = -0.5 - Math.sin(ph) * 0.5 * f;
  u.arms[1].rotation.x = -0.5 + Math.sin(ph) * 0.5 * f;
  u.body.position.y = Math.abs(Math.sin(ph)) * 0.08 * f;
  u.body.rotation.z = Math.sin(ph) * 0.05 * f;
  u.tail.rotation.z = Math.sin(ph * 0.5) * 0.35;
  u.head.rotation.y = Math.sin(t * 0.9) * 0.25 * (1 - f * 0.6);
  u.jaw.position.y = -0.38 - (roaring ? 0.18 + Math.sin(t * 30) * 0.03 : Math.max(0, Math.sin(t * 2)) * 0.03);
}

// ---------------- Redshirt ----------------
export function makeCrew(color = 0xb02a20, dead = false, skinTone = 0xe0b090) {
  const g = new THREE.Group();
  const tunic = new THREE.MeshLambertMaterial({ color });
  const black = new THREE.MeshLambertMaterial({ color: 0x18181c });
  const skin = new THREE.MeshLambertMaterial({ color: skinTone });
  const hair = new THREE.MeshLambertMaterial({ color: [0x2a1a10, 0xb08a3a, 0x111111, 0x7a3a20][Math.floor(Math.random() * 4)] });
  const body = new THREE.Group(); g.add(body);
  body.add(mk(new THREE.BoxGeometry(0.5, 0.65, 0.3), tunic, 0, 1.2, 0));
  body.add(mk(new THREE.BoxGeometry(0.5, 0.1, 0.3), black, 0, 0.9, 0));
  const head = mk(new THREE.SphereGeometry(0.17, 10, 8), skin, 0, 1.7, 0); body.add(head);
  body.add(mk(new THREE.SphereGeometry(0.18, 10, 8, 0, Math.PI * 2, 0, 1.2), hair, 0, 1.72, -0.01));
  for (const sx of [-1, 1]) {
    body.add(mk(new THREE.BoxGeometry(0.14, 0.6, 0.14), tunic, sx * 0.34, 1.15, 0));
    body.add(mk(new THREE.BoxGeometry(0.2, 0.8, 0.2), black, sx * 0.13, 0.45, 0));
  }
  if (dead) { body.rotation.x = -Math.PI / 2; body.position.set(0, 0.2, 0.9); body.rotation.z = Math.random() - 0.5; }
  g.userData.head = head;
  return g;
}

// ---------------- Tribble ----------------
export function makeTribble() {
  const T = textures();
  const col = [0x8a6a4a, 0xb09070, 0x555048, 0xc8b8a0][Math.floor(Math.random() * 4)];
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshLambertMaterial({ color: col, map: T.fur }));
  m.scale.set(1, 0.85, 1.15); m.position.y = 0.2;
  const g = new THREE.Group(); g.add(m); g.userData.body = m;
  return g;
}

// ---------------- Items ----------------
export function makeItem(kind) {
  const g = new THREE.Group();
  if (kind === 'chip') {
    const b = mk(new THREE.BoxGeometry(0.34, 0.06, 0.34), new THREE.MeshBasicMaterial({ color: 0x40ffa0 }), 0, 0, 0);
    const c = mk(new THREE.BoxGeometry(0.2, 0.08, 0.2), new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, 0, 0);
    g.add(b, c);
    const halo = mk(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshBasicMaterial({ color: 0x40ffa0, transparent: true, opacity: 0.18 }), 0, 0, 0); g.add(halo);
  } else if (kind === 'battery') {
    g.add(mk(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 10), new THREE.MeshBasicMaterial({ color: 0x40c8ff })));
    g.add(mk(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, 0.2, 0));
  } else if (kind === 'medkit') {
    g.add(mk(new THREE.BoxGeometry(0.4, 0.28, 0.25), new THREE.MeshLambertMaterial({ color: 0xeeeeee })));
    g.add(mk(new THREE.BoxGeometry(0.22, 0.06, 0.26), new THREE.MeshBasicMaterial({ color: 0xff3030 }), 0, 0.14, 0));
    g.add(mk(new THREE.BoxGeometry(0.06, 0.22, 0.26), new THREE.MeshBasicMaterial({ color: 0xff3030 }), 0, 0.14, 0));
  }
  g.position.y = 0.9;
  return g;
}
