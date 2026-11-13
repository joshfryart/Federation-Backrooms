# Pacing, shift-end tasks, NPC repair, speech etiquette (Systems Nominal)

Design source: `docs/mockups/pacing-npc.md` (§1 etiquette, §2 repair, §3 pacing). This page is what is built.

## Pace presets (`js/pace.js`)
Chosen on the title screen (segmented control `#pacesel` + summary line `#pacesum`), stored in `localStorage.fb_pace`,
overridden by `?pace=first|standard|crunch`. Default for a new profile: First watch (Standard under webdriver so tests keep today's timings).

| | First watch | Standard | Crunch |
|---|---|---|---|
| T (watch minutes / 20) | 2.5 (~50 min) | 1 (~20 min) | 0.7 (~14 min) |
| `PHASE_AT` (real s) | 0, 540, 1140, 1800, 2400 | 0, 150, 330, 540, 780 | 0, 100, 220, 360, 520 |
| first duty round | 3:00, then +75 s (+0-45) | 0:30 +20 s (+0-30) | 0:20 +15 s (+0-20) |
| earliest mission task | 4:00 | 1:36 | 1:07 |
| collapse hazard | x0.6, lethal after 60 s, 20 s warning (rate 0) | x1 | x1 |
| NPC notice / work per repair point / hp after patch | 10-22 s / 8 s / 0.9 | 6-14 s / 6 s / 0.85 | 4-10 s / 5 s / 0.8 |
| barks: range, dwell, per-person, global, silent start | 2.2 m, 2 s, 420, 120, 180 s | 2.4 m, 1.6 s, 300, 90, 60 s | 2.4 m, 1.6 s, 240, 60, 60 s |

T is applied **once per system**: `ShipClock.setPace(T)` (rate = 0.005 h/s / T; the crew sim schedule follows the clock),
`ShipState.paceT` (cascade timers), the `Duty` constructor (periods x T, first-due, task opening, `performMul`), the `Phases`
constructor (`phaseAt`, `runLength = 1200 T`, pulse interval x T with floor `pulseMin`, `debtPerPhase`, hazard). Action time stays real:
walking, perform durations, lift rides, hold-E and crew repair work, hazard damage per second.

## Shift-end tasks (`js/duty.js`)
Mission tasks open at `max(at*60*T, pace.firstTask)` and stay open (no window, no auto-miss). `Duty.shiftEnd()` (called by `nomEnd`
on the Phases `end` event) marks the unfinished ones missed, adds them to `maxScore` and the causal chain ("Unfinished at end of shift").
A due duty round nobody got to is a gentle skip (`_miss`: half the skip debt, no score, no witnesses, `stats.missed`).
First mission task of a run: `G.pin = { kind:'task', id, room, deck, tx, ty, label }` (read by the nav guide-me pin) plus a glowing hint line.

## World pause
`nomTick`, `G.comms.tick` (clock, bridge chatter), `ShipState.tick` (cascades), Duty, Phases, sim and the repair crew skip ticking
while `G.menuPause || G.paused` (`worldPaused()` in `js/main.js`).

## NPC repair response (`js/repair.js`, glue in `js/main.js`)
- Every fault (incl. quiet, cascades, pulses, neglect) opens a job; a 5 s sweep catches the rest. Notice delay by pace (x0.5 when comms is
  nominal and the system offline, x2 when comms is offline).
- Lead = argmax of `3*skill + deck bonus - 0.1*decks away (+officer on urgent)`; skill from `duties.json` loop `sys` (1), department (0.7),
  engineering damage control / tricorder / hydrospanner (0.5), anyone (0.2, urgent only, never reactor/life). On watch only (`localHour < 8`)
  except the department head; one job per person. A helper joins for offline repair>=6 systems or a weak lead.
- `CrewSim.redirect(..., { prio, site })`: evac 3 > orders 2 > repair 1; lower levels are suspended, not cancelled (`overrideOf`, `overrideAt`,
  `release(p, prio)`). Cross-deck trips ride the abstract lift; on the player's deck the body walks (runs when urgent) to `repairStand`.
- States: notice -> travel -> setup (tool out, tricorder "Found it") -> working (progress in real s, `SYS.repair * workPer * (1.5 junction) /
  (0.4+0.6 skill) / tool repairMul`, helpers +0.6, player hold-E +1) -> verify. Fail: hp props up to 0.5, retry, or a part request
  (40-70 s, `deliverPart`), two fails / long waits escalate to the bridge (+helper, +0.03 severity).
- Done: `ShipState.repair(sys, { hp: pace.npcHp, by:'npc' })`, `Phases.onRepair(sys, { npc:true })` = 40% relief and the system is weak
  (next pulse x1.5) for `weakFor` s, ledger -0.3. Comm lines in character (`kind:'repair'`).
- Visible: floating hex marker over the repairer (amber en route, cyan + progress ring working, red ! part), fault HUD note, duty-board rows
  (`Duty.repairRows`), cyan blink on the beacon. `G.repair.order(person, sys)` assigns at prio 2.
- Balance (`tools/test-repair.mjs`, Standard, no player): mean faulted systems phase 1 ~0.7, phase 2 ~2.5, later 2.5-5; an EPS patch ~65 s.

## Speech etiquette (`js/etiquette.js`, `ambientBarks` in `js/main.js`)
`barkGate` -> `nod` (T0 gesture via `Fidgeter.force`, within 3 m, 45 s / 8 s cooldowns) | `speak` (stood still facing them for the dwell,
after a nod, not walking/busy, not in corridors, after the silent start, per-person + global cooldowns; T2 lines when they repair or your round
is due in the room) | `urgent` (bypass). Volume falls with distance; subtitle only within 2.5 m.

## Tests
`node tools/test-repair.mjs` (also in `tools/test.mjs`), `tools/test-duty.mjs` (no-expiry, shift end, gentle skip), browser block `pace/repair:`.
Open: talk-menu "take over / fix this" intents and a terminal Work orders page (conversation/menus agents), First-watch 0.5x clock during lift
rides, haul delivery for parts, crew walking pace multiplier per preset.
