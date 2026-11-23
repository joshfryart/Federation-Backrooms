// Load-path timing probe: page open -> title (boot), Begin -> "Enter the ship" (boarding), Enter -> first drawn frame. Headless software GL, so only
// RELATIVE numbers mean anything (before / after on the same machine, ideally an idle one). Reads the fb:* performance marks js/main.js sets along the way
// (boot-loaded / boot-done, board-built / board-compiled / board-portraits / board-ready, first-frame), the longest gap between animation frames per stage (how long
// the loading bar could not move), the JS heap after a GC at the end of each stage, and the portrait renderer's own time.
//   node tools/perf-load.mjs [--runs 3] [--seed 5] [--ship 0] [--size 640x360] [--latency ms] [--mbps n] [--boot-only]
// --latency / --mbps: emulated network (Chrome DevTools throttling; per request, so it is harsher than a real HTTP/2 host): shows request waterfalls.
import { createServer } from 'node:http'; import { readFile } from 'node:fs/promises'; import { createRequire } from 'node:module'; import { join, extname, dirname } from 'node:path'; import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url), ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); const { chromium } = require('playwright');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] ?? true); };
const LAT = +arg('latency', 0), MBPS = +arg('mbps', 0), BOOT_ONLY = process.argv.includes('--boot-only');
const RUNS = +arg('runs', 3), SEED = +arg('seed', 5), SHIP = +arg('ship', 0), [W, H] = String(arg('size', '640x360')).split('x').map(Number);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.exr': 'application/octet-stream', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = createServer(async (req, res) => { try { const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html')); const b = await readFile(p); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); } }).listen(0);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const all = [];
for (let r = 0; r < RUNS; r++) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } }); const page = await ctx.newPage(); page.setDefaultTimeout(600000);
  page.on('pageerror', e => console.log('pageerror', e.message));
  if (LAT || MBPS) { const cdp = await ctx.newCDPSession(page); await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: LAT, downloadThroughput: MBPS ? MBPS * 125000 : -1, uploadThroughput: -1 }); }
  await page.addInitScript(() => {
    window.__gaps = []; { let last = 0; const f = (t) => { if (last) window.__gaps.push([last, t - last]); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f); }   // frame gaps: how long the overlay's bar / text could not update
    window.__heap = {}; window.__snapHeap = (k) => { try { window.gc?.(); } catch { } window.__heap[k] = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null; };
  });
  await page.goto(`http://localhost:${server.address().port}/index.html?ship=${SHIP}`);
  await page.evaluate(async () => { await __game.ready; await __game.warmed; __snapHeap('boot'); });
  if (BOOT_ONLY) { const m = await page.evaluate(() => { const m = {}; for (const e of performance.getEntriesByType('mark')) if (e.name.startsWith('fb:')) m[e.name.slice(3)] = Math.round(e.startTime); return m; }); const row = { boot: m['boot-done'], modules: m.modules, loaded: m['boot-loaded'], marks: m }; console.log(JSON.stringify(row)); all.push(row); await ctx.close(); continue; }
  await page.evaluate(({ SEED, SHIP }) => { __game.G.forceSeed = SEED; __game.G.forceShip = SHIP; performance.mark('fb:click-begin'); document.getElementById('begin').click(); }, { SEED, SHIP });
  await page.waitForFunction(() => getComputedStyle(document.getElementById('boot-go')).display !== 'none', null, { polling: 100 });
  const stats = () => page.evaluate(() => {
    const m = {}; for (const e of performance.getEntriesByType('mark')) if (e.name.startsWith('fb:')) m[e.name.slice(3)] = Math.round(e.startTime);
    const gapIn = (a, b) => Math.round(Math.max(0, ...window.__gaps.filter(([s]) => s >= a && s < b).map(([, d]) => d)));
    return { m, heap: window.__heap, gapBoot: gapIn(0, m['boot-done']), gapBoard: gapIn(m['click-begin'], m['board-ready']), programs: __game.renderer?.info?.programs?.length ?? null, pt: __game.G.portraits ? { n: __game.G.portraits.stats.rendered, ms: Math.round(__game.G.portraits.stats.ms) } : null };
  });
  await page.evaluate(() => __snapHeap('board')); let out = await stats(), frames = null;
  try {   // the first played frame (and a few after it, to see whether lazy compiles still stall later frames)
    await page.evaluate(() => { performance.mark('fb:click-enter'); document.getElementById('boot-go').click(); });
    await page.waitForFunction(() => performance.getEntriesByName('fb:first-frame').length > 0, null, { polling: 50 });
    frames = await page.evaluate(() => new Promise((res) => { const ts = []; let last = performance.now(); const f = () => { const n = performance.now(); ts.push(+(n - last).toFixed(0)); last = n; if (ts.length < 4) requestAnimationFrame(f); else res(ts); }; requestAnimationFrame(f); }));
    out = await stats();
  } catch (e) { console.log('play stage failed:', e.message.split('\n')[0]); }
  const { m } = out;
  const row = { boot: m['boot-done'], boarding: m['board-ready'] - m['click-begin'], firstFrame: m['first-frame'] - m['click-enter'], frames, maxFrameGapBoot: out.gapBoot, maxFrameGapBoard: out.gapBoard, heapMB: out.heap, programs: out.programs, portraits: out.pt, marks: m };
  console.log(JSON.stringify(row)); all.push(row); await ctx.close();
}
const med = (k) => { const v = all.map(r => r[k]).sort((a, b) => a - b); return v[v.length >> 1]; };
console.log('MEDIAN', JSON.stringify(BOOT_ONLY ? { boot: med('boot'), modules: med('modules'), loaded: med('loaded') } : { boot: med('boot'), boarding: med('boarding'), firstFrame: med('firstFrame'), maxFrameGapBoot: med('maxFrameGapBoot'), maxFrameGapBoard: med('maxFrameGapBoard') }));
await browser.close(); server.close();
