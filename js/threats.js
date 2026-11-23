// Pure rules for per-deck hostile mixes and hull-breach numbers, split out of js/main.js so tools/soak-director.mjs and tools/test.mjs
// ("director-soak") can run them without a browser. main.js (spawnThreats, the hull-breach block) reads these; the numbers are the tuning surface.
// Every value is tuned by simulation only (tools/soak-director.mjs), never by hand on real hardware.
export const HOSTILES = ['gronk', 'drone', 'phantom'];
// which of the shuffled hostile pool appear on deck n (deck 1 is only the madness), when each arrives (seconds after the deck loads), and how many clingers
export function threatPlan(n, rnd, pool = HOSTILES) {
  const count = n === 1 ? 0 : n < 3 ? 1 : n < 6 ? 2 : 3;
  const types = pool.slice(0, count);
  const delays = types.map((_, i) => Math.max(14, 30 - n * 2) + i * (n >= 6 ? 30 : 22) + 15);   // deeper decks: hostiles arrive further apart
  const clingers = n >= 2 ? Math.min(n >= 6 ? 2 : 3, 1 + Math.floor(rnd() * (1 + n / 3))) : 0;
  return { types, delays, clingers };
}
// hull breach: pull inside `range` in line of sight, damage inside `hurt`, holding E inside `reach` seals it in `seal` seconds of work (patch plate: x2 speed)
export const BREACH = { range: 14, pull: 4.5, reach: 3.2, hurt: 3.4, dps: 4.5, dpsBreather: 2, seal: 8, patchSpeed: 2, nomRegen: 2 };
export const breachDps = (carry) => (carry === 'breather' ? BREACH.dpsBreather : BREACH.dps);
export const breachSealTime = (carry) => BREACH.seal / (carry === 'patch_plate' ? BREACH.patchSpeed : 1);
// total hit points lost sealing a breach from the edge of the damage zone (a lower bound: the pull and any hostile come on top)
export const breachSealCost = (carry) => breachDps(carry) * breachSealTime(carry);
