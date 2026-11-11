import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------------------------------------------------------------
// Post-processing: bloom + film grain + chromatic aberration + vignette
// ---------------------------------------------------------------
const FinalShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, danger: { value: 0 }, hurt: { value: 0 }, res: { value: new THREE.Vector2(1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, danger, hurt; uniform vec2 res; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5; float r2 = dot(d,d);
      vec2 ca = d * (0.0015 + r2 * 0.012 + danger * 0.006 + hurt * 0.02);
      vec3 c = vec3(texture2D(tDiffuse, vUv + ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - ca).b);
      float g = rnd(vUv * res + fract(time) * 100.0) - 0.5;
      c += g * 0.028;
      float l = dot(c, vec3(0.299,0.587,0.114));
      c = mix(c, vec3(l), hurt * 0.5 + danger * 0.15);
      c *= 1.0 - smoothstep(0.25, 0.95, r2 * 2.6) * (0.55 + danger * 0.3);
      c.r += danger * 0.08 * (1.0 - r2 * 2.0) + hurt * 0.25;
      c *= 1.0 - 0.04 * sin(vUv.y * res.y * 1.3);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.enabled = true;
    const size = renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.6, 0.97);
    this.composer.addPass(this.bloom);
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
    this.composer.addPass(new OutputPass());
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.25;
    this.setSize(size.x, size.y);
  }
  setSize(w, h) { this.composer.setSize(w, h); this.final.uniforms.res.value.set(w, h); }
  render(dt, t, danger, hurt) {
    this.final.uniforms.time.value = t; this.final.uniforms.danger.value = danger; this.final.uniforms.hurt.value = hurt;
    this.composer.render(dt);
  }
}

let _dot = null;
function dotTex() {
  if (_dot) return _dot;
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return _dot = new THREE.CanvasTexture(c);
}
// ---------------------------------------------------------------
// Particles (blood, sparks, steam)
// ---------------------------------------------------------------
export class Particles {
  constructor(scene, max, { size = 0.08, additive = false, opacity = 1, gravity = 9, drag = 0 } = {}) {
    this.max = max; this.gravity = gravity; this.drag = drag; this.i = 0;
    this.pos = new Float32Array(max * 3).fill(-999); this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size, map: dotTex(), alphaTest: 0.05, vertexColors: true, transparent: true, opacity, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true }));
    this.points.frustumCulled = false; scene.add(this.points);
    this.onLand = null;
  }
  add(x, y, z, vx, vy, vz, color, life) {
    const i = this.i = (this.i + 1) % this.max, k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z; this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.col[k] = color.r; this.col[k + 1] = color.g; this.col[k + 2] = color.b; this.life[i] = life;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      const k = i * 3;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[k + 1] = -999; continue; }
      this.vel[k + 1] -= this.gravity * dt;
      if (this.drag) { const f = Math.max(0, 1 - this.drag * dt); this.vel[k] *= f; this.vel[k + 1] *= f; this.vel[k + 2] *= f; }
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] <= 0.02 && this.gravity > 0) {
        if (this.onLand) this.onLand(this.pos[k], this.pos[k + 2]);
        this.life[i] = 0; this.pos[k + 1] = -999;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.color.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.pos.fill(-999); }
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
    this.w = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.w, 3));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.04, map: dotTex(), color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, sizeAttenuation: true }));
    this.pts.frustumCulled = false; scene.add(this.pts);
  }
  update(dt, cx, cz) {
    for (let i = 0; i < this.n; i++) {
      for (let a = 0; a < 3; a++) this.p[i * 3 + a] += this.v[i * 3 + a] * dt;
      if (this.p[i * 3 + 1] < 0 || this.p[i * 3 + 1] > 3) this.v[i * 3 + 1] *= -1;
      // wrap relative to camera within a 12m box
      const dx = this.p[i * 3] - cx; this.p[i * 3] -= Math.round(dx / 12) * 12;
      const dz = this.p[i * 3 + 2] - cz; this.p[i * 3 + 2] -= Math.round(dz / 12) * 12;
      this.w[i * 3] = this.p[i * 3]; this.w[i * 3 + 1] = this.p[i * 3 + 1]; this.w[i * 3 + 2] = this.p[i * 3 + 2];
    }
    this.pts.geometry.attributes.position.needsUpdate = true;
  }
}
