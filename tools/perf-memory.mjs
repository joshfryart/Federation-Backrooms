// Download + memory probe (headless Chromium, SwiftShader):  node tools/perf-memory.mjs [--decks 8] [--ship i] [--qs alljobs=0] [--root dir] [--json out.json]
//   load    every request the title screen makes until __game.ready / warmed: count + raw bytes + gzip-9 bytes per kind (js / json / glb / webp / ...),
//           ES module count and the import depth (round trips before the last module is known)
//   run     newRun() (Systems Nominal), then N deck changes (loadDeck through the ship's decks, wrapping), one high-quality render after each:
//           renderer.info.memory geometries / textures, GL programs, the JS heap after gc, and the GPU bytes actually uploaded
//           (WebGL2 texStorage / texImage / renderbuffer calls wrapped in the page: sized formats x levels, freed on deleteTexture / deleteRenderbuffer)
// A count that climbs with every deck change is a leak across loadDeck; a flat line after the first two changes is a cache filling up.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), { chromium } = require('playwright');
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] ?? d); }, ROOT = arg('root', join(dirname(fileURLToPath(import.meta.url)), '..'));   // --root <dir>: serve another checkout (before / after)
const DECKS = +arg('decks', 8), SHIP = arg('ship', null), OUT = arg('json', null), QS = arg('qs', '');   // --qs 'alljobs=0': extra query string
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.exr': 'application/octet-stream', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try { const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html')); const b = await readFile(p); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;
const gz = new Map(), gzOf = (path) => { if (!gz.has(path)) { try { gz.set(path, gzipSync(readFileSync(join(ROOT, path)), { level: 9 }).length); } catch { gz.set(path, 0); } } return gz.get(path); };

// in-page GPU byte accounting (WebGL2): bytes per texel of the sized internal formats three.js uses
const GL_TRACK = () => {
  const BPP = { 0x8058: 4, 0x8C43: 4, 0x8051: 4, 0x8C41: 4, 0x8229: 1, 0x822B: 2, 0x881A: 8, 0x8814: 16, 0x822D: 2, 0x822F: 4, 0x822E: 4, 0x8230: 8, 0x88F0: 4, 0x81A6: 4, 0x8CAC: 4, 0x81A5: 2, 0x8C3A: 4, 0x8D62: 2, 0x8C3D: 4, 0x8059: 4, 0x881B: 6, 0x8815: 12, 0x8D48: 1, 0x1908: 4, 0x1907: 4, 0x1903: 1, 0x8227: 2, 0x1906: 1, 0x1909: 1, 0x190A: 2 };
  const TYPE = { 0x1401: 1, 0x1406: 4, 0x140B: 2, 0x8D61: 2, 0x1403: 2, 0x1405: 4 }, CH = { 0x1908: 4, 0x1907: 3, 0x1903: 1, 0x8227: 2, 0x1909: 1, 0x190A: 2, 0x1906: 1 };
  const S = window.__gpu = { tex: new Map(), rb: new Map(), unit: 0, bound: {}, total() { let t = 0, r = 0; for (const v of this.tex.values()) for (const b of Object.values(v.lv)) t += b; for (const v of this.rb.values()) r += v; return { tex: t, rb: r, ntex: this.tex.size }; } };
  const P = WebGL2RenderingContext.prototype, wrap = (n, f) => { const o = P[n]; P[n] = function (...a) { try { f.apply(this, a); } catch { } return o.apply(this, a); }; };
  const cur = (target) => S.bound[S.unit + ':' + (target >= 0x8515 && target <= 0x851A ? 0x8513 : target)];
  const ent = (t) => { let e = S.tex.get(t); if (!e) S.tex.set(t, e = { lv: {} }); return e; };
  wrap('activeTexture', (u) => { S.unit = u; });
  wrap('bindTexture', (target, t) => { S.bound[S.unit + ':' + target] = t; });
  wrap('deleteTexture', (t) => { S.tex.delete(t); });
  wrap('texStorage2D', function (target, levels, fmt, w, h) { const t = cur(target); if (!t) return; const e = ent(t), faces = target === 0x8513 ? 6 : 1; e.lv = {}; for (let l = 0; l < levels; l++) e.lv[l] = Math.max(1, w >> l) * Math.max(1, h >> l) * (BPP[fmt] ?? 4) * faces; e.fixed = true; });
  wrap('texStorage3D', function (target, levels, fmt, w, h, d) { const t = cur(target); if (!t) return; const e = ent(t); e.lv = {}; for (let l = 0; l < levels; l++) e.lv[l] = Math.max(1, w >> l) * Math.max(1, h >> l) * (target === 0x8C1A ? d : Math.max(1, d >> l)) * (BPP[fmt] ?? 4); e.fixed = true; });
  wrap('texImage2D', function (target, level, ifmt, a, b, c, d, e2) {
    const t = cur(target); if (!t) return; const e = ent(t); if (e.fixed) return; let w, h, bpp;
    if (typeof a === 'number' && typeof b === 'number' && arguments.length >= 8) { w = a; h = b; bpp = BPP[ifmt] ?? ((CH[d] || 4) * (TYPE[e2] || 1)); }
    else { const src = d ?? c; w = src?.width || src?.videoWidth || 0; h = src?.height || src?.videoHeight || 0; bpp = BPP[ifmt] ?? ((CH[a] || 4) * (TYPE[b] || 1)); }
    e.lv[(target >= 0x8515 && target <= 0x851A ? (target - 0x8515) * 100 : 0) + level] = w * h * bpp;
  });
  wrap('generateMipmap', function (target) { const t = cur(target); const e = t && S.tex.get(t); if (!e || e.fixed) return; const b0 = e.lv[0] || 0; e.lv.mips = Math.round(b0 / 3); });
  wrap('bindRenderbuffer', (target, r) => { S.rbBound = r; });
  wrap('deleteRenderbuffer', (r) => { S.rb.delete(r); });
  wrap('renderbufferStorage', (target, fmt, w, h) => { if (S.rbBound) S.rb.set(S.rbBound, w * h * (BPP[fmt] ?? 4)); });
  wrap('renderbufferStorageMultisample', (target, s, fmt, w, h) => { if (S.rbBound) S.rb.set(S.rbBound, w * h * (BPP[fmt] ?? 4) * Math.max(1, s)); });
};

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.addInitScript(GL_TRACK);
await page.addInitScript(() => { let a = 1; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
const reqs = [], errs = []; let t0 = Date.now();
page.on('pageerror', e => errs.push(e.message)); page.on('crash', () => { console.log('renderer crashed'); process.exit(2); }); page.on('console', m => { if (m.text().startsWith('[probe]')) console.log(m.text()); }); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('requestfinished', async (r) => { const u = new URL(r.url()); if (u.port != port) return; let size = 0; try { size = (await r.sizes()).responseBodySize; } catch { } reqs.push({ path: u.pathname.slice(1) || 'index.html', size, t: Date.now() - t0, type: r.resourceType() }); });
t0 = Date.now();
page.setDefaultTimeout(600000); await page.goto(`http://localhost:${port}/index.html${QS ? '?' + QS : ''}`, { waitUntil: 'commit' });
await page.waitForFunction(() => window.__game, null, { timeout: 600000, polling: 200 });
const tReady = await page.evaluate(async () => { await __game.ready; await __game.warmed; return performance.now(); }); console.log('ready', Math.round(tReady), 'ms');
const assetsOk = await page.evaluate(async () => { const A = await import('/js/assets.js'); return { models: A.MODEL_FILES.filter(n => !A.has(n)), sets: A.PBR_SETS.filter(n => !A.pbr(n)) }; }); console.log('missing models', assetsOk.models.join(',') || 'none', '/ texture sets', assetsOk.sets.join(',') || 'none');
await page.waitForTimeout(500);
const kindOf = (p) => p.startsWith('js/jobs/') ? 'js (jobs)' : p.startsWith('vendor/') ? 'js (vendor)' : /\.m?js$/.test(p) ? 'js (game)' : extname(p).slice(1) || 'html';
const load = {}; for (const r of reqs) { const k = kindOf(r.path), o = load[k] = load[k] || { n: 0, raw: 0, gz: 0 }; o.n++; o.raw += r.size; o.gz += gzOf(r.path); }
const tot = Object.values(load).reduce((a, o) => ({ n: a.n + o.n, raw: a.raw + o.raw, gz: a.gz + o.gz }), { n: 0, raw: 0, gz: 0 });
const lastModule = Math.max(0, ...reqs.filter(r => /\.m?js$/.test(r.path)).map(r => r.t));

const mb = (b) => (b / 1048576).toFixed(2) + ' MB';
console.log(`load: ${tot.n} requests, ${mb(tot.raw)} raw, ${mb(tot.gz)} gzip; ready ${Math.round(tReady)} ms, last module ${lastModule} ms`);
for (const [k, o] of Object.entries(load).sort((a, b) => b[1].raw - a[1].raw)) console.log(`  ${k.padEnd(12)} ${String(o.n).padStart(4)} files ${mb(o.raw).padStart(10)} raw ${mb(o.gz).padStart(10)} gzip`);
const run = await page.evaluate(async ({ DECKS, SHIP }) => {
  const g = __game, G = g.G; g.setMode('nominal'); if (SHIP != null) G.forceShip = +SHIP; G.manual = true; g.newRun(); document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); G.hp = G.maxHp = 1e6; G.phase = 'play';
  g.setQuality('high');
  // after the two frames: upload every texture any material in the scene references (what walking the whole deck would upload)
  const uploadAll = () => { const seen = new Set(); g.scene.traverse(o => { for (const m of [].concat(o.material || [])) for (const v of Object.values(m)) if (v?.isTexture && !seen.has(v)) { seen.add(v); try { g.renderer.initTexture(v); } catch { } } }); return seen.size; };
  const snap = (label) => { g.renderOnce(); g.renderOnce(); gc(); gc(); const m = g.renderer.info.memory, s = __gpu.total(), r = { label, deck: G.shipDeck, geo: m.geometries, tex: m.textures, prog: g.renderer.info.programs?.length ?? 0, gpuTexMB: +(s.tex / 1048576).toFixed(1), gpuRbMB: +(s.rb / 1048576).toFixed(1), glTex: s.ntex, heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) };
    r.refTex = uploadAll(); const s2 = __gpu.total(); r.allTexMB = +(s2.tex / 1048576).toFixed(1); r.texAll = g.renderer.info.memory.textures; return r; };
  const rows = [snap('newRun')]; console.log('[probe] ' + JSON.stringify(rows[0])); const n = G.ship.decks;
  for (let i = 1; i <= DECKS; i++) { g.loadDeck(((i) % n) + 1); G.phase = 'play'; rows.push(snap('change ' + i)); console.log('[probe] ' + JSON.stringify(rows[rows.length - 1])); }
  return { ship: G.ship.name, decks: n, rows };
}, { DECKS, SHIP }); console.log('[probe] run done');
const out = { ready_ms: Math.round(tReady), lastModule_ms: lastModule, requests: tot, load, run, errors: errs.slice(0, 10) };
console.log(`run: ${run.ship} (${run.decks} decks)`);
for (const r of run.rows) console.log(`  ${r.label.padEnd(10)} deck ${r.deck}  geometries ${String(r.geo).padStart(5)}  textures ${String(r.tex).padStart(4)}  programs ${String(r.prog).padStart(3)}  GPU tex ${String(r.gpuTexMB).padStart(6)} MB (${r.glTex} GL textures) + RB ${r.gpuRbMB} MB; all referenced uploaded: ${r.allTexMB} MB (${r.texAll} textures)  heap ${r.heapMB} MB`);
if (errs.length) console.log('page errors:', errs.slice(0, 5));
if (OUT) writeFileSync(OUT, JSON.stringify(out, null, 1));
await browser.close(); server.close();
