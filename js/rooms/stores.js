// Room layout: stores (moved from the js/gen.js room switch). Backlog and rules: docs/rooms/stores.md, docs/rooms/README.md.
// ctx: see js/rooms/index.js. Draw randomness only from ctx.rnd (this room's own stream); place blocking props through safePut / ringPut / anyPut / wallPut.
export function layout(ctx) {
  const { r, interior, ix0, iy0, ix1, iy1, cx, cy, rnd, put, safePut, ringPut, wallPut, anyPut, freeIn, has, reserved, faceTo, faceOpen, inRect, shuffle, grid, props } = ctx;
  if (interior.length > 1) safePut(r, cx, cy, 'pallet_loaded', { rot: faceOpen(cx, cy, 0, 1) });   // focal: a staged pallet in the middle of the big stores
  for (const [x, y] of interior) if (rnd() < 0.7) safePut(r, x, y, (x + y) % 3 === 0 ? 'cart' : (x + y) % 2 ? 'shelving' : 'crate'); ringPut(r, 'desk');
  ringPut(r, 'reachin_cooler'); ringPut(r, 'feedstock_silo'); ringPut(r, 'injector_crate', { only: 'corner', free: true });    // SVC-5 cooler (the walk-in door is a wall piece, world.js), SVC-17, ENG-13
}
// world.js dressing: stores wall pool leans on shelving and bins (kit / toolboard added), emergency gear stays rare; light a touch warmer.
export const dress = { decor: () => ['rack', 'rack', 'shelf', 'shelf', 'locker', 'kit', 'toolboard', 'extinguisher', 'dclocker', 'coldstore_door'], light: 0xffe4b8 };
