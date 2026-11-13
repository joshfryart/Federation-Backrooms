// Gamepad support (Gamepad API, "standard" mapping). Polled once per frame from main.js (G.ticks). The Systems Nominal wheels / status / radio buttons
// (LB RB Y Back Start d-pad up, wheel stick) stay in js/menus.js gamepad(); this adds everything else:
//   play     left stick move · right stick look · A jump · B crouch (hold) · X use/interact (E) · RT fire · LT grapple / secondary · L3 sprint (hold)
//            R3 torch · d-pad left tool switch (V) · d-pad right use tool (X) · d-pad down put down (G)
//   menus    d-pad = arrow keys (open layers), A = Enter, B = Esc (menus.js) · screens: d-pad up/down + A click the highlighted button / card
//   perks    X / Y / B pick card 1 / 2 / 3 · title / death: A starts · paused: A or Start resumes
import { keyDown, keyUp, keyTap, setMove, dead, canSteer, lookBy } from './vkeys.js';

export const PAD_MAP = { jump: 0, crouch: 1, use: 2, fire: 7, alt: 6, sprint: 10, torch: 11, tool: 14, useTool: 15, putDown: 13, back: 8, start: 9 };
const LOOK_RATE = 2.9;   // rad/s at full deflection
const SEL = '.screen.show .btn, .screen.show .card, #liftui.show .lr, .show .acts button, .show #bd-go';

/** pure: raw gamepad -> { mx, mz, lx, ly, b[] (pressed booleans) } */
export function readPad(gp, dz = 0.18) {
  const a = gp.axes || [], [mx, mz] = dead(a[0] || 0, a[1] || 0, dz), [lx, ly] = dead(a[2] || 0, a[3] || 0, dz + 0.04);
  return { mx, mz, lx, ly, b: (gp.buttons || []).map(x => !!(x && (x.pressed || x.value > 0.5))) };
}

export function initGamepad({ G, CFG, act }) {
  let prev = [], held = { sprint: false, crouch: false }, wasOn = false;
  const visible = () => [...document.querySelectorAll(SEL)].filter(e => e.offsetParent !== null && !e.disabled);
  function focusMove(d) {
    const l = visible(); if (!l.length) return; let i = l.findIndex(e => e.classList.contains('padfocus')); l.forEach(e => e.classList.remove('padfocus'));
    i = i < 0 ? 0 : (i + d + l.length) % l.length; l[i].classList.add('padfocus'); l[i].scrollIntoView?.({ block: 'nearest' });
  }
  function focusClick() { const l = visible(); const e = l.find(x => x.classList.contains('padfocus')) || l[0]; if (e) { e.classList.remove('padfocus'); e.click(); return true; } return false; }
  function release() { if (held.sprint) { held.sprint = false; keyUp('ShiftLeft'); } if (held.crouch) { held.crouch = false; keyUp('KeyC'); } setMove(G, 'pad', 0, 0); }
  function tick(dt) {
    const gp = typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    if (!gp) { if (wasOn) { wasOn = false; release(); } return; }
    wasOn = true; document.body.classList.add('has-pad');
    const s = readPad(gp), b = s.b, pv = prev, down = (i) => b[i] && !pv[i]; prev = b;
    const ph = G.phase;
    if (canSteer(G) && !G.menus?.view?.W) {
      setMove(G, 'pad', s.mx, s.mz);
      if (s.lx || s.ly) lookBy(G, CFG, s.lx * LOOK_RATE * dt * Math.abs(s.lx) ** 0.5, s.ly * LOOK_RATE * 0.8 * dt * Math.abs(s.ly) ** 0.5);
      if (down(PAD_MAP.jump)) keyTap('Space');
      if (b[PAD_MAP.crouch] !== held.crouch) { held.crouch = b[PAD_MAP.crouch]; (held.crouch ? keyDown : keyUp)('KeyC'); }
      if (b[PAD_MAP.sprint] !== held.sprint) { held.sprint = b[PAD_MAP.sprint]; (held.sprint ? keyDown : keyUp)('ShiftLeft'); }
      if (down(PAD_MAP.use)) keyTap('KeyE');
      if (down(PAD_MAP.fire)) act?.fire(); if (down(PAD_MAP.alt)) act?.alt();
      if (down(PAD_MAP.torch)) keyTap('KeyF'); if (down(PAD_MAP.tool)) keyTap('KeyV'); if (down(PAD_MAP.useTool)) keyTap('KeyX'); if (down(PAD_MAP.putDown)) keyTap('KeyG');
      return;
    }
    release();
    if (ph === 'play' && G.menuPause) {   // a menu layer is open: its key handlers get arrows / Enter (B and Start are menus.js's)
      if (G.menus?.view?.W) return;
      if (down(12)) keyTap('ArrowUp'); if (down(13)) keyTap('ArrowDown'); if (down(14)) keyTap('ArrowLeft'); if (down(15)) keyTap('ArrowRight'); if (down(0)) keyTap('Enter');
      return;
    }
    if (ph === 'perk') { const n = down(2) ? 1 : down(3) ? 2 : down(1) ? 3 : 0; if (n) keyTap('Digit' + n); return; }
    if (ph === 'select') { if (down(1) || down(2)) keyTap('Escape'); if (down(12)) focusMove(-1); if (down(13)) focusMove(1); if (down(0)) focusClick(); return; }
    if (ph === 'paused' && !G.scriptPaused && (down(0) || down(9))) { document.getElementById('resume')?.click(); return; }
    if (ph === 'title' || ph === 'dead') { if (down(0) && !visible().some(e => e.classList.contains('padfocus'))) { keyTap('Enter'); return; } }
    if (down(12) || down(14)) focusMove(-1); if (down(13) || down(15)) focusMove(1); if (down(0)) focusClick();
  }
  (G.ticks || (G.ticks = [])).push(tick);
  return { tick, release };
}
