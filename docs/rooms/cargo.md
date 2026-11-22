# Cargo Bay (`cargo`)

## Now

- Module: `js/rooms/cargo.js` (`layout(ctx)`; optional `dress`). Check: `node tools/room-check.mjs cargo`, look: `node tools/shot-room.mjs cargo <seed>`.
- Size: 3-5 tiles, big 7-9 (p 0.3, tall: pillars + catwalks); spawn weight 3; department flight.
- world.js today: wall pool ROOM_DECOR `rack, rack, rack, extinguisher, breaker`; FIT `rack, locker`; floor `deck`; ceiling `ceilm`; walls `wallg`; light #ffc472; placards pressure, biological; floor zones staging, walkway, keepout.
- Legacy: this layout still uses bare put() on a pattern and can box a tile in (room-check WARN, fail with --strict). Fix by switching to safePut.

## Backlog (10 slots)

Each slot: what exists, then open ideas. Ids are docs/asset-gaps.md rows. Mark a slot done with the commit hash.

1. **Layout variants by size** (done, 1 safePut fill): Crates / pallets random fill (65 %); big bay adds shelving racks along walls; tall variant pillars + catwalks.
2. **Focal centrepiece / facing** (done, 3x3 staging zone clear in big bays): None; consider a central staging zone kept clear.
3. **Wall-fixture pool / weights** (done, dress adds toolboard, dclocker, hosecab): rack x3 / extinguisher / breaker.
4. **Clutter**: SVC-7 straps, SVC-8 tag scanner.
5. **Floor zones / markings**: Zones staging / walkway / keepout.
6. **Light colour / fixtures / emergency**: Warm sodium-ish.
7. **Ceiling features**: Overhead crane rail (tall).
8. **Signage / placards**: Pressure / biological placards.
9. **Doorway treatment**: Console + workbench by the door (asset-gaps 11.8 cargo).
10. **Wear / storytelling** (done, askew crate; also a parked cart): A broken crate, spilled packing.

Rules and the fast check: [README.md](README.md).
