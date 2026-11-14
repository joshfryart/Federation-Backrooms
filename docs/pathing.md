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
