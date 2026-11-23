// Synthetic crowd probe for the person LOD (js/humanlod.js): 11 people at spread ranges inside the camera frustum, triangles per frame with the LOD
// off vs on (software GL: triangles / draw calls only, no frame-time claims).   node tools/perf-crowd.mjs [distances comma list]
import { createServer } from 'node:http'; import { readFile } from 'node:fs/promises'; import { createRequire } from 'node:module'; import { join, extname, dirname } from 'node:path'; import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url), ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); const { chromium } = require('playwright');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => { try { const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html')); const b = await readFile(p); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); } }).listen(0);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } }); page.setDefaultTimeout(240000);
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto(`http://localhost:${server.address().port}/index.html`);
const DIST = (process.argv[2] || '3,6,9,12,15,18,22,26,30,36,45').split(',').map(Number);
const out = await page.evaluate(async (DIST) => {
  const g = __game, G = g.G; await g.ready; await g.warmed; const R = g.renderer; R.info.autoReset = false;
  G.forceShip = 2; G.forceSeed = 5; g.newRun(); document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); G.hp = G.maxHp = 1e6; G.phase = 'play'; G.manual = true; g.setQuality('high');
  let t = 0; for (let i = 0; i < 30; i++) { t += 1 / 30; G.phase = 'play'; g.advance(1 / 30, t); }
  const H = await import('/js/humans.js'), L = await import('/js/humanlod.js');
  const cam = g.camera; cam.updateMatrixWorld(true); const e = cam.matrixWorld.elements, V3 = cam.position.constructor, fw = new V3(-e[8], 0, -e[10]).normalize(), rt = new V3(e[0], 0, e[2]).normalize(), cp = new V3(e[12], e[13], e[14]);
  const added = [], ents0 = g.ents.length;
  DIST.forEach((d, i) => { const h = H.makeHuman({ kind: ['crew_m', 'crew_f', 'crew_f2'][i % 3], seed: 100 + i }); h.position.copy(cp).addScaledVector(fw, d).addScaledVector(rt, ((i % 5) - 2) * d * 0.12); h.position.y = 0; g.scene.add(h); g.ents.push({ mesh: h }); added.push(h); });
  const keep = new Set(added), hide = []; g.scene.traverse(o => { if (o.userData?.human && !keep.has(o) && o.visible) { o.visible = false; hide.push(o); } });   // only the probe crowd, no real crew
  const res = {};
  for (const [name, on, scale] of [['off', false, 1], ['on', true, 1], ['on, rung-3 distances (x0.6)', true, 0.6]]) {
    L.lodCfg.on = on; L.lodCfg.scale = scale; g.renderOnce(); R.info.reset(); g.renderOnce(); res[name] = { tris: R.info.render.triangles, calls: R.info.render.calls, lod: [...g.cullStats.lod], shown: g.cullStats.shown, hidden: g.cullStats.hidden };
  }
  L.lodCfg.on = true; L.lodCfg.scale = 1; res.restored = added.every(h => h.visible) && added.every(h => L.meshTris(h) > 30000 || h.userData.lod.level === 0);
  res.lodStats = L.lodStats; return res;
}, DIST);
console.log('distances', DIST.join(',')); for (const [k, v] of Object.entries(out)) console.log(k, JSON.stringify(v));
await browser.close(); server.close();
