// Live crew portraits: a small headshot rendered from each person's actual model (js/humans.js makeHuman), framed on the
// Head bone by a tiny dedicated camera into a render target, white-balanced, cached per person id as a data URL.
// Lazy: get(person) queues a render and returns the cached URL or null; tick() renders a few per frame; a placeholder
// silhouette in the person's department colour stands in meanwhile. <img data-pid> elements are patched when ready.
// Used by the radio contact cards, the duty/order/delegate pickers, the comm log, the wheel and (later) conversations.
//   const PT = new Portraits({ renderer, size: 128 })
//   PT.get(person) -> url | null      PT.url(person) -> url or placeholder      PT.img(person, px, cls) -> '<img …>'
//   PT.tick(max = 2)                  PT.renderNow(person) -> url (synchronous; tests)      PT.clear()
import * as THREE from 'three';
import { makeHuman } from './humans.js';

/** department hue (and badge letter) shared by tags, cards and portraits; shape lives in js/icons.js CATS */
export const DEPT_COL = { command: '#6ea8ff', flight: '#8fb7ff', operations: '#d6c85a', engineering: '#e8892b', security: '#ff7a6b', sciences: '#c58be0', medical: '#3fd6a0', services: '#c6d25e' };
export const DEPT_LETTER = { command: 'C', flight: 'F', operations: 'O', engineering: 'E', security: 'X', sciences: 'S', medical: 'M', services: 'V' };
export const deptCol = (p) => DEPT_COL[p?.dept] || '#9db2c8';

/** placeholder: uniform-coloured silhouette (procedural from the person id) as an SVG data URL */
export function silhouette(p) {
  const c = deptCol(p), id = p?.id ?? 0, sk = ['#d8b99a', '#b98a67', '#8d5f43', '#e6cdb3'][id % 4], hr = ['#2a2018', '#5a3b22', '#c9c2b0', '#111'][(id >> 2) % 4];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0d1522"/><path d="M5 64c0-14 11-21 27-21s27 7 27 21z" fill="${c}" opacity=".9"/><rect x="28" y="36" width="8" height="11" fill="${sk}"/><ellipse cx="32" cy="26" rx="10.5" ry="12" fill="${sk}"/><path d="M21.5 24C21 14 26 11.5 32 11.5S43 14 42.5 24C40 19 36 18 32 18S24 19 21.5 24z" fill="${hr}"/></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

export class Portraits {
  constructor({ renderer = null, size = 128 } = {}) {
    this.renderer = renderer; this.size = size; this.cache = new Map(); this.queue = []; this.failed = new Set(); this.stats = { rendered: 0, ms: 0 };
  }
  key(p) { return p?.id ?? p?.short ?? null; }
  get(p) { const k = this.key(p); if (k == null) return null; const u = this.cache.get(k); if (u) return u; if (!this.failed.has(k) && !this.queue.includes(p)) this.queue.push(p); return null; }
  url(p) { return this.get(p) || silhouette(p); }
  img(p, px = 54, cls = 'pt') { return `<img class="${cls}" data-pid="${this.key(p)}" src="${this.url(p)}" width="${px}" height="${px}" alt="" draggable="false">`; }
  clear() { this.cache.clear(); this.queue.length = 0; this.failed.clear(); }
  /** render up to `max` queued portraits (call once per frame; also runs while the world is paused) */
  tick(max = 2) { let n = 0; while (this.queue.length && n < max) { const p = this.queue.shift(); if (!this.cache.has(this.key(p))) { this.renderNow(p); n++; } } return n; }
  _setup() {
    if (this.scene) return;
    const s = this.size; this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xf4f6ff, 0x30343c, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(0.8, 1.2, 1.6); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.9); fill.position.set(-1.4, 0.2, 1.0); this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xfff0dd, 1.2); rim.position.set(0, 1, -1.5); this.scene.add(rim);
    this.cam = new THREE.PerspectiveCamera(24, 1, 0.05, 5);
    this.rt = new THREE.WebGLRenderTarget(s, s, { samples: 0 }); this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.px = new Uint8Array(s * s * 4);
    this.cv = typeof document !== 'undefined' ? document.createElement('canvas') : null; if (this.cv) { this.cv.width = this.cv.height = s; this.cx = this.cv.getContext('2d'); }
  }
  /** synchronous render of one person; returns the data URL (or null if the model is not available) */
  renderNow(p) {
    const k = this.key(p); if (k == null) return null; if (this.cache.has(k)) return this.cache.get(k);
    const R = this.renderer; if (!R || typeof document === 'undefined') { this.failed.add(k); return null; }
    const t0 = performance.now(); this._setup(); let g = null;
    try {
      g = makeHuman({ person: p, kind: p.body, rank: p.rank, uniform: p.uniform, shadow: false }); if (!g) { this.failed.add(k); return null; }
      const H = g.userData.human; H.play('idle', { fade: 0 }); H.mixer.update(0.4); H.face?.({ LeftUpperLidOpen: 0.2, RightUpperLidOpen: 0.2 });
      this.scene.add(g); g.updateMatrixWorld(true);
      const head = H.bones.Head, hp = new THREE.Vector3(); if (head) head.getWorldPosition(hp); else hp.set(0, (H.height || 1.7) - 0.12, 0);
      const q = new THREE.Quaternion(); if (head) g.getWorldQuaternion(q);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);   // the models face +Z
      const tgt = hp.clone().add(new THREE.Vector3(0, 0.0, 0));
      this.cam.position.copy(tgt).addScaledVector(fwd, 0.92).add(new THREE.Vector3(0.06, 0.02, 0)); this.cam.lookAt(tgt.x, tgt.y - 0.03, tgt.z);
      // render into our own target, keeping the renderer's state intact
      const prevT = R.getRenderTarget(), prevC = new THREE.Color(), prevA = R.getClearAlpha(); R.getClearColor(prevC); const prevAuto = R.autoClear, prevShadow = R.shadowMap.autoUpdate;
      R.shadowMap.autoUpdate = false; R.setRenderTarget(this.rt); R.setClearColor(0x16202e, 1); R.autoClear = true; R.clear(); R.render(this.scene, this.cam);
      R.readRenderTargetPixels(this.rt, 0, 0, this.size, this.size, this.px);
      R.setRenderTarget(prevT); R.setClearColor(prevC, prevA); R.autoClear = prevAuto; R.shadowMap.autoUpdate = prevShadow;
      const url = this._encode(); this.cache.set(k, url); this.stats.rendered++; this._patch(k, url); return url;
    } catch (e) { console.warn('portrait failed', e); this.failed.add(k); return null; }
    finally { if (g) { this.scene.remove(g); g.traverse(o => { if (o.isMesh && o.material?.dispose) o.material.dispose(); }); }   /* materials are per-human clones; geometry/textures stay shared with the cache */ this.stats.ms += performance.now() - t0; }
  }
  // flip Y, grey-world white balance (half strength, sampled on the centre where the face is), soft vignette, then a data URL
  _encode() {
    const s = this.size, src = this.px, img = this.cx.createImageData(s, s), d = img.data; let r = 0, gg = 0, b = 0, n = 0;
    for (let y = s * 0.3 | 0; y < s * 0.75; y++) for (let x = s * 0.3 | 0; x < s * 0.7; x++) { const i = (y * s + x) * 4; r += src[i]; gg += src[i + 1]; b += src[i + 2]; n++; }
    const avg = (r + gg + b) / (3 * n || 1), kr = 1 + ((avg / (r / n || 1)) - 1) * 0.5, kg = 1 + ((avg / (gg / n || 1)) - 1) * 0.5, kb = 1 + ((avg / (b / n || 1)) - 1) * 0.5;
    const ex = Math.min(1.6, Math.max(0.9, 118 / (avg || 1)));   // keep faces readable whatever the light
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const i = ((s - 1 - y) * s + x) * 4, o = (y * s + x) * 4, vx = x / s - 0.5, vy = y / s - 0.45, v = 1 - Math.min(0.35, (vx * vx + vy * vy) * 0.9);
      d[o] = Math.min(255, src[i] * kr * ex * v); d[o + 1] = Math.min(255, src[i + 1] * kg * ex * v); d[o + 2] = Math.min(255, src[i + 2] * kb * ex * v); d[o + 3] = 255;
    }
    this.cx.putImageData(img, 0, 0); return this.cv.toDataURL('image/png');
  }
  _patch(k, url) { if (typeof document === 'undefined') return; for (const el of document.querySelectorAll(`img[data-pid="${k}"]`)) el.src = url; }
}
