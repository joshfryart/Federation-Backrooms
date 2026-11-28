// Exposure / colour cohesion survey: one 960x540 High-quality shot of every room type on a few ships of different hull classes, with luminance stats.
//   node tools/shot-rooms.mjs [--out shots/rooms] [--ships 1,2,4] [--seed 1] [--only bridge,engineering] [--json file] [--before file] [--band 70,125]
//                             [--gi type=gain:alb,...] [--norm ref,k,lo,hi]   (tuning overrides of js/gi.js ROOM_GI / GI_NORM, see below)
//   node tools/shot-rooms.mjs --stats a.png ...   mean / p5 / p95 / sat of existing PNGs (no browser)
//   node tools/shot-rooms.mjs --check      node only (no browser): every room type js/gen.js can put in d.rooms has a GRADES.room entry and
//                                          no entry is dead; every room grade keeps expo 0.97..1.05 and sat >= 0.85 (js/fx.js checkGrades). Exit 1 on a miss.
// Per ship (G.forceShip, same seeding and re-seeding as tools/shot-gfx.mjs, so it is deterministic on one box): the longest corridor run of deck 1,
// then every deck in order, the first room of each type not shot yet on that ship, from its far corner looking at its centre (shot-gfx roomView),
// enemies hidden, HUD hidden, the room's grade snapped (post.setGradeFor instant). Writes <out>/<ship>-<type>.png and prints per shot:
// mean luminance (Rec.709 weights on the 8-bit sRGB values, 0..255), its 5th / 95th percentile, mean saturation (HSV, 0..1), and a band verdict.
// --json writes the rows; --before <json> prints the previous run's mean next to each row and both spreads (max - min of room means).
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire, register } from 'node:module';
import { inflateSync } from 'node:zlib';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const OUT = resolve(ROOT, opt('out', 'shots/rooms')), SHIPS = String(opt('ships', '1,2,4')).split(',').map(Number), SEED = +opt('seed', 1), W = 960, H = 540;
const ONLY = opt('only', null) ? String(opt('only')).split(',') : null, JSON_OUT = opt('json', null), BEFORE = opt('before', null);
const [BLO, BHI] = String(opt('band', '70,125')).split(',').map(Number);
// --gi 'engineering=1.8:0.4,cargo=1.3,*=1.5': tuning override of js/gi.js ROOM_GI (type=gain[:alb]; '-' = corridors; '*' = every type, multiplies the gain)
const NORM = opt('norm', null) ? Object.fromEntries(String(opt('norm')).split(',').map((v, i) => [['ref', 'k', 'lo', 'hi'][i], +v])) : null;   // --norm ref,k,lo,hi: js/gi.js GI_NORM override
const GI_OVR = opt('gi', null) ? Object.fromEntries(String(opt('gi')).split(',').map(e => { const [k, v] = e.split('='), [g, a] = v.split(':').map(Number); return [k === '-' ? '' : k, { gain: g, ...(a ? { alb: a } : {}) }]; })) : null;

// ---- node-only check of the grade table (js/fx.js imports three: map the page's import map onto vendor/ for node)
async function loadFx() {
  const V = pathToFileURL(join(ROOT, 'vendor') + '/').href;
  register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, n) { if (s === 'three') return { url: '${V}three.module.js', shortCircuit: true }; if (s.startsWith('three/addons/')) return { url: '${V}addons/' + s.slice(13), shortCircuit: true }; return n(s, c); }`));
  return import(pathToFileURL(join(ROOT, 'js/fx.js')).href);
}
if (argv.includes('--check')) {
  const { checkGrades, GRADES } = await loadFx(), { ROOMS } = await import(pathToFileURL(join(ROOT, 'js/data.js')).href);
  const r = checkGrades(ROOMS);
  console.log(`grade table: ${Object.keys(GRADES.room).length} room entries, ${Object.keys(GRADES.ship).length} hulls`);
  for (const k of ['missing', 'dead', 'bad']) console.log(`  ${k.padEnd(8)} ${r[k].length ? r[k].join(', ') : '-'}`);
  process.exit(r.ok ? 0 : 1);
}

// ---- png decode (8-bit RGB/RGBA non-interlaced, what Playwright writes) and stats
function decodePng(buf) {
  let p = 8, w, h, ct; const idat = [];
  while (p < buf.length) { const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len); if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; } else if (type === 'IDAT') idat.push(d); p += 12 + len; }
  const bpp = ct === 6 ? 4 : 3, raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), o = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[o + i - bpp] : 0, b = y ? px[o - stride + i] : 0, c = i >= bpp && y ? px[o - stride + i - bpp] : 0; let v = src[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[o + i] = v & 255;
    }
  }
  return { w, h, bpp, px };
}
export function stats(buf) {
  const { w, h, bpp, px } = decodePng(buf), N = w * h, hist = new Uint32Array(256); let sl = 0, ss = 0;
  for (let i = 0; i < N; i++) {
    const r = px[i * bpp], g = px[i * bpp + 1], b = px[i * bpp + 2], l = 0.2126 * r + 0.7152 * g + 0.0722 * b, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sl += l; ss += mx ? (mx - mn) / mx : 0; hist[Math.min(255, Math.round(l))]++;
  }
  const pct = (q) => { let n = 0; for (let v = 0; v < 256; v++) { n += hist[v]; if (n >= q * N) return v; } return 255; };
  return { mean: +(sl / N).toFixed(1), p5: pct(0.05), p95: pct(0.95), sat: +(ss / N).toFixed(3) };
}

if (argv.includes('--stats')) {   // node tools/shot-rooms.mjs --stats a.png b.png ...: the same numbers for existing PNGs (e.g. tools/shot-gfx.mjs output), no browser
  for (const f of argv.filter(a => a.endsWith('.png'))) { const s = stats(await readFile(resolve(ROOT, f))); console.log(`${f}  mean ${s.mean}  p5 ${s.p5}  p95 ${s.p95}  sat ${s.sat}`); }
  process.exit(0);
}

async function shoot() {
  await mkdir(OUT, { recursive: true });
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.exr': 'application/octet-stream', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.hdr': 'application/octet-stream' };
  const server = createServer(async (req, res) => { try { const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html')); const b = await readFile(p); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); } }).listen(0);
  const base = `http://localhost:${server.address().port}/`;
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const seedRandom = () => { window.__rs = () => { let s = 0x9e3779b9; Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }; window.__rs(); };   // as tools/shot-gfx.mjs
  const rows = [];
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }); page.setDefaultTimeout(600000);
    page.on('pageerror', e => console.log('pageerror', e.message));
    await page.addInitScript(seedRandom); await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = function () { return Promise.resolve(); }; });
    await page.goto(base + 'index.html?brief=0');
    await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 240000 }); await page.evaluate(() => __game.ready); await page.evaluate(() => __game.warmed);
    await page.evaluate(() => { const st = document.createElement('style'); st.textContent = 'body > *:not(#view):not(style):not(script) { visibility: hidden !important; }'; document.head.appendChild(st); });
    for (const ship of SHIPS) {
      const plan = await page.evaluate(({ seed, ship }) => { const g = __game, G = g.G; G.manual = true; G.forceShip = ship; G.forceSeed = seed; __rs(); g.newRun(); __rs(); document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); G.phase = 'play'; G.hp = G.maxHp = 1e6; document.exitPointerLock?.(); if (G.menus) G.menus.lock = () => null; g.setQuality?.('high');
        window.__sr = {
          // normal power for every shot: no blackout timer, ship-state power / light faults and alert held off (they would make the survey depend on game time)
          normal() { const w = g.world; G.blackout = 0; G.blackT = 1e6; if (G.fx) { G.fx.power = 1; G.fx.lightFlicker = 0; } if (w) { w.powerTarget = w.powerAmt = 1; w.lightFault = 0; w.setAlert?.(false); w.alertAmt = 0; } },
          settle(n = 6) { let t = G.time || 0; for (let i = 0; i < n; i++) { t += 1 / 30; G.phase = 'play'; this.normal(); g.advance(1 / 30, t); this.normal(); } },
          async bakeMs() { const m = await import('./js/gi.js'), w = g.world, keep = w.gi; w.gi = null; const t0 = performance.now(), it = m.giBake(w, 2.5); while (!it.next().done); const ms = performance.now() - t0; w.gi.occ.dispose(); w.gi.irr.dispose(); w.gi = keep; return +ms.toFixed(1); },
          hideEnemies() { for (const e of (g.enemies || [])) if (e.mesh) e.mesh.visible = false; },
          stand(x, z, yaw, pitch = -0.1) { const P = g.P; P.x = x; P.z = z; P.vx = P.vz = 0; P.yaw = yaw; P.pitch = pitch; },
          load(dn) { __rs(); g.loadDeck(dn); __rs(); G.phase = 'play'; },
          roomView(r) { const w = g.world, d = w.d, cx = r.x + (r.w >> 1), cy = r.y + (r.h >> 1), open = []; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (d.grid[y][x] === 0) open.push([x, y, Math.hypot(x - cx, y - cy)]); open.sort((a, b) => b[2] - a[2]); if (!open.length) return false; const [px, pz] = w.center(open[0][0], open[0][1]), [tx, tz] = w.center(cx, cy); this.stand(px, pz, Math.atan2(-(tx - px), -(tz - pz)), -0.22); return true; },
          grade(type) { const p = g.post; if (p) { p._gradeT = performance.now(); p.setGradeFor(G.ship, type, { instant: true, mode: G.mode }); } },
          frame() { g.renderOnce(); g.renderOnce(); },
        };
        return { hull: G.ship.hull, name: G.ship.province, decks: G.ship.decks }; }, { seed: SEED, ship });
      if (NORM) await page.evaluate(async (n) => { const m = await import('./js/gi.js'); Object.assign(m.GI_NORM, n); }, NORM);
      if (GI_OVR) await page.evaluate(async (o) => { const m = await import('./js/gi.js'), { ROOMS } = await import('./js/data.js'), R = m.ROOM_GI, d0 = R[''];
        if (!window.__gi0) window.__gi0 = JSON.parse(JSON.stringify(R)); for (const k of Object.keys(R)) delete R[k]; Object.assign(R, JSON.parse(JSON.stringify(window.__gi0)));
        for (const [k, v] of Object.entries(o)) { if (k === '*') { const z = { ...R[''] }; for (const t of ['', ...Object.keys(ROOMS)]) R[t] = { ...(R[t] || z), gain: (R[t] || z).gain * v.gain }; } else R[k] = { ...(R[k] || d0), ...v }; } }, GI_OVR);
      const tag = `${ship}-${plan.hull}`;
      const snap = async (type, deck) => { const file = join(OUT, `${tag}-${type}.png`); await page.screenshot({ path: file }); const s = stats(await readFile(file));
        const st = await page.evaluate((type) => { const w = __game.world, r = type === 'corridor' ? null : w.d.rooms.find(q => q.type === type); const gr = r && w.gi?.rooms?.find(q => q.x === r.x && q.y === r.y); return { est: gr?.est ?? null, gain: gr?.gain ?? null, power: +w.powerAmt.toFixed(2), alert: +(w.alertAmt || 0).toFixed(2), fault: w.lightFault || 0, panels: r ? w.panels.filter(p => p.room === type && p.x / 2.5 >= r.x && p.x / 2.5 < r.x + r.w && p.z / 2.5 >= r.y && p.z / 2.5 < r.y + r.h).length : null }; }, type);
        const row = { ship, hull: plan.hull, type, deck, ...s, ...st }; rows.push(row); print(row); };
      // corridor: the longest straight open run outside any room on deck 1, looked down end to end (as shot-gfx)
      if (!ONLY || ONLY.includes('corridor')) {
        const ok = await page.evaluate(() => { const S = __sr, g = __game; S.load(1); const w = g.world, d = w.d, inRoom = (x, y) => d.rooms.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
          const ys = d.grid.length, xs = d.grid[0].length, open = (x, y) => x >= 0 && y >= 0 && x < xs && y < ys && d.grid[y][x] === 0; let best = null;
          for (let y = 0; y < ys; y++) for (let x = 0; x < xs; x++) { if (!open(x, y) || inRoom(x, y)) continue; for (const [dx, dy] of [[1, 0], [0, 1]]) { if (open(x - dx, y - dy)) continue; let n = 0; while (open(x + dx * n, y + dy * n) && !inRoom(x + dx * n, y + dy * n)) n++; if (!best || n > best.n) best = { x, y, dx, dy, n }; } }
          if (!best) return false; S.hideEnemies(); const [px, pz] = w.center(best.x, best.y), [tx, tz] = w.center(best.x + best.dx * (best.n - 1), best.y + best.dy * (best.n - 1)); const yaw = Math.atan2(-(tx - px), -(tz - pz)); S.stand(px, pz, yaw, -0.03); S.settle(6); S.stand(px, pz, yaw, -0.03); S.grade(null); S.frame(); return true; });
        if (ok) await snap('corridor', 1);
      }
      const seen = new Set();
      for (let dn = 1; dn <= plan.decks; dn++) {
        const types = await page.evaluate((dn) => { __sr.load(dn); return __game.world.d.rooms.map(r => r.type); }, dn);
        bakes.push({ ship, deck: dn, ms: await page.evaluate(() => __sr.bakeMs()) });
        for (const type of [...new Set(types)]) {
          if (seen.has(type) || (ONLY && !ONLY.includes(type))) continue; seen.add(type);
          const ok = await page.evaluate((type) => { const S = __sr, g = __game, r = g.world.d.rooms.find(q => q.type === type); S.hideEnemies(); S.settle(4); const k = S.roomView(r); S.settle(4); S.roomView(r); S.grade(type); S.frame(); return k; }, type);
          if (ok) await snap(type, dn);
        }
      }
    }
  } finally { await browser.close(); server.close(); }
  return rows;
}
let before = null;
if (BEFORE) { try { before = JSON.parse(await readFile(resolve(ROOT, BEFORE), 'utf8')); } catch { console.log('no --before file', BEFORE); } }
const prev = (r) => before?.find(b => b.ship === r.ship && b.type === r.type);
const print = (r) => { const p = prev(r), inb = r.mean >= BLO && r.mean <= BHI ? 'ok' : r.mean < BLO ? 'LOW' : 'HIGH';
  const cond = r.power < 0.95 ? ` power ${r.power}` : '', al = r.alert > 0.05 ? ` alert ${r.alert}` : '', lf = r.fault ? ` lightFault ${r.fault}` : '', pn = (r.panels != null ? ` panels ${r.panels}` : '') + (r.est != null ? ` est ${r.est} gain ${r.gain}` : '');
  console.log(`${String(r.ship).padStart(2)} ${r.hull.padEnd(9)} ${r.type.padEnd(12)} d${String(r.deck).padEnd(2)} mean ${String(r.mean).padStart(5)}${p ? ` (was ${String(p.mean).padStart(5)})` : ''}  p5 ${String(r.p5).padStart(3)}  p95 ${String(r.p95).padStart(3)}  sat ${r.sat.toFixed(3)}  ${inb}${pn}${cond}${al}${lf}`); };
console.log(`ships ${SHIPS.join(',')} seed ${SEED}, band ${BLO}..${BHI} (mean luminance of the 8-bit sRGB frame)`);
const bakes = [];
const rows = await shoot();
if (bakes.length) { const ms = bakes.map(b => b.ms); console.log(`GI bake per deck (whole bake in one go, ms): avg ${(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(1)}, max ${Math.max(...ms)} [${bakes.map(b => b.ship + '/' + b.deck + ' ' + b.ms).join(', ')}]`); }
const spread = (rs) => { const m = rs.map(r => r.mean); return m.length ? { min: Math.min(...m), max: Math.max(...m), spread: +(Math.max(...m) - Math.min(...m)).toFixed(1), avg: +(m.reduce((a, b) => a + b, 0) / m.length).toFixed(1) } : null; };
const s = spread(rows), out = rows.filter(r => r.mean < BLO || r.mean > BHI);
console.log(`rooms ${rows.length}, mean of means ${s?.avg}, min ${s?.min}, max ${s?.max}, spread ${s?.spread}; outside the band: ${out.length ? out.map(r => r.ship + '/' + r.type + ' ' + r.mean).join(', ') : 'none'}`);
if (before) { const common = before.filter(b => rows.some(r => r.ship === b.ship && r.type === b.type)), sb = spread(common); console.log(`before: spread ${sb?.spread} (min ${sb?.min}, max ${sb?.max}, mean of means ${sb?.avg}) over the same ${common.length} rooms`); }
if (JSON_OUT) await writeFile(resolve(ROOT, JSON_OUT), JSON.stringify(rows, null, 1));
