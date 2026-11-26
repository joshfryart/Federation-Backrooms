# Laundry (`laundry`)

## Now

- Module: `js/rooms/laundry.js` (`layout(ctx)`; optional `dress`). Check: `node tools/room-check.mjs laundry`, look: `node tools/shot-room.mjs laundry <seed>`.
- Size: 3-3 tiles; spawn weight 0 (zone weights only); department services.
- world.js today: wall pool ROOM_DECOR `shelf, pipes, locker, hose`; FIT `shelf, locker`; floor `tile`; ceiling `ceilp`; walls `wallp`; light #f0f0e8.

## Backlog (10 slots)

Each slot: what exists, then open ideas. Ids are docs/asset-gaps.md rows. Mark a slot done with the commit hash.

1. **Layout variants by size**: 3x3: washer centre, dryer on a wall, folding table and linen cart (SVC-15).
2. **Focal centrepiece / facing**: Washer.
3. **Wall-fixture pool / weights**: shelf / pipes / locker / hose. DONE (dress.decor)
4. **Clutter**: Linen stacks, galley whites (W-4). DONE (dress.fit); 3x3 room is full, no room for more blocking props
5. **Floor zones / markings**: (open)
6. **Light colour / fixtures / emergency**: Flat white. DONE (warm 0xfff4e0)
7. **Ceiling features**: (open)
8. **Signage / placards**: (open)
9. **Doorway treatment**: (open)
10. **Wear / storytelling**: Lint, a lost sock.

Rules and the fast check: [README.md](README.md).
