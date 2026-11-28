// Face shape morphs: per-person facial structure on the MakeHuman crew bodies (js/humans.js).
// The GLBs carry 15 expression morphs (jaw, lids, brows, smile / frown, snarl) and nothing for the shape of a face, so a crowd of four meshes was four faces.
// addFaceShapes(kind, root) builds FACE_MORPHS extra morph targets on the source meshes of a body kind once (in humans.js info(), before the crowd LODs are
// queued, so the decimated LOD geometries carry them too and keep the same morph count), and faceShapeFor() / applyFaceShape() pick each person's
// influences from their seed. Nothing is drawn differently: same materials, one morph texture per geometry (built once per body kind).
//
// How the targets are made: landmarks are found on the rest-pose mesh (eye centres from the eye mesh, nose tip, mouth corners from the GLB's own
// MouthLeft/RightPullUp expression deltas, chin, ears), every target is a smooth displacement field (sums of gaussians) in a canonical head frame
// (origin between the eyes, x across, y up, z forward, scaled by the inter-pupil distance so the same field fits the smaller female heads), and the
// field is sampled at each vertex of the body, the brows and the lashes (so they stay on the skin), then mapped into the mesh's own quantised space.
// The eyeballs have no morphs (their program is shared with the tongue and shoes): they move by a per-person uniform in eyeShader (uEyeShA / B) by
// the same field sampled at each eyeball centre.
//
// Amplitudes are the plausible extremes at influence +-1 (a few mm); people draw bell-shaped values (sum of three uniforms), so nobody sits at an
// extreme on every axis. Expression morphs still work on top (they are relative deltas; the shape only moves where the face is, not how it moves).
import * as THREE from 'three';

export const FACE_MORPHS = ['FaceNose', 'FaceNoseW', 'FaceBridge', 'FaceJaw', 'FaceChin', 'FaceLips', 'FaceBrow', 'FaceEyes', 'FaceEars', 'FaceCheek', 'FaceAge', 'FaceAsym', 'FaceLong'];
const SHAPED = new Set(['body', 'brows', 'eyelashes']);   // meshes that get the targets (eyes: uniform shift; teeth / tongue / hair: left alone, the fields stay off them)
export const faceShapeCfg = { on: true, normals: true, full: false };   // full: every target per person (else the FACE_SHAPE_K largest, see sparseShape)
//    // normals: normal targets on the body for the shape morphs (shading follows the new shape; doubles the body's morph texture)
export const faceShapeStats = { ms: 0, kinds: 0, verts: 0, mapDev: 0 };   // viewer-faces.html ?shape=0 (before / after); influences are still set, at 0

const rigs = {};   // per body kind: landmarks (canonical frame) + per-eye world centres + eye mesh world -> mesh map
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const gau = (dx, dy, dz, rx, ry, rz) => Math.exp(-((dx / rx) ** 2 + (dy / ry) ** 2 + (dz / rz) ** 2));

// rest-pose world positions of a skinned mesh + its mesh-space <- world-space linear map (taken through the Head bone: the GLBs are quantised and the
// dequantisation lives in the bone inverses, identical for every bone in the rest pose)
function rest(o) {
  o.updateMatrixWorld(true); o.skeleton.bones.forEach(b => b.updateMatrixWorld(true));
  const P = o.geometry.attributes.position, n = P.count, W = new Float32Array(n * 3), v = new THREE.Vector3();
  const infl = o.morphTargetInfluences ? o.morphTargetInfluences.slice() : null; if (infl) o.morphTargetInfluences.fill(0);
  for (let i = 0; i < n; i++) { o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld); v.toArray(W, i * 3); }
  if (infl) for (let i = 0; i < infl.length; i++) o.morphTargetInfluences[i] = infl[i];
  let bi = o.skeleton.bones.findIndex(b => b.name === 'Head'); if (bi < 0) bi = 0;
  const M = new THREE.Matrix4().multiplyMatrices(o.matrixWorld, o.bindMatrixInverse).multiply(o.skeleton.bones[bi].matrixWorld).multiply(o.skeleton.boneInverses[bi]).multiply(o.bindMatrix);
  const Ml = new THREE.Matrix3().setFromMatrix4(M), L = Ml.clone().invert();   // Ml: mesh delta -> world delta, L: back
  // check the one-map assumption: every bone's rest-pose skin transform should be the Head bone's (the max difference is kept for the probe)
  let dev = 0; for (const j of [o.skeleton.bones.findIndex(b => b.name === 'neck_01'), 0]) { if (j < 0) continue; const Mj = new THREE.Matrix4().multiplyMatrices(o.matrixWorld, o.bindMatrixInverse).multiply(o.skeleton.bones[j].matrixWorld).multiply(o.skeleton.boneInverses[j]).multiply(o.bindMatrix); for (let e = 0; e < 16; e++) dev = Math.max(dev, Math.abs(Mj.elements[e] - M.elements[e])); }
  faceShapeStats.mapDev = Math.max(faceShapeStats.mapDev, dev);
  return { n, W, L, Ml };
}

// landmarks of one body kind, in world space, then the canonical frame
function landmarks(meshes) {
  const body = meshes.body, eyes = meshes.eyes; if (!body || !eyes) return null;
  // eye centres: the eye mesh is the front cap of each eyeball; centre one radius behind the front (as humans.js eyesOf)
  const eg = eyes.o.geometry; if (!eg.boundingBox) eg.computeBoundingBox(); const mid = (eg.boundingBox.min.x + eg.boundingBox.max.x) / 2, P = eg.attributes.position;
  const eb = [new THREE.Box3(), new THREE.Box3()], v = new THREE.Vector3();
  for (let i = 0; i < eyes.n; i++) eb[P.getX(i) < mid ? 0 : 1].expandByPoint(v.fromArray(eyes.W, i * 3));
  const ec = eb.map(b => { const r = (b.max.x - b.min.x) / 2; return new THREE.Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, b.max.z - r); });
  const O = ec[0].clone().add(ec[1]).multiplyScalar(0.5), u = ec[0].distanceTo(ec[1]) / 0.062;
  const W = body.W, n = body.n, Q = new Float32Array(n * 3); for (let i = 0; i < n; i++) { Q[i * 3] = (W[i * 3] - O.x) / u; Q[i * 3 + 1] = (W[i * 3 + 1] - O.y) / u; Q[i * 3 + 2] = (W[i * 3 + 2] - O.z) / u; }
  const q = (i) => [Q[i * 3], Q[i * 3 + 1], Q[i * 3 + 2]];
  // nose tip: most forward point on the midline between the eyes and the mouth
  let N = null; for (let i = 0; i < n; i++) { const [x, y, z] = q(i); if (Math.abs(x) < 0.012 && y < -0.01 && y > -0.07 && (!N || z > N[2])) N = [x, y, z]; }
  // mouth corners: where the GLB's own smile targets move most
  const dict = body.o.morphTargetDictionary, MA = body.o.geometry.morphAttributes.position, K = [];
  for (const nm of ['MouthLeftPullUp', 'MouthRightPullUp']) { const a = MA[dict[nm]]; let best = -1, bi = -1; for (let i = 0; i < n; i++) { const m = a.getX(i) ** 2 + a.getY(i) ** 2 + a.getZ(i) ** 2; if (m > best) { best = m; bi = i; } } K.push(q(bi)); }
  const My = (K[0][1] + K[1][1]) / 2, mw = Math.abs(K[0][0] - K[1][0]) / 2;
  let Mz = -1; for (let i = 0; i < n; i++) { const [x, y, z] = q(i); if (Math.abs(x) < 0.006 && Math.abs(y - My) < 0.006 && z > Mz) Mz = z; }
  // chin bottom (menton): lowest midline point still near the front of the face (the underside of the jaw recedes fast), then the chin's front
  // (pogonion): most forward midline point just above it (searching from the mouth down finds the lower lip instead)
  let Cb = 0; for (let i = 0; i < n; i++) { const [x, y, z] = q(i); if (Math.abs(x) < 0.01 && z > Mz - 0.03 && y < My - 0.02 && y > My - 0.09 && y < Cb) Cb = y; }
  let C = null; for (let i = 0; i < n; i++) { const [x, y, z] = q(i); if (Math.abs(x) < 0.01 && y > Cb + 0.004 && y < Cb + 0.026 && (!C || z > C[2])) C = [x, y, z]; }
  // temple half-width (in front of the ears) and the ears: outermost points behind the eyes at ear height
  let hw = 0; for (let i = 0; i < n; i++) { const [x, y, z] = q(i); if (Math.abs(y + 0.005) < 0.012 && z > -0.045 && z < -0.01) hw = Math.max(hw, Math.abs(x)); }
  const ears = [1, -1].map(s => { let mx = 0; for (let i = 0; i < n; i++) { const [x, y, z] = q(i); if (s * x > 0 && y > -0.055 && y < 0.02 && z < -0.04 && z > -0.14) mx = Math.max(mx, s * x); }
    let cx = 0, cy = 0, cz = 0, c = 0; for (let i = 0; i < n; i++) { const [x, y, z] = q(i); if (s * x > mx - 0.012 && y > -0.055 && y < 0.02 && z < -0.04 && z > -0.14) { cx += x; cy += y; cz += z; c++; } }
    return { out: mx, c: [cx / c, cy / c, cz / c] }; });
  const L = { O, u, ec, N, My, mw, Mz, C, Cb, hw, ears };
  L.ear = { y: (ears[0].c[1] + ears[1].c[1]) / 2, z: (ears[0].c[2] + ears[1].c[2]) / 2, root: Math.min(ears[0].out, ears[1].out) - 0.017 };
  return L;
}

// the displacement fields: canonical point (x, y, z) -> out[k*3..] for every target k (canonical metres at influence 1)
function fields(L, x, y, z, out) {
  out.fill(0); if (z < -0.17 || y > 0.075 || y < L.Cb - 0.06 || Math.abs(x) > 0.13) return false;   // nothing reaches past the head
  const ax = Math.abs(x), sx = Math.sign(x) || 1, [Nx, Ny, Nz] = L.N, My = L.My, Mz = L.Mz, [, Cy, Cz] = L.C;
  const front = (z0) => sstep(z0 - 0.012, z0 + 0.004, z);                                    // only the surface in front of z0 (keeps the back of the head and the mouth's inside still)
  const set = (k, dx, dy, dz) => { out[k * 3] += dx; out[k * 3 + 1] += dy; out[k * 3 + 2] += dz; };
  // nose
  const wt = gau(x - Nx, y - Ny, z - Nz, 0.014, 0.02, 0.024) * front(Nz - 0.03);          // tip, falling off up the bridge
  set(0, 0, -0.003 * wt, 0.0055 * wt);                                                    // FaceNose: projection + length
  const wa = gau(x, y - (Ny + 0.004), z - (Nz - 0.012), 0.03, 0.013, 0.022) * front(Nz - 0.035);
  set(1, x * 0.3 * wa, 0, -0.001 * wa);                                                 // FaceNoseW: alar width (a wide nose sits a little flatter)
  const wn = Math.exp(-((x / 0.012) ** 2)) * sstep(Ny + 0.004, Ny + 0.022, y) * (1 - sstep(0.004, 0.018, y)) * front(Nz - 0.032);
  set(2, 0, 0, 0.0042 * wn);                                                               // FaceBridge: nasal bridge height
  // lower face
  const wl = sstep(My + 0.008, My - 0.022, y) * (1 - sstep(L.Cb - 0.008, L.Cb - 0.035, y)) * sstep(0.012, 0.045, ax) * front(-0.105);
  set(3, x * 0.13 * wl, -0.0016 * wl * sstep(0.03, 0.06, ax), 0);                         // FaceJaw: jaw width, a squarer angle
  const wc = gau(x, y - (Cy - 0.004), z - Cz, 0.021, 0.022, 0.03) * front(Cz - 0.04);
  set(4, 0, -0.003 * wc, 0.0052 * wc);                                                    // FaceChin: chin projection + height
  const wlp = gau(x / Math.max(0.6, L.mw / 0.025), y - My, z - Mz, 0.026, 0.011, 0.018) * front(Mz - 0.016);
  const ly = Math.max(-1, Math.min(1, (y - My) / 0.005));
  set(5, 0, 0.0017 * ly * wlp, 0.003 * wlp);                                              // FaceLips: fullness (forward and everted away from the lip line)
  // upper face
  const wb = gau(x, y - 0.021, 0, 0.05, 0.011, 1) * front(-0.006);
  set(6, 0, -0.0011 * wb, 0.0038 * wb);                                                    // FaceBrow: brow ridge
  const we = (s) => gau(x - s * 0.031, y, z, 0.02, 0.019, 0.03);
  set(7, 0.0034 * (we(1) - we(-1)), 0, 0);                                                 // FaceEyes: eye spacing (antisymmetric, so the midline does not tear)
  { const r = L.ear.root, w = sstep(r - 0.004, r + 0.008, ax) * gau(0, y - L.ear.y, z - L.ear.z, 1, 0.035, 0.035);
    set(8, sx * (ax - r) * 0.3 * w, (y - L.ear.y) * 0.24 * w, (z - L.ear.z) * 0.18 * w); } // FaceEars: ear size, scaled about its root
  const wk = gau(ax - 0.046, y + 0.027, 0, 0.022, 0.017, 1) * front(-0.05);
  set(9, sx * 0.0038 * wk, 0.0005 * wk, 0.0024 * wk);                                      // FaceCheek: cheekbone width + prominence
  // FaceAge (0..1): jowls drop, under-eye bags, thinner lips, the nose tip droops, brows sink, ears lengthen, cheeks hollow
  { const wj = gau(ax - 0.044, y - (My - 0.022), 0, 0.02, 0.02, 1) * front(-0.075), wg = gau(ax - 0.031, y + 0.018, 0, 0.013, 0.0065, 1) * front(-0.004);
    const wh = gau(ax - 0.05, y - (My + 0.012), 0, 0.016, 0.014, 1) * front(-0.05), r = L.ear.root, wr = sstep(r - 0.004, r + 0.008, ax) * gau(0, y - L.ear.y, z - L.ear.z, 1, 0.035, 0.035);
    // nasolabial fold: the cheek just lateral of the line from the nose wing to the mouth corner bulges forward, so the line reads as a fold
    const fx0 = 0.019, fy0 = Ny + 0.006, fx1 = L.mw + 0.006, fy1 = My - 0.004, fdx = fx1 - fx0, fdy = fy1 - fy0, fl = Math.hypot(fdx, fdy);
    const ft = Math.max(0, Math.min(1, ((ax - fx0) * fdx + (y - fy0) * fdy) / (fl * fl))), side = ((ax - fx0) * fdy - (y - fy0) * fdx) / fl;   // side > 0: lateral of the line
    const wf = Math.sin(Math.PI * ft) ** 0.5 * Math.exp(-(((side - 0.0055) / 0.0045) ** 2)) * front(-0.03);
    set(10, sx * 0.0014 * wj, -0.0048 * wj - 0.002 * wt - 0.0016 * wb - 0.0011 * ly * wlp + (y - L.ear.y) * 0.12 * wr, 0.002 * wg - 0.0014 * wlp - 0.0024 * wh + 0.001 * wt + 0.0022 * wf); }
  // FaceAsym (sign picks the side): one eye a little higher, that mouth corner up, nose tip and chin off the midline, that side of the jaw fuller
  { const wm = gau(x - L.mw, y - My, 0, 0.011, 0.009, 1) * front(Mz - 0.03);
    set(11, 0.0011 * wt + 0.0014 * wc + Math.max(x, 0) * 0.045 * wl, 0.0015 * we(1) + 0.0009 * wm, 0); }
  // FaceLong: lower face height, stretched below the mouth (the lips and teeth stay where they are), fading out down the neck and behind the jaw
  { const y0 = My - 0.007, w = sstep(L.Cb - 0.05, L.Cb - 0.012, y) * front(-0.11) * (1 - sstep(0.055, 0.075, ax));
    set(12, 0, Math.min(0, y - y0) * 0.13 * w, 0); }
  return true;
}

// build the targets on the source meshes of one body kind (once; every clone shares the geometry). Returns false for a body without a face (suit).
export function addFaceShapes(kind, root) {
  if (rigs[kind] !== undefined) return !!rigs[kind];
  const t0 = performance.now(); try { return build(kind, root); } finally { faceShapeStats.ms += performance.now() - t0; }
}
function build(kind, root) {
  const meshes = {}; root.traverse(o => { if (o.isSkinnedMesh && o.material && (SHAPED.has(o.material.name) || o.material.name === 'eyes')) meshes[o.material.name] = { o }; });
  if (!meshes.body?.o.morphTargetDictionary || !meshes.eyes) return (rigs[kind] = null, false);
  for (const k in meshes) Object.assign(meshes[k], rest(meshes[k].o));
  const L = landmarks(meshes); if (!L || !L.N || !L.C) return (rigs[kind] = null, false);
  const K = FACE_MORPHS.length, f = new Float64Array(K * 3), fd = [0, 1, 2].map(() => new Float64Array(K * 3)), d = new THREE.Vector3(), nb = new THREE.Vector3(), nw = new THREE.Vector3(), A = new THREE.Matrix3(), H = 0.0008;
  for (const name of SHAPED) {
    const m = meshes[name]; if (!m) continue; const geo = m.o.geometry, n = m.n, arrs = FACE_MORPHS.map(() => new Float32Array(n * 3));
    if (geo.morphAttributes.normal) continue;   // (none of these meshes has normal targets of its own; a mix would need them for every target)
    const withN = faceShapeCfg.normals && name === 'body' && geo.attributes.normal, narrs = withN ? FACE_MORPHS.map(() => new Float32Array(n * 3)) : null, NA = geo.attributes.normal;
    for (let i = 0; i < n; i++) {
      const x = (m.W[i * 3] - L.O.x) / L.u, y = (m.W[i * 3 + 1] - L.O.y) / L.u, z = (m.W[i * 3 + 2] - L.O.z) / L.u;
      if (!fields(L, x, y, z, f)) continue; faceShapeStats.verts++;
      for (let k = 0; k < K; k++) { d.set(f[k * 3], f[k * 3 + 1], f[k * 3 + 2]); if (d.lengthSq() < 1e-14) continue; d.multiplyScalar(L.u).applyMatrix3(m.L); d.toArray(arrs[k], i * 3); }
      if (!withN) continue;
      // normal targets: the field's jacobian J (forward differences, canonical units) bends the normal by (I + J)^-T; mapped into the mesh's space like the
      // positions (three skins normals with the same matrices) and kept at the base normal's length, so the targets add up linearly
      fields(L, x + H, y, z, fd[0]); fields(L, x, y + H, z, fd[1]); fields(L, x, y, z + H, fd[2]);
      nb.fromBufferAttribute(NA, i); const nl = nb.length(); nw.copy(nb).applyMatrix3(m.Ml).normalize();
      for (let k = 0; k < K; k++) {
        const j = (a, c) => (fd[c][k * 3 + a] - f[k * 3 + a]) / H;   // dD_a / dq_c
        const e = [1 + j(0, 0), j(0, 1), j(0, 2), j(1, 0), 1 + j(1, 1), j(1, 2), j(2, 0), j(2, 1), 1 + j(2, 2)];
        if (Math.abs(e[0] - 1) + Math.abs(e[1]) + Math.abs(e[2]) + Math.abs(e[3]) + Math.abs(e[4] - 1) + Math.abs(e[5]) + Math.abs(e[6]) + Math.abs(e[7]) + Math.abs(e[8] - 1) < 1e-5) continue;
        A.set(...e).invert().transpose(); d.copy(nw).applyMatrix3(A).applyMatrix3(m.L).normalize().multiplyScalar(nl).sub(nb); d.toArray(narrs[k], i * 3);
      }
    }
    const MA = geo.morphAttributes.position || (geo.morphAttributes.position = []), base = MA.length;
    const o = m.o; o.morphTargetInfluences = o.morphTargetInfluences || []; o.morphTargetDictionary = o.morphTargetDictionary || {};
    FACE_MORPHS.forEach((nm, k) => { const a = new THREE.Float32BufferAttribute(arrs[k], 3); a.name = nm; o.morphTargetDictionary[nm] = MA.length; MA.push(a); o.morphTargetInfluences.push(0); });
    if (withN) { const zero = new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3); geo.morphAttributes.normal = [...Array(base).fill(zero), ...narrs.map(a => new THREE.Float32BufferAttribute(a, 3))]; }   // the expression targets keep flat normals (one shared zero array)
    geo.morphTargetsRelative = true;
  }
  // eyeballs: the same field at each eyeball centre, per target, in the eye mesh's own space (applyFaceShape sums them per person)
  const eyeD = L.ec.map(c => { fields(L, (c.x - L.O.x) / L.u, (c.y - L.O.y) / L.u, (c.z - L.O.z) / L.u, f); return FACE_MORPHS.map((_, k) => new THREE.Vector3(f[k * 3], f[k * 3 + 1], f[k * 3 + 2]).multiplyScalar(L.u).applyMatrix3(meshes.eyes.L)); });
  // which eye is which in the eye shader's split (position.x < uEyeMid = A): eye 0 above was the x < mid one, so A = 0
  rigs[kind] = { L, eyeD }; faceShapeStats.kinds++;
  return true;
}
export const faceRig = (kind) => rigs[kind] || null;   // probes / viewer

// ---- per person ----
// key: any 32-bit seed. o: { kind, skin (THREE.Color, linear), rank (0..6), male }. Returns { FaceNose: v, ... } (influences), deterministic per key.
export function faceShapeFor(key, { kind = 'crew_m', skin = null, rank = null } = {}) {
  let s = (key ^ 0x5bd1e995) >>> 0; const r = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const bell = () => Math.max(-1, Math.min(1, (r() + r() + r() - 1.5) * 1.1));   // -1..1, sd 0.55, clipped: the +-1 extremes are rare and never on every axis at once
  const male = kind === 'crew_m' || kind === 'crew_heavy';
  // two loose ancestry axes: the first leans with skin tone (broader nose, fuller lips, lower bridge on darker skin, the reverse on fair skin), the second is
  // independent (cheekbones, eye spacing, brow); both are weaker than the individual variation drawn for every feature, so no tone maps to one face
  const lum = skin ? 0.2126 * skin.r + 0.7152 * skin.g + 0.0722 * skin.b : 0.15, dark = Math.max(-1, Math.min(1, (0.2 - lum) / 0.15));   // palette (after skinAlbedo): ~0.05 -> 1, 0.14 -> 0.4, 0.26 -> -0.4, fair -> -1
  const a1 = 0.55 * dark + 0.45 * bell(), a2 = bell();
  const age = rank === null || rank === undefined ? 0.25 + 0.35 * r() : Math.max(0, Math.min(0.95, 0.06 + 0.11 * rank + 0.22 * bell() + 0.12 * r()));
  const cl = (v) => Math.max(-1, Math.min(1, v));
  return {
    FaceNose: cl(0.95 * bell() - 0.15 * a1),
    FaceNoseW: cl(0.4 * a1 + 0.85 * bell()),
    FaceBridge: cl(-0.35 * a1 + 0.25 * a2 + 0.85 * bell()),
    FaceJaw: cl((male ? 0.25 : -0.2) + 0.9 * bell()),
    FaceChin: cl((male ? 0.15 : -0.05) + 0.9 * bell()),
    FaceLips: cl(0.35 * a1 + (male ? -0.1 : 0.15) + 0.85 * bell()),
    FaceBrow: cl((male ? 0.3 : -0.3) - 0.15 * a2 + 0.8 * bell()),
    FaceEyes: cl(0.25 * a2 + 0.9 * bell()),
    FaceEars: cl(0.95 * bell() + 0.25 * age),
    FaceCheek: cl(0.35 * a2 + 0.9 * bell()),
    FaceAge: age,
    FaceAsym: (r() < 0.5 ? -1 : 1) * (0.25 + 0.5 * r()),
    FaceLong: cl(0.95 * bell()),
  };
}
// set a built person's shape: morph influences on the shaped meshes, the eyeball shift on the eye material (eyeShader's uEyeShA / uEyeShB)
// integration: at most FACE_SHAPE_K targets per person, the largest; |w| < 0.2 dropped (under ~1 mm). Every non-zero morph influence costs each body vertex a position
// and a normal fetch from three's morph texture (crowds every frame, the 91 boarding portraits): all 13 cost ~0.5 s of software-GL boarding, this keeps most of the look.
export const FACE_SHAPE_K = 6;
function sparseShape(w) {
  const keep = new Set(FACE_MORPHS.filter(n => Math.abs(w[n] || 0) >= 0.2).sort((a, b) => Math.abs(w[b]) - Math.abs(w[a])).slice(0, FACE_SHAPE_K)), out = {};
  for (const n of FACE_MORPHS) out[n] = keep.has(n) ? w[n] : 0; return out;
}
export function applyFaceShape(inner, kind, w) {
  const rig = rigs[kind]; if (!rig) return null; const on = faceShapeCfg.on ? 1 : 0; w = faceShapeCfg.full ? w : sparseShape(w);
  inner.traverse(o => { const dict = o.morphTargetDictionary; if (!o.isMesh || !dict) return; for (const nm of FACE_MORPHS) { const i = dict[nm]; if (i !== undefined) o.morphTargetInfluences[i] = (w[nm] || 0) * on; } });
  inner.traverse(o => { const u = o.isMesh && o.material?.userData?.eyeU; if (!u || !u.uEyeShA) return;
    u.uEyeShA.value.set(0, 0, 0); u.uEyeShB.value.set(0, 0, 0); if (!on) return;
    FACE_MORPHS.forEach((nm, k) => { const v = w[nm] || 0; if (!v) return; u.uEyeShA.value.addScaledVector(rig.eyeD[0][k], v); u.uEyeShB.value.addScaledVector(rig.eyeD[1][k], v); }); });
  return w;
}
