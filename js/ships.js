// The fleet: ten ships named for the Canadian provinces, in five original hull classes.
// A class is a parametric hull: inside(u, v, f) says whether a point of the deck plan is inside the hull, where
// u = port(-1)..starboard(+1), v = bow(-1)..stern(+1) and f = 0 (top deck) .. 1 (keel). The same function drives the
// playable deck outline (generate() masks the maze with it) and the schematic drawn on the deck card and ships.html.
// Layout conventions follow the genre's cutaway diagrams (command on top, habitat mid-ship, cargo/bays below,
// engineering low and aft, engines outboard) but none of the hull forms copies an existing design.

const disc = (u, v, r, cu = 0, cv = 0) => (u - cu) ** 2 + (v - cv) ** 2 <= r * r;
export const CLASSES = {
  cairn: {   // a stack of discs of different sizes, like a trail cairn; drive fins hang off the lowest stone
    name: 'Cairn', decks: 9, role: 'deep-range explorer', length: 310,
    inside(u, v, f) { const r = f < 0.12 ? 0.5 : f < 0.46 ? 1.0 : f < 0.58 ? 0.55 : f < 0.82 ? 0.82 : 0.6; return disc(u, v, r, 0, f >= 0.58 ? 0.15 : 0); },
    pods: [{ u: 0.78, v0: 0.35, v1: 1.15, f0: 0.62, f1: 0.8 }, { u: -0.78, v0: 0.35, v1: 1.15, f0: 0.62, f1: 0.8 }],
  },
  longhouse: {   // one long narrow keel with a raised bow house and a wide engine block aft
    name: 'Longhouse', decks: 8, role: 'patrol cruiser', length: 420,
    inside(u, v, f) { const w = v < -0.45 && f < 0.5 ? 0.72 : v > 0.55 && f > 0.4 ? 0.85 : f < 0.14 ? (v < -0.45 ? 0.72 : 0) : 0.42; return Math.abs(u) <= w && Math.abs(v) <= 1; },
    pods: [{ u: 0, v0: 0.3, v1: 1.25, f0: 1.04, f1: 1.2 }],
  },
  tandem: {   // twin hulls joined by a bridge wing forward and a hangar span amidships
    name: 'Tandem', decks: 7, role: 'fleet carrier', length: 380,
    inside(u, v, f) { const hull = Math.abs(u) >= 0.46 && Math.abs(u) <= 1 && Math.abs(v) <= 1; const span = Math.abs(u) < 0.46 && Math.abs(v) <= 0.26; const wing = f < 0.45 && Math.abs(u) < 0.46 && v > -0.85 && v < -0.55; return f < 0.12 ? wing || (Math.abs(u) <= 0.7 && v > -0.85 && v < -0.3) : hull || span || wing; },
    pods: [{ u: 0, v0: 0.5, v1: 1.25, f0: 0.55, f1: 0.8 }],
  },
  cruller: {   // a ring with four spokes and a hub; only the hub reaches the top and bottom decks
    name: 'Cruller', decks: 7, role: 'station tender', length: 260,
    inside(u, v, f) { const r2 = u * u + v * v; const hub = r2 <= 0.46 * 0.46, ring = r2 <= 1 && r2 >= 0.6 * 0.6, spoke = r2 <= 1 && (Math.abs(u) <= 0.17 || Math.abs(v) <= 0.17); return f < 0.2 || f > 0.85 ? hub || (f < 0.2 && spoke && r2 < 0.75 * 0.75) : hub || ring || spoke; },
    pods: [{ u: 0, v0: -0.2, v1: 0.2, f0: 1.05, f1: 1.3 }],
  },
  plough: {   // a wedge that widens aft, with a tall stern castle and an engine notch cut into the tail
    name: 'Plough', decks: 8, role: 'ice-belt breaker', length: 350,
    inside(u, v, f) { const w = 0.14 + (v + 1) / 2 * 0.86; const notch = f > 0.55 && v > 0.62 && Math.abs(u) < 0.3; const castle = v > 0.05 && Math.abs(u) <= 0.62; return Math.abs(v) <= 1 && (f < 0.3 ? castle && Math.abs(u) <= w : Math.abs(u) <= w && !notch); },
    pods: [{ u: 0.9, v0: 0.55, v1: 1.2, f0: 0.72, f1: 0.95 }, { u: -0.9, v0: 0.55, v1: 1.2, f0: 0.72, f1: 0.95 }],
  },
};

// registry suffix = the year the province joined Confederation
const S = (name, abbr, year, cls, wall, floor, light, accent, fog, fogD) => ({ name: 'USF ' + name, province: name, reg: `USF-${year}-${abbr}`, hull: cls, cls: CLASSES[cls].name, decks: CLASSES[cls].decks, wall, floor, light, accent, fog, fogD });
export const SHIPS = [
  S('Ontario', 'ON', 1867, 'cairn', 0xb9b2a0, 0x5b6470, 0xfff1d6, 0xd9733a, 0x1a1612, 0.055),
  S('Québec', 'QC', 1867, 'cairn', 0xcbbfa6, 0x6b5a4a, 0xffe9c4, 0x6a7fd0, 0x17130f, 0.05),
  S('Nova Scotia', 'NS', 1867, 'longhouse', 0x9aa4b0, 0x3b4658, 0xe6f0ff, 0x4d9fd6, 0x0f1319, 0.055),
  S('New Brunswick', 'NB', 1867, 'cruller', 0xb4ad9a, 0x4b4f5a, 0xfff0d2, 0xc8a13c, 0x15120d, 0.05),
  S('Manitoba', 'MB', 1870, 'tandem', 0xa8a597, 0x5a4f4f, 0xffe7c2, 0xb34a3a, 0x15110e, 0.06),
  S('British Columbia', 'BC', 1871, 'longhouse', 0x8c8f97, 0x2c3040, 0xdbe7ff, 0x8f6fd6, 0x0b0d14, 0.06),
  S('Prince Edward Island', 'PE', 1873, 'cruller', 0xd7d2c4, 0x7a8794, 0xf4f8ff, 0xe08a2f, 0x14161a, 0.045),
  S('Saskatchewan', 'SK', 1905, 'plough', 0xc2c9cf, 0x587a8c, 0xeef8ff, 0x3fae7a, 0x101618, 0.05),
  S('Alberta', 'AB', 1905, 'plough', 0x5d6168, 0x2d2f33, 0xd8e6ff, 0xc44a3a, 0x0c0e12, 0.07),
  S('Newfoundland and Labrador', 'NL', 1949, 'tandem', 0x6d7681, 0x20262e, 0xcfe2ff, 0x38c8c0, 0x080b10, 0.065),
];

// what a deck is for, by how far down the ship it is
export const ZONES = [
  { to: 0.13, label: 'Command', weights: { bridge: 5, quarters: 2, transporter: 1, holodeck: 1 } },
  { to: 0.46, label: 'Habitat', weights: { quarters: 4, mess: 3, sickbay: 2, holodeck: 2, arboretum: 2, transporter: 1 } },
  { to: 0.72, label: 'Services', weights: { mess: 2, sickbay: 2, cargo: 3, transporter: 2, shuttlebay: 2, quarters: 1 } },
  { to: 2, label: 'Engineering', weights: { engineering: 4, cargo: 3, shuttlebay: 2, transporter: 1 } },
];
export const zoneOf = (f) => ZONES.find(z => f <= z.to);
// which of a ship's decks game deck n (1..8, then endless) lands on: you ride the tubelift down through the hulls
export function shipDeckFor(ship, n, winDeck = 8) { return n <= winDeck ? Math.round((n - 1) / (winDeck - 1) * (ship.decks - 1)) : (n * 5) % ship.decks; }
export function deckOptions(ship, shipDeck) {
  const f = ship.decks > 1 ? shipDeck / (ship.decks - 1) : 0, c = CLASSES[ship.hull];
  return { inside: (u, v) => c.inside(u, v, f), weights: zoneOf(f).weights };
}

// ---- schematic: side elevation (all decks, current one lit) + plan of the current deck ----
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
function spans(c, f, n = 72) {   // fore-aft extent(s) of the hull at deck fraction f, as seen from the side
  const out = []; let open = null;
  for (let i = 0; i <= n; i++) { const v = -1 + 2 * i / n; let hit = false; for (let j = 0; j <= 24 && !hit; j++) hit = c.inside(-1 + j / 12, v, f); if (hit && open === null) open = v; if ((!hit || i === n) && open !== null) { out.push([open, hit ? v : v - 2 / n]); open = null; } }
  return out;
}
export function drawSchematic(canvas, ship, shipDeck = 0, { labels = true } = {}) {
  const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height, c = CLASSES[ship.hull], D = ship.decks, col = hex(ship.accent);
  g.clearRect(0, 0, W, H); g.lineJoin = 'round';
  const pad = W * 0.03, sideW = W * 0.52, x0 = pad, top = H * (labels ? 0.2 : 0.08), bot = H * 0.86, dh = (bot - top) / (D + 0.6), sx = (v) => x0 + (v + 1.3) / 2.6 * (sideW - pad);
  g.font = `${Math.round(H * 0.052)}px Arial`; g.textBaseline = 'middle';
  if (labels) { g.fillStyle = col; g.font = `bold ${Math.round(H * 0.075)}px Arial`; g.fillText(ship.name.toUpperCase(), pad, H * 0.065); g.font = `${Math.round(H * 0.05)}px Arial`; g.fillStyle = 'rgba(255,255,255,.7)'; g.fillText(`${ship.reg} · ${c.name.toUpperCase()}-CLASS ${c.role.toUpperCase()} · ${c.length} M · ${D} DECKS`, pad, H * 0.135); }
  // engine pods (not walkable)
  g.fillStyle = 'rgba(120,200,255,.28)'; g.strokeStyle = 'rgba(120,200,255,.8)'; g.lineWidth = 1;
  for (const p of c.pods) { const y = top + p.f0 * D * dh, h = (p.f1 - p.f0) * D * dh; g.beginPath(); g.roundRect(sx(p.v0), y, sx(p.v1) - sx(p.v0), h, h / 2); g.fill(); g.stroke(); }
  for (let i = 0; i < D; i++) {
    const f = D > 1 ? i / (D - 1) : 0, y = top + i * dh, cur = i === shipDeck;
    for (const [a, b] of spans(c, f)) { g.beginPath(); g.roundRect(sx(a), y + 1, Math.max(4, sx(b) - sx(a)), dh - 2, Math.min(5, dh / 3)); g.fillStyle = cur ? col : 'rgba(255,255,255,.1)'; g.fill(); g.strokeStyle = cur ? '#fff' : 'rgba(255,255,255,.45)'; g.lineWidth = cur ? 1.6 : 1; g.stroke(); }
    if (labels) { g.fillStyle = cur ? '#fff' : 'rgba(255,255,255,.45)'; g.font = `${cur ? 'bold ' : ''}${Math.round(Math.min(dh * 0.62, H * 0.045))}px Arial`; g.fillText(String(i + 1).padStart(2, '0'), sx(1.3) - W * 0.012, y + dh / 2); }
  }
  // zone brackets
  if (labels) { let f0 = 0; g.font = `${Math.round(H * 0.038)}px Arial`; for (const z of ZONES) { const i0 = Math.ceil(f0 * (D - 1) - 1e-6), i1 = Math.min(D - 1, Math.floor(Math.min(1, z.to) * (D - 1) + 1e-6)); if (i1 >= i0) { const ya = top + i0 * dh + 2, yb = top + (i1 + 1) * dh - 2, x = sx(1.3) + W * 0.022; g.strokeStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.moveTo(x - 4, ya); g.lineTo(x, ya); g.lineTo(x, yb); g.lineTo(x - 4, yb); g.stroke(); g.fillStyle = 'rgba(255,255,255,.55)'; g.fillText(z.label.toUpperCase(), x + 6, (ya + yb) / 2); } f0 = z.to + 1e-3; } }
  // plan of the current deck (bow up)
  const f = D > 1 ? shipDeck / (D - 1) : 0, px = sideW + W * 0.2, pw = W - px - pad, ph = bot - top, s = Math.min(pw, ph) / 2.5, cx = px + pw / 2, cy = top + ph / 2, n = 44, cell = 2.5 * s / n;
  g.fillStyle = 'rgba(120,200,255,.28)'; for (const p of c.pods) if (p.u !== 0 || p.f0 < 0 || p.f0 > 1) { const w = 0.16 * s; g.beginPath(); g.roundRect(cx + p.u * s - w / 2, cy + p.v0 * s, w, (p.v1 - p.v0) * s, w / 2); g.fill(); }
  g.fillStyle = col; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const u = -1.25 + 2.5 * (i + 0.5) / n, v = -1.25 + 2.5 * (j + 0.5) / n; if (c.inside(u, v, f)) g.fillRect(cx + u * s - cell / 2, cy + v * s - cell / 2, cell + 0.6, cell + 0.6); }
  if (labels) { g.fillStyle = 'rgba(255,255,255,.7)'; g.font = `${Math.round(H * 0.045)}px Arial`; g.textAlign = 'center'; g.fillText(`DECK ${String(shipDeck + 1).padStart(2, '0')} · ${zoneOf(f).label.toUpperCase()}`, cx, bot + H * 0.07); g.fillText('▲ BOW', cx, top - H * 0.035); g.textAlign = 'left'; g.fillText('PROFILE', pad, bot + H * 0.07); }
}
