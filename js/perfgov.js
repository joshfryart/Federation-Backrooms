// Auto-quality governor (no three.js import: it is a pure state machine so tools/test.mjs can drive it in node).
// Ladder, cheapest change first:   level 0 = High at full resolution   1 = High, 85 % render scale   2 = High, 70 % (+ half-size torch shadow map)
//                                  3 = High, 55 % (+ light cones off)   4 = Performance (the old "low": no post chain, pixel ratio 1)
// Step down when the smoothed frame time stays over DOWN_MS for DOWN_S seconds (the last rung needs a worse frame time, so Performance mode stays a
// last resort, as the old 45 ms / 4 s rule had it).  Step up only after the smoothed frame time has stayed under UP_MS for UP_S seconds, with a
// cool-down after any change, and every time a recovery is followed by another drop within FLAP_S the next recovery waits twice as long
// (hysteresis: no ping-pong between two levels).  Frames over SPIKE_MS (tab switch, a load hitch, a breakpoint) are ignored.  Manual choice in the
// pause menu pins the level (auto = false) until the player picks High again.
// ao: the optional GTAO pass (js/fx.js, opt-in in the pause menu) is allowed on rung 0 only: it is the first thing to go when frames get slow.
export const LEVELS = [
  { scale: 1, quality: 'high', shadow: 1024, cones: true, ao: true },
  { scale: 0.85, quality: 'high', shadow: 1024, cones: true, ao: false },
  { scale: 0.7, quality: 'high', shadow: 512, cones: true, ao: false },
  { scale: 0.55, quality: 'high', shadow: 512, cones: false, ao: false },
  { scale: 1, quality: 'low', shadow: 512, cones: false, ao: false },
];
export const DEFAULTS = { DOWN_MS: 30, DOWN_LAST_MS: 45, DOWN_S: 2.5, UP_MS: 19, UP_S: 8, UP_LOW_MS: 12, UP_LOW_S: 20, COOL_S: 5, FLAP_S: 30, SPIKE_MS: 250, SEVERE_MS: 80, EMA: 0.08, MAX_LOW_RECOVERIES: 2 };

export class Governor {
  constructor(opts = {}) {
    this.o = Object.assign({}, DEFAULTS, opts); this.level = 0; this.auto = true; this.ema = 16; this.over = 0; this.under = 0; this.cool = 0; this.sinceUp = 1e9; this.upMul = 1; this.lowRecoveries = 0; this.changes = [];
  }
  get cfg() { return LEVELS[this.level]; }
  // user picked High / Performance in the menu: High = level 0 and auto again, Performance = level 4 pinned
  setManual(q) { this.level = q === 'low' ? LEVELS.length - 1 : 0; this.auto = q !== 'low'; this.reset(); this.upMul = 1; this.lowRecoveries = 0; }
  reset() { this.over = this.under = 0; this.cool = this.o.COOL_S; this.ema = this.ema < 8 ? 16 : this.ema; }
  // ms: raw frame interval.  playing: only judge frames while the player is in the world.  Returns the new level when it changed, else -1.
  tick(ms, playing = true) {
    const o = this.o, dt = ms / 1000; if (!this.auto || !playing || !(ms > 0)) return -1;
    if (ms > o.SPIKE_MS) { this.over = Math.max(0, this.over - dt); return -1; }
    this.ema += (ms - this.ema) * o.EMA; this.cool = Math.max(0, this.cool - dt); this.sinceUp += dt;
    const last = this.level === LEVELS.length - 2, low = this.level === LEVELS.length - 1;
    const downMs = last ? o.DOWN_LAST_MS : o.DOWN_MS;
    if (!low) {
      if (this.ema > downMs && this.cool <= 0) { this.over += dt; this.under = 0; if (this.over >= o.DOWN_S) return this._go(this.ema > o.SEVERE_MS ? LEVELS.length - 1 : this.level + 1); } else this.over = Math.max(0, this.over - dt * 2);
    }
    if (this.level > 0 && !(low && this.lowRecoveries >= o.MAX_LOW_RECOVERIES)) {
      const upMs = low ? o.UP_LOW_MS : o.UP_MS, upS = (low ? o.UP_LOW_S : o.UP_S) * this.upMul;
      if (this.ema < upMs && this.cool <= 0) { this.under += dt; if (this.under >= upS) { if (low) this.lowRecoveries++; this.sinceUp = 0; return this._go(this.level - 1, true); } } else this.under = 0;
    }
    return -1;
  }
  _go(n, up = false) {
    if (!up && this.sinceUp < this.o.FLAP_S) this.upMul = Math.min(8, this.upMul * 2);   // dropped soon after a recovery: recover more slowly next time
    this.level = n; this.over = this.under = 0; this.cool = this.o.COOL_S; this.changes.push([up ? 'up' : 'down', n]); return n;
  }
}

// Apply one ladder rung.  ctx: { post, torch, world, beamCone, CFG, TEST } from main.js.  Dynamic resolution only touches the post chain's render
// targets (the canvas keeps its size, the last pass upscales), so a change costs one target re-allocation and no shader compile.
export function applyLevel(L, ctx) {
  const { post, torch, world } = ctx, high = L.quality === 'high';
  post?.setScale(high ? L.scale : 1); post?.allowAO?.(high && !!L.ao);
  if (world?.cones) world.cones.visible = high && L.cones;
  if (torch && torch.shadow.mapSize.x !== L.shadow) { torch.shadow.mapSize.set(L.shadow, L.shadow); if (torch.shadow.map) { torch.shadow.map.dispose(); torch.shadow.map = null; } }
}
