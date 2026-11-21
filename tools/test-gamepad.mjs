// Gamepad (js/gamepad.js) in the browser with a mocked navigator.getGamepads (standard mapping), driven on the test clock:
//   node tools/test.mjs --only gamepad
// Checks: left stick moves, right stick looks (and Calm turns slower), X holds / taps E, a console job game is played through the pad
// (A / X / d-pad / face buttons become the game's key codes through the real menu router), a duty option menu is navigated with the d-pad,
// and the glyph strip shows only while a pad is the last device used.
export async function padBrowser(page, fail) {
  const { installHelpers } = await import('./test-helpers.mjs'); await installHelpers(page);
  await page.evaluate(() => { document.exitPointerLock?.(); window.__jmLock = __game.G.menus.lock; __game.G.menus.lock = () => null; });
  const R = await page.evaluate(() => {
    const g = __game, G = g.G, CFG = g.CFG, J = g.jobgame, P = g.P, pad = G.pad, out = {}, hide = () => document.querySelectorAll('.screen').forEach(s => s.classList.remove('show'));
    g.newRun(); hide(); g.setQuality('low'); G.phase = 'play'; G.hp = G.maxHp = 1e6; CFG.learned = {}; CFG.calm = false; CFG.caps = false; CFG.cb = false; CFG.sens = 1; const restore = __T.quiet();
    // the mock pad: buttons[i] / axes[i], navigator.getGamepads() returns it
    const st = { buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0], connected: true, index: 0, id: 'Mock Pad (standard)', mapping: 'standard' };
    navigator.getGamepads = () => [st]; const B = (i, v) => { st.buttons[i] = { pressed: !!v, value: v ? 1 : 0 }; }, A = (a) => { st.axes = a; };
    const D = g.duty, w = g.world, deck = G.shipDeck + 1, l = D.loops[0]; let t = 0;
    const frames = (n, dt = 1 / 30) => { for (let i = 0; i < n; i++) { t += dt; pad.tick(dt); g.step(dt, t); G.menus.frame(dt); J.tick(dt); } };
    const set = (billet, jtype, label, room = l.room) => { if (D.busy) D.busy = null; Object.assign(l, { billet, jtype, label, room, spot: 'console', sys: '', state: 'due', dueAt: D.t }); D.setPlace(deck, room); };
    const room = w.d.rooms.find(r => r.w >= 4 && r.h >= 4); let spot = null; for (let y = room.y; y < room.y + room.h && !spot; y++) for (let x = room.x; x < room.x + room.w && !spot; x++) { const [cx, cz] = w.center(x, y); if (__T.open(cx, cz, 0.5)) spot = [cx, cz]; }
    P.x = spot[0]; P.z = spot[1]; P.vx = P.vz = 0; P.yaw = 0; P.pitch = 0; frames(2);
    out.idle = { active: pad.active, hint: document.getElementById('padhint')?.classList.contains('on'), mode: pad.mode };
    const p0 = [P.x, P.z]; A([0, -1, 0, 0]); frames(20); out.moved = Math.hypot(P.x - p0[0], P.z - p0[1]); out.keyW = pad.held.has('KeyW'); out.active = pad.active; out.hintOn = document.getElementById('padhint').classList.contains('on') && document.body.classList.contains('pad-on') && /Look/.test(document.getElementById('padhint').textContent);
    A([0, 0, 0, 0]); frames(2); out.keyWoff = !pad.held.has('KeyW');
    const pm = [P.x, P.z], y0 = P.yaw;  frames(10); const pm2 = [P.x, P.z]; A([0.1, 0.1, 0.1, 0.1]); frames(15); out.drift = Math.abs(P.yaw - y0) + Math.hypot(P.x - pm2[0], P.z - pm2[1]); A([0, 0, 0, 0]); frames(2);
    A([0, 0, 1, 0]); const yA = P.yaw; frames(15); out.yawNormal = yA - P.yaw; A([0, 0, 0, -1]); const pA = P.pitch; frames(10); out.pitchUp = P.pitch - pA; A([0, 0, 0, 0]); frames(15);
    CFG.calm = true; A([0, 0, 1, 0]); const yB = P.yaw; frames(15); out.yawCalm = yB - P.yaw; A([0, 0, 0, 0]); frames(15); CFG.calm = false;
    B(2, true); frames(2); out.eHeld = pad.held.has('KeyE'); A([0, 0, 1, 0]); frames(5); A([0, 0, 0, 0]); B(2, false); frames(2); out.eReleased = !pad.held.has('KeyE');
    B(0, true); frames(1); out.jumpKey = pad.held.has('Space'); B(0, false); frames(1);
    // a console job game through the pad
    set('co', 'loop', 'Department status review'); const r = g.startJob(l); out.start = r.ok && J.active && J.phase === 'intro'; frames(2); out.jobMode = pad.mode;
    B(0, true); frames(2); B(0, false); frames(2); out.began = J.phase === 'play' && !!J.game; out.jobBtns = document.querySelectorAll('#jobgame [data-k]').length; pad.annotate(); out.glyphs = document.querySelectorAll('#jobgame .pgl').length;
    const idx = (code) => ({ Enter: 0, NumpadEnter: 0, Space: 2, ArrowUp: 12, ArrowDown: 13, ArrowLeft: 14, ArrowRight: 15, Digit1: 3, Digit2: 5, Digit3: 4, Digit4: 7, Digit5: 6, Digit6: 11, Digit7: 10 })[code];
    const gm = J.game, k0 = pad.log.length; let sent = 0;
    for (let i = 0; i < 1500 && gm.state === 'play'; i++) {
      for (const [c, dn] of gm.hint()) { const b = idx(c); if (b == null) continue; B(b, dn); sent++; frames(1); if (/^(Arrow|Digit|Enter)/.test(c)) { B(b, false); frames(1); } }
      frames(1);
    }
    out.jobState = gm.state; out.sent = sent; out.padKeys = pad.log.length - k0; frames(40); out.jobClosed = !J.active && !G.ui.has('jobgame');
    for (let i = 0; i < 17; i++) B(i, false); frames(2);
    // B cancels a game (menus.js owns B in a layer)
    if (D.busy) D.busy = null; set('co', 'loop', 'Department status review'); g.startJob(l); frames(2); B(0, true); frames(2); B(0, false); frames(2); B(1, true); frames(2); B(1, false); frames(2); out.cancelled = !J.active;
    if (D.busy) D.busy = null;
    // a menu: d-pad down + A runs the second option
    const ran = []; G.hud2.openMenu('Pad menu', [{ label: 'First', run: () => ran.push('first') }, { label: 'Second', run: () => ran.push('second') }, { label: 'Third', run: () => ran.push('third') }]); frames(3);
    out.menuMode = pad.mode; out.menuTargets = pad.targets().length; B(13, true); frames(2); B(13, false); frames(2); out.sel = document.querySelector('.padsel')?.textContent || ''; B(0, true); frames(2); B(0, false); frames(2); out.ran = ran.join(','); out.menuClosed = pad.mode === 'play';
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' })); out.afterKey = { active: pad.active, hint: document.getElementById('padhint').classList.contains('on') }; frames(1);
    st.connected = false; navigator.getGamepads = () => [null]; frames(2); out.gone = !pad.active && !pad.held.size;
    restore(); return out;
  });
  await page.evaluate(() => { __game.G.menus.lock = window.__jmLock; });
  console.log('gamepad:', JSON.stringify(R));
  const chk = (c, m) => { if (!c) fail('gamepad: ' + m + ' ' + JSON.stringify(R)); };
  chk(!R.idle.active && !R.idle.hint, 'no pad input yet: no glyph strip');
  chk(R.moved > 0.8 && R.keyW && R.keyWoff, 'left stick up walks (W held, released with the stick)');
  chk(R.active && R.hintOn, 'glyph strip shows once a pad is used');
  chk(R.drift < 0.05, 'dead zone: a drifting stick moves nothing');
  chk(R.yawNormal > 0.3 && R.pitchUp > 0.1, 'right stick turns and tilts the view');
  chk(R.yawCalm > 0.05 && R.yawCalm < R.yawNormal * 0.75, 'Calm turns slower');
  chk(R.eHeld && R.eReleased, 'X holds E and lets go');
  chk(R.jumpKey, 'A is Space');
  chk(R.start && R.jobMode === 'job' && R.began && R.jobBtns >= 2 && R.glyphs >= 1, 'a job game: pad enters job mode, A starts it, on-screen buttons carry glyphs');
  chk(R.jobState === 'win' && R.sent > 0 && R.padKeys > 0 && R.jobClosed, 'the job game is won with pad buttons only');
  chk(R.cancelled, 'B cancels the job game');
  chk(R.menuMode === 'layer' && R.menuTargets >= 3 && /Second/.test(R.sel) && R.ran === 'second' && R.menuClosed, 'menu: d-pad moves the cursor, A chooses');
  chk(!R.afterKey.active && !R.afterKey.hint, 'a real key press hides the glyph strip');
  chk(R.gone, 'unplugging releases everything');
}
