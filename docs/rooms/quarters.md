# Crew Quarters (`quarters`)

## Now

- Module: `js/rooms/quarters.js` (`layout(ctx)`; optional `dress`). Check: `node tools/room-check.mjs quarters`, look: `node tools/shot-room.mjs quarters <seed>`.
- Size: 3-3 tiles; spawn weight 3; department services.
- world.js today: wall pool ROOM_DECOR `locker, picture, mirror, shelf, picture`; FIT `locker, shelf`; floor `carpet`; ceiling `ceilc`; walls `wallq`; light #ffc48c.

## Backlog (10 slots)

Each slot: what exists, then open ideas. Ids are docs/asset-gaps.md rows. Mark a slot done with the commit hash.

1. **Layout variants by size**: 3x3: bunk (or platform bed, CMD-3, 30 %) + desk. Variants: twin bunk room, senior cabin with sofa.
2. **Focal centrepiece / facing**: Bed against... currently centre: consider head-to-wall.
3. **Wall-fixture pool / weights**: locker / picture / mirror / shelf. DONE: pictures and mirrors weighted up via dress.decor (iter 4).
4. **Clutter**: Personal items: X-2 frames, lamp, books. DONE: chest of drawers in a corner (iter 1); potted plant in a free corner (iter 2). Senior cabin (platform bed) takes a corner sofa (iter 3). Note: 3x3 rooms have one spare corner after bed+desk.
5. **Floor zones / markings**: (open)
6. **Light colour / fixtures / emergency**: Warm; reading lamp.
7. **Ceiling features**: (open)
8. **Signage / placards**: Name plate by the door (from billets: not known in gen).
9. **Doorway treatment**: (open)
10. **Wear / storytelling**: Unmade bed, clothes on the chair.

Rules and the fast check: [README.md](README.md).
