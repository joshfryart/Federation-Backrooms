// Renders the shanty video frame by frame with headless Chromium + the software renderer, resumable, in parallel workers.
//   (the repo is served to the page by request interception; pass --server to use `python3 -m http.server 8123` instead)
//   node tools/video/song.mjs               (song.json)
//   node tools/video/render.mjs cast        (cast.json: who is where, verse leads -> the synth uses their voice types)
//   python3 tools/video/synth.py            (shanty.wav)
//   node tools/video/render.mjs frames [--from 0 --to 146 --workers 3 --fps 24 --w 1280 --h 720 --quality low]
//   node tools/video/render.mjs mux [--out docs/video/shanty.mp4 --from 0 --to 146]
// Frames go to tools/video/out/frames/f00000.jpg (global frame index = round(t * fps)); existing frames are skipped, so a killed
// run resumes where it stopped. Coverage per frame goes to out/cov/f00000.json; `mux` sums it into out/coverage.json.
import { createRequire } from 'node:module';
import { mkdirSync, existsSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildSong } from './song.mjs';
import { shotList } from './shots.mjs';
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..'), OUT = join(HERE, 'out');
const argv = process.argv.slice(2), cmd = argv[0] || 'frames', opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const PORT = +opt('port', 8123), FPS = +opt('fps', 24), W = +opt('w', 1280), H = +opt('h', 720), QUALITY = opt('quality', 'low'), SHIP = +opt('ship', 1), SEED = +opt('seed', 1);
const song = buildSong(), shots = shotList(song), DUR = song.dur;
const FROM = +opt('from', 0), TO = Math.min(DUR, +opt('to', DUR));
const FR = join(OUT, opt('frames', 'frames')), COV = join(OUT, 'cov'); mkdirSync(FR, { recursive: true }); mkdirSync(COV, { recursive: true });
const fname = (f) => join(FR, `f${String(f).padStart(5, '0')}.jpg`);
const shotAt = (t) => shots.find(s => t >= s.t0 - 1e-9 && t < s.t1 - 1e-9) || shots[shots.length - 1];

// coverage over frames [f0, f1): decks, spaces, distinct singers on screen (>= half a second), departments
function summarize(f0, f1) {
  const seen = new Map(), decks = new Set(), rooms = new Set(), roomsBy = {};
  for (let f = f0; f < f1; f++) { const p = join(COV, `f${String(f).padStart(5, '0')}.json`); if (!existsSync(p)) continue; const c = JSON.parse(readFileSync(p, 'utf8')); decks.add(c.deck);
    rooms.add(`${c.deck}:${c.room}`); if (c.look) rooms.add(`${c.deck}:${c.look}`); for (const id of c.ids || []) seen.set(id, (seen.get(id) || 0) + 1); }
  const cast = existsSync(join(OUT, 'cast.json')) ? JSON.parse(readFileSync(join(OUT, 'cast.json'), 'utf8')) : null;
  const sung = [...seen].filter(([, n]) => n >= FPS / 2).map(([id]) => id), ppl = cast?.people || [], byId = Object.fromEntries(ppl.map(p => [p.id, p]));
  const depts = new Set(sung.map(id => byId[id]?.dept).filter(Boolean));
  for (const r of rooms) { const [d, ty] = r.split(':'); (roomsBy[d] ||= new Set()).add(ty); }
  const spaces = [...rooms].filter(r => !r.endsWith(':lift') && !r.endsWith(':corridor'));
  return { frames: f1 - f0, decks: [...decks].sort((a, b) => a - b), roomsByDeck: Object.fromEntries(Object.entries(roomsBy).map(([d, s]) => [d, [...s].sort()])), spaces: spaces.length, roomTypes: [...new Set(spaces.map(r => r.split(':')[1]))].sort(),
    crew: ppl.length, singersOnScreen: sung.length, depts: [...depts].sort(), notSeen: ppl.filter(p => !sung.includes(p.id)).map(p => `${p.name} (deck ${p.deck}, ${p.room})`) };
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream', '.ktx2': 'application/octet-stream', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2' };
async function serveRepo(page) {
  await page.route(`http://localhost:${PORT}/**`, (route) => {
    const u = new URL(route.request().url()); let p = join(ROOT, decodeURIComponent(u.pathname)); if (!p.startsWith(ROOT)) return route.fulfill({ status: 403 });
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
    if (!existsSync(p)) return route.fulfill({ status: 404, body: 'not found' });
    const ext = p.slice(p.lastIndexOf('.')).toLowerCase(); return route.fulfill({ status: 200, contentType: MIME[ext] || 'application/octet-stream', body: readFileSync(p) });
  });
}
async function openPage() {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.log('pageerror', e.message));
  if (!argv.includes('--server')) await serveRepo(page);   // files straight from the repo (no http server needed); --server uses one on --port
  page.on('console', m => { if (m.type() === 'error') console.log('console', m.text()); });
  await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = function () { return Promise.resolve(); }; try { localStorage.setItem('fb_navtour', '1'); } catch (e) { } });
  await page.goto(`http://localhost:${PORT}/index.html?brief=0&mode=nominal&video=1`);
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 300000 }); await page.evaluate(() => __game.ready); await page.evaluate(() => __game.warmed);
  await page.addScriptTag({ type: 'module', url: `http://localhost:${PORT}/tools/video/stage.js` });
  await page.waitForFunction(() => window.__V, null, { timeout: 60000 });
  const cast = await page.evaluate(async (a) => __V.init(a), { ship: SHIP, seed: SEED, quality: QUALITY, song });
  return { browser, page, cast };
}

if (cmd === 'cast') {
  const { browser, cast } = await openPage();
  writeFileSync(join(OUT, 'cast.json'), JSON.stringify(cast, null, 1));
  console.log(cast.ship, cast.crew, 'crew'); for (const d in cast.byDeck) console.log(' deck', d, JSON.stringify(cast.byDeck[d])); console.log('leads', JSON.stringify(cast.leads));
  await browser.close();
} else if (cmd === 'frames') {
  const NW = +opt('workers', 1), wk = opt('worker', null);
  if (wk == null && NW > 1) {   // spawn workers as child processes, interleaved by shot
    const { spawn } = await import('node:child_process');
    const procs = Array.from({ length: NW }, (_, k) => spawn(process.execPath, [fileURLToPath(import.meta.url), ...argv, '--worker', String(k)], { stdio: 'inherit' }));
    await Promise.all(procs.map(p => new Promise(r => p.on('exit', r))));
    process.exit(0);
  }
  const k = +(wk ?? 0), n = wk == null ? 1 : NW;
  const mine = shots.filter((s, i) => i % n === k && s.t1 > FROM && s.t0 < TO);
  const t0 = Date.now(); let done = 0, skipped = 0;
  const todo = mine.map(s => { const fs = []; for (let f = Math.round(Math.max(s.t0, FROM) * FPS); f < Math.round(Math.min(s.t1, TO) * FPS); f++) if (!existsSync(fname(f))) fs.push(f); else skipped++; return { s, fs }; }).filter(x => x.fs.length);
  if (!todo.length) { console.log(`worker ${k}: nothing to do (${skipped} frames exist)`); process.exit(0); }
  const { browser, page } = await openPage();
  console.log(`worker ${k}: ${todo.length} shots, ${todo.reduce((a, x) => a + x.fs.length, 0)} frames (boot ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  for (const { s, fs } of todo) {
    const ts = Date.now();
    if (s.kind === 'end') { const c = summarize(0, Math.round(s.t0 * FPS)); await page.evaluate((c) => { __V.summary = c; }, { singers: c.singersOnScreen, decks: c.decks.length, rooms: c.spaces, depts: c.depts.length }); console.log('end card coverage', c.singersOnScreen, c.decks.length, c.spaces); }
    const info = await page.evaluate(({ s }) => { const d = __V.setDeck(s.deck); const lead = s.lead === 'block' ? __V.leads[s.block]?.id : s.lead; const r = __V.shot({ ...s, lead }); return { d, r }; }, { s });
    let prev = null;
    for (const f of fs) {
      const t = f / FPS, u = (t - s.t0) / (s.t1 - s.t0);
      const cov = await page.evaluate(({ t, u, fresh, s, FPS }) => { const r = __V.frame(t, u, { fps: FPS, preroll: fresh ? { t0: s.t0, len: s.t1 - s.t0 } : null }); __V.render(); return r; }, { t, u, fresh: prev !== f - 1, s, FPS });
      await page.screenshot({ path: fname(f), type: 'jpeg', quality: 92 });
      writeFileSync(join(COV, `f${String(f).padStart(5, '0')}.json`), JSON.stringify({ f, t, shot: s.name, deck: s.deck, kind: s.kind, ...cov }));
      prev = f; done++;
    }
    console.log(`worker ${k}: ${s.name} ${fs.length} frames ${((Date.now() - ts) / fs.length / 1000).toFixed(2)} s/frame  ${JSON.stringify(info.r)}  rooms ${info.d.rooms.map(r => r.type + ':' + r.n).join(' ')}`);
  }
  console.log(`worker ${k}: ${done} frames in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
  await browser.close();
} else if (cmd === 'stills') {   // node tools/video/render.mjs stills 12.5 30 61.2 ...  -> out/stills/t012.50.jpg (one frame each, for checking)
  const ts = argv.slice(1).filter(a => !a.startsWith('--') && !isNaN(+a)).map(Number), dir = join(OUT, 'stills'); mkdirSync(dir, { recursive: true });
  const { browser, page } = await openPage(); let last = null;
  for (const t of ts) {
    const s = shotAt(t), u = (t - s.t0) / (s.t1 - s.t0), t1 = Date.now();
    if (last !== s.i) { const r = await page.evaluate(({ s }) => { const d = __V.setDeck(s.deck); const lead = s.lead === 'block' ? __V.leads[s.block]?.id : s.lead; return { d, r: __V.shot({ ...s, lead }) }; }, { s }); console.log(s.name, JSON.stringify(r.r), r.d.rooms.map(r => r.type + ':' + r.n).join(' ')); last = s.i; }
    const cov = await page.evaluate(({ t, u, s }) => { const r = __V.frame(t, u, { fps: 24, preroll: { t0: s.t0, len: s.t1 - s.t0 } }); __V.render(); return r; }, { t, u, s });
    const t2 = Date.now(); await page.screenshot({ path: join(dir, `t${t.toFixed(2).padStart(6, '0')}.jpg`), type: 'jpeg', quality: 90 });
    console.log(`t=${t} ${s.name} u=${u.toFixed(2)} visible ${cov.ids.length} room ${cov.room}  (frame ${t2 - t1} ms, shot ${Date.now() - t2} ms)`);
  }
  await browser.close();
} else if (cmd === 'mux') {
  const out = join(ROOT, opt('out', 'docs/video/shanty.mp4')); mkdirSync(dirname(out), { recursive: true });
  const f0 = Math.round(FROM * FPS), f1 = Math.round(TO * FPS), missing = [];
  for (let f = f0; f < f1; f++) if (!existsSync(fname(f))) missing.push(f);
  if (missing.length) { console.log('missing frames:', missing.length, 'first', missing[0]); process.exit(1); }
  const crf = opt('crf', '20');
  const args = ['-y', '-v', 'error', '-framerate', String(FPS), '-start_number', String(f0), '-i', join(FR, 'f%05d.jpg'), '-ss', String(FROM), '-t', String(TO - FROM), '-i', join(OUT, 'shanty.wav'),
    '-frames:v', String(f1 - f0), '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-shortest', out];
  const r = spawnSync('ffmpeg', args, { stdio: 'inherit' }); if (r.status) process.exit(r.status);
  console.log('wrote', out, (statSync(out).size / 1e6).toFixed(1), 'MB');
  const cov = summarize(f0, f1);
  writeFileSync(join(OUT, opt('cov', 'coverage.json')), JSON.stringify(cov, null, 1));
  console.log(JSON.stringify({ ...cov, notSeen: cov.notSeen.length }, null, 1));
}
