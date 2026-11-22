// Room layout: armory (moved from the js/gen.js room switch). Backlog and rules: docs/rooms/armory.md, docs/rooms/README.md.
// ctx: see js/rooms/index.js. Draw randomness only from ctx.rnd (this room's own stream); place blocking props through safePut / ringPut / anyPut / wallPut.
export function layout(ctx) {
  const { r, interior, ix0, iy0, ix1, iy1, cx, cy, rnd, put, safePut, ringPut, wallPut, anyPut, freeIn, has, reserved, faceTo, faceOpen, inRect, shuffle, grid, props } = ctx;
  put(cx, cy, 'weaponrack'); wallPut(r, interior, 'issuecounter', { door: true }); ringPut(r, 'chargerack', { only: 'corner', free: true }); ringPut(r, 'desk'); ringPut(r, 'workbench');    // SEC-7, SEC-3
  ringPut(r, 'wastebin', { free: true });    // clutter: a bin by the wall
  if (r.w >= 4 && r.h >= 4) { ringPut(r, 'chargerack', { free: true }); ringPut(r, 'locker', { face: 'out', free: true }); }    // larger armory: a second charging rack and a kit locker
}

// dressing: more cameras and a badge reader on the walls (a guarded room)
export const dress = { decor: (pool) => [...pool, 'camdome', 'badgereader'], light: 0xfff0d0 };
