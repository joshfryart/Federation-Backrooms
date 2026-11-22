// Tall-room shell (world.js TALL_H): pillars holding up the 5.6 m ceiling, and catwalk modules along the walls 2.6 m up, reached by grapple or mantle
// from a neighbouring prop. Moved from js/gen.js; runs after the room's own layout, on its own random stream (ctx.rnd here is seeded from '_tall', not the room type).
// Backlog: docs/rooms/tall.md.
export const TALL_TYPES = new Set(['shuttlebay', 'cargo', 'engineering', 'arboretum', 'mess', 'atrium']);
export const isTall = (r) => (r.big || r.type === 'atrium') && TALL_TYPES.has(r.type);
export function layout(ctx) {
  const { safePut, ringPut, anyPut, reserved, r, interior, ix0, iy0, ix1, iy1, rnd, grid } = ctx;
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
}
