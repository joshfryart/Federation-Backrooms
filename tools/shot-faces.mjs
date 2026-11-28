// Face close-ups for the face shape morphs (js/faceshape.js): viewer-faces.html in headless Chromium + SwiftShader -> PNG.
//   node tools/shot-faces.mjs [--out shots/faces] [--q "n=12&cols=4"] [--name faces] [--w 1280] [--h 960] [--info]
// --info also prints the landmark rig per body kind (canonical frame, mm).
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const OUT = resolve(ROOT, opt('out', 'shots/faces')), Q = opt('q', ''), NAME = opt('name', 'faces'), W = +opt('w', 1280), H = +opt('h', 960);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream' };
const server = createServer(async (req, res) => { try { const p = join(ROOT, decodeURIComponent(req.url.split('?')[0])); const b = await readFile(p); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); } }).listen(0);
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  await mkdir(OUT, { recursive: true });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }); page.setDefaultTimeout(300000);
  page.on('pageerror', e => console.log('pageerror', e.message)); page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('console', m.type(), m.text()); });
  const t0 = Date.now(); await page.goto(`http://localhost:${server.address().port}/viewer-faces.html?${Q}`); await page.waitForFunction(() => window.__ready, null, { timeout: 300000 });
  await page.screenshot({ path: join(OUT, NAME + '.png') }); console.log('shot', join(OUT, NAME + '.png'), ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  if (argv.includes('--info')) console.log(await page.evaluate(async () => {
    const F = await import('./js/faceshape.js'), out = {}, f = (a) => a && Array.from(a, v => +(v * 1000).toFixed(1));
    for (const k of ['crew_m', 'crew_f', 'crew_f2', 'crew_heavy']) { const r = F.faceRig(k); if (!r) continue; const L = r.L;
      out[k] = { u: +L.u.toFixed(3), N: f(L.N), My: +(L.My * 1000).toFixed(1), mw: +(L.mw * 1000).toFixed(1), Mz: +(L.Mz * 1000).toFixed(1), C: f(L.C), Cb: +(L.Cb * 1000).toFixed(1), hw: +(L.hw * 1000).toFixed(1), ear: f([L.ear.y, L.ear.z, L.ear.root]) }; }
    out.stats = F.faceShapeStats;
    // morph counts per shaped mesh and its crowd LODs (must match: same program for every level)
    const ML = await import('./js/meshlod.js'), A = await import('./js/assets.js'); await ML.lodsSettled(); out.lods = {};
    for (const k of ['crew_m', 'crew_f', 'crew_f2', 'crew_heavy']) A.get(k)?.scene.traverse(o => { if (!o.isSkinnedMesh || !o.geometry.morphAttributes.position) return; const g = o.geometry;
      out.lods[k + ':' + o.material.name] = (g.userData.lods || [g]).map(l => `${l.morphAttributes.position.length}p/${(l.morphAttributes.normal || []).length}n/${l.index ? l.index.count / 3 : 0}t`).join(' '); });
    return JSON.stringify(out); }));
} finally { await browser.close(); server.close(); }
