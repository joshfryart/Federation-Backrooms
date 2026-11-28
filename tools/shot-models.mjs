// Contact sheets of the four crew body GLBs (tools/build-models.mjs before / after): headless Chromium + SwiftShader -> PNG.
//   node tools/shot-models.mjs [--out shots/chars/models/after] [--models DIR] [--sheet heads|bodies|wire|hair|walk|all] [--w 1800]
// --models DIR serves assets/models/<kind>.glb from DIR instead (A/B without swapping files, e.g. a `git show` export of the originals).
// Sheets (rows = crew_m, crew_f, crew_f2, crew_heavy; fixed seeds, so runs compare 1:1):
//   heads  : face front, three-quarter, profile, back of the head, top of the head (talk-like key + rim, close camera)
//   wire   : the same five head views flat-shaded (MeshNormalMaterial, flatShading) to judge facets / topology
//   bodies : full body front, side, back, and head + shoulders three-quarter (neck / collar / sleeve silhouettes)
//   walk   : four frames of the walk cycle (human_anims.glb retarget) front + side
//   hair   : hairline close-ups (front-up, temple, nape)
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, dirname, extname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const DBG = opt('dbg', '');
const OUT = resolve(ROOT, opt('out', 'shots/chars/models/after')), MODELS = opt('models', null) && resolve(opt('models')), W = +opt('w', 1800);
const SHEETS = (opt('sheet', 'all') === 'all' ? 'heads,wire,bodies,walk,hair' : opt('sheet')).split(',');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream' };
const PAGE = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#151a24;overflow:hidden}canvas{display:block}</style><canvas id="c"></canvas>
<script type="importmap">{"imports":{"three":"./vendor/three.module.js","three/addons/":"./vendor/addons/"}}</script>
<script type="module">
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';
import { loadModels, loadTextures } from './js/assets.js';
import { makeHuman } from './js/humans.js';
const q = new URLSearchParams(location.search), sheet = q.get('sheet'), KINDS = ['crew_m', 'crew_f', 'crew_f2', 'crew_heavy'], SEEDS = [101, 202, 303, 404];
const COLS = { heads: 5, wire: 5, bodies: 4, walk: 8, hair: 4 }[sheet], ROWS = 4, Wd = innerWidth, Hd = innerHeight;
const r = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, preserveDrawingBuffer: true });
r.setPixelRatio(1); r.setSize(Wd, Hd, false); r.toneMapping = THREE.AgXToneMapping; r.toneMappingExposure = 1.15; r.setScissorTest(true);
const s = new THREE.Scene(); s.background = new THREE.Color(0x1a1f2c);
{ const pm = new THREE.PMREMGenerator(r); s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; s.environmentIntensity = 0.45; }
const key = new THREE.DirectionalLight(0xfff0dc, 2.6); key.position.set(-2, 3, 4); s.add(key);
const rim = new THREE.DirectionalLight(0xc8d8ff, 1.2); rim.position.set(3, 2, -3); s.add(rim);
s.add(new THREE.HemisphereLight(0xdfe6ff, 0x2a2420, 0.35));
await Promise.all([loadModels(), loadTextures().catch(() => null)]);
const cells = [], V = (x, y, z) => new THREE.Vector3(x, y, z);
const wireMat = new THREE.MeshNormalMaterial({ flatShading: true });
KINDS.forEach((kind, row) => {
  const reps = sheet === 'walk' ? 4 : 1;
  for (let k = 0; k < reps; k++) {
    const g = makeHuman({ kind, seed: SEEDS[row], height: { crew_m: 1.79, crew_f: 1.66, crew_f2: 1.66, crew_heavy: 1.96 }[kind], skin: 0xd9a47c, hair: [0.42, 0.28, 0.2], uniform: 0x2456a6, style: 'plain', shadow: false, rank: 2, name: 'TEST' }); if (!g) continue;
    const H = g.userData.human; if (sheet === 'walk') { H.pose('walk', 0.05 + k * 0.24); } else { H.play('idle', { fade: 0 }); H.mixer.setTime(0.5); }
    if (H.eyes?.hold) H.eyes.hold(0, 0);
    if (q.get('dbg') === 'hairbasic') g.traverse(o => { if (o.isMesh && o.material?.name === 'hair') { const m = new THREE.MeshBasicMaterial({ map: o.material.map, color: 0xffffff, alphaTest: 0.35, side: THREE.DoubleSide }); o.material = m; } });
    if (q.get('dbg') === 'hairnorm') g.traverse(o => { if (o.isMesh && o.material?.name === 'hair') { o.material = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide }); } });
    if (sheet === 'wire') g.traverse(o => { if (o.isMesh && o.material && !/^(eyes|brows|eyelashes|hair)/.test(o.material.name || '') && o.isSkinnedMesh) { o.material = wireMat; } });
    g.position.set(row * 15 + k * 1.2, 0, 0); s.add(g); g.updateMatrixWorld(true);
    const head = H.bones.Head.getWorldPosition(V()); head.y += 0.07 * H.height / 1.75; head.z += 0.02;
    const hand = H.bones.hand_r.getWorldPosition(V()), pel = H.bones.pelvis.getWorldPosition(V());
    const add = (col, at, from, fov) => { const c = new THREE.PerspectiveCamera(fov, (Wd / COLS) / (Hd / ROWS), 0.03, 20); c.position.copy(from); c.lookAt(at); cells.push({ c, col, row, g }); };
    const orb = (at, yaw, pitch, d) => V(at.x + Math.sin(yaw) * Math.cos(pitch) * d, at.y + Math.sin(pitch) * d, at.z + Math.cos(yaw) * Math.cos(pitch) * d);
    if (sheet === 'heads' || sheet === 'wire') { const hc = head.clone(); hc.y -= 0.03;
      add(0, hc, orb(hc, 0, 0.05, 0.62), 24); add(1, hc, orb(hc, 0.65, 0.05, 0.62), 24); add(2, hc, orb(hc, 1.5708, 0.03, 0.62), 24); add(3, hc, orb(hc, Math.PI, 0.1, 0.62), 24); add(4, hc, orb(hc, 0.3, 1.25, 0.62), 24); }
    if (sheet === 'bodies') { const c = pel.clone(); c.y = H.height * 0.5; add(0, c, orb(c, 0, 0.05, 4.2), 30); add(1, c, orb(c, 1.5708, 0.05, 4.2), 30); add(2, c, orb(c, Math.PI, 0.05, 4.2), 30); const nk = H.bones.neck_01.getWorldPosition(V()); nk.y -= 0.12; add(3, nk, orb(nk, 0.6, 0.15, 1.3), 30); }
    if (sheet === 'walk') { const c = pel.clone(); c.y = H.height * 0.5; add(k, c, orb(c, 0.35, 0.05, 4.2), 30); add(4 + k, c, orb(c, 1.5708, 0.05, 4.2), 30); }
    if (sheet === 'hair') { const hc = head.clone(); add(0, hc, orb(hc, 0.15, 0.55, 0.34), 30); add(1, hc, orb(hc, 1.1, 0.15, 0.32), 30); add(2, hc, orb(hc, Math.PI - 0.3, -0.05, 0.36), 30); add(3, hc, orb(hc, Math.PI, 0.7, 0.4), 30); }
  }
});
function draw() { const cw = Wd / COLS, ch = Hd / ROWS; for (const { c, col, row, g } of cells) { for (const o of cells) o.g.visible = o.g === g; const x = col * cw, y = Hd - (row + 1) * ch; r.setViewport(x, y, cw, ch); r.setScissor(x, y, cw, ch); r.render(s, c); } }
draw();
if (q.get('dbg') === 'color') { const A = (await import('./js/assets.js')).get('crew_m'); A.scene.traverse(o => { if (o.isSkinnedMesh && o.material.name === 'body') { const c = o.geometry.attributes.color; let lo = 0; for (let i = 0; i < c.count; i++) if (c.getX(i) < 0.9 && c.getX(i) > 0.1) lo++; console.error('colorcheck', c.itemSize, c.count, lo, o.material.vertexColors); } }); }
if (q.get('dbg') === 'noflyaway') { s.traverse(o => { const u = o.isMesh && o.material?.name === 'hair' && r.properties.get(o.material).uniforms; if (u?.uHairStyle) u.uHairStyle.value = u.uHairStyle.value.clone().setW(0); }); draw(); }
requestAnimationFrame(() => { draw(); window.__ready = true; });
</script>`;
const server = createServer(async (req, res) => {
  try {
    const u = decodeURIComponent(req.url.split('?')[0]);
    if (u === '/__models.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE); return; }
    const p = MODELS && u.startsWith('/assets/models/') && /crew_/.test(u) ? join(MODELS, basename(u)) : join(ROOT, u);
    const b = await readFile(p); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  await mkdir(OUT, { recursive: true });
  for (const sheet of SHEETS) {
    const cols = { heads: 5, wire: 5, bodies: 4, walk: 8, hair: 4 }[sheet], h = Math.round(W / cols * (sheet === 'bodies' || sheet === 'walk' ? 1.6 : 1) * 4 / 1) / 1;
    const page = await browser.newPage({ viewport: { width: W, height: Math.min(4000, Math.round(h)) }, deviceScaleFactor: 1 }); page.setDefaultTimeout(300000);
    page.on('pageerror', e => console.log('pageerror', e.message)); page.on('console', m => { if (m.type() === 'error') console.log('console', m.text()); });
    const t0 = Date.now(); await page.goto(`http://localhost:${server.address().port}/__models.html?sheet=${sheet}&dbg=${DBG}`); await page.waitForFunction(() => window.__ready, null, { timeout: 300000 });
    await page.screenshot({ path: join(OUT, sheet + '.png') }); console.log('shot', join(OUT, sheet + '.png'), ((Date.now() - t0) / 1000).toFixed(1) + ' s'); await page.close();
  }
} finally { await browser.close(); server.close(); }
