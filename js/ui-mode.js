// UI mode / layer stack for Systems Nominal menus (docs/ui.md, docs/mockups/menus.md section 2).
//
// The bug this fixes: menus used to be overlays on a pointer-locked canvas. Esc while locked belongs to the browser:
// it exits pointer lock (the page may or may not even see the keydown), `pointerlockchange` then opened the pause
// screen — so closing J/H also paused, or the menu was left under the pause screen. Now every menu RELEASES the lock
// on purpose (free cursor), records that it did (`expectUnlock`), and Esc is a plain keydown that pops exactly ONE
// layer. When the last layer closes we re-request the lock inside that key/click gesture; if the browser refuses
// (Chrome blocks an instant re-lock after a user Esc-exit) a small "Click to resume" chip shows instead of the pause.
//
// Pure state machine (no DOM, no globals): effects are injected, so tools/test-ui.mjs drives it in node.
//   const UI = createUIMode({ isLocked, exitLock, requestLock, onChange })
//   UI.open(kind, layer)   push a layer { close(), back() -> stillOpen, key(e) -> handled, toggle: 'KeyJ' }
//   UI.closed(kind)        a component closed itself: drop it (no callback); relock when the stack empties
//   UI.close(kind)         close one layer by kind (calls its close)       UI.closeAll()
//   UI.escape()            Esc: pop exactly one layer (wheel first)         UI.back(): Backspace (layer.back, else close)
//   UI.holdWheel(w) / pinWheel() / endWheel()   the quick wheel: held = keeps the lock (mouse deltas steer it);
//                          pinned = a layer like any other (free cursor, click an icon)
//   UI.onLockChange(locked, phase) -> 'locked' | 'ignore' | 'cancel-wheel' | 'pause'   (decides what an unlock means)
//   UI.frozen              true while any layer or wheel is open: the whole world pauses (G.menuPause)
//   UI.mode                'play' | 'wheel' | 'menu' | 'resume'
export function createUIMode(fx = {}) {
  const f = { isLocked: () => false, exitLock: () => { }, requestLock: () => null, onChange: () => { }, ...fx };
  const UI = {
    stack: [],            // [{ kind, close, back, key, toggle }]
    expectUnlock: false,  // we released pointer lock ourselves: the next unlock event is not a pause
    needClick: false,     // re-lock was refused: show "Click to resume" (no pause screen)
    wheel: null,          // { held, pinned, ... } owned by js/wheel.js; held wheels are not on the stack
    log: [],              // last few transitions (debug / tests)
    get frozen() { return this.stack.length > 0 || !!this.wheel; },
    get mode() { return this.wheel?.held ? 'wheel' : this.stack.length ? 'menu' : this.needClick ? 'resume' : 'play'; },
    top() { return this.stack[this.stack.length - 1] || null; },
    has(kind) { return this.stack.some(l => l.kind === kind); },
    note(t) { this.log.push(t); if (this.log.length > 30) this.log.shift(); },
    // ---- free the cursor (once, when the first layer opens)
    release() { if (f.isLocked()) { this.expectUnlock = true; f.exitLock(); } },
    relock() {
      if (this.frozen) return; this.needClick = false;
      let r = null; try { r = f.requestLock(); } catch { r = null; this.needClick = true; }
      if (r && typeof r.then === 'function') r.then(() => { }, () => { if (!this.frozen) { this.needClick = true; f.onChange(this); } });
      this.note('relock');
    },
    open(kind, layer = {}) {
      const ex = this.stack.find(l => l.kind === kind);
      if (ex) { Object.assign(ex, layer); this.stack.splice(this.stack.indexOf(ex), 1); this.stack.push(ex); f.onChange(this); return ex; }   // re-open = bring to front
      const was = this.frozen && !this.wheel?.held; const L = { kind, ...layer }; this.stack.push(L); this.needClick = false;
      if (!was) this.release(); this.note('open ' + kind); f.onChange(this); return L;
    },
    _drop(L) { const i = this.stack.indexOf(L); if (i < 0) return false; this.stack.splice(i, 1); if (this.wheel?.pinned && L.kind === 'wheel') this.wheel = null; return true; },
    _after() { if (!this.frozen) this.relock(); f.onChange(this); },
    closed(kind) { const L = this.stack.find(l => l.kind === kind); if (!L) return false; this._drop(L); this.note('closed ' + kind); this._after(); return true; },
    close(kind) {
      const L = this.stack.find(l => l.kind === kind); if (!L) return false;
      this._drop(L); if (L.close) { try { L.close(); } catch (e) { console.warn(e); } } this.note('close ' + kind); this._after(); return true;
    },
    closeAll() { const all = this.stack.slice().reverse(); for (const L of all) { this._drop(L); try { L.close?.(); } catch { } } if (this.wheel) this.wheel = null; this._after(); },
    // Esc: exactly one layer. A held wheel is cancelled; a pinned wheel is the top layer like any other.
    escape() {
      if (this.wheel?.held) { this.wheel = null; this.note('esc: wheel cancelled'); f.onChange(this); return 'wheel'; }
      const L = this.top(); if (!L) return 'none';
      if (L.back) { const r = this.back(); return r === 'back' ? 'back' : L.kind; }   // layers with levels (list menus, board popover) step back one
      this.close(L.kind); return L.kind;
    },
    back() {
      const L = this.top(); if (!L) return 'none';
      if (L.back) { let still = false; try { still = L.back(); } catch { } if (still) { f.onChange(this); return 'back'; } if (this.stack.includes(L)) { this._drop(L); this._after(); } return L.kind; }
      return this.escape();
    },
    // ---- quick wheel
    holdWheel(w = {}) { this.wheel = { ...w, held: true, pinned: false }; this.needClick = false; this.note('wheel held'); f.onChange(this); return this.wheel; },
    pinWheel(w = null) {   // tap: becomes a free-cursor layer
      const W = this.wheel || w || {}; W.held = false; W.pinned = true; this.wheel = W;
      const was = this.stack.length > 0; this.stack.push({ kind: 'wheel', close: () => { this.wheel = null; } }); if (!was) this.release(); this.note('wheel pinned'); f.onChange(this); return W;
    },
    endWheel() {   // commit / cancel: the wheel goes away; relock if nothing else is open
      const W = this.wheel; if (!W) return; this.wheel = null; const L = this.stack.find(l => l.kind === 'wheel'); if (L) this.stack.splice(this.stack.indexOf(L), 1); this.note('wheel end'); this._after();
    },
    // ---- pointer lock events (main.js 'pointerlockchange')
    onLockChange(locked, phase = 'play') {
      if (locked) { this.expectUnlock = false; this.needClick = false; f.onChange(this); return 'locked'; }
      if (phase !== 'play') { this.expectUnlock = false; return 'ignore'; }
      if (this.expectUnlock || this.stack.length) { this.expectUnlock = false; return 'ignore'; }
      if (this.wheel?.held) { this.wheel = null; this.needClick = true; this.note('native unlock under held wheel'); f.onChange(this); return 'cancel-wheel'; }
      return 'pause';
    },
    onLockError() { if (!this.frozen) { this.needClick = true; f.onChange(this); } },
    // P / Start: a pause the script asked for. The game shows its pause screen; we only make the unlock expected.
    scriptPause() { const all = this.stack.slice().reverse(); this.stack = []; this.wheel = null; for (const L of all) { try { L.close?.(); } catch { } } this.expectUnlock = f.isLocked(); f.exitLock(); this.needClick = false; this.note('script pause'); f.onChange(this); },
  };
  return UI;
}

// Shared hub so HUD modules built elsewhere (DutyHUD in main.js, CommsHUD in shipcomms.js, the nav agent's map) reach
// the one UI stack, the portrait cache and the menus glue without new constructor plumbing. Set by js/menus.js.
export const UIHUB = { ui: null, portraits: null, menus: null };

// ---- DOM glue: the "Click to resume" chip + body classes (ui-free = cursor is ours, ui-menu = a layer is open).
const CHIP_CSS = `#ui-resume{position:fixed;left:50%;top:42%;transform:translateX(-50%);z-index:30;display:none;background:rgba(5,8,14,.92);border:1px solid var(--lc1,#f2a03d);padding:10px 22px;font:700 13px var(--f-d,Arial);letter-spacing:.16em;text-transform:uppercase;color:var(--lc4,#ffd9a0);cursor:pointer}
#ui-resume.on{display:block}body.ui-menu #cross{opacity:.25}body.ui-menu .ui-layer{cursor:default}`;
export function mountUIMode(UI, { onResumeClick } = {}) {
  if (typeof document === 'undefined') return () => { };
  if (!document.getElementById('ui-mode-css')) { const st = document.createElement('style'); st.id = 'ui-mode-css'; st.textContent = CHIP_CSS; document.head.appendChild(st); }
  let chip = document.getElementById('ui-resume'); if (!chip) { chip = document.createElement('div'); chip.id = 'ui-resume'; chip.className = 'ui-layer'; chip.textContent = 'Click to resume'; document.body.appendChild(chip); }
  chip.onmousedown = (e) => { e.stopPropagation(); onResumeClick?.(); };
  return function sync(phase = 'play') {
    chip.classList.toggle('on', UI.needClick && phase === 'play' && !UI.frozen);
    document.body.classList.toggle('ui-menu', UI.frozen);
  };
}
