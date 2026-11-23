// Live crew portraits: a small headshot rendered from each person's actual model (js/humans.js makeHuman), framed on the
// Head bone by a tiny dedicated camera into a render target, white-balanced, cached per person id as a data URL.
// Lazy: get(person) queues a render and returns the cached URL or null; tick() renders a few per frame; a placeholder
// silhouette in the person's department colour stands in meanwhile. <img data-pid> elements are patched when ready.
// Used by the radio contact cards, the duty/order/delegate pickers, the comm log, the wheel and (later) conversations.
//   const PT = new Portraits({ renderer, size: 128 })
//   PT.get(person) -> url | null      PT.url(person) -> url or placeholder      PT.img(person, px, cls) -> '<img …>'
//   PT.tick(max = 2)                  PT.renderNow(person) -> url (synchronous; tests)      PT.renderMany([people]) -> [url]      PT.clear()
import * as THREE from 'three';
import { makeHuman, releaseHuman } from './humans.js';

import { DEPT_COL, DEPT_LETTER, deptCol } from './icons.js';
export { DEPT_COL, DEPT_LETTER, deptCol };

/** placeholder: uniform-coloured silhouette (procedural from the person id) as an SVG data URL */
export function silhouette(p) {
  const c = deptCol(p), id = p?.id ?? 0, sk = ['#d8b99a', '#b98a67', '#8d5f43', '#e6cdb3'][id % 4], hr = ['#2a2018', '#5a3b22', '#c9c2b0', '#111'][(id >> 2) % 4];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0d1522"/><path d="M5 64c0-14 11-21 27-21s27 7 27 21z" fill="${c}" opacity=".9"/><rect x="28" y="36" width="8" height="11" fill="${sk}"/><ellipse cx="32" cy="26" rx="10.5" ry="12" fill="${sk}"/><path d="M21.5 24C21 14 26 11.5 32 11.5S43 14 42.5 24C40 19 36 18 32 18S24 19 21.5 24z" fill="${hr}"/></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

const COLS = 4, ROWS = 2;   // heads per GPU readback (atlas tiles)
export class Portraits {
  constructor({ renderer = null, size = 128 } = {}) {
    this.renderer = renderer; this.size = size; this.cache = new Map(); this.queue = []; this.failed = new Set(); this.stats = { rendered: 0, ms: 0 };
  }
  key(p) { return p?.id ?? p?.short ?? null; }
  get(p) { const k = this.key(p); if (k == null) return null; const u = this.cache.get(k); if (u) return u; if (!this.failed.has(k) && !this.queue.includes(p)) this.queue.push(p); return null; }
  url(p) { return this.get(p) || silhouette(p); }
  img(p, px = 54, cls = 'pt') { return `<img class="${cls}" data-pid="${this.key(p)}" src="${this.url(p)}" width="${px}" height="${px}" alt="" draggable="false">`; }
  clear() { this.cache.clear(); this.queue.length = 0; this.failed.clear(); }
  /** render up to `max` queued portraits (call once per frame; also runs while the world is paused); one GPU readback for all of them */
  tick(max = 2) { const list = []; while (this.queue.length && list.length < max) { const p = this.queue.shift(); if (!this.cache.has(this.key(p)) && !list.includes(p)) list.push(p); } if (list.length) this.renderMany(list); return list.length; }
  _setup() {
    if (this.scene) return;
    const s = this.size; this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xf4f6ff, 0x30343c, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(0.8, 1.2, 1.6); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.9); fill.position.set(-1.4, 0.2, 1.0); this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xfff0dd, 1.2); rim.position.set(0, 1, -1.5); this.scene.add(rim);
    this.cam = new THREE.PerspectiveCamera(24, 1, 0.05, 5);
    // an atlas of COLS x ROWS tiles: a batch of heads is drawn into it (one viewport per head) and read back with ONE readPixels (each readback is a full GPU stall)
    this.rt = new THREE.WebGLRenderTarget(s * COLS, s * ROWS, { samples: 0 }); this.rt.texture.colorSpace = THREE.SRGBColorSpace; this.rt.scissorTest = true;
    this.px = new Uint8Array(s * COLS * s * ROWS * 4);
    this.cv = typeof document !== 'undefined' ? document.createElement('canvas') : null; if (this.cv) { this.cv.width = this.cv.height = s; this.cx = this.cv.getContext('2d'); }
  }
  /** synchronous render of one person; returns the data URL (or null if the model is not available) */
  renderNow(p) { const k = this.key(p); if (k == null) return null; if (this.cache.has(k)) return this.cache.get(k); return this.renderMany([p])[0]; }
  /** synchronous render of several people (up to COLS x ROWS per GPU readback); returns their data URLs (null where the model is not available) */
  renderMany(list) {
    const out = [], B = COLS * ROWS;
    for (let i0 = 0; i0 < list.length; i0 += B) out.push(...this._batch(list.slice(i0, i0 + B)));
    return out;
  }
  _batch(list) {
    const R = this.renderer, s = this.size, out = list.map(p => this.cache.get(this.key(p)) ?? null);
    if (!R || typeof document === 'undefined') { for (const p of list) { const k = this.key(p); if (k != null && !this.cache.has(k)) this.failed.add(k); } return out; }
    const t0 = performance.now(); this._setup(); const drawn = [], mats = [];
    const prevT = R.getRenderTarget(), prevC = new THREE.Color(), prevA = R.getClearAlpha(); R.getClearColor(prevC); const prevAuto = R.autoClear, prevShadow = R.shadowMap.autoUpdate;
    try {
      R.shadowMap.autoUpdate = false; R.setClearColor(0x16202e, 1); R.autoClear = true;
      for (let j = 0; j < list.length; j++) {
        const p = list[j], k = this.key(p); if (k == null || this.cache.has(k) || drawn.some(d => d[1] === k)) continue; let g = null;
        try {
          g = makeHuman({ person: p, kind: p.body, rank: p.rank, uniform: p.uniform, shadow: false }); if (!g) { this.failed.add(k); continue; }
          const H = g.userData.human; H.play('idle', { fade: 0 }); H.mixer.update(0.4); H.face?.({ LeftUpperLidOpen: 0.2, RightUpperLidOpen: 0.2 });
          this.scene.add(g); g.updateMatrixWorld(true);
          const head = H.bones.Head, hp = new THREE.Vector3(); if (head) head.getWorldPosition(hp); else hp.set(0, (H.height || 1.7) - 0.12, 0);
          const q = new THREE.Quaternion(); if (head) g.getWorldQuaternion(q);
          const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);   // the models face +Z
          const tgt = hp.clone();
          this.cam.position.copy(tgt).addScaledVector(fwd, 0.92).add(new THREE.Vector3(0.06, 0.02, 0)); this.cam.lookAt(tgt.x, tgt.y - 0.03, tgt.z);
          const t = drawn.length, x = (t % COLS) * s, y = Math.floor(t / COLS) * s;
          this.rt.viewport.set(x, y, s, s); this.rt.scissor.set(x, y, s, s); R.setRenderTarget(this.rt); R.clear(); R.render(this.scene, this.cam);   // our own target; the renderer's state is restored below
          drawn.push([j, k, x, y]);
        } catch (e) { console.warn('portrait failed', e); this.failed.add(k); }
        finally { if (g) { this.scene.remove(g); releaseHuman(g); g.traverse(o => { if (o.isMesh && o.material?.dispose) mats.push(o.material); }); } }
      }
      if (drawn.length) {
        const rows = Math.ceil(drawn.length / COLS), w = s * Math.min(COLS, drawn.length);
        R.readRenderTargetPixels(this.rt, 0, 0, w, s * rows, this.px);
        for (const [j, k, x, y] of drawn) { const url = this._encode(w, x, y); this.cache.set(k, url); this.stats.rendered++; this._patch(k, url); out[j] = url; }
      }
    } catch (e) { console.warn('portrait batch failed', e); for (const [, k] of drawn) if (!this.cache.has(k)) this.failed.add(k); }
    finally {
      R.setRenderTarget(prevT); R.setClearColor(prevC, prevA); R.autoClear = prevAuto; R.shadowMap.autoUpdate = prevShadow;
      // materials are per-human clones (geometry / textures stay shared with the cache). The PREVIOUS batch's are disposed only now: the portrait scene's lights differ from
      // the game's, so these shader programs are used by portrait heads alone; disposing each clone right after its render dropped the programs' use count to 0, three.js
      // deleted them, and every portrait recompiled the skin / hair / garment / eye shaders (~1-2 s each on the software renderer; ~50 ms with the programs kept).
      for (const m of this._held || []) m.dispose(); this._held = mats;
      this.stats.ms += performance.now() - t0;
    }
    return out;
  }
  /** flip Y, grey-world white balance (half strength, sampled on the centre where the face is), soft vignette, then a data URL.
   *  Reads the s x s tile at (ox, oy) of the readback buffer, whose rows are `stride` pixels wide. */
  _encode(stride = this.size, ox = 0, oy = 0) {
    const s = this.size, src = this.px, img = this.cx.createImageData(s, s), d = img.data, at = (x, y) => ((oy + y) * stride + ox + x) * 4; let r = 0, gg = 0, b = 0, n = 0;
    for (let y = s * 0.3 | 0; y < s * 0.75; y++) for (let x = s * 0.3 | 0; x < s * 0.7; x++) { const i = at(x, y); r += src[i]; gg += src[i + 1]; b += src[i + 2]; n++; }
    const avg = (r + gg + b) / (3 * n || 1), kr = 1 + ((avg / (r / n || 1)) - 1) * 0.5, kg = 1 + ((avg / (gg / n || 1)) - 1) * 0.5, kb = 1 + ((avg / (b / n || 1)) - 1) * 0.5;
    const ex = Math.min(1.6, Math.max(0.9, 118 / (avg || 1)));   // keep faces readable whatever the light
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const i = at(x, s - 1 - y), o = (y * s + x) * 4, vx = x / s - 0.5, vy = y / s - 0.45, v = 1 - Math.min(0.35, (vx * vx + vy * vy) * 0.9);
      d[o] = Math.min(255, src[i] * kr * ex * v); d[o + 1] = Math.min(255, src[i + 1] * kg * ex * v); d[o + 2] = Math.min(255, src[i + 2] * kb * ex * v); d[o + 3] = 255;
    }
    this.cx.putImageData(img, 0, 0); return this.cv.toDataURL('image/png');
  }
  _patch(k, url) { if (typeof document === 'undefined') return; for (const el of document.querySelectorAll(`img[data-pid="${k}"]`)) el.src = url; }
}
