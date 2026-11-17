// Procedural animation clips for the crew rig (no shipped clip exists for these in the free UAL set): `shamble` (space-madness gait), `vault` (hop over a low obstacle),
// `climb` (hand-over-hand ladder / wall climb). Built once per body kind from the clips that do exist:
//   * shamble: the Walk clip with a stooped spine, a lolling head, arms hanging forward, a dragging left leg (swing damped toward the mean), slowed down.
//   * vault / climb: keyframed bone rotations as local-axis deltas on the first frame of Idle (the neutral pose); +x on a spine / neck bone bends forward, -x on a thigh
//     lifts the knee, +x on a calf bends the knee. Positions are metres on the UAL skeleton and are scaled by k (this body's pelvis scale) like every other pelvis track.
// Pure three.js; used by js/humans.js info().
import * as THREE from 'three';

const E = new THREE.Euler(), Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion();
const deltaQ = (x = 0, y = 0, z = 0) => Q2.setFromEuler(E.set(x, y, z, 'XYZ')).clone();

/** neutral local quaternion / position of each animated bone = first key of the Idle clip */
function neutralOf(clips) {
  const idle = clips.idle, out = { q: {}, pos: null };
  if (!idle) return out;
  for (const t of idle.tracks) {
    const [bone, prop] = t.name.split('.');
    if (prop === 'quaternion') out.q[bone] = new THREE.Quaternion(t.values[0], t.values[1], t.values[2], t.values[3]);
    else if (prop === 'position' && bone === 'pelvis') out.pos = new THREE.Vector3(t.values[0], t.values[1], t.values[2]);
  }
  return out;
}

/** keys: [{ t, rot: { bone: [x, y, z] }, pelvis: [dx, dy, dz] }]; every bone in `neutral` gets a track (unlisted bones hold their neutral pose) */
function keyed(name, neutral, k, duration, keys) {
  const times = keys.map(c => c.t * duration), tracks = [];
  for (const bone of Object.keys(neutral.q)) {
    const vals = [];
    for (const c of keys) {
      const r = c.rot?.[bone]; Q.copy(neutral.q[bone]); if (r) Q.multiply(deltaQ(r[0], r[1], r[2]));
      vals.push(Q.x, Q.y, Q.z, Q.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(bone + '.quaternion', times, vals));
  }
  if (neutral.pos) {
    const vals = []; for (const c of keys) { const d = c.pelvis || [0, 0, 0]; vals.push(neutral.pos.x + d[0] * k, neutral.pos.y + d[1] * k, neutral.pos.z + d[2] * k); }
    tracks.push(new THREE.VectorKeyframeTrack('pelvis.position', times, vals));
  }
  return new THREE.AnimationClip(name, duration, tracks);
}

const SIDE = (l, r) => ({ ...Object.fromEntries(Object.entries(l).map(([b, v]) => [b + '_l', v])), ...Object.fromEntries(Object.entries(r).map(([b, v]) => [b + '_r', v])) });

function vaultClip(neutral, k) {
  // run-up lean -> plant both hands and tuck -> knees high over the obstacle -> land softly -> recover. One shot, 0.8 s.
  const arms = (up, fwd) => SIDE({ upperarm: [fwd, 0, 0], lowerarm: [up, 0, 0] }, { upperarm: [fwd, 0, 0], lowerarm: [up, 0, 0] });
  return keyed('vault', neutral, k, 0.8, [
    { t: 0.00, rot: { spine_01: [0.12, 0, 0], spine_02: [0.1, 0, 0], ...SIDE({ thigh: [-0.2, 0, 0] }, { thigh: [0.25, 0, 0] }) } },
    { t: 0.20, rot: { spine_01: [0.5, 0, 0], spine_02: [0.45, 0, 0], neck_01: [-0.25, 0, 0], ...arms(0.1, -0.15), ...SIDE({ thigh: [-0.7, 0, 0.05], calf: [1.1, 0, 0] }, { thigh: [-0.5, 0, -0.05], calf: [1.0, 0, 0] }) }, pelvis: [0, 0.06, 0.05] },
    { t: 0.42, rot: { spine_01: [0.7, 0, 0], spine_02: [0.5, 0, 0], neck_01: [-0.4, 0, 0], ...arms(0.05, -0.05), ...SIDE({ thigh: [-1.45, 0, 0.12], calf: [1.7, 0, 0] }, { thigh: [-1.3, 0, -0.12], calf: [1.6, 0, 0] }) }, pelvis: [0, 0.16, 0.12] },
    { t: 0.62, rot: { spine_01: [0.35, 0, 0], spine_02: [0.25, 0, 0], ...arms(0.25, -0.35), ...SIDE({ thigh: [-0.65, 0, 0], calf: [0.95, 0, 0] }, { thigh: [-0.4, 0, 0], calf: [0.7, 0, 0] }) }, pelvis: [0, -0.04, 0.1] },
    { t: 1.00, rot: { spine_01: [0.1, 0, 0], ...SIDE({ thigh: [-0.1, 0, 0] }, { thigh: [0.1, 0, 0] }) } },
  ]);
}

function climbClip(neutral, k) {
  // facing the wall / ladder: opposite hand and foot reach up in turn, torso close to the rungs. Loop, 1.2 s.
  const reachUp = { upperarm: [-2.55, 0, 0], lowerarm: [0.5, 0, 0] }, hold = { upperarm: [-1.5, 0, 0], lowerarm: [1.5, 0, 0] };
  const stepUp = { thigh: [-1.2, 0, 0], calf: [1.5, 0, 0] }, push = { thigh: [-0.1, 0, 0], calf: [0.15, 0, 0] };
  const pose = (aL, aR, lL, lR, y, sway) => ({ rot: { spine_01: [0.12, 0, sway], spine_02: [0.1, 0, -sway], neck_01: [-0.35, 0, 0], ...SIDE({ ...aL, ...lL }, { ...aR, ...lR }) }, pelvis: [0, y, 0] });
  return keyed('climb', neutral, k, 1.2, [
    { t: 0.0, ...pose(reachUp, hold, push, stepUp, 0.0, 0.05) },
    { t: 0.25, ...pose(hold, hold, push, push, 0.06, 0) },
    { t: 0.5, ...pose(hold, reachUp, stepUp, push, 0.0, -0.05) },
    { t: 0.75, ...pose(hold, hold, push, push, 0.06, 0) },
    { t: 1.0, ...pose(reachUp, hold, push, stepUp, 0.0, 0.05) },
  ]);
}

function shambleClip(clips, neutral) {
  const walk = clips.walk; if (!walk) return null;
  const c = walk.clone(); c.name = 'shamble';
  const off = { spine_01: [0.26, 0, 0.04], spine_02: [0.2, 0, -0.05], spine_03: [0.1, 0, 0], neck_01: [0.14, 0, 0.14], Head: [0.1, 0, 0.1], upperarm_l: [0.5, 0, 0.1], upperarm_r: [0.62, 0, -0.1], lowerarm_l: [0.35, 0, 0], lowerarm_r: [0.4, 0, 0] };
  const drag = new Set(['thigh_l', 'calf_l', 'foot_l']);   // the left leg drags: its swing is damped toward its mean pose
  const SLOW = 1.4;
  for (const t of c.tracks) {
    const [bone, prop] = t.name.split('.'); t.times = t.times.map(x => x * SLOW);
    if (prop !== 'quaternion') continue;
    const v = t.values, n = v.length / 4;
    if (drag.has(bone)) { const m = new THREE.Quaternion(v[0], v[1], v[2], v[3]); for (let i = 0; i < n; i++) { Q.set(v[i * 4], v[i * 4 + 1], v[i * 4 + 2], v[i * 4 + 3]); Q.slerp(m, 0.5); v[i * 4] = Q.x; v[i * 4 + 1] = Q.y; v[i * 4 + 2] = Q.z; v[i * 4 + 3] = Q.w; } }
    const o = off[bone]; if (o) { const d = deltaQ(o[0], o[1], o[2]); for (let i = 0; i < n; i++) { Q.set(v[i * 4], v[i * 4 + 1], v[i * 4 + 2], v[i * 4 + 3]).multiply(d); v[i * 4] = Q.x; v[i * 4 + 1] = Q.y; v[i * 4 + 2] = Q.z; v[i * 4 + 3] = Q.w; } }
  }
  c.duration *= SLOW; c.resetDuration?.();
  return c;
}

/** the procedural clips for one body kind; `clips` = that kind's loaded clips (lowercase names), `k` = pelvis scale */
export function procClips(clips, k) {
  const neutral = neutralOf(clips), out = {};
  if (!Object.keys(neutral.q).length) return out;
  out.vault = vaultClip(neutral, k); out.climb = climbClip(neutral, k);
  const s = shambleClip(clips, neutral); if (s) out.shamble = s;
  return out;
}
