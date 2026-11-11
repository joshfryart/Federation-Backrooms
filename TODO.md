# TODO / Handoff — Starfarers: The Backdecks

Priority order: **1) Models & art → 2) Environment → 3) Gameplay/balance → 4) Platform/polish.**
Branch: `ccr-40d2051b-ujf34p`. No build step; serve statically (`python3 -m http.server 8000`).

## Current state (what exists)
- Procedural tile-based deck generator (`js/world.js`), 14 parody ships, 10 room types, roguelike loop (8 decks → win, then endless), perks.
- 6 enemy types (`js/enemies.js`): Gronk (hand-built), Compliance Drone, Mr. Grinsworth (hologram, weeping-angel + walks through walls), Space-Madness Crewmen (packs), Clingon Crawlers (ceiling drop, mash E), Slimeling impostors (fake survivors).
- Rendering: PBR floors/walls with *derived* normal/roughness maps, HDRI reflections (Poly Haven "Lobby"), AgX tone mapping, bloom (with highlight compression pass), grain/CA/vignette, torch shadows, pooled ceiling point lights, light cones, dust, blackout events, flooded decks, decals (blood/claw/scorch).
- Assets: CC0 models in `assets/models/` (Quaternius, Kenney), credits in `CREDITS.md` + in-game Credits screen. Keep these in sync when adding assets.
- Test harness lives outside the repo (Playwright + headless Chromium/SwiftShader); see "How to test".

## 1. MODELS & ART (do first)
- [ ] **Style decision:** Quaternius GLBs (drone `robot_large`, crazed `zombie`, hologram `ghost`, slimeling `alien_big`) are cartoony low-poly and clash with the hand-built Gronk/crew. Either (a) rebuild them procedurally in `js/actors.js` to match the Gronk's fidelity, or (b) lean into the mix and unify via shared materials/tinting. Recommend (a) for Drone + Crazed + Slimeling; keep `ghost` only if heavily restyled.
- [ ] **Crew/NPCs:** faces are tiny and texture-only; add proper head geometry (nose/brow/lips), hands with fingers, hair variety (ponytail, afro, curls), uniform variants (jumpsuit, TOS tunic, lower-decks style), rank pips, name badges. Add walking/idle poses; crew currently only breathe + turn their heads.
- [ ] **Corpses:** more varied death poses, torn uniforms, visible wounds/exposed bone, props nearby (dropped zapper, scorched tunic).
- [ ] **Gronk:** animation polish (roar, lunge, head tracking, tail whip), damaged/injured states after a stun, eye glow in the dark, better teeth/jaw, skin subsurface look, footprints.
- [ ] **Compliance Drone:** custom model (exposed cabling, one assimilation-tool arm, single eye sweep), "adapted" visual state.
- [ ] **Mr. Grinsworth:** proper hologram shader (scanlines, edge glow, glitch/tear), custom host model, grin animation; currently reuses `ghost.glb` with an additive scanline material.
- [ ] **Clingon Crawler:** better legs/mandibles, ceiling-hang pose, latched-on face animation, death splat.
- [ ] **Furbles (tribbles):** current shell-fur is fine at distance; check closeup, add purr animation and tiny coos.
- [ ] **Items & first-person zapper:** real viewmodel (hands, muzzle flash mesh, charge cells display); Kenney `weapon_gun.glb` is a placeholder. Verify size/position (it was too large; now height 0.2 at (0.17,-0.17,-0.5)).
- [ ] **Props (`buildProp` in `js/world.js`):** all built from boxes. Replace/upgrade consoles, bridge chairs, biobeds, bunks, tables, crates, warp core, shuttle, trees. Kenney `desk_chairArms`, `desk_computer`, `barrels` GLBs are already bundled but **not yet used**.
- [ ] **Textures:** replace procedural albedo/derived normals with real CC0 PBR sets (brushed metal panels, carpet, ceiling tile, scuffed floor). **Blocked in the sandbox:** Poly Haven / ambientCG / Quaternius / Kenney sites return 403 — allow `polyhaven.com` / `ambientcg.com` in the environment network settings, or source from npm/GitHub-raw mirrors (those work). Budget 1K textures, ≤ 8 MB total; consider KTX2 later.
- [ ] **UI art:** HUD is plain; add LCARS-like (parody-safe) panels, icon set, better title screen/background, death/win screens, credits polish.
- [ ] Update `models.html` (model viewer) to show every enemy/NPC variant; it is the quickest way to review art.

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
- [ ] Optional: N8AO or GTAO behind High quality (see research notes below); RectAreaLight for panels (limit 2–4, pooled).

## 3. GAMEPLAY / BALANCE
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
- [ ] Unit-ish tests for `generate()` (all chips + exit reachable; props never disconnect the map).

## Known issues / watch-outs
- High-quality mode: a torch held against a wall once blew bloom out to white. Fixed by a highlight-compression pass (`CompressShader` in `js/fx.js`) + bloom threshold 1.9; re-check after any lighting/exposure change.
- Light cones (`world.cones`) and the flashlight beam cone are additive meshes; they add haze — tune `opacity` if the image feels foggy.
- Headless SwiftShader is very slow with bloom/shadows; use `__game.setQuality('low')` in tests (post/shadows/cones off).
- `scene.environment` HDRI loads async; `window.__game.ready` resolves when models + HDRI are loaded (tests must await it).
- `PCFSoftShadowMap` was removed in r187 (three falls back to `PCFShadowMap`); change the setting to silence the warning.
- Gorn → "Gronk" rename only touches visible strings; internal identifiers (`makeGorn`, `gornSpawn`, `gorns` array, `animateGorn`) still say gorn.
- `assets/models/slime_spiky.glb`, `desk_chairArms.glb`, `desk_computer.glb`, `barrels.glb` are bundled but unused.
- `js/gorn.js` was removed (replaced by `js/enemies.js`).

## How to test (no repo harness yet — suggested)
- Serve: `python3 -m http.server 8123`; Playwright launch args: `--use-gl=swiftshader --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`.
- Debug handle: `window.__game` ⇒ `{ ready, G, P, world, gorns, ents, newRun(), loadDeck(n), step(dt,t), setQuality('low'|'high'), camera, scene, renderer, post, decals, die(), complete() }`. Wait for `__game.ready` first.
- Generator check: import `./js/world.js` in the page and run `generate(deck, seed)` for decks 0–11 × many seeds; assert chips/exit reachable from `start` via `bfsFrom`.
- Full-loop bot: teleport `P` onto each chip, then onto `world.liftPos`, dispatch `KeyE`, pick perk with `Digit1`; should reach the win screen at deck 8.
- Art review: `models.html` (hash `#gorn`, `#face` for close-ups); take screenshots at `deviceScaleFactor: 2` for anything a human will review.

## File map
`index.html` (UI/CSS) · `js/main.js` (loop, input, HUD, spawn, FX wiring) · `js/world.js` (generation, textures, props, lighting detail) · `js/enemies.js` (AI + model wrappers) · `js/actors.js` (procedural characters/items) · `js/assets.js` (GLB/HDRI loading) · `js/fx.js` (post, particles, decals, dust) · `js/audio.js` (procedural WebAudio) · `js/data.js` (ships, rooms, perks, text) · `vendor/` (three + addons) · `assets/` (models, env, licenses) · `CREDITS.md`.

## Research notes (realism tooling, from an earlier survey; verify before relying)
Ranked: real CC0 PBR textures (biggest win) → AgX/grade tuning (done) → fake volumetrics (done) → MeshPhysicalMaterial on floors/walls (clearcoat for wet floors, sheen for carpet) → N8AO/GTAO behind High quality → KTX2 textures → RectAreaLight panels → glTF characters (use generic reptile/uniform models; avoid franchise likenesses). Not worth it: SSR, full Reflector floors, SSGI, TAA (ghosting with flicker), DOF, baked lightmaps for a procedural level.

## Legal
Parody/homage: keep all names original (no franchise marks, insignia, or likenesses). Credit every third-party asset in `CREDITS.md` and the in-game Credits screen.
