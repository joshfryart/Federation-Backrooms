// Hiding spots (madness mode). Pure logic: no three.js, no DOM. Crouch + E at a spot hides you; hunters then only spot you within `r` metres (js/enemies.js
// seesPlayer reads P.hidden / P.hideR) and ignore your noise. Three kinds, from loosest to tightest cover (numbers are guesses, not tuned by hand):
//   prop    suit rack / drawers / shelving / weapon rack / tank: you crouch behind it            r 1.8, camera 0.95
//   locker  a wall locker (world.hideSites): you stand inside, door pulled to, facing the wall   r 1.2, camera 1.5
//   vent    a low wall grille: you wriggle in and lie flat                                       r 0.8, camera 0.5
// The Silent Running perk (ghost) shrinks every radius to ~0.55x (1.8 -> 1.0, the figure the first version used).
export const HIDE_PROP_KINDS = new Set(['suitrack', 'drawers', 'shelving', 'weaponrack', 'tank']);
export const HIDE_SITE_KINDS = new Set(['locker', 'dclocker', 'ventgrille']);
export const HIDE = {
  prop: { r: 1.8, eye: 0.95, pose: 'crouch', say: 'You crouch out of sight. Hunters only find you up close. [E] or move to step out.' },
  locker: { r: 1.2, eye: 1.5, pose: 'locker', say: 'You pull the locker door to behind you. Hunters only find you up close. [E] or move to step out.' },
  vent: { r: 0.8, eye: 0.5, pose: 'vent', say: 'You wriggle into the vent and lie flat. Hunters only find you right at the grille. [E] or move to step out.' },
};
export const hideClass = (kind) => HIDE_PROP_KINDS.has(kind) ? 'prop' : kind === 'ventgrille' ? 'vent' : HIDE_SITE_KINDS.has(kind) ? 'locker' : null;
export const hideRadius = (cls, ghost = false) => { const h = HIDE[cls]; return h ? (ghost ? Math.round(h.r * 0.556 * 20) / 20 : h.r) : 0; };
// the nearest wall hiding spot in reach that the player faces: sites [{ x, z, nx, nz, kind }], player { x, z, yaw }
export function nearestHideSite(sites, P, reach = 1.9) {
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); let best = null, bd = reach;
  for (const s of sites || []) { const dx = s.x - P.x, dz = s.z - P.z, d = Math.hypot(dx, dz); if (d < bd && (dx * fx + dz * fz) / (d || 1) > 0.35) { bd = d; best = s; } }
  return best;
}
// the state stored in P.hidden for a spot (a prop { tx, ty, kind } or a wall site { x, z, nx, nz, kind }); a wall spot moves you into it, facing the wall
export function hideState(spot, ghost = false) {
  const cls = hideClass(spot.kind) || 'prop', h = HIDE[cls];
  const st = { cls, pose: h.pose, eye: h.eye, r: hideRadius(cls, ghost), tx: spot.tx, ty: spot.ty };
  if (spot.x !== undefined && spot.nx !== undefined) { st.x = spot.x; st.z = spot.z;   /* the site is already 0.35 m off the wall: any closer and collision pushes you back out */ st.yaw = Math.atan2(spot.nx, spot.nz); st.from = { x: spot.x + spot.nx * 0.2, z: spot.z + spot.nz * 0.2 }; }
  return st;
}
