// Rigged human characters (MakeHuman-based CC0 meshes from the dramatis3d samples) driven by Quaternius' Universal
// Animation Library (CC0). Both share one rest pose, so every clip plays on every body. See CREDITS.md.
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { has, get } from './assets.js';
import { RANKS, mulberry32 } from './data.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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

/**
 * opts: kind, height, uniform (hex), skin (hex), hair ([r,g,b] multiplier), material (override, e.g. hologram),
 *       bloody (0..1), pale (0..1), slime (bool), tint (hex multiply on everything), shadow (blob), rnd,
 *       person (roster member: fixes the look per person and puts their name on the plate), seed, name, kit (false = no badges/belt)
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
  if (opts.shadow !== false) { const bs = new THREE.Mesh(new THREE.CircleGeometry(0.42, 14), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false })); bs.rotation.x = -Math.PI / 2; bs.position.y = 0.02; g.add(bs); g.userData.blob = bs; }
  const mixer = new THREE.AnimationMixer(inner); const acts = {}; let cur = null, curKey = '';
  const bones = {}; for (const n of ['Head', 'neck_01', 'spine_02', 'spine_03', 'hand_r', 'hand_l', 'lowerarm_r', 'lowerarm_l', 'upperarm_r', 'pelvis']) bones[n] = inner.getObjectByName(n);
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
