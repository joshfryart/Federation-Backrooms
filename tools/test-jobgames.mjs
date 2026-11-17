// Job mini-games + first-use tool instructions (js/jobgames.js logic in node; js/jobgame-ui.js + js/main.js startJob in the browser).
//   node tools/test-jobgames.mjs            the node half
//   node tools/test.mjs --only jobgames     the browser half (nominal page, test clock)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

// play a game to the end: 'win' plays it right (game.hint()), 'strike' makes wrong moves (game.bad(); nothing when no wrong move exists, so the
// timer runs out), 'idle' does nothing (the timer runs out)
export function autoPlay(g, how = 'win', dt = 1 / 30, maxT = 60) {
  for (let t = 0; g.state === 'play' && t < maxT; t += dt) {
    if (how === 'win') { for (const [code, down] of g.hint()) g.key(code, down); }
    else if (how === 'strike') { const b = g.bad(); if (b) g.key(b, true); }
    g.tick(dt);
  }
  return g.result();
}
// which department each room belongs to (each department must have a game of its own: KINDS[kind].dept)
export const DEPT_ROOMS = { medical: ['sickbay'], engineering: ['engineering', 'plant', 'workshop'], science: ['lab'], security: ['brig', 'armory'], galley: ['mess', 'arboretum'], cargo: ['cargo', 'stores'], bridge: ['bridge', 'readyroom'] };
export const MAX_SHARE = 0.25;
// one label per themed kind (OVERRIDES: the same game whatever the room): the browser block plays each through startJob
export const KIND_LABELS = { vitals: 'Crew health screening', hypo: 'Dispense meds and update patient list', tray: 'Sterilise instruments and surgical bay', meds: 'Pharmacy and controlled meds count', counsel: 'Scheduled counselling sessions',
  power: 'Balance grid load against reactor output', bench: 'Coil wear check and swap', tune: 'Scan subspace bands for signals', classify: 'Lifeform scanner spot check', badge: 'Issue and returns desk', doorlog: 'Audit the program archive',
  cook: 'Captain\'s refreshment and comfort', nutrient: 'Hydroponics O2 balance', fresh: 'Watch temperature and humidity of stores', manifest: 'Count and verify cargo against manifest', loadbal: 'Move cargo sleds',
  course: 'Plot orbit and transporter-range hold', decode: 'Monitor hails and ship traffic' };

// per-kind counts over every duty loop + mission task (also printed by tools/test.mjs): { total, kinds, share, missing, byRoom }
export function coverageReport(J, duties) {
  const c = J.coverage(duties), rows = Object.entries(c.kinds).sort((a, b) => b[1] - a[1]);
  return { ...c, table: rows.map(([k, n]) => `${k.padEnd(10)} ${String(n).padStart(4)}  ${(100 * n / c.total).toFixed(1).padStart(5)} %`).join('\n') };
}

export async function jobgameTests(fail) {
  const J = await imp('js/jobgames.js'), ck = (c, m) => { if (!c) fail('jobgames: ' + m); return !!c; };
  const duties = JSON.parse(readFileSync(join(ROOT, 'assets/data/duties.json'), 'utf8'));
  const out = { wins: 0, fails: 0, kinds: {} };
  // coverage: every loop and every mission task resolves to a game; no kind over MAX_SHARE; every department has a game of its own
  const cov = coverageReport(J, duties); out.coverage = { total: cov.total, share: +cov.share.toFixed(3), kinds: cov.kinds };
  console.log(`job mini-game coverage (${cov.total} duty loops + mission tasks, max share ${(cov.share * 100).toFixed(1)} %, limit ${MAX_SHARE * 100} %):\n${cov.table}`);
  ck(cov.total > 600 && !cov.missing.length, `every duty loop and mission task has a game (${cov.total}); missing: ${cov.missing.slice(0, 8).join(' | ')}`);
  ck(cov.share <= MAX_SHARE, `no kind over ${MAX_SHARE * 100} % of all jobs: ${cov.table}`);
  let tasks = 0; for (const b of Object.values(duties.billets)) for (const ts of Object.values(b.tasks)) for (const t of ts) { tasks++; const g = J.gameFor({ ...t, label: t.task }); ck(g && J.KINDS[g.kind], 'mission task has a game: ' + t.task); }
  ck(tasks > 400, 'mission tasks counted: ' + tasks);
  for (const [dept, rooms] of Object.entries(DEPT_ROOMS)) { const own = new Set(); for (const r of rooms) for (const k of cov.byRoom[r] || []) if (J.KINDS[k].dept === dept) own.add(k); ck(own.size >= 1, `${dept} has a game of its own: ${[...own]}`); }
  for (const [kind, label] of Object.entries(KIND_LABELS)) ck(J.gameFor({ label, spot: 'console', room: 'bridge' })?.kind === kind, `label "${label}" plays ${kind}`);
  ck(J.gameFor({ label: 'Ward rounds', spot: 'biobed', room: 'sickbay', sys: 'sickbay' }).kind === 'vitals' && J.gameFor({ label: 'Work the ops board', spot: 'console', room: 'bridge' }).kind === 'sequence', 'a ward round reads monitors; an ops board is still a console');
  ck(J.gameFor({ label: 'Anything', spot: 'any' }) === null, 'a place, not a station: no game');
  for (const t of Object.values(J.TOOLS)) ck(J.KINDS[t.kind] && t.name && t.how && t.keys.length, 'tool has kind / name / how / keys: ' + t.id);
  for (const kind of Object.keys(J.KINDS)) {
    const themes = [...new Set(Object.values(J.TOOLS).filter(t => t.kind === kind).map(t => t.theme || null))];
    for (let seed = 1; seed <= 25; seed++) {
      const theme = themes[seed % themes.length] || null;
      for (const calm of [false, true]) {
        const g = J.createGame(kind, seed, { calm, theme }), r = autoPlay(g, 'win'); ck(r.state === 'win', `${kind} seed ${seed}${calm ? ' calm' : ''} winnable by playing it right: ${JSON.stringify(r)} ${JSON.stringify(g.view())}`);
        ck(r.t <= g.limit * 0.85, `${kind} seed ${seed} played right ends well inside the time limit (${r.t} / ${g.limit})`);
        if (r.state === 'win') out.wins++; const o = J.outcome(g); ck(o.quality === 'proper' && o.timeMul < 1, `${kind} win -> proper, faster`);
        out.kinds[kind] = Math.max(out.kinds[kind] || 0, +r.t.toFixed(1));
      }
      const f = J.createGame(kind, seed, { theme }); const r2 = autoPlay(f, 'strike'); ck(r2.state === 'fail', `${kind} seed ${seed} fails on bad play: ${JSON.stringify(r2)}`);
      if (r2.state === 'fail') out.fails++; ck(J.outcome(f).quality === 'rushed' && J.outcome(f).timeMul === 1, `${kind} fail -> rushed (the job still gets done)`);
      const idle = J.createGame(kind, seed, { theme }); autoPlay(idle, 'idle', 0.25, 200); ck(idle.state === 'fail' && (idle.why === 'time' || kind === 'cook') && idle.t <= idle.limit + 0.3, `${kind} always ends by itself (timer): ${idle.state} ${idle.why} ${idle.t}`);
      ck(idle.limit >= 14 && idle.limit <= 24, `${kind} limit within the 10-20 s design (+ reading time): ${idle.limit}`);
    }
    // a wrong key strikes (when one exists); keys outside the game are ignored
    { const g = J.createGame(kind, 5); const b = g.bad(); if (b) { g.key(b, true); ck(g.strikes === 1 || !g.maxStrikes, `${kind} a wrong move is a strike`); } ck(!g.key('KeyJ') && !g.key('Escape') && !g.key('KeyQ'), `${kind} ignores the menu keys`); }
    // deterministic per seed, different across seeds; calm gives more time; cancel is not an outcome
    const a = J.createGame(kind, 9), b = J.createGame(kind, 9); ck(JSON.stringify(a.view()) === JSON.stringify(b.view()), kind + ' same seed, same puzzle');
    if (!['calibrate', 'dial'].includes(kind)) { const views = new Set(Array.from({ length: 6 }, (_, i) => JSON.stringify(J.createGame(kind, 100 + i).view()))); ck(views.size >= 4, kind + ' different seeds, different content: ' + views.size); }
    ck(J.createGame(kind, 3, { calm: true }).limit === J.createGame(kind, 3).limit * 1.5, kind + ' calm: +50 % time');
    const c = J.createGame(kind, 4); c.cancel(); ck(c.state === 'cancel' && J.outcome(c) === null, kind + ' cancel has no outcome'); c.tick(100); ck(c.state === 'cancel', kind + ' a cancelled game stays cancelled'); ck(!c.key(c.bad() || 'Digit1', true) || c.strikes === 0, kind + ' a cancelled game takes no strikes');
    ck(J.rushNote({ kind }, 3).length > 5, kind + ' has a rushed line');
  }
  // a clean win is faster than a win with a fault
  { const g = J.createGame('sequence', 2); g.key('Digit' + (g.solve() % 4 + 1)); autoPlay(g, 'win'); const o = J.outcome(g); ck(g.state === 'win' && !o.perfect && o.timeMul === 0.6, 'win with a strike: 0.6 time'); }
  { const g = J.createGame('sequence', 2); ck(!g.key('KeyJ') && !g.key('Escape') && g.strikes === 0, 'keys outside the game are ignored (no strike)'); }
  // content sanity: vitals has exactly one bed out of range; meds answer is the real count; badge deny reasons are real
  { const VR = { HR: [60, 100], SpO2: [95, 100], Temp: [36.1, 37.5], BP: [100, 140] }; for (let s = 1; s < 40; s++) { const g = J.createGame('vitals', s); const outBeds = g.cur.beds.map((b, i) => Object.entries(b.v).some(([k, v]) => v < VR[k][0] || v > VR[k][1]) ? i : -1).filter(i => i >= 0); ck(outBeds.length === 1 && outBeds[0] === g.cur.answer, `vitals seed ${s}: exactly the answer bed is out of range ${outBeds}`); } }
  for (let s = 1; s < 40; s++) { const g = J.createGame('meds', s); ck(g.cur.vials.filter(v => v.drug === 0).length === g.cur.answer + 1 && g.cur.count <= 9, 'meds: the answer is the count in the drawer'); }
  for (let s = 1; s < 40; s++) { const g = J.createGame('badge', s), r = g.cur, R = g.rule, ok = R.depts.includes(r.dept) && r.clear >= R.min && !r.expired; ck((r.answer === 0) === ok, `badge seed ${s}: admit iff the rule allows`); }
  for (let s = 1; s < 40; s++) { const g = J.createGame('doorlog', s), r = g.cur, bad = r.lines.map((L, i) => L.door === r.restricted && !r.ok.includes(L.who) ? i : -1).filter(i => i >= 0); ck(bad.length === 1 && bad[0] === r.answer, `doorlog seed ${s}: exactly one unauthorised entry`); }
  for (let s = 1; s < 40; s++) { const g = J.createGame('fresh', s), r = g.cur, bad = r.items.map((it, i) => it.day < r.today ? i : -1).filter(i => i >= 0); ck(bad.length === 1 && bad[0] === r.answer, `fresh seed ${s}: exactly one expired item`); }
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
    const due = (spot, label = 'Work the ops board') => { if (D.busy) D.busy = null; l.spot = spot; l.label = label; l.sys = ''; l.state = 'due'; l.dueAt = D.t; D.setPlace(deck, l.room); };
    const play = (how) => { const gm = J.game; for (let i = 0; i < 2000 && gm.state === 'play'; i++) { if (how === 'win') { for (const [c, d] of gm.hint()) J.key(c, d); } else if (how === 'strike') { const b = gm.bad(); if (b) J.key(b); } J.tick(1 / 30); } J.tick(1); return gm.result(); };
    // 1) first use of the console: the instruction card, the layer is up and the world is frozen
    due('console'); const r1 = g.startJob(l); out.first = { ok: r1.ok, game: !!r1.game, phase: J.phase, layer: G.ui.has('jobgame'), frozen: G.menuPause, card: /New tool/.test(document.getElementById('jobgame')?.textContent || ''), keys: document.querySelectorAll('#jobgame kbd').length };
    return out;
  });
  // the real keyboard path: Enter through the menus router begins the game (learned + persisted)
  await press(page, 'Enter');
  const r2 = await page.evaluate(() => {
    const g = __game, G = g.G, CFG = g.CFG, J = g.jobgame, out = {}, D = g.duty, l = D.loops[0], deck = G.shipDeck + 1;
    const base = (q) => Math.max(2.5, l.dur * (10 / 3) * l.q[q][0] * 1.2 * (g.pace.performMul ?? 1));
    const due = (spot, label = 'Work the ops board') => { if (D.busy) D.busy = null; l.spot = spot; l.label = label; l.sys = ''; l.state = 'due'; l.dueAt = D.t; D.setPlace(deck, l.room); };
    const play = (how) => { const gm = J.game; for (let i = 0; i < 2000 && gm.state === 'play'; i++) { if (how === 'win') { for (const [c, d] of gm.hint()) J.key(c, d); } else if (how === 'strike') { const b = gm.bad(); if (b) J.key(b); } J.tick(1 / 30); } J.tick(1); return gm.result(); };
    out.begun = { phase: J.phase, kind: J.game?.kind, learned: !!CFG.learned?.console, stored: !!JSON.parse(localStorage.getItem('fb_cfg') || '{}').learned?.console };
    // 2) win: the job runs properly, at half time (clean), the layer is gone
    const w = play('win'); out.win = { res: w.state, closed: !J.active && !G.ui.has('jobgame'), busy: D.busy?.loop === l, q: D.busy?.q, total: +(D.busy?.total || 0).toFixed(2), base: +base('proper').toFixed(2) };
    // 3) second use of the same tool: no card; a fumbled game still does the job, rushed
    due('console'); g.startJob(l); out.second = { phase: J.phase }; const f = play('strike'); out.fail = { res: f.state, strikes: f.strikes, busy: D.busy?.loop === l, q: D.busy?.q, total: +(D.busy?.total || 0).toFixed(2), base: +base('rushed').toFixed(2) };
    // 4) another tool kind (warp core valve): its own card; idle play runs out of time -> rushed, never stuck
    due('warpcore', 'Core temperature and injector rounds'); g.startJob(l); out.dial = { phase: J.phase }; J.key('Enter'); let n = 0; while (J.active && n++ < 30 * 40) J.tick(1 / 30); out.dial.timeout = { active: J.active, q: D.busy?.q, frames: n, why: J.game?.why };
    // 5) calibration (biobed): hold-key game wins; calm visuals give 50 % more time
    CFG.calm = true; due('console', 'Test emergency medical systems'); g.startJob(l); J.key('Enter'); out.cal = { limit: J.game.limit, kind: J.game.kind }; const c = play('win'); out.cal.res = c.state; out.cal.q = D.busy?.q; CFG.calm = false;
    // 6) colour-blind palette + captions: a strike leaves a caption line
    CFG.cb = true; CFG.caps = true; due('junction', 'Routine junction round'); g.startJob(l); J.key('Enter'); out.cb = { good: J.palette.good, leads: J.palette.wires.join(',') }; const gm = J.game; J.key('Digit' + (gm.solve() % 4 + 1)); out.cb.caption = [...document.querySelectorAll('#caps div')].map(d => d.textContent).join('|'); out.cb.strikes = gm.strikes;
    return out;
  });
  // 7) Esc through the real keyboard router: cancel; the job stays due, nothing performed, the layer stack is empty
  await press(page, 'Escape');
  const r3 = await page.evaluate(() => {
    const g = __game, G = g.G, CFG = g.CFG, J = g.jobgame, D = g.duty, l = D.loops[0], deck = G.shipDeck + 1, out = {};
    out.cancel = { active: J.active, state: l.state, busy: !!D.busy, stack: G.ui.stack.length, frozen: G.menuPause, log: J.log.slice(-1)[0] };
    CFG.cb = false; CFG.caps = false;
    // 8) a mission task at a junction 
    const t = D.tasks[0]; if (t) { t.state = 'active'; t.spot = 'junction'; t.task = 'Routine junction round'; D.setPlace(deck, t.room); const rt = g.startJob({ ...t, label: t.task }); out.task = { game: !!rt.game }; }
    return out;
  });
  const r4 = await page.evaluate(() => {
    const g = __game, G = g.G, J = g.jobgame, D = g.duty, l = D.loops[0], deck = G.shipDeck + 1, out = {}, t = D.tasks[0];
    if (t) { const gm = J.game; for (let i = 0; i < 2000 && gm.state === 'play'; i++) { for (const [c, d] of gm.hint()) J.key(c, d); J.tick(1 / 30); } J.tick(1); out.task = { state: t.state, by: t.by, phase: G.phase }; }
    // 9) no tool at the spot: the job just runs (no game); a job that cannot start here never opens a game
    if (D.busy) D.busy = null; l.spot = 'any'; l.label = 'Walk about'; l.state = 'due'; D.setPlace(deck, l.room); const r = g.startJob(l); out.plain = { ok: r.ok, game: !!r.game, active: J.active, busy: D.busy?.loop === l };
    if (D.busy) D.busy = null; l.spot = 'console'; l.state = 'due'; D.setPlace(deck, 'nowhere'); const r2 = g.startJob(l); out.away = { ok: r2.ok, active: J.active };
    // 10) a phase change (death, lift) while a game is up closes it (cancel), never leaves the layer up
    D.setPlace(deck, l.room); g.startJob(l); G.phase = 'dying'; J.tick(0.1); out.phase = { active: J.active, stack: G.ui.stack.length }; G.phase = 'play';
    return out;
  });
  // 11) every themed kind through startJob: its own card once, win -> proper, fail -> rushed, Esc -> still due; a mission task plays its game too;
  //     rushing never opens a game (one key, one line about the corner cut). Captions + colour-blind on for a strike caption per kind.
  const r5 = await page.evaluate((LABELS) => {
    const g = __game, G = g.G, CFG = g.CFG, J = g.jobgame, D = g.duty, l = D.loops[0], deck = G.shipDeck + 1, out = { kinds: {} };
    const due = (label) => { if (D.busy) D.busy = null; l.spot = 'console'; l.label = label; l.sys = ''; l.state = 'due'; l.dueAt = D.t; D.setPlace(deck, l.room); };
    const run = (how) => { const gm = J.game; if (!gm) return null; for (let i = 0; i < 2000 && gm.state === 'play'; i++) { if (how === 'win') { for (const [c, d] of gm.hint()) J.key(c, d); } else { const b = gm.bad(); if (b) J.key(b); } J.tick(1 / 30); } J.tick(1); return gm.result(); };
    CFG.caps = true; CFG.cb = true;
    for (const [kind, label] of Object.entries(LABELS)) {
      const o = out.kinds[kind] = {};
      due(label); g.startJob(l); o.card = J.phase === 'intro' && /New tool/.test(document.getElementById('jobgame')?.textContent || ''); J.key('Enter'); o.kind = J.game?.kind; o.canvas = !!document.querySelector('#jobgame canvas'); o.btns = document.querySelectorAll('#jobgame [data-k]').length;
      J.tick(1 / 30); const w = run('win'); o.win = w?.state; o.q = D.busy?.q; o.closed = !J.active && !G.ui.has('jobgame');
      due(label); g.startJob(l); o.again = J.phase; const f = run('fail'); o.fail = f?.state; o.fq = D.busy?.q; o.fclosed = !J.active;
      due(label); g.startJob(l); const b = J.game?.bad(); if (b) J.key(b); o.caption = [...document.querySelectorAll('#caps div')].map(d => d.textContent).slice(-1)[0] || ''; J.cancel(); o.cancel = { state: l.state, busy: !!D.busy, layer: G.ui.has('jobgame') };
    }
    // a mission task with a themed game
    const t = D.tasks[0]; if (t) { if (D.busy) D.busy = null; t.state = 'active'; t.spot = 'biobed'; t.task = 'Counsel the evacuees on arrival'; D.setPlace(deck, t.room); const rt = g.startJob({ ...t, label: t.task }); out.task = { game: !!rt.game, kind: J.game?.kind ?? (J.phase === 'intro' ? 'intro' : null) }; if (J.phase === 'intro') J.key('Enter'); out.task.kind2 = J.game?.kind; run('win'); out.task.state = t.state; out.task.by = t.by; }
    // rushed: no game, one line
    due(LABELS.vitals); const before = J.active; const rr = D.perform(l.id, 'rushed'); out.rushed = { ok: rr.ok, game: !!J.active || !!before, q: D.busy?.q };
    CFG.caps = false; CFG.cb = false; if (D.busy) D.busy = null;
    return out;
  }, KIND_LABELS);
  await page.evaluate(() => { __game.G.menus.lock = window.__jgLock; });
  const R = { ...r, ...r2, ...r3, ...r4, task: r4.task && { ...r3.task, ...r4.task }, themed: r5 }; console.log('jobgames:', JSON.stringify(R));
  const chk = (c, m) => { if (!c) fail('jobgames browser: ' + m + ' ' + JSON.stringify(R)); };
  chk(R.first.ok && R.first.game && R.first.phase === 'intro' && R.first.layer && R.first.frozen && R.first.card && R.first.keys >= 3, 'first use shows the instruction card on a frozen world');
  chk(R.begun.phase === 'play' && R.begun.kind === 'sequence' && R.begun.learned && R.begun.stored, 'Enter begins; the tool is learned and persisted (fb_cfg)');
  chk(R.win.res === 'win' && R.win.closed && R.win.busy && R.win.q === 'proper' && Math.abs(R.win.total - Math.max(1.25, R.win.base * 0.5)) < 0.05, 'win: proper at half time, layer closed');
  chk(R.second.phase === 'play', 'instruction card shown only once per tool');
  chk(R.fail.res === 'fail' && R.fail.strikes === 3 && R.fail.busy && R.fail.q === 'rushed' && Math.abs(R.fail.total - R.fail.base) < 0.05, 'fail: the job still runs, rushed, normal time');
  chk(R.dial.phase === 'intro' && !R.dial.timeout.active && R.dial.timeout.q === 'rushed' && R.dial.timeout.why === 'time', 'a new tool gets its own card; doing nothing times out (no soft-lock)');
  chk(R.cal.kind === 'calibrate' && R.cal.limit === 24 && R.cal.res === 'win' && R.cal.q === 'proper', 'calibration hold-key game (medical hologram) wins; calm gives +50 % time');
  chk(R.cb.good !== '#4fd06a' && !/#4fd06a|#ff5a48/.test(R.cb.leads) && R.cb.strikes === 1 && /sparks/.test(R.cb.caption), 'colour-blind palette + sound caption on a strike');
  chk(R.cancel.active === null && R.cancel.state === 'due' && !R.cancel.busy && R.cancel.stack === 0 && !R.cancel.frozen && /cancel/.test(R.cancel.log), 'Esc cancels: job still due, nothing performed, layer gone');
  chk(!R.task || (R.task.state === 'done' && R.task.by === 'proper'), 'mission task at a junction done properly through the game');
  chk(R.plain.ok && !R.plain.game && !R.plain.active && R.plain.busy, 'no tool at the spot: the job runs directly');
  chk(!R.away.ok && !R.away.active, 'a job that cannot start here opens no game');
  chk(!R.phase.active && R.phase.stack === 0, 'a phase change closes the game');
  for (const [kind, o] of Object.entries(R.themed.kinds)) {
    chk(o.card && o.kind === kind && o.canvas && o.btns >= 2, `${kind}: its own instruction card, then its game with on-screen buttons`);
    chk(o.win === 'win' && o.q === 'proper' && o.closed, `${kind}: win -> proper, layer closed`);
    chk(o.again === 'play' && o.fail === 'fail' && o.fq === 'rushed' && o.fclosed, `${kind}: second time no card; fail -> rushed, never stuck`);
    chk(o.cancel.state === 'due' && !o.cancel.busy && !o.cancel.layer, `${kind}: cancel -> still due, nothing performed`);
  }
  chk(!R.themed.task || (R.themed.task.game && R.themed.task.kind2 === 'counsel' && R.themed.task.state === 'done' && R.themed.task.by === 'proper'), 'mission task plays its themed game (counsel) and is done properly');
  chk(R.themed.rushed.ok && !R.themed.rushed.game && R.themed.rushed.q === 'rushed', 'rushing opens no game');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) { const errs = []; const r = await jobgameTests(m => errs.push(m)); console.log(errs.length ? errs.join('\n') : 'jobgames OK ' + JSON.stringify(r)); process.exit(errs.length ? 1 : 0); }
