// Node unit tests: player billet, duty loops, ledger, witnesses, orders, mission tasks.  node tools/test-duty.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
export async function dutyTests(fail) {
  const { SHIPS } = await imp('js/ships.js'), C = await imp('js/crew.js'), K = await imp('js/clock.js'), D = await imp('js/duty.js'), { CrewSim } = await imp('js/sim.js'), G = await imp('js/gen.js'), BD = await imp('tools/build-duties.mjs');
  const comms = JSON.parse(readFileSync(join(ROOT, 'assets/data/comms.json'), 'utf8')), duties = JSON.parse(readFileSync(join(ROOT, 'assets/data/duties.json'), 'utf8')), ck = (c, m) => { if (!c) fail('duty: ' + m); return !!c; };
  ck(JSON.stringify(BD.build()) === JSON.stringify(duties), 'assets/data/duties.json is stale: run node tools/build-duties.mjs'); ck(!BD.validate(duties).length, 'duties.json invalid');
  const seen = new Set(); let consequences = 0, caught = 0, orders = 0, taskDone = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const ship = SHIPS[seed % SHIPS.length], roster = C.makeComplement(ship, seed), clock = new K.ShipClock({ seed }); clock.assign(roster);
    const player = D.pickBillet(roster, seed); seen.add(player.billet); ck(player && roster.people.includes(player), 'player picked');
    const sim = new CrewSim({ roster, clock, plan: G.shipPlan(ship, seed), data: comms, seed, decks: ship.decks }); sim.setPlayer(player);
    const ss = new C.ShipState(ship, seed); ss.auto = false; for (const s of C.SYSTEMS) ss.repair(s.id);
    const mission = D.pickMission(seed), bf = D.briefing(player, roster, mission, duties, null); ck(bf.loops.length && bf.role, 'briefing has duties ' + player.billet);
    const say = []; const duty = new D.Duty({ player, roster, clock, sim, duties, shipState: ss, say: (m) => say.push(m), seed, mission });
    duty.on(ev => { if (ev.type === 'consequence') consequences++; if (ev.type === 'witness' || ev.type === 'audit') caught++; });
    const mode = seed % 3;   // 0 proper, 1 faker, 2 skipper
    for (let t = 0; t < 1200; t += 0.5) {
      sim.tick(0.5); clock.advance(0.5); duty.tick(0.5);
      for (const l of duty.loops) if (l.state === 'due') { duty.setPlace(1, l.room); const r = duty.perform(l.id, mode === 0 ? 'proper' : mode === 1 ? 'faked' : 'skipped'); if (mode === 1 && r.ok && Math.random() < 0) duty.report(l.id, false); }
      if (t % 20 === 0) for (const tk of duty.tasks) if (tk.state === 'active') { duty.setPlace(1, tk.room); if (duty.doTask(tk.id).ok) taskDone++; }
      if (duty.busy) duty.setPlace(1, duty.busy.loop.room);
      if (t === 300) { const s = duty.subs()[0]; if (s) { const r = duty.order(s, null); orders++; ck(r.ok || r.refused, 'order resolved'); } }
    }
    const sm = duty.summary(); ck(sm.score >= 0 && sm.score <= 100, 'score range');
    if (mode === 0) ck(sm.debt <= 1, `proper player has no debt (${sm.debt}, ${player.billet})`);
    if (mode === 2) ck(sm.debt > 5, `skipper has debt (${sm.debt}, ${player.billet})`);
    ck(duty.board().length >= duty.loops.length, 'board rows');
  }
  // tasks are due by END OF SHIFT: no window expiry; shiftEnd() tallies the unfinished ones into the score and the causal chain
  { const ship = SHIPS[2], roster = C.makeComplement(ship, 7), clock = new K.ShipClock({ seed: 7 }); clock.assign(roster); const ss = new C.ShipState(ship, 7); for (const s of C.SYSTEMS) ss.repair(s.id);
    const player = roster.people.find(p => (duties.billets[p.billet]?.tasks?.survey || []).length >= 2) || D.pickBillet(roster, 7);
    const duty = new D.Duty({ player, roster, clock, duties, shipState: ss, seed: 7, mission: 'survey' }); const missed = []; duty.on(e => { if (e.type === 'missed') missed.push(e); });
    for (let t = 0; t < 1190; t += 1) duty.tick(1);
    ck(duty.tasks.length && duty.tasks.every(t => t.state === 'active'), 'tasks stay open until the shift ends: ' + duty.tasks.map(t => t.state)); ck(!missed.length, 'no task expires before the shift ends');
    ck(duty.tasks.every(t => t.at_s >= 96), 'no task opens in the first 96 s at Standard pace');
    const ms0 = duty.maxScore, left = duty.shiftEnd(); ck(left.length === duty.tasks.length && duty.maxScore === ms0 + left.length && duty.chain.some(c => /Unfinished at end of shift/.test(c)), 'shiftEnd tallies unfinished tasks');
    ck(duty.shiftEnd().length === left.length && duty.maxScore === ms0 + left.length, 'shiftEnd is idempotent'); ck(duty.summary().tasks.unfinished === left.length, 'summary counts unfinished tasks');
    // a duty round nobody got to: a gentle skip (no score, half debt), not a fail
    const d2 = new D.Duty({ player, roster, clock, duties, shipState: ss, seed: 7, mission: 'survey' }); const l = d2.loops[0], end = l.next + l.period; for (let t = 0; t < end; t += 1) d2.tick(1);
    ck(d2.stats.missed >= 1 && d2.stats.skipped === 0 && d2.maxScore === 0, 'a missed round is a gentle skip (no score penalty)'); }
  ck(seen.size >= 6, 'varied billets ' + seen.size); ck(consequences > 0, 'neglect damages systems'); ck(caught > 0, 'faking and skipping get noticed'); ck(taskDone > 0, 'tasks completed');
  return { billets: seen.size, consequences, caught, taskDone, orders };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) { const errs = []; const r = await dutyTests(m => errs.push(m)); console.log(errs.length ? errs.join('\n') : 'duty OK ' + JSON.stringify(r)); process.exit(errs.length ? 1 : 0); }
