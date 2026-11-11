import * as THREE from 'three';
import { TS } from './world.js';
import { makeGorn, animateGorn, makeCrew, makeSpider, animateSpider } from './actors.js';
import { makeHuman, humansReady, holoMaterial, CREW_KINDS } from './humans.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const S = { DORMANT: 0, PATROL: 1, INVESTIGATE: 2, CHASE: 3, SEARCH: 4, STUNNED: 5 };
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ------------------------------------------------------------------
// Model wrappers: { mesh, tick(dt, speed, flags) }
// ------------------------------------------------------------------
function gronkModel() {
  const mesh = makeGorn(); let t = 0;
  return { mesh, tick(dt, speed, f) { t += dt; animateGorn(mesh, f.stunned ? 0 : speed, t, f.roaring); mesh.rotation.z = f.stunned ? Math.sin(t * 40) * 0.05 : 0; mesh.userData.body.rotation.x = f.stunned ? 0.35 : 0; } };
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
      if (f.frozen) { H.mixer.timeScale = 0; H.update(dt); cfg.tick?.(mesh, H, t, f); return; }
      H.mixer.timeScale = 1;
      if (f.stunned) { stunT += dt; if (stunT < 0.7) H.play(cfg.stun || 'hit_chest', { loop: false, fade: 0.08 }); else H.play(cfg.stunHold || 'crouch_idle', { fade: 0.35 }); }
      else {
        stunT = 0;
        if (f.attacking) { if (!atk) H.play(cfg.attack || 'punch_cross', { loop: false, fade: 0.06, restart: true, speed: cfg.attackSpeed || 1.3 }); atk = true; }
        else {
          atk = false;
          if (f.crawl && speed > 0.2 && H.has('crouch_fwd')) H.play('crouch_fwd', { speed: Math.max(0.8, speed / 1.2), fade: 0.2 });
          else if (speed > (cfg.runAt ?? 3.4)) H.play(cfg.run || 'sprint', { speed: Math.max(0.7, speed / (cfg.runRef ?? 5.2)), fade: 0.2 });
          else if (speed > (cfg.jogAt ?? 2.4)) H.play(cfg.jog || 'jog', { speed: Math.max(0.7, speed / (cfg.jogRef ?? 3.0)), fade: 0.25 });
          else if (speed > 0.25) H.play(cfg.walk || 'walk', { speed: Math.max(0.6, speed / (cfg.walkRef ?? 1.5)), fade: 0.25 });
          else H.play(cfg.idle || 'idle', { fade: 0.3 });
        }
      }
      H.update(dt); cfg.tick?.(mesh, H, t, f);
    },
  };
}
const CRAZED_FACE = { JawDrop: 0.75, LeftBrowDown: 1, RightBrowDown: 1, UpperLipUp: 0.9, NoseWrinkler: 1, LeftUpperLidOpen: 1, RightUpperLidOpen: 1 };
export const MODELS = {
  gronk: () => gronkModel(),
  crazed: (o = {}) => humanModel({ bloody: 0.8, pale: 0.55, rank: Math.floor(Math.random() * 3), ...(o.human || {}) }, { face: CRAZED_FACE, attack: 'punch_cross', tick(mesh, H, t) { H.lookYaw = Math.sin(t * 7) * 0.25 + Math.sin(t * 2.3) * 0.3; H.face({ JawDrop: 0.55 + Math.abs(Math.sin(t * 5)) * 0.45 }); } }, () => crewFallback(0xb02a20)),
  slimeling: () => humanModel({ slime: true, bloody: 0.35 }, { face: { ...CRAZED_FACE, JawDrop: 1 }, attack: 'punch_jab', walk: 'jog', walkRef: 3, tick(mesh, H, t) { H.inner.scale.x = H.inner.scale.z * (1 + Math.sin(t * 9) * 0.03); } }, () => crewFallback(0x30a050)),
  drone: () => humanModel({ kind: 'suit', height: 2.02, tint: 0x4e5a56 }, { walk: 'walk_formal', walkRef: 1.25, jogAt: 99, runAt: 99, attack: 'punch_jab', attackSpeed: 0.9, stun: 'hit_head', stunHold: 'idle', init: droneKit }, () => crewFallback(0x5a6660)),
  phantom: () => humanModel({ kind: 'crew_m', height: 1.86, material: phantomMaterial(), shadow: false }, { idle: 'dance', walk: 'dance', jog: 'dance', run: 'dance', attack: 'punch_jab', face: { MouthLeftPullUp: 1, RightBrowDown: 0, MouthRightPullUp: 1, JawDrop: 0.35, LeftUpperLidOpen: 1, RightUpperLidOpen: 1 } }, () => crewFallback(0xff3fd0)),
  clinger: () => { const mesh = makeSpider(); let t = 0; return { mesh, tick(dt, speed, f) { t += dt; animateSpider(mesh, t, speed, f.latched); } }; },
};
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
}

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
    } else if (this.w.tubeKind(tx, ty) === 'up') {   // quarry is in an upper run: crawl to the foot of the ladder and wait
      const t = this.w.d.tubes.find(t => t.tiles.some(([x, y]) => x === tx && y === ty)); [tx, ty] = t.tiles[t.ladder];
    }
    if (this.w.grid[ty]?.[tx] !== 0) {   // player is on top of a prop (or in a wall tile): aim for the nearest open neighbour instead
      let best = null; const [mx, my] = this.w.tile(this.x, this.z);
      for (const [a, b] of DIRS) { if (this.w.grid[ty + b]?.[tx + a] !== 0) continue; const d = Math.abs(tx + a - mx) + Math.abs(ty + b - my); if (!best || d < best.d) best = { x: tx + a, y: ty + b, d }; }
      if (!best) return; tx = best.x; ty = best.y;
    }
    const key = tx + ',' + ty; this.target = [tx, ty];
    if (key !== this.fieldKey) { this.field = this.w.field(tx, ty, !!this.noCrawl); this.fieldKey = key; }
  }
  stunFor(sec) { this.state = S.STUNNED; this.stun = sec; this.sound.stunned(); }
  place() { this.mesh.position.set(this.x, this.mesh.userData.floatY || 0, this.z); this.mesh.rotation.y = this.yaw; }

  // follow the BFS distance field toward this.target, one tile centre at a time
  move(dt, speed, chaseDirect, p, onStep) {
    if (!this.target || speed <= 0) { this.speed = 0; return; }
    const w = this.w; const [mx, my] = w.tile(this.x, this.z); const [tx, ty] = this.target;
    if (this.field[mx + my * w.W] < 0) { this.speed = 0; this.target = null; return; }   // no route (e.g. target only reachable through a tube)
    this.crawl = w.isTube(mx, my); if (this.crawl) speed *= 0.5;
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
  crazed: { name: 'Space-Madness Crewman', model: (o) => MODELS.crazed(o), base: 2.0, baseDeck: 0.06, chase: 4.4, chaseDeck: 0.08, chaseMax: 5.3, sight: 14, sightCrouch: 9, hear: 1.2, dmg: 16, atkCd: 1.0, atkRange: 1.15, hitY: 1.2, hitR: 0.55, roarOnSpot: 'shriek', spawnMsg: 'Somewhere nearby, someone is laughing. It is not a happy laugh.' },
  slimeling: { name: 'Slimeling Impostor', model: () => MODELS.slimeling(), base: 2.6, baseDeck: 0.05, chase: 4.6, chaseDeck: 0.05, chaseMax: 5.2, sight: 16, sightCrouch: 10, hear: 1.2, dmg: 20, atkCd: 1.4, atkRange: 1.3, hitY: 1.2, hitR: 0.7, roarOnSpot: 'shriek', spawnMsg: '' },
};

export class Hunter extends Enemy {
  constructor(world, spawnTile, deck, delay, scene, sound, type = 'gronk', opts = {}) {
    const cfg = { ...HUNTERS[type], ...(opts.cfg || {}) }; super(world, spawnTile, deck, delay, scene, sound, cfg.model(opts));
    this.cfg = cfg; this.kind = type; this.name = cfg.name; this.noCrawl = !!cfg.noCrawl; this.hitY = cfg.hitY; this.hitR = cfg.hitR;
    this.baseSpeed = cfg.base + Math.min(deck, 8) * cfg.baseDeck; this.chaseSpeed = Math.min(cfg.chase + deck * cfg.chaseDeck, cfg.chaseMax);
    this.growlT = 3 + Math.random() * 4; this.huntT = 0; this.pulse = 16 + Math.random() * 10;
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
    } else {
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
      const high = (p.y || 0) > (cfg.reach ?? 1.1);
      if (dist < cfg.atkRange && this.attackCd <= 0 && !high) { this.attackCd = cfg.atkCd; this.attacking = 0.5; this.state = S.SEARCH; this.timer = 4; game.hitPlayer(this, cfg.dmg); }
      // perched out of reach: it claws at your ankles, then hauls you down
      if (high && dist < cfg.atkRange + 1.3) { this.campT = (this.campT || 0) + dt; if (this.campT > 1.8 && this.attackCd <= 0) { this.campT = 0; this.attackCd = cfg.atkCd; this.attacking = 0.5; game.dragDown?.(this); } } else this.campT = 0;
      this.growlT -= dt;
      if (this.growlT <= 0) { this.growlT = 4 + Math.random() * 6; if (dist < 28) (this.kind === 'gronk' ? this.sound.growl(Math.max(0.03, 0.14 - dist * 0.004)) : this.sound.mutter(Math.max(0.03, 0.12 - dist * 0.004))); }
    }
    if (this.roar > 0) this.roar -= dt;
    this.place();
    this.model.tick(dt, this.state === S.STUNNED ? 0 : this.speed, { stunned: this.state === S.STUNNED, roaring: this.roar > 0, attacking: this.attacking > 0, crawl: this.crawl });
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
    this.model.tick(dt, this.speed, { stunned: this.state === S.STUNNED, attacking: this.attacking > 0 });
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
    phantomMaterial().uniforms.uOpacity.value = this.seen ? 0.95 : 0.6 + Math.sin(this.t * 30) * 0.1; phantomMaterial().uniforms.uGlitch.value = this.seen ? 0 : 1;
    this.glow.intensity = this.seen ? 4.5 : 2.2;
    this.place(); this.mesh.position.y = 0.06 + Math.sin(this.t * 1.7) * 0.04;
    this.model.tick(dt, this.seen ? 0 : 1, { attacking: this.attacking > 0, frozen: this.seen && this.attacking <= 0 });
  }
  relocate(p, rmin, rmax) {
    const open = this.w.d.openTiles.filter(([x, y]) => { if (this.w.grid[y][x] !== 0) return false; const [cx, cz] = this.w.center(x, y); const d = Math.hypot(cx - p.x, cz - p.z); return d > rmin && d < rmax && !this.w.los(cx, cz, p.x, p.z); });
    if (!open.length) return; const t = open[Math.floor(Math.random() * open.length)]; const c = this.w.center(t[0], t[1]); this.x = c[0]; this.z = c[1];
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
  kill() { this.dead = true; this.mesh.visible = false; this.game?.bloodAt?.(this.mode === 'lurk' ? this.x : this.x, this.mode === 'lurk' ? 1.5 : 0.4, this.z, 40); this.sound.squelch(); }
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
    this.model.tick(dt, this.mode === 'flee' ? 4 : 0, { latched: this.mode === 'latched' });
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
  crazed: 'Space-Madness Crewmen — fast pack hunters.',
  clinger: 'Clingon Crawlers — they wait on the ceiling.',
  slimeling: 'Slimeling — not who they said they were.',
};
