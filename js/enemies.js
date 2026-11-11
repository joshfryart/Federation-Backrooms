import * as THREE from 'three';
import { TS } from './world.js';
import { makeGorn, animateGorn, makeCrew, makeSpider, animateSpider } from './actors.js';
import { has, instance, Anim } from './assets.js';

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
function glbModel(name, opts, fallback) {
  const inst = has(name) ? instance(name, opts) : null;
  if (!inst) return fallback();
  const anim = new Anim(inst.inner, inst.clips); anim.play(['idle']);
  const m = opts.map || {};
  return {
    mesh: inst.root, anim,
    tick(dt, speed, f) {
      if (f.stunned) anim.play(m.stun || ['death'], { loop: false, fade: 0.1 });
      else if (f.attacking) anim.play(m.attack || ['punch', 'attack'], { fade: 0.08 });
      else if (speed > (m.runAt ?? 3.4)) anim.play(m.run || ['run'], { speed: Math.max(0.8, speed / 4.5) });
      else if (speed > 0.25) anim.play(m.walk || ['walk'], { speed: Math.max(0.6, speed / (m.walkRef ?? 2)) });
      else anim.play(m.idle || ['idle']);
      anim.update(dt);
    },
  };
}
function crewFallback(color) { const mesh = makeCrew(color, false, null, { species: 'human' }); return { mesh, tick(dt, speed, f) { mesh.userData.torso.rotation.x = Math.min(0.5, speed * 0.1); } }; }

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
    const key = tx + ',' + ty; this.target = [tx, ty];
    if (key !== this.fieldKey) { this.field = this.w.field(tx, ty); this.fieldKey = key; }
  }
  stunFor(sec) { this.state = S.STUNNED; this.stun = sec; this.sound.stunned(); }
  place() { this.mesh.position.set(this.x, this.mesh.userData.floatY || 0, this.z); this.mesh.rotation.y = this.yaw; }

  // follow the BFS distance field toward this.target, one tile centre at a time
  move(dt, speed, chaseDirect, p, onStep) {
    if (!this.target || speed <= 0) { this.speed = 0; return; }
    const w = this.w; const [mx, my] = w.tile(this.x, this.z); const [tx, ty] = this.target;
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
  gronk: { name: 'Gronk', model: () => gronkModel(), base: 2.3, baseDeck: 0.12, chase: 4.1, chaseDeck: 0.16, chaseMax: 5.2, sight: 20, sightCrouch: 13, hear: 1, dmg: 34, atkCd: 2.5, atkRange: 1.25, hitY: 1.5, hitR: 0.8, roarOnSpot: true, spawnMsg: 'The ship shudders. Something heavy is moving on this deck…' },
  crazed: { name: 'Space-Madness Crewman', model: () => glbModel('zombie', { height: 1.85, tint: 0xd8b8b8, emissive: { color: 0x300000, intensity: 0.4 }, map: { run: ['run'], walk: ['walk'], attack: ['punch'], stun: ['death'], runAt: 3.2, walkRef: 2 } }, () => crewFallback(0xb02a20)), base: 2.0, baseDeck: 0.06, chase: 4.4, chaseDeck: 0.08, chaseMax: 5.3, sight: 14, sightCrouch: 9, hear: 1.2, dmg: 16, atkCd: 1.0, atkRange: 1.15, hitY: 1.2, hitR: 0.55, roarOnSpot: 'shriek', spawnMsg: 'Somewhere nearby, someone is laughing. It is not a happy laugh.' },
  slimeling: { name: 'Slimeling Impostor', model: () => glbModel('alien_big', { height: 2.1, tint: 0x66ff88, emissive: { color: 0x0a4a1a, intensity: 0.8 }, map: { run: ['run'], walk: ['walk'], attack: ['punch'], stun: ['death'], runAt: 3 } }, () => crewFallback(0x30a050)), base: 2.6, baseDeck: 0.05, chase: 4.6, chaseDeck: 0.05, chaseMax: 5.2, sight: 16, sightCrouch: 10, hear: 1.2, dmg: 20, atkCd: 1.4, atkRange: 1.3, hitY: 1.2, hitR: 0.7, roarOnSpot: 'shriek', spawnMsg: '' },
};

export class Hunter extends Enemy {
  constructor(world, spawnTile, deck, delay, scene, sound, type = 'gronk') {
    const cfg = HUNTERS[type]; super(world, spawnTile, deck, delay, scene, sound, cfg.model());
    this.cfg = cfg; this.kind = type; this.name = cfg.name; this.hitY = cfg.hitY; this.hitR = cfg.hitR;
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
      if (dist < cfg.atkRange && this.attackCd <= 0) { this.attackCd = cfg.atkCd; this.attacking = 0.5; this.state = S.SEARCH; this.timer = 4; game.hitPlayer(this, cfg.dmg); }
      this.growlT -= dt;
      if (this.growlT <= 0) { this.growlT = 4 + Math.random() * 6; if (dist < 28) (this.kind === 'gronk' ? this.sound.growl(Math.max(0.03, 0.14 - dist * 0.004)) : this.sound.mutter(Math.max(0.03, 0.12 - dist * 0.004))); }
    }
    if (this.roar > 0) this.roar -= dt;
    this.place();
    this.model.tick(dt, this.state === S.STUNNED ? 0 : this.speed, { stunned: this.state === S.STUNNED, roaring: this.roar > 0, attacking: this.attacking > 0 });
  }
}

// ------------------------------------------------------------------
// Compliance Drone: slow, relentless, knows where you are, adapts to the zapper after one hit.
// ------------------------------------------------------------------
export class Drone extends Enemy {
  constructor(world, spawnTile, deck, delay, scene, sound) {
    super(world, spawnTile, deck, delay, scene, sound, glbModel('robot_large', { height: 2.5, tint: 0x6a7a74, emissive: { color: 0x40ff60, intensity: 0.35 }, map: { run: ['walk'], walk: ['walk'], attack: ['attack'], stun: ['death'], walkRef: 1.6 } }, () => crewFallback(0x5a6660)));
    this.kind = 'drone'; this.name = 'Compliance Drone'; this.hitY = 1.4; this.hitR = 0.9; this.adapted = false;
    this.speedV = 1.7 + Math.min(deck, 8) * 0.07; this.whirT = 2; this.retarget = 0;
    const eye = new THREE.PointLight(0x40ff60, 1.5, 6, 2); eye.position.set(0, 2.0, 0.35); this.mesh.add(eye); this.eye = eye;
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
      if (dist < 1.4 && this.attackCd <= 0) { this.attackCd = 2.8; this.attacking = 0.7; game.hitPlayer(this, 26); game.drainStamina?.(45); }
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
let holoMat = null, scanTex = null;
function phantomMaterial() {
  if (holoMat) return holoMat;
  const c = document.createElement('canvas'); c.width = 4; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 4, 64); g.fillStyle = '#000'; g.fillRect(0, 0, 4, 22);
  scanTex = new THREE.CanvasTexture(c); scanTex.wrapS = scanTex.wrapT = THREE.RepeatWrapping; scanTex.repeat.set(1, 18);
  holoMat = new THREE.MeshBasicMaterial({ color: 0xff3fd0, transparent: true, opacity: 0.65, alphaMap: scanTex, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  return holoMat;
}
export class Phantom extends Enemy {
  constructor(world, spawnTile, deck, delay, scene, sound) {
    const mat = phantomMaterial();
    super(world, spawnTile, deck, delay, scene, sound, glbModel('ghost', { height: 1.9, material: mat, map: { run: ['fast_flying'], walk: ['flying_idle'], idle: ['flying_idle'], attack: ['headbutt'], stun: ['death'], runAt: 99, walkRef: 99 } }, () => crewFallback(0xff3fd0)));
    this.kind = 'phantom'; this.name = 'Mr. Grinsworth (rogue hologram)'; this.hitY = 1.3; this.hitR = 0.8;
    this.seen = false; this.unseenT = 0; this.mesh.userData.floatY = 0.35; this.giggleT = 3;
    const grin = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 16, Math.PI), new THREE.MeshBasicMaterial({ color: 0xffffff })); grin.rotation.z = Math.PI; grin.position.set(0, 1.45, 0.3); this.mesh.add(grin);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })); e.position.set(sx * 0.14, 1.62, 0.3); this.mesh.add(e); }
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
      this.unseenT += dt; speed = 2.3 + Math.min(this.deck, 8) * 0.12 + (dist > 14 ? 1.4 : 0);
      const nx = dx / (dist || 1), nz = dz / (dist || 1), step = Math.min(speed * dt, dist);
      this.x += nx * step; this.z += nz * step; this.yaw += wrapA(Math.atan2(dx, dz) - this.yaw) * Math.min(1, dt * 6);
      if (this.unseenT > 14 && dist > 16) { this.relocate(p, 9, 13); this.unseenT = 0; }
    } else this.unseenT = 0;
    if (dist < 1.2 && this.attackCd <= 0) { this.attackCd = 2.2; this.attacking = 0.6; game.hitPlayer(this, 20); game.glitch?.(1.2); }
    this.speed = speed;
    this.giggleT -= dt; if (this.giggleT <= 0) { this.giggleT = 5 + Math.random() * 6; if (dist < 22) this.sound.giggle(Math.max(0.05, 0.2 - dist * 0.008)); }
    // flicker like a bad projection; frozen & grinning when watched
    this.mesh.visible = this.seen ? true : (Math.random() > 0.08);
    holoMat.opacity = this.seen ? 0.85 : 0.5 + Math.sin(this.t * 30) * 0.1; scanTex.offset.y = -this.t * 0.5;
    this.glow.intensity = this.seen ? 4.5 : 2.2;
    this.place(); this.mesh.position.y = 0.35 + Math.sin(this.t * 1.7) * 0.08;
    this.model.tick(dt, this.seen ? 0 : 1, { attacking: this.attacking > 0 });
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
    super(world, tile, deck, 0, scene, sound, (() => { const mesh = makeSpider(); let t = 0; return { mesh, tick(dt, speed, f) { t += dt; animateSpider(mesh, t, speed, f.latched); } }; })());
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

export function makeEnemy(type, world, tile, deck, delay, scene, sound) {
  switch (type) {
    case 'drone': return new Drone(world, tile, deck, delay, scene, sound);
    case 'phantom': return new Phantom(world, tile, deck, delay, scene, sound);
    case 'clinger': return new Clinger(world, tile, deck, scene, sound);
    default: return new Hunter(world, tile, deck, delay, scene, sound, type);
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
