// Room layout: datacore (moved from the js/gen.js room switch). Backlog and rules: docs/rooms/datacore.md, docs/rooms/README.md.
// ctx: see js/rooms/index.js. Draw randomness only from ctx.rnd (this room's own stream); place blocking props through safePut / ringPut / anyPut / wallPut.
export function layout(ctx) {
  const { r, interior, ix0, iy0, ix1, iy1, cx, cy, rnd, put, safePut, ringPut, wallPut, anyPut, freeIn, has, reserved, faceTo, faceOpen, inRect, shuffle, grid, props } = ctx;
  let n = 0; for (const [x, y] of interior) if ((x + y) % 2 === 0) put(x, y, (x + y) % 4 === 0 ? 'console' : n++ % 2 ? 'relayrack' : 'servers');   // OPS-4 relay racks among the stacks
  wallPut(r, interior, 'commsstation');
}
