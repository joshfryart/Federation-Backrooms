// Room layout: quarters (moved from the js/gen.js room switch). Backlog and rules: docs/rooms/quarters.md, docs/rooms/README.md.
// ctx: see js/rooms/index.js. Draw randomness only from ctx.rnd (this room's own stream); place blocking props through safePut / ringPut / anyPut / wallPut.
export function layout(ctx) {
  const { r, interior, ix0, iy0, ix1, iy1, cx, cy, rnd, put, safePut, ringPut, wallPut, anyPut, freeIn, has, reserved, faceTo, faceOpen, inRect, shuffle, grid, props } = ctx;
  put(cx, cy, rnd() < 0.3 ? 'platform_bed' : 'bunk'); ringPut(r, 'desk');
  ringPut(r, 'drawers', { corner: true });                                                  // slot 4: a chest of drawers for personal kit, against a wall with a free front    // CMD-3 in about a third of the cabins (gen has no billets: senior cabins are not known here)
  ringPut(r, 'plant', { corner: true, free: true });                          // slot 4: a potted plant in another corner
}
