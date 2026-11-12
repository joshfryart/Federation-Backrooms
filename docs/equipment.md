# Equipment motions, carrying and carts

Crew who reach their scheduled spot now *use* the furniture there instead of freezing in one clip, people carry things, and carts roll around the deck.

## Files
- `js/equipment.js` (pure, node-testable): `EQUIPMENT` table, one entry per prop kind / schedule spot (39 entries: every kind `js/gen.js` places, every `PROP_KINDS` model, plus spot-only entries `junction`, `locker`, `bar`, `counter`, `stove`, `mat` and the generic fallback `post`). Each entry: `stance` (stand / sit / kneel), `seat` height, `spots` (body root in the prop's frame) or `box` + `gap`, base `clip`, and a looping use script of `steps` `{ g gesture, clip, dur, hold / holdL item, pose, cue, fx, p chance, needs }` plus `rest` and `idle` gestures. `SPOT_ALIAS` maps schedule spots (`captain_chair`, `serving_line`, `door`…) to entries; `propsFor(spot)` tells `simTileFor` which props a spot means (bar -> table, locker -> shelving / drawers / racks).
  - `standPoint(def, prop, from, taken)` puts the body at a free seat / use point on the side it walked in from; when every seat is taken a sitter stands by instead of sitting on air.
  - `useScript(kind, person, seed, cycle, opts)` is deterministic per person/seed/cycle; `Operator` advances it with `dt` and returns `{ clip, speed, ch, face, hold, holdL, cue, fx, gesture, step }`. Held poses (`HOLDS` in `js/movement.js`) fade in and out; a gesture takes over the channels a pose also drives.
  - `ITEMS` (things you can carry, weight, payoffs), `classifyItem(name)`, `CARTS`, `HAULERS` (billet -> cart / carried item and destination rooms).
- `js/movement.js`: new `operating` gestures (press_panel, type_keys, look_up_screen, reach_shelf, reach_low, take_item, inspect_item, sip, scan_sweep, curl_weights, tool_work, turn_valve, wipe_surface, turn_away, check_tablet, fold_cloth, stir_pot, tend_plant, aim_phaser, hypo_press, torch_cut, swing_strike, throw_item) — the fidgeter never picks them — and `HOLDS`.
- `js/carry.js` (three.js): item meshes (`makeItemMesh`), `holdItem(H, id, hand)` / `dropItem` / `tickHeld` (one-handed items ride the hand bone with a metre-scale holder; two-handed ones follow the midpoint of both hands), `holsterItem` (pelvis slots), `makeCart('cargo'|'med'|'tool', loaded)` with rolling wheels, `cartLoad` / `cartUnload`.
- `js/haul.js` (glue): `opStart` / `opHook` / `opEnd` run the Operator on simmed bodies (called from `poseFor` and `fidgetStep` in `js/main.js`; skipped beyond 22 m like other skinning). The logical position stays on the walkable tile; only the mesh moves onto the use point; seat height is corrected from the pelvis. `pushHook` is the one line in `walkStep`: a walk started with `{ push: cart }` goes at ~0.7x with the `push` clip and the cart rolls 1 m ahead (resolved against walls; carts shove walkers and the player aside). `Haul` (per deck): parked carts in cargo / stores / shuttlebay, NPC hauling jobs every ~16–38 s (walk to a cart or wheel one out, grab, push along a real path to a destination room or the lift, release, walk back; galley / science staff carry trays and boxes instead), and the player's carry / cart.

## Player
- **E** on loose clutter takes it (it becomes a typed item: toolbox, medkit, cup, tray, crate…), shown in first person. Crates slow you (`carrySlow`).
- **G** puts it on the cart in front, on a prop top or on the floor; **E** picks it back up. **R** takes the top load off a cart.
- **E** on a cart grabs the handle: 0.6x speed, no sprint / jump / slide / grapple, the cart stops you at walls and lets go if it jams; **E** again lets go.
- Payoffs: toolbox repairs 25% faster (hand tool 12%), medkit "Treat their scrapes" (+trust, 3 uses), cups / trays / rations offered for more trust than a plain gift (`talkMenu` -> `Haul.talkOpts`).

## Tests and viewer
`node tools/test-equipment.mjs` (coverage, determinism, Operator loops, gestures, stand points, items), browser block `equipment:` in `tools/test.mjs`. Eyeball: `models.html?set=carry` (carts, every item, people running use scripts).

## Open
Props have no real chairs (sitters use the table stools / bunk edge / sofa); clip blending is crossfade only (no IK onto handles or keys); carts are not path-field obstacles (walkers are shoved); NPC trays are not left on tables; untested on real hardware.
