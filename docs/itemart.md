# Item art (js/itemart.js)

Original procedural models for everything you pick up or hold. Pure three.js, shared materials / geometries / canvas textures, <= ~500 triangles each (most 80-420), chamfered boxes (44 tris) instead of rounded boxes, glyph/bar decals only (no text, no insignia).
Viewer: `models.html?set=items` (page with `&g=0..6`, 8 kinds per page; `&g=all`; `&scale=1` life size; `&kinds=wrench,mug`; `&frame=grip` shows the hand frame), `?set=itemhand` (handhelds in a crew member's hand via `holdItem`), `?set=itemclutter` (the instanced path).

## API
```js
import { buildItem, buildInstanced, ITEM_KINDS, ITEM_INFO, kindForName } from './itemart.js';
buildItem(kind, { frame, scale, color })   // Group or null
```
* `frame: 'grip'` (default for legacy ids): same frame as `carry.js makeItemMesh(id)`: origin at the grip, working end +y, hanging items (toolbox, medkit, extinguisher, toolbag) hang below the handle, guns/zapper point +z, `userData.rest` and `userData.lie` set as carry.js expects. **`buildItem(id)` is a drop-in for `makeItemMesh(id)`** (`userData.item = id`, so `holdItem(H, mesh)` works; verified in `?set=itemhand`).
* `frame: 'base'`: origin at the bottom centre, lying items already laid down (tricorders flat, screen up), `rest = 0`. For surfaces, clutter, pickups. Kinds authored on their base (battery, chip, circuit, coupling, part, tray, bottle, canister, crates, case, smallbox, clipboard, book, padd, ration) default to it.
* `opts.color` (hex): bottle, canister, mug, book, case, ration. `opts.scale`: uniform.
* `userData = { item, rest, lie, frame, size:[x,y,z] (unscaled), tris }`.
* `buildInstanced(kind, [{x,y,z,ry,s}])` -> `{ group, hide(i), count }`: base frame, parts merged per material (one InstancedMesh per material, 2-6 draw calls per kind). `hide(i)` = what `takeClutter` does now.
* `kindForName(name, shape, hash01)` maps a ship-items.json clutter name (+ shape 0 box / 1 cylinder / 2 flat) to a kind by keyword (table `KW` in the file; unmatched names fall back to a shape-appropriate kind chosen by hash).

Kinds (`ITEM_KINDS`, 49): battery (charge cell), chip (data wafer), circuit, coupling (power coupling), part (spare module), medkit, hypospray, dermal, scalpel, scanner, vial, ration, mug, glass, tray, bottle, canister, crate (olive), crate_hazard, crate_med, smallbox (carton), case, toolbox (amber), toolbag, linen, hose, dumbbell, clipboard, book, padd, badge, tricorder / tricorder_sci (teal), tricorder_med (white/red), tricorder_eng (amber), tricorder_sec (blue), phaser1, phaser2, rifle, zapper, wrench, tool (hydrospanner), torch, flashlight, extinguisher, mop, hook, crowbar.
Colour code: medical white/red, engineering amber, science teal, security blue/graphite, containers olive / cardboard / hazard yellow, tools steel.

## Already hooked up
`js/actors.js makeItem('chip'|'battery'|'medkit')` builds the itemart body (scaled up: chip x5, cell x1.9, medkit x1.35, so they read when floating) inside the old halo; falls back to the old boxes if a kind has no model.

## To hook up (files not touched by this change)
1. **Clutter, js/world.js ~865-876** (the `shapes`/`lists`/`cm` block). Replace the three shared InstancedMeshes with one `buildInstanced` per kind. In `add(...)` choose the kind and a size, keep the record:
```js
import { buildInstanced, kindForName } from './itemart.js';
// in add(): const kind = kindForName(it[0], it[2], h); (lists[kind] ||= []).push({ x, y, z, ry: rndv() * 6.28, s: 1, rec }); rec.y = y + 0.05 (rec.y is only used for the look-at point)
// y = the surface height (floor 0, table 0.78): items are base-frame, so do NOT add sz[1] / 2 any more
// after the loop:
for (const kind in lists) { const l = lists[kind], r = buildInstanced(kind, l); l.forEach((c, i) => { c.rec.inst = { hide: () => r.hide(i) }; }); g.add(r.group); }
```
   and in `takeClutter` (world.js ~1271) replace the `c.inst.im.setMatrixAt(...)` block by `c.inst?.hide()`. Store `rec.kind = kind` too: `classifyItem`/the carried item can then use it directly.
2. **Carried item in the hand, js/carry.js:28** `makeItemMesh(id)`: at the top add `const a = buildItem(id); if (a) return a;` (import from './itemart.js'). Everything else (GRIP, HOLSTER, carts, `userData.rest/lie`) keeps working because the frames match. Cart loads use `makeItemMesh`, so crates and boxes on carts change too.
3. **Handhelds, js/handhelds.js** `model:` field of each row, so the colour-coded tricorders show: tricorder_eng -> `'tricorder_eng'`, tricorder_sci -> `'tricorder_sci'`, tricorder_geo -> `'tricorder_eng'`, tricorder_atmo -> `'tricorder_sci'`, commbadge `'badge'`, toolbag -> `'toolbag'` (currently `'toolbox'`), everything else already matches a kind name (`tool`, `wrench`, `torch`, `flashlight`, `extinguisher`, `mop`, `hook`, `crowbar`, `phaser1`, `phaser2`, `rifle`, `hypospray`, `dermal`, `scalpel`, `padd`). New item ids can be added to `ITEMS` in equipment.js with `model` = any kind (bottle, canister, circuit, coupling, part, clipboard, case, crate_hazard, crate_med, battery ...).
4. **Viewmodel, js/kit.js:100** uses `makeItemMesh(id)`, so step 2 covers it; it also applies `m.rotation.x = -PI/2` for `lie` items, which matches the legacy frames kept here.
5. **Carry classification, js/equipment.js KEYWORDS / main.js classifyItem**: `classifyItem` returns legacy ids; `kindForName` is the finer map and can be used for the model of a carried clutter item (`G.carry.kind = rec.kind`).

## Name keyword -> kind (summary of `KW`)
| keywords in the item name | kind |
|---|---|
| tricorder, bioscanner, survey meter | tricorder_sci |
| hypospray, injector | hypospray |
| dermal, wound, cold-laser | dermal |
| scalpel | scalpel |
| med kit, first aid, trauma kit | medkit |
| vial, specimen, sample tube, cuvette | vial |
| tool bag | toolbag |
| toolbox, tool kit/case, socket set, torx, hex key | toolbox |
| spanner, wrench, pliers | wrench |
| pry bar, crowbar | crowbar |
| mop / extinguisher | mop / extinguisher |
| torch, flashlight, headlamp, lantern | flashlight |
| driver, drill, impact, soldering, multimeter | tool |
| hook | hook |
| hose, tubing, cable spool, patch cord, coil | hose |
| comm badge/communicator/pin, name tag | badge |
| data slate, padd, tablet | padd |
| clipboard | clipboard |
| book, manual, binder, log, notebook, folder | book |
| isolinear, data chip, memory card, wafer | chip |
| circuit, pcb, card, board, processor | circuit |
| coupling, conduit, relay, fuse, connector, capacitor | coupling |
| battery, cell, power pack | battery |
| crate / hazard, biohazard / medical supply | crate / crate_hazard / crate_med |
| case, lockbox, bag, satchel | case |
| canister, gas, foam, sealant, spray, drum, tin, flask | canister |
| bottle, jar, oil, wine, sauce, juice | bottle |
| mug, cup, coffee, tea | mug |
| glass, flute, tumbler, beaker | glass |
| tray, plate, meal, bowl | tray |
| ration, snack, biscuit, pouch, packet, candy | ration |
| linen, towel, blanket, sheet, cloth, glove, mat | linen |
| dumbbell, weight | dumbbell |
| box, carton, parts, spares, kit, pack, supply | smallbox |
| spare, module, valve, pump, filter, gear, motor, sensor, panel | part |
| (no match) | by shape: box -> smallbox/case/part/crate_hazard/circuit, cylinder -> canister/bottle/mug/vial, flat -> clipboard/padd/book/circuit |

## Notes for a human eye
Look at the hand-held scale (`?set=itemhand`) in the game's first person; the dimensions follow the old models (grip origin) but several are chunkier than before (tricorder, phaser1). Lid hinge on tricorders is a hint, not an animated fold. Mop and crowbar are long (1.3 m / 0.6 m) as before.
