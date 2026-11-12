import * as THREE from 'three';
import { SHIPS, ROOMS, PERKS, REDSHIRT_LINES, DEATH_LINES, pick } from './data.js';
import { generate, World, TS, genShip, shipPlan } from './world.js';
import { Sound } from './audio.js';
import { makeEnemy, S, THREATS } from './enemies.js';
import { loadModels, loadEnv, loadTextures, has as hasModel, instance } from './assets.js';
import { makeCrew, makeHologram, animateCrew, makeTribble, makeItem, makeViewmodel } from './actors.js';
import { makeSurvivor, makeCorpse, makeMedHolo, liveFace, markImpostor, makeHuman } from './humans.js';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';
import { Post, Particles, Decals, Dust } from './fx.js';
import { shipDeckFor, deckOptions, drawSchematic, zoneOf } from './ships.js';
import { makeComplement, ShipState, SYSTEMS, SYS, DEPT, DEPARTMENTS, DIVISION, HOST_LABEL, DEPT_LINES, pickCrewFor, nextMadness, CAN_TURN, hardwareSites, renderOrgChart, renderLoadout, statusPill, STATUS_CSS } from './crew.js';
import { makeJunction, setLamp, makeBeacon } from './sysview.js';
import { Director } from './director.js';
import { loadItems, searchFixture, fixtureName, examineProp } from './items.js';
import { mulberry32 } from './data.js';
import { hash01 } from './clock.js';
import { liftLine, loadPersonas, bark as voiceBark, habitCue, TAG_EFFECTS } from './voice.js';
import { speak, cue as voiceCue, attach as attachSpeech, getMode as voiceMode, setMode as setVoiceMode, MODES as VOICE_MODES } from './speech.js';
import { movePlayer, resetMover, startGrapple, MOVE } from './move.js';
import { createShipComms, loadCommsData, commsData } from './shipcomms.js';
import { CrewSim } from './sim.js';
import { generateSocial } from './social.js';
import { Duty, pickBillet, pickMission, briefing as makeBriefing, Q_LABEL, QUALITIES } from './duty.js';
import { DutyHUD } from './hud-duty.js';
import { Phases, PHASES, FAILURE_MODES } from './phases.js';
import { makeGait, gaitNow, describeGait } from './gait.js';
import { Fidgeter } from './movement.js';
import { Haul, initHaul, opStart, opHook, opEnd, pushHook, toolBonus } from './haul.js';   // equipment motions, carrying, carts (js/equipment.js, js/carry.js)
import { propsFor, classifyItem } from './equipment.js';
import { Kit } from './kit.js';   // handheld job equipment / improvised weapons (js/handhelds.js)
import { MISSIONS, party as commParty } from './bridge.js';
import { BRIDGE_PARTY } from './comms.js';   // NPC schedules (abstract everywhere, bodies only on the player's deck)   // bridge comms + ship-wide alerts (js/alerts.js, comms.js, bridge.js, hud-comms.js)

const $ = (id) => document.getElementById(id);
{ const st = document.createElement('style'); st.textContent = STATUS_CSS; document.head.appendChild(st); }
const NOM = () => G.mode === 'nominal';
const winDeck = () => G.ship ? G.ship.decks : 8;   // a run is one ship, top deck to keel
const ANN_NOM = ['All decks report nominal.', 'Reminder: tubelift maintenance window is at 0300.', 'Galley: second seating begins in twenty minutes.', 'Engineering: warp core output is steady.', 'Shift change on all decks in forty minutes.', 'Holodeck reservations are now open for tomorrow.', 'Cargo: please clear the loading corridor on Deck 6.'];
const COMPUTER = ['Life support failure on Deck 4.', 'Intruder alert. Intruder alert.', 'Warning: structural integrity field fluctuating.', 'Beam room 3 reports unauthorized biosign.',
  'Please remain calm. All decks are safe.', 'Hull breach detected. Sealing bulkheads.', 'Unable to locate captain.', 'Gravity plating offline in section 12.', 'Security teams respond to the cargo bay.', 'Self-destruct sequence: cancelled.', 'There are no lifeforms aboard.'];

// ---------------- renderer ----------------
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 80);
scene.add(camera);
const hemi = new THREE.HemisphereLight(0xffffff, 0x555555, 1.9); scene.add(hemi);
const lamp = new THREE.PointLight(0xfff0d0, 9, 14, 1.8); scene.add(lamp);
const torch = new THREE.SpotLight(0xfff6e0, 22, 30, 0.5, 0.65, 1.7); torch.position.set(0.15, -0.1, 0); camera.add(torch);
const torchT = new THREE.Object3D(); torchT.position.set(0, 0, -5); camera.add(torchT); torch.target = torchT;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
torch.castShadow = true; torch.shadow.mapSize.set(1024, 1024); torch.shadow.camera.near = 0.2; torch.shadow.camera.far = 30; torch.shadow.bias = -0.0004; torch.shadow.normalBias = 0.04;
let post = null;
// the first-person viewmodel lives in its own scene (own lights, drawn over the world) so it never clips walls or gets blown out by the torch
const vmScene = new THREE.Scene(), vmCam = new THREE.PerspectiveCamera(55, 1, 0.01, 5);
const vmHemi = new THREE.HemisphereLight(0xffffff, 0x30343c, 1); vmScene.add(vmHemi);
const vmKey = new THREE.DirectionalLight(0xfff2dc, 1); vmKey.position.set(-0.6, 0.9, 0.5); vmScene.add(vmKey);
const vmRim = new THREE.DirectionalLight(0xfff6e0, 0); vmRim.position.set(0.3, 0.1, -1); vmScene.add(vmRim);
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = vmCam.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); vmCam.updateProjectionMatrix(); post?.setSize(innerWidth, innerHeight); }
addEventListener('resize', resize); resize();
post = new Post(renderer, scene, camera, { scene: vmScene, camera: vmCam });
{ const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.3; }
const blood = new Particles(scene, 500, { size: 0.07, gravity: 9 });
const sparks = new Particles(scene, 200, { size: 0.06, additive: true, gravity: 7 });
const steam = new Particles(scene, 160, { size: 0.5, opacity: 0.16, gravity: -0.3, drag: 0.4 });
const decals = new Decals(scene);
const water = new Particles(scene, 240, { size: 0.045, gravity: 8 });
const WATER = new THREE.Color(0x9ec8d8);
const panelLights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xfff0d0, 0, 10, 1.5); scene.add(l); return l; });
let panelSel = [], panelT = 0; const ALERT_RED = new THREE.Color(0xff2010);
function updatePanelLights(dt) {
  panelT -= dt;
  if (panelT <= 0 && world) {
    panelT = 0.2; const arr = [];
    for (const p of world.panels) { const dx = p.x - P.x, dz = p.z - P.z; arr.push([dx * dx + dz * dz, p]); }
    arr.sort((a, b) => a[0] - b[0]); panelSel = arr.slice(0, 3);
  }
  const pa = world ? world.powerAmt : 1, al = world ? world.alertAmt : 0;
  scene.environmentIntensity = 0.3 * (0.04 + 0.96 * pa);
  panelLights.forEach((l, i) => {
    const e = panelSel[i];
    if (!e) { l.intensity = 0; return; }
    l.position.set(e[1].x, e[1].y, e[1].z);
    l.color.set(ship.light); if (e[1].col) l.color.multiply(e[1].col); l.color.lerp(ALERT_RED, al * 0.7);
    l.intensity = 7.5 * pa * (e[1].flick ? world.flickerF : 1) * (1 - al * 0.3);
  });
  // fluorescent buzz, loudest right under a working panel
  if (panelSel[0]) { const d = Math.sqrt(panelSel[0][0]); sound.setBuzz(Math.max(0, 1 - d / 7) * pa * (panelSel[0][1].flick ? world.flickerF : 1)); }
}
const dust = new Dust(scene);
blood.onLand = (x, z) => { if (Math.random() < 0.35) decals.floor('blood', x, z, 0.12 + Math.random() * 0.3); };
const RED = new THREE.Color(0x7a0808), RED2 = new THREE.Color(0xa01010), SPARK = new THREE.Color(0xffb050), STEAM = new THREE.Color(0xcfd8e0);
function bloodBurst(x, y, z, n, speed, dx = 0, dz = 0) {
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, sp = Math.random() * speed; blood.add(x, y, z, Math.cos(a) * sp + dx, 1 + Math.random() * 3, Math.sin(a) * sp + dz, Math.random() < 0.5 ? RED : RED2, 0.6 + Math.random() * 0.8); }
}
function screenSplat(n, persist = false) {
  for (let i = 0; i < n; i++) {
    const d = document.createElement('div'); const sz = 90 + Math.random() * 260;
    d.style.cssText = `position:fixed;z-index:4;pointer-events:none;left:${Math.random() * 100}%;top:${Math.random() * 100}%;width:${sz}px;height:${sz * (0.7 + Math.random() * 0.6)}px;margin:-${sz / 2}px;border-radius:${40 + Math.random() * 20}% ${40 + Math.random() * 20}% ${50 + Math.random() * 20}% ${40 + Math.random() * 20}%;background:radial-gradient(circle at 40% 40%,rgba(150,8,8,.95),rgba(80,0,0,.9) 60%,rgba(60,0,0,.55));filter:blur(1px);box-shadow:0 ${sz * 0.5}px ${sz * 0.12}px -${sz * 0.3}px rgba(100,0,0,.7);transition:opacity 5s ease-in ${persist ? 99 : 1.5}s,transform 6s ease-in;opacity:1;transform:scale(1)`;
    document.body.appendChild(d);
    if (!persist) requestAnimationFrame(() => { d.style.opacity = 0; d.style.transform = 'translateY(40px) scale(1.1)'; setTimeout(() => d.remove(), 7000); });
    else d.className = 'persist-splat';
  }
}
function clearSplats() { document.querySelectorAll('.persist-splat').forEach(e => e.remove()); }

const CFG = Object.assign({ sens: 1, vol: 0.8, quality: 'high' }, JSON.parse(localStorage.getItem('fb_cfg') || '{}'));
const sound = new Sound(); sound.vol = CFG.vol; attachSpeech(sound);
function saveCfg() { localStorage.setItem('fb_cfg', JSON.stringify(CFG)); }
function setQuality(q) {
  CFG.quality = q; torch.castShadow = q === 'high'; world?.setFancy(q === 'high'); if (beamCone) beamCone.visible = q === 'high' && P.torch; renderer.setPixelRatio(q === 'high' ? Math.min(devicePixelRatio, 1.5) : 1); resize(); saveCfg();
  const el = $('qsel'); if (el) el.value = q;
}

// phaser beam visual
const beamMat = new THREE.LineBasicMaterial({ color: 0xff9a3a, transparent: true, opacity: 1 });
const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), beamMat);
beam.visible = false; beam.frustumCulled = false; scene.add(beam);
let beamT = 0;

// ---------------- game state ----------------
const G = {
  mode: new URLSearchParams(location.search).get('mode') === 'madness' ? 'madness' : 'nominal',   // 'nominal' = Systems Nominal (default); 'madness' = the roguelike
  phase: 'title', deck: 0, runSeed: 1, shipOrder: [], hp: 100, maxHp: 100, stamina: 100,
  phaser: 3, maxPhaser: 3, perks: {}, chips: 0, tribbles: 0, kills: 0, stuns: 0, time: 0, deckTime: 0,
  shield: false, endless: false, best: +(localStorage.getItem('fb_best') || 0),
};
const P = { x: 0, z: 0, vx: 0, vz: 0, yaw: 0, pitch: 0, crouch: false, sprint: false, bob: 0, stepD: 0, torch: true, shake: 0, kbx: 0, kbz: 0 };
resetMover(P);
const keys = {}, pressed = { jump: false, crouch: false, grappleCancel: false };
let beamCone = null, wasChased = false, world = null, gorns = [], ents = [], ship = null, shot = 0, noiseNow = 0, mapOn = true, locked = false, lastHeart = 0, invuln = 0;

const perk = (id) => G.perks[id] || 0;

// ---------------- UI helpers ----------------
let toastTimer = 0;
G.say = function (msg, cls = '') {
  const t = $('toast'); t.textContent = msg; t.className = 'hud ' + cls; t.style.opacity = 1;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.style.opacity = 0, 3800);
};
function showScreen(id) { for (const s of document.querySelectorAll('.screen')) s.classList.toggle('show', s.id === id); }
function hideScreens() { for (const s of document.querySelectorAll('.screen')) s.classList.remove('show'); }
function flash(color = '#c00', op = 0.6) { const f = $('flash'); f.style.background = color; f.style.transition = 'none'; f.style.opacity = op; requestAnimationFrame(() => { f.style.transition = 'opacity .5s'; f.style.opacity = 0; }); }
function fade(to, ms = 700) { const f = $('fade'); f.style.transition = `opacity ${ms}ms`; f.style.opacity = to; }

function updateHUD() {
  $('hpbar').style.width = Math.max(0, G.hp / G.maxHp * 100) + '%';
  $('stbar').style.width = Math.max(0, G.stamina) + '%';
  const cells = $('cells'); let h = '';
  for (let i = 0; i < G.maxPhaser; i++) h += `<span class="${i < G.phaser ? '' : 'off'}"></span>`; cells.innerHTML = h;
  if (vm) { vm.cells.forEach((c, i) => c.material.color.set(i < Math.ceil(G.phaser / G.maxPhaser * 3) ? 0x40c8ff : 0x10222c)); vm.ring.material.color.set(G.phaser > 0 ? 0xff9a3a : 0x30180a); }
  const need = world ? world.d.chips.length : 0;
  $('objective').innerHTML = NOM() ? '' : G.chips >= need
    ? `<b>Tubelift online</b> — reach the lift<br>Chips ${G.chips}/${need}`
    : `Logic chips <b>${G.chips}/${need}</b><br>Restore power to the tubelift`;
  const pl = Object.entries(G.perks).map(([id, n]) => PERKS.find(p => p.id === id).name + (n > 1 ? ' ×' + n : '')).join(' · ');
  $('perks').textContent = pl;
}

// ---------------- level loading ----------------
function clearLevel() {
  if (world) { scene.remove(world.group); world.dispose(); }
  for (const g of gorns) scene.remove(g.mesh);
  for (const e of ents) scene.remove(e.mesh);
  for (const r of repairPts) if (r.obj) scene.remove(r.obj);
  gorns = []; ents = []; repairPts = [];
}

// per-deck state of the persistent ship (Systems Nominal): what was searched and explored survives leaving the deck
const siteKey = (s) => `${Math.round(s.x * 10)},${Math.round(s.z * 10)},${s.kind}`;
function saveDeckState() {
  const S = NOM() && world && G.shipDecks && G.shipDecks[G.shipDeck]; if (!S) return;
  for (const s of world.searchSites || []) if (s.used) S.st.sites.add(siteKey(s));
  S.st.explored = world.explored.slice();
}

function loadDeck(n) {
  saveDeckState();
  clearLevel(); decals.clear(); blood.clear(); sparks.clear(); steam.clear(); clearSplats();
  resetMover(P); rope.visible = hook.visible = false;
  G.deck = n; G.chips = 0; G.deckTime = 0; G.shield = !!perk('shield');
  ship = G.ship;
  G.shipDeck = shipDeckFor(ship, n, winDeck());
  const NM = NOM(), SD = NM ? G.shipDecks[G.shipDeck] : null; let data;
  if (SD) { data = SD.data; data.used.clear(); for (const k of SD.used0) data.used.add(k); data.flooded = false; }   // the ship's data is kept for the whole run; only this deck gets a 3D build
  else { data = generate(n - 1, G.runSeed + n * 7919, deckOptions(ship, G.shipDeck)); data.flooded = n === 3 || n === 6 || (n > 8 && Math.random() < 0.25); }
  G.fieldCache = null; world = new World(data, ship); scene.add(world.group); world.setFancy(CFG.quality === 'high');
  if (NM) { world.mountCar(); clearRider(); for (const s of world.searchSites || []) if (SD.st.sites.has(siteKey(s))) s.used = true; if (SD.st.explored) world.explored.set(SD.st.explored); G.lift = { state: 'idle', armed: false, far: true, rider: null }; }
  scene.fog = new THREE.FogExp2(ship.fog, ship.fogD); scene.background = new THREE.Color(ship.fog);
  hemi.color.set(ship.light); hemi.groundColor.set(ship.floor);
  lamp.color.set(ship.light);

  if (NM) { const c = world.car; P.x = c.x; P.z = c.z; P.yaw = Math.atan2(-c.dx, -c.dy); P.pitch = 0; P.vx = P.vz = 0; }   // standing in the lift car, facing the doors
  else {
  const [sx, sy] = data.start; [P.x, P.z] = world.center(sx, sy);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => data.grid[sy + dy]?.[sx + dx] === 0);
  const [dx, dy] = dirs[0] || [1, 0]; P.yaw = Math.atan2(-dx, -dy); P.pitch = 0; P.vx = P.vz = 0; }
  world.reveal(P.x, P.z, 3);

  const rnd = data.rnd;
  const luck = perk('luck');
  const add = (kind, tile, mesh, extra = {}) => {
    const [cx, cz] = world.center(tile[0], tile[1]);
    mesh.position.x = cx + (extra.ox || 0); mesh.position.z = cz + (extra.oz || 0);
    scene.add(mesh); const e = { kind, mesh, x: mesh.position.x, z: mesh.position.z, t: rnd() * 6, ...extra }; ents.push(e); return e;
  };
  if (!NM) for (const c of data.chips) add('chip', c, makeItem('chip'));
  const sup = G.fx ? G.fx.supplies : 0;   // broken replicators = emptier supply lockers
  const nb = Math.max(0, 1 + (n > 2 ? 1 : 0) + luck + sup), nm = Math.max(1, 1 + luck + (n > 3 ? 1 : 0) + sup);
  for (let i = 0; i < (NM ? 0 : nb); i++) { const t = data.pickTile(() => true); if (t) add('battery', t, makeItem('battery')); }
  for (let i = 0; i < (NM ? 0 : nm); i++) { const t = data.pickTile(() => true); if (t) add('medkit', t, makeItem('medkit')); }
  const nt = 3 + Math.floor(rnd() * 4);
  for (let i = 0; i < nt; i++) { const t = data.pickTile(() => true); if (t) add('tribble', t, makeTribble(), { ox: (rnd() - 0.5) * 1.2, oz: (rnd() - 0.5) * 1.2 }); }
  // survivors + bodies
  if (NM && G.sim) simBodies(0, true);
  G.haul?.dispose(); G.haul = NM ? new Haul() : null;   // parked carts, NPC hauling, player carry/push (js/haul.js)
  if (!G.kit || G.kit.who !== G.player || G.kit.run !== G.runSeed) { G.kit?.dispose(); G.kit = new Kit(NM ? G.player : null, G.runSeed, NM ? null : ['crowbar', 'tricorder_sec', 'flashlight']); G.kit.who = G.player; G.kit.run = G.runSeed; } else G.kit.dispose();   // belt kit (V/X/T, click)
  for (let i = 0; i < (NM ? 0 : 3 + (n > 2 ? 1 : 0)); i++) {
    const t = data.pickTile(() => true); if (!t) continue;
    const person = pickCrewFor(G.roster, zoneOf(G.shipDeck / Math.max(1, ship.decks - 1)).label, rnd); if (person) person.status = 'seen';
    const m = makeSurvivor(rnd, person) || makeCrew([0xb02a20, 0xd0a020, 0x2a5fb0][Math.floor(rnd() * 3)]); m.rotation.y = rnd() * 6.28;
    if (person) m.userData.rank = person.short;
    const fake = !NM && n >= 2 && rnd() < 0.3; if (fake) markImpostor(m);   // a Slimeling wearing a face: small tells (js/humans.js)
    add('crew', t, m, { used: false, fake, person });
  }
  for (let i = 0; i < (NM ? 0 : n >= 3 ? 2 : 1); i++) { const t = data.pickTile(() => true); if (!t) continue; const person = pickCrewFor(G.roster, zoneOf(G.shipDeck / Math.max(1, ship.decks - 1)).label, rnd); if (person) person.status = 'corpse'; add('body', t, makeCorpse(rnd, person) || makeCrew(0xb02a20, true), { used: false, person }); }
  { const t = data.rooms.find(r => r.type === 'sickbay'); if (t) {
      const tile = data.pickTile(([x, y]) => data.room[y][x] === 'sickbay');
      if (tile && (!G.fx || G.fx.emh)) add('emh', tile, makeMedHolo() || makeHologram(), { used: false });
  } }

  // Jiffy tubes: something worth crawling for in the middle, and sometimes something waiting
  for (const t of NM ? [] : data.tubes) {
    const mid = t.tiles[(t.ladder > 0 ? t.ladder : t.tiles.length) >> 1];   // on the lower run
    const kind = rnd() < 0.5 ? 'battery' : 'medkit'; add(kind, mid, makeItem(kind));
  }
  if (NM) G.threats = []; else spawnThreats(data, n, rnd);
  for (const t of data.tubes) if (!NM && n >= 3 && t.tiles.length >= 3 && rnd() < 0.4) gorns.push(makeEnemy('clinger', world, t.tiles[t.ladder === 1 ? 0 : 1], n, 0, scene, sound));
  if (!NM) placeGore(data, rnd, n);
  placeRepairPoints(data);
  if (NM) G.mad = null; else startDeckMadness(data, n, rnd);
  G.director?.reset(n);
  world.setLiftOpen(NM); world.setAlert(false); G.comms?.hud?.syncLighting(); world.setPower(true); sound.setPower(true);
  G.blackout = 0; G.blackT = NM ? 1e9 : 40 + Math.random() * 50; G.lurchT = 20 + Math.random() * 20; G.repairT = 0; G.distT = NM ? 1e9 : 20 + Math.random() * 20; G.hints = {};
  showCard(n, ship, data.flooded);
  $('decklbl').textContent = 'DECK ' + n;
  $('shipcls').textContent = ship.cls + '-class';
  $('shipname').textContent = ship.name + ' · ' + ship.reg;
  updateHUD();
  if (NM) { G.say(`${ship.name} ${ship.reg} — Deck ${n}, ${zoneOf(G.shipDeck / Math.max(1, ship.decks - 1)).label}. All systems nominal.`, 'good'); if (!G.hinted) { G.hinted = 1; setTimeout(() => { if (G.phase === 'play') G.say('Step into any tubelift and pick a deck (E calls the panel). Tab: ship status.', 'comp'); }, 5000); } }
  else G.say(`${ship.name} ${ship.reg} — find ${data.chips.length} logic chips`, 'good');
  if (n === 1 && !NM) setTimeout(() => { if (G.phase === 'play' && G.deck === 1) G.say('Space: jump / climb crates · C while sprinting: slide · Q: grapple line', ''); }, 4500);
}

function spawnThreats(data, n, rnd) {
  const pool = shuffle(['gronk', 'drone', 'phantom']);
  const chosen = n === 1 ? [] :   // deck 1 is only the madness: a redshirt who loses it in front of you
    pool.slice(0, n < 3 ? 1 : n < 6 ? 2 : 3);
  G.threats = ['crazed'];
  const far = (f) => data.pickTile(([x, y]) => data.dist[x + y * data.W] >= data.maxD * f) || data.gornSpawn;
  chosen.forEach((type, i) => {
    const delay = Math.max(10, 28 - n * 2) + i * 22 + 15;
    gorns.push(makeEnemy(type, world, i === 0 ? data.gornSpawn : far(0.4), n, delay, scene, sound));
    G.threats.push(type);
  });
  const nc = n >= 2 ? Math.min(4, 1 + Math.floor(rnd() * (1 + n / 3))) : 0; let made = 0;
  for (let i = 0; i < nc; i++) { const t = data.pickTile(([x, y]) => !data.room[y][x] && data.dist[x + y * data.W] > data.maxD * 0.15); if (t) { gorns.push(makeEnemy('clinger', world, t, n, 0, scene, sound)); made++; } }
  if (made) G.threats.push('clinger');
  if (n >= 2 && ents.some(e => e.fake)) G.threats.push('slimeling');
}
function showCard(n, ship, flooded) {
  const c = $('card'); c.innerHTML = `<small>${ship.cls.toUpperCase()}-CLASS</small><b>DECK ${n}</b><span>${ship.name} · ${ship.reg} · ship deck ${String(G.shipDeck + 1).padStart(2, '0')} of ${ship.decks}</span>${flooded ? '<em>Coolant leak — deck flooded</em>' : ''}<div class="thr">${(G.threats || []).map(t => '<i>▲</i>' + THREATS[t]).join('<br>')}</div>`;
  { const cv = document.createElement('canvas'); cv.width = 640; cv.height = 250; drawSchematic(cv, ship, G.shipDeck); c.insertBefore(cv, c.querySelector('.thr')); }
  c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
}
function placeGore(data, rnd, n) {
  const w = world;
  const randOpen = () => data.openTiles[Math.floor(rnd() * data.openTiles.length)];
  const jit = (v, r) => v + (rnd() - 0.5) * r;
  // scattered splatters, more on deeper decks
  const nSplat = 5 + n * 3;
  for (let i = 0; i < nSplat; i++) { const t = randOpen(); if (data.grid[t[1]][t[0]] !== 0) continue; const [cx, cz] = w.center(t[0], t[1]); decals.floor('blood', jit(cx, TS * 0.8), jit(cz, TS * 0.8), 0.5 + rnd() * 1.1, rnd()); }
  // wall splats + claw marks + scorch
  const faces = w.wallFaces;
  for (let i = 0; i < 3 + n * 2 && faces.length; i++) { const f = faces[Math.floor(rnd() * faces.length)]; decals.wall('blood', f.px + f.dx * 0.01, 0.8 + rnd() * 1.6, f.pz + f.dy * 0.01, f.ry, 0.8 + rnd() * 1.4); }
  for (let i = 0; i < 2 + n && faces.length; i++) { const f = faces[Math.floor(rnd() * faces.length)]; decals.wall('claw', f.px + f.dx * 0.02, 1.3 + rnd() * 0.8, f.pz + f.dy * 0.02, f.ry, 1.0 + rnd() * 0.6); }
  for (let i = 0; i < 2 + n && faces.length; i++) { const f = faces[Math.floor(rnd() * faces.length)]; decals.wall('scorch', f.px + f.dx * 0.015, 0.7 + rnd() * 1.6, f.pz + f.dy * 0.015, f.ry, 0.8 + rnd() * 1.2); }
  // pools + drag trails at bodies
  for (const e of ents) if (e.kind === 'body') {
    decals.floor('blood0', e.x, e.z + 0.8, 2.2, 1); decals.floor('blood1', e.x + 0.3, e.z + 0.5, 1.6, 1);
    const [tx, ty] = w.tile(e.x, e.z); let cx = tx, cy = ty, dir = null;
    for (let seg = 0; seg < 5; seg++) {
      const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => data.grid[cy + b]?.[cx + a] === 0);
      if (!opts.length) break; if (!dir || rnd() < 0.3) dir = opts[Math.floor(rnd() * opts.length)];
      for (let k = 0; k < 4; k++) { const [px, pz] = w.center(cx, cy); decals.floor('blood2', px + dir[0] * k * 0.6 + jit(0, 0.3), pz + dir[1] * k * 0.6 + jit(0, 0.3), 1.1, 1 - seg * 0.12); }
      cx += dir[0]; cy += dir[1]; if (data.grid[cy]?.[cx] !== 0) break;
    }
  }
}



// ---- NPC walking on the player's deck: descend the path field toward a tile at walking pace, then take the pose of the spot
const WALK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]], POSE_OF = { console: 'interact', desk: 'interact', workbench: 'interact', labbench: 'interact', junction: 'interact', warpcore: 'interact', replicator: 'interact', bar: 'sitting_idle', table: 'sitting_idle', sofa: 'sitting_idle', bunk: 'sitting_idle', biobed: 'idle_talking', treadmill: 'jog_fwd', weightbench: 'idle_torch' };
function poseFor(e) { const H = e.mesh.userData.human; if (!H) return; if (opStart(e)) return;   // simmed crew run the equipment's use script (js/haul.js, js/equipment.js); POSE_OF is the fallback
  const pose = POSE_OF[e.spot] || 'idle'; try { H.play(pose, { fade: 0.25 }); } catch (er) { H.play('idle', { fade: 0.25 }); } H.standing = pose.startsWith('idle'); e.walking = false; }
function pathField(tx, ty, tubes = false) { const c = G.fieldCache || (G.fieldCache = new Map()), k = tx + ',' + ty + (tubes ? 't' : ''); let f = c.get(k); if (!f) { f = tubes ? world.field(tx, ty, false, true) : world.field(tx, ty, true); c.set(k, f); if (c.size > 60) c.delete(c.keys().next().value); } return f; }


// ---- fidgets and gestures (js/movement.js): an additive bone layer + face morphs on top of whatever clip is playing
const SIT_SPOTS = new Set(['bar', 'table', 'sofa', 'bunk']), WORK_SPOTS = new Set(['console', 'desk', 'workbench', 'labbench', 'junction', 'warpcore', 'replicator']), CUE_OF = { yawn: 'sigh', groan: 'sigh', cough: 'clear', knuckles: 'crack', sigh: 'sigh', hum: 'hum', whistle: 'whistle' };
function fidgetStep(e, dt, d) {
  const H = e.mesh.userData.human; if (!H || !e.person || e.fake) return;
  if (opHook(e, dt, d)) return;   // an equipment Operator / cart / carried load drives the additive layer instead of the fidgeter
  const fid = e.fid || (e.fid = new Fidgeter(e.person, G.runSeed)), gtx = e.gaitCtx, h = G.comms ? G.comms.clock.localHour(e.person) : 2;
  const state = e.walk ? 'walking' : SIT_SPOTS.has(e.spot) ? 'sitting' : WORK_SPOTS.has(e.spot) ? 'working' : (d < 3.2 && G.phase === 'play' ? 'talking' : 'standing');
  const o = fid.update(dt, { state, stress: Math.max(0, Math.min(1, (G.comms?.alerts?.top()?.def.severity ?? 0) / 4)), tired: Math.max(0, Math.min(1, (h - 5) / 3)), late: !!gtx && h > 7 && h < 8, bored: state === 'sitting', playerNear: d < 4 });
  H.add = o.bones; const f = {}; for (const k of e.fidFace || []) f[k] = 0; Object.assign(f, o.face); H.face(f); e.fidFace = Object.keys(o.face);
  if (o.cue && d < 9) voiceCue(e.person, CUE_OF[o.cue] || o.cue);
}


// ---- dodging: step aside when the player sprints at someone standing still, then drift back to the spot
const DODGE_LINES = ['Whoa!', 'Watch it!', 'Hey, careful!', 'Coming through, huh?'];
function dodgeCheck(e, dt, d) {
  if (e.retT > 0) { e.retT -= dt; if (e.retT <= 0 && !e.walk && e.returnTo) { const r = e.returnTo; e.returnTo = null; startWalk(e, 0, 0, false, { point: r, run: false }); } }
  e.dodgeCool = (e.dodgeCool || 0) - dt; if (e.walk || e.dodgeCool > 0 || d > 3.4 || G.phase !== 'play') return;
  const sp = Math.hypot(P.vx || 0, P.vz || 0); if (sp < 2.6) return;
  const vx = P.vx / sp, vz = P.vz / sp, rx = e.x - P.x, rz = e.z - P.z, ahead = rx * vx + rz * vz, lat = rx * -vz + rz * vx; if (ahead < 0.1 || ahead > 3.3 || Math.abs(lat) > 1.0) return;
  const s = lat >= 0 ? 1 : -1, home = e.returnTo || [e.x, e.z];
  for (const k of [s, -s]) { const px = e.x + -vz * k * 0.95, pz = e.z + vx * k * 0.95; if (world.los(e.x, e.z, px, pz) && world.los(e.x + -vz * k * 0.3, e.z + vx * k * 0.3, px + -vz * k * 0.3, pz + vx * k * 0.3)) { e.dodgeCool = 5; startWalk(e, 0, 0, false, { point: [px, pz], run: true, returnTo: home }); if (e.person && Math.random() < 0.5) { const t = DODGE_LINES[Math.floor(Math.random() * DODGE_LINES.length)]; G.say(`${e.person.short}: ${t}`, 'npc'); try { speak(e.person, t); } catch (er) { } } return; } }
}
// collapse: the crew make for the shuttlebay (running, crawling through tubes when it is quicker) and the sim keeps them there
function evacuationStep(dt) {
  if (!G.phases || G.phases.index < 4 || !G.sim) return; G.evacT = (G.evacT || 0) - dt; if (G.evacT > 0) return; G.evacT = 1.2;
  const room = G.plan?.shuttlebay ? 'shuttlebay' : 'transporter';
  for (const p of G.roster.people) if (!p.isPlayer && !['dead', 'crazed', 'evacuated'].includes(p.status) && !G.sim.overridden(p) && ['mess', 'quarters', 'lounge', 'gym', 'holodeck', 'cargo', 'stores', 'laundry', 'arboretum'].includes(G.sim.where(p)?.room)) { if (hash01('evac', G.runSeed, p.id) < 0.6) G.sim.redirect(p, room, 'door', undefined, 'evacuating'); }
}

function gaitFor(e) {   // this walker's gait right now: their own mix of parts, modulated by alert level, fatigue and time of day
  if (!e.gaitBase) e.gaitBase = makeGait(e.person, G.runSeed);
  if (!e.gaitCtx || G.time - e.gaitT > 1 || e.gaitRun !== !!e.run) { e.gaitRun = !!e.run; const h = G.comms ? G.comms.clock.localHour(e.person) : 2; e.gaitT = G.time; e.gaitCtx = gaitNow(e.gaitBase, { run: !!e.run, alert: G.comms?.alerts?.top()?.def.severity ?? 0, tired: Math.max(0, Math.min(1, (h - 5) / 3)), relaxed: h > 8 && h < 20 }); }
  return e.gaitCtx;
}
function startWalk(e, tx, ty, vanish, opts = {}) { e.walk = { tx, ty, vanish, stuck: 0, opts }; e.run = !!opts.run; }
function walkStep(e, dt, d) {   // true while still walking. Natural gait: eased speed, capped turn rate, look-ahead steering, right-hand passing, braking, wall clearance.
  const w = e.walk, H = e.mesh.userData.human, f = pathField(w.tx, w.ty, !!w.opts.tubes), W = world.W, gt = gaitFor(e);
  const clampY = () => { const here = world.hostileGround(e.x, e.z), ahead = world.hostileGround(e.x + Math.sin(e.heading || 0) * 0.6, e.z + Math.cos(e.heading || 0) * 0.6), gy = (e.v || 0) > 0.2 && ahead > here ? ahead : here, y0 = e.y || 0, dy = gy - y0; e.y = y0 + Math.max(-2.4 * dt, Math.min(3.2 * dt, dy * Math.min(1, dt * 9))); e.mesh.position.y = e.y; };
  const finish = () => { e.walk = null; e.v = 0; e.heading = undefined; e.run = false; e.crawl = false; e.climbing = false; if (w.opts.returnTo) { e.retT = 2.4; e.returnTo = w.opts.returnTo; } if (w.vanish) { scene.remove(e.mesh); const i = ents.indexOf(e); if (i >= 0) ents.splice(i, 1); } else { if (!w.opts.point) { const [cx, cz] = world.center(w.tx, w.ty); e.x = cx; e.z = cz; e.mesh.position.x = cx; e.mesh.position.z = cz; } poseFor(e); } return false; };
  if (e.heading === undefined) e.heading = e.mesh.rotation.y;
  const turnTo = (gx, gz, k = 1) => { const want = Math.atan2(gx - e.x, gz - e.z); const err = Math.atan2(Math.sin(want - e.heading), Math.cos(want - e.heading)); const mt = (e.v > 0.3 ? Math.min(5.2, gt.turn) : Math.min(3.4, gt.turn * 1.3)) * dt * k; e.heading += Math.max(-mt, Math.min(mt, err)); e.mesh.rotation.y = e.heading; return err; };
  const animate = (clip, scale) => { if (!H) return; if (!e.walking || e.clip !== clip) { try { H.play(clip, { fade: 0.2 }); } catch (er) { H.play('idle'); } H.standing = false; e.walking = true; e.clip = clip; } };
  const [mx0, my0] = world.tile(e.x, e.z);
  // short sidestep / settle to a point (dodging): straight toward it, no path field
  if (w.opts.point) {
    e.v = e.v || 0; const [px, pz] = w.opts.point, dist = Math.hypot(px - e.x, pz - e.z); if (dist < 0.07) return finish();
    const err = turnTo(px, pz, 1.4), sp0 = (w.opts.run ? 3.0 : 1.5) * Math.max(0.2, Math.cos(Math.min(1.3, Math.abs(err)))) * Math.min(1, 0.25 + dist / 0.6);
    e.v = (e.v || 0) + Math.max(-12 * dt, Math.min(9 * dt, sp0 - e.v)); const sp = Math.min(e.v * dt, dist); e.x += Math.sin(e.heading) * sp; e.z += Math.cos(e.heading) * sp; const q = { x: e.x, z: e.z, y: e.y || 0 }; world.resolve(q, 0.27); e.x = q.x; e.z = q.z; e.mesh.position.x = e.x; e.mesh.position.z = e.z; clampY();
    animate(w.opts.run ? gt.clip : 'walk'); if (H && d <= 22) { H.add = null; H.lookYaw += (0 - H.lookYaw) * Math.min(1, dt * 4); H.update(dt * Math.max(0.5, Math.min(2.2, e.v / (w.opts.run ? 3.0 : 0.95)))); } return true;
  }
  let cur = f[mx0 + my0 * W];
  if (cur < 0) {   // grazed a blocked corner: step back onto the nearest walkable tile instead of giving up
    let best = null, bd = 1e9; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = mx0 + dx, y = my0 + dy; if (x < 0 || y < 0 || x >= W || y >= world.H || f[x + y * W] < 0) continue; const [cx, cz] = world.center(x, y), dd = Math.hypot(cx - e.x, cz - e.z); if (dd < bd) { bd = dd; best = [cx, cz]; } }
    if (!best) return finish(); e.x += (best[0] - e.x) * Math.min(1, dt * 6); e.z += (best[1] - e.z) * Math.min(1, dt * 6); e.mesh.position.x = e.x; e.mesh.position.z = e.z; cur = 1;
  }
  const [tx, ty] = world.tile(e.x, e.z); cur = f[tx + ty * W] >= 0 ? f[tx + ty * W] : cur;
  e.crawl = world.isTube(tx, ty); e.climbing = world.tubeKind(tx, ty) === 'lad'; const vault = world.grid[ty]?.[tx] === 2;
  const [fx, fz] = world.center(w.tx, w.ty), toEnd = Math.hypot(fx - e.x, fz - e.z);
  // look-ahead: follow the field downhill and aim at the furthest tile in clear sight (with body-width clearance)
  let gx, gz, ax = tx, ay = ty, av = cur; const chain = [], tubeish = e.crawl || e.climbing || w.opts.tubes;
  for (let k = 0; k < (tubeish ? 1 : gt.cut ? 6 : 4) && av > 0; k++) { let best = av, bx = ax, by = ay; for (const [dx, dy] of WALK_DIRS) { const nx = ax + dx, ny = ay + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= world.H) continue; const ta = world.d.tubeAxis[ax + ay * W], tb = world.d.tubeAxis[nx + ny * W]; if (((ta === 'x' || tb === 'x') && dy !== 0) || ((ta === 'y' || tb === 'y') && dx !== 0)) continue;   /* same edge rule as World.field: tubes are entered only along their axis */ const v = f[nx + ny * W]; if (v >= 0 && v < best) { best = v; bx = nx; by = ny; } } if (best === av) break; ax = bx; ay = by; av = best; chain.push([bx, by]); }
  if (!chain.length) { gx = fx; gz = fz; } else { let pick = chain[0]; for (const c of chain) { const [cx, cz] = world.center(c[0], c[1]); if (c === chain[0] || (world.los(e.x, e.z, cx, cz) && [[0.34, 0], [-0.34, 0], [0, 0.34], [0, -0.34]].every(([ox, oz]) => world.los(e.x + ox, e.z + oz, cx + ox, cz + oz)))) pick = c; else break; } [gx, gz] = world.center(pick[0], pick[1]); }
  if (av === 0 && chain.length && chain[chain.length - 1][0] === w.tx && chain[chain.length - 1][1] === w.ty && world.los(e.x, e.z, fx, fz)) { gx = fx; gz = fz; }
  if (cur === 0) { gx = fx; gz = fz; }
  // pass others on the right-hand side (so two people meeting both step the same way), slow for anyone you cannot get round
  let slow = 1; const dxg = gx - e.x, dzg = gz - e.z, dg = Math.hypot(dxg, dzg) || 1, ux = dxg / dg, uz = dzg / dg, rx = uz, rz = -ux;   // (rx, rz) = right of travel
  const others = [...ents.filter(o => o !== e && o.kind === 'crew' && o.mesh), { x: P.x, z: P.z, player: true }];
  if (cur < (e.bestF ?? 1e9) - 0.5) { e.bestF = cur; e.bestT = G.time; } if (G.time - (e.bestT ?? G.time) > 5 && toEnd > 0.5) { e.forceT = 2; e.bestT = G.time; e.bestF = cur; }   // no progress for 5 s: ignore everyone and head straight down the field for a moment
  if (e.forceT > 0) e.forceT -= dt;
  for (const o of (tubeish || e.forceT > 0) ? [] : others) {
    const ox = o.x - e.x, oz = o.z - e.z, od = Math.hypot(ox, oz); if (od > 3.0 || od < 1e-3) continue; const ahead = (ox * ux + oz * uz) / od; if (ahead < 0.3) continue; const lat = ox * rx + oz * rz; if (Math.abs(lat) > 1.3) continue;
    const need = gt.space * 1.05 - (o.player ? 0.1 : 0) - lat * 0.0, k = Math.max(0.25, 1 - od / 3.0) * 1.2, off = Math.min(need * k, dg * 0.6, 1.0); gx += rx * off; gz += rz * off;   // always bear right of them
    if (od < 0.8 + gt.space * 0.3 && (!(e.ghost > 0) || o.player)) slow = Math.min(slow, Math.max(0.05, (od - 0.35) / 0.8));
  }
  // heading steers toward the goal at a capped rate; speed eases with turn error, nearness to the end, braking distance and obstacles
  const err = turnTo(gx, gz);
  e.pauseCool = (e.pauseCool || 0) - dt; if ((e.pauseT || 0) > 0) { e.pauseT -= dt; slow = Math.min(slow, 0.05); } else if (Math.abs(err) > 0.8 && e.v > 0.7 && e.pauseCool <= 0 && gt.pause > 0 && Math.random() < gt.pause * dt * 8) { e.pauseT = 0.5 + Math.random() * 0.8; e.pauseCool = 5; }
  const turnK = (Math.abs(err) > 1.2 && toEnd > 0.5) ? 0 : Math.max(0.25, Math.cos(Math.min(1.3, Math.abs(err)))), brake = Math.sqrt(2 * 1.5 * gt.accel * Math.max(0, toEnd - 0.04)) + 0.12;
  let target = gt.v * slow * turnK * (e.climbing ? 0.4 : e.crawl ? 0.5 : vault ? 0.55 : 1); if (!w.vanish) target = Math.min(target, brake);
  e.v = (e.v || 0); e.v += Math.max(-1.5 * gt.accel * dt, Math.min(gt.accel * dt, target - e.v));
  if (toEnd < 0.05 && !w.vanish) return finish();
  if (w.vanish && cur === 0 && toEnd < 0.2) return finish();
  // blocked by someone for a while: squeeze past (ghost through NPCs) rather than teleport; a player in a one-tile corridor is simply waited for
  if (e.v < 0.05 && slow < 0.3) { w.stuck += dt; if (w.stuck > 2.5) e.ghost = 1.5; if (w.stuck > 30) return finish(); } else w.stuck = Math.max(0, w.stuck - dt);
  if (e.ghost > 0) e.ghost -= dt;
  const sp = Math.min(e.v * dt, toEnd); e.x += Math.sin(e.heading) * sp; e.z += Math.cos(e.heading) * sp;
  if (!e.climbing) { const q = { x: e.x, z: e.z, y: e.y || 0 }; world.resolve(q, 0.26); e.x = q.x; e.z = q.z; }   // never clip walls
  if (toEnd < 0.35 && !w.vanish) { const k = Math.min(1, dt * 7); e.x += (fx - e.x) * k; e.z += (fz - e.z) * k; }   // ease onto the exact spot
  e.mesh.position.x = e.x; e.mesh.position.z = e.z; clampY();
  if (w.opts.push) pushHook(e, w, dt);   // pushing a cart (js/haul.js): ~0.7x speed, the cart rolls ahead; sets e.climbing so the 'push' clip / 0.23 m/s stride / no-fidget path below is used
  if (H) {
    // clip by what the body is really doing: idle while (nearly) standing, the gait clip otherwise, jog above ~2 m/s (hysteresis so it does not flicker)
    let clip = e.climbing ? 'push' : e.crawl || vault ? 'crouch_fwd' : gt.clip;
    if (!e.climbing && !e.crawl && !vault) { if (e.v < (e.clip === 'idle' ? 0.32 : 0.16)) clip = 'idle'; else if (gt.clip === 'jog_fwd') clip = e.v > (e.clip === 'jog_fwd' ? 1.9 : 2.2) ? 'jog_fwd' : 'walk'; else if (e.v > 2.4) clip = 'jog_fwd'; }
    if (H && !H.has(clip)) clip = H.has('walk') ? 'walk' : 'idle'; animate(clip);
    if (d > 22) return true;
    if (!e.run && !e.crawl && !e.climbing && !vault) fidgetStep(e, dt, d); else { H.add = null; }
    const ph = e.gaitBase.phase; e.gt = (e.gt || 0) + dt; let look = Math.sin(e.gt * 0.7 + ph) * gt.sway * (gt.look ? 3 : 1); const pd = Math.hypot(P.x - e.x, P.z - e.z);
    if (pd < 3.8 && Math.abs(Math.atan2(P.x - e.x, P.z - e.z) - e.heading) < 1.2 && hash01('glance', e.person.id, Math.floor(e.gt / 3)) < gt.glance) look = Math.max(-0.9, Math.min(0.9, Math.atan2(Math.sin(Math.atan2(P.x - e.x, P.z - e.z) - e.heading), Math.cos(Math.atan2(P.x - e.x, P.z - e.z) - e.heading))));
    const stride = e.climbing ? 0.23 : e.crawl || vault ? 0.62 : clip === 'jog_fwd' ? 4.7 : clip === 'sprint' ? 8 : 0.95 * (e.strideK || (e.strideK = Math.max(0.85, Math.min(1.3, Math.pow((H.height || 1.7) / 1.7, 1.2))))), ts = clip === 'idle' ? 1 : Math.max(e.climbing ? 0.8 : 0.4, Math.min(clip === 'sprint' ? 1.6 : 2.2, e.v / stride));
    H.lookYaw += (look - H.lookYaw) * Math.min(1, dt * 3.5); H.play(clip, { fade: 0.22, speed: ts }); H.update(dt);   // speed is the action's own time scale, so crossfades keep their length
  }
  return true;
}

// ---- NPC sim bodies: people the sim puts on this deck get a body; others are abstract. Bodies appear/vanish out of sight.
function simTileFor(person, e) {   // a tile in the person's room: beside the furniture of their spot (facing it) when there is some, else spread by id
  const d = world.d, h = (person.id * 2654435761 + 7) >>> 0, ok = (x, y) => d.grid[y]?.[x] === 0 && !world.isTube(x, y) && d.room[y][x] === e.room;
  const kinds = propsFor(e.spot), props = d.props.filter(p => kinds.includes(p.kind) && d.room[p.ty]?.[p.tx] === e.room);   // spot -> prop kinds (js/equipment.js: bar -> table, locker -> shelving …)
  if (props.length) for (let k = 0; k < props.length; k++) { const p = props[(h + k) % props.length]; for (const [dx, dy] of WALK_DIRS) { const x = p.tx + dx, y = p.ty + dy; if (ok(x, y) && !ents.some(o => o.simmed && o.person !== person && Math.hypot(o.x - world.center(x, y)[0], o.z - world.center(x, y)[1]) < 0.7)) { const t = [x, y]; t.face = world.center(p.tx, p.ty); return t; } } }
  const tiles = []; for (let y = 0; y < d.room.length; y++) for (let x = 0; x < d.room[y].length; x++) if (ok(x, y)) tiles.push([x, y]);
  return tiles.length ? tiles[h % tiles.length] : null;
}
function simBodies(dt, force = false) {
  G.simT = (G.simT || 0) - dt; if (!force && G.simT > 0) return; G.simT = 1.5; if (!world || !G.sim || G.phase === 'ride' || G.phase === 'select') { if (!force) return; }
  const here = new Map(G.sim.onDeck(G.shipDeck + 1).map(o => [o.person.id, o])), unseen = (x, z) => Math.hypot(x - P.x, z - P.z) > 14 || (force ? false : !world.los(P.x, P.z, x, z));
  for (const e of ents.slice()) {   // leave
    if (e.kind !== 'crew' || !e.simmed) continue; const o = here.get(e.person.id);
    if (e.walk) continue;   // still on its way somewhere
    if (!o || o.room !== e.room) {
      if (force || unseen(e.x, e.z)) { scene.remove(e.mesh); ents.splice(ents.indexOf(e), 1); }
      else if (!o && world.car) startWalk(e, world.car.tx, world.car.ty, true, G.sim.overridden(e.person) ? { run: true, tubes: true } : {});                       // left the deck: walk to the lift and go
      else if (o) { const t = simTileFor(e.person, o); if (t) { e.room = o.room; e.spot = o.spot; e.faceAt = t.face || null; startWalk(e, t[0], t[1], false, G.sim.overridden(e.person) ? { run: true } : {}); } }   // new room on this deck: walk there
    }
  }
  for (const o of here.values()) {   // arrive
    if (ents.some(e => e.person === o.person)) continue; if (o.person.status === 'dead' || o.person.status === 'crazed') continue;
    const t = simTileFor(o.person, o); if (!t) continue; let [cx, cz] = world.center(t[0], t[1]), walkTo = null;
    if (!force && !unseen(cx, cz)) { if (!world.car) continue; const [lx, lz] = world.center(world.car.tx, world.car.ty); if (!unseen(lx, lz)) continue; cx = lx; cz = lz; walkTo = t; }   // seen from here: come out of the lift instead
    o.person.status = o.person.status === 'seen' ? 'seen' : 'seen';
    const m = makeSurvivor(data0(), o.person) || makeCrew(0x2a5fb0); m.position.set(cx, 0, cz); m.rotation.y = (o.person.id * 0.9) % 6.28; m.userData.rank = o.person.short; scene.add(m);
    const ne = { kind: 'crew', mesh: m, x: cx, z: cz, t: Math.random() * 6, used: false, fake: false, person: o.person, simmed: true, room: o.room, spot: o.spot, faceAt: t.face || null }; ents.push(ne); if (walkTo) startWalk(ne, walkTo[0], walkTo[1], false); else poseFor(ne);
  }
}
const data0 = () => mulberry32((G.runSeed ^ 0x5eed) >>> 0);
initHaul({ get gorns() { return gorns; }, killMad, nearestRepair, get world() { return world; }, get ents() { return ents; }, scene, P, G, vmScene, sound, startWalk, simTileFor, gaitFor, pathField, cue: (p, c) => voiceCue(p, c), speak });   // js/haul.js glue context


// ---- the player's billet: duty loops, orders, delegation, reports, mission task board (js/duty.js, js/hud-duty.js)
function setupDuty() {
  G.hud2?.destroy(); G.hud2 = null; G.duty = null; if (!NOM()) return;
  const say = (m) => { if (m.kind === 'report') G.comms?.sim?.say?.({ from: commParty(m.from), to: BRIDGE_PARTY, text: m.text, priority: 'routine', channel: 'comm', kind: 'report' }); };
  G.duty = new Duty({ player: G.player, roster: G.roster, clock: G.comms.clock, sim: G.sim, duties: DUTIES, shipState: G.shipState, say, seed: G.runSeed, mission: G.mission });
  G.hud2 = new DutyHUD({ getPhase: () => G.phase, onMenu: dutyMenu }); G.hud2.attach(G.duty);
  G.phases = new Phases({ shipState: G.shipState, alerts: G.comms.alerts, roster: G.roster, duty: G.duty, seed: G.runSeed, say: (t, k) => G.say(t, k), enabled: !navigator.webdriver || new URLSearchParams(location.search).get('phases') === '1' });
  G.phases.on((ev) => { if (ev.type === 'end') nomEnd(); else if (ev.type === 'sabotage') G.say(`Security: ${ev.who}'s badge was used at a junction panel.`, 'warn'); });
  G.duty.on((ev) => {
    const g = G.say;
    if (ev.type === 'due') g(`Duty: ${ev.label} (${ev.room}). [J]`, 'comp');
    else if (ev.type === 'task') g(`Task now: ${ev.task} (${ev.room})`, 'comp');
    else if (ev.type === 'done') g(ev.auto ? `You never got to: ${ev.label}.` : ev.quality === 'proper' ? `${ev.label}: done properly.` : `${ev.label}: ${ev.quality}.`, ev.quality === 'proper' ? 'good' : 'warn');
    else if (ev.type === 'witness' || ev.type === 'audit' || ev.type === 'refused') g(`${ev.who}: ${ev.text}`, 'warn');
    else if (ev.type === 'consequence') g(`${ev.name} is ${ev.status} — neglected maintenance.`, 'warn');
    else if (ev.type === 'missed') g(`Missed: ${ev.task}. ${ev.neglect}`, 'warn');
    else if (ev.type === 'jobdone') g(`${ev.who} finished ${ev.label} (${ev.quality}).`, 'good');
    else if (ev.type === 'ordered') g(`${ev.who} takes the job: ${ev.label}.`, 'comp');
  });
}
function nomTick(dt) {
  if (!NOM() || !G.sim) return;
  G.sim.tick(dt); evacuationStep(dt); simBodies(dt); G.haul?.tick(dt);
  const D = G.duty; if (!D) return;
  const d = world?.d; if (d) { const tx = Math.floor(P.x / TS), ty = Math.floor(P.z / TS); D.setPlace(G.shipDeck + 1, d.room?.[ty]?.[tx] || 'corridor'); }
  D.tick(dt); G.hud2?.update(dt); ambientBarks(dt);
  if (G.phases) { G.phases.tick(dt); const hz = G.phase === 'play' ? G.phases.hazard(G.shipDeck + 1, { zone: D.place.room === 'engineering' ? 'engineering' : '' }) : null; if (hz) { G.hp -= hz.rate * dt; $('danger').style.opacity = 0.5; if (!G.hazT || G.hazT < G.time - 8) { G.hazT = G.time; G.say(`Warning: ${hz.cause}. Get out!`, 'warn'); } if (G.hp <= 0) nomDie(hz.cause); } else if (G.phase === 'play' && G.hp < G.maxHp) G.hp = Math.min(G.maxHp, G.hp + dt * 2); }
  if (G.hud2 && G.phase === 'play') { const room = D.place.room, due = D.loops.find(l => l.state === 'due' && l.room === room) || D.tasks.find(t => t.state === 'active' && t.room === room); G.hud2.setHint(D.busy ? `Working: ${D.busy.loop.label}…` : due ? `[J] ${due.label || due.task}` : ''); }
}
function dutyMenu() {
  const D = G.duty, H = G.hud2; if (!D || !H) return; const room = D.place.room, say = G.say;
  const doIt = (it) => H.openMenu(it.label || it.task, QUALITIES.map(q => ({ label: Q_LABEL[q], note: q === 'proper' ? `${Math.round((it.dur || 2) * 3.3 * 1.2)}s` : '', run: () => { const r = it.task ? D.doTask(it.id, q === 'skipped' ? 'skipped' : q) : D.perform(it.id, q); if (!r.ok) say(r.why, 'warn'); else if (it.task) say(`Task ${q}: ${it.task}`, 'good'); } })), 'How will you do it?');
  const here = [...D.loops.filter(l => l.state === 'due' || l.state === 'idle').map(l => ({ ...l, off: l.room !== room || l.state === 'delegated', note: l.room !== room ? `go to ${l.room}` : l.state === 'due' ? 'due' : 'not yet' })), ...D.tasks.filter(t => t.state === 'active').map(t => ({ ...t, label: t.task, off: t.room !== room, note: t.room !== room ? `go to ${t.room}` : 'now' }))];
  const top = [
    { label: 'Do a duty or task', run: () => H.openMenu('Duty / tasks', here.map(it => ({ label: it.label, note: it.note, off: it.off && false, run: () => { if (it.room !== room) say(`Do this in the ${it.room}.`, 'warn'); else doIt(it); } })).concat(here.length ? [] : [{ label: 'Nothing to do right now', off: true }]), 'digit to choose'), keepOpen: true },
    { label: 'Order a subordinate', run: () => { const subs = D.subs(); H.openMenu('Order whom?', subs.slice(0, 9).map(p => ({ label: `${p.short} — ${p.title}`, note: `trust ${Math.round(D.trust(p) * 100)}%`, run: () => { const r = D.order(p, null); if (!r.ok && !r.refused) say(r.why, 'warn'); } })).concat(subs.length ? [] : [{ label: 'No one reports to you', off: true }])); }, keepOpen: true },
    { label: 'Delegate a due duty', run: () => { const due = D.loops.filter(l => l.state === 'due'), subs = D.subs().slice(0, 9); if (!due.length || !subs.length) { say(!subs.length ? 'No one to delegate to.' : 'Nothing due to delegate.', 'warn'); return; } H.openMenu('Delegate which?', due.map(l => ({ label: l.label, run: () => H.openMenu(`Delegate "${l.label}" to`, subs.map(p => ({ label: `${p.short} — ${p.title}`, note: `trust ${Math.round(D.trust(p) * 100)}%`, run: () => { const r = D.delegate(p, l.id); if (!r.ok && !r.refused) say(r.why, 'warn'); } }))), keepOpen: true }))); }, keepOpen: true },
    { label: 'Report to the bridge', run: () => { const done = D.loops.filter(l => l.last); H.openMenu('Report which?', done.flatMap(l => [{ label: `${l.label} — honest`, run: () => D.report(l.id, true) }, ...(l.last !== 'proper' ? [{ label: `${l.label} — "all fine"`, run: () => D.report(l.id, false) }] : [])]).concat(done.length ? [] : [{ label: 'Nothing to report yet', off: true }])); }, keepOpen: true },
    { label: 'Show the whole board (B)', run: () => { H.big = !H.big; H.renderBoard(); } },
  ];
  H.openMenu('Duty menu', top);
}


// ---- death in Systems Nominal: you are not out of the run, you pick someone else to be. End of watch: summary.
function summaryHTML(title, lead) {
  const D = G.duty, sm = D.summary(), ph = G.phases?.status(), mp = D.missionProgress(ph?.index || 0), md = MISSIONS[G.mission] || G.mission;
  const chain = [...D.chain]; if (ph?.label) chain.unshift(`${ph.label} reached ${ph.phase} (${Math.round(ph.severity * 100)}% severity)`);
  return `<h2>${title}</h2><div>${lead}</div><h4>Mission</h4><div>${md} — crew tasks ${mp.pct}% on track, your duties ${sm.score}% (${sm.stats.proper} proper, ${sm.stats.rushed} rushed, ${sm.stats.faked} faked, ${sm.stats.skipped} skipped)</div>
    <h4>What happened</h4>${chain.length ? chain.map(c => `<div class="c">${c.replace(/[&<>]/g, '')}</div>`).join('') : '<div class="c">Nothing went wrong that you could be blamed for.</div>'}
    <h4>Crew opinion of you</h4><div>${Math.round(sm.trust * 100)}% trust · ${sm.stats.caught} times caught · ${sm.stats.orders} orders (${sm.stats.refused} refused) · ${sm.stats.delegated} delegated</div>`;
}
function nomDie(cause) {
  if (G.phase === 'nomdead' || !G.duty) return; G.phase = 'nomdead'; document.exitPointerLock?.(); sound.death?.(); G.hp = 0; $('danger').style.opacity = 0;
  const old = G.player; old.status = 'dead'; G.duty.chain.push(`${old.short} (${old.title}) died: ${cause}`);
  const near = G.roster.people.filter(p => !p.isPlayer && !['dead', 'corpse', 'crazed', 'evacuated'].includes(p.status));
  const mine = near.filter(p => p.dept === old.dept), pool = [...mine.slice(0, 3), ...near.filter(p => !mine.includes(p)).sort((a, b) => b.rank - a.rank).slice(0, 3)].slice(0, 5);
  G.hud2.showEnd(summaryHTML(`${old.short} is dead`, `${old.full || old.short}, ${old.title} — ${cause}.`) + '<h4>Carry on</h4>', [...pool.map(p => ({ label: `Continue as ${p.short} (${p.title})`, run: () => switchPlayer(p) })), { label: 'Back to the menu', run: () => toMenu() }]);
}
function nomEnd() {
  if (G.phase === 'nomend' || G.phase === 'nomdead' || !G.duty) return; G.phase = 'nomend'; document.exitPointerLock?.();
  const ph = G.phases.status(); G.hud2.showEnd(summaryHTML('Watch ended', `Twenty minutes on ${G.ship.name}. The ship is ${ph.phase === 'nominal' ? 'in good order' : ph.phase}.`), [{ label: 'New watch', run: () => newRun() }, { label: 'Back to the menu', run: () => toMenu() }]);
}
function toMenu() { G.hud2?.hideEnd(); G.hud2?.destroy(); G.hud2 = null; G.phase = 'title'; showScreen('title'); }
function switchPlayer(p) {
  const at = G.sim.where(p), old = G.player; old.isPlayer = false; p.isPlayer = true; G.player = p; G.sim.setPlayer(p); G.comms?.sim.setPlayer(p);
  const nd = new Duty({ player: p, roster: G.roster, clock: G.comms.clock, sim: G.sim, duties: DUTIES, shipState: G.shipState, say: G.duty.say, seed: G.runSeed, mission: G.mission }).inherit(G.duty);
  G.duty = nd; G.phases.duty = nd; G.hud2.attach(nd); G.hp = G.maxHp; G.stamina = 100; G.hud2.hideEnd(); hideScreens(); fade(0);
  loadDeck(Math.min(G.ship.decks, Math.max(1, at?.deckNo ?? 1))); G.phase = 'play'; requestLock(); G.say(`You are now ${p.full || p.short}, ${p.title}.`, 'good');
}


// ---- conversation menu, terminals, carry/give (Systems Nominal)
function talkMenu(e) {
  const pr = e.person, D = G.duty, H = G.hud2, me = G.player, bk = commsData().billets?.[pr.billet]?.bark || {}, rank = me.rank - pr.rank;
  const say = (text) => { G.say(`${pr.short}: ${text}`, 'npc'); try { speak(pr, text); } catch (er) { } };
  const pool = (rank > 0 ? bk.greetHi : rank < 0 ? bk.greetLo : bk.greet) || bk.greet || [], pickOf = (a, f) => a?.length ? a[Math.floor(Math.random() * a.length)] : f;
  const w = G.sim?.where(pr), act = (w?.activity || 'my work').replace(/_/g, ' '), t = D.trust(pr), mood = t > 0.7 ? 'warm' : t < 0.3 ? 'cold' : 'neutral';
  const opts = [
    { label: 'Greet them', run: () => say(pickOf(pool, voiceBark(pr, 'idle'))) },
    { label: 'Ask what they are doing', run: () => say(`${act.charAt(0).toUpperCase() + act.slice(1)}${w?.room ? ` — ${w.room}` : ''}. ${mood === 'cold' ? 'Anything else, sir?' : mood === 'warm' ? 'Good to see you.' : ''}`.trim()) },
    { label: 'Ask about their duty', run: () => { const l = DUTIES.billets?.[pr.billet]?.loops?.[0]; say(l ? `Mostly ${l.label.toLowerCase()}, every so often. ${DUTIES.billets[pr.billet].rules?.[0] ? '' : ''}` : 'Keeping the ship running.'); } },
    { label: 'Ask how they feel about you', run: () => say(mood === 'warm' ? 'You pull your weight. That counts for a lot here.' : mood === 'cold' ? 'I hear things. Make sure they are not true.' : 'Fine, I suppose. Ask me again later.') },
    { label: 'Ask who they hang out with', run: () => say(G.social ? G.social.talkLine(pr, me) : 'Whoever is on my watch, I suppose.') },   // js/social.js
  ];
  if (D.subs().includes(pr)) opts.push({ label: 'Order them to do their duty', run: () => { const r = D.order(pr, null); if (!r.ok && !r.refused) G.say(r.why, 'warn'); } });
  else opts.push({ label: 'Ask for a hand with your duty', run: () => { const r = D.askHelp(pr); if (!r.ok && !r.refused) G.say(r.why, 'warn'); } });
  if (G.carry && G.haul) opts.push(...G.haul.talkOpts(e, say, D));   // give / offer food / treat with a medkit (js/haul.js)
  else if (G.carry) opts.push({ label: `Give them: ${G.carry.name}`, run: () => { D._bump(pr, 0.06); say(pickOf(['Oh — thanks. I was looking for that.', 'Appreciated.', 'Where did you find this? Thank you.'], 'Thanks.')); G.say(`You give ${G.carry.name} to ${pr.short}.`, 'good'); G.carry = null; } });
  H.openMenu(`${pr.short} — ${pr.title}`, opts, `trust ${Math.round(t * 100)}% · digit to choose · Esc to leave`);
}
function terminalMenu() {
  const H = G.hud2, D = G.duty, S = G.shipState; if (S.status('computer') === 'offline') { G.say('The terminal is dead. Computer Core offline.', 'warn'); return; }
  const rows = (title, list, hint) => H.openMenu(title, list.length ? list.map(l => ({ label: l, off: true })) : [{ label: 'Nothing to show.', off: true }], hint);
  H.openMenu('Ship terminal', [
    { label: 'Ship status', keepOpen: true, run: () => rows('Ship status', SYSTEMS.filter(s => S.status(s.id) !== 'nominal').map(s => `${s.name}: ${S.status(s.id)}`).concat(S.faulted().length ? [] : ['All systems nominal.']), `phase: ${G.phases?.phase || 'nominal'} · Backspace back`) },
    { label: 'Mission progress', keepOpen: true, run: () => { const mp = D.missionProgress(G.phases?.index || 0); rows(`Mission: ${G.mission.replace(/_/g, ' ')}`, [`Crew tasks on track: ${mp.pct}% (${mp.done}/${mp.due} due)`, ...D.tasks.map(t => `${t.state === 'done' ? '✓' : t.state === 'missed' ? '✗' : '·'} ${t.task} (${t.room})`)]); } },
    { label: 'Locate crew', keepOpen: true, run: () => { const who = [...D.subs().slice(0, 4), ...G.roster.people.filter(p => ['co', 'xo', 'ce', 'cmo', 'cso', 'cos'].includes(p.billet) && !p.isPlayer)].slice(0, 9); H.openMenu('Locate whom?', who.map(p => ({ label: `${p.short} — ${p.title}`, keepOpen: true, run: () => { const w = G.sim?.where(p); rows(p.short, [w ? (w.transit ? `In transit${w.deckNo ? ' on deck ' + w.deckNo : ' (tubelift)'}` : `Deck ${w.deckNo}, ${w.room}`) + ` — ${(w.activity || '').replace(/_/g, ' ')}` : 'Not on the roster board.']); } }))); } },
    { label: 'Alert log', keepOpen: true, run: () => rows('Active alerts', (G.comms?.alerts?.active() || []).map(a => `${a.def.label}: ${a.def.meaning.slice(0, 70)}`).concat(G.comms?.alerts?.active().length ? [] : ['Condition green.'])) },
  ], 'digit to choose · Esc to leave');
}
// nearby crew greet you now and then, with their own profile barks
function ambientBarks(dt) {
  G.barkT = (G.barkT || 0) - dt; if (G.barkT > 0 || G.phase !== 'play') return; G.barkT = 6 + Math.random() * 10;
  const e = ents.find(e => e.simmed && Math.hypot(e.x - P.x, e.z - P.z) < 4.2 && world.los(P.x, P.z, e.x, e.z) && (!e.barked || G.time - e.barked > 60)); if (!e || Math.random() < 0.35) return;
  e.barked = G.time; const pr = e.person, bk = commsData().billets?.[pr.billet]?.bark || {}, rank = G.player.rank - pr.rank, pool = (rank > 0 ? bk.greetHi : rank < 0 ? bk.greetLo : bk.greet) || bk.greet;
  const text = pool?.length ? pool[Math.floor(Math.random() * pool.length)] : voiceBark(pr, 'idle'); G.say(`${pr.short}: ${text}`, 'npc'); try { speak(pr, text); } catch (er) { }
}

// ---------------- run control ----------------
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

let DUTIES = { billets: {} };
async function loadDuties() { try { DUTIES = await (await fetch('./assets/data/duties.json')).json(); } catch (e) { console.warn('duties not loaded', e); } return DUTIES; }

function newRun() {
  Object.assign(G, { hp: 100, maxHp: 100, stamina: 100, phaser: 3, maxPhaser: 3, perks: {}, tribbles: 0, kills: 0, stuns: 0, time: 0, endless: false, runSeed: Math.floor(Math.random() * 1e6) });
  G.shipOrder = shuffle(SHIPS.map((_, i) => i));
  G.ship = SHIPS[G.forceShip ?? G.shipOrder[0]];
  G.roster = makeComplement(G.ship, G.runSeed); for (const p of G.roster.people) p.uniform = G.roster.uniformOf(p);
  { const forced = new URLSearchParams(location.search).get('billet'); G.player = NOM() ? pickBillet(G.roster, G.runSeed, forced) : (G.roster.byBillet.comp?.[0] || G.roster.people[G.roster.people.length - 1]); if (NOM()) { G.player.isPlayer = true; G.mission = pickMission(G.runSeed); } }   // Systems Nominal: you are dealt a random billet; the old mode keeps a stable crew member whose voice speaks for you
  G.liftRnd = mulberry32((G.runSeed ^ 0x11f7a3) >>> 0);
  G.shipState = new ShipState(G.ship, G.runSeed); G.shipState.auto = false; if (NOM()) for (const sy of SYSTEMS) G.shipState.repair(sy.id); /* Systems Nominal: nothing is broken when you start */ G.fx = G.shipState.effects(); G.shipState.on(onShipEvent);
  G.director = NOM() ? null : new Director();   // no pacing pressure in Systems Nominal
  G.comms?.destroy(); G.comms = NOM() ? createShipComms({ roster: G.roster, shipState: G.shipState, seed: G.runSeed, mission: G.mission, player: G.player, sound: { alertTone: (p) => { if (G.fx?.alert !== false) sound.alertTone(p); } }, G, onLighting: (on) => { if (world && (!on || G.fx?.alert !== false)) world.setAlert(on); }, urlAlert: new URLSearchParams(location.search).get('alert') }) : null;   // bridge comms + alerts: Systems Nominal only
  document.body.classList.toggle('nominal', NOM()); P.torch = !NOM(); torch.visible = P.torch; if (beamCone) beamCone.visible = P.torch && CFG.quality === 'high';
  if (NOM()) { const decks = genShip(G.ship, G.runSeed); G.plan = shipPlan(G.ship, G.runSeed, decks); G.shipDecks = decks.map((data, i) => ({ idx: i, data, used0: new Set(data.used), st: { sites: new Set(), explored: null } })); }
  else { G.plan = null; G.shipDecks = null; }
  G.sim = NOM() ? new CrewSim({ roster: G.roster, clock: G.comms.clock, plan: G.plan, data: commsData(), seed: G.runSeed, decks: G.ship.decks }) : null; if (G.sim) G.sim.setPlayer(G.player);
  G.social = G.sim ? generateSocial(G.roster, { seed: G.runSeed, plan: G.plan, data: commsData(), clock: G.comms.clock, ship: G.ship }) : null; if (G.social) G.sim.setSocial(G.social);   // js/social.js: groups, friendships, rivalries (before setupDuty: seeds trust)
  setupDuty();
  hideScreens(); fade(0);
  loadDeck(1);
  if (NOM() && G.duty && !navigator.webdriver && new URLSearchParams(location.search).get('brief') !== '0') { G.phase = 'briefing'; document.exitPointerLock?.(); G.hud2.showBriefing(makeBriefing(G.player, G.roster, G.mission, DUTIES, MISSIONS), () => { G.phase = 'play'; requestLock(); }); return; }
  requestLock();
  G.phase = 'play';
}

function requestLock() {
  sound.init();
  try { const r = canvas.requestPointerLock?.(); if (r && r.catch) r.catch(() => { }); } catch (e) { }
}
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked && G.phase === 'play') { G.phase = 'paused'; showScreen('pause'); }
});

function completeDeck() {
  G.phase = 'lift'; sound.lift(); fade(1, 900);
  G.hp = Math.min(G.maxHp, G.hp + 20);
  setTimeout(() => {
    if (G.deck >= winDeck() && !G.endless) {
      document.exitPointerLock?.();
      $('winstats').innerHTML = `${winDeck()} decks of the ${G.ship.name} · ${G.tribbles} furbles rescued · ${G.stuns} hostiles stunned<br>Time on shift ${fmtTime(G.time)}`;
      localStorage.setItem('fb_best', Math.max(G.best, G.deck)); G.best = Math.max(G.best, G.deck);
      showScreen('win'); G.phase = 'win'; return;
    }
    offerPerks();
  }, 1000);
}

function offerPerks() {
  document.exitPointerLock?.();
  const avail = PERKS.filter(p => perk(p.id) < p.max);
  const choices = shuffle(avail.slice()).slice(0, 3);
  const cards = $('cards'); cards.innerHTML = '';
  choices.forEach((p, i) => {
    const el = document.createElement('div'); el.className = 'card';
    el.innerHTML = `<svg class="pi" viewBox="0 0 40 40"><use href="#pk-${p.id}"/></svg><h3>${i + 1}. ${p.name}</h3><p>${p.desc}</p><small>${perk(p.id) ? 'Owned ×' + perk(p.id) : 'New'}</small>`;
    el.onclick = () => choosePerk(p.id); cards.appendChild(el);
  });
  G.perkChoices = choices.map(p => p.id);
  showScreen('perkscreen'); G.phase = 'perk';
}
function choosePerk(id) {
  if (G.phase !== 'perk') return;
  G.perks[id] = perk(id) + 1;
  if (id === 'hypo') { G.maxHp += 25; G.hp = Math.min(G.maxHp, G.hp + 25); }
  if (id === 'cell') { G.maxPhaser++; G.phaser++; }
  hideScreens(); fade(0, 600);
  loadDeck(G.deck + 1); requestLock(); G.phase = 'play';
}
function fmtTime(s) { s |= 0; return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

function die(by, line = null) {
  G.phase = 'dying'; G.dyingT = 0; sound.death(); document.exitPointerLock?.();
  bloodBurst(P.x, 1.0, P.z, 120, 5); for (let i = 0; i < 6; i++) decals.floor('blood', P.x + (Math.random() - 0.5) * 2, P.z + (Math.random() - 0.5) * 2, 1.2 + Math.random(), 1);
  screenSplat(14, true); sound.roar(0.35); by.roar = 1.5; $('danger').style.opacity = 1; $('prompt').textContent = '';
  const deckReached = G.deck;
  if (deckReached > G.best) { G.best = deckReached; localStorage.setItem('fb_best', deckReached); }
  $('deathline').textContent = line || pick(DEATH_LINES);
  $('stats').innerHTML = [['Last known position', `Deck ${deckReached} · ${ship.name}`], ['Registry', ship.reg], ['Cause', by?.name || 'Unknown'], ['Furbles rescued', G.tribbles], ['Hostiles stunned', G.stuns], ['Time on shift', fmtTime(G.time)], ['Best run', `Deck ${G.best}`]].map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join('');
  setTimeout(() => showScreen('dead'), 2400);
}

// callbacks used by Gorn AI
G.onEnemyStep = (g, d) => { if (d < 30) { sound.thud(Math.max(0.04, 0.4 - d * 0.013)); if (d < 11) P.shake = Math.max(P.shake, (11 - d) / 11 * 0.35); } };
G.onEnemySpotted = (g) => { flash('#600', 0.35); G.say(g.name.toUpperCase() + ' SEES YOU — RUN', 'warn'); };
G.bloodAt = (x, y, z, n) => bloodBurst(x, y, z, n, 3);
G.canBeAttacked = () => G.phase === 'play' && invuln <= 0 && !(P.clung > 0);
G.isClung = () => P.clung > 0;
G.drainStamina = (n) => { G.stamina = Math.max(0, G.stamina - n); };
G.glitch = (sec) => { G.glitchT = sec; };
G.clingOn = (c) => { G.director?.bump(0.3, 'face-hugged'); P.clung = 4.5; P.clungMax = 4.5; G.say('SOMETHING IS ON YOUR FACE! Mash E to tear it off!', 'warn'); $('clung').style.opacity = 1; sound.squelch(); G.hp -= 6; flash('#600', 0.5); bloodBurst(P.x, 1.5, P.z, 20, 2); if (G.hp <= 0) die(c); };
G.dragDown = (e) => { G.director?.bump(0.2, 'dragged down'); const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz) || 1; P.kbx = -dx / d * 9 * G.fx.knockMul; P.kbz = -dz / d * 9 * G.fx.knockMul; P.vy = 2; P.grounded = false; if (P.mode !== 'grapple') P.mode = 'air'; P.shake = 0.5; G.hp -= 6; flash('#c00', 0.4); sound.hit(); G.say(e.name + ' drags you down!', 'warn'); updateHUD(); if (G.hp <= 0) die(e); };
G.hitPlayer = (gorn, dmg) => {
  if (invuln > 0 || G.phase !== 'play') return;
  G.director?.bump(0.35, 'hit by ' + gorn.kind);
  if (G.shield) { G.shield = false; G.say('Deflector absorbed the hit!', 'good'); flash('#39f', 0.5); sound.hit(); }
  else { G.hp -= dmg; flash('#c00', 0.7); sound.hit(); G.say(gorn.name + ' attacks!', 'warn'); }
  P.shake = 0.6; invuln = 1.2;
  if (!G.shield || G.hp < G.maxHp) { bloodBurst(P.x, 1.2, P.z, 60, 4, Math.sin(gorn.yaw) * 2, Math.cos(gorn.yaw) * 2); decals.floor('blood1', P.x, P.z, 1.4, 1); sound.squelch(); screenSplat(4); gorn.bloodTrail = 14; }
  const dx = P.x - gorn.x, dz = P.z - gorn.z, d = Math.hypot(dx, dz) || 1;
  const kb = (perk('dampener') ? 4 : 8) * G.fx.knockMul; P.kbx = dx / d * kb; P.kbz = dz / d * kb;
  if (gorn.cfg) { gorn.attackCd = Math.max(gorn.attackCd, gorn.cfg.atkCd); gorn.state = S.SEARCH; gorn.timer = 4; }
  if (G.hp <= 0) die(gorn);
  updateHUD();
};

// ---------------- input ----------------
addEventListener('keydown', (e) => {
  if (e.code === 'Tab') { e.preventDefault(); if (!e.repeat && G.phase === 'play') showStatus(true); }
  if (!e.repeat) { if (e.code === 'Space') pressed.jump = true; if (e.code === 'KeyC' || e.code === 'ControlLeft') pressed.crouch = true; }
  keys[e.code] = true;
  if (G.phase === 'select') { const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code); if (m && +m[1] >= 1 && +m[1] <= G.ship.decks) chooseDeck(+m[1] - 1); else if (e.code === 'Escape' || e.code === 'KeyE') closeLiftPanel(); }
  if (G.phase === 'perk') { const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code); if (i >= 0 && G.perkChoices[i]) choosePerk(G.perkChoices[i]); }
  if (G.phase === 'play') {
    if (e.code === 'KeyF') { P.torch = !P.torch; torch.visible = P.torch; if (beamCone) beamCone.visible = P.torch && CFG.quality === 'high'; sound.flick(); }
    if (e.code === 'KeyG' && NOM() && G.carry && !G.haul?.putDown()) { G.say(`You put ${G.carry.name} down.`); G.carry = null; }   // onto a cart / surface in js/haul.js
    if (e.code === 'KeyR' && NOM()) G.haul?.takeFromCart();
    if (e.code === 'KeyV' && G.kit) { if (e.shiftKey && G.kit.inst) { const st = G.kit.cycleSetting(); if (st) G.say(`Setting: ${st}`); } else G.kit.cycle(); }   // handhelds: V switch (Shift+V phaser setting), X use, T throw
    if (e.code === 'KeyX' && G.kit) G.kit.useJob();
    if (e.code === 'KeyT' && G.kit) G.kit.throwIt();
    if (e.code === 'KeyM') { mapOn = !mapOn; $('minimap').style.display = mapOn ? '' : 'none'; }
    if (e.code === 'KeyE') { if (P.clung > 0) { P.clung -= 0.8; sound.squelch(); bloodBurst(P.x, 1.5, P.z, 6, 1.5); } else interact(); }
    if (e.code === 'KeyQ' && !e.repeat) fireGrapple();
  }
  if ((e.code === 'Enter') && (G.phase === 'dead' || G.phase === 'title')) newRun();
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'Tab') showStatus(false); });
addEventListener('mousemove', (e) => {
  if (!locked || (G.phase !== 'play' && G.phase !== 'ride')) return;
  P.yaw -= e.movementX * 0.0022 * CFG.sens; P.pitch = Math.max(-1.45, Math.min(1.45, P.pitch - e.movementY * 0.0022 * CFG.sens));
});
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousedown', (e) => { if (G.phase === 'play' && locked && e.button === 2) fireGrapple(); else if (G.phase === 'play' && locked && e.button === 0) fire(); else if (G.phase === 'paused' && !e.target.closest('.settings, .noresume')) resumeGame(); else if (G.phase === 'play' && !locked && !e.target.closest('#liftui')) requestLock(); });
function resumeGame() { hideScreens(); G.phase = 'play'; requestLock(); }
$('sens').oninput = (e) => { CFG.sens = +e.target.value; saveCfg(); };
$('vol').oninput = (e) => { CFG.vol = +e.target.value; sound.setVolume(CFG.vol); saveCfg(); };
$('qsel').onchange = (e) => setQuality(e.target.value);
$('vsel').onchange = (e) => { setVoiceMode(e.target.value); if (G.player) speak(G.player, 'Crew voice check.'); };
$('vsel').value = voiceMode(); $('sens').value = CFG.sens; $('vol').value = CFG.vol; $('qsel').value = CFG.quality;
if (CFG.quality === 'low') setQuality('low');
$('resume').onmousedown = (e) => e.stopPropagation();
$('credbtn').onclick = () => showScreen('credits'); $('companybtn').onclick = (e) => { e.stopPropagation(); showCompany(); }; $('companyback').onclick = (e) => { e.stopPropagation(); showScreen('pause'); }; $('credback').onclick = () => showScreen('title');
$('begin').onclick = newRun; $('again').onclick = newRun; $('again2').onclick = newRun; $('resume').onclick = resumeGame;
$('cont').onclick = () => { G.endless = true; hideScreens(); fade(0, 600); offerPerks(); };

// ---------------- actions ----------------
const _v = new THREE.Vector3(), _f = new THREE.Vector3();
function fire() {
  if (G.phase === 'play' && G.kit?.inst && G.kit.attack()) return;   // a handheld in hand: phaser shot or improvised swing (js/kit.js)
  if (G.phase !== 'play' || shot > 0 || NOM()) return;   // no zapper in Systems Nominal
  if (G.phaser <= 0) { sound.empty(); G.say('Zapper depleted — find a power cell', 'warn'); shot = 0.3; return; }
  gunKick = 1; G.phaser--; shot = 0.45; sound.phaser(); noiseNow = Math.max(noiseNow, 16); updateHUD();
  camera.getWorldDirection(_f);
  const eye = camera.position;
  let hit = null, hitD = 40;
  for (const g of gorns) {
    if (!g.active || (g.state === S.STUNNED && !g.mad)) continue;
    _v.set(g.x - eye.x, g.hitY + (g.y || 0) - eye.y, g.z - eye.z); const d = _v.length(); _v.normalize();
    const ang = Math.acos(Math.max(-1, Math.min(1, _v.dot(_f))));
    if (d < 28 && ang < Math.atan2(g.hitR, d) + 0.04 && world.los(eye.x, eye.z, g.x, g.z) && d < hitD) { hit = g; hitD = d; }
  }
  // beam visual
  const end = hit ? new THREE.Vector3(hit.x, hit.hitY + (hit.y || 0), hit.z) : eye.clone().addScaledVector(_f, 12);
  const start = eye.clone().add(new THREE.Vector3(0.25, -0.22, 0).applyQuaternion(camera.quaternion)).addScaledVector(_f, 0.4);
  beam.geometry.setFromPoints([start, end]); beam.visible = true; beamT = 0.12;
  if (hit && hit.mad && --hit.hp <= 0) { killMad(hit); return; }
  if (hit) {
    const r = hit.stunFor(4 + perk('overload') * 3); G.stuns++;
    const msg = hit.kind === 'drone' ? (r === 'adapted' ? 'The drone has ADAPTED to your zapper!' : 'Drone stunned — it will adapt. Run.') :
      hit.kind === 'phantom' ? 'Hologram dissolved… for now.' : hit.kind === 'clinger' ? 'Splat. One less ceiling-dweller.' : hit.mad ? `${hit.person.short} is down — one more shot ends it.` : `Direct hit! ${hit.name} is stunned — RUN`;
    G.say(msg, 'good'); flash('#fa5', 0.25);
  }
}

function interact() {
  if (nearestRepair()) return;   // E is held to repair; handled in step()
  if (NOM() && G.haul?.interact()) return;   // grab / let go of a cart, pick a put-down item back up
  const near = nearest(2.2, e => ['crew', 'body', 'emh'].includes(e.kind) && !e.used);
  if (near && NOM() && near.kind === 'crew' && near.person && !near.fake && G.hud2) { talkMenu(near); return; }
  if (!near && NOM() && G.hud2) {
    const lp = lookedPropObj(); if (lp && (lp.kind === 'console' || lp.kind === 'servers')) { terminalMenu(); return; }
    const c = !G.carry && nearestClutter(); if (c && world.takeClutter(c)) { G.carry = { name: c.name, real: c.real, item: classifyItem(c.name, c.real) }; sound.pickup(); G.say(`You take: ${c.name}. [G] put it down`, 'good'); return; }
  }
  if (near) {
    near.used = true; sound.pickup();
    if (near.kind === 'crew' && near.fake) {
      scene.remove(near.mesh); ents.splice(ents.indexOf(near), 1); if (near.person) near.person.status = 'dead';   // the real one is long gone
      const en = makeEnemy('slimeling', world, world.tile(near.x, near.z), G.deck, 0, scene, sound, near.person ? { human: { person: near.person, uniform: near.person.uniform, rank: near.person.rank } } : {}); en.yaw = near.mesh.rotation.y; en.state = S.PATROL; en.mesh.visible = true; en.x = near.x; en.z = near.z; en.pickPatrol(P); en.state = S.CHASE; en.timer = 6; en.setTarget(...world.tile(P.x, P.z)); gorns.push(en);
      G.say('"Hello fellow crewman! I am definitely not— *SCHLOOORP*"', 'warn'); sound.shriek(0.3); flash('#240', 0.4); P.shake = 0.5; return;
    }
    if (near.kind === 'crew') {
      const pr = near.person, who = pr ? `${pr.short}, ${pr.title}` : 'Crewman';
      if (near.repairing) { near.used = false; G.say(`${who}: "Cover me — ${SYS[near.repairing.sys].name} is ${Math.floor(near.repairing.t / near.repairing.need * 100)}% there. Keep that thing off me."`, 'npc'); return; }
      const line = pr && Math.random() < 0.7 ? pick(DEPT_LINES[pr.dept]) : pick(REDSHIRT_LINES);
      if (G.fx.evac && !NOM()) {   // transporters up: beam them to safety
        G.say(`${who}: ${line} — Transporter room, one to beam out!`, 'npc'); if (pr) pr.status = 'evacuated';
        for (let i = 0; i < 40; i++) sparks.add(near.x + (Math.random() - 0.5) * 0.6, Math.random() * 1.9, near.z + (Math.random() - 0.5) * 0.6, 0, 0.4 + Math.random(), 0, BEAM, 0.9);
        sound.tone(880, 0.9, 'sine', 0.06, 600); setTimeout(() => { scene.remove(near.mesh); const i = ents.indexOf(near); if (i >= 0) ents.splice(i, 1); }, 650); giveLoot();
      } else { G.say(`${who}: ${line}`, 'npc'); if (pr) pr.status = 'alive'; if (Math.random() < 0.6) giveLoot(); }
    } else if (near.kind === 'body') { const pr = near.person; if (pr && pr.status !== 'dead') pr.status = 'dead'; G.say(pr ? `${pr.full}, ${pr.title} (${DEPT[pr.dept].name}). Dead. You take what they had.` : 'You search the crewman\'s body…', 'npc'); giveLoot(true); }
    else if (near.kind === 'emh' && !G.fx.emh) { G.say('The emitter crackles. No hologram. (Medical Hologram offline)', 'warn'); near.used = false; }
    else if (near.kind === 'emh') { G.say('Hologram: "Please describe your medical emergency. Or don\'t. I\'m a projection, not a mind-reader." (healed)', 'good'); G.hp = Math.min(G.maxHp, G.hp + 50); sound.heal(); }
    updateHUD(); return;
  }
  const site = nearestSite();
  if (site) {
    site.used = true; sound.pickup();
    const r = searchFixture(site.room, site.kind);
    if (r) { G.say(r.text, 'npc'); if (r.loot === 'heal') { G.hp = Math.min(G.maxHp, G.hp + 15); setTimeout(() => G.say('Found a hypospray (+15 health)', 'good'), 900); sound.heal(); } else if (r.loot === 'cell') { G.phaser = Math.min(G.maxPhaser, G.phaser + 1); setTimeout(() => G.say('Found a zapper power cell (+1)', 'good'), 900); } }
    else G.say(`${fixtureName(site.kind)}: nothing useful.`, 'npc');
    updateHUD(); return;
  }
  // lift
  if (world && Math.hypot(P.x - world.liftPos.x, P.z - world.liftPos.z) < 2.8) {
    if (G.fx.liftLocked) { sound.denied(); G.say('Tubelift controller OFFLINE — repair it at the lift controls (hold E)', 'warn'); }
    else if (NOM()) { if (inCarTile()) openLiftPanel(); }
    else if (G.chips >= world.d.chips.length) completeDeck();
    else { sound.denied(); G.say(`Tubelift offline — ${world.d.chips.length - G.chips} logic chip(s) missing`, 'warn'); }
  }
}
// the nearest unsearched wall fixture within reach that the player is facing
function nearestSite() {
  if (!world?.searchSites) return null;
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); let best = null, bd = 1.9;
  for (const s of world.searchSites) { if (s.used) continue; const dx = s.x - P.x, dz = s.z - P.z, d = Math.hypot(dx, dz); if (d < bd && (dx * fx + dz * fz) / (d || 1) > 0.35) { bd = d; best = s; } }
  return best;
}
// true when the real-world equivalent adds nothing to the name
const same = (a, b) => !b || a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase());
// loose clutter in reach and in front of the player
function nearestClutter() {
  if (!world?.clutter) return null;
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); let best = null, bd = 2.0;
  for (const c of world.clutter) { const dx = c.x - P.x, dz = c.z - P.z, d = Math.hypot(dx, dz); if (d < bd && (dx * fx + dz * fz) / (d || 1) > 0.8) { bd = d; best = c; } }
  return best;
}
// the prop under the crosshair (within reach): its inventory name and real-world equivalent
function lookedProp() {
  if (!world) return null;
  const o = camera.position, dir = camera.getWorldDirection(new THREE.Vector3()), h = world.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, 3.6);
  if (!h || h.kind !== 'prop') return null;
  const p = world.d.props.find(p => p.tx === h.tx && p.ty === h.ty); if (!p) return null;
  const e = examineProp(world.d.room[p.ty][p.tx] || 'corridor', p.kind, p.tx, p.ty); return e ? { name: e[0], real: e[1] } : null;
}
function lookedPropObj() {
  if (!world) return null; const o = camera.position, dir = camera.getWorldDirection(new THREE.Vector3()), h = world.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, 3.0);
  return h && h.kind === 'prop' ? world.d.props.find(p => p.tx === h.tx && p.ty === h.ty) || null : null;
}
function giveLoot(forced) {
  const r = Math.random();
  if (r < 0.45) { G.phaser = Math.min(G.maxPhaser, G.phaser + 1); setTimeout(() => G.say('Found a zapper power cell (+1)', 'good'), 1200); }
  else if (r < 0.8 || forced) { G.hp = Math.min(G.maxHp, G.hp + 25); setTimeout(() => G.say('Found a hypospray (+25 health)', 'good'), 1200); sound.heal(); }
}
function nearest(r, pred) {
  let best = null, bd = r;
  for (const e of ents) { if (pred && !pred(e)) continue; const d = Math.hypot(e.x - P.x, e.z - P.z); if (d < bd) { bd = d; best = e; } }
  return best;
}

// ---------------- minimap ----------------
const mm = $('minimap'), mctx = mm.getContext('2d');
function drawMap() {
  if (!mapOn || !world) return;
  const W = world.W, H = world.H, s = mm.width / Math.max(W, H);
  mctx.clearRect(0, 0, mm.width, mm.height);
  const ex = world.explored;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!ex[x + y * W]) continue;
    mctx.fillStyle = world.grid[y][x] === 1 ? '#2a3050' : (world.d.room[y][x] ? '#4a5a8a' : '#6a7aa8');
    mctx.fillRect(x * s, y * s, Math.ceil(s), Math.ceil(s));
  }
  if (G.fx.mapOff) { for (let i = 0; i < 260; i++) { const v = Math.random() * 90 | 0; mctx.fillStyle = `rgb(${v},${v},${v + 30})`; mctx.fillRect(Math.random() * mm.width, Math.random() * mm.height, 2, 2); } mctx.fillStyle = '#f66'; mctx.font = '8px monospace'; mctx.fillText('CORE OFFLINE', 4, 10); }
  const R = (7 + perk('tricorder') * 4) * G.fx.scanMul;
  const blip = (x, z, c, r = 1.4) => { mctx.fillStyle = c; mctx.beginPath(); mctx.arc(x / TS * s, z / TS * s, r, 0, 7); mctx.fill(); };
  if (G.fx.mapItems) for (const e of ents) if (e.kind === 'chip' && Math.hypot(e.x - P.x, e.z - P.z) < R * TS) blip(e.x, e.z, '#40ffa0');
  const lp = world.liftPos; const ld = Math.hypot(lp.x - P.x, lp.z - P.z);
  if ((G.fx.liftOnMap && ld < (R + 3) * TS) || world.explored[world.d.exit[0] + world.d.exit[1] * W]) blip(lp.x, lp.z, NOM() || G.chips >= world.d.chips.length ? '#6f6' : '#f55', 2);
  for (const r of repairPts) { const st = SHIP().status(r.sys); if (st === 'nominal') continue; const pulse = 1.6 + Math.sin(performance.now() / 160) * 0.8; mctx.fillStyle = st === 'offline' ? '#ff4a3a' : '#ffb347'; const x = r.x / TS * s, y = r.z / TS * s; mctx.beginPath(); mctx.moveTo(x, y - pulse - 1); mctx.lineTo(x + pulse + 1, y + pulse); mctx.lineTo(x - pulse - 1, y + pulse); mctx.fill(); }
  if (perk('scan') && G.fx.lifeScan) for (const g of gorns) if (g.active && Math.hypot(g.x - P.x, g.z - P.z) < 18) blip(g.x, g.z, '#f33', 2);
  blip(P.x, P.z, '#fff', 1.8);
  mctx.strokeStyle = '#fff'; mctx.beginPath(); mctx.moveTo(P.x / TS * s, P.z / TS * s); mctx.lineTo(P.x / TS * s - Math.sin(P.yaw) * 5, P.z / TS * s - Math.cos(P.yaw) * 5); mctx.stroke();
}

// ---------------- main loop ----------------
// flashlight volumetric cone (cheap fake: additive cone fading with distance)
beamCone = (() => {
  const c = document.createElement('canvas'); c.width = 4; c.height = 64; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
  const geo = new THREE.ConeGeometry(7, 15, 24, 1, true); geo.translate(0, -7.5, 0); geo.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.02, alphaMap: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.position.set(0.12, -0.1, 0); m.frustumCulled = false; camera.add(m); return m;
})();
// first-person zapper: procedural sidearm + hand (js/actors.js makeViewmodel)
let gunVM = null, gunKick = 0, muzzle = null, vm = null;
function buildViewmodel() {
  vm = makeViewmodel(); gunVM = vm.group; muzzle = vm.flash;
  gunVM.traverse(o => { if (o.isMesh) o.renderOrder = 10; });
  gunVM.rotation.set(0.05, 0.1, 0); gunVM.userData.baseRx = 0.05; gunVM.scale.setScalar(0.9);
  vmScene.add(gunVM); vmScene.environment = scene.environment; vmScene.environmentIntensity = 0.25; updateHUD();
}
let lastT = performance.now(), elapsed = 0; let acc = 0, mapT = 0, flickT = 0;
function step(dt, t) {
  if (shot > 0) shot -= dt;
  if (invuln > 0) invuln -= dt;
  if (beamT > 0) { beamT -= dt; beamMat.opacity = beamT / 0.12; if (beamT <= 0) beam.visible = false; }
  G.time += dt; G.deckTime += dt;

  // look fallback (arrow keys)
  if (keys.ArrowLeft) P.yaw += 2 * dt; if (keys.ArrowRight) P.yaw -= 2 * dt;
  if (keys.ArrowUp) P.pitch = Math.min(1.4, P.pitch + 1.5 * dt); if (keys.ArrowDown) P.pitch = Math.max(-1.4, P.pitch - 1.5 * dt);

  // movement
  let fx = 0, fz = 0;
  if (keys.KeyW) fz -= 1; if (keys.KeyS) fz += 1; if (keys.KeyA) fx -= 1; if (keys.KeyD) fx += 1;
  const moving = fx || fz;
  P.slow = P.clung > 0 ? 0.4 : 1;
  movePlayer(dt, P, world, { fx, fz, sprint: !!(keys.ShiftLeft || keys.ShiftRight), crouch: !!(keys.KeyC || keys.ControlLeft), crouchPressed: pressed.crouch, jump: pressed.jump && !(P.clung > 0), grappleCancel: pressed.grappleCancel }, moveApi);
  pressed.jump = pressed.crouch = pressed.grappleCancel = false;
  updateRope(dt);
  const speedNow = Math.hypot(P.vx, P.vz);

  // stamina
  const legs = perk('legs');
  if (P.sprint && P.grounded) G.stamina -= dt * (20 - legs * 3.5) * (1 - P.flow * 0.35); else if (P.mode === 'wallrun' || P.mode === 'grapple' || P.mode === 'mantle') { } else G.stamina = Math.min(100, G.stamina + dt * (14 + legs * 5) * (moving ? 0.6 : 1.2) * G.fx.staminaRegen);
  if (G.stamina < 0) G.stamina = 0;
  if (P.clung > 0) { P.clung -= dt; G.hp -= 2.5 * dt; $('clung').style.transform = `translate(${(Math.random() - 0.5) * 6}px,${(Math.random() - 0.5) * 6}px)`; if (P.clung <= 0) { $('clung').style.opacity = 0; G.say('You tear it off and hurl it away!', 'good'); bloodBurst(P.x, 1.5, P.z, 25, 3); if (G.hp <= 0) { die(gorns.find(g => g.kind === 'clinger') || gorns[0]); return; } } updateHUD(); }
  if (G.glitchT > 0) G.glitchT -= dt;

  // footsteps / noise
  P.stepD += speedNow * dt;
  const stride = P.sprint ? 1.5 : 1.9;
  if (P.stepD > stride && speedNow > 0.8 && (P.grounded || P.mode === 'wallrun') && P.mode !== 'slide') {
    P.stepD = 0;
    if (world.flooded) { sound.splash(P.crouch ? 0.05 : P.sprint ? 0.2 : 0.11); for (let i = 0; i < (P.sprint ? 10 : 5); i++) water.add(P.x + (Math.random() - 0.5) * 0.4, 0.08, P.z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 1.4, 1.2 + Math.random() * 1.2, (Math.random() - 0.5) * 1.4, WATER, 0.6); }
    else sound.step(P.crouch ? 0.05 : P.sprint ? 0.22 : 0.13);
  }
  const boots = 1 - perk('boots') * 0.3;
  const sneakNoise = !P.grounded ? 0 : speedNow < 0.5 ? 0 : P.mode === 'slide' ? 9 : P.crouch ? 2.5 : P.sprint ? 15 : 7;
  noiseNow = Math.max(noiseNow * (1 - dt * 3), sneakNoise * boots);
  P.bob += speedNow * dt * (P.sprint ? 1.8 : 1.5);

  slideTackle(dt);
  // gorn
  let tension = 0;
  for (const g of gorns) {
    g.update(dt, P, noiseNow, P.crouch, G);
    if (g.active && !g.quiet) {
      const d = Math.hypot(g.x - P.x, g.z - P.z);
      const t = Math.max(0, 1 - d / 22) * (g.state === S.STUNNED ? 0.3 : 1) * (g.state === S.CHASE ? 1.3 : 1);
      tension = Math.max(tension, t);
    }
  }
  tension = Math.min(1, tension);
  const chased = gorns.some(g => g.active && g.state === S.CHASE && g.kind !== 'drone' && g.kind !== 'phantom' && g.kind !== 'clinger');
  if (chased !== wasChased) { if (G.fx.alert) { world.setAlert(chased); if (chased) sound.klaxon(); } else world.setAlert(false); wasChased = chased; }
  G.comms?.tick(dt); nomTick(dt); G.kit?.tick(dt); updateShipSystems(dt, tension); updateMadness(dt); updateDirector(dt, tension); if (NOM()) { carStep(dt); riderStep(dt); }
  for (const g of gorns) if (g.bloodTrail > 0 && g.speed > 0.5) { g.trailD = (g.trailD || 0) + g.speed * dt; if (g.trailD > 1.1) { g.trailD = 0; g.bloodTrail--; decals.floor('blood1', g.x, g.z, 0.45, 1); } }
  sound.setTension(tension);
  $('danger').style.opacity = Math.max(0, tension - 0.3) * 1.1 + (G.hp < 35 ? 0.25 : 0);
  if (tension > 0.35 && t - lastHeart > 1.2 - tension * 0.7) { lastHeart = t; sound.heartbeat(0.2 + tension * 0.3); }

  // entities
  for (const e of [...ents]) {
    e.t += dt;
    const d = Math.hypot(e.x - P.x, e.z - P.z);
    if (e.kind === 'chip') {
      e.mesh.rotation.y += dt * 2; e.mesh.position.y = 0.9 + Math.sin(e.t * 2) * 0.08;
      if (d < 1.1) { G.chips++; remove(e); sound.chip(); const need = world.d.chips.length;
        if (G.chips >= need) { world.setLiftOpen(true); G.say('All chips installed — TUBELIFT ONLINE. Find it!', 'good'); sound.ding(); } else G.say(`Logic chip acquired (${G.chips}/${need})`, 'good');
        updateHUD(); }
    } else if (e.kind === 'battery') {
      e.mesh.rotation.y += dt * 2; e.mesh.position.y = 0.8 + Math.sin(e.t * 2) * 0.06;
      if (d < 1.0 && G.phaser < G.maxPhaser) { const y = G.fx.cellYield; G.phaser = Math.min(G.maxPhaser, G.phaser + y); remove(e); sound.pickup(); G.say(`Zapper power cell (+${y})${y < 2 ? ' — armory chargers are down' : ''}`, 'good'); updateHUD(); }
    } else if (e.kind === 'medkit') {
      e.mesh.rotation.y += dt * 1.5; e.mesh.position.y = 0.8 + Math.sin(e.t * 2) * 0.06;
      if (d < 1.0 && G.hp < G.maxHp) { const h = G.fx.medkit; G.hp = Math.min(G.maxHp, G.hp + h); remove(e); sound.heal(); G.say(`Medkit (+${h} health)${h < 35 ? ' — sickbay supplies are failing' : ''}`, 'good'); updateHUD(); }
    } else if (e.kind === 'tribble') {
      const b = e.mesh.userData.body; b.scale.y = 0.85 + Math.sin(e.t * 4) * 0.04; e.mesh.position.y = Math.abs(Math.sin(e.t * 1.6)) * 0.03;
      if (d < 0.9) { G.tribbles++; G.hp = Math.min(G.maxHp, G.hp + 3); remove(e); sound.purr(); G.say(['Coo-coo… a furble!', 'It purrs. Your stress level drops.', 'Furble acquired. Do NOT feed it.'][G.tribbles % 3], 'npc'); updateHUD(); }
    } else if (e.kind === 'crew' || e.kind === 'emh') {
      const a = Math.atan2(P.x - e.x, P.z - e.z); let da = a - e.mesh.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da));
      const H = e.mesh.userData.human;
      if (e.simmed && !e.walk) dodgeCheck(e, dt, d);
      if (e.op && e.walk) opEnd(e);   // leaving the equipment: put things away
      if (e.walk && walkStep(e, dt, d)) continue;
      if (e.turning !== undefined) { turnStep(e, dt, d); continue; }
      if (e.repairing) repairerStep(e, dt, d);
      if (H && e.kind === 'crew' && !e.fake) { const mad = gorns.find(g => g.mad && !g.dead && g.state !== S.DORMANT && Math.hypot(g.x - e.x, g.z - e.z) < 10 && world.los(g.x, g.z, e.x, e.z)); if (mad && !e.cower) { if (e.repairing) { e.repairing = null; G.say(`${e.person.short} drops their tools and hides.`, 'warn'); } e.cower = true; H.standing = false; H.play('crouch_idle', { fade: 0.2 }); H.face({ JawDrop: 0.7, LeftInnerBrowUp: 1, RightInnerBrowUp: 1, LeftUpperLidOpen: 1, RightUpperLidOpen: 1 }); if (d < 30) { sound.shriek(Math.max(0.05, 0.25 - d * 0.007)); if (d < 18) G.say(`${e.person ? e.person.short : 'A crewman'} screams: "${pick(['It\'s ' + (mad.person ? mad.person.given : 'him') + '! Something\'s wrong with ' + (mad.person ? mad.person.given : 'him') + '!', 'Stay back! STAY BACK!', 'No no no no—'])}"`, 'warn'); } } }
      if (e.faceAt && !e.walk && H && !H.standing) { let fa = Math.atan2(e.faceAt[0] - e.x, e.faceAt[1] - e.z) - e.mesh.rotation.y; fa = Math.atan2(Math.sin(fa), Math.cos(fa)); e.mesh.rotation.y += fa * Math.min(1, dt * 3); }
      if (H) {
        if (d > 22) continue;                       // far away: skip skinning updates
        if (H.standing && d < 9) e.mesh.rotation.y += da * Math.min(1, dt * 2.5);
        H.lookYaw += ((d < 7 ? Math.max(-0.9, Math.min(0.9, da)) : 0) - H.lookYaw) * Math.min(1, dt * 4);
        if (!e.fake) { liveFace(H, e.t, e.mesh.id); if (e.simmed) fidgetStep(e, dt, d); }   // impostors never blink
        H.update(dt * (e.fake ? 0.82 : 1));
      } else { e.mesh.rotation.y += da * Math.min(1, dt * 2.5); animateCrew(e.mesh, e.t); }
    }
  }
  function remove(e) { scene.remove(e.mesh); ents.splice(ents.indexOf(e), 1); }

  // prompt
  let prompt = '';
  const npc = nearest(2.2, e => ['crew', 'body', 'emh'].includes(e.kind) && !e.used);
  const rp = nearestRepair(true);
  if (rp && SHIP().status(rp.sys) !== 'nominal') prompt = G.repairT > 0 ? `Repairing ${SYS[rp.sys].name}… ${Math.floor(G.repairT / repairTime(rp) * 100)}%` : `[Hold E] Repair ${SYS[rp.sys].name} (${SHIP().status(rp.sys)})`;
  else if (npc) prompt = npc.kind === 'body' ? '[E] Search body' : npc.kind === 'emh' ? '[E] Speak to hologram' : `[E] Talk to ${npc.mesh.userData.rank || 'crewman'}`;
  else if (nearestSite()) prompt = `[E] Search ${fixtureName(nearestSite().kind)}`;
  else if (Math.hypot(P.x - world.liftPos.x, P.z - world.liftPos.z) < 2.8) prompt = NOM() ? (G.fx.liftLocked ? 'Tubelift locked out — lift controller offline' : inCarTile() ? '[E] Deck selection' : '') : G.chips >= world.d.chips.length ? '[E] Board tubelift' : 'Tubelift offline';
  else if (rp) prompt = `${SYS[rp.sys].name} — nominal`;
  if (!prompt && NOM() && G.haul) prompt = G.haul.prompt();
  if (!prompt && NOM() && G.hud2) { const lp = lookedPropObj(); if (lp && (lp.kind === 'console' || lp.kind === 'servers')) prompt = '[E] Use terminal'; else if (G.carry) prompt = `Carrying: ${G.carry.name} — [G] put it down`; }
  if (!prompt) { const c = nearestClutter(); if (c) prompt = (NOM() && G.hud2 && !G.carry ? '[E] Take ' : '') + (same(c.name, c.real) ? c.name : `${c.name} (${c.real})`); else { const lp = lookedProp(); if (lp) prompt = same(lp.name, lp.real) ? lp.name : `${lp.name} — ${lp.real}`; } }
  $('prompt').textContent = prompt;

  // room label + exploration
  const [tx, ty] = world.tile(P.x, P.z);
  const rt = world.d.room[ty]?.[tx];
  $('roomname').textContent = rt ? ROOMS[rt].label : 'Corridor';
  if (rt === 'jefferies' && !G.hints.tube) { G.hints.tube = 1; G.say('You squeeze into a Jiffy tube. The big ones cannot follow — the small ones can.', 'npc'); }
  mapT += dt; if (mapT > 0.12) { mapT = 0; world.reveal(P.x, P.z, 3); drawMap(); updateHUD(); }

  // environment flicker / lights
  world.update(dt, t); world.slideDoors(dt, P.x, P.z, ents.filter(e => e.simmed).map(e => ({ x: e.x, z: e.z })), (d) => { if (d < 9) { sound.noise?.(0.14, Math.max(0.02, 0.1 - d * 0.01), 1800, 1, 'bandpass'); } });
  lamp.position.set(P.x, 2.4, P.z);
  flickT -= dt;
  if (flickT <= 0) { flickT = 0.05 + Math.random() * 0.1; const bad = tension > 0.5 && Math.random() < 0.15; hemi.intensity = (bad ? 0.5 : 1.9 + (Math.random() < 0.02 ? -1.2 : 0)) * (0.03 + 0.97 * world.powerAmt); }
  lamp.intensity = 9 * (0.15 + 0.85 * world.powerAmt);

  // particles & ambient events
  blood.update(dt); sparks.update(dt); steam.update(dt); water.update(dt); dust.update(dt, P.x, P.z, camera, P.torch);
  updatePanelLights(dt);
  // rolling blackouts: the hum stops, the lights die, something is still walking
  if (G.blackout > 0) { G.blackout -= dt; if (G.blackout <= 0) { world.setPower(true); sound.setPower(true); sound.powerUp(); } }
  else { G.blackT -= dt; if (G.blackT <= 0 && G.deckTime > 25) { G.director?.bump(0.1, 'blackout'); G.blackout = 5 + Math.random() * 5; G.blackT = (G.fx.blackoutEvery || 170) * (0.7 + Math.random() * 0.6); world.setPower(false); sound.setPower(false); sound.powerDown(); G.say('Computer: Main power failure. Emergency lighting only.', 'comp'); } }
  world.powerTarget = G.blackout > 0 ? 0 : G.fx.power; world.lightFault = G.fx.lightFlicker;
  G.distT -= dt; if (G.distT <= 0) { G.distT = 25 + Math.random() * 30; sound.distant(pick(['steps', 'steps', 'scrape', 'door', 'whisper'])); }
  for (const dr of world.drips) if (dr.fire) { dr.fire = false; if (Math.hypot(dr.x - P.x, dr.z - P.z) < 16) { for (let i = 0; i < 4; i++) water.add(dr.x, dr.y - 0.1, dr.z, (Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3, WATER, 1.2); sound.drip(); } }
  if (G.phase === 'play' && G.deck === 1 && !NOM()) {
    const h = G.hints, dt2 = G.deckTime;
    if (dt2 > 4 && !h.a) { h.a = 1; G.say('WASD to move · mouse to look · find the green logic chips', 'comp'); }
    if (dt2 > 16 && !h.b) { h.b = 1; G.say('Check the scan-o-matic map (top right). Hold C to creep silently.', 'comp'); }
    if (dt2 > 30 && !h.c) { h.c = 1; G.say('Click or Space fires the zapper. It only stuns. Then run.', 'comp'); }
  }
  for (const sp of world.sparkers) {
    sp.t -= dt;
    if (sp.t <= 0) {
      sp.t = 5 + Math.random() * 14; const d = Math.hypot(sp.x - P.x, sp.z - P.z);
      if (d < 22) { for (let i = 0; i < 14; i++) sparks.add(sp.x, 1.1, sp.z, (Math.random() - 0.5) * 3, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 3, SPARK, 0.5 + Math.random() * 0.5); if (d < 14) sound.zap(); }
    }
  }
  for (const st of world.steamers) {
    st.t -= dt;
    if (st.t <= 0 && Math.hypot(st.x - P.x, st.z - P.z) < 20) { st.t = 0.08; steam.add(st.x, 0.3, st.z, (Math.random() - 0.5) * 0.4, 1.2 + Math.random(), (Math.random() - 0.5) * 0.4, STEAM, 2.2); }
  }
  G.annT = (G.annT ?? 40) - dt;
  if (G.annT <= 0) { G.annT = 50 + Math.random() * 40; if (G.fx.comms < 2) { sound.chirp(); G.say('Computer: ' + garble(pick(NOM() ? ANN_NOM : COMPUTER)), 'comp'); } }
  G.clangT = (G.clangT ?? 20) - dt;
  if (G.clangT <= 0) { G.clangT = 18 + Math.random() * 30; if (!NOM()) sound.clang(0.15); }
  if (G.stamina < 25) { G.breathT = (G.breathT || 0) - dt; if (G.breathT <= 0) { G.breathT = 0.7; sound.breath(0.1); } }

  if (gunVM) { gunKick = Math.max(0, gunKick - dt * 6); vm.tick?.(dt, gunKick, G.phaser); gunVM.position.set(0.18 + Math.sin(P.bob * 1.1) * 0.006, -0.15 + Math.abs(Math.sin(P.bob * 1.1)) * 0.008 + (P.crouch ? 0.02 : 0) - Math.max(-0.04, Math.min(0.05, P.vy * 0.006)) - P.land * 0.03, -0.4 + gunKick * 0.05); gunVM.rotation.z = -P.roll * 1.5;
    { const pa = world ? world.powerAmt : 1, al = world ? world.alertAmt : 0; vmHemi.intensity = 0.05 + 0.5 * pa; vmKey.intensity = 0.1 + 1.3 * pa; vmKey.color.set(ship ? ship.light : 0xffffff).lerp(new THREE.Color(0xff2010), al * 0.6); vmRim.intensity = P.torch ? 1.2 : 0; } gunVM.rotation.x = 0.05 + gunKick * 0.25; muzzle.material.opacity = gunKick > 0.6 ? 1 : 0; gunVM.visible = G.phase === 'play' && !NOM(); }
  // camera
  P.shake = Math.max(0, P.shake - dt * 1.5);
  const onFoot = P.grounded && P.mode !== 'slide';
  const bobY = onFoot ? Math.sin(P.bob * 2.2) * (0.04 + P.flow * 0.02) * Math.min(1, speedNow / 3) : 0;
  const dip = Math.sin(Math.min(1, P.land) * Math.PI) * 0.14 * Math.min(1, P.land * 2);
  camera.position.set(P.x, P.y + P.eye + bobY - dip, P.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.set(P.pitch - dip * 0.35 + (Math.random() - 0.5) * P.shake * 0.05, P.yaw + (onFoot ? Math.sin(P.bob * 1.1) * 0.004 : 0) + (Math.random() - 0.5) * P.shake * 0.05, P.roll + (onFoot ? Math.sin(P.bob * 1.1) * 0.006 : 0));
  const fovT = 75 + Math.max(0, Math.min(1, (speedNow - 3.6) / 6)) * 15 + (P.mode === 'grapple' ? 7 : 0) + (P.mode === 'slide' ? 4 : 0);
  camera.fov += (fovT - camera.fov) * Math.min(1, dt * 5); camera.updateProjectionMatrix();
  $('grap').className = P.mode === 'grapple' ? 'on' : P.grapCd > 0 ? 'cd' : ''; $('grap').firstElementChild.style.width = (100 - Math.min(1, P.grapCd / MOVE.grapCooldown) * 100) + '%';
  $('speed').style.opacity = Math.max(0, Math.min(0.6, (speedNow - 7) / 8));
}

// ---------------- traversal glue: sound, noise, enemies ----------------
const moveApi = {
  stamina: () => G.stamina,
  spend: (n) => { G.stamina = Math.max(0, G.stamina - n); },
  onEvent(name, d) {
    if (name === 'jump') { sound.step(0.16); noiseNow = Math.max(noiseNow, 6); }
    else if (name === 'land') { const hard = d.impact > 8; sound.thud(Math.min(0.45, 0.08 + d.impact * 0.03)); noiseNow = Math.max(noiseNow, hard ? 14 : 7); if (hard) P.shake = Math.max(P.shake, 0.25); }
    else if (name === 'mantle' || name === 'vault') { sound.noise(0.12, 0.09, 500, 0.8, 'lowpass'); sound.step(0.12); noiseNow = Math.max(noiseNow, 6); }
    else if (name === 'slide') { sound.noise(0.55, 0.12, 900, 0.7, 'bandpass'); slideHit = 0.9; }
    else if (name === 'wallrun') { sound.step(0.2); }
    else if (name === 'walljump') { sound.step(0.22); noiseNow = Math.max(noiseNow, 8); }
    else if (name === 'rung') { sound.tone(180 + Math.random() * 40, 0.06, 'square', 0.03, -60); sound.step(0.07); noiseNow = Math.max(noiseNow, 4); }
    else if (name === 'ladder') { if (!G.hints.ladder) { G.hints.ladder = 1; G.say('Ladder: W climbs · S or C climbs down · Space lets go', ''); } }
    else if (name === 'release') { sound.noise(0.18, 0.08, 2600, 2, 'bandpass'); }
  },
};
let slideHit = 0;
// slide-tackle: sweeps the legs of man-sized hostiles
function slideTackle(dt) {
  if (P.mode !== 'slide') { slideHit = 0; return; }
  slideHit -= dt; if (slideHit <= 0) return;
  for (const g of gorns) {
    if (!g.active || g.state === S.STUNNED || !['crazed', 'slimeling'].includes(g.kind)) continue;
    if (Math.hypot(g.x - P.x, g.z - P.z) < 1.15) { g.stunFor(1.6); G.stuns++; slideHit = 0; P.shake = 0.3; sound.hit(); G.say('Slide tackle!', 'good'); P.flow = 1; break; }
  }
}

// grapple line: Q or right mouse. Reels you to walls, ceilings and prop tops; yanks small hostiles.
const ropeGeo = new THREE.BufferGeometry(); ropeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
const rope = new THREE.Line(ropeGeo, new THREE.LineBasicMaterial({ color: 0xd8e2ea })); rope.frustumCulled = false; rope.visible = false; scene.add(rope);
const hook = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 6), new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 1, roughness: 0.3, emissive: 0x40c8ff, emissiveIntensity: 0.6 })); hook.visible = false; scene.add(hook);
const _h = new THREE.Vector3();
function fireGrapple() {
  if (G.phase !== 'play' || P.clung > 0 || P.pushing) return;   // no grapple while pushing a cart
  if (P.mode === 'grapple') { pressed.grappleCancel = true; return; }
  if (P.grapCd > 0 || P.mode === 'mantle') { sound.empty(); return; }
  camera.getWorldDirection(_f); const eye = camera.position;
  const hit = world.raycast(eye.x, eye.y, eye.z, _f.x, _f.y, _f.z, MOVE.grapRange);
  const maxD = hit ? hit.dist : MOVE.grapRange;
  // living targets in the way?
  let tgt = null, tD = maxD;
  for (const g of gorns) {
    if (g.dead || g.state === S.DORMANT || g.kind === 'phantom') continue;
    const gy = g.kind === 'clinger' && g.mode === 'lurk' ? g.ceil - 0.2 : g.hitY + (g.y || 0);
    _v.set(g.x - eye.x, gy - eye.y, g.z - eye.z); const d = _v.length(); _v.normalize();
    if (d < tD && Math.acos(Math.max(-1, Math.min(1, _v.dot(_f)))) < Math.atan2(g.hitR, d) + 0.03) { tgt = g; tD = d; }
  }
  sound.noise(0.1, 0.16, 3200, 3, 'bandpass'); sound.tone(520, 0.12, 'square', 0.05, 900); noiseNow = Math.max(noiseNow, 9);
  if (tgt) {
    P.grapCd = MOVE.grapCooldown; ropeFlash = 0.25; ropeEnd.set(tgt.x, tgt.kind === 'clinger' && tgt.mode === 'lurk' ? tgt.ceil - 0.2 : tgt.hitY + (tgt.y || 0), tgt.z);
    if (tgt.kind === 'clinger') { tgt.kill(); G.kills++; G.say('Hooked it off the ceiling!', 'good'); }
    else if (tgt.kind === 'crazed' || tgt.kind === 'slimeling') { tgt.stunFor(1.4); G.stuns++; const dx = P.x - tgt.x, dz = P.z - tgt.z, d = Math.hypot(dx, dz) || 1, pull = Math.min(2.5, Math.max(0, d - 1.6)); tgt.x += dx / d * pull; tgt.z += dz / d * pull; if (world.solidAt(tgt.x, tgt.z)) { tgt.x -= dx / d * pull; tgt.z -= dz / d * pull; } G.say('Hooked! It stumbles.', 'good'); }
    else G.say('The hook skitters off the ' + tgt.name + '.', 'warn');
    return;
  }
  if (!hit || hit.dist < 1.6) { ropeFlash = 0.18; ropeEnd.copy(eye).addScaledVector(_f, hit ? hit.dist : MOVE.grapRange); P.grapCd = 0.5; if (!hit) G.say('Nothing in range for the grapple line.', ''); return; }
  startGrapple(P, hit); ropeEnd.set(hit.x, hit.y, hit.z); sound.clang(0.1);
}
const ropeEnd = new THREE.Vector3(); let ropeFlash = 0;
function updateRope(dt) {
  ropeFlash = Math.max(0, ropeFlash - dt);
  const on = P.mode === 'grapple' || ropeFlash > 0; rope.visible = hook.visible = on; if (!on) return;
  // from the left hand (lower-left of the view) to the anchor, with a little slack that tightens
  _h.set(-0.22, -0.2, -0.45).applyQuaternion(camera.quaternion).add(camera.position);
  const a = ropeGeo.attributes.position, slack = P.mode === 'grapple' ? Math.max(0, 0.5 - P.grap.t * 2) : 0.3, n = a.count;
  for (let i = 0; i < n; i++) { const k = i / (n - 1); a.setXYZ(i, _h.x + (ropeEnd.x - _h.x) * k, _h.y + (ropeEnd.y - _h.y) * k - Math.sin(k * Math.PI) * slack + Math.sin(k * 14 + performance.now() * 0.03) * slack * 0.08, _h.z + (ropeEnd.z - _h.z) * k); }
  a.needsUpdate = true; hook.position.copy(ropeEnd); hook.lookAt(_h); hook.rotateX(-Math.PI / 2);
}

// ---------------- ship systems: repair points, faults, effects ----------------
let repairPts = [], statusOpen = false, statusT = 0;
const SHIP = () => G.shipState;
const BEAM = new THREE.Color(0x8fd8ff);
const garble = (t) => G.fx.comms ? t.replace(/[a-z]/gi, c => Math.random() < 0.35 ? '▒' : c) : t;
const repairTime = (r) => SYS[r.sys].repair * (r.main ? 1 : 1.5) * (1 + perk('boots') * 0) / (G.kit ? G.kit.repairMul() : toolBonus(G.carry));   // tool in hand / a carried toolbox repairs 25% faster
function nearestRepair(any = false) {
  let best = null, bd = 1e9;
  for (const r of repairPts) { const d = Math.hypot(r.x - P.x, r.z - P.z); if (d < r.reach && d < bd && (any || SHIP().status(r.sys) !== 'nominal')) { bd = d; best = r; } }
  return best;
}
function placeRepairPoints(data) {
  repairPts = []; const rnd = mulberry32(G.runSeed * 7 + G.deck * 131);
  const faces = world.wallFaces.filter(f => { const ox = f.tx + f.dx, oy = f.ty + f.dy; return !f.deco && data.grid[oy]?.[ox] === 0 && !world.isTube(ox, oy) && !(ox === data.exit[0] && oy === data.exit[1]); });
  for (let i = faces.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [faces[i], faces[j]] = [faces[j], faces[i]]; }
  const taken = [], deckCode = String(G.shipDeck + 1).padStart(2, '0');
  const takeFace = (dept) => {
    const zone = DEPT[dept].zone, ok = (f, gap) => taken.every(t => Math.hypot(t.px - f.px, t.pz - f.pz) > gap);
    for (const gap of [7, 4, 1.5]) { const f = faces.find(f => ok(f, gap) && f.room) || faces.find(f => ok(f, gap)); if (f) { taken.push(f); return f; } }
    return null;
  };
  let jn = 0; const sites = hardwareSites(data);
  for (const s of SYSTEMS) {
    let pt = null;
    const site = sites.find(h => h.sys === s.id);
    if (site?.kind === 'lift') pt = { x: world.liftPos.x, z: world.liftPos.z, main: true, reach: 2.8, y: 2.2, where: 'tubelift controls' };
    else if (site) { const [x, z] = world.center(site.tx, site.ty); pt = { x, z, tx: site.tx, ty: site.ty, main: true, reach: 2.2, y: site.kind === 'warpcore' ? 2.0 : 1.6, where: HOST_LABEL[s.host] }; }
    if (!pt) {
      const f = takeFace(s.dept); if (!f) continue; jn++;
      const j = makeJunction(s, `JCT ${deckCode}-${String(jn).padStart(2, '0')}`, DEPT[s.dept].name, DIVISION[DEPT[s.dept].division].color);
      j.group.position.set(f.px + f.dx * 0.01, 0.85, f.pz + f.dy * 0.01); j.group.rotation.y = f.ry; scene.add(j.group);
      j.group.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
      pt = { x: f.px + f.dx * 0.55, z: f.pz + f.dy * 0.55, main: false, reach: 1.6, obj: j.group, lamp: j.lamp, y: 1.25, px: f.px, pz: f.pz, where: `junction ${deckCode}-${String(jn).padStart(2, '0')}` };
    }
    if (!pt.obj) { pt.obj = makeBeacon(); pt.obj.position.set(pt.x, pt.y + 0.3, pt.z); scene.add(pt.obj); }
    pt.sys = s.id; repairPts.push(pt);
  }
  // coolant vents for when the plumbing goes
  G.vents = []; for (let i = 0; i < 5; i++) { const t = data.openTiles[Math.floor(rnd() * data.openTiles.length)]; if (data.grid[t[1]][t[0]] === 0 && !world.isTube(t[0], t[1])) { const [x, z] = world.center(t[0], t[1]); G.vents.push({ x: x + (rnd() - 0.5), z: z + (rnd() - 0.5), t: rnd() }); } }
}
function onShipEvent(ev) {
  if (ev.type === 'repair') G.phases?.onRepair(ev.id);
  if (ev.quiet || !world || G.phase !== 'play') return;
  G.fx = SHIP().effects();
  const r = repairPts.find(r => r.sys === ev.id);
  if (ev.type === 'fault') {
    G.director?.bump(ev.cascade ? 0.12 : 0.08, 'fault ' + ev.id);
    if (!ev.cascade && G.director?.phase !== 'peak' && Math.random() < 0.55) spawnRepairer(ev.id);
    const dist = r ? Math.round(Math.hypot(r.x - P.x, r.z - P.z)) : null;
    if (G.fx.comms < 2 || ev.id === 'comms') G.say(garble(`Computer: ${ev.name} ${ev.status === 'offline' ? 'OFFLINE' : 'failing'} — ${ev.part}.`) + (r ? ` Repair at ${r.where}${dist != null ? ` (${dist} m)` : ''}.` : ''), 'warn');
    sound.zap(); sound.chirp(); P.shake = Math.max(P.shake, 0.15);
    if (r) for (let i = 0; i < 30; i++) sparks.add(r.x, r.y, r.z, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, SPARK, 0.6);
    if (ev.id === 'eps' || ev.id === 'reactor') { G.blackT = Math.min(G.blackT, 0.5); sound.powerDown(); }
    if (ev.id === 'emh' && ev.status === 'offline') for (const e of ents) if (e.kind === 'emh') e.mesh.visible = false;
  } else if (ev.type === 'repair') {
    G.say(`${ev.name} restored.`, 'good'); if (ev.id === 'reactor' || ev.id === 'eps') sound.powerUp(); else sound.ding();
    if (ev.id === 'emh') for (const e of ents) if (e.kind === 'emh') e.mesh.visible = true;
  }
  updateFaultHud();
}
function updateShipSystems(dt, tension) {
  const S = SHIP(); S.tick(dt, { deckTime: G.deckTime, tension, deck: G.deck }); G.fx = S.effects();
  const t = performance.now() / 1000;
  // repair: hold E at a faulted point. Noisy — whatever is hunting you will hear it.
  const rp = nearestRepair();
  if (rp && keys.KeyE && !(P.clung > 0) && P.grounded) {
    G.repairT += dt; noiseNow = Math.max(noiseNow, 9);
    G.repSparkT = (G.repSparkT || 0) - dt; if (G.repSparkT <= 0) { G.repSparkT = 0.35; for (let i = 0; i < 6; i++) sparks.add(rp.x, rp.y, rp.z, (Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2, SPARK, 0.4); sound.zap(); }
    if (G.repairT >= repairTime(rp)) { G.repairT = 0; S.repair(rp.sys); }
  } else G.repairT = rp ? Math.max(0, G.repairT - dt * 0.3) : 0;
  $('repbar').style.opacity = G.repairT > 0 && rp ? 1 : 0; if (rp) $('repbar').firstElementChild.style.width = Math.min(100, G.repairT / repairTime(rp) * 100) + '%';
  // faulted hardware sparks, steams and blinks
  for (const r of repairPts) {
    const st = S.status(r.sys); if (r.lamp) setLamp(r.lamp, st, t);
    if (!r.lamp) { r.obj.visible = st !== 'nominal'; r.obj.rotation.y = t * 2; r.obj.material.color.set(st === 'offline' ? 0xff3020 : 0xffa020); }
    if (st === 'nominal') continue;
    r.fxT = (r.fxT || Math.random() * 2) - dt;
    if (r.fxT <= 0) { r.fxT = (st === 'offline' ? 1.2 : 2.8) + Math.random() * 2; const d = Math.hypot(r.x - P.x, r.z - P.z); if (d < 24) { const ox = r.px !== undefined ? r.px : r.x, oz = r.pz !== undefined ? r.pz : r.z; for (let i = 0; i < 10; i++) sparks.add(ox, r.y, oz, (Math.random() - 0.5) * 2.5, 0.5 + Math.random() * 2, (Math.random() - 0.5) * 2.5, SPARK, 0.5); if (d < 12) sound.zap(); } }
  }
  // coolant: steam from the junction (degraded) and scalding corridor vents (offline)
  if (G.fx.steam) {
    const cr = repairPts.find(r => r.sys === 'coolant');
    for (const v of [...(cr ? [{ x: cr.x, z: cr.z, t: 0 }] : []), ...(G.fx.steam > 1 ? G.vents : [])]) { if (Math.hypot(v.x - P.x, v.z - P.z) < 20 && Math.random() < dt * 14) steam.add(v.x, 0.3, v.z, (Math.random() - 0.5) * 0.4, 1.4 + Math.random(), (Math.random() - 0.5) * 0.4, STEAM, 2.2); }
    if (G.fx.steam > 1) for (const v of G.vents) if (Math.hypot(v.x - P.x, v.z - P.z) < 0.9 && G.phase === 'play') { G.hp -= 9 * dt; P.shake = Math.max(P.shake, 0.1); if (Math.random() < dt * 3) { flash('#fff', 0.15); G.say('Scalding steam!', 'warn'); } if (G.hp <= 0) return die({ name: 'Scalding steam', roar: 0 }, 'Boiled alive in a coolant leak. The plumbers were the real heroes.'); }
  }
  // gravity
  P.gMul = G.fx.gravity;
  // life support: thin air, then suffocation
  if (G.fx.suffocate && G.phase === 'play') { G.hp -= G.fx.suffocate * dt; G.co2T = (G.co2T || 0) - dt; if (G.co2T <= 0) { G.co2T = 9; sound.breath(0.16); G.say('CO₂ levels critical — repair life support!', 'warn'); } updateHUD(); if (G.hp <= 0) return die({ name: 'Suffocation', roar: 0 }, 'The air ran out before the hostiles did.'); }
  // helm: the deck lurches; dampers decide how hard
  if (G.fx.lurchEvery) { G.lurchT -= dt; if (G.lurchT <= 0) { G.lurchT = G.fx.lurchEvery * (0.6 + Math.random() * 0.8); const a = Math.random() * 6.28, k = 3.2 * G.fx.lurchMul; P.kbx += Math.cos(a) * k; P.kbz += Math.sin(a) * k; P.shake = Math.max(P.shake, 0.35 * G.fx.lurchMul); sound.clang(0.3); sound.thud(0.35); noiseNow = Math.max(noiseNow, 6); if (G.fx.lurchHurts) { G.hp -= 4; flash('#c00', 0.25); } G.say('The deck lurches violently.', 'warn'); } }
  statusT -= dt; if (statusOpen && statusT <= 0) { statusT = 0.5; renderStatus(); }
  G.faultHudT = (G.faultHudT || 0) - dt; if (G.faultHudT <= 0) { G.faultHudT = 0.5; updateFaultHud(); }
}
function updateFaultHud() {
  if (!G.shipState || !world) return;
  const rows = G.shipState.faulted().map(s => { const st = G.shipState.status(s.id), r = repairPts.find(r => r.sys === s.id), d = r ? Math.round(Math.hypot(r.x - P.x, r.z - P.z)) : null; return `<div class="${st}">⚠ ${s.name.toUpperCase()} ${st === 'offline' ? 'OFFLINE' : 'DEGRADED'}${d != null ? ` · ${d} m` : ''}</div>`; });
  $('faults').innerHTML = rows.join('');
}
function showStatus(on) { statusOpen = on; $('shipstatus').style.display = on ? 'block' : 'none'; if (on) renderStatus(); }
function renderStatus() {
  const S = G.shipState, R = G.roster, here = {};
  for (const r of repairPts) here[r.sys] = `On this deck: ${r.where} · ${Math.round(Math.hypot(r.x - P.x, r.z - P.z))} m`;
  const zone = zoneOf(G.shipDeck / Math.max(1, G.ship.decks - 1)).label;
  const depts = DEPARTMENTS.map(d => {
    const crew = R.people.filter(p => p.dept === d.id), c = (st) => crew.filter(p => p.status === st).length;
    const sys = SYSTEMS.filter(s => s.dept === d.id).map(s => { const st = S.status(s.id); return `<div class="sr ${st}"><span>${s.name}</span>${statusPill(st)}${st !== 'nominal' ? `<em>${st === 'offline' ? s.eff.off : s.eff.deg}</em><small>${here[s.id] || ''}</small>` : ''}</div>`; }).join('');
    return `<div class="sd" style="--u:#${DIVISION[d.division].color.toString(16).padStart(6, '0')}"><h4>${d.name}<span>${crew.length} crew · ${c('alive') + c('evacuated')} found alive · ${c('dead')} dead · ${crew.length - c('alive') - c('evacuated') - c('dead')} unaccounted for</span></h4>${sys}</div>`;
  }).join('');
  $('shipstatus').innerHTML = `<div class="ssh"><b>${G.ship.name}</b> ${G.ship.reg} · ${G.ship.cls}-class · deck ${String(G.shipDeck + 1).padStart(2, '0')} of ${G.ship.decks} · ${zone}<span>Hold TAB · faults marked ▲ on the scan-o-matic · hold E at the hardware to repair (noisy)</span></div><div class="ssg">${depts}</div>`;
}
function showCompany() {
  const here = {}; for (const r of repairPts) here[r.sys] = `On this deck: ${r.where}`;
  $('companybody').innerHTML = `<h3 class="ch">Chain of command — ${G.ship.name}</h3>${renderOrgChart(G.roster)}<h3 class="ch">Departments &amp; loadout</h3>${renderLoadout(G.shipState, G.roster, { here })}`;
  showScreen('company');
}

// ---------------- tubelift (Systems Nominal): a real car at every deck's lift ----------------
// The exit tile of each deck is the car; its doors sit at the mouth. Walk in and the doors close behind you, the deck panel opens, you pick a deck,
// the car rides for 3-8 s (by distance, deck indicator ticking, hum, shake) and the doors open on the destination deck with you still inside.
const NOTABLE = ['bridge', 'readyroom', 'engineering', 'sickbay', 'mess', 'lounge', 'gym', 'holodeck', 'lab', 'arboretum', 'shuttlebay', 'cargo', 'transporter', 'armory', 'brig', 'datacore', 'stores', 'quarters'];
const NOTE_LABEL = { mess: 'Galley', holodeck: 'Holodeck', transporter: 'Transporter', lab: 'Lab', gym: 'Gym', lounge: 'Lounge', datacore: 'Datacore', cargo: 'Cargo', stores: 'Stores', quarters: 'Quarters', readyroom: 'Ready Room' };
const deckNotes = (i) => NOTABLE.filter(t => G.plan?.[t]?.some(r => r.deck === i)).map(t => NOTE_LABEL[t] || ROOMS[t].label);
const deckZone = (i) => zoneOf(i / Math.max(1, G.ship.decks - 1)).label;
const inCarTile = () => { const c = world?.car; if (!c) return false; const [tx, ty] = world.tile(P.x, P.z); return tx === c.tx && ty === c.ty && P.y < 0.5; };
function renderLiftPanel() {
  const L = G.lift, D = G.ship.decks, ride = L.state === 'ride';
  $('liftsub').textContent = `${G.ship.name} · ${G.ship.reg}`;
  $('liftbig').textContent = ride ? `${L.to > L.from ? '▼' : '▲'} DECK ${String(L.disp + 1).padStart(2, '0')}` : '';
  $('liftfoot').textContent = ride ? `Riding to Deck ${L.to + 1} — ${deckZone(L.to)}` : 'Press 1–' + D + ' or click a deck · Esc to step out';
  $('liftrows').innerHTML = Array.from({ length: D }, (_, i) => { const nt = deckNotes(i); return `<div class="lr${!ride && i === G.shipDeck ? ' cur' : ''}${ride && i === L.to ? ' dest' : ''}${ride && i === L.disp ? ' here' : ''}" data-i="${i}"><i>${i + 1}</i><b>Deck ${i + 1} — ${deckZone(i)} </b><span>${nt.length ? '· ' + nt.join(' · ') : ''}</span></div>`; }).join('');
  $('liftui').className = 'show' + (ride ? ' ride' : '');
}
$('liftrows').onclick = (e) => { const r = e.target.closest('.lr'); if (r && G.phase === 'select') chooseDeck(+r.dataset.i); };
function openLiftPanel() {
  if (!world?.car || G.phase !== 'play') return;
  if (G.fx.liftLocked) { sound.denied(); G.say('Tubelift controller OFFLINE — repair it at the lift controls (hold E)', 'warn'); return; }
  G.phase = 'select'; G.lift.state = 'select'; world.setLiftOpen(false, true); sound.clang(0.2); sound.thud(0.3);
  P.vx = P.vz = 0; P.kbx = P.kbz = 0; $('prompt').textContent = ''; renderLiftPanel(); document.exitPointerLock?.();
}
function closeLiftPanel() {
  if (G.phase !== 'select') return;
  $('liftui').className = ''; G.lift.state = 'idle'; G.lift.armed = false; world.setLiftOpen(true); G.phase = 'play'; requestLock();
}
function chooseDeck(i) {
  const L = G.lift; if (G.phase !== 'select' || !(i >= 0 && i < G.ship.decks)) return;
  if (i === G.shipDeck) { G.say(`You are already on Deck ${i + 1}.`, 'comp'); closeLiftPanel(); return; }
  if (G.fx.liftLocked) { sound.denied(); G.say('Tubelift controller OFFLINE — the car will not move.', 'warn'); return; }
  const D = G.ship.decks, dist = Math.abs(i - G.shipDeck);
  Object.assign(L, { state: 'ride', from: G.shipDeck, to: i, disp: G.shipDeck, t: 0, dur: 3 + 5 * (dist - 1) / Math.max(1, D - 2), hum: 0 });
  // you say where you are going (in your own voice), then anyone already in the car says their stop
  const said = speak(G.player, liftLine(G.player, destOf(i), { rank: L.rider?.person.rank })); L.said = said.text;
  if (L.rider) boardLift(L.rider.person, destOf(riderDest(L.rider.person, G.shipDeck, i)), said.dur + 0.4);
  G.phase = 'ride'; sound.lift(); renderLiftPanel(); requestLock();
}
// ---------------- NPC riders: someone is sometimes already in the car. Tags (js/voice.js) decide where they stand and what they do; ----------------
// liftLine / speak / boardLift(person, dest) are the pieces the future NPC sim reuses for anyone taking the lift.
G.riderChance = 0.35; G.liftLog = [];
const destOf = (i) => ({ deckNo: i + 1, zone: deckZone(i), rooms: deckNotes(i) });
function riderDest(person, from, to) {   // a stop on the way (or the player's own), preferring decks of their department's zone
  const dir = Math.sign(to - from), cands = []; for (let k = from + dir; k !== to + dir; k += dir) cands.push(k);
  const mine = cands.filter(k => deckZone(k) === DEPT[person.dept].zone), pool = mine.length ? mine : cands; return pool[Math.floor(G.liftRnd() * pool.length)];
}
function pickRider() {
  const zone = deckZone(G.shipDeck), pool = G.roster.people.filter(p => p !== G.player && p.billet !== 'co' && !['dead', 'crazed'].includes(p.status)), local = pool.filter(p => DEPT[p.dept].zone === zone);
  const from = local.length && G.liftRnd() < 0.7 ? local : pool; return from[Math.floor(G.liftRnd() * from.length)];
}
function placeRider(person) {
  const c = world.car; if (!c) return null; clearRider(); const T = new Set(person.tags || []), px = -c.dy, pz = c.dx, side = person.id % 2 ? 1 : -1;
  const spot = T.has('lift:stands-at-back') ? [-0.85, 0.55] : T.has('lift:holds-door') ? [0.7, 0.75] : [-0.35, 0.85];   // along the doors' axis, sideways: a tidy spot at the back or against the side wall
  const m = world.carMode ? makeHuman({ person, kind: person.body, rank: person.rank, uniform: person.uniform ?? G.roster.uniformOf(person), rnd: mulberry32(person.id + 77) }) : null;
  const x = c.x + c.dx * spot[0] + px * spot[1] * side, z = c.z + c.dy * spot[0] + pz * spot[1] * side;
  if (m) { m.position.set(x, 0, z); m.rotation.y = T.has('lift:small-talk') ? Math.atan2(c.x - x, c.z - z) : Math.atan2(c.dx, c.dy); scene.add(m);   // everyone faces the doors; the chatty ones face you
    m.userData.human.play('idle', { fade: 0 }); }
  return G.lift.rider = { person, mesh: m, h: m?.userData.human || null, x, z, dest: null, destIdx: -1, left: false, clock: 0, events: [] };
}
function rollRider(force = false) { if (!world?.car || G.lift.rider || !G.roster) return null; if (!force && G.liftRnd() >= G.riderChance) return null; const p = pickRider(); return p ? placeRider(p) : null; }
function boardLift(person, dest, delay = 0) {   // person is (now) in the car; they announce their stop and behave by their lift: tags
  let r = G.lift.rider; if (!r || r.person !== person) r = placeRider(person); if (!r) return null;
  r.dest = dest; r.destIdx = dest.deckNo - 1; const T = new Set(person.tags || []), rnd = G.liftRnd, say = speak(person, liftLine(person, dest, { rank: G.player?.rank }), { delay }); r.said = say.text; G.liftLog.push(`board:${person.id}:${dest.deckNo}`);
  if (!T.has('lift:rides-in-silence')) {
    if (T.has('lift:small-talk') && rnd() < 0.8) r.events.push({ t: 1.2 + delay, fn: () => { r.h?.has('idle_talking') && r.h.play('idle_talking'); speak(person, voiceBark(person, 'smalltalk')); } });
    else if (T.has('lift:corrects-others') && Math.abs(r.destIdx - G.shipDeck) >= 1 && rnd() < 0.6) r.events.push({ t: 1 + delay, fn: () => speak(person, voiceBark(person, 'correct')) });
    const hc = habitCue(person, rnd); if (hc && (T.has('lift:hums-in-lift') || rnd() < 0.5)) r.events.push({ t: 2 + delay, fn: () => voiceCue(person, T.has('lift:hums-in-lift') ? 'hum' : hc.sound) });
  }
  if (T.has('lift:presses-twice')) r.events.push({ t: 0.2 + delay, fn: () => voiceCue(person, 'click2') });
  return r;
}
function leaveRider() {
  const r = G.lift.rider; if (!r || r.left) return; r.left = true; G.liftLog.push(`leave:${r.person.id}:${r.destIdx + 1}`);
  const th = (r.person.tags || []).includes('lift:says-thanks') && TAG_EFFECTS['lift:says-thanks'].leave; if (th) speak(r.person, th[r.person.id % th.length]);
  if (r.mesh) scene.remove(r.mesh); r.mesh = null; r.h = null;
}
function clearRider() { const r = G.lift?.rider; if (r?.mesh) scene.remove(r.mesh); if (r) { r.mesh = null; r.h = null; } if (G.lift) G.lift.rider = null; }
function riderStep(dt) {
  const r = G.lift?.rider; if (!r) return; r.clock += dt; if (r.h) { r.h.update(dt); liveFace(r.h, G.time, r.person.id * 3.1); }
  for (const e of r.events) if (!e.done && r.clock >= e.t) { e.done = true; e.fn(); }
}
function carStep(dt) {
  const c = world.car, L = G.lift; if (!c || G.phase !== 'play') return;
  const dx = P.x - c.x, dz = P.z - c.z, d = Math.hypot(dx, dz), inT = inCarTile(), s = dx * c.dx + dz * c.dy, locked = !!G.fx.liftLocked;
  world.setCarLocked(locked);
  if (!inT) L.armed = true;   // the panel only pops up when you walk into the car, not when you arrive in it
  if (d > 10) { L.far = true; if (L.rider) clearRider(); } else if (d < 6.5 && L.far) { L.far = false; rollRider(); }   // wander off and the rider is gone; come back and someone may be waiting
  if (!locked && !world.liftOpen && d < 4.4) world.setLiftOpen(true);
  else if (!inT && world.liftOpen && (locked || d > 5.6)) world.setLiftOpen(false);
  if (inT && L.armed && !locked && s < 0.25 && P.grounded) openLiftPanel();
}
function liftStep(dt, t) {
  const L = G.lift; G.time += dt; world.update(dt, t); dust.update(dt, P.x, P.z, camera, P.torch); updatePanelLights(dt);
  SHIP().tick(dt, { deckTime: G.deckTime, tension: 0, deck: G.deck }); G.fx = SHIP().effects(); G.comms?.tick(dt); nomTick(dt);
  let sh = 0;
  if (G.phase === 'ride') {
    L.t += dt; const k = Math.min(1, L.t / L.dur), e = k * k * (3 - 2 * k), disp = Math.round(L.from + (L.to - L.from) * e);
    if (disp !== L.disp) { L.disp = disp; sound.tone(1500, 0.05, 'square', 0.035); renderLiftPanel(); }
    const R = L.rider; if (R && !R.left && R.destIdx !== L.to && (L.to > L.from ? disp >= R.destIdx : disp <= R.destIdx)) { sound.ding(); leaveRider(); }   // their stop is on the way: they step out, you ride on
    riderStep(dt);
    L.hum -= dt; if (L.hum <= 0) { L.hum = 0.5; sound.tone(58 + 4 * Math.sin(L.t), 0.65, 'sine', 0.06); }
    sh = 0.006 + (k < 0.12 || k > 0.88 ? 0.008 : 0);
    if (k >= 1) { if (L.rider) leaveRider(); $('liftui').className = ''; loadDeck(L.to + 1); G.phase = 'play'; sound.ding(); sound.thud(0.3); return; }
  }
  camera.position.set(P.x + (Math.random() - 0.5) * sh, P.y + P.eye + (Math.random() - 0.5) * sh * 1.5, P.z + (Math.random() - 0.5) * sh);
  camera.rotation.order = 'YXZ'; camera.rotation.set(P.pitch + (Math.random() - 0.5) * sh * 0.5, P.yaw + (Math.random() - 0.5) * sh * 0.5, (Math.random() - 0.5) * sh * 0.4);
}

// ---------------- space madness ----------------
// One crew member at a time loses their mind, lowest rank first. They hunt the deck's other crew before you. Kill them
// and, shortly after, someone else on the deck starts screaming.
function npcFor(person, rnd = Math.random) { person.uniform = person.uniform || G.roster.uniformOf(person); const m = makeSurvivor(rnd, person) || makeCrew(person.uniform); m.userData.rank = person.short; return m; }
function startDeckMadness(data, n, rnd) {
  G.mad = { t: n === 1 ? 1e9 : 16 + rnd() * 14, pending: null };
  if (n !== 1) return;
  // the opener: the lowest-ranked redshirt, standing a few corridors from where you start, in plain view
  const person = nextMadness(G.roster, rnd, 'operations'); if (!person) return;
  const t = data.pickTile(([x, y]) => { const d = data.dist[x + y * data.W]; return d >= 3 && d <= 6 && !world.isTube(x, y); }) || data.pickTile(() => true); if (!t) return;
  person.status = 'seen'; const [cx, cz] = world.center(t[0], t[1]); const m = npcFor(person, rnd); m.position.set(cx, 0, cz); scene.add(m);
  const e = { kind: 'crew', mesh: m, x: cx, z: cz, t: 0, used: false, person, opener: true, openT: 16 }; ents.push(e); G.mad.pending = e;
}
function nextMadVictim() {
  const person = nextMadness(G.roster); if (!person) return;
  let e = ents.find(e => e.kind === 'crew' && e.person === person && !e.fake);
  if (!e) {   // they are somewhere else on this deck, out of sight
    const W = world.W, d = world.d, cand = d.openTiles.filter(([x, y]) => d.grid[y][x] === 0 && !world.isTube(x, y) && Math.hypot((x + 0.5) * TS - P.x, (y + 0.5) * TS - P.z) > 16 && !world.los((x + 0.5) * TS, (y + 0.5) * TS, P.x, P.z));
    const t = cand.length ? cand[Math.floor(Math.random() * cand.length)] : d.gornSpawn; const [cx, cz] = world.center(t[0], t[1]);
    person.status = 'seen'; const m = npcFor(person); m.position.set(cx, 0, cz); scene.add(m); e = { kind: 'crew', mesh: m, x: cx, z: cz, t: 0, used: true, person }; ents.push(e);
  }
  beginTurn(e);
}
function beginTurn(e) {
  G.director?.bump(0.2, 'someone turned');
  e.turning = 2.6; e.used = true; G.mad.pending = e; const H = e.mesh.userData.human, d = Math.hypot(e.x - P.x, e.z - P.z);
  if (H) { H.standing = false; H.play('hit_head', { loop: false, fade: 0.1 }); H.face({ JawDrop: 1, NoseWrinkler: 1, LeftBrowDown: 1, RightBrowDown: 1, UpperLipUp: 1 }); }
  sound.shriek(Math.max(0.06, 0.35 - d * 0.008)); if (d < 9) P.shake = Math.max(P.shake, 0.25);
  const who = `${e.person.short}, ${e.person.title}`;
  if (d < 14 && world.los(e.x, e.z, P.x, P.z)) G.say(`${who} clutches their head and starts to laugh…`, 'warn');
  else if (G.fx.comms < 2) G.say(garble(`Computer: Medical emergency — ${who}. Crew are advised to keep clear.`), 'warn');
  else G.say('Somewhere on this deck, someone starts screaming. Then laughing.', 'warn');
}
function turnStep(e, dt, d) {
  const H = e.mesh.userData.human; e.turning -= dt;
  e.mesh.rotation.y += (Math.random() - 0.5) * 0.25; if (H) { H.face({ JawDrop: 0.6 + Math.random() * 0.4 }); if (d < 30) H.update(dt); }
  if (e.turning > 0) return;
  const p = e.person, en = makeEnemy('crazed', world, world.tile(e.x, e.z), G.deck, 0, scene, sound, { human: { uniform: p.uniform, rank: p.rank, kind: p.body, person: p }, cfg: { name: `${p.short} (space madness)`, spawnMsg: '' } });
  en.mad = true; en.person = p; en.hp = 2; en.x = e.x; en.z = e.z; en.yaw = e.mesh.rotation.y; en.state = S.PATROL; en.mesh.visible = true; en.place(); gorns.push(en);
  p.status = 'crazed'; scene.remove(e.mesh); ents.splice(ents.indexOf(e), 1); G.mad.pending = null;
}
function updateMadness(dt) {
  const M = G.mad; if (!M || !world || G.phase !== 'play') return;
  const op = M.pending; if (op && op.opener && op.turning === undefined) { op.openT -= dt; if (op.openT <= 0 || Math.hypot(op.x - P.x, op.z - P.z) < 6.5) beginTurn(op); return; }
  if (M.pending || gorns.some(g => g.mad && !g.dead)) return;
  if (!G.director?.relaxing) M.t -= dt;   // the director's breather holds the next turn back
  if (M.t <= 0) { M.t = 1e9; nextMadVictim(); }
}
G.preyFor = (h) => { let best = null, bd = 1e9; for (const e of ents) { if (e.kind !== 'crew' || e.fake || e.turning !== undefined || e.dying) continue; const d = Math.hypot(e.x - h.x, e.z - h.z); if (d < bd) { bd = d; best = e; } } if (best && !best.id) best.id = Math.random(); return best; };
G.killNpc = (e, by) => {
  e.dying = true; const d = Math.hypot(e.x - P.x, e.z - P.z), p = e.person;
  bloodBurst(e.x, 1.2, e.z, 70, 3); decals.floor('blood0', e.x, e.z, 1.8, 1); sound.squelch();
  if (d < 40) { sound.shriek(Math.max(0.04, 0.32 - d * 0.008)); G.director?.bump(d < 20 ? 0.25 : 0.12, 'crew killed'); }
  if (d < 20 && world.los(e.x, e.z, P.x, P.z)) G.say(`${by.person ? by.person.short : 'The madman'} tears into ${p ? p.short : 'a crewman'}!`, 'warn');
  else if (d < 40) G.say('A scream, somewhere close. Then nothing.', 'warn');
  scene.remove(e.mesh); ents.splice(ents.indexOf(e), 1);   // game time, not wall time: no timers here
  const m = p ? makeCorpse(Math.random, p) : makeCrew(0xb02a20, true); if (m) { m.position.set(e.x, 0, e.z); m.rotation.y = Math.random() * 6.28; scene.add(m); ents.push({ kind: 'body', mesh: m, x: e.x, z: e.z, t: 0, used: false, person: p }); } if (p) p.status = 'corpse';
};
function killMad(e) {
  e.dead = true; e.mesh.visible = false; scene.remove(e.mesh); G.kills++; const p = e.person;
  bloodBurst(e.x, 1.2, e.z, 60, 3); decals.floor('blood1', e.x, e.z, 1.6, 1); sound.squelch(); flash('#fa5', 0.25);
  const m = makeCorpse(Math.random, p); if (m) { m.position.set(e.x, 0, e.z); scene.add(m); ents.push({ kind: 'body', mesh: m, x: e.x, z: e.z, t: 0, used: false, person: p }); }
  p.status = 'dead'; G.say(`${p.short} goes still. The madness isn't over — it never stops at one.`, 'good');
  G.mad.t = 12 + Math.random() * 8;
}

// ---------------- pacing director ----------------
function updateDirector(dt, tension) {
  const D = G.director; if (!D || G.phase !== 'play') return;
  const live = gorns.filter(g => !g.dead);
  const madAlive = live.some(g => g.mad);
  const act = D.update(dt, { tension, deckTime: G.deckTime, faults: G.shipState.faulted().length, dormant: live.filter(g => g.state === S.DORMANT && !g.mad && g.kind !== 'clinger').length, active: live.filter(g => g.active && g.kind !== 'clinger').length, madPending: G.mad && !G.mad.pending && !madAlive ? G.mad.t : Infinity });
  if (act === 'fault') G.shipState.randomFault({ deckTime: G.deckTime }, live.some(g => g.active && g.kind !== 'clinger') ? ['eps', 'lighting', 'reactor', 'comms', 'computer'] : null);
  else if (act === 'blackout') G.blackT = Math.min(G.blackT, 0.1);
  else if (act === 'wake') { const g = live.filter(g => g.state === S.DORMANT && !g.mad && g.kind !== 'clinger').sort((a, b) => a.delay - b.delay)[0]; if (g) g.delay = Math.min(g.delay, 2); }
  else if (act === 'madness') G.mad.t = Math.min(G.mad.t, 2.5);
  else if (act === 'nudge') {   // something "hears" you: it starts working its way toward your area
    const g = live.filter(g => g.active && g.kind !== 'clinger').sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
    if (g?.kind === 'phantom') g.relocate(P, 9, 13);
    else if (g && g.state !== S.CHASE && g.state !== S.STUNNED) { const [tx, ty] = world.tile(P.x + (Math.random() - 0.5) * 8, P.z + (Math.random() - 0.5) * 8); if (world.grid[ty]?.[tx] === 0) g.setTarget(tx, ty); else g.setTarget(...world.tile(P.x, P.z)); g.state = S.INVESTIGATE; g.timer = 12; sound.distant('steps'); }
  }
  if (dirDbg) { const el = $('dirdbg'); el.style.display = 'block'; el.textContent = `DIRECTOR ${D.phase.toUpperCase()} ${D.phase !== 'build' ? D.phaseT.toFixed(0) + 's' : 'next ' + D.gap.toFixed(0) + 's'}\nintensity ${'█'.repeat(Math.round(D.intensity * 20)).padEnd(20, '·')} ${D.intensity.toFixed(2)} / target ${D.target.toFixed(2)}\ntension ${tension.toFixed(2)} · faults ${G.shipState.faulted().length} · madness ${madAlive ? 'ACTIVE' : G.mad?.pending ? 'turning' : (G.mad?.t < 1e8 ? G.mad.t.toFixed(0) + 's' : '—')}\n${D.log.join('\n')}`; }
}
let dirDbg = false;
addEventListener('keydown', (e) => { if (e.code === 'F3') { e.preventDefault(); dirDbg = !dirDbg; if (!dirDbg) $('dirdbg').style.display = 'none'; } });

// crew who turn out to fix a fault: slow, and the madman's favourite target
function spawnRepairer(id) {
  const pt = repairPts.find(r => r.sys === id); if (!pt || ents.some(e => e.repairing?.sys === id)) return;
  const pool = G.roster.people.filter(p => p.dept === SYS[id].dept && p.status === 'unknown'); if (!pool.length) return;
  const person = pool[Math.floor(Math.random() * pool.length)];
  let x, z, face;
  if (!pt.main) { x = pt.x; z = pt.z; face = Math.atan2(pt.px - x, pt.pz - z); }
  else {
    const tt = pt.tx !== undefined ? [pt.tx, pt.ty] : world.d.exit; const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([a, b]) => world.grid[tt[1] + b]?.[tt[0] + a] === 0); if (!nb) return;
    [x, z] = world.center(tt[0] + nb[0], tt[1] + nb[1]); const [cx, cz] = world.center(tt[0], tt[1]); x += (cx - x) * 0.25; z += (cz - z) * 0.25; face = Math.atan2(cx - x, cz - z);
  }
  person.status = 'seen'; const m = npcFor(person); m.position.set(x, 0, z); m.rotation.y = face; scene.add(m);
  const H = m.userData.human; if (H) { H.standing = false; H.play(pt.main ? 'interact' : 'fixing_kneeling', { fade: 0 }); }
  ents.push({ kind: 'crew', mesh: m, x, z, t: 0, used: false, person, repairing: { sys: id, t: 0, need: 35 + Math.random() * 20 } });
  if (G.fx.comms < 2) G.say(garble(`Computer: ${person.short}, ${person.title}, responding to ${SYS[id].name}.`), 'comp');
}
function repairerStep(e, dt, d) {
  const R = e.repairing, H = e.mesh.userData.human;
  if (G.shipState.status(R.sys) === 'nominal') { e.repairing = null; if (H) { H.play('idle'); H.standing = true; } return; }
  R.t += dt; if (Math.random() < dt * 2 && d < 24) { for (let i = 0; i < 5; i++) sparks.add(e.x + Math.sin(e.mesh.rotation.y) * 0.5, 0.6 + Math.random() * 0.6, e.z + Math.cos(e.mesh.rotation.y) * 0.5, (Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2, SPARK, 0.4); }
  if (R.t >= R.need) { G.shipState.repair(R.sys); G.say(`${e.person.short} got ${SYS[R.sys].name} back online.`, 'good'); e.person.status = 'alive'; e.repairing = null; if (H) { H.play('idle'); H.standing = true; } }
}

let slow = 0;
function dyingStep(dt, t) {
  G.dyingT += dt; world.update(dt, t); blood.update(dt); sparks.update(dt); steam.update(dt);
  const k = Math.min(1, G.dyingT / 1.3);
  camera.position.set(P.x, 1.65 - 1.4 * k * k, P.z);
  camera.rotation.order = 'YXZ'; camera.rotation.set(P.pitch + 0.6 * k, P.yaw, k * 1.3);
  for (const g of gorns) if (g.active) { g.mesh.rotation.y = Math.atan2(P.x - g.x, P.z - g.z); }
}
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now(); const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now; elapsed += dt; const t = elapsed;
  if (G.phase === 'play' && world) step(dt, t);
  else if ((G.phase === 'ride' || G.phase === 'select') && world) liftStep(dt, t);
  else if (G.phase === 'dying' && world) dyingStep(dt, t);
  else if (world) { world.update(dt, t); dust.update(dt, P.x, P.z, camera, P.torch); }
  // auto-downgrade if the machine struggles
  if (CFG.quality === 'high' && G.phase === 'play') { slow = (dt > 0.045) ? slow + dt : Math.max(0, slow - dt * 2); if (slow > 4) { setQuality('low'); G.say('Performance mode enabled (change in pause menu)', 'comp'); slow = 0; } }
  if (CFG.quality === 'high') {
    const danger = parseFloat($('danger').style.opacity) || 0;
    post.render(dt, t, Math.min(1, danger), Math.max(0, invuln - 0.5) * 1.2 + Math.max(0, (G.glitchT || 0)) * 0.5 + (G.phase === 'dying' ? Math.min(1, G.dyingT / 1.5) * 0.6 : 0));
  } else { renderer.render(scene, camera); renderer.autoClear = false; renderer.clearDepth(); renderer.render(vmScene, vmCam); renderer.autoClear = true; }
}

// expose for debugging/tests
const ready = Promise.all([loadPersonas(), loadModels(), loadEnv(renderer, 'lobby'), loadTextures(), loadItems(), loadCommsData(), loadDuties()]).then(([, , env]) => { if (env) scene.environment = env; buildViewmodel(); const b = $('begin'); b.disabled = false; b.textContent = 'Begin shift'; });
$('begin').disabled = true; $('begin').textContent = 'Loading assets…';
window.__game = { ready, CFG, setQuality, decals, blood, sparks, post, die, G, P, get world() { return world; }, get director() { return G.director; }, get repairPts() { return repairPts; }, get shipState() { return G.shipState; }, get alerts() { return G.comms?.alerts; }, get comms() { return G.comms?.bus; }, get commsSim() { return G.comms?.sim; }, get bridge() { return G.comms?.bridge; }, get clock() { return G.comms?.clock; }, get commsHud() { return G.comms?.hud; }, get roster() { return G.roster; }, get sim() { return G.sim; }, get social() { return G.social; }, get duty() { return G.duty; }, get phases() { return G.phases; }, nomDie, nomEnd, switchPlayer, talkMenu, terminalMenu, startWalk, pathField, gaitFor, describeGait, fidgetStep, dodgeCheck, evacuationStep, simBodies, get hud2() { return G.hud2; }, get gorns() { return gorns; }, get ents() { return ents; }, newRun, loadDeck, fire, killMad, S, spawnRepairer, complete: completeDeck, step: (dt, t) => (G.phase === 'ride' || G.phase === 'select') ? liftStep(dt, t) : step(dt, t), liftTo: chooseDeck, rollRider, boardLift, leaveRider, destOf, riderDest, get rider() { return G.lift?.rider; }, speak, liftLine, openLiftPanel, closeLiftPanel, inCarTile, setMode(m) { G.mode = m === 'madness' ? 'madness' : 'nominal'; }, shipPlan, camera, scene, renderer, makeEnemy, sound };
Object.defineProperty(window.__game, 'haul', { get: () => G.haul }); Object.defineProperty(window.__game, 'kit', { get: () => G.kit }); window.__game.repairTime = (r) => repairTime(r); Object.assign(window.__game, { opStart, opEnd });   // equipment / carts (js/haul.js)
$('best').textContent = G.best ? `Best run: Deck ${G.best}` : '';
frame();
