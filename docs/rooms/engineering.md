# Engineering (`engineering`)

## Now

- Module: `js/rooms/engineering.js` (`layout(ctx)`; optional `dress`). Check: `node tools/room-check.mjs engineering`, look: `node tools/shot-room.mjs engineering <seed>`.
- Size: 5-5 tiles, big 7-7 (p 0.35, tall: pillars + catwalks); spawn weight 2; department engineering.
- world.js today: wall pool ROOM_DECOR `gauges, pipes, toolboard, monitorO, breaker, pipes, panelopen, hosecab, dclocker`; FIT `toolboard, locker`; floor `grate`; ceiling `ceilg`; walls `wallg`; light #ffb060; placards voltage, hot, radiation.

## Backlog (10 slots)

Each slot: what exists, then open ideas. Ids are docs/asset-gaps.md rows. Mark a slot done with the commit hash.

1. **Layout variants by size** (done: big room gets pump skid, heat exchanger, relay rack, knee mill, maint stand; scrubber in all): 5x5 and big 7x7 (tall, pillars + catwalks via _tall.js). Big layout places a CE desk and bench (asset-gaps 11.8).
2. **Focal centrepiece / facing**: Warp core at centre; reactor station (ENG-3) beside it facing the core; field generators (ENG-6) away from it.
3. **Wall-fixture pool / weights** (done: foamstation added, weighted x2): gauges / pipes / toolboard / breaker / panelopen / hosecab / dclocker; ENG-11 foam station belongs here too.
4. **Clutter**: ENG-9 DC hand kit, ENG-12 spare light panels.
5. **Floor zones / markings**: Grate floor; add a keep-out ring (G-3 keepout) round the core.
6. **Light colour / fixtures / emergency**: Amber; core glow pulsing with reactor state.
7. **Ceiling features**: Exposed conduit trays; tall variant has catwalks.
8. **Signage / placards**: Placards voltage / hot / radiation (PLACARD_ROOMS).
9. **Doorway treatment**: (open)
10. **Wear / storytelling**: Scorch marks near the injectors (ENG-13).

Rules and the fast check: [README.md](README.md).
