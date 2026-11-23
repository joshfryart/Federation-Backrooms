// Headless render-cost probe (software GL, so only RELATIVE numbers mean anything): draw calls, triangles, lights, programs, scene object counts
// and render ms per frame on High, over a few ships / spots.   node tools/perf.mjs
// `lod` = people drawn at [full, LOD1, LOD2] detail in the last frame (js/humanlod.js).  A/B the person LOD:  EXP='g.lodCfg.on=false' node tools/perf.mjs
import { createServer } from 'node:http'; import { readFile } from 'node:fs/promises'; import { createRequire } from 'node:module'; import { join, extname, dirname } from 'node:path'; import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url), ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); const { chromium } = require('playwright');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => { try { const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html')); const b = await readFile(p); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); } }).listen(0);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } }); page.setDefaultTimeout(240000);
page.on('console', m => { if (m.text().startsWith('PERF')) console.log(m.text()); });
await page.goto(`http://localhost:${server.address().port}/index.html`);
const EXP = process.env.EXP || '';
const out = await page.evaluate(async (EXP) => {
  const g = __game, G = g.G; await g.ready; await g.warmed; const R = g.renderer, res = []; R.info.autoReset = false;
  for (const [ship, seed] of [[0, 11], [2, 5], [4, 99]]) {
    G.forceShip = ship; G.forceSeed = seed; g.newRun(); document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); G.hp = G.maxHp = 1e6; G.phase = 'play'; G.manual = true; g.setQuality('high');
    let t = 0; for (let i = 0; i < 60; i++) { t += 1 / 30; G.phase = 'play'; g.advance(1 / 30, t); }
    const sc = g.scene; let objs = 0, meshes = 0, inst = 0, lights = 0; sc.traverse(o => { objs++; if (o.isMesh) { meshes++; if (o.isInstancedMesh) inst++; } if (o.isLight) lights++; }); const lt = []; sc.traverse(o => { if (o.isLight) lt.push(o.type.replace('Light', '') + (o.visible ? '' : '(off)') + (o.castShadow ? 'S' : '') + (o.parent === sc ? '' : '^')); }); console.log('PERF lights ' + lt.join(' '));
    const open = g.world.d.openTiles, spots = [0, 0.5].map(k => { const [x, y] = open[Math.floor(open.length * k)]; return [(x + 0.5) * 4, (y + 0.5) * 4]; });
    for (const [sx, sz] of spots) {
      g.P.x = sx; g.P.z = sz; for (let i = 0; i < 20; i++) { t += 1 / 30; g.advance(1 / 30, t); }
      if (EXP) new Function('g', EXP)(g); g.renderOnce(); g.renderOnce(); const times = []; let info;
      for (let i = 0; i < 6; i++) { R.info.reset(); const a = performance.now(); g.renderOnce(); R.getContext().finish(); times.push(performance.now() - a); info = { calls: R.info.render.calls, tris: R.info.render.triangles }; }
      times.sort((a, b) => a - b);
      res.push({ ship: G.ship.name, lod: [...g.cullStats.lod], shown: g.cullStats.shown, objs, meshes, instanced: inst, sceneLights: lights, ...info, programs: R.info.programs.length, geoms: R.info.memory.geometries, tex: R.info.memory.textures, renderMs: +times[3].toFixed(1), pix: [R.domElement.width, R.domElement.height] });
    }
  }
  return res;
}, EXP);
for (const r of out) console.log(JSON.stringify(r)); const avg = (k) => +(out.reduce((a, r) => a + r[k], 0) / out.length).toFixed(1);
console.log('AVG', JSON.stringify({ calls: avg('calls'), tris: avg('tris'), renderMs: avg('renderMs'), programs: avg('programs'), objs: avg('objs'), shown: avg('shown'), lod: [0, 1, 2].map(i => +(out.reduce((a, r) => a + r.lod[i], 0) / out.length).toFixed(1)) }));
await browser.close(); server.close();
