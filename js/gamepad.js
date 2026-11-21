// Gamepad support (standard mapping), polled once per frame: `G.pad = new PadInput({ G, P, CFG, NOM, fire, secondary, resume }); G.pad.tick(dt)`.
// It never touches the game directly where a key already does the job: buttons become synthetic keydown / keyup on window (the same events the
// keyboard sends), so movement, E hold/tap, the job mini-games (their key codes), the lift panel, the nav map and the menu router all work
// unchanged. The right stick turns the view straight on P.yaw / P.pitch (no pointer lock needed; room jobs read the swing from the yaw speed).
//
// Mapping (Xbox names; Y / LB / RB wheels, Start pause, Back status and d-pad up radio stay with js/menus.js `gamepad()`):
//   play     LS move (WASD)  RS look  A jump  B crouch (hold)  X use / interact (E, hold or tap)  LT grapple / secondary  RT strike / fire
//            L3 sprint (hold)  R3 use handheld (X)  d-pad down = nav map (M)  d-pad left = torch (F)  d-pad right = put down / cycle (G)
//   job game A Enter  X Space  d-pad / LS = arrows  Y 1  RB 2  LB 3  RT 4  LT 5  R3 6  L3 7  B cancel (Esc); the on-screen buttons show their glyph
//   menus    d-pad / LS = move a cursor over the open layer's options (duty board, option menus, radio, comms)  A choose  B back
//   nav map  d-pad / LS up-down = deck  A pin the hovered room  X find (F)  Y nearest lift (L)  B close
//   screens  title / dead: A or Start = Enter  boot "Enter the ship": A  pause: A resume  lift panel: A ride, B close  perk: X / Y / RB = 1 / 2 / 3
// Calm: slower, smoothed look and no rumble. A glyph strip (`#padhint`) shows only while a pad was the last thing used.
const DZ_MOVE = 0.22, DZ_LOOK = 0.14, DIGITAL = 0.38, YAW_RATE = 2.6, PITCH_RATE = 1.8;
const DIG_ORDER = [3, 5, 4, 7, 6, 11, 10];   // job-game digits 1..7: Y, RB, LB, RT, LT, R3, L3
const GLYPH = { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'Back', 9: 'Start', 10: 'L3', 11: 'R3', 12: '↑', 13: '↓', 14: '←', 15: '→' };
const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const CSS = `#padhint{position:fixed;right:14px;bottom:12px;z-index:60;display:none;gap:6px 10px;flex-wrap:wrap;justify-content:flex-end;max-width:min(560px,70vw);pointer-events:none;font:600 12px/1.2 system-ui,sans-serif;color:#e9e4f7}
body.pad-on #padhint.on{display:flex}#padhint span{display:inline-flex;align-items:center;gap:5px;background:rgba(10,9,18,.72);border:1px solid #55507e;border-radius:999px;padding:3px 9px 3px 4px}
#padhint b,.pgl{display:inline-grid;place-items:center;min-width:18px;height:18px;border-radius:9px;padding:0 4px;background:#b99be6;color:#0a0912;font:800 10px/1 system-ui,sans-serif}
.pgl{margin-left:6px;vertical-align:middle}#padhint b.a,.pgl.a{background:#7fd69a}#padhint b.b,.pgl.b{background:#ee8a8a}#padhint b.x,.pgl.x{background:#7da8f0}#padhint b.y,.pgl.y{background:#f4c25b}
.padsel{outline:2px solid #f4c25b!important;outline-offset:2px;background:rgba(244,194,91,.18)!important}`;

export class PadInput {
  constructor(ctx) {
    this.c = ctx; this.G = ctx.G; this.P = ctx.P; this.active = false; this.pad = null; this.prev = []; this.mode = 'none'; this.held = new Set(); this.swallow = new Set();
    this.dir = null; this.dirT = 0; this.cur = 0; this.lx = 0; this.ly = 0; this.sx = 0; this.sy = 0; this.sig = ''; this.t = 0; this._ann = 0; this.log = [];
    if (typeof document === 'undefined') return;
    if (!document.getElementById('padhint-css')) { const st = document.createElement('style'); st.id = 'padhint-css'; st.textContent = CSS; document.head.appendChild(st); }
    let el = document.getElementById('padhint'); if (!el) { el = document.createElement('div'); el.id = 'padhint'; el.setAttribute('aria-hidden', 'true'); document.body.appendChild(el); } this.el = el;
    const off = (e) => { if (!this._emitting) this.setActive(false); };   // a real keyboard / mouse took over: hide the glyphs
    addEventListener('keydown', off, true); addEventListener('mousemove', (e) => { if (!this._emitting && (e.movementX || e.movementY)) this.setActive(false); }, true);
  }
  setActive(on) { if (this.active === on) return; this.active = on; if (typeof document !== 'undefined') { document.body.classList.toggle('pad-on', on); if (!on) { this.releaseAll(); this.clearSel(); this.el?.classList.remove('on'); } } this.sig = ''; }
  gp() { const l = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []; for (const p of l) if (p && p.connected !== false) return p; return null; }

  // ---- synthetic keys
  emit(code, down) {
    if (down === this.held.has(code)) return; down ? this.held.add(code) : this.held.delete(code); this.log.push((down ? '+' : '-') + code); if (this.log.length > 60) this.log.shift();
    this._emitting = true; try { dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true, cancelable: true })); } finally { this._emitting = false; }
  }
  tap(code) { this.emit(code, true); this.emit(code, false); }
  releaseAll() { for (const k of [...this.held]) this.emit(k, false); }
  clearSel() { if (typeof document !== 'undefined') for (const e of document.querySelectorAll('.padsel')) e.classList.remove('padsel'); }

  /** which input layer is live right now */
  modeNow() {
    const G = this.G, UI = G.menus?.UI;
    if (G.phase === 'play') { if (UI?.wheel) return 'wheel'; if (G.jobgame?.active && G.jobgame.phase) return 'job'; if (UI?.stack?.length) return 'layer'; if (G.nav?.mapOpen) return 'map'; return 'play'; }
    if (G.phase === 'paused' && G.scriptPaused) return 'none';   // menus.js: Start resumes
    return 'screen';
  }

  tick(dt = 1 / 60) {
    const gp = this.gp(); this.t += dt;
    if (!gp) { if (this.pad != null) { this.pad = null; this.setActive(false); } return; }
    if (this.pad !== gp.index) { this.pad = gp.index; this.prev = gp.buttons.map(x => x.pressed); this.swallow = new Set(this.prev.map((v, i) => v ? i : -1).filter(i => i >= 0)); }
    const btn = gp.buttons.map(x => !!(x.pressed || x.value > 0.5)), ax = (i) => gp.axes[i] || 0;
    const dz = (x, y, d) => { const m = Math.hypot(x, y); if (m < d) return [0, 0]; const k = (m - d) / (1 - d) / m; return [x * k, y * k]; };
    const [lx, ly] = dz(ax(0), ax(1), DZ_MOVE), [rx, ry] = dz(ax(2), ax(3), DZ_LOOK);
    if (btn.some((v, i) => v && !this.prev[i]) || lx || ly || rx || ry) this.setActive(true);
    const mode = this.modeNow(); if (mode !== this.mode) { this.releaseAll(); this.clearSel(); this.mode = mode; this.dir = null; this.swallow = new Set(btn.map((v, i) => v ? i : -1).filter(i => i >= 0)); this.cur = 0; }
    for (const i of [...this.swallow]) if (!btn[i]) this.swallow.delete(i);
    const down = (i) => btn[i] && !this.prev[i] && !this.swallow.has(i), up = (i) => !btn[i] && this.prev[i], on = (i) => btn[i] && !this.swallow.has(i);
    const calm = !!this.c.CFG?.calm;

    if (mode === 'play') this.play(dt, { btn, down, up, on, lx, ly, rx, ry, calm });
    else if (mode === 'job') this.job({ btn, down, up, on, lx, ly });
    else if (mode === 'layer') this.layer({ down, lx, ly, dt });
    else if (mode === 'map') this.map({ down, lx, ly, dt });
    else if (mode === 'screen') this.screen({ down });
    this.prev = btn; this.hints(mode);
  }

  // ---- plain play
  play(dt, { down, up, on, lx, ly, rx, ry, calm }) {
    const P = this.P, G = this.G, c = this.c;
    this.emit('KeyA', lx < -DIGITAL); this.emit('KeyD', lx > DIGITAL); this.emit('KeyW', ly < -DIGITAL); this.emit('KeyS', ly > DIGITAL);
    this.emit('ShiftLeft', on(10) && (lx || ly) !== 0);   // L3 sprint while moving
    this.emit('Space', on(0)); this.emit('KeyC', on(1)); this.emit('KeyE', on(2));
    if (down(11)) this.tap('KeyX');
    if (down(13)) this.tap('KeyM'); if (down(14)) this.tap('KeyF'); if (down(15)) this.tap('KeyG');
    if (down(7)) c.fire?.(); if (down(6)) c.secondary?.(true); if (up(6)) G.combat?.secondary?.(false);
    // look: the stick speed is squared for fine aim; Calm slows the turn and eases it in
    const sc = (calm ? 0.65 : 1) * (this.c.CFG?.sens ?? 1), k = calm ? Math.min(1, dt * 9) : 1;
    this.sx += (rx - this.sx) * k; this.sy += (ry - this.sy) * k;
    const f = (v) => Math.sign(v) * Math.min(1, Math.abs(v)) ** 2;
    if (!G.menuPause && !G.paused) { P.yaw -= f(this.sx) * YAW_RATE * sc * dt; P.pitch = Math.max(-1.45, Math.min(1.45, P.pitch - f(this.sy) * PITCH_RATE * sc * dt)); }
  }

  // ---- a job console game is up: its own key codes
  job({ down, on, lx, ly }) {
    const J = this.G.jobgame; this.dirNav(lx, ly, down, (code) => this.tap(code));
    if (J.phase === 'intro') { if (down(0) || down(2)) this.tap('Enter'); return; }
    this.emit('Enter', on(0)); this.emit('Space', on(2));
    DIG_ORDER.forEach((b, i) => this.emit('Digit' + (i + 1), on(b)));
  }
  /** d-pad + left stick as edge-triggered, auto-repeating direction taps (arrows) */
  dirNav(lx, ly, down, fire, dt = 1 / 60) {
    let d = null; if (down(12)) d = 0; else if (down(13)) d = 1; else if (down(14)) d = 2; else if (down(15)) d = 3;
    const sd = Math.abs(lx) > Math.abs(ly) ? (lx < -DIGITAL ? 2 : lx > DIGITAL ? 3 : null) : (ly < -DIGITAL ? 0 : ly > DIGITAL ? 1 : null);
    if (d == null && sd != null) { if (sd !== this.dir) { d = sd; this.dirT = 0.38; } else if ((this.dirT -= dt) <= 0) { d = sd; this.dirT = 0.13; } }
    this.dir = sd; if (d != null) fire(ARROWS[d], d);
  }

  // ---- menu layers: a cursor over the visible option elements (duty board, option menus, radio / comms panels)
  targets() {
    if (typeof document === 'undefined') return [];
    const out = []; for (const L of document.querySelectorAll('.ui-layer')) { if (!L.getClientRects().length) continue; for (const e of L.querySelectorAll('.o:not(.off), .act:not(.off), [data-do]:not(.off), button:not([disabled]), [data-i]:not(.off)')) if (e.getClientRects().length && !out.includes(e)) out.push(e); }
    const pop = out.filter(e => e.closest('.dp-pop')); return pop.length ? pop : out;
  }
  layer({ down, lx, ly, dt }) {
    const T = this.targets(); if (this.cur >= T.length) this.cur = Math.max(0, T.length - 1);
    this.dirNav(lx, ly, down, (code, d) => { if (!T.length) return; this.cur = (this.cur + (d === 1 || d === 3 ? 1 : -1) + T.length) % T.length; }, dt);
    this.clearSel(); const el = T[this.cur]; if (el) { el.classList.add('padsel'); el.scrollIntoView?.({ block: 'nearest' }); }
    if (down(0) && el) for (const t of ['mousedown', 'mouseup', 'click']) el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, button: 0 }));
    // B (back / Esc) is menus.js gamepad(); X taps Enter for layers that read it
    if (down(2)) this.tap('Enter');
  }

  // ---- the big map (js/nav-hud.js owns the keys while it is open)
  map({ down, lx, ly, dt }) {
    this.dirNav(lx, ly, down, (code) => { if (code === 'ArrowUp' || code === 'ArrowDown') this.tap(code); }, dt);
    if (down(0)) this.tap('Enter'); if (down(2)) this.tap('KeyF'); if (down(3)) this.tap('KeyL'); if (down(1)) this.tap('Escape');
  }

  // ---- screens: title, loading, pause, perk pick, lift panel, death
  screen({ down }) {
    const G = this.G, ph = G.phase; if (typeof document === 'undefined') return;
    const boot = document.getElementById('boot-go'); if (boot && boot.getClientRects().length && !boot.disabled && (down(0) || down(9))) { boot.click(); return; }
    if (ph === 'title' || ph === 'dead') { if (down(0) || down(9)) this.tap('Enter'); }
    else if (ph === 'paused') { if (down(0) || down(9)) this.c.resume?.(); }
    else if (ph === 'perk') { [2, 3, 5].forEach((b, i) => { if (down(b)) this.tap('Digit' + (i + 1)); }); }
    else if (ph === 'select') { if (down(0)) this.tap('Enter'); if (down(1)) this.tap('Escape'); }
  }

  // ---- on-screen glyph hints (only while a pad is the active device)
  hints(mode) {
    if (!this.el) return; const G = this.G;
    let items = [];
    const g = (b, label, cls = '') => `<span><b class="${cls}">${b}</b>${label}</span>`;
    if (mode === 'play') items = [g('LS', 'Move'), g('RS', 'Look'), g('A', 'Jump', 'a'), g('B', 'Crouch', 'b'), g('X', 'Use (hold or tap)', 'x'), g('RT', 'Strike'), g('LT', 'Grab'), g('Y', 'Duty', 'y'), g('LB', 'Wheel'), g('↓', 'Map')];
    else if (mode === 'job') items = [g('A', 'Enter', 'a'), g('X', 'Space', 'x'), g('✥', 'Arrows'), g('Y·RB·LB·RT', '1·2·3·4'), g('B', 'Cancel', 'b')];
    else if (mode === 'layer') items = [g('✥', 'Move'), g('A', 'Choose', 'a'), g('B', 'Back', 'b')];
    else if (mode === 'map') items = [g('↑↓', 'Deck'), g('A', 'Pin room', 'a'), g('X', 'Find', 'x'), g('Y', 'Lift', 'y'), g('B', 'Close', 'b')];
    else if (mode === 'wheel') items = [g('RS', 'Pick'), g('A', 'Confirm', 'a'), g('B', 'Cancel', 'b')];
    else if (mode === 'screen') items = [g('A', 'Confirm', 'a'), G.phase === 'perk' ? g('X·Y·RB', '1·2·3') : '', G.phase === 'select' ? g('B', 'Close', 'b') : ''];
    const sig = this.active + mode + G.phase; const html = items.join('');
    if (sig !== this.sig || html !== this._html) { this.sig = sig; this._html = html; this.el.innerHTML = html; this.el.classList.toggle('on', this.active && !!html); }
    if (mode === 'job' && this.active && (this._ann -= 1) <= 0) { this._ann = 6; this.annotate(); }
  }
  /** glyph on each job-game on-screen button (their data-k is the key code the button sends) */
  annotate() {
    const el = typeof document !== 'undefined' && document.getElementById('jobgame'); if (!el) return;
    const map = { Enter: ['A', 'a'], NumpadEnter: ['A', 'a'], Space: ['X', 'x'], ArrowUp: ['↑', ''], ArrowDown: ['↓', ''], ArrowLeft: ['←', ''], ArrowRight: ['→', ''] };
    DIG_ORDER.forEach((b, i) => { map['Digit' + (i + 1)] = [GLYPH[b], b === 3 ? 'y' : '']; });
    for (const b of el.querySelectorAll('[data-k]')) { if (b.querySelector('.pgl')) continue; const m = map[b.dataset.k]; if (m) b.insertAdjacentHTML('beforeend', `<i class="pgl ${m[1]}">${m[0]}</i>`); }
  }
}
