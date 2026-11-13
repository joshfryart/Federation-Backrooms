// Enemy mix caps per deck (pure numbers, node-testable: tools/test-balance.mjs). js/main.js spawnThreats() reads these.
// Before: deck 6+ could stack gronk + drone + hologram + 1 crazed + up to 4 floor clingers + tube clingers (about 8 hostiles).
// Now (all numbers are first guesses, to be tuned in real play via F3):
//   deck   hunters(gronk/drone/phantom)  clingers (floor + tube, total)  crazed at once  stagger between hunters
//   1      0                              0                              1 (the opener)   -
//   2      1                              1                              1                22 s
//   3      1                              2                              1                22 s
//   4-5    2                              2                              1                26 s
//   6+     3                              3                              1                34 s (third arrives late)
// Crazed: js/main.js already lets only one madness run at a time (updateMadness); CAPS.crazed documents and enforces it.
// Simultaneous awake chasers never exceed HUNTER_AWAKE_MAX: dormant hunters past that wait (director 'wake' respects it).
export const CAPS = { crazed: 1, drone: 1, phantom: 1, gronk: 1, awakeMax: 3 };
export const hunterCount = (n) => n <= 1 ? 0 : n < 4 ? 1 : n < 6 ? 2 : 3;
export const clingerCap = (n) => n < 2 ? 0 : Math.min(3, 1 + Math.floor(n / 3));
export const hunterStagger = (n) => n >= 6 ? 34 : n >= 4 ? 26 : 22;
export const hunterDelay = (n, i) => Math.max(10, 28 - n * 2) + i * hunterStagger(n) + 15;
/** floor clingers to place given how many tubes may add theirs afterwards */
export function floorClingers(n, rnd) { const cap = clingerCap(n); return cap ? Math.min(cap - (n >= 3 ? 1 : 0), 1 + Math.floor(rnd() * (1 + n / 3))) : 0; }
/** may another tube clinger be added (deck n, already placed)? */
export const tubeClingerOk = (n, placed) => n >= 3 && placed < clingerCap(n);
export const mayWake = (awake) => awake < CAPS.awakeMax;
