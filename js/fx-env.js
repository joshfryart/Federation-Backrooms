// Environment effects (original work, no assets): windows onto space with a parallax starfield, planet and sun, the animated
// bridge viewscreen, and pooled mist / smoke particles for coolant leaks and alert smoke.
//   spaceMat(seed)   -> ShaderMaterial for instanced window panes (world-space view ray, so the sky holds still as you walk by)
//   screenMat(seed)  -> ShaderMaterial for the bridge viewscreen (orbit view <-> warp streaks, tactical overlay, red border on alert)
//   envTick(t, alertAmt) -> advance every live material's clock (called from World.update)
//   EnvFx            -> pooled coolant-leak mist + alert smoke (glue in js/main.js)
import * as THREE from 'three';
import { Particles } from './fx.js';

const live = new Set();   // materials built for the current deck(s); disposed ones drop out via envTick's dispose hook

const COMMON = /* glsl */`
float h11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 h33(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
float vnoise(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
// one layer of point stars: the direction (plus a tiny camera-driven offset = parallax) lands in a cell; some cells hold a star
vec3 starLayer(vec3 d, vec3 cam, float N, float par, float dens, float t) {
  vec3 q = (d + cam * par) * N, c = floor(q), f = q - c; vec3 col = vec3(0.0);
  vec3 r = h33(c); if (r.x > dens) return col;
  vec3 sp = 0.2 + 0.6 * h33(c + 7.1); float dd = length(f - sp);
  float b = smoothstep(0.17, 0.0, dd) * (0.35 + 0.65 * r.y) * (0.75 + 0.25 * sin(t * (1.0 + r.z * 3.0) + r.z * 40.0));
  vec3 tint = mix(vec3(1.0, 0.82, 0.62), vec3(0.65, 0.8, 1.0), r.z);
  return tint * b * (1.0 + 2.5 * step(0.985, r.y));
}
// the sky seen along ray d from camera position cam
vec3 sky(vec3 d, vec3 cam, float t) {
  float ct = cos(t * 0.004), st = sin(t * 0.004); d = vec3(ct * d.x + st * d.z, d.y, -st * d.x + ct * d.z);   // the ship slowly turns
  vec3 col = vec3(0.004, 0.006, 0.014);
  float neb = fbm(d * 2.2 + uSeed); col += mix(vec3(0.05, 0.02, 0.09), vec3(0.01, 0.06, 0.1), vnoise(d * 1.3 + uSeed * 3.1)) * smoothstep(0.45, 0.85, neb) * 0.55;
  col += starLayer(d, cam, 42.0, 0.0010, 0.55, t) * 0.55 + starLayer(d, cam, 95.0, 0.0030, 0.5, t) * 0.8 + starLayer(d, cam, 190.0, 0.0090, 0.34, t) * 1.2;
  // sun: small glaring disc and halo
  float sd = max(0.0, dot(d, uSun)); col += vec3(1.0, 0.92, 0.75) * (smoothstep(0.9993, 0.9998, sd) * 14.0 + pow(sd, 90.0) * 0.5 + pow(sd, 12.0) * 0.05);
  // planet: ray-sphere from the camera, so walking along a window shifts it against the stars
  vec3 oc = cam - uPlanet.xyz; float R = uPlanet.w, b = dot(oc, d), cc = dot(oc, oc) - R * R, disc = b * b - cc;
  if (disc > 0.0) {
    float tt = -b - sqrt(disc);
    if (tt > 0.0) {
      vec3 p = cam + d * tt, n = normalize(p - uPlanet.xyz); float lat = n.y;
      float band = 0.5 + 0.5 * sin(lat * (6.0 + 8.0 * h11(uSeed)) + fbm(n * 3.0 + uSeed) * 2.6);
      float land = smoothstep(0.5, 0.58, fbm(n * 2.6 + uSeed * 5.0));
      vec3 base = mix(uPlanetA, uPlanetB, uGas > 0.5 ? band : land);
      base = mix(base, vec3(0.92, 0.95, 1.0), smoothstep(0.55, 0.8, fbm(n * 5.0 + t * 0.01 + 3.0)) * 0.55 * (uGas > 0.5 ? 0.25 : 1.0) + smoothstep(0.82, 0.96, abs(lat)) * 0.7);
      float lit = max(0.0, dot(n, uSun)); float rim = pow(1.0 - max(0.0, dot(n, -d)), 3.0);
      col = base * (0.02 + lit * 1.05) + uAtmo * rim * (0.15 + lit * 0.9);
    }
  }
  // thin atmosphere halo just outside the limb
  { float miss = length(oc - d * b) - R; if (miss > 0.0 && b < 0.0) col += uAtmo * exp(-miss / (R * 0.025)) * 0.5 * (0.2 + 0.8 * max(0.0, dot(normalize(oc - d * b), uSun) * -1.0 + 0.4)); }
  return col;
}`;

const UNIFORMS_DECL = 'uniform float uTime, uSeed, uGas, uAlert, uWarp; uniform vec3 uSun, uPlanetA, uPlanetB, uAtmo; uniform vec4 uPlanet;';

const WIN_V = /* glsl */`
varying vec3 vW;
void main() {
  vec4 wp = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  wp = modelMatrix * wp; vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const WIN_F = `${UNIFORMS_DECL}\nvarying vec3 vW;\n${COMMON}
void main() {
  vec3 d = normalize(vW - cameraPosition);
  vec3 col = sky(d, cameraPosition, uTime);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SCR_V = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SCR_F = `${UNIFORMS_DECL}\nvarying vec2 vUv;\n${COMMON}
float box(vec2 p, vec2 a, vec2 b) { vec2 s = step(a, p) * step(p, b); return s.x * s.y; }
void main() {
  vec2 p = (vUv - 0.5) * vec2(1.69, 1.0);   // screen is ~2.3 x 1.36 m
  float t = uTime;
  vec3 col;
  // orbit view: gentle pan over the sky; warp view: stars streak out of the centre
  vec3 d = normalize(vec3(p.x * 1.1 + sin(t * 0.05) * 0.25, p.y * 1.1 + 0.05, -1.0));
  vec3 orbit = sky(d, vec3(0.0), t * 2.0);
  vec3 warp = vec3(0.01, 0.015, 0.05);
  { vec2 q = p; float r = length(q) + 1e-3, a = atan(q.y, q.x);
    for (int i = 0; i < 3; i++) { float fi = float(i), n = 60.0 + fi * 40.0, cell = floor(a / 6.2832 * n), rnd = h11(cell + fi * 91.7);
      float z = fract(t * (0.35 + 0.25 * fi) + rnd), rr = z * z * 0.9, len = 0.03 + z * 0.35;
      float on = smoothstep(0.0, 0.02, r - rr) * smoothstep(len, 0.0, r - rr) * step(0.0, r - rr);
      float ang = fract(a / 6.2832 * n) - 0.5; warp += mix(vec3(0.6, 0.75, 1.0), vec3(1.0), rnd) * on * smoothstep(0.1, 0.0, abs(ang)) * (0.4 + z) * 1.6; } }
  col = mix(orbit, warp, uWarp);
  // tactical overlay: faint grid, corner brackets, blinking contact boxes, scanlines
  vec2 g = abs(fract(vUv * vec2(16.0, 9.0)) - 0.5); float grid = step(0.485, max(g.x, g.y)) * 0.05;
  vec2 e = min(vUv, 1.0 - vUv); float br = step(e.x, 0.012) * step(e.y, 0.06) + step(e.y, 0.012) * step(e.x, 0.06);
  float blink = step(0.5, fract(t * 0.7)); vec2 c1 = vec2(0.66 + 0.02 * sin(t * 0.3), 0.58); float bx = box(vUv, c1 - 0.035, c1 + 0.035) - box(vUv, c1 - 0.03, c1 + 0.03);
  vec3 hud = vec3(0.35, 0.95, 1.0);
  col += hud * (grid + br * 0.6 + bx * 0.7 * blink);
  float txt = 0.0; for (int i = 0; i < 4; i++) { float fi = float(i); txt += box(vUv, vec2(0.04, 0.9 - fi * 0.045), vec2(0.04 + 0.05 + 0.1 * h11(fi * 3.3 + floor(t * 0.4)), 0.9 - fi * 0.045 + 0.018)); }
  col += hud * txt * 0.55;
  col *= 0.88 + 0.12 * sin(vUv.y * 340.0 + t * 3.0) + 0.02 * h13(vec3(vUv * 400.0, floor(t * 20.0)));
  col *= 1.0 - 0.35 * length(vUv - 0.5);
  float ring = smoothstep(0.03, 0.0, min(e.x, e.y)); col = mix(col, vec3(1.0, 0.08, 0.05) * (0.6 + 0.6 * sin(t * 6.0)), ring * uAlert);
  col += vec3(0.25, 0.02, 0.01) * uAlert * 0.25;
  gl_FragColor = vec4(col * 1.15, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

// per-deck sky: seed picks the planet (rocky / gas giant), its tint, the sun direction and where the planet sits
function skyUniforms(seed) {
  const gas = hash(seed + 1) < 0.45, ang = hash(seed + 2) * Math.PI * 2, el = (hash(seed + 3) - 0.35) * 0.9;
  const dir = new THREE.Vector3(Math.cos(ang) * Math.cos(el), Math.sin(el), Math.sin(ang) * Math.cos(el));
  const R = 700 + hash(seed + 4) * 500, dist = R * (1.55 + hash(seed + 5) * 0.8);
  const hue = hash(seed + 6);
  const A = gas ? new THREE.Color().setHSL(0.06 + hue * 0.1, 0.55, 0.42) : new THREE.Color().setHSL(0.55 + hue * 0.1, 0.5, 0.2);
  const B = gas ? new THREE.Color().setHSL(0.02 + hue * 0.08, 0.35, 0.6) : new THREE.Color().setHSL(0.08 + hue * 0.12, 0.35, 0.3);
  const sa = hash(seed + 7) * Math.PI * 2, sun = new THREE.Vector3(Math.cos(sa) * 0.8, 0.25 + hash(seed + 8) * 0.4, Math.sin(sa) * 0.8).normalize();
  return {
    uTime: { value: 0 }, uSeed: { value: seed % 97 * 0.37 }, uGas: { value: gas ? 1 : 0 }, uAlert: { value: 0 }, uWarp: { value: 0 },
    uSun: { value: sun }, uPlanetA: { value: new THREE.Vector3(A.r, A.g, A.b) }, uPlanetB: { value: new THREE.Vector3(B.r, B.g, B.b) },
    uAtmo: { value: gas ? new THREE.Vector3(0.9, 0.6, 0.35) : new THREE.Vector3(0.25, 0.5, 1.0) },
    uPlanet: { value: new THREE.Vector4(dir.x * dist, dir.y * dist, dir.z * dist, R) },
  };
}

function mk(vs, fs, seed, extra) {
  const m = new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms: skyUniforms(seed), side: THREE.DoubleSide, fog: false, ...extra });
  m.userData.env = true; live.add(m); m.addEventListener('dispose', () => live.delete(m)); return m;
}
export function spaceMat(seed = 1) { return mk(WIN_V, WIN_F, seed); }
export function screenMat(seed = 1) { const m = mk(SCR_V, SCR_F, seed); m.userData.screen = true; return m; }

// advance clocks; the viewscreen alternates between orbit and warp (45 s each, eased)
export function envTick(t, alertAmt = 0) {
  const target = (t % 90) < 45 ? 0 : 1;
  for (const m of live) {
    const u = m.uniforms; u.uTime.value = t; u.uAlert.value = alertAmt;
    if (m.userData.screen) u.uWarp.value += (target - u.uWarp.value) * 0.03;
  }
}
export function envLive() { return live.size; }

// ---------------------------------------------------------------------------------------------------------------------
// Pooled mist / smoke. Two Particles pools (160 + 120 points) for the whole game, nothing allocated per frame.
// ---------------------------------------------------------------------------------------------------------------------
const MIST = new THREE.Color(0xbfe6f2), MIST2 = new THREE.Color(0x8fd0e8), SMOKE = new THREE.Color(0x3a3836), SMOKE2 = new THREE.Color(0x55524e);
export class EnvFx {
  constructor(scene) {
    this.mist = new Particles(scene, 160, { size: 0.34, opacity: 0.13, gravity: -0.25, drag: 0.9 });
    this.smoke = new Particles(scene, 120, { size: 0.9, opacity: 0.1, gravity: -0.12, drag: 0.7 });
    this.leaks = []; this.smokers = []; this.t = 0; this.alertAmt = 0;
  }
  clear() { this.mist.clear(); this.smoke.clear(); this.leaks = []; this.smokers = []; }
  // choose leak points on plain wall faces (never on windows / signs / fixtures) and smoke sources (burnt panels + ceiling vents)
  setDeck(world) {
    this.clear();
    const faces = world.wallFaces.filter(f => !f.deco && !f.win && !f.sign), rnd = (() => { let a = (world.d.deck * 2654435761 + 12345) | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
    const pool = faces.filter(f => f.room === 'engineering' || f.room === 'cargo' || f.room === 'workshop' || f.room === 'plant' || !f.room);
    for (let i = 0; i < Math.min(7, pool.length); i++) {
      const f = pool[Math.floor(rnd() * pool.length)];
      this.leaks.push({ x: f.px + f.dx * 0.1, z: f.pz + f.dy * 0.1, y: 0.35 + rnd() * 1.5, dx: f.dx, dz: f.dy, ph: rnd() * 20, per: 7 + rnd() * 9, on: 3 + rnd() * 3, t: 0 });
    }
    for (const s of world.sparkers || []) this.smokers.push({ x: s.x, z: s.z, y: 1.3, t: 0 });
    for (const f of faces.filter(() => rnd() < 0.05).slice(0, 8)) this.smokers.push({ x: f.px + f.dx * 0.3, z: f.pz + f.dy * 0.3, y: 0.9, t: 0 });
  }
  // call every frame with the listener position, world.alertAmt (0..1), and a callback (x, z, d) for leak hiss events
  update(dt, px, pz, alertAmt = 0, onHiss = null) {
    this.t += dt; this.alertAmt = alertAmt;
    for (const L of this.leaks) {
      const d = Math.hypot(L.x - px, L.z - pz); if (d > 22) continue;
      const cyc = (this.t + L.ph) % L.per, on = cyc < L.on, edge = on ? Math.min(1, cyc * 2, (L.on - cyc) * 2) : 0;
      if (on && edge > 0) { L.t -= dt; if (L.t <= 0) { L.t = 0.045 / Math.max(0.3, edge); const sp = 1.6 + Math.random() * 1.4, j = () => (Math.random() - 0.5) * 0.5;
        this.mist.add(L.x, L.y, L.z, L.dx * sp + j(), 0.2 + j() * 0.6, L.dz * sp + j(), Math.random() < 0.5 ? MIST : MIST2, 1.1 + Math.random() * 0.9); } }
      if (on && !L.hiss) { L.hiss = true; onHiss?.(L.x, L.z, d); } else if (!on) L.hiss = false;
    }
    if (alertAmt > 0.35) for (const S of this.smokers) {
      const d = Math.hypot(S.x - px, S.z - pz); if (d > 20) continue;
      S.t -= dt; if (S.t <= 0) { S.t = (0.16 + Math.random() * 0.12) / alertAmt; this.smoke.add(S.x + (Math.random() - 0.5) * 0.3, S.y, S.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.35, 0.45 + Math.random() * 0.4, (Math.random() - 0.5) * 0.35, Math.random() < 0.5 ? SMOKE : SMOKE2, 3.2 + Math.random() * 2.2); }
    }
    this.mist.update(dt); this.smoke.update(dt);
  }
}
