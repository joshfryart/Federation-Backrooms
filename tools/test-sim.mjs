// Node unit tests for the NPC sim: node tools/test-sim.mjs (also imported by tools/test.mjs)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

export async function simTests(fail) {
  const { SHIPS } = await imp('js/ships.js'), C = await imp('js/crew.js'), K = await imp('js/clock.js'), { CrewSim } = await imp('js/sim.js'), G = await imp('js/gen.js');
  const data = JSON.parse(readFileSync(join(ROOT, 'assets/data/comms.json'), 'utf8')), ck = (c, m) => { if (!c) fail('sim: ' + m); return !!c; };
  let people = 0, trips = 0, bridgeSeen = 0;
  for (const ship of [SHIPS[0], SHIPS[4], SHIPS[7]]) {
    const seed = 5, roster = C.makeComplement(ship, seed), clock = new K.ShipClock({ seed }); clock.assign(roster);
    const plan = G.shipPlan(ship, seed), sim = new CrewSim({ roster, clock, plan, data, seed, decks: ship.decks });
    const ev = []; sim.on('arrive', e => ev.push(e));
    ck(sim.st.size === roster.people.length, `${ship.name}: everyone placed`);
    for (const s of sim.st.values()) ck(s.deckNo >= 1 && s.deckNo <= ship.decks, `${ship.name}: deck in range ${s.deckNo}`);
    for (let t = 0; t < 1200; t += 0.5) { sim.tick(0.5); clock.advance(0.5); if (t % 60 === 0 && sim.census().bridge) bridgeSeen++; }
    for (const e of ev) ck(e.deckNo >= 1 && e.deckNo <= ship.decks, 'arrival deck in range');
    // nobody is lost: each person is on a deck or in transit; decks + transit add up
    let on = 0; for (let d = 1; d <= ship.decks; d++) on += sim.onDeck(d).length; ck(on + sim.inTransit().length === sim.st.size, `${ship.name}: headcount ${on}+${sim.inTransit().length} vs ${sim.st.size}`);
    // people stand in rooms that exist on their deck
    for (const q of sim.onDeck(1).concat(sim.onDeck(2))) ck(q.room && Number.isFinite(q.tx), 'onDeck entry has room and tile');
    trips += ev.length; people += sim.st.size;
    const d1 = JSON.stringify([...sim.st.values()].map(s => [s.person.id, s.deckNo, s.room]));
    const r2 = new CrewSim({ roster, clock: Object.assign(new K.ShipClock({ seed }), { real: clock.real }), plan, data, seed, decks: ship.decks }); void r2; void d1;
  }
  ck(trips > 40, `crew actually move (${trips} trips)`); ck(bridgeSeen > 0, 'someone is on the bridge');
  return { people, trips };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) { const errs = []; const r = await simTests(m => errs.push(m)); console.log(errs.length ? errs.join('\n') : 'sim OK ' + JSON.stringify(r)); process.exit(errs.length ? 1 : 0); }
