# Galley (`mess`)

## Now

- Module: `js/rooms/mess.js` (`layout(ctx)`; optional `dress`). Check: `node tools/room-check.mjs mess`, look: `node tools/shot-room.mjs mess <seed>`.
- Size: 3-5 tiles, big 7-9 (p 0.7, tall: pillars + catwalks); spawn weight 2; department services.
- world.js today: wall pool ROOM_DECOR `menu, shelf, fountain, shelf`; FIT `shelf, locker`; floor `tile`; ceiling `ceilt`; walls `wallp`; light #ffd49a.

## Backlog (10 slots)

Each slot: what exists, then open ideas. Ids are docs/asset-gaps.md rows. Mark a slot done with the commit hash.

1. **Layout variants by size** (partly done: cold store `reachin_cooler` in the big hall): Small: range + servery + tables in a checkerboard. Big (tall 7x9): serving line along one wall, tables in rows, second cooking line.
2. **Focal centrepiece / facing**: Servery in front of the range (SVC-1, SVC-2).
3. **Wall-fixture pool / weights**: menu / shelf / fountain; SVC-12 recycler slot is still open.
4. **Clutter**: SVC-4 cook's kit; trays on tables; SVC-14 trolley.
5. **Floor zones / markings**: Tile; a queue line in front of the servery.
6. **Light colour / fixtures / emergency**: Warm; brighter over the line.
7. **Ceiling features**: Extraction hood ducts over the range.
8. **Signage / placards**: Menu boards (menu fixture).
9. **Doorway treatment**: Keep the queue lane from the door to the servery clear.
10. **Wear / storytelling**: Spills by the dishwasher (SVC-13), stacked chairs at closing.

Rules and the fast check: [README.md](README.md).
