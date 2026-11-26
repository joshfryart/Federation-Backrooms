# Bridge (`bridge`)

## Now

- Module: `js/rooms/bridge.js` (`layout(ctx)`; optional `dress`). Check: `node tools/room-check.mjs bridge`, look: `node tools/shot-room.mjs bridge <seed>`.
- Size: 5-5 tiles; spawn weight 1; department command.
- world.js today: wall pool ROOM_DECOR `monitorB, monitorO, monitorB, comm`; FIT `locker, kit`; floor `carpet`; ceiling `ceilp`; walls `wallp`; light #bcd6ff.

## Backlog (10 slots)

Each slot: what exists, then open ideas. Ids are docs/asset-gaps.md rows. Mark a slot done with the commit hash.

1. **Layout variants by size**: Only 5x5 today (ROOMS.size [5,5]); a 7x5 variant with a raised command tier would need a size change in data.js (core: ask the integrator).
2. **Focal centrepiece / facing**: Chair at centre facing the viewscreen on the forward wall; helm forward port (FLT-1), nav forward starboard (FLT-4). Keep the viewscreen wall free.
3. [x] **Wall-fixture pool / weights**: CMD-1 master systems board (`sysboard`, js/decorart-bridge.js) is not in the bridge pool yet: add via dress.decor.
4. [x] **Clutter**: OPS-7 headsets on consoles; PADDs on the chair arm.
5. **Floor zones / markings**: (open)
6. [x] **Light colour / fixtures / emergency**: Cool blue; consider a dimmer "night watch" ring and red-alert strip along the aft wall.
7. **Ceiling features**: Central dome / skylight ring over the chair.
8. **Signage / placards**: Command emblem plate (G-1) by the door.
9. [x] **Doorway treatment**: Two-leaf doors aft; a yeoman desk by the door (asset-gaps 11.8 bridge / desk, 9 entries).
10. [x] **Wear / storytelling**: Coffee rings on the arm, a worn patch behind the helm.

Rules and the fast check: [README.md](README.md).
