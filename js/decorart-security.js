// Batch 8: security and damage-control wall fixtures in the format of the DECOR kits in js/world.js (closures over the Kit class: K.box / K.cyl / K.cone, vertex colours,
// +z out of the wall, +x along the wall, 0 to 3.2 m high). The integrator spreads DECOR_SEC into DECOR (and adds names to ROOM_DECOR pools: dclocker to corridor / stores / plant /
// engineering, emitterpost + badgereader to corridor / brig, camdome to corridor / brig / armory):
//   dclocker     ENG-8 damage-control locker: red, floor standing, 1.2 x 0.45 x 1.9 m, double door with a stencilled band, an open vision strip showing a helmet shelf, a hose reel and a patch
//                board inside, lever latch with a seal tag (Kit has no transparent material, so the strip is a frame with no pane)
//   emitterpost  SEC-4a force-field emitter: door-frame pair of 0.1 x 0.1 x 2.2 m posts 1.2 m apart with emitter studs on the inner faces (needs a 1.4 m clear run)
//   camdome      SEC-4b security camera: 0.12 m smoked dome on a ceiling-height wall plate (3.0 to 3.2 m) with a record lamp
//   badgereader  SEC-4c badge reader: 0.09 x 0.14 m wall pad at 1.2 m with a lamp bar, a coil ring and a slot
const DK = 0x23262d, MT = 0x8f959e, WHT = 0xdfe6ea, RD = 0xb02820, YL = 0xd8a818, STEEL = 0x5a6068, DRED = 0x8a1a14, CREAM = 0xe8e4d0, GLASS = 0x9ac8e0, SMOKE = 0x1b2128;
const GG = [0.3, 1.7, 0.75], GR = [2.0, 0.2, 0.12], GB = [0.35, 1.25, 2.0], GO = [2.0, 0.85, 0.25];
const LOCKER = 0xa82a22, ORANGE = 0xd86a1c;

export const DECOR_SEC = {
  dclocker(K) {
    K.box(1.2, 1.9, 0.44, 0, 0.95, LOCKER).box(1.24, 0.04, 0.46, 0, 1.92, DRED).box(1.2, 0.06, 0.46, 0, 0.03, DK);                          // carcass, top cap, plinth
    // doors: left one built around an open vision strip (0.3 x 0.9 m), right one solid; centre gap dark
    K.box(0.58, 0.95, 0.016, -0.3, 0.55, 0xb83228, 0.44).box(0.58, 0.2, 0.016, -0.3, 1.8, 0xb83228, 0.44).box(0.14, 0.9, 0.016, -0.52, 1.35, 0xb83228, 0.44).box(0.14, 0.9, 0.016, -0.08, 1.35, 0xb83228, 0.44)
      .box(0.58, 1.84, 0.016, 0.3, 0.95, 0xb83228, 0.44).box(0.012, 1.84, 0.02, 0, 0.95, DK, 0.44);
    K.box(0.34, 0.04, 0.02, -0.3, 0.88, DK, 0.44).box(0.34, 0.04, 0.02, -0.3, 1.82, DK, 0.44);                                               // strip frame bars
    // inside the strip: back panel, helmet shelf with two helmets, hose reel, patch board
    K.box(0.34, 0.92, 0.02, -0.3, 1.35, 0x2b3038, 0.0).box(0.34, 0.03, 0.3, -0.3, 1.58, STEEL, 0.1);
    K.cyl(0.06, 0.07, -0.37, 1.6, WHT, 0.14).cyl(0.06, 0.07, -0.23, 1.6, YL, 0.14).cyl(0.045, 0.02, -0.37, 1.67, DK, 0.16, 'z').cyl(0.045, 0.02, -0.23, 1.67, DK, 0.16, 'z');
    K.cyl(0.12, 0.05, -0.3, 1.2, RD, 0.14, 'z', false, 14).cyl(0.07, 0.06, -0.3, 1.2, DK, 0.14, 'z', false, 10).box(0.3, 0.3, 0.02, -0.3, 0.95, ORANGE, 0.14).box(0.12, 0.012, 0.02, -0.3, 0.95, DK, 0.16);
    // stencilled band across both doors (cream bar with red bars) and a blank placard
    K.box(1.16, 0.12, 0.006, 0, 1.55, CREAM, 0.456).box(0.2, 0.05, 0.004, -0.4, 1.55, RD, 0.462).box(0.2, 0.05, 0.004, 0.4, 1.55, RD, 0.462).box(0.46, 0.14, 0.006, 0.3, 1.82, WHT, 0.456).box(0.4, 0.04, 0.004, 0.3, 1.82, RD, 0.462);
    // lever latch with a seal tag on a thread, status lamp on the top cap
    K.box(0.04, 0.2, 0.03, 0.04, 0.98, DK, 0.456).box(0.07, 0.03, 0.04, 0.04, 1.07, MT, 0.456).box(0.03, 0.05, 0.01, 0.05, 0.86, YL, 0.48).box(0.02, 0.02, 0.01, 0.55, 1.97, GG, 0.43, true);
    for (const sx of [-0.55, 0.55]) K.box(0.05, 0.14, 0.03, sx, 0.9, DK, 0.456);                                                              // hinges
  },
  emitterpost(K) {
    for (const sx of [-0.6, 0.6]) {
      K.box(0.1, 2.2, 0.1, sx, 1.1, STEEL).box(0.16, 0.04, 0.16, sx, 0.02, DK).box(0.12, 0.06, 0.12, sx, 2.23, DK).box(0.04, 0.04, 0.006, sx, 2.3, GB, 0.0, true);
      for (let i = 0; i < 14; i++) K.box(0.03, 0.04, 0.04, sx - Math.sign(sx) * 0.055, 0.2 + i * 0.15, i === 6 ? GO : GB, 0.03, true);                // emitter studs on the inner faces
    }
    K.box(0.04, 0.04, 0.006, 0.0, 0.01, GB, 0.02, true);
  },
  camdome(K) {
    K.box(0.22, 0.02, 0.2, 0, 3.17, STEEL, 0.0).box(0.06, 0.1, 0.06, 0, 3.07, DK, 0.06).box(0.1, 0.03, 0.1, 0, 3.0, DK, 0.04)
      .cyl(0.06, 0.04, 0, 2.97, SMOKE, 0.04, 'y', false, 14).cyl(0.045, 0.03, 0, 2.99, SMOKE, 0.05, 'y', false, 14).cyl(0.025, 0.02, 0, 3.01, 0x05080a, 0.07, 'y', false, 10)
      .box(0.012, 0.012, 0.006, 0.05, 2.99, GR, 0.118, true);                                                                              // record lamp
  },
  badgereader(K) {
    K.box(0.11, 0.16, 0.02, 0, 1.2, DK).box(0.09, 0.14, 0.026, 0, 1.2, 0x3a3f48, 0.02).cyl(0.026, 0.006, 0, 1.23, STEEL, 0.046, 'z', false, 14).box(0.06, 0.012, 0.006, 0, 1.15, GG, 0.046, true)
      .box(0.05, 0.006, 0.01, 0, 1.12, 0x0a0b0d, 0.046).box(0.012, 0.012, 0.006, 0.035, 1.27, GR, 0.046, true);
  },
};
void MT; void GO;
