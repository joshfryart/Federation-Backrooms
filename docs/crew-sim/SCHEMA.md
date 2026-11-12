# Crew role-play profiles — schema and shared model

One JSON file per billet at `docs/crew-sim/<billet-key>.json`, written by an agent who *plays that crew member* and
decides what they would really do. These profiles become data for the NPC simulation (`js/sim.js`), the bridge
comms, alerts and the duty system. Check your file with `node tools/check-crew-sim.mjs <billet-key>`.

Read first: `docs/DESIGN-systems-nominal.md`, `js/crew.js` (BILLETS, SYSTEMS, CASCADES, DEPT_LINES),
`js/data.js` (ROOMS), `js/ships.js` (ZONES), `docs/ship-inventory/INDEX.md` and `ROOM-PLAN.md`.

## Shared model (every profile must agree with this)

**Bridge-centric operation.** The bridge crew's main goal is the *mission*. At run start the bridge announces the
mission and sets the ship's alert condition. Every department derives its work from that goal. The bridge is
responsive: Command/Flight/Ops/Comms staff on the bridge talk to crew by comm badge and PA, and crew call the
bridge when they need a decision, have a report, or see a problem. Orders flow down the reporting lines in
`BILLETS.reports`; reports flow up.

**Run clock.** A run is ~20 real minutes = ~6 ship hours. Mission tasks are timed in *run minutes* (0–20).
A crew member's *daily template* is in *ship hours since their watch began* (`h` 0–24): duty is `h` 0–8, the rest is
off duty (meal, recreation, sleep, personal errands). The sim picks which watch each person belongs to
(`alpha`, `beta`, `gamma`) and which moment the run starts at, so write the template independent of the watch.

**Rooms** are the keys in `js/data.js` ROOMS (bridge, engineering, sickbay, mess, transporter, shuttlebay, cargo,
holodeck, quarters, arboretum, readyroom, brig, armory, gym, lab, laundry, lounge, workshop, plant, morgue, datacore,
stores, washroom, airlock). There is **no bar room**: the **lounge** hosts the recreation bar (use `spot: "bar"`);
`holodeck` is the Holo-Playroom. `spot` is a prop/fixture kind or a short label, e.g. `console`, `warpcore`,
`biobed`, `replicator`, `table`, `bunk`, `bar`, `junction`, `locker`, `pad`, `workbench`, `desk`, `sofa`,
`treadmill`, `weightbench`, `tree`, `lift`, `door`, `corridor`. Pick things a real ship would plausibly have.

**Missions** (`mission_tasks` keys): `quiet_watch` (default baseline), `survey`, `cargo_run`, `medical_relief`,
`shakedown`.

**Phases** (`phase_behaviour` keys): `nominal`, `anomalies`, `degraded`, `crisis`, `collapse`.

**Alerts** (`alert_responses` keys): `yellow` (heightened readiness), `red` (all hands to stations), `fire`,
`hull_breach`, `contamination` (quarantine), `power_failure`, `gravity_failure`, `intruder` (security lockdown),
`medical_emergency`, `abandon_ship`. Each alert has a meaning the player sees on the HUD; your `alert_responses`
say what *this* person does when it sounds (where they go, what they do, what they say on comm).

**Systems** are the ids in `js/crew.js` SYSTEMS (alert, helm, dampers, computer, comms, transport, reactor, eps,
gravity, lifts, life, coolant, lighting, security, armory, sensors, hydro, sickbay, emh, replicators, holo).

**Time units.** Durations in minutes of *ship time* unless named `run_min`. 1 run minute ≈ 0.3 ship hours.

## File format

```jsonc
{
  "billet": "helm",                       // must equal the file name and a BILLETS key
  "role_summary": "2–3 sentences, first person, who you are and what you care about",
  "personas": [                           // exactly 3 individual variants, so two helmsmen are not clones
    { "id": "by_the_book", "traits": ["punctual", "formal"], "quirk": "...", "routine_effect": "which parts of the template change" }
  ],
  "daily_template": [                     // covers h 0..24 with no gaps, in order
    { "from": 0, "to": 0.5, "activity": "handover_in", "room": "bridge", "spot": "console",
      "anim": "interact", "interruptible": false, "social": "pair", "note": "why" }
  ],
  "activities": [                         // the personal-time menu this person picks from when off duty / free
    { "id": "rec_bar", "label": "Drink at the rec bar", "rooms": ["lounge"], "spot": "bar", "anim": "sitting_idle",
      "minutes": [20, 60], "weight": 3, "social": "group", "when": "off_duty",
      "needs": { "fatigue": 0, "hunger": 0.1, "stress": -0.3 }, "note": "..." }
  ],
  "duty_loops": [                         // the job: what they actually do, repeatable
    { "id": "tune_core", "label": "...", "room": "engineering", "spot": "warpcore", "every_min": 20,
      "duration_min": 3, "steps": ["walk to station", "..."], "system": "reactor",
      "quality": { "proper": { "time": 1.0, "debt": 0 }, "rushed": { "time": 0.5, "debt": 1 },
                   "skipped": { "time": 0, "debt": 3 }, "faked": { "time": 0.1, "debt": 3 } },
      "bridge_report": "what/when they tell the bridge, or null" }
  ],
  "mission_tasks": {                      // all five mission keys required, 2–5 tasks each
    "survey": [ { "task": "...", "at_run_min": 3, "room": "lab", "spot": "console",
                  "depends_on": "bridge order | other task | none", "reports_to": "billet key | bridge | none",
                  "if_neglected": "..." } ]
  },
  "bridge_comms": {
    "calls_to_bridge": [ { "trigger": "when this happens", "message": "exact comm line, in character",
                           "priority": "routine|urgent|emergency", "to": "billet key or 'bridge'" } ],
    "calls_from_bridge": [ { "order": "what the bridge might tell this person", "response_line": "their reply",
                             "time_to_comply_min": 2, "refuses_if": "when they would push back, or null" } ]
  },
  "alert_responses": {                    // all ten alert keys required
    "red": { "action": "...", "room": "bridge", "spot": "console", "priority": 1, "comm_line": "..." }
  },
  "phase_behaviour": {                    // all five phase keys required
    "degraded": { "mood": "tense", "routine_change": "...", "lines": ["...", "..."], "leaves_post_if": "when they abandon the job, or null" }
  },
  "relationships": [ { "with_billet": "nav", "kind": "friend|rival|mentor|mess_partner|confidant", "effect": "how it shapes behaviour" } ],
  "barks": { "idle": ["..."], "working": ["..."], "greeting_player": ["..."], "greeting_player_higher_rank": ["..."],
             "greeting_player_lower_rank": ["..."], "tired": ["..."], "hungry": ["..."], "stressed": ["..."], "alert": ["..."] },
  "player_reactions": {                   // how they treat the PLAYER (who holds some other billet)
    "player_does_their_job_well": "...", "player_neglects_duty": "...", "player_fakes_report": "...",
    "player_gives_order_ok": "...", "player_gives_order_outranked": "...", "player_out_of_place": "...",
    "player_asks_favour": "..."
  },
  "decision_rules": [ "IF ... THEN ... (8–12 rules, the real choices this person makes)" ],
  "information_view": "what this billet sees/hears first about a developing problem (role-shaped clues)",
  "temptations": [ "ways this person is tempted to cut corners, and what happens" ]
}
```

## Quality bar
- Play the character. Choose what a real, slightly tired, professional person in this job would do; include
  small human things (coffee, gossip, a nap, a game of cards, checking on a friend), not only duties.
- The daily template must be **plausible for the job**, cover all 24 h, and use real room keys.
- Off-duty `activities` should have **at least 6 entries** spanning meal, social, rest, exercise, hobby, and one
  job-specific personal activity. Include `rec_bar`, `holo_playroom`, `sleep` (bunk in quarters) and `gym` or `walk`.
- `duty_loops`: 2–5, each tied to a real system or station. For roles without a system (e.g. yeoman, counselor,
  cook), set `system` to the nearest or `null`.
- Bridge comms lines should read like short real comm traffic ("Bridge, Engineering. Core temp up two points.").
- Barks: 3+ lines per context. Keep each under 90 characters. No franchise names, ranks beyond `RANK_SHORT`, or
  trademarks; the setting is an original fleet.
- Keep the whole file under ~14 KB of JSON. Do not edit any other file.
