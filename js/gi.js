// Per-deck baked indirect light ("GI grid") and contact occlusion, sampled by every lit material through one shared shader hook.
//
// Why a bake: the deck is lit by 3 pooled panel PointLights (the nearest panels) + a hemisphere fill; the light count can never change (a changed
// count recompiles every lit material), so rooms away from the player were lit by the flat hemisphere alone and nothing touching the floor had a
// contact cue once the torch (the only shadow caster) was off (Systems Nominal). The bake runs on the CPU while the lift rides to the next deck
// (js/main.js preDeckStep, a few ms per frame) and produces two small textures over the deck's XZ plane:
//   giOcc  (6 texels per 2.5 m tile, RGBA8): R floor-contact occlusion (walls + props: dark under and around furniture, at wall bases),
//          G wall/ceiling corner occlusion, B ceiling height / 8 m.
//   giIrr  (2 texels per tile, RGBA8, sqrt-encoded): RGB one diffuse bounce of ALL the deck's panel lights (tile line of sight, room colour,
//          spread through open space only), A local light level (0 = no panel near; it scales the hemisphere fill, so unlit stretches read darker).
// The shader part (GI_FRAG) runs after <lights_fragment_maps>: irradiance = irradiance * occ * fill(level) + bounce * occ, and the IBL
// (assets/env/lobby.exr) is occluded the same way and tinted toward the room's light colour.
//
// No program is added: installGI() replaces Material.prototype.onBeforeCompile (a no-op by default) before anything compiles, so every built-in
// lit material (standard / physical / lambert / phong / toon) gets the same patched source and the same cache key as before; materials with their
// own onBeforeCompile are untouched unless they call giPatch(shader) themselves (exported for that). The uniforms are shared objects, so a new
// deck only swaps two textures. GI.on (set by the main scene's onBeforeRender, cleared after it) keeps it off in every other scene (viewmodel,
// portraits, talk close-up props...).
import * as THREE from 'three';

export const GI_OCC_RES = 6, GI_IRR_RES = 2;   // texels per tile
const CEIL_MAX = 8, IRR_SCALE = 4;   // giOcc.b = ceiling / CEIL_MAX; giIrr.rgb = sqrt(bounce / IRR_SCALE)
const blank = (() => { const t = new THREE.DataTexture(new Uint8Array([255, 255, 64, 255]), 1, 1); t.needsUpdate = true; return t; })();
// x on/off (main scene only), y hemisphere fill where no panel is near (0..1), z bounce gain, w IBL room tint amount
export const GI = {
  u: {
    giIrr: { value: blank }, giOcc: { value: blank }, giBox: { value: new THREE.Vector4(1, 1, 0, 0) },
    giAmt: { value: new THREE.Vector4(0, 0.45, 1.3, 0.5) }, giTint: { value: new THREE.Color(1, 1, 1) },
  },
  enabled: true, world: null,
};

export const GI_PARS = /* glsl */`
uniform sampler2D giIrr; uniform sampler2D giOcc; uniform vec4 giBox; uniform vec4 giAmt; uniform vec3 giTint;
`;
export const GI_FRAG = /* glsl */`
#if defined( RE_IndirectDiffuse )
if ( giAmt.x > 0.5 ) {
  vec3 giW = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
  vec2 giUV = giW.xz * giBox.xy;
  vec4 giO = texture2D( giOcc, giUV ), giL = texture2D( giIrr, giUV );
  vec3 giN = inverseTransformDirection( geometryNormal, viewMatrix );
  float giCeil = giO.b * ${CEIL_MAX.toFixed(1)};
  float giFloor = mix( giO.r, 1.0, smoothstep( 0.02, 0.75, giW.y ) );
  float giAO = giFloor * mix( giO.g, 1.0, smoothstep( 0.0, 0.7, giCeil - giW.y ) );
  // the panels hang overhead, so what shades the floor from the bounce shades it from them too (the only contact shadow with the torch off)
  float giSh = mix( 1.0, giFloor, 0.9 );
  reflectedLight.directDiffuse *= giSh; reflectedLight.directSpecular *= giSh;
  vec3 giB = giL.rgb * giL.rgb * ${IRR_SCALE.toFixed(2)} * giTint * giAmt.z * ( 1.0 - 0.35 * max( giN.y, 0.0 ) );   // bounce reaches walls / undersides more than the lit floor
  float giLit = giL.a * giL.a;
  irradiance = irradiance * giAO * mix( giAmt.y, 1.0, giLit ) + giB * giAO;
  iblIrradiance *= giAO;
  #if defined( RE_IndirectSpecular )
    vec3 giC = giL.rgb / max( max( giL.r, max( giL.g, giL.b ) ), 1e-3 );
    radiance *= mix( vec3( 1.0 ), giC, giAmt.w * smoothstep( 0.0, 0.25, giL.a ) ) * mix( 1.0, giAO, 0.8 );
  #endif
}
#endif
`;
// the hook: patch a built-in lit material's shader (call it from your own onBeforeCompile; anything without <lights_fragment_maps> is left alone)
export function giPatch(shader) {
  if (!shader.fragmentShader.includes('#include <lights_fragment_maps>') || shader.fragmentShader.includes('uniform vec4 giAmt;')) return shader;
  Object.assign(shader.uniforms, GI.u);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + GI_PARS).replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n' + GI_FRAG);
  return shader;
}
let installed = false;
export function installGI() {
  if (installed) return; installed = true;
  // one shared function: Material.customProgramCacheKey() is onBeforeCompile.toString(), the same for every material that does not set its own
  THREE.Material.prototype.onBeforeCompile = function giOnBeforeCompile(shader) { giPatch(shader); };
}
// main scene only (the other scenes rendered with the same materials see giAmt.x = 0)
export function bindScene(scene) {
  scene.onBeforeRender = () => { GI.u.giAmt.value.x = GI.enabled && GI.world ? 1 : 0; };
  scene.onAfterRender = () => { GI.u.giAmt.value.x = 0; };
}
// per frame: ship light colour x power x alert (the same as the pooled panel lights)
export function giFrame(col, power) { GI.u.giTint.value.copy(col).multiplyScalar(power); }

// ---- bake ----
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
// three.js physically based point light falloff (js/rooms/_tall.js atten)
const atten = (d, decay, cutoff) => { const w = Math.max(0, 1 - (d / cutoff) ** 4); return w * w / Math.max(d ** decay, 0.01); };
// tile line of sight (walls block, props do not)
function losTiles(grid, W, H, ax, ay, bx, by) {
  let x = Math.floor(ax), y = Math.floor(ay); const tx = Math.floor(bx), ty = Math.floor(by), dx = bx - ax, dy = by - ay;
  const sx = Math.sign(dx), sy = Math.sign(dy), idx = Math.abs(1 / (dx || 1e-9)), idy = Math.abs(1 / (dy || 1e-9));
  let mx = (sx > 0 ? x + 1 - ax : ax - x) * idx, my = (sy > 0 ? y + 1 - ay : ay - y) * idy;
  for (let n = 0; n < 64; n++) {
    if (x === tx && y === ty) return true;
    if (mx < my) { mx += idx; x += sx; } else { my += idy; y += sy; }
    if (x < 0 || y < 0 || x >= W || y >= H || grid[y][x] === 1) return x === tx && y === ty && grid[y]?.[x] !== 1;
  }
  return false;
}
// a generator: yields between slices (main.js steps it a few ms per lift-ride frame); world.gi = { occ, irr, W, H } when done
export function* giBake(world, TS) {
  const W = world.W, H = world.H, grid = world.grid, R = GI_OCC_RES, OW = W * R, OH = H * R, ts = TS / R;
  // 1. occupancy: walls (whole tiles) and prop footprints (from the deck's meshes: anything standing on the floor with a small footprint)
  const wall = new Uint8Array(OW * OH), cover = new Float32Array(OW * OH);
  for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) { const c = grid[(y / R) | 0][(x / R) | 0]; if (c === 1) wall[x + y * OW] = 1; }
  world.group.updateMatrixWorld(true);
  const box = new THREE.Box3(), m = new THREE.Matrix4(), boxes = [];
  world.group.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.userData?.noAO) return; const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!mat || mat.transparent || mat.blending === THREE.AdditiveBlending || mat.isMeshBasicMaterial) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const gb = o.geometry.boundingBox; if (!gb || gb.isEmpty()) return;
    const n = o.isInstancedMesh ? o.count : 1;
    for (let i = 0; i < n; i++) {
      if (o.isInstancedMesh) { o.getMatrixAt(i, m); m.premultiply(o.matrixWorld); } else m.copy(o.matrixWorld);
      box.copy(gb).applyMatrix4(m);
      const sx = box.max.x - box.min.x, sz = box.max.z - box.min.z, hgt = box.max.y - box.min.y;
      // standing on the floor (a cabinet, a pillar, a table leg) or overhanging it below 1.2 m (a table top, a bench seat, a bed): both shade the floor under them.
      // Floor plates, rugs and decals (flat at y 0) and anything big (room-wide merged meshes, floors, ceilings) are left out.
      if (box.min.y > 1.2 || box.max.y < 0.12 || sx * sz > 7 || sx > 4.2 || sz > 4.2 || (hgt < 0.03 && box.min.y < 0.1)) continue;
      const tx = Math.floor((box.min.x + box.max.x) / 2 / TS), ty = Math.floor((box.min.z + box.max.z) / 2 / TS); if (grid[ty]?.[tx] !== 0 && grid[ty]?.[tx] !== 2) continue;
      const s = world.under?.[tx + ty * W] && box.min.y > 1 ? 0.4 : box.min.y > 0.25 ? 0.95 - 0.3 * (box.min.y - 0.25) : Math.min(1, 0.75 + hgt * 0.5);
      boxes.push([box.min.x, box.min.z, box.max.x, box.max.z, s]);
    }
  });
  yield;
  for (const [x0, z0, x1, z1, s] of boxes) {
    const a = Math.max(0, Math.floor(x0 / ts)), b = Math.min(OW - 1, Math.floor(x1 / ts)), c = Math.max(0, Math.floor(z0 / ts)), d = Math.min(OH - 1, Math.floor(z1 / ts));
    for (let y = c; y <= d; y++) {
      const fz = Math.max(0, Math.min(z1, (y + 1) * ts) - Math.max(z0, y * ts)) / ts;
      for (let x = a; x <= b; x++) { const fx = Math.max(0, Math.min(x1, (x + 1) * ts) - Math.max(x0, x * ts)) / ts, v = s * Math.min(1, Math.sqrt(fx * fz) * 1.3), k = x + y * OW; if (cover[k] < v) cover[k] = v; }   // partial texels (legs, posts) by their coverage
    }
  }
  yield;
  // 2. occlusion from box-filtered neighbourhoods (summed-area tables): two radii for a soft falloff
  const sat = (src) => { const S = new Float32Array((OW + 1) * (OH + 1)); for (let y = 0; y < OH; y++) { let row = 0; for (let x = 0; x < OW; x++) { row += src[x + y * OW]; S[(x + 1) + (y + 1) * (OW + 1)] = S[(x + 1) + y * (OW + 1)] + row; } } return S; };
  const SW = sat(wall), SC = sat(cover);
  const boxAvg = (S, x, y, r) => { const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(OW, x + r + 1), y1 = Math.min(OH, y + r + 1); return (S[x1 + y1 * (OW + 1)] - S[x0 + y1 * (OW + 1)] - S[x1 + y0 * (OW + 1)] + S[x0 + y0 * (OW + 1)]) / ((x1 - x0) * (y1 - y0)); };
  const occ = new Uint8Array(OW * OH * 4);
  for (let y = 0; y < OH; y++) {
    for (let x = 0; x < OW; x++) {
      const k = x + y * OW, w1 = boxAvg(SW, x, y, 1), w2 = boxAvg(SW, x, y, 3), c1 = boxAvg(SC, x, y, 1), c2 = boxAvg(SC, x, y, 2);
      const wf = 0.6 * w1 + 0.4 * w2, cf = Math.max(cover[k], 0.55 * c1 + 0.45 * c2);
      const floorAO = Math.max(0.2, 1 - 0.62 * wf - 0.78 * cf), ceilAO = Math.max(0.45, 1 - 0.6 * wf);
      const tx = (x / R) | 0, ty = (y / R) | 0; let ch = world.ceilAt(tx, ty);
      if (grid[ty][tx] === 1) { ch = 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (grid[ty + b]?.[tx + a] !== undefined && grid[ty + b][tx + a] !== 1) ch = Math.max(ch, world.ceilAt(tx + a, ty + b)); if (!ch) ch = 3.2; }
      occ[k * 4] = floorAO * 255; occ[k * 4 + 1] = ceilAO * 255; occ[k * 4 + 2] = Math.min(255, ch / CEIL_MAX * 255); occ[k * 4 + 3] = 255;
    }
    if ((y & 7) === 7) yield;
  }
  // 3. direct light of every panel at each irradiance texel (1 m up), tile line of sight, then one diffuse bounce spread through open space
  const IR = GI_IRR_RES, IW = W * IR, IH = H * IR, its = TS / IR, E = new Float32Array(IW * IH * 3), open = new Uint8Array(IW * IH);
  for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) open[x + y * IW] = grid[(y / IR) | 0][(x / IR) | 0] !== 1 ? 1 : 0;
  const buckets = new Map(), BK = 4;   // panels bucketed by 4x4 tiles
  for (const p of world.panels || []) { const k = Math.floor(p.x / TS / BK) + ',' + Math.floor(p.z / TS / BK); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(p); }
  const vis = new Map();
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      if (grid[ty][tx] === 1) continue;
      const near = []; const bx = Math.floor(tx / BK), by = Math.floor(ty / BK);
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) { const l = buckets.get((bx + i) + ',' + (by + j)); if (l) near.push(...l); }
      vis.clear();
      for (let sy = 0; sy < IR; sy++) for (let sx = 0; sx < IR; sx++) {
        const ix = tx * IR + sx, iy = ty * IR + sy, px = (ix + 0.5) * its, pz = (iy + 0.5) * its, k = (ix + iy * IW) * 3;
        for (const p of near) {
          const dist = p.dist || 10, dx = p.x - px, dz = p.z - pz, dy = p.y - 1, d = Math.hypot(dx, dy, dz); if (d >= dist) continue;
          let v = vis.get(p); if (v === undefined) { v = losTiles(grid, W, H, px / TS, pz / TS, p.x / TS, p.z / TS) ? 1 : 0; vis.set(p, v); } if (!v) continue;
          const e = 7.5 * (p.mul || 1) * atten(d, 1.5, dist) * (0.5 + 0.5 * Math.max(0, dy / d)) * (p.flick ? 0.7 : 1), c = p.col || { r: 1, g: 1, b: 1 };
          E[k] += e * c.r; E[k + 1] += e * c.g; E[k + 2] += e * c.b;
        }
      }
    }
    if ((ty & 1) === 1) yield;
  }
  // diffuse through open texels only (a wall stops it), 6 passes of a 3x3 average
  let A = E, B = new Float32Array(E.length);
  for (let pass = 0; pass < 6; pass++) {
    for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) {
      const k = x + y * IW; if (!open[k]) { B[k * 3] = B[k * 3 + 1] = B[k * 3 + 2] = 0; continue; }
      let r = 0, g = 0, b = 0, n = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const xx = x + i, yy = y + j; if (xx < 0 || yy < 0 || xx >= IW || yy >= IH) continue; const q = xx + yy * IW; if (!open[q]) continue; const w = i || j ? 1 : 2; r += A[q * 3] * w; g += A[q * 3 + 1] * w; b += A[q * 3 + 2] * w; n += w; }
      B[k * 3] = r / n; B[k * 3 + 1] = g / n; B[k * 3 + 2] = b / n;
    }
    const t = A; A = B; B = t === E ? new Float32Array(E.length) : t;
    yield;
  }
  const irr = new Uint8Array(IW * IH * 4), lit = new Float32Array(IW * IH), ALB = 0.32;
  for (let k = 0; k < IW * IH; k++) {
    const r = A[k * 3] * ALB, g = A[k * 3 + 1] * ALB, b = A[k * 3 + 2] * ALB;
    irr[k * 4] = Math.sqrt(Math.min(1, r / IRR_SCALE)) * 255; irr[k * 4 + 1] = Math.sqrt(Math.min(1, g / IRR_SCALE)) * 255; irr[k * 4 + 2] = Math.sqrt(Math.min(1, b / IRR_SCALE)) * 255;
    lit[k] = Math.min(1, lum(A[k * 3], A[k * 3 + 1], A[k * 3 + 2]) / 1.6); irr[k * 4 + 3] = Math.sqrt(lit[k]) * 255;
  }
  // walls take the values of the open space next to them (3 dilation passes), so a wall face samples its own room, not black
  for (let pass = 0; pass < 3; pass++) {
    const done = open.slice();
    for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) {
      const k = x + y * IW; if (open[k]) continue; let n = 0; const s = [0, 0, 0, 0];
      for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + i, yy = y + j; if (xx < 0 || yy < 0 || xx >= IW || yy >= IH) continue; const q = xx + yy * IW; if (!open[q]) continue; for (let c = 0; c < 4; c++) s[c] += irr[q * 4 + c]; n++; }
      if (n) { for (let c = 0; c < 4; c++) irr[k * 4 + c] = s[c] / n; done[k] = 1; }
    }
    open.set(done);
  }
  const tex = (data, w, h) => { const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType); t.magFilter = t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.generateMipmaps = false; t.needsUpdate = true; return t; };
  world.gi = { occ: tex(occ, OW, OH), irr: tex(irr, IW, IH), W, H, props: boxes.length };
}
// finish (or run) the bake now and point the shared uniforms at this deck
export function giUse(world, TS, renderer = null) {
  if (!world.gi) { const it = world._giIt || giBake(world, TS); while (!it.next().done); }
  world._giIt = null; const g = world.gi;
  GI.u.giOcc.value = g.occ; GI.u.giIrr.value = g.irr; GI.u.giBox.value.set(1 / (g.W * TS), 1 / (g.H * TS), 0, 0); GI.world = world;
  if (renderer) { try { renderer.initTexture(g.occ); renderer.initTexture(g.irr); } catch { /* old three */ } }
}
// a few ms of the bake (lift ride); true while work is left
export function giStep(world, TS, ms) {
  if (world.gi) return false; const it = world._giIt || (world._giIt = giBake(world, TS)), end = performance.now() + ms;
  do { if (it.next().done) { world._giIt = null; return false; } } while (performance.now() < end);
  return true;
}
export function giDispose(world) { if (world?.gi) { world.gi.occ.dispose(); world.gi.irr.dispose(); if (GI.world === world) { GI.world = null; GI.u.giOcc.value = GI.u.giIrr.value = blank; } world.gi = null; } }
