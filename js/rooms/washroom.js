// Room layout: washroom (moved from the js/gen.js room switch). Backlog and rules: docs/rooms/washroom.md, docs/rooms/README.md.
// ctx: see js/rooms/index.js. Draw randomness only from ctx.rnd (this room's own stream); place blocking props through safePut / ringPut / anyPut / wallPut.
export function layout(ctx) {
  const { r, interior, ix0, iy0, ix1, iy1, cx, cy, rnd, put, safePut, ringPut, wallPut, anyPut, freeIn, has, reserved, faceTo, faceOpen, inRect, shuffle, grid, props } = ctx;
  put(cx, cy, 'sinkunit');
  ringPut(r, 'wastebin', { only: 'corner', free: true });   // slot 4: a bin in a corner
  if (rnd() < 0.6) ringPut(r, 'locker', { door: true, free: true });   // slot 1: attendant locker near the door
  if (rnd() < 0.5) ringPut(r, 'pipes', { free: true });   // slot 10: exposed plumbing run along a wall
}
