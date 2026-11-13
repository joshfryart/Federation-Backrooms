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
