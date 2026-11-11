import * as THREE from 'three';
import { SHIPS, ROOMS, PERKS, REDSHIRT_LINES, DEATH_LINES, pick } from './data.js';
import { generate, World, TS } from './world.js';
import { Sound } from './audio.js';
import { makeEnemy, S, THREATS } from './enemies.js';
import { loadModels, loadEnv, loadTextures, has as hasModel, instance } from './assets.js';
import { makeCrew, makeHologram, animateCrew, makeTribble, makeItem, makeViewmodel } from './actors.js';
import { makeSurvivor, makeCorpse, makeMedHolo, liveFace } from './humans.js';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';
import { Post, Particles, Decals, Dust } from './fx.js';
import { shipDeckFor, deckOptions, drawSchematic, zoneOf } from './ships.js';
import { makeComplement, ShipState, SYSTEMS, SYS, DEPT, DEPARTMENTS, DIVISION, HOST_LABEL, DEPT_LINES, pickCrewFor, nextMadness, CAN_TURN, renderOrgChart, renderLoadout, statusPill, STATUS_CSS } from './crew.js';
import { makeJunction, setLamp, makeBeacon } from './sysview.js';
import { mulberry32 } from './data.js';
import { movePlayer, resetMover, startGrapple, MOVE } from './move.js';

const $ = (id) => document.getElementById(id);
{ const st = document.createElement('style'); st.textContent = STATUS_CSS; document.head.appendChild(st); }
const winDeck = () => G.ship ? G.ship.decks : 8;   // a run is one ship, top deck to keel
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
let panelSel = [], panelT = 0;
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
    l.color.set(ship.light).lerp(new THREE.Color(0xff2010), al * 0.7);
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
const sound = new Sound(); sound.vol = CFG.vol;
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
  $('objective').innerHTML = G.chips >= need
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

function loadDeck(n) {
  clearLevel(); decals.clear(); blood.clear(); sparks.clear(); steam.clear(); clearSplats();
  resetMover(P); rope.visible = hook.visible = false;
  G.deck = n; G.chips = 0; G.deckTime = 0; G.shield = !!perk('shield');
  ship = G.ship;
  G.shipDeck = shipDeckFor(ship, n, winDeck());
  const data = generate(n - 1, G.runSeed + n * 7919, deckOptions(ship, G.shipDeck));
  data.flooded = n === 3 || n === 6 || (n > 8 && Math.random() < 0.25);
  world = new World(data, ship); scene.add(world.group); world.setFancy(CFG.quality === 'high');
  scene.fog = new THREE.FogExp2(ship.fog, ship.fogD); scene.background = new THREE.Color(ship.fog);
  hemi.color.set(ship.light); hemi.groundColor.set(ship.floor);
  lamp.color.set(ship.light);

  const [sx, sy] = data.start; [P.x, P.z] = world.center(sx, sy);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => data.grid[sy + dy]?.[sx + dx] === 0);
  const [dx, dy] = dirs[0] || [1, 0]; P.yaw = Math.atan2(-dx, -dy); P.pitch = 0; P.vx = P.vz = 0;
  world.reveal(P.x, P.z, 3);

  const rnd = data.rnd;
  const luck = perk('luck');
  const add = (kind, tile, mesh, extra = {}) => {
    const [cx, cz] = world.center(tile[0], tile[1]);
    mesh.position.x = cx + (extra.ox || 0); mesh.position.z = cz + (extra.oz || 0);
    scene.add(mesh); const e = { kind, mesh, x: mesh.position.x, z: mesh.position.z, t: rnd() * 6, ...extra }; ents.push(e); return e;
  };
  for (const c of data.chips) add('chip', c, makeItem('chip'));
  const sup = G.fx ? G.fx.supplies : 0;   // broken replicators = emptier supply lockers
  const nb = Math.max(0, 1 + (n > 2 ? 1 : 0) + luck + sup), nm = Math.max(1, 1 + luck + (n > 3 ? 1 : 0) + sup);
  for (let i = 0; i < nb; i++) { const t = data.pickTile(() => true); if (t) add('battery', t, makeItem('battery')); }
  for (let i = 0; i < nm; i++) { const t = data.pickTile(() => true); if (t) add('medkit', t, makeItem('medkit')); }
  const nt = 3 + Math.floor(rnd() * 4);
  for (let i = 0; i < nt; i++) { const t = data.pickTile(() => true); if (t) add('tribble', t, makeTribble(), { ox: (rnd() - 0.5) * 1.2, oz: (rnd() - 0.5) * 1.2 }); }
  // survivors + bodies
  for (let i = 0; i < 3 + (n > 2 ? 1 : 0); i++) {
    const t = data.pickTile(() => true); if (!t) continue;
    const person = pickCrewFor(G.roster, zoneOf(G.shipDeck / Math.max(1, ship.decks - 1)).label, rnd); if (person) person.status = 'seen';
    const m = makeSurvivor(rnd, person) || makeCrew([0xb02a20, 0xd0a020, 0x2a5fb0][Math.floor(rnd() * 3)]); m.rotation.y = rnd() * 6.28;
    if (person) m.userData.rank = person.short;
    add('crew', t, m, { used: false, fake: n >= 2 && rnd() < 0.3, person });
  }
  for (let i = 0; i < (n >= 3 ? 2 : 1); i++) { const t = data.pickTile(() => true); if (!t) continue; const person = pickCrewFor(G.roster, zoneOf(G.shipDeck / Math.max(1, ship.decks - 1)).label, rnd); if (person) person.status = 'corpse'; add('body', t, makeCorpse(rnd, person) || makeCrew(0xb02a20, true), { used: false, person }); }
  { const t = data.rooms.find(r => r.type === 'sickbay'); if (t) {
      const tile = data.pickTile(([x, y]) => data.room[y][x] === 'sickbay');
      if (tile && (!G.fx || G.fx.emh)) add('emh', tile, makeMedHolo() || makeHologram(), { used: false });
  } }

  // Jiffy tubes: something worth crawling for in the middle, and sometimes something waiting
  for (const t of data.tubes) {
    const mid = t.tiles[(t.ladder > 0 ? t.ladder : t.tiles.length) >> 1];   // on the lower run
    const kind = rnd() < 0.5 ? 'battery' : 'medkit'; add(kind, mid, makeItem(kind));
  }
  spawnThreats(data, n, rnd);
  for (const t of data.tubes) if (n >= 3 && t.tiles.length >= 3 && rnd() < 0.4) gorns.push(makeEnemy('clinger', world, t.tiles[t.ladder === 1 ? 0 : 1], n, 0, scene, sound));
  placeGore(data, rnd, n);
  placeRepairPoints(data);
  startDeckMadness(data, n, rnd);
  world.setLiftOpen(false); world.setAlert(false); world.setPower(true); sound.setPower(true);
  G.blackout = 0; G.blackT = 40 + Math.random() * 50; G.lurchT = 20 + Math.random() * 20; G.repairT = 0; G.distT = 20 + Math.random() * 20; G.hints = {};
  showCard(n, ship, data.flooded);
  $('decklbl').textContent = 'DECK ' + n;
  $('shipcls').textContent = ship.cls + '-class';
  $('shipname').textContent = ship.name + ' · ' + ship.reg;
  updateHUD();
  G.say(`${ship.name} ${ship.reg} — find ${data.chips.length} logic chips`, 'good');
  if (n === 1) setTimeout(() => { if (G.phase === 'play' && G.deck === 1) G.say('Space: jump / climb crates · C while sprinting: slide · Q: grapple line', ''); }, 4500);
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
  const c = $('card'); c.innerHTML = `<small>${ship.cls.toUpperCase()}-CLASS</small><b>DECK ${n}</b><span>${ship.name} · ${ship.reg} · ship deck ${String(G.shipDeck + 1).padStart(2, '0')} of ${ship.decks}</span>${flooded ? '<em>Coolant leak — deck flooded</em>' : ''}<div class="thr">${(G.threats || []).map(t => THREATS[t]).join('<br>')}</div>`;
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

// ---------------- run control ----------------
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function newRun() {
  Object.assign(G, { hp: 100, maxHp: 100, stamina: 100, phaser: 3, maxPhaser: 3, perks: {}, tribbles: 0, kills: 0, stuns: 0, time: 0, endless: false, runSeed: Math.floor(Math.random() * 1e6) });
  G.shipOrder = shuffle(SHIPS.map((_, i) => i));
  G.ship = SHIPS[G.shipOrder[0]];
  G.roster = makeComplement(G.ship, G.runSeed); for (const p of G.roster.people) p.uniform = G.roster.uniformOf(p);
  G.shipState = new ShipState(G.ship, G.runSeed); G.fx = G.shipState.effects(); G.shipState.on(onShipEvent);
  hideScreens(); fade(0);
  loadDeck(1);
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
      $('winstats').textContent = `${winDeck()} decks of the ${G.ship.name}, ${G.tribbles} furbles, ${G.stuns} hostiles stunned. Time: ${fmtTime(G.time)}.`;
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
    el.innerHTML = `<h3>${i + 1}. ${p.name}</h3><p>${p.desc}</p><small>${perk(p.id) ? 'Owned ×' + perk(p.id) : 'New'}</small>`;
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
  $('stats').innerHTML = `Reached <b>Deck ${deckReached}</b> aboard the ${ship.name} (${ship.reg}).<br>Furbles rescued: ${G.tribbles} · Hostiles stunned: ${G.stuns} · Time: ${fmtTime(G.time)}<br>Best: Deck ${G.best}`;
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
G.clingOn = (c) => { P.clung = 4.5; P.clungMax = 4.5; G.say('SOMETHING IS ON YOUR FACE! Mash E to tear it off!', 'warn'); $('clung').style.opacity = 1; sound.squelch(); G.hp -= 6; flash('#600', 0.5); bloodBurst(P.x, 1.5, P.z, 20, 2); if (G.hp <= 0) die(c); };
G.dragDown = (e) => { const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz) || 1; P.kbx = -dx / d * 9 * G.fx.knockMul; P.kbz = -dz / d * 9 * G.fx.knockMul; P.vy = 2; P.grounded = false; if (P.mode !== 'grapple') P.mode = 'air'; P.shake = 0.5; G.hp -= 6; flash('#c00', 0.4); sound.hit(); G.say(e.name + ' drags you down!', 'warn'); updateHUD(); if (G.hp <= 0) die(e); };
G.hitPlayer = (gorn, dmg) => {
  if (invuln > 0 || G.phase !== 'play') return;
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
  if (G.phase === 'perk') { const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code); if (i >= 0 && G.perkChoices[i]) choosePerk(G.perkChoices[i]); }
  if (G.phase === 'play') {
    if (e.code === 'KeyF') { P.torch = !P.torch; torch.visible = P.torch; if (beamCone) beamCone.visible = P.torch && CFG.quality === 'high'; sound.flick(); }
    if (e.code === 'KeyM') { mapOn = !mapOn; $('minimap').style.display = mapOn ? '' : 'none'; }
    if (e.code === 'KeyE') { if (P.clung > 0) { P.clung -= 0.8; sound.squelch(); bloodBurst(P.x, 1.5, P.z, 6, 1.5); } else interact(); }
    if (e.code === 'KeyQ' && !e.repeat) fireGrapple();
  }
  if ((e.code === 'Enter') && (G.phase === 'dead' || G.phase === 'title')) newRun();
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'Tab') showStatus(false); });
addEventListener('mousemove', (e) => {
  if (!locked || G.phase !== 'play') return;
  P.yaw -= e.movementX * 0.0022 * CFG.sens; P.pitch = Math.max(-1.45, Math.min(1.45, P.pitch - e.movementY * 0.0022 * CFG.sens));
});
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousedown', (e) => { if (G.phase === 'play' && locked && e.button === 2) fireGrapple(); else if (G.phase === 'play' && locked && e.button === 0) fire(); else if (G.phase === 'paused' && !e.target.closest('.settings, .noresume')) resumeGame(); });
function resumeGame() { hideScreens(); G.phase = 'play'; requestLock(); }
$('sens').oninput = (e) => { CFG.sens = +e.target.value; saveCfg(); };
$('vol').oninput = (e) => { CFG.vol = +e.target.value; sound.setVolume(CFG.vol); saveCfg(); };
$('qsel').onchange = (e) => setQuality(e.target.value);
$('sens').value = CFG.sens; $('vol').value = CFG.vol; $('qsel').value = CFG.quality;
if (CFG.quality === 'low') setQuality('low');
$('resume').onmousedown = (e) => e.stopPropagation();
$('credbtn').onclick = () => showScreen('credits'); $('companybtn').onclick = (e) => { e.stopPropagation(); showCompany(); }; $('companyback').onclick = (e) => { e.stopPropagation(); showScreen('pause'); }; $('credback').onclick = () => showScreen('title');
$('begin').onclick = newRun; $('again').onclick = newRun; $('again2').onclick = newRun; $('resume').onclick = resumeGame;
$('cont').onclick = () => { G.endless = true; hideScreens(); fade(0, 600); offerPerks(); };

// ---------------- actions ----------------
const _v = new THREE.Vector3(), _f = new THREE.Vector3();
function fire() {
  if (G.phase !== 'play' || shot > 0) return;
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
  const near = nearest(2.2, e => ['crew', 'body', 'emh'].includes(e.kind) && !e.used);
  if (near) {
    near.used = true; sound.pickup();
    if (near.kind === 'crew' && near.fake) {
      scene.remove(near.mesh); ents.splice(ents.indexOf(near), 1); if (near.person) near.person.status = 'dead';   // the real one is long gone
      const en = makeEnemy('slimeling', world, world.tile(near.x, near.z), G.deck, 0, scene, sound); en.state = S.PATROL; en.mesh.visible = true; en.x = near.x; en.z = near.z; en.pickPatrol(P); en.state = S.CHASE; en.timer = 6; en.setTarget(...world.tile(P.x, P.z)); gorns.push(en);
      G.say('"Hello fellow crewman! I am definitely not— *SCHLOOORP*"', 'warn'); sound.shriek(0.3); flash('#240', 0.4); P.shake = 0.5; return;
    }
    if (near.kind === 'crew') {
      const pr = near.person, who = pr ? `${pr.short}, ${pr.title}` : 'Crewman';
      const line = pr && Math.random() < 0.7 ? pick(DEPT_LINES[pr.dept]) : pick(REDSHIRT_LINES);
      if (G.fx.evac) {   // transporters up: beam them to safety
        G.say(`${who}: ${line} — Transporter room, one to beam out!`, 'npc'); if (pr) pr.status = 'evacuated';
        for (let i = 0; i < 40; i++) sparks.add(near.x + (Math.random() - 0.5) * 0.6, Math.random() * 1.9, near.z + (Math.random() - 0.5) * 0.6, 0, 0.4 + Math.random(), 0, BEAM, 0.9);
        sound.tone(880, 0.9, 'sine', 0.06, 600); setTimeout(() => { scene.remove(near.mesh); const i = ents.indexOf(near); if (i >= 0) ents.splice(i, 1); }, 650); giveLoot();
      } else { G.say(`${who}: ${line}`, 'npc'); if (pr) pr.status = 'alive'; if (Math.random() < 0.6) giveLoot(); }
    } else if (near.kind === 'body') { const pr = near.person; if (pr && pr.status !== 'dead') pr.status = 'dead'; G.say(pr ? `${pr.full}, ${pr.title} (${DEPT[pr.dept].name}). Dead. You take what they had.` : 'You search the crewman\'s body…', 'npc'); giveLoot(true); }
    else if (near.kind === 'emh' && !G.fx.emh) { G.say('The emitter crackles. No hologram. (Medical Hologram offline)', 'warn'); near.used = false; }
    else if (near.kind === 'emh') { G.say('Hologram: "Please describe your medical emergency. Or don\'t. I\'m a projection, not a mind-reader." (healed)', 'good'); G.hp = Math.min(G.maxHp, G.hp + 50); sound.heal(); }
    updateHUD(); return;
  }
  // lift
  if (world && Math.hypot(P.x - world.liftPos.x, P.z - world.liftPos.z) < 2.8) {
    if (G.fx.liftLocked) { sound.denied(); G.say('Tubelift controller OFFLINE — repair it at the lift controls (hold E)', 'warn'); }
    else if (G.chips >= world.d.chips.length) completeDeck();
    else { sound.denied(); G.say(`Tubelift offline — ${world.d.chips.length - G.chips} logic chip(s) missing`, 'warn'); }
  }
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
  if ((G.fx.liftOnMap && ld < (R + 3) * TS) || world.explored[world.d.exit[0] + world.d.exit[1] * W]) blip(lp.x, lp.z, G.chips >= world.d.chips.length ? '#6f6' : '#f55', 2);
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
  gunVM.rotation.set(0.05, 0.1, 0); gunVM.scale.setScalar(0.9);
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
  updateShipSystems(dt, tension); updateMadness(dt);
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
      if (e.turning !== undefined) { turnStep(e, dt, d); continue; }
      if (H && e.kind === 'crew' && !e.fake) { const mad = gorns.find(g => g.mad && !g.dead && g.state !== S.DORMANT && Math.hypot(g.x - e.x, g.z - e.z) < 10 && world.los(g.x, g.z, e.x, e.z)); if (mad && !e.cower) { e.cower = true; H.standing = false; H.play('crouch_idle', { fade: 0.2 }); H.face({ JawDrop: 0.7, LeftInnerBrowUp: 1, RightInnerBrowUp: 1, LeftUpperLidOpen: 1, RightUpperLidOpen: 1 }); if (d < 30) { sound.shriek(Math.max(0.05, 0.25 - d * 0.007)); if (d < 18) G.say(`${e.person ? e.person.short : 'A crewman'} screams: "${pick(['It\'s ' + (mad.person ? mad.person.given : 'him') + '! Something\'s wrong with ' + (mad.person ? mad.person.given : 'him') + '!', 'Stay back! STAY BACK!', 'No no no no—'])}"`, 'warn'); } } }
      if (H) {
        if (d > 22) continue;                       // far away: skip skinning updates
        if (H.standing && d < 9) e.mesh.rotation.y += da * Math.min(1, dt * 2.5);
        H.lookYaw += ((d < 7 ? Math.max(-0.9, Math.min(0.9, da)) : 0) - H.lookYaw) * Math.min(1, dt * 4);
        if (!e.fake) liveFace(H, e.t, e.mesh.id);   // impostors never blink
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
  else if (Math.hypot(P.x - world.liftPos.x, P.z - world.liftPos.z) < 2.8) prompt = G.chips >= world.d.chips.length ? '[E] Board tubelift' : 'Tubelift offline';
  else if (rp) prompt = `${SYS[rp.sys].name} — nominal`;
  $('prompt').textContent = prompt;

  // room label + exploration
  const [tx, ty] = world.tile(P.x, P.z);
  const rt = world.d.room[ty]?.[tx];
  $('roomname').textContent = rt ? ROOMS[rt].label : 'Corridor';
  if (rt === 'jefferies' && !G.hints.tube) { G.hints.tube = 1; G.say('You squeeze into a Jiffy tube. The big ones cannot follow — the small ones can.', 'npc'); }
  mapT += dt; if (mapT > 0.12) { mapT = 0; world.reveal(P.x, P.z, 3); drawMap(); updateHUD(); }

  // environment flicker / lights
  world.update(dt, t);
  lamp.position.set(P.x, 2.4, P.z);
  flickT -= dt;
  if (flickT <= 0) { flickT = 0.05 + Math.random() * 0.1; const bad = tension > 0.5 && Math.random() < 0.15; hemi.intensity = (bad ? 0.5 : 1.9 + (Math.random() < 0.02 ? -1.2 : 0)) * (0.03 + 0.97 * world.powerAmt); }
  lamp.intensity = 9 * (0.15 + 0.85 * world.powerAmt);

  // particles & ambient events
  blood.update(dt); sparks.update(dt); steam.update(dt); water.update(dt); dust.update(dt, P.x, P.z, camera, P.torch);
  updatePanelLights(dt);
  // rolling blackouts: the hum stops, the lights die, something is still walking
  if (G.blackout > 0) { G.blackout -= dt; if (G.blackout <= 0) { world.setPower(true); sound.setPower(true); sound.powerUp(); } }
  else { G.blackT -= dt; if (G.blackT <= 0 && G.deckTime > 25) { G.blackout = 5 + Math.random() * 5; G.blackT = (G.fx.blackoutEvery || 170) * (0.7 + Math.random() * 0.6); world.setPower(false); sound.setPower(false); sound.powerDown(); G.say('Computer: Main power failure. Emergency lighting only.', 'comp'); } }
  world.powerTarget = G.blackout > 0 ? 0 : G.fx.power; world.lightFault = G.fx.lightFlicker;
  G.distT -= dt; if (G.distT <= 0) { G.distT = 25 + Math.random() * 30; sound.distant(pick(['steps', 'steps', 'scrape', 'door', 'whisper'])); }
  for (const dr of world.drips) if (dr.fire) { dr.fire = false; if (Math.hypot(dr.x - P.x, dr.z - P.z) < 16) { for (let i = 0; i < 4; i++) water.add(dr.x, dr.y - 0.1, dr.z, (Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3, WATER, 1.2); sound.drip(); } }
  if (G.phase === 'play' && G.deck === 1) {
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
  if (G.annT <= 0) { G.annT = 50 + Math.random() * 40; if (G.fx.comms < 2) { sound.chirp(); G.say('Computer: ' + garble(pick(COMPUTER)), 'comp'); } }
  G.clangT = (G.clangT ?? 20) - dt;
  if (G.clangT <= 0) { G.clangT = 18 + Math.random() * 30; sound.clang(0.15); }
  if (G.stamina < 25) { G.breathT = (G.breathT || 0) - dt; if (G.breathT <= 0) { G.breathT = 0.7; sound.breath(0.1); } }

  if (gunVM) { gunKick = Math.max(0, gunKick - dt * 6); gunVM.position.set(0.18 + Math.sin(P.bob * 1.1) * 0.006, -0.15 + Math.abs(Math.sin(P.bob * 1.1)) * 0.008 + (P.crouch ? 0.02 : 0) - Math.max(-0.04, Math.min(0.05, P.vy * 0.006)) - P.land * 0.03, -0.4 + gunKick * 0.05); gunVM.rotation.z = -P.roll * 1.5;
    { const pa = world ? world.powerAmt : 1, al = world ? world.alertAmt : 0; vmHemi.intensity = 0.05 + 0.5 * pa; vmKey.intensity = 0.1 + 1.3 * pa; vmKey.color.set(ship ? ship.light : 0xffffff).lerp(new THREE.Color(0xff2010), al * 0.6); vmRim.intensity = P.torch ? 1.2 : 0; } gunVM.rotation.x = 0.05 + gunKick * 0.25; muzzle.material.opacity = gunKick > 0.6 ? 1 : 0; gunVM.visible = G.phase === 'play'; }
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
  if (G.phase !== 'play' || P.clung > 0) return;
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
const repairTime = (r) => SYS[r.sys].repair * (r.main ? 1 : 1.5) * (1 + perk('boots') * 0);
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
  let jn = 0;
  for (const s of SYSTEMS) {
    let pt = null;
    if (s.host === 'lift') pt = { x: world.liftPos.x, z: world.liftPos.z, main: true, reach: 2.8, y: 2.2, where: 'tubelift controls' };
    else if (s.host !== 'junction') {
      const [kind, room] = s.host.split('@'), kinds = kind === 'tree' ? ['tree', 'plant'] : [kind];
      const pr = data.props.find(p => kinds.includes(p.kind) && (!room || data.room[p.ty][p.tx] === room) && !repairPts.some(r => r.tx === p.tx && r.ty === p.ty));
      if (pr) { const [x, z] = world.center(pr.tx, pr.ty); pt = { x, z, tx: pr.tx, ty: pr.ty, main: true, reach: 2.2, y: pr.kind === 'warpcore' ? 2.0 : 1.6, where: HOST_LABEL[s.host] }; }
    }
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
  if (ev.quiet || !world || G.phase !== 'play') return;
  G.fx = SHIP().effects();
  const r = repairPts.find(r => r.sys === ev.id);
  if (ev.type === 'fault') {
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
  const p = e.person, en = makeEnemy('crazed', world, world.tile(e.x, e.z), G.deck, 0, scene, sound, { human: { uniform: p.uniform, rank: p.rank, kind: p.body }, cfg: { name: `${p.short} (space madness)`, spawnMsg: '' } });
  en.mad = true; en.person = p; en.hp = 2; en.x = e.x; en.z = e.z; en.yaw = e.mesh.rotation.y; en.state = S.PATROL; en.mesh.visible = true; en.place(); gorns.push(en);
  p.status = 'crazed'; scene.remove(e.mesh); ents.splice(ents.indexOf(e), 1); G.mad.pending = null;
}
function updateMadness(dt) {
  const M = G.mad; if (!M || !world || G.phase !== 'play') return;
  const op = M.pending; if (op && op.opener && op.turning === undefined) { op.openT -= dt; if (op.openT <= 0 || Math.hypot(op.x - P.x, op.z - P.z) < 6.5) beginTurn(op); return; }
  if (M.pending || gorns.some(g => g.mad && !g.dead)) return;
  M.t -= dt; if (M.t <= 0) { M.t = 1e9; nextMadVictim(); }
}
G.preyFor = (h) => { let best = null, bd = 1e9; for (const e of ents) { if (e.kind !== 'crew' || e.fake || e.turning !== undefined || e.dying) continue; const d = Math.hypot(e.x - h.x, e.z - h.z); if (d < bd) { bd = d; best = e; } } if (best && !best.id) best.id = Math.random(); return best; };
G.killNpc = (e, by) => {
  e.dying = true; const d = Math.hypot(e.x - P.x, e.z - P.z), p = e.person;
  bloodBurst(e.x, 1.2, e.z, 70, 3); decals.floor('blood0', e.x, e.z, 1.8, 1); sound.squelch();
  if (d < 40) sound.shriek(Math.max(0.04, 0.32 - d * 0.008));
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
const ready = Promise.all([loadModels(), loadEnv(renderer, 'lobby'), loadTextures()]).then(([, env]) => { if (env) scene.environment = env; buildViewmodel(); const b = $('begin'); b.disabled = false; b.textContent = 'Begin shift'; });
$('begin').disabled = true; $('begin').textContent = 'Loading assets…';
window.__game = { ready, CFG, setQuality, decals, blood, sparks, post, die, G, P, get world() { return world; }, get repairPts() { return repairPts; }, get shipState() { return G.shipState; }, get roster() { return G.roster; }, get gorns() { return gorns; }, get ents() { return ents; }, newRun, loadDeck, fire, killMad, S, complete: completeDeck, step, camera, scene, renderer, makeEnemy, sound };
$('best').textContent = G.best ? `Best run: Deck ${G.best}` : '';
frame();
