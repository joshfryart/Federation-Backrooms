# Computer Core (`datacore`)

## Now

- Module: `js/rooms/datacore.js` (`layout(ctx)`; optional `dress`). Check: `node tools/room-check.mjs datacore`, look: `node tools/shot-room.mjs datacore <seed>`.
- Size: 3-5 tiles; spawn weight 0 (zone weights only); department operations.
- world.js today: wall pool ROOM_DECOR `monitorB, monitorO, comm, breaker, coil`; FIT `toolboard, locker`; floor `rubber`; ceiling `ceilg`; walls `wallp`; light #9cb8ff.
- Legacy: this layout still uses bare put() on a pattern and can box a tile in (room-check WARN, fail with --strict). Fix by switching to safePut.

## Backlog (10 slots)

Each slot: what exists, then open ideas. Ids are docs/asset-gaps.md rows. Mark a slot done with the commit hash.

1. **Layout variants by size**: Servers / relay racks (OPS-4) / consoles on a checkerboard (bare put), comms station on a wall.
2. **Focal centrepiece / facing**: None; a central core column would help.
3. **Wall-fixture pool / weights**: monitorB / monitorO / comm / breaker / coil.
4. **Clutter**: (open)
5. **Floor zones / markings**: (open)
6. **Light colour / fixtures / emergency**: Blue; rack LEDs.
7. **Ceiling features**: Cable trays.
8. **Signage / placards**: (open)
9. **Doorway treatment**: (open)
10. **Wear / storytelling**: Hot-aisle heat shimmer.

Rules and the fast check: [README.md](README.md).
