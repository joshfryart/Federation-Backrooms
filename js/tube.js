// Jiffy-tube topology shared by the generator, World, the nav fields, hostile / crew pathing and the tests (pure data, no three.js).
// A tube tile is straight (tubeAxis 'x' | 'y': open on the two edges along the axis) or a bend (tubeAxis 'xy': open on exactly two
// perpendicular edges, listed in d.tubeBend[i] = [[dx, dy], [dx, dy]] = the directions toward the previous and the next tile).
// Every reader asks the same question through these helpers so the "tubes are entered end-on only" rule has one definition.

/** can you leave tile i of this deck in direction (dx, dy)? True for any tile that is not a tube. */
export function tubeOpen(d, i, dx, dy) {
  const a = d.tubeAxis[i]; if (!a) return true;
  if (a === 'x') return dy === 0; if (a === 'y') return dx === 0;
  return !!d.tubeBend?.[i]?.some(([x, y]) => x === dx && y === dy);
}
/** may a body step from tile ia to its neighbour ib = ia + (dx, dy)? Both tiles must be open on the shared edge. */
export const tubeStep = (d, ia, ib, dx, dy) => tubeOpen(d, ia, dx, dy) && tubeOpen(d, ib, -dx, -dy);
/** the open edges of tube tile i as [dx, dy] pairs ([] for a non-tube) */
export function tubeDirs(d, i) {
  const a = d.tubeAxis[i]; if (!a) return [];
  if (a === 'x') return [[1, 0], [-1, 0]]; if (a === 'y') return [[0, 1], [0, -1]];
  return d.tubeBend[i];
}
/**
 * The tube's own side walls on tile i as boxes [offset x, offset z, half x, half z] from the tile centre.
 * Straight: a wall along each side. Bend: a full wall on each closed edge plus a square pillar at the inner corner
 * (between the two open edges), so the crawlway is an L with a solid inside corner.
 */
export function tubeBoxes(d, i, TS, SIDE) {
  const h = TS / 2, s = SIDE / 2, o = h - s, out = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (tubeOpen(d, i, dx, dy)) continue;   // an open edge has no wall
    out.push(dx ? [dx * o, 0, s, h] : [0, dy * o, h, s]);
  }
  const bend = d.tubeAxis[i] === 'xy' ? d.tubeBend[i] : null;
  if (bend) { const cx = bend[0][0] + bend[1][0], cy = bend[0][1] + bend[1][1]; out.push([cx * o, cy * o, s, s]); }
  return out;
}
