// Batch 7: bridge wall fixture in the format of the DECOR kits in js/world.js (closures over the Kit class: K.box / K.cyl / K.cone, vertex colours,
// +z out of the wall, +x along the wall, 0 to 3.2 m high). The integrator spreads DECOR_BRIDGE into DECOR (and adds the name to ROOM_DECOR.bridge):
//   sysboard   CMD-1 master systems board: 3.6 m wide x 1.24 m high x 0.12 m deep, dark glass face with a simplified side-view hull outline (an original abstract
//              silhouette) and 20 glowing system tiles (one per SYSTEMS entry: green nominal, amber caution, one red), a ledge with twelve labelled keys under it.
//              Mount height 1.38 to 2.82 m.  Needs a 3.8 m clear wall run; in a smaller room use the 'sysboard_half' variant (1.8 m).
const DK = 0x23262d, MT = 0x8f959e, WHT = 0xdfe6ea, RD = 0xb02820, YL = 0xd8a818, STEEL = 0x5a6068, GLASS = 0x070d14, CREAM = 0xe8e4d0;
const GB = [0.35, 1.25, 2.0], GO = [2.0, 0.85, 0.25], GG = [0.3, 1.7, 0.75], GR = [2.0, 0.2, 0.12], GW = [1.2, 1.5, 1.7];

function board(K, S) {   // S = 1 full width, 0.5 half; every x is scaled by S
  const W = 3.6 * S, cy = 2.2;
  K.box(W + 0.08, 1.28, 0.1, 0, cy, STEEL).box(W, 1.2, 0.012, 0, cy, GLASS, 0.1);                                  // bezel + dark glass face
  for (const sx of [-1, 1]) K.box(0.05, 0.12, 0.1, sx * (W / 2 - 0.2), cy + 0.7, DK, 0.0);                          // top brackets
  const seg = (x1, y1, x2, y2, c = GO) => { const dx = (x2 - x1) * S, dy = y2 - y1, len = Math.hypot(dx, dy); K.box(len + 0.012, 0.014, 0.006, (x1 + x2) / 2 * S, (y1 + y2) / 2, c, 0.112, true, Math.atan2(dy, dx)); };
  const hull = [[-1.5, 1.88], [-1.5, 2.26], [-1.0, 2.4], [0.45, 2.44], [1.05, 2.32], [1.55, 2.14], [1.05, 1.9], [-1.0, 1.84]];     // side-view outline (original abstract hull)
  hull.forEach((p, i) => { const q = hull[(i + 1) % hull.length]; seg(p[0], p[1], q[0], q[1]); });
  seg(-0.35, 2.44, -0.25, 2.62); seg(-0.25, 2.62, 0.5, 2.62); seg(0.5, 2.62, 0.55, 2.43);                           // dorsal fairing
  seg(-1.4, 1.72, -0.2, 1.72, GB); seg(-1.4, 1.72, -1.45, 1.86, GB); seg(-0.2, 1.72, -0.15, 1.86, GB);              // lower pod
  for (const y of [2.0, 2.15, 2.3]) seg(-1.0, y, 1.0, y, [0.5, 0.35, 0.12]);                                       // deck lines
  seg(1.05, 2.32, 1.05, 1.9, [0.5, 0.35, 0.12]); seg(-1.0, 2.4, -1.0, 1.84, [0.5, 0.35, 0.12]);                     // bulkheads
  const tiles = [[-1.35, 2.1], [-1.2, 2.2], [-1.2, 1.98], [-0.9, 2.3], [-0.7, 2.08], [-0.5, 2.22], [-0.3, 2.0], [-0.1, 2.34], [0.1, 2.12], [0.3, 2.26], [0.5, 2.04], [0.7, 2.2], [0.85, 2.08], [1.2, 2.14], [-1.0, 1.77], [-0.6, 1.77], [-0.3, 1.77], [0.2, 2.55], [-0.05, 2.55], [0.35, 2.55]];
  tiles.forEach(([x, y], i) => K.box(0.12, 0.07, 0.008, x * S, y - 0.035, i === 10 ? GR : i === 4 || i === 13 ? GO : GG, 0.114, true));   // 20 system tiles
  K.box(W + 0.08, 0.05, 0.22, 0, 1.54, STEEL).box(W, 0.02, 0.2, 0, 1.57, DK, 0.0);                                  // key ledge
  const nk = S < 1 ? 6 : 12;
  for (let i = 0; i < nk; i++) { const x = (i - (nk - 1) / 2) * (W - 0.4) / (nk - 1); K.box(0.14, 0.045, 0.1, x, 1.585, i % 5 === 3 ? RD : WHT, 0.06).box(0.12, 0.02, 0.004, x, 1.5, CREAM, 0.2); }
  K.box(0.5, 0.02, 0.006, -W / 2 + 0.3, 2.86, WHT, 0.0).box(0.06, 0.06, 0.008, W / 2 - 0.1, 1.64, GG, 0.1, true);
  void MT; void YL; void WHT;
}
export const DECOR_BRIDGE = {
  sysboard(K) { board(K, 1); },
  sysboard_half(K) { board(K, 0.5); },
};
