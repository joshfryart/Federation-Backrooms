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
  // ordered jobs (js/duty.js Duty.atJob, docs/pathing.md iteration 1): the job's clock waits until the person is at the job (or JOB_WAIT runs out); events carry the job
  const D = await imp('js/duty.js'), duties = JSON.parse(readFileSync(join(ROOT, 'assets/data/duties.json'), 'utf8')), boss = roster.people.find(p => p.billet === 'cos') || roster.people[0];
  const duty = new D.Duty({ player: boss, roster, clock, sim, duties, seed, mission: 'quiet_watch' }), evs = []; duty.on(ev => evs.push(ev)); let there = false; duty.atJob = () => there;
  let job = null; for (const s of duty.subs()) { for (let k = 0; k < 40 && !job; k++) { duty.t += 5; const r = duty.order(s, null); if (r.ok) job = r.job; } if (job) break; }
  let order = null; if (ck(job, 'an order was obeyed')) { const left0 = job.left; for (let i = 0; i < 60; i++) duty.tick(0.5); const held = job.left === left0 && duty.jobs.includes(job); there = true; for (let i = 0; i < left0 * 2 + 4; i++) duty.tick(0.5); const done = !duty.jobs.includes(job);
    there = false; const r2 = (() => { for (const s of duty.subs()) for (let k = 0; k < 40; k++) { duty.t += 5; const r = duty.order(s, null); if (r.ok) return r; } return null; })(); let waited = 0; while (r2 && duty.jobs.includes(r2.job) && waited < D.JOB_WAIT + r2.job.left + 30) { duty.tick(0.5); waited += 0.5; }
    order = { held, done, evJob: evs.some(e => e.type === 'ordered' && e.job === job) && evs.some(e => e.type === 'jobdone' && e.job === job), atjob: evs.filter(e => e.type === 'atjob' && e.job === job).length === 1, timeout: !r2 || waited >= D.JOB_WAIT };
    ck(order.held && order.done && order.evJob && order.atjob && order.timeout, 'ordered job clock waits for arrival ' + JSON.stringify(order)); }
  // pathing iteration 2: the sim waits for the body (holdBody), at most HOLD_MAX past its estimate; with `lifts` a lift trip ends with a walk
  // leg from the car on the new deck; a refusal carries the person (the body reacts on screen)
  const { HOLD_MAX } = await imp('js/sim.js'); let hold = null;
  { const decks = G.genShip(ship, seed), plan2 = G.shipPlan(ship, seed, decks), lifts = decks.map(x => x.exit), clock2 = new K.ShipClock({ seed }); clock2.assign(roster);
    const s2 = new CrewSim({ roster, clock: clock2, plan: plan2, data, seed, decks: ship.decks, lifts }); let who = null, heldPast = false, released = false, legs = 0, legOk = true, rideFloor = true; const inLift = new Set();
    for (let t = 0; t < 900; t += 0.5) {
      if (!who) { const s = [...s2.st.values()].find(q => q.transit && !q.transit.lift && q.transit.eta < 2); if (s) { who = { p: s.person, t0: t, eta: s.transit.eta }; s2.holdBody = (p, tr) => p === who.p && !tr.lift; } }
      s2.tick(0.5); clock2.advance(0.5);
      if (who && !who.done) { const tr = s2.st.get(who.p.id)?.transit; if (t - who.t0 > who.eta + 10 && tr) heldPast = true; if (!tr) { who.done = true; released = t - who.t0 <= who.eta + HOLD_MAX + 2; who.secs = +(t - who.t0).toFixed(1); s2.holdBody = null; } }
      for (const q of s2.st.values()) { const tr = q.transit; if (tr?.lift) { inLift.add(q.person.id); if (tr.eta < tr.ride - 1e-6) rideFloor = rideFloor && tr.boarded; } else if (inLift.has(q.person.id)) { inLift.delete(q.person.id); if (tr) { legs++; const L = lifts[q.deckNo - 1]; legOk = legOk && q.deckNo === tr.to.deckNo && q.tx === L[0] && q.ty === L[1] && s2.bodies(q.deckNo).get(q.person.id)?.walking === true; } } }
    }
    hold = { heldPast, released, secs: who?.secs, legs, legOk, rideFloor };
    ck(who && heldPast && released && legs > 0 && legOk && rideFloor, 'sim waits for the body and walks from the lift car ' + JSON.stringify(hold)); }
  // pathing iteration 3: sim.estimate (told to the player with an order): 0 where they are, a walk on the same deck, walk + ride + walk to another deck
  let est = null; { const decks = G.genShip(ship, seed), plan3 = G.shipPlan(ship, seed, decks), clock3 = new K.ShipClock({ seed }); clock3.assign(roster);
    const s3 = new CrewSim({ roster, clock: clock3, plan: plan3, data, seed, decks: ship.decks, lifts: decks.map(x => x.exit) }), q = [...s3.st.values()].find(x => !x.transit), p = q.person;
    const other = Object.keys(plan3).find(k => plan3[k].length && plan3[k].every(x => x.deckNo !== q.deckNo)), same = Object.keys(plan3).find(k => k !== q.room && plan3[k].some(x => x.deckNo === q.deckNo) && s3.site(p, k, q.deckNo, { room: k }).deckNo === q.deckNo);
    est = { here: s3.estimate(p, q.room), same: same ? +s3.estimate(p, same).toFixed(1) : null, other: other ? +s3.estimate(p, other).toFixed(1) : null };
    ck(est.here === 0 && (est.same == null || (est.same >= 3 && est.same <= WALK_MAX)) && (est.other == null || est.other > 3.5 + 1) && (est.same == null || est.other == null || est.other > est.same - WALK_MAX), 'sim.estimate ' + JSON.stringify(est)); }
  // pathing iteration 4: Duty.byDistance (the delegate menu lists subordinates nearest first, by sim.estimate; people already on a job last)
  let near = null; { const subs = duty.subs(), room = Object.keys(plan).find(k => plan[k].length > 0 && k !== 'quarters'), list = duty.byDistance(subs, room), free = list.filter(x => !duty.jobs.some(j => j.person === x.person)), etas = free.map(x => x.eta), busy = subs.find(q => !duty.jobs.some(j => j.person === q)) || subs[0];
    const fake = { person: busy, loop: { id: 'x', room }, left: 60 }; duty.jobs.push(fake); const list2 = duty.byDistance(subs, room); duty.jobs.splice(duty.jobs.indexOf(fake), 1);
    near = { n: list.length, room, onJob: list.length - free.length, busyAfter: list.slice(free.length).every(x => duty.jobs.some(j => j.person === x.person)), sorted: etas.every((v, i) => i === 0 || (etas[i - 1] ?? 1e9) <= (v ?? 1e9)), first: etas[0] != null ? +etas[0].toFixed(1) : null, last: etas.length ? +(etas[etas.length - 1] ?? -1).toFixed(1) : null, busyLast: list2[list2.length - 1]?.person === busy, noRoom: duty.byDistance(subs, null).map(x => x.person).join() === subs.join() };
    ck(near.n === subs.length && near.sorted && near.busyAfter && near.busyLast && near.noRoom, 'Duty.byDistance ' + JSON.stringify(near)); }
  let refusal = null; { const evs2 = []; duty.on(ev => evs2.push(ev)); for (const s of duty.subs()) for (let k = 0; k < 60 && !evs2.some(e => e.type === 'refused'); k++) { duty.t += 5; const r = duty.order(s, null); if (r.ok) duty.jobs.splice(duty.jobs.indexOf(r.job), 1); }
    const ev = evs2.find(e => e.type === 'refused'); refusal = ev ? !!ev.person && ev.person.short === ev.who : 'none'; ck(refusal !== false, 'a refusal carries the person'); }
  return { walkers, riders, maxEta: +maxEta.toFixed(1), order, hold, est, near, refusal };
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
    const follow = (p, secs, done, see = true) => { let e = body(p), last = e && [e.mesh.position.x, e.mesh.position.z], jump = 0, jumpAt = null, lost = false, n = 0, lastOpen = null, lastTile = null; for (; n < secs * 30; n++) { if (e && see) { P.x = e.x + 1.2; P.z = e.z; P.vx = P.vz = 0; const pt = w.tile(P.x, P.z); if (pt.join() === car.tx + ',' + car.ty || w.solid(pt[0], pt[1]) || Math.hypot(e.x - car.x, e.z - car.z) < 1.8) { P.x = car.x + car.dx * 3; P.z = car.z + car.dy * 3; } }   /* watching from outside the car (a player inside it holds the doors) */ tick(1); e = body(p); if (!e) { lost = true; break; } { const st = Math.hypot(e.mesh.position.x - last[0], e.mesh.position.z - last[1]); if (st > jump) { jump = st; if (st > 0.6) jumpAt = { t: +(n / 30).toFixed(2), from: last.map(v => +v.toFixed(2)), to: [+e.mesh.position.x.toFixed(2), +e.mesh.position.z.toFixed(2)], walk: e.walk ? (e.walk.vanish ? 'v' : 'w') : null, board: !!e.board, op: !!e.op, haul: !!e.haul, car: [+(car.x).toFixed(2), +(car.z).toFixed(2)] }; } } last = [e.mesh.position.x, e.mesh.position.z]; lastOpen = w.liftOpen; lastTile = tileOf(e); if (done(e)) break; } return { jump: +jump.toFixed(2), jumpAt, lost, secs: +(n / 30).toFixed(1), e, lastOpen, lastTile }; };
    // 1) another room on this deck: the body sets off at once and walks all the way, in sight, without a jump
    { const e = idle()[0], p = e.person, rm = d.rooms.find(r => r.type !== e.room && r.type !== 'jefferies' && G.plan[r.type]?.some(s => s.deckNo === here && s.tx >= r.x && s.tx < r.x + r.w && s.ty >= r.y && s.ty < r.y + r.h) && g.simTileFor(p, { room: r.type, spot: 'door', tx: r.x + (r.w >> 1), ty: r.y + (r.h >> 1) }));
      const site = G.plan[rm.type].find(s => s.deckNo === here && s.tx >= rm.x && s.tx < rm.x + rm.w && s.ty >= rm.y && s.ty < rm.y + rm.h);
      S.redirect(p, rm.type, 'door', 600, 'ordered', { prio: 2, site }); P.x = e.x + 1.2; P.z = e.z; tick(70); const started = !!e.walk?.opts.sim && !e.walk.vanish, listed = S.bodies(here).get(p.id)?.room === rm.type;
      const f = follow(p, 150, (b) => !b.walk), tl = f.e ? tileOf(f.e) : [0, 0]; out.room = { started, listed, jump: f.jump, lost: f.lost, secs: f.secs, inRoom: d.room[tl[1]]?.[tl[0]] === rm.type, inRect: tl[0] >= rm.x && tl[0] < rm.x + rm.w && tl[1] >= rm.y && tl[1] < rm.y + rm.h, key: !!f.e?.simKey }; S.release(p); }
    // 2) a room on another deck: walks into the lift car, stands there, and is only removed once the doors are shut
    { const e = idle()[0], p = e.person, other = Object.keys(G.plan).map(k => G.plan[k].find(s => s.deckNo !== here)).find(Boolean), type = Object.keys(G.plan).find(k => G.plan[k].includes(other));
      S.redirect(p, type, 'door', 600, 'ordered', { prio: 2, site: other }); P.x = e.x + 1.2; P.z = e.z; tick(70); const toLift = !!e.walk?.vanish || !!e.board;
      let boarded = false; const f = follow(p, 200, (b) => { boarded = boarded || !!b.board; return false; });
      out.leave = { toLift, boarded, jump: f.jump, ...(f.jumpAt ? { jumpAt: f.jumpAt } : {}), gone: f.lost, secs: f.secs, inCar: !!f.lastTile && f.lastTile[0] === car.tx && f.lastTile[1] === car.ty, doorsShut: f.lastOpen === false, where: S.where(p)?.deckNo }; if (f.lastOpen !== false) { const L = G.lift; out.leave.dbg = { shutT: L.shutT, boardN: L.boardN, boardW: L.boardW, npcT: L.npcT, closedT: L.closedT, inCar: g.inCarTile(), P: [+(P.x - car.x).toFixed(1), +(P.z - car.z).toFixed(1)], phase: G.phase, locked: !!G.fx?.liftLocked, door: g.ents.filter(q => q.simmed && !q.board && Math.abs(q.x - car.x) < 1.2 && Math.abs(q.z - car.z) < 1.2).map(q => [q.person.short, !!q.walk, q.walk?.vanish, q.room]) }; }
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
    // 4b) red-alert lockdown: the same door seals; a walker keys it with their codes (~1 s, no forced 10 s window), gets through, and it reseals behind them
    { const dr = (w.doors || []).map(o => { const a = o.f.ax ? [1, 0] : [0, 1], A = w.tile(o.f.x - a[0] * 1.5, o.f.z - a[1] * 1.5), B = w.tile(o.f.x + a[0] * 1.5, o.f.z + a[1] * 1.5); return { o, A, B }; }).find(q => d.grid[q.A[1]]?.[q.A[0]] === 0 && d.grid[q.B[1]]?.[q.B[0]] === 0 && (q.A[0] !== q.B[0] || q.A[1] !== q.B[1]) && g.pathField(q.B[0], q.B[1])[q.A[0] + q.A[1] * w.W] === 1);
      const e = idle()[0], AL = G.comms?.alerts; out.lock = { door: !!dr && !!AL };
      if (dr && e && AL) { tick(30); const [ax, az] = w.center(dr.A[0], dr.A[1]); e.x = ax; e.z = az; e.mesh.position.set(ax, 0, az); P.x = ax + 30; P.z = az; AL.raise('red', { source: 'test', reason: 'lockdown test' }); G.stationT = 1e9;   /* hold the stations call off: this walker is ours */ dr.o.pried = 0;   /* case 4 may have forced this door: drop its open window */
        for (let i = 0; i < 30; i++) tick(1); const mode = w.doorLock, shut = dr.o.open < 0.5;
        g.startWalk(e, dr.B[0], dr.B[1], false); let keyed = false, pried = false, n = 0; for (; n < 30 * 30 && e.walk; n++) { tick(1); keyed = keyed || dr.o.keyed > 0; pried = pried || dr.o.pried > 0; } const tl = tileOf(e), arrived = !e.walk;   // read as the walk ends: during the 4 s below the sim may already send the body on (seed 18: a new walk by then, read as 'not through')
        for (let i = 0; i < 4 * 30; i++) tick(1); const resealed = dr.o.open < 0.2;
        out.lock = { door: true, mode, shut, keyed, pried, resealed, secs: +(n / 30).toFixed(1), through: arrived && tl[0] === dr.B[0] && tl[1] === dr.B[1] }; AL.clear('red'); G.stationT = 0; tick(2); } }
    // 5) room instance + friends: the tile is inside the instance the sim chose; a friend already there draws you to the same furniture
    { const types = [...new Set(d.rooms.map(r => r.type))], multi = types.map(tp => d.rooms.filter(r => r.type === tp && G.plan[tp]?.some(s => s.deckNo === here && s.tx >= r.x && s.tx < r.x + r.w && s.ty >= r.y && s.ty < r.y + r.h))).find(l => l.length >= 2);
      const inRect = (t, r) => !!t && t[0] >= r.x && t[0] < r.x + r.w && t[1] >= r.y && t[1] < r.y + r.h, p0 = g.roster.people.find(p => !p.isPlayer);
      out.inst = multi ? multi.map(r => inRect(g.simTileFor(p0, { room: r.type, spot: 'door', tx: r.x + (r.w >> 1), ty: r.y + (r.h >> 1) }), r)) : null;
      const { propsFor } = await import("./js/equipment.js"); const SO = g.social, pair = g.roster.people.filter(p => !p.isPlayer && !body(p)).map(p => [p, g.roster.people[SO.seekTargets(p)[0]?.id]]).find(([a, b]) => b && !b.isPlayer && !body(b));
      const spots = ['table', 'bar', 'sofa', 'console', 'desk', 'bunk'], rm = d.rooms.map(r => ({ r, spot: spots.find(sp => d.props.filter(q => propsFor(sp).includes(q.kind) && d.room[q.ty]?.[q.tx] === r.type && inRect([q.tx, q.ty], r)).length >= 2) })).find(x => x.spot);
      if (pair && rm) { const [a, b] = pair, o = { room: rm.r.type, spot: rm.spot, tx: rm.r.x + (rm.r.w >> 1), ty: rm.r.y + (rm.r.h >> 1), free: true }, tb = g.simTileFor(b, o), [bx, bz] = w.center(tb[0], tb[1]);
        const fake = { kind: 'crew', simmed: true, person: b, room: o.room, spot: o.spot, x: bx, z: bz, simProp: tb.prop, mesh: null }; g.ents.push(fake); const ta = g.simTileFor(a, o); g.ents.splice(g.ents.indexOf(fake), 1);
        const alone = g.simTileFor(a, { ...o, free: false });
        const room = tb.prop ? [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const x = tb.prop.tx + dx, y = tb.prop.ty + dy; return (x !== tb[0] || y !== tb[1]) && d.grid[y]?.[x] === 0 && !w.isTube(x, y) && d.room[y][x] === o.room && inRect([x, y], rm.r) && !g.ents.some(q => { if (!q.simmed || q.board || q.walk?.vanish) return false; const [qx, qy] = q.walk && !q.walk.opts.point ? [q.walk.tx, q.walk.ty] : w.tile(q.x, q.z); return qx === x && qy === y; }); }) : false;   // another free tile at the friend's furniture
        out.friends = { prop: !!tb.prop, room, same: !!ta && ta.prop === tb.prop, apart: ta[0] !== tb[0] || ta[1] !== tb[1], inRect: inRect(ta, rm.r), alone: !!alone }; } }
    // 6) pathing iteration 1 (docs/pathing.md): an ordered job sends the body to the job room (sim prio 2 'ordered', walking), the job's
    //    clock waits for arrival (Duty.atJob) and the override is released when the job is done
    { const D = g.duty, e = idle()[0], p = e?.person, rm = e && d.rooms.find(r => r.type !== e.room && r.type !== 'jefferies' && r.type !== d.room[car.ty]?.[car.tx] && G.plan[r.type]?.length && S.site(e.person, r.type, here).deckNo === here);   // the instance the sim will pick is on this deck
      if (D && rm) { const job = { person: p, loop: { id: 'test', label: 'Test job', room: rm.type, spot: 'door', q: { proper: [1, 0] } }, q: 'proper', left: 2 }; D.jobs.push(job); D.emit({ type: 'ordered', who: p.short, label: 'Test job', job });
        const t0 = tileOf(e), from = d.room[t0[1]]?.[t0[0]], ov = S.overrideOf(p), ord = ov?.prio === 2 && ov.activity === 'ordered' && ov.room === rm.type; let walked = false, heldAway = true, n = 0, ran = false, at = null;
        for (; n < 90 * 30 && D.jobs.includes(job); n++) { tick(1); const b = body(p); if (b?.walk) walked = true; if (b?.walk && job.left < 2) heldAway = false; if (!b && job.left < 2) heldAway = false; if (b && !b.walk && job.left < 2 && !ran) { ran = true; at = tileOf(b); } }
        const tl = at || [0, 0]; out.order = { from, to: rm.type, ord, walked, heldAway, ran, done: !D.jobs.includes(job), inRoom: d.room[tl[1]]?.[tl[0]] === rm.type, released: S.overrideAt(p, 2)?.activity !== 'ordered', secs: +(n / 30).toFixed(1) }; } }
    // 7) nobody is given the lift car (its tile can belong to the room it opens into) or the tile at its doors as their spot
    { const mouth = [car.tx + car.dx, car.ty + car.dy], types = [...new Set([d.room[car.ty]?.[car.tx], d.room[mouth[1]]?.[mouth[0]], ...d.rooms.map(r => r.type)].filter(Boolean))]; let bad = 0, n = 0;
      for (const tp of types) for (const p of g.roster.people.slice(0, 25)) { for (const sp of ['door', 'table', 'console', 'corridor']) { const t = g.simTileFor(p, { room: tp, spot: sp }); if (!t) continue; n++; if ((t[0] === car.tx && t[1] === car.ty) || (t[0] === mouth[0] && t[1] === mouth[1])) bad++; } }
      out.keepClear = { n, bad, carRoom: d.room[car.ty]?.[car.tx] || null, mouthRoom: d.room[mouth[1]]?.[mouth[0]] || null }; }
    // 8) four people leave by lift at once while the player stands at the open car: they stand apart in the car, the doors still cycle (nobody waits > 10 s), never shut on a walker
    { const other = Object.keys(G.plan).map(k => G.plan[k].find(s => s.deckNo !== here)).find(Boolean), type = Object.keys(G.plan).find(k => G.plan[k].includes(other)), ppl = idle().slice(0, 4).map(e => e.person);
      for (const p of ppl) S.redirect(p, type, 'door', 600, 'ordered', { prio: 2, site: other }); let minGap = 9, maxWait = 0, boarded = new Set(), gone = 0; const wait = new Map();
      for (let n = 0; n < 75 * 30 && gone < ppl.length; n++) { P.x = car.x + car.dx * 3.2; P.z = car.z + car.dy * 3.2; P.vx = P.vz = 0; tick(1); const B = g.ents.filter(e => e.board && e.simmed);
        for (const e of B) { boarded.add(e.person); wait.set(e.person, (wait.get(e.person) || 0) + 1 / 30); maxWait = Math.max(maxWait, wait.get(e.person)); if (!e.walk) for (const q of B) if (q !== e && !q.walk) minGap = Math.min(minGap, Math.hypot(q.x - e.x, q.z - e.z)); }
        gone = ppl.filter(p => !body(p)).length; }
      out.carCycle = { n: ppl.length, boarded: boarded.size, gone, minGap: +minGap.toFixed(2), maxWait: +maxWait.toFixed(1) }; for (const p of ppl) S.release(p); }
    // 9) pathing iteration 2: lift walkers wait beside the doors (both sides, apart, on open floor, outside the car), and wait there while someone steps out;
    //    a refused order shows on the body (head shake)
    { const W = g.liftWaitSpots(), apart = W.every((a, i) => W.every((b, j) => i === j || Math.hypot(a[0] - b[0], a[1] - b[1]) >= 0.6)), floor = W.every(([x, z]) => { const q = { x, z, y: 0 }; w.resolve(q, 0.28); return Math.hypot(q.x - x, q.z - z) < 0.05 && Math.hypot(x - car.x, z - car.z) > 1.6; });
      const sides = new Set(W.map(([x, z]) => Math.sign(Math.round(((x - car.x) * -car.dy + (z - car.z) * car.dx) * 10)))).size;
      const ppl = idle().slice(0, 2), [a, b] = ppl; let waited = null, minD = 9;
      if (a && b && W.length) { waited = false; const [mx, mz] = [car.x + car.dx * 3.4, car.z + car.dy * 3.4]; a.x = car.x; a.z = car.z; a.mesh.position.set(a.x, 0, a.z); b.x = mx; b.z = mz; b.mesh.position.set(mx, 0, mz); w.setLiftOpen(true);
        const t0 = d.rooms.find(r => r.type !== 'jefferies' && G.plan[r.type]?.length), [rx, ry] = [t0.x + (t0.w >> 1), t0.y + (t0.h >> 1)]; a.fromCar = G.time; g.startWalk(a, rx, ry, false); a.pauseT = 1.5; g.startWalk(b, car.tx, car.ty, true);
        P.x = car.x + car.dx * 6 + car.dy * 2; P.z = car.z + car.dy * 6 - car.dx * 2; for (let n = 0; n < 45; n++) { tick(1); if (b.liftWait != null) waited = true; if (a.walk && Math.hypot(a.x - car.x, a.z - car.z) < 2.3) minD = Math.min(minD, Math.hypot(a.x - b.x, a.z - b.z)); }
        a.walk = null; b.walk = null; b.liftWait = null; g.simBodies(0, true); }
      const e = idle().find(q => Math.hypot(q.x - P.x, q.z - P.z) < 12 && w.los(P.x, P.z, q.x, q.z)) || idle()[0]; if (e) { P.x = e.x + 1.5; P.z = e.z; if (w.solidAt(P.x, P.z)) P.x = e.x - 1.5; if (e.fid) e.fid.cur = null; g.refuseReact(e.person, `${e.person.short}: "No."`); }
      out.liftWait = { spots: W.length, apart, floor, sides, waited, minD: +minD.toFixed(2), shake: e ? e.fid?.cur?.id || null : 'none' }; }
    // 10) pathing iteration 3: the player watches the open car while up to 7 people leave and one arrives: the doors never shut on an empty car
    //     while someone walks up to it (the arrival comes when they have boarded), a full car takes nobody from beyond its doorway (8 spots since iteration 5, 9 at most), nobody waits > 10 s in it
    { const other = Object.keys(G.plan).map(k => G.plan[k].find(s => s.deckNo !== here)).find(Boolean), type = Object.keys(G.plan).find(k => G.plan[k].includes(other)), ppl = idle().slice(0, 7).map(e => e.person);
      const away = [...S.st.values()].find(q => q.deckNo !== here && !q.transit && !q.person.isPlayer && !S.overridden(q.person))?.person, rm = d.rooms.find(r => r.type !== 'jefferies' && G.plan[r.type]?.some(s => s.deckNo === here));
      if (away && rm) S.redirect(away, rm.type, 'door', 600, 'ordered', { prio: 2, site: G.plan[rm.type].find(s => s.deckNo === here) });
      for (const p of ppl) S.redirect(p, type, 'door', 600, 'ordered', { prio: 2, site: other }); let emptyShut = 0, shuts = 0, maxBoard = 0, maxWait = 0, arrived = false, gone = 0, open0 = w.liftOpen; const wait = new Map();
      for (let n = 0; n < 120 * 30 && (gone < ppl.length || !arrived); n++) { P.x = car.x + car.dx * 3.2; P.z = car.z + car.dy * 3.2; P.vx = P.vz = 0; const bn = G.lift.boardN || 0; tick(1);
        if (open0 && !w.liftOpen) { shuts++; if (!bn && g.ents.some(q => q.walk?.vanish && !q.board && Math.hypot(q.x - car.x, q.z - car.z) < 4.5)) emptyShut++; } open0 = w.liftOpen;
        const B = g.ents.filter(e => e.board && e.simmed); maxBoard = Math.max(maxBoard, B.length); for (const e of B) { wait.set(e.person, (wait.get(e.person) || 0) + 1 / 30); maxWait = Math.max(maxWait, wait.get(e.person)); }
        gone = ppl.filter(p => !body(p)).length; if (away && body(away)) arrived = true; }
      out.oneWindow = { n: ppl.length, gone, arrived: away ? arrived : null, shuts, emptyShut, maxBoard, maxWait: +maxWait.toFixed(1) }; for (const p of ppl) S.release(p); if (away) S.release(away); }
    // 11) a full room (iteration 3: 17 crew at a 12-tile mess all stood on one spot): more people than tiles share the least crowded tiles, apart
    { const rm = d.rooms.filter(r => r.type !== 'jefferies' && r.w * r.h <= 20).sort((a, b) => a.w * a.h - b.w * b.h)[0], fakes = [], pos = [];
      if (rm) { const ppl = g.roster.people.filter(p => !p.isPlayer && !body(p)).slice(0, rm.w * rm.h + 6);
        for (const p of ppl) { const t = g.simTileFor(p, { room: rm.type, spot: 'corridor', tx: rm.x, ty: rm.y }); if (!t) continue; const [cx, cz] = w.center(t[0], t[1]), x = cx + (t.off?.[0] || 0), z = cz + (t.off?.[1] || 0); pos.push([x, z]); const f = { kind: 'crew', simmed: true, person: p, room: rm.type, x, z, mesh: null }; fakes.push(f); g.ents.push(f); }
        for (const f of fakes) g.ents.splice(g.ents.indexOf(f), 1); let minD = 9; for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) minD = Math.min(minD, Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1]));
        out.fullRoom = { room: rm.type, tiles: rm.w * rm.h, n: pos.length, minD: +minD.toFixed(2) }; } }
    // 12) pathing iteration 4: a crowd leaving by lift while the player stands in the open car without using its panel: once the player has held
    //     the car 5 s the boarders step back out ("We'll take the next one."), everyone waits beside the doors or in the line further back (apart,
    //     nobody left in the car), and once the player steps out they all board and go, nobody > 10 s in the car
    //     (parts 2, 8 and 10 send people off this deck: with fewer than 8 idle bodies left it moves to the deck with the most people, so the check always has a crowd)
    const toBusiest = () => { const cnt = G.shipDecks.map((_, i) => S.onDeck(i + 1).filter(o => !S.overridden(o.person)).length), best = cnt.indexOf(Math.max(...cnt)); if (best !== G.shipDeck) { g.loadDeck(best + 1); tick(5); g.simBodies(0, true); if (g.haul) g.haul.t = 1e9; } };   /* no cart jobs, as at the start (a deck load restarts the haul timer) */
    if (idle().length < 8) { toBusiest(); out.deck12 = { deck: G.shipDeck + 1, idle: idle().length }; }
    { const w = g.world, car = w.car, here = G.shipDeck + 1, other = Object.keys(G.plan).map(k => G.plan[k].find(s => s.deckNo !== here)).find(Boolean), type = Object.keys(G.plan).find(k => G.plan[k].includes(other)), ppl = idle().slice(0, 10).map(e => e.person), L = G.lift, nd = g.liftWaitSpots().length;
      const said = []; const say0 = G.say; G.say = (m, c) => { said.push(String(m)); return say0(m, c); };
      for (const p of ppl) S.redirect(p, type, 'door', 600, 'ordered', { prio: 2, site: other }); let boarded = false, n = 0;
      for (; n < 60 * 30 && !boarded; n++) { P.x = car.x + car.dx * 3.2; P.z = car.z + car.dy * 3.2; P.vx = P.vz = 0; tick(1); boarded = g.ents.some(e => e.board && e.simmed); }
      let inCar = 0, minGap = 9, line = 0, waitN = 0, loose = 0, held = false, gapAt = null; const carLog = []; for (let k = 0; k < 25 * 30; k++) { P.x = car.x - car.dx * 0.55; P.z = car.z - car.dy * 0.55; P.vx = P.vz = 0; L.armed = false; tick(1); held = held || !!L.held;
        if (k > 9 * 30) { const inC = g.ents.filter(e => e.simmed && (e.board || (w.tile(e.x, e.z).join() === car.tx + ',' + car.ty))); inCar = Math.max(inCar, inC.length);
          if (inC.length && carLog.length < 12) carLog.push([+(k / 30).toFixed(2), w.liftOpen ? 'O' : 'c', !!L.held, +(L.shutT || 0).toFixed(1), L.boardN || 0, ...inC.map(e => [e.person.short, e.board ? 'board' : '', e.walk ? (e.walk.vanish ? 'v' : e.walk.opts.point ? 'pt' : 'w') : 'idle', e.liftWait ?? null, e.liftGo ? 'go' : '', e.fromCar ? +(G.time - e.fromCar).toFixed(1) : null, +Math.hypot(e.x - car.x, e.z - car.z).toFixed(2), e.ghost > 0 ? 'ghost' : '', e.boardSlot ?? null].join(':'))]);   /* who is in the car tile while the player holds it (the 'held' flake hunt) */ const Wt = g.ents.filter(e => e.simmed && e.walk?.vanish && !e.board && (e.v || 0) < 0.05 && Math.hypot(e.x - car.x, e.z - car.z) < 9); waitN = Math.max(waitN, Wt.length); line = Math.max(line, Wt.filter(e => e.liftWait >= nd).length); loose = Math.max(loose, Wt.filter(e => e.liftWait == null).length);
          for (let i = 0; i < Wt.length; i++) for (let j = i + 1; j < Wt.length; j++) { const gp = Math.hypot(Wt[i].x - Wt[j].x, Wt[i].z - Wt[j].z); if (gp < minGap) { minGap = gp; if (gp < 0.45) gapAt = [+(k / 30).toFixed(2), ...[Wt[i], Wt[j]].map(e => [e.person.short, e.liftWait, e.liftGo ? 'go' : '', +e.x.toFixed(2), +e.z.toFixed(2), +Math.hypot(e.x - car.x, e.z - car.z).toFixed(2), e.ghost > 0 ? 'ghost' : ''].join(':'))]; } } } }
      let maxWait = 0, gone = 0; const wait = new Map(); P.x = car.x + car.dx * 12; P.z = car.z + car.dy * 12; { const q = { x: P.x, z: P.z, y: 0 }; w.resolve(q, 0.3); P.x = q.x; P.z = q.z; }
      for (let k = 0; k < 150 * 30 && gone < ppl.length; k++) { P.vx = P.vz = 0; tick(1); for (const e of g.ents.filter(e => e.board && e.simmed)) { wait.set(e.person, (wait.get(e.person) || 0) + 1 / 30); maxWait = Math.max(maxWait, wait.get(e.person)); } gone = ppl.filter(p => !body(p)).length; }
      G.say = say0; out.liftHeld = { n: ppl.length, nd, line: g.liftQueueSpots().length, boarded, held, stepOut: said.some(t => /next one/.test(t)), inCar, waitN, inLine: line, loose, minGap: +minGap.toFixed(2), gone, maxWait: +maxWait.toFixed(1), ...(carLog.length ? { carLog } : {}), ...(gapAt ? { gapAt } : {}) }; for (const p of ppl) S.release(p); }
    // 13) pathing iteration 4: red alert sends the crew who are off their post to their station (first block of their day, sim priority 3); cleared = released
    { const A = g.alerts; if (A) { A.raise('red', { source: 'debug', reason: 'test' }); tick(12 * 30); const sent = g.roster.people.filter(p => S.overrideOf(p)?.activity === 'stations'), ok = sent.every(p => S.overrideOf(p).room === S.data.billets[p.billet].day[0][2] && S.overrideOf(p).prio === 3);
      const mine = sent.filter(p => body(p)), moving = mine.filter(p => body(p).walk?.opts.sim).length; A.clear('red'); tick(3 * 30); out.stations = { sent: sent.length, ok, here: mine.length, moving, left: g.roster.people.filter(p => S.overrideOf(p)?.activity === 'stations').length }; } }
    // 14) pathing iteration 5: red alert vs player orders: someone already carrying an accepted order keeps walking to the job (no stations call);
    //     an order given during the alert takes the person off their station; once the job is done the stations call picks them up
    { const A = g.alerts, D = g.duty, lp = D?.loops.find(l => G.plan?.[l.room]?.length), give = (p) => D.delegate(p, lp.id), st0 = lp?.state;   // delegation: any crew member (the test billet may have no reports)
      if (A && D && lp) { const subs = g.roster.people.filter(p => !p.isPlayer && S.st.has(p.id) && !S.overridden(p) && !D.jobs.some(j => j.person === p)).slice(0, 12); let a = null, b = null;
      for (const p of subs) { if (a) break; for (let k = 0; k < 40 && !a; k++) { D.t += 5; const r = give(p); if (r?.ok && S.overrideOf(p)?.activity === 'ordered') a = p; } }
      if (a) { A.raise('red', { source: 'debug', reason: 'test' }); tick(12 * 30); const keep = S.overrideOf(a)?.activity === 'ordered' && !G.stations?.sent.has(a);
        b = g.roster.people.find(p => p !== a && S.overrideOf(p)?.activity === 'stations'); let taken = null;
        if (b) for (let k = 0; k < 40 && taken == null; k++) { D.t += 5; const r = give(b); if (r?.ok) taken = S.overrideOf(b)?.activity === 'ordered' && !G.stations?.sent.has(b); }
        for (const j of D.jobs.slice()) if (j.person === a) D.jobs.splice(D.jobs.indexOf(j), 1); S.release(a, 2); tick(10 * 30); const after = S.overrideOf(a)?.activity;
        A.clear('red'); tick(3 * 30); for (const p of [a, b]) if (p) { for (const j of D.jobs.slice()) if (j.person === p) D.jobs.splice(D.jobs.indexOf(j), 1); S.release(p, 2); } lp.state = st0;
        out.alertOrders = { a: !!a, keep, b: !!b, taken, after, left: g.roster.people.filter(p => S.overrideOf(p)?.activity === 'stations').length }; } } }
    // bodies vs sim: never on an empty deck (parts 12-14 send people away; with fewer than 3 bodies left it moves to the busiest deck and lets the crew walk 10 s first, so the check sees arrivals / departures,
    // then up to 30 s more until 3 are there: arrivals come out of the car only once the people walking up to it have boarded and its doors have shut (seed 24: 3 walking up, 7 still to arrive after 10 s))
    { const nb = () => g.ents.filter(e => e.simmed && !e.board && !e.walk?.vanish).length, n0 = nb(); if (n0 < 3) { toBusiest(); tick(10 * 30); let k = 0; for (; k < 30 * 30 && nb() < 3; k++) tick(1); out.bodiesMoved = { from: n0, deck: G.shipDeck + 1, waited: +(10 + k / 30).toFixed(1) }; } }
    { const B = S.bodies(G.shipDeck + 1), es = g.ents.filter(e => e.simmed && !e.board && !e.walk?.vanish); out.bodies = { n: es.length, sim: B.size };
      const extra = es.filter(e => !B.has(e.person.id)); if (extra.length) out.bodies.extra = extra.map(e => { const st = S.st.get(e.person.id); return [e.person.short, st?.deckNo, st?.room, st?.transit ? (st.transit.lift ? 'lift>' + st.transit.to.deckNo : 'walk') : '', S.overrideOf(e.person)?.activity || '', e.walk ? (e.walk.opts.sim || 'walk') : '', e.simKey || '', e.haul ? 'haul' : '', e.op ? 'op' : '', e.cower ? 'cower' : '', e.fromCar ? 'fromCar' : ''].join(':'); }); }
    return out;
  });
  console.log('npc walking:', JSON.stringify(r));
  const R = r.room, L = r.leave, A = r.arrive, S = r.seal, F = r.friends;
  if (!(R && R.started && R.listed && !R.lost && R.jump < 0.6 && R.inRoom && R.inRect && R.key)) fail('npc walk to another room ' + JSON.stringify(R));
  if (!(L && L.toLift && L.boarded && L.gone && L.inCar && L.doorsShut && L.jump < 0.6 && L.where !== undefined)) fail('npc boards the lift ' + JSON.stringify(L));
  if (!(A && A.appeared && A.inCar && A.shutAtSpawn && !A.lost && A.jump < 0.6 && A.inRoom)) fail('npc arrives by lift ' + JSON.stringify(A));
  if (!(S && (!S.door || (S.shut && S.pried && S.through)))) fail('npc at a sealed door ' + JSON.stringify(S));
  { const K = r.lock; if (!(K && (!K.door || (K.mode === 'alert' && K.shut && K.keyed && !K.pried && K.through && K.resealed)))) fail('npc at a red-alert lockdown door ' + JSON.stringify(K)); }
  if (r.inst && !r.inst.every(Boolean)) fail('npc room instance ' + JSON.stringify(r.inst));
  if (F && !(F.inRect && F.apart && (!F.prop || !F.room || F.same))) fail('npc sits with friends ' + JSON.stringify(F));
  const O = r.order; if (O && !(O.ord && (O.walked || O.from === O.to) && O.heldAway && O.ran && O.done && O.inRoom && O.released)) fail('npc ordered job walks to the job room ' + JSON.stringify(O));
  if (!(r.keepClear && r.keepClear.n > 0 && r.keepClear.bad === 0)) fail('npc spots keep the lift car clear ' + JSON.stringify(r.keepClear));
  const CC = r.carCycle; if (!(CC && CC.boarded >= Math.min(2, CC.n) && CC.gone === CC.n && CC.minGap >= 0.4 && CC.maxWait < 10)) fail('npc lift boarders spread out and the car cycles ' + JSON.stringify(CC));
  const LW = r.liftWait; if (!(LW && LW.spots >= 2 && LW.apart && LW.floor && LW.sides === 2 && LW.waited !== false && LW.minD > 0.45 && (LW.shake === 'shake_head' || LW.shake === 'none'))) fail('npc lift waiting spots / refusal shake ' + JSON.stringify(LW));
  const OW = r.oneWindow; if (!(OW && OW.gone === OW.n && OW.arrived !== false && OW.emptyShut === 0 && OW.maxBoard <= 9 && OW.maxWait < 10)) fail('npc lift: board and arrive in one cycle while watched, full car ' + JSON.stringify(OW));
  const FR = r.fullRoom; if (FR && !(FR.n > 0 && FR.minD >= 0.4)) fail('npc full room: people spread over the tiles ' + JSON.stringify(FR));
  const LH = r.liftHeld; if (!(LH && LH.held && (!LH.boarded || LH.stepOut) && LH.inCar === 0 && LH.minGap >= 0.45 && LH.gone === LH.n && LH.maxWait < 10 && (LH.waitN <= LH.nd || LH.inLine > 0 || LH.line === 0))) fail('npc lift: held by the player in the car, crowd waits beside the doors and in a line, then boards ' + JSON.stringify(LH));
  const ST = r.stations; if (ST && !(ST.sent > 0 && ST.ok && ST.left === 0)) fail('npc red alert: crew go to their stations, released on clear ' + JSON.stringify(ST));
  const AO = r.alertOrders; if (AO && !(AO.keep && (AO.taken == null || AO.taken) && AO.after === 'stations' && AO.left === 0)) fail('npc red alert: ordered crew finish the order, an order takes someone off station, back to station after ' + JSON.stringify(AO));
  if (!(r.bodies.n >= 3 && r.bodies.n <= r.bodies.sim)) fail('npc bodies vs sim (at least 3 bodies, none the sim does not list) ' + JSON.stringify({ ...r.bodies, ...(r.bodiesMoved ? { moved: r.bodiesMoved } : {}) }));
  return r;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) { const errs = []; const r = await walkTests(m => errs.push(m)); console.log(errs.length ? [...new Set(errs)].join('\n') : 'walk OK ' + JSON.stringify(r)); process.exit(errs.length ? 1 : 0); }
