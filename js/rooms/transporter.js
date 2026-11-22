// Room layout: transporter (moved from the js/gen.js room switch). Backlog and rules: docs/rooms/transporter.md, docs/rooms/README.md.
// ctx: see js/rooms/index.js. Draw randomness only from ctx.rnd (this room's own stream); place blocking props through safePut / ringPut / anyPut / wallPut.
export function layout(ctx) {
  const { r, interior, ix0, iy0, ix1, iy1, cx, cy, rnd, put, safePut, ringPut, wallPut, anyPut, freeIn, has, reserved, faceTo, faceOpen, inRect, shuffle, grid, props } = ctx;
  put(cx, cy, 'pad'); ringPut(r, 'beampedestal', { face: 'out' }); ringPut(r, 'workbench');
  for (let i = 0; i < 2; i++) ringPut(r, 'buffertank', { only: 'corner', free: true });   // OPS-6 pattern buffers x2 in the corners
  // OPS-1 with its back to the pad: the chief looks over it at the pad
}
export const dress = {
  decor: (pool) => [...pool, 'panelbox', 'breaker'],   // slot 3: power conditioning around the emitters
};
