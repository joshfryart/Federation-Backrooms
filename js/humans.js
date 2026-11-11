// Rigged human characters (MakeHuman-based CC0 meshes from the dramatis3d samples) driven by Quaternius' Universal
// Animation Library (CC0). Both share one rest pose, so every clip plays on every body. See CREDITS.md.
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { has, get } from './assets.js';

export const CREW_KINDS = ['crew_m', 'crew_f', 'crew_f2'];
export const DIVISIONS = [0xa3231c, 0xc79a1e, 0x2456a6];
const SKINS = [0xe8b896, 0xd9a47c, 0xb97e58, 0x8f5d3d, 0x5e3b27, 0xf0cdb4];
const HAIRS = [[0.25, 0.2, 0.18], [0.6, 0.45, 0.35], [1.2, 0.95, 0.7], [1.9, 1.6, 1.0], [1.7, 1.7, 1.75], [1.3, 0.55, 0.35]];
const UAL_HIP = 0.917;
const pickOf = (a, r = Math.random) => a[Math.floor(r() * a.length)];
export const humansReady = () => has('human_anims') && has('crew_m');

const meta = {};   // per model: native height, hip height, scaled clips
function info(kind) {
  if (meta[kind]) return meta[kind];
  const src = get(kind); const box = new THREE.Box3().setFromObject(src.scene);
  const pelvis = src.scene.getObjectByName('pelvis'); const k = pelvis.position.length() / UAL_HIP;
  const clips = {};
  for (const c of get('human_anims').animations) {
    const cc = c.clone();
    cc.tracks = cc.tracks.filter(t => src.scene.getObjectByName(t.name.split('.')[0]));
    for (const t of cc.tracks) if (t.name === 'pelvis.position') { t.values = t.values.slice(); for (let i = 0; i < t.values.length; i++) t.values[i] *= k; }
    clips[c.name.replace(/_Loop$/, '').toLowerCase()] = cc;
  }
  // paint a dark undershirt onto the torso skin (vertex colours from skin weights) so cropped tops read as uniforms
  if (kind !== 'suit') src.scene.traverse(o => {
    if (!o.isSkinnedMesh || o.material.name !== 'body') return;
    const g = o.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, n = si.count, col = new Float32Array(n * 3);
    const torso = o.skeleton.bones.map(b => /^(pelvis|spine_0\d|clavicle_[lr])$/.test(b.name));
    for (let i = 0; i < n; i++) {
      let w = 0, tot = 0; for (let k = 0; k < 4; k++) { const wk = sw.getComponent(i, k); tot += wk; if (torso[si.getComponent(i, k)]) w += wk; }
      const v = 1 - 0.97 * Math.min(1, Math.max(0, (w / (tot || 1) - 0.3) / 0.25)); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); o.material.vertexColors = true;
  });
  return meta[kind] = { height: box.max.y - box.min.y, clips };
}

// ---- hologram material (fresnel rim + scanlines + tearing); works on skinned meshes ----
const holoTime = { value: 0 };
export function holoMaterial(color = 0x6ad8ff, opacity = 0.75) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: holoTime, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uGlitch: { value: 0 } },
    vertexShader: `
      #include <common>
      #include <morphtarget_pars_vertex>
      #include <skinning_pars_vertex>
      uniform float uTime; uniform float uGlitch;
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        #include <morphinstance_vertex>
        #include <beginnormal_vertex>
        #include <morphnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <morphtarget_vertex>
        #include <skinning_vertex>
        vec4 wp = modelMatrix * vec4(transformed, 1.0); vY = wp.y;
        float band = step(0.93, fract(wp.y * 1.7 - uTime * 0.9)) + uGlitch * step(0.6, fract(wp.y * 5.0 + uTime * 13.0));
        wp.x += band * 0.06 * sin(uTime * 60.0 + wp.y * 40.0);
        vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        vN = normalize(transformedNormal); vV = normalize(-mvPosition.xyz);
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uColor; uniform float uOpacity;
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float scan = 0.35 + 0.65 * step(0.45, fract(vY * 55.0 - uTime * 1.5));
        float flick = 0.9 + 0.1 * sin(uTime * 47.0);
        gl_FragColor = vec4(uColor * (0.07 + fres * 1.35) * scan * flick, uOpacity);
      }`,
  });
}

function bloodyMap(tex, amount) {
  const img = tex.image; const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  for (let i = 0; i < amount; i++) {
    const x = Math.random() * c.width, y = Math.random() * c.height, r = 5 + Math.random() * Math.random() * 40;
    const gr = g.createRadialGradient(x, y, 1, x, y, r); gr.addColorStop(0, 'rgba(48,2,2,0.97)'); gr.addColorStop(0.75, 'rgba(58,0,0,0.9)'); gr.addColorStop(1, 'rgba(40,0,0,0)');
    for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(50,0,0,0.9)'; g.beginPath(); g.arc(x + (Math.random() - 0.5) * r * 4, y + (Math.random() - 0.5) * r * 4, 1 + Math.random() * 3, 0, 7); g.fill(); }
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * (0.5 + Math.random()), Math.random() * 3, 0, 7); g.fill();
    if (Math.random() < 0.5) { g.fillStyle = 'rgba(50,0,0,0.8)'; g.fillRect(x - 2, y, 3 + Math.random() * 4, r * (1 + Math.random() * 2)); }
  }
  const t = new THREE.CanvasTexture(c); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT; return t;
}

/**
 * opts: kind, height, uniform (hex), skin (hex), hair ([r,g,b] multiplier), material (override, e.g. hologram),
 *       bloody (0..1), pale (0..1), slime (bool), tint (hex multiply on everything), shadow (blob), rnd
 */
export function makeHuman(opts = {}) {
  const rnd = opts.rnd || Math.random;
  const kind = opts.kind || pickOf(CREW_KINDS, rnd); const src = get(kind); if (!src) return null;
  const inf = info(kind); const inner = clone(src.scene);
  const g = new THREE.Group(); const height = opts.height || (kind === 'crew_m' ? 1.8 : kind === 'crew_heavy' ? 1.98 : kind === 'suit' ? 1.9 : 1.62 + rnd() * 0.1);
  inner.scale.setScalar(height / inf.height); g.add(inner);
  const skin = new THREE.Color(opts.skin ?? pickOf(SKINS, rnd)); if (opts.pale) skin.lerp(new THREE.Color(0xb9b3a4), opts.pale);
  const hair = opts.hair || pickOf(HAIRS, rnd); const uniform = new THREE.Color(opts.uniform ?? pickOf(DIVISIONS, rnd));
  const faces = []; const mats = {};
  inner.traverse(o => {
    if (!o.isMesh) return; o.frustumCulled = false; o.castShadow = !opts.material;
    if (o.morphTargetDictionary) faces.push(o);
    const name = o.material.name || '';
    if (opts.material) { o.material = opts.material; if (name === 'eyelashes' || name === 'tongue') o.visible = false; return; }
    const m = o.material = o.material.clone(); mats[name.split('_')[0]] = m;
    if (name === 'body' && kind !== 'suit') { m.color.copy(skin); m.roughness = 0.62; if (opts.slime) { m.color.set(0x4f9a52); m.roughness = 0.18; m.emissive = new THREE.Color(0x0c5a1c); m.emissiveIntensity = 0.7; } }
    else if (name === 'hair' || name === 'brows') { m.color.setRGB(hair[0], hair[1], hair[2]); m.alphaTest = 0.4; m.transparent = false; m.side = THREE.DoubleSide; m.roughness = 0.75; }
    else if (name.startsWith('garment') && !name.includes('shoes')) { m.color.copy(uniform); m.roughness = 0.9; if (opts.bloody && m.map?.image) m.map = bloodyMap(m.map, 10 + opts.bloody * 40); }
    else if (name.includes('shoes')) { m.color.set(0x2a2a2e); m.roughness = 0.5; }
    else if (name === 'eyes') { m.roughness = 0.08; if (opts.bloody) { m.emissive = new THREE.Color(0x601008); m.emissiveIntensity = 0.6; } if (opts.slime) { m.emissive = new THREE.Color(0x30ff60); m.emissiveIntensity = 1.6; } }
    else if (name === 'teeth') { m.alphaTest = 0.5; }
    if (opts.tint) m.color.multiply(new THREE.Color(opts.tint));
  });
  if (opts.shadow !== false) { const bs = new THREE.Mesh(new THREE.CircleGeometry(0.42, 14), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false })); bs.rotation.x = -Math.PI / 2; bs.position.y = 0.02; g.add(bs); g.userData.blob = bs; }
  const mixer = new THREE.AnimationMixer(inner); const acts = {}; let cur = null, curKey = '';
  const bones = {}; for (const n of ['Head', 'neck_01', 'spine_02', 'spine_03', 'hand_r', 'hand_l', 'lowerarm_r', 'lowerarm_l', 'upperarm_r', 'pelvis']) bones[n] = inner.getObjectByName(n);
  const H = {
    kind, inner, mixer, bones, mats, height, faceW: {}, lookYaw: 0, lookPitch: 0,
    has: (k) => !!inf.clips[k],
    play(key, { loop = true, fade = 0.25, speed = 1, restart = false } = {}) {
      const clip = inf.clips[key]; if (!clip) return;
      const a = acts[key] || (acts[key] = mixer.clipAction(clip));
      if (curKey === key && !restart) { a.timeScale = speed; return; }
      a.reset(); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = !loop; a.timeScale = speed; a.enabled = true;
      if (cur && cur !== a) { a.crossFadeFrom(cur, fade, false); } a.play(); cur = a; curKey = key;
    },
    get current() { return curKey; },
    pose(key, at = 1) { H.play(key, { loop: false, fade: 0 }); const d = inf.clips[key].duration; mixer.setTime(d * at - 0.001); },
    face(w) { Object.assign(H.faceW, w); for (const m of faces) for (const k in H.faceW) { const i = m.morphTargetDictionary[k]; if (i !== undefined) m.morphTargetInfluences[i] = H.faceW[k]; } },
    update(dt) {
      mixer.update(dt); holoTime.value = performance.now() / 1000;
      if (H.lookYaw || H.lookPitch) { const b = bones.Head; if (b) { b.rotateY(H.lookYaw * 0.6); b.rotateX(H.lookPitch); } const n = bones.neck_01; if (n) n.rotateY(H.lookYaw * 0.4); }
    },
  };
  g.userData.human = H; H.play('idle', { fade: 0 }); mixer.update(rnd() * 3);
  return g;
}

// blink + small idle expression; call each frame for living, friendly humans
export function liveFace(H, t, seed = 0) {
  const b = (t * 0.37 + seed) % 1; const lid = b > 0.96 ? 1 : 0;
  H.face({ LeftUpperLidClosed: lid, RightUpperLidClosed: lid });
}

// ---- ready-made NPCs (return null when the models failed to load so callers can fall back) ----
export function makeSurvivor(rnd = Math.random) {
  const g = makeHuman({ rnd }); if (!g) return null; const H = g.userData.human;
  const pose = pickOf(['idle', 'idle', 'idle_talking', 'crouch_idle', 'sitting_idle', 'idle_torch'], rnd);
  H.play(pose, { fade: 0 }); H.standing = pose.startsWith('idle'); H.face({ LeftInnerBrowUp: 0.8, RightInnerBrowUp: 0.8 });
  return g;
}
export function makeCorpse(rnd = Math.random) {
  const g = makeHuman({ rnd, bloody: 1, pale: 0.5, shadow: false, kind: pickOf([...CREW_KINDS, 'crew_heavy'], rnd) }); if (!g) return null; const H = g.userData.human;
  H.pose(pickOf(['death01', 'death01', 'sitting_idle'], rnd) === 'death01' ? 'death01' : 'death01', 0.86 + rnd() * 0.14);
  H.face({ JawDrop: 0.3 + rnd() * 0.5, LeftUpperLidClosed: rnd(), RightUpperLidClosed: rnd() }); H.mixer.update(0);
  g.rotation.y = rnd() * 6.28; return g;
}
export function makeMedHolo() {
  const g = makeHuman({ kind: 'crew_f2', height: 1.7, material: holoMaterial(0x6ad8ff, 0.8), shadow: false }); if (!g) return null;
  g.userData.human.play('idle_talking', { fade: 0 }); g.userData.human.standing = true; return g;
}
