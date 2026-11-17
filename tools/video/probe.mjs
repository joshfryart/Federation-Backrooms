// probe: ships, crew sizes, rooms per deck, clips, render timing (exploration helper for the shanty video)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('pageerror', e.message));
await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = function () { return Promise.resolve(); }; });
await page.goto(`http://localhost:8123/index.html?brief=0&mode=nominal`);
await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 180000 }); await page.evaluate(() => __game.ready); await page.evaluate(() => __game.warmed);
const ships = await page.evaluate(async () => { const { SHIPS } = await import('/js/data.js'); return SHIPS.map((s, i) => [i, s.name, s.cls, s.decks]); });
console.log(JSON.stringify(ships));
const ship = +(process.argv[2] ?? 1), seed = +(process.argv[3] ?? 1);
const info = await page.evaluate(([ship, seed]) => {
  const g = __game, G = g.G; G.manual = true; G.forceShip = ship; G.forceSeed = seed; g.newRun(); document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); G.phase = 'play';
  const R = g.roster, ppl = R.people; const p0 = ppl[0];
  const plan = {}; for (const ty in G.plan) plan[ty] = G.plan[ty].map(r => r.deckNo).join(',');
  const decks = G.shipDecks.map(sd => { const c = {}; for (const r of sd.data.rooms) c[r.type] = (c[r.type] || 0) + 1; return c; });
  const H = g.scene.getObjectByProperty?.('type', 'x'); 
  return { ship: G.ship.name, decks: G.ship.decks, n: ppl.length, alive: ppl.filter(p => p.status !== 'dead').length, keys: Object.keys(p0), p0: JSON.stringify(p0).slice(0, 1500), depts: [...new Set(ppl.map(p => p.dept))], plan, decksRooms: decks, ents: g.ents.filter(e => e.person).length };
}, [ship, seed]);
console.log(JSON.stringify(info, null, 1));
const clips = await page.evaluate(() => { const e = __game.ents.find(e => e.mesh?.userData?.human); return e ? Object.keys(e.mesh.userData.human.inner ? {} : {}) : null; });
for (const q of ['low', 'high']) {
  const t = await page.evaluate((q) => { const g = __game; g.setQuality(q); g.renderOnce(); const t0 = performance.now(); for (let i = 0; i < 3; i++) g.renderOnce(); return (performance.now() - t0) / 3; }, q);
  const t1 = Date.now(); for (let i = 0; i < 3; i++) await page.screenshot({ type: 'jpeg', quality: 90 }); console.log(q, 'render ms', t.toFixed(0), 'screenshot ms', ((Date.now() - t1) / 3).toFixed(0));
}
await page.screenshot({ path: process.env.OUT || '/tmp/probe.jpg', type: 'jpeg' });
await browser.close();
