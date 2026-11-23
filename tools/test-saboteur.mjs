// Node unit tests: the physical saboteur (js/saboteur.js + phases + combat consequence hooks) and hiding spots (js/hiding.js).  node tools/test-saboteur.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
export async function saboteurTests(fail) {
  const ck = (c, m) => { if (!c) fail('saboteur: ' + m); return !!c; }, out = {};
  // ---- hiding spots (js/hiding.js)
  const H = await imp('js/hiding.js');
  ck(H.hideClass('suitrack') === 'prop' && H.hideClass('locker') === 'locker' && H.hideClass('dclocker') === 'locker' && H.hideClass('ventgrille') === 'vent' && H.hideClass('console') === null, 'hide classes');
  ck(H.hideRadius('prop') === 1.8 && H.hideRadius('prop', true) === 1 && H.hideRadius('locker') < H.hideRadius('prop') && H.hideRadius('vent') < H.hideRadius('locker') && H.hideRadius('vent', true) < H.hideRadius('vent'), 'radii tighten prop > locker > vent, ghost shrinks');
  { const sites = [{ x: 0, z: -1.2, nx: 0, nz: 1, kind: 'locker' }, { x: 5, z: 0, nx: -1, nz: 0, kind: 'ventgrille' }, { x: 0, z: 1.2, nx: 0, nz: -1, kind: 'locker' }];
    const s = H.nearestHideSite(sites, { x: 0, z: 0, yaw: 0 });   // yaw 0 faces -z
    ck(s === sites[0], 'nearest site is the one in front, not behind'); ck(H.nearestHideSite(sites, { x: 0, z: 0, yaw: Math.PI / 2 }) === null, 'nothing in front within reach');
    const st = H.hideState(s); ck(st.cls === 'locker' && st.eye === 1.5 && st.r === 1.2 && Math.abs(Math.sin(st.yaw) - 0) < 1e-9 && Math.cos(st.yaw) === 1 && st.from.z === -1, 'locker state: eye, radius, faces the wall, exit in front');
    const vs = H.hideState(sites[1], true); ck(vs.cls === 'vent' && vs.eye < 0.7 && vs.r < 0.5, 'vent: lie flat, tiny radius with Silent Running'); const ps = H.hideState({ tx: 1, ty: 2, kind: 'drawers' }); ck(ps.cls === 'prop' && ps.x === undefined && ps.r === 1.8, 'prop hide keeps the old behaviour'); }
  // ---- the saboteur
  const { SHIPS } = await imp('js/ships.js'), C = await imp('js/crew.js'), K = await imp('js/clock.js'), { CrewSim } = await imp('js/sim.js'), G = await imp('js/gen.js');
  const R = await imp('js/repair.js'), PH = await imp('js/phases.js'), A = await imp('js/alerts.js'), PC = await imp('js/pace.js'), D = await imp('js/duty.js'), SAB = await imp('js/saboteur.js'), CB = await imp('js/combat.js');
  const comms = JSON.parse(readFileSync(join(ROOT, 'assets/data/comms.json'), 'utf8')), duties = JSON.parse(readFileSync(join(ROOT, 'assets/data/duties.json'), 'utf8'));
  const world = (seed) => {
    const ship = SHIPS[seed % SHIPS.length], roster = C.makeComplement(ship, seed), clock = new K.ShipClock({ seed }), pace = PC.PACES.standard; clock.assign(roster); clock.setPace(pace.T);
    const decks = G.genShip(ship, seed), plan = G.shipPlan(ship, seed, decks), sim = new CrewSim({ roster, clock, plan, data: comms, seed, decks: ship.decks });
    const player = D.pickBillet(roster, seed); player.isPlayer = true; sim.setPlayer(player);
    const ss = new C.ShipState(ship, seed); ss.auto = false; for (const s of C.SYSTEMS) ss.repair(s.id); ss.paceT = pace.T;
    const duty = new D.Duty({ player, roster, clock, sim, duties, shipState: ss, seed, mission: 'quiet_watch', pace }), alerts = new A.AlertState();
    const phases = new PH.Phases({ shipState: ss, alerts, roster, duty, seed, pace }); const evs = []; phases.on(e => evs.push(e));
    phases.mode = 'sabotage'; phases.index = 2; phases.pickSaboteur();
    const sites = new R.RepairCrew({ roster, sim, shipState: ss, clock, duties, decks, ship, seed, pace }).sites, said = [];
    const sab = new SAB.Saboteur({ phases, sim, shipState: ss, sites, duty, say: (t) => said.push(t), seed, pace, seen: () => false, bodyState: () => null, playerDeck: () => 1 });
    const run = (secs, dt = 0.5, each = null) => { for (let t = 0; t < secs; t += dt) { sim.tick(dt); clock.advance(dt); sab.tick(dt); each?.(t); } };
    return { ship, roster, sim, ss, duty, phases, alerts, sab, run, evs, said, sites, player };
  };
  let tamper = 0, exposedBadge = 0, withSeen = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const w = world(seed); if (!ck(w.phases.saboteur, `seed ${seed}: a culprit was picked`)) continue;
    const states = new Set(), person = w.phases.saboteur; let sawJob = false;
    w.run(240, 0.5, () => { states.add(w.sab.state); const ov = w.sim.overrideOf(person); if (ov?.activity === 'tampering' && w.sab.jobOf(person)) sawJob = true; });
    ck(w.phases.physical, 'phases.physical set so pulse() leaves the badge log to the module');
    if (states.has('tamper')) { tamper++; ck(sawJob && states.has('travel'), `seed ${seed}: travelled under a 'tampering' sim override with a covert job`); }
    const badge = w.evs.find(e => e.type === 'sabotage' && e.badge); if (badge) { exposedBadge++; ck(badge.who === person.short && badge.deck >= 1 && w.phases.saboteurExposed === 'badge' && w.sab.stats.tampers >= 1, 'badge log names the culprit after a real tamper'); ck(w.evs.some(e => e.type === 'pulse'), 'tamper did damage'); }
    ck(w.duty.chain.some(c => /badge log names/.test(c)) && w.duty.stats.sabotageSeen >= 1, `seed ${seed}: duty chain records the exposure`);
  }
  ck(tamper >= 5 && exposedBadge >= 5, `culprits actually tamper (${tamper}/6 reached tamper, ${exposedBadge}/6 named by the badge log)`); out.tamper = tamper;
  // seen at the panel: the player watching the dwell exposes them before the badge log
  { const w = world(2); w.sab.seen = (p) => w.sab.state === 'tamper'; let seenAt = null; w.run(240, 0.5, () => { if (seenAt == null && w.phases.saboteurExposed === 'seen') seenAt = w.sab.state; });
    withSeen = seenAt; ck(seenAt === 'tamper', `watching the tamper exposes them in the act (${seenAt})`); ck(w.said.some(t => /tampering/.test(t)) && w.duty.chain.some(c => /caught/.test(c)), 'player told + chain entry');
    ck(w.sab.stats.seen === 1, 'seen counted once'); }
  // a player who is not watching is not told early: no exposure until the badge log
  { const w = world(3); let early = false; w.run(240, 0.5, () => { if (w.phases.saboteurExposed === 'seen') early = true; }); ck(!early, 'unwatched tamper is never "seen"'); }
  // combat: before exposure a grab on the culprit is a plain assault; after, it is "subdue the saboteur" and clears the sabotage
  { const w = world(4), v = w.phases.saboteur, wit = w.roster.people.find(p => p !== v && !p.isPlayer && p.status !== 'dead');
    const ev = { act: 'restrain', victim: v, witnesses: [{ person: wit, friend: 0, sameDept: false }], roster: w.roster, room: 'corridor', provoked: 'none', offences: 0, seed: 1 };
    const bad = CB.consequence(ev); ck(!bad.good && bad.bumps.some(([id, d]) => id === v.id && d < 0), 'unprovoked restrain costs trust');
    const good = CB.consequence({ ...ev, provoked: 'saboteur' }); ck(good.good && good.sabotage === 'clear' && good.bumps.some(([id, d]) => id === wit.id && d > 0), 'subduing an exposed saboteur earns trust and clears sabotage');
    w.phases.saboteurExposed = 'seen'; w.phases.severity = 0.8; const t0 = w.duty.trust(wit); CB.applyConsequence(good, { duty: w.duty, phases: w.phases, alerts: w.alerts, roster: w.roster, deckNo: 1 });
    ck(w.phases.saboteur === null && w.phases.saboteurCaught === v && w.phases.severity < 0.4 && w.duty.stats.saboteurs === 1 && w.duty.trust(wit) > t0, 'caught: culprit cleared, severity cut, trust up, stat counted');
    w.sab.tick(0.5); ck(w.sab.state === 'idle' && !w.sim.overrideAt(v, 1), 'module stands down and releases the override once the culprit is caught');
    const before = w.ss.hp('security'); w.run(120); ck(w.sab.stats.tampers === 0 && w.evs.filter(e => e.type === 'sabotage').length === 0, 'no more tampering after the arrest'); out.caught = true; }
  console.log('saboteur:', JSON.stringify(out), 'seen-in:', withSeen);
}
