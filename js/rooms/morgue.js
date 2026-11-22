// Room layout: morgue (moved from the js/gen.js room switch). Backlog and rules: docs/rooms/morgue.md, docs/rooms/README.md.
// ctx: see js/rooms/index.js. Draw randomness only from ctx.rnd (this room's own stream); place blocking props through safePut / ringPut / anyPut / wallPut.
export function layout(ctx) {
  const { r, interior, ix0, iy0, ix1, iy1, cx, cy, rnd, put, safePut, ringPut, wallPut, anyPut, freeIn, has, reserved, faceTo, faceOpen, inRect, shuffle, grid, props } = ctx;
  put(cx, cy, 'autopsy_table', { rot: rnd() < 0.5 ? 0 : Math.PI }); for (const [x, y] of interior) if (grid[y][x] === 0 && (x + y) % 2 === 0) safePut(r, x, y, 'drawers'); ringPut(r, 'drawers');    // MED-7; drawers get a pulled-out tray in world.js
}
