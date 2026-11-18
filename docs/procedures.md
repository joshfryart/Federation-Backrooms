# Job modules: one mechanic per job (authoring guide)

The owner wants **701 unique jobs**: every duty loop and mission task gets a game of its own, with its own rules, input, win condition and
failure mode, modelled on what a person in that job really does. Reskinning an existing mini-game with new text does not count.

Each job is a small ES module in `js/jobs/<billet>__<slug>.js` built on a shared helper kit (`js/jobs/kit.js`). A generated registry
(`js/jobs/index.js`) maps the job's id to its module; `jobFor()` in `js/worksites.js` uses the module when one exists and otherwise falls back
to the old shared mechanics, so jobs can be authored in batches and merged safely.

Status: **30 of 701** jobs have a module (the pilot: 20 console, 10 in-room, every department). `node tools/check-jobs.mjs --report` prints
the current count.

You do not need to read the engine to author a module. This page, the kit's header comment and the 30 pilot modules are enough.

---

## 1. Where things are

| file | what |
|---|---|
| `js/jobs/kit.js` | helper kit: `define`, `machine`, `room`, keys, seeded random, canvas helpers |
| `js/jobs/<billet>__<slug>.js` | one job's module (you write these) |
| `js/jobs/index.js` | GENERATED registry. Never edit it; run `node tools/merge-jobs.mjs` |
| `js/jobs/host.js` | in-room host (engine): places a room job's sites and runs it inside the work-site UI |
| `tools/job-human.json` | the source notes for all 701 jobs: `human_steps`, `tools`, `what_makes_it_hard`, `ideal_interaction` |
| `tools/check-jobs.mjs` | validator (`--brief` prints what to author, `<files>` checks them, `--report` shows coverage) |
| `tools/merge-jobs.mjs` | rebuilds the registry and refuses collisions |
| `tools/jobcheck-lib.mjs` | the checks themselves, including the list of old mechanics a module must not duplicate (`BASE`) |

How a job finds its module: `js/duty.js` stamps every loop with `billet` and `jtype: 'loop'`, and every mission task with
`jtype: 'task:<mission>'`. The module's `job: { billet, label, type }` must match exactly; `label` is the loop's `label` or the task's `task`
string. The id is `jobId(billet, label, type)`, `'j'` plus 8 hex digits of FNV-1a over `billet|label|type`, and `define()` sets it for you.

## 2. The module interface

```js
import { define, machine, room, DIG, ARROW, SPACE, ENTER, ri, rf, pick, shuffle, clamp, txt, box, bar, lamp, COL } from './kit.js';
export default define({
  job: { billet: 'reactor', label: 'Watch core temps at high output', type: 'task:medical_relief' },   // exact, from --brief
  title: 'Core temperature crossing call',  // unique across all modules, at most 48 characters
  dept: 'engineering',                      // the billet's department (the validator says which)
  host: 'console',                          // 'console' = canvas overlay at the station; 'room' = done in the room at marked spots
  tool: 'Core temperature rail',            // console only: the name on the instruction card
  how: 'One sentence for the instruction card (30+ characters).',
  keys: ['Space call the crossing'],        // key labels for the card
  limit: 30,                                // seconds, 12 to 40 (calm mode adds 50 %)
  maxFaults: 3,                             // 2 to 5: this many faults fail the game
  fingerprint: { verb, input, win, fail, rule },   // section 4
  rush: 'The corner cut when the player rushes the job (10+ characters).',
  captions: { 'false call': 'false-alarm tone' },  // fault reason -> sound caption (captions setting)
  says: { 'false call': 'Fault line for room jobs.' }, // room only: fault reason -> the line in the message log
  item: 'flashlight',        // room only, optional: the handheld id it needs (js/handhelds.js); drawn at a supply point if missing
  siteName: 'Seam', verb: 'Check',   // room only: checklist words
  create(seed, opts) { const m = machine(this, seed, opts); /* ... */ return m; },
});
```

`create(seed, opts)` returns a state machine. `machine(this, seed, opts)` gives you the shared part:

| field / method | meaning |
|---|---|
| `m.state` | `'play'`, then `'win'`, `'fail'` or `'cancel'` |
| `m.t`, `m.limit` | the clock and the time limit (already ×1.5 when `m.calm`) |
| `m.strikes`, `m.maxStrikes` | faults so far and the cap; `m.fault(why)` adds one and fails the game at the cap |
| `m.win()`, `m.fail(why)` | end the game. A timeout calls `fail('time')` for you |
| `m.live(dt, away)` | call first in every tick/step: advances the clock, returns `false` when the game is over |
| `m.rnd` | the seeded random source (never use `Math.random`). Helpers: `ri(rnd,a,b)`, `rf`, `pick`, `shuffle` |
| `m.calm`, `m.cb` | calm mode (slower, wider windows) and the colour-blind palette flag |
| `m.ev(type, x)` | log an event (`m.fault` logs `strike` events with `why`) |
| `m.held` | an object for remembering held keys |
| `m.round`, `m.rounds` | optional: shown on the overlay's Round counter |

**Every module also defines:**

- `m.hint()` is the right play right now, used by auto-play tests. A console module returns `[[code, down], ...]` (for example
  `[['Space', true]]`, or `[['ArrowLeft', false]]` to release). A room module returns an input object (below).
- `m.bad()` is a wrong play that leads to a fail. A console module returns a key code, `[code, down]` or `null`; a room module returns an
  input object.
- `m.view()` returns plain JSON describing the seed's content. The validator checks that the same seed gives the same view and that
  different seeds give different views.

### Console modules (`host: 'console'`)

- `m.key(code, down)`: return `true` if the key is yours. Ignore `KeyJ / KeyH / KeyK / KeyL / KeyQ / KeyP / KeyB / Escape / Backspace`
  (the menus own them). Use `DIG(code)` for 1 to 9, `ARROW(code)` for `'U' | 'D' | 'L' | 'R'` (arrows and WASD), `SPACE(code)` and
  `ENTER(code)`. Hold keys arrive as `down = true` followed later by `down = false`.
- `m.tick(dt)`: start with `if (!m.live(dt)) return;`.
- `m.buttons()`: `[[code, label], ...]` for the on-screen buttons. They send the same codes, so mouse-only play works.
- `m.draw(c, W, H, P)`: draw on a 400 × 170 canvas. The UI has already painted the dark grid and the corner brackets. `P.good` and `P.bad`
  are the colours to use (blue and amber in colour-blind mode). Never use colour as the only cue; pair it with a shape (`lamp(c, x, y, r,
  col, 'triangle')`), a word or an outline. Helpers: `txt`, `box`, `bar(c, x, y, w, h, v, { band, mark, col })`, `lamp`, `wrapText`, `COL`.

### Room modules (`host: 'room'`)

Wrap the machine with `room(m, sites)`: `const m = room(machine(this, seed, opts), [{ name: 'Cabin 1 door', prop: 'airlock_doors' }, ...])`.
The host puts each site on a prop of that kind in the job's room, or on a free floor tile when the room has none. The player walks there
and faces it to work it. Sites are worked **in order**. Known props are the kinds in `js/worksites.js` (`SITE_DEFS` props, `SUPPLY`) plus
`console desk helm navstation opsstation commsstation sensorstation secdesk nursestation captain_chair bunk locker`.

`room()` adds `m.sites` (`{ name, prop, prog, done }`; set `prog` 0 to 1 yourself), `m.next` (the site to work), `m.cur(inp)` (the site
the player is working, or `null`; it logs `blocked` when they press E at the wrong one), `m.finish(i)` (completes a site; the last one wins)
and `m.released(inp)` (E was let go this frame; call it once per step).

- `m.step(dt, inp)`: start with `if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return;`.
  `inp = { at, hold, press, look, turn, swing, hasItem, away }`:
  `at` is the index of the site in reach and faced (-1 if none); `hold` means E is held; `press` means E went down this frame; `look` is the
  view yaw relative to where the player first faced this site, in radians, positive to the left (aim at things inside about ±0.5);
  `turn` is the absolute view turn speed in rad/s; `swing` is the signed yaw speed in rad/s, positive to the left.
  The host deals with `hasItem` and `away`, so you can ignore them.
- `m.panel(i)`: `{ label, value, bar (0..1), band?: [a, b] }` is the meter shown in the LCARS checklist for the site being worked.
- `m.prompt(i)`: the hint line, for example `'Hold [E] to pull the handle up to the test mark'`.
- `m.hint(frame)` and `m.bad(frame)` return input objects such as `{ at: m.next, hold: true, look: 0.2 }`. `frame` counts up, so you can
  alternate presses (`press: frame % 3 === 0`).

### Outcome (engine, you do not code this)

A win is a **proper** job (faster: 0.5× the time on a console, 0.05× on a room job when clean). A fail by faults or time still does the job,
**rushed**. Esc, `[J] stop working` or a phase change cancels: nothing happens and the job stays due. Rushing from the J menu never opens the
module; it prints your `rush` line. The instruction card shows once per module (`CFG.learned['job:<id>']`).

## 3. Rules every module must keep

1. **Import only `./kit.js`.** Do not use `createGame`, `createSiteRun`, `KINDS`, `jobgames` or `worksites`: delegating to an old mechanic
   is refused.
2. **No `Math.random`, clocks or DOM.** Use `m.rnd` and the `dt` you are given, so the game is deterministic per seed.
3. **Hinted play wins clean** (no faults) on seeds 1 to 25, both calm and normal, inside 85 % of the limit.
4. **Bad play fails** (`state 'fail'`): `bad()` must actually drive the game into its failure mode.
5. **Idle fails by itself** within the limit. A timeout counts; so does a fault model that idling triggers.
6. **Calm gives +50 % time** (`machine` does this) and should widen windows or slow things down (`m.calm`).
7. **Keep it short:** 60 to 150 lines (the hard cap is 220). The pilot modules are 30 to 70 dense lines.
8. **Content comes from the job.** Names, numbers, props and wording come from `human_steps`, `tools` and `ideal_interaction`.

## 4. The fingerprint (what makes a mechanic unique)

```js
fingerprint: {
  verb: 'call the crossing',   // 1 to 3 words: what the player DOES
  input: 'space',              // tokens joined by '+', see below
  win: 'three sustained warning crossings called promptly with no false alarms',
  fail: 'calling a transient spike, or letting a sustained crossing run uncalled',
  rule: 'One line for the card: what the player sees, what they press, and when.',
}
```

**Input tokens.** Console: `digits arrows arrows-hold enter space space-hold rhythm`. Room: `e-tap e-hold look turn swing rhythm`.
Use `arrows-hold` / `space-hold` when holding the key matters, `look` when aiming the view matters, `turn` / `swing` when the speed or
direction of the view's turn matters, and `rhythm` when timing to a beat matters. Token order does not matter.

**Distinctness check.** This runs against every other module and the 48 old mechanics. Two fingerprints are **near duplicates**, and the
module is refused, when they have the **same input token set** and any of these is true:
- the verb is the same (after lower-casing and stemming: `'tap test'` = `'tapping tests'`);
- the win conditions share 50 % or more of their meaningful words (Jaccard);
- the rules share 55 % or more of their words.

The checker only catches the obvious cases. The real test is whether a player would feel it is the same game, so read section 5.

**Good, distinct** (all pilot modules):

| job | verb · input | why it is its own game |
|---|---|---|
| reactor: watch core temps | call the crossing · space | judge whether a crossing lasts, ignore spikes |
| tchief: recover samples and team | count-in · space-hold | hold a switch, release exactly on a count |
| yeoman: captain's refreshment | counter-tilt · arrows-hold | lean a cup into bends ahead, slosh physics |
| deck: fuel the shuttles | coast-fill · e-hold | release early because the flow keeps going |
| ttech: coil maintenance | seat by feel · e-hold+turn | no band shown; stop when the screw goes stiff |
| cook: scrub the galley | one-way scrub · e-hold+swing | strokes only count in one direction; return with E up |

**Bad: these are reskins and must be redone.**
- *"Press the bed whose reading is out of range"* reworded as *"press the relay whose loss is out of spec"*: this is the old `vitals`
  (spot the odd one out with digits). Changing the nouns does not make it a new game.
- *"Hold E, release in the band"* with a new label (`'tension the strap'`, `'fill the tank'`): this is the old timing act. The deck fuel
  module only counts because the level **keeps rising after release** and the player has to learn the lag.
- Two jobs that both "pick the right option from 4 with digits" and differ only in what the options say. Change the verb, for example
  *match to every constraint on a tag*, *compare character by character*, or *sort into piles under a time limit*, and change the failure
  mode with it.

## 5. Designing a mechanic from the job notes

Run `node tools/check-jobs.mjs --brief <billet>` to print each unauthored job with its file name, `human_steps`, `tools`,
`what_makes_it_hard` and `ideal_interaction`. Then:

1. **Find the skill in `what_makes_it_hard`.** It is the game. Examples: "noticing when a report is stale" becomes a cross-examination;
   "stopping at the first firm resistance" becomes seating by feel.
2. **Pick the verb from `human_steps`**: listen, pull, pour, tag, weigh, tilt, seat, scrub one way, count in. Avoid verbs another module
   already uses (`--report` lists the input mix; read the fingerprints in `js/jobs/`).
3. **Choose the host.** Physical work with the body or a hand tool in the room is `room`. Screens, boards, forms and talking are `console`.
   Aim for about a third `room` overall.
4. **Turn the failure mode into a fault:** the real-world mistake from `human_steps` (often the "Mistake:" line).
5. **Win condition.** A small number of reps (3 to 5 items, 2 or 3 sites) that fit in 10 to 25 s of skilled play.
6. **Make the seed vary content** (numbers, order, which item is faulty) through `m.rnd`.
7. **Write `hint()` from the rule**, as a player who knows the rule would play. If hint() needs secret knowledge, make that knowledge visible
   on screen (or through the room panel) first.

## 6. Worked examples

### A. Console, judgement over time: reactor "Watch core temps at high output"

`js/jobs/reactor__watch-core-temps-at-high-output__medical_relief.js`. The notes say: read the gauge on each count and call out the moment
it passes the warning tick. The hard part is telling a real crossing from a flicker.

- **Content:** a precomputed schedule of segments, either short spikes (0.2 to 0.35 s) or sustained crossings (3.5 s), seeded.
- **Rule:** press Space once the reading has stayed over the tick for at least 0.3 s. A spike, or a reading under the tick, is
  `fault('false call')`. More than 2 s over without a call is `fault('missed')`.
- **Win:** three crossings called. **Idle:** the misses reach the cap, so it fails. **Bad:** `bad()` returns `'Space'` during a spike.
- `hint()` returns `[['Space', true]]` once the reading has been over for 0.5 s. `draw()` shows a vertical rail, the WARN tick, the reading
  in K and a "time over the tick" bar.

### B. Console, holding a key: tchief "Recover samples and team"

`js/jobs/tchief__recover-samples-and-team__survey.js`. Hold the recall switch while the pad counts arrivals, and let go when the count
matches the roster line.

- `key('Space', down)` tracks `m.held.S`. When the key goes **up**: below the count it is `fault('stranded')`; on the count, the line is
  done.
- `tick`: while held, arrivals tick in after seeded gaps of 0.5 to 1.1 s. Once the count is met, holding past the grace time is
  `fault('buffer strain')`.
- `hint()` returns `[['Space', got < need]]` (press, then release on the count). `bad()` returns `['Space', false]` after the first
  arrival, so the release comes too early.

### C. Room: guard "Patrol round of crew decks"

`js/jobs/guard__patrol-round-of-crew-decks.js`. Pull each door handle: a sound latch takes the full test pull; a faulty one gives part way
and must be released at once.

```js
const m = room(machine(this, seed, opts), [{ name: 'Cabin 1 door', prop: 'airlock_doors' }, { name: 'Cabin 2 door', prop: 'bunk' }, ...]);
m.step = (dt, inp = {}) => {
  if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const d = m.doors[m.next];
  if (inp.hold) { d.pull += d.rate * dt; /* a faulty latch gives at d.giveAt; holding > 0.5 s after -> fault('flew open') */ }
  if (rel) { /* gave -> finish; full pull on a sound latch -> finish; let go early -> fault('untested') */ }
  s.prog = d.pull * 0.9;
};
m.hint = () => ({ at: m.next, hold: !d.gave && d.pull < 1 });   // the player sees GIVES on the panel
m.panel = (i) => ({ label: d.gave ? 'GIVES' : 'Pull', value: ..., bar: d.pull, band: [0.97, 1] });
```

The host turns the four sites into markers on the room's doors, lockers or floor, pins the next one, shows the checklist with `panel()`, and
prints `prompt()` on the hint line.

## 7. Validator workflow

```sh
node tools/check-jobs.mjs --brief deck,pilot                 # 1. what to author (file names + notes)
# 2. write js/jobs/<file>.js for each job in your batch
node tools/check-jobs.mjs js/jobs/deck__*.js js/jobs/pilot__*.js   # 3. must print "N/N modules OK"
node tools/merge-jobs.mjs                                     # 4. registry (refuses collisions); commit js/jobs/index.js with the modules
node tools/test-jobgames.mjs                                  # 5. node suite (registry, jobFor, room modules through the host)
```

`check-jobs` checks each file on its own: shape, file name, the job existing in `duties.json`, the department, item and props, import and
source rules, fingerprint distinctness against all modules on disk and the old mechanics, then auto-play (25 seeds × calm/normal hinted wins,
bad play fails, idle ends, determinism, seed variety, calm time, cancel, reserved keys, `buttons()`/`draw()` on a mock canvas or
`panel()`/`prompt()`). Each file takes about 10 to 60 ms. `--report` shows coverage per department and the input-scheme mix (keep any one
scheme under 25 %). `--report --missing` lists every job still without a module.

**Parallel batches.** Every author checks against the modules already on disk. Two batches written at the same time can still collide;
`merge-jobs` catches that at merge time. Merge batches one at a time. If a merge is refused, the later batch changes its verb, win condition
or input, re-runs `check-jobs`, then merges.

## 8. Honest limits

- Verified headless only: node auto-play for all 30 pilots, and a browser test (`node tools/test.mjs --only jobmodules`) that plays three
  of them through the real UI with hinted input. **Nobody has play-tested them by hand.** Pacing, readability and difficulty are untested.
- The fingerprint check is lexical. It cannot prove two games feel different; reviewers should still read new modules.
- Room modules use only E, the view, and walking between the sites; they cannot react to the player's footsteps. The canvas is 400 × 170.
- The registry loads every module up front (about 700 small files when complete). That is fine for a static site, but it could be bundled
  later.
