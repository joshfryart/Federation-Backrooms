// Touch / mobile controls (js/touch.js).   node tools/test-touch.mjs [--shots]   (standalone: own static server + Chromium, a phone profile)
//   touchTests(fail)              node: the pure helpers (enable rule, stick vector / dead zone, screen zones)
//   touchBrowser(page, fail, opt) browser: real touch events (CDP Input.dispatchTouchEvent) on a mobile context (hasTouch, isMobile,
//                                 deviceScaleFactor 1): the stick moves the player, a drag turns the view, the buttons fire their actions
//                                 (jump, duty board, map, wheel, pause / resume, Back), a console mini-game is played to the end by tapping
//                                 its on-screen buttons, a room job (scrub) progresses with Use held and the view swung by drag, Calm visuals.
//   --shots writes docs/screenshots/touch-*.png (deviceScaleFactor 1).
import { join, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

export async function touchTests(fail) {
  const T = await imp('js/touch.js'), ck = (c, m) => { if (!c) fail('touch: ' + m); };
  ck(T.touchWanted(null, true) && !T.touchWanted(null, false), 'on for a coarse pointer only');
  ck(T.touchWanted('1', false) && !T.touchWanted('0', true), '?touch=1 forces on, ?touch=0 forces off');
  const z = T.stickVec(0, 5); ck(z.x === 0 && z.z === 0 && z.mag === 0, 'dead zone');
  const f = T.stickVec(0, -56); ck(Math.abs(f.z + 1) < 1e-9 && Math.abs(f.x) < 1e-9 && f.mag === 1, 'full up = forward (z -1)');
  const c = T.stickVec(200, 0); ck(Math.abs(c.x - 1) < 1e-9 && c.mag === 1, 'clamped to the unit circle');
  const h = T.stickVec(28, 0); ck(h.mag > 0.3 && h.mag < 0.5 && Math.abs(Math.hypot(h.x, h.z) - h.mag) < 1e-9, 'half deflection is a partial vector');
  ck(T.zoneOf(50, 300, 800, 400) === 'stick' && T.zoneOf(600, 300, 800, 400) === 'look' && T.zoneOf(50, 20, 800, 400) === 'look', 'zones: left = stick (below the top strip), right = look');
}

// ---- a tiny CDP touch driver: points stay down until released (multi-touch: the stick thumb + the look thumb + a held button)
async function touchDriver(page) {
  const cdp = await page.context().newCDPSession(page), live = new Map();
  const pts = () => [...live.entries()].map(([id, [x, y]]) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 }));
  return {
    async down(id, x, y) { live.set(id, [x, y]); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts() }); },
    async move(id, x, y) { live.set(id, [x, y]); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts() }); },
    async up(id) { live.delete(id); await cdp.send('Input.dispatchTouchEvent', live.size ? { type: 'touchMove', touchPoints: pts() } : { type: 'touchEnd', touchPoints: [] }); },
    async tap(x, y, id = 90) { await this.down(id, x, y); await this.up(id); },
  };
}
const center = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null; }, sel);

export async function touchBrowser(page, fail, { shots = null } = {}) {
  const ck = (c, m) => { if (!c) fail('touch: ' + m); return !!c; };
  const { installHelpers } = await import('./test-helpers.mjs'); await installHelpers(page);
  const td = await touchDriver(page);
  const ev = (fn, a) => page.evaluate(fn, a);
  const step = (n = 1) => ev((n) => { const g = __game; window.__tt = window.__tt || 0; for (let i = 0; i < n; i++) { window.__tt += 1 / 30; g.step(1 / 30, window.__tt); g.menus?.frame(1 / 30); } __touch.sync(); }, n);
  const btn = async (id) => { await ev(() => __touch.sync()); return center(page, `#tc [data-tc="${id}"]`); };
  const tapBtn = async (id) => { const p = await btn(id); if (!ck(p, `button ${id} on screen`)) return false; await td.tap(p[0], p[1]); await ev(() => __touch.sync()); return true; };
  const shot = async (name) => { if (!shots) return; await ev(() => __game.renderOnce()); await page.screenshot({ path: join(shots, name) }); console.log('wrote', name); };

  const s0 = await ev(() => {
    const g = __game, G = g.G; G.manual = true; G.forceShip = 1; g.newRun(); document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); g.setQuality('low');
    G.phase = 'play'; G.hp = G.maxHp = 1e6; g.CFG.learned = {}; g.CFG.calm = false; __T.hideEnemies(); window.__tq = __T.quiet();
    const a = __T.arena(); if (a) { g.P.x = a[0]; g.P.z = a[1]; g.P.vx = g.P.vz = 0; }
    __touch.sync(); const vp = { w: innerWidth, h: innerHeight };
    return { on: __touch.on, mode: __touch.mode, body: document.body.classList.contains('touch'), shown: getComputedStyle(document.getElementById('tc')).display, vp, arena: !!a, dpr: devicePixelRatio, lock: document.getElementById('view').requestPointerLock() instanceof Promise };
  });
  ck(s0.on && s0.body && s0.shown === 'block' && s0.mode === 'play', 'touch controls on in play ' + JSON.stringify(s0));
  ck(s0.lock, 'pointer lock request is stubbed (resolves) on touch');
  const W = s0.vp.w, H = s0.vp.h;
  await step(3);

  // ---- 1) the stick: thumb down on the left, push up -> the player walks forward along the view
  const p0 = await ev(() => ({ x: __game.P.x, z: __game.P.z, yaw: __game.P.yaw }));
  const sx = W * 0.2, sy = H * 0.68; await td.down(1, sx, sy); await td.move(1, sx, sy - 30); await td.move(1, sx, sy - 60);
  const mv = await ev(() => ({ ...__touch.state(), knob: document.querySelector('#tc-stick').classList.contains('on') }));
  ck(mv.stick && mv.move && mv.move.z < -0.9 && Math.abs(mv.move.x) < 0.1 && mv.knob, 'stick up sets a forward move vector ' + JSON.stringify(mv));
  if (shots) await shot('touch-play.png');
  await step(30);
  const p1 = await ev(() => ({ x: __game.P.x, z: __game.P.z }));
  const fwd = (p1.x - p0.x) * -Math.sin(p0.yaw) + (p1.z - p0.z) * -Math.cos(p0.yaw), dist = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  ck(dist > 1 && fwd > 0.7 * dist, `stick walks the player forward (moved ${dist.toFixed(2)} m, forward ${fwd.toFixed(2)})`);
  // sprint latch while the stick is held
  await tapBtn('sprint'); const sp = await ev(() => __touch.state().sprint); await step(10); const spP = await ev(() => !!__game.P.sprint);
  ck(sp && spP, `sprint latch: on ${sp}, player sprinting ${spP}`);
  await td.up(1); await step(1);
  const mv2 = await ev(() => __touch.state()); ck(!mv2.stick && !mv2.move && !mv2.sprint, 'lifting the thumb stops (and drops the sprint latch) ' + JSON.stringify(mv2));

  // ---- 2) look: drag on the right half turns the view (left drag = turn left = yaw up)
  const y0 = await ev(() => __game.P.yaw); await td.down(2, W * 0.62, H * 0.45); await td.move(2, W * 0.62 - 50, H * 0.45); await td.move(2, W * 0.62 - 100, H * 0.45); await td.up(2);
  const y1 = await ev(() => __game.P.yaw); ck(y1 - y0 > 0.3 && y1 - y0 < 0.8, `drag left turns left (yaw ${(y1 - y0).toFixed(3)})`);
  // two thumbs at once: stick + look in the same touch sequence
  await td.down(1, sx, sy); await td.down(2, W * 0.62, H * 0.45); await td.move(1, sx + 60, sy); await td.move(2, W * 0.62, H * 0.45 + 40);
  const both = await ev(() => ({ ...__touch.state(), pitch: __game.P.pitch })); ck(both.stick && both.look && both.move?.x > 0.9, 'multi-touch: stick and look together ' + JSON.stringify(both));
  await td.up(2); await td.up(1); await ev(() => { __game.P.pitch = 0; });

  // ---- 3) buttons fire their actions
  await ev(() => { const g = __game, a = __T.arena(); if (a) { g.P.x = a[0]; g.P.z = a[1]; } g.P.vx = g.P.vz = g.P.vy = 0; g.G.stamina = 100; }); await step(15);   // back on open floor, settled
  const y0j = await ev(() => __game.P.y); const jb = await btn('jump'); await td.down(3, jb[0], jb[1]);
  let jumped = { maxY: y0j, air: false }; for (let k = 0; k < 8; k++) { await step(1); const s = await ev(() => ({ y: __game.P.y, g: __game.P.grounded })); jumped.maxY = Math.max(jumped.maxY, s.y); jumped.air ||= !s.g; }
  await td.up(3); await step(30);
  ck(jumped.air && jumped.maxY > y0j + 0.15, 'Jump button jumps ' + JSON.stringify({ y0: y0j, ...jumped }));
  await tapBtn('duty'); await step(1);
  const bd = await ev(() => ({ open: document.getElementById('bd-panel')?.classList.contains('show'), frozen: __game.ui.frozen, mode: __touch.mode, back: getComputedStyle(document.getElementById('tc-back')).display, act: getComputedStyle(document.getElementById('tc-act')).display }));
  ck(bd.open && bd.frozen && bd.mode === 'menu' && bd.back === 'block' && bd.act === 'none', 'Duty button opens the board; only Back shows ' + JSON.stringify(bd));
  // LCARS panel by touch: tap a block on the board -> its popover (the panel's own mousedown handler, via the tap's compatibility events)
  const blk = await center(page, '#bd-panel .blk');
  if (blk) { await td.tap(blk[0], blk[1]); const pop = await ev(() => !!document.querySelector('#bd-panel .dp-pop')); ck(pop, 'tapping a duty-board block opens its popover'); }
  if (shots) await shot('touch-board.png');
  if (blk) await tapBtn('back');
  await tapBtn('back'); await step(1);
  const bd2 = await ev(() => ({ open: document.getElementById('bd-panel')?.classList.contains('show'), frozen: __game.ui.frozen, mode: __touch.mode, phase: __game.G.phase }));
  ck(!bd2.open && !bd2.frozen && bd2.mode === 'play' && bd2.phase === 'play', 'Back closes the board, back to play (no pause) ' + JSON.stringify(bd2));
  await tapBtn('map'); const mo = await ev(() => ({ map: !!__game.G.nav?.mapOpen, mode: __touch.mode })); ck(mo.map && mo.mode === 'menu', 'Map button opens the deck map ' + JSON.stringify(mo));
  await tapBtn('back'); ck(!(await ev(() => !!__game.G.nav?.mapOpen)), 'Back closes the map');
  await tapBtn('wheel'); const wh = await ev(() => ({ pinned: !!__game.ui.wheel?.pinned, view: !!__game.menus.view.W })); ck(wh.pinned && wh.view, 'Wheel button opens the pinned quick wheel ' + JSON.stringify(wh));
  await tapBtn('back'); await step(1); ck(!(await ev(() => __game.ui.frozen)), 'Back closes the wheel');
  // the quick wheel's flick: hold Wheel, the held wheel opens, drag toward the bottom sector (Inspect), lift -> its default (Deck map) runs
  { const wb = await btn('wheel'); await td.down(7, wb[0], wb[1]); await page.waitForTimeout(340); await step(2);
    const op = await ev(() => ({ held: !!__game.menus.view.W?.held, mode: __touch.mode, held2: __touch.state().held }));
    await td.move(7, wb[0], wb[1] + 20); await td.move(7, wb[0], wb[1] + 60); await step(1);
    const sel = await ev(() => __game.menus.view.W?.sel);
    await td.up(7); await step(2); const fl = await ev(() => ({ map: !!__game.G.nav?.mapOpen, wheel: !!__game.ui.wheel, held: __touch.state().held }));
    ck(op.held && op.mode === 'menu' && op.held2.includes('wheel'), 'holding Wheel opens the held quick wheel and keeps the finger ' + JSON.stringify(op));
    ck(sel === 4 && fl.map && !fl.wheel && !fl.held.length, `flick down + lift runs Inspect's default (sector ${sel}) ` + JSON.stringify(fl));
    await tapBtn('back'); await step(1); ck(!(await ev(() => !!__game.G.nav?.mapOpen)), 'Back closes the map after the flick'); }
  // a short press of Wheel is still the pinned wheel (checked above); a hold with no drag then lift cancels
  { const wb = await btn('wheel'); await td.down(7, wb[0], wb[1]); await page.waitForTimeout(340); await step(2); await td.up(7); await step(2);
    const c = await ev(() => ({ wheel: !!__game.ui.wheel, frozen: __game.ui.frozen, map: !!__game.G.nav?.mapOpen })); ck(!c.wheel && !c.frozen && !c.map, 'hold without a drag, lift = cancel ' + JSON.stringify(c)); }
  // the talk wheel by touch: E on a crew member, tap a sector, tap Back to leave
  { const tk = await ev(async () => {
      const g = __game, G = g.G, P = g.P; G.phase = 'play'; const e = g.ents.find(x => x.kind === 'crew' && x.simmed && x.mesh?.userData.human && !x.fake); if (!e) return { err: 'no crew' };
      P.x = e.x + Math.sin(e.mesh.rotation.y) * 1.3; P.z = e.z + Math.cos(e.mesh.rotation.y) * 1.3; const ok = g.talk.begin(e); let t = window.__tt; for (let i = 0; i < 40; i++) { t += 1 / 30; g.talk.step(1 / 30, t); g.menus.frame(1 / 30); } window.__tt = t; __touch.sync();
      return { ok, phase: G.phase, mode: __touch.mode, back: getComputedStyle(document.getElementById('tc-back')).display, inputOk: g.talk.M.inputOk, n: g.talk.W?.sectors.length };
    });
    if (ck(!tk.err && tk.ok && tk.phase === 'talk' && tk.mode === 'menu' && tk.back === 'block' && tk.inputOk, 'a conversation opens; the touch overlay shows Back only ' + JSON.stringify(tk))) {
      const pt = await ev(async () => { const WH = await import('/js/wheel.js'), svg = document.querySelector('#tk .wbox svg'), r = svg.getBoundingClientRect(), sc = 440 / Math.min(r.width, r.height), a = WH.sectorAngle(1, __game.talk.W.sectors.length) * Math.PI / 180, rr = 106;
        return [r.left + r.width / 2 + Math.cos(a) * rr / sc, r.top + r.height / 2 + Math.sin(a) * rr / sc]; });
      await td.tap(pt[0], pt[1]); await ev(() => { const g = __game; let t = window.__tt; for (let i = 0; i < 6; i++) { t += 1 / 30; g.talk.step(1 / 30, t); } window.__tt = t; });
      const sl = await ev(() => ({ sel: __game.talk.W?.sel, phase: __game.G.phase, rings: document.querySelectorAll('#tk .wseg').length })); ck(sl.sel === 1 && sl.phase === 'talk', 'tapping a talk-wheel sector selects it ' + JSON.stringify(sl));
      await tapBtn('back'); await ev(() => { const g = __game; let t = window.__tt; for (let i = 0; i < 40 && g.G.phase === 'talk'; i++) { t += 1 / 30; g.talk.step(1 / 30, t); g.menus.frame(1 / 30); } window.__tt = t; __touch.sync(); });
      const lv = await ev(() => ({ phase: __game.G.phase, mode: __touch.mode })); ck(lv.phase === 'play' && lv.mode === 'play', 'Back leaves the conversation ' + JSON.stringify(lv)); } }
  await tapBtn('radio'); ck(await ev(() => __game.commsHud?.panel === 'radio'), 'Radio button opens the radio cards'); await tapBtn('back');
  await tapBtn('more'); const mr = await ev(() => getComputedStyle(document.getElementById('tc-more')).display); ck(mr === 'flex', 'More opens the drawer');
  const torch0 = await ev(() => !!__game.P.torch); await tapBtn('torch'); const torch1 = await ev(() => ({ t: !!__game.P.torch, more: __touch.state().more }));
  ck(torch1.t !== torch0 && !torch1.more, 'drawer Torch toggles the torch and closes the drawer');
  // Ship status: held
  const stb = await btn('status'); await td.down(4, stb[0], stb[1]); const ss = await ev(() => document.getElementById('shipstatus')?.style.display !== 'none' && getComputedStyle(document.getElementById('shipstatus')).display !== 'none'); await td.up(4);
  const ss2 = await ev(() => getComputedStyle(document.getElementById('shipstatus')).display === 'none'); ck(ss && ss2, `Ship status shows while held (${ss}) and hides on release (${ss2})`);
  // Pause -> the pause screen; a tap on Resume resumes (no pointer lock needed)
  await tapBtn('pause'); const pz = await ev(() => ({ phase: __game.G.phase, shown: document.getElementById('pause').classList.contains('show'), mode: __touch.mode }));
  ck(pz.phase === 'paused' && pz.shown && pz.mode === 'off', 'Pause button pauses ' + JSON.stringify(pz));
  if (shots) await shot('touch-pause.png');
  const rs = await center(page, '#resume'); if (rs) await td.tap(rs[0], rs[1]); await ev(() => __touch.sync());
  const rz = await ev(() => ({ phase: __game.G.phase, chip: document.getElementById('ui-resume')?.classList.contains('on'), mode: __touch.mode })); ck(rz.phase === 'play' && !rz.chip && rz.mode === 'play', 'tap Resume -> play, no "click to resume" chip ' + JSON.stringify(rz));

  // ---- 4) a console mini-game, played to the end by tapping its on-screen buttons (the instruction card's Begin too)
  const jg0 = await ev(() => {
    const g = __game, G = g.G, D = g.duty, l = D.loops[0]; if (D.busy) D.busy = null;
    Object.assign(l, { label: 'Balance grid load against reactor output', spot: 'console', sys: '', state: 'due', dueAt: D.t }); D.setPlace(G.shipDeck + 1, l.room);
    const r = g.startJob(l, { console: true }); __touch.sync(); return { ok: r.ok, phase: g.jobgame.phase, mode: __touch.mode, tool: g.jobgame.active?.tool.id };
  });
  ck(jg0.ok && jg0.phase === 'intro' && jg0.mode === 'menu', 'console job opens the instruction card ' + JSON.stringify(jg0));
  const begin = await center(page, '#jobgame [data-k="Enter"]'); if (begin) await td.tap(begin[0], begin[1]);
  const jg1 = await ev(() => ({ phase: __game.jobgame.phase, kind: __game.jobgame.game?.kind })); ck(jg1.phase === 'play', 'tapping Begin starts the game ' + JSON.stringify(jg1));
  if (shots) { await ev(() => { __game.jobgame.tick(1 / 30); }); await shot('touch-jobgame.png'); }
  // each test frame: press every key the game's hint() wants held / pressed now (a finger on its button), tick, lift the fingers
  const missing = new Set(); let frames = 0, presses = 0;
  for (; frames < 30 * 90; frames++) {
    const st = await ev(() => { const J = __game.jobgame; if (J.phase !== 'play' || !J.game || J.game.state !== 'play') return null;
      return J.game.hint().filter(([, d]) => d !== false).map(([c]) => { const e = document.querySelector(`#jobgame [data-k="${c}"]`), r = e?.getBoundingClientRect(); return [c, r && r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null]; }); });
    if (!st) break;
    const ids = []; for (const [c, p] of st) { if (!p) { missing.add(c); continue; } const id = 100 + ids.length; ids.push(id); await td.down(id, p[0], p[1]); presses++; }
    await ev(() => __game.jobgame.tick(1 / 30));
    for (const id of ids.reverse()) await td.up(id);
  }
  const jg2 = await ev(() => { const J = __game.jobgame; for (let i = 0; i < 60 && J.active; i++) J.tick(1 / 30); return { active: !!J.active, layer: __game.ui.has('jobgame'), busy: __game.duty.busy?.q || null, log: J.log.slice(-2), held: __touch.state().held }; });
  if (process.env.TOUCH_VERBOSE) console.log("mini-game", jg1.kind, frames, presses, JSON.stringify(jg2));
  ck(!missing.size, 'every hinted key has an on-screen button: missing ' + [...missing].join(','));
  ck(!jg2.active && !jg2.layer && jg2.busy && !jg2.held.length, `mini-game played to the end by touch (${frames} frames, ${presses} presses) ` + JSON.stringify(jg2));
  await ev(() => { const D = __game.duty; D.busy = null; }); await step(1);

  // ---- 5) a room job: hold Use (E) and swing the view by dragging -> the scrub site cleans
  const rj = await ev(async () => {
    const HH = await import('/js/handhelds.js'), g = __game, G = g.G, P = g.P, w = g.world, d = w.d, D = g.duty, l = D.loops[0]; if (D.busy) D.busy = null;
    const inRoom = (r) => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { const [cx, cz] = w.center(x, y); if (__T.open(cx, cz, 0.3)) return [cx, cz]; } return null; };
    const room = d.rooms.find(r => r.w >= 3 && r.h >= 3 && inRoom(r)); if (!room) return { err: 'no room' };
    Object.assign(l, { label: 'Scrub and sanitise the galley', room: room.type, spot: 'console', sys: '', state: 'due', dueAt: D.t }); D.setPlace(G.shipDeck + 1, room.type);
    if (!G.kit.belt.some(b => b.id === 'mop')) G.kit.belt.push(HH.newInstance('mop', 7));   // on the belt: the first Use at a site takes it out
    const [x, z] = inRoom(room); P.x = x; P.z = z; P.vx = P.vz = 0; g.step(1 / 30, (window.__tt += 1 / 30));
    const r = g.startJob(l), run = g.sites.run; if (!run) return { err: 'no run ' + JSON.stringify(r) };
    const i = run.sites.findIndex(s => s.act !== 'fetch'); const s = run.sites[i];
    const [cx, cz] = w.center(s.tx, s.ty), o = s.prop ? __T.openSideOf(cx, cz, 1.6, 1.3) : { x: cx + 0.6, z: cz }; if (o) { P.x = o.x; P.z = o.z; P.yaw = o.yaw ?? Math.atan2(-(cx - o.x), -(cz - o.z)); } P.pitch = -0.35;
    for (let k = 0; k < 3; k++) { window.__tt += 1 / 30; g.step(1 / 30, window.__tt); }
    __touch.sync(); return { i, act: s.act, at: g.sites.at, n: run.sites.length, def: run.def.id, mode: __touch.mode };
  });
  if (ck(!rj.err && rj.i >= 0, 'room job set up ' + JSON.stringify(rj))) {
    const ub = await btn('use'); await td.down(5, ub[0], ub[1]); await step(2);
    let prog = 0; const lx = W * 0.62, ly = H * 0.42; await td.down(6, lx, ly);
    for (let k = 0; k < 120; k++) { const dx = Math.sin(k * 0.6) * 45; await td.move(6, lx + dx, ly); await step(1); }
    prog = await ev((i) => { const r = __game.sites.run; return r ? { p: r.sites[i].prog, done: r.sites[i].done, held: __touch.state().held, hand: __game.G.kit.inst?.id, at: __game.sites.at } : { gone: true }; }, rj.i);
    await td.up(6); await td.up(5); await step(1);
    if (process.env.TOUCH_VERBOSE) console.log("room job", JSON.stringify(rj), JSON.stringify(prog)); ck(!prog.gone && (prog.p > 0.05 || prog.done), `room job progresses with Use held + drag swings (${rj.act}) ` + JSON.stringify(prog));
    if (shots) await shot('touch-roomjob.png');
    await ev(() => { __game.sites.cancel?.('test'); __game.duty.busy = null; });
  }

  // ---- 6) Calm visuals: the overlay drops its press animation
  const calm = await ev(() => { __game.CFG.calm = true; __touch.sync(); const on = document.body.classList.contains('tc-calm'); __game.CFG.calm = false; __touch.sync(); return on && !document.body.classList.contains('tc-calm'); });
  ck(calm, 'Calm visuals toggles the calm touch styling');
  // ---- 7) phases with no world input hide the overlay (death / title screens)
  const off = await ev(() => { const G = __game.G, ph = G.phase; G.phase = 'dead'; __touch.sync(); const m = __touch.mode, act = getComputedStyle(document.getElementById('tc-act')).display; G.phase = ph; __touch.sync(); return { m, act }; });
  ck(off.m === 'off' && off.act === 'none', 'overlay hidden outside play ' + JSON.stringify(off));
  await ev(() => window.__tq?.());
}

// ---- standalone
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { createServer } = await import('node:http'), { readFile } = await import('node:fs/promises'), { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url), { chromium, devices } = require('playwright');
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream', '.svg': 'image/svg+xml', '.ktx2': 'image/ktx2', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
  const server = createServer(async (req, res) => { try { const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html')); const b = await readFile(p); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); } }).listen(0);
  const fails = []; const fail = (m) => { fails.push(m); console.log('FAIL', m); };
  await touchTests(fail);
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage({ ...devices['Pixel 7 landscape'], deviceScaleFactor: 1 }); page.setDefaultTimeout(180000);
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(`http://localhost:${server.address().port}/index.html?test=1`);   // no ?touch=1: the mobile profile's coarse pointer turns it on
    await page.waitForFunction(() => window.__game && window.__touch, null, { timeout: 180000 }); await page.evaluate(async () => { await __game.ready; await __game.warmed; });
    await touchBrowser(page, fail, { shots: process.argv.includes('--shots') ? join(ROOT, 'docs/screenshots') : null });
    for (const e of errs) fail('page error: ' + e);
  } finally { await browser.close(); server.close(); }
  console.log(fails.length ? `touch: ${fails.length} FAIL` : 'touch: OK'); process.exit(fails.length ? 1 : 0);
}
