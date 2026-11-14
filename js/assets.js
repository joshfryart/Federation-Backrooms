// CC0 model loading (see CREDITS.md). Everything degrades gracefully to procedural fallbacks if a file fails to load.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const cache = {};

export const MODEL_FILES = ['crew_m', 'crew_f', 'crew_f2', 'crew_heavy', 'suit', 'human_anims', 'ph_crate', 'ph_barrel', 'ph_plant', 'ph_utilbox', 'ph_armchair'];

export function loadModels(names = MODEL_FILES) {
  return Promise.all(names.map(n => new Promise(res => {
    loader.load(`./assets/models/${n}.glb`, g => { cache[n] = g; res(); }, undefined, e => { console.warn('model failed:', n, e); res(); });
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
export const PBR_SETS = ['wall', 'deck', 'carpet', 'tile', 'ceil', 'wallp', 'wallq', 'wallg', 'grate', 'rubber', 'hex', 'paver', 'ceilt', 'ceilm', 'ceilg', 'trim', 'lens', 'glass', 'scales', 'flesh', 'cloth', 'hull', 'grime'];
// generated sets pack ambient occlusion / roughness / metalness into the R / G / B channels of <name>_r.webp
export const ORM_SETS = new Set(['wallp', 'wallq', 'wallg', 'grate', 'rubber', 'hex', 'paver', 'ceilt', 'ceilm', 'ceilg', 'trim', 'lens', 'glass', 'scales', 'flesh', 'cloth', 'hull', 'grime']);
export function loadTextures(names = PBR_SETS) {
  const tl = new THREE.TextureLoader();
  const one = (url, srgb) => new Promise(res => tl.load(url, t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; res(t); }, undefined, () => res(null)));
  return Promise.all(names.map(async n => {
    const [c, nm, r] = await Promise.all([one(`./assets/textures/${n}_c.webp`, true), one(`./assets/textures/${n}_n.webp`), one(`./assets/textures/${n}_r.webp`)]);
    if (c && nm && r) pbrSets[n] = { c, n: nm, r, orm: ORM_SETS.has(n) };
  }));
}
export const pbr = (n) => pbrSets[n];
