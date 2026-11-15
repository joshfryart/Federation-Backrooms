// Art wiring pass (docs/propart-integration.md "Wiring pass"): system hosts on the batch hardware, art carts, wear glue (cache, headgear, donning, sleepers),
// field / sight / pod-lamp animation, stretcher bracket pickup, handheld icons and deck-plan symbols.  node tools/test-wiring.mjs (unit half only)
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

export async function wiringTests(fail) {
  const C = await imp('js/crew.js'), E = await imp('js/equipment.js'), { generate } = await imp('js/gen.js'), { SHIPS, deckOptions } = await imp('js/ships.js'), PS = await imp('js/propsymbols.js');
  const ck = (c, m) => { if (!c) fail('wiring: ' + m); return !!c; };
  // hosts: a deck with the hardware hosts the system on it (first matching prop; coolant only in a plant room); every host has a label
  const HOST = { coolant: 'pumpskid', life: 'scrubber', gravity: 'fieldgen', dampers: 'fieldgen_damp', comms: 'relayrack', armory: 'chargerack' }, seen = {}, miss = [];
  for (let i = 0; i < 160; i++) {
    const ship = SHIPS[i % SHIPS.length], sd = i % ship.decks, d = generate(sd, i * 3301 + 7, deckOptions(ship, sd)), hw = C.hardwareSites(d);
    for (const [sys, kind] of Object.entries(HOST)) { const has = d.props.some(p => p.kind === kind && (sys !== 'coolant' || d.room[p.ty][p.tx] === 'plant')); if (!has) continue; seen[sys] = (seen[sys] || 0) + 1; const h = hw.find(x => x.sys === sys); if (h?.kind !== kind) miss.push(`${sys}@${i}:${h?.kind}`); }
    if (d.props.some(p => p.kind === 'growbed')) { const h = hw.find(x => x.sys === 'hydro'); ck(h?.kind === 'growbed', `hydro prefers a grow bed (got ${h?.kind}) level ${i}`); }
  }
  ck(!miss.length, 'system hosts on hardware: ' + miss.slice(0, 5).join(' '));
  for (const s of Object.keys(HOST)) ck(seen[s] > 0, `no generated deck had the ${s} host hardware`);
  for (const s of C.SYSTEMS) ck(C.HOST_LABEL[s.host], `HOST_LABEL ${s.host}`);
  // art carts: CARTS rows with their prop art, pushed by the deck crew / galley / pilots
  for (const [k, art] of [['sled', 'hoversled'], ['bowser', 'fuelbowser'], ['trolley', 'galley_trolley'], ['linen', 'linen_cart']]) ck(E.CARTS[k]?.art === art && E.CARTS[k].grip > 0 && E.CARTS[k].w > 0 && E.CARTS[k].l > 0, `CARTS.${k}`);
  ck(E.HAULERS.deck.cart === 'sled' && E.HAULERS.galley.cart === 'trolley' && E.HAULERS.pilot?.cart === 'bowser', 'haulers push the art carts');
  // suit locker: the donning hook; stretcher names
  ck(E.EQUIPMENT.suitrack.steps.some(s => s.fx === 'don_suit') && E.EQUIPMENT.airlock_doors.steps.some(s => s.fx === 'don_suit'), 'suitrack don_suit step');
  ck(E.classifyItem('Folding stretcher') === 'stretcher' && E.classifyItem('stretcher docking clamp, wall') !== 'stretcher' && E.classifyItem('Signal splitter module, 1U') !== 'stretcher', 'classifyItem stretcher');
  // U-3 symbols: the new hosts draw (mock 2D context), unknown kinds fall back
  const ops = []; const g = new Proxy({}, { get: (o, k) => k in o ? o[k] : (...a) => ops.push(k), set: (o, k, v) => { o[k] = v; return true; } });
  for (const k of ['growbed', 'relayrack', 'chargerack', 'buffertank', 'cellfield', 'pumpskid', 'scrubber', 'fieldgen_damp']) ck(PS.drawPropSymbol(g, k, 20) && PS.PROP_NAME_X[k], `deck-plan symbol ${k}`);
  ck(!PS.drawPropSymbol(g, 'no_such_prop', 20) && ops.length > 20, 'deck-plan symbol fallback');
}

// browser half: page = a Systems Nominal page (tools/test.mjs page3)
export async function wiringBrowser(page, fail) {
  const r = await page.evaluate(async () => {
    const g = __game, G = g.G, P = g.P, out = {}, hide = () => document.querySelectorAll('.screen').forEach(s => s.classList.remove('show'));
    let t = 0; const tick = (n) => { for (let i = 0; i < n; i++) { t += 1 / 30; G.phase = 'play'; g.step(1 / 30, t); } };
    const THREE = await import('three'), { makeSurvivor } = await import('./js/humans.js'), { dressCrew } = await import('./js/actors.js'), { outfitFor } = await import('./js/wearart.js'), E = await import('./js/equipment.js'), { HH_ICON } = await import('./js/menus.js');
    G.forceShip = 0; g.newRun(); hide(); g.setQuality('low'); G.hp = G.maxHp = 1e6;
    // 1) clothes cache: after the load-time prewarm, dressing 17 crew costs next to nothing and shares geometry per body kind
    { for (let i = 0; i < 100 && (await import('./js/wearart.js')).wearCacheSize() < 20; i++) await new Promise(res => setTimeout(res, 100));
      const ppl = g.roster.people.filter(p => outfitFor(p)).slice(0, 17), ms = [], meshes = []; for (const p of ppl) { const m = makeSurvivor(Math.random, p), t0 = performance.now(); dressCrew(m, p); ms.push(performance.now() - t0); meshes.push([p.body, m.userData.outfit]); }
      const geo = {}; let shared = 0; for (const [k, w] of meshes) { if (!w) continue; const key = k + w.id, gg = w.meshes[0].geometry; if (geo[key] === gg) shared++; geo[key] = gg; }
      out.cache = { n: ppl.length, total: +ms.reduce((a, b) => a + b, 0).toFixed(1), max: +Math.max(...ms).toFixed(1), dressed: meshes.filter(m => m[1]).length, shared }; }
    // 2) repair points on every deck of two ships (the parkour check wants >= 20)
    { const pts = []; for (const si of [0, 5]) { G.forceShip = si; g.newRun(); hide(); for (let d = 0; d < G.shipDecks.length; d++) { g.loadDeck(d + 1); pts.push(g.repairPts.length); } } out.points = { min: Math.min(...pts), n: pts.length, mains: null }; }
    // 3) a deck with people, a bunk and (if any) a suit locker
    G.forceShip = 0; g.newRun(); hide(); g.setQuality('low'); G.hp = G.maxHp = 1e6;
    { const sc = G.shipDecks.map((d, i) => (d.data.props.some(p => p.kind === 'bunk' || p.kind === 'platform_bed') ? 10 : 0) + Math.min(5, g.sim.onDeck(i + 1).length)); g.loadDeck(sc.indexOf(Math.max(...sc)) + 1); tick(5); g.simBodies(0, true); }
    G.simT = 1e9; if (g.haul) g.haul.t = 1e9; const w = g.world, hum = (x) => x?.mesh?.userData.human, crew = () => g.ents.filter(x => x.simmed && hum(x) && !x.fake);
    // breathers on a fire alert for the crew in view, off on all-clear
    { const e0 = crew().find(x => !x.walk) || crew()[0]; if (e0) { P.x = e0.x + 1.5; P.z = e0.z; tick(2); g.alerts.raise('fire', { deck: G.shipDeck + 1 }); tick(60);
      const near = crew().filter(x => Math.hypot(x.x - P.x, x.z - P.z) < 18); out.mask = { near: near.length, on: near.filter(x => x.wear?.mask?.meshes[0]?.visible).length }; g.alerts.clear('fire'); tick(3); out.mask.after = near.filter(x => x.wear?.mask).length; } }
    // a sleeper lies on the bunk (block forced to 'sleep'), gets up when it ends, then walks
    { const bunk = w.d.props.find(p => (p.kind === 'bunk' || p.kind === 'platform_bed') && !crew().some(o => o.wear?.lie?.p === p)), e = crew().find(x => !x.walk && !x.wear?.lie);   /* a bed nobody sleeps on (one sleeper per bed) */ if (bunk && e) {
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [bunk.tx + a, bunk.ty + b]).find(([x, y]) => w.d.grid[y]?.[x] === 0 && !w.solid(x, y)), [x, z] = w.center(...nb);
      e.walk = null; e.x = x; e.z = z; e.mesh.position.set(x, 0, z); e.spot = 'bunk'; e.faceAt = w.center(bunk.tx, bunk.ty); g.opEnd(e); g.opStart(e);
      const S = g.sim, where = S.where; S.where = (p) => p === e.person ? { ...where.call(S, p), activity: 'sleep' } : where.call(S, p); P.x = x + 2; P.z = z + 2; tick(30);
      const hp = hum(e).bones.Head.getWorldPosition(new THREE.Vector3()); out.lie = { lying: !!e.wear?.lie, rotX: +e.mesh.rotation.x.toFixed(2), headY: +hp.y.toFixed(2), logical: +Math.hypot(e.x - x, e.z - z).toFixed(2) };
      S.where = (p) => p === e.person ? { ...where.call(S, p), activity: 'handover_in' } : where.call(S, p); tick(5); delete S.where;   /* the block ends (the real one may be 'sleep' too) */ out.lie.up = !e.wear?.lie && Math.abs(e.mesh.rotation.x) < 0.01;
      const t0 = w.tile(e.x, e.z), dst = w.d.openTiles.find(([a, b]) => Math.abs(a - t0[0]) + Math.abs(b - t0[1]) > 3 && w.field(a, b, true)[t0[0] + t0[1] * w.W] > 0);
      if (dst) { g.startWalk(e, dst[0], dst[1]); let n = 0; for (; n < 30 * 60 && e.walk; n++) tick(1); out.lie.walked = !e.walk; } } }
    // pod hatch lamps / field shimmer / sight glow: find decks that have them
    { let pods = 0, f = null, sg = null; for (let d = 0; d < G.shipDecks.length && (!pods || !f || !sg); d++) { const dd = G.shipDecks[d].data; if (!dd.rooms.some(r => r.type === 'airlock') && !dd.props.some(p => p.kind === 'cellfield' || p.kind === 'buffertank')) continue; g.loadDeck(d + 1); tick(2);
        if (g.world.podMat) pods++; if (g.world.fieldMats && !f) { const m = [...g.world.fieldMats][0], a = m.opacity; tick(4); g.shipState.damage('security', 0.9); tick(2); f = { live: Math.max(a, m.opacity), off: m.opacity }; g.shipState.repair('security'); }
        if (g.world.sights && !sg) { const m = g.world.sights[0], a = m.color.g; tick(25); sg = { moved: Math.abs(m.color.g - a) > 0.02 }; } }
      out.anim = { pods, field: f, sight: sg }; }
    // stretcher off its bracket
    { let c = null; for (let si = 0; si < 10 && !c; si++) { G.forceShip = si; g.newRun(); hide(); for (let d = 0; d < G.shipDecks.length && !c; d++) { if (!G.shipDecks[d].data.rooms.some(r => r.type === 'sickbay')) continue; g.loadDeck(d + 1); c = g.world.clutter.find(q => q.item === 'stretcher'); } }
      if (c) { for (const e of g.ents) if (e.kind === 'crew') { e.x += 60; if (e.mesh) e.mesh.position.x += 60; } const dx = c.x - c.bracket.position.x, dz = c.z - c.bracket.position.z, L = Math.hypot(dx, dz); P.x = c.x + dx / L * 0.6; P.z = c.z + dz / L * 0.6; P.yaw = Math.atan2(dx, dz); G.carry = null; tick(2);
        const prompt = document.getElementById('prompt').textContent; g.interact(); tick(1); out.stretcher = { prompt: /Take/.test(prompt), item: G.carry?.item, gone: !g.world.clutter.includes(c), hidden: c.bracket.children.filter(o => !o.visible).length }; G.carry = null; } else out.stretcher = null; }
    { const { makeCart } = await import('./js/carry.js'); out.carts = ['sled', 'bowser', 'trolley', 'linen'].map(k => { const c = makeCart(k, true); return [k, c.userData.art, c.userData.wheels.length, c.userData.load.length]; }); }
    out.icons = ['dermal', 'scalpel', 'plasma_torch', 'extinguisher', 'mop', 'cargo_hook', 'crowbar', 'phaser_rifle'].map(HH_ICON).join(',');
    return out;
  });
  console.log('wiring:', JSON.stringify(r));
  const ck = (c, m) => { if (!c) fail('wiring: ' + m + ' ' + JSON.stringify(r)); };
  ck(r.cache.dressed >= Math.min(10, r.cache.n) && r.cache.total < 40 && r.cache.max < 15 && r.cache.shared > 0, 'dressed crew spawn from the clothes cache');
  ck(r.carts.every(([k, art, wh]) => art && wh === 4), 'art carts build');
  ck(r.points.min >= 20, 'repair points per deck >= 20');
  ck(!r.mask || (r.mask.on === r.mask.near && r.mask.after === 0), 'breathers on fire alert');
  ck(!r.lie || (r.lie.lying && Math.abs(r.lie.rotX + Math.PI / 2) < 0.05 && r.lie.headY < 1 && r.lie.logical < 1.4 && r.lie.up && r.lie.walked !== false), 'sleeper lies on the bunk, gets up and walks');
  ck(r.anim.pods > 0 && (!r.anim.field || (r.anim.field.live > 0.03 && r.anim.field.off === 0)) && (!r.anim.sight || r.anim.sight.moved), 'pod lamps / field cell / pattern buffer animation');
  ck(!r.stretcher || (r.stretcher.prompt && r.stretcher.item === 'stretcher' && r.stretcher.gone && r.stretcher.hidden >= 10), 'stretcher from its bracket');
  ck(r.icons === 'regen,scalpel,torch,extinguisher,mop,hook,crowbar,rifle', 'handheld icons');
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) { const errs = []; await wiringTests(m => errs.push(m)); console.log(errs.length ? errs.slice(0, 20).join('\n') : 'wiring OK'); process.exit(errs.length ? 1 : 0); }
