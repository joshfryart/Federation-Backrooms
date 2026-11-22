# Brig (`brig`)

## Now

- Module: `js/rooms/brig.js` (`layout(ctx)`; optional `dress`). Check: `node tools/room-check.mjs brig`, look: `node tools/shot-room.mjs brig <seed>`.
- Size: 3-5 tiles; spawn weight 0 (zone weights only); department security.
- world.js today: wall pool ROOM_DECOR `locker, monitorO, comm, extinguisher, emitterpost, camdome, badgereader`; FIT `locker`; floor `deck`; ceiling `ceilm`; walls `wallg`; light #c8d4ff.
- Legacy: this layout still uses bare put() on a pattern and can box a tile in (room-check WARN, fail with --strict). Fix by switching to safePut.

## Backlog (10 slots)

Each slot: what exists, then open ideas. Ids are docs/asset-gaps.md rows. Mark a slot done with the commit hash.

1. **Layout variants by size**: Cells on a checkerboard (field cells SEC-2 among barred), desk (SEC-1) and scan arch (SEC-6) by the door.
2. **Focal centrepiece / facing**: Security desk facing the cells.
3. **Wall-fixture pool / weights**: locker / monitorO / comm / extinguisher / emitterpost / camdome / badgereader.
4. **Clutter**: SEC-5 cuffs on the desk.
5. **Floor zones / markings**: (open)
6. **Light colour / fixtures / emergency**: Cold blue-white; field glow.
7. **Ceiling features**: (open)
8. **Signage / placards**: Security emblem.
9. **Doorway treatment**: Badge reader + camera at the entrance.
10. **Wear / storytelling**: Scratched cell walls.

Rules and the fast check: [README.md](README.md).
