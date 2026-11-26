// Headless test suite:  node tools/test.mjs [--gate] [--only a,b] [--seed N] [--ship i] [--list]   (needs `playwright` + Chromium; starts its own static server)
//   full (default)  every section: node-only checks, then the browser sections page by page (one live page at a time), then the seed-set smoke
//   --gate          the node-only sections + one browser smoke (load, newRun, 300 test-clock frames, lift one deck down, one high-quality render); target < 2 min
//   --only a,b      just these sections (names: --list); a browser section runs on a fresh page of its kind
//   --seed N        Math.random seed for every page (env TEST_SEED; default 1); each browser section re-seeds from (N, its name) before it runs,
//                   so `--only <section> --seed N` replays the section with the same random draws as in a full run
//   --ship i        pin G.forceShip to SHIPS[i] for the whole run (sections that pick a ship themselves are overridden)
// Pages run on the test clock: G.manual = true stops main.js frame() from stepping or drawing the world; sections tick with __game.step / __game.advance
// (game timers such as the madness lift's perk screen run on that clock too; env TEST_REALTIME=1 brings back the wall-clock loop for comparison).
// ?test=1 gives a cheap renderer (no antialias / shadow maps, pixel ratio 1) and no background portrait rendering (js/menus.js).
// A FAIL prints ship / run seed / deck and a replay line. Each section prints its wall time and JS heap.
// Sections (in order): node unit suites (tools/test-*.mjs), room props, generator, ship decks, inventory rooms, director cascade, crew voices, pace presets;
//   madness page: bot run (chips, lift, perk, to the win screen), parkour, director repairer, fixture search, inventory in game, prop models, madness zapper;
//   nominal page: Systems Nominal ship / turbolift / billet / duty / NPC walking / equipment / handhelds / doors, voices speech, NPC lift riders;
//   voices.html; nominal page 3: nav HUD, NPC walking, comms HUD, UI, talk, combat, wiring, job mini-games, pace / crew repair / shift end; smoke on the seed set (tools/seed-scan.mjs).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] ?? d); };
const SEED = +(arg('seed', process.env.TEST_SEED ?? 1)) >>> 0, SHIP = arg('ship', null) == null ? null : +arg('ship'), GATE = argv.includes('--gate'), ONLY = arg('only', null) ? String(arg('only')).split(',') : null;
// seed set for the full run's smoke (tools/seed-scan.mjs: smallest deck, a ring / twin hull, a large hull): [ship index, run seed]
const SEED_SET = [[3, 56], [4, 2], [2, 7]];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.exr': 'application/octet-stream', '.css': 'text/css', '.json': 'application/json' };
let errors = [], failed = false, cur = '', curPage = null, ctx = {};
const replay = (name) => `node tools/test.mjs --only ${name} --seed ${SEED}${SHIP != null ? ' --ship ' + SHIP : ''}`;
const where = () => `  ship=${ctx.ship ?? '-'} seed=${ctx.runSeed ?? '-'} (--seed ${SEED}) deck=${ctx.deck ?? '-'}   replay: ${replay(cur)}`;
let secFails = 0; const fail = (m) => { failed = true; secFails++; console.log('FAIL', m); if (!curPage) console.log(where()); };   // browser sections: the ship / seed / deck line follows once the section has ended (the page state it failed in)
const sections = [], S = (name, page, fn) => sections.push({ name, page, fn });   // page: null = node only

// ---- node-only sections ----
import { unitTests as commsUnit, hudTests as commsHud } from './test-comms.mjs';   // alerts / comm bus / bridge model / HUD (tools/test-comms.mjs)
import { simTests } from './test-sim.mjs';
import { walkTests, walkBrowser } from './test-walk.mjs';   // NPC walking between schedule blocks: sim.bodies, lift, sealed doors, friends (tools/test-walk.mjs)
import { dutyTests } from './test-duty.mjs';
import { socialTests } from './test-social.mjs';   // social tracker + sim/duty hooks (tools/test-social.mjs)
import { gaitTests } from './test-gait.mjs';
import { movementTests } from './test-movement.mjs';
import { equipmentTests } from './test-equipment.mjs';   // equipment motions / carry items (tools/test-equipment.mjs)
import { roleTests } from './test-role.mjs';   // role choice: URL > storage > random (tools/test-role.mjs)
import { repairTests } from './test-repair.mjs';   // NPC repair response, sim priorities, pace, speech etiquette (tools/test-repair.mjs)
import { handheldTests } from './test-handhelds.mjs';   // handheld job equipment / improvised weapons (tools/test-handhelds.mjs)
import { navTests, navBrowser } from './test-nav.mjs';   // routing / cross-deck plans / pins + nav HUD (tools/test-nav.mjs)
import { uiTests, uiBrowser } from './test-ui.mjs';   // UI layer stack / Esc / pointer lock, wheel maths, toasts, icons (tools/test-ui.mjs)
import { talkTests, talkBrowser } from './test-talk.mjs';   // conversation close-up: state machine, framing, pause rules, intents (tools/test-talk.mjs)
import { combatTests, combatBrowser, combatMadness } from './test-combat.mjs';   // grapple + melee rules / bodies / security (tools/test-combat.mjs)
import { wiringTests, wiringBrowser } from './test-wiring.mjs';   // art wiring pass: system hosts, art carts, wear glue, animations, stretcher, icons (tools/test-wiring.mjs)
import { padBrowser } from './test-gamepad.mjs';   // gamepad: mocked navigator.getGamepads (tools/test-gamepad.mjs)
import { jobgameTests, jobgameBrowser, jobsiteBrowser, jobmoduleBrowser } from './test-jobgames.mjs';   // job mini-games + first-use tool instructions (tools/test-jobgames.mjs)
import { saveTests, saveBrowser } from './test-save.mjs';   // versioned save, boards, export/import/reset (tools/test-save.mjs)
import { touchTests, touchBrowser } from './test-touch.mjs';   // touch / mobile controls: stick, look drag, buttons, mini-game + room job by touch (tools/test-touch.mjs)
import { installHelpers } from './test-helpers.mjs';   // in-page __T helpers: standNear / openSideOf / nearestProp / farFrom / clearSite / hideEnemies / quiet / arena (tools/test-helpers.mjs)
for (const [n, f] of [['comms', commsUnit], ['sim', simTests], ['walk-unit', walkTests], ['duty', dutyTests], ['social', socialTests], ['gait', gaitTests], ['movement', movementTests],
  ['equipment-unit', equipmentTests], ['repair-unit', repairTests], ['role', roleTests], ['handhelds-unit', handheldTests], ['nav-unit', navTests], ['ui-unit', uiTests], ['talk-unit', talkTests], ['combat-unit', combatTests], ['wiring-unit', wiringTests], ['jobgames-unit', jobgameTests], ['save-unit', saveTests], ['touch-unit', touchTests]]) S(n, null, () => f(fail));

// room layouts with the art-batch props (js/gen.js, docs/propart-integration.md): each room type gets its new furniture often enough, props stay reachable
S('room-props', null, async () => {
  const { generate, genShip } = await import(new URL('../js/gen.js', import.meta.url)), { SHIPS, deckOptions } = await import(new URL('../js/ships.js', import.meta.url));
  const WANT = { bridge: ['helm'], engineering: ['reactorstation', 'fieldgen'], shuttlebay: ['baycontrol'], transporter: ['beampedestal'], holodeck: ['holodesk'], brig: ['secdesk'], sickbay: ['nursestation'],
    mess: ['range', 'servery'], lounge: ['bar'], plant: ['pumpskid', 'heatexch', 'scrubber'], workshop: ['fabricator'], morgue: ['autopsy_table'], quarters: ['desk'] };
  // batches 5-11 (docs/propart-integration.md "Batches 5-11"): the set each room should usually get
  Object.assign(WANT, { bridge: [...WANT.bridge, 'navstation', 'opsstation'], engineering: [...WANT.engineering, 'plottable'], shuttlebay: [...WANT.shuttlebay, 'workpod', 'maint_stand'],
    arboretum: ['growbed', 'nutrient_tanks', 'tree'], lab: ['charttable', 'spectrometer'], armory: ['issuecounter'], gym: ['sparring_set', 'dumbbell_rack'], laundry: ['dryer'], lounge: [...WANT.lounge, 'arcade'],
    readyroom: ['briefing_table'], datacore: ['commsstation'], workshop: [...WANT.workshop, 'drill_press'], airlock: ['airlock_doors'] });
  const rooms = {}, has = {}, D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]]; let levels = 0, stranded = 0, big5 = 0, big5full = 0, exitInRoom = 0;
  const BIGSET = { lab: ['charttable', 'spectrometer', 'fumehood', 'sensorstation'], shuttlebay: ['workpod', 'maint_stand'], gym: ['sparring_set', 'dumbbell_rack', 'exercise_bike', 'rower'], lounge: ['bar', 'pool_table', 'card_table', 'arcade'], datacore: ['relayrack', 'commsstation'], workshop: ['knee_mill', 'drill_press'] }, bigN = {}, bigFull = {};   // 5x5+ rooms get the batch 5-11 set
  for (let i = 0; i < 320; i++) {
    const ship = SHIPS[i % SHIPS.length], sd = i % ship.decks, d = generate(sd, i * 4057 + 17, deckOptions(ship, sd, { require: i % 2 === 0 })); levels++;
    const W = d.W, seen = new Uint8Array(W * d.H), q = [d.start]; seen[d.start[0] + d.start[1] * W] = 1;
    while (q.length) { const [x, y] = q.pop(); for (const [a, b] of D4) { const nx = x + a, ny = y + b; if (nx < 0 || ny < 0 || nx >= W || ny >= d.H || seen[nx + ny * W] || d.grid[ny][nx] !== 0) continue; seen[nx + ny * W] = 1; q.push([nx, ny]); } }
    if (d.room[d.exit[1]][d.exit[0]]) exitInRoom++;
    for (const r of d.rooms) {
      rooms[r.type] = (rooms[r.type] || 0) + 1; const inR = d.props.filter(p => p.tx >= r.x && p.tx < r.x + r.w && p.ty >= r.y && p.ty < r.y + r.h);
      for (const k of new Set(inR.map(p => p.kind))) has[r.type + '/' + k] = (has[r.type + '/' + k] || 0) + 1;
      for (const p of inR) if (p.wall && !D4.some(([a, b]) => seen[p.tx + a + (p.ty + b) * W])) stranded++;   // wall-placed props always keep a reachable side
      if (BIGSET[r.type] && r.w >= 5 && r.h >= 5) { bigN[r.type] = (bigN[r.type] || 0) + 1; if (BIGSET[r.type].every(k => inR.some(p => p.kind === k))) bigFull[r.type] = (bigFull[r.type] || 0) + 1; }
      if (r.type === 'sickbay' && r.w >= 5 && r.h >= 5) { big5++; if (['surgical_table', 'exam_couch', 'steriliser', 'med_dispenser'].every(k => inR.some(p => p.kind === k))) big5full++; }
    }
  }
  const low = []; for (const [room, ks] of Object.entries(WANT)) for (const k of ks) { const n = rooms[room] || 0, h = has[room + '/' + k] || 0; if (n >= 4 && h < n * (room === 'plant' ? 0.25 : 0.6)) low.push(`${room}/${k} ${h}/${n}`); }
  const bigLow = Object.keys(bigN).filter(t => (bigFull[t] || 0) < bigN[t] * 0.9).map(t => `${t} ${bigFull[t] || 0}/${bigN[t]}`);
  console.log(`room props: ${levels} levels, ${Object.keys(has).length} room/prop pairs, wall props stranded ${stranded}, big sickbays with the medical set ${big5full}/${big5}, big rooms with their set ${Object.keys(bigN).map(t => t + ' ' + (bigFull[t] || 0) + '/' + bigN[t]).join(' ')}, lift in a room ${exitInRoom}${low.length ? ', too rare: ' + low.join('; ') : ''}${bigLow.length ? ', big rooms short: ' + bigLow.join('; ') : ''}`);
  if (low.length || stranded || exitInRoom || big5full < big5 || bigLow.length) fail('room props');
});
const GEN = await imp('js/gen.js'), SHIPSM = await imp('js/ships.js'), TUBEM = await imp('js/tube.js');
S('generator', null, async () => {   // every chip and the exit are reachable on decks 0-11 x 25 seeds (js/gen.js in node)
const gen = (() => {
  const { generate } = GEN, { SHIPS, deckOptions } = SHIPSM; const bad = []; let masked = 0, minOpen = 1e9; let n = 0, tubes = 0, withTubes = 0, ladders = 0, bigRooms = 0, bends = 0, bendLadders = 0, twoBends = 0, junctions = 0, xJunctions = 0;
  for (let deck = 0; deck < 12; deck++) for (let seed = 1; seed <= 25; seed++) {
    const ship = SHIPS[(deck + seed) % SHIPS.length], sd = Math.round(Math.min(deck, 7) / 7 * (ship.decks - 1)); const d = generate(deck, seed * 7919 + deck, deckOptions(ship, sd)); n++;
    const wallCount = d.grid.reduce((a, r) => a + r.reduce((b, c) => b + (c === 1 ? 1 : 0), 0), 0); if (d.W > 2 * Math.min(6 + Math.floor(deck * 0.7), 11) + 1) masked++; minOpen = Math.min(minOpen, d.openTiles.length);
    const W = d.W, H = d.H, seen = new Uint8Array(W * H), q = [d.start]; if (d.chips.length < 2) bad.push(`deck ${deck} seed ${seed}: only ${d.chips.length} chips`); seen[d.start[0] + d.start[1] * W] = 1;
    while (q.length) { const [x, y] = q.pop(); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + a, ny = y + b; if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[nx + ny * W] || d.grid[ny][nx] !== 0 || !TUBEM.tubeStep(d, x + y * W, nx + ny * W, a, b)) continue; seen[nx + ny * W] = 1; q.push([nx, ny]); } }   // tubes are entered / left only through their open ends
    // the exit tile itself may be a special tile; accept it if a neighbour is reachable
    const ok = ([x, y]) => seen[x + y * W] || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => seen[x + a + (y + b) * W]);
    if (!d.chips.every(ok) || !ok(d.exit)) bad.push(`deck ${deck} seed ${seed}`);
    // every tube is a chain a -> tiles -> b of open tiles: contiguous, consistent per-tile axis / bend data, at most one 90-degree bend (never a ladder shaft), both mouths open non-tube tiles,
    // and the open-edge rule lets you walk it end to end but never leave it sideways
    for (const t of d.tubes) {
      const where = `deck ${deck} seed ${seed} tube ${t.a}->${t.b}`, chain = [t.a, ...t.tiles, t.b], id = ([x, y]) => x + y * W; let turns = 0;
      if (t.branch) { if (t.tiles.length < 1 || d.tubeAxis[id(t.a)] !== 'xy' || !(d.tubeBend[id(t.a)]?.length >= 3) || d.tubeAxis[id(t.b)] || d.grid[t.b[1]][t.b[0]] !== 0 || t.ladder !== -1 || t.bends.length) bad.push(where + ': a branch starts at a three-way junction tile and ends on an open non-tube tile'); junctions++; if (d.tubeBend[id(t.a)]?.length === 4) xJunctions++; }
      else if (t.tiles.length < 1 || d.tubeAxis[id(t.a)] || d.tubeAxis[id(t.b)] || d.grid[t.a[1]][t.a[0]] !== 0 || d.grid[t.b[1]][t.b[0]] !== 0) bad.push(where + ': mouths must be open non-tube tiles');
      for (let i = 1; i < chain.length; i++) { const [dx, dy] = [chain[i][0] - chain[i - 1][0], chain[i][1] - chain[i - 1][1]]; if (Math.abs(dx) + Math.abs(dy) !== 1) { bad.push(where + ': not contiguous'); break; } if (!TUBEM.tubeStep(d, id(chain[i - 1]), id(chain[i]), dx, dy) || !TUBEM.tubeStep(d, id(chain[i]), id(chain[i - 1]), -dx, -dy)) bad.push(where + `: mouth chain blocked at step ${i}`); }
      t.tiles.forEach((tl, i) => {
        const k = id(tl), pv = chain[i], nx = chain[i + 2], din = [tl[0] - pv[0], tl[1] - pv[1]], dout = [nx[0] - tl[0], nx[1] - tl[1]], straight = din[0] === dout[0] && din[1] === dout[1], ax = d.tubeAxis[k];
        if (d.grid[tl[1]][tl[0]] !== 0 || d.room[tl[1]][tl[0]] !== 'jefferies' || !d.tubeLevel[k]) bad.push(where + ': tile not a jefferies tile');
        const jn = ax === 'xy' && d.tubeBend[k]?.length >= 3;   // a T junction on this tube: the chain's two directions plus the branch
        if (jn) { if (!straight || !d.tubeBend[k].some(([a2, b2]) => a2 === -din[0] && b2 === -din[1]) || !d.tubeBend[k].some(([a2, b2]) => a2 === dout[0] && b2 === dout[1])) bad.push(where + `: junction tile ${i} does not carry the chain directions`); }
        else if (straight ? ax !== (din[0] ? 'x' : 'y') : (ax !== 'xy' || JSON.stringify(d.tubeBend[k]) !== JSON.stringify([[-din[0], -din[1]], dout]))) bad.push(where + `: tile ${i} axis ${ax} does not match its neighbours`);
        if (!straight) { turns++; if (!(t.bends || []).includes(i)) bad.push(where + ': t.bends index'); if (d.tubeLevel[k] === 'lad') bad.push(where + ': ladder on the bend'); }
        // sealed sides: every neighbour that is not the previous / next tile of the chain must be unreachable from this tile
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = [tl[0] + a, tl[1] + b]; if ((n[0] === pv[0] && n[1] === pv[1]) || (n[0] === nx[0] && n[1] === nx[1]) || (jn && d.tubeBend[k].some(([a2, b2]) => a2 === a && b2 === b))) continue; if (d.grid[n[1]]?.[n[0]] === 0 && TUBEM.tubeStep(d, k, id(n), a, b)) bad.push(where + `: tile ${i} leaks sideways to ${n}`); }
      });
      if (turns > 2) bad.push(where + ': more than two bends'); if ((t.bend >= 0) !== (turns >= 1) || (t.bends || []).length !== turns) bad.push(where + ': t.bend flag'); if (turns === 2) twoBends++;
      const lv = t.tiles.map(tl => d.tubeLevel[id(tl)]).join(' '); if (!/^lo( lo)*( lad( up)+)?$/.test(lv)) bad.push(where + ': level order ' + lv);
      if (turns) { bends++; if (t.ladder > 0) bendLadders++; }
    }
    tubes += d.tubes.length; if (d.tubes.length) withTubes++; ladders += d.tubes.filter(t => t.ladder > 0).length; bigRooms += d.rooms.filter(r => r.big).length;
  }
  return { n, bad, tubes, withTubes, ladders, bigRooms, masked, minOpen, bends, bendLadders, twoBends, junctions, xJunctions };
})();
console.log(`generator: ${gen.n} levels, ${gen.bad.length} unreachable, ${gen.tubes} Jiffy tubes on ${gen.withTubes} levels (${gen.ladders} with ladders, ${gen.bends} with a bend (${gen.twoBends} with two), ${gen.junctions} junction branches (${gen.xJunctions} on X junctions), ${gen.bendLadders} bent + laddered), ${gen.bigRooms} large rooms, ${gen.masked} hull-shaped decks, smallest deck ${gen.minOpen} open tiles`); if (gen.withTubes < gen.n * 0.5) fail('too few tubes'); if (gen.bends < gen.tubes * 0.15) fail('too few bent tubes'); if (gen.bad.length) fail('generator: ' + gen.bad.slice(0, 5).join('; '));
{ // liminal twins (opts.liminal): two identically furnished rooms, every chip and the exit still reachable; catwalks and atria generate
  const { generate: gen2 } = await import('../js/gen.js'); let n = 0, bad = 0, twins = 0, catwalks = 0, atria = 0;
  for (let d = 2; d < 11; d++) for (let s = 1; s <= 40; s++) { const g = gen2(d, s * 31, { liminal: true, weights: { atrium: 2, lounge: 3, lab: 3, quarters: 3, cargo: 2, engineering: 2, shuttlebay: 2 } }); n++; if (g.rooms.some(r => r.twin)) twins++; catwalks += g.props.filter(p => p.kind === 'catwalk').length; atria += g.rooms.filter(r => r.type === 'atrium').length;
    if (g.chips.some(c => !(g.dist[(c.x ?? c[0]) + (c.y ?? c[1]) * g.W] >= 0))) bad++; }
  console.log(`liminal: ${n} decks, ${twins} with twin rooms, ${catwalks} catwalks, ${atria} atria, ${bad} with unreachable chips`); if (bad || !twins || !catwalks || !atria) fail('liminal / tall rooms');
}
});
S('ship-decks', null, async () => {   // every deck of every ship generates, ship-level rooms exist per shipPlan (js/gen.js in node)
const shipTest = (() => {
  const { SHIPS } = SHIPSM, { genShip, shipPlan } = GEN;
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
})();
console.log(`ship decks: ${shipTest.decks} generated, ${shipTest.bad.length} problems`); if (shipTest.bad.length) fail('ship decks: ' + shipTest.bad.slice(0, 6).join('; '));
});
S('inventory-rooms', null, async () => {   // the new room types turn up across 120 generated decks (was the first half of the in-game inventory probe)
  const NEW = new Set(['readyroom', 'brig', 'armory', 'gym', 'lab', 'laundry', 'lounge', 'workshop', 'plant', 'morgue', 'datacore', 'stores', 'washroom', 'airlock']), seen = new Set();
  { const { generate } = GEN, { SHIPS, deckOptions } = SHIPSM;
    for (let i = 0; i < 120; i++) { const ship = SHIPS[i % SHIPS.length], sd = i % ship.decks, d = generate(sd, i * 7919 + 3, deckOptions(ship, sd)); for (const r of d.rooms) if (NEW.has(r.type)) seen.add(r.type); } }
  const newRooms = [...seen]; console.log('inventory rooms:', JSON.stringify(newRooms)); if (!(newRooms.length >= 12)) fail('inventory in game: new room types ' + newRooms.length);
});
S('director-cascade', null, async () => {   // Director pacing + ShipState cascade (the module half of "director"; the crew repairer stays in the browser)
  const { Director } = await imp('js/director.js'); const { ShipState } = await imp('js/crew.js'); const { SHIPS } = SHIPSM;
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const D = new Director(rnd); D.reset(3); const acts = {}, phases = new Set(); let t = 0;
  const run = (secs, tension) => { for (let i = 0; i < secs * 10; i++) { t += 0.1; const a = D.update(0.1, { tension, deckTime: t, faults: 1, dormant: 1, active: 1, madPending: 20 }); if (a) acts[a] = (acts[a] || 0) + 1; phases.add(D.phase); } };
  run(240, 0); const quietActs = Object.values(acts).reduce((a, b) => a + b, 0);
  run(60, 1); const peaked = phases.has('peak'); run(90, 0);
  const SS = new ShipState(SHIPS[0], 5); SS.repair('reactor'); SS.damage('coolant', 1); for (let i = 0; i < 450; i++) SS.tick(0.1, { deckTime: 0, tension: 0, deck: 1 });
  const dir = { quietActs, acts, peaked, relaxed: phases.has('relax'), backToBuild: D.phase === 'build', cascadeReactor: SS.status('reactor') };
  console.log('director:', JSON.stringify(dir)); if (!(dir.quietActs >= 4 && dir.peaked && dir.relaxed && dir.cascadeReactor !== 'nominal')) fail('director');
});
S('voices', null, async () => {   // crew voices / tags / lift lines over every ship x 3 seeds (js/voice.js + js/crew.js in node; personas from assets/data/personas.json)
const V = await imp('js/voice.js'); V.setPersonas(JSON.parse(readFileSync(join(ROOT, 'assets/data/personas.json'), 'utf8')));
const vox = await (async () => {
  const { SHIPS } = SHIPSM, { makeComplement } = await imp('js/crew.js');
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
  return { people, avgTags: +(tagTotal / people).toFixed(1), personas, bad, noFx, extra, asym, tags: all.length, pitch: Object.fromEntries(Object.entries(bodies).map(([k, a]) => [k, +avg(a).toFixed(2)])), lbad, sample: lines.slice(0, 4), ex, exOk };
})();
console.log('voices:', JSON.stringify({ ...vox, bad: vox.bad.slice(0, 4) }));
{ const o = vox; if (!(o.bad.length === 0 && o.noFx.length === 0 && o.extra.length === 0 && o.asym === 0 && o.personas === o.people && o.lbad.length === 0 && o.exOk && o.pitch.crew_heavy < o.pitch.crew_m && o.pitch.crew_m < o.pitch.crew_f2)) fail('crew voices: ' + JSON.stringify({ bad: o.bad.slice(0, 3), noFx: o.noFx.slice(0, 3), extra: o.extra, asym: o.asym, lbad: o.lbad.slice(0, 3), exOk: o.exOk, ex: o.ex })); }
});
S('pace-presets', null, async () => {   // First watch / Crunch / Standard scale the clock, duty, tasks and phases (js/pace.js through the modules newRun wires them into)
  const PC = await imp('js/pace.js'), K = await imp('js/clock.js'), C = await imp('js/crew.js'), D = await imp('js/duty.js'), PH = await imp('js/phases.js'), { SHIPS } = SHIPSM;
  const duties = JSON.parse(readFileSync(join(ROOT, 'assets/data/duties.json'), 'utf8')), ship = SHIPS[0], seed = 4242, roster = C.makeComplement(ship, seed), player = D.pickBillet(roster, seed); player.isPlayer = true;
  const snap = (id) => { const pace = PC.paceFor(id), clock = new K.ShipClock({ seed }); clock.assign(roster); clock.setPace(pace.T); const ss = new C.ShipState(ship, seed); ss.paceT = pace.T;   // as js/main.js setupDuty
    const duty = new D.Duty({ player, roster, clock, duties, shipState: ss, seed, mission: D.pickMission ? D.pickMission(seed) : 'quiet_watch', pace }), ph = new PH.Phases({ shipState: ss, roster, duty, seed, pace });
    return { id: pace.id, T: clock.paceT, rate: +clock.rate.toFixed(5), firstDue: Math.round(Math.min(...duty.loops.map(l => l.next))), period0: duty.loops[0]?.period, run: ph.runLength, phaseAt: ph.phaseAt[4], firstTask: Math.round(Math.min(...duty.tasks.map(t => t.at_s), 1e9)), cascadeT: ss.paceT }; };
  const r = { first: snap('first'), crunch: snap('crunch'), std: snap('standard'), read: [PC.readPace('?pace=crunch', null).id, PC.readPace('', null, true).id, PC.paceFor('nope').id] };
  console.log('pace presets:', JSON.stringify(r));
  if (!(r.first.T === 2.5 && r.first.firstDue >= 180 && r.first.firstTask >= 240 && r.first.run === 3000 && r.first.phaseAt === 2400 && r.crunch.T === 0.7 && r.crunch.run === 840 && r.std.T === 1 && r.std.run === 1200 && r.first.rate < r.std.rate && r.std.rate < r.crunch.rate && r.read.join() === 'crunch,standard,standard')) fail('pace presets ' + JSON.stringify(r));
});

S('perf-governor', null, async () => {   // auto-quality ladder (js/perfgov.js): steps down in order, recovers with hysteresis, ignores spikes, honours a manual choice
  const { Governor, LEVELS } = await imp('js/perfgov.js'), run = (g, ms, secs) => { let ch = []; for (let i = 0; i < secs * 1000 / ms; i++) { const r = g.tick(ms); if (r >= 0) ch.push(r); } return ch; };
  const r = {}; let g = new Governor();
  r.smooth = run(g, 16.7, 60).length;                                  // a healthy 60 fps machine never moves
  g = new Governor(); r.slow = run(g, 40, 40); r.slowEnd = g.level;     // steady 25 fps: walks down rung by rung to 3 (high at 55 %) and stops: 40 ms is under the 45 ms Performance bar
  g = new Governor(); r.vslow = run(g, 100, 10);                         // 10 fps: straight to Performance within seconds
  g = new Governor(); run(g, 40, 20); const lv = g.level; r.recov = run(g, 14, 40); r.recovEnd = g.level; r.lv = lv;   // machine recovers (e.g. a busy scene is left): climbs back to High
  g = new Governor(); r.spike = [...Array(50)].map(() => g.tick(900)).filter(x => x >= 0).length + run(g, 16, 5).length;   // tab-switch stalls are ignored
  g = new Governor(); r.paused = [...Array(2000)].map(() => g.tick(100, false)).filter(x => x >= 0).length;   // not judged outside the world
  g.setManual('low'); r.pinned = [...Array(3000)].map(() => g.tick(10)).filter(x => x >= 0).length + '/' + g.level; g.setManual('high'); r.manualHigh = g.level + '/' + g.auto;
  g = new Governor(); const seq = []; for (let k = 0; k < 6; k++) { seq.push(...run(g, 40, 14), ...run(g, 12, 40)); } r.flaps = g.changes.filter(c => c[0] === 'down').length; r.upMul = g.upMul;   // load oscillating around the thresholds: recoveries back off, so downs stay few
  console.log('perf governor:', JSON.stringify(r));
  const ok = r.smooth === 0 && r.slow.join() === '1,2,3' && r.slowEnd === 3 && r.vslow.join() === String(LEVELS.length - 1) && r.lv > 0 && r.recovEnd === 0 && r.spike === 0 && r.paused === 0 && r.pinned === '0/' + (LEVELS.length - 1) && r.manualHigh === '0/true' && r.upMul > 1 && LEVELS[0].scale === 1 && LEVELS[0].shadow === 1024 && LEVELS[0].cones;
  if (!ok) fail('perf-governor ' + JSON.stringify(r));
});
// ---- browser ----
const { chromium } = require('playwright');
const server = createServer(async (req, res) => {
  try { const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html')); const b = await readFile(p); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port; let browser = null;
const strSeed = (s) => { let h = SEED ^ 0x9e3779b9; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0; return h >>> 0; };
// one browser for the whole run; ONE live page at a time (each page is its own renderer process, closed once its sections are done: every newRun() builds a ship).
// Page load + game ready get a generous timeout and ONE retry on a fresh page (logged as RETRY): a slow or crashed load is not a test result.
// Nothing else is retried here: a section that fails, fails.
const gameReady = async (p) => p.evaluate(async ({ ship, manual }) => { await __game.ready; await __game.warmed; __game.setQuality('low'); __game.G.manual = manual; if (ship != null) Object.defineProperty(__game.G, 'forceShip', { get: () => ship, set: () => { }, configurable: true }); }, { ship: SHIP, manual: !process.env.TEST_REALTIME });   // TEST_REALTIME=1: the old wall-clock frame loop (diagnostics only)
const openPage = async (path, tag = '', viewport = { width: 320, height: 180 }, ready = gameReady) => {
  if (!browser) browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc', '--autoplay-policy=no-user-gesture-required'] });   // a running AudioContext: in a suspended one (no user gesture) every scheduled sound node stays alive, gigabytes over a run
  for (let attempt = 1; ; attempt++) {
    const p = await browser.newPage(viewport.device ? { ...viewport.device, deviceScaleFactor: 1 } : { viewport });   // viewport.device: a Playwright device profile (touch page) p.setDefaultTimeout(120000); p.setDefaultNavigationTimeout(120000);
    await p.addInitScript((seed) => { window.__seedRandom = (s) => { let a = s >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }; window.__seedRandom(seed); }, SEED);   // Math.random seeded (the generator of tools/soak-walk.mjs); __seedRandom re-seeds per section
    const errs = []; p.on('pageerror', e => errs.push(tag + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(tag + m.text()); }); p.on('crash', () => errs.push(tag + 'renderer crashed'));
    try { await p.goto(`http://localhost:${port}/${path}`); await ready(p); p.on('pageerror', e => errors.push(tag + e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(tag + m.text()); }); p.on('crash', () => errors.push(tag + 'renderer crashed')); errors.push(...errs); return p; }
    catch (e) { await p.close().catch(() => { }); if (attempt >= 2) throw e; console.log(`RETRY page load ${path}: ${String(e.message || e).split('\n')[0]}${errs.length ? ' / ' + errs[0] : ''}`); }
  }
};
const PAGES = {   // page kinds: how to open one
  madness: () => openPage('index.html?mode=madness&test=1'),
  nominal: () => openPage('index.html?test=1', 'nominal: '),
  voices: () => openPage('voices.html?ship=3&seed=2', 'voices.html: ', { width: 900, height: 600 }, (p) => p.waitForFunction(() => window.__ready, null, { timeout: 60000 })),
  nominal3: async () => { const p = await openPage('index.html?test=1', 'nominal: '); await p.evaluate(() => { __game.G.forceShip = 1; }); return p; },   // forceShip 1 as the lift-rider section on the previous page leaves it
  smoke: () => openPage('index.html', 'smoke: '),
  touch: () => openPage('index.html?test=1', 'touch: ', { device: require('playwright').devices['Pixel 7 landscape'] }),   // phone profile: coarse pointer, touch events   // no ?test=1: the one high-quality render runs on the real renderer settings
};

// ---- madness page (?mode=madness, the old roguelike) ----
S('madness-mode', 'madness', async (page) => { if (await page.evaluate(() => __game.G.mode) !== 'madness') fail('?mode=madness did not select madness mode'); });
S('bot-run', 'madness', async (page) => {   // collect chips, ride the lift, pick a perk, through to the win screen, with every enemy type ticking
const run = await page.evaluate(async () => {
  const g = __game, kinds = new Set(); g.newRun(); g.setQuality('low');
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('show'));
  const key = (code) => { for (const t of ['keydown', 'keyup']) document.dispatchEvent(new KeyboardEvent(t, { code, key: code.replace('Key', '').replace('Digit', '').toLowerCase(), bubbles: true })); };
  let t = 0; const tick = (n) => { for (let i = 0; i < n; i++) { t += 1 / 30; g.step(1 / 30, t); } }, adv = (secs) => { for (let i = 0; i < Math.round(secs * 30); i++) { t += 1 / 30; g.advance(1 / 30, t); } };   // adv: test-clock frames (the lift fade and the perk screen run on game timers)
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
    for (const r of g.repairPts) if (Math.hypot(r.x - g.world.liftPos.x, r.z - g.world.liftPos.z) < r.reach + 0.5 && g.shipState.status(r.sys) !== 'nominal') g.shipState.repair(r.sys);   // a damaged system in reach of the lift (the lift controls themselves when 'lifts' is only degraded, or a junction beside the car) turns E into hold-to-repair (js/main.js interact): the bot would press E forever
    for (let k = 0; k < 4 && g.G.phase === 'play'; k++) { g.P.clung = 0; g.P.kbx = g.P.kbz = 0; g.P.x = g.world.liftPos.x; g.P.z = g.world.liftPos.z; tick(2); key('KeyE'); tick(1); }
    adv(2.6); tick(4);
    for (let w = 0; w < 36 && g.G.deck === deck && g.G.phase !== 'win' && g.G.phase !== 'perk'; w++) { adv(0.5); tick(4); }   // keep waiting for the lift transition (up to ~20 s of game time)
    if (g.G.phase === 'perk') { key('Digit1'); adv(0.3); }
    if (g.G.phase === 'paused') { document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); g.G.phase = 'play'; }   // no pointer lock in headless
    log.push(`${deck}→${g.G.deck}:${g.G.phase}`);
    if (g.G.deck === deck && g.G.phase !== 'win') return { err: `deck ${deck} did not advance (phase ${g.G.phase})`, log };
  }
  return { phase: g.G.phase, deck: g.G.deck, kinds: [...kinds], log };
});
console.log('bot run:', JSON.stringify(run)); if (run.err || run.phase !== 'win') fail('bot run');
});
S('parkour', 'madness', async (page) => {   // jump, mantle, grapple, Jiffy tube, space madness, crazed crew climbing, ship-system repair
await installHelpers(page);
const park = await page.evaluate(async () => {
  const g = __game, P = g.P, r = {}; g.newRun(); const w = g.world; g.setQuality('low'); document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); g.G.phase = 'play'; g.G.hp = 1e6; for (const e of g.gorns) { e.dead = true; e.delay = 1e9; e.mesh.visible = false; } g.gorns.length = 0; P.clung = 0;
  const key = (code) => { g.G.phase = 'play'; for (const t of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(t, { code })); };
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
  let tw = null; for (let d = 2; d < 9 && !tw; d++) { g.loadDeck(d); if (g.world.d.tubes.some(t => t.ladder > 0 && t.bend < 0)) tw = g.world; }   // straight + laddered: W held along the axis
  if (tw) { for (const e of g.gorns) { e.dead = true; e.mesh.visible = false; } g.gorns.length = 0;
    const t = tw.d.tubes.find(t => t.ladder > 0 && t.bend < 0), ca = tw.center(t.a[0], t.a[1]), cb = tw.center(t.b[0], t.b[1]); reset(); P.x = ca[0]; P.z = ca[1]; P.yaw = Math.atan2(ca[0] - cb[0], ca[1] - cb[1]); g.G.phase = 'play';
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); let ducked = false, minD = 1e9, topY = 0;
    for (let i = 0; i < 60 * 12; i++) { tick(1); g.G.phase = 'play'; P.clung = 0; if (tw.isTube(...tw.tile(P.x, P.z)) && P.crouch) ducked = true; topY = Math.max(topY, P.y); minD = Math.min(minD, Math.hypot(P.x - cb[0], P.z - cb[1])); }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); r.tube = { len: t.tiles.length, ladder: t.ladder, ducked, climbed: +topY.toFixed(2), reached: minD < 0.8 && topY > 1.6 }; }
  // Jiffy tube bend: crawl a bent, ladder-free tube end to end (yaw steered at each tile centre in turn, W held): must duck, stay inside the L, and come out of the far mouth
  { let bw = null, bt = null; for (const need of [1, 0]) for (let d = 1; d < 10 && !bt; d++) { g.loadDeck(d); const t = g.world.d.tubes.find(t => t.bend >= need && t.ladder < 0); if (t) { bw = g.world; bt = t; } }   // prefer a corner with straight tiles on both sides
    if (bt) { for (const e of g.gorns) { e.dead = true; e.mesh.visible = false; } g.gorns.length = 0;
      const pts = [bt.a, ...bt.tiles, bt.b].map(([x, y]) => bw.center(x, y)), ok = new Set([bt.a, ...bt.tiles, bt.b].map(([x, y]) => x + ',' + y)); reset(); P.x = pts[0][0]; P.z = pts[0][1]; g.G.phase = 'play';
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); let k = 1, ducked = false, strayed = 0, secs = 0, cornerDucked = false;
      for (let i = 0; i < 60 * 40 && k < pts.length; i++) { const [tx, tz] = pts[k]; P.yaw = Math.atan2(P.x - tx, P.z - tz); tick(1); g.G.phase = 'play'; P.clung = 0; secs++;
        const [px, py] = bw.tile(P.x, P.z); if (bw.isTube(px, py)) { if (P.crouch) ducked = true; if (px === bt.tiles[bt.bend][0] && py === bt.tiles[bt.bend][1] && P.crouch) cornerDucked = true; } if (!ok.has(px + ',' + py)) strayed++; if (Math.hypot(P.x - tx, P.z - tz) < 0.45) k++; }
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); r.bend = { len: bt.tiles.length, corner: bt.bend, ducked, cornerDucked, strayed, secs: +(secs / 60).toFixed(1), reached: k >= pts.length }; r.bend.ok = r.bend.reached && ducked && cornerDucked && strayed === 0; } }
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
    const chase = (wd, from, secs, until) => {   /* until(en, hits, maxY): the chase ends on a result (reached height), the seconds are only the bail-out */ for (const e of g.gorns) { e.dead = true; e.mesh.visible = false; } g.gorns.length = 0;
      const en = g.makeEnemy('crazed', wd, from, 3, 0, g.scene, g.sound); en.state = Sx.PATROL; en.mesh.visible = true; g.gorns.push(en); g.G.hp = 1e6; let maxY = 0, byEn = 0;
      const hp = g.G.hitPlayer, dd = g.G.dragDown; g.G.hitPlayer = (e, n) => { if (e === en) byEn++; return hp(e, n); }; g.G.dragDown = (e) => { if (e === en) byEn++; return dd(e); };
      let up = false; for (let i = 0; i < 60 * secs && !until(en, byEn, maxY); i++) { g.G.phase = 'play'; en.state = Sx.CHASE; en.timer = 5; en.setTarget(...wd.tile(P.x, P.z)); tick(1); maxY = Math.max(maxY, en.y); if (wd.tubeKind(...wd.tile(en.x, en.z)) === 'up') up = true; }
      g.G.hitPlayer = hp; g.G.dragDown = dd;
      return { maxY: +maxY.toFixed(2), upperRun: up, dist: +Math.hypot(en.x - P.x, en.z - P.z).toFixed(2), hit: byEn > 0 }; };
    for (let d = 1; d < 9 && !(c.prop && c.tube); d++) { g.loadDeck(d); const w = g.world;
      if (!c.prop) { __T.hideEnemies(); const low = w.d.props.filter(p => isFinite(w.topAt(p.tx, p.ty)) && w.topAt(p.tx, p.ty) < 1.1).map(p => p.kind), np = low.length ? __T.nearestProp(low, w.center(...w.d.start)[0], w.center(...w.d.start)[1], 1.4) : null;   // nearest climbable prop to the start with an open side (tools/test-helpers.mjs), not the first in the list
        if (np) { const pr = np.p, top = w.topAt(pr.tx, pr.ty); __T.clearSite(np.x, np.z, 6); const fld = w.field(...w.tile(np.side.x, np.side.z)); const from = w.d.openTiles.find(([x, y]) => fld[x + y * w.W] >= 3 && fld[x + y * w.W] <= 6 && !w.isTube(x, y)) || w.tile(np.side.x, np.side.z);
          reset(); P.x = np.x; P.z = np.z; P.y = top; P.grounded = true; tick(2);
          c.prop = { top: +top.toFixed(2), playerY: +P.y.toFixed(2), ...chase(w, from, 20, (en, b, my) => my >= top - 0.05 && b > 0) }; } }
      if (!c.tube) { const t = w.d.tubes.find(t => t.ladder >= 1 && t.ladder < t.tiles.length - 2) || w.d.tubes.find(t => t.ladder >= 1 && t.ladder < t.tiles.length - 1);
        if (t) { const up = t.tiles[t.ladder + 1]; reset(); const [px, pz] = w.center(up[0], up[1]); P.x = px; P.z = pz; P.y = 1.7; P.grounded = true; tick(2);
          c.tube = { playerY: +P.y.toFixed(2), ...chase(w, t.a, 40, en => en.y > 1.6 && wd_up(w, en)) }; } } }
    r.climb = c; }
  // ship systems: break life support, walk to its repair point on this deck, hold E until it is fixed
  { const S = g.shipState; for (const e of g.gorns) { e.dead = true; e.mesh.visible = false; } g.gorns.length = 0; reset(); g.G.hp = 100; g.G.phase = 'play';
    g.G.mad.t = 1e9; g.G.mad.pending = null; S.damage('life', 0.9); tick(2);   /* no new madman mid-repair: being mauled while holding E cost 100 HP and the repair */ const fx = g.G.fx; const rp = g.repairPts.find(p => p.sys === 'life');
    r.sys = { status: S.status('life'), suffocate: fx.suffocate, points: g.repairPts.length, junctions: g.repairPts.filter(p => !p.main).length };
    if (rp) { P.x = rp.x; P.z = rp.z; const hp0 = g.G.hp; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); let i = 0; for (; i < 60 * 15 && S.status('life') !== 'nominal'; i++) { g.G.phase = 'play'; tick(1); } window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
      r.sys.repaired = S.status('life') === 'nominal'; r.sys.secs = +(i / 60).toFixed(1); r.sys.hpLost = +(hp0 - g.G.hp).toFixed(1); }
    r.sys.roster = g.roster.people.length; r.sys.ship = g.G.ship.name; }
  return r;
});
console.log('parkour:', JSON.stringify(park)); if (!(park.jumpPeak > 0.5 && park.landed && park.mantled !== false && (park.run < 2 || park.grapplePeak > 0.4) && park.modes.includes('grapple') && (!park.tube || (park.tube.ducked && park.tube.reached)) && park.bend?.ok && (!park.climb.prop || (park.climb.prop.maxY >= park.climb.prop.top - 0.05 && park.climb.prop.hit)) && (!park.climb.tube || (park.climb.tube.maxY > 1.6 && park.climb.tube.upperRun) || park.climb.tube.hit)   /* climbed in after you, or dragged you out of the high mouth */ && park.mad.turned && park.mad.lowest && park.mad.red && park.mad.killedCrew > 0 && park.mad.next && park.mad.nextLowest && park.sys.repaired && park.sys.suffocate > 0 && park.sys.points >= 20)) fail('parkour');
});
S('director', 'madness', async (page) => {   // a crew member is dispatched to a lighting junction and fixes it (the Director / cascade half is the node section director-cascade)
await installHelpers(page);
const dir = await page.evaluate(async () => {
  const g = __game; g.newRun(); g.setQuality('low'); __T.hideEnemies();
  const sys = g.repairPts.some(p => p.sys === 'lighting') ? 'lighting' : g.repairPts.find(p => !p.main)?.sys || g.repairPts[0]?.sys;   // lighting junction, or (a deck with no wall space for one) the first junction this deck has
  g.shipState.damage(sys, 0.9, { quiet: true }); for (const e of g.ents.filter(e => e.repairing)) e.repairing = null; g.spawnRepairer(sys);
  const rep = g.ents.find(e => e.repairing?.sys === sys); let tt = 500, secs = 0;
  const budget = rep ? rep.repairing.need + 2 : 0;   // js/main.js spawnRepairer: they appear at the point and need 35-55 s (no hostile about to scare them off)
  if (rep) { g.P.x = rep.x + 30; for (let i = 0; i < 60 * budget && g.shipState.status(sys) !== 'nominal'; i++) { g.G.phase = 'play'; g.G.hp = 1e6; tt += 1 / 60; g.step(1 / 60, tt); secs = i / 60; } }
  return { sys, repairer: !!rep, crewFixed: g.shipState.status(sys) === 'nominal', secs: +secs.toFixed(0), budget };
});
console.log('director repairer:', JSON.stringify(dir)); if (!(dir.repairer && dir.crewFixed)) fail('director');
});
S('liminal', 'madness', async (page) => {   // tall rooms + catwalk climb (E at a module), walk-under collision, and the impossible corridor loop (two loops, then through)
await installHelpers(page);
const lim = await page.evaluate(async () => {
  const g = __game; g.setQuality('low'); __T.hideEnemies(); const out = { catwalk: null, loop: null, scanned: 0, withCat: 0, withLoop: 0 };
  for (let run = 0; run < 12 && !(out.catwalk && out.loop); run++) { g.G.forceSeed = 4000 + run * 977; g.G.forceShip = run % 10; g.newRun(); __T.hideEnemies();
    for (let n = 1; n <= 8 && !(out.catwalk && out.loop); n++) { g.loadDeck(n); __T.hideEnemies(); const w = g.world, P = g.P; out.scanned++; if (w.d.props.some(q => q.kind === 'catwalk')) out.withCat++; if (g.G.liminal) out.withLoop++;
      const cw = !out.catwalk && w.d.props.find(q => q.kind === 'catwalk');
      if (cw) { const top = w.topAt(cw.tx, cw.ty), spot = [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]].map(([a, b]) => [(cw.tx + 0.5) * 2.5 + a * 1.2, (cw.ty + 0.5) * 2.5 + b * 1.2]).find(([x, z]) => { const q = { x, z, y: 0 }; w.resolve(q, 0.3); return Math.hypot(q.x - x, q.z - z) < 0.02 && !w.solidAt(x, z); });
        if (spot) { P.x = spot[0]; P.z = spot[1]; P.y = 0; P.yaw = Math.atan2(-((cw.tx + 0.5) * 2.5 - P.x), -((cw.ty + 0.5) * 2.5 - P.z)); P.pitch = 0; g.G.phase = 'play'; g.step(0.05, 1);
          dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' })); for (let i = 0; i < 60; i++) { g.G.phase = 'play'; g.step(0.05, 2 + i * 0.05); }
          const q = { x: (cw.tx + 0.5) * 2.5, z: (cw.ty + 0.5) * 2.5, y: 0 }, x0 = q.x, z0 = q.z; w.resolve(q, 0.3);
          out.catwalk = { top, y: +P.y.toFixed(2), tall: w.isTall(cw.tx, cw.ty) || w.ceilAt(cw.tx, cw.ty) > 3.3, under: Math.hypot(q.x - x0, q.z - z0) < 0.01 }; } }
      const L = g.G.liminal;
      if (L && !out.loop) { const r = L.run, ctr = (u) => r.ax === 'x' ? w.center(u, r.fixed) : w.center(r.fixed, u), [x0, z0] = ctr(r.a + 1); P.x = x0; P.z = z0; P.y = 0; let loops = 0;
        for (let i = 0; i < 400 && L.count < 3; i++) { const px = P.x, pz = P.z; g.G.phase = 'play'; if (r.ax === 'x') { P.x += 0.2; P.vx = 4; P.vz = 0; } else { P.z += 0.2; P.vz = 4; P.vx = 0; } g.step(0.05, 10 + i * 0.05); if ((r.ax === 'x' ? P.x - px : P.z - pz) < -0.5) loops++; if (i > 300 && loops >= 2) break; }
        out.loop = { loops, count: L.count, len: r.b - r.a + 1 }; } } }
  return out;
});
console.log('liminal:', JSON.stringify(lim));
if (!(lim.catwalk && lim.catwalk.y >= lim.catwalk.top - 0.05 && lim.catwalk.tall && lim.catwalk.under)) fail('liminal: catwalk climb / tall room / walk-under ' + JSON.stringify(lim.catwalk));
if (!(lim.loop && lim.loop.loops === 2 && lim.loop.count === 2)) fail('liminal: corridor loop ' + JSON.stringify(lim.loop));
});
S('windows', 'madness', async (page) => {   // windows sit only on the hull edge (open space behind the bulkhead, gen.js inHull), every deck gets some, and the space shader (nebula + escort ship) renders
const win = await page.evaluate(() => {
  const g = __game; g.setQuality('low'); const out = { decks: 0, withWin: 0, wins: 0, inner: [], render: false };
  for (let run = 0; run < 6; run++) { g.G.forceSeed = 6100 + run * 389; g.G.forceShip = (run * 3) % 10; g.newRun();
    for (let n = 1; n <= 3; n++) { g.loadDeck(n); const w = g.world, d = w.d, inH = d.inHull || (() => true); out.decks++;
      const ws = w.wallFaces.filter(f => f.win); out.wins += ws.length; if (ws.length) out.withWin++;
      for (const f of ws) { let ext = !inH(f.tx, f.ty); for (let k = 1; k <= 3 && !ext; k++) { const bx = f.tx - f.dx * k, by = f.ty - f.dy * k, c = d.grid[by]?.[bx]; if (c === undefined || !inH(bx, by)) ext = true; else if (c !== 1) break; } if (!ext && out.inner.length < 4) out.inner.push([g.G.forceShip, n, f.tx, f.ty, f.dx, f.dy]); } } }
  const w = g.world, f = w.wallFaces.find(f => f.win), P = g.P;
  if (f) { P.x = (f.tx + f.dx + 0.5) * 2.5 + f.dx * 0.2; P.z = (f.ty + f.dy + 0.5) * 2.5 + f.dy * 0.2; P.yaw = Math.atan2(f.dx, f.dy); P.pitch = 0; g.G.phase = 'play'; g.step(0.05, 300); g.renderOnce(); out.render = true; }
  return out;
});
console.log('windows:', JSON.stringify(win));
if (win.inner.length) fail('windows: window on an inner wall (ship, deck, tx, ty, dx, dy) ' + JSON.stringify(win.inner));
if (win.withWin < win.decks) fail(`windows: only ${win.withWin} / ${win.decks} decks have a window`);
if (!win.render) fail('windows: no window to render');
});
S('tube-bends2', 'madness', async (page) => {   // a two-bend (S / U) ladder-free Jiffy tube is crawled end to end: ducks, stays inside the chain, comes out of the far mouth
await installHelpers(page);
const tb = await page.evaluate(async () => {
  const g = __game, G = g.G, P = g.P; g.setQuality('low'); let bw = null, bt = null;
  for (let run = 0; run < 12 && !bt; run++) { G.forceSeed = 9000 + run * 131; G.forceShip = run % 10; g.newRun(); __T.hideEnemies(); for (let d = 1; d <= 9 && !bt; d++) { g.loadDeck(d); const t = g.world.d.tubes.find(t => (t.bends || []).length === 2 && t.ladder < 0); if (t) { bw = g.world; bt = t; } } }
  if (!bt) return { found: false };
  __T.hideEnemies(); for (const e of g.gorns) { e.dead = true; e.mesh.visible = false; } g.gorns.length = 0;
  const pts = [bt.a, ...bt.tiles, bt.b].map(([x, y]) => bw.center(x, y)), ok = new Set([bt.a, ...bt.tiles, bt.b].map(([x, y]) => x + ',' + y));
  P.x = pts[0][0]; P.z = pts[0][1]; P.y = 0; P.vx = P.vz = 0; G.phase = 'play'; dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  let k = 1, ducked = false, strayed = 0, secs = 0; const cornersHit = new Set();
  for (let i = 0; i < 60 * 50 && k < pts.length; i++) { const [tx, tz] = pts[k]; P.yaw = Math.atan2(P.x - tx, P.z - tz); G.phase = 'play'; P.clung = 0; g.step(1 / 60, 20 + i / 60); secs++;
    const [px, py] = bw.tile(P.x, P.z); if (bw.isTube(px, py)) { if (P.crouch) ducked = true; bt.bends.forEach(b => { if (px === bt.tiles[b][0] && py === bt.tiles[b][1] && P.crouch) cornersHit.add(b); }); } if (!ok.has(px + ',' + py)) strayed++; if (Math.hypot(P.x - tx, P.z - tz) < 0.45) k++; }
  dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  return { found: true, len: bt.tiles.length, bends: bt.bends, ducked, corners: cornersHit.size, strayed, secs: +(secs / 60).toFixed(1), reached: k >= pts.length };
});
console.log('tube bends (two):', JSON.stringify(tb));
if (!(tb.found && tb.reached && tb.ducked && tb.corners === 2 && tb.strayed === 0)) fail('two-bend tube crawl ' + JSON.stringify(tb));
});
S('tube-junction', 'madness', async (page) => {   // a T junction: crawl from the branch mouth through the junction and out of the parent tube's near mouth, staying inside the tube tiles
await installHelpers(page);
const tj = await page.evaluate(async () => {
  const g = __game, G = g.G, P = g.P; g.setQuality('low'); let bw = null, br = null, parent = null;
  for (let run = 0; run < 16 && !br; run++) { G.forceSeed = 12000 + run * 211; G.forceShip = run % 10; g.newRun(); __T.hideEnemies(); for (let d = 1; d <= 9 && !br; d++) { g.loadDeck(d); const w = g.world, b = w.d.tubes.find(t => t.branch); if (b) { const par = w.d.tubes.find(t => !t.branch && t.tiles.some(([x, y]) => x === b.a[0] && y === b.a[1])); if (par) { bw = w; br = b; parent = par; } } } }
  if (!br) return { found: false };
  __T.hideEnemies(); for (const e of g.gorns) { e.dead = true; e.mesh.visible = false; } g.gorns.length = 0;
  const ji = parent.tiles.findIndex(([x, y]) => x === br.a[0] && y === br.a[1]);
  const chain = [br.b, ...br.tiles.slice().reverse(), br.a, ...parent.tiles.slice(0, ji).reverse(), parent.a], pts = chain.map(([x, y]) => bw.center(x, y)), ok = new Set([...parent.tiles, ...br.tiles, parent.a, parent.b, br.b].map(([x, y]) => x + ',' + y));
  P.x = pts[0][0]; P.z = pts[0][1]; P.y = 0; P.vx = P.vz = 0; G.phase = 'play'; dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  let k = 1, ducked = false, strayed = 0, secs = 0;
  for (let i = 0; i < 60 * 50 && k < pts.length; i++) { const [tx, tz] = pts[k]; P.yaw = Math.atan2(P.x - tx, P.z - tz); G.phase = 'play'; P.clung = 0; g.step(1 / 60, 20 + i / 60); secs++;
    const [px, py] = bw.tile(P.x, P.z); if (bw.isTube(px, py) && P.crouch) ducked = true; if (!ok.has(px + ',' + py)) strayed++; if (Math.hypot(P.x - tx, P.z - tz) < 0.45) k++; }
  dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  return { found: true, branchLen: br.tiles.length, parentLen: parent.tiles.length, junction: ji, ducked, strayed, secs: +(secs / 60).toFixed(1), reached: k >= pts.length };
});
console.log('tube junction:', JSON.stringify(tj));
if (!(tj.found && tj.reached && tj.ducked && tj.strayed === 0)) fail('tube junction crawl ' + JSON.stringify(tj));
});
S('anims', 'madness', async (page) => {   // authored clips (js/proc-anims.js): shamble / vault / climb exist on every body and visibly move the bones away from the idle pose
const an = await page.evaluate(async () => {
  await __game.ready; const m = await import('/js/humans.js'), out = { kinds: {} }, ang = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.dot(b))));
  for (const kind of ['crew_m', 'crew_f', 'crew_f2', 'crew_heavy']) { const h = m.makeHuman({ kind, kit: false }); if (!h) { out.kinds[kind] = null; continue; } const H = h.userData.human, r = { has: ['shamble', 'vault', 'climb'].every(k => H.has(k)) };
    H.pose('idle', 0.3); H.mixer.update(0.001); const base = { th: H.bones.thigh_l.quaternion.clone(), sp: H.bones.spine_02.quaternion.clone(), ua: H.bones.upperarm_l.quaternion.clone() };
    for (const [k, at] of [['vault', 0.5], ['climb', 0.02], ['shamble', 0.4]]) { H.pose(k, at); H.mixer.update(0.001); r[k] = { thigh: +ang(base.th, H.bones.thigh_l.quaternion).toFixed(2), spine: +ang(base.sp, H.bones.spine_02.quaternion).toFixed(2), arm: +ang(base.ua, H.bones.upperarm_l.quaternion).toFixed(2) }; }
    out.kinds[kind] = r; }
  return out;
});
console.log('anims:', JSON.stringify(an));
for (const [kind, r] of Object.entries(an.kinds)) { if (!r || !r.has) fail('anims: ' + kind + ' lacks shamble / vault / climb'); else if (!(r.vault.thigh > 0.6 && r.vault.spine > 0.3 && r.climb.arm > 0.6 && r.shamble.spine > 0.1)) fail('anims: ' + kind + ' clips do not move the rig ' + JSON.stringify(r)); }
});
S('mechanics', 'madness', async (page) => {   // hiding (and Silent Running), thrown-tool distraction, sound captions, career bonuses, first-person hands
await installHelpers(page);
const mech = await page.evaluate(async () => {
  const g = __game, G = g.G, P = g.P, out = {}; g.setQuality('low'); try { localStorage.removeItem('fb_meta'); } catch (e) { /* private */ }
  g.newRun(); __T.hideEnemies(); G.phase = 'play'; const E = await import('/js/enemies.js');
  // a hunter placed in the open in sight of the player
  const h = g.makeEnemy('gronk', g.world, g.world.tile(P.x, P.z), 1, 0, g.scene, g.sound); g.gorns.push(h); h.active = true; h.state = E.S.PATROL;
  const spot = __T.standNear({ x: h.x, z: h.z, mesh: { rotation: { y: 0 } } }, 6); h.yaw = Math.atan2(P.x - h.x, P.z - h.z);
  if (spot) { out.sightFar = h.seesPlayer(P, 30);                       // unhidden at 6 m: seen
    g.enterHide({ tx: 0, ty: 0 }); out.hiddenFar = h.seesPlayer(P, 30); out.hideR = P.hideR;   // hidden at 6 m: not seen
    const dx = h.x - P.x, dz = h.z - P.z, d = Math.hypot(dx, dz); P.x += dx / d * (d - 1.2); P.z += dz / d * (d - 1.2); out.hiddenNear = h.seesPlayer(P, 30);   // hidden at 1.2 m: seen
    g.exitHide(); G.perks.ghost = 1; g.enterHide({ tx: 0, ty: 0 }); out.ghostR = P.hideR; g.exitHide(); G.perks.ghost = 0; }
  // distraction: a patrolling hunter within range goes to investigate the noise
  const s2 = __T.standNear(h, 8); h.state = E.S.PATROL; h.active = true; const n = G.distract(P.x, P.z, 24); out.distract = { n, state: h.state, investigate: h.state === E.S.INVESTIGATE };
  // captions
  g.CFG.caps = true; G.caption('test roar', P.x + 5, P.z); const capEl = document.getElementById('caps'); out.caption = capEl?.lastChild?.textContent || null; g.CFG.caps = false;
  // career bonuses: milestones grant starting perks on the next madness run
  g.SAVE.setMeta({ runs: 9, bestDeck: 5, kills: 20, wins: 1 }); g.newRun(); out.meta = { perks: Object.keys(G.perks).sort(), bonus: (G.metaBonus || []).length }; g.SAVE.setMeta({});
  // hands: shown for parkour verbs, hidden otherwise
  const A = await import('/js/actors.js'), hd = A.makeHands(); for (let i = 0; i < 30; i++) hd.pose('mantle', 0.8, 0.05, { time: i * 0.05 }); const shown = hd.group.visible; for (let i = 0; i < 60; i++) hd.pose('none', 0, 0.05); out.hands = { shown, hiddenAgain: !hd.group.visible };
  return out;
});
console.log('mechanics:', JSON.stringify(mech));
if (mech.sightFar !== undefined && !(mech.sightFar === true && mech.hiddenFar === false && mech.hiddenNear === true && mech.hideR === 1.8 && mech.ghostR === 1)) fail('mechanics: hiding ' + JSON.stringify(mech));
if (!(mech.distract?.n >= 1 && mech.distract.investigate)) fail('mechanics: distraction ' + JSON.stringify(mech.distract));
if (!/^\[test roar\]/.test(mech.caption || '')) fail('mechanics: caption ' + JSON.stringify(mech.caption));
if (!(mech.meta && ['boots', 'cell', 'hypo', 'legs'].every(p => mech.meta.perks.includes(p)) && mech.meta.bonus === 4)) fail('mechanics: career bonuses ' + JSON.stringify(mech.meta));
if (!(mech.hands?.shown && mech.hands.hiddenAgain)) fail('mechanics: hands ' + JSON.stringify(mech.hands));
});
S('breach', 'nominal', async (page) => {   // a hull breach pulls and hurts, and holding E at it seals it
await installHelpers(page);
const br = await page.evaluate(async () => {
  const g = __game, G = g.G, P = g.P; g.G.forceShip = 0; g.newRun(); g.setQuality('low'); document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); await new Promise(r => setTimeout(r, 300)); G.phase = 'play';
  G.comms.alerts.raise('hull_breach'); for (let i = 0; i < 5; i++) { G.phase = 'play'; g.step(0.05, i * 0.05); }
  const B = G.breach; if (!B) return { breach: null };
  const w = g.world; let spot = null; for (const [a, b] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) { const x = B.x + a, z = B.z + b; if (!w.solidAt(x, z) && w.los(x, z, B.x, B.z)) { spot = [x, z]; break; } }
  if (!spot) return { breach: true, spot: null };
  P.x = spot[0]; P.z = spot[1]; G.hp = G.maxHp = 1e6; const hp0 = G.hp, d0 = Math.hypot(B.x - P.x, B.z - P.z); for (let i = 0; i < 20; i++) { G.phase = 'play'; g.step(0.05, 1 + i * 0.05); } const hpLost = hp0 - G.hp, d1 = Math.hypot(B.x - P.x, B.z - P.z);
  dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); for (let i = 0; i < 220 && !B.sealed; i++) { G.phase = 'play'; G.hp = 1e6; g.step(0.05, 5 + i * 0.05); } dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
  return { breach: true, spot: true, pulled: +(d0 - d1).toFixed(2), hpLost: +hpLost.toFixed(1), sealed: !!B.sealed };
});
console.log('breach:', JSON.stringify(br));
if (!(br.breach && br.spot && br.pulled > 0.5 && br.hpLost > 1 && br.sealed)) fail('breach ' + JSON.stringify(br));
});
S('ladder-well', 'nominal', async (page) => {   // the service ladder in a dead-end corridor climbs to the next deck (and back up with Shift)
await installHelpers(page);
const lw = await page.evaluate(async () => {
  const g = __game, G = g.G, P = g.P; G.forceShip = 0; g.setQuality('low'); document.querySelectorAll('.screen').forEach(s => s.classList.remove('show'));
  for (let run = 0; run < 10; run++) { G.forceSeed = 600 + run * 53; g.newRun(); await new Promise(r => setTimeout(r, 120)); if (G.shipDecks[0]?.data?.ladderWell && G.shipDecks[1]?.data?.ladderWell) break; }   // a ship whose first two decks both have a ladder well
  G.phase = 'play'; const out = { start: G.shipDeck, well: !!g.world.d.ladderWell, kind: null };
  const w0 = g.world.d.ladderWell; if (!w0) return out; out.kind = g.world.d.props.find(p => p.tx === w0[0] && p.ty === w0[1])?.kind;
  const [wx, wy, dx, dy] = w0, [cx, cz] = g.world.center(wx + dx, wy + dy); P.x = cx; P.z = cz; P.yaw = Math.atan2(dx, dy); P.pitch = 0; G.phase = 'play';
  out.climbed = G.climbWell(1); for (let i = 0; i < 80; i++) g.step(0.05, 1 + i * 0.05);   // 'later' runs on the test clock
  out.down = G.shipDeck; out.phase = G.phase; const w1 = g.world.d.ladderWell; out.well1 = !!w1;
  if (w1) { const [tx, ty] = g.world.tile(P.x, P.z); out.atWell = Math.abs(tx - (w1[0] + w1[2])) + Math.abs(ty - (w1[1] + w1[3])) === 0; }
  out.up = G.climbWell(-1); for (let i = 0; i < 80; i++) g.step(0.05, 10 + i * 0.05); out.back = G.shipDeck;
  return out;
});
console.log('ladder well:', JSON.stringify(lw));
if (!(lw.well && lw.kind === 'ship_ladder' && lw.climbed && lw.down === lw.start + 1 && lw.phase === 'play' && lw.well1 && lw.atWell && lw.up && lw.back === lw.start)) fail('ladder well ' + JSON.stringify(lw));
});
S('search', 'madness', async (page) => {   // search a wall fixture: this run's deck, the player in front of a fixture with a clear stand point, crew moved off, no damaged system in reach
await installHelpers(page);
const srch = await page.evaluate(async () => {
  const g = __game, P = g.P, T = __T, out = { sites: 0, kinds: {}, searched: false, prompt: '', say: '' };
  g.newRun(); g.setQuality('low'); out.sites = g.world.searchSites?.length || 0;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); g.G.phase = 'play'; g.G.hp = g.G.maxHp = 1e6;
  T.hideEnemies(); T.quiet(); for (const r of g.repairPts) if (g.shipState.status(r.sys) !== 'nominal') g.shipState.repair(r.sys);   // a damaged system's [Hold E] Repair outranks Search by design (js/main.js prompt order)
  for (const s of g.world.searchSites) out.kinds[s.kind] = (out.kinds[s.kind] || 0) + 1;
  const stand = (s) => [s.x + s.nx * 0.9, s.z + s.nz * 0.9], site = g.world.searchSites.find(s => T.open(...stand(s), 0.25)) || g.world.searchSites[0]; if (site) {
    const [sx, sz] = stand(site); out.moved = T.clearSite(sx, sz, 3);   // nobody standing by (the prompt would offer a talk instead)
    P.x = sx; P.z = sz; P.yaw = Math.atan2(site.nx, site.nz); P.vx = P.vz = 0;   // stand in front, look at the wall
    g.step(1 / 60, 900); out.prompt = document.getElementById('prompt').textContent;
    const before = document.getElementById('msgs')?.textContent || '';
    for (const t of ['keydown', 'keyup']) document.dispatchEvent(new KeyboardEvent(t, { code: 'KeyE', key: 'e', bubbles: true }));
    out.searched = site.used; out.say = (document.getElementById('msgs')?.textContent || '').slice(-160) !== before.slice(-160) ? 'changed' : 'same';
  }
  return out;
});
console.log('search:', JSON.stringify(srch)); if (!(srch.sites > 0 && srch.searched && /Search/.test(srch.prompt))) fail('fixture search ' + JSON.stringify(srch));
});
S('inventory', 'madness', async (page) => {   // look-at examine text on a prop, clutter prompts (the room-type scan is the node section inventory-rooms)
await installHelpers(page);
const inv = await page.evaluate(async () => {
  const g = __game, P = g.P, T = __T, out = { clutter: 0, examine: '', examineKind: '', clutterPrompt: '' };
  for (let i = 0; i < 4; i++) { g.newRun(); g.setQuality('low'); out.clutter += g.world.clutter?.length || 0; }   // clutter count over 4 runs (not a retry: every run counts)
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); g.G.phase = 'play'; g.G.hp = g.G.maxHp = 1e6;   // the probes run on the last of those runs
  T.hideEnemies(); T.quiet(); for (const r of g.repairPts) if (g.shipState.status(r.sys) !== 'nominal') g.shipState.repair(r.sys);
  const w = g.world, K4 = ['crate', 'table', 'bunk', 'biobed'];   // look at a crate / table / bunk / biobed from its open side (any floor prop with examine text when the deck has none of them)
  const look = (x, z, yaw, pitch) => { P.x = x; P.z = z; P.y = 0; P.yaw = yaw; P.pitch = pitch; P.vx = P.vz = 0; g.step(1 / 60, 950); g.step(1 / 60, 950.02); return document.getElementById('prompt').textContent; };
  for (const pr of [...w.d.props.filter(p => K4.includes(p.kind)), ...w.d.props.filter(p => !K4.includes(p.kind))]) { const [cx, cz] = w.center(pr.tx, pr.ty), sd = T.openSideOf(cx, cz, 1.7, 1.3); if (!sd) continue;
    T.clearSite(sd.x, sd.z, 3.5); const t = look(sd.x, sd.z, sd.yaw, -0.6); if (t && !/Search|\[E\]|\[Hold E\]|— nominal|Tubelift/.test(t)) { out.examine = t; out.examineKind = pr.kind; break; } if ((out.tried ||= []).length < 6) out.tried.push(pr.kind + ': ' + t); }
  const cands = (w.clutter || []).filter(c => !(w.searchSites || []).some(s => Math.hypot(s.x - c.x, s.z - c.z) < 3) && Math.hypot(w.liftPos.x - c.x, w.liftPos.z - c.z) > 4);   // away from search fixtures and the lift (their prompts outrank it)
  for (const c of cands) { const sd = T.openSideOf(c.x, c.z, 0.9); if (!sd) continue; T.clearSite(sd.x, sd.z, 3.5); const t = look(sd.x, sd.z, sd.yaw, 0); if (t && !/\[E\]|nominal|Repair/.test(t)) { out.clutterPrompt = t; break; } }
  return out;
});
console.log('inventory in game:', JSON.stringify(inv)); if (!(inv.clutter > 20 && inv.examine && inv.clutterPrompt && !/\[E\]/.test(inv.clutterPrompt))) fail('inventory in game ' + JSON.stringify(inv));
});
S('props', 'madness', async (page) => {   // prop models: footprints, use points, tris, item art, shuttle cradle / bay door
const propsOk = await page.evaluate(async () => {
  if (!__game.world) { __game.newRun(); __game.setQuality('low'); }   // --only props on a fresh page
  const { PROP_KINDS, PROP_GALLERY, PROP_ART_FIXTURES, buildProp } = await import('./js/world.js'), { PROP_ART } = await import('./js/propart.js'), bad = []; let maxTris = 0, art = 0;
  const tris = (o) => { let n = 0; o.traverse(m => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return Math.round(n); };
  for (const k of PROP_GALLERY) { try { const g = buildProp(k); if (!g || !g.children.length) { bad.push(k); continue; }
    if (!PROP_ART[k]) continue; art++; const u = g.userData, n = tris(g); maxTris = Math.max(maxTris, n);
    if (n < 100 || n > 8000) bad.push(`${k}: ${n} tris`);   // galley props run 4,500-6,600 (stools, bottles, plate racks), the rest under 2,600
    if (u.top !== undefined && !(u.top > 0 && u.top < (k === 'catwalk' ? 2.7 : 2.5))) bad.push(`${k}: top ${u.top}`);
    if (PROP_KINDS.includes(k)) {   // floor props gen.js places: a footprint for collision, use points for crew, seat height on seated ones
      if (!(Array.isArray(u.box) && u.box.length === 4 && u.box[0] < u.box[1] && u.box[2] < u.box[3] && Math.max(-u.box[0], u.box[1], -u.box[2], u.box[3]) <= 1.25)) bad.push(`${k}: box ${JSON.stringify(u.box)}`);
      if (!(u.spots?.length || u.use)) bad.push(`${k}: no spots/use`);
      if (u.spots && !u.spots.every(sp => sp.length === 3 && sp.every(Number.isFinite))) bad.push(`${k}: spots`);
      if (g.getObjectByName('chair') && !(u.seat > 0.3)) bad.push(`${k}: seated station without a seat height`);
    } else if (!PROP_ART_FIXTURES.has(k) && !u.box && !u.seat && !u.size) bad.push(`${k}: no footprint`);
  } catch (e) { bad.push(k + ': ' + e.message); } }
  { const { makeJunction } = await import('./js/sysview.js'), j = makeJunction({ id: 'coolant', name: 'Coolant & Plumbing' }, 'JCT 01-01', 'Engineering', 0xc8a020); if (!j.lamp || !j.door || j.lamp.parent !== j.door || j.group.userData.insert !== 'manifold') bad.push('junction: lamp/door/insert'); }
  { const { buildItem, kindForName } = await import('./js/itemart.js'), { ITEMS } = await import('./js/equipment.js');   // batch items: built, in ITEMS, named by keyword
    for (const k of ['ladle', 'stockpot', 'fryingpan', 'stretcher', 'iv_bag', 'forceps', 'kidney_dish', 'bandage']) { const it = buildItem(k); if (!it || !ITEMS[k] || it.userData.tris > 1000) bad.push('item ' + k); }
    if (!ITEMS.stretcher.two) bad.push('stretcher not two-handed');
    for (const k of ['soil_meter', 'pruning_shears', 'harvest_tote', 'wheel_chocks', 'tiedown_strap', 'ratchet_strap', 'tag_scanner', 'coil_cartridge', 'patch_plate', 'pipe_clamp', 'seal_gauge', 'breather', 'cuffs', 'tether', 'headset', 'light_panel', 'injector_spare']) { const it = buildItem(k); if (!it || !ITEMS[k] || it.userData.tris > 1000) bad.push('item ' + k); }   // batches 5-11
    for (const k of ['coverall', 'scrubs', 'apron_fold', 'skullcap', 'gloves_nitrile', 'suit_bag', 'half_mask', 'stool', 'lamp', 'meter', 'snips', 'tape', 'frame']) if (!buildItem(k)) bad.push('item ' + k);   // clutter-only kinds (wear batch folded forms, batch 11 small things)
    for (const [nm, k] of [['pH and EC meter, handheld', 'soil_meter'], ['Wheel chocks', 'wheel_chocks'], ['restraints, flexible cuffs', 'cuffs'], ['radio headset', 'headset'], ['trauma shears', 'snips'], ['Handheld multimeter', 'meter'], ['Nitrile gloves box', 'gloves_nitrile'], ['spare coil module', 'coil_cartridge']]) if (kindForName(nm) !== k) bad.push(`kindForName ${nm} -> ${kindForName(nm)}`);
    for (const [nm, k] of [['soup ladle', 'ladle'], ['stock pot, 40 L', 'stockpot'], ['frying pan', 'fryingpan'], ['saline bag', 'iv_bag'], ['gauze dressing roll', 'bandage'], ['folding stretcher', 'stretcher']]) if (kindForName(nm) !== k) bad.push(`kindForName ${nm} -> ${kindForName(nm)}`); }
  { const { World } = await import('./js/world.js'), { generate } = await import('./js/gen.js');   // batches 5-11 add-ons: the shuttle on its cradle, the core's detail, the bay door and systems board on the walls
    let sh = 0, cradle = 0, bay = 0, bays = 0;
    for (let s = 1, built = 0; s < 80 && bays < 2 && built < 3; s++) { const d = generate(4, s * 131 + 7); if (!d.rooms.some(r => r.type === 'shuttlebay')) continue; built++;   // a few worlds only (each one is a full deck)
      const w = new World(d, __game.world.ship); w.group.traverse(o => { if (o.userData?.name === 'shuttle_cradle') cradle++; if (o.userData?.name === 'bay_door') bay++; });
      sh += d.props.filter(p => p.kind === 'shuttle').length; bays += d.rooms.filter(r => r.type === 'shuttlebay').length; w.dispose?.(); }
    if (cradle < sh) bad.push(`shuttles on cradles ${cradle}/${sh}`); if (bays && !bay) bad.push('no bay door in ' + bays + ' shuttlebays'); }
  return { n: PROP_KINDS.length, gallery: PROP_GALLERY.length, art, maxTris, bad };
});
console.log('props:', JSON.stringify(propsOk)); if (propsOk.bad.length || propsOk.n < 56 || propsOk.art < 34) fail('prop models');
});
S('combat-madness', 'madness', (page) => combatMadness(page, fail));   // madness mode: no hand-to-hand, the zapper still fires (tools/test-combat.mjs)
// ---- Systems Nominal (default mode) ----
S('nominal', 'nominal', async (page2) => {   // calm start, lift doors, rides down / up / one deck, locked lift, billet / duty / phases / death, NPC walk, tubes, dodge, evacuation, equipment, handhelds, doors, terminal
await installHelpers(page2);
const nom = await page2.evaluate(async () => {
  const g = __game, P = g.P, out = { log: [] }; g.G.forceShip = 0; g.newRun(); g.setQuality('low'); document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); g.G.hp = g.G.maxHp = 1e6;
  const key = (code) => { for (const t of ['keydown', 'keyup']) document.dispatchEvent(new KeyboardEvent(t, { code, key: code, bubbles: true })); };
  let t = 0; const tick = (n) => { for (let i = 0; i < n; i++) { t += 1 / 30; g.step(1 / 30, t); } };
  const G = g.G, D = G.ship.decks;
  out.start = { mode: G.mode, deck: G.deck, shipDeck: G.shipDeck, inCar: g.inCarTile(), decks: G.shipDecks.length, D, director: g.director, auto: g.shipState.auto, objective: getComputedStyle(document.getElementById('objective')).display };
  tick(900);   // 30 s: nothing hostile, no madness, no faults
  out.calm = { gorns: g.gorns.length, mad: G.mad, faults: g.shipState.faulted().length, hostileEnts: g.ents.filter(e => e.fake || e.kind === 'body').length, simBodies: g.ents.filter(e => e.simmed && !e.board && !e.walk?.vanish).length, simHere: g.sim.bodies(G.shipDeck + 1).size };   // bodies on their way into the lift have already left in the sim
  if (out.calm.simBodies > out.calm.simHere || (out.calm.simHere && !out.calm.simBodies)) out.simBad = out.calm;
  // walk out and back in: doors open as you approach, the panel opens when you step into the car
  const w = g.world, c = w.car; const far = (k) => { P.x = c.x + c.dx * k; P.z = c.z + c.dy * k; P.vx = P.vz = 0; };
  const loud = __T.quiet(); __T.clearSite(c.x, c.z, 9);   // nobody walks up to the car while the doors are under test (crew walking up / in the doorway keep them open by design)
  far(5.0); tick(5); const nearOpen = w.liftOpen; far(9); let held = 0; for (; held < 6 * 30 && w.liftOpen; held++) { far(9); tick(1); }   /* budget 6 s: npcT 1 s + the 1.6 s shut timer + up to 4 s for boarders already in the car (carStep) */ out.doors = { nearOpen, farShut: !w.liftOpen, heldSecs: +(held / 30).toFixed(1) }; loud();
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
    const l = D.loops[0]; D.setPlace(G.shipDeck + 1, l.room); l.state = 'due'; l.dueAt = D.t; const r = D.perform(l.id, 'proper'); tick(1); out.duty = { ok: r.ok, busy: !!D.busy }; { D.cancel(); const l2 = D.loops[1] || D.loops[0]; l2.spot = 'door'; l2.state = 'due'; l2.dueAt = D.t; D.setPlace(G.shipDeck + 1, l2.room); G.phase = 'play'; const before = l2.state, sx = P.x, sz = P.z; P.x = -40; P.z = -40; g.interact(); P.x = sx; P.z = sz; const jg = g.jobgame, jgOpen = !!jg?.active; if (jgOpen) { jg.key('Enter'); for (let i = 0; i < 2000 && jg.game?.state === 'play'; i++) { for (const [c, d] of jg.game.hint()) jg.key(c, d); jg.tick(1 / 30); } jg.tick(1); }   /* E at the door panel opens its wiring mini-game (js/jobgame-ui.js): play it through */ out.duty.quick = { before, after: l2.state, busy: !!D.busy && D.busy.loop === l2, game: jgOpen }; D.cancel(); }
    for (let i = 0; i < 40; i++) { D.tick(1); } out.duty.board = D.board().length;
    ph.enabled = true; for (let i = 0; i < 30; i++) ph.tick(30); out.phases = ph.status(); const hz = ph.hazard(G.shipDeck + 1, { zone: 'engineering' }); out.phases.hazard = !!hz || ph.modeDef?.lethal === null;
    g.nomDie('test'); out.dead = { phase: G.phase, btns: document.querySelectorAll('#bd-end button').length, shown: document.getElementById('bd-end').classList.contains('show') };
    document.querySelector('#bd-end button').click(); tick(5); out.cont = { phase: G.phase, changed: G.player !== old, newIsPlayer: G.player.isPlayer, oldDead: old.status, hp: G.hp, same: G.duty.debt === D.debt };
    { // NPC walking: a visible crew member walks a real path to another tile
      G.phase = 'play'; const w = g.world, e = g.ents.find(x => x.simmed); out.walk = { have: !!e };
      if (e) { const tiles = w.d.openTiles.filter(([x, y]) => w.d.grid[y][x] === 0 && !w.isTube(x, y)), here = w.tile(e.x, e.z), f0 = w.field(here[0], here[1], true);
        const far = tiles.filter(([x, y]) => f0[x + y * w.W] > 8 && f0[x + y * w.W] < 30)[0]; out.walk.far = !!far;
        if (far) { const f = g.pathField(far[0], far[1]), d0 = f[here[0] + here[1] * w.W]; P.x = e.x + 3; P.z = e.z; g.startWalk(e, far[0], far[1], false); tick(240); const now = w.tile(e.x, e.z), d1 = f[now[0] + now[1] * w.W]; out.walk.d0 = d0; out.walk.d1 = d1; out.walk.closer = d1 < d0 || !e.walk; out.walk.inside = w.d.grid[now[1]][now[0]] === 0; const tw = e.walk; for (let i = 0; i < 900 && e.walk === tw && tw; i++) tick(1); const fin = w.tile(e.x, e.z);   /* until this walk ends: afterwards the sim may walk the body back to its spot */ out.walk.gait = g.describeGait(g.gaitFor(e) && e.gaitBase); out.walk.fid = e.fid?.hist.length || 0; out.walk.add = !!e.mesh.userData.human.add; out.walk.arrived = e.walk !== tw && fin[0] === far[0] && fin[1] === far[1]; } }
    }
    { // running, dodging, crawling through tubes and climbing ladders, evacuation
      G.phase = 'play'; const di = G.shipDecks.findIndex((d, i) => d.data.tubes.some(tb => tb.tiles.length >= 3 && tb.ladder > 0) && g.sim.onDeck(i + 1).length > 1); if (di >= 0 && di !== G.shipDeck) { g.loadDeck(di + 1); tick(5); G.phase = 'play'; } g.simBodies(0, true);
      const w = g.world, es = g.ents.filter(x => x.simmed), r = { have: es.length, deck: G.shipDeck };
      const tube = w.d.tubes.find(t => t.tiles.length >= 3 && t.ladder > 0) || w.d.tubes[0]; r.tubes = w.d.tubes.length;
      if (tube && es[0]) { const e = es[0], a = tube.tiles[0], b = tube.tiles[tube.tiles.length - 1], [ax, az] = w.center(a[0], a[1]); e.walk = null; e.x = ax; e.z = az; e.mesh.position.set(ax, 0, az); P.x = ax + 25; P.z = az;
        g.startWalk(e, b[0], b[1], false, { tubes: true, run: false }); const clips = new Set(); let maxY = 0, n = 0; for (; n < 2400 && e.walk; n++) { tick(1); clips.add(e.clip); maxY = Math.max(maxY, e.y || 0); } r.tube = { len: tube.tiles.length, ladder: tube.ladder, secs: +(n / 30).toFixed(1), clips: [...clips], maxY: +maxY.toFixed(2), done: !e.walk, dbg: e.walk ? { inEnts: g.ents.includes(e), wsN: e.wsN, parent: !!e.mesh.parent, vis: e.mesh.visible, haul: !!e.haul, op: !!e.op, x: +e.x.toFixed(2), z: +e.z.toFixed(2), v: +(e.v || 0).toFixed(2), stuck: +(e.walk.stuck || 0).toFixed(1), pauseT: e.pauseT || 0, ghost: e.ghost || 0, heading: e.heading, tile: w.tile(e.x, e.z), tgt: [b[0], b[1]], fieldHere: g.pathField(b[0], b[1], true)[w.tile(e.x, e.z)[0] + w.tile(e.x, e.z)[1] * w.W], tubeAxis: w.d.tubeAxis[w.tile(e.x, e.z)[0] + w.tile(e.x, e.z)[1] * w.W] } : null }; }
      const cands2 = es.filter((x, i) => i > 0 && !x.haul && !x.op?.cart); let e2 = null; const ok2 = [];   /* a body that can dodge where it stands (not boxed in by a wall): probe each without moving it, then run the real check on the first that starts a walk */
      for (const c of cands2) { c.walk = null; c.dodgeCool = 0; const sv = [P.x, P.z, P.vx, P.vz]; P.x = c.x - 1.8; P.z = c.z; P.vx = 5.4; P.vz = 0; P.sprint = true; g.dodgeCheck(c, 0.016, 1.8); P.sprint = false; const started = !!c.walk; c.walk = null; c.dodgeCool = 0; [P.x, P.z, P.vx, P.vz] = sv; if (started) { ok2.push(c); if (ok2.length >= 3) break; } }
      /* the sim can send the chosen body's person off the deck mid-check (a lift walk, 26 m away: not a dodge result): then the check runs again on the next body that can dodge */
      for (const ec of ok2.length ? ok2 : cands2.slice(0, 1)) { e2 = ec; let left = false; G.simT = 1e9; if (g.haul) g.haul.t = 1e9; e2.walk = null; e2.dodgeCool = 0;   /* no cart job either: one starting on this body mid-check walks it off (js/haul.js, every 16-38 s) */   /* hold the schedule still: a body whose walk the test nulls (or whose block changes meanwhile) otherwise walks on to its sim spot, up to 40 m away (docs/pathing.md iteration 4) */ const [tx, ty] = w.tile(e2.x, e2.z), p0 = [e2.x, e2.z]; P.x = e2.x - 1.8; P.z = e2.z; P.vx = 5.4; P.vz = 0; P.sprint = true; g.dodgeCheck(e2, 0.016, 1.8); P.sprint = false; r.dodge = { started: !!e2.walk, run: !!e2.run }; { const e3 = es.find((x, i) => i > 0 && x !== e2); if (e3) { e3.walk = null; e3.dodgeCool = 0; P.x = e3.x - 1.8; P.z = e3.z; P.vx = 3.3; P.vz = 0; P.sprint = false; g.dodgeCheck(e3, 0.016, 1.8); r.walkNoScatter = !e3.walk; P.vx = 0; } } P.vx = 0; P.x += 30;
        const gone = () => { left = left || e2.simKey === 'lift' || e2.walk?.opts?.sim === 'lift'; };
        for (let i = 0; i < 400 && e2.walk; i++) { tick(1); gone(); } r.dodge.moved = +Math.hypot(e2.x - p0[0], e2.z - p0[1]).toFixed(2); for (let i = 0; i < 900 && (e2.walk || e2.retT > 0 || e2.returnTo); i++) { tick(1); gone(); } r.dodge.back = +Math.hypot(e2.x - p0[0], e2.z - p0[1]).toFixed(2); G.simT = 0; r.dodge.leftDeck = (r.dodge.leftDeck || 0) + (left ? 1 : 0); if (!left) break; }
      const ph = g.phases; ph.enabled = false; ph.index = 4; g.G.evacT = 0; g.evacuationStep(2); r.evac = g.sim.over.size; for (const p of g.roster.people) g.sim.release(p); ph.index = 0;
      out.move2 = r;
    }
    { // equipment motions, held items, carts, player carry (js/equipment.js, js/carry.js, js/haul.js)
      G.phase = 'play'; g.simBodies(0, true); if (g.ents.filter(x => x.simmed).length < 4) { const dn = G.shipDecks.findIndex((d, i) => g.sim.onDeck(i + 1).length >= 5); if (dn >= 0) { g.loadDeck(dn + 1); tick(5); G.phase = 'play'; g.simBodies(0, true); } }   // a deck with people on it
      G.simT = 1e9; if (g.haul) g.haul.t = 1e9;   // hold the schedule still while we watch one body (restored below)
      const simTick0 = g.sim?.tick; if (g.sim) g.sim.tick = () => { };   /* the crew schedule's lift departures (simDepart) otherwise send the watched body off mid-check; restored at out.equip */
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
        G.phase = 'play'; /* a pointer-lock loss during the long NPC checks above pauses the game (main.js lock error); pushing needs 'play' */ const c = HL.addCart('cargo', x0 + 1.6, z0, Math.PI / 2, false); P.x = x0 + 0.1; P.z = z0; P.y = 0; P.vx = P.vz = 0; P.yaw = -Math.PI / 2; P.mode = 'walk'; G.carry = null; const pr0 = HL.prompt();
        const grab = HL.interact(), d0 = c.x; dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' })); let vmax = 0; for (let i = 0; i < 45; i++) { tick(1); vmax = Math.max(vmax, Math.hypot(P.vx, P.vz)); } dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' })); tick(3);
        q.push = { prompt: /Push/.test(pr0), grab, pushing: !!P.pushing, moved: +(c.x - d0).toFixed(2), ahead: +(c.x - P.x).toFixed(2), vmax: +vmax.toFixed(2), mul: P.carryMul };
        G.carry = { name: 'Field toolbox', real: '', item: 'toolbox' }; tick(1); q.carry = { vm: !!HL.vm, bonus: g.haul && G.carry.item === 'toolbox' }; const n0 = c.mesh.userData.load.length; HL.putDown(); q.carry.loaded = c.mesh.userData.load.length === n0 + 1 && !G.carry; HL.takeFromCart(); q.carry.unloaded = G.carry?.item === 'toolbox';
        HL.interact(); q.push.released = !P.cart && !P.pushing && c.pusher === null; tick(1); q.push.mulAfter = P.carryMul;
        G.carry = { name: 'Supply crate', real: '', item: 'crate' }; tick(1); q.carry.slow = P.carryMul; P.yaw = Math.PI / 2; HL.putDown(); q.carry.dropped = HL.dropped.length === 1 && !G.carry; HL.interact(); q.carry.picked = G.carry?.item === 'crate' && !HL.dropped.length; G.carry = null; tick(1); } }
      out.equip = q; G.simT = 0; if (g.sim && simTick0) g.sim.tick = simTick0;
    }
    { // handhelds: NPC kit on the body / in the hand, tricorder speeds a repair, improvised weapon stuns and breaks a foldable (js/handhelds.js, js/kit.js)
      G.phase = 'play'; g.simBodies(0, true); if (g.ents.filter(x => x.simmed && !x.walk && !x.cower).length < 3) { const dn = G.shipDecks.findIndex((d, i) => g.sim.onDeck(i + 1).length >= 5); if (dn >= 0) { g.loadDeck(dn + 1); tick(5); G.phase = 'play'; g.simBodies(0, true); } }   /* the evacuation probe above can empty this deck: go where people are (as the equipment block does) */
      const simTick1 = g.sim?.tick; if (g.sim) g.sim.tick = () => { };   /* as in the equipment block: no lift departures mid-check; restored at out.hh */ G.simT = 1e9; if (g.haul) g.haul.t = 1e9;   /* hold the schedule and the cart jobs: a haul job taking the picked body ends its op mid-check */ const HHm = await import('./js/handhelds.js'), K = g.kit, q = { kit: !!K }, hum = (x) => x?.mesh?.userData.human;
      const SEATED = new Set(['bar', 'table', 'sofa', 'bunk']), /* a body on a seat / bunk drops its op on the first tick (js/main.js SIT_SPOTS) */ belt = (x) => HHm.loadoutFor(x.person).some(i => ['belt', 'back'].includes(HHm.HANDHELDS[i].holster)); const pick = () => g.ents.find(x => x.simmed && hum(x) && !x.walk && !x.haul && !x.cower && !SEATED.has(x.spot) && belt(x)); let e = pick();
        for (let dn = 1; !e && dn <= G.shipDecks.length; dn++) { if (dn === G.deck || g.sim.onDeck(dn).length < 3) continue; g.loadDeck(dn); tick(5); G.phase = 'play'; g.simBodies(0, true); e = pick(); }   /* a body that actually carries a belt kit: this deck may have none (the generator changed), so look on other decks */
        e = e || g.ents.find(x => x.simmed && hum(x) && !x.walk && !x.haul && !x.cower && !SEATED.has(x.spot)); if (e) { g.opEnd(e); e.kitWorn = null; g.opStart(e); const worn = Object.values(e.kitWorn || {}); q.worn = { n: worn.length, bone: worn[0]?.holder.parent?.name || null };
        const ok = (await import('./js/equipment.js')), op = new ok.Operator('post', e.person, 3, { toolSteps: HHm.toolScript('tricorder_sec'), toolP: 1 }); e.op = op; e.opHeld = { hand_r: null, hand_l: null }; e.opGoal = e.opGoal || { x: e.mesh.position.x, z: e.mesh.position.z, yaw: e.mesh.rotation.y, y: 0 }; let held = null; for (let i = 0; i < 30 * 40 && !held; i++) { P.x = e.x + 2.5; P.z = e.z; tick(1); if (!e.op) { break; } held = hum(e).held?.hand_r?.userData.id === 'tricorder_sec' ? hum(e).held.hand_r.parent?.name : null; } q.inHand = held; g.opEnd(e); }
      if (K) { const rp = g.repairPts.find(r => r.sys) || g.repairPts[0]; K.hand = -1; G.carry = null; const t0 = rp ? g.repairTime(rp) : 0; if (!K.equip('tricorder_eng')) { K.add(HHm.newInstance('tricorder_eng', 5)); } const t1 = rp ? g.repairTime(rp) : 0; q.repair = { t0: +t0.toFixed(2), t1: +t1.toFixed(2), faster: t1 < t0 * 0.8 }; const r = K.useJob(); q.repair.scan = !!r?.ok;
        const v = g.ents.find(x => x.simmed && hum(x) && !x.cower && x !== e); if (v) { if (v.op) g.opEnd(v); v.walk = null; K.add(HHm.newInstance('tricorder_sci', 9)); const inst = K.inst, W = g.world; { const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => { const [tx, ty] = W.tile(v.x + a, v.z + b); return !W.solid(tx, ty) && !W.isTube(tx, ty) && W.los(v.x + a, v.z + b, v.x, v.z); }), [a, b] = sides[0] || [1, 0]; P.x = v.x + a; P.z = v.z + b; P.yaw = Math.atan2(a, b); }   /* 1 m off an open side of the victim, facing them (a wall at +x left the swings hitting nothing) */ let hits = 0; const stuns = [];
          while (!HHm.isBroken(inst) && hits < 12) { K.cd = 0; K.attack(); hits++; stuns.push(v.stunT || 0); tick(1); } q.weapon = { hits, stunned: stuns.some(s => s > 0), cower: !!v.cower, broken: HHm.isBroken(inst), jobAfter: !!K.useJob()?.ok, last: K.last?.target || null };
          for (let i = 0; i < 30 * 25; i++) tick(1); q.weapon.recovered = !v.cower; } K.hand = -1; }
      out.hh = q; G.simT = 0; if (g.sim && simTick1) g.sim.tick = simTick1;
    }
    { // sliding doors, clutter pick-up, terminal and talk menus
      const w = g.world, dr = w.doors?.[0]; out.doors2 = { n: w.doors?.length || 0 };
      if (dr) { w.setDoorLock(false);   // the phases ticked above can black the deck out (a power fault seals the doors, js/main.js step): start from powered doors, the seal is tested below
        w.slideDoors(0.5, dr.f.x, dr.f.z); w.slideDoors(0.5, dr.f.x, dr.f.z); out.doors2.open = dr.open > 0.5; w.slideDoors(0.5, dr.f.x + 40, dr.f.z); w.slideDoors(0.5, dr.f.x + 40, dr.f.z); w.slideDoors(0.5, dr.f.x + 40, dr.f.z); out.doors2.shut = dr.open < 0.2;  w.setDoorLock(true); for (let i = 0; i < 6; i++) w.slideDoors(0.5, dr.f.x, dr.f.z); out.doors2.sealed = dr.open < 0.2; const q = { x: dr.f.x + (dr.f.ax ? 0.3 : 0), z: dr.f.z + (dr.f.ax ? 0 : 0.3), y: 0 }; w.resolve(q, 0.3); out.doors2.blocked = dr.f.ax ? q.x > dr.f.x + 0.3 : q.z > dr.f.z + 0.3; let pr = 0; for (let i = 0; i < 14; i++) pr = Math.max(pr, w.pryDoor(dr.f.x, dr.f.z, 0.25)); for (let i = 0; i < 6; i++) w.slideDoors(0.5, dr.f.x, dr.f.z); out.doors2.pried = pr >= 1 && dr.open > 0.5; w.setDoorLock(false);
        { // red-alert lockdown ('alert'): seals like a blackout, a walker keys through in ~1 s (no 10 s forced-open window), it reseals behind them, the player pries it; sounds by material
          dr.pried = 0; for (let i = 0; i < 6; i++) w.slideDoors(0.5, dr.f.x, dr.f.z); const heard = []; const cb = (dd, o, k) => { if (o === dr) heard.push(k); };
          w.setDoorLock('alert'); for (let i = 0; i < 6; i++) w.slideDoors(0.5, dr.f.x + 8, dr.f.z, [], cb); const sealed = dr.open < 0.2, seal = heard.includes('seal');
          const crew = [{ x: dr.f.x + (dr.f.ax ? 1.2 : 0), z: dr.f.z + (dr.f.ax ? 0 : 1.2), w: true }]; let tk = 0; for (; tk < 40 && dr.open < 0.5; tk++) w.slideDoors(0.1, dr.f.x + 8, dr.f.z, crew, cb);
          const keyedOpen = dr.open > 0.5, keySecs = +(tk * 0.1).toFixed(1); for (let i = 0; i < 40; i++) w.slideDoors(0.1, dr.f.x + 8, dr.f.z, [], cb); const resealed = dr.open < 0.2 && !(dr.pried > 0);
          let pr2 = 0; for (let i = 0; i < 14; i++) pr2 = Math.max(pr2, w.pryDoor(dr.f.x, dr.f.z, 0.25)); for (let i = 0; i < 6; i++) w.slideDoors(0.5, dr.f.x, dr.f.z);
          out.doors2.lockdown = { sealed, seal, keyedOpen, keySecs, resealed, key: heard.includes('key'), pried: pr2 >= 1 && dr.open > 0.5, mat: dr.mat, mats: [...new Set(w.doors.map(o => o.mat))] }; w.setDoorLock(false); } }
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
{ const n = nom, D = n.start.D, checks = [
    ["n.start.mode === 'nominal'", () => n.start.mode === 'nominal'],
    ["n.start.deck === 1", () => n.start.deck === 1],
    ["n.start.shipDeck === 0", () => n.start.shipDeck === 0],
    ["n.start.inCar", () => n.start.inCar],
    ["n.start.decks === D", () => n.start.decks === D],
    ["n.start.director === null", () => n.start.director === null],
    ["n.start.auto === false", () => n.start.auto === false],
    ["n.start.objective === 'none'", () => n.start.objective === 'none'],
    ["!n.simBad", () => !n.simBad],
    ["n.billet.isPlayer", () => n.billet.isPlayer],
    ["n.billet.loops > 0", () => n.billet.loops > 0],
    ["n.billet.hud", () => n.billet.hud],
    ["n.duty.ok", () => n.duty.ok],
    ["n.duty.quick.after === 'doing'", () => n.duty.quick.after === 'doing'],
    ["n.duty.quick.game (E at a station opens its job mini-game)", () => n.duty.quick.game],
    ["n.phases.index >= 3", () => n.phases.index >= 3],
    ["n.phases.mode", () => n.phases.mode],
    ["n.dead.shown", () => n.dead.shown],
    ["n.dead.btns >= 2", () => n.dead.btns >= 2],
    ["n.cont.phase === 'play'", () => n.cont.phase === 'play'],
    ["n.cont.changed", () => n.cont.changed],
    ["n.cont.newIsPlayer", () => n.cont.newIsPlayer],
    ["n.cont.oldDead === 'dead'", () => n.cont.oldDead === 'dead'],
    ["n.cont.hp > 0", () => n.cont.hp > 0],
    ["n.cont.same", () => n.cont.same],
    ["(!n.walk.far || (n.walk.add && n.walk.closer && n.walk.insid", () => (!n.walk.far || (n.walk.add && n.walk.closer && n.walk.inside && n.walk.arrived))],
    ["n.move2.have > 1", () => n.move2.have > 1],
    ["(n.move2.tubes > 0 && n.move2.tube && (n.move2.tube.done && ", () => (n.move2.tubes > 0 && n.move2.tube && (n.move2.tube.done && n.move2.tube.clips.includes('crouch_fwd')))],
    ["n.move2.dodge.started", () => n.move2.dodge.started],
    ["n.move2.walkNoScatter !== false", () => n.move2.walkNoScatter !== false],
    ["n.move2.dodge.run", () => n.move2.dodge.run],
    ["n.move2.dodge.moved > 0.6", () => n.move2.dodge.moved > 0.6],
    ["n.move2.dodge.back < 1.3", () => n.move2.dodge.back < 1.3],
    ["n.move2.evac > 3", () => n.move2.evac > 3],
    ["n.doors2.n > 0", () => n.doors2.n > 0],
    ["n.doors2.open", () => n.doors2.open],
    ["n.doors2.shut", () => n.doors2.shut],
    ["n.doors2.sealed", () => n.doors2.sealed],
    ["n.doors2.blocked", () => n.doors2.blocked],
    ["n.doors2.pried", () => n.doors2.pried],
    ["n.doors2.lockdown (red alert: seals, crew key through in ~1 s and it reseals, player pries)", () => { const L = n.doors2.lockdown; return !!L && L.sealed && L.keyedOpen && L.keySecs <= 1.6 && L.resealed && L.key && L.pried && ['std', 'heavy', 'light'].includes(L.mat); }],
    ["n.clutter.took", () => n.clutter.took],
    ["n.clutter.left", () => n.clutter.left],
    ["n.term.open", () => n.term.open],
    ["n.term.rows >= 4", () => n.term.rows >= 4],
    ["(!n.talk || (n.talk.open && n.talk.rows >= 4))", () => (!n.talk || (n.talk.open && n.talk.rows >= 4))],
    ["n.calm.gorns === 0", () => n.calm.gorns === 0],
    ["n.calm.mad === null", () => n.calm.mad === null],
    ["n.calm.faults === 0", () => n.calm.faults === 0],
    ["n.calm.hostileEnts === 0", () => n.calm.hostileEnts === 0],
    ["n.doors.nearOpen", () => n.doors.nearOpen],
    ["n.doors.farShut", () => n.doors.farShut],
    ["n.walkIn.phase === 'select'", () => n.walkIn.phase === 'select'],
    ["n.walkIn.rows.length === D", () => n.walkIn.rows.length === D],
    ["/^1Deck 1 \u2014 Command \u00b7 Bridge/.test(n.walkIn.rows[0])", () => /^1Deck 1 — Command · Bridge/.test(n.walkIn.rows[0])],
    ["n.cancel === 'play'", () => n.cancel === 'play'],
    ["n.down.to === D - 1", () => n.down.to === D - 1],
    ["n.down.secs >= 7.5", () => n.down.secs >= 7.5],
    ["n.down.secs <= 9", () => n.down.secs <= 9],
    ["n.down.inCar", () => n.down.inCar],
    ["n.down.indicator >= D - 1", () => n.down.indicator >= D - 1],
    ["n.down.shaken", () => n.down.shaken],
    ["n.up.to === 0", () => n.up.to === 0],
    ["n.up.secs >= 7.5", () => n.up.secs >= 7.5],
    ["n.up.inCar", () => n.up.inCar],
    ["n.persist !== false", () => n.persist !== false],
    ["n.hop.to === 1", () => n.hop.to === 1],
    ["n.hop.secs >= 2.8", () => n.hop.secs >= 2.8],
    ["n.hop.secs <= 4", () => n.hop.secs <= 4],
    ["n.locked.fx", () => n.locked.fx],
    ["n.locked.panel === 'play'", () => n.locked.panel === 'play'],
    ["n.unlocked === 'select'", () => n.unlocked === 'select']];
  const bad = checks.filter(([, f]) => { try { return !f(); } catch { return true; } }).map(([k]) => k);   // name the failing conditions
  if (bad.length) fail('nominal ship / turbolift: ' + bad.join(' | ')); }
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
});
S('voices-speech', 'nominal', async (page2) => {   // speaking in headless: every mode works without throwing and leaves a subtitle (the voice / tag checks are the node section voices)
const o = await page2.evaluate(async () => {
  const V = await import('./js/voice.js'), SP = await import('./js/speech.js'), { SHIPS } = await import('./js/ships.js'), { makeComplement } = await import('./js/crew.js');
  const R = makeComplement(SHIPS[2], 3), sp = [], p0 = R.people[0]; for (const m of ['babble', 'synth', 'subs']) { SP.setMode(m); try { const r = SP.speak(p0, V.liftLine(p0, { deckNo: 4, zone: 'Habitat', rooms: ['Sickbay'] })); sp.push([m, r.mode, r.dur > 0]); SP.cue(p0, 'hum'); } catch (e) { sp.push([m, 'THREW ' + e.message]); } }
  try { SP.speak(null, 'Neutral voice test.'); SP.speak(p0, ''); } catch (e) { sp.push(['null', 'THREW']); } SP.setMode('babble');
  const subs = document.getElementById('subs')?.children.length || 0, desc = V.describeVoice(p0);
  return { sp, subs, desc };
});
console.log('voices speech:', JSON.stringify(o)); if (!(o.sp.every(x => x[1] !== undefined && !/THREW/.test(x[1])) && o.sp.length === 3 && o.subs > 0 && o.desc.length > 10)) fail('crew voices: ' + JSON.stringify({ sp: o.sp, subs: o.subs }));
});
S('lift-riders', 'nominal', async (page2) => {   // NPC riders: chance, board, speak, leave at their stop
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
});
S('voices-html', 'voices', async (vpage) => {   // voices.html: the roster table, chips, say, department filter
const vp = await vpage.evaluate(async () => { const rows = document.querySelectorAll('#rows tr').length, chips = document.querySelectorAll('.chip').length; document.querySelector('[data-say]').click(); await new Promise(r => setTimeout(r, 200)); const said = document.querySelector('.said').textContent; document.querySelector('#dept').value = 'engineering'; document.querySelector('#dept').dispatchEvent(new Event('input')); const eng = document.querySelectorAll('#rows tr').length; return { rows, chips, said, eng, total: window.__voices.roster.people.length }; });
console.log('voices.html:', JSON.stringify(vp)); if (!(vp.rows === vp.total && vp.chips > vp.rows * 8 && /\[/.test(vp.said) && vp.eng > 0 && vp.eng < vp.total)) fail('voices.html');
});
// ---- the browser sub-suites on a fresh nominal page ----
S('nav', 'nominal3', (p) => navBrowser(p, fail));
S('walk', 'nominal3', (p) => walkBrowser(p, fail));
S('comms-hud', 'nominal3', (p) => commsHud(p, fail));
S('gamepad', 'nominal3', (p) => padBrowser(p, fail));   // gamepad on a mocked navigator.getGamepads (tools/test-gamepad.mjs)
S('ui', 'nominal3', (p) => uiBrowser(p, fail));   // Esc closes a layer without pausing, wheel select, portraits, belt digits (tools/test-ui.mjs)
S('talk', 'nominal3', (p) => talkBrowser(p, fail));   // E -> close-up conversation, frozen world, trust, Esc restores (tools/test-talk.mjs)
S('combat', 'nominal3', (p) => combatBrowser(p, null, fail));   // strike / grab / drag / release, witnesses, security, player HP (the madness zapper is combat-madness)
S('wiring', 'nominal3', (p) => wiringBrowser(p, fail));
S('save', 'nominal3', (p) => saveBrowser(p, fail));
S('jobgames', 'nominal3', (p) => jobgameBrowser(p, fail));
S('jobsites', 'nominal3', (p) => jobsiteBrowser(p, fail));
S('jobmodules', 'nominal3', (p) => jobmoduleBrowser(p, fail));   // three jobs with their own mechanic module (js/jobs/) through startJob: two console overlays, one in-room (tools/test-jobgames.mjs)   // J board / J menu route to the job and start it on arrival; a work-site job end to end (tools/test-jobgames.mjs)   // job mini-games: instruction card once per tool (fb_cfg), win / fail -> quality + time, Esc cancels, no soft-lock (tools/test-jobgames.mjs)   // clothes cache, repair points, breathers, sleepers, pod / field / sight animation, stretcher bracket, art carts, handheld icons (tools/test-wiring.mjs)
S('pace-repair', 'nominal3', async (page3) => {   // pace wiring (title control, standard newRun), crew repair response, world pause, shift-end tasks (the preset maths is the node section pace-presets)
const rep = await page3.evaluate(async () => {
  const g = __game, G = g.G, out = {}, hide = () => document.querySelectorAll('.screen').forEach(s => s.classList.remove('show'));
  const snap = () => ({ id: g.pace.id, T: g.clock.paceT, rate: +g.clock.rate.toFixed(5), firstDue: Math.round(Math.min(...g.duty.loops.map(l => l.next))), period0: g.duty.loops[0]?.period, run: g.phases.runLength, phaseAt: g.phases.phaseAt[4], firstTask: Math.round(Math.min(...g.duty.tasks.map(t => t.at_s), 1e9)), cascadeT: g.shipState.paceT });
  G.forceShip = 0; g.pace = 'standard'; g.newRun(); hide(); g.setQuality('low'); out.std = snap();
  out.title = { buttons: document.querySelectorAll('#pacesel [data-pace]').length, summary: document.getElementById('pacesum').textContent };
  G.hp = G.maxHp = 1e6; G.phase = 'play'; let t = 0; const tick = (n, dt = 0.1) => { for (let i = 0; i < n; i++) { t += dt; G.phase = 'play'; g.step(dt, t); } };
  // a system serviced on this deck breaks: a crew member is dispatched, walks to it (body), works (marker), patches it to ~0.85 and reports on the comm bus
  const here = G.shipDeck + 1, sys = ['helm', 'alert', 'lifts', 'computer', 'sensors'].find(s => g.repair.site(s)?.deckNo === here) || Object.keys(g.repair.sites).find(s => g.repair.sites[s].deckNo === here);
  const ev = []; let budget = 22, est = null; g.repair.on(e => { ev.push(e.type); if (e.type === 'assign' && est == null) { const j = g.repair.jobs.get(e.sys), p = g.roster.people.find(q => q.id === e.id); est = +(g.sim.estimate(p, j.site.room, j.site.tx != null ? j.site : null) || 0).toFixed(1);
    budget = t + est * 1.5 + 12 + (g.pace.setup?.[1] ?? 5) + e.need + 5; } });   // explicit budget once someone is sent: walk (+50 %, the body's pace) + up to 10 s of last metres off-screen + set-up + the work itself + 5 s
  const roll0 = g.repair.roll; g.repair.roll = () => 0;   // the patch holds the first time: failed patches / parts / escalation are the node tests (tools/test-repair.mjs); notice <= 22 s on every preset
  g.shipState.damage(sys, 0.5); let walked = false, posed = false, marker = false, lead = null, maxProg = 0, body = false;
  for (let i = 0; t < budget && !ev.includes('done'); i++) { tick(1); const j = [...g.repair.jobs.values()][0]; if (j?.lead) lead = j.lead.person; if (lead) { const e = g.ents.find(x => x.simmed && x.person === lead); if (e) body = true; if (e?.walk) walked = true; if (e?.repairing?.npc) posed = true; if (e?.repMark) marker = true; } if (j) maxProg = Math.max(maxProg, j.need ? j.progress / j.need : 0); }
  g.repair.roll = roll0; out.repair = { sys, budget: +budget.toFixed(0), est, events: [...new Set(ev)], lead: lead?.short || null, hp: +g.shipState.hp(sys).toFixed(2), walked, posed, marker, body, maxProg: +maxProg.toFixed(2), secs: +t.toFixed(0), report: g.comms.log.some(m => /patched/.test(m.text)), heading: g.comms.log.some(m => /heading to/.test(m.text)), released: lead ? !g.sim.overridden(lead) : null };
  // world pause: nothing ticks while a menu is open
  const st0 = g.sim.t, dt0 = g.duty.t; G.menuPause = true; tick(30); out.paused = g.sim.t === st0 && g.duty.t === dt0; G.menuPause = false;
  // tasks stay open to the end of the shift, then count
  const D = g.duty; for (let i = 0; i < 1300; i++) D.tick(1); out.tasks = { n: D.tasks.length, open: D.tasks.filter(x => x.state === 'active').length }; g.nomEnd(); out.tasks.after = D.tasks.filter(x => x.state === 'missed').length; out.tasks.chain = D.chain.some(c => /Unfinished at end of shift/.test(c)); out.tasks.end = /Mission tasks/.test(document.getElementById('bd-end')?.textContent || '');
  G.hud2?.hideEnd(); return out;
});
console.log('pace/repair:', JSON.stringify(rep));
{ const r = rep, R = r.repair; if (!(r.std.T === 1 && r.std.run === 1200 && r.title.buttons === 3 && /Standard/.test(r.title.summary))) fail('pace presets ' + JSON.stringify(r));
  // the lead can be dispatched from another deck (no body here, the job runs in the sim): the work marker is only required when their body was on this deck
  if (!(R.events.includes('assign') && R.events.includes('done') && Math.abs(R.hp - 0.85) < 0.01 && R.report && R.heading && (R.posed || !R.walked) && (R.marker || !R.body) && R.released && (R.walked || R.events.includes('arrive')))) fail('crew repair response ' + JSON.stringify(R));
  if (!r.paused) fail('world pause (G.menuPause)'); if (!(r.tasks.open === r.tasks.n && r.tasks.after === r.tasks.n && (r.tasks.n === 0 || (r.tasks.chain && r.tasks.end)))) fail('shift-end tasks ' + JSON.stringify(r.tasks)); }
});
// ---- browser smoke (the gate's one browser check; the full run repeats it on the seed set) ----
const smoke = (ship, seed) => async (page) => {
  const r = await page.evaluate(async ({ ship, seed }) => {
    const g = __game, G = g.G; if (ship != null) G.forceShip = ship; if (seed != null) G.forceSeed = seed; g.newRun(); g.setQuality('low'); document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); G.hp = G.maxHp = 1e6; G.phase = 'play';
    const out = { ship: G.ship.name, runSeed: G.runSeed, decks: G.ship.decks, open: g.world.d.openTiles.length };
    let t = 0; for (let i = 0; i < 300; i++) { t += 1 / 30; G.phase = 'play'; g.advance(1 / 30, t); }
    out.bodies = g.ents.filter(e => e.simmed).length;
    const from = G.shipDeck; g.openLiftPanel(); out.panel = G.phase; if (G.phase === 'select') { g.liftTo(from + 1); let n = 0; for (; n < 30 * 12 && G.phase === 'ride'; n++) { t += 1 / 30; g.advance(1 / 30, t); } out.ride = { secs: +(n / 30).toFixed(1), to: G.shipDeck, phase: G.phase }; }
    g.setQuality('high'); g.renderOnce(); out.drawCalls = g.renderer.info.render.calls; out.cull = { ...g.cullStats }; out.humans = g.ents.filter(e => e.mesh?.userData.human).length; out.stuckHidden = g.ents.filter(e => e.mesh?.userData._culled).length; g.post.setScale(0.7); g.renderOnce(); out.scaled = g.post.scale; g.post.setScale(1); g.setQuality('low');   // one high-quality frame through the post chain
    delete G.forceSeed; return out;
  }, { ship, seed });
  console.log('smoke:', JSON.stringify(r));
  if (!(r.panel === 'select' && r.ride && r.ride.to === 1 && r.ride.phase === 'play' && r.drawCalls > 0 && r.cull.hidden + r.cull.shown <= r.humans && r.stuckHidden === 0 && r.scaled === 0.7)) fail('smoke: load / 300 frames / lift one deck down / render ' + JSON.stringify(r));
};
S('touch', 'touch', (p) => touchBrowser(p, fail));   // js/touch.js on a phone profile (tools/test-touch.mjs)
S('smoke', 'smoke', smoke(SHIP, null));
for (const [i, [ship, seed]] of SEED_SET.entries()) S('smoke-set' + i, 'smoke', smoke(ship, seed));

// ---- runner ----
if (argv.includes('--list')) { console.log(sections.map(s => `${s.name}${s.page ? ' [' + s.page + ']' : ' [node]'}`).join('\n')); process.exit(0); }
const pick = ONLY ? sections.filter(s => ONLY.includes(s.name)) : GATE ? sections.filter(s => !s.page || s.name === 'smoke') : sections.filter(s => s.name !== 'smoke');
if (ONLY) for (const n of ONLY) if (!sections.some(s => s.name === n)) { console.log(`no section '${n}' (--list)`); process.exit(2); }
console.log(`test: ${ONLY ? 'only ' + ONLY.join(',') : GATE ? 'gate' : 'full'}, seed ${SEED}${SHIP != null ? ', ship ' + SHIP : ''}, ${pick.length} sections`);
const T0 = Date.now(), times = []; let page = null, pageKind = null;
const mb = (b) => (b / 1048576).toFixed(0);
const snap = (p) => p.evaluate(() => (window.gc?.(), { ship: __game.G.ship?.name, runSeed: __game.G.runSeed, deck: __game.G.shipDeck, heap: performance.memory?.usedJSHeapSize, gl: [__game.renderer.info.programs?.length, __game.renderer.info.memory.textures, __game.renderer.info.memory.geometries] }));
for (const sec of pick) {
  if (sec.page !== pageKind && sec.page) { if (page) await page.close().catch(() => { }); page = null; pageKind = sec.page; page = await PAGES[sec.page](); }
  cur = sec.name; curPage = sec.page; ctx = {}; secFails = 0; const t0 = Date.now(), e0 = errors.length; let threw = null;
  const game = page && sec.page !== 'voices';
  try { if (game) { const sd = strSeed(sec.name); await page.evaluate(([s, n, pinShip]) => { window.__seedRandom(s); const G = __game.G; G.forceSeed = s % 1000000; if (pinShip) G.forceShip = s % n; }, [sd, SHIPSM.SHIPS.length, SHIP == null && sec.page !== 'nominal3' && sec.page !== 'smoke']); ctx = await snap(page); } await sec.fn(page); } catch (e) { threw = e; }
  if (game) ctx = await snap(page).catch(() => ctx);
  if (threw) { fail(`${sec.name} threw: ${String(threw.message || threw).split('\n')[0]}`); if (page) await page.close().catch(() => { }); page = null; pageKind = null; }   // a crashed / wedged page: the next section opens a fresh one
  if (secFails && curPage) console.log(where());
  if (errors.length > e0) console.log(`  page errors in ${sec.name}: ${[...new Set(errors.slice(e0))].slice(0, 3).join(' | ').slice(0, 400)}`);
  const ms = Date.now() - t0; times.push([sec.name, ms]);
  console.log(`  [${sec.name}] ${(ms / 1000).toFixed(1)} s, ${game ? `ship=${ctx.ship ?? '-'} seed=${ctx.runSeed ?? '-'} deck=${ctx.deck ?? '-'}, ` : ''}heap ${game && ctx.heap ? 'page ' + mb(ctx.heap) + ' MB (GL programs / textures / geometries ' + ctx.gl.join(' / ') + '), ' : ''}node ${mb(process.memoryUsage().heapUsed)} MB`);
}
if (page) await page.close().catch(() => { });
const tot = (Date.now() - T0) / 1000, slow = times.slice().sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, ms]) => `${n} ${(ms / 1000).toFixed(1)}`).join(', ');
console.log(`time: ${tot.toFixed(1)} s total (node ${(times.filter(([n]) => !sections.find(s => s.name === n).page).reduce((a, [, ms]) => a + ms, 0) / 1000).toFixed(1)} s); slowest: ${slow}`);
cur = 'page-errors'; curPage = null; ctx = {};
if (errors.length) fail('page errors:\n  ' + [...new Set(errors)].slice(0, 8).join('\n  '));
if (browser) await browser.close(); server.close();
console.log(failed ? 'FAILED' : 'OK'); process.exit(failed ? 1 : 0);
