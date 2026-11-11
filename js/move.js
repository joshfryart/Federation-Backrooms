// Player traversal: momentum running, jump, mantle/vault onto props, slide, wall-run and a grapple line.
// Pure logic on the player state `P` + `world`; main.js owns input, camera, sound and enemy side-effects (via `api`).
import { TS, TUBE_UP } from './world.js';

export const MOVE = {
  gravity: 21, jump: 6.3, walk: 3.3, crouch: 1.7, sprint: 5.7, flowBonus: 1.5, airAccel: 14, groundK: 10,
  height: 1.8, radius: 0.35, mantleReach: 1.55, mantleReachGround: 1.3,
  slideMin: 4.4, slideBoost: 1.6, slideFriction: 4.2, slideTime: 1.15,
  wallTime: 1.25, wallSpeed: 6.4, wallJumpUp: 6.0, wallJumpOut: 4.6,
  grapRange: 17, grapAccel: 55, grapSpeed: 15.5, grapTime: 1.9, grapCooldown: 2.2,
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function resetMover(P) {
  Object.assign(P, { y: 0, vy: 0, vx: 0, vz: 0, grounded: true, mode: 'ground', coyote: 0, jumpBuf: 0, flow: 0, slideT: 0, slideCd: 0,
    wallT: 0, wallSide: 0, wallCd: 0, wallN: null, mant: null, grap: null, grapCd: 0, land: 0, roll: 0, eye: 1.65, airT: 0, lastWall: 0 });
}

// returns the prop tile in front of the player that could be climbed, or null
function ledgeAhead(P, world, dx, dz, reach) {
  for (const dist of [0.5, 0.75]) {
    const px = P.x + dx * dist, pz = P.z + dz * dist; const [tx, ty] = world.tile(px, pz);
    const top = world.topAt(tx, ty); if (!isFinite(top)) continue;
    if (world.tubeKind(tx, ty) === 'up') {   // the high mouth of a laddered tube: pull yourself in along its axis
      const rise = top - P.y, cx = (tx + 0.5) * TS, cz = (ty + 0.5) * TS, ax = world.d.tubeAxis[tx + ty * world.W];
      if (rise < 0.25 || rise > reach || (ax === 'x' ? Math.abs(dz) > 0.6 || Math.abs(P.z - cz) > 0.5 : Math.abs(dx) > 0.6 || Math.abs(P.x - cx) > 0.5)) continue;
      return ax === 'x' ? { top, x: cx - Math.sign(dx) * (TS / 2 - 0.6), z: cz, rise } : { top, x: cx, z: cz - Math.sign(dz) * (TS / 2 - 0.6), rise };
    }
    const rise = top - P.y; if (rise < 0.25 || rise > reach) continue;
    if (top + MOVE.height * 0.6 > world.ceilAt(tx, ty)) continue;                 // no headroom (crouch height)
    const cx = (tx + 0.5) * TS, cz = (ty + 0.5) * TS, h = world.propHalf;
    if (Math.abs(px - cx) > h + 0.05 || Math.abs(pz - cz) > h + 0.05) continue;
    // land a little inside the edge we approached from
    const lx = clamp(P.x + dx * 0.95, cx - h + 0.3, cx + h - 0.3), lz = clamp(P.z + dz * 0.95, cz - h + 0.3, cz + h - 0.3);
    return { top, x: lx, z: lz, rise };
  }
  return null;
}
function wallBeside(P, world, side) {   // side: +1 right, -1 left (relative to velocity)
  const sp = Math.hypot(P.vx, P.vz) || 1, fx = P.vx / sp, fz = P.vz / sp, rx = -fz * side, rz = fx * side;
  const [tx, ty] = world.tile(P.x + rx * 0.62, P.z + rz * 0.62);
  if (world.grid[ty]?.[tx] !== 1) return null;
  const [px, py] = world.tile(P.x, P.z); const nx = Math.sign(px - tx), nz = Math.sign(py - ty);
  if ((nx !== 0) === (nz !== 0)) return null;                                      // diagonal: no clean wall face
  return { nx, nz };
}

/**
 * input: { fx, fz (strafe/forward wish, -1..1), sprint, crouch, jump (pressed this frame), jumpHeld }
 * api: { stamina(), spend(n), onEvent(name, data) }
 */
export function movePlayer(dt, P, world, input, api) {
  const M = MOVE; const ev = (n, d) => api.onEvent(n, d);
  const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
  let wl = Math.hypot(input.fx, input.fz); const wfx = wl ? input.fx / wl : 0, wfz = wl ? input.fz / wl : 0;
  const wx = wfx * cy + wfz * sy, wz = -wfx * sy + wfz * cy;                       // wish direction (world)
  const fwdX = -sy, fwdZ = -cy;                                                   // facing
  // low headroom (Jiffy tubes): duck automatically on the way in, and no standing up or jumping inside
  { const here = world.headroomAt(...world.tile(P.x, P.z)), dl = Math.hypot(P.vx, P.vz) || 1, at = world.tile(P.x + P.vx / dl * 0.7, P.z + P.vz / dl * 0.7), ahead = Math.abs(world.floorAt(at[0], at[1]) - P.y) < 0.5 ? world.headroomAt(at[0], at[1]) : 9;
    P.low = here < 1.7 || (ahead < 1.7 && P.grounded); if (P.low) { input = { ...input, crouch: true, jump: false, sprint: false }; if (P.mode === 'slide' && here < 1.7) P.slideT = Math.min(P.slideT, 0.6); } }
  P.jumpBuf = input.jump ? 0.14 : Math.max(0, P.jumpBuf - dt);
  P.slideCd = Math.max(0, P.slideCd - dt); P.wallCd = Math.max(0, P.wallCd - dt); P.grapCd = Math.max(0, P.grapCd - dt);
  P.land = Math.max(0, P.land - dt * 3.2);
  const hs0 = Math.hypot(P.vx, P.vz);

  // ---------------- ladder (shaft tile of a Jiffy tube): W up, S / crouch / look down + W to descend, Space lets go ----------------
  { const [lx, ly] = world.tile(P.x, P.z), onShaft = world.tubeKind(lx, ly) === 'lad';
    if (P.mode === 'ladder' && !onShaft) { P.mode = 'air'; P.grounded = false; P.vy = 0; }
    if (onShaft && P.mode !== 'grapple' && P.mode !== 'mantle' && (P.y > 0.05 || input.fz < 0 || P.mode === 'ladder')) {
      if (P.mode !== 'ladder') ev('ladder');
      P.mode = 'ladder'; P.grounded = false; P.crouch = false; P.sprint = false;
      const down = input.fz > 0 || input.crouch || (input.fz < 0 && P.pitch < -0.8), up = input.fz < 0 && !down;
      P.vy = up ? 2.5 : down ? -3.2 : 0; P.y = clamp(P.y + P.vy * dt, 0, TUBE_UP);
      P.rungT = (P.rungT || 0) + Math.abs(P.vy) * dt; if (P.rungT > 0.3) { P.rungT = 0; ev('rung'); }
      const hsT = P.y >= TUBE_UP - 0.02 || P.y <= 0.02 ? 1.8 : 0.5, k = Math.min(1, dt * 10); P.vx += (wx * hsT - P.vx) * k; P.vz += (wz * hsT - P.vz) * k;
      P.x += P.vx * dt; P.z += P.vz * dt; world.resolve(P, M.radius);
      if (P.jumpBuf > 0) { P.jumpBuf = 0; P.mode = 'air'; P.vy = 2.5; }
      else if (P.y <= 0 && !up) { P.mode = 'ground'; P.grounded = true; P.vy = 0; }
      return finish();
    } }

  // ---------------- mantle / vault (scripted move onto a prop top) ----------------
  if (P.mode === 'mantle') {
    const m = P.mant; m.t += dt / m.dur; const k = Math.min(1, m.t), e = k * k * (3 - 2 * k);
    P.x = m.x0 + (m.x - m.x0) * e; P.z = m.z0 + (m.z - m.z0) * e;
    P.y = m.y0 + (m.top - m.y0) * Math.min(1, k * 1.5) + Math.sin(k * Math.PI) * 0.12;
    if (k >= 1) { P.y = m.top; P.vy = 0; P.grounded = true; P.mode = 'ground'; P.vx = m.dx * m.exit; P.vz = m.dz * m.exit; P.mant = null; P.land = 0.35; }
    P.crouch = false; P.sprint = false; return finish();
  }
  const startMantle = (L, dx, dz, fast) => {
    P.mode = 'mantle'; P.grap = null;
    P.mant = { x0: P.x, z0: P.z, y0: P.y, x: L.x, z: L.z, top: L.top, dx, dz, t: 0, dur: fast ? 0.24 : 0.3 + L.rise * 0.16, exit: fast ? Math.max(hs0, 5) : 2.2, fast };
    P.flow = Math.min(1, P.flow + (fast ? 0.3 : 0.12)); ev(fast ? 'vault' : 'mantle', L);
  };

  // ---------------- grapple pull ----------------
  if (P.mode === 'grapple') {
    const g = P.grap; g.t += dt;
    let dx = g.x - P.x, dy = g.y - (P.y + 1.3), dz = g.z - P.z; const d = Math.hypot(dx, dy, dz) || 1; dx /= d; dy /= d; dz /= d;
    P.vx += dx * M.grapAccel * dt; P.vy += dy * M.grapAccel * dt - 5 * dt; P.vz += dz * M.grapAccel * dt;
    // bleed off velocity that is not along the rope, so the pull feels like a reel not an orbit
    const along = P.vx * dx + P.vy * dy + P.vz * dz, k = Math.min(1, dt * 4);
    P.vx += (dx * along - P.vx) * k; P.vy += (dy * along - P.vy) * k; P.vz += (dz * along - P.vz) * k;
    const sp = Math.hypot(P.vx, P.vy, P.vz); if (sp > M.grapSpeed) { const s = M.grapSpeed / sp; P.vx *= s; P.vy *= s; P.vz *= s; }
    P.grounded = false; P.crouch = false;
    const release = (why) => { P.mode = 'air'; P.grap = null; P.grapCd = M.grapCooldown; P.flow = Math.min(1, P.flow + 0.35); ev('release', why); };
    if (P.jumpBuf > 0) { P.jumpBuf = 0; P.vy = Math.max(P.vy, 0) + 3.2; release('jump'); }
    else if (d < 1.35 || g.t > M.grapTime || input.grappleCancel) release(d < 1.35 ? 'arrive' : 'time');
    integrate(); 
    if (P.mode === 'grapple' && g.t > 0.25 && Math.hypot(P.vx, P.vy, P.vz) < 1.2) release('stuck');
    return finish();
  }

  // ---------------- wall-run ----------------
  if (P.mode === 'wallrun') {
    P.wallT += dt; const n = P.wallN, tx = -n.nz * P.wallDir, tz = n.nx * P.wallDir;   // tangent along the wall
    const still = wallBeside(P, world, P.wallSide);
    P.vx = tx * M.wallSpeed; P.vz = tz * M.wallSpeed;
    P.vy += ((P.wallT < 0.45 ? 0.9 : -1.6) - P.vy) * Math.min(1, dt * 6);
    api.spend(dt * 9);
    const endRun = () => { P.mode = 'air'; P.wallCd = 0.35; P.lastWall = P.wallSide; };
    if (P.jumpBuf > 0) { P.jumpBuf = 0; P.vy = M.wallJumpUp; P.vx += n.nx * M.wallJumpOut; P.vz += n.nz * M.wallJumpOut; P.flow = Math.min(1, P.flow + 0.3); endRun(); P.lastWall = 0; ev('walljump'); }
    else if (!still || P.wallT > M.wallTime || input.fz > -0.2 || api.stamina() <= 1) endRun();
    integrate(); return finish();
  }

  // ---------------- slide ----------------
  if (P.mode === 'slide') {
    P.slideT += dt; const sp = Math.max(0, hs0 - M.slideFriction * dt), s = hs0 > 0.01 ? sp / hs0 : 0; P.vx *= s; P.vz *= s;
    // a little steering
    P.vx += wx * 2.5 * dt; P.vz += wz * 2.5 * dt; P.crouch = true; P.sprint = false;
    if (P.jumpBuf > 0 && P.grounded) { P.jumpBuf = 0; P.vy = M.jump * 0.92; P.grounded = false; P.mode = 'air'; P.slideCd = 0.4; P.flow = Math.min(1, P.flow + 0.2); ev('jump', { slide: true }); }
    else if (sp < 2.4 || P.slideT > M.slideTime || (!input.crouch && P.slideT > 0.35)) { P.mode = 'ground'; P.slideCd = 0.5; P.crouch = !!P.low; }
    integrate(); return finish();
  }

  // ---------------- ground / air ----------------
  P.crouch = input.crouch && P.grounded;
  P.sprint = input.sprint && wl > 0 && !P.crouch && api.stamina() > 3;
  P.flow = clamp(P.flow + (P.sprint && hs0 > 5 ? dt * 0.22 : -dt * 0.5), 0, 1);
  if (P.grounded) {
    const spd = (P.sprint ? M.sprint + P.flow * M.flowBonus : P.crouch ? M.crouch : M.walk) * (P.slow || 1);
    const k = Math.min(1, dt * M.groundK); P.vx += (wx * spd - P.vx) * k; P.vz += (wz * spd - P.vz) * k;
    P.coyote = 0.12;
    if (input.crouchPressed && P.sprintWas && hs0 > M.slideMin && P.slideCd <= 0) {
      P.mode = 'slide'; P.slideT = 0; const b = (hs0 + M.slideBoost) / (hs0 || 1); P.vx *= b; P.vz *= b; ev('slide'); integrate(); return finish();
    }
  } else {
    P.coyote = Math.max(0, P.coyote - dt); P.airT += dt;
    P.vx += wx * M.airAccel * dt; P.vz += wz * M.airAccel * dt;
    const cap = Math.max(hs0, M.walk), hs = Math.hypot(P.vx, P.vz); if (hs > cap) { P.vx *= cap / hs; P.vz *= cap / hs; }
  }
  P.sprintWas = P.sprint || (P.sprintWas && !P.grounded);
  // jump / climb
  if (P.jumpBuf > 0) {
    const dirX = wl ? wx : fwdX, dirZ = wl ? wz : fwdZ;
    const L = ledgeAhead(P, world, dirX, dirZ, P.grounded ? M.mantleReachGround : M.mantleReach);
    if (L && api.stamina() > 2) { P.jumpBuf = 0; api.spend(5); startMantle(L, dirX, dirZ, L.rise < 1.0 && hs0 > 4.6); return finish(); }
    if (P.grounded || P.coyote > 0) { P.jumpBuf = 0; P.coyote = 0; P.vy = M.jump; P.grounded = false; P.mode = 'air'; P.airT = 0; api.spend(4); ev('jump', {}); }
  }
  if (!P.grounded) {
    // ledge grab: moving into a prop edge while airborne
    if (wl && input.fz < 0) { const L = ledgeAhead(P, world, wx, wz, M.mantleReach); if (L && P.vy < 3.5 && L.rise > 0.3) { startMantle(L, wx, wz, false); return finish(); } }
    // wall-run: airborne, fast, pushing forward, wall on one side
    if (P.wallCd <= 0 && input.fz < -0.5 && hs0 > 4.3 && P.y > 0.25 && P.vy > -5 && api.stamina() > 6) {
      for (const side of [1, -1]) {
        if (side === P.lastWall) continue;
        const n = wallBeside(P, world, side); if (!n) continue;
        const tx = -n.nz, tz = n.nx, along = P.vx * tx + P.vz * tz; if (Math.abs(along) < 3.2) continue;
        P.mode = 'wallrun'; P.wallN = n; P.wallSide = side; P.wallDir = Math.sign(along); P.wallT = 0; P.vy = Math.max(P.vy, 2.4); ev('wallrun', { side }); break;
      }
    }
  }
  integrate(); return finish();

  // ---------------- shared integration + collision ----------------
  function integrate() {
    if (!P.grounded) P.vy -= (P.mode === 'wallrun' ? 0 : P.mode === 'grapple' ? 0 : M.gravity) * dt;
    P.kbx *= Math.max(0, 1 - dt * 5); P.kbz *= Math.max(0, 1 - dt * 5);
    const steps = Math.max(1, Math.ceil(Math.hypot(P.vx + P.kbx, P.vz + P.kbz) * dt / 0.25));
    for (let i = 0; i < steps; i++) { P.x += (P.vx + P.kbx) * dt / steps; P.z += (P.vz + P.kbz) * dt / steps; world.resolve(P, M.radius); }
    P.y += P.vy * dt;
    const [tx, ty] = world.tile(P.x, P.z); const ceil = world.ceilAt(tx, ty), head = P.mode === 'slide' || P.crouch ? 1.15 : M.height;
    if (P.y + head > ceil - 0.05 && P.vy > 0) { P.y = ceil - 0.05 - head; P.vy = Math.min(P.vy, 0); }
    const floor = world.groundAt(P.x, P.z, P.y);
    if (P.y <= floor && P.vy <= 0) {
      if (!P.grounded) { const impact = -P.vy; P.land = clamp(impact / 9, 0.15, 1); ev('land', { impact }); P.lastWall = 0; if (P.mode !== 'slide') P.mode = 'ground'; }
      P.y = floor; P.vy = 0; P.grounded = true; P.airT = 0;
    } else if (P.grounded && P.y > floor + 0.02) { P.grounded = false; if (P.mode === 'ground') P.mode = 'air'; }   // walked off an edge
  }
  function finish() {
    const hs = Math.hypot(P.vx, P.vz);
    const eyeT = P.mode === 'slide' ? 0.72 : P.mode === 'mantle' ? 1.25 : P.crouch ? 1.05 : 1.65;
    P.eye += (eyeT - P.eye) * Math.min(1, dt * 12);
    const rollT = P.mode === 'wallrun' ? -P.wallSide * 0.2 : P.mode === 'slide' ? 0.05 : P.mode === 'mantle' ? (P.mant.fast ? 0.12 : 0) : clamp(-input.fx * 0.018 * Math.min(1, hs / 4), -0.03, 0.03);
    P.roll += (rollT - P.roll) * Math.min(1, dt * 9);
    return hs;
  }
}

// start a grapple toward `hit` ({x,y,z}) returned by world.raycast
export function startGrapple(P, hit) { P.grap = { x: hit.x, y: hit.y, z: hit.z, t: 0, kind: hit.kind }; P.mode = 'grapple'; P.mant = null; P.grounded = false; P.vy = Math.max(P.vy, 2.5); }
