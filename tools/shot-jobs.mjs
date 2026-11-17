// README / TODO screenshots of the job systems (Systems Nominal), headless Chromium + the software renderer.
//   python3 -m http.server 8123 &   node tools/shot-jobs.mjs [scene ...] [--port 8123] [--dsf 1]
//   scenes: card (LCARS instruction card), game (LCARS console game), sites (work-site markers + checklist), route (J board -> route pinned)
// ?brief=0 (navigator.webdriver is true under Playwright), pointer lock stubbed, driven through window.__game on the test clock.
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const PORT = +opt('port', 8123), DSF = +opt('dsf', 1), scenes = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const FILES = { card: '12-job-card-lcars.png', game: '13-job-console-lcars.png', sites: '14-job-worksites.png', route: '15-job-route.png' };
const { chromium } = createRequire(import.meta.url)('playwright');   // the pre-installed Playwright (CommonJS), as tools/test.mjs loads it
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const scene of (scenes.length ? scenes : Object.keys(FILES))) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: DSF });
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = function () { return Promise.resolve(); }; });
  await page.goto(`http://localhost:${PORT}/index.html?brief=0`);
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 180000 }); await page.evaluate(() => __game.ready); await page.evaluate(() => __game.warmed);
  const info = await page.evaluate((scene) => {
    const g = __game, G = g.G, P = g.P, CFG = g.CFG; G.manual = true; G.forceShip = 1; g.newRun(); document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); G.phase = 'play'; G.hp = G.maxHp = 1e6;
    document.exitPointerLock?.(); G.menus.lock = () => null; CFG.learned = {};
    const WANT = { card: ['sickbay', 'lab'], game: ['engineering', 'plant', 'lab'], sites: ['sickbay', 'mess', 'cargo'], route: ['sickbay', 'engineering'] }[scene];
    { const pl = WANT.map(ty => G.plan?.[ty]?.[0]).find(Boolean); if (pl && pl.deckNo !== G.shipDeck + 1) { g.loadDeck(pl.deckNo); G.phase = 'play'; } }   // the deck that has the room
    const D = g.duty, w = g.world, d = w.d, l = D.loops[0]; let t = 0; const step = (n = 1) => { for (let i = 0; i < n; i++) { t += 1 / 30; g.step(1 / 30, t); } };
    const open = (x, z) => { const [tx, ty] = w.tile(x, z); return d.grid[ty]?.[tx] === 0 && !w.isTube?.(tx, ty); };
    const cellIn = (r, pick = 0.5) => { const c = []; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { const [cx, cz] = w.center(x, y); if (open(cx, cz)) c.push([cx, cz]); } return c[Math.floor(c.length * pick)] || c[0]; };
    const prefer = (types) => { for (const ty of types) { const r = d.rooms.filter(r => r.type === ty).sort((a, b) => b.w * b.h - a.w * a.h)[0]; if (r && cellIn(r)) return r; } return d.rooms.find(r => cellIn(r)); };
    const face = (x, z) => { P.yaw = Math.atan2(-(x - P.x), -(z - P.z)); };
    if (D.busy) D.busy = null;
    if (scene === 'card' || scene === 'game') {
      const r = prefer(scene === 'card' ? ['sickbay', 'lab', 'engineering', 'bridge'] : ['engineering', 'bridge', 'lab', 'sickbay']); const [x, z] = cellIn(r); P.x = x; P.z = z; P.pitch = -0.05;
      const pr = d.props.find(p => p.tx >= r.x && p.tx < r.x + r.w && p.ty >= r.y && p.ty < r.y + r.h); if (pr) face(...w.center(pr.tx, pr.ty)); step(3);
      Object.assign(l, scene === 'card' ? { label: 'Crew health screening', spot: 'biobed', room: r.type } : { label: 'Balance grid load against reactor output', spot: 'console', room: r.type }, { sys: '', state: 'due', dueAt: D.t }); D.setPlace(G.shipDeck + 1, r.type);
      g.startJob(l, { console: true }); const J = g.jobgame;
      if (scene === 'game') { J.key('Enter'); for (let i = 0; i < 40; i++) J.tick(1 / 30); const gm = J.game; for (const [c, dn] of gm.hint().slice(0, 2)) J.key(c, dn); J.tick(1 / 30); J.draw(); }
      return { room: r.type, kind: J.game?.kind || J.active?.tool.kind, phase: J.phase };
    }
    if (scene === 'sites') {
      const r = prefer(['sickbay', 'mess', 'cargo', 'lab']), lab = { sickbay: 'Ward rounds', mess: 'Scrub and sanitise the galley', cargo: 'Re-secure loose pallets', lab: 'Swab and contamination log' }[r.type] || 'Scrub and sanitise the galley';
      Object.assign(l, { label: lab, spot: 'biobed', room: r.type, sys: '', state: 'due', dueAt: D.t }); const [x, z] = cellIn(r, 0.15); P.x = x; P.z = z; P.pitch = -0.32; step(3);
      const res = g.startJob(l), run = g.sites.run; if (run) { const s = run.sites[run.sites.length > 2 ? 2 : 1] || run.sites[0], c = run.sites.map(s => w.center(s.tx, s.ty)); const mx = c.reduce((a, b) => a + b[0], 0) / c.length, mz = c.reduce((a, b) => a + b[1], 0) / c.length;
        let best = null; for (let y = r.y; y < r.y + r.h; y++) for (let xx = r.x; xx < r.x + r.w; xx++) { const [cx, cz] = w.center(xx, y); if (!open(cx, cz)) continue; const dd = Math.hypot(cx - mx, cz - mz); if (!best || dd > best[2]) best = [cx, cz, dd]; }
        if (best) { P.x = best[0]; P.z = best[1]; } face(mx, mz); run.sites[0].prog = 1; run.sites[0].done = true; if (run.sites[1]) run.sites[1].prog = 0.45; step(4); void s; }
      return { room: r.type, ok: res.ok, def: run?.def.id, sites: run?.sites.length };
    }
    if (scene === 'route') {
      const target = prefer(['sickbay', 'engineering', 'lab']), from = d.rooms.filter(r => r.type !== target.type && cellIn(r)).sort((a, b) => Math.hypot(b.x - target.x, b.y - target.y) - Math.hypot(a.x - target.x, a.y - target.y))[0];
      Object.assign(l, { label: 'Ward rounds', spot: 'biobed', room: target.type, sys: '', state: 'due', dueAt: D.t }); const [x, z] = cellIn(from); P.x = x; P.z = z; P.pitch = -0.12; step(3);
      const r = g.goJob(l); step(6); const N = G.nav, leg = N?.route; if (leg?.pts?.length > 2) { const q = leg.pts[Math.min(3, leg.pts.length - 1)]; face(...(q.length ? q : [q.x, q.z])); }
      step(4); return { ok: r.ok, routed: r.routed, pin: N?.pin?.kind, hint: G.hud2?.hintEl?.textContent };
    }
  }, scene);
  await page.evaluate(() => __game.renderOnce());
  await page.screenshot({ path: join(ROOT, 'docs/screenshots', FILES[scene]) });
  console.log(scene, FILES[scene], JSON.stringify(info)); await page.close();
}
await browser.close();
