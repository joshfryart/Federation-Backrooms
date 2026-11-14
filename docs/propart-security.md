# Batch 8 art: security and damage control

Files: `js/propart-security.js` (props), `js/decorart-security.js` (`DECOR_SEC`), `js/itemart-security.js` (`DEFS_SECURITY`, `KW_SECURITY`), shared helper copy `js/propart-kit2.js` (see `docs/propart-stations2.md`).
Viewer: `viewer-security.html` (`?set=props|decor|items|all`, `?only=cellfield`, `&static=1`, `&yaw=0.6`, `&zoom=0.7`).
Contract: as `docs/propart-stations1.md` (`export const kinds`, origin floor centre, +z front, `userData` `tris` `box` `size` `[w, d, h]` `spots` `use`).

## Props

| kind | gap | real analogue | size w x d x h (m) | tris | use |
|---|---|---|---|---|---|
| `cellfield` | SEC-2 | custody cell with an emitter portal front instead of bars: bunk with mattress and pillow, steel toilet and cistern, wall basin, portal rails 1.9 x 0.12 x 0.12 (top and bottom) with 26 emitter studs (every 0.15 m), two posts, translucent field plane (`userData.field` = its material: `.opacity` 0.14 live, 0 = down), a control pedestal outside the right post with status lamp and keys | 2.3 x 1.55 x 2.07 | 676 | same footprint and spot as `cell`: `box [-0.95, 0.95, -0.9, 0.6]`, spot `[0, 1.05, PI]`; `use.emitter`, `use.panel`; `userData.variant = 'cell'` |
| `chargerack` | SEC-3 | battery charging cabinet 0.9 x 0.5 x 1.8: five shelves x eight slots (40 bays, 37 cells, a lamp per slot: green / amber / red, three empty), fan grille at the bottom, master gauge + readout + isolator lever at eye height, side vents | 0.9 x 0.5 x 1.8 | 2028 | standing `[0, 0.78, PI]` (+- 0.3); `use.read`, `use.swap`, `use.shelves` |
| `issuecounter` | SEC-7 | armoury issue counter: 1.5 m wide, steel top at 1.05 with ESD mat, nine drawer fronts on the staff side (+z), mesh screen to 2.1 m with a 0.5 x 0.3 m pass-through at 1.1 m and ledge tray, sign-out board on the right upright (faces the staff), log tablet, scanner puck, lamp | 1.56 x 0.8 x 2.1 | 568 | staff `[0, 0.75, PI]` (+- 0.4); customer side `use.customer` (-z); `use.hatch` |

Tri counts are in `userData.tris`; all under the 3000 budget.

## Wall kits (`DECOR_SEC`, Kit format, merge into `DECOR`)
| kit | gap | contents |
|---|---|---|
| `dclocker` (580 tris) | ENG-8 | red floor-standing repair locker 1.2 x 0.45 x 1.9, double door, stencilled cream band with red marks, open vision strip (`Kit` has no transparent material, so a frame only) showing a helmet shelf with two helmets, a hose reel and a patch board, lever latch with seal tag, status lamp |
| `emitterpost` (456) | SEC-4 | door-frame pair of 0.1 x 0.1 x 2.2 m posts 1.2 m apart with 14 glowing studs each on the inner faces (needs a 1.4 m clear wall run) |
| `camdome` (212) | SEC-4 | 0.12 m smoked dome on a wall plate at 3.0 to 3.2 m with a red record lamp |
| `badgereader` (128) | SEC-4 | 0.09 x 0.14 m wall pad at 1.2 m: coil ring, lamp bar, card slot |

## Items (`DEFS_SECURITY`, `KW_SECURITY`)
`patch_plate` (ENG-9: 0.3 m dished steel plate, rubber rim, T-handle strongback), `pipe_clamp` (ENG-9: split-sleeve 0.15 m, two through-bolts, gasket ends), `seal_gauge` (ENG-9: hand-held manometer, lit dial, pistol grip, 0.3 m probe hose; grip frame, hose hangs down and forward), `breather` (ENG-10: stowed orange foil pouch 0.25 x 0.2 x 0.08 with a red pull tab), `cuffs` (SEC-5: pair of 80 mm graphite rings on a 60 mm hinge bar, status lamp). Tris: 364 / 412 / 464 / 344 / 360. Base frame except `seal_gauge`. Hook-up per the file header (`Object.assign(DEFS, DEFS_SECURITY)`, `KW.unshift(...KW_SECURITY)`, `ITEMS.*` ids = kinds). The `dc` loadout in `js/handhelds.js` can take `model: 'seal_gauge'`.

## Suggested placement and equipment mapping
| piece | room | notes |
|---|---|---|
| `cellfield` | brig: `cell` variant flag in `gen.js` (alternate by hash or one in two), `EQUIPMENT.cell.props` add `cellfield` (same spots and box) | `armory.emitter_walk`, `dep.brig_check`, `sec.brig_check` ("test field"); `userData.field` opacity can follow the cell's locked state |
| `chargerack` | armory, against a wall | `SYSTEMS.armory` host `chargerack` (part "Charging racks x2": place two, or one plus the old `weaponrack`); `armory.charger_round`, `cos.armory_check`; `console` script with its spots |
| `issuecounter` | armory, across the door so the screen faces the entrance; staff side toward the room | `armory.issue_returns` spot `desk` -> `issuecounter` (`SPOT_ALIAS`); `desk` is a seated script, so give it a standing script (`console`) with spot `[0, 0.75, PI]` |
| `dclocker` | corridor, stores, plant, engineering walls | `dc.locker_audit`; `ROOM_DECOR.corridor/stores` |
| `emitterpost`, `badgereader`, `camdome` | corridor and brig, near doors | `dep.patrol_rounds` "test camera and badge reader"; `ROOM_DECOR.corridor / brig` |

## Hook-up notes
* `js/propart.js`: import `kinds as SECURITY` from `./propart-security.js`, extend `PROP_ART` / `PROP_BATCH`; `NO_CLIMB` add `chargerack` (cells on shelves), `cellfield` (portal rails); `issuecounter` (top 1.05) is climbable only on the staff side, probably add it too.
* `cellfield` collision: reuses the old cell box, so `World.propBox` is unchanged; the pedestal sits at x 1.06 (inside the 1.15 m limit).

## Not covered / human eye
* SEC-6 scan arch is batch 11 and not built.
* Wall fixtures use opaque Kit geometry: the DC locker vision strip has no pane.
* No tuning under the game's room lighting; the field plane opacity (0.14) may need adjusting.
