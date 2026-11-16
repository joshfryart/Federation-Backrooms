// Shared builder kit for art batches 7 and 8 (js/propart-stations2.js, js/propart-security.js).
// A verbatim copy of the helper half of js/propart-stations1.js (which does not export its helpers and must not be edited in an art batch):
// generated glyph-bar screen textures, department themes, shared materials, the merged-box builder `B`, the task chair and `finish`.
// Additions for these batches: extra screen textures registered into KINDS_TEX, extra themes into TH (both exported and mutable), `bevel` for item art is NOT here.
// Usage: import { THREE, B, mats, scr, finish, seated, stationChair, makeChair, TH, KINDS_TEX, PI, rr, scan, bars, ctex, rng } from './propart-kit2.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PI = Math.PI;
// ---------------------------------------------------------------- generated screen textures (glyph bars only, no text)
const texCache = {};
function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function ctex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const rr = (g, x, y, w, h, r, c) => { g.fillStyle = c; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
const scan = (g, w, h, a = 0.22) => { g.fillStyle = `rgba(0,0,0,${a})`; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1); };
function bars(g, R, x, y, w, rows, c, rh = 6, gap = 9) { for (let i = 0; i < rows; i++) { let xx = x; const yy = y + i * gap; while (xx < x + w - 8) { const bw = 6 + R() * 28; g.fillStyle = c; g.globalAlpha = 0.5 + R() * 0.5; g.fillRect(xx, yy, Math.min(bw, x + w - xx), rh); xx += bw + 4; } } g.globalAlpha = 1; }

const KINDS_TEX = {
  screen(g, w, h, a, R) {            // general data screen: side tabs, tiles, glyph rows, trace
    g.fillStyle = '#04070c'; g.fillRect(0, 0, w, h);
    rr(g, 6, 6, 44, h * 0.42, [20, 0, 0, 20], a[0]); rr(g, 6, h * 0.5, 44, h * 0.46, [20, 0, 0, 20], a[2]); rr(g, 56, 6, w - 62, 14, 7, a[1]);
    for (let i = 0; i < 6; i++) rr(g, 56 + (i % 3) * ((w - 62) / 3), 28 + Math.floor(i / 3) * 24, (w - 62) / 3 - 6, 18, 9, a[(i * 5 + 1) % 3]);
    bars(g, R, 58, h * 0.52, w - 70, 6, a[0], 5, 11);
    g.strokeStyle = a[2]; g.lineWidth = 2; g.beginPath(); for (let x = 0; x < w * 0.35; x++) g.lineTo(w * 0.62 + x, h * 0.84 + Math.sin(x * 0.4) * 9 * Math.sin(x * 0.11 + R() * 0.02)); g.stroke(); scan(g, w, h);
  },
  keys(g, w, h, a, R) {              // control surface: key grid, a few lit, glyph strips
    g.fillStyle = '#0a0d12'; g.fillRect(0, 0, w, h); const cols = 12, rows = 5, cw = (w - 16) / cols, ch = (h - 40) / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const lit = R() < 0.3; rr(g, 8 + c * cw + 2, 34 + r * ch + 2, cw - 4, ch - 4, 4, lit ? a[(r + c) % 3] : '#222833'); }
    bars(g, R, 10, 8, w - 20, 2, a[0], 5, 11); scan(g, w, h, 0.12);
  },
  fader(g, w, h, a, R) {             // fader plate: slot guides + tick marks
    g.fillStyle = '#0d1016'; g.fillRect(0, 0, w, h); const n = 8, cw = w / n;
    for (let i = 0; i < n; i++) { rr(g, i * cw + cw / 2 - 3, 14, 6, h - 28, 3, '#000'); g.fillStyle = a[i % 3]; for (let t = 0; t < 9; t++) g.fillRect(i * cw + cw / 2 + 8, 14 + t * (h - 36) / 8, 10, 2); rr(g, i * cw + 6, 4, cw - 12, 5, 2, a[(i + 1) % 3]); }
  },
  ecg(g, w, h, a, R) {               // six bed traces with a bed-tag chip and glyph vitals per row
    g.fillStyle = '#03080a'; g.fillRect(0, 0, w, h); const rows = 6, rh = h / rows; const cs = ['#58f0a0', '#58f0a0', '#f0f4f0', '#ffd060', '#58f0a0', '#60b8ff'];
    for (let r = 0; r < rows; r++) { const y0 = r * rh + rh * 0.55; rr(g, 4, r * rh + 5, 16, rh - 10, 3, cs[r]); g.strokeStyle = cs[r]; g.lineWidth = 1.6; g.beginPath(); const sh = r % 3;
      for (let x = 26; x < w * 0.72; x++) { const p = (x + r * 13) % (34 + sh * 6); let y = 0; if (p === 12) y = -rh * 0.38; else if (p === 14) y = rh * 0.22; else if (p > 20 && p < 27) y = -Math.sin((p - 20) / 7 * PI) * 4; g.lineTo(x, y0 + y); } g.stroke();
      for (let k = 0; k < 2; k++) rr(g, w * 0.76, r * rh + 8 + k * (rh / 2 - 4), 24 + R() * 40, rh / 2 - 10, 2, cs[r]); }
    scan(g, w, h, 0.25);
  },
  cctv(g, w, h, a, R) {              // dim camera view: perspective corridor, a door, a figure-less floor, a record dot, timestamp glyphs
    g.fillStyle = '#0e1612'; g.fillRect(0, 0, w, h); const vx = w * (0.38 + R() * 0.24), vy = h * 0.46;
    g.fillStyle = '#1d2a22'; g.beginPath(); g.moveTo(0, h); g.lineTo(vx - 18, vy + 8); g.lineTo(vx + 18, vy + 8); g.lineTo(w, h); g.fill();
    g.fillStyle = '#16211b'; g.beginPath(); g.moveTo(0, 0); g.lineTo(vx - 18, vy - 8); g.lineTo(vx - 18, vy + 8); g.lineTo(0, h); g.fill(); g.beginPath(); g.moveTo(w, 0); g.lineTo(vx + 18, vy - 8); g.lineTo(vx + 18, vy + 8); g.lineTo(w, h); g.fill();
    g.strokeStyle = '#38503f'; g.lineWidth = 1; for (let i = 0; i < 7; i++) { const t = i / 7; g.beginPath(); g.moveTo(vx - 18, vy - 8 + t * 16); g.lineTo(0, t * h); g.moveTo(vx + 18, vy - 8 + t * 16); g.lineTo(w, t * h); g.stroke(); }
    g.fillStyle = '#2c3d33'; g.fillRect(vx - 10, vy - 4, 20, 14); g.fillStyle = a[0]; g.fillRect(vx - 2, vy - 1, 4, 3);
    g.fillStyle = '#ff3a2a'; g.beginPath(); g.arc(12, 12, 4, 0, 7); g.fill(); bars(g, R, 22, 9, w * 0.4, 1, '#c8e8d0', 5, 9); bars(g, R, w * 0.62, h - 14, w * 0.34, 1, '#c8e8d0', 5, 9);
    g.fillStyle = 'rgba(200,255,220,0.05)'; for (let i = 0; i < 90; i++) g.fillRect(R() * w, R() * h, 2 + R() * 6, 1); scan(g, w, h, 0.3);
  },
  annun(g, w, h, a, R) {             // annunciator tiles 6 x 3, some lit amber / red / white
    g.fillStyle = '#07080a'; g.fillRect(0, 0, w, h); const cols = 6, rows = 3, cw = w / cols, ch = h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const v = R(); const col = v < 0.12 ? '#ff3a2a' : v < 0.4 ? a[0] : v < 0.5 ? '#ffffff' : null; rr(g, c * cw + 3, r * ch + 3, cw - 6, ch - 6, 4, col || '#1b1d22'); g.fillStyle = col ? 'rgba(0,0,0,0.65)' : '#2d3038'; g.fillRect(c * cw + 9, r * ch + ch / 2 - 3, cw - 18, 3); g.fillRect(c * cw + 9, r * ch + ch / 2 + 4, (cw - 18) * 0.6, 3); }
  },
  plan(g, w, h, a, R) {              // deck plan with one lamp per cell
    g.fillStyle = '#10131a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#59606e'; g.lineWidth = 3; g.strokeRect(6, 6, w - 12, h - 12); g.beginPath(); g.moveTo(6, h * 0.5); g.lineTo(w - 6, h * 0.5); g.stroke();
    const n = 5, cw = (w - 20) / n; for (let i = 0; i < n; i++) for (const row of [0, 1]) { const x = 10 + i * cw, y = row ? h * 0.55 : 12; g.strokeStyle = '#59606e'; g.lineWidth = 2; g.strokeRect(x + 3, y, cw - 6, h * 0.38); const v = R(); g.fillStyle = v < 0.5 ? '#40e070' : v < 0.8 ? '#ff3a2a' : '#2a2e36'; g.beginPath(); g.arc(x + cw / 2, y + h * 0.19, 6, 0, 7); g.fill(); }
  },
  keycab(g, w, h, a, R) {            // key board: rows of hooks with coloured tags
    g.fillStyle = '#17191e'; g.fillRect(0, 0, w, h); const cols = 6, rows = 6, cw = w / cols, ch = h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { g.fillStyle = '#3a3f49'; g.fillRect(c * cw + cw / 2 - 1, r * ch + 4, 2, 8); if (R() < 0.75) rr(g, c * cw + cw / 2 - 7, r * ch + 12, 14, ch - 18, 3, ['#ffb030', '#40a0ff', '#e04030', '#40d070', '#c8ccd4'][Math.floor(R() * 5)]); }
  },
  charts(g, w, h, a, R) {            // chart rack: clipboards with row lines and coloured corner tabs
    g.fillStyle = '#d9dfe3'; g.fillRect(0, 0, w, h); const cols = 4, rows = 2, cw = w / cols, ch = h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { rr(g, c * cw + 5, r * ch + 5, cw - 10, ch - 10, 4, '#f6f8f9'); g.fillStyle = ['#d83a3a', '#40a0ff', '#58c890', '#ffb030'][(r * 4 + c) % 4]; g.fillRect(c * cw + 5, r * ch + 5, cw - 10, 8); g.fillStyle = '#9aa4ac'; for (let k = 0; k < 6; k++) g.fillRect(c * cw + 12, r * ch + 22 + k * 11, (cw - 24) * (0.5 + R() * 0.5), 3); }
  },
  readout(g, w, h, a, R) {           // large block-digit readout (seven bar segments, no characters) + level bar
    g.fillStyle = '#04070a'; g.fillRect(0, 0, w, h); const nd = 4, dw = (w - 20) / nd;
    for (let d = 0; d < nd; d++) { const x = 10 + d * dw + 6, y = 14, W = dw - 22, H = h * 0.5; for (const [sx, sy, sw, sh] of [[0, 0, W, 8], [0, H / 2 - 4, W, 8], [0, H - 8, W, 8], [0, 0, 8, H / 2], [W - 8, 0, 8, H / 2], [0, H / 2, 8, H / 2], [W - 8, H / 2, 8, H / 2]]) { g.fillStyle = R() < 0.65 ? a[0] : '#161a20'; g.fillRect(x + sx, y + sy, sw, sh); } }
    rr(g, 10, h * 0.78, w - 20, 12, 6, '#161a20'); rr(g, 10, h * 0.78, (w - 20) * 0.7, 12, 6, a[1]); scan(g, w, h, 0.18);
  },
  dial(g, w, h, a, R) {              // round gauge: arc ticks, needle, no digits
    g.fillStyle = '#e8ecee'; g.fillRect(0, 0, w, h); const c = w / 2; g.fillStyle = '#14171c'; g.beginPath(); g.arc(c, c, c * 0.94, 0, 7); g.fill();
    for (let i = 0; i <= 20; i++) { const an = PI * 0.8 + (i / 20) * PI * 1.4; g.strokeStyle = i > 16 ? '#ff3a2a' : '#e8ecee'; g.lineWidth = i % 5 ? 3 : 6; g.beginPath(); g.moveTo(c + Math.cos(an) * c * 0.72, c + Math.sin(an) * c * 0.72); g.lineTo(c + Math.cos(an) * c * 0.86, c + Math.sin(an) * c * 0.86); g.stroke(); }
    const an = PI * 0.8 + 0.58 * PI * 1.4; g.strokeStyle = a[0]; g.lineWidth = 7; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(an) * c * 0.7, c + Math.sin(an) * c * 0.7); g.stroke(); g.fillStyle = '#e8ecee'; g.beginPath(); g.arc(c, c, 9, 0, 7); g.fill();
  },
};
function tex(kind, themeKey, seed = 1, w = 256, h = 160) {
  const k = `${kind}|${themeKey}|${seed}|${w}|${h}`; if (texCache[k]) return texCache[k];
  const a = TH[themeKey].screen; return texCache[k] = ctex(w, h, (g, W, H) => KINDS_TEX[kind](g, W, H, a, rng(seed * 9973 + 17)));
}

// ---------------------------------------------------------------- themes and shared materials
const TH = {
  flight:   { body: 0x2a3446, top: 0x1b2230, acc: 0x4ac0ff, seat: 0x35486a, screen: ['#58b8ff', '#f0a050', '#d8ecff'] },
  ops:      { body: 0x233c3e, top: 0x16262a, acc: 0x2fe0c8, seat: 0x2d5658, screen: ['#34e8d0', '#c8f4ee', '#f0a050'] },
  eng:      { body: 0x3a3430, top: 0x24201e, acc: 0xffa040, seat: 0x6a4a30, screen: ['#ffa040', '#ff5a30', '#ffd890'] },
  security: { body: 0x3a3e46, top: 0x23262c, acc: 0xffb030, seat: 0x4a4e58, screen: ['#c8ccd4', '#ffb030', '#58f0a0'] },
  medical:  { body: 0xe3e9ec, top: 0xc9d2d8, acc: 0xd83a3a, seat: 0xcfd6dc, screen: ['#58f0a0', '#2aa870', '#e8f8f0'] },
  holo:     { body: 0x2c2838, top: 0x1c1a26, acc: 0xffb030, seat: 0x4a3a62, screen: ['#ffb030', '#b070ff', '#fff0c8'] },
};
const MT = {};
function mats(th) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  if (!MT.dark) {
    MT.dark = std({ color: 0x1d2026, metalness: 0.55, roughness: 0.5 });
    MT.metal = std({ color: 0x9aa0a8, metalness: 0.85, roughness: 0.38 });
    MT.rubber = std({ color: 0x0f1012, roughness: 0.85 });
    MT.plastic = std({ color: 0x14161a, roughness: 0.6 });
    MT.white = std({ color: 0xe6ecef, roughness: 0.35 });
    MT.glass = std({ color: 0xaed4ff, roughness: 0.1, transparent: true, opacity: 0.22 });
    MT.redGuard = std({ color: 0xff4030, roughness: 0.2, transparent: true, opacity: 0.42 });
    MT.yelGuard = std({ color: 0xffd030, roughness: 0.2, transparent: true, opacity: 0.4 });
    MT.hazard = std({ color: 0xd8a818, roughness: 0.6, metalness: 0.2 });
    MT.red = std({ color: 0xc02820, roughness: 0.4 }); MT.redLit = new THREE.MeshBasicMaterial({ color: 0xff3a2a });
    MT.amberLit = new THREE.MeshBasicMaterial({ color: 0xffb030 }); MT.greenLit = new THREE.MeshBasicMaterial({ color: 0x40ff70 });
    MT.slot = new THREE.MeshBasicMaterial({ color: 0x050607 });
  }
  if (!MT['body_' + th]) {
    const T = TH[th];
    MT['body_' + th] = std({ color: T.body, metalness: th === 'medical' ? 0.05 : 0.5, roughness: th === 'medical' ? 0.35 : 0.5 });
    MT['top_' + th] = std({ color: T.top, metalness: th === 'medical' ? 0.05 : 0.4, roughness: 0.45 });
    MT['glow_' + th] = new THREE.MeshBasicMaterial({ color: T.acc });
    MT['acc_' + th] = std({ color: T.acc, metalness: 0.3, roughness: 0.45 });
    MT['seat_' + th] = std({ color: T.seat, roughness: 0.92 });
  }
  return { ...MT, body: MT['body_' + th], top: MT['top_' + th], glow: MT['glow_' + th], acc: MT['acc_' + th], seat: MT['seat_' + th] };
}
const SM = {};                                  // textured self-lit screen materials (shared per texture key)
function scr(kind, th, seed, w, h) { const k = `${kind}|${th}|${seed}|${w}|${h}`; return SM[k] || (SM[k] = new THREE.MeshBasicMaterial({ map: tex(kind, th, seed, w, h), color: new THREE.Color(1.35, 1.35, 1.35) })); }

// ---------------------------------------------------------------- builder: collects boxes/cylinders under a matrix stack, merges per material
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const geoCache = {};
const G = (k, f) => geoCache[k] || (geoCache[k] = f());
class B {
  constructor() { this.by = new Map(); this.st = [new THREE.Matrix4()]; this.tris = 0; }
  push(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { const m = new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s); this.st.push(this.st[this.st.length - 1].clone().multiply(m)); return this; }
  pop() { this.st.pop(); return this; }
  put(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
    const g = geo.clone(); g.applyMatrix4(this.st[this.st.length - 1].clone().multiply(new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s)));
    const ng = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ng.deleteAttribute(k);
    if (!this.by.has(mat)) this.by.set(mat, []); this.by.get(mat).push(ng); this.tris += ng.attributes.position.count / 3;
  }
  box(w, h, d, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { this.put(G(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), mat, x, y + h / 2, z, rx, ry, rz); return this; }
  cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 14, rx = 0, ry = 0, rz = 0) { this.put(G(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), mat, x, y + h / 2, z, rx, ry, rz); return this; }
  sph(r, mat, x, y, z, seg = 10) { this.put(G(`s${r},${seg}`, () => new THREE.SphereGeometry(r, seg, seg - 3)), mat, x, y, z); return this; }
  // screen with bezel: local frame origin at the bottom centre of the panel; the picture faces +z
  panel(w, h, smat, bez, x, y, z, rx = 0, ry = 0) { this.push(x, y, z, rx, ry); this.box(w + 0.04, h + 0.04, 0.05, bez, 0, 0, 0); this.box(w, h, 0.01, smat, 0, 0.02, 0.026); this.pop(); return this; }
  // side-profile prism: profile = [[z,y],...] (counter-clockwise seen from +x), extruded across width w centred on x
  prism(pts, w, mat, x = 0) {
    const s = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1]))); const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.rotateY(-PI / 2); g.translate(w / 2, 0, 0);
    this.put(g, mat, x, 0, 0); return this;
  }
  done(name) {
    const grp = new THREE.Group(); if (name) grp.name = name;
    for (const [mat, geos] of this.by) { const m = new THREE.Mesh(geos.length > 1 ? mergeGeometries(geos) : geos[0], mat); m.castShadow = m.receiveShadow = true; grp.add(m); }
    grp.userData.tris = this.tris; return grp;
  }
}

// ---------------------------------------------------------------- X-1 task chair (fixed pedestal, five-star base on bolted glides, no castors)
// Chair frame: front (knees) is +z, origin on the floor under the column.  Seat top 0.48 m, seat 0.45 x 0.45 m, back top 0.90 m.
function chairBase(b, M) {
  b.cyl(0.075, 0.09, 0.05, M.metal, 0, 0.02, 0, 12);                                 // hub boss
  for (let k = 0; k < 5; k++) { const a = k * 2 * PI / 5; b.push(0, 0, 0, 0, a, 0); b.box(0.055, 0.032, 0.30, M.dark, 0, 0.03, 0.15, -0.06); b.cyl(0.03, 0.036, 0.034, M.rubber, 0, 0, 0.29, 8); b.cyl(0.012, 0.012, 0.006, M.metal, 0, 0.062, 0.26, 6); b.pop(); }
  b.cyl(0.05, 0.058, 0.2, M.dark, 0, 0.065, 0, 12);                                  // gas-lift sleeve
  b.cyl(0.032, 0.032, 0.17, M.metal, 0, 0.26, 0, 10);                                // piston
}
function chairTop(b, M, arms) {
  b.box(0.22, 0.045, 0.2, M.dark, 0, 0.375, 0);                                      // seat mechanism
  b.box(0.45, 0.03, 0.45, M.dark, 0, 0.405, 0);                                      // seat pan
  b.box(0.45, 0.048, 0.45, M.seat, 0, 0.432, 0);                                     // cushion (top = 0.48)
  b.box(0.44, 0.03, 0.05, M.seat, 0, 0.405, 0.225, 0.35);                            // waterfall front edge
  b.box(0.05, 0.3, 0.035, M.metal, 0, 0.44, -0.22, -0.1);                            // back stem
  b.box(0.4, 0.34, 0.06, M.seat, 0, 0.56, -0.265, -0.12);                            // low back, top ~0.90
  b.box(0.38, 0.05, 0.02, M.dark, 0, 0.55, -0.31, -0.12);                            // lumbar strap
  if (arms) for (const sx of [-1, 1]) { b.box(0.035, 0.2, 0.035, M.metal, sx * 0.255, 0.43, -0.04); b.box(0.065, 0.035, 0.27, M.rubber, sx * 0.255, 0.63, 0.04); }
}
function makeChair(th, arms) {
  const M = mats(th), g = new THREE.Group(), b1 = new B(), b2 = new B(); chairBase(b1, M); chairTop(b2, M, arms);
  const base = b1.done('base'), top = b2.done('swivel'); g.add(base, top);          // 'swivel' may be rotated about y (the column axis is the origin)
  g.userData = { tris: base.userData.tris + top.userData.tris, seat: { x: 0, y: 0.48, z: 0, yaw: 0 }, dept: th }; return g;
}
// chair placed for a station: at pelvis point (x, z), facing -z (toward the desk), in a named group
function stationChair(th, x, z, arms = true, yaw = PI) { const c = makeChair(th, arms); c.position.set(x, 0, z); c.rotation.y = yaw; const grp = new THREE.Group(); grp.name = 'chair'; grp.add(c); grp.userData.tris = c.userData.tris; return grp; }

function finish(g, name, dept, extra = {}) {
  g.name = name; let tris = 0; g.traverse(o => { if (o.isMesh) tris += o.geometry.attributes.position.count / 3; });
  Object.assign(g.userData, { name, dept, tris }, extra); return g;
}
const seated = (x, z) => ({ seat: { x, y: 0.48, z, yaw: PI }, spots: [[x, +(z - 0.41).toFixed(2), PI]] });
export { PI, rr, scan, bars, ctex, rng, tex, TH, KINDS_TEX, mats, scr, B, makeChair, stationChair, finish, seated, THREE };
