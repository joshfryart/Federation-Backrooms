// Touch / mobile controls (TODO section 4). Only on coarse-pointer / touch devices, or with ?touch=1 (?touch=0 forces it off).
// No pointer lock on touch: the canvas lock request is stubbed to a resolved promise, so the UI stack (js/ui-mode.js) never shows the
// "Click to resume" chip and an unlock never pauses. Every action goes through the SAME path as the keyboard: a synthetic KeyboardEvent
// dispatched on window (js/menus.js, js/main.js, js/nav-hud.js, js/hud-duty.js, js/talk.js all listen there), so nothing here knows game rules.
//   left part of the screen   floating move stick -> G.touchMove = { x, z } (main.js step() adds it to the WASD axes)
//   rest of the screen        drag to look (P.yaw / P.pitch, CFG.sens), also while a room job wants a swing / sweep with E held
//   action cluster            Use (E, held while pressed), Jump (Space), Crouch / slide (C), Strike (left click = __game.fire()),
//                             Grab (right click = combat.secondary) / Grapple in madness (Q), Sprint (Shift, a latch)
//   top strip                 Pause, Wheel (Q tap = pinned wheel), Duty (J), Radio (H), Map (M), Ship status (Tab, held), More
//   More drawer               Torch F, Tool V, Use tool X, Throw T, Drop G, Cart R, Alert K, Log L, HUD B
//   Back                      Esc: shown whenever a menu / wheel / map / lift panel / conversation is up
// Menus, the duty board, the LCARS panels, the lift panel and the pause screen are ordinary DOM: a tap is a native click / compatibility
// mousedown, which they already handle. The job mini-game buttons (js/jobgame-ui.js data-k) get real press / release on touch so the
// hold buttons work (the compatibility mouse events come only after the finger lifts).
// Calm visuals (CFG.calm) and prefers-reduced-motion: no press animation, no transitions. Safe-area insets: env(safe-area-inset-*).
//   window.__touch = { on, mode, press(id, down), state() }   (tests: tools/test-touch.mjs)

/** should touch controls be on? q: the ?touch= value; coarse: pointer is coarse (or the device has touch and no hover) */
export function touchWanted(q, coarse) { if (q === '0') return false; if (q === '1') return true; return !!coarse; }
/** stick vector from a finger offset (px): dead zone, unit clamp, rescaled so just past the dead zone is a slow walk. z < 0 = forward */
export function stickVec(dx, dy, R = 56, dead = 0.14) {
  const raw = Math.hypot(dx, dy) / R; if (raw < dead) return { x: 0, z: 0, mag: 0 };
  const m = Math.min(1, (raw - dead) / (1 - dead)), k = m / (raw || 1) / R; return { x: dx * k, z: dy * k, mag: m };
}
/** which control surface a new touch at (x, y) belongs to on a w x h screen: 'stick' on the left 42 % below the top strip, else 'look' */
export function zoneOf(x, y, w, h) { return x < w * 0.42 && y > h * 0.18 ? 'stick' : 'look'; }
export const LOOK_K = 0.0052;   // radians per CSS px at sensitivity 1 (mouse is 0.0022 per count; a thumb travels far less)

const BTN_NOM = [
  // [id, label, key / action, kind]  kind: hold = keydown on press, keyup on release; tap = keydown + keyup on press; act / latch: custom
  ['use', 'Use', 'KeyE', 'hold', 'E'], ['jump', 'Jump', 'Space', 'hold', '␣'], ['crouch', 'Crouch', 'KeyC', 'hold', 'C'],
  ['strike', 'Strike', 'fire', 'act', '◉'], ['grab', 'Grab', 'grab', 'act', '◎'], ['sprint', 'Sprint', 'ShiftLeft', 'latch', '⇧'],
];
const BTN_MAD = [
  ['use', 'Use', 'KeyE', 'hold', 'E'], ['jump', 'Jump', 'Space', 'hold', '␣'], ['crouch', 'Slide', 'KeyC', 'hold', 'C'],
  ['strike', 'Fire', 'fire', 'act', '◉'], ['grab', 'Grapple', 'KeyQ', 'tap', 'Q'], ['sprint', 'Sprint', 'ShiftLeft', 'latch', '⇧'],
];
const TOP_NOM = [['pause', 'Pause', 'pause', 'act'], ['wheel', 'Wheel', 'KeyQ', 'tap'], ['duty', 'Duty', 'KeyJ', 'tap'], ['radio', 'Radio', 'KeyH', 'tap'], ['map', 'Map', 'KeyM', 'tap'], ['status', 'Ship', 'Tab', 'hold'], ['more', '•••', 'more', 'act']];
const TOP_MAD = [['pause', 'Pause', 'pause', 'act'], ['map', 'Map', 'KeyM', 'tap'], ['status', 'Ship', 'Tab', 'hold'], ['torch', 'Torch', 'KeyF', 'tap']];
const MORE = [['torch', 'Torch', 'KeyF', 'tap'], ['tool', 'Tool', 'KeyV', 'tap'], ['usetool', 'Use tool', 'KeyX', 'tap'], ['throw', 'Throw', 'KeyT', 'tap'], ['drop', 'Drop', 'KeyG', 'tap'], ['cart', 'Cart', 'KeyR', 'tap'], ['alert', 'Alert', 'KeyK', 'tap'], ['log', 'Log', 'KeyL', 'tap'], ['hud', 'HUD', 'KeyB', 'tap']];

const CSS = `
body.touch{touch-action:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}
body.touch canvas#view{touch-action:none}
body.touch .screen,body.touch #bd-panel,body.touch #cm-radio,body.touch #cm-log,body.touch #cm-details,body.touch .ui-layer{touch-action:pan-y}
#tc{position:fixed;inset:0;z-index:26;pointer-events:none;display:none;font:800 11px/1 var(--f-d,Arial,sans-serif);letter-spacing:.12em;text-transform:uppercase;color:#120a05;user-select:none;-webkit-user-select:none}
body.touch #tc{display:block}
#tc button{pointer-events:auto;touch-action:none;border:0;margin:0;padding:0;font:inherit;letter-spacing:inherit;text-transform:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:filter .08s,transform .08s}
#tc button.dn{filter:brightness(1.45);transform:scale(.94)}#tc button.lit{box-shadow:0 0 0 2px #fff inset}
body.tc-calm #tc button{transition:none}body.tc-calm #tc button.dn{transform:none}
@media (prefers-reduced-motion:reduce){#tc button{transition:none}#tc button.dn{transform:none}}
#tc-act{position:absolute;right:calc(10px + env(safe-area-inset-right));bottom:calc(10px + env(safe-area-inset-bottom));display:grid;grid-template-columns:repeat(3,58px);grid-template-rows:repeat(2,58px);gap:8px}
#tc-act button{border-radius:50%;background:rgba(111,143,184,.62);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:9.5px;box-shadow:0 0 0 1px rgba(0,0,0,.5),0 2px 8px rgba(0,0,0,.35)}
#tc-act button i{font-style:normal;font:800 15px var(--f-m,monospace);letter-spacing:0}
#tc-act [data-tc=use]{background:rgba(242,160,61,.88);color:#120a05}#tc-act [data-tc=jump]{background:rgba(88,201,185,.78);color:#120a05}#tc-act [data-tc=strike]{background:rgba(255,122,107,.72)}
body.cb #tc-act [data-tc=strike]{background:rgba(255,176,0,.75);color:#120a05}#tc-act [data-tc=sprint].lit{background:rgba(127,212,245,.9);color:#120a05}
#tc-top{position:absolute;left:50%;transform:translateX(-50%);top:calc(6px + env(safe-area-inset-top));display:flex;gap:5px}
#tc-top button,#tc-more button,#tc-back{height:34px;min-width:44px;padding:0 10px;border-radius:17px;background:rgba(185,155,230,.78);font-size:10px}
#tc-top [data-tc=pause]{background:rgba(242,160,61,.85)}#tc-top [data-tc=more].lit{background:#fff}
#tc-more{position:absolute;left:50%;transform:translateX(-50%);top:calc(46px + env(safe-area-inset-top));display:none;flex-wrap:wrap;justify-content:center;gap:5px;max-width:min(520px,94vw);padding:6px;background:rgba(5,8,14,.72);border-radius:20px}
#tc-more.on{display:flex}#tc-more button{background:rgba(125,151,232,.8)}
#tc-back{position:absolute;right:calc(10px + env(safe-area-inset-right));bottom:calc(10px + env(safe-area-inset-bottom));display:none;height:44px;min-width:84px;border-radius:22px;background:rgba(242,160,61,.92);font-size:12px;z-index:2}
body.touch #nv-compass{top:calc(42px + env(safe-area-inset-top));width:40vw}
#tc-stick{position:absolute;width:112px;height:112px;margin:-56px 0 0 -56px;border-radius:50%;border:2px solid rgba(232,238,246,.45);background:rgba(7,11,19,.28);display:none}
#tc-stick i{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(232,238,246,.55);box-shadow:0 0 0 1px rgba(0,0,0,.4)}
#tc-stick.on{display:block}
#tc-hint{position:absolute;left:calc(18px + env(safe-area-inset-left));bottom:calc(18px + env(safe-area-inset-bottom));width:96px;height:96px;margin:0;border-radius:50%;border:2px dashed rgba(232,238,246,.22);display:none}
#tc[data-mode=play] #tc-hint{display:block}#tc[data-mode=play] #tc-hint.gone{display:none}
#tc:not([data-mode=play]) #tc-act,#tc:not([data-mode=play]) #tc-top,#tc:not([data-mode=play]) #tc-more{display:none}
#tc[data-mode=menu] #tc-back{display:block}
body.touch #topleft{left:calc(14px + env(safe-area-inset-left));top:calc(14px + env(safe-area-inset-top))}
body.touch #objective,body.touch #minimap,body.touch #faults{right:calc(14px + env(safe-area-inset-right))}
body.touch #bars{left:calc(16px + env(safe-area-inset-left));bottom:calc(16px + env(safe-area-inset-bottom))}
body.touch #phaser{display:none}body.touch #ui-belt{bottom:calc(10px + env(safe-area-inset-bottom))}
body.touch #jobgame button{min-height:44px}body.touch #jobgame .jg-btns.tight button{min-width:40px}
body.touch .btn{min-height:44px}body.touch #ui-resume{display:none!important}
@media (orientation:portrait){#tc-top{left:auto;right:calc(8px + env(safe-area-inset-right));top:auto;bottom:calc(150px + env(safe-area-inset-bottom));transform:none;flex-direction:column;align-items:flex-end}
  #tc-more{top:auto;bottom:calc(150px + env(safe-area-inset-bottom));max-width:calc(100vw - 110px);left:calc(8px + env(safe-area-inset-left));transform:none}}
@media (max-height:460px){body.touch #minimap{width:110px;height:110px;top:calc(56px + env(safe-area-inset-top))}body.touch #faults{top:calc(172px + env(safe-area-inset-top))}
  #tc-act{grid-template-columns:repeat(3,52px);grid-template-rows:repeat(2,52px);gap:6px}#tc-top button{height:30px;min-width:38px;padding:0 7px;font-size:9px}}`;

export function initTouch() {
  if (typeof window === 'undefined' || window.__touch) return window.__touch;
  const q = new URLSearchParams(location.search).get('touch');
  const coarse = (window.matchMedia?.('(pointer: coarse)').matches) || (navigator.maxTouchPoints > 0 && window.matchMedia?.('(hover: none)').matches);
  const T = { on: touchWanted(q, coarse), mode: 'off', stick: null, look: null, held: new Map(), sprint: false, more: false, log: [] };
  window.__touch = T; if (!T.on) return T;

  const G = () => window.__game?.G, P = () => window.__game?.P, CFG = () => window.__game?.CFG || {};
  const nom = () => G()?.mode !== 'madness';
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code.replace(/^Key|^Digit/, ''), bubbles: true, cancelable: true }));
  const tapKey = (code) => { key('keydown', code); key('keyup', code); };
  const note = (t) => { T.log.push(t); if (T.log.length > 40) T.log.shift(); };

  // ---- pointer lock: never on touch. Requests resolve at once (the UI stack treats that as "relocked"), so no chip and no pause.
  const stubLock = () => { const c = document.getElementById('view'); if (c) c.requestPointerLock = () => Promise.resolve(); };
  stubLock();
  // let iOS draw under the notch only now that our CSS keeps everything inside env(safe-area-inset-*)
  { const m = document.querySelector('meta[name=viewport]'); if (m && !/viewport-fit/.test(m.content)) m.content += ',viewport-fit=cover'; }

  // ---- DOM
  const st = document.createElement('style'); st.id = 'touch-css'; st.textContent = CSS; document.head.appendChild(st);
  document.body.classList.add('touch');
  const root = document.createElement('div'); root.id = 'tc'; root.className = 'ui-layer'; root.dataset.mode = 'off'; root.setAttribute('aria-label', 'Touch controls');
  const btn = ([id, label, , , glyph]) => `<button type="button" data-tc="${id}" aria-label="${label}">${glyph ? `<i>${glyph}</i>` : ''}${label}</button>`;
  const build = () => {
    const N = nom(); T.built = N;
    root.innerHTML = `<div id="tc-hint"></div><div id="tc-stick"><i></i></div><div id="tc-top">${(N ? TOP_NOM : TOP_MAD).map(btn).join('')}</div>
      <div id="tc-more">${MORE.map(btn).join('')}</div><div id="tc-act">${(N ? BTN_NOM : BTN_MAD).map(btn).join('')}</div><button type="button" id="tc-back" data-tc="back" aria-label="Back">◀ Back</button>`;
    T.defs = Object.fromEntries([...(N ? BTN_NOM : BTN_MAD), ...(N ? TOP_NOM : TOP_MAD), ...MORE, ['back', 'Back', 'Escape', 'tap']].map(d => [d[0], d]));
    T.el = { stick: root.querySelector('#tc-stick'), knob: root.querySelector('#tc-stick i'), more: root.querySelector('#tc-more'), hint: root.querySelector('#tc-hint') };
  };
  build(); document.body.appendChild(root);

  // ---- actions
  const showScreen = (id) => { for (const s of document.querySelectorAll('.screen')) s.classList.toggle('show', s.id === id); };
  const ACT = {
    fire: () => window.__game?.fire?.(),
    grab: (down) => { const c = G()?.combat; if (down) c?.secondary?.(true); else window.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true })); },
    pause: () => { const g = G(); if (!g || g.phase !== 'play') return; if (nom() && g.menus) { tapKey('KeyP'); return; } g.phase = 'paused'; g.scriptPaused = false; showScreen('pause'); },
    more: () => { T.more = !T.more; T.el.more.classList.toggle('on', T.more); root.querySelector('[data-tc=more]')?.classList.toggle('lit', T.more); },
  };
  const setSprint = (on) => { if (T.sprint === on) return; T.sprint = on; key(on ? 'keydown' : 'keyup', 'ShiftLeft'); root.querySelector('[data-tc=sprint]')?.classList.toggle('lit', on); };
  /** press / release one control by id (also the test hook) */
  T.press = (id, down = true) => {
    const d = T.defs[id]; if (!d) return false; const [, , what, kind] = d; note(`${id} ${down ? 'down' : 'up'}`);
    if (kind === 'hold') key(down ? 'keydown' : 'keyup', what);
    else if (kind === 'tap') { if (down) tapKey(what); }
    else if (kind === 'latch') { if (down) setSprint(!T.sprint); }
    else if (kind === 'act') { if (what === 'grab') ACT.grab(down); else if (down) ACT[what]?.(); }
    if (down && T.more && T.el.more.contains(root.querySelector(`[data-tc="${id}"]`))) ACT.more();   // a drawer choice closes the drawer
    return true;
  };

  // ---- stick + look
  const setMove = (v) => { const g = G(); if (g) g.touchMove = v && (v.x || v.z) ? { x: v.x, z: v.z, mag: v.mag } : null; };
  const endStick = () => { if (!T.stick) return; T.stick = null; setMove(null); T.el.stick.classList.remove('on'); if (T.sprint) setSprint(false); };
  const lookBy = (dx, dy) => {
    const g = G(), p = P(); if (!g || !p) return; if (g.phase !== 'play' && g.phase !== 'ride') return; if (g.menuPause) return;
    const k = LOOK_K * (CFG().sens || 1); p.yaw -= dx * k; p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch - dy * k));
  };
  T.lookBy = lookBy;

  // ---- touch routing (window capture, before anything else). Touches on ordinary DOM UI fall through to native taps / scrolling.
  const jg = (el) => el?.closest?.('#jobgame [data-k]');
  // a button re-rendered under the finger (the mini-game redraws its buttons on every key) is detached: its touchend never reaches window,
  // so the release is also heard on the element itself (end() is idempotent per touch id)
  const hook = (el) => { el.addEventListener('touchend', (e) => end(e), { once: true }); el.addEventListener('touchcancel', (e) => end(e), { once: true }); };
  const isWorld = (el) => !el || el === document.body || el === document.documentElement || el.id === 'view' || el.id === 'tc' || el.closest?.('#tc-hint');
  addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      const el = t.target, b = el.closest?.('#tc [data-tc]');
      if (b) { e.preventDefault(); const id = b.dataset.tc; T.held.set(t.identifier, { id, b }); b.classList.add('dn'); hook(b); T.press(id, true); continue; }
      const k = jg(el);
      if (k) {   // job mini-game: press now, release on lift (hold buttons); Esc keeps its own handler (closes the layer)
        e.preventDefault(); const code = k.dataset.k, J = window.__game?.jobgame; k.classList.add('dn');
        if (code === 'Escape') k.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); else J?.key(code, true);
        T.held.set(t.identifier, { jg: code, b: k }); hook(k); continue;
      }
      if (T.mode !== 'play' && T.mode !== 'ride') continue;
      if (!isWorld(el)) continue;
      e.preventDefault();
      const z = T.mode === 'ride' ? 'look' : zoneOf(t.clientX, t.clientY, innerWidth, innerHeight);
      if (z === 'stick' && !T.stick) { T.stick = { id: t.identifier, x0: t.clientX, y0: t.clientY }; const s = T.el.stick; s.style.left = t.clientX + 'px'; s.style.top = t.clientY + 'px'; s.classList.add('on'); T.el.knob.style.transform = ''; T.el.hint.classList.add('gone'); }
      else if (!T.look) T.look = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
  }, { passive: false, capture: true });
  addEventListener('touchmove', (e) => {
    let mine = false;
    for (const t of e.changedTouches) {
      if (T.stick?.id === t.identifier) { mine = true; const dx = t.clientX - T.stick.x0, dy = t.clientY - T.stick.y0, v = stickVec(dx, dy); setMove(v); const L = Math.min(1, Math.hypot(dx, dy) / 56) * 56 / (Math.hypot(dx, dy) || 1); T.el.knob.style.transform = `translate(${dx * L}px,${dy * L}px)`; }
      else if (T.look?.id === t.identifier) { mine = true; lookBy(t.clientX - T.look.x, t.clientY - T.look.y); T.look.x = t.clientX; T.look.y = t.clientY; }
      else if (T.held.has(t.identifier)) mine = true;
    }
    if (mine) e.preventDefault();
  }, { passive: false, capture: true });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (T.stick?.id === t.identifier) { endStick(); e.preventDefault(); }
      if (T.look?.id === t.identifier) { T.look = null; e.preventDefault(); }
      const h = T.held.get(t.identifier); if (!h) continue; T.held.delete(t.identifier); e.preventDefault(); h.b?.classList.remove('dn');
      if (h.id) T.press(h.id, false); else if (h.jg && h.jg !== 'Escape') window.__game?.jobgame?.key(h.jg, false);
    }
  };
  addEventListener('touchend', end, { passive: false, capture: true }); addEventListener('touchcancel', end, { passive: false, capture: true });

  // ---- mode: what the overlay shows. play = the full set; ride = look only; menu = Back only; off = nothing (title, pause, death screens...)
  const releaseAll = () => { endStick(); T.look = null; for (const [, h] of T.held) { h.b?.classList.remove('dn'); if (h.id) T.press(h.id, false); } T.held.clear(); if (T.more) ACT.more(); };
  const modeOf = () => {
    const g = G(); if (!g) return 'off'; const ph = g.phase;
    if (ph === 'play') return g.menuPause || g.nav?.mapOpen ? 'menu' : 'play';
    if (ph === 'select' || ph === 'talk') return 'menu';
    if (ph === 'ride') return 'ride';
    return 'off';
  };
  T.sync = () => {
    if (window.__game && T.built !== nom()) { releaseAll(); build(); }
    const m = modeOf(); if (m !== T.mode) { if (T.mode === 'play' || m === 'off') releaseAll(); T.mode = m; root.dataset.mode = m; note('mode ' + m); }
    document.body.classList.toggle('tc-calm', !!CFG().calm);
    stubLock();
  };
  T.state = () => ({ on: T.on, mode: T.mode, stick: !!T.stick, look: !!T.look, move: G()?.touchMove || null, sprint: T.sprint, more: T.more, held: [...T.held.values()].map(h => h.id || h.jg) });
  const loop = () => { try { T.sync(); } catch (e) { console.warn('touch sync', e); } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  return T;
}

if (typeof document !== 'undefined') { if (document.readyState === 'loading') addEventListener('DOMContentLoaded', initTouch); else initTouch(); }
