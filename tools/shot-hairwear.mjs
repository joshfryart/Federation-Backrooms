// Close-up shots of hair and clothes (headless Chromium + SwiftShader; fixed seeds, fixed cameras): <out>/<name>.png
//   flock /tmp/gfx-probe.lock node tools/shot-hairwear.mjs [--out shots/chars/c5/after] [--only head-crew_m,...] [--list]
// Views: head-<kind> (3/4 front), back-<kind> (3/4 back of the head), torso-<kind> (chest / shoulders / sleeve), legs-<kind>, styles (a row of heads, one per
// hairstyle), wear-<outfit> (coverall / scrubs / whites upper body). Lit like models.html (RoomEnvironment + one shadowed key) plus a cool rim light.
// Software GL only: judge shapes and patterns here, not real-GPU speed.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const OUT = resolve(ROOT, opt('out', 'shots/chars/c5/after')), ONLY = opt('only', null)?.split(',');
const KINDS = ['crew_m', 'crew_f', 'crew_f2', 'crew_heavy'];
const VIEWS = [...KINDS.map(k => 'head-' + k), ...KINDS.map(k => 'back-' + k), ...KINDS.map(k => 'torso-' + k), 'legs-crew_m', 'legs-crew_f', 'styles-crew_m', 'styles-crew_f', 'styles-crew_f2', 'styles-crew_heavy', 'wear-coverall', 'wear-scrubs', 'wear-whites'];
if (argv.includes('--list')) { console.log(VIEWS.join('\n')); process.exit(0); }
const want = VIEWS.filter(v => !ONLY || ONLY.includes(v));

const PAGE = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#000;overflow:hidden}canvas{display:block}</style><canvas id="c"></canvas>
<script type="importmap">{"imports":{"three":"./vendor/three.module.js","three/addons/":"./vendor/addons/"}}</script>
<script type="module">
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';
import { loadModels, loadTextures } from './js/assets.js';
import { makeHuman, DIVISIONS } from './js/humans.js';
import { wearOutfit } from './js/wearart.js';
const W = 720, H = 720, r = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, preserveDrawingBuffer: true });
r.setPixelRatio(1); r.setSize(W, H, false); r.shadowMap.enabled = true; r.toneMapping = THREE.AgXToneMapping; r.toneMappingExposure = 1.1;
const s = new THREE.Scene(); s.background = new THREE.Color(0x1a1f2c);
{ const pm = new THREE.PMREMGenerator(r); s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; s.environmentIntensity = 0.55; }
const key = new THREE.DirectionalLight(0xfff0d8, 2.4); key.position.set(3, 6, 6); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -2, right: 2, top: 3, bottom: -1 }); key.shadow.bias = -0.0004; s.add(key);
const rim = new THREE.DirectionalLight(0x9fc4ff, 1.2); rim.position.set(-4, 3, -5); s.add(rim);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x2a3040, roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
await Promise.all([loadModels(), loadTextures()]);
const cam = new THREE.PerspectiveCamera(30, W / H, 0.02, 50);
const stage = new THREE.Group(); s.add(stage);
const clear = () => { while (stage.children.length) stage.remove(stage.children[0]); };
const person = (kind, o = {}) => { const h = makeHuman({ kind, seed: o.seed ?? 11, uniform: o.uniform ?? DIVISIONS[2], rank: 2, name: 'OKAFOR', style: o.style, hair: o.hair, hairStyle: o.hairStyle, height: o.height }); const Hm = h.userData.human; Hm.play(o.clip || 'idle', { fade: 0 }); Hm.mixer.setTime(0.6); Hm.update(0); h.position.x = o.x || 0; stage.add(h); h.updateMatrixWorld(true); return h; };
const bone = (h, n) => h.userData.human.bones[n].getWorldPosition(new THREE.Vector3());
function look(p, off, fov = 30) { cam.fov = fov; cam.updateProjectionMatrix(); cam.position.copy(p).add(off); cam.lookAt(p); }
window.__shot = (name) => {
  clear(); const [v, k] = name.split('-');
  if (v === 'head' || v === 'back') { const h = person(k); const p = bone(h, 'Head').add(new THREE.Vector3(0, 0.07, 0)); look(p, v === 'head' ? new THREE.Vector3(0.32, 0.05, 0.62) : new THREE.Vector3(-0.42, 0.12, -0.55), 30); }
  else if (v === 'torso') { const h = person(k, { style: 'trim' }); const p = bone(h, 'spine_03').add(new THREE.Vector3(0.05, -0.02, 0)); look(p, new THREE.Vector3(0.55, 0.1, 1.05), 30); }
  else if (v === 'legs') { const h = person(k, { style: 'duty' }); const p = bone(h, 'pelvis').add(new THREE.Vector3(0, -0.35, 0)); look(p, new THREE.Vector3(0.6, 0.05, 1.5), 30); }
  else if (v === 'styles') { const n = 5, hs = []; for (let i = 0; i < n; i++) { const h = person(k, { seed: 11, x: (i - (n - 1) / 2) * 0.3, hairStyle: i, height: k === 'crew_f2' || k === 'crew_f' ? 1.68 : 1.8 }); h.rotation.y = i % 2 ? 2.4 : 0.6; h.position.z = -0.3 * (i % 2); hs.push(h); } s.updateMatrixWorld(true); const y = bone(hs[2], 'Head').y + 0.02; look(new THREE.Vector3(0, y - 0.05, 0), new THREE.Vector3(0.0, 0.25, 3.6), 21); }
  else if (v === 'wear') { const kk = k === 'scrubs' ? 'crew_f' : 'crew_m'; const h = person(kk); wearOutfit(h, k, {}); const p = bone(h, 'spine_03').add(new THREE.Vector3(0, -0.12, 0)); look(p, new THREE.Vector3(0.6, 0.1, 1.35), 30); }
  s.updateMatrixWorld(true); r.render(s, cam); r.render(s, cam); return r.domElement.toDataURL('image/png');
};
window.__ready = true;
</script>`;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ktx2': 'image/ktx2', '.hdr': 'application/octet-stream' };
const server = createServer(async (req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]); if (u === '/__hairwear.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE); return; }
  try { const p = join(ROOT, u); const b = await readFile(p); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  await mkdir(OUT, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 720, height: 720 } }); page.setDefaultTimeout(240000);
  page.on('pageerror', e => console.log('pageerror', e.message)); page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('console', m.text().slice(0, 300)); });
  await page.addInitScript(() => { let s = 0x9e3779b9; Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
  await page.goto(`http://localhost:${server.address().port}/__hairwear.html`); await page.waitForFunction(() => window.__ready);
  for (const v of want) { const t0 = Date.now(); const url = await page.evaluate((n) => window.__shot(n), v); await writeFile(join(OUT, v + '.png'), Buffer.from(url.split(',')[1], 'base64')); console.log('shot', v, Date.now() - t0, 'ms'); }
} finally { await browser.close(); server.close(); }
