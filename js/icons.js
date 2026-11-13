// Shared icon set: one consistent 24px stroke family (1.7px, round caps/joins),
// path-only so the same string feeds inline SVG and canvas Path2D alike.
// Pure data module (no DOM at import time) so node tests and the HUD modules
// (wheel, duty board, radio cards, nav/minimap) can all import it.
//
// Sources: docs/mockups/nav-hud.html (rooms, duty verbs, systems, alerts, ui)
// and docs/mockups/menus.html (wheel / radio / duty-quality glyphs). Circles
// and rects from the mockup sprites are converted to path data via C()/R().
//
//   iconSvg('reactor')                          -> '<svg class="ico" ...><path d="..."/></svg>'
//   iconSvg('reactor', {size:18, color:'#fff', cls:'x', title:'Reactor', sw:2})
//   badgeSvg('engineering', 'engineering')      -> category shape + icon (hue AND shape)
//   drawIcon(ctx, 'map', x, y, size, color)      -> canvas stroke (needs Path2D)
//   ICONS.map                                    -> raw path string

// ---- path helpers ------------------------------------------------------------------------------
/** circle as two arcs */
export const C = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
/** rect, optional corner radius */
export const R = (x, y, w, h, r = 0) => r
  ? `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`
  : `M${x} ${y}h${w}v${h}h${-w}z`;
/** ellipse */
const E = (x, y, rx, ry) => `M${x - rx} ${y}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0`;

// ---- the set -----------------------------------------------------------------------------------
export const ICONS = {
  // rooms (keys match G.plan room types where they exist)
  bridge: 'M12 3l2.6 5.8 6.4.7-4.8 4.3 1.4 6.3L12 17l-5.6 3.1 1.4-6.3L3 9.5l6.4-.7z',
  readyroom: 'M6 3h12v18H6z M9 8h6 M9 12h6 M9 16h3',
  engineering: C(12, 12, 3) + 'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6 6l3 3 M15 15l3 3 M18 6l-3 3 M9 15l-3 3',
  sickbay: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  mess: 'M7 3v7a2 2 0 0 0 4 0V3 M9 3v18 M17 3c-2.5 2-3 6-1 9h1v9',
  transporter: 'M4 18q8 4 16 0 M4 18q0-3 8-3t8 3 M12 3v9 M8 6l4-3 4 3 M7 11l1 2 M17 11l-1 2',
  shuttlebay: 'M12 3l3 6v8l2 3H7l2-3V9z M3 14l6 1 M21 14l-6 1',
  cargo: 'M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10',
  holodeck: 'M4 20V10a8 5 0 0 1 16 0v10 M4 15h16 M12 5v15',
  quarters: 'M3 19V6 M3 15h18v4 M21 19v-4a3 3 0 0 0-3-3h-7v3 ' + C(6.5, 11, 1.5),
  arboretum: 'M12 21v-8 M12 13c-5 0-7-4-7-8 5 0 7 3 7 8z M12 16c4 0 6-3 6-7-4 0-6 3-6 7z',
  brig: 'M5 4h14v16H5z M9 4v16 M12 4v16 M15 4v16',
  armory: C(12, 12, 6) + 'M12 3v5 M12 16v5 M3 12h5 M16 12h5',
  gym: 'M3 9v6 M6 7v10 M18 7v10 M21 9v6 M6 12h12',
  lab: 'M9 3h6 M10 3v6l-5 10a1.5 1.5 0 0 0 1.4 2h11.2a1.5 1.5 0 0 0 1.4-2l-5-10V3 M7.5 15h9',
  laundry: 'M5 3h14v18H5z M5 8h14 ' + C(12, 14.5, 3.5),
  lounge: 'M4 11a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5H4z M2 12v6h20v-6 M6 18v2 M18 18v2',
  workshop: 'M4 20l9-9 M10 6l4-3 5 5-3 4z M6 14l4 4',
  plant: 'M3 8h18 M3 16h18 M8 8v8 M16 8v8 M12 4v4 M10 4h4',
  morgue: 'M4 5h16v14H4z M4 12h16 M10 8.5h4 M10 15.5h4',
  datacore: 'M4 4h16v6H4z M4 14h16v6H4z M7 7h.01 M7 17h.01 M11 7h6 M11 17h6',
  stores: 'M4 3v18 M20 3v18 M4 9h16 M4 15h16 M7 6h4 M13 12h4 M7 18h5',
  washroom: 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z',
  airlock: 'M6 21V8a6 6 0 0 1 12 0v13z M12 8v5 M9 13h6',
  jefferies: 'M4 9h16 M4 15h16 M4 9a3 3 0 0 0 0 6 M20 9a3 3 0 0 1 0 6',
  lift: 'M5 3h14v18H5z M12 3v18 M7 10l2.5-3 2.5 3 M13 14l2.5 3 2.5-3',
  // duty / task verbs
  inspect: C(11, 11, 6) + 'M16 16l5 5',
  log: 'M8 4h8v3H8z M6 5h12v16H6z M9 12h6 M9 16h6',
  repair: 'M14 7a4 4 0 0 1 4-4l-2 3 2 2 3-2a4 4 0 0 1-5 5L8 20a2 2 0 0 1-3-3z',
  patrol: C(5, 19, 2) + C(19, 5, 2) + 'M7 19h7a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h7',
  deliver: 'M2 7h12v10H2z M14 10h4l3 3v4h-7 ' + C(6, 19.5, 1.5) + C(17, 19.5, 1.5),
  calib: 'M4 7h10 M18 7h2 M4 17h2 M10 17h10 M16 5v4 M8 15v4',
  scan: 'M12 12l7-5 M12 21a9 9 0 1 1 9-9 M12 17a5 5 0 1 1 5-5',
  restock: 'M3 8l9-4 9 4-9 4z M3 12l9 4 9-4 M3 16l9 4 9-4',
  report: 'M4 5h16v11H9l-5 4z M8 9h8 M8 12h5',
  person: C(12, 8, 3.5) + 'M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2',
  clean: 'M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z M18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z',
  // ship systems
  reactor: 'M9 3h6v18H9z M9 8h6 M9 14h6 M12 10.5h.01',
  eps: 'M13 2L5 14h6l-1 8 8-12h-6z',
  gravity: 'M12 3v13 M6 11l6 6 6-6 M5 21h14',
  life: 'M12 4v8 M8.5 6C5 8 4 13 5 18c3 0 5-2 5-5 M15.5 6c3.5 2 4.5 7 3.5 12-3 0-5-2-5-5',
  coolant: 'M12 2v20 M4 7l16 10 M20 7L4 17',
  lighting: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-4 10.5V16h8v-2.5A6 6 0 0 0 12 3z',
  security: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z M9 12l2 2 4-4',
  charger: 'M3 8h16v8H3z M21 11v2 M7 11v2 M10 11v2 M13 11v2',
  sensors: 'M12 21v-9 M8 21h8 M6 8a8 8 0 0 1 12 0 M8.7 10.5a4.5 4.5 0 0 1 6.6 0 M12 12h.01',
  replicator: 'M4 4h16v16H4z M8 10h8l-1 6H9z M12 6v1',
  helm: C(12, 12, 3) + C(12, 12, 9) + 'M12 3v6 M12 15v6 M3 12h6 M15 12h6',
  comms: 'M12 21v-8 M12 13h.01 M7.5 8.5a6.5 6.5 0 0 1 9 0 M4.5 5.5a11 11 0 0 1 15 0',
  dampers: 'M3 12h3l2.5-6 3 12 3-12 2.5 6h4',
  holo: 'M12 3l8 4v10l-8 4-8-4V7z M4 7l8 4 8-4 M12 11v10',
  emh: C(12, 8, 3) + 'M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2 M9 18h2l1-2 1 3 1-1h1',
  // alerts
  green: C(12, 12, 9) + 'M8 12l3 3 5-6',
  yellow: 'M12 3l10 18H2z M12 10v5 M12 18h.01',
  red: 'M8 3h8l5 5v8l-5 5H8l-5-5V8z M12 8v5 M12 16h.01',
  fire: 'M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-4 3-7 1 2 2 2 3-5z',
  breach: 'M3 3l5 4-3 3 5 2-3 4 5 2-2 4 M21 6l-4 3 3 3-4 3 3 3',
  power: 'M13 2L5 14h6l-1 8 8-12h-6z',
  bio: C(12, 12, 2) + 'M12 10V3 M10.3 13l-6 3.5 M13.7 13l6 3.5 ' + C(12, 12, 9),
  // generic ui
  pin: 'M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z ' + C(12, 10, 2.5),
  clock: C(12, 12, 9) + 'M12 7v5l3 2',
  check: 'M4 12l5 5 11-11',
  warn: 'M12 3l10 18H2z M12 10v5 M12 18h.01',
  lock: 'M6 11h12v10H6z M8 11V8a4 4 0 0 1 8 0v3',
  guide: 'M3 11l18-8-8 18-2-8z',
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v16 M15 6v16',
  radio: 'M5 10v4h3l5 4V6l-5 4z M16 9a4 4 0 0 1 0 6',
  chev: 'M8 5l7 7-7 7',
  back: 'M16 5l-7 7 7 7',
  turnR: 'M5 21v-8a4 4 0 0 1 4-4h9 M14 4l4 5-4 5',
  turnL: 'M19 21v-8a4 4 0 0 0-4-4H6 M10 4L6 9l4 5',
  straight: 'M12 21V5 M6 11l6-6 6 6',
  heart: 'M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z',
  bolt: 'M13 2L5 14h6l-1 8 8-12h-6z',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z ' + C(12, 12, 3),
  down: 'M12 4v14 M6 13l6 6 6-6',
  up: 'M12 20V6 M6 11l6-6 6 6',
  door: 'M6 21V4h12v17 M3 21h18 M14 12h.01',
  x: 'M6 6l12 12 M18 6L6 18',
  plus: 'M12 5v14 M5 12h14',
  dots: 'M6 12h.01 M12 12h.01 M18 12h.01',
  // wheel / menu glyphs (menus.html sprite)
  duty: R(5, 4, 14, 17, 1.5) + 'M9 4V3h6v1 M9 12l2 2 4-4 M9 17h6',
  do: 'M14.7 6.3a4 4 0 0 0-5.4 5.2L4 16.8 7.2 20l5.3-5.3a4 4 0 0 0 5.2-5.4l-2.4 2.4-2.3-.6-.6-2.3z',
  delegate: C(8, 8, 3) + 'M3 19c0-3 2.5-5 5-5s5 2 5 5 M15 7h6 M18.5 4.5L21 7l-2.5 2.5',
  flag: 'M6 21V4 M6 5h11l-2 4 2 4H6',
  order: 'M6 11l6-6 6 6 M6 18l6-6 6 6',
  hail: C(12, 12, 1.8) + 'M8.6 8.6a5 5 0 0 0 0 6.8 M15.4 8.6a5 5 0 0 1 0 6.8 M5.6 5.6a9 9 0 0 0 0 12.8 M18.4 5.6a9 9 0 0 1 0 12.8',
  command: 'M12 3l6.5 17-6.5-4-6.5 4z',
  heads: C(12, 7, 2.6) + C(5.5, 10, 2) + C(18.5, 10, 2) + 'M7.5 20c0-3.3 2-5 4.5-5s4.5 1.7 4.5 5 M2 18c0-2.3 1.5-3.5 3.5-3.5 M22 18c0-2.3-1.5-3.5-3.5-3.5',
  tools: R(6, 3, 12, 18, 2) + C(12, 9, 2.5) + 'M9 15h6 M9 18h4',
  ship: E(9, 12, 6, 3.5) + 'M15 12h6 M18 9v6 M9 8.5V5 M9 15.5V19',
  alert: 'M12 3l10 18H2z M12 10v5 M12 18v.5',
  list: 'M5 5h14 M5 10h14 M5 15h9 M5 20h12',
  console: R(3, 4, 18, 12, 1.5) + 'M8 20h8 M12 16v4 M7 9l2 2-2 2 M12 13h4',
  cart: 'M3 5h3l2 11h10l2-8H7 ' + C(9.5, 20, 1) + C(17, 20, 1),
  greet: 'M4 5h16v11H11l-4 4v-4H4z',
  ask: C(12, 12, 9) + 'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7 M12 17v.5',
  give: 'M3 14h5l3 2h5l3-3 M3 11v9 M14 4h7 M18 1.5L21 4l-3 2.5',
  grab: 'M8 12V6.5a1.5 1.5 0 0 1 3 0V11 M11 10V5a1.5 1.5 0 0 1 3 0v6 M14 8a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-2.5-4.5 1.7-1.1L8 15',
  pause: 'M8 5v14 M16 5v14',
  play: 'M7 4l13 8-13 8z',
  gear: C(12, 12, 3.5) + 'M12 2.5v3 M12 18.5v3 M2.5 12h3 M18.5 12h3 M5.3 5.3l2.1 2.1 M16.6 16.6l2.1 2.1 M18.7 5.3l-2.1 2.1 M7.4 16.6l-2.1 2.1',
  hypo: 'M4 20l5-5 M9 15l8-8 3 3-8 8z M14 6l4 4 M17 3l4 4',
  phaser: 'M3 11h12l2-2h4v4h-5l-2 3H8l-1 5H4z',
  padd: R(5, 3, 14, 18, 1.5) + 'M8 7h8 M8 11h8 M8 15h5',
  badge: C(12, 12, 9) + 'M12 6l3.5 10-3.5-2-3.5 2z',
  proper: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M8.5 12l2.5 2.5 4.5-5',
  rush: 'M13 3L5 14h6l-1 7 8-11h-6z',
  fake: 'M4 20l1-4L16 5l3 3L8 19z M14 7l3 3',
  skip: 'M5 5l9 7-9 7z M18 5v14',
  speaker: 'M4 9v6h4l5 4V5L8 9z M16 9a4 4 0 0 1 0 6 M18.5 6.5a8 8 0 0 1 0 11',
  intercom: R(6, 3, 12, 18, 2) + C(12, 9, 3) + 'M9 16h6',
  hand: 'M9 12V5.5a1.5 1.5 0 0 1 3 0V11 M12 9.5a1.5 1.5 0 0 1 3 0V13 M15 10.5a1.5 1.5 0 0 1 3 0V16a5 5 0 0 1-5 5h-1.5A5 5 0 0 1 7 18l-3.5-5.5L5 11.5 9 15',
  help: R(4, 4, 16, 16, 2) + 'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7 M12 17v.5',
  wave: 'M3 12h3l2-6 3 12 3-9 2 3h5',
  // handhelds / carry (Tools and Carry sectors)
  torch: 'M8 3h8l-1 6H9z M9 9h6v11a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z M12 13v3',
  tricorder: R(5, 3, 14, 18, 2) + 'M8 7h8v5H8z M8 15h2 M12 15h4 M8 18h8',
  spanner: 'M14 7a4 4 0 0 1 4-4l-2 3 2 2 3-2a4 4 0 0 1-5 5L8 20a2 2 0 0 1-3-3z',
  zapper: 'M4 14h9l3-3h4v6h-4l-3-3 M8 14v5 M13 3l-2 4h3l-2 4',
  putdown: 'M12 3v11 M7 9l5 5 5-5 M4 20h16',
  pickup: 'M12 14V3 M7 8l5-5 5 5 M4 20h16',
  throw: 'M4 20l6-6 M10 14c2-6 6-9 11-10-1 5-4 9-10 11z',
  empty: R(5, 5, 14, 14, 3) + 'M8 16l8-8',
  stun: C(12, 12, 8) + 'M12 7l-2 5h4l-2 5',
  // people / status / misc
  rank: 'M4 12h.01 M9 12h.01 M14 12h.01 M19 12h.01',
  dept: R(4, 4, 16, 16, 3),
  locate: C(12, 12, 7) + C(12, 12, 2) + 'M12 2v3 M12 19v3 M2 12h3 M19 12h3',
  star: 'M12 3l2.6 5.8 6.4.7-4.8 4.3 1.4 6.3L12 17l-5.6 3.1 1.4-6.3L3 9.5l6.4-.7z',
  thumb: 'M7 11v10H3V11z M7 11l4-8a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 21H7',
  mission: C(12, 12, 9) + C(12, 12, 5) + C(12, 12, 1),
  keyboard: R(2, 6, 20, 12, 2) + 'M6 10h.01 M10 10h.01 M14 10h.01 M18 10h.01 M7 14h10',
  mouse: R(7, 3, 10, 18, 5) + 'M12 7v3',
};

// ---- category shape / colour (department hue AND badge shape, nothing on hue alone) --------------
export const SHAPES = {
  square: 'M4 4h16v16H4z', hex: 'M12 2l9 5v10l-9 5-9-5V7z', circle: C(12, 12, 10),
  diamond: 'M12 1.5l10.5 10.5L12 22.5 1.5 12z', pent: 'M12 2.5l9.5 7-3.6 11.5H6.1L2.5 9.5z',
  squircle: 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z', tri: 'M12 2.5l10.5 18H1.5z',
};
export const CATS = {
  command: { n: 'Command', c: '#6ea8ff', s: 'square' }, engineering: { n: 'Engineering', c: '#e8892b', s: 'hex' },
  medical: { n: 'Medical', c: '#3fd6a0', s: 'circle' }, science: { n: 'Science', c: '#c58be0', s: 'diamond' },
  services: { n: 'Services', c: '#c6d25e', s: 'pent' }, crew: { n: 'Crew', c: '#9db2c8', s: 'squircle' },
  security: { n: 'Security', c: '#ff7a6b', s: 'tri' },
};

// crew departments (js/crew.js DEPARTMENTS ids): hue + letter, used by name tags, contact cards, wheel and portraits
export const DEPT_COL = { command: '#6ea8ff', flight: '#8fb7ff', operations: '#d6c85a', engineering: '#e8892b', security: '#ff7a6b', sciences: '#c58be0', medical: '#3fd6a0', services: '#c6d25e' };
export const DEPT_LETTER = { command: 'C', flight: 'F', operations: 'O', engineering: 'E', security: 'X', sciences: 'S', medical: 'M', services: 'V' };
export const deptCol = (p) => DEPT_COL[p?.dept] || '#9db2c8';


const escA = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** has(name): true when the set defines this icon */
export const hasIcon = (n) => Object.prototype.hasOwnProperty.call(ICONS, n);
/** path string, falling back to a neutral glyph */
export const iconPath = (n) => ICONS[n] || ICONS.dots;

/** Inline SVG string for one icon. opts: size (px, default none = css), color (stroke), sw (stroke width),
 *  cls (extra class), title (accessible label; otherwise aria-hidden), fill. */
export function iconSvg(name, opts = {}) {
  const { size, color = 'currentColor', sw = 1.7, cls = '', title, fill = 'none' } = opts;
  const wh = size ? ` width="${size}" height="${size}"` : '';
  const a11y = title ? ` role="img" aria-label="${escA(title)}"><title>${escA(title)}</title` : ' aria-hidden="true"';
  return `<svg class="ico${cls ? ' ' + cls : ''}" viewBox="0 0 24 24"${wh} fill="${fill}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${a11y}><path d="${iconPath(name)}"/></svg>`;
}

/** Category badge: tinted shape + white icon, as in the nav-hud minimap. cat = CATS key. */
export function badgeSvg(name, cat = 'crew', opts = {}) {
  const k = CATS[cat] || CATS.crew, { size, cls = 'bdg' } = opts;
  const wh = size ? ` width="${size}" height="${size}"` : '';
  return `<svg class="${cls}" viewBox="0 0 24 24"${wh} aria-hidden="true"><path d="${SHAPES[k.s]}" fill="${k.c}" fill-opacity=".22" stroke="${k.c}" stroke-width="1.6" stroke-linejoin="round"/><g transform="translate(12 12.6) scale(.5) translate(-12 -12)" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="${iconPath(name)}"/></g></svg>`;
}

/** Canvas stroke of an icon centred at (x,y), s px square. Path2D objects are cached. */
const P2 = {};
export function drawIcon(g, name, x, y, s, color = '#fff', lw = 1.7) {
  if (typeof Path2D === 'undefined') return;
  const p = P2[name] || (P2[name] = new Path2D(iconPath(name)));
  g.save(); g.translate(x - s / 2, y - s / 2); g.scale(s / 24, s / 24);
  g.strokeStyle = color; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(p); g.restore();
}

/** Hidden <svg> sprite with <symbol id="i-NAME"> for `<use href="#i-NAME">` users. */
export function spriteSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">` + Object.entries(ICONS).map(([k, d]) =>
    `<symbol id="i-${k}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></symbol>`).join('') + `</svg>`;
}
