import * as THREE from 'three';
import { TS, TUBE_UP } from './world.js';
import { makeGorn, animateGorn, makeCrew, makeSpider, animateSpider, makeTribble } from './actors.js';
import { makeHuman, humansReady, holoMaterial, CREW_KINDS, bindSurface, basisAt, pinToBone, MADNESS_CFG } from './humans.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const S = { DORMANT: 0, PATROL: 1, INVESTIGATE: 2, CHASE: 3, SEARCH: 4, STUNNED: 5 };
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ------------------------------------------------------------------
// Model wrappers: { mesh, tick(dt, speed, flags) }
// ------------------------------------------------------------------
// Gronk: base rig lives in actors.js; this wrapper adds the roar heave, lunge, limp after being zapped, and clawed footprints
let printTex = null, printM = null, printGeo = null;
function gronkModel() {
  const mesh = makeGorn(); let t = 0, atk = 0, roar = 0, hits = 0, wasStun = false, hurt = 0, stride = 0, side = 1, pi = 0; const u = mesh.userData, prints = [];
  const wound = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ color: 0x3a0c10, roughness: 0.2, emissive: 0x300000, emissiveIntensity: 0.4 })); wound.scale.set(1.3, 0.8, 0.4); wound.position.set(-0.28, 0.4, 0.33); wound.visible = false; u.torso.add(wound);
  return { mesh, tick(dt, speed, f) {
    t += dt; if (f.stunned && !wasStun) hits++; wasStun = !!f.stunned; hurt += ((Math.min(1, hits * 0.45)) - hurt) * Math.min(1, dt * 2); wound.visible = hurt > 0.2;
    const lim = hurt * (f.stunned ? 0 : 1), sp = f.stunned ? 0 : speed * (1 - hurt * 0.2);
    atk += ((f.attacking ? 1 : 0) - atk) * Math.min(1, dt * (f.attacking ? 16 : 5)); roar += ((f.roaring ? 1 : 0) - roar) * Math.min(1, dt * 8);
    animateGorn(mesh, sp, t, f.roaring, f); mesh.rotation.z = f.stunned ? Math.sin(t * 40) * 0.05 : 0;
    // lunge: whole body drives forward, chest drops, both arms slash down
    u.body.position.z = atk * 0.55 - roar * 0.08; u.torso.rotation.x += atk * 0.55 - roar * 0.1; u.head.rotation.x += atk * 0.3; u.jaw.rotation.x += atk * 0.5;
    u.arms.forEach((a, i) => { a.sh.rotation.x += atk * (-1.4 + Math.sin(t * 30 + i) * 0.1); a.el.rotation.x += atk * -0.4; });
    u.tail.forEach((sg, i) => { sg.rotation.y += atk * Math.sin(t * 16 - i * 0.7) * 0.25; });   // tail whips as it strikes
    // roar: chest swells, head thrown back, whole body shakes
    if (roar > 0.01) { u.body.position.x = Math.sin(t * 60) * 0.012 * roar; u.chest.scale.x *= 1 + roar * 0.12; u.chest.scale.z *= 1 + roar * 0.15; u.neck.rotation.x = -0.6 - roar * 0.25; }
    // injured: favours one leg, slumps, drips
    if (lim > 0) { const L = u.legs[0]; L.hip.rotation.x *= 1 - lim * 0.5; L.knee.rotation.x -= lim * 0.35; u.body.rotation.z += lim * 0.07 * Math.sin(t * 4.6 * (0.5 + speed * 0.3)); u.body.position.y -= lim * 0.06; u.torso.rotation.x += lim * 0.14; u.head.rotation.x += lim * 0.12; }
    // footprints: a pair of three-toed claw prints per stride, fading over about a minute
    if (!f.stunned && speed > 0.4 && mesh.parent && typeof document !== 'undefined') {
      stride += speed * dt; if (stride > 0.95) { stride = 0; side = -side;
        if (!printGeo) { printTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = 'rgba(0,0,0,0.75)'; g.beginPath(); g.ellipse(32, 44, 10, 14, 0, 0, 7); g.fill(); for (const x of [-16, 0, 16]) { g.beginPath(); g.ellipse(32 + x, 22 - Math.abs(x) * 0.2, 4, 10, x * 0.02, 0, 7); g.fill(); g.beginPath(); g.moveTo(28 + x, 10 - Math.abs(x) * 0.2); g.lineTo(32 + x, 0); g.lineTo(36 + x, 10 - Math.abs(x) * 0.2); g.fill(); } return new THREE.CanvasTexture(c); })(); printGeo = new THREE.PlaneGeometry(0.5, 0.5); printGeo.rotateX(-Math.PI / 2); }
        if (prints.length < 10) { const m = new THREE.Mesh(printGeo, new THREE.MeshBasicMaterial({ map: printTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); m.visible = false; m.renderOrder = 1; mesh.parent.add(m); prints.push({ m, age: 99 }); }
        const pr = prints[pi++ % prints.length]; pr.age = 0; const a = mesh.rotation.y, sc = mesh.scale.x; pr.m.visible = true; pr.m.position.set(mesh.position.x + Math.cos(a) * side * 0.42 * sc, mesh.position.y + 0.025, mesh.position.z - Math.sin(a) * side * 0.42 * sc); pr.m.rotation.y = a; pr.m.scale.set(side, 1, 1);
      }
    }
    for (const pr of prints) if (pr.m.visible) { pr.age += dt; pr.m.material.opacity = Math.max(0, 0.8 - pr.age / 60); if (pr.age > 60) pr.m.visible = false; }
  } };
}
function crewFallback(color) { const mesh = makeCrew(color, false, null, { species: 'human' }); return { mesh, tick(dt, speed, f) { mesh.userData.torso.rotation.x = Math.min(0.5, speed * 0.1); } }; }

// rigged human (see humans.js) with a locomotion state machine
function humanModel(opts, cfg, fallback) {
  const mesh = humansReady() ? makeHuman(opts) : null; if (!mesh) return fallback();
  const H = mesh.userData.human; let stunT = 0, atk = false, t = 0;
  if (cfg.face) H.face(cfg.face);
  cfg.init?.(mesh, H);
  return {
    mesh, H,
    tick(dt, speed, f) {
      t += dt;
      if (f.frozen) { H.mixer.timeScale = 0; H.update(dt); cfg.tick?.(mesh, H, t, f, dt); return; }
      H.mixer.timeScale = 1;
      if (f.stunned) { stunT += dt; if (stunT < 0.7) H.play(cfg.stun || 'hit_chest', { loop: false, fade: 0.08 }); else H.play(cfg.stunHold || 'crouch_idle', { fade: 0.35 }); }
      else {
        stunT = 0;
        if (f.attacking) { if (!atk) H.play(cfg.attack || 'punch_cross', { loop: false, fade: 0.06, restart: true, speed: cfg.attackSpeed || 1.3 }); atk = true; }
        else {
          atk = false;
          if (f.climb && speed > 0.1 && H.has('push')) H.play('push', { speed: 1.4, fade: 0.15 });
          else if (f.vault && H.has('crouch_fwd')) H.play('crouch_fwd', { speed: 1.6, fade: 0.08 });
          else if (f.crawl && speed > 0.2 && H.has('crouch_fwd')) H.play('crouch_fwd', { speed: Math.max(0.8, speed / 1.2), fade: 0.2 });
          else if (speed > (cfg.runAt ?? 3.4)) H.play(cfg.run || 'sprint', { speed: Math.max(0.7, speed / (cfg.runRef ?? 5.2)), fade: 0.2 });
          else if (speed > (cfg.jogAt ?? 2.4)) H.play(cfg.jog || 'jog_fwd', { speed: Math.max(0.7, speed / (cfg.jogRef ?? 4.7)), fade: 0.25 });
          else if (speed > 0.25) H.play(cfg.walk || 'walk', { speed: Math.max(0.6, speed / (cfg.walkRef ?? 1.5)), fade: 0.25 });
          else H.play(cfg.idle || 'idle', { fade: 0.3 });
        }
      }
      H.update(dt); cfg.tick?.(mesh, H, t, f, dt);
    },
  };
}
const CRAZED_FACE = { JawDrop: 0.75, LeftBrowDown: 1, RightBrowDown: 1, UpperLipUp: 0.9, NoseWrinkler: 1, LeftUpperLidOpen: 1, RightUpperLidOpen: 1 };
export const MODELS = {
  gronk: () => gronkModel(),
  crazed: (o = {}) => humanModel({ bloody: 0.8, pale: 0.55, rank: Math.floor(Math.random() * 3), ...(o.human || {}) }, { ...MADNESS_CFG, face: CRAZED_FACE }, () => crewFallback(0xb02a20)),
  slimeling: (o = {}) => humanModel({ slime: true, bloody: 0.35, ...(o.human || {}) }, { face: { ...CRAZED_FACE, JawDrop: 1 }, attack: 'punch_jab', walk: 'jog', walkRef: 3, init: slimeKit, tick: slimeTick }, () => crewFallback(0x30a050)),
  drone: () => humanModel({ kind: 'suit', height: 2.02, tint: 0x4e5a56 }, { walk: 'walk_formal', walkRef: 1.25, jogAt: 99, runAt: 99, attack: 'punch_jab', attackSpeed: 0.9, stun: 'hit_head', stunHold: 'idle', init: droneKit, tick: droneTick }, () => crewFallback(0x5a6660)),
  phantom: () => humanModel({ kind: 'crew_m', height: 1.86, material: phantomMaterial(), shadow: false }, { idle: 'dance', walk: 'dance', jog: 'dance', run: 'dance', attack: 'punch_jab', init: hostKit, face: { MouthLeftPullUp: 1, RightBrowDown: 0, MouthRightPullUp: 1, JawDrop: 0.35, LeftUpperLidOpen: 1, RightUpperLidOpen: 1 } }, () => crewFallback(0xff3fd0)),
  clinger: () => clingerModel(),
  furble: () => furbleModel(),
};
// Clingon Crawler: spiked leg joints, hooked mandibles, ceiling-hang pose, and a face-hugging latch
function clingerModel() {
  const mesh = makeSpider(), u = mesh.userData; let t = 0;
  const spike = new THREE.MeshStandardMaterial({ color: 0x1a0c10, roughness: 0.3 }), hook = new THREE.MeshStandardMaterial({ color: 0xd8d0b0, roughness: 0.25 });
  const sp = new THREE.ConeGeometry(0.008, 0.06, 4), mand = new THREE.TorusGeometry(0.06, 0.012, 5, 10, Math.PI * 1.05);
  for (const L of u.legs) { for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(sp, spike); m.position.set((i - 1) * 0.012, 0.02 - i * 0.07, 0.06 + i * 0.02); m.rotation.x = -0.9; m.castShadow = false; L.knee.add(m); }
    const k = new THREE.Mesh(sp, spike); k.scale.setScalar(1.6); k.position.set(0, 0.05, 0.0); k.rotation.x = 0.4; L.knee.add(k); }
  for (const J of u.jaws) { if (J.palp) continue; const m = new THREE.Mesh(mand, hook); m.position.set(-J.sx * 0.0, -0.1, 0.07); m.rotation.set(0, Math.PI / 2 * J.sx * 0, J.sx > 0 ? 2.2 : 0.9); m.scale.set(0.9, 1.1, 1); m.castShadow = false; J.j.add(m); }
  const ab0 = u.abd.position.z;
  return { mesh, tick(dt, speed, f) {
    t += dt; animateSpider(mesh, t, speed, f.latched, f);
    // hanging: front legs hooked up on the ceiling, body swaying; abdomen throbs
    if (f.lurk) { u.body.position.y = 0.34 + Math.sin(t * 0.9) * 0.012; u.body.rotation.z = Math.sin(t * 0.7) * 0.03; u.legs.forEach((l, i) => { l.hip.rotation.x += 0.15 + (l.k < 2 ? 0.1 : 0); }); u.abd.scale.x = 1 + Math.sin(t * 2.4) * 0.04; }
    // latched on a face: fangs jab, abdomen pumps, legs squeeze
    if (f.latched) { u.abd.scale.set(1 + Math.sin(t * 9) * 0.1, 0.85 + Math.sin(t * 9 + 1) * 0.1, 1.2 + Math.sin(t * 9) * 0.08); u.body.position.z = 0.05 + Math.max(0, Math.sin(t * 7)) * 0.04; u.legs.forEach((l, i) => { l.knee.rotation.x += Math.sin(t * 5 + i) * 0.15 + 0.2; }); }
    else { u.body.position.z = 0.05; u.abd.scale.z = 1.2; if (!f.lurk) u.abd.scale.x = 1; }
  } };
}
// Furble: base mesh in actors.js; purr = fast shallow vibration under a slow breath, fur layers shimmer. near (0..1) deepens the purr.
function furbleModel() { const mesh = makeTribble(); let t = 0; return { mesh, tick(dt, near = 0) { t += dt; purrFurble(mesh, t, near); } }; }
export function purrFurble(g, t, near = 0) {
  const b = g.userData.body, k = 0.012 + near * 0.02;
  b.scale.set(1 + Math.sin(t * 38) * k * 0.5, 0.85 + Math.sin(t * 2.2) * 0.03 + Math.sin(t * 38) * k, 1.15 + Math.sin(t * 38 + 1.3) * k * 0.5);
  b.rotation.z = Math.sin(t * 1.3) * 0.03; b.children.forEach((m, i) => { if (i) m.rotation.y = Math.sin(t * 3 + i) * 0.04 * (1 + near); });
}
// assimilation hardware bolted onto the suit: eye lens, cabling, tool arm
function droneKit(mesh, H) {
  const metal = new THREE.MeshStandardMaterial({ color: 0x1c2022, metalness: 0.9, roughness: 0.35 });
  const glow = new THREE.MeshBasicMaterial({ color: 0x50ff70 });
  const s = 1 / H.inner.scale.x; const add = (bone, m, x, y, z) => { m.position.set(x * s, y * s, z * s); m.scale.multiplyScalar(s); H.bones[bone]?.add(m); return m; };
  const head = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 10, 0, Math.PI), metal); plate.scale.set(1, 1.15, 0.8); plate.rotation.y = -0.5; head.add(plate);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.07, 12), metal); lens.rotation.x = Math.PI / 2; lens.position.set(0.033, 0.06, 0.1); head.add(lens);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), glow); dot.position.set(0.033, 0.06, 0.138); head.add(dot);
  for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.1 + i * 0.012, 0.009, 5, 14, Math.PI * 1.1), metal); c.rotation.set(0.4 + i * 0.5, 1.2, 0.3 * i); c.position.set(0.02, -0.06, -0.02); head.add(c); }
  add('Head', head, 0, 0.09, 0.03);
  const arm = new THREE.Group();
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.07, 0.26, 10), metal); sleeve.position.y = 0.16; arm.add(sleeve);
  for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.2, 6), metal); const a = i / 3 * Math.PI * 2; p.position.set(Math.cos(a) * 0.035, 0.38, Math.sin(a) * 0.035); p.rotation.set(Math.sin(a) * -0.25, 0, Math.cos(a) * 0.25); arm.add(p); }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.008, 5, 16), glow); ring.rotation.x = Math.PI / 2; ring.position.y = 0.27; arm.add(ring);
  add('lowerarm_r', arm, 0, 0, 0);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.1), metal); add('spine_03', pack, 0, 0.05, -0.17);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.012), glow); add('spine_03', strip, 0, 0.05, -0.225);
  mesh.traverse(o => { if (o.isMesh) o.castShadow = true; });
  // eye sweep: a flat fan of light from the lens that pans across the corridor
  const fanGeo = droneGeo.fan || (droneGeo.fan = (() => { const g = new THREE.ConeGeometry(0.34, 3.4, 16, 1, true); g.translate(0, -1.7, 0); g.rotateX(-Math.PI / 2); const p = g.attributes.position, c = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const k = Math.max(0, 1 - p.getZ(i) / 3.4) ** 1.6; c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; })());
  const beamM = new THREE.MeshBasicMaterial({ color: 0x50ff70, vertexColors: true, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const sweep = new THREE.Group(); sweep.position.set(0.033, 0.06, 0.14); const fan = new THREE.Mesh(fanGeo, beamM); fan.scale.set(1, 0.07, 1); fan.castShadow = false; fan.frustumCulled = false; sweep.add(fan); head.add(sweep);
  // exposed cabling: ribbed hoses from the pack to the skull plate, over the shoulder to a chest port, and down the spine
  H.inner.updateMatrixWorld(true); const cast = bindSurface(H.inner, () => true), W = (n) => H.bones[n].getWorldPosition(new THREE.Vector3());
  const sp = W('spine_03'), hd = W('Head'), shR = W('upperarm_r'), pel = W('pelvis'), sR = Math.sign(shR.x - sp.x) || -1, half = Math.abs(shR.x - sp.x);
  const hit = (ox, oy, oz, dx, dy, dz, fb) => cast(ox, oy, oz, dx, dy, dz).find(h => h.front)?.p || fb;
  const back = hit(sp.x, sp.y + 0.05, sp.z - 1, 0, 0, 1, new THREE.Vector3(sp.x, sp.y, sp.z - 0.14)), front = hit(sp.x + sR * 0.08, sp.y - 0.02, sp.z + 1, 0, 0, -1, new THREE.Vector3(sp.x, sp.y, sp.z + 0.15));
  const top = hit(sp.x + sR * half * 0.6, sp.y + 1, sp.z, 0, -1, 0, new THREE.Vector3(sp.x + sR * half * 0.6, shR.y + 0.08, sp.z)), nape = hit(hd.x, hd.y + 0.06, hd.z - 1, 0, 0, 1, new THREE.Vector3(hd.x, hd.y, hd.z - 0.11)), low = hit(pel.x, pel.y + 0.1, pel.z - 1, 0, 0, 1, new THREE.Vector3(pel.x, pel.y, pel.z - 0.12));
  const V = (x, y, z) => new THREE.Vector3(x, y, z), tube = (pts, r) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, r, 5);
  const hoses = [
    tube([V(sp.x - sR * 0.05, sp.y + 0.14, back.z - 0.1), V(sp.x - sR * 0.07, sp.y + 0.27, back.z - 0.13), V(hd.x - sR * 0.06, hd.y + 0.02, nape.z - 0.07), V(hd.x - sR * 0.04, hd.y + 0.09, nape.z - 0.01)], 0.013),
    tube([V(sp.x + sR * 0.05, sp.y + 0.14, back.z - 0.1), V(sp.x + sR * 0.04, sp.y + 0.3, back.z - 0.11), V(hd.x + sR * 0.05, hd.y + 0.05, nape.z - 0.06), V(hd.x + sR * 0.07, hd.y + 0.12, nape.z + 0.0)], 0.009),
    tube([V(sp.x + sR * 0.09, sp.y + 0.1, back.z - 0.09), V(top.x - sR * 0.02, top.y + 0.02, back.z - 0.04), V(top.x, top.y + 0.035, top.z + 0.02), V(front.x + sR * 0.03, front.y + 0.12, front.z + 0.03), V(front.x, front.y, front.z + 0.012)], 0.012),
    tube([V(sp.x, sp.y - 0.07, back.z - 0.09), V(sp.x + sR * 0.03, (sp.y + pel.y) / 2, low.z - 0.07), V(pel.x, pel.y + 0.12, low.z - 0.015)], 0.011),
  ];
  for (let i = 0; i < 7; i++) { const r = new THREE.TorusGeometry(0.017, 0.004, 4, 8), k = i / 6, a = V(sp.x + sR * 0.09, sp.y + 0.1, back.z - 0.09).lerp(V(top.x - sR * 0.02, top.y + 0.02, back.z - 0.04), k); r.rotateX(Math.PI / 2 - 0.6); r.translate(a.x, a.y, a.z); hoses.push(r); }
  const cab = new THREE.Mesh(mergeGeometries(hoses.map(g => { const o = g.index ? g.toNonIndexed() : g; return o; })), droneGeo.hose || (droneGeo.hose = new THREE.MeshStandardMaterial({ color: 0x0d0f10, metalness: 0.5, roughness: 0.4 }))); cab.castShadow = false; pinToBone(H.inner, 'spine_03', cab);
  const port = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.02, 10), glow); port.rotation.x = Math.PI / 2; port.position.set(front.x, front.y, front.z + 0.012); pinToBone(H.inner, 'spine_03', port);
  // adaptive shield: only shows once it has learned the zapper's frequency
  const shM = new THREE.MeshBasicMaterial({ color: 0xffa030, wireframe: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const shield = new THREE.Mesh(droneGeo.shell || (droneGeo.shell = new THREE.IcosahedronGeometry(1, 2)), shM); shield.scale.set(0.62, 1.12, 0.62); shield.position.y = 1.05; shield.castShadow = false; shield.visible = false; mesh.add(shield);
  // drones are shaved under the lens plate: hide hair so no strands poke through the collar/plate
  H.inner.traverse(o => { if (o.isMesh && (o.name === 'hair' || (o.material?.name || '') === 'hair')) o.visible = false; });
  // arcing sparks at the cabling when stunned; amber armour studs fade in once it has adapted
  const sparkM = new THREE.MeshBasicMaterial({ color: 0xbfffd0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const sparks = []; for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.12), sparkM); m.visible = false; m.castShadow = false; m.frustumCulled = false; mesh.add(m); sparks.push(m); }
  const plateM = new THREE.MeshStandardMaterial({ color: 0x3a3022, metalness: 0.85, roughness: 0.4, emissive: 0xff8a20, emissiveIntensity: 0 }), plates = [];
  for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.12), plateM); m.visible = false; add(sx > 0 ? 'upperarm_r' : 'upperarm_l', m, 0, 0.03, 0); m.position.x += sx * 0.03 * s; plates.push(m); }
  { const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.03), plateM); m.visible = false; add('spine_03', m, 0, 0.1, 0.13); plates.push(m); }
  H.drone = { glow, beamM, sweep, shield, shM, flash: 0, was: false, sparks, sparkM, plates, plateM, pack };
}
const droneGeo = {};
const GREEN = new THREE.Color(0x50ff70), AMBER = new THREE.Color(1.0, 0.55, 0.12);
function droneTick(mesh, H, t, f) {
  const d = H.drone; if (!d) return; const ad = !!f.adapted, col = ad ? AMBER : GREEN;
  d.glow.color.copy(col).multiplyScalar(f.stunned && !ad ? (Math.sin(t * 50) > 0 ? 0.9 : 0.1) : 0.85 + 0.15 * Math.sin(t * 6)); d.beamM.color.copy(col);
  d.sweep.visible = !(f.stunned && !ad); d.sweep.rotation.y = Math.sin(t * (ad ? 1.7 : 0.9)) * 0.6; d.sweep.rotation.x = 0.14 + Math.sin(t * 0.37) * 0.06; d.beamM.opacity = 0.085 + 0.025 * Math.sin(t * 23);
  if (ad && f.stunned && !d.was) d.flash = 1;   // a zap just splashed off the shield
  d.was = !!f.stunned; d.flash = Math.max(0, d.flash - 0.03);
  d.plates.forEach(m => m.visible = ad); d.plateM.emissiveIntensity = ad ? 0.4 + 0.3 * Math.sin(t * 3) : 0;
  const zz = !!f.stunned && !ad || d.flash > 0.3; d.sparks.forEach((m, i) => { m.visible = zz && Math.random() < 0.6; if (m.visible) { d.pack.getWorldPosition(m.position); mesh.worldToLocal(m.position); m.position.x += (Math.random() - 0.5) * 0.3; m.position.y += (Math.random() - 0.3) * 0.5; m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3); } });
  d.shield.visible = ad; if (ad) { d.shM.opacity = 0.035 + 0.02 * Math.sin(t * 3) + d.flash * 0.5; d.shield.rotation.y = t * 0.4; }
}

// Slimeling: what is left of the disguise sloughs off — blobs swell out of the joints, strands hang from the hands and chin
let slimeM = null, slimeGeo = null;
function slimeKit(mesh, H) {
  slimeM = slimeM || new THREE.MeshStandardMaterial({ color: 0x58b85a, roughness: 0.06, metalness: 0, emissive: 0x0c5a1c, emissiveIntensity: 0.7, transparent: true, opacity: 0.86 });
  slimeGeo = slimeGeo || { blob: new THREE.SphereGeometry(1, 10, 8), drip: (() => { const g = new THREE.ConeGeometry(0.011, 0.2, 6); g.rotateX(Math.PI); g.translate(0, -0.1, 0); return g; })(), bead: new THREE.SphereGeometry(0.014, 6, 5) };
  H.inner.updateMatrixWorld(true); const u = H.height / 1.75, blobs = [], drips = [], R = Math.random;
  const at = (bone, dx, dy, dz, r, sy = 1) => { const b = H.bones[bone] || H.inner.getObjectByName(bone); if (!b) return; const p = b.getWorldPosition(new THREE.Vector3()), m = new THREE.Mesh(slimeGeo.blob, slimeM); m.position.set(p.x + dx * u, p.y + dy * u, p.z + dz * u); const s = r * u; m.userData.s = [s, s * sy, s * (0.8 + R() * 0.3)]; m.scale.setScalar(0.001); m.castShadow = false; pinToBone(H.inner, bone, m); blobs.push(m); };
  at('upperarm_l', 0.02, 0.03, 0, 0.075, 0.8); at('upperarm_r', -0.02, 0.02, -0.02, 0.06, 1.1); at('Head', 0.05, 0.14, -0.03, 0.07, 0.7); at('spine_03', -0.08, 0.02, 0.1, 0.08, 1.2); at('spine_02', 0.07, -0.02, -0.1, 0.09);
  at('lowerarm_r', 0, -0.05, 0.02, 0.05, 1.4); at('thigh_l', 0.05, -0.15, 0.03, 0.065, 1.5); at('calf_r', -0.02, -0.1, -0.03, 0.05, 1.3); at('pelvis', 0, 0.04, -0.11, 0.085, 0.9);
  const hang = (bone, dx, dy, dz, len) => { const b = H.bones[bone]; if (!b) return; const p = b.getWorldPosition(new THREE.Vector3()), g = new THREE.Group(); g.position.set(p.x + dx * u, p.y + dy * u, p.z + dz * u); const m = new THREE.Mesh(slimeGeo.drip, slimeM), bead = new THREE.Mesh(slimeGeo.bead, slimeM); m.castShadow = bead.castShadow = false; g.add(m, bead); pinToBone(H.inner, bone, g); drips.push({ g, m, bead, len: len * u, ph: R() * 6 }); };
  hang('hand_l', 0, -0.08, 0, 0.6); hang('hand_r', 0, -0.08, 0, 0.45); hang('Head', 0, 0.02, 0.1, 0.3); hang('lowerarm_l', 0, -0.03, 0, 0.35);
  H.inner.traverse(o => { if (o.isMesh && (o.material.name || '').startsWith('garment')) { o.material.roughness = 0.38; o.material.color.lerp(new THREE.Color(0x2f6a34), 0.3); } });
  const pg = new THREE.Group(); pg.name = 'slimeSpray'; mesh.add(pg); const parts = [];
  for (let i = 0; i < 28; i++) { const m = new THREE.Mesh(slimeGeo.bead, slimeM); m.visible = false; m.castShadow = false; pg.add(m); parts.push({ m, life: 0, v: new THREE.Vector3() }); }
  H.slime = { parts, spawn: 0, inv: 1 / H.inner.scale.z, blobs, drips, skin: H.mats.body ? H.mats.body.color.clone() : null, from: new THREE.Color(0xc99a78), sy: H.inner.scale.y };
}
const _q = new THREE.Quaternion(), _v = new THREE.Vector3();
// slime spray: a burst of globs when the disguise bursts, then an occasional drop shed from the strands
function slimeSpray(mesh, S, dt, t) {
  mesh.updateWorldMatrix(true, false);
  S.spawn += dt * (t < 1.3 ? 45 : 2.2);
  while (S.spawn >= 1) {
    S.spawn--; const p = S.parts.find(q => q.life <= 0); if (!p) break;
    const src = t < 1.3 ? S.blobs[Math.floor(Math.random() * S.blobs.length)] : S.drips[Math.floor(Math.random() * S.drips.length)]?.bead;
    if (!src) break; src.getWorldPosition(_v); mesh.worldToLocal(_v); p.m.position.copy(_v);
    const burst = t < 1.3 ? 1.6 : 0.1; p.v.set((Math.random() - 0.5) * burst, Math.random() * burst * 0.8, (Math.random() - 0.5) * burst); p.life = 0.6 + Math.random() * 0.5; p.m.visible = true; p.m.scale.setScalar(0.7 + Math.random() * 1.1);
  }
  for (const p of S.parts) { if (p.life <= 0) continue; p.life -= dt; p.v.y -= 9 * dt; p.m.position.addScaledVector(p.v, dt); if (p.m.position.y < 0.02) { p.m.position.y = 0.02; p.v.set(0, 0, 0); p.m.scale.y = 0.3; p.life = Math.min(p.life, 0.25); } if (p.life <= 0) { p.m.visible = false; p.m.scale.y = p.m.scale.x; } }
}
function slimeTick(mesh, H, t, f, dt = 1 / 60) {
  const S = H.slime; H.inner.scale.x = H.inner.scale.z * (1 + Math.sin(t * 9) * 0.03); if (!S) return; slimeSpray(mesh, S, dt, t);
  const r = Math.min(1, t / 1.1), k = r < 1 ? 1 + 2.2 * (r - 1) ** 3 + 1.2 * (r - 1) ** 2 : 1;   // the reveal: skin greens over, growths burst out with a little overshoot
  H.inner.scale.y = S.sy * (1 - Math.sin(t * 24) * 0.09 * (1 - r) + Math.sin(t * 2.1) * 0.012);
  if (S.skin && r < 1) H.mats.body.color.copy(S.from).lerp(S.skin, r); else if (S.skin && !S.done) { H.mats.body.color.copy(S.skin); S.done = true; }
  S.blobs.forEach((b, i) => { const w = 1 + Math.sin(t * 3.1 + i * 1.7) * 0.12, s = b.userData.s; b.scale.set(s[0] * k * w * S.inv, s[1] * k / w * S.inv, s[2] * k * w * S.inv); });
  for (const d of S.drips) {   // strands always hang straight down, stretch, snap and start again
    d.g.parent.getWorldQuaternion(_q); d.g.quaternion.copy(_q.invert());
    const c = (t * 0.45 + d.ph) % 1, len = k * d.len * (0.25 + c * 1.1); d.m.scale.set(1.2 - c * 0.6, len, 1.2 - c * 0.6); d.bead.position.y = -0.2 * len; d.bead.scale.setScalar(0.7 + c * 0.8);
  }
}

// Mr. Grinsworth's host outfit, all in the same projection: bow tie, lapels, coat tails, a straw boater and eyes that shine
function hostKit(mesh, H) {
  const mat = phantomMaterial(), inner = H.inner; inner.updateMatrixWorld(true);
  const cast = bindSurface(inner), castHair = bindSurface(inner, (n) => n === 'hair' || n === 'body'), u = H.height / 1.75, W = (n) => (H.bones[n] || inner.getObjectByName(n)).getWorldPosition(new THREE.Vector3());
  const np = W('neck_01'), shL = W('upperarm_l'), pel = W('pelvis'), hd = W('Head'), half = Math.abs(shL.x - np.x), Z = new THREE.Vector3(0, 0, 1);
  const first = (c, ...a) => c(...a).find(h => h.front), sc = new THREE.Matrix4().makeScale(u, u, u);
  const flat = (g) => { const o = g.index ? g.toNonIndexed() : g; return o; }, pin = (bone, geos) => { const m = new THREE.Mesh(mergeGeometries(geos.map(flat)), mat); m.castShadow = false; m.frustumCulled = false; pinToBone(inner, bone, m); return m; };
  const chest = [];
  { const h = first(cast, np.x, np.y - 0.05 * u, np.z + 1, 0, 0, -1); if (h) { const m = basisAt(h.p, Z, undefined, 0.012 * u);
      for (const sx of [-1, 1]) { const c = new THREE.ConeGeometry(0.036, 0.075, 4); c.rotateZ(sx * Math.PI / 2); c.translate(sx * 0.04, 0, 0); c.scale(1, 1, 0.35); chest.push(c.applyMatrix4(sc).applyMatrix4(m)); }
      const k = new THREE.SphereGeometry(0.016, 6, 5); chest.push(k.applyMatrix4(sc).applyMatrix4(m)); } }
  for (const sx of [-1, 1]) { const h = first(cast, np.x + sx * half * 0.3, np.y - 0.17 * u, np.z + 1, 0, 0, -1); if (!h) continue;
    const l = new THREE.BoxGeometry(0.05, 0.25, 0.008); l.rotateZ(sx * 0.3); chest.push(l.applyMatrix4(sc).applyMatrix4(basisAt(h.p, h.n.lerp(Z, 0.6), undefined, 0.012 * u)));
    const b = new THREE.SphereGeometry(0.012, 6, 4); b.translate(0, -0.15 - (sx > 0 ? 0.05 : 0), 0); chest.push(b.applyMatrix4(sc).applyMatrix4(basisAt(new THREE.Vector3(np.x, h.p.y, h.p.z), Z, undefined, 0.014 * u))); }
  if (chest.length) pin('spine_03', chest);
  { const h = first(cast, pel.x, pel.y + 0.04 * u, pel.z - 1, 0, 0, 1), zb = h ? h.p.z : pel.z - 0.12, tails = [];
    for (const sx of [-1, 1]) { const t = new THREE.BoxGeometry(0.12, 0.5, 0.01); const p = t.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setX(i, p.getX(i) * 0.35 + sx * 0.03); t.translate(sx * 0.075, -0.25, 0); t.rotateX(0.16); t.applyMatrix4(sc); t.translate(pel.x, pel.y + 0.06 * u, zb - 0.02 * u); tails.push(t); }
    H.tails = pin('pelvis', tails); }
  { const h = first(castHair, hd.x, hd.y + 1, hd.z + 0.01, 0, -1, 0), top = h ? h.p.y : hd.y + 0.2 * u;
    const brim = new THREE.CylinderGeometry(0.155, 0.155, 0.012, 20), crown = new THREE.CylinderGeometry(0.09, 0.095, 0.075, 16), band = new THREE.CylinderGeometry(0.098, 0.098, 0.028, 16, 1, true); crown.translate(0, 0.04, 0); band.translate(0, 0.022, 0);
    const hat = [brim, crown, band].map(g => { g.rotateZ(-0.16); g.rotateX(-0.1); g.applyMatrix4(sc); g.translate(hd.x + 0.012 * u, top - 0.012 * u, hd.z + 0.005); return g; }); pin('Head', hat); }
  { const eyes = inner.getObjectByName('eyes');
    if (eyes?.isSkinnedMesh) { eyes.skeleton.update(); const v = new THREE.Vector3(), c = [new THREE.Vector3(), new THREE.Vector3()], n = [0, 0], pos = eyes.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) { eyes.getVertexPosition(i, v).applyMatrix4(eyes.matrixWorld); const k = v.x > hd.x ? 0 : 1; c[k].add(v); n[k]++; }
      const em = hostEye || (hostEye = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.5, 2.1) }));
      for (const k of [0, 1]) if (n[k]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.0085 * u, 8, 6), em); e.position.copy(c[k].multiplyScalar(1 / n[k])); e.position.z += 0.008 * u; e.castShadow = false; pinToBone(inner, 'Head', e); } } }
}
let hostEye = null;

// ------------------------------------------------------------------
// Base class
// ------------------------------------------------------------------
export class Enemy {
  constructor(world, spawnTile, deck, delay, scene, sound, model) {
    this.w = world; this.deck = deck; this.sound = sound; this.scene = scene;
    this.model = model; this.mesh = model.mesh; this.mesh.visible = false; scene.add(this.mesh);
    const [cx, cz] = world.center(spawnTile[0], spawnTile[1]);
    this.x = cx; this.z = cz; this.yaw = Math.random() * 6.28;
    this.state = S.DORMANT; this.delay = delay;
    this.target = null; this.field = null; this.fieldKey = '';
    this.timer = 0; this.stun = 0; this.attackCd = 0; this.speed = 0; this.t = 0;
    this.roar = 0; this.attacking = 0; this.hitY = 1.4; this.hitR = 0.75; this.quiet = false; this.dead = false;
    this.name = 'Hostile'; this.kind = 'enemy';
  }
  get active() { return !this.dead && this.state !== S.DORMANT; }

  setTarget(tx, ty) {
    if (this.noCrawl && this.w.isTube(tx, ty)) {   // too big for a Jiffy tube: wait at whichever mouth is nearer the quarry
      const t = this.w.d.tubes.find(t => t.tiles.some(([x, y]) => x === tx && y === ty)); const i = t.tiles.findIndex(([x, y]) => x === tx && y === ty);
      [tx, ty] = i < t.tiles.length / 2 ? t.a : t.b;
    } else if (!this.climber && this.w.tubeKind(tx, ty) === 'up') {   // quarry is in an upper run: crawl to the foot of the ladder and wait
      const t = this.w.d.tubes.find(t => t.tiles.some(([x, y]) => x === tx && y === ty)); [tx, ty] = t.tiles[t.ladder];
    }
    if (this.w.grid[ty]?.[tx] !== 0 && !(this.climber && isFinite(this.w.topAt(tx, ty)))) {   // player is on top of a prop (or in a wall tile): aim for the nearest open neighbour instead
      let best = null; const [mx, my] = this.w.tile(this.x, this.z);
      for (const [a, b] of DIRS) { if (this.w.grid[ty + b]?.[tx + a] !== 0) continue; const d = Math.abs(tx + a - mx) + Math.abs(ty + b - my); if (!best || d < best.d) best = { x: tx + a, y: ty + b, d }; }
      if (!best) return; tx = best.x; ty = best.y;
    }
    const key = tx + ',' + ty; this.target = [tx, ty];
    if (key !== this.fieldKey) { this.field = this.w.field(tx, ty, !!this.noCrawl, !!this.climber); this.fieldKey = key; }
  }
  stunFor(sec) { this.state = S.STUNNED; this.stun = sec; this.sound.stunned(); }
  place() { this.mesh.position.set(this.x, (this.mesh.userData.floatY || 0) + (this.y || 0), this.z); this.mesh.rotation.y = this.yaw; }
  // climbers: feet follow prop tops, ladders and upper tube runs; start the hop a little before the edge
  stepY(dt) {
    const w = this.w, here = w.hostileGround(this.x, this.z), ahead = w.hostileGround(this.x + Math.sin(this.yaw) * 0.6, this.z + Math.cos(this.yaw) * 0.6);
    const gy = this.speed > 0.2 && ahead > here ? ahead : here, y = this.y || 0;
    this.vaulting = gy > y + 0.05; this.y = y + Math.max(-7 * dt, Math.min(3.2 * dt, gy - y));
    if (this.vaulting && !this.wasVault && gy - y > 0.3) this.sound.step?.(0.08); this.wasVault = this.vaulting;
  }

  // follow the BFS distance field toward this.target, one tile centre at a time
  move(dt, speed, chaseDirect, p, onStep) {
    if (!this.target || speed <= 0) { this.speed = 0; return; }
    const w = this.w; const [mx, my] = w.tile(this.x, this.z); const [tx, ty] = this.target;
    if (this.field[mx + my * w.W] < 0) { this.speed = 0; this.target = null; return; }   // no route (e.g. target only reachable through a tube)
    this.crawl = w.isTube(mx, my); if (this.crawl) speed *= 0.5;
    if (this.climber) {   // slower over obstacles: vaulting props, climbing ladders
      this.climbing = w.tubeKind(mx, my) === 'lad'; if (this.climbing) speed *= 0.8;   // ×0.5 crawl ×0.8 = 0.4
      const yaw = this.yaw, [ax, ay] = w.tile(this.x + Math.sin(yaw) * 0.8, this.z + Math.cos(yaw) * 0.8);
      if (w.grid[my]?.[mx] === 2 || w.grid[ay]?.[ax] === 2) speed *= 0.55;
    }
    let wx, wz;
    if (mx === tx && my === ty) { const c = w.center(tx, ty); wx = c[0]; wz = c[1]; if (chaseDirect) { wx = p.x; wz = p.z; } }
    else {
      const here = this.field[mx + my * w.W]; let bestN = null;
      if (here >= 0) for (const [a, b] of DIRS) {
        const nx = mx + a, ny = my + b; if (nx < 0 || ny < 0 || nx >= w.W || ny >= w.H) continue;
        const v = this.field[nx + ny * w.W]; if (v >= 0 && v < here && (!bestN || v < bestN.v)) bestN = { nx, ny, v };
      }
      if (bestN) { const c = w.center(bestN.nx, bestN.ny); wx = c[0]; wz = c[1]; } else { const c = w.center(tx, ty); wx = c[0]; wz = c[1]; }
    }
    const [mcx, mcz] = w.center(mx, my);
    let mdx = wx - this.x, mdz = wz - this.z;
    if (Math.abs(mdx) > 0.05 && Math.abs(mdz) > 0.05 && !(chaseDirect && mx === tx && my === ty)) { if (Math.abs(mdx) > Math.abs(mdz)) mdz = mcz - this.z; else mdx = mcx - this.x; }
    const md = Math.hypot(mdx, mdz) || 1, sp = this.roar > 0 ? speed * 0.25 : speed, step = Math.min(sp * dt, md);
    this.x += mdx / md * step; this.z += mdz / md * step; this.speed = sp;
    this.stepD = (this.stepD || 0) + step; if (this.stepD > 1.5) { this.stepD = 0; onStep?.(this); }
    this.yaw += wrapA(Math.atan2(mdx, mdz) - this.yaw) * Math.min(1, dt * 7);
  }
  seesPlayer(p, range, fov = 1.25) {
    const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
    if (d > range || !this.w.los(this.x, this.z, p.x, p.z)) return false;
    if (d < 4) return true;
    return Math.abs(wrapA(Math.atan2(dx, dz) - this.yaw)) < fov;
  }
}

// ------------------------------------------------------------------
// Hunter: patrol / investigate noise / chase by sight / search. Used by Gronk, crazed crew, slimelings.
// ------------------------------------------------------------------
const HUNTERS = {
  gronk: { name: 'Gronk', model: () => MODELS.gronk(), base: 2.3, baseDeck: 0.12, chase: 4.1, chaseDeck: 0.16, chaseMax: 5.2, sight: 20, sightCrouch: 13, hear: 1, dmg: 34, atkCd: 2.5, atkRange: 1.25, hitY: 1.5, hitR: 0.8, reach: 1.7, noCrawl: true, roarOnSpot: true, spawnMsg: 'The ship shudders. Something heavy is moving on this deck…' },
  crazed: { name: 'Space-Madness Crewman', model: (o) => MODELS.crazed(o), base: 2.0, baseDeck: 0.06, chase: 4.4, chaseDeck: 0.08, chaseMax: 5.3, sight: 14, sightCrouch: 9, hear: 1.2, dmg: 16, atkCd: 1.0, atkRange: 1.15, hitY: 1.2, hitR: 0.55, climber: true, roarOnSpot: 'shriek', spawnMsg: 'Somewhere nearby, someone is laughing. It is not a happy laugh.' },
  slimeling: { name: 'Slimeling Impostor', model: (o) => MODELS.slimeling(o), base: 2.6, baseDeck: 0.05, chase: 4.6, chaseDeck: 0.05, chaseMax: 5.2, sight: 16, sightCrouch: 10, hear: 1.2, dmg: 20, atkCd: 1.4, atkRange: 1.3, hitY: 1.2, hitR: 0.7, roarOnSpot: 'shriek', spawnMsg: '' },
};

export class Hunter extends Enemy {
  constructor(world, spawnTile, deck, delay, scene, sound, type = 'gronk', opts = {}) {
    const cfg = { ...HUNTERS[type], ...(opts.cfg || {}) }; super(world, spawnTile, deck, delay, scene, sound, cfg.model(opts));
    this.cfg = cfg; this.kind = type; this.name = cfg.name; this.noCrawl = !!cfg.noCrawl; this.climber = !!cfg.climber; this.y = 0; this.hitY = cfg.hitY; this.hitR = cfg.hitR;
    this.baseSpeed = cfg.base + Math.min(deck, 8) * cfg.baseDeck; this.chaseSpeed = Math.min(cfg.chase + deck * cfg.chaseDeck, cfg.chaseMax);
    this.growlT = 3 + Math.random() * 4; this.huntT = 0; this.pulse = 16 + Math.random() * 10;
  }
  // space madness: hunt the other crew on this deck first; you only matter once they're gone (or if you get too close)
  stalk(dt, p, dist, game) {
    const prey = game.preyFor?.(this); if (!prey) return false;
    if (dist < 3.5 && this.w.los(this.x, this.z, p.x, p.z)) return false;
    const d = Math.hypot(prey.x - this.x, prey.z - this.z), [tx, ty] = this.w.tile(prey.x, prey.z);
    this.setTarget(tx, ty); this.state = S.INVESTIGATE; this.timer = 5;
    if (this.preyId !== prey.id) { this.preyId = prey.id; this.sound.shriek(Math.max(0.04, 0.3 - dist * 0.01)); this.roar = 0.5; }
    if (this.attacking > 0) this.speed = 0;
    else this.move(dt, d < 9 ? this.chaseSpeed * 0.9 : this.baseSpeed + 0.7, d < 2.5, prey, (e) => game.onEnemyStep(e, dist));
    if (d < 1.15 && this.attackCd <= 0) { this.attackCd = 3; this.attacking = 1.2; game.killNpc(prey, this); }
    this.growlT -= dt; if (this.growlT <= 0) { this.growlT = 3 + Math.random() * 4; if (dist < 30) this.sound.mutter(Math.max(0.03, 0.14 - dist * 0.004)); }
    return true;
  }
  pickPatrol(p) {
    const w = this.w, open = w.d.openTiles; this.huntT = 0; let best = null;
    for (let i = 0; i < 12; i++) {
      const t = open[Math.floor(Math.random() * open.length)]; if (w.grid[t[1]][t[0]] !== 0) continue;
      const toP = Math.hypot(t[0] - p.x / TS, t[1] - p.z / TS), score = Math.random() * 6 + (Math.random() < 0.5 ? -toP * 0.6 : 0);
      if (!best || score > best.s) best = { t, s: score };
    }
    if (best) this.setTarget(best.t[0], best.t[1]);
  }
  update(dt, p, noiseR, crouch, game) {
    if (this.dead) return;
    this.t += dt; const cfg = this.cfg;
    if (this.state === S.DORMANT) {
      this.delay -= dt;
      if (this.delay <= 0) { this.state = S.PATROL; this.mesh.visible = true; this.pickPatrol(p); if (cfg.spawnMsg) game.say(cfg.spawnMsg, 'warn'); this.sound.roar(0.1); }
      return;
    }
    this.attackCd -= dt; this.attacking -= dt;
    const dx = p.x - this.x, dz = p.z - this.z, dist = Math.hypot(dx, dz); let speed = 0;
    if (this.state === S.STUNNED) {
      this.stun -= dt;
      if (this.stun <= 0) { this.state = S.SEARCH; this.timer = 7; const [tx, ty] = this.w.tile(p.x, p.z); this.setTarget(tx, ty); }
    } else if (!(this.mad && this.stalk(dt, p, dist, game))) {
      const sees = this.seesPlayer(p, crouch ? cfg.sightCrouch : cfg.sight);
      if (sees) {
        if (this.state !== S.CHASE) { this.roar = cfg.roarOnSpot === true ? 1.1 : 0.5; cfg.roarOnSpot === true ? this.sound.roar(Math.max(0.1, 0.35 - dist * 0.01)) : this.sound.shriek(Math.max(0.1, 0.3 - dist * 0.01)); game.onEnemySpotted(this); }
        this.state = S.CHASE; this.timer = 5; const [tx, ty] = this.w.tile(p.x, p.z); this.setTarget(tx, ty);
      } else if (this.state === S.CHASE) { this.timer -= dt; if (this.timer <= 0) { this.state = S.SEARCH; this.timer = 6; } }
      this.pulse -= dt;
      if (this.pulse <= 0 && this.state === S.PATROL) { // periodically sniffs you out, so camping never works
        this.pulse = 22 + Math.random() * 10; this.state = S.INVESTIGATE; this.timer = 10;
        const [tx, ty] = this.w.tile(p.x + (Math.random() - 0.5) * 10, p.z + (Math.random() - 0.5) * 10);
        if (this.w.grid[ty]?.[tx] === 0) this.setTarget(tx, ty); else { const [a, b] = this.w.tile(p.x, p.z); this.setTarget(a, b); }
      }
      if (this.state !== S.CHASE && noiseR > 0) {
        const eff = (this.w.los(this.x, this.z, p.x, p.z) ? noiseR : noiseR * 0.65) * cfg.hear;
        if (dist < eff) { this.state = S.INVESTIGATE; this.timer = 8; const [tx, ty] = this.w.tile(p.x, p.z); this.setTarget(tx, ty); }
      }
      if (this.state === S.SEARCH || this.state === S.INVESTIGATE) { this.timer -= dt; if (this.timer <= 0) { this.state = S.PATROL; this.target = null; } }
      const [mx, my] = this.w.tile(this.x, this.z);
      if (this.state === S.PATROL) { this.huntT += dt; if (!this.target || (mx === this.target[0] && my === this.target[1]) || this.huntT > 25) this.pickPatrol(p); speed = this.baseSpeed; }
      else if (this.state === S.INVESTIGATE) speed = this.baseSpeed + 0.8;
      else if (this.state === S.SEARCH) {
        speed = this.baseSpeed + 0.9;
        if (this.target && mx === this.target[0] && my === this.target[1]) {
          const nb = DIRS.map(([a, b]) => [mx + a, my + b]).filter(([a, b]) => this.w.grid[b]?.[a] === 0);
          if (nb.length) { const t = nb[Math.floor(Math.random() * nb.length)]; this.setTarget(t[0], t[1]); }
        }
      } else if (this.state === S.CHASE) speed = this.chaseSpeed;
      this.move(dt, speed, this.state === S.CHASE, p, (e) => game.onEnemyStep(e, dist));
      if (speed === 0) this.speed = 0;
      const high = (p.y || 0) - (this.y || 0) > (cfg.reach ?? 1.1);
      if (dist < cfg.atkRange && this.attackCd <= 0 && !high) { this.attackCd = cfg.atkCd; this.attacking = 0.5; this.state = S.SEARCH; this.timer = 4; game.hitPlayer(this, cfg.dmg); }
      // perched out of reach: it claws at your ankles, then hauls you down
      if (high && dist < cfg.atkRange + 1.3) { this.campT = (this.campT || 0) + dt; if (this.campT > 1.8 && this.attackCd <= 0) { this.campT = 0; this.attackCd = cfg.atkCd; this.attacking = 0.5; game.dragDown?.(this); } } else this.campT = 0;
      this.growlT -= dt;
      if (this.growlT <= 0) { this.growlT = 4 + Math.random() * 6; if (dist < 28) (this.kind === 'gronk' ? this.sound.growl(Math.max(0.03, 0.14 - dist * 0.004)) : this.sound.mutter(Math.max(0.03, 0.12 - dist * 0.004))); }
    }
    if (this.roar > 0) this.roar -= dt;
    if (this.climber) this.stepY(dt);
    this.place();
    this.model.tick(dt, this.state === S.STUNNED ? 0 : this.speed, { stunned: this.state === S.STUNNED, roaring: this.roar > 0, attacking: this.attacking > 0, crawl: this.crawl, climb: this.climbing, vault: this.vaulting, look: this.state === S.CHASE || dist < 8 ? wrapA(Math.atan2(dx, dz) - this.yaw) : undefined });
  }
}

// ------------------------------------------------------------------
// Compliance Drone: slow, relentless, knows where you are, adapts to the zapper after one hit.
// ------------------------------------------------------------------
export class Drone extends Enemy {
  constructor(world, spawnTile, deck, delay, scene, sound) {
    super(world, spawnTile, deck, delay, scene, sound, MODELS.drone());
    this.kind = 'drone'; this.name = 'Compliance Drone'; this.noCrawl = true; this.hitY = 1.4; this.hitR = 0.9; this.adapted = false;
    this.speedV = 1.7 + Math.min(deck, 8) * 0.07; this.whirT = 2; this.retarget = 0;
    const eye = new THREE.PointLight(0x40ff60, 1.5, 6, 2); eye.position.set(0.06, 1.82, 0.3); this.mesh.add(eye); this.eye = eye;
  }
  stunFor(sec, game) {
    if (this.adapted) { this.sound.denied(); this.state = S.STUNNED; this.stun = 0.5; return 'adapted'; }
    this.adapted = true; this.state = S.STUNNED; this.stun = sec; this.sound.stunned(); return 'first';
  }
  update(dt, p, noiseR, crouch, game) {
    this.t += dt;
    if (this.state === S.DORMANT) { this.delay -= dt; if (this.delay <= 0) { this.state = S.CHASE; this.mesh.visible = true; game.say('Compliance Drone online. Resistance is… mildly discouraged.', 'warn'); this.sound.whir(0.2); } return; }
    this.attackCd -= dt; this.attacking -= dt;
    const dx = p.x - this.x, dz = p.z - this.z, dist = Math.hypot(dx, dz);
    if (this.state === S.STUNNED) { this.stun -= dt; if (this.stun <= 0) this.state = S.CHASE; this.speed = 0; }
    else {
      this.retarget -= dt; if (this.retarget <= 0) { this.retarget = 0.6; const [tx, ty] = this.w.tile(p.x, p.z); this.setTarget(tx, ty); }
      this.move(dt, this.speedV, dist < 3, p, (e) => game.onEnemyStep(e, dist));
      if (dist < 1.4 && this.attackCd <= 0 && (p.y || 0) < 1.3) { this.attackCd = 2.8; this.attacking = 0.7; game.hitPlayer(this, 26); game.drainStamina?.(45); }
      this.whirT -= dt; if (this.whirT <= 0) { this.whirT = 2.5 + Math.random() * 2; if (dist < 26) this.sound.whir(Math.max(0.04, 0.16 - dist * 0.005)); }
    }
    this.eye.intensity = this.state === S.STUNNED ? 0 : 1.2 + Math.sin(this.t * 6) * 0.4;
    this.place();
    this.eye.color.set(this.adapted ? 0xffa030 : 0x40ff60);
    this.model.tick(dt, this.speed, { stunned: this.state === S.STUNNED, attacking: this.attacking > 0, adapted: this.adapted });
  }
}

// ------------------------------------------------------------------
// Rogue Hologram "Mr. Grinsworth": walks through walls, but freezes while you are looking at it.
// ------------------------------------------------------------------
let holoMat = null;
function phantomMaterial() { return holoMat || (holoMat = holoMaterial(0xff3fd0, 0.8)); }
export class Phantom extends Enemy {
  constructor(world, spawnTile, deck, delay, scene, sound) {
    super(world, spawnTile, deck, delay, scene, sound, MODELS.phantom());
    this.kind = 'phantom'; this.name = 'Mr. Grinsworth (rogue hologram)'; this.hitY = 1.3; this.hitR = 0.8;
    this.seen = false; this.unseenT = 0; this.mesh.userData.floatY = 0.06; this.giggleT = 3;
    this.glow = new THREE.PointLight(0xff3fd0, 3, 8, 2); this.glow.position.set(0, 1.2, 0); this.mesh.add(this.glow);
    // glitch-teleport: a tearing pink column of scanlines at the point it leaves and at the point it lands
    const col = new THREE.CylinderGeometry(0.5, 0.5, 2.4, 14, 1, true); col.translate(0, 1.2, 0);
    this.tpM = new THREE.MeshBasicMaterial({ color: 0xff3fd0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, wireframe: true });
    this.tpOut = new THREE.Mesh(col, this.tpM); this.tpIn = new THREE.Mesh(col, this.tpM); this.tpOut.visible = this.tpIn.visible = false; this.tpOut.frustumCulled = this.tpIn.frustumCulled = false; this.tpT = 0; scene.add(this.tpOut, this.tpIn);
  }
  tpFx(dt) {
    if (this.tpT > 0) { this.tpT -= dt; const k = Math.max(0, this.tpT / 0.6); this.tpM.opacity = k * 0.55; for (const m of [this.tpOut, this.tpIn]) { m.visible = k > 0; m.scale.set(1 + (1 - k) * 0.6, 0.4 + k * 0.6 + Math.random() * 0.2, 1 + (1 - k) * 0.6); m.rotation.y += dt * 9; } }
    else if (this.tpOut.visible) this.tpOut.visible = this.tpIn.visible = false;
  }
  stunFor(sec) { // banished back into the projector for a while
    this.sound.zap(); this.state = S.DORMANT; this.delay = 12 + sec; this.mesh.visible = false; this.glow.intensity = 0; this.unseenT = 0;
    const open = this.w.d.openTiles.filter(([x, y]) => this.w.grid[y][x] === 0); const t = open[Math.floor(Math.random() * open.length)]; const c = this.w.center(t[0], t[1]); this.x = c[0]; this.z = c[1];
  }
  update(dt, p, noiseR, crouch, game) {
    this.t += dt;
    if (this.state === S.DORMANT) { this.delay -= dt; if (this.delay <= 0) { this.state = S.CHASE; this.mesh.visible = true; this.glow.intensity = 3; this.relocate(p, 12, 18); game.say('A cheerful voice: "Welcome, valued guest! Please do not look away."', 'warn'); this.sound.giggle(0.2); } return; }
    this.attackCd -= dt; this.attacking -= dt;
    const dx = p.x - this.x, dz = p.z - this.z, dist = Math.hypot(dx, dz);
    // is the player looking at it? (needs line of sight; the hologram itself ignores walls)
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const dot = dist > 0.01 ? (dx * -fx + dz * -fz) / dist : 1;
    this.seen = dot > 0.55 && dist < 30 && this.w.los(p.x, p.z, this.x, this.z);
    let speed = 0;
    if (!this.seen) {
      this.unseenT += dt; speed = (2.3 + Math.min(this.deck, 8) * 0.12 + (dist > 14 ? 1.4 : 0)) * (game.fx?.holoMul || 1);   // holo-playroom safeties
      const nx = dx / (dist || 1), nz = dz / (dist || 1), step = Math.min(speed * dt, dist);
      this.x += nx * step; this.z += nz * step; this.yaw += wrapA(Math.atan2(dx, dz) - this.yaw) * Math.min(1, dt * 6);
      if (this.unseenT > 14 && dist > 16) { this.relocate(p, 9, 13); this.unseenT = 0; }
    } else this.unseenT = 0;
    if (dist < 1.2 && this.attackCd <= 0) { this.attackCd = 2.2; this.attacking = 0.6; game.hitPlayer(this, 20); game.glitch?.(1.2); }
    this.speed = speed;
    this.giggleT -= dt; if (this.giggleT <= 0) { this.giggleT = 5 + Math.random() * 6; if (dist < 22) this.sound.giggle(Math.max(0.05, 0.2 - dist * 0.008)); }
    // flicker like a bad projection; frozen & grinning when watched
    this.mesh.visible = this.seen ? true : (Math.random() > 0.08);
    phantomMaterial().uniforms.uOpacity.value = this.seen ? 0.95 : 0.6 + Math.sin(this.t * 30) * 0.1; this.glitchT = Math.max(0, (this.glitchT || 0) - dt); const gb = this.glitchT > 0 ? this.glitchT / 0.7 : 0;   // re-materialising: the projection tears and stretches for a moment
    phantomMaterial().uniforms.uGlitch.value = Math.max(this.seen ? 0 : 1, gb * 5); this.mesh.scale.set(1 + gb * Math.sin(this.t * 90) * 0.25, 1 + gb * 0.35 * Math.sin(this.t * 55), 1);
    this.glow.intensity = (this.seen ? 4.5 : 2.2) + gb * 9; this.tpFx(dt);
    this.place(); this.mesh.position.y = 0.06 + Math.sin(this.t * 1.7) * 0.04;
    this.model.tick(dt, this.seen ? 0 : 1, { attacking: this.attacking > 0, frozen: this.seen && this.attacking <= 0 });
  }
  relocate(p, rmin, rmax) {
    const open = this.w.d.openTiles.filter(([x, y]) => { if (this.w.grid[y][x] !== 0) return false; const [cx, cz] = this.w.center(x, y); const d = Math.hypot(cx - p.x, cz - p.z); return d > rmin && d < rmax && !this.w.los(cx, cz, p.x, p.z); });
    if (!open.length) return; const t = open[Math.floor(Math.random() * open.length)]; const c = this.w.center(t[0], t[1]); this.tpOut.position.set(this.x, 0, this.z); this.tpIn.position.set(c[0], 0, c[1]); this.tpT = 0.6; this.x = c[0]; this.z = c[1]; this.glitchT = 0.7;
  }
}

// ------------------------------------------------------------------
// Clingon Crawler: waits on the ceiling, drops onto your head, latches on until you shake it off.
// ------------------------------------------------------------------
export class Clinger extends Enemy {
  constructor(world, tile, deck, scene, sound) {
    super(world, tile, deck, 0, scene, sound, MODELS.clinger());
    this.kind = 'clinger'; this.name = 'Clingon Crawler'; this.hitY = 2.4; this.hitR = 0.55; this.quiet = true;
    this.state = S.PATROL; this.mesh.visible = true; this.mode = 'lurk';
    const [tx, ty] = world.tile(this.x, this.z); this.ceil = world.ceilAt(tx, ty);
    this.mesh.rotation.x = Math.PI; this.mesh.position.set(this.x, this.ceil, this.z); this.fall = 0; this.latchT = 0; this.fleeT = 0;
  }
  stunFor() { if (this.dead) return; this.kill(); }
  kill() {
    if (this.dead) return; this.dead = true; const wasHigh = this.mode === 'lurk' || this.mode === 'drop'; this.mesh.visible = false;
    this.game?.bloodAt?.(this.x, wasHigh ? 1.5 : 0.4, this.z, 40); this.sound.squelch(); this.splat(wasHigh);
  }
  // death splat: viscera spray falls to the deck and leaves a lingering stain with a few legs curled in it
  splat(high) {
    if (typeof document === 'undefined' || !this.scene) return; const scene = this.scene, x = this.x, z = this.z, y0 = high ? this.ceil - 0.2 : 0.4;
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const R = Math.random;
    for (let i = 0; i < 26; i++) { const a = R() * 6.3, d = R() * R() * 52, r = 3 + R() * 14 * (1 - d / 64); g.fillStyle = R() < 0.25 ? 'rgba(130,24,34,0.9)' : 'rgba(26,6,12,0.85)'; g.beginPath(); g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(16,4,8,0.9)'; g.lineWidth = 3; for (let i = 0; i < 4; i++) { const a = R() * 6.3; g.beginPath(); g.moveTo(64, 64); g.quadraticCurveTo(64 + Math.cos(a) * 20, 64 + Math.sin(a) * 30, 64 + Math.cos(a + 0.7) * 44, 64 + Math.sin(a + 0.7) * 44); g.stroke(); }
    const tex = new THREE.CanvasTexture(c), mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, opacity: 0 });
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), mat); decal.rotation.x = -Math.PI / 2; decal.rotation.z = R() * 6.3; decal.position.set(x, 0.03, z); decal.renderOrder = 1; scene.add(decal);
    const gm = new THREE.MeshStandardMaterial({ color: 0x3a0a14, roughness: 0.3 }), gibs = [];
    for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.02 + R() * 0.03, 6, 5), gm); m.position.set(x, y0, z); m.userData.v = new THREE.Vector3((R() - 0.5) * 3, R() * 2, (R() - 0.5) * 3); scene.add(m); gibs.push(m); }
    let t = 0, last = performance.now(); const step = (now) => { const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      for (const m of gibs) { if (m.visible && m.position.y > 0.03) { m.userData.v.y -= 9 * dt; m.position.addScaledVector(m.userData.v, dt); } else if (m.visible && t > 3) { scene.remove(m); m.visible = false; } }
      mat.opacity = Math.min(0.9, t * 3) * Math.max(0, 1 - Math.max(0, t - 40) / 20);
      if (t < 60) requestAnimationFrame(step); else { scene.remove(decal); tex.dispose(); mat.dispose(); for (const m of gibs) scene.remove(m); } };
    requestAnimationFrame(step);
  }
  update(dt, p, noiseR, crouch, game) {
    if (this.dead) return; this.t += dt; this.game = game;
    const dx = p.x - this.x, dz = p.z - this.z, dist = Math.hypot(dx, dz);
    if (this.mode === 'lurk') {
      this.mesh.position.set(this.x, this.ceil - 0.02, this.z); this.mesh.rotation.x = Math.PI; this.mesh.rotation.y = this.t * 0.3;
      this.quiet = true;
      if (dist < 2.6 && this.w.los(this.x, this.z, p.x, p.z) && game.canBeAttacked()) { this.mode = 'drop'; this.fall = 0; this.sound.skitter(0.3); this.quiet = false; this.state = S.CHASE; }
      else if (dist < 9 && Math.random() < dt * 0.4) this.sound.skitter(0.06);
    } else if (this.mode === 'drop') {
      this.fall += dt / 0.32; const k = Math.min(1, this.fall);
      this.x += (p.x - this.x) * Math.min(1, dt * 14); this.z += (p.z - this.z) * Math.min(1, dt * 14);
      this.mesh.position.set(this.x, this.ceil + (1.55 - this.ceil) * k, this.z); this.mesh.rotation.x = Math.PI * (1 - k);
      if (k >= 1) { this.mode = 'latched'; this.latchT = 0; game.clingOn(this); }
    } else if (this.mode === 'latched') {
      this.latchT += dt; const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      this.mesh.position.set(p.x + fx * 0.28, 1.5, p.z + fz * 0.28); this.mesh.rotation.set(-Math.PI / 2 + 0.2, p.yaw + Math.PI, 0); this.mesh.visible = true;
      if (!game.isClung()) { this.mode = 'flee'; this.fleeT = 4; this.mesh.rotation.set(0, this.yaw, 0); this.x = p.x; this.z = p.z; this.mesh.position.y = 0; this.yaw = Math.random() * 6.28; }
    } else if (this.mode === 'flee') {
      this.fleeT -= dt; this.x += Math.sin(this.yaw) * 5 * dt; this.z += Math.cos(this.yaw) * 5 * dt;
      if (this.w.solidAt(this.x, this.z)) { this.x -= Math.sin(this.yaw) * 5 * dt; this.z -= Math.cos(this.yaw) * 5 * dt; this.yaw += 2.2; }
      this.mesh.position.set(this.x, 0, this.z); this.mesh.rotation.y = this.yaw; this.quiet = true; this.state = S.PATROL;
      if (this.fleeT <= 0) { this.dead = true; this.mesh.visible = false; }
    }
    this.model.tick(dt, this.mode === 'flee' ? 4 : 0, { latched: this.mode === 'latched', lurk: this.mode === 'lurk' });
  }
}

export function makeEnemy(type, world, tile, deck, delay, scene, sound, opts = {}) {
  switch (type) {
    case 'drone': return new Drone(world, tile, deck, delay, scene, sound);
    case 'phantom': return new Phantom(world, tile, deck, delay, scene, sound);
    case 'clinger': return new Clinger(world, tile, deck, scene, sound);
    default: return new Hunter(world, tile, deck, delay, scene, sound, type, opts);
  }
}
export const THREATS = {
  gronk: 'Gronk — reptilian ambusher. Hunts by sight and sound.',
  drone: 'Compliance Drone — slow, relentless, learns from your zapper.',
  phantom: 'Mr. Grinsworth — rogue hologram. Moves when you look away.',
  crazed: 'Space madness — one crew member at a time loses it, lowest rank first. It hunts the others before you. Two zaps put them down.',
  clinger: 'Clingon Crawlers — they wait on the ceiling.',
  slimeling: 'Slimeling — not who they said they were.',
};
