// Room layout: lounge (moved from the js/gen.js room switch). Backlog and rules: docs/rooms/lounge.md, docs/rooms/README.md.
// ctx: see js/rooms/index.js. Draw randomness only from ctx.rnd (this room's own stream); place blocking props through safePut / ringPut / anyPut / wallPut.
export function layout(ctx) {
  const { r, interior, ix0, iy0, ix1, iy1, cx, cy, rnd, put, safePut, ringPut, wallPut, anyPut, freeIn, has, reserved, faceTo, faceOpen, inRect, shuffle, grid, props } = ctx;
  ringPut(r, 'bar'); wallPut(r, interior, 'arcade');   // SVC-3 bar (+ back bar) on one wall, SVC-16 games
  if (interior.length >= 3) safePut(r, cx, cy, 'pool_table', { rot: r.w >= r.h ? 0 : Math.PI / 2 }); if (interior.length >= 5) anyPut(r, interior, 'card_table', { min: [cx, cy, 2] });
  for (const [x, y] of interior) if (grid[y][x] === 0 && (x + y) % 2 === 0) safePut(r, x, y, (x * 3 + y) % 4 === 0 ? 'table' : (x + 2 * y) % 3 === 0 ? 'lonechair' : 'sofa');
  if (interior.length >= 5) wallPut(r, interior, 'arcade');                                         // a second cabinet in the bigger lounges
  if (interior.length > 1) ringPut(r, 'plant', { corner: true });                                   // a potted plant in a corner
  if (interior.length >= 3) ringPut(r, 'bench', { free: true });                                   // a bench along a wall for spectators
}
