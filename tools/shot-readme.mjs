// README screenshots of the menus and HUD screens that the other shot-* tools do not cover: title, briefing, ship status (Tab), map (M),
// duty board (J). Headless Chromium + the software renderer, the real click-through flow (Begin -> boarding -> Enter the ship -> briefing).
//   node tools/serve.mjs 8130 &   node tools/shot-readme.mjs [--port 8130] [--out shots/readme-raw/ui] [--w 1280 --h 720]
// navigator.webdriver is masked so the briefing shows (the other tools pass ?brief=0); pointer lock is stubbed. Writes <out>/<name>.png.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const PORT = +opt('port', 8130), OUT = resolve(ROOT, opt('out', 'shots/readme-raw/ui')), W = +opt('w', 1280), H = +opt('h', 720);
const { chromium } = createRequire(import.meta.url)('playwright');
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const shot = async (p, name) => { await p.screenshot({ path: join(OUT, name + '.png') }); console.log('shot', name); };
try {
  const p = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }); p.setDefaultTimeout(300000);
  p.on('pageerror', e => console.log('pageerror', e.message));
  await p.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }); HTMLCanvasElement.prototype.requestPointerLock = function () { return Promise.resolve(); }; });
  await p.goto(`http://127.0.0.1:${PORT}/index.html`);
  await p.waitForFunction(() => window.__game && document.getElementById('title')?.classList.contains('show') && !document.getElementById('boot')?.classList.contains('show'));
  await p.waitForTimeout(1500); await shot(p, 'title');
  await p.evaluate(() => document.getElementById('begin').click());
  await p.waitForFunction(() => { const b = document.getElementById('boot-go'); return b && getComputedStyle(b).display !== 'none'; });
  await p.evaluate(() => document.getElementById('boot-go').click());
  await p.waitForFunction(() => window.__game.G.phase === 'briefing'); await p.waitForTimeout(2500); await shot(p, 'briefing');
  // leave the briefing through its own button, then the screens in play
  await p.evaluate(() => { const b = [...document.querySelectorAll('#bd-brief button')].pop(); b?.click(); const G = window.__game.G; G.phase = 'play'; G.hp = G.maxHp = 1e6; });
  await p.waitForTimeout(3000); await shot(p, 'play');
  await p.keyboard.down('Tab'); await p.waitForTimeout(1500); await shot(p, 'status'); await p.keyboard.up('Tab'); await p.waitForTimeout(500);
  await p.evaluate(() => { const g = window.__game, G = g.G; let best = 0, n = 0; for (let d = 1; d <= G.ship.decks; d++) { const k = G.shipDecks?.[d - 1]?.data?.rooms?.length || 0; if (k > n) { n = k; best = d; } } if (best > 1) { g.loadDeck(best); G.phase = 'play'; } });   // the map on the busiest deck (deck 1 is small)
  await p.waitForTimeout(1500); await p.evaluate(() => window.__game.G.nav?.toggleMap?.(true)); await p.waitForTimeout(2000); await shot(p, 'map'); await p.evaluate(() => window.__game.G.nav?.toggleMap?.(false)); await p.waitForTimeout(500);
  await p.evaluate(() => window.__game.G.hud2.openBoard()); await p.waitForTimeout(1500); await shot(p, 'duty');
} finally { await browser.close(); }
