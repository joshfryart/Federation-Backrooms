# Batch 3: plant and engineering hardware

Files: `js/propart-plant.js` (floor props and the open junction), `js/decorart-eng.js` (wall kits), `viewer-plant.html` (viewer: `?set=props|junction|decor|all`, `?only=pumpskid&static=1&yaw=0.6&zoom=1&pitch=0.18`; 1.75 m reference capsule beside each item; triangle count in the label).
No existing file was edited. Everything below is for the integrator.

All props: origin at floor centre of a TS (2.5 m) tile, front faces +z, long axis on x, merged per material (4 to 12 draw calls), triangles 1,150 to 2,000 (measured in the viewer). Generated canvas textures (gauge dials, machine panel, single-line diagram, junction label) are created lazily, so importing the module in Node is safe. Materials: `m` (the world.js `mats()` object) is used for steel, dark, rubber, pipe, hazard, glass and the glow/blink materials; the rest are created once in the module. `h` is accepted and unused.
`userData`: `top` (height of the highest point), `size` [x, z, y] footprint and height, `use` = named points as `THREE.Vector3` in the prop's local frame (rotate with the prop). `read` is where a person stands at the prop's front.

## Floor props (`kinds` in `js/propart-plant.js`)

| kind | real analogue | size x * z * y (m) | `userData.use` (local x, y, z) |
|---|---|---|---|
| `pumpskid` ENG-1 | end-suction centrifugal pump, finned 0.35 m motor, coupling guard, volute, 150 mm flanges, base frame, drip tray, 4 isolation pads | 1.30 * 0.50 * 0.70 | `read` (0.5, 0.36, 0.9), `gaugeSuction` (0.585, 0.36, 0.205), `gaugeDischarge` (0.37, 0.62, 0.2), `valve` (0.485, 0.57, 0.15), `motor` (-0.3, 0.55, 0.3) |
| `heatexch` ENG-4 | shell-and-tube exchanger on two saddles, channel head and bonnet, four flanged nozzles, vent, drain, two dial thermometers, blue (cold) and red (hot) bands | 2.00 * 0.56 * 1.12 | `read` (0, 0.72, 0.9), `gaugeHot` (0.2, 0.72, 0.35), `gaugeCold` (-0.25, 0.72, 0.35), `ventValve` (0.2, 1.1, 0), `drain` (0, 0.45, 0.1) |
| `scrubber` ENG-5 | twin-bed CO2 scrubber cabinet, two canisters behind a mesh door, fan housing and 0.32 m duct collar, differential gauge, lamps, slide-out filter tray | 0.90 * 0.70 * 2.00 | `read` (0, 1.46, 0.8), `gauge` (-0.3, 1.46, 0.4), `door` (0, 0.9, 0.5), `tray` (0, 0.12, 0.6), `fan` (0, 1.7, 0.4) |
| `fieldgen` ENG-6 | cryocooled field generator: 1.0 m drum on a shock-mounted skid, ring of 8 coil pods with lit caps, compressor box, painted yellow keep-out box. Cyan (gravity) scheme | 2.20 * 1.60 * 1.55 | `read` (0.72, 0.88, 0.8), `panel` (0.72, 0.88, 0.5), `drumNorth` (-0.35, 0.9, 0.9), `coilRing` (-0.35, 0.9, 0.7) |
| `fieldgen_damp` | same mesh, amber scheme (damper field) | same | same |
| `fabricator` ENG-7 | industrial printer/CNC: louvred base cabinet, enclosure with 1.0 x 0.8 m glazed interlocked door onto a lit build chamber (gantry, plate, part), machine panel, e-stop, swing-arm pendant, material hopper on +x, 3-colour beacon | 1.9 * 1.0 * 2.02 (1.6 body + 0.3 hopper) | `load` (0.26, 0, 0.85), `inspect` (0.26, 1.2, 0.7), `pendant` (-0.74, 1.3, 1.25), `hopper` (1.1, 0, 0.5), `beacon` (0.62, 1.97, -0.3) |

The fieldgen footprint is 2.2 m long: place it with its long side along the tile row and leave the tile on that side clear, or rotate it so +x runs along a corridor of two tiles. Everything else fits inside one 2.5 m tile.

## Wall fixtures (`DECOR_ENG` in `js/decorart-eng.js`, Kit format, +z out of the wall)

| kit | description | size w * d * h |
|---|---|---|
| `foamstation` ENG-11 | wall manifold 1.0 x 1.2 m (backplate at 0.7-1.9 m), two quarter-turn isolation valves (one lever open, one shut, with green/red tags), proportioner body, pressure gauge, floor-standing 60 L concentrate tank with sight glass at left, red nozzle line up to a ceiling nozzle at 3.2 m | 1.0 * 0.5 * 3.2 |
| `hosecab` | red wall cabinet, open front with glazing bars, hose reel and nozzle | 0.8 * 0.24 * 0.9 at 0.8-1.7 m |
| `panelbox` | closed electrical panel box, pilot lamps, latch, conduit to the ceiling | 0.5 * 0.14 * 0.72 |
| `panelopen` | open distribution board with the door swung 90 degrees, relay-card bay, 8 toggle breakers (one tripped), bus bars behind a clear shield, cable loom | 0.62 * 0.14 * 0.86 (+ door 0.58 out) |

## Open junction (ENG-2): `makeJunctionOpen` in `js/propart-plant.js`

`makeJunctionOpen(sys, code, deptName, color, open = 1) -> { group, lamp, door, insert }`; same contract as `makeJunction` (`group` +z out of the wall, origin at the box centre, `lamp` takes `setLamp`). Cabinet 0.62 x 0.86 x 0.14 m, hazard bands as the closed box, door hinged on the left (the pivot `door` is a child of `group`, outside face carries the label, inside face a single-line diagram card in the department colour), dead-front with a 8-toggle breaker row, two bus bars behind a clear shield, a cable loom into a gland plate, and one insert module in the top bay chosen by `INSERT_OF[sys.id]`:

| insert | systems | look |
|---|---|---|
| `tap` | eps | transformer block, three copper terminals, ammeter |
| `fan` | life | slide-in fan cartridge with a ring and blades |
| `manifold` | coolant | blue valve manifold, three handwheels, gauge |
| `cards` | comms, security, lighting, armory | relay card cage, 8 cards with LEDs |
| `coil` | gravity, dampers | copper field coil with a lit ring, terminal block |

`setJunctionOpen(jn, t)` swings the door (t 0 closed, 1 open; `DOOR_OPEN = -1.75` rad). Open it only while someone works there (the door sticks out 0.6 m from the wall), e.g. in `opStart` for spot `junction` and close it at the end. Triangles 1,200 to 1,560.

## Hook-up snippets

1. Registry (`js/propart.js`, proposed in asset-gaps.md section 12): `import { kinds as plant } from './propart-plant.js'; export const PROP_ART = { ...plant };` and in `buildProp`'s `default:` (`js/world.js:367`): `const f = PROP_ART[kind]; if (f) { const a = f(m, {}); g.add(a); g.userData = { ...g.userData, ...a.userData }; } else g.add(rbox(0.8, 0.8, 0.8, m.metal));`. Add the six names to `PROP_KINDS` (`js/world.js:1321`) so models.html lists them.
2. `gen.js` plant (replaces `(x + y) % 2 ? 'console' : 'tank'`): `const PLANT = ['pumpskid', 'tank', 'heatexch', 'console', 'scrubber', 'pumpskid']; ... put(x, y, PLANT[(x * 3 + y) % PLANT.length]);` Use `{ rot: 0 }` for `heatexch` and `pumpskid` so the long axis runs along x.
3. `gen.js` workshop: `(x + y) % 4 === 0 ? 'lathe' : 'workbench'` becomes `... : (x + y) % 8 === 2 ? 'fabricator' : 'workbench'` (at least one `fabricator` per workshop; rooms with a single interior tile keep the lathe). `gen.js` engineering: put one `fieldgen` (and a `fieldgen_damp` in rooms with 4+ interior tiles) at a free interior tile away from the `warpcore`.
4. `EQUIPMENT` (`js/equipment.js`): `tank: { ..., props: ['tank', 'pumpskid', 'heatexch', 'scrubber'] }` (box `[-1, 1, -0.45, 0.45]` for `heatexch`, spots at `read`); `replicator.props` add `'fabricator'` for the `industrial_queue` / `repair_ticket` steps, or give `fabricator` its own entry (stance stand, spots `[[0.26, 0.85, PI]]`). `SYSTEMS` hosts: `coolant` host `'pumpskid'`, `life` host `'scrubber'`, `gravity` and `dampers` host `'fieldgen'` / `'fieldgen_damp'`, `replicators` host `'replicator'` stays; the host string must be a prop kind placed by gen.js for `sites.find(h => h.sys === s.id)` (`js/main.js:1307`) to pick it up; add the labels to `HOST_LABEL` and add the kinds to `WORK_SPOTS` (`js/main.js:323`). Systems without a placed host keep their junction.
5. Open junction (`js/main.js:1312`): `import { makeJunctionOpen, setJunctionOpen } from './propart-plant.js'` and replace `makeJunction(...)` by `makeJunctionOpen(...)` (same arguments, returns `{ group, lamp }` plus `door`); keep `door` on the repair point (`pt.door = j.door`) and call `setJunctionOpen(pt.door, working ? 1 : 0)`, or pass `open = 0` for a closed-by-default box. Because 5 of the 9 junction systems now look different, the label text is no longer the only cue.
6. Wall kits (`js/world.js`): `import { DECOR_ENG } from './decorart-eng.js'; Object.assign(DECOR, DECOR_ENG);` after the `DECOR` literal; pools: `ROOM_DECOR.plant` add `'foamstation', 'hosecab', 'panelbox'`, `engineering` add `'panelopen', 'hosecab'`, `workshop` add `'panelbox'`, `corridor` add `'panelbox'`. `foamstation` is 1.0 m wide with a 0.5 m deep tank: use it only on a wall with 1.2 m clear.

## Needs a human eye

Proportions and colours were checked only from the viewer (SwiftShader, one light). Look in the game at: the scrubber door mesh (thick bars at distance), hose reel colours in `hosecab`, whether the 2.2 m `fieldgen` footprint collides with neighbours, and whether the open junction door (0.6 m out of the wall) blocks corridors. Triangle counts run 1,150 to 2,000 against the ~1,500 target (heatexch 2,000, fieldgen 1,930); lower `LOD` in `js/propart-plant.js` if the plant room draws slowly.
