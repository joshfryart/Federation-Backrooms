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
  const { generate } = await import('./js/world.js'); const bad = []; let n = 0, tubes = 0, withTubes = 0;
  for (let deck = 0; deck < 12; deck++) for (let seed = 1; seed <= 25; seed++) {
    const d = generate(deck, seed * 7919 + deck); n++;
    const W = d.W, H = d.H, seen = new Uint8Array(W * H), q = [d.start]; seen[d.start[0] + d.start[1] * W] = 1;
    while (q.length) { const [x, y] = q.pop(); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + a, ny = y + b; if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[nx + ny * W] || d.grid[ny][nx] !== 0) continue; seen[nx + ny * W] = 1; q.push([nx, ny]); } }
    // the exit tile itself may be a special tile; accept it if a neighbour is reachable
    const ok = ([x, y]) => seen[x + y * W] || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => seen[x + a + (y + b) * W]);
    if (!d.chips.every(ok) || !ok(d.exit)) bad.push(`deck ${deck} seed ${seed}`);
    tubes += d.tubes.length; if (d.tubes.length) withTubes++;
  }
  return { n, bad, tubes, withTubes };
});
console.log(`generator: ${gen.n} levels, ${gen.bad.length} unreachable, ${gen.tubes} Jiffy tubes on ${gen.withTubes} levels`); if (gen.withTubes < gen.n * 0.5) fail('too few tubes'); if (gen.bad.length) fail('generator: ' + gen.bad.slice(0, 5).join('; '));

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
    for (let k = 0; k < 4 && g.G.phase === 'play'; k++) { g.P.clung = 0; g.P.kbx = g.P.kbz = 0; g.P.x = g.world.liftPos.x; g.P.z = g.world.liftPos.z; tick(2); key('KeyE'); tick(1); }
    await new Promise(r => setTimeout(r, 2600)); tick(4);
    if (g.G.phase === 'perk') { key('Digit1'); await new Promise(r => setTimeout(r, 300)); }
    if (g.G.phase === 'paused') { document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); g.G.phase = 'play'; }   // no pointer lock in headless
    log.push(`${deck}→${g.G.deck}:${g.G.phase}`);
    if (g.G.deck === deck && g.G.phase !== 'win') return { err: `deck ${deck} did not advance (phase ${g.G.phase})`, log };
  }
  return { phase: g.G.phase, deck: g.G.deck, kinds: [...kinds], log };
});
const park = await page.evaluate(async () => {
  const g = __game, P = g.P, r = {}; g.newRun(); const w = g.world; g.setQuality('low'); document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); g.G.phase = 'play'; g.G.hp = 1e6; for (const e of g.gorns) { e.dead = true; e.delay = 1e9; e.mesh.visible = false; } g.gorns.length = 0; P.clung = 0;
  const key = (code) => { g.G.phase = 'play'; for (const t of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(t, { code })); };
  await new Promise(r => setTimeout(r, 300));
  let t = 100; const tick = (n) => { for (let i = 0; i < n; i++) { t += 1 / 60; g.step(1 / 60, t); } };
  const c = w.center(w.d.start[0], w.d.start[1]); P.x = c[0]; P.z = c[1]; tick(5);
  // jump: leaves the floor, comes back
  key('Space'); let peak = 0; for (let i = 0; i < 80; i++) { tick(1); peak = Math.max(peak, P.y); } r.jumpPeak = +peak.toFixed(2); r.landed = P.grounded && P.y === 0;
  // mantle: stand next to a climbable prop, face it, jump
  const reset = () => { P.y = 0; P.vx = P.vz = P.vy = 0; P.mode = 'ground'; P.grounded = true; P.grapCd = 0; P.clung = 0; g.G.stamina = 100; };
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const prop = w.d.props.find(p => isFinite(w.topAt(p.tx, p.ty)) && NB.some(([a, b]) => w.grid[p.ty + b]?.[p.tx + a] === 0));
  if (prop) { const [a, b] = NB.find(([a, b]) => w.grid[prop.ty + b]?.[prop.tx + a] === 0); const pc = w.center(prop.tx, prop.ty);
    reset(); P.x = pc[0] + a * 1.4; P.z = pc[1] + b * 1.4; P.yaw = Math.atan2(a, b); tick(3); key('Space'); tick(70);
    r.mantleTop = +w.topAt(prop.tx, prop.ty).toFixed(2); r.mantleY = +P.y.toFixed(2); r.mantled = Math.abs(P.y - w.topAt(prop.tx, prop.ty)) < 0.02; }
  // grapple: aim down the longest straight run from the start tile, slightly upward; expect to be reeled off the floor
  const [sx, sy] = w.d.start; let best = null;
  for (const [dx, dy, yaw] of [[1, 0, -Math.PI / 2], [-1, 0, Math.PI / 2], [0, 1, Math.PI], [0, -1, 0]]) { let n = 0; while (w.grid[sy + dy * (n + 1)]?.[sx + dx * (n + 1)] === 0) n++; if (!best || n > best.n) best = { n, yaw }; }
  reset(); P.x = c[0]; P.z = c[1]; P.yaw = best.yaw; P.pitch = 0.12; tick(3); key('KeyQ'); let gp = 0, modes = new Set();
  for (let i = 0; i < 150; i++) { tick(1); gp = Math.max(gp, P.y); modes.add(P.mode); } r.grapplePeak = +gp.toFixed(2); r.modes = [...modes]; r.run = best.n; P.pitch = 0;
  // Jiffy tube: walk in from one mouth holding W; must auto-crouch and come out the other end
  let tw = null; for (let d = 2; d < 9 && !tw; d++) { g.loadDeck(d); if (g.world.d.tubes.length) tw = g.world; }
  if (tw) { for (const e of g.gorns) { e.dead = true; e.mesh.visible = false; } g.gorns.length = 0;
    const t = tw.d.tubes[0], ca = tw.center(t.a[0], t.a[1]), cb = tw.center(t.b[0], t.b[1]); reset(); P.x = ca[0]; P.z = ca[1]; P.yaw = Math.atan2(ca[0] - cb[0], ca[1] - cb[1]); g.G.phase = 'play';
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); let ducked = false, minD = 1e9;
    for (let i = 0; i < 60 * 12; i++) { tick(1); g.G.phase = 'play'; P.clung = 0; if (tw.isTube(...tw.tile(P.x, P.z)) && P.crouch) ducked = true; minD = Math.min(minD, Math.hypot(P.x - cb[0], P.z - cb[1])); }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); r.tube = { len: t.tiles.length, ducked, reached: minD < 0.8 }; }
  return r;
});
console.log('parkour:', JSON.stringify(park)); if (!(park.jumpPeak > 0.5 && park.landed && park.mantled !== false && (park.run < 2 || park.grapplePeak > 0.4) && park.modes.includes('grapple') && (!park.tube || (park.tube.ducked && park.tube.reached)))) fail('parkour');
console.log('bot run:', JSON.stringify(run)); if (run.err || run.phase !== 'win') fail('bot run');
if (errors.length) fail('page errors:\n  ' + [...new Set(errors)].slice(0, 8).join('\n  '));
await browser.close(); server.close();
console.log(failed ? 'FAILED' : 'OK'); process.exit(failed ? 1 : 0);
