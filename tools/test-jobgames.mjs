// Job mini-games + first-use tool instructions (js/jobgames.js logic in node; js/jobgame-ui.js + js/main.js startJob in the browser).
//   node tools/test-jobgames.mjs            the node half
//   node tools/test.mjs --only jobgames     the browser half (nominal page, test clock)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

// play a game to the end: 'win' plays it right, 'strike' makes wrong moves, 'idle' does nothing (the timer runs out)
export function autoPlay(g, how = 'win', dt = 1 / 30, maxT = 60) {
  for (let t = 0; g.state === 'play' && t < maxT; t += dt) {
    if (how === 'win') {
      if (g.solve) g.key('Digit' + g.solve());
      else if (g.kind === 'dial') { if (g.inBand()) g.key('Space'); }
      else if (g.kind === 'calibrate') { const r = g.target > g.m + 0.02, l = g.target < g.m - 0.02; g.key('ArrowRight', r); g.key('ArrowLeft', l); }
    } else if (how === 'strike') {
      if (g.solve) { const right = g.solve(); g.key('Digit' + (right % 4 + 1)); }
      else if (g.kind === 'dial') { if (!g.inBand()) g.key('Space'); }
    }
    g.tick(dt);
  }
  return g.result();
}

export async function jobgameTests(fail) {
  const J = await imp('js/jobgames.js'), ck = (c, m) => { if (!c) fail('jobgames: ' + m); return !!c; };
  const duties = JSON.parse(readFileSync(join(ROOT, 'assets/data/duties.json'), 'utf8'));
  const out = { wins: 0, fails: 0, kinds: {} };
  // every station spot in duties.json has a tool (a mini-game) unless it is a place, not a station
  const PLACES = new Set(['any', 'post', 'null', 'undefined']); const missing = new Set();
  for (const b of Object.values(duties.billets)) { for (const l of b.loops) if (!J.toolFor(l.spot) && !PLACES.has(String(l.spot))) missing.add(l.spot); for (const ts of Object.values(b.tasks)) for (const t of ts) if (!J.toolFor(t.spot) && !PLACES.has(String(t.spot))) missing.add(t.spot); }
  ck(!missing.size, 'duty spots without a tool: ' + [...missing].join(', '));
  for (const t of Object.values(J.TOOLS)) ck(J.KINDS[t.kind] && t.name && t.how && t.keys.length, 'tool has kind / name / how / keys: ' + t.id);
  for (const kind of Object.keys(J.KINDS)) {
    for (let seed = 1; seed <= 25; seed++) {
      for (const calm of [false, true]) {
        const g = J.createGame(kind, seed, { calm }), r = autoPlay(g, 'win'); ck(r.state === 'win', `${kind} seed ${seed}${calm ? ' calm' : ''} winnable by playing it right: ${JSON.stringify(r)} ${JSON.stringify(g.view())}`);
        if (r.state === 'win') out.wins++; const o = J.outcome(g); ck(o.quality === 'proper' && o.timeMul < 1, `${kind} win -> proper, faster`);
        out.kinds[kind] = Math.max(out.kinds[kind] || 0, +r.t.toFixed(1));
      }
      const f = J.createGame(kind, seed); const r2 = autoPlay(f, kind === 'calibrate' ? 'idle' : 'strike'); ck(r2.state === 'fail', `${kind} seed ${seed} fails on bad play: ${JSON.stringify(r2)}`);
      if (r2.state === 'fail') out.fails++; ck(J.outcome(f).quality === 'rushed' && J.outcome(f).timeMul === 1, `${kind} fail -> rushed (the job still gets done)`);
      const idle = J.createGame(kind, seed); autoPlay(idle, 'idle', 0.25, 200); ck(idle.state === 'fail' && idle.why === 'time' && idle.t <= idle.limit + 0.3, `${kind} always ends by itself (timer): ${idle.state} ${idle.why} ${idle.t}`);
    }
    // deterministic per seed; calm gives more time; cancel is not an outcome
    const a = J.createGame(kind, 9), b = J.createGame(kind, 9); ck(JSON.stringify(a.view()) === JSON.stringify(b.view()), kind + ' same seed, same puzzle');
    ck(J.createGame(kind, 3, { calm: true }).limit === J.createGame(kind, 3).limit * 1.5, kind + ' calm: +50 % time');
    const c = J.createGame(kind, 4); c.cancel(); ck(c.state === 'cancel' && J.outcome(c) === null, kind + ' cancel has no outcome'); c.tick(100); ck(c.state === 'cancel', kind + ' a cancelled game stays cancelled');
  }
  // a clean win is faster than a win with a fault
  { const g = J.createGame('sequence', 2); g.key('Digit' + (g.solve() % 4 + 1)); autoPlay(g, 'win'); const o = J.outcome(g); ck(g.state === 'win' && !o.perfect && o.timeMul === 0.6, 'win with a strike: 0.6 time'); }
  { const g = J.createGame('sequence', 2); ck(!g.key('KeyJ') && !g.key('Escape') && g.strikes === 0, 'keys outside the game are ignored (no strike)'); }
  // learned store: once marked, has() is true; reset clears
  { let v = null; const s = J.learnedStore(() => v, (x) => { v = x; }); ck(!s.has('console'), 'nothing learned at first'); s.mark('console'); ck(s.has('console') && !s.has('junction') && v.console === 1, 'mark persists through set()'); s.reset(); ck(!s.has('console'), 'reset'); }
  return out;
}

// a key press through the real window listeners (the menus router in capture, then main.js), as tools/test-ui.mjs does
const press = (page, code) => page.evaluate((code) => { window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })); }, code);
// browser half: the instruction card shows once per tool (persisted in fb_cfg), win / fail set quality + time, Esc cancels (job stays due), no soft-lock
export async function jobgameBrowser(page, fail) {
  // pointer lock is off for this section (tools/test-ui.mjs covers the lock / Esc / relock rules): headless Chromium grants and drops locks
  // asynchronously, and opening + closing layers within one test frame races those events into a pause screen no player can reach
  await page.evaluate(() => { document.exitPointerLock?.(); window.__jgLock = __game.G.menus.lock; __game.G.menus.lock = () => null; });
  const r = await page.evaluate(() => {
    const g = __game, G = g.G, CFG = g.CFG, J = g.jobgame, out = {}, hide = () => document.querySelectorAll('.screen').forEach(s => s.classList.remove('show'));
    g.newRun(); hide(); g.setQuality('low'); G.phase = 'play'; G.hp = G.maxHp = 1e6; CFG.learned = {}; CFG.calm = false; CFG.cb = false; CFG.caps = false;
    const D = g.duty, deck = G.shipDeck + 1, l = D.loops[0], base = (q) => Math.max(2.5, l.dur * (10 / 3) * l.q[q][0] * 1.2 * (g.pace.performMul ?? 1));
    const due = (spot) => { if (D.busy) D.busy = null; l.spot = spot; l.state = 'due'; l.dueAt = D.t; D.setPlace(deck, l.room); };
    const play = (how) => { const gm = J.game; for (let i = 0; i < 2000 && gm.state === 'play'; i++) { if (how === 'win') { if (gm.solve) J.key('Digit' + gm.solve()); else if (gm.kind === 'dial') { if (gm.inBand()) J.key('Space'); } else { J.key('ArrowRight', gm.target > gm.m + 0.02); J.key('ArrowLeft', gm.target < gm.m - 0.02); } } else if (how === 'strike' && gm.solve) J.key('Digit' + (gm.solve() % 4 + 1)); J.tick(1 / 30); } J.tick(1); return gm.result(); };
    // 1) first use of the console: the instruction card, the layer is up and the world is frozen
    due('console'); const r1 = g.startJob(l); out.first = { ok: r1.ok, game: !!r1.game, phase: J.phase, layer: G.ui.has('jobgame'), frozen: G.menuPause, card: /New tool/.test(document.getElementById('jobgame')?.textContent || ''), keys: document.querySelectorAll('#jobgame kbd').length };
    return out;
  });
  // the real keyboard path: Enter through the menus router begins the game (learned + persisted)
  await press(page, 'Enter');
  const r2 = await page.evaluate(() => {
    const g = __game, G = g.G, CFG = g.CFG, J = g.jobgame, out = {}, D = g.duty, l = D.loops[0], deck = G.shipDeck + 1;
    const base = (q) => Math.max(2.5, l.dur * (10 / 3) * l.q[q][0] * 1.2 * (g.pace.performMul ?? 1));
    const due = (spot) => { if (D.busy) D.busy = null; l.spot = spot; l.state = 'due'; l.dueAt = D.t; D.setPlace(deck, l.room); };
    const play = (how) => { const gm = J.game; for (let i = 0; i < 2000 && gm.state === 'play'; i++) { if (how === 'win') { if (gm.solve) J.key('Digit' + gm.solve()); else if (gm.kind === 'dial') { if (gm.inBand()) J.key('Space'); } else { J.key('ArrowRight', gm.target > gm.m + 0.02); J.key('ArrowLeft', gm.target < gm.m - 0.02); } } else if (how === 'strike' && gm.solve) J.key('Digit' + (gm.solve() % 4 + 1)); J.tick(1 / 30); } J.tick(1); return gm.result(); };
    out.begun = { phase: J.phase, kind: J.game?.kind, learned: !!CFG.learned?.console, stored: !!JSON.parse(localStorage.getItem('fb_cfg') || '{}').learned?.console };
    // 2) win: the job runs properly, at half time (clean), the layer is gone
    const w = play('win'); out.win = { res: w.state, closed: !J.active && !G.ui.has('jobgame'), busy: D.busy?.loop === l, q: D.busy?.q, total: +(D.busy?.total || 0).toFixed(2), base: +base('proper').toFixed(2) };
    // 3) second use of the same tool: no card; a fumbled game still does the job, rushed
    due('console'); g.startJob(l); out.second = { phase: J.phase }; const f = play('strike'); out.fail = { res: f.state, strikes: f.strikes, busy: D.busy?.loop === l, q: D.busy?.q, total: +(D.busy?.total || 0).toFixed(2), base: +base('rushed').toFixed(2) };
    // 4) another tool kind (warp core valve): its own card; idle play runs out of time -> rushed, never stuck
    due('warpcore'); g.startJob(l); out.dial = { phase: J.phase }; J.key('Enter'); let n = 0; while (J.active && n++ < 30 * 40) J.tick(1 / 30); out.dial.timeout = { active: J.active, q: D.busy?.q, frames: n, why: J.game?.why };
    // 5) calibration (biobed): hold-key game wins; calm visuals give 50 % more time
    CFG.calm = true; due('biobed'); g.startJob(l); J.key('Enter'); out.cal = { limit: J.game.limit, kind: J.game.kind }; const c = play('win'); out.cal.res = c.state; out.cal.q = D.busy?.q; CFG.calm = false;
    // 6) colour-blind palette + captions: a strike leaves a caption line
    CFG.cb = true; CFG.caps = true; due('junction'); g.startJob(l); J.key('Enter'); out.cb = { good: J.palette.good, leads: J.palette.wires.join(',') }; const gm = J.game; J.key('Digit' + (gm.solve() % 4 + 1)); out.cb.caption = [...document.querySelectorAll('#caps div')].map(d => d.textContent).join('|'); out.cb.strikes = gm.strikes;
    return out;
  });
  // 7) Esc through the real keyboard router: cancel; the job stays due, nothing performed, the layer stack is empty
  await press(page, 'Escape');
  const r3 = await page.evaluate(() => {
    const g = __game, G = g.G, CFG = g.CFG, J = g.jobgame, D = g.duty, l = D.loops[0], deck = G.shipDeck + 1, out = {};
    out.cancel = { active: J.active, state: l.state, busy: !!D.busy, stack: G.ui.stack.length, frozen: G.menuPause, log: J.log.slice(-1)[0] };
    CFG.cb = false; CFG.caps = false;
    // 8) a mission task at a junction 
    const t = D.tasks[0]; if (t) { t.state = 'active'; t.spot = 'junction'; D.setPlace(deck, t.room); const rt = g.startJob({ ...t, label: t.task }); out.task = { game: !!rt.game }; }
    return out;
  });
  const r4 = await page.evaluate(() => {
    const g = __game, G = g.G, J = g.jobgame, D = g.duty, l = D.loops[0], deck = G.shipDeck + 1, out = {}, t = D.tasks[0];
    if (t) { const gm = J.game; for (let i = 0; i < 10 && gm.state === 'play'; i++) J.key('Digit' + gm.solve()); J.tick(1); out.task = { state: t.state, by: t.by, phase: G.phase }; }
    // 9) no tool at the spot: the job just runs (no game); a job that cannot start here never opens a game
    if (D.busy) D.busy = null; l.spot = 'any'; l.state = 'due'; D.setPlace(deck, l.room); const r = g.startJob(l); out.plain = { ok: r.ok, game: !!r.game, active: J.active, busy: D.busy?.loop === l };
    if (D.busy) D.busy = null; l.spot = 'console'; l.state = 'due'; D.setPlace(deck, 'nowhere'); const r2 = g.startJob(l); out.away = { ok: r2.ok, active: J.active };
    // 10) a phase change (death, lift) while a game is up closes it (cancel), never leaves the layer up
    D.setPlace(deck, l.room); g.startJob(l); G.phase = 'dying'; J.tick(0.1); out.phase = { active: J.active, stack: G.ui.stack.length }; G.phase = 'play';
    return out;
  });
  await page.evaluate(() => { __game.G.menus.lock = window.__jgLock; });
  const R = { ...r, ...r2, ...r3, ...r4, task: r4.task && { ...r3.task, ...r4.task } }; console.log('jobgames:', JSON.stringify(R));
  const chk = (c, m) => { if (!c) fail('jobgames browser: ' + m + ' ' + JSON.stringify(R)); };
  chk(R.first.ok && R.first.game && R.first.phase === 'intro' && R.first.layer && R.first.frozen && R.first.card && R.first.keys >= 3, 'first use shows the instruction card on a frozen world');
  chk(R.begun.phase === 'play' && R.begun.kind === 'sequence' && R.begun.learned && R.begun.stored, 'Enter begins; the tool is learned and persisted (fb_cfg)');
  chk(R.win.res === 'win' && R.win.closed && R.win.busy && R.win.q === 'proper' && Math.abs(R.win.total - Math.max(1.25, R.win.base * 0.5)) < 0.05, 'win: proper at half time, layer closed');
  chk(R.second.phase === 'play', 'instruction card shown only once per tool');
  chk(R.fail.res === 'fail' && R.fail.strikes === 3 && R.fail.busy && R.fail.q === 'rushed' && Math.abs(R.fail.total - R.fail.base) < 0.05, 'fail: the job still runs, rushed, normal time');
  chk(R.dial.phase === 'intro' && !R.dial.timeout.active && R.dial.timeout.q === 'rushed' && R.dial.timeout.why === 'time', 'a new tool gets its own card; doing nothing times out (no soft-lock)');
  chk(R.cal.kind === 'calibrate' && R.cal.limit === 24 && R.cal.res === 'win' && R.cal.q === 'proper', 'calibration hold-key game wins; calm gives +50 % time');
  chk(R.cb.good !== '#4fd06a' && !/#4fd06a|#ff5a48/.test(R.cb.leads) && R.cb.strikes === 1 && /sparks/.test(R.cb.caption), 'colour-blind palette + sound caption on a strike');
  chk(R.cancel.active === null && R.cancel.state === 'due' && !R.cancel.busy && R.cancel.stack === 0 && !R.cancel.frozen && /cancel/.test(R.cancel.log), 'Esc cancels: job still due, nothing performed, layer gone');
  chk(!R.task || (R.task.state === 'done' && R.task.by === 'proper'), 'mission task at a junction done properly through the game');
  chk(R.plain.ok && !R.plain.game && !R.plain.active && R.plain.busy, 'no tool at the spot: the job runs directly');
  chk(!R.away.ok && !R.away.active, 'a job that cannot start here opens no game');
  chk(!R.phase.active && R.phase.stack === 0, 'a phase change closes the game');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) { const errs = []; const r = await jobgameTests(m => errs.push(m)); console.log(errs.length ? errs.join('\n') : 'jobgames OK ' + JSON.stringify(r)); process.exit(errs.length ? 1 : 0); }
