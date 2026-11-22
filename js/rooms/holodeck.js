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
  // one stray programme prop left after a purge, away from the cube
  if (rnd() < 0.5) anyPut(r, interior, 'crate', { min: [cx, cy, 2] });
}

// world.js dressing for this room (README: dress hook)
export const dress = {
  // programme listing screens beside the sparse comm panels
  decor: (pool) => [...pool, 'monitorB'],
  // programme-running tint: a slightly greener grid yellow
  light: 0xf4e468,
};
