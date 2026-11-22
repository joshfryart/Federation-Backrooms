// Room layout: atrium (moved from the js/gen.js room switch). Backlog and rules: docs/rooms/atrium.md, docs/rooms/README.md.
// ctx: see js/rooms/index.js. Draw randomness only from ctx.rnd (this room's own stream); place blocking props through safePut / ringPut / anyPut / wallPut.
export function layout(ctx) {
  const { r, interior, ix0, iy0, ix1, iy1, cx, cy, rnd, put, safePut, ringPut, wallPut, anyPut, freeIn, has, reserved, faceTo, faceOpen, inRect, shuffle, grid, props } = ctx;
  put(cx, cy, 'tree'); for (const [x, y] of interior) if (grid[y][x] === 0 && (x + y) % 3 === 0 && !(x === cx && y === cy)) safePut(r, x, y, (x + y) % 2 ? 'plant' : 'tree'); ringPut(r, 'sofa', { along: true }); ringPut(r, 'sofa', { along: true });    // garden court under a 5.6 m ceiling
}

export const dress = { light: 0xeaf6ff };   // daylight tint under the skylight
