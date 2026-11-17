// Job mini-games (js/minigames.js logic, js/minigames-ui.js layer, js/duty.js hook): node scoring tests + a browser section.   node tools/test-minigames.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

export async function miniTests(fail) {
  const M = await imp('js/minigames.js'), D = await imp('js/duty.js'), C = await imp('js/crew.js'), K = await imp('js/clock.js'), { SHIPS } = await imp('js/ships.js');
  const ck = (c, m) => { if (!c) fail('minigames: ' + m); return !!c; };
  const duties = JSON.parse(readFileSync(join(ROOT, 'assets/data/duties.json'), 'utf8')), src = readFileSync(join(ROOT, 'js/minigames.js'), 'utf8');
  ck(!/Math\.random|Date\.now|performance\.now|document|window/.test(src.replace(/\/\/.*$/gm, '')), 'js/minigames.js must stay pure (no Math.random / clock / DOM)');
  const STEPS = ['Open the log', 'Read the values', 'Compare', 'Adjust', 'Sign off'];
  // every game: a perfect run is proper at every difficulty, an idle run times out below the first-run bar, the same seed replays exactly
  for (const id of M.GAMES) {
    ck(M.INFO[id]?.title && M.INFO[id].keys.length && M.INFO[id].what && M.INFO[id].needs && M.INFO[id].proper, 'instruction card text for ' + id);
    for (const d of [0, 0.5, 1]) for (const first of [true, false]) {
      const o = { seed: 7 + d * 10, d, first, steps: STEPS }, r = M.autoplay(M.makeGame(id, o));
      ck(r.quality >= (id === 'crates' ? 0.6 : 0.9) && r.mistakes === 0, `${id} d=${d}: a bot playing well scores high (${JSON.stringify(r)})`);
      if (id !== 'crates') ck(M.outcomeOf(r, { first }) === 'proper', `${id} d=${d}: a perfect run is proper`);
      const g = M.makeGame(id, o); for (let i = 0; i < 2000 && !g.done; i++) g.step(0.1); const idle = g.result();
      ck(g.done && idle.timedOut && idle.quality < M.THRESH.first, `${id} d=${d}: idling times out and fails (${JSON.stringify(idle)})`);
      ck(JSON.stringify(M.autoplay(M.makeGame(id, o))) === JSON.stringify(r), `${id}: same seed, same game`);
    }
  }
  // game-specific scoring
  { const g = M.makeGame('wires', { seed: 3, d: 0 }); const i = 0, bad = (g.right.indexOf(g.left[0]) + 1) % g.n; g.input({ k: 'selR', i: 0 }); ck(g.mistakes === 0, 'wires: a right terminal before a left one is ignored'); g.input({ k: 'selL', i }); g.input({ k: 'selR', i: bad }); ck(g.mistakes === 1 && g.sel === -1, 'wires: a wrong pair is a mistake'); const r = M.autoplay(g); ck(r.mistakes === 1 && r.quality < 1 && r.quality > 0.7, 'wires: one wrong pair costs ~18%'); }
  { const g = M.makeGame('sequence', { seed: 3, d: 0, steps: STEPS }); const wrong = g.show.findIndex(x => x.i !== 0); g.input({ k: 'pick', i: wrong }); ck(g.mistakes === 1 && g.next === 0, 'sequence: wrong step counts and does not advance'); ck(g.order.join() === STEPS.slice(0, g.n).join(), 'sequence: the right order is the job order'); }
  { const g = M.makeGame('tune', { seed: 3, d: 0.5 }); g.input({ k: 'aim', x: 0, y: 0 }); if (g.strength() < 0.3) { g.input({ k: 'lock' }); ck(!g.done && g.mistakes === 1, 'tune: locking on nothing is refused'); } g.input({ k: 'aim', x: g.px, y: g.py }); g.hold.left = true; g.step(0.1); ck(g.x < g.px, 'tune: held arrows move the cursor'); }
  { const g = M.makeGame('crates', { seed: 3, d: 0.5 }); for (let i = 0; i < g.n; i++) g.input({ k: 'put', side: 'L' }); ck(g.done && g.result().quality < M.THRESH.first, 'crates: everything on one side tips the sled'); }
  { const g = M.makeGame('dose', { seed: 3, d: 0 }); g.input({ k: 'toggle' }); for (let i = 0; i < 400; i++) g.step(0.01); ck(g.mistakes === 1 && g.scores[0] === 0, 'dose: running past the top is an overdose'); }
  { const g = M.makeGame('dials', { seed: 3, d: 0.5 }); const m0 = g.mistakes; g.hold.right = true; for (let i = 0; i < 100; i++) g.step(0.05); ck(g.v[0] >= 0 && g.v[0] <= 1, 'dials: values stay in range'); void m0; }
  // difficulty: skill makes it easier, severity harder, the first job of a type teaches
  ck(M.difficulty({ skill: 1, severity: 0.3 }) < M.difficulty({ skill: 0.3, severity: 0.3 }), 'difficulty falls with skill');
  ck(M.difficulty({ skill: 0.5, severity: 0.8 }) > M.difficulty({ skill: 0.5, severity: 0.2 }), 'difficulty rises with severity');
  ck(Math.abs(M.difficulty({ skill: 0.5, severity: 0.5, first: true }) * 2 - M.difficulty({ skill: 0.5, severity: 0.5 })) < 1e-9, 'the first job is half as hard');
  ck(M.skillOf({ rank: 4, dept: 'engineering' }, 'engineering') > M.skillOf({ rank: 0, dept: 'services' }, 'engineering'), 'skill: rank and department');
  // result -> outcome
  const R = (q) => ({ id: 'wires', quality: q, secs: 9, mistakes: 0, timedOut: false });
  ck(M.outcomeOf(R(0.7)) === 'proper' && M.outcomeOf(R(0.69)) === 'rushed', 'proper from 0.70'); ck(M.outcomeOf(R(0.55), { first: true }) === 'proper' && M.outcomeOf(R(0.54), { first: true }) === 'rushed', 'first jobs: proper from 0.55');
  ck(M.outcomeOf(R(0)) === 'rushed', 'a bad game is rushed, never faked or skipped');
  ck(JSON.stringify(M.repairLevel(R(0.9))) === JSON.stringify({ hp: 1, outcome: 'proper', costPart: false, spark: false }), 'repair: proper -> full health');
  ck(M.repairLevel(R(0.5)).outcome === 'rushed' && M.repairLevel(R(0.5)).hp === 0.8, 'repair: middling -> a patch (0.8, nominal)');
  ck(M.repairLevel(R(0.1)).outcome === 'botched' && M.repairLevel(R(0.1)).costPart && M.repairLevel(R(0.1)).hp < 0.75, 'repair: bad -> botched (part lost, still degraded)');
  ck(M.repairLevel(R(0.1), { first: true }).outcome === 'rushed', 'repair: the first job never botches');
  // mapping: every duty loop and mission task gets a known game or none; the main engineering / ops / medical / cargo jobs each get a game that fits
  const seen = new Set(); let n = 0, withGame = 0;
  for (const b of Object.values(duties.billets)) { for (const l of b.loops) { n++; const g = M.gameFor({ kind: 'duty', ...l }); if (g) { withGame++; seen.add(g); ck(M.GAMES.includes(g), 'loop maps to a known game ' + l.id); } } for (const ts of Object.values(b.tasks)) for (const t of ts) { const g = M.gameFor({ kind: 'task', ...t }); if (g) { seen.add(g); ck(M.GAMES.includes(g), 'task maps to a known game'); } } }
  ck(M.GAMES.every(g => seen.has(g)), 'every game is used by some job: missing ' + M.GAMES.filter(g => !seen.has(g))); ck(withGame > n * 0.5 && withGame < n, `most (not all) rounds get a game (${withGame}/${n})`);
  ck(M.gameFor({ kind: 'repair', sys: 'eps', main: false }) === 'wires' && M.gameFor({ kind: 'repair', sys: 'reactor', main: true }) === 'dials' && M.gameFor({ kind: 'repair', sys: 'sensors', main: true }) === 'tune' && M.gameFor({ kind: 'repair', sys: 'computer', main: true }) === 'sequence', 'repair mapping');
  ck(M.gameFor({ kind: 'duty', spot: 'junction', sys: 'eps' }) === 'wires' && M.gameFor({ kind: 'duty', spot: 'biobed', sys: 'sickbay' }) === 'dose' && M.gameFor({ kind: 'duty', spot: 'locker', room: 'stores' }) === 'crates' && M.gameFor({ kind: 'duty', spot: 'console', sys: 'sensors' }) === 'tune' && M.gameFor({ kind: 'duty', spot: 'desk' }) === null && M.gameFor({ kind: 'duty', spot: 'corridor' }) === null, 'duty mapping by station');
  ck(M.stepsFor({ spot: 'console', steps: ['walk to the core', 'read temps', 'compare to the log', 'note drift'] }).length === 3 && M.stepsFor({ spot: 'console', steps: [] }).length === 5, 'sequence steps come from the job, minus the walking');
  // the Duty hook and complete()
  const ship = SHIPS[1], roster = C.makeComplement(ship, 5), clock = new K.ShipClock({ seed: 5 }); clock.assign(roster); const player = roster.people.find(p => p.billet === 'eps') || roster.people[3];
  const ss = new C.ShipState(ship, 5); ss.auto = false;
  const mk = () => { const d = new D.Duty({ player, roster, clock, duties, shipState: ss, seed: 5, mission: 'quiet_watch' }), l = { id: 'tl', label: 'Test rounds', room: 'engineering', spot: 'junction', sys: 'eps', every: 20, dur: 4, steps: [], q: { proper: [1, 0], rushed: [0.5, 1], skipped: [0, 3], faked: [0.1, 3] }, period: 300, next: 1e9, state: 'due', dueAt: 0, done: 0, last: null }; d.loops.push(l); d.tasks.push({ id: 'tt', task: 'Test task', room: 'engineering', spot: 'console', at_s: 0, state: 'active', by: null }); d.setPlace(1, 'engineering'); return d; };
  { const d = mk(); const r = d.perform('tl', 'proper'); ck(r.ok && !r.minigame && d.busy?.q === 'proper', 'no hook: perform is the plain timed round'); }
  { const d = mk(), offers = []; d.play = (j) => { offers.push(j.kind + ':' + j.id); return true; };
    const r = d.perform('tl', 'proper'); ck(r.ok && r.minigame && !d.busy && d.loop('tl').state === 'due' && offers[0] === 'duty:tl', 'hook: a proper round is handed to the mini-game and nothing starts');
    d.perform('tl', 'rushed'); ck(d.busy?.q === 'rushed' && offers.length === 1, 'hook: rushed / faked / skipped never open a game'); }
  { const d = mk(); d.play = () => true; ck(d.doTask('tt').minigame && d.tasks.find(t => t.id === 'tt').state === 'active', 'hook: a task is handed over too'); ck(d.doTask('tt', 'proper', { noGame: true, res: { id: 'tune', quality: 0.9, mistakes: 0 } }).ok && d.tasks.find(t => t.id === 'tt').state === 'done' && d.minis.length === 1, 'task result recorded'); }
  { const d = mk(); const r = d.complete('tl', 'proper', { id: 'wires', quality: 0.9, mistakes: 0 }); ck(r.ok && d.loop('tl').state === 'idle' && d.loop('tl').last === 'proper' && d.stats.proper === 1 && d.minis.length === 1, 'complete(proper) = the same as perform: ledger, stats, log');
    const e = mk(); e.complete('tl', 'rushed'); ck(e.stats.rushed === 1 && e.debt > 0, 'complete(rushed) costs the rushed debt'); const f = mk(); ck(!f.complete('tl', 'faked').ok && !f.complete('tl', 'skipped').ok, 'a game cannot end faked or skipped'); const w = mk(); w.setPlace(1, 'bridge'); ck(!w.complete('tl', 'proper').ok, 'complete needs the right room'); }
}

// ---- browser: the whole path in a live nominal run: card, game, result -> repair / duty outcome, Esc, blocked during an alert, remembered cards
export async function miniBrowser(page, fail) {
  const out = await page.evaluate(async () => {
    const g = __game, G = g.G, M = await import('./js/minigames.js'), o = {}, hide = () => document.querySelectorAll('.screen').forEach(s => s.classList.remove('show'));
    G.forceShip = 0; g.pace = 'standard'; g.newRun(); hide(); g.setQuality('low'); G.phase = 'play'; G.hp = G.maxHp = 1e6;
    const mini = g.mini, UI = G.menus.UI, D = g.duty, S = g.shipState; try { localStorage.removeItem('fb_mini_seen'); } catch (e) { /* ok */ } mini.seen.clear(); mini.enabled = true; mini.reset(); G.phases.enabled = false;
    const phase = () => { G.phase = 'play'; }, tick = (dt = 0.05, n = 1) => { for (let i = 0; i < n; i++) { phase(); mini.tick(dt); } }, frozen = () => ({ stack: UI.stack.map(l => l.kind).join(), pause: !!G.menuPause });
    const play = () => { if (mini.phase === 'intro') mini.key({ code: 'Enter' }); const r = M.autoplay(mini.game); tick(0.01); return r; };   // the bot plays the open game, the layer notices it is done
    const idleOut = () => { for (let i = 0; i < 1000 && mini.phase === 'play'; i++) tick(0.5); };
    // -- repair at a point that is faulted: card, game, full repair
    const rp = g.repairPts.find(r => !r.main) || g.repairPts[0], at = () => { g.P.x = rp.x; g.P.z = rp.z; g.P.vx = g.P.vz = 0; };
    S.auto = false; for (const s of C_SYSTEMS()) S.repair(s.id); function C_SYSTEMS() { return Object.keys(S.sys).map(id => ({ id })); }
    at(); S.damage(rp.sys, 0.5, { quiet: true }); o.before = S.status(rp.sys);
    o.avail = mini.available(); o.opened = g.miniRepair(rp); G.menus.sync(); o.intro = { phase: mini.phase, dom: !!document.getElementById('mini'), card: /What it is/.test(document.getElementById('mini')?.textContent || ''), ...frozen() };
    mini.key({ code: 'Enter' }); o.playing = mini.phase; o.seen = JSON.parse(localStorage.getItem('fb_mini_seen') || '[]'); o.game = mini.game.id;
    const r1 = play(); o.r1 = r1; o.res = { phase: mini.phase, hp: S.sys[rp.sys].hp, status: S.status(rp.sys), verdict: mini.verdict?.label }; mini.key({ code: 'Enter' }); o.closed = { phase: mini.phase, dom: !!document.getElementById('mini'), ...frozen() };
    // -- second time: no card (remembered), a bad game botches
    at(); S.damage(rp.sys, 0.5, { quiet: true }); mini.offer; g.miniRepair(rp); o.noCard = mini.phase; idleOut(); o.bad = { phase: mini.phase, hp: +S.sys[rp.sys].hp.toFixed(2), status: S.status(rp.sys), verdict: mini.verdict?.label, chain: D.chain.some(c => /botched/.test(c)) }; tick(0.5, 20); o.autoclose = !document.getElementById('mini') && !UI.stack.length;
    // -- Esc from a repair game: nothing changes, the plain hold is allowed at that point
    S.repair(rp.sys); S.damage(rp.sys, 0.5, { quiet: true }); at(); g.miniRepair(rp); const hp0 = S.sys[rp.sys].hp; o.escRepair = { esc: UI.escape(), phase: mini.phase, hp: S.sys[rp.sys].hp === hp0, hold: mini.holdFor === rp, ...frozen() }; o.holdOff = !g.miniRepair(rp);
    // -- a duty round: proper through the game, rushed through Esc
    const eng = G.shipDeck + 1; const loop = { id: 'tl', label: 'Test rounds', room: 'engineering', spot: 'junction', sys: 'eps', every: 20, dur: 4, steps: [], q: { proper: [1, 0], rushed: [0.5, 1], skipped: [0, 3], faked: [0.1, 3] }, period: 300, next: 1e9, state: 'due', dueAt: D.t, done: 0, last: null };
    D.loops.push(loop); D.setPlace(eng, 'engineering'); const pr = D.perform('tl', 'proper'); o.duty = { minigame: !!pr.minigame, busy: !!D.busy, phase: mini.phase, cardFirst: mini.phase === 'intro', game: mini.game?.id, ...frozen() };
    const dr = play(); o.duty.done = { last: loop.last, stats: D.stats.proper, minis: D.minis.length, q: dr.quality, verdict: mini.verdict?.label }; mini.key({ code: 'Enter' });
    loop.state = 'due'; loop.dueAt = D.t; D.perform('tl', 'proper'); o.duty.mode = mini.phase; UI.escape(); o.duty.esc = { busy: D.busy?.q, phase: mini.phase, ...frozen() }; D.busy = null; loop.state = 'idle';
    // -- a mission task
    D.tasks.push({ id: 'tt', task: 'Test task', room: 'engineering', spot: 'console', at_s: 0, state: 'active', by: null }); const tr = D.doTask('tt'); const tg = mini.game?.id; if (mini.phase === 'intro') mini.key({ code: 'Enter' }); M.autoplay(mini.game); tick(0.01); mini.key({ code: 'Enter' }); o.task = { minigame: !!tr.minigame, game: tg, state: D.tasks.find(t => t.id === 'tt').state, by: D.tasks.find(t => t.id === 'tt').by };
    // -- blocked during a red alert: the plain timed round / hold repair is used
    g.alerts.raise('red', { scope: 'ship', source: 'test' }); loop.state = 'due'; loop.dueAt = D.t; o.red = { avail: mini.available() }; const rr = D.perform('tl', 'proper'); o.red.plain = !rr.minigame && D.busy?.q === 'proper'; D.busy = null; loop.state = 'idle'; g.alerts.clear('red'); o.red.after = mini.available();
    // -- games that fit the job (a quick pass over every game in the real layer: draws, plays and closes without errors)
    o.each = []; for (const id of M.GAMES) { const job = { kind: 'task', id: 'x' + id, label: 'job', spot: id === 'wires' ? 'junction' : id === 'dials' ? 'warpcore' : id === 'tune' ? 'pad' : id === 'sequence' ? 'console' : id === 'crates' ? 'lift' : 'biobed', sys: id === 'dose' ? 'sickbay' : null, room: 'engineering', steps: [] }; const dummy = mini.c.apply; mini.c.apply = () => ({ label: 'ok', cls: 'good' }); mini.seen.add('g:' + id); mini.seen.add('s:' + job.spot); const op = mini.offer(job); o.each.push([id, op && mini.game.id, op && !!document.querySelector('#mini canvas')]); if (op) { mini.back(); mini.back(); if (mini.run) mini.teardown(); UI.stack.length = 0; } mini.c.apply = dummy; }
    return o;
  });
  console.log('minigames:', JSON.stringify(out));
  const o = out, ck = (c, m) => { if (!c) fail('minigames browser: ' + m); };
  ck(o.before !== 'nominal' && o.avail && o.opened, 'E at a faulted point opens a game ' + JSON.stringify([o.before, o.avail, o.opened]));
  ck(o.intro.phase === 'intro' && o.intro.dom && o.intro.card && /mini/.test(o.intro.stack) && o.intro.pause, 'the first time shows the instruction card in a layer, world paused ' + JSON.stringify(o.intro));
  ck(o.playing === 'play' && o.seen.some(k => /^g:/.test(k)) && o.seen.some(k => /^s:/.test(k)), 'Enter begins; the card is remembered in localStorage ' + JSON.stringify([o.playing, o.seen]));
  ck(o.r1.quality >= 0.9 && o.res.phase === 'result' && o.res.status === 'nominal' && o.res.hp === 1 && /Repaired/.test(o.res.verdict), 'a good game repairs fully ' + JSON.stringify(o.res));
  ck(o.closed.phase === 'none' && !o.closed.dom && !o.closed.pause && o.closed.stack === '', 'the result closes cleanly and the world runs again ' + JSON.stringify(o.closed));
  ck(o.noCard === 'play', 'second job of the type: no card'); ck(o.bad.phase === 'result' && o.bad.hp === 0.6 && o.bad.status === 'degraded' && /Botched/.test(o.bad.verdict) && o.bad.chain, 'a bad game botches the repair ' + JSON.stringify(o.bad)); ck(o.autoclose, 'the result card closes itself');
  ck(o.escRepair.esc === 'mini' && o.escRepair.phase === 'none' && o.escRepair.hp && o.escRepair.hold && o.escRepair.stack === '' && !o.escRepair.pause && o.holdOff, 'Esc steps away from a repair: nothing changes, hold-E allowed ' + JSON.stringify(o.escRepair));
  ck(o.duty.minigame && !o.duty.busy && o.duty.phase !== 'none' && /mini/.test(o.duty.stack) && o.duty.pause, 'a due duty opens a game, no timer ' + JSON.stringify(o.duty));
  ck(o.duty.done.last === 'proper' && o.duty.done.stats === 1 && o.duty.done.minis === 1, 'a good game is a proper round ' + JSON.stringify(o.duty.done));
  ck(o.duty.esc.busy === 'rushed' && o.duty.esc.phase === 'none' && o.duty.esc.stack === '' && !o.duty.esc.pause, 'Esc rushes the round ' + JSON.stringify(o.duty.esc));
  ck(o.task.minigame && o.task.game === 'sequence' && o.task.state === 'done' && o.task.by === 'proper', 'a mission task runs through its game ' + JSON.stringify(o.task));
  ck(o.red.avail === false && o.red.plain && o.red.after, 'during a red alert the plain way is used ' + JSON.stringify(o.red));
  ck(o.each.length === 6 && o.each.every(([id, got, dom]) => got === id && dom), 'every game opens in the real layer ' + JSON.stringify(o.each));
}
