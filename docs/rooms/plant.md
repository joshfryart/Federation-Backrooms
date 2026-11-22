# Plant Room (`plant`)

## Now

- Module: `js/rooms/plant.js` (`layout(ctx)`; optional `dress`). Check: `node tools/room-check.mjs plant`, look: `node tools/shot-room.mjs plant <seed>`.
- Size: 3-5 tiles; spawn weight 0 (zone weights only); department engineering.
- world.js today: wall pool ROOM_DECOR `pipes, gauges, pipes, breaker, monitorO, hose, foamstation, hosecab, panelbox, dclocker`; FIT `toolboard, hose, locker`; floor `grate`; ceiling `ceilg`; walls `wallg`; light #ffd0a0; placards hot, pressure, voltage; floor zones keepout, walkway.
- Legacy: this layout still uses bare put() on a pattern and can box a tile in (room-check WARN, fail with --strict). Fix by switching to safePut.

## Backlog (10 slots)

Each slot: what exists, then open ideas. Ids are docs/asset-gaps.md rows. Mark a slot done with the commit hash.

1. **Layout variants by size** (done, safePut diagonal grid; 5x5 adds a wall buffer tank): Pump skids / heat exchangers / scrubbers / tanks / consoles on a diagonal grid (bare put: boxes tiles in, see WARN).
2. **Focal centrepiece / facing** (done, wall operator console by the door): None; consider a central manifold.
3. **Wall-fixture pool / weights**: pipes / gauges / breaker / monitorO / hose / foamstation / hosecab / panelbox / dclocker.
4. **Clutter** (done, maintenance stand + spares drawers on the ring): (open)
5. **Floor zones / markings**: Grate; zones keepout / walkway.
6. **Light colour / fixtures / emergency** (done, amber 0xffb878; slot 3: extra gauges + toolboard in the wall pool)
7. **Ceiling features**: (open)
8. **Signage / placards**: Hot / pressure / voltage placards.
9. **Doorway treatment**: (open)
10. **Wear / storytelling** (done, corner drip bucket): Leaks, drip trays.

Rules and the fast check: [README.md](README.md).
