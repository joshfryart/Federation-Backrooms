# Atrium (`atrium`)

## Now

- Module: `js/rooms/atrium.js` (`layout(ctx)`; optional `dress`). Check: `node tools/room-check.mjs atrium`, look: `node tools/shot-room.mjs atrium <seed>`.
- Size: 5-7 tiles, always tall; spawn weight 0 (zone weights only); department services.
- world.js today: wall pool ROOM_DECOR `(none)`; FIT `(none)`; floor `carpet`; ceiling `ceilt`; walls `wall`; light (default white).

## Backlog (10 slots)

Each slot: what exists, then open ideas. Ids are docs/asset-gaps.md rows. Mark a slot done with the commit hash.

1. [x] **Layout variants by size**: 5x5 to 7x7, always tall (5.6 m): tree centre, plants/trees on a diagonal, two sofas on walls; pillars + catwalks via _tall.js.
2. **Focal centrepiece / facing**: Centre tree.
3. [x] **Wall-fixture pool / weights** (done: dress.decor, fit): No ROOM_DECOR row yet: add one via dress.decor.
4. [x] **Clutter**: corner specimen tank, corner ferns
5. [x] **Floor zones / markings**: Default carpet (no FLOOR_OF row): a paver path would read better.
6. [x] **Light colour / fixtures / emergency**: No ROOM_LIGHT row: add a daylight tint via dress.light.
7. **Ceiling features**: Skylight.
8. **Signage / placards**: (open)
9. **Doorway treatment**: (open)
10. **Wear / storytelling**: Fallen leaves.

Rules and the fast check: [README.md](README.md).
