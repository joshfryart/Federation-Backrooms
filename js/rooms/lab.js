// Room layout: lab (moved from the js/gen.js room switch). Backlog and rules: docs/rooms/lab.md, docs/rooms/README.md.
// ctx: see js/rooms/index.js. Draw randomness only from ctx.rnd (this room's own stream); place blocking props through safePut / ringPut / anyPut / wallPut.
export function layout(ctx) {
  const { r, interior, ix0, iy0, ix1, iy1, cx, cy, rnd, put, safePut, ringPut, wallPut, anyPut, freeIn, has, reserved, faceTo, faceOpen, inRect, shuffle, grid, props } = ctx;
  if (interior.length === 1) put(cx, cy, 'charttable', { rot: r.w >= r.h ? 0 : Math.PI / 2 });   // SCI-3 chart table, the 1-tile centrepiece of a 3x3 lab
  else {
    safePut(r, cx, cy, 'charttable', { rot: r.w >= r.h ? 0 : Math.PI / 2 });
    for (const [x, y] of interior) if ((x !== cx || y !== cy) && (x + y) % 2 === 0) safePut(r, x, y, (x + y) % 4 === 0 ? 'console' : 'labbench', { rot: faceOpen(x, y, cx - x, cy - y) });   // checkerboard benches
  }
  for (const k of ['spectrometer', 'sensorstation', 'fumehood']) wallPut(r, interior, k); ringPut(r, 'samplefridge', { only: 'corner', free: true }); ringPut(r, 'specimen_tank');    // SCI-4, SCI-8, SCI-2, SCI-9, SCI-5 on the walls
}
