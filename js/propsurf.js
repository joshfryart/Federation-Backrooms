// Prop surfaces: the shared PBR wear layer, emissive screens and the decal atlas for environment props and set dressing
// (texture pass 4; docs/propart-integration.md "Texture pass 4"). Everything here is shared: no per-prop material, texture or shader program.
//
//   wearMaterial(mat)       patches a MeshStandardMaterial in place (once): object-space triplanar wear sampled from one packed mask
//                           (assets/textures/propwear_m.webp, tools/build-textures.mjs MASKS): micro-dents / scratches as a derivative bump,
//                           smudge roughness, grime that gathers low on the prop and in the dirt mask, paint chips on edges (from screen-space
//                           curvature) that bare the metal underneath. Fixed metres-per-tile, so the texel density is the same on every prop.
//                           Strength per material class (metal / paint / plastic / fabric) from its metalness + roughness, or mat.userData.wear.
//   screenMaterial(basic)   a self-lit MeshBasicMaterial screen (map = the screen texture) -> dark glass MeshStandardMaterial with the screen as
//                           emissiveMap (same brightness), environment reflections, a phosphor row mask and an edge falloff. Cached per source.
//   surfaceProp(g, kind)    applies both to every mesh in a prop group (materials referenced from g.userData are left alone: the game animates them)
//                           and, for floor props, adds the decals: hazard stripes, warning pictograms, labels, serial plates, inventory barcodes and
//                           stencils from one canvas atlas, placed on flat, unoccluded faces found by a small software z-buffer of the prop
//                           (front and both sides), merged into ONE mesh named 'decals' (World merges all of a deck's decals into one draw).
// Nothing here calls Math.random (the tests seed it per section): placement is hashed from the kind.
import * as THREE from 'three';

// ------------------------------------------------------------------ the wear mask
const U = { tWear: { value: null }, uWearOn: { value: 0 } };
let wearTex = null, wearLoading = false;
export function loadPropWear(url = './assets/textures/propwear_m.webp') {
  if (wearTex || wearLoading || typeof document === 'undefined') return Promise.resolve(wearTex);
  wearLoading = true;
  return new Promise(res => new THREE.TextureLoader().load(url, t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.NoColorSpace; wearTex = U.tWear.value = t; U.uWearOn.value = 1; res(t);
  }, undefined, () => res(null)));
}
loadPropWear();   // starts with the module (tiny, one file); until it arrives the layer is off (uWearOn = 0)
export const propWear = U;

// class -> [bump, chip, grime, smudge]
const CLASS = { metal: [1.0, 0.0, 0.55, 0.8], paint: [0.7, 1.0, 0.7, 0.45], plastic: [0.35, 0.3, 0.55, 0.7], fabric: [0.45, 0.0, 0.45, 0.0], hazard: [0.7, 1.5, 0.8, 0.4] };
function classOf(m) {
  if (m.userData.wear) return m.userData.wear;
  const met = m.metalness ?? 0, ro = m.roughness ?? 0.5, c = m.color;
  if (c && c.r > 0.5 && c.g > 0.35 && c.b < 0.15 && met < 0.5) return 'hazard';   // yellow safety paint wears through fastest
  if (met >= 0.7) return 'metal';
  if (ro >= 0.82 && met < 0.2) return 'fabric';
  if (met < 0.2) return 'plastic';
  return 'paint';
}
const WEAR_VERT_PARS = 'varying vec3 vPwPos;\nvarying vec3 vPwNrm;\n';
const WEAR_FRAG_PARS = /* glsl */`
uniform sampler2D tWear; uniform float uWearOn; uniform vec4 uWear;
varying vec3 vPwPos; varying vec3 vPwNrm;
vec3 pwW(vec3 n) { vec3 w = pow(abs(n), vec3(4.0)); return w / (w.x + w.y + w.z + 1e-5); }
vec3 pwS(vec3 p, vec3 w, float s) { return texture2D(tWear, p.zy * s).rgb * w.x + texture2D(tWear, p.xz * s).rgb * w.y + texture2D(tWear, p.xy * s).rgb * w.z; }
vec3 pwBump(vec3 surf, vec3 n, float h, float fd) {   // derivative bump (unnormalised screen derivatives: h in metres gives a true slope)
  vec3 sx = dFdx(surf), sy = dFdy(surf), r1 = cross(sy, n), r2 = cross(n, sx); float det = dot(sx, r1) * fd;
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2); return normalize(abs(det) * n - grad);
}
`;
// High quality only (world.setFancy): below that the patched materials compile to the plain shader (one program switch on the change)
let DETAIL = true; const PATCHED = new Set();
export function setPropDetail(on) { on = !!on; if (on === DETAIL) return; DETAIL = on; for (const m of PATCHED) m.needsUpdate = true; }
function wearCompile(shader, renderer) {
  const m = this; if (!DETAIL) return;
  shader.uniforms.tWear = U.tWear; shader.uniforms.uWearOn = U.uWearOn; shader.uniforms.uWear = m.userData.wearU;
  shader.vertexShader = WEAR_VERT_PARS + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vPwPos = position; vPwNrm = objectNormal;');
  shader.fragmentShader = WEAR_FRAG_PARS + shader.fragmentShader
    .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
  vec3 pwN = normalize(vPwNrm), pwTw = pwW(pwN);
  vec3 pwF = pwS(vPwPos, pwTw, 2.0), pwC = pwS(vPwPos + vec3(0.37, 0.11, 0.73), pwTw, 0.625);
  float pwCurv = length(fwidth(vPwNrm)) / max(length(fwidth(vPwPos)), 1e-4);          // ~1 / radius (m^-1): rounded edges, small pipes
  float pwEdge = smoothstep(9.0, 40.0, pwCurv);
  float pwLow = 1.0 - smoothstep(0.02, 0.5, vPwPos.y);                                  // props stand on the floor: dirt rises from it
  float pwGrime = uWearOn * uWear.z * clamp(pwC.g * 0.9 + pwLow * 0.55 - 0.15, 0.0, 1.0);
  float pwChip = uWearOn * step(0.01, uWear.y) * smoothstep(0.62, 0.67, pwF.b * 0.68 + pwEdge * 0.45 + pwLow * 0.08 + (uWear.y - 1.0) * 0.1);   // edges chip, flats rarely
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.43, 0.45), pwChip);
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.5, 0.46, 0.4), pwGrime * 0.75);`)
    .replace('#include <metalnessmap_fragment>', /* glsl */`#include <metalnessmap_fragment>
  roughnessFactor = clamp(roughnessFactor + uWearOn * ((pwF.g - 0.35) * 0.35 * uWear.w + pwGrime * 0.22), 0.05, 1.0);
  roughnessFactor = mix(roughnessFactor, 0.38, pwChip); metalnessFactor = mix(metalnessFactor, 0.85, pwChip);`)
    .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
  normal = pwBump(-vViewPosition, normal, (pwF.r - 0.5) * 0.0016 * uWear.x * uWearOn - pwChip * 0.0004, faceDirection);`);
}
const wearKey = () => DETAIL ? 'propwear1' : 'propwear0';
export function wearMaterial(m) {
  if (!m || m.userData.wearU || !(m.isMeshStandardMaterial) || m.isShaderMaterial) return m;
  if (m.transparent || m.wireframe || m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return m;   // glass / holograms / already patched elsewhere
  if (m.aoMap || (m.map && !m.map.isCanvasTexture)) return m;   // scanned GLB props keep their own authored wear
  const c = classOf(m); m.userData.wearU = { value: new THREE.Vector4(...(CLASS[c] || CLASS.paint)) }; m.userData.wearClass = c;
  m.onBeforeCompile = wearCompile; m.customProgramCacheKey = wearKey; m.needsUpdate = true; PATCHED.add(m);
  return m;
}

// ------------------------------------------------------------------ screens: emissive glass
const SCR = new Map();
function screenCompile(shader) {
  shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
  #ifdef USE_EMISSIVEMAP
    vec2 scE = min(vEmissiveMapUv, 1.0 - vEmissiveMapUv); float scV = smoothstep(0.0, 0.05, min(scE.x, scE.y));
    float scRow = vEmissiveMapUv.y * float(textureSize(emissiveMap, 0).y); float scF = clamp(fwidth(scRow) * 1.6 - 0.4, 0.0, 1.0);
    totalEmissiveRadiance *= mix(0.8, 1.0, scV) * mix(0.84 + 0.16 * cos(scRow * 6.2831853), 0.92, scF);
  #endif
  #ifdef USE_COLOR
    totalEmissiveRadiance *= vColor.rgb;   // per-instance tint (wall label displays)
  #endif`);
}
const screenKey = () => 'propscreen1';
export function screenMaterial(b) {
  if (!b || !b.isMeshBasicMaterial || !b.map || b.transparent || b.userData.noScreen) return b;
  let s = SCR.get(b); if (s) return s;
  const k = b.color.clone().multiplyScalar(1.08);   // the dark glass absorbs a little; keeps the old self-lit brightness
  s = new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 0.16, metalness: 0.0, emissive: k, emissiveMap: b.map, envMapIntensity: 0.7, side: b.side, polygonOffset: b.polygonOffset, polygonOffsetFactor: b.polygonOffsetFactor, polygonOffsetUnits: b.polygonOffsetUnits });
  s.name = (b.name || 'screen') + ':glass'; s.userData.screenOf = b; s.onBeforeCompile = screenCompile; s.customProgramCacheKey = screenKey;
  SCR.set(b, s); return s;
}

// ------------------------------------------------------------------ decal atlas (1024 x 1024 canvas, drawn once)
// cells [x, y, w, h] in px; `strip` cells tile horizontally (period divides the width)
const CELL = {
  hazY: [0, 0, 512, 64], hazR: [512, 0, 512, 64],
  warn: [0, 64, 128, 128], volt: [128, 64, 128, 128], hot: [256, 64, 128, 128], med: [384, 64, 128, 128], nostepI: [512, 64, 128, 128], arrow: [640, 64, 128, 128], rad: [768, 64, 128, 128], fire: [896, 64, 128, 128],
  plate: [0, 192, 256, 96], plate2: [256, 192, 256, 96], barcode: [512, 192, 256, 96], tag: [768, 192, 128, 96], qr: [896, 192, 128, 96],
  caution: [0, 288, 384, 96], hotsurf: [384, 288, 384, 96], nostep: [768, 288, 256, 96],
  st0: [0, 384, 256, 128], st1: [256, 384, 256, 128], st2: [512, 384, 256, 128], st3: [768, 384, 256, 128],
  upright: [0, 512, 384, 96], coolant: [384, 512, 384, 96], o2: [768, 512, 256, 96],
  sterile: [0, 608, 384, 96], liftpt: [384, 608, 384, 96], power: [768, 608, 256, 96],
  grounded: [0, 704, 384, 96], pressure: [384, 704, 384, 96], maxload: [768, 704, 256, 96],
};
let atlasTex = null, decalMat = null;
function hash(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function prng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function drawAtlas(g) {
  const R = prng(91), YEL = '#e8b21c', BLK = '#15161a', WHT = '#eef0ee', RED = '#c8281e';
  const rr = (x, y, w, h, r, c) => { g.fillStyle = c; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
  const txt = (s, x, y, size, c, align = 'center', font = 'bold') => { g.fillStyle = c; g.font = `${font} ${size}px "DejaVu Sans", Arial, sans-serif`; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y); };
  const wearOut = (x, y, w, h, n, a = 1) => { g.save(); g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < n; i++) { g.globalAlpha = a * (0.5 + R() * 0.5); g.beginPath(); g.arc(x + R() * w, y + R() * h, 0.6 + R() * 2.2, 0, 7); g.fill(); } g.restore(); };
  const stripe = ([x, y, w, h], c0, c1) => { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.fillStyle = c0; g.fillRect(x, y, w, h); g.fillStyle = c1; for (let k = -h; k < w + h; k += 64) { g.beginPath(); g.moveTo(x + k, y + h); g.lineTo(x + k + 32, y + h); g.lineTo(x + k + 32 + h, y); g.lineTo(x + k + h, y); g.fill(); } g.restore(); wearOut(x, y, w, h, 160); };
  stripe(CELL.hazY, YEL, BLK); stripe(CELL.hazR, WHT, RED);
  const tri = ([x, y, w], draw) => { const c = w / 2; g.lineJoin = 'round'; g.fillStyle = BLK; g.beginPath(); g.moveTo(x + c, y + 8); g.lineTo(x + w - 6, y + w - 14); g.lineTo(x + 6, y + w - 14); g.closePath(); g.fill(); g.fillStyle = YEL; g.beginPath(); g.moveTo(x + c, y + 20); g.lineTo(x + w - 18, y + w - 21); g.lineTo(x + 18, y + w - 21); g.closePath(); g.fill(); g.fillStyle = BLK; g.strokeStyle = BLK; draw(x, y, c); wearOut(x, y, w, w, 40); };
  tri(CELL.warn, (x, y, c) => { g.fillRect(x + c - 6, y + 46, 12, 38); g.beginPath(); g.arc(x + c, y + 95, 7, 0, 7); g.fill(); });
  tri(CELL.volt, (x, y, c) => { g.beginPath(); g.moveTo(x + c + 6, y + 40); g.lineTo(x + c - 14, y + 74); g.lineTo(x + c, y + 74); g.lineTo(x + c - 8, y + 102); g.lineTo(x + c + 16, y + 64); g.lineTo(x + c + 2, y + 64); g.closePath(); g.fill(); });
  tri(CELL.hot, (x, y, c) => { g.lineWidth = 5; for (const dx of [-14, 0, 14]) { g.beginPath(); for (let t = 0; t <= 1; t += 0.05) g.lineTo(x + c + dx + Math.sin(t * 9) * 4, y + 98 - t * 52); g.stroke(); } g.fillRect(x + c - 24, y + 98, 48, 5); });
  tri(CELL.rad, (x, y, c) => { g.beginPath(); g.arc(x + c, y + 76, 6, 0, 7); g.fill(); for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + k * 2.094; g.beginPath(); g.moveTo(x + c + Math.cos(a - 0.5) * 10, y + 76 + Math.sin(a - 0.5) * 10); g.arc(x + c, y + 76, 26, a - 0.5, a + 0.5); g.arc(x + c, y + 76, 10, a + 0.5, a - 0.5, true); g.fill(); } });
  tri(CELL.fire, (x, y, c) => { g.beginPath(); g.moveTo(x + c, y + 44); g.bezierCurveTo(x + c + 26, y + 70, x + c + 18, y + 102, x + c, y + 102); g.bezierCurveTo(x + c - 18, y + 102, x + c - 24, y + 76, x + c - 6, y + 64); g.bezierCurveTo(x + c - 4, y + 76, x + c + 2, y + 78, x + c + 2, y + 70); g.closePath(); g.fill(); });
  { const [x, y, w] = CELL.med, c = w / 2; g.fillStyle = WHT; g.beginPath(); g.arc(x + c, y + c, 56, 0, 7); g.fill(); g.fillStyle = '#2f9a5a'; g.fillRect(x + c - 13, y + c - 40, 26, 80); g.fillRect(x + c - 40, y + c - 13, 80, 26); wearOut(x, y, w, w, 30); }
  { const [x, y, w] = CELL.nostepI, c = w / 2; g.fillStyle = WHT; g.beginPath(); g.arc(x + c, y + c, 58, 0, 7); g.fill(); g.fillStyle = BLK; g.beginPath(); g.ellipse(x + c - 4, y + c + 6, 16, 30, -0.3, 0, 7); g.fill(); g.strokeStyle = RED; g.lineWidth = 12; g.beginPath(); g.arc(x + c, y + c, 50, 0, 7); g.stroke(); g.beginPath(); g.moveTo(x + c - 35, y + c - 35); g.lineTo(x + c + 35, y + c + 35); g.stroke(); }
  { const [x, y, w] = CELL.arrow; g.fillStyle = YEL; for (let k = 0; k < 3; k++) { const ox = x + 12 + k * 36; g.beginPath(); g.moveTo(ox, y + 24); g.lineTo(ox + 26, y + 24); g.lineTo(ox + 56, y + 64); g.lineTo(ox + 26, y + 104); g.lineTo(ox, y + 104); g.lineTo(ox + 30, y + 64); g.closePath(); g.fill(); } wearOut(x, y, w, w, 50); }
  const plate = ([x, y, w, h], l1, l2, l3) => {   // brushed metal ID plate, rivets, three lines and a small barcode
    const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#b9bfc6'); gr.addColorStop(0.5, '#9aa1a9'); gr.addColorStop(1, '#c4c9cf'); rr(x + 2, y + 2, w - 4, h - 4, 8, gr);
    g.fillStyle = 'rgba(255,255,255,0.18)'; for (let i = 0; i < 40; i++) g.fillRect(x + 4, y + 4 + R() * (h - 8), w - 8, 1);
    g.fillStyle = '#4a4f57'; for (const [px, py] of [[10, 10], [w - 10, 10], [10, h - 10], [w - 10, h - 10]]) { g.beginPath(); g.arc(x + px, y + py, 4, 0, 7); g.fill(); }
    txt(l1, x + 20, y + 22, 18, '#22262c', 'left'); txt(l2, x + 20, y + 48, 15, '#2c3138', 'left', '600'); txt(l3, x + 20, y + 72, 13, '#3a3f47', 'left', '500');
    g.fillStyle = '#22262c'; for (let i = 0, bx = x + w - 76; i < 26; i++) { const bw = 1 + (R() * 3 | 0); g.fillRect(bx, y + 58, bw, 24); bx += bw + 1 + (R() * 2 | 0); }
  };
  plate(CELL.plate, 'USF · SHIPYARD 4', 'MODEL SX-4471  REV C', 'SER 0447-B   480 VAC  60 A');
  plate(CELL.plate2, 'USF · SYSTEMS DIV.', 'UNIT 22-K   ASSY 9031', 'SER 1183-D   CLASS II');
  { const [x, y, w, h] = CELL.barcode; rr(x + 2, y + 2, w - 4, h - 4, 6, WHT); g.fillStyle = BLK; for (let bx = x + 16; bx < x + w - 16;) { const bw = 1 + (R() * 4 | 0); if (R() < 0.6) g.fillRect(bx, y + 14, bw, 46); bx += bw + 1; } txt('INV 22-0193 · DECK STORES', x + w / 2, y + 76, 14, BLK, 'center', '600'); }
  { const [x, y, w, h] = CELL.tag; rr(x + 2, y + 2, w - 4, h - 4, 6, '#f2d23a'); txt('INSPECTED', x + w / 2, y + 16, 13, BLK); g.strokeStyle = BLK; g.lineWidth = 1.5; for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { g.strokeRect(x + 10 + c * 28, y + 30 + r * 20, 22, 14); if (R() < 0.5) { g.beginPath(); g.moveTo(x + 13 + c * 28, y + 37 + r * 20); g.lineTo(x + 19 + c * 28, y + 41 + r * 20); g.lineTo(x + 29 + c * 28, y + 32 + r * 20); g.stroke(); } } }
  { const [x, y, w, h] = CELL.qr; rr(x + 2, y + 2, w - 4, h - 4, 4, WHT); const s = 6, n = 13, ox = x + (w - n * s) / 2, oy = y + (h - n * s) / 2; g.fillStyle = BLK; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const f = (i < 3 && j < 3) || (i > n - 4 && j < 3) || (i < 3 && j > n - 4); if (f ? !(i % 2 === 1 && j % 2 === 1 && (i === 1 || i === n - 2) && (j === 1 || j === n - 2)) : R() < 0.45) g.fillRect(ox + i * s, oy + j * s, s, s); } }
  const label = ([x, y, w, h], s, bg, fg, sub) => { rr(x + 2, y + 6, w - 4, h - 12, 6, bg); g.strokeStyle = fg; g.lineWidth = 3; g.beginPath(); g.roundRect(x + 8, y + 12, w - 16, h - 24, 4); g.stroke(); txt(s, x + w / 2, y + (sub ? h / 2 - 9 : h / 2), sub ? 26 : 30, fg); if (sub) txt(sub, x + w / 2, y + h / 2 + 17, 14, fg, 'center', '600'); wearOut(x, y, w, h, 45); };
  label(CELL.caution, 'CAUTION', YEL, BLK, 'HIGH VOLTAGE · AUTHORISED CREW ONLY'); label(CELL.hotsurf, 'HOT SURFACE', '#d8501c', WHT, 'DO NOT TOUCH WHILE IN USE');
  label(CELL.upright, '▲  THIS SIDE UP  ▲', WHT, BLK); label(CELL.coolant, 'COOLANT LOOP 2', '#2f6fb8', WHT, 'FLOW  ▶▶▶  DO NOT CLOSE'); label(CELL.o2, 'O₂  SUPPLY', '#2f9a5a', WHT);
  label(CELL.sterile, 'STERILE FIELD', WHT, '#2f9a5a', 'GLOVES BEYOND THIS POINT'); label(CELL.liftpt, 'LIFT POINT', YEL, BLK, '▼  ANTIGRAV SLED ONLY  ▼'); label(CELL.power, 'MAINS  ⏻', BLK, YEL);
  label(CELL.grounded, 'GROUND BEFORE SERVICE', '#3a3f47', YEL); label(CELL.pressure, 'PRESSURISED', RED, WHT, 'VENT BEFORE OPENING'); label(CELL.maxload, 'MAX 400 kg', WHT, BLK);
  { const [x, y, w, h] = CELL.nostep; txt('NO STEP', x + w / 2, y + h / 2, 52, WHT, 'center', '900'); wearOut(x, y, w, h, 120); }
  ['A-07', 'C3', '17', 'B-12'].forEach((s, i) => { const [x, y, w, h] = CELL['st' + i]; txt(s, x + w / 2, y + h / 2 + 4, 92, i % 2 ? YEL : WHT, 'center', '900'); g.fillStyle = 'rgba(0,0,0,1)'; g.save(); g.globalCompositeOperation = 'destination-out'; for (let k = 1; k < 4; k++) g.fillRect(x + k * w / 4 - 2, y, 4, h); g.restore(); wearOut(x, y, w, h, 220); });
}
function atlas() {
  if (atlasTex) return atlasTex;
  const c = document.createElement('canvas'); c.width = c.height = 1024; drawAtlas(c.getContext('2d'));
  atlasTex = new THREE.CanvasTexture(c); atlasTex.colorSpace = THREE.SRGBColorSpace; atlasTex.anisotropy = 8; return atlasTex;
}
export function decalMaterial() {
  if (decalMat) return decalMat;
  decalMat = new THREE.MeshStandardMaterial({ map: atlas(), alphaTest: 0.5, roughness: 0.62, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  decalMat.userData.wear = 'paint'; decalMat.name = 'propdecals'; wearMaterial(decalMat);   // decals pick up the same grime and chips as the paint under them
  return decalMat;
}

// ------------------------------------------------------------------ what each prop carries
// item: [cell, width m, faces ('f' front, 's' sides), v range [y0, y1] m]; 'strip' items run along the longest flat band at the base
const D = {
  hazStrip: { strip: 'hazY', h: 0.075, v: [0.06, 0.34] },
  warn: ['warn', 0.12, 'fs', [0.55, 1.6]], volt: ['volt', 0.12, 'fs', [0.45, 1.6]], hot: ['hot', 0.12, 'f', [0.45, 1.4]], rad: ['rad', 0.12, 'fs', [0.6, 1.7]], fire: ['fire', 0.11, 'fs', [0.4, 1.4]], med: ['med', 0.11, 'fs', [0.5, 1.5]], nostepI: ['nostepI', 0.11, 's', [0.3, 1.0]], arrow: ['arrow', 0.12, 's', [0.2, 0.7]],
  plate: ['plate', 0.17, 'fs', [0.2, 0.95]], plate2: ['plate2', 0.17, 'fs', [0.2, 0.95]], barcode: ['barcode', 0.1, 'fs', [0.12, 0.8]], tag: ['tag', 0.075, 'fs', [0.3, 1.3]], qr: ['qr', 0.06, 'fs', [0.4, 1.3]],
  caution: ['caution', 0.3, 'fs', [0.6, 1.6]], hotsurf: ['hotsurf', 0.28, 'f', [0.5, 1.2]], nostep: ['nostep', 0.24, 's', [0.3, 0.9]], upright: ['upright', 0.3, 'fs', [0.3, 1.4]], coolant: ['coolant', 0.3, 'fs', [0.4, 1.5]], o2: ['o2', 0.2, 'fs', [0.4, 1.5]],
  sterile: ['sterile', 0.26, 'fs', [0.3, 1.1]], liftpt: ['liftpt', 0.24, 's', [0.15, 0.6]], power: ['power', 0.16, 'fs', [0.3, 1.2]], grounded: ['grounded', 0.28, 'fs', [0.5, 1.5]], pressure: ['pressure', 0.26, 'fs', [0.5, 1.7]], maxload: ['maxload', 0.18, 'fs', [0.2, 0.8]],
  stencil: ['st', 0.34, 'fs', [0.2, 1.4]],
};
const SETS = {
  machine: ['hazStrip', ['warn', 'volt', 'hot', 'rad'], ['caution', 'grounded', 'pressure', 'coolant'], ['plate', 'plate2'], 'tag', 'liftpt'],
  power: ['hazStrip', ['volt', 'rad'], ['caution', 'grounded'], 'plate', 'tag', 'power'],
  vessel: ['hazStrip', ['pressure', 'coolant', 'o2'], ['warn', 'fire'], 'plate', 'tag'],
  console: [['plate', 'plate2'], 'barcode', 'qr', ['power', 'grounded']],
  storage: ['stencil', 'stencil', 'barcode', ['upright', 'maxload'], 'tag'],
  crate: ['stencil', 'stencil', 'upright', 'barcode', 'hazStrip'],
  medical: [['plate2', 'plate'], 'barcode', 'med', 'sterile'],
  galley: [['plate', 'plate2'], 'barcode', ['hotsurf', 'power'], 'tag'],
  appliance: [['plate', 'plate2'], 'barcode', 'power'],
  vehicle: ['hazStrip', 'nostep', 'arrow', 'plate', 'liftpt'],
  furniture: ['barcode'],
};
const KIND_SET = {
  tank: 'vessel', buffertank: 'vessel', nutrient_tanks: 'vessel', fuelbowser: 'vehicle', hoversled: 'vehicle', shuttle: 'vehicle',
  pumpskid: 'machine', heatexch: 'machine', scrubber: 'vessel', fabricator: 'machine', lathe: 'machine', workbench: 'machine', fieldgen: 'power', fieldgen_damp: 'power', chargerack: 'power', relayrack: 'power', servers: 'power', reactorstation: 'console', warpcore: 'power',
  console: 'console', helm: 'console', baycontrol: 'console', beampedestal: 'console', secdesk: 'console', holodesk: 'console', labbench: 'console', replicator: 'console', navstation: 'console', opsstation: 'console', commsstation: 'console',
  nursestation: 'medical', biobed: 'medical', surgical_table: 'medical', exam_couch: 'medical', autopsy_table: 'medical', steriliser: 'medical', med_dispenser: 'medical',
  range: 'galley', servery: 'galley', dishwasher: 'galley', reachin_cooler: 'galley', washer: 'appliance', sinkunit: 'appliance', treadmill: 'appliance',
  crate: 'crate', shelving: 'storage', drawers: 'storage', weaponrack: 'storage', suitrack: 'storage', cart: 'storage', samplefridge: 'medical', issuecounter: 'storage',
  desk: 'furniture', table: 'furniture', bunk: 'furniture', sofa: 'furniture', weightbench: 'furniture', bar: 'furniture', cell: 'furniture',
};
const BATCH_SET = { plant: 'machine', stations1: 'console', stations2: 'console', flight: 'console', medical: 'medical', galley: 'galley', sciences: 'console', security: 'storage', polish: 'furniture' };
const NO_DECALS = new Set(['tree', 'plant', 'pad', 'holocube', 'viewscreen', 'pillar', 'lonechair', 'chair', 'taskchair', 'taskchair_plain', 'barstool', 'wastebin', 'padmark']);
export function decalSetFor(kind, batch) { if (NO_DECALS.has(kind)) return null; return KIND_SET[kind] || BATCH_SET[batch] || null; }

// ------------------------------------------------------------------ placement: software z-buffer of the prop seen from a face
const RES = 0.02;   // 2 cm cells
const FACES = {   // u = right as seen from outside, d = toward the viewer; back maps (u, v, d) -> prop frame
  f: { n: [0, 0, 1], map: (x, y, z) => [x, y, z], back: (u, v, d) => [u, v, d] },
  r: { n: [1, 0, 0], map: (x, y, z) => [-z, y, x], back: (u, v, d) => [d, v, -u] },
  l: { n: [-1, 0, 0], map: (x, y, z) => [z, y, -x], back: (u, v, d) => [-d, v, u] },
};
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _ab = new THREE.Vector3(), _ac = new THREE.Vector3();
function okMat(m) { return m && m.isMeshStandardMaterial && !m.transparent && !m.userData.screenOf && m !== decalMat && m.userData.wearU && m.userData.wearClass !== 'fabric'; }
function zbuffer(g, face) {
  const F = FACES[face], tris = [], bb = { u0: 1e9, u1: -1e9, v0: 1e9, v1: -1e9 };
  g.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), M = new THREE.Matrix4();
  g.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.name === 'decals' || !o.visible) return;
    const geo = o.geometry, pos = geo.attributes.position; if (!pos) return;
    M.multiplyMatrices(inv, o.matrixWorld); const idx = geo.index, mats = Array.isArray(o.material) ? o.material : null;
    const n = idx ? idx.count : pos.count, groups = mats ? geo.groups : [{ start: 0, count: n, materialIndex: 0 }];
    for (const gr of groups) { const mat = mats ? mats[gr.materialIndex] : o.material, ok = okMat(mat), occl = !(mat?.transparent && (mat.opacity ?? 1) < 0.5);
      if ((!ok && !occl) || (mat?.isMeshStandardMaterial && (mat.aoMap || (mat.map && !mat.map.isCanvasTexture)))) continue;   // scanned GLB parts: never decal targets, dense, skipped
      for (let i = gr.start; i < Math.min(n, gr.start + gr.count) - 2; i += 3) {
        const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
        _a.fromBufferAttribute(pos, ia).applyMatrix4(M); _b.fromBufferAttribute(pos, ib).applyMatrix4(M); _c.fromBufferAttribute(pos, ic).applyMatrix4(M);
        const nrm = _ab.subVectors(_b, _a).cross(_ac.subVectors(_c, _a)); const len = nrm.length(); if (len < 1e-9) continue; nrm.divideScalar(len);
        const facing = nrm.x * F.n[0] + nrm.y * F.n[1] + nrm.z * F.n[2];
        const A = F.map(_a.x, _a.y, _a.z), B = F.map(_b.x, _b.y, _b.z), C = F.map(_c.x, _c.y, _c.z);
        tris.push(A, B, C, ok && facing > 0.985); for (const p of [A, B, C]) { bb.u0 = Math.min(bb.u0, p[0]); bb.u1 = Math.max(bb.u1, p[0]); bb.v0 = Math.min(bb.v0, p[1]); bb.v1 = Math.max(bb.v1, p[1]); }
      } }
  });
  if (!tris.length) return null;
  const W = Math.ceil((bb.u1 - bb.u0) / RES) + 1, H = Math.ceil((bb.v1 - bb.v0) / RES) + 1, dep = new Float32Array(W * H).fill(-1e9), ok = new Uint8Array(W * H);
  for (let t = 0; t < tris.length; t += 4) {
    const A = tris[t], B = tris[t + 1], C = tris[t + 2], good = tris[t + 3];
    const area = (B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1]); if (Math.abs(area) < 1e-10) continue;
    const i0 = Math.max(0, Math.floor((Math.min(A[0], B[0], C[0]) - bb.u0) / RES)), i1 = Math.min(W - 1, Math.ceil((Math.max(A[0], B[0], C[0]) - bb.u0) / RES));
    const j0 = Math.max(0, Math.floor((Math.min(A[1], B[1], C[1]) - bb.v0) / RES)), j1 = Math.min(H - 1, Math.ceil((Math.max(A[1], B[1], C[1]) - bb.v0) / RES));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const u = bb.u0 + i * RES, v = bb.v0 + j * RES;
      const w0 = ((B[0] - u) * (C[1] - v) - (C[0] - u) * (B[1] - v)) / area, w1 = ((C[0] - u) * (A[1] - v) - (A[0] - u) * (C[1] - v)) / area, w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      const d = w0 * A[2] + w1 * B[2] + w2 * C[2], k = j * W + i;
      if (d > dep[k] + 1e-5) { dep[k] = d; ok[k] = good ? 1 : 0; } else if (Math.abs(d - dep[k]) <= 1e-5 && !good) ok[k] = 0;
    }
  }
  return { face, W, H, u0: bb.u0, v0: bb.v0, dep, ok, used: new Uint8Array(W * H) };
}
// a w x h rect centred at cell (ci, cj): every cell flat-facing, at one depth (+-4 mm), not used yet -> depth, else null
function fits(Z, ci, cj, wc, hc) {
  const i0 = ci - (wc >> 1), j0 = cj - (hc >> 1); if (i0 < 0 || j0 < 0 || i0 + wc >= Z.W || j0 + hc >= Z.H) return null;
  const d0 = Z.dep[cj * Z.W + ci]; let dm = d0;
  for (let j = j0; j <= j0 + hc; j++) for (let i = i0; i <= i0 + wc; i++) { const k = j * Z.W + i; if (!Z.ok[k] || Z.used[k] || Math.abs(Z.dep[k] - d0) > 0.004) return null; dm = Math.max(dm, Z.dep[k]); }
  return dm;
}
function claim(Z, ci, cj, wc, hc, pad = 2) { for (let j = Math.max(0, cj - (hc >> 1) - pad); j <= Math.min(Z.H - 1, cj - (hc >> 1) + hc + pad); j++) for (let i = Math.max(0, ci - (wc >> 1) - pad); i <= Math.min(Z.W - 1, ci - (wc >> 1) + wc + pad); i++) Z.used[j * Z.W + i] = 1; }

function quad(out, Z, cu, cv, d, w, h, cell, u0 = 0, u1 = 1) {   // one decal quad in the prop frame (atlas sub-rect u0..u1 of the cell)
  const F = FACES[Z.face], [x, y, cw, ch] = CELL[cell], e = 0.0025;
  const U0 = (x + u0 * cw) / 1024, U1 = (x + u1 * cw) / 1024, V0 = 1 - (y + ch) / 1024, V1 = 1 - y / 1024;
  const P = (du, dv) => F.back(cu + du, cv + dv, d + e);
  const c = [[P(-w / 2, -h / 2), U0, V0], [P(w / 2, -h / 2), U1, V0], [P(w / 2, h / 2), U1, V1], [P(-w / 2, h / 2), U0, V1]];
  for (const k of [0, 1, 2, 0, 2, 3]) { const [p, u, v] = c[k]; out.pos.push(p[0], p[1], p[2]); out.nrm.push(...F.n); out.uv.push(u, v); }
}
function placeItem(out, Zs, it, R) {
  const [cell0, w, faces, [y0, y1]] = it, cell = cell0 === 'st' ? 'st' + Math.floor(R() * 4) : cell0, [, , cw, ch] = CELL[cell], h = w * ch / cw;
  const wc = Math.ceil(w / RES), hc = Math.ceil(h / RES), cands = [];
  for (const Z of Zs) { if (!Z || !faces.includes(Z.face === 'f' ? 'f' : 's')) continue;
    for (let j = 0; j < Z.H; j += 2) { const v = Z.v0 + j * RES; if (v - h / 2 < y0 || v + h / 2 > y1) continue; for (let i = 0; i < Z.W; i += 2) cands.push([Z, i, j]); } }
  for (let n = cands.length - 1; n > 0; n--) { const k = Math.floor(R() * (n + 1)); [cands[n], cands[k]] = [cands[k], cands[n]]; }
  for (const [Z, i, j] of cands.slice(0, 600)) { const d = fits(Z, i, j, wc, hc); if (d === null) continue;
    claim(Z, i, j, wc, hc); quad(out, Z, Z.u0 + i * RES, Z.v0 + j * RES, d, w, h, cell); return true; }
  return false;
}
function placeStrip(out, Zs, it) {   // the longest flat run on the front (else a side) at base height: hazard stripe tape in tiling segments
  const { strip, h, v: [y0, y1] } = it, hc = Math.ceil(h / RES); let best = null;
  for (const Z of Zs) { if (!Z) continue;
    for (let j = 0; j < Z.H; j++) { const v = Z.v0 + j * RES; if (v - h / 2 < y0 || v + h / 2 > y1) continue;
      let run = 0, d0 = 0; for (let i = 0; i <= Z.W; i++) { const col = i < Z.W ? colOk(Z, i, j, hc) : null;
        if (col !== null && run && Math.abs(col - d0) <= 0.004) run++; else { if (run >= 20 && (!best || run > best.run * (Z.face === 'f' ? 0.8 : 1.25))) best = { Z, j, i0: i - run, run, d: d0 }; run = col !== null ? 1 : 0; d0 = col ?? 0; } } } }
  if (!best) return false;
  const { Z, j, i0, run, d } = best, len = (run - 3) * RES, cu = Z.u0 + (i0 + run / 2) * RES, cv = Z.v0 + j * RES, seg = h * 8;   // cell is 8:1
  claim(Z, i0 + (run >> 1), j, run, hc, 1);
  for (let s = -len / 2; s < len / 2 - 1e-4; s += seg) { const sl = Math.min(seg, len / 2 - s); quad(out, Z, cu + s + sl / 2, cv, d, sl, h, strip, 0, sl / seg); }
  return true;
}
function colOk(Z, i, j, hc) { const j0 = j - (hc >> 1); if (j0 < 0 || j0 + hc >= Z.H) return null; const d0 = Z.dep[j * Z.W + i]; for (let jj = j0; jj <= j0 + hc; jj++) { const k = jj * Z.W + i; if (!Z.ok[k] || Z.used[k] || Math.abs(Z.dep[k] - d0) > 0.004) return null; } return d0; }

const DECAL_CACHE = new Map();   // kind -> BufferGeometry (prop frame) | null, for kinds whose build is deterministic
export const RANDOM_KINDS = new Set(['crate', 'shelving', 'tree', 'plant']);
export function buildDecals(g, kind, set) {
  const R = prng(hash(kind + '|decals')), Zs = [zbuffer(g, 'f'), zbuffer(g, 'r'), zbuffer(g, 'l')], out = { pos: [], nrm: [], uv: [] };
  if (!Zs.some(Boolean)) return null;
  for (const name of SETS[set]) { const pick = Array.isArray(name) ? name[Math.floor(R() * name.length)] : name, it = D[pick]; if (!it) continue;
    if (it.strip) placeStrip(out, Zs, it); else placeItem(out, Zs, it, R); }
  if (!out.pos.length) return null;
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(out.nrm, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
  geo.computeBoundingSphere(); return geo;
}

// ------------------------------------------------------------------ the one entry point
export function surfaceProp(g, kind, { decals = true, batch } = {}) {
  if (!g) return g;
  const keep = new Set(); const scan = (v) => { if (!v || typeof v !== 'object') return; if (v.isMaterial) keep.add(v); else if (Array.isArray(v)) v.forEach(scan); };
  for (const v of Object.values(g.userData)) scan(v);
  g.traverse(o => { if (!o.isMesh || o.isSkinnedMesh) return;
    const sw = (m) => keep.has(m) ? m : m?.isMeshBasicMaterial ? screenMaterial(m) : wearMaterial(m);
    o.material = Array.isArray(o.material) ? o.material.map(sw) : sw(o.material); });
  if (!decals || typeof document === 'undefined') return g;
  const set = decalSetFor(kind, batch); if (!set) return g;
  let geo = DECAL_CACHE.get(kind);
  if (geo === undefined) { geo = buildDecals(g, kind, set); if (!RANDOM_KINDS.has(kind)) DECAL_CACHE.set(kind, geo); }
  if (geo) { const m = new THREE.Mesh(geo, decalMaterial()); m.name = 'decals'; m.userData.noShadow = true; m.castShadow = false; m.receiveShadow = true; g.add(m); }
  return g;
}
