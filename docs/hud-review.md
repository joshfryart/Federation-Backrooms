# HUD review and redesign

Scope: the whole Systems Nominal HUD (identity plate, duty rings, compass, condition pill, minimap + route card, vitals, comm stack, prompt / toast / subtitles / announcement / hint, belt, name tags, quick wheel, duty board, radio / log / alert panels, conversation close-up, briefing / end screens, big map, Tab schematic, title / pause screens, combat chips).
Screenshots: `docs/hud/before/` and `docs/hud/after/` (22 states each at 1280x720 and 1920x1080, `<state>-<W>x<H>.png`). Style guide: `docs/hud/style-guide.html` (open it in a browser; it loads the real stylesheet).
Legal: homage only. Every label, glyph and shape is original; no franchise marks, insignia, delta shapes, ship names or copied text (TODO.md "Legal").

## 1. Review: what was wrong

**Scale and legibility**
- Every size was a fixed px value: text 9-13 px, key hints 8 px. At 1080p the whole HUD shrinks to about two thirds of its apparent size next to the scene (`before/play-pinned-1920x1080.png`); the 9 px micro labels are unreadable on a bright deck.
- Text sat directly on the scene (prompt, toast: a text-shadow only), or on 55-62 % plates that wash out over bright corridors.

**Clutter and unclear priority**
- Top-left: identity panel, then the duty rings floating at a hard-coded `top:92px` in a different panel shape, so two boxes look like one thing built twice. There was no ship time on the HUD at all (it only appeared in the comm log header).
- Top-centre: the condition badge (top 12 px) and the compass (top 36 px) crowd each other, in two different shapes. When an alert is raised the badge vanishes and the 560 px alert card lands on top of the compass.
- Top-right: minimap, route card and legend were three boxes with three different borders. With nothing pinned the route card showed a lone `G` keycap (a mystery box). The pinned task's **name** only appeared as the last small chip of the route steps, so the one thing you must act on was the least prominent. The first-minutes legend and the faults list used hard-coded offsets (244 / 316 px) and collided.
- Bottom-left: vitals and the comm stack sat in the same corner with no relationship; the ship PA was shown twice (stack line and the "SHIP PA" bar). The label "HULL INTEGRITY" was personal health (ambiguous with ship hull), the bars had no numbers, and the health bar was red when full (reads as danger).
- Bottom-centre: six layers (prompt, toast, subtitles, announcement, duty hint, belt) at six unrelated offsets (34 % / 70 % / 22 % / 15 % / 8 % / 10 px). Prompt and toast overlapped near the reticle.

**Inconsistent colour**
- Teal meant ship class, route, stamina, panel sub-headings and "OK" in different places; orange was frame, due, selected and the duty label; the wheel sectors were all the same colour. A player could not learn "colour = state".

**Inconsistent shape**
- Four shape languages at once: chamfered `clip-path` panels (which also clip focus outlines), 6 px rounded boxes (conversation screen), square keycaps, round chips. Modal panels (radio, log, alert card) were anchored top-right at 56 px and overlapped the minimap, identity plate and compass, with the HUD at full brightness behind them.

**Per-screen**
- Duty board: 9-11 px text, 34 px lanes, legend at 9 px.
- Briefing: the "Begin watch" button is below the fold at 720p and the flythrough map takes 34 vh.
- Name tags: 10 px, 5 px rank pips.
- Conversation screen: good hierarchy, different shape language.

## 2. What changed

Everything is additive: `css/hud-skin.css` (new) is linked after the inline styles. Every rule starts with `body` (or is a new class) so it beats the older rules by specificity, with no `!important`. Deleting the file restores the old look. JS changes are small and logic-free.

**One scale.** `js/hud-skin.js` sets `--z` (1 at 1280x720, up to 1.5 at 1080p+, down to 0.8 on small windows); `html{font-size:16px*z}` and every HUD size is rem. At 1080p the HUD is 1.5x, text never drops below 10 px at 720p and 0.625 rem is only used for key hints and tick labels.

**One layout (consistent placement)**

| Zone | Contents | Priority |
|---|---|---|
| Top-left elbow | deck pill, class pill, ship time, ship + reg, room; duty rings below | secondary |
| Top-centre | compass; the condition pill hangs under it and is replaced by the alert card in the same slot | alerts: primary when raised |
| Top-right elbow | minimap; **route card with the pinned task as its title, big metres, ETA ring**; legend (first 2.5 min); faults | **primary: what to do now** |
| Reticle | `[E]` prompt, then toast, just below the cross | primary, transient |
| Bottom-left elbow | comm lines (PA excluded, it has its own bar), vitals (segmented, numbers, fade to 50 % when full and idle) | tertiary |
| Bottom-centre, upward | belt, duty hint, announcement bar, subtitles | ordered stack |
| Bottom-right | handheld / combat chips | contextual |

**One shape set.** Elbow caps in the four corners, pill labels / keys / buttons / toasts / name tags, "cap" plates (coloured spine with rounded outer corners) for secondary plates, 20-segment bars for every meter (health, stamina, target health). All `clip-path` chamfers are gone.

**One colour rule.** Frame colours (orange, gold, peach, lavender, periwinkle, rose, sky) are decoration only. Meaning colours (department, alert, warn, ok, info, route, neutral) are the only colours that carry information. Health is green (red when low), stamina is info-blue (amber when low), duty rings keep their state colours, wheel sectors each get a frame colour, name tags and radio cards use the department colours.

**Less clutter / auto-fade.** Vitals fade to 50 % when full and unchanged for 4 s; the legend stays time-limited (it was already at 150 s) and fades; while any menu layer is open (`body.ui-menu`) the in-game HUD drops to 30 % so panels do not fight it; all HUD hides behind full screens (`body:has(.screen.show)`); PA lines are no longer duplicated in the comm stack; the combat prompt hides during a fight.

**Readability.** Plates are 80-93 % opaque everywhere text sits; toasts, prompt, hint and announcement are pills on solid plates; subtitles and comm lines use a plain sans (the condensed face is for labels only).

**Screens.** Title / pause / credits get corner elbows, a segmented rule under headings, pill buttons; the briefing and end screens share the panel frame, pill section headings and a sticky "Begin watch" button; the duty board, radio, log and alert panels share one frame (elbow + spine + pill title) in gold / periwinkle / orange.

Markup / JS touched: `index.html` (link, `#shiptime`, `#mapframe` wrapper around `#minimap`, vitals numbers, health label), `js/hud-skin.js` (new: scale, readouts, calm / low classes, clock), `js/nav-hud.js` (route card template: pinned title line, "No guide" text instead of a bare key). All existing ids and classes are kept.

## 3. Design tokens

All in `:root` of `css/hud-skin.css`.

| Group | Tokens |
|---|---|
| Frame (decoration) | `--k-orange #f0933a`, `--k-gold #f4c25b`, `--k-peach #f7c9a2`, `--k-lav #b99be6`, `--k-peri #7d97e8`, `--k-rose #e4829a`, `--k-sky #8fd8ff` |
| Department | `--m-cmd #6ea8ff`, `--m-flt`, `--m-ops`, `--m-eng`, `--m-sec`, `--m-sci`, `--m-med`, `--m-svc` (same hexes as `js/icons.js` `DEPT_COL`) |
| State | `--m-alert #ff5a4a`, `--m-warn #ffb347`, `--m-ok #4fd18b`, `--m-info #8fd8ff`, `--m-route #8ef3ff`, `--m-neutral #8fa0b6` |
| Surface / ink | `--k-black`, `--k-plate` (.80), `--k-plate-hi` (.93), `--k-plate-lo` (.55), `--k-ink`, `--k-dim` |
| Type (rem) | `--t-micro .625`, `--t-small .75`, `--t-base .875`, `--t-large 1.125`, `--t-title 1.75`, `--t-hero 2.6` |
| Shape | `--r-elbow 1.7rem`, `--r-pill`, `--r-cap .9rem`, `--bar-w .85rem`, `--bar-h .5rem`, `--gap .5rem` |

The older `--lc1..--lc4`, `--f-d`, `--f-m` still exist and are still used by the legacy rules.

## 4. How to extend

- New panel: `class="k-elbow-tl"` (or `k-cap-l`), set `--kc` to a frame colour; title in a `.k-pill`; sizes in rem.
- New meter: `.k-seg-bar` with `--kc` (meaning colour) and `--v` (0-100).
- New state colour: add one `--m-*` token and one row in the style guide; do not reuse a frame colour for state.
- Z-order and placement: stay inside the zone table above (do not add a seventh layer to the bottom-centre column).
- Motion: any animation needs a `@media (prefers-reduced-motion: reduce)` and `body.reduce-motion` off switch (see section 14 of the stylesheet).
- Combat HUD (`js/combat-hud.js`, ids `#cb-*`): restyled in section 15 of the stylesheet with the same pills / segmented bar / meaning colours; add new combat elements there, not in the module's own CSS.

## 5. Before / after

State list (each exists as `docs/hud/before/<state>-1280x720.png`, `-1920x1080.png` and the same under `after/`):
`title`, `pause`, `company`, `credits`, `play`, `play-pinned` (route card), `nametags`, `toast-comp`, `toast-warn`, `toast-good`, `vitals-low`, `wheel`, `duty-board`, `radio`, `alert-card`, `comm-log`, `bigmap`, `status` (Tab schematic), `comm-stack`, `talk`, `briefing`, `end-of-watch`.

## 6. Open points for the owner

- The condensed face is a system-font stack (no webfont): on a machine without Avenir Next Condensed / Roboto Condensed / Arial Narrow the labels are wider (the layout allows for it). Vendoring an OFL condensed face (and crediting it in `CREDITS.md`) would make the look identical everywhere.
- The briefing flythrough map renders blank in the headless screenshots (it needs the live animation loop); it is not changed.
- Name tags still overlap when two crew stand close to each other (pre-existing; needs a de-overlap pass in `js/nametags.js`).
- Left unchanged on purpose: `?mode=madness` HUD pieces other than what shares ids (objective, phaser cells get the new look through the shared rules).
