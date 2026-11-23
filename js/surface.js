// Surface detail layer for the architecture (walls, floors, ceilings, trim, door leaves): a MeshStandardMaterial patch
// (onBeforeCompile) that adds, on top of the tiled PBR sets from tools/build-textures.mjs:
//   - tiling break: world-space macro variation of albedo and roughness (three octaves of one 256 px tileable noise texture)
//   - grime: dirt in cavities (the ORM set's AO channel), along the wall base and in floor corners (a per-deck dirt map built
//     from the tile grid), soot streaks running down from the ceiling line; per-room and per-ship amounts
//   - edge wear: paint chipped back to bare metal on bevels and raised edges (found from the normal map's tilt), polished
//     traffic lanes down the middle of corridors
//   - box-projected world UVs for trim (door frames are scaled unit boxes: their own UVs stretch the texture)
// One shared set of uniforms per World: `uSfOn` switches the whole layer off on the Performance rung (World.setFancy) without
// a shader recompile. Cost: 3 macro fetches + 1 dirt-map fetch + 1 normal / AO re-fetch per fragment, no extra draw calls.
import * as THREE from 'three';

const KIND = { wall: 1, floor: 2, ceil: 3, trim: 4, door: 5 };
let macro = null;
// RGBA tileable value-noise fbm: R / G = broad tone, B = vertically stretched streaks, A = fine chips
export function macroTex() {
  if (macro) return macro;
  const N = 256, rng = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const vn = (cx, cy, seed) => { const R = rng(seed), g = new Float32Array(cx * cy); for (let i = 0; i < g.length; i++) g[i] = R(); const o = new Float32Array(N * N), sm = (t) => t * t * (3 - 2 * t);
    for (let y = 0; y < N; y++) { const fy = y / N * cy, y0 = Math.floor(fy), ty = sm(fy - y0), ya = (y0 % cy) * cx, yb = ((y0 + 1) % cy) * cx;
      for (let x = 0; x < N; x++) { const fx = x / N * cx, x0 = Math.floor(fx), tx = sm(fx - x0), xa = x0 % cx, xb = (x0 + 1) % cx; const a = g[ya + xa] + (g[ya + xb] - g[ya + xa]) * tx, b = g[yb + xa] + (g[yb + xb] - g[yb + xa]) * tx; o[y * N + x] = a + (b - a) * ty; } }
    return o; };
  const fbm = (c, oct, seed, cy = c) => { const o = new Float32Array(N * N); let amp = 1, tot = 0; for (let k = 0; k < oct; k++) { const n = vn(Math.min(128, c << k), Math.min(128, cy << k), seed + k * 13); for (let i = 0; i < o.length; i++) o[i] += n[i] * amp; tot += amp; amp *= 0.5; } for (let i = 0; i < o.length; i++) o[i] /= tot; return o; };
  const ch = [fbm(4, 5, 11), fbm(6, 4, 23), fbm(16, 3, 37, 2), fbm(24, 3, 51)], data = new Uint8Array(N * N * 4);
  for (let c = 0; c < 4; c++) { const a = ch[c]; let lo = 1, hi = 0; for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; } for (let i = 0; i < N * N; i++) data[i * 4 + c] = Math.round((a[i] - lo) / (hi - lo) * 255); }   // stretch each to 0..1
  macro = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  macro.wrapS = macro.wrapT = THREE.RepeatWrapping; macro.magFilter = THREE.LinearFilter; macro.minFilter = THREE.LinearMipmapLinearFilter; macro.generateMipmaps = true; macro.anisotropy = 4; macro.needsUpdate = true;
  return macro;
}

// Per-deck dirt map: P px per tile. R = closeness to a wall (dirt collects in edges and corners), G = foot traffic (corridor
// centre lines, away from walls), B = how dirty this room is (room-type bias + a per-room roll). Linear filtered, no mipmaps.
export function deckDirt(grid, room, rooms, deck, TS, opts = {}) {
  const H = grid.length, W = grid[0].length, P = opts.P || 6, w = W * P, h = H * P, data = new Uint8Array(w * h * 4), m = TS / P;
  const solid = (x, y) => x < 0 || y < 0 || x >= W || y >= H || grid[y][x] === 1;
  const DIRTY = { engineering: 0.35, cargo: 0.3, workshop: 0.35, plant: 0.4, shuttlebay: 0.25, jefferies: 0.3, stores: 0.2, brig: 0.15, armory: 0.1, airlock: 0.2, laundry: 0.1,
    sickbay: -0.35, lab: -0.3, bridge: -0.3, morgue: -0.25, washroom: -0.1, readyroom: -0.25, quarters: -0.1, holodeck: -0.4, datacore: -0.2 };
  const roomDirt = {}; for (const r of rooms || []) { const hh = Math.sin(r.x * 12.9898 + r.y * 78.233 + deck * 7.31) * 43758.5453; roomDirt[r.x + ',' + r.y] = Math.min(1, Math.max(0, 0.45 + (DIRTY[r.type] || 0) + (hh - Math.floor(hh) - 0.5) * 0.4)); }
  const roomAt = {}; for (const r of rooms || []) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) roomAt[x + y * W] = roomDirt[r.x + ',' + r.y];
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const mx = (px + 0.5) * m, mz = (py + 0.5) * m, tx = Math.floor(px / P), ty = Math.floor(py / P); let dist = 9;
    if (solid(tx, ty)) dist = 0;
    else for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) { if (!solid(tx + ox, ty + oy)) continue; const x0 = (tx + ox) * TS, z0 = (ty + oy) * TS, dx = Math.max(x0 - mx, 0, mx - x0 - TS), dz = Math.max(z0 - mz, 0, mz - z0 - TS), dd = Math.hypot(dx, dz); if (dd < dist) dist = dd; }
    const inRoom = !!room[ty]?.[tx], ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const i = (py * w + px) * 4;
    data[i] = Math.round((1 - ss(0, 0.9, dist)) * 255);
    data[i + 1] = Math.round((inRoom ? 0.3 : 1) * ss(0.35, 1.1, dist) * 255);
    data[i + 2] = Math.round((roomAt[tx + ty * W] ?? (opts.corridor ?? 0.5)) * 255);
    data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}

// The PBR albedos are neutral grey (the game tints per ship / room). A patched material samples a one-channel R8 copy instead
// of the RGBA original: a quarter of the GPU memory (1024 px: 1.4 MB instead of 5.6 MB with mipmaps). The copy keeps the
// sRGB-encoded bytes and the shader decodes them (SF_GREY). Built lazily from the decoded image, once per set.
const greyCache = new WeakMap();
export function greyOf(tex) {
  if (!tex?.userData?.grey || !tex.image) return null;
  let g = greyCache.get(tex); if (g) return g;
  const img = tex.image, w = img.width, h = img.height; if (!w || !h) return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
  const src = x.getImageData(0, 0, w, h).data, data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) { const so = (h - 1 - y) * w * 4, dO = y * w; for (let i = 0; i < w; i++) data[dO + i] = src[so + i * 4]; }   // flip rows: image textures upload with flipY
  g = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.UnsignedByteType);
  g.wrapS = tex.wrapS; g.wrapT = tex.wrapT; g.repeat.copy(tex.repeat); g.offset.copy(tex.offset); g.anisotropy = tex.anisotropy; g.unpackAlignment = 1;
  g.magFilter = THREE.LinearFilter; g.minFilter = THREE.LinearMipmapLinearFilter; g.generateMipmaps = true; g.needsUpdate = true;
  greyCache.set(tex, g); return g;
}
const MAP_GREY = `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  sampledDiffuseColor = vec4( sRGBTransferEOTF( vec4( sampledDiffuseColor.rrr, 1.0 ) ).rgb, 1.0 );
  diffuseColor *= sampledDiffuseColor;
#endif
`;

// uniforms shared by every patched material of one World
export function surfaceUniforms(dirt, W, H, TS, wear = 0.5) {
  return { uSfOn: { value: 1 }, uSfWear: { value: wear }, uSfDeck: { value: dirt }, uSfDeckXf: { value: new THREE.Vector2(1 / (W * TS), 1 / (H * TS)) } };
}

const VERT_PARS = 'varying vec3 vSfW;\nvarying vec3 vSfN;\n';
const VERT = `
  { vec4 sfw = vec4( transformed, 1.0 ); vec3 sfn = objectNormal;
  #ifdef USE_INSTANCING
    sfw = instanceMatrix * sfw; sfn = mat3( instanceMatrix ) * sfn;
  #endif
    sfw = modelMatrix * sfw; vSfW = sfw.xyz; vSfN = normalize( mat3( modelMatrix ) * sfn );
  #ifdef SF_BOX
    vec3 sa = abs( vSfN );
    vec2 sfb = ( sa.x > sa.y && sa.x > sa.z ) ? vec2( -sign( vSfN.x ) * sfw.z, sfw.y ) : ( sa.y > sa.z ? sfw.xz : vec2( sign( vSfN.z ) * sfw.x, sfw.y ) );
    sfb *= SF_BOX;
    #ifdef USE_MAP
      vMapUv = sfb;
    #endif
    #ifdef USE_NORMALMAP
      vNormalMapUv = sfb;
    #endif
    #ifdef USE_ROUGHNESSMAP
      vRoughnessMapUv = sfb;
    #endif
    #ifdef USE_METALNESSMAP
      vMetalnessMapUv = sfb;
    #endif
    #ifdef USE_AOMAP
      vAoMapUv = sfb;
    #endif
  #endif
  }
`;
const FRAG_PARS = 'varying vec3 vSfW;\nvarying vec3 vSfN;\nuniform float uSfOn;\nuniform float uSfWear;\nuniform sampler2D uSfMacro;\nuniform sampler2D uSfDeck;\nuniform vec2 uSfDeckXf;\n';
const FRAG = `
  if ( uSfOn > 0.5 ) {
    vec3 sfP = vSfW, sfN = normalize( vSfN );
  #if SF_KIND == 2 || SF_KIND == 3
    vec2 sfUV = sfP.xz;
  #elif SF_KIND == 5 && defined( USE_MAP )
    vec2 sfUV = vMapUv * vec2( 1.0, 2.4 ) + vec2( dot( floor( sfP.xz * 0.4 ), vec2( 0.37, 0.71 ) ) );   // door leaves slide: stay in their own UV space
  #else
    vec2 sfUV = abs( sfN.x ) > abs( sfN.z ) ? sfP.zy : sfP.xy;
  #endif
    vec4 mA = texture2D( uSfMacro, sfUV * 0.11 ), mB = texture2D( uSfMacro, sfUV * 0.53 + 0.37 ), mC = texture2D( uSfMacro, sfUV * 2.3 + 0.71 );
    vec4 dk = texture2D( uSfDeck, ( sfP.xz + sfN.xz * 0.35 ) * uSfDeckXf );
    float wear = uSfWear, room = 0.55 + dk.b * 0.9;
    // tiling break
    diffuseColor.rgb *= 1.0 + ( mA.r - 0.5 ) * 0.24 + ( mB.g - 0.5 ) * 0.12;
    roughnessFactor = clamp( roughnessFactor + ( mB.r - 0.5 ) * 0.14, 0.04, 1.0 );
    // edges (normal-map tilt) and cavities (baked AO)
    float sfEdge = 0.0, sfCav = 0.0;
  #ifdef USE_NORMALMAP
    vec3 sfNt = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0; sfEdge = smoothstep( 0.05, 0.3, 1.0 - sfNt.z );
  #endif
  #ifdef USE_AOMAP
    sfCav = 1.0 - texture2D( aoMap, vAoMapUv ).r;
  #endif
    float g = sfCav * ( 0.4 + 0.8 * mB.g );
  #if SF_KIND == 1
    float sfH = sfP.y;
    g += ( 1.0 - smoothstep( 0.0, 0.85, sfH ) ) * ( 0.35 + 0.65 * dk.r ) * ( 0.6 + 0.8 * mB.a );   // splash / mop line at the base
    g += smoothstep( 0.6, 0.9, mB.b ) * smoothstep( 1.4, 3.1, sfH ) * 0.45;                       // soot streaks from the ceiling line
  #elif SF_KIND == 2
    g += dk.r * ( 0.55 + 0.7 * mB.g ) + smoothstep( 0.55, 0.85, mA.g ) * 0.35;
    float lane = dk.g * smoothstep( 0.3, 0.7, mB.a ) * ( 0.5 + wear );                             // boots polish the middle of a corridor
    roughnessFactor = mix( roughnessFactor, roughnessFactor * 0.55, lane * 0.7 ); diffuseColor.rgb *= 1.0 + lane * 0.1;
  #elif SF_KIND == 3
    g += smoothstep( 0.55, 0.85, mA.b ) * 0.4;
  #elif SF_KIND == 5
    g += ( 1.0 - smoothstep( 0.0, 0.5, sfP.y ) ) * 0.6;
  #endif
    g = clamp( g * ( 0.45 + wear ) * room * 0.9, 0.0, 0.85 );
    diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.42, 0.38, 0.33 ), g );
    roughnessFactor = mix( roughnessFactor, 0.95, g * 0.45 );
    // edge wear: paint off (walls, doors), polished steel (trim, floors)
    float chip = sfEdge * smoothstep( 0.45, 0.6, mC.a * 0.75 + sfEdge * 0.3 + wear * 0.2 );
  #if SF_KIND == 1 || SF_KIND == 5
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.46, 0.46, 0.48 ), chip * 0.75 ); metalnessFactor = mix( metalnessFactor, 0.85, chip * 0.8 ); roughnessFactor = mix( roughnessFactor, 0.35, chip * 0.7 );
  #elif SF_KIND == 2 || SF_KIND == 4
    diffuseColor.rgb *= 1.0 + chip * 0.35; roughnessFactor = mix( roughnessFactor, 0.28, chip * 0.6 );
  #endif
  }
`;

// patch one material. kind: wall | floor | ceil | trim | door. opts.box: world-projected UV repeats per metre (trim)
export function surfaceFX(mat, kind, U, opts = {}) {
  if (!mat || !U || !mat.isMeshStandardMaterial) return mat;
  const k = KIND[kind] || 1, box = opts.box || 0;
  const grey = greyOf(mat.map); if (grey) mat.map = grey;
  mat.defines = Object.assign(mat.defines || {}, { SF_KIND: k }, box ? { SF_BOX: box.toFixed(3) } : {}, grey ? { SF_GREY: 1 } : {});
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSfMacro = { value: macroTex() }; for (const n of ['uSfOn', 'uSfWear', 'uSfDeck', 'uSfDeckXf']) sh.uniforms[n] = U[n];
    sh.vertexShader = VERT_PARS + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT);
    if (grey) sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', MAP_GREY);
    sh.fragmentShader = FRAG_PARS + sh.fragmentShader.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + FRAG);
  };
  mat.customProgramCacheKey = () => 'sf' + k + ':' + box + (grey ? 'g' : '');
  mat.userData.sf = kind;
  return mat;
}

// how worn a ship is: older registry years wear more (USF-1867 ≈ 0.62, USF-1949 ≈ 0.3)
export function shipWear(ship) { const y = +(String(ship?.reg || '').match(/(\d{4})/)?.[1] || 1900); return Math.max(0.2, Math.min(0.7, 0.62 - (y - 1867) / 82 * 0.32)); }
