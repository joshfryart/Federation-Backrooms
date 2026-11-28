// Facial animation (stream C4): eye rig + gaze, blink variety, brow / lid coupling, lip-sync visemes, conversational expression layers,
// micro-expressions and speech head beats. Drives only what the body GLBs already have: the 15 face morphs of js/humans.js
// (LeftBrowDown RightBrowDown LeftInnerBrowUp RightInnerBrowUp NoseWrinkler LeftUpperLidOpen RightUpperLidOpen LeftUpperLidClosed
// RightUpperLidClosed UpperLipUp JawDrop MouthLeftPullUp MouthRightPullUp MouthLeftPullDown MouthRightPullDown) plus two eye bones that
// rigEyes() adds to each body kind once (no new geometry, no new material, no new morph, no new shader program: the eye mesh is skinned
// already, it just gets two more bones in its own skeleton; LODs untouched: the eye mesh is too small to have any).
//
// Hooks (kept tiny so js/humans.js / js/talk.js merge easily):
//   js/humans.js info(kind):   rigEyes(src.scene)            once per body kind, before any clone
//   js/humans.js liveFace():   idleFace(H, t, seed)          crowd / lift riders / viewers: blink variety + small eye darts
//   js/talk.js speaker():      FaceAnim.talk(...) / .after(...)  the conversation close-up
// Every random choice here runs on a private PRNG seeded per person, so the page's Math.random stream (seeded runs, golden shots) is untouched.
// No three.js import: js/talk.js (and so this file) is loaded by the node test suite (tools/test-talk.mjs). The eye rig gets three.js from
// js/humans.js (rigEyes(root, THREE)), which always runs before any eye is turned.
let THREE = null, _m, _m2, _v, _n, _q, _inv, _t;

// ------------------------------------------------------------------------------------------------ small pure helpers
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
const damp = (k, dt) => 1 - Math.exp(-k * dt);
export function prng(seed) { let s = (seed >>> 0) || 0x2545f491; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (a, b = 0) => { let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2d); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };

// the morph names (L / R pairs) and aliases older code used for shapes the bodies do not have
export const MORPHS = ['LeftBrowDown', 'RightBrowDown', 'LeftInnerBrowUp', 'RightInnerBrowUp', 'NoseWrinkler', 'LeftUpperLidOpen', 'RightUpperLidOpen', 'LeftUpperLidClosed', 'RightUpperLidClosed', 'UpperLipUp', 'JawDrop', 'MouthLeftPullUp', 'MouthRightPullUp', 'MouthLeftPullDown', 'MouthRightPullDown'];
/** Smile / Frown are not morphs on these bodies (setting them did nothing): expand them to the mouth-corner pulls. In place; returns f. */
export function expandAliases(f) {
  if (f.Smile) { f.MouthLeftPullUp = Math.max(f.MouthLeftPullUp || 0, f.Smile); f.MouthRightPullUp = Math.max(f.MouthRightPullUp || 0, f.Smile * 0.92); }
  if (f.Frown) { f.MouthLeftPullDown = Math.max(f.MouthLeftPullDown || 0, f.Frown); f.MouthRightPullDown = Math.max(f.MouthRightPullDown || 0, f.Frown); }
  delete f.Smile; delete f.Frown; return f;
}

// ------------------------------------------------------------------------------------------------ blink (pure, stateful)
// Real blinks: ~10-20 a minute at rest, fewer while listening / concentrating, more while speaking or stressed; the lid shuts fast
// (~70 ms, accelerating), holds ~30 ms and reopens slower (~150 ms, decelerating); some are doubles, some only half close; a big gaze
// shift often brings one with it. A step-function blink (the old 0.1 s fully shut every 2.7 s like clockwork) reads as mechanical.
export const BLINK = { close: 0.07, hold: 0.03, open: 0.16, gap: [1.6, 3.0], double: 0.14, half: 0.12, shiftBlink: 0.45 };
export class Blinker {
  constructor(rnd) { this.r = rnd; this.ph = -1; this.next = 0.4 + rnd() * 3; this.amp = 1; this.slow = 1; this.dbl = false; this.lid = 0; }
  interval(rate = 1) { const [a, m] = BLINK.gap; return clamp((a + -Math.log(1 - this.r() * 0.98) * m) / rate, 0.6, 9); }   // shifted exponential, mean ~4 s at rate 1
  start(amp = 1, slow = 1) { this.ph = 0; this.amp = amp; this.slow = slow; }
  /** a gaze shift / emphasis: start a blink now with probability p (not if one is running) */
  kick(p = BLINK.shiftBlink) { if (this.ph < 0 && this.r() < p) this.start(this.r() < 0.2 ? 0.75 : 1, 1); }
  /** dt (s), rate (blinks per time, 1 = rest), slow (>1 = drowsy lids) -> lid 0..1 */
  step(dt, rate = 1, slow = 1) {
    if (this.ph < 0) { this.next -= dt; if (this.next > 0) return (this.lid = 0);
      this.dbl = this.r() < BLINK.double; this.start(this.r() < BLINK.half ? 0.45 + this.r() * 0.25 : 1, slow * (0.9 + this.r() * 0.25)); }
    this.ph += dt; const c = BLINK.close * this.slow, h = BLINK.hold * this.slow, o = BLINK.open * this.slow, u = this.ph; let v;
    if (u < c) v = Math.pow(u / c, 1.6); else if (u < c + h) v = 1; else if (u < c + h + o) { const x = (u - c - h) / o; v = (1 - x) * (1 - x); }
    else { v = 0; this.ph = -1; this.next = this.dbl ? 0.06 + this.r() * 0.06 : this.interval(rate); this.dbl = false; }
    return (this.lid = v * this.amp);
  }
}

// ------------------------------------------------------------------------------------------------ visemes (pure)
// The bodies have no pucker / funnel / lip-roll shapes, so each viseme is a mix of the four mouth channels they do have:
// jaw = JawDrop, up = UpperLipUp (shows the upper teeth), wide = both corners up/out, round = both corners down/in (the nearest thing to
// rounding), close = bilabial seal (pulls the jaw shut whatever the vowel wants).
export const VIS_VOWEL = {
  a: { jaw: 0.6, up: 0.1, wide: 0.06, round: 0 }, e: { jaw: 0.36, up: 0.16, wide: 0.3, round: 0 }, i: { jaw: 0.2, up: 0.2, wide: 0.42, round: 0 },
  y: { jaw: 0.2, up: 0.2, wide: 0.38, round: 0 }, o: { jaw: 0.44, up: 0.04, wide: 0, round: 0.32 }, u: { jaw: 0.24, up: 0, wide: 0, round: 0.42 },
};
export const VIS_CONS = {
  bil: { jaw: 0, up: 0, wide: 0, round: 0.1, close: 1 },          // m b p
  lab: { jaw: 0.07, up: 0.34, wide: 0.08, round: 0, close: 0.4 },  // f v: lower lip to the upper teeth
  alv: { jaw: 0.12, up: 0.12, wide: 0.14, round: 0 },             // t d n s z l c k g j x h
  rnd: { jaw: 0.14, up: 0, wide: 0, round: 0.36 },                // r w q
};
const CONS_OF = (ch) => (/[mbp]/.test(ch) ? 'bil' : /[fv]/.test(ch) ? 'lab' : /[rwq]/.test(ch) ? 'rnd' : ch ? 'alv' : '');
/** add each syllable's lead consonant letter class (`vc`) to a js/speech.js babblePlan syllable list, parsing the text the same way
 *  babblePlan does (its `cons` field only says plosive / fricative / nasal, which cannot tell an m from an n) */
export function visemePlan(text, syl) {
  if (!syl?.length) return syl || [];
  const words = String(text || '').replace(/…/g, '. ').match(/[A-Za-z0-9'’-]+|[,.!?;:—]/g) || [], per = new Map();
  for (const s of syl) { if (!per.has(s.word)) per.set(s.word, []); per.get(s.word).push(s); }
  for (const [wi, list] of per) {
    const w = words[wi] || '', lw = w.toLowerCase().replace(/[^a-z]/g, 'a'), groups = [...lw.matchAll(/[aeiouy]+/g)];
    list.forEach((s, i) => { const g = groups[i]; s.vc = g ? CONS_OF(g.index > 0 ? lw[g.index - 1] : '') : 'alv'; });
  }
  // sentence shape: a question raises the brows over its last word, an exclamation lands a beat on its last stressed syllable
  for (let i = 0; i < syl.length; i++) if (syl[i].end) { const w = syl[i].word; for (let k = i; k >= 0 && syl[k].word === w; k--) syl[k].q = syl[i].end === '?'; syl[i].bang = syl[i].end === '!'; }
  return syl;
}
/** mouth channels {jaw, up, wide, round, close} at time t of a viseme plan (consonant onset -> vowel nucleus -> release); 0s between syllables */
export function visemeAt(syl, t, out = { jaw: 0, up: 0, wide: 0, round: 0, close: 0 }) {
  out.jaw = out.up = out.wide = out.round = out.close = 0; if (!syl?.length || t < 0) return out;
  for (const s of syl) {
    if (t < s.at) break; if (t >= s.at + s.dur) continue;
    const u = (t - s.at) / s.dur, V = VIS_VOWEL[s.vow] || VIS_VOWEL.a, C = VIS_CONS[s.vc || ''] || null, amp = s.stress ? 1 : 0.8;
    const wc = C ? 1 - smooth(0.12, 0.42, u) : 0, wv = Math.pow(Math.sin(Math.PI * clamp((u - 0.1) / 0.9, 0, 1)), 0.7) * amp * (1 - wc * 0.6);
    for (const k of ['jaw', 'up', 'wide', 'round']) out[k] = (C ? C[k] * wc : 0) + V[k] * wv;
    out.close = C?.close ? C.close * wc : 0; out.jaw *= 1 - out.close; return out;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ eye rig (three.js, once per body kind)
function useThree(T) { if (THREE) return; THREE = T; _m = new T.Matrix4(); _m2 = new T.Matrix4(); _v = new T.Vector3(); _n = new T.Vector3(); _q = new T.Quaternion(); _inv = new T.Matrix4(); _t = new T.Vector3(); }
/** Give the `eyes` skinned mesh two bones of its own (children of Head, at each eyeball's centre), so the eyes can turn. On the SOURCE scene,
 *  before it is cloned (SkeletonUtils.clone maps bones by the hierarchy, so every body of that kind gets them). The eye geometry is shared by
 *  every clone; its skin indices / weights are rewritten once to the new bones. Returns the rig description (also on root.userData.eyeRig). */
export function rigEyes(root, T) {
  useThree(T);
  if (root.userData.eyeRig !== undefined) return root.userData.eyeRig; root.userData.eyeRig = null;
  let mesh = null; root.traverse(o => { if (!mesh && o.isSkinnedMesh && o.material?.name === 'eyes') mesh = o; }); if (!mesh) return null;
  const sk = mesh.skeleton, hi = sk.bones.findIndex(b => b.name === 'Head'); if (hi < 0) return null;
  const g = mesh.geometry, pos = g.attributes.position, nor = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, n = pos.count; if (!si || !sw || n < 6) return null;
  // bind-space positions / normals; the two eyes split by x around their common centre
  const P = [], N = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(mesh.bindMatrix); let cx = 0;
  for (let i = 0; i < n; i++) { const p = _v.fromBufferAttribute(pos, i).applyMatrix4(mesh.bindMatrix).clone(); P.push(p); cx += p.x / n; if (nor) N.add(_n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize()); }
  const fwd = N.lengthSq() > 1e-8 ? N.normalize().clone() : new THREE.Vector3(0, 0, 1), up = new THREE.Vector3(0, 1, 0); up.addScaledVector(fwd, -up.dot(fwd)).normalize();
  const side = P.map(p => (p.x > cx ? 0 : 1)), rig = { fwd: fwd.toArray(), up: up.toArray(), eyes: [] };
  const head = sk.bones[hi], headInv = sk.boneInverses[hi], bones = sk.bones.slice(), inv = sk.boneInverses.slice();
  for (const s of [0, 1]) {
    const ids = []; for (let i = 0; i < n; i++) if (side[i] === s) ids.push(i); if (!ids.length) continue;
    const c = new THREE.Vector3(); for (const i of ids) c.add(P[i]); c.multiplyScalar(1 / ids.length);
    let a = 0, zMin = Infinity, zMax = -Infinity; for (const i of ids) { const d = _v.subVectors(P[i], c), z = d.dot(fwd); zMin = Math.min(zMin, z); zMax = Math.max(zMax, z); a = Math.max(a, d.addScaledVector(fwd, -z).length()); }
    const h = Math.max(zMax - zMin, a * 0.05), R = clamp((a * a + h * h) / (2 * h), a * 1.05, a * 1.6);   // sphere through the cap rim and apex; caps this flat get a plausible eyeball radius
    const piv = c.clone().addScaledVector(fwd, zMax - R);
    const bone = new THREE.Bone(); bone.name = s ? 'fa_eye_r' : 'fa_eye_l';
    const M0 = _m.copy(headInv).multiply(_m2.makeTranslation(piv.x, piv.y, piv.z)); M0.decompose(bone.position, bone.quaternion, bone.scale); head.add(bone);
    bones.push(bone); inv.push(M0.clone().invert().multiply(headInv)); const bi = bones.length - 1;
    for (const i of ids) { si.setXYZW(i, bi, 0, 0, 0); sw.setXYZW(i, 1, 0, 0, 0); }
    rig.eyes.push({ name: bone.name, pivot: piv.toArray(), radius: R });
  }
  si.needsUpdate = sw.needsUpdate = true;
  mesh.bind(new THREE.Skeleton(bones, inv), mesh.bindMatrix);
  return (root.userData.eyeRig = rig);
}

// eye handles on one built human (lazy): the two bones, their rest rotations and the bind-space axes
function eyesOf(H) {
  if (H._eyes !== undefined) return H._eyes; if (!THREE) return null; H._eyes = null; let rig = null; H.inner.traverse(o => { if (!rig && o.userData?.eyeRig) rig = o.userData.eyeRig; });
  const L = H.inner.getObjectByName('fa_eye_l'), R = H.inner.getObjectByName('fa_eye_r'); if (!L || !R) return null;
  const fwd = new THREE.Vector3(...(rig?.fwd || [0, 0, 1])), up = new THREE.Vector3(...(rig?.up || [0, 1, 0])), right = new THREE.Vector3().crossVectors(up, fwd).normalize();
  // the rest local matrix can hold a mirror (the GLB's Head bind matrix does), so a gaze rotation is multiplied onto the matrix itself, not the quaternion
  const rest = (b) => { const m = new THREE.Matrix4().compose(b.position, b.quaternion, b.scale); b.matrixAutoUpdate = false; b.matrix.copy(m); b.matrixWorldNeedsUpdate = true; return m; };
  return (H._eyes = { L, R, qL: L.quaternion.clone(), qR: R.quaternion.clone(), mL: rest(L), mR: rest(R), fwd, up, right, yaw: 0, pitch: 0, conv: 0 });
}
export const EYE = { yawMax: 0.32, pitchUp: 0.14, pitchDown: 0.24, saccadeK: 38 };
/** turn both eyes (rad, + yaw = character's left... i.e. towards +right axis, + pitch = up) relative to the head; conv = small toe-in for near targets */
export function setEyes(H, yaw, pitch, conv = 0) {
  const E = eyesOf(H); if (!E) return false; E.yaw = yaw = clamp(yaw, -EYE.yawMax, EYE.yawMax); E.pitch = pitch = clamp(pitch, -EYE.pitchDown, EYE.pitchUp); E.conv = conv;
  for (const [b, m0, sg] of [[E.L, E.mL, 1], [E.R, E.mR, -1]]) {
    const y = yaw - sg * conv; _v.copy(E.fwd).multiplyScalar(Math.cos(pitch) * Math.cos(y)).addScaledVector(E.right, Math.cos(pitch) * Math.sin(y)).addScaledVector(E.up, Math.sin(pitch));
    b.matrix.multiplyMatrices(m0, _m.makeRotationFromQuaternion(_q.setFromUnitVectors(E.fwd, _v))); b.matrixWorldNeedsUpdate = true;
  }
  return true;
}
/** the eye direction (yaw, pitch, rad, in the head's bind frame) that looks at a world point; null without the rig. Head world matrix must be current. */
export function eyeAngles(H, target) {
  const E = eyesOf(H); if (!E) return null; const par = E.L.parent; if (!par) return null;
  // eye-bone world frame at rest = parent.matrixWorld * restLocal; its axes are the bind frame (see rigEyes)
  _m2.multiplyMatrices(par.matrixWorld, E.mL); const pl = _v.setFromMatrixPosition(_m2).clone();
  _m2.multiplyMatrices(par.matrixWorld, E.mR); const mid = _t.setFromMatrixPosition(_m2).add(pl).multiplyScalar(0.5);
  _inv.copy(_m2).invert(); const d = _n.copy(target).applyMatrix4(_inv).sub(_v.copy(mid).applyMatrix4(_inv));
  const x = d.dot(E.right), y = d.dot(E.up), z = d.dot(E.fwd), dist = Math.hypot(x, y, z) * (_m2.getMaxScaleOnAxis() || 1);   // local units -> metres
  return { yaw: Math.atan2(x, z), pitch: Math.atan2(y, Math.hypot(x, z)), dist };
}

// ------------------------------------------------------------------------------------------------ idle (crowd, lift, viewers): cheap
/** blink variety + brow / lid coupling + an occasional eye dart, for any living human. Stateful on H._fa; t = that person's clock (s). */
export function idleFace(H, t, seed = 0) {
  let S = H._fa; if (!S || S.seed !== seed) { const r = prng(Math.imul((seed * 1000) | 0, 2654435761) ^ 0x51ed); S = H._fa = { seed, r, b: new Blinker(r), t, lid: -1, dartT: 1 + r() * 3, ey: 0, ep: 0, ty: 0, tp: 0 }; }
  let dt = t - S.t; S.t = t; if (!(dt >= 0 && dt < 0.5)) dt = 0;
  // an eye dart now and then (a fixation elsewhere, then back), which often brings a blink with it
  if ((S.dartT -= dt) <= 0) { const away = Math.abs(S.ty) < 0.02 && S.r() < 0.6; S.ty = away ? (S.r() - 0.5) * 0.36 : 0; S.tp = away ? (S.r() - 0.6) * 0.16 : 0; S.dartT = away ? 0.5 + S.r() * 1.2 : 1.5 + S.r() * 4; if (Math.abs(S.ty) > 0.1) S.b.kick(0.4); }
  const lid = S.b.step(dt);
  if (dt > 0 && (Math.abs(S.ty - S.ey) > 1e-3 || Math.abs(S.tp - S.ep) > 1e-3)) { const k = damp(EYE.saccadeK, dt); S.ey += (S.ty - S.ey) * k; S.ep += (S.tp - S.ep) * k; setEyes(H, S.ey, S.ep); }
  const down = Math.max(0, -S.ep), lc = clamp(lid + down * 1.1, 0, 1), q = Math.round(lc * 64);   // looking down lowers the upper lid with the eye
  if (q !== S.lid) { S.lid = q; H.face({ LeftUpperLidClosed: lc, RightUpperLidClosed: lc }); }
  return lid;
}

// ------------------------------------------------------------------------------------------------ conversation close-up
// Mood expressions in real morph names (talk.js MOOD_FACE used Smile / Frown, which these bodies do not have, so the moods showed nothing):
// warm = a soft smile that reaches the eyes (cheeks lift the lower lid: a little upper-lid close stands in), edge = worried inner brows,
// corners down, lids a touch wide. Slightly asymmetric on purpose (a perfectly mirrored face reads as a mask).
export const MOOD = {
  warm: { MouthLeftPullUp: 0.3, MouthRightPullUp: 0.25, LeftUpperLidClosed: 0.1, RightUpperLidClosed: 0.12, LeftInnerBrowUp: 0.08, RightInnerBrowUp: 0.06 },
  neutral: { MouthLeftPullUp: 0.07, MouthRightPullUp: 0.05 },
  edge: { LeftInnerBrowUp: 0.34, RightInnerBrowUp: 0.28, LeftBrowDown: 0.1, RightBrowDown: 0.12, MouthLeftPullDown: 0.2, MouthRightPullDown: 0.16, LeftUpperLidOpen: 0.04, RightUpperLidOpen: 0.04 },
};
// micro-expressions: a fraction of a second, mostly one-sided, then gone. by mood (weights)
const MICRO = {
  smirk_l: { f: { MouthLeftPullUp: 0.32 }, dur: [0.35, 0.6], w: { warm: 2, neutral: 1, edge: 0.3 } },
  smirk_r: { f: { MouthRightPullUp: 0.3 }, dur: [0.35, 0.6], w: { warm: 2, neutral: 1, edge: 0.3 } },
  brow_flash: { f: { LeftInnerBrowUp: 0.5, RightInnerBrowUp: 0.5, LeftUpperLidOpen: 0.1, RightUpperLidOpen: 0.1 }, dur: [0.25, 0.4], w: { warm: 1.5, neutral: 1, edge: 0.5 } },
  lip_press: { f: { MouthLeftPullDown: 0.22, MouthRightPullDown: 0.22, JawDrop: -0.05 }, dur: [0.3, 0.55], w: { warm: 0.3, neutral: 1, edge: 1.5 } },
  nose: { f: { NoseWrinkler: 0.32, UpperLipUp: 0.12 }, dur: [0.2, 0.35], w: { warm: 0, neutral: 0.3, edge: 1.2 } },
  doubt: { f: { LeftBrowDown: 0.32, RightInnerBrowUp: 0.3 }, dur: [0.4, 0.7], w: { warm: 0.2, neutral: 0.8, edge: 1 } },
  squint: { f: { LeftUpperLidClosed: 0.22, RightUpperLidClosed: 0.25, LeftBrowDown: 0.15, RightBrowDown: 0.15 }, dur: [0.4, 0.7], w: { warm: 0.6, neutral: 0.7, edge: 0.8 } },
};
export const FACE = {
  micro: [3.5, 8],         // seconds between micro-expressions
  lipK: 26, jawK: 30,      // mouth channel springs (1/s): coarticulation without chatter
  lead: 0.05,              // the mouth shape leads the sound by ~50 ms
  jawMax: 0.62,
  fix: [0.45, 1.5],        // fixation time on one of the listener's eyes / mouth (s)
  fixAmp: 0.035,           // rad between those fixation points (~3 cm at 0.9 m)
  nod: 0.045, tilt: 0.06,  // head beats on stressed syllables / questions (rad)
  headShare: 0.75,         // share of the vertical eye-contact angle the head turns itself
};
const CH = ['jaw', 'up', 'wide', 'round', 'close'];
export class FaceAnim {
  constructor(H, seed = 1) {
    this.H = H; this.r = prng(Math.imul(seed | 0, 2246822519) ^ 0x7f4a7c15); this.b = new Blinker(this.r);
    this.m = { jaw: 0, up: 0, wide: 0, round: 0, close: 0 }; this.tgt = { jaw: 0, up: 0, wide: 0, round: 0, close: 0 };
    this.microT = 1.5 + this.r() * 3; this.micro = null; this.microU = 0;
    this.fixT = 0; this.fix = [0, 0]; this.ey = 0; this.ep = 0; this.glanced = false; this.brow = 0; this.qb = 0; this.nodV = 0; this.nod = 0; this.tilt = 0; this.hp = 0; this.beatSyl = -1;
    this.f = {}; this.lastF = {};
  }
  /** this frame's face. c: { dt, speech: {t, syl, dur, text}|null, mood, gest (fidget face layer), talking, glance (s left), stress 0..1, tired 0..1 } -> morph weights (also applied) */
  talk(dt, c) {
    const H = this.H, f = this.f; for (const k of MORPHS) f[k] = 0;
    const sp = c.speech, talking = !!c.talking;
    // ---- mouth: visemes (with a little lead), sprung per channel
    if (sp?.syl) { if (!sp.vis) { visemePlan(sp.text, sp.syl); sp.vis = true; } visemeAt(sp.syl, sp.t + FACE.lead, this.tgt); }
    else if (sp && sp.t < sp.dur) { const t = sp.t, j = c.flap ? c.flap(t) : 0.5 + 0.5 * Math.sin(t * 15); this.tgt.jaw = j * 0.5; this.tgt.wide = 0.15 * (0.5 + 0.5 * Math.sin(t * 5.3)); this.tgt.round = 0.15 * (0.5 + 0.5 * Math.sin(t * 3.7 + 1)); this.tgt.up = 0.08; this.tgt.close = 0; }
    else for (const k of CH) this.tgt[k] = 0;
    for (const k of CH) this.m[k] += (this.tgt[k] - this.m[k]) * damp(k === 'jaw' ? FACE.jawK : FACE.lipK, dt);
    const M = this.m, rest = talking ? 0 : 0.015;   // lips just parted at rest
    f.JawDrop = clamp(M.jaw, 0, FACE.jawMax) + rest; f.UpperLipUp = M.up; f.MouthLeftPullUp = M.wide; f.MouthRightPullUp = M.wide * 0.94; f.MouthLeftPullDown = M.round * 0.8 + M.close * 0.08; f.MouthRightPullDown = M.round * 0.8 + M.close * 0.08;
    // ---- mood (sustained) + the gesture layer (js/movement.js, Smile / Frown expanded); mouth shapes win over the smile while speaking
    const mood = MOOD[c.mood] || MOOD.neutral, sm = 1 - 0.55 * clamp(M.jaw * 2 + M.round * 1.5, 0, 1);
    for (const k in mood) f[k] += mood[k] * (/Mouth/.test(k) ? sm : 1);
    if (c.gest) { const g = expandAliases({ ...c.gest }); for (const k in g) f[k] = Math.max(f[k], g[k]); }
    // ---- speech brows: a question lifts them over its last word; stressed syllables now and then get a quick flick; '!' lands a nod
    let qWant = 0, flick = 0;
    if (sp !== this.sp) { this.sp = sp; this.beatSyl = -1; }
    if (sp?.syl && sp.t < sp.dur) {
      let cur = -1; for (let i = 0; i < sp.syl.length; i++) { const s = sp.syl[i]; if (sp.t + 0.08 >= s.at && sp.t < s.at + s.dur + 0.15) { cur = i; break; } }
      const s = sp.syl[cur]; if (s) { if (s.q) qWant = 1; if (s.stress && cur !== this.beatSyl) { this.beatSyl = cur; const h = hash(cur, sp.syl.length * 31 + (sp.text?.length || 0)); if (h < 0.35 || s.bang) this.nodV += FACE.nod * (s.bang ? 1.6 : 0.6 + h); if (h > 0.7) this.brow = 1; } }
    }
    this.qb += (qWant - this.qb) * damp(6, dt); this.brow = Math.max(0, this.brow - dt * 4); flick = Math.sin(Math.PI * clamp(this.brow, 0, 1));
    f.LeftInnerBrowUp += this.qb * 0.45 + flick * 0.28; f.RightInnerBrowUp += this.qb * 0.4 + flick * 0.28;
    // head beats: a kick that decays (follow, then settle), from stressed syllables; questions tilt the head a little
    this.nod += (this.nodV - this.nod) * damp(16, dt); this.nodV *= Math.exp(-9 * dt); this.tilt += (this.qb * FACE.tilt - this.tilt) * damp(4, dt);
    // ---- micro-expressions (not over a big gesture)
    if ((this.microT -= dt) <= 0) { this.microT = FACE.micro[0] + this.r() * (FACE.micro[1] - FACE.micro[0]); const ks = Object.keys(MICRO), w = ks.map(k => MICRO[k].w[c.mood] ?? 1); let x = this.r() * w.reduce((a, b) => a + b, 0), i = 0; while (i < ks.length - 1 && (x -= w[i]) > 0) i++; const m = MICRO[ks[i]]; this.micro = { f: m.f, dur: m.dur[0] + this.r() * (m.dur[1] - m.dur[0]), u: 0, k: ks[i] }; }
    if (this.micro) { const m = this.micro; m.u += dt / m.dur; if (m.u >= 1) this.micro = null; else { const a = Math.sin(Math.PI * m.u) ** 0.6; for (const k in m.f) f[k] += m.f[k] * a; } }
    // ---- blink (more often while speaking or stressed, slower when tired) + lid / brow coupling
    const lid = this.b.step(dt, (talking ? 1.35 : 0.85) * (1 + (c.stress || 0) * 0.6), 1 + (c.tired || 0) * 0.8);
    const browUp = Math.max(f.LeftInnerBrowUp, f.RightInnerBrowUp), down = Math.max(0, -this.ep), upE = Math.max(0, this.ep);
    for (const s of ['Left', 'Right']) {
      const cl = f[s + 'UpperLidClosed'] + down * 1.1, op = f[s + 'UpperLidOpen'] + upE * 0.8 + f[s + 'InnerBrowUp'] * 0.15;   // the lid rides with the eye; raised brows open the eye
      f[s + 'UpperLidClosed'] = clamp(cl + (1 - cl) * lid, 0, 1); f[s + 'UpperLidOpen'] = clamp(op * (1 - lid), 0, 1);
      f[s + 'BrowDown'] += lid * 0.07;   // orbicularis pulls the brow down a hair in a blink
    }
    for (const k of MORPHS) f[k] = clamp(f[k], 0, 1);
    H.face(f); return f;
  }
  /** after H.update(dt): head beats on top of the animation, then the eyes (eye contact with scanning fixations; they lead a glance away). target = world point (camera). */
  after(dt, c) {
    const H = this.H, hb = H.bones?.Head; if (hb && (Math.abs(this.nod) > 1e-4 || Math.abs(this.tilt) > 1e-4)) { hb.rotateX(this.nod); hb.rotateZ(this.tilt); }
    if (!c.target || !eyesOf(H)) return;
    hb?.updateWorldMatrix(true, true);
    let a = eyeAngles(H, c.target); if (!a) return;
    // the head takes most of the vertical part (talk.js lookPitch aims the Head bone's origin, not the idle clip's own nodding tilt, so the eyes were
    // left to roll up under the lids to meet the camera); the eyes do the rest
    if (hb) { this.hp += (clamp(a.pitch * FACE.headShare, -0.3, 0.3) - this.hp) * damp(4, dt); if (Math.abs(this.hp) > 1e-4) { hb.rotateX(-this.hp); hb.updateWorldMatrix(false, true); a = eyeAngles(H, c.target); } }
    if ((this.fixT -= dt) <= 0) {   // eye contact is not a stare: fixations hop between the listener's eyes, now and then the mouth
      this.fixT = FACE.fix[0] + this.r() * (FACE.fix[1] - FACE.fix[0]); const r = this.r(), A = FACE.fixAmp;
      const nx = r < 0.42 ? -A / 2 : r < 0.84 ? A / 2 : 0, ny = r < 0.84 ? 0 : -A * 1.2; if (Math.abs(nx - this.fix[0]) + Math.abs(ny - this.fix[1]) > A * 1.5) this.b.kick(0.12); this.fix = [nx, ny];
    }
    let ty = a.yaw + this.fix[0], tp = a.pitch + this.fix[1];
    if (c.glance > 0) { ty += c.talking ? 0.16 : 0.3; tp += c.talking ? -0.12 : 0.08; if (!this.glanced) { this.glanced = true; this.b.kick(0.6); } } else this.glanced = false;   // thinking: the eyes go first, the head (talk.js) follows
    const k = damp(EYE.saccadeK, dt); this.ey += (ty - this.ey) * k; this.ep += (tp - this.ep) * k;
    setEyes(H, this.ey, this.ep, clamp(0.032 / Math.max(0.3, a.dist), 0, 0.06));   // a little convergence on a near face
  }
  /** neutral: zero every morph this layer drives and centre the eyes (end of a conversation) */
  reset() { const z = {}; for (const k of MORPHS) z[k] = 0; this.H.face(z); setEyes(this.H, 0, 0, 0); this.ey = this.ep = 0; this.nod = this.nodV = this.tilt = this.hp = 0; }
}
