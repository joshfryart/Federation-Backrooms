// Decimated level-of-detail meshes for the rigged crowd (js/humans.js builds them once per body kind, js/perfcull.js swaps them per frame).
// simplifyIndex() is a small quadric-error edge-collapse simplifier (Garland & Heckbert) that only ever collapses a vertex ONTO a neighbour
// (half-edge collapse): every kept vertex is an original vertex, so skin indices / weights, uvs, vertex colours, the uniform `zone` mask and
// the face morph targets are carried over exactly, nothing is interpolated.  Vertices at one position (uv / normal seams) are welded for the
// topology and collapse together, each side keeping its own corner; open borders (an edge only one triangle uses after welding) are locked;
// collapses that would flip a face or fold the surface (link condition) are refused; and a collapse also pays for how much the skin weights /
// morph deltas of the two vertices differ, so joints and the face keep their shape when they bend or emote.  Pure arrays in and out (no
// three.js), so node tests can run it (tools/test-lod.mjs); compactGeometry() / requestLods() below are the three.js glue.  Offline: no network, no wasm.
export function simplifyIndex(pos, index, { ratio = 0.5, maxError = Infinity, attrs = [] } = {}) { return simplifyLevels(pos, index, [{ ratio, maxError }], attrs)[0]; }
// several levels in one pass ([{ ratio, maxError }], coarser after finer): each level continues from the previous one's mesh
export function simplifyLevels(pos, index, levels, attrs = []) {
  const N = pos.length / 3, m = index.length / 3;
  // weld: vertices at the same position (uv / normal seams) share one topological vertex ("group"); collapses run on groups, and each
  // triangle keeps its own original corner vertices, so both sides of a seam keep their own uvs / normals
  let ext = 0; for (let i = 0; i < pos.length; i++) ext = Math.max(ext, Math.abs(pos[i]));
  const q = 1e5 / Math.max(ext, 1e-9), wid = new Int32Array(N), seen = new Map(), rep = []; let n = 0;
  for (let i = 0; i < N; i++) { const k = Math.round(pos[i * 3] * q) + ',' + Math.round(pos[i * 3 + 1] * q) + ',' + Math.round(pos[i * 3 + 2] * q); let w = seen.get(k); if (w === undefined) { w = n++; seen.set(k, w); rep.push(i); } wid[i] = w; }
  const T = Int32Array.from(index), W = new Int32Array(m * 3); for (let i = 0; i < m * 3; i++) W[i] = wid[T[i]];
  const P = new Float64Array(n * 3); for (let w = 0; w < n; w++) { P[w * 3] = pos[rep[w] * 3]; P[w * 3 + 1] = pos[rep[w] * 3 + 1]; P[w * 3 + 2] = pos[rep[w] * 3 + 2]; }
  const tdead = new Uint8Array(m), vdead = new Uint8Array(n), lock = new Uint8Array(n);
  for (let t = 0; t < m; t++) if (W[t * 3] === W[t * 3 + 1] || W[t * 3 + 1] === W[t * 3 + 2] || W[t * 3] === W[t * 3 + 2]) tdead[t] = 1;   // zero-area after welding: dropped
  const vt = Array.from({ length: n }, () => []); for (let t = 0; t < m; t++) if (!tdead[t]) for (let k = 0; k < 3; k++) vt[W[t * 3 + k]].push(t);
  // lock groups on welded edges used by != 2 triangles (open borders: cuffs, hair cards, mouth; non-manifold) and unused groups
  { const ec = new Map(), key = (a, b) => a < b ? a * n + b : b * n + a;
    for (let t = 0; t < m; t++) if (!tdead[t]) for (let k = 0; k < 3; k++) { const kk = key(W[t * 3 + k], W[t * 3 + (k + 1) % 3]); ec.set(kk, (ec.get(kk) || 0) + 1); }
    for (const [kk, c] of ec) if (c !== 2) { lock[Math.floor(kk / n)] = 1; lock[kk % n] = 1; }
    for (let v = 0; v < n; v++) if (!vt[v].length) { lock[v] = 1; vdead[v] = 1; } }
  // area-weighted plane quadrics (a2 ab ac ad b2 bc bd c2 cd d2) and per-group area, so the error reads as a mean squared distance
  const Q = new Float64Array(n * 10), VA = new Float64Array(n);
  for (let t = 0; t < m; t++) { if (tdead[t]) continue;
    const a = W[t * 3] * 3, b = W[t * 3 + 1] * 3, c = W[t * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; const len = Math.hypot(nx, ny, nz); if (len < 1e-20) continue;
    const area = len / 2; nx /= len; ny /= len; nz /= len; const d = -(nx * P[a] + ny * P[a + 1] + nz * P[a + 2]);
    const qq = [nx * nx, nx * ny, nx * nz, nx * d, ny * ny, ny * nz, ny * d, nz * nz, nz * d, d * d];
    for (let k = 0; k < 3; k++) { const v = W[t * 3 + k], o = v * 10; for (let j = 0; j < 10; j++) Q[o + j] += qq[j] * area; VA[v] += area / 3; }
  }
  const qerr = (u, v) => {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], a = u * 10, b = v * 10, g = (j) => Q[a + j] + Q[b + j];
    const e = g(0) * x * x + 2 * g(1) * x * y + 2 * g(2) * x * z + 2 * g(3) * x + g(4) * y * y + 2 * g(5) * y * z + 2 * g(6) * y + g(7) * z * z + 2 * g(8) * z + g(9);
    return Math.max(0, e) / Math.max(1e-20, VA[u] + VA[v]);
  };
  // penalty attributes packed per group, pre-scaled by sqrt(weight), all-zero columns dropped (most morph targets only move the face)
  const cols = []; for (const { data, size, weight } of attrs) for (let k = 0; k < size; k++) { let any = false; for (let i = 0; i < N && !any; i++) any = data[i * size + k] !== 0; if (any) cols.push([data, size, k, Math.sqrt(weight)]); }
  const D = cols.length, AP = new Float32Array(n * D); for (let w = 0; w < n; w++) for (let c = 0; c < D; c++) { const [data, size, k, sw] = cols[c]; AP[w * D + c] = data[rep[w] * size + k] * sw; }
  const adist = (u, v) => { let s = 0; const a = u * D, b = v * D; for (let c = 0; c < D; c++) { const x = AP[a + c] - AP[b + c]; s += x * x; } return s; };
  const has = (t, v) => W[t * 3] === v || W[t * 3 + 1] === v || W[t * 3 + 2] === v;
  const live = (u) => { const L = vt[u], out = []; for (let i = 0; i < L.length; i++) { const t = L[i]; if (!tdead[t] && has(t, u) && out[out.length - 1] !== t && !out.includes(t)) out.push(t); } return (vt[u] = out); };
  const mark = new Int32Array(n); let epoch = 0;
  const ring = (u, out) => { const e = ++epoch; out.length = 0; for (const t of live(u)) for (let k = 0; k < 3; k++) { const w = W[t * 3 + k]; if (w !== u && mark[w] !== e) { mark[w] = e; out.push(w); } } return e; };
  const nrm = (a, b, c, o) => { const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], wx = P[c * 3] - P[a * 3], wy = P[c * 3 + 1] - P[a * 3 + 1], wz = P[c * 3 + 2] - P[a * 3 + 2]; o[0] = uy * wz - uz * wy; o[1] = uz * wx - ux * wz; o[2] = ux * wy - uy * wx; return o; };
  const n0 = [0, 0, 0], n1 = [0, 0, 0], RU = [], RV = [], remap = new Map();
  const valid = (u, v) => {   // link condition, no flipped / sliver faces, and every corner of u has exactly one corner of v to move onto
    const e = ring(u, RU); if (mark[v] !== e) return false; ring(v, RV); let shared = 0; for (const w of RV) if (RU.includes(w)) shared++; if (shared !== 2) return false;
    remap.clear();
    for (const t of vt[u]) {
      const a = W[t * 3], b = W[t * 3 + 1], c = W[t * 3 + 2];
      if (a === v || b === v || c === v) { for (let k = 0; k < 3; k++) if (W[t * 3 + k] === u) { const ou = T[t * 3 + k]; for (let j = 0; j < 3; j++) if (W[t * 3 + j] === v) { const ov = T[t * 3 + j], prev = remap.get(ou); if (prev !== undefined && prev !== ov) return false; remap.set(ou, ov); } } continue; }
      nrm(a, b, c, n0); nrm(a === u ? v : a, b === u ? v : b, c === u ? v : c, n1);
      const l0 = Math.hypot(n0[0], n0[1], n0[2]), l1 = Math.hypot(n1[0], n1[1], n1[2]); if (l1 < l0 * 0.02) return false;
      if (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2] < 0.25 * l0 * l1) return false;
    }
    for (const t of vt[u]) for (let k = 0; k < 3; k++) if (W[t * 3 + k] === u && !remap.has(T[t * 3 + k])) return false;   // a corner of u (other side of a seam) with no matching corner of v
    return true;
  };
  const H = [], stamp = new Int32Array(n);
  const push = (e) => { H.push(e); let i = H.length - 1; while (i) { const p = (i - 1) >> 1; if (H[p][0] <= H[i][0]) break; [H[p], H[i]] = [H[i], H[p]]; i = p; } };
  const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let s = i; if (l < H.length && H[l][0] < H[s][0]) s = l; if (r < H.length && H[r][0] < H[s][0]) s = r; if (s === i) break; [H[s], H[i]] = [H[i], H[s]]; i = s; } } return top; };
  const RC = [];
  const consider = (u) => {
    if (lock[u] || vdead[u]) return; stamp[u]++; let best = Infinity, bv = -1; ring(u, RC);
    for (const v of RC) { const c = qerr(u, v) + adist(u, v); if (c < best) { best = c; bv = v; } }
    if (bv >= 0) push([best, u, bv, stamp[u]]);
  };
  for (let u = 0; u < n; u++) consider(u);
  let alive = 0; for (let t = 0; t < m; t++) if (!tdead[t]) alive++;
  const RN = [], res = [];
  for (const { ratio = 0.5, maxError = Infinity } of levels) {
    const target = Math.floor(m * ratio), maxE2 = maxError * maxError;
    while (alive > target && H.length) {
      const top = H[0]; if (top[3] !== stamp[top[1]] || vdead[top[1]] || vdead[top[2]]) { pop(); continue; }
      if (top[0] > maxE2) break;   // left in the heap for the next (looser) level
      const [, u, v] = pop();
      live(u); if (!valid(u, v)) { stamp[u]++; continue; }   // refused: u is re-considered when its neighbourhood changes
      for (const t of vt[u]) { const o = t * 3; if (has(t, v)) { tdead[t] = 1; alive--; continue; } for (let k = 0; k < 3; k++) if (W[o + k] === u) { W[o + k] = v; T[o + k] = remap.get(T[o + k]); } vt[v].push(t); }
      for (let j = 0; j < 10; j++) Q[v * 10 + j] += Q[u * 10 + j]; VA[v] += VA[u]; vdead[u] = 1; vt[u] = [];
      consider(v); ring(v, RN); for (const w of RN.slice()) consider(w);
    }
    const out = new Uint32Array(alive * 3); let o = 0; for (let t = 0; t < m; t++) if (!tdead[t]) { out[o++] = T[t * 3]; out[o++] = T[t * 3 + 1]; out[o++] = T[t * 3 + 2]; }
    res.push(out);
  }
  return res;
}

// distance (m, already scaled for the field of view) -> level 0 / 1 / 2, with hysteresis: a level only changes once the distance is LOD_HYST past its boundary
export const LOD_NEAR = 5, LOD_FAR = 10, LOD_HYST = 0.6;
export function lodLevel(prev, d) {
  let l = prev | 0; if (l < 2 && d > (l ? LOD_FAR : LOD_NEAR) + LOD_HYST) l = d > LOD_FAR + LOD_HYST ? 2 : 1;
  if (l > 0 && d < (l === 2 ? LOD_FAR : LOD_NEAR) - LOD_HYST) l = d < LOD_NEAR - LOD_HYST ? 0 : 1; return l;
}

// ---- three.js glue ----
// per-vertex penalty attributes, both read as squared distances (model units) added to the quadric error: the skin weights as a per-bone vector
// (folded to 16 buckets; collisions only make it a little lenient) times `lever`, roughly how far a weight difference moves a vertex when a joint
// bends (|dw| * lever), and the face morph deltas as they are (a vertex whose expression moves differently from its neighbour's costs that difference)
export function penaltyAttrs(geo, { lever = 0.03, morph = 1 } = {}) {
  const n = geo.attributes.position.count, out = [], si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  if (si && sw) { const d = new Float32Array(n * 16); for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) d[i * 16 + (si.getComponent(i, k) % 16)] += sw.getComponent(i, k); out.push({ data: d, size: 16, weight: lever * lever }); }
  for (const ma of geo.morphAttributes.position || []) { const d = new Float32Array(n * 3); for (let i = 0; i < n; i++) { d[i * 3] = ma.getX(i); d[i * 3 + 1] = ma.getY(i); d[i * 3 + 2] = ma.getZ(i); } out.push({ data: d, size: 3, weight: morph }); }
  return out;
}
const positions = (geo) => { const P = geo.attributes.position, n = P.count, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { pos[i * 3] = P.getX(i); pos[i * 3 + 1] = P.getY(i); pos[i * 3 + 2] = P.getZ(i); } return pos; };
const indexOf = (geo) => geo.index ? Uint32Array.from(geo.index.array) : Uint32Array.from({ length: geo.attributes.position.count }, (_, i) => i);
// a compact BufferGeometry (only the vertices the simplified index uses) carrying every attribute and morph attribute of `geo`
export function compactGeometry(THREE, geo, idx) {
  const n = geo.attributes.position.count, map = new Int32Array(n).fill(-1), keep = []; for (const v of idx) if (map[v] < 0) { map[v] = keep.length; keep.push(v); }
  const gather = (a) => {   // raw values (getComponent would denormalise Uint8 / Uint16 skin weights)
    const il = a.isInterleavedBufferAttribute, src = il ? a.data.array : a.array, st = il ? a.data.stride : a.itemSize, off = il ? a.offset : 0, s = a.itemSize, out = new src.constructor(keep.length * s);
    for (let i = 0; i < keep.length; i++) { const b = keep[i] * st + off; for (let k = 0; k < s; k++) out[i * s + k] = src[b + k]; } return new THREE.BufferAttribute(out, s, a.normalized); };
  const g = new THREE.BufferGeometry(); g.name = (geo.name || '') + '_lod';
  for (const k of Object.keys(geo.attributes)) g.setAttribute(k, gather(geo.attributes[k]));
  for (const k of Object.keys(geo.morphAttributes)) g.morphAttributes[k] = geo.morphAttributes[k].map(gather);
  g.morphTargetsRelative = geo.morphTargetsRelative;
  const ni = new (keep.length > 65535 ? Uint32Array : Uint16Array)(idx.length); for (let i = 0; i < idx.length; i++) ni[i] = map[idx[i]]; g.setIndex(new THREE.BufferAttribute(ni, 1));
  if (geo.boundingSphere) g.boundingSphere = geo.boundingSphere.clone(); if (geo.boundingBox) g.boundingBox = geo.boundingBox.clone();
  g.userData.lodOf = geo; return g;
}
// synchronous (tests, or no Worker): LOD geometries for `levels` [{ ratio, maxError }]
export function lodGeometries(THREE, geo, levels, opts) { return simplifyLevels(positions(geo), indexOf(geo), levels, penaltyAttrs(geo, opts)).map(ix => compactGeometry(THREE, geo, ix)); }

// Async: every geometry in `jobs` ([{ geo, levels, name, penalty }]) gets geo.userData.lods = [geo, lod1, lod2, ...] once the worker is done (the full mesh is
// used until then, and for good if workers are unavailable).  Returns a promise; lodStats keeps count for tests / probes.
export const lodStats = { queued: 0, done: 0, failed: 0, ms: 0, mainMs: 0, tris: {} };   // ms = worker CPU, mainMs = main-thread prep + compaction
// three.js draws Math.random for every new geometry / attribute UUID. The worker's results land whenever it finishes (wall-clock), so compacting them
// on the game's own Math.random shifted its stream by a varying number of draws between runs (a seeded test run was not reproducible: the walk
// section's lift queue came out different on most runs of the same seed). The UUIDs come from this private generator instead.
let ua = 0x2545f491; const uuidRandom = () => { ua = (ua + 0x6D2B79F5) >>> 0; let t = ua; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let worker = null, wid = 0; const waiting = new Map(), all = [];
function getWorker() {
  if (worker !== null) return worker;
  try { worker = new Worker(new URL('./meshlod-worker.js', import.meta.url), { type: 'module' }); worker.onmessage = (ev) => { const w = waiting.get(ev.data.id); if (w) { waiting.delete(ev.data.id); w(ev.data); } }; worker.onerror = () => { for (const [, w] of waiting) w({ error: 'worker' }); waiting.clear(); }; }
  catch { worker = false; }
  return worker;
}
export function requestLods(THREE, jobs) {
  const W = getWorker(); if (!W) return Promise.resolve(false);
  const ps = jobs.map(({ geo, levels, name, penalty }) => {
    if (geo.userData.lods || geo.userData.lodPending) return geo.userData.lodPending || Promise.resolve(true);
    const t0 = performance.now(), id = ++wid, pos = positions(geo), index = indexOf(geo), attrs = penaltyAttrs(geo, penalty); lodStats.queued++; lodStats.mainMs += performance.now() - t0;
    const p = new Promise(res => { waiting.set(id, (r) => {
      if (r.error || !r.idx) { lodStats.failed++; delete geo.userData.lodPending; return res(false); }
      const t1 = performance.now(), R = Math.random; Math.random = uuidRandom; try { geo.userData.lods = [geo, ...r.idx.map(ix => compactGeometry(THREE, geo, ix))]; } finally { Math.random = R; } delete geo.userData.lodPending; lodStats.done++; lodStats.ms += r.ms; lodStats.mainMs += performance.now() - t1;
      lodStats.tris[name || geo.name || id] = geo.userData.lods.map(g => g.index ? g.index.count / 3 : g.attributes.position.count / 3); res(true); }); });
    geo.userData.lodPending = p; W.postMessage({ id, pos, index, attrs, levels }, [pos.buffer, index.buffer]); return p;
  });
  const p = Promise.all(ps); all.push(p); return p;
}
export const lodsSettled = () => Promise.all(all.slice());
