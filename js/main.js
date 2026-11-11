import * as THREE from 'three';
import { SHIPS, ROOMS, PERKS, REDSHIRT_LINES, DEATH_LINES, pick } from './data.js';
import { generate, World, TS } from './world.js';
import { Sound } from './audio.js';
import { makeEnemy, S, THREATS } from './enemies.js';
import { loadModels, loadEnv, has as hasModel, instance } from './assets.js';
import { makeCrew, makeHologram, animateCrew, makeTribble, makeItem } from './actors.js';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';
import { Post, Particles, Decals, Dust } from './fx.js';

const $ = (id) => document.getElementById(id);
const WIN_DECK = 8;
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
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
torch.castShadow = true; torch.shadow.mapSize.set(1024, 1024); torch.shadow.camera.near = 0.2; torch.shadow.camera.far = 30; torch.shadow.bias = -0.0004; torch.shadow.normalBias = 0.04;
let post = null;
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); post?.setSize(innerWidth, innerHeight); }
addEventListener('resize', resize); resize();
post = new Post(renderer, scene, camera);
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
const keys = {};
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
  gorns = []; ents = [];
}

function loadDeck(n) {
  clearLevel(); decals.clear(); blood.clear(); sparks.clear(); steam.clear(); clearSplats();
  G.deck = n; G.chips = 0; G.deckTime = 0; G.shield = !!perk('shield');
  ship = SHIPS[G.shipOrder[(n - 1) % G.shipOrder.length]];
  const data = generate(n - 1, G.runSeed + n * 7919);
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
  const nb = 1 + (n > 2 ? 1 : 0) + luck, nm = 1 + luck + (n > 3 ? 1 : 0);
  for (let i = 0; i < nb; i++) { const t = data.pickTile(() => true); if (t) add('battery', t, makeItem('battery')); }
  for (let i = 0; i < nm; i++) { const t = data.pickTile(() => true); if (t) add('medkit', t, makeItem('medkit')); }
  const nt = 3 + Math.floor(rnd() * 4);
  for (let i = 0; i < nt; i++) { const t = data.pickTile(() => true); if (t) add('tribble', t, makeTribble(), { ox: (rnd() - 0.5) * 1.2, oz: (rnd() - 0.5) * 1.2 }); }
  // survivors + bodies
  for (let i = 0; i < 2; i++) {
    const t = data.pickTile(() => true); if (!t) continue;
    const m = makeCrew([0xb02a20, 0xd0a020, 0x2a5fb0][Math.floor(rnd() * 3)]); m.rotation.y = rnd() * 6.28;
    add('crew', t, m, { used: false, fake: n >= 2 && rnd() < 0.3 });
  }
  { const t = data.pickTile(() => true); if (t) add('body', t, makeCrew(0xb02a20, true), { used: false }); }
  { const t = data.rooms.find(r => r.type === 'sickbay'); if (t) {
      const tile = data.pickTile(([x, y]) => data.room[y][x] === 'sickbay');
      if (tile) add('emh', tile, makeHologram(), { used: false });
  } }

  spawnThreats(data, n, rnd);
  placeGore(data, rnd, n);
  world.setLiftOpen(false); world.setAlert(false); world.setPower(true); sound.setPower(true);
  G.blackout = 0; G.blackT = 40 + Math.random() * 50; G.distT = 20 + Math.random() * 20; G.hints = {};
  showCard(n, ship, data.flooded);
  $('decklbl').textContent = 'DECK ' + n;
  $('shipcls').textContent = ship.cls + '-class';
  $('shipname').textContent = ship.name + ' · ' + ship.reg;
  updateHUD();
  G.say(`${ship.name} ${ship.reg} — find ${data.chips.length} logic chips`, 'good');
}

function spawnThreats(data, n, rnd) {
  const pool = shuffle(['gronk', 'drone', 'phantom', 'crazed']);
  const chosen = n === 1 ? [pick(['gronk', 'drone', 'crazed'])] : pool.slice(0, n < 3 ? 1 : n < 6 ? 2 : 3);
  G.threats = [];
  const far = (f) => data.pickTile(([x, y]) => data.dist[x + y * data.W] >= data.maxD * f) || data.gornSpawn;
  chosen.forEach((type, i) => {
    const delay = Math.max(10, 28 - n * 2) + i * 22, count = type === 'crazed' ? 1 + (n > 2 ? 1 : 0) + (n > 5 ? 1 : 0) : 1;
    for (let k = 0; k < count; k++) gorns.push(makeEnemy(type, world, i === 0 && k === 0 ? data.gornSpawn : far(0.4), n, delay + k * 7, scene, sound));
    G.threats.push(type);
  });
  const nc = n >= 2 ? Math.min(4, 1 + Math.floor(rnd() * (1 + n / 3))) : 0; let made = 0;
  for (let i = 0; i < nc; i++) { const t = data.pickTile(([x, y]) => !data.room[y][x] && data.dist[x + y * data.W] > data.maxD * 0.15); if (t) { gorns.push(makeEnemy('clinger', world, t, n, 0, scene, sound)); made++; } }
  if (made) G.threats.push('clinger');
  if (n >= 2 && ents.some(e => e.fake)) G.threats.push('slimeling');
}
function showCard(n, ship, flooded) {
  const c = $('card'); c.innerHTML = `<small>${ship.cls.toUpperCase()}-CLASS</small><b>DECK ${n}</b><span>${ship.name} · ${ship.reg}</span>${flooded ? '<em>Coolant leak — deck flooded</em>' : ''}<div class="thr">${(G.threats || []).map(t => THREATS[t]).join('<br>')}</div>`;
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
    if (G.deck >= WIN_DECK && !G.endless) {
      document.exitPointerLock?.();
      $('winstats').textContent = `${WIN_DECK} decks, ${G.tribbles} furbles, ${G.stuns} hostiles stunned. Time: ${fmtTime(G.time)}.`;
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

function die(by) {
  G.phase = 'dying'; G.dyingT = 0; sound.death(); document.exitPointerLock?.();
  bloodBurst(P.x, 1.0, P.z, 120, 5); for (let i = 0; i < 6; i++) decals.floor('blood', P.x + (Math.random() - 0.5) * 2, P.z + (Math.random() - 0.5) * 2, 1.2 + Math.random(), 1);
  screenSplat(14, true); sound.roar(0.35); by.roar = 1.5; $('danger').style.opacity = 1; $('prompt').textContent = '';
  const deckReached = G.deck;
  if (deckReached > G.best) { G.best = deckReached; localStorage.setItem('fb_best', deckReached); }
  $('deathline').textContent = pick(DEATH_LINES);
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
G.hitPlayer = (gorn, dmg) => {
  if (invuln > 0 || G.phase !== 'play') return;
  if (G.shield) { G.shield = false; G.say('Deflector absorbed the hit!', 'good'); flash('#39f', 0.5); sound.hit(); }
  else { G.hp -= dmg; flash('#c00', 0.7); sound.hit(); G.say(gorn.name + ' attacks!', 'warn'); }
  P.shake = 0.6; invuln = 1.2;
  if (!G.shield || G.hp < G.maxHp) { bloodBurst(P.x, 1.2, P.z, 60, 4, Math.sin(gorn.yaw) * 2, Math.cos(gorn.yaw) * 2); decals.floor('blood1', P.x, P.z, 1.4, 1); sound.squelch(); screenSplat(4); gorn.bloodTrail = 14; }
  const dx = P.x - gorn.x, dz = P.z - gorn.z, d = Math.hypot(dx, dz) || 1;
  const kb = perk('dampener') ? 4 : 8; P.kbx = dx / d * kb; P.kbz = dz / d * kb;
  if (gorn.cfg) { gorn.attackCd = Math.max(gorn.attackCd, gorn.cfg.atkCd); gorn.state = S.SEARCH; gorn.timer = 4; }
  if (G.hp <= 0) die(gorn);
  updateHUD();
};

// ---------------- input ----------------
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (G.phase === 'perk') { const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code); if (i >= 0 && G.perkChoices[i]) choosePerk(G.perkChoices[i]); }
  if (G.phase === 'play') {
    if (e.code === 'KeyF') { P.torch = !P.torch; torch.visible = P.torch; if (beamCone) beamCone.visible = P.torch && CFG.quality === 'high'; sound.flick(); }
    if (e.code === 'KeyM') { mapOn = !mapOn; $('minimap').style.display = mapOn ? '' : 'none'; }
    if (e.code === 'KeyE') { if (P.clung > 0) { P.clung -= 0.8; sound.squelch(); bloodBurst(P.x, 1.5, P.z, 6, 1.5); } else interact(); }
    if (e.code === 'Space') { e.preventDefault(); fire(); }
  }
  if ((e.code === 'Enter') && (G.phase === 'dead' || G.phase === 'title')) newRun();
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', (e) => keys[e.code] = false);
addEventListener('mousemove', (e) => {
  if (!locked || G.phase !== 'play') return;
  P.yaw -= e.movementX * 0.0022 * CFG.sens; P.pitch = Math.max(-1.45, Math.min(1.45, P.pitch - e.movementY * 0.0022 * CFG.sens));
});
addEventListener('mousedown', (e) => { if (G.phase === 'play' && locked && e.button === 0) fire(); else if (G.phase === 'paused' && !e.target.closest('.settings')) resumeGame(); });
function resumeGame() { hideScreens(); G.phase = 'play'; requestLock(); }
$('sens').oninput = (e) => { CFG.sens = +e.target.value; saveCfg(); };
$('vol').oninput = (e) => { CFG.vol = +e.target.value; sound.setVolume(CFG.vol); saveCfg(); };
$('qsel').onchange = (e) => setQuality(e.target.value);
$('sens').value = CFG.sens; $('vol').value = CFG.vol; $('qsel').value = CFG.quality;
if (CFG.quality === 'low') setQuality('low');
$('resume').onmousedown = (e) => e.stopPropagation();
$('credbtn').onclick = () => showScreen('credits'); $('credback').onclick = () => showScreen('title');
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
    if (!g.active || g.state === S.STUNNED) continue;
    _v.set(g.x - eye.x, g.hitY - eye.y, g.z - eye.z); const d = _v.length(); _v.normalize();
    const ang = Math.acos(Math.max(-1, Math.min(1, _v.dot(_f))));
    if (d < 28 && ang < Math.atan2(g.hitR, d) + 0.04 && world.los(eye.x, eye.z, g.x, g.z) && d < hitD) { hit = g; hitD = d; }
  }
  // beam visual
  const end = hit ? new THREE.Vector3(hit.x, hit.hitY, hit.z) : eye.clone().addScaledVector(_f, 12);
  const start = eye.clone().add(new THREE.Vector3(0.25, -0.22, 0).applyQuaternion(camera.quaternion)).addScaledVector(_f, 0.4);
  beam.geometry.setFromPoints([start, end]); beam.visible = true; beamT = 0.12;
  if (hit) {
    const r = hit.stunFor(4 + perk('overload') * 3); G.stuns++;
    const msg = hit.kind === 'drone' ? (r === 'adapted' ? 'The drone has ADAPTED to your zapper!' : 'Drone stunned — it will adapt. Run.') :
      hit.kind === 'phantom' ? 'Hologram dissolved… for now.' : hit.kind === 'clinger' ? 'Splat. One less ceiling-dweller.' : `Direct hit! ${hit.name} is stunned — RUN`;
    G.say(msg, 'good'); flash('#fa5', 0.25);
  }
}

function interact() {
  const near = nearest(2.2, e => ['crew', 'body', 'emh'].includes(e.kind) && !e.used);
  if (near) {
    near.used = true; sound.pickup();
    if (near.kind === 'crew' && near.fake) {
      scene.remove(near.mesh); ents.splice(ents.indexOf(near), 1);
      const en = makeEnemy('slimeling', world, world.tile(near.x, near.z), G.deck, 0, scene, sound); en.state = S.PATROL; en.mesh.visible = true; en.x = near.x; en.z = near.z; en.pickPatrol(P); en.state = S.CHASE; en.timer = 6; en.setTarget(...world.tile(P.x, P.z)); gorns.push(en);
      G.say('"Hello fellow crewman! I am definitely not— *SCHLOOORP*"', 'warn'); sound.shriek(0.3); flash('#240', 0.4); P.shake = 0.5; return;
    }
    if (near.kind === 'crew') {
      G.say(pick(REDSHIRT_LINES), 'npc');
      if (Math.random() < 0.6) giveLoot();
    } else if (near.kind === 'body') { G.say('You search the crewman\'s body…', 'npc'); giveLoot(true); }
    else if (near.kind === 'emh') { G.say('Hologram: "Please describe your medical emergency. Or don\'t. I\'m a projection, not a mind-reader." (healed)', 'good'); G.hp = Math.min(G.maxHp, G.hp + 50); sound.heal(); }
    updateHUD(); return;
  }
  // lift
  if (world && Math.hypot(P.x - world.liftPos.x, P.z - world.liftPos.z) < 2.8) {
    if (G.chips >= world.d.chips.length) completeDeck();
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
  const R = 7 + perk('tricorder') * 4;
  const blip = (x, z, c, r = 1.4) => { mctx.fillStyle = c; mctx.beginPath(); mctx.arc(x / TS * s, z / TS * s, r, 0, 7); mctx.fill(); };
  for (const e of ents) if (e.kind === 'chip' && Math.hypot(e.x - P.x, e.z - P.z) < R * TS) blip(e.x, e.z, '#40ffa0');
  const lp = world.liftPos; const ld = Math.hypot(lp.x - P.x, lp.z - P.z);
  if (ld < (R + 3) * TS || world.explored[world.d.exit[0] + world.d.exit[1] * W]) blip(lp.x, lp.z, G.chips >= world.d.chips.length ? '#6f6' : '#f55', 2);
  if (perk('scan')) for (const g of gorns) if (g.active && Math.hypot(g.x - P.x, g.z - P.z) < 18) blip(g.x, g.z, '#f33', 2);
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
// first-person zapper (Kenney Space Kit blaster, CC0)
let gunVM = null, gunKick = 0, muzzle = null;
function buildViewmodel() {
  const inst = hasModel('weapon_gun') ? instance('weapon_gun', { height: 0.2, byMax: true, tint: 0x888a90 }) : null; if (!inst) return;
  inst.root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.renderOrder = 10; o.material.depthTest = true; } });
  gunVM = new THREE.Group(); gunVM.add(inst.root); inst.root.rotation.y = Math.PI; gunVM.position.set(0.17, -0.17, -0.5); gunVM.rotation.set(0.05, -0.12, 0);
  muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0 })); muzzle.position.set(0, 0.02, -0.28); gunVM.add(muzzle);
  camera.add(gunVM);
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
  P.crouch = !!(keys.KeyC || keys.ControlLeft);
  const wantSprint = !!(keys.ShiftLeft || keys.ShiftRight) && moving && !P.crouch && G.stamina > 3;
  P.sprint = wantSprint;
  const base = P.crouch ? 1.7 : 3.3, spd = (P.sprint ? 5.6 : base) * (P.clung > 0 ? 0.4 : 1);
  const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l;
  const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
  const tvx = (fx * cy + fz * sy) * spd, tvz = (-fx * sy + fz * cy) * spd;
  const k = Math.min(1, dt * 10);
  P.vx += (tvx - P.vx) * k; P.vz += (tvz - P.vz) * k;
  P.kbx *= Math.max(0, 1 - dt * 5); P.kbz *= Math.max(0, 1 - dt * 5);
  P.x += (P.vx + P.kbx) * dt; P.z += (P.vz + P.kbz) * dt;
  world.resolve(P, 0.35);
  const speedNow = Math.hypot(P.vx, P.vz);

  // stamina
  const legs = perk('legs');
  if (P.sprint) G.stamina -= dt * (22 - legs * 3.5); else G.stamina = Math.min(100, G.stamina + dt * (14 + legs * 5) * (moving ? 0.6 : 1.2));
  if (G.stamina < 0) G.stamina = 0;
  if (P.clung > 0) { P.clung -= dt; G.hp -= 2.5 * dt; $('clung').style.transform = `translate(${(Math.random() - 0.5) * 6}px,${(Math.random() - 0.5) * 6}px)`; if (P.clung <= 0) { $('clung').style.opacity = 0; G.say('You tear it off and hurl it away!', 'good'); bloodBurst(P.x, 1.5, P.z, 25, 3); if (G.hp <= 0) { die(gorns.find(g => g.kind === 'clinger') || gorns[0]); return; } } updateHUD(); }
  if (G.glitchT > 0) G.glitchT -= dt;

  // footsteps / noise
  P.stepD += speedNow * dt;
  const stride = P.sprint ? 1.5 : 1.9;
  if (P.stepD > stride && speedNow > 0.8) {
    P.stepD = 0;
    if (world.flooded) { sound.splash(P.crouch ? 0.05 : P.sprint ? 0.2 : 0.11); for (let i = 0; i < (P.sprint ? 10 : 5); i++) water.add(P.x + (Math.random() - 0.5) * 0.4, 0.08, P.z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 1.4, 1.2 + Math.random() * 1.2, (Math.random() - 0.5) * 1.4, WATER, 0.6); }
    else sound.step(P.crouch ? 0.05 : P.sprint ? 0.22 : 0.13);
  }
  const boots = 1 - perk('boots') * 0.3;
  const sneakNoise = speedNow < 0.5 ? 0 : P.crouch ? 2.5 : P.sprint ? 15 : 7;
  noiseNow = Math.max(noiseNow * (1 - dt * 3), sneakNoise * boots);
  P.bob += speedNow * dt * (P.sprint ? 1.8 : 1.5);

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
  if (chased !== wasChased) { world.setAlert(chased); if (chased) sound.klaxon(); wasChased = chased; }
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
      if (d < 1.0 && G.phaser < G.maxPhaser) { G.phaser = Math.min(G.maxPhaser, G.phaser + 2); remove(e); sound.pickup(); G.say('Zapper power cell (+2)', 'good'); updateHUD(); }
    } else if (e.kind === 'medkit') {
      e.mesh.rotation.y += dt * 1.5; e.mesh.position.y = 0.8 + Math.sin(e.t * 2) * 0.06;
      if (d < 1.0 && G.hp < G.maxHp) { G.hp = Math.min(G.maxHp, G.hp + 35); remove(e); sound.heal(); G.say('Medkit (+35 health)', 'good'); updateHUD(); }
    } else if (e.kind === 'tribble') {
      const b = e.mesh.userData.body; b.scale.y = 0.85 + Math.sin(e.t * 4) * 0.04; e.mesh.position.y = Math.abs(Math.sin(e.t * 1.6)) * 0.03;
      if (d < 0.9) { G.tribbles++; G.hp = Math.min(G.maxHp, G.hp + 3); remove(e); sound.purr(); G.say(['Coo-coo… a furble!', 'It purrs. Your stress level drops.', 'Furble acquired. Do NOT feed it.'][G.tribbles % 3], 'npc'); updateHUD(); }
    } else if (e.kind === 'crew' || e.kind === 'emh') {
      const a = Math.atan2(P.x - e.x, P.z - e.z); let da = a - e.mesh.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); e.mesh.rotation.y += da * Math.min(1, dt * 2.5);
      animateCrew(e.mesh, e.t);
    }
  }
  function remove(e) { scene.remove(e.mesh); ents.splice(ents.indexOf(e), 1); }

  // prompt
  let prompt = '';
  const npc = nearest(2.2, e => ['crew', 'body', 'emh'].includes(e.kind) && !e.used);
  if (npc) prompt = npc.kind === 'body' ? '[E] Search body' : npc.kind === 'emh' ? '[E] Speak to hologram' : '[E] Talk to crewman';
  else if (Math.hypot(P.x - world.liftPos.x, P.z - world.liftPos.z) < 2.8) prompt = G.chips >= world.d.chips.length ? '[E] Board tubelift' : 'Tubelift offline';
  $('prompt').textContent = prompt;

  // room label + exploration
  const [tx, ty] = world.tile(P.x, P.z);
  const rt = world.d.room[ty]?.[tx];
  $('roomname').textContent = rt ? ROOMS[rt].label : 'Corridor';
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
  else { G.blackT -= dt; if (G.blackT <= 0 && G.deckTime > 25) { G.blackout = 5 + Math.random() * 5; G.blackT = 60 + Math.random() * 50; world.setPower(false); sound.setPower(false); sound.powerDown(); G.say('Computer: Main power failure. Emergency lighting only.', 'comp'); } }
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
  if (G.annT <= 0) { G.annT = 50 + Math.random() * 40; sound.chirp(); G.say('Computer: ' + pick(COMPUTER), 'comp'); }
  G.clangT = (G.clangT ?? 20) - dt;
  if (G.clangT <= 0) { G.clangT = 18 + Math.random() * 30; sound.clang(0.15); }
  if (G.stamina < 25) { G.breathT = (G.breathT || 0) - dt; if (G.breathT <= 0) { G.breathT = 0.7; sound.breath(0.1); } }

  if (gunVM) { gunKick = Math.max(0, gunKick - dt * 6); gunVM.position.set(0.17 + Math.sin(P.bob * 1.1) * 0.006, -0.17 + Math.abs(Math.sin(P.bob * 1.1)) * 0.008 + (P.crouch ? 0.02 : 0), -0.5 + gunKick * 0.06); gunVM.rotation.x = 0.05 + gunKick * 0.25; muzzle.material.opacity = gunKick > 0.6 ? 1 : 0; gunVM.visible = G.phase === 'play'; }
  // camera
  const eyeH = P.crouch ? 1.05 : 1.65;
  P.shake = Math.max(0, P.shake - dt * 1.5);
  const bobY = Math.sin(P.bob * 2.2) * 0.045 * Math.min(1, speedNow / 3);
  camera.position.set(P.x, eyeH + bobY, P.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.set(P.pitch + (Math.random() - 0.5) * P.shake * 0.05, P.yaw + Math.sin(P.bob * 1.1) * 0.004 + (Math.random() - 0.5) * P.shake * 0.05, Math.sin(P.bob * 1.1) * 0.006);
  camera.fov += ((P.sprint ? 82 : 75) - camera.fov) * Math.min(1, dt * 6); camera.updateProjectionMatrix();
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
  } else renderer.render(scene, camera);
}

// expose for debugging/tests
const ready = Promise.all([loadModels(), loadEnv(renderer, 'lobby')]).then(([, env]) => { if (env) scene.environment = env; buildViewmodel(); const b = $('begin'); b.disabled = false; b.textContent = 'Begin shift'; });
$('begin').disabled = true; $('begin').textContent = 'Loading assets…';
window.__game = { ready, CFG, setQuality, decals, blood, sparks, post, die, G, P, get world() { return world; }, get gorns() { return gorns; }, get ents() { return ents; }, newRun, loadDeck, complete: completeDeck, step, camera, scene, renderer };
$('best').textContent = G.best ? `Best run: Deck ${G.best}` : '';
frame();
