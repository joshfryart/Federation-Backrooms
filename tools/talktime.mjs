// Talk start probe: what costs time between E on a crew member and the first frames of the zoom (js/talk.js, docs/talk.md).
//   node tools/talktime.mjs [--runs N] [--json out.json] [--seed N] [--ship i] [--quality high|low] [--frames N]
// Headless Chromium, software GL (SwiftShader): absolute numbers are slow, compare runs on one machine only (and before / after with `git stash`).
// The game is opened through the real loading path (no ?test=1: uniform prewarm, boarding compile, Talk.warm, portraits), Enter is clicked, a few seconds of
// real play let the first frames settle, then the probe switches to the test clock (G.manual) so every frame is driven and timed by hand:
//   frame = __game.advance(dt) (world / talk step) + menus.frame (UI, portraits) + __game.renderOnce() (cull + draw) + a 1-pixel readPixels (waits for the
//   GPU process: "sync"; "wall" = all of it, incl. the E key dispatch on the first frame).
// Cases, each from the deck as it is at that moment (a forced GC before E keeps a leftover major GC out of the measured frames):
//   near : the nearest crew member, the player put 1.3 m in front of them, three play frames (their face drawn up close), E.
//   fresh: a deck change (loadDeck + the lift's deckPrograms), the player put in front of the farthest crew member (not drawn up close yet), E.
//   again: a second talk with the nearest person (steady state).
//   real : the wall-clock loop (main.js frame(): governor, menus, portraits, render) with E dispatched between two frames: rAF CPU, ms since E, long tasks.
// Per case: E key handler ms with Talk method timings (begin / refresh / showUI / camera / ...), per-frame CPU (step / ui / render) and sync ms, new three.js
// programs (with material names), new textures, GL time in compile / link / status / texture upload, and FIRST DRAWS: (program, framebuffer) pairs drawn
// for the first time since the page opened (renderer.compile() builds programs only; ANGLE D3D11 / Metal / Vulkan build pipelines on the first real draw).
import { createServer } from 'node:http'; import { readFile, writeFile } from 'node:fs/promises'; import { createRequire } from 'node:module'; import { join, extname, dirname } from 'node:path'; import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url), ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); const { chromium } = require('playwright');
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const RUNS = +arg('runs', 1), OUT = arg('json', null), SEED = +arg('seed', 11), SHIP = +arg('ship', 0), QUALITY = arg('quality', 'high'), FRAMES = +arg('frames', 8);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.exr': 'application/octet-stream', '.hdr': 'application/octet-stream', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => { try { const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html')); const b = await readFile(p); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); } }).listen(0);
const port = server.address().port, results = [];

// in-page instrumentation: GL call timing (compile / link / status / texture upload), Talk method timing, long tasks
function instrument() {
  const g = __game, R = g.renderer, gl = R.getContext(), T = g.talk, st = window.__tt = { gl: {}, talk: {}, long: [] };
  const wrapGL = (name, bucket) => { const f = gl[name]; if (!f) return; gl[name] = function (...a) { const t0 = performance.now(); try { return f.apply(this, a); } finally { const b = st.gl[bucket] || (st.gl[bucket] = { n: 0, ms: 0 }); b.n++; b.ms += performance.now() - t0; } }; };
  for (const n of ['compileShader', 'linkProgram']) wrapGL(n, n);
  wrapGL('getProgramParameter', 'programStatus'); wrapGL('getShaderParameter', 'shaderStatus'); wrapGL('getProgramInfoLog', 'programStatus'); wrapGL('getShaderInfoLog', 'shaderStatus');
  for (const n of ['texImage2D', 'texSubImage2D', 'texStorage2D', 'compressedTexImage2D', 'texImage3D', 'texSubImage3D', 'generateMipmap']) wrapGL(n, 'texUpload');
  wrapGL('bufferData', 'bufferData'); wrapGL('bufferSubData', 'bufferData');
  st.first = window.__ttFirst;   // first-draw tracking is installed before the page's scripts (firstDraws below), so the boarding warm-up counts as seen
  const P = Object.getPrototypeOf(T);
  for (const m of ['begin', 'refresh', 'showUI', 'addLight', 'setupDof', 'ctxFor', 'lineCtx', 'renderWheel', 'renderPlate', 'renderRel', 'step', 'speaker', 'camera', 'occlude', 'meshRay', 'typeStep', 'sayNow', 'warmClose']) {
    const f = P[m]; if (typeof f !== 'function') continue;
    T[m] = function (...a) { const t0 = performance.now(); try { return f.apply(this, a); } finally { const b = st.talk[m] || (st.talk[m] = { n: 0, ms: 0 }); b.n++; b.ms += performance.now() - t0; } };
  }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) st.long.push(+e.duration.toFixed(0)); }).observe({ type: 'longtask', buffered: false }); } catch { }
  HTMLCanvasElement.prototype.requestPointerLock = function () { return Promise.resolve(); };   // headless: no real pointer lock
}

// first draws: (program, framebuffer) pairs drawn for the first time since the page opened. renderer.compile() only builds GLSL programs; drivers that build a
// pipeline per program + target (ANGLE D3D11 / Metal / Vulkan) do that on the first real draw, so a pair first drawn mid-talk is a stall on a real GPU even
// when no new three.js program appears. Installed on the WebGL2 prototype before any page script runs.
function firstDraws() {
  const P = WebGL2RenderingContext.prototype, seen = new WeakMap(), fbId = new WeakMap(); let curProg = null, curFb = null, nfb = 1; window.__ttFirst = [];
  const nameOf = (prog) => { const e = window.__game?.renderer?.info.programs.find(x => x.program === prog); return e ? (e.name || '?') : 'ext'; };
  const up = P.useProgram; P.useProgram = function (p) { curProg = p; return up.call(this, p); };
  const bf = P.bindFramebuffer; P.bindFramebuffer = function (t, fb) { if (t === this.FRAMEBUFFER || t === this.DRAW_FRAMEBUFFER) curFb = fb; return bf.call(this, t, fb); };
  for (const n of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) { const f = P[n]; if (!f) continue;
    P[n] = function (...a) { if (curProg) { let fi = 0; if (curFb) { fi = fbId.get(curFb); if (!fi) fbId.set(curFb, fi = nfb++); } let fs = seen.get(curProg); if (!fs) seen.set(curProg, fs = new Set()); if (!fs.has(fi)) { fs.add(fi); window.__ttFirst.push(nameOf(curProg) + '@fb' + fi); } } return f.apply(this, a); }; }
}

async function run(page, label, setup) {
  // setup (in page) places the player; returns { who, d } or { err }
  const s = await page.evaluate(setup); if (s.err) return { label, err: s.err };
  const frame = (talkKey) => page.evaluate((talkKey) => {
    const g = __game, G = g.G, R = g.renderer, gl = R.getContext(), st = __tt; st.gl = {}; st.talk = {}; st.long = []; st.first.length = 0;
    const pk = () => new Set(R.info.programs.map(p => p.cacheKey)), p0 = pk(), tex0 = R.info.memory.textures, geo0 = R.info.memory.geometries;
    const out = { phase0: G.phase };
    const t0 = performance.now();
    if (talkKey) { const kd = (c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true })), ku = (c) => window.dispatchEvent(new KeyboardEvent('keyup', { code: c, key: c, bubbles: true })); kd('KeyE'); ku('KeyE'); out.beginMs = +(performance.now() - t0).toFixed(1); out.entered = G.phase === 'talk'; out.speaker = g.talk.e?.person?.short; }
    const t1 = performance.now(); g.advance(1 / 30); const t1b = performance.now(); g.menus?.frame(1 / 30); const t2 = performance.now(); g.renderOnce(); const t3 = performance.now(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); const t4 = performance.now();
    Object.assign(out, { stepMs: +(t1b - t1).toFixed(1), uiMs: +(t2 - t1b).toFixed(1), portraitsRendered: G.portraits?.stats?.rendered, renderMs: +(t3 - t2).toFixed(1), syncMs: +(t4 - t3).toFixed(1), wallMs: +(t4 - t0).toFixed(1), k: +(g.talk.M.k || 0).toFixed(2), phase: G.phase });
    const nu = R.info.programs.filter(p => !p0.has(p.cacheKey)); out.newPrograms = nu.length; out.programs = R.info.programs.length; out.newTex = R.info.memory.textures - tex0; out.newGeo = R.info.memory.geometries - geo0;
    if (nu.length) out.newNames = nu.map(p => p.name || '?');
    out.gl = Object.fromEntries(Object.entries(st.gl).map(([k, v]) => [k, `${v.n}/${v.ms.toFixed(0)}ms`]));
    if (Object.keys(st.talk).length) out.talk = Object.fromEntries(Object.entries(st.talk).map(([k, v]) => [k, +v.ms.toFixed(1)]));
    out.calls = R.info.render.calls; out.firstDraws = st.first.length; if (st.first.length) out.firstNames = st.first.slice(0, 40);
    return out;
  }, talkKey);
  const base = []; for (let i = 0; i < 2; i++) base.push(await frame(false));
  await page.evaluate(() => window.gc?.());   // a major GC left over from the setup (a deck load) would otherwise land at a random point of the measured frames
  const frames = []; frames.push(await frame(true)); for (let i = 1; i < FRAMES; i++) frames.push(await frame(false));
  // leave and settle back into play so the next case starts clean
  await page.evaluate(() => { const g = __game; if (g.talk.active) g.talk.abort(); g.G.phase = 'play'; });
  for (let i = 0; i < 2; i++) await frame(false);
  const f0 = frames[0], sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  return { label, who: s.who, dist: s.d, baseWallMs: +(sum(base, f => f.wallMs) / base.length).toFixed(0), beginMs: f0.beginMs, firstFrameWallMs: f0.wallMs, entered: f0.entered,
    newProgramsTalk: sum(frames, f => f.newPrograms), firstDrawsTalk: sum(frames, f => f.firstDraws), firstDrawsBase: sum(base, f => f.firstDraws), newTexTalk: sum(frames, f => f.newTex), frames, base };
}

// player 1.3 m in front of e, looking at them (tools/test-talk.mjs stand())
const placeFn = `(g, e) => { const P = g.P, y0 = e.mesh.rotation.y; let px = e.x, pz = e.z; for (const da of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.5, -2.5, 3.14]) { px = e.x + Math.sin(y0 + da) * 1.3; pz = e.z + Math.cos(y0 + da) * 1.3; const [tx, ty] = g.world.tile(px, pz); if (!g.world.solid(tx, ty) && g.world.los(px, pz, e.x, e.z)) break; } P.x = px; P.z = pz; P.vx = P.vz = 0; P.yaw = Math.atan2(-(e.x - px), -(e.z - pz)); P.pitch = 0; }`;
const okCrew = `(e) => e.kind === 'crew' && e.person && !e.fake && e.mesh?.userData.human && e.mesh.visible && !e.walk && !e.repairing && e.turning === undefined`;

for (let r = 0; r < RUNS; r++) {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } }); page.setDefaultTimeout(900000);
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.addInitScript(firstDraws);
  await page.addInitScript(([seed, ship]) => { const t = setInterval(() => { if (window.__game?.G) { __game.G.forceSeed = seed; __game.G.forceShip = ship; clearInterval(t); } }, 5); }, [SEED, SHIP]);
  const t0 = Date.now();
  await page.goto(`http://localhost:${port}/index.html?brief=0`);
  await page.waitForFunction(() => { const b = document.getElementById('begin'); return b && !b.disabled; }, null, { polling: 100 });
  await page.evaluate((q) => { if (__game.CFG.quality !== q) __game.setQuality(q); }, QUALITY);
  await page.click('#begin');
  await page.waitForFunction(() => { const b = document.getElementById('boot-go'); return b && b.style.display !== 'none' && getComputedStyle(b).display !== 'none'; }, null, { polling: 100 });
  const board = await page.evaluate(() => { const m = {}; const ms = performance.getEntriesByType('mark'), s = ms.find(e => e.name === 'run:start')?.startTime ?? 0; let prev = s; for (const e of ms.filter(e => e.name.startsWith('run:'))) { m[e.name] = +((e.startTime - prev) / 1000).toFixed(2); prev = e.startTime; } return { phases: m, programs: __game.renderer.info.programs.length }; });
  await page.click('#boot-go');
  await page.evaluate(() => new Promise(r => setTimeout(r, 3000)));   // a few real frames (first-person view settles)
  const settled = await page.evaluate((q) => { const g = __game; g.G.manual = true; if (g.CFG.quality !== q) g.setQuality(q); return { programs: g.renderer.info.programs.length, quality: g.CFG.quality, phase: g.G.phase }; }, QUALITY);
  await page.evaluate(instrument);
  const cases = [];
  // near: someone already in view (a few metres, drawn in play with their face parts), stand in front, two play frames, E
  cases.push(await run(page, 'near', new Function(`return (() => { const g = __game, P = g.P; const ok = ${okCrew}; const place = ${placeFn};
    const c = g.ents.filter(ok).map(e => ({ e, d: Math.hypot(e.x - P.x, e.z - P.z) })).sort((a, b) => a.d - b.d); if (!c.length) return { err: 'no crew on the deck' };
    const e = c[0].e; place(g, e); for (let i = 0; i < 3; i++) { g.advance(1 / 30); g.renderOnce(); } return { who: e.person.short, d: +c[0].d.toFixed(1) }; })()`)));
  // fresh: deck change (the lift's loadDeck incl. deck prewarm), stand in front of someone not yet drawn, E on the next frame
  cases.push(await run(page, 'fresh', new Function(`return (() => { const g = __game, G = g.G, P = g.P; const ok = ${okCrew}; const place = ${placeFn};
    const n = (G.shipDeck ?? 0) + 2; const t0 = performance.now(); g.loadDeck(n); g.deckPrograms?.(); const ms = performance.now() - t0; G.phase = 'play';
    const c = g.ents.filter(ok).map(e => ({ e, d: Math.hypot(e.x - P.x, e.z - P.z) })).sort((a, b) => b.d - a.d); if (!c.length) return { err: 'no crew on deck ' + n };
    const e = c[0].e; place(g, e); g.advance(1 / 30); return { who: e.person.short + ' (deck ' + n + ', loadDeck ' + ms.toFixed(0) + ' ms)', d: +c[0].d.toFixed(1) }; })()`)));
  // second talk with the near person again: the steady-state cost of a talk once everything is compiled
  cases.push(await run(page, 'again', new Function(`return (() => { const g = __game, P = g.P; const ok = ${okCrew}; const place = ${placeFn};
    const c = g.ents.filter(ok).map(e => ({ e, d: Math.hypot(e.x - P.x, e.z - P.z) })).sort((a, b) => a.d - b.d); if (!c.length) return { err: 'no crew' };
    const e = c[0].e; place(g, e); for (let i = 0; i < 2; i++) { g.advance(1 / 30); g.renderOnce(); } return { who: e.person.short, d: +c[0].d.toFixed(1) }; })()`)));
  // real: the wall-clock loop (main.js frame(): governor, menus.frame, portraits, render) with E pressed from a key event between two frames, as a player would
  const real = await page.evaluate(new Function(`return (async () => { const g = __game, G = g.G, P = g.P; const ok = ${okCrew}; const place = ${placeFn};
    if (g.talk.active) g.talk.abort(); G.phase = 'play'; const c = g.ents.filter(ok).map(e => ({ e, d: Math.hypot(e.x - P.x, e.z - P.z) })).sort((a, b) => a.d - b.d); if (!c.length) return { err: 'no crew' };
    const e = c[0].e; place(g, e); G.manual = false; const ga = g.gov.auto; g.gov.auto = false;
    const raf = window.requestAnimationFrame.bind(window), cpu = [], stamps = [];
    window.requestAnimationFrame = (f) => raf((ts) => { const a = performance.now(); try { f(ts); } finally { cpu.push(+(performance.now() - a).toFixed(1)); stamps.push(+performance.now().toFixed(1)); } });
    const frames = (n) => new Promise(res => { let i = 0; const t = () => { if (++i >= n) res(); else raf(t); }; raf(t); });
    await frames(4); cpu.length = 0; stamps.length = 0; __tt.long = [];
    await frames(3); const base = cpu.slice(); cpu.length = 0; stamps.length = 0;
    const tE = performance.now(); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'KeyE', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', key: 'KeyE', bubbles: true })); const keyMs = performance.now() - tE;
    const ks = []; await new Promise(res => { const t = () => { ks.push(+(g.talk.M.k || 0).toFixed(2)); if (ks.length >= 8 || g.talk.M.k >= 0.3) res(); else raf(t); }; raf(t); });
    window.requestAnimationFrame = raf; g.gov.auto = ga; const out = { who: e.person.short, entered: G.phase === 'talk', keyMs: +keyMs.toFixed(1), baseCpu: base, cpu: cpu.slice(), sinceE: stamps.map(s => +(s - tE).toFixed(0)), k: ks, long: __tt.long.slice(), programs: g.renderer.info.programs.length };
    if (g.talk.active) g.talk.abort(); G.phase = 'play'; return out; })()`));
  console.log('\n== real (rAF loop)', JSON.stringify(real));
  const res = { run: r, wallS: (Date.now() - t0) / 1000, board, settled, cases, real };
  for (const c of cases) {
    if (c.err) { console.log(c.label, 'ERR', c.err); continue; }
    console.log(`\n== ${c.label}: ${c.who} (${c.dist} m)  entered=${c.entered}  base frame ${c.baseWallMs} ms  begin ${c.beginMs} ms  E->first frame ${c.firstFrameWallMs} ms  new programs ${c.newProgramsTalk}  first draws talk ${c.firstDrawsTalk} (base ${c.firstDrawsBase})  new textures ${c.newTexTalk}`);
    for (const f of c.frames) console.log('  ', JSON.stringify({ k: f.k, first: f.firstDraws, firstNames: f.firstNames, step: f.stepMs, ui: f.uiMs, pr: f.portraitsRendered, render: f.renderMs, sync: f.syncMs, wall: f.wallMs, prog: f.newPrograms, names: f.newNames, tex: f.newTex, gl: f.gl, talk: f.talk, calls: f.calls }));
  }
  console.log('\nboard', JSON.stringify(board), 'settled', JSON.stringify(settled));
  results.push(res); await browser.close();
}
if (OUT) await writeFile(OUT, JSON.stringify(results, null, 1));
server.close();
