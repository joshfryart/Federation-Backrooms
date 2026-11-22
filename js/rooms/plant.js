// Room layout: plant (moved from the js/gen.js room switch). Backlog and rules: docs/rooms/plant.md, docs/rooms/README.md.
// ctx: see js/rooms/index.js. Draw randomness only from ctx.rnd (this room's own stream); place blocking props through safePut / ringPut / anyPut / wallPut.
export function layout(ctx) {
  const { r, interior, ix0, iy0, ix1, iy1, cx, cy, rnd, put, safePut, ringPut, wallPut, anyPut, freeIn, has, reserved, faceTo, faceOpen, inRect, shuffle, grid, props } = ctx;
  const PLANT = ['pumpskid', 'heatexch', 'scrubber', 'tank', 'console', 'pumpskid'];   // ENG-1/4/5 among the old vessels and consoles, on a diagonal grid
  let i = Math.floor(rnd() * 3); for (const [x, y] of interior) if ((x + y) % 2 === 0 || interior.length === 1) { const k = PLANT[i++ % PLANT.length]; safePut(r, x, y, k, k === 'heatexch' || k === 'pumpskid' ? { rot: rnd() < 0.5 ? 0 : Math.PI } : {}); }
  if (interior.length > 1) ringPut(r, 'console', { door: true });   // plant operator console against the wall near the entrance
}
