// Room layout: brig (moved from the js/gen.js room switch). Backlog and rules: docs/rooms/brig.md, docs/rooms/README.md.
// ctx: see js/rooms/index.js. Draw randomness only from ctx.rnd (this room's own stream); place blocking props through safePut / ringPut / anyPut / wallPut.
export function layout(ctx) {
  const { r, interior, ix0, iy0, ix1, iy1, cx, cy, rnd, put, safePut, ringPut, wallPut, anyPut, freeIn, has, reserved, faceTo, faceOpen, inRect, shuffle, grid, props } = ctx;
  for (const [x, y] of interior) if ((x + y) % 2 === 0 && rnd() < 0.8) safePut(r, x, y, rnd() < 0.5 ? 'cellfield' : 'cell');   // SEC-2 field cells among the barred ones
  ringPut(r, 'secdesk', { door: true }); ringPut(r, 'scan_arch', { door: true, along: true });    // SEC-1 and the SEC-6 scanner arch by the entrance
  if (r.w >= 4 && r.h >= 4) ringPut(r, 'drawers', { face: 'out', free: true });    // evidence drawers
  ringPut(r, 'wastebin', { free: true });    // clutter: a bin by the wall
}
