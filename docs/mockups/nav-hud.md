# Systems Nominal: navigation + visual HUD proposal

Companion to `docs/mockups/nav-hud.html` (open from file:// or any static server; six tabs, all interactive, fake data, no libs).
Playtest feedback this answers: *"I don't know the layout. Show route info on the minimap. So much text where visual graphics would do better. Things go too fast; I need longer to get to and complete my tasks."*

## 0. Diagnosis (from the code)

| Complaint | Cause in code |
|---|---|
| Don't know the layout | `drawMap` (js/main.js:827) draws the whole 60x44 deck into 170 px (~2.8 px/tile), only explored tiles, no room identity (just two blues), no duty/task markers, no route. Duty rooms are named only in text (`#bd-board`, toast "Do this in the Sickbay"). Other decks are invisible except the lift-panel word list (`deckNotes`). |
| Too much text | Briefing card (hud-duty.js `showBriefing`) = 6 headed paragraphs; board rows are sentences; `G.say` toasts are sentences; Tab ship-status is a sentence list; alert banner carries a sentence. |
| Too fast | duty.js: `period = clamp(every*8, 90, 400)` s, first duty `next = 30 + i*20` s, a due duty is auto-skipped at `period*0.9`, "overdue" after 60 s, tasks have fixed `window`. At 3.3 m/s (move.js) and 2.5 m tiles (`TS`) a 60-tile walk is 45 s, plus a lift ride of 3-8 s. The player has no ETA, so cannot judge whether they will make it. |

Everything below is built from data the game already has: `World.field()` (distance field), `world.explored`, `world.d.rooms` (type, x, y, w, h), `world.liftPos`, `G.plan` (type -> [{deck, tx, ty}]), `G.shipDecks[i].data` (all decks are generated at run start), `duty.board()`, `ALERTS`, `SYSTEMS`/`CASCADES` (crew.js).

---

## 1. Navigation

### 1.1 Main routing display: three alternatives (tab 2) and recommendation

| | A. Glow ribbon + chevrons | B. Pulse lane (flow-field ripple) | C. Turn-by-turn card |
|---|---|---|---|
| Look | Bright 3-stroke polyline (halo, dark casing, cyan core) along the real path, animated dark chevrons flowing toward the goal, smoothed corners | Whole reachable network pulses toward the goal (alpha = sin(dist - t) on every explored floor tile); the route tiles dashed bright | Only the next leg is drawn; a card shows turn glyph + metres, plus the following turn greyed |
| Strength | Instant "follow the line"; teaches layout because you see the whole route shape | Shows alternatives, good "scan" feel | No map reading at all (sat-nav) |
| Weakness | Long routes crowd a small crop (solved by local zoom) | Noisy, weak for colour-blind, heavier tile loop, no "turn here" | No overview, so layout is never learned |
| Cost | Lowest | Medium | Low-medium |

**Recommendation: A as the default minimap treatment, with C's glyph + metres folded into the route card (already in the mockup, under the minimap), and B kept as a 2-second "scan pulse" when the player presses G / opens the map.** A teaches the layout, C removes the last bit of reading effort, B is a delight moment rather than a permanent layer.

**How the route is computed (all treatments).**
1. Destination tile `T` = room centre (`world.center(r.x + r.w/2 | 0, ...)`), or lift tile (`world.d.exit`).
2. `f = world.field(T.x, T.y)` once per destination, cached in `G.nav.field` (field costs one BFS over <=2.6k tiles; recompute only when the destination changes or doors change, not per frame).
3. Each map tick (the existing 0.12 s `mapT`), descend from the player tile: repeatedly step to the 4-neighbour with the smallest `f` (the same descent `world.js:1171` uses to place floor chevrons). <= ~200 steps.
4. String-pull: keep a waypoint only if `world.los(prev, next)` fails for the next candidate (any-angle legs, so the line does not staircase). `world.los` already exists.
5. Output `{pts, cum, len, maneuvers}`; `maneuvers` = vertices where heading changes > 20 deg, tagged `turnL/turnR/uturn`.
Mockup: `routeTo()` in nav-hud.html is exactly this, ~20 lines.

**Perf:** per tick one descent + string pull (~O(200*path)) = well under 0.1 ms; the drawing is 3 strokes + N small chevrons (N = len / 1.7 tiles <= ~40). Do the BFS lazily; never per frame.

### 1.2 Minimap upgrades (replaces the 170 px whole-deck dot map)

| Element | Purpose | Replaces | Implement | Data | Cost |
|---|---|---|---|---|---|
| **Local zoomed crop**, heading-up (toggle: ship-forward-up) | Readable at a glance: ~30x30 tiles at 7 px/tile instead of 60x44 at 2.8 | whole-deck thumbnail | `drawMap`: `translate(w/2,h/2); rotate(-yaw-pi/2); translate(-px*s,-py*s)`; iterate only tiles within `hypot(w,h)/2/s` of the player; canvas to 208 px CSS (416 px backing for HiDPI). Whole-deck view moves to the M overlay. | P, world.grid | Cheaper than now (fewer tiles) |
| **Room-type badges** (category colour + badge shape + glyph) drawn at room centre, upright even when the map rotates | "That is Sickbay" without a label | two blue floor tones, `roomname` text | In drawMap loop `world.d.rooms`; `dBdg(g, type, ...)` (Path2D icon cache, see 2.1). Show when room explored, or is a duty destination (so you always know where your stations are). Tint room floor 30 % with category colour. | `world.d.rooms[].type`, `ROOMS` | <=24 rooms x 1 Path2D stroke |
| **Duty/task markers**: clock ring around the room badge (arc = time left; yellow due, red + pulse late; cyan pin carat if guided) | See what is due and where, and how long | board text rows | Use `duty.board()` rows (`room`, `status`, `eta`, `left`, `total`); map `room` -> `world.d.rooms.find(type)`; arc = remaining/window. | board rows | trivial |
| **Walls as edge lines**, floors only when explored; fog option | Cleaner than filled blocks, scales when zoomed | filled `#2a3050` wall blocks | For each explored floor tile, stroke the edges that border walls. | explored | OK; prebake to an offscreen canvas if profiling says so |
| **Fog of war** | Keep exploration meaningful *and* never lose the player | `explored` all-or-nothing | Two modes (toggle in mockup). **Default: "crew knows the ship"**: layout hidden-but-faint (blueprint tone), room badges + routes always shown, explored tiles bright. This is a crew member on their own ship, so they would know the way; fog only dims. Alternative "realistic fog": unexplored tiles not drawn, but duty-destination rooms and the route are still drawn (dashed through unknown) so guidance never breaks. | `world.explored` | none |
| **Player cone** (FOV wedge) + arrow | Facing at a glance | 5 px line | radial-gradient wedge in drawMap | P.yaw | trivial |
| **Edge pin** | Destination off the crop: arrow clamped to the minimap edge with its room badge | nothing | clamp screen position along bearing, draw triangle + badge | dest | trivial |
| **Icon legend** (V): you / lift / due ring / late ring / route / the 7 category shapes. Zero words. | Teach the symbols once | none | static DOM row (`legendHTML()`), shown during first N minutes and on V | - | none |

### 1.3 Route card (under the minimap; replaces the objective text for Nominal mode)

`[turn glyph] 18 m  [ETA ring 0:20]` then a step strip `[you] 18 m > [lift D3>D5] > 83 m > [pin duty]`. The ETA ring includes a white notch: where your ETA lands on the duty's remaining time (see section 4). The step chips are icons + metres; the current step glows. Data: `legs[]` from `legsFor(item)` (mockup) = walk-to-lift, ride, walk-on-deck-N. Implementation: a small DOM block next to `#minimap` updated at the 0.12 s tick. Cost: trivial. Replaces `#objective` and the text prompts "Go to the Sickbay".

### 1.4 Destination pin, distance, ETA

Pin = room badge in a cyan ring with a pulsing radar ping on the map; in the 3D view a vertical light beam + floating badge + metres (drawn through walls at 45 % opacity when occluded); on the compass as the large marker with metres. ETA = `len*TS/3.3` s + 2 s per deck + 3 s for the car, sprint ETA shown by a second notch if you want to hurry. Implement: 3D beam = one additive-blended cone/plane mesh at the room centre parented to the world, scaled by distance; badge = a THREE.Sprite from a canvas (`dBdg` into a 64 px canvas, cached per room type). Cost: 1 mesh + 1 sprite, hidden when no guidance.

### 1.5 Guide-me (key G, plus clicking any board row or any room on the big map)

G pins the most urgent item (overdue > due, least time left first, then soonest upcoming). Pressing G again cycles to the next, then to **"nearest lift"**, then clears. Pinning drives *everything*: map ribbon, floor chevrons, beacon, compass marker, route card, board row highlight (pin glyph + cyan rule). Toast = icon + name.
Cross-deck: `legsFor()` returns 3 legs when `item.deck != G.shipDeck`: (1) walk to this deck's lift, (2) "ride D3>D5" shown as a chip, with the prompt `[E] [lift] > D5` when you stand in the car (and, nice to have, pre-select the deck in the deck panel: `chooseDeck(n)` already exists), (3) after `loadDeck`, the pinned leg flips automatically to the walk on the new deck (store the pin as `{deck, room}` in `G.nav` and re-derive legs after every deck change). Data: `G.plan[type]` gives `{deck, tx, ty}` for every room type (any deck), `world.d.exit` the lift tile, and `G.shipDecks[i].data` the room rects of unvisited decks.
Implement: new `js/nav.js` (~200 lines, no THREE): `field cache`, `routeTo`, `maneuvers`, `legsFor(item)`, `guideNext()`; a 10-line hook in main.js `keydown` (G is free; J/B/H/K/L/Tab/M used) and in the map tick. Cost: low.

### 1.6 Floor breadcrumbs in the 3D view (extends world.js:1169)

Today: ~7.5 % of corridor tiles get a baked chevron decal pointing to the lift (an `InstancedMesh`, static). Extend: a second small `InstancedMesh` (cap 24) of cyan emissive chevrons placed every 1.35 m along the first ~22 m of the live route, phase-animated (offset = t*1.6 mod gap) so they flow toward the goal, brightness fading with distance; hidden when nothing is pinned. The baked lift chevrons stay as the ambient fallback (and could be dimmed to the white they are now). Mockup: `render3d()` projects the same polyline and uses 6-point chevrons. Implement: reuse the `T.arrow` decal texture; `instanceMatrix` updated every map tick from `along(route, s)`; set `renderOrder` above decals, `depthWrite:false`, additive. Cost: <=24 instances, one matrix update per 0.12 s; negligible. Perf note: no per-frame BFS, no per-frame allocation (pre-allocate Matrix4).

### 1.7 Compass strip (top centre; replaces nothing, adds orientation)

Ship axes (FWD / STBD / AFT / PORT) with 15 deg ticks; markers as icon discs: lift (white), due/overdue duties in view (category-neutral, status-ring coloured, clock ring), and the **guided target large with metres**; off-screen markers clamp to the edge with an arrow. The alert banner stacks above it (keep banner at top:10px, compass at ~top:34px, or hide the compass while an alert banner is up). Implement: canvas 520x62 CSS, drawn each frame from `P.yaw` (a few arcs and 20 `fillRect`s) or at 30 Hz; bearing = `atan2(dx, dz)` from player to each marker. Cost: trivial.

### 1.8 Big map (M) and whole-ship deck selector (tabs 1 and 3)

- **M** toggles a full-deck overlay (today M only hides the minimap): whole-deck at ~14 px/tile, badges 1.2x, route, deck column on the left (`D1..D8` with zone colour stripe, a "you are here" arrow, and a mini status disc for each duty on that deck), legend bottom-right, "nearest lift" and "guide me" buttons. Hover a room = tooltip with badge, name, metres and ETA (incl. lift ride); click = pin and close. The game keeps running (it is a HUD overlay, not a pause) but see section 4: slow the duty clock to 25 % while it is open.
- **Other decks** are drawn dimmed from `G.shipDecks[i].data` ("plan from ship records"), which exists for every deck at run start (main.js:583), so the layout is known without walking it; unwalked rooms show only badges. This directly solves "I do not know the layout" across decks.
- **Tab 3, ship view**: side elevation (reuse `drawSchematic` hull from ships.js, zone colours already there: Command/Habitat/Services/Engineering) + one row per deck listing the room *types it holds as badges* (derived from `G.plan`), with counts. Click a room-type badge = highlight every deck that has it and jump to the nearest (`|deck - G.shipDeck|`), then click the room to guide. This also upgrades the lift panel: replace its comma-separated `deckNotes` text with those badge rows (`renderLiftPanel`, main.js).
Cost: overlay is one extra canvas, redrawn at ~15 Hz only while open; no cost closed.

### 1.9 Lift marker and "nearest lift"

The lift is drawn as a white lift glyph tile on the map (today a 2 px dot that appears only near it), always visible on the current deck (you know where your lifts are). With no pin, G cycles to "nearest lift" = route to `world.d.exit`. Replace the dot/colour code at main.js:840-842 and the `liftOnMap` gating (keep `sensors` degraded only affecting *item* scans, not the lift).

---

## 2. Replace text with graphics

### 2.1 Icon set (tab 4; ~100 path-only glyphs in the mockup)

Authoring rules: 24 px grid, 1.7 px stroke, round caps/joins, `fill:none`, **path data only** (circles via arcs) so one string feeds inline SVG *and* `new Path2D(d)` for the minimap/compass/3D sprites. Groups: 25 room types, 11 duty verbs (inspect, log, repair, patrol, deliver, calibrate, scan, restock, report, person, clean), 17 systems (map 1:1 to `SYSTEMS` ids), 7 alert conditions (`ALERTS`), 19 UI glyphs (pin, clock, lift, turn L/R, ...), 4 quality pips (ok filled, rushed half, faked slashed, skipped x).
**Colour-blind safety:** every category = hue **and** badge shape (Command square, Engineering hexagon, Medical circle, Science diamond, Services pentagon, Crew rounded square, Security triangle). Status = ring fill amount + glyph (check, `!` badge, blink) + colour, never colour alone. A deuteranopia filter toggle is on the icon tab for checking. Palette: Okabe-Ito-derived tuned for dark UI (blue #6ea8ff, orange #e8892b, teal #3fd6a0, violet #c58be0, lime #c6d25e, steel #9db2c8, coral #ff7a6b).
**Implement:** new `js/icons.js` exporting `ICONS`, `SHAPES`, `CATS`, `badgeSVG(type)`, `drawBadge(ctx, type, x, y, s)` (Path2D cache, lazy). Room-type -> category map lives beside `ROOMS` in data.js (add `cat` field). The mockup's "Show SVG sprite source" button emits a `<symbol>` sprite for DOM use. Cost: ~8 KB source, zero assets, no network.

### 2.2 Status as rings, bars and pips

- **Duty board row** (tab 6 shows before/after; tab 1 live): 34 px clock ring (arc = remaining fraction; grey-blue idle, amber due, red under 30 % + blink + `!`, cyan working), task/duty glyph inside, room badge, `mm:ss`, three quality pips of recent results, distance + ETA at right (`53 m / 0:16`; `lift D5` for other decks). The ring has the **ETA notch** (section 4). Replaces `renderBoard` text rows (hud-duty.js) and the `lab` word map. Data: `duty.board()` already gives `status, eta, left, total, last`; add `window`/`dueAt`, and `hist` (last 3 `_finish` qualities) to the row in `board()`. Rows are clickable (set `pointer-events:auto` only on rows) to pin guidance.
- **Vitals:** HP/stamina become 40 px rings with glyph (keep the segmented bars if preferred; mockup shows rings), zapper charge = diamond pips, chips = dot pips, duty debt = bar pips (debt is already numeric). Replaces `#bars` text labels.
- **Alerts:** banner = icon in the condition colour + 2 words ("Red alert") + pulsing shape; the paragraph moves to the K details panel (hud-comms.js). Add shape redundancy: green circle-check, yellow triangle, red octagon, fire flame, breach crack, power bolt.

### 2.3 Toasts: icon + 3-5 words (tab 6, click a row to fire it on the stage)

`G.say(msg, cls)` becomes `G.say({ic:'lift', t:'Lift online'}, cls)` (keep the string overload; render `ico + short`); long sentences move to the comm log (L) / ship log. Examples: "All chips installed - TUBELIFT ONLINE. Find it!" -> lift glyph "Lift online"; "Medkit (+25 health) - sickbay supplies are failing" -> cross "+25 health"; "Do this in the Sickbay" -> pin "Go to Sickbay" + auto-pin the route; "Tubelift locked out - lift controller offline" -> lock "Lift offline". Implement: a `SAY` table in a new `js/hudtext.js` plus ~15 call sites in main.js/duty events; the toast element gains an inline SVG. Cost: small and mechanical.

### 2.4 Ship systems as a schematic (tab 6)

Replace `renderStatus` sentence cards with a hull profile (same silhouette idea as `drawSchematic`), one node per system placed by its `home` zone: node = category badge shape + system glyph; status = ring style (solid green / dashed amber + `!` / red crossed); active `CASCADES` drawn as animated dashed arrows from the failing system to its victim (so cause -> effect is visible). Hover/long-press = the existing sentence in a tooltip. Click = repair guide (pin the system's repair point `repairPts`). Implement: SVG generated from `SYSTEMS` + `crew.js` home zones; positions from a small table (mockup `SYSN`). The `#faults` right-side list shrinks to the *worst three* as badges. Cost: one SVG built on Tab-open, no per-frame work.

---

## 3. First-play friendliness

### 3.1 Briefing flythrough (tab 5)

Replace the six-paragraph card at `showBriefing` with: (left) an animated deck canvas: ~3 s "scanning deck" room reveal by category colour; the camera then follows a glowing line lift -> station 1 -> 2 -> 3 -> 4 with numbered pins dropping in and clock rings, then zooms out to the whole watch; a bottom strip of badge chips with chevrons (your round at a glance) and `lift > D5 [plant]` for stations on other decks. (right) card: name/rank/boss on one line, **duty rows as ring + badge + 3 words + period**, mission tasks with time, key row as keycap + glyph pairs (G, M, J, B, H, Tab), a Begin button. Everything else behind a `?` toggle.
Implement: `DutyHUD.showBriefing(b)` receives `b.loops/tasks` as strings today; pass the rows instead (`room, deck, label, every`). The flythrough reuses `drawMap` + `nav.routeTo` + chained legs (mockup `bfStations()`: nearest-neighbour order from the lift). Needs the deck generated before the briefing (it is: `G.shipDecks`) and the first deck's `explored` ignored (draw `fog:'crew'`). Cost: one canvas on a screen that exists anyway, ~20 s loop, runs at 30 Hz only while the briefing is open.

### 3.2 Contextual hints: arrows and glows (tab 1: "Replay first-run hints")

Replace paragraph hints (`setHint`, `G.hints.*` toasts) with a 4-step tour: pulse-glow on the real element + a floating keycap/icon chip with a bobbing arrow ("[M] map" on the minimap, "[G] guide" on the first due row, a compass marker pulse, "[J] menu"). Each step completes on the action itself (press G / M) or after ~6.5 s. Implement: `hints.js` with a step table `{targetSelector, key, icon, completeOn}`; CSS class `.glow` (outline + pulsing box-shadow); persisted in `localStorage` so it runs once. 3D hints (the lift, a duty room door) use the same beacon sprite as 1.4. Cost: DOM only.

---

## 4. "Things go too fast": timing proposals (no code written)

1. **Show the arithmetic.** The ETA notch on each duty ring is where "walk time" falls on "time left"; if ETA > remaining the ring turns red with a `!` badge *before* it is hopeless (mockup shows this). This alone converts "too fast" into "I should go now".
2. **Window >= 2.5 x ETA-at-due + work time**, computed when the duty comes due (`duty.js` line ~59), instead of a fixed `period*0.9`. Cross-deck duties get the ride added automatically.
3. **First-watch grace:** first duty at 75-90 s instead of 30 + 20 i; first run x1.5 windows (or a "relaxed" difficulty toggle).
4. **Slow-mo while planning:** duty clock runs at 25 % while the M overlay or the J menu is open (they are HUD, not pause, so the world keeps ticking, but duty windows do not punish studying the map).
5. **Auto-skip is late, not silent:** keep the 60 s "overdue" state but show it as the red ring; only auto-skip after another full window; toast = icon + "Missed" instead of silently counting.
6. **Optional "stroll assist"** (accessibility): 15 % walk-speed bonus while following a pinned route that is > 40 m.

---

## 5. Implementation plan (suggested order, rough cost)

| # | Step | Files | Size | Risk |
|---|---|---|---|---|
| 1 | `js/icons.js` (paths, shapes, cats, `badgeSVG`, `drawBadge`) + `cat` in `ROOMS` | new, data.js | S | none |
| 2 | `js/nav.js`: field cache, `routeTo`, string-pull, maneuvers, `legsFor`, `guideNext`, ETA | new | M | low; unit-testable headless |
| 3 | Minimap rewrite: local crop, badges, markers, ribbon, legend | main.js `drawMap`, index.html (CSS for 208 px) | M | low |
| 4 | Route card + compass (DOM/canvas) | new `js/hud-nav.js` (inject own CSS like hud-duty.js) | M | low |
| 5 | Duty board rewrite (rings, pips, ETA notch, click to pin) | hud-duty.js `renderBoard`, duty.js `board()` (+hist, window) | M | low |
| 6 | Floor route chevrons + beacon | world.js (instanced mesh near line 1169), main.js tick | S-M | low-med (z-fighting, test with decals) |
| 7 | Big map (M) with deck selector and other-deck plans; lift panel badge rows | main.js, `renderLiftPanel` | M | low |
| 8 | Toasts / alert banner / status schematic | main.js `G.say`, hud-comms.js, `renderStatus` | M | low |
| 9 | Briefing flythrough + hint tour | hud-duty.js, new `hints.js` | M | low |
| 10 | Timing changes (section 4) | duty.js | S | gameplay balance, playtest |

Tests to add to `tools/test.mjs`: `routeTo` returns a path whose length equals `field[start]` +- string-pull shortening on every generated deck; every duty room is reachable from the lift; cross-deck `legsFor` has exactly walk-ride-walk.

## 6. Performance summary

- Per 0.12 s map tick: 1 descent + string pull (~0.05 ms), minimap draw over ~900 tiles (crop) instead of 2640, <= 24 Path2D badge strokes, <= 40 chevrons. Net: cheaper than the current whole-deck loop.
- Distance fields are cached per destination (and per lift); never per frame. `field()` on a 2.6k-tile deck is sub-millisecond-to-low-ms.
- 3D additions: <= 24 instanced chevrons + 1 beacon mesh, only while guiding.
- DOM: board/route card updated at 4-8 Hz with `innerHTML` of <= 8 rows, as `renderBoard` already does at 4 Hz.
- Offscreen caching option: bake the static walls/floor of the deck to a canvas when `explored` changes (rare) and `drawImage` it rotated per tick if profiling ever shows tile loops matter.
- Big map and briefing canvases render only while visible.

## 7. Open questions for the owner

1. Fog: is "crew knows the ship" (layout always faintly visible, route always shown) acceptable, or should unexplored areas stay truly hidden (with the route still drawn through them)?
2. Should G auto-pin the most urgent duty when it comes due (auto-guide), or only on keypress?
3. Is slowing the duty clock while the map is open acceptable, or should the map pause the world entirely?
4. Is text allowed at all in toasts (3-5 words next to the icon), or icon only for known events?
5. First-run only hints vs always-available `?` replay?
6. Keep the Tab status as a full-screen schematic, or a corner widget?
7. Mouse-clicking on the map/board (needs pointer lock release) vs keyboard only (digit keys to pin board rows)? The mockup supports click; the game currently locks the pointer.
8. Do you want a "relaxed" difficulty (longer windows, no auto-skip) as a setting?
