import * as THREE from 'three';
import { textures } from './world.js';

const mk = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
const cap = (r, len, seg = 10) => new THREE.CapsuleGeometry(r, len, 4, seg);
const grp = (x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); return g; };
const R = (a, b) => a + Math.random() * (b - a);
const pickOf = (a) => a[Math.floor(Math.random() * a.length)];

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// =====================================================================
//  GORN
// =====================================================================
let gornMats = null;
function gMats() {
  if (gornMats) return gornMats;
  const scales = canvasTex(256, 256, (g, s) => {
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 14) for (let x = (y / 14 % 2) * 7; x < s; x += 14) {
      const v = 120 + Math.random() * 80 | 0; g.fillStyle = `rgb(${v},${v},${v})`;
      g.beginPath(); g.ellipse(x + 7, y + 7, 7.5, 7.5, 0, 0, 7); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 1.6; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.ellipse(x + 5, y + 5, 2.5, 2, 0, 0, 7); g.fill();
    }
  });
  scales.wrapS = scales.wrapT = THREE.RepeatWrapping;
  const rep = (t, x, y) => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(x, y); c.wrapS = c.wrapT = THREE.RepeatWrapping; return c; };
  gornMats = {
    skin: new THREE.MeshStandardMaterial({ color: 0x6f8040, map: scales, bumpMap: scales, bumpScale: 2.2, roughness: 0.52, metalness: 0.05 }),
    belly: new THREE.MeshStandardMaterial({ color: 0xb2a965, map: scales, bumpMap: scales, bumpScale: 1.5, roughness: 0.6 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x3a4520, map: scales, bumpMap: scales, bumpScale: 2, roughness: 0.6 }),
    eye: new THREE.MeshStandardMaterial({ color: 0xd88a10, emissive: 0xff7a08, emissiveIntensity: 0.55, roughness: 0.08, metalness: 0.0 }),
    pupil: new THREE.MeshBasicMaterial({ color: 0x120a00 }),
    tooth: new THREE.MeshStandardMaterial({ color: 0xe9e1c0, roughness: 0.3 }),
    claw: new THREE.MeshStandardMaterial({ color: 0x25251f, roughness: 0.3, metalness: 0.2 }),
    mouth: new THREE.MeshStandardMaterial({ color: 0x5a1010, roughness: 0.3 }),
    gore: new THREE.MeshStandardMaterial({ color: 0x5a0707, roughness: 0.12, metalness: 0.1 }),
    rep,
  };
  return gornMats;
}

export function makeGorn() {
  const M = gMats();
  const g = new THREE.Group();
  const body = grp(); g.add(body);
  // pelvis & torso
  const pelvis = mk(cap(0.34, 0.25), M.dark, 0, 1.12, 0); pelvis.scale.set(1.2, 1, 0.95); body.add(pelvis);
  const torso = grp(0, 1.25, 0.02); torso.rotation.x = 0.5; body.add(torso);
  const chest = mk(cap(0.38, 0.55), M.skin, 0, 0.45, 0); chest.scale.set(1.18, 1, 0.9); torso.add(chest);
  for (let i = 0; i < 6; i++) { const p = mk(new THREE.SphereGeometry(0.28, 10, 6), M.belly, 0, 0.12 + i * 0.12, 0.3); p.scale.set(1.15, 0.28, 0.5); torso.add(p); }
  // back plates / spines
  for (let i = 0; i < 9; i++) { const sp = mk(new THREE.ConeGeometry(0.06 - i * 0.003, 0.2 + (i % 2) * 0.06, 5), M.dark, 0, 0.08 + i * 0.11, -0.3); sp.rotation.x = -0.9; torso.add(sp); }
  // gore on chest
  const bl = mk(new THREE.SphereGeometry(0.2, 8, 6), M.gore, 0.1, 0.5, 0.33); bl.scale.set(1, 1.2, 0.3); torso.add(bl);
  // neck + head
  const neck = grp(0, 0.95, 0.12); torso.add(neck); neck.rotation.x = -0.6;
  neck.add(mk(cap(0.17, 0.2), M.skin, 0, 0.12, 0.02));
  const head = grp(0, 0.34, 0.06); neck.add(head);
  const skull = mk(new THREE.SphereGeometry(0.34, 16, 12), M.skin, 0, 0.04, 0.05); skull.scale.set(0.95, 0.78, 1.15); head.add(skull);
  const snout = mk(new THREE.SphereGeometry(0.25, 14, 10), M.skin, 0, -0.07, 0.36); snout.scale.set(0.85, 0.55, 1.25); head.add(snout);
  const nose = mk(new THREE.SphereGeometry(0.12, 8, 6), M.dark, 0, -0.04, 0.68); nose.scale.set(1.1, 0.6, 0.7); head.add(nose);
  for (const sx of [-1, 1]) {
    head.add(mk(new THREE.SphereGeometry(0.025, 6, 4), M.pupil, sx * 0.05, -0.02, 0.77));
    // compound eyes on the sides
    const eye = mk(new THREE.SphereGeometry(0.075, 16, 12), M.eye, sx * 0.29, 0.1, 0.22); eye.scale.set(0.8, 1, 1.1); head.add(eye);
    const slit = mk(new THREE.SphereGeometry(0.04, 10, 8), M.pupil, sx * 0.338, 0.1, 0.245); slit.scale.set(0.35, 1.5, 0.5); head.add(slit);
    const lid = mk(new THREE.SphereGeometry(0.085, 12, 8, 0, Math.PI * 2, 0, 1.2), M.dark, sx * 0.285, 0.115, 0.22); lid.scale.set(0.85, 1, 1.15); lid.rotation.z = -sx * 0.5; head.add(lid);
    const brow = mk(cap(0.06, 0.3, 6), M.dark, sx * 0.27, 0.23, 0.2); brow.rotation.set(0, 0, Math.PI / 2 + sx * 0.4); brow.rotation.order = 'XYZ'; head.add(brow);
    for (let i = 0; i < 3; i++) { const cs = mk(new THREE.ConeGeometry(0.035, 0.16, 5), M.dark, sx * (0.28 - i * 0.02), -0.12 - i * 0.05, 0.02 - i * 0.07); cs.rotation.z = -sx * 1.2; head.add(cs); }
  }
  // crest
  for (let i = 0; i < 6; i++) { const c = mk(new THREE.ConeGeometry(0.045, 0.2 - i * 0.015, 5), M.dark, 0, 0.3 - i * 0.03, 0.2 - i * 0.12); c.rotation.x = -0.5 - i * 0.12; head.add(c); }
  // jaw
  const jaw = grp(0, -0.14, 0.15); head.add(jaw);
  const lower = mk(new THREE.SphereGeometry(0.2, 12, 8), M.skin, 0, -0.04, 0.22); lower.scale.set(0.95, 0.38, 1.4); jaw.add(lower);
  jaw.add(mk(new THREE.SphereGeometry(0.17, 10, 6), M.mouth, 0, 0.015, 0.2)).scale.set(0.9, 0.18, 1.2);
  for (let i = 0; i < 7; i++) for (const sx of [-1, 1]) {
    const z = 0.02 + i * 0.075, x = sx * (0.14 - i * 0.008);
    const tl = mk(new THREE.ConeGeometry(0.018, 0.06 + (i % 2) * 0.03, 4), M.tooth, x, 0.04, z); jaw.add(tl);
    const tu = mk(new THREE.ConeGeometry(0.018, 0.07 + (i % 2) * 0.02, 4), M.tooth, x * 1.05, -0.02 + 0.0, z + 0.12 + 0.0); tu.rotation.x = Math.PI; tu.position.y = 0.0; head.add(tu); tu.position.set(x * 1.05, -0.18, z + 0.28 - 0.1);
  }
  const jawBlood = mk(new THREE.SphereGeometry(0.1, 8, 6), M.gore, 0, -0.03, 0.5); jawBlood.scale.set(1.2, 0.3, 0.8); jaw.add(jawBlood);
  // arms
  const arms = [];
  for (const sx of [-1, 1]) {
    const sh = grp(sx * 0.58, 0.78, 0.0); torso.add(sh);
    sh.add(mk(new THREE.SphereGeometry(0.17, 10, 8), M.skin));
    const up = mk(cap(0.105, 0.38), M.skin, 0, -0.28, 0); sh.add(up);
    const el = grp(0, -0.52, 0); sh.add(el);
    const fo = mk(cap(0.09, 0.36), M.skin, 0, -0.26, 0); el.add(fo);
    const hand = grp(0, -0.52, 0.02); el.add(hand);
    const palm = mk(new THREE.BoxGeometry(0.17, 0.12, 0.1), M.dark); hand.add(palm);
    for (let i = -1; i <= 1; i++) {
      const f = mk(cap(0.022, 0.12, 5), M.dark, i * 0.055, -0.14, 0.02); hand.add(f);
      const cl = mk(new THREE.ConeGeometry(0.025, 0.14, 5), M.claw, i * 0.055, -0.28, 0.04); cl.rotation.x = Math.PI + 0.35; hand.add(cl);
    }
    const th = mk(new THREE.ConeGeometry(0.025, 0.12, 5), M.claw, sx * -0.1, -0.06, 0.06); th.rotation.z = sx * 1.0; hand.add(th);
    if (sx > 0) { const gr = mk(new THREE.SphereGeometry(0.08, 8, 6), M.gore, 0, -0.18, 0.05); gr.scale.set(1.4, 1, 0.8); hand.add(gr); }
    sh.rotation.x = -0.25; arms.push({ sh, el });
  }
  // digitigrade legs
  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = grp(sx * 0.34, 1.08, 0); body.add(hip);
    hip.add(mk(new THREE.SphereGeometry(0.2, 10, 8), M.skin));
    const thigh = mk(cap(0.17, 0.32), M.skin, 0, -0.28, 0.03); hip.add(thigh);
    const knee = grp(0, -0.54, 0.06); hip.add(knee);
    knee.add(mk(new THREE.SphereGeometry(0.12, 8, 6), M.dark));
    const shin = mk(cap(0.12, 0.38), M.skin, 0, -0.27, 0); knee.add(shin);
    const ankle = grp(0, -0.55, 0); knee.add(ankle);
    const foot = mk(cap(0.09, 0.26), M.dark, 0, -0.02, 0.17); foot.rotation.x = Math.PI / 2; ankle.add(foot);
    for (let i = -1; i <= 1; i++) { const toe = mk(cap(0.04, 0.16, 5), M.dark, i * 0.09, -0.03, 0.4); toe.rotation.x = Math.PI / 2; ankle.add(toe); const c = mk(new THREE.ConeGeometry(0.035, 0.12, 5), M.claw, i * 0.09, -0.03, 0.55); c.rotation.x = Math.PI / 2; ankle.add(c); }
    legs.push({ hip, knee, ankle, sx });
  }
  // tail
  const tailRoot = grp(0, 1.05, -0.25); body.add(tailRoot); tailRoot.rotation.x = 0.0;
  const tail = []; let prev = tailRoot;
  for (let i = 0; i < 7; i++) {
    const r = 0.25 - i * 0.032, len = 0.32;
    const geo = new THREE.CylinderGeometry(r * 0.85, r, len, 8); geo.rotateX(Math.PI / 2);
    const seg = grp(0, 0, i ? -len : 0); const m = mk(geo, i % 2 ? M.skin : M.dark, 0, 0, -len / 2); seg.add(m);
    if (i < 6) { const sp = mk(new THREE.ConeGeometry(0.04, 0.15, 4), M.dark, 0, r, -len / 2); seg.add(sp); }
    seg.rotation.x = i === 0 ? 0.35 : -0.05; prev.add(seg); prev = seg; tail.push(seg);
  }
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.9, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; blob.scale.set(1, 1.3, 1); g.add(blob);
  g.userData = { body, torso, head, jaw, arms, legs, tail, neck };
  g.scale.setScalar(1.22);
  return g;
}

export function animateGorn(g, speed, t, roaring) {
  const u = g.userData; const f = Math.min(1, speed / 3);
  const ph = t * (2.3 + speed * 1.15);
  for (const L of u.legs) {
    const s = Math.sin(ph + (L.sx > 0 ? 0 : Math.PI)), c = Math.cos(ph + (L.sx > 0 ? 0 : Math.PI));
    L.hip.rotation.x = 0.45 + s * 0.6 * f;
    L.knee.rotation.x = -0.95 + Math.max(0, -c) * 0.7 * f;
    L.ankle.rotation.x = 0.55 - s * 0.35 * f;
  }
  u.arms.forEach((a, i) => {
    const s = Math.sin(ph + (i ? Math.PI : 0));
    a.sh.rotation.x = -0.25 - s * 0.45 * f; a.sh.rotation.z = (i ? -1 : 1) * (0.12 + (roaring ? 0.7 : 0));
    a.el.rotation.x = -0.6 - (roaring ? 0.5 : 0) - Math.max(0, s) * 0.4 * f;
  });
  u.body.position.y = Math.abs(Math.sin(ph)) * 0.07 * f;
  u.body.rotation.z = Math.sin(ph) * 0.04 * f;
  u.torso.rotation.x = 0.5 + Math.sin(t * 1.6) * 0.02 + (roaring ? -0.3 : 0) + f * 0.1;
  u.torso.rotation.y = Math.sin(ph) * 0.1 * f;
  u.tail.forEach((s, i) => { s.rotation.y = Math.sin(t * 2.2 * (0.6 + f) - i * 0.7) * (0.12 + i * 0.02) * (0.5 + f); });
  u.head.rotation.y = Math.sin(t * 0.9) * 0.3 * (1 - f * 0.7);
  u.head.rotation.x = roaring ? -0.35 : Math.sin(t * 1.3) * 0.04;
  u.jaw.rotation.x = roaring ? 0.65 + Math.sin(t * 28) * 0.05 : 0.04 + Math.max(0, Math.sin(t * 1.5)) * 0.06;
}

// =====================================================================
//  CREW
// =====================================================================
const SKINS = [0xf0c8a0, 0xd9a77a, 0xb27e57, 0x8a5a3a, 0x5b3a26, 0xf2d3b8];
const HAIRS = [0x15100c, 0x3a2414, 0x7a4a22, 0xb08a3a, 0xc8c0b0, 0x6a2a1a];
function hex(c) { return '#' + new THREE.Color(c).getHexString(); }

function headTex(o) {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = hex(o.skin); g.fillRect(0, 0, w, h);
    // skin variation
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '255,200,170' : '90,50,30'},0.04)`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    // face centred at u=0.25 (front of a three.js sphere)
    const fx = 128, fy = 132;
    // cheek blush / shadow
    const sh = g.createRadialGradient(fx, fy + 20, 5, fx, fy + 20, 70); sh.addColorStop(0, 'rgba(200,100,90,0.12)'); sh.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sh; g.fillRect(fx - 80, fy - 50, 160, 160);
    // nose
    const ns = g.createLinearGradient(fx - 8, 0, fx + 8, 0); ns.addColorStop(0, 'rgba(60,30,20,0.0)'); ns.addColorStop(0.5, 'rgba(255,230,210,0.12)'); ns.addColorStop(1, 'rgba(60,30,20,0.22)'); g.fillStyle = ns; g.fillRect(fx - 9, fy - 8, 18, 38);
    g.fillStyle = 'rgba(40,15,10,0.55)'; g.beginPath(); g.ellipse(fx - 5, fy + 31, 2.6, 1.8, 0, 0, 7); g.ellipse(fx + 5, fy + 31, 2.6, 1.8, 0, 0, 7); g.fill();
    // eyes
    for (const sx of [-1, 1]) {
      const ex = fx + sx * 27, ey = fy;
      g.fillStyle = 'rgba(70,30,20,0.18)'; g.beginPath(); g.ellipse(ex, ey - 2, 17, 10, 0, 0, 7); g.fill();
      g.fillStyle = '#f3efe8'; g.beginPath(); g.ellipse(ex, ey, 12, 6.4, 0, 0, 7); g.fill();
      g.fillStyle = hex(o.eye); g.beginPath(); g.arc(ex + sx * -1, ey, 5.2, 0, 7); g.fill();
      g.fillStyle = '#0a0806'; g.beginPath(); g.arc(ex + sx * -1, ey, 2.6, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(ex - 2, ey - 2, 1.4, 0, 7); g.fill();
      g.strokeStyle = 'rgba(20,10,8,0.85)'; g.lineWidth = 1.6; g.beginPath(); g.ellipse(ex, ey, 12, 6.4, 0, Math.PI, 0); g.stroke();
      // brow
      g.strokeStyle = hex(o.brow); g.lineWidth = o.vulcan ? 4 : 4.5; g.lineCap = 'round'; g.beginPath();
      if (o.vulcan) { g.moveTo(ex - sx * 13, ey - 11); g.quadraticCurveTo(ex, ey - 19, ex + sx * 15, ey - 22); } else { g.moveTo(ex - sx * 12, ey - 13); g.quadraticCurveTo(ex, ey - 18, ex + sx * 13, ey - 14); }
      g.stroke();
    }
    // mouth
    const my = fy + 52; g.fillStyle = 'rgba(140,60,55,0.9)'; g.beginPath(); g.ellipse(fx, my + 1, 15, 3.6, 0, 0, Math.PI); g.fill();
    g.strokeStyle = 'rgba(60,20,18,0.9)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(fx - 15, my); g.quadraticCurveTo(fx, my + (o.scared ? -4 : 2), fx + 15, my); g.stroke();
    if (o.scared) { g.fillStyle = '#2a0d0b'; g.beginPath(); g.ellipse(fx, my + 6, 8, 6, 0, 0, 7); g.fill(); }
    if (o.blood) { g.fillStyle = 'rgba(100,5,5,0.8)'; g.beginPath(); g.ellipse(fx + 20, fy + 40, 16, 22, 0.4, 0, 7); g.fill(); g.fillRect(fx + 10, fy + 55, 5, 40); }
    // hair on top + back of head
    if (o.hair !== 'bald') {
      g.fillStyle = hex(o.hairCol);
      g.fillRect(0, 0, w, o.hair === 'long' ? 62 : 52);
      // forehead hairline curve at front
      g.beginPath(); g.ellipse(fx, 56, 70, 24, 0, 0, Math.PI); g.fill();
      g.fillRect(w * 0.5, 0, w * 0.5, o.hair === 'long' ? 236 : 150);   // back half
      g.fillRect(0, 0, 50, o.hair === 'long' ? 200 : 100); g.fillRect(w - 50, 0, 50, o.hair === 'long' ? 200 : 100);
      for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`; g.fillRect(Math.random() * w, Math.random() * 200, 1, 8); }
    }
  });
}

const fabricTex = () => canvasTex(128, 128, (g, s) => {
  g.fillStyle = '#d6d6d6'; g.fillRect(0, 0, s, s);
  g.fillStyle = 'rgba(0,0,0,0.07)'; for (let i = 0; i < s; i += 3) { g.fillRect(i, 0, 1, s); g.fillRect(0, i, s, 1); }
});
let fab = null;

export function makeCrew(color = 0xb02a20, dead = false, tone = null, opts = {}) {
  fab = fab || fabricTex();
  const species = opts.species || (dead ? 'human' : (Math.random() < 0.12 ? 'vulcan' : Math.random() < 0.12 ? 'andorian' : 'human'));
  const skin = species === 'andorian' ? 0x7f9ed6 : species === 'vulcan' ? 0xd8c090 : pickOf(SKINS);
  const hairCol = pickOf(HAIRS);
  const hair = species === 'vulcan' ? 'bowl' : pickOf(['short', 'short', 'long', 'bald', 'short']);
  const brow = species === 'andorian' ? 0xc8c8d8 : 0x2a1a10;
  const o = { skin, hair, hairCol: species === 'andorian' ? 0xe0e0ee : (species === 'vulcan' ? 0x15100c : hairCol), brow, eye: pickOf([0x3a2a1a, 0x2a4a7a, 0x3a6a3a, 0x5a4a2a]), vulcan: species === 'vulcan', scared: dead, blood: dead };
  const cloth = new THREE.MeshStandardMaterial({ color, map: fab, roughness: 0.85 });
  const black = new THREE.MeshStandardMaterial({ color: 0x15151a, map: fab, roughness: 0.8 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8b24a, metalness: 0.8, roughness: 0.25 });
  const skinM = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.65 });
  const headM = new THREE.MeshStandardMaterial({ map: headTex(o), roughness: 0.6 });
  const hairM = new THREE.MeshStandardMaterial({ color: o.hairCol, roughness: 0.9 });
  const bloodM = new THREE.MeshStandardMaterial({ color: 0x5a0707, roughness: 0.12 });
  const g = new THREE.Group(); const body = grp(); g.add(body);
  const torso = grp(0, 1.02, 0); body.add(torso);
  const chest = mk(cap(0.15, 0.28), cloth, 0, 0.26, 0); chest.scale.set(1.25, 1, 0.78); torso.add(chest);
  const waist = mk(cap(0.13, 0.12), black, 0, -0.02, 0); waist.scale.set(1.2, 1, 0.8); torso.add(waist);
  const belt = mk(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 14), black, 0, 0.0, 0); belt.scale.set(1.2, 1, 0.8); torso.add(belt);
  torso.add(mk(new THREE.BoxGeometry(0.34, 0.04, 0.2), black, 0, 0.5, 0)).scale.set(1, 1, 1);
  const badge = mk(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 8), gold, 0.1, 0.38, 0.115); badge.rotation.x = Math.PI / 2; torso.add(badge);
  const neck = mk(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 10), skinM, 0, 0.58, 0); torso.add(neck);
  const collar = mk(new THREE.CylinderGeometry(0.075, 0.09, 0.05, 12), black, 0, 0.53, 0); torso.add(collar);
  // head
  const head = grp(0, 0.74, 0); torso.add(head);
  const skull = mk(new THREE.SphereGeometry(0.115, 24, 18), headM, 0, 0, 0); skull.scale.set(0.9, 1.12, 1.0); head.add(skull);
  const jawm = mk(new THREE.SphereGeometry(0.09, 12, 8), skinM, 0, -0.07, 0.03); jawm.scale.set(0.95, 0.8, 0.9); head.add(jawm);
  const noseM = mk(new THREE.ConeGeometry(0.018, 0.045, 6), skinM, 0, -0.01, 0.12); noseM.rotation.x = Math.PI / 2 * 0.85; head.add(noseM);
  for (const sx of [-1, 1]) {
    const ear = species === 'vulcan' ? mk(new THREE.ConeGeometry(0.025, 0.1, 6), skinM, sx * 0.105, 0.03, 0) : mk(new THREE.SphereGeometry(0.025, 8, 6), skinM, sx * 0.105, 0, 0);
    if (species === 'vulcan') ear.rotation.z = -sx * 0.5 + (sx > 0 ? -1 : 1) * 0.0;
    head.add(ear);
    if (species === 'andorian') { const ant = mk(cap(0.008, 0.16, 4), new THREE.MeshStandardMaterial({ color: 0xdfe6f5, roughness: 0.4 }), sx * 0.05, 0.19, 0.0); ant.rotation.z = -sx * 0.35; ant.rotation.x = -0.25; head.add(ant); }
  }
  if (o.hair === 'long' || o.hair === 'short' || o.hair === 'bowl') {
    const cp = mk(new THREE.SphereGeometry(0.122, 20, 12, 0, Math.PI * 2, 0, o.hair === 'bowl' ? 1.45 : 1.18), hairM, 0, 0.01, -0.005); cp.scale.set(0.93, 1.12, 1.03); cp.rotation.x = -0.18; cp.castShadow = false; head.add(cp);
    if (o.hair === 'long') { const bk = mk(cap(0.07, 0.14, 8), hairM, 0, -0.1, -0.075); bk.scale.set(1.5, 1, 0.7); head.add(bk); }
  }
  // arms
  const arms = [];
  for (const sx of [-1, 1]) {
    const sh = grp(sx * 0.215, 0.46, 0); torso.add(sh);
    sh.add(mk(new THREE.SphereGeometry(0.06, 10, 8), cloth));
    sh.add(mk(cap(0.05, 0.2), cloth, 0, -0.16, 0));
    const el = grp(0, -0.3, 0); sh.add(el);
    el.add(mk(cap(0.043, 0.18), cloth, 0, -0.12, 0));
    el.add(mk(new THREE.CylinderGeometry(0.047, 0.047, 0.03, 10), gold, 0, -0.22, 0));
    el.add(mk(new THREE.SphereGeometry(0.04, 8, 6), skinM, 0, -0.27, 0.0));
    sh.rotation.z = sx * 0.08; el.rotation.x = -0.15; arms.push({ sh, el });
  }
  // legs
  const legs = [];
  for (const sx of [-1, 1]) {
    const hip = grp(sx * 0.085, 0.95, 0); body.add(hip);
    hip.add(mk(cap(0.08, 0.3), black, 0, -0.24, 0));
    const knee = grp(0, -0.45, 0); hip.add(knee);
    knee.add(mk(cap(0.065, 0.32), black, 0, -0.2, 0));
    const boot = mk(new THREE.BoxGeometry(0.1, 0.09, 0.24), new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.35 }), 0, -0.42, 0.04); knee.add(boot);
    legs.push({ hip, knee });
  }
  if (!dead) { const bs = new THREE.Mesh(new THREE.CircleGeometry(0.4, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })); bs.rotation.x = -Math.PI / 2; bs.position.y = 0.02; g.add(bs); }
  g.userData = { head, torso, arms, legs, body, dead, holo: false };
  if (dead) {
    // lying on back, limbs splayed, wounds
    body.rotation.x = -Math.PI / 2; body.position.set(0, 0.16, 0.85); body.rotation.z = R(-0.5, 0.5);
    head.rotation.set(0.1, R(-0.6, 0.6), R(-0.3, 0.3));
    arms[0].sh.rotation.z = -1.1; arms[0].sh.rotation.x = R(-0.3, 0.3); arms[1].sh.rotation.z = 0.6; arms[1].el.rotation.x = -1.4;
    legs[0].hip.rotation.z = -0.2; legs[1].hip.rotation.z = 0.3; legs[1].knee.rotation.x = 0.5;
    for (const [x, y, z, sx, sy] of [[0.04, 0.3, 0.115, 1.4, 1.8], [-0.07, 0.15, 0.1, 1.0, 1.0], [0.12, 0.45, 0.1, 0.8, 0.8]]) { const w = mk(new THREE.SphereGeometry(0.06, 10, 8), bloodM, x, y, z); w.scale.set(sx, sy, 0.35); torso.add(w); }
    const gash = mk(new THREE.BoxGeometry(0.2, 0.012, 0.01), black, 0.0, 0.3, 0.125); gash.rotation.z = 0.5; torso.add(gash);
    if (Math.random() < 0.7) { // missing leg, torn off and lying nearby
      const L = legs[1]; body.remove(L.hip);
      const stump = mk(new THREE.SphereGeometry(0.075, 10, 8), bloodM, 0.085, 0.95, 0); stump.scale.set(1, 0.5, 1); body.add(stump);
      L.hip.position.set(0.9, 0.09, 0.4); L.hip.rotation.set(0, 0.6, Math.PI / 2); L.hip.rotation.z = Math.PI / 2; L.knee.rotation.x = 0.3; g.add(L.hip);
      const end = mk(new THREE.SphereGeometry(0.07, 8, 6), bloodM, 0, 0.02, 0); end.scale.set(1, 0.5, 1); L.hip.add(end);
    }
  }
  return g;
}

export function animateCrew(g, t) {
  const u = g.userData; if (u.dead) return;
  const s = Math.sin(t * 1.6);
  u.torso.scale.set(1 + s * 0.006, 1 + s * 0.012, 1 + s * 0.006);
  u.head.rotation.y = Math.sin(t * 0.5 + g.id) * 0.25; u.head.rotation.x = Math.sin(t * 0.7) * 0.04;
  u.arms.forEach((a, i) => { a.sh.rotation.x = Math.sin(t * 0.9 + i * 2) * 0.03; });
  if (u.holo) { u.holoMat.opacity = 0.55 + Math.sin(t * 40) * 0.06 + (Math.random() < 0.02 ? -0.3 : 0); u.scan.offset.y = -t * 0.4; }
}

// translucent medical hologram
export function makeHologram() {
  const g = makeCrew(0x2aa0d8, false, null, { species: 'human' });
  const scan = canvasTex(8, 64, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, w, h / 3); }, false);
  scan.wrapS = scan.wrapT = THREE.RepeatWrapping; scan.repeat.set(1, 30);
  const hm = new THREE.MeshBasicMaterial({ color: 0x6ad8ff, transparent: true, opacity: 0.6, alphaMap: scan, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  g.traverse(o => { if (o.isMesh) { o.material = hm; o.castShadow = false; } });
  g.userData.holo = true; g.userData.holoMat = hm; g.userData.scan = scan;
  return g;
}

// =====================================================================
//  TRIBBLE (shell fur)
// =====================================================================
let furTex = null;
export function makeTribble() {
  if (!furTex) { furTex = canvasTex(128, 128, (g, s) => { g.clearRect(0, 0, s, s); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,255,${0.5 + Math.random() * 0.5})`; g.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5); } }, false); furTex.wrapS = furTex.wrapT = THREE.RepeatWrapping; furTex.repeat.set(3, 3); }
  const base = pickOf([0x8a6a4a, 0xb09070, 0x555048, 0xc8b8a0, 0x7a5a3a]);
  const col = new THREE.Color(base);
  const g = new THREE.Group(); const fur = new THREE.Group(); g.add(fur);
  const core = mk(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.55), roughness: 1 })); fur.add(core);
  for (let i = 1; i <= 9; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.2 + i * 0.012, 14, 10), new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.7 + i * 0.05), alphaMap: furTex, transparent: true, opacity: 0.9 - i * 0.07, roughness: 1, depthWrite: false }));
    fur.add(m);
  }
  fur.scale.set(1, 0.85, 1.15); fur.position.y = 0.2;
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.26, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.015; g.add(blob);
  g.userData.body = fur;
  return g;
}

// =====================================================================
//  ITEMS
// =====================================================================
export function makeItem(kind) {
  const g = new THREE.Group();
  if (kind === 'chip') {
    const pcb = canvasTex(128, 128, (c, s) => { c.fillStyle = '#0c3b2a'; c.fillRect(0, 0, s, s); c.strokeStyle = '#d8b24a'; c.lineWidth = 2; for (let i = 0; i < 14; i++) { c.beginPath(); c.moveTo(Math.random() * s, Math.random() * s); c.lineTo(Math.random() * s, Math.random() * s); c.stroke(); } c.fillStyle = '#40ffa0'; c.fillRect(48, 48, 32, 32); });
    g.add(mk(new THREE.BoxGeometry(0.34, 0.04, 0.34), new THREE.MeshStandardMaterial({ map: pcb, emissive: 0x20ff90, emissiveMap: pcb, emissiveIntensity: 0.9, roughness: 0.4 })));
    g.add(mk(new THREE.BoxGeometry(0.16, 0.06, 0.16), new THREE.MeshBasicMaterial({ color: 0xaaffdd }), 0, 0.03, 0));
    for (const sx of [-1, 1]) g.add(mk(new THREE.BoxGeometry(0.02, 0.05, 0.3), new THREE.MeshStandardMaterial({ color: 0xd8b24a, metalness: 0.9, roughness: 0.2 }), sx * 0.18, 0, 0));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshBasicMaterial({ color: 0x40ffa0, transparent: true, opacity: 0.14, depthWrite: false })));
  } else if (kind === 'battery') {
    const glow = new THREE.MeshBasicMaterial({ color: 0x40c8ff });
    g.add(mk(new THREE.CylinderGeometry(0.08, 0.08, 0.3, 14), new THREE.MeshStandardMaterial({ color: 0x2a3340, metalness: 0.8, roughness: 0.3 })));
    for (const y of [-0.08, 0, 0.08]) g.add(mk(new THREE.CylinderGeometry(0.083, 0.083, 0.02, 14), glow, 0, y, 0));
    g.add(mk(new THREE.CylinderGeometry(0.04, 0.04, 0.07, 10), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 1, roughness: 0.2 }), 0, 0.185, 0));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0x40c8ff, transparent: true, opacity: 0.12, depthWrite: false })));
  } else if (kind === 'medkit') {
    g.add(mk(new THREE.BoxGeometry(0.4, 0.26, 0.2), new THREE.MeshStandardMaterial({ color: 0xe8ecee, roughness: 0.35 })));
    const red = new THREE.MeshBasicMaterial({ color: 0xff3030 });
    g.add(mk(new THREE.BoxGeometry(0.2, 0.05, 0.205), red, 0, 0.02, 0)); g.add(mk(new THREE.BoxGeometry(0.05, 0.2, 0.205), red, 0, 0.02, 0));
    g.add(mk(new THREE.BoxGeometry(0.16, 0.04, 0.04), new THREE.MeshStandardMaterial({ color: 0x333840, metalness: 0.6, roughness: 0.4 }), 0, 0.15, 0));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff6060, transparent: true, opacity: 0.08, depthWrite: false })));
  }
  g.position.y = 0.9;
  return g;
}

// =====================================================================
//  CLINGON CRAWLER (spider-ish ceiling ambusher). Built standing on the floor; flipped when on the ceiling.
// =====================================================================
export function makeSpider() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x2a1418, roughness: 0.25, metalness: 0.1 });
  const flesh = new THREE.MeshStandardMaterial({ color: 0x6a1a22, roughness: 0.3 });
  const eye = new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 2 });
  const body = mk(new THREE.SphereGeometry(0.2, 14, 10), skin, 0, 0.34, 0.05); body.scale.set(1, 0.7, 1.2); g.add(body);
  const abd = mk(new THREE.SphereGeometry(0.26, 14, 10), flesh, 0, 0.36, -0.28); abd.scale.set(1, 0.85, 1.2); g.add(abd);
  for (let i = 0; i < 6; i++) { const e = mk(new THREE.SphereGeometry(0.025, 6, 4), eye, (i % 3 - 1) * 0.06, 0.4 + (i > 2 ? 0.05 : 0), 0.22); g.add(e); }
  for (const sx of [-1, 1]) { const m = mk(new THREE.ConeGeometry(0.025, 0.14, 5), new THREE.MeshStandardMaterial({ color: 0xd8d0b0 }), sx * 0.05, 0.28, 0.27); m.rotation.x = Math.PI; g.add(m); }
  const legs = [];
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1, k = i % 4, yaw = (k - 1.5) * 0.55;
    const hip = new THREE.Group(); hip.position.set(side * 0.14, 0.34, 0.12 - k * 0.1); hip.rotation.y = side * (Math.PI / 2) + yaw * side; g.add(hip);
    const up = mk(cap(0.018, 0.3, 5), skin, 0, 0.0, 0.17); up.rotation.x = Math.PI / 2 - 0.5; hip.add(up);
    const knee = new THREE.Group(); knee.position.set(0, 0.15, 0.3); hip.add(knee);
    const low = mk(cap(0.014, 0.4, 5), skin, 0, -0.18, 0.08); low.rotation.x = 0.35; knee.add(low);
    legs.push({ hip, knee, ph: i * 0.9 });
  }
  g.userData = { legs, body, abd };
  return g;
}
export function animateSpider(g, t, speed, latched) {
  const u = g.userData;
  u.legs.forEach((l, i) => { const f = latched ? 3 : speed > 0.5 ? 12 : 2.2; l.knee.rotation.x = Math.sin(t * f + l.ph) * (speed > 0.5 || latched ? 0.5 : 0.12); l.hip.rotation.z = Math.sin(t * f * 0.7 + l.ph) * (speed > 0.5 || latched ? 0.2 : 0.04); });
  u.abd.scale.y = 0.85 + Math.sin(t * 3) * 0.05;
}

// =====================================================================
//  FIRST-PERSON ZAPPER (hand + sidearm). Points down -Z. Returns { group, muzzle, flash, cells[] }
// =====================================================================
export function makeViewmodel(skin = 0xd9a47c, sleeve = 0xa3231c) {
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.75, roughness: 0.38 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x101216, metalness: 0.4, roughness: 0.6 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8d949c, metalness: 1, roughness: 0.22 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.95 });
  const skinM = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 });
  const cloth = new THREE.MeshStandardMaterial({ color: sleeve, roughness: 0.9 });
  const glow = (c) => new THREE.MeshBasicMaterial({ color: c });
  const P = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  // body: long rounded receiver
  const rec = P(new THREE.CapsuleGeometry(0.021, 0.15, 4, 12), shell, 0, 0, -0.03, Math.PI / 2); rec.scale.set(1.15, 1, 1.25);
  P(new THREE.BoxGeometry(0.034, 0.012, 0.16), dark, 0, 0.026, -0.03);                                   // top rail
  for (let i = 0; i < 5; i++) P(new THREE.BoxGeometry(0.05, 0.006, 0.006), dark, 0, 0.0, 0.02 - i * 0.014, 0, 0, 0).scale.set(1, 6, 1);   // cooling fins
  // emitter
  P(new THREE.CylinderGeometry(0.017, 0.022, 0.05, 14), steel, 0, 0, -0.145, Math.PI / 2);
  P(new THREE.CylinderGeometry(0.024, 0.024, 0.008, 14), dark, 0, 0, -0.118, Math.PI / 2);
  const ring = P(new THREE.TorusGeometry(0.019, 0.0035, 6, 18), glow(0xff9a3a), 0, 0, -0.168);
  const lens = P(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 12), glow(0xffd9a0), 0, 0, -0.171, Math.PI / 2);
  // charge display on the back, facing the player: three cells
  P(new THREE.BoxGeometry(0.04, 0.03, 0.006), dark, 0, 0.012, 0.073, -0.35);
  const cells = [-1, 0, 1].map(i => P(new THREE.BoxGeometry(0.008, 0.018, 0.003), glow(0x40c8ff), i * 0.011, 0.013, 0.0765, -0.35));
  // side power conduit
  P(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6), steel, 0.027, -0.008, -0.04, Math.PI / 2);
  P(new THREE.BoxGeometry(0.004, 0.012, 0.05), glow(0x40c8ff), -0.0265, 0.004, -0.05);
  // grip + trigger guard
  P(new THREE.BoxGeometry(0.03, 0.095, 0.04), grip, 0, -0.06, 0.035, 0.28).geometry.translate(0, 0, 0);
  P(new THREE.TorusGeometry(0.018, 0.003, 5, 12, Math.PI), dark, 0, -0.03, -0.005, 0, Math.PI / 2, Math.PI);
  // hand: palm, four fingers wrapped round the grip, index on the trigger, thumb along the body
  const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 3, 8);
  P(new THREE.BoxGeometry(0.02, 0.085, 0.075), skinM, 0.024, -0.065, 0.05, 0.28).geometry.translate(0, 0, 0);
  for (let i = 0; i < 3; i++) { P(cap(0.0095, 0.04), skinM, -0.004, -0.05 - i * 0.021, 0.012 - i * 0.006, 0, 0, Math.PI / 2); P(cap(0.009, 0.022), skinM, -0.024, -0.05 - i * 0.021, 0.03 - i * 0.006, Math.PI / 2 - 0.2, 0, 0); }
  P(cap(0.009, 0.038), skinM, 0.006, -0.028, -0.004, 0, 0.4, Math.PI / 2);                                 // trigger finger
  P(cap(0.011, 0.045), skinM, 0.03, -0.012, 0.03, Math.PI / 2 - 0.1, 0, 0.1);                              // thumb
  // wrist + forearm running off the bottom-right of the screen
  const arm = P(cap(0.032, 0.34), skinM, 0.05, -0.2, 0.2, 0.95, 0, -0.22); arm.scale.set(1, 1, 0.85);
  const slv = P(new THREE.CylinderGeometry(0.043, 0.05, 0.3, 12), cloth, 0.063, -0.262, 0.285, 0.95, 0, -0.22);
  P(new THREE.CylinderGeometry(0.0445, 0.0445, 0.012, 12), new THREE.MeshStandardMaterial({ color: 0xd8b24a, metalness: 0.8, roughness: 0.3 }), 0.047, -0.178, 0.168, 0.95, 0, -0.22); // rank braid
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, -0.18); g.add(muzzle);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); flash.position.copy(muzzle.position); flash.scale.set(1, 1, 2.2); g.add(flash);
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return { group: g, muzzle, flash, cells, ring, lens };
}
