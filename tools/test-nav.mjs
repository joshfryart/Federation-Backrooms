// Navigation tests (js/nav.js): node unit tests for routing / cross-deck planning / pins, plus a browser block for the HUD (js/nav-hud.js).
//   node tools/test-nav.mjs        (unit tests only; tools/test.mjs runs both)
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

export async function navTests(fail) {
  const N = await imp('js/nav.js'), Gn = await imp('js/gen.js'), { SHIPS } = await imp('js/ships.js');
  const ck = (c, m) => { if (!c) fail('nav: ' + m); return !!c; };
  let routes = 0, bad = 0, cross = 0, shortened = 0; const t0 = performance.now();
  for (let s = 0; s < 6; s++) {
    const ship = SHIPS[(s * 3) % SHIPS.length], seed = 11 + s * 17, decks = Gn.genShip(ship, seed), plan = Gn.shipPlan(ship, seed, decks);
    decks.forEach((d, di) => {
      const w = N.navWorld(d), L = N.liftTile(d), from = { x: L[0] + 0.5, y: L[1] + 0.5 };
      for (const r of d.rooms) {
        if (r.type === 'jefferies') continue; const tt = N.roomTile(d, r), rt = N.routeTo(w, from, tt); routes++;
        if (!rt) { bad++; if (bad < 4) fail(`nav: no route ${ship.name} D${di + 1} lift -> ${r.type}`); continue; }
        const last = rt.pts[rt.pts.length - 1], st = rt.steps;
        let ok = Math.abs(last[0] - tt[0] - 0.5) < 1e-6 && Math.abs(last[1] - tt[1] - 0.5) < 1e-6 && st[st.length - 1][0] === tt[0] && st[st.length - 1][1] === tt[1];
        for (let i = 0; i < st.length && ok; i++) { if (!N.walkable(w, st[i][0], st[i][1])) ok = false; if (i && Math.abs(st[i][0] - st[i - 1][0]) + Math.abs(st[i][1] - st[i - 1][1]) !== 1) ok = false; }
        for (let i = 2; i < rt.pts.length && ok; i++) if (!N.clearLine(w, rt.pts[i - 1][0], rt.pts[i - 1][1], rt.pts[i][0], rt.pts[i][1]) && Math.hypot(rt.pts[i][0] - rt.pts[i - 1][0], rt.pts[i][1] - rt.pts[i - 1][1]) > 1.01) ok = false;
        if (!ok) { bad++; if (bad < 4) fail(`nav: bad route ${ship.name} D${di + 1} -> ${r.type}`); }
        if (rt.pts.length < st.length) shortened++;
        ck(Math.abs(rt.cum[rt.cum.length - 1] - rt.len) < 1e-9 && rt.len <= st.length + 1.5, 'route length bookkeeping');
      }
    });
    // cross-deck: from the top deck's lift to a room type that only lives further down -> walk, ride, walk
    const fromDeck = 0, d0 = decks[0], from = { x: d0.exit[0] + 0.5, y: d0.exit[1] + 0.5 };
    const type = Object.keys(plan).find(t => t !== 'jefferies' && plan[t].every(c => c.deck > 0));
    if (type) {
      const p = N.planRoute(plan, decks, fromDeck, from, { type }); cross++;
      if (ck(p, `cross-deck plan to ${type}`)) {
        ck(p.legs.map(l => l.kind).join() === 'walk,ride,walk', 'cross-deck legs walk,ride,walk: ' + p.legs.map(l => l.kind));
        ck(p.legs[0].to.tx === d0.exit[0] && p.legs[0].to.ty === d0.exit[1], 'first leg ends at the lift car');
        ck(p.legs[1].from === 0 && p.legs[1].to === p.dest.deck && p.legs[2].deck === p.dest.deck && p.dest.deck > 0, 'ride to the destination deck');
        const r2 = p.legs[2].route, e = r2.pts[r2.pts.length - 1]; ck(Math.abs(e[0] - p.dest.tx - 0.5) < 1e-6 && Math.abs(e[1] - p.dest.ty - 0.5) < 1e-6, 'last leg ends at the destination');
        ck(decks[p.dest.deck].room[p.dest.ty][p.dest.tx] === type, 'destination tile is inside a room of that type');
        ck(p.eta > p.legs[1].secs && p.metres > 0, 'eta includes the ride');
        const best = plan[type].map(c => Math.abs(c.deck)).sort((a, b) => a - b)[0]; ck(p.dest.deck <= best + 3, 'chose a near deck');
      }
      const pl = N.planRoute(plan, decks, 0, from, { deck: decks.length - 1 }); ck(pl && pl.legs.map(l => l.kind).join() === 'walk,ride', 'go-to-deck = walk to lift + ride');
      const ll = N.planRoute(plan, decks, 0, { x: d0.start[0] + 0.5, y: d0.start[1] + 0.5 }, { lift: true }); ck(ll && ll.legs.length === 1 && ll.dest.lift, 'nearest lift on this deck');
    }
  }
  const ms = performance.now() - t0;
  ck(routes > 100 && bad === 0, `routes ok (${routes - bad}/${routes})`); ck(shortened > routes * 0.3, 'string pulling shortens routes'); ck(cross >= 3, 'cross-deck cases ran');
  // ---- pins: auto-pin when due, G cycles due -> next -> lift -> none -> first, external pin adopted
  const duty = { t: 100, status: (l) => l.state === 'due' && duty.t - l.dueAt > 60 ? 'overdue' : l.state, loops: [
    { id: 'a', label: 'Alpha rounds', room: 'engineering', sys: 'reactor', state: 'idle', next: 150, period: 200 },
    { id: 'b', label: 'Bravo log', room: 'sickbay', sys: 'sickbay', state: 'idle', next: 300, period: 200 }],
    tasks: [{ id: 't0', task: 'Deliver the coil', room: 'lab', state: 'pending', at_s: 400 }] };
  const P = new N.Pins(); let items = N.dutyItems(duty); ck(!P.update(items), 'nothing due -> no pin');
  duty.loops[0].state = 'due'; duty.loops[0].dueAt = 100; items = N.dutyItems(duty); let p = P.update(items);
  ck(p && p.kind === 'duty' && p.id === 'a' && p.auto, 'auto-pin when a duty comes due');
  ck(items[0].left > 0 && items[0].left <= 180 && items[2].left === null, 'duty has time left, task has none');
  duty.tasks[0].state = 'active'; duty.loops[1].state = 'due'; duty.loops[1].dueAt = 0; duty.t = 130; items = N.dutyItems(duty); p = P.update(items);
  ck(p.id === 'b', 'a more urgent (late) duty takes over an auto pin: ' + p.id);
  const seq = []; for (let i = 0; i < 5; i++) { const q = P.cycle(items); seq.push(q ? q.id : '-'); P.update(items); }
  ck(seq.join(',') === 'a,t0,lift,-,b', 'G cycle order: ' + seq.join(','));
  duty.loops[1].state = 'idle'; items = N.dutyItems(duty); p = P.update(items); ck(p && p.id === 'a', 'finished pin clears and the next due is auto-pinned');
  p = P.update(items, { kind: 'task', id: 't0', room: 'lab', deck: 2 }); ck(p.ext && p.deck === 2 && p.room === 'lab', 'external G.pin adopted');
  ck(P.update(items, { kind: 'task', id: 't0', room: 'lab', deck: 2 }) === p, 'external pin stable');
  ck(N.taskIcon('Deliver the coil') === 'deliver' && N.sysIcon('lifts') === 'lift', 'icons for items');
  console.log(`nav: ${routes} routes (${shortened} string-pulled), ${cross} cross-deck plans, pins ok, ${ms.toFixed(0)} ms`);
}

/** browser block (page = the Systems Nominal page from tools/test.mjs) */
export async function navBrowser(page, fail) {
  const r = await page.evaluate(async () => {
    const g = __game, G = g.G, out = {}; g.newRun(); g.setQuality('low'); document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); G.phase = 'play'; G.hp = 1e6; G.carry = null;
    let t = 300; const tick = (n) => { for (let i = 0; i < n; i++) { t += 1 / 30; G.phase = 'play'; g.step(1 / 30, t); } };
    const key = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    const N = G.nav, w = g.world, d = w.d; tick(4);
    const far = d.openTiles.filter(([x, y]) => d.grid[y][x] === 0 && !d.tubeAxis[x + y * d.W]).sort((a, b) => Math.hypot(b[0] - d.exit[0], b[1] - d.exit[1]) - Math.hypot(a[0] - d.exit[0], a[1] - d.exit[1]))[0];
    g.P.x = (far[0] + 0.5) * 2.5; g.P.z = (far[1] + 0.5) * 2.5;
    N.setPin({ kind: 'lift', id: 'lift', label: 'Nearest lift', icon: 'lift' }, false); tick(6);
    out.liftRoute = N.route ? +N.route.len.toFixed(1) : 0; out.chevrons = w.guide?.im.count || 0; out.beacon = !!w.guide?.bg.visible; out.card = /m/.test(document.getElementById('nv-card').textContent);
    // a room on another deck: walk, ride, walk
    const other = (G.shipDeck + 2) % G.ship.decks, od = G.shipDecks[other].data, rm = od.rooms.find(r => r.type !== 'jefferies');
    N.pinRoom(other, rm); tick(2); out.crossLegs = N.plan?.legs.map(l => l.kind).join();
    // a duty comes due -> auto-pinned; G cycles
    N.setPin(null, false); const L = G.duty.loops; for (const l of L) { l.state = 'idle'; l.next = 1e9; } tick(10); L[0].next = 0; if (L[1]) L[1].next = 0; tick(10);
    out.auto = N.pin ? N.pin.kind + ':' + N.pin.id : null; out.expectAuto = 'duty:' + (G.duty.loops.find(l => l.state === 'due') ? N.pin?.id : '?');
    const seq = []; for (let i = 0; i < 5; i++) { key('KeyG'); tick(1); seq.push(N.pin ? N.pin.kind : '-'); } out.seq = seq.join(',');
    // minimap pixels
    const mm = document.getElementById('minimap'), px = mm.getContext('2d').getImageData(0, 0, mm.width, mm.height).data; let lit = 0; for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 150) lit++;
    out.mini = { w: mm.width, lit };
    // M opens the big map and pauses the world; M closes
    key('KeyM'); out.mapOpen = N.mapOpen && document.getElementById('nv-map').classList.contains('on'); out.paused = G.menuPause === true;
    N.drawMap(); const mc = document.querySelector('#nv-map canvas'), mp = mc.getContext('2d').getImageData(0, 0, mc.width, mc.height).data; let ml = 0; for (let i = 0; i < mp.length; i += 16) if (mp[i] + mp[i + 1] + mp[i + 2] > 120) ml++; out.mapLit = ml;
    out.decks = document.querySelectorAll('#nv-map .dk').length === G.ship.decks;
    key('KeyM'); out.mapClosed = !N.mapOpen && !G.menuPause;
    // Tab schematic, briefing flythrough
    const el = document.getElementById('shipstatus'); N.renderStatus(el); out.schematic = el.querySelectorAll('.nv-node').length;
    const card = document.createElement('div'); document.body.appendChild(card); const bv = N.brief(card); out.brief = !!bv?.canvas; card.remove();
    return out;
  });
  console.log('nav hud:', JSON.stringify(r));
  const ok = r.liftRoute > 2 && r.chevrons > 0 && r.beacon && r.card && r.crossLegs === 'walk,ride,walk' && r.auto && r.auto.startsWith('duty:') && /lift/.test(r.seq) && r.seq.includes('-') && r.seq.split(',').some(s => s === 'duty')
    && r.mini.w === 416 && r.mini.lit > 400 && r.mapOpen && r.paused && r.mapLit > 200 && r.decks && r.mapClosed && r.schematic >= 20 && r.brief;
  if (!ok) fail('nav hud');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) { let bad = false; await navTests((m) => { bad = true; console.log('FAIL', m); }); console.log(bad ? 'FAILED' : 'OK'); process.exit(bad ? 1 : 0); }
