# TODO / Handoff — Starfarers: The Backdecks

Priority order: **1) Models & art → 2) Environment → 3) Gameplay/balance → 4) Platform/polish.**
Branch: `ccr-d17a3057-q2r7yl` (continues `ccr-40d2051b-ujf34p`). No build step; serve statically (`python3 -m http.server 8000`).

## Current state (what exists)
- Procedural tile-based deck generator (`js/world.js`), 14 parody ships, 10 room types, roguelike loop (8 decks → win, then endless), perks.
- **Fleet (`js/ships.js`, review page `ships.html`):** ten ships named for the Canadian provinces (registry = year joined Confederation), two each of five original hull classes — Cairn (stacked discs), Longhouse (narrow keel, bow house, engine block), Tandem (twin hulls), Cruller (ring, spokes, hub), Plough (wedge with stern castle). A class is a parametric `inside(u, v, f)` hull function; it masks the maze so each deck's outline is that hull section, and it draws the schematic (profile with the current deck lit + deck plan) on the deck card. Room mix follows the deck's zone: Command, Habitat, Services, Engineering. Game deck 1→8 rides down through the ship's decks.
- **One ship per run** (`G.ship`): you start on its top deck and the run is won at its keel (7–9 decks depending on class).
- **Ship's company & systems (`js/crew.js`, review page `crew.html`):** 8 departments (Command, Flight Control, Operations, Engineering, Security, Sciences, Medical, Support Services) in three uniform divisions; ~41 billets with ranks and reporting lines generate a named roster of 60–90 per ship (`makeComplement`). Each department runs systems (21 total), each with a parts loadout, a home deck, main hardware (warp core, biobeds, bridge consoles, lift…) and maintenance junctions; `ShipState` holds health, faults and a fault director (`tick`, faster under tension and deeper decks), and `effects()` is the one place gameplay reads consequences from (power, blackouts, gravity, air, lurches, scan-o-matic, medkit/cell yield, transporters, hologram speed, lift lockout…). In-game: yellow junction panels and hardware on every deck (`placeRepairPoints` in `js/main.js`, meshes in `js/sysview.js`), faults spark and show ▲ on the map and in the HUD list, hold E to repair (noisy; junctions take 1.5× as long), Tab shows ship status, pause → Ship's company shows the org chart and loadout. Survivors and corpses are roster members (department, rank pips, name) and their status is tracked.
- **Space madness (`js/main.js` "space madness" section, `Hunter.stalk` in `js/enemies.js`, `nextMadness` in `js/crew.js`):** one crew member at a time goes mad, always the lowest-ranked person still alive on the roster (Crewman → … → Captain). Deck 1 opens with the lowest-ranked red-division crewman standing a few corridors from the start; they turn when you get within ~6.5 m (or after 16 s). The mad one hunts the other crew on the deck first (they cower and scream when it is near; kills leave roster corpses) and only goes for you once they are gone or if you get within 3.5 m in sight. Two zapper hits kill (a stunned madman can still be shot); 12–20 s later the next-lowest rank turns somewhere on the deck, out of sight. On later decks the first one turns 16–30 s in. Gronk / Drone / hologram arrive 15 s later than before. Each deck has 3–4 crew survivors (the madness's prey). Crew, corpses and crazed crew wear **collar rank pips** (`RANKS` in `js/data.js`: solid/hollow gold pips, Crewman → Captain); talking to a survivor shows their rank.
- 6 enemy types (`js/enemies.js`, model wrappers in `MODELS`): Gronk (hand-built), Compliance Drone, Mr. Grinsworth (hologram, weeping-angel + walks through walls), Space-Madness Crewmen (packs), Clingon Crawlers (ceiling drop, mash E), Slimeling impostors (fake survivors).
- **Humans are real rigged models now** (`js/humans.js`): MakeHuman-based CC0 bodies (`crew_m/f/f2/heavy.glb`, from dramatis3d samples) + a spacesuit (`suit.glb`), all driven by Quaternius' Universal Animation Library (`human_anims.glb`, 19 clips: idle, idle_talking, idle_torch, walk, walk_formal, jog, sprint, crouch_idle, punch_jab, punch_cross, hit_chest, hit_head, death01, sitting_idle, fixing_kneeling, interact, spell_simple_idle, dance, push). Same rest pose on every body, so any clip plays on any body. `makeHuman(opts)` gives per-instance uniform colour, skin, hair, blood, pallor, slime, face morphs (15 kept: jaw, lids, brows, smile/frown, snarl) and head look-at. Old procedural crew in `js/actors.js` is only the fallback if a GLB fails to load.
- Rendering: real ambientCG PBR sets for bulkheads / deck plate / carpet / tiles / ceiling (`assets/textures/`, per-room floor material), HDRI reflections, AgX, bloom (+ highlight compression), grain/CA/vignette, torch shadows, pooled ceiling lights, light cones, dust, blackouts, flooded decks, decals.
- First-person zapper + hand (`makeViewmodel` in `js/actors.js`) is drawn in its **own scene/pass** (`vmScene` in `js/main.js`) so it never clips walls or gets blown out by the torch; charge cells on the gun mirror the HUD.
- Props (`buildProp` in `js/world.js`): PBR materials, rounded geometry, generated UI screens, plus Poly Haven scans (crate, barrel, plant, utility box, armchair).
- Assets are all CC0; credits in `CREDITS.md` + in-game Credits screen. Keep these in sync when adding assets. Total `assets/` ≈ 7 MB.
- Tests: `node tools/test.mjs` (generator reachability on 300 levels + a bot run through all 8 decks with every enemy type). Asset re-pack scripts: `tools/build-*.mjs`.

## 1. MODELS & ART (do first)
Done in this pass: rigged crew/corpses/crazed/slimeling/drone/holograms, hologram shader (fresnel, scanlines, tearing), viewmodel, PBR textures, prop rebuild, model viewer with every variant (`models.html?set=crew|enemies|misc|props`).
- [ ] **More bodies & clothes.** Only 4 body meshes exist, in casual/sport/work clothes re-tinted as uniforms (cropped tops are hidden by a vertex-painted undershirt). Proper jumpsuits/tunics need new MakeHuman exports: run the dramatis3d creator (https://dramatis.tosijs.net, or the repo with `cdn.tosijs.net` allowed) and re-pack with `tools/build-characters.mjs`. Also worth adding: skin textures (bodies are flat-coloured), rank pips / name badges, more hair.
- [ ] **Space-Madness Crewmen:** no dedicated zombie clips in the free UAL set (uses sprint/jog/punch + face morphs + head twitch). Add shamble/lurch (UAL Pro has more, or author additive bone noise), bite/grab attack, wounds on skin (needs a skin texture).
- [ ] **Corpses:** all use the end of `death01`; add 3–4 authored poses (slumped against wall via `sitting_idle`, face-down, curled), torn uniforms, props nearby (dropped zapper).
- [ ] **Slimeling:** reveal is an instant swap to a green-skinned human; add a transformation (morph/scale wobble, slime drip particles), and a subtle tell while disguised (currently: never blinks, slightly slow idle).
- [ ] **Compliance Drone:** suit + bolted-on eye lens / tool arm / backpack (`droneKit` in `js/enemies.js`). Wants exposed cabling, an eye sweep beam, and an "adapted" visual state after the first stun.
- [ ] **Mr. Grinsworth:** dances when unseen, freezes with a grin when watched. Wants a custom host outfit (bow tie / jacket), eye glow, and a glitch-teleport effect on relocate.
- [ ] **Gronk:** still hand-built from primitives (eyes fixed this pass). Either skin a real reptile mesh to the UAL skeleton or polish: roar, lunge, head tracking, tail whip, injured state, footprints.
- [ ] **Clingon Crawler:** better legs/mandibles, ceiling-hang pose, latched-on face animation, death splat.
- [ ] **Furbles:** check closeup, purr animation.
- [ ] **Viewmodel:** hand is simple capsules; add fire recoil on the hand, reload/charge animation, optional rigged arms (the crew rig has fingers).
- [ ] **Props:** sci-fi pieces (console, warp core, biobed, shuttle, pad, replicator) are still procedural. Candidates: more Poly Haven scans (shelves, lockers, lab equipment) — files can be fetched from GitHub mirrors (search `filename:<asset>_1k.gltf`), see `tools/build-props.mjs`.
- [ ] **Textures:** walls are one plate set with drawn-on seams; add 2–3 wall variants (painted panel, padded, grille), KTX2 later. polyhaven.com / ambientcg.com are blocked in the sandbox; GitHub mirrors work (`raw.githubusercontent.com`, `git clone`).
- [ ] **UI art:** HUD is plain; add parody-safe panels, icon set, better title screen/background, death/win screens, credits polish.

## 2. ENVIRONMENT
- [ ] Wall/ceiling variety: ribbed bulkheads, window frames with real depth, vents with fans, hanging cables, conduit bundles, hazard stripes, scorch panels, damaged ceiling tiles.
- [ ] Per-ship material identity (carpet vs metal vs tile) rather than only tints; room-specific floor/wall materials.
- [ ] Doors: actual sliding doors (open/close) instead of static frames; sealed-door rows are decals only.
- [ ] Taller/unusual rooms (atrium, shuttlebay with high ceiling) — walls are fixed at 3.2 m, only low ceilings are supported today.
- [ ] Real windows to space with parallax starfield/planet; viewscreen on the bridge should animate.
- [ ] Lighting: baked/vertex AO in tile textures, room-specific light colours, emergency/red-alert fixtures, light shafts through vents.
- [ ] Weather-like effects: steam, coolant leaks, sparks (basic versions exist), smoke during alerts.
- [ ] More liminal set dressing: duplicated rooms, impossible corridors/loops, signage that changes between visits, long empty stretches.
- [ ] Sound/ambience per room type (engineering hum, sickbay beeps, shuttlebay echo); positional audio for enemies.
- [ ] Optional: N8AO or GTAO behind High quality (GTAOPass ships with three r187 addons; additive light cones / decals must be excluded from its normal pass) (see research notes below); RectAreaLight for panels (limit 2–4, pooled).

## 3. GAMEPLAY / BALANCE
**Traversal (new, `js/move.js` + glue in `js/main.js`)** — momentum sprint ("flow" raises top speed and cuts stamina drain), jump with coyote time / buffering, mantle and sprint-vault onto climbable props (`userData.top` set in `buildProp`, read through `world.topAt/groundAt`), crouch-slide (tackles crazed crew / slimelings), wall-run + wall-jump along bulkheads, grapple line (Q / right mouse: reels to walls, ceilings and prop tops via `world.raycast`; yanks crawlers off ceilings and staggers man-sized hostiles). Hostiles cannot hit a player standing above their reach and instead drag them down after ~2 s. All tunables are in `MOVE`. Covered by `tools/test.mjs` (jump, mantle, grapple).
**Jiffy tubes (new)** — crawl-height maintenance ducts (`TUBE_H` 1.25 m, 1.2 m wide) that `generate()` bores straight through bulkhead between two open tiles when that is a real shortcut (1–3 per deck; `data.tubes`, `data.tubeAxis`). The player auto-crouches going in and cannot stand or jump inside; a battery or medkit sits mid-tube. Gronk and Compliance Drone are `noCrawl` and wait at the nearer mouth; crazed crew and slimelings crawl in at half speed (`crouch_fwd` clip); crawlers sometimes lurk inside from deck 3. Path field, line of sight and collision all know about the tube's own side walls (`World.field/los/resolve`).
**Ladders:** about two thirds of tubes three tiles or longer climb: lower run from mouth `a`, a ladder shaft (`tubeLevel` `'lad'`), then an upper run at `TUBE_UP` 1.7 m (`'up'`) whose mouth `b` opens high in the wall. Ladder controls live in `js/move.js` (W up, S / C / look-down+W down, Space lets go; falling into a shaft grabs the ladder). The high mouth can be entered from the corridor with a jump-grab or the grapple. No hostile uses the upper run: crawlers wait at the foot of the ladder, big ones at a mouth.
**Large rooms:** `ROOMS[*].big` + `bigP` give Galley (was Mess Hall, up to 7×9 with a replicator serving line and table rows), Cargo Bay, Shuttlebay, Arboretum and Engineering a large variant; at most one per deck (two on big decks).
- [ ] Climbing uses the `push` clip on ladders and `crouch_fwd` for vaults — no dedicated vault/climb animations exist in the free UAL set.
- [ ] Tubes are straight in plan. Add bends, junctions, ladders that continue between decks (an alternative to the tubelift), hatches that open/close, and grilles looking into rooms.
- [ ] Large rooms are only wider, not taller (walls are fixed at 3.2 m) and are dressed with the same props repeated; add high ceilings/mezzanines, pillars, a proper galley kitchen, cargo racking.
- [ ] First-person crawl animation and hands; crawl audio (knees on metal), muffled outside sounds while inside.
- **Pacing director (`js/director.js`, glue `updateDirector` in `js/main.js`, F3 shows it in game):** one intensity value (rises with nearby hostiles, hits, screams, someone turning, faults, blackouts; decays when quiet) and a build → peak → relax cycle. In *build*, every 14–28 s (faster on deeper decks), if intensity is under the deck's target (0.49 on deck 1 → 0.75), it picks a pressure action: break a system (darkness/comms first when hostiles are about), force a blackout, nudge the nearest hostile toward your area, wake the next dormant hostile, or bring the next madness forward. Past 0.8 it holds a 6–11 s *peak*, then a 22–40 s *relax* where nothing new is added and the next madness waits. Faults now come only from the director and from cascades (`ShipState.auto = false`).
- **Cascades (`CASCADES` in `js/crew.js`):** e.g. coolant offline 40 s → reactor damage; reactor offline 45 s → life support; EPS offline 30 s → lighting, 60 s → gravity; computer → comms; hydroponics → life support; helm → dampers; holo-playroom → medical hologram. Listed on `crew.html`.
- **Crew repairers:** ~55% of faults outside a peak bring a crew member from that department to the junction/hardware (kneeling or working the console). They fix it in 35–55 s unless the madman gets near — then they drop their tools and hide (and they are prey). Talk to them for progress.
- [ ] **Ship systems next steps:** tune director numbers in real play (F3), director-aware hostile spawn timing, crew that move between jobs, spare parts as an item, a hull-breach/vacuum system, and repair minigames per hardware type. Madness pacing (turn delay, kill speed, how long survivors last) is untuned.
- [ ] **Ships:** hulls only shape the deck outline; there are no exterior 3D models, no windows that match the hull edge, no curved corridors following the ring/disc, and all eight decks of a run are on different ships. Options: stay on one ship per run, show the schematic on wall displays/consoles and the pause screen, add the three territories as small craft.
- [ ] **Level design for parkour:** decks are flat with 2.45–3.2 m ceilings, so there is little to climb beyond props. Needs raised catwalks, pits, vents, two-storey rooms (atrium, shuttlebay), ledges and grapple anchor points to get anywhere near a Dying Light feel.
- [ ] **First-person body:** no arms/legs on screen during mantle, slide, wall-run or grapple; only camera motion sells it. Add animated hands (the crew rig has fingers), a grapple launcher on the left hand, landing roll, and footstep/cloth audio per move.
- [ ] **Tuning on real hardware:** all movement was tuned numerically and by headless tests, never played with a mouse. Check jump height under low ceilings (head clamps at 0.6 m), wall-run entry speed, grapple speed/cooldown, slide length, and enemy fairness now that the player is much faster.
- [x] Crazed crew (`climber` in `HUNTERS.crazed`) vault climbable props and follow you through tubes, up ladders and along upper runs, slower than on the floor (props ×0.55, tubes ×0.5, ladders ×0.4; weighted `World.field(…, climb)` makes them prefer the floor; `World.hostileGround` + `Enemy.stepY` lift their feet). They can hit you on prop tops and in upper runs. Gronk and Drone still can't climb or crawl (they wait at a tube mouth or drag you off props); slimelings crawl tubes but don't climb.
- [ ] Balance enemy mixes (deck 6+ can spawn 3 crazed + drone + hologram + clingers — likely brutal); tune speeds, damage, spawn delays.
- [ ] Hiding mechanic (lockers/vents), distraction items, more perks/synergies, meta-progression.
- [ ] Slimeling impostor tells (subtle animation/audio) so players can learn to spot them.
- [ ] Phantom: audit "being looked at" (needs LOS + dot product with `P.yaw`); darkness should reduce visibility.
- [ ] Clinger latch: mash-E feedback, better overlay; make sure death/phase transitions while clung are clean.
- [ ] Tutorial/hints beyond deck 1; accessibility options (reduce flashing/grain/shake, colour-blind, subtitles for audio cues).

## 4. PLATFORM / POLISH
- [ ] Touch/mobile controls (none yet). Gamepad support.
- [ ] Performance pass: measure on real GPUs; auto-quality currently drops to "Performance" if frames > 45 ms for ~4 s. Candidates: merge static props, cull light cones, lower shadow map, dynamic resolution.
- [ ] Save settings/progress (best deck is in `localStorage`); add run stats/leaderboard.
- [ ] GitHub Pages deploy; add CI that runs the generator sanity test (below).
- [x] Smoke test for `generate()` + bot run (`tools/test.mjs`). Still to do: wire it into CI.

## Known issues / watch-outs
- High-quality mode: a torch held against a wall once blew bloom out to white. Fixed by a highlight-compression pass (`CompressShader` in `js/fx.js`) + bloom threshold 1.9; re-check after any lighting/exposure change.
- Light cones (`world.cones`) and the flashlight beam cone are additive meshes; they add haze — tune `opacity` if the image feels foggy.
- Headless SwiftShader is very slow with bloom/shadows; use `__game.setQuality('low')` in tests (post/shadows/cones off).
- `scene.environment` HDRI loads async; `window.__game.ready` resolves when models + HDRI are loaded (tests must await it).
- Performance: each rigged human is ~9 skinned draw calls (×2 with torch shadows). Fine on a GPU, very slow in headless SwiftShader at High quality (screenshots can take 30 s+). If real hardware struggles, merge the body parts per character or drop shadows on distant humans. NPC skinning already pauses beyond 22 m.
- `textures()` in `js/world.js` must only be called after `loadTextures()` resolved (it swaps in the real PBR sets once, then caches).
- Gorn → "Gronk" rename only touches visible strings; internal identifiers (`makeGorn`, `gornSpawn`, `gorns` array, `animateGorn`) still say gorn.
- The cartoon Quaternius/Kenney GLBs from the previous pass were removed.
- `js/gorn.js` was removed (replaced by `js/enemies.js`).

## How to test (`node tools/test.mjs` automates the generator check and the bot run)
- Serve: `python3 -m http.server 8123`; Playwright launch args: `--use-gl=swiftshader --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`.
- Debug handle: `window.__game` ⇒ `{ ready, G, P, world, gorns, ents, newRun(), loadDeck(n), step(dt,t), setQuality('low'|'high'), camera, scene, renderer, post, decals, die(), complete(), makeEnemy(), sound }`. Wait for `__game.ready` first.
- Generator check: import `./js/world.js` in the page and run `generate(deck, seed)` for decks 0–11 × many seeds; assert chips/exit reachable from `start` via `bfsFrom`.
- Full-loop bot: teleport `P` onto each chip, then onto `world.liftPos`, dispatch `KeyE`, pick perk with `Digit1`; should reach the win screen at deck 8.
- Art review: `models.html?set=crew|enemies|misc|props` (`&cam=x,y,z,tx,ty,tz` for close-ups, `&clip=<name>`, `&only=<label>`); take screenshots at `deviceScaleFactor: 2` for anything a human will review.

## File map
`index.html` (UI/CSS) · `js/main.js` (loop, input, HUD, spawn, FX wiring) · `js/world.js` (generation, textures, props, lighting detail) · `js/enemies.js` (AI + model wrappers) · `js/humans.js` (rigged humans, hologram shader, NPC presets) · `js/actors.js` (Gronk, crawler, furble, items, viewmodel, fallback crew) · `js/assets.js` (GLB/HDRI/texture loading) · `js/fx.js` (post, particles, decals, dust) · `js/audio.js` (procedural WebAudio) · `js/data.js` (ships, rooms, perks, text) · `vendor/` (three + addons) · `assets/` (models, textures, env, licenses) · `tools/` (asset re-pack scripts, smoke test) · `CREDITS.md`.

## Research notes (realism tooling, from an earlier survey; verify before relying)
Ranked: real CC0 PBR textures (biggest win) → AgX/grade tuning (done) → fake volumetrics (done) → MeshPhysicalMaterial on floors/walls (clearcoat for wet floors, sheen for carpet) → N8AO/GTAO behind High quality → KTX2 textures → RectAreaLight panels → glTF characters (use generic reptile/uniform models; avoid franchise likenesses). Not worth it: SSR, full Reflector floors, SSGI, TAA (ghosting with flicker), DOF, baked lightmaps for a procedural level.

## Legal
Parody/homage: keep all names original (no franchise marks, insignia, or likenesses). Credit every third-party asset in `CREDITS.md` and the in-game Credits screen.
