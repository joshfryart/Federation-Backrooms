import { ClingModel, ClingHud } from '../js/cling-hud.js';
import assert from 'node:assert';
{ const m = new ClingModel(); m.on(4.5); assert(m.label === 'MASH [E]'); m.tick(2, 0.1); assert(m.progress > 0.5 && m.label === 'KEEP MASHING'); m.mash(); assert(m.mashes === 1);
  m.tick(0.5); assert(m.label === 'ALMOST OFF' && m.vignette < 35); m.reset(); assert(!m.active && m.progress === 0);
  const h = new ClingHud(null); const P = { clung: 3, clungMax: 4 }; h.on(4.5); h.reset(P); assert(P.clung === 0 && !h.m.active); console.log('cling ok'); }
import { Hiding, HIDE } from '../js/hide.js';
{ const S = { DORMANT: 0, PATROL: 1, CHASE: 2, SEARCH: 3, INVESTIGATE: 4, STUNNED: 5 }; const said = [];
  const world = { d: { props: [{ kind: 'lockers', tx: 1, ty: 1 }] }, center: () => [1, 0], los: () => true, solidAt: (x) => x > 8, tile: (x, z) => [Math.floor(x), Math.floor(z)] };
  const P = { x: 0, z: 0, yaw: 0 }; const g = { kind: 'gronk', x: 30, z: 0, state: S.PATROL, timer: 0, setTarget(a, b) { this.tgt = [a, b]; } }; let hit = 0;
  const G = { phase: 'play', hideEnabled: () => true, say: (m) => said.push(m), hitPlayer: () => hit++ };
  const H = new Hiding({ world, P, sound: null, game: G, enemies: () => [g], S });
  assert(H.toggle() && P.hidden, 'hides');
  g.x = 1; g.state = S.SEARCH; for (let i = 0; i < 50; i++) H.update(0.1); assert(!P.hidden && hit === 1, 'found');
  H.update(3); g.state = S.CHASE; g.x = 5; assert(H.toggle() && !P.hidden, 'refused while watched');
  g.state = S.PATROL; g.x = 20; P.yaw = -Math.PI / 2; assert(H.decoy() && g.state === S.INVESTIGATE && g.tgt, 'decoy');
  H.dcd = 0; H.decoy(); H.dcd = 0; assert(!H.decoy() && H.decoys === 0, 'limit'); console.log('hide ok'); }
import { Tutor, RULES } from '../js/hints.js';
{ const mem = {}; const st = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } }; const said = []; const T = new Tutor(st, m => said.push(m));
  const c = { deck: 3, deckTime: 30, threats: ['gronk', 'clinger'], nearLocker: false, hostiles: 1, hp: 1 };
  assert(!T.tick(1, c), 'cooldown'); const r = T.tick(10, c); assert(r && said.length === 1);
  assert(!T.tick(1, c)); const r2 = T.tick(20, c); assert(r2 && r2.id !== r.id);
  const T2 = new Tutor(st, () => {}); assert(T2.seen.has(r.id) && T2.seen.has(r2.id), 'persisted');
  assert(!T2.tick(99, { ...c, deck: 1 }), 'none on deck 1'); console.log('hints ok'); }
import { ACC, apply, load, save, Captions, CUES } from '../js/access.js';
{ const mem = {}; const st = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
  apply({ shake: true, grain: true, cb: 'deut', cues: true }); assert(ACC.shake < 1 && ACC.grain === 0 && ACC.flash === 1); save(st);
  apply({}); assert(ACC.shake === 1); load(st); assert(ACC.shake < 1 && ACC.cb === 'deut' && ACC.cues);
  apply({ cb: 'bogus' }); assert(ACC.cb === 'off'); apply({ cues: true });
  let t = 0; const C = new Captions(null, () => t); const s = { roar: () => 'r', thud: () => 't', distant: () => 'd' }; C.attach(s);
  s.roar(0.3); s.roar(0.3); assert(C.log.length === 1); t = 3000; s.roar(0.3); s.thud(0.01); s.distant('door'); assert(C.log.length === 3 && C.log[2] === 'A distant door', C.log.join());
  assert(s.roar() === 'r'); console.log('access ok'); }
import { ringNav } from '../js/nav.js';
{ const it = { kind: 'duty', id: 'a', left: 60, total: 100 }, pin = { kind: 'duty', id: 'a' };
  assert(!ringNav(it, null, { eta: 10 }).pinned); const r = ringNav(it, pin, { eta: 20 }); assert(r.pinned && Math.abs(r.notch - 0.4) < 1e-9 && !r.late);
  assert(ringNav(it, pin, { eta: 90 }).late && ringNav(it, pin, { eta: 90 }).notch === 0); assert(ringNav({ ...it, left: null }, pin, { eta: 5 }).notch === null); console.log('ringNav ok'); }
import { deckRoomTypes } from '../js/nav.js';
assert(deckRoomTypes({ lab: [{ deck: 2 }], gym: [{ deck: 1 }] }, 2, ['gym', 'lab', 'bridge']).join() === 'lab'); console.log('liftbadges ok');
