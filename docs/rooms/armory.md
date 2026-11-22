# Armory (`armory`)

## Now

- Module: `js/rooms/armory.js` (`layout(ctx)`; optional `dress`). Check: `node tools/room-check.mjs armory`, look: `node tools/shot-room.mjs armory <seed>`.
- Size: 3-3 tiles; spawn weight 0 (zone weights only); department security.
- world.js today: wall pool ROOM_DECOR `rack, locker, rack, extinguisher, camdome`; FIT `rack, locker`; floor `deck`; ceiling `ceilm`; walls `wallg`; light #ffe8c0; placards voltage, pressure.

## Backlog (10 slots)

Each slot: what exists, then open ideas. Ids are docs/asset-gaps.md rows. Mark a slot done with the commit hash.

1. [x] (second charge rack + locker when 4x4 or bigger) **Layout variants by size**: 3x3: weapon rack centre, issue counter (SEC-7) by the door, charge rack (SEC-3) in a corner, desk, workbench.
2. **Focal centrepiece / facing**: Issue counter facing the door.
3. [x] (camdome, badgereader added) **Wall-fixture pool / weights**: rack / locker / extinguisher / camdome.
4. [x] (wastebin) **Clutter**: Battery cells on the charge rack.
5. **Floor zones / markings**: (open)
6. [x] (0xfff0d0, cleaner white) **Light colour / fixtures / emergency**: (open)
7. **Ceiling features**: (open)
8. **Signage / placards**: Voltage / pressure placards.
9. **Doorway treatment**: Counter + mesh screen at the door.
10. **Wear / storytelling**: Sign-out board with names.

Rules and the fast check: [README.md](README.md).
