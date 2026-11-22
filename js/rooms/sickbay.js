// Room layout: sickbay (moved from the js/gen.js room switch). Backlog and rules: docs/rooms/sickbay.md, docs/rooms/README.md.
// ctx: see js/rooms/index.js. Draw randomness only from ctx.rnd (this room's own stream); place blocking props through safePut / ringPut / anyPut / wallPut.
export function layout(ctx) {
  const { r, interior, ix0, iy0, ix1, iy1, cx, cy, rnd, put, safePut, ringPut, wallPut, anyPut, freeIn, has, reserved, faceTo, faceOpen, inRect, shuffle, grid, props } = ctx;
  if (interior.length >= 9) {   // two biobeds beside the centre bed, the medical kit round them, one side of the centre left open
    const sg = rnd() < 0.5 ? 1 : -1;
    for (const [dx, dy, k] of [[0, 0, 'biobed'], [-1, 0, 'biobed'], [1, 0, 'biobed'], [0, -1, 'nursestation'], [-1, -1, 'surgical_table'], [1, -1, 'exam_couch'], [-1, 1, 'steriliser'], [1, 1, 'med_dispenser']]) {
      const x = cx + dx, y = cy + dy * sg; if (grid[y][x] !== 0) continue;
      safePut(r, x, y, k, k === 'nursestation' ? { rot: faceTo(0, sg) } : k === 'steriliser' || k === 'med_dispenser' ? { rot: faceTo(0, sg) } : k === 'surgical_table' || k === 'exam_couch' ? { rot: rnd() < 0.5 ? 0 : Math.PI } : {});
    }
    ringPut(r, 'infusion_stand', { corner: true });
  } else {
    for (const [x, y] of interior) if (rnd() < 0.7 || (x === cx && y === cy)) { if (interior.length === 1) put(x, y, 'biobed'); else safePut(r, x, y, 'biobed', { rot: r.w >= r.h ? 0 : Math.PI / 2 }); }   // a lone centre bed may be bare; longer rooms go through safePut, beds along the long axis
    ringPut(r, 'nursestation');
    if (interior.length > 1) { ringPut(r, 'exam_couch'); ringPut(r, 'med_dispenser'); ringPut(r, 'infusion_stand', { only: 'corner', free: true }); }
  }
}

// wall-fixture pool (backlog 3): a second medical cabinet and a monitor over the beds; the world.js default keeps its gas panels
export const dress = { decor: (pool) => [...pool, 'monitorG', 'medcab'] };
