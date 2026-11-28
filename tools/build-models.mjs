// Model pass on the four crew body GLBs (assets/models/crew_m / crew_f / crew_f2 / crew_heavy.glb): scripted geometry edits, re-runnable.
//   node tools/build-models.mjs [--base <git rev>] [--only crew_m,...] [--dry] [--out DIR]      (prints one JSON stats line per body)
// The SOURCE of every run is the original GLB as committed at --base (default BASE below, via `git show`), never the file on disk, so running it twice
// gives the same output. Needs the meshoptimizer npm package (the GLBs are EXT_meshopt_compression + KHR_mesh_quantization):
//   npm i --prefix /tmp/model-tools meshoptimizer@0.22.0      (or set MODEL_TOOLS=<dir with node_modules/meshoptimizer>)
// No Blender: a tiny GLB reader / writer (meshopt decode, edit the quantised accessors, meshopt re-encode only what changed) and pure-JS geometry.
//
// Edits per body (all in the rest pose, world metres; written back into each mesh's own quantised space):
//   (the source bodies are already trimmed to head, neck, hands and a little arm / spine skin: nothing hidden is left to remove)
//   1. body  : the bare face / ears / jaw / neck triangles whose flat facets sit furthest off the smooth surface (REFINE_TRIS per kind) refined once
//              (1 -> 4, Phong tessellation of the new edge points from the smooth normals, red-green closure so no T-junction cracks; open
//              borders - eyelid margins, lips - stay straight). New vertices interpolate skin weights, normals and all 15 expression morph deltas
//              from the edge ends. Original vertices never move (landmarks, lids and eyeballs still meet).
//   3. body  : COLOR_0 hairline shade: skin under the hair darkened, a soft ~2 cm falloff past the hairline (humans.js info() multiplies it into its
//              undershirt paint): the hair mask edge no longer cuts straight onto bare forehead colour
//   4. hair  : crew_heavy's buzz cut: the curl cards that stood off the hair shell like fins (edge-on they caught the strand highlight: the white
//              cracks) laid down onto the shell. (The other hair meshes are closed shells already: no scalp gaps to cover.)
//   5. teeth : 7120 -> ~1900-2300 triangles (js/meshlod.js half-edge collapse: original vertices kept, so uvs / weights / the morph are exact)
//   6. lashes: strips pulled 35% toward the lid margin (a thinner lid line)
//   7. garments: the uniform's GARMENT_TRIS worst facets refined the same way (sleeves, collar, shoulders, trouser legs; uvs interpolated per seam
//              side). OFF (0): at 1200 it added ~2300 vertices a body and, with REFINE_TRIS 900, boarding (91 software-GL portraits) got ~0.9 s slower.
// Budget knobs: REFINE_TRIS / GARMENT_TRIS / the teeth ratio. Boarding cost follows body vertices most (every body vertex fetches its active morphs).
// Preserved: skeleton, bone names, skins, every morph target name and count, material / mesh names, uv layouts, images.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from '../vendor/three.module.js';
import { simplifyIndex } from '../js/meshlod.js';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const BASE = opt('base', '221e12f'), KINDS = (opt('only', 'crew_m,crew_f,crew_f2,crew_heavy')).split(','), OUT = resolve(ROOT, opt('out', 'assets/models')), DRY = argv.includes('--dry');
const TOOLS = process.env.MODEL_TOOLS || '/tmp/model-tools';
const mo = (f) => pathToFileURL(join(TOOLS, 'node_modules/meshoptimizer', f)).href;
if (!existsSync(join(TOOLS, 'node_modules/meshoptimizer'))) { console.error(`meshoptimizer not found in ${TOOLS}: npm i --prefix ${TOOLS} meshoptimizer@0.22.0`); process.exit(2); }
const { MeshoptDecoder } = await import(mo('meshopt_decoder.module.js')), { MeshoptEncoder } = await import(mo('meshopt_encoder.module.js'));
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const sharp = createRequire(import.meta.url)('sharp');

// ------------------------------------------------------------------------------------------------ GLB io
const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }, NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function readGlb(buf) {
  const jl = buf.readUInt32LE(12), J = JSON.parse(buf.subarray(20, 20 + jl).toString()), bl = buf.readUInt32LE(20 + jl), bin = buf.subarray(28 + jl, 28 + jl + bl);
  const views = J.bufferViews.map(bv => {   // decoded bytes of every view
    const ext = bv.extensions?.EXT_meshopt_compression;
    if (!ext) return new Uint8Array(bin.buffer, bin.byteOffset + (bv.byteOffset || 0), bv.byteLength).slice();
    const out = new Uint8Array(ext.count * ext.byteStride), src = new Uint8Array(bin.buffer, bin.byteOffset + (ext.byteOffset || 0), ext.byteLength);
    MeshoptDecoder.decodeGltfBuffer(out, ext.count, ext.byteStride, src, ext.mode, ext.filter); return out;
  });
  return { J, bin, views };
}
// accessor -> plain typed array of its raw (quantised) components, tightly packed
function acc(G, i) {
  const a = G.J.accessors[i], bv = G.J.bufferViews[a.bufferView], n = NC[a.type], T = CT[a.componentType], es = T.BYTES_PER_ELEMENT, st = bv.byteStride || n * es, v = G.views[a.bufferView];
  const dv = new DataView(v.buffer, v.byteOffset, v.byteLength), out = new T(a.count * n), get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = dv[get]((a.byteOffset || 0) + k * st + c * es, true);
  return out;
}
const pad4 = (n) => (n + 3) & ~3;
// new accessor (data: typed array of raw components); vertex attributes get 4-byte aligned strides, indices TRIANGLES mode
function addAcc(G, data, type, componentType, { normalized = false, index = false, minmax = false } = {}) {
  const n = NC[type], T = CT[componentType], es = T.BYTES_PER_ELEMENT, count = data.length / n, st = index ? es : pad4(n * es);
  const raw = new Uint8Array(count * st), dv = new DataView(raw.buffer), set = { 5120: 'setInt8', 5121: 'setUint8', 5122: 'setInt16', 5123: 'setUint16', 5125: 'setUint32', 5126: 'setFloat32' }[componentType];
  for (let k = 0; k < count; k++) for (let c = 0; c < n; c++) dv[set](k * st + c * es, data[k * n + c], true);
  G.newViews = G.newViews || []; const vi = G.J.bufferViews.length;
  G.J.bufferViews.push({ buffer: 1, byteLength: raw.length, ...(index ? { target: 34963 } : { target: 34962, byteStride: st }) }); G.views.push(raw); G.newViews.push({ vi, raw, count: index ? count : count, st, mode: index ? 'TRIANGLES' : 'ATTRIBUTES' });
  const a = { bufferView: vi, byteOffset: 0, componentType, count, type, normalized };
  if (minmax) { const mn = Array(n).fill(Infinity), mx = Array(n).fill(-Infinity); for (let k = 0; k < count; k++) for (let c = 0; c < n; c++) { mn[c] = Math.min(mn[c], data[k * n + c]); mx[c] = Math.max(mx[c], data[k * n + c]); } a.min = mn; a.max = mx; }
  G.J.accessors.push(a); return G.J.accessors.length - 1;
}
// write: drop unreferenced accessors / views, re-encode the new views, copy the old compressed payloads as they are
function writeGlb(G) {
  const J = G.J, usedA = new Set(), mark = (i) => { if (i !== undefined) usedA.add(i); };
  for (const m of J.meshes) for (const p of m.primitives) { Object.values(p.attributes).forEach(mark); mark(p.indices); for (const t of p.targets || []) Object.values(t).forEach(mark); }
  for (const s of J.skins) mark(s.inverseBindMatrices);
  const aMap = new Map(), accessors = []; J.accessors.forEach((a, i) => { if (usedA.has(i)) { aMap.set(i, accessors.length); accessors.push(a); } });
  const remapA = (i) => aMap.get(i);
  for (const m of J.meshes) for (const p of m.primitives) { for (const k in p.attributes) p.attributes[k] = remapA(p.attributes[k]); if (p.indices !== undefined) p.indices = remapA(p.indices); for (const t of p.targets || []) for (const k in t) t[k] = remapA(t[k]); }
  for (const s of J.skins) s.inverseBindMatrices = remapA(s.inverseBindMatrices);
  const usedV = new Set(accessors.map(a => a.bufferView)); (J.images || []).forEach(im => usedV.add(im.bufferView));
  const vMap = new Map(), views = [], chunks = []; let off0 = 0, off1 = 0; const nv = new Map((G.newViews || []).map(x => [x.vi, x]));
  const put = (bytes) => { const o = off0; chunks.push(bytes); const p = pad4(bytes.length); if (p > bytes.length) chunks.push(new Uint8Array(p - bytes.length)); off0 += p; return o; };
  J.bufferViews.forEach((bv, i) => {
    if (!usedV.has(i)) return; vMap.set(i, views.length);
    const ext = bv.extensions?.EXT_meshopt_compression, fresh = nv.get(i);
    if (fresh) {
      const enc = MeshoptEncoder.encodeGltfBuffer(fresh.raw, fresh.mode === 'TRIANGLES' ? fresh.count : fresh.count, fresh.st, fresh.mode);
      const o = put(enc); const v = { buffer: 1, byteOffset: off1, byteLength: fresh.raw.length, target: bv.target, ...(bv.byteStride ? { byteStride: bv.byteStride } : {}), extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: o, byteLength: enc.length, mode: fresh.mode, byteStride: fresh.st, count: fresh.count } } };
      off1 += pad4(fresh.raw.length); views.push(v);
    } else if (ext) {
      const o = put(new Uint8Array(G.bin.buffer, G.bin.byteOffset + (ext.byteOffset || 0), ext.byteLength));
      const v = JSON.parse(JSON.stringify(bv)); v.byteOffset = off1; v.extensions.EXT_meshopt_compression.byteOffset = o; off1 += pad4(bv.byteLength); views.push(v);
    } else { const o = put(new Uint8Array(G.bin.buffer, G.bin.byteOffset + (bv.byteOffset || 0), bv.byteLength)); const v = { ...bv, byteOffset: o }; views.push(v); }
  });
  accessors.forEach(a => { a.bufferView = vMap.get(a.bufferView); }); (J.images || []).forEach(im => { im.bufferView = vMap.get(im.bufferView); });
  J.accessors = accessors; J.bufferViews = views; J.buffers = [{ byteLength: off0 }, { byteLength: off1, extensions: { EXT_meshopt_compression: { fallback: true } } }];
  J.asset.generator = (J.asset.generator || '') + ' + tools/build-models.mjs';
  const bin = new Uint8Array(off0); let o = 0; for (const c of chunks) { bin.set(c, o); o += c.length; }
  let js = Buffer.from(JSON.stringify(J)); const jp = pad4(js.length); js = Buffer.concat([js, Buffer.alloc(jp - js.length, 0x20)]);
  const total = 12 + 8 + jp + 8 + off0, out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546C67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(total, 8); out.writeUInt32LE(jp, 12); out.writeUInt32LE(0x4E4F534A, 16); js.copy(out, 20);
  out.writeUInt32LE(off0, 20 + jp); out.writeUInt32LE(0x004E4942, 24 + jp); Buffer.from(bin.buffer).copy(out, 28 + jp); return out;
}

// ------------------------------------------------------------------------------------------------ rest pose maps
function nodeWorld(J) {
  const W = new Array(J.nodes.length), par = new Array(J.nodes.length).fill(-1); J.nodes.forEach((n, i) => (n.children || []).forEach(c => { par[c] = i; }));
  const local = (n) => n.matrix ? new THREE.Matrix4().fromArray(n.matrix) : new THREE.Matrix4().compose(new THREE.Vector3(...(n.translation || [0, 0, 0])), new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(n.scale || [1, 1, 1])));
  const get = (i) => W[i] || (W[i] = par[i] < 0 ? local(J.nodes[i]) : get(par[i]).clone().multiply(local(J.nodes[i]))); J.nodes.forEach((_, i) => get(i)); return W;
}
// one mesh: decoded attributes (floats in its quantised space), M (mesh -> world, rest pose), helpers
function meshOf(G, name) {
  const J = G.J, mi = J.meshes.findIndex(m => m.name === name || J.materials[m.primitives[0].material]?.name === name); if (mi < 0) return null;
  const node = J.nodes.findIndex(n => n.mesh === mi), skin = J.skins[J.nodes[node].skin], prim = J.meshes[mi].primitives[0], W = G.W || (G.W = nodeWorld(J));
  const ibm = acc(G, skin.inverseBindMatrices), M = W[skin.joints[0]].clone().multiply(new THREE.Matrix4().fromArray(ibm, 0));
  let dev = 0; for (let j = 1; j < skin.joints.length; j++) { const Mj = W[skin.joints[j]].clone().multiply(new THREE.Matrix4().fromArray(ibm, j * 16)); for (let e = 0; e < 16; e++) dev = Math.max(dev, Math.abs(Mj.elements[e] - M.elements[e])); }
  if (dev > 1e-4) throw new Error(name + ': rest skin maps disagree ' + dev);
  const A = {}; for (const k in prim.attributes) A[k] = { data: acc(G, prim.attributes[k]), a: J.accessors[prim.attributes[k]] };
  const T = (prim.targets || []).map(t => acc(G, t.POSITION)), idx = Uint32Array.from(acc(G, prim.indices)), n = A.POSITION.a.count;
  const dq = (a) => a.normalized ? (a.componentType === 5122 ? 1 / 32767 : a.componentType === 5123 ? 1 / 65535 : a.componentType === 5121 ? 1 / 255 : 1 / 127) : 1;
  const P = new Float64Array(n * 3), pw = new Float64Array(n * 3), s = dq(A.POSITION.a), v = new THREE.Vector3(); for (let i = 0; i < n * 3; i++) P[i] = Math.max(-1, A.POSITION.data[i] * s);
  for (let i = 0; i < n; i++) { v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(M); pw[i * 3] = v.x; pw[i * 3 + 1] = v.y; pw[i * 3 + 2] = v.z; }
  const L = new THREE.Matrix3().setFromMatrix4(M), Li = L.clone().invert();
  // normals: three skins a normal with the same matrices as the position (no inverse transpose), so world n ~ L * stored n
  const nw = new Float64Array(n * 3), sn = dq(A.NORMAL.a); for (let i = 0; i < n; i++) { v.set(A.NORMAL.data[i * 3] * sn, A.NORMAL.data[i * 3 + 1] * sn, A.NORMAL.data[i * 3 + 2] * sn).applyMatrix3(L).normalize(); nw[i * 3] = v.x; nw[i * 3 + 1] = v.y; nw[i * 3 + 2] = v.z; }
  return { mi, prim, name, M, Mi: M.clone().invert(), L, Li, A, T, idx, n, pw, nw, skin, J };
}
// write a mesh back: attrs { POSITION: Float (world), NORMAL: Float (world), JOINTS_0: Uint8, WEIGHTS_0: Float, TEXCOORD_0: Float, COLOR_0? }, targets: [Float mesh-space deltas], idx
function storeMesh(G, m, o) {
  const n = o.pos.length / 3, v = new THREE.Vector3(), Q = (x) => Math.max(-32767, Math.min(32767, Math.round(x * 32767)));
  const P = new Int16Array(n * 3), N = new Int16Array(n * 3);
  for (let i = 0; i < n; i++) {
    if (o.rawP && i < o.keep) { for (let c = 0; c < 3; c++) { P[i * 3 + c] = o.rawP[i * 3 + c]; N[i * 3 + c] = o.rawN[i * 3 + c]; } continue; }
    v.set(o.pos[i * 3], o.pos[i * 3 + 1], o.pos[i * 3 + 2]).applyMatrix4(m.Mi); P[i * 3] = Q(v.x); P[i * 3 + 1] = Q(v.y); P[i * 3 + 2] = Q(v.z);
    v.set(o.nor[i * 3], o.nor[i * 3 + 1], o.nor[i * 3 + 2]).applyMatrix3(m.Li).normalize(); N[i * 3] = Q(v.x); N[i * 3 + 1] = Q(v.y); N[i * 3 + 2] = Q(v.z);
  }
  const p = m.prim; p.attributes = {};
  p.attributes.JOINTS_0 = addAcc(G, o.joints, 'VEC4', 5121);
  p.attributes.POSITION = addAcc(G, P, 'VEC3', 5122, { normalized: true, minmax: true });
  p.attributes.NORMAL = addAcc(G, N, 'VEC3', 5122, { normalized: true });
  if (o.uv) { const U = new Uint16Array(o.uv.length); for (let i = 0; i < U.length; i++) U[i] = Math.max(0, Math.min(65535, Math.round(o.uv[i] * 65535))); p.attributes.TEXCOORD_0 = addAcc(G, U, 'VEC2', 5123, { normalized: true }); }
  if (o.color) { const C = new Uint8Array(n * 4); for (let i = 0; i < n; i++) { for (let c = 0; c < 3; c++) C[i * 4 + c] = Math.round(Math.max(0, Math.min(1, o.color[i * 3 + c])) * 255); C[i * 4 + 3] = 255; } p.attributes.COLOR_0 = addAcc(G, C, 'VEC4', 5121, { normalized: true }); }
  p.attributes.WEIGHTS_0 = addAcc(G, o.weights, 'VEC4', 5121, { normalized: true });
  if (p.targets) p.targets = o.targets.map(t => { const D = new Int16Array(n * 3); for (let i = 0; i < n * 3; i++) D[i] = Q(t[i]); return { POSITION: addAcc(G, D, 'VEC3', 5122, { normalized: true, minmax: true }) }; });
  p.indices = addAcc(G, n > 65535 ? Uint32Array.from(o.idx) : Uint16Array.from(o.idx), 'SCALAR', n > 65535 ? 5125 : 5123, { index: true });
}
// unpack a mesh into editable float arrays (world positions / normals, mesh-space morph deltas, float weights)
function unpack(m) {
  const n = m.n, A = m.A, sw = A.WEIGHTS_0.a.componentType === 5121 ? 1 / 255 : 1 / 65535, su = A.TEXCOORD_0 ? (A.TEXCOORD_0.a.componentType === 5123 ? 1 / 65535 : 1) : 0;
  return { pos: Array.from(m.pw), nor: Array.from(m.nw), joints: Array.from(A.JOINTS_0.data), w: Array.from(A.WEIGHTS_0.data, x => x * sw), uv: A.TEXCOORD_0 ? Array.from(A.TEXCOORD_0.data, x => x * su) : null,
    targets: m.T.map(t => Array.from(t, x => x / 32767)), idx: Array.from(m.idx), rawP: A.POSITION.data, rawN: A.NORMAL.data, keep: n, n };
}
// float weights -> uint8 summing to 255
function packWeights(w) {
  const out = new Uint8Array(w.length);
  for (let i = 0; i < w.length; i += 4) { const s = w[i] + w[i + 1] + w[i + 2] + w[i + 3] || 1; let t = 0, big = 0; for (let k = 0; k < 4; k++) { out[i + k] = Math.round(w[i + k] / s * 255); t += out[i + k]; if (out[i + k] > out[i + big]) big = k; } out[i + big] += 255 - t; }
  return out;
}
// blend two vertices' skin (union of bones, top 4)
function blendSkin(J, W, a, b, ta = 0.5) {
  const m = new Map(); for (let k = 0; k < 4; k++) { m.set(J[a * 4 + k], (m.get(J[a * 4 + k]) || 0) + W[a * 4 + k] * ta); m.set(J[b * 4 + k], (m.get(J[b * 4 + k]) || 0) + W[b * 4 + k] * (1 - ta)); }
  const e = [...m].filter(x => x[1] > 0).sort((x, y) => y[1] - x[1]).slice(0, 4); while (e.length < 4) e.push([0, 0]); return e;
}

// ------------------------------------------------------------------------------------------------ geometry helpers
function weld(pos, n, q = 1e5) { const id = new Int32Array(n), seen = new Map(); let k = 0; for (let i = 0; i < n; i++) { const key = Math.round(pos[i * 3] * q) + ',' + Math.round(pos[i * 3 + 1] * q) + ',' + Math.round(pos[i * 3 + 2] * q); let w = seen.get(key); if (w === undefined) { w = k++; seen.set(key, w); } id[i] = w; } return { id, count: k }; }
function edgesOf(idx, wid) { const E = new Map(); for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = wid[idx[t + e]], b = wid[idx[t + (e + 1) % 3]]; if (a === b) continue; const k = a < b ? a + ',' + b : b + ',' + a; E.set(k, (E.get(k) || 0) + 1); } return E; }
function adjacency(idx, wid, nw) { const adj = Array.from({ length: nw }, () => new Set()); for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = wid[idx[t + e]], b = wid[idx[t + (e + 1) % 3]]; if (a !== b) { adj[a].add(b); adj[b].add(a); } } return adj; }
// ray (o, d) against triangles of a world position array: nearest t in (tmin, tmax) -> { t, tri, u, v } or null
function raycast(P, idx, ox, oy, oz, dx, dy, dz, tmin, tmax, bvh) {
  let best = null; const tris = bvh ? bvh(ox, oy, oz, dx, dy, dz, tmax) : null, N = tris ? tris.length : idx.length / 3;
  for (let q = 0; q < N; q++) { const t3 = (tris ? tris[q] : q) * 3, a = idx[t3] * 3, b = idx[t3 + 1] * 3, c = idx[t3 + 2] * 3;
    const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2], e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
    const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x, det = e1x * hx + e1y * hy + e1z * hz; if (Math.abs(det) < 1e-14) continue;
    const f = 1 / det, sx = ox - P[a], sy = oy - P[a + 1], sz = oz - P[a + 2], u = f * (sx * hx + sy * hy + sz * hz); if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, v = f * (dx * qx + dy * qy + dz * qz); if (v < 0 || u + v > 1) continue;
    const t = f * (e2x * qx + e2y * qy + e2z * qz); if (t > tmin && t < tmax && (!best || t < best.t)) best = { t, tri: t3 / 3, u, v }; }
  return best;
}
// a coarse grid over triangles for the ray casts (cell 2 cm)
function triGrid(P, idx, C = 0.02) {
  const g = new Map(), key = (x, y, z) => x + '|' + y + '|' + z;
  for (let t = 0; t < idx.length / 3; t++) { let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (let k = 0; k < 3; k++) for (let c = 0; c < 3; c++) { const x = P[idx[t * 3 + k] * 3 + c]; mn[c] = Math.min(mn[c], x); mx[c] = Math.max(mx[c], x); }
    for (let x = Math.floor(mn[0] / C); x <= Math.floor(mx[0] / C); x++) for (let y = Math.floor(mn[1] / C); y <= Math.floor(mx[1] / C); y++) for (let z = Math.floor(mn[2] / C); z <= Math.floor(mx[2] / C); z++) { const k = key(x, y, z); (g.get(k) || g.set(k, []).get(k)).push(t); } }
  return (ox, oy, oz, dx, dy, dz, tmax) => { const out = new Set(), steps = Math.ceil(tmax / (C * 0.5)) + 1; for (let s = 0; s <= steps; s++) { const t = Math.min(tmax, s * C * 0.5), x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) { const L = g.get(key(Math.floor(x / C) + a, Math.floor(y / C) + b, Math.floor(z / C) + c)); if (L) for (const q of L) out.add(q); } } return [...out]; };
}
// geodesic distance over welded edges from a source set (Dijkstra, cut off at maxD)
function geodesic(pw, wrep, adj, sources, maxD) {
  const nw = adj.length, d = new Float64Array(nw).fill(Infinity), H = [];
  const push = (x, w) => { H.push([x, w]); let i = H.length - 1; while (i) { const p = (i - 1) >> 1; if (H[p][0] <= H[i][0]) break; [H[p], H[i]] = [H[i], H[p]]; i = p; } };
  const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let s = i; if (l < H.length && H[l][0] < H[s][0]) s = l; if (r < H.length && H[r][0] < H[s][0]) s = r; if (s === i) break; [H[s], H[i]] = [H[i], H[s]]; i = s; } } return top; };
  for (const s of sources) { d[s] = 0; push(0, s); }
  while (H.length) { const [dv, w] = pop(); if (dv > d[w] || dv > maxD) continue; const a = wrep[w] * 3;
    for (const u of adj[w]) { const b = wrep[u] * 3, nd = dv + Math.hypot(pw[a] - pw[b], pw[a + 1] - pw[b + 1], pw[a + 2] - pw[b + 2]); if (nd < d[u]) { d[u] = nd; push(nd, u); } } }
  return d;
}
const boneW = (m, names, i) => { const J = m.J, bn = m.skin.joints.map(j => J.nodes[j].name); let w = 0, t = 0; for (let k = 0; k < 4; k++) { const wk = m.A.WEIGHTS_0.data[i * 4 + k]; t += wk; if (names.test(bn[m.A.JOINTS_0.data[i * 4 + k]])) w += wk; } return w / (t || 1); };

// drop unused vertices (keeps the order of the used ones: the original raw ints stay first and exact)
function compact(U) {
  const n = U.pos.length / 3, used = new Int32Array(n).fill(-1); let k = 0; const order = [];
  for (let i = 0; i < n; i++) used[i] = -2; for (const v of U.idx) used[v] = -1; for (let i = 0; i < n; i++) if (used[i] === -1) { used[i] = k++; order.push(i); }
  const take = (arr, s) => arr && order.flatMap(i => Array.from({ length: s }, (_, c) => arr[i * s + c]));
  const keepOld = order.filter(i => i < U.keep).length, contiguous = order.slice(0, keepOld).every((v, j) => v === order[j]);
  const rp = U.rawP && Int16Array.from(order.filter(i => i < U.keep).flatMap(i => [U.rawP[i * 3], U.rawP[i * 3 + 1], U.rawP[i * 3 + 2]])), rn = U.rawN && Int16Array.from(order.filter(i => i < U.keep).flatMap(i => [U.rawN[i * 3], U.rawN[i * 3 + 1], U.rawN[i * 3 + 2]]));
  // old vertices come first in `order` (they have the smallest indices), so they stay a prefix
  const out = { ...U, pos: take(U.pos, 3), nor: take(U.nor, 3), joints: take(U.joints, 4), w: take(U.w, 4), uv: take(U.uv, 2), color: take(U.color, 3), targets: U.targets.map(t => take(t, 3)), idx: U.idx.map(v => used[v]), rawP: rp, rawN: rn, keep: keepOld };
  if (!contiguous) throw new Error('compact order');
  return out;
}

// ------------------------------------------------------------------------------------------------ 2. Phong-tessellated 1 -> 4 refinement of a triangle set
function refine(U, triMask, alpha = 0.75, stats) {
  const n = U.pos.length / 3, { id: wid, count: nw } = weld(U.pos, n), E = edgesOf(U.idx, wid);
  // welded smooth normal per position (seams agree on the new point)
  const wn = new Float64Array(nw * 3); for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) wn[wid[i] * 3 + c] += U.nor[i * 3 + c];
  for (let w = 0; w < nw; w++) { const l = Math.hypot(wn[w * 3], wn[w * 3 + 1], wn[w * 3 + 2]) || 1; for (let c = 0; c < 3; c++) wn[w * 3 + c] /= l; }
  const T = U.idx, m = T.length / 3, split = new Set(), ek = (a, b) => { const x = wid[a], y = wid[b]; return x < y ? x + ',' + y : y + ',' + x; };
  for (let t = 0; t < m; t++) if (triMask[t]) for (let e = 0; e < 3; e++) split.add(ek(T[t * 3 + e], T[t * 3 + (e + 1) % 3]));
  const mid = new Map(), push = (arr, ...v) => arr.push(...v);
  const midOf = (a, b) => {   // one new vertex per corner pair (attributes per side of a seam), position from the welded edge
    const key = a < b ? a + ',' + b : b + ',' + a; let v = mid.get(key); if (v !== undefined) return v; v = U.pos.length / 3; mid.set(key, v);
    const wa = wid[a], wb = wid[b], bnd = E.get(ek(a, b)) === 1, p = [0, 1, 2].map(c => (U.pos[a * 3 + c] + U.pos[b * 3 + c]) / 2);
    if (!bnd) { const na = [0, 1, 2].map(c => wn[wa * 3 + c]), nb = [0, 1, 2].map(c => wn[wb * 3 + c]);
      const da = (p[0] - U.pos[a * 3]) * na[0] + (p[1] - U.pos[a * 3 + 1]) * na[1] + (p[2] - U.pos[a * 3 + 2]) * na[2], db = (p[0] - U.pos[b * 3]) * nb[0] + (p[1] - U.pos[b * 3 + 1]) * nb[1] + (p[2] - U.pos[b * 3 + 2]) * nb[2];
      for (let c = 0; c < 3; c++) p[c] += alpha * -0.5 * (da * na[c] + db * nb[c]); }
    push(U.pos, ...p); const nn = [0, 1, 2].map(c => U.nor[a * 3 + c] + U.nor[b * 3 + c]), l = Math.hypot(...nn) || 1; push(U.nor, ...nn.map(x => x / l));
    const sk = blendSkin(U.joints, U.w, a, b); for (const [j, w] of sk) { U.joints.push(j); U.w.push(w); }
    if (U.uv) push(U.uv, (U.uv[a * 2] + U.uv[b * 2]) / 2, (U.uv[a * 2 + 1] + U.uv[b * 2 + 1]) / 2);
    if (U.color) push(U.color, ...[0, 1, 2].map(c => (U.color[a * 3 + c] + U.color[b * 3 + c]) / 2));
    for (const t of U.targets) push(t, ...[0, 1, 2].map(c => (t[a * 3 + c] + t[b * 3 + c]) / 2));
    return v;
  };
  const out = []; let added = 0;
  for (let t = 0; t < m; t++) {
    const v = [T[t * 3], T[t * 3 + 1], T[t * 3 + 2]], s = [0, 1, 2].map(e => split.has(ek(v[e], v[(e + 1) % 3]))), ns = s.filter(Boolean).length;
    if (!ns) { out.push(...v); continue; }
    const M = [0, 1, 2].map(e => s[e] ? midOf(v[e], v[(e + 1) % 3]) : -1); added += ns === 3 ? 3 : ns;
    if (ns === 3) out.push(v[0], M[0], M[2], M[0], v[1], M[1], M[2], M[1], v[2], M[0], M[1], M[2]);
    else if (ns === 1) { const e = s.indexOf(true), a = v[e], b = v[(e + 1) % 3], c = v[(e + 2) % 3], x = M[e]; out.push(a, x, c, x, b, c); }
    else { const e = s.indexOf(false), a = v[e], b = v[(e + 1) % 3], c = v[(e + 2) % 3], mb = M[(e + 1) % 3], mc = M[(e + 2) % 3];   // edge a-b not split; b-c and c-a split
      // a-b-mb-mc quad + corner triangle at c; split the quad on its shorter diagonal
      out.push(mb, c, mc); const d1 = dist(U.pos, a, mb), d2 = dist(U.pos, b, mc); if (d1 < d2) out.push(a, b, mb, a, mb, mc); else out.push(a, b, mc, b, mb, mc); }
  }
  stats.refinedTris = (stats.refinedTris || 0) + (out.length - T.length) / 3; U.idx = out; return U;
}
// how far the midpoint of edge a-b sits off the smooth surface its end normals describe (the Phong offset, before alpha)
function phongOff(U, a, b) { let s2 = 0; const p = [0, 1, 2].map(c => (U.pos[a * 3 + c] + U.pos[b * 3 + c]) / 2), da = [0, 1, 2].reduce((q, c) => q + (p[c] - U.pos[a * 3 + c]) * U.nor[a * 3 + c], 0), db = [0, 1, 2].reduce((q, c) => q + (p[c] - U.pos[b * 3 + c]) * U.nor[b * 3 + c], 0);
  for (let c = 0; c < 3; c++) s2 += (0.5 * (da * U.nor[a * 3 + c] + db * U.nor[b * 3 + c])) ** 2; return Math.sqrt(s2); }
const dist = (P, a, b) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);

// ------------------------------------------------------------------------------------------------ hair texture alpha
async function hairAlpha(G, hairMesh) {
  const mat = G.J.materials[hairMesh.prim.material], tex = G.J.textures[mat.pbrMetallicRoughness.baseColorTexture.index], im = G.J.images[tex.source];
  const { data, info } = await sharp(Buffer.from(G.views[im.bufferView])).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, a = (u, v) => { const x = Math.min(W - 1, Math.max(0, Math.floor(((u % 1) + 1) % 1 * W))), y = Math.min(H - 1, Math.max(0, Math.floor(((v % 1) + 1) % 1 * H))); return data[(y * W + x) * 4 + 3] / 255; };
  return { a };
}

// ------------------------------------------------------------------------------------------------ per kind
async function build(kind) {
  const src = execFileSync('git', ['show', `${BASE}:assets/models/${kind}.glb`], { cwd: ROOT, maxBuffer: 1 << 28 });
  const G = readGlb(src), stats = { kind, bytes: [src.length] }, J = G.J;
  const tris = () => J.meshes.reduce((s, mm) => s + mm.primitives.reduce((q, p) => q + J.accessors[p.indices].count / 3, 0), 0); stats.tris = [tris()];
  const body = meshOf(G, 'body'), hair = meshOf(G, 'hair'), teeth = meshOf(G, 'teeth'), lashes = meshOf(G, 'eyelashes');
  const bodyCount = (m) => J.accessors[m.prim.attributes.POSITION].count; stats.bodyVerts = [bodyCount(body)];
  { // check the normal convention: stored normals (mapped by L) against the area-weighted face normals of the rest-pose surface
    const fn = new Float64Array(body.n * 3), P = body.pw; for (let t = 0; t < body.idx.length; t += 3) { const a = body.idx[t] * 3, b = body.idx[t + 1] * 3, c = body.idx[t + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2], nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const q of [a, b, c]) { fn[q] += nx; fn[q + 1] += ny; fn[q + 2] += nz; } }
    let s = 0; for (let i = 0; i < body.n; i++) { const l = Math.hypot(fn[i * 3], fn[i * 3 + 1], fn[i * 3 + 2]) || 1; s += (fn[i * 3] * body.nw[i * 3] + fn[i * 3 + 1] * body.nw[i * 3 + 1] + fn[i * 3 + 2] * body.nw[i * 3 + 2]) / l; }
    stats.normalDot = +(s / body.n).toFixed(4); }

  // ---- hair coverage of the body (rays out along the skin normal hitting an opaque part of the hair map)
  const HA = await hairAlpha(G, hair), hg = triGrid(hair.pw, hair.idx), huv = hair.A.TEXCOORD_0.data;
  const nb = body.n, cover = new Float32Array(nb);   // 0..1: alpha of the hair over this skin vertex
  const headish = new Uint8Array(nb); for (let i = 0; i < nb; i++) headish[i] = boneW(body, /^(Head|neck_01)$/, i) > 0.3 ? 1 : 0;
  for (let i = 0; i < nb; i++) { if (!headish[i]) continue; const o = [body.pw[i * 3], body.pw[i * 3 + 1], body.pw[i * 3 + 2]], d = [body.nw[i * 3], body.nw[i * 3 + 1], body.nw[i * 3 + 2]];
    const h = raycast(hair.pw, hair.idx, o[0] - d[0] * 0.001, o[1] - d[1] * 0.001, o[2] - d[2] * 0.001, d[0], d[1], d[2], 0, 0.05, hg); if (!h) continue;
    const t = h.tri * 3, a = hair.idx[t], b = hair.idx[t + 1], c = hair.idx[t + 2], w0 = 1 - h.u - h.v, uu = (huv[a * 2] * w0 + huv[b * 2] * h.u + huv[c * 2] * h.v) / 65535, vv = (huv[a * 2 + 1] * w0 + huv[b * 2 + 1] * h.u + huv[c * 2 + 1] * h.v) / 65535;
    cover[i] = HA.a(uu, vv); }
  const { id: bwid, count: bnw } = weld(body.pw, nb), brep = new Int32Array(bnw); for (let i = nb - 1; i >= 0; i--) brep[bwid[i]] = i;
  const badj = adjacency(Array.from(body.idx), bwid, bnw), wcov = new Uint8Array(bnw); for (let i = 0; i < nb; i++) if (cover[i] > 0.5) wcov[bwid[i]] = 1;
  // signed geodesic distance to the hairline: outside (bare skin) and inside (under the hair)
  const outSrc = [], inSrc = []; for (let w = 0; w < bnw; w++) { let edge = false; for (const u of badj[w]) if (wcov[u] !== wcov[w]) edge = true; if (edge) (wcov[w] ? inSrc : outSrc).push(w); }
  const dIn = geodesic(body.pw, brep, badj, outSrc, 0.05), dOut = geodesic(body.pw, brep, badj, inSrc, 0.05);

  // ---- 3. hairline shade (COLOR_0 on the body): 0.35 under the hair (what shows through thin cover reads as roots / shadow, not bare scalp), 0.72 at the line, back to 1 by ~22 mm out
  const FLATTEN = { crew_heavy: true };
  const REFINE_TRIS = 500, GARMENT_TRIS = 0, REFINE_MIN = 0.00015;   // body triangles refined per kind (largest facet error first), and the least error that qualifies (0.15 mm)
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const color = new Array(nb * 3).fill(1);
  for (let i = 0; i < nb; i++) { const w = bwid[i]; let f = 1; if (!headish[i]) { } else if (wcov[w]) f = 0.72 - 0.37 * sstep(0, 0.012, dIn[w]); else f = 0.72 + 0.28 * sstep(0.003, 0.022, dOut[w]);
    color[i * 3] = f; color[i * 3 + 1] = f * (0.97 + 0.03 * f); color[i * 3 + 2] = f * (0.94 + 0.06 * f); }   // a warm shade (hair shadow), not grey

  { let c = 0, cv = 0, hd = 0; for (let i = 0; i < nb; i++) { if (color[i * 3] < 0.97) c++; if (cover[i] > 0.5) cv++; if (headish[i]) hd++; } stats.shaded = c; stats.covered = cv; stats.headish = hd; }
  // ---- 4. buzz cut (crew_heavy): the curl cards stand off the hair shell like fins; edge-on they caught the strand highlight as light streaks
  // ("white cracks"). Lay every card that is not the shell down onto it: height above the shell kept to 1.5 mm + 25% of the rest, normal = the skin's.
  if (FLATTEN[kind]) { const Hm = unpack(hair), n = Hm.pos.length / 3, { id: hw, count: hnw } = weld(Hm.pos, n), par = Int32Array.from({ length: hnw }, (_, i) => i);
    const find = (x) => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
    for (let t = 0; t < Hm.idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = find(hw[Hm.idx[t + e]]), b = find(hw[Hm.idx[t + (e + 1) % 3]]); if (a !== b) par[a] = b; }
    const size = new Map(); for (let t = 0; t < Hm.idx.length; t += 3) { const r = find(hw[Hm.idx[t]]); size.set(r, (size.get(r) || 0) + 1); }
    const shell = [...size].sort((x, y) => y[1] - x[1])[0][0];
    // skin height + normal of every hair vertex from the nearest head skin vertex (1 cm grid)
    const C = 0.01, key = (x, y, z) => Math.floor(x / C) + '|' + Math.floor(y / C) + '|' + Math.floor(z / C), sg = new Map(), hg2 = new Map();
    for (let i = 0; i < nb; i++) if (headish[i]) { const k = key(body.pw[i * 3], body.pw[i * 3 + 1], body.pw[i * 3 + 2]); (sg.get(k) || sg.set(k, []).get(k)).push(i); }
    const near = (g, P, x, y, z, R = 3) => { let b = -1, bd = Infinity; for (let r = 1; r <= R && b < 0; r++) for (let a = -r; a <= r; a++) for (let c = -r; c <= r; c++) for (let d = -r; d <= r; d++) for (const j of g.get(key(x + a * C, y + c * C, z + d * C)) || []) { const dd = (P[j * 3] - x) ** 2 + (P[j * 3 + 1] - y) ** 2 + (P[j * 3 + 2] - z) ** 2; if (dd < bd) { bd = dd; b = j; } } return b; };
    const hS = new Float64Array(n), sk = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) { const j = near(sg, body.pw, Hm.pos[i * 3], Hm.pos[i * 3 + 1], Hm.pos[i * 3 + 2]); if (j < 0) continue; sk[i] = j; hS[i] = [0, 1, 2].reduce((q, c) => q + (Hm.pos[i * 3 + c] - body.pw[j * 3 + c]) * body.nw[j * 3 + c], 0);
      if (find(hw[i]) === shell) { const k = key(Hm.pos[i * 3], Hm.pos[i * 3 + 1], Hm.pos[i * 3 + 2]); (hg2.get(k) || hg2.set(k, []).get(k)).push(i); } }
    let moved = 0, maxH = 0;
    for (let i = 0; i < n; i++) { if (find(hw[i]) === shell || sk[i] < 0) continue; const s = near(hg2, Hm.pos, Hm.pos[i * 3], Hm.pos[i * 3 + 1], Hm.pos[i * 3 + 2]); if (s < 0) continue;
      const top = hS[s] + 0.0015, h = hS[i]; if (h <= top) continue; const nh = top + (h - top) * 0.25, j = sk[i]; maxH = Math.max(maxH, h - hS[s]);
      for (let c = 0; c < 3; c++) { Hm.pos[i * 3 + c] -= (h - nh) * body.nw[j * 3 + c]; Hm.nor[i * 3 + c] = body.nw[j * 3 + c]; } moved++; }
    Hm.keep = 0; Hm.rawP = null; storeMesh(G, hair, { ...Hm, weights: packWeights(Hm.w) }); stats.flattened = moved; stats.finMaxMm = +(maxH * 1000).toFixed(1); }

  // ---- body: 2. refine the curved face, then store with the hairline shade
  let U = unpack(body); U.color = color;
  { const n = U.pos.length / 3, mask = new Uint8Array(U.idx.length / 3), sel = new Uint8Array(n);
    const bn = body.skin.joints.map(j => J.nodes[j].name);
    const wOf = (re, i) => { let w = 0, t = 0; for (let k = 0; k < 4; k++) { t += U.w[i * 4 + k]; if (re.test(bn[U.joints[i * 4 + k]])) w += U.w[i * 4 + k]; } return w / (t || 1); };
    // old-index -> welded coverage: the compacted body keeps the old vertex order as a prefix, so map through positions
    const pk = (i) => Math.round(U.pos[i * 3] * 1e5) + ',' + Math.round(U.pos[i * 3 + 1] * 1e5) + ',' + Math.round(U.pos[i * 3 + 2] * 1e5), covByPos = new Map(); for (let i = 0; i < nb; i++) covByPos.set(Math.round(body.pw[i * 3] * 1e5) + ',' + Math.round(body.pw[i * 3 + 1] * 1e5) + ',' + Math.round(body.pw[i * 3 + 2] * 1e5), wcov[bwid[i]] && dIn[bwid[i]] > 0.006);
    for (let i = 0; i < n; i++) sel[i] = wOf(/^(Head|neck_01)$/, i) > 0.5 && !covByPos.get(pk(i)) ? 1 : 0;   // the bare face, ears, jaw and neck
    // ranked by how far the flat facet sits from the smooth surface its normals describe (the Phong offset of its edge midpoints, mm): the visible
    // facets on silhouettes and in shading (jaw line, under the chin, nose, ear rims, the neck), up to REFINE_TRIS
    const score = []; for (let t = 0; t < mask.length; t++) { const v = [U.idx[t * 3], U.idx[t * 3 + 1], U.idx[t * 3 + 2]]; if (!v.every(i => sel[i])) continue;
      let mx = 0; for (let e = 0; e < 3; e++) mx = Math.max(mx, phongOff(U, v[e], v[(e + 1) % 3])); if (mx > REFINE_MIN) score.push([-mx, t]); }
    score.sort((x, y) => x[0] - y[0]); for (const [, t] of score.slice(0, REFINE_TRIS)) mask[t] = 1; stats.refineCand = score.length;
    refine(U, mask, 0.75, stats); }
  storeMesh(G, body, { ...U, joints: U.joints, weights: packWeights(U.w) });
  stats.bodyVerts.push(U.pos.length / 3);

  // ---- 7. uniform garments: the same facet-error ranked Phong refinement (sleeves, collar, shoulders, trouser legs read round on the silhouette)
  if (GARMENT_TRIS) for (const gm of J.meshes.filter(mm => mm.name.startsWith('garment') && !mm.name.includes('shoes'))) { const m = meshOf(G, gm.name), Ug = unpack(m), mask = new Uint8Array(Ug.idx.length / 3);
    const sc = []; for (let t = 0; t < mask.length; t++) { let mx = 0; for (let e = 0; e < 3; e++) mx = Math.max(mx, phongOff(Ug, Ug.idx[t * 3 + e], Ug.idx[t * 3 + (e + 1) % 3])); if (mx > REFINE_MIN) sc.push([-mx, t]); }
    sc.sort((x, y) => x[0] - y[0]); for (const [, t] of sc.slice(0, GARMENT_TRIS)) mask[t] = 1; const st = {}; refine(Ug, mask, 0.75, st);
    storeMesh(G, m, { ...Ug, weights: packWeights(Ug.w) }); stats.garment = [m.idx.length / 3, Ug.idx.length / 3]; }

  // ---- 5. teeth: decimate (original vertices kept)
  { const T0 = unpack(teeth), n = T0.pos.length / 3, attrs = [], sk = new Float32Array(n * 16); for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) sk[i * 16 + (T0.joints[i * 4 + k] % 16)] += T0.w[i * 4 + k];
    attrs.push({ data: sk, size: 16, weight: 0.03 * 0.03 }); for (const t of T0.targets) { const d = new Float32Array(n * 3), s = new THREE.Vector3(); for (let i = 0; i < n; i++) { s.set(t[i * 3], t[i * 3 + 1], t[i * 3 + 2]).applyMatrix3(teeth.L); d[i * 3] = s.x; d[i * 3 + 1] = s.y; d[i * 3 + 2] = s.z; } attrs.push({ data: d, size: 3, weight: 1 }); }
    const ix = simplifyIndex(Float32Array.from(T0.pos), Uint32Array.from(T0.idx), { ratio: 0.2, maxError: 0.0012, attrs }); T0.idx = Array.from(ix);
    const C = compact(T0); storeMesh(G, teeth, { ...C, weights: packWeights(C.w) }); stats.teeth = [n, C.pos.length / 3, ix.length / 3]; }

  // ---- 6. lashes: pull each strip 35% toward its root (the vertex of its strip nearest the lid skin)
  { const L0 = unpack(lashes), n = L0.pos.length / 3, bg = new Map(), C = 0.01, key = (x, y, z) => Math.floor(x / C) + '|' + Math.floor(y / C) + '|' + Math.floor(z / C);
    for (let i = 0; i < nb; i++) if (headish[i]) { const k = key(body.pw[i * 3], body.pw[i * 3 + 1], body.pw[i * 3 + 2]); (bg.get(k) || bg.set(k, []).get(k)).push(i); }
    const dskin = new Float64Array(n); for (let i = 0; i < n; i++) { let b = Infinity; const x = L0.pos[i * 3], y = L0.pos[i * 3 + 1], z = L0.pos[i * 3 + 2];
      for (let a = -1; a <= 1; a++) for (let bb = -1; bb <= 1; bb++) for (let c = -1; c <= 1; c++) for (const j of bg.get(key(x + a * C, y + bb * C, z + c * C)) || []) b = Math.min(b, Math.hypot(body.pw[j * 3] - x, body.pw[j * 3 + 1] - y, body.pw[j * 3 + 2] - z)); dskin[i] = b; }
    const { id: lw, count: lnw } = weld(L0.pos, n), ladj = adjacency(L0.idx, lw, lnw), lrep = new Int32Array(lnw); for (let i = n - 1; i >= 0; i--) lrep[lw[i]] = i;
    // root of each vertex: walk downhill in skin distance over the welded strip
    const rootOf = (w) => { for (let s = 0; s < 20; s++) { let best = w; for (const u of ladj[w]) if (dskin[lrep[u]] < dskin[lrep[best]] - 1e-6) best = u; if (best === w) return w; w = best; } return w; };
    const moved = []; let maxPull = 0;
    for (let i = 0; i < n; i++) { const r = lrep[rootOf(lw[i])]; if (r === i) continue; for (let c = 0; c < 3; c++) moved[i * 3 + c] = L0.pos[i * 3 + c] + (L0.pos[r * 3 + c] - L0.pos[i * 3 + c]) * 0.35; maxPull = Math.max(maxPull, dist(L0.pos, i, r) * 0.35); }
    for (let i = 0; i < n; i++) if (moved[i * 3] !== undefined) { for (let c = 0; c < 3; c++) L0.pos[i * 3 + c] = moved[i * 3 + c]; }
    L0.keep = 0; L0.rawP = null; storeMesh(G, lashes, { ...L0, weights: packWeights(L0.w) }); stats.lashPullMm = +(maxPull * 1000).toFixed(2); }

  const out = writeGlb(G); stats.bytes.push(out.length); stats.tris.push(tris());
  return { out, stats };
}

mkdirSync(OUT, { recursive: true });
for (const kind of KINDS) {
  const t0 = Date.now(), { out, stats } = await build(kind);
  if (!DRY) writeFileSync(join(OUT, kind + '.glb'), out);
  console.log(JSON.stringify({ ...stats, ms: Date.now() - t0 }));
}
