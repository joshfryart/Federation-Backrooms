# Art batch 11: polish and leftovers

Files: `js/propart-polish.js` (29 prop kinds), `js/itemart-polish.js` (10 item kinds + `KW_POLISH` rows), viewer `viewer-polish.html` (`?set=props&g=0..7` four per page (`&per=N`), `?set=items`, `?only=pool_table,arcade`, `?spin=0`, `?cam=x,y,z,tx,ty,tz`, `?person=0`). No existing file was edited: the integrator hooks it up (section 4). Build order, ids and the other batches: `docs/asset-gaps.md` section 12; integration pattern of batches 1-4: `docs/propart-integration.md`.

Contract (same as batches 1-4): `export const kinds = { name: (m, h) => THREE.Group }` (`m`, `h` ignored, the module owns its materials), origin at the floor centre of a 2.5 m tile, +z = front (where people stand or sit), one merged mesh per material, `userData`: `top` (climbable height), `box` `[x0, x1, z0, z1]`, `spots` `[[x, z, ry]]` (`ry = PI` faces -z, i.e. toward the prop from its front), `use` (named points), `seat` (`{x,y,z,yaw}` pelvis point for seated props, as batch 1; `propart.js` converts it to `seat` + `seatPoint`), `size` `[x, y, z]`, `tris`, `name`, `dept`. All props are at most 2,500 triangles (limit 3,000). Textures are canvas patterns with no text (diamond plate, grating, felt, arcade marquee and screen, scan-arch LCD, hazard tape), shared per module.

## 1. Props

Dims are width (x) x height x depth (z) in metres. "Wall" = placed against a wall with `ringPut` (back to the wall, +z into the room).

| kind | id | dims | tris | top | use points / spots | suggested placement | equipment mapping |
|---|---|---|---|---|---|---|---|
| `briefing_table` | CMD-2 | 2.4 x 0.74 x 1.1 oval, two steel pedestals, cable hatch, display strips | 1108 | 0.74 | 8 standing/seated spots round it (+z side, -z side, both ends) | `readyroom` 3x3: centre tile, long axis x, beside the desk | new entry `briefing` reusing `table` (stance sit; spots from `userData.spots`); room `readyroom` in `ROOM_SPACES` already has the inventory row |
| `platform_bed` | CMD-3 | 1.4 x 0.95 x 2.1, mattress top 0.55, two drawers at the foot (+z), padded headboard at -z | 344 | 0.55 | `use.sleep` (0, 0.55, -0.1); spots at both sides (ry +-PI/2); `use.drawers` at the foot | `quarters`, replaces the two-tier `bunk` for co / xo / senior billets, headboard against the wall | `bunk` script with `seat: 0.55`; K-1 lying pose lands on `use.sleep` |
| `workpod` | FLT-8 | 1.6 x 1.8 x 2.2, single seat bubble canopy, two folded manipulators at the nose (+z), skids, rear thruster pack | 2436 | none | `use.hatch` (0, 1.6), `use.service` behind | `shuttlebay`, wall or interior tile, nose toward the bay door; one per bay beside the existing `shuttle` | alias `shuttle` for deck / pilot spots; examine text "work bee" |
| `maint_stand` | FLT-9 | 1.2 x 1.75 platform (rails to 2.7) x 1.8 incl. stair, castors, yellow rails | 832 | none | `use.stairFoot` (0, 1.2), `use.platform` (0, 1.75, -0.3); box covers the stair | `shuttlebay` beside the shuttle / pod | `deck.*` maintenance script (`workbench` standing spot at `stairFoot`) |
| `cargo_pad` | OPS-8 | 2.3 x 0.12 x 2.3 square, diamond plate, emitter grid, yellow edge band, two chocks | 320 | 0.12 | `use.stage` (centre), spot at +z edge | `transporter` (second pad next to the personnel `pad`), `cargo` by the door | `pad` entry gets `cargo_pad` in `props` for `cargo.stage_transfer` / `ttech`; keep the personnel pad for the beam-out script |
| `warpcore_detail` | ENG-13 | add-on, same origin as `warpcore`: 12 clamp rings up the 3.2 m column, four injector nozzle housings with trim wheel and green feed line at y 1.55 | 2464 | none | `use.injector[0..3]` ring points (r 1.25, y 1.55) for `reactor.core_rounds` | add as a child of every `warpcore` (batch-1 `reactorstation` already faces it) | no new entry: `SYSTEMS.reactor` host stays `warpcore`; use points are an optional work-spot list |
| `injector_crate` | ENG-13 | 0.9 x 0.42 x 0.52, spare plasma injector in an open slatted crate | 716 | 0.42 | spot at +z | `stores`, `engineering` wall; clutter-like | `crate` script (alias) |
| `knee_mill` | ENG-14 | 1.5 x 1.95 x 1.4 (table travel included) | 1140 | none | spots in front (0, 0.55), (0.6, 0.5); `use.table` | `workshop` interior tile, one per shop, cycle with `lathe` | alias `lathe` (standing, hold) |
| `drill_press` | ENG-14 | 0.4 x 1.7 x 0.7 | 784 | none | spot (0, 0.55); `use.chuck` | `workshop` on the wall | alias `lathe` |
| `scan_arch` | SEC-6 | 1.1 x 2.2 x 0.6 portal, opening 0.7 x 2.0, lamp columns, lintel display | 408 | none | `use.pass` (0, 0.9), `use.guard` (0.9, 0.5, -PI/2); box is 1.3 x 0.84 so the opening stays walkable (collision: treat as two uprights if the integrator can, else ring-place it in a doorway-free wall segment) | `brig` entrance, `cargo` door | `console` alias for `guard`; examine "scanner arch" |
| `specimen_tank` | SCI-9 | 1.04 x 1.34 x 0.5 (filter box on +x side), aquarium on a 0.8 m stand, translucent water, plants, lid light | 988 | none | spot (0, 0.6); `use.view`, `use.feed` | `lab` and `arboretum` on the wall (up to two) | `labbench` alias (standing) |
| `mat` | SVC-11 | 1.0 x 0.04 x 2.0, four tiles in two colours | 108 | 0.04 | spots (0, 0, PI) and (0, 0.3, 0) | `gym` interior tile (long axis z) | `EQUIPMENT.mat.props` = `['mat', 'sparring_set']` (was `weightbench`, `treadmill`); box `[-0.5, 0.5, -1, 1]` |
| `grapple_dummy` | SVC-11 | 0.6 x 1.74 x 0.6 weighted base, padded post, torso, arms | 856 | none | spot (0, 0.75) | `gym` wall; `armory` | `mat` script (stretch/reach steps still read as drills) |
| `sparring_set` | SVC-11 | mat 1.0 x 2.0 with the dummy at the -z end | 964 | 0.04 | spots on the mat, `use.dummy` | `gym` (use instead of two props) | as `mat` |
| `galley_trolley` | SVC-14 | 0.6 x 1.6 x 0.95 (with push bar at +z, y 1.16), ten tray runners, four trays | 844 | none | `use.push`, `use.handle` (0, 0.5, y 1.16) | `mess` wall; or as a cart: see section 3 | `HAULERS.galley` cart (section 3) |
| `dryer` | SVC-15 | 0.9 x 2.3 (duct) x 1.0 | 1048 | none | spot (0, 0.8); `use.door`, `use.controls` | `laundry` next to the `washer` | `washer` alias |
| `folding_table` | SVC-15 | 1.8 x 0.9 x 0.8, linen stacks on top and shelf | 480 | 0.9 | three spots on +z, `use.fold` | `laundry` | `table` alias; the `fold_cloth` step plays at `use.fold` |
| `linen_cart` | SVC-15 | 0.6 x 0.95 x 0.9 canvas bag on an X-frame | 772 | none | spot (0, 0.8); `use.load` | `laundry` corner; `mess` | prop only; a cart variant is optional |
| `pool_table` | SVC-16 | 2.1 x 0.8 x 1.2, six pockets, 15 balls racked, cue ball, a cue, chalk | 1388 | 0.8 | spots on all sides, `use.cue` | `lounge` interior (2x2 tiles of room) in place of the mess table pattern | `table` alias (stance stand, hold `glass` or a cue later) |
| `card_table` | SVC-16 | 1.2 hexagon, 0.74, felt inset, cup holders, cards, chip stacks | 1372 | 0.74 | six seat spots | `lounge`, `mess` corner | `table` (sit) |
| `arcade` | SVC-16 | 0.7 x 1.7 x 0.8 cabinet, angled screen, marquee, two sticks and six buttons, coin door | 604 | none | spots (0, 0.85), (+-0.2, 0.85); `use.play1`, `use.play2` | `lounge` wall | `console` alias (standing) |
| `feedstock_silo` | SVC-17 | 1.6 x 1.6 x 1.2, two 0.7 m silos on legs, level gauges, hoppers, feed lines into the -z wall | 1348 | none | spots in front of each, `use.hopper1/2`, `use.gauge1/2` | `mess` galley wall, `stores` wall | `tank` alias (standing, `rep.feedstock_count`) |
| `exercise_bike` | SVC-18 | 0.5 x 1.3 x 1.1 | 904 | none | `seat {y 0.98, z 0.32}`, spot (0, -0.09, PI), `use.mount` | `gym` | `weightbench`-like entry with `seat: 0.98`, clip `sitting_idle` + legs |
| `rower` | SVC-18 | 0.6 x 0.95 x 2.45 (flywheel cage at -z, seat on the rail at +z) | 900 | none | `seat {y 0.4, z 0.7}`, spot (0, 0.29, PI) | `gym` (long axis z) | as above, `seat: 0.4` |
| `dumbbell_rack` | SVC-18 | 1.2 x 0.8 x 0.5, three tiers, 18 dumbbells in three sizes | 1572 | 0.8 | spot (0, 0.7, PI), `use.take` | `gym` wall | `weightbench` alias (stand) |
| `airlock_doors` | R-2 | fixture 2.5 x 3.2 x 1.7: two 1.0 x 2.0 doors 1.5 m apart, chamber walls, hazard floor, gauge and lamps. `userData.doors` = [inner, outer] nodes; `doors[i].position.x = userData.slide * open` (0..1) | 1316 | none | `use.inner` (0, 1.3), `use.outer` (0, -1.3), `use.chamber` | `airlock` room centre, long axis z, with the doors facing the room's doorway | `suitrack` stays; door script sets `open` while a crew member passes |
| `bay_door` | R-3 | wall fixture 5.2 x 3.2 x 0.3 (spans two tiles; origin on the wall line, +z into the room): two segmented leaves, hazard edging, field-emitter posts, 12-lamp status bar, side panel | 1048 | none | `use.panel` (right of the door) | `shuttlebay`, the wall opposite the entrance, behind the shuttle | decor pass (like `holo_emitter`): add to `PROP_ART_FIXTURES` |
| `catwalk` | R-4 | 2.5 x 3.7 x 1.0: grated deck at 2.6 m on four posts, 1.1 m rails both sides, mid bar, toe board | 432 | none | `use.deck` (y 2.6) | needs rooms taller than 3.2 m (`TODO.md:97`); tile along x; `engineering`, `cargo`, `datacore` once heights exist | none until multi-level rooms exist |
| `ship_ladder` | R-4 | 0.6 x 3.6 x 3.1 at 60 degrees, to the catwalk edge | 192 | none | `use.foot` (0, run + 0.4), `use.top` | at a catwalk end | none |

Notes
* Biggest props: `warpcore_detail` 2,464 and `workpod` 2,436 triangles (as heavy as `surgical_table` in batch 4); everything else is under 1,600.
* `briefing_table`, `cargo_pad`, `maint_stand` and the other wide props exceed the 0.9 m half-square: `propart.js` grows the collision box up to 1.15 m from the tile centre. `bay_door` (5.2 m) and `catwalk`/`ship_ladder` ignore tile boxes: they are fixtures.
* Seated spots follow batch 1: pelvis point in `seat`, root point `z - 0.41` in `spots`.
* The `top` of `briefing_table`, `folding_table`, `pool_table`, `card_table`, `dumbbell_rack`, `mat`, `cargo_pad`, `platform_bed`, `injector_crate` is climbable; nothing else sets `top`.

## 2. Items (`js/itemart-polish.js`)

`DEFS_POLISH` rows in the `js/itemart.js` format (`build(g, M, o)`, `base`, `lie`), 500 triangles or less each, `KW_POLISH` rows (must go before the generic `KW`). `buildPolishItem(kind, opts)` is a stand-alone `buildItem` for the viewer.

| kind | id | size (m) | tris | frame | keywords |
|---|---|---|---|---|---|
| `tether` | FLT-7 | 0.22 x 0.15 x 0.20 coiled lanyard, shock pack, two hooks | 480 | base | tether, lanyard, fall arrest, lifeline |
| `headset` | OPS-7 | 0.27 x 0.20 x 0.16 band, ear cup, boom | 396 | base (standing on the cup) | headset, boom mic |
| `light_panel` | ENG-12 | 0.68 x 0.05 x 0.37 (0.6 x 0.3 panel with clips and pigtail) | 260 | base, two-handed flat | light panel, troffer |
| `injector_spare` | ENG-13 | 0.62 x 0.30 x 0.30 in a slatted crate | 492 | base, two-handed | plasma injector, constrictor coil segment |
| `stool` | X-2 | 0.31 x 0.46 round seat, three legs | 384 | base | stool, step stool |
| `lamp` | X-2 | 0.41 x 0.46 articulated lamp | 368 | base | desk / bench lamp |
| `meter` | X-2 | 0.17 x 0.04 x 0.21 handset and probe | 260 | base | multimeter, hand meter, soil meter, tester |
| `snips` | X-2 | 0.08 x 0.19 scissors / shears | 272 | grip (tips +y), `lie` | scissors, shears, snips |
| `tape` | X-2 | 0.14 x 0.05 x 0.11 roll | 244 | base | tape |
| `frame` | X-2 | 0.18 x 0.13 stand-up frame | 80 | base | photo frame, framed photo, model ship |

Integrator snippet for `js/itemart.js` (same as batches 2 and 4):
```js
import { DEFS_POLISH, KW_POLISH } from './itemart-polish.js';
Object.assign(DEFS, DEFS_POLISH);          // next to DEFS_GALLEY / DEFS_MEDICAL
KW.unshift(...KW_POLISH);                  // before the generic rows
```
In `js/equipment.js` `ITEMS` (carried): `tether`, `headset`, `light_panel` (`two: true`, `pose: 'tray'`, 1.5 kg), `injector_spare` (`two: true`, 6 kg), model = kind. `env.lighting_round` can then carry `light_panel`; `pilot.bay_pressure_check` shows `tether` at the shuttlebay `crate`. W-8 (headset worn) reuses `buildPolishItem('headset')` pinned to the head bone, boom to the left.

## 3. Cart and equipment hooks (for the integrator, nothing edited here)

* `galley_trolley` is built as a floor prop. To make `HAULERS.galley` push it instead of the olive `cargo` cart, a `cartart.js` builder can return the same group and map the contract of `makeCart` (`js/carry.js:118`): the push point is `userData.use.push` (0, 0.5, y 1.16 above the floor), the trolley's rolling footprint is 0.6 x 0.8 (`box`).
* New `EQUIPMENT` entries needed so `tools/test-equipment.mjs` stays green: one per placed kind (`briefing_table`, `platform_bed`, `workpod`, `maint_stand`, `cargo_pad`, `knee_mill`, `drill_press`, `scan_arch`, `specimen_tank`, `mat` (existing), `grapple_dummy`, `dryer`, `folding_table`, `pool_table`, `card_table`, `arcade`, `feedstock_silo`, `exercise_bike`, `rower`, `dumbbell_rack`, `airlock_doors`). Reuse the scripts in the "equipment mapping" column; spot lists from `userData.spots`.
* Registry: add `import { kinds as POLISH } from './propart-polish.js'` to `js/propart.js`, `PROP_ART = {..., ...POLISH}`, `PROP_BATCH` row `[POLISH, 'polish']`; `PROP_ART_FIXTURES` += `bay_door`, `catwalk`, `ship_ladder`, `airlock_doors` (not tile props); `NO_CLIMB` need no change; `BOX` not needed (`box` is given).
* Room placement (`js/gen.js`): readyroom `briefing_table`; quarters (senior) `platform_bed`; shuttlebay `workpod`, `maint_stand`, `bay_door`; transporter / cargo `cargo_pad`; workshop `knee_mill`, `drill_press`; brig / cargo `scan_arch`; lab `specimen_tank`; gym `sparring_set` (or `mat` + `grapple_dummy`), `exercise_bike`, `rower`, `dumbbell_rack`; laundry `dryer`, `folding_table`, `linen_cart`; lounge `pool_table`, `card_table`, `arcade`; mess / stores `feedstock_silo`, `galley_trolley`; airlock `airlock_doors`; every engineering `warpcore` gets a `warpcore_detail` child.

## 4. Not covered here (left over from batch 11) and not assigned elsewhere

Asset-gaps ids that need other file types or the rig; sections 1 to 11 were checked against the batch plan and every other id is in batches 1 to 10.
* **Wearables**: W-5 lab coat, W-6 hazmat suit and hood (`js/wearables.js`, `bindSurface` / `pinToBone`).
* **Clips**: K-2 eating, K-3 exercise variety (push-up, squat, guard shuffle), K-5 two-person stretcher carry (rig clips and `js/movement.js` / `js/haul.js` link rule).
* **Creatures**: C-1 gronk skinned mesh or polish, C-2 crazed crew clips, C-3 slimeling reveal, C-4 corpse poses (`js/enemies.js`, `js/actors.js`, `tools/build-characters.mjs`).
* **Done in batch 4 already**: MED-11 drawer tray with shrouded body (`morgue_tray` in `js/propart-medical.js`), so it is not rebuilt here.
* **Cart-style SVC-15 linen cart and SVC-14 trolley** exist as props; the `makeCart` variants (`js/cartart.js`) are a hook-up task.
* **Not art** (sections 11.8 and 11.9): the layout gaps (rooms that place no desk / workbench for scripted spots) and the 54 inventory spaces with no room type.
* **Structure still missing for R-4**: taller rooms and a walkable second level; the `catwalk` and `ship_ladder` pieces are only useful once `js/world.js` can raise the ceiling.

## 5. Verification

Built and rendered in `viewer-polish.html` with swiftshader (screenshots reviewed, geometry fixed after the first pass). Triangle counts are measured from the built groups (`userData.tris`), not estimated. `tools/test.mjs` and the full suite were not run (shared machine).
