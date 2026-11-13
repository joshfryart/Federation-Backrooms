// Rigged human characters (MakeHuman-based CC0 meshes from the dramatis3d samples) driven by Quaternius' Universal
// Animation Library (CC0). Both share one rest pose, so every clip plays on every body. See CREDITS.md.
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { has, get } from './assets.js';
import { RANKS, mulberry32 } from './data.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toBones } from './movement.js';

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
  return meta[kind] = { height: box.max.y - box.min.y, clips };
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
  return kitMat.plate[key] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.3, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.12 });
}
function addKit(kind, inner, height, uniform, name) {
  const geo = fitKit(kind, inner, height); if (!pipMats) pipSetup();
  kitMat.belt = kitMat.belt || new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide });
  const ck = uniform.getHex(), board = kitMat.board[ck] || (kitMat.board[ck] = new THREE.MeshStandardMaterial({ vertexColors: true, color: uniform.clone().lerp(new THREE.Color(0x101014), 0.55), roughness: 0.7, metalness: 0.2 }));
  const put = (g, mat, bone) => { if (!g) return; const m = new THREE.Mesh(g, mat); m.castShadow = false; m.frustumCulled = false; inner.add(m); inner.updateMatrixWorld(true); inner.getObjectByName(bone)?.attach(m); };
  put(geo.gold, pipMats.gold, 'spine_03'); put(geo.plate, plateMat(name), 'spine_03'); put(geo.boards, board, 'spine_03'); put(geo.belt, kitMat.belt, 'pelvis');
}

// ---- rank pips: solid = gold disc, hollow = dark disc with a gold rim; pinned to the collar (wearer's right) ----
let pipGeo = null, pipMats = null;
function pipSetup() {
  pipGeo = { disc: new THREE.CylinderGeometry(0.0062, 0.0062, 0.003, 14), rim: new THREE.TorusGeometry(0.0062, 0.0017, 6, 16) };
  pipMats = { gold: new THREE.MeshStandardMaterial({ color: 0xe2b23a, metalness: 1, roughness: 0.22, emissive: 0x8a6510, emissiveIntensity: 0.9 }), dark: new THREE.MeshStandardMaterial({ color: 0x15161a, metalness: 0.6, roughness: 0.4 }) };
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
export function skinShader(m, { wound = 0, seed = 0, pale = 0, freck = 1, flush = 0 } = {}) {
  const u = { uWound: { value: wound }, uSeed: { value: seed }, uPale: { value: pale }, uFreck: { value: freck }, uFlush: { value: flush }, uBlob: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] } };   // uBlob: bite / gash centres (object space xyz, radius w; w = 0 is off)
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj; uniform float uWound, uSeed, uPale, uFreck, uFlush; uniform vec4 uBlob[3];\n' + SKIN_GLSL + 'float gWound = 0.0, gH = 0.0;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 q = vObj * 9.0 + uSeed;
        float mot = sh_f(q * 0.5), pore = sh_n(vObj * 260.0 + uSeed), freck = smoothstep(0.72, 0.8, sh_n(vObj * 70.0 + uSeed * 1.7));
        float vein = smoothstep(0.47, 0.5, sh_f(vObj * 14.0 + uSeed)) * smoothstep(0.53, 0.5, sh_f(vObj * 14.0 + uSeed));
        diffuseColor.rgb *= 0.9 + 0.2 * mot;
        diffuseColor.rgb *= vec3(1.0, 1.0 - 0.06 * (mot - 0.5), 1.0 - 0.12 * (mot - 0.5));     // blotchy flush
        diffuseColor.rgb *= 1.0 - 0.1 * pore - 0.18 * freck * uFreck;
        diffuseColor.rgb *= mix(vec3(1.0), vec3(1.04, 0.93, 0.91), uFlush * smoothstep(0.3, 0.8, mot));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.86, 1.05), vein * (0.25 + uPale * 0.6));
        float w = sh_f(vObj * 6.5 + uSeed * 3.1); gWound = uWound * smoothstep(0.6, 0.68, w);
        float bruise = uWound * smoothstep(0.52, 0.64, sh_f(vObj * 4.0 + uSeed * 5.3 + 11.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.6, 0.38, 0.5), bruise * 0.6);
        float blobRim = 0.0, blobCore = 0.0;
        for (int i = 0; i < 3; i++) { vec4 b = uBlob[i]; if (b.w > 0.0) { float d = length(vObj - b.xyz) / b.w + 0.28 * (sh_f(vObj * 38.0 + float(i) * 3.7) - 0.5);
          blobCore = max(blobCore, smoothstep(0.8, 0.45, d)); blobRim = max(blobRim, smoothstep(1.9, 0.9, d)); } }
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.3, 0.42), blobRim * 0.7);      // bruised, inflamed ring
        gWound = max(gWound, blobCore);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.17, 0.015, 0.02), gWound);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.06, 0.07), blobCore * 0.35 * sh_n(vObj * 90.0));   // wet flesh glints in the crater
        gH = 0.45 * pore + 0.5 * mot - 1.1 * gWound; }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor * (0.92 + 0.2 * pore_r()), 0.12, gWound);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition); float hx = dFdx(gH), hy = dFdy(gH);
        vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
        vec3 grad = sign(det) * (hx * r1 + hy * r2); normal = normalize(abs(det) * normal - grad * 0.0012); }`)
      .replace('float gWound = 0.0', 'float pore_r(){ return sh_n(vObj * 120.0); }\nfloat gWound = 0.0');
  };
  m.customProgramCacheKey = () => 'skin2';
  m.needsUpdate = true;
  return u;
}

// ---- torn cloth: object-space noise rips holes (vertical claw rakes + patches) and frays the trouser hems, edges stained dark; whatever is under shows through ----
export function tornShader(m, { thr = 0.7, seed = 0, y0 = 0, unit = 1, hem = 0.04 } = {}) {   // unit: object-space length -> body heights (the glb positions are quantised, so it differs per mesh)
  const u = { uTThr: { value: thr }, uTSeed: { value: seed }, uTY0: { value: y0 }, uTH: { value: unit }, uTHem: { value: hem } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj; uniform float uTThr, uTSeed, uTY0, uTH, uTHem;\n' + SKIN_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 q = vObj * uTH;
        float rake = sh_f(vec3(q.x * 7.0, q.y * 2.4, q.z * 7.0) + uTSeed), blot = sh_f(q * 10.0 + uTSeed * 1.7 + 5.0);
        float cut = max(rake - uTThr, blot - uTThr - 0.09);
        float hy = (vObj.y - uTY0) * uTH, hm = uTHem * (0.45 + 1.3 * sh_f(vec3(q.x * 45.0, 0.0, q.z * 45.0) + uTSeed)), low = step(hy, 0.3);
        if (cut > 0.0 || (hm - hy) * low > 0.0) discard;
        float edge = max(smoothstep(-0.04, 0.0, cut), smoothstep(0.014, 0.0, hy - hm) * low);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.012, 0.012), edge * 0.85); }`);
  };
  m.customProgramCacheKey = () => 'torn1'; m.needsUpdate = true; m.side = THREE.DoubleSide;
  return u;
}

// ---- hair styles (the baked hair mesh is one style per body): scalp caps, mohawk, bun, ponytail, afro built from the measured skull ----
export const HAIR_STYLES = ['native', 'buzz', 'bald', 'mohawk', 'bun', 'ponytail', 'afro', 'slick'];
const headMeta = {};
function headFit(kind, inner, u) {
  if (headMeta[kind]) return headMeta[kind];
  const cast = bindSurface(inner, (n, o) => o.material.name === 'body'), sc = inner.scale, hp = inner.getObjectByName('Head').getWorldPosition(new THREE.Vector3());
  const first = (...a) => cast(...a)[0], top = first(hp.x, hp.y + 0.6, hp.z, 0, -1, 0); if (!top) return null;
  const crown = top.p.y, yc = crown - 0.105 * u;
  const hit = (ox, oz, dx, dz) => first(ox, yc, oz, dx, 0, dz);
  const L = hit(hp.x + 0.5, hp.z, -1, 0), R = hit(hp.x - 0.5, hp.z, 1, 0), F = hit(hp.x, hp.z + 0.5, 0, -1), B = hit(hp.x, hp.z - 0.5, 0, 1);
  const w = L && R ? (L.p.x - R.p.x) / 2 : 0.075 * u, cx = L && R ? (L.p.x + R.p.x) / 2 : hp.x, d = F && B ? (F.p.z - B.p.z) / 2 : 0.095 * u, cz = F && B ? (F.p.z + B.p.z) / 2 : hp.z;
  return headMeta[kind] = { cx: cx / sc.x, cy: yc / sc.y, cz: cz / sc.z, rx: w / sc.x, ry: 0.105 * u / sc.y, rz: d / sc.z, crown: crown / sc.y, u };
}
function addHairStyle(kind, inner, height, style, col) {
  const m0 = headFit(kind, inner, height / 1.75); if (!m0 || style === 'native') return;
  const { cx, cy, cz, rx, ry, rz } = m0, s = inner.scale, geos = [];
  const sph = (R, th, k = 1, o = [0, 0, 0]) => { const g = new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, th); g.scale(rx * R * k, ry * R * k * (th > 3 ? 1 : 1.04), rz * R * k); g.translate(cx + o[0], cy + o[1], cz + o[2]); return g; };
  const hu = height / 1.75 / s.y;   // 1 cm-ish unit in inner space
  if (style === 'buzz') geos.push(sph(1.12, 1.55, 1, [0, 0.006 * hu, -0.004 * hu]));
  else if (style === 'slick') geos.push(sph(1.15, 1.62, 1, [0, 0.006 * hu, -0.004 * hu]));
  else if (style === 'afro') geos.push(sph(1.38, 2.05, 1, [0, 0.035 * hu, -0.03 * hu]));
  else if (style === 'bun') { geos.push(sph(1.13, 1.6, 1, [0, 0.006 * hu, -0.004 * hu])); const b = new THREE.SphereGeometry(0.05 * hu, 12, 10); b.translate(cx, cy + ry * 0.9, cz - rz * 0.75); geos.push(b); }
  else if (style === 'ponytail') { geos.push(sph(1.13, 1.62, 1, [0, 0.006 * hu, -0.004 * hu])); const t = new THREE.CylinderGeometry(0.02 * hu, 0.006 * hu, 0.2 * hu, 8, 1); t.rotateX(-0.25); t.translate(cx, cy - ry * 0.35 - 0.09 * hu, cz - rz * 1.18); geos.push(t); const k = new THREE.SphereGeometry(0.026 * hu, 8, 6); k.translate(cx, cy - ry * 0.05, cz - rz * 1.02); geos.push(k); }
  else if (style === 'mohawk') { for (let i = 0; i < 9; i++) { const a = -0.95 + i * 0.22, hgt = (0.032 + 0.03 * Math.sin((i + 0.5) / 9 * Math.PI)) * hu, b = new THREE.BoxGeometry(0.012 * hu, hgt, 0.04 * hu); b.translate(0, hgt / 2, 0); b.rotateX(-a * 0.35); b.translate(cx, cy + ry * 0.98 * Math.cos(a) , cz + rz * 1.0 * Math.sin(a) * 0.92); geos.push(b); } geos.push(sph(1.025, 1.12)); }
  if (!geos.length) return;
  const g = mergeGeometries(geos.map(flat)); const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(...col.map(c => Math.min(1, c * 0.5))).multiplyScalar(style === 'slick' ? 0.8 : 1), roughness: style === 'slick' ? 0.35 : 0.85, metalness: 0 });
  const mesh = new THREE.Mesh(g, mat); mesh.castShadow = false; mesh.frustumCulled = false; inner.add(mesh); inner.updateMatrixWorld(true); inner.getObjectByName('Head').attach(mesh);
}

/**
 * opts: kind, height, uniform (hex), skin (hex), hair ([r,g,b] multiplier), material (override, e.g. hologram),
 *       bloody (0..1), pale (0..1), slime (bool), tint (hex multiply on everything), shadow (blob), rnd,
 *       person (roster member: fixes the look per person and puts their name on the plate), seed, name, kit (false = no badges/belt),
 *       hairStyle (one of HAIR_STYLES; default is drawn per person), torn (0..1 ripped cloth; default 0.7 * bloody), wounds (0..3 bite/gash craters on bare skin; default from bloody), flush / freckles (skin variation overrides)
 */
export function makeHuman(opts = {}) {
  const per = opts.person; let seed = opts.seed;
  if (seed === undefined && per) { seed = (per.id + 1) * 7919; for (const ch of (per.family || '') + (per.given || '')) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619); }
  const rnd = seed !== undefined ? mulberry32(seed >>> 0) : (opts.rnd || Math.random);   // a roster member looks the same every time they are built
  const kind = opts.kind || per?.body || pickOf(CREW_KINDS, rnd); const src = get(kind); if (!src) return null;
  const inf = info(kind); const inner = clone(src.scene);
  const g = new THREE.Group(); const height = opts.height || (kind === 'crew_m' ? 1.74 + rnd() * 0.1 : kind === 'crew_heavy' ? 1.92 + rnd() * 0.08 : kind === 'suit' ? 1.9 : 1.6 + rnd() * 0.12);
  inner.scale.setScalar(height / inf.height); g.add(inner);
  const skin = new THREE.Color(opts.skin ?? pickOf(SKINS, rnd)); if (opts.pale) skin.lerp(new THREE.Color(0xb9b3a4), opts.pale);
  const hair = opts.hair || pickOf(HAIRS, rnd); const uniform = new THREE.Color(opts.uniform ?? pickOf(DIVISIONS, rnd));
  const faces = []; const mats = {};
  inner.traverse(o => {
    if (!o.isMesh) return; o.frustumCulled = false; o.castShadow = !opts.material;
    if (o.morphTargetDictionary) faces.push(o);
    const name = o.material.name || '';
    if (opts.material) { o.material = opts.material; if (name === 'eyelashes' || name === 'tongue') o.visible = false; return; }
    const m = o.material = o.material.clone(); mats[name.split('_')[0]] = m;
    if (name === 'body' && kind !== 'suit') { m.color.copy(skin); m.roughness = 0.58; m.emissive = skin.clone().multiply(new THREE.Color(0.9, 0.35, 0.25)); m.emissiveIntensity = 0.07;   // cheap subsurface warmth
      if (!opts.slime && !opts.material) mats.skinU = skinShader(m, { wound: Math.min(1, (opts.bloody || 0) * 0.9), seed: rnd() * 40, pale: opts.pale || 0 });
      if (opts.slime) { m.color.set(0x4f9a52); m.roughness = 0.18; m.emissive = new THREE.Color(0x0c5a1c); m.emissiveIntensity = 0.7; } }
    else if (name === 'hair') { m.color.setRGB(hair[0], hair[1], hair[2]); m.alphaTest = 0.4; m.transparent = false; m.side = THREE.DoubleSide; m.roughness = 0.75; }
    else if (name === 'brows') { m.color.setRGB(hair[0] * 0.6, hair[1] * 0.6, hair[2] * 0.6); m.alphaTest = 0.02; m.transparent = true; m.depthWrite = false; m.roughness = 0.8; o.castShadow = false; }
    else if (name.startsWith('garment') && !name.includes('shoes')) { m.color.copy(uniform); m.roughness = 0.9; if (opts.bloody && m.map?.image) m.map = bloodyMap(m.map, 10 + opts.bloody * 40); }
    else if (name.includes('shoes')) { m.color.set(0x2a2a2e); m.roughness = 0.5; }
    else if (name === 'eyes') { m.roughness = 0.08; if (opts.bloody) { m.emissive = new THREE.Color(0x601008); m.emissiveIntensity = 0.6; } if (opts.slime) { m.emissive = new THREE.Color(0x30ff60); m.emissiveIntensity = 1.6; } }
    else if (name === 'teeth') { m.alphaTest = 0.5; }
    if (opts.tint) m.color.multiply(new THREE.Color(opts.tint));
  });
  if (!opts.material && kind !== 'suit' && opts.kit !== false) addKit(kind, inner, height, uniform, opts.name ?? per?.family ?? '');
  if (opts.rank !== undefined && !opts.material && kind !== 'suit') { addPips(inner, opts.rank); g.userData.rank = RANKS[opts.rank][0]; }
  if (kind !== 'suit' && !opts.height) { const b = 0.96 + rnd() * 0.09; inner.scale.x *= b; inner.scale.z *= b * (0.98 + rnd() * 0.04); }   // slight build variation
  // ---- extras drawn from their own stream so existing looks (skin, height, build) stay as they were ----
  if (!opts.material) {
    const vr = mulberry32((((seed ?? Math.floor(rnd() * 1e9)) >>> 0) ^ 0x5bd1e995) >>> 0), bm = mats.body;
    if (bm && kind !== 'suit' && !opts.slime) {   // skin variation: warm/cool undertone, lightness, ruddy flush, freckles
      bm.color.offsetHSL((vr() - 0.5) * 0.024, (vr() - 0.5) * 0.14, (vr() - 0.5) * 0.06);
      if (mats.skinU) { mats.skinU.uFlush.value = opts.flush ?? (vr() < 0.3 ? 0.3 + vr() * 0.4 : vr() * 0.2); mats.skinU.uFreck.value = opts.freckles ?? (vr() < 0.25 ? 1.6 + vr() * 0.7 : 0.5 + vr() * 0.6); }
    }
    const style = opts.hairStyle || (kind === 'crew_f2' || kind === 'suit' ? 'native' : (() => { const r = vr(); return r < 0.46 ? 'native' : r < 0.6 ? 'buzz' : r < 0.66 ? 'bald' : r < 0.72 ? 'mohawk' : r < 0.82 ? 'bun' : r < 0.9 ? 'ponytail' : r < 0.95 ? 'afro' : 'slick'; })());
    if (style !== 'native' && kind !== 'suit' && HAIR_STYLES.includes(style)) { addHairStyle(kind, inner, height, style, hair); if (mats.hair) mats.hair.visible = false; inner.traverse(o => { if (o.isMesh && o.material.name === 'hair') o.visible = false; }); g.userData.hairStyle = style; }
    // wounds + torn cloth on the madness / corpse looks
    const bl = opts.bloody || 0, nw = Math.min(3, opts.wounds ?? Math.round(bl * 2.6)), tn = opts.torn ?? bl * 0.7;
    inner.updateMatrixWorld(true);
    const body = []; inner.traverse(o => { if (o.isSkinnedMesh) { if (o.material.name === 'body') body.push(o); } });
        if (nw > 0 && body[0] && mats.skinU && kind !== 'suit') {
      const o = body[0], W = (n) => inner.getObjectByName(n)?.getWorldPosition(new THREE.Vector3()), sites = [], u = height / 1.75;
      const along = (a, b, t, side = 0) => { const A = W(a), B = W(b); if (!A || !B) return null; const p = A.lerp(B, t); p.x += side * 0.02 * u; p.z += 0.025 * u; return p; };
      const pool = [() => along('neck_01', 'Head', 0.12, vr() < 0.5 ? -2 : 2), () => along('lowerarm_l', 'hand_l', 0.4), () => along('lowerarm_r', 'hand_r', 0.45), () => along('upperarm_l', 'lowerarm_l', 0.62, 1), () => along('upperarm_r', 'lowerarm_r', 0.62, -1), () => along('hand_r', 'hand_r', 0), () => along('Head', 'neck_01', 0.15, vr() < 0.5 ? -3 : 3)];
      const pick = []; while (pick.length < nw && pick.length < pool.length) { const i = Math.floor(vr() * pool.length); if (!pick.includes(i)) pick.push(i); }
      if (!pick.includes(0) && vr() < 0.6) pick[0] = 0;   // the throat is the classic
      const sc = o.matrixWorld.getMaxScaleOnAxis(), inv = o.matrixWorld.clone().invert();
      pick.forEach((i, k) => { const p = pool[i](); if (!p) return; p.applyMatrix4(inv); mats.skinU.uBlob.value[k].set(p.x, p.y, p.z, (0.034 + vr() * 0.03) * u / sc); });
    }
    if (tn > 0.05 && kind !== 'suit') inner.traverse(o => { if (!o.isSkinnedMesh) return; const n = o.material.name || ''; if (!n.startsWith('garment') || n.includes('shoes')) return;
      o.geometry.boundingBox || o.geometry.computeBoundingBox(); const gb = o.geometry.boundingBox; mats.tornU = tornShader(o.material, { thr: 0.8 - tn * 0.2, seed: vr() * 40, y0: gb.min.y, unit: o.matrixWorld.getMaxScaleOnAxis() / height, hem: 0.012 + tn * 0.05 }); });
  }
  if (opts.shadow !== false) { const bs = new THREE.Mesh(new THREE.CircleGeometry(0.42, 14), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false })); bs.rotation.x = -Math.PI / 2; bs.position.y = 0.02; g.add(bs); g.userData.blob = bs; }
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
    pose(key, at = 1) { H.play(key, { loop: false, fade: 0 }); const d = inf.clips[key].duration; mixer.setTime(d * at - 0.001); },
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
export function liveFace(H, t, seed = 0) {
  const b = (t * 0.37 + seed) % 1; const lid = b > 0.96 ? 1 : 0;
  H.face({ LeftUpperLidClosed: lid, RightUpperLidClosed: lid });
}

// ---- ready-made NPCs (return null when the models failed to load so callers can fall back) ----
// person (optional): a member of the ship's complement from js/crew.js — { body, rank, uniform }
export function makeSurvivor(rnd = Math.random, person = null) {
  const g = makeHuman(person ? { rnd, person, kind: person.body, rank: person.rank, uniform: person.uniform } : { rnd, rank: Math.floor(rnd() * rnd() * 6.99) }); if (!g) return null; const H = g.userData.human;
  const pose = pickOf(['idle', 'idle', 'idle_talking', 'crouch_idle', 'sitting_idle', 'idle_torch'], rnd);
  H.play(pose, { fade: 0 }); H.standing = pose.startsWith('idle'); H.face({ LeftInnerBrowUp: 0.8, RightInnerBrowUp: 0.8 });
  return g;
}
// a dropped stun-zapper (original chunky pistol shape): lies on the deck by a body, emitter still faintly lit
let zapMats = null;
export function makeDroppedZapper(rnd = Math.random) {
  zapMats = zapMats || { body: new THREE.MeshStandardMaterial({ color: 0x3b4350, roughness: 0.45, metalness: 0.7 }), grip: new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.8, metalness: 0.2 }), glow: new THREE.MeshStandardMaterial({ color: 0x113a44, emissive: 0x28d8ff, emissiveIntensity: 0.9, roughness: 0.3 }) };
  const z = new THREE.Group(), part = (geo, mat, x, y, zz, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, zz); m.rotation.x = rx; m.castShadow = true; z.add(m); return m; };
  part(new THREE.BoxGeometry(0.045, 0.06, 0.2), zapMats.body, 0, 0.03, 0);                       // slide
  part(new THREE.CylinderGeometry(0.014, 0.018, 0.1, 10), zapMats.body, 0, 0.034, 0.145, Math.PI / 2);   // emitter barrel
  part(new THREE.TorusGeometry(0.02, 0.005, 6, 12), zapMats.glow, 0, 0.034, 0.185);              // emitter ring
  part(new THREE.BoxGeometry(0.04, 0.115, 0.05), zapMats.grip, 0, -0.04, -0.06, 0.28);          // grip
  part(new THREE.BoxGeometry(0.012, 0.012, 0.09), zapMats.glow, 0.0235, 0.04, 0.0);            // charge strip
  z.scale.setScalar(1.05); z.userData.prop = 'zapper';
  const hold = new THREE.Group(); hold.add(z); z.rotation.z = rnd() < 0.55 ? Math.PI / 2 : 0; z.position.y = z.rotation.z ? 0.026 : 0.06;   // on its side, or upright on the grip heel
  hold.rotation.y = rnd() * 6.28; return hold;
}
// corpses: on their back (end of death01), face-down, slumped where they sat down, or curled up on their side.
//   g.userData: pose, wallBack (slumped: distance from the origin to the back plane when facing +Z, put a wall that far behind and set rotation.y to face away from it), drop (zapper prop or null)
export const CORPSE_POSES = ['back', 'facedown', 'slumped', 'curled'];
export function makeCorpse(rnd = Math.random, person = null, pose = null, { zapper } = {}) {
  const g = makeHuman({ rnd, person, bloody: 0.85 + rnd() * 0.15, torn: 0.35 + rnd() * 0.65, pale: 0.5, shadow: false, rank: person ? person.rank : Math.floor(rnd() * 4), kind: person ? person.body : pickOf([...CREW_KINDS, 'crew_heavy'], rnd), ...(person ? { uniform: person.uniform } : {}) }); if (!g) return null; const H = g.userData.human;
  pose = pose || pickOf(['back', 'back', 'facedown', 'facedown', 'slumped', 'curled'], rnd); g.userData.pose = pose;
  const B = (n) => H.inner.getObjectByName(n), rest = get(H.kind).scene, flip = rnd() < 0.5 ? -1 : 1;
  if (pose === 'slumped') {
    H.pose('sitting_idle', 1); H.mixer.setTime(4 + rnd() * 2);   // past the cross-fade from idle
    for (const [n, x, z] of [['spine_01', 0.3, 0.1], ['spine_02', 0.3, 0.08], ['spine_03', 0.25, 0.1], ['neck_01', 0.45, 0.2], ['Head', 0.35, -0.25]]) { const b = B(n); if (b) { b.rotateX(x); b.rotateZ(z * flip); } }
    for (const n of ['upperarm_l', 'upperarm_r']) B(n)?.rotateX(0.25 + rnd() * 0.3);
    for (const n of ['calf_l', 'calf_r', 'foot_l', 'foot_r']) { const b = B(n), r = rest.getObjectByName(n); if (b && r) b.quaternion.copy(r.quaternion); }   // legs straight out: sitting on the deck, not on a chair
    B('calf_l')?.rotateX(0.12); B('thigh_r')?.rotateZ(0.18);
  } else if (pose === 'curled') {   // fetal: hunched crouch, knees to chest, arms wrapped round the shins, then rolled onto one side
    H.pose('crouch_idle', 1); H.mixer.setTime(0.5);
    for (const [n, x] of [['spine_01', 0.42], ['spine_02', 0.5], ['spine_03', 0.4], ['neck_01', 0.35], ['Head', 0.3]]) B(n)?.rotateX(x);
    for (const n of ['thigh_l', 'thigh_r']) B(n)?.rotateX(-0.75); for (const n of ['calf_l', 'calf_r']) B(n)?.rotateX(0.55);
    for (const n of ['upperarm_l', 'upperarm_r']) B(n)?.rotateX(0.9 + rnd() * 0.2); for (const n of ['lowerarm_l', 'lowerarm_r']) B(n)?.rotateX(1.5);
    B('upperarm_l')?.rotateZ(0.5); B('upperarm_r')?.rotateZ(-0.5);
  } else {
    H.pose('death01', 0.86 + rnd() * 0.14); H.mixer.update(0);
  }
  H.face({ JawDrop: 0.3 + rnd() * 0.5, LeftUpperLidClosed: rnd(), RightUpperLidClosed: rnd() });
  // settle the body on the deck: roll it over for the face-down / curled poses, then drop the lowest skinned point to the floor
  H.inner.updateMatrixWorld(true); const pel = B('pelvis').getWorldPosition(new THREE.Vector3());
  if (pose === 'facedown') {
    const head = B('Head').getWorldPosition(new THREE.Vector3()), axis = head.sub(pel).setY(0).normalize(), q = new THREE.Quaternion().setFromAxisAngle(axis, Math.PI + (rnd() - 0.5) * 0.3);
    const piv = new THREE.Group(); piv.position.copy(pel); g.add(piv); piv.attach(H.inner); piv.quaternion.copy(q); piv.updateMatrixWorld(true);
  } else if (pose === 'curled') {
    const piv = new THREE.Group(); piv.position.copy(pel); g.add(piv); piv.attach(H.inner); piv.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), flip * (Math.PI / 2 - 0.12)); piv.updateMatrixWorld(true);
  }
  let lowY = Infinity, backZ = Infinity; const v = new THREE.Vector3(); g.updateMatrixWorld(true);
  H.inner.traverse(o => { if (!o.isSkinnedMesh || !/^(body|garment)/.test(o.material.name || '')) return; o.skeleton.update(); const n = o.geometry.attributes.position.count; for (let i = 0; i < n; i += 7) { o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld); if (v.y < lowY) lowY = v.y; if (v.z < backZ) backZ = v.z; } });
  if (isFinite(lowY)) (H.inner.parent === g ? H.inner : H.inner.parent).position.y -= lowY - 0.015;
  g.userData.wallBack = isFinite(backZ) ? -backZ + 0.01 : 0.3;
  // a dropped zapper near the hand that let go of it
  g.userData.drop = null;
  if (zapper ?? rnd() < 0.6) {
    g.updateMatrixWorld(true); const hand = B(rnd() < 0.5 ? 'hand_r' : 'hand_l').getWorldPosition(new THREE.Vector3()), a = rnd() * 6.28, z = makeDroppedZapper(rnd);
    z.position.set(hand.x + Math.sin(a) * 0.3, 0, hand.z + Math.cos(a) * 0.3); if (pose === 'slumped') z.position.z = Math.max(z.position.z, hand.z + 0.1); g.add(z); g.userData.drop = z;
  }
  g.rotation.y = rnd() * 6.28; return g;
}

// ---- Space-Madness: shamble / lurch / spasm / lunge-and-bite as an additive bone layer over the stock UAL clips (walk, jog, sprint, idle). ----
// Call every frame after the clip is chosen:  madness(H, t, { attacking })  — it fills H.add (consumed by H.update) and drives the jaw.
// For js/enemies.js:  humanModel(opts, { ...MADNESS_CFG, face: CRAZED_FACE }, …)  (its tick → madness; attack clip is 'idle' so the lunge layer owns the pose).
const sstep = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
export function madness(H, t, f = {}) {
  const S = H.mad || (H.mad = { ph: Math.random() * 6.28, atk: -1, last: t, dir: 1 });
  const dt = Math.min(0.1, Math.max(0, t - S.last)); S.last = t; const ph = S.ph;
  const run = /^(sprint|jog_fwd)$/.test(H.current), still = H.current === 'idle' || H.current === 'crouch_idle', k = run ? 0.45 : 1;
  if (f.attacking) S.atk = S.atk < 0 ? 0 : S.atk + dt; else S.atk = -1;
  const spasm = Math.max(0, Math.sin(t * 11.3 + ph) * Math.sin(t * 2.7 + ph * 2) - 0.55) * 2.2;    // brief violent twitches
  if (spasm > 0.4) S.dir = Math.sin(t * 7.1 + ph) > 0 ? 1 : -1;
  const lurch = Math.pow(0.5 + 0.5 * Math.sin(t * 3.1 + ph), 2);                                          // gait surges and stalls
  if (H.mixer.timeScale > 0 && !still) H.mixer.timeScale = run ? 1 : 0.6 + 0.75 * lurch;
  const ch = {
    waist_bow: 0.2 * k + 0.1 * lurch, spine_bow: 0.12 * k, spine_lean: 0.06 + 0.1 * Math.sin(t * 1.3 + ph), spine_twist: 0.18 * Math.sin(t * 2.6 + ph * 2) * k,
    pelvis_roll: 0.07 * Math.sin(t * 3.4 + ph) * k, neck_tilt: 0.12, head_tilt: 0.24 + 0.1 * Math.sin(t * 3.1 + ph) + spasm * 0.25 * S.dir, head_turn: 0.45 * Math.sin(t * 1.7 + ph) + spasm * 0.55 * S.dir, head_nod: 0.1 + 0.08 * Math.sin(t * 4.3 + ph),
    arm_fwd_r: 0.3 + 0.1 * Math.sin(t * 2 + ph), elbow_r: 0.85, wrist_r: 0.5 * Math.sin(t * 5.1 + ph), shrug_r: 0.2 + spasm * 0.2,        // right arm hangs hooked and limp
    arm_fwd_l: 0.55 + 0.4 * Math.sin(t * 1.5 + ph + 1) + spasm * 0.3, elbow_l: 0.7, arm_out_l: 0.15, wrist_l: 0.4 * Math.sin(t * 6.3 + ph),    // left arm gropes forward
  };
  let jaw = 0.3 + 0.35 * Math.abs(Math.sin(t * 4 + ph)) + spasm * 0.3;
  if (S.atk >= 0) {   // lunge: rear back and gape, throw the body forward with both hands out to grab, then snap and thrash
    const a = S.atk, wind = sstep(0, 0.16, a) * (1 - sstep(0.2, 0.3, a)), hit = sstep(0.2, 0.34, a), thrash = hit * Math.sin(a * 40);
    ch.waist_bow = -0.2 * wind + 0.65 * hit; ch.spine_bow = -0.22 * wind + 0.35 * hit; ch.head_nod = -0.4 * wind + 0.5 * hit; ch.head_tilt = 0.3 * hit; ch.head_turn = thrash * 0.4; ch.spine_twist = 0;
    const w = Math.max(wind * 0.55, hit); ch.arm_fwd_l = 0.5 + 1.1 * w; ch.arm_fwd_r = 0.3 + 1.25 * w; ch.elbow_l = 0.7 - 0.45 * w; ch.elbow_r = 0.85 - 0.6 * w; ch.arm_out_l = 0.15 + 0.35 * wind; ch.arm_out_r = -0.35 * wind; ch.wrist_l = thrash * 0.4; ch.wrist_r = -thrash * 0.4;
    jaw = wind * 1 + hit * (0.08 + 0.3 * Math.abs(Math.sin(a * 30)));
  }
  H.add = toBones(ch, 1); H.face({ JawDrop: Math.min(1, jaw) });
  return S.atk >= 0;
}
export const MADNESS_CFG = { attack: 'idle', attackSpeed: 1, tick: (mesh, H, t, f) => madness(H, t, f) };

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
