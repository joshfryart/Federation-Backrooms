// Map drawing for Systems Nominal (canvas 2D only; shared by the HUD minimap, the M big map and the briefing flythrough).
// Spec: docs/mockups/nav-hud.html drawMap(). Tile space: x right, y = world z down; "ship forward" = up (-y).
//   bakeDeck(d, explored, sc, o)   static deck layer (floors tinted by room category, wall edges, room outlines, lift car) on an
//                                  offscreen canvas; "crew knows the ship": unexplored tiles are drawn faint, explored ones bright
//   drawBadge(g, type, x, y, s, o) room-type badge: category shape (hue AND shape) + white glyph
//   drawRoute(g, route, sc, t)     glow ribbon (halo, dark casing, cyan core, rounded corners) + dark chevrons flowing to the goal
//   drawRing(g, m, bs, t)          duty clock ring around a badge (arc = time left; due amber, late red + pulse; open task = full grey-blue)
//   drawLocal(g, s)                heading-up local crop around the player with markers, ribbon, cone, ping and edge pin
//   drawPlan(g, s)                 whole deck fitted into the canvas (big map / briefing); returns {sc, ox, oy}
import { ICONS, SHAPES, CATS, drawIcon } from './icons.js';
import { ROOM_CAT, along } from './nav.js';

export const ROUTE = '#8ef3ff', DUE = '#ffd23f', LATE = '#ff4d3d', IDLE = '#8fa0b6', DOING = '#5cc8ff', DONE = '#4fd18b';
export const catOf = (type) => CATS[ROOM_CAT[type]] || CATS.crew;
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const SP = {}; const shapePath = (n) => SP[n] || (SP[n] = new Path2D(SHAPES[n]));

export function drawBadge(g, type, x, y, s, o = {}) {
  const k = catOf(type), sh = shapePath(k.s);
  g.save(); g.translate(x - s / 2, y - s / 2); g.scale(s / 24, s / 24);
  g.fillStyle = 'rgba(12,18,32,.9)'; g.fill(sh); g.globalAlpha = o.dim ? 0.35 : 0.3; g.fillStyle = k.c; g.fill(sh);
  g.globalAlpha = o.dim ? 0.5 : 1; g.strokeStyle = k.c; g.lineWidth = 1.8; g.stroke(sh); g.restore();
  drawIcon(g, ICONS[type] ? type : 'door', x, y + s * 0.02, s * 0.54, o.dim ? '#7f90a8' : '#fff', Math.max(1.2, 2.2));
}
// clock ring around a badge: m = {frac, color, pulse, pinned}
export function drawRing(g, m, bs, t) {
  const rr = bs * 0.78; g.lineWidth = Math.max(2, bs * 0.14);
  g.strokeStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.arc(0, 0, rr, 0, 7); g.stroke();
  g.strokeStyle = m.color; g.beginPath(); g.arc(0, 0, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, Math.min(1, m.frac))); g.stroke();
  if (m.pulse) { g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 6); g.beginPath(); g.arc(0, 0, rr + bs * 0.2, 0, 7); g.lineWidth = 1.5; g.stroke(); g.globalAlpha = 1; }
  if (m.pinned) { g.fillStyle = ROUTE; g.beginPath(); g.moveTo(0, -rr - bs * 0.12); g.lineTo(-bs * 0.22, -rr - bs * 0.52); g.lineTo(bs * 0.22, -rr - bs * 0.52); g.fill(); }
}

export function bakeDeck(d, explored, sc, o = {}) {
  const W = d.W, H = d.H, c = o.canvas || document.createElement('canvas'); c.width = Math.ceil(W * sc); c.height = Math.ceil(H * sc);
  const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
  const seen = (i) => !explored || explored[i] === 1, dim = !!o.dim;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = d.grid[y][x]; if (v === 1) continue; const i = x + y * W, s = seen(i), rt = d.room[y][x];
    let fill;
    if (rt === 'jefferies') fill = s ? '#2a3a3a' : '#16222a';
    else if (rt) { const k = catOf(rt).c; g.fillStyle = '#0c1424'; g.fillRect(x * sc, y * sc, sc + 0.6, sc + 0.6); fill = rgba(k, dim ? 0.14 : s ? 0.32 : 0.13); }
    else fill = dim ? '#0f1a2e' : s ? '#1d2a46' : '#111b30';
    g.fillStyle = fill; g.fillRect(x * sc, y * sc, sc + 0.6, sc + 0.6);
    if (v === 2) { g.fillStyle = s ? 'rgba(150,175,210,.35)' : 'rgba(110,130,160,.16)'; g.fillRect(x * sc + sc * 0.2, y * sc + sc * 0.2, sc * 0.6, sc * 0.6); }
  }
  // wall edges, two batches (bright where walked, faint blueprint elsewhere)
  for (const pass of [0, 1]) {
    g.beginPath(); let any = false;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (d.grid[y][x] === 1) continue; if ((seen(x + y * W) ? 1 : 0) !== pass) continue;
      const wall = (xx, yy) => d.grid[yy]?.[xx] === undefined || d.grid[yy][xx] === 1;
      if (wall(x, y - 1)) { g.moveTo(x * sc, y * sc); g.lineTo(x * sc + sc, y * sc); any = true; }
      if (wall(x, y + 1)) { g.moveTo(x * sc, y * sc + sc); g.lineTo(x * sc + sc, y * sc + sc); any = true; }
      if (wall(x - 1, y)) { g.moveTo(x * sc, y * sc); g.lineTo(x * sc, y * sc + sc); any = true; }
      if (wall(x + 1, y)) { g.moveTo(x * sc + sc, y * sc); g.lineTo(x * sc + sc, y * sc + sc); any = true; }
    }
    if (any) { g.strokeStyle = dim ? 'rgba(111,143,184,.3)' : pass ? 'rgba(140,175,225,.85)' : 'rgba(111,143,184,.38)'; g.lineWidth = Math.max(1, sc * 0.12); g.stroke(); }
  }
  for (const r of d.rooms) { if (r.type === 'jefferies') continue; g.strokeStyle = rgba(catOf(r.type).c, dim ? 0.32 : 0.7); g.lineWidth = Math.max(1, sc * 0.16); g.strokeRect(r.x * sc, r.y * sc, r.w * sc, r.h * sc); }
  const [ex, ey] = d.exit; g.fillStyle = '#10213a'; g.fillRect(ex * sc, ey * sc, sc, sc); g.strokeStyle = '#cfe1f3'; g.lineWidth = Math.max(1, sc * 0.1); g.strokeRect(ex * sc + 0.5, ey * sc + 0.5, sc - 1, sc - 1);
  return c;
}

export function drawRoute(g, R, sc, t, o = {}) {
  if (!R || R.pts.length < 2) return;
  const P = R.pts, wd = o.width || Math.max(2.2, sc * 0.42);
  const path = () => { g.beginPath(); g.moveTo(P[0][0] * sc, P[0][1] * sc); for (let i = 1; i < P.length - 1; i++) { const a = P[i], b = P[i + 1]; g.arcTo(a[0] * sc, a[1] * sc, (a[0] + b[0]) / 2 * sc, (a[1] + b[1]) / 2 * sc, sc * 0.9); } g.lineTo(P[P.length - 1][0] * sc, P[P.length - 1][1] * sc); };
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (o.dashed) g.setLineDash([sc * 0.8, sc * 0.6]);
  path(); g.strokeStyle = 'rgba(142,243,255,.22)'; g.lineWidth = wd * 3.2; g.stroke();
  path(); g.strokeStyle = 'rgba(0,20,30,.8)'; g.lineWidth = wd + 2.2; g.stroke();
  path(); g.strokeStyle = ROUTE; g.lineWidth = wd; g.stroke(); g.setLineDash([]);
  const gap = 1.7, ph = (t * 1.5) % gap;
  for (let s = ph; s < R.len; s += gap) {
    const p = along(R, s), fade = Math.max(0.3, 1 - s / 55);
    g.save(); g.translate(p.x * sc, p.y * sc); g.rotate(p.a); g.strokeStyle = `rgba(5,24,34,${fade})`; g.lineWidth = Math.max(1.6, sc * 0.2);
    g.beginPath(); g.moveTo(-sc * 0.3, -sc * 0.3); g.lineTo(sc * 0.18, 0); g.lineTo(-sc * 0.3, sc * 0.3); g.stroke(); g.restore();
  }
}
// a radar ping around the destination
function ping(g, x, y, bs, t) { const k = (t * 14) % 12; g.strokeStyle = `rgba(142,243,255,${1 - k / 12})`; g.lineWidth = 2; g.beginPath(); g.arc(x, y, bs * 0.7 + k, 0, 7); g.stroke(); }
function playerArrow(g, a) {
  g.fillStyle = '#fff'; g.strokeStyle = '#04141c'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, -a * 1.3); g.lineTo(a * 0.8, a * 0.8); g.lineTo(0, a * 0.4); g.lineTo(-a * 0.8, a * 0.8); g.closePath(); g.fill(); g.stroke();
}

/** s: {d, layer (baked at sc), sc, px, py, yaw, rot, route, dest{x,y,type}, markers[{x,y,type,frac,color,pulse,pinned}], t, lift{x,y}, liftOk} */
export function drawLocal(g, s) {
  const w = g.canvas.width, h = g.canvas.height, sc = s.sc, rot = s.rot || 0, t = s.t || 0, bs = Math.max(22, sc * 2.1);
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(3,6,14,.78)'; g.fillRect(0, 0, w, h);
  g.save(); g.translate(w / 2, h / 2); g.rotate(rot); g.translate(-s.px * sc, -s.py * sc);
  if (s.layer) g.drawImage(s.layer, 0, 0);
  drawRoute(g, s.route, sc, t);
  const rad = Math.hypot(w, h) / 2 / sc + 3, near = (x, y) => Math.abs(x - s.px) < rad && Math.abs(y - s.py) < rad;
  const up = (x, y, fn) => { g.save(); g.translate(x * sc, y * sc); g.rotate(-rot); fn(); g.restore(); };
  const marked = new Set((s.markers || []).map(m => m.x + ',' + m.y));
  for (const r of s.d.rooms) { if (r.type === 'jefferies') continue; const cx = r.x + r.w / 2, cy = r.y + r.h / 2; if (!near(cx, cy) || marked.has(cx + ',' + cy)) continue; up(cx, cy, () => drawBadge(g, r.type, 0, 0, bs * (r.w * r.h < 12 ? 0.8 : 1), { dim: s.explored && !s.explored[Math.floor(cx) + Math.floor(cy) * s.d.W] })); }
  for (const m of s.markers || []) if (near(m.x, m.y)) up(m.x, m.y, () => { drawBadge(g, m.type, 0, 0, bs); drawRing(g, m, bs, t); });
  if (s.lift) up(s.lift.x, s.lift.y, () => { g.fillStyle = 'rgba(8,16,30,.9)'; g.beginPath(); g.arc(0, 0, bs * 0.46, 0, 7); g.fill(); drawIcon(g, 'lift', 0, 0, bs * 0.62, s.liftOk === false ? LATE : '#e6f2ff', 2.2); });
  if (s.dest) up(s.dest.x, s.dest.y, () => ping(g, 0, 0, bs, t));
  g.restore();
  // player: FOV wedge + arrow at the centre (heading-up: always pointing up)
  g.save(); g.translate(w / 2, h / 2); g.rotate(rot - s.yaw); const fr = sc * 5, gr = g.createRadialGradient(0, 0, 0, 0, 0, fr); gr.addColorStop(0, 'rgba(255,255,255,.38)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, fr, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6); g.closePath(); g.fill(); playerArrow(g, Math.max(6, sc * 0.55)); g.restore();
  // edge pin for an off-crop destination
  if (s.dest) {
    let dx = s.dest.x - s.px, dy = s.dest.y - s.py; const ca = Math.cos(rot), sa = Math.sin(rot); let sx = (dx * ca - dy * sa) * sc, sy = (dx * sa + dy * ca) * sc; const m = 18;
    if (Math.abs(sx) > w / 2 - m || Math.abs(sy) > h / 2 - m) {
      const k = Math.min((w / 2 - m) / Math.abs(sx || 1e-6), (h / 2 - m) / Math.abs(sy || 1e-6)); sx *= k; sy *= k; const a = Math.atan2(sy, sx);
      g.save(); g.translate(w / 2 + sx, h / 2 + sy); g.rotate(a); g.fillStyle = ROUTE; g.beginPath(); g.moveTo(m * 0.9, 0); g.lineTo(-m * 0.3, m * 0.6); g.lineTo(-m * 0.3, -m * 0.6); g.fill(); g.restore();
      drawBadge(g, s.dest.type || 'lift', w / 2 + sx - Math.cos(a) * m * 1.7, h / 2 + sy - Math.sin(a) * m * 1.7, bs * 0.95);
    }
  }
  // ship-forward tick (rotates with the map)
  g.save(); g.translate(w / 2, h / 2); g.rotate(rot); g.translate(0, -h / 2 + 14); g.rotate(-rot); g.fillStyle = '#ffd9a0'; g.font = `800 ${Math.round(sc * 0.95)}px ui-monospace,monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('F', 0, 0); g.restore();
}

/** bounding box of the deck's non-wall tiles (decks are hull-shaped inside a larger grid) */
export function deckBounds(d) {
  if (d._nvb) return d._nvb; let x0 = d.W, y0 = d.H, x1 = 0, y1 = 0;
  for (let y = 0; y < d.H; y++) for (let x = 0; x < d.W; x++) if (d.grid[y][x] !== 1) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return (d._nvb = x1 < x0 ? { x: 0, y: 0, w: d.W, h: d.H } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
}
/** whole deck fitted: s = {d, layer?, explored?, dim?, route?, player{x,y,yaw}?, markers?, hot{type:1}?, find?, t, pad} -> {sc, ox, oy} */
export function drawPlan(g, s) {
  const w = s.w ?? g.canvas.width, h = s.h ?? g.canvas.height, d = s.d, pad = s.pad ?? 1, t = s.t || 0;
  const b = deckBounds(d), sc = Math.min(w / (b.w + pad * 2), h / (b.h + pad * 2), s.maxSc || 1e9), ox = (w - b.w * sc) / 2 - b.x * sc, oy = (h - b.h * sc) / 2 - b.y * sc, bs = Math.max(14, Math.min(34, sc * 2.3));
  g.save(); g.translate(ox, oy);
  const layer = s.layer || bakeDeck(d, s.explored, sc, { dim: s.dim }); g.drawImage(layer, 0, 0, d.W * sc, d.H * sc);
  if (s.route) drawRoute(g, s.route, sc, t, { width: Math.max(2.2, sc * 0.4), dashed: s.dashed });
  const marked = new Map((s.markers || []).map(m => [m.x + ',' + m.y, m]));
  for (const r of d.rooms) { if (r.type === 'jefferies') continue; const cx = r.x + r.w / 2, cy = r.y + r.h / 2, m = marked.get(cx + ',' + cy), hot = s.hot?.[r.type];
    drawBadge(g, r.type, cx * sc, cy * sc, bs * (m || hot ? 1.15 : 1), { dim: s.dim && !hot && !m });
    if (m) { g.save(); g.translate(cx * sc, cy * sc); drawRing(g, m, bs * 1.15, t); g.restore(); }
    if (hot) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.setLineDash([5, 4]); g.beginPath(); g.arc(cx * sc, cy * sc, bs * 0.95 + Math.sin(t * 5) * 2, 0, 7); g.stroke(); g.setLineDash([]); } }
  const [ex, ey] = d.exit; g.fillStyle = 'rgba(8,16,30,.9)'; g.beginPath(); g.arc((ex + 0.5) * sc, (ey + 0.5) * sc, bs * 0.46, 0, 7); g.fill(); drawIcon(g, 'lift', (ex + 0.5) * sc, (ey + 0.5) * sc, bs * 0.62, '#e6f2ff', 2);
  for (const m of s.markers || []) if (m.dest) ping(g, m.x * sc, m.y * sc, bs, t);
  if (s.player) { const p = s.player; g.save(); g.translate(p.x * sc, p.y * sc); g.rotate(-p.yaw); playerArrow(g, Math.max(6, sc * 0.6)); g.restore(); }
  g.restore();
  return { sc, ox, oy };
}
