# Systems Nominal — "Be Somebody Aboard" design (v2)

Iteration of the first brainstorm. Goal: you are dealt a random billet (Captain down to Cargo Handler) on a fully
working ship, and you can do that person's job, cut corners, or ignore it, and the ship answers back.
Working mode name stays **Full Complement**; madness becomes one failure mode among several.

Grounded in the code as it is: `js/crew.js` already has 8 departments, 36 billets (rank 0–6, reporting lines),
21 systems with parts/effects, cascades, `ShipState.effects()` as the one consequence hub, a roster of 60–90 named
people and a pacing director. This design adds a *player-as-roster-member*, a *duty/orders/consequence layer* and a
*living NPC schedule*, on top of those.

---

## 1. The premise in one paragraph

At run start the game picks a ship, a mission, a hidden failure seed, and **one roster member to be you**. You wake
up as that person at the start of your watch with their uniform, access, quarters, superior, subordinates, friends,
grudges and a duty card. The ship is running normally. Every duty you do (or skip, or fake) feeds a ledger that
changes system health, crew morale, what your superior thinks of you, and how fast the ship slides from
`NOMINAL` toward `COLLAPSE`. The run ends with a service record that traces the causal chain of what happened.

Three rules keep it honest:
1. **Nothing is scripted to fail.** A ship whose duties are done stays Nominal for a long time. The hidden failure
   seed only gets a foothold where duty debt exists (or, for exogenous failures, at a later fixed time).
2. **Every duty has a cheap way and a proper way.** The cheap way is faster and quietly adds debt. This is the
   core "do it or not" choice, and it exists at every rank.
3. **Everything you do is witnessed or logged by someone.** Consequences come from people and records, not dice.

---

## 2. Assignment: who you get to be

- Roll tier first, then billet, so command roles are not rare (headcount alone would make ~40% of runs Crewman).
  Default weights: Command staff 15%, Dept heads 20%, Officers 30%, Crew 35%.
- You *replace* that roster person: same name, rank, uniform colour, reporting line. The roster entry is flagged
  `player`; its NPC behaviour is switched off.
- A **briefing screen** shows: who you are, the ship, the mission (as your rank would have been told it), your
  superior, your subordinates, your duty card, your watch and quarters. It deliberately does not show the failure seed.
- Optional "dealt three cards, pick one" mode later. Random is the default.
- Rank changes within a run: strong performance can earn a promotion (new duty card, new authority), serious
  negligence demotes or relieves you. See §8.

---

## 3. Time: the ship's day

- **Ship clock** with three watches (Alpha 06–14, Beta 14–22, Gamma 22–06). 1 sim minute ≈ 1.5 real seconds, so a
  watch is ~12 real minutes and a full ship day ~36 minutes. Time-skip (waiting, sleeping, long repairs) runs 4–8×.
- The run starts at the **beginning of your duty watch** and lasts about 1.5–2 watches. Off-duty time is real time
  you can spend (eat, gym, lounge, snoop, sleep) or skip.
- **Handover**: at watch change you brief your relief. What you leave unfinished is inherited as debt. If you sleep
  through the next watch you wake up to the ship as the others left it, good or bad.
- Command is **on call** at all times: you can be summoned off-duty, and an unanswered summons is itself a logged
  event.

---

## 4. Ship, mission, failure seed

### 4.1 Persistent ship (architecture change)
Today `loadDeck(n)` builds one deck at a time as a roguelike level. A living ship needs **every deck's generated data
resident at once** (the generator in `js/gen.js` has no three.js, so this is cheap). Only the deck you are on gets a
3D build; every other deck is simulated abstractly. Lifts become real transit with a short ride time, and NPCs who
use them leave and arrive on the deck you are on.

### 4.2 Missions (what the ship is doing)
Each mission defines: a task board (shared tasks with progress), a schedule of set-piece events, per-department
emphasis, and a primary objective for the top of the chain of command (you inherit the slice that matches your rank).

| Mission | Shared tasks | Set pieces |
|---|---|---|
| Survey | calibrate arrays, scan queue, data to bridge | anomaly appears, scan window |
| Cargo run | manifest reconcile, pallets cargo→stores→airlock | audit, rendezvous |
| Medical relief | patient intake, supply count, hologram load | triage surge, shuttle arrival |
| Diplomatic transit | guest quarters, catering, protocol | formal dinner, guest request |
| Shakedown / refit | punch list, system cycling, sign-offs | inspector walkthrough |
| Quiet watch | rounds, maintenance, morale events | drill, birthday, dull night |
| Inspection | checklist per department | admiral's visit |

Tasks consume systems (survey scans need sensors and power, transport tasks need the pad), so ship health and
mission progress are coupled.

### 4.3 Failure modes (hidden, seeded)
`NOMINAL → ANOMALIES → DEGRADED → CRISIS → COLLAPSE`, per ship and per deck. Seed picks the *cause*:

| Cause | Foothold | First clues |
|---|---|---|
| Reactor drift | unattended reactor tuning, coolant | output wobble, warm bulkheads |
| Contamination | lab / arboretum lapses | sick crew, odd samples |
| Computer rot | skipped diagnostics, log audits | wrong schedules, doors lag |
| Hull fatigue | skipped damage-control rounds | pressure alarms, creaks |
| Psychological (current madness) | stress, counselling gaps | irritability, isolation |
| Sabotage | one NPC with a motive | missing parts, tampered logs |
| False alarm | none | scary but harmless (control run) |

Each role sees different clues (§10), so every billet is a different investigation.

---

## 5. Duty cards: the job

A duty card is data per billet: `{ station, routine, standing duties, order sources, authority, access, review metrics }`.

A **duty** is a small loop: *go to a station → perform an action → (optional) minigame or timed hold → result*,
with quality `proper | rushed | skipped | faked`. The player and NPCs use the same duty definitions.

### 5.1 Billet table (all 36)

| Billet | Station / system | Duty loop | If neglected |
|---|---|---|---|
| Commanding Officer | bridge chair, alert net | set watch priorities, answer department requests, approve plans, brief, handle dilemmas | departments drift, late alerts, morale falls |
| First Officer | bridge, roster | run duty roster, settle department conflicts, inspections | gaps in the roster, unassigned jobs |
| Second Officer | bridge / ops | cover command, relay between science and ops | slow decisions, no cover when CO is away |
| Captain's Yeoman | CO's ready room | schedule, messages, paperwork, errands | orders delayed or lost |
| Chief Flight Officer | flight control | flight plan, small-craft allocation | helm and pilots uncoordinated |
| Helm Officer | helm console | hold course, execute manoeuvres on order | drift, damper strain, collisions |
| Navigator | nav / cartography | plot and correct course | course error accumulates, mission delay |
| Shuttle Pilot | shuttlebay | preflight, shuttle runs for the mission | shuttle tasks fail |
| Flight Deck Crew | shuttlebay | refuel, load, clear the bay | unsafe bay, delays |
| Operations Manager | ops console | power/computer allocation, task board | tasks collide, systems starved |
| Communications Officer | comms console | relay messages, PA announcements | missed messages, garbled PA |
| Transporter Chief / Techs | transporter room | scheduled beams, pattern buffer checks | transporter faults, delays |
| Computer Specialist | computer core | diagnostics, patches, log audits | computer fault, cascade to comms |
| Chief Engineer | engineering | power allocation, repair priorities | faults sit unassigned |
| Asst. Chief Engineer | engineering | run shifts, inspect | uneven shifts |
| Reactor Specialist | warp core console | tune output, balance coolant | reactor drift |
| Environmental Officer | junctions | life-support rounds, scrubbers, pressure | thin air, CO₂ |
| EPS Technician | junctions | breaker/tap rounds | blackouts |
| Damage Control Crew | on call | respond to faults, patch | faults persist |
| Chief of Security | security office | patrol plan, access review, incidents | blind spots, unlogged incidents |
| Deputy Chief | security office | shift lead | weak shift cover |
| Armory Officer | armory | inventory, charging, sign-outs | cells missing, cache exposed |
| Security Officer / Crewman | patrol, brig, posts | rounds, door checks, escorts | incidents unhandled |
| Chief Science Officer | labs | research priorities | idle labs, mission data lost |
| Sensor Officer | sensor console | run scans for the mission | blind to anomalies |
| Stellar Cartographer | cartography | map data upkeep | stale charts |
| Botanist | arboretum | tend and harvest | O₂ reserve and food fall |
| Laboratory Technician | labs | sample analysis | contamination risk |
| Chief Medical Officer | sickbay | triage, treatment plans | untreated crew |
| Counselor | counselling | sessions, stress watch | stress rises (feeds failure) |
| Physician / Nurse / Med Tech | sickbay | patients, rounds, supplies | worsening illnesses, low stock |
| Quartermaster | stores | manifest, allocation | supply errors |
| Galley Chief / Cook | galley | meal service on schedule | hunger, morale |
| Replicator Technician | replicators | maintenance, recalibration | shortages |
| Cargo Handler | cargo bay | move and log pallets | manifest errors |
| Holo-Recreation Tech | holo-playroom | safeties, program checks | holo malfunction |

### 5.2 Cheap way vs proper way (every duty)
- **Proper:** minigame or timed hold, takes 100% time, no debt, small review bonus.
- **Rushed:** about 50% time, lower quality, small hidden debt.
- **Skipped:** zero time, bigger debt, may be noticed.
- **Faked:** you tell your superior it is done (or log it) without doing it. Cheap now; if caught it is the worst
  outcome on the ladder (§8). The truth is checkable by terminal logs, inspection or witnesses.

### 5.3 Minigames (short, skippable by choosing "rushed")
10–40 seconds each, one per *kind* of hardware, not per billet: balance a gauge (reactor), route power (EPS), trace
a wire (junction), steady a hold (helm), sequence checklist (preflight), sort a manifest (cargo), triage board
(sickbay), tune a dial (sensors), simple timing (galley). Repair already exists as hold-E; the new kinds slot in
beside it.

---

## 6. Orders, reports, delegation

- **Orders** flow down the reporting lines already in `BILLETS.reports`. An order is
  `{ from, to, verb, target, deadline, priority }`.
- You receive orders from your superior by comm badge, terminal or in person. Choices: **Accept, Delay (give a
  reason), Refuse, Delegate** (to a subordinate), or **Say it is done**.
- If you outrank someone you can **give orders** and they can obey, grumble or push back depending on respect and
  morale.
- **Reports** flow up. A report claims a status; the truth lives in the ledger. A false report is a lie, and lies
  are discoverable.
- **Superiors check up**: after an order's deadline, the superior asks ("Status?"), sends someone, or inspects
  themselves.
- **Delegation** is real. A subordinate does the duty only if they are free, capable and willing, and you are
  responsible for the outcome.
- **Authority by rank** (access, who you can order, what you can override): Crewman has the least, Captain can
  change alert level, course, rosters and mission priorities, and override locks.

---

## 7. NPC life

### 7.1 Layers (utility AI over smart objects)
1. **Schedule** — billet routines per watch: station time, rounds, meals, social time, sleep. Data-driven.
2. **Orders** — queue from §6; urgent orders pre-empt routine.
3. **Needs & mood** — fatigue, hunger, stress, morale. Needs create unscripted trips (galley, bunk, lounge).
4. **Reactions** — alarms, injuries, seeing the player doing something odd, rumours.
5. **Relationships** — friends, rivals, couples, mentor links; they shape who sits together and who covers for whom.

### 7.2 Smart objects
Stations, beds, chairs, tables, replicators, consoles, junctions advertise **slots** ("1 operator", "4 seats",
"1 patient") and the animation to use (`sitting_idle`, `fixing_kneeling`, `interact`, `idle_talking`, `push`, `dance`,
`walk_formal`). NPCs claim a slot, walk there on the existing path fields, perform, release. If the slot is
taken they queue or find another.

### 7.3 Levels of detail
- Within ~22 m (matches the existing skinning cutoff): full animated humans.
- Same deck, farther: simplified movement along paths, no skinning.
- Other decks: abstract — position is "room X doing Y until time T", with lift trips as timed events. Arrivals
  materialise where the lift opens.

### 7.4 Knowledge & witnesses
NPCs have *beliefs*, not omniscience: what they saw, what they were told, what logs they read. Beliefs spread by
conversation (rumours) and by reports up the chain. This is what makes consequences feel earned: nobody knows you
skipped your rounds until someone passes the unattended junction, or a log gap is found.

### 7.5 Voice
Short **barks** carry most of the character (context + role + mood + relationship). Longer conversations are menu
topics (§9). A line pool per department plus fill-ins ("{name}, the {system} is {status}") is enough to start.

---

## 8. Consequences

### 8.1 Four ledgers
| Ledger | Tracks | Moves when |
|---|---|---|
| **Ship** | system health, task progress, phase | duties done/neglected, faults, cascades |
| **Crew** | morale, stress, injuries, deaths | meals, rest, danger, leadership, events |
| **Standing** | superior / peers / subordinates opinion, rank trust | quality of work, honesty, helping, rudeness |
| **Record** | formal entries: commendations, reprimands | reviews, inspections, incidents |

### 8.2 Duty debt
Skipping or rushing a duty adds **debt** to the system or task it serves. Debt raises that system's fault
chance, speeds degradation and makes cascades start earlier. Proper work pays debt down. Debt is what the
hidden failure seed latches onto, so the ship slides *because* of how it is run, not on a timer.

### 8.3 Discipline ladder (your own consequences)
`Notice → Verbal warning → Written reprimand → Confined to quarters → Relieved of duty → Brig → Court-martial`.
Faking and lying jump rungs. Escalation depends on who found out and what the damage was. Being relieved removes
your authority and access, and the ship carries on without you. In the extreme, you watch it happen.

### 8.4 Promotion ladder
Sustained good reviews and a crisis handled well can earn a field promotion: new station, authority, subordinates.
Promotion also raises stakes (more people depend on you).

### 8.5 Review
Each watch ends with a **performance review** from your superior (a captain's equivalent is the crew's morale and
a command report to Starfleet-equivalent). Scored on completion, quality, timeliness, honesty, initiative.

### 8.6 Causal chain
Every ledger change records its **cause**. The end screen replays the chain, e.g.
"07:40 you skipped coolant rounds → debt +2 on coolant → 09:10 pump fault → 09:50 reactor overheated → 10:20 life
support failed → 10:45 Deck 6 evacuated." This is the payoff of the whole system and also the debugging tool.

### 8.7 Outcomes
Endings combine ship fate and your fate:
- Mission complete, ship fine, you commended / promoted.
- Mission complete at cost (casualties, damage) with or without blame on you.
- Ship lost, you saved people (or yourself).
- You relieved, jailed or killed; the ship survives without you.
- Mutiny / sabotage resolved either way.
Each is a distinct service-record screen.

---

## 9. Interaction design

### 9.1 Universal verbs
Look, Use, Operate, Repair, Take, Carry, Drop, Throw, Give, Open/Close, Lock/Unlock, Hack, Search, Sit, Sleep, Eat,
Talk, Order, Report, Request, Trade, Call (badge). Props declare which verbs they offer, what they need (tool,
access, power) and what they change (a ship effect and a log line).

### 9.2 Objects
- **Doors**: real sliding doors, access levels by rank/department, locked under alert, override tools.
- **Terminals**: role-filtered views of roster, schedules, task board, system status, logs, mail. Access level
  decides what you can see; looking where you should not leaves a log entry.
- **Replicators**: order meals/tools with a cost or cooldown.
- **Keys & tools**: keycards, multitool, scanner (the scan-o-matic), spare parts, medkits as carriable items.
- **Fixtures**: lights, vents, intercom, lift, hatches, emergency override.
- **Clutter**: look, pick up, inspect, use, return. (The ship-inventory data already gives names and real-world
  equivalents.)

### 9.3 NPC conversation
A radial menu per NPC with context-aware options: *Ask about…* (their job, a system, a person, a rumour), *Request*
(a favour, a swap, access), *Order* (if you outrank them), *Report*, *Trade*, *Small talk*, *Help them* (when they are
mid-task). Responses use mood, relationship, rank and what they believe.

### 9.4 Objectives UI
A **duty board** (always one keypress away): current watch's duties with status, pending orders with deadlines,
mission task slice for your rank, personal goal. Completing and failing items is visible and feeds the ledger.

### 9.5 Personal goals (flavour, optional)
One card per run, e.g. *earn a commendation*, *protect a friend*, *cover up a mistake*, *find out who is
sabotaging*, *get transferred*, *keep your head down*. They create reasons to bend the duty card.

---

## 10. Information is role-shaped (replay value)

Same failure seed, different view per billet:
- **Engineers** feel power and heat first; **medics** see symptoms; **security** sees odd access logs; **bridge**
  sees the mission picture; **cooks** hear the gossip; **cargo** notices missing parts; **counselor** sees stress.
- Your *view* of the ship (terminals, scan-o-matic data, who you bump into) is filtered by access and station.
- Solving the cause takes assembling clues across departments: talk to people, read logs, trade favours.

---

## 11. Three sample runs (how it should feel)

**Captain — Quiet Watch mission.** You start on the bridge. Helm asks permission to adjust for drift, the
Counselor requests a day of rest for engineering, Security reports an access-log oddity. You cannot do everything.
You approve, deny, delegate. An hour in, Engineering is short-handed; you ordered a drill the same shift. When the
reactor drifts, the Chief Engineer asks for help you pulled away yourself.

**Reactor Specialist — Shakedown.** Your station is the warp core console. Every 20 sim minutes it wants tuning
(hold-and-balance, 20 s). Your chief assigns a coolant check on another deck. Do both, or rush one, or ask the EPS
tech to cover? You skip the check, the tech notices the junction was untouched, and mentions it at lunch. Later the
pump fails.

**Cargo Handler — Cargo run.** You move pallets for the quartermaster. Easy, boring, anonymous. But you carry a
crate that does not match the manifest. Open it or not? Tell someone or not? You can reach crawlspaces and stores
no officer visits, and you hear things.

---

## 12. Implementation map

New modules (kept separate so `crew.js` stays the data/system layer):
| File | Role |
|---|---|
| `js/duties.js` | duty-card data for all billets, duty loop runner, minigame kinds |
| `js/sim.js` | ship clock, NPC schedules, smart-object slots, LOD, lift transit |
| `js/orders.js` | orders, reports, delegation, check-ups |
| `js/ledger.js` | the four ledgers, debt, discipline/promotion, causal chain log |
| `js/missions.js` | mission definitions, task board, set pieces |
| `js/failure.js` | failure modes (reactor, contamination, computer, hull, psychological = madness, sabotage) and phase machine |
| `js/talk.js` | conversation menu, barks, belief/rumour model |
| `js/interact.js` | universal verbs and prop affordances |

Changes to existing code:
- `crew.js`: `makeComplement` gains `player` slot and relationship data; `ShipState` accepts **debt** as an input
  to fault chance; `effects()` stays the single consequence hub.
- `main.js`: decouple deck building from "level" flow so all decks persist; add the player-billet start;
  madness code moves into `failure.js` behind a phase gate.
- `director.js`: repurposed from "pressure" to "phase advance + event scheduler".
- `world.js`/`gen.js`: stations/slots exposed as data; sliding doors; high-ceiling rooms later.
- `enemies.js`: hostiles spawn only in `CRISIS` and only for modes that have them.

---

## 13. Build order (each step playable and testable)

1. **Nominal baseline.** Persist all decks, ship clock, phase machine stub, no hostiles at start, madness behind a
   failure-mode gate. *Test:* ship runs 2 sim-hours with no player and no failure seed and stays Nominal.
2. **You are somebody.** Billet assignment, briefing screen, duty board, one station kind (console) and the
   proper/rushed/skipped choice for 6 billets (helm, reactor, EPS, cook, cargo, physician).
   *Test:* scripted player doing duties keeps the ship Nominal; same ship with a no-op player degrades.
3. **NPC schedules.** Routines for all billets at least at coarse level, smart-object slots, LOD, lift transit.
   *Test:* bot watches a deck for a sim-day and checks nobody is stuck, everyone eats and sleeps, stations staffed.
4. **Orders and reports.** Accept/delay/refuse/delegate/fake, superior check-ups, witness model.
   *Test:* faked report is caught by an inspection in a seeded run.
5. **Ledger and consequences.** Debt feeding faults, discipline ladder, review, causal chain end screen.
6. **Mission layer.** Three missions with task board and set pieces.
7. **Interaction pass.** Sliding doors, terminals, carry/give/trade, conversation menu, barks.
8. **Failure modes.** Reactor drift first (reuses cascades), then madness, contamination, hull fatigue, sabotage.
9. **Rank journeys.** Promotion/relief, command-specific verbs, personal goals, tuning with real play.

Every step stays seed-deterministic so `tools/test.mjs` can run headless sim-days quickly (no rendering).

---

## 14. Decisions taken (change any of these)

- Player is a **roster member replacing an NPC**, assigned **randomly** with tier weighting.
- A run is **~1.5–2 watches (~20–25 real minutes)** with time-skip, not a full day.
- **No hostiles in Nominal or Anomalies**, ever. Crisis hostiles depend on failure mode.
- The failure seed is **hidden**; clues are role-shaped.
- **Faking is allowed** and punished harder than skipping.
- Madness is **kept** but demoted to one failure mode.
- Cut-corners choice exists at **every rank**, including Captain (rush a decision, delegate carelessly).

## 15. Open questions

1. Should the player be able to **die** and continue as another crew member (permanent consequences for a person,
   not the run)? It fits "face the results" and keeps the ship's story going.
2. How much **hand-holding** at the start (duty board tutorial) versus discovery?
3. **Multiplayer-ish asynchrony** later (other humans as NPC slots)? Not now, but worth not blocking.
4. Is the **ship day compression** right at ~36 min, or should runs be shorter?
