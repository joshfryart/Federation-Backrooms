// Node unit tests: crowd LOD simplifier + distance levels (js/meshlod.js).  node tools/test-lod.mjs
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
// uv sphere with a seam: the first and last meridian are separate vertices at the same positions (as a uv-mapped mesh has), poles shared
function sphere(seg = 40, rings = 20, r = 0.3) {
  const pos = [], idx = [], id = (i, j) => 1 + (j - 1) * (seg + 1) + i;
  pos.push(0, r, 0); for (let j = 1; j < rings; j++) { const th = Math.PI * j / rings; for (let i = 0; i <= seg; i++) { const ph = (i % seg) * 2 * Math.PI / seg; pos.push(r * Math.sin(th) * Math.cos(ph), r * Math.cos(th), r * Math.sin(th) * Math.sin(ph)); } } pos.push(0, -r, 0);
  const S = pos.length / 3 - 1;
  for (let i = 0; i < seg; i++) idx.push(0, id(i + 1, 1), id(i, 1));
  for (let j = 1; j < rings - 1; j++) for (let i = 0; i < seg; i++) { const a = id(i, j), b = id(i + 1, j), c = id(i, j + 1), d = id(i + 1, j + 1); idx.push(a, b, d, a, d, c); }
  for (let i = 0; i < seg; i++) idx.push(S, id(i, rings - 1), id(i + 1, rings - 1));
  return { pos: Float32Array.from(pos), index: Uint32Array.from(idx) };
}
function grid(n = 20) { const pos = [], idx = []; for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) pos.push(i / n, 0, j / n); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i; idx.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2); } return { pos: Float32Array.from(pos), index: Uint32Array.from(idx) }; }
const key = (p, v) => `${Math.round(p[v * 3] * 1e5)},${Math.round(p[v * 3 + 1] * 1e5)},${Math.round(p[v * 3 + 2] * 1e5)}`;
export async function lodTests(fail) {
  const L = await imp('js/meshlod.js'), ck = (c, m) => { if (!c) fail('crowd-lod: ' + m); return !!c; }, r = {};
  { const { pos, index } = sphere(), m = index.length / 3, n = pos.length / 3, out = L.simplifyIndex(pos, index, { ratio: 0.25 }), k = out.length / 3; r.sphere = [m, k];
    ck(k > 0 && k <= Math.ceil(m * 0.25) + 2, `sphere reaches the ratio (${m} -> ${k})`);
    ck(out.every(v => v < n), 'indices are original vertices');
    let degen = 0; for (let t = 0; t < k; t++) { const a = key(pos, out[t * 3]), b = key(pos, out[t * 3 + 1]), c = key(pos, out[t * 3 + 2]); if (a === b || b === c || a === c) degen++; } ck(degen === 0, 'no degenerate triangles ' + degen);
    const ec = new Map(); for (let t = 0; t < k; t++) for (let e = 0; e < 3; e++) { const a = key(pos, out[t * 3 + e]), b = key(pos, out[t * 3 + (e + 1) % 3]), kk = a < b ? a + '|' + b : b + '|' + a; ec.set(kk, (ec.get(kk) || 0) + 1); }
    ck([...ec.values()].every(c => c === 2), 'still closed (every welded edge used twice, the seam did not tear)');
    // both sides of the seam keep their own vertices: no triangle mixes the i = 0 and i = seg columns (they would wrap the uv across the sphere)
    const seg = 40, col = (v) => v === 0 || v === n - 1 ? -1 : (v - 1) % (seg + 1); let wrap = 0; for (let t = 0; t < k; t++) { const cs = [0, 1, 2].map(e => col(out[t * 3 + e])); if (cs.includes(0) && cs.includes(seg)) wrap++; } ck(wrap === 0, 'seam corners keep their own side ' + wrap);
    let flip = 0; const c0 = [0, 0, 0]; for (let t = 0; t < k; t++) { const [a, b, c] = [0, 1, 2].map(e => out[t * 3 + e]), P = (v, i) => pos[v * 3 + i]; const ux = P(b, 0) - P(a, 0), uy = P(b, 1) - P(a, 1), uz = P(b, 2) - P(a, 2), wx = P(c, 0) - P(a, 0), wy = P(c, 1) - P(a, 1), wz = P(c, 2) - P(a, 2); const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; const cx = (P(a, 0) + P(b, 0) + P(c, 0)) / 3 - c0[0], cy = (P(a, 1) + P(b, 1) + P(c, 1)) / 3, cz = (P(a, 2) + P(b, 2) + P(c, 2)) / 3; if (nx * cx + ny * cy + nz * cz <= 0) flip++; }
    const sgn0 = (() => { const [a, b, c] = [0, 1, 2].map(e => index[e]), P = (v, i) => pos[v * 3 + i]; const uy = P(b, 1) - P(a, 1), uz = P(b, 2) - P(a, 2), ux = P(b, 0) - P(a, 0), wx = P(c, 0) - P(a, 0), wy = P(c, 1) - P(a, 1), wz = P(c, 2) - P(a, 2); return (uz * wx - ux * wz) * (P(a, 1) + P(b, 1) + P(c, 1)) > 0; })();
    ck(sgn0 ? flip === 0 : flip === k, 'no face turned inside out ' + flip);
    const tight = L.simplifyIndex(pos, index, { ratio: 0.1, maxError: 1e-6 }); r.tight = tight.length / 3; ck(tight.length / 3 > m * 0.9, 'the error bound stops a curved mesh from collapsing ' + r.tight);
    const lv = L.simplifyLevels(pos, index, [{ ratio: 0.5 }, { ratio: 0.2 }]); r.levels = lv.map(a => a.length / 3); ck(lv[0].length / 3 <= m * 0.5 + 2 && lv[1].length / 3 <= m * 0.2 + 2 && lv[1].length < lv[0].length, 'two levels in one pass ' + r.levels); }
  { const { pos, index } = grid(), n = pos.length / 3, out = L.simplifyIndex(pos, index, { ratio: 0.05 }), used = new Set(out); r.grid = [index.length / 3, out.length / 3];
    let border = 0, kept = 0; for (let v = 0; v < n; v++) { const x = pos[v * 3], z = pos[v * 3 + 2]; if (x === 0 || x === 1 || z === 0 || z === 1) { border++; if (used.has(v)) kept++; } }
    ck(kept === border && out.length < index.length / 2, `flat grid: interior collapses, open border kept (${kept}/${border}, ${r.grid})`);
    // the attribute penalty is part of the cost: every vertex has its own value (neighbours differ by >= 1), far past the bound, so nothing collapses
    const sw = new Float32Array(n); for (let v = 0; v < n; v++) sw[v] = v;
    const o2 = L.simplifyIndex(pos, index, { ratio: 0.05, maxError: 0.01, attrs: [{ data: sw, size: 1, weight: 1 }] }), o3 = L.simplifyIndex(pos, index, { ratio: 0.05, maxError: 0.01 });
    r.penalty = [o2.length / 3, o3.length / 3]; ck(o2.length === index.length && o3.length < index.length / 2, 'attribute penalty blocks collapses ' + r.penalty); }
  { const seq = [0, 4, 5.4, 5.7, 5.2, 4.5, 4.3, 9, 10.5, 10.7, 9.8, 9.3, 20, 3, 6, 4.5, 4.3];   // distance walk: switches only past the hysteresis band
    let l = 0; const got = seq.map(d => (l = L.lodLevel(l, d))); r.levels2 = got.join('');
    ck(got[2] === 0 && got[3] === 1 && got[4] === 1 && got[5] === 1 && got[6] === 0 && got[7] === 1 && got[8] === 1 && got[9] === 2 && got[10] === 2 && got[11] === 1 && got[12] === 2 && got[13] === 0 && got[14] === 1 && got[15] === 1 && got[16] === 0, 'hysteresis ' + r.levels2); }
  return r;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) { const errs = []; const r = await lodTests(m => errs.push(m)); console.log(errs.length ? errs.join('\n') : 'crowd-lod OK ' + JSON.stringify(r)); process.exit(errs.length ? 1 : 0); }
