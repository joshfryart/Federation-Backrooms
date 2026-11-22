# Brig (`brig`)

## Now

- Module: `js/rooms/brig.js` (`layout(ctx)`; optional `dress`). Check: `node tools/room-check.mjs brig`, look: `node tools/shot-room.mjs brig <seed>`.
- Size: 3-5 tiles; spawn weight 0 (zone weights only); department security.
- world.js today: wall pool ROOM_DECOR `locker, monitorO, comm, extinguisher, emitterpost, camdome, badgereader`; FIT `locker`; floor `deck`; ceiling `ceilm`; walls `wallg`; light #c8d4ff.
- Legacy bare put() fixed: cells now go through safePut (0 walled-over tiles, --strict clean).

## Backlog (10 slots)

Each slot: what exists, then open ideas. Ids are docs/asset-gaps.md rows. Mark a slot done with the commit hash.

1. **Layout variants by size**: Cells on a checkerboard (field cells SEC-2 among barred), desk (SEC-1) and scan arch (SEC-6) by the door. DONE: cells via safePut (222ddec).
2. **Focal centrepiece / facing**: Security desk facing the cells.
3. **Wall-fixture pool / weights**: locker / monitorO / comm / extinguisher / emitterpost / camdome / badgereader.
4. **Clutter**: SEC-5 cuffs on the desk. DONE: wastebin, evidence drawers, property locker (e054bda, 22b107a, last commit).
5. **Floor zones / markings**: DONE: grate floor via dress.floor (eaa67c4).
6. **Light colour / fixtures / emergency**: Cold blue-white; field glow. DONE: colder light 0xbcd0ff; extra camdome/badgereader in pool (65cf0b5).
7. **Ceiling features**: (open)
8. **Signage / placards**: Security emblem.
9. **Doorway treatment**: Badge reader + camera at the entrance.
10. **Wear / storytelling**: Scratched cell walls.

Rules and the fast check: [README.md](README.md).
