// CC0 model loading (see CREDITS.md). Everything degrades gracefully to procedural fallbacks if a file fails to load.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const cache = {};

export const MODEL_FILES = ['crew_m', 'crew_f', 'crew_f2', 'crew_heavy', 'suit', 'human_anims', 'ph_crate', 'ph_barrel', 'ph_plant', 'ph_utilbox', 'ph_armchair'];

export function loadModels(names = MODEL_FILES, onEach = null) {   // onEach(name): called as each file finishes (loading screen progress)
  return Promise.all(names.map(n => new Promise(res => {
    loader.load(`./assets/models/${n}.glb`, g => { cache[n] = g; onEach?.(n); res(); }, undefined, e => { console.warn('model failed:', n, e); onEach?.(n); res(); });
  })));
}
export const has = (n) => !!cache[n];
export const get = (n) => cache[n];

export function loadEnv(renderer, name = 'lobby') {
  return new Promise(res => {
    new EXRLoader().load(`./assets/env/${name}.exr`, tex => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      const pm = new THREE.PMREMGenerator(renderer); const env = pm.fromEquirectangular(tex).texture; tex.dispose(); pm.dispose(); res(env);
    }, undefined, () => res(null));
  });
}

// returns { root, clips } scaled so it stands `height` metres tall with feet at y=0
export function instance(name, { height = 1.8, tint = null, emissive = null, material = null, byMax = false } = {}) {
  const src = cache[name]; if (!src) return null;
  const root = clone(src.scene);
  const box = new THREE.Box3().setFromObject(root); const size = box.getSize(new THREE.Vector3());
  const s = height / ((byMax ? Math.max(size.x, size.y, size.z) : size.y) || 1); root.scale.multiplyScalar(s);
  root.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(root); root.position.y -= b2.min.y; root.position.x -= (b2.min.x + b2.max.x) / 2; root.position.z -= (b2.min.z + b2.max.z) / 2;
  const holder = new THREE.Group(); holder.add(root);
  root.traverse(o => {
    if (!o.isMesh) return; o.castShadow = true; o.frustumCulled = false;
    if (material) { o.material = material; o.castShadow = false; return; }
    o.material = o.material.clone();
    if (tint) o.material.color.multiply(new THREE.Color(tint));
    if (emissive) { o.material.emissive = new THREE.Color(emissive.color); o.material.emissiveIntensity = emissive.intensity ?? 1; }
    o.material.roughness = Math.min(o.material.roughness ?? 0.8, 0.8);
  });
  return { root: holder, inner: root, clips: src.animations };
}

export class Anim {
  constructor(root, clips) {
    this.mixer = new THREE.AnimationMixer(root); this.acts = {}; this.cur = null; this.curKey = '';
    for (const c of clips) { const k = c.name.split('|').pop().toLowerCase(); if (!this.acts[k]) this.acts[k] = this.mixer.clipAction(c); }
  }
  find(names) { for (const n of names) { const k = Object.keys(this.acts).find(k => k.includes(n)); if (k) return [k, this.acts[k]]; } return null; }
  play(names, { loop = true, fade = 0.2, speed = 1 } = {}) {
    const f = this.find(names); if (!f) return; const [k, a] = f;
    if (this.curKey === k) { a.timeScale = speed; return; }
    a.reset(); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = !loop; a.timeScale = speed;
    if (this.cur) this.cur.crossFadeTo(a, fade, false); a.play(); this.cur = a; this.curKey = k;
  }
  update(dt) { this.mixer.update(dt); }
}

// PBR texture sets: CC0 scans (ambientCG) and the project's own generated sets (tools/build-textures.mjs), see CREDITS.md.
// Missing files just leave the procedural fallback in place.
const pbrSets = {};
export const PBR_SETS = ['wall', 'deck', 'carpet', 'tile', 'ceil', 'wallp', 'wallq', 'wallg', 'grate', 'rubber', 'hex', 'paver', 'ceilt', 'ceilm', 'ceilg', 'ceilp', 'ceilc', 'trim', 'lens', 'glass', 'scales', 'flesh', 'cloth', 'hull', 'grime'];
// generated sets pack ambient occlusion / roughness / metalness into the R / G / B channels of <name>_r.webp
export const ORM_SETS = new Set(['wallp', 'wallq', 'wallg', 'grate', 'rubber', 'hex', 'paver', 'ceilt', 'ceilm', 'ceilg', 'ceilp', 'ceilc', 'trim', 'lens', 'glass', 'scales', 'flesh', 'cloth', 'hull', 'grime']);
// Mip pre-filtering for the line-grid sets. The GPU builds mips with a 2x2 box chain, which cannot hold a fine square wave: grate (20 bars per 2.5 m tile) and
// ceilg (16 louvres) alias into moire from the 32 px level down, exactly where a floor or ceiling is seen at 1-2 px per bar (a room's far half at 960x540).
// MIP_FADE[set] = first mip level whose contrast is pulled toward the map's mean; the maps keep their full-resolution detail (close-ups are untouched) and
// levels from there on keep 35% / 10% / 0% of their detail, so what is left at distance is flat mean colour, not a beat pattern. The chain is built on a
// 2D canvas (native resampling), read back once per level, and uploaded as a DataTexture with user mips.
const MIP_FADE = { grate: 4, ceilg: 4 };
const KEEP = [0.35, 0.1, 0];
function fadedMips(src, from, flip) {
  const mk = (w, h) => typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  let w = src.width, h = src.height, cv = mk(w, h), g = cv.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low';
  if (flip) { g.translate(0, h); g.scale(1, -1); } g.drawImage(src, 0, 0);
  const levels = [{ data: new Uint8Array(g.getImageData(0, 0, w, h).data.buffer), width: w, height: h }];
  while (w > 1 || h > 1) {
    const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1), c2 = mk(nw, nh), g2 = c2.getContext('2d', { willReadFrequently: true }); g2.imageSmoothingEnabled = true; g2.imageSmoothingQuality = 'low';
    g2.drawImage(cv, 0, 0, w, h, 0, 0, nw, nh); levels.push({ data: new Uint8Array(g2.getImageData(0, 0, nw, nh).data.buffer), width: nw, height: nh }); cv = c2; w = nw; h = nh;
  }
  const mean = levels[levels.length - 1].data.slice(0, 4);
  for (let L = from; L < levels.length; L++) {
    const k = KEEP[L - from] ?? 0, d = levels[L].data;
    for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = mean[c] + (d[i + c] - mean[c]) * k;
  }
  const t = new THREE.DataTexture(levels[0].data, levels[0].width, levels[0].height, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.mipmaps = levels; t.generateMipmaps = false; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.flipY = false; t.needsUpdate = true;
  return t;
}
export function loadTextures(names = PBR_SETS, onEach = null) {   // onEach(name): called as each set finishes
  // Decoded off the main thread into ImageBitmaps where the browser can (same test as three's GLTFLoader): an <img> texture is decoded on the main thread at its
  // first GPU upload, ~15 ms per 512-1024 px map, i.e. mid-boarding and again as each new deck's surfaces first draw. The bitmap is flipped and left
  // unpremultiplied / unconverted at decode time, which is what three's upload flags (flipY, no premultiply, no colour-space conversion) do for an <img>.
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '', saf = /^((?!chrome|android).)*safari/i.test(ua) ? +(ua.match(/Version\/(\d+)/)?.[1] ?? -1) : null, ff = ua.includes('Firefox') ? +(ua.match(/Firefox\/(\d+)/)?.[1] ?? -1) : null;
  const bitmaps = typeof createImageBitmap !== 'undefined' && !(saf != null && saf < 17) && !(ff != null && ff < 98);
  const bl = bitmaps ? new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }) : null, tl = new THREE.TextureLoader();
  const done = (t, srgb) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const plain = (src, flipY) => { const t = new THREE.Texture(src); t.flipY = flipY; t.needsUpdate = true; return t; };
  const one = (url, srgb, fade = 0) => new Promise(res => bl
    ? bl.load(url, (bmp) => { let t = null; if (fade) try { t = fadedMips(bmp, fade, false); } catch (e) { t = null; } res(done(t || plain(bmp, false), srgb)); }, undefined, () => res(null))   // flipY already applied to the bitmap
    : tl.load(url, t => { let f = null; if (fade) try { f = fadedMips(t.image, fade, true); } catch (e) { f = null; } res(done(f || t, srgb)); }, undefined, () => res(null)));
  const sets = Promise.all(names.map(async n => {
    const [c, nm, r] = await Promise.all([one(`./assets/textures/${n}_c.webp`, true, MIP_FADE[n]), one(`./assets/textures/${n}_n.webp`, false, MIP_FADE[n]), one(`./assets/textures/${n}_r.webp`, false, MIP_FADE[n])]);
    if (c && nm && r) pbrSets[n] = { c, n: nm, r, orm: ORM_SETS.has(n) };
    onEach?.(n);
  }));
  // shared packed surface maps (linear data, world-space sampled by js/world.js envSurface): detail_m = micro normal + height, wear_m = dirt / smudge / chip masks
  const maps = Promise.all(SURFACE_MAPS.map(async n => { const t = await one(`./assets/textures/${n}_m.webp`); if (t) surfMaps[n] = t; }));
  return Promise.all([sets, maps]);
}
export const pbr = (n) => pbrSets[n];
const surfMaps = {};
export const SURFACE_MAPS = ['detail', 'wear'];
export const surfaceMap = (n) => surfMaps[n];
