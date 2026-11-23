// Pacing director: one intensity value and a build → peak → relax cycle decide when the ship turns on you.
// It does not touch the game directly; update() returns an action for js/main.js to carry out, so the same rules can be
// unit-tested and tuned in isolation (see tools/test.mjs and the F3 overlay in game).
//   intensity  0..1  rises with nearby hostiles, damage, screams and faults; decays when nothing is happening
//   build      pressure allowed: every `gap` seconds, if intensity is under the deck's target, pick a pressure action
//   peak       hold for a few seconds once intensity crosses 0.8 — nothing new is added
//   relax      forced breather: no new faults, madness and nudges wait; ends when it has calmed down (or RELAX_OVERRUN s after its timer)
export const ACTIONS = ['fault', 'blackout', 'nudge', 'wake', 'madness'];
// Tuned by tools/soak-director.mjs (a model, not real play): with a hostile that keeps coming back, intensity never fell under 0.4 and a relax lasted the whole
// deck (about 450 s of 480 s on deck 3+, so no pressure and no madness). RELAX_OVERRUN caps how long past its timer a relax may wait for the calm-down.
export const RELAX_OVERRUN = 25;
export class Director {
  constructor(rnd = Math.random) { this.rnd = rnd; this.reset(1); }
  reset(deck) { this.deck = deck; this.intensity = 0; this.phase = 'build'; this.t = 0; this.gap = 20; this.phaseT = 0; this.log = []; this.bumps = 0; }
  get target() { return Math.min(0.75, 0.45 + this.deck * 0.04); }
  bump(amount, why = '') { this.intensity = Math.min(1, this.intensity + amount); this.bumps++; if (why) this.note(`+${amount.toFixed(2)} ${why}`); }
  note(s) { this.log.push(`${this.phase.padEnd(5)} ${this.intensity.toFixed(2)} ${s}`); if (this.log.length > 8) this.log.shift(); }
  get relaxing() { return this.phase === 'relax' && this.phaseT > 0; }   // the guaranteed breather (js/main.js holds the next madness turn back while it lasts)
  // ctx: { tension 0..1 (hostile proximity), deckTime, faults (open count), dormant (hostiles not yet awake), active (awake hostiles), madPending (seconds until next madness or Infinity) }
  update(dt, ctx) {
    this.t += dt;
    this.intensity = Math.max(0, Math.min(1, this.intensity + ctx.tension * dt * 0.12 - (ctx.tension < 0.25 ? 0.035 : 0.01) * dt));
    if (this.phase === 'build') {
      if (this.intensity >= 0.8) { this.phase = 'peak'; this.phaseT = 6 + this.rnd() * 5; this.note('peak'); return null; }
      if (ctx.deckTime < 25) return null;
      this.gap -= dt * (1 + Math.min(this.deck, 10) * 0.06); if (this.gap > 0) return null;
      this.gap = 14 + this.rnd() * 14;
      if (this.intensity >= this.target) return null;
      const opts = [];
      if (ctx.faults < 4) opts.push(['fault', 3]);
      if (ctx.faults && this.intensity < 0.3) opts.push(['blackout', 1.2]);
      if (ctx.active) opts.push(['nudge', 2]);
      if (ctx.dormant) opts.push(['wake', 1.5]);
      if (ctx.madPending > 6 && ctx.madPending < 1e8) opts.push(['madness', 1.5]);
      if (!opts.length) return null;
      let r = this.rnd() * opts.reduce((a, o) => a + o[1], 0), pick = opts[0][0]; for (const [a, w] of opts) { r -= w; if (r <= 0) { pick = a; break; } }
      this.note(pick); return pick;
    }
    this.phaseT -= dt;
    if (this.phase === 'peak' && this.phaseT <= 0) { this.phase = 'relax'; this.phaseT = 22 + this.rnd() * 18; this.note('relax'); }
    else if (this.phase === 'relax' && this.phaseT <= 0 && (this.intensity < 0.4 || this.phaseT <= -RELAX_OVERRUN)) { this.phase = 'build'; this.gap = 8 + this.rnd() * 8; this.note('build'); }
    return null;
  }
}
