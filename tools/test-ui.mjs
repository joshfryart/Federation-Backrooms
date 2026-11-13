// Node unit tests: UI layer stack / pointer-lock rules (js/ui-mode.js), wheel geometry + selection (js/wheel.js),
// toast mapping (js/toasts.js), icon set (js/icons.js).  node tools/test-ui.mjs
// The browser half (Esc closes a layer without pausing, wheel opens/selects, portraits, digits) is uiBrowser(page, fail).
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

export async function uiTests(fail) {
  const { createUIMode } = await imp('js/ui-mode.js'), Wh = await imp('js/wheel.js'), T = await imp('js/toasts.js'), I = await imp('js/icons.js');
  const ck = (c, m) => { if (!c) fail('ui: ' + m); return !!c; };
  // ---- fake pointer lock: exitLock unlocks and the page later hears the event; requestLock may be refused
  const mk = (refuse = false) => { const s = { locked: true, exits: 0, reqs: 0 }; const UI = createUIMode({ isLocked: () => s.locked, exitLock: () => { s.exits++; s.locked = false; }, requestLock: () => { s.reqs++; if (refuse) return Promise.reject(new Error('cooldown')); s.locked = true; return Promise.resolve(); } }); return { s, UI }; };
  { const { s, UI } = mk(); let closed = 0;
    UI.open('board', { close: () => closed++ }); ck(s.exits === 1 && UI.expectUnlock && UI.frozen && UI.mode === 'menu', 'open releases the lock once and marks it expected');
    ck(UI.onLockChange(false, 'play') === 'ignore' && !UI.expectUnlock, 'our own unlock is not a pause');
    UI.open('menu', { back: () => false }); ck(s.exits === 1 && UI.stack.length === 2, 'second layer stacks without another unlock');
    ck(UI.onLockChange(false, 'play') === 'ignore', 'unlock event with layers open never pauses');
    ck(UI.escape() === 'menu' && UI.stack.length === 1 && UI.frozen && s.reqs === 0, 'Esc pops exactly one layer');
    ck(UI.escape() === 'board' && closed === 1 && !UI.frozen && s.reqs === 1 && s.locked, 'last Esc closes, relocks');
    ck(UI.escape() === 'none' && s.reqs === 1, 'Esc with nothing open does nothing (the browser owns plain-play Esc)');
    ck(UI.onLockChange(false, 'play') === 'pause', 'a genuine native unlock in plain play pauses');
    ck(UI.onLockChange(false, 'select') === 'ignore', 'other phases (lift panel) ignore unlocks'); }
  { const { s, UI } = mk(); let lvl = 2; UI.open('menu', { back: () => --lvl > 0 });
    ck(UI.back() === 'back' && UI.stack.length === 1, 'Backspace goes back one level inside a layer'); UI.back(); ck(!UI.frozen && s.reqs === 1, 'last level closes the layer');
    UI.open('x'); ck(UI.closed('x') && !UI.frozen && s.reqs === 2, 'component self-close drops the layer and relocks'); ck(!UI.closed('x'), 'closed() is idempotent'); }
  { const { s, UI } = mk(true); UI.open('board'); UI.escape(); await new Promise(r => setTimeout(r, 0));
    ck(UI.needClick && UI.mode === 'resume' && !UI.frozen, 'refused relock shows "Click to resume", not the pause screen');
    ck(UI.onLockChange(true, 'play') === 'locked' && !UI.needClick, 'any later lock clears the chip'); }
  { const { s, UI } = mk(); UI.holdWheel({}); ck(UI.frozen && UI.mode === 'wheel' && s.exits === 0 && s.locked, 'held wheel keeps the lock (mouse deltas steer it) and freezes the world');
    ck(UI.onLockChange(false, 'play') === 'cancel-wheel' && !UI.wheel && UI.needClick, 'native Esc under a held wheel cancels it + click chip, no pause');
    s.locked = true; UI.needClick = false; UI.holdWheel({}); UI.pinWheel(); ck(UI.wheel.pinned && UI.has('wheel') && s.exits === 1, 'tap pins the wheel as a free-cursor layer');
    UI.open('board'); UI.endWheel(); ck(UI.frozen && s.reqs === 0, 'a wheel choice that opens a panel does not relock');
    UI.escape(); ck(!UI.frozen && s.reqs === 1, 'closing that panel relocks');
    UI.holdWheel({}); ck(UI.escape() === 'wheel' && !UI.frozen, 'Esc (if the page hears it) cancels a held wheel'); }
  { const { s, UI } = mk(); UI.open('a', { close() { } }); UI.open('b'); UI.scriptPause(); ck(!UI.frozen && UI.expectUnlock === false && s.exits >= 1, 'P / Start closes layers; its unlock is expected');
    s.locked = true; UI.scriptPause(); ck(UI.expectUnlock && UI.onLockChange(false, 'paused') === 'ignore', 'script pause unlock does not double-pause'); }
  { const { UI } = mk(); UI.open('a'); UI.open('b'); UI.open('a'); ck(UI.top().kind === 'a' && UI.stack.length === 2, 're-opening a layer brings it to the front'); UI.closeAll(); ck(!UI.frozen, 'closeAll'); }

  // ---- wheel geometry
  const S = Array.from({ length: 8 }, (_, i) => ({ id: 's' + i, icon: 'dots', label: 'S' + i, kids: i === 6 ? [] : [{ id: i + 'a', label: 'a' }, { id: i + 'b', label: 'b', def: true }, { id: i + 'c', label: 'c', off: true }] }));
  S[2].off = true;
  ck(Wh.sectorAt(0, -100, 8) === 0 && Wh.sectorAt(100, 0, 8) === 2 && Wh.sectorAt(0, 100, 8) === 4 && Wh.sectorAt(-100, 0, 8) === 6 && Wh.sectorAt(71, -71, 8) === 1, 'sector 0 up, clockwise');
  ck(Wh.sectorAt(38, -92, 8) === 0 && Wh.sectorAt(39, -91, 8) === 1, 'sector boundary at 22.5 deg');
  const W = Wh.newWheel(S, { held: true });
  ck(Wh.hitTest(W, 10, 10).sel === -1, 'dead zone = no selection'); Wh.moveTo(W, 0, -100); ck(W.sel === 0 && W.sub === -1, 'inner ring picks sector');
  ck(Wh.pickItem(W).id === '0b', 'release over a sector = its default choice');
  const L = Wh.kidLayout(3, -90); ck(L.span === 102 && Math.abs(L.start + 141) < 1e-9, 'kid layout centred on parent');
  const [kx, ky] = Wh.pol(182, L.start + L.w * 0.5); Wh.moveTo(W, kx, ky); ck(W.sel === 0 && W.sub === 0 && Wh.pickItem(W).id === '0a', 'outer ring picks a choice');
  const [ox, oy] = Wh.pol(182, L.start + L.w * 2.5); Wh.moveTo(W, ox, oy); ck(W.sub === 2 && Wh.pickItem(W) === null, 'disabled choice picks nothing');
  const [fx, fy] = Wh.pol(182, 90); Wh.moveTo(W, fx, fy); ck(W.sel === 0 && W.sub === -1, 'outer ring outside the span keeps the sector');
  Wh.moveTo(W, 100, 0); ck(W.sel === 2 && Wh.pickItem(W) === null, 'disabled sector picks nothing');
  Wh.moveTo(W, 5, 5); ck(W.sel === -1 && Wh.pickItem(W) === null, 'back to the hub = cancel');
  const [cx, cy] = Wh.clampCursor(900, 0); ck(cx === Wh.CUR_MAX && cy === 0, 'virtual cursor clamped');
  ck(/^M[-\d.]+ [-\d.]+A150 150 0 0 1/.test(Wh.ann(62, 150, -112.5, -67.5)), 'annulus path');
  // digits: category then choice; same digit twice = default
  const Wd = Wh.newWheel(S); ck(Wh.digitPick(Wd, 4) === null && Wd.sel === 3, 'first digit opens a category');
  ck(Wh.digitPick(Wd, 1).id === '3a', 'second digit picks the choice');
  Wh.digitPick(Wd, 5); ck(Wh.digitPick(Wd, 5).id === '4b', 'same digit twice = default');
  Wh.digitPick(Wd, 2); ck(Wh.digitPick(Wd, 3) === 'off', 'disabled choice reports off');
  ck(Wh.digitPick(Wd, 7)?.id === 's6', 'leaf category resolves at once');
  const Wdir = Wh.newWheel(S[0].kids, { direct: true }); ck(Wh.digitPick(Wdir, 2).id === '0b' && Wh.digitPick(Wdir, 3) === 'off', 'direct wheel: one digit picks');
  Wh.moveTo(Wdir, 0, -100); ck(Wh.pickItem(Wdir).id === '0a', 'direct wheel: the sector itself is the choice');
  const Ws = Wh.newWheel(S); Wh.stepSel(Ws, 1); Wh.stepSel(Ws, -1); ck(Ws.sel === 7, 'stepping wraps');
  ck(Wh.wheelSVG(W).includes('whub') && (Wh.wheelSVG(Object.assign(Wh.newWheel(S), { sel: 1 })).match(/class="wkid/g) || []).length === 3, 'svg renders hub + outer ring');

  // ---- toasts: icon + 3-5 words
  const t1 = T.toastOf('Duty: Engineering rounds (engineering). [J]', 'comp'); ck(t1.icon === 'duty' && t1.text === 'Due: Engineering rounds', 'duty toast ' + JSON.stringify(t1));
  const t2 = T.toastOf('Ens. Park takes the job: Coolant sweep.', 'comp'); ck(t2.icon === 'delegate' && t2.text.split(' ').length <= 5, 'order toast');
  const t3 = T.toastOf('Lt. Varga: "The core is running warm again, I would not stand there long if I were you."', 'npc'); ck(t3.icon === 'greet' && t3.text.split(' ').length <= 7, 'speech toast short ' + t3.text);
  const t4 = T.toastOf('Something odd happened somewhere on the ship and it is quite long indeed', 'warn'); ck(t4.icon === 'warn' && t4.text.split(' ').length <= 6, 'fallback');
  ck(T.toastOf('x', '', { icon: 'lift', short: 'Lift' }).icon === 'lift', 'explicit icon wins'); ck(T.toastOf('Reactor log: faked.', 'warn').icon === 'fake', 'quality icon');
  for (const [, ic] of T.SAY_RULES) if (ic) ck(I.hasIcon(ic), 'toast icon exists: ' + ic);

  // ---- icons
  const n = Object.keys(I.ICONS).length; ck(n >= 100, 'icon set >= 100 (' + n + ')');
  for (const [k, d] of Object.entries(I.ICONS)) if (!/^M/.test(d.trim()) || /NaN|undefined/.test(d)) ck(false, 'bad icon path ' + k);
  ck(I.iconSvg('map', { title: 'Map' }).includes('aria-label="Map"') && I.iconSvg('nope').includes(I.ICONS.dots), 'iconSvg');
  for (const id of ['this', 'duty', 'order', 'radio', 'map', 'tools', 'carry', 'sys']) void id;
  return { icons: n };
}

// ---- browser: driven through the same code paths the game uses (window keydown/keyup in capture phase, the UI stack; headless has no pointer lock)
export async function uiBrowser(page, fail) {
  const r = await page.evaluate(async () => {
    const g = __game, G = g.G, out = {}; G.forceShip = 0; g.newRun(); g.setQuality('low'); document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); G.phase = 'play'; G.hp = G.maxHp = 1e6;
    let t = 0; const tick = (n) => { for (let i = 0; i < n; i++) { t += 1 / 30; g.step(1 / 30, t); g.menus.frame(1 / 30); } };
    const kd = (code, o = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, ...o })), ku = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
    const key = (code) => { kd(code); ku(code); }, wait = (ms) => new Promise(r => setTimeout(r, ms)), UI = g.ui;
    tick(30);
    // tap J = duty board layer; the world pauses; Esc closes it and never the pause screen
    const t0 = G.duty.t; key('KeyJ'); out.board = { open: document.getElementById('bd-panel').classList.contains('show'), frozen: UI.frozen, pause: G.menuPause, lanes: document.querySelectorAll('#bd-panel .lanes .ln:not(.grp)').length, blocks: document.querySelectorAll('#bd-panel .blk').length };
    tick(30); out.board.dutyHeld = G.duty.t === t0;
    const blk = document.querySelector('#bd-panel .blk'); if (blk) { blk.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); out.board.pop = !!document.querySelector('#bd-panel .dp-pop'); key('Escape'); out.board.popEsc = !document.querySelector('#bd-panel .dp-pop') && UI.frozen; }
    key('Escape'); out.esc = { closed: !document.getElementById('bd-panel').classList.contains('show'), phase: G.phase, frozen: UI.frozen, pauseShown: document.getElementById('pause').classList.contains('show') };
    tick(3); out.esc.runs = G.duty.t > t0;
    // talk menu (legacy list) is a layer: Esc pops one level, then closes; terminal too
    const near = g.sim.onDeck(G.shipDeck + 1)[0]; if (near) { g.talkMenu({ person: near.person }); out.talk = { open: g.hud2.menuOpen, layer: UI.has('menu') }; key('Escape'); out.talk.closed = !g.hud2.menuOpen && !UI.frozen && G.phase === 'play'; }
    g.shipState.repair('computer'); g.terminalMenu(); key('Digit1'); out.term = { depth: g.hud2.menuStack.length }; key('Escape'); out.term.after1 = g.hud2.menuStack.length; key('Escape'); out.term.closed = !g.hud2.menuOpen && !UI.frozen;
    // radio cards: tap H, portraits, Esc
    key('KeyH'); out.radio = { open: g.commsHud.panel === 'radio', cards: document.querySelectorAll('#cm-radio .card').length, imgs: document.querySelectorAll('#cm-radio .card img').length }; key('Escape'); out.radio.closed = !g.commsHud.panel && !UI.frozen;
    // hold Q: held wheel; flick to Radio (sector 4 = index 3, right-down) and release -> bridge hail
    const before = g.comms.log.length; kd('KeyQ'); await wait(320); g.menus.frame(0.016); const W = g.menus.view.W; out.wheel = { open: !!W && W.held, frozen: UI.frozen, sectors: W?.sectors.length, ids: W?.sectors.map(s => s.id).join(',') };
    if (W) { const a = (-90 + 3 * 45) * Math.PI / 180; g.menus.mouse({ movementX: 0, movementY: 0, clientX: 0, clientY: 0 }); const wv = await import('./js/wheel.js'); wv.moveTo(W, Math.cos(a) * 100, Math.sin(a) * 100); out.wheel.sel = W.sel; out.wheel.pick = wv.pickItem(W)?.id; }
    ku('KeyQ'); out.wheel.closed = !g.menus.view.W && !UI.frozen; tick(30 * 6); out.wheel.hailed = g.comms.log.slice(before).some(m => m.from?.id === G.player.id || /Requesting a moment/.test(m.text));
    // tap Q: pinned wheel; digits 8 then 8 = System default (pause) is too disruptive, so 5,4 = comm log
    key('KeyQ'); out.pin = { pinned: !!g.menus.view.W?.pinned, layer: UI.has('wheel') }; key('Digit5'); key('Digit4'); out.pin.log = g.commsHud.panel === 'log'; key('Escape'); out.pin.closed = !UI.frozen && !g.commsHud.panel;
    key('KeyQ'); key('Escape'); out.pin.esc = !UI.frozen && G.phase === 'play';
    // digits in plain play = belt quick-slots
    const K = G.kit; out.belt = { n: K?.belt.length || 0 }; if (K && K.belt.length) { K.hand = -1; key('Digit1'); out.belt.slot1 = K.hand === 0; key('Digit1'); out.belt.empty = K.hand === -1; out.belt.strip = document.querySelectorAll('#ui-belt span').length; }
    // portraits: a live head render, non-empty, cached
    const p = g.roster.people[1], url = g.menus.portraits.renderNow(p); out.portrait = { ok: !!url && url.startsWith('data:image/png') && url.length > 3000, cached: g.menus.portraits.get(p) === url };
    if (url) { const im = new Image(); im.src = url; await im.decode(); const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); x.drawImage(im, 0, 0, 32, 32); const d = x.getImageData(0, 0, 32, 32).data; let v = 0, mn = 255, mx = 0; for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; v += l; mn = Math.min(mn, l); mx = Math.max(mx, l); } out.portrait.mean = Math.round(v / 1024); out.portrait.range = Math.round(mx - mn); }
    // P = script pause; P again resumes
    key('KeyP'); out.p = { phase: G.phase, shown: document.getElementById('pause').classList.contains('show') }; key('KeyP'); out.p.back = G.phase;
    // name tags over crew in view
    const e = g.ents.find(x => x.simmed && x.mesh); if (e) { G.phase = 'play'; g.P.x = e.x; g.P.z = e.z + 2.2; g.P.yaw = 0; g.P.pitch = 0; g.camera.position.set(g.P.x, 1.6, g.P.z); g.camera.rotation.set(0, 0, 0); g.camera.updateMatrixWorld(); g.menus.tags.t = 0; g.menus.frame(0.016); out.tags = { shown: g.menus.tags.shown, text: document.querySelector('.ntag')?.textContent || '' }; }
    // toasts
    G.say('Duty: Engineering rounds (engineering). [J]', 'comp'); out.toast = { icon: !!document.querySelector('#toast .tst svg'), text: document.querySelector('#toast .tst span')?.textContent };
    return out;
  });
  console.log('ui browser:', JSON.stringify(r));
  const ck = (c, m) => { if (!c) fail('ui browser: ' + m); };
  ck(r.board.open && r.board.frozen && r.board.pause && r.board.lanes >= 2 && r.board.blocks > 2 && r.board.dutyHeld, 'J opens the duty board and pauses the world ' + JSON.stringify(r.board));
  ck(r.board.pop === undefined || (r.board.pop && r.board.popEsc), 'block popover + Esc closes only the popover');
  ck(r.esc.closed && r.esc.phase === 'play' && !r.esc.frozen && !r.esc.pauseShown && r.esc.runs, 'Esc closes the layer without pausing ' + JSON.stringify(r.esc));
  ck(!r.talk || (r.talk.open && r.talk.layer && r.talk.closed), 'talk menu layer');
  ck(r.term.depth === 2 && r.term.after1 === 1 && r.term.closed, 'terminal: Esc pops one level at a time ' + JSON.stringify(r.term));
  ck(r.radio.open && r.radio.cards > 3 && r.radio.imgs === r.radio.cards && r.radio.closed, 'radio contact cards ' + JSON.stringify(r.radio));
  ck(r.wheel.open && r.wheel.frozen && r.wheel.sectors === 8 && r.wheel.ids === 'this,duty,order,radio,map,tools,carry,sys' && r.wheel.sel === 3 && r.wheel.pick === 'r.bridge' && r.wheel.closed && r.wheel.hailed, 'hold Q wheel: flick + release selects ' + JSON.stringify(r.wheel));
  ck(r.pin.pinned && r.pin.layer && r.pin.log && r.pin.closed && r.pin.esc, 'tap Q pins; digits pick; Esc closes ' + JSON.stringify(r.pin));
  ck(!r.belt.n || (r.belt.slot1 && r.belt.empty && r.belt.strip === r.belt.n), 'digits = belt quick-slots ' + JSON.stringify(r.belt));
  ck(r.portrait.ok && r.portrait.cached && r.portrait.mean > 20 && r.portrait.range > 40, 'portrait renders a non-empty head ' + JSON.stringify(r.portrait));
  ck(r.p.phase === 'paused' && r.p.shown && r.p.back === 'play', 'P pauses and resumes');
  ck(!r.tags || (r.tags.shown >= 1 && r.tags.text.length > 2), 'name tag shown ' + JSON.stringify(r.tags));
  ck(r.toast.icon && r.toast.text === 'Due: Engineering rounds', 'icon toast');
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) { const errs = []; const r = await uiTests(m => errs.push(m)); console.log(errs.length ? errs.join('\n') : 'ui OK ' + JSON.stringify(r)); process.exit(errs.length ? 1 : 0); }
