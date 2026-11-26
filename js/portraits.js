// Live crew portraits: a small headshot rendered from each person's actual model (js/humans.js makeHuman), framed on the
// Head bone by a tiny dedicated camera into a render target, white-balanced, cached per person id as a data URL.
// Lazy: get(person) queues a render and returns the cached URL or null; tick() renders a few per frame; a placeholder
// silhouette in the person's department colour stands in meanwhile. <img data-pid> elements are patched when ready.
// Used by the radio contact cards, the duty/order/delegate pickers, the comm log, the wheel and (later) conversations.
//   const PT = new Portraits({ renderer, size: 128 })
//   PT.get(person) -> url | null      PT.url(person) -> url or placeholder      PT.img(person, px, cls) -> '<img …>'
//   PT.tick(max = 2)                  PT.renderNow(person) -> url (synchronous; tests)      PT.clear()
//   PT.renderMany(people, budgetMs) -> [{ p, url }] (one atlas, one GPU readback; the boarding screen)
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

export class Portraits {
  static ATLAS = 8;   // faces per side of the batch atlas: 8 x 8 tiles of `size` px, read back in one go
  constructor({ renderer = null, size = 128 } = {}) {
    this.renderer = renderer; this.size = size; this.cache = new Map(); this.queue = []; this.failed = new Set(); this.stats = { rendered: 0, ms: 0, make: 0, draw: 0, read: 0, read1: 0, reads: 0, enc: 0 };   // ms totals per stage (tools/loadtime.mjs)
  }
  key(p) { return p?.id ?? p?.short ?? null; }
  get(p) { const k = this.key(p); if (k == null) return null; const u = this.cache.get(k); if (u) return u; if (!this.failed.has(k) && !this.queue.includes(p)) this.queue.push(p); return null; }
  url(p) { return this.get(p) || silhouette(p); }
  img(p, px = 54, cls = 'pt') { return `<img class="${cls}" data-pid="${this.key(p)}" src="${this.url(p)}" width="${px}" height="${px}" alt="" draggable="false">`; }
  clear() { this.cache.clear(); this.queue.length = 0; this.failed.clear(); }
  /** render up to `max` queued portraits (call once per frame; also runs while the world is paused) */
  tick(max = 2) { const todo = []; while (this.queue.length && todo.length < max) { const p = this.queue.shift(); if (!this.cache.has(this.key(p))) todo.push(p); } if (todo.length) this.renderMany(todo); return todo.length; }
  _setup() {
    if (this.scene) return;
    const s = this.size; this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xf4f6ff, 0x30343c, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(0.8, 1.2, 1.6); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.9); fill.position.set(-1.4, 0.2, 1.0); this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xfff0dd, 1.2); rim.position.set(0, 1, -1.5); this.scene.add(rim);
    this.cam = new THREE.PerspectiveCamera(24, 1, 0.05, 5);
    const W = Portraits.ATLAS * s; this.atlas = new THREE.WebGLRenderTarget(W, W, { samples: 0 }); this.atlas.texture.colorSpace = THREE.SRGBColorSpace;
    this.px = new Uint8Array(W * W * 4);
    this.cv = typeof document !== 'undefined' ? document.createElement('canvas') : null; if (this.cv) { this.cv.width = this.cv.height = s; this.cx = this.cv.getContext('2d'); }
  }
  /** synchronous render of one person; returns the data URL (or null if the model is not available) */
  renderNow(p) { const k = this.key(p); if (k == null) return null; if (this.cache.has(k)) return this.cache.get(k); return this.renderMany([p], Infinity, 1)[0]?.url ?? null; }
  /**
   * Render several people in one go: each face is drawn into its own tile of one atlas render target and the whole atlas is read back ONCE. A readback is a
   * full GPU sync (the CPU waits for every queued command to finish), so one per face meant ~90 pipeline stalls while boarding; one per batch keeps the GPU busy.
   * Stops after `budgetMs` of CPU time or `max` faces (at least one is drawn). Returns one { p, url } per person it got to, in no particular order (url null when one failed), so out.length is how far into `list` it got.
   */
  renderMany(list, budgetMs = Infinity, max = Portraits.ATLAS * Portraits.ATLAS) {
    const R = this.renderer, out = [], t0 = performance.now(); if (!R || typeof document === 'undefined') { for (const p of list.slice(0, max)) { const k = this.key(p); if (k != null) this.failed.add(k); out.push({ p, url: null }); } return out; }
    this._setup(); const s = this.size, A = Portraits.ATLAS, rt = this.atlas, tiles = [];
    const prevT = R.getRenderTarget(), prevC = new THREE.Color(), prevA = R.getClearAlpha(); R.getClearColor(prevC); const prevAuto = R.autoClear, prevShadow = R.shadowMap.autoUpdate;
    R.shadowMap.autoUpdate = false; R.setClearColor(0x16202e, 1); R.autoClear = true;
    try {
      for (let i = 0; i < list.length && tiles.length < Math.min(max, A * A); i++) {
        if (tiles.length && performance.now() - t0 >= budgetMs) break;
        const p = list[i], k = this.key(p); if (k == null) { out.push({ p, url: null }); continue; } if (this.cache.has(k)) { out.push({ p, url: this.cache.get(k) }); continue; }
        const f0 = performance.now(); let g = null;
        try {
          g = makeHuman({ person: p, kind: p.body, rank: p.rank, uniform: p.uniform, shadow: false }); if (!g) { this.failed.add(k); out.push({ p, url: null }); continue; }
          const f1 = performance.now(); this.stats.make += f1 - f0;
          const H = g.userData.human; H.play('idle', { fade: 0 }); H.mixer.update(0.4); H.face?.({ LeftUpperLidOpen: 0.2, RightUpperLidOpen: 0.2 });
          this.scene.add(g); g.updateMatrixWorld(true);
          const head = H.bones.Head, hp = new THREE.Vector3(); if (head) head.getWorldPosition(hp); else hp.set(0, (H.height || 1.7) - 0.12, 0);
          const q = new THREE.Quaternion(); if (head) g.getWorldQuaternion(q);
          const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);   // the models face +Z
          this.cam.position.copy(hp).addScaledVector(fwd, 0.92).add(new THREE.Vector3(0.06, 0.02, 0)); this.cam.lookAt(hp.x, hp.y - 0.03, hp.z);
          // into this face's tile of the atlas (viewport + scissor, so the clear only touches the tile)
          const n = tiles.length, x = (n % A) * s, y = Math.floor(n / A) * s; rt.viewport.set(x, y, s, s); rt.scissor.set(x, y, s, s); rt.scissorTest = true;
          R.setRenderTarget(rt); R.clear(); R.render(this.scene, this.cam);
          this.stats.draw += performance.now() - f1; tiles.push({ p, k, x, y });
        } catch (e) { console.warn('portrait failed', e); this.failed.add(k); out.push({ p, url: null }); }
        finally { if (g) { this.scene.remove(g); releaseHuman(g); g.traverse(o => { if (o.isMesh && o.material?.dispose && !o.material.userData?.shared && !this._keep(o.material)) o.material.dispose(); }); }   /* materials are per-human clones; geometry/textures stay shared with the cache (GL keeps anything a queued draw still uses alive) */ }
      }
      if (tiles.length) {
        const rows = Math.ceil(tiles.length / A), W = Math.min(tiles.length, A) * s /* only the used tiles: a single face reads back one tile */, t2 = performance.now(), full = A * s; rt.viewport.set(0, 0, full, full); rt.scissor.set(0, 0, full, full); rt.scissorTest = false;
        R.readRenderTargetPixels(rt, 0, 0, W, rows * s, this.px); const t3 = performance.now(); this.stats.read += t3 - t2; if (!this.stats.reads++) this.stats.read1 = t3 - t2;
        for (const t of tiles) { const url = this._encode(this.px, W, t.x, t.y); this.cache.set(t.k, url); this.stats.rendered++; this._patch(t.k, url); out.push({ p: t.p, url }); }
        this.stats.enc += performance.now() - t3;
      }
    } catch (e) { console.warn('portrait batch failed', e); for (const t of tiles) if (!this.cache.has(t.k)) { this.failed.add(t.k); out.push({ p: t.p, url: null }); } }
    finally { R.setRenderTarget(prevT); R.setClearColor(prevC, prevA); R.autoClear = prevAuto; R.shadowMap.autoUpdate = prevShadow; this.stats.ms += performance.now() - t0; }
    return out;
  }
  // Disposing the last material that uses a GL program deletes the program (three.js counts users), so every portrait used to compile and link its whole shader set
  // again (the portrait scene's four lights make programs of its own that no world material keeps alive): ~1 s a face on SwiftShader. One material per program is kept
  // (never disposed, a few dozen at most), which keeps that program cached for the next face.
  _keep(m) {
    const prog = this.renderer?.properties?.get(m)?.currentProgram; if (!prog) return false; const k = prog.cacheKey ?? prog.id;
    this.kept = this.kept || new Map(); if (this.kept.has(k)) return false; this.kept.set(k, m); return true;
  }
  // flip Y, grey-world white balance (half strength, sampled on the centre where the face is), soft vignette, then a data URL
  _encode(src, W, ox, oy) {   // the tile at (ox, oy) of a W-pixel-wide readback (rows bottom-up, as GL returns them)
    const s = this.size, img = this.cx.createImageData(s, s), d = img.data, at = (x, y) => ((oy + y) * W + ox + x) * 4; let r = 0, gg = 0, b = 0, n = 0;
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
