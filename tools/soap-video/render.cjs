// Offline renderer for soap.html (Playwright + Chromium; run `python3 -m http.server 8123` in the repo root first).
//   node render.cjs audio  OUTDIR DURS_URL                  -> OUTDIR/sfx.wav (24 kHz mono), OUTDIR/lines.json
//   node render.cjs frames OUTDIR DURS_URL START END FPS W H -> OUTDIR/f%06d.jpg for frames START..END-1
const { chromium } = require('playwright'); const fs = require('fs');
const [mode, out, durs, a, b, fpsArg, W = 854, H = 480] = process.argv.slice(2);
const BASE = process.env.BASE || 'http://localhost:8123';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const br = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const p = await br.newPage({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1 });
  console.log('launched'); p.on('pageerror', e => console.log('PAGE ERROR', e.message));
  const dur = process.env.DUR || 480;
  await p.goto(`${BASE}/soap.html?render=1&dur=${dur}&durs=${encodeURIComponent(durs)}`, { waitUntil: 'commit' });
  // models load over real I/O; the virtual clock only moves when we advance it
  for (let i = 0; i < 600; i++) { if (await p.evaluate('!!window.__ready')) break; await p.evaluate('window.__advance && window.__advance(50)'); await p.waitForTimeout(100); }
  console.log('ready; starting play'); await p.evaluate('void window.__soap.play(0)'); console.log('play called');
  if (mode === 'audio') {
    const dt = 1 / 30; let n = 0;
    while (!(await p.evaluate('window.__endT'))) { await p.evaluate(`window.__frame(${dt}, false)`); if (n % 600 === 0) console.log('t', (n * dt).toFixed(0)); if (++n > 30 * 700) throw new Error('episode never ended'); }
    const endT = await p.evaluate('window.__endT'); const log = await p.evaluate('window.__lineLog');
    fs.writeFileSync(`${out}/lines.json`, JSON.stringify({ endT, lines: log }));
    const len = await p.evaluate('window.__audioPass()'); const chunks = Math.ceil(len / 1500000); const bufs = [];
    for (let k = 0; k < chunks; k++) bufs.push(Buffer.from(await p.evaluate(`window.__pcmChunk(${k})`), 'base64'));
    const pcm = Buffer.concat(bufs), hdr = Buffer.alloc(44); hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVEfmt ', 8); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22); hdr.writeUInt32LE(24000, 24); hdr.writeUInt32LE(48000, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
    fs.writeFileSync(`${out}/sfx.wav`, Buffer.concat([hdr, pcm])); console.log('audio pass done: endT', endT, 'lines', log.length);
  } else {
    const fps = +fpsArg, start = +a, end = +b, dt = 1 / fps; const t0 = Date.now();
    for (let f = 0; f < end; f++) {
      const draw = f >= start && !(process.env.SKIP_EXISTING && fs.existsSync(`${out}/f${String(f).padStart(6, '0')}.jpg`)); await p.evaluate(`window.__frame(${dt}, ${draw})`);
      if (draw) { await p.screenshot({ path: `${out}/f${String(f).padStart(6, '0')}.jpg`, type: 'jpeg', quality: 88 }); if ((f - start) % 100 === 0) console.log(`frame ${f}/${end} (${((Date.now() - t0) / 1000).toFixed(0)}s)`); }
    }
  }
  await br.close();
})().catch(e => { console.error(e); process.exit(1); });
