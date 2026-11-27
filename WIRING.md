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
