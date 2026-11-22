// Screenshot one room type in the running game (headless Chromium + the software renderer), modeled on tools/shot-jobs.mjs.
//   node tools/shot-room.mjs <type> <seed> [--ship i] [--nth k] [--out file] [--dsf 1] [--quality high|low] [--views 2]
//   <type>    a room type (js/data.js ROOMS key; _tall = the first big tall room), <seed> the run seed (G.forceSeed)
//   Starts its own static server. Systems Nominal run on ship i (default 1); finds the deck with the room (G.plan, else scans every deck),
//   stands in the room's far corner from its centre, looks across it, and writes /tmp/shot-room-<type>-<seed>[-v].png (or --out).
//   Prints the room's rect and its prop list. Reuse --seed to compare before / after an edit to js/rooms/<type>.js.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const [type, seedArg] = pos; if (!type) { console.log('usage: node tools/shot-room.mjs <type> <seed> [--ship i] [--nth k] [--out file] [--dsf 1] [--quality high|low] [--views 2]'); process.exit(2); }
const SEED = +(seedArg ?? 1), SHIP = +opt('ship', 1), NTH = +opt('nth', 0), DSF = +opt('dsf', 1), QUALITY = opt('quality', 'high'), VIEWS = +opt('views', 2);
const OUT = opt('out', `/tmp/shot-room-${type}-${SEED}.png`);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.exr': 'application/octet-stream', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try { const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html')); const b = await readFile(p); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;
const { chromium } = createRequire(import.meta.url)('playwright');   // the pre-installed Playwright (CommonJS), as tools/test.mjs loads it
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: DSF });
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = function () { return Promise.resolve(); }; });
  await page.goto(`http://localhost:${port}/index.html?brief=0`);
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 180000 }); await page.evaluate(() => __game.ready); await page.evaluate(() => __game.warmed);
  const info = await page.evaluate(({ type, seed, ship, nth, quality }) => {
    const g = __game, G = g.G, P = g.P; G.manual = true; G.forceShip = ship; G.forceSeed = seed; g.newRun(); document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); G.phase = 'play'; G.hp = G.maxHp = 1e6;
    document.exitPointerLock?.(); if (G.menus) G.menus.lock = () => null; g.setQuality?.(quality);
    const match = (r) => type === '_tall' ? (r.big || r.type === 'atrium') && ['shuttlebay', 'cargo', 'engineering', 'arboretum', 'mess', 'atrium'].includes(r.type) : r.type === type;
    const found = [];
    const pl = G.plan?.[type]; const order = []; if (pl) for (const p of pl) order.push(p.deckNo); for (let d = 1; d <= G.ship.decks; d++) if (!order.includes(d)) order.push(d);
    for (const dn of order) { g.loadDeck(dn); G.phase = 'play'; for (const r of g.world.d.rooms) if (match(r)) found.push({ dn, r }); if (found.length > nth) break; }
    const hit = found[nth]; if (!hit) return { error: `no ${type} room on ship ${ship} seed ${seed} (try another seed or --ship)` };
    if (g.world.d.deck !== hit.dn - 1) { g.loadDeck(hit.dn); G.phase = 'play'; }
    const w = g.world, d = w.d, r = d.rooms.find(q => q.x === hit.r.x && q.y === hit.r.y);
    for (const e of (g.enemies || [])) if (e.mesh) e.mesh.visible = false;
    const cx = r.x + (r.w >> 1), cy = r.y + (r.h >> 1), open = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (d.grid[y][x] === 0) open.push([x, y, Math.hypot(x - cx, y - cy)]);
    open.sort((a, b) => b[2] - a[2]);
    const views = open.slice(0, 1).concat(open.filter(t => open[0] && Math.hypot(t[0] - open[0][0], t[1] - open[0][1]) >= Math.max(r.w, r.h) - 1).slice(0, 1));
    const props = d.props.filter(p => p.tx >= r.x && p.tx < r.x + r.w && p.ty >= r.y && p.ty < r.y + r.h).map(p => `${p.kind}@${p.tx},${p.ty}`);
    window.__shotViews = views.map(([x, y]) => { const [px, pz] = w.center(x, y), [tx, tz] = w.center(cx, cy); return { px, pz, yaw: Math.atan2(-(tx - px), -(tz - pz)) }; });
    return { deckNo: hit.dn, room: `${r.type} ${r.x},${r.y} ${r.w}x${r.h}${r.big ? ' big' : ''}`, props, views: window.__shotViews.length };
  }, { type, seed: SEED, ship: SHIP, nth: NTH, quality: QUALITY });
  if (info.error) { console.log(info.error); code = 1; }
  else {
    const outs = [];
    for (let v = 0; v < Math.min(VIEWS, info.views); v++) {
      await page.evaluate((v) => { const g = __game, P = g.P, s = window.__shotViews[v]; P.x = s.px; P.z = s.pz; P.yaw = s.yaw; P.pitch = -0.22; let t = g.G.time || 0; for (let i = 0; i < 4; i++) { t += 1 / 30; g.step(1 / 30, t); } P.x = s.px; P.z = s.pz; P.yaw = s.yaw; P.pitch = -0.22; g.renderOnce(); }, v);
      const f = v ? OUT.replace(/\.png$/, `-${v + 1}.png`) : OUT; await page.screenshot({ path: f }); outs.push(f);
    }
    console.log(JSON.stringify({ ...info, files: outs }, null, 1));
  }
  await page.close();
} finally { await browser.close(); server.close(); }
process.exit(code);
