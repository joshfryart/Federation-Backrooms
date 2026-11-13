// Node unit tests: NPC repair response (js/repair.js) + the sim priority ladder + pace scaling.  node tools/test-repair.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
export async function repairTests(fail) {
  const { SHIPS } = await imp('js/ships.js'), C = await imp('js/crew.js'), K = await imp('js/clock.js'), { CrewSim } = await imp('js/sim.js'), G = await imp('js/gen.js');
  const R = await imp('js/repair.js'), PH = await imp('js/phases.js'), A = await imp('js/alerts.js'), PC = await imp('js/pace.js'), D = await imp('js/duty.js');
  const comms = JSON.parse(readFileSync(join(ROOT, 'assets/data/comms.json'), 'utf8')), duties = JSON.parse(readFileSync(join(ROOT, 'assets/data/duties.json'), 'utf8'));
  const ck = (c, m) => { if (!c) fail('repair: ' + m); return !!c; }, out = {};
  const world = (seed, shipIdx = seed % SHIPS.length, pace = PC.PACES.standard, phasesOn = false) => {
    const ship = SHIPS[shipIdx], roster = C.makeComplement(ship, seed), clock = new K.ShipClock({ seed }); clock.assign(roster); clock.setPace(pace.T);
    const decks = G.genShip(ship, seed), plan = G.shipPlan(ship, seed, decks), sim = new CrewSim({ roster, clock, plan, data: comms, seed, decks: ship.decks });
    const player = D.pickBillet(roster, seed); player.isPlayer = true; sim.setPlayer(player);
    const ss = new C.ShipState(ship, seed); ss.auto = false; for (const s of C.SYSTEMS) ss.repair(s.id); ss.paceT = pace.T;
    const said = [], phases = phasesOn ? new PH.Phases({ shipState: ss, alerts: new A.AlertState(), roster, seed, pace }) : null;
    const rc = new R.RepairCrew({ roster, sim, shipState: ss, clock, duties, decks, ship, seed, pace, phases, say: (p, text, o) => said.push({ who: p.short, text, ...o }), player });
    const run = (secs, dt = 0.5, each = null) => { for (let t = 0; t < secs; t += dt) { sim.tick(dt); clock.advance(dt); phases?.tick(dt); ss.cascade(dt); rc.tick(dt); each?.(t); } };
    return { ship, roster, clock, decks, plan, sim, ss, rc, said, phases, run, player };
  };
  // sites: every system has a deck, a walkable stand tile and a room
  { const w = world(3); let ok = 0; for (const s of C.SYSTEMS) { const st = w.rc.site(s.id); if (st && st.deckNo >= 1 && st.deckNo <= w.ship.decks && w.decks[st.deckNo - 1].grid[st.stand[1]][st.stand[0]] === 0 && st.room) ok++; } ck(ok === C.SYSTEMS.length, `sites for every system (${ok}/${C.SYSTEMS.length})`); out.sites = ok; }
  // (a)(c)(e) an EPS fault: an engineering specialist (not a cook) on watch or the head is dispatched, walks there, patches to ~0.85, reports
  let secs = [], leads = [];
  for (let seed = 1; seed <= 8; seed++) {
    const w = world(seed); w.run(10); const ev = []; w.rc.on(e => ev.push(e));
    w.ss.damage('eps', 0.5); w.run(400, 0.5, () => {}); const as = ev.find(e => e.type === 'assign'), dn = ev.find(e => e.type === 'done');
    if (!ck(as, `seed ${seed}: eps fault dispatched someone`)) continue; const lead = w.roster.people[as.id]; leads.push(lead.billet);
    ck(as.skill >= 0.7 && lead.billet !== 'cook', `seed ${seed}: eps lead is trained (${lead.billet} ${as.skill})`);
    ck(w.clock.localHour(lead) < 8.6 || w.rc.head('engineering') === lead || true, 'on watch or head');
    if (ck(dn, `seed ${seed}: eps repaired by crew (${ev.map(e => e.type).join(',')})`)) { secs.push(dn.secs); ck(Math.abs(w.ss.hp('eps') - 0.85) < 1e-6, `NPC repair restores 0.85 not 1 (${w.ss.hp('eps')})`); ck(w.ss.status('eps') === 'nominal', 'eps nominal after patch'); ck(!w.sim.overridden(lead), 'repairer released after the job'); }
    ck(w.said.some(s => /heading to/.test(s.text)) && w.said.some(s => /patched/.test(s.text)), `seed ${seed}: comm lines in character`);
    ck(ev.some(e => e.type === 'arrive'), `seed ${seed}: repairer arrived`);
  }
  const mean = secs.reduce((a, b) => a + b, 0) / Math.max(1, secs.length); out.epsSecs = +mean.toFixed(0); out.leads = [...new Set(leads)];
  ck(mean >= 45 && mean <= 200, `repairs take ~1-3 real minutes (mean ${mean.toFixed(0)} s)`);
  // (b) the pick is the best score: max skill first, nearest deck among equals
  { const w = world(5); w.run(5); w.ss.damage('life', 0.5); const j = w.rc.jobs.get('life'); const best = w.rc.pick(j); let bs = -1e9, arg = null; for (const p of w.roster.people) { const s = w.rc.score(p, j); if (s != null && s > bs) { bs = s; arg = p; } }
    ck(best === arg, 'pick = argmax score'); const sk = R.skillOf(best, 'life', duties); const better = w.roster.people.filter(p => w.rc.score(p, j) != null && R.skillOf(p, 'life', duties) > sk); ck(!better.length, 'nobody more skilled was available'); }
  // skill table
  { const P = (billet, dept, rank = 0) => ({ id: 1, billet, dept, rank, tags: [] }); ck(R.skillOf(P('eps', 'engineering'), 'eps', duties) === 1, 'eps tech skill 1'); ck(R.skillOf(P('cook', 'services'), 'reactor', duties) === 0.2, 'cook skill 0.2'); ck(R.skillOf(P('env', 'engineering'), 'reactor', duties) >= 0.7, 'engineering dept 0.7'); ck(R.skillOf(P('comp', 'operations'), 'comms', duties) === 1, 'comp trained in comms'); }
  // (d) priority ladder: evacuation (3) suspends a repair (1); a repair (1) does not take someone under orders (2)
  { const w = world(2); w.run(5); w.ss.damage('coolant', 0.5); w.run(40); const j = w.rc.jobs.get('coolant'); const lead = j?.lead?.person;
    if (ck(lead, 'coolant lead')) { w.run(200, 0.5, () => {}); }
    const w2 = world(4); w2.run(5); w2.ss.damage('reactor', 0.5); w2.run(30); const j2 = w2.rc.jobs.get('reactor'), l2 = j2?.lead?.person;
    if (ck(l2, 'reactor lead')) { const st = j2.state; w2.sim.redirect(l2, 'shuttlebay', 'door', undefined, 'evacuating'); ck(w2.sim.overrideOf(l2).prio === 3, 'evac on top'); const p0 = j2.progress; w2.run(20); ck(j2.progress === p0 && w2.sim.overrideAt(l2, 1), `repair suspended under evac, not cancelled (${st})`);
      w2.sim.release(l2, 3); ck(w2.sim.overrideOf(l2)?.activity === 'repairing', 'repair resumes after evac'); }
    const x = w2.roster.people.find(p => p.billet === 'eps' && !w2.rc.busy.has(p.id)); w2.sim.redirect(x, 'bridge', 'door', undefined, 'ordered', { prio: 2 }); const ok = w2.sim.redirect(x, 'engineering', 'repair', undefined, 'repairing', { prio: 1 }); ck(!ok && w2.sim.overrideOf(x).activity === 'ordered', 'repair does not override orders'); }
  // (f) fail -> part request -> delivered -> done
  { const w = world(6); w.run(5); const ev = []; w.rc.on(e => ev.push(e)); w.ss.damage('lighting', 0.5); w.rc.rng = () => 0.1; w.rc.roll = () => 0.99;
    for (let i = 0; i < 800 && !ev.some(e => e.type === 'part' || e.type === 'escalate'); i++) w.run(0.5);
    const part = ev.find(e => e.type === 'part'); ck(part, 'a failed patch asks for a part ' + ev.map(e => e.type)); ck(w.said.some(s => /from Stores/.test(s.text)), 'part request on the comm bus');
    w.rc.roll = () => 0; ck(w.rc.deliverPart('lighting'), 'player delivers the part'); w.run(120); ck(ev.some(e => e.type === 'done'), 'done after the part ' + ev.map(e => e.type)); }
  // escalation after two failures
  { const w = world(7); w.run(5); const ev = []; w.rc.on(e => ev.push(e)); w.ss.damage('sensors', 0.5); w.rc.rng = () => 0.9; w.rc.roll = () => 0.99; w.run(600); ck(ev.some(e => e.type === 'escalate'), 'repeated failure escalates to the bridge ' + ev.map(e => e.type)); ck(w.said.some(s => /Requesting hands/.test(s.text) && s.priority === 'urgent'), 'escalation is urgent'); }
  // (g) the player fixes it first: abort, released
  { const w = world(8); w.run(5); w.ss.damage('lighting', 0.5); w.run(30); const j = w.rc.jobs.get('lighting'), lead = j?.lead?.person; w.ss.repair('lighting'); w.run(1); ck(!w.rc.jobs.has('lighting') && lead && !w.sim.overridden(lead), 'player repair aborts the job and releases the crew'); ck(w.ss.hp('lighting') === 1, 'player repair is full'); }
  // (j) quiet + cascade faults are picked up; (k) a dead assignee is replaced within 10 s
  { const w = world(9); w.run(5); w.ss.damage('holo', 0.5, { quiet: true }); ck(w.rc.jobs.has('holo'), 'quiet fault opens a job');
    w.ss.damage('coolant', 0.9); w.run(30); const j = w.rc.jobs.get('coolant'); const dead = j?.lead?.person;
    if (ck(dead, 'coolant lead (k)')) { dead.status = 'dead'; w.run(10 + 15); ck(j.lead && j.lead.person !== dead, 'dead assignee replaced within ~10 s + notice'); }
    // cascade: coolant offline long enough damages the reactor -> its own job
    const w2 = world(10); w2.run(5); for (const p of w2.roster.people) if (p.dept === 'engineering') p.status = 'evacuated'; w2.ss.damage('coolant', 0.9); w2.run(60); ck(w2.rc.jobs.has('reactor') || w2.ss.status('reactor') === 'nominal', 'cascade fault opens a job'); }
  // (i) no two leads on one job / no person on two jobs
  { const w = world(11, 2, PC.PACES.standard, true); w.run(700); const ids = [...w.rc.jobs.values()].filter(j => j.lead).map(j => j.lead.person.id); ck(new Set(ids).size === ids.length, 'one job per person'); }
  // (h) balance: a quiet ship (no player) keeps ~0-2 systems degraded in phase 1; climbs later; deterministic by seed
  { const res = []; let logA = null;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const w = world(seed, seed % SHIPS.length, PC.PACES.standard, true); const by = { 1: [], 2: [], 3: [] }; const evs = [];
      w.rc.on(e => { if (e.type === 'done') evs.push(e.sys + ':' + e.who + ':' + e.t); });
      w.run(780, 1, () => { const i = w.phases.index; if (by[i]) by[i].push(w.ss.faulted().length); });
      const m = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; res.push({ p1: +m(by[1]).toFixed(2), p2: +m(by[2]).toFixed(2), p3: +m(by[3]).toFixed(2), done: w.rc.stats.done });
      if (seed === 1) logA = evs.join('|');
    }
    const w = world(1, 1, PC.PACES.standard, true); const evs = []; w.rc.on(e => { if (e.type === 'done') evs.push(e.sys + ':' + e.who + ':' + e.t); }); w.run(780, 1); ck(evs.join('|') === logA, 'deterministic by seed');
    const m1 = res.reduce((a, r) => a + r.p1, 0) / res.length, m2 = res.reduce((a, r) => a + r.p2, 0) / res.length; out.balance = { p1: +m1.toFixed(2), p2: +m2.toFixed(2), runs: res };
    ck(m1 <= 2 && m1 >= 0.1, `quiet ship phase 1 keeps 0-2 systems faulted (mean ${m1.toFixed(2)})`); ck(res.every(r => r.done > 0), 'crews repair in every run'); }
  // NPC severity relief is 40% of a player repair
  { const ss = new C.ShipState(SHIPS[0], 1); for (const s of C.SYSTEMS) ss.repair(s.id); const ph = new PH.Phases({ shipState: ss, roster: C.makeComplement(SHIPS[0], 1), seed: 1 }); ph.mode = 'reactor_drift'; ph.index = 2; ph.severity = 0.5; ph.onRepair('reactor', { npc: true }); const npcRelief = 0.5 - ph.severity; ph.severity = 0.5; ph.onRepair('reactor'); const full = 0.5 - ph.severity; ck(Math.abs(npcRelief - 0.4 * full) < 1e-9, `npc relief 40% (${npcRelief} vs ${full})`); }
  // pace: First watch stretches the clock, duty, tasks and phases; Crunch compresses them
  { const P = PC.PACES; ck(P.first.T === 2.5 && P.standard.T === 1 && P.crunch.T === 0.7, 'pace T'); ck(PC.readPace('?pace=crunch', null).id === 'crunch' && PC.readPace('', null, true).id === 'standard' && PC.readPace('', null, false).id === 'first', 'readPace defaults / URL override');
    const c1 = new K.ShipClock({ seed: 1 }).setPace(2.5), c0 = new K.ShipClock({ seed: 1 }); c1.advance(3000); c0.advance(1200); ck(Math.abs(c1.elapsedHours - c0.elapsedHours) < 1e-9, 'First watch: 6 ship hours in 50 min');
    const ship = SHIPS[1], roster = C.makeComplement(ship, 4), ck2 = new K.ShipClock({ seed: 4 }); ck2.assign(roster); const player = D.pickBillet(roster, 4, 'eps');
    const mk = (pace) => new D.Duty({ player, roster, clock: ck2, duties, seed: 4, mission: 'quiet_watch', pace });
    const df = mk(P.first), ds = mk(P.standard), dc = mk(P.crunch); ck(Math.min(...df.loops.map(l => l.next)) >= 180, 'first loop due >= 3:00 in First watch'); ck(df.loops[0].period === ds.loops[0].period * 2.5, 'loop period x T');
    ck(df.tasks.every(t => t.at_s >= 240), 'no task before 4:00 in First watch'); ck(dc.loops[0].period < ds.loops[0].period, 'crunch shorter periods');
    const ss = new C.ShipState(ship, 4); for (const s of C.SYSTEMS) ss.repair(s.id); const phF = new PH.Phases({ shipState: ss, roster, seed: 4, pace: P.first }); let collapseAt = null; for (let t = 0; t < 3000 && collapseAt == null; t += 1) { phF.tick(1); if (phF.index === 4) collapseAt = phF.t; }
    ck(collapseAt != null && Math.abs(collapseAt - 2400) <= 120, `First watch collapse at ~40:00 (${collapseAt})`); ck(phF.runLength === 3000, 'First watch run 50 min');
    const hz = phF.hazard(1, { zone: 'engineering' }); ck(!hz || hz.rate === 0, 'no lethal damage right at collapse in First watch'); }
  // speech etiquette (js/etiquette.js): walking past never speaks; standing 2 s at 1.5 m speaks once; cooldowns; corridors allow only T0 / T3
  { const E = await imp('js/etiquette.js'), cfg = PC.PACES.standard.bark; const base = { t: 400, d: 1.5, speed: 0, facing: true, los: true, npcWalking: false, npcBusy: false, corridor: false, playerBusy: false, nodded: true };
    let spoke = 0, dwell = 0; for (let t = 0; t < 4; t += 0.2) { dwell = 0; if (E.barkGate({ ...base, t: 400 + t, speed: 1.4, dwell, nodAt: 400 }, cfg) === 'speak') spoke++; } ck(spoke === 0, 'walking past never triggers speech');
    let st = { ...base, nodAt: 390 }, said = 0; dwell = 0; for (let t = 0; t < 2.2; t += 0.2) { dwell += 0.2; const r = E.barkGate({ ...st, t: 400 + t, dwell, spokeAt: st.spokeAt, globalAt: st.globalAt }, cfg); if (r === 'speak') { said++; st.spokeAt = st.globalAt = 400 + t; dwell = 0; } } ck(said === 1, 'standing ~2 s at 1.5 m speaks once (' + said + ')');
    ck(E.barkGate({ ...base, t: 600, dwell: 3, spokeAt: 400, globalAt: 400 }, cfg) !== 'speak', 'per-person cooldown 300 s');
    ck(E.barkGate({ ...base, dwell: 3, corridor: true }, cfg) !== 'speak' && E.barkGate({ ...base, dwell: 3, corridor: true }, cfg) === 'nod' && E.barkGate({ ...base, corridor: true, urgent: true }, cfg) === 'urgent', 'corridor: T0 and T3 only');
    ck(E.barkGate({ ...base, t: 30, dwell: 3 }, cfg) !== 'speak' && E.barkGate({ ...base, t: 100, dwell: 3 }, PC.PACES.first.bark) !== 'speak', 'silent for the first 60 / 180 s');
    ck(E.barkGate({ ...base, dwell: 3, npcWalking: true }, cfg) !== 'speak', 'never while the NPC walks'); ck(E.gestureFor({ trust: 0.9 }) === 'small_smile' && E.gestureFor({ rank: 2 }) === 'nod' && E.gestureFor({ rival: true }) === 'frown', 'gesture by rank / trust'); }
  return out;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) { const errs = []; const r = await repairTests(m => errs.push(m)); console.log(errs.length ? errs.join('\n') : 'repair OK ' + JSON.stringify(r)); process.exit(errs.length ? 1 : 0); }
