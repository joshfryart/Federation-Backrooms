// Shanty video stage: runs INSIDE the game page, injected by tools/video/render.mjs (never loaded by index.html, so normal play is untouched).
// It drives the game through window.__game on the test clock: builds one deck at a time with loadDeck, replaces the sim's bodies with
// the deck's whole complement placed in their own rooms (duty room for the watch on duty, mess / lounge / arboretum / gym / holodeck /
// atrium / quarters for the watches off duty), poses everyone singing (beat-locked sway, nods, claps, mug raises, stomps, jaw from the
// song's syllables), flies the camera along shot paths built from the deck's real geometry, draws LCARS overlays (title / end cards,
// karaoke lyric bar, deck progress, name cards) and logs coverage (decks, rooms, distinct singers seen on screen).
//   window.__V = { init, cast, setDeck, shot, frame, coverage }
import * as THREE from 'three';
import { makeSurvivor, releaseHuman } from '../../js/humans.js';
import { dressCrew } from '../../js/actors.js';
import { commsData } from '../../js/shipcomms.js';
import { TS, WH, TALL_H } from '../../js/world.js';
import { toBones } from '../../js/movement.js';
import { deptCol, DEPT_LETTER } from '../../js/icons.js';
import { DEPT } from '../../js/crew.js';
import { pipsHTML } from '../../js/nametags.js';
import { mulberry32 } from '../../js/data.js';

const g = window.__game, G = g.G, scene = g.scene, camera = g.camera;
const V = window.__V = { song: null, people: [], singers: [], deck: 0, rooms: [], seen: new Map(), log: [] };
const ROOM_NAME = { bridge: 'Bridge', readyroom: 'Ready room', holodeck: 'Holodeck', datacore: 'Computer core', sickbay: 'Sickbay', lounge: 'Lounge', arboretum: 'Arboretum', quarters: 'Crew quarters', mess: 'Galley & mess', gym: 'Gymnasium', lab: 'Science lab', atrium: 'Atrium', shuttlebay: 'Shuttle bay', transporter: 'Transporter room', brig: 'Brig', stores: 'Stores', cargo: 'Cargo bay', armory: 'Armory', engineering: 'Engineering', airlock: 'Airlock', workshop: 'Workshop', plant: 'Power plant' };
V.ROOM_NAME = ROOM_NAME;
const REC = ['mess', 'lounge', 'arboretum', 'gym', 'holodeck', 'atrium', 'quarters'];
const hashN = (...a) => { let h = 2166136261; for (const x of a.join('|')) h = Math.imul(h ^ x.charCodeAt(0), 16777619); h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const ease = (u) => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
const lerp = (a, b, u) => a + (b - a) * u;

// ---------------------------------------------------------------- setup
V.init = async ({ ship = 1, seed = 1, quality = 'low', song }) => {
  V.song = song; G.manual = true;
  let s = seed * 7919; Math.random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };   // deterministic flicker etc.
  G.forceShip = ship; G.forceSeed = seed; g.newRun();
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('show')); G.phase = 'play'; G.hp = G.maxHp = 1e6;
  g.setQuality(quality);
  const st = document.createElement('style'); st.textContent = `body > *:not(#view):not(#vid):not(style){display:none !important} #view{display:block !important}`; document.head.appendChild(st);
  V.lamp = scene.children.find(o => o.isPointLight && o.distance === 14);
  buildOverlay();
  return V.cast();
};

// ---------------------------------------------------------------- casting: everyone gets a deck + room
V.cast = () => {
  const cd = commsData(), plan = G.plan, R = g.roster, people = R.people.filter(p => p.status !== 'dead');
  const onWatch = 'alpha';   // the watch on duty for the song: the rest come off watch into the rec spaces
  const instOf = (type, i) => { const L = plan[type]; return L?.length ? L[i % L.length] : null; };
  const out = [], deckN = {}, roomN = {};
  const offs = [];
  people.forEach((p) => {
    const day = cd.billets?.[p.billet]?.day || [], hours = {};
    for (const [a, b, room] of day) if (room && room !== 'quarters' && plan[room] && (!REC.includes(room) || p.dept === 'services')) hours[room] = (hours[room] || 0) + (b - a);
    // the duty room: drawn by hours worked there (so a department spreads over its spaces instead of piling into one)
    const tot = Object.values(hours).reduce((a, b) => a + b, 0); let r = hashN('duty', p.id) * tot, duty = null;
    for (const [room, h] of Object.entries(hours)) { r -= h; if (r <= 0) { duty = room; break; } }
    const off = !duty || (p.watch && p.watch !== onWatch && !['co', 'xo'].includes(p.billet) && p.dept !== 'medical' && hashN('off', p.id) < 0.5);
    if (off) { offs.push(p); return; }
    const L = plan[duty], inst = L[Math.floor(hashN('inst', p.id) * L.length)];
    out.push({ p, room: duty, why: 'duty', deckNo: inst.deckNo, inst }); deckN[inst.deckNo] = (deckN[inst.deckNo] || 0) + 1;
  });
  // off watch: into the rec spaces, each filled toward a crowd size that suits it (the mess hall and the atrium hold the big groups)
  const WANT = { mess: 8, atrium: 6, lounge: 5, holodeck: 4, arboretum: 3, gym: 3, quarters: 2 };
  const recInst = REC.flatMap(t => (plan[t] || []).map(inst => ({ t, inst, key: t + '@' + inst.deckNo + ',' + inst.tx })));
  offs.sort((a, b) => hashN('o', a.id) - hashN('o', b.id)).forEach((p) => {
    const best = recInst.map(c => ({ c, k: (roomN[c.key] || 0) / (WANT[c.t] || 2) + hashN('rk', p.id, c.key) * 0.15 })).sort((a, b) => a.k - b.k)[0].c;
    out.push({ p, room: best.t, why: 'off watch', deckNo: best.inst.deckNo, inst: best.inst }); roomN[best.key] = (roomN[best.key] || 0) + 1;
  });
  const decks = G.ship.decks;
  // a deck with no rec space and a thin watch gets visitors: off-watch crew from the busiest deck join its biggest crowd
  for (let dn = 1; dn <= decks; dn++) {
    for (let guard = 0; guard < 12 && out.filter(o => o.deckNo === dn).length < 8; guard++) {
      const cnt = (d) => out.filter(o => o.deckNo === d).length;
      const donor = out.filter(o => o.why === 'off watch' && cnt(o.deckNo) > 10).sort((a, b) => (cnt(b.deckNo) - cnt(a.deckNo)) || hashN('mv', a.p.id) - hashN('mv', b.p.id))[0]; if (!donor) break;
      const here = out.filter(o => o.deckNo === dn), roomsHere = {}; for (const o of here) roomsHere[o.room] = (roomsHere[o.room] || 0) + 1;
      const t = Object.entries(roomsHere).sort((a, b) => b[1] - a[1])[0]?.[0] || Object.keys(plan).find(t => plan[t].some(r => r.deckNo === dn));
      Object.assign(donor, { room: t, inst: plan[t].find(r => r.deckNo === dn), deckNo: dn, why: 'off watch (visiting)' });
    }
  }
  V.people = out;
  const byDeck = {}; for (const o of out) (byDeck[o.deckNo] ||= {})[o.room] = ((byDeck[o.deckNo] ||= {})[o.room] || 0) + 1;
  // leads: the senior person on each deck (verse line 1 is theirs alone); voice type from body + voice profile (js/voice.js)
  const leads = {}, femShare = {};
  for (const b of V.song.blocks) {
    const here = out.filter(o => o.deckNo === b.deck), fem = here.filter(o => o.p.body !== 'crew_m' && o.p.body !== 'crew_heavy').length;
    femShare[b.i] = here.length ? fem / here.length : 0.45;
    if (b.kind !== 'verse') continue;
    const L = here.slice().sort((a, b2) => (b2.p.rank - a.p.rank) || (a.p.id - b2.p.id))[0]; if (!L) continue;
    const female = L.p.body !== 'crew_m' && L.p.body !== 'crew_heavy', pitch = L.p.voice?.pitch ?? 1;
    leads[b.i] = { id: L.p.id, name: L.p.full, vtype: female ? (pitch > 1.0 ? 'soprano' : 'alto') : (pitch < 0.86 ? 'bass' : pitch < 1.02 ? 'baritone' : 'tenor'), room: L.room };
  }
  V.leads = leads;
  return { ship: G.ship.name, reg: G.ship.reg, cls: G.ship.cls, decks, crew: out.length, byDeck, leads, femShare,
    people: out.map(o => ({ id: o.p.id, name: o.p.full, short: o.p.short, dept: o.p.dept, title: o.p.title, rankTitle: o.p.rankTitle, deck: o.deckNo, room: o.room, why: o.why })) };
};

// ---------------------------------------------------------------- deck build
const tilesOf = (d, r, type) => { const out = []; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (d.grid[y]?.[x] === 0 && d.room[y][x] === type && !g.world.isTube(x, y)) out.push([x, y]); return out; };
V.setDeck = (n) => {
  for (const e of g.ents.slice()) if (e.kind === 'crew' && e.person) { scene.remove(e.mesh); releaseHuman(e.mesh); g.ents.splice(g.ents.indexOf(e), 1); }
  for (const s of V.singers) { scene.remove(s.mesh); releaseHuman(s.mesh); }
  V.singers = [];
  if (G.deck !== n || !g.world) g.loadDeck(n);
  for (const e of g.ents.slice()) if (e.kind === 'crew' && e.person) { scene.remove(e.mesh); releaseHuman(e.mesh); g.ents.splice(g.ents.indexOf(e), 1); }
  G.phase = 'play'; V.deck = n;
  const w = g.world, d = w.d; V.rooms = [];
  const here = V.people.filter(o => o.deckNo === n);
  const groups = {}; for (const o of here) { const r = d.rooms.find(r => r.type === o.room && o.inst.tx >= r.x && o.inst.tx < r.x + r.w && o.inst.ty >= r.y && o.inst.ty < r.y + r.h) || d.rooms.find(r => r.type === o.room); if (!r) continue; (groups[d.rooms.indexOf(r)] ||= []).push(o); }
  const car = w.car;
  for (const ri in groups) {
    const r = d.rooms[ri], who = groups[ri], tiles = tilesOf(d, r, r.type); if (!tiles.length) continue;
    // keep the doorways / lift mouth clear; crowd toward the room's middle, two or three to a tile when it is busy
    const cx = tiles.reduce((a, t) => a + t[0], 0) / tiles.length, cy = tiles.reduce((a, t) => a + t[1], 0) / tiles.length;
    const ok = tiles.filter(([x, y]) => !(car && Math.abs(x - car.tx) + Math.abs(y - car.ty) < 2)).sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));
    const per = Math.max(1, Math.ceil(who.length / Math.max(1, Math.floor(ok.length * 0.7))));
    const pts = [];
    who.forEach((o, k) => {
      const t = ok[Math.floor(k / per) % ok.length], slot = k % per; let [x, z] = w.center(t[0], t[1]);
      if (per > 1) { const a = slot * (6.283 / per) + hashN('a', o.p.id) * 0.8; x += Math.cos(a) * 0.62; z += Math.sin(a) * 0.62; }
      x += (hashN('jx', o.p.id) - 0.5) * 0.3; z += (hashN('jz', o.p.id) - 0.5) * 0.3;
      const q = { x, y: 0, z }; w.resolve?.(q, 0.3); pts.push([q.x, q.z, o]);
    });
    const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length, mz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const room = { type: r.type, r, ri: +ri, tiles, cx: (cx + 0.5) * TS, cz: (cy + 0.5) * TS, mx, mz, tall: !!w.tall?.[tiles[0][0] + tiles[0][1] * w.W], singers: [] };
    for (const [x, z, o] of pts) {
      const m = makeSurvivor(mulberry32(o.p.id * 31 + 7), o.p); if (!m) continue; dressCrew(m, o.p);
      const H = m.userData.human; H.play('idle', { fade: 0 }); H.standing = true; H.face({ LeftInnerBrowUp: 0, RightInnerBrowUp: 0 });
      // face the group's middle, turned a little toward the room's open side so the camera sees faces
      const yaw = Math.atan2(mx - x, mz - z) + (hashN('yaw', o.p.id) - 0.5) * 0.9;
      m.position.set(x, 0, z); m.rotation.y = Math.hypot(mx - x, mz - z) < 0.5 ? hashN('y0', o.p.id) * 6.28 : yaw; scene.add(m);
      const s = { o, p: o.p, mesh: m, H, x, z, room, yaw0: m.rotation.y, style: armStyle(o.p), ph: hashN('ph', o.p.id), lead: Object.values(V.leads).some(l => l.id === o.p.id) };
      V.singers.push(s); room.singers.push(s);
    }
    V.rooms.push(room);
  }
  V.rooms.sort((a, b) => b.singers.length - a.singers.length);
  return { deck: n, rooms: V.rooms.map(r => ({ type: r.type, n: r.singers.length, tall: r.tall, w: r.r.w, h: r.r.h })), singers: V.singers.length, car: car && { x: car.x, z: car.z, dx: car.dx, dy: car.dy } };
};
const armStyle = (p) => { const h = hashN('arm', p.id); if (p.rank >= 4 && h < 0.6) return 'formal'; return h < 0.38 ? 'clap' : h < 0.62 ? 'mug' : h < 0.82 ? 'sway' : 'stomp'; };

// ---------------------------------------------------------------- the song at time t
const VOPEN = { a: 0.95, o: 0.75, e: 0.6, i: 0.38, u: 0.42 };
const vowelOf = (w) => { w = w.toLowerCase().replace(/[^a-z']/g, ''); if (/igh|ign|^ri$/.test(w)) return 'a'; if (/ay|ey/.test(w)) return 'e'; if (/ee|ea|^we$|^she$|ly$|ty$|^he's$/.test(w)) return 'i'; if (/oo|^do$/.test(w)) return 'u'; if (/or|o/.test(w)) return 'o'; const m = w.match(/[aeiou]/); return m ? ({ u: 'o' })[m[0]] || m[0] : 'a'; };
V.songAt = (t) => {
  const S = V.song, e = t / S.E;
  const line = S.lines.find(l => e >= l.e0 && e < l.e0 + (l.tag ? 28 : 16)) || null;
  let syl = null, u = 0;
  if (line) for (const s of line.syl) if (e >= s.e && e < s.e + s.n) { syl = s; u = (e - s.e) / s.n; }
  const block = S.blocks.find(b => e >= b.e0 && e < b.e1) || null;
  return { e, beat: e / 2, bar: e / 8, line, syl, u, block, intro: e < S.intro, tag: line?.tag, end: e >= S.tagE + 28 };
};
const jawFor = (sa, durS) => { if (!sa.syl) return 0; const att = Math.min(1, sa.u * durS / 0.07), rel = Math.min(1, (1 - sa.u) * durS / 0.09); return VOPEN[vowelOf(sa.syl.w)] * att * (0.55 + 0.45 * rel); };

// ---------------------------------------------------------------- posing
const pulse = (x, w = 0.18) => { const f = x - Math.floor(x); return Math.exp(-((f < 0.5 ? f : f - 1) ** 2) / (2 * w * w)); };
function poseSinger(s, t, sa, dt, S = {}) {
  { // sing toward the camera: bodies turn part of the way (not the close-up's subject, not in the lift shots)
    const cx = camera.position.x - s.x, cz = camera.position.z - s.z, d = Math.hypot(cx, cz);
    let k = S.kind === 'close' ? (S.who === s ? 0.25 : 0.4) : S.kind === 'wide' || S.kind === 'title' || S.kind === 'end' ? 0.55 : 0;
    k *= Math.max(0, Math.min(1, (14 - d) / 4));
    const want = Math.atan2(cx, cz); let dif = want - s.yaw0; dif = Math.atan2(Math.sin(dif), Math.cos(dif));
    s.mesh.rotation.y = s.yaw0 + dif * k;
  }
  const H = s.H, beat = sa.beat + s.ph * 0.06 - 0.03, bar = beat / 4;
  const singing = !sa.intro && !sa.end && sa.line && (sa.line.part === 'all' || s.lead && sa.block && V.leads[sa.block.i]?.id === s.p.id);
  const clapOn = !sa.intro || sa.bar >= 1;   // claps come in after the first bar of the intro
  const solo = sa.line?.part === 'lead';
  const amp = sa.end ? 0.3 : 1;
  const ch = {};
  // whole body: sway a bar long (left on 1, right on 3), bob on every beat
  const sw = Math.sin(2 * Math.PI * (bar + s.ph * 0.2)) * amp;
  ch.spine_lean = 0.07 * sw; ch.waist_lean = 0.05 * sw; ch.pelvis_roll = 0.025 * sw; ch.neck_tilt = -0.05 * sw;
  const bob = pulse(beat, 0.16);
  ch.head_nod = 0.07 * bob * amp - (singing ? 0.08 : 0);   // chin up a little while singing
  ch.waist_bow = 0.025 * bob * amp;
  const st = s.style;
  if (st === 'clap') {
    // hands meet on 2 and 4 (when the claps play), held in front between
    const k = clapOn && !solo ? pulse((beat - 1) / 2, 0.09) : 0;
    ch.arm_fwd_l = ch.arm_fwd_r = 0.75; ch.elbow_l = ch.elbow_r = 1.25; ch.arm_out_l = ch.arm_out_r = -0.05 - 0.22 * k; ch.arm_twist_l = ch.arm_twist_r = 0.35;
  } else if (st === 'mug') {
    // right fist / mug up on the downbeat, a little salute through the bar
    const k = pulse(bar, 0.12) * (solo ? 0.3 : 1);
    ch.arm_fwd_r = 0.5 + 1.2 * k; ch.elbow_r = 1.4 - 0.6 * k; ch.arm_out_r = 0.15; ch.wrist_r = -0.2;
    ch.arm_out_l = 0.06;
  } else if (st === 'sway') {
    // arms a little out, swinging with the sway (arm-in-arm feel)
    ch.arm_out_l = 0.28 + 0.12 * sw; ch.arm_out_r = 0.28 - 0.12 * sw; ch.elbow_l = ch.elbow_r = 0.35; ch.arm_fwd_l = ch.arm_fwd_r = 0.12;
  } else if (st === 'stomp') {
    // stamp on 1 and 3: knee up just before the beat, foot down on it; hands on the hips
    const ph = (beat / 2) % 1, k = ph > 0.75 ? Math.sin((ph - 0.75) / 0.25 * Math.PI) : 0;
    ch.thigh_r = 0.32 * k * amp; ch.foot_r = -0.15 * k;
    ch.arm_out_l = ch.arm_out_r = 0.32; ch.elbow_l = ch.elbow_r = 0.9; ch.arm_twist_l = ch.arm_twist_r = -0.25;
  } else {   // formal: hands behind the back, heads up, smaller sway
    ch.arm_fwd_l = ch.arm_fwd_r = -0.3; ch.elbow_l = ch.elbow_r = 0.5; ch.arm_out_l = ch.arm_out_r = 0.05; ch.spine_lean *= 0.5;
  }
  H.add = toBones(ch, 1);
  // face: jaw from the syllable, a smile in the choruses, blinks
  const jaw = singing ? jawFor(sa, sa.syl ? sa.syl.n * V.song.E : 0.2) * (0.75 + 0.25 * s.ph) : 0;
  const blink = ((t * 0.37 + s.ph * 7) % 1) > 0.965 ? 1 : 0;
  H.face({ JawDrop: 0.08 + jaw * 0.85, Smile: singing ? 0.35 : 0.5, LeftUpperLidClosed: blink, RightUpperLidClosed: blink, LeftInnerBrowUp: singing ? 0.35 : 0, RightInnerBrowUp: singing ? 0.35 : 0 });
  // eye contact: heads turn toward the camera when it is near and in front
  const cx = camera.position.x - s.x, cz = camera.position.z - s.z, dist = Math.hypot(cx, cz);
  let rel = Math.atan2(cx, cz) - s.mesh.rotation.y; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
  const wgt = Math.max(0, Math.min(1, (7 - dist) / 2)) * Math.max(0, Math.min(1, (1.5 - Math.abs(rel)) / 0.4));   // a pure function of the camera (frames render in any order)
  s.look = rel * 0.7 * wgt; H.lookYaw = s.look; H.lookPitch = 0; void dt;
  H.mixer.setTime((t + s.ph * 5) % 1000); H.update(0);
}

// ---------------------------------------------------------------- camera paths
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const camAt = (p, look, fov) => { camera.position.copy(p); camera.lookAt(look); if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); } };
const clearDist = (x, y, z, dx, dy, dz, max) => { const L = Math.hypot(dx, dy, dz); const h = g.world.raycast(x, y, z, dx / L, dy / L, dz / L, max); return h ? (h.t ?? h.dist ?? Math.hypot(h.x - x, (h.y ?? y) - y, h.z - z)) : max; };
const walkable = (x, z) => { const w = g.world, [tx, ty] = w.tile(x, z); return w.grid[ty]?.[tx] === 0; };
// inside the room's own floor (rooms are walled by thin bulkheads between tiles that world.raycast does not see), margin m from its edge
const inRoom = (room, x, z, m = 0.4) => { const r = room.r, w = g.world, [tx, ty] = w.tile(x, z); if (x < r.x * TS + m || x > (r.x + r.w) * TS - m || z < r.y * TS + m || z > (r.y + r.h) * TS - m) return false; const c = w.grid[ty]?.[tx]; return c !== 1 && c !== undefined && w.d.room[ty]?.[tx] === room.type; };
const segIn = (room, ax, az, bx, bz, m = 0.25) => { for (let i = 0; i <= 12; i++) { const u = i / 12; if (!inRoom(room, ax + (bx - ax) * u, az + (bz - az) * u, m)) return false; } return true; };
V.inRoom = inRoom;
// a point in the room on the far side from the crowd, pulled back toward the wall (but not into it)
function vantage(room, side = 0) {
  const w = g.world; let best = null;
  for (const [tx, ty] of room.tiles) {
    const [x, z] = w.center(tx, ty); if (room.singers.some(s => Math.hypot(s.x - x, s.z - z) < 0.9)) continue;
    const d = Math.hypot(x - room.mx, z - room.mz) + side * Math.atan2(x - room.mx, z - room.mz);
    if (!best || d > best[2]) best = [x, z, d];
  }
  if (!best) { const [x, z] = w.center(...room.tiles[0]); best = [x, z, 0]; }
  return best;
}
const BAR = () => 8 * V.song.E;
// shot kinds: lift-arrive / lift-depart / wide / close / track / title / end
V.shot = (spec) => {  // eslint-disable-line no-param-reassign
  const w = g.world, car = w.car, S = { ...spec }; V.cur = S;
  const rooms = V.rooms;
  if (spec.kind === 'lift-arrive' || spec.kind === 'lift-depart') {
    const dir = v3(car.dx, 0, car.dy);
    S.p0 = v3(car.x - car.dx * 0.95, 1.62, car.z - car.dy * 0.95); S.l0 = v3(car.x + car.dx * 4, 1.45, car.z + car.dy * 4);
    if (spec.kind === 'lift-arrive') {
      // out of the car and down the corridor toward the deck's main room
      // step out of the car, then turn down the route toward the deck's main room (BFS over the deck grid)
      const path = routeTo(car.tx, car.ty, rooms[0]);
      const out = Math.min(clearDist(car.x, 1.6, car.z, car.dx, 0, car.dy, 7) - 0.7, 1.9);
      S.p1 = v3(car.x + car.dx * out, 1.66, car.z + car.dy * out);
      const q = path[Math.min(path.length - 1, 4)]; S.l1 = q ? v3(...w.center(q[0], q[1]).flatMap((c, i) => i ? [1.5, c] : [c])) : S.l0.clone(); void dir;
    } else { S.p1 = S.p0.clone().add(v3(-car.dx * 0.1, 0, -car.dy * 0.1)); S.l1 = S.l0.clone(); }
    S.fov = 62; S.riders = spec.kind === 'lift-depart' ? ridersFor() : [];
    return { kind: spec.kind };
  }
  if (spec.kind === 'wide' || spec.kind === 'title' || spec.kind === 'end') {
    const good = rooms.filter(r => r.singers.length >= 2).length ? rooms.filter(r => r.singers.length >= 2) : rooms.slice(0, 1);   // a room with one or two people is not a wide shot
    const ri = spec.ri || 0, room = rooms.find(r => r.type === spec.room) || good[ri % good.length]; S.room = room;
    if (ri >= good.length) { spec = { ...spec, side: ri % 2 ? 2.5 : -2.5, arc: -(spec.arc ?? 1) }; }   // a deck with fewer rooms: the same room from another side
    const [vx, vz] = vantage(room, spec.side || 0);
    const hi = room.tall ? 3.0 : 2.0;
    const dx = room.mx - vx, dz = room.mz - vz, L = Math.hypot(dx, dz) || 1;
    // start: back at the vantage (pulled toward the wall), end: a third of the way in, arcing a little sideways
    let back = 0.9; while (back > 0 && !inRoom(room, vx - dx / L * back, vz - dz / L * back, 0.45)) back -= 0.15; back = Math.max(0, back);
    const px = -dz / L, pz = dx / L, arc = (spec.arc ?? 1) * 0.9;
    const push = spec.push ?? 0.38;
    S.p0 = v3(vx - dx / L * back - px * arc, hi + (spec.crane ? 0.6 : 0), vz - dz / L * back - pz * arc);
    S.p1 = v3(vx + dx * push + px * arc * 0.6, hi - (spec.crane ? 0.5 : 0.2), vz + dz * push + pz * arc * 0.6);
    for (const P of [S.p0, S.p1]) { let k = 1; const ox = P.x, oz = P.z; while (k > 0 && !inRoom(room, P.x, P.z, 0.45)) { k -= 0.1; P.x = vx + (ox - vx) * k; P.z = vz + (oz - vz) * k; } }
    S.l0 = v3(room.mx, 1.15, room.mz); S.l1 = v3(room.mx + px * 0.4, 1.25, room.mz + pz * 0.4); S.fov = spec.fov || 64;
    return { kind: spec.kind, room: room.type, n: room.singers.length };
  }
  if (spec.kind === 'close') {
    // a named singer: the deck's lead for the verse call, else someone not yet in a close-up, face clear of walls
    const cands = (spec.lead != null ? V.singers.filter(s => s.p.id === spec.lead) : []).concat(V.singers.filter(s => !V.closed?.has(s.p.id)).sort((a, b) => hashN('c', a.p.id, spec.t0) - hashN('c', b.p.id, spec.t0)));
    let pick = null;
    for (const s of cands) {
      const head = headPos(s), yaw = s.mesh.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw);
      for (const side of [0.35, -0.35, 0.7, -0.7]) {
        const ax = Math.sin(yaw + side), az = Math.cos(yaw + side), D = 1.25;
        if (clearDist(head.x, head.y, head.z, ax, 0, az, D + 0.3) < D + 0.25) continue;
        if (!segIn(s.room, head.x, head.z, head.x + ax * (D * 1.12 + 0.2), head.z + az * (D * 1.12 + 0.2), 0.2)) continue;
        if (V.singers.some(o => o !== s && segDist(o.x, o.z, head.x, head.z, head.x + ax * D, head.z + az * D) < 0.32)) continue;
        pick = { s, side, ax, az, D }; break;
      }
      if (pick) break; void fx; void fz;
    }
    if (!pick) return V.shot({ ...spec, kind: 'wide' });
    (V.closed ||= new Set()).add(pick.s.p.id); S.who = pick.s; S.pick = pick; S.fov = 34;
    return { kind: 'close', who: pick.s.p.full, id: pick.s.p.id };
  }
  return null;
};
function routeTo(sx, sy, room) {
  const w = g.world, d = w.d; if (!room) return [];
  const key = (x, y) => x + y * 4096, prev = new Map([[key(sx, sy), null]]), q = [[sx, sy]]; let end = null;
  while (q.length) { const [x, y] = q.shift(); if (d.room[y]?.[x] === room.type && x >= room.r.x && x < room.r.x + room.r.w && y >= room.r.y && y < room.r.y + room.r.h) { end = [x, y]; break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = key(nx, ny); if (prev.has(k) || w.grid[ny]?.[nx] !== 0 || w.isTube(nx, ny)) continue; prev.set(k, [x, y]); q.push([nx, ny]); } }
  const out = []; for (let c = end; c; c = prev.get(key(c[0], c[1]))) out.unshift(c); return out;
}
const segDist = (px, pz, ax, az, bx, bz) => { const vx = bx - ax, vz = bz - az, L = vx * vx + vz * vz, u = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / L)); return Math.hypot(px - ax - vx * u, pz - az - vz * u); };
const _hv = new THREE.Vector3();
const headPos = (s) => { s.mesh.updateMatrixWorld(true); const b = s.H.bones.Head; if (!b) return v3(s.x, 1.65, s.z); b.getWorldPosition(_hv); return _hv.clone(); };
function ridersFor() { return []; }

// ---------------------------------------------------------------- per frame
V.frame = (t, u, info = {}) => {
  const S = V.cur, sa = V.songAt(t), dt = 1 / (info.fps || 24);
  if (info.preroll) { const p = info.preroll; delete info.preroll; for (let tt = p.t0; tt < t - 1e-6; tt += dt) V.frame(tt, (tt - p.t0) / p.len, { ...info, quiet: true }); }
  const w = g.world;
  if (S.kind === 'close') { const s = S.who, sd = S.pick.side, ax = Math.sin(s.yaw0 + sd), az = Math.cos(s.yaw0 + sd); camera.position.set(s.x + ax * S.pick.D, s.H.height * 0.93, s.z + az * S.pick.D); }   // provisional (bodies turn toward it)
  else if (!S.kind?.startsWith('lift')) { const k = ease(u); camera.position.copy(S.p0.clone().lerp(S.p1, k)); }
  if (!info.quiet) for (const s of V.singers) poseSinger(s, t, sa, dt, S);
  if (S.kind === 'lift-arrive' || S.kind === 'lift-depart') {
    const k = S.kind === 'lift-arrive' ? ease((u - 0.25) / 0.75) : ease(u * 0.3);
    camAt(S.p0.clone().lerp(S.p1, k), S.l0.clone().lerp(S.l1, k), S.fov);
    const open = S.kind === 'lift-arrive' ? u > 0.08 : u < 0.22; if (w.liftOpen !== open) w.setLiftOpen(open, true);
    if (S.kind === 'lift-depart' && u > 0.3) { const sh = 0.006 * Math.sin(t * 40); camera.position.y += sh; }
  } else if (S.kind === 'close') {
    const s = S.who, hp = headPos(s), k = ease(u), D = S.pick.D * lerp(1.1, 0.92, k), sd = S.pick.side;
    const yaw = s.yaw0, ax = Math.sin(yaw + sd), az = Math.cos(yaw + sd);
    camAt(v3(hp.x + ax * D, hp.y - 0.02, hp.z + az * D), v3(hp.x - ax * 0.15, hp.y - 0.1, hp.z - az * 0.15), S.fov);
  } else {
    const k = ease(u);
    camAt(S.p0.clone().lerp(S.p1, k), S.l0.clone().lerp(S.l1, k), S.fov);
  }
  if (V.lamp) V.lamp.position.set(camera.position.x, 2.4, camera.position.z);
  // doors / lift doors are stateful: a frame rendered out of order (resume) replays the shot from its start without drawing
  w.update(dt, t);
  w.slideDoors?.(dt, camera.position.x, camera.position.z, V.singers.map(s => ({ x: s.x, z: s.z })));
  if (info.quiet) return null;
  overlay(t, sa, S, u);
  const vis = coverage(S);
  return vis;
};
V.render = () => { scene.updateMatrixWorld(); if (g.CFG.quality === 'high') g.post.render(1 / 24, 0, 0, 0); else g.renderer.render(scene, camera); };

// ---------------------------------------------------------------- coverage: who is visibly singing, which room the camera is in
const _p = new THREE.Vector3();
// a wall / ceiling / prop between the camera and a head (props right under the camera, i.e. the camera floating above a console, do not count)
function occluded(cam, dx, dy, dz, d) {
  const ux = dx / d, uy = dy / d, uz = dz / d; let t0 = 0;
  for (let k = 0; k < 40; k++) {
    const h = g.world.raycast(cam.x + ux * t0, cam.y + uy * t0, cam.z + uz * t0, ux, uy, uz, d - t0); if (!h) return false;
    const at = t0 + h.dist; if (at >= d - 0.4) return false;
    if (h.kind === 'prop') { t0 = at + 0.2; continue; }   // world.raycast treats every prop as 2.2 m tall: only walls / ceilings / floors count as cover
    return true;
  }
  return false;
}
function coverage(S) {
  const w = g.world, cam = camera.position, ids = [];
  camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  for (const s of V.singers) {
    _p.set(s.x, s.H.height * 0.92, s.z); const dx = _p.x - cam.x, dy = _p.y - cam.y, dz = _p.z - cam.z, d = Math.hypot(dx, dy, dz);
    if (d > 26) continue; const q = _p.clone().project(camera); if (q.z > 1 || Math.abs(q.x) > 0.95 || Math.abs(q.y) > 0.95) continue;
    if (occluded(cam, dx, dy, dz, d)) continue;
    ids.push(s.p.id);
  }
  const [tx, ty] = w.tile(cam.x, cam.z), here = w.d.room[ty]?.[tx] || 'corridor';
  return { ids, room: S.kind?.startsWith('lift') ? 'lift' : here, look: S.room?.type || S.who?.room?.type || null };
}

// ---------------------------------------------------------------- overlays (LCARS: docs/hud/style-guide.html tokens from css/hud-skin.css)
function buildOverlay() {
  const css = `
#vid{position:fixed;inset:0;z-index:50;pointer-events:none;font-family:var(--f-d);color:var(--k-ink);--o:var(--k-orange)}
#vid .frame{position:absolute;left:14px;top:12px;display:flex;gap:6px;align-items:stretch}
#vid .elbow{width:84px;height:46px;border-radius:26px 0 0 0;background:var(--k-orange);position:relative}
#vid .elbow:after{content:'';position:absolute;right:0;bottom:0;width:62px;height:22px;background:#000;border-radius:16px 0 0 0;opacity:.0}
#vid .dk{display:flex;flex-direction:column;gap:4px;padding-top:2px}
#vid .dk .lbl{font:800 13px/1 var(--f-d);letter-spacing:.16em;text-transform:uppercase;color:var(--k-gold);text-shadow:0 1px 3px #000}
#vid .dk .big{font:800 26px/1 var(--f-d);letter-spacing:.06em;text-transform:uppercase;text-shadow:0 2px 6px #000}
#vid .segs{display:flex;gap:3px;margin-top:2px}
#vid .segs i{width:26px;height:10px;border-radius:3px;background:rgba(125,151,232,.35)}
#vid .segs i.v{background:var(--k-peri)} #vid .segs i.c{background:var(--k-orange);box-shadow:0 0 8px rgba(240,147,58,.7)}
#vid .room{display:inline-flex;align-items:center;gap:8px;margin-top:3px;font:800 12px/1 var(--f-d);letter-spacing:.14em;text-transform:uppercase}
#vid .room b{background:var(--k-lav);color:#0a0a10;border-radius:999px;padding:4px 10px}
#vid .room span{color:var(--k-dim);text-shadow:0 1px 3px #000}
#vid .kara{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);display:flex;align-items:stretch;border-radius:999px;overflow:hidden;background:rgba(6,8,16,.86);box-shadow:0 4px 18px rgba(0,0,0,.5);max-width:1180px}
#vid .kara .who{display:flex;align-items:center;padding:0 16px 0 22px;font:800 13px/1 var(--f-d);letter-spacing:.14em;text-transform:uppercase;color:#120a05;background:var(--k-orange);white-space:nowrap}
#vid .kara .who.all{background:var(--k-peri)}
#vid .kara .txt{padding:9px 24px 9px 16px;font:700 27px/1.15 var(--f-d);letter-spacing:.02em;white-space:nowrap}
#vid .kara .txt span{color:rgba(243,238,230,.42);position:relative}
#vid .kara .txt span.d{color:var(--k-gold)} #vid .kara .txt span.n{color:#fff;text-shadow:0 0 12px rgba(244,194,91,.85)}
#vid .kara .cap{width:22px;background:var(--k-orange)} #vid .kara .cap.all{background:var(--k-peri)}
#vid .lift{position:absolute;right:22px;top:16px;display:flex;align-items:center;gap:0;border-radius:999px;overflow:hidden;background:rgba(6,8,16,.86)}
#vid .lift b{background:var(--k-gold);color:#120a05;font:800 12px/1 var(--f-d);letter-spacing:.16em;padding:9px 12px 9px 16px}
#vid .lift span{font:800 22px/1 var(--f-m);padding:4px 16px;color:var(--k-gold)}
#vid .card{position:absolute;left:28px;bottom:104px;display:flex;max-width:none;width:max-content;align-items:stretch;border-radius:22px 999px 999px 22px;overflow:hidden;background:rgba(6,8,16,.9);box-shadow:0 4px 18px rgba(0,0,0,.5)}
#vid .card .bar{width:18px;background:var(--c)} #vid .card .l{display:grid;place-items:center;width:44px;background:var(--c);color:#0a0a10;font:800 22px var(--f-d)}
#vid .card .body{padding:10px 30px 10px 14px;white-space:nowrap} #vid .card .nm{font:800 24px/1.05 var(--f-d);letter-spacing:.04em;text-transform:uppercase}
#vid .card .sub{font:600 13px/1.4 var(--f-d);letter-spacing:.12em;text-transform:uppercase;color:var(--k-dim);display:flex;gap:8px;align-items:center}
#vid .card .sub i{display:inline-flex;gap:3px} #vid .card .sub i s{width:8px;height:8px;border-radius:50%;background:var(--k-gold);display:inline-block} #vid .card .sub i s.h{background:none;border:2px solid var(--k-gold);width:6px;height:6px}
#vid .card .sub em{font-style:normal;color:var(--c)}
#vid .tags .tg{position:absolute;display:flex;align-items:center;gap:5px;border-radius:999px;overflow:hidden;background:rgba(6,8,16,.82);font:800 10px/1.6 var(--f-d);letter-spacing:.08em;text-transform:uppercase;padding-right:8px;transform:translate(-50%,-100%);white-space:nowrap}
#vid .tags .tg b{background:var(--c);color:#0a0a10;padding:0 6px 0 7px}
#vid .full{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(5,6,11,var(--bg,.72))}
#vid .panel{display:grid;grid-template-columns:120px 1fr;grid-template-rows:auto 1fr auto;width:900px;min-height:330px;gap:0}
#vid .panel .tl{background:var(--k-orange);border-radius:60px 0 0 0;height:64px}
#vid .panel .tr{display:flex;gap:8px;align-items:flex-start;padding-left:8px}
#vid .panel .tr i{height:22px;border-radius:0 0 0 0;background:var(--k-orange)} #vid .panel .tr i:nth-child(2){background:var(--k-gold)} #vid .panel .tr i:nth-child(3){background:var(--k-peri)} #vid .panel .tr i:last-child{border-radius:0 999px 999px 0;background:var(--k-lav)}
#vid .panel .side{display:flex;flex-direction:column;gap:8px;padding-top:8px} #vid .panel .side i{display:block;background:var(--k-peri);border-radius:0;height:52px} #vid .panel .side i:nth-child(2){background:var(--k-lav);height:90px} #vid .panel .side i:nth-child(3){background:var(--k-gold);height:34px}
#vid .panel .bl{background:var(--k-orange);border-radius:0 0 0 60px;height:56px;margin-top:8px}
#vid .panel .main{padding:14px 10px 0 34px}
#vid .panel .br{display:flex;gap:8px;align-items:flex-end;padding-left:8px} #vid .panel .br i{height:22px;background:var(--k-orange)} #vid .panel .br i:last-child{border-radius:0 999px 999px 0;background:var(--k-gold)}
#vid .panel h1{font:800 54px/1 var(--f-d);letter-spacing:.04em;text-transform:uppercase;margin:6px 0 10px}
#vid .panel h2{font:800 18px/1.2 var(--f-d);letter-spacing:.2em;text-transform:uppercase;color:var(--k-gold);margin:0}
#vid .panel p{font:600 17px/1.5 var(--f-d);letter-spacing:.06em;color:var(--k-dim);margin:8px 0 0;text-transform:uppercase}
#vid .panel .stats{display:flex;gap:10px;margin-top:18px} #vid .panel .stats div{border-radius:999px;background:var(--k-peri);color:#0a0a10;font:800 15px/1 var(--f-d);letter-spacing:.12em;text-transform:uppercase;padding:9px 16px}
#vid .panel .stats div:nth-child(2){background:var(--k-gold)} #vid .panel .stats div:nth-child(3){background:var(--k-lav)} #vid .panel .stats div:nth-child(4){background:var(--k-orange)}
`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const el = document.createElement('div'); el.id = 'vid'; document.body.appendChild(el); V.el = el;
}
const esc = (s) => String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]);
const _q = new THREE.Vector3();
function overlay(t, sa, S, u) {
  const el = V.el, decks = G.ship.decks; let h = '';
  const full = S.kind === 'title' || S.kind === 'end';
  // title / end cards
  if (S.kind === 'title') {
    const a = Math.min(1, Math.max(0, (t - 0.2) / 0.8)) * Math.min(1, Math.max(0, (S.t1 - t) / 0.7));
    h += `<div class="full" style="opacity:${a.toFixed(3)};--bg:.55"><div class="panel"><div class="tl"></div><div class="tr"><i style="width:300px"></i><i style="width:90px"></i><i style="width:160px"></i><i style="width:120px"></i></div>
      <div class="side"><i></i><i></i><i></i></div><div class="main"><h2>${esc(G.ship.name)} · ${esc(G.ship.reg)} · ${esc(G.ship.cls)}-class</h2><h1>All hands, sing out</h1>
      <p>“What shall we do with the drunken ensign?”<br>A traditional shanty, sung by the whole ship's company<br>${V.people.length} crew · ${decks} decks · bridge to engineering</p></div>
      <div class="bl"></div><div class="br"><i style="width:420px"></i><i style="width:200px"></i></div></div></div>`;
  }
  if (S.kind === 'end') {
    const a = Math.min(1, Math.max(0, (u - 0.7) / 0.1));   // after the held note
    const cov = V.summary || {};
    h += `<div class="full" style="opacity:${a.toFixed(3)};--bg:.78"><div class="panel"><div class="tl"></div><div class="tr"><i style="width:260px"></i><i style="width:120px"></i><i style="width:180px"></i><i style="width:110px"></i></div>
      <div class="side"><i></i><i></i><i></i></div><div class="main"><h2>${esc(G.ship.name)} · end of watch</h2><h1>Early in the morning</h1>
      <p>Sung by the ship's company of the ${esc(G.ship.name)}<br>Traditional tune, public domain · words adapted for the ship<br>Voices synthesised: the lyrics are on screen, not in the singing</p>
      <div class="stats"><div>${cov.singers ?? V.people.length} singers on screen</div><div>${cov.decks ?? decks} / ${decks} decks</div><div>${cov.rooms ?? '—'} spaces</div><div>${cov.depts ?? 8} departments</div></div></div>
      <div class="bl"></div><div class="br"><i style="width:420px"></i><i style="width:200px"></i></div></div></div>`;
  }
  if (!full || S.kind === 'end' && u < 0.7) {
    // deck progress: deck N of M, the decks visited so far
    const dn = S.deckShown ?? V.deck;
    const segs = Array.from({ length: decks }, (_, i) => `<i class="${i + 1 === dn ? 'c' : i + 1 < dn || (S.visited || 0) >= i + 1 ? 'v' : ''}"></i>`).join('');
    const where = S.kind?.startsWith('lift') ? 'Turbolift' : ROOM_NAME[S.roomShown || S.room?.type || S.who?.room?.type] || '';
    h += `<div class="frame"><div class="elbow"></div><div class="dk"><div class="lbl">${esc(G.ship.name)}</div><div class="big">Deck ${dn} <span style="color:var(--k-dim);font-size:18px">of ${decks}</span></div><div class="segs">${segs}</div>
      ${where ? `<div class="room"><b>${esc(where)}</b><span>${S.kind?.startsWith('lift') ? '' : esc(deckZone(dn))}</span></div>` : ''}</div></div>`;
    if (S.kind === 'lift-depart' || S.kind === 'lift-arrive') {
      let shown = S.kind === 'lift-arrive' ? S.deckShown : S.deckShown;
      if (S.kind === 'lift-depart' && S.toDeck) { const k = Math.max(0, Math.min(1, (u - 0.3) / 0.65)); shown = Math.round(lerp(S.deckShown, S.toDeck, k)); }
      h += `<div class="lift"><b>Turbolift</b><span>${shown < 10 ? '0' : ''}${shown}</span></div>`;
    }
  }
  // karaoke bar (the current line, the sung syllables gold, the one being sung bright)
  if (sa.line && !sa.end && !(S.kind === 'title' && sa.intro)) {
    const L = sa.line, lead = L.part === 'lead' && sa.block ? V.leads[sa.block.i] : null;
    const who = lead ? `Call · ${esc(shortOf(lead.id))}` : L.tag ? 'All hands' : (sa.block?.kind === 'chorus' ? 'All hands' : `Deck ${sa.block?.deck} crew`);
    const words = L.syl.map(s => `<span class="${sa.e >= s.e + s.n ? 'd' : sa.e >= s.e ? 'n' : ''}">${esc(s.w.replace(/-$/, ''))}${s.w.endsWith('-') ? '' : ' '}</span>`).join('');
    h += `<div class="kara"><div class="who ${lead ? '' : 'all'}">${who}</div><div class="txt">${words}</div><div class="cap ${lead ? '' : 'all'}"></div></div>`;
  } else if (sa.intro && S.kind !== 'title') { /* nothing */ }
  // name card for close-ups
  if (S.kind === 'close' && u > 0.08) {
    const p = S.who.p, c = deptCol(p);
    h += `<div class="card" style="--c:${c}"><div class="l">${DEPT_LETTER[p.dept] || '·'}</div><div class="body"><div class="nm">${esc(p.full)}</div><div class="sub"><i>${pipsHTML(p.rank)}</i>${esc(p.title)} · <em>${esc(DEPT[p.dept]?.name || p.dept)}</em></div></div></div>`;
  }
  // small name tags over the nearest singers in wide shots
  if ((S.kind === 'wide') && u > 0.1) {
    const cam = camera.position, list = V.singers.map(s => ({ s, d: Math.hypot(s.x - cam.x, s.z - cam.z) })).filter(o => o.d < 7.5).sort((a, b) => a.d - b.d).slice(0, 4);
    h += '<div class="tags">';
    for (const { s } of list) {
      _q.set(s.x, s.H.height + 0.32, s.z).project(camera); if (_q.z > 1 || Math.abs(_q.x) > 0.85 || _q.y > 0.8 || _q.y < -0.4) continue;
      if (occluded(cam, s.x - cam.x, s.H.height * 0.92 - cam.y, s.z - cam.z, Math.hypot(s.x - cam.x, s.H.height * 0.92 - cam.y, s.z - cam.z))) continue;
      h += `<div class="tg" style="--c:${deptCol(s.p)};left:${((_q.x + 1) / 2 * innerWidth).toFixed(0)}px;top:${((1 - _q.y) / 2 * innerHeight).toFixed(0)}px"><b>${DEPT_LETTER[s.p.dept] || '·'}</b>${esc(s.p.short)}</div>`;
    }
    h += '</div>';
  }
  if (el._h !== h) { el.innerHTML = h; el._h = h; }
}
const shortOf = (id) => V.people.find(o => o.p.id === id)?.p.short || '';
const deckZone = (dn) => { const types = Object.keys(G.plan).filter(t => G.plan[t].some(r => r.deckNo === dn)); return types.map(t => ROOM_NAME[t] || t).slice(0, 3).join(' · '); };
