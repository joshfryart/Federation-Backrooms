// Room layout: quarters (moved from the js/gen.js room switch). Backlog and rules: docs/rooms/quarters.md, docs/rooms/README.md.
// ctx: see js/rooms/index.js. Draw randomness only from ctx.rnd (this room's own stream); place blocking props through safePut / ringPut / anyPut / wallPut.
export function layout(ctx) {
  const { r, interior, ix0, iy0, ix1, iy1, cx, cy, rnd, put, safePut, ringPut, wallPut, anyPut, freeIn, has, reserved, faceTo, faceOpen, inRect, shuffle, grid, props } = ctx;
  const senior = rnd() < 0.3;                                                // CMD-3 platform bed in about a third of the cabins (gen has no billets: senior cabins are not known here)
  put(cx, cy, senior ? 'platform_bed' : 'bunk'); ringPut(r, 'desk');
  if (senior) ringPut(r, 'sofa', { corner: true, free: true });             // slot 1: a senior cabin gets a sofa
  ringPut(r, 'drawers', { corner: true });                                    // slot 4: a chest of drawers for personal kit
  ringPut(r, 'plant', { corner: true, free: true });                          // slot 4: a potted plant in another corner
}
// slot 3: more framed pictures and mirrors on the walls (personal frames, X-2)
export const dress = { decor: () => ['locker', 'picture', 'mirror', 'shelf', 'picture', 'picture', 'mirror'] };
