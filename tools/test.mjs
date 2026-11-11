// Headless smoke test:  node tools/test.mjs   (needs `playwright` + Chromium; starts its own static server)
// 1) generator: every chip and the exit are reachable on decks 0-11 × 25 seeds
// 2) bot run: collect chips, ride the lift, pick a perk, through to the win screen, with every enemy type ticking
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.exr': 'application/octet-stream', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try { const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html')); const b = await readFile(p); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port; const errors = []; let failed = false;
const fail = (m) => { failed = true; console.log('FAIL', m); };
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://localhost:${port}/index.html`);
await page.evaluate(async () => { await __game.ready; __game.setQuality('low'); });

const gen = await page.evaluate(async () => {
  const { generate } = await import('./js/world.js'); const bad = []; let n = 0;
  for (let deck = 0; deck < 12; deck++) for (let seed = 1; seed <= 25; seed++) {
    const d = generate(deck, seed * 7919 + deck); n++;
    const W = d.W, H = d.H, seen = new Uint8Array(W * H), q = [d.start]; seen[d.start[0] + d.start[1] * W] = 1;
    while (q.length) { const [x, y] = q.pop(); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + a, ny = y + b; if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[nx + ny * W] || d.grid[ny][nx] !== 0) continue; seen[nx + ny * W] = 1; q.push([nx, ny]); } }
    // the exit tile itself may be a special tile; accept it if a neighbour is reachable
    const ok = ([x, y]) => seen[x + y * W] || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => seen[x + a + (y + b) * W]);
    if (!d.chips.every(ok) || !ok(d.exit)) bad.push(`deck ${deck} seed ${seed}`);
  }
  return { n, bad };
});
console.log(`generator: ${gen.n} levels, ${gen.bad.length} unreachable`); if (gen.bad.length) fail('generator: ' + gen.bad.slice(0, 5).join('; '));

const run = await page.evaluate(async () => {
  const g = __game, kinds = new Set(); g.newRun(); g.setQuality('low');
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('show'));
  const key = (code) => { for (const t of ['keydown', 'keyup']) document.dispatchEvent(new KeyboardEvent(t, { code, key: code.replace('Key', '').replace('Digit', '').toLowerCase(), bubbles: true })); };
  let t = 0; const tick = (n) => { for (let i = 0; i < n; i++) { t += 1 / 30; g.step(1 / 30, t); } };
  const log = [];
  for (let guard = 0; guard < 14 && g.G.phase !== 'win'; guard++) {
    if (g.G.phase === 'paused') g.G.phase = 'play';
    const deck = g.G.deck; g.G.hp = g.G.maxHp = 1e6;
    for (const e of g.gorns) { e.delay = 0; kinds.add(e.kind); }
    tick(90);                                              // let every enemy wake, move and animate
    for (const e of g.ents.filter(e => e.kind === 'crew' || e.kind === 'body' || e.kind === 'emh')) { g.P.x = e.x + 0.6; g.P.z = e.z; tick(3); key('KeyE'); tick(3); }
    for (const e of g.gorns) kinds.add(e.kind);
    for (const c of g.world.d.chips) { const [x, z] = g.world.center(c[0], c[1]); g.P.x = x; g.P.z = z; tick(4); }
    const need = g.world.d.chips.length; if (g.G.chips < need) return { err: `deck ${deck}: chips ${g.G.chips}/${need}`, log };
    g.P.x = g.world.liftPos.x; g.P.z = g.world.liftPos.z; tick(4); key('KeyE');
    await new Promise(r => setTimeout(r, 2600)); tick(4);
    if (g.G.phase === 'perk') { key('Digit1'); await new Promise(r => setTimeout(r, 300)); }
    if (g.G.phase === 'paused') { document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); g.G.phase = 'play'; }   // no pointer lock in headless
    log.push(`${deck}→${g.G.deck}:${g.G.phase}`);
    if (g.G.deck === deck && g.G.phase !== 'win') return { err: `deck ${deck} did not advance (phase ${g.G.phase})`, log };
  }
  return { phase: g.G.phase, deck: g.G.deck, kinds: [...kinds], log };
});
console.log('bot run:', JSON.stringify(run)); if (run.err || run.phase !== 'win') fail('bot run');
if (errors.length) fail('page errors:\n  ' + [...new Set(errors)].slice(0, 8).join('\n  '));
await browser.close(); server.close();
console.log(failed ? 'FAILED' : 'OK'); process.exit(failed ? 1 : 0);
