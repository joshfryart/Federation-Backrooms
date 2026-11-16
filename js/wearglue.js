// wearglue.js — game glue for the batch 9 wear art (js/wearart.js) on simmed crew bodies (docs/wearart.md, docs/propart-integration.md "Wiring pass").
//   wearStep(e, dt, d, G, world)  per frame for a crew body the player can see (main.js, after fidgetStep and before H.update): it may own the additive bone layer
//   wearWalk(e, G, d)              per frame for a crew body that is walking (main.js walk branch): undoes the lying pose, finishes a donning, keeps headgear right
// What it does:
//   * headsets: comms / helm / sensor billets wear one (W-8)
//   * breathers: during a fire or contamination alert on this deck crew pull a half mask on (don_hood gesture when standing, straight on while walking); off on all-clear (W-7, K-4)
//   * suit locker: the `suitrack` / `airlock_doors` script's `don_suit` step (fx) plays the K-4 suit donning gesture; the clear hood (the suit helmet stand-in) appears at
//     its swap point and comes off when they leave the locker
//   * sleeping: a crew member whose block is `sleep` at a bunk / platform bed lies on it (K-1 applyLie, supine; one sleeper per bed); clearLie when they get up
// Off-screen bodies are never touched (main.js only calls this inside the 22 m skinning range); the sim's logical position (e.x / e.z) is never moved.
import { GESTURES } from './movement.js';
import { GESTURES_WEAR, Donner, applyLie, clearLie, wearHeadgear } from './wearart.js';
import { opStart, opEnd } from './haul.js';

Object.assign(GESTURES, GESTURES_WEAR);   // don_suit / don_hood in the shared gesture table (states: operating)

export const HEADSET_BILLETS = new Set(['comms', 'helm', 'sensor']);
export const MASK_ALERTS = ['fire', 'contamination'];
const BEDS = { bunk: { top: 0.52, head: [-1, 0], len: 0.86 }, platform_bed: { top: 0.55, head: [0, -1], len: 0.8 } };   // head = local direction of the pillow end
const W = (e) => e.wear || (e.wear = { headset: null, mask: null, hood: null, don: null, lie: null });

function maskWanted(G) {
  const A = G.comms?.alerts; if (!A) return false; const deck = (G.shipDeck ?? 0) + 1;
  return MASK_ALERTS.some(id => { const a = A.get(id); return a && (a.deck == null || a.deck === deck); });
}
function headgear(e, G, standing) {
  const w = W(e), mesh = e.mesh;
  if (!w.headset && w.headset !== false && HEADSET_BILLETS.has(e.person?.billet)) w.headset = wearHeadgear(mesh, 'headset') || false;
  const want = maskWanted(G);
  if (want && !w.mask) { w.mask = wearHeadgear(mesh, 'mask'); if (w.mask && standing && !w.lie && !w.don) w.don = new Donner(mesh, 'don_hood', w.mask); }
  else if (!want && w.mask) { if (w.don?.worn === w.mask) w.don = null; w.mask.remove(); w.mask = null; }
}
function finishDon(e) { const w = W(e); if (!w.don) return; w.don.worn?.setVisible(true); w.don = null; const H = e.mesh.userData.human; if (H) H.add = null; }

/** the bed (bunk / platform bed prop) a sleeper at (x, z) uses: { p, cx, cz } or null */
function bedNear(world, e) {
  if (e.opProp) { const [tx, ty] = world.tile(e.opProp[0], e.opProp[1]), p = world.d.props.find(q => q.tx === tx && q.ty === ty && BEDS[q.kind]); if (p) { const [cx, cz] = world.center(tx, ty); if (Math.hypot(cx - e.x, cz - e.z) < 3.6) return { p, cx, cz }; } }   // the bed the use script faced (if they are still beside it: opProp outlives the visit)
  let best = null, bd = 3.6;   // the logical position is clamped toward the seat, up to 0.95 m off the tile centre on both axes
  for (const p of world.d.props) { if (!BEDS[p.kind]) continue; const [cx, cz] = world.center(p.tx, p.ty), dd = Math.hypot(cx - e.x, cz - e.z); if (dd < bd) { bd = dd; best = { p, cx, cz }; } }
  return best;
}
const lyingOn = new Map();   // prop -> entity lying on it (one sleeper per bed)

export function wearWalk(e, G, d = 0) {
  const w = e.wear; if (!e.mesh?.userData.human || e.fake) return;
  if (w?.lie) standUp(e, false);
  if (w?.don) finishDon(e);
  if (w?.hood) { w.hood.remove(); w.hood = null; }
  if (d <= 22 && e.person) headgear(e, G, false);   // off-screen walkers get their headgear when they come into view
}
function standUp(e, resume) {
  const w = W(e), mesh = e.mesh, yaw = w.lie?.yaw ?? mesh.rotation.y; if (w.lie) lyingOn.delete(w.lie.p);
  clearLie(mesh); mesh.rotation.y = yaw; mesh.position.x = e.x; mesh.position.z = e.z; w.lie = null;
  if (resume && !e.walk && !e.op) opStart(e);   // back to the bunk's use script (sitting on it)
}

export function wearStep(e, dt, d, G, world) {
  const H = e.mesh?.userData.human; if (!H || !e.person || e.fake || !e.simmed) return;
  const w = W(e);
  // sleeping on a bunk / platform bed
  const asleep = e.spot === 'bunk' && !e.walk && !e.board && !e.cower && !e.repairing && !e.haul && G.sim?.where(e.person)?.activity === 'sleep' && !G.sim.where(e.person).transit;   // not someone standing in the lift car on their way to bed (pathing iteration 6: a boarder lay down on their old bunk 10 m away)
  if (asleep && !w.lie && world) {
    const b = bedNear(world, e), other = b && lyingOn.get(b.p);
    if (b && (!other || other === e || !other.mesh?.parent || other.wear?.lie?.p !== b.p)) {
      if (e.op) opEnd(e); finishDon(e);
      const B = BEDS[b.p.kind], r = b.p.rot || 0, c = Math.cos(r), s = Math.sin(r), hx = B.head[0] * c + B.head[1] * s, hz = -B.head[0] * s + B.head[1] * c;
      const sc = H.height / 1.75; w.lie = { p: b.p, top: b.p.top ?? B.top, yaw: Math.atan2(-hx, -hz), x: b.cx - hx * B.len * sc, z: b.cz - hz * B.len * sc, t0: e.person.id * 1.7 };
      lyingOn.set(b.p, e);
    }
  } else if (!asleep && w.lie) standUp(e, true);
  if (w.lie) {
    if (e.op) opEnd(e);   // something restarted the use script (a dodge, a talk): the sleeper stays down
    if (H.current !== 'idle') H.play('idle', { fade: 0.4 });
    applyLie(e.mesh, 'supine', { top: w.lie.top, yaw: w.lie.yaw, t: (G.time || 0) + w.lie.t0 }); e.mesh.position.x = w.lie.x; e.mesh.position.z = w.lie.z; e.ease = null; H.face({ LeftUpperLidClosed: 1, RightUpperLidClosed: 1 });
    headgear(e, G, false); return;
  }
  headgear(e, G, true);
  // suit locker: the don_suit step of the suitrack script
  const atLocker = e.op && (e.op.key === 'suitrack' || e.op.key === 'airlock_doors');
  if (atLocker && e.opFx === 'don_suit') { e.opFx = null; if (!w.hood) { w.hood = wearHeadgear(e.mesh, 'hood'); if (w.hood) { finishDon(e); w.don = new Donner(e.mesh, 'don_suit', w.hood); } } }   // once per visit
  else if (!atLocker && w.hood) { if (w.don?.worn === w.hood) w.don = null; w.hood.remove(); w.hood = null; }
  if (w.don && !w.don.update(dt)) finishDon(e);
}
