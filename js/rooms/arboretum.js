// Room layout: arboretum (moved from the js/gen.js room switch). Backlog and rules: docs/rooms/arboretum.md, docs/rooms/README.md.
// ctx: see js/rooms/index.js. Draw randomness only from ctx.rnd (this room's own stream); place blocking props through safePut / ringPut / anyPut / wallPut.
export function layout(ctx) {
  const { r, interior, ix0, iy0, ix1, iy1, cx, cy, rnd, put, safePut, ringPut, wallPut, anyPut, freeIn, has, reserved, faceTo, faceOpen, inRect, shuffle, grid, props } = ctx;
  // SCI-1 grow beds in rows (long axis x, every other row a walkway), trees at the rim, SCI-6 dosing tanks on a wall
  let beds = 0; for (const [x, y] of interior) if ((y - iy0) % 2 === 0 && beds < 6 && rnd() < 0.9) { if (safePut(r, x, y, 'growbed', { rot: rnd() < 0.5 ? 0 : Math.PI })) beds++; } else if ((y - iy0) % 2 === 1 && rnd() < 0.3) safePut(r, x, y, 'tree');
  for (let i = 0; i < 2; i++) ringPut(r, 'tree', { only: 'corner', free: true }); if (!has(r, 'tree')) anyPut(r, interior, 'tree') || ringPut(r, 'tree');   // SYSTEMS.hydro is hosted on a tree
  wallPut(r, interior, 'nutrient_tanks'); if (rnd() < 0.5) ringPut(r, 'specimen_tank');
  // SCI-7 botany kit: potted plants on free tiles
  for (let i = 0; i < 2; i++) anyPut(r, interior, 'plant');
}
