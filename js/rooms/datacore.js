// Room layout: datacore (moved from the js/gen.js room switch). Backlog and rules: docs/rooms/datacore.md, docs/rooms/README.md.
// ctx: see js/rooms/index.js. Draw randomness only from ctx.rnd (this room's own stream); place blocking props through safePut / ringPut / anyPut / wallPut.
export function layout(ctx) {
  const { r, interior, ix0, iy0, ix1, iy1, cx, cy, rnd, put, safePut, ringPut, wallPut, anyPut, freeIn, has, reserved, faceTo, faceOpen, inRect, shuffle, grid, props } = ctx;
  wallPut(r, interior, 'commsstation'); if (interior.length > 1) wallPut(r, interior, 'relayrack');   // guaranteed pieces first, so the checkerboard cannot crowd them out
  if (interior.length > 1) safePut(r, cx, cy, 'servers');   // slot 2: a central core stack the rest stand around
  let n = 0; for (const [x, y] of interior) if ((x + y) % 2 === 0) safePut(r, x, y, (x + y) % 4 === 0 ? 'console' : n++ % 2 ? 'relayrack' : 'servers');   // OPS-4 relay racks among the stacks
  if (interior.length > 1) ringPut(r, 'servers', { face: 'out' });   // slot 10: a back-to-wall stack with its hot aisle behind it
  if (interior.length > 1) anyPut(r, interior, 'console', { near: [cx, cy] });   // slot 1: an operator console beside the core
  if (interior.length > 1) ringPut(r, 'crate', { only: 'corner', free: true });   // slot 4: spare parts crate tucked in a corner
}
// slot 3: wall fixtures weighted toward screens and breakers; sysboard added to the pool
export const dress = { decor: (pool) => [...pool, 'monitorB', 'sysboard_half', 'breaker', 'badgereader', 'camdome', 'extinguisher'], light: 0x8cb0ff, floor: 'grate', ceil: 'ceilm' };   // slot 7: cable-tray ceiling   // slot 6: a deeper rack-blue
