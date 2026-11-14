# Galley and lounge art, batch 2 (js/propart-galley.js, js/itemart-galley.js)

Original procedural models, pure three.js, own shared materials and generated canvas textures (brushed steel, walnut veneer, slat panelling, hob rings), no text or marks. Every prop is baked to one mesh per material (about 6-12 draw calls). Viewer: `viewer-galley.html?set=galley|lounge|props|items` (`&only=range`, `&spin=0`, `&cam=x,y,z,tx,ty,tz`, `&ref=0`; a 1.75 m capsule stands beside each prop; items at 2x, or `&scale=1&frame=grip`).

Contract: `export const kinds = { name: (m, h) => THREE.Group }` (arguments unused, the module is self-contained). Origin at the floor centre of a 2.5 m tile, front faces +z. `userData`: `top` (surface height), `box` ([x0,x1,z0,z1] footprint, the form `EQUIPMENT.*.box` uses), `spots` (EQUIPMENT-style `[x, z, ry]`), `seat`, `use` (named `{x,z,ry}` points), `size`, `tris`.

## Props
| kind | asset | size (x, y, z m) | notes / points |
|---|---|---|---|
| `range` | SVC-1 six-zone induction range, two oven doors, 6 knobs, front pot rail, rear riser, stock pot and pan on top, canopy hood 1.0x0.9 at 2.0 m with two baffle filters and a duct to 3.2 m | 0.9 x 3.2 x 0.8 | top 0.9; cook stands at `use.cook` (0, 0.62, ry PI); `box [-0.45,0.45,-0.4,0.4]` |
| `range_bare` | same without hood and duct | 0.9 x 1.07 x 0.8 | for rooms where the hood would hit something |
| `servery` | SVC-2 stainless hot-pass: three wells (two lidded, one open with food), glass sneeze guard with heat lamp, three-bar tray rail on the diner side (+z), plate stack, tray stack | 2.2 x 1.45 x 0.8 | top 1.0; `use.staff` (-0.24,-0.7,ry 0), `use.diner` (-0.24,0.95,ry PI); `box [-1.1,1.1,-0.4,0.4]` (the tray rail reaches z 0.63) |
| `bar` | SVC-3 straight bar section, top 1.05 m, 0.6 deep (0.25 overhang to +z), leather arm rail, brass foot rail at 0.22 m, tap tower with three handles, bottle and glasses, three stools at x -0.7/0/0.7, z 0.55 | 2.2 x 1.46 x 0.77 | `seat` 0.75; `spots [[-0.7,0.55,PI],[0,0.55,PI],[0.7,0.55,PI]]`; `use.seats[]`, `use.tap`; tileable along x (end trims); `box [-1.1,1.1,-0.3,0.3]` |
| `bar_plain` | bar without stools | 2.2 x 1.46 x 0.6 | |
| `barstool` | swivel stool, seat 0.75 m, deck-bolted 0.44 m plate, foot ring | 0.44 x 0.75 x 0.44 | `seat` 0.75 |
| `barback` | back-bar unit: counter, mirror, two lit shelves with 34 bottles, glasses | 2.24 x 1.99 x 0.54 | place against the wall behind the bar, facing the bar side (+z) |
| `wastebin` | SVC-12 20 L pedal bin, domed lid, recycling stripe | 0.31 x 0.46 x 0.38 | `use.drop` (0,0.5,ry PI) |
| `dishwasher` | SVC-13 pass-through hood machine with inlet table (sink, pre-rinse spray, 0.5 m rack of plates) and exit table (rack, clean plates) | 2.15 x 1.72 x 0.75 | top 0.86; `use.load` (-0.6,0.62), `use.unload` (0.72,0.62), `use.rinse` (-1.0,0.62), all ry PI; `box [-1.15,1.0,-0.38,0.38]` |

Note the dishwasher follows asset-gaps SVC-13 (hood pass-through type), not an undercounter unit. The wall recycler slot of SVC-12 is a wall fixture (decorart), not built here.

## Items (js/itemart-galley.js)
`DEFS_GALLEY` (rows as `js/itemart.js` `def`) and `KW_GALLEY` (put it before the existing `KW`).
| kind | size | frame |
|---|---|---|
| `ladle` | 0.35 m, 90 mm bowl | grip at handle, bowl +y opens +z |
| `stockpot` | 0.40 dia x 0.39 with lid | origin at the +x loop handle, pot hangs below / -x |
| `fryingpan` | 0.30 pan, 0.2 m handle | grip mid handle, pan +y, `lie`+`flat` (lies flat in base frame) |
Each under 1000 tris (ladle 466, stock pot 944, pan about 560): ladle and pan inside 500 budget except the stock pot (944, round lathes; trim `seg` if it matters).

## Hook-up snippets for the integrator
```js
// js/world.js (top)   import { kinds as GALLEY } from './propart-galley.js';
// buildProp default:  default: { if (GALLEY[kind]) return GALLEY[kind](m); g.add(rbox(0.8,0.8,0.8,m.metal)); }   // and add the names to PROP_KINDS
// js/equipment.js
stove:   props: ['range'],      box: [-0.45, 0.45, -0.4, 0.4],  steps[0]: st('stir_pot', [2,3], { hold: 'ladle', cue: 'sizzle' }),
counter: props: ['servery'],    box: [-1.1, 1.1, -0.4, 0.62],
bar:     props: ['bar'],        seat: 0.75, box: [-1.1, 1.1, -0.3, 0.3], spots: [[-0.7,0.55,PI],[0,0.55,PI],[0.7,0.55,PI]],   // bar stools are part of the prop
sinkunit/mess: add 'dishwasher' (props: ['dishwasher'], box [-1.15,1.0,-0.38,0.38], spots [[-0.6,0.62,PI],[0.72,0.62,PI]]) for cook.galley_clean
// js/equipment.js ITEMS: ladle: { model: 'ladle' }, pot: { model: 'stockpot' }, pan: { model: 'fryingpan' }
// js/itemart.js: import { DEFS_GALLEY, KW_GALLEY } from './itemart-galley.js'; Object.assign(DEFS, DEFS_GALLEY); KW.unshift(...KW_GALLEY);
// js/gen.js
case 'mess':   put the 'range' (against a wall, rotated so +z faces the room), a 'servery' in front, 'dishwasher' on the galley wall, a 'wastebin' in a corner;
case 'lounge': replace the table/sofa mix on one wall with a 'bar' (rotate +z into the room) and a 'barback' 1.3 m behind it; keep sofas elsewhere; 'barstool' can be scattered.
```
The range's hood and duct reach 3.2 m (WH): do not put another prop above it.

## Needs a human eye
Seat/standing offsets (bar spots z 0.55, cook z 0.62) are from dimensions, not tested with the sit clip. Stock pot tri count above 500. Servery open-well food is a flat colour block.
