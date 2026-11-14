// Game glue for equipment motions, carrying and carts (Systems Nominal). Data/logic lives in js/equipment.js, meshes in js/carry.js.
//   initHaul(ctx)        once at start-up: ctx = { world, ents (getters), scene, P, G, startWalk, simTileFor, gaitFor, pathField, vmScene, cue, speak }
//   opStart(e) / opHook(e, dt, d) / opEnd(e)   NPC equipment use: poseFor starts an Operator, fidgetStep hands the additive layer to it
//   pushHook(e, w, dt)   called by walkStep for walks started with { push: cart }: slows the pusher, plays 'push', the cart rolls ahead
//   new Haul()           per deck: parked carts in cargo/stores/shuttlebay, NPC hauling jobs, the player's carry / cart pushing
import * as THREE from 'three';
import { Operator, equipFor, equipKey, standPoint, ITEMS, CARTS, HAULERS, carrySlow, handsFor } from './equipment.js';
import { HOLDS, toBones, ambient } from './movement.js';
import { makeItemMesh, holdItem, dropItem, heldIn, tickHeld, makeCart, rollCart, cartLoad, cartUnload } from './carry.js';
import { hash01 } from './clock.js';
import { toolFor, toolScript, HANDHELDS } from './handhelds.js';
import { wearKit, syncWorn } from './kit.js';

let C = null;
export function initHaul(ctx) { C = ctx; }
export const ctx = () => C;
const ang = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const CUE = { beep: 'hum', keys: 'hum', groan: 'sigh', sip: 'hum', clank: 'crack', scan: 'hum', replicate: 'hum' };   // equipment cues -> the voice cue set (js/speech.js)

// ---------------- NPC equipment use ----------------
// where the body goes at its spot: next to (or on / seated at) the prop it faces; snaps there when far from the player, else shuffles over
export function opStart(e) {
  const H = e.mesh?.userData.human; if (!C || !H || !e.simmed || !e.person || e.fake || C.G.mode === 'madness') return false;
  if (e.haul) { H.play('idle', { fade: 0.25 }); H.standing = false; e.walking = false; return true; }
  if (e.returnTo) { H.play('idle', { fade: 0.25 }); H.standing = true; e.walking = false; return true; }   // stepped aside (dodge): wait, the walk back to the spot starts the use script
  const def = equipFor(e.spot), W = C.world; let goal = { x: e.x, z: e.z, yaw: e.mesh.rotation.y, y: def.y || 0 };
  const fa = e.faceAt || (e.opProp && Math.hypot(e.opProp[0] - e.x, e.opProp[1] - e.z) < 2.6 ? e.opProp : null); e.opProp = fa; e.faceAt = null;   // the mesh is turned here (opHook), not by the generic face-the-spot code
  if (fa) { const [tx, ty] = W.tile(fa[0], fa[1]), p = W.d.props.find(q => q.tx === tx && q.ty === ty); if (p) { const [cx, cz] = W.center(tx, ty); goal = standPoint(def, { cx, cz, rot: p.rot || 0 }, { x: e.x, z: e.z }, C.ents.filter(o => o !== e && o.opGoal).map(o => [o.opGoal.x, o.opGoal.z])); } }
  let kind = e.spot; if (def.stance === 'sit' && def.spots && !goal.spot) { kind = 'post'; goal = { x: e.x, z: e.z, yaw: goal.yaw, y: 0 }; }   // every seat taken: stand by instead of sitting on air
  wearKit(e); const tool = toolFor(e.person, equipKey(kind), C.G.runSeed);   // the billet's handheld comes out now and then (js/handhelds.js)
  e.op = new Operator(kind, e.person, C.G.runSeed, { toolSteps: tool ? toolScript(tool) : null }); e.opGoal = goal; e.opHeld = { hand_r: null, hand_l: null }; e.seatDY = null; e.seatT = 0;
  // logical position (e.x/e.z: paths, dodging, line of sight) stays on the walkable tile, as close to the use point as it allows; only the mesh goes onto the use point
  { let [tx, ty] = W.tile(e.x, e.z); if (W.solid(tx, ty)) { const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [tx + a, ty + b]).find(([x, y]) => !W.solid(x, y)); if (n) [tx, ty] = n; }
    const [cx, cz] = W.center(tx, ty), k = 0.95; e.opAnchor = [cx + Math.max(-k, Math.min(k, goal.x - cx)), cz + Math.max(-k, Math.min(k, goal.z - cz))]; e.x = e.opAnchor[0]; e.z = e.opAnchor[1]; }
  e.ease = null; { const pd = Math.hypot(C.P.x - e.x, C.P.z - e.z); if (pd > 22 || (pd > 10 && !W.los(C.P.x, C.P.z, e.x, e.z))) { e.mesh.position.x = goal.x; e.mesh.position.z = goal.z; e.mesh.rotation.y = goal.yaw; } }   // out of sight: snap onto the use point; in sight: shuffle over (opHook)
  const o = e.op.update(0); H.play(H.has(o.clip) ? o.clip : 'idle', { fade: 0.3 }); H.standing = false; e.walking = false; e.opClip = o.clip;
  return true;
}
export function opEnd(e) {
  const H = e.mesh?.userData.human; if (H) { for (const h of ['hand_r', 'hand_l']) if (e.opHeld?.[h]) dropItem(H, h); H.add = null; }
  e.op = null; e.opGoal = null; e.opHeld = null; e.seatDY = null; if (e.mesh) { const mp = e.mesh.position, ox = mp.x - e.x, oz = mp.z - e.z, q = ox * ox + oz * oz; mp.y = e.y || 0; if (q > 0.01 && q < 4 && Math.hypot(C.P.x - e.x, C.P.z - e.z) < 22) e.ease = [ox, oz]; else { e.ease = null; mp.x = e.x; mp.z = e.z; } }   // near the player the mesh eases back from the seat / use point (main loop), else it snaps
}
// the additive layer while operating / pushing / carrying. true = handled (fidgetStep returns)
export function opHook(e, dt, d) {
  const H = e.mesh?.userData.human; if (!H || !C) return false;
  if (e.giftT > 0) { e.giftT -= dt; if (e.giftT <= 0 && !e.op?.hold) dropItem(H, 'hand_r'); }
  if (e.walk) {
    if (e.pushing) { H.add = toBones(ambient(e.t || 0, e.person.id)); return true; }
    if (e.carrying) { const it = ITEMS[e.carrying], ch = { ...ambient(e.t || 0, e.person.id) }; for (const [k, v] of Object.entries(HOLDS[it?.pose] || {})) ch[k] = (ch[k] || 0) + v; H.add = toBones(ch); tickHeld(H); return true; }
    return false;
  }
  if (!e.op) return false;
  if (e.cower || e.repairing) { opEnd(e); return false; }
  const o = e.op.update(dt), g = e.opGoal;
  // shuffle onto the use point, then hold it
  const mp = e.mesh.position, dx = g.x - mp.x, dz = g.z - mp.z, dist = Math.hypot(dx, dz);
  if (dist > 0.02) { const s = Math.min(dist, dt * 1.1); mp.x += dx / dist * s; mp.z += dz / dist * s; }
  if (e.opAnchor) { e.x = e.opAnchor[0]; e.z = e.opAnchor[1]; }
  e.mesh.rotation.y += ang((dist > 0.12 ? Math.atan2(dx, dz) : g.yaw) - e.mesh.rotation.y) * Math.min(1, dt * 4);
  const moving = dist > 0.12, clip = moving ? 'walk' : H.has(o.clip) ? o.clip : 'idle';
  H.play(clip, { fade: 0.3, speed: moving ? 0.8 : o.speed }); e.opClip = clip;
  // seat height: after the sitting clip has settled, drop/raise the body so the pelvis sits on the seat
  if (clip === 'sitting_idle') { e.seatT += dt; if (e.seatDY == null && e.seatT > 0.5 && H.bones.pelvis) { const v = H.bones.pelvis.getWorldPosition(new THREE.Vector3()); const seat = (equipFor(e.spot).seat ?? 0.48) + 0.08; e.seatDY = Math.max(-0.2, Math.min(0.7, (v.y - e.mesh.position.y) - seat)); } } else e.seatT = 0;
  const wantY = (g.y || 0) + (e.y || 0) - (clip === 'sitting_idle' && e.seatDY != null ? e.seatDY : 0); e.mesh.position.y += (wantY - e.mesh.position.y) * Math.min(1, dt * 6);
  // additive layer: breathing + held pose + the step's gesture (the fidgeter is suppressed while an operator drives the bones)
  const ch = ambient(e.t || 0, e.person.id); for (const k in o.ch) ch[k] = (ch[k] || 0) + o.ch[k]; H.add = toBones(ch);
  const f = {}; for (const k of e.fidFace || []) f[k] = 0; Object.assign(f, o.face); H.face(f); e.fidFace = Object.keys(o.face);
  // held items follow the script (two-handed items fill both hands)
  for (const [hand, want] of [['hand_r', o.hold], ['hand_l', o.holdL]]) { if (e.opHeld[hand] === want) continue; if (e.opHeld[hand]) dropItem(H, hand); e.opHeld[hand] = null; if (want) { holdItem(H, want, ITEMS[want]?.two ? 'hand_r' : hand); e.opHeld[hand] = want; if (ITEMS[want]?.two) e.opHeld[hand === 'hand_r' ? 'hand_l' : 'hand_r'] = null; } }
  tickHeld(H); syncWorn(e, o.hold);
  if (o.cue && d < 9) try { C.cue?.(e.person, CUE[o.cue] || o.cue); } catch (er) { }
  e.opFx = o.fx || e.opFx; e.opStep = o.step;
  return true;
}

// ---------------- carts ----------------
// keep a cart `reach` ahead of a pusher at (px, pz) heading `yaw`; resolves against walls; returns how far the cart was blocked
function cartFollow(c, px, pz, yaw, dt, k = 3) {
  c.yaw += ang(yaw - c.yaw) * Math.min(1, dt * k); const u = c.mesh.userData, reach = u.handle + 0.45;   // the 'push' clip's hands are ~0.5 m ahead of the root
  const tx = px + Math.sin(c.yaw) * reach, tz = pz + Math.cos(c.yaw) * reach, q = { x: tx, z: tz, y: 0 }; C.world.resolve(q, Math.min(0.45, u.half[0] + 0.05));
  const mv = (q.x - c.x) * Math.sin(c.yaw) + (q.z - c.z) * Math.cos(c.yaw); rollCart(c.mesh, mv); c.x = q.x; c.z = q.z; c.mesh.position.set(c.x, 0, c.z); c.mesh.rotation.y = c.yaw;
  return [q.x - tx, q.z - tz];
}
export function pushHook(e, w, dt) {   // walkStep: pushing borrows the climbing clip path there ('push', 0.23 m/s stride, no fidget) and walks at ~0.7x
  const c = w.opts.push; if (!c?.mesh || !C) return; e.climbing = true; const gt = C.gaitFor(e); e.v = Math.min(e.v || 0, gt.v * 0.7);
  cartFollow(c, e.x, e.z, e.heading ?? e.mesh.rotation.y, dt);
}
const handleOf = (c) => { const h = c.mesh.userData.handle; return [c.x - Math.sin(c.yaw) * h, c.z - Math.cos(c.yaw) * h]; };

export class Haul {
  constructor() {
    this.carts = []; this.jobs = []; this.dropped = []; this.t = 6; this.n = 0; this.vm = null; this.vmId = undefined;
    const P = C.P; P.cart = null; P.pushing = false; P.carryMul = 1; this.seed = (C.G.runSeed ^ (C.G.shipDeck * 7919)) >>> 0; this.park();
  }
  get W() { return C.world; }
  addCart(kind, x, z, yaw, loaded = false) { const mesh = makeCart(kind, loaded); mesh.position.set(x, 0, z); mesh.rotation.y = yaw; C.scene.add(mesh); const c = { mesh, kind, x, z, yaw, pusher: null }; this.carts.push(c); return c; }
  // a few parked carts along the walls of cargo bays, stores and shuttlebays (deterministic per deck)
  park() {
    const W = this.W, d = W.d, used = new Set(); let i = 0;
    for (const r of d.rooms) {
      if (!['cargo', 'stores', 'shuttlebay'].includes(r.type)) continue; const n = 1 + (hash01('park', this.seed, r.x, r.y) < 0.5 ? 1 : 0), cand = [];
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
        if (d.grid[y][x] !== 0 || W.isTube(x, y) || used.has(x + ',' + y)) continue; const walls = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => d.grid[y + b]?.[x + a] === 1); if (walls.length !== 1) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => d.grid[y + b]?.[x + a] === 0 && !d.room[y + b]?.[x + a])) continue;   // not in a doorway
        cand.push([x, y, walls[0]]);
      }
      for (let k = 0; k < n && cand.length; k++) { const j = Math.floor(hash01('pk', this.seed, r.x, r.y, k) * cand.length), [x, y, [wx, wy]] = cand.splice(j, 1)[0]; used.add(x + ',' + y); const [cx, cz] = W.center(x, y);
        const kind = r.type === 'shuttlebay' && k ? 'tool' : 'cargo'; this.addCart(kind, cx + wx * 0.5, cz + wy * 0.5, Math.atan2(wy, -wx), hash01('ld', this.seed, i++) < 0.6); }
    }
  }
  dispose() { for (const c of this.carts) C.scene.remove(c.mesh); for (const it of this.dropped) C.scene.remove(it.mesh); if (this.vm) C.vmScene?.remove(this.vm); this.carts = []; this.dropped = []; const P = C.P; P.cart = null; P.pushing = false; P.carryMul = 1; }
  tick(dt) { this.jobsStep(dt); this.collide(); this.playerStep(dt); this.vmStep(); }

  // ---- NPC hauling jobs: walk to a cart, grab it, push it along a real path to a destination room, release it, go back ----
  destFor(e, spec) {
    const W = this.W, d = W.d, [ex, ey] = W.tile(e.x, e.z), here = d.room[ey]?.[ex], opts = [];
    for (const to of spec.to) {
      if (to === 'lift' && W.car) { const c = W.car; for (const k of [2, 1]) { const x = c.tx + c.dx * k, y = c.ty + c.dy * k; if (d.grid[y]?.[x] === 0) { opts.push([x, y, 'lift']); break; } } continue; }
      for (const r of d.rooms) { if (r.type !== to || (ex >= r.x && ex < r.x + r.w && ey >= r.y && ey < r.y + r.h)) continue; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (d.grid[y][x] === 0 && !W.isTube(x, y)) opts.push([x, y, to]); }
    }
    if (!opts.length && here) { for (const r of d.rooms) if (ex >= r.x && ex < r.x + r.w && ey >= r.y && ey < r.y + r.h) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (d.grid[y][x] === 0 && Math.abs(x - ex) + Math.abs(y - ey) >= 2) opts.push([x, y, here]); }
    let far = null; for (let k = 0; k < 8 && opts.length; k++) { const o = opts[Math.floor(hash01('dst', this.seed, this.n, k) * opts.length)], f = C.pathField(o[0], o[1]), v = f[ex + ey * W.W]; if (v > 0 && v <= 16) return o; if (v > 0 && !far) far = o; }   // prefer a short haul (<= 16 tiles)
    if (far) return far;
    return null;
  }
  startJob(e, force = false) {
    const spec = HAULERS[e.person.billet] || (force ? { cart: 'cargo', to: ['stores', 'cargo', 'lift'] } : null); if (!spec) return null; const dest = this.destFor(e, spec); if (!dest) return null; this.n++;
    const job = { e, dest, phase: 'go', t: 0, age: 0, kind: spec.cart && (!spec.carry || hash01('ck', this.seed, this.n) < 0.6) ? 'cart' : 'carry', item: spec.carry || 'smallbox' };
    if (e.op) opEnd(e); e.haul = job;
    if (job.kind === 'cart') {
      let c = this.carts.filter(c => !c.pusher && c.kind === spec.cart && Math.hypot(c.x - e.x, c.z - e.z) < 9 && this.W.los(e.x, e.z, c.x, c.z)).sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z))[0];
      if (!c) {   // wheel one out: a fresh cart beside the worker, front pointing away from them
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = e.x + a * 1.5, z = e.z + b * 1.5; if (this.W.los(e.x, e.z, x + a * 0.7, z + b * 0.7) && !this.W.solidAt(x, z)) { c = this.addCart(spec.cart, x, z, Math.atan2(a, b), hash01('ld', this.seed, this.n) < 0.7); break; } }
        if (!c) { e.haul = null; return null; }
      }
      job.cart = c; c.pusher = e; const [hx, hz] = handleOf(c); C.startWalk(e, 0, 0, false, { point: [hx - Math.sin(c.yaw) * 0.45, hz - Math.cos(c.yaw) * 0.45] }); job.walk = e.walk;
    } else { job.phase = 'take'; job.t = 1.0; const H = e.mesh.userData.human; H?.play('interact', { fade: 0.2 }); }
    this.jobs.push(job); return job;
  }
  endJob(job) { const e = job.e, H = e.mesh?.userData.human; if (job.cart) { job.cart.pusher = null; } e.pushing = null; if (e.carrying && H) { dropItem(H, 'hand_r'); } e.carrying = null; e.haul = null; this.jobs.splice(this.jobs.indexOf(job), 1); }
  jobsStep(dt) {
    const ents = C.ents;
    this.t -= dt; if (this.t <= 0) {
      this.t = 16 + hash01('jt', this.seed, this.n) * 22;
      if (this.jobs.length < 2) { const cand = ents.filter(e => e.simmed && e.person && !e.walk && !e.haul && !e.cower && !e.repairing && HAULERS[e.person.billet] && e.mesh?.userData.human); if (cand.length) this.startJob(cand[Math.floor(hash01('who', this.seed, this.n) * cand.length)]); }
    }
    for (const job of [...this.jobs]) {
      const e = job.e, H = e.mesh?.userData.human; job.age += dt;
      if (!ents.includes(e) || job.age > 150 || e.cower || (e.walk && e.walk !== job.walk)) { if (e.walk?.opts.push) e.walk = null; this.endJob(job); continue; }   // someone else (sim, dodge, test) gave them a new walk: drop the job
      if (job.phase === 'go' && !e.walk) { job.phase = 'grab'; job.t = 0.8; e.mesh.rotation.y = job.cart.yaw; H?.play('interact', { fade: 0.2 }); }
      else if (job.phase === 'grab' && (job.t -= dt) <= 0) { job.phase = 'push'; e.pushing = job.cart; e.heading = job.cart.yaw; e.mesh.rotation.y = job.cart.yaw; C.startWalk(e, job.dest[0], job.dest[1], false, { push: job.cart }); job.walk = e.walk; }
      else if (job.phase === 'take' && (job.t -= dt) <= 0) { job.phase = 'carry'; e.carrying = job.item; if (H) holdItem(H, job.item); C.startWalk(e, job.dest[0], job.dest[1], false); job.walk = e.walk; }
      else if ((job.phase === 'push' || job.phase === 'carry') && !e.walk) { job.phase = 'release'; job.t = 0.9; e.pushing = null; if (job.cart) job.cart.pusher = null; H?.play('interact', { fade: 0.2 }); if (e.carrying && H) dropItem(H, 'hand_r'); e.carrying = null; }
      else if (job.phase === 'release' && (job.t -= dt) <= 0) { this.endJob(job); const t = C.simTileFor(e.person, e); if (t) { e.faceAt = t.face || null; C.startWalk(e, t[0], t[1], false); } }
    }
  }
  // carts are solid: shove NPCs and the player out of them (two circles along the cart's length)
  collide() {
    const P = C.P;
    for (const c of this.carts) {
      const u = c.mesh.userData, r = u.half[0] + 0.1, off = Math.max(0, u.half[1] - u.half[0]), pts = [[c.x + Math.sin(c.yaw) * off, c.z + Math.cos(c.yaw) * off], [c.x - Math.sin(c.yaw) * off, c.z - Math.cos(c.yaw) * off]];
      const shove = (o, rad, isP) => { for (const [px, pz] of pts) { const dx = o.x - px, dz = o.z - pz, dd = Math.hypot(dx, dz), need = r + rad; if (dd < need && dd > 1e-4) { o.x = px + dx / dd * need; o.z = pz + dz / dd * need; if (!isP && o.mesh) { o.mesh.position.x = o.x; o.mesh.position.z = o.z; } } } };
      // a pushed cart makes people step aside; a parked cart is bumped out of a walker's way (never a deadlock on a path)
      for (const e of C.ents) { if (e.kind !== 'crew' || !e.mesh || e === c.pusher || Math.hypot(e.x - c.x, e.z - c.z) > 2 || C.world.isTube(...C.world.tile(e.x, e.z))) continue;
        if (c.pusher) { shove(e, 0.25, false); continue; } const before = { x: e.x, z: e.z }; shove(e, 0.25, true); if (e.x !== before.x || e.z !== before.z) { const q = { x: c.x - (e.x - before.x), z: c.z - (e.z - before.z), y: 0 }; e.x = before.x; e.z = before.z; C.world.resolve(q, Math.min(0.45, u.half[0] + 0.05)); c.x = q.x; c.z = q.z; c.mesh.position.set(c.x, 0, c.z); } }
      if (c.pusher !== 'player' && Math.hypot(P.x - c.x, P.z - c.z) < 2 && (P.y || 0) < 0.8) { shove(P, 0.3, true); }
    }
  }

  // ---- the player: carry, drop, load/unload carts, push carts ----
  facing(x, z, max = 1.8, dot = 0.55) { const P = C.P, fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz); return d < max && (dx * fx + dz * fz) / (d || 1) > dot ? d : 0; }
  cartInFront() { let best = null, bd = 9; for (const c of this.carts) { if (c.pusher && c.pusher !== 'player') continue; const [hx, hz] = handleOf(c), d = Math.min(this.facing(c.x, c.z, 2.0, 0.5) || 9, this.facing(hx, hz, 1.5, 0.3) || 9); if (d < bd) { bd = d; best = c; } } return best; }
  droppedInFront() { let best = null, bd = 9; for (const it of this.dropped) { const d = this.facing(it.x, it.z, 1.9, 0.75); if (d && d < bd) { bd = d; best = it; } } return best; }
  interact() {   // E: let go / grab a cart handle / pick a dropped item back up. true = handled
    const P = C.P, G = C.G;
    if (P.cart) { this.release(); return true; }
    const it = this.droppedInFront(); if (it && (it.inst || !G.carry)) { if (it.inst && !G.kit?.add(it.inst)) { G.say('Your belt is full.', 'warn'); return true; } C.scene.remove(it.mesh); this.dropped.splice(this.dropped.indexOf(it), 1); if (!it.inst) G.carry = it.carry; C.sound?.pickup?.(); G.say(`You pick up: ${it.inst ? it.name : it.carry.name}.`, 'good'); return true; }
    const c = this.cartInFront(); if (c) { if (G.carry && ITEMS[G.carry.item]?.two) { G.say('Your hands are full — [G] put it on the cart first.', 'warn'); return true; } c.pusher = 'player'; P.cart = c; P.pushing = true; G.say(`You take the handle of the ${c.mesh.userData.name}. [E] let go`, 'good'); return true; }
    return false;
  }
  release(msg) { const P = C.P, c = P.cart; if (!c) return; c.pusher = null; P.cart = null; P.pushing = false; C.G.say(msg || 'You let go of the cart.', msg ? 'warn' : ''); }
  putDown() {   // G: onto the cart in front (or the one you push), else on the floor / a prop top in front of you. true = handled
    const G = C.G, P = C.P, cr = G.carry; if (!cr) return false; const c = P.cart || this.cartInFront();
    if (c && (ITEMS[cr.item]?.load || cr.item)) { if (cartLoad(c.mesh, cr.item || 'smallbox')) { c.mesh.userData.names = [...(c.mesh.userData.names || []), cr]; G.carry = null; G.say(`You put ${cr.name} on the cart.`, 'good'); return true; } G.say('The cart is full.', 'warn'); return true; }
    const W = this.W, x = P.x - Math.sin(P.yaw) * 0.85, z = P.z - Math.cos(P.yaw) * 0.85, [tx, ty] = W.tile(x, z); if (W.grid[ty]?.[tx] === 1) return false;
    const top = W.grid[ty]?.[tx] === 2 ? (isFinite(W.topAt(tx, ty)) ? W.topAt(tx, ty) : null) : 0; if (top === null) return false;
    const mesh = makeItemMesh(cr.item || 'default'); mesh.position.set(x, top + (mesh.userData.rest || 0.04), z); mesh.rotation.y = P.yaw; if (mesh.userData.lie) mesh.rotation.z = Math.PI / 2; C.scene.add(mesh);
    this.dropped.push({ mesh, x, z, carry: cr }); G.carry = null; G.say(top ? `You set ${cr.name} down on the ${'surface'}.` : `You put ${cr.name} down.`); return true;
  }
  takeFromCart() {   // R: take the top item off a cart
    const G = C.G, c = C.P.cart || this.cartInFront(); if (!c || G.carry) return false; const id = cartUnload(c.mesh); if (!id) { G.say('The cart is empty.', 'warn'); return true; }
    const names = c.mesh.userData.names || []; const known = names.length && names[names.length - 1].item === id ? names.pop() : null;
    G.carry = known || { name: ITEMS[id]?.name || id, real: '', item: id }; C.sound?.pickup?.(); G.say(`You take ${G.carry.name} off the cart.`, 'good'); return true;
  }
  prompt() {
    const P = C.P, G = C.G, cr = G.carry;
    if (P.cart) return `Pushing the ${P.cart.mesh.userData.name} — [E] let go${cr ? ` · [G] load ${cr.name}` : P.cart.mesh.userData.load.length ? ' · [R] take a load' : ''}`;
    const it = this.droppedInFront(); if (it && (it.inst || !cr)) return `[E] Pick up ${it.inst ? it.name : it.carry.name}`;
    const c = this.cartInFront(); if (c) { const u = c.mesh.userData; return `[E] Push the ${u.name}${cr ? ` · [G] put ${cr.name} on it` : u.load.length ? ` · [R] take ${ITEMS[u.load[u.load.length - 1]]?.name || 'a load'}` : ''}`; }
    return G.kit?.prompt() || '';
  }
  playerStep(dt) {
    const P = C.P, G = C.G, c = P.cart;
    P.carryMul = c ? 0.6 : G.carry ? carrySlow(G.carry.item) : 1;
    if (!c) return;
    if (G.phase !== 'play' || P.mode === 'ladder' || P.mode === 'grapple' || (P.y || 0) > 0.6) { this.release('You lose your grip on the cart.'); return; }
    const before = [c.x, c.z], [bx, bz] = cartFollow(c, P.x, P.z, P.yaw + Math.PI, dt, 4), blocked = Math.hypot(bx, bz);
    if (blocked > 0.04) { P.x -= bx; P.z -= bz; const q = { x: P.x, z: P.z, y: P.y || 0 }; this.W.resolve(q, 0.3); P.x = q.x; P.z = q.z; }   // the cart stops you at walls
    if (blocked > 0.7) this.release('The cart jams against the bulkhead.');
    c.vel = Math.hypot(c.x - before[0], c.z - before[1]) / (dt || 1);
  }
  // the carried item in first person (its own pass, like the zapper), bobbing with your stride
  vmStep() {
    const G = C.G, P = C.P, id = G.carry ? (G.carry.item || 'default') : null; if (!C.vmScene) return;
    if (id !== this.vmId) { if (this.vm) C.vmScene.remove(this.vm); this.vm = null; this.vmId = id; if (id) { const m = makeItemMesh(id), two = ITEMS[id]?.two, g = new THREE.Group(); g.add(m); m.rotation.y = two ? 0.2 : -0.5; if (m.userData.lie) m.rotation.z = Math.PI / 2; g.userData.two = two; m.traverse(o => { if (o.isMesh) o.renderOrder = 10; }); C.vmScene.add(g); this.vm = g; } }
    if (this.vm) { const two = this.vm.userData.two, b = Math.sin((P.bob || 0) * 1.1); this.vm.position.set(two ? 0 : 0.2, (two ? -0.36 : -0.24) + Math.abs(b) * 0.01, two ? -0.62 : -0.48); this.vm.rotation.z = b * 0.02; this.vm.visible = G.phase === 'play' && !P.cart; }
  }
  // talk-menu options for what you carry: give / offer food or drink / treat with a medkit (each has its payoff in trust)
  talkOpts(e, say, D) {
    const G = C.G, cr = G.carry, pr = e.person; if (!cr) return [];
    const it = ITEMS[cr.item] || {}, opts = [], hand = () => { const H = e.mesh?.userData.human; if (H && cr.item && !e.op?.hold && !ITEMS[cr.item]?.two) { holdItem(H, cr.item); e.giftT = 9; } };
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    if (it.heal) opts.push({ label: `Treat their scrapes (${cr.name})`, run: () => { D._bump(pr, 0.08); say(pick(['Ow — thanks. Didn\'t even notice that cut.', 'You carry a medkit? Good thinking.', 'That stings. Thank you.'])); G.say(`You patch up ${pr.short}. (+trust)`, 'good'); cr.uses = (cr.uses ?? 3) - 1; if (cr.uses <= 0) { G.carry = null; G.say('The medkit is used up.', 'warn'); } } });
    const gift = it.gift || 0.06, food = ['cup', 'glass', 'tray', 'ration'].includes(cr.item);
    opts.push({ label: food ? `Offer them the ${cr.name}` : `Give them: ${cr.name}`, run: () => { D._bump(pr, gift); say(food ? pick(['For me? You are a lifesaver.', 'Oh, I have not eaten all watch. Thank you.', 'Now that is a proper officer.']) : pick(['Oh — thanks. I was looking for that.', 'Appreciated.', 'Where did you find this? Thank you.'])); G.say(`You give ${cr.name} to ${pr.short}.${gift > 0.07 ? ' (+trust)' : ''}`, 'good'); hand(); G.carry = null; } });
    return opts;
  }
}
// repair speed multiplier from what you carry (toolbox 1.25, hand tool 1.12)
export const toolBonus = (carry) => ITEMS[carry?.item]?.tool || 1;
export { equipKey, handsFor };
