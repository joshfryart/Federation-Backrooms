# Social tracker (`js/social.js`)

Every Systems Nominal run deals the crew a social life: who eats with whom, who is friends, who is sleeping with whom, who
cannot stand whom, which knots of people gather where in their off hours. It is random per run seed but *appropriate*:
contact comes from the ship's real structure (department, watch, duty rooms, deck, rank, chain of command, profile
relationships), and the seed adds chemistry on top. Same seed + same roster + same plan = identical graph.

Pure module (no three.js, no DOM). Generated in `newRun()` (`js/main.js`) right after the NPC sim:
`G.social = generateSocial(G.roster, { seed, plan, data: commsData(), clock, ship })`, then `G.sim.setSocial(G.social)`.
Debug page: `social.html?ship=<0-9>&seed=<n>` (linked from `crew.html`). In game: `__game.social`. Tests: `node tools/test-social.mjs`.

## What is generated

1. **Per-person profile** — `extroversion` (from `social:*` and a few speech/lift/workstation tags, `EXTROVERSION`),
   `loner`, `newcomer` (1-3 per ship, few and recent ties), `tenure` (days aboard), `loneliness`, `reputation`
   (incoming valence), flags `gossip` / `fixer` / `beloved` / `distrusted`, `seek` (3 people they would seek out) and `avoid`.
2. **Pairwise affinity** (`affinity(a, b)`, 0..1): `DEPT_SAME` / `DEPT_PAIR` (+`INSULAR` for security), `BILLET_PAIR`,
   profile `relationships` (`PROFILE_REL`; `node tools/build-comms.mjs` compiles them into `comms.json` as `rel`),
   bridge circle and bridge-to-department-head bonuses, same watch (`WATCH_MIX`), shared duty rooms and off-duty rooms on
   the same watch, same quarters deck (`PROX`), direct report, `RANK_MIX` (officers' mess vs crew lounge, rank distance),
   `TAG_PAIR` (two jokers +, rule-enforcer vs joker −), scaled by extroversion, plus `CHEMISTRY` (seeded jitter and rare
   "sparks" — unlikely friendships across the ship). Sharing a group adds `PROX.group`.
3. **Groups** (`groups`: id, kind, name, members, leader, room, spot, activity, site, meet, cohesion):
   `bridge-circle`; `department-cell` per department × watch, meeting at `DEPT_HANGOUT` (engineers at the lounge bar,
   medical over tea in the mess, security in the weight room...); `officers-table` and `watch-mess` tables in the mess;
   `route-crew` (cargo / replicator / transporter / flight-deck crew on a watch, plus security or ops people whose duty
   walks the same rooms); hobby groups from `ACTIVITIES` (rec bar, card night, music circle, holo league, holo-novel club,
   weight room, treadmills, arboretum walks, workshop tinkerers, laundry natter, the counselor's open hour) built only when
   the ship has the room; `couple`; `mentor-pair`; `clique` (everyone strongly tied to everyone); `faction` (the fixer's
   favour book, the regulation crowd). `meet = { from, to }` in absolute ship hours, plus `watch` and `local` (hours since
   that watch began, the same unit as the `day` blocks); the window is the one where most members are free.
4. **Relations** — `relation(a, b)` is a's view of b: `{ type, attitude, strength, valence, since, reason, visible, shared }`.
   `type` says what b is to a (`mentor` = b mentors a; the reverse reads `protege`). Symmetric types: spouse, romance,
   close-friend, friend, old-shipmate, rival, feud, gossip-link, colleague, acquaintance. One-way `attitude` on top:
   `wary`, `in-awe`, `sweet-on`, `resents`, `owes-favour` / `is-owed` (with its own `areason`). `history: 'ex'` marks
   a former couple. Positive strong ties (`REL_TYPES[..].strong`) are capped at 8 (Dunbar-ish).
   `reason` is a line the player can hear. For friend / close-friend / old-shipmate / rival ties it is a verb phrase
   that reads after "we" ("are regulars at card night", "work the cargo-transporter run together on beta watch",
   "served together aboard the USF Alberta ...", "both want the same promotion") because the talk menu builds
   "Okafor? Good sort — we <reason>." from it; the test enforces this for the friendly types.
5. **Story hooks** — `graph.hooks`: `[{ kind, people, text, secret }]`, 13-25 per run, each a sentence in the crew's
   voice that the game can put in a talk line, a log entry or a rumour. Kinds: `exes` (1-2 former couples, sour =
   rivals, civil = friends), `crush` and `triangle` (one-sided `sweet-on`; 0-3 of them aimed at someone with a
   partner, who is then often `wary` of the admirer; people = [admirer, target, partner]), `passed-over` (2-4 people
   who `resent` the colleague one stripe up with less time aboard), `feud` and `camps` (the strong ties of each side
   of a feud become two `faction` groups "<Name>'s side" led by the feuding pair, members mostly `wary` of the other
   leader), `lineage` (mentor of a mentor, three deep), `secret` (a hidden romance, `secret: true`), `favour`,
   `beloved`, `distrusted`, `newcomer`, `old-shipmates`.

## The sociology (order of `generateSocial`)
- Groups first (they are the contact). Each group's meeting window is the one where most members are free *and not
  already booked by an earlier group*, so one person's circles spread over their 6-9 free hours instead of colliding.
- Couples (≈6.5 % pairs; same watch strongly preferred; never the captain and never anyone above or below you in the
  reporting line at any depth; same-watch couples are mostly `spouse` and share quarters; cross-rank romances are often secret).
- Mentors: lieutenants and up (and keen lieutenants j.g., for crewmen) with `social:mentor` /
  `workstation:mentors-juniors` (or a profile `mentor` line) take 1-2 juniors in their department at most
  `LIMITS.mentorGap` (3) rank steps down, preferring their own reporting line and watch.
- Friendships: best affinity first, each person up to an appetite of 1-7 (from extroversion; loners 0-1, newcomers −2),
  max 3 cross-rank and, for cargo/stores/loader staff, max 2 outside their department. Top friend may become a
  `close-friend` (lower bar between medical staff: they confide in each other).
- Top-ups: ~85 % of non-loners get at least one cross-rank friend; cargo/stores/loader staff get 0-2 off-work friends
  outside their department (same watch, same off-duty rooms first). 1-3 pairs of old shipmates.
- Rivals (same department, close rank, same billet, `rival-minded`, profile `rival`; ≈7 % of crew size in pairs), 1-2
  of them escalate to a feud. Rival reasons are picked to fit the pair (a promotion race needs peers, a write-up needs
  a rank difference).
- Drama (see story hooks): exes, crushes and triangles, passed-over promotions, camps around each feud, mentor lines.
- Chain-of-command friction (strict boss + joker / corner-cutter → `wary`), juniors in awe of the captain or a
  commanding department head, gossip links between gossips (who also know half the ship), one fixer with 5-9 people
  owing favours, one person everyone likes, one nobody trusts (6-10 people wary of them).
- Weak ties: the bridge circle and department heads are colleagues; everyone gets a few acquaintances.
- Finally nobody is orphaned unless they are a flagged loner (every ship has at least one loner).

## How the game uses it
- **Sim** (`js/sim.js`, `sim.setSocial(graph)`): only in *free* blocks (`freeBlock`: local hour ≥ 8, not sleep / prep /
  handover). (1) `meetingFor(p, hour)`: a group gathering covering the hour (the one with most friends attending; nobody
  goes to an empty one) overrides the block and names its own room instance (`site`); people with none tag along to their
  lead's gathering. Pairs (couples, mentor pairs) and a group's leader always turn up; other members with probability
  `0.6 + 0.4 × cohesion`. Measured over 10 ships × 10 seeds: 94 % of scheduled gatherings convene (two or more members
  there at once; was ≈70 %), 92 % of couples keep their time together (was 71 %), and crew spend ≈44 % of free time at
  a gathering (was ≈29 %). (2) Else, 70 % of the time, go where your free-time lead (`leadOf`: head of your same-watch companion
  chain) is scheduled. (3) Else stand at the same furniture (`spot`) as your closest same-watch friend if in the same room.
  Free-time room instances are chosen from the social `anchorOf` (one per same-watch friendship component), and spouses
  share quarters (`quartersOf`). Without a graph the sim behaves exactly as before. Off duty, friends share a room ~40 %
  more often (test: `friendsTogether`).
- **Duty** (`js/duty.js`): initial trust adds `graph.trustBias(player, p)` (±0.25 from p's view of the player's
  character, plus `TRUST_ATT` for a one-way attitude: resents −0.09, wary −0.05, sweet-on +0.06, in-awe +0.04,
  owes-favour +0.03); every `_bump` also calls `graph.onTrustEvent(p, player, delta)`. Whatever billet is dealt,
  98 % of characters start with someone they already know and about one in six with someone who starts cool towards them.
- **Dynamics**: `onTrustEvent(a, b, delta, why)` accumulates; enough makes strangers acquaintances, acquaintances friends,
  turns friends `wary`, or mends it; gossips pass bad news on to their links. `tick(dt)` decays the accumulators and
  returns new events; `events()` is the log.
- **Talk menu**: "Ask who they hang out with" → `talkLine(npc, player)` (secrets only for a partner or close friend);
  the answer now closes on their history with the asker (`aboutYou`). Gossip lines in `js/talk.js` use `reason`.
- **The player's character** (any crew member can be dealt; nothing is generated for the player specially):
  `aboutYou(p, you)` → p's one line about their history with you (friend, mentor, rival, ex, resents you, sweet on
  you, owes you, ...) or null; `playerBrief(you, max = 7)` → `[{ kind, id, text }]` "who you already know" lines
  for a briefing card or the log (kinds: partner, friend, mentor, protege, shipmate, ex, rival, feud, admirer, cool,
  debt). Neither is wired into the HUD yet.
- **Rumours**: `rumours(p, { n = 2, asker })` → the hooks p would pass on: about other people p has a tie to (a
  gossip knows them all), never about p or the asker, secrets only from a gossip or a close friend of those involved.
  `storyOf(a, b)` → one sentence explaining a tie (debug page). Not wired into the talk menu yet.
- **Queries**: `friendsOf`, `groupsOf`, `seekTargets(p, { present, activity })`, `preferredCompany(p, activity)`,
  `describe(p)` (UI lines), `stats()`, `toJSON()` / `SocialGraph.fromJSON(j)`.

## Tuning
All knobs are the exported tables at the top of `js/social.js`. Raise `WATCH_MIX.same` / `PROX` for a more
watch-bound ship; raise `CHEMISTRY.jitter` / `sparkRate` for more surprising pairs; `LIMITS` holds the caps and rates
(couples, rivals, newcomers, debtors, close-friend thresholds); add an off-duty pastime by adding a row to `ACTIVITIES`
(room + spot must exist in `js/data.js` ROOMS; `ranks` limits who joins). Run `node tools/test-social.mjs` after
changes (determinism, seed variety, orphan / cap / symmetry rules over 10 ships × 10 seeds, "we"-phrase reasons, no
romance inside a reporting line, mentor reach, gatherings convening, hook shapes and counts, player lines for every
billet, sim clustering, duty trust, <150 ms per ship; typical 20-40 ms). `LIMITS` also holds the drama rates
(`crushRate`, `triangles`, `exes`, `passedOver`, `campSize`, `mentorGap`); the line pools are `MEET_WHY`,
`RIVAL_WHY`, `FEUD_WHY`, `EX_WHY`, `CRUSH_WHY` and the `aboutYou` / hook templates. Not done: watches are not reassigned for couples (pairing just prefers the same watch); NPC bodies
on the player's deck sit with friends when they arrive (`simTileFor` in `js/main.js`: the furniture of a `seekTargets`
friend already in the room, else the circle's table by `anchorOf`, else beside the friend) but do not move over later.
