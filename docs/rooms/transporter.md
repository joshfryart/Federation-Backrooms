# Beam Room (`transporter`)

## Now

- Module: `js/rooms/transporter.js` (`layout(ctx)`; optional `dress`). Check: `node tools/room-check.mjs transporter`, look: `node tools/shot-room.mjs transporter <seed>`.
- Size: 3-3 tiles; spawn weight 2; department operations.
- world.js today: wall pool ROOM_DECOR `coil, monitorB, comm`; FIT `locker, toolboard`; floor `rubber`; ceiling `ceilg`; walls `wallg`; light #9cc2ff.

## Backlog (10 slots)

Each slot: what exists, then open ideas. Ids are docs/asset-gaps.md rows. Mark a slot done with the commit hash.

1. **Layout variants by size**: 3x3 only: pad centre, pedestal (OPS-1) facing out over the pad, workbench, two buffer tanks (OPS-6) in corners.
2. **Focal centrepiece / facing**: Pad; pedestal operator looks over it.
3. **Wall-fixture pool / weights**: coil / monitorB / comm, plus panelbox / breaker. DONE
4. **Clutter**: OPS-5 coil cartridge on the workbench. FIT adds dclocker (DONE); room is full, no floor clutter fits.
5. **Floor zones / markings**: Rubber; keep-off chevrons round the pad.
6. **Light colour / fixtures / emergency**: Cool blue (0x8fbcff, DONE); pad glow while energising.
7. **Ceiling features**: Emitter array over the pad (matching the pad).
8. **Signage / placards**: OPS-8 cargo pad variant (examine text) still open.
9. **Doorway treatment**: (open)
10. **Wear / storytelling**: Scuffed pad rim.

Rules and the fast check: [README.md](README.md).
