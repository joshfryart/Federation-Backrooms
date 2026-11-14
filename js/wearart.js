// wearart.js — batch 9: worn outfits and headgear, donning gestures, a lying pose, and the stowed (item) forms. See docs/wearart.md.
//   W-1 pressure suit worn (chest band, arm bands, bubble helmet on the existing `suit` body)   W-2 engineering coverall   W-3 medical scrubs + nitrile gloves
//   W-4 galley whites (jacket, trousers, bib apron, skull cap)   W-7 breather (half-face mask / clear hood)   W-8 headset (single ear cup + boom)
//   K-1 lying pose (supine / side, breathing)   K-4 donning gestures (suit 3 s, hood 1.5 s) in the js/movement.js GESTURES format
//   Items: DEFS_WEAR / KW_WEAR in the js/itemart.js row format (folded coverall, scrubs, apron, gloves, suit bag, half mask, headset, skull cap).
// How an outfit is made. The crew meshes keep only the visible skin, so the casual clothes (`garment_*`) are the only torso / leg surface. wearOutfit() hides them and
// builds ONE new SkinnedMesh on the human's own skeleton (shared bones, no extra animation cost): the garment triangles pushed out along their normals, with vertex colours
// for cuffs / knee pads / hems, plus the missing forearm from the body mesh (short-sleeved bodies), plus rigid trim pieces (pockets, bands, collars, buttons) skinned to one bone.
// Everything is measured in the metre space of the human's group at the rest pose, so it fits crew_m / crew_f / crew_f2 / crew_heavy (and the suit) and survives any later
// movement of the group. Pure three.js + js/movement.js (pure logic); no game imports.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toBones, sample as sampleGesture } from './movement.js';

const PI = Math.PI;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- catalogue
export const OUTFITS = {
  suit:    { id: 'W-1', name: 'pressure suit (division chest and arm bands, bubble helmet)', body: 'suit', note: 'use makeHuman({ kind: "suit", kit: false }); wearOutfit adds the bands' },
  coverall:{ id: 'W-2', name: 'engineering coverall', color: 0x3b4d6b, note: 'stand collar, two chest pockets, knee pads, reflective calf bands, long sleeves' },
  scrubs:  { id: 'W-3', name: 'medical scrubs (V-neck, short sleeve) + gloves', color: 0x58bdb4, note: 'gloves: opts.gloves !== false' },
  whites:  { id: 'W-4', name: 'galley whites (double-breasted jacket, trousers)', color: 0xeeeeea, note: 'apron: opts.apron !== false; skull cap: opts.cap !== false' },
};
export const HEADGEAR = {
  mask:    { id: 'W-7', name: 'breather, half-face mask with two filters and a strap' },
  hood:    { id: 'W-7', name: 'breather, clear escape hood with neck seal' },
  headset: { id: 'W-8', name: 'headset, single ear cup, boom to the left' },
  cap:     { id: 'W-4', name: 'galley skull cap' },
  helmet:  { id: 'W-1', name: 'suit bubble helmet (donned in the K-4 sequence)' },
};

// ---------------------------------------------------------------- analysis of a human in its rest pose
const GN = ['torso', 'neck', 'head', 'uarm', 'larm', 'hand', 'thigh', 'calf', 'foot', 'other'];
const grpOf = (n) => /^(pelvis|spine_0\d|clavicle_[lr]|root)$/.test(n) ? 0 : /^neck/.test(n) ? 1 : n === 'Head' ? 2 : /^upperarm/.test(n) ? 3 : /^lowerarm/.test(n) ? 4 : /^(hand|thumb|index|middle|ring|pinky)/.test(n) ? 5 : /^thigh/.test(n) ? 6 : /^calf/.test(n) ? 7 : /^(foot|ball)/.test(n) ? 8 : 9;
const bodyOf = (inner) => { let b = null; inner.traverse(o => { if (o.isSkinnedMesh && o.material.name === 'body') b = o; }); return b; };

/** Run fn(A) with the skeleton in its rest pose and the pose restored afterwards. A holds the human's measurements in the metre space of the human group. */
function analyse(human) {
  if (human.userData.__wearA) return human.userData.__wearA;
  const H = human.userData.human, inner = H.inner, body = bodyOf(inner); if (!body) return null;
  const bones = body.skeleton.bones, saved = bones.map(b => [b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
  human.updateMatrixWorld(true); const gInv = new THREE.Matrix4().copy(human.matrixWorld).invert();
  body.skeleton.pose(); inner.updateMatrixWorld(true);
  const A = { human, inner, body, bones, idx: new Map(bones.map((b, i) => [b.name, i])), binv: bones.map(b => new THREE.Matrix4().copy(b.matrixWorld).invert().multiply(human.matrixWorld)), src: {}, bp: {} };
  for (const b of bones) A.bp[b.name] = V3().setFromMatrixPosition(b.matrixWorld).applyMatrix4(gInv);
  const v = V3(), nm = (o) => o.material.name || '';
  const extract = (mesh) => {
    mesh.skeleton.update(); const geo = mesh.geometry, n = geo.attributes.position.count, P = new Float32Array(n * 3), SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4), G = new Uint8Array(n), SD = new Int8Array(n);
    const sb = mesh.skeleton.bones, remap = sb.map(b => A.idx.get(b.name) ?? 0), si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
    for (let i = 0; i < n; i++) {
      mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld).applyMatrix4(gInv); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
      const gw = new Float32Array(10); let sx = 0;
      for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k), bi = sb[si.getComponent(i, k)]; SI[i * 4 + k] = remap[si.getComponent(i, k)]; SW[i * 4 + k] = w; if (w > 0 && bi) { gw[grpOf(bi.name)] += w; sx += w * (/_l$/.test(bi.name) ? 1 : /_r$/.test(bi.name) ? -1 : 0); } }
      let bg = 9, bw = 0; for (let k = 0; k < 10; k++) if (gw[k] > bw) { bw = gw[k]; bg = k; } G[i] = bg; SD[i] = sx > 0.2 ? 1 : sx < -0.2 ? -1 : 0;
    }
    return { P, SI, SW, G, SD, n, index: geo.index ? geo.index.array : Uint32Array.from({ length: n }, (_, i) => i), mesh };
  };
  inner.traverse(o => {
    if (!o.isSkinnedMesh) return; const m = nm(o);
    if (m === 'body') A.src.body = extract(o); else if (m === 'hair') A.src.hair = extract(o);
    else if (m.startsWith('garment') && !m.includes('shoes')) { A.src.garment = extract(o); A.garmentMesh = o; }
  });
  bones.forEach((b, i) => { b.position.copy(saved[i][0]); b.quaternion.copy(saved[i][1]); b.scale.copy(saved[i][2]); }); inner.updateMatrixWorld(true);
  // measurements (metres, group space, rest pose)
  const B = A.bp, hd = A.src.body, top = (S, g) => { let y = -9, x = 0, zf = -9, zb = 9, yb = 9; for (let i = 0; i < S.n; i++) if (S.G[i] === g) { const yy = S.P[i * 3 + 1]; y = Math.max(y, yy); yb = Math.min(yb, yy); x = Math.max(x, Math.abs(S.P[i * 3])); zf = Math.max(zf, S.P[i * 3 + 2]); zb = Math.min(zb, S.P[i * 3 + 2]); } return { top: y, bot: yb, hw: x, zf, zb }; };
  A.head = top(hd, 2); A.neck = top(hd, 1); if (A.src.hair) { const hr = top(A.src.hair, 2); A.hair = hr; }
  A.height = Math.max(A.head.top, A.src.hair ? A.hair.top : 0) - Math.min(B.foot_l?.y ?? 0, B.foot_r?.y ?? 0); A.u = A.height / 1.78;   // body-size factor for dimensions authored at 1.75 m
  human.userData.__wearA = A; return A;
}

// ---------------------------------------------------------------- geometry builders (everything in group space; all geometry indexed, attributes position / normal / color / skinIndex / skinWeight)
const col3 = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
function finish(g, bone, hex, A) {   // rigid piece: strip uv, add colour, skin 100% to one bone
  g.deleteAttribute('uv'); if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]); const n = g.attributes.position.count, c = col3(hex), bi = A.idx.get(bone) ?? 0;
  g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => c).flat(), 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Array.from({ length: n }, () => [bi, 0, 0, 0]).flat(), 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [1, 0, 0, 0]).flat(), 4)); return g;
}
const xf = (g, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => { g.applyMatrix4(new THREE.Matrix4().compose(V3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), V3(...s))); return g; };
class Build {
  constructor(A) { this.A = A; this.cloth = []; this.trim = []; this.glass = []; }
  rigid(g, bone, hex, kind = 'trim') { this[kind].push(finish(g, bone, hex, this.A)); return this; }
  box(w, h, d, p, bone, hex, kind, r) { return this.rigid(xf(new THREE.BoxGeometry(w, h, d), p, r), bone, hex, kind); }
  cyl(rt, rb, h, p, bone, hex, kind, r, seg = 10) { return this.rigid(xf(new THREE.CylinderGeometry(rt, rb, h, seg), p, r), bone, hex, kind); }
  sph(r, p, s, bone, hex, kind, ws = 8, hs = 6) { return this.rigid(xf(new THREE.SphereGeometry(r, ws, hs), p, [0, 0, 0], s), bone, hex, kind); }
  tor(R, t, p, r, s, bone, hex, kind, arc = PI * 2, ts = 14) { return this.rigid(xf(new THREE.TorusGeometry(R, t, 4, ts, arc), p, r, s), bone, hex, kind); }
  strut(a, b, t, bone, hex, kind = 'cloth') { const d = V3().subVectors(b, a), len = d.length(), q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize()); const g = new THREE.BoxGeometry(t, len, t * 0.5); g.applyMatrix4(new THREE.Matrix4().compose(V3().addVectors(a, b).multiplyScalar(0.5), q, V3(1, 1, 1))); return this.rigid(g, bone, hex, kind); }
  /** closed band around a limb or the torso: radii measured from source vertices in a slab. axis 'y' (torso, legs) or 'x' (arms). */
  ring(S, { axis = 'y', lo, hi, pred = () => true, off = 0.006, N = 18, bone, hex, kind = 'trim' }) {
    if (lo > hi) [lo, hi] = [hi, lo]; const A = this.A, P = S.P, ia = axis === 'y' ? 1 : 0, ib = axis === 'y' ? 0 : 1, ic = 2, pts = [];
    for (let i = 0; i < S.n; i++) { const a = P[i * 3 + ia]; if (a >= lo && a <= hi && pred(i)) pts.push([P[i * 3 + ib], P[i * 3 + ic]]); }
    if (pts.length < 6) return this; let cb = 0, cc = 0; for (const p of pts) { cb += p[0]; cc += p[1]; } cb /= pts.length; cc /= pts.length;
    const R = new Array(N).fill(0); for (const p of pts) { const a = Math.atan2(p[1] - cc, p[0] - cb), k = ((Math.round(a / (2 * PI) * N) % N) + N) % N; R[k] = Math.max(R[k], Math.hypot(p[0] - cb, p[1] - cc)); }
    const avg = R.reduce((s, r) => s + r, 0) / Math.max(1, R.filter(r => r > 0).length); for (let k = 0; k < N; k++) if (!R[k]) R[k] = avg;
    const Rs = R.map((r, k) => Math.max(r, (R[(k + N - 1) % N] + r * 2 + R[(k + 1) % N]) / 4) + off), pos = [], idx = [];
    for (const a of [lo, hi]) for (let k = 0; k < N; k++) { const an = k / N * 2 * PI, b = cb + Math.cos(an) * Rs[k], c = cc + Math.sin(an) * Rs[k]; if (axis === 'y') pos.push(b, a, c); else pos.push(a, b, c); }
    for (let k = 0; k < N; k++) { const k2 = (k + 1) % N; idx.push(k, k2, N + k2, k, N + k2, N + k); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(N * 4), 2));
    return this.rigid(g, bone, hex, kind);
  }
  /** garment shell: triangles whose three vertices pass keep(i), pushed out along welded normals by infl(i); colour(i, edge) -> hex. Source may be the garment or the body. */
  shell(S, { keep, infl = 0.004, colour, kind = 'cloth' }) {
    const A = this.A, n = S.n, P = S.P, I = S.index, key = (i) => `${Math.round(P[i * 3] * 4000)}|${Math.round(P[i * 3 + 1] * 4000)}|${Math.round(P[i * 3 + 2] * 4000)}`;
    if (!S.nrm) {   // area-weighted normals welded by position (UV seams duplicate vertices; they must move together)
      const acc = new Map(), kk = new Array(n), a = V3(), b = V3(), c = V3(), f = V3();
      for (let i = 0; i < n; i++) kk[i] = key(i);
      for (let t = 0; t < I.length; t += 3) { a.fromArray(P, I[t] * 3); b.fromArray(P, I[t + 1] * 3); c.fromArray(P, I[t + 2] * 3); f.subVectors(b, a).cross(c.sub(a)); for (let k = 0; k < 3; k++) { const e = acc.get(kk[I[t + k]]) || acc.set(kk[I[t + k]], V3()).get(kk[I[t + k]]); e.add(f); } }
      S.nrm = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const e = acc.get(kk[i]).clone().normalize(); S.nrm[i * 3] = e.x; S.nrm[i * 3 + 1] = e.y; S.nrm[i * 3 + 2] = e.z; }
    }
    const ok = new Uint8Array(n); for (let i = 0; i < n; i++) ok[i] = keep(i) ? 1 : 0;
    const used = new Int32Array(n).fill(-1), edge = new Uint8Array(n), tris = []; let m = 0;
    for (let t = 0; t < I.length; t += 3) { const a = I[t], b = I[t + 1], c = I[t + 2], s = ok[a] + ok[b] + ok[c]; if (s === 3) tris.push(a, b, c); else if (s > 0) for (const q of [a, b, c]) if (ok[q]) edge[q] = 1; }
    if (!tris.length) return this;
    const remap = []; for (const q of tris) if (used[q] < 0) { used[q] = m++; remap.push(q); }
    const pos = new Float32Array(m * 3), nor = new Float32Array(m * 3), cc = new Float32Array(m * 3), si = new Uint16Array(m * 4), sw = new Float32Array(m * 4);
    remap.forEach((q, j) => { const d = typeof infl === 'function' ? infl(q) : infl; for (let k = 0; k < 3; k++) { pos[j * 3 + k] = P[q * 3 + k] + S.nrm[q * 3 + k] * d; nor[j * 3 + k] = S.nrm[q * 3 + k]; } const c = col3(colour(q, !!edge[q])); cc.set(c, j * 3); si.set(S.SI.subarray(q * 4, q * 4 + 4), j * 4); sw.set(S.SW.subarray(q * 4, q * 4 + 4), j * 4); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4)); g.setIndex(tris.map(q => used[q])); this[kind].push(g); return this;
  }
  finish() {
    const A = this.A, out = [], mk = (list, mat) => { if (!list.length) return; const g = mergeGeometries(list, false); const m = new THREE.SkinnedMesh(g, mat); m.name = 'wear'; m.frustumCulled = false; m.castShadow = true; m.bind(new THREE.Skeleton(A.bones, A.binv), new THREE.Matrix4()); out.push(m); };
    mk(this.cloth, MAT.cloth()); mk(this.trim, MAT.trim()); mk(this.glass, MAT.glass()); return out;
  }
}
const _mat = {};
const MAT = {
  cloth: () => _mat.cloth || (_mat.cloth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.02, side: THREE.DoubleSide })),
  trim: () => _mat.trim || (_mat.trim = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.35, side: THREE.DoubleSide })),
  glass: () => _mat.glass || (_mat.glass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide })),
};
const countTris = (o) => { let n = 0; o.traverse(m => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return Math.round(n); };
function mix(a, b, t) { return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex(); }
const dark = (c, t = 0.35) => mix(c, 0x0a0a0c, t), light = (c, t = 0.3) => mix(c, 0xffffff, t);

// front surface of the garment / body at (x, y): the largest z among source vertices near that point (used for pockets, buttons, aprons)
function frontZ(A, x, y, r = 0.03, srcs = ['garment', 'body']) {
  let z = -9; for (const k of srcs) { const S = A.src[k]; if (!S) continue; const p = S.P; for (let i = 0; i < S.n; i++) { const g = S.G[i]; if ((g <= 1 || g === 6) && Math.abs(p[i * 3 + 1] - y) < r && Math.abs(p[i * 3] - x) < r) z = Math.max(z, p[i * 3 + 2]); } }
  return z;
}

function headFront(A, y, r = 0.02) { const S = A.src.body; let z = -9; for (let i = 0; i < S.n; i++) if (S.G[i] === 2 && Math.abs(S.P[i * 3 + 1] - y) < r && Math.abs(S.P[i * 3]) < 0.025) z = Math.max(z, S.P[i * 3 + 2]); return z; }

// ---------------------------------------------------------------- outfits
/** shared garment-shell recipe: keep(i, S) filters, hem / cuff vertices (edge) take the trim colour */
function garmentShell(B, A, o) {
  const G = A.src.garment, Bd = A.src.body, bp = A.bp, u = A.u, wrist = bp.hand_l.x - 0.02 * u, sh = bp.upperarm_l.x, el = bp.lowerarm_l.x, armEnd = o.armEnd ?? wrist;
  const sleeveEnd = { 1: 0, [-1]: 0 }; for (let i = 0; i < G.n; i++) if (G.G[i] === 3 || G.G[i] === 4) sleeveEnd[G.SD[i]] = Math.max(sleeveEnd[G.SD[i]] || 0, Math.abs(G.P[i * 3]));
  const gKeep = (i) => { const g = G.G[i]; if (g === 5 || g === 8 || g === 9) return false; if (g === 3 || g === 4) return Math.abs(G.P[i * 3]) <= armEnd; return o.keep ? o.keep(i, G, g) : true; };
  B.shell(G, { keep: gKeep, infl: o.infl ?? 0.005 * u, colour: (i, e) => o.colour(i, e, G) });
  // forearm missing from short-sleeved bodies: continue the sleeve with the body's own arm vertices beyond the garment's sleeve end
  for (const sd of [1, -1]) { const end = Math.abs(sleeveEnd[sd]) || 0; if (!o.extend || end >= armEnd - 0.03) continue;
    B.shell(Bd, { keep: (i) => (Bd.G[i] === 3 || Bd.G[i] === 4) && Bd.SD[i] === sd && Math.abs(Bd.P[i * 3]) > end - 0.07 * u && Math.abs(Bd.P[i * 3]) <= armEnd, infl: (o.infl ?? 0.005 * u) + 0.002 * u, colour: (i, e) => o.colour(i, e, Bd, true) }); }
  // crop tops (crew_f2's sportsuit) leave the midriff bare: fill it from the body's own torso surface
  { let minY = 9; for (let i = 0; i < Bd.n; i++) if (Bd.G[i] === 0) minY = Math.min(minY, Bd.P[i * 3 + 1]);
    if (minY < bp.neck_01.y - 0.4 * u) B.shell(Bd, { keep: (i) => Bd.G[i] === 0 && Bd.P[i * 3 + 1] < bp.neck_01.y - 0.1 * u, infl: (o.infl ?? 0.005 * u) + 0.0015 * u, colour: (i, e) => o.colour(i, false, Bd, true) }); }
  return { wrist, sh, el, sleeveEnd };
}
const collar = (B, A, hex, h = 0.03, bone = 'neck_01') => { const nk = A.neck, y0 = A.bp.neck_01.y - 0.012 * A.u; B.ring(A.src.body, { axis: 'y', lo: y0, hi: y0 + h * A.u, pred: (i) => A.src.body.G[i] === 1, off: 0.007 * A.u, bone, hex, kind: 'cloth' }); };

const BUILD = {
  coverall(B, A, o) {
    const c = o.color ?? OUTFITS.coverall.color, u = A.u, bp = A.bp, kneeY = bp.calf_l.y, ankY = bp.foot_l.y, hv = 0xd9d6a0;
    const knee = (i, G) => { const y = G.P[i * 3 + 1], z = G.P[i * 3 + 2]; return Math.abs(y - kneeY) < 0.075 * u && (G.G[i] === 6 || G.G[i] === 7) && z > bp.calf_l.z - 0.005; };
    const shape = garmentShell(B, A, { extend: true, colour: (i, e, G, ext) => e ? dark(c, 0.3) : (G.G[i] >= 6 && knee(i, G)) ? dark(c, 0.4) : c });
    // reflective calf bands (silver-yellow, metallic) and cuffs
    for (const sd of [1, -1]) B.ring(A.src.garment, { axis: 'y', lo: ankY + 0.15 * u, hi: ankY + 0.205 * u, pred: (i) => A.src.garment.G[i] === 7 && A.src.garment.SD[i] === sd, off: 0.0045 * u, bone: sd > 0 ? 'calf_l' : 'calf_r', hex: hv });
    for (const sd of [1, -1]) B.ring(A.src.garment, { axis: 'x', lo: sd * (shape.wrist - 0.05 * u), hi: sd * (shape.wrist - 0.075 * u), pred: (i) => A.src.garment.SD[i] === sd && A.src.garment.G[i] === 4, off: 0.003 * u, bone: sd > 0 ? 'lowerarm_l' : 'lowerarm_r', hex: dark(c, 0.5), kind: 'cloth' });
    collar(B, A, dark(c, 0.15), 0.034);
    const yc = A.bp.neck_01.y - 0.2 * u, zf = frontZ(A, 0, yc, 0.05);
    for (const sx of [-1, 1]) { const x = sx * 0.085 * u, z = frontZ(A, x, yc, 0.04) + 0.011 * u; B.box(0.095 * u, 0.105 * u, 0.012 * u, [x, yc - 0.01 * u, z], 'spine_03', dark(c, 0.12), 'cloth'); B.box(0.1 * u, 0.012 * u, 0.016 * u, [x, yc + 0.045 * u, z + 0.002], 'spine_03', dark(c, 0.3), 'cloth'); B.box(0.02 * u, 0.02 * u, 0.006 * u, [x, yc, z + 0.008 * u], 'spine_03', 0xc9a24a); }
    for (let k = 0; k < 5; k++) { const y = bp.neck_01.y - (0.075 + k * 0.095) * u; B.box(0.012 * u, 0.1 * u, 0.007 * u, [0, y, frontZ(A, 0, y, 0.04) + 0.007 * u], 'spine_03', 0x8a8e96); }   // front zip
    B.box(0.03 * u, 0.04 * u, 0.012 * u, [0.0, bp.neck_01.y - 0.07 * u, frontZ(A, 0, bp.neck_01.y - 0.07 * u, 0.04) + 0.011 * u], 'spine_03', 0xb4bac2);
  },
  scrubs(B, A, o) {
    const c = o.color ?? OUTFITS.scrubs.color, u = A.u, bp = A.bp, nY = bp.neck_01.y, sh = bp.upperarm_l.x, el = bp.lowerarm_l.x; let bareArms = 0; for (let i = 0; i < A.src.body.n; i++) if (A.src.body.G[i] === 3) bareArms++;
    const armEnd = bareArms > 150 ? sh + 0.52 * (el - sh) : undefined;   // bodies whose arms are not in the skin mesh (crew_m) keep the garment's long sleeve
    const vcut = (i, G) => { const x = Math.abs(G.P[i * 3]), y = G.P[i * 3 + 1], z = G.P[i * 3 + 2]; return z > bp.neck_01.z + 0.01 && G.G[i] === 0 && y > nY - 0.135 * u + x * 1.5; };   // V-neck notch
    garmentShell(B, A, { armEnd, keep: (i, G) => !vcut(i, G), colour: (i, e, G) => c, infl: 0.0055 * u });
    const yc = nY - 0.2 * u; { const x = 0.085 * u, z = frontZ(A, x, yc, 0.04) + 0.01 * u; B.box(0.08 * u, 0.09 * u, 0.01 * u, [x, yc - 0.02 * u, z], 'spine_03', light(c, 0.1), 'cloth'); }
    const hy = bp.pelvis.y - 0.05 * u; for (const sx of [-1, 1]) B.box(0.1 * u, 0.1 * u, 0.012 * u, [sx * 0.11 * u, hy, frontZ(A, sx * 0.11 * u, hy, 0.04, ['garment']) + 0.008 * u], 'pelvis', dark(c, 0.1), 'cloth');
    if (o.gloves !== false) BUILD.gloves(B, A, { color: 0x4a86d4 });
  },
  gloves(B, A, o) {   // fingers as skinned capsules on each finger bone, a palm slab and a cuff up the wrist
    const u = A.u, c = o.color ?? 0x4a86d4, bp = A.bp;
    for (const sd of ['l', 'r']) {
      const h = bp['hand_' + sd], mid = bp['middle_01_' + sd], s = sd === 'l' ? 1 : -1, hb = 'hand_' + sd;
      B.cyl(0.036 * u, 0.034 * u, 0.07 * u, [h.x - s * 0.018 * u, h.y, h.z], hb, c, 'cloth', [0, 0, PI / 2], 12);   // cuff
      B.rigid(xf(new THREE.BoxGeometry(0.075 * u, 0.026 * u, 0.088 * u), [(h.x + mid.x) / 2 + s * 0.004 * u, h.y, h.z], [0, 0, 0]), hb, c, 'cloth');
      for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb']) for (let k = 1; k <= 3; k++) {
        const a = bp[`${f}_0${k}_${sd}`], b = bp[`${f}_0${k + 1}_${sd}`] || bp[`${f}_0${k + 1}_leaf_${sd}`] || bp[`${f}_04_leaf_${sd}`]; if (!a || !b) continue; if (f === 'thumb' && k === 3) continue;
        const rr = (f === 'thumb' ? 0.0115 : f === 'pinky' ? 0.0095 : 0.0108) * u, len = a.distanceTo(b), q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), V3().subVectors(b, a).normalize());
        const g = new THREE.CylinderGeometry(rr * 0.92, rr, len, 6); g.applyMatrix4(new THREE.Matrix4().compose(V3().addVectors(a, b).multiplyScalar(0.5), q, V3(1, 1, 1))); B.rigid(g, `${f}_0${k}_${sd}`, c, 'cloth');
      }
    }
  },
  whites(B, A, o) {
    const c = o.color ?? OUTFITS.whites.color, u = A.u, bp = A.bp, hemY = bp.pelvis.y - 0.035 * u, pant = 0x3a3d44, el = bp.lowerarm_l.x, sh = bp.upperarm_l.x;
    garmentShell(B, A, { extend: true, armEnd: sh + 0.78 * (bp.hand_l.x - sh), infl: 0.0075 * u, colour: (i, e, G) => (G.G[i] >= 6 || G.P[i * 3 + 1] < hemY) ? (e ? dark(pant, 0.3) : pant) : e ? 0xd6d6d0 : c });
    B.ring(A.src.garment, { axis: 'y', lo: hemY - 0.01 * u, hi: hemY + 0.025 * u, pred: (i) => A.src.garment.G[i] === 0, off: 0.0105 * u, bone: 'pelvis', hex: c, kind: 'cloth' });   // jacket hem
    collar(B, A, c, 0.034);
    const bY = bp.neck_01.y - 0.1 * u;   // double-breasted: two columns of three buttons and a diagonal overlap line
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { const y = bY - k * 0.105 * u, x = sx * 0.05 * u; B.cyl(0.011 * u, 0.011 * u, 0.006 * u, [x, y, frontZ(A, x, y, 0.04) + 0.012 * u], 'spine_03', 0xcfd2d6, 'trim', [PI / 2, 0, 0], 8); }
    B.box(0.006 * u, 0.3 * u, 0.004 * u, [-0.012 * u, bY - 0.105 * u, frontZ(A, 0, bY - 0.1 * u, 0.04) + 0.01 * u], 'spine_03', 0xcfcfc8, 'cloth');
    if (o.apron !== false) BUILD.apron(B, A, { color: 0xf0efe6 });
    if (o.cap !== false) head.cap(B, A, { color: c });
  },
  apron(B, A, o) {   // bib apron: neck loop and ties, flat rows from chest to the knee, a pocket row, waist ties with a bow at the back
    const u = A.u, bp = A.bp, c = o.color ?? 0xf0efe6, y0 = bp.neck_01.y - 0.115 * u, y1 = bp.calf_l.y + 0.04 * u, rows = 12, cols = 7, pos = [], idx = [], spine = A.idx.get('spine_02'), pel = A.idx.get('pelvis'), tl = A.idx.get('thigh_l'), tr = A.idx.get('thigh_r');
    const zs = []; for (let r = 0; r <= rows; r++) { const y = y0 + (y1 - y0) * r / rows; let z = -9; for (const k of ['garment', 'body']) { const S = A.src[k]; for (let i = 0; i < S.n; i++) if ((S.G[i] === 0 || S.G[i] === 6) && Math.abs(S.P[i * 3 + 1] - y) < 0.03 && Math.abs(S.P[i * 3]) < 0.2 * u) z = Math.max(z, S.P[i * 3 + 2]); } zs.push(z + 0.034 * u); }
    for (let r = 1; r <= rows; r++) zs[r] = Math.max(zs[r], zs[r - 1] - 0.02 * u);
    const si = [], sw = [], colr = [];
    for (let r = 0; r <= rows; r++) { const t = r / rows, hw = (0.115 + 0.095 * Math.min(1, t * 2.4)) * u, y = y0 + (y1 - y0) * t; for (let k = 0; k < cols; k++) { const f = k / (cols - 1) * 2 - 1, x = f * hw; pos.push(x, y, zs[r] - 0.04 * u * f * f); const low = t > 0.6, w = low ? Math.min(0.55, (t - 0.6) * 1.6) : 0; if (low) { si.push(pel, f > 0 ? tl : tr, 0, 0); sw.push(1 - w, w, 0, 0); } else { si.push(t < 0.35 ? spine : pel, 0, 0, 0); sw.push(1, 0, 0, 0); } colr.push(...col3(r === rows ? mix(c, 0x8a8a80, 0.3) : c)); } }
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols - 1; k++) { const a = r * cols + k, b = a + 1, d = a + cols, e = d + 1; idx.push(a, b, e, a, e, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); B.cloth.push(g);
    const wy = y0 + (y1 - y0) * 0.34;   // waist tie: a band around the waist (measured on the garment) and a bow behind
    B.ring(A.src.garment, { axis: 'y', lo: wy - 0.014 * u, hi: wy + 0.014 * u, pred: (i) => A.src.garment.G[i] === 0, off: 0.037 * u, bone: 'spine_02', hex: mix(c, 0xb0b0a6, 0.3), kind: 'cloth' });
    const zb = A.src.garment.P.reduce((m, v, i) => (i % 3 === 2 && Math.abs(A.src.garment.P[i - 1] - wy) < 0.03 ? Math.min(m, v) : m), 9) - 0.04 * u;
    for (const sx of [-1, 1]) B.box(0.07 * u, 0.02 * u, 0.012 * u, [sx * 0.04 * u, wy, zb], 'spine_02', c, 'cloth', [0, 0, sx * 0.4]); B.box(0.02 * u, 0.12 * u, 0.008 * u, [-0.02 * u, wy - 0.07 * u, zb], 'spine_02', c, 'cloth'); B.box(0.02 * u, 0.1 * u, 0.008 * u, [0.025 * u, wy - 0.06 * u, zb], 'spine_02', c, 'cloth');
    B.box(0.2 * u, 0.1 * u, 0.008 * u, [0, y0 + (y1 - y0) * 0.5, zs[6] + 0.006 * u], 'pelvis', mix(c, 0xb8b8a8, 0.25), 'cloth');   // patch pocket
    const nk = A.bp.neck_01, a = V3(-0.115 * u, y0, zs[0]), b = V3(0.115 * u, y0, zs[0]);   // neck loop: a ring at the base of the neck and two straps to the bib corners
    B.ring(A.src.body, { axis: 'y', lo: nk.y - 0.02 * u, hi: nk.y - 0.004 * u, pred: (i) => A.src.body.G[i] === 1, off: 0.012 * u, bone: 'neck_01', hex: c, kind: 'cloth' });
    B.strut(a, V3(-0.05 * u, nk.y - 0.012 * u, nk.z + 0.05 * u), 0.016 * u, 'spine_03', c); B.strut(b, V3(0.05 * u, nk.y - 0.012 * u, nk.z + 0.05 * u), 0.016 * u, 'spine_03', c);
  },
  suit(B, A, o) {   // pressure suit: division chest band, upper-arm bands, a trim ring above the knee pocket row; uses the suit's own surface
    const c = o.color ?? 0xc79a1e, S = A.src.body, u = A.u, bp = A.bp, ny = bp.neck_01.y;
    B.ring(S, { axis: 'y', lo: ny - 0.17 * u, hi: ny - 0.11 * u, pred: (i) => S.G[i] === 0 && Math.abs(S.P[i * 3]) < 0.2 * u, off: 0.007 * u, bone: 'spine_03', hex: c, N: 22 });
    for (const sd of [1, -1]) B.ring(S, { axis: 'x', lo: sd * (bp.upperarm_l.x + 0.1 * u), hi: sd * (bp.upperarm_l.x + 0.17 * u), pred: (i) => S.G[i] === 3 && S.SD[i] === sd, off: 0.007 * u, bone: sd > 0 ? 'upperarm_l' : 'upperarm_r', hex: c });
    if (o.helmet !== false) head.helmet(B, A, { show: o.helmetShown });
  },
};

// ---------------------------------------------------------------- headgear (rigid, skinned to Head)
const head = {
  fit(A) { const h = A.head, u = A.u, hb = A.bp.Head, hr = A.hair || h; const topY = Math.max(h.top, hr.top), cx = 0, cy = (topY + h.bot) / 2, zc = (h.zf + h.zb) / 2; return { top: topY, bot: h.bot, hw: Math.max(h.hw, hr.hw ?? 0), zf: h.zf, zb: Math.min(h.zb, hr.zb ?? 9), zc, cy, earY: h.bot + (topY - h.bot) * 0.45, mouthY: h.bot + 0.065 * u, hb }; },
  mask(B, A, o) {
    const f = head.fit(A), u = A.u, y = f.mouthY + 0.012 * u, zN = headFront(A, y + 0.02 * u), c = o.color ?? 0x2f3b45;
    B.sph(0.056 * u, [0, y, zN - 0.024 * u], [1.05, 0.9, 0.82], 'Head', c, 'trim', 10, 8);   // moulded shell
    for (const sx of [-1, 1]) { B.cyl(0.021 * u, 0.021 * u, 0.034 * u, [sx * 0.064 * u, y - 0.008 * u, zN - 0.034 * u], 'Head', 0x8a929a, 'trim', [0, 0, PI / 2], 10); B.cyl(0.0245 * u, 0.0245 * u, 0.008 * u, [sx * 0.082 * u, y - 0.008 * u, zN - 0.034 * u], 'Head', 0xe08a22, 'trim', [0, 0, PI / 2], 10); }
    B.box(0.03 * u, 0.02 * u, 0.012 * u, [0, y - 0.016 * u, zN + 0.02 * u], 'Head', 0xb4bac2, 'trim');   // speaking diaphragm
    const rx = f.hw + 0.008 * u, rz = (f.zf - f.zb) / 2 + 0.008 * u;
    B.tor(1, 0.0045 * u, [0, y + 0.012 * u, f.zc], [PI / 2, 0, 0], [rx, rz, 1], 'Head', 0x1d2024, 'cloth', PI * 2, 18);   // straps: one at mouth height, one over the crown
    B.tor(1, 0.0045 * u, [0, f.earY + 0.045 * u, f.zc], [-PI / 2, 0, 0], [rx, rz * 1.05, 1], 'Head', 0x1d2024, 'cloth', PI, 14);   // back strap over the crown line
    for (const sx of [-1, 1]) B.strut(V3(sx * 0.06 * u, y - 0.004 * u, zN - 0.034 * u), V3(sx * rx, f.earY + 0.045 * u, f.zc), 0.006 * u, 'Head', 0x1d2024, 'cloth');
  },
  hood(B, A, o) {
    const f = head.fit(A), u = A.u, nk = A.bp.neck_01, R = [f.hw + 0.05 * u, (f.top - f.bot) / 2 + 0.05 * u, (f.zf - f.zb) / 2 + 0.05 * u];
    B.sph(1, [0, f.cy + 0.01 * u, f.zc + 0.01 * u], R, 'Head', 0xdde8ee, 'glass', 14, 10);
    B.cyl(R[0] * 0.78, R[0] * 0.86, 0.05 * u, [0, nk.y + 0.04 * u, f.zc - 0.015 * u], 'neck_01', 0xe0a020, 'cloth', [0, 0, 0], 16);   // neck seal
    B.tor(R[0] * 0.8, 0.008 * u, [0, nk.y + 0.012 * u, f.zc - 0.015 * u], [PI / 2, 0, 0], [1, 0.95, 1], 'neck_01', 0x55606a, 'trim', PI * 2, 18);
  },
  headset(B, A, o) {
    const f = head.fit(A), u = A.u, c = o.color ?? 0x23272e, xl = f.hw + 0.014 * u, y = f.earY, z = f.zc - 0.022 * u, hs = 0x3a414a;
    B.rigid(xf(new THREE.TorusGeometry(1, 0.0075 * u, 4, 18, PI), [0, y, z - 0.004 * u], [0, 0, 0], [f.hw + 0.012 * u, (f.top - y) * 0.94 + 0.004 * u, 1]), 'Head', c, 'trim');
    B.cyl(0.036 * u, 0.033 * u, 0.03 * u, [xl, y, z], 'Head', c, 'trim', [0, 0, PI / 2], 14); B.cyl(0.03 * u, 0.03 * u, 0.012 * u, [xl + 0.016 * u, y, z], 'Head', hs, 'trim', [0, 0, PI / 2], 14); B.cyl(0.032 * u, 0.034 * u, 0.012 * u, [xl - 0.02 * u, y, z], 'Head', 0x16181c, 'cloth', [0, 0, PI / 2], 14);
    B.cyl(0.015 * u, 0.015 * u, 0.012 * u, [-xl + 0.004 * u, y, z], 'Head', 0x16181c, 'cloth', [0, 0, PI / 2], 10);   // right ear pad
    const mouth = V3(0.03 * u, f.mouthY - 0.004 * u, f.zf + 0.012 * u), p = [V3(xl - 0.006 * u, y - 0.025 * u, z + 0.02 * u), V3(xl - 0.012 * u, y - 0.075 * u, z + 0.065 * u), V3(0.06 * u, f.mouthY - 0.002 * u, f.zf - 0.0 * u), mouth];
    for (let k = 0; k < 3; k++) B.strut(p[k], p[k + 1], 0.0065 * u, 'Head', 0x8c939c, 'trim'); B.sph(0.011 * u, mouth, [1, 1, 1], 'Head', 0x16181c, 'trim', 8, 6);
    B.box(0.012 * u, 0.012 * u, 0.012 * u, [xl + 0.02 * u, y - 0.01 * u, z], 'Head', 0x38ff8c, 'trim');
  },
  cap(B, A, o) {
    const f = head.fit(A), u = A.u, c = o.color ?? 0xeeeeea, ht = f.top - f.cy;
    B.rigid(xf(new THREE.SphereGeometry(1, 14, 7, 0, PI * 2, 0, PI * 0.5), [0, f.top - ht * 0.78 + 0.018 * u, f.zc - 0.004 * u], [0, 0, 0], [f.hw + 0.014 * u, ht * 0.78 + 0.012 * u, (f.zf - f.zb) / 2 + 0.012 * u]), 'Head', c, 'cloth');
    B.tor(1, 0.005 * u, [0, f.top - ht * 0.78 + 0.018 * u, f.zc - 0.004 * u], [PI / 2, 0, 0], [f.hw + 0.014 * u, (f.zf - f.zb) / 2 + 0.012 * u, 1], 'Head', mix(c, 0x9a9a90, 0.4), 'cloth', PI * 2, 18);
  },
  helmet(B, A, o) {
    const f = head.fit(A), u = A.u, nk = A.bp.neck_01, R = 0.165 * u, y = f.cy + 0.012 * u;
    B.sph(R, [0, y, f.zc + 0.005 * u], [1, 1.02, 1.03], 'Head', 0xdde8ee, 'glass', 16, 12);
    B.tor(R * 0.86, 0.016 * u, [0, nk.y + 0.045 * u, f.zc], [PI / 2, 0, 0], [1, 1, 1], 'neck_01', 0xaeb6c0, 'trim', PI * 2, 18);
    B.sph(0.02 * u, [R * 0.93, y - 0.01 * u, f.zc], [0.5, 1, 1], 'Head', 0xe08a22, 'trim', 6, 4);
  },
};

// ---------------------------------------------------------------- applying
/** wearOutfit(human, id, opts): human = the group from makeHuman (g.userData.human). id: 'coverall' | 'scrubs' | 'whites' | 'apron' | 'gloves' | 'suit'.
 *  opts: color (hex), gloves / apron / cap (booleans), helmet (suit: build the bubble helmet, hidden until show()), keepGarment (do not hide the casual clothes).
 *  Returns { id, meshes, tris, setVisible(v), remove(), part(name)? } or null when the body cannot be measured. Call once per human; the pose is restored. */
export function wearOutfit(human, id, opts = {}) {
  if (!BUILD[id]) return null; const A = analyse(human); if (!A) return null;
  if (id !== 'suit' && !A.src.garment && id !== 'gloves') return null;
  const B = new Build(A); BUILD[id](B, A, opts); const meshes = B.finish(), parent = A.body.parent, hidden = [];
  if (!opts.keepGarment && A.garmentMesh && ['coverall', 'scrubs', 'whites'].includes(id)) { A.garmentMesh.visible = false; hidden.push(A.garmentMesh); }
  for (const m of meshes) { parent.add(m); m.updateMatrixWorld(true); }
  let helmet = null; if (id === 'suit') { helmet = meshes.find(m => m.material === MAT.glass()) || null; if (helmet) helmet.visible = !!opts.helmetShown; }
  const w = { id, meshes, hidden, tris: meshes.reduce((n, m) => n + countTris(m), 0), helmet,
    setVisible(v) { for (const m of meshes) if (m !== helmet) m.visible = v; for (const m of hidden) m.visible = !v; },
    showHelmet(v) { if (helmet) helmet.visible = v; },
    remove() { for (const m of meshes) { m.parent?.remove(m); m.geometry.dispose(); } for (const m of hidden) m.visible = true; } };
  (human.userData.worn || (human.userData.worn = [])).push(w); return w;
}
/** wearHeadgear(human, 'mask' | 'hood' | 'headset' | 'cap', opts) -> same handle as wearOutfit */
export function wearHeadgear(human, id, opts = {}) {
  if (!head[id]) return null; const A = analyse(human); if (!A) return null; const B = new Build(A); head[id](B, A, opts); const meshes = B.finish();
  for (const m of meshes) { A.body.parent.add(m); m.updateMatrixWorld(true); }
  const w = { id, meshes, hidden: [], tris: meshes.reduce((n, m) => n + countTris(m), 0), setVisible(v) { for (const m of meshes) m.visible = v; }, remove() { for (const m of meshes) { m.parent?.remove(m); m.geometry.dispose(); } } };
  (human.userData.worn || (human.userData.worn = [])).push(w); return w;
}
/** which outfit a crew member wears in normal duty: { outfit, opts } or null (keep the casual clothes). person = a js/crew.js roster entry ({ dept, billet|role }). */
export function outfitFor(person) {
  const d = person?.dept, role = (person?.billet || person?.role || person?.id || '') + '';
  if (d === 'engineering' || /^(ce|ace|reactor|env|eps|dc)$/.test(role)) return { outfit: 'coverall', opts: {} };
  if (d === 'medical') return { outfit: 'scrubs', opts: {} };
  if (/^(cook|galley)$/.test(role)) return { outfit: 'whites', opts: {} };
  return null;
}

// ---------------------------------------------------------------- K-4 donning gestures (js/movement.js GESTURES format; semantic channels of RIG) and K-1 lying
const K = (...k) => k;
export const GESTURES_WEAR = {
  // step into the suit legs, haul it up over the hips, zip from the belt to the collar (3 s)
  don_suit: { states: ['operating'], dur: [3, 3], weight: 1, ch: {
    waist_bow: K([0, 0], [0.12, 0.55], [0.4, 0.5], [0.55, 0.15], [1, 0]),
    thigh_l: K([0, 0], [0.1, 0.8], [0.3, 0.1], [1, 0]), thigh_r: K([0, 0], [0.28, 0], [0.38, 0.8], [0.55, 0.1], [1, 0]),
    arm_fwd_l: K([0, 0], [0.12, 0.5], [0.45, 0.5], [0.6, 0.35], [0.85, 0.65], [1, 0]), arm_fwd_r: K([0, 0], [0.12, 0.5], [0.45, 0.5], [0.6, 0.45], [0.85, 1.05], [1, 0]),
    elbow_l: K([0, 0], [0.12, 0.7], [0.6, 1.2], [0.85, 1.6], [1, 0]), elbow_r: K([0, 0], [0.12, 0.7], [0.6, 1.3], [0.85, 2.0], [1, 0]),
    head_nod: K([0, 0], [0.3, 0.25], [0.7, 0.3], [0.9, -0.12], [1, 0]), spine_bow: K([0, 0], [0.15, 0.25], [0.5, 0.1], [1, 0]) } },
  // pull the hood or helmet down over the head with both hands, settle the seal (1.5 s)
  don_hood: { states: ['operating'], dur: [1.5, 1.5], weight: 1, ch: {
    arm_fwd_l: K([0, 0], [0.3, 2.3], [0.55, 2.3], [0.85, 0.7], [1, 0]), arm_fwd_r: K([0, 0], [0.3, 2.3], [0.55, 2.3], [0.85, 0.7], [1, 0]),
    arm_out_l: K([0, 0], [0.3, 0.25], [0.85, 0.15], [1, 0]), arm_out_r: K([0, 0], [0.3, 0.25], [0.85, 0.15], [1, 0]),
    elbow_l: K([0, 0], [0.3, 1.5], [0.55, 1.1], [0.85, 0.8], [1, 0]), elbow_r: K([0, 0], [0.3, 1.5], [0.55, 1.1], [0.85, 0.8], [1, 0]),
    head_nod: K([0, 0], [0.3, -0.18], [0.55, 0.1], [0.8, -0.05], [1, 0]) } },
};
/** the swap moment inside each gesture: u (0..1) at which the garment appears / the hood is on. wearOutfit(...).setVisible(false) before, setVisible(true) at swapAt. */
export const DON = { don_suit: { swapAt: 0.45, outfit: 'suit' }, don_hood: { swapAt: 0.5, outfit: 'hood' } };
/** Plays a donning gesture on a human with the js/movement.js machinery: new Donner(human, 'don_suit', worn).update(dt) -> true while running. worn = a handle whose setVisible is toggled at swapAt. */
export class Donner {
  constructor(human, id, worn, speed = 1) { this.h = human.userData.human; this.g = GESTURES_WEAR[id]; this.id = id; this.worn = worn; this.t = 0; this.speed = speed; this.swapped = false; if (worn) worn.setVisible(false); }
  get u() { return Math.min(1, this.t / this.g.dur[1]); }
  update(dt) {
    this.t += dt * this.speed; const u = this.u, { ch } = sampleGesture(this.g, u); this.h.add = toBones(ch, 1);
    if (!this.swapped && u >= DON[this.id].swapAt) { this.swapped = true; this.worn?.setVisible(true); this.worn?.showHelmet?.(true); }
    if (u >= 1) { this.h.add = {}; return false; } return true;
  }
}
/** K-1: lying poses. Base clip 'idle' (arms by the sides) laid flat; additive channels move one hand to the chest and bend the knees. applyLie(human, mode, { top, yaw, t }) places the root so the
 *  back / side rests on `top` (mattress surface height) and adds slow breathing; returns the additive bone map (also stored in H.add). mode: 'supine' | 'left' | 'right'. */
export const LIE_POSES = {
  supine: { rot: [-PI / 2, 0, 0], rest: 0.15, ch: { arm_fwd_r: 0.7, elbow_r: 1.9, arm_out_r: -0.15, arm_fwd_l: 0.1, arm_out_l: 0.2, head_tilt: 0.08, thigh_l: 0.05, thigh_r: -0.03 }, extra: { calf_l: [0.1, 0, 0], calf_r: [0.18, 0, 0] } },
  left:   { rot: [-PI / 2, PI / 2, 0], rest: 0.15, ch: { arm_fwd_l: 0.9, elbow_l: 1.4, arm_fwd_r: 0.5, elbow_r: 1.1, thigh_l: 0.6, thigh_r: 0.45, head_nod: 0.1 }, extra: { calf_l: [1.0, 0, 0], calf_r: [0.9, 0, 0] } },
  right:  { rot: [-PI / 2, -PI / 2, 0], rest: 0.15, ch: { arm_fwd_r: 0.9, elbow_r: 1.4, arm_fwd_l: 0.5, elbow_l: 1.1, thigh_l: 0.45, thigh_r: 0.6, head_nod: 0.1 }, extra: { calf_l: [0.9, 0, 0], calf_r: [1.0, 0, 0] } },
};
export function applyLie(human, mode = 'supine', { top = 0.52, yaw = 0, t = 0 } = {}) {
  const P = LIE_POSES[mode] || LIE_POSES.supine, H = human.userData.human, inner = H.inner;
  for (const n of ['calf_l', 'calf_r']) if (!H.bones[n]) H.bones[n] = inner.getObjectByName(n);   // the RIG has no knee channel: drive the calf bones directly
  const add = toBones(P.ch, 1), br = Math.sin(t * 1.5) * 0.5 + 0.5;
  add.spine_03 = [(add.spine_03?.[0] || 0) - 0.03 * br, 0, 0]; add.spine_02 = [(add.spine_02?.[0] || 0) + 0.02 * br, 0, 0];
  for (const k in P.extra) add[k] = P.extra[k].slice();
  H.add = add; if (H.current !== 'idle') H.play('idle', { fade: 0 });
  const sc = H.height / 1.75; human.rotation.set(...P.rot, 'XYZ'); human.rotateOnWorldAxis(V3(0, 1, 0), yaw);
  human.position.y = top + P.rest * sc; if (human.userData.blob) human.userData.blob.visible = false; return add;
}
export const clearLie = (human) => { human.rotation.set(0, 0, 0); human.position.y = 0; human.userData.human.add = {}; if (human.userData.blob) human.userData.blob.visible = true; };
/** equipment.js row for a sleeping bunk: the integrator merges it as EQUIPMENT.bunk_asleep, or reads `lie` in the bunk use script when an `anim: "sleeping"` block starts. */
export const BUNK_LIE = { name: 'bunk (asleep)', props: ['bunk'], stance: 'lie', lie: 'supine', top: 0.52, spots: [[0.25, 0.0, 0]] };

// ---------------------------------------------------------------- stowed / folded item forms (js/itemart.js DEFS format)
const GEO = new Map(); const geo = (key, f) => { let g = GEO.get(key); if (!g) { g = f(); GEO.set(key, g); } return g; };
const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; return o; };
function bevelGeo(w, h, d, r) {   // chamfered box (flat shaded), same construction as js/itemart.js
  const Hh = [w / 2, h / 2, d / 2], P = [], idx = new Map(), at = (a, s0, s1, s2) => { const k = a + '|' + s0 + s1 + s2; if (idx.has(k)) return idx.get(k); const sg = [s0, s1, s2], v = [0, 0, 0]; for (let i = 0; i < 3; i++) v[i] = sg[i] * (i === a ? Hh[i] : Hh[i] - r); P.push(v); idx.set(k, P.length - 1); return P.length - 1; };
  const T = [], S = [-1, 1], tri = (a, b, c) => T.push([a, b, c]), quad = (a, b, c, d2) => { tri(a, b, c); tri(a, c, d2); };
  for (let a = 0; a < 3; a++) for (const sa of S) { const o = [0, 1, 2].filter(i => i !== a), g = (t, u) => { const sg = [0, 0, 0]; sg[a] = sa; sg[o[0]] = t; sg[o[1]] = u; return at(a, ...sg); }; quad(g(-1, -1), g(1, -1), g(1, 1), g(-1, 1)); }
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) { const c = 3 - a - b; for (const sa of S) for (const sb of S) { const g = (aa, sc) => { const sg = [0, 0, 0]; sg[a] = sa; sg[b] = sb; sg[c] = sc; return at(aa, ...sg); }; quad(g(a, -1), g(a, 1), g(b, 1), g(b, -1)); } }
  for (const sx of S) for (const sy of S) for (const sz of S) tri(at(0, sx, sy, sz), at(1, sx, sy, sz), at(2, sx, sy, sz));
  const pos = []; for (const t of T) { const [A, B, C] = t.map(i => P[i]); const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]], n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const dot = n[0] * (A[0] + B[0] + C[0]) + n[1] * (A[1] + B[1] + C[1]) + n[2] * (A[2] + B[2] + C[2]); if (dot >= 0) pos.push(...A, ...B, ...C); else pos.push(...A, ...C, ...B); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}
const rb = (w, h, d, r, m, x = 0, y = 0, z = 0) => { r = Math.min(r * 0.8, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4); return mesh(geo(`rb${w}|${h}|${d}|${r}`, () => bevelGeo(w, h, d, r)), m, x, y, z); };
const bx = (w, h, d, m, x = 0, y = 0, z = 0) => mesh(geo(`bx${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d)), m, x, y, z);
const cy = (rt, rbm, h, m, x = 0, y = 0, z = 0, seg = 10) => mesh(geo(`cy${rt}|${rbm}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rbm, h, seg)), m, x, y, z);
const cyx = (rt, rbm, h, m, x = 0, y = 0, z = 0, seg = 10) => { const o = cy(rt, rbm, h, m, x, y, z, seg); o.rotation.z = PI / 2; return o; };
const cyz = (rt, rbm, h, m, x = 0, y = 0, z = 0, seg = 10) => { const o = cy(rt, rbm, h, m, x, y, z, seg); o.rotation.x = PI / 2; return o; };
const tor = (R, r, m, x = 0, y = 0, z = 0, arc = PI * 2, rs = 4, ts = 10) => mesh(geo(`tr${R}|${r}|${arc}|${rs}|${ts}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc)), m, x, y, z);
const sph = (r, m, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => { const o = mesh(geo(`sp${r}`, () => new THREE.SphereGeometry(r, 8, 5)), m, x, y, z); o.scale.set(sx, sy, sz); return o; };
const sc = (o, x, y, z) => { o.scale.set(x, y, z); return o; };
const own = {}; const memo = (k, f) => own[k] || (own[k] = f());
const S_ = (o) => new THREE.MeshStandardMaterial(o);
const WM = () => memo('wm', () => ({ steel: S_({ color: 0xb4bac2, metalness: 0.9, roughness: 0.3 }), gun: S_({ color: 0x3b414b, metalness: 0.8, roughness: 0.38 }), dark: S_({ color: 0x24272d, metalness: 0.15, roughness: 0.5 }), rubber: S_({ color: 0x15161a, roughness: 0.92 }),
  white: S_({ color: 0xe9edef, roughness: 0.8 }), red: S_({ color: 0xc4382e, roughness: 0.5 }), amber: S_({ color: 0xe19a22, roughness: 0.45 }), glass: S_({ color: 0xcfe6ee, roughness: 0.05, transparent: true, opacity: 0.38, depthWrite: false }), glowG: S_({ color: 0x0a3a1c, emissive: 0x38ff8c, emissiveIntensity: 1.5, roughness: 0.4 }) }));
const cloth = (hex, r = 0.92) => memo('c' + hex, () => S_({ color: hex, roughness: r }));

export const DEFS_WEAR = {};
const def = (kind, name, cls, build, x = {}) => { DEFS_WEAR[kind] = { name, cls, build, ...x }; };
// Frames: all base (origin at the bottom centre, authored lying on a surface) except headset (grip: origin at the band centre, ear cup toward -x).
def('coverall', 'folded coverall', 'household', (g, M, o) => {   // 0.42 x 0.12 x 0.3: a fold of navy cloth, stand collar and pocket flap showing, reflective strip, zip pull
  const c = o?.color ?? 0x3b4d6b, C = cloth(c), C2 = cloth(mix(c, 0x0a0a0c, 0.25));
  g.add(rb(0.42, 0.05, 0.3, 0.02, C, 0, 0.025, 0)); g.add(rb(0.4, 0.04, 0.28, 0.016, C2, 0, 0.07, 0)); g.add(rb(0.36, 0.03, 0.26, 0.014, C, 0.01, 0.105, 0));
  g.add(rb(0.16, 0.025, 0.05, 0.01, C2, -0.12, 0.124, -0.1)); g.add(cyx(0.022, 0.022, 0.12, C2, -0.1, 0.128, 0.0, 8));   // collar roll and a sleeve end
  g.add(rb(0.085, 0.016, 0.07, 0.006, C2, 0.09, 0.126, 0.04)); g.add(rb(0.43, 0.012, 0.03, 0.004, cloth(0xd9d6a0, 0.4), 0, 0.06, 0.145)); g.add(bx(0.012, 0.02, 0.008, WM().steel, 0.0, 0.128, 0.06));
}, { base: true });
def('scrubs', 'folded scrubs', 'medical', (g, M, o) => {   // top over trousers, V-neck visible
  const c = o?.color ?? 0x58bdb4, C = cloth(c), C2 = cloth(mix(c, 0x0a0a0c, 0.15)), CL = cloth(mix(c, 0xffffff, 0.35));
  g.add(rb(0.32, 0.034, 0.24, 0.014, C2, 0, 0.017, 0)); g.add(rb(0.3, 0.03, 0.22, 0.012, C2, 0.005, 0.049, 0)); g.add(rb(0.28, 0.036, 0.2, 0.014, C, 0, 0.082, 0));
  g.add(rb(0.12, 0.03, 0.05, 0.01, C, -0.09, 0.115, -0.07)); g.add(rb(0.05, 0.03, 0.12, 0.01, C, 0.1, 0.112, 0.02));   g.add(bx(0.07, 0.006, 0.028, CL, 0.0, 0.101, 0.085));
}, { base: true });
def('apron_fold', 'folded apron', 'food', (g, M, o) => {   // cream bib apron in four folds, neck loop coiled on top, ties hanging over the edge
  const C = cloth(0xf0efe6), C2 = cloth(0xd8d6c8);
  g.add(rb(0.3, 0.02, 0.26, 0.01, C, 0, 0.01, 0)); g.add(rb(0.28, 0.02, 0.24, 0.01, C2, 0, 0.03, 0)); g.add(rb(0.26, 0.02, 0.22, 0.01, C, 0, 0.05, 0)); g.add(rb(0.12, 0.012, 0.1, 0.006, C2, 0.05, 0.068, 0.04));
  g.add(tor(0.05, 0.005, C2, -0.07, 0.07, -0.04, PI * 2, 4, 14).rotateX(PI / 2)); g.add(rb(0.2, 0.008, 0.016, 0.003, C2, 0, 0.012, 0.16)); g.add(rb(0.2, 0.008, 0.016, 0.003, C2, 0.02, 0.012, -0.16));
}, { base: true });
def('skullcap', 'galley skull cap', 'food', (g, M) => { g.add(mesh(geo('capd', () => new THREE.SphereGeometry(0.095, 12, 6, 0, PI * 2, 0, PI * 0.5)), cloth(0xeeeeea), 0, 0, 0)); g.add(tor(0.095, 0.006, cloth(0xd0d0c6), 0, 0.002, 0, PI * 2, 4, 14).rotateX(PI / 2)); }, { base: true });
def('gloves_nitrile', 'nitrile gloves, pair', 'medical', (g, M, o) => {   // two flat gloves side by side: palm, cuff, five fingers each
  const c = o?.color ?? 0x4a86d4, C = cloth(c, 0.45);
  for (const [s, rot] of [[-1, 0.08], [1, -0.1]]) { const h = new THREE.Group(); h.add(rb(0.085, 0.012, 0.09, 0.005, C, 0, 0.007, 0)); h.add(sc(cyz(0.036, 0.04, 0.06, C, 0, 0.007, -0.075, 12), 1, 0.3, 1));
    [[-0.032, 0.095], [-0.011, 0.11], [0.011, 0.105], [0.031, 0.09]].forEach(([x, l]) => h.add(rb(0.017, 0.011, l, 0.004, C, x, 0.007, 0.045 + l / 2))); h.add(rb(0.019, 0.011, 0.07, 0.004, C, 0.058, 0.007, 0.03).rotateY(-0.5));
    h.position.set(s * 0.06, 0, 0); h.rotation.y = rot; g.add(h); }
}, { base: true });
def('suit_bag', 'rapid-don suit bag', 'household', (g, M) => {   // soft duffel with the suit folded inside: division chest-band stripe, red pull handle, shoulder strap, helmet bubble bulge at one end
  const W = WM(), C = cloth(0xb7bcc2, 0.7);
  g.add(rb(0.6, 0.24, 0.3, 0.07, C, 0, 0.12, 0)); g.add(rb(0.62, 0.04, 0.2, 0.012, W.dark, 0, 0.12, 0)); g.add(cyx(0.1, 0.1, 0.06, memo('glass', () => W.glass), -0.31, 0.13, 0, 12)); g.add(rb(0.04, 0.245, 0.31, 0.01, cloth(0xc79a1e, 0.6), 0.1, 0.122, 0));
  g.add(rb(0.02, 0.03, 0.06, 0.008, W.red, 0.0, 0.254, 0)); g.add(tor(0.07, 0.008, W.dark, 0.0, 0.25, 0.0, PI, 4, 12)); g.add(bx(0.5, 0.004, 0.012, W.steel, 0, 0.246, 0.1));
}, { base: true });
def('half_mask', 'half-face breather mask', 'engineering', (g, M) => {   // shell with two side filters and a head strap; lies on its back (origin at the bottom centre)
  const W = WM(), sh = cloth(0x2f3b45, 0.5);
  g.add(sph(0.06, sh, 0, 0.042, 0, 1.05, 0.7, 0.9)); g.add(cyx(0.021, 0.021, 0.034, W.steel, -0.067, 0.036, 0.0, 10)); g.add(cyx(0.021, 0.021, 0.034, W.steel, 0.067, 0.036, 0.0, 10));
  g.add(cyx(0.0245, 0.0245, 0.008, W.amber, -0.085, 0.036, 0.0, 10)); g.add(cyx(0.0245, 0.0245, 0.008, W.amber, 0.085, 0.036, 0.0, 10)); g.add(cyz(0.016, 0.016, 0.014, W.steel, 0, 0.032, 0.054, 10));
  g.add(sc(tor(0.095, 0.0045, W.rubber, 0, 0.008, -0.05, PI * 2, 4, 20).rotateX(PI / 2), 1, 1.1, 1));
}, { base: true });
def('headset', 'headset, boom mic', 'data', (g, M) => {   // frame: origin at the band centre; band over +y, one ear cup at -x, boom curves toward +z
  const W = WM();
  g.add(tor(0.085, 0.0065, W.dark, 0, 0, 0, PI, 4, 18)); g.add(cyx(0.036, 0.033, 0.03, W.dark, -0.098, 0, 0, 14)); g.add(cyx(0.03, 0.03, 0.012, W.gun, -0.082, 0, 0, 14)); g.add(cyx(0.032, 0.034, 0.012, W.rubber, -0.116, 0, 0, 14));
  g.add(cyx(0.015, 0.015, 0.012, W.rubber, 0.094, 0, 0, 10));
  const pts = [[-0.112, -0.02, 0.02], [-0.11, -0.06, 0.07], [-0.07, -0.085, 0.12], [-0.04, -0.075, 0.16]];
  for (let k = 0; k < 3; k++) { const a = new THREE.Vector3(...pts[k]), b = new THREE.Vector3(...pts[k + 1]), d = b.clone().sub(a), m = bx(0.007, d.length(), 0.007, W.steel); m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); g.add(m); }
  g.add(sph(0.011, W.rubber, -0.04, -0.075, 0.16)); g.add(bx(0.012, 0.012, 0.012, W.glowG, -0.122, -0.012, 0.0));
}, { rest: 0.04 });
// keyword rows for js/itemart.js KW: put them in front of the existing rows (the linen row matches 'glove|uniform', the generic rows 'suit' / 'hood' / 'kit')
export const KW_WEAR = [
  [/coverall|boiler ?suit|overalls?\b/i, 'coverall'], [/scrubs?\b|medical tunic|surgical top/i, 'scrubs'], [/apron|galley whites|chef'?s? (jacket|whites)/i, 'apron_fold'], [/skull ?cap|chef'?s? hat|hairnet/i, 'skullcap'],
  [/gloves?\b|gauntlets?/i, 'gloves_nitrile'], [/pressure suit|vacuum suit|space ?suit|eva suit|hazmat suit|rapid-don|survival suit/i, 'suit_bag'],
  [/respirator|half-?(face )?mask|breathing mask|dust mask|filter mask/i, 'half_mask'], [/headset|headphones?|boom mic|earphones/i, 'headset'],
];
/** stand-alone buildItem for viewers and tools: buildWearItem(kind, { frame: 'base' | 'grip', color }) -> Group | null. Uses a tiny material table; the DEFS rows above ignore M. */
export function buildWearItem(kind, opts = {}) {
  const d = DEFS_WEAR[kind]; if (!d) return null; const inner = new THREE.Group(); inner.name = 'item:' + kind; d.build(inner, {}, opts);
  const frame = opts.frame || (d.base ? 'base' : 'grip'), out = new THREE.Group(); out.name = 'item:' + kind; out.add(inner);
  const box = new THREE.Box3().setFromObject(out); if (frame === 'base' && !d.base) inner.position.y = -box.min.y;
  out.userData = { item: kind, frame, rest: d.rest ?? 0, lie: false, size: box.getSize(V3()).toArray(), tris: countTris(out) }; return out;
}
export const WEAR_ITEM_KINDS = Object.keys(DEFS_WEAR);
