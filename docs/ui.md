# Systems Nominal: input, menus and the quick wheel

Proposal and visual spec: `docs/mockups/menus.md` / `menus.html`. Icons: `js/icons.js` (shared with the nav HUD). `?mode=madness` is untouched (Q stays the grapple, old toasts).

## Modules

| File | What |
|---|---|
| `js/ui-mode.js` | Pure layer stack + pointer-lock rules (`createUIMode`), `UIHUB` (shared ui / portraits / menus), the "Click to resume" chip (`mountUIMode`). |
| `js/menus.js` | `Menus`: the one key router (window capture, registered before main's keydown), wheel providers (8 sectors), belt quick-slots, P / Start pause, gamepad, toasts, name tags, portraits; `frame(dt)` each animation frame (runs while the world is paused). |
| `js/wheel.js` | Wheel geometry and selection maths (`sectorAt`, `hitTest`, `kidLayout`, `pickItem`, `digitPick`, `stepSel`, `clampCursor`) and the SVG view (`WheelView`). |
| `js/portraits.js` | Live 3D headshots: `makeHuman` per person, a dedicated camera on the Head bone, 128 px render target, grey-world white balance, cached data URL per person id; lazy (`get` queues, `tick` renders 1-3 per frame), placeholder silhouette in department colour, `<img data-pid>` patched when ready. |
| `js/nametags.js` | Always-on crew tags: department colour + letter, rank pips, name (title when looked at); max 6 pooled DOM tags, candidates at 8 Hz (near and in front, or looked at up to 16 m, line of sight). |
| `js/toasts.js` | `G.say(msg, cls, { icon, short })` -> icon + 3-5 words (`SAY_RULES`), full text in `G.sayLog` and the tooltip. |
| `js/hud-duty.js` | Compact rings HUD, full duty board (swim lanes, popover verbs), the clickable list menu (talk / terminal / legacy duty lists). |
| `js/hud-comms.js` | Radio = quick calls + contact cards (portrait, rank pips, dept colour + letter, status shape, deck / distance), comm log = icon timeline with portraits, alert card with icon steps. |

## The Esc / pause rule

Every menu, panel and pinned wheel is a layer (`UI.open(kind, { close, back, key, toggle })`). The first layer releases pointer lock **on purpose** and sets `expectUnlock`, so `pointerlockchange` (main.js) asks `UI.onLockChange()` and does not pause. Esc pops exactly one layer (one menu level in list menus, the popover before the board), Backspace goes back, the panel's own key toggles it. When the stack empties we re-request the lock inside that gesture; if the browser refuses, the "Click to resume" chip shows instead of the pause screen. A native Esc in plain play still pauses. P (or pad Start) is a script pause that Esc / P / click resume. Clicks on `.ui-layer` never re-lock or fire (main.js mousedown).

While anything is open the **whole world pauses**: `G.menuPause = UI.frozen || G.nav.mapOpen`, `step()` returns at once, `nomTick` and the comms tick hold; only the UI (`Menus.frame`) keeps running.

Other modules: open a layer via `UIHUB.ui.open('mine', { close })` and call `UIHUB.ui.closed('mine')` when you close yourself. The nav map keeps its own pointer-locked virtual cursor and owns keys while open (it sets `G.menuPause`; unlocks under it show the chip, not the pause).

## Keys (Nominal)

| Key | Tap | Hold |
|---|---|---|
| Q | pinned wheel (free cursor, click / digits) | main wheel: flick, release = choose (over a sector = its default) |
| J | duty board | duty wheel |
| H | radio: quick calls + contact cards | radio wheel |
| V | cycle handheld (Shift+V setting) | tools wheel |
| K / L | alert card / comm log | |
| B | duty HUD: rings / rings + labels / off | |
| 1-9 | belt quick-slot (again = empty hands); inside a wheel / menu / lift panel they choose | |
| P | pause | |
| Esc / Backspace | back one layer | |

Wheel sectors (fixed): 1 This (verbs for the target under the reticle: crew, terminal, cart, item), 2 Duty, 3 Order (your reports with portraits), 4 Radio, 5 Inspect / Map, 6 Tools (belt + empty hands), 7 Carry, 8 System. Digits: category then choice, same digit twice = default. Gamepad: LB hold = wheel (right stick selects, release commits), Y tap / hold = board / duty wheel, RB tap / hold = cycle / tools wheel, A = pick in a pinned wheel, B = back, D-pad steps, Up = radio, Back = ship status, Start = pause.

Reserved for later (not built): the combat direction is grapple / melee against armed intruders; Tools already lists every handheld, and This is where contextual verbs (restrain, disarm) go.

## Tests

`node tools/test-ui.mjs` (state machine table, wheel geometry and digits, toast mapping, icon set) and the `ui browser:` block in `tools/test.mjs` (J board pauses the world, Esc closes without pausing, popover Esc, terminal levels, radio cards with portraits, hold-Q flick + release hails the bridge, tap-Q + digits, belt digits, portrait pixels, P pause, name tag, icon toast). Headless has no pointer lock: the tests dispatch real key events on `window` (same capture listeners the game uses) and drive the wheel cursor through `moveTo`.

## Open

- Not played by hand yet; hold threshold (220 ms), wheel size and flick scale (1.4) need tuning on real mice / pads.
- Key remapping UI (`fb_keys`) and the hold-vs-toggle accessibility option are not built; touch dock not built.
- Portrait cost is ~0.3-1 s each under swiftshader (much less on a GPU); cards show a silhouette until ready.
- Conversation close-up: built (`docs/talk.md`, `js/talk.js`): a `talk` layer in phase `talk` (Menus.frame keeps it), portrait chip from `UIHUB.portraits`, intent wheel reuses `js/wheel.js`.
