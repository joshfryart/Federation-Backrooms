# Job mini-games (Systems Nominal)

Doing a job properly is a short skill game instead of "stand there and hold E". The first time you meet a tool, console or use point, a
skippable instruction card explains it. Code: `js/minigames.js` (pure logic, node-tested), `js/minigames-ui.js` (canvas layer + glue class `Minis`),
hooks in `js/duty.js` (`Duty.play`, `complete`, `doTask(…, { noGame })`) and `js/main.js` (`miniBlocked / miniJob / miniApply / miniAbort / miniRepair / miniPin`).
Tests: `tools/test-minigames.mjs` (sections `minigames-unit` and `minigames`).

## Flow
1. **Start.** E at a faulted repair point, or a "proper" start of a due duty round / open mission task (E at the station, the J board, the wheel, the terminal:
   every caller goes through `Duty.perform(id, 'proper')` / `doTask(id)`, so one hook `Duty.play(job)` covers them all). The job maps to a game with `gameFor(job)`.
2. **Card** (first time per game id or per station kind, remembered in `localStorage` key `fb_mini_seen`, like `fb_navtour`): what it is, what the job needs, keys, what "proper" looks like.
   Enter or the button begins, Esc skips the card. The first unseen duty / task also sets `G.pin` (the nav guide's in-world route) when it comes due. First use of a handheld (X) shows a one-line tip with keycaps (`Minis.toolTip`).
3. **Game** as a `ui-mode` layer (`kind: 'mini'`): world paused via `G.menuPause`, cursor freed, Esc / Backspace pop exactly this layer. A countdown bar shows the time limit.
4. **Result** card (auto-closes after 2.6 s, Enter closes now). The outcome has already been applied.

## Result -> the existing model
| Job | Quality >= 0.70 (0.55 on the first job of a type this run) | Below | Esc during the game |
|---|---|---|---|
| Duty round | `Duty.complete(id, 'proper')` | `complete(id, 'rushed')` | `perform(id, 'rushed')`, the old timed rushed round |
| Mission task | `doTask(id, 'proper', { noGame })` | `'rushed'` | `doTask(id, 'rushed')` |
| Repair | `repair(sys)`, hp 1 | 0.30-0.70: patch, hp 0.8 (nominal, little margin) | nothing changes; hold-E (the old slow repair) is allowed at that point |
| Repair, below 0.30 | botched: hp 0.6 (still degraded), a carried spare part is spoiled, sparks, a line in the causal chain | | |

A game never ends "faked" or "skipped": those verbs stay as they were (J board / wheel, no game). Witness, trust, ledger, audit and score effects come from the unchanged `_finish` / `_witness`.
`Duty.minis` logs each result (`quality`, `mistakes`, `outcome`).

## Difficulty and teaching
`difficulty({ skill, severity, first })` = `(0.25 + 0.45·severity + 0.35·(1 − skill)) × (first ? 0.5 : 1)`. `skillOf(person, dept)` = 0.35 + 0.05·rank + 0.3 if the system's department is theirs.
Severity: repair = degraded 0.35 / offline 0.8; round 0.3 (+0.2 overdue); task 0.4. Difficulty sets band width, drift speed, item count and the time limit (`timeMul` stretches it with a tool in hand).
The first job of each game this run uses half the difficulty, the lower bar, and a repair cannot botch.

## The games (10-30 s)
| id | Job it fits | Play |
|---|---|---|
| `wires` | junction panel repairs; junction rounds (eps, lighting, security, lifts) | pair numbered terminals with lettered ones; keys 1-5 then A S D F G, or click |
| `dials` | reactor, coolant, life support, gravity, dampers, hydroponics; core / pump skid / grow-bed rounds | keep drifting needles in their bands; 1-3 or Up/Down pick, Left/Right (held) or wheel trim |
| `tune` | sensors, comms, transporters, EMH; calibration consoles, pads, relay junctions | find the peak of a hidden signal with arrows or mouse; Space / click locks; the meter shows how close |
| `sequence` | bridge / ops consoles, replicators, benches, armory lockers | put the job's own `steps` (from `duties.json`, walking steps dropped) in order; 1-5 or click |
| `crates` | stores / cargo lockers, the cargo sled | put each crate left or right to keep the sled level; Left / Right or click |
| `dose` | biobeds (sickbay) | start the infusion, stop it inside the band; Space or click; running to the top is an overdose |

Not every round is a puzzle: desks, tables, doors, corridors, counters, sinks and stoves keep the plain timed round.

## Pacing and fairness
No game opens during a hazard, an alert of severity 3+ (red, fire, breach, contamination), a hull breach, a conversation, a fight / security response, when hunted, or while hiding;
those jobs use the old way (hold E / timed round). Every game has an Esc exit; the layer never traps the player (`onClose` handles `closeAll` from a phase change).
`?test=1` / webdriver runs keep the old behaviour unless `?mini=1` (or a test sets `__game.mini.enabled = true`), so the existing duty tests are unaffected.

## Accessibility
No flashing, shake or animated pulses (calm mode needs nothing extra). Colour-blind mode (`body.cb`) swaps to an Okabe-Ito palette; wires also differ by shape; state is always text as well as colour.
Sounds (`click`, `buzz`, `chime`) are captioned when captions are on.

## Determinism
`js/minigames.js` is checked by a test to contain no `Math.random`, clock or DOM. A game's seed = hash of run seed, job kind / id and the play count; games advance by `dt` and input events only.
