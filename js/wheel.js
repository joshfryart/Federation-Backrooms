// Quick wheel (hold Q / J / H / V, or LB on a pad): geometry + selection maths (pure, node-tested in tools/test-ui.mjs)
// and the DOM/SVG view. Visual spec: docs/mockups/menus.html tab "Wheels".
//
//   inner ring  = categories (8 fixed sectors, sector 0 at the top, clockwise)       R0..R1
//   outer ring  = the hovered category's choices, spread around its angle            R2..R3
//   hub         = label + one-line description; dead zone (DZ) = cancel on release
//   direct      = a single category's choices as the main ring (J/H/V hold: bigger targets, no outer ring)
// Items: { id, icon, label, desc, off, def, col, kids:[items], run() }.  A dot marks each category's default choice.
// Selection state W: { sectors, direct, title, sel, sub, vx, vy, held, pinned, moved, digit }.
import { iconPath } from './icons.js';

export const R0 = 62, R1 = 150, R2 = 158, R3 = 206, DZ = 38, VIEW = 680, CUR_MAX = 240;
const rad = (d) => d * Math.PI / 180;
export const pol = (r, a) => [r * Math.cos(rad(a)), r * Math.sin(rad(a))];
/** centre angle (deg, 0 = +x, clockwise on screen) of sector i of n; sector 0 points up */
export const sectorAngle = (i, n) => -90 + i * 360 / n;
/** SVG path of an annulus segment from angle a0 to a1 (degrees) */
export function ann(r0, r1, a0, a1) {
  const [x0, y0] = pol(r1, a0), [x1, y1] = pol(r1, a1), [x2, y2] = pol(r0, a1), [x3, y3] = pol(r0, a0), L = a1 - a0 > 180 ? 1 : 0, f = (v) => v.toFixed(1);
  return `M${f(x0)} ${f(y0)}A${r1} ${r1} 0 ${L} 1 ${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}A${r0} ${r0} 0 ${L} 0 ${f(x3)} ${f(y3)}z`;
}
/** outer-ring layout for n kids around parent angle pa: total span (<= 176 deg), start angle, width per kid */
export function kidLayout(n, pa) { const span = Math.min(n * 34, 176); return { span, start: pa - span / 2, w: span / Math.max(1, n) }; }
/** which sector index a direction (vx, vy) points into, ignoring radius */
export function sectorAt(vx, vy, n) { const seg = 360 / n, a = Math.atan2(vy, vx) * 180 / Math.PI; return Math.floor((((a + 90 + seg / 2) % 360) + 360) % 360 / seg) % n; }
/** keep a virtual cursor inside the wheel (mouse deltas under pointer lock) */
export function clampCursor(vx, vy, max = CUR_MAX) { const r = Math.hypot(vx, vy); return r > max ? [vx * max / r, vy * max / r] : [vx, vy]; }
/** hit test in wheel units: { sel, sub } (-1 = none). The outer ring only answers for the sector already selected. */
export function hitTest(W, vx, vy) {
  const n = W.sectors.length, r = Math.hypot(vx, vy); if (!n || r < DZ) return { sel: -1, sub: -1 };
  const k = sectorAt(vx, vy, n), P = W.sectors[W.sel];
  if (!W.direct && W.sel >= 0 && P?.kids?.length && r > R1 + 8) {
    const pa = sectorAngle(W.sel, n), L = kidLayout(P.kids.length, pa), a = Math.atan2(vy, vx) * 180 / Math.PI, rel = ((a - pa + 540) % 360) - 180;
    if (Math.abs(rel) > L.span / 2 + 5) return { sel: W.sel, sub: -1 };
    return { sel: W.sel, sub: Math.max(0, Math.min(P.kids.length - 1, Math.floor((rel + L.span / 2) / L.w))) };
  }
  return { sel: k, sub: -1 };
}
/** the default kid of a category: the one flagged def, else the first usable one */
export const defaultKid = (P) => P?.kids?.find(k => k.def && !k.off) || P?.kids?.find(k => !k.off) || null;
/** what releasing / clicking now would run (null = cancel or unavailable) */
export function pickItem(W) {
  const P = W.sectors[W.sel]; if (!P || P.off) return null;
  let it = W.direct ? P : P.kids?.length ? (W.sub >= 0 ? P.kids[W.sub] : defaultKid(P)) : P;
  return it && !it.off ? it : null;
}
/** move the selection to the cursor; returns true when it changed */
export function moveTo(W, vx, vy) { W.vx = vx; W.vy = vy; if (Math.hypot(vx, vy) > 14) W.moved = true; const h = hitTest(W, vx, vy); const ch = h.sel !== W.sel || h.sub !== W.sub; W.sel = h.sel; W.sub = h.sub; return ch; }
/** digits: first picks a category, second picks a choice; the same digit twice = the default. Returns the item to run, or null (wait for more). */
export function digitPick(W, d) {
  const i = d - 1; if (W.direct) { if (i >= 0 && i < W.sectors.length) { W.sel = i; return pickItem(W) || 'off'; } return null; }
  if (W.digit == null) { if (i < 0 || i >= W.sectors.length) return null; W.digit = d; W.sel = i; W.sub = -1; const P = W.sectors[i]; if (!P.kids?.length) return pickItem(W) || 'off'; return null; }
  const P = W.sectors[W.sel]; W.digit = null;
  if (d === W.sel + 1) { W.sub = -1; return pickItem(W) || 'off'; }   // same digit twice = the category's default
  if (P?.kids && i >= 0 && i < P.kids.length) { W.sub = i; return pickItem(W) || 'off'; }
  return null;
}
/** gamepad / arrow keys: step the selection around the ring */
export function stepSel(W, dir) { const n = W.sectors.length; if (!n) return; if (W.sel >= 0 && !W.direct && W.sub >= 0) { const P = W.sectors[W.sel]; W.sub = (W.sub + dir + P.kids.length) % P.kids.length; return; } W.sel = W.sel < 0 ? 0 : (W.sel + dir + n) % n; W.sub = -1; }
export function newWheel(sectors, o = {}) { return { sectors, direct: !!o.direct, title: o.title || '', kind: o.kind || 'main', sel: -1, sub: -1, vx: 0, vy: 0, held: !!o.held, pinned: !o.held, moved: false, digit: null, t0: o.t0 ?? 0 }; }

// ------------------------------------------------------------------------------------------------ view
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CSS = `
#ui-wheel{position:fixed;inset:0;z-index:12;display:none;align-items:center;justify-content:center;background:radial-gradient(circle at center,rgba(2,4,8,.72) 0 28%,rgba(2,4,8,.35) 70%);font-family:var(--f-d,Arial)}
#ui-wheel.on{display:flex}#ui-wheel svg.wv{height:min(96vh,96vw);width:auto;max-width:100%;touch-action:none;overflow:visible}
#ui-wheel .wseg{fill:rgba(9,14,24,.88);stroke:rgba(150,180,210,.35);stroke-width:1;cursor:pointer}#ui-wheel .wseg.hov{fill:rgba(242,160,61,.92);stroke:#ffd9a0}
#ui-wheel .wseg.off{fill:rgba(9,14,24,.5);stroke-dasharray:3 3}#ui-wheel .wseg.ctx{stroke:#ffe9a8}
#ui-wheel .wkid{fill:rgba(12,20,34,.92);stroke:rgba(88,201,185,.55);stroke-width:1;cursor:pointer}#ui-wheel .wkid.hov{fill:rgba(88,201,185,.95);stroke:#fff}#ui-wheel .wkid.off{fill:rgba(9,14,24,.5);stroke-dasharray:3 3}
#ui-wheel .wic{fill:none;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
#ui-wheel .wnum{fill:#06090f}#ui-wheel .wnumt{fill:#ffd9a0;font:700 10px var(--f-m,monospace);text-anchor:middle;dominant-baseline:central;pointer-events:none}
#ui-wheel .wlab{fill:#cfe0f0;font:700 11px var(--f-d,Arial);letter-spacing:.06em;text-transform:uppercase;pointer-events:none}#ui-wheel .wlab.hov{fill:#08101a}#ui-wheel .wlab.kid.hov{fill:#fff}#ui-wheel .wlab.off{fill:#6b7b90}
#ui-wheel .whub{fill:rgba(5,8,14,.95);stroke:rgba(150,180,210,.4)}#ui-wheel .wt1{fill:#ffd9a0;font:800 13px var(--f-d,Arial);letter-spacing:.14em;text-anchor:middle;text-transform:uppercase}
#ui-wheel .wt2{fill:#9fb2c8;font:10px 'Helvetica Neue',Arial,sans-serif;text-anchor:middle}#ui-wheel .wdz{fill:none;stroke:rgba(150,180,210,.2);stroke-dasharray:2 4}#ui-wheel .wcur{fill:#ffe9a8;stroke:#000;stroke-width:1}
#ui-wheel .wpt{pointer-events:none}`;
const icoG = (name, x, y, s, color, sw = 1.6) => `<g class="wic" transform="translate(${(x - s / 2).toFixed(1)} ${(y - s / 2).toFixed(1)}) scale(${(s / 24).toFixed(3)})" stroke="${color}" stroke-width="${sw}"><path d="${iconPath(name)}"/></g>`;

/** SVG markup for a wheel state (viewBox -340 -340 680 680). opts.portrait(person) -> data URL for person kids. */
export function wheelSVG(W, opts = {}) {
  const sec = W.sectors, n = sec.length, seg = 360 / Math.max(1, n), gap = n > 1 ? 1.4 : 0; let s = `<circle class="wdz" r="${DZ}"/>`;
  sec.forEach((c, i) => {
    const a = sectorAngle(i, n), hov = i === W.sel, col = hov ? '#08101a' : c.off ? '#5a6b82' : c.col || '#dfe9f5';
    s += `<path class="wseg${hov ? ' hov' : ''}${c.off ? ' off' : ''}${c.ctx ? ' ctx' : ''}" data-i="${i}" d="${n === 1 ? ann(R0, R1, -179.9, 179.9) : ann(R0, R1, a - seg / 2 + gap, a + seg / 2 - gap)}"/>`;
    const [ix, iy] = pol((R0 + R1) / 2 + (W.direct ? 6 : 0), a);
    if (c.person && opts.portrait) { const u = opts.portrait(c.person); if (u) s += `<image class="wpt" href="${u}" x="${ix - 17}" y="${iy - 21}" width="34" height="34"/>`; else s += icoG(c.icon || 'person', ix, iy - 4, 34, col, 1.5); }
    else s += icoG(c.icon, ix, iy - 4, 34, col, 1.5);
    s += `<text class="wlab${hov ? ' hov' : ''}${c.off ? ' off' : ''}" x="${ix.toFixed(1)}" y="${(iy + 25).toFixed(1)}" text-anchor="middle" style="font-size:9.5px">${esc(String(c.label).slice(0, 14))}</text>`;
    const [nx, ny] = pol(R1 - 1, a); s += `<circle class="wnum" cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="8"/><text class="wnumt" x="${nx.toFixed(1)}" y="${(ny + 0.5).toFixed(1)}">${i + 1}</text>`;
    if (W.direct && c.def) { const [dx, dy] = pol(R0 + 7, a); s += `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="2.6" fill="${hov ? '#08101a' : '#ffe9a8'}"/>`; }
  });
  const P = sec[W.sel];
  if (P?.kids?.length && !W.direct) {
    const pa = sectorAngle(W.sel, n), L = kidLayout(P.kids.length, pa);
    P.kids.forEach((k, j) => {
      const a0 = L.start + j * L.w, a1 = a0 + L.w, am = (a0 + a1) / 2, hov = j === W.sub, col = hov ? '#08101a' : k.off ? '#5a6b82' : k.col || '#dfe9f5';
      s += `<path class="wkid${hov ? ' hov' : ''}${k.off ? ' off' : ''}" data-i="${W.sel}" data-j="${j}" d="${ann(R2, R3, a0 + 0.8, a1 - 0.8)}"/>`;
      const [kx, ky] = pol((R2 + R3) / 2, am);
      if (k.person && opts.portrait) { const u = opts.portrait(k.person); s += u ? `<image class="wpt" href="${u}" x="${(kx - 15).toFixed(1)}" y="${(ky - 15).toFixed(1)}" width="30" height="30"/>` : icoG('person', kx, ky, 22, col); }
      else s += icoG(k.icon, kx, ky, 22, col);
      if (k.def) { const [dx, dy] = pol(R2 + 4, am); s += `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="2.2" fill="${hov ? '#08101a' : '#ffe9a8'}"/>`; }
      const [lx, ly] = pol(R3 + 9, am), cx = Math.cos(rad(am)), sy = Math.sin(rad(am)), anc = cx > 0.3 ? 'start' : cx < -0.3 ? 'end' : 'middle';
      s += `<text class="wlab kid${hov ? ' hov' : ''}${k.off ? ' off' : ''}" x="${lx.toFixed(1)}" y="${(ly + (sy < -0.5 ? -1 : sy > 0.5 ? 9 : 3)).toFixed(1)}" text-anchor="${anc}">${esc(String(k.label).slice(0, 18))}</text>`;
      if (W.digit != null) { const [nx, ny] = pol(R3 - 9, am); s += `<circle cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="7.5" fill="#ffe9a8"/><text class="wnumt" style="fill:#06090f" x="${nx.toFixed(1)}" y="${(ny + 0.5).toFixed(1)}">${j + 1}</text>`; }
    });
  }
  // hub: label + description
  const cur = W.sel >= 0 ? (P?.kids?.length && W.sub >= 0 && !W.direct ? P.kids[W.sub] : P) : null;
  let t1 = W.title || '', t2 = W.pinned ? 'click an icon · Esc closes' : 'move to choose · release here = cancel';
  if (cur) { t1 = String(cur.label || '').toUpperCase(); t2 = cur.desc || cur.sub || ''; }
  if (P && P.kids?.length && W.sub < 0 && !W.direct) t2 = (P.sub ? P.sub + ' · ' : '') + (W.pinned ? 'click: ' : 'release = ') + String(defaultKid(P)?.label || '').toLowerCase();
  if (cur?.off) t2 = cur.why || 'unavailable right now';
  s += `<circle class="whub" r="${R0 - 6}"/><text class="wt1" y="-3" style="font-size:${t1.length > 11 ? 10.5 : 13}px">${esc(t1.length > 16 ? t1.slice(0, 15) + '…' : t1)}</text>`;
  const words = String(t2).split(' '); let l1 = '', l2 = ''; for (const w of words) { if ((l1 + ' ' + w).length < 22 && !l2) l1 += (l1 ? ' ' : '') + w; else l2 += (l2 ? ' ' : '') + w; }
  s += `<text class="wt2" y="12">${esc(l1)}</text><text class="wt2" y="24">${esc(l2.length > 24 ? l2.slice(0, 23) + '…' : l2)}</text>`;
  if (W.held) { const [cx, cy] = clampCursor(W.vx, W.vy, R3 + 34); s += `<circle class="wcur" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4"/>`; }
  return s;
}

/** The overlay element. onPick(item) runs a choice; onHover() lets the owner re-render. Click / hover only matter when pinned. */
export class WheelView {
  constructor({ onPick, portrait } = {}) {
    this.onPick = onPick; this.portrait = portrait; this.W = null;
    if (typeof document === 'undefined') return;
    if (!document.getElementById('ui-wheel-css')) { const st = document.createElement('style'); st.id = 'ui-wheel-css'; st.textContent = CSS; document.head.appendChild(st); }
    this.el = document.createElement('div'); this.el.id = 'ui-wheel'; this.el.className = 'ui-layer'; this.el.setAttribute('role', 'menu'); this.el.setAttribute('aria-label', 'Quick wheel');
    this.el.innerHTML = `<svg class="wv" viewBox="${-VIEW / 2} ${-VIEW / 2} ${VIEW} ${VIEW}"></svg>`; document.body.appendChild(this.el); this.svg = this.el.firstChild;
    this.el.addEventListener('mousemove', (e) => { if (!this.W?.pinned) return; const [vx, vy] = this.toView(e.clientX, e.clientY); if (moveTo(this.W, vx, vy)) this.render(); });
    this.el.addEventListener('mousedown', (e) => { e.stopPropagation(); if (!this.W?.pinned) return; const [vx, vy] = this.toView(e.clientX, e.clientY); moveTo(this.W, vx, vy); const P = this.W.sectors[this.W.sel];
      // clicking a category with an outer ring just opens the ring; clicking a choice (or a leaf category) runs it; clicking the hub/background cancels
      if (this.W.sel < 0) { this.onPick?.(null); return; }
      if (!this.W.direct && P?.kids?.length && this.W.sub < 0 && Math.hypot(vx, vy) <= R1 + 8) { this.render(); return; }
      this.onPick?.(pickItem(this.W) || (P?.off || (this.W.sub >= 0 && P.kids[this.W.sub]?.off) ? 'off' : null)); });
  }
  toView(x, y) { const r = this.svg.getBoundingClientRect(), sc = VIEW / (r.width || 1); return [(x - r.left - r.width / 2) * sc, (y - r.top - r.height / 2) * sc]; }
  show(W) { this.W = W; if (!this.el) return; this.el.classList.add('on'); this.render(); }
  hide() { this.W = null; this.el?.classList.remove('on'); }
  render() { if (this.el && this.W) this.svg.innerHTML = wheelSVG(this.W, { portrait: this.portrait }); }
  destroy() { this.el?.remove(); }
}
