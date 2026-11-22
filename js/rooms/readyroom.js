// Room layout: readyroom (moved from the js/gen.js room switch). Backlog and rules: docs/rooms/readyroom.md, docs/rooms/README.md.
// rooms from the ship inventory: laid out from the existing prop kinds (a 3×3 room gets one centrepiece, bigger ones a pattern)
// ctx: see js/rooms/index.js. Draw randomness only from ctx.rnd (this room's own stream); place blocking props through safePut / ringPut / anyPut / wallPut.
export function layout(ctx) {
  const { r, interior, ix0, iy0, ix1, iy1, cx, cy, rnd, put, safePut, ringPut, wallPut, anyPut, freeIn, has, reserved, faceTo, faceOpen, inRect, shuffle, grid, props } = ctx;
  put(cx, cy, 'briefing_table', { rot: r.w >= r.h ? 0 : Math.PI / 2 }); ringPut(r, 'desk');
  ringPut(r, 'plant', { corner: true, free: true });    // one personal touch in a corner: a potted plant    // CMD-2 at the centre, the desk on a wall
}
// wall-fixture pool: more pictures and a comm panel; the captain's office is a quiet, warm room
export const dress = { decor: () => ['picture', 'picture', 'shelf', 'monitorB', 'comm', 'mirror'], light: 0xffcf94 };    // warmer lamplight
