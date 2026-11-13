# Systems Nominal: NPC etiquette, repair response, first-watch pacing, conversation close-up

Proposal only (no game code changed). Mockup of the conversation screen: `docs/mockups/conversation.html`
(open it in a browser: `E` toggles, `1`-`8` or click picks an intent, the three buttons switch NPC; `?npc=b&say=2` for screenshots).

Reads behind the numbers: `js/main.js` (`ambientBarks` L554, `talkMenu` L525, `nomTick` L472, `step()` L871/L925, `onShipEvent` L1150,
`spawnRepairer` L1422), `js/sim.js` (`redirect`, `block`, `site`), `js/phases.js`, `js/duty.js`, `js/clock.js`, `js/crew.js` (`SYSTEMS`,
`hardwareSites`, `homeDeck`), `js/handhelds.js`, `js/equipment.js` (`Operator`), `js/movement.js` (`GESTURES`, `Fidgeter`),
`js/humans.js` (`H.play/face/lookYaw`, `liveFace`), `js/speech.js` (`speak` returns `dur`, accepts `gain`/`silent`), `js/fx.js` (`Post`).

Facts that drive the design:
- `ShipState` already emits `fault`/`repair` events; `onShipEvent` only spawns the old madness `spawnRepairer` when `!NOM()`-style conditions hold (`G.director` is null in nominal, so in practice **nobody** reacts to faults in Systems Nominal today).
- `assets/data/duties.json` loops carry `sys` (not `system`) e.g. `ace: reactor/eps/life/coolant`, `env: life/coolant/lighting/hydro`, `eps: eps`, `dc: life/coolant/eps`, `reactor: reactor/coolant`, `ttech: transport/eps`, `comp: computer/comms`, `helm/nav: helm/dampers`. That is the "trained in" table; no new data needed.
- Task `at` values are 0-19 (minutes, `at_s = at*60`), mean 7.4, min 0: some tasks go **active at t=0**. Loop first-due is 30 + 20i + 0-30 s. That is the "too fast" feeling.
- `CrewSim.redirect()` has one override slot per person and no priority; evacuation and (future) repair would overwrite each other.

---

## 1. NPC speech etiquette

Problem: `ambientBarks` fires every 6-16 s, any NPC within 4.2 m with line of sight (not "facing"), 60 s per-person cooldown, 65% pass. In a tight corridor that is one bark every ~10 s.

### Rules (all must hold for an NPC-initiated *speech* bark)

| Gate | Standard | First watch |
|---|---|---|
| Attention: player within | 2.0 m | 1.8 m |
| ... and dwell: player speed < 0.6 m/s for, or camera within 35 deg of the NPC for >= 1.0 s | 1.5 s | 2.0 s |
| NPC state | standing/working at its spot, `!e.walk`, `!e.climbing`, not an Operator step that needs hands (`press_panel`, `tool_work`) | same |
| Place | player and NPC not in `corridor` or a tube; not in the lift car | same |
| Player busy | no `H.menu`, `G.phase === 'play'`, not carrying a cart (`G.haul`), not mid-`D.busy`, not sprinting | same |
| Per-person cooldown | 300 s | 420 s |
| Global speech cooldown | 75 s | 120 s |
| Run grace | none barks in first 60 s | 180 s |
| Cap | max 2 speech barks per ship hour | 1 |

### Tiers

- **T0 visual (preferred, no sound, no subtitle):** nod (`nod`), `small_smile`, `eyebrow_raise`, a brief look-up from `work` (`glance_back`). Allowed when the player is within 3.0 m, even moving, even in corridors; per-person cooldown 45 s, global 8 s, rank/trust picks which (junior to senior: nod; friend: `small_smile`; rival: `frown`/look away). Done through the existing `Fidgeter` by passing `ctx.playerNear` plus a forced `pick` override (`e.fid.force('nod')`). Cost: zero text, still reads as "alive".
- **T1 greeting (speech):** only after T0 was shown and the dwell gate holds. Tags: skipped for `habit:avoids-eye-contact`, `social:*` loners; `habit:stands-too-close` doubles the chance. Uses `greetHi/greetLo/greet` pools as now.
- **T2 notice (speech, relevant):** NPC has something *about the player's situation*: a duty due in their room ("Sir, the core round is due"), a task they own, the fault they are fixing ("Mind the panel, sir"), a witnessed shortcut (existing witness logic in `duty.js`). Cooldown 90 s per person, global 45 s, allowed while moving but not in corridors, unless T3.
- **T3 urgent:** alert level change, hazard on deck, someone injured. Bypasses cooldowns and the corridor rule; delivered by PA/comm bus, not by walking up to you.

### Volume and subtitles
- `speak(pr, text, { gain: clamp(1.2 - 0.35*d, 0.25, 1) })` for ambient barks (d in metres). T0 has no audio.
- Subtitle only if d <= 2.5 m *and* within 70 deg of view; otherwise it goes to the log only (G.say with kind `npc`, no centre subtitle). Subtitle length: `max(2.5, dur+1)` s, never covers the crosshair row.
- Never overlap: if `LAST` in `speech.js` is still speaking, drop the bark.

### Changes in `ambientBarks`
Replace the timer with a per-frame (every 0.2 s) attention tracker:
```js
// G.attn[person.id] = { near: seconds the player has been 'attending' within range }
function ambientBarks(dt) {
  if (G.phase !== 'play' || G.hud2?.menuOpen || G.haul?.pushing) return;
  G.attnT = (G.attnT||0) - dt; if (G.attnT > 0) return; G.attnT = 0.2;
  const speed = Math.hypot(P.vx||0, P.vz||0), inCorr = roomAt(P) === 'corridor';
  G.barkGlobal = Math.max(0, (G.barkGlobal||0) - 0.2); G.nodGlobal = Math.max(0, (G.nodGlobal||0) - 0.2);
  for (const e of ents) {
    if (!e.simmed || e.walk || e.climbing || e.op?.busyHands) continue;
    const d = Math.hypot(e.x-P.x, e.z-P.z), a = G.attn[e.person.id] ||= { near:0, nodAt:-1e9, spokeAt:-1e9 };
    const facing = angleTo(e) < 0.61 /*35 deg*/, attend = d < PACE.barkRange && (speed < 0.6 || facing) && world.los(P.x,P.z,e.x,e.z);
    a.near = attend ? a.near + 0.2 : 0;
    if (a.near >= PACE.dwell && !inCorr && canSpeak(e, a)) { speakBark(e, a, tierFor(e)); break; }          // T1/T2
    if (d < 3.0 && !a.nodedThisPass && G.nodGlobal <= 0 && G.time - a.nodAt > 45) { e.fid.force(gestureFor(e)); a.nodAt = G.time; G.nodGlobal = 8; }   // T0
    if (d > 4) a.nodedThisPass = false;
  }
}
```
`tierFor(e)`: T2 if `D.loops` has a due loop in `e`'s room, or `e.person` is repairing (see section 2), else T1.
Press-E conversation remains the main social channel, so silence is not a loss.

Tests: node-testable pure helper `barkGate(state)` in `js/speech.js` or a new `js/etiquette.js`; assert (1) walking past at 1.4 m/s never triggers T1, (2) standing 2.1 s at 1.5 m triggers T1 once, (3) second attempt within 300 s is blocked, (4) corridor blocks T1/T2 but allows T0 and T3.

---

## 2. NPC repair response (Systems Nominal)

### 2.1 Overview
New pure module `js/repair.js` (no three.js; node-testable like `sim.js`/`duty.js`), instantiated in `setupDuty()` beside `Phases`: `G.repair = new RepairCrew({ roster, sim, shipState, clock, comms, duty, plan, social, ship, seed, say })`; ticked from `nomTick` with world dt. `main.js` only supplies the body-level glue (walk, tool, animation, markers).

Responsibility chain: `ShipState` fault -> department owning `SYS[id].dept` -> its on-watch head/duty officer -> assignment -> repairer(s) -> comm bus -> bridge if it escalates.

### 2.2 Data
```js
// RepairCrew
jobs: Map<sysId, Job>
Job = { sys, dept, state, noticedAt, assignees: [Assign], hpAtStart, severity, urgent, need, progress, tries, needs: null|'part'|'hands', escalated, markerIdx }
Assign = { person, role: 'lead'|'helper', state, eta, tool, skill, path: {deckNo,tx,ty,room}, etaTotal, startedAt }
// skills (computed, not stored): skillOf(person, sysId)
```
`skillOf(p, sys)` (0..1):
- 1.0 if `duties.billets[p.billet].loops.some(l => l.sys === sys)` (specialist),
- 0.7 if `p.dept === SYS[sys].dept` (department),
- 0.5 if `p.billet in {dc, eps, ace, ce}` (engineering damage-control fallback) or has `tricorder_eng` / `hydrospanner` in `loadoutFor(p)` (js/handhelds.js carriers),
- 0.2 anyone else with rank >= 0 (only used if nothing better and urgency high, never for reactor/life offline),
- tags: `combat:takes-charge` +0.05, `stress:calm`/`habit:parade-rest` +0.05, `workstation:distracted`/`habit:fidgets` -0.05, social bond with a person already at the job +0.05 (js/social.js `affinity`).

### 2.3 Triggering
Subscribe to `ShipState.on(fn)` for `ev.type==='fault'` **including `quiet`, cascades and Phases pulses** (the only exclusion: start-of-run pre-faults, which are cleared in nominal anyway). Also subscribe to `Duty` `consequence` events (neglect). Faulted-but-never-reported systems are picked up by a 5 s sweep (`shipState.faulted()` minus `jobs`), so no event is missed after a load or `redirect` expiry.

Notice delay (head of department must see it): `noticeDelay = rand(6, 14) s` Standard, `rand(10, 22) s` First watch; x0.5 if `comms` is nominal and the system is `offline` (alarm), x2 if `comms` offline (nobody gets the page) and department is off-deck. Event line in the comm bus at notice: `"<Dept>, <Head>: <system> fault, deck <n>. Sending <name>."`

### 2.4 Who gets dispatched (the "best-qualified, nearest" rule)
Candidates: living (`!DEAD`), not the player, not `crazed`, on watch (`clock.localHour` inside an active block, not in `quarters/sleep`; the head of the owning department is *on call* regardless), not in a conversation, not holding a higher-priority override.
```
score = 3.0*skill
      + 1.0*urgentBonus(on same deck: +0.6, adjacent deck: +0.3)
      - 0.10*|deckNo(p) - jobDeck|      // abstract position from sim.where(p)
      - 0.6*(busy with a due duty loop 'doing')   // abstract: sim activity includes work
      - 0.8*(already has a repair assignment)
      + 0.1*(rank >= 2 and urgent)      // officers lead urgent jobs
```
Pick lead = argmax. Add one helper (`role:'helper'`) when `severity >= offline` and `SYS.repair >= 6` (reactor, life) or when lead skill < 0.5; helpers speed work: `rate = lead + 0.6*helper`. A second lead for a *different* fault is fine; two leads never share one job.

### 2.5 Priority and composition with `CrewSim.redirect`
Ladder (highest wins; lower ones are suspended, never cancelled):
`dead/crazed` > `evacuation/alert station` (prio 3) > `player order via Duty.order/delegate` (prio 2) > `repair dispatch` (prio 1) > `schedule block` > `free time`.
Add priority to the sim:
```js
// js/sim.js
redirect(p, room, spot='door', seconds, activity='evacuating', { prio = 1, site = null } = {}) {
  const old = this.over.get(p.id); if (old && old.prio > prio && (old.until === undefined || old.until > this.t)) return false;
  this.over.set(p.id, { room, spot, activity, prio, site, until: seconds === undefined ? undefined : this.t + seconds }); return true;
}
// in block(): return { room: ov.room, spot: ov.spot, activity: ov.activity, site: ov.site }   // site() already honours b.site when b.room === room
```
Callers: `evacuationStep` passes prio 3; `Duty.order` prio 2; `RepairCrew` prio 1 with `activity: 'repairing'` and `site: {deckNo, tx, ty}` of the hardware.

Where the hardware is: compute once per run in `RepairCrew` constructor from `G.shipDecks[i].data` (decks are all generated in `newRun`):
- main hardware system: `hardwareSites(deck.data)` -> `{deckNo: i+1, tx, ty, kind}` (lift -> exit tile),
- junction system (or main hardware absent): deck = `homeDeck(ship, SYS.home)+1`; tile = a floor tile near the first free wall face (the physical `repairPts` entry exists only after that deck loads, so the abstract site is a deterministic tile `junctionTile(data, sys, seed)`; when the deck loads, `placeRepairPoints` should *use that same tile's wall face* so the NPC walks to the actual junction. One-line change: pass the site into `takeFace`).
- Repair time: junction x1.5 (as `repairTime` does: `r.main ? 1 : 1.5`).

Travel:
1. **Abstract leg** (person not on the player's deck): the sim already produces transit ETAs (`LIFT_BASE + LIFT_PER_DECK*decks`, `WALK_TIME`). `redirect` makes the sim move them; job state `TRAVEL_ABSTRACT`.
2. **Body leg** (target deck == `G.shipDeck + 1`): `simBodies` already spawns bodies for `sim.onDeck()`; when the person's room/site is the repair site, `simBodies` places them at the lift (if seen) and `startWalk(e, site.tx, site.ty, false, { run: urgent && First-watch off })`. Need small additions: `simTileFor` returns a tile *adjacent to the hardware*, facing it (`t.face = world.center(site.tx, site.ty)`; for junctions face the wall at `repairPts[sys].px/pz`).
3. Run only when `job.urgent` (offline reactor/life/eps, active hazard) and pace allows. Otherwise `walk` at `PACES.brisk`.

### 2.6 State machine (per assignee)
```
IDLE -> NOTICED(delay) -> ASSIGNED -> TRAVEL_ABSTRACT -> TRAVEL_BODY -> SETUP -> WORKING -> {VERIFY}
VERIFY -> DONE -> REPORT -> RETURN -> IDLE
VERIFY(fail) -> NEEDS_PART | RETRY(<=1) | ESCALATE
any -> SUSPENDED(order/evac/conversation/hazard) -> back to prior state
any -> ABORT(fault already nominal | assignee dead | player took over)
```
- **ASSIGNED:** `say` on comm bus: `"<Name>, <Dept>: heading to <where>, deck N."` (`where` = `HOST_LABEL` or `junction JCT 03-02`). Sets `e.person.activity='repairing'`.
- **SETUP (2-4 s):** pull the handheld: `loadoutFor(p)` -> prefer `tricorder_eng` (scan first: `scan_sweep` 2.4-3.4 s, reveals "fault part" line: `"Found it: <part>"` from `ShipState.sys[id].faults.at(-1).part`), then `spanner/hydrospanner/torch`. Uses the existing `Operator` machinery: a new `EQUIPMENT.repair_site` entry (`steps`: `press_panel` or `reach_low`, `scan_sweep`, `tool_work` loop, `turn_valve` for coolant, `type_keys` for computer/comms/sensors consoles) with `toolSteps` from `handhelds.toolScript`. Hold item visible in hand (existing `hold:` mechanism).
- **WORKING:** `progress += rate*dt` real seconds (see 2.8). Visuals: sparks at the hardware every 0.35-1 s (copy `repairerStep`), `cue('clank')`, kneeling pose on junctions (`fixing_kneeling` clip exists, used by `spawnRepairer`) or `interact` clip on main hardware; faults' lamp (`setLamp`) turns from amber/red to *cyan blink* ("being worked"); `repairPts[].obj` beacon cyan.
- **Mid-job chatter** (T2, line to comm bus, not spoken unless within 6 m): at 35%: `"Bridge, <name>: <part> is cooked, replacing."`; at 70%: `"Almost there."`; failures below.
- **VERIFY:** roll `p_success = clamp(0.55 + 0.45*skill - 0.12*phaseIndex - 0.10*job.severity - (tools? 0:0.1), 0.2, 0.97)`. Success -> `shipState.repair(sys)` with `NPC_HP = 0.85` (see balance: not 1.0), `DONE`. Fail -> hp raised to the nominal threshold-minus (0.5, degraded), `tries++`.
- **NEEDS_PART:** 40% of failures, or any `offline` reactor/eps fault by a non-specialist: asks `"Need a <part> from Stores. Can someone fetch it?"` and posts a *delivery job* to the nearest `cargo/qm/rep` person (`Haul`: `CART_BILLET` data in js/equipment.js already knows who hauls what). If the **player** is carrying a `tool`/`toolbox`/`chip` item, handing it over (see 2.9) resolves it immediately (+trust). Otherwise resolved after `rand(40,70)` s delivery.
- **ESCALATE:** `tries >= 2`, or `needs` unresolved 90 s, or `offline > 150 s` unassigned: department head reports to the bridge (`kind:'report'`, priority `urgent`) and the bridge (comms sim) orders another department (`cascade of help`: engineering gets security/flight crew as `role:'helper'`); also bumps `Phases` pressure (`+1 debt`): the ship noticing it cannot cope.
- **REPORT:** on DONE: `"Bridge, <name>: <system> restored."`; the bus line is also what the existing HUD comm stack shows. `D._bump(p, 0)`/ledger: repairs by NPCs reduce the *ledger neglect of that system* by 0.3 (the player's own proper duty reduces it by 1.0).
- **RETURN:** `sim.release(p)`; the schedule block takes over; the body walks to its spot via `simBodies` as it does today.
- **SUSPENDED:** conversation (hold job, stop at current tile, resume 1 s after), `Duty.order` from the player (prio 2: job paused, resumes after), evacuation/alert station (prio 3), hazard on deck (the hazard shelter logic `e.cower`).
- **ABORT/takeover:** if `shipState.status(sys)==='nominal'` during TRAVEL or WORKING (the player fixed it first): say `"Looks like someone beat me to it."` (trust +0.02 toward the player if the player did it), walk back.

### 2.7 Visible to the player ("they are on it")
- `faults` HUD (`updateFaultHud`): row becomes `⚠ EPS GRID DEGRADED · 42 m · Lt. Okafor en route (35 s)` / `... working 63%` / `... needs a part` / `... nobody assigned`; colour: red -> amber -> cyan when someone is working.
- World: a small hex marker with the assignee's initial above `repairPts[].obj` and a progress ring (sprite, 40 px) once WORKING; minimap: cyan wrench glyph at the site (existing `mctx` triangle loop L843 only draws unrepaired points: add a 2nd style).
- Ship status overlay (`renderStatus`): "Assigned: Okafor, Chen (helper)" per system; terminal: new **Work orders** page listing each job with state, ETA and *Assign / Reassign*.
- Comm bus lines as above; PA subtitle for T3.

### 2.8 Numbers (repair duration vs fault rate)
Existing: player hold-E repair `SYS.repair` (4-8 s) x1.5 on junctions, tools x1.1-1.3. NPCs should be **slower than the player but not negligible**, and the *scene* (walking, scanning, working) takes visible time.

| item | Standard | First watch | Crunch |
|---|---|---|---|
| notice delay | 6-14 s | 10-22 s | 4-10 s |
| walk speed | `PACES.brisk` 1.5 m/s (jog 3.4+ if urgent) | 1.25 m/s, jog only if urgent | brisk, jog if urgent |
| setup (scan + tool out) | 3-5 s | 4-6 s | 3-4 s |
| work time, specialist | `SYS.repair x 6 s` x (junction 1.5) (e.g. EPS 30 s -> 45 s) | `x 8 s` (EPS 40 s -> 60 s) | `x 5 s` |
| skill multiplier on time | 1/(0.4+0.6*skill) (specialist 1.0, dept 1.18, generalist 1.43, rest 2.4 *) | same | same |
| tool multiplier | / `repairMul` of the held handheld (tricorder_eng 1.3, spanner 1.15 ...) | same | same |
| helper | +0.6 rate | +0.6 | +0.6 |
| success p (specialist, nominal phase) | 0.95 | 0.95 (x1.0) | 0.90 |
| hp after NPC repair | 0.85 | 0.9 | 0.8 |
| patched flag | 'weak' for 120 s: next pulse on that system x1.5 damage | 90 s | 150 s |

(*) rest/non-engineering only at urgency, so effectively never for reactor/life offline.

Ship must not auto-heal trivially. Mechanisms: (1) NPC repair restores to 0.85-0.9, never 1.0, so a fault is *recovered*, not erased; (2) it reduces `Phases.severity` by only 40% of what a player repair does (`onRepair(sysId, { npc: true })`), so the hidden failure mode keeps growing; (3) duty debt/ledger neglect still decides the failure mode, because NPC repairs only treat symptoms; (4) one active job per person, only on-watch crew respond: at night a ship has 1-2 engineers up; (5) cascade timers (`CASCADES.after` 30-70 s) keep running while crews travel, so *slow response* causes cascades; (6) `hp < 0.2` or reactor/life `offline` needs a part (see NEEDS_PART) -> the player becomes useful.

Balance targets (Standard, no player intervention, measured by `tools/test-repair.mjs`): phase 1 (pulse every ~27 s damaging 3 candidate systems): mean concurrently-faulted systems 0.5-1.5 (NPCs keep up); phase 2 (pulse ~20 s): 1.5-3; phase 3+: climbs to >= 3 and `Phases.pressure()` (faults/3) reaches 3-4 by t=600 s. With a competent player (repairs 1 in 3 faults, does duties proper): stay at phase <= 2 until ~t=900 s. Pulse interval `max(9, 34 - 7*idx - 8*sev)` s; at idx 1 an average fault costs ~(notice 10 + walk 25 + setup 4 + work 40 + verify 3) ~ 80 s of one person, i.e. 2-3 engineers on watch cover ~one fault per 30-40 s. That is exactly the knife-edge we want at phase 2.

### 2.9 Player agency
- **Watch/assist:** if the player holds E at the same repair point while an NPC is `WORKING`, rates add (player 1.0 + NPC rate); NPC says `"Hold that for me, sir."`; both credited; trust +0.04.
- **Take over:** talk to the repairer -> intent *Take over* (wheel slot 3 'help' sub-choice): they stop, put the tool in the player's hand (`G.carry`/`kit` gets the tool: `toolBonus`), `"All yours."`; job goes `SUSPENDED` and the NPC becomes a helper.
- **Assign/Reassign:** terminal -> Work orders -> pick fault -> pick person (sorted by skill and distance, shows ETA). Uses `Duty.order` plumbing: `RepairCrew.assign(person, sys, { byPlayer: true })`, prio 2, refusal rule = existing trust/rank rules (subs always, peers per trust). Radio menu (H) gets "Request engineers to <system>" which just boosts urgency and shortens `noticeDelay` to 0.
- **Bring parts:** carry a part/toolbox -> hand to the repairer via the conversation (`give` intent); resolves NEEDS_PART.
- **Interference costs:** if the player orders a repairer away mid-job, progress is kept for 60 s (state `SUSPENDED`), else lost.

### 2.10 Implementation outline
1. `js/repair.js`: `RepairCrew` (+ `skillOf`, `pickAssignees`, `scoreCandidate`, `Job` state machine, `siteFor(sys, decks)`); events emitted: `assign`, `arrive`, `progress`, `done`, `fail`, `escalate`.
2. `js/sim.js`: `redirect(..., {prio, site})`; `block()` returns `site`; keep tests passing (`tools/test-sim.mjs`).
3. `js/main.js`:
   - `setupDuty`: create `G.repair`; wire `say` to `G.comms.sim.say`.
   - `onShipEvent`: remove the `spawnRepairer` branch for NOM (keep for madness mode); call nothing else (RepairCrew listens itself).
   - `simBodies`: when `sim.over` has `activity==='repairing'`, `simTileFor` uses the site; add `e.repair = job` when body spawns; new `repairBodyStep(e, dt, d)` replaces `repairerStep` for crew with `e.repair` (play Operator script, sparks, progress sync from RepairCrew). Reuse `spawnRepairer` body-pose bits (`fixing_kneeling`, `interact`).
   - `placeRepairPoints`: accept junction wall-face by site; `updateShipSystems` lamp colour cyan when `G.repair.workingOn(sys)`.
   - `updateFaultHud`, `renderStatus`, minimap glyph, terminal Work orders page, `talkMenu`/conversation intent 'help' sub-menu.
4. `js/equipment.js`: `EQUIPMENT.repair_site` (+ `junction`/`console` variants), `js/handhelds.js` already has `job.repairMul`/`script`.
5. `js/phases.js`: `onRepair(sysId, { npc })` (40% effect); `tools/test-phases.mjs` update.
6. Tests `tools/test-repair.mjs` (pure): (a) fault in `eps` dispatches an `eps`/`dc` specialist before a `cook`; (b) nearest of equal skill wins; (c) off-watch not dispatched except the head; (d) `redirect` prio: evac overrides repair, repair does not override order; (e) job completes within `[need*0.8, need*1.6 + travel]`; (f) fail path -> part request -> delivered -> done; (g) player repairs first -> abort and release; (h) 600 s headless sim reproduces the balance targets above; (i) no two leads on one job; (j) `quiet` and cascade faults handled; (k) dead assignee reassigns within 10 s.

---

## 3. Pacing for a first playthrough

### 3.1 Presets and the single time-scale T
Introduce `js/pace.js` (pure): `PRESETS = { first: {...}, standard: {...}, crunch: {...} }`, `G.pace`. One scalar **T** (= watch length in minutes / 20) divides the *world delta* fed to everything that models "ship time":
`wdt = dt / T` -> `Duty.tick`, `Phases.tick`, `ShipState.tick/cascade`, `ShipClock.advance` (via `comms.tick`), `CrewSim.tick` schedule logic, `RepairCrew.tick` timers that are "ship" processes (notice delay, cascade). Things that are **action time** stay real seconds: walking/anim speeds, perform durations (`dur*SHIP_SEC_PER_MIN*1.2`, the player's busy bar), repair work progress, lift rides, hold-E repair, hazard damage per second, conversation speed. `Duty.busy.left` and sim transits use real `dt` (give `tick(dt, wdt)` two args). That keeps the game feeling responsive while the ship "life" is slow.

| Preset | T | Run (real) | Idea |
|---|---|---|---|
| **First watch** | 2.5 | 50 min | Tutorial pace: calm, guided first task, long windows, forgiving collapse. |
| **Standard** | 1.0 | 20 min | Today's numbers. |
| **Crunch** | 0.7 | 14 min | Pressure; short windows; faster pulses; still fair. |

### 3.2 Every timing constant
Values are **real seconds in a run** (what the player experiences). Implementation = (real value)/T in world units, listed as the formula.

| Constant (file) | Today | First watch (T 2.5) | Crunch (T 0.7) | How |
|---|---|---|---|---|
| `HOURS_PER_SECOND` (`clock.js`) | 0.005 h/s | 0.002 h/s (6 ship h in 50 min) | 0.00714 | `rate = 0.005 / T` (or advance with wdt) |
| `RUN_LENGTH` (`phases.js`) | 1200 | 3000 | 840 | `1200*T` real, `1200` world |
| `PHASE_AT` | [0,150,330,540,780] | [0,540,1140,1800,2400] | [0,100,220,360,520] | explicit per-preset arrays (First watch ratios 3.6/3.5/3.3/3.1; collapse is last 20%) |
| Pulse interval (`phases.js`) `max(9, 34-7i-8s)` | 27 s at i1 | 68 s at i1 (min 22) | 19 s (min 6) | world dt does it |
| Hazard rate (collapse only) | 2.2-9 hp/s x(0.6-1.2) | x0.6; **20 s warning before damage** | x1.0 | `hazardMul` real-time; add `graceT` |
| Lethal-zone onset | immediate in collapse | 60 s after collapse start | immediate | `G.phases.collapseAt + grace` |
| Pressure from debt `floor(debt/5)` | 5 | 7 | 4 | `debtPerPhase` |
| Fault pre-damage at start | none (repaired in nominal) | none | none | unchanged |
| Duty loop first due (`duty.js` 30+20i+0-30) | ~30-80 s | **180 + 75i + 0-45 s** (first at 3:00) | 20+15i+0-20 | `firstDue`, `gap`, `jitter` per preset |
| Loop period `clamp(every*8,90,400)` | 90-400 | 225-1000 (x2.5) | 63-280 | `x T` via wdt; due-window = 0.9*period (>=200 s) |
| Task `at_s = at*60` | 0-1140 | `max(at*60*T, 240)` (never before 4:00) | `at*60*T` | clamp the first task to >= 240 s |
| Task window (`window: 240`) | 240 | **600** | 200 | per preset |
| Perform duration `dur*3.33*q*1.2` | e.g. 40 s | same (action time) | x0.9 | not scaled by T |
| Duty `audit` interval 70-130 s | 70-130 | 200-330 | 55-100 | wdt |
| Witness / belief decay (`duty.js`) | s | wdt | wdt | wdt |
| `CASCADES[].after` 30-70 s | 30-70 | 75-175 (wdt) | 21-49 | wdt |
| Sim schedule blocks (ship hours) | via clock | via clock (slower) | faster | automatic |
| `LIFT_BASE/LIFT_PER_DECK/WALK_TIME` NPC transit | 3.5/1.4/5 s | same (real) | same | real dt, not wdt |
| Player lift ride (`dur 3+5*(dist-1)/(D-2)`) | 3-8 s | 3-8 s, clock runs at 0.5x | same | see 3.3 |
| NPC walking pace (`PACES.normal`) | 1.25 m/s | 1.1 m/s, no jogging except urgent repair | 1.4 | `gt.pace` multiplier |
| NPC fidget gaps (`Fidgeter` 3.5-10.5 s) | | x1.0 | | unchanged |
| Bark cooldown (section 1) | 300/75 | 420/120 | 240/60 | preset |
| Repair numbers (section 2.8) | | | | preset |
| Escalation timers | 90/150 s | 130/220 s | 70/110 s | preset |
| Mission progress thresholds | | | | unchanged |

### 3.3 What pauses the clock (wdt = 0)
- Briefing, pause screen, end screens: already (phase != 'play'); **but `phase==='select'` (lift panel) and `'ride'` call `nomTick`**: First watch uses `wdt*0.5`, Standard 1.0 (current), Crunch 1.0.
- **Conversation (phase `talk`): wdt = 0 for everyone but the speaker (section 4).**
- Terminal and Duty menu: First watch full pause; Standard 0.25x; Crunch live (menus cost time).
- Tutorial hint panels: full pause.
- Never pause for the inventory/radio quick menus (instant).

### 3.4 First watch details
- Target: 40-60 min; default 50. Nominal (phase 0) lasts 9 min; first fault possible at 9:00; 'degraded' at 19:00; collapse at 40:00.
- First duty due after **3 minutes** (`firstDue`), not at 30 s. The first *loop* is always one that is in a room within 2 decks of the player's start and not `any`. The first mission **task** is guided (below).
- Long windows: loop due-window >= 200 s, task window 600 s, missed tasks shown *yellow first* (grace 60 s) before counting as missed.
- Guided first task (only First watch, first run per profile): on spawn after the briefing, a compass hint `[J] Do duty` points to the room (`HUD.setHint`, a dotted line on the minimap, door highlight via `world.setAlert`-like tint); text steps: 1) "Walk to <room>" 2) "Press J" 3) "Choose how to do it (Do it properly takes ~Ns)" 4) "Report in the radio menu [H]". Each step dismisses itself; hints stop after the first completed loop. Setting `hints: on/off` stored in preset.
- Ship terminal and conversation get a one-time tooltip strip.

### 3.5 Control and persistence
- Pause screen and title screen: segmented control `First watch | Standard | Crunch` + a "Watch length" slider 14-60 min (T = len/20), snapping to presets. Changing mid-run only changes the multiplier for the remaining time (no retroactive timer rewrite) and is flagged in the end summary ("Watch length 50 min, hints on").
- Persist: `localStorage['fb_pace'] = JSON.stringify({ preset, minutes, hints, menuPause })` wrapped in try/catch like `fb_voicemode` in `speech.js`. Default for a profile with no `fb_runs` counter: `first`; after the first completed or ended run, the title screen shows "Try Standard?" once.
- Title screen line under the begin button: `First watch · about 50 min · first duty at 3:00 · hints on  [change]`.
- Tests: `tools/test-phases.mjs` runs with each preset: collapse index reached at `phaseAt[4]` real seconds (+/- 5%); `tools/test-duty.mjs`: first loop due at >= 180 s for `first`, tasks never active before 240 s, windows as configured.

---

## 4. Conversation close-up (E on a crew member)

Mockup: `docs/mockups/conversation.html`.

### 4.1 State and flow
New phase `'talk'` in `G.phase`. `interact()` -> `startTalk(e)` instead of `talkMenu(e)` directly (`talkMenu` content moves to `talkIntents(e)`). Frame loop: `else if (G.phase === 'talk' && world) talkStep(dt, t)` (new branch in `frame()` beside `liftStep`/`dyingStep`).

`startTalk(e)`:
1. Guards: not `e.fake`, not dying/turning, not hostile; if the NPC `e.walk` set `e.hold = true` (stop where they are; `e.walk.paused`), cancel `e.op` Operator gently (`opEnd`), remember `e.talk = { prevWalk }`.
2. `G.talk = { e, t:0, state:'in', camFrom: {pos,quat,fov}, yaw0: P.yaw, pitch0: P.pitch, rel0: D.trust(pr) }`.
3. Pointer lock: `document.exitPointerLock()` **after** setting `G.phase='talk'` and `G.talkReleasing = true`; the `pointerlockchange` handler (L594) must check: `if (!locked && G.phase==='play') -> pause` already only fires in 'play', so changing phase first is enough. On exit: `requestLock()` (user gesture is the Esc/E key press; if the browser blocks it, show the existing "click to resume" pause screen only in that case).
4. HUD: add `body.talking` class: hide `#minimap`, `#faults`, comm stack (`#ac-banner`/hud-comms), duty board (`hud2`), crosshair, `repbar`; show letterbox bars, name plate, subtitle, wheel, relationship meter (mockup). CSS only except the wheel DOM.
5. NPC turns to face the player (existing `turnStep`/`faceAt`, 0.4 s) and sets `H.lookYaw` toward the camera; eye contact via `lookYaw`/`lookPitch` clamps (+/-0.9 rad) computed from camera.

### 4.2 Camera design
Target framing: head-and-shoulders, face on the left third (the UI lives on the right).
```js
const head = e.mesh.userData.human.bones.Head.getWorldPosition(v1);   // + (0, 0.07, 0) = face centre
const toP = new THREE.Vector3(P.x - e.x, 0, P.z - e.z).normalize();    // from the NPC towards the player (they face us)
const right = new THREE.Vector3(toP.z, 0, -toP.x);
const dist = 0.9 /*m*/, camPos = head.clone().addScaledVector(toP, dist).addScaledVector(right, -0.22).add(new THREE.Vector3(0, 0.03, 0));
// subject to the left of centre: look at head shifted RIGHT of the NPC (their left), 0.28 m
const look = head.clone().addScaledVector(right, -0.16).add(new THREE.Vector3(0, -0.02, 0));
// clearance: world.raycast(head -> camPos); on a hit shrink dist to hit-0.1, min 0.55, and if still blocked rotate the camera around the NPC by +-35 deg (try 5 candidates)
```
- Transition in: 0.7 s, smoothstep; position and quaternion slerp from the player camera; `fov` 70 -> 38 (long-lens look), `P.eye` ignored. Out: 0.5 s back to the saved pose; during out-transition input is locked; then `G.phase='play'`, `requestLock()`.
- Kept running during talk: camera follow of the head bone each frame (NPC idles/gestures move the head ~3 cm), critically damped (k = 12/s) so micro motion does not jitter; **+0.4% breathing zoom** (1.5 s sine) for life.
- Depth of field / vignette: add to `js/fx.js` `Post` a `BokehPass` (three/examples) with `focus = dist`, `aperture = 0.0002` blended by `talkT` (0..1); in low quality (`CFG.quality==='low'`, no composer) fall back to CSS: letterbox bars + radial vignette div + `filter: blur()` is *not* possible on the canvas, so rely on the narrow FOV (background already small) and a darkening vignette. Add `final.uniforms.vignette` (0..1) for the high-quality path.
- Hide the player's own viewmodel (`vmScene`), tool glow, flashlight beam (`beamCone`), and hand items: `vmScene.visible = false` during talk.
- Lighting: add a soft key `PointLight` (cool 0x58c9b9 rim, warm 0xffd9a0 fill) at 1.3 m from the face for the talk duration (intensity ramps with `talkT`) so faces read well in dark corridors; removed on exit.
- Test: render check from `tools/test.mjs` (screenshot with a puppeteer-driven `__game.talkTo(person)` after stubbing).

### 4.3 What is frozen, what runs
`talkStep(dt, t)` calls only:
- `world.update(dt, t)` (lights/anim of the *static* environment, cheap and avoids a dead scene; set `world.freeze = true` if it has timers that drive game logic: it should not; it drives lamps/doors visuals)
- the speaker: `H.play(idleClip)`, fidget layer `fidgetStep(e, dt, 0)` with `ctx.state='talking'` (the `talk_emphasis`, `nod`, `head_tilt`, `eyebrow_raise`, `small_smile`, `shrug` set from `GESTURES` is already tagged `talking`), `liveFace(H, e.t, ...)` blink, `H.lookYaw`, `H.update(dt)`.
- the camera and the talk UI.
Not run: `G.sim.tick`, `G.comms.tick` (clock, alerts, bridge sim), `Phases.tick`, `Duty.tick`, `ShipState.tick/cascade`, `RepairCrew.tick`, `haul.tick`, `simBodies`, other `ents`, `gorns`/enemies, `sparks/steam/blood/decals` updates, `updateMadness/Director`, torch flicker, `G.time/G.deckTime`, HP regen, hazard damage, stamina, P physics. Other bodies keep their last pose (they are frozen mid-stride: acceptable for a close-up with narrow FOV; if one is in frame, set `mesh.visible=false` for any NPC within the camera frustum behind the speaker, except the speaker).
Audio: pause ambient loops except hum (`sound.duck(0.35)` if exists, else the voice just plays over); the speaker's `speak()` uses `dur` to drive the jaw.
Safety: if `G.hp` hazard was active at start, refuse to talk (`G.say('Not now!', 'warn')`).

### 4.4 Gestures, lips, eyes
- Jaw/lips: `H.face({ JawDrop: j })` where `j = max(0, A(t)) * 0.55` and `A` = syllable envelope from `babblePlan(text, voice).syl` (already computed in `speech.js`; export `speechEnvelope(text, voice)` returning `[{at,dur,peak}]`). Fallback without audio: noisy sine 6-9 Hz while `now < speakEnd`. Optional morphs `Smile`/`Frown` from mood.
- Gestures: when speaking schedule `talk_emphasis` every 1.4-2.6 s, with `nod` on agreement, `head_tilt` on questions, `eyebrow_raise` for gossip, `small_smile` for friendly answers, `shrug` for "don't know", `frown`/`sigh` for low trust and stress (mood tag). While listening: `Fidgeter` as normal with `ctx.state='talking'`. Force-trigger by `e.fid.force(id)` (added with etiquette T0).
- Eyes: no eye bones used; `H.lookYaw` / `lookPitch` follow the camera, with a thinking glance away every 5-9 s (`lookYaw += 0.4` for 0.8 s) for `habit:avoids-eye-contact` more often.
- Idle clip: `idle` (or `idle_talk` if the GLB has one); the sit/stand posture stays as is. Sitting NPCs: camera lowers (`head` bone world pos already accounts for it).

### 4.5 Input
- E / Esc / centre click / Backspace-at-top-level: end. Digits 1-8: choose. Mouse: click wheel; hover shows label/lock reason in the hub (mockup). Gamepad later.
- Key handler gate at L677: when `G.phase==='talk'` route to `talkKey(e)`; do not forward `Escape` to the pause logic; the pointer lock is already released deliberately, so no `pointerlockchange` pause.
- Hover tooltip with lock reason ("Not carrying anything", "They do not report to you", "They do not trust you enough yet").
- Subtitles: line typed at 36 cps, stays until the next choice; the voice plays via `speak()` (existing mode setting).

### 4.6 Failure and edge cases
- NPC gets an override (evac/alert/repair order) while talking: they *stay* (`SUSPENDED`), priorities only apply on exit; **red alert / hazard on the player's deck / being hit ends the conversation** with a hurried line ("I have to go!") and `G.phase='play'`; 0.3 s out transition.
- NPC dies/vanishes (`simBodies` leave): `simBodies` skipped in talk; if `e` removed, end gracefully.
- Player death/HP loss (hazard): conversation cannot start; talk ends if `G.hp` drops (should not, world frozen).
- Lift/arrival: no talk with riders (`G.phase==='ride'`).
- Another NPC walks into the line: frozen, so no problem; on exit they resume.
- Time cost: talking is free (clock paused). To keep it from being abused as a pause button: each `small talk` or `gossip` costs *one beat* of ship time after you leave: `G.sim` fast-forward 20-40 world s (so they were "talking for a bit") in First watch 0, in Standard 25 s, in Crunch 40 s applied once on exit by `clock.skip(...)`? (Open question 3).
- Pointer lock refusal after exit (browsers need a gesture): handle with the existing click-to-resume screen.

### 4.7 Dialogue content model
Intents (icon wheel: 8 slots + Leave in the hub), each a data record in `assets/data/dialogue.json` (or inline in `js/talk.js`):
```js
{ id, icon, label, note, unlock: (ctx)=>null|'reason', effect: { trust, mood }, say: (ctx)=>line, followUps?: [...], gesture }
ctx = { me, npc, D (Duty), social, clock, shipState, repair, carry, rank: me.rank-npc.rank, trust, mood, tags, w: sim.where(npc) }
```
| id | icon | Unlock | Content source | Effect |
|---|---|---|---|---|
| greet | wave | always | `bark.greet/greetHi/greetLo` by rank; tone from trust | +0.01 (once per conversation) |
| duty | clipboard | always | `DUTIES.billets[billet].loops[0].label` + current activity; if they are repairing: status of the job | +0.01 |
| help | wrench | trust >= 0.25 | `D.askHelp(npc)`; sub-menu: *with my duty / take over repair / fix <fault>*; NPC reasons from schedule | -0.01 if refused |
| order | rank chevrons | `D.subs().includes(npc)` | `D.order(npc, null)` or choose a duty/repair; "refuse" uses trust | trust change per `Duty` |
| give | box | `G.carry` | `G.haul.talkOpts` (food, medkit) / part for NEEDS_PART / item gift | +0.06 (item-specific) |
| gossip | speech bubbles | trust >= 0.4 (cold: shrug "I don't know anything") | `social.talkLine(npc, me)` extension: picks a **third party** X from `social.relation(npc, X)` ties / rivalries; line uses `tags` (`habit:mutters`, `social:confidant`) | +0.01; may reveal trust shifts |
| hangs | people | always | `social.friendsOf(npc)` -> row of 1-3 small face chips (mockup note) "Chen, Kaur" with where they are now (`sim.where`) | +0.02 |
| small | cup | always | tag-driven (`lift:small-talk`, `habit:*`, mood, time of watch, current mission) | +0.03 diminishing (x0.5 each repeat), cap per conversation |
| leave | exit | hub | | |
Rules: relationship meter shows `D.trust(npc)`; mood = f(trust, stress tag, phase index, current job) with 3 states (warm/neutral/on edge) and an expression layer. First conversation with each person adds a `meet` flag (rank/dept/pips highlight, plus a one-time name reveal: unknown names show only rank and dept until met: cheap "who is this" feature; open question). Responses at most 2 sentences; follow-up icons appear as a second ring only when the answer implies one (e.g. gossip about X -> 'ask about X' chips).

### 4.8 Implementation outline
- `js/talk.js` (DOM, logic): `Talk` class: `begin(e)`, `choose(i)`, `end()`, intents (`talkIntents` migrated from `talkMenu`), wheel DOM (port the SVG/CSS from the mockup, keep CSS vars), subtitle/rel meter, and the `speechEnvelope` hook; no three.js.
- `js/main.js`: `startTalk/endTalk/talkStep`, `frame()` branch, key routing, `body.talking` class, `vmScene.visible`, camera save/restore, `G.phase='talk'` handling in `pointerlockchange`, `interact()` calls `startTalk`.
- `js/speech.js`: `speechEnvelope`, `speak` returns `{dur, env}`.
- `js/movement.js`: `Fidgeter.force(id)`.
- `js/fx.js`: DOF + vignette uniforms (`Post.setFocus`).
- `index.html`: `#talk` container + `body.talking` rules (CSS from the mockup).
- Tests: `tools/test.mjs` page test: `__game.startTalk(ents.find(simmed))`, assert `G.phase==='talk'`, `G.sim.t` unchanged after 2 s of frames, `Phases.t` unchanged, speaker `H.mixer` time advanced, camera within 1.2 m of the head, `endTalk` returns phase `play` and camera to pose; plus a unit test that `sim.t`/`clock.real` are bit-identical across a talk.

---

## 5. Recommended defaults (summary)
- Bark: dwell 1.5 s within 2.0 m, per-person 300 s, global 75 s, 60 s silent start; T0 gestures instead of speech. (First watch: 1.8 m, 2.0 s, 420 s, 120 s, 180 s.)
- Repair: notice 6-14 s, work `SYS.repair x 6 s` x junction 1.5 / skill factor, NPC hp restore 0.85, severity relief 40%, escalate after 2 failures or 150 s.
- First watch: T 2.5, 50 min, `PHASE_AT = [0,540,1140,1800,2400]`, first duty at 3:00, task window 600 s, first task not before 4:00, hazard x0.6 with 20 s warning.
- Conversation: camera 0.9 m, FOV 70->38, in 0.7 s / out 0.5 s, world frozen except speaker, pointer lock released by design.

## 6. Open questions for the owner
1. Should the pace scaling slow the *ship clock* (hours pass slower) or only the events (keep 6 ship hours but spread over 50 min)? The draft keeps 6 ship hours in 50 min.
2. Should NPC repairs ever restore a system fully, or always leave residual neglect (draft: 0.85-0.9)?
3. Does talking cost any ship time (draft: First watch 0, Standard 25 s per small-talk/gossip)?
4. Name reveal: show names only after the first conversation, or always (draft: always, with a 'met' flag for later)?
5. Is a post-processing bokeh pass acceptable on the high setting (extra pass cost), or CSS vignette only everywhere?
6. Lock the guided first task to the first loop, or pick the task (`tasks`) that is due first?
