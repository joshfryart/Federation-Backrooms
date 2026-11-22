// Room layout: gym (moved from the js/gen.js room switch). Backlog and rules: docs/rooms/gym.md, docs/rooms/README.md.
// ctx: see js/rooms/index.js. Draw randomness only from ctx.rnd (this room's own stream); place blocking props through safePut / ringPut / anyPut / wallPut.
export function layout(ctx) {
  const { r, interior, ix0, iy0, ix1, iy1, cx, cy, rnd, put, safePut, ringPut, wallPut, anyPut, freeIn, has, reserved, faceTo, faceOpen, inRect, shuffle, grid, props } = ctx;
  // SVC-11 sparring mat first (the 'mat' spot), then the machines (SVC-18) on a checkerboard; rack and dummy on the walls
  const G = ['sparring_set', 'treadmill', 'exercise_bike', 'rower', 'weightbench', 'mat']; let i = 0;
  for (const [x, y] of interior) if ((x + y) % 2 === (cx + cy) % 2 && safePut(r, x, y, G[i % G.length], { rot: rnd() < 0.5 ? 0 : Math.PI })) i++;
  wallPut(r, interior, 'dumbbell_rack'); for (const k of ['treadmill', 'exercise_bike']) if (!has(r, k)) ringPut(r, k, { along: k === 'treadmill' }); ringPut(r, 'grapple_dummy', { only: 'corner', free: true });
  // slot 2: make sure the sparring mat exists as the focal piece, next to the centre
  if (interior.length > 1 && !has(r, 'mat')) anyPut(r, interior, 'mat', { near: [cx, cy] });
  // slot 4 clutter: a towel bin in a corner of the bigger rooms
  if (interior.length > 1) ringPut(r, 'wastebin', { only: 'corner' });
}
// slot 3 wall fixtures: motivational posters join the pool and mirrors are weighted double (gym wall of glass)
export const dress = { decor: (pool) => [...pool, 'picture', 'mirror'], light: 0xf8ffff };   // slot 6: a touch cooler, brighter white
