export const dress = { decor: (pool) => [...pool, 'sysboard'] };   // CMD-1 master systems board joins the wall-fixture pool
// Room layout: bridge (moved from the js/gen.js room switch). Backlog and rules: docs/rooms/bridge.md, docs/rooms/README.md.
// ctx: see js/rooms/index.js. Draw randomness only from ctx.rnd (this room's own stream); place blocking props through safePut / ringPut / anyPut / wallPut.
export function layout(ctx) {
  const { r, interior, ix0, iy0, ix1, iy1, cx, cy, rnd, put, safePut, ringPut, wallPut, anyPut, freeIn, has, reserved, faceTo, faceOpen, inRect, shuffle, grid, props } = ctx;
  put(cx, cy, 'chair', { rot: 0 }); put(ix1, iy0, 'console', { rot: 0 }); put(ix0, iy0, 'helm', { rot: 0 }); put(cx, iy0, 'viewscreen', { rot: 0 });   // helm forward port (FLT-1), facing the viewscreen; the console comes first so crew.js hosts alert on it and helm on the helm
  safePut(r, ix1, cy, 'navstation', { rot: 0 });                                                            // FLT-4 behind the forward starboard console
  for (const k of ['opsstation', 'commsstation', 'sensorstation']) ringPut(r, k, { ok: (x, y) => y !== r.y });   // OPS-2, OPS-3, SCI-2 on the side and aft walls (the forward wall is the viewscreen's)
  ringPut(r, 'desk', { door: true, ok: (x, y) => y !== r.y });                                               // yeoman desk by the door
  ringPut(r, 'wastebin', { corner: true, ok: (x, y) => y !== r.y });                                        // a bin tucked into an aft corner
}
