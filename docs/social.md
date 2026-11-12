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
   `wary`, `in-awe`, `owes-favour` / `is-owed`. Positive strong ties (`REL_TYPES[..].strong`) are capped at 8 (Dunbar-ish).
   `reason` is a line the player can hear ("regulars at card night", "work the cargo-transporter run together on beta
   watch", "served together aboard the USF Alberta", "seeing each other in secret (different ranks)").

## The sociology (order of `generateSocial`)
- Groups first (they are the contact), then couples (≈6.5 % pairs; same watch strongly preferred; never in a direct
  chain of command; same-watch couples are mostly `spouse` and share quarters; cross-rank romances are often secret).
- Mentors: lieutenants and up with `social:mentor` / `workstation:mentors-juniors` (or a profile `mentor` line) take 1-2
  juniors in their department, preferring their own reporting line.
- Friendships: best affinity first, each person up to an appetite of 1-7 (from extroversion; loners 0-1, newcomers −2),
  max 3 cross-rank and, for cargo/stores/loader staff, max 2 outside their department. Top friend may become a
  `close-friend` (lower bar between medical staff: they confide in each other).
- Top-ups: ~85 % of non-loners get at least one cross-rank friend; cargo/stores/loader staff get 0-2 off-work friends
  outside their department (same watch, same off-duty rooms first). 1-3 pairs of old shipmates.
- Rivals (same department, close rank, same billet, `rival-minded`, profile `rival`), 1-2 of them escalate to a feud.
- Chain-of-command friction (strict boss + joker / corner-cutter → `wary`), juniors in awe of the captain or a
  commanding department head, gossip links between gossips (who also know half the ship), one fixer with 5-9 people
  owing favours, one person everyone likes, one nobody trusts (6-10 people wary of them).
- Weak ties: the bridge circle and department heads are colleagues; everyone gets a few acquaintances.
- Finally nobody is orphaned unless they are a flagged loner (every ship has at least one loner).

## How the game uses it
- **Sim** (`js/sim.js`, `sim.setSocial(graph)`): only in *free* blocks (`freeBlock`: local hour ≥ 8, not sleep / prep /
  handover). (1) `meetingFor(p, hour)`: a group gathering covering the hour (the one with most friends attending; nobody
  goes to an empty one) overrides the block and names its own room instance (`site`); people with none tag along to their
  lead's gathering. (2) Else, 70 % of the time, go where your free-time lead (`leadOf`: head of your same-watch companion
  chain) is scheduled. (3) Else stand at the same furniture (`spot`) as your closest same-watch friend if in the same room.
  Free-time room instances are chosen from the social `anchorOf` (one per same-watch friendship component), and spouses
  share quarters (`quartersOf`). Without a graph the sim behaves exactly as before. Off duty, friends share a room ~40 %
  more often (test: `friendsTogether`).
- **Duty** (`js/duty.js`): initial trust adds `graph.trustBias(player, p)` (±0.25 from p's view of the player's
  character); every `_bump` also calls `graph.onTrustEvent(p, player, delta)`.
- **Dynamics**: `onTrustEvent(a, b, delta, why)` accumulates; enough makes strangers acquaintances, acquaintances friends,
  turns friends `wary`, or mends it; gossips pass bad news on to their links. `tick(dt)` decays the accumulators and
  returns new events; `events()` is the log.
- **Talk menu**: "Ask who they hang out with" → `talkLine(npc, player)` (secrets only for a partner or close friend).
- **Queries**: `friendsOf`, `groupsOf`, `seekTargets(p, { present, activity })`, `preferredCompany(p, activity)`,
  `describe(p)` (UI lines), `stats()`, `toJSON()` / `SocialGraph.fromJSON(j)`.

## Tuning
All knobs are the exported tables at the top of `js/social.js`. Raise `WATCH_MIX.same` / `PROX` for a more
watch-bound ship; raise `CHEMISTRY.jitter` / `sparkRate` for more surprising pairs; `LIMITS` holds the caps and rates
(couples, rivals, newcomers, debtors, close-friend thresholds); add an off-duty pastime by adding a row to `ACTIVITIES`
(room + spot must exist in `js/data.js` ROOMS; `ranks` limits who joins). Run `node tools/test-social.mjs` after
changes (determinism, seed variety, orphan / cap / symmetry rules over 10 ships × 10 seeds, sim clustering, duty trust,
<150 ms per ship). Not done: watches are not reassigned for couples (pairing just prefers the same watch); NPC bodies
on the player's deck still pick their table by person id in `simTileFor` (`js/main.js`) — passing
`G.sim.social?.anchorOf(person)` there would seat friends at the same table.
