// Headless render-cost probe (software GL, so only RELATIVE numbers mean anything): draw calls, triangles, lights, programs, scene object counts
// and render ms per frame on High, over a few ships / spots.   node tools/perf.mjs
import { createServer } from 'node:http'; import { readFile } from 'node:fs/promises'; import { createRequire } from 'node:module'; import { join, extname, dirname } from 'node:path'; import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url), ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); const { chromium } = require('playwright');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => { try { const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html')); const b = await readFile(p); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); } }).listen(0);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } }); page.setDefaultTimeout(240000);
page.on('console', m => { if (m.text().startsWith('PERF')) console.log(m.text()); });
await page.goto(`http://localhost:${server.address().port}/index.html`);
const EXP = process.env.EXP || '', LOD = process.env.LOD ?? '';   // LOD=0: crowd LODs off (the before numbers)
const out = await page.evaluate(async ([EXP, process_LOD]) => {
  const g = __game, G = g.G; await g.ready; await g.warmed; await g.lodsSettled?.(); if (g.lodCfg && process_LOD === '0') g.lodCfg.on = false; const R = g.renderer, res = []; R.info.autoReset = false;
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
      res.push({ ship: G.ship.name, lod: g.cullStats?.lod ? g.cullStats.lod.join('/') : undefined, objs, meshes, instanced: inst, sceneLights: lights, ...info, programs: R.info.programs.length, geoms: R.info.memory.geometries, tex: R.info.memory.textures, renderMs: +times[3].toFixed(1), pix: [R.domElement.width, R.domElement.height] });
    }
    { // crowd: up to 11 of the deck's people stood in a fan 2-20 m in front of the camera (the "visible crowd" case; walls are not occlusion-culled, so they all draw)
      const hs = g.ents.filter(e => e.mesh?.userData.human && e.mesh.visible).slice(0, 11), cam = g.camera, f = cam.getWorldDirection(new g.camera.position.constructor()); f.y = 0; f.normalize();
      const D = [2, 3, 4, 5, 6.5, 8, 10, 12, 14, 17, 20], y0 = hs[0]?.mesh.position.y ?? 0;
      hs.forEach((e, i) => { const d = D[i], side = ((i % 3) - 1) * d * 0.25; e.mesh.position.set(cam.position.x + f.x * d - f.z * side, y0, cam.position.z + f.z * d + f.x * side); });
      g.scene.updateMatrixWorld(); g.renderOnce(); g.renderOnce(); let info; const times = [];
      for (let i = 0; i < 6; i++) { R.info.reset(); const a = performance.now(); g.renderOnce(); R.getContext().finish(); times.push(performance.now() - a); info = { calls: R.info.render.calls, tris: R.info.render.triangles }; }
      times.sort((a, b) => a - b); res.push({ ship: G.ship.name + ' crowd', people: hs.length, lod: g.cullStats?.lod ? g.cullStats.lod.join('/') : undefined, ...info, renderMs: +times[3].toFixed(1) });
    }
  }
  return res;
}, [EXP, LOD]);
for (const r of out) console.log(JSON.stringify(r)); const spots = out.filter(r => !r.people), avg = (k) => +(spots.reduce((a, r) => a + r[k], 0) / spots.length).toFixed(1);   // AVG = the 6 spots (comparable with earlier runs); the crowd row is printed on its own
console.log('AVG', JSON.stringify({ calls: avg('calls'), tris: avg('tris'), renderMs: avg('renderMs'), programs: avg('programs'), objs: avg('objs') }));
await browser.close(); server.close();
