// Systems Nominal input + menus glue (docs/ui.md): the one key router for menus, the quick wheel (hold Q / J / H / V,
// LB on a pad), belt quick-slots on digits, P / Start script pause, the "Click to resume" chip, crew name tags, live
// portraits and icon toasts. main.js creates it once and calls frame(dt) every animation frame; everything else is here.
//
// Key scheme (Nominal; ?mode=madness is untouched: Q stays the grapple there):
//   Q   hold = main wheel (8 sectors, release = choose; flick + release over a sector = its default), tap = pinned wheel
//   J   tap = duty board, hold = duty wheel     H   tap = contact cards, hold = radio wheel     V   tap = cycle handheld, hold = tools wheel
//   K   alert card     L   comm log     P / pad Start = pause     1-9 = belt slot (only when no menu / wheel / lift panel)
//   Esc / Backspace = back exactly one layer (never the pause screen while a layer is open)
// Every menu / wheel / panel pauses the whole world: G.menuPause = UI.frozen (|| the nav agent's big map) and step() returns early.
import { createUIMode, mountUIMode, UIHUB } from './ui-mode.js';
import { WheelView, newWheel, moveTo, pickItem, digitPick, stepSel, clampCursor, defaultKid } from './wheel.js';
import { Portraits } from './portraits.js';
import { NameTags } from './nametags.js';
import { toastOf, toastHTML, TOAST_CSS } from './toasts.js';
import { iconSvg, deptCol } from './icons.js';

export const HOLD_MS = 220;
const HOLD_KEYS = { KeyQ: 'main', KeyJ: 'duty', KeyH: 'radio', KeyV: 'tools' };
const HH_ICON = (id) => /^tricorder/.test(id) ? 'tricorder' : /^phaser/.test(id) ? 'phaser' : ({ commbadge: 'badge', padd: 'padd', hypospray: 'hypo', dermal: 'hypo', scalpel: 'lab', hydrospanner: 'spanner', spanner: 'spanner', plasma_torch: 'fire', toolbag: 'tools', flashlight: 'torch', extinguisher: 'fire', mop: 'clean', cargo_hook: 'grab', crowbar: 'workshop' })[id] || 'tools';
const BELT_CSS = `body.nominal #grap{display:none}
#ui-belt{position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:5;display:none;gap:4px;pointer-events:none;font:700 9px var(--f-m,monospace)}
#ui-belt.on{display:flex}#ui-belt span{position:relative;width:30px;height:30px;display:grid;place-items:center;background:rgba(5,8,14,.62);border:1px solid rgba(150,180,210,.28);color:#cfe0f0}
#ui-belt span.in{border-color:var(--lc1,#f2a03d);background:rgba(242,160,61,.22);color:#fff}#ui-belt span.br{opacity:.45}#ui-belt .ico{width:18px;height:18px;fill:none}#ui-belt b{position:absolute;left:2px;top:0;color:#ffd9a0;font-size:8px}`;

export class Menus {
  /** ctx: { G, P, NOM, camera, renderer, canvas, world (getter), ents (getter), isLocked, requestLock, resumeGame, pause, interact, talkMenu, terminalMenu, dutyMenu, showStatus } */
  constructor(ctx) {
    this.c = ctx; const G = ctx.G; this.hold = null; this.pad = { prev: [], held: null }; this.t = 0;
    this.UI = createUIMode({ isLocked: () => ctx.isLocked(), exitLock: () => document.exitPointerLock?.(), requestLock: () => this.lock(), onChange: () => this.sync() });
    this.portraits = new Portraits({ renderer: ctx.renderer, size: 128 });
    UIHUB.ui = this.UI; UIHUB.portraits = this.portraits; UIHUB.menus = this; G.ui = this.UI; G.portraits = this.portraits; G.menus = this;
    this.view = new WheelView({ onPick: (it) => this.commit(it), portrait: (p) => this.portraits.get(p) });
    this.tags = new NameTags({ max: 6 });
    this.chip = mountUIMode(this.UI, { onResumeClick: () => { this.UI.needClick = false; ctx.requestLock(); this.sync(); } });
    if (typeof document !== 'undefined') {
      const st = document.createElement('style'); st.textContent = TOAST_CSS + BELT_CSS; document.head.appendChild(st);
      this.belt = document.createElement('div'); this.belt.id = 'ui-belt'; document.body.appendChild(this.belt);
      addEventListener('keydown', (e) => this.keydown(e), true); addEventListener('keyup', (e) => this.keyup(e), true);
      document.addEventListener('pointerlockerror', () => this.UI.onLockError());
    }
    // toasts: icon + 3-5 words in Systems Nominal; the old text toast stays for ?mode=madness
    const oldSay = G.say; G.sayLog = []; let timer = 0;
    G.say = (msg, cls = '', o) => {
      if (!ctx.NOM()) return oldSay(msg, cls); const t = toastOf(msg, cls, o), el = document.getElementById('toast'); G.sayLog.push({ t: G.time, msg: String(msg), cls }); if (G.sayLog.length > 80) G.sayLog.shift();
      if (!el) return; el.innerHTML = toastHTML(t); el.className = 'hud ' + cls; el.style.opacity = 1; clearTimeout(timer); timer = setTimeout(() => el.style.opacity = 0, 3200);
    };
  }
  get G() { return this.c.G; }
  get D() { return this.G.duty; }
  get comms() { return this.G.comms?.hud || null; }
  say(t, c = '') { this.G.say(t, c); }
  lock() { this.c.G.sound?.init?.(); try { return this.c.canvas.requestPointerLock?.(); } catch (e) { return Promise.reject(e); } }
  active() { return this.c.NOM() && this.G.phase === 'play'; }
  sync() {
    const UI = this.UI, G = this.G;
    if (!UI.wheel && this.view.W) this.view.hide();
    G.menuPause = UI.frozen || !!G.nav?.mapOpen;
    this.chip(G.phase);
  }

  // ---------------------------------------------------------------- keyboard router (window capture: before main.js)
  keydown(e) {
    const G = this.G, UI = this.UI, code = e.code;
    if (!this.c.NOM()) return;
    if (G.phase === 'paused' && G.scriptPaused && (code === 'Escape' || code === 'KeyP') && !e.repeat) { e.preventDefault(); e.stopImmediatePropagation(); G.scriptPaused = false; this.c.resumeGame(); return; }
    if (G.phase !== 'play') return;
    if (G.nav?.mapOpen) return;   // the big map owns the keys while open (js/nav-hud.js)
    const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (code === 'F3' || code === 'F4') return;
    // ---- a wheel is up
    if (UI.wheel) {
      stop(); if (e.repeat) return; const W = this.view.W; if (!W) return;
      const d = /^(?:Digit|Numpad)(\d)$/.exec(code);
      if (code === 'Escape' || code === 'Backspace') { this.cancelHold(); UI.escape(); this.sync(); }
      else if (d) { const it = digitPick(W, +d[1]); if (it) this.commit(it); else this.view.render(); }
      else if (code === 'ArrowRight' || code === 'ArrowDown') { stepSel(W, 1); this.view.render(); }
      else if (code === 'ArrowLeft' || code === 'ArrowUp') { stepSel(W, -1); this.view.render(); }
      else if (code === 'Enter' || code === 'Space') this.commit(pickItem(W) || 'off');
      else if (code === 'KeyQ' && W.pinned) { UI.escape(); }
      return;
    }
    // ---- a menu / panel layer is up: Esc / Backspace pop one; the panel keys toggle; everything else goes to the top layer or nowhere
    if (UI.stack.length) {
      stop(); if (e.repeat) return; const top = UI.top();
      if (code === 'Escape') { UI.escape(); return; }
      if (code === 'Backspace') { UI.back(); return; }
      if (top.toggle && top.toggle === code) { UI.close(top.kind); return; }
      if (code === 'KeyJ') { this.G.hud2?.toggleBoard(); return; }
      if (code === 'KeyH' || code === 'KeyK' || code === 'KeyL') { this.comms?.openPanel({ KeyH: 'radio', KeyK: 'details', KeyL: 'log' }[code]); return; }
      if (code === 'KeyQ') { this.openWheel('main', false); return; }
      if (code === 'KeyP') { this.scriptPause(); return; }
      top.key?.(e); return;
    }
    // ---- plain play
    if (e.repeat) { if (HOLD_KEYS[code] && this.hold) stop(); return; }
    if (HOLD_KEYS[code] && !(code === 'KeyV' && e.shiftKey) && !e.ctrlKey && !e.metaKey && !e.altKey) { stop(); this.startHold(code); return; }
    if (code === 'KeyK' || code === 'KeyL') { stop(); this.comms?.openPanel(code === 'KeyK' ? 'details' : 'log'); return; }
    if (code === 'KeyP') { stop(); this.scriptPause(); return; }
    if (code === 'KeyB') { stop(); this.G.hud2?.cycleHud(); return; }
    const d = /^(?:Digit|Numpad)([1-9])$/.exec(code); if (d) { stop(); this.quickSlot(+d[1]); return; }
  }
  keyup(e) {
    if (!this.hold || e.code !== this.hold.code) return; e.preventDefault(); e.stopImmediatePropagation();
    const h = this.hold; this.hold = null; clearTimeout(h.timer);
    if (h.opened) { const W = this.view.W; if (W?.held) { if (!W.moved && performance.now() - h.t0 < HOLD_MS + 60) this.pin(); else this.commit(pickItem(W) || (W.sel >= 0 ? 'off' : null)); } }
    else this.tap(h.kind);
  }
  startHold(code) { const kind = HOLD_KEYS[code]; this.cancelHold(); const h = this.hold = { code, kind, t0: performance.now(), opened: false }; h.timer = setTimeout(() => this.holdTimeout(), HOLD_MS); }
  holdTimeout() { const h = this.hold; if (!h || h.opened || !this.active()) return; h.opened = true; this.openWheel(h.kind, true); }
  cancelHold() { if (this.hold) clearTimeout(this.hold.timer); this.hold = null; }
  tap(kind) {
    if (!this.active()) return;
    if (kind === 'main') this.openWheel('main', false);
    else if (kind === 'duty') this.G.hud2?.toggleBoard();
    else if (kind === 'radio') this.comms?.openPanel('radio');
    else if (kind === 'tools') this.G.kit?.cycle();
  }
  scriptPause() { const G = this.G; this.cancelHold(); this.UI.scriptPause(); G.scriptPaused = true; this.c.pause(); this.sync(); }

  // ---------------------------------------------------------------- wheel
  openWheel(kind = 'main', held = true) {
    if (!this.active() && !this.UI.stack.length) return null;
    const S = this.sectors(); let sectors = S, title = 'Quick wheel', direct = false;
    if (kind !== 'main') { const s = S.find(x => x.id === kind); sectors = (s?.kids || []).slice(0, 8); title = s?.label || kind; direct = true; if (!sectors.length) sectors = [{ id: 'none', icon: 'x', label: 'Nothing', off: true }]; }
    const W = newWheel(sectors, { held, direct, title, kind, t0: performance.now() });
    if (held && !this.UI.stack.length) this.UI.holdWheel(W); else { this.UI.wheel = W; this.UI.pinWheel(W); }
    Object.assign(W, this.UI.wheel); this.UI.wheel = W; this.view.show(W); this.sync(); return W;
  }
  pin() { const W = this.view.W; if (!W) return; W.held = false; W.pinned = true; W.sel = -1; W.sub = -1; this.UI.pinWheel(W); this.view.render(); this.sync(); }
  /** run a wheel choice (null = cancel, 'off' = unavailable) and close the wheel */
  commit(it) {
    const W = this.view.W; if (!W) return;
    if (it === 'off') { const P = W.sectors[W.sel]; this.say(P?.why || 'Unavailable right now', 'warn'); }
    this.view.hide();
    if (it && it !== 'off') { try { it.run?.(); } catch (er) { console.warn('wheel action failed', er); } }
    this.UI.endWheel(); this.sync();
  }
  /** mouse: under pointer lock the deltas steer a held wheel; returns true when consumed (main.js mousemove) */
  mouse(e) {
    const W = this.view.W; if (!W) return !!this.UI.frozen;
    if (W.held) { if (this.c.isLocked()) { const [x, y] = clampCursor(W.vx + e.movementX * 1.4, W.vy + e.movementY * 1.4); if (moveTo(W, x, y)) this.view.render(); else this.view.render(); } else { const [x, y] = this.view.toView(e.clientX, e.clientY); if (moveTo(W, ...clampCursor(x, y))) this.view.render(); } }
    return true;
  }

  // ---------------------------------------------------------------- what the reticle is on ("This" sector)
  focus() {
    const { P, G } = this.c, world = this.c.world, ents = this.c.ents || [], fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    const front = (x, z, r, dot) => { const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz); return d < r && (dx * fx + dz * fz) / (d || 1) > dot ? d : null; };
    let best = null, bd = 9; for (const e of ents) { if (e.kind !== 'crew' || !e.person || e.fake || !e.mesh) continue; const d = front(e.x, e.z, 2.6, 0.55); if (d != null && d < bd) { bd = d; best = e; } }
    if (best) return { type: 'crew', name: best.person.short, e: best, icon: 'person' };
    const hp = G.haul?.prompt?.() || ''; if (/cart/i.test(hp)) return { type: 'cart', name: 'Cart', icon: 'cart' };
    if (world?.raycast && this.c.camera) { const o = this.c.camera.position, dir = this.c.camera.getWorldDirection(o.clone()), h = world.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, 3.0); const pr = h && h.kind === 'prop' ? world.d.props.find(p => p.tx === h.tx && p.ty === h.ty) : null; if (pr && (pr.kind === 'console' || pr.kind === 'servers')) return { type: 'console', name: 'Terminal', icon: 'console' }; }
    let cl = null, cd = 9; for (const c of world?.clutter || []) { const d = front(c.x, c.z, 2.0, 0.8); if (d != null && d < cd) { cd = d; cl = c; } } if (cl) return { type: 'item', name: cl.name, icon: 'box', c: cl };
    return null;
  }
  /** open a legacy list menu and run one of its options by label (keeps the old menus reachable from the wheel) */
  runOpt(open, re) {
    const H = this.G.hud2; if (!H) return false; open(); const m = H.menuStack[H.menuStack.length - 1]; if (!m) return false;
    const i = m.opts.findIndex(o => re.test(o.label)); if (i < 0) return false; const o = m.opts[i]; if (o.off) { H.closeMenu(); return false; }
    if (o.keepOpen) { o.run?.(); return true; } H.closeMenu(); o.run?.(); return true;
  }
  press(code) { for (const t of ['keydown', 'keyup']) dispatchEvent(new KeyboardEvent(t, { code })); }
  /** the 8 fixed sectors: This, Duty, Order, Radio, Inspect/Map, Tools, Carry, System (ids stable for tests and remapping) */
  sectors() {
    const G = this.G, D = this.D, c = this.c, f = this.focus(), carry = G.carry, K = G.kit, sim = this.comms?.sim, H = G.hud2;
    const it = (id, icon, label, desc, run, o = {}) => ({ id, icon, label, desc, run, ...o });
    let ctx = [];
    if (f?.type === 'crew') {
      const e = f.e, talk = () => c.talkMenu(e), mine = D?.subs().includes(e.person);
      ctx = [it('p.greet', 'greet', 'Greet', 'Say hello', () => this.runOpt(talk, /^Greet/), { def: true }), it('p.doing', 'ask', 'What now?', 'Ask what they are doing', () => this.runOpt(talk, /doing/)), it('p.duty', 'duty', 'Their duty', 'Ask about their duty', () => this.runOpt(talk, /their duty/)),
        mine ? it('p.order', 'order', 'Order', 'Order them to do their duty', () => this.runOpt(talk, /^Order/)) : it('p.help', 'delegate', 'Ask help', 'Ask for a hand with your duty', () => this.runOpt(talk, /hand with/)),
        it('p.give', 'give', 'Give item', carry ? `Hand over ${carry.name}` : 'Hands empty', () => this.runOpt(talk, /^(Give|Offer|Treat)/), { off: !carry, why: 'Hands empty' }), it('p.hail', 'hail', 'Hail', 'Call them on the badge', () => this.hail(e.person)), it('p.talk', 'list', 'Talk…', 'All conversation options', talk)];
    } else if (f?.type === 'console') {
      const tm = () => c.terminalMenu();
      ctx = [it('c.use', 'console', 'Use terminal', 'Open the ship terminal', tm, { def: true }), it('c.status', 'ship', 'Ship status', 'Systems that are not nominal', () => this.runOpt(tm, /^Ship status/)), it('c.mission', 'mission', 'Mission', 'Crew tasks on track', () => this.runOpt(tm, /^Mission/)), it('c.locate', 'locate', 'Locate crew', 'Where is everyone?', () => this.runOpt(tm, /^Locate/)), it('c.alerts', 'alert', 'Alert log', 'Active alerts', () => this.runOpt(tm, /^Alert/))];
    } else if (f?.type === 'cart') {
      ctx = [it('k.grab', 'grab', 'Grab cart', 'Hold and push the cart', () => G.haul?.interact(), { def: true }), it('k.take', 'box', 'Take item', 'Take an item from the cart', () => G.haul?.takeFromCart()), it('k.put', 'give', 'Put on cart', 'Put what you carry on it', () => G.haul?.putDown(), { off: !carry, why: 'Hands empty' })];
    } else if (f?.type === 'item') {
      ctx = [it('i.take', 'hand', 'Take', `Pick up ${f.name}`, () => c.interact(), { def: true, off: !!carry, why: 'Hands full' }), it('i.look', 'inspect', 'Inspect', 'What is it?', () => this.say(`${f.name}${f.c?.real && f.c.real !== f.name ? ' — ' + f.c.real : ''}`, 'comp'))];
    }
    const subs = D?.subs().slice(0, 6) || [];
    const due = D?.loops.find(l => l.state === 'due' && l.room === D.place.room);
    const belt = (K?.belt || []).map((x, i) => it('t.' + i, HH_ICON(x.id), x.name || x.id, `Slot ${i + 1}${K.hand === i ? ' · in hand' : ''}`, () => this.quickSlot(i + 1, true), { def: K.hand === i }));
    return [
      { id: 'this', icon: f?.icon || 'eye', label: 'This', sub: f ? f.name : 'nothing in view', ctx: true, off: !f, why: 'Nothing in view', kids: ctx },
      { id: 'duty', icon: 'duty', label: 'Duty', sub: 'do · delegate · report', off: !D, kids: [
        it('duty.do', 'do', 'Do duty', due ? due.label : 'Do a due round here', () => due ? this.runOpt(() => c.dutyMenu(), /^Do a duty/) && this.runOpt(() => { }, new RegExp('^' + due.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))) : H?.openBoard(), { def: true }),
        it('duty.deleg', 'delegate', 'Delegate', 'Hand a due round to a subordinate', () => this.runOpt(() => c.dutyMenu(), /^Delegate/), { off: !subs.length, why: 'No one reports to you' }),
        it('duty.rep', 'report', 'Report', 'Report a finished round', () => this.runOpt(() => c.dutyMenu(), /^Report/)),
        it('duty.board', 'clock', 'Board', 'The full duty board (tap J)', () => H?.openBoard())] },
      { id: 'order', icon: 'order', label: 'Order', sub: 'your reports', off: !subs.length, why: 'No one reports to you', kids: [...subs.map((p, i) => it('order.' + p.id, 'person', p.family || p.short, `Order ${p.short} to do their duty`, () => { const r = D.order(p, null); if (!r.ok && !r.refused) this.say(r.why, 'warn'); }, { person: p, col: deptCol(p), def: i === 0 })), it('order.more', 'heads', 'More…', 'Contact cards: my reports', () => this.openCards('mine'))] },
      { id: 'radio', icon: 'radio', label: 'Radio', sub: 'bridge · dept heads', off: !sim, kids: [
        it('r.bridge', 'command', 'Bridge', 'Hail the bridge', () => sim.playerChoose('bridge'), { def: true }), it('r.heads', 'heads', 'Dept heads', 'Pick a department head', () => { this.comms?.openPanel('radio'); if (this.comms) { this.comms.menu = 'dept'; this.comms.renderRadio(); } }),
        it('r.status', 'check', 'Status', 'Report status', () => sim.playerChoose('status')), it('r.assist', 'delegate', 'Assistance', 'Request assistance', () => sim.playerChoose('assist')),
        it('r.fault', 'alert', 'Fault', 'Report a fault', () => sim.playerChoose('fault')), it('r.orders', 'order', 'Orders?', 'Ask for orders', () => sim.playerChoose('orders')), it('r.cards', 'badge', 'Contacts', 'Everyone (tap H)', () => this.openCards('all'))] },
      { id: 'map', icon: 'map', label: 'Inspect', sub: 'map · status · alerts', kids: [
        it('n.map', 'map', 'Deck map', 'Where am I? (M)', () => G.nav?.toggleMap ? G.nav.toggleMap(true) : this.press('KeyM'), { def: true }), it('n.ship', 'ship', 'Ship status', 'Systems schematic (hold Tab)', () => this.openStatus()),
        it('n.alerts', 'alert', 'Alerts', 'Alert card (K)', () => this.comms?.openPanel('details')), it('n.log', 'log', 'Comm log', 'Who said what (L)', () => this.comms?.openPanel('log'))] },
      { id: 'tools', icon: 'tools', label: 'Tools', sub: 'handhelds', off: !K, kids: [...belt, it('t.none', 'empty', 'Empty hands', 'Holster / put away', () => { if (K) { K.hand = -1; this.say('Hands empty.'); } }, { def: !K || K.hand < 0 })] },
      { id: 'carry', icon: 'grab', label: 'Carry', sub: carry ? carry.name : 'hands empty', off: !carry, why: 'Hands empty', kids: carry ? [it('y.put', 'putdown', 'Put down', 'Put it down (G)', () => this.press('KeyG'), { def: true }), it('y.hand', 'give', 'Hand over', 'Give it to who you look at', () => f?.type === 'crew' ? this.runOpt(() => c.talkMenu(f.e), /^(Give|Offer|Treat)/) : this.say('No one to hand it to.', 'warn'), { off: f?.type !== 'crew', why: 'Look at someone' }), it('y.look', 'inspect', 'Inspect', 'Look at it', () => this.say(carry.name + (carry.real ? ' — ' + carry.real : ''), 'comp'))] : [] },
      { id: 'sys', icon: 'gear', label: 'System', sub: 'pause · settings', kids: [it('s.pause', 'pause', 'Pause', 'Pause (P)', () => this.scriptPause(), { def: true }), it('s.keys', 'gear', 'Settings', 'Sensitivity, volume, graphics', () => this.scriptPause()), it('s.help', 'help', 'Help', 'Keys at a glance', () => this.say('Hold Q wheel · J board · H radio · V tools · 1-9 belt', 'comp', { icon: 'keyboard', short: 'Q wheel · J duty · H radio' }))] },
    ];
  }
  openCards(filter) { const C = this.comms; if (!C) return; C.cardFilter = filter; C.openPanel('radio'); if (C.panel !== 'radio') C.openPanel('radio'); }
  openStatus() { this.c.showStatus?.(true); this.UI.open('status', { close: () => this.c.showStatus?.(false), toggle: 'Tab' }); }
  hail(p) { return this.comms?.hail(p); }
  locate(p) { const N = this.G.nav; if (N?.setPin) try { const w = this.G.sim?.where(p); if (w?.deckNo) N.setPin({ kind: 'person', id: 'p' + p.id, label: p.short, icon: 'person', person: p, deck: w.deckNo - 1, room: w.room }); } catch { } }
  alertTop() { const A = this.G.comms?.alerts, a = A?.top?.(); return a ? { label: a.def.label, colour: a.def.colour, elapsed: A.elapsed(a) } : null; }
  /** distance to a crew member: { deck: decks apart, m: metres when on this deck } or null */
  distTo(p) {
    const w = this.G.sim?.where?.(p); if (!w || w.deckNo == null) return null; const deck = Math.abs(w.deckNo - ((this.G.shipDeck ?? 0) + 1));
    if (deck) return { deck, m: null }; const e = (this.c.ents || []).find(x => x.person === p); const P = this.c.P; return { deck: 0, m: e ? Math.hypot(e.x - P.x, e.z - P.z) : 30 };
  }

  // ---------------------------------------------------------------- belt quick-slots (digits in plain play)
  quickSlot(n, viaWheel = false) {
    const K = this.G.kit; if (!K) return false; const i = n - 1; if (i < 0 || i >= K.belt.length) { if (!viaWheel) this.say(`Belt slot ${n} is empty`, '', { icon: 'empty', short: `Slot ${n} empty` }); return false; }
    K.hand = K.hand === i && !viaWheel ? -1 : i; const it = K.inst; this.say(it ? `In hand: ${it.name || it.id}` : 'Hands empty.'); this.renderBelt(true); return true;
  }
  renderBelt(force = false) {
    const K = this.G.kit, el = this.belt; if (!el) return; const on = !!K && this.c.NOM() && this.G.phase === 'play' && K.belt.length > 0;
    const sig = on ? K.hand + ':' + K.belt.map(x => x.id + (x.dur <= 0 ? 'x' : '')).join(',') : ''; if (!force && sig === this._beltSig) return; this._beltSig = sig;
    el.classList.toggle('on', on); if (!on) return;
    el.innerHTML = K.belt.map((x, i) => `<span class="${K.hand === i ? 'in' : ''}${x.dur <= 0 ? ' br' : ''}" title="${x.name || x.id}"><b>${i + 1}</b>${iconSvg(HH_ICON(x.id))}</span>`).join('');
  }

  // ---------------------------------------------------------------- gamepad (Gamepad API; polled from frame)
  gamepad() {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []; const gp = pads[0]; if (!gp) return;
    const b = gp.buttons.map(x => x.pressed), pv = this.pad.prev, down = (i) => b[i] && !pv[i], up = (i) => !b[i] && pv[i]; this.pad.prev = b; const UI = this.UI;
    if (down(9)) { if (this.G.phase === 'paused' && this.G.scriptPaused) { this.G.scriptPaused = false; this.c.resumeGame(); } else if (this.G.phase === 'play') this.scriptPause(); return; }
    if (this.G.phase !== 'play') return;
    for (const [btn, kind] of [[4, 'main'], [3, 'duty'], [5, 'tools']]) {
      if (down(btn) && !UI.frozen) this.pad.held = { btn, kind, t0: performance.now(), opened: false };
      const h = this.pad.held; if (h && h.btn === btn) {
        if (b[btn] && !h.opened && performance.now() - h.t0 > HOLD_MS) { h.opened = true; this.openWheel(kind, true); }
        if (up(btn)) { this.pad.held = null; if (h.opened) this.commit(pickItem(this.view.W || {}) || null); else this.tap(kind); }
      }
    }
    const W = this.view.W;
    if (W) { const ax = gp.axes[2] || 0, ay = gp.axes[3] || 0; if (Math.hypot(ax, ay) > 0.45) { moveTo(W, ax * 200, ay * 200); this.view.render(); }
      if (down(15) || down(13)) { stepSel(W, 1); this.view.render(); } if (down(14) || down(12)) { stepSel(W, -1); this.view.render(); }
      if (down(0) && W.pinned) this.commit(pickItem(W) || 'off'); if (down(1)) { UI.escape(); this.sync(); } return; }
    if (down(1) && UI.stack.length) UI.escape();
    if (down(12) && !UI.frozen) this.comms?.openPanel('radio');
    if (down(8)) { if (UI.has('status')) UI.close('status'); else if (!UI.frozen) this.openStatus(); }
  }

  // ---------------------------------------------------------------- per animation frame (runs while the world is paused)
  frame(dt) {
    const G = this.G; if (!this.c.NOM()) return; this.t += dt;
    if (G.phase !== 'play' && this.UI.frozen && G.phase !== 'paused') { this.view.hide(); this.UI.stack.length = 0; this.UI.wheel = null; }   // lift / death / end: no layers survive
    this.sync(); this.gamepad();
    if (this.hold && !this.hold.opened && performance.now() - this.hold.t0 > HOLD_MS) this.holdTimeout();
    this.portraits.tick(this.UI.frozen ? 3 : 1);
    this.tags.update(dt, { camera: this.c.camera, ents: this.c.ents || [], P: this.c.P, world: this.c.world, show: G.phase === 'play' && !this.UI.frozen && !G.nav?.mapOpen });
    if (G.menuPause) G.hud2?.update(dt);   // the board keeps redrawing while the world holds still
    if ((this._bt = (this._bt || 0) - dt) <= 0) { this._bt = 0.2; this.renderBelt(); }
    if (this.view.W?.held) this.view.render();
  }
}
export { defaultKid };
