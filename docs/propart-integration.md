# Art batches 1-4 in the game (integration notes)

Batches: `docs/propart-stations1.md` (station consoles I), `docs/propart-galley.md` (galley and lounge), `docs/propart-plant.md` (plant and engineering hardware, open junction), `docs/propart-medical.md` (sickbay and morgue). Build order and the remaining batches 5-11: `docs/asset-gaps.md` section 12.

## What is wired up

**Registry.** `js/propart.js` imports the four `kinds` tables into `PROP_ART` and exports `buildPropArt(kind, m, h)`. `buildProp`'s `default:` branch (`js/world.js`) asks it first. It normalises `userData` across the batches:
* `top`: climbable surface, deleted for props with something overhead or a pole/chair top (`range` hood, `surgical_table` lamp, `autopsy_table` scale post, `infusion_stand`, `scrubber` and `fabricator` (2 m tall), chairs, stools, back bar).
* `box`: footprint `[x0, x1, z0, z1]`; filled from a table in `propart.js` where a batch gave only `size` (plant, medical, stations).
* `spots`: EQUIPMENT-style `[[x, z, ry]]`; the medical batch's named `{pos, ry}` table moves to `use` and the array is derived from it.
* `seat`: a number (the stations' `{x, y, z, yaw}` seat point moves to `seatPoint`).

**Collision.** `World.propBox(tx, ty)` returns a prop tile's collision box. A prop whose `userData.box` (rotated with the prop) is wider than the old 0.9 m half-square grows the box, up to 1.15 m from the tile centre (never shrinks it). `resolve`, `raycast` and `groundAt` use it. Wall faces with a prop tile in front of them get `deco = true`, so no wall fixture, search site or junction ends up hidden behind a wall-placed prop.

**`PROP_KINDS`** adds the 24 floor props that gen.js places. `PROP_GALLERY` = `PROP_KINDS` + every other art kind (chairs, stools, `barback`, `bar_plain`, `range_bare`, wall/ceiling pieces, `morgue_tray`). `models.html?set=props` shows `PROP_GALLERY` (`&only=helm,bar`).

**Wall kits.** `DECOR_ENG` is merged into `DECOR`. Pools: plant `foamstation`, `hosecab`, `panelbox`; engineering `panelopen`, `hosecab`; workshop and corridor `panelbox`. A `foamstation` under a low ceiling becomes a `ventgrille`, like the pipes rule. Sickbay's pool lists `gas_panel` (twice) and `stretcher_rack`. These are PROP_ART fixtures, so the decor pass builds them one mesh each, with the origin on the wall line and +z into the room. Each sickbay also gets up to four `holo_emitter` pods on the ceiling over open tiles where the ceiling is full height.

**Items.** `js/itemart.js` spreads `DEFS_GALLEY` and `DEFS_MEDICAL` into `DEFS` and puts `KW_MEDICAL`, then `KW_GALLEY`, in front of `KW`. `ITEMS` (`js/equipment.js`) gains `ladle`, `stockpot`, `fryingpan`, `stretcher` (6 kg, `two: true`, `pose: 'tray'`), `iv_bag`, `kidney_dish`, `bandage` and `forceps`, with ids equal to the model kinds. `makeItemMesh` (`js/carry.js`) also honours an optional `ITEMS[id].model`.

**Desk chair.** The old `desk` prop now has a task chair child named `'chair'` at the seat (pelvis z 0.77), and `userData.seat = 0.48`.

**Morgue tray, back bar.** The first `drawers` in each morgue gets a `morgue_tray` child (one drawer pulled out 0.75 m). A `bar` placed against a wall (`p.wall`) gets a `barback` child at local z -0.98, between the bar and the wall, and its collision box runs to the wall.

## Room placements (`js/gen.js`)
Props now draw from their own random stream (`prnd`, seeded from the level seed). Their rolls no longer move the main stream that picks tubes, chips, the exit and the gorn. **Every seed's layout is therefore different from before this change**: props, chips, the exit and tubes all moved.

New helpers:
* `safePut(r, x, y, kind)`: blocks a tile only when three things stay true. Every open tile of the room that a doorway reached still reaches it. No doorway tile and not the start tile is blocked. Every prop in the room that had a walkable side keeps one.
* `ringPut(r, kind, o)`: puts a prop on the room's edge ring against the wall (rooms used to have props on interior tiles only). Doorway tiles are never used, and corners only with `o.corner`. The prop gets `wall: true` and `front`. `o.face`: `'in'` (+z into the room) or `'out'` (+z toward the wall, so the operator stands behind it looking into the room). `o.door` prefers a tile two steps from a doorway. The tile in front of the prop is reserved.
* Exit / lift car: never in a room now. Wall props can leave dead-end pockets inside rooms, and the madness-mode fallback used to pick one of those as the lift.

| room | placed |
|---|---|
| bridge | `helm` at the forward port (front row, left), facing the viewscreen. The old console stays forward starboard. Chair and consoles face the viewscreen (rot 0). `hardwareSites` (`js/crew.js`) counts the helm as a console for `console@bridge` hosts: the console comes first, so `alert` gets the console and `helm` gets the helm station. Without that, the helm system lost its bridge host. |
| engineering | `reactorstation` next to the core, back to it (operator looks over it at the core). `fieldgen` + `fieldgen_damp` on interior tiles two or more steps from the core, both ends of the 2.2 m axis kept clear (reserved). In rooms with 15+ interior tiles: a `desk` and a `workbench` (asset-gaps 11.8). |
| shuttlebay | `baycontrol` on the wall two tiles from a door; a `workbench` on the wall (11.8) |
| transporter | `beampedestal` on the wall facing out (operator between it and the wall, looking over it at the pad); a `workbench` (11.8) |
| holodeck | `holodesk` on the wall |
| brig | `secdesk` on the wall near the entrance (doubles as the 11.8 desk) |
| sickbay | 5x5 rooms (3x3 interior): centre biobed with biobeds on both sides, `nursestation` behind the centre bed facing it, `surgical_table`, `exam_couch`, `steriliser`, `med_dispenser` in the corners, one side of the centre left open; `infusion_stand` on the wall or in a corner. Smaller rooms: the old biobeds, `nursestation` on the wall, plus `exam_couch` and `med_dispenser` on the wall when the room has more than one interior tile. |
| morgue | `autopsy_table` at the centre, `drawers` on the wall (the first one gets the tray) |
| mess | `range` on the wall, `servery` on the tile in front of it with the same rotation (staff side toward the range); a 3x3 mess puts the servery on the wall instead and keeps its table. `dishwasher` on another wall (more than one interior tile); `wastebin` in a corner of big galleys. Tables and the serving-line replicators fill the rest through `safePut`. |
| lounge | `bar` + back bar on one wall; the sofa/table/chair pattern fills the rest through `safePut` |
| plant | interior tiles on a diagonal grid cycle `pumpskid, heatexch, scrubber, tank, console`. Pump skid and exchanger keep their long axis on x. A one-tile interior always gets one. |
| workshop | lathe / `fabricator` / workbench pattern; at least one fabricator per shop (a workbench is converted, or one goes on the wall) |
| quarters, armory, stores, cargo | 11.8: quarters `desk` on the wall; armory `desk` + `workbench`; stores `desk`; cargo `console` + `workbench` by the door |

Measured over 320 to 360 levels (`tools/test.mjs` `room props:`): no unreachable chip, exit or wall prop, and no lift in a room. Every big sickbay has the full medical set. Over 360 levels: bridge helm 26/26, engineering station and both generators 115/115, lounge bar 39/39, mess range 31/32 and servery 28/32, sickbay nurses' station 39/49, transporter pedestal 240/284, quarters desk 155/191, plant pump skid / exchanger / scrubber 67 / 62 / 86 of 141. The ring pass skips a room when it cannot keep the room connected.

## Equipment (`js/equipment.js`)
* One entry per placed kind, since `tools/test-equipment.mjs` requires it. Each reuses a script: seated stations take `desk`, `baycontrol` takes `console`, the plant props take `tank`, `fabricator` takes `lathe`, the surgical, exam and autopsy tables take `biobed`, and `med_dispenser` takes `replicator`. Spots and boxes come from the batch docs.
* Spot lists:
  * `console`: + `baycontrol`, `beampedestal`, `holodesk`, `secdesk`, `nursestation` (console users in the holodeck, brig and sickbay had no console).
  * `desk`: + `helm`, `secdesk`, `nursestation`, `holodesk`, `reactorstation`.
  * `replicator`: + `med_dispenser`, `fabricator`.
  * `workbench`: + `labbench` (11.8 lab alias), `steriliser`.
  * `biobed`: + `surgical_table`, `exam_couch`, `autopsy_table`.
  * `tank`: + the five plant props.
  * `sinkunit`: + `dishwasher`.
* The stand-ins now point at the real props: `bar` (props `['bar']`, seat 0.75, the three stool spots, hold `glass`), `counter` (`['servery']`, staff-side spots), `stove` (`['range']`, cook spot, step 1 holds the `ladle`). `mat` stays a stand-in: no mat prop exists until batch 11 (SVC-11).
* `standPoint(def, prop, from)` reads an optional `prop.kind`. With it, the spot's script uses that prop's own spots and box. A standing script at a seated station uses its `standSpots` (beside the chair). A seated one at a different seat height lifts the body by the difference (`y`), so `haul.js`'s seat drop lands the pelvis on the real seat. Without `kind` it behaves as before (the spot's own spots).

## Open junction (`js/sysview.js`)
`makeJunction` now builds the ENG-2 cabinet (`makeJunctionOpen`, closed: `open = 0`) with the system's insert module. It returns `{ group, lamp, door, insert }`. The status lamp is moved onto the door's outside face, so it stays visible with the door shut and swings with the door; `setLamp` is unchanged. `setJunctionDoor(j, t)` swings the door. The old flat panel is kept as `makeJunctionPlain`. Since d81dac1, main.js eases the door open while the player or a crew member works at that junction (request 2 below), and it is shut the rest of the time.

## Examine text
`tools/build-game-items.mjs` `PROP` gains keyword rows for the 24 new kinds, and `assets/data/ship-items.json` is rebuilt (only `examine` changed). Fixes: `tank` no longer matches `pump`, so in the plant room the pumps now name the `pumpskid` and `tank` reads "potable water tank" and similar. `tree` no longer matches "Plant control console" or the space nameplate. `exam_couch` and some generator rows have no matching inventory row (examine shows nothing there, as before for unmatched kinds).

## Deviations from the batch docs
* Doc said `range`/`dishwasher`/`bar` go "against a wall": props never stood on the edge ring before; `ringPut` is new and checks connectivity per placement.
* Bar: the back bar is a child of the bar 0.98 m behind it (against the wall) instead of a separate prop 1.3 m behind it. A separate prop would need its own tile on the ring and leave the bar floating mid-room.
* Barstools are not scattered: each would block a whole 2.5 m tile.
* Sickbay "one of each in rooms of 5 tiles or more": 5x5 rooms get a fixed 3x3 arrangement (two biobeds kept so `sickbay` and `emh` both find a biobed host); smaller rooms get the nurses' station and, where possible, couch and dispenser on the walls. `surgical_table` and `steriliser` only appear in 5x5 sickbays.
* `infusion_stand` is placed as a floor prop (it blocks a tile) instead of standing next to a bed.
* `holo_emitter` is placed by the world decor pass (four per sickbay), not by gen.js.
* SYSTEMS hosts (`coolant` -> `pumpskid`, `life` -> `scrubber`, `gravity`/`dampers` -> `fieldgen*`) are **not** moved: it changes `crew.js` hosts, `HOST_LABEL`, `WORK_SPOTS` in main.js and the repair-point count the parkour test relies on; see request 3.
* `stretcher_rack` is decoration only: taking the stretcher from it needs a main.js interaction (request 4). `ITEMS.stretcher` exists and carries with both hands.
* Plant layout: a diagonal grid instead of `(x + y) % 3` (the doc's pattern left most plant rooms with one prop and the heat exchanger and scrubber in fewer than a quarter of them).

## Requests to the main.js / haul.js owner
Requests 1 and 2 were done by the main.js owner in d81dac1; 3-5 are open.

1. **(done) Per-prop use points** (`js/haul.js` `opStart`, the `standPoint` call): pass the prop kind:
   ```js
   goal = standPoint(def, { cx, cz, rot: p.rot || 0, kind: p.kind }, { x: e.x, z: e.z }, ...);
   ```
   Before this change, console users at the bay control / pedestal / holo desk use the generic console spots (close but not exact; at seated stations one spot is in the chair). Diners at a desk-kind station sit at the desk spot `[0, 0.36]` instead of the station's own spot.
2. **(done) Junction door while repairing** (`js/main.js` `placeRepairPoints` and the per-frame lamp loop):
   ```js
   import { makeJunction, setLamp, makeBeacon, setJunctionDoor } from './sysview.js';
   // in placeRepairPoints, after makeJunction: keep the door on the point
   pt = { ..., obj: j.group, lamp: j.lamp, door: j.door, open: 0, ... };
   // in the loop that calls setLamp(r.lamp, st, t): ease toward open while the player or a crew member works at this point
   if (r.door) { const want = (repairing === r || r.crewWork) ? 1 : 0; r.open += (want - r.open) * Math.min(1, dt * 3); setJunctionDoor(r, r.open); }
   ```
   The door sticks 0.6 m out of the wall when open; keep it shut otherwise (corridors).
3. **System hosts on the new hardware** (optional): `crew.js` `SYSTEMS` `coolant` host `'pumpskid@plant'`, `life` `'scrubber'`, `gravity` `'fieldgen'`, `dampers` `'fieldgen_damp'`. Add them to `HOST_LABEL` (`pumpskid: 'coolant pumps', scrubber: 'CO2 scrubbers', fieldgen: 'graviton generator', fieldgen_damp: 'damper field generator'`) and to `WORK_SPOTS` in main.js. A deck without the prop keeps the junction (`hardwareSites` falls back). Check the parkour repair-point count afterwards.
4. **Stretcher bracket**: an E-interaction on `stretcher_rack` wall pieces, which carry `userData.item = 'stretcher'`. It gives `ITEMS.stretcher` and hides the folded stretcher children of the bracket. Those are the children with y 0.6-1.8 and z about 0.13; see `docs/propart-medical.md`.
5. **Path tests**: every seed's layout changed (new props, wall-placed props on room edge rings, and the props' own random stream moves chips, exit and tubes). `tools/test-walk.mjs` / `tools/soak-walk.mjs` expectations that depend on a particular seed's layout may need re-baselining; room edge rings are narrower in rooms with wall props.

## Open issues / needs a human eye
* Seat heights and offsets are from the batch docs; the `sitting_idle` clip was not checked at the new stations, the bar stools (0.75) or the desk chair.
* Wall-placed props stand flush with the 2.5 m tile edge: big ones (bar 2.2 m, dishwasher 2.15 m, servery 2.2 m) nearly touch the neighbouring ring tiles' props when two are side by side.
* The pedestal faces the wall in the beam room by design (the chief looks over it at the pad); check that reads right.
* Triangle counts (measured by `tools/test.mjs` `props:`): the galley props are the heaviest. Dishwasher about 6,600 (plate racks), back bar 6,400 (34 bottles), range 4,900 and bar 4,500 (three stools). Surgical table about 2,500, reactor station about 1,900, fieldgen about 1,930. A lounge (bar + back bar, about 11k) and a big sickbay (several 1,000-2,500 tri props plus four emitters) are the heaviest rooms; trim the galley bottles and plates first if they draw slowly.
* `fieldgen` / `fieldgen_damp` sit in every engineering room (the doc asked for the damper only in rooms of 4+ interior tiles; every engineering room has 9+).

# Batches 5-11

Batches: `docs/propart-sciences.md` (5), `docs/propart-flight.md` (6), `docs/propart-stations2.md` (7), `docs/propart-security.md` (8), `docs/wearart.md` (9), `docs/signart.md` (10), `docs/propart-polish.md` (11).

## Registry, items, examine text
* **`js/propart.js`** imports the `kinds` of `propart-sciences`, `-flight`, `-stations2`, `-security` and `-polish` into `PROP_ART` / `PROP_BATCH`. Normalisation as before; new: every `box` is clamped to the tile (+-1.25 m; the fuel bowser's tow bar reached 1.4). `NO_CLIMB` += growbed, nutrient_tanks, charttable, spectrometer, samplefridge, fumehood, fuelbowser, hoversled, reachin_cooler, navstation, opsstation, commsstation, relayrack, buffertank, chargerack, cellfield, issuecounter, shuttle_cradle. `PROP_ART_FIXTURES` += coldstore_door, bay_door (wall pieces), padmark, shuttle_cradle (children of the shuttle), warpcore_detail (child of the core), catwalk, ship_ladder (not placed).
* **`PROP_KINDS`** (`js/world.js`) += the 46 placed kinds (list there). `models.html?set=props` shows them through `PROP_GALLERY` (119 kinds); the new DECOR kits show in the decor set.
* **Wall kits**: `DECOR_BRIDGE` (sysboard, sysboard_half) and `DECOR_SEC` (dclocker, emitterpost, camdome, badgereader) merged into `DECOR`. Pools: corridor + dclocker, camdome, badgereader; brig + emitterpost, camdome, badgereader; armory + camdome; engineering, plant + dclocker; stores + dclocker, coldstore_door (PROP_ART wall piece). camdome, coldstore_door and emitterpost become a vent grille under a low ceiling.
* **Items** (`js/itemart.js`): `DEFS` += `DEFS_SCIENCES`, `DEFS_FLIGHT`, `DEFS_STATIONS2`, `DEFS_SECURITY`, `DEFS_WEAR` (without its `headset`: batch 11's headset is kept, one kind per id), `DEFS_POLISH`. KW order: medical, galley, three override rows (trauma/rib/pinking shears, scissors, snips -> `snips`; ratchet spanners, crimping tool -> `wrench`; scrub brush -> `smallbox`), security, flight, stations2, sciences, wear (minus headset), polish (minus meter), the tricorder row, polish `meter`, then the generic rows. Checked against `ship-items.json`: about 500 clutter names now get batch models (gloves 101, tape 77, meter 39, tether 24, stool 22, lamp 22, cuffs 19 ...).
* **`ITEMS`** (`js/equipment.js`), ids = model kinds: soil_meter, pruning_shears, harvest_tote (two-handed), wheel_chocks, tiedown_strap, ratchet_strap, tag_scanner, coil_cartridge (two), patch_plate (two), pipe_clamp (tool 1.08), seal_gauge, breather, cuffs, tether, headset, light_panel (two, tray pose), injector_spare (two, 6 kg). The clutter-only kinds (stool, lamp, meter, snips, tape, frame, folded wear) have no `ITEMS` row. Hooks from the docs: the `tree` script holds `pruning_shears`, the `crate` script scans with `tag_scanner`, `HAULERS.bot.carry = 'harvest_tote'`.
* **Examine text**: `tools/build-game-items.mjs` `PROP` += a row per new kind; `assets/data/ship-items.json` rebuilt (only `examine` changed).

## Equipment (`js/equipment.js`)
One entry per placed kind (second block after the batch 1-4 one), reusing scripts: seated `sensorstation`, `opsstation`, `commsstation` -> `desk` (seat 0.48, spot `[0, 0.31, PI]`, standSpots); `charttable`, `navstation`, `plottable`, `issuecounter`, `scan_arch`, `arcade`, `briefing_table`, `pool_table`, `card_table` -> `console` (standing; the last four with their own steps); `growbed` -> `tree`; `nutrient_tanks`, `buffertank`, `feedstock_silo` -> `tank`; `spectrometer`, `fumehood`, `specimen_tank` -> `labbench`; `samplefridge`, `reachin_cooler` -> `locker`; `fuelbowser`, `hoversled`, `galley_trolley`, `linen_cart` -> `cart`; `pallet`, `pallet_loaded`, `injector_crate` -> `crate`; `relayrack` -> `servers`; `cellfield` -> `cell`; `chargerack` -> `weaponrack`; `platform_bed` -> `bunk` (seat 0.55, side spots); `workpod` -> `shuttle`; `maint_stand` -> `workbench`; `cargo_pad` -> `pad`; `knee_mill`, `drill_press` -> `lathe`; `dryer`, `folding_table` -> `washer`; `grapple_dummy`, `sparring_set`, `dumbbell_rack` -> `mat`; `exercise_bike` (seat 0.98), `rower` (0.4) a small seated "ride" script; `airlock_doors` -> `suitrack`.
`mat` is no longer a stand-in: props `['mat', 'sparring_set', 'grapple_dummy']`, box `[-0.5, 0.5, -1, 1]`. The old spot lists also reach the new kinds: console += charttable, navstation, plottable, issuecounter; desk += the three seated stations; labbench / workbench += spectrometer, fumehood (labbench also specimen_tank); tank, servers, tree, crate, cart, cell, weaponrack, lathe, washer, bunk, locker likewise; `pad` += cargo_pad and `shuttle` (the 43 `shuttlebay/pad` duties now walk to the shuttle on its cradle); `shuttle` += workpod.

## Room placements (`js/gen.js`)
New `ringPut` options: `only: 'corner'`, `free` (reserve no front tile: small props reached from the side), `along` (long axis along the wall), `ok(x, y)` (ring tile filter). New helpers `anyPut(r, interior, kind, o)` (safePut on any free interior tile, `near` / `min` / `rot`) and `has(r, kind)`. **Every seed's layout changed again** (more props per room, more `prnd` rolls; the main stream is untouched, but blocked tiles move chips, exit and tubes).

| room | placed (batch) |
|---|---|
| bridge | `navstation` behind the forward starboard console (interior, rot 0); `opsstation`, `commsstation`, `sensorstation` on the side / aft walls (never the forward wall). `sysboard` (two aft wall tiles, centred) or `sysboard_half` (one) in the world decor pass |
| engineering | `plottable` near the reactor station (interior, else a wall); `injector_crate` in a corner; every `warpcore` gets a `warpcore_detail` child (world.js) |
| shuttlebay | `shuttle` now always long axis on x with both end tiles reserved; world.js raises its meshes by the cradle's `craftLift` (0.25 m), adds `shuttle_cradle` and `padmark` as children and sets its box to the cradle (+-1.6 -> clamped 1.15). One corner `crate` became `pallet_loaded`. `workpod`, `maint_stand` (near the shuttle) on interior tiles; `fuelbowser` and `hoversled` (near a door) along the walls. `bay_door` on the two-tile wall face farthest from the doorways (world.js, skipped when no free pair) |
| transporter | up to two `buffertank`s in corners |
| cargo | loose `crate`s are 45 % crate, 30 % `pallet_loaded`, 25 % `pallet`; `hoversled` by a door; `cargo_pad` on a wall |
| arboretum | `growbed` rows on every other interior row (long axis x, at most 6 per room), trees on the walkway rows (30 %) and in two corners (one tree guaranteed: `SYSTEMS.hydro` is hosted on a tree); `nutrient_tanks` on a wall; `specimen_tank` (half the rooms) |
| lab | `charttable` at the centre (rot along the long side); consoles / lab benches as before elsewhere; walls: `spectrometer`, `sensorstation`, `fumehood`, `samplefridge` (corner), `specimen_tank` |
| brig | half the cells are `cellfield`; `scan_arch` along the wall by the door |
| armory | `issuecounter` by the door, `chargerack` in a corner, then the old desk and workbench |
| gym | checkerboard of `sparring_set` (always first), treadmill, exercise_bike, rower, weightbench, mat; `dumbbell_rack` on a wall; a missing treadmill / bike goes on a wall; `grapple_dummy` in a corner |
| laundry | `dryer`, `folding_table` (corner allowed), `linen_cart` (corner) |
| lounge | `arcade` on a wall after the bar; `pool_table` at the centre (3+ interior tiles), `card_table` (5+); the sofa pattern fills the rest |
| mess | `feedstock_silo` on a wall; `galley_trolley` in a corner of big galleys |
| readyroom | `briefing_table` at the centre, the desk moves to a wall |
| quarters | `platform_bed` instead of the bunk in about 30 % |
| workshop | every other lathe is a `knee_mill`; `drill_press` on a wall |
| datacore | every other `servers` is a `relayrack`; `commsstation` on a wall |
| stores | `reachin_cooler`, `feedstock_silo`, `injector_crate` (corner); `coldstore_door` wall piece via the pool |
| airlock | `airlock_doors` on the ring (+z into the room: the inner door faces the room, the outer one the hull wall) |

Measured over 320 levels (`tools/test.mjs` `room props:`, threshold 60 % of rooms): bridge navstation 39/39, opsstation 38/39, commsstation 29/39, sensorstation 26/39; engineering plottable 68/68, injector_crate 38/68; shuttlebay workpod 63/65, maint_stand 62/65, fuelbowser 46/65, hoversled 17/65; arboretum growbed / tree / nutrient_tanks 17/17; lab charttable 53/53, spectrometer 51/53, sensorstation 32/53, samplefridge 23/53, fumehood 19/53; brig cellfield 23/40, scan_arch 26/40; armory issuecounter 40/51, chargerack 20/51; gym sparring_set 26/26, dumbbell_rack 25/26; laundry dryer 59/70, folding_table 32/70; lounge arcade 37/47, pool_table 15/47; readyroom briefing_table 75/75; datacore commsstation 64/69, relayrack 15/69; workshop drill_press 48/59, knee_mill 12/59; airlock airlock_doors 101/127; transporter buffertank in 100 of 246 rooms (beampedestal 201/246, was 240/284). Most rooms are 3x3 with doorways on most edge tiles, so the edge ring has one or two free tiles: the wall props further down each list are the ones that miss. 5x5 rooms whose ring is all doorways (common: the maze runs round them) take lab, gym, lounge, datacore and workshop wall props on interior tiles instead (`wallPut`); every 5x5 lab / gym / lounge / datacore / workshop has its full set, shuttlebays 62/65.

## Deviations from the batch docs
* Not placed: `catwalk`, `ship_ladder` (no tall rooms), `galley_trolley` as a cart, the `makeCart` variants for bowser / sled / trolley / linen cart (they are floor props; `CARTS` unchanged). `padmark` / `shuttle_cradle` are children of the `shuttle` prop, not floor props (the cradle spans two tiles). `airlock_doors` is a floor prop on the airlock's edge ring (blocks its tile), not a centre fixture: the `suitrack` keeps the centre and the chamber needs a hull wall behind it.
* `navstation` does not replace the forward starboard console: `crew.js` hosts `alert` on that console. The sensor station goes on a bridge wall (no generic science console exists to replace).
* SYSTEMS hosts are unchanged (no `growbed` hydro host, no `chargerack` armory host, no `buffertank` / `relayrack` hosts): same reason as request 3 above.
* `briefing_table`, `card_table`, `pool_table` users stand: the props have no chairs, a seated script would sit them on air.
* `platform_bed` is rolled per cabin (30 %), not per senior billet: gen.js does not know who lives where.
* Every `servers` stack is not replaced: every other one becomes a `relayrack`. The `transporter` gets no `cargo_pad` (3x3 rooms have no ring space left); it goes to cargo.
* `cellfield.userData.field` opacity is not driven by lock state; `buffertank.userData.sight` is not animated.
* Wearables (batch 9) and signage (batch 10): see "Wearables and signage" below.

## Wearables and signage (batches 9 and 10)
* **Duty clothes**: `dressCrew(mesh, person)` (`js/actors.js`) calls `wearOutfit(mesh, outfitFor(person))` once per body: engineering (and the ce / ace / reactor / env / eps / dc billets) coveralls, medical scrubs (with gloves), galley chief and cooks whites with apron and cap; everyone else keeps the uniform. It is skinned on the human's own bones, so walking and every clip drive it as before; `userData.outfit` holds the handle (or `null`). `js/main.js` calls it in `npcFor` and in the sim-body spawn (two one-line edits plus the import). Cost: 4,000-8,600 triangles per dressed body and 20-130 ms per body at spawn (the rest pose is measured each time); not cached per body kind yet.
* **Not wired**: donning (`Donner`, `GESTURES_WEAR`), lying (`applyLie`, `BUNK_LIE`), headgear in alerts (`wearHeadgear` mask / hood / headset) and the pressure suit: they need main.js / haul.js glue (request 11).
* **Emblems (G-1)**: a department plate (`buildEmblemPlate(ROOM_DEPT[type])`) 0.92 m beside every room-name sign, same height (2.6 m).
* **Placards (G-2)**, **floor zones (G-3)**, **directory (G-4)** in `World._details` on their own random stream (seeded from deck and lift tile, so the old decor rolls are unchanged): a placard at 1.45 m on 20 % of the free wall faces of the `PLACARD_ROOMS` types (the face is then used); 1-3 zone markings on open interior tiles of shuttlebays, cargo bays, workshops and plant rooms (`podarrow` not used); the directory board on the first free corridor wall face within two tiles of the lift (`world.directory`, its lamp pulses in `World.update`).
* **Pod hatches (R-1)**: `DECOR_SIGN` merged into `DECOR`; the airlock pool lists `podhatch` twice (single-tile faces; `podbank` needs two tiles and is not placed).
* **Icons (U-1, U-2)**: `installIcons()` runs when `js/world.js` loads (before any HUD draws), so `iconSvg('regen')` etc. and the `flight` / `operations` badge shapes exist. Not done: `HH_ICON` in `js/menus.js` (`Object.assign(HH_ICON, HH_MAP)`), department -> badge category mapping, deck-plan symbols (U-3, the deck-plans template).

## Tests
* `tools/test.mjs` `room props:` also wants the new kinds per room (60 % rule: bridge navstation / opsstation, engineering plottable, shuttlebay workpod / maint_stand, arboretum growbed / nutrient_tanks / tree, lab charttable / spectrometer, armory issuecounter, gym sparring_set / dumbbell_rack, laundry dryer, lounge arcade, readyroom briefing_table, datacore commsstation, workshop drill_press, airlock airlock_doors) and checks that 5x5 labs, shuttlebays, gyms, lounges, datacores and workshops get their whole set (90 %). `props:` builds the batch 5-11 items, checks a few `kindForName` rows and builds up to three decks with a shuttlebay as `World`s (shuttle on its cradle, a bay door).
* Layout-driven test fixes (every seed's layout changed): `fixture search` uses a search site with no crew member within 3 m (the prompt offered a talk instead); `tools/test-ui.mjs` name tags look at the first crew member with a clear line from 2.2 m on any side (the spot due south was often behind a wall prop); `crew repair response` requires the work marker only when the lead's body was on the deck (in 2 of 4 runs on a25f79a the dispatcher picked a lead from another deck, so no body and no marker; d4daa26 4 of 4 had a local lead).
* `js/itemart.js` `buildInstanced` drops `uv` when a material's parts mix uv'd and uv-less geometry (some batch items did; the merge failed and threw in the clutter pass).

## Requests to the main.js / haul.js / sim owner (batches 5-11)
6. **Path tests**: every seed's layout changed again. Rooms hold more props (most 3x3 rooms now have 1-3 wall props); `tools/test-walk.mjs` / `tools/soak-walk.mjs` baselines that depend on a seed's layout may need re-baselining.
7. **Carts**: `fuelbowser`, `hoversled`, `galley_trolley`, `linen_cart` carry `userData.handle` / `use.push` like `makeCart`; if `haul.js` should push them, map them in `CARTS` (deck `cargo_sled`, `fuel_and_stores`, galley).
8. **Field cells**: `cellfield` (brig) exposes `userData.field` (a material, opacity 0.14 live, 0 down); set it from the cell's locked state if there is one.
9. **Pattern buffer glow**: `buffertank.userData.sight` (MeshBasicMaterial) can pulse while the transporter runs.
10. **Stretcher / tote / coil**: as request 4, the new two-handed items (`harvest_tote`, `coil_cartridge`, `patch_plate`, `light_panel`, `injector_spare`) exist in `ITEMS` but no interaction hands them out.
11. **Wear glue**: `import { GESTURES_WEAR, Donner, applyLie, clearLie, wearHeadgear } from './wearart.js'`; `Object.assign(GESTURES, GESTURES_WEAR)` at init; a `suitrack` `fx: 'don_suit'` hook; `applyLie` for sleeping blocks at bunks / platform beds (`top` 0.52 / 0.55) and biobed patients; masks on fire / contamination alerts, headsets for comms / helm / sensor billets. `HH_ICON` mapping in `js/menus.js` (`Object.assign(HH_ICON, HH_MAP)` from `js/signart.js`).

## Open issues / needs a human eye (batches 5-11)
* The shuttle on its cradle: the cradle reaches 1.6 m along x, past the tile; the end tiles are kept free so nothing stands there, and the collision box grows to 1.15 m. Check the shuttle's skids against the cradle pads (0.25 m lift).
* The bay door (5.2 m) and systems board (3.6 m) sit on two wall tiles; check that nothing else hangs within 0.1 m at the shared edge (both faces are marked used).
* Seated stations on bridge walls face the wall (operator side into the room); the bridge looks busier. The gym exercise bike seat (0.98 m) and rower (0.4 m) were not checked with `sitting_idle`.
* Arboretum triangle budget: up to 6 grow beds (2,526 tris each, about 15k per room).

# Wiring pass (batches 1-11 leftovers)
Requests 3, 4 and 7-11 above, the open items of "Batches 5-11", and the request-3 deviation (system hosts) are wired. Tests: `tools/test-wiring.mjs` (unit half in `node tools/test.mjs` next to the equipment tests, browser half after the combat block).

## Clothes cache (`js/wearart.js`, `js/actors.js`)
* `wearOutfit` / `wearHeadgear` build a garment once per **body kind + outfit + opts** (`WEAR_CACHE`). The geometry is stored in the space of the human's `inner` group (the GLB scene, before the per-person height / build scale) with bone inverses in the same space, which depend only on the body kind; every later human of that kind gets new `SkinnedMesh`es on the shared geometry and materials, bound to its own bones (the skeleton applies its scale). Fit was checked on three people per body kind in the walk pose (same distances to the garment as an uncached build). `remove()` no longer disposes geometry (it is shared).
* `prewarmOutfits()` (`js/actors.js`, called once in main.js when loading finishes) builds the three duty outfits and the headset / mask for all four crew bodies, one per idle callback.
* Measured (swiftshader, 17 dressed crew from the roster, time inside `dressCrew`): before 565 / 587 ms (14-100 ms each); after, cold cache 256 ms (only the 7 first-of-kind builds, 19-55 ms; the rest 0.1 ms); after the prewarm 3 ms in total (0-1.2 ms each); the test sees 0.8 ms.

## System hosts (`js/crew.js`)
`SYSTEMS` hosts: coolant `pumpskid@plant`, life `scrubber`, gravity `fieldgen`, dampers `fieldgen_damp`, comms `relayrack`, armory `chargerack`; hydro (`tree`) prefers a `growbed`, then a tree, then a plant. `HOST_LABEL` has the new labels; a deck without the hardware keeps a junction (unchanged fallback); `js/repair.js` `repairSites` picks the hardware nearest the home deck as before (no edit there). Transport stays on the `pad` (the pattern buffers are in only ~40 % of transporter rooms). `WORK_SPOTS` (main.js fidget state) += `tank`, `servers`, `weaponrack`, `tree`. Repair points: 21 on every deck of four ships checked (all decks), and of ships 0 and 5 in the test (parkour wants >= 20). The deck-plans page (`tools/artifact`) gets badge codes CM / LS / CL / GV / ID / AR for the re-hosted systems.

## Art carts (`js/equipment.js` `CARTS`, `js/carry.js` `makeCart`)
`CARTS.sled` (hoversled), `bowser` (fuelbowser), `trolley` (galley_trolley, turned round: its bar is at +z), `linen` (linen_cart, turned round). `art`, `grip` (centre to push bar), `top`, `cap`, `slots`. `makeCart` builds the prop once per kind and clones it (shared geometry); the art is merged per material, so `wheels` are four empty pivots (the wheels do not visibly turn; the sled has none). Haulers: `deck` -> sled, `galley` -> trolley, new `pilot` -> bowser (shuttlebay / cargo only). Every art cart passed the NPC haul (go / grab / push / release, moved 6-27 m, pusher gap 0.9-1.5 m) with the hauler forced to it. Not done: nobody pushes the linen cart (no billet runs the laundry); the static bowser / sled / trolley floor props stay props (a hauler wheels out a fresh cart beside them, like the other carts); the 2.4 m bowser's ends can cross a wall at a corner (centre-only collision in `cartFollow`, js/haul.js).

## Wear glue (`js/wearglue.js`; main.js: one import line, `wearWalk` in the walk branch, `wearStep` after `fidgetStep`)
* Only for simmed bodies inside the 22 m skinning range (never off-screen); `e.x / e.z` are never moved.
* Headsets on `comms`, `helm`, `sensor` billets. Breathers: a half mask while `fire` or `contamination` is up on this deck (`don_hood` gesture when standing, straight on while walking), removed on all-clear.
* Suit locker: `EQUIPMENT.suitrack` (and `airlock_doors`) has a `wait` step with `fx: 'don_suit'`; the glue plays the K-4 suit gesture (`Donner`) and the clear hood appears at the swap point (a stand-in for the suit helmet: swapping to the `suit` body mid-script was not attempted). Once per visit; off when they leave. `GESTURES_WEAR` is merged into `GESTURES`.
* Sleepers: spot `bunk` with the sim block `sleep` -> the use script ends, the body lies supine on the bed it faced (`applyLie`, bunk top 0.52 head toward local -x, platform bed 0.55 head toward -z), eyes shut, one sleeper per bed (a second keeps sitting); `clearLie` + the use script again when the block ends, `clearLie` before any walk.
* Not done: biobed patients (no patient state); per-alert `hood` instead of mask; the pressure suit body (W-1).

## Animations (`js/world.js` `update`, main.js sets `world.shipState`)
Field-cell planes (`userData.field`, one shared material) shimmer 0.07-0.17 opacity, flicker when `security` is degraded, 0 when offline or in a blackout (no per-cell lock state exists). Pattern-buffer sight glass (`userData.sight`) breathes cyan, flickers degraded, dim offline. Pod hatch bank (`podbank`, R-1) in airlocks: on a pair of free wall faces, else on one (2.3 m fits a 2.5 m face; 3x3 airlocks rarely keep two side by side), in 9 of 12 airlocks sampled, with four lamps (two status lamps, two arrow strips) that breathe green and blink amber on alert. The directory lamp pulsed already.

## Icons and deck-plan symbols
`HH_ICON` (js/menus.js, now exported) uses `HH_MAP` first when the glyph is installed: dermal regen, scalpel, plasma torch, extinguisher, mop, cargo hook, crowbar, phaser rifle. U-3: `PROP_SYMBOLS` / `PROP_NAME_X` / `drawPropSymbol` moved to `js/propsymbols.js` (no three.js; `js/signart.js` re-exports them) so `tools/artifact/build-deck-plans.sh` bundles them; the template's default prop branch draws them and the tooltips use the names. New symbols: growbed, relayrack, chargerack, buffertank, cellfield (nutrient tanks alias the buffer). The game has no in-game prop map, so only the deck-plans page shows them. Department -> badge category (flight / operations shapes) is still not mapped.

## Stretcher (`js/world.js` decor pass)
A `stretcher_rack` (userData.item) registers a clutter record ("Folded stretcher"): the normal `[E] Take` prompt and `takeClutter` give `ITEMS.stretcher` (two-handed) and hide the folded stretcher's 15 parts. Every sickbay also gets one bracket on a wall face the decor passes left free (rare: sickbay walls are mostly taken). `classifyItem` maps stretcher names (not clamps / alcoves / doors) to `stretcher`.

## Layout changes
Airlock rooms with a pod hatch bank lose one or two wall faces for the random decor pass, and sickbays may lose one to the bracket: wall fixtures (and search sites) in those rooms move. Prop layouts and the main random stream are unchanged.

## Play-test list
* Sleepers: pose on bunks and platform beds (pelvis a little off the mattress centre, legs angled); a second person on the same bunk sits.
* Breather donning in a fire alert (mask on the face, the gesture reads?), hood as helmet at the suit locker.
* Fuel bowser pushed round corners (ends through walls), trolley / linen cart handle height (0.85 / 1.16 m with the push clip).
* Pod hatch bank on a single face next to corner fixtures; lamp colours; field-cell shimmer brightness.
* Stretcher pickup prompt and the empty bracket; a carried stretcher in the hands.
* Belt icons for the eight new glyphs at 16 px.

## Test runs (`node tools/test.mjs`)
* HEAD 5c6be94 run 1: FAIL `npc bodies vs sim {"n":1,"sim":0}` (tools/test-walk.mjs) and FAIL wiring sleeper (a test bug: the real block was still `sleep`; fixed in bbb5c23). HEAD bbb5c23 run 2: OK.
* Baseline 3fe10c2 (before this pass) run 1: FAIL `bot run` (deck 2 did not advance; ran while probes loaded the machine); run 2: OK. `npc bodies vs sim` did not fail on the baseline in two runs and did not recur on HEAD; it is a sim-body count check in the pathing tests, so it may be a rare flake or a body the wear glue kept around one frame longer: watch it.

## Texture pass 4 (`js/propsurf.js`)
`surfaceProp(g, kind, { decals, batch })` runs on every prop: `buildPropArt` calls it without decals (so wall pieces, add-ons and carts get the materials), `buildProp` calls it again with decals for floor props. Materials referenced from `g.userData` (`field`, `sight`, ...) are never swapped or patched, because main.js / world.js animate them.
* **Wear layer** (`wearMaterial`): patches a shared `MeshStandardMaterial` in place, once (`userData.wearU`, program key `propwear1`, one program per feature combination). Object-space triplanar on `position` / `objectNormal`, so geometry merged in the prop frame (every batch, and the hand-built kinds after `mergeStatic`) reads y = 0 at the floor. Skips transparent, wireframe, already-patched and scanned GLB materials (`aoMap`, or a non-canvas `map`). Class from metalness / roughness / colour, or set `mat.userData.wear = 'metal' | 'paint' | 'plastic' | 'fabric' | 'hazard'` before the first build. Off below High (`setPropDetail`, from `World.setFancy`).
* **Screens** (`screenMaterial`): any opaque `MeshBasicMaterial` with a `map` becomes dark glass + `emissiveMap` (cached per source). Plain-colour basic materials (LEDs, glow strips, status lamps) stay as they were. Opt out with `basic.userData.noScreen = true`.
* **Decals** (`KIND_SET`, `BATCH_SET`, `NO_DECALS`, `SETS`): items are atlas cells with a width, faces (`f` front, `s` sides) and a height band. Placement hashes the kind (never `Math.random`); cached per kind except `RANDOM_KINDS` (crate, shelving, tree, plant). World merges all `decals` meshes into `World.propDecals` after the props loop.
* Hand-built kinds: `mergeStatic` merges unnamed, childless meshes without userData per material + attribute layout; named parts (`spin`, `core`, `chair`) and GLB instances stay separate.

