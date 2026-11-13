// Always-visible crew name tags (Systems Nominal): a small floating label over simmed crew you are near or looking at:
// department colour bar + letter, rank pips, short name. Cheap: a pooled set of DOM tags (capped), the candidate list
// is refreshed at ~8 Hz (distance, facing, line of sight), positions are projected every frame.
//   const T = new NameTags({ max: 6 });  T.update(dt, { camera, ents, P, world, show })
import * as THREE from 'three';
import { RANKS } from './data.js';
import { deptCol, DEPT_LETTER } from './icons.js';

const CSS = `.ntag{--c:#9db2c8;position:fixed;left:0;top:0;z-index:4;pointer-events:none;display:none;align-items:center;gap:4px;padding:1px 6px 1px 0;background:rgba(5,8,14,.62);border-left:3px solid var(--c);font:700 10px/14px var(--f-d,Arial);letter-spacing:.06em;color:#eef4fb;white-space:nowrap;text-shadow:0 1px 2px #000;transform:translate(-50%,-100%);will-change:transform}
.ntag b{font:700 9px var(--f-m,monospace);color:var(--c);padding-left:4px}.ntag i{display:inline-flex;gap:1.5px}.ntag i s{width:5px;height:5px;transform:rotate(45deg);background:#ffd25e;display:inline-block}.ntag i s.h{background:none;border:1px solid #ffd25e;width:4px;height:4px}
.ntag.look{font-size:11px;background:rgba(5,8,14,.82)}.ntag em{font-style:normal;font-weight:400;opacity:.7;font-size:9px}`;
export const pipsHTML = (rank) => { const r = RANKS[rank] || RANKS[0]; return '<s></s>'.repeat(r[1]) + '<s class="h"></s>'.repeat(r[2]); };

export class NameTags {
  constructor({ max = 6, near = 7, far = 16 } = {}) {
    Object.assign(this, { max, near, far }); this.pool = []; this.list = []; this.t = 0; this.v = new THREE.Vector3();
    if (typeof document === 'undefined') return;
    if (!document.getElementById('ntag-css')) { const st = document.createElement('style'); st.id = 'ntag-css'; st.textContent = CSS; document.head.appendChild(st); }
  }
  tag(i) { let el = this.pool[i]; if (!el) { el = document.createElement('div'); el.className = 'ntag'; document.body.appendChild(el); this.pool[i] = el; el._pid = null; } return el; }
  hideAll() { for (const el of this.pool) el.style.display = 'none'; this.list = []; }
  /** pick who gets a tag: near (and in front, in sight) or looked at further away */
  pick({ ents, P, world }) {
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), c = [];
    for (const e of ents) {
      if (e.kind !== 'crew' || !e.person || !e.mesh || e.fake || e.dying) continue;
      const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz); if (d > this.far || d < 0.3) continue;
      const dot = (dx * fx + dz * fz) / d; if (dot < 0.2) continue;
      const look = dot > 0.97 - Math.min(0.1, 0.25 / d); if (d > this.near && !look) continue;
      if (world?.los && !world.los(P.x, P.z, e.x, e.z)) continue;
      c.push({ e, d, look });
    }
    c.sort((a, b) => (b.look - a.look) || a.d - b.d); this.list = c.slice(0, this.max); return this.list;
  }
  update(dt, ctx) {
    if (typeof document === 'undefined') return;
    if (!ctx.show) { if (this.list.length || this.pool.some(e => e.style.display !== 'none')) this.hideAll(); return; }
    this.t -= dt; if (this.t <= 0) { this.t = 0.12; this.pick(ctx); }
    const cam = ctx.camera, W = innerWidth, H = innerHeight; let i = 0;
    for (const c of this.list) {
      const e = c.e, h = (e.mesh.userData.human?.height || 1.75) * (e.mesh.userData.human?.standing === false ? 0.72 : 1) + 0.28;
      this.v.set(e.x, (e.y || 0) + h, e.z).project(cam); if (this.v.z > 1 || Math.abs(this.v.x) > 1.1 || Math.abs(this.v.y) > 1.1) continue;
      const el = this.tag(i++), p = e.person;
      if (el._pid !== p.id || el._look !== c.look) { el._pid = p.id; el._look = c.look; el.style.setProperty('--c', deptCol(p)); el.className = 'ntag' + (c.look ? ' look' : ''); el.innerHTML = `<b>${DEPT_LETTER[p.dept] || '·'}</b><i>${pipsHTML(p.rank)}</i>${(p.short || '').replace(/[<>&]/g, '')}${c.look && p.title ? ` <em>${p.title.replace(/[<>&]/g, '')}</em>` : ''}`; }
      const sc = Math.max(0.75, Math.min(1.1, 3.2 / c.d));
      el.style.transform = `translate(${((this.v.x + 1) / 2 * W).toFixed(1)}px,${((1 - this.v.y) / 2 * H).toFixed(1)}px) translate(-50%,-100%) scale(${sc.toFixed(2)})`; el.style.display = 'flex';
    }
    for (; i < this.pool.length; i++) this.pool[i].style.display = 'none';
  }
  get shown() { return this.pool.filter(e => e.style.display !== 'none').length; }
  destroy() { for (const el of this.pool) el.remove(); this.pool = []; }
}
