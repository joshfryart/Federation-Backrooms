import { TS } from './world.js';
import { makeGorn, animateGorn } from './actors.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const S = { DORMANT: 0, PATROL: 1, INVESTIGATE: 2, CHASE: 3, SEARCH: 4, STUNNED: 5 };

export class Gorn {
  constructor(world, spawnTile, deck, delay, scene, sound) {
    this.w = world; this.deck = deck; this.sound = sound;
    this.mesh = makeGorn(); this.mesh.visible = false; scene.add(this.mesh);
    const [cx, cz] = world.center(spawnTile[0], spawnTile[1]);
    this.x = cx; this.z = cz; this.yaw = Math.random() * 6.28;
    this.state = S.DORMANT; this.delay = delay;
    this.target = null; this.field = null; this.fieldKey = '';
    this.timer = 0; this.stun = 0; this.attackCd = 0; this.speed = 0;
    this.roar = 0; this.growlT = 3 + Math.random() * 4;
    this.baseSpeed = 2.3 + Math.min(deck, 8) * 0.12;
    this.chaseSpeed = Math.min(4.1 + deck * 0.16, 5.2);
    this.sawPlayer = false; this.t = 0;
    this.huntT = 0;
  }

  get active() { return this.state !== S.DORMANT; }

  setTarget(tx, ty) {
    const key = tx + ',' + ty;
    this.target = [tx, ty];
    if (key !== this.fieldKey) { this.field = this.w.field(tx, ty); this.fieldKey = key; }
  }

  stunFor(sec) {
    this.state = S.STUNNED; this.stun = sec; this.sound.stunned();
  }

  canSee(p, crouch) {
    const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
    const range = crouch ? 13 : 20;
    if (d > range) return false;
    if (!this.w.los(this.x, this.z, p.x, p.z)) return false;
    if (d < 4) return true;
    const ang = Math.atan2(dx, dz) - this.yaw;
    const a = Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang)));
    return a < 1.25;
  }

  pickPatrol(p) {
    const w = this.w, open = w.d.openTiles;
    this.huntT = 0;
    // bias toward player's area sometimes so the Gorn is a real threat
    let best = null;
    for (let i = 0; i < 12; i++) {
      const t = open[Math.floor(Math.random() * open.length)];
      if (w.grid[t[1]][t[0]] !== 0) continue;
      const toP = Math.hypot(t[0] - p.x / TS, t[1] - p.z / TS);
      const score = Math.random() * 6 + (Math.random() < 0.5 ? -toP * 0.6 : 0);
      if (!best || score > best.s) best = { t, s: score };
    }
    if (best) this.setTarget(best.t[0], best.t[1]);
  }

  update(dt, p, noiseR, crouch, game) {
    this.t += dt;
    if (this.state === S.DORMANT) {
      this.delay -= dt;
      if (this.delay <= 0) {
        this.state = S.PATROL; this.mesh.visible = true; this.pickPatrol(p);
        game.say('The ship shudders. Something heavy is moving on this deck…', 'warn');
        this.sound.roar(0.12);
      }
      return;
    }
    this.attackCd -= dt;
    const dx = p.x - this.x, dz = p.z - this.z, dist = Math.hypot(dx, dz);
    let speed = 0;

    if (this.state === S.STUNNED) {
      this.stun -= dt;
      if (this.stun <= 0) {
        this.state = S.SEARCH; this.timer = 7;
        const [tx, ty] = this.w.tile(p.x, p.z); this.setTarget(tx, ty);
      }
    } else {
      const sees = this.canSee(p, crouch);
      if (sees) {
        if (this.state !== S.CHASE) { this.roar = 1.1; this.sound.roar(Math.max(0.1, 0.35 - dist * 0.01)); game.onGornSpotted(this); }
        this.state = S.CHASE; this.timer = 5;
        const [tx, ty] = this.w.tile(p.x, p.z); this.setTarget(tx, ty);
      } else if (this.state === S.CHASE) {
        this.timer -= dt;
        if (this.timer <= 0) { this.state = S.SEARCH; this.timer = 6; }
      }
      // the Gorn periodically "smells" you out so camping in a corner never works
      this.pulse = (this.pulse ?? (18 + Math.random() * 8)) - dt;
      if (this.pulse <= 0 && (this.state === S.PATROL)) {
        this.pulse = 22 + Math.random() * 10; this.state = S.INVESTIGATE; this.timer = 10;
        const [tx, ty] = this.w.tile(p.x + (Math.random() - 0.5) * 10, p.z + (Math.random() - 0.5) * 10);
        if (this.w.grid[ty]?.[tx] === 0) this.setTarget(tx, ty); else { const [a, b] = this.w.tile(p.x, p.z); this.setTarget(a, b); }
      }
      // noise
      if (this.state !== S.CHASE && noiseR > 0) {
        const eff = this.w.los(this.x, this.z, p.x, p.z) ? noiseR : noiseR * 0.65;
        if (dist < eff) {
          this.state = S.INVESTIGATE; this.timer = 8;
          const [tx, ty] = this.w.tile(p.x, p.z); this.setTarget(tx, ty);
        }
      }
      if (this.state === S.SEARCH || this.state === S.INVESTIGATE) {
        this.timer -= dt;
        if (this.timer <= 0) { this.state = S.PATROL; this.target = null; }
      }
      // pick targets
      const [mx, my] = this.w.tile(this.x, this.z);
      if (this.state === S.PATROL) {
        this.huntT += dt;
        if (!this.target || (mx === this.target[0] && my === this.target[1]) || this.huntT > 25) this.pickPatrol(p);
        speed = this.baseSpeed;
      } else if (this.state === S.INVESTIGATE) speed = this.baseSpeed + 0.8;
      else if (this.state === S.SEARCH) {
        speed = this.baseSpeed + 0.9;
        if (this.target && mx === this.target[0] && my === this.target[1]) { // look around: wander near
          const nb = DIRS.map(([a, b]) => [mx + a, my + b]).filter(([a, b]) => this.w.grid[b]?.[a] === 0);
          if (nb.length) { const t = nb[Math.floor(Math.random() * nb.length)]; this.setTarget(t[0], t[1]); }
        }
      } else if (this.state === S.CHASE) speed = this.chaseSpeed;

      // movement along distance field
      if (this.target && speed > 0) {
        let wx, wz;
        const [tx, ty] = this.target;
        if (mx === tx && my === ty) { const c = this.w.center(tx, ty); wx = c[0]; wz = c[1]; if (this.state === S.CHASE) { wx = p.x; wz = p.z; } }
        else {
          const here = this.field[mx + my * this.w.W];
          let bestN = null;
          if (here >= 0) for (const [a, b] of DIRS) {
            const nx = mx + a, ny = my + b;
            if (nx < 0 || ny < 0 || nx >= this.w.W || ny >= this.w.H) continue;
            const v = this.field[nx + ny * this.w.W];
            if (v >= 0 && v < here && (!bestN || v < bestN.v)) bestN = { nx, ny, v };
          }
          if (bestN) { const c = this.w.center(bestN.nx, bestN.ny); wx = c[0]; wz = c[1]; }
          else { wx = this.w.center(tx, ty)[0]; wz = this.w.center(tx, ty)[1]; }
        }
        // keep to tile-center lane when turning corners
        const [mcx, mcz] = this.w.center(mx, my);
        let mdx = wx - this.x, mdz = wz - this.z;
        if (Math.abs(mdx) > 0.05 && Math.abs(mdz) > 0.05 && !(this.state === S.CHASE && mx === tx && my === ty)) {
          if (Math.abs(mdx) > Math.abs(mdz)) { mdz = mcz - this.z; } else { mdx = mcx - this.x; }
        }
        const md = Math.hypot(mdx, mdz) || 1;
        const sp = this.roar > 0 ? speed * 0.25 : speed;
        const step = Math.min(sp * dt, md);
        this.x += mdx / md * step; this.z += mdz / md * step;
        this.stepD = (this.stepD || 0) + step; if (this.stepD > 1.5) { this.stepD = 0; game.onGornStep?.(this, dist); }
        this.speed = sp;
        const want = Math.atan2(mdx, mdz);
        let da = want - this.yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
        this.yaw += da * Math.min(1, dt * 7);
      } else this.speed = 0;

      // attack
      if (dist < 1.25 && this.attackCd <= 0 && this.state !== S.STUNNED) {
        this.attackCd = 2.5; this.state = S.SEARCH; this.timer = 5;
        game.hitPlayer(this, 34);
      }
      // growl ambience
      this.growlT -= dt;
      if (this.growlT <= 0) { this.growlT = 4 + Math.random() * 6; if (dist < 28) this.sound.growl(Math.max(0.03, 0.14 - dist * 0.004)); }
    }
    if (this.roar > 0) this.roar -= dt;

    // visuals
    const m = this.mesh; m.position.set(this.x, 0, this.z); m.rotation.y = this.yaw;
    const stunned = this.state === S.STUNNED;
    animateGorn(m, stunned ? 0 : this.speed, this.t, this.roar > 0);
    m.rotation.z = stunned ? Math.sin(this.t * 40) * 0.05 : 0;
    m.userData.body.rotation.x = stunned ? 0.35 : 0;
  }
}
