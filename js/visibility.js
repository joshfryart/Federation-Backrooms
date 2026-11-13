// "Is the player looking at it?" for the Phantom hologram (pure; tools/test-balance.mjs covers it).
// Rules: needs line of sight; inside the view cone (dot with the facing vector); looking steeply up/down at something
// not close does not count; and darkness lowers visibility: lit area (powerAmt) or the torch beam is required.
export const VIS = { cone: 0.6, edge: 0.45, maxDist: 30, steepPitch: 1.0, steepNear: 3, dark: 0.3, torchRange: 14, torchCone: 0.88, ambientFloor: 0.12 };
/** light on the target: ship power (0..1, floor so emergency glow remains) or torch beam hit */
export function lightOn({ power = 1, torch = false, dist, dot }) {
  let l = VIS.ambientFloor + (1 - VIS.ambientFloor) * power;
  if (torch && dist < VIS.torchRange && dot > VIS.torchCone) l = Math.max(l, 1 - dist / VIS.torchRange * 0.4);
  return l;
}
/** returns { seen, edge, vis }: seen = frozen; edge = peripheral (it creeps at reduced speed) */
export function lookedAt(p, tx, tz, { los = true, power = 1 } = {}) {
  const dx = tx - p.x, dz = tz - p.z, dist = Math.hypot(dx, dz);
  if (dist < 0.01) return { seen: true, edge: false, vis: 1 };
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), dot = (dx * fx + dz * fz) / dist;
  const vis = lightOn({ power, torch: !!p.torch, dist, dot });
  const steep = Math.abs(p.pitch || 0) > VIS.steepPitch && dist > VIS.steepNear;
  const ok = los && dist < VIS.maxDist && !steep && vis >= VIS.dark;
  return { seen: ok && dot > VIS.cone, edge: ok && dot > VIS.edge && dot <= VIS.cone, vis };
}
