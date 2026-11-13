// Headless smoke test:  node tools/test.mjs   (needs `playwright` + Chromium; starts its own static server)
// 1) generator: every chip and the exit are reachable on decks 0-11 × 25 seeds
// 2) bot run (page loaded with ?mode=madness, the old roguelike): collect chips, ride the lift, pick a perk, through to the win screen, with every enemy type ticking
// 3) Systems Nominal (default mode, second page): every deck of every ship generates, ship-level rooms exist per shipPlan, no hostiles / madness / faults,
//    and a bot rides the real turbolift from the top deck to the bottom and back (locked when the lifts system is offline)
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
import { unitTests as commsUnit, hudTests as commsHud } from './test-comms.mjs';   // alerts / comm bus / bridge model / HUD (tools/test-comms.mjs)
await commsUnit(fail);
import { simTests } from './test-sim.mjs';
await simTests(fail);
import { dutyTests } from './test-duty.mjs';
await dutyTests(fail);
import { socialTests } from './test-social.mjs';   // social tracker + sim/duty hooks (tools/test-social.mjs)
await socialTests(fail);
import { gaitTests } from './test-gait.mjs';
await gaitTests(fail);
import { movementTests } from './test-movement.mjs';
await movementTests(fail);
import { equipmentTests } from './test-equipment.mjs';   // equipment motions / carry items (tools/test-equipment.mjs)
await equipmentTests(fail);
import { repairTests } from './test-repair.mjs';   // NPC repair response, sim priorities, pace, speech etiquette (tools/test-repair.mjs)
await repairTests(fail);
import { handheldTests } from './test-handhelds.mjs';   // handheld job equipment / improvised weapons (tools/test-handhelds.mjs)
await handheldTests(fail);
import { navTests, navBrowser } from './test-nav.mjs';   // routing / cross-deck plans / pins + nav HUD (tools/test-nav.mjs)
await navTests(fail);
import { uiTests, uiBrowser } from './test-ui.mjs';   // UI layer stack / Esc / pointer lock, wheel maths, toasts, icons (tools/test-ui.mjs)
await uiTests(fail);
import { talkTests, talkBrowser } from './test-talk.mjs';   // conversation close-up: state machine, framing, pause rules, intents (tools/test-talk.mjs)
await talkTests(fail);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://localhost:${port}/index.html?mode=madness`);
await page.evaluate(async () => { await __game.ready; __game.setQuality('low'); });
if (await page.evaluate(() => __game.G.mode) !== 'madness') fail('?mode=madness did not select madness mode');

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
    for (let w = 0; w < 36 && g.G.deck === deck && g.G.phase !== 'win' && g.G.phase !== 'perk'; w++) { await new Promise(r => setTimeout(r, 500)); tick(4); }   // slow machine: keep waiting for the lift transition (up to ~20 s)
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
  const g = __game; for (let a = 0; a < 6; a++) { g.newRun(); if (g.repairPts.some(p => p.sys === 'lighting')) break; }   /* a layout with no wall space for the junction would make the probe meaningless */ g.setQuality('low'); for (const e of g.gorns) { e.dead = true; e.mesh.visible = false; } g.gorns.length = 0; g.G.mad.t = 1e9; g.G.mad.pending = null; for (const e of g.ents.filter(e => e.opener)) { g.scene.remove(e.mesh); g.ents.splice(g.ents.indexOf(e), 1); }
  g.shipState.damage('lighting', 0.9, { quiet: true }); for (const e of g.ents.filter(e => e.repairing)) e.repairing = null; g.spawnRepairer('lighting');
  const rep = g.ents.find(e => e.repairing?.sys === 'lighting'); let tt = 500, secs = 0;
  if (rep) { g.P.x = rep.x + 30; for (let i = 0; i < 60 * 70 && g.shipState.status('lighting') !== 'nominal'; i++) { g.G.phase = 'play'; g.G.hp = 1e6; tt += 1 / 60; g.step(1 / 60, tt); secs = i / 60; } }
  return { quietActs, acts, peaked, relaxed: phases.has('relax'), backToBuild: D.phase === 'build', cascadeReactor: S.status('reactor'), repairer: !!rep, crewFixed: g.shipState.status('lighting') === 'nominal', secs: +secs.toFixed(0) };
});
console.log('director:', JSON.stringify(dir)); if (!(dir.quietActs >= 4 && dir.peaked && dir.relaxed && dir.cascadeReactor !== 'nominal' && dir.repairer && dir.crewFixed)) fail('director');
const srch = await page.evaluate(async () => {
  const g = __game, P = g.P, out = { sites: 0, kinds: {}, searched: false, prompt: '', say: '' };
  for (let tries = 0; tries < 6 && !out.sites; tries++) { g.newRun(); g.setQuality('low'); out.sites = g.world.searchSites?.length || 0; }
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); g.G.phase = 'play'; g.G.hp = g.G.maxHp = 1e6;
  for (const e of g.gorns) { e.dead = true; e.mesh.visible = false; } g.gorns.length = 0; g.G.mad.t = 1e9; g.G.mad.pending = null;
  for (const s of g.world.searchSites) out.kinds[s.kind] = (out.kinds[s.kind] || 0) + 1;
  const site = g.world.searchSites[0]; if (site) {
    P.x = site.x + site.nx * 0.9; P.z = site.z + site.nz * 0.9; P.yaw = Math.atan2(site.nx, site.nz); P.vx = P.vz = 0;   // stand in front, look at the wall
    g.step(1 / 60, 900); out.prompt = document.getElementById('prompt').textContent;
    const before = document.getElementById('msgs')?.textContent || '';
    for (const t of ['keydown', 'keyup']) document.dispatchEvent(new KeyboardEvent(t, { code: 'KeyE', key: 'e', bubbles: true }));
    out.searched = site.used; out.say = (document.getElementById('msgs')?.textContent || '').slice(-160) !== before.slice(-160) ? 'changed' : 'same';
  }
  return out;
});
console.log('search:', JSON.stringify(srch)); if (!(srch.sites > 0 && srch.searched && /Search/.test(srch.prompt))) fail('fixture search');
const invRun = () => page.evaluate(async () => {
  const g = __game, P = g.P, out = { newRooms: [], clutter: 0, examine: '', examineKind: '', clutterPrompt: '' };
  const NEW = new Set(['readyroom', 'brig', 'armory', 'gym', 'lab', 'laundry', 'lounge', 'workshop', 'plant', 'morgue', 'datacore', 'stores', 'washroom', 'airlock']), seen = new Set();
  { const { generate } = await import('./js/gen.js'), { SHIPS, deckOptions } = await import('./js/ships.js');
    for (let i = 0; i < 120; i++) { const ship = SHIPS[i % SHIPS.length], sd = i % ship.decks, d = generate(sd, i * 7919 + 3, deckOptions(ship, sd)); for (const r of d.rooms) if (NEW.has(r.type)) seen.add(r.type); } }
  for (let i = 0; i < 4; i++) { g.newRun(); g.setQuality('low'); out.clutter += g.world.clutter?.length || 0; }
  out.newRooms = [...seen];
  g.newRun(); g.setQuality('low'); document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); g.G.phase = 'play'; g.G.hp = g.G.maxHp = 1e6;
  for (const e of g.gorns) { e.dead = true; e.mesh.visible = false; } g.gorns.length = 0; g.G.mad.t = 1e9; g.G.mad.pending = null;
  const w = g.world, pr = w.d.props.find(p => ['crate', 'table', 'bunk', 'biobed'].includes(p.kind));
  if (pr) { const [cx, cz] = w.center(pr.tx, pr.ty); for (const [ox, oz] of [[1.7, 0], [-1.7, 0], [0, 1.7], [0, -1.7]]) { P.x = cx + ox; P.z = cz + oz; P.yaw = Math.atan2(ox, oz); P.pitch = -0.6; P.vx = P.vz = 0; g.step(1 / 60, 950); g.step(1 / 60, 950.02); const t = document.getElementById('prompt').textContent; if (t && !/Search/.test(t)) { out.examine = t; out.examineKind = pr.kind; break; } } }
  const cands = (w.clutter || []).filter(c => !g.ents.some(e => Math.hypot(e.x - c.x, e.z - c.z) < 3.5) && !(w.searchSites || []).some(s => Math.hypot(s.x - c.x, s.z - c.z) < 3) && !(g.repairPts || []).some(r => Math.hypot(r.x - c.x, r.z - c.z) < 4) && Math.hypot(w.liftPos.x - c.x, w.liftPos.z - c.z) > 4);
  find: for (const c of cands.slice(0, 15)) for (const [ox, oz] of [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]]) {
    P.x = c.x + ox; P.z = c.z + oz; P.yaw = Math.atan2(ox, oz); P.pitch = 0; P.vx = P.vz = 0; g.step(1 / 60, 960); g.step(1 / 60, 960.02);
    const t = document.getElementById('prompt').textContent; if (t && !/\[E\]|nominal|Repair/.test(t)) { out.clutterPrompt = t; break find; } }
  return out;
});
let inv = await invRun(); for (let a = 0; a < 3 && !(inv.examine && inv.clutterPrompt && !/\[E\](?! Take)/.test(inv.clutterPrompt)); a++) inv = await invRun();   // random layouts: the look-at probe can miss on one ship, so retry on fresh runs
console.log('inventory in game:', JSON.stringify(inv)); if (!(inv.newRooms.length >= 12 && inv.clutter > 20 && inv.examine && inv.clutterPrompt && !/\[E\]/.test(inv.clutterPrompt))) fail('inventory in game');
const propsOk = await page.evaluate(async () => {
  const { PROP_KINDS, buildProp } = await import('./js/world.js'), bad = [];
  for (const k of PROP_KINDS) { try { const g = buildProp(k); if (!g || !g.children.length) bad.push(k); } catch (e) { bad.push(k + ': ' + e.message); } }
  return { n: PROP_KINDS.length, bad };
});
console.log('props:', JSON.stringify(propsOk)); if (propsOk.bad.length || propsOk.n < 32) fail('prop models');
console.log('bot run:', JSON.stringify(run)); if (run.err || run.phase !== 'win') fail('bot run');
// ---- Systems Nominal (default mode) on its own page ----
const page2 = await browser.newPage({ viewport: { width: 640, height: 360 } });
page2.on('pageerror', e => errors.push('nominal: ' + e.message)); page2.on('console', m => { if (m.type() === 'error') errors.push('nominal: ' + m.text()); });
await page2.goto(`http://localhost:${port}/index.html`);
await page2.evaluate(async () => { await __game.ready; __game.setQuality('low'); });
const shipTest = await page2.evaluate(async () => {
  const { SHIPS } = await import('./js/ships.js'); const { genShip, shipPlan } = await import('./js/gen.js');
  const NEED = ['bridge', 'readyroom', 'engineering', 'sickbay', 'mess', 'lounge', 'gym', 'holodeck', 'lab', 'quarters', 'shuttlebay', 'cargo', 'transporter', 'armory', 'brig', 'datacore', 'arboretum', 'stores'];
  const bad = [], dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]; let decks = 0;
  for (const ship of SHIPS) for (const seed of [0, 1, 2, 3, 4, 5]) {
    const ds = genShip(ship, seed), plan = shipPlan(ship, seed, ds); decks += ds.length;
    if (ds.length !== ship.decks) bad.push(`${ship.name}: ${ds.length} decks`);
    for (const t of NEED) if (!plan[t]) bad.push(`${ship.name}/${seed}: no ${t}`); else for (const r of plan[t]) if (ds[r.deck].room[r.ty][r.tx] !== t) bad.push(`${ship.name}/${seed}: ${t} not at ${r.deck},${r.tx},${r.ty}`);
    if (plan.bridge?.[0].deck !== 0 || plan.readyroom?.[0].deck !== 0) bad.push(`${ship.name}/${seed}: bridge/ready room not on the Command deck`);
    if ((plan.quarters || []).length < 3) bad.push(`${ship.name}/${seed}: few quarters`);
    if (!ds.some(d => d.props.some(p => p.kind === 'warpcore'))) bad.push(`${ship.name}/${seed}: no warp core`);
    ds.forEach((d, i) => { if (!d.exitBlocks) bad.push(`${ship.name}/${seed}/${i}: lift is not a dead-end car`); });
  }
  return { decks, bad };
});
console.log(`ship decks: ${shipTest.decks} generated, ${shipTest.bad.length} problems`); if (shipTest.bad.length) fail('ship decks: ' + shipTest.bad.slice(0, 6).join('; '));
const nom = await page2.evaluate(async () => {
  const g = __game, P = g.P, out = { log: [] }; g.G.forceShip = 0; g.newRun(); g.setQuality('low'); document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); g.G.hp = g.G.maxHp = 1e6;
  const key = (code) => { for (const t of ['keydown', 'keyup']) document.dispatchEvent(new KeyboardEvent(t, { code, key: code, bubbles: true })); };
  let t = 0; const tick = (n) => { for (let i = 0; i < n; i++) { t += 1 / 30; g.step(1 / 30, t); } };
  const G = g.G, D = G.ship.decks;
  out.start = { mode: G.mode, deck: G.deck, shipDeck: G.shipDeck, inCar: g.inCarTile(), decks: G.shipDecks.length, D, director: g.director, auto: g.shipState.auto, objective: getComputedStyle(document.getElementById('objective')).display };
  tick(900);   // 30 s: nothing hostile, no madness, no faults
  out.calm = { gorns: g.gorns.length, mad: G.mad, faults: g.shipState.faulted().length, hostileEnts: g.ents.filter(e => e.fake || e.kind === 'body').length, simBodies: g.ents.filter(e => e.simmed).length, simHere: g.sim.onDeck(G.shipDeck + 1).length };
  if (out.calm.simBodies > out.calm.simHere || (out.calm.simHere && !out.calm.simBodies)) out.simBad = out.calm;
  // walk out and back in: doors open as you approach, the panel opens when you step into the car
  const w = g.world, c = w.car; const far = (k) => { P.x = c.x + c.dx * k; P.z = c.z + c.dy * k; P.vx = P.vz = 0; };
  far(5.0); tick(5); const nearOpen = w.liftOpen; far(9); tick(5); out.doors = { nearOpen, farShut: !w.liftOpen };
  far(3.0); tick(5); P.x = c.x; P.z = c.z; tick(3); out.walkIn = { phase: G.phase, panel: document.getElementById('liftui').className, rows: [...document.querySelectorAll('#liftrows .lr')].map(r => r.textContent) };
  key('Escape'); tick(2); out.cancel = G.phase;
  // search a fixture on deck 1, ride down to the bottom deck and back up
  const site = w.searchSites[0]; if (site) site.used = true;
  const ride = (n) => { g.openLiftPanel(); if (G.phase !== 'select') return { err: 'panel did not open on deck ' + (G.shipDeck + 1) }; const from = G.shipDeck; key('Digit' + n); if (G.phase !== 'ride') return { err: 'no ride started', phase: G.phase }; let ticks = 0, shaken = false, seen = new Set(); const cam0 = g.camera.position.y;
    while (G.phase === 'ride' && ticks < 30 * 12) { tick(1); ticks++; seen.add(document.getElementById('liftbig').textContent); if (Math.abs(g.camera.position.y - (P.y + P.eye)) > 1e-4) shaken = true; }
    return { from, to: G.shipDeck, secs: +(ticks / 30).toFixed(1), phase: G.phase, inCar: g.inCarTile(), doorsOpening: g.world.liftOpen, indicator: seen.size, shaken }; };
  out.down = ride(D); tick(40); out.mid = { deck: G.deck, zone: document.getElementById('liftrows') && true };
  out.one = null; out.up = ride(1); tick(10);
  out.persist = site ? g.world.searchSites[0].used : null;
  // one deck at a time = the shortest ride
  out.hop = ride(2);
  // locked while the lifts system is offline
  g.shipState.damage('lifts', 1); tick(5); out.locked = { fx: G.fx.liftLocked, panel: (G.phase = 'play', g.openLiftPanel(), G.phase) }; g.shipState.repair('lifts'); tick(5);
  out.unlocked = (g.openLiftPanel(), G.phase); key('Escape'); tick(2);
  { // billet, duty, phases, death -> continue as someone else
    G.phase = 'play'; const D = g.duty, ph = g.phases, old = G.player; out.billet = { isPlayer: old.isPlayer, billet: old.billet, loops: D.loops.length, mission: G.mission, hud: !!document.getElementById('bd-board') };
    const l = D.loops[0]; D.setPlace(G.shipDeck + 1, l.room); l.state = 'due'; l.dueAt = D.t; const r = D.perform(l.id, 'proper'); tick(1); out.duty = { ok: r.ok, busy: !!D.busy }; { D.cancel(); const l2 = D.loops[1] || D.loops[0]; l2.spot = 'door'; l2.state = 'due'; l2.dueAt = D.t; D.setPlace(G.shipDeck + 1, l2.room); G.phase = 'play'; const before = l2.state, sx = P.x, sz = P.z; P.x = -40; P.z = -40; g.interact(); P.x = sx; P.z = sz; out.duty.quick = { before, after: l2.state, busy: !!D.busy && D.busy.loop === l2 }; D.cancel(); }
    for (let i = 0; i < 40; i++) { D.tick(1); } out.duty.board = D.board().length;
    ph.enabled = true; for (let i = 0; i < 30; i++) ph.tick(30); out.phases = ph.status(); const hz = ph.hazard(G.shipDeck + 1, { zone: 'engineering' }); out.phases.hazard = !!hz || ph.modeDef?.lethal === null;
    g.nomDie('test'); out.dead = { phase: G.phase, btns: document.querySelectorAll('#bd-end button').length, shown: document.getElementById('bd-end').classList.contains('show') };
    document.querySelector('#bd-end button').click(); tick(5); out.cont = { phase: G.phase, changed: G.player !== old, newIsPlayer: G.player.isPlayer, oldDead: old.status, hp: G.hp, same: G.duty.debt === D.debt };
    { // NPC walking: a visible crew member walks a real path to another tile
      G.phase = 'play'; const w = g.world, e = g.ents.find(x => x.simmed); out.walk = { have: !!e };
      if (e) { const tiles = w.d.openTiles.filter(([x, y]) => w.d.grid[y][x] === 0 && !w.isTube(x, y)), here = w.tile(e.x, e.z), f0 = w.field(here[0], here[1], true);
        const far = tiles.filter(([x, y]) => f0[x + y * w.W] > 8 && f0[x + y * w.W] < 30)[0]; out.walk.far = !!far;
        if (far) { const f = g.pathField(far[0], far[1]), d0 = f[here[0] + here[1] * w.W]; P.x = e.x + 3; P.z = e.z; g.startWalk(e, far[0], far[1], false); tick(240); const now = w.tile(e.x, e.z), d1 = f[now[0] + now[1] * w.W]; out.walk.d0 = d0; out.walk.d1 = d1; out.walk.closer = d1 < d0 || !e.walk; out.walk.inside = w.d.grid[now[1]][now[0]] === 0; tick(900); const fin = w.tile(e.x, e.z); out.walk.gait = g.describeGait(g.gaitFor(e) && e.gaitBase); out.walk.fid = e.fid?.hist.length || 0; out.walk.add = !!e.mesh.userData.human.add; out.walk.arrived = !e.walk && fin[0] === far[0] && fin[1] === far[1]; } }
    }
    { // running, dodging, crawling through tubes and climbing ladders, evacuation
      G.phase = 'play'; const di = G.shipDecks.findIndex((d, i) => d.data.tubes.some(tb => tb.tiles.length >= 3 && tb.ladder > 0) && g.sim.onDeck(i + 1).length > 1); if (di >= 0 && di !== G.shipDeck) { g.loadDeck(di + 1); tick(5); G.phase = 'play'; } g.simBodies(0, true);
      const w = g.world, es = g.ents.filter(x => x.simmed), r = { have: es.length, deck: G.shipDeck };
      const tube = w.d.tubes.find(t => t.tiles.length >= 3 && t.ladder > 0) || w.d.tubes[0]; r.tubes = w.d.tubes.length;
      if (tube && es[0]) { const e = es[0], a = tube.tiles[0], b = tube.tiles[tube.tiles.length - 1], [ax, az] = w.center(a[0], a[1]); e.walk = null; e.x = ax; e.z = az; e.mesh.position.set(ax, 0, az); P.x = ax + 25; P.z = az;
        g.startWalk(e, b[0], b[1], false, { tubes: true, run: false }); const clips = new Set(); let maxY = 0, n = 0; for (; n < 2400 && e.walk; n++) { tick(1); clips.add(e.clip); maxY = Math.max(maxY, e.y || 0); } r.tube = { len: tube.tiles.length, ladder: tube.ladder, secs: +(n / 30).toFixed(1), clips: [...clips], maxY: +maxY.toFixed(2), done: !e.walk, dbg: e.walk ? { inEnts: g.ents.includes(e), wsN: e.wsN, parent: !!e.mesh.parent, vis: e.mesh.visible, haul: !!e.haul, op: !!e.op, x: +e.x.toFixed(2), z: +e.z.toFixed(2), v: +(e.v || 0).toFixed(2), stuck: +(e.walk.stuck || 0).toFixed(1), pauseT: e.pauseT || 0, ghost: e.ghost || 0, heading: e.heading, tile: w.tile(e.x, e.z), tgt: [b[0], b[1]], fieldHere: g.pathField(b[0], b[1], true)[w.tile(e.x, e.z)[0] + w.tile(e.x, e.z)[1] * w.W], tubeAxis: w.d.tubeAxis[w.tile(e.x, e.z)[0] + w.tile(e.x, e.z)[1] * w.W] } : null }; }
      const e2 = es[1]; if (e2) { e2.walk = null; e2.dodgeCool = 0; const [tx, ty] = w.tile(e2.x, e2.z), p0 = [e2.x, e2.z]; P.x = e2.x - 1.8; P.z = e2.z; P.vx = 5.4; P.vz = 0; P.sprint = true; g.dodgeCheck(e2, 0.016, 1.8); P.sprint = false; r.dodge = { started: !!e2.walk, run: !!e2.run }; { const e3 = es[2]; if (e3) { e3.walk = null; e3.dodgeCool = 0; P.x = e3.x - 1.8; P.z = e3.z; P.vx = 3.3; P.vz = 0; P.sprint = false; g.dodgeCheck(e3, 0.016, 1.8); r.walkNoScatter = !e3.walk; P.vx = 0; } } P.vx = 0; P.x += 30;
        for (let i = 0; i < 400 && e2.walk; i++) tick(1); r.dodge.moved = +Math.hypot(e2.x - p0[0], e2.z - p0[1]).toFixed(2); for (let i = 0; i < 900 && (e2.walk || e2.retT > 0 || e2.returnTo); i++) tick(1); r.dodge.back = +Math.hypot(e2.x - p0[0], e2.z - p0[1]).toFixed(2); }
      const ph = g.phases; ph.enabled = false; ph.index = 4; g.G.evacT = 0; g.evacuationStep(2); r.evac = g.sim.over.size; for (const p of g.roster.people) g.sim.release(p); ph.index = 0;
      out.move2 = r;
    }
    { // equipment motions, held items, carts, player carry (js/equipment.js, js/carry.js, js/haul.js)
      G.phase = 'play'; g.simBodies(0, true); if (g.ents.filter(x => x.simmed).length < 4) { const dn = G.shipDecks.findIndex((d, i) => g.sim.onDeck(i + 1).length >= 5); if (dn >= 0) { g.loadDeck(dn + 1); tick(5); G.phase = 'play'; g.simBodies(0, true); } }   // a deck with people on it
      G.simT = 1e9; if (g.haul) g.haul.t = 1e9;   // hold the schedule still while we watch one body (restored below)
      const w = g.world, HL = g.haul, q = { haul: !!HL }, hum = (x) => x?.mesh?.userData.human;
      const nb = (p) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [p.tx + a, p.ty + b]).find(([x, y]) => w.d.grid[y]?.[x] === 0 && !w.isTube(x, y));
      let e = g.ents.find(x => x.simmed && hum(x) && !x.walk); const cp = w.d.props.find(p => p.kind === 'console' && nb(p));
      if (e) { e.walk = null; e.haul = null; if (cp) { const [x, z] = w.center(...nb(cp)); e.x = x; e.z = z; e.mesh.position.set(x, 0, z); e.faceAt = w.center(cp.tx, cp.ty); } e.spot = 'console'; g.opEnd(e); g.opStart(e); }
      if (e?.op) { const st = new Set(), ge = new Set(), cl = new Set(), faced = !!e.opGoal && Math.abs(Math.atan2(Math.sin(e.opGoal.yaw - e.mesh.rotation.y), Math.cos(e.opGoal.yaw - e.mesh.rotation.y))) < 2; for (let i = 0; i < 30 * 30; i++) { P.x = e.x + 2.2; P.z = e.z; P.vx = P.vz = 0; tick(1); if (!e.op) break; st.add(e.opStep); cl.add(hum(e).current); if (Object.keys(hum(e).add || {}).length > 3) ge.add(e.opStep); }
        q.op = { key: e.op?.key, steps: st.size, gest: ge.size, clips: [...cl], faced, still: !e.walk };
        e.spot = 'workbench'; e.opProp = null; g.opEnd(e); g.opStart(e); for (let i = 0; i < 150 && !hum(e).held?.hand_r; i++) tick(1); const H = hum(e), h = H.held?.hand_r, bp = new (h?.position.constructor || Object)(); q.held = { id: h?.userData.id || null, bone: h?.parent?.name || null };
        if (h) { const a = h.children[0].getWorldPosition(bp.clone()), b = H.bones.hand_r.getWorldPosition(bp.clone()); q.held.dist = +a.distanceTo(b).toFixed(3); for (let i = 0; i < 20; i++) tick(1); q.held.follows = h.children[0].getWorldPosition(bp.clone()).distanceTo(H.bones.hand_r.getWorldPosition(bp.clone())) < 0.3; }
        g.opEnd(e); q.held.dropped = !H.held?.hand_r; }
      // NPC haul: walk to a cart, grab it, push it along a path, release it
      if (HL) { HL.t = 1e9; let job = null; for (const c of g.ents.filter(x => x.simmed && hum(x) && !x.walk)) { if (c.op) g.opEnd(c); job = HL.startJob(c, true); if (job) { if (job.kind !== 'cart') { HL.endJob(job); job = null; continue; } break; } }
        if (job) { const c = job.cart, e2 = job.e, c0 = [c.x, c.z], w0 = c.mesh.userData.wheels[0].rotation.x, ph = new Set(); let gap = 0, n = 0; P.x = e2.x + 30; P.z = e2.z;
          for (; n < 30 * 160 && HL.jobs.includes(job); n++) { tick(1); ph.add(job.phase); if (job.phase === 'push') gap = Math.max(gap, Math.hypot(c.x - e2.x, c.z - e2.z)); }
          q.cart = { phases: [...ph], moved: +Math.hypot(c.x - c0[0], c.z - c0[1]).toFixed(2), gap: +gap.toFixed(2), wheels: +Math.abs(c.mesh.userData.wheels[0].rotation.x - w0).toFixed(1), released: c.pusher === null && !e2.haul && !e2.pushing, secs: +(n / 30).toFixed(1) }; } }
      // player: grab a cart, push it, load/unload, carry weight, drop and pick up, let go
      if (HL) { const t = w.d.openTiles.find(([x, y]) => [0, 1, 2, 3].every(k => w.d.grid[y]?.[x + k] === 0 && !w.isTube(x + k, y) && !(w.car && w.car.tx === x + k && w.car.ty === y)) && [-1, 1].every(k => !w.isTube(x - 1, y + k))); if (t) { const [x0, z0] = w.center(t[0], t[1]); for (const e3 of g.ents) if (e3.simmed && Math.hypot(e3.x - x0 - 3, e3.z - z0) < 5) { e3.x += 40; e3.mesh.position.x = e3.x; }
        const c = HL.addCart('cargo', x0 + 1.6, z0, Math.PI / 2, false); P.x = x0 + 0.1; P.z = z0; P.y = 0; P.vx = P.vz = 0; P.yaw = -Math.PI / 2; P.mode = 'walk'; G.carry = null; const pr0 = HL.prompt();
        const grab = HL.interact(), d0 = c.x; dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' })); let vmax = 0; for (let i = 0; i < 45; i++) { tick(1); vmax = Math.max(vmax, Math.hypot(P.vx, P.vz)); } dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' })); tick(3);
        q.push = { prompt: /Push/.test(pr0), grab, pushing: !!P.pushing, moved: +(c.x - d0).toFixed(2), ahead: +(c.x - P.x).toFixed(2), vmax: +vmax.toFixed(2), mul: P.carryMul };
        G.carry = { name: 'Field toolbox', real: '', item: 'toolbox' }; tick(1); q.carry = { vm: !!HL.vm, bonus: g.haul && G.carry.item === 'toolbox' }; const n0 = c.mesh.userData.load.length; HL.putDown(); q.carry.loaded = c.mesh.userData.load.length === n0 + 1 && !G.carry; HL.takeFromCart(); q.carry.unloaded = G.carry?.item === 'toolbox';
        HL.interact(); q.push.released = !P.cart && !P.pushing && c.pusher === null; tick(1); q.push.mulAfter = P.carryMul;
        G.carry = { name: 'Supply crate', real: '', item: 'crate' }; tick(1); q.carry.slow = P.carryMul; P.yaw = Math.PI / 2; HL.putDown(); q.carry.dropped = HL.dropped.length === 1 && !G.carry; HL.interact(); q.carry.picked = G.carry?.item === 'crate' && !HL.dropped.length; G.carry = null; tick(1); } }
      out.equip = q; G.simT = 0;
    }
    { // handhelds: NPC kit on the body / in the hand, tricorder speeds a repair, improvised weapon stuns and breaks a foldable (js/handhelds.js, js/kit.js)
      G.phase = 'play'; g.simBodies(0, true); G.simT = 1e9; const HHm = await import('./js/handhelds.js'), K = g.kit, q = { kit: !!K }, hum = (x) => x?.mesh?.userData.human;
      const belt = (x) => HHm.loadoutFor(x.person).some(i => ['belt', 'back'].includes(HHm.HANDHELDS[i].holster)), e = g.ents.find(x => x.simmed && hum(x) && !x.walk && !x.cower && belt(x)) || g.ents.find(x => x.simmed && hum(x) && !x.walk && !x.cower); if (e) { g.opEnd(e); e.kitWorn = null; g.opStart(e); const worn = Object.values(e.kitWorn || {}); q.worn = { n: worn.length, bone: worn[0]?.holder.parent?.name || null };
        const ok = (await import('./js/equipment.js')), op = new ok.Operator('post', e.person, 3, { toolSteps: HHm.toolScript('tricorder_sec'), toolP: 1 }); e.op = op; e.opHeld = { hand_r: null, hand_l: null }; e.opGoal = e.opGoal || { x: e.mesh.position.x, z: e.mesh.position.z, yaw: e.mesh.rotation.y, y: 0 }; let held = null; for (let i = 0; i < 30 * 40 && !held; i++) { P.x = e.x + 2.5; P.z = e.z; tick(1); if (!e.op) break; held = hum(e).held?.hand_r?.userData.id === 'tricorder_sec' ? hum(e).held.hand_r.parent?.name : null; } q.inHand = held; g.opEnd(e); }
      if (K) { const rp = g.repairPts.find(r => r.sys) || g.repairPts[0]; K.hand = -1; G.carry = null; const t0 = rp ? g.repairTime(rp) : 0; if (!K.equip('tricorder_eng')) { K.add(HHm.newInstance('tricorder_eng', 5)); } const t1 = rp ? g.repairTime(rp) : 0; q.repair = { t0: +t0.toFixed(2), t1: +t1.toFixed(2), faster: t1 < t0 * 0.8 }; const r = K.useJob(); q.repair.scan = !!r?.ok;
        const v = g.ents.find(x => x.simmed && hum(x) && !x.cower && x !== e); if (v) { if (v.op) g.opEnd(v); v.walk = null; K.add(HHm.newInstance('tricorder_sci', 9)); const inst = K.inst; P.x = v.x + 1.0; P.z = v.z; P.yaw = Math.atan2(1, 0); let hits = 0; const stuns = [];
          while (!HHm.isBroken(inst) && hits < 12) { K.cd = 0; K.attack(); hits++; stuns.push(v.stunT || 0); tick(1); } q.weapon = { hits, stunned: stuns.some(s => s > 0), cower: !!v.cower, broken: HHm.isBroken(inst), jobAfter: !!K.useJob()?.ok, last: K.last?.target || null };
          for (let i = 0; i < 30 * 25; i++) tick(1); q.weapon.recovered = !v.cower; } K.hand = -1; }
      out.hh = q; G.simT = 0;
    }
    { // sliding doors, clutter pick-up, terminal and talk menus
      const w = g.world, dr = w.doors?.[0]; out.doors2 = { n: w.doors?.length || 0 };
      if (dr) { w.slideDoors(0.5, dr.f.x, dr.f.z); w.slideDoors(0.5, dr.f.x, dr.f.z); out.doors2.open = dr.open > 0.5; w.slideDoors(0.5, dr.f.x + 40, dr.f.z); w.slideDoors(0.5, dr.f.x + 40, dr.f.z); w.slideDoors(0.5, dr.f.x + 40, dr.f.z); out.doors2.shut = dr.open < 0.2; }
      const c = w.clutter[0], n0 = w.clutter.length; out.clutter = { took: c ? w.takeClutter(c) : null, left: w.clutter.length === n0 - 1 };
      G.phase = 'play'; g.shipState.repair('computer'); g.terminalMenu(); out.term = { open: document.getElementById('bd-menu').classList.contains('show'), rows: document.querySelectorAll('#bd-menu .o').length }; g.hud2.closeMenu();
      const ppl = g.sim.onDeck(G.shipDeck + 1)[0]; if (ppl) { g.talkMenu({ person: ppl.person }); out.talk = { open: document.getElementById('bd-menu').classList.contains('show'), rows: document.querySelectorAll('#bd-menu .o').length }; g.hud2.closeMenu(); }
    }
    g.shipState.repair('lifts'); ph.enabled = false;
  }
  out.tabs = { hud: ['phaser', 'perks'].map(i => getComputedStyle(document.getElementById(i)).display), gun: G.phase };
  return out;
});
console.log('nominal:', JSON.stringify(nom));
{ const n = nom, D = n.start.D, ok = n.start.mode === 'nominal' && n.start.deck === 1 && n.start.shipDeck === 0 && n.start.inCar && n.start.decks === D && n.start.director === null && n.start.auto === false && n.start.objective === 'none'
    && !n.simBad && n.billet.isPlayer && n.billet.loops > 0 && n.billet.hud && n.duty.ok && n.duty.quick.after === 'doing' && n.phases.index >= 3 && n.phases.mode && n.dead.shown && n.dead.btns >= 2 && n.cont.phase === 'play' && n.cont.changed && n.cont.newIsPlayer && n.cont.oldDead === 'dead' && n.cont.hp > 0 && n.cont.same && (!n.walk.far || (n.walk.add && n.walk.closer && n.walk.inside && n.walk.arrived)) && n.move2.have > 1 && (n.move2.tubes > 0 && n.move2.tube && (n.move2.tube.done && n.move2.tube.clips.includes('crouch_fwd'))) && n.move2.dodge.started && n.move2.walkNoScatter !== false && n.move2.dodge.run && n.move2.dodge.moved > 0.6 && n.move2.dodge.back < 1.3 && n.move2.evac > 3 && n.doors2.n > 0 && n.doors2.open && n.doors2.shut && n.clutter.took && n.clutter.left && n.term.open && n.term.rows >= 4 && (!n.talk || (n.talk.open && n.talk.rows >= 4)) && n.calm.gorns === 0 && n.calm.mad === null && n.calm.faults === 0 && n.calm.hostileEnts === 0
    && n.doors.nearOpen && n.doors.farShut && n.walkIn.phase === 'select' && n.walkIn.rows.length === D && /^1Deck 1 — Command · Bridge/.test(n.walkIn.rows[0]) && n.cancel === 'play'
    && n.down.to === D - 1 && n.down.secs >= 7.5 && n.down.secs <= 9 && n.down.inCar && n.down.indicator >= D - 1 && n.down.shaken
    && n.up.to === 0 && n.up.secs >= 7.5 && n.up.inCar && n.persist !== false && n.hop.to === 1 && n.hop.secs >= 2.8 && n.hop.secs <= 4
    && n.locked.fx && n.locked.panel === 'play' && n.unlocked === 'select';
  if (!ok) fail('nominal ship / turbolift'); }
{ const q = nom.equip || {}; console.log('equipment:', JSON.stringify(q));   // equipment motions / carts / carry (js/haul.js)
  if (!q.haul || !q.op || q.op.steps < 3 || q.op.gest < 1 || !q.op.faced || !q.op.still || !q.held || !q.held.id || q.held.bone !== 'hand_r' || !(q.held.dist < 0.3) || !q.held.follows || !q.held.dropped) fail('equipment operator / held item ' + JSON.stringify(q.op) + JSON.stringify(q.held));
  if (q.cart && !(q.cart.phases.includes('push') && q.cart.moved > 2 && q.cart.gap < 2.2 && q.cart.wheels > 3 && q.cart.released)) fail('equipment: NPC cart haul ' + JSON.stringify(q.cart));
  if (!q.cart) fail('equipment: no NPC cart haul could start');
  if (!q.push || !(q.push.prompt && q.push.grab && q.push.pushing && q.push.moved > 0.5 && q.push.ahead > 0.6 && q.push.vmax < 2.4 && q.push.mul === 0.6 && q.push.released && q.push.mulAfter > 0.9)) fail('equipment: player cart ' + JSON.stringify(q.push));
  if (!q.carry || !(q.carry.vm && q.carry.loaded && q.carry.unloaded && q.carry.slow < 0.9 && q.carry.dropped && q.carry.picked)) fail('equipment: player carry ' + JSON.stringify(q.carry)); }
{ const q = nom.hh || {}; console.log('handhelds:', JSON.stringify(q));   // handheld job equipment / improvised weapons (js/kit.js)
  if (!q.kit || !q.worn || q.worn.bone !== 'pelvis' || q.inHand !== 'hand_r') fail('handhelds: NPC kit on the body / in hand ' + JSON.stringify(q.worn) + q.inHand);
  if (!q.repair || !q.repair.faster || !q.repair.scan) fail('handhelds: tricorder repair ' + JSON.stringify(q.repair));
  if (!q.weapon || !(q.weapon.stunned && q.weapon.cower && q.weapon.broken && !q.weapon.jobAfter && q.weapon.hits <= 6 && q.weapon.recovered)) fail('handhelds: improvised weapon ' + JSON.stringify(q.weapon)); }
// ---- crew voices, tags, lift speech, NPC riders ----
const vox = await page2.evaluate(async () => {
  const V = await import('./js/voice.js'), SP = await import('./js/speech.js'), { SHIPS } = await import('./js/ships.js'), { makeComplement } = await import('./js/crew.js');
  const bad = [], all = V.allTags(), sig = (r) => r.people.map(p => V.voiceSig(p.voice, p.tags)); let people = 0, tagTotal = 0, personas = 0;
  if (!V.havePersonas()) bad.push('personas.json not loaded');
  for (const ship of SHIPS) for (const seed of [1, 7, 4242]) {
    const a = makeComplement(ship, seed), b = makeComplement(ship, seed), sa = sig(a);
    if (JSON.stringify(sa) !== JSON.stringify(sig(b)) || JSON.stringify(a.people.map(p => p.persona)) !== JSON.stringify(b.people.map(p => p.persona))) bad.push(`${ship.name}/${seed}: voices not deterministic`);
    if (new Set(sa).size !== sa.length) bad.push(`${ship.name}/${seed}: two people share a voice+tag set`);
    if (new Set(a.people.map(p => p.voice.hash)).size !== a.people.length) bad.push(`${ship.name}/${seed}: voice hash collision`);
    for (const p of a.people) {
      people++; tagTotal += p.tags.length; if (p.persona) personas++;
      if (p.tags.length < 8 || p.tags.length > 14) bad.push(`${p.short}: ${p.tags.length} tags`);
      for (const c of V.CATEGORIES) if (!p.tags.some(t => V.catOf(t) === c)) bad.push(`${p.short}: no ${c} tag`);
      const cf = V.conflictsIn(p.tags); if (cf.length) bad.push(`${p.short}: conflicts ${JSON.stringify(cf)}`);
      for (const t of p.tags) if (!all.includes(t)) bad.push(`${p.short}: unknown tag ${t}`);
      const v = p.voice; if (!(v.pitch >= 0.5 && v.pitch <= 1.8 && v.rate >= 0.7 && v.rate <= 1.5 && v.volume >= 0.5 && v.volume <= 1 && v.formant >= 0.8 && v.formant <= 1.25 && v.breath >= 0 && v.breath <= 1 && v.rough >= 0 && v.rough <= 1 && v.vibrato >= 0 && v.vibrato <= 1 && Number.isInteger(v.hash))) bad.push(`${p.short}: voice out of range`);
    }
    if (bad.length > 8) break;
  }
  const noFx = all.filter(t => !V.hasEffect(t)), extra = Object.keys(V.TAG_EFFECTS).filter(t => !all.includes(t));
  let asym = 0; for (const [t, cs] of Object.entries(V.CONFLICTS)) for (const c of cs) if (!V.CONFLICTS[c]?.includes(t)) asym++;
  const bodies = {}; for (const p of makeComplement(SHIPS[0], 1).people) (bodies[p.body] ||= []).push(p.voice.pitch); const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  // lift lines: 30 sampled people x random destinations
  const ship = SHIPS[2], R = makeComplement(ship, 3), lines = [], lbad = []; let sd = 5; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 30; k++) {
    const p = R.people[Math.floor(rnd() * R.people.length)], rooms = ['Bridge', 'Engineering', 'Sickbay', 'Galley', 'Cargo', 'Lab'].filter(() => rnd() < 0.4), d = { deckNo: 1 + Math.floor(rnd() * 9), zone: ['Command', 'Habitat', 'Services', 'Engineering'][Math.floor(rnd() * 4)], rooms };
    const l = V.liftLine(p, d), lo = l.toLowerCase(), place = V.pickPlace(p, d).toLowerCase(); lines.push(l);
    if (!l || !(lo.includes(V.numWord(d.deckNo)) || lo.includes(String(d.deckNo)) || (place && lo.includes(place.slice(2))))) lbad.push(`${p.short}: "${l}" for deck ${d.deckNo} ${place}`);
    if (V.liftLine(p, d) !== l) lbad.push('liftLine not deterministic');
  }
  // tag-shaped examples from the spec
  const mk = (tags, extra = {}) => ({ id: 1, rank: 2, dept: 'command', body: 'crew_m', voice: { hash: 5 }, tags, ...extra }), D1 = { deckNo: 1, zone: 'Command', rooms: ['Bridge'] }, DE = { deckNo: 5, zone: 'Engineering', rooms: ['Engineering'] };
  const ex = { terse: V.liftLine(mk(['speech:terse', 'lift:one-word']), D1), formal: V.liftLine(mk(['speech:formal', 'lift:full-sentence']), D1), casual: V.liftLine(mk(['speech:casual', 'lift:names-place']), DE), mumble: V.liftLine(mk(['lift:mumbles', 'lift:names-place']), DE), please: V.liftLine(mk(['lift:says-please', 'lift:says-deck-number']), D1) };
  const exOk = /^Bridge\.$/.test(ex.terse) && /^Deck one, the bridge, please\.$/.test(ex.formal) && /^(Uh|Yeah|Okay), engineering\.$/.test(ex.casual) && /^…ngineering\.$/.test(ex.mumble) && /please/.test(ex.please);
  // speaking in headless: every mode must work without throwing, always leave a subtitle
  const sp = [], p0 = R.people[0]; for (const m of ['babble', 'synth', 'subs']) { SP.setMode(m); try { const r = SP.speak(p0, V.liftLine(p0, { deckNo: 4, zone: 'Habitat', rooms: ['Sickbay'] })); sp.push([m, r.mode, r.dur > 0]); SP.cue(p0, 'hum'); } catch (e) { sp.push([m, 'THREW ' + e.message]); } }
  try { SP.speak(null, 'Neutral voice test.'); SP.speak(p0, ''); } catch (e) { sp.push(['null', 'THREW']); } SP.setMode('babble');
  const subs = document.getElementById('subs')?.children.length || 0, desc = V.describeVoice(p0);
  return { people, avgTags: +(tagTotal / people).toFixed(1), personas, bad, noFx, extra, asym, tags: all.length, pitch: Object.fromEntries(Object.entries(bodies).map(([k, a]) => [k, +avg(a).toFixed(2)])), lbad, sample: lines.slice(0, 4), ex, exOk, sp, subs, desc };
});
console.log('voices:', JSON.stringify({ ...vox, bad: vox.bad.slice(0, 4) }));
{ const o = vox; if (!(o.bad.length === 0 && o.noFx.length === 0 && o.extra.length === 0 && o.asym === 0 && o.personas === o.people && o.lbad.length === 0 && o.exOk && o.sp.every(x => x[1] !== undefined && !/THREW/.test(x[1])) && o.sp.length === 3 && o.subs > 0 && o.desc.length > 10 && o.pitch.crew_heavy < o.pitch.crew_m && o.pitch.crew_m < o.pitch.crew_f2)) fail('crew voices: ' + JSON.stringify({ bad: o.bad.slice(0, 3), noFx: o.noFx.slice(0, 3), extra: o.extra, asym: o.asym, lbad: o.lbad.slice(0, 3), exOk: o.exOk, ex: o.ex, sp: o.sp, subs: o.subs })); }
const rid = await page2.evaluate(async () => {
  const g = __game, G = g.G, out = { rides: [] }; G.forceShip = 1; g.newRun(); g.setQuality('low'); document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); G.hp = G.maxHp = 1e6;
  let t = 0; const tick = (n) => { for (let i = 0; i < n; i++) { t += 1 / 30; g.step(1 / 30, t); } }; const D = G.ship.decks; tick(10);
  out.player = G.player && G.player.voice ? G.player.short : null;
  // chance: ~35% of the times someone walks up to the car
  let hits = 0, N = 120; G.riderChance = 0.35; for (let i = 0; i < N; i++) { if (g.rollRider()) { hits++; g.leaveRider(); } G.lift.rider = null; } out.rate = +(hits / N).toFixed(2);
  const ride = (to, midDest) => {
    G.riderChance = 1; G.lift.rider = null; const r = g.rollRider(true); if (!r) return { err: 'no rider' }; const inScene = !!r.mesh && g.scene.children.includes(r.mesh), who = r.person;
    g.openLiftPanel(); if (G.phase !== 'select') return { err: 'panel', phase: G.phase }; const from = G.shipDeck, logN = G.liftLog.length; g.liftTo(to); if (G.phase !== 'ride') return { err: 'no ride' };
    if (midDest !== undefined) g.boardLift(who, g.destOf(midDest));
    const spoke = G.lift.said, rd = g.rider.dest, rsaid = g.rider.said; let n = 0, leftAt = null, leftRiding = false, meshGone = false; const subsBefore = document.getElementById('subs')?.children.length || 0;
    while (G.phase === 'ride' && n < 30 * 14) { tick(1); n++; if (leftAt === null && g.rider?.left) { leftAt = G.lift.disp; leftRiding = G.phase === 'ride'; meshGone = !g.rider.mesh; } }
    const log = G.liftLog.slice(logN);
    return { from, to, phase: G.phase, deck: G.shipDeck, inScene, playerSaid: !!spoke && spoke.length > 0, riderSaid: !!rsaid && rsaid.length > 0, riderDest: rd.deckNo - 1, board: log.some(l => l.startsWith('board:' + who.id + ':' + rd.deckNo)), left: log.some(l => l.startsWith('leave:' + who.id)), leftAt, leftRiding, meshGone, cleared: !g.rider, };
  };
  out.rides.push(ride(D - 1));          // rider picks their own stop (on the way or the same deck)
  out.rides.push(ride(0, D - 3));       // the way back up: rider's stop is mid-ride; they get out there, the player rides on
  out.rides.push(ride(D - 1, 3));
  G.riderChance = 0; G.lift.rider = null; out.none = !g.rollRider(); return out;
});
console.log('lift riders:', JSON.stringify(rid));
{ const o = rid, ok = o.player && o.rate > 0.2 && o.rate < 0.5 && o.rides.length === 3 && o.rides.every(r => !r.err && r.inScene && r.playerSaid && r.riderSaid && r.board && r.left && r.cleared && r.phase === 'play') && o.rides[1].leftRiding && o.rides[1].leftAt === o.rides[1].riderDest && o.rides[1].deck === 0 && o.rides[2].leftRiding && o.rides[2].deck === o.rides[2].to && o.none;
  if (!ok) fail('NPC lift riders'); }
const vpage = await browser.newPage({ viewport: { width: 900, height: 600 } }); vpage.on('pageerror', e => errors.push('voices.html: ' + e.message)); vpage.on('console', m => { if (m.type() === 'error') errors.push('voices.html: ' + m.text()); });
await vpage.goto(`http://localhost:${port}/voices.html?ship=3&seed=2`); await vpage.waitForFunction(() => window.__ready, null, { timeout: 15000 });
const vp = await vpage.evaluate(async () => { const rows = document.querySelectorAll('#rows tr').length, chips = document.querySelectorAll('.chip').length; document.querySelector('[data-say]').click(); await new Promise(r => setTimeout(r, 200)); const said = document.querySelector('.said').textContent; document.querySelector('#dept').value = 'engineering'; document.querySelector('#dept').dispatchEvent(new Event('input')); const eng = document.querySelectorAll('#rows tr').length; return { rows, chips, said, eng, total: window.__voices.roster.people.length }; });
console.log('voices.html:', JSON.stringify(vp)); if (!(vp.rows === vp.total && vp.chips > vp.rows * 8 && /\[/.test(vp.said) && vp.eng > 0 && vp.eng < vp.total)) fail('voices.html');
await navBrowser(page2, fail);
await commsHud(page2, fail);
await uiBrowser(page2, fail);   // Esc closes a layer without pausing, wheel select, portraits, belt digits (tools/test-ui.mjs)
await talkBrowser(page2, fail);   // E -> close-up conversation, frozen world, trust, Esc restores (tools/test-talk.mjs)
// ---- pace, crew repair response, shift-end tasks (js/pace.js, js/repair.js, js/duty.js) ----
const rep = await page2.evaluate(async () => {
  const g = __game, G = g.G, out = {}, hide = () => document.querySelectorAll('.screen').forEach(s => s.classList.remove('show'));
  const snap = () => ({ id: g.pace.id, T: g.clock.paceT, rate: +g.clock.rate.toFixed(5), firstDue: Math.round(Math.min(...g.duty.loops.map(l => l.next))), period0: g.duty.loops[0]?.period, run: g.phases.runLength, phaseAt: g.phases.phaseAt[4], firstTask: Math.round(Math.min(...g.duty.tasks.map(t => t.at_s), 1e9)), cascadeT: g.shipState.paceT });
  G.forceShip = 0; g.pace = 'first'; g.newRun(); hide(); out.first = snap(); g.pace = 'crunch'; g.newRun(); hide(); out.crunch = snap(); g.pace = 'standard'; g.newRun(); hide(); g.setQuality('low'); out.std = snap();
  out.title = { buttons: document.querySelectorAll('#pacesel [data-pace]').length, summary: document.getElementById('pacesum').textContent };
  G.hp = G.maxHp = 1e6; G.phase = 'play'; let t = 0; const tick = (n, dt = 0.1) => { for (let i = 0; i < n; i++) { t += dt; G.phase = 'play'; g.step(dt, t); } };
  // a system serviced on this deck breaks: a crew member is dispatched, walks to it (body), works (marker), patches it to ~0.85 and reports on the comm bus
  const here = G.shipDeck + 1, sys = ['helm', 'alert', 'lifts', 'computer', 'sensors'].find(s => g.repair.site(s)?.deckNo === here) || Object.keys(g.repair.sites).find(s => g.repair.sites[s].deckNo === here);
  const ev = []; g.repair.on(e => ev.push(e.type)); g.shipState.damage(sys, 0.5); let walked = false, posed = false, marker = false, lead = null, maxProg = 0;
  for (let i = 0; i < 2600 && !ev.includes('done'); i++) { tick(1); const j = [...g.repair.jobs.values()][0]; if (j?.lead) lead = j.lead.person; if (lead) { const e = g.ents.find(x => x.simmed && x.person === lead); if (e?.walk) walked = true; if (e?.repairing?.npc) posed = true; if (e?.repMark) marker = true; } if (j) maxProg = Math.max(maxProg, j.need ? j.progress / j.need : 0); }
  out.repair = { sys, events: [...new Set(ev)], lead: lead?.short || null, hp: +g.shipState.hp(sys).toFixed(2), walked, posed, marker, maxProg: +maxProg.toFixed(2), secs: +t.toFixed(0), report: g.comms.log.some(m => /patched/.test(m.text)), heading: g.comms.log.some(m => /heading to/.test(m.text)), released: lead ? !g.sim.overridden(lead) : null };
  // world pause: nothing ticks while a menu is open
  const st0 = g.sim.t, dt0 = g.duty.t; G.menuPause = true; tick(30); out.paused = g.sim.t === st0 && g.duty.t === dt0; G.menuPause = false;
  // tasks stay open to the end of the shift, then count
  const D = g.duty; for (let i = 0; i < 1300; i++) D.tick(1); out.tasks = { n: D.tasks.length, open: D.tasks.filter(x => x.state === 'active').length }; g.nomEnd(); out.tasks.after = D.tasks.filter(x => x.state === 'missed').length; out.tasks.chain = D.chain.some(c => /Unfinished at end of shift/.test(c)); out.tasks.end = /Mission tasks/.test(document.getElementById('bd-end')?.textContent || '');
  G.hud2?.hideEnd(); return out;
});
console.log('pace/repair:', JSON.stringify(rep));
{ const r = rep, R = r.repair; if (!(r.first.T === 2.5 && r.first.firstDue >= 180 && r.first.firstTask >= 240 && r.first.run === 3000 && r.first.phaseAt === 2400 && r.crunch.T === 0.7 && r.crunch.run === 840 && r.std.T === 1 && r.std.run === 1200 && r.first.rate < r.std.rate && r.std.rate < r.crunch.rate && r.title.buttons === 3 && /Standard/.test(r.title.summary))) fail('pace presets ' + JSON.stringify(r));
  if (!(R.events.includes('assign') && R.events.includes('done') && Math.abs(R.hp - 0.85) < 0.01 && R.report && R.heading && R.posed && R.marker && R.released && (R.walked || R.events.includes('arrive')))) fail('crew repair response ' + JSON.stringify(R));
  if (!r.paused) fail('world pause (G.menuPause)'); if (!(r.tasks.open === r.tasks.n && r.tasks.after === r.tasks.n && (r.tasks.n === 0 || (r.tasks.chain && r.tasks.end)))) fail('shift-end tasks ' + JSON.stringify(r.tasks)); }
if (errors.length) fail('page errors:\n  ' + [...new Set(errors)].slice(0, 8).join('\n  '));
await browser.close(); server.close();
console.log(failed ? 'FAILED' : 'OK'); process.exit(failed ? 1 : 0);
