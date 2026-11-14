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
