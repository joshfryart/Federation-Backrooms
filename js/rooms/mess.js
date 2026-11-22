// Room layout: mess (moved from the js/gen.js room switch). Backlog and rules: docs/rooms/mess.md, docs/rooms/README.md.
// ctx: see js/rooms/index.js. Draw randomness only from ctx.rnd (this room's own stream); place blocking props through safePut / ringPut / anyPut / wallPut.
export function layout(ctx) {
  const { r, interior, ix0, iy0, ix1, iy1, cx, cy, rnd, put, safePut, ringPut, wallPut, anyPut, freeIn, has, reserved, faceTo, faceOpen, inRect, shuffle, grid, props } = ctx;
  // SVC-1 range against a wall, SVC-2 servery in front of it (staff side to the range), SVC-13 dishwasher on another wall
  const rg = ringPut(r, 'range');
  if (rg && interior.length > 1 && interior.some(([x, y]) => x === rg.front[0] && y === rg.front[1])) { reserved.delete(rg.front.join(',')); put(rg.front[0], rg.front[1], 'servery', { rot: rg.rot }); }
  else ringPut(r, 'servery');
  if (r.big) { for (const [x, y] of interior) { if (grid[y][x] !== 0) continue; if (y === iy0) { if ((x - ix0) % 2 === 0) safePut(r, x, y, 'replicator', { rot: 0 }); } else if ((x - ix0) % 2 === 0 && (y - iy0) % 2 === 0) safePut(r, x, y, 'table', { rot: 0 }); } }   // serving line along one wall, tables in rows
  else for (const [x, y] of interior) if (grid[y][x] === 0 && ((x + y) % 2 === 0 || r.w < 5)) safePut(r, x, y, 'table') || (interior.length === 1 && put(x, y, 'table'));
  if (interior.length > 1) ringPut(r, 'dishwasher');
  if (r.big) ringPut(r, 'wastebin', { corner: true });
  if (r.big) { ringPut(r, 'range'); ringPut(r, 'servery'); ringPut(r, 'dishwasher'); }   // a proper kitchen in the galley hall: a second cooking line and dishwasher (ringPut keeps every front walkable)
  if (interior.length > 1) ringPut(r, 'feedstock_silo');                           // SVC-17
  if (r.big) ringPut(r, 'reachin_cooler', { free: true });                       // cold store for the galley hall
  if (r.big) ringPut(r, 'galley_trolley', { only: 'corner', free: true });         // SVC-14
}
