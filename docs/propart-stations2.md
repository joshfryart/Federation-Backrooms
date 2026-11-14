# Batch 7 art: stations II and operations hardware

Files: `js/propart-stations2.js` (props), `js/decorart-bridge.js` (`DECOR_BRIDGE`), `js/itemart-stations2.js` (`DEFS_STATIONS2`, `KW_STATIONS2`), shared helper copy `js/propart-kit2.js` (also used by batch 8; a verbatim copy of the helper half of `propart-stations1.js`, which does not export its helpers).
Viewer: `viewer-stations2.html` (`?set=props|decor|items|all`, `?only=relayrack`, `&static=1`, `&yaw=0.6`, `&zoom=0.7`).
Contract is the one in `docs/propart-stations1.md`: `export const kinds = { name: (m, h) => THREE.Group }` (arguments ignored), origin at the floor centre, +z is the operator side, one mesh per material, glyph-bar textured screens, `userData` = `tris`, `box` `[x0, x1, z0, z1]`, `size` `[w, d, h]`, `spots` `[[x, z, ry]]`, `use` (named `{x, z, yaw}`), and for seated stations `seat {x, y, z, yaw}` (pelvis point) plus a child group `'chair'`.

## Props

| kind | gap | real analogue | size w x d x h (m) | tris | use |
|---|---|---|---|---|---|
| `navstation` | FLT-4 | ship chart table: backlit chart top at 0.95 m (lip 0.95), three shallow chart drawers on the operator side, arm-mounted repeater screen (to 1.75 m), parallel rule, dividers, pencil tray | 1.26 x 0.96 x 1.75 | ~510 | standing: spots `[0|-0.4|0.4, 0.75, PI]`, `use.read`, `plot`, `repeater` |
| `opsstation` | OPS-2 | sit-stand operations desk: telescoping legs, surface 0.74, four screens in an arc on a rear bar, job-queue strip of 12 lit keys, keyboard, handset in a cradle (right end) | 1.64 x 0.8 x 1.2 | ~1400 | seated pelvis (0, 0.48, 0.72), spot `[0, 0.31, PI]`; `use.handset` |
| `commsstation` | OPS-3 | radio operator position: 16 x 4 patch panel, 2 x 8 channel keys, two rotary gain knobs, gooseneck microphone, headset hook on the left cheek (W-8 headset hangs there), status screen | 1.4 x 0.76 x 1.25 | ~1400 | seated pelvis (0, 0.48, 0.72); `use.hook` |
| `relayrack` | OPS-4 | 19-inch cabinet 0.6 x 0.8 x 2.0: perforated door (child group `'door'`, `userData.door`, hinge at x = -0.28 front, drawn open 100 degrees; set `door.rotation.y = 0` to close), six relay modules with handle and two lamps (4th drawn out 0.3 m), cable duct, rectangular waveguide from the top bending toward the wall (-z, to 2.4 m) | 0.6 x 0.8 x 2.0 (waveguide to 2.4) | ~820 | standing `[0, 0.85, PI]`; `use.module`, `use.pulled` |
| `buffertank` | OPS-6 | vertical pressure vessel 0.6 diameter x 1.8: dome ends, four cooling rings, sight window (`userData.sight` = its MeshBasicMaterial, pulse its colour for the slow glow), valve block with handwheel, two armoured cables running back (-z) | 0.6 x 0.6 x 1.8 (cables to z -0.68) | ~1340 | standing `[0, 0.85, PI]`; `use.valve`, `use.sightGlass` |
| `plottable` | ENG-15 | large light table 2.0 x 1.1: glass top at 0.95 (bezel lip 0.975), two vented cabinets with a knee gap, lit ship cutaway with lamp tiles, touch-key strips on both long sides | 2.04 x 1.14 x 0.98 | ~600 | standing, both long sides: `[0, 0.85, PI]`, `[0, -0.85, 0]` etc. |

Tri counts are `userData.tris` (exact: navstation 508, opsstation 1408, commsstation 1400, relayrack 818, buffertank 1336, plottable 600); all under the 3000 budget.

## Wall kit (`DECOR_BRIDGE`)
`sysboard` (864 tris): CMD-1 master systems board, 3.6 m x 1.28 m x 0.12 m, bezel and dark glass face, abstract side-view hull outline (original silhouette) drawn with glowing line strips, 20 system tiles (green nominal, amber caution, one red), a ledge with 12 keys and blank label strips; mounted 1.38 to 2.86 m. `sysboard_half` (720): 1.8 m variant (6 keys). Add to `ROOM_DECOR.bridge`; replaces the generic `monitorB / monitorO` pair on the aft wall.

## Item (`DEFS_STATIONS2`)
`coil_cartridge` (OPS-5): copper-wound ring 0.25 m across x 0.08 m, clear sleeve, binding clips, keyed shoe with two blade contacts, drift lamp, fold-flat handle; base frame (lies flat). Keywords `emitter coil|coil cartridge|induction coil|transporter coil|pad coil|spare coil|coil module`. Hook-up in the header of the file: `Object.assign(DEFS, DEFS_STATIONS2)`, `KW.unshift(...KW_STATIONS2)`; `ITEMS.coil_cartridge` (id = kind). 396 tris.

## Suggested placement and equipment mapping
| kind | room | notes / `EQUIPMENT` |
|---|---|---|
| `navstation` | bridge, forward starboard | replaces one `console`; `console` script with spots from `userData.spots` (billets `nav`, `cfo`, `carto`; `carto.nav_sync` "load plot on nav console") |
| `opsstation` | bridge, aft starboard (also datacore for `comp.relay_check`) | `desk` script (sit, seat 0.48), spot `[0, 0.31, PI]`; billets `ops`, `comp`, `xo` |
| `commsstation` | bridge port, datacore (2-seat variant: place two) | `desk` script; billets `comms`, `yeoman` |
| `relayrack` | datacore | beside or replacing a `servers` stack; `console` script spot `[0, 0.85, PI]`; `comms.relay_sweep`, `ops.comms_round`; `SYSTEMS.comms` hosts "Comm relays x10", "Subspace transceiver" may move here |
| `buffertank` | transporter, against the rear wall behind the pads (replaces the `coil` wall fixture as the host of "Pattern buffers x2": place two) | `console` script spot; billets `tchief`, `ttech`, `ops` (`ops.transport_signoff`) |
| `plottable` | engineering, open floor next to the reactor station | `console` script, both-side spots; billets `ce`, `ace` |
| `sysboard` | bridge, aft wall | `ROOM_DECOR.bridge` |

## Hook-up notes for the integrator
* Add one import line per module to `js/propart.js`: `import { kinds as STATIONS2 } from './propart-stations2.js'`, extend `PROP_ART`, `PROP_BATCH`.
* `NO_CLIMB` additions (something hangs over the top or it is a poor surface): `navstation` (repeater arm), `opsstation`, `commsstation`, `relayrack`, `buffertank`. `plottable` (top 0.975) may stay climbable. Footprints are given in `userData.box`, so the `BOX` table needs no entries.
* The seated stations' `userData.seat` is the stations1 `{x, y, z, yaw}` object (propart.js moves it to `seatPoint` and sets `seat` to the height).
* Shared materials are module-level; screens and the perforated door texture are generated once per page.

## Not covered / human eye
* CMD-1 `sysboard` face is opaque Kit geometry (no glass transparency in `Kit`). The tile count is 20 as the gap asked; the real `SYSTEMS` table has 21 entries, so one system shares a lamp.
* OPS-6 sight glow is not animated here: drive `userData.sight.color` from the integrator. Colours not tuned under the game's room lighting.
