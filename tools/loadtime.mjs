// Load / run timing probe (headless Chromium, software GL: absolute numbers are slow, compare runs on one machine only).
//   node tools/loadtime.mjs [--runs N] [--json out.json] [--no-play] [--boot-only] [--seed N] [--ship i]
// Per run: page open -> title (boot) with the boot:* performance marks from js/main.js, Begin -> "Enter the ship" (boarding) with the run:* marks and the
// portrait stage totals (js/portraits.js stats), JS heap, requests / bytes, then a few seconds of play: rAF interval and the CPU time of frame() itself.
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
    const st = __game.G.portraits?.stats || {}; return { phases: m, portraits: { n: st.rendered, totalS: +(st.ms / 1000).toFixed(2), makeS: +(st.make / 1000).toFixed(2), drawS: +(st.draw / 1000).toFixed(2), readS: +(st.read / 1000).toFixed(2), encS: +(st.enc / 1000).toFixed(2) }, heapMB: +(performance.memory?.usedJSHeapSize / 1048576).toFixed(0), programs: __game.renderer.info.programs?.length, ship: __game.G.ship?.name, crew: __game.G.roster?.people.length }; });
  let play = null;
  if (PLAY) {
    await page.click('#boot-go');
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
      return { phase: G.phase, frames: iv.length, frameMedMs: med(iv), frameP95Ms: p95(iv), cpuMedMs: med(cpu), cpuP95Ms: p95(cpu), quality: g.CFG.quality, calls: R.info.render.calls, tris: R.info.render.triangles, heapMB: +(performance.memory?.usedJSHeapSize / 1048576).toFixed(0) };
    });
  }
  const r = { run, bootWallS: bootWall, boot, bootReq, boardWallS: boardWall, board, play };
  console.log(JSON.stringify(r)); results.push(r);
  await browser.close();
}
if (RUNS > 1 && !BOOT_ONLY) { const avg = (f) => +(results.reduce((a, r) => a + f(r), 0) / results.length).toFixed(2); console.log('AVG', JSON.stringify({ bootWallS: avg(r => r.bootWallS), boardWallS: avg(r => r.boardWallS), cpuMedMs: PLAY ? avg(r => r.play.cpuMedMs) : null })); }
if (OUT) await writeFile(OUT, JSON.stringify(results, null, 1));
server.close();
