// signart.js — batch 10: signage, decals, pod hatches and icons. See docs/signart.md. Original artwork only (no borrowed insignia: no crosses, deltas, wings-and-star marks).
//   G-1 eight department emblem plates (0.3 m)       G-2 six hazard placards (0.25 m, pictograms only)       G-3 floor zone markings (one 2.5 m tile each)
//   G-4 deck directory board (0.6 x 0.9 m, drawn from world.d.rooms, "you are here" lamp)                    R-1 escape-pod hatches (DECOR kits podhatch, podbank + floor arrows)
//   U-1 eight handheld glyphs   U-2 two badge shapes (Flight Control, Operations)   U-3 deck-plan symbols for the batch 1-4 props (canvas drawing recipes)
// Pure three.js + js/icons.js (pure data). Canvas textures need a DOM (browser); everything else (paths, tables, DECOR kits, symbol recipes) is plain data.
//   installIcons()  merges ICONS_X / SHAPES_X / CATS_X into the live objects exported by js/icons.js, so HH_ICON, badgeSvg, iconSvg etc. see the new names without editing that file.
import * as THREE from 'three';
import { C, R, ICONS, SHAPES, CATS, DEPT_COL, DEPT_LETTER } from './icons.js';

const PI = Math.PI;
const HAS_DOM = typeof document !== 'undefined';
const hex = (n) => '#' + new THREE.Color(n).getHexString();

// ================================================================ U-1, U-2: icon paths (24 px grid, 1.7 px stroke family, path-only like js/icons.js)
const E = (x, y, rx, ry, rot = 0) => `M${x - rx} ${y}a${rx} ${ry} ${rot} 1 0 ${2 * rx} 0a${rx} ${ry} ${rot} 1 0 ${-2 * rx} 0`;
/** the eight handheld glyphs (asset-gaps 11.7 U-1). Keys are the new icon names; HH_MAP says which handheld id uses which. */
export const ICONS_X = {
  regen: 'M4 20l7.5-7.5' + C(15.5, 8.5, 4.2) + C(15.5, 8.5, 1.2) + 'M15.5 2v2 M21.5 8.5h-2 M19.8 4.2l-1.4 1.4',                                              // skin regenerator: wand + emitter head + healing ticks
  scalpel: 'M20 4L10 14l-3-3z M7 11l-4 8 1.5 1.5 8-4 M13 10l1.5 1.5',                                                                  // laser scalpel: blade and handle
  torch: 'M3 14h8v5H3z M11 15h4l3-3 M18 12l3-2 M18 15l3 1 M16 18l2 3 M5 14V11h4v3',                                                    // cutting torch: body, hose stub, nozzle and flame
  extinguisher: 'M8 9h8v12H8z M10 5h4v4 M10 5l7-1 3 2 M17 4v-1 M8 13h8 M17 8c2 0 3 2 3 5v3',                                          // cylinder, valve, nozzle and hose
  mop: 'M12 2v12 M6 14h12l2 7H4z M8 17v4 M12 17v4 M16 17v4',                                                                           // mop: pole, head, strands
  hook: 'M9 3h6 M12 3v9 M12 12a4.5 4.5 0 1 1-4.5 4.5 M7.5 16.5l-2-2.5',                                                                // cargo hook: eye and hook
  crowbar: 'M5 21L17 9c-1-2.5 0-5.5 4-6-1 2 0 3.5 0 3.5l-4 4 M3 19l2 2',                                                                // pry bar: shaft with a claw end
  rifle: 'M2 11h13l3-2h4v4h-4l-3 2H8l-1 5H4z M12 11V9h3 M9 13h2',                                                                       // emitter rifle: long body, stock grip, sight rail
};
/** handheld id -> icon name: the patch for HH_ICON in js/menus.js (asset-gaps 11.7: dermal -> hypo, scalpel -> lab, plasma_torch / extinguisher -> fire, mop -> clean, cargo_hook -> grab, crowbar -> workshop, phaser_rifle -> phaser) */
export const HH_MAP = { dermal: 'regen', scalpel: 'scalpel', plasma_torch: 'torch', extinguisher: 'extinguisher', mop: 'mop', cargo_hook: 'hook', crowbar: 'crowbar', phaser_rifle: 'rifle' };
export const SHAPES_X = {
  oct: 'M8 2.5h8L21.5 8v8L16 21.5H8L2.5 16V8z',                  // flight control: cut-corner square
  pill: 'M8 4h8a8 8 0 0 1 0 16H8A8 8 0 0 1 8 4z',                 // operations: stadium
};
export const CATS_X = {
  flight: { n: 'Flight Control', c: DEPT_COL.flight, s: 'oct' },
  operations: { n: 'Operations', c: DEPT_COL.operations, s: 'pill' },
};
let installed = false;
/** merge the new icons / shapes / categories into js/icons.js's live objects (idempotent). Also returns { ICONS, SHAPES, CATS }. */
export function installIcons() { if (!installed) { Object.assign(ICONS, ICONS_X); Object.assign(SHAPES, SHAPES_X); Object.assign(CATS, CATS_X); installed = true; } return { ICONS, SHAPES, CATS }; }

// ================================================================ G-1: department emblems (original glyphs on the category shape, department colour)
/** department id (js/crew.js DEPARTMENTS) -> { name, cat (shape family), glyph (24 px path), col } */
export const EMBLEMS = {
  command:     { name: 'Command',        cat: 'command',    glyph: C(12, 15, 4) + 'M12 3.5v3.2 M4.6 7.8l2.2 2.2 M19.4 7.8L17.2 10 M3 21h18' },                                   // rising sun over a line
  flight:      { name: 'Flight Control', cat: 'flight',     glyph: 'M12 4v16 M12 9c-2-3-5.5-4-8.5-3 3 1 5.5 3 6.5 7 M12 9c2-3 5.5-4 8.5-3-3 1-5.5 3-6.5 7' },                   // two swept wing arcs on a spine
  operations:  { name: 'Operations',     cat: 'operations', glyph: C(12, 12, 8) + C(12, 12, 3.6) + 'M12 12l5.6-5.6 M20 12h2' },                                                // sweep and node
  engineering: { name: 'Engineering',    cat: 'engineering', glyph: 'M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z' + C(12, 12, 3.2) },                                                   // hex nut
  security:    { name: 'Security',       cat: 'security',   glyph: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z M8.5 11l3.5 3.2 3.5-3.2' },                                         // shield with a chevron
  sciences:    { name: 'Sciences',       cat: 'science',    glyph: E(12, 12, 9, 3.6, -35) + E(12, 12, 9, 3.6, 35) + C(12, 12, 1.7) },                                          // two orbits round a nucleus
  medical:     { name: 'Medical',        cat: 'medical',    glyph: C(12, 12, 9) + 'M5.2 12.5h3.2l1.9-4.4 3 8.4 1.9-4h3.6' },                                                   // pulse trace in a ring (deliberately no cross)
  services:    { name: 'Services',       cat: 'services',   glyph: 'M4 12h16c0 5-3.5 8-8 8s-8-3-8-8z M9 7.6c0-1.6 1.6-1.6 1.6-3.2 M14 7.6c0-1.6 1.6-1.6 1.6-3.2 M8 21h8' },     // steaming bowl
};
export const EMBLEM_DEPTS = Object.keys(EMBLEMS);
const shapeOf = (cat) => SHAPES[CATS[cat]?.s] || SHAPES_X[(CATS_X[cat] || {}).s] || SHAPES.square;
/** SVG string of a department emblem (hue AND shape AND glyph). size px optional. */
export function emblemSvg(dept, { size, plate = true } = {}) {
  const e = EMBLEMS[dept]; if (!e) return ''; const col = DEPT_COL[dept] || '#9db2c8', wh = size ? ` width="${size}" height="${size}"` : '';
  return `<svg viewBox="0 0 24 24"${wh} aria-hidden="true">${plate ? '<rect x="0.5" y="0.5" width="23" height="23" rx="3.2" fill="#0d1018" stroke="#3a4152" stroke-width="0.8"/>' : ''}<path d="${shapeOf(e.cat)}" fill="${col}" fill-opacity=".24" stroke="${col}" stroke-width="1.2" stroke-linejoin="round" transform="translate(12 12) scale(.88) translate(-12 -12)"/><g transform="translate(12 12) scale(.56) translate(-12 -12)" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="${e.glyph}"/></g></svg>`;
}
const _p2 = {}; const P2 = (d) => _p2[d] || (_p2[d] = new Path2D(d));
/** draw an emblem on a 2D canvas context, centred at (cx, cy), `s` px square (dark rounded plate, department-colour border, shape, glyph) */
export function drawEmblem(g, dept, cx, cy, s) {
  const e = EMBLEMS[dept]; if (!e) return; const col = DEPT_COL[dept] || '#9db2c8';
  g.save(); g.translate(cx - s / 2, cy - s / 2); g.scale(s / 24, s / 24);
  g.fillStyle = '#0d1018'; g.beginPath(); g.roundRect(0.5, 0.5, 23, 23, 3.2); g.fill(); g.strokeStyle = col; g.lineWidth = 0.9; g.stroke();
  g.save(); g.translate(12, 12); g.scale(0.88, 0.88); g.translate(-12, -12); g.fillStyle = col; g.globalAlpha = 0.24; g.fill(P2(shapeOf(e.cat))); g.globalAlpha = 1; g.lineWidth = 1.2; g.lineJoin = 'round'; g.stroke(P2(shapeOf(e.cat))); g.restore();
  g.save(); g.translate(12, 12); g.scale(0.56, 0.56); g.translate(-12, -12); g.strokeStyle = '#fff'; g.lineWidth = 2.3; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(P2(e.glyph)); g.restore(); g.restore();
}

// ================================================================ canvas texture helper (cached)
const TEX = new Map();
function ctex(key, w, h, draw, { mip = true } = {}) {
  if (!HAS_DOM) return null; if (TEX.has(key)) return TEX.get(key);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (!mip) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; } TEX.set(key, t); return t;
}
const MATS = new Map();
const decalMat = (key, tex, opt = {}) => { let m = MATS.get(key); if (!m) { m = new THREE.MeshStandardMaterial({ map: tex, transparent: !!opt.transparent, alphaTest: opt.alphaTest ?? 0, roughness: opt.roughness ?? 0.55, metalness: 0.0, emissive: opt.emissive ? 0xffffff : 0x000000, emissiveMap: opt.emissive ? tex : null, emissiveIntensity: opt.emissive ?? 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: !opt.transparent || (opt.alphaTest ?? 0) > 0 }); MATS.set(key, m); } return m; };
const bgeo = (k, f) => { let g = _geo.get(k); if (!g) { g = f(); _geo.set(k, g); } return g; }; const _geo = new Map();
const tris = (o) => { let n = 0; o.traverse(m => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return Math.round(n); };

/** emblem plate: 0.3 m square dark plate, 12 mm thick, wall decal with the emblem lit faintly. Group origin at the plate centre, +z out of the wall. */
export function buildEmblemPlate(dept, size = 0.3) {
  const g = new THREE.Group(); g.name = 'emblem:' + dept; const tex = ctex('emb' + dept, 256, 256, (c, w) => drawEmblem(c, dept, w / 2, w / 2, w - 4));
  const back = new THREE.Mesh(bgeo('eb' + size, () => new THREE.BoxGeometry(size + 0.02, size + 0.02, 0.012)), new THREE.MeshStandardMaterial({ color: 0x4a505a, roughness: 0.4, metalness: 0.8 })); back.position.z = 0.006; g.add(back);
  const face = new THREE.Mesh(bgeo('ef' + size, () => new THREE.PlaneGeometry(size, size)), decalMat('emb' + dept, tex, { emissive: 0.55, roughness: 0.4 })); face.position.z = 0.0125; g.add(face);
  g.userData = { dept, size, tris: tris(g) }; return g;
}

// ================================================================ G-2: hazard placards (triangles and diamonds, pictograms only)
export const PLACARDS = {
  voltage:   { name: 'high voltage',    shape: 'tri',     bg: '#f2c200', fg: '#111' },
  hot:       { name: 'hot surface',     shape: 'tri',     bg: '#f08a24', fg: '#111' },
  radiation: { name: 'radiation',       shape: 'tri',     bg: '#e8d020', fg: '#7a1a8a' },
  biological:{ name: 'biological',      shape: 'diamond', bg: '#e86a24', fg: '#111' },
  pressure:  { name: 'pressure',        shape: 'diamond', bg: '#2d6db5', fg: '#fff' },
  cold:      { name: 'cold / cryogenic', shape: 'diamond', bg: '#35a8d8', fg: '#fff' },
};
export const PLACARD_KINDS = Object.keys(PLACARDS);
function drawPlacard(g, kind, s) {
  const d = PLACARDS[kind], m = s * 0.04; g.clearRect(0, 0, s, s); g.lineJoin = 'round'; g.lineCap = 'round';
  const outline = () => { g.beginPath(); if (d.shape === 'tri') { g.moveTo(s / 2, m); g.lineTo(s - m, s - m * 2); g.lineTo(m, s - m * 2); } else { g.moveTo(s / 2, m); g.lineTo(s - m, s / 2); g.lineTo(s / 2, s - m); g.lineTo(m, s / 2); } g.closePath(); };
  outline(); g.fillStyle = '#101216'; g.fill(); g.save(); g.translate(s / 2, d.shape === 'tri' ? s * 0.6 : s / 2); g.scale(0.9, 0.9); g.translate(-s / 2, -(d.shape === 'tri' ? s * 0.6 : s / 2)); outline(); g.restore();
  // inner face
  g.save(); g.translate(s / 2, s / 2); g.scale(0.9, 0.9); g.translate(-s / 2, -s / 2); if (d.shape === 'tri') { g.beginPath(); g.moveTo(s / 2, m * 2.6); g.lineTo(s - m * 2.4, s - m * 3.4); g.lineTo(m * 2.4, s - m * 3.4); g.closePath(); } else { g.beginPath(); g.moveTo(s / 2, m * 2.4); g.lineTo(s - m * 2.4, s / 2); g.lineTo(s / 2, s - m * 2.4); g.lineTo(m * 2.4, s / 2); g.closePath(); } g.fillStyle = d.bg; g.fill(); g.restore();
  const cx = s / 2, cy = d.shape === 'tri' ? s * 0.62 : s * 0.5, u = s / 256; g.fillStyle = g.strokeStyle = d.fg; g.lineWidth = 12 * u;
  if (kind === 'voltage') { g.beginPath(); [[-6, -58], [24, -58], [4, -14], [30, -14], [-22, 52], [-8, 8], [-34, 8]].forEach(([x, y], i) => i ? g.lineTo(cx + x * u, cy + y * u) : g.moveTo(cx + x * u, cy + y * u)); g.closePath(); g.fill(); }
  else if (kind === 'hot') { g.fillRect(cx - 46 * u, cy + 30 * u, 92 * u, 14 * u); g.lineWidth = 9 * u; for (const x of [-24, 0, 24]) { g.beginPath(); g.moveTo(cx + x * u, cy + 18 * u); g.bezierCurveTo(cx + (x + 14) * u, cy + 4 * u, cx + (x - 14) * u, cy - 14 * u, cx + x * u, cy - 30 * u); g.bezierCurveTo(cx + (x + 10) * u, cy - 40 * u, cx + (x + 4) * u, cy - 48 * u, cx + x * u, cy - 54 * u); g.stroke(); } }
  else if (kind === 'radiation') { g.beginPath(); g.arc(cx, cy, 11 * u, 0, 7); g.fill(); for (let k = 0; k < 3; k++) { const a0 = -PI / 2 + k * 2 * PI / 3 - PI / 6; g.beginPath(); g.moveTo(cx + Math.cos(a0) * 20 * u, cy + Math.sin(a0) * 20 * u); g.arc(cx, cy, 58 * u, a0, a0 + PI / 3); g.lineTo(cx + Math.cos(a0 + PI / 3) * 20 * u, cy + Math.sin(a0 + PI / 3) * 20 * u); g.arc(cx, cy, 20 * u, a0 + PI / 3, a0, true); g.fill(); } }
  else if (kind === 'biological') { g.lineWidth = 11 * u; for (let k = 0; k < 3; k++) { const a = -PI / 2 + k * 2 * PI / 3; g.beginPath(); g.arc(cx + Math.cos(a) * 26 * u, cy + Math.sin(a) * 26 * u, 32 * u, 0, 7); g.stroke(); } g.beginPath(); g.arc(cx, cy, 9 * u, 0, 7); g.fill(); }
  else if (kind === 'pressure') { g.beginPath(); g.arc(cx, cy + 6 * u, 44 * u, 0, 7); g.lineWidth = 10 * u; g.stroke(); for (let k = 0; k < 7; k++) { const a = PI * 0.8 + k * PI * 1.4 / 6; g.beginPath(); g.moveTo(cx + Math.cos(a) * 32 * u, cy + 6 * u + Math.sin(a) * 32 * u); g.lineTo(cx + Math.cos(a) * 40 * u, cy + 6 * u + Math.sin(a) * 40 * u); g.lineWidth = 6 * u; g.stroke(); } g.beginPath(); g.moveTo(cx, cy + 6 * u); g.lineTo(cx + 26 * u, cy - 22 * u); g.lineWidth = 9 * u; g.stroke(); g.beginPath(); g.arc(cx, cy + 6 * u, 8 * u, 0, 7); g.fill(); for (const [x, y, a] of [[-66, -20, 2.6], [66, -20, 0.5], [0, -76, -PI / 2]]) { g.beginPath(); g.moveTo(cx + x * u, cy + y * u); g.lineTo(cx + (x + Math.cos(a) * 16) * u, cy + (y + Math.sin(a) * 16) * u); g.lineWidth = 6 * u; g.stroke(); } }
  else if (kind === 'cold') { g.lineWidth = 9 * u; for (let k = 0; k < 3; k++) { const a = k * PI / 3; g.beginPath(); g.moveTo(cx - Math.cos(a) * 54 * u, cy - Math.sin(a) * 54 * u); g.lineTo(cx + Math.cos(a) * 54 * u, cy + Math.sin(a) * 54 * u); g.stroke(); for (const sg of [-1, 1]) for (const r of [30, 46]) { const bx = cx + sg * Math.cos(a) * r * u, by = cy + sg * Math.sin(a) * r * u; for (const da of [-0.9, 0.9]) { g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + sg * Math.cos(a + da) * 14 * u, by + sg * Math.sin(a + da) * 14 * u); g.lineWidth = 6 * u; g.stroke(); } } } }
}
/** placard: 0.25 m alpha-tested plane (the triangle / diamond silhouette), origin at its centre, +z out of the wall. Tri: 2 per placard. */
export function buildPlacard(kind, size = 0.25) {
  const tex = ctex('plc' + kind, 256, 256, (c, w) => drawPlacard(c, kind, w)), m = new THREE.Mesh(bgeo('pl' + size, () => new THREE.PlaneGeometry(size, size)), decalMat('plc' + kind, tex, { alphaTest: 0.4, transparent: true, roughness: 0.35 }));
  m.name = 'placard:' + kind; m.userData = { kind, size, tris: 2, name: PLACARDS[kind].name }; return m;
}
/** which placards a room type gets (asset-gaps 11.4 G-2: plant, engineering, armory, lab, morgue, cargo) */
export const PLACARD_ROOMS = { plant: ['hot', 'pressure', 'voltage'], engineering: ['voltage', 'hot', 'radiation'], armory: ['voltage', 'pressure'], lab: ['biological', 'cold', 'radiation'], morgue: ['biological', 'cold'], cargo: ['pressure', 'biological'], workshop: ['hot', 'voltage'], sickbay: ['biological'] };

// ================================================================ G-3: floor zone markings (one 2.5 m tile each, 0.1 m lines = 20 px at 512 px)
export const ZONES = { keepout: 'yellow keep-out hatching', parking: 'white parking outline', walkway: 'yellow walkway lanes', staging: 'white staging corners', ejection: 'ejection zone stencil', podarrow: 'escape-pod arrows' };
export const ZONE_KINDS = Object.keys(ZONES);
function drawZone(g, kind, s) {
  g.clearRect(0, 0, s, s); const L = s * 0.04, Y = '#e8c020', W = '#e8ecee', K = '#17181b';   // 0.1 m
  const hatch = (x, y, w, h, col, gap = L * 1.7, lw = L * 0.55) => { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.strokeStyle = col; g.lineWidth = lw; for (let d = -h; d < w + h; d += gap) { g.beginPath(); g.moveTo(x + d, y + h); g.lineTo(x + d + h, y); g.stroke(); } g.restore(); };
  const frame = (x, y, w, h, t, col) => { g.fillStyle = col; g.fillRect(x, y, w, t); g.fillRect(x, y + h - t, w, t); g.fillRect(x, y, t, h); g.fillRect(x + w - t, y, t, h); };
  if (kind === 'keepout') { frame(s * 0.1, s * 0.1, s * 0.8, s * 0.8, L, Y); hatch(s * 0.1 + L * 1.4, s * 0.1 + L * 1.4, s * 0.8 - L * 2.8, s * 0.8 - L * 2.8, Y); }
  else if (kind === 'parking') { frame(s * 0.08, s * 0.08, s * 0.84, s * 0.84, L * 0.8, W); g.fillStyle = W; for (const [x, y] of [[0.08, 0.08], [0.92, 0.08], [0.08, 0.92], [0.92, 0.92]]) { g.fillRect(x * s - L * 1.8, y * s - L * 0.4, L * 3.6, L * 0.8); g.fillRect(x * s - L * 0.4, y * s - L * 1.8, L * 0.8, L * 3.6); } g.fillRect(s / 2 - L * 0.4, s / 2 - L * 3, L * 0.8, L * 6); g.fillRect(s / 2 - L * 3, s / 2 - L * 0.4, L * 6, L * 0.8); }
  else if (kind === 'walkway') { g.fillStyle = Y; g.fillRect(s * 0.18, 0, L, s); g.fillRect(s * 0.82 - L, 0, L, s); g.fillStyle = Y; for (let y = L; y < s; y += L * 5) { g.fillRect(s * 0.5 - L * 0.4, y, L * 0.8, L * 2.4); } }
  else if (kind === 'staging') { g.fillStyle = W; for (const [x, y, sx, sy] of [[0.12, 0.12, 1, 1], [0.88, 0.12, -1, 1], [0.12, 0.88, 1, -1], [0.88, 0.88, -1, -1]]) { g.fillRect(Math.min(x * s, x * s + sx * L * 7), y * s - (sy < 0 ? L : 0), L * 7, L); g.fillRect(x * s - (sx < 0 ? L : 0), Math.min(y * s, y * s + sy * L * 7), L, L * 7); } g.fillStyle = W; for (let x = s * 0.3; x < s * 0.7; x += L * 4) g.fillRect(x, s * 0.5 - L * 0.4, L * 2, L * 0.8); }
  else if (kind === 'ejection') { hatch(s * 0.06, s * 0.06, s * 0.88, L * 3, Y, L * 1.6, L * 0.8); hatch(s * 0.06, s * 0.94 - L * 3, s * 0.88, L * 3, Y, L * 1.6, L * 0.8); frame(s * 0.06, s * 0.06, s * 0.88, s * 0.88, L * 0.7, Y);
    g.fillStyle = Y; for (const k of [0, 1, 2]) { g.beginPath(); const y = s * 0.3 + k * s * 0.13; g.moveTo(s * 0.3, y); g.lineTo(s * 0.5, y + s * 0.09); g.lineTo(s * 0.7, y); g.lineTo(s * 0.7, y + L * 1.4); g.lineTo(s * 0.5, y + s * 0.09 + L * 1.4); g.lineTo(s * 0.3, y + L * 1.4); g.closePath(); g.fill(); }
    g.font = `bold ${L * 2.8}px Helvetica, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('KEEP CLEAR', s / 2, s * 0.245); }
  else if (kind === 'podarrow') { g.fillStyle = '#35d07a'; for (let k = 0; k < 3; k++) { const y = s * 0.14 + k * s * 0.3; g.beginPath(); g.moveTo(s * 0.5, y); g.lineTo(s * 0.74, y + s * 0.2); g.lineTo(s * 0.62, y + s * 0.2); g.lineTo(s * 0.62, y + s * 0.26); g.lineTo(s * 0.38, y + s * 0.26); g.lineTo(s * 0.38, y + s * 0.2); g.lineTo(s * 0.26, y + s * 0.2); g.closePath(); g.fill(); } g.fillStyle = W; g.fillRect(s * 0.5 - L * 0.4, s * 0.02, L * 0.8, s * 0.05); }
}
/** floor decal: flat plane `tile` m square (default 2.5), lying at y = 0.012 facing up; the arrows point toward -z (rotate the mesh about y to aim them). 2 tris. */
export function buildFloorZone(kind, tile = 2.5) {
  const tex = ctex('zone' + kind, 512, 512, (c, w) => drawZone(c, kind, w)), m = new THREE.Mesh(bgeo('fz' + tile, () => new THREE.PlaneGeometry(tile, tile)), decalMat('zone' + kind, tex, { transparent: true, alphaTest: 0.05, roughness: 0.7 }));
  m.rotation.x = -PI / 2; m.position.y = 0.012; m.receiveShadow = true; m.name = 'zone:' + kind; m.userData = { kind, tile, tris: 2 }; return m;
}
/** which room types get which zones (asset-gaps 11.4 G-3: shuttlebay, cargo, workshop, plant) */
export const ZONE_ROOMS = { shuttlebay: ['parking', 'ejection', 'walkway'], cargo: ['staging', 'walkway', 'keepout'], workshop: ['keepout', 'walkway'], plant: ['keepout', 'walkway'], airlock: ['podarrow'] };

// ================================================================ G-4: deck directory board
/** room type -> department id (colour) for the directory. Room types are the keys of ROOMS in js/data.js. */
export const ROOM_DEPT = { bridge: 'command', readyroom: 'command', engineering: 'engineering', plant: 'engineering', workshop: 'engineering', sickbay: 'medical', morgue: 'medical', lab: 'sciences', arboretum: 'sciences',
  shuttlebay: 'flight', cargo: 'flight', airlock: 'flight', transporter: 'operations', datacore: 'operations', brig: 'security', armory: 'security', mess: 'services', laundry: 'services', lounge: 'services', gym: 'services', holodeck: 'services', washroom: 'services', stores: 'services', quarters: 'services' };
const ROOM_LABEL = { bridge: 'Bridge', engineering: 'Engineering', sickbay: 'Sickbay', mess: 'Galley', transporter: 'Beam Room', shuttlebay: 'Shuttlebay', cargo: 'Cargo', holodeck: 'Holodeck', quarters: 'Quarters', arboretum: 'Arboretum', readyroom: 'Ready Room', brig: 'Brig', armory: 'Armory', gym: 'Fitness', lab: 'Lab', laundry: 'Laundry', lounge: 'Lounge', workshop: 'Workshop', plant: 'Plant', morgue: 'Morgue', datacore: 'Core', stores: 'Stores', washroom: 'Washroom', airlock: 'EVA Prep' };
function drawDirectory(g, w, h, rooms, o) {
  g.fillStyle = '#0b0e16'; g.fillRect(0, 0, w, h); g.fillStyle = o.accent || '#e8892b'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
  g.fillStyle = '#fff'; g.font = 'bold 34px Helvetica, Arial, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('DECK ' + (o.deck ?? '--'), 22, 44); g.fillStyle = '#9db2c8'; g.font = '16px Helvetica, Arial, sans-serif'; g.textAlign = 'right'; g.fillText('DIRECTORY', w - 22, 44);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const r of rooms) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
  const ax = 22, ay = 76, aw = w - 44, ah = h * 0.54, sc = Math.min(aw / Math.max(1, x1 - x0), ah / Math.max(1, y1 - y0)), ox = ax + (aw - (x1 - x0) * sc) / 2, oy = ay + (ah - (y1 - y0) * sc) / 2;
  g.fillStyle = '#131824'; g.fillRect(ax - 8, ay - 8, aw + 16, ah + 16); g.strokeStyle = '#2a3142'; g.lineWidth = 2; g.strokeRect(ax - 8, ay - 8, aw + 16, ah + 16);
  const used = new Set(); for (const r of rooms) { const d = ROOM_DEPT[r.type] || 'services', c = DEPT_COL[d] || '#9db2c8'; used.add(d); g.fillStyle = c; g.globalAlpha = 0.42; g.fillRect(ox + (r.x - x0) * sc, oy + (r.y - y0) * sc, r.w * sc, r.h * sc); g.globalAlpha = 1; g.strokeStyle = c; g.lineWidth = 2; g.strokeRect(ox + (r.x - x0) * sc + 1, oy + (r.y - y0) * sc + 1, r.w * sc - 2, r.h * sc - 2); }
  if (o.here) { const hx = ox + (o.here.x - x0 + 0.5) * sc, hy = oy + (o.here.y - y0 + 0.5) * sc; g.fillStyle = '#ff4d3d'; g.beginPath(); g.arc(hx, hy, Math.max(6, sc * 0.5), 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); o.herePx = [hx, hy]; }
  let ly = ay + ah + 30; g.font = '17px Helvetica, Arial, sans-serif'; g.textAlign = 'left'; const list = [...used]; list.forEach((d, i) => { const cx = 28 + (i % 2) * (w / 2 - 6), cy = ly + Math.floor(i / 2) * 25; drawEmblem(g, d, cx + 10, cy, 22); g.fillStyle = '#e6edf5'; g.fillText(EMBLEMS[d]?.name || d, cx + 28, cy + 1); });
  if (o.here) { g.fillStyle = '#ff4d3d'; g.beginPath(); g.arc(30, h - 36, 7, 0, 7); g.fill(); g.fillStyle = '#e6edf5'; g.fillText('You are here', 46, h - 35); }
}
/** deck directory: Group 0.6 x 0.9 m, frame 0.05 deep, +z out of the wall, origin at the board centre. rooms = world.d.rooms ([{ type, x, y, w, h }]); opts { deck, here: { x, y } (tile), accent }.
 *  g.userData.lamp = the "you are here" lamp mesh (emissive; pulse it with g.userData.pulse(t)), g.userData.herePx. ~34 tris. */
export function buildDirectory(rooms, opts = {}) {
  const g = new THREE.Group(); g.name = 'directory'; const o = { ...opts }; const W = 384, H = 576;
  const tex = ctex(`dir${o.deck}|${o.here ? o.here.x + ',' + o.here.y : ''}|${rooms.length}|${rooms[0] ? rooms[0].x + rooms[0].y + rooms[0].type : ''}`, W, H, (c, w, h) => drawDirectory(c, w, h, rooms, o));
  const frame = new THREE.Mesh(bgeo('dirf', () => new THREE.BoxGeometry(0.62, 0.92, 0.05)), new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.4, metalness: 0.85 })); frame.position.z = 0.025; g.add(frame);
  const scr = new THREE.Mesh(bgeo('dirs', () => new THREE.PlaneGeometry(0.56, 0.84)), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.7, roughness: 0.3 })); scr.position.z = 0.0505; g.add(scr);
  const lampM = new THREE.MeshStandardMaterial({ color: 0x300808, emissive: 0xff3a2a, emissiveIntensity: 2, roughness: 0.4 }), lamp = new THREE.Mesh(bgeo('dirl', () => new THREE.SphereGeometry(0.011, 8, 5)), lampM); lamp.position.z = 0.054; lamp.visible = false;
  if (o.herePx) { lamp.visible = true; lamp.position.set((o.herePx[0] / W - 0.5) * 0.56, (0.5 - o.herePx[1] / H) * 0.84, 0.054); } g.add(lamp);
  g.userData = { lamp, herePx: o.herePx, pulse: (t) => { lampM.emissiveIntensity = 1.2 + 1.6 * (0.5 + 0.5 * Math.sin(t * 5)); }, tris: tris(g) }; return g;
}

// ================================================================ R-1: escape-pod hatches (DECOR kits in the js/world.js Kit format, +z out of the wall, 0-3.2 m)
const DK = 0x23262d, MT = 0x8f959e, WHT = 0xdfe6ea, RD = 0xb02820, YL = 0xd8a818, GRN = 0x2f8a48, STEEL = 0x5a6068;
const GG = [0.3, 1.7, 0.75], GR = [2.0, 0.2, 0.12], GB = [0.35, 1.25, 2.0], GO = [2.0, 0.85, 0.25];
function hatch(K, ox, status = 'ready') {
  const cy = 1.2, rr = 0.58;
  K.cyl(rr + 0.04, 0.05, ox, cy, DK, 0.0, 'z', false, 16).cyl(rr, 0.12, ox, cy, STEEL, 0.0, 'z', false, 16);                                 // coaming ring set into the bulkhead
  for (let k = 0; k < 16; k++) { const a = k / 16 * 2 * PI; K.box(0.1, 0.045, 0.01, ox + Math.cos(a) * (rr - 0.03), cy + Math.sin(a) * (rr - 0.03), k % 2 ? DK : YL, 0.12, false, a + PI / 2); }   // hazard ring (alternating tiles)
  K.cyl(0.46, 0.07, ox, cy, 0x9aa1ac, 0.1, 'z', false, 16).cyl(0.4, 0.03, ox, cy, 0xaab1bb, 0.17, 'z', false, 16);                           // door leaf: dished
  K.cyl(0.115, 0.06, ox, cy + 0.2, STEEL, 0.17, 'z', false, 16).cyl(0.085, 0.03, ox, cy + 0.2, GB, 0.2, 'z', true, 16);                        // porthole: lit
  K.cyl(0.05, 0.08, ox, cy - 0.06, DK, 0.2, 'z', false, 12);                                                                                  // wheel hub
  for (let k = 0; k < 4; k++) K.box(0.28, 0.03, 0.03, ox, cy - 0.06, MT, 0.2, false, k * PI / 4).box(0.04, 0.04, 0.05, ox + Math.cos(k * PI / 4) * 0.14, cy - 0.06 + Math.sin(k * PI / 4) * 0.14, DK, 0.2).box(0.04, 0.04, 0.05, ox - Math.cos(k * PI / 4) * 0.14, cy - 0.06 - Math.sin(k * PI / 4) * 0.14, DK, 0.2);   // wheel: four crossed spokes with rim studs
  K.box(0.22, 0.14, 0.06, ox, cy - 0.34, RD, 0.2).box(0.18, 0.1, 0.012, ox, cy - 0.34, 0xe8e0c8, 0.262).box(0.03, 0.03, 0.04, ox, cy - 0.34, YL, 0.27);   // pull handle under a red cover
  K.box(0.06, 0.06, 0.02, ox + 0.48, cy + 0.5, status === 'ready' ? GG : GR, 0.1, true).box(0.07, 0.07, 0.016, ox + 0.48, cy + 0.5, DK, 0.09);   // status lamp
  K.box(0.5, 0.05, 0.008, ox, cy + 0.74, WHT, 0.02).box(0.46, 0.012, 0.004, ox, cy + 0.74, GRN, 0.028);                                      // blank placard above: lettering is painted by the sign pass
  for (const sx of [-1, 1]) K.box(0.05, 0.16, 0.04, ox + sx * 0.5, cy - 0.3, DK, 0.1);                                                           // two hinge blocks
}
export const DECOR_SIGN = {
  podhatch(K) { hatch(K, 0); },                                                                                                               // one hatch (0.9 m door, 1.28 m with its ring)
  podbank(K) {                                                                                                                                // two hatches at 1.2 m centres, a grab rail and a green arrow strip over them
    hatch(K, -0.6); hatch(K, 0.6, 'ready');
    K.box(2.3, 0.04, 0.05, 0, 0.82, MT, 0.12).box(2.3, 0.05, 0.02, 0, 2.28, DK, 0.0).box(0.5, 0.04, 0.012, -0.6, 2.28, GG, 0.02, true).box(0.5, 0.04, 0.012, 0.6, 2.28, GG, 0.02, true);
    for (const sx of [-1, 1]) K.box(0.04, 0.1, 0.06, sx * 1.1, 0.82, DK, 0.0);
  },
};
export const DECOR_SIGN_POOLS = { airlock: ['podbank'], corridor: [] };   // docs/signart.md: ROOM_DECOR.airlock gains 'podbank' (an airlock room with a wall face of 2 tiles or more)

// ================================================================ U-3: deck-plan symbols for the props of batches 1-4 (canvas recipes in the style of tools/artifact/deck-plans.template.html)
// Recipe ops in unit space (-0.5..0.5 of the tile symbol size s): ['r', x, y, w, h, radius?, 'a'?]  rounded rect, ['c', x, y, r, 'a'?] circle, ['l', x1, y1, x2, y2] line,
// ['p', [x, y, x, y, ...], close?, 'a'?] polygon, ['a', x, y, r, a0, a1] arc stroke.  'a' = fill with the accent colour (C.sci), otherwise panel fill + ink stroke.
export const PROP_SYMBOLS = {
  helm:           [['r', -.45, -.18, .9, .4, .08], ['r', -.3, -.34, .6, .12, .04, 'a'], ['c', 0, .02, .1], ['l', -.34, .22, -.34, .4], ['l', .34, .22, .34, .4]],
  baycontrol:     [['p', [-.46, .24, -.3, -.26, .3, -.26, .46, .24], true], ['r', -.2, -.16, .4, .16, .03, 'a'], ['c', -.3, .1, .05], ['c', .3, .1, .05]],
  beampedestal:   [['p', [-.36, .26, -.3, -.3, .3, -.3, .36, .26], true], ['l', -.18, -.1, -.18, .1], ['l', 0, -.1, 0, .1], ['l', .18, -.1, .18, .1]],
  secdesk:        [['p', [-.46, -.4, .46, -.4, .46, -.1, -.1, -.1, -.1, .4, -.46, .4], true], ['r', .08, -.32, .28, .1, .02, 'a'], ['c', -.28, .0, .05]],
  nursestation:   [['p', [-.46, -.3, .46, -.3, .46, .3, .3, .3, .3, -.08, -.46, -.08], true], ['r', -.4, -.26, .3, .1, .02, 'a'], ['c', .38, .12, .04]],
  holodesk:       [['r', -.45, -.12, .9, .34, .06], ['l', -.3, .0, .3, .0], ['c', -.18, -.3, .08, 'a'], ['c', .18, -.3, .08, 'a']],
  reactorstation: [['r', -.46, -.14, .92, .36, .05], ['r', -.4, -.4, .26, .22, .03, 'a'], ['r', -.13, -.4, .26, .22, .03, 'a'], ['r', .14, -.4, .26, .22, .03, 'a']],
  taskchair:      [['c', 0, .06, .26], ['r', -.24, -.34, .48, .14, .06, 'a']],
  steriliser:     [['r', -.46, -.26, .92, .52, .04], ['c', -.12, 0, .17], ['c', -.12, 0, .07, 'a'], ['r', .16, -.18, .24, .36, .03]],
  surgical_table: [['r', -.2, -.46, .4, .92, .08], ['l', -.2, -.18, .2, -.18], ['c', .34, -.28, .1, 'a'], ['c', -.34, -.28, .1, 'a']],
  med_dispenser:  [['r', -.36, -.3, .72, .6, .05], ['l', -.36, -.04, .36, -.04], ['l', -.36, .14, .36, .14], ['r', -.28, -.24, .56, .14, .02, 'a']],
  exam_couch:     [['r', -.22, -.46, .44, .92, .06], ['p', [-.22, -.46, .22, -.46, .22, -.2, -.22, -.2], true, 'a'], ['r', .26, .22, .2, .2, .03]],
  autopsy_table:  [['r', -.24, -.46, .48, .92, .04], ['r', -.17, -.38, .34, .72, .03], ['c', 0, .3, .05, 'a'], ['c', .38, -.3, .1]],
  infusion_stand: [['c', 0, 0, .05, 'a'], ['l', -.34, -.34, .34, .34], ['l', .34, -.34, -.34, .34], ['c', 0, 0, .34], ['r', .1, -.3, .16, .2, .02]],
  pumpskid:       [['r', -.46, -.3, .92, .6, .04], ['c', -.22, 0, .2], ['c', -.22, 0, .08, 'a'], ['r', .08, -.2, .3, .4, .03], ['l', .1, -.3, .1, .3]],
  heatexch:       [['r', -.46, -.2, .92, .4, .12], ['l', -.3, -.2, -.3, .2], ['l', -.1, -.2, -.1, .2], ['l', .1, -.2, .1, .2], ['l', .3, -.2, .3, .2], ['c', -.4, -.34, .06, 'a'], ['c', .4, .34, .06, 'a']],
  scrubber:       [['c', 0, 0, .4], ['c', 0, 0, .26, 'a'], ['l', -.26, 0, .26, 0], ['l', 0, -.26, 0, .26]],
  fieldgen:       [['p', [0, -.46, .4, -.23, .4, .23, 0, .46, -.4, .23, -.4, -.23], true], ['c', 0, 0, .18, 'a'], ['c', 0, 0, .08]],
  fabricator:     [['r', -.44, -.3, .88, .6, .05], ['r', -.3, -.18, .6, .36, .03, 'a'], ['l', 0, -.3, 0, -.18], ['l', -.3, .0, .3, .0]],
  range:          [['r', -.46, -.34, .92, .68, .04], ['c', -.22, -.14, .12], ['c', .22, -.14, .12], ['c', -.22, .16, .12], ['c', .22, .16, .12, 'a']],
  servery:        [['r', -.46, -.32, .92, .24, .04], ['r', -.46, .06, .92, .24, .04, 'a'], ['l', -.2, -.32, -.2, -.08], ['l', .2, -.32, .2, -.08]],
  bar:            [['p', [-.46, .3, -.46, -.3, .46, -.3, .46, -.12, -.28, -.12, -.28, .3], true], ['c', .1, .12, .08, 'a'], ['c', .32, .12, .08, 'a']],
  barstool:       [['c', 0, 0, .22], ['c', 0, 0, .08, 'a']],
  wastebin:       [['c', 0, 0, .28], ['l', -.2, -.2, .2, .2], ['l', .2, -.2, -.2, .2]],
  dishwasher:     [['r', -.34, -.4, .68, .8, .05], ['c', 0, .04, .2], ['r', -.26, -.34, .52, .1, .02, 'a']],
};
const SYM_ALIAS = { taskchair_plain: 'taskchair', fieldgen_damp: 'fieldgen', range_bare: 'range', bar_plain: 'bar', barback: 'bar' };
export const PROP_NAME_X = { helm: 'Helm station', baycontrol: 'Bay control', beampedestal: 'Beam pedestal', secdesk: 'Security desk', nursestation: "Nurses' station", holodesk: 'Holo desk', reactorstation: 'Reactor station', taskchair: 'Task chair', steriliser: 'Steriliser bench',
  surgical_table: 'Surgical table', med_dispenser: 'Medication dispenser', exam_couch: 'Exam couch', autopsy_table: 'Autopsy table', infusion_stand: 'Infusion stand', pumpskid: 'Pump skid', heatexch: 'Heat exchanger', scrubber: 'Scrubber', fieldgen: 'Field generator', fabricator: 'Fabricator',
  range: 'Range', servery: 'Servery', bar: 'Bar', barstool: 'Bar stool', wastebin: 'Waste bin', dishwasher: 'Dishwasher' };
/** drawPropSymbol(g, kind, s, C): draws the symbol centred on the current origin (the caller has done g.translate(cx, cy) as the deck-plans page does), s = tile symbol size in px,
 *  C = { panel, ink, sci } colours (strings). Returns true when it knows the kind (so the caller can fall back to its default box). */
export function drawPropSymbol(g, kind, s, C = { panel: '#1b2130', ink: '#9db2c8', sci: '#35e6d8' }) {
  const rec = PROP_SYMBOLS[kind] || PROP_SYMBOLS[SYM_ALIAS[kind]]; if (!rec) return false;
  g.save(); g.lineWidth = Math.max(1, s * 0.06); g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = C.ink;
  const paint = (acc) => { g.fillStyle = acc ? C.sci : C.panel; g.globalAlpha = acc ? 0.85 : 1; g.fill(); g.globalAlpha = 1; g.stroke(); };
  for (const op of rec) {
    g.beginPath();
    if (op[0] === 'r') { g.roundRect(op[1] * s, op[2] * s, op[3] * s, op[4] * s, (op[5] || 0) * s); paint(op[6] === 'a'); }
    else if (op[0] === 'c') { g.arc(op[1] * s, op[2] * s, op[3] * s, 0, 7); paint(op[4] === 'a'); }
    else if (op[0] === 'l') { g.moveTo(op[1] * s, op[2] * s); g.lineTo(op[3] * s, op[4] * s); g.stroke(); }
    else if (op[0] === 'p') { op[1].forEach((v, i) => { if (i % 2 === 0) { const x = v * s, y = op[1][i + 1] * s; i ? g.lineTo(x, y) : g.moveTo(x, y); } }); if (op[2]) g.closePath(); paint(op[3] === 'a'); }
    else if (op[0] === 'a') { g.arc(op[1] * s, op[2] * s, op[3] * s, op[4], op[5]); g.stroke(); }
  }
  g.restore(); return true;
}

// ================================================================ icon sheet (the viewer's HTML sheet; also usable for a docs page)
/** HTML string: U-1 glyphs (with the handheld ids they replace), U-2 badges for every category, G-1 emblem plates, and one badge per room icon. Needs installIcons() for the badges. */
export function iconSheetHtml(iconSvg, badgeSvg) {
  const cell = (inner, label) => `<figure>${inner}<figcaption>${label}</figcaption></figure>`;
  const u1 = Object.entries(HH_MAP).map(([id, ic]) => cell(iconSvg(ic, { size: 56, sw: 1.7 }), `${ic}<br><small>${id}</small>`)).join('');
  const u2 = Object.keys(CATS).map(k => cell(badgeSvg('person', k, { size: 56 }), `${k}${CATS_X[k] ? ' <b>new</b>' : ''}`)).join('');
  const g1 = EMBLEM_DEPTS.map(d => cell(emblemSvg(d, { size: 84 }), `${d}<br><small>${EMBLEMS[d].cat} shape · ${DEPT_LETTER[d]}</small>`)).join('');
  return `<h2>U-1 handheld glyphs</h2><div class="grid">${u1}</div><h2>U-2 badge shapes (new: flight, operations)</h2><div class="grid">${u2}</div><h2>G-1 department emblems</h2><div class="grid">${g1}</div>`;
}
