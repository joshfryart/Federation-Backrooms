# Sciences art, batch 5 (`js/propart-sciences.js`, `js/itemart-sciences.js`)

Viewer: `python3 -m http.server 8130`, then `viewer-sciences.html` (`?set=props|items|hand`, `?only=growbed,fumehood`, `?cam=x,y,z,tx,ty,tz`, `?spin=0&yaw=0.6`, `?ref=0` hides the 1.75 m capsule, `?chair=0`, `?scale=1`). All original, pure three.js, shared materials, generated canvas screens (rings, bars, grids; no text, no marks). Nothing in the game imports these yet.

## Props (`kinds` in `js/propart-sciences.js`)
`kinds.name(m, h) -> THREE.Group`; `m` and `h` are ignored (the file owns its materials; it imports `buildChair` from `propart-stations1.js` for the seated station). Origin at the floor centre, +z = operator side, one mesh per material.
`userData`: `top` (only where a surface exists), `box` `[x0,x1,z0,z1]`, `spots` EQUIPMENT-style `[[x, z, ry]]` (standing root; for the seated station the root is 0.41 m ahead of the pelvis), `use` named `{x, z, ry}` points (forward = (sin ry, cos ry)), `seat` `{x,y,z,yaw}` (sensorstation, pelvis point), `size` `[w,h,d]`, `tris`, `dept: 'sciences'`. `META` (id, suggested rooms, EQUIPMENT script to reuse) is exported too.

| kind | gap | real analogue | size (m) | top | tris | use points |
|---|---|---|---|---|---|---|
| `growbed` | SCI-1 | NFT hydroponic bench: 5 white channels 0.1 m wide, 45 plant cups (every 0.2 m) with leaf tufts, LED bar 0.6 m above on two posts, 60 L reservoir + pump under the -x end, feed and drain manifolds | 2.0 x 0.9 frame, 1.55 high | 0.9 | 2526 | `tend` (0, 0.75) ry PI; `pump` (-0.85, 0.6) |
| `nutrient_tanks` | SCI-6 | bund tray 2.3 x 1.2 (0.1 walls), three clear 0.6 x 1.2 m tanks (A green, B blue, C amber) with level strips and bottom valves, 0.8 x 0.5 m dosing board on a frame with three pump heads and colour-coded tubing | 2.3 x 1.2, 1.42 high | - | 1848 | `board` (0, 1.0) ry PI; `tankA` (-0.72, 0.5); `tankC` (0.72, 0.5) |
| `sensorstation` | SCI-2 | seated sonar / radar operator stack: 0.5 m round plot display centre, two waterfall screens on the wings, filter-key row, trackball; own task chair (child `'chair'`) | 1.5 x 0.8, screens to 1.6 | - | 1146 | seated, pelvis (0, 0.48, 0.72); `spots [[0, 0.31, PI]]` |
| `charttable` | SCI-3 | projection table: dark glass top with glowing grid at 0.9 m, translucent dome with 34 emissive points, pull-out keyboard drawer on +z | 1.6 x 1.0, dome to 1.25 | 0.9 | 698 | `stand`/`keyboard` (0, 0.95) ry PI; `side_l` (-1.1, 0) ry PI/2; `side_r` (1.1, 0) ry -PI/2 |
| `spectrometer` | SCI-4 | bench 1.2 x 0.7 (top 0.9) with a 0.6 x 0.5 x 0.35 instrument: sliding sample door, 8-position carousel in a round window, screen + three keys, back vent grille, sample rack with 8 vials, waste and wash bottles | 1.2 x 0.7, 1.3 high | 0.9 | 1020 | `stand` (-0.22, 0.65) ry PI; `door`; `rack` |
| `samplefridge` | SCI-5 | laboratory fridge: glass door, four wire shelves with vial racks, header with readout + alarm lamps + mute + key lock, kick plate | 0.7 x 0.7 x 1.9 | - | 1612 | `stand` (0, 0.75) ry PI; `door`; `readout` |
| `fumehood` | SCI-8 | ducted fume cupboard: base cabinet with blank hazard diamond, lit work surface at 0.9, glass sash half raised (opening 0.9 to 1.55), valve strip on the front right post, airflow monitor, duct collar to 3.1 m | 1.5 x 0.8 x 2.3 (duct to 3.1) | - | 704 | `stand` (0, 0.75) ry PI; `sash`; `valves` |

Tri counts are `userData.tris`; all under the 3000 budget. Repeated parts (cups, vials, ticks) use cached geometry merged per material.

## Items (`js/itemart-sciences.js`): SCI-7
`DEFS_SCIENCES`, `KW_SCIENCES`, `buildSciencesItem(kind, opts, M?)`, same format as `itemart-medical.js`.

| kind | what | frame | tris |
|---|---|---|---|
| `soil_meter` | 0.16 m pH / EC / moisture handset, 0.12 m probe with second tine, rubber band, screen, two buttons | grip (probe +y), `lie` | ~400 |
| `pruning_shears` | 0.2 m bypass secateurs: red and dark handles, pivot bolt, hooked blade over anvil, spring, latch | grip (blades +y), `lie` | ~300 |
| `harvest_tote` | 0.5 x 0.35 x 0.25 m vented green crate, hand slots, tomatoes and leafy heads heaped above the rim | base (two-handed carry) | ~450 |

## Hook-up for the integrator (not done here)
* `js/propart.js`: `import { kinds as SCIENCES } from './propart-sciences.js'`, spread into `PROP_ART`, add to `PROP_BATCH`. Add `growbed`, `nutrient_tanks`, `charttable`, `spectrometer`, `samplefridge`, `fumehood` to `NO_CLIMB` where something hangs over the top (growbed LED bar, fumehood, fridge). `BOX` is not needed (every kind gives `box`).
* `js/itemart.js`: `Object.assign(DEFS, DEFS_SCIENCES); KW.unshift(...KW_SCIENCES)` (the same snippet as `docs/propart-medical.md`).
* Placement and equipment mapping (suggested):

| room | placement | `EQUIPMENT` script |
|---|---|---|
| arboretum | `growbed` in rows (long axis x), `tree` kept at the rim; one `nutrient_tanks` against a wall | `growbed` reuses `tree` (`tend_plant`, spot `tend`), `SYSTEMS.hydro` host `growbed`; `nutrient_tanks` reuses `tank` |
| lab | `charttable` at the centre (3 users: front, both sides), `spectrometer` on the wall in place of the `labbench` instrument, `samplefridge` and `fumehood` on the wall, a `sensorstation` where a console would stand | `charttable` -> `console` (spots front/side), `sensorstation` -> `desk` (seat 0.48), `spectrometer` and `fumehood` -> `workbench` (alias `labbench`), `samplefridge` -> a cabinet/locker script |
| bridge (optional) | `sensorstation` aft port, replacing the generic science console | `desk` |
| sickbay, datacore | `spectrometer`, `samplefridge` (medtech sample runs) | as above |

* `tree` script `hold: 'shears'`, `HAULERS.bot.carry: 'tote'`, item ids equal to the model kinds (`soil_meter`, `pruning_shears`, `harvest_tote`).

## Gaps from the list not covered
SCI-9 (specimen tank on stand) is priority C and listed in batch 11, so it is not built here.

## Human eye needed
Colour tuning under real room lighting; whether the sensor station chair's 0.41 m pelvis offset puts knees under the desk (viewer shows no capsule); the `growbed` plant tufts are stylised cones.
