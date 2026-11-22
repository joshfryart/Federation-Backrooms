# Sickbay (`sickbay`)

## Now

- Module: `js/rooms/sickbay.js` (`layout(ctx)`; optional `dress`). Check: `node tools/room-check.mjs sickbay`, look: `node tools/shot-room.mjs sickbay <seed>`.
- Size: 3-5 tiles; spawn weight 2; department medical.
- world.js today: wall pool ROOM_DECOR `medcab, monitorG, medcab, kit, locker, gas_panel, stretcher_rack, gas_panel`; FIT `medcab, kit`; floor `hex`; ceiling `ceilt`; walls `wallp`; light #d2fff2; placards biological.

## Backlog (10 slots)

Each slot: what exists, then open ideas. Ids are docs/asset-gaps.md rows. Mark a slot done with the commit hash.

1. [done] **Layout variants by size**: 3x3 / 3x5: biobeds + nurse station; 5x5 (interior >= 9): biobed trio with surgical table, exam couch, steriliser, dispenser.
2. **Focal centrepiece / facing**: Centre biobed; nurse station (MED-1) facing the beds.
3. [done] **Wall-fixture pool / weights**: medcab / monitorG / kit / gas_panel (MED-10) / stretcher_rack (MED-3).
4. [done] **Clutter**: Trays, scalpel, hypo on the steriliser bench (MED-2).
5. **Floor zones / markings**: Hex tile; a clean-zone line round the surgical table.
6. [done] **Light colour / fixtures / emergency**: Pale mint; surgical lamp (MED-4) over the surgical table.
7. **Ceiling features**: Holo-emitters (MED-9) already placed by world.js (up to four).
8. **Signage / placards**: Biological placard; medical emblem (G-1).
9. **Doorway treatment**: Wide doorway: keep a gurney lane clear from the door to the beds.
10. **Wear / storytelling**: Curtain rails between beds, a stretcher out of its bracket after an incident.

Rules and the fast check: [README.md](README.md).

Done so far: 5x5 set and 3x5 beds via safePut, infusion stand in 3x5, sink and bin in 5x5, wall pool extra monitor/cabinet, locker in FIT, lighter mint light. Tried: linen cart / bin in free interior or ring found no room (rooms are full). Stopped early: further props do not fit.
