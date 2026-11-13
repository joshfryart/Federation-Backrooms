// Shared glue for touch.js / gamepad.js: synthetic key presses (so every existing keydown handler, wheel and menu layer works unchanged)
// and the analog move vector G.xin = { mx, mz, src: { touch: {x,z}, pad: {x,z} } } that main.js step() adds to WASD.
export function keyDown(code, opts = {}) { try { dispatchEvent(new KeyboardEvent('keydown', { code, key: opts.key || code, bubbles: true, cancelable: true, shiftKey: !!opts.shift })); } catch (e) { } }
export function keyUp(code) { try { dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true, cancelable: true })); } catch (e) { } }
export function keyTap(code, opts) { keyDown(code, opts); keyUp(code); }
export function setMove(G, src, x, z) {
  const X = G.xin || (G.xin = { mx: 0, mz: 0, src: {} }); X.src[src] = { x, z };
  let sx = 0, sz = 0; for (const v of Object.values(X.src)) { sx += v.x; sz += v.z; }
  const l = Math.hypot(sx, sz); X.mx = l > 1 ? sx / l : sx; X.mz = l > 1 ? sz / l : sz;
}
/** radial dead zone with rescale: 0 inside dz, then 0..1 */
export function dead(x, y, dz = 0.18) { const l = Math.hypot(x, y); if (l < dz) return [0, 0]; const k = Math.min(1, (l - dz) / (1 - dz)) / l; return [x * k, y * k]; }
/** may the player steer the world right now? (play phase, no menu / wheel / panel open) */
export const canSteer = (G) => G.phase === 'play' && !G.menuPause && !G.talk?.active;
export function lookBy(G, CFG, dyaw, dpitch) { G.P.yaw -= dyaw * CFG.sens; G.P.pitch = Math.max(-1.45, Math.min(1.45, G.P.pitch - dpitch * CFG.sens)); }
