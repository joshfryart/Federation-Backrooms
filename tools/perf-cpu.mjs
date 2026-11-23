// Headless per-frame CPU / GC probe (software GL: CPU numbers are relative, the GPU is SwiftShader). Repeatable: Math.random seeded, fixed 1/30 s steps.
//   node tools/perf-cpu.mjs [--mode nominal|madness|both] [--frames 900] [--warm 300] [--seed 11] [--ship 0] [--render N] [--profile] [--heap] [--trace] [--json] [--root DIR]
// Each frame does what main.js frame() does, on the test clock: advance(dt) (world step), menus.frame (name tags, portraits, belt, wheel), the
// job-game tick, then every Nth frame (--render N, default 10; 0 = never) renderOnce() (crowd cull + post chain submit, no gl.finish: mostly the CPU
// side of three.js, but SwiftShader can block the submit, so renderMs is an upper bound). Drawing every frame on SwiftShader takes ~1 s per frame.
// Frames are driven from requestAnimationFrame so the browser's own style / layout / paint run between them like in play.
// The player hops between the lift, the busiest room, a walker and an open tile every 5 s, turning slowly for the first half of each stop and
// standing still for the rest, so cull / LOD / HUD see both motion and idle frames.
// Prints: step ms / ui ms / render ms (mean, p50, p95, max), frames > 50 ms (long tasks), heap growth, and with
//   --profile  top self-time functions (CDP Profiler)            --heap  top allocating functions (sampling heap profiler, incl. collected objects)
//   --portraits keep the background portrait warm-up (off by default)   --quality high|low (default high)
//   --trace    GC (minor / major) and Layout / UpdateLayoutTree counts per 100 frames (CDP tracing)
// `fingerprint` hashes the end state (player, crew positions, sim clock, duty, ship systems): it must not change when only cost changes.
import { createServer } from 'node:http'; import { readFile } from 'node:fs/promises'; import { createRequire } from 'node:module'; import { join, extname, dirname } from 'node:path'; import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url), ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); const { chromium } = require('playwright');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.webp': 'image/webp' };
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] ?? true); }, flag = (k) => process.argv.includes('--' + k);
const SRV = arg('root', ROOT);   // --root DIR: serve another checkout (A/B against a baseline copy, e.g. `git archive HEAD | tar -x -C /tmp/base`)
const opt = { frames: +arg('frames', 900), warm: +arg('warm', 300), seed: +arg('seed', 11), ship: +arg('ship', 0), render: +arg('render', 10), billet: arg('billet', 'cos'), quality: arg('quality', 'high'), portraits: flag('portraits') };
const MODES = arg('mode', 'both') === 'both' ? ['nominal', 'madness'] : [arg('mode')];
const server = createServer(async (req, res) => { try { const p = join(SRV, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html')); const b = await readFile(p); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); } }).listen(0);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--autoplay-policy=no-user-gesture-required'] });
const results = {};
for (const mode of MODES) {
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } }); page.setDefaultTimeout(600000);
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.addInitScript((seed) => { let a = seed >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }, opt.seed);
  await page.goto(`http://localhost:${server.address().port}/index.html?mode=${mode}&billet=${opt.billet}&brief=0`);
  await page.evaluate(async (o) => {
    const g = __game, G = g.G; await g.ready; await g.warmed; G.manual = true; G.forceShip = o.ship; G.forceSeed = o.seed; g.newRun(); g.setQuality(o.quality); g.renderer.compile(g.scene, g.camera); window.__compiled = new WeakSet(); g.scene.traverse(o => window.__compiled.add(o));   /* what startRun() does after newRun() */ if (!o.portraits) G.testMode = true;   /* no background portrait renders (~1 s each on SwiftShader; a start-up cost, not per frame) */
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); G.hp = G.maxHp = 1e6; G.phase = 'play';
    window.__perfT = 0; window.__perfI = 0;
    window.__perfFrame = (dt, rec, doRender) => {   // one frame like main.js frame()
      const P = g.P, w = g.world, i = window.__perfI++;
      if (i % 150 === 0) {   // hop: lift mouth, busiest room centre, beside a walker, an open tile half way down the list
        const k = (i / 150) % 4, open = w.d.openTiles; let x = P.x, z = P.z;
        if (k === 0) { x = w.liftPos.x + 2; z = w.liftPos.z; }
        else if (k === 1) { const r = (w.d.rooms || []).slice().sort((a, b) => (b.w * b.h) - (a.w * a.h))[0]; if (r) { x = (r.x + r.w / 2) * 4; z = (r.y + r.h / 2) * 4; } }
        else if (k === 2) { const e = g.ents.find(e => e.walk && e.mesh); if (e) { x = e.mesh.position.x + 1; z = e.mesh.position.z; } }
        else { const [tx, ty] = open[Math.floor(open.length * 0.5)]; x = (tx + 0.5) * 4; z = (ty + 0.5) * 4; }
        P.x = x; P.z = z; P.vx = P.vz = 0;
      }
      if (i % 150 < 75) P.yaw += 0.6 * dt;   // turn for half of each hop, then stand still (reading a panel, waiting, talking) G.phase = G.phase === 'dying' || G.phase === 'dead' ? 'play' : G.phase; G.hp = 1e6;
      const a = performance.now(); window.__perfT += dt; g.advance(dt, window.__perfT);
      const b = performance.now(); G.menus?.frame(dt); G.pad?.tick?.(dt); G.jobgame?.tick?.(dt);
      const c = performance.now(), draw = doRender > 0 && i % doRender === 0; if (draw) g.renderOnce();
      const d = performance.now(); if (rec) rec.push([b - a, c - b, d - c, draw]);
    };
    window.__perfRun = (n, doRender) => new Promise(res => { const rec = []; let k = 0; const f = () => { if (k++ >= n) return res(rec); window.__perfFrame(1 / 30, rec, doRender); requestAnimationFrame(f); }; requestAnimationFrame(f); });
  }, opt);
  await page.evaluate(({ warm, render }) => __perfRun(warm, render), opt);
  const cdp = await page.context().newCDPSession(page);
  const PROF = flag('profile'), HEAP = flag('heap'), TRACE = flag('trace');
  if (PROF) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
  if (HEAP) { await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }); }
  let traceEvents = []; if (TRACE) { cdp.on('Tracing.dataCollected', d => traceEvents.push(...d.value)); await cdp.send('Tracing.start', { categories: 'devtools.timeline,v8,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' }); }
  const [heap0, prog0] = await page.evaluate(() => [performance.memory.usedJSHeapSize, __game.renderer.info.programs.length]);
  const t0 = Date.now(); const rec = await page.evaluate(({ frames, render }) => __perfRun(frames, render), opt); const wall = Date.now() - t0;
  const [heap1, prog1] = await page.evaluate(() => [performance.memory.usedJSHeapSize, __game.renderer.info.programs.length]);
  const out = { mode, frames: rec.length, wallS: +(wall / 1000).toFixed(1) };
  const stat = (i) => { const v = (i === 2 ? rec.filter(r => r[3]) : rec).map(r => r[i]); if (!v.length) return null; v.sort((a, b) => a - b); const q = (p) => +v[Math.min(v.length - 1, Math.floor(v.length * p))].toFixed(2); return { mean: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2), p50: q(0.5), p95: q(0.95), max: +v[v.length - 1].toFixed(1) }; };
  out.stepMs = stat(0); out.uiMs = stat(1); out.renderMs = stat(2); out.long50 = rec.filter(r => r[0] + r[1] > 50).length;   // world + UI over 50 ms (the render is excluded: SwiftShader)
  out.heapDeltaMB = +((heap1 - heap0) / 1048576).toFixed(1); out.programs = [prog0, prog1]; if (prog1 > prog0) out.newPrograms = await page.evaluate((n) => { const names = new Set(__game.renderer.info.programs.slice(n).map(p => p.name)); const late = []; __game.scene.traverse(o => { if (o.material && names.has(o.material.name) && !window.__compiled.has(o)) { let p = o, path = []; while (p && p !== __game.scene) { path.push(p.name || p.type); p = p.parent; } late.push(path.join('<')); } }); return { progs: __game.renderer.info.programs.slice(n).map(p => p.name + ' ' + (p.cacheKey || '').slice(0, 60)), addedAfterCompile: [...new Set(late)].slice(0, 10) }; }, prog0);   // shader programs before / after the measured frames (new ones = compile stalls mid-play) out.programs = [prog0, prog1]; if (prog1 > prog0) out.newPrograms = await page.evaluate((n) => { const names = new Set(__game.renderer.info.programs.slice(n).map(p => p.name)); const late = []; __game.scene.traverse(o => { if (o.material && names.has(o.material.name) && !window.__compiled.has(o)) { let p = o, path = []; while (p && p !== __game.scene) { path.push(p.name || p.type); p = p.parent; } late.push(path.join('<')); } }); return { progs: __game.renderer.info.programs.slice(n).map(p => p.name + ' ' + (p.cacheKey || '').slice(0, 60)), addedAfterCompile: [...new Set(late)].slice(0, 10) }; }, prog0);   // shader programs before / after the measured frames (new ones = compile stalls mid-play)
  if (PROF) {
    const { profile } = await cdp.send('Profiler.stop'); const self = new Map(), dtot = profile.timeDeltas.reduce((a, b) => a + b, 0); const byId = new Map(profile.nodes.map(n => [n.id, n])); const cnt = new Map();
    for (const s of profile.samples) cnt.set(s, (cnt.get(s) || 0) + 1); const ns = profile.samples.length;
    for (const [id, c] of cnt) { const n = byId.get(id), f = n.callFrame, k = `${f.functionName || '(anon)'} ${f.url.replace(/^.*\/(js|vendor)\//, '$1/')}:${f.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + c); }
    const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id); const keyOf = (n) => { const f = n.callFrame; return `${f.functionName || '(anon)'} ${f.url.replace(/^.*\/(js|vendor)\//, '$1/')}:${f.lineNumber + 1}`; }; const incl = new Map();
    for (const [id, c] of cnt) { const seen = new Set(); for (let x = id; x != null; x = parent.get(x)) { const n = byId.get(x); if (!/\/js\//.test(n.callFrame.url)) continue; const k = keyOf(n); if (seen.has(k)) continue; seen.add(k); incl.set(k, (incl.get(k) || 0) + c); } }
    out.profileIncl = [...incl].sort((a, b) => b[1] - a[1]).slice(0, +arg('top', 30)).map(([k, c]) => `${(c / ns * dtot / 1000 / rec.length).toFixed(3)} ms/f  ${k}`);   // inclusive (game code only)
    out.profileTop = [...self].sort((a, b) => b[1] - a[1]).slice(0, +arg('top', 30)).map(([k, c]) => `${(c / ns * 100).toFixed(1).padStart(5)}%  ${(c / ns * dtot / 1000 / rec.length).toFixed(3)} ms/f  ${k}`);
  }
  if (HEAP) {
    const { profile } = await cdp.send('HeapProfiler.stopSampling'); const by = new Map(); let total = 0;
    const walk = (n) => { const s = n.selfSize; if (s) { const f = n.callFrame, k = `${f.functionName || '(anon)'} ${f.url.replace(/^.*\/(js|vendor)\//, '$1/')}:${f.lineNumber + 1}`; by.set(k, (by.get(k) || 0) + s); total += s; } n.children.forEach(walk); }; walk(profile.head);
    out.allocKBperFrame = +(total / 1024 / rec.length).toFixed(1); out.allocTop = [...by].sort((a, b) => b[1] - a[1]).slice(0, +arg('top', 30)).map(([k, s]) => `${(s / 1024 / rec.length).toFixed(2).padStart(7)} KB/f  ${k}`);
  }
  if (TRACE) {
    await new Promise(r => { cdp.once('Tracing.tracingComplete', r); cdp.send('Tracing.end'); });
    const c = (names) => traceEvents.filter(e => names.includes(e.name) && (e.ph === 'X' || e.ph === 'B')).length, dur = (names) => +(traceEvents.filter(e => names.includes(e.name) && e.ph === 'X').reduce((a, e) => a + (e.dur || 0), 0) / 1000).toFixed(1);
    const per = (x) => +(x / rec.length * 100).toFixed(1);
    out.per100frames = { minorGC: per(c(['MinorGC', 'Scavenge'])), majorGC: per(c(['MajorGC', 'MarkCompact'])), gcMs: per(dur(['MinorGC', 'MajorGC', 'Scavenge', 'MarkCompact', 'V8.GC_SCAVENGER', 'V8.GCScavenger'])), layout: per(c(['Layout'])), layoutMs: per(dur(['Layout'])), styleRecalc: per(c(['UpdateLayoutTree', 'RecalculateStyles'])), styleMs: per(dur(['UpdateLayoutTree', 'RecalculateStyles'])), paintMs: per(dur(['Paint'])) };
    const by = new Map(); for (const e of traceEvents) if (e.ph === 'X' && e.dur) by.set(e.name, (by.get(e.name) || 0) + e.dur); out.traceTopMsPerFrame = [...by].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([k, v]) => `${k} ${(v / 1000 / rec.length).toFixed(2)}`).join(' | ');   // nested events overlap: orientation only
  }
  out.fingerprint = await page.evaluate(() => {
    const g = __game, G = g.G, P = g.P; let h = 2166136261; const mix = (v) => { const s = typeof v === 'number' ? v.toFixed(4) : String(v); for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; };
    mix(P.x); mix(P.z); mix(G.time); mix(G.hp); mix(G.deck); mix(G.shipDeck ?? ''); for (const e of g.ents) { mix(e.kind); mix(e.x ?? ''); mix(e.z ?? ''); if (e.mesh) { mix(e.mesh.position.x); mix(e.mesh.position.z); } }
    for (const gg of g.gorns) { mix(gg.x); mix(gg.z); mix(gg.state); }
    if (g.sim) for (let d = 1; d <= (G.shipDecks?.length || 0); d++) for (const [id, b] of g.sim.bodies(d)) { mix(id); mix(b.room?.id ?? b.room ?? ''); mix(b.activity ?? ''); mix(b.tx ?? ''); mix(b.ty ?? ''); }
    if (g.shipState) for (const [id, s] of Object.entries(g.shipState.sys)) { mix(id); mix(s.hp); }
    mix(Math.random()); return h.toString(16);
  });
  out.errors = errs.slice(0, 5);
  results[mode] = out; await page.close();
}
if (flag('json')) console.log(JSON.stringify(results));
else for (const r of Object.values(results)) {
  const { profileTop, allocTop, profileIncl, ...rest } = r; console.log(JSON.stringify(rest, null, 1));
  if (profileTop) console.log(`-- ${r.mode} top self time --\n` + profileTop.join('\n')); if (profileIncl) console.log(`-- ${r.mode} inclusive (js/) --\n` + profileIncl.join('\n')); if (allocTop) console.log(`-- ${r.mode} top allocation --\n` + allocTop.join('\n'));
}
await browser.close(); server.close();
