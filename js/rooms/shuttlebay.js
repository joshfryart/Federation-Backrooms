// Room layout: shuttlebay (moved from the js/gen.js room switch). Backlog and rules: docs/rooms/shuttlebay.md, docs/rooms/README.md.
// ctx: see js/rooms/index.js. Draw randomness only from ctx.rnd (this room's own stream); place blocking props through safePut / ringPut / anyPut / wallPut.
export function layout(ctx) {
  const { r, interior, ix0, iy0, ix1, iy1, cx, cy, rnd, put, safePut, ringPut, wallPut, anyPut, freeIn, has, reserved, faceTo, faceOpen, inRect, shuffle, grid, props } = ctx;
  // the shuttle sits on its cradle (FLT-3, world.js adds cradle and pad marking) with its long axis on x: both end tiles kept clear
  put(cx, cy, 'shuttle', { rot: rnd() < 0.5 ? 0 : Math.PI }); reserved.add((cx - 1) + ',' + cy); reserved.add((cx + 1) + ',' + cy);
  safePut(r, ix0, iy0, 'crate'); safePut(r, ix1, iy1, 'pallet_loaded');   // corner stock, checked so it never boxes a tile in
  ringPut(r, 'baycontrol', { door: true }); ringPut(r, 'workbench');
  anyPut(r, interior, 'workpod'); anyPut(r, interior, 'maint_stand', { near: [cx, cy] });              // FLT-8 work pod, FLT-9 maintenance stand
  ringPut(r, 'fuelbowser', { along: true }); ringPut(r, 'hoversled', { door: true, along: true });     // FLT-5, SVC-9 parked against the walls
  if (r.big) ringPut(r, 'cargo_pad', { along: true });   // big bay: a staging pad for stores coming off the shuttle
  if (r.big) ringPut(r, 'chargerack', { along: true });   // big bay: tool and suit charging by the wall (slot 4 clutter)
  ringPut(r, 'suitrack', { door: true });   // flight crew suit rack by the bay door
  ringPut(r, 'wastebin', { along: true });   // swept-up debris bin
  if (r.big) ringPut(r, 'shelving', { along: true });   // big bay: spares racking on a wall
  if (r.big) anyPut(r, interior, 'pallet', { min: [cx, cy, 2] });   // big bay: an empty pallet left in the open, clear of the cradle
}
