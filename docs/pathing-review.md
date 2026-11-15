# Review of the unproven game hunks in a01da90 (WIP)

Not committed. Evidence runs (2026-11-15), each in a clean worktree of HEAD 1394c0d + the uncommitted `js/main.js` fixes (repair
stand pose, sim depart handoff), with one a01da90 hunk reverted at a time (`git apply -R` of that hunk only):
`node tools/test.mjs --only walk --ship 0 --seed 15`, `node tools/test.mjs --gate`, and for some `node tools/soak-walk.mjs --seed 11`
(USF Nova Scotia, decks 3, 4, 2, 150 s at clock x6). One run per cell; soak runs are chaotic (one change moves every later walk), so
treat soak differences under ~30 % as noise. The gate passed with every hunk reverted (it does not exercise these paths), so it is not
listed per row.

| hunk | what it changes | walk s15 without it | soak s11 without it (with all: see last row) | verdict |
|---|---|---|---|---|
| main.js `walkStep` pass side (~441) | Passing a standing / near-still body (v < 0.15): pass on the side away from them (left if they stand right of the line, else right unless a wall is there) instead of always bearing right. Also drops a no-op `- lat * 0.0`. | OK | stuck 2 (0.8 s) vs 0; walker brushing 28.2 vs 37.7 pair-s; near-lift 25.1 vs 33.3; osc 0 both | **Rework / A-B on more seeds.** Not needed by any failing check. Brushing on seed 11: 660fa96 (before the WIP) 26.1, HEAD 37.7, HEAD without this hunk 28.2: the hunk is the likely source of the WIP's brushing rise. The idea (do not walk into someone standing on your right) is sound; measure on seeds 12 / Manitoba before keeping. |
| main.js lift line spot round a corner (~463) | A walker whose place in the line is out of sight follows that place's own path field (up to 4 steps, furthest tile in sight) instead of the car's field. | **FAIL** `npc lift: held by the player`: `inCar: 1` (Ensign Delacroix, a lift walker with `liftWait` 9, crept back into the held car, 1.2 m from its centre) | not run | **Keep.** This is the lift-held fix: without it the check fails exactly as the hunk's comment describes. |
| main.js `simBodies` haul (~549) | A body on a cart / carry job whose person the sim has sent off the deck (`!o`) now gets the walk to the lift; `js/haul.js` (line 150) drops a job whose walk is replaced. Before, any non-sim walk was left alone, so the hauler kept pushing while the sim had them riding. | OK | `early` 29.2 vs 20.1 body-s, held up by a pushed cart 3.6 vs 1.0 body-s, stacked 1 pair vs 0 | **Keep.** Same class as the `npc bodies vs sim` bug (a body the sim does not list); the soak points the right way, and the logic is checked against haul.js (the job is ended, the cart stays where it is). |
| main.js `carStep` shutT (~1607) | When the doors are about to shut for an arrival (simBodies' 1.6 s `shutT`, nobody boarding, not locked) and someone has started walking up meanwhile, the shut is cancelled: they board first, the arrival comes behind their doors. | OK | identical totals to "all" (the path did not trigger on seed 11) | **Keep (low risk), unproven.** Only reachable inside a 1.6 s window that simBodies already avoids when someone is walking up; no metric moved. Add a walk-test case (player watching the open car, a walker starts within 1.6 s of an arrival) if it is to count as proven. |
| haul.js:163 no shove into the car | A pushed cart never shoves a walker (not a boarder) from outside onto the lift car tile. | OK | identical totals to "all" (no cart reached the lift mouth on seed 11) | **Keep (low risk), unproven.** Guards the "cart shoves the line into a held car" case from the lift-held hunt; it only skips a shove, cannot move anyone. |
| wearglue.js:37 bed distance | `bedNear` uses the remembered `opProp` bed only while the body is within 3.6 m of it (`opProp` outlives the visit). | OK | not run | **Keep (low risk), unproven by a run.** Matches the nearest-bed search radius below it; without it a stale `opProp` can pick a bed the body is nowhere near (no check here reproduces that). |
| wearglue.js:61 no sleep while boarding | Not asleep while standing in the lift car (`e.board`) or while the sim has them in transit. | OK | not run | **Keep.** A boarder whose next block is sleep lay down on their old bunk 10 m away (comment); both conditions only narrow when sleeping starts. |

All hunks in (the working tree): walk s15 OK, gate OK, soak s11: stuck 0, walker brushing 37.7 (near the lift 33.3), lift queue > 15 s 0,
boarders > 10 s 0, teleports in sight 4, pops 0 / 0, far pops 0, `early` 20.1 body-s, 35 cars / 69 people, line max 6 (1 in the line).

Not in the list but also in a01da90's game code: `js/actors.js` `prewarmOutfits` on its own random stream + `__game.warmed` (main.js
~1773) and `js/voice.js` `bark` seeded by a counter instead of the wall clock. Both are test-determinism changes (replays draw the same
lines / random stream), no gameplay effect expected; keep.
