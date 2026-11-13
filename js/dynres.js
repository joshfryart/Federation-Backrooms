// Dynamic resolution scale, a first step before the auto-quality drop to "Performance" (js/main.js frame()).
//   const D = createDynRes();  const s = D.update(dtSeconds);  // returns the new scale when it changed, else null
// Frame > slowMs for downAfter seconds -> scale down one step (down to min); frame < fastMs for upAfter seconds -> back up one step.
// D.atMin tells main.js that resolution can't help any more, so the quality drop may go ahead. Pure: tools/test-dynres.mjs.
export function createDynRes(o = {}) {
  const c = { min: 0.5, max: 1, step: 0.125, slowMs: 45, fastMs: 26, downAfter: 1.2, upAfter: 8, ...o };
  const D = { scale: c.max, slow: 0, fast: 0, get atMin() { return D.scale <= c.min + 1e-6; }, reset() { D.scale = c.max; D.slow = D.fast = 0; },
    update(dt) {
      const ms = dt * 1000; let ch = null;
      if (ms > c.slowMs) { D.slow += dt; D.fast = 0; } else if (ms < c.fastMs) { D.fast += dt; D.slow = Math.max(0, D.slow - dt * 2); } else { D.slow = Math.max(0, D.slow - dt); D.fast = 0; }
      if (D.slow > c.downAfter && D.scale > c.min) { D.scale = Math.max(c.min, D.scale - c.step); D.slow = 0; D.fast = 0; ch = D.scale; }
      else if (D.fast > c.upAfter && D.scale < c.max) { D.scale = Math.min(c.max, D.scale + c.step); D.slow = 0; D.fast = 0; ch = D.scale; }
      return ch;
    } };
  return D;
}
