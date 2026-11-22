// Room layout: laundry (moved from the js/gen.js room switch). Backlog and rules: docs/rooms/laundry.md, docs/rooms/README.md.
// ctx: see js/rooms/index.js. Draw randomness only from ctx.rnd (this room's own stream); place blocking props through safePut / ringPut / anyPut / wallPut.
export function layout(ctx) {
  const { r, interior, ix0, iy0, ix1, iy1, cx, cy, rnd, put, safePut, ringPut, wallPut, anyPut, freeIn, has, reserved, faceTo, faceOpen, inRect, shuffle, grid, props } = ctx;
  put(cx, cy, 'washer'); wallPut(r, interior, 'dryer'); ringPut(r, 'folding_table', { corner: true, free: true }); ringPut(r, 'linen_cart', { only: 'corner', free: true });    // SVC-15
}

export const dress = {
  decor: ['shelf', 'pipes', 'locker', 'hose', 'shelf', 'pipes'],   // slot 3: more linen shelving and steam pipes
};
