# Systems Nominal: input and menus redesign (proposal)

Mockup: `docs/mockups/menus.html` (open from file://; tabs: Sandbox, Wheels, Radio + Log, Duty, Keys + Access, Esc bug + states, Alternatives). Nothing under `js/`, `tools/`, `assets/`, `index.html` was changed.

Playtest: "H and J clunky, too much text, Esc opens pause even when closing J or H."

## 1. The Esc bug, precisely

- `DutyHUD.openMenu` (js/hud-duty.js) and `CommsHUD.openPanel` (js/hud-comms.js), plus `talkMenu` / `terminalMenu` (js/main.js ~525-552), are DOM overlays. They keep `G.phase === 'play'` and keep pointer lock.
- Esc while locked is consumed by the browser to exit pointer lock. Whether the page also receives the keydown depends on the browser (Chrome frequently swallows it), so the page can never rely on it.
- `pointerlockchange` (main.js:594-597): `locked = false; if (!locked && G.phase === 'play') { G.phase = 'paused'; showScreen('pause'); }`. Nothing records that the unlock was expected.
- Keydown delivered: `DutyHUD.onKey` (hud-duty.js:63) / `CommsHUD.onKey` (hud-comms.js:136) close the menu, then the lock event pauses: **both happen**. Keydown swallowed: pause opens and the menu DOM sits under it until the next key (`onKey` returns on `ph !== 'play'`). Both match the report.
- The tubelift panel is fine: `openLiftPanel` calls `exitPointerLock()` itself (phase `'select'`), so Esc is a plain keydown and `closeLiftPanel()` re-locks inside that gesture.
- Related trap for any free-cursor menu: main.js:698 `mousedown` does `else if (G.phase==='play' && !locked && !closest('#liftui')) requestLock()` and `fire()`s when locked, so a click on a menu icon would re-lock and fire. Needs a `.ui-layer` exclusion.

## 2. Fix: menus unlock on purpose

New pure module `js/ui-mode.js` (unit-testable like `tools/test-*.mjs`):

```
UI = { stack: [], expectUnlock: false, wheel: null, needClick: false, scriptPause: false }
openLayer(kind)  push; if locked { expectUnlock = true; document.exitPointerLock() }
closeLayer()     pop; if stack empty -> relock()
relock()         canvas.requestPointerLock().catch(() => UI.needClick = true)   // inside keydown/click gesture
pointerlockchange: locked = ...; if (!locked && phase==='play') {
    if (UI.expectUnlock || UI.stack.length) { UI.expectUnlock = false; return }
    if (UI.wheel?.held) { UI.cancelWheel(); UI.needClick = true; return }
    pause() }                                           // genuine native Esc in plain play
```

Why it works: because we released the lock ourselves, the browser no longer owns Esc; the page receives a normal keydown, pops exactly one layer, and re-requests lock in that gesture. Chrome allows re-lock after a *script* `exitPointerLock`; it blocks it right after a *user* Esc-exit, which is why the rule `UI.needClick` exists: if `requestPointerLock()` rejects (or `pointerlockerror`), show a small "Click to resume" chip (sim keeps running, no pause screen, menu state intact) rather than the full pause screen.

State machine (live in the mockup, tab "Esc bug + states"):

| State | Pointer | Enter | Leave |
|---|---|---|---|
| PLAY | locked | start, relock OK | hold wheel key, tap panel key / E on crew or console (-> MENU), native Esc (-> PAUSED), lift |
| WHEEL (held) | locked, mouse deltas feed the wheel | hold Q/J/H/V | release = choose -> PLAY; quick tap -> MENU (pinned); Esc -> CLICK TO RESUME |
| MENU | free, by us | `openLayer` | Esc/Backspace pops one layer; empty -> relock -> PLAY or CLICK TO RESUME |
| LIFT | free, by script | phase `select`/`ride` | existing code |
| PAUSED | free, by browser | native Esc, or P/Start (script pause) | click Resume; script pause also resumes on Esc/P |
| CLICK TO RESUME | free | relock refused | any click -> PLAY |

Extras: **P / Start = script pause** (`expectUnlock = true; exitPointerLock()`) so pausing is always resumable by Esc, P or click; the sim should keep running under non-modal panels (WASD still works, look is frozen because `mousemove` already bails on `!locked`) but be frozen for dialogue and lift. Edge cases: phases other than `play` (briefing, perk, lift, end) ignore layers; a layer opened while a wheel is pinned stacks; `Esc` never both closes a layer and pauses.

## 3. The replacement for J / H

### 3.1 Radial wheel (hold Q)
- **Purpose**: every frequent act in 1 gesture, icons not text. Hold key, flick toward an icon, release. Tap (<0.2 s) pins the wheel and frees the cursor so you can click (mouse-only, touch, accessibility). Digits: first picks category, second picks choice, same digit twice = default.
- **Sectors (8, fixed positions)**: 1 **This** (verbs for exactly what the reticle is on), 2 Duty (do / delegate / report / board), 3 Order (subordinates as person icons with dept colour, "more"), 4 Radio (bridge / dept heads / status / assistance / fault / orders), 5 Inspect/Map (map / ship status / alerts / log), 6 Tools (handhelds in hand/belt, empty hands), 7 Carry (put down / hand over / inspect; greyed when empty-handed), 8 System (pause / settings / help).
- **Inner ring** = category, **outer ring** = choices (opens under the hovered sector, spread around its angle), hub = label + one-line description + "release = default". A dot marks each category's default choice. Dead zone (38 px radius) = cancel on release. Sub-wheels never nest deeper than two rings.
- **Contextual "This"**: console: use terminal, ship status, mission, locate crew, alert log, repair. Crew: greet, what now, their duty, order (or ask help), give item (live only if carrying), hail. Cart: grab, take item, put on cart, contents. Item: take, inspect, report found. Also shown as tiny affordance icons above the target when it is focused, and the E prompt names the primary verb. Lift console: deck list stays its own panel.
- **Direct wheels**: tap = panel, hold = wheel for J (duty), H (radio), V (tools; tap V keeps cycling). They show only that category's choices as the main ring (bigger targets).
- **Implementation**: new `js/hud-wheel.js` (DOM + inline SVG, same pattern as `hud-duty.js`; no canvas, so text and icons stay crisp and screen-reader-labelable). Sectors come from provider functions: `dutyMenu()` (main.js:481) already builds `here/subs/due` lists, so refactor into data (`{id, icon, label, desc, off, def, run}`) that the wheel and the old list both consume; `talkMenu`/`terminalMenu` become the "This" providers for crew and console; `G.haul.talkOpts` feeds Give/Offer. Under pointer lock, `mousemove` (main.js:693) routes `movementX/Y` into the wheel's virtual cursor (clamped to radius ~300 viewBox units) instead of the camera while `UI.wheel.held`. Icons: one inline SVG sprite (`js/icons.js`, 24 px stroke style like the existing `.ico`).
- **Edge cases**: Esc while held = native unlock -> cancel + click chip (documented; pinned mode avoids it); wheel key released after a digit commit is ignored; `fire()` and `interact()` gated while a wheel/layer is open; wheel refuses to open outside `play`; the "This" target is frozen at open time; disabled sectors are selectable but release does nothing and the hub says why.

### 3.2 Radio: contact cards, comm log: timeline
- **Cards** (tap H): portrait silhouette (uniform in dept colour, procedural variants from `person` hash; swap for real portraits later), rank pips (1-5), dept colour bar plus a dept letter, status shape-dot (on watch ●, busy ◆, in transit ▶, off watch ○, unreachable ✕), deck and distance with a proximity bar, filter chips (everyone / heads / my reports / nearby / bridge). Selecting a card shows an action tray of icon buttons (hail, order duty, ask help, locate, say hi). Data already exists: `roster.people`, `sim.where(p)`, `D.trust(p)`; actions call `sim.playerChoose` and `D.order/askHelp`. Implement as `js/hud-cards.js` replacing `renderRadio`/`choose` in `CommsHUD` (keep `playerOptions` as the data source so tests keep working).
- **Log** (tap L): vertical timeline, 5-minute hour marks, node icon by channel (PA speaker square, comm badge circle, intercom, order chevrons, alert diamond), ring/border colour by priority (blue/amber/red), filter chips, sender -> receiver in the card header, live append. Replaces `renderLog` rows; alert raise/clear can later draw a coloured band on the rail.
- **Alert card** (K): one card, severity bar, three icon steps for the `doThis`; legend wall moves to a second level.

### 3.3 Duty: compact HUD and swim-lane board
- **Compact HUD** (replaces `#bd-board` rows): one clock ring per round (icon, minutes left or `!`, colour and numeral and icon together: pending grey, due amber, overdue red pulsing, working cyan, delegated violet, done green) plus mission pips and a small alert glyph. B cycles compact / full / off.
- **Full board** (tap J): header with portrait, billet, boss, duty score, crew trust, ship time. Swim lanes on a 20-minute axis: your rounds (one lane each, repeating blocks, past blocks coloured by how you did them: done, rushed (bolt), faked (pencil), skipped (dotted)), mission tasks, one lane per subordinate (their work and what you delegated), ship alerts as a hatched vertical band, a NOW line. Clicking a block opens a popover with exactly that block's verbs: do properly / rush / fake / skip (icon + cost), delegate to (portrait chips with state), or report honest / "all fine". Data: `Duty.board()`, `D.loops`, `D.tasks`, `D.perform/delegate/report`; needs two additions to the model (each loop's `next`/`every` windows already exist; add a read-only `D.timeline()`).
- Edge: board is non-modal; closes on Esc or J; re-render only when no popover is open (as the mockup does) to avoid eating clicks.

## 4. Keys (every current key -> proposal)

Current (js/main.js:672-698, hud-duty, hud-comms): W A S D move; Shift sprint; C / Ctrl crouch; Space jump; E interact (hold: repair); Q grapple (Madness); RMB grapple, LMB fire/handheld; F torch; G put down; R take from cart; V cycle handheld (Shift+V setting); X use job; T throw; M minimap; Tab ship status (hold); J duty menu; B big board; H radio menu; K alert details; L comm log; F3 dir debug; F4 alert debug; digits: menu choices / lift deck / perk; Esc close + pause; Backspace menu back; Enter begin/new run.

Proposal: **tap = panel or instant action, hold = wheel**; one context key (E, unchanged).

| Key | Tap | Hold |
|---|---|---|
| Q | pin the wheel | main wheel (Nominal only; grapple stays in Madness; alt key Z) |
| E | primary verb / talk / take | repair (unchanged) |
| V | cycle handheld | tools wheel |
| J | duty board | duty wheel |
| H | contact cards | radio wheel |
| K / L | alert card / comm log | n/a |
| M, Tab, F, G, R, T, X, F3, F4, WASD, Shift, C, Space | unchanged | unchanged |
| B | cycle duty HUD size | n/a |
| P / pad Start | script pause | n/a |
| Esc / Backspace | back one layer; in plain play: native pause | |
| Digits | only while a wheel, panel, lift or perk screen is open (optional: handheld slots 1-5 in plain play) | |

Clash check: Q/E/V/J/H are left-hand reachable alongside WASD; digits never reach movement because they are mode-gated; Q conflicts only with Madness grapple. The Keys tab has a live keyboard heat-map (today vs proposed) and a working rebind table (the Sandbox uses it); persist as `fb_keys` in localStorage next to `fb_cfg`.

**Accessibility**: remappable; every action reachable by mouse alone (pinned wheel, on-screen dock, clickable panels) and keyboard alone (digits, arrows, Enter, Backspace, Esc); hold vs toggle option for wheel keys; text size 80-160% (panels in rem); reduce-motion (reuse `body.reduce-motion` and the media query); colour never alone (shape + colour for status, letter + colour for dept, icon + colour for priority); high-contrast theme; flick dead-zone and wheel size sliders.

**Controller**: LB hold = wheel (RS selects, LS still walks, release commits); X = E; Y tap/hold = duty panel/wheel; RB tap/hold = handheld cycle/tools wheel; D-pad rotates selection and opens radio; B back; Start script pause; Select = ship status. **Touch**: one wheel button (press-hold, slide, lift, same pointer-capture path as the mock's dock button), tap target = E, long-press = context wheel, panels as full-screen sheets, 44 px targets.

## 5. Alternatives

- **A. Hold-wheel + tap-panels (recommended).** Fastest for common acts, one mental model, keeps letter keys, pinned mode covers mouse/touch/a11y. Cost: new wheel component + `ui-mode`.
- **B. Command mode.** Hold Alt to free the cursor over an always-visible HUD (clickable duty rings, contact strip). Least new code, but permanent HUD clutter and slow for keyboard players. Pinned mode in A already delivers its useful half.
- **C. Diegetic PADD.** Hold Tab raises a PADD with tabs (Duty, Crew, Log, Ship, Map). On-theme, one surface for gamepad, but slow to reach and blocks the view; best later as the visual shell for A's panels.

## 6. Rollout order
1. `ui-mode.js` + Esc/relock fix + `.ui-layer` click exclusion (ships alone, fixes the report; works with the current text menus).
2. Icon sprite + contact cards + comm-log timeline + alert card.
3. Duty compact HUD + board panel.
4. Wheel (pinned first, then held/flick, then digits, gamepad).
5. Key remap UI and settings.

Test hooks: `UI` is pure, so add `tools/test-ui.mjs` covering the table in section 2 (expectUnlock swallow, wheel-held Esc, relock rejection, P script pause).

## Open questions for the owner
1. Q for the wheel (grapple lives on Q in Madness mode): fine to keep Q for Nominal only, or prefer another key?
2. Should panels (J, H) freeze the world, or stay non-modal (walk while open)? Mock assumes non-modal for panels, modal for dialogue and lift.
3. Is pinned (free-cursor) mode acceptable as the default for tap-Q, or should tap Q do "repeat last choice"?
4. Real portraits for crew, or procedural silhouettes only?
5. Keep digits as handheld quick-slots in plain play?
6. Is "Click to resume" the right wording/behaviour for browsers that refuse an instant re-lock?
