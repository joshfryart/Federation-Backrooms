# Machine Shop (`workshop`)

## Now

- Module: `js/rooms/workshop.js` (`layout(ctx)`; optional `dress`). Check: `node tools/room-check.mjs workshop`, look: `node tools/shot-room.mjs workshop <seed>`.
- Size: 3-5 tiles; spawn weight 0 (zone weights only); department engineering.
- world.js today: wall pool ROOM_DECOR `toolboard, rack, toolboard, pipes, breaker, hose, panelbox`; FIT `toolboard, rack, hose`; floor `deck`; ceiling `ceilm`; walls `wallg`; light #ffe2a0; placards hot, voltage; floor zones keepout, walkway.
- Legacy: this layout still uses bare put() on a pattern and can box a tile in (room-check WARN, fail with --strict). Fix by switching to safePut.

## Backlog (10 slots)

Each slot: what exists, then open ideas. Ids are docs/asset-gaps.md rows. Mark a slot done with the commit hash.

1. **Layout variants by size**: Lathes / knee mills / fabricator / benches on a checkerboard (bare put: boxes tiles in, see WARN), drill press on a wall.
2. **Focal centrepiece / facing**: At least one fabricator (ENG-7).
3. **Wall-fixture pool / weights**: toolboard / rack / pipes / breaker / hose / panelbox.
4. **Clutter**: Swarf, parts bins.
5. **Floor zones / markings**: Zones keepout / walkway.
6. **Light colour / fixtures / emergency**: (open)
7. **Ceiling features**: (open)
8. **Signage / placards**: Hot / voltage placards.
9. **Doorway treatment**: (open)
10. **Wear / storytelling**: Oil stains.

Rules and the fast check: [README.md](README.md).
