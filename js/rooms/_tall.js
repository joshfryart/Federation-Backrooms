// Tall-room shell (world.js TALL_H): pillars holding up the 5.6 m ceiling, and catwalk modules along the walls 2.6 m up, reached by grapple or mantle
// from a neighbouring prop. Moved from js/gen.js; runs after the room's own layout, on its own random stream (ctx.rnd here is seeded from '_tall', not the room type).
// Backlog: docs/rooms/tall.md.
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const TALL_TYPES = new Set(['shuttlebay', 'cargo', 'engineering', 'arboretum', 'mess', 'atrium']);
export const isTall = (r) => (r.big || r.type === 'atrium') && TALL_TYPES.has(r.type);
// ship_ladder placement: the prop's top rail sits 0.2 m behind its origin and its run is 1.5 m (js/propart-polish.js ship_ladder), so on the
// tile off a catwalk module's open end, pulling the origin 1.05 m toward the module puts the top rail on the tile edge, at the deck's end
export const LADDER_PULL = 1.05;
// tall-room panel light (main.js updatePanelLights, world.js panels): the pooled PointLight hangs at TALL_LIGHT.y (a high-bay fixture's throw,
// 0.6 m under the 5.6 m ceiling) with range TALL_LIGHT.dist, and its intensity is scaled so the floor right under it gets the same light as a
// normal 3.2 m room's floor (panel light 0.3 m under the ceiling, range 10, decay 1.5). Before: 5.3 m / range 10 gave ~2.9x less light on the floor.
export const PANEL = { y: 2.9, dist: 10, decay: 1.5 };
export const TALL_LIGHT = { y: 5.0, dist: 14 };
export const atten = (d, decay, cutoff) => { const w = Math.max(0, 1 - (d / cutoff) ** 4); return w * w / Math.max(d ** decay, 0.01); };   // three.js getDistanceAttenuation (physically based lights)
export const tallLightMul = (y = TALL_LIGHT.y, dist = TALL_LIGHT.dist) => atten(PANEL.y, PANEL.decay, PANEL.dist) / atten(y, PANEL.decay, dist);
export function layout(ctx) {
  const { safePut, ringPut, anyPut, reserved, r, interior, ix0, iy0, ix1, iy1, rnd, grid } = ctx;
  // a ship_ladder (R-4, 60 degrees) up to a catwalk. ringPut's `along` turns a module's long axis (local x, the open ends; the rails run on its
  // long sides) out from the wall, so the module is a pier: one end at the wall, the other over the tile in front of it. The ladder stands on that
  // front tile, climbing toward the wall; its origin is pulled LADDER_PULL m toward the module (world.js applies p.off) so the top rail meets the
  // deck's open end, and +z (the foot) points into the room. One per room, placed first (before the pillars and the other modules) because these
  // halls are crowded by the room's own layout and their walls are porous (gaps count as doorways): a closed-backed wall tile with a free tile
  // in front. Deterministic (farthest from a doorway first), no random draws; ringPut and the pillar pass draw the same numbers as before, so
  // the rest of the room keeps its stream (only the two tiles taken are skipped). Through safePut: the room stays one walkable piece.
  const doorD = (x, y) => { let d = 1e9; for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) if (grid[yy][xx] === 0 && DIRS.some(([a, b]) => !ctx.inRect(r, xx + a, yy + b) && grid[yy + b]?.[xx + a] === 0)) d = Math.min(d, Math.abs(xx - x) + Math.abs(yy - y)); return d; };
  const wallIn = (x, y) => { const out = DIRS.filter(([a, b]) => !ctx.inRect(r, x + a, y + b)); return out.length === 1 && grid[y + out[0][1]]?.[x + out[0][0]] !== 0 ? [-out[0][0], -out[0][1]] : null; };   // inward dir of a closed-backed (not a doorway), non-corner ring tile
  const free = (x, y) => ctx.inRect(r, x, y) && grid[y]?.[x] === 0 && !reserved.has(x + ',' + y);
  const ladderBy = (c) => {   // c: a catwalk prop; the ladder goes on a free tile off one of its open ends (local +-x), room side first
    const ex = Math.round(Math.cos(c.rot)), ey = Math.round(-Math.sin(c.rot)), ends = [[ex, ey], [-ex, -ey]].filter(([a, b]) => a || b);
    if (c.front) ends.sort((p, q) => (q[0] === c.front[0] - c.tx && q[1] === c.front[1] - c.ty) - (p[0] === c.front[0] - c.tx && p[1] === c.front[1] - c.ty));
    for (const [ax, ay] of ends) {
      const lx = c.tx + ax, ly = c.ty + ay; if (!free(lx, ly)) continue;
      const p = safePut(r, lx, ly, 'ship_ladder', { rot: ctx.faceTo(ax, ay), cw: [c.tx, c.ty], off: [-ax * LADDER_PULL, -ay * LADDER_PULL] });
      if (p) { c.ladder = [lx, ly]; return p; }
    }
    return null;
  };
  const pair = (() => {
    const cand = []; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { const inw = free(x, y) && wallIn(x, y); if (inw && free(x + inw[0], y + inw[1])) cand.push([x, y, inw, doorD(x, y)]); }
    cand.sort((a, b) => b[3] - a[3] || a[1] - b[1] || a[0] - b[0]);
    for (const [x, y, [ix, iy]] of cand) {
      const c = safePut(r, x, y, 'catwalk', { rot: ctx.faceTo(ix, iy) + Math.PI / 2, wall: true }); if (!c) continue; c.front = [x + ix, y + iy];   // as ringPut(along) turns it
      if (ladderBy(c)) return c;
      grid[y][x] = 0; ctx.props.splice(ctx.props.indexOf(c), 1);   // no ladder fits in front of it: take the module back out
    }
    return null;
  })();
  // pillars: a lattice every third tile, only where the room stays walkable (safePut). Layout varies per room: lattice, two colonnades,
  // a ring just inside the walls, or a sparse scatter; shifted by 0-2 tiles so no two halls share a pattern
  const pv = Math.floor(rnd() * 4), sx = Math.floor(rnd() * 3), sy = Math.floor(rnd() * 3), long = r.w >= r.h;
  for (const [x, y] of interior) {
    if (grid[y][x] !== 0 || reserved.has(x + ',' + y)) continue;
    const a = (x - ix0 + sx) % 3 === 1, b = (y - iy0 + sy) % 3 === 1, edge = x === ix0 || x === ix1 || y === iy0 || y === iy1;
    const ok = pv === 0 ? a && b
      : pv === 1 ? (long ? a && (y === iy0 + 1 || y === iy1 - 1) : b && (x === ix0 + 1 || x === ix1 - 1))   // two colonnades along the long axis
      : pv === 2 ? edge && (long ? a : b) || (edge && a && b)                                           // ring of pillars at the rim
      : a && b && rnd() < 0.45;                                                                        // sparse
    if (ok) safePut(r, x, y, 'pillar', { rot: 0 });
  }
  // mezzanine catwalk modules
  const n = r.type === 'shuttlebay' ? 2 : 3, cws = []; for (let i = 0; i < n; i++) { const cw = ringPut(r, 'catwalk', { along: true, free: true }); if (cw) cws.push(cw); }
  // a step-up crate stack near each catwalk foot, so the deck can be mantled from a neighbouring prop
  for (const c of cws) anyPut(r, interior, 'crate', { near: [c.tx, c.ty] });
  if (pair) cws.push(pair);   // the laddered module joins the list after the crates (it needs no step-up; the later anyPut picks only read cws[0] / the last module)
  // service stands beside a couple of pillars in engineering / cargo / shuttlebay (tools for the high-bay crews)
  if (r.type === 'engineering' || r.type === 'cargo' || r.type === 'shuttlebay') { const ps = ctx.props.filter(p => p.kind === 'pillar' && ctx.inRect(r, p.tx, p.ty)); for (let i = 0; i < Math.min(2, ps.length); i++) { const p = ps[Math.floor(rnd() * ps.length)]; anyPut(r, interior, 'maint_stand', { near: [p.tx, p.ty] }); } }
  // a loading pad near the middle of cargo halls (the spot the catwalks look down on)
  if (r.type === 'cargo' && !ctx.has(r, 'cargo_pad')) anyPut(r, interior, 'cargo_pad', { near: [ctx.cx, ctx.cy] });
  // a wastebin on the rim of every atrium and mess hall, where crowds gather under the catwalks
  if (r.type === 'atrium' || r.type === 'mess') ringPut(r, 'wastebin', { free: true });
  // a pallet of stock in the shadow of the first catwalk of a cargo or engineering hall
  if ((r.type === 'cargo' || r.type === 'engineering') && cws[0]) anyPut(r, interior, r.type === 'cargo' ? 'pallet_loaded' : 'pallet', { near: [cws[0].tx, cws[0].ty], min: [cws[0].tx, cws[0].ty, 2] });
  // a fuel bowser parked against the rim of a shuttlebay, for the craft under the high-bay lights
  if (r.type === 'shuttlebay') ringPut(r, 'fuelbowser', { free: true, along: true });
  // a hover sled left in cargo and engineering halls, parked well away from the first catwalk
  if ((r.type === 'cargo' || r.type === 'engineering') && cws[0]) anyPut(r, interior, 'hoversled', { min: [cws[0].tx, cws[0].ty, 4] });
  // a bench under the last catwalk of an atrium or mess hall: somewhere to sit out of the high-bay glare
  if ((r.type === 'atrium' || r.type === 'mess') && cws.length) { const c = cws[cws.length - 1]; anyPut(r, interior, 'sofa', { near: [c.tx, c.ty] }); }
  // a console at the rim of engineering and shuttlebay halls: the high-bay crew's status board
  if (r.type === 'engineering' || r.type === 'shuttlebay') ringPut(r, 'console', { door: true });
  // shelving at the rim of tall cargo halls, tall enough to reach toward the catwalks
  if (r.type === 'cargo') ringPut(r, 'shelving', { along: true });
  // a second crate in cargo halls, tucked beside the pillar nearest the centre (spilled stock between the columns)
  if (r.type === 'cargo') { const ps = ctx.props.filter(p => p.kind === 'pillar' && ctx.inRect(r, p.tx, p.ty)).sort((a, b) => Math.abs(a.tx - ctx.cx) + Math.abs(a.ty - ctx.cy) - Math.abs(b.tx - ctx.cx) - Math.abs(b.ty - ctx.cy)); if (ps[0]) anyPut(r, interior, 'crate', { near: [ps[0].tx, ps[0].ty] }); }
  // a potted plant at the rim of tall arboretum halls, planted under the catwalks
  if (r.type === 'arboretum') ringPut(r, 'plant', { free: true });
}
