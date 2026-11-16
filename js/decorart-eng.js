// Batch 3: engineering wall fixtures in the format of the DECOR kits in js/world.js (closures over the Kit class: K.box / K.cyl / K.cone, vertex colours,
// +z out of the wall, +x along the wall, 0 to 3.2 m high). The integrator spreads DECOR_ENG into DECOR (and adds names to ROOM_DECOR pools):
//   foamstation  ENG-11 fixed foam station: manifold, two isolation valves, 60 L concentrate tank with sight glass, gauge, red nozzle line to the ceiling (1.0 m wide, 0.5 deep)
//   hosecab      foam hose cabinet: red wall cabinet with glazed front, hose reel and nozzle (0.8 x 0.9 x 0.24)
//   panelbox     closed electrical panel box with pilot lamps, latch and conduit (0.5 x 0.72 x 0.14)
//   panelopen    open distribution board: door swung out, 8 toggle breakers, bus bars, cable loom (0.62 x 0.86 x 0.14 + door 0.58 out)
// Constants mirror world.js (DK, MT, WHT, RD, YL, GRN, STEEL, GG, GO, GB, GR, WH = wall height 3.2).
const DK = 0x23262d, MT = 0x8f959e, WHT = 0xdfe6ea, RD = 0xb02820, YL = 0xd8a818, GRN = 0x2f8a48, STEEL = 0x5a6068, WH = 3.2;
const GB = [0.35, 1.25, 2.0], GO = [2.0, 0.85, 0.25], GG = [0.3, 1.7, 0.75], GR = [2.0, 0.2, 0.12];
const DRED = 0x8a1a14, COPPER = 0xb8703c, GLASS = 0x9ac8e0, CREAM = 0xe8e4d0, FOAM = 0xd05a28;

export const DECOR_ENG = {
  foamstation(K) {
    K.box(1.0, 1.2, 0.03, 0, 1.3, DRED).box(1.04, 0.04, 0.05, 0, 1.92, STEEL).box(1.04, 0.04, 0.05, 0, 0.68, STEEL);
    // 60 L concentrate tank (0.4 m x 0.48 m), floor standing against the wall on the left, plinth, dished top, filler cap, sight glass
    K.box(0.5, 0.03, 0.5, -0.35, 0.015, DK).cyl(0.2, 0.46, -0.35, 0.26, RD, 0.04).cyl(0.2, 0.03, -0.35, 0.505, MT, 0.04).cyl(0.07, 0.05, -0.35, 0.545, DK, 0.17)
      .box(0.05, 0.34, 0.012, -0.35, 0.27, GLASS, 0.44).box(0.03, 0.2, 0.006, -0.35, 0.2, FOAM, 0.452).box(0.07, 0.012, 0.006, -0.35, 0.44, DK, 0.452).box(0.07, 0.012, 0.006, -0.35, 0.1, DK, 0.452);
    // tank outlet up the wall to the manifold
    K.cyl(0.03, 0.14, -0.35, 0.6, MT, 0.17).cyl(0.03, 0.2, -0.35, 0.66, MT, 0.04, 'z').cyl(0.03, 0.55, -0.35, 0.94, RD, 0.07);
    // manifold with a proportioner body between two quarter-turn isolation valves
    K.cyl(0.04, 0.9, 0.05, 1.2, RD, 0.07, 'x').box(0.26, 0.12, 0.12, 0.05, 1.2, STEEL, 0.02);
    for (const [x, open] of [[-0.18, true], [0.3, false]]) {
      K.cyl(0.055, 0.1, x, 1.2, MT, 0.065, 'x').cyl(0.014, 0.1, x, 1.3, MT, 0.065);
      if (open) K.box(0.2, 0.03, 0.03, x + 0.08, 1.36, YL, 0.14); else K.box(0.03, 0.2, 0.03, x, 1.42, YL, 0.14);   // lever along the pipe = open, across = shut
      K.box(0.06, 0.08, 0.006, x, 1.1, open ? 0x2f8a48 : RD, 0.13);                                             // valve state tag
    }
    // pressure gauge
    K.cyl(0.015, 0.3, 0.2, 1.4, MT, 0.07).cyl(0.09, 0.04, 0.2, 1.56, DK, 0.05, 'z', false, 16).cyl(0.075, 0.01, 0.2, 1.56, 0xe8e0c8, 0.09, 'z', false, 16).box(0.012, 0.07, 0.006, 0.2, 1.58, RD, 0.1, false, -0.6);
    // red nozzle line from the manifold end up to the ceiling, clamped, with a deflector nozzle
    K.cyl(0.035, 2.0, 0.5, 2.2, RD, 0.07);
    for (const y of [1.55, 2.15, 2.75]) K.box(0.1, 0.05, 0.05, 0.5, y, DK, 0.04);
    K.cyl(0.05, 0.05, 0.5, 3.1, MT, 0.08).cone(0.07, 0.12, 0.5, 3.15, YL, 0.08);
    // placards (blank) and a lit status lamp
    K.box(0.46, 0.14, 0.006, -0.2, 1.8, WHT, 0.03).box(0.38, 0.04, 0.006, -0.2, 1.8, RD, 0.036).box(0.04, 0.04, 0.01, -0.42, 1.6, GG, 0.03, true);
  },
  hosecab(K) {   // open-front red cabinet (frame, back, shelf) so the reel shows; a glazing bar frame stands in for the pane
    K.box(0.8, 0.9, 0.02, 0, 1.25, DRED).box(0.04, 0.9, 0.24, -0.38, 1.25, DRED).box(0.04, 0.9, 0.24, 0.38, 1.25, DRED).box(0.8, 0.04, 0.24, 0, 1.68, DRED).box(0.8, 0.04, 0.24, 0, 0.82, DRED)
      .box(0.72, 0.012, 0.012, 0, 1.25, GLASS, 0.23).box(0.012, 0.8, 0.012, 0, 1.25, GLASS, 0.23);
    K.cyl(0.26, 0.05, -0.04, 1.28, RD, 0.03, 'z', false, 16).cyl(0.23, 0.1, -0.04, 1.28, 0x18181a, 0.08, 'z', false, 16).cyl(0.26, 0.03, -0.04, 1.28, RD, 0.185, 'z', false, 16).cyl(0.07, 0.04, -0.04, 1.28, MT, 0.2, 'z');
    K.box(0.06, 0.28, 0.06, 0.28, 1.2, MT, 0.04).box(0.14, 0.05, 0.05, 0.28, 1.38, YL, 0.04).box(0.5, 0.1, 0.006, 0, 1.78, WHT, 0.01).box(0.4, 0.035, 0.004, 0, 1.78, RD, 0.016)
      .cyl(0.06, 0.03, 0.3, 0.72, RD, 0.0, 'z', false, 12).box(0.8, 0.04, 0.26, 0, 0.78, STEEL).box(0.03, 0.03, 0.006, 0.34, 1.65, GG, 0.25, true);
  },
  panelbox(K) {
    K.box(0.5, 0.72, 0.12, 0, 1.5, 0x6a6f58).box(0.44, 0.64, 0.01, 0, 1.5, 0x777c66, 0.12).box(0.5, 0.05, 0.004, 0, 1.82, YL, 0.122)
      .cyl(0.03, WH - 1.86, 0.15, (WH + 1.86) / 2, MT, 0.03).box(0.05, 0.06, 0.03, 0.15, 1.86, DK, 0.01);
    [GG, GG, GR].forEach((c, i) => K.box(0.04, 0.04, 0.008, -0.14 + i * 0.07, 1.7, c, 0.13, true));
    K.box(0.03, 0.14, 0.03, 0.18, 1.5, DK, 0.13).cyl(0.025, 0.012, 0.18, 1.38, MT, 0.13, 'z').box(0.22, 0.1, 0.004, -0.06, 1.46, CREAM, 0.131);
    for (let i = 0; i < 5; i++) K.box(0.3, 0.014, 0.006, -0.06, 1.28 + i * 0.03, 0x4a4f44, 0.13);
  },
  panelopen(K) {
    // cabinet, dead-front, insert bay (relay cards), breaker row, bus bars, loom; door swung 90 degrees at the left
    K.box(0.62, 0.86, 0.02, 0, 1.5, 0x2b3038).box(0.03, 0.86, 0.14, -0.295, 1.5, 0x2b3038).box(0.03, 0.86, 0.14, 0.295, 1.5, 0x2b3038).box(0.62, 0.03, 0.14, 0, 1.915, 0x2b3038).box(0.62, 0.03, 0.14, 0, 1.085, 0x2b3038)
      .box(0.66, 0.05, 0.11, 0, 1.96, YL).box(0.66, 0.05, 0.11, 0, 1.04, YL).box(0.56, 0.8, 0.012, 0, 1.5, 0x3a3f48, 0.088);
    for (let i = 0; i < 8; i++) { const x = -0.2 + i * 0.057; K.box(0.04, 0.24, 0.05, x, 1.77, i % 3 === 1 ? GRN : 0x2f4a3a, 0.1).box(0.02, 0.012, 0.01, x, 1.85, i === 5 ? GR : i % 2 ? GG : GO, 0.15, true); }
    K.box(0.52, 0.014, 0.005, 0, 1.62, STEEL, 0.1);
    for (let i = 0; i < 8; i++) { const x = -0.2 + i * 0.057, trip = i === 5; K.box(0.04, 0.085, 0.026, x, 1.56, DK, 0.1).box(0.014, 0.04, 0.02, x, 1.56 + (trip ? -0.025 : 0.025), trip ? RD : CREAM, 0.12); }
    K.box(0.54, 0.12, 0.012, 0, 1.36, 0xb0c8d0, 0.12).box(0.5, 0.025, 0.012, 0, 1.38, COPPER, 0.1).box(0.5, 0.025, 0.012, 0, 1.31, COPPER, 0.1);
    for (let i = 0; i < 6; i++) K.cyl(0.011, 0.2, -0.12 + i * 0.048, 1.18, i === 4 ? RD : 0x0c0c0e, 0.1 + (i % 2) * 0.008);
    K.box(0.02, 0.86, 0.58, -0.33, 1.5, 0x2b3038, 0.0).box(0.004, 0.44, 0.26, -0.318, 1.55, CREAM, 0.14).box(0.03, 0.03, 0.58, -0.33, 1.08, YL, 0.0);
  },
};
