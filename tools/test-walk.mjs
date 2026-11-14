// NPC walking between schedule blocks (Systems Nominal): node tools/test-walk.mjs runs the sim part; walkBrowser(page, fail) is called
// from tools/test.mjs with the nominal page. Checks: sim.bodies() lists walkers at their destination, bodies walk real paths between
// rooms (never jump), board the lift car and are only removed behind shut doors, step out of the car on arrival, force sealed doors,
// use the room instance the sim chose and sit with their friends.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

export async function walkTests(fail) {
  const { SHIPS } = await imp('js/ships.js'), C = await imp('js/crew.js'), K = await imp('js/clock.js'), { CrewSim, WALK_MAX } = await imp('js/sim.js'), G = await imp('js/gen.js');
  const data = JSON.parse(readFileSync(join(ROOT, 'assets/data/comms.json'), 'utf8')), ck = (c, m) => { if (!c) fail('walk: ' + m); return !!c; };
  const ship = SHIPS[0], seed = 7, roster = C.makeComplement(ship, seed), clock = new K.ShipClock({ seed }); clock.assign(roster);
  const plan = G.shipPlan(ship, seed), sim = new CrewSim({ roster, clock, plan, data, seed, decks: ship.decks });
  let walkers = 0, riders = 0, maxEta = 0;
  for (let t = 0; t < 900; t += 0.5) {
    sim.tick(0.5); clock.advance(0.5); if (t % 5) continue;
    for (let dk = 1; dk <= ship.decks; dk++) {
      const B = sim.bodies(dk), on = sim.onDeck(dk); ck(on.every(o => B.has(o.person.id)), 'bodies() holds everyone standing on the deck');
      for (const b of B.values()) { const s = sim.st.get(b.person.id); if (!b.walking) continue; walkers++; maxEta = Math.max(maxEta, s.transit.eta); ck(!s.transit.lift && s.transit.to.deckNo === dk && b.tx === s.transit.to.tx && b.room === s.transit.room, 'a walker is listed at its destination on the same deck'); }
    }
    for (const s of sim.st.values()) if (s.transit?.lift) { riders++; ck(!sim.bodies(s.deckNo).has(s.person.id) && !sim.bodies(s.transit.to.deckNo).has(s.person.id), 'a lift rider has no body on either deck'); }
  }
  ck(walkers > 0 && riders > 0, `walkers ${walkers}, riders ${riders}`); ck(maxEta <= WALK_MAX * 1.1 + 0.01, `walk eta capped (${maxEta})`);
  return { walkers, riders, maxEta: +maxEta.toFixed(1) };
}

export async function walkBrowser(page, fail) {
  const r = await page.evaluate(async () => {
    const g = __game, G = g.G, P = g.P, out = {}; G.forceShip = 0; g.newRun(); g.setQuality('low'); document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); G.hp = G.maxHp = 1e6; G.phase = 'play';
    let t = 0; const tick = (n) => { for (let i = 0; i < n; i++) { t += 1 / 30; G.phase = 'play'; g.step(1 / 30, t); } };
    const S = g.sim, dn = G.shipDecks.findIndex((d, i) => S.onDeck(i + 1).length >= 6 && new Set(d.data.rooms.map(r => r.type)).size >= 3); if (dn >= 0 && dn !== G.shipDeck) g.loadDeck(dn + 1);
    tick(5); g.simBodies(0, true); if (g.haul) g.haul.t = 1e9;   // no cart jobs during the test
    const w = g.world, d = w.d, here = G.shipDeck + 1, car = w.car, body = (p) => g.ents.find(e => e.simmed && e.person === p), tileOf = (e) => w.tile(e.x, e.z);
    const idle = () => g.ents.filter(e => e.simmed && !e.walk && !e.board && e.mesh?.userData.human && !S.overridden(e.person) && !S.st.get(e.person.id)?.transit);
    // follow a body for up to `secs`: largest jump per frame, whether it was ever missing, stop when done(e)
    const follow = (p, secs, done, see = true) => { let e = body(p), last = e && [e.mesh.position.x, e.mesh.position.z], jump = 0, lost = false, n = 0, lastOpen = null, lastTile = null; for (; n < secs * 30; n++) { if (e && see) { P.x = e.x + 1.2; P.z = e.z; P.vx = P.vz = 0; } tick(1); e = body(p); if (!e) { lost = true; break; } jump = Math.max(jump, Math.hypot(e.mesh.position.x - last[0], e.mesh.position.z - last[1])); last = [e.mesh.position.x, e.mesh.position.z]; lastOpen = w.liftOpen; lastTile = tileOf(e); if (done(e)) break; } return { jump: +jump.toFixed(2), lost, secs: +(n / 30).toFixed(1), e, lastOpen, lastTile }; };
    // 1) another room on this deck: the body sets off at once and walks all the way, in sight, without a jump
    { const e = idle()[0], p = e.person, rm = d.rooms.find(r => r.type !== e.room && r.type !== 'jefferies' && G.plan[r.type]?.some(s => s.deckNo === here && s.tx >= r.x && s.tx < r.x + r.w && s.ty >= r.y && s.ty < r.y + r.h) && g.simTileFor(p, { room: r.type, spot: 'door', tx: r.x + (r.w >> 1), ty: r.y + (r.h >> 1) }));
      const site = G.plan[rm.type].find(s => s.deckNo === here && s.tx >= rm.x && s.tx < rm.x + rm.w && s.ty >= rm.y && s.ty < rm.y + rm.h);
      S.redirect(p, rm.type, 'door', 600, 'ordered', { prio: 2, site }); P.x = e.x + 1.2; P.z = e.z; tick(70); const started = !!e.walk?.opts.sim && !e.walk.vanish, listed = S.bodies(here).get(p.id)?.room === rm.type;
      const f = follow(p, 150, (b) => !b.walk), tl = f.e ? tileOf(f.e) : [0, 0]; out.room = { started, listed, jump: f.jump, lost: f.lost, secs: f.secs, inRoom: d.room[tl[1]]?.[tl[0]] === rm.type, inRect: tl[0] >= rm.x && tl[0] < rm.x + rm.w && tl[1] >= rm.y && tl[1] < rm.y + rm.h, key: !!f.e?.simKey }; S.release(p); }
    // 2) a room on another deck: walks into the lift car, stands there, and is only removed once the doors are shut
    { const e = idle()[0], p = e.person, other = Object.keys(G.plan).map(k => G.plan[k].find(s => s.deckNo !== here)).find(Boolean), type = Object.keys(G.plan).find(k => G.plan[k].includes(other));
      S.redirect(p, type, 'door', 600, 'ordered', { prio: 2, site: other }); P.x = e.x + 1.2; P.z = e.z; tick(70); const toLift = !!e.walk?.vanish || !!e.board;
      let boarded = false; const f = follow(p, 200, (b) => { boarded = boarded || !!b.board; return false; });
      out.leave = { toLift, boarded, jump: f.jump, gone: f.lost, secs: f.secs, inCar: !!f.lastTile && f.lastTile[0] === car.tx && f.lastTile[1] === car.ty, doorsShut: f.lastOpen === false, where: S.where(p)?.deckNo };
      // 3) ...and back: appears inside the car (doors shut or out of sight), then walks out to the room
      const rm = d.rooms.find(r => r.type !== 'jefferies' && G.plan[r.type]?.some(s => s.deckNo === here && s.tx >= r.x && s.tx < r.x + r.w && s.ty >= r.y && s.ty < r.y + r.h)), site = G.plan[rm.type].find(s => s.deckNo === here && s.tx >= rm.x && s.tx < rm.x + rm.w && s.ty >= rm.y && s.ty < rm.y + rm.h);
      S.redirect(p, rm.type, 'door', 600, 'ordered', { prio: 2, site }); P.x = car.x + car.dx * 3; P.z = car.z + car.dy * 3; P.vx = P.vz = 0;   // the player stands in front of the open car, looking in
      let first = null, shutAtSpawn = null, n = 0; for (; n < 60 * 30 && !first; n++) { const open0 = w.liftOpen; tick(1); const b = body(p); if (b) { first = tileOf(b); shutAtSpawn = !open0; } }
      const f2 = first ? follow(p, 150, (b) => !b.walk, false) : { jump: -1, lost: true }; const tl = f2.e ? tileOf(f2.e) : [0, 0];
      out.arrive = { appeared: !!first, inCar: !!first && first[0] === car.tx && first[1] === car.ty, shutAtSpawn, jump: f2.jump, lost: f2.lost, inRoom: d.room[tl[1]]?.[tl[0]] === rm.type, secs: +(n / 30).toFixed(1) }; S.release(p); }
    // 4) sealed doors (power out): a walker held up at one forces it and gets through
    { const dr = (w.doors || []).map(o => { const a = o.f.ax ? [1, 0] : [0, 1], A = w.tile(o.f.x - a[0] * 1.5, o.f.z - a[1] * 1.5), B = w.tile(o.f.x + a[0] * 1.5, o.f.z + a[1] * 1.5); return { o, A, B }; }).find(q => d.grid[q.A[1]]?.[q.A[0]] === 0 && d.grid[q.B[1]]?.[q.B[0]] === 0 && (q.A[0] !== q.B[0] || q.A[1] !== q.B[1]) && g.pathField(q.B[0], q.B[1])[q.A[0] + q.A[1] * w.W] === 1);
      const e = idle()[0]; out.seal = { door: !!dr };
      if (dr && e) { const [ax, az] = w.center(dr.A[0], dr.A[1]); e.x = ax; e.z = az; e.mesh.position.set(ax, 0, az); P.x = ax + 30; P.z = az; G.blackout = 90; for (let i = 0; i < 30; i++) tick(1);   /* main power failure: doors seal */ const shut = dr.o.open < 0.5;
        g.startWalk(e, dr.B[0], dr.B[1], false); let pried = false, n = 0; for (; n < 30 * 30 && e.walk; n++) { tick(1); pried = pried || dr.o.pried > 0; } const tl = tileOf(e);
        out.seal = { door: true, shut, pried, secs: +(n / 30).toFixed(1), through: !e.walk && tl[0] === dr.B[0] && tl[1] === dr.B[1] }; G.blackout = 0.01; tick(2); } }
    // 5) room instance + friends: the tile is inside the instance the sim chose; a friend already there draws you to the same furniture
    { const types = [...new Set(d.rooms.map(r => r.type))], multi = types.map(tp => d.rooms.filter(r => r.type === tp && G.plan[tp]?.some(s => s.deckNo === here && s.tx >= r.x && s.tx < r.x + r.w && s.ty >= r.y && s.ty < r.y + r.h))).find(l => l.length >= 2);
      const inRect = (t, r) => !!t && t[0] >= r.x && t[0] < r.x + r.w && t[1] >= r.y && t[1] < r.y + r.h, p0 = g.roster.people.find(p => !p.isPlayer);
      out.inst = multi ? multi.map(r => inRect(g.simTileFor(p0, { room: r.type, spot: 'door', tx: r.x + (r.w >> 1), ty: r.y + (r.h >> 1) }), r)) : null;
      const { propsFor } = await import("./js/equipment.js"); const SO = g.social, pair = g.roster.people.filter(p => !p.isPlayer && !body(p)).map(p => [p, g.roster.people[SO.seekTargets(p)[0]?.id]]).find(([a, b]) => b && !b.isPlayer && !body(b));
      const spots = ['table', 'bar', 'sofa', 'console', 'desk', 'bunk'], rm = d.rooms.map(r => ({ r, spot: spots.find(sp => d.props.filter(q => propsFor(sp).includes(q.kind) && d.room[q.ty]?.[q.tx] === r.type && inRect([q.tx, q.ty], r)).length >= 2) })).find(x => x.spot);
      if (pair && rm) { const [a, b] = pair, o = { room: rm.r.type, spot: rm.spot, tx: rm.r.x + (rm.r.w >> 1), ty: rm.r.y + (rm.r.h >> 1), free: true }, tb = g.simTileFor(b, o), [bx, bz] = w.center(tb[0], tb[1]);
        const fake = { kind: 'crew', simmed: true, person: b, room: o.room, spot: o.spot, x: bx, z: bz, simProp: tb.prop, mesh: null }; g.ents.push(fake); const ta = g.simTileFor(a, o); g.ents.splice(g.ents.indexOf(fake), 1);
        const alone = g.simTileFor(a, { ...o, free: false });
        out.friends = { prop: !!tb.prop, same: !!ta && ta.prop === tb.prop, apart: ta[0] !== tb[0] || ta[1] !== tb[1], inRect: inRect(ta, rm.r), alone: !!alone }; } }
    out.bodies = { n: g.ents.filter(e => e.simmed && !e.board && !e.walk?.vanish).length, sim: S.bodies(here).size };
    return out;
  });
  console.log('npc walking:', JSON.stringify(r));
  const R = r.room, L = r.leave, A = r.arrive, S = r.seal, F = r.friends;
  if (!(R && R.started && R.listed && !R.lost && R.jump < 0.6 && R.inRoom && R.inRect && R.key)) fail('npc walk to another room ' + JSON.stringify(R));
  if (!(L && L.toLift && L.boarded && L.gone && L.inCar && L.doorsShut && L.jump < 0.6 && L.where !== undefined)) fail('npc boards the lift ' + JSON.stringify(L));
  if (!(A && A.appeared && A.inCar && A.shutAtSpawn && !A.lost && A.jump < 0.6 && A.inRoom)) fail('npc arrives by lift ' + JSON.stringify(A));
  if (!(S && (!S.door || (S.shut && S.pried && S.through)))) fail('npc at a sealed door ' + JSON.stringify(S));
  if (r.inst && !r.inst.every(Boolean)) fail('npc room instance ' + JSON.stringify(r.inst));
  if (F && !(F.inRect && F.apart && (!F.prop || F.same))) fail('npc sits with friends ' + JSON.stringify(F));
  if (!(r.bodies.n <= r.bodies.sim)) fail('npc bodies vs sim ' + JSON.stringify(r.bodies));
  return r;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) { const errs = []; const r = await walkTests(m => errs.push(m)); console.log(errs.length ? [...new Set(errs)].join('\n') : 'walk OK ' + JSON.stringify(r)); process.exit(errs.length ? 1 : 0); }
