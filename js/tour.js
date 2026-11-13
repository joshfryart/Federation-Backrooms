// First-run hint tour (Systems Nominal): glowing keycap callouts on the minimap, the duty board and the compass, one after another.
// Shown once ever (localStorage `fb_tour`); advances on a timer while the game is running (not while a menu pauses it).
// TourState is pure (tools/test-ui-hints.mjs); Tour adds the DOM. Owner: js/nav-hud.js calls frame(dt, gameTime, paused).
export const STEPS = [
  { sel: '#minimap', key: 'M', text: 'Minimap. Press M for the whole-ship map; click a room there to be guided to it.' },
  { sel: '#bd-board', key: 'J', text: 'Duty rings: each is a job on a clock. Press J for the full board and click a block, then Guide me.' },
  { sel: '#nv-compass', key: 'G', text: 'Compass and guide line. G cycles what you are being guided to; L points to the nearest tubelift.' },
  { sel: '#nv-card', key: 'Tab', text: 'Route card: distance, walk time and the lift steps. Tab shows ship status.' },
];
export class TourState {
  constructor(steps = STEPS, startAt = 8, hold = 7) { this.steps = steps; this.i = -1; this.t = 0; this.startAt = startAt; this.hold = hold; this.done = false; }
  /** returns the step index to show (or -1 before / after) */
  tick(dt, gameTime, paused = false) {
    if (this.done || paused) return this.i;
    if (this.i < 0) { if (gameTime >= this.startAt) { this.i = 0; this.t = 0; } return this.i; }
    this.t += dt; if (this.t >= this.hold) { this.t = 0; this.i++; if (this.i >= this.steps.length) { this.done = true; this.i = -1; } }
    return this.i;
  }
  skip() { this.done = true; this.i = -1; }
}
export class Tour {
  constructor(storage, doc = typeof document !== 'undefined' ? document : null) {
    this.st = storage; this.doc = doc; this.S = new TourState(); this.shown = -1;
    let seen = false; try { seen = !!storage?.getItem('fb_tour'); } catch (e) { /* ignore */ }
    if (seen) this.S.skip();
    if (doc && !seen) {
      const css = doc.createElement('style'); css.textContent = `#tour-tip{position:fixed;z-index:19;pointer-events:none;display:none;max-width:260px;padding:7px 10px;background:rgba(5,8,14,.92);border:1px solid #ffd9a0;color:#e8eef6;font:12px/1.35 'Helvetica Neue',Arial,sans-serif}
#tour-tip .k{display:inline-block;min-width:20px;padding:1px 6px;margin-right:6px;border:1px solid #ffd9a0;border-bottom-width:3px;border-radius:4px;background:#1a2438;color:#fff;font:700 12px var(--f-m,monospace);animation:tourk 1s ease-in-out infinite}
.tour-glow{outline:2px solid #ffd9a0!important;outline-offset:3px;box-shadow:0 0 18px 4px rgba(255,217,160,.55)!important}
@keyframes tourk{50%{box-shadow:0 0 10px #ffd9a0}}body.reduce-motion #tour-tip .k{animation:none}`; doc.head.appendChild(css);
      this.tip = doc.createElement('div'); this.tip.id = 'tour-tip'; doc.body.appendChild(this.tip);
    }
  }
  frame(dt, gameTime, paused) {
    const i = this.S.tick(dt, gameTime, paused); if (i === this.shown) return; this.shown = i; if (!this.doc) return;
    this.doc.querySelectorAll('.tour-glow').forEach(e => e.classList.remove('tour-glow'));
    if (i < 0) { if (this.tip) this.tip.style.display = 'none'; if (this.S.done) { try { this.st?.setItem('fb_tour', '1'); } catch (e) { /* ignore */ } } return; }
    const s = this.S.steps[i], el = this.doc.querySelector(s.sel);
    if (!el || !el.getClientRects().length) { this.S.t = this.S.hold; this.tip.style.display = 'none'; return; }   // not on screen: skip quickly
    el.classList.add('tour-glow'); const r = el.getBoundingClientRect(), tip = this.tip;
    tip.innerHTML = `<span class="k">${s.key}</span>${s.text}`; tip.style.display = 'block';
    const w = tip.offsetWidth || 260; tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left < innerWidth / 2 ? r.left : r.right - w)) + 'px'; tip.style.top = Math.min(innerHeight - 70, r.bottom + 10) + 'px';
  }
}
