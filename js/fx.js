import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import 'three/addons/postprocessing/ShaderPass.js';   // not used here: preloaded so js/talk.js's dynamic import of it (the talk depth-of-field pass) resolves from the module cache at boot, as before

// ---------------------------------------------------------------
// Post-processing (High quality). The chain is:
//   RenderPass (world, MSAA HalfFloat) -> [GTAO, opt-in] -> RenderPass (viewmodel) -> GameBloomPass -> [talk depth of field, js/talk.js] -> FinalPass (to the canvas)
// GameBloomPass is UnrealBloomPass with the highlight compression folded into its bright-pass and WITHOUT its last step (the additive copy of the
// bloom back over the scene buffer): it leaves the bloom in bloomTexture. FinalPass does in ONE full-screen pass what used to be three
// (CompressShader pass + FinalShader pass + OutputPass): highlight compression, bloom add, chromatic aberration, sharpening when the dynamic
// resolution scale is < 1, film grain, hurt / danger, the colour grade (per ship / per room table, GRADES below), S-curve, vignette, scanline,
// AgX tone mapping (the renderer's toneMapping, as OutputPass did), sRGB encode and a triangular dither. Net -3 full-screen passes a frame.
// ---------------------------------------------------------------
const COMP_GLSL = 'vec3 comp(vec3 x){ return mix(x, 1.6 + log2(max(x, vec3(1.6)) / 1.6) * 0.45, step(vec3(1.6), x)); }';   // soft highlight compression so a torch pressed against a wall can't send the bloom into orbit

// ---------------------------------------------------------------- colour grade table (pure data; node-testable)
// A grade = { lift: [r,g,b] shadow tint, gain: [r,g,b] highlight tint, sat, contrast (S-curve mix), expo (linear multiplier) }.
// BASE is the look the game always had (FinalShader split tone + S-curve). A ship layer (by hull class, js/ships.js CLASSES) and a room layer
// (by room type, js/gen.js) stack on top: tints and sat / expo multiply, contrast adds. Keep the deltas small: lights and materials carry the look,
// the grade only nudges it.
export const GRADE_BASE = Object.freeze({ lift: [0.9, 0.98, 1.1], gain: [1.07, 1.02, 0.9], sat: 1, contrast: 0.28, expo: 1 });
export const GRADES = {
  ship: {   // hull classes
    cairn: { gain: [1.02, 1.0, 0.97] },                                      // the old warm workhorses
    longhouse: { lift: [0.97, 1.0, 1.04], gain: [0.99, 1.0, 1.02], sat: 0.96 },   // long, cool, clinical
    cruller: { gain: [1.02, 1.01, 0.98], contrast: 0.03 },
    tandem: { lift: [1.02, 0.99, 0.98], sat: 0.95, contrast: 0.04 },          // grimy twin hulls
    plough: { lift: [0.98, 1.01, 1.02], sat: 1.03 },
  },
  room: {   // room types (the room the player stands in; corridors use the ship layer alone)
    bridge: { lift: [0.96, 0.99, 1.06], gain: [1.01, 1.0, 0.99], contrast: 0.04, sat: 1.04 },
    readyroom: { gain: [1.03, 1.0, 0.96] },
    engineering: { lift: [0.95, 1.0, 1.07], gain: [1.04, 1.0, 0.94], contrast: 0.06, sat: 1.05 },
    plant: { lift: [0.96, 1.0, 1.05], gain: [1.05, 1.0, 0.93], contrast: 0.06 },
    workshop: { gain: [1.03, 1.0, 0.95], contrast: 0.03 },
    sickbay: { lift: [0.98, 1.01, 1.03], gain: [0.98, 1.01, 1.03], sat: 0.9, expo: 1.03 },
    morgue: { lift: [0.96, 1.0, 1.06], gain: [0.97, 1.0, 1.04], sat: 0.75 },
    lab: { lift: [0.98, 1.0, 1.03], gain: [0.99, 1.01, 1.02], sat: 0.94 },
    arboretum: { lift: [0.98, 1.03, 0.98], gain: [1.02, 1.03, 0.95], sat: 1.08 },
    holodeck: { sat: 1.06, contrast: -0.04, expo: 1.02 },
    mess: { gain: [1.04, 1.01, 0.95], sat: 1.04 },
    lounge: { gain: [1.05, 1.01, 0.93], sat: 1.03, contrast: -0.02 },
    quarters: { gain: [1.04, 1.01, 0.95], contrast: -0.03 },
    brig: { lift: [0.96, 1.0, 1.05], sat: 0.85, contrast: 0.05 },
    armory: { lift: [0.97, 1.0, 1.04], sat: 0.9, contrast: 0.05 },
    cargo: { sat: 0.93, contrast: 0.04 },
    stores: { sat: 0.94, contrast: 0.03 },
    shuttlebay: { lift: [0.97, 1.0, 1.04], sat: 0.95 },
    datacore: { lift: [0.95, 1.0, 1.08], gain: [0.98, 1.0, 1.03], contrast: 0.05 },
    jefferies: { gain: [1.05, 1.0, 0.92], contrast: 0.06, sat: 0.95 },
    lift: {},
  },
  madness: { lift: [1.0, 0.97, 1.03], sat: 0.85, contrast: 0.06 },   // the roguelike mode (index.html?mode=madness): drained and harsher
};
const v3mul = (a, b) => b ? [a[0] * b[0], a[1] * b[1], a[2] * b[2]] : a;
/** stack grade layers (partials) over BASE: tints / sat / expo multiply, contrast adds */
export function stackGrade(...layers) {
  const g = { lift: [...GRADE_BASE.lift], gain: [...GRADE_BASE.gain], sat: GRADE_BASE.sat, contrast: GRADE_BASE.contrast, expo: GRADE_BASE.expo };
  for (const L of layers) { if (!L) continue; g.lift = v3mul(g.lift, L.lift); g.gain = v3mul(g.gain, L.gain); g.sat *= L.sat ?? 1; g.contrast += L.contrast ?? 0; g.expo *= L.expo ?? 1; }
  return g;
}
/** the grade for a ship (object with .hull, or a hull key) and a room type (or null: corridor); o.mode 'madness' adds that layer */
export function gradeFor(ship, roomType = null, o = {}) {
  const hull = typeof ship === 'string' ? ship : ship?.hull;
  return stackGrade(GRADES.ship[hull], roomType ? GRADES.room[roomType] : null, o.mode === 'madness' ? GRADES.madness : null);
}
/** blend grade a towards b by k (0..1) into out */
export function lerpGrade(a, b, k, out = {}) {
  const L = (x, y) => x + (y - x) * k; out.lift = [0, 1, 2].map(i => L(a.lift[i], b.lift[i])); out.gain = [0, 1, 2].map(i => L(a.gain[i], b.gain[i]));
  out.sat = L(a.sat, b.sat); out.contrast = L(a.contrast, b.contrast); out.expo = L(a.expo, b.expo); return out;
}
/** sharpen amount for a dynamic-resolution scale k (js/perfgov.js): 0 at native, up to 0.55 at half resolution */
export const sharpenFor = (k) => Math.max(0, Math.min(0.55, (1 - k) * 1.1));

// ---------------------------------------------------------------- bloom: compression in the bright-pass, no blend-back pass
const HIGHPASS_FRAG = `uniform sampler2D tDiffuse; uniform vec3 defaultColor; uniform float defaultOpacity, luminosityThreshold, smoothWidth; varying vec2 vUv;
  ${COMP_GLSL}
  void main(){ vec4 texel = texture2D(tDiffuse, vUv); texel.rgb = comp(clamp(texel.rgb, 0.0, 1000.0)); float v = luminance(texel.rgb);
    gl_FragColor = mix(vec4(defaultColor.rgb, defaultOpacity), texel, smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, v)); }`;
export class GameBloomPass extends UnrealBloomPass {
  constructor(...a) { super(...a); this.materialHighPassFilter.fragmentShader = HIGHPASS_FRAG; this.materialHighPassFilter.needsUpdate = true; }
  get bloomTexture() { return this.renderTargetsHorizontal[0].texture; }
  render(renderer, writeBuffer, readBuffer) {   // UnrealBloomPass.render minus the renderToScreen copy and the final additive blend (FinalPass adds bloomTexture)
    const q = this._fsQuad, oldAuto = renderer.autoClear; renderer.getClearColor(this._oldClearColor); this._oldClearAlpha = renderer.getClearAlpha();
    renderer.autoClear = false; renderer.setClearColor(this.clearColor, 0);
    this.highPassUniforms.tDiffuse.value = readBuffer.texture; this.highPassUniforms.luminosityThreshold.value = this.threshold;
    q.material = this.materialHighPassFilter; renderer.setRenderTarget(this.renderTargetBright); renderer.clear(); q.render(renderer);
    let input = this.renderTargetBright;
    for (let i = 0; i < this.nMips; i++) {
      const m = this.separableBlurMaterials[i]; q.material = m;
      m.uniforms.colorTexture.value = input.texture; m.uniforms.direction.value = UnrealBloomPass.BlurDirectionX; renderer.setRenderTarget(this.renderTargetsHorizontal[i]); renderer.clear(); q.render(renderer);
      m.uniforms.colorTexture.value = this.renderTargetsHorizontal[i].texture; m.uniforms.direction.value = UnrealBloomPass.BlurDirectionY; renderer.setRenderTarget(this.renderTargetsVertical[i]); renderer.clear(); q.render(renderer);
      input = this.renderTargetsVertical[i];
    }
    const c = this.compositeMaterial; q.material = c; c.uniforms.bloomStrength.value = this.strength; c.uniforms.bloomRadius.value = this.radius; c.uniforms.bloomTintColors.value = this.bloomTintColors;
    renderer.setRenderTarget(this.renderTargetsHorizontal[0]); renderer.clear(); q.render(renderer);
    renderer.setClearColor(this._oldClearColor, this._oldClearAlpha); renderer.autoClear = oldAuto;
  }
}

// ---------------------------------------------------------------- the merged final pass
const FINAL_VERT = `precision highp float; uniform mat4 modelViewMatrix, projectionMatrix; attribute vec3 position; attribute vec2 uv; varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FINAL_FRAG = `precision highp float;
  uniform sampler2D tDiffuse, tBloom; uniform float time, danger, hurt, calm, bloomOn, sharpen, dither; uniform vec2 res, texel;
  uniform vec3 gLift, gGain; uniform float gSat, gContrast, gExpo;
  #include <tonemapping_pars_fragment>
  #include <colorspace_pars_fragment>
  varying vec2 vUv;
  float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
  ${COMP_GLSL}
  vec3 src(vec2 uv){ return comp(clamp(texture2D(tDiffuse, uv).rgb, 0.0, 1000.0)); }
  void main(){
    vec2 d = vUv - 0.5; float r2 = dot(d,d);
    vec2 ca = d * (0.0006 + r2 * 0.007 + danger * 0.006 + hurt * 0.02) * (1.0 - calm * 0.8);
    float wob = sin(vUv.y * 40.0 + time * 1.7) * 0.0004 * (1.0 + danger * 2.0) * (1.0 - calm);
    vec2 uv = vUv + vec2(wob, 0.0);
    vec3 m = src(uv), c = vec3(src(uv + ca).r, m.g, src(uv - ca).b);
    if (sharpen > 0.001) {   // dynamic resolution below native: 4-tap unsharp mask, clamped to the local min / max (no halos round lamps)
      vec3 a = src(uv + vec2(texel.x, 0.0)), b = src(uv - vec2(texel.x, 0.0)), e = src(uv + vec2(0.0, texel.y)), f = src(uv - vec2(0.0, texel.y));
      vec3 mn = min(min(min(a, b), min(e, f)), m), mx = max(max(max(a, b), max(e, f)), m);
      c = clamp(c + (c - (a + b + e + f) * 0.25) * sharpen * 2.0, mn, mx);
    }
    c += texture2D(tBloom, vUv).rgb * bloomOn;
    float g = rnd(vUv * res + fract(time) * 100.0) - 0.5;
    c += g * 0.013 * (1.0 - calm);
    float l = dot(c, vec3(0.299,0.587,0.114));
    c = mix(c, vec3(l), hurt * 0.5 + danger * 0.15);
    c = mix(vec3(dot(c, vec3(0.299,0.587,0.114))), c, gSat) * gExpo;
    float lg = dot(c, vec3(0.299,0.587,0.114));
    c = mix(c * gLift, c * gGain, smoothstep(0.08, 0.6, lg));
    vec3 cc = clamp(c, 0.0, 1.0); c = mix(c, cc * cc * (3.0 - 2.0 * cc) + (c - cc), gContrast); c = c * 0.97 + 0.006;   // S-curve on the LDR part only (values are still HDR here)
    c *= 1.0 - smoothstep(0.25, 0.95, r2 * 2.6) * (0.55 + danger * 0.3);
    c.r += danger * 0.08 * (1.0 - r2 * 2.0) + hurt * 0.25;
    c *= 1.0 - 0.012 * (1.0 - calm) * sin(vUv.y * res.y * 1.3);
    gl_FragColor = vec4(max(c, 0.0), 1.0);
    #ifdef LINEAR_TONE_MAPPING
      gl_FragColor.rgb = LinearToneMapping(gl_FragColor.rgb);
    #elif defined( REINHARD_TONE_MAPPING )
      gl_FragColor.rgb = ReinhardToneMapping(gl_FragColor.rgb);
    #elif defined( CINEON_TONE_MAPPING )
      gl_FragColor.rgb = CineonToneMapping(gl_FragColor.rgb);
    #elif defined( ACES_FILMIC_TONE_MAPPING )
      gl_FragColor.rgb = ACESFilmicToneMapping(gl_FragColor.rgb);
    #elif defined( AGX_TONE_MAPPING )
      gl_FragColor.rgb = AgXToneMapping(gl_FragColor.rgb);
    #elif defined( NEUTRAL_TONE_MAPPING )
      gl_FragColor.rgb = NeutralToneMapping(gl_FragColor.rgb);
    #endif
    #ifdef SRGB_TRANSFER
      gl_FragColor = sRGBTransferOETF(gl_FragColor);
    #endif
    // triangular dither (+-1 LSB of an 8-bit target) against banding in the dark gradients (fog, vignette, smoke); static in Calm mode
    vec2 q = gl_FragCoord.xy + fract(time * 7.0) * 61.0 * (1.0 - calm);
    gl_FragColor.rgb += (rnd(q) + rnd(q + 17.31) - 1.0) * dither;
  }`;
const TM_DEFINE = { [THREE.LinearToneMapping]: 'LINEAR_TONE_MAPPING', [THREE.ReinhardToneMapping]: 'REINHARD_TONE_MAPPING', [THREE.CineonToneMapping]: 'CINEON_TONE_MAPPING', [THREE.ACESFilmicToneMapping]: 'ACES_FILMIC_TONE_MAPPING', [THREE.AgXToneMapping]: 'AGX_TONE_MAPPING', [THREE.NeutralToneMapping]: 'NEUTRAL_TONE_MAPPING' };
export class FinalPass extends Pass {
  constructor() {
    super();
    this.uniforms = { tDiffuse: { value: null }, tBloom: { value: null }, bloomOn: { value: 1 }, time: { value: 0 }, danger: { value: 0 }, hurt: { value: 0 }, calm: { value: 0 },
      res: { value: new THREE.Vector2(1, 1) }, texel: { value: new THREE.Vector2(1, 1) }, sharpen: { value: 0 }, dither: { value: 1 / 255 }, toneMappingExposure: { value: 1 },
      gLift: { value: new THREE.Vector3(...GRADE_BASE.lift) }, gGain: { value: new THREE.Vector3(...GRADE_BASE.gain) }, gSat: { value: 1 }, gContrast: { value: GRADE_BASE.contrast }, gExpo: { value: 1 } };
    this.material = new THREE.RawShaderMaterial({ name: 'FinalPass', uniforms: this.uniforms, vertexShader: FINAL_VERT, fragmentShader: FINAL_FRAG, depthTest: false, depthWrite: false });
    this._fsQuad = new FullScreenQuad(this.material); this._key = null;
  }
  render(renderer, writeBuffer, readBuffer) {
    const U = this.uniforms, img = readBuffer.texture.image; U.tDiffuse.value = readBuffer.texture; U.toneMappingExposure.value = renderer.toneMappingExposure;
    U.texel.value.set(1 / Math.max(1, img?.width || readBuffer.width || 1), 1 / Math.max(1, img?.height || readBuffer.height || 1));
    const key = renderer.outputColorSpace + '|' + renderer.toneMapping + '|' + !!this.renderToScreen;   // rebuild defines as OutputPass did (tone map + sRGB only when drawing to the canvas)
    if (key !== this._key) {
      this._key = key; const D = this.material.defines = {};
      if (this.renderToScreen) { if (THREE.ColorManagement.getTransfer(renderer.outputColorSpace) === THREE.SRGBTransfer) D.SRGB_TRANSFER = ''; const t = TM_DEFINE[renderer.toneMapping]; if (t) D[t] = ''; }
      this.material.needsUpdate = true;
    }
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); if (!this.renderToScreen && this.clear) renderer.clear();
    this._fsQuad.render(renderer);
  }
  dispose() { this.material.dispose(); this._fsQuad.dispose(); }
}

// Optional ground-truth ambient occlusion (High quality only, opt-in in the pause menu, and only on rung 0 of the js/perfgov.js ladder).
// The stock GTAOPass re-renders the scene with a MeshNormalMaterial override to get depth + normals; two changes for this game:
//  * glow geometry must not occlude: additive light cones, the torch beam, decals, smoke / dust / sparks are all transparent with depthWrite off,
//    so with the override material they would write depth and cast AO halos.  Those (and anything flagged userData.noAO) are hidden for that pass.
//  * the shadow map was already drawn by the main RenderPass this frame, so the normal pass must not redraw it (autoUpdate off for that render).
// No light is added or removed (a changed light count recompiles every shader); the pass runs at AO_RES of the post chain's resolution.
export const AO_RES = 0.5;
export function aoExcluded(o) {
  if (o.userData?.noAO || o.isSprite || o.isPoints || o.isLine) return true;
  const m = o.material; if (!m) return false;
  for (const x of Array.isArray(m) ? m : [m]) if (x.blending === THREE.AdditiveBlending || (x.transparent && x.depthWrite === false)) return true;
  return false;
}
class GameGTAOPass extends GTAOPass {
  setSize(w, h) { super.setSize(Math.max(1, Math.round(w * AO_RES)), Math.max(1, Math.round(h * AO_RES))); }
  _overrideVisibility() {
    const cache = this._visibilityCache;
    const walk = (o) => { if (!o.visible) return; if (aoExcluded(o)) { o.visible = false; cache.push(o); return; } const c = o.children; for (let i = 0; i < c.length; i++) walk(c[i]); };
    walk(this.scene);
  }
  render(renderer, writeBuffer, readBuffer, dt, mask) {
    const sm = renderer.shadowMap, au = sm.autoUpdate; sm.autoUpdate = false;
    try { super.render(renderer, writeBuffer, readBuffer, dt, mask); } finally { sm.autoUpdate = au; }
  }
}
export class Post {
  constructor(renderer, scene, camera, overlay = null) {
    this.renderer = renderer; this.enabled = true;
    const size = renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    const wp = new RenderPass(scene, camera); this.composer.addPass(wp); this.scenePasses = [wp];   // the passes that draw a scene (world, viewmodel): Talk.warm can skip them
    // AO goes between the world and the viewmodel overlay: the held tool is neither darkened nor casts AO onto the world
    this.ao = new GameGTAOPass(scene, camera, Math.max(1, size.x * AO_RES), Math.max(1, size.y * AO_RES), undefined, { radius: 0.45, distanceExponent: 1.5, thickness: 1, scale: 1, samples: 12, distanceFallOff: 1 }, { radius: 6, samples: 12 });
    this.ao.blendIntensity = 0.85; this.ao.enabled = false; this.aoWanted = false; this.aoAllowed = true;
    this.composer.addPass(this.ao);
    if (overlay) { const vp = new RenderPass(overlay.scene, overlay.camera); vp.clear = false; vp.clearDepth = true; this.composer.addPass(vp); this.scenePasses.push(vp); }   // first-person viewmodel
    this.bloom = new GameBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.3, 0.5, 1.9);
    this.composer.addPass(this.bloom);
    this.final = new FinalPass(); this.final.uniforms.tBloom.value = this.bloom.bloomTexture;   // js/talk.js inserts its depth-of-field pass just before this one
    this.composer.addPass(this.final);
    this.renderer.toneMapping = THREE.AgXToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.grade = stackGrade(); this._gradeFrom = stackGrade(); this._gradeTo = this.grade; this._gradeK = 1; this._gradeDur = 0.8; this._gradeKey = ''; this._gradeT = 0; this.applyGrade(this.grade);
    this.baseRatio = renderer.getPixelRatio(); this.scale = 1; this.setSize(size.x, size.y);
  }
  // dynamic resolution (js/perfgov.js): the post chain renders at baseRatio * k and the final pass upscales onto the canvas, sharpening as k drops
  setScale(k) { if (Math.abs(k - this.scale) < 1e-3) return; this.scale = k; this.composer.setPixelRatio(this.baseRatio * k); this.final.uniforms.sharpen.value = sharpenFor(k); }
  // AO runs only when the player asked for it (pause menu, CFG.ao) AND the perf ladder allows it (js/perfgov.js applyLevel: rung 0 only)
  setAO(wanted) { this.aoWanted = !!wanted; this.ao.enabled = this.aoWanted && this.aoAllowed; }
  allowAO(ok) { this.aoAllowed = !!ok; this.ao.enabled = this.aoWanted && this.aoAllowed; }
  setCalm(v) { this.final.uniforms.calm.value = v ? 1 : 0; }   // accessibility: no grain / scanline / wobble, weaker aberration, static dither
  setSize(w, h) { this.composer.setSize(w, h); this.final.uniforms.res.value.set(w, h); }
  // ---- colour grade. setGrade(grade | partial layer, { instant, dur }): blend to it over dur s (0.8 default). setGradeFor(ship, roomType, { mode }) looks it up in GRADES.
  applyGrade(g) { const U = this.final.uniforms; U.gLift.value.set(...g.lift); U.gGain.value.set(...g.gain); U.gSat.value = g.sat; U.gContrast.value = g.contrast; U.gExpo.value = g.expo; }
  setGrade(g, o = {}) {
    const to = g?.lift && g?.gain && g.sat != null ? g : stackGrade(g);
    this._gradeFrom = lerpGrade(this._gradeFrom, this._gradeTo, this._gradeK); this._gradeTo = to; this._gradeK = o.instant ? 1 : 0; this._gradeDur = o.dur ?? 0.8;
    if (o.instant) { this.grade = lerpGrade(to, to, 1); this.applyGrade(this.grade); }
  }
  setGradeFor(ship, roomType = null, o = {}) { const key = (ship?.hull || ship || '') + '|' + (roomType || '') + '|' + (o.mode || ''); if (key === this._gradeKey) return false; this._gradeKey = key; this.setGrade(gradeFor(ship, roomType, o), o); return true; }
  /** per-frame helper for main.js: the room the player stands in (world.d.rooms, tile maths of js/world.js), looked up at most 4x a second */
  gradeAt(world, x, z, ship, o = {}) {
    const t = performance.now(); if (t - this._gradeT < 250 || !world?.d || !ship) return; this._gradeT = t;
    const [tx, ty] = world.tile(x, z), r = world.d.rooms.find(r => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h);
    this.setGradeFor(ship, r?.type || null, o);
  }
  stepGrade(dt) { if (this._gradeK >= 1) return; this._gradeK = Math.min(1, this._gradeK + (dt > 0 ? dt : 0) / Math.max(1e-3, this._gradeDur)); const k = this._gradeK, e = k * k * (3 - 2 * k); this.grade = lerpGrade(this._gradeFrom, this._gradeTo, e, {}); this.applyGrade(this.grade); }
  render(dt, t, danger, hurt) {
    const U = this.final.uniforms; U.time.value = t; U.danger.value = danger; U.hurt.value = hurt; U.bloomOn.value = this.bloom.enabled ? 1 : 0; this.stepGrade(dt);
    this.composer.render(dt);
  }
}

// ---------------------------------------------------------------
// Soft lit point sprites (replace the 32 px canvas dot texture + PointsMaterial). One ShaderMaterial program for every particle set and the dust:
//  * the sprite is shaped in the fragment shader (no texture): a firm disc with a soft rim for droplets / sparks / motes, a gaussian puff with a little
//    per-particle value noise for steam / smoke (soft = 1);
//  * lit per particle in the vertex shader from the scene's own lights (ambient, hemisphere, point, spot = the torch; no shadows), so smoke glows
//    under a lamp and blood goes dark in a blackout. lit = 0 (sparks, additive; the dust keeps its own torch-cone shading) is the old unlit colour;
//  * per-particle alpha fade / size (aFx) from the CPU: puffs grow and fade in / out over their life, droplets fade over the last 0.15 s;
//  * the point size follows the height of the target actually drawn into (the post chain runs below native under dynamic resolution, where
//    PointsMaterial used the canvas height and drew them too big).
// Same program for all (lit / soft / opacity are uniforms): compiled by renderer.compile(scene) and drawn by main.js warmDraws like any other
// object in the scene, no new light, no light count change. Fog as PointsMaterial.
// ---------------------------------------------------------------
const PT_VERT = `#include <common>
  #include <fog_pars_vertex>
  #include <lights_pars_begin>
  uniform float size, scale, lit, soft;
  attribute vec2 aFx;
  varying vec3 vCol; varying float vA, vSeed;
  void main(){
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = aFx.y > 0.0 ? size * aFx.y * scale / max(0.05, -mvPosition.z) : 0.0;
    vec3 col = vec3(1.0);
    #ifdef USE_COLOR
      col = color.rgb;
    #endif
    vec3 L = vec3(1.0);
    if (lit > 0.0) {
      vec3 irr = ambientLightColor, p = mvPosition.xyz;
      #if NUM_HEMI_LIGHTS > 0
        for (int i = 0; i < NUM_HEMI_LIGHTS; i++) irr += mix(hemisphereLights[i].groundColor, hemisphereLights[i].skyColor, 0.6);
      #endif
      #if NUM_DIR_LIGHTS > 0
        for (int i = 0; i < NUM_DIR_LIGHTS; i++) irr += directionalLights[i].color * 0.5;
      #endif
      #if NUM_POINT_LIGHTS > 0
        for (int i = 0; i < NUM_POINT_LIGHTS; i++) { vec3 lv = pointLights[i].position - p; irr += pointLights[i].color * getDistanceAttenuation(length(lv), pointLights[i].distance, pointLights[i].decay); }
      #endif
      #if NUM_SPOT_LIGHTS > 0
        for (int i = 0; i < NUM_SPOT_LIGHTS; i++) { vec3 lv = spotLights[i].position - p; float dl = length(lv);
          irr += spotLights[i].color * getSpotAttenuation(spotLights[i].coneCos, spotLights[i].penumbraCos, dot(lv / max(dl, 1e-4), spotLights[i].direction)) * getDistanceAttenuation(dl, spotLights[i].distance, spotLights[i].decay) * (1.0 + soft); }   // a lit puff scatters the beam forward
      #endif
      L = mix(vec3(1.0), min(irr * RECIPROCAL_PI, vec3(4.0)), lit);
    }
    vCol = col * L; vA = aFx.x; vSeed = fract(float(gl_VertexID) * 0.6180339);
    #include <fog_vertex>
  }`;
const PT_FRAG = `#include <common>
  #include <fog_pars_fragment>
  uniform float opacity, soft;
  varying vec3 vCol; varying float vA, vSeed;
  float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + 1.0), f.x), f.y); }
  void main(){
    vec2 p = gl_PointCoord * 2.0 - 1.0; float r2 = dot(p, p); if (r2 >= 1.0) discard;
    float a;
    if (soft > 0.5) { float n = vnoise(p * 2.3 + vSeed * 37.0) * 0.6 + vnoise(p * 4.7 - vSeed * 11.0) * 0.4; a = min(1.0, 2.4 * exp(-r2 * 2.2) * (1.0 - r2) * (0.55 + 0.9 * n)); }   // x2.4: about the old dot sprite's coverage, spread softer
    else a = 1.0 - smoothstep(0.3, 1.0, r2);
    a *= opacity * vA; if (a < 0.004) discard;
    gl_FragColor = vec4(vCol * (soft > 0.5 ? 1.0 : 1.0 + 0.25 * (1.0 - r2)), a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;
const _ptV = new THREE.Vector2();
/** the shared particle material. o: { size, opacity, additive, lit (0..1), soft (0 | 1) } */
export function particleMaterial({ size = 0.08, opacity = 1, additive = false, lit = 1, soft = 0 } = {}) {
  const m = new THREE.ShaderMaterial({
    name: 'SoftParticles',
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.lights, THREE.UniformsLib.fog, { size: { value: size }, scale: { value: 270 }, opacity: { value: opacity }, lit: { value: lit }, soft: { value: soft } }]),
    vertexShader: PT_VERT, fragmentShader: PT_FRAG, lights: true, fog: true, vertexColors: true, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  return m;
}
// the point scale follows the target being drawn into (canvas or the post chain's buffer, whichever size the dynamic resolution gave it)
function pointScale(renderer, scene, camera, geometry, material) { const t = renderer.getRenderTarget(); material.uniforms.scale.value = 0.5 * (t ? t.height : renderer.getDrawingBufferSize(_ptV).y); }
// ---------------------------------------------------------------
// Particles (blood, sparks, steam, smoke, water)
// ---------------------------------------------------------------
export class Particles {
  // o.lit: 0..1 (default: 0 for additive sets, 1 otherwise); o.soft: puffs (default for size >= 0.3: steam, smoke)
  constructor(scene, max, { size = 0.08, additive = false, opacity = 1, gravity = 9, drag = 0, lit, soft } = {}) {
    this.max = max; this.gravity = gravity; this.drag = drag; this.i = 0; this.soft = soft ?? size >= 0.3;
    this.pos = new Float32Array(max * 3).fill(-999); this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.life0 = new Float32Array(max).fill(1); this.fx = new Float32Array(max * 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3)); g.setAttribute('aFx', new THREE.BufferAttribute(this.fx, 2));
    this.points = new THREE.Points(g, particleMaterial({ size, opacity, additive, lit: lit ?? (additive ? 0 : 1), soft: this.soft ? 1 : 0 }));
    this.points.frustumCulled = false; this.points.onBeforeRender = pointScale; scene.add(this.points);
    this.onLand = null; this._colDirty = false;
  }
  add(x, y, z, vx, vy, vz, color, life) {
    const i = this.i = (this.i + 1) % this.max, k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z; this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.col[k] = color.r; this.col[k + 1] = color.g; this.col[k + 2] = color.b; this.life[i] = this.life0[i] = Math.max(1e-3, life); this._colDirty = true;
  }
  update(dt) {
    const soft = this.soft, fx = this.fx;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { fx[i * 2 + 1] = 0; continue; }
      const k = i * 3;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[k + 1] = -999; fx[i * 2 + 1] = 0; continue; }
      this.vel[k + 1] -= this.gravity * dt;
      if (this.drag) { const f = Math.max(0, 1 - this.drag * dt); this.vel[k] *= f; this.vel[k + 1] *= f; this.vel[k + 2] *= f; }
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] <= 0.02 && this.gravity > 0) {
        if (this.onLand) this.onLand(this.pos[k], this.pos[k + 2]);
        this.life[i] = 0; this.pos[k + 1] = -999; fx[i * 2 + 1] = 0; continue;
      }
      const L = this.life[i], u = 1 - L / this.life0[i];
      if (soft) { fx[i * 2] = Math.min(1, u / 0.15) * Math.min(1, (1 - u) / 0.4); fx[i * 2 + 1] = 0.6 + 0.8 * u; }   // a puff: fades in, swells, thins out
      else { fx[i * 2] = Math.min(1, L / 0.15); fx[i * 2 + 1] = 1; }
    }
    const a = this.points.geometry.attributes; a.position.needsUpdate = true; a.aFx.needsUpdate = true; if (this._colDirty) { a.color.needsUpdate = true; this._colDirty = false; }
  }
  clear() { this.life.fill(0); this.pos.fill(-999); this.fx.fill(0); this.points.geometry.attributes.aFx.needsUpdate = true; }
}

// ---------------------------------------------------------------
// Decals (blood, scorch, claw marks)
// ---------------------------------------------------------------
function tex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function blobs(g, s, n, spread, r0, r1, col) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28, d = Math.random() * spread * Math.random(), r = r0 + Math.random() * (r1 - r0);
    const x = s / 2 + Math.cos(a) * d, y = s / 2 + Math.sin(a) * d;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col + '1)'); gr.addColorStop(0.7, col + '0.85)'); gr.addColorStop(1, col + '0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
}
function bloodTex(kind) {
  return tex(128, (g, s) => {
    g.clearRect(0, 0, s, s);
    if (kind === 0) { blobs(g, s, 22, 36, 6, 22, 'rgba(90,5,5,'); blobs(g, s, 10, 50, 2, 5, 'rgba(110,8,8,'); }       // pool / splatter
    else if (kind === 1) {                                                                                           // radial splat with droplets
      blobs(g, s, 8, 12, 8, 14, 'rgba(100,6,6,');
      for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, len = 14 + Math.random() * 42; g.strokeStyle = 'rgba(95,5,5,0.9)'; g.lineWidth = 1 + Math.random() * 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(s / 2, s / 2); g.lineTo(s / 2 + Math.cos(a) * len, s / 2 + Math.sin(a) * len); g.stroke(); blobs(g, s, 1, 0, 2, 4, 'rgba(100,6,6,'); }
      for (let i = 0; i < 12; i++) { const a = Math.random() * 6.28, len = 30 + Math.random() * 30; const x = s / 2 + Math.cos(a) * len, y = s / 2 + Math.sin(a) * len; g.fillStyle = 'rgba(100,6,6,0.95)'; g.beginPath(); g.arc(x, y, 1 + Math.random() * 2.5, 0, 7); g.fill(); }
    } else if (kind === 3) {                                                                                         // wall drips
      blobs(g, s, 10, 22, 6, 14, 'rgba(95,5,5,');
      for (let i = 0; i < 6; i++) { const x = s / 2 + (Math.random() - 0.5) * 50, len = 25 + Math.random() * 70; g.strokeStyle = 'rgba(90,4,4,0.92)'; g.lineWidth = 2 + Math.random() * 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, s * 0.35); g.lineTo(x + (Math.random() - 0.5) * 4, s * 0.35 + len); g.stroke(); g.fillStyle = 'rgba(100,5,5,0.95)'; g.beginPath(); g.ellipse(x, s * 0.35 + len + 3, 3.5, 5.5, 0, 0, 7); g.fill(); }
    } else {                                                                                                         // smear / drag mark
      g.strokeStyle = 'rgba(85,5,5,0.9)'; g.lineCap = 'round';
      for (let i = 0; i < 5; i++) { g.lineWidth = 8 + Math.random() * 18; g.beginPath(); g.moveTo(10, s / 2 + (Math.random() - 0.5) * 30); g.bezierCurveTo(40, s / 2 + (Math.random() - 0.5) * 20, 80, s / 2 + (Math.random() - 0.5) * 20, s - 10, s / 2 + (Math.random() - 0.5) * 24); g.stroke(); }
      blobs(g, s, 6, 40, 3, 8, 'rgba(100,6,6,');
    }
  });
}
export class Decals {
  constructor(scene) {
    this.scene = scene; this.sets = {};
    const mk = (name, map, cap) => {
      const mat = new THREE.MeshLambertMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      const geo = new THREE.PlaneGeometry(1, 1);
      const im = new THREE.InstancedMesh(geo, mat, cap); im.count = 0; im.frustumCulled = false; im.receiveShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im); this.sets[name] = { im, cap, n: 0 };
    };
    mk('blood0', bloodTex(0), 260); mk('blood1', bloodTex(1), 260); mk('blood2', bloodTex(2), 160); mk('blood3', bloodTex(3), 140);
    mk('scorch', tex(128, (g, s) => { g.clearRect(0, 0, s, s); blobs(g, s, 14, 26, 14, 34, 'rgba(14,12,10,'); }), 60);
    mk('claw', tex(128, (g, s) => {
      g.clearRect(0, 0, s, s);
      for (let i = 0; i < 4; i++) { const x0 = 24 + i * 22 + Math.random() * 6; g.strokeStyle = 'rgba(15,12,10,0.95)'; g.lineWidth = 3.2; g.beginPath(); g.moveTo(x0, 6); g.quadraticCurveTo(x0 + 10 + Math.random() * 8, s / 2, x0 + 2 + Math.random() * 10, s - 8); g.stroke();
        g.strokeStyle = 'rgba(190,190,180,0.55)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x0 + 3, 6); g.quadraticCurveTo(x0 + 13, s / 2, x0 + 6, s - 8); g.stroke(); }
    }), 50);
    this.dummy = new THREE.Object3D(); this.col = new THREE.Color();
  }
  clear() { for (const s of Object.values(this.sets)) { s.n = 0; s.im.count = 0; } }
  _put(name, x, y, z, rx, ry, rz, w, h, shade) {
    const s = this.sets[name], i = s.n % s.cap; s.n++;
    const d = this.dummy; d.position.set(x, y, z); d.rotation.set(rx, ry, rz); d.scale.set(w, h, 1); d.updateMatrix();
    s.im.setMatrixAt(i, d.matrix); s.im.setColorAt(i, this.col.setScalar(shade)); s.im.count = Math.min(s.n, s.cap);
    s.im.instanceMatrix.needsUpdate = true; if (s.im.instanceColor) s.im.instanceColor.needsUpdate = true;
  }
  floor(kind, x, z, size, fresh = 1) {
    const name = kind.startsWith('blood') ? 'blood' + (kind === 'blood' ? Math.floor(Math.random() * 3) : kind.slice(5)) : kind;
    this._put(name, x, 0.012 + Math.random() * 0.004, z, -Math.PI / 2, 0, Math.random() * 6.28, size, size * (0.8 + Math.random() * 0.4), 0.55 + fresh * 0.5);
  }
  wall(kind, x, y, z, ry, size) {
    const name = kind.startsWith('blood') ? 'blood' + (kind === 'blood' ? (Math.random() < 0.5 ? 1 : 3) : kind.slice(5)) : kind;
    this._put(name, x, y, z, 0, ry, kind === 'claw' ? (Math.random() - 0.5) * 0.6 : Math.random() * 6.28, size, size, 0.7 + Math.random() * 0.3);
  }
}

// dust motes around the camera
export class Dust {
  constructor(scene, n = 140) {
    this.n = n; this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { this.p[i * 3] = (Math.random() - 0.5) * 12; this.p[i * 3 + 1] = Math.random() * 3; this.p[i * 3 + 2] = (Math.random() - 0.5) * 12; this.v[i * 3] = (Math.random() - 0.5) * 0.05; this.v[i * 3 + 1] = (Math.random() - 0.5) * 0.04; this.v[i * 3 + 2] = (Math.random() - 0.5) * 0.05; }
    this.w = new Float32Array(n * 3); this.c = new Float32Array(n * 3).fill(0.3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.w, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.c, 3)); g.setAttribute('aFx', new THREE.BufferAttribute(new Float32Array(n * 2).fill(1), 2));
    this.pts = new THREE.Points(g, particleMaterial({ size: 0.045, opacity: 0.6, lit: 0, soft: 0 }));   // unlit: the torch-cone shading below is the motes' light
    this.pts.frustumCulled = false; this.pts.onBeforeRender = pointScale; scene.add(this.pts);
  }
  update(dt, cx, cz, cam, torchOn = true) {
    let fx = 0, fy = 0, fz = 0, ex = 0, ey = 0, ez = 0;
    if (cam) { const e = cam.elements ? null : null; ex = cam.position.x; ey = cam.position.y; ez = cam.position.z; const q = cam.getWorldDirection(this._v || (this._v = new THREE.Vector3())); fx = q.x; fy = q.y; fz = q.z; }
    for (let i = 0; i < this.n; i++) {
      for (let a = 0; a < 3; a++) this.p[i * 3 + a] += this.v[i * 3 + a] * dt;
      if (this.p[i * 3 + 1] < 0 || this.p[i * 3 + 1] > 3) this.v[i * 3 + 1] *= -1;
      // wrap relative to camera within a 12m box
      const dx = this.p[i * 3] - cx; this.p[i * 3] -= Math.round(dx / 12) * 12;
      const dz = this.p[i * 3 + 2] - cz; this.p[i * 3 + 2] -= Math.round(dz / 12) * 12;
      this.w[i * 3] = this.p[i * 3]; this.w[i * 3 + 1] = this.p[i * 3 + 1]; this.w[i * 3 + 2] = this.p[i * 3 + 2];
      let b = 0.22;
      if (cam && torchOn) { const dx = this.w[i * 3] - ex, dy = this.w[i * 3 + 1] - ey, dz = this.w[i * 3 + 2] - ez, d = Math.hypot(dx, dy, dz) || 1, cs = (dx * fx + dy * fy + dz * fz) / d; if (cs > 0.88 && d < 14) b += Math.min(1, (cs - 0.88) / 0.08) * (1 - d / 14) * 1.6; }
      this.c[i * 3] = this.c[i * 3 + 1] = b; this.c[i * 3 + 2] = b * 0.95;
    }
    this.pts.geometry.attributes.position.needsUpdate = true; this.pts.geometry.attributes.color.needsUpdate = true;
  }
}
