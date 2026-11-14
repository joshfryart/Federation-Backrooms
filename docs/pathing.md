# NPC crew pathing (Systems Nominal)

How crew bodies walk on the player's deck: `js/sim.js` (abstract schedule, `bodies()`), `js/main.js` (`simBodies`, `simTileFor`,
`walkStep`, `carStep`, cached `pathField`), `js/world.js` (`field`, `slideDoors`). Tests: `tools/test-walk.mjs` (node) and the
`npc walking:` block of `node tools/test.mjs`.

## Soak harness

`node tools/soak-walk.mjs` (about 1 minute) starts a nominal run as the Chief of Security (`?billet=cos`) with `Math.random` seeded,
then for each of the 3 busiest decks (each from the same fresh run) steps the game 150 s at 30 steps/s with the ship clock 6x faster
(6x more schedule changes and lift trips than real play: a stress test). The player hops every 10 s between the lift mouth (looking
into the car), beside a walker and the busiest room. Every 12 s a subordinate gets an order or a due duty is delegated (mostly
someone whose body is on the deck). Options: `--secs --decks --only 2,5 --clock --seed --billet --ship --orders --sep --samples
--trace --json`. Each row prints:

| metric | meaning |
|---|---|
| stuck | walks whose path-field distance did not improve for > 8 s (count, body-seconds) |
| stacked / brushing | pairs of bodies < 0.45 m apart: both idle (stacked) / one walking (brushing, split by near the lift `car`, walker-walker `ww`, walker-idle `wi`, `g` = squeezing past, `s` = in sight) |
| clip | a body's mesh inside a wall / prop (0.15 m circle), walking / idle (not on equipment, not in the lift car) |
| osc | walkers that reverse direction 3+ times in 10 s |
| slow walks | walks still running after 3 s per tile of path + 15 s |
| cut short / re-planned | walks that ended off their tile / were replaced by a new walk |
| orders | given / refused / reached the job room (abstract sim) / body seen standing in it on this deck / never got there |
| lift | boarders waiting in the car > 10 s, walkers queued at the car > 15 s, most boarders at once |
| pop | bodies appearing / vanishing in the player's sight (not in a shut car), teleports > 0.6 m in a frame (in sight) |
| cost | path fields built per second and ms each, `step()` ms mean / p99 / max |

Step times are noisy when other headless browsers share the machine; compare rows from the same run. The harness reopens the page
and retries a deck once if the renderer crashes (out of memory on a shared box).

## Pathing log

### Iteration 1 (2026-11-14)

Owner play-test as Security Chief: "crew pathing seems better, still lots of work needed". Measured with the soak (seed 11, USF Nova
Scotia, decks 3, 4, 2, 150 s each at clock x6), before -> after:

| | before | after |
|---|---|---|
| ordered NPCs that never reached the job room | 17 of 25 (reached 8, mostly already there) | 0 of 26 (median 8 s to get there) |
| boarders waiting in the lift car > 10 s | 18 | 0 |
| most boarders in the car at once (all on one spot) | 15 | 5 (on separate spots) |
| walker overlap (pairs < 0.45 m, pair-seconds) | 671 (529 at the lift) | 136 (118 at the lift) |
| stuck walks (count, body-seconds) | 8, 12 s | 9, 30 s (deck 3 lift queue at 6x) |
| lift queue > 15 s | 2 | 0 |
| pops / teleports in sight | 1 / 1 | 1 / 2 |
| path fields / step() p99 | 0.22 / s at < 0.2 ms, 8.5 ms | 0.23 / s at < 0.1 ms, 8.2 ms |

Found and fixed:
1. **Orders and delegation never moved anyone.** `Duty.order` / `delegate` only started a timer; the person kept their schedule and
   the job "finished" wherever they were. Now the `ordered` event sends them to the loop's room (`orderWalk`: sim redirect priority 2,
   activity `ordered`, walking, not running; another deck = the lift), the job's clock only runs once they are in the room and their
   body (if they are on the player's deck) has walked in (`Duty.atJob` = `orderAt`; the clock starts anyway after `JOB_WAIT` = 120 s), and `jobdone` releases the
   override (`orderEnd`, then the person's next job if any). Events now carry `job`.
2. **Crew could be given the lift car or the tile at its doors as their spot.** The car tile can belong to the room it opens into
   (about 1 deck in 8); someone sitting there held the doors open for good and boarders piled up. `simTileFor` skips both tiles
   (`liftKeepClear`).
3. **Lift boarders stood on one spot and the car never left under steady traffic.** Boarders now step to the nearest free spot of six
   (`CAR_SLOTS`, >= 0.58 m apart) once inside; the doors close after 4 s with boarders or a full car even while more are coming
   (`L.boardW`), and walkers further than 1.3 m wait while it cycles. Arrivals appear on a free spot of the car, not on top of
   people still stepping out. The car only counts as hidden for an arrival when no boarder in it is in sight either.
4. **Walkers walked through each other.** Personal space in `walkStep`: a walker slides sideways (never backwards) off any body closer
   than `WALK_SEP` = 0.55 m, except while squeezing past (`ghost`) and within 2.6 m of the car (its own choreography). A pure push
   (also backwards) cut overlap more but tripled stuck time in corridor queues; `G.walkSep` / `--sep` overrides it for A/B runs.

Tests: `tools/test-walk.mjs` node part (job clock waits for arrival, times out after `JOB_WAIT`, events carry the job) and browser
part 6-8 (an ordered body walks to the job room, the job runs there, the override is released; no `simTileFor` result on the car or
its mouth; four people leaving by lift while the player watches stand >= 0.4 m apart and none waits > 10 s).

Still broken / next, by measured size:
1. **Lift mouth congestion at high traffic** (deck 3: ~107 pair-s of overlap within 3.5 m of the car, 30 stuck body-seconds): arrivals stepping out meet the queue going in, and a corridor queue blocks people walking the other way (no ghosting
   while they still creep forward at 0.2 m/s). Ideas: a waiting spot beside the doors instead of in front, arrivals first, ghost
   when crept < 0.3 m in 4 s.
2. **Sim/body time mismatch:** `WALK_MAX` caps the abstract walk at 20 s, but long walks on big decks take 40-70 s for the body
   (median walk 9-20 s, p90 26-68 s). The sim then counts the person as arrived (or on another deck) long before the body is.
3. **Walker vs seated bodies:** walkers steer around logical positions, but a seated / operating body's mesh sits on the seat or
   use point, so they brush through it (`wi`, ~1-30 pair-s per deck).
4. Not measured yet: path cost on decks with tubes (crawl), carts as obstacles (haulers shove walkers), alert / evacuation surges,
   the 14 m "unseen" radius in long corridors, the 6 % refused orders path (a refusal does nothing visible).

### Iteration 2 (2026-11-14)

Harness additions: `early` (body-seconds a body is still walking a schedule walk, or to the lift car, while the abstract sim already
counts it arrived / riding), `--surge T` (at T s an evacuation surge like `evacuationStep`, all decks: 60 % of the crew in leisure rooms
run to the shuttlebay at prio 3; prints sent / sim median arrival / bodies that stood in the room / left the deck), `carBrushS` in TOTAL
(brushing within 3.5 m of the car), lift samples now list the door bodies' walk state, `--trace` adds the wait spot and arrivals count.
Same soak (seed 11, USF Nova Scotia, decks 3, 4, 2, 150 s each at clock x6) and a second seed (12, with `--surge 60`), HEAD before ->
after. Runs are chaotic (one change moves every later walk); intermediate after-runs varied by about +-50 % on the lift numbers.

| | seed 11 before | seed 11 after | seed 12 + surge before | after |
|---|---|---|---|---|
| brushing near the lift (pair-s within 3.5 m of the car) | 205 | 26 | 167 | 20 |
| all walker brushing (pair-s) | 220 | 31 | 160+ | 25 |
| stuck walks (count, body-s) | 10, 41 s | 1, 0.1 s | 16, 49 s | 1, 1.6 s |
| sim ahead of the body (`early`, body-s) | ~1500 (surge run) | 22 | 1752 | 30 |
| lift queue > 15 s (walkers within 3.5 m of the car) | 4 | 4 | 0 | 7 |
| boarders waiting in the car > 10 s | 0 | 1 | 0 | 1 |
| walk median / p90 (deck 3) | 10.3 / 27 s | 8.6 / 28 s | 10.6 / 32 s | |
| ordered NPCs not in the job room by the end of the deck | 8 of 25 (surge run) | 13 of 26 | 4 of 28 | 12 of 26 |
| pops / teleports in sight | 1 / 2 | 1 / 0 | 0 / 1 | 0 / 3 |

Ordered NPCs: the sim now takes real walk + ride + walk time (30-85 s for a cross-deck order instead of 5-20 s), so more orders given
late in a 150 s deck are still under way when it ends. Step-time p99 is not comparable this time (other agents' browsers shared the box).

Found and fixed:
1. **The sim ran ahead of the body.** `WALK_MAX` 20 s and 1.3 m/s per tile vs bodies at ~0.93 m/s on 30-80 m walks. Now `TILE_S` = 2.5 s
   per tile, cap 75 s; `sim.holdBody(person, transit)` (main.js `simHold`) keeps a trip open while the body on the player's deck is still
   on that schedule walk, or (lift trips) still walking to / standing in the car: the ride only starts once the body is gone; at most
   `HOLD_MAX` = 60 s past the estimate. With `lifts` (each deck's car tile, `G.shipDecks[i].data.exit`), a lift trip is walk to the car
   + ride + a walk leg from the car on the new deck (`bodies()` lists the person there, walking, so the body steps out and walks in while
   the sim agrees). Cost: cross-deck orders / repairs / evacuations now take 30-90 s of sim time instead of 5-20 (honest).
2. **Lift mouth:** (a) walkers wait beside the doors (`LIFT_WAIT`, 6 spots in two rows on both sides, checked against walls and props,
   claimed via `e.liftWait`) while the car is closing / locked or someone who just stepped out (`e.fromCar`, < 8 s) is still within
   1.8 m of the car: arrivals get out first, corridor walkers get past; (b) the doors no longer shut 1.6 s after the first boarder
   (`finish` set `shutT ||= 1.6`): carStep's rule decides (nobody else walking up, 4 s, or a full car), so a group boards together;
   (c) the "at most 3 arrivals per cycle" check had been swallowed by a `//` comment: restored; arrivals are staggered 0.6 s apart and
   step out through each other (ghost 0.2 s while < 1.6 m from the car); new arrivals are held back once someone has waited beside the
   doors 3 s (turns, not a steady stream out of an unseen car); (d) personal space applies to everyone outside 1.3 m of the car centre.
3. **Seated / working bodies:** walkers steer around and keep space from the mesh position (seat / use point), not the logical tile.
4. **Creeping queues:** a walker that moved < 0.3 m in 4 s squeezes past (ghost 1.5 s), not only one stopped dead (not while waiting
   for the lift).
5. **Requests from the props agent** (docs/propart-integration.md 1-2): `opStart` passes the prop kind to `standPoint` (per-prop use
   points), junction doors swing open while the player or a crew member works at them (`setJunctionDoor`).
6. **Refusals:** a refused order / favour (`Duty` events now carry `person`) makes the body shake its head when in sight (< 16 m) and
   speak the line when < 10 m (`refuseReact`); the log line no longer doubles the name.

Tests: `tools/test-walk.mjs` node part (the sim holds a walk for its body and lets go after `HOLD_MAX`; lift trips end with a walk leg
from the car tile on the new deck; a refusal carries the person) and browser part 9 (wait spots on open floor, both sides, apart; a lift
walker waits at one while an arrival steps out; a refusal plays `shake_head`).

Still broken / next, by measured size:
1. **Lift queue time** under the x6 stress (4-7 walkers > 15 s within 3.5 m, 18 in one intermediate run with longer arrival
   windows; the trade-off of letting arrivals out first): the car takes one batch per cycle and the player looking
   in forces extra close / open cycles for arrivals (`L.arrive`). Ideas: board and unload in the same open-doors window (arrivals spawn
   while boarders' doors close is the only hidden moment); a second car spot set when 6+ wait; the soak's player stands at the lift mouth
   1/3 of the time, which real players do less.
2. **Orders take real time now**, and nothing tells the player: a "on my way (deck 4, ~1 min)" line or nav pin for the ordered person.
3. Boarders > 10 s in the car (0-4 per run): a stream of walkers through the doorway keeps the doors open (never shut on someone in
   the doorway). A full car should stop taking walkers already at 1.3 m.
4. Not measured yet: crawl tubes, carts blocking corridors (deck 4 showed a pushed cart crawling at the lift mouth), the 14 m "unseen"
   radius in long corridors. The surge harness exists, but on this ship the shuttlebay is on another deck, so it only measures the
   lift; try `--ship` with a shuttlebay on a busy deck.

Requests to other owners (iteration 2): `TODO.md` first Handoff bullet (pathing), replace "Next: lift mouth congestion, sim walk time vs
body walk time, brushing seated bodies." with "Iteration 2: the sim waits for the body (walk + ride + walk legs), lift walkers wait
beside the doors and let arrivals out first, refusals show on the body. Next: lift queue time under heavy traffic, telling the player
how long an ordered person needs, carts / tubes / long-corridor unseen radius."

### Iteration 3 (2026-11-14)

Re-baselined first: art integration (12f51a0 and the art batches after it) narrowed room edges with props. The harness gained
`far pops` (appear / vanish 14-30 m away in a clear line of sight: the 14 m "unseen" radius in long corridors), `carts` (walkers'
meshes within 0.55 m of a cart; walkers held up < 0.2 m/s within 1.5 m of a pushed one), `tube walks` and walking body-s on tube
tiles, samples for stacked pairs and for boarders > 10 s. It also had a bug: the "beside a walker / busiest room" hops could put the player
on a lift boarder, i.e. in the car, which holds the doors open (all 3 "boarders > 10 s" on deck 4 were that); the player no longer hops
within 3 m of the car. Before = 4166dc8 with the lift change reverted, after = 25c65d4, both with the new harness, same seeds
(decks 3, 4, 2, 150 s each, clock x6). Runs are chaotic: one change moves every later walk.

| | seed 11 before | after | seed 12 + surge 60 before | after | Manitoba (`--ship 4 --surge 60`) before | after |
|---|---|---|---|---|---|---|
| lift queue > 15 s (walkers within 3.5 m of the car) | 7 | 1 | 10 | 1 | 5 | 4 |
| boarders waiting in the car > 10 s | 0 | 0 | 0 | 0 | 0 | 0 |
| brushing near the lift (pair-s within 3.5 m) | 31.7 | 18.4 | 23.5 | 21.7 | 42.4 | 31.3 |
| stacked idle pairs (pairs, pair-s) | 1, 3.9 | 0, 0 | 6, 76.3 | 0, 0 | 34, 416.8 | 3, 8.3 |
| stuck walks (count, body-s) | 2, 0.3 | 0, 0 | 1, 1.6 | 1, 1.2 | 2, 1 | 7, 16.9 |
| deck 3 walk median / p90 | 9.2 / 29.6 s | 9.2 / 28.8 s | 11.4 / 36.9 s | 12.6 / 33.8 s | 17.7 / 62.7 s | 13.7 / 71 s |
| walkers through a cart / held up by a pushed cart (body-s) | 4.3 / 3.7 | 3.3 / 8.8 | 0 / 1.6 | 0.1 / 0.5 | 0 / 2.8 | 0.3 / 8.3 |
| tube walks | 4 | 3 | 9 | 8 | 12 | 14 |
| far pops (14-30 m in clear sight) | 9 | 1 | 0 | 0 | 18 | 7 |
| pops / teleports in sight | 1 / 0 | 0 / 2 | 0 / 2 | 0 / 2 | 0 / 1 | 0 / 1 |
| step() p99 | 11.6 ms | 9.2 ms | 10.6 ms | 9.6 ms | 10.3 ms | 10.4 ms |

Manitoba (the shuttlebay on deck 4, a busy deck): the evacuation surge there sent 4 people, all 4 bodies stood in the shuttlebay
(median 33 s before / 55 s after, sim median 34 s). On deck 3 the same surge sends 5-7 to the lift at once; the 7 "stuck" walks after
are all in that crowd 4-6 m from the car (more people than the 6 wait spots), not in the open.

Found and fixed:
1. **The car cycled empty while people walked up to it.** With the player in sight of the open car and anyone due to arrive, simBodies
   shut the doors at once (`L.shutT = 1.6`, to let the arrival appear out of sight), even with people a few metres away walking up or
   standing at the wait spots: they waited a whole extra cycle, one boarder per cycle (trace, seed 11 deck 3). Now the doors are only
   forced shut for an arrival when nobody is boarding and no lift walker is within 4.5 m (`liftComing`); otherwise the arrival comes
   when the doors shut on the boarders (one cycle: board, shut, arrive, open).
2. **A full car kept taking walkers.** With all 6 car spots taken, walkers further than 1.3 m wait beside the doors (`carFull` counts as
   shut in walkStep) instead of walking in and holding the doors open. Someone already in the doorway still gets in (7 at most).
3. **Crowded rooms stacked people on one spot.** `simTileFor` tried 12 tiles and then returned a taken one: 17 crew at a 12-tile mess
   (seed 12 deck 3), 34 pairs on Manitoba. Now it tries every tile, then shares the least crowded one, standing 0.62 m off its centre
   (golden-angle steps, resolved against walls; `t.off`, the walk ends with a short step there).
4. **Orders tell the player how long they take.** `sim.estimate(person, room)` (the same walk / lift legs as `tick()`); the order line
   reads `Ens. X takes the job: Y. "On my way from deck 4, about a minute."` ("On it." / a few seconds / half a minute / about a minute /
   a couple of minutes), and Duty emits `atjob` once when they get there after more than 3 s (`Ens. X is at the job: Y.`).

Measured, small, not changed: carts (walkers pass through parked carts 0-4 body-s per run, held up by pushed ones 0.5-9 body-s), tube
walks (3-14 per run, no stuck or slow walk in a tube), far pops (0-18 per run of appear / vanish 14-30 m away in clear sight, mostly
lift arrivals / departures at the far end of a long corridor; the 14 m radius stays).

Tests: `tools/test-walk.mjs` node part (`sim.estimate`: 0 where they are, a walk on the same deck, more for another deck; `atjob`
fires once) and browser parts 10 (the player watches the open car while 7 leave and 1 arrives: all leave, the arrival comes, no door
close on an empty car while someone walks up, at most 7 boarders, nobody > 10 s in the car) and 11 (more people than tiles in a small
room stand >= 0.4 m apart).

Still broken / next, by measured size:
1. **Surge crowds at the lift**: 5-7 people leaving a deck at once overflow the 6 wait spots; the rest stand 4-6 m out in the corridor
   (counted as stuck, 17 body-s on Manitoba deck 3). Ideas: a second row of wait spots further out / along the corridor, or two
   batches per cycle (the car takes 6; the sim could send the rest by another lift / tube).
2. **Orders "never there" by the end of a 150 s deck** (12 of 27): cross-deck orders take 30-90 s of real walking and riding, so orders
   given in the last minute are still under way. Not a bug; the player now hears the estimate.
3. **Teleports in sight 1-2 per run**: equipment-use snaps (`opStart` snaps onto the use point when the body counts as out of sight;
   the soak's "seen" checks both ends), 0.8-0.9 m. Ideas: ease the mesh in whenever either end is in sight.
4. The player standing in the lift car without using the panel holds the doors open, and boarders wait in the car until they leave
   (real play: rare, the panel opens).
5. Not measured yet: alert stations (prio 3, not evacuation) on a busy deck, the 6 % refused-order head shake in play.

Human play-test list (iteration 3):
- Stand at the lift on a busy deck (or watch the doors from the corridor) for a minute: people should board in groups, the doors shut,
  and arrivals step out on the next opening; nobody should wait long beside the doors while the car comes and goes empty.
- Order a subordinate who is on another deck (J menu): the log should say how long they need ("about a minute"), then
  "X is at the job" when they get there. Check that the estimate feels right.
- Visit the mess / a lounge at a meal or shift change: people should never stand inside each other; in a packed room some stand
  between the tables.
- Walk a long corridor toward the lift during heavy traffic: watch for people appearing / vanishing at the far end (14-30 m).
- Push a cart through a corridor while crew walk by: they currently pass through parked carts; report if it looks bad.

`node tools/test.mjs` (8 runs this iteration, a random ship each run): every `npc walking` check passed every time; one other check
failed per run, a different one each time (dodge return, a walk test that found no body, `doors2.open`, handheld in hand, combat
knock-down / grab drag, all depending on where the random deck puts people), and the commit before the crowded-room change printed OK.
The first dodge failure was real (a crowded-room step walk nulled by the test lost the body's sim key) and is fixed in f1f9000.

Requests to other owners (iteration 3): none.

### Iteration 4 (2026-11-14)

Harness additions: `--alert red@60` (raise that alert 60 s into each deck: people of the deck sent to their stations, sim median to get
there, bodies that stood in it, left the deck, never), a `lift queue` line (most lift walkers waiting at once, how many of them in the line
beyond the 6 door spots, pair-s of lift walkers < 0.45 m apart, stuck walks not counting people waiting at a lift spot on purpose), in-sight
pop samples now carry the body's distance from the car / slot / held flag, and delegated duties go to the nearest subordinate
(`Duty.byDistance`, when the build has it). Art batches 5-8 and 11 landed during this iteration (8522164, a25f79a: every seed's layout
changed), so before = a25f79a and after = a25f79a + this iteration's `js/main.js` / `js/haul.js` / `js/duty.js`, both with the new harness,
same seeds (decks 3, 4, 2, 150 s each, clock x6). A first pair on d4daa26 (before the art commits) pointed the same way. Runs are chaotic:
one change moves every later walk; step times are not comparable (load average 8-17 from other agents' browsers).

| | seed 11 before | after | seed 12 + surge 60 before | after | Manitoba (`--ship 4 --surge 60`) before | after | seed 11 + red alert at 60 s before | after |
|---|---|---|---|---|---|---|---|---|
| stuck walks (count, body-s) | 3, 2.4 | 2, 0.7 | 4, 6.7 | 4, 5.2 | 9, 16.7 | 6, 13.5 | 0, 0 | 1, 0.4 |
| ... not waiting at a lift spot | 3, 2.4 | 2, 0.7 | 4, 6.3 | 3, 4.3 | 9, 16.7 | 5, 11.8 | 0, 0 | 0, 0 |
| lift walkers < 0.45 m apart (pair-s) | 2.6 | 3.9 | 7.4 | 13.7 | 43.4 | 30.7 | 2.7 | 15.2 |
| brushing near the lift (pair-s within 3.5 m) | 15.6 | 7.0 | 19.1 | 21.7 | 31.5 | 21.4 | 5.6 | 4.5 |
| lift queue > 15 s (within 3.5 m of the car) | 3 | 1 | 2 | 2 | 4 | 3 | 0 | 0 |
| most waiting at once (in the line) | 5 (0) | 9 (4) | 6 (0) | 10 (6) | 6 (0) | 11 (5) | 5 (0) | 10 (6) |
| boarders waiting in the car > 10 s | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| teleports in sight | 0 | 0 | 3 | 1 | 0 | 0 | 2 | 0 |
| pops in sight (appear / vanish) | 0 / 0 | 0 / 0 | 0 / 0 | 1 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| far pops (14-30 m in clear sight) | 0 | 1 | 0 | 0 | 21 | 7 | 0 | 0 |
| walking through walls / props (body-s) | 4.0 | 1.9 | 3.6 | 0.6 | 2.7 | 1.7 | 5.3 | 2.5 |
| orders given / never got there by the end of the deck | 26 / 13 | 26 / 13 | 26 / 12 | 16 / 5 | 30 / 14 | 30 / 17 | 26 / 12 | 23 / 19 |
| red alert: sent to stations (stood there / left the deck / never) | | | | | | | 0 | 11 (1 / 10 / 0) |

Manitoba deck 3 (the deck the surge empties through the lift): stuck 9 -> 6 walks (16.7 -> 13.5 body-s), lift walkers in a crowd 38.3 ->
29.8 pair-s, queue > 15 s 2 -> 0, up to 11 waiting (5 in the line). The red-alert run's crowd (15.2 pair-s) is the stations surge itself:
11 people of decks 3 and 4 leave by lift within 8 s (sim median 58-69 s to their station); before this iteration a red alert moved
nobody. Seed 12 gave fewer orders after (16 vs 26): the harness now delegates to the nearest subordinate, the same person several times,
whose trust drops with each refusal (9 refusals on deck 4); in play the J menu offers all of them.

Found and fixed:
1. **Surge crowds at the lift: a line behind the door spots, called forward in turn.** `liftQueueSpots` (main.js): up to 14 places on the
   tiles 2-4 steps from the car (path field), two per side of the walkway, the middle left free, checked against walls and props. While
   the car is shut / full / held (or anyone is already waiting) lift walkers within 4 path steps take the nearest free door spot, else the
   front-most free place in the line, and move up when a place ahead frees. When the doors open only as many leave the line as the car has
   room for (6 minus boarders minus those already on their way), front first (`e.liftGo`, so nobody flips back into the line); newcomers
   join the line behind. While walking to a place they keep their personal space; standing at it they do not squeeze through anyone.
   Trace (Manitoba deck 3): before, all 13 of a surge rushed the doors whenever they opened, 7 then had to back off again; a first version
   of the line made it worse (walkers beyond 4.2 m were not counted as on their way, so the whole line left at once).
2. **Equipment / seat snaps in sight.** (a) `opStart` snapped the mesh onto the use point when the *logical* tile was > 10 m and out of
   line of sight, while the old or new mesh position could be in sight: now only when both mesh positions are out of sight (> 14 m or no
   line of sight), else the body steps over (opHook, 1.1 m/s); `opEnd` eases back whenever either end is in sight (was < 22 m and < 2 m).
   (b) A pushed cart shoving someone seated / at a console set the mesh onto the logical spot (0.8-1 m jumps, 2 per incident; the
   "teleports in sight" of iteration 3): it now nudges the mesh only, and opHook steps it back.
3. **Player standing in the lift car without using the panel.** After 5 s with the doors open and the player in the car (`L.held`),
   boarders step back out (one says "We'll take the next one."), everyone waits beside the doors / in the line, and they board as soon as
   the player steps out.
4. **Boarders sent off on other jobs.** A cart / carry job (haul.js) or a repair walk could pick a body already standing in the lift car
   (no walk, `board`), walk it out, and the closing doors then removed it in sight (seen once per seed-11 run after the line change made it
   likelier). Boarders are excluded from both.
5. **Red alert ("All hands to stations") moved nobody** (`--alert red@60`: 0 sent; only gaits changed). `alertStations` (main.js): crew
   who are off their post go to the first block of their billet's day (where their watch begins) at sim priority 3 ('stations', staggered
   over 8 s, running); released when the alert is cleared; not in the collapse (evacuation takes over). Yellow alert ("check your
   stations") moves nobody, as before. Orders (priority 2) wait underneath until the alert is cleared, so ordered jobs stall during red
   alert (19 of 23 never got there in that run).
6. **Delegating: nearest first.** `Duty.byDistance(people, room)` (sim.estimate, people already on a job last); the J menu's "Delegate
   to" list is sorted by it and each row shows the ETA ("~30 s", "~2 min", "there"). Orders still unfinished at the end of a 150 s deck
   (13 of 26 on seed 11, unchanged) are orders given in the last 60-90 s of the deck (late arrivals 59-112 s): acceptable, not a bug.
7. **test.mjs failures across runs** (iteration 3 logs re-read with a checker for each condition of `nominal ship / turbolift`): dodge
   `back` 41.8 m once after f1f9000 = the test nulls the walk of a body that may be mid schedule walk, then simBodies walks it on to its sim
   spot (in play a dodge only starts with no walk): the test now holds the schedule still during the dodge (in tools/test.mjs, committed
   with 8522164). `doors2.open` false: `World.slideDoors` opens for the player only (the test passes no crew), so it was the door lock
   (ship power), not pathing. `walk ... arrived` false once (the walk test's own walk, no sim key) and "handheld not in hand", combat
   knock-down / grab drag: their bodies are held by the test (`G.simT = 1e9`) or not walking; no pathing cause found. `turbolift` in those
   logs was always one of the above (the failure name covers the whole nominal block).

Tests: `tools/test-walk.mjs` node part (`Duty.byDistance`: nearest first, people on a job last, no room = roster order) and browser parts
12 (8-10 people leave by lift while the player stands in the open car: boarders step out after 5 s with the line, nobody stays in the car,
waiting people >= 0.45 m apart, the line used when more wait than there are door spots, all gone once the player steps out, nobody > 10 s
in the car) and 13 (red alert: everyone off post gets a priority-3 'stations' override to their billet's first room; cleared = released).

Still broken / next, by measured size:
1. **Lift throughput under surges**: one car, 6-7 per cycle; at x6 a deck-wide surge still keeps 10-11 people waiting and 3-4 walks
   > 15 s near the car. Ideas: a second car / lift on big decks (generator: other owner), or the sim sending some by Jefferies tube.
2. **Orders during red alert** stall under the stations override (by the priority ladder). If the owner wants orders to win, give
   `ordered` priority 3.5 during alerts, or release stations for ordered people.
3. **Far pops** 7-21 per Manitoba run (14-30 m, mostly lift departures at the end of long corridors), teleports in sight 0-1 per run
   (a walker shoved by a pushed cart: the non-op shove still sets the mesh).
4. The harness delegates to the nearest person every time; make it rotate among the 3 nearest so refusals do not pile on one person.

Human play-test list (iteration 4):
- Watch the lift on a busy deck during an evacuation or a red alert: people should stand beside the doors and in a line further back
  (two files, the middle of the corridor free), and go in a carful at a time, front first, without a crush at the doors.
- Stand inside the open lift car without choosing a deck for 5+ s while people want to board: they should step back out ("We'll take
  the next one."), wait, and board once you step out.
- Watch someone sit down at a bar / bunk / console from a few metres away, and push a cart past seated people: no jumps.
- Red alert (F4 debug cycle, or a crisis): off-duty crew in the mess / quarters should run to their stations (many by lift); after the
  alert clears they go back to their schedule.
- J menu > Delegate a due duty: the list should start with whoever is nearest, with "~30 s" / "~2 min" / "there" notes.

`node tools/test.mjs` (run with the art agent's uncommitted working tree, a random ship each run): run 1 crashed the renderer (out of
memory, three browsers on the box); run 2 failed only `combat: player HP / stagger / knock-down` (the fighter stands 1.4 m from the player
for 12 s without striking, `walk` false, schedule held by the test: grapple.js approach / reach, the same signature as iteration 3's
logs), every `npc walking` check passed (parts 12 and 13 included).

Requests to other owners (iteration 4): js/main.js has uncommitted `dressCrew` hunks from the art agent (import + two call sites); this
iteration committed main.js without them (index built from HEAD + the pathing hunks), so they are still in the working tree for that agent
to commit together with js/actors.js.
