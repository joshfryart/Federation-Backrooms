# Jobs: every job interactive, J always leads somewhere, LCARS consoles (plan)

Owner feedback (Systems Nominal):
1. "when i did J to do the job it didn't direct me to a mini game … make sure all jobs have interactive unique minigame involved. if its something like scanning or cleaning, have areas to go to to clean, use an item in your hand, etc."
2. "make sure the console based minigames utilize the same star-trek style graphics, love that stuff."
3. Earlier: "no minigame for the medical bay? what jobs/tasks dont have interactive elements? its boring."

Branch `claude/job-worksites` (off `claude/themed-job-minigames`).

## A. Why J did not lead into a mini-game (bug) and the fix

What the code did:
- **Tap J** opens the duty board (`js/menus.js` routes KeyJ to `toggleBoard`). Its popover's **Properly** button called `D.check(id)`; when the
  player was not standing in the job's room the check failed with "Do this in the sickbay" and nothing else happened (the toast sat under the
  open board). Loops that were not due yet only offered a "Where" button that printed the room name. No route, no pin.
- **J menu → Do a duty or task**: a job in another room printed the same warning and stopped.
- In the right room, `startJob` opened the game anywhere in the room (not at the station), so it was easy to "do" a job from across the room
  and never see where the work is.
- So unless the player was already standing in the room, choosing a job from J never led anywhere.

Fix: one entry point, `goJob(it)` in `js/main.js`, used by every "Properly" path (board button, J menu, hold-J wheel "Do duty", E at a station):
- If the job can be done right here (in the room; for console jobs within reach of its station) it starts at once: console games open, work-site
  jobs show their sites.
- Otherwise it becomes the **pending job** (`G.jobGo`): a nav pin on the station tile (or room, any deck; the existing route ribbon, floor chevrons,
  compass, G key and lift-panel highlight all follow it), a glowing hint line "Go to … — it starts when you get there", and the board shows
  "route pinned". On arrival (within reach of the station, or inside the room for site jobs) it opens by itself. Only one pending job; a new
  choice replaces it; Esc in a game / walking off cancels nothing else.
- Rush / fake / skip are unchanged (one key, never a game; rushing never blocks).
- Regression test (browser): the real J board path (`hud2.act('q:proper')` from another room) pins the route and starts nothing; moving the
  player to the station opens the game without another key; the J-menu path does the same.

## B. In-world work sites (physical jobs)

New pure module `js/worksites.js` (node-testable) + glue `js/worksite-ui.js` (three.js markers + LCARS checklist):

- A **site job definition** = `{ id, name, dept, item, sites: { props, n, floor }, act, order, how, siteName }`
  - `props`: room prop kinds the sites are resolved from (beds, growbeds, shelving, crates, junction boxes…); missing ones fall back to free floor
    tiles spread over the room (so every room resolves).
  - `item`: required handheld(s) from `js/handhelds.js` (mop, medical / engineering / science / security tricorder, hypospray, spanner /
    hydrospanner / tool bag, cargo hook, hand lamp, PADD). Not in hand → the first E at a site takes it off the belt ("auto-equip"); not on the
    belt → a **fetch site** is added first (the room's supply locker / shelving / rack / dispenser) where E issues one.
  - `act`: the per-site skill element (all keyboard; E is the work key, the mouse / arrow keys aim):
    - **scrub** — hold E and move your view back and forth over the grime decal; strokes clean faster than holding still.
    - **scan** — hold E and sweep your view; a strength meter rises as you near the hidden reading; hold it in the peak to lock.
    - **timing** — hold E to charge (dose, torque, fill, strap tension); let go inside the band. Over / under is a fault, try again.
    - **count** — tap E once per item (place n vials / plates, count n crates), then pause to confirm. Wrong count is a fault, recount.
  - `order`: `seq` (numbered, next site pinned) or `any`.
- Definitions (each with its own item, prop set and act): ward round (tricorder scan at each bed), dose round (hypospray timing at beds),
  sterilise (scrub beds / tables / steriliser), restock (count into dispensers / shelves), galley clean (mop scrub), sanitation sweep, grow-bed
  round (fill timing at beds), harvest (count), sample collection (science tricorder scan), hull / conduit inspection (engineering tricorder
  scan), repair round (spanner torque), cargo lashing (hook strap timing), cargo tally (PADD count), patrol (security tricorder scan of doors /
  corners), hatch & seal rounds (hand-lamp inspection scan), shuttle walk-round (FOD sweep with the lamp), table service (count plates).
- Mapping: `SITE_RULES` (label regex + room filter, exact-label overrides) run **before** the console `RULES`; anything not physical keeps its
  themed console game. `jobFor(item)` returns `{ type: 'sites', def }` or `{ type: 'game', tool }`. Coverage counts both; no kind over 25 %.
- Per-site progress rings, a glowing floor ring + light beam + number on each site, the next one pinned on the nav (chevrons), a dirt decal that
  fades as you scrub, a scan fan while scanning, an LCARS checklist panel (sites, item, meter for the current act, faults, time).
- Result → quality / time as today: all sites done with < 3 faults = proper (faster: the walk was the work, the busy time after is short);
  3+ faults or the generous time limit = rushed (still done). Leaving the room pauses; a phase change / deck change cancels (job stays due);
  the J menu gets "Stop working". Rushing never plays it. NPC crew doing the same job are unchanged.

## C. Console games in the LCARS look

Rebuild `js/jobgame-ui.js` visuals on `css/hud-skin.css` tokens: an elbow-framed console panel (top-left elbow + bottom-left elbow, segmented
rail), a header pill with the station name and ship time, a side rail of status pills (department, round, faults, time), a segmented timer bar,
buttons as pills, department frame colour (`--m-*`), and canvas art redrawn in the HUD palette (orange / gold / lavender / periwinkle blocks,
thin grid and glow lines, rounded bars, hexagon / diamond markers). The first-use instruction card uses the same frame. Calm (no glow pulse,
no shake) and colour-blind (blue / amber / white / magenta, marks never colour-only) are honoured. No downloaded assets.

## Tests
- node `jobgames-unit`: every loop and task resolves (`jobFor`), no kind over 25 %, every site definition has an interactive act, every act
  winnable by scripted input and failable, item rules, site resolution with and without props.
- browser `jobgames`: J board path routes then auto-opens; a site job (walk to each site, item required → equip, complete → proper).
- `node tools/test.mjs` stays OK. 3–4 screenshots in `docs/screenshots/`. README job paragraph and TODO handoff updated.
