# Medical art, batch 4 (sickbay and morgue)

Files: `js/propart-medical.js` (props), `js/itemart-medical.js` (items), viewer `viewer-medical.html` (`?set=props|wall|items|hand`, `?only=surgical_table,...`, `?cam=x,y,z,tx,ty,tz`, `?spin=0&yaw=0.5`, `?ref=0` hides the 1.75 m reference capsule). All original, pure three.js, shared materials and generated canvas screens (dials, bars, dots; no text, no marks). Nothing in the game imports these yet; the hook-ups are below.

## Props (`kinds` in `js/propart-medical.js`)
`kinds.name(m, h) -> THREE.Group`. `m` and `h` (world.js `mats()` and helpers) are accepted for the batch contract and ignored: the file keeps its own materials. Origin at the floor centre of a 2.5 m tile, front = +z. `group.userData`: `top` (surface height), `mount` (`floor|wall|ceiling`), `size` [w,h,d], `tris`, `spots`.
`spots.<name> = { pos:[x,y,z], ry }` in the prop's local frame. `ry` is the yaw for a person standing there to face the work (forward = (sin ry, cos ry) in x,z). `patient = { pos, head, axis:'z', headDir:-1 }`: lying body origin at the sternum, head toward -z.

| kind | MED | real-world basis | size (m) | top | tris | use points |
|---|---|---|---|---|---|---|
| `steriliser` | 2 | stainless clean bench with two doors; benchtop autoclave 0.6x0.6x0.45 (round 0.3 door, hand-wheel latch, pressure gauge, cycle lamps, display), instrument tray with instruments and a wrapped pack, lidded drum | 1.5 x 0.7, 1.45 high | 0.9 | 1800 | `stand` (-0.2,0,0.7) ry PI; `autoclave_door` (-0.48,1.1,0.4); `tray` (0.34,0.92,0.05) for `scalpel` / `tray` items |
| `surgical_table` | 4 | single 0.3 m column on 1.0x0.6 base, 3-section top (head raised, legs lowered), accessory rails, two arm boards, foot control; ceiling-boom twin-head LED lamp (heads at 2.2 m) | 1.55 x 2.0, lamp to the 3.2 m ceiling | 0.9 | 2500 | `patient`; `surgeon_l` (-0.78,0,0.05) ry PI/2; `surgeon_r` (0.78,0,0.05) ry -PI/2; `anaesthesia` (0,0,-1.15) ry 0; `instruments` (-0.78,0,0.75) |
| `med_dispenser` | 5 | automated dispensing cabinet: top touch panel, six lockable drawers with lamps, output hatch, keypad, card reader, green band | 0.8 x 0.6 x 1.3 | 1.3 | 1100 | `stand` (0,0,0.62) ry PI; `screen` (0,1.19,0.24); `hatch` (-0.14,0.82,0.32); `drawers` (0,0.45,0.32) |
| `exam_couch` | 6 | clinic couch, head section raised 30 deg, paper roll on the head end, paper sheet, gas strut, two-step stool on +x | 1.1 x 1.9, 0.88 high | 0.6 | ~1300 | `patient` (head raised 0.52 rad); `doctor` (-0.75,0,0.1) ry PI/2; `stool` (0.66,0.32,0.35). The paper roll is at the head end as on real couches (the gap list said foot) |
| `autopsy_table` | 7 | stainless dished top with perimeter gutter, drain at the foot (sloped 0.02 rad) and a pipe to the floor trap, perforated downdraft strips, sink pedestal with tap and hand spray (head end, +x), ceiling-hung spring scale with pan (-x) | 1.7 x 2.1 (scale post to the ceiling) | 0.85 | 1750 | `patient`; `pathologist_l` (-0.78,0,0.1); `pathologist_r` (0.78,0,0.35); `sink` (0.7,0,-0.12) ry PI; `scale` (-0.8,0,-0.1) ry PI |
| `infusion_stand` | 8 | IV pole: 5-leg castor base 0.5 m, telescoping pole 1.97 m, 4 hooks, two bags 0.15x0.25, tubing, pump box 0.13x0.2 clamped at 1.0 m. `userData.portable = true` | 0.52 x 1.97 | 1.97 | ~1500 | `handle` (0,1.15,0.2); `bedside` (0.55,0,0); `hooks` list |
| `stretcher_rack` | 3 | wall bracket: two hook arms and a cradle, folded orange stretcher on it (poles, straps with buckles), blank green marker plate. **Wall piece**: origin on the wall line at floor level, +z out of the wall | 0.7 x 2.1 x 0.22 | - | ~900 | `take` (0,0,0.75) ry PI; `grab` (0,1.25,0.2); `userData.item = 'stretcher'` |
| `holo_emitter` | 9 | ceiling projector pod: 0.3 m disc, ring of six lenses, centre lamp, gimbal fork. **Ceiling piece**: built for the 3.2 m wall height, origin at floor level, place at the tile centre | 0.32 disc at y 2.95-3.2 | - | ~400 | `projectFrom` (0,2.86,0): where a hologram body would appear below |
| `gas_panel` | 10 | bed-head trunking 1.2 x 0.25 at 1.4 m: O2 white, air black/white, vacuum yellow outlets, two flow meters, four sockets, red nurse-call button. **Wall piece** | 1.2 x 0.25 | - | ~900 | `stand` (0,0,0.7) ry PI; `outlets` (-0.38,1.4,0.1) |
| `morgue_tray` | 11 | drawer pulled out on rails with a sheet-covered low-poly form and a blank toe tag. **Add-on to `drawers`**: origin = the `drawers` prop origin, add as a child at the same position (or beside it). `h = { col:0..2, row:0..1, pull:0.75 }`; the real 1.8 m pull would leave the tile | pulls 0.75 m | - | 600 | `lie` pos/axis of the form; `stand` in front of the tray |

Triangles are measured in the viewer (labels): the surgical table is over the 1500 target because the lamp is in it.

## Hook-ups for the integrator (files this batch does not touch)
Registry (as asset-gaps.md section 12), `js/propart.js`:
```js
import { kinds as medical } from './propart-medical.js';
export const PROP_ART = { ...medical /*, ...other batches */ };
export const buildPropArt = (kind, m, h) => PROP_ART[kind]?.(m, h) || null;
```
`js/world.js buildProp` `default:` branch (line ~367): `default: { const a = buildPropArt(kind, m, { rbox, box, cyl }); if (a) return a; g.add(rbox(0.8, 0.8, 0.8, m.metal)); }` and add `...Object.keys(PROP_ART)` to `PROP_KINDS`. Props with `userData.top` are climbable/placeable as the others (set `g.userData.top` is already done).

`js/gen.js` sickbay (line ~107): one of each in rooms of 5 tiles or more, the existing biobeds stay:
```js
case 'sickbay': {
  for (const [x, y] of interior) if (rnd() < 0.7 || (x === cx && y === cy)) put(x, y, 'biobed');   // existing
  if (interior.length >= 5) { const free = interior.filter(([x, y]) => !taken(x, y)); // taken: whatever the file uses to see a tile is occupied
    ['surgical_table', 'exam_couch', 'steriliser', 'med_dispenser', 'infusion_stand'].forEach((k, i) => free[i] && put(free[i][0], free[i][1], k)); }
  break; }
case 'morgue': for (const [x, y] of interior) if ((x + y) % 2 === 0) put(x, y, (x + y) % 4 === 0 ? 'drawers' : 'autopsy_table'); break;   // drawers keep a morgue_tray add-on: world.js adds buildProp('morgue_tray') as a child of the first drawers
```
Equipment (`js/equipment.js`), names match the existing script anchors: `EQUIPMENT.workbench.props` / the `sickbay/workbench` anchor -> `steriliser`; `sickbay/replicator` -> `med_dispenser`; `sickbay/desk` couch -> `exam_couch`; `morgue/biobed` -> `autopsy_table`; stand points = `spots.stand` (convert `pos`/`ry` with the prop's rotation); `EQUIPMENT.biobed` lying pose can use `patient.pos` for the surgical table and autopsy table (`top` 0.9 / 0.85, head toward -z). `med` cart pole -> `infusion_stand` (portable).

Decor, `ROOM_DECOR.sickbay` (`js/world.js:494`): its pool lists DECOR kit names; the two wall pieces and the emitter are props, so add them to the same pass as props, e.g. in the decor pass: `if (PROP_ART[name]) { const p = buildPropArt(name); p.position.set(wallX, 0, wallZ); p.rotation.y = faceAngle; g.add(p); }` with `stretcher_rack`, `gas_panel` on walls (origin on the wall line, +z into the room) and `holo_emitter` four per sickbay on the ceiling at tile centres: `ROOM_DECOR.sickbay = [..., 'gas_panel', 'stretcher_rack', 'holo_emitter']`. If a Kit-based DECOR entry is preferred, wrap: `DECOR.gas_panel = () => buildPropArt('gas_panel')`.

## Items (`js/itemart-medical.js`)
`DEFS_MEDICAL = { stretcher, iv_bag, forceps, kidney_dish, bandage }` (rows `{ name, cls, build(g, M, o), base?, lie?, rest? }` as `DEFS` in `js/itemart.js`; each <= 700 tris, no text), `KW_MEDICAL` (regex -> kind rows, first match wins), `buildMedicalItem(kind, opts, M?)` for the viewer.

| kind | frame | size (m) | notes |
|---|---|---|---|
| `stretcher` | grip, centre origin, long axis z, flat; **two-handed** | folded 1.13 x 0.54 x 0.09; `{ open: true }` 2.19 x 0.54 x 0.2 | orange bed doubled over, aluminium poles with rubber ends, straps, hinge sleeve |
| `iv_bag` | base | 0.15 x 0.03 x 0.31 | clear pouch, fluid, ports |
| `forceps` | grip, working end +y, `lie` | 0.07 x 0.21 | haemostat |
| `kidney_dish` | base | 0.25 x 0.04 x 0.12 | steel dish with two instruments |
| `bandage` | base | 0.09 x 0.10 x 0.2 | roll with a loose tail |

Hook-up in `js/itemart.js` (after the last `def(...)`, before `ITEM_KINDS`):
```js
import { DEFS_MEDICAL, KW_MEDICAL } from './itemart-medical.js';
Object.assign(DEFS, DEFS_MEDICAL);
KW.unshift(...KW_MEDICAL);   // before the existing rows: 'dressing', 'clamp', 'tubing' would match crate_med / tool / hose first
```
`js/equipment.js` `ITEMS`: `stretcher: { name: 'folding stretcher', w: 6, two: true, pose: 'tray', model: 'stretcher' }` (the carry hold treats `two: true` as in `tray`; `tickHeld` puts the origin between the hands, which is the stretcher's centre; a `lift` of 0.06 is the default). The wall bracket takes it: taking `stretcher_rack` gives `ITEMS.stretcher`, putting it back hides/shows the folded model in the bracket (`rack.getObjectByName`: the orange bed, poles and straps are children of the group; toggle `visible` on children with y between 0.6 and 1.8 and z about 0.13). Items `iv_bag`, `forceps`, `kidney_dish`, `bandage` are clutter / pickup models only (no ITEMS rows needed).
