# Ready Room (`readyroom`)

## Now

- Module: `js/rooms/readyroom.js` (`layout(ctx)`; optional `dress`). Check: `node tools/room-check.mjs readyroom`, look: `node tools/shot-room.mjs readyroom <seed>`.
- Size: 3-3 tiles; spawn weight 0 (zone weights only); department command.
- world.js today: wall pool ROOM_DECOR `picture, shelf, monitorB, locker`; FIT `locker, shelf`; floor `carpet`; ceiling `ceilt`; walls `wallq`; light #ffd8a8.

## Backlog (10 slots)

Each slot: what exists, then open ideas. Ids are docs/asset-gaps.md rows. Mark a slot done with the commit hash.

1. **Layout variants by size**: 3x3 only: one centrepiece (briefing table, CMD-2) + desk on a wall. A 3x5 variant could add a sofa and a window bench.
2. **Focal centrepiece / facing**: Briefing table centred, long axis along the room.
3. **Wall-fixture pool / weights** (done: dress.decor with pictures, comm, mirror): picture / shelf / monitorB / locker; a model-ship shelf (X-2 `frame`) fits.
4. **Clutter**: Tea service on the table, a stack of PADDs.
5. **Floor zones / markings**: (open)
6. **Light colour / fixtures / emergency** (done: warmer lamplight): (open)
7. **Ceiling features**: (open)
8. **Signage / placards**: Command emblem plate (G-1).
9. **Doorway treatment**: (open)
10. **Wear / storytelling** (done: potted plant in a corner): A single personal item: a plant, a framed photo.

Rules and the fast check: [README.md](README.md).
