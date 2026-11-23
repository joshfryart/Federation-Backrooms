// Job bot library: static server + Chromium + one real-game page per role/mission shift, and the in-page driver that plays one job end to end.
// Driver pattern = jobmoduleBrowser (tools/test-jobgames.mjs): test clock (G.manual, __game.step), teleport into the room, startJob, play the console
// game with gm.hint() -> J.key, or the room job with run.hint -> S.inputOverride. Used by tools/bot-jobs.mjs.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.exr': 'application/octet-stream', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
export const MISSIONS = ['quiet_watch', 'survey', 'cargo_run', 'medical_relief', 'shakedown'];
export const duties = () => JSON.parse(readFileSync(join(ROOT, 'assets/data/duties.json'), 'utf8'));
export const allBillets = () => Object.keys(duties().billets);

export function startServer(port = 0) {
  const server = createServer(async (req, res) => {
    try { const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html')); const b = await readFile(p); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); }
    catch { res.writeHead(404); res.end(); }
  });
  return new Promise((ok) => server.listen(port, () => ok({ server, port: server.address().port })));
}
export async function launch() {
  const { chromium } = require('playwright');
  return chromium.launch({ args: ['--use-gl=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc', '--autoplay-policy=no-user-gesture-required'] });
}

// Open one game page for a role's shift. ?billet= is the legacy force; ?role=&mission= is the new contract (ignored by older builds).
export async function openShift(browser, port, { role, mission, seed = 1, ship = null, viewport = { width: 640, height: 360 } }) {
  const errs = [];
  for (let attempt = 1; ; attempt++) {
    const page = await browser.newPage({ viewport }); page.setDefaultTimeout(120000); page.setDefaultNavigationTimeout(120000);
    await page.addInitScript((s) => { window.__seedRandom = (n) => { let a = n >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }; window.__seedRandom(s); }, seed);
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); }); page.on('crash', () => errs.push('renderer crashed'));
    try {
      await page.goto(`http://localhost:${port}/index.html?test=1&brief=0&billet=${role}&role=${role}&mission=${mission}`);
      await page.evaluate(async ({ ship }) => { await __game.ready; await __game.warmed; __game.setQuality('low'); __game.G.manual = true; if (ship != null) Object.defineProperty(__game.G, 'forceShip', { get: () => ship, set: () => { }, configurable: true }); }, { ship });
      const { installHelpers } = await import('./test-helpers.mjs'); await installHelpers(page);
      await page.evaluate(installBot);
      return { page, errs };
    } catch (e) { await page.close().catch(() => { }); if (attempt >= 2) throw e; }
  }
}

// ---------------- in-page driver (serialised into the page; no node closures) ----------------
function installBot() {
  const g = __game, G = g.G, J = g.jobgame, S = g.sites, CFG = g.CFG, P = g.P; let t = 0;
  const step = (n = 1) => { for (let i = 0; i < n; i++) { t += 1 / 30; g.step(1 / 30, t); } };
  const B = window.__bot = { cap: null, frames: 0 };
  const hide = () => document.querySelectorAll('.screen').forEach(s => s.classList.remove('show'));
  const D = () => g.duty, W = () => g.world;
  // capture what the job actually reports to the duty board (quality + the module's timeMul)
  const wrap = () => { const d = D(); if (d.__botWrapped) return; d.__botWrapped = true; for (const k of ['perform', 'doTask']) { const f = d[k].bind(d); d[k] = (id, q, o) => { B.cap = { fn: k, id, q, timeMul: o?.timeMul ?? null, faults: o?.game?.faults ?? o?.game?.strikes ?? null }; return f(id, q, o); }; } };
  B.setup = (want) => {
    g.newRun(); hide(); g.setQuality('low'); G.phase = 'play'; G.hp = G.maxHp = 1e6; CFG.learned = {}; CFG.calm = false; CFG.caps = true; CFG.cb = false;
    B.restore = __T.quiet(); G.menus.lock = () => null; document.exitPointerLock?.(); __T.hideEnemies?.(); step(2); wrap();
    const d = D(); let mission = want.mission, how = 'url';
    if (G.mission !== mission) {   // role UI / ?mission= not landed (or ignored): swap the mission's task board in by hand, as Duty's constructor builds it
      const T = d.pace?.T || 1; G.mission = d.mission = mission; how = 'patched';
      d.tasks = (d.d.tasks[mission] || []).map((x, i) => ({ ...x, billet: G.player.billet, jtype: 'task:' + mission, id: 't' + i, state: 'pending', at_s: Math.max(d.pace?.firstTask ?? 0, x.at * 60 * T), by: null }));
    }
    const items = [...d.loops.map(l => ({ kind: 'loop', id: l.id, label: l.label, room: l.room, spot: l.spot, at: 0 })), ...d.tasks.slice().sort((a, b) => a.at - b.at).map(x => ({ kind: 'task', id: x.id, label: x.task, room: x.room, spot: x.spot, at: x.at }))];
    return { billet: G.player.billet, mission: G.mission, how, roleApi: g.G.role ?? g.role ?? null, ship: G.ship?.name, runSeed: G.runSeed, items, deck: G.shipDeck + 1 };
  };
  const find = (it) => it.kind === 'task' ? D().tasks.find(x => x.id === it.id) : D().loop(it.id);
  const openTile = (r) => { const w = W(); let best = null, bd = 1e9; const cx = r.x + r.w / 2, cy = r.y + r.h / 2; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { const [wx, wz] = w.center(x, y); if (!__T.open(wx, wz, 0.3)) continue; const dd = Math.hypot(x - cx, y - cy); if (dd < bd) { bd = dd; best = [wx, wz]; } } return best; };
  // teleport into a room of this type (on this deck, else load the deck that has it); stand at the job's station prop when it has one
  const teleport = (type, spot) => {
    let rooms = W().d.rooms.filter(r => r.type === type);
    if (!rooms.length) { const idx = G.shipDecks.findIndex(s => s.data.rooms.some(r => r.type === type)); if (idx < 0) return { ok: false, why: 'no ' + type + ' room on this ship' };
      for (let n = 1; n <= (G.ship.decks || 12) + 2; n++) { g.loadDeck(n); if (G.shipDeck === idx) break; }
      if (G.shipDeck !== idx) return { ok: false, why: 'could not load deck of ' + type }; __T.hideEnemies?.(); rooms = W().d.rooms.filter(r => r.type === type); }
    rooms.sort((a, b) => b.w * b.h - a.w * a.h); const w = W();
    for (const r of rooms) {
      let pos = null;
      if (spot) { const ps = w.d.props.filter(p => p.kind === spot && p.tx >= r.x && p.tx < r.x + r.w && p.ty >= r.y && p.ty < r.y + r.h); for (const p of ps) { const [cx, cz] = w.center(p.tx, p.ty), o = __T.openSideOf(cx, cz, 1.2, 1.3); if (o) { pos = [o.x, o.z, Math.atan2(-(cx - o.x), -(cz - o.z))]; break; } } }
      pos = pos || openTile(r); if (!pos) continue;
      P.x = pos[0]; P.z = pos[1]; P.vx = P.vz = 0; P.kbx = P.kbz = 0; P.clung = 0; if (pos[2] != null) P.yaw = pos[2]; G.phase = 'play'; return { ok: true, deck: G.shipDeck + 1 };
    }
    return { ok: false, why: 'no open tile in ' + type };
  };
  const leaveRoom = () => { const f = __T.farFrom(P.x, P.z, 12); if (f) { P.x = f[0]; P.z = f[1]; P.vx = P.vz = 0; } };
  const sitesUp = () => !!(S.active || document.getElementById('wsite')?.classList.contains('on'));
  // make the job available, route (goJob), teleport in, let the arrival start it (else startJob), return what happened
  B.begin = (it, o = {}) => {
    const d = D(), r = { routed: false, started: false, notes: [] }; if (d.busy) d.busy = null; B.cap = null; if (J.active) J.cancel(); if (S.active) S.cancel?.('bot');
    G.phase = 'play'; G.hp = G.maxHp = 1e6; const x = find(it); if (!x) return { ...r, error: 'item gone' };
    if (it.kind === 'loop') { x.state = 'due'; x.dueAt = d.t; } else { if (x.state === 'done' || x.state === 'missed') { x.state = 'active'; x.by = null; r.notes.push('task re-armed'); } if (x.state === 'pending') { x.at_s = Math.min(x.at_s, d.t); x.state = 'active'; r.notes.push('opened early (pending until ' + Math.round(x.at_s) + 's)'); } }
    r.stateBefore = x.state; const job = g.jobFor({ ...x, label: x.label || x.task }); r.jtype = job?.type || null; r.host = job?.host || (job?.type === 'sites' ? 'room' : job ? 'console' : null); r.module = job?.mod ? { id: job.mod.id, title: job.mod.title } : null;
    // the shift's door: the board must offer it
    if (it.kind === 'loop') d.setPlace(G.shipDeck + 1, W().d.room?.[0]?.[0] || 'corridor');
    step(1); if (g.atJob(x)) { leaveRoom(); step(2); }
    const gj = g.goJob(x); r.routed = !!gj.routed; r.goJob = gj.ok ? (gj.routed ? 'routed' : 'started') : (gj.why || 'refused');
    const tp = teleport(it.room, it.spot); if (!tp.ok) return { ...r, error: tp.why };
    r.deck = tp.deck; step(3);
    const up = () => !!(J.active || sitesUp()); r.started = up();
    if (!r.started) { const sj = g.startJob(x, {}); r.notes.push('arrival did not start it; startJob: ' + JSON.stringify({ ok: sj.ok, why: sj.why })); step(2); r.started = up(); r.startedBy = 'startJob'; } else r.startedBy = 'arrival';
    r.host = J.active ? 'console' : sitesUp() ? 'room' : r.host; r.phase = J.phase || null;
    if (J.active && J.phase === 'intro') { J.key('Enter'); r.notes.push('card'); }
    r.game = J.game ? { id: J.game.id, limit: J.game.limit ?? null } : S.run ? { id: S.run.def?.id, n: S.run.sites?.length } : null; B.t0 = Date.now(); B.fr0 = t; return r;
  };
  // play to the end. Console: gm.hint() -> J.key. Room: run.hint -> S.inputOverride. Returns false when the cap hit.
  B.play = (o) => {
    const dl = Date.now() + o.capMs; let tout = false;
    if (J.active && J.game) { const gm = J.game; for (let i = 0; i < 4000 && gm.state === 'play'; i++) { for (const [c, dn] of gm.hint()) J.key(c, dn); J.tick(1 / 30); if ((i & 31) === 0 && Date.now() > dl) { tout = true; break; } } if (gm.state === 'play') tout = true; B.endState = gm.state; B.faults = gm.strikes ?? gm.faults ?? null; B.gameSec = gm.t ?? null; }
    else if (S.run) { const run = S.run; let f = 0; for (; f < 30 * 600 && S.run; f++) { const h = run.hint(run.next, f), nx = run.sites[run.next]; S.inputOverride = (!S.hasItem() && nx && nx.act !== 'fetch' && !run.carrying) ? { at: run.next, press: (f & 1) === 0, hold: true } : { ...h, hasItem: undefined }; step(1); if ((f & 15) === 0 && Date.now() > dl) { tout = true; break; } } S.inputOverride = null; B.faults = run.faults ?? null; B.gameSec = +(f / 30).toFixed(1); B.endState = S.run ? 'play' : (B.cap?.q === 'proper' ? 'win' : 'done'); }
    else { B.endState = 'none'; }
    return !tout;
  };
  B.finish = (it, started) => {
    const d = D(); if (J.active && J.phase === 'done') J.tick(1); else if (J.active) { J.cancel(); } S.inputOverride = null; step(2);
    const x = find(it), o = { wallMs: Date.now() - (B.t0 || Date.now()), endState: B.endState, faults: B.faults, gameSec: B.gameSec, timeMul: B.cap?.timeMul ?? null, performed: B.cap?.fn || null };
    o.quality = it.kind === 'task' ? (x.state === 'done' ? x.by : null) : (d.busy?.loop === x ? d.busy.q : null) ?? (B.cap?.q || null); o.cap = B.cap?.q || null;
    o.layerClosed = !J.active && !G.ui.has('jobgame') && !sitesUp(); o.dutyState = x.state; o.busy = d.busy?.loop === x;
    o.advanced = it.kind === 'task' ? x.state === 'done' : (x.state !== 'due' && x.state !== 'idle-never' && (d.busy?.loop === x || x.state === 'idle' && x.last != null || x.state === 'doing'));
    if (d.busy) d.busy = null; if (it.kind === 'loop' && x.state === 'doing') x.state = 'idle'; if (S.active) S.cancel?.('bot'); if (J.active) J.cancel(); G.jobGo = null;
    o.errors = []; return o;
  };
  B.stop = () => { try { B.restore?.(); } catch { } };
}

export const bot = {
  setup: (page, want) => page.evaluate((w) => __bot.setup(w), want),
  begin: (page, it, o) => page.evaluate(([i, op]) => __bot.begin(i, op), [it, o || {}]),
  play: (page, o) => page.evaluate((op) => __bot.play(op), o),
  finish: (page, it) => page.evaluate((i) => __bot.finish(i), it),
};

// category of a failing module: run the module validator (tools/check-jobs.mjs <module>) -> 'module' when it fails on its own, else 'integration'
const catCache = new Map();
export async function fileForJob(billet, label, type) { const K = await import(pathToFileURL(join(ROOT, 'js/jobs/kit.js')).href); return K.fileFor(billet, label, type); }
export async function moduleCheck(billet, label, type) {
  let f; try { f = await fileForJob(billet, label, type); } catch { return { category: 'integration', note: 'no kit' }; }
  const path = join(ROOT, 'js/jobs', f); if (catCache.has(path)) return catCache.get(path);
  let r; try { readFileSync(path); const p = spawnSync(process.execPath, [join(ROOT, 'tools/check-jobs.mjs'), path, '--seeds', '15'], { encoding: 'utf8', timeout: 120000 }); const out = (p.stdout || '') + (p.stderr || '');
    r = p.status === 0 ? { category: 'integration', file: f, note: 'check-jobs passes' } : { category: 'module', file: f, note: out.split('\n').filter(l => /✗|-/.test(l)).slice(0, 3).join(' | ') }; }
  catch { r = { category: 'no-module', file: f, note: 'no module file (shared mechanic)' }; }
  catCache.set(path, r); return r;
}

// One shift: setup, then every item in order. Returns { meta, tasks[] }.
export async function runShift(page, o) {
  const meta = await bot.setup(page, { mission: o.mission }), recs = [], todo = meta.items.filter(i => !o.task || i.id === o.task || i.label === o.task);
  const mk = (it) => ({ id: it.id, kind: it.kind, jtype: null, label: it.label, room: it.room, host: null, module: null, status: 'error', quality: null, faults: null, timeMul: null, gameSec: null, wallMs: 0, started: false, routed: false, layerClosed: null, dutyState: null, shots: [], notes: [], replay: o.replay(it) });
  const once = async (it, shotTag) => {
    const r = mk(it); const t0 = Date.now();
    try {
      const b = await bot.begin(page, it, { walk: o.walk }); Object.assign(r, { jtype: b.jtype, host: b.host, module: b.module?.id || null, routed: b.routed, started: b.started, deck: b.deck }); r.notes.push(...(b.notes || []), `goJob:${b.goJob}`, `startedBy:${b.startedBy}`); r.moduleTitle = b.module?.title;
      if (b.error) { r.status = 'skip'; r.notes.push(b.error); return r; }
      if (o.shots && b.started) r.shots[0] = await o.shot(page, it, shotTag + 'start');
      if (!b.started) { r.status = 'fail'; r.notes.push('job did not start'); await bot.finish(page, it); return r; }
      const ok = await bot.play(page, { capMs: o.capMs });
      if (o.shots) r.shots[1] = await o.shot(page, it, shotTag + 'end');
      const f = await bot.finish(page, it); Object.assign(r, { quality: f.quality, faults: f.faults, timeMul: f.timeMul, gameSec: f.gameSec, layerClosed: f.layerClosed, dutyState: f.dutyState, endState: f.endState, advanced: f.advanced });
      const win = f.endState === 'win' || (b.host === 'room' && f.cap === 'proper');
      if (!ok) { r.status = 'timeout'; r.notes.push('capped at ' + o.capMs + ' ms wall'); }
      else if (win && f.quality === 'proper' && f.layerClosed && f.advanced) r.status = 'pass';
      else { r.status = 'fail'; r.notes.push(`end=${f.endState} quality=${f.quality} closed=${f.layerClosed} advanced=${f.advanced}`); }
    } catch (e) { r.status = 'error'; r.notes.push(String(e.message || e).split('\n')[0]); }
    r.wallMs = Date.now() - t0; return r;
  };
  for (const it of todo) {
    let r = await once(it, '');
    if (!['pass', 'skip'].includes(r.status)) {   // triage: 3 re-runs (fresh job seeds) -> flaky or consistent; module validator -> category
      const reruns = []; for (let k = 0; k < 3; k++) reruns.push((await once(it, 'rerun' + k + '-')).status);
      r.reruns = reruns; r.flaky = reruns.some(s => s === 'pass') ? (reruns.every(s => s === 'pass') ? 'first-run-only' : 'flaky') : 'consistent';
      const jb = r.jtype === 'job' ? await moduleCheck(meta.billet, it.label, it.kind === 'loop' ? 'loop' : 'task:' + meta.mission) : { category: r.jtype ? 'integration' : 'no-job', note: r.jtype ? 'shared mechanic, not a module' : 'no job found' };
      r.category = jb.category; r.categoryNote = jb.note;
    }
    recs.push(r); if (o.log) o.log(r);
  }
  return { meta: { billet: meta.billet, mission: meta.mission, how: meta.how, ship: meta.ship, runSeed: meta.runSeed, items: meta.items.length }, tasks: recs };
}
export { mkdir, join, relative };
