// hairwear.js — hair and uniform detail for the rigged crew (js/humans.js) and the worn outfits (js/wearart.js). No new assets: everything is baked once per
// body kind from the meshes that are already loaded, and shaded inside the programs those materials already had (hair3 replaces hair2, garstyle3 replaces
// garstyle2; the worn-outfit cloth gets one program of its own, `wearcloth1`, which it used to share with the outfit trim).
//
// HAIR (bakeHair, hairPatch):
//   * per vertex `hairD` (vec4): xyz = the offset (hair mesh space) that lays the vertex down onto the scalp 2 mm above the skin (crop styles), w = distance to the
//     scalp in metres (0.9 = not over the head: long hair, the ponytail) for the hair cards; for the added parts w = part + random (1 = flyaway strand, 2 = bun)
//     and xyz = the part's strand direction
//   * added geometry, appended to the hair mesh itself (no extra draw call, same material, carried into the crowd LODs like every other attribute):
//     ~36 flyaway strands (two crossed tapered ribbons each, standing off the outer layer of the hair) and a coiled bun (crew_f, crew_f2) at the back of the head.
//     A part a person does not wear is collapsed to a point in the vertex shader (zero-area triangles, never rasterised).
//   * shading: strands radiating from the crown whorl (fine streaks + ~6 mm clumps that break the Kajiya-Kay band up), darker roots near the scalp, lighter
//     tips, a broken (not cut-out) hairline, wispy card edges; styles per person: crop / undercut / volume / length cut / ponytail off / bun / flyaway amount.
// CLOTH (bakeCloth, clothPatch):
//   * per vertex `cloth` (vec4): x = seam proximity (1 on a seam or hem, 0 at >= 15 mm), y = fold amount near the elbows, knees, armpits, ankles and the waist,
//     z = distance along the nearest seam (stitch spacing), w = signed distance along the limb from that joint (fold rings). Seams are the garment's UV seams and
//     open borders (hems, cuffs, collar) found by welding the mesh; distances are geodesic (Dijkstra over the welded edges).
//   * shading: a pressed groove on each seam with a row of topstitching beside it, compression folds (broken rings with cavity shading), long vertical drape,
//     abrasion and pilling on the folds / seam ridges / hems, a little grime on the trouser hems, shinier worn knees and elbows; derivative bump, faded out with
//     distance (fwidth) so the far crowd does not shimmer.
import * as THREE from 'three';

const KH = { crew_m: 1.79, crew_f: 1.66, crew_f2: 1.66, crew_heavy: 1.96 };   // = humans.js KIND_H: metres per body
const BAKE = {};   // kind -> { hairM, hairMi, crown, centre, tint, bunC, cloth: { M } }
export const hairwearBake = (kind) => BAKE[kind] || null;
export const hairwearStats = { ms: 0, kinds: 0 };
/** shared by every hair / cloth material: 0 skips the strand / seam / fold / wear detail (js/portraits.js sets it around its 128 px headshots) */
export const hwDetail = { value: 1 };

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }   // private stream: never touches Math.random
const findMesh = (root, pred) => { let o = null; root.traverse(q => { if (q.isSkinnedMesh && pred(q.material.name || '')) o = q; }); return o; };
// mesh-space position -> rest-pose world metres (the GLBs are quantised: the scale lives in the bone inverses, so map through the skin of one bone; at rest every bone agrees)
function restMap(o, s) {
  o.updateMatrixWorld(true); o.skeleton.bones.forEach(b => b.updateMatrixWorld(true));
  const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight; let k = 0; for (let j = 1; j < 4; j++) if (sw.getComponent(0, j) > sw.getComponent(0, k)) k = j;
  const bi = si.getComponent(0, k), M = new THREE.Matrix4().multiplyMatrices(o.matrixWorld, o.bindMatrixInverse).multiply(o.skeleton.bones[bi].matrixWorld).multiply(o.skeleton.boneInverses[bi]).multiply(o.bindMatrix);
  return new THREE.Matrix4().makeScale(s, s, s).multiply(M);
}
const restPos = (o, M) => { const P = o.geometry.attributes.position, n = P.count, R = new Float32Array(n * 3), v = new THREE.Vector3(); for (let i = 0; i < n; i++) { v.fromBufferAttribute(P, i).applyMatrix4(M); v.toArray(R, i * 3); } return R; };

/** bake hair + cloth data for one body kind (call once, before the crowd LODs are queued: they copy every attribute). scene = get(kind).scene at rest. */
export function bakeHairWear(kind, scene, nativeH) {
  if (BAKE[kind] || !KH[kind]) return BAKE[kind] || null; const t0 = performance.now();
  const s = KH[kind] / nativeH, B = BAKE[kind] = {};
  try { bakeHair(kind, scene, s, B); } catch (e) { console.warn('bakeHair', kind, e.message); }
  try { bakeCloth(kind, scene, s, B); } catch (e) { console.warn('bakeCloth', kind, e.message); }
  hairwearStats.ms += performance.now() - t0; hairwearStats.kinds++; return B;
}

// ------------------------------------------------------------------------------------------------ hair bake
function bakeHair(kind, scene, s, B) {
  const hair = findMesh(scene, n => n === 'hair'), body = findMesh(scene, n => n === 'body'); if (!hair || !body) return;
  const g = hair.geometry, Mh = restMap(hair, s), Mhi = Mh.clone().invert(), Mb = restMap(body, s), n0 = g.attributes.position.count;
  const H = restPos(hair, Mh), Bp = restPos(body, Mb), nb = body.geometry.attributes.position.count;
  const Bn = new Float32Array(nb * 3), NB = new THREE.Matrix3().getNormalMatrix(Mb), v = new THREE.Vector3();
  for (let i = 0; i < nb; i++) { v.fromBufferAttribute(body.geometry.attributes.normal, i).applyMatrix3(NB).normalize(); v.toArray(Bn, i * 3); }
  const box = new THREE.Box3(); for (let i = 0; i < n0; i++) box.expandByPoint(v.fromArray(H, i * 3));
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, dz = box.max.z - box.min.z;
  const crown = new THREE.Vector3(cx, box.max.y, cz - dz * 0.12), centre = new THREE.Vector3(cx, box.max.y - dz * 0.5, cz - dz * 0.05);   // as humans.js crownOf (metres)
  // head skin: body vertices carried mostly by the Head bone, hashed in a 4 cm grid
  const bn = body.skeleton.bones.map(b => b.name === 'Head'), bsi = body.geometry.attributes.skinIndex, bsw = body.geometry.attributes.skinWeight, C = 0.04, grid = new Map();
  const skull = new THREE.Box3(), cell = (x, y, z) => `${Math.floor(x / C)}|${Math.floor(y / C)}|${Math.floor(z / C)}`;
  for (let i = 0; i < nb; i++) { let w = 0; for (let k = 0; k < 4; k++) if (bn[bsi.getComponent(i, k)]) w += bsw.getComponent(i, k); if (w < 0.5) continue;
    const k = cell(Bp[i * 3], Bp[i * 3 + 1], Bp[i * 3 + 2]); (grid.get(k) || grid.set(k, []).get(k)).push(i); if (Bp[i * 3 + 1] > centre.y - 0.03) skull.expandByPoint(v.fromArray(Bp, i * 3)); }
  const LIFT = 0.002, D = new Float32Array(n0 * 4), d = new THREE.Vector3(), Li = new THREE.Matrix3().setFromMatrix4(Mhi);
  for (let i = 0; i < n0; i++) {
    const x = H[i * 3], y = H[i * 3 + 1], z = H[i * 3 + 2]; let best = -1, bd = 0.05 * 0.05;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) { const L = grid.get(cell(x + a * C, y + b * C, z + c * C)); if (L) for (const j of L) { const dd = (Bp[j * 3] - x) ** 2 + (Bp[j * 3 + 1] - y) ** 2 + (Bp[j * 3 + 2] - z) ** 2; if (dd < bd) { bd = dd; best = j; } } }
    if (best < 0) { D[i * 4 + 3] = 0.9; continue; }
    const nx = Bn[best * 3], ny = Bn[best * 3 + 1], nz = Bn[best * 3 + 2], h = (x - Bp[best * 3]) * nx + (y - Bp[best * 3 + 1]) * ny + (z - Bp[best * 3 + 2]) * nz;   // height above the skin along its normal
    D[i * 4 + 3] = Math.min(0.89, Math.max(0, h));
    if (h > LIFT) { d.set(-nx, -ny, -nz).multiplyScalar(h - LIFT).applyMatrix3(Li); D[i * 4] = d.x; D[i * 4 + 1] = d.y; D[i * 4 + 2] = d.z; }
  }
  // distance (m, to 12 mm) from the open border of the hair mesh over its welded surface: where that border lies on the skin it is the hairline / nape line
  const HE = new Float32Array(n0).fill(1); {
    const I0 = g.index ? g.index.array : Uint32Array.from({ length: n0 }, (_, i) => i), key = new Map(), wid = new Int32Array(n0); let nw = 0;
    for (let i = 0; i < n0; i++) { const k = `${Math.round(H[i * 3] * 1e4)}|${Math.round(H[i * 3 + 1] * 1e4)}|${Math.round(H[i * 3 + 2] * 1e4)}`; let w = key.get(k); if (w === undefined) { w = nw++; key.set(k, w); } wid[i] = w; }
    const WP = new Float32Array(nw * 3); for (let i = 0; i < n0; i++) WP.set(H.subarray(i * 3, i * 3 + 3), wid[i] * 3);
    const E = new Map(); for (let t = 0; t < I0.length; t += 3) for (let e = 0; e < 3; e++) { const a = wid[I0[t + e]], b = wid[I0[t + (e + 1) % 3]]; if (a === b) continue; const k = a < b ? a * nw + b : b * nw + a; E.set(k, (E.get(k) || 0) + 1); }
    const adj = Array.from({ length: nw }, () => []), dist = new Float32Array(nw).fill(Infinity), pq = new MinHeap();
    const bord = new Uint8Array(nw); for (const [k, c] of E) { const a = Math.floor(k / nw), b = k % nw, l = Math.hypot(WP[a * 3] - WP[b * 3], WP[a * 3 + 1] - WP[b * 3 + 1], WP[a * 3 + 2] - WP[b * 3 + 2]); adj[a].push(b, l); adj[b].push(a, l); if (c === 1) bord[a] = bord[b] = 1; }
    // only the OUTER border: step 8 mm on past the edge (away from the neighbours) and look for hair there; an inner card edge has more cards beyond it
    const G = 0.01, hg = new Map(), hk = (x, y, z) => `${Math.floor(x / G)}|${Math.floor(y / G)}|${Math.floor(z / G)}`; for (let w = 0; w < nw; w++) { const k = hk(WP[w * 3], WP[w * 3 + 1], WP[w * 3 + 2]); (hg.get(k) || hg.set(k, []).get(k)).push(w); }
    const lowW = new Float32Array(nw).fill(1); for (let i = 0; i < n0; i++) lowW[wid[i]] = Math.min(lowW[wid[i]], D[i * 4 + 3]);
    // (sources: border vertices on the skin, below the top of the head)
    for (let w = 0; w < nw; w++) { if (!bord[w] || lowW[w] > 0.006 || WP[w * 3 + 1] > crown.y - 0.04) continue; const L = adj[w]; let mx = 0, my = 0, mz = 0; for (let k = 0; k < L.length; k += 2) { mx += WP[L[k] * 3]; my += WP[L[k] * 3 + 1]; mz += WP[L[k] * 3 + 2]; } const c = L.length / 2 || 1;
      let ox = WP[w * 3] - mx / c, oy = WP[w * 3 + 1] - my / c, oz = WP[w * 3 + 2] - mz / c; const ol = Math.hypot(ox, oy, oz) || 1, px = WP[w * 3] + ox / ol * 0.008, py = WP[w * 3 + 1] + oy / ol * 0.008, pz = WP[w * 3 + 2] + oz / ol * 0.008;
      let cover = false; for (let a = -1; a <= 1 && !cover; a++) for (let b = -1; b <= 1 && !cover; b++) for (let e = -1; e <= 1 && !cover; e++) { const Lq = hg.get(hk(px + a * G, py + b * G, pz + e * G)); if (Lq) for (const q of Lq) if ((WP[q * 3] - px) ** 2 + (WP[q * 3 + 1] - py) ** 2 + (WP[q * 3 + 2] - pz) ** 2 < 0.005 * 0.005) { cover = true; break; } }
      if (!cover) { dist[w] = 0; pq.push(0, w); } }
    while (pq.size) { const [dv, w] = pq.pop(); if (dv > dist[w] || dv > 0.012) continue; const L = adj[w]; for (let k = 0; k < L.length; k += 2) { const u = L[k], nd = dv + L[k + 1]; if (nd < dist[u]) { dist[u] = nd; pq.push(nd, u); } } }
    for (let i = 0; i < n0; i++) HE[i] = Math.min(1, dist[wid[i]]);
  }
  // ---- added parts: flyaway strands and a bun, built in metres then mapped back to the hair's mesh space
  const R = rng(0x9e37 + kind.length * 7919), headBone = hair.skeleton.bones.findIndex(b => b.name === 'Head'), P = [], N = [], UV = [], HD = [], IX = []; let nv = n0;
  const top = box.max.y - 0.003, out = new THREE.Vector3(), dir = new THREE.Vector3(), w1 = new THREE.Vector3(), w2 = new THREE.Vector3(), p = new THREE.Vector3();
  const vert = (q, nrm, u, vv, t, part) => { P.push(q.x, q.y, q.z); N.push(nrm.x, nrm.y, nrm.z); UV.push(u, vv); HD.push(t.x, t.y, t.z, part); return nv++; };
  // flyaways: roots on the outer layer of the upper half of the hair, strands leave the surface and curl out / down
  const cand = []; { let maxR = 0; const rr = new Float32Array(n0); for (let i = 0; i < n0; i++) { rr[i] = Math.hypot(H[i * 3] - centre.x, H[i * 3 + 1] - centre.y, H[i * 3 + 2] - centre.z); if (D[i * 4 + 3] < 0.89) maxR = Math.max(maxR, rr[i]); }   // over the head only (not the length of long hair)
    for (let i = 0; i < n0; i++) if (rr[i] > maxR * 0.78 && H[i * 3 + 1] > centre.y - 0.02 && D[i * 4 + 3] < 0.89) cand.push(i); }
  const NS = cand.length ? 36 : 0, SEG = 4;
  for (let k = 0; k < NS; k++) {
    const i = cand[Math.floor(R() * cand.length)], r = R(); p.fromArray(H, i * 3); out.subVectors(p, centre).normalize(); p.addScaledVector(out, -0.002);
    dir.subVectors(p, crown).normalize().multiplyScalar(0.8).addScaledVector(out, 0.3 + R() * 0.45).add(new THREE.Vector3(R() - 0.5, R() - 0.6, R() - 0.5).multiplyScalar(0.5)).normalize();
    const len = 0.012 + R() * R() * 0.028, wd = 0.0004 + R() * 0.00025, curl = new THREE.Vector3(R() - 0.5, -0.6 - R() * 0.6, R() - 0.5).multiplyScalar(0.9 / len * 0.012);
    const pts = []; const q = p.clone(), dd = dir.clone(); for (let j = 0; j <= SEG; j++) { pts.push(q.clone()); dd.addScaledVector(curl, len / SEG).normalize(); q.addScaledVector(dd, len / SEG); if (q.y > top) q.y = top; }
    w1.crossVectors(dir, out).normalize(); if (w1.lengthSq() < 1e-6) w1.set(1, 0, 0); w2.crossVectors(dir, w1).normalize();
    for (const wv of [w1, w2]) { const base = nv;
      for (let j = 0; j <= SEG; j++) { const t = j / SEG, hw = wd * (1 - 0.7 * t), tg = j < SEG ? pts[j + 1].clone().sub(pts[j]).normalize() : pts[j].clone().sub(pts[j - 1]).normalize(), nrm = new THREE.Vector3().crossVectors(tg, wv).normalize();
        vert(pts[j].clone().addScaledVector(wv, -hw), nrm, 0, t, tg, 1 + r * 0.98); vert(pts[j].clone().addScaledVector(wv, hw), nrm, 1, t, tg, 1 + r * 0.98); }
      for (let j = 0; j < SEG; j++) { const a = base + j * 2; IX.push(a, a + 1, a + 3, a, a + 3, a + 2); } }
  }
  // bun: a coiled torus at the back of the head, a little below the crown (crew_f: where the ponytail starts; crew_f2: low on the nape-side of the crown)
  if (kind === 'crew_f' || kind === 'crew_f2') {
    const bc = new THREE.Vector3(cx, centre.y + (kind === 'crew_f' ? 0.01 : -0.035), skull.min.z - 0.012), RB = 0.021, rb = 0.015, TS = 18, PS = 8, ax = new THREE.Vector3(0, kind === 'crew_f' ? 0.3 : 0.1, -1).normalize();
    const e1 = new THREE.Vector3(1, 0, 0), e2 = new THREE.Vector3().crossVectors(ax, e1).normalize(); B.bunC = bc.clone();
    const base = nv;
    for (let a = 0; a <= TS; a++) for (let b = 0; b <= PS; b++) {
      const ta = a / TS * Math.PI * 2, pb = b / PS * Math.PI * 2, ring = e1.clone().multiplyScalar(Math.cos(ta)).addScaledVector(e2, Math.sin(ta));
      const nrm = ring.clone().multiplyScalar(Math.cos(pb)).addScaledVector(ax, Math.sin(pb)), q = bc.clone().addScaledVector(ring, RB).addScaledVector(nrm, rb).addScaledVector(ax, rb * 0.35);
      const tg = ring.clone().multiplyScalar(-Math.sin(pb)).addScaledVector(ax, Math.cos(pb)).normalize();   // hair wraps round the tube (poloidal), with a twist
      vert(q, nrm, a / TS, b / PS, tg.addScaledVector(new THREE.Vector3().crossVectors(ax, ring), 0.35).normalize(), 2.5);
    }
    for (let a = 0; a < TS; a++) for (let b = 0; b < PS; b++) { const i0 = base + a * (PS + 1) + b, i1 = i0 + PS + 1; IX.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1); }
    // a knot filling the middle of the ring
    const kb = nv, ks = new THREE.SphereGeometry(RB * 1.15, 9, 6), kp = ks.attributes.position, kn = ks.attributes.normal;
    for (let i = 0; i < kp.count; i++) { const q = new THREE.Vector3().fromBufferAttribute(kp, i), nn = new THREE.Vector3().fromBufferAttribute(kn, i); const lq = e1.clone().multiplyScalar(q.x).addScaledVector(e2, q.y).addScaledVector(ax, q.z * 0.75 + rb * 0.55);
      const nw = e1.clone().multiplyScalar(nn.x).addScaledVector(e2, nn.y).addScaledVector(ax, nn.z).normalize(); vert(bc.clone().add(lq), nw, ks.attributes.uv.getX(i), ks.attributes.uv.getY(i), new THREE.Vector3().crossVectors(ax, nw).normalize(), 2.5); }
    for (let i = 0; i < ks.index.count; i++) IX.push(kb + ks.index.array[i]); ks.dispose();
  }
  // ---- rebuild the geometry with float attributes (the GLB's are quantised int16 / uint8: the new vertices may fall outside its box)
  const he = new Float32Array(nv).fill(1); he.set(HE);
  const na = nv - n0, tot = nv, pos = new Float32Array(tot * 3), nor = new Float32Array(tot * 3), uv = new Float32Array(tot * 2), si = new Uint16Array(tot * 4), sw = new Float32Array(tot * 4), hd = new Float32Array(tot * 4);
  const A = g.attributes; for (let i = 0; i < n0; i++) { pos[i * 3] = A.position.getX(i); pos[i * 3 + 1] = A.position.getY(i); pos[i * 3 + 2] = A.position.getZ(i); nor[i * 3] = A.normal.getX(i); nor[i * 3 + 1] = A.normal.getY(i); nor[i * 3 + 2] = A.normal.getZ(i);
    uv[i * 2] = A.uv.getX(i); uv[i * 2 + 1] = A.uv.getY(i); for (let k = 0; k < 4; k++) { si[i * 4 + k] = A.skinIndex.getComponent(i, k); sw[i * 4 + k] = A.skinWeight.getComponent(i, k); } }
  hd.set(D);
  const NHi = new THREE.Matrix3().getNormalMatrix(Mhi);
  for (let j = 0; j < na; j++) { const i = n0 + j; v.fromArray(P, j * 3).applyMatrix4(Mhi).toArray(pos, i * 3); v.fromArray(N, j * 3).applyMatrix3(NHi).normalize().toArray(nor, i * 3);
    uv[i * 2] = UV[j * 2]; uv[i * 2 + 1] = UV[j * 2 + 1]; si[i * 4] = Math.max(0, headBone); sw[i * 4] = 1; v.fromArray(HD, j * 4).applyMatrix3(Li); hd[i * 4] = v.x; hd[i * 4 + 1] = v.y; hd[i * 4 + 2] = v.z; hd[i * 4 + 3] = HD[j * 4 + 3]; }
  const oldI = g.index ? Array.from(g.index.array) : Array.from({ length: n0 }, (_, i) => i), idx = tot > 65535 ? new Uint32Array(oldI.length + IX.length) : new Uint16Array(oldI.length + IX.length); idx.set(oldI); idx.set(IX, oldI.length);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4)); g.setAttribute('hairD', new THREE.BufferAttribute(hd, 4)); g.setAttribute('hairE', new THREE.BufferAttribute(he, 1)); g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingBox(); g.computeBoundingSphere();
  // the parts' colour: the mean of the opaque texels of the hair map (linear), so the bun and strands match the cards without sampling the map's alpha
  let tint = new THREE.Vector3(0.3, 0.24, 0.2);
  try { const img = hair.material.map?.image; if (img && typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 32, 32); const px = x.getImageData(0, 0, 32, 32).data; let r = 0, gg = 0, b = 0, cnt = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 200) { r += px[i]; gg += px[i + 1]; b += px[i + 2]; cnt++; } if (cnt) { const lin = (u) => { u /= cnt * 255; return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4); }; tint = new THREE.Vector3(lin(r), lin(gg), lin(b)); } } } catch (e) { /* tainted / not decoded: keep the default */ }
  Object.assign(B, { hairM: Mh, hairMi: new THREE.Matrix3().setFromMatrix4(Mhi), crown, centre, tint, hairTop: box.max.y, parts: na });
}

// ------------------------------------------------------------------------------------------------ hair styles
// per kind: [crop, undercut, volume (m), flyaways 0..1, cut (m below the crown, 0 = none), ponytail off: hair higher than this above the scalp (m, 0 = keep), bun 0/1]; index 0 = the mesh as authored
const STYLES = {
  crew_m: [[0, 0, 0, 0.5, 0, 0, 0], [0.55, 0, 0, 0.25, 0, 0, 0], [0.92, 1, 0, 0, 0, 0, 0], [0, 0, 0.006, 0.8, 0, 0, 0], [0.15, 1, 0.002, 0.4, 0, 0, 0]],
  crew_heavy: [[0, 0, 0, 0.5, 0, 0, 0], [0.55, 0, 0, 0.25, 0, 0, 0], [0.92, 1, 0, 0, 0, 0, 0], [0, 0, 0.006, 0.8, 0, 0, 0], [0.15, 1, 0.002, 0.4, 0, 0, 0]],
  crew_f: [[0, 0, 0, 0.6, 0, 0, 0], [0.25, 0, 0, 0.35, 0, 0.022, 1], [0.6, 0, 0, 0.3, 0, 0.022, 0], [0.35, 0, 0, 0.2, 0, 0, 0], [0, 0, 0.004, 1, 0, 0, 0]],
  crew_f2: [[0, 0, 0, 0.6, 0, 0, 0], [0, 0, 0, 0.5, 0.33, 0, 0], [0, 0, 0.003, 0.5, 0.215, 0, 0], [0.2, 0, 0, 0.35, 0.18, 0, 1], [0.55, 0.6, 0, 0.3, 0.14, 0, 0]],
};
export const HAIR_STYLE_COUNT = 5;
/** a style index from a 32-bit hash: index 0 (as authored) twice as likely as each of the others */
export const pickHairStyle = (hash) => [0, 0, 1, 2, 3, 4][(hash >>> 0) % 6];
/** style for one person: index 0..4 (see STYLES), seed 0..1 varies the strand / clump pattern */
export function hairStyleFor(kind, index = 0, seed = 0) {
  const L = STYLES[kind]; if (!L) return null; const i = Math.max(0, Math.min(L.length - 1, index | 0)), st = L[i];
  return { index: i, style: new THREE.Vector4(st[0], st[1], st[2], st[3]), cut: new THREE.Vector4(st[4], st[5], st[6], seed % 1) };
}

// ------------------------------------------------------------------------------------------------ hair shader patch (call inside the hair material's onBeforeCompile, after its own edits)
// value noise from one shared 32^3 random lattice (trilinear filtered, wraps): one texture fetch per call instead of eight inlined hashes. The hashed version made
// the hair / cloth programs big enough that compiling and running them in software GL cost ~1 s of boarding (91 portraits + the deck's crew).
const NOISE = `
uniform highp sampler3D uHWNoise;
float hw_n( vec3 x ) { return texture( uHWNoise, x * 0.03125 ).r; }`;
let noiseTex = null;
function hwNoise() {
  if (noiseTex) return noiseTex; const N = 32, d = new Uint8Array(N * N * N), R = rng(0x51ed27); for (let i = 0; i < d.length; i++) d[i] = Math.floor(R() * 256);
  const t = new THREE.Data3DTexture(d, N, N, N); t.format = THREE.RedFormat; t.type = THREE.UnsignedByteType; t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping; t.unpackAlignment = 1; t.needsUpdate = true; return (noiseTex = t);
}
/** uniforms for one person's hair material: null when this kind was not baked */
export function hairUniforms(kind, st) {
  const B = BAKE[kind]; if (!B?.hairM) return null; st = st || hairStyleFor(kind, 0);
  return { uHWDetail: hwDetail, uHWNoise: { value: hwNoise() }, uHairM: { value: B.hairM }, uHairMi: { value: B.hairMi }, uHCrown: { value: B.crown }, uHCentre: { value: B.centre }, uHairTint: { value: B.tint }, uHairStyle: { value: st.style }, uHairCut: { value: st.cut } };
}
export function hairPatch(sh, u) {
  if (!u) return; Object.assign(sh.uniforms, u);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute vec4 hairD; attribute float hairE; varying float vHE; varying float vHS; uniform mat4 uHairM; uniform mat3 uHairMi; uniform vec3 uHCrown, uHCentre; uniform vec4 uHairStyle, uHairCut; varying vec3 vHP; varying vec3 vHD; varying float vHW;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
  { vec3 rp = ( uHairM * vec4( position, 1.0 ) ).xyz; float part = floor( hairD.w ); vHW = hairD.w; vHP = rp; vHE = hairE; vHS = hairD.w;
    if ( part < 0.5 ) {   // the cards: crop toward the scalp (more below the band for an undercut), volume out from the head centre
      vHD = rp - uHCrown; float band = smoothstep( uHCrown.y - 0.055, uHCrown.y - 0.085, rp.y );
      float crop = clamp( uHairStyle.x + uHairStyle.y * band, 0.0, 0.97 );
      if ( hairD.w < 0.89 ) vHW = hairD.w * ( 1.0 - crop );   // height above the scalp after the crop (roots, hairline)
      transformed += hairD.xyz * crop + uHairMi * ( normalize( rp - uHCentre ) * uHairStyle.z * ( 1.0 - crop ) * smoothstep( 0.0, 0.006, hairD.w ) );
    } else {
      vHD = mat3( uHairM ) * hairD.xyz;
      bool show = part < 1.5 ? fract( hairD.w ) < uHairStyle.w : uHairCut.z > 0.5;
      if ( !show ) transformed = vec3( 0.0 );   // a part this person does not wear: every vertex to one point
    } }`);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform float uHWDetail; uniform vec3 uHCrown, uHCentre, uHairTint; uniform vec4 uHairStyle, uHairCut; varying vec3 vHP; varying vec3 vHD; varying float vHW; varying float vHE; varying float vHS;
float gHairShift = 0.0, gHairSpec = 1.0, gHairH = 0.0;` + NOISE)
    .replace('#include <color_fragment>', `#include <color_fragment>
  { float part = floor( vHW ), seed = uHairCut.w * 31.0;
    if ( part < 0.5 ) {
      float r = length( vHD ); vec3 t = vHD / max( r, 1e-4 );
      // strands radiate from the crown whorl: noise on the direction from the crown (across the strands) stretched slowly along their length
      vec3 qc = t * 16.0 + vec3( 0.0, r * 9.0, 0.0 ) + seed, qs = t * 125.0 + vec3( 0.0, r * 30.0, 0.0 );
      bool det = uHWDetail > 0.5; float clump = det ? hw_n( qc ) : 0.5, strand = det ? hw_n( qs ) * 0.65 + hw_n( qs * 2.3 + 5.1 ) * 0.35 : 0.5;
      float fw = length( fwidth( qs ) ); strand = mix( strand, 0.5, smoothstep( 0.5, 1.5, fw ) );
      float scalp = vHW, root = 1.0 - smoothstep( 0.0015, 0.012, scalp ), tip = smoothstep( 0.1, 0.32, r );
      diffuseColor.rgb *= mix( 0.74, 1.14, strand ) * mix( 0.68, 1.12, clump ) * mix( 1.0, 0.8, root ) * ( 1.0 + 0.14 * tip );
      gHairShift = ( clump - 0.5 ) * 0.3; gHairSpec = 0.55 + 0.9 * strand;
      // card edges break into strands instead of a smooth alpha ramp; the hairline thins out into single hairs over the skin
      diffuseColor.a *= mix( 1.0, 0.45 + 1.1 * strand, smoothstep( 0.95, 0.4, diffuseColor.a ) );
      diffuseColor.a *= smoothstep( 0.15, 0.55, strand + scalp / 0.0035 * 0.6 + 0.05 );
      float cropK = clamp( uHairStyle.x + uHairStyle.y * smoothstep( uHCrown.y - 0.055, uHCrown.y - 0.085, vHP.y ), 0.0, 1.0 );
      if ( det ) diffuseColor.a *= mix( 1.0, 0.5 + 0.45 * hw_n( vHP * 900.0 ), cropK * cropK * step( vHS, 0.88 ) );   // cropped close: thinner cover, the scalp shows through (alpha to coverage)
      float line = ( 1.0 - smoothstep( 0.0, 0.008, vHE ) ) * ( 1.0 - smoothstep( 0.004, 0.012, vHS ) );   // the mesh border where it lies on the skin: hairline, nape
      float hl = det ? hw_n( vHP * 300.0 + seed ) : 0.5;   // ~3 mm tufts: they read at talking distance (strand-scale noise averages out there, and finer breaks up into specks)
      diffuseColor.a *= mix( 1.0, 0.2 + 0.8 * smoothstep( 0.3, 0.7, hl * 0.8 + vHE / 0.008 - 0.2 ), line );
      gHairSpec *= 1.0 - 0.7 * line; diffuseColor.rgb *= 1.0 + 0.12 * line;   // fine baby hair at the line: no strand glints, a touch lighter (thin, backlit)
      gHairH = strand * 0.00022 + clump * 0.0007;
      // length cut (bob / shoulder length): uneven clumped ends; ponytail off past a radius from the head centre
      if ( uHairCut.x > 0.0 ) { float cy = uHCrown.y - uHairCut.x + ( clump - 0.5 ) * 0.03 + ( strand - 0.5 ) * 0.01; if ( vHP.y < cy ) discard; diffuseColor.a *= smoothstep( 0.0, 0.012, vHP.y - cy ); }
      if ( uHairCut.y > 0.0 && vHW > uHairCut.y + ( strand - 0.5 ) * 0.008 ) discard;   // ponytail off: everything standing well clear of the scalp
    } else if ( part < 1.5 ) {   // flyaway: a tapered single hair (uv.x across, uv.y root -> tip)
      diffuseColor.rgb = diffuse * uHairTint * 1.05; float ac = 1.0 - abs( vMapUv.x * 2.0 - 1.0 );
      diffuseColor.a = smoothstep( 0.05, 0.6, ac ) * ( 1.0 - 0.55 * vMapUv.y ); gHairSpec = 1.3;
    } else {   // bun: hair wrapped round the coil
      vec3 t = normalize( vHD ); float strand = hw_n( vec3( vMapUv * vec2( 260.0, 40.0 ), seed ) ) * 0.7 + hw_n( vec3( vMapUv * vec2( 70.0, 12.0 ), seed + 3.0 ) ) * 0.3;
      diffuseColor.rgb = diffuse * uHairTint * mix( 0.6, 1.2, strand ); diffuseColor.a = 1.0; gHairShift = ( strand - 0.5 ) * 0.2; gHairSpec = 0.6 + 0.6 * strand; gHairH = strand * 0.0006;
    } }`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  if ( uHWDetail > 0.5 ) { vec3 dpx = dFdx( -vViewPosition ), dpy = dFdy( -vViewPosition ); float hx = dFdx( gHairH ), hy = dFdy( gHairH );
    vec3 r1 = cross( dpy, normal ), r2 = cross( normal, dpx ); float det = dot( dpx, r1 );
    vec3 grad = sign( det ) * ( hx * r1 + hy * r2 ); normal = normalize( abs( det ) * normal - grad ); }`)
    .replace('vec3 T1 = normalize( T - N * 0.12 )', 'vec3 T1 = normalize( T - N * ( 0.12 + gHairShift ) )')
    .replace('pow( s1, 48.0 ) * 0.06', 'pow( s1, 48.0 ) * 0.06 * gHairSpec').replace('pow( s2, 12.0 ) * 0.06', 'pow( s2, 12.0 ) * 0.06 * gHairSpec');
}

// ------------------------------------------------------------------------------------------------ cloth bake
// joints whose bending makes compression folds: [bone at the joint, bone the limb runs toward, weight, radius limit (m), reach along the limb (m)]
const JOINTS = [['lowerarm_l', 'hand_l', 1, 0.085, 0.11], ['lowerarm_r', 'hand_r', 1, 0.085, 0.11], ['calf_l', 'foot_l', 1, 0.1, 0.12], ['calf_r', 'foot_r', 1, 0.1, 0.12],
  ['upperarm_l', 'lowerarm_l', 0.55, 0.075, 0.08], ['upperarm_r', 'lowerarm_r', 0.55, 0.075, 0.08], ['foot_l', 'calf_l', 0.8, 0.09, 0.1], ['foot_r', 'calf_r', 0.8, 0.09, 0.1]];
export function clothAttr(R, n, bones, s, waistY) {   // R: rest metres per vertex; bones: name -> rest position (metres). Returns Float32Array n*4 with y, w filled (fold, axial)
  const out = new Float32Array(n * 4), J = JOINTS.map(([a, b, w, rad, reach]) => bones[a] && bones[b] ? { p: bones[a], ax: bones[b].clone().sub(bones[a]).normalize(), w, rad, reach } : null).filter(Boolean), d = new THREE.Vector3();
  for (let i = 0; i < n; i++) { let best = 0, ax = 0; d.set(0, 0, 0);
    for (const j of J) { d.set(R[i * 3] - j.p.x, R[i * 3 + 1] - j.p.y, R[i * 3 + 2] - j.p.z); const along = d.dot(j.ax), rad = Math.sqrt(Math.max(0, d.lengthSq() - along * along)); if (rad > j.rad) continue;
      const f = j.w * Math.max(0, 1 - Math.abs(along) / j.reach) ** 0.7; if (f > best) { best = f; ax = along; } }
    if (waistY !== null) { const dy = R[i * 3 + 1] - waistY; if (dy > -0.02 && dy < 0.1) { const f = 0.45 * (1 - Math.abs(dy - 0.035) / 0.065); if (f > best) { best = f; ax = dy * 1.3; } } }   // blousing above the belt
    out[i * 4 + 1] = Math.min(1, best); out[i * 4 + 3] = ax; }
  return out;
}
function bakeCloth(kind, scene, s, B) {
  const gm = findMesh(scene, n => n.startsWith('garment') && !n.includes('shoes')); if (!gm) return;
  const g = gm.geometry, n = g.attributes.position.count, M = restMap(gm, s), R = restPos(gm, M), I = g.index ? g.index.array : Uint32Array.from({ length: n }, (_, i) => i), U = g.attributes.uv;
  // weld by position (0.1 mm)
  const key = new Map(), wid = new Int32Array(n); let nw = 0;
  for (let i = 0; i < n; i++) { const k = `${Math.round(R[i * 3] * 1e4)}|${Math.round(R[i * 3 + 1] * 1e4)}|${Math.round(R[i * 3 + 2] * 1e4)}`; let w = key.get(k); if (w === undefined) { w = nw++; key.set(k, w); } wid[i] = w; }
  const WP = new Float32Array(nw * 3); for (let i = 0; i < n; i++) WP.set(R.subarray(i * 3, i * 3 + 3), wid[i] * 3);
  // edges: count the triangles on each welded edge and whether its two sides disagree on uv (a UV seam = a sewn seam on these garments)
  const E = new Map(), uvk = (i) => `${U.getX(i).toFixed(4)},${U.getY(i).toFixed(4)}`;
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + (e + 1) % 3], wa = wid[a], wb = wid[b]; if (wa === wb) continue;
    const k = wa < wb ? wa * nw + wb : wb * nw + wa, sig = wa < wb ? uvk(a) + uvk(b) : uvk(b) + uvk(a), r = E.get(k); if (!r) E.set(k, { a: Math.min(wa, wb), b: Math.max(wa, wb), c: 1, sig, seam: false }); else { r.c++; if (r.sig !== sig) r.seam = true; } }
  const adj = Array.from({ length: nw }, () => []), sadj = Array.from({ length: nw }, () => []), src = new Uint8Array(nw);
  for (const r of E.values()) { const l = Math.hypot(WP[r.a * 3] - WP[r.b * 3], WP[r.a * 3 + 1] - WP[r.b * 3 + 1], WP[r.a * 3 + 2] - WP[r.b * 3 + 2]); adj[r.a].push(r.b, l); adj[r.b].push(r.a, l);
    if (r.c === 1 || r.seam) { src[r.a] = src[r.b] = 1; sadj[r.a].push(r.b, l); sadj[r.b].push(r.a, l); } }
  // arc length along each seam / hem chain (Dijkstra on the seam edges from one end of each component)
  const arc = new Float32Array(nw).fill(-1);
  const dijkstra = (starts, A, dist, carry, maxD) => {
    const pq = new MinHeap(); for (const [v, dv, c] of starts) { dist[v] = dv; if (carry) carry[v] = c; pq.push(dv, v); }
    while (pq.size) { const [dv, v] = pq.pop(); if (dv > dist[v] || dv > maxD) continue; const L = A[v]; for (let k = 0; k < L.length; k += 2) { const u = L[k], nd = dv + L[k + 1]; if (nd < dist[u]) { dist[u] = nd; if (carry) carry[u] = carry[v]; pq.push(nd, u); } } } };
  { const seen = new Uint8Array(nw), dist = new Float32Array(nw).fill(Infinity);
    for (let v = 0; v < nw; v++) { if (!src[v] || seen[v]) continue; const comp = [], st = [v]; seen[v] = 1; while (st.length) { const x = st.pop(); comp.push(x); for (let k = 0; k < sadj[x].length; k += 2) { const u = sadj[x][k]; if (!seen[u]) { seen[u] = 1; st.push(u); } } }
      let s0 = comp.find(x => sadj[x].length === 2) ?? comp[0]; dijkstra([[s0, 0, 0]], sadj, dist, null, Infinity); for (const x of comp) arc[x] = dist[x] === Infinity ? 0 : dist[x]; } }
  // distance from the nearest seam / hem over the whole garment (to 15 mm), carrying that seam vertex's arc
  const dist = new Float32Array(nw).fill(Infinity), carry = new Float32Array(nw), starts = []; for (let v = 0; v < nw; v++) if (src[v]) starts.push([v, 0, arc[v]]);
  dijkstra(starts, adj, dist, carry, 0.03);
  // folds: joints from the skeleton at rest
  const bones = {}; for (const b of gm.skeleton.bones) bones[b.name] = b.getWorldPosition(new THREE.Vector3()).multiplyScalar(s);
  const waistY = bones.pelvis ? bones.pelvis.y + 0.075 * (KH[kind] / 1.75) : null, F = clothAttr(R, n, bones, s, waistY);
  for (let i = 0; i < n; i++) { const w = wid[i], d = dist[w]; F[i * 4] = d === Infinity ? 0 : Math.max(0, 1 - d / 0.015); F[i * 4 + 2] = d === Infinity ? 0 : carry[w]; }
  g.setAttribute('cloth', new THREE.BufferAttribute(F, 4));
  B.cloth = { M, seams: src.reduce((a, b) => a + b, 0) };
}
class MinHeap {   // binary heap of [key, value]
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(k, v) { const K = this.k, V = this.v; let i = K.length; K.push(k); V.push(v); while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= k) break; K[i] = K[p]; V[i] = V[p]; i = p; } K[i] = k; V[i] = v; }
  pop() { const K = this.k, V = this.v, rk = K[0], rv = V[0], lk = K.pop(), lv = V.pop(); const n = K.length; if (n) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && K[c + 1] < K[c]) c++; if (K[c] >= lk) break; K[i] = K[c]; V[i] = V[c]; i = c; } K[i] = lk; V[i] = lv; } return [rk, rv]; }
}

// ------------------------------------------------------------------------------------------------ cloth shader patch
// mode 'garment': the casual-clothes uniform (zone attribute, cloth maps), position mapped to rest metres by uClothM; mode 'wear': the worn outfits (vertex colours,
// positions already in the body's own near-metre space, uClothM = identity)
export function clothUniforms(kind, wear = 0.7) { const M = BAKE[kind]?.cloth?.M; return { uHWDetail: hwDetail, uHWNoise: { value: hwNoise() }, uClothM: { value: M || new THREE.Matrix4() }, uWear: { value: wear } }; }
export function clothPatch(sh, u) {
  Object.assign(sh.uniforms, u);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 cloth; uniform mat4 uClothM; varying vec4 vCloth; varying vec3 vCP;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vCloth = cloth; vCP = ( uClothM * vec4( position, 1.0 ) ).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vCloth; varying vec3 vCP; uniform float uWear, uHWDetail;\nfloat gClothH = 0.0, gClothR = 1.0;' + NOISE)
    .replace('#include <color_fragment>', `#include <color_fragment>
  if ( uHWDetail > 0.5 ) { float sp = vCloth.x, sd = ( 1.0 - sp ) * 0.015, on = step( 0.0005, sp );
    float fwd = max( fwidth( sd ), 1e-5 ), fade = 1.0 - smoothstep( 0.0008, 0.0022, fwd );   // seam detail fades out once a millimetre is under a pixel or so
    float groove = on * ( 1.0 - smoothstep( 0.0005, 0.0005 + max( 0.0011, fwd ), sd ) ) * fade;
    float ridge = on * smoothstep( 0.001, 0.002, sd ) * ( 1.0 - smoothstep( 0.0022, 0.004, sd ) );   // the seam allowance under the cloth: a soft raised band
    float P = 0.0034, fz = fwidth( vCloth.z ) / P, ph = fract( vCloth.z / P );
    float dash = mix( smoothstep( 0.12, 0.28, ph ) * ( 1.0 - smoothstep( 0.72, 0.88, ph ) ), 0.55, clamp( fz * 1.6 - 0.4, 0.0, 1.0 ) );
    float row = on * ( 1.0 - smoothstep( 0.00035, 0.00035 + max( 0.0005, fwd ), abs( sd - 0.0048 ) ) ) * fade, stitch = row * dash;
    // compression folds round the joints (broken rings, a little diagonal), long drape folds elsewhere
    float n1 = hw_n( vCP * 21.0 ), n2 = hw_n( vCP * 47.0 + 3.7 );
    float n3 = hw_n( vCP * 13.0 + 9.1 ), fold = vCloth.y * smoothstep( 0.3, 0.72, n1 * 0.6 + n3 * 0.4 + 0.08 );
    float fph = vCloth.w * 6.2832 / ( 0.024 + 0.014 * n3 ) + 5.0 * n2 + 3.5 * n1;   // uneven spacing, bent and broken rings (buckling, not corrugation)
    float wave = 0.5 + 0.5 * sin( fph ), crest = wave * wave * ( 3.0 - 2.0 * wave ) * smoothstep( 0.1, 0.5, n2 );
    float drape = hw_n( vec3( vCP.x * 30.0, vCP.y * 3.6, vCP.z * 30.0 ) );
    gClothH = fold * crest * 0.0028 + drape * 0.0032 - groove * 0.0006 + ridge * 0.00035 + stitch * 0.0003;
    diffuseColor.rgb *= ( 1.0 - 0.17 * groove ) * ( 1.0 - 0.16 * fold * ( 1.0 - crest ) ) * ( 0.97 + 0.06 * drape );   // fold valleys and the seam line in cavity shade
    // wear: abrasion on fold crests, seam ridges and hems, pilling, grime on the trouser hems; shinier worn knees / elbows
    float wn = hw_n( vCP * 90.0 + 7.0 ), hem = on * ( 1.0 - smoothstep( 0.0, 0.006, sd ) );
    float abr = clamp( fold * crest * 0.9 + ridge * 0.6 + hem * 0.35, 0.0, 1.0 ) * smoothstep( 0.3, 0.75, wn ) * uWear;
    vec3 faded = mix( diffuseColor.rgb, vec3( dot( diffuseColor.rgb, vec3( 0.3, 0.59, 0.11 ) ) ), 0.35 ) * 1.22 + 0.012;
    diffuseColor.rgb = mix( diffuseColor.rgb, faded, abr * 0.55 );
    float pill = smoothstep( 0.78, 0.95, hw_n( vCP * 700.0 ) ) * ( 1.0 - smoothstep( 0.0004, 0.0012, length( fwidth( vCP ) ) ) ) * uWear;
    diffuseColor.rgb *= 1.0 + 0.1 * pill;
    float grime = ( 1.0 - smoothstep( 0.08, 0.3, vCP.y ) ) * smoothstep( 0.35, 0.7, n1 ) * uWear;
    diffuseColor.rgb *= 1.0 - 0.22 * grime;
    diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 1.3 + 0.02, stitch * 0.55 );   // thread a shade lighter than the cloth
    gClothR = 1.0 - 0.28 * fold * crest * uWear + 0.1 * pill - 0.15 * stitch; }`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = clamp( roughnessFactor * gClothR, 0.05, 1.0 );')
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  if ( uHWDetail > 0.5 ) { vec3 dpx = dFdx( -vViewPosition ), dpy = dFdy( -vViewPosition ); float hx = dFdx( gClothH ), hy = dFdy( gClothH );
    vec3 r1 = cross( dpy, normal ), r2 = cross( normal, dpx ); float det = dot( dpx, r1 );
    vec3 grad = sign( det ) * ( hx * r1 + hy * r2 ); normal = normalize( abs( det ) * normal - grad ); }`);
}
