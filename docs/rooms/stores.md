# Stores (`stores`)

## Now

- Module: `js/rooms/stores.js` (`layout(ctx)`; optional `dress`). Check: `node tools/room-check.mjs stores`, look: `node tools/shot-room.mjs stores <seed>`.
- Size: 3-5 tiles; spawn weight 0 (zone weights only); department services.
- world.js today: wall pool ROOM_DECOR `rack, rack, shelf, locker, extinguisher, dclocker, coldstore_door`; FIT `rack, shelf, locker`; floor `deck`; ceiling `ceilm`; walls `wallg`; light #ffe0b0.
- Legacy: this layout still uses bare put() on a pattern and can box a tile in (room-check WARN, fail with --strict). Fix by switching to safePut.

## Backlog (10 slots)

Each slot: what exists, then open ideas. Ids are docs/asset-gaps.md rows. Mark a slot done with the commit hash.

1. **Layout variants by size**: Random fill of carts / shelving / crates (70 %), desk, cooler (SVC-5), feedstock silo (SVC-17), injector crate.
2. **Focal centrepiece / facing**: None.
3. **Wall-fixture pool / weights**: rack x2 / shelf / locker / extinguisher / dclocker / coldstore_door.
4. **Clutter**: Boxes, canisters.
5. **Floor zones / markings**: (open)
6. **Light colour / fixtures / emergency**: Warm.
7. **Ceiling features**: (open)
8. **Signage / placards**: (open)
9. **Doorway treatment**: (open)
10. **Wear / storytelling**: Inventory clipboard.

Rules and the fast check: [README.md](README.md).
