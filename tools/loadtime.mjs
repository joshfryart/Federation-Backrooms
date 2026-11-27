// Load / run timing probe (headless Chromium, software GL: absolute numbers are slow, compare runs on one machine only).
//   node tools/loadtime.mjs [--runs N] [--json out.json] [--no-play] [--boot-only] [--seed N] [--ship i] [--names]
// Per run: page open -> title (boot) with the boot:* performance marks from js/main.js (boot:warm, the uniform prewarm, may land after the title), Begin -> "Enter the ship" (boarding) with the run:* marks and the
// portrait stage totals (js/portraits.js stats), JS heap, requests / bytes, then "Enter the ship" clicked at once: play.enterToPlayMs = click -> two play frames drawn and finished on the GPU, play.enterFrames = rAF ticks up to the 4th play frame (interval, frames drawn, first draws, new programs); AVG beginToPlayS = boarding + enterToPlay, then a few seconds of play: rAF interval and the CPU time of frame() itself.
// The game is opened WITHOUT ?test=1 (the real loading path: uniform prewarm, every crew portrait), with ?brief=0 so Enter goes straight to play.
import { createServer } from 'node:http'; import { readFile, writeFile } from 'node:fs/promises'; import { createRequire } from 'node:module'; import { join, extname, dirname } from 'node:path'; import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url), ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); const { chromium } = require('playwright');
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const BOOT_ONLY = argv.includes('--boot-only'), RUNS = +arg('runs', 1), OUT = arg('json', null), PLAY = !argv.includes('--no-play'), SEED = +arg('seed', 11), SHIP = +arg('ship', 0);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.exr': 'application/octet-stream', '.hdr': 'application/octet-stream', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => { try { const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html')); const b = await readFile(p); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); } }).listen(0);
const port = server.address().port;
const results = [];
for (let run = 0; run < RUNS; run++) {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } }); page.setDefaultTimeout(600000);
  let reqs = 0, bytes = 0; const byType = {};
  page.on('requestfinished', async (r) => { reqs++; try { const s = (await r.sizes()).responseBodySize; bytes += s; const t = extname(r.url().split('?')[0]) || 'other'; byType[t] = (byType[t] || 0) + s; } catch { /* closed */ } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  const t0 = Date.now();
  // seed + ship pinned so runs compare (G.forceSeed / forceShip are the test hooks newRun already reads)
  await page.addInitScript(firstDraws); if (argv.includes('--names')) await page.addInitScript(() => { window.__ltNames = 1; });
  await page.addInitScript(([seed, ship]) => { const t = setInterval(() => { if (window.__game?.G) { __game.G.forceSeed = seed; __game.G.forceShip = ship; clearInterval(t); } }, 5); }, [SEED, SHIP]);
  await page.goto(`http://localhost:${port}/index.html?brief=0`);
  await page.waitForFunction(() => { const b = document.getElementById('begin'); return b && !b.disabled; }, null, { polling: 100 });
  const bootWall = (Date.now() - t0) / 1000;
  const boot = await page.evaluate(() => { const m = {}; for (const e of performance.getEntriesByType('mark')) m[e.name] = +(e.startTime / 1000).toFixed(2); return { marks: m, outfitJobs: __game.outfitStats.jobs, outfitCpuS: +(__game.outfitStats.ms / 1000).toFixed(2), framesDrawn: __game.renderStats.n, drawSubmitS: +(__game.renderStats.ms / 1000).toFixed(2), heapMB: +(performance.memory?.usedJSHeapSize / 1048576).toFixed(0), programs: __game.renderer.info.programs?.length }; });
  const bootReq = { reqs, MB: +(bytes / 1048576).toFixed(1), byTypeMB: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, +(v / 1048576).toFixed(2)])) };
  if (BOOT_ONLY) { const r = { run, bootWallS: bootWall, boot, bootReq }; console.log(JSON.stringify(r)); results.push(r); await browser.close(); continue; }
  // boarding
  const t1 = Date.now();
  await page.click('#begin');
  await page.waitForFunction(() => { const b = document.getElementById('boot-go'); return b && b.style.display !== 'none' && getComputedStyle(b).display !== 'none'; }, null, { polling: 100 });
  const boardWall = (Date.now() - t1) / 1000;
  const board = await page.evaluate(() => { const m = {}; const ms = performance.getEntriesByType('mark'), s = ms.find(e => e.name === 'run:start')?.startTime ?? 0; let prev = s;
    for (const e of ms.filter(e => e.name.startsWith('run:'))) { m[e.name] = +((e.startTime - prev) / 1000).toFixed(2); prev = e.startTime; }
    const st = __game.G.portraits?.stats || {}; return { phases: m, portraits: { n: st.rendered, totalS: +(st.ms / 1000).toFixed(2), makeS: +(st.make / 1000).toFixed(2), drawS: +(st.draw / 1000).toFixed(2), readS: +(st.read / 1000).toFixed(2), firstReadS: +((st.read1 || 0) / 1000).toFixed(2), encS: +(st.enc / 1000).toFixed(2) }, heapMB: +(performance.memory?.usedJSHeapSize / 1048576).toFixed(0), programs: __game.renderer.info.programs?.length, ship: __game.G.ship?.name, crew: __game.G.roster?.people.length }; });
  let play = null, enterFrames = null;
  if (PLAY) {
    // the first frames after "Enter the ship": rAF intervals, first draws ((program, framebuffer) pairs never drawn before) and programs compiled in them
    enterFrames = await page.evaluate(async () => {
      const R = __game.renderer, f = window.__ttFirst, p0 = R.info.programs.length, k0 = new Set(R.info.programs.map(p => p.cacheKey)), out = []; f.length = 0; let last = performance.now();
      // enterToPlayMs: click -> two play frames drawn (both post buffers) and finished on the GPU (a sync readback after the second). A click while the boarding
      // warm-up is still on the GPU keeps the overlay up until it is done (js/loading.js ready `until`): rAF ticks then draw nothing (drawn stays 0).
      const rs = __game.renderStats, n0 = rs.n, gl = R.getContext(), tc = performance.now(); document.getElementById('boot-go').click(); let enterToPlayMs = null, pd = 0;
      for (let i = 0; performance.now() - tc < 180000; i++) {
        await new Promise(r => requestAnimationFrame(r)); const n = performance.now(), drawn = rs.n - n0;
        if (drawn !== pd || i % 20 === 19) { out.push({ ms: Math.round(n - last), drawn, first: f.length, prog: R.info.programs.length - p0, ...(window.__ltNames ? { names: [...f], progNames: R.info.programs.filter(p => !k0.has(p.cacheKey)).map(p => p.name) } : {}) }); last = n; f.length = 0; pd = drawn; }
        if (drawn >= 2 && enterToPlayMs == null) { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); enterToPlayMs = Math.round(performance.now() - tc); }
        if (drawn >= 4) break;
      }
      const mk = (n) => performance.getEntriesByName(n)[0]?.startTime, gi = mk('run:gpuIdle'), rd = mk('run:ready');
      return { frames: out, enterToPlayMs, gpuIdleAfterClickMs: gi != null ? Math.round(gi - tc) : null, gpuIdleAfterReadyMs: gi != null && rd != null ? Math.round(gi - rd) : null };
    });
    play = await page.evaluate(async () => {
      const g = __game, G = g.G; const R = g.renderer; const iv = []; const cpu = [];
      // CPU cost of the game's own rAF callback: wrap requestAnimationFrame so the time inside frame() is measured (GPU raster in SwiftShader happens in the GPU process, mostly after)
      const raf = window.requestAnimationFrame.bind(window); let last = performance.now();
      await new Promise(r => setTimeout(r, 2500));   // settle (first frames compile)
      window.requestAnimationFrame = (f) => raf((ts) => { const a = performance.now(); try { f(ts); } finally { cpu.push(performance.now() - a); } });
      const end = performance.now() + 6000; last = performance.now();
      await new Promise(res => { const tick = () => { const n = performance.now(); iv.push(n - last); last = n; if (n < end) raf(tick); else res(); }; raf(tick); });
      window.requestAnimationFrame = raf;
      const med = (a) => { const b = [...a].sort((x, y) => x - y); return +(b[Math.floor(b.length / 2)] || 0).toFixed(1); }, p95 = (a) => { const b = [...a].sort((x, y) => x - y); return +(b[Math.floor(b.length * 0.95)] || 0).toFixed(1); };
      return { phase: G.phase, frames: iv.length, frameMedMs: med(iv), frameP95Ms: p95(iv), cpuMedMs: med(cpu), cpuP95Ms: p95(cpu), quality: g.CFG.quality, calls: R.info.render.calls, tris: R.info.render.triangles, programs: R.info.programs?.length,   /* programs after ~8.5 s of play: more than at boarding = compiled mid-play */ heapMB: +(performance.memory?.usedJSHeapSize / 1048576).toFixed(0) };
    });
  }
  if (play) { play.enterFrames = enterFrames.frames; play.enterToPlayMs = enterFrames.enterToPlayMs; play.gpuIdleAfterClickMs = enterFrames.gpuIdleAfterClickMs; play.gpuIdleAfterReadyMs = enterFrames.gpuIdleAfterReadyMs; } const r = { run, bootWallS: bootWall, boot, bootReq, boardWallS: boardWall, board, play };
  console.log(JSON.stringify(r)); results.push(r);
  await browser.close();
}
if (RUNS > 1 && !BOOT_ONLY) { const avg = (f) => +(results.reduce((a, r) => a + f(r), 0) / results.length).toFixed(2); console.log('AVG', JSON.stringify({ bootWallS: avg(r => r.bootWallS), boardWallS: avg(r => r.boardWallS), firstReadS: avg(r => r.board.portraits.firstReadS), enterToPlayS: PLAY ? avg(r => r.play.enterToPlayMs / 1000) : null, enterFirstDraws: PLAY ? avg(r => r.play.enterFrames.reduce((a, f) => a + (f.first || 0), 0)) : null, beginToPlayS: PLAY ? avg(r => r.boardWallS + r.play.enterToPlayMs / 1000) : null, cpuMedMs: PLAY ? avg(r => r.play.cpuMedMs) : null })); }
// first draws: (program, framebuffer) pairs drawn for the first time since the page opened (as tools/talktime.mjs); installed before any page script
function firstDraws() {
  const P = WebGL2RenderingContext.prototype, seen = new WeakMap(), fbId = new WeakMap(); let curProg = null, curFb = null, nfb = 1; window.__ttFirst = [];
  const up = P.useProgram; P.useProgram = function (p) { curProg = p; return up.call(this, p); };
  const bf = P.bindFramebuffer; P.bindFramebuffer = function (t, fb) { if (t === this.FRAMEBUFFER || t === this.DRAW_FRAMEBUFFER) curFb = fb; return bf.call(this, t, fb); };
  for (const n of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) { const f = P[n]; if (!f) continue;
    P[n] = function (...a) { if (curProg) { let fi = 0; if (curFb) { fi = fbId.get(curFb); if (!fi) fbId.set(curFb, fi = nfb++); } let fs = seen.get(curProg); if (!fs) seen.set(curProg, fs = new Set()); if (!fs.has(fi)) { fs.add(fi); window.__ttFirst.push((window.__game?.renderer?.info.programs.find(x => x.program === curProg)?.name || '?') + '@fb' + fi); } } return f.apply(this, a); }; }
}
if (OUT) await writeFile(OUT, JSON.stringify(results, null, 1));
server.close();
