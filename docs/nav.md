# Navigation and visual HUD (Systems Nominal)

Built from the proposal in `docs/mockups/nav-hud.md` / `nav-hud.html`. The crew know their ship: the whole deck plan is always drawn (unexplored tiles faint, explored ones bright), and guidance works to any room on any deck.

## Controls

| Key | What it does |
|---|---|
| G | Cycle the pin: most urgent due duty or task, then the next ones, then nearest lift, then off. With something carried, G still puts it down. |
| M | Big map. Shows the whole deck, a deck column for every deck (decks you have not visited come from the ship plan) and a strip of room types to search. Keys: 1-9 or `[` `]` pick a deck, F cycles room types, G cycles the pin, L nearest lift, Enter or a click on a room guides you there, M or Esc closes. The world is paused while it is open (`G.menuPause`). Under pointer lock the mouse moves a virtual cursor. |
| Tab (hold) | Ship systems schematic. Each node shows its zone, department shape, status ring and cascade arrows. |

When a duty or task comes due, the most urgent one is pinned automatically. A pin drives:

- the minimap route ribbon;
- floor chevrons and a beacon (`World.setGuide`);
- the compass marker;
- the route card (turn glyph, metres to the next turn, ETA ring, step chips such as walk 33 m > lift D1>D5 > walk 25 m > target).

Tasks are due by end of shift, so a task ring shows "open" with no countdown. A duty ring shows the time left in its window, and the ETA ring on the route card turns red when you will not make it.

## Files

| File | Role |
|---|---|
| `js/nav.js` | Pure logic with no DOM, tested in node. `gridField` / `navWorld`: the distance field rules of `World.field` on any deck's data. `routeTo(world, from, [tx,ty])`: descend the cached field, then string-pull to any-angle legs with clearance (`clearLine`), giving `{pts, cum, len, man, steps}`. `planRoute(plan, decks, fromDeck, fromTile, target)`: targets can be `{type[,deck]}`, `{deck,tx,ty}`, `{lift}` or `{deck}`, giving `legs` (walk, ride, walk) plus `dest`, `metres` and `eta` (walk at 3.3 m/s, ride `3+5(k-1)/(D-2)` s, plus 2 s). `dutyItems(duty)` and `Pins` (auto-pin, cycle, external `G.pin`). |
| `js/nav-hud.js` | Glue. Holds the pin, recomputes the plan on a 0.12 s tick (the destination is chosen once per pin and deck), draws the minimap and compass at 30 Hz, and handles the big map, the briefing mount and the Tab schematic. Its key and mouse listeners use window capture. |
| `js/minimap.js` | Canvas drawing. `bakeDeck` gives an offscreen static layer, re-baked only when `explored` changes. `drawLocal` draws the heading-up crop, about 26 tiles across the 208 px minimap. `drawPlan` draws the fitted whole deck. Badges are category hue plus shape with a white glyph from `js/icons.js`, and clock rings show duty and task status. |
| `js/compass.js` | The FWD/STBD/AFT/PORT strip with icon markers that clamp to the edges. |
| `js/schematic.js` | The SVG systems schematic, built from `SYSTEMS` and `CASCADES`. |
| `js/briefmap.js` | The briefing flythrough canvas, prepended to `#bd-brief .card` when the briefing shows (`NavHUD.poll`). |
| `js/world.js` `setGuide(route, t, beacon)` | Up to 24 instanced additive chevrons along the first 22 m, plus a beam and a sprite badge that draws through walls. |

## Hooks in main.js

- Construct: `G.nav = new NavHUD({...})`.
- Every play frame: `G.nav.frame(dt)`.
- `drawMap()` returns early in Nominal mode.
- `renderStatus()` calls `G.nav.renderStatus(el)` first.

## Inputs from other modules

- `G.pin = {kind, id, room, deck}`: the tasks/pacing agent can set this (for example, for the guided first task). The pin is adopted whenever this value changes.
- `G.duty` loops and tasks: an optional `l.deadline` or `l.window` overrides the default `dueAt + period*0.9`.
- `G.plan` and `G.shipDecks[i].data`.

## Tests

- `node tools/test-nav.mjs` (also run by `tools/test.mjs`) checks routes on every room of every deck across 6 ships. Each route must end at the target, have walkable 4-adjacent steps and clear string-pulled legs. It also checks cross-deck walk/ride/walk plans, go-to-deck and nearest-lift plans, and the pin auto/cycle/external behaviour.
- The browser block in `tools/test.mjs` (`navBrowser`) checks:
  - a pin yields a route with chevrons, a beacon and the card;
  - a cross-deck pin gives walk/ride/walk;
  - a due duty is auto-pinned and G cycles through duty, lift and off;
  - the minimap draws non-blank pixels;
  - M opens and closes and sets and clears `G.menuPause`;
  - the schematic and the briefing canvas render.
