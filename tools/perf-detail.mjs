// Where do the triangles go?  Lists the biggest in-frustum contributors for one view.   node tools/perf-detail.mjs [shipIndex]
import { createServer } from 'node:http'; import { readFile } from 'node:fs/promises'; import { createRequire } from 'node:module'; import { join, extname, dirname } from 'node:path'; import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url), ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); const { chromium } = require('playwright');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => { try { const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html')); const b = await readFile(p); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); } }).listen(0);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } }); page.setDefaultTimeout(240000);
await page.goto(`http://localhost:${server.address().port}/index.html`);
const out = await page.evaluate(async ([ship, PS]) => {
  const THREE = await import('three'); const g = __game, G = g.G; await g.ready; await g.warmed;
  G.forceShip = ship; G.forceSeed = 11; g.newRun(); document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); G.phase = 'play'; G.manual = true; g.setQuality('high');
  let t = 0; for (let i = 0; i < 60; i++) { t += 1 / 30; G.phase = 'play'; g.advance(1 / 30, t); }
  const open = g.world.d.openTiles, [x, y] = open[Math.floor(open.length * +(PS || 0.5))]; g.P.x = (x + 0.5) * 4; g.P.z = (y + 0.5) * 4; for (let i = 0; i < 20; i++) { t += 1 / 30; g.advance(1 / 30, t); }
  g.scene.updateMatrixWorld(); g.camera.updateMatrixWorld(); const fr = new THREE.Frustum(), m = new THREE.Matrix4().multiplyMatrices(g.camera.projectionMatrix, g.camera.matrixWorldInverse); fr.setFromProjectionMatrix(m);
  const rows = {}; let total = 0, calls = 0;
  g.scene.traverse(o => {
    if (!o.isMesh || !o.geometry) return; let v = true; for (let p = o; p; p = p.parent) if (!p.visible) { v = false; break; } if (!v) return;
    if (o.frustumCulled && !o.isInstancedMesh) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); const s = o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld); if (!fr.intersectsSphere(s)) return; }
    const idx = o.geometry.index, tr = (idx ? idx.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); total += tr; calls++;
    const par = (() => { let p = o.parent; while (p && !p.name && p.parent) p = p.parent; return p?.name || ''; })();
    const k = (o.isInstancedMesh ? 'inst ' : 'mesh ') + (o.name || par || o.material?.name || o.material?.type) + ' ' + (o.material?.type || '');
    (rows[k] ||= { tris: 0, n: 0 }); rows[k].tris += tr; rows[k].n++;
  });
  return { total, calls, rows: Object.entries(rows).sort((a, b) => b[1].tris - a[1].tris).sort((a, b) => b[1].n - a[1].n).slice(0, 10).map(([k, v]) => `${Math.round(v.tris)}\t${v.n}\t${k}`) };
}, [+(process.argv[2] ?? 0), process.argv[3]]);
console.log(out.total, 'tris (single pass, frustum-tested),', out.calls, 'meshes'); console.log(out.rows.join('\n'));
await browser.close(); server.close();
