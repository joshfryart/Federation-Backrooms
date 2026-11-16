# Flight deck and cargo art, batch 6 (`js/propart-flight.js`, `js/itemart-flight.js`)

Viewer: `python3 -m http.server 8130`, then `viewer-flight.html` (`?set=props|wall|items|hand`, `?only=fuelbowser,hoversled`, `?cam=x,y,z,tx,ty,tz`, `?spin=0&yaw=0.6`, `?ref=0` hides the 1.75 m capsule, `?scale=1`). All original, pure three.js, shared materials. Nothing in the game imports these yet.

## Props (`kinds` in `js/propart-flight.js`)
`kinds.name(m, h) -> THREE.Group`; `m` and `h` are ignored. Origin at the floor centre (wall piece: on the wall line), +z front, one mesh per material. `userData`: `top`, `box` `[x0,x1,z0,z1]`, `spots` `[[x, z, ry]]`, `use` named `{x, z, ry}` (forward = (sin ry, cos ry)), `size`, `tris`, `dept`; carts add `handle` (1.16) and `portable`. `META` (id, rooms, EQUIPMENT script, `wall`) is exported.
Cart-like props (`fuelbowser`, `hoversled`) have the long axis on z and the push handle at the rear (-z) at 1.16 m, like `CARTS` in `js/carry.js` (`makeCart`); the pusher stands at (0, -1.35) with ry 0. The cradle has its long axis on x (nose +x), like the `shuttle` prop in `buildProp`.

| kind | gap | real analogue | size (m) | top | tris | use points |
|---|---|---|---|---|---|---|
| `shuttle_cradle` | FLT-3 | aircraft dolly: frame with two padded keel rails, four castor bogies, corner bumpers, tie-down rings, tow plate and eye | 3.2 x 1.6, 0.25 high (spans two tiles on x) | 0.25 | 1096 | `walk` (0, 1.1) ry PI; `tie_fwd` (1.5, 1.0); `tie_aft` (-1.5, 1.0); `craftLift.y` 0.25: raise the `shuttle` mesh by 0.25 so it sits on the pads |
| `padmark` | FLT-3 | painted landing pad: 4 x 4 m outline, two nested corner chevrons per corner, centre cross, edge ticks. Flat decal at y 0.008 (polygon offset), `userData.decal = true`, `noCollide` | 4 x 4 (2 x 2 tiles) | - | 312 | none; centre it on the cradle |
| `fuelbowser` | FLT-5 | aviation fuel bowser: 1.4 m x 0.7 m insulated tank with dished ends, hose reel (5 m) at the rear, bayonet nozzle in a holster, earth-bond reel and clamp, 4 wheels, tow bar and eye, push handle 1.16 m | 0.95 x 2.4 | 0.91 | 2544 | `push`/`reel` (0, -1.35) ry 0; `nozzle` (0.75, 0.25) ry -PI/2; `earth` (-0.8, -0.3) ry PI/2; `filler` |
| `pallet` | SVC-6 | composite 1.2 x 1.0 x 0.15 m pallet, nine feet, fork pockets, non-slip deck | 1.2 x 1.0 | 0.15 | 264 | `stand` (0, 0.95) ry PI; `pocket_x` |
| `pallet_loaded` | SVC-6 | pallet with four 0.56 x 0.5 x 0.46 m crates, cargo net (alpha-tested texture on one box) and two hi-vis straps with ratchet buckles | 1.2 x 0.67 x 1.0 | 0.67 | 780 | `stand`; `strap` (0.25, 0.67, 0.28) |
| `hoversled` | SVC-9 | air-caster pallet mover: 0.9 x 1.3 x 0.12 deck floating 0.08 m, four glowing pads with additive light pools on the floor, tie-down slots, T-handle tiller 1.16 m with thumb control; no wheels. `userData.hover = 0.08` | 0.9 x 1.3, 1.2 to the handle | 0.2 | 998 | `push` (0, -1.35) ry 0; `load` (0.8, 0) ry -PI/2 |
| `coldstore_door` | SVC-5 | walk-in cooler front, **wall piece**: insulated panel 2.2 x 2.3 with joint ribs and cam-lock dots, 0.9 x 1.9 opening, door swung 55 degrees (lever latch, kick plate), strip curtain, dark interior, temperature display and alarm lamps | 2.2 x 2.3, door swing to z 0.95 | - | 828 | `stand` (0, 1.1) ry PI; `enter` (0, 0.4); `display`; `latch` |
| `reachin_cooler` | SVC-5 | free-standing two-door stainless reach-in cooler, vertical handles, display header | 1.4 x 0.8 x 2.0 | 2.0 | 448 | `stand` (0, 0.75) ry PI; `display` |

## Items (`js/itemart-flight.js`): FLT-6, SVC-7, SVC-8
`DEFS_FLIGHT`, `KW_FLIGHT`, `buildFlightItem(kind, opts, M?)`, same format as `itemart-medical.js`. Budget 500 tris (ratchet_strap is ~536).

| kind | gap | what | frame | tris |
|---|---|---|---|---|
| `wheel_chocks` | FLT-6 | two 0.25 x 0.12 x 0.12 m yellow rubber wedges with grooves and rope eyes, 0.5 m rope between | base | 416 |
| `tiedown_strap` | FLT-6 | 25 mm blue webbing in a loose loop, ratchet buckle, two snap hooks | base | 472 |
| `ratchet_strap` | SVC-7 | 50 mm hi-vis webbing rolled to a 0.15 m coil, 0.2 m ratchet buckle with handle, two J-hooks | base | 536 |
| `tag_scanner` | SVC-8 | pistol grip 0.18 m, head with a red scan window, screen on the back, wrist lanyard; aims +z | grip, `lie` | 288 |

## Hook-up for the integrator (not done here)
* `js/propart.js`: import `kinds` as `FLIGHT`, add to `PROP_ART` / `PROP_BATCH`; `PROP_ART_FIXTURES` gets `coldstore_door` (wall piece); `padmark` is a floor decal (no collision; draw before props or as a child of the shuttlebay `pad`/`shuttle` tile). Add `fuelbowser`, `hoversled`, `reachin_cooler` to the climb rules as needed.
* `js/itemart.js`: `Object.assign(DEFS, DEFS_FLIGHT); KW.unshift(...KW_FLIGHT)`. `ITEMS` ids equal the kinds; `crate` script `hold: 'tag_scanner'`.
* The gap list proposes carts in `js/cartart.js` (`CARTS.sled`, `CARTS.bowser`): `hoversled` and `fuelbowser` are built as props with the same long axis, handle height and rear-handle layout, so the integrator can either place them as floor props or lift their meshes into `makeCart` (the sled has no wheels, `hover` 0.08).
* Suggested placement and equipment mapping:

| room | placement | `EQUIPMENT` script |
|---|---|---|
| shuttlebay | `padmark` under the `shuttle` with `shuttle_cradle` on it (raise the shuttle 0.25); alias `pad` -> `shuttle_cradle` so FLT-3's 43 `shuttlebay/pad` duties have a target; `fuelbowser` parked against a wall; `hoversled` near the door | cradle -> `pad`/`shuttle` points (`walk`, `tie_*`), `fuelbowser` -> `cart` (deck `fuel_and_stores`), `hoversled` -> `cart` (deck `cargo_sled`) |
| cargo | `pallet` and `pallet_loaded` instead of loose `crate`s (a `crate` script can run on either: spot `stand`), `hoversled` | `crate`, `cart` |
| stores | `coldstore_door` on a wall, or `reachin_cooler` free-standing; `pallet` | the cold-store duties (`cook.cold_store_check`, `qm.stock_audit`) at `stand` |

## Gaps from the list not covered
None of batch 6 is skipped. FLT-7 (tether), FLT-8 (work pod), FLT-9 (maintenance stand) are batch 11. The cart slots in `makeCart` (`CARTS.sled`, `CARTS.bowser`) are not edited (no existing file may change): see the hook-up note above.

## Human eye needed
Colour of the painted pad marking under real lighting; whether the cradle height (0.25) suits the `shuttle` mesh's ground clearance; the strip curtain transparency in the real room; ratchet_strap is about 36 tris over the item budget.
