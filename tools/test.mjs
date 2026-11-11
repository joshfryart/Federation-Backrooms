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
  const { generate } = await import('./js/world.js'); const { SHIPS, deckOptions } = await import('./js/ships.js'); const bad = []; let masked = 0, minOpen = 1e9; let n = 0, tubes = 0, withTubes = 0, ladders = 0, bigRooms = 0;
  for (let deck = 0; deck < 12; deck++) for (let seed = 1; seed <= 25; seed++) {
    const ship = SHIPS[(deck + seed) % SHIPS.length], sd = Math.round(Math.min(deck, 7) / 7 * (ship.decks - 1)); const d = generate(deck, seed * 7919 + deck, deckOptions(ship, sd)); n++;
    const wallCount = d.grid.reduce((a, r) => a + r.reduce((b, c) => b + (c === 1 ? 1 : 0), 0), 0); if (d.W > 2 * Math.min(6 + Math.floor(deck * 0.7), 11) + 1) masked++; minOpen = Math.min(minOpen, d.openTiles.length);
    const W = d.W, H = d.H, seen = new Uint8Array(W * H), q = [d.start]; if (d.chips.length < 2) bad.push(`deck ${deck} seed ${seed}: only ${d.chips.length} chips`); seen[d.start[0] + d.start[1] * W] = 1;
    while (q.length) { const [x, y] = q.pop(); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + a, ny = y + b; if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[nx + ny * W] || d.grid[ny][nx] !== 0) continue; seen[nx + ny * W] = 1; q.push([nx, ny]); } }
    // the exit tile itself may be a special tile; accept it if a neighbour is reachable
    const ok = ([x, y]) => seen[x + y * W] || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => seen[x + a + (y + b) * W]);
    if (!d.chips.every(ok) || !ok(d.exit)) bad.push(`deck ${deck} seed ${seed}`);
    tubes += d.tubes.length; if (d.tubes.length) withTubes++; ladders += d.tubes.filter(t => t.ladder > 0).length; bigRooms += d.rooms.filter(r => r.big).length;
  }
  return { n, bad, tubes, withTubes, ladders, bigRooms, masked, minOpen };
});
console.log(`generator: ${gen.n} levels, ${gen.bad.length} unreachable, ${gen.tubes} Jiffy tubes on ${gen.withTubes} levels (${gen.ladders} with ladders), ${gen.bigRooms} large rooms, ${gen.masked} hull-shaped decks, smallest deck ${gen.minOpen} open tiles`); if (gen.withTubes < gen.n * 0.5) fail('too few tubes'); if (gen.bad.length) fail('generator: ' + gen.bad.slice(0, 5).join('; '));

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
    if (g.shipState.status('lifts') === 'offline') g.shipState.repair('lifts');
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
  let tw = null; for (let d = 2; d < 9 && !tw; d++) { g.loadDeck(d); if (g.world.d.tubes.some(t => t.ladder > 0)) tw = g.world; }
  if (tw) { for (const e of g.gorns) { e.dead = true; e.mesh.visible = false; } g.gorns.length = 0;
    const t = tw.d.tubes.find(t => t.ladder > 0), ca = tw.center(t.a[0], t.a[1]), cb = tw.center(t.b[0], t.b[1]); reset(); P.x = ca[0]; P.z = ca[1]; P.yaw = Math.atan2(ca[0] - cb[0], ca[1] - cb[1]); g.G.phase = 'play';
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); let ducked = false, minD = 1e9, topY = 0;
    for (let i = 0; i < 60 * 12; i++) { tick(1); g.G.phase = 'play'; P.clung = 0; if (tw.isTube(...tw.tile(P.x, P.z)) && P.crouch) ducked = true; topY = Math.max(topY, P.y); minD = Math.min(minD, Math.hypot(P.x - cb[0], P.z - cb[1])); }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); r.tube = { len: t.tiles.length, ladder: t.ladder, ducked, climbed: +topY.toFixed(2), reached: minD < 0.8 && topY > 1.6 }; }
  // space madness: deck 1 opener turns when you approach, hunts the other crew, dies to two hits, and the next-lowest rank turns
  { g.newRun(); g.setQuality('low'); g.G.phase = 'play'; g.G.hp = 1e6; for (const e of g.gorns) { e.dead = true; e.mesh.visible = false; } g.gorns.length = 0;
    const w2 = g.world, op = g.ents.find(e => e.opener), m = { opener: !!op };
    if (op) { reset(); P.x = op.x + 3; P.z = op.z; tick(1);
      for (let i = 0; i < 60 * 6 && !g.gorns.some(h => h.mad); i++) { g.G.phase = 'play'; tick(1); }
      const mad = g.gorns.find(h => h.mad); m.turned = !!mad;
      if (mad) { const low = Math.min(...g.roster.people.map(p => p.rank)); m.rank = mad.person.rank; m.lowest = mad.person.rank === low; m.red = mad.person.uniform === 0xa3231c;
        const crew0 = g.ents.filter(e => e.kind === 'crew').length;
        // hide far away from it and let it work
        const far = w2.d.openTiles.map(t => w2.center(t[0], t[1])).sort((a, b) => Math.hypot(b[0] - mad.x, b[1] - mad.z) - Math.hypot(a[0] - mad.x, a[1] - mad.z))[0]; P.x = far[0]; P.z = far[1];
        for (let i = 0; i < 60 * 90 && g.ents.filter(e => e.kind === 'crew').length >= crew0; i++) { g.G.phase = 'play'; g.G.hp = 1e6; tick(1); }
        m.killedCrew = crew0 - g.ents.filter(e => e.kind === 'crew').length;
        g.killMad(mad); m.deadStatus = mad.person.status;
        for (let i = 0; i < 60 * 30 && !(g.gorns.some(h => h.mad && !h.dead) || g.G.mad.pending); i++) { g.G.phase = 'play'; tick(1); }
        const nxt = g.G.mad.pending?.person || g.gorns.find(h => h.mad && !h.dead)?.person; m.next = !!nxt; m.nextRank = nxt?.rank; m.nextLowest = nxt ? nxt.rank === Math.min(...g.roster.people.filter(p => ['unknown', 'seen', 'alive', 'crazed'].includes(p.status) || p === nxt).map(p => p.rank)) : false; } }
    r.mad = m; }
  // crazed crew climb: vault onto a prop you are standing on; follow you up a ladder into a tube's upper run
  { const Sx = g.S, NB = [[1, 0], [-1, 0], [0, 1], [0, -1]], c = {};
    const wd_up = (w, en) => w.tubeKind(...w.tile(en.x, en.z)) === 'up';
    const chase = (wd, from, secs, until) => { for (const e of g.gorns) { e.dead = true; e.mesh.visible = false; } g.gorns.length = 0;
      const en = g.makeEnemy('crazed', wd, from, 3, 0, g.scene, g.sound); en.state = Sx.PATROL; en.mesh.visible = true; g.gorns.push(en); g.G.hp = 1e6; let maxY = 0, byEn = 0;
      const hp = g.G.hitPlayer, dd = g.G.dragDown; g.G.hitPlayer = (e, n) => { if (e === en) byEn++; return hp(e, n); }; g.G.dragDown = (e) => { if (e === en) byEn++; return dd(e); };
      let up = false; for (let i = 0; i < 60 * secs && !until(en, byEn); i++) { g.G.phase = 'play'; en.state = Sx.CHASE; en.timer = 5; en.setTarget(...wd.tile(P.x, P.z)); tick(1); maxY = Math.max(maxY, en.y); if (wd.tubeKind(...wd.tile(en.x, en.z)) === 'up') up = true; }
      g.G.hitPlayer = hp; g.G.dragDown = dd;
      return { maxY: +maxY.toFixed(2), upperRun: up, dist: +Math.hypot(en.x - P.x, en.z - P.z).toFixed(2), hit: byEn > 0 }; };
    for (let d = 1; d < 9 && !(c.prop && c.tube); d++) { g.loadDeck(d); const w = g.world;
      if (!c.prop) { const pr = w.d.props.find(p => isFinite(w.topAt(p.tx, p.ty)) && w.topAt(p.tx, p.ty) < 1.1 && NB.some(([a, b]) => w.grid[p.ty + b]?.[p.tx + a] === 0));
        if (pr) { const [a, b] = NB.find(([a, b]) => w.grid[pr.ty + b]?.[pr.tx + a] === 0); const fld = w.field(pr.tx + a, pr.ty + b); const from = w.d.openTiles.find(([x, y]) => fld[x + y * w.W] >= 3 && fld[x + y * w.W] <= 6) || [pr.tx + a, pr.ty + b];
          reset(); const [px, pz] = w.center(pr.tx, pr.ty); P.x = px; P.z = pz; P.y = w.topAt(pr.tx, pr.ty); P.grounded = true; tick(2);
          c.prop = { top: +w.topAt(pr.tx, pr.ty).toFixed(2), playerY: +P.y.toFixed(2), ...chase(w, from, 20, (en, b) => b > 0) }; } }
      if (!c.tube) { const t = w.d.tubes.find(t => t.ladder >= 1 && t.ladder < t.tiles.length - 2) || w.d.tubes.find(t => t.ladder >= 1 && t.ladder < t.tiles.length - 1);
        if (t) { const up = t.tiles[t.ladder + 1]; reset(); const [px, pz] = w.center(up[0], up[1]); P.x = px; P.z = pz; P.y = 1.7; P.grounded = true; tick(2);
          c.tube = { playerY: +P.y.toFixed(2), ...chase(w, t.a, 40, en => en.y > 1.6 && wd_up(w, en)) }; } } }
    r.climb = c; }
  // ship systems: break life support, walk to its repair point on this deck, hold E until it is fixed
  { const S = g.shipState; for (const e of g.gorns) { e.dead = true; e.mesh.visible = false; } g.gorns.length = 0; reset(); g.G.hp = 100; g.G.phase = 'play';
    S.damage('life', 0.9); tick(2); const fx = g.G.fx; const rp = g.repairPts.find(p => p.sys === 'life');
    r.sys = { status: S.status('life'), suffocate: fx.suffocate, points: g.repairPts.length, junctions: g.repairPts.filter(p => !p.main).length };
    if (rp) { P.x = rp.x; P.z = rp.z; const hp0 = g.G.hp; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); let i = 0; for (; i < 60 * 15 && S.status('life') !== 'nominal'; i++) { g.G.phase = 'play'; tick(1); } window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
      r.sys.repaired = S.status('life') === 'nominal'; r.sys.secs = +(i / 60).toFixed(1); r.sys.hpLost = +(hp0 - g.G.hp).toFixed(1); }
    r.sys.roster = g.roster.people.length; r.sys.ship = g.G.ship.name; }
  return r;
});
console.log('parkour:', JSON.stringify(park)); if (!(park.jumpPeak > 0.5 && park.landed && park.mantled !== false && (park.run < 2 || park.grapplePeak > 0.4) && park.modes.includes('grapple') && (!park.tube || (park.tube.ducked && park.tube.reached)) && (!park.climb.prop || (park.climb.prop.maxY >= park.climb.prop.top - 0.05 && park.climb.prop.hit)) && (!park.climb.tube || (park.climb.tube.maxY > 1.6 && park.climb.tube.upperRun) || park.climb.tube.hit)   /* climbed in after you, or dragged you out of the high mouth */ && park.mad.turned && park.mad.lowest && park.mad.red && park.mad.killedCrew > 0 && park.mad.next && park.mad.nextLowest && park.sys.repaired && park.sys.suffocate > 0 && park.sys.points >= 20)) fail('parkour');
const dir = await page.evaluate(async () => {
  const { Director } = await import('./js/director.js'); const { ShipState } = await import('./js/crew.js'); const { SHIPS } = await import('./js/ships.js');
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const D = new Director(rnd); D.reset(3); const acts = {}, phases = new Set(); let t = 0;
  const run = (secs, tension) => { for (let i = 0; i < secs * 10; i++) { t += 0.1; const a = D.update(0.1, { tension, deckTime: t, faults: 1, dormant: 1, active: 1, madPending: 20 }); if (a) acts[a] = (acts[a] || 0) + 1; phases.add(D.phase); } };
  run(240, 0); const quietActs = Object.values(acts).reduce((a, b) => a + b, 0);
  run(60, 1); const peaked = phases.has('peak'); run(90, 0);
  const S = new ShipState(SHIPS[0], 5); S.repair('reactor'); S.damage('coolant', 1); for (let i = 0; i < 450; i++) S.tick(0.1, { deckTime: 0, tension: 0, deck: 1 });
  const g = __game; g.newRun(); g.setQuality('low'); for (const e of g.gorns) { e.dead = true; e.mesh.visible = false; } g.gorns.length = 0; g.G.mad.t = 1e9; g.G.mad.pending = null; for (const e of g.ents.filter(e => e.opener)) { g.scene.remove(e.mesh); g.ents.splice(g.ents.indexOf(e), 1); }
  g.shipState.damage('lighting', 0.9, { quiet: true }); for (const e of g.ents.filter(e => e.repairing)) e.repairing = null; g.spawnRepairer('lighting');
  const rep = g.ents.find(e => e.repairing?.sys === 'lighting'); let tt = 500, secs = 0;
  if (rep) { g.P.x = rep.x + 30; for (let i = 0; i < 60 * 70 && g.shipState.status('lighting') !== 'nominal'; i++) { g.G.phase = 'play'; g.G.hp = 1e6; tt += 1 / 60; g.step(1 / 60, tt); secs = i / 60; } }
  return { quietActs, acts, peaked, relaxed: phases.has('relax'), backToBuild: D.phase === 'build', cascadeReactor: S.status('reactor'), repairer: !!rep, crewFixed: g.shipState.status('lighting') === 'nominal', secs: +secs.toFixed(0) };
});
console.log('director:', JSON.stringify(dir)); if (!(dir.quietActs >= 4 && dir.peaked && dir.relaxed && dir.cascadeReactor !== 'nominal' && dir.repairer && dir.crewFixed)) fail('director');
console.log('bot run:', JSON.stringify(run)); if (run.err || run.phase !== 'win') fail('bot run');
if (errors.length) fail('page errors:\n  ' + [...new Set(errors)].slice(0, 8).join('\n  '));
await browser.close(); server.close();
console.log(failed ? 'FAILED' : 'OK'); process.exit(failed ? 1 : 0);
