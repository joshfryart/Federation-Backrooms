// Tall-room shell (world.js TALL_H): pillars holding up the 5.6 m ceiling, and catwalk modules along the walls 2.6 m up, reached by grapple or mantle
// from a neighbouring prop. Moved from js/gen.js; runs after the room's own layout, on its own random stream (ctx.rnd here is seeded from '_tall', not the room type).
// Backlog: docs/rooms/tall.md.
export const TALL_TYPES = new Set(['shuttlebay', 'cargo', 'engineering', 'arboretum', 'mess', 'atrium']);
export const isTall = (r) => (r.big || r.type === 'atrium') && TALL_TYPES.has(r.type);
export function layout(ctx) {
  const { safePut, ringPut, reserved, r, interior, ix0, iy0, ix1, iy1, rnd, grid } = ctx;
  // pillars: a lattice every third tile, only where the room stays walkable (safePut). Layout varies per room: lattice, two colonnades,
  // a ring just inside the walls, or a sparse scatter; shifted by 0-2 tiles so no two halls share a pattern
  const pv = Math.floor(rnd() * 4), sx = Math.floor(rnd() * 3), sy = Math.floor(rnd() * 3), long = r.w >= r.h;
  for (const [x, y] of interior) {
    if (grid[y][x] !== 0 || reserved.has(x + ',' + y)) continue;
    const a = (x - ix0 + sx) % 3 === 1, b = (y - iy0 + sy) % 3 === 1, edge = x === ix0 || x === ix1 || y === iy0 || y === iy1;
    const ok = pv === 0 ? a && b
      : pv === 1 ? (long ? a && (y === iy0 + 1 || y === iy1 - 1) : b && (x === ix0 + 1 || x === ix1 - 1))   // two colonnades along the long axis
      : pv === 2 ? edge && (long ? a : b) || (edge && a && b)                                           // ring of pillars at the rim
      : a && b && rnd() < 0.45;                                                                        // sparse
    if (ok) safePut(r, x, y, 'pillar', { rot: 0 });
  }
  // mezzanine catwalk modules
  const n = r.type === 'shuttlebay' ? 2 : 3; for (let i = 0; i < n; i++) ringPut(r, 'catwalk', { along: true, free: true });
}
