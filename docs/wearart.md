# Wear art, batch 9 (`js/wearart.js`)

Viewer: `viewer-wear.html` (serve the repo root, e.g. `python3 -m http.server 8130`). Sets: `?set=outfits` (default), `moving` (walk clip), `suit`, `head`, `lie`, `don` (filmstrip of the donning gestures), `items`. Options: `?only=coverall,scrubs`, `?body=crew_f` (force one body), `?clip=walk`, `?cam=x,y,z,tx,ty,tz`, `?focus=hand_l&d=0.7`, `?spin=1`, `?static=1` (render once), `?rest=1` (T-pose).

Covers asset-gaps.md section 11.2 W-1, W-2, W-3, W-4, W-7, W-8 and section 11.3 K-1, K-4 (batch 9). Not covered: W-5 lab coat and W-6 hazmat suit (batch 11 by the plan), the ENG-10 pouch and OPS-7 item as separate art (batch 8 / 11), but a stowed half mask and headset item are included because the worn forms need an item form.

## What it is
The crew meshes keep only the visible skin: the casual clothes (`garment_*`) are the only torso and leg surface, and `crew_m` has no upper arm in its body mesh at all. So an outfit is not a decal on the body but a replacement garment:

* `wearOutfit()` measures the human at its rest pose (bone positions, vertex positions, skin weights), hides the casual garment, and builds ONE `SkinnedMesh` on the human's own bones: the garment triangles pushed out 5 mm along welded normals, vertex colours for cuffs, hems, knee pads, plus the missing forearm taken from the body mesh on short-sleeved bodies (`crew_f`, `crew_f2`), plus rigid trim (pockets, collar, buttons, bands) skinned 100 % to one bone. Up to three draw calls (cloth, trim, glass). No per-frame cost beyond ordinary skinning.
* Everything is measured in the human's own group space, scaled by a body-size factor, so it fits `crew_m`, `crew_f`, `crew_f2`, `crew_heavy` (and the pressure suit). The pose is saved and restored, so it can be called on a human that is already animating.
* Pure three.js plus `js/movement.js` (pure logic). It does not import any game module, so `js/humans.js` may import it.

## API
```js
import { wearOutfit, wearHeadgear, outfitFor, OUTFITS, HEADGEAR,
         GESTURES_WEAR, DON, Donner, LIE_POSES, applyLie, clearLie, BUNK_LIE,
         DEFS_WEAR, KW_WEAR, buildWearItem, WEAR_ITEM_KINDS } from './wearart.js';

const w = wearOutfit(human, 'coverall' | 'scrubs' | 'whites' | 'apron' | 'gloves' | 'suit', opts);
//   human = the Group from makeHuman() (needs human.userData.human). opts: color (hex), gloves (scrubs, default true), apron / cap (whites, default true),
//   helmet (suit, default true: the bubble helmet is built hidden), helmetShown, keepGarment (do not hide the casual clothes)
//   -> { id, meshes, tris, setVisible(v), showHelmet(v), remove() } or null (no body mesh)   also pushed on human.userData.worn
const h = wearHeadgear(human, 'mask' | 'hood' | 'headset' | 'cap', opts);   // same handle
outfitFor(person)   // { outfit, opts } for a js/crew.js roster entry: engineering -> coverall, medical -> scrubs, cook / galley -> whites; null otherwise
```

| id | gap | what | tris (crew_m / crew_f / crew_f2 / crew_heavy) | notes |
|---|---|---|---|---|
| `coverall` | W-2 | one-piece boiler suit: stand collar, front zip, two chest pockets with flap and button, knee pads (darker), reflective calf bands (metallic pale yellow), dark cuffs, long sleeves | 4160 / 5690 / 4900 / 8360 | colour: `opts.color`, default slate blue 0x3b4d6b |
| `scrubs` | W-3 | short-sleeve V-neck top (sleeves long on `crew_m`: its body has no arms to show) and straight trousers in pale teal, chest and hip pockets, nitrile gloves | 3920 / 4880 / 4040 / not measured | gloves are rigid finger capsules on the finger bones (about 600 tris), `opts.gloves = false` to omit |
| `whites` | W-4 | double-breasted white jacket (3/4 sleeves, mandarin collar, six buttons, hem band), charcoal trousers, bib apron with neck loop, waist ties and bow and a patch pocket, skull cap | 3910 (`crew_m`, no apron or cap) to 4460 (`crew_m`, all pieces), 6560 (`crew_f2`), 8500 (`crew_heavy`) | `apron: false`, `cap: false`; `wearOutfit(h, 'apron')` alone adds just the apron over any clothes |
| `suit` | W-1 | for the existing `suit.glb` body: division-colour chest band and two upper-arm bands, bubble helmet (hidden until donned) | 648 | build the body with `makeHuman({ kind: 'suit', kit: false })`; `opts.color` = the division colour |
| `mask` | W-7 | half-face breather: moulded shell, two side filters with amber caps, speaking diaphragm, face strap and back strap | 592 | pinned to `Head` |
| `hood` | W-7 | clear escape hood with a yellow neck seal | 460 | |
| `headset` | W-8 | single ear cup (70 mm) on the left, band over the head, boom to the mouth with a mic ball, right ear pad, status light | 480 | |
| `cap` | W-4 | skull cap | 326 | part of `whites` |

Face and hair are measured per body, so headgear sits on any of the four crew bodies. Worn pieces are skinned meshes: they bend with the pose (checked with the walk clip).

## Donning (K-4) and lying (K-1)
`GESTURES_WEAR.don_suit` (3 s) and `.don_hood` (1.5 s) are in the `js/movement.js` `GESTURES` format with `states: ['operating']`, using only RIG channels: step in (thigh lift), haul up (waist bow, both arms), zip from belt to collar; hood: both hands up, down over the head, settle. `DON[id].swapAt` is the fraction of the gesture at which the garment appears.
```js
const d = new Donner(human, 'don_suit', wearHandle);   // hides wearHandle, plays the channels in H.add, shows it at swapAt (and the suit helmet)
// each frame, before H.update(dt):  if (!d.update(dt)) /* finished */;
```
`applyLie(human, 'supine' | 'left' | 'right', { top, yaw, t })` lays a human on a surface of height `top` (use the bunk or biobed prop's `userData.top`): the 'idle' clip is the base, the group is rotated flat, the root is lifted by the back thickness, a hand rests on the chest, knees bend a little (side poses curl up), slow breathing on the spine from `t` (seconds). It registers `calf_l` / `calf_r` in `H.bones` because the RIG has no knee channel. Call it every frame (cheap) or once with a fixed `t`. `clearLie(human)` undoes it. The shadow blob is hidden while lying.

## Stowed forms (`DEFS_WEAR`, `KW_WEAR`, itemart.js row format)
All base-frame (origin at the bottom centre, lying) except `headset` (grip frame, `rest 0.04`). `build(g, M, o)` ignores `M` (own materials), so the rows can be spread straight into `DEFS`.

| kind | name | cls | size (m) | tris |
|---|---|---|---|---|
| `coverall` | folded coverall (collar, pocket flap, reflective strip) | household | 0.43 x 0.15 x 0.31 | 308 |
| `scrubs` | folded scrubs (V-neck top over trousers) | medical | 0.32 x 0.13 x 0.24 | 232 |
| `apron_fold` | folded apron (neck loop, ties) | food | 0.30 x 0.07 x 0.34 | 376 |
| `skullcap` | galley skull cap | food | 0.20 x 0.10 x 0.20 | 244 |
| `gloves_nitrile` | nitrile gloves, pair (`opts.color`) | medical | 0.25 x 0.08 x 0.24 | 624 |
| `suit_bag` | rapid-don suit bag (division stripe, red pull handle, helmet bulge) | household | 0.65 x 0.33 x 0.31 | 332 |
| `half_mask` | half-face breather mask | engineering | 0.20 x 0.08 x 0.22 | 424 |
| `headset` | headset with boom mic | data | 0.23 x 0.18 x 0.21 | 464 |

`gloves_nitrile` is over the 500 budget (two hands with five fingers each). `KW_WEAR` rows: coverall / boiler suit / overalls, scrubs / medical tunic, apron / galley whites, skull cap / hairnet, gloves / gauntlets (all 70 `gloves` names in `ship-items.json` land here), pressure / vacuum / EVA / hazmat suit, respirator / half mask, headset / headphones / boom mic.

## Integration (nothing here edits an existing file; these are the exact hook-ups)
1. **Items**, `js/itemart.js`: `import { DEFS_WEAR, KW_WEAR } from './wearart.js';` then next to `Object.assign(DEFS, DEFS_GALLEY, DEFS_MEDICAL);` use `Object.assign(DEFS, DEFS_GALLEY, DEFS_MEDICAL, DEFS_WEAR);` and next to the `KW.unshift(...)` line `KW.unshift(...KW_WEAR, ...KW_MEDICAL, ...KW_GALLEY);` (the rows must come before the `linen` row, which matches `glove|uniform`, and before the generic `kit` / `suit`-like rows). `ITEM_KINDS` / `ITEM_INFO` are derived from `DEFS`, so nothing else changes. If batch 11 also adds a `headset` item, keep one of the two.
2. **Gestures**, game init (not `movement.js`): `import { GESTURES } from './movement.js'; import { GESTURES_WEAR } from './wearart.js'; Object.assign(GESTURES, GESTURES_WEAR);` (`GESTURES` is a mutable export). Then in `js/equipment.js` the `suitrack` entry gets a step `st('don_suit', [3, 3], { fx: 'don_suit' })` before its idle; the game-side `fx` hook calls `wearOutfit(body, 'suit', { color: uniform })` on a `makeHuman({ kind: 'suit', kit: false })` swapped in at the same position (the suit is a different body kind), or for the hood `wearHeadgear(body, 'hood')` + `Donner`.
3. **Outfits on crew**, `js/humans.js` `makeHuman`: add `import { wearOutfit } from './wearart.js';` and at the end, after `g.userData.human = H; H.play('idle', ...)`:
   ```js
   if (opts.outfit) g.userData.outfit = wearOutfit(g, opts.outfit, opts.outfitOpts || {});
   ```
   and where NPCs are spawned (`js/main.js`) pass `const o = outfitFor(person); makeHuman({ ..., outfit: o?.outfit, outfitOpts: o?.opts })`. `kit: false` is not needed: the belt, name plate and pips from `addKit` stay on top of the outfit (the belt sits on the garment's outer radius; the shell is 5 mm out, the belt 7 mm further).
4. **Breather and headset in use**, `js/main.js` alert handling: on `fire` / `contamination` give the player-visible crew `wearHeadgear(body, 'mask')` (or `'hood'`), remove on all-clear (`handle.remove()`); comms / helm / sensor billets get `wearHeadgear(body, 'headset')` at spawn.
5. **Lying (K-1)**: `EQUIPMENT.bunk` stays `stance: 'sit'` for the day; for `anim: "sleeping"` / `"lying"` blocks use the row `BUNK_LIE` (`stance: 'lie'`, `lie: 'supine'`). In the operator / sim glue, when an operator whose stance is `'lie'` is placed, call `applyLie(mesh, def.lie, { top: prop.userData.top ?? 0.52, yaw: propYaw, t })` each frame instead of `STANCE_CLIP.lie`'s `sitting_idle`, and `clearLie(mesh)` when it stands up. Biobed patients use the same call with `top = 0.9`. The bunk prop's `userData.top` is the mattress height.

## Notes and limits
* Measured on the four crew bodies and the suit; any other body needs a `body` mesh with material `body`, a `garment_*` mesh and the standard bone names.
* `crew_f2`'s sportsuit is a crop top: `whites`, `coverall` and `scrubs` fill the midriff from the body's own torso surface.
* `crew_m` has no arm geometry in its body mesh: scrubs keep long sleeves there; the other bodies get short sleeves with bare arms.
* The seam between a garment sleeve end and the body-derived forearm is a ring of slightly different radius, hidden by the cuff colour; V-neck and hem edges are as ragged as the source garment (2 cm vertex spacing).
* The viewer's `outfits` set is crowded on purpose (the label shows the triangle count); use `?only=` for a closer look.
