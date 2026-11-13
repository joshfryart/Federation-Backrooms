# Hand-to-hand (Systems Nominal): grab, hold, shove, strike

Owner direction: fights aboard are **grappling and melee against people** — grabbing, holding, restraining, shoving, throwing off
balance, a punch or a swing with whatever tool is in your hand. **Not guns.** Phasers stay with security and the armory (stun is the
default setting). Nothing is gory: crew are hurt → dazed → stunned → knocked out and get up again. Nobody dies unless a lethal item
(a phaser set to kill) is deliberately used. A fight is never game over for the player either: you get knocked down, restrained or
written up.

`?mode=madness` (the old roguelike) is untouched: its zapper (click) and grapple hook (Q / right mouse) work as before; `G.combat` does
nothing there.

| file | what |
|---|---|
| `js/combat.js` | pure rules + data (node-testable): action table, fighters, outcome maths, injury model, grapple state machine, NPC reactions, consequences, armory gating, security responders |
| `js/grapple.js` | game glue (`G.combat = new Melee()`): controls, the procedural grapple lock, NPC behaviour in the world, security response, armory, the player's own hits, first-person hands |
| `js/combat-hud.js` | the combat HUD: a few stable DOM ids with minimal neutral CSS (for the HUD artist to restyle) |
| `tools/test-combat.mjs` | node unit tests + the browser block (both run from `tools/test.mjs`) |

Hooks into shared files (all one-liners): `js/main.js` (import, `G.combat = new Melee()`, `G.combat.tick(dt)` after `G.kit.tick`,
`P.slow *= P.cbSlow`, `fire()` → `primary()`, right mouse → `secondary(true)` before `fireGrapple`, `interact()` → `combat.interact()`,
prompt), `js/kit.js` (`apply()` sends phaser shots / throws on crew to `onKitHit`), `js/menus.js` (Tools → **Hands…** opens the
`hands` wheel from `wheelKids()`).

## Controls (Systems Nominal)

| input | does |
|---|---|
| **left mouse** | strike: jab, then a cross if you click again within 0.9 s. With a handheld in hand: swing it (its `WEAPON_TABLE` melee profile, shared durability — foldables crack). A charged phaser in hand fires instead (js/kit.js). |
| **right mouse (hold)** | grab the person in reach (1.35 m, in front). Keep holding: after ~1 s of steady control they are **restrained** (arms pinned). Let go of the button = release. No one in reach = block (guard). |
| left mouse while holding | grabbed → shove them off; restrained → **throw down** (on the deck, stunned ~3 s) |
| **C** while restrained | **subdue**: pin them until they pass out (works on a tired / dazed body; otherwise they fight harder) |
| walk while holding | drag them (0.55–0.62× speed, slower with a limp body); walls stop the body; a snag > 1.3 m loses the grip. Let go of a restrained / unconscious person **inside the brig** → detained there (4 min). |
| left / right mouse when grabbed from behind | elbow / twist — fills your break-free ring |
| quick wheel → Tools → **Hands…** | Grab · Release · Restrain · Subdue · Throw down · Fists up / Lower · Hands up |
| E on the armory arms locker | draw a type-1 phaser (see Armory) |

Stances: **relaxed** (default, hands hidden), **fists** (guard up; strikes / grabs put you here), **hands up** (back off / surrender:
fighters without a grudge calm down, negotiators thank you, security restrains you without the stun). Keys never collide with
E / G / R / X / T / V / Q / J / B / H / K / L / M / P / Tab / 1-9 / WASD / Space / Shift; C only means "subdue" while you are holding someone.

## Action table (`ACTIONS` in js/combat.js)

dmg = crew health (1.0 = unhurt; never below 0.05 without a lethal item); stun in seconds; knock in m/s; noise = hearing radius in m
(footsteps 7, sprint 15); acc = base hit chance before attacker / defender modifiers.

| action | kind | range m | windup s | recover s | stamina | dmg | stun s | knock | noise m | acc | clip |
|---|---|---|---|---|---|---|---|---|---|---|---|
| jab | strike | 1.25 | 0.12 | 0.3 | 6 | 0.1 | 0.4 | 0.6 | 5 | 0.82 | punch_jab |
| cross | strike | 1.3 | 0.24 | 0.5 | 11 | 0.2 | 0.8 | 1.4 | 6 | 0.7 | punch_cross |
| shove | shove | 1.3 | 0.15 | 0.45 | 9 | 0.02 | 0.5 | 3.2 | 4 | 0.8 | push |
| grab | grab | 1.2 | 0.25 | 0.5 | 8 | 0 | 0 | 0 | 3 | 0.68 | push |
| restrain | hold | 1 | 0.6 | 0.3 | 6 | 0 | 0 | 0 | 3 | 0.6 | interact |
| release | release | 1.2 | 0 | 0.3 | 0 | 0 | 0 | 0 | 1 | 1 | |
| drag | drag | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 1 | push |
| trip (throw down) | throw | 1.2 | 0.35 | 0.6 | 14 | 0.12 | 2.4 | 1.6 | 7 | 0.72 | push |
| subdue | ko | 1 | 1.2 | 0.6 | 18 | 0.05 | 6 (+30 s out) | 0 | 4 | 0.55 | crouch_idle |
| guard | guard | 0 | 0.05 | 0.25 | 4 | soaks 65% | | | 0 | 1 | |
| evade | evade | 0 | 0.05 | 0.5 | 10 | 55% dodge when sliding / moving fast | | | 2 | 1 | |

Improvised swings (`swingAction(profile)`): crew health = 0.32 × the handheld's hit points; windup 0.16 + 0.18·cd; recover 0.6·cd.
Examples: spanner 0.22 dmg / 1.0 s stun / range 1.5; pry bar 0.32 / 1.2 / 1.7; PADD 0.1 / 0.5; engineering tricorder 0.11 / 0.6 (can
snap); hypospray 0.03 but sedates (≥ 6 s).

**Success** (`chance`): acc + 0.12·(trained − trained) + 0.3·(build − build) + 0.05·fight tag − 0.1·stress; −0.15 if the attacker's
stamina < 25, +0.1 if the defender's is; +0.25 from behind (> ~110° off their facing), +0.15 if they were unaware, +0.3 if they are
held, +0.15 if dazed; stunned / out = always. Clamped 0.05..0.97. Damage ×(0.85..1.15)·√build, ×1.3 from behind, ×0.7 tired; stun ×1.4
from behind. A block (guard / their guard) soaks 65% of damage and stun. Rolls are `hash01(seed, action, attacker, defender, n)`:
deterministic per run.

**Fighters** (`fighter(person)`): build from the body (heavy 1.22, f 0.92, else 1.0); trained = security 1, rank ≥ 4 0.35, command
0.2; tags via `weightsOf` (js/voice.js `TAG_EFFECTS` combat weights: fight, flee, hide, help, call, freeze, talk, command, obey, improv).

**Injury** (`INJURY`): hurt below 0.7 health, out cold at ≤ 0.15 (18 s) or from a subdue (30 s), wakes dazed (4 s), regen 0.004/s.
Stun stacks (max + 35% of the new hit). `speedMul`: hurt 0.55 + 0.45·hp, dazed 0.4, stunned / out 0. `workMul`: hurt 0.6 + 0.4·hp,
else 0 — a repair job led by someone hurt loses that share of its progress; anyone stunned / out has a priority-2 `recovering`
sim override, which keeps them in place and suspends their repair job (js/repair.js `suspended`).

**Grapple** (`GRAPPLE`): idle → reach (0.25 s, a grab roll) → grabbed → held (restrained: ctrl ≥ 1 s with struggle < 0.55, or a forced
restrain roll) → released | thrown | broken. Struggle per second = want·(0.22 + 0.34·build ratio)·stamina factor (+0.12·their training
− 0.14·yours − 0.12 when restrained, +0.15 if you are spent), pulsed by seeded noise, bleeding 0.06–0.24/s; ≥ 1 breaks free. want by
reaction: fight / flee / defend 1, call 0.7, cower / watch 0.5, negotiate 0.4, freeze 0.2, out cold 0. Holding drains you 4/s grabbed,
2.5/s restrained (× their build ratio); struggling drains them 7/s. One grab at a time; no grab while carrying an item or pushing a cart.

## NPC behaviour (`react` + `Melee.npcStep`)

Scores from tags, department, rank, the social graph and the situation, + seeded jitter; delay 0.2–1.8 s (freezers slower, commanders
and security quicker).

| reaction | who | what they do |
|---|---|---|
| fight | victims: aggressive / reckless tags, security, outranking you, rivals | square up (guard pose), close in, jab / cross / shove; aggressive ones grab you from behind (3.6 s, then throw you down); quit when hurt (< 0.45 → flee), after 28 s, if you get > 14 m away, put your hands up, or once you are down ("Stay down.") |
| flee | panics / flees-to-cover / hides | run 9+ m away along real paths, then resume |
| cower | freezes / hides / stressed | crouch, hands up, for ~7 s after the last aggression |
| call | calls-it-in / takes-charge | "Security to my location!" → security response if it was unprovoked |
| defend | witnesses who are friends of the victim (strength), protective / medic-first, security | shove you, break your hold on their friend |
| negotiate | negotiates | step up, talk; calm in 6 s if you stop (+trust if your hands are up) |
| freeze | freezes | stand in shock 1.6–2.8 s, then re-roll |
| watch | bystanders | look on, then carry on |

When it is over they get up, walk back to their spot and resume (`opStart` at the equipment / a walk to `simTileFor`). Any pose is
handled: operators (`opEnd`), seated (the mesh comes back to its walkable anchor), walkers (walk stopped), haulers (the cart job ends on
`e.cower`, carried items dropped), repairers (sim override suspends the job, tool dropped).

**Cabin fever** (js/phases.js psychological mode, crisis or worse): every 110–200 s someone on your deck with an aggressive / reckless /
panicky / short-tempered tag snaps and attacks the nearest person; security is called for them. Subduing them is welcome; once knocked
out they wake up calm.

## Consequences (`consequence` → `applyConsequence`)

Severity: shove 0.3, grab 0.35, restrain 0.55, strike 0.7, throw 0.8, ko 1, phaser 0.9, lethal 3; a missed attempt counts 0.6×. Only
escalation counts (the same act twice within 20 s is not counted twice).

* **Unprovoked** (an innocent crew member): victim −(0.12 + 0.25·sev), each witness −(0.04 + 0.1·sev) (×1.6 friends of the victim, ×1.2
  same department), the victim's department hears half the time −(0.03 + 0.04·sev); repeat offences ×1.5 / ×2. Severity ≥ 0.55 (or a
  repeat): a `Duty.chain` line ("You struck Lt. X in the mess, unprovoked"), a deck-scoped **intruder** alert and a **security
  response**. Witnesses = bodies within 14 m in sight, or within the action's noise radius (half through walls), plus people the sim has
  in your room.
* **Self-defence** (they hit you first in the last 25 s): witnesses −0.01, no security.
* **Hostile** (cabin fever) / **saboteur** (`phases.saboteur`): witnesses +0.05 (subdued) / +0.02, all security +0.04, a chain line; the
  saboteur subdued (restrain / throw / ko / brig) clears the sabotage: `saboteur = null`, severity × 0.4, an auto intruder alert cleared.
* **Security response**: two security responders (guards first) get a priority-2 sim redirect to your room; their bodies home in on
  you along real paths, "Stand down!", stun you with their phaser if you are still violent (hit in the last 8 s or holding someone),
  otherwise just restrain you (hands up = no stun). Restrained 6–9 s, then released with a warning: chain line, `maxScore + 1`
  (a shift-end score penalty), `duty.stats.restrained`. If nobody reaches you in 70 s the report is logged instead (same penalty).
  A violent NPC gets the same treatment (stunned, restrained, then released by security).
* **Player hits**: HP −60 × health damage (jab ~6, cross ~12), knockback, stagger (0.45× speed), red edge flash; at ≤ 1 HP you are
  knocked down (12 HP, 4 s on the deck, the attackers stop) — never killed.

## Armory

The armory's arms locker (`weaponrack` prop, E within 2.6 m in the armory) hands out a type-1 phaser (stun). `canDraw`: a security
billet, the captain / XO (or `G.combatOrder` set by an order), or an alert of severity ≥ 4 (red) → authorised. Otherwise you can still
take it: every security crew member −0.08 trust and a chain line ("Drew a phaser from the armory without authority"). NPC security wear
their phasers (`loadoutFor`); responders take theirs out when they stun someone.

## HUD contract (for the HUD artist)

`js/combat-hud.js` injects `<style id="cb-style">` and one container; restyle freely (keep ids / classes / data attributes):

| id / class | meaning |
|---|---|
| `#cb-hud` | container (fixed, `pointer-events: none`, hidden outside Nominal play); `body.cb-engaged` while fighting / holding / guarding / in a stance |
| `#cb-stance.cb-chip[data-stance]` | stance chip: `relaxed` (hidden) / `fists` (text "Fists" or "Guard") / `handsup` |
| `#cb-ring[data-state]` + `.cb-ring-bg` / `.cb-ring-fg`, CSS var `--cb-struggle` (0..1) | grab / struggle ring at the crosshair: `reach`, `grabbed`, `held`, `grabbed-you` (you are held; fill = your break-free progress) |
| `#cb-target[data-state].on` · `.cb-name` · `.cb-bar > i` (width = health) · `.cb-pips > .cb-pip.on` (5 stun pips) | the person you hold / last hit / have in reach; state `ok`/`hurt`/`dazed`/`stunned`/`out`/`dead` |
| `#cb-restrained.on` (`.you` when it is you) | "RESTRAINED" marker |
| `#cb-hint.on` | one quiet control hint line when someone is in reach and nothing is going on; in a fight the controls go to the duty hint line (`G.hud2.setHint`) instead |
| `#cb-flash.on` | red edge flash while you are being hit |

## Tuning and tests

Tune the tables at the top of `js/combat.js` (`ACTIONS`, `INJURY`, `GRAPPLE`, `WANT_FREE`, `SEVERITY`, `LINES`) and `HP_SCALE` in
`js/grapple.js`; then `node tools/test-combat.mjs` (unit, < 1 s) and the full `node tools/test.mjs` (browser block `combat browser:` —
strike → reaction clip + stun + trust + witnesses + security; security restrains you and lets you go; grab an operator at a console →
held body follows the hold point → release → they resume; you get hit → HP / stagger / knock-down; madness zapper still fires).

**Open:** not played by hand (timings, struggle rates, hold distances want a real mouse); no IK (hands do not meet the held body
exactly); the held pose is an additive layer on `idle`; NPC-vs-NPC brawls only come from cabin fever; no gamepad bindings; the
"captain / XO order" for the armory is only the `G.combatOrder` flag (no order UI yet); sitting / kneeling NPCs stand up instantly when
grabbed (no get-up clip).
