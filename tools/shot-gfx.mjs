// Golden-shot harness for graphics work: 12 fixed-seed 960x540 views -> <out>/<name>.png (headless Chromium + SwiftShader; only compare runs on one machine).
//   node tools/shot-gfx.mjs [--out shots/gfx] [--compare shots/gfx-baseline] [--only a,b] [--list] [--thr 24]
//   --out DIR      where the PNGs go (default shots/gfx)
//   --compare DIR  after shooting, print per-view pixel diff % against DIR/<name>.png (a pixel differs when any channel moves > --thr, default 24/255)
//                  and exit 3 on a missing/size-mismatched file. With --only and no shooting needed use --no-shoot to just compare --out against DIR.
// Golden baseline: shots/gfx-baseline-r2 (shot with the re-seeding below, two consecutive runs < 1.5% apart per view). shots/gfx-baseline is stale: it was
// shot before Math.random was re-seeded around newRun / loadDeck (__rs) and has different game state from every later run; do not compare against it.
// Views: corridor, bridge, engineering (tall), sickbay, crowd, talk, blackout, madness-torch (game pages, ship 1 / seed 1, Math.random seeded),
//        viewer-wear, viewer-medical, viewer-stations1, models-enemies (static viewer pages, fixed camera).
// PNGs are decoded with a tiny built-in decoder (zlib from node), no extra dependencies.
import { createServer } from 'node:http';
import { readFile, mkdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { inflateSync } from 'node:zlib';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const OUT = resolve(ROOT, opt('out', 'shots/gfx')), CMP = opt('compare', null) && resolve(ROOT, opt('compare')), THR = +opt('thr', 24), ONLY = opt('only', null) ? String(opt('only')).split(',') : null;
const SEED = 1, SHIP = 1, W = 960, H = 540;
const VIEWS = ['corridor', 'bridge', 'engineering', 'sickbay', 'crowd', 'talk', 'blackout', 'madness-torch', 'viewer-wear', 'viewer-medical', 'viewer-stations1', 'models-enemies'];
if (argv.includes('--list')) { console.log(VIEWS.join('\n')); process.exit(0); }
const want = VIEWS.filter(v => !ONLY || ONLY.includes(v));

// ---- png compare (8-bit RGB/RGBA non-interlaced, which is what Playwright writes) ----
function decodePng(buf) {
  let p = 8, w, h, ct, idat = [];
  while (p < buf.length) { const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len); if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; } else if (type === 'IDAT') idat.push(d); p += 12 + len; }
  const bpp = ct === 6 ? 4 : 3, raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), o = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[o + i - bpp] : 0, b = y ? px[o - stride + i] : 0, c = i >= bpp && y ? px[o - stride + i - bpp] : 0; let v = src[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[o + i] = v & 255;
    }
  }
  return { w, h, bpp, px };
}
async function compare(name) {
  const a = join(OUT, name + '.png'), b = join(CMP, name + '.png');
  try { await access(a); await access(b); } catch { return { name, err: 'missing file' }; }
  const A = decodePng(await readFile(a)), B = decodePng(await readFile(b));
  if (A.w !== B.w || A.h !== B.h) return { name, err: `size ${A.w}x${A.h} vs ${B.w}x${B.h}` };
  let n = 0, sum = 0; const N = A.w * A.h;
  for (let i = 0; i < N; i++) { let m = 0; for (let c = 0; c < 3; c++) m = Math.max(m, Math.abs(A.px[i * A.bpp + c] - B.px[i * B.bpp + c])); sum += m; if (m > THR) n++; }
  return { name, pct: +(100 * n / N).toFixed(2), meanDelta: +(sum / N).toFixed(2) };
}

async function shoot() {
  await mkdir(OUT, { recursive: true });
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.exr': 'application/octet-stream', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.hdr': 'application/octet-stream' };
  const server = createServer(async (req, res) => { try { const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html')); const b = await readFile(p); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); } }).listen(0);
  const port = server.address().port, base = `http://localhost:${port}/`;
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const seedRandom = () => { window.__rs = () => { let s = 0x9e3779b9; Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }; window.__rs(); };   // __rs(): re-seed around newRun / loadDeck, so changes that add three.js objects (each draws Math.random for its uuid) do not shift game state
  const newPage = async () => { const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }); page.setDefaultTimeout(240000); page.on('pageerror', e => console.log('pageerror', e.message)); await page.addInitScript(seedRandom); await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = function () { return Promise.resolve(); }; }); return page; };
  const failed = [];
  const hud = (page, hide) => page.evaluate((hide) => { let st = document.getElementById('__nohud'); if (!st) { st = document.createElement('style'); st.id = '__nohud'; document.head.appendChild(st); } st.textContent = hide ? 'body > *:not(#view):not(style):not(script) { visibility: hidden !important; }' : ''; }, hide);   // the HUD carries clocks and ticker text: off for every view but the talk close-up
  const save = async (page, name) => { await page.screenshot({ path: join(OUT, name + '.png') }); console.log('shot', name); };
  const gamePage = async (url) => {
    const page = await newPage(); await page.goto(base + url);
    await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 240000 }); await page.evaluate(() => __game.ready); await page.evaluate(() => __game.warmed);
    await page.evaluate(({ seed, ship }) => { const g = __game, G = g.G; G.manual = true; G.forceShip = ship; G.forceSeed = seed; __rs(); g.newRun(); __rs(); document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); G.phase = 'play'; G.hp = G.maxHp = 1e6; document.exitPointerLock?.(); if (G.menus) G.menus.lock = () => null; g.setQuality?.('high');
      window.__sg = {   // helpers shared by every game view
        settle(n = 6) { let t = G.time || 0; for (let i = 0; i < n; i++) { t += 1 / 30; G.phase = G.phase === 'talk' ? 'talk' : 'play'; g.advance(1 / 30, t); } },
        hideEnemies() { for (const e of (g.enemies || [])) if (e.mesh) e.mesh.visible = false; },
        stand(x, z, yaw, pitch = -0.1) { const P = g.P; P.x = x; P.z = z; P.vx = P.vz = 0; P.yaw = yaw; P.pitch = pitch; },
        findRoom(match) { const order = []; for (let d = 1; d <= G.ship.decks; d++) order.push(d); for (const dn of order) { __rs(); g.loadDeck(dn); __rs(); G.phase = 'play'; const r = g.world.d.rooms.find(match); if (r) return { dn, r }; } return null; },
        // far corner of a room looking at its centre (as tools/shot-room.mjs)
        roomView(r) { const w = g.world, d = w.d, cx = r.x + (r.w >> 1), cy = r.y + (r.h >> 1), open = []; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (d.grid[y][x] === 0) open.push([x, y, Math.hypot(x - cx, y - cy)]); open.sort((a, b) => b[2] - a[2]); if (!open.length) return false; const [px, pz] = w.center(open[0][0], open[0][1]), [tx, tz] = w.center(cx, cy); this.stand(px, pz, Math.atan2(-(tx - px), -(tz - pz)), -0.22); return true; },
        frame() { g.renderOnce(); g.renderOnce(); },
      };
    }, { seed: SEED, ship: SHIP });
    await hud(page, true); return page;
  };
  const room = async (page, name, pred, extra) => {
    const ok = await page.evaluate(({ pred }) => { const S = __sg, f = new Function('r', 'return ' + pred), hit = S.findRoom(f); if (!hit) return false; const g = __game, r = g.world.d.rooms.find(q => q.x === hit.r.x && q.y === hit.r.y); S.hideEnemies(); S.settle(4); const k = S.roomView(r); S.settle(4); S.roomView(r); S.frame(); return k; }, { pred });
    if (!ok) { console.log('FAIL', name, 'no such room'); failed.push(name); return; } await save(page, name);
  };
  const run = async (name, fn) => { if (!want.includes(name)) return; try { await fn(); } catch (e) { console.log('FAIL', name, e.message); failed.push(name); } };
  try {
    const wantGame = want.some(v => ['corridor', 'bridge', 'engineering', 'sickbay', 'crowd', 'talk', 'blackout'].includes(v));
    if (wantGame) {
      const page = await gamePage('index.html?brief=0');
      await run('bridge', () => room(page, 'bridge', `r.type === 'bridge'`));
      await run('engineering', () => room(page, 'engineering', `r.type === 'engineering'`));
      await run('sickbay', () => room(page, 'sickbay', `r.type === 'sickbay'`));
      await run('corridor', async () => {   // the longest straight open run outside any room, looked down end to end
        const ok = await page.evaluate(() => { const S = __sg, g = __game, G = g.G; __rs(); g.loadDeck(1); __rs(); G.phase = 'play'; const w = g.world, d = w.d, inRoom = (x, y) => d.rooms.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
          const ys = d.grid.length, xs = d.grid[0].length, open = (x, y) => x >= 0 && y >= 0 && x < xs && y < ys && d.grid[y][x] === 0; let best = null;
          for (let y = 0; y < ys; y++) for (let x = 0; x < xs; x++) { if (!open(x, y) || inRoom(x, y)) continue; for (const [dx, dy] of [[1, 0], [0, 1]]) { if (open(x - dx, y - dy)) continue; let n = 0; while (open(x + dx * n, y + dy * n) && !inRoom(x + dx * n, y + dy * n)) n++; if (!best || n > best.n) best = { x, y, dx, dy, n }; } }
          if (!best) return false; S.hideEnemies(); const [px, pz] = w.center(best.x, best.y), [tx, tz] = w.center(best.x + best.dx * (best.n - 1), best.y + best.dy * (best.n - 1)); const yaw = Math.atan2(-(tx - px), -(tz - pz)); S.stand(px, pz, yaw, -0.03); S.settle(6); S.stand(px, pz, yaw, -0.03); S.frame(); return best.n; });
        if (!ok) throw new Error('no corridor run'); await save(page, 'corridor');
      });
      await run('crowd', async () => {   // up to 11 of the deck's people fanned 2-20 m in front of the camera (as tools/perf.mjs)
        const n = await page.evaluate(() => { const S = __sg, g = __game, G = g.G; const hit = S.findRoom(r => r.type === 'mess') || S.findRoom(r => r.big) || S.findRoom(() => true); const r = g.world.d.rooms.find(q => q.x === hit.r.x && q.y === hit.r.y); S.settle(30); S.roomView(r); S.settle(4); S.roomView(r);
          const hs = g.ents.filter(e => e.mesh?.userData.human && e.mesh.visible).sort((a, b) => (a.person?.short || '') < (b.person?.short || '') ? -1 : 1).slice(0, 11), cam = g.camera, f = cam.getWorldDirection(new cam.position.constructor()); f.y = 0; f.normalize();
          const D = [2, 3, 4, 5, 6.5, 8, 10, 12, 14, 17, 20], y0 = hs[0]?.mesh.position.y ?? 0; hs.forEach((e, i) => { const d = D[i], side = ((i % 3) - 1) * d * 0.25; e.mesh.position.set(cam.position.x + f.x * d - f.z * side, y0, cam.position.z + f.z * d + f.x * side); });
          g.scene.updateMatrixWorld(); S.frame(); return hs.length; });
        if (!n) throw new Error('no crew'); await save(page, 'crowd');
      });
      await run('talk', async () => {
        const who = await page.evaluate(async () => { const S = __sg, g = __game, G = g.G; S.settle(10); let best = null;
          for (let dn = 1; dn <= G.ship.decks && !best; dn++) { __rs(); g.loadDeck(dn); __rs(); G.phase = 'play'; S.settle(20); const c = g.ents.filter(e => e.kind === 'crew' && e.person && !e.fake && e.mesh?.userData.human && e.mesh.visible && !e.walk && !e.repairing && e.turning === undefined && !e.cower); if (c.length) best = c[0]; }
          if (!best) return null; const e = best, P = g.P, y0 = e.mesh.rotation.y; let px = e.x, pz = e.z; for (const da of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.5, -2.5, 3.14]) { px = e.x + Math.sin(y0 + da) * 1.3; pz = e.z + Math.cos(y0 + da) * 1.3; const [tx, ty] = g.world.tile(px, pz); if (!g.world.solid(tx, ty) && g.world.los(px, pz, e.x, e.z)) break; }
          S.stand(px, pz, Math.atan2(-(e.x - px), -(e.z - pz)), 0); for (let i = 0; i < 3; i++) { g.advance(1 / 30); g.renderOnce(); }
          if (!g.talk.begin(e)) return null; for (let i = 0; i < 40; i++) { g.advance(1 / 30); g.menus?.frame?.(1 / 30); g.renderOnce(); } return e.person.short; });
        if (!who) throw new Error('talk did not start'); await hud(page, false); await save(page, 'talk'); await hud(page, true);
        await page.evaluate(() => { __game.talk.end?.(); __game.G.phase = 'play'; });
      });
      await run('blackout', async () => {
        await page.evaluate(() => { const S = __sg, g = __game, G = g.G; __rs(); g.loadDeck(1); __rs(); G.phase = 'play'; S.hideEnemies(); const hit = S.findRoom(r => r.type === 'corridor' || r.type === 'mess' || r.type === 'lounge') || S.findRoom(() => true); const r = g.world.d.rooms.find(q => q.x === hit.r.x && q.y === hit.r.y); S.roomView(r); S.settle(4);
          G.blackout = 1e6; g.world.setPower(false); let t = G.time || 0; for (let i = 0; i < 120; i++) { t += 1 / 30; G.phase = 'play'; G.blackout = 1e6; g.advance(1 / 30, t); } S.roomView(r); S.frame(); });
        await save(page, 'blackout');
      });
      await page.close();
    }
    await run('madness-torch', async () => {   // roguelike page, torch on (it is the only strong light there)
      const page = await gamePage('index.html?mode=madness&brief=0');
      await page.evaluate(() => { const S = __sg, g = __game, G = g.G; __rs(); g.loadDeck?.(1); __rs(); G.phase = 'play'; S.hideEnemies(); const d = g.world.d, w = g.world, open = d.openTiles || []; if (open.length) { const [x, y] = open[Math.floor(open.length * 0.3)], [px, pz] = w.center(x, y); S.stand(px, pz, 0.8, -0.05); } g.P.torch = true; S.settle(10); S.frame(); });
      await save(page, 'madness-torch'); await page.close();
    });
    const viewer = async (name, url, settleMs = 4000) => run(name, async () => {
      const page = await newPage(); await page.goto(base + url); await page.waitForLoadState('load'); await page.waitForTimeout(settleMs);
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); await save(page, name); await page.close();
    });
    await viewer('viewer-wear', 'viewer-wear.html'); await viewer('viewer-medical', 'viewer-medical.html'); await viewer('viewer-stations1', 'viewer-stations1.html'); await viewer('models-enemies', 'models.html?set=enemies');
  } finally { await browser.close(); server.close(); }
  return failed;
}

let failed = [];
if (!argv.includes('--no-shoot')) failed = await shoot();
let code = failed.length ? 1 : 0;
if (CMP) {
  console.log(`compare ${OUT} vs ${CMP} (threshold ${THR}/255 per channel)`);
  let worst = 0;
  for (const v of want) { const r = await compare(v); if (r.err) { console.log(`  ${v.padEnd(18)} ERROR ${r.err}`); code = 3; } else { worst = Math.max(worst, r.pct); console.log(`  ${v.padEnd(18)} ${String(r.pct).padStart(6)}% pixels differ, mean delta ${r.meanDelta}`); } }
  console.log(`worst ${worst}%`);
}
process.exit(code);
