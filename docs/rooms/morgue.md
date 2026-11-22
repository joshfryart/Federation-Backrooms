# Morgue (`morgue`)

## Now

- Module: `js/rooms/morgue.js` (`layout(ctx)`; optional `dress`). Check: `node tools/room-check.mjs morgue`, look: `node tools/shot-room.mjs morgue <seed>`.
- Size: 3-3 tiles; spawn weight 0 (zone weights only); department medical.
- world.js today: wall pool ROOM_DECOR `medcab, locker, monitorG, kit`; FIT `medcab, kit, locker`; floor `tile`; ceiling `ceilt`; walls `wallp`; light #cfe8ff; placards biological, cold.

## Backlog (10 slots)

Each slot: what exists, then open ideas. Ids are docs/asset-gaps.md rows. Mark a slot done with the commit hash.

1. **Layout variants by size** (done: drawers via safePut): 3x3: autopsy table centre, drawers on a checkerboard; bigger rooms could split into cold bank + table.
2. **Focal centrepiece / facing**: Autopsy table (MED-7).
3. **Wall-fixture pool / weights**: medcab / locker / monitorG / kit.
4. **Clutter** (done: corner steriliser): MED-11 drawer tray with a shrouded form (pulled-out tray exists in world.js).
5. **Floor zones / markings**: (open)
6. **Light colour / fixtures / emergency**: Cold blue-white, low.
7. **Ceiling features**: (open)
8. **Signage / placards**: Biological / cold placards.
9. **Doorway treatment**: (open)
10. **Wear / storytelling**: Toe tags, a clipboard with a blank form.

Rules and the fast check: [README.md](README.md).
