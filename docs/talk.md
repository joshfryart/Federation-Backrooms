# Systems Nominal: conversation close-up (E on a crew member)

Owner request: "If I press E to talk to someone, zoom in to their face so I can see who I am talking to and pause the rest of the game, except their model idles during the conversation, gestures etc." Design: `docs/mockups/pacing-npc.md` section 4, visual spec `docs/mockups/conversation.html`. Code: `js/talk.js` (one module: pure parts + the `Talk` glue). Tests: `tools/test-talk.mjs` (node) and the `talk browser:` block in `tools/test.mjs`.

## Flow

`interact()` (main.js) calls `G.talk.begin(e)` for a crew member; if it returns false (no rig, not Systems Nominal, an exception while starting) the old list menu `talkMenu(e)` opens instead. `begin`:

1. Guards: not an impostor (`e.fake`), not turning / cowering, human rig with a Head bone, `G.phase === 'play'`. A hazard on the player's deck refuses with "Not now!" (`ctx.canTalk`).
2. Saves the camera (position, quaternion, FOV, rotation order), the speaker's clip / rotation / look, the alert level and ship phase.
3. `G.phase = 'talk'`, `body.talking`, `UIHUB.ui.open('talk', { close })`: the ui-mode layer releases pointer lock **on purpose**, so `pointerlockchange` never shows the pause screen (and `onLockChange` ignores unlocks outside `play` anyway). `js/menus.js` keeps the layer alive in phase `talk`.
4. Hides the player's viewmodel (`vmScene`), adds a soft key light at the face, enables the depth-of-field pass on High quality.
5. Speaker: plays `idle` (a sitting pose is kept: they turn their head instead), turns to face the player over ~0.4 s, opens with a short line.

`main.js frame()` runs `G.talk.step(dt, t)` **instead of** `step()` while `G.phase === 'talk'`, and aborts the talk if the phase changes under it (death, lift, end of watch). End: Esc (pops the layer), E, the Leave hub, Backspace with nothing selected. The camera blends back in 0.5 s (0.3 s when hurried), then restores **exactly** (position / quaternion / FOV), `G.phase = 'play'`, the layer stack empties and pointer lock is re-requested inside that key gesture (a refusal shows the "Click to resume" chip, not the pause screen). The speaker gets their saved clip back (walk / operation / repair pose), the additive layer is cleared and the walk / `Operator` / repair job resume where they were (they were frozen, not cancelled).

## What runs during the talk

| Runs | Frozen |
|---|---|
| the speaker: `H.update`, idle / `idle_talking` while speaking, `Fidgeter` with `state: 'talking'` + forced gesture per line, blink, mood expression, jaw, eye contact | `G.sim`, comms / clock / alerts / bridge, `Phases`, `Duty` clocks, `RepairCrew`, haul, other NPCs (frozen mid-pose), enemies, particles, doors, player physics, hazard damage, director, minimap / HUD (hidden), `G.time` |
| the camera rig and the talk UI | |
| `world.update` (lamps / screens glow), portraits (`Menus.frame`) | |

Talking costs no ship time. `PAUSE` / `runsInTalk()` in `js/talk.js` document the rule; the browser test checks `sim.t`, `duty.t`, the ship clock, phases, repair and other NPCs are bit-identical across a talk while the speaker's mixer advances.

## Camera

- Face centre = Head bone world position + 0.085 m up + 0.07 m along the speaker's facing (scaled by height), tracked every frame with a critically damped follow (12/s) so idle / gestures move the frame a little without jitter; +0.4% breathing zoom.
- `framing(face, fwd)`: 0.9 m in front of the face, 0.1 m to screen-right (a hint of three-quarter view), yawed so the face lands on the **left third** of the screen (any aspect) and a little above the middle; FOV 70 -> 38 (`TALK`).
- Clearance, once per talk: tile raycast + a three.js raycast against the static scene (consoles, screens) from the face towards the camera; on a hit it swings +-20 / +-35 degrees round the speaker or shrinks to >= 0.55 m (`pickClearance`). Sitting people keep facing their station: the camera stays within ~55 degrees of their facing and their head turns to it.
- Frozen bodies near the lens or in frame up to 3.5 m behind the speaker are hidden for the close-up and shown again on exit.
- In: 0.7 s smoothstep (position lerp, quaternion slerp, FOV lerp from the saved pose); out 0.5 s (0.3 s hurried).
- High quality: a screen-space depth-of-field ShaderPass inserted before the final pass (blur grows with distance from the face on screen). Performance: CSS letterbox bars + radial vignette only.

## Speaker animation

- Jaw: `H.face({ JawDrop })` from the babble syllable plan (`babblePlan(text, voice).syl`, the same timing the Babble voice plays), `jawAt()`; OS voices (synth) use a noisy 6-9 Hz flap for the spoken duration.
- Gestures: each line carries one (`nod`, `head_tilt`, `small_smile`, `eyebrow_raise`, `shrug`, `shake_head`, `frown`, `sigh`, `talk_emphasis`) forced via `Fidgeter.force`; `talk_emphasis` beats every 1.4-2.6 s while speaking; between lines the fidgeter picks `talking` gestures.
- Eyes: `H.lookYaw` / `lookPitch` follow the camera (clamped +-0.9 / +-0.4 rad), with a thinking glance away every 5-9 s (more often for `habit:avoids-eye-contact`).
- Mood (`moodOf`: trust, ship alert, busy) = warm / neutral / on edge -> a light Smile / Frown layer, the plate icon and line choice.

## UI (from the mockup)

Letterbox bars, vignette, "World paused · ship time" badge, a lower-third name plate (live portrait chip `UIHUB.portraits`, full name, rank + title, rank pips, department chip in department colour, two social / workstation tags, mood), the typed subtitle line (36 cps; the voice plays via `speak()`), your own line in italics, the intent wheel (js/wheel.js maths + SVG, two rings, Leave hub, digits 1-8 then a second digit for the ring, arrows / Enter, click, locked options show their reason in the hub and the "you" line), and the relationship meter (`Duty.trust`, ghost tick at the starting value, +/- flash). Every line (theirs and yours) is kept in `G.sayLog`.

## Intents (`buildIntents`, `lockOf`, `lineFor`, `effectFor`)

| # | Category | Second ring | Locked when | Trust |
|---|---|---|---|---|
| 1 | Greet | | | +0.01 once (bark pool by rank) |
| 2 | Duty | What are you fixing? (if repairing), Your duty?, Ship status (their department board), Lend a hand (`RepairCrew.assist`), Take over (`RepairCrew.abort`, you finish it) | lend a hand until they are on site | +0.01 once; take over +0.03 |
| 3 | How are you? | | | +0.02 once |
| 4 | Small talk | | | +0.03, x0.5 each repeat (tag-driven lines) |
| 5 | Ask help | My duty (`Duty.askHelp`), Fix <fault> (`RepairCrew.order`) | not your department / chain; trust < 0.25; no duty to hand off | Duty's own (-0.02 refused) |
| 6 | Order | Do your duty (`Duty.order`), Delegate <due loop> (`Duty.delegate`), Fix <fault> | they do not report to you; nothing due | Duty's own |
| 7 | Give item | | not carrying | haul `talkOpts` (gift, food, medkit) or `RepairCrew.deliverPart` for a NEEDS_PART job |
| 8 | People | Friends? (`social.talkLine`), gossip about up to 3 ties (friends, rivals, partner) | gossip at trust < 0.3 (and a shrug below 0.4) | +0.02 once / +0.01 per person |

## Robustness

- Speaker removed, dead, crazed, evacuated or turning: immediate restore (`abort`).
- `G.phase` changed by something else: `frame()` aborts at once.
- Red alert (severity >= 3, above the level at the start), a ship phase change or HP loss: "I have to go!" and a 0.3 s hurried exit.
- Any exception while starting: restore and fall back to the list menu.

## Tests

`node tools/test-talk.mjs`: state machine, ease / damp, framing (left third for 4 headings x 3 aspects), clearance, pause rules, jaw, mood, intent locks, effects, lines. Browser (`talk browser:`): E through the real key path enters `talk` as a ui layer, camera < 1.2 m from the head with FOV < 45, sim / duty / clock / phases / repair / other NPCs bit-identical while the speaker animates, HUD hidden + plate + 8-icon wheel, small talk raises trust and is subtitled + logged, a locked order says why, digits choose, Esc ends without the pause screen and the camera / phase restore exactly, E ends, speaker removal / phase change / red alert. Visual check: Playwright with `requestAnimationFrame` stubbed, `__game.talk.begin(e)`, `__game.renderer.render` (or `post.render` on High) + `toDataURL`, looked at for crew_m, crew_f, crew_f2, crew_heavy, standing and seated, Performance and High.

## Open

- Not played by hand: transition times, the 0.9 m / 0.1 m framing and the light (0.45) need tuning on a real GPU; the face texture of the bodies is low-res at this distance.
- Name reveal ("met" flag), a cost in ship time for long chats, and a gamepad mapping for the talk wheel are not built.
- A frozen body far behind the speaker (> 3.5 m) stays visible (blurred on High).
- The quick wheel "This -> Talk…" item still opens the list menu.
