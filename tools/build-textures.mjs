// Offline texture builder (needs `sharp`; not needed to run the game).
//
//   node tools/build-textures.mjs --procedural [outDir] [name…]   generate the project's own tileable PBR sets
//   node tools/build-textures.mjs <ambientCG dir> <outDir>          convert ambientCG (CC0) 1K-JPG sets
//
// Procedural sets are original work (no third-party source). Each set is built from one height field:
//   <name>_c.webp  albedo, neutral grey (the game tints per ship / per room), cavity AO baked in
//   <name>_n.webp  tangent-space normal (OpenGL convention, +Y up)
//   <name>_r.webp  packed ORM: R = ambient occlusion, G = roughness, B = metalness
// The final "grade" step pulls every albedo to a common mean / contrast so the sets sit together.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
const mix = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const fract = (x) => x - Math.floor(x);
function rng(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// tileable value noise, cx × cy lattice cells across the image
function vnoise(N, cx, seed, cy = cx) {
  const R = rng(seed), g = new Float32Array(cx * cy); for (let i = 0; i < g.length; i++) g[i] = R();
  const out = new Float32Array(N * N), sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < N; y++) {
    const fy = y / N * cy, y0 = Math.floor(fy), ty = sm(fy - y0), ya = (y0 % cy) * cx, yb = ((y0 + 1) % cy) * cx;
    for (let x = 0; x < N; x++) {
      const fx = x / N * cx, x0 = Math.floor(fx), tx = sm(fx - x0), xa = x0 % cx, xb = (x0 + 1) % cx;
      out[y * N + x] = mix(mix(g[ya + xa], g[ya + xb], tx), mix(g[yb + xa], g[yb + xb], tx), ty);
    }
  }
  return out;
}
function fbm(N, cells, oct, seed, gain = 0.5, cy = cells) {
  const out = new Float32Array(N * N); let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) { const n = vnoise(N, Math.min(N / 2, cells << o), seed + o * 17, Math.min(N / 2, cy << o)); for (let i = 0; i < out.length; i++) out[i] += n[i] * amp; tot += amp; amp *= gain; }
  for (let i = 0; i < out.length; i++) out[i] /= tot; return out;
}
// separable box blur ×2 (≈ gaussian); x always wraps, y wraps unless wrapY is false
function blur(src, N, r, wrapY = true) {
  let a = src, b = new Float32Array(N * N); const k = 1 / (2 * r + 1);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let s = 0; for (let d = -r; d <= r; d++) s += a[y * N + ((x + d + N) % N)]; b[y * N + x] = s * k; }
    const c = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let s = 0; for (let d = -r; d <= r; d++) { const yy = wrapY ? (y + d + N) % N : clamp(y + d, 0, N - 1); s += b[yy * N + x]; } c[y * N + x] = s * k; }
    a = c;
  }
  return a;
}
// worley / voronoi (tileable): returns { f1, edge } with edge = f2 - f1
function voronoi(N, cells, seed, jitter = 0.9) {
  const R = rng(seed), px = new Float32Array(cells * cells), py = new Float32Array(cells * cells), id = new Float32Array(cells * cells);
  for (let i = 0; i < cells * cells; i++) { px[i] = 0.5 + (R() - 0.5) * jitter; py[i] = 0.5 + (R() - 0.5) * jitter; id[i] = R(); }
  const f1 = new Float32Array(N * N), edge = new Float32Array(N * N), cid = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = x / N * cells, fy = y / N * cells, cx = Math.floor(fx), cy = Math.floor(fy); let a = 9, b = 9, who = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const gx = cx + ox, gy = cy + oy, k = ((gy + cells) % cells) * cells + ((gx + cells) % cells), dx = gx + px[k] - fx, dy = gy + py[k] - fy, dd = Math.sqrt(dx * dx + dy * dy); if (dd < a) { b = a; a = dd; who = id[k]; } else if (dd < b) b = dd; }
    f1[y * N + x] = a; edge[y * N + x] = b - a; cid[y * N + x] = who;
  }
  return { f1, edge, cid };
}

// ---- height → normal / AO, and encoding ----
function normalMap(H, N, strength, wrapY = true) {
  const out = Buffer.alloc(N * N * 3), at = (x, y) => H[(wrapY ? (y + N) % N : clamp(y, 0, N - 1)) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -dx * strength, ny = dy * strength, nz = 1; const il = 1 / Math.hypot(nx, ny, nz); const i = (y * N + x) * 3;
    out[i] = Math.round((nx * il * 0.5 + 0.5) * 255); out[i + 1] = Math.round((ny * il * 0.5 + 0.5) * 255); out[i + 2] = Math.round((nz * il * 0.5 + 0.5) * 255);
  }
  return out;
}
// cavity AO: how far a point sits below its blurred neighbourhood (two radii)
function cavityAO(H, N, k, wrapY = true) {
  const b1 = blur(H, N, Math.max(2, N >> 8), wrapY), b2 = blur(H, N, Math.max(6, N >> 6), wrapY), ao = new Float32Array(N * N);
  for (let i = 0; i < ao.length; i++) ao[i] = clamp(1 - k * (Math.max(0, b1[i] - H[i]) * 1.6 + Math.max(0, b2[i] - H[i]) * 1.0));
  return ao;
}
const grey = (F, N) => { const b = Buffer.alloc(N * N); for (let i = 0; i < b.length; i++) b[i] = Math.round(clamp(F[i]) * 255); return b; };
async function resizeRaw(buf, N, ch, to) { return to === N ? buf : sharp(buf, { raw: { width: N, height: N, channels: ch } }).resize(to, to, { kernel: 'lanczos3' }).raw().toBuffer(); }

// colour grade shared by every procedural albedo: fixed mean, limited contrast, so tints behave the same on all sets
function grade(A, mean, contrast = 1) {
  let s = 0; for (let i = 0; i < A.length; i++) s += A[i]; const m = s / A.length;
  for (let i = 0; i < A.length; i++) A[i] = clamp(mean + (A[i] - m) * contrast, 0.02, 0.98);
}

/**
 * A set is { N, wrapY, mean, contrast, nStrength, aoK, aoBake, outC, outR, draw(ctx) } where draw fills
 * ctx.H (height 0..1), ctx.A (albedo), ctx.R (roughness), ctx.M (metalness) per pixel.
 */
async function emit(name, set, OUT) {
  const N = set.N, n2 = N * N, ctx = { N, H: new Float32Array(n2).fill(0.5), A: new Float32Array(n2).fill(0.7), R: new Float32Array(n2).fill(0.7), M: new Float32Array(n2) };
  set.draw(ctx);
  const wrapY = set.wrapY !== false, ao = cavityAO(ctx.H, N, set.aoK ?? 9, wrapY);
  for (let i = 0; i < n2; i++) ctx.A[i] *= mix(1, ao[i], set.aoBake ?? 0.75);
  grade(ctx.A, set.mean ?? 0.72, set.contrast ?? 1);
  const oc = set.outC || N, or = set.outR || N / 2;
  await sharp(await resizeRaw(grey(ctx.A, N), N, 1, oc), { raw: { width: oc, height: oc, channels: 1 } }).webp({ quality: set.qC ?? 82 }).toFile(`${OUT}/${name}_c.webp`);
  await sharp(await resizeRaw(normalMap(ctx.H, N, set.nStrength ?? 3, wrapY), N, 3, oc), { raw: { width: oc, height: oc, channels: 3 } }).webp({ quality: set.qN ?? 86, smartSubsample: true }).toFile(`${OUT}/${name}_n.webp`);
  const orm = Buffer.alloc(n2 * 3); for (let i = 0; i < n2; i++) { orm[i * 3] = Math.round(clamp(ao[i]) * 255); orm[i * 3 + 1] = Math.round(clamp(ctx.R[i]) * 255); orm[i * 3 + 2] = Math.round(clamp(ctx.M[i]) * 255); }
  await sharp(await resizeRaw(orm, N, 3, or), { raw: { width: or, height: or, channels: 3 } }).webp({ quality: set.qR ?? 78 }).toFile(`${OUT}/${name}_r.webp`);
  console.log('procedural', name, `${oc}px`);
}

// ---------------------------------------------------------------------------------------------------------
// WALLS — one image is a whole bulkhead bay: 2.5 m wide (tiles horizontally) × 3.2 m tall (top row = ceiling line).
// Shared datum lines so trim, handrails and the accent stripe line up on every variant:
//   header band 0–0.16 m · upper field · stripe channel 2.03–2.27 m from the top (accent stripe sits at 1.05 m
//   above the deck) · lower field · kick plate from 2.96 m down.
// ---------------------------------------------------------------------------------------------------------
const WALL_H = 3.2, WALL_W = 2.5;
function wallCommon(ctx, seed, body) {
  const { N, H, A, R, M } = ctx, n1 = fbm(N, 8, 5, seed), n2 = fbm(N, 64, 3, seed + 5), streak = vnoise(N, 96, seed + 9, 3), scr = vnoise(N, 6, seed + 11, 160);
  for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
    const i = py * N + px, u = px / N, y = py / N * WALL_H, x = u * WALL_W;
    const o = { h: 0.5, a: 0.74, r: 0.6, m: 0.1 };
    if (y < 0.16) {   // header trim with a shadow gap under it
      o.h = 0.66 - 0.05 * sstep(0.1, 0.16, y) + (y > 0.145 ? -0.2 : 0); o.a = 0.5 + (n2[i] - 0.5) * 0.08; o.r = 0.45; o.m = 0.85;
    } else if (y > 2.96) {   // kick plate: ribbed rubber-faced strip, scuffed
      const rib = Math.sin((y - 2.96) / 0.034 * Math.PI * 2); o.h = 0.64 + rib * 0.035 - (y < 2.975 ? 0.22 : 0); o.a = 0.3 + (n2[i] - 0.5) * 0.08 + sstep(0.72, 0.9, scr[i]) * 0.2; o.r = 0.86 - sstep(0.72, 0.9, scr[i]) * 0.2; o.m = 0.0;
    } else if (y > 2.03 && y < 2.27) {   // stripe channel
      const e = Math.min(y - 2.03, 2.27 - y); o.h = 0.4 + 0.02 * sstep(0, 0.02, e); o.a = 0.46; o.r = 0.5; o.m = 0.7;
    } else body(o, x, y, u, i, n1, n2);
    // shared weathering: soot drifting down from the header, damp grime rising from the deck
    const drip = sstep(0.55, 0.9, streak[i]) * sstep(1.5, 0.16, y) * 0.14, low = sstep(2.3, 3.2, y) * 0.2 * (0.6 + n1[i] * 0.8);
    o.a *= 1 - drip - low; o.r = clamp(o.r + drip * 0.8 + low * 0.5);
    H[i] = o.h; A[i] = o.a; R[i] = o.r; M[i] = o.m;
  }
}
const SETS = {
  // painted panel: two smooth enamelled panels per bay, countersunk screws, paint chipped back to metal at edges and low down
  wallp: { N: 1024, wrapY: false, mean: 0.74, contrast: 0.95, nStrength: 3.2, aoK: 7, outR: 512, draw(ctx) {
    const chip = fbm(ctx.N, 56, 4, 77, 0.55);
    wallCommon(ctx, 21, (o, x, y, u, i, n1, n2) => {
      const U = fract(u * 2) * (WALL_W / 2), du = Math.min(U, WALL_W / 2 - U);   // metres from the nearest vertical seam
      const upper = y < 2.03, top = upper ? 0.19 : 2.3, bot = upper ? 2.0 : 2.93, d = Math.min(du - 0.012, y - top, bot - y);   // distance inside the panel
      if (d < 0) { o.h = 0.34; o.a = 0.36; o.r = 0.7; o.m = 0.6; return; }                                                     // seam gap
      o.h = 0.5 + 0.1 * sstep(0, 0.014, d) + (n2[i] - 0.5) * 0.012; o.a = (upper ? 0.8 : 0.7) + (n1[i] - 0.5) * 0.07; o.r = 0.5 + (n2[i] - 0.5) * 0.16; o.m = 0.04;
      // inset field on the upper panel
      if (upper) { const di = Math.min(du - 0.12, y - 0.34, 1.86 - y); o.h -= 0.03 * sstep(0, 0.012, di); if (di > 0) o.a += 0.02; }
      // screws
      for (const sy of upper ? [0.26, 1.93] : [2.37, 2.86]) { const dx = du - 0.055, dy = y - sy, rr = Math.hypot(dx, dy); if (rr < 0.016) { o.h = 0.56 + 0.05 * sstep(0.016, 0.01, rr) - (Math.abs(dx + dy) < 0.003 ? 0.08 : 0); o.a = 0.55; o.r = 0.35; o.m = 1; return; } }
      // chips: more at panel edges and towards the deck
      const c = sstep(0.69, 0.725, chip[i] + 0.2 * (1 - sstep(0, 0.05, d)) + 0.1 * sstep(1.8, 3.0, y) - 0.08);
      if (c > 0) { o.h -= 0.035 * c; o.a = mix(o.a, 0.56 + (n2[i] - 0.5) * 0.12, c); o.r = mix(o.r, 0.45, c); o.m = mix(o.m, 0.55, c); }
    });
  } },
  // padded: quilted, buttoned acoustic padding above the rail, plain fluted wainscot below
  wallq: { N: 1024, wrapY: false, mean: 0.74, contrast: 0.8, nStrength: 3.0, aoK: 4, aoBake: 0.6, outR: 512, draw(ctx) {
    const weave = vnoise(ctx.N, 256, 5, 256);
    wallCommon(ctx, 33, (o, x, y, u, i, n1, n2) => {
      if (y < 2.03) {
        const e = Math.min(y - 0.19, 2.0 - y); if (e < 0) { o.h = 0.36; o.a = 0.4; o.r = 0.7; o.m = 0.5; return; }
        const cells = 6, gx = u * cells, gy = (y - 0.19) / (WALL_W / cells), a = fract(gx + gy), b = fract(gx - gy);            // diamond lattice, buttons at the corners
        const pill = Math.pow(Math.sin(Math.PI * a) * Math.sin(Math.PI * b), 0.45), db = Math.hypot(Math.min(a, 1 - a), Math.min(b, 1 - b));
        o.h = 0.42 + 0.3 * pill * sstep(0, 0.05, e) + (weave[i] - 0.5) * 0.02; if (db < 0.085) o.h = 0.47 + 0.08 * sstep(0.085, 0.04, db);
        o.a = 0.74 + (n1[i] - 0.5) * 0.1 + (weave[i] - 0.5) * 0.06 - (db < 0.085 ? 0.12 : 0); o.r = db < 0.085 ? 0.6 : 0.93; o.m = 0;
      } else {
        const e = Math.min(y - 2.3, 2.93 - y); if (e < 0) { o.h = 0.36; o.a = 0.4; o.r = 0.7; o.m = 0.5; return; }
        const fl = 0.5 + 0.5 * Math.cos(u * 40 * Math.PI * 2); o.h = 0.46 + 0.1 * Math.pow(fl, 0.7) * sstep(0, 0.03, e); o.a = 0.62 + (n2[i] - 0.5) * 0.08; o.r = 0.55; o.m = 0.5;
      }
    });
  } },
  // grille: structural frame, louvred vent panels above, perforated sheet below
  wallg: { N: 1024, wrapY: false, mean: 0.68, contrast: 0.85, nStrength: 3.4, aoK: 8, outR: 512, draw(ctx) {
    wallCommon(ctx, 45, (o, x, y, u, i, n1, n2) => {
      const U = fract(u * 2) * (WALL_W / 2), du = Math.min(U, WALL_W / 2 - U);
      if (du < 0.05) {   // frame post with bolts
        o.h = 0.62 - 0.06 * sstep(0.03, 0.05, du); o.a = 0.56 + (n2[i] - 0.5) * 0.1; o.r = 0.5; o.m = 0.9;
        const by = fract(y / 0.4) * 0.4 - 0.2, rr = Math.hypot(du - 0.025, by); if (rr < 0.013) { o.h = 0.7; o.a = 0.66; o.r = 0.35; }
        return;
      }
      if (y < 2.03) {
        const e = Math.min(du - 0.05, y - 0.19, 2.0 - y); if (e < 0.015) { o.h = 0.46; o.a = 0.4; o.r = 0.6; o.m = 0.8; return; }
        const s = fract((y - 0.19) / 0.075); o.h = 0.3 + 0.3 * s; o.a = 0.6 + 0.16 * s + (n2[i] - 0.5) * 0.06; if (s < 0.07) { o.h = 0.14; o.a = 0.16; } o.r = 0.48 + (n1[i] - 0.5) * 0.2; o.m = 0.9;
      } else {
        const e = Math.min(du - 0.05, y - 2.3, 2.93 - y); if (e < 0.015) { o.h = 0.46; o.a = 0.4; o.r = 0.6; o.m = 0.8; return; }
        const p = 0.028, row = Math.floor(y / (p * 0.866)), hx = fract(x / p + (row % 2) * 0.5) - 0.5, hy = fract(y / (p * 0.866)) - 0.5, rr = Math.hypot(hx * p, hy * p * 0.866);
        o.h = 0.5; o.a = 0.58 + (n1[i] - 0.5) * 0.1; o.r = 0.45; o.m = 0.9; if (rr < 0.0085) { o.h = 0.2; o.a = 0.06; o.r = 0.9; o.m = 0; }
      }
    });
  } },

  // -------------------------------------------------------------------------------------------------------
  // FLOORS — one image is a 2.5 m deck module. Tiles are laid at random quarter turns, so every variant has a
  // joint strip on its border and only rotation-safe detail near the edge.
  // -------------------------------------------------------------------------------------------------------
  // bar grating in a welded frame
  grate: { N: 512, mean: 0.58, contrast: 1.0, nStrength: 4, aoK: 6, aoBake: 0.6, outR: 256, draw({ N, H, A, R, M }) {
    const n = fbm(N, 32, 3, 3), rust = fbm(N, 10, 4, 8);
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const i = py * N + px, u = px / N, v = py / N, e = Math.min(u, 1 - u, v, 1 - v);
      let h, a, r = 0.5, m = 0.9;
      if (e < 0.03) { h = 0.7 - 0.2 * sstep(0.004, 0, e); a = 0.6 + (n[i] - 0.5) * 0.12; }
      else {
        const bar = Math.abs(fract(u * 20) - 0.5), rod = Math.abs(fract(v * 5) - 0.5);
        if (bar < 0.17) { h = 0.66 - 0.12 * sstep(0.1, 0.17, bar); a = 0.62 + 0.12 * sstep(0.1, 0.0, bar) + (n[i] - 0.5) * 0.14; }
        else if (rod < 0.035) { h = 0.5; a = 0.45; }
        else { h = 0.05; a = 0.05; r = 0.95; m = 0; }
      }
      const ru = sstep(0.6, 0.75, rust[i]) * (h > 0.3 ? 1 : 0); a = mix(a, a * 0.62, ru); r = clamp(r + ru * 0.35); m *= 1 - ru * 0.6;
      H[i] = h; A[i] = a; R[i] = r; M[i] = m;
    }
  } },
  // coin-stud rubber flooring
  rubber: { N: 512, mean: 0.6, contrast: 0.9, nStrength: 3.2, aoK: 6, outR: 256, draw({ N, H, A, R, M }) {
    const n = fbm(N, 8, 5, 12), sc = vnoise(N, 200, 14, 12), sc2 = vnoise(N, 12, 15, 200);
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const i = py * N + px, u = px / N, v = py / N, e = Math.min(u, 1 - u, v, 1 - v);
      const gx = fract(u * 16) - 0.5, gy = fract(v * 16) - 0.5, rr = Math.hypot(gx, gy), stud = sstep(0.34, 0.27, rr);
      let h = 0.45 + 0.16 * stud + (n[i] - 0.5) * 0.02, a = 0.5 + 0.1 * stud * (0.5 + n[i]) + (n[i] - 0.5) * 0.12, r = 0.82 - 0.14 * stud, m = 0;
      const scuff = Math.max(sstep(0.8, 0.95, sc[i]), sstep(0.82, 0.95, sc2[i])); a += scuff * 0.12; r -= scuff * 0.1;
      if (e < 0.012) { h = 0.3; a = 0.2; r = 0.9; }
      H[i] = h; A[i] = a; R[i] = clamp(r); M[i] = m;
    }
  } },
  // small hexagonal ceramic tiles with a stainless joint strip
  hex: { N: 512, mean: 0.78, contrast: 0.9, nStrength: 2.6, aoK: 7, outR: 256, draw({ N, H, A, R, M }) {
    const n = fbm(N, 6, 4, 31), s = [1, 1.7320508], cols = 10, rows = 6;   // rows of hex pairs: 6 × √3 ≈ 10.39, stretched a little to tile
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const i = py * N + px, u = px / N, v = py / N, e = Math.min(u, 1 - u, v, 1 - v), p = [u * cols, v * rows * s[1]];
      const ax = Math.floor(p[0] / s[0]) + 0.5, ay = Math.floor(p[1] / s[1]) + 0.5, bx = Math.floor((p[0] - 0.5) / s[0]) + 0.5, by = Math.floor((p[1] - 1) / s[1]) + 0.5;
      const h1 = [p[0] - ax * s[0], p[1] - ay * s[1]], h2 = [p[0] - (bx + 0.5) * s[0], p[1] - (by + 0.5) * s[1]];
      const first = h1[0] * h1[0] + h1[1] * h1[1] < h2[0] * h2[0] + h2[1] * h2[1], hh = first ? h1 : h2, id = first ? ax * 7.13 + ay * 3.71 : bx * 5.31 + by * 9.17 + 2.5;
      const ed = 0.5 - Math.max(Math.abs(hh[0]) * 0.5 + Math.abs(hh[1]) * 0.8660254, Math.abs(hh[0])), tone = fract(Math.sin(id * 12.9898) * 43758.5453);
      let h = 0.4 + 0.2 * sstep(0.02, 0.06, ed), a = 0.8 + (tone - 0.5) * 0.12 + (n[i] - 0.5) * 0.06, r = 0.28 + tone * 0.1, m = 0;
      if (ed < 0.03) { a = 0.5 + (n[i] - 0.5) * 0.14; r = 0.85; }
      if (e < 0.014) { h = 0.62; a = 0.62; r = 0.4; m = 0.9; }
      H[i] = h; A[i] = a; R[i] = r; M[i] = m;
    }
  } },
  // garden pavers: irregular stone with mossy joints
  paver: { N: 512, mean: 0.66, contrast: 1.0, nStrength: 3.4, aoK: 8, outR: 256, draw({ N, H, A, R, M }) {
    const vo = voronoi(N, 7, 91, 0.8), n = fbm(N, 12, 5, 93), n2 = fbm(N, 80, 2, 95);
    for (let i = 0; i < N * N; i++) {
      const ed = vo.edge[i], st = sstep(0.03, 0.11, ed);
      const px = i % N, py = (i / N) | 0, e = Math.min(px, N - 1 - px, py, N - 1 - py) / N, jt = sstep(0.004, 0.016, e);   // module joint on the border
      H[i] = (0.3 + 0.32 * st + (n[i] - 0.5) * 0.12 * st + (n2[i] - 0.5) * 0.04) * (0.6 + 0.4 * jt); A[i] = (mix(0.34, 0.66 + (vo.cid[i] - 0.5) * 0.18 + (n[i] - 0.5) * 0.14, st) - sstep(0.6, 0.8, n[i]) * 0.1) * (0.55 + 0.45 * jt); R[i] = mix(0.98, 0.78 + (n2[i] - 0.5) * 0.2, st); M[i] = 0;
    }
  } },
  // -------------------------------------------------------------------------------------------------------
  // CEILINGS — one image is one ceiling tile (tile-sized, never rotated). Panel joints sit on the border.
  // -------------------------------------------------------------------------------------------------------
  // acoustic drop tile in a T-bar grid: fissured, pinpricked, water-stained corners
  ceilt: { N: 512, mean: 0.82, contrast: 0.9, nStrength: 1.6, aoK: 6, outR: 256, draw({ N, H, A, R, M }) {
    const n = fbm(N, 6, 5, 61), f = fbm(N, 40, 3, 63), st = fbm(N, 3, 3, 67), rr = rng(65), pins = [];
    for (let k = 0; k < 900; k++) pins.push([rr() * N | 0, rr() * N | 0]);
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const i = py * N + px, u = px / N, v = py / N, e = Math.min(u, 1 - u, v, 1 - v), gx = Math.min(Math.abs(u - 0.5), 0.5 - Math.abs(u - 0.5)), gy = Math.min(Math.abs(v - 0.5), 0.5 - Math.abs(v - 0.5));
      let h = 0.5 + (n[i] - 0.5) * 0.18 + (f[i] - 0.5) * 0.12, a = 0.84 + (n[i] - 0.5) * 0.06 - sstep(0.62, 0.8, st[i]) * 0.14, r = 0.95, m = 0;
      const half = Math.min(Math.abs(u - 0.5), Math.abs(v - 0.5)); void gx; void gy;
      if (e < 0.02) { h = 0.78; a = 0.9; r = 0.35; m = 0.6; }   // T-bar
      else if (half < 0.006) { h = 0.2; a = 0.55; }               // score line across the tile, as if two half-tiles
      H[i] = h; A[i] = a; R[i] = r; M[i] = m;
    }
    for (const [x, y] of pins) { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const i = ((y + dy + N) % N) * N + ((x + dx + N) % N); if (dx === 0 && dy === 0) { H[i] = 0.32; A[i] *= 0.78; } } }
  } },
  // riveted metal panels: four plates, countersunk screws, grease streaks
  ceilm: { N: 512, mean: 0.66, contrast: 1.0, nStrength: 3.2, aoK: 7, outR: 256, draw({ N, H, A, R, M }) {
    const n = fbm(N, 8, 4, 71), sc = vnoise(N, 4, 73, 120);
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const i = py * N + px, u = px / N, v = py / N, e = Math.min(u, 1 - u, v, 1 - v), seam = Math.min(Math.abs(u - 0.5), Math.abs(v - 0.5));
      const cu = fract(u * 2) , cv = fract(v * 2), ei = Math.min(cu, 1 - cu, cv, 1 - cv);
      let h = 0.55 + (n[i] - 0.5) * 0.04, a = 0.62 + (n[i] - 0.5) * 0.14 - sstep(0.7, 0.9, sc[i]) * 0.12, r = 0.5 + (n[i] - 0.5) * 0.3, m = 0.85;
      if (e < 0.012 || seam < 0.006) { h = 0.3; a = 0.3; r = 0.8; }
      else if (ei < 0.05) { h = 0.62; }
      const rv = Math.hypot(fract(cu * 6 + 0.5) - 0.5, fract(cv * 6 + 0.5) - 0.5) * 0.5 / 3; void rv;
      if (ei > 0.05 && ei < 0.085) { const t = fract(Math.max(cu, cv) * 5); if (Math.abs(t - 0.5) < 0.08 && Math.min(cu, 1 - cu, cv, 1 - cv) > 0.05) { h = 0.8; a = 0.74; } }
      H[i] = h; A[i] = a; R[i] = clamp(r); M[i] = m;
    }
  } },
  // slatted baffle / vent ceiling: long louvres over a dark plenum
  ceilg: { N: 512, mean: 0.6, contrast: 1.0, nStrength: 3.6, aoK: 7, aoBake: 0.85, outR: 256, draw({ N, H, A, R, M }) {
    const n = fbm(N, 10, 4, 81);
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const i = py * N + px, u = px / N, v = py / N, e = Math.min(u, 1 - u, v, 1 - v), s = fract(v * 16), cross = Math.abs(fract(u * 2) - 0.5);
      let h = 0.5, a = 0.58 + (n[i] - 0.5) * 0.12, r = 0.45, m = 0.9;
      if (e < 0.02) { h = 0.7; a = 0.5; r = 0.5; }
      else if (s < 0.5) { h = 0.3 + 0.6 * s; a = 0.6 + 0.2 * s; }
      else { h = 0.05; a = 0.06; r = 0.9; m = 0; }
      if (cross < 0.012) { h = 0.75; a = 0.5; m = 0.9; }
      H[i] = h; A[i] = a; R[i] = r; M[i] = m;
    }
  } },
  // door frames / lift surround: brushed steel, kick scuffs, bolt row
  trim: { N: 256, mean: 0.6, contrast: 1.0, nStrength: 2.4, aoK: 4, outR: 128, draw({ N, H, A, R, M }) {
    const br = vnoise(N, 2, 91, 200), n = fbm(N, 6, 3, 93);
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const i = py * N + px, u = px / N, v = py / N, bolt = Math.hypot(fract(u * 4 + 0.5) - 0.5, fract(v * 4 + 0.5) - 0.5);
      let h = 0.5 + (br[i] - 0.5) * 0.06, a = 0.58 + (br[i] - 0.5) * 0.14 + (n[i] - 0.5) * 0.1, r = 0.38 + (br[i] - 0.5) * 0.2 + sstep(0.6, 0.9, n[i]) * 0.25, m = 0.92;
      if (bolt < 0.07) { h = 0.8; a = 0.7; r = 0.3; }
      H[i] = h; A[i] = a; R[i] = clamp(r); M[i] = m;
    }
  } },
  // light diffuser: prismatic lens grid; albedo doubles as the emissive map (bright, with dark frame and dead cells)
  lens: { N: 256, mean: 0.9, contrast: 0.5, nStrength: 3.0, aoK: 3, aoBake: 0.2, outR: 128, draw({ N, H, A, R, M }) {
    const n = fbm(N, 10, 3, 101);
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const i = py * N + px, u = px / N, v = py / N, cu = fract(u * 12), cv = fract(v * 5), e = Math.min(cu, 1 - cu, cv, 1 - cv), border = Math.min(u, 1 - u, v, 1 - v);
      const pr = Math.pow(Math.sin(Math.PI * cu) * Math.sin(Math.PI * cv), 0.5);
      let h = 0.35 + 0.4 * pr, a = 0.93 - sstep(0.5, 0.8, n[i]) * 0.1 - (e < 0.03 ? 0.12 : 0), r = 0.35, m = 0;
      if (border < 0.035) { h = 0.8; a = 0.62; r = 0.5; m = 0.4; }
      H[i] = h; A[i] = a; R[i] = r; M[i] = m;
    }
  } },
  // window / screen glass: smudges and fine scratches live in roughness (G); albedo is a neutral grey
  glass: { N: 512, mean: 0.7, contrast: 0.2, nStrength: 0.8, aoK: 2, aoBake: 0, outR: 256, draw({ N, H, A, R, M }) {
    const sm = fbm(N, 5, 5, 111), fine = vnoise(N, 4, 113, 320), fine2 = vnoise(N, 300, 115, 3);
    for (let i = 0; i < N * N; i++) {
      const sc = Math.max(sstep(0.82, 0.95, fine[i]), sstep(0.85, 0.96, fine2[i]));
      H[i] = 0.5 + sc * 0.1 - sm[i] * 0.03; A[i] = 0.7 - sc * 0.2; R[i] = clamp(0.05 + sstep(0.45, 0.85, sm[i]) * 0.5 + sc * 0.35); M[i] = 0;
    }
  } },

  // reptile hide (Gronk): overlapping scutes in staggered rows, finer on the belly side, dark seams, speckled tone
  scales: { N: 512, mean: 0.62, contrast: 1.05, nStrength: 4.2, aoK: 6, aoBake: 0.9, outR: 256, draw({ N, H, A, R, M }) {
    const n = fbm(N, 6, 4, 121), sp = vnoise(N, 90, 123, 90), W = 18;
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const i = py * N + px, u = px / N, v = py / N, row = Math.floor(v * W), uu = fract(u * W + (row % 2) * 0.5) - 0.5, vv = fract(v * W) - 0.5;
      const d = Math.hypot(uu * 1.15, vv * 1.1 - 0.08), sc = sstep(0.85, 0.15, d), edge = sstep(0.5, 0.7, d);
      H[i] = 0.25 + 0.65 * sc + (n[i] - 0.5) * 0.05; A[i] = 0.62 + (n[i] - 0.5) * 0.3 + (sp[i] - 0.5) * 0.12 - edge * 0.3 + (vv < -0.1 ? 0.06 : 0); R[i] = clamp(0.45 + edge * 0.35 + (sp[i] - 0.5) * 0.15); M[i] = 0;
    }
  } },
  // raw flesh / chitin (Crawler): veined, glossy and wet, with pitted plates
  flesh: { N: 512, mean: 0.55, contrast: 1.1, nStrength: 3.6, aoK: 7, aoBake: 0.8, outR: 256, draw({ N, H, A, R, M }) {
    const n = fbm(N, 5, 5, 131), w = fbm(N, 14, 4, 133), vn = fbm(N, 10, 3, 135);
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const i = py * N + px, ridge = 1 - Math.abs(vn[i] - 0.5) * 2, vein = sstep(0.86, 0.97, ridge), pit = sstep(0.72, 0.9, w[i]);
      H[i] = 0.5 + (n[i] - 0.5) * 0.35 - vein * -0.12 - pit * 0.16; A[i] = 0.58 + (n[i] - 0.5) * 0.25 - pit * 0.2 + vein * 0.12; R[i] = clamp(0.28 + pit * 0.4 + (w[i] - 0.5) * 0.2); M[i] = 0;
    }
  } },
  // uniform cloth: fine plain weave with slubs and light fraying; used as normal / roughness on garments
  cloth: { N: 512, mean: 0.7, contrast: 0.6, nStrength: 2.4, aoK: 3, aoBake: 0.3, outR: 256, draw({ N, H, A, R, M }) {
    const n = fbm(N, 20, 3, 141), slub = vnoise(N, 4, 143, 220), slub2 = vnoise(N, 220, 145, 4);
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const i = py * N + px, wx = Math.sin(px / N * 128 * Math.PI * 2) * 0.5 + 0.5, wy = Math.sin(py / N * 128 * Math.PI * 2) * 0.5 + 0.5, over = ((px >> 2) + (py >> 2)) & 1;
      const t = over ? wx : wy, sl = Math.max(sstep(0.78, 0.95, slub[i]), sstep(0.78, 0.95, slub2[i]));
      H[i] = 0.42 + 0.3 * t + sl * 0.08; A[i] = 0.7 + (n[i] - 0.5) * 0.12 - (1 - t) * 0.08 + sl * 0.05; R[i] = clamp(0.88 - sl * 0.1); M[i] = 0;
    }
  } },
  // hull plate: large welded panels, rivet rows, scorch and micrometeorite pitting; for exteriors and heavy doors
  hull: { N: 1024, mean: 0.58, contrast: 1.0, nStrength: 3.4, aoK: 8, outR: 512, draw({ N, H, A, R, M }) {
    const n = fbm(N, 7, 5, 151), pits = vnoise(N, 120, 153, 120), scorch = fbm(N, 4, 4, 155), tone = vnoise(N, 4, 157, 4);
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const i = py * N + px, u = px / N, v = py / N, pu = fract(u * 4), pv = fract(v * 2), e = Math.min(pu, 1 - pu, pv, 1 - pv), riv = Math.hypot(fract(u * 32) - 0.5, fract(v * 16) - 0.5);
      const panel = Math.floor(u * 4) * 3 + Math.floor(v * 2), pt = sstep(0.8, 0.95, pits[i]);
      let h = 0.55 + (n[i] - 0.5) * 0.06 - pt * 0.12, a = 0.58 + ((panel * 0.37) % 1 - 0.5) * 0.08 + (n[i] - 0.5) * 0.14 - sstep(0.62, 0.85, scorch[i]) * 0.25, r = 0.5 + sstep(0.6, 0.9, n[i]) * 0.2 + pt * 0.2, m = 0.7;
      if (e < 0.012) { h = 0.3; a *= 0.5; r = 0.8; } else if (e < 0.04 && riv < 0.12) { h = 0.85; a += 0.1; r = 0.35; }
      H[i] = h; A[i] = a; R[i] = clamp(r); M[i] = m;
    }
  } },
  // grime overlay: soft dirt, oil streaks and fingerprints in AO / roughness; mean-grey albedo so it only darkens
  grime: { N: 512, mean: 0.6, contrast: 1.0, nStrength: 0.9, aoK: 4, aoBake: 0.5, outR: 256, draw({ N, H, A, R, M }) {
    const n = fbm(N, 5, 6, 161), st = vnoise(N, 40, 163, 3), fp = fbm(N, 28, 3, 165);
    for (let i = 0; i < N * N; i++) {
      const streak = sstep(0.6, 0.92, st[i]) * (0.5 + n[i]), smudge = sstep(0.55, 0.8, fp[i]);
      H[i] = 0.5 + (n[i] - 0.5) * 0.06 - streak * 0.02; A[i] = 0.7 - streak * 0.3 - smudge * 0.12 - sstep(0.5, 0.85, n[i]) * 0.2; R[i] = clamp(0.55 + streak * 0.3 + smudge * 0.25); M[i] = 0;
    }
  } },

};

async function procedural(OUT = 'assets/textures', only = []) {
  await mkdir(OUT, { recursive: true });
  for (const [name, set] of Object.entries(SETS)) if (!only.length || only.includes(name)) await emit(name, set, OUT);
}

// ---- ambientCG conversion (albedo neutralised to grey, fixed mean, because the game tints surfaces) ----
const CG = { wall: ['MetalPlates008', 0.8, 1024], deck: ['DiamondPlate008C', 0.72, 1024], carpet: ['Carpet016', 0.8, 1024], tile: ['Tiles141', 0.82, 1024], ceil: ['OfficeCeiling006', 0.8, 512] };
async function convert(SRC, OUT) {
  for (const [name, [id, mean, size]] of Object.entries(CG)) {
    const { data, info } = await sharp(`${SRC}/${id}_Color.jpg`).resize(size, size).greyscale().raw().toBuffer({ resolveWithObject: true });
    let sum = 0; for (const v of data) sum += v; const k = mean * 255 / (sum / data.length);
    const out = Buffer.from(data.map(v => Math.min(255, v * k)));
    await sharp(out, { raw: { width: info.width, height: info.height, channels: 1 } }).webp({ quality: 80 }).toFile(`${OUT}/${name}_c.webp`);
    await sharp(`${SRC}/${id}_NormalGL.jpg`).resize(size, size).webp({ quality: 86 }).toFile(`${OUT}/${name}_n.webp`);
    await sharp(`${SRC}/${id}_Roughness.jpg`).resize(size / 2, size / 2).greyscale().webp({ quality: 75 }).toFile(`${OUT}/${name}_r.webp`);
    console.log(name, id);
  }
}

const args = process.argv.slice(2);
if (args[0] === '--procedural') await procedural(args[1], args.slice(2));
else if (args.length >= 2) await convert(args[0], args[1]);
else console.log('usage: node tools/build-textures.mjs --procedural [outDir] [name…]  |  node tools/build-textures.mjs <ambientCG dir> <outDir>');
