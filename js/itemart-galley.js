// itemart-galley.js — cook's kit items for batch 2 (galley and lounge): ladle, stock pot, frying pan (asset-gaps SVC-4).
// Same format as the rows of js/itemart.js (see docs/itemart.md): `DEFS_GALLEY[kind] = { name, cls, build(g, M, o), lie?, flat?, base?, rest? }`
// and `KW_GALLEY` = [[regex, kind], ...]. The integrator spreads both into `DEFS` / `KW` (put KW_GALLEY first). `M` is the shared item
// material set built by itemart.js `mats()`; nothing here is imported from the game. Pure three.js, <= 500 tris each, no text, no insignia.
// Frames (grip, `frame:'grip'`): origin at the grip, working end +y.
//   ladle    0.35 m long, 90 mm bowl; held by the straight handle, bowl at +y, opening toward +z
//   stockpot 0.40 m diameter x 0.35 m + lid; origin at the loop handle on its +x side, the pot hangs below and to -x (like toolbox)
//   fryingpan 0.30 m pan, 0.2 m handle; origin mid handle, pan at +y, laid flat in the base frame (lie + flat, like the tricorders)
// buildItem(kind, {frame:'base'}) re-centres any of them on its bottom centre, so they also work on a counter, a hob or the floor.
import * as THREE from 'three';

const PI = Math.PI;
const GEO = new Map(), MEMO = new Map();
const geo = (k, f) => { let g = GEO.get(k); if (!g) { g = f(); GEO.set(k, g); } return g; };
const memo = (k, f) => { let v = MEMO.get(k); if (!v) { v = f(); MEMO.set(k, v); } return v; };
const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; return o; };
const cy = (rt, rb, h, m, x = 0, y = 0, z = 0, seg = 12) => mesh(geo(`cy${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), m, x, y, z);
const lathe = (key, pts, m, x = 0, y = 0, z = 0, seg = 16) => mesh(geo(`lt${key}|${seg}`, () => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg)), m, x, y, z);
const tor = (R, r, m, x = 0, y = 0, z = 0, arc = PI * 2, rs = 4, ts = 10) => mesh(geo(`tr${R}|${r}|${arc}|${rs}|${ts}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc)), m, x, y, z);
const bx = (w, h, d, m, x = 0, y = 0, z = 0) => mesh(geo(`bx${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d)), m, x, y, z);
const bowl = (r, seg, rings) => geo(`bowl${r}|${seg}|${rings}`, () => new THREE.SphereGeometry(r, seg, rings, 0, PI * 2, PI / 2, PI / 2).rotateX(PI / 2));   // hemisphere, bulge -z, opening +z
const twoSided = (M) => memo('steel2', () => { const m = M.steel.clone(); m.side = THREE.DoubleSide; return m; });
const pot2 = (M) => memo('potsteel', () => { const m = M.steel.clone(); m.color = new THREE.Color(0xc8ccd0); m.roughness = 0.38; m.side = THREE.DoubleSide; return m; });
const panM = (M) => memo('pangun', () => { const m = M.gun.clone(); m.color = new THREE.Color(0x2c3036); m.roughness = 0.5; m.side = THREE.DoubleSide; return m; });
const rivet = (M, x, y, z, rot) => { const o = cy(0.008, 0.008, 0.006, M.steel, x, y, z, 6); o.rotation.set(...rot); return o; };

export const DEFS_GALLEY = {};
const def = (kind, name, cls, build, x = {}) => { DEFS_GALLEY[kind] = { name, cls, build, ...x }; };

// ---- ladle: stainless, 0.35 m overall, 90 mm bowl with a pouring lip, hanging eye at the end of the handle
def('ladle', 'ladle', 'food', (g, M) => {
  const st = twoSided(M);
  g.add(cy(0.0075, 0.0075, 0.25, st, 0, 0.025, 0, 8));                                    // handle shaft y -0.1 .. 0.15
  g.add(cy(0.0105, 0.0105, 0.1, M.rubber, 0, -0.02, 0, 8));                               // grip sleeve
  g.add(tor(0.012, 0.0032, st, 0, -0.112, 0, PI * 2, 4, 8));                              // hanging eye
  const neck = cy(0.0075, 0.0075, 0.075, st, 0, 0.185, 0, 8); g.add(neck);   // goose neck leaning toward the bowl
  const b = mesh(bowl(0.045, 14, 6), st, 0, 0.255, 0.0); g.add(b);                         // bowl centre y 0.255 (rim 0.21..0.30), opens +z
  g.add(tor(0.045, 0.0028, st, 0, 0.255, 0, PI * 2, 4, 16));                              // rolled rim
  g.add(cy(0.0075, 0.0075, 0.02, st, 0, 0.215, -0.012, 6));
});

// ---- stock pot: 0.40 m dia x 0.35 m, two riveted loop handles, domed lid with a pull. Origin at the +x handle.
def('stockpot', 'stock pot', 'food', (g, M) => {
  const st = pot2(M), p = new THREE.Group(); p.position.set(-0.225, -0.28, 0); g.add(p);
  p.add(lathe('pot', [[0.001, 0.0], [0.178, 0.0], [0.196, 0.014], [0.2, 0.05], [0.2, 0.34], [0.206, 0.346], [0.206, 0.354], [0.194, 0.354], [0.194, 0.03], [0.001, 0.03]], st, 0, 0, 0, 20));
  p.add(cy(0.202, 0.202, 0.018, M.alu, 0, 0.0, 0, 20).translateY(0.044));                    // base band
  p.add(lathe('lid', [[0.001, 0.398], [0.03, 0.396], [0.14, 0.382], [0.2, 0.358], [0.212, 0.354], [0.212, 0.345], [0.19, 0.345]], st, 0, 0, 0, 20));   // lid dome sits on the rim
  p.add(cy(0.014, 0.018, 0.03, M.rubber, 0, 0.405, 0, 10)); p.add(cy(0.026, 0.026, 0.008, M.dark, 0, 0.392, 0, 10));   // pull knob
  for (const sx of [-1, 1]) {
    const h = tor(0.04, 0.0085, st, sx * 0.205, 0.28, 0, PI, 4, 10); h.rotation.z = sx > 0 ? -PI / 2 : PI / 2; p.add(h);                   // loop handle
    const pl = bx(0.014, 0.05, 0.05, M.alu, sx * 0.2, 0.28, 0); p.add(pl);                                                                 // mounting plate
  }
});

// ---- frying pan: 0.30 m, 0.2 m handle with a rubber sleeve and hang hole. Disc normal +z (flat/lie like the tricorders).
def('fryingpan', 'frying pan', 'food', (g, M) => {
  const pg = panM(M), cy0 = 0.27;                                                          // pan centre y
  const body = lathe('pan', [[0.001, 0.0], [0.108, 0.0], [0.13, 0.01], [0.148, 0.045], [0.152, 0.05], [0.147, 0.05], [0.126, 0.018], [0.108, 0.008], [0.001, 0.008]], pg, 0, cy0, 0, 20);
  body.rotation.x = PI / 2; body.position.z = -0.025; g.add(body);                         // axis z, opening +z
  g.add(cy(0.11, 0.11, 0.002, M.black, 0, cy0, -0.016, 20).rotateX(PI / 2));              // interior face
  g.add(cy(0.0105, 0.0105, 0.20, M.steel, 0, 0.03, 0, 8));                                 // handle shaft y -0.07 .. 0.13
  g.add(cy(0.0145, 0.0125, 0.12, M.rubber, 0, 0.0, 0, 8));                                 // sleeve
  g.add(tor(0.007, 0.0025, M.steel, 0, -0.058, 0, PI * 2, 4, 8).rotateX(0));              // hang loop
  g.add(bx(0.034, 0.05, 0.012, M.steel, 0, 0.14, -0.022));                                 // handle-to-pan joint
  g.add(rivet(M, 0, 0.152, -0.016, [PI / 2, 0, 0])); g.add(rivet(M, 0, 0.128, -0.016, [PI / 2, 0, 0]));
}, { lie: true, flat: true });

export const KW_GALLEY = [
  [/\bladles?\b|\bskimmer\b|serving spoon|soup spoon/i, 'ladle'],
  [/stock ?pots?|\bsaucepans?\b|cooking pots?|\bcauldron\b|\bpots?\b(?!ato)|\bkettle\b/i, 'stockpot'],
  [/frying pans?|\bskillets?\b|saut[eé] pan|\bwoks?\b|\bpans?\b|griddle pan/i, 'fryingpan'],
];
