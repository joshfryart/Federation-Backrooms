# WIRING (stream S1: lighting / GI / shadows)

Hooks other streams need outside S1's files (js/main.js, js/gi.js, js/rooms/_tall.js).

## 1. GI hook for materials with their own onBeforeCompile (S2 crew / skin, S4 props)
`js/gi.js` installs `giPatch` on `THREE.Material.prototype.onBeforeCompile` before anything compiles (js/main.js, first line after the imports),
so every built-in lit material already gets the baked bounce light and contact occlusion with no new program. A material that sets its **own**
`onBeforeCompile` shadows that and gets no GI. To opt in, call the hook at the end of your own one (same program count: it only adds code to
your existing program):

```js
import { giPatch } from './gi.js';
mat.onBeforeCompile = (shader, renderer) => {
  /* ...your own edits... */
  giPatch(shader);   // needs '#include <lights_fragment_maps>' still in the fragment shader; no-op otherwise or if already patched
};
```

- `js/humans.js` / `js/actors.js` crew skin shader (the skinned body material's `onBeforeCompile`): add `giPatch(shader)` as the last line, so
  crew standing under a table / against a wall darken like the props around them. Do it before the uniform prewarm (`prewarmOutfits`) compiles
  them, so no extra program appears at boot.
- Any S4 prop material with a custom `onBeforeCompile` (decals, screens): same one line; skip unlit / additive ones.
- Do NOT set `customProgramCacheKey` to something new per material; keep one function per material family.

## 2. GTAO default and sample count belong in js/fx.js / js/save.js (S1 sets them from main.js for now)
- `js/save.js` line 14 `DEF_CFG.ao: false` -> `true` (main.js now flips it once per settings blob via `CFG.aoDef`; once save.js says true,
  the `if (!CFG.aoDef)` line in main.js can go).
- `js/fx.js` line 79: `samples: 12` / `{ radius: 6, samples: 12 }` -> `8` / `8` (main.js calls `post.ao.updateGtaoMaterial({ samples: 8 })`
  and `updatePdMaterial({ samples: 8 })` right after `new Post`, before any compile; move it there and delete those lines from main.js).
- `js/fx.js` comment at line 46 ("opt-in in the pause menu") and `index.html` pause-menu label: AO is on by default now.

## 3. tools/test.mjs smoke (owner of tests)
- The smoke "AO on renders with no GL error" still holds; add: `__game.world.gi` is set after `loadDeck`, `GI.u.giAmt.value.x === 0`
  after a render (only the world scene's onBeforeRender turns it on), scene light count unchanged.
# WIRING (stream S2, environment materials)

No game hook outside the owned files is needed: everything is wired inside `js/world.js` / `js/assets.js`.

One harness suggestion for the owner of `tools/shot-gfx.mjs` (S0), so golden-shot comparisons survive changes that create objects:

- `tools/shot-gfx.mjs`, `gamePage()` evaluate (the line with `g.newRun()`, ~line 63): re-seed `Math.random` right before and right after `g.newRun()`, and in `__sg.findRoom` / the corridor / talk / blackout views around every `g.loadDeck(dn)` call (`__rs(); g.loadDeck(dn); __rs();`). Reason: every new three.js geometry / texture / material draws `Math.random` for its UUID, so any graphics change that adds or removes an object shifts the seeded stream and the compared views show different alerts, blackouts and crowd positions (S2 saw 57-95 % "differences" that were game state). With the re-seed, S2's after-vs-before was 0.04-2.1 % per view. The baseline must be re-shot with the same patched harness.
# WIRING — hooks stream S3 (post / grade / VFX) needs outside its files

S3 owns `js/fx.js`, `js/smoke.js`, `js/talk.js`. Everything below is optional: without it the game runs as before with the BASE grade
(the look the game always had). Nothing here adds a light, a pass or a program.

## 1. Per-room / per-ship colour grade — `js/main.js`, `function render1(dt, t)` (line ~2176, inside `if (CFG.quality === 'high') {`)

Add one line before `post.render(...)`:

```js
    if (world && ship && G.phase !== 'talk') post.gradeAt(world, P.x, P.z, ship, { mode: G.mode });   // js/fx.js GRADES: hull class + the room the player stands in (blends over 0.8 s, looked up at most 4x a second)
```

`post.gradeAt` does its own throttling (250 ms) and room lookup (`world.tile` + `world.d.rooms`), and only re-targets when the
(hull, room type, mode) key changes. The talk close-up keeps the grade it entered with (frozen world).

## 2. Snap the grade on a deck change — `js/main.js`, `loadDeck` (line ~249, after `scene.fog = new THREE.FogExp2(...)`)

```js
  post?.setGradeFor(ship, null, { instant: true, mode: G.mode });   // no 0.8 s grade blend across the lift doors
```

## 3. (none needed) particles

`Particles` keeps its constructor signature; lit / soft are inferred (additive -> unlit, size >= 0.3 -> soft puff). `main.js` may pass
`{ lit: 0..1, soft: true|false }` explicitly if a set should differ (e.g. `water` with `lit: 0.6`).
