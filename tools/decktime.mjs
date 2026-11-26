// Deck change probe: what the frames around a tubelift arrival cost (js/main.js liftStep -> loadDeck + deckPrograms), docs in TODO.md "Deck change stall".
//   node tools/decktime.mjs [--runs N] [--json out.json] [--seed N] [--ship i] [--quality high|low] [--after N] [--rides a,b,c]
// Headless Chromium, software GL (SwiftShader): absolute numbers are slow, compare runs on one machine only (before / after with `git stash`).
// The game is opened through the real loading path (no ?test=1), Enter is clicked, a few seconds of real play settle, then the probe switches to the test clock
// (G.manual) and rides the lift for real: phase 'select' -> liftTo(deck) -> frames driven by hand until the car arrives (liftStep: loadDeck + deckPrograms) and
// --after frames more on the new deck. Each frame = __game.advance(dt) + menus.frame + __game.renderOnce() + a 1-pixel readPixels (waits for the GPU process).
// Rides (--rides, ship deck indices, default 2,4,0,2): new decks first, then back to decks already seen (does a revisit still compile / first-draw anything?).
// Per frame: step / ui / render / sync / wall ms, new three.js programs, textures, geometries, GL compile / link / status / texture upload / bufferData time,
// and FIRST DRAWS: (program, framebuffer) pairs drawn for the first time since the page opened (renderer.compile() only builds programs; ANGLE D3D11 / Metal /
// Vulkan and many GL drivers do the expensive part on the first real draw). Last: a wall-clock ride in the real rAF loop (frame intervals, long tasks).
import { createServer } from 'node:http'; import { readFile, writeFile } from 'node:fs/promises'; import { createRequire } from 'node:module'; import { join, extname, dirname } from 'node:path'; import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url), ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); const { chromium } = require('playwright');
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const RUNS = +arg('runs', 1), OUT = arg('json', null), SEED = +arg('seed', 11), SHIP = +arg('ship', 0), QUALITY = arg('quality', 'high'), AFTER = +arg('after', 6), RIDES = String(arg('rides', '2,4,0,2')).split(',').map(Number);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.exr': 'application/octet-stream', '.hdr': 'application/octet-stream', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => { try { const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html')); const b = await readFile(p); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); } }).listen(0);
const port = server.address().port, results = []; const T0 = Date.now(), log = (...a) => { if (argv.includes('--verbose')) console.log(`[${((Date.now() - T0) / 1000).toFixed(0)} s]`, ...a); };

// in-page: GL call timing (compile / link / status / texture upload / buffer upload) and long tasks
function instrument() {
  const R = __game.renderer, gl = R.getContext(), st = window.__dt = { gl: {}, long: [] };
  const wrapGL = (name, bucket) => { const f = gl[name]; if (!f) return; gl[name] = function (...a) { const t0 = performance.now(); try { return f.apply(this, a); } finally { const b = st.gl[bucket] || (st.gl[bucket] = { n: 0, ms: 0 }); b.n++; b.ms += performance.now() - t0; } }; };
  for (const n of ['compileShader', 'linkProgram']) wrapGL(n, n);
  wrapGL('getProgramParameter', 'programStatus'); wrapGL('getShaderParameter', 'shaderStatus'); wrapGL('getProgramInfoLog', 'programStatus'); wrapGL('getShaderInfoLog', 'shaderStatus');
  for (const n of ['texImage2D', 'texSubImage2D', 'texStorage2D', 'compressedTexImage2D', 'texImage3D', 'texSubImage3D', 'generateMipmap']) wrapGL(n, 'texUpload');
  wrapGL('bufferData', 'bufferData'); wrapGL('bufferSubData', 'bufferData');
  st.first = window.__ttFirst;
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) st.long.push(+e.duration.toFixed(0)); }).observe({ type: 'longtask', buffered: false }); } catch { }
  HTMLCanvasElement.prototype.requestPointerLock = function () { return Promise.resolve(); };
}
// first draws: (program, framebuffer) pairs drawn for the first time since the page opened (same as tools/talktime.mjs)
function firstDraws() {
  const P = WebGL2RenderingContext.prototype, seen = new WeakMap(), fbId = new WeakMap(); let curProg = null, curFb = null, nfb = 1; window.__ttFirst = [];
  const nameOf = (prog) => { const e = window.__game?.renderer?.info.programs.find(x => x.program === prog); return e ? (e.name || e.type || '?') : 'ext'; };
  const up = P.useProgram; P.useProgram = function (p) { curProg = p; return up.call(this, p); };
  const bf = P.bindFramebuffer; P.bindFramebuffer = function (t, fb) { if (t === this.FRAMEBUFFER || t === this.DRAW_FRAMEBUFFER) curFb = fb; return bf.call(this, t, fb); };
  for (const n of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) { const f = P[n]; if (!f) continue;
    P[n] = function (...a) { if (curProg) { let fi = 0; if (curFb) { fi = fbId.get(curFb); if (!fi) fbId.set(curFb, fi = nfb++); } let fs = seen.get(curProg); if (!fs) seen.set(curProg, fs = new Set()); if (!fs.has(fi)) { fs.add(fi); window.__ttFirst.push(nameOf(curProg) + '@fb' + fi); } } return f.apply(this, a); }; }
}

// one hand-driven frame; returns its timings and what was new in it
const frameFn = (draw = true) => {
  const g = __game, G = g.G, R = g.renderer, gl = R.getContext(), st = __dt; st.gl = {}; st.long = []; st.first.length = 0;
  const pk = () => new Set(R.info.programs.map(p => p.cacheKey)), p0 = pk(), tex0 = R.info.memory.textures, geo0 = R.info.memory.geometries, ph0 = G.phase;
  const t1 = performance.now(); g.advance(1 / 30); const t1b = performance.now(); g.menus?.frame(1 / 30); const t2 = performance.now(); if (draw) g.renderOnce(); const t3 = performance.now(); if (draw) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); const t4 = performance.now();
  const out = { draw, ph: ph0 + '>' + G.phase, step: +(t1b - t1).toFixed(1), ui: +(t2 - t1b).toFixed(1), render: +(t3 - t2).toFixed(1), sync: +(t4 - t3).toFixed(1), wall: +(t4 - t1).toFixed(1), deck: G.shipDeck };
  const nu = R.info.programs.filter(p => !p0.has(p.cacheKey)); out.prog = nu.length; out.programs = R.info.programs.length; out.tex = R.info.memory.textures - tex0; out.geo = R.info.memory.geometries - geo0;
  if (nu.length) out.names = nu.map(p => p.name || p.type || '?').slice(0, 20);
  out.gl = Object.fromEntries(Object.entries(st.gl).map(([k, v]) => [k, `${v.n}/${v.ms.toFixed(0)}ms`])); out.glMs = +Object.values(st.gl).reduce((a, v) => a + v.ms, 0).toFixed(1);
  out.calls = R.info.render.calls; out.first = st.first.length; if (st.first.length) out.firstNames = st.first.slice(0, 12);
  return out;
};

async function ride(page, to) {
  // ride frames are only drawn every 10th frame and over the last 0.2 s (the car interior, the same every ride; drawing all ~100-250 of them took minutes)
  const frame = (draw = true) => page.evaluate(frameFn, draw), near = () => page.evaluate(() => { const L = __game.G.lift; return L.dur - L.t < 0.2; });
  const base = []; for (let i = 0; i < 3; i++) base.push(await frame());
  await page.evaluate(() => window.gc?.());
  const s = await page.evaluate((to) => { const g = __game, G = g.G; if (G.phase !== 'play' || !g.world?.car) return { err: 'not in play / no car: ' + G.phase }; G.phase = 'select'; G.lift.state = 'select'; g.liftTo(to); return { from: G.lift.from, to, dur: +G.lift.dur.toFixed(2), phase: G.phase }; }, to);
  if (s.err || s.phase !== 'ride') return { to, err: s.err || 'no ride: ' + s.phase };
  log('ride ->', to, JSON.stringify(s)); const rideF = []; let arrival = null, after = [];
  for (let i = 0; i < 400; i++) { const f = await frame(i % 10 === 0 || await near()); log('  frame', f.ph, f.wall, 'ms'); if (f.ph === 'ride>play') { arrival = f; break; } if (f.draw) rideF.push(f); }
  if (!arrival) return { to, err: 'never arrived' };
  for (let i = 0; i < AFTER; i++) after.push(await frame());
  // what the warm-up itself costs once everything is uploaded and drawn (js/main.js warmDraws: every object, both post buffers, one pixel): CPU submit + GPU sync
  const warm = await page.evaluate(() => { const g = __game, gl = g.renderer.getContext(); if (!g.warmDraws) return null; const t0 = performance.now(); g.warmDraws(); const t1 = performance.now(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); return { cpu: +(t1 - t0).toFixed(1), sync: +(performance.now() - t1).toFixed(1) }; });
  const avg = (a, k) => +(a.reduce((s, x) => s + x[k], 0) / Math.max(1, a.length)).toFixed(0), sum = (a, k) => a.reduce((s, x) => s + x[k], 0);
  return { ...s, baseWall: avg(base, 'wall'), rideFrames: rideF.length, rideWall: avg(rideF, 'wall'), rideFirst: sum(rideF, 'first'), rideProg: sum(rideF, 'prog'), rideTex: sum(rideF, 'tex'), rideMaxWall: Math.max(...rideF.map(f => f.wall)),
    rideLast: rideF.slice(-3), arrival, after, afterFirst: sum(after, 'first'), afterProg: sum(after, 'prog'), afterTex: sum(after, 'tex'), after1Wall: after[0]?.wall, warm, afterWall: avg(after.slice(1), 'wall') };
}

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
  log('boarded'); await page.click('#boot-go');
  await page.evaluate(() => new Promise(r => setTimeout(r, 3000)));
  const settled = await page.evaluate((q) => { const g = __game; g.G.manual = true; if (g.CFG.quality !== q) g.setQuality(q); g.gov.auto = false; return { programs: g.renderer.info.programs.length, quality: g.CFG.quality, phase: g.G.phase, deck: g.G.shipDeck, decks: g.G.ship.decks }; }, QUALITY);
  await page.evaluate(instrument); log('settled', JSON.stringify(settled));
  const rides = [];
  for (const to of RIDES) {
    if (to >= settled.decks) continue;
    const x = await ride(page, to); rides.push(x);
    if (x.err) { console.log('ride ->', to, 'ERR', x.err); continue; }
    console.log(`\n== ride ${x.from} -> ${x.to} (${x.dur} s, ${x.rideFrames} frames drawn): base ${x.baseWall} ms, ride ${x.rideWall} ms (max ${x.rideMaxWall}; first draws ${x.rideFirst}, programs ${x.rideProg}, textures ${x.rideTex})`);
    console.log(`   ARRIVAL wall ${x.arrival.wall} ms (step ${x.arrival.step}, ui ${x.arrival.ui}, render ${x.arrival.render}, sync ${x.arrival.sync})  first draws ${x.arrival.first}  new programs ${x.arrival.prog}  textures ${x.arrival.tex}  geometries ${x.arrival.geo}  gl ${JSON.stringify(x.arrival.gl)}`);
    console.log(`   after: frame 1 ${x.after1Wall} ms, then avg ${x.afterWall} ms; first draws ${x.afterFirst}, programs ${x.afterProg}, textures ${x.afterTex}; warm-up again (all uploaded): ${JSON.stringify(x.warm)}`);
    for (const f of [...x.rideLast, x.arrival, ...x.after]) console.log('    ', JSON.stringify({ ph: f.ph, wall: f.wall, step: f.step, render: f.render, sync: f.sync, first: f.first, prog: f.prog, tex: f.tex, geo: f.geo, glMs: f.glMs, gl: f.gl, calls: f.calls, names: f.names, firstNames: f.firstNames }));
  }
  // real rAF loop: a wall-clock ride, frame intervals and CPU inside frame() around the arrival
  const real = await page.evaluate(async (to) => {
    const g = __game, G = g.G; if (G.phase !== 'play' || !g.world?.car) return { err: 'not in play' };
    const raf = window.requestAnimationFrame.bind(window), rec = [];
    window.requestAnimationFrame = (f) => raf((ts) => { const ph = G.phase, a = performance.now(); try { f(ts); } finally { rec.push({ t: +a.toFixed(0), cpu: +(performance.now() - a).toFixed(1), ph: ph + '>' + G.phase }); } });
    __dt.long = []; G.manual = false; G.phase = 'select'; G.lift.state = 'select'; g.liftTo(to);
    await new Promise(res => { const t = () => { if (G.phase === 'play' && rec.filter(x => x.ph.endsWith('play')).length > 8) res(); else raf(t); }; raf(t); });
    window.requestAnimationFrame = raf; G.manual = true;
    const i = rec.findIndex(x => x.ph === 'ride>play'), win = rec.slice(Math.max(0, i - 3), i + 8).map((x, k, a) => ({ ...x, dt: k ? x.t - a[k - 1].t : null }));
    return { to, arrivalCpu: rec[i]?.cpu, window: win, long: __dt.long.slice() };
  }, RIDES.find(d => d < settled.decks && d !== RIDES[RIDES.length - 1]) ?? 1);
  console.log('\n== real (rAF loop)', JSON.stringify(real));
  console.log('settled', JSON.stringify(settled));
  results.push({ run: r, wallS: (Date.now() - t0) / 1000, settled, rides, real }); await browser.close();
}
if (RUNS > 1) for (let i = 0; i < RIDES.length; i++) { const xs = results.map(r => r.rides[i]).filter(x => x && !x.err); if (!xs.length) continue; const a = (f) => +(xs.reduce((s, x) => s + f(x), 0) / xs.length).toFixed(0);
  console.log(`AVG ride ${i} -> ${RIDES[i]}: arrival wall ${a(x => x.arrival.wall)} ms (step ${a(x => x.arrival.step)}, render ${a(x => x.arrival.render)}, sync ${a(x => x.arrival.sync)}), first draws ${a(x => x.arrival.first)}, programs ${a(x => x.arrival.prog)}, after1 ${a(x => x.after1Wall)} ms, after ${a(x => x.afterWall)} ms, base ${a(x => x.baseWall)} ms, ride ${a(x => x.rideWall)} ms`); }
if (OUT) await writeFile(OUT, JSON.stringify(results, null, 1));
server.close();
