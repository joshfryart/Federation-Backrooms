# Per-room environment work

One file per room type so agents working on different rooms in parallel never edit the same file.

- **Layouts**: `js/rooms/<type>.js` exports `layout(ctx)`. `js/gen.js` builds `ctx` per room and dispatches through the registry `js/rooms/index.js` (`ROOM_LAYOUTS`).
  The `ctx` fields are documented at the top of `js/rooms/index.js`.
- **Tall rooms** (big shuttlebay / cargo / engineering / arboretum / mess, every atrium): the pillars and catwalks are in `js/rooms/_tall.js`. They run after the room's own layout.
- **Random streams**: every room draws from its own `ctx.rnd = mulberry32(seed ^ hash(type, r.x, r.y))` (`roomSeed` in `js/rooms/index.js`). The shared helpers
  (`put`'s default rotation, `ringPut` / `anyPut` tie-breaks) draw from that same per-room stream while the room is laid out. `_tall.js` has its own stream (`'_tall'`).
  So a change to one room type never changes another type's props, and never changes the maze, room placement, tubes, chips, exit or ladder well.
- **Dressing** (`js/world.js`): a room module can export `dress = { decor, fit, floor, ceil, light, wall }`. Each key replaces that room's row in the world.js table
  (`ROOM_DECOR` wall-fixture pool, `FIT` guaranteed searchable fixtures, `FLOOR_OF`, `CEIL_OF`, `ROOM_LIGHT`, `WALL_OF`), or is a function `(current, ctx) => value`.
  world.js applies it at each `PER-ROOM EXTENSION POINT` (`dressTable`). Corridors have a dress-only module, `js/rooms/corridor.js`.
  Example: `export const dress = { decor: (pool) => [...pool, 'sysboard'], light: 0xc0d8ff };`
  Anything the hook does not cover (new geometry passes, per-room ceiling features, door treatments) is core work: write it up in the room's backlog and hand it to the integrator.
- **Backlogs**: `docs/rooms/<area>.md`, one per area (25 room types, plus corridor, lift, tubes, tall, ladderwell, loop): a "Now" summary and ten slots
  (layout variants by size; focal centrepiece / facing; wall-fixture pool / weights; clutter; floor zones / markings; light colour / fixtures / emergency;
  ceiling features; signage / placards; doorway treatment; wear / storytelling).

## Rules

1. Every blocking prop goes through `safePut`, `ringPut`, `anyPut` or `wallPut`. Bare `put` is only for a single-tile centrepiece in a 3x3 room.
   Some legacy layouts (brig, cargo, datacore, plant, stores, workshop) still use bare `put` on a pattern and can box a tile in. `room-check` prints these as WARN.
   Fix them when you work on that room, and check with `--strict`.
2. Never use another room's stream: only `ctx.rnd`. Do not use `Math.random`, the deck `rnd`, or a stream you make yourself.
3. Never edit the core: `js/gen.js` and `js/world.js`. Use `ctx` helpers and the `dress` hook. If you need a new helper or hook, note it in your room's backlog.
4. Keep `safePut`'s guarantees: the room stays one walkable piece, doorways stay clear, and every prop that had a reachable side keeps one.
   A wall prop's front tile is reserved unless you pass `free: true`.
5. Layouts must be deterministic: same seed, same props. Use `ctx.shuffle(arr, rnd)` (Fisher-Yates), never `sort(() => rnd() - 0.5)`.

## Checks

Fast check (about 5 s, node only):

```
node tools/room-check.mjs <type> --baseline          # once, BEFORE editing (writes /tmp/room-baseline.json)
# ... edit js/rooms/<type>.js ...
node tools/test.mjs --only room-props,generator,ship-decks,inventory-rooms && node tools/room-check.mjs <type> --compare
```

- `room-check <type>` generates about 400 decks: every ship and deck, with `require` on and off, liminal on some, and decks weighted toward each type.
  For every room of the type it asserts that the chips and exit are reachable, no prop stands on a doorway, every wall prop keeps a reachable side,
  and the same seed gives the same layout. `--strict` also fails on walled-over tiles. `--compare` fails if any room of another type changed,
  or any room moved. Use `_tall` as the type for the tall-room shell.
- `node tools/shot-room.mjs <type> <seed> [--ship i] [--nth k]` takes a headless Chromium screenshot of the room: two views from opposite corners,
  written to `/tmp/shot-room-<type>-<seed>[-2].png`, with the prop list printed. It starts its own static server.
- Full suite before merging: `node tools/test.mjs` (about 6 min; it must end with `OK`).

## History

- Step 0 (this split): the room switch moved out of `js/gen.js` into these modules, and every room got its own random stream.
  Layouts changed once, as expected. The one seed-sensitive test was the nominal page's dodge check (tools/test.mjs): with the new layout, the body it picked
  had its person sent off the deck by the sim partway through. The check now retries on the next body that can dodge. Full suite: OK.
