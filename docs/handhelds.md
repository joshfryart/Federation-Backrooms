# Handheld job equipment and improvised weapons

Everything a crew member can hold has a **job** and can be used as a **weapon**; both wear the same durability. Data: `js/handhelds.js` (pure). Glue: `js/kit.js`. Meshes: `js/carry.js`. Tests: `node tools/test-handhelds.mjs`, browser block `handhelds:` in `tools/test.mjs`.

## Items (23)
Tricorders (engineering, medical, science, security, geological, atmospheric — flip-open clamshells, `foldable`), comm badge, PADD (`foldable`), type-1 phaser, type-2 phaser, phaser rifle, hypospray, dermal regenerator, laser scalpel, hydrospanner, spanner, plasma torch, tool bag, hand lamp, fire extinguisher, mop, cargo hook, pry bar. Each has a real-world equivalent from `docs/ship-inventory/`, carriers (billets / departments / rank), a holster (belt / back / hand / chest / pocket), a model, a job profile (`verbs`, `effect`, `repairMul`, `heal`, `wear`, `where` = equipment entries where NPCs take it out, Operator `script`) and a weapon profile.

## Rules
- **Durability is shared**: job use costs `job.wear`, a swing `melee.wear`, a throw `throw.wear`. At 0 the item is broken: its job no longer works and it hits at 60%. Foldables (tricorders, PADDs) and thrown items can also snap outright (`breakP`).
- **Phasers** spend charge: `stun`, `kill`, `overload` (a grenade: fuse, radius, consumes the phaser). As tools they heat and cut (`repairMul`).
- **Hostiles (madness)**: `stun` -> `stunFor(seconds)`; `dmg` removes hit points from crazed crew (2 hp; the zapper does 1) through the existing `killMad`.
- **Crew (Systems Nominal)**: a hit stuns / sedates them (they cower `stun x 3` s, hypospray 20 s), costs 0.25 trust with them and 0.06 with witnesses — unless they are the saboteur (`phases.saboteur`): then security thanks you and the sabotage stops.
- **Loadouts** (`loadoutFor`): everyone a comm badge; one tricorder for their department; security a phaser (best of rifle / type-2 / type-1), senior officers (rank >= 4) a type-1; max four. Belt items hang on the hips / back (`holsterItem`); the NPC takes the matching item out during equipment use (`toolFor` + `toolScript`, ~50% of cycles), and the worn copy hides while it is in the hand.

## Player keys
**V** next item in hand (empty = zapper in madness), **Shift+V** phaser setting, **X** use the job (engineering tricorder: diagnose the nearest fault, repairs 30% faster while held; medical tricorder: vitals; hypospray / dermal: treat crew or yourself; science: map + room contents; security: life signs and impostors; geological: hull; atmospheric: air; badge: radio; PADD: duty menu; lamp: torch; extinguisher: puts out a fire alert; mop: trust), **left click** fire / swing, **T** throw (lands as a pick-up; **E** takes it back).

## Damage / stun profile (generated from `WEAPON_TABLE`)
dmg = hostile hit points, stun = seconds, knock = m/s push, noise = hearing radius m, wear = durability per use (ranged: charge per shot).

| item | mode | dmg | stun s | knock | range m | noise | cd s | wear | notes |
|---|---|---|---|---|---|---|---|---|---|
| tricorder_eng | melee | 0.35 | 0.6 | 1.5 | 1.4 | 5 | 0.8 | 30 |  |
| tricorder_eng | throw | 0.3 | 1 |  | 9 | 5 |  | 45 | break 0.35 |
| tricorder_med | melee | 0.35 | 0.6 | 1.5 | 1.4 | 5 | 0.8 | 30 |  |
| tricorder_med | throw | 0.3 | 1 |  | 9 | 5 |  | 45 | break 0.35 |
| tricorder_sci | melee | 0.35 | 0.6 | 1.5 | 1.4 | 5 | 0.8 | 30 |  |
| tricorder_sci | throw | 0.3 | 1 |  | 9 | 5 |  | 45 | break 0.35 |
| tricorder_sec | melee | 0.4 | 0.7 | 1.6 | 1.4 | 5 | 0.8 | 28 |  |
| tricorder_sec | throw | 0.3 | 1 |  | 9 | 5 |  | 40 | break 0.3 |
| tricorder_geo | melee | 0.35 | 0.6 | 1.5 | 1.4 | 5 | 0.8 | 30 |  |
| tricorder_geo | throw | 0.3 | 1 |  | 9 | 5 |  | 45 | break 0.35 |
| tricorder_atmo | melee | 0.35 | 0.6 | 1.5 | 1.4 | 5 | 0.8 | 30 |  |
| tricorder_atmo | throw | 0.3 | 1 |  | 9 | 5 |  | 45 | break 0.35 |
| commbadge | melee | 0.05 | 0.1 | 0.3 | 1.2 | 2 | 0.6 | 5 |  |
| commbadge | throw | 0.05 | 0.3 |  | 10 | 5 |  | 15 | break 0.1 |
| padd | melee | 0.3 | 0.5 | 1.2 | 1.4 | 6 | 0.7 | 25 |  |
| padd | throw | 0.25 | 0.8 |  | 10 | 5 |  | 40 | break 0.4 |
| phaser1 | melee | 0.2 | 0.3 | 0.8 | 1.3 | 4 | 0.7 | 6 |  |
| phaser1 | throw | 0.15 | 0.6 |  | 9 | 5 |  | 20 | break 0.15 |
| phaser1 | ranged:stun | 0 | 5 |  | 18 | 10 | 0.6 | 1 | charge 12 |
| phaser1 | ranged:kill | 1 | 2 |  | 18 | 10 | 0.6 | 2 | charge 12 |
| phaser1 | ranged:overload | 2 | 8 |  | 18 | 10 | 0.6 | all | radius 4 fuse 3 consumes, charge 12 |
| phaser2 | melee | 0.4 | 0.6 | 1.4 | 1.4 | 5 | 0.8 | 6 |  |
| phaser2 | throw | 0.3 | 0.8 |  | 8 | 5 |  | 20 | break 0.12 |
| phaser2 | ranged:stun | 0 | 7 |  | 24 | 12 | 0.45 | 1 | charge 30 |
| phaser2 | ranged:kill | 2 | 2 |  | 24 | 12 | 0.45 | 2 | charge 30 |
| phaser2 | ranged:overload | 3 | 10 |  | 24 | 12 | 0.45 | all | radius 5 fuse 3 consumes, charge 30 |
| phaser_rifle | melee | 0.8 | 1.2 | 3 | 1.8 | 7 | 1 | 4 |  |
| phaser_rifle | throw | 0.4 | 1 |  | 6 | 5 |  | 25 | break 0.1 |
| phaser_rifle | ranged:stun | 0 | 9 |  | 32 | 15 | 0.35 | 1 | charge 60 |
| phaser_rifle | ranged:kill | 2 | 3 |  | 32 | 15 | 0.35 | 2 | charge 60 |
| phaser_rifle | ranged:overload | 4 | 12 |  | 32 | 15 | 0.35 | all | radius 6 fuse 4 consumes, charge 60 |
| hypospray | melee | 0.1 | 6 | 0.2 | 1.2 | 2 | 1.5 | 10 | sedates |
| hypospray | throw | 0.05 | 0.4 |  | 8 | 5 |  | 20 | break 0.3 |
| dermal | melee | 0.2 | 0.4 | 0.8 | 1.3 | 3 | 0.7 | 8 |  |
| dermal | throw | 0.25 | 0.8 |  | 9 | 5 |  | 20 | break 0.15 |
| scalpel | melee | 0.6 | 0.2 | 0.3 | 1.1 | 2 | 0.5 | 6 |  |
| scalpel | throw | 0.3 | 0.2 |  | 7 | 5 |  | 10 | break 0.05 |
| hydrospanner | melee | 0.6 | 0.9 | 2.2 | 1.5 | 7 | 0.8 | 3 |  |
| hydrospanner | throw | 0.4 | 1.2 |  | 8 | 5 |  | 15 | break 0.05 |
| spanner | melee | 0.7 | 1 | 2.4 | 1.5 | 8 | 0.8 | 1 |  |
| spanner | throw | 0.5 | 1.2 |  | 9 | 5 |  | 5 | break 0.01 |
| plasma_torch | melee | 0.9 | 1.2 | 1 | 1.4 | 9 | 1 | 4 | burns |
| plasma_torch | throw | 0.4 | 1 |  | 6 | 5 |  | 20 | break 0.1 |
| toolbag | melee | 0.6 | 1.4 | 3 | 1.5 | 8 | 1.2 | 2 |  |
| toolbag | throw | 0.6 | 1.6 |  | 5 | 5 |  | 5 | break 0.02 |
| flashlight | melee | 0.4 | 0.7 | 1.6 | 1.4 | 6 | 0.7 | 4 |  |
| flashlight | throw | 0.3 | 0.8 |  | 9 | 5 |  | 25 | break 0.2 |
| extinguisher | melee | 1 | 1.6 | 3.2 | 1.5 | 9 | 1.4 | 2 |  |
| extinguisher | throw | 0.8 | 1.8 |  | 5 | 5 |  | 4 | break 0.05 |
| extinguisher | ranged:spray | 0 | 2.5 |  | 4 | 6 | 0.25 | 1 | charge 30, blinds |
| mop | melee | 0.3 | 0.9 | 2.6 | 2.2 | 5 | 1 | 2 |  |
| mop | throw | 0.2 | 0.6 |  | 5 | 5 |  | 5 | break 0.02 |
| cargo_hook | melee | 0.8 | 0.6 | 1.2 | 1.5 | 5 | 0.8 | 1 |  |
| cargo_hook | throw | 0.4 | 0.4 |  | 7 | 5 |  | 5 | break 0.01 |
| crowbar | melee | 1 | 1.2 | 3 | 1.7 | 9 | 1 | 1 |  |
| crowbar | throw | 0.6 | 1.2 |  | 7 | 5 |  | 5 | break 0.01 |
