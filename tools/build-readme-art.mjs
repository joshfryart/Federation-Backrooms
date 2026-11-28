// README art in the game's LCARS panel style -> docs/readme/*.svg (hero banner, PLAY NOW button, one header strip per README section, footer).
//   node tools/build-readme-art.mjs [--out docs/readme] [--png DIR]
//   needs: npm i --prefix /tmp/readme-tools opentype.js@1.3.4 @fontsource/antonio@5.0.20     (or README_TOOLS=<dir with node_modules>)
// Re-runnable and deterministic. Every label is converted to outlines (Antonio, SIL OFL 1.1, condensed like the game's --f-d stack), so the
// SVGs need no web font, carry no script and look the same in any <img> on GitHub. Palette and shapes follow css/lcars-buttons.css (pill with a
// cut-off end cap, label low and right, black gaps) and the job card / console frame (elbow, segmented rails, numbered side blocks).
// Every piece sits on its own dark panel, so it reads on GitHub's light and dark themes alike.
// --png DIR renders each SVG to DIR/<name>.png with Playwright Chromium (for review; not committed).
import { createRequire } from 'node:module';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const OUT = resolve(ROOT, opt('out', 'docs/readme')), PNG = opt('png', null) && resolve(ROOT, opt('png'));
const TOOLS = process.env.README_TOOLS || '/tmp/readme-tools', req = createRequire(join(TOOLS, 'node_modules', 'x.js'));
const opentype = req('opentype.js'), fontFile = (w) => join(TOOLS, 'node_modules/@fontsource/antonio/files', `antonio-latin-${w}-normal.woff`);
const toAB = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const FONTS = {}; for (const w of [300, 400, 600, 700]) FONTS[w] = opentype.parse(toAB(await readFile(fontFile(w))));

// ---- palette (css/lcars-buttons.css :root) ----
const C = { orange: '#ff9c33', gold: '#ffc247', peach: '#ffbf8c', lilac: '#cc8ff2', peri: '#8c9dff', teal: '#4ecbb8', sky: '#82c9ff', rose: '#ff7d93', ok: '#5fd98c',
  panel: '#0c0d14', black: '#05060b', ink: '#f3eee6', dim: '#a8a6b9', inkDark: '#0b0705' };
const r1 = (v) => Math.round(v * 10) / 10;

// ---- text as outlines ----
/** width of a label (px) at size with extra letter spacing ls (em) */
function textW(s, size, w = 600, ls = 0.06) { const f = FONTS[w], k = size / f.unitsPerEm; let x = 0, prev = null;
  for (const g of f.stringToGlyphs(s)) { if (prev) x += f.getKerningValue(prev, g) * k; x += g.advanceWidth * k + ls * size; prev = g; } return x - ls * size; }
/** one <path> for a label; anchor 'start' | 'end' | 'middle'; y is the baseline */
function text(s, x, y, size, { w = 600, ls = 0.06, fill = C.ink, anchor = 'start', op = 1 } = {}) {
  const f = FONTS[w], k = size / f.unitsPerEm, W = textW(s, size, w, ls); let cx = anchor === 'end' ? x - W : anchor === 'middle' ? x - W / 2 : x, prev = null, d = '';
  for (const g of f.stringToGlyphs(s)) { if (prev) cx += f.getKerningValue(prev, g) * k; d += g.getPath(cx, y, size).toPathData(1); cx += g.advanceWidth * k + ls * size; prev = g; }
  return `<path fill="${fill}"${op < 1 ? ` opacity="${op}"` : ''} d="${d}"/>`;
}
const rect = (x, y, w, h, fill, rx = 0, extra = '') => `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}"${rx ? ` rx="${r1(rx)}"` : ''} fill="${fill}"${extra}/>`;
/** a bar with its right end rounded (LCARS rail end cap) */
const capR = (x, y, w, h, fill) => `<path fill="${fill}" d="M${r1(x)} ${r1(y)}H${r1(x + w - h / 2)}A${r1(h / 2)} ${r1(h / 2)} 0 0 1 ${r1(x + w - h / 2)} ${r1(y + h)}H${r1(x)}Z"/>`;
const capL = (x, y, w, h, fill) => `<path fill="${fill}" d="M${r1(x + w)} ${r1(y)}H${r1(x + h / 2)}A${r1(h / 2)} ${r1(h / 2)} 0 0 0 ${r1(x + h / 2)} ${r1(y + h)}H${r1(x + w)}Z"/>`;
/** LCARS elbow: a vertical side block (x..x+sw, from y0 to y1) that turns into a horizontal rail of height bh, outer radius R, inner radius ri.
 *  dir 'top': rail along the top (block grows down from the rail); 'bottom': rail along the bottom. Rail runs from the block to x + len. */
function elbow(x, y0, y1, sw, len, bh, R, ri, fill, dir = 'top') {
  const xe = x + len, xi = x + sw;
  if (dir === 'top') return `<path fill="${fill}" d="M${x} ${y1}V${y0 + R}A${R} ${R} 0 0 1 ${x + R} ${y0}H${xe}V${y0 + bh}H${xi + ri}A${ri} ${ri} 0 0 0 ${xi} ${y0 + bh + ri}V${y1}Z"/>`;
  return `<path fill="${fill}" d="M${x} ${y0}V${y1 - R}A${R} ${R} 0 0 0 ${x + R} ${y1}H${xe}V${y1 - bh}H${xi + ri}A${ri} ${ri} 0 0 1 ${xi} ${y1 - bh - ri}V${y0}Z"/>`;
}
/** original console glyph (not any real insignia): an upward chevron with a notch, crossed by a tilted orbit ring, a star point at the tip */
function emblem(cx, cy, s, fill, cut = C.black) {
  const p = (x, y) => `${r1(cx + x * s)} ${r1(cy + y * s)}`;
  const chev = `M${p(0, -1)}L${p(0.62, 0.82)}L${p(0, 0.42)}L${p(-0.62, 0.82)}Z`;
  return `<g><ellipse cx="${r1(cx)}" cy="${r1(cy + 0.12 * s)}" rx="${r1(1.02 * s)}" ry="${r1(0.34 * s)}" transform="rotate(-18 ${r1(cx)} ${r1(cy + 0.12 * s)})" fill="none" stroke="${fill}" stroke-width="${r1(0.11 * s)}"/>`
    + `<path d="${chev}" fill="${fill}" stroke="${cut}" stroke-width="${r1(0.1 * s)}" stroke-linejoin="round" paint-order="stroke"/>`
    + `<circle cx="${r1(cx)}" cy="${r1(cy + 0.05 * s)}" r="${r1(0.13 * s)}" fill="${cut}"/></g>`;
}
const svg = (w, h, title, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;
/** deterministic star specks for the hero panel */
function stars(n, x0, y0, w, h, seed = 7) { let s = seed, o = ''; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < n; i++) { const x = x0 + rnd() * w, y = y0 + rnd() * h, r = rnd() < 0.12 ? 1.3 : 0.7; o += `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r}" fill="#fff" opacity="${r1(0.18 + rnd() * 0.5)}"/>`; } return o; }

// ---- hero banner ----
function hero() {
  const W = 1280, H = 360; let b = rect(0, 0, W, H, C.black, 26);
  b += `<defs><radialGradient id="g" cx="78%" cy="50%" r="55%"><stop offset="0" stop-color="#1b2140"/><stop offset="1" stop-color="${C.black}" stop-opacity="0"/></radialGradient></defs>` + rect(0, 0, W, H, 'url(#g)', 26);
  b += stars(90, 230, 40, 1020, 280);
  // top elbow (orange) + rail segments, bottom elbow (lilac) + rail segments
  b += elbow(22, 22, 150, 150, 690, 20, 40, 22, C.orange, 'top');
  b += rect(718, 22, 120, 20, C.gold) + rect(844, 22, 46, 20, C.lilac) + rect(896, 22, 220, 20, C.peri) + capR(1122, 22, 136, 20, C.orange);
  b += elbow(22, 214, 338, 150, 560, 14, 40, 18, C.lilac, 'bottom');
  b += rect(588, 324, 210, 14, C.peri) + rect(804, 324, 60, 14, C.gold) + capR(870, 324, 388, 14, C.peach);
  // side blocks between the elbows, numbered low and right like the console frame
  b += rect(22, 156, 150, 24, C.peach) + text('03-1867', 164, 175, 15, { w: 600, fill: C.inkDark, anchor: 'end' });
  b += rect(22, 186, 150, 22, C.peri) + text('DECK 01', 164, 203, 14, { w: 600, fill: C.inkDark, anchor: 'end' });
  b += text('USF', 164, 140, 15, { w: 600, fill: C.inkDark, anchor: 'end' }) + text('BACKDECKS', 164, 312, 15, { w: 600, fill: C.inkDark, anchor: 'end' });
  // title block
  b += text('STARFARERS', 206, 148, 96, { w: 700, ls: 0.05, fill: C.orange });
  b += text('THE BACKDECKS', 210, 206, 46, { w: 400, ls: 0.16, fill: C.peach });
  b += text('A FIRST-PERSON SHIP-LIFE SIM ABOARD A FULLY WORKING STARSHIP.', 212, 248, 21, { w: 400, ls: 0.09, fill: C.dim });
  b += text('DO YOUR JOB, CUT CORNERS OR IGNORE IT. THE SHIP ANSWERS BACK.', 212, 276, 21, { w: 400, ls: 0.09, fill: C.dim });
  // status pills
  let x = 212; for (const [s, c] of [['SYSTEMS NOMINAL', C.teal], ['MADNESS MODE', C.rose], ['THREE.JS  ·  RUNS IN THE BROWSER', C.sky]]) {
    const w = textW(s, 14, 600, 0.12) + 34; b += rect(x, 290, w, 22, c, 11) + text(s, x + w - 13, 306, 14, { w: 600, ls: 0.12, fill: C.inkDark, anchor: 'end' }); x += w + 8; }
  // the console glyph on the right, in a ring of rail ticks
  const ex = 1110, ey = 182; b += `<circle cx="${ex}" cy="${ey}" r="92" fill="none" stroke="${C.peri}" stroke-opacity=".35" stroke-width="2"/>`;
  for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2, r0 = 100, rr = i % 3 ? 106 : 114; b += `<line x1="${r1(ex + Math.cos(a) * r0)}" y1="${r1(ey + Math.sin(a) * r0)}" x2="${r1(ex + Math.cos(a) * rr)}" y2="${r1(ey + Math.sin(a) * rr)}" stroke="${i % 9 ? C.peri : C.gold}" stroke-opacity="${i % 9 ? 0.5 : 1}" stroke-width="2"/>`; }
  b += emblem(ex, ey, 66, C.gold);
  b += text('SHIP TIME 18:13', 1258, 72, 15, { w: 600, ls: 0.12, fill: C.peri, anchor: 'end' });
  return svg(W, H, 'Starfarers: The Backdecks. A first-person ship-life sim aboard a fully working starship.', b);
}

// ---- PLAY NOW button (an LCARS pill: cut-off end cap, label low and right, plus a glyph tile) ----
function playBtn() {
  const W = 460, H = 112, h = 88, y = 12; let b = rect(0, 0, W, H, C.black, 56);
  b += capL(12, y, 92, h, C.gold) + emblem(62, y + h / 2 + 2, 30, C.inkDark, C.gold);   // glyph tile = the end cap
  b += rect(110, y, 252, h, C.orange) + text('PLAY NOW', 350, y + h - 12, 50, { w: 700, ls: 0.08, fill: C.inkDark, anchor: 'end' });
  b += text('IN YOUR BROWSER  ·  FREE', 350, y + 24, 14, { w: 600, ls: 0.14, fill: C.inkDark, anchor: 'end', op: 0.8 });
  b += capR(368, y, 80, h, C.lilac) + `<path fill="${C.inkDark}" d="M388 ${y + h / 2 - 16}L414 ${y + h / 2}L388 ${y + h / 2 + 16}Z"/>`;
  return svg(W, H, 'Play now in your browser', b);
}
/** small badge variant for inline use (same parts, 36 px tall) */
function playBadge() {
  const W = 230, H = 40, h = 32, y = 4; let b = rect(0, 0, W, H, C.black, 20);
  b += capL(4, y, 40, h, C.gold) + emblem(26, y + h / 2 + 1, 11, C.inkDark, C.gold);
  b += rect(48, y, 136, h, C.orange) + text('PLAY IN BROWSER', 178, y + h - 7, 17, { w: 700, ls: 0.07, fill: C.inkDark, anchor: 'end' });
  b += capR(188, y, 38, h, C.lilac) + `<path fill="${C.inkDark}" d="M198 ${y + h / 2 - 7}L210 ${y + h / 2}L198 ${y + h / 2 + 7}Z"/>`;
  return svg(W, H, 'Play in your browser', b);
}

// ---- section headers: an elbow strip with the section number in the side block and the title on the black panel ----
const SECTIONS = [
  ['gallery', 'Gallery', C.orange], ['about', 'The game', C.lilac], ['modes', 'Two modes', C.rose], ['features', 'What you can do', C.peri],
  ['graphics', 'Graphics and characters', C.gold], ['performance', 'Performance', C.teal], ['play', 'Play', C.orange], ['controls', 'Controls', C.sky],
  ['tests', 'Tests', C.peach], ['reference', 'Reference pages', C.lilac], ['credits', 'Credits and licenses', C.peri],
];
const RAIL = [C.gold, C.lilac, C.peri, C.peach, C.teal, C.orange, C.sky, C.rose];
function header(i, id, label, col) {
  const W = 960, H = 64; let b = rect(0, 0, W, H, C.black, 18);
  b += elbow(0, 0, H, 118, 520, 10, 18, 14, col, 'top').replace(`V${H}Z`, `V${H}H18A18 18 0 0 1 0 ${H - 18}Z`).replace(`M0 ${H}V`, `M0 ${H - 18}V`);   // block + top rail; bottom-left corner rounded like the panel
  b += text(String(i + 1).padStart(2, '0'), 108, H - 9, 22, { w: 600, ls: 0.04, fill: C.inkDark, anchor: 'end' });
  b += text(label.toUpperCase(), 140, H - 13, 34, { w: 600, ls: 0.07, fill: col });
  // right-hand rail: three segments + a numbered end block
  const a = RAIL[(i + 1) % RAIL.length], c2 = RAIL[(i + 3) % RAIL.length], c3 = RAIL[(i + 5) % RAIL.length];
  b += rect(526, 0, 90, 10, a) + rect(622, 0, 34, 10, c2) + rect(662, 0, 186, 10, c3) + `<path fill="${col}" d="M854 0H942A18 18 0 0 1 960 18V46A18 18 0 0 1 942 64H854Z"/>`;
  b += text(`${(i + 1) * 47 % 90 + 10}-${(i * 731 + 1867) % 9000 + 1000}`, 950, H - 9, 15, { w: 600, ls: 0.06, fill: C.inkDark, anchor: 'end' });
  return svg(W, H, label, b);
}

// ---- footer strip ----
function footer() {
  const W = 1280, H = 56; let b = rect(0, 0, W, H, C.black, 28);
  b += capL(8, 8, 120, 40, C.orange) + rect(134, 8, 70, 40, C.gold) + text('END', 196, 41, 16, { w: 600, ls: 0.1, fill: C.inkDark, anchor: 'end' });
  b += text('UNITED STARFARERS’ FLEET  ·  ALL DECKS REPORTING  ·  CONDITION GREEN', 226, 38, 20, { w: 400, ls: 0.12, fill: C.dim });
  b += rect(906, 8, 40, 40, C.lilac) + rect(952, 8, 150, 40, C.peri) + capR(1108, 8, 164, 40, C.teal) + text('SYSTEMS NOMINAL', 1240, 41, 16, { w: 600, ls: 0.1, fill: C.inkDark, anchor: 'end' });
  return svg(W, H, 'United Starfarers’ Fleet. All decks reporting. Systems nominal.', b);
}

await mkdir(OUT, { recursive: true });
const files = { 'hero.svg': hero(), 'play-now.svg': playBtn(), 'play-badge.svg': playBadge(), 'footer.svg': footer() };
SECTIONS.forEach(([id, label, col], i) => { files[`h-${id}.svg`] = header(i, id, label, col); });
for (const [n, s] of Object.entries(files)) { await writeFile(join(OUT, n), s); console.log(n.padEnd(22), (s.length / 1024).toFixed(1) + ' KB'); }
if (PNG) {   // review renders
  await mkdir(PNG, { recursive: true });
  const { chromium } = createRequire(import.meta.url)('playwright'), browser = await chromium.launch();
  for (const n of Object.keys(files)) { const p = await browser.newPage({ deviceScaleFactor: 1 }); await p.goto(pathToFileURL(join(OUT, n)).href); const el = await p.$('svg'); await el.screenshot({ path: join(PNG, n.replace('.svg', '.png')), omitBackground: true }); await p.close(); }
  // one sheet on light and dark page backgrounds, as on GitHub
  const p = await browser.newPage({ viewport: { width: 1400, height: 900 } }), imgs = Object.keys(files).map(n => `<img src="${pathToFileURL(join(OUT, n)).href}" style="max-width:100%;display:block;margin:10px 0">`).join('');
  await writeFile(join(PNG, 'sheet.html'), `<body style="margin:0;display:flex"><div style="flex:1;background:#fff;padding:16px">${imgs}</div><div style="flex:1;background:#0d1117;padding:16px">${imgs}</div></body>`);
  await p.goto(pathToFileURL(join(PNG, 'sheet.html')).href);
  await p.waitForTimeout(300); await p.screenshot({ path: join(PNG, 'sheet.png'), fullPage: true }); await p.close(); await browser.close(); console.log('png ->', PNG);
}
