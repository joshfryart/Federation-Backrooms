import { hunterCount, clingerCap, floorClingers, tubeClingerOk, hunterDelay, mayWake, CAPS } from '../js/balance.js';
import assert from 'node:assert';
for (let n = 1; n <= 20; n++) {
  assert(hunterCount(n) <= 3);
  for (let k = 0; k < 50; k++) { const f = floorClingers(n, Math.random); assert(f <= clingerCap(n) && f >= 0); let c = f; for (let t = 0; t < 5; t++) if (tubeClingerOk(n, c)) c++; assert(c <= clingerCap(n), `deck ${n}`); }
  const worst = hunterCount(n) + clingerCap(n) + CAPS.crazed; assert(worst <= 7, `deck ${n} worst ${worst}`);
}
assert(hunterDelay(6, 2) - hunterDelay(6, 1) === 34); assert(!mayWake(3) && mayWake(2));
console.log('balance ok');
import { lookedAt } from '../js/visibility.js';
{ const p = { x: 0, z: 0, yaw: 0, pitch: 0, torch: false };   // facing -z
  assert(lookedAt(p, 0, -5).seen && !lookedAt(p, 0, 5).seen && !lookedAt(p, 0, -5, { los: false }).seen);
  assert(!lookedAt(p, 0, -5, { power: 0 }).seen, 'dark hides');
  assert(lookedAt({ ...p, torch: true }, 0, -5, { power: 0 }).seen, 'torch reveals');
  assert(!lookedAt({ ...p, pitch: 1.3 }, 0, -8).seen && lookedAt({ ...p, pitch: 1.3 }, 0, -2).seen);
  assert(lookedAt(p, -7, -4).edge, 'peripheral'); console.log('visibility ok'); }
