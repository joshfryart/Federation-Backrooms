// Room layout: cargo (moved from the js/gen.js room switch). Backlog and rules: docs/rooms/cargo.md, docs/rooms/README.md.
// ctx: see js/rooms/index.js. Draw randomness only from ctx.rnd (this room's own stream); place blocking props through safePut / ringPut / anyPut / wallPut.
export function layout(ctx) {
  const { r, interior, ix0, iy0, ix1, iy1, cx, cy, rnd, put, safePut, ringPut, wallPut, anyPut, freeIn, has, reserved, faceTo, faceOpen, inRect, shuffle, grid, props } = ctx;
  for (const [x, y] of interior) if (rnd() < 0.65) { const u = rnd(); safePut(r, x, y, u < 0.45 ? 'crate' : u < 0.75 ? 'pallet_loaded' : 'pallet'); }   // SVC-6 pallets among the crates
  ringPut(r, 'console', { door: true }); ringPut(r, 'workbench', { door: true }); ringPut(r, 'hoversled', { door: true, along: true }); ringPut(r, 'cargo_pad');
  if (r.big) for (let i = 0; i < 4; i++) ringPut(r, 'shelving', { along: true, free: true });   // cargo racking along the walls of a big bay
}
