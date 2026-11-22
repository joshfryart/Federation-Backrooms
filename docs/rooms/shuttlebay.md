# Shuttlebay (`shuttlebay`)

## Now

- Module: `js/rooms/shuttlebay.js` (`layout(ctx)`; optional `dress`). Check: `node tools/room-check.mjs shuttlebay`, look: `node tools/shot-room.mjs shuttlebay <seed>`.
- Size: 5-5 tiles, big 7-9 (p 0.4, tall: pillars + catwalks); spawn weight 2; department flight.
- world.js today: wall pool ROOM_DECOR `hose, toolboard, pipes, rack, extinguisher`; FIT `toolboard, hose, locker`; floor `deck`; ceiling `ceilm`; walls `wallg`; light #fff0b4; floor zones parking, ejection, walkway.

## Backlog (10 slots)

Each slot: what exists, then open ideas. Ids are docs/asset-gaps.md rows. Mark a slot done with the commit hash.

1. **Layout variants by size**: 5x5 and big 7x9 (tall). Shuttle on cradle centre, both end tiles clear; bay control by the door.
2. **Focal centrepiece / facing**: Shuttle long axis on x (FLT-3 cradle + pad marking in world.js).
3. **Wall-fixture pool / weights**: hose / toolboard / pipes / rack / extinguisher.
4. **Clutter**: FLT-6 chocks and straps, FLT-7 tethers.
5. **Floor zones / markings**: Zones parking / ejection / walkway (ZONE_ROOMS).
6. **Light colour / fixtures / emergency**: Bright work light; amber rotating beacons near the space door.
7. **Ceiling features**: Gantry rail over the cradle (tall variant).
8. **Signage / placards**: Ejection-zone stencil.
9. **Doorway treatment**: R-3 bay space door (2-tile segmented) on one wall: structure, open.
10. **Wear / storytelling**: Tyre marks, scorched pad.

Rules and the fast check: [README.md](README.md).
