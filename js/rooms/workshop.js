// Room layout: workshop (moved from the js/gen.js room switch). Backlog and rules: docs/rooms/workshop.md, docs/rooms/README.md.
// ctx: see js/rooms/index.js. Draw randomness only from ctx.rnd (this room's own stream); place blocking props through safePut / ringPut / anyPut / wallPut.
export function layout(ctx) {
  const { r, interior, ix0, iy0, ix1, iy1, cx, cy, rnd, put, safePut, ringPut, wallPut, anyPut, freeIn, has, reserved, faceTo, faceOpen, inRect, shuffle, grid, props } = ctx;
  let lathes = 0;   // ENG-14: every other lathe a knee mill, a drill press on the wall
  for (const [x, y] of interior) if ((x + y) % 2 === 0) safePut(r, x, y, (x + y) % 4 === 0 ? (lathes++ % 2 ? 'knee_mill' : 'lathe') : (x + y) % 8 === 2 ? 'fabricator' : 'workbench');
  if (!props.some(p => p.kind === 'fabricator' && inRect(r, p.tx, p.ty))) { const wb = props.find(p => p.kind === 'workbench' && inRect(r, p.tx, p.ty)); if (wb) wb.kind = 'fabricator'; else ringPut(r, 'fabricator'); }   // at least one ENG-7 per shop
  wallPut(r, interior, 'drill_press');
  if (interior.length > 1 && !has(r, 'knee_mill')) anyPut(r, interior, 'knee_mill') || ringPut(r, 'knee_mill');   // safePut can drop the pattern's mill: keep one per shop
  ringPut(r, 'shelving');   // parts bins along the wall
  if (interior.length > 1) anyPut(r, interior, 'wastebin');   // swarf bin
  if (interior.length > 1) anyPut(r, interior, 'cart');   // parts cart
  if (r.big) ringPut(r, 'maint_stand');   // tooling stand in big shops
  if (r.big) ringPut(r, 'injector_crate', { only: 'corner', free: true });   // stock crate in a corner
  if (r.big) ringPut(r, 'workbench', { along: 'x' });   // second bench against the wall
}
