// Per-person level of detail.  A rigged human is ~17k-triangle body + 7k garment + 4k shoes + 7k teeth + hair (~38k), and a visible crowd of 11 was
// still ~190k triangles even after culling (js/perfcull.js).  At distance most of that cannot be resolved, so each skinned mesh gets two decimated
// copies built once per SOURCE geometry (SkeletonUtils.clone shares geometry between people, so the cost is paid per body kind, not per person):
//   LOD1 (from LOD1_FAR m)  vertex-clustered towards 30 % of the triangles,   LOD2 (from LOD2_FAR m)  towards 10 % and the small kit meshes hidden.
// The decimated geometry keeps every vertex attribute (skinIndex / skinWeight / uv / zone / colour / morph deltas) because each output vertex IS an
// original vertex (the one nearest its cluster centre), so it binds to the same skeleton and animates / styles / shades exactly like the full mesh:
// garments, hair and shoes are separate meshes and are decimated with the same cell size, so they keep their relative layering.  Clusters are keyed
// by position cell AND uv cell, so texture seams are not welded together (no smeared UVs).  Swapping is a geometry pointer swap on the existing
// meshes (materials, skeleton, mixer untouched); perfcull restores the full geometry right after the draw so gameplay code never sees a LOD mesh.
import * as THREE from 'three';
import { LOD1_FAR, LOD2_FAR, HYST, MIN_TRIS, TARGETS, lodCfg, levelFor } from './lodcfg.js';
export { LOD1_FAR, LOD2_FAR, HYST, MIN_TRIS, TARGETS, lodCfg, levelFor };
export const lodStats = { built: 0, srcTris: 0, tris: [0, 0, 0] };            // bookkeeping for tests / perf probes (summed over the distinct source geometries decimated)
const cache = new WeakMap();                                                  // source geometry -> [geo0, geo1, geo2]

const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
// cluster-decimate one geometry; returns a new BufferGeometry (or null when it would not shrink)
export function decimate(geo, cell, uvCell = 1 / 8) {
  const pos = geo.attributes.position, uv = geo.attributes.uv, n = pos.count, idx = geo.index ? geo.index.array : null, nt = (idx ? idx.length : n) / 3;
  const key = new Map(), cid = new Int32Array(n);
  let nc = 0; const sums = [];
  for (let i = 0; i < n; i++) {   // assign every vertex to a cluster
    const k = Math.floor(pos.getX(i) / cell) + ',' + Math.floor(pos.getY(i) / cell) + ',' + Math.floor(pos.getZ(i) / cell) + (uv ? ',' + Math.floor(uv.getX(i) / uvCell) + ',' + Math.floor(uv.getY(i) / uvCell) : '');
    let c = key.get(k); if (c === undefined) { c = nc++; key.set(k, c); sums.push([0, 0, 0, 0]); } cid[i] = c; const s = sums[c]; s[0] += pos.getX(i); s[1] += pos.getY(i); s[2] += pos.getZ(i); s[3]++;
  }
  const best = new Float32Array(nc).fill(Infinity), bi = new Int32Array(nc).fill(-1);
  for (let i = 0; i < n; i++) { const c = cid[i], s = sums[c], dx = pos.getX(i) - s[0] / s[3], dy = pos.getY(i) - s[1] / s[3], dz = pos.getZ(i) - s[2] / s[3], d = dx * dx + dy * dy + dz * dz; if (d < best[c]) { best[c] = d; bi[c] = i; } }
  const out = []; const seen = new Set();   // remap triangles onto cluster representatives, drop degenerate and duplicate ones
  for (let t = 0; t < nt; t++) {
    const a = cid[idx ? idx[t * 3] : t * 3], b = cid[idx ? idx[t * 3 + 1] : t * 3 + 1], c = cid[idx ? idx[t * 3 + 2] : t * 3 + 2]; if (a === b || b === c || a === c) continue;
    const k = a < b && a < c ? a + ',' + b + ',' + c : b < c ? b + ',' + c + ',' + a : c + ',' + a + ',' + b; if (seen.has(k)) continue; seen.add(k); out.push(a, b, c);
  }
  if (out.length / 3 >= nt * 0.9) return null;
  const used = new Int32Array(nc).fill(-1); let m = 0; const src = [];   // compact: only clusters still referenced
  for (let i = 0; i < out.length; i++) { const c = out[i]; if (used[c] < 0) { used[c] = m++; src.push(bi[c]); } out[i] = used[c]; }
  const g = new THREE.BufferGeometry();
  const take = (a) => {   // raw element copy (plain or interleaved), so normalised / quantised attributes keep their stored values
    const sz = a.itemSize, il = a.isInterleavedBufferAttribute, srcArr = il ? a.data.array : a.array, stride = il ? a.data.stride : sz, off = il ? a.offset : 0, arr = new srcArr.constructor(m * sz);
    for (let j = 0; j < m; j++) for (let k = 0; k < sz; k++) arr[j * sz + k] = srcArr[src[j] * stride + off + k]; return new THREE.BufferAttribute(arr, sz, a.normalized);
  };
  for (const name in geo.attributes) g.setAttribute(name, take(geo.attributes[name]));
  for (const name in geo.morphAttributes) g.morphAttributes[name] = geo.morphAttributes[name].map(take);
  g.morphTargetsRelative = geo.morphTargetsRelative; g.setIndex(m > 65535 ? new THREE.Uint32BufferAttribute(out, 1) : new THREE.Uint16BufferAttribute(out, 1));
  g.computeBoundingSphere(); g.computeBoundingBox(); return g;
}

// decimate towards `ratio` of the triangles: bisect the cell size (log scale) between a fine cell and 1/10 of the mesh's own extent, so a coarse
// garment, a dense shoe and a 17k body each land near the target instead of sharing one cell size.  Returns null when nothing smaller is possible.
export function decimateTo(geo, ratio, ref) {
  if (!geo.boundingBox) geo.computeBoundingBox(); const bb = geo.boundingBox, ext = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z), t0 = tris(geo), want = t0 * ratio;
  let lo = ref / 400, hi = Math.max(lo * 1.5, ext / 10), best = null;
  for (let i = 0; i < 6; i++) { const mid = Math.sqrt(lo * hi), d = decimate(geo, mid); if (d && tris(d) <= want) { best = d; hi = mid; } else lo = mid; }
  return best || decimate(geo, hi);
}
// build (once per source geometry) and return [geo0, geo1, geo2] for a skinned mesh; ref = native body height
function lods(mesh, ref) {
  const g0 = mesh.geometry; let r = cache.get(g0); if (r) return r;
  r = [g0, g0, g0]; cache.set(g0, r); const t0 = tris(g0); lodStats.srcTris += t0; lodStats.built++;
  if (t0 >= MIN_TRIS) { const g1 = decimateTo(g0, TARGETS[1], ref), g2 = decimateTo(g0, TARGETS[2], ref); r[1] = g1 || g0; r[2] = g2 || g1 || g0; }
  lodStats.tris[0] += t0; lodStats.tris[1] += tris(r[1]); lodStats.tris[2] += tris(r[2]); return r;
}

// Called at the end of makeHuman (all meshes are in place): gather the swappable meshes and build / fetch their LOD geometries.
export function prepareHumanLod(g, inner, hairParts = [], cutParts = []) {
  const items = [], small = []; let ref = 0;
  inner.traverse(o => { if (o.isSkinnedMesh && o.material.name === 'body') { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox; ref = Math.max(ref, bb.max.y - bb.min.y); } });
  const keep = new Set([...hairParts, ...cutParts]);
  inner.traverse(o => {
    if (o.isSkinnedMesh && ref > 0) { const l = lods(o, ref); if (l[1] !== l[0]) items.push({ mesh: o, geo: l }); }
    else if (o.isMesh && !o.isSkinnedMesh && !keep.has(o) && !o.userData.keepLod && tris(o.geometry) < 300 && o.castShadow === false) small.push(o);   // kit: plate, boards, belt, pips (hair style parts are kept)
  });
  g.userData.lod = { items, small, level: 0, want: 0, smallHid: false };
  return g.userData.lod;
}
// apply a level to one human group (geometry pointer swap + kit visibility); returns the level
export function setLod(g, level) {
  const L = g.userData.lod; if (!L) return 0; L.level = level; for (const it of L.items) if (it.mesh.geometry !== it.geo[level]) it.mesh.geometry = it.geo[level];
  const hide = level >= 2; if (hide !== L.smallHid) { L.smallHid = hide; for (const m of L.small) { if (hide) { if (m.visible) { m.visible = false; m._lodHid = true; } } else if (m._lodHid) { m.visible = true; m._lodHid = false; } } }
  return level;
}
export const meshTris = (g) => { let t = 0; g.traverse(o => { if (o.isMesh && o.visible) t += tris(o.geometry); }); return t; };   // triangles of a group as it would draw now (tests / probes)
