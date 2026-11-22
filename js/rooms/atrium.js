// Room layout: atrium (moved from the js/gen.js room switch). Backlog and rules: docs/rooms/atrium.md, docs/rooms/README.md.
// ctx: see js/rooms/index.js. Draw randomness only from ctx.rnd (this room's own stream); place blocking props through safePut / ringPut / anyPut / wallPut.
export function layout(ctx) {
  const { r, interior, ix0, iy0, ix1, iy1, cx, cy, rnd, put, safePut, ringPut, wallPut, anyPut, freeIn, has, reserved, faceTo, faceOpen, inRect, shuffle, grid, props } = ctx;
  put(cx, cy, 'tree'); for (const [x, y] of interior) if (grid[y][x] === 0 && (x + y) % 3 === 0 && !(x === cx && y === cy)) safePut(r, x, y, (x + y) % 2 ? 'plant' : 'tree'); ringPut(r, 'sofa', { along: true }); ringPut(r, 'sofa', { along: true });    // garden court under a 5.6 m ceiling
  if (r.w >= 7 || r.h >= 7) anyPut(r, interior, 'tree', { near: [cx, cy], min: 2 });   // second specimen on the big courts
  if (rnd() < 0.6) ringPut(r, 'specimen_tank', { only: 'corner' });   // glass-case specimen in a corner
  if (r.w >= 6 && r.h >= 6) ringPut(r, 'sofa', { along: true });   // a third seat on the larger courts
  if (rnd() < 0.5) ringPut(r, 'plant', { only: 'corner', free: true });   // potted fern tucked in a corner
}

export const dress = { light: 0xeaf6ff, decor: ["planter", "planter", "fountain", "picture"], floor: "paver", fit: ["shelf", "kit"] };   // daylight tint under the skylight; garden wall fixtures
