// Screenshots for the LCARS button system (css/lcars-buttons.css, docs/buttons.html) -> docs/screenshots/
//   node tools/shots-buttons.mjs [--only spec,title,pause,loading,duty,talk,radio] [--out dir]
// Headless Chromium on the software renderer, same in-process static server as tools/test.mjs. The game is driven through
// window.__game; ?brief=0 because navigator.webdriver is true under Playwright, and pointer lock is stubbed.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ONLY = (arg('--only', '') || '').split(',').filter(Boolean), OUT = arg('--out', join(ROOT, 'docs/screenshots'));
const want = (k) => !ONLY.length || ONLY.includes(k);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.ktx2': 'image/ktx2', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.hdr': 'application/octet-stream', '.bin': 'application/octet-stream' };
const server = createServer(async (req, res) => {
  try { const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html')); const b = await readFile(p); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const URL0 = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const VP = { width: 1280, height: 720 };
const shot = async (p, name, clip) => { const f = join(OUT, name); await p.screenshot({ path: f, ...(clip ? { clip } : {}) }); console.log('wrote', f); };
const page = async (path) => {
  const p = await browser.newPage({ viewport: VP, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => console.log('  pageerror:', e.message));
  await p.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = function () { return Promise.resolve(); }; });
  await p.goto(URL0 + path); return p;
};
const ready = (p) => p.waitForFunction(() => window.__game && document.getElementById('title')?.classList.contains('show') && !document.getElementById('boot')?.classList.contains('show'), null, { timeout: 240000 });

try {
  if (want('spec')) {   // the specimen page, top section (variants + states)
    const p = await page('/docs/buttons.html'); await p.waitForTimeout(500);
    await p.screenshot({ path: join(OUT, '12-buttons-specimen.png'), fullPage: true }); console.log('wrote specimen'); await p.close();
  }
  if (want('title') || want('pause') || want('loading') || want('duty') || want('talk') || want('radio')) {
    const p = await page('/index.html?brief=0'); await ready(p); await p.waitForTimeout(400);
    if (want('title')) { await p.hover('#credbtn'); await p.focus('#begin'); await p.keyboard.press('Shift'); await shot(p, '13-title-buttons.png'); }
    // Begin -> boarding loading screen with the "Enter the ship" button
    await p.evaluate(() => document.getElementById('begin').click());
    await p.waitForFunction(() => { const b = document.getElementById('boot-go'); return b && b.style.display !== 'none' && getComputedStyle(b).display !== 'none'; }, null, { timeout: 240000 });
    await p.waitForTimeout(400);
    if (want('loading')) await shot(p, '14-loading-enter.png');
    await p.evaluate(() => document.getElementById('boot-go').click()); await p.waitForTimeout(800);
    await p.evaluate(() => { const g = window.__game; g.G.phase = 'play'; document.getElementById('bd-brief')?.classList.remove('show'); });
    if (want('pause')) {
      await p.evaluate(() => { document.querySelectorAll('.screen.show').forEach((s) => s.classList.remove('show')); document.getElementById('pause').classList.add('show'); document.getElementById('capson').checked = true; });
      await p.waitForTimeout(300); await p.hover('#companybtn'); await p.focus('#resume'); await p.keyboard.press('Shift');
      await shot(p, '15-pause-settings.png');
      await p.evaluate(() => document.getElementById('pause').classList.remove('show'));
    }
    if (want('duty')) {
      await p.evaluate(() => { window.__game.G.hud2.openBoard(); });
      await p.waitForTimeout(500);
      await p.evaluate(() => { const b = document.querySelector('#bd-panel .blk'); b?.click(); });
      await p.waitForTimeout(400); const a = await p.$('.dp-pop .act:not(.off)'); if (a) await a.hover();
      await shot(p, '16-duty-board-buttons.png');
      await p.keyboard.press('Escape'); await p.evaluate(() => { const H = window.__game.G.hud2; H.closeBoard?.(); });
    }
    if (want('talk')) {   // a talk / terminal list menu (#bd-menu): numbered rows, one disabled
      await p.evaluate(() => { const G = window.__game.G, who = G.roster?.find?.((x) => x.id !== G.player?.id) || null;
        G.hud2.openMenu(who ? `${who.short || who.name}` : 'Talk', [{ label: 'How is your shift going?', icon: 'talk' }, { label: 'Can you help me with a repair?', icon: 'wrench' }, { label: 'Swap duty rounds', icon: 'duty', note: 'needs rank', off: true }, { label: 'Leave', icon: 'x' }], '', { person: who }); });
      await p.waitForTimeout(400); const o = await p.$$('#bd-menu .o'); if (o[1]) await o[1].hover();
      await shot(p, '17-talk-menu.png'); await p.evaluate(() => window.__game.G.hud2.closeMenu());
    }
    if (want('radio')) {   // the crew radio panel: filter chips, quick-action tiles, contact cards
      await p.evaluate(() => window.__game.menus?.comms?.openPanel('radio'));
      await p.waitForTimeout(600); const c = await p.$('#cm-radio .quick .act'); if (c) await c.hover();
      await shot(p, '18-radio-buttons.png');
    }
    await p.close();
  }
} finally { await browser.close(); server.close(); }
