// Rigged human characters (MakeHuman-based CC0 meshes from the dramatis3d samples) driven by Quaternius' Universal
// Animation Library (CC0). Both share one rest pose, so every clip plays on every body. See CREDITS.md.
import * as THREE from 'three';
import { procClips } from './proc-anims.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { has, get, pbr } from './assets.js';
import { RANKS, mulberry32 } from './data.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { requestLods } from './meshlod.js';
import { rigEyes, idleFace } from './faceanim.js';   // facial animation (eye bones, blink variety, talk visemes): js/faceanim.js
import { giPatch } from './gi.js';   // baked deck GI on the custom crew programs too (same programs: code added, no new cache key)

export const CREW_KINDS = ['crew_m', 'crew_f', 'crew_f2'];
export const DIVISIONS = [0xa3231c, 0xc79a1e, 0x2456a6];
const SKINS = [0xe8b896, 0xd9a47c, 0xb97e58, 0x8f5d3d, 0x5e3b27, 0xf0cdb4];
const HAIRS = [[0.25, 0.2, 0.18], [0.6, 0.45, 0.35], [1.2, 0.95, 0.7], [1.9, 1.6, 1.0], [1.7, 1.7, 1.75], [1.3, 0.55, 0.35], [0.14, 0.13, 0.14], [0.42, 0.28, 0.2], [0.85, 0.6, 0.4], [1.0, 0.98, 0.95], [1.5, 0.75, 0.3], [0.5, 0.5, 0.55]];
const UAL_HIP = 0.917;
const pickOf = (a, r = Math.random) => a[Math.floor(r() * a.length)];
export const humansReady = () => has('human_anims') && has('crew_m');

const meta = {};   // per model: native height, hip height, scaled clips
function info(kind) {
  if (meta[kind]) return meta[kind];
  const src = get(kind); const box = new THREE.Box3().setFromObject(src.scene);
  const pelvis = src.scene.getObjectByName('pelvis'); const k = pelvis.position.length() / UAL_HIP;
  const clips = {};
  for (const c of get('human_anims').animations) {
    const cc = c.clone();
    cc.tracks = cc.tracks.filter(t => src.scene.getObjectByName(t.name.split('.')[0]));
    for (const t of cc.tracks) if (t.name === 'pelvis.position') { t.values = t.values.slice(); for (let i = 0; i < t.values.length; i++) t.values[i] *= k; }
    clips[c.name.replace(/_Loop$/, '').toLowerCase()] = cc;
  }
  Object.assign(clips, procClips(clips, k));   // shamble / vault / climb (js/proc-anims.js)
  // paint a dark undershirt onto the torso skin (vertex colours from skin weights) so cropped tops read as uniforms
  if (kind !== 'suit') src.scene.traverse(o => {
    if (!o.isSkinnedMesh || o.material.name !== 'body') return;
    const g = o.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, n = si.count, col = new Float32Array(n * 3);
    const torso = o.skeleton.bones.map(b => /^(pelvis|spine_0\d|clavicle_[lr])$/.test(b.name));
    for (let i = 0; i < n; i++) {
      let w = 0, tot = 0; for (let k = 0; k < 4; k++) { const wk = sw.getComponent(i, k); tot += wk; if (torso[si.getComponent(i, k)]) w += wk; }
      const v = 1 - 0.97 * Math.min(1, Math.max(0, (w / (tot || 1) - 0.3) / 0.25)); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); o.material.vertexColors = true;
  });
  // uniform style zones on the garment geometry (shared by every body of this kind): x = legs, y = forearms / hands, z = shoulders / upper chest; makeHuman styles per person from them
  if (kind !== 'suit') src.scene.traverse(o => {
    if (!o.isSkinnedMesh || !(o.material.name || '').startsWith('garment') || (o.material.name || '').includes('shoes')) return;
    const g = o.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, n = si.count, z = new Float32Array(n * 3), bn = o.skeleton.bones.map(b => b.name);
    const isLeg = bn.map(s => /^(thigh|calf|foot|ball)_[lr]$/.test(s)), isCuff = bn.map(s => /^(lowerarm|hand|index|thumb|middle|ring|pinky)/.test(s)), isYoke = bn.map(s => /^(clavicle|upperarm)_[lr]$|^neck_01$/.test(s));
    for (let i = 0; i < n; i++) { let l = 0, c = 0, y = 0, tot = 0; for (let k = 0; k < 4; k++) { const wk = sw.getComponent(i, k), b = si.getComponent(i, k); tot += wk; if (isLeg[b]) l += wk; if (isCuff[b]) c += wk; if (isYoke[b]) y += wk; } tot = tot || 1; z[i * 3] = l / tot; z[i * 3 + 1] = c / tot; z[i * 3 + 2] = y / tot; }
    g.setAttribute('zone', new THREE.BufferAttribute(z, 3));
  });
  rigEyes(src.scene, THREE);   // two eye bones in the eye mesh's own skeleton (js/faceanim.js), before any clone
  const height = box.max.y - box.min.y; queueLods(kind, src.scene, height);
  return meta[kind] = { height, clips };
}
// ---- crowd LODs (js/meshlod.js, swapped per frame by js/perfcull.js): two decimated copies of the body, teeth, hair and garments of each
// body kind, built in a worker once the colour / zone attributes above exist (every clone shares the source geometry, so they all get them).
// maxError is in metres (the mean distance the simplified surface may drift; a skin-weight difference counts as |dw| x LOD_LEVER m, a
// face-morph difference as itself, see meshlod.js penaltyAttrs); LOD1 is used from ~5 m, LOD2 from ~10 m (meshlod.js LOD_NEAR / LOD_FAR),
// where 3 mm / 8 mm are about half a pixel at 1080p / 75 deg.  Small meshes (eyes, brows, lashes, tongue) are left alone.
export const LOD_LEVELS = [{ ratio: 0.5, maxError: 0.003 }, { ratio: 0.22, maxError: 0.008 }];
const LOD_MIN_TRIS = 1000, LOD_LEVER = 0.03, KIND_H = { crew_m: 1.79, crew_f: 1.66, crew_f2: 1.66, crew_heavy: 1.96, suit: 1.9 };
function queueLods(kind, root, nativeH) {
  if (typeof Worker === 'undefined') return; const k = nativeH / (KIND_H[kind] || 1.75), jobs = [];   // metres -> model units
  root.traverse(o => { if (!o.isSkinnedMesh) return; const g = o.geometry, tris = g.index ? g.index.count / 3 : g.attributes.position.count / 3; if (tris < LOD_MIN_TRIS) return;
    jobs.push({ geo: g, name: kind + ':' + (o.material.name || o.name), levels: LOD_LEVELS.map(L => ({ ratio: L.ratio, maxError: L.maxError * k })), penalty: { lever: LOD_LEVER * k } }); });
  if (jobs.length) requestLods(THREE, jobs);
}


// ---- bind-pose surface probe: ray casts against the skinned body + clothes so badges, belts and outfits sit on the cloth of any body ----
// returns cast(ox, oy, oz, dx, dy, dz) → hits [{ t, p: Vector3, n: Vector3 (facing the ray origin), front: bool }] sorted by distance (world space of `inner`'s parent)
export function bindSurface(inner, pick = (n) => n === 'body' || (n.startsWith('garment') && !n.includes('shoes'))) {
  inner.updateMatrixWorld(true); const sets = [], v = new THREE.Vector3();
  inner.traverse(o => {
    if (!o.isMesh || !pick(o.name || o.material.name || '', o)) return; if (o.isSkinnedMesh) o.skeleton.update();
    const pos = o.geometry.attributes.position, P = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { (o.isSkinnedMesh ? o.getVertexPosition(i, v) : v.fromBufferAttribute(pos, i)).applyMatrix4(o.matrixWorld); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; }
    sets.push({ P, idx: o.geometry.index ? o.geometry.index.array : null, n: o.geometry.index ? o.geometry.index.count : pos.count });
  });
  return (ox, oy, oz, dx, dy, dz) => {
    const hits = [];
    for (const { P, idx, n } of sets) for (let i = 0; i < n; i += 3) {
      const a = (idx ? idx[i] : i) * 3, b = (idx ? idx[i + 1] : i + 1) * 3, c = (idx ? idx[i + 2] : i + 2) * 3;
      const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2], e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
      const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x, det = e1x * hx + e1y * hy + e1z * hz; if (det > -1e-12 && det < 1e-12) continue;
      const f = 1 / det, sx = ox - P[a], sy = oy - P[a + 1], sz = oz - P[a + 2], u = f * (sx * hx + sy * hy + sz * hz); if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, w = f * (dx * qx + dy * qy + dz * qz); if (w < 0 || u + w > 1) continue;
      const t = f * (e2x * qx + e2y * qy + e2z * qz); if (t <= 0) continue;
      const nrm = new THREE.Vector3(e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x).normalize(), front = nrm.x * dx + nrm.y * dy + nrm.z * dz < 0; if (!front) nrm.negate();
      hits.push({ t, p: new THREE.Vector3(ox + dx * t, oy + dy * t, oz + dz * t), n: nrm, front });
    }
    return hits.sort((a, b) => a.t - b.t);
  };
}
// matrix that puts local +Z along the surface normal n at p, local +X along hint × n
export function basisAt(p, n, hint = new THREE.Vector3(0, 1, 0), lift = 0) {
  const z = n.clone().normalize(), x = new THREE.Vector3().crossVectors(hint, z).normalize(), y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(p.x + z.x * lift, p.y + z.y * lift, p.z + z.z * lift);
}
// add `obj` (placed in the bind pose, in the space of inner's parent) and hand it to a bone so it follows the animation
export function pinToBone(inner, boneName, obj) {
  const bone = inner.getObjectByName(boneName); if (!bone) return null;
  (inner.parent || inner).add(obj); obj.updateMatrixWorld(true); bone.attach(obj); return obj;
}

// ---- uniform kit: fleet emblem (a four-point compass star in a ring — right breast), name plate (left breast), department shoulder
// boards and a utility belt with buckle, pouch and canister. Geometry is fitted once per body type, in that body's native units. ----
const kitGeo = {}, kitMat = { board: {}, plate: {} };
// kit / pip / name-plate materials are cached and used by every body that wears them: flagged so a caller that throws one body away (js/portraits.js) does not dispose them
const shared = (m) => { m.userData.shared = true; return m; };
const paint = (g, r, gg, b) => { const n = g.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = r; c[i * 3 + 1] = gg; c[i * 3 + 2] = b; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; };
const flat = (g) => { const o = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(o.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) o.deleteAttribute(k); return o; };
function starShape(R = 0.0125, r = 0.0036, k = 0.6) {   // long north-south points, shorter east-west
  const s = new THREE.Shape(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rad = i % 2 ? r : (i % 4 === 2 ? R * k : R); const x = Math.sin(a) * rad, y = Math.cos(a) * rad; i ? s.lineTo(x, y) : s.moveTo(x, y); } s.closePath(); return s;
}
function fitKit(kind, inner, height) {
  if (kitGeo[kind]) return kitGeo[kind];
  const cast = bindSurface(inner), sc = inner.scale.x, u = height / 1.75, W = (n) => inner.getObjectByName(n).getWorldPosition(new THREE.Vector3());
  const np = W('neck_01'), shR = W('upperarm_r'), shL = W('upperarm_l'), pel = W('pelvis'), half = Math.abs(shL.x - np.x), sgnL = Math.sign(shL.x - np.x) || 1;
  const first = (ox, oy, oz, dx, dy, dz) => cast(ox, oy, oz, dx, dy, dz).find(h => h.front);
  const out = {}, unscale = new THREE.Matrix4().makeScale(1 / sc, 1 / sc, 1 / sc), fin = (list) => { const g = mergeGeometries(list.map(flat)); g.applyMatrix4(unscale); return g; };
  const yc = np.y - 0.165 * u;
  // emblem
  { const h = first(np.x - sgnL * half * 0.5, yc, np.z + 1, 0, 0, -1);
    if (h) { const m = basisAt(h.p, h.n.lerp(new THREE.Vector3(0, 0, 1), 0.5), undefined, 0.003 * u), k = new THREE.Matrix4().makeScale(u, u, u);
      const ring = new THREE.TorusGeometry(0.0155, 0.0022, 6, 20), star = new THREE.ExtrudeGeometry(starShape(), { depth: 0.003, bevelEnabled: false }); star.translate(0, 0, -0.0005);
      out.gold = fin([ring, star].map(g => g.applyMatrix4(k).applyMatrix4(m))); } }
  // name plate
  { const h = first(np.x + sgnL * half * 0.5, yc, np.z + 1, 0, 0, -1);
    if (h) { const g = new THREE.BoxGeometry(0.07 * u, 0.019 * u, 0.003 * u); g.applyMatrix4(basisAt(h.p, h.n.lerp(new THREE.Vector3(0, 0, 1), 0.6), undefined, 0.003 * u)); out.plate = fin([g]); } }
  // shoulder boards
  { const list = []; for (const [sh, sg] of [[shL, sgnL], [shR, -sgnL]]) { const h = first(np.x + sg * half * 0.62, np.y + 0.5, sh.z - 0.005 * u, 0, -1, 0); if (!h) continue;
      const m = basisAt(h.p, h.n, new THREE.Vector3(0, 0, -1), 0.0025 * u);
      const b = paint(new THREE.BoxGeometry(0.036 * u, 0.074 * u, 0.004 * u), 1, 1, 1), st = paint(new THREE.BoxGeometry(0.037 * u, 0.008 * u, 0.0055 * u), 2.2, 1.7, 0.5); st.translate(0, -0.024 * u, 0);
      list.push(b.applyMatrix4(m), st.applyMatrix4(m)); }
    if (list.length) out.boards = fin(list); }
  // belt: probe the waist all the way round and wrap a band on the outermost layer of cloth
  { const N = 28, yb = pel.y + 0.075 * u, rad = [];
    for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a), hs = cast(pel.x + dx * 0.7, yb, pel.z + dz * 0.7, -dx, 0, -dz).filter(h => h.front && h.t < 0.69).map(h => 0.7 - h.t).sort((a, b) => a - b);
      let r = hs[0] ?? null; for (let k = 1; k < hs.length; k++) { if (hs[k] - r < 0.045 * u) r = hs[k]; else break; } rad.push(r); }
    const ok = rad.filter(r => r !== null); if (ok.length > N * 0.6) {
      const avg = ok.reduce((a, b) => a + b, 0) / ok.length, R = rad.map(r => r ?? avg), Rs = R.map((r, i) => Math.max(r, (R[(i + N - 1) % N] + r * 2 + R[(i + 1) % N]) / 4) + 0.007 * u);
      const pos = [], nor = [], uv = [], hh = 0.021 * u;
      for (let i = 0; i < N; i++) { const j = (i + 1) % N, a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2, q = (a, r, y) => [pel.x + Math.sin(a) * r, y, pel.z + Math.cos(a) * r];
        const A = q(a0, Rs[i], yb - hh), B = q(a1, Rs[j], yb - hh), C = q(a1, Rs[j], yb + hh), D = q(a0, Rs[i], yb + hh);
        for (const [P, a] of [[A, a0], [B, a1], [C, a1], [A, a0], [C, a1], [D, a0]]) { pos.push(...P); nor.push(Math.sin(a), 0, Math.cos(a)); uv.push(0, 0); } }
      const band = new THREE.BufferGeometry(); band.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); band.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); band.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); paint(band, 0.05, 0.05, 0.06);
      const at = (a, lift) => { const i = Math.round(a / (Math.PI * 2) * N + N) % N, r = Rs[i] + lift; return new THREE.Matrix4().makeRotationY(a).setPosition(pel.x + Math.sin(a) * r, yb, pel.z + Math.cos(a) * r); };
      const buckle = paint(new THREE.BoxGeometry(0.05 * u, 0.036 * u, 0.008 * u), 1.5, 1.15, 0.4).applyMatrix4(at(0, 0.003));
      const pouch = paint(new THREE.BoxGeometry(0.075 * u, 0.09 * u, 0.034 * u), 0.07, 0.07, 0.08); pouch.translate(0, -0.03 * u, 0); pouch.applyMatrix4(at(sgnL * 1.75, 0.017 * u));
      const flap = paint(new THREE.BoxGeometry(0.079 * u, 0.03 * u, 0.039 * u), 0.11, 0.11, 0.125); flap.translate(0, 0.006 * u, 0); flap.applyMatrix4(at(sgnL * 1.75, 0.017 * u));
      const can = paint(new THREE.CylinderGeometry(0.02 * u, 0.02 * u, 0.1 * u, 8), 0.45, 0.48, 0.5); can.translate(0, -0.04 * u, 0); can.applyMatrix4(at(-sgnL * 2.1, 0.02 * u));
      const cap = paint(new THREE.CylinderGeometry(0.022 * u, 0.022 * u, 0.018 * u, 8), 0.2, 1.3, 1.7); cap.translate(0, 0.016 * u, 0); cap.applyMatrix4(at(-sgnL * 2.1, 0.02 * u));
      out.belt = fin([band, buckle, pouch, flap, can, cap]);
    } }
  return kitGeo[kind] = out;
}
function plateMat(name) {
  const key = (name || '').toUpperCase(); if (kitMat.plate[key]) return kitMat.plate[key];
  const c = document.createElement('canvas'); c.width = 128; c.height = 32; const g = c.getContext('2d');
  g.fillStyle = '#d8d2c0'; g.fillRect(0, 0, 128, 32); for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${i % 2 ? 255 : 0},${i % 2 ? 255 : 0},${i % 2 ? 255 : 0},0.06)`; g.fillRect(0, Math.random() * 32, 128, 1); }
  g.strokeStyle = '#3a3428'; g.lineWidth = 2; g.strokeRect(1.5, 1.5, 125, 29);
  if (key) { g.fillStyle = '#17150f'; g.textAlign = 'center'; g.textBaseline = 'middle'; let px = 20; g.font = `bold ${px}px Arial`; while (g.measureText(key).width > 114 && px > 9) g.font = `bold ${--px}px Arial`; g.fillText(key, 64, 17); }
  else { g.fillStyle = '#17150f'; g.fillRect(14, 10, 100, 4); g.fillRect(14, 19, 64, 3); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return kitMat.plate[key] = shared(new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.3, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.12 }));
}
function addKit(kind, inner, height, uniform, name) {
  const geo = fitKit(kind, inner, height); if (!pipMats) pipSetup();
  kitMat.belt = kitMat.belt || shared(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide }));
  const ck = uniform.getHex(), board = kitMat.board[ck] || (kitMat.board[ck] = shared(new THREE.MeshStandardMaterial({ vertexColors: true, color: uniform.clone().lerp(new THREE.Color(0x101014), 0.55), roughness: 0.7, metalness: 0.2 })));
  const put = (g, mat, bone) => { if (!g) return; const m = new THREE.Mesh(g, mat); m.castShadow = false; m.frustumCulled = false; inner.add(m); inner.updateMatrixWorld(true); inner.getObjectByName(bone)?.attach(m); };
  put(geo.gold, pipMats.gold, 'spine_03'); put(geo.plate, plateMat(name), 'spine_03'); put(geo.boards, board, 'spine_03'); put(geo.belt, kitMat.belt, 'pelvis');
}

// ---- rank pips: solid = gold disc, hollow = dark disc with a gold rim; pinned to the collar (wearer's right) ----
let pipGeo = null, pipMats = null;
function pipSetup() {
  pipGeo = { disc: new THREE.CylinderGeometry(0.0062, 0.0062, 0.003, 14), rim: new THREE.TorusGeometry(0.0062, 0.0017, 6, 16) };
  pipMats = { gold: shared(new THREE.MeshStandardMaterial({ color: 0xe2b23a, metalness: 1, roughness: 0.22, emissive: 0x8a6510, emissiveIntensity: 0.9 })), dark: shared(new THREE.MeshStandardMaterial({ color: 0x15161a, metalness: 0.6, roughness: 0.4 })) };
}
function addPips(inner, rank) {
  const [, solid, hollow] = RANKS[rank] || RANKS[0]; const n = solid + hollow; if (!n) return;
  if (!pipGeo) pipSetup();
  inner.updateMatrixWorld(true);
  const chest = inner.getObjectByName('spine_03'), neck = inner.getObjectByName('neck_01'), clavR = inner.getObjectByName('upperarm_r'); if (!chest || !neck) return;
  const np = neck.getWorldPosition(new THREE.Vector3()), sh = clavR.getWorldPosition(new THREE.Vector3());
  const s = inner.scale.x, half = Math.abs(sh.x - np.x);                                  // neck → shoulder distance, for placement on any body
  const row = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const pip = new THREE.Group(); const isSolid = i < solid;
    const d = new THREE.Mesh(pipGeo.disc, isSolid ? pipMats.gold : pipMats.dark); d.rotation.x = Math.PI / 2; pip.add(d);
    if (!isSolid) pip.add(new THREE.Mesh(pipGeo.rim, pipMats.gold));
    pip.position.x = -i * 0.016; row.add(pip);
  }
  // world-space placement in the bind pose, then re-parented to the chest bone so it follows the animation
  row.position.set(np.x - half * 0.3, np.y - 0.012 * s, np.z + 0.088 * s); row.rotation.set(-0.5, -0.35, 0.12); row.scale.setScalar(s * 1.25);
  inner.parent ? inner.parent.attach(row) : inner.add(row); chest.attach(row);
  row.traverse(o => { if (o.isMesh) o.castShadow = false; });
}

// ---- hologram material (fresnel rim + scanlines + tearing); works on skinned meshes ----
const holoTime = { value: 0 };
export function holoMaterial(color = 0x6ad8ff, opacity = 0.75) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: holoTime, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uGlitch: { value: 0 } },
    vertexShader: `
      #include <common>
      #include <morphtarget_pars_vertex>
      #include <skinning_pars_vertex>
      uniform float uTime; uniform float uGlitch;
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        #include <morphinstance_vertex>
        #include <beginnormal_vertex>
        #include <morphnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <morphtarget_vertex>
        #include <skinning_vertex>
        vec4 wp = modelMatrix * vec4(transformed, 1.0); vY = wp.y;
        float band = step(0.93, fract(wp.y * 1.7 - uTime * 0.9)) + uGlitch * step(0.6, fract(wp.y * 5.0 + uTime * 13.0));
        wp.x += band * 0.06 * sin(uTime * 60.0 + wp.y * 40.0);
        vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        vN = normalize(transformedNormal); vV = normalize(-mvPosition.xyz);
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uColor; uniform float uOpacity;
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float scan = 0.35 + 0.65 * step(0.45, fract(vY * 55.0 - uTime * 1.5));
        float flick = 0.9 + 0.1 * sin(uTime * 47.0);
        gl_FragColor = vec4(uColor * (0.07 + fres * 1.35) * scan * flick, uOpacity);
      }`,
  });
}

function bloodyMap(tex, amount) {
  const img = tex.image; const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  for (let i = 0; i < amount; i++) {
    const x = Math.random() * c.width, y = Math.random() * c.height, r = 5 + Math.random() * Math.random() * 40;
    const gr = g.createRadialGradient(x, y, 1, x, y, r); gr.addColorStop(0, 'rgba(48,2,2,0.97)'); gr.addColorStop(0.75, 'rgba(58,0,0,0.9)'); gr.addColorStop(1, 'rgba(40,0,0,0)');
    for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(50,0,0,0.9)'; g.beginPath(); g.arc(x + (Math.random() - 0.5) * r * 4, y + (Math.random() - 0.5) * r * 4, 1 + Math.random() * 3, 0, 7); g.fill(); }
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * (0.5 + Math.random()), Math.random() * 3, 0, 7); g.fill();
    if (Math.random() < 0.5) { g.fillStyle = 'rgba(50,0,0,0.8)'; g.fillRect(x - 2, y, 3 + Math.random() * 4, r * (1 + Math.random() * 2)); }
  }
  const t = new THREE.CanvasTexture(c); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT; return t;
}

// ---- skin detail without UVs: bind-pose object-space noise on the `body` material (pores, mottle, flush, veins, bruising/wounds, derivative bump) ----
const SKIN_GLSL = `
float sh_h(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sh_n(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sh_h(i), sh_h(i + vec3(1,0,0)), f.x), mix(sh_h(i + vec3(0,1,0)), sh_h(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(sh_h(i + vec3(0,0,1)), sh_h(i + vec3(1,0,1)), f.x), mix(sh_h(i + vec3(0,1,1)), sh_h(i + vec3(1,1,1)), f.x), f.y), f.z); }
float sh_f(vec3 p){ return 0.5 * sh_n(p) + 0.25 * sh_n(p * 2.03 + 7.1) + 0.125 * sh_n(p * 4.1 + 3.7) + 0.0625 * sh_n(p * 8.3 + 1.3); }
`;
// ---- per-material light response: wrap RE_Direct (three's per-light BRDF hook in lights_physical_pars_fragment) with an extra term. Same program count as before:
// each of these replaces the program its material already had (one customProgramCacheKey per kind of material), nothing is added per person.
const directHook = (fs, name, body, pre = '') => fs.replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>
void RE_Direct_${name}( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  ${pre}
  RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  ${body}
}
#undef RE_Direct
#define RE_Direct RE_Direct_${name}`);
// skin: wrap lighting tinted toward red past the terminator (light that entered the skin comes out a few mm further on, and red travels furthest), i.e. a cheap
// subsurface look without a blur pass. Per channel wrap w: lambert' = (n.l + w) / (1 + w); only the part above plain lambert is added (the lit side is unchanged).
const SKIN_SSS = `
  float ndl = dot( geometryNormal, directLight.direction );
  vec3 wrapW = vec3( 0.62, 0.3, 0.2 ), wrapL = clamp( ( vec3( ndl ) + wrapW ) / ( 1.0 + wrapW ), 0.0, 1.0 );
  reflectedLight.directDiffuse += directLight.color * BRDF_Lambert( material.diffuseContribution ) * max( wrapL - max( ndl, 0.0 ), 0.0 ) * ( 0.85 - 0.6 * smoothstep( 0.0, 0.5, ndl ) );`;
// (the wrap gain falls from 0.85 at the terminator to 0.25 on the lit side: the full gain there added up to +16% red on a half-lit cheek and flattened the
// lower face in the talk close-up; the red bleed past the terminator, where it reads as skin, is unchanged)
// skin ambient: the deck's indirect light (hemisphere + baked GI bounce + IBL) reaches a face almost evenly from every side, and in the talk close-up it was most
// of the face's light (all nine lights off still left the face at ~65% of its brightness: the GI bounce alone), so the face had no form. A face is lit from
// above far more than from below (brow, nose and chin shade what is under them): the indirect term is weighted by the world-space normal, full on surfaces
// facing up, SKIN_AMB on surfaces facing down (uAmb.x), uAmb.y an overall scale (1). Same program: a uniform, no new defines.
const SKIN_AMB = 0.3;
const SKIN_AMBIENT = `#include <lights_fragment_end>
  { vec3 nW = inverseTransformDirection( normal, viewMatrix ); reflectedLight.indirectDiffuse *= mix( uAmb.x, 1.0, smoothstep( -0.6, 0.85, nW.y ) ) * uAmb.y; }`;
// eyes: a wet cornea over the eyeball. The eye mesh is nearly flat (its normals all face forward), so the cornea is shaded with a sphere normal around each
// eyeball's centre (vEyeN, see eyeShader): a second, very sharp specular lobe per light (the material's own roughness spreads it too wide to read as a glint).
const EYE_CORNEA = `
  vec3 eN = normalize( vEyeN ), hD = normalize( directLight.direction + geometryViewDir );
  float nh = clamp( dot( eN, hD ), 0.0, 1.0 ), nl = clamp( dot( eN, directLight.direction ), 0.0, 1.0 );
  reflectedLight.directSpecular += directLight.color * nl * min( D_GGX( 0.07, nh ) * 0.03, 4.0 ) * uGlint;`;
// hair: Kajiya-Kay strand highlights (two shifted lobes, the second tinted by the hair colour). The cards' own normals jump from card to card, so the highlight
// uses a smooth "shell" normal (vHairN: out from the centre of the hair volume) and a strand direction that runs from the crown down and out (vHairT), both
// skinned in hairShader: one continuous band over the head instead of a highlight per card.
// The material's own GGX lobe is kept at 35% of its strength (a little broad sheen): at roughness 0.7 it is a broad untinted haze over the whole crown (with the deck's overhead
// lamp and panel lights it washed the top of the head out to a grey helmet), so the strand lobes below carry the highlight as one band.
const HAIR_PRE = 'vec3 hairSpec0 = reflectedLight.directSpecular;';
const HAIR_KK = `
  reflectedLight.directSpecular = hairSpec0 + ( reflectedLight.directSpecular - hairSpec0 ) * 0.35;
  vec3 N = normalize( vHairN ), T = vHairT - N * dot( vHairT, N ); T = T / max( length( T ), 1e-4 );
  vec3 hD = normalize( directLight.direction + geometryViewDir );
  vec3 T1 = normalize( T - N * 0.12 ), T2 = normalize( T + N * 0.2 );
  float th1 = dot( T1, hD ), th2 = dot( T2, hD ), s1 = sqrt( max( 1.0 - th1 * th1, 0.0 ) ), s2 = sqrt( max( 1.0 - th2 * th2, 0.0 ) );
  float nl = dot( N, directLight.direction ), vis = smoothstep( -0.15, 0.35, nl ) * ( 0.5 + 0.5 * clamp( dot( geometryNormal, directLight.direction ) * 0.5 + 0.5, 0.0, 1.0 ) );
  vec3 hc = min( material.diffuseContribution * 1.8, vec3( 1.0 ) );
  reflectedLight.directSpecular += directLight.color * vis * ( pow( s1, 48.0 ) * 0.06 * mix( vec3( 1.0 ), hc, 0.6 ) + pow( s2, 12.0 ) * 0.06 * hc );`;
// cloth fuzz: fibres standing off the weave catch light at grazing angles (rim brightening, as velvet / brushed twill), from each light and from the ambient term
const CLOTH_FUZZ = `
  float fuzzV = pow( 1.0 - clamp( dot( geometryNormal, geometryViewDir ), 0.0, 1.0 ), 4.0 );
  reflectedLight.directDiffuse += directLight.color * BRDF_Lambert( material.diffuseContribution ) * fuzzV * clamp( dot( geometryNormal, directLight.direction ) * 0.5 + 0.5, 0.0, 1.0 ) * 0.9;`;
const FUZZ_AMBIENT = `#include <lights_fragment_end>
  reflectedLight.indirectDiffuse *= 1.0 + 0.6 * pow( 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 ), 4.0 );`;
// eyes = eyesOf(): the two eyeball centres in the eye mesh's own space (x < mid = one eye, x >= mid = the other) and the eyes' forward direction there.
// glint 0: the same program with the cornea terms off. The tongue and the shoes use it that way: they used to share one program with the eyes (the same
// plain textured skinned material), and keeping all three on one program keeps the program count where it was.
export function eyeShader(m, eyes, glint = 1) {
  const u = { uEyeA: { value: eyes.a.clone() }, uEyeB: { value: eyes.b.clone() }, uEyeMid: { value: eyes.mid }, uEyeFwd: { value: eyes.fwd.clone() }, uGlint: { value: glint } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec4 uEyeA, uEyeB; uniform float uEyeMid; uniform vec3 uEyeFwd; varying vec3 vEyeN; varying vec3 vEyeF;')
      .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
        { vec4 ec = position.x < uEyeMid ? uEyeA : uEyeB; vec3 en = position - ec.xyz, ef = uEyeFwd;
          #ifdef USE_SKINNING
            en = ( skinMatrix * vec4( en, 0.0 ) ).xyz; ef = ( skinMatrix * vec4( ef, 0.0 ) ).xyz;
          #endif
          vEyeN = normalize( mat3( modelViewMatrix ) * en ); vEyeF = normalize( mat3( modelViewMatrix ) * ef ); }`);
    sh.fragmentShader = directHook(sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vEyeN; varying vec3 vEyeF; uniform float uGlint;'), 'Eye', EYE_CORNEA).replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      { // catch light: a soft light near the viewer reflected in the cornea, pinned to the upper left of the pupil (on these meshes the painted pupil sits below the
        // cap's apex, hence the downward offset; found by drawing the regions) so the lids never hide it; scaled by how lit the eye is so it never glows in the dark
        vec3 tg = normalize( normalize( vEyeF ) * 2.5 + normalize( vViewPosition ) + vec3( -0.22, -0.6, 0.0 ) );
        float lum = dot( reflectedLight.indirectDiffuse + reflectedLight.directDiffuse, vec3( 0.3, 0.59, 0.11 ) ) / max( dot( diffuseColor.rgb, vec3( 0.3, 0.59, 0.11 ) ), 0.05 );
        reflectedLight.directSpecular += smoothstep( 0.989, 0.9965, dot( normalize( vEyeN ), tg ) ) * clamp( lum * 8.0, 0.1, 4.0 ) * uGlint; }`);   // ~2 px across at 960x540 in the talk close-up (it was a sub-pixel speck)
    giPatch(sh);
  };
  m.customProgramCacheKey = () => 'eye1'; m.needsUpdate = true; return u;
}
// crown: the top centre of the hair mesh in its own (bind) space; strands are taken to run from there down and out over the scalp
export function hairShader(m, { crown, centre }) {
  const u = { uCrown: { value: crown.clone() }, uHairC: { value: centre.clone() } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec3 uCrown, uHairC; varying vec3 vHairT; varying vec3 vHairN;')
      .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
        { vec3 hd = position - uCrown + vec3( 0.0, -1e-4, 0.0 ), hn = position - uHairC + vec3( 0.0, 1e-4, 0.0 );
          #ifdef USE_SKINNING
            hd = ( skinMatrix * vec4( hd, 0.0 ) ).xyz; hn = ( skinMatrix * vec4( hn, 0.0 ) ).xyz;
          #endif
          vHairT = normalize( mat3( modelViewMatrix ) * hd ); vHairN = normalize( mat3( modelViewMatrix ) * hn ); }`);
    sh.fragmentShader = directHook(sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vHairT; varying vec3 vHairN;'), 'Hair', HAIR_KK, HAIR_PRE).replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  reflectedLight.indirectSpecular *= 0.5;   // the IBL sheen too (scene.environment ignores a material envMapIntensity)');
    giPatch(sh);
  };
  m.customProgramCacheKey = () => 'hair2'; m.needsUpdate = true; return u;
}
// the generated cloth set (assets/textures/cloth_*: plain weave normal + AO / roughness) on the uniform garments, tiled CLOTH_REPEAT times over the garment uv
const CLOTH_REPEAT = 9; let clothMaps;
function clothMapsFor() {
  if (clothMaps !== undefined) return clothMaps; const p = pbr('cloth'); if (!p) return (clothMaps = null);
  const rep = (t) => { const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(CLOTH_REPEAT, CLOTH_REPEAT); c.needsUpdate = true; return c; };   // clones share the image: one upload
  return (clothMaps = ownRandom(() => ({ n: rep(p.n), r: rep(p.r) })));   // private random stream: see blobMat
}
export function skinShader(m, { wound = 0, seed = 0, pale = 0 } = {}) {
  const u = { uWound: { value: wound }, uSeed: { value: seed }, uPale: { value: pale }, uAmb: { value: new THREE.Vector2(SKIN_AMB, 1) } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = directHook(sh.fragmentShader, 'Skin', SKIN_SSS);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj; uniform float uWound, uSeed, uPale; uniform vec2 uAmb;\n' + SKIN_GLSL + 'float gWound = 0.0, gH = 0.0;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 q = vObj * 9.0 + uSeed;
        float mot = sh_f(q * 0.5), pore = sh_n(vObj * 260.0 + uSeed), freck = smoothstep(0.72, 0.8, sh_n(vObj * 70.0 + uSeed * 1.7));
        float vein = smoothstep(0.47, 0.5, sh_f(vObj * 14.0 + uSeed)) * smoothstep(0.53, 0.5, sh_f(vObj * 14.0 + uSeed));
        diffuseColor.rgb *= 0.9 + 0.2 * mot;
        diffuseColor.rgb *= vec3(1.0, 1.0 - 0.06 * (mot - 0.5), 1.0 - 0.12 * (mot - 0.5));     // blotchy flush
        diffuseColor.rgb *= 1.0 - 0.1 * pore - 0.18 * freck;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.86, 1.05), vein * (0.25 + uPale * 0.6));
        float w = sh_f(vObj * 6.5 + uSeed * 3.1); gWound = uWound * smoothstep(0.6, 0.68, w);
        { vec3 sp = vObj * 5.2 + uSeed;   // claw slashes: three parallel gashes in a patch, only on well-wounded bodies
          float ln = abs(fract(dot(sp.xy, vec2(0.866, 0.5)) * 1.7) - 0.5), cut = smoothstep(0.045, 0.0, ln) * smoothstep(0.58, 0.72, sh_f(vObj * 2.6 + uSeed * 7.0)) * smoothstep(0.35, 0.8, uWound);
          gWound = max(gWound, cut); }
        float bruise = uWound * smoothstep(0.52, 0.64, sh_f(vObj * 4.0 + uSeed * 5.3 + 11.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.6, 0.38, 0.5), bruise * 0.6);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.17, 0.015, 0.02), gWound);
        gH = 0.45 * pore + 0.5 * mot - 1.1 * gWound; }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor * (0.92 + 0.2 * pore_r()), 0.12, gWound);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition); float hx = dFdx(gH), hy = dFdy(gH);
        vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
        vec3 grad = sign(det) * (hx * r1 + hy * r2); normal = normalize(abs(det) * normal - grad * 0.0012); }`)
      .replace('float gWound = 0.0', 'float pore_r(){ return sh_n(vObj * 120.0); }\nfloat gWound = 0.0')
      .replace('#include <lights_fragment_end>', SKIN_AMBIENT);
    giPatch(sh);
  };
  m.customProgramCacheKey = () => 'skin2';
  m.needsUpdate = true;
  return u;
}

/**
 * opts: kind, height, uniform (hex), skin (hex), hair ([r,g,b] multiplier), material (override, e.g. hologram),
 *       bloody (0..1), pale (0..1), slime (bool), tint (hex multiply on everything), shadow (blob), rnd,
 *       person (roster member: fixes the look per person and puts their name on the plate), seed, name, kit (false = no badges/belt)
 */
// a human taken out of the scene for good: free its skeletons' bone textures (SkeletonUtils.clone gives every body its own Skeleton, and each one
// uploads a bone DataTexture that nothing else frees: ~10-20 GPU textures leaked per body / portrait). Safe on a mesh that is shown again: three.js rebuilds the texture.
export function releaseHuman(obj) { if (!obj?.traverse) return; const seen = new Set(); obj.traverse(o => { const sk = o.isSkinnedMesh && o.skeleton; if (sk && !seen.has(sk)) { seen.add(sk); sk.dispose(); } }); }
// Uniform styles on top of the division colour, driven by the per-vertex `zone` mask baked in info(): duty = darker trousers, trim = contrast cuffs, yoke = darker shoulders / collar.
const STYLE_MIX = { plain: [0, 0, 0], duty: [1, 0, 0], trim: [0, 1, 0], yoke: [0, 0, 1], 'trim-duty': [1, 1, 0] };
// Every uniform garment (any style, plain included) shares ONE program: the style mix is a uniform (0,0,0 = plain), plus the cloth weave maps and the fuzz term.
// (Before, plain garments and styled ones were two programs.) Garments without the zone attribute (none today) read zone = 0 and stay plain.
function styleGarment(m, style, uniform) {
  const mix = STYLE_MIX[style] || STYLE_MIX.plain;
  const trim = uniform.clone().lerp(new THREE.Color(0xf2efe6), 0.62), dark = new THREE.Vector3(0.42, 0.42, 0.46), cm = clothMapsFor();
  if (cm) { m.normalMap = cm.n; m.normalScale = new THREE.Vector2(0.45, 0.45); m.roughnessMap = cm.r; m.roughness = 1.05; m.aoMap = cm.r; m.aoMapIntensity = 0.5; }   // ORM: R = AO, G = roughness
  m.onBeforeCompile = (sh) => {
    m.userData.styleCompiled = true;
    sh.uniforms.uStyleMix = { value: new THREE.Vector3(...mix) }; sh.uniforms.uTrim = { value: trim }; sh.uniforms.uDark = { value: dark };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 zone; varying vec3 vZone;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvZone = zone;');
    sh.fragmentShader = directHook(sh.fragmentShader, 'Cloth', CLOTH_FUZZ).replace('#include <lights_fragment_end>', FUZZ_AMBIENT)
      .replace('#include <common>', '#include <common>\nvarying vec3 vZone; uniform vec3 uStyleMix, uTrim, uDark;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= mix(vec3(1.0), uDark, smoothstep(0.2, 0.5, vZone.x) * uStyleMix.x);\n  diffuseColor.rgb = mix(diffuseColor.rgb, uTrim, smoothstep(0.3, 0.6, vZone.y) * uStyleMix.y);\n  diffuseColor.rgb *= mix(vec3(1.0), uDark, smoothstep(0.35, 0.65, vZone.z) * uStyleMix.z);');
    giPatch(sh);
  };
  m.customProgramCacheKey = () => 'garstyle2'; m.needsUpdate = true;
}
// eyeball centres for eyeShader, per body kind: split the eye mesh at its middle in x, each eyeball (a closed low-poly sphere) centred in its box. The GLBs are
// quantised (positions normalised per axis, the scale lives in the bone inverses), so only box centres are meaningful here: an affine map keeps them; the
// skinning matrix in the shader turns (vertex - centre) into a real-space direction.
const eyeSpots = {};
const NO_EYES = { a: new THREE.Vector4(), b: new THREE.Vector4(), mid: 0, fwd: new THREE.Vector3(0, 0, 1) };
function eyesOf(kind) {
  if (eyeSpots[kind]) return eyeSpots[kind]; const S = restMesh(kind, 'eyes'); if (!S) return (eyeSpots[kind] = NO_EYES);
  const geo = S.o.geometry; if (!geo.boundingBox) geo.computeBoundingBox(); const P = geo.attributes.position, mid = (geo.boundingBox.min.x + geo.boundingBox.max.x) / 2, v = new THREE.Vector3();
  // the eye mesh is the front of each eyeball only: put the centre one eyeball radius (half its width, world space) behind its front
  const wb = [new THREE.Box3(), new THREE.Box3()]; for (let i = 0; i < S.n; i++) { v.fromBufferAttribute(P, i); wb[v.x < mid ? 0 : 1].expandByPoint(v.fromArray(S.W, i * 3)); }
  const c = (b) => { const r = (b.max.x - b.min.x) / 2, m = S.toMesh(new THREE.Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, b.max.z - r)); return new THREE.Vector4(m.x, m.y, m.z, r); };
  const o0 = S.toMesh(new THREE.Vector3()), fwd = S.toMesh(new THREE.Vector3(0, 0, 1)).sub(o0).normalize();   // the models face +z
  return (eyeSpots[kind] = { a: c(wb[0]), b: c(wb[1]), mid, fwd });
}
// strand origin + shell centre for hairShader, per body kind (every clone shares the hair geometry): top of the hair mesh, a little behind its centre (the crown whorl)
const crowns = {};
function crownOf(kind) {
  if (crowns[kind]) return crowns[kind]; const S = restMesh(kind, 'hair'); if (!S) return (crowns[kind] = { crown: new THREE.Vector3(0, 1, 0), centre: new THREE.Vector3() });
  const b = S.box, cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2, dz = b.max.z - b.min.z;   // rest pose, world space (y up, +z forward)
  return (crowns[kind] = { crown: S.toMesh(new THREE.Vector3(cx, b.max.y, cz - dz * 0.12)), centre: S.toMesh(new THREE.Vector3(cx, b.max.y - dz * 0.5, cz - dz * 0.05)) });   // centre of the head: about half a head-depth below the top
}
// A part of the source model in its rest pose: { box (world space), split(fn) -> boxes, toMesh(p): world point -> the mesh's own (quantised, z-up) vertex space }.
// The GLBs are quantised and z-up inside the skin, so points for a shader that works on `position` must be mapped back through the skin of the bone that carries the part.
function restMesh(kind, matName) {
  let o = null; get(kind)?.scene.traverse(q => { if (q.isSkinnedMesh && q.material.name === matName) o = q; }); if (!o) return null;
  o.updateMatrixWorld(true); o.skeleton.bones.forEach(b => b.updateMatrixWorld(true));
  const P = o.geometry.attributes.position, n = P.count, W = new Float32Array(n * 3), v = new THREE.Vector3(), box = new THREE.Box3();
  for (let i = 0; i < n; i++) { o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld); v.toArray(W, i * 3); box.expandByPoint(v); }
  const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight; let k = 0; for (let j = 1; j < 4; j++) if (sw.getComponent(0, j) > sw.getComponent(0, k)) k = j;
  const bi = si.getComponent(0, k), M = new THREE.Matrix4().multiplyMatrices(o.matrixWorld, o.bindMatrixInverse).multiply(o.skeleton.bones[bi].matrixWorld).multiply(o.skeleton.boneInverses[bi]).multiply(o.bindMatrix), Mi = M.clone().invert();
  return { o, box, W, n, toMesh: (p) => p.clone().applyMatrix4(Mi) };
}
// contact shadow under each standing person: one shared soft radial falloff (dense core under the feet, long soft tail) instead of a hard-edged flat disc.
// Drawn first among the transparents (renderOrder -1) so it never covers a decal on the same floor. One more program than the flat disc (a textured basic material).
// The falloff texture is made once (on a private random stream: three draws Math.random for every texture's uuid, and seeded test / golden-shot runs must
// not shift); each person still gets their own small geometry + material as before, so the page's Math.random stream is exactly what it was.
let blobTex;
function blobMat() {
  if (blobTex === undefined) blobTex = ownRandom(() => { const N = 64, c = typeof document !== 'undefined' ? document.createElement('canvas') : null; if (!c) return null;
    c.width = c.height = N; const x = c.getContext('2d'), img = x.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let i = 0; i < N; i++) { const dx = (i + 0.5) / N * 2 - 1, dy = (y + 0.5) / N * 2 - 1, a = Math.max(0, 1 - Math.hypot(dx * 1.06, dy * 0.94)); img.data[(y * N + i) * 4 + 3] = Math.round(255 * (0.65 * Math.pow(a, 1.5) + 0.35 * Math.pow(a, 5))); }
    x.putImageData(img, 0, 0); return new THREE.CanvasTexture(c); });
  return new THREE.MeshBasicMaterial({ color: 0x000000, map: blobTex, transparent: true, opacity: blobTex ? 0.85 : 0.38, depthWrite: false });
}
// Skin albedo in a plausible range: the palette's fair tones are 0.54 / 0.66 linear luminance (paper white is ~0.8), which under the deck's hemisphere + GI +
// room lamp left nothing for shading to work with (a chalk-white, formless face in the talk close-up). Real skin runs ~0.05 (very dark) to ~0.4 (very fair):
// above SKIN_KNEE the luminance is compressed (hue and saturation kept), so the fair tones stay in order but land at 0.32-0.40; mid and dark tones are untouched.
const SKIN_KNEE = 0.26, SKIN_SLOPE = 0.35;
export function skinAlbedo(c) { const L = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; if (L > SKIN_KNEE) c.multiplyScalar((SKIN_KNEE + (L - SKIN_KNEE) * SKIN_SLOPE) / L); return c; }
// run fn with Math.random swapped for a private generator (for one-off allocations whose three.js uuids must not consume the page's seeded stream)
function ownRandom(fn) { const R = Math.random; let s = 0x51ed27; Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; try { return fn(); } finally { Math.random = R; } }
export function makeHuman(opts = {}) {
  const per = opts.person; let seed = opts.seed;
  if (seed === undefined && per) { seed = (per.id + 1) * 7919; for (const ch of (per.family || '') + (per.given || '')) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619); }
  const rnd = seed !== undefined ? mulberry32(seed >>> 0) : (opts.rnd || Math.random);   // a roster member looks the same every time they are built
  const kind = opts.kind || per?.body || pickOf(CREW_KINDS, rnd); const src = get(kind); if (!src) return null;
  const inf = info(kind); const inner = clone(src.scene);
  const g = new THREE.Group(); const height = opts.height || (kind === 'crew_m' ? 1.74 + rnd() * 0.1 : kind === 'crew_heavy' ? 1.92 + rnd() * 0.08 : kind === 'suit' ? 1.9 : 1.6 + rnd() * 0.12);
  inner.scale.setScalar(height / inf.height); g.add(inner);
  const skin = skinAlbedo(new THREE.Color(opts.skin ?? pickOf(SKINS, rnd))); if (opts.pale) skin.lerp(new THREE.Color(0xb9b3a4), opts.pale);
  const hair = opts.hair || pickOf(HAIRS, rnd); const uniform = new THREE.Color(opts.uniform ?? pickOf(DIVISIONS, rnd));
  const style = opts.style ?? pickOf(['plain', 'plain', 'duty', 'duty', 'trim', 'yoke', 'trim-duty'], rnd);   // uniform variants (see styleGarment)
  const faces = []; const mats = {};
  inner.traverse(o => {
    if (!o.isMesh) return; o.frustumCulled = false; o.castShadow = !opts.material;
    if (o.morphTargetDictionary) faces.push(o);
    const name = o.material.name || '';
    if (opts.material) { o.material = opts.material; if (name === 'eyelashes' || name === 'tongue') o.visible = false; return; }
    const m = o.material = o.material.clone(); mats[name.split('_')[0]] = m;
    if (name === 'body' && kind !== 'suit') { m.color.copy(skin); m.roughness = 0.58; m.emissive = skin.clone().multiply(new THREE.Color(0.9, 0.35, 0.25)); m.emissiveIntensity = opts.slime ? 0.07 : 0.035;   // a little warmth in the shade (the wrap-light SSS in skinShader does the rest)
      if (!opts.slime && !opts.material) mats.skinU = skinShader(m, { wound: Math.min(1, (opts.bloody || 0) * 0.9), seed: rnd() * 40, pale: opts.pale || 0 });
      if (opts.slime) { m.color.set(0x4f9a52); m.roughness = 0.18; m.emissive = new THREE.Color(0x0c5a1c); m.emissiveIntensity = 0.7; } }
    else if (name === 'hair') { m.color.setRGB(hair[0], hair[1], hair[2]); m.alphaTest = 0.35; m.alphaToCoverage = true; m.transparent = false; m.side = THREE.DoubleSide; m.roughness = 0.7;   // alpha to coverage: soft card edges under MSAA (High's post buffer / the canvas), a plain alpha test without it
      hairShader(m, crownOf(kind)); }
    else if (name === 'brows') { m.color.setRGB(hair[0] * 0.6, hair[1] * 0.6, hair[2] * 0.6); m.alphaTest = 0.02; m.transparent = true; m.depthWrite = false; m.roughness = 0.8; o.castShadow = false; }
    else if (name.startsWith('garment') && !name.includes('shoes')) { m.color.copy(uniform); m.roughness = 0.9; if (opts.bloody && m.map?.image) m.map = bloodyMap(m.map, 10 + opts.bloody * 40); if (o.geometry.attributes.zone) styleGarment(m, style, uniform); }
    else if (name.includes('shoes')) { m.color.set(0x2a2a2e); m.roughness = 0.5; eyeShader(m, NO_EYES, 0); }   // shares the eyes' program, glint off
    else if (name === 'tongue') eyeShader(m, eyesOf(kind), 0);   // shares the eyes' program, glint off
    else if (name === 'eyes') { m.roughness = 0.08; m.color.setScalar(0.82); eyeShader(m, eyesOf(kind));   // sclera ~0.7 albedo, not paper white (it read as glowing against the face)
      if (opts.bloody) { m.emissive = new THREE.Color(0x601008); m.emissiveIntensity = 0.6; } if (opts.slime) { m.emissive = new THREE.Color(0x30ff60); m.emissiveIntensity = 1.6; } }
    else if (name === 'teeth') { m.alphaTest = 0.5; m.color.setScalar(0.62); }   // teeth sit in the mouth's shade (nothing occludes them here): full white they glowed in the close-up, most of all on dark skin
    else if (name === 'eyelashes') { m.color.copy(skin).multiplyScalar(0.18); m.roughness = 0.75; }   // the lash meshes are solid strips (no alpha card): near-black (the GLB's 0.012) they read as heavy eyeliner rings in the close-up; a deep shade of the skin keeps the lid line without the ink
    if (opts.tint) m.color.multiply(new THREE.Color(opts.tint));
  });
  if (!opts.material && kind !== 'suit' && opts.kit !== false) addKit(kind, inner, height, uniform, opts.name ?? per?.family ?? '');
  if (opts.rank !== undefined && !opts.material && kind !== 'suit') { addPips(inner, opts.rank); g.userData.rank = RANKS[opts.rank][0]; }
  if (kind !== 'suit' && !opts.height) {   // build: lean / average / stocky, a little taller or shorter, so a crowd of four meshes does not read as four people
    const BUILD = [[0.92, 0.95, 1.02], [1, 1, 1], [1, 1, 1], [1.1, 1.08, 0.98], [1.04, 1.02, 1.0], [0.96, 0.97, 1.05]], [wx, wz, hy] = pickOf(BUILD, rnd), b = 0.97 + rnd() * 0.07;
    inner.scale.x *= wx * b; inner.scale.z *= wz * b * (0.98 + rnd() * 0.04); inner.scale.y *= hy; }
  if (opts.shadow !== false) { const bs = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), blobMat()); bs.rotation.x = -Math.PI / 2; bs.position.y = 0.02; bs.renderOrder = -1; g.add(bs); g.userData.blob = bs; }
  const mixer = new THREE.AnimationMixer(inner); const acts = {}; let cur = null, curKey = '';
  const bones = {}; for (const n of ['Head', 'neck_01', 'spine_02', 'spine_03', 'hand_r', 'hand_l', 'lowerarm_r', 'lowerarm_l', 'upperarm_r', 'upperarm_l', 'clavicle_l', 'clavicle_r', 'thigh_l', 'thigh_r', 'foot_l', 'foot_r', 'pelvis']) bones[n] = inner.getObjectByName(n);
  const H = {
    kind, inner, mixer, bones, mats, height, faceW: {}, lookYaw: 0, lookPitch: 0,
    has: (k) => !!inf.clips[k],
    play(key, { loop = true, fade = 0.25, speed = 1, restart = false } = {}) {
      const clip = inf.clips[key]; if (!clip) return;
      const a = acts[key] || (acts[key] = mixer.clipAction(clip));
      if (curKey === key && !restart) { a.timeScale = speed; return; }
      a.reset(); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = !loop; a.timeScale = speed; a.enabled = true;
      if (cur && cur !== a) { a.crossFadeFrom(cur, fade, false); } a.play(); cur = a; curKey = key;
    },
    get current() { return curKey; },
    pose(key, at = 1) { mixer.stopAllAction(); cur = null; curKey = ''; H.play(key, { loop: false, fade: 0 }); const d = inf.clips[key].duration; mixer.setTime(d * at - 0.001); },
    face(w) { Object.assign(H.faceW, w); for (const m of faces) for (const k in H.faceW) { const i = m.morphTargetDictionary[k]; if (i !== undefined) m.morphTargetInfluences[i] = H.faceW[k]; } },
    update(dt) {
      mixer.update(dt); holoTime.value = performance.now() / 1000;
      if (H.add) for (const n in H.add) { const b = bones[n]; if (b) { const r = H.add[n]; if (r[0]) b.rotateX(r[0]); if (r[1]) b.rotateY(r[1]); if (r[2]) b.rotateZ(r[2]); } }   // additive gesture layer from js/movement.js
      if (H.lookYaw || H.lookPitch) { const b = bones.Head; if (b) { b.rotateY(H.lookYaw * 0.6); b.rotateX(H.lookPitch); } const n = bones.neck_01; if (n) n.rotateY(H.lookYaw * 0.4); }
    },
  };
  g.userData.human = H; H.play('idle', { fade: 0 }); mixer.update(rnd() * 3);
  return g;
}

// blink + small idle expression; call each frame for living, friendly humans
export function liveFace(H, t, seed = 0) { idleFace(H, t, seed); }   // varied blinks + brow / lid coupling + eye darts (js/faceanim.js)

// ---- ready-made NPCs (return null when the models failed to load so callers can fall back) ----
// person (optional): a member of the ship's complement from js/crew.js — { body, rank, uniform }
export function makeSurvivor(rnd = Math.random, person = null) {
  const g = makeHuman(person ? { rnd, person, kind: person.body, rank: person.rank, uniform: person.uniform } : { rnd, rank: Math.floor(rnd() * rnd() * 6.99) }); if (!g) return null; const H = g.userData.human;
  const pose = pickOf(['idle', 'idle', 'idle_talking', 'crouch_idle', 'sitting_idle', 'idle_torch'], rnd);
  H.play(pose, { fade: 0 }); H.standing = pose.startsWith('idle'); H.face({ LeftInnerBrowUp: 0.8, RightInnerBrowUp: 0.8 });
  return g;
}
// corpses: on their back (end of death01), face-down, or slumped where they sat down
export function makeCorpse(rnd = Math.random, person = null, pose = null) {
  const g = makeHuman({ rnd, person, bloody: 1, pale: 0.5, shadow: false, rank: person ? person.rank : Math.floor(rnd() * 4), kind: person ? person.body : pickOf([...CREW_KINDS, 'crew_heavy'], rnd), ...(person ? { uniform: person.uniform } : {}) }); if (!g) return null; const H = g.userData.human;
  pose = pose || pickOf(['back', 'back', 'facedown', 'facedown', 'slumped'], rnd); g.userData.pose = pose;
  const B = (n) => H.inner.getObjectByName(n);
  if (pose === 'slumped') {
    H.pose('sitting_idle', 1); H.mixer.setTime(4 + rnd() * 2);   // past the cross-fade from idle
    for (const [n, x, z] of [['spine_01', 0.3, 0.1], ['spine_02', 0.3, 0.08], ['spine_03', 0.25, 0.1], ['neck_01', 0.45, 0.2], ['Head', 0.35, -0.25]]) { const b = B(n); if (b) { b.rotateX(x); b.rotateZ(z * (rnd() < 0.5 ? -1 : 1)); } }
    for (const n of ['upperarm_l', 'upperarm_r']) B(n)?.rotateX(0.25 + rnd() * 0.3);
    const rest = get(H.kind).scene; for (const n of ['calf_l', 'calf_r', 'foot_l', 'foot_r']) { const b = B(n), r = rest.getObjectByName(n); if (b && r) b.quaternion.copy(r.quaternion); }   // legs straight out: sitting on the deck, not on a chair
    B('calf_l')?.rotateX(0.12); B('thigh_r')?.rotateZ(0.18);
  } else {
    H.pose('death01', 0.86 + rnd() * 0.14); H.mixer.update(0);
  }
  H.face({ JawDrop: 0.3 + rnd() * 0.5, LeftUpperLidClosed: rnd(), RightUpperLidClosed: rnd() });
  // settle the body on the deck: roll it over for the face-down pose, then drop the lowest skinned point to the floor
  H.inner.updateMatrixWorld(true); const pel = B('pelvis').getWorldPosition(new THREE.Vector3());
  if (pose === 'facedown') {
    const head = B('Head').getWorldPosition(new THREE.Vector3()), axis = head.sub(pel).setY(0).normalize(), q = new THREE.Quaternion().setFromAxisAngle(axis, Math.PI + (rnd() - 0.5) * 0.3);
    const piv = new THREE.Group(); piv.position.copy(pel); g.add(piv); piv.attach(H.inner); piv.quaternion.copy(q); piv.updateMatrixWorld(true);
  }
  let lowY = Infinity; const v = new THREE.Vector3();
  H.inner.traverse(o => { if (!o.isSkinnedMesh || !/^(body|garment)/.test(o.material.name || '')) return; o.skeleton.update(); const n = o.geometry.attributes.position.count; for (let i = 0; i < n; i += 7) { o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld); if (v.y < lowY) lowY = v.y; } });
  if (isFinite(lowY)) (H.inner.parent === g ? H.inner : H.inner.parent).position.y -= lowY - 0.015;
  g.rotation.y = rnd() * 6.28; return g;
}
// a Slimeling wearing someone: the tell is small — eyes that catch the light green, skin a little too glossy, a bead of slime at the nape
let tellMat = null;
export function markImpostor(g) {
  const H = g?.userData?.human; if (!H || g.userData.impostor) return; g.userData.impostor = true;
  if (H.mats.eyes) { H.mats.eyes.emissive = new THREE.Color(0x30ff60); H.mats.eyes.emissiveIntensity = 0.22; }
  if (H.mats.body) { H.mats.body.roughness = 0.4; H.mats.body.color.lerp(new THREE.Color(0x9ab58a), 0.12); }
  tellMat = tellMat || new THREE.MeshStandardMaterial({ color: 0x4f9a52, roughness: 0.12, emissive: 0x0c5a1c, emissiveIntensity: 0.6 });
  H.inner.updateMatrixWorld(true); const neck = H.bones.neck_01; if (!neck) return;
  const p = neck.getWorldPosition(new THREE.Vector3()), s = H.height / 1.75, gw = g.matrixWorld.clone().invert();
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.016 * s, 8, 6), tellMat); b.scale.set(1, 1.7, 0.6); b.position.copy(p).applyMatrix4(gw); b.position.z -= 0.062 * s; b.position.y += 0.005 * s; b.castShadow = false;
  g.add(b); neck.attach(b);
}
export function makeMedHolo() {
  const g = makeHuman({ kind: 'crew_f2', height: 1.7, material: holoMaterial(0x6ad8ff, 0.8), shadow: false }); if (!g) return null;
  g.userData.human.play('idle_talking', { fade: 0 }); g.userData.human.standing = true; return g;
}
