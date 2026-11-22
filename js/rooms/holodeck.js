// Room layout: holodeck (moved from the js/gen.js room switch). Backlog and rules: docs/rooms/holodeck.md, docs/rooms/README.md.
// ctx: see js/rooms/index.js. Draw randomness only from ctx.rnd (this room's own stream); place blocking props through safePut / ringPut / anyPut / wallPut.
export function layout(ctx) {
  const { r, interior, ix0, iy0, ix1, iy1, cx, cy, rnd, put, safePut, ringPut, wallPut, anyPut, freeIn, has, reserved, faceTo, faceOpen, inRect, shuffle, grid, props } = ctx;
  put(cx, cy, 'holocube'); ringPut(r, 'holodesk');
  // programme prop locker (FIT locker) against a wall, reached from the side
  ringPut(r, 'locker', { free: true });
  // control console on a wall: the operator looks over it into the grid
  ringPut(r, 'console', { face: 'out', free: true });
  // a bench along a wall for waiting participants
  ringPut(r, 'bench', { along: true, free: true });
  // programme-running lamp two tiles from the door
  ringPut(r, 'lamp', { door: true, free: true, only: 'corner' });
  // a stool by the cube for a seated participant
  anyPut(r, interior, 'stool', { near: [cx, cy] });
  // a real potted plant in a corner: the one thing in here that is not a projection
  ringPut(r, 'plant', { only: 'corner', free: true });
  // second operator console opposite, for two-handed programme edits
  ringPut(r, 'console', { free: true });
  // a second locker for costumes, across from the first
  ringPut(r, 'locker', { free: true, face: 'out' });
  // a second bench across the room, at the far side from the first
  ringPut(r, 'bench', { along: true, free: true, door: true });
  // one stray programme prop left after a purge, away from the cube
  if (rnd() < 0.5) anyPut(r, interior, 'crate', { min: [cx, cy, 2] });
  // a second, smaller leftover: a stool tipped away from the cube
  if (rnd() < 0.4) anyPut(r, interior, 'stool', { min: [cx, cy, 2] });
}

// world.js dressing for this room (README: dress hook)
export const dress = {
  // programme listing screens beside the sparse comm panels
  decor: (pool) => [...pool, 'monitorB'],
  // programme-running tint: a slightly greener grid yellow
  light: 0xf4e468,
};
