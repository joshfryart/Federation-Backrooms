// Room layout: engineering (moved from the js/gen.js room switch). Backlog and rules: docs/rooms/engineering.md, docs/rooms/README.md.
// ctx: see js/rooms/index.js. Draw randomness only from ctx.rnd (this room's own stream); place blocking props through safePut / ringPut / anyPut / wallPut.
export function layout(ctx) {
  const { r, interior, ix0, iy0, ix1, iy1, cx, cy, rnd, put, safePut, ringPut, wallPut, anyPut, freeIn, has, reserved, faceTo, faceOpen, inRect, shuffle, grid, props } = ctx;
  put(cx, cy, 'warpcore'); put(ix0, iy0, 'console'); put(ix1, iy1, 'console');
  put(cx, cy - 1, 'reactorstation', { rot: Math.PI }); reserved.add(cx + ',' + (cy - 2));   // ENG-3 beside the core, its back to it: the operator looks over the desk at the core
  // ENG-6 field generators (2.2 m long): away from the core, both ends of the long axis clear
  const gens = interior.length >= 4 ? ['fieldgen', 'fieldgen_damp'] : ['fieldgen'];
  for (const k of gens) {
    let done = false;
    for (const [x, y] of shuffle(freeIn(), rnd)) {   // Fisher-Yates: a random sort comparator gave a different order per JS engine (node vs Chromium built different decks from one seed)
      if (Math.abs(x - cx) + Math.abs(y - cy) < 2) continue;
      for (const [ax, ay] of rnd() < 0.5 ? [[1, 0], [0, 1]] : [[0, 1], [1, 0]]) {
        const ends = [[x + ax, y + ay], [x - ax, y - ay]]; if (!ends.every(([ex, ey]) => grid[ey]?.[ex] === 0)) continue;
        if (safePut(r, x, y, k, { rot: ax ? 0 : Math.PI / 2 })) { for (const [ex, ey] of ends) reserved.add(ex + ',' + ey); done = true; break; }
      }
      if (done) break;
    }
  }
  anyPut(r, interior, 'plottable', { near: [cx, cy - 1], min: [cx, cy, 1], rot: 0 }) || ringPut(r, 'plottable');   // ENG-15 on the open floor near the reactor station, else on a wall
  ringPut(r, 'injector_crate', { only: 'corner', free: true });                       // ENG-13 spare injector
  if (interior.length >= 15) { for (const k of ['desk', 'workbench']) { const t = freeIn().find(([x, y]) => Math.abs(x - cx) + Math.abs(y - cy) >= 2); if (t) safePut(r, t[0], t[1], k, { rot: faceOpen(t[0], t[1], cx - t[0], cy - t[1]) }); } }   // big layout: CE desk and a bench (asset-gaps 11.8)
  if (interior.length >= 15) { ringPut(r, 'pumpskid'); ringPut(r, 'heatexch'); }   // big engine room: a coolant pump skid and a heat exchanger (ENG-1 / ENG-4) on the walls
  ringPut(r, 'scrubber');   // ENG-5 twin-bed air scrubber on a wall, every size
}
// Per-room dressing (js/world.js tables). Backlog slot 3: ENG-11 foam station joins the wall-fixture pool.
export const dress = {
  decor: (pool) => [...pool, 'foamstation'],
};
