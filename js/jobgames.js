// Job mini-games (Systems Nominal): every duty round / mission task done "properly" at a station plays a short, keyboard-driven mini-game
// tied to what the job actually is (a ward round reads patient monitors, a course plot steers round hazards, a badge check admits or turns
// people away), after a one-time instruction card for that tool. Pure logic (no DOM, no three.js), node-testable (tools/test-jobgames.mjs);
// the overlay is js/jobgame-ui.js, the glue is js/main.js startJob().
//   gameFor(item)                 -> tool { id, name, kind, how, keys, theme?, dept? } | null   the mini-game a duty loop / mission task plays:
//                                    keyed on its label (loop.label / task.task), room, sys and spot (OVERRIDES, then RULES, then the spot)
//   toolFor(spot)                 -> the station's own tool (the spot fallback; null: a place, not a station: no mini-game, the job just runs)
//   createGame(kind, seed, opts)  -> game { kind, state: 'play'|'win'|'fail'|'cancel', strikes, maxStrikes, t, limit, key(code, down), tick(dt),
//                                    view(), result(), hint() -> [[code, down], ...] the right play now (tests / auto-play), bad() -> a key that
//                                    strikes now (or null) }
//       opts: { calm, theme }  calm: slower timers / drift, wider bands, +50 % time (reading, not reflexes); theme: content set (js tool.theme)
//   outcome(game)                 -> { quality, timeMul, perfect, label }  what the result does to the job (win: proper and faster; fail: rushed;
//                                    the job is always done, a fail never blocks the run). Cancel (Esc) does nothing at all.
//   rushNote(tool, seed)          -> one line: the corner you cut when you rush the job (no game: rushing is never a block)
//   coverage(duties)              -> { total, kinds: {kind: n}, tools, missing: [...], share }   per-kind counts over every loop + mission task
//   learnedStore(get, set)        -> { has(id), mark(id), reset(), list() }  which tools the player has been shown (CFG.learned, fb_cfg)
// Every game ends by itself: a timer (limit) or strikes turn it into a fail, so nothing can wait forever.
import { mulberry32 } from './data.js';

// ---- the mini-game kinds: rules + the keys they use (none of J/H/K/L/Q/P/B, which the menu router keeps). dept: whose job it is
export const KINDS = {
  sequence: { title: 'Console sequence', limit: 14, strikes: 3, keys: ['1', '2', '3', '4'], rule: 'Key in the highlighted code, one symbol at a time.' },
  wires: { title: 'Junction wiring', limit: 18, strikes: 3, keys: ['↑', '↓', '1', '2', '3', '4'], rule: 'For each loose lead on the left, press the number of the terminal with the same colour and mark.' },
  dial: { title: 'Pressure valve', limit: 16, strikes: 3, keys: ['Space'], rule: 'Press Space while the needle is inside the band. Three good bleeds and it holds.' },
  calibrate: { title: 'Calibration', limit: 16, strikes: 0, keys: ['←', '→', 'A', 'D'], rule: 'Hold ← / → to keep the marker on the drifting reading until the meter fills.' },
  // medical
  vitals: { dept: 'medical', title: 'Vitals triage', limit: 18, strikes: 3, keys: ['1', '2', '3', '4'], rule: 'Four beds, normal ranges along the top. Press the bed whose reading is out of range. Three rounds.' },
  hypo: { dept: 'medical', title: 'Hypospray dose', limit: 18, strikes: 3, keys: ['←', '→', '↑', '↓', 'Space'], rule: 'Set the dose on the chart: ← / → one mg, ↑ / ↓ five mg, Space to give it. Three patients.' },
  tray: { dept: 'medical', title: 'Sterile tray check', limit: 16, strikes: 3, keys: ['1', '2', '3', '4', '5', '6'], rule: 'Compare the tray with its layout card: press the slot that is empty or holds the wrong instrument.' },
  meds: { dept: 'medical', title: 'Controlled-meds count', limit: 20, strikes: 3, keys: ['1 – 9'], rule: 'Count the named drug in the drawer (ignore the others) and key the count. The manifest number may be wrong.' },
  counsel: { dept: 'medical', title: 'Counselling session', limit: 24, strikes: 2, keys: ['1', '2', '3'], rule: 'Read what they say and choose the reply that listens and helps. Three conversations.' },
  // engineering
  power: { dept: 'engineering', title: 'Power routing', limit: 18, strikes: 3, keys: ['↑', '↓', '←', '→', 'Enter'], rule: 'Move load between the reserve and each bus until every bus matches its demand mark, then Enter to route.' },
  bench: { dept: 'engineering', title: 'Bench test', limit: 18, strikes: 3, keys: ['1 pass', '2 reject'], rule: 'Each part shows its reading and its spec. 1 passes it, 2 rejects it. Five parts.' },
  // science
  tune: { dept: 'science', title: 'Signal sweep', limit: 20, strikes: 3, keys: ['←', '→', 'Space'], rule: 'Hold ← / → to sweep the tuner; the strength meter rises near the signal. Space locks it when the meter is full. Three signals.' },
  classify: { dept: 'science', title: 'Contact classification', limit: 18, strikes: 3, keys: ['1', '2', '3', '4'], rule: 'Read the contact (size, emission, motion) and press the class in the legend that matches. Four contacts.' },
  // security
  badge: { dept: 'security', title: 'ID check', limit: 18, strikes: 3, keys: ['1 admit', '2 deny'], rule: 'Read the access rule, then each badge: department, clearance and expiry. 1 admits, 2 turns them away. Five people.' },
  doorlog: { dept: 'security', title: 'Door-log audit', limit: 18, strikes: 3, keys: ['1 – 6'], rule: 'Only the listed crew may open the restricted door. Press the log line where someone else did. Two logs.' },
  // galley / hydroponics
  cook: { dept: 'galley', title: 'Galley range', limit: 20, strikes: 3, keys: ['1', '2', '3'], rule: 'Three pans cook at their own pace. Press a pan\'s number while its bar is in the DONE window. Too early is raw; too late burns.' },
  nutrient: { dept: 'galley', title: 'Nutrient mix', limit: 18, strikes: 3, keys: ['↑', '↓', '←', '→', 'Enter'], rule: 'Dose each feed line to the bed\'s recipe from the stock tank, then Enter to mix. Two beds.' },
  fresh: { dept: 'galley', title: 'Stock rotation', limit: 16, strikes: 3, keys: ['1 – 5'], rule: 'Check the date: press the item past its use-by day. Three shelves.' },
  // cargo / stores
  manifest: { dept: 'cargo', title: 'Manifest match', limit: 16, strikes: 3, keys: ['1', '2', '3', '4'], rule: 'Find the crate whose code matches the manifest line exactly. Four lines.' },
  loadbal: { dept: 'cargo', title: 'Load balance', limit: 16, strikes: 3, keys: ['←', '→'], rule: 'Stow each crate port (←) or starboard (→). Keep the two sides within the trim limit. Six crates.' },
  // bridge / helm / comms
  course: { dept: 'bridge', title: 'Course plot', limit: 18, strikes: 3, keys: ['↑', '↓', '←', '→'], rule: 'Step the plot to each waypoint in turn. Plotting into a hazard is a fault. Two legs.' },
  decode: { dept: 'bridge', title: 'Signal decode', limit: 18, strikes: 3, keys: ['1', '2', '3', '4'], rule: 'Static flips one pulse. Press the codebook message the received pattern is closest to. Three messages.' },
  station: { dept: 'bridge', title: 'Station keeping', limit: 20, strikes: 0, keys: ['↑', '↓', '←', '→'], rule: 'A current pushes the ship off its mark. Hold the arrows to thrust back into the box and stay there until the hold meter fills.' },
  burn: { dept: 'bridge', title: 'Braking burn', limit: 22, strikes: 3, hold: true, keys: ['Space (hold)'], rule: 'Hold Space to fire the braking thrusters. Reach the marker at a speed inside the green band. Too fast: go round again; stalled short: a fault. Three approaches.' },
  fix: { dept: 'bridge', title: 'Position fix', limit: 18, strikes: 3, keys: ['1', '2', '3', '4'], rule: 'Three star bearings are drawn. Press the marked position where all three lines cross. Three fixes.' },
  coords: { title: 'Beam coordinates', limit: 22, strikes: 3, keys: ['↑', '↓', '←', '→', 'Enter'], rule: 'Dial the lock to the target coordinates (↑ / ↓ pick an axis, ← / → step it); the target drifts as the ship moves. Enter energises. Two transports.' },
  // paperwork / command (no single department: the theme comes from the job)
  form: { title: 'Report form', limit: 22, strikes: 3, keys: ['↑', '↓', '←', '→', 'Enter'], rule: 'Fill each field from the readings on the left (↑ / ↓ pick a field, ← / → change it), then Enter to file. Two reports.' },
  roster: { title: 'Roster assignment', limit: 22, strikes: 3, keys: ['1 – 5'], rule: 'Fill each post with someone who holds its qualification and is free: not on leave, sick or already on watch.' },
  queue: { title: 'Priority queue', limit: 20, strikes: 3, keys: ['1 – 5'], rule: 'Work the list in order: safety first, then mission, then routine; oldest first inside each. Press the next item to take.' },
  verify: { title: 'Backup verify', limit: 20, strikes: 3, keys: ['1 – 8', 'Enter'], rule: 'Compare each block\'s source and copy checksum. Flag (1 – 8) every block that differs, then Enter to re-send. Two volumes.' },
  pa: { title: 'Shipwide announcement', limit: 20, strikes: 3, keys: ['1 – 6', 'Space'], rule: 'Select the decks the message is for (1 – 6), then Space to broadcast while the channel shows CLEAR. Two announcements.' },
  schedule: { title: 'Schedule slot', limit: 22, strikes: 3, keys: ['←', '→', 'Enter'], rule: 'Slide each block (← / →) into free time inside its window, then Enter to book it. Three blocks.' },
  sign: { title: 'Log sign-off', limit: 20, strikes: 3, keys: ['1 sign', '2 query'], rule: 'An entry is complete with a time later than the line above, a reading inside its limits (or a note) and initials. 1 signs it, 2 queries it. Five entries.' },
  trend: { title: 'Log trend review', limit: 18, strikes: 3, keys: ['1 – 6'], rule: 'Read the logged trace: press the segment where it first left its limits. Three logs.' },
  // third pass (docs/job-audit.md "Second pass: weak and mismatched"): spoken briefs, decisions, flying, guard posts, instrument runs, triage, standby
  brief: { title: 'Verbal brief', limit: 22, strikes: 3, keys: ['1 – 4'], rule: 'Turn to the right person (1 – 4), give your items most urgent first (out of limits, then changed since last report, then steady, top to bottom), then listen to the read-back and press the line they got wrong.' },
  decide: { title: 'Command decision', limit: 20, strikes: 3, keys: ['1', '2', '3'], rule: 'Each option shows what it costs against two limits. Press the option that stays inside both limits with the most value. Three decisions.' },
  fly: { dept: 'bridge', title: 'Flight manoeuvre', limit: 24, strikes: 3, hold: true, keys: ['← / → hold', '↑ / ↓ hold'], rule: 'Hold ← / → to turn onto the heading bug and ↑ / ↓ to set the throttle so the speed sits in the green band; hold both until the leg meter fills. Past the red line is a fault.' },
  post: { dept: 'security', title: 'Guard post', limit: 22, strikes: 3, keys: ['1 admit', '2 refuse', '3 hold'], rule: 'People walk up to the door; read them when they reach the line. 1 admits and logs them, 2 refuses (wrong department, low clearance, expired, or a tailgater with no swipe), 3 holds a transfer whose orders are not signed for today. Nobody walks past you.' },
  assay: { dept: 'science', title: 'Instrument run', limit: 22, strikes: 3, keys: ['←', '→', 'Enter', '1 – 4'], rule: 'Set the run to the protocol value (← / →) and Enter to start it; wait for the trace, then press the reference it matches. Two runs.' },
  triage: { dept: 'medical', title: 'Triage sort', limit: 22, strikes: 3, keys: ['↑', '↓', '1 red', '2 yellow', '3 green'], rule: 'Walking wounded are green (3). Breathing over 30, no radial pulse, refill over 2 s or not obeying is red (1). Everyone else is yellow (2). Tag everyone (↑ / ↓ picks), then re-tag anyone whose readings change.' },
  standby: { title: 'Standby watch', limit: 24, strikes: 3, keys: ['1', '2', '3'], rule: 'Stay ready with your hands still: lamp tests and calls for other stations are not yours. When your call comes, press the action it asks for (1 – 3) before its lamp times out. Two calls.' },
};
// ---- the station / tool a job uses: name, mini-game, one-line how-to (shown once, on the instruction card). theme: content set for the game
const TOOL = (id, name, kind, how, theme) => ({ id, name, kind, how, keys: KINDS[kind].keys, ...(theme ? { theme } : {}), ...(KINDS[kind].dept ? { dept: KINDS[kind].dept } : {}) });
export const TOOLS = {
  // the stations themselves (the spot fallback)
  console: TOOL('console', 'Station console (LCARS panel)', 'sequence', 'Consoles take a short access code. The panel lights the next symbol; press its number.'),
  desk: TOOL('desk', 'Desk terminal', 'sequence', 'Log entries are signed with a code. Press the number under each lit symbol in order.'),
  captain_chair: TOOL('captain_chair', 'Command chair arm panel', 'sequence', 'The arm panel takes an authorisation code: press the numbers of the lit symbols in order.'),
  holocube: TOOL('holocube', 'Holo-emitter control', 'calibrate', 'Hold the emitter matrix on the drifting carrier: hold ← / → to stay on the reading until the meter fills.'),
  pad: TOOL('pad', 'Transporter pattern lock', 'calibrate', 'Keep the targeting scanner on the drifting pattern: hold ← / → until the lock meter fills.'),
  lift: TOOL('lift', 'Turbolift service panel', 'sequence', 'The service panel wants its diagnostic code: press the lit symbols in order.'),
  junction: TOOL('junction', 'Maintenance junction (ODN relay)', 'wires', 'Pull the panel, then re-seat each loose lead into the terminal with the same colour and mark.'),
  door: TOOL('door', 'Door control panel', 'wires', 'Behind the door panel: match each lead to the terminal with the same colour and mark.'),
  corridor: TOOL('corridor', 'Corridor relay box', 'wires', 'Open the wall relay box and match each lead to its terminal.'),
  warpcore: TOOL('warpcore', 'Warp core coolant valve', 'dial', 'Bleed coolant pressure: tap Space when the needle crosses the band. Too early or late spikes it.'),
  replicator: TOOL('replicator', 'Replicator matter-stream valve', 'dial', 'Purge the matter stream: tap Space while the needle is in the band.'),
  stove: TOOL('stove', 'Galley range', 'cook', 'Three pans on the range: pull each one (its number) while its bar sits in the DONE window.'),
  sink: TOOL('sink', 'Reclamation valve', 'dial', 'Flush the reclamation line: tap Space while the needle is in the band.'),
  workbench: TOOL('workbench', 'Workbench test rig', 'bench', 'Each part on the rig shows a reading next to its spec: 1 passes it, 2 rejects it.', 'eng'),
  biobed: TOOL('biobed', 'Biobed monitors', 'vitals', 'Four patient monitors and the normal ranges: press the bed with the reading out of range.'),
  locker: TOOL('locker', 'Stores scanner', 'manifest', 'Match the manifest line: press the crate whose code is exactly the same.', 'stores'),
  tree: TOOL('tree', 'Hydroponic nutrient feed', 'nutrient', 'Dose each feed line from the stock tank to the bed recipe, then Enter to mix.'),
  table: TOOL('table', 'Mess table', 'counsel', 'Sit with someone and listen: choose the reply that listens and helps.'),
  counter: TOOL('counter', 'Galley counter', 'cook', 'Plate each pan (its number) while its bar sits in the DONE window: too early is raw, too late burns.'),
  // what the job is (gameFor: chosen by label / room / sys)
  vitals: TOOL('vitals', 'Biobed monitors', 'vitals', 'Four patient monitors and the normal ranges: press the bed with the reading out of range.'),
  hypo: TOOL('hypo', 'Hypospray', 'hypo', 'Dial the dose on the chart (← / → 1 mg, ↑ / ↓ 5 mg) and press Space to give it.'),
  tray: TOOL('tray', 'Instrument tray', 'tray', 'Check the tray against its layout card: press the slot that is empty or wrong.'),
  meds: TOOL('meds', 'Controlled-meds drawer', 'meds', 'Count the named drug in the drawer and key the number. Ignore the other vials.'),
  counsel: TOOL('counsel', 'Counselling', 'counsel', 'Listen: choose the reply (1 – 3) that takes them seriously and helps.'),
  emh: TOOL('emh', 'Medical hologram matrix', 'calibrate', 'Hold the hologram matrix on its drifting carrier (← / →) until the stability meter fills.'),
  scanner: TOOL('scanner', 'Medical scanner', 'tune', 'Sweep the scanner (← / →) to the patient\'s signal and lock it with Space when the meter is full.'),
  power: TOOL('power', 'EPS load board', 'power', 'Move load between the reserve and each bus (↑ / ↓ pick, ← / → move) until each matches its mark; Enter routes it.'),
  valve: TOOL('valve', 'Coolant loop valve', 'dial', 'Bleed the loop: tap Space when the needle crosses the band.'),
  bench: TOOL('bench', 'Workbench test rig', 'bench', 'Each part on the rig shows a reading next to its spec: 1 passes it, 2 rejects it.', 'eng'),
  preflight: TOOL('preflight', 'Preflight checklist', 'bench', 'Walk the craft: each item shows a reading and its limit. 1 passes it, 2 grounds it.', 'craft'),
  armscheck: TOOL('armscheck', 'Charger test rack', 'bench', 'Each charger shows its held charge against spec: 1 passes it, 2 pulls it.', 'arms'),
  fieldtest: TOOL('fieldtest', 'Force-field emitter test', 'bench', 'Each emitter shows its field strength against spec: 1 passes it, 2 flags it.', 'field'),
  coils: TOOL('coils', 'Transporter coil rig', 'bench', 'Each coil shows its wear reading against spec: 1 keeps it, 2 swaps it.', 'coil'),
  galleytest: TOOL('galleytest', 'Galley equipment test', 'bench', 'Each unit shows its test reading against spec: 1 passes it, 2 tags it out of service.', 'galley'),
  labtest: TOOL('labtest', 'Lab instrument check', 'bench', 'Each instrument shows its reading on the reference standard: 1 passes it, 2 sends it for calibration.', 'lab'),
  sensors: TOOL('sensors', 'Sensor tuner', 'tune', 'Sweep the band (← / →): the strength meter rises near the signal. Space locks it when the meter is full.'),
  comms: TOOL('comms', 'Comms tuner', 'tune', 'Sweep the band (← / →) for the carrier, Space to lock when the strength meter is full.'),
  classify: TOOL('classify', 'Sensor contact board', 'classify', 'Read each contact\'s size, emission and motion, then press the matching class in the legend.'),
  samples: TOOL('samples', 'Sample analyser', 'classify', 'Read each sample\'s markers, then press the matching class in the legend.', 'bio'),
  badge: TOOL('badge', 'Badge reader', 'badge', 'Check each badge against the posted rule: department, clearance, expiry. 1 admits, 2 denies.'),
  doorlog: TOOL('doorlog', 'Door log', 'doorlog', 'Read the log: press the line where someone not on the list opened the restricted door.'),
  cook: TOOL('cook', 'Galley range', 'cook', 'Three pans on the range: pull each one (its number) while its bar sits in the DONE window.'),
  nutrient: TOOL('nutrient', 'Hydroponic nutrient feed', 'nutrient', 'Dose each feed line from the stock tank to the bed recipe, then Enter to mix.'),
  fresh: TOOL('fresh', 'Stores date check', 'fresh', 'Today\'s date is on the shelf label: press the item past its use-by day.'),
  manifest: TOOL('manifest', 'Cargo manifest scanner', 'manifest', 'Match the manifest line: press the crate whose code is exactly the same.', 'cargo'),
  loadbal: TOOL('loadbal', 'Load-trim board', 'loadbal', 'Stow each crate port (←) or starboard (→) and keep the deck in trim.'),
  course: TOOL('course', 'Helm plot', 'course', 'Step the course (arrow keys) to each waypoint; never plot through a hazard.'),
  decode: TOOL('decode', 'Comms decoder', 'decode', 'Match the received pulse pattern to the closest codebook message (1 – 4). Static flips one pulse.'),
  signoff: TOOL('signoff', 'Log signature pad', 'sign', 'Read each entry before you put your name to it: sign the complete ones, query the rest.'),
  trim: TOOL('trim', 'Reactor output trim', 'calibrate', 'Keep the output marker on the drifting demand: hold ← / → until the steady-output meter fills.'),
  printer: TOOL('printer', 'Replicator pattern console', 'sequence', 'Key in the pattern code for the job, symbol by symbol, to start the print.'),
  coldstart: TOOL('coldstart', 'Reactor start sequence', 'sequence', 'The start-up sequence is a fixed code: key each lit symbol in order or the start aborts.'),
  transporter: TOOL('transporter', 'Transporter pattern lock', 'calibrate', 'Keep the targeting scanner on the drifting pattern: hold ← / → until the lock meter fills.'),
  // flying, transporter targeting, paperwork (the theme of each comes from the job's label: themeFor)
  station: TOOL('station', 'Helm station-keeping', 'station', 'The ship drifts on the current: hold the arrow keys to thrust back into the box and hold it there.'),
  burn: TOOL('burn', 'Helm thruster control', 'burn', 'Hold Space to brake; let go to coast. Arrive at the marker slow, inside the green band.'),
  fix: TOOL('fix', 'Navigation fix board', 'fix', 'Three reference stars, three bearing lines: the ship is where all three cross.'),
  beam: TOOL('beam', 'Transporter targeting', 'coords', 'Dial each axis of the lock onto the target coordinates; they drift with the ship. Enter energises.'),
  report: TOOL('report', 'Report form', 'form', 'Copy the figures from the readings into the form, set the status and the addressee, Enter files it.'),
  roster: TOOL('roster', 'Duty roster', 'roster', 'Each post needs its qualification and someone who is free. Pick the person for the highlighted post.'),
  queue: TOOL('queue', 'Priority queue', 'queue', 'Safety before mission before routine, oldest first within each: take the items in that order.'),
  backup: TOOL('backup', 'Backup and verify', 'verify', 'Flag each block whose copy checksum differs from the source, then Enter re-sends them.'),
  pa: TOOL('pa', 'Shipwide PA', 'pa', 'Pick the decks the announcement is for, wait for a CLEAR channel and press Space to speak.'),
  schedule: TOOL('schedule', 'Schedule board', 'schedule', 'Slide each block into free time inside its window and book it with Enter.'),
  trend: TOOL('trend', 'Log trend viewer', 'trend', 'Find where the logged reading first left its limits: press that segment.'),
  // third pass: what the weak / mismatched jobs really are (spoken briefs, decisions, flying, posts, instrument runs, triage, standby)
  brief: TOOL('brief', 'Verbal brief', 'brief', 'Face the person you report to, give your items most urgent first, then listen to them read it back and catch the wrong figure.'),
  decide: TOOL('decide', 'Decision board', 'decide', 'Weigh each option against the two limits on the board: take the best one that stays inside both.'),
  fly: TOOL('fly', 'Helm flight controls', 'fly', 'Hold ← / → to bring the heading onto the bug, ↑ / ↓ to set the throttle, and hold the leg until its meter fills.'),
  post: TOOL('post', 'Door post', 'post', 'Stand the door: read each person as they reach the line; admit and log, refuse a bad badge or a tailgater, hold a transfer with no signed orders.'),
  assay: TOOL('assay', 'Assay analyser', 'assay', 'Dial the run to the protocol value and start it; when the trace is drawn, press the reference it matches.', 'assay'),
  bloodpanel: TOOL('bloodpanel', 'Blood analyser', 'assay', 'Set the analyser to the panel protocol, run the sample and match the marker trace to a reference profile.', 'blood'),
  culture: TOOL('culture', 'Culture reader', 'assay', 'Set the incubation step, run the plate and match the growth curve to the organism references.', 'culture'),
  deepscan: TOOL('deepscan', 'Array integration', 'assay', 'Set the integration time, run the scan and match the return to the reference signatures.', 'scan'),
  coretest: TOOL('coretest', 'Stress-test rig', 'assay', 'Set the test load, run it and read which unit the trace says is failing.', 'diag'),
  selftest: TOOL('selftest', 'Thruster self-test', 'assay', 'Set the test pulse, fire the self-test and read which thruster the response trace says is weak.', 'thrusters'),
  loadtest: TOOL('loadtest', 'Load test rig', 'assay', 'Set the test weight, run the load and read the hold trace against the references.', 'lift'),
  matrix: TOOL('matrix', 'Hologram self-test', 'assay', 'Set the test level, run the matrix self-test and read the result against the fault references.', 'matrix'),
  sensorcal: TOOL('sensorcal', 'Array calibration run', 'assay', 'Set the reference star channel, run the calibration and read the drift trace against the references.', 'spectrum'),
  fieldpulse: TOOL('fieldpulse', 'Field pulse test', 'assay', 'Set the pulse strength, fire the test and read which emitter the trace says is weak.', 'field'),
  triage: TOOL('triage', 'Triage tags', 'triage', 'Read each casualty (walking, breathing, pulse, refill, obeying), tag red / yellow / green, and re-tag when they change.'),
  standby: TOOL('standby', 'Standby board', 'standby', 'Keep watch with your hands still; when your call comes, press the action it asks for before the lamp times out.'),
  aim: TOOL('aim', 'Array aiming', 'calibrate', 'Keep the array on the moving target: hold ← / → to stay on it until the lock meter fills.', 'aim'),
  chartcheck: TOOL('chartcheck', 'Chart point check', 'bench', 'Each updated chart point shows its offset against the tolerance: 1 accepts it, 2 sends it back.', 'chart'),
};
TOOLS['command chair'] = TOOLS.captain_chair;
export function toolFor(spot) { return (spot && TOOLS[spot]) || null; }

// ---- variety inside a kind, keyed by the job: a theme (content set) from the label's words, else the room, else a hash of the label. Two jobs of
//      the same kind get different readings / posts / volumes / hazards / doors; the per-run seed then varies the round content on top.
export const labelHash = (s) => { let h = 2166136261; for (const ch of String(s || '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const DEPT_RE = [[/sickbay|medical|patient|casualt|triage|health|injur|fitness|clinic/i, 'med'], [/helm|\bnav\b|navig|flight|shuttle|maneuv|manoeuv|position|arrival|\beta\b|course|approach|pilot|deck crew|launch/i, 'flight'],
  [/security|armory|brig|intruder|patrol|guard|watch officers|lockdown/i, 'sec'], [/reactor|core temp|injector|grid|\beps\b|power|engineering|\btaps?\b|junction|defect|fault|damper|coolant|yard|shakedown/i, 'eng'],
  [/sensor|survey|science|chart|scan|\blab\b|anomal|sample/i, 'sci'], [/transporter|\bops\b|comm|relay|database|\bcore\b|archive|backup|records|ticket|network/i, 'ops'], [/cargo|manifest|stores|ration|galley|stock|consumed|quartermaster/i, 'stores']];
const ROOM_THEME = { engineering: 'eng', plant: 'eng', workshop: 'eng', sickbay: 'med', lab: 'sci', arboretum: 'sci', datacore: 'ops', transporter: 'ops', holodeck: 'ops', bridge: 'cmd', readyroom: 'cmd', brig: 'sec', armory: 'sec', shuttlebay: 'flight', cargo: 'stores', stores: 'stores', mess: 'stores' };
const DEPT_THEMED = ['form', 'roster', 'queue', 'verify', 'pa', 'schedule', 'trend', 'brief'];
export const THEMES = {   // kind -> [label regex, theme]...; list: every theme the kind knows (tests play each one)
  course: { re: [[/debris|fod|dust/i, 'debris'], [/storm|ion|hazard/i, 'ion'], [/dock|station|traffic|rendezvous|transfer|arrival|approach/i, 'traffic'], [/survey|grid|chart/i, 'survey']], list: ['debris', 'ion', 'traffic', 'survey', 'asteroids'] },
  decode: { re: [[/medical|sickbay/i, 'medical'], [/alert|drill|tone/i, 'alert'], [/relay|network|link|failover|junction/i, 'relay']], list: ['hail', 'medical', 'alert', 'relay'] },
  tune: { re: [[/subspace|transceiver|comm|channel|relay|link/i, 'comms'], [/deflector|dust/i, 'deflector'], [/array|sensor|calibrat|sweep|drift|resolution|range/i, 'array']], list: ['array', 'comms', 'deflector', 'core'] },
  calibrate: { re: [[/output|constrictor|steady power/i, 'core'], [/hologra|matrix|emh/i, 'emh'], [/emitter|holo|program|session|grid/i, 'holo'], [/buffer|biofilter|decontam|flush/i, 'buffer'], [/lock|beam|transport|pad|patient|team|casualty/i, 'lock']], list: ['lock', 'buffer', 'holo', 'emh', 'core'] },
  dial: { re: [[/injector/i, 'injector'], [/damper|deflector/i, 'damper'], [/air|atmos|ventilat|filtration|scrubber|isolation/i, 'air'], [/pattern|matter|replicator|buffer/i, 'matter'], [/water|reclamation/i, 'water']], list: ['coolant', 'injector', 'damper', 'air', 'matter', 'water'] },
  power: { re: [[/sickbay|medical|hologram/i, 'Sickbay'], [/sensor|array|scan|science/i, 'Sensors'], [/transport|pad/i, 'Transporter'], [/lift|tractor|cargo|gravity/i, 'Lifts'], [/holo|playroom|program/i, 'Holodeck'], [/speed|burst|impulse|cruise/i, 'Impulse']], list: ['Sickbay', 'Sensors', 'Transporter', 'Lifts', 'Holodeck', 'Impulse'] },
  badge: { re: [[/lab|sensor|science/i, 'Science lab'], [/sickbay|quarantine|isolation|stretcher|patient/i, 'Isolation ward'], [/shuttlebay|away-team traffic|unload/i, 'Shuttlebay'], [/transporter|pad|beam/i, 'Transporter room'], [/brig|cell/i, 'Brig'], [/armory|sidearm|weapon|escort/i, 'Armory'], [/cargo|hold|evacuee/i, 'Cargo bay'], [/bridge|lockdown|intruder/i, 'Bridge']], list: ['Armory', 'Science lab', 'Isolation ward', 'Shuttlebay', 'Transporter room', 'Brig', 'Cargo bay', 'Bridge'] },
  cook: { re: [[/bland|patient|sickbay|soft|special/i, 'bland'], [/batch|bulk|loading|double|evacuee/i, 'bulk'], [/sealed|science|console|field|lab/i, 'field'], [/broth|water/i, 'broth']], list: ['meal', 'bland', 'bulk', 'field', 'broth'] },
  manifest: { re: [[/medical|sickbay/i, 'medical'], [/probe|sample|science|lab|drone/i, 'science'], [/transporter|pad|beam/i, 'pads'], [/spare|repair|patch/i, 'spares']], list: ['cargo', 'medical', 'science', 'pads', 'spares'] },
  loadbal: { re: [[/sled|lift/i, 'sleds'], [/pad|beam|batch|weight|transporter/i, 'pads'], [/shuttle|hold/i, 'shuttle']], list: ['crates', 'sleds', 'pads', 'shuttle'] },
  fresh: { re: [[/replicator|feedstock|matter|pattern/i, 'feedstock'], [/medical|med\b|sickbay/i, 'medical'], [/ration|field|emergency/i, 'rations']], list: ['pantry', 'feedstock', 'medical', 'rations'] },
  station: { re: [[/scan|survey|deep/i, 'scan'], [/transfer|transport|dock/i, 'transfer'], [/drift|orbit/i, 'orbit']], list: ['scan', 'transfer', 'orbit', 'hold'] },
  burn: { re: [[/dock|approach|berth/i, 'dock'], [/thruster|test|turn|maneuv/i, 'test'], [/recover|launch|flight|land/i, 'shuttle'], [/decel|speed|run|stricken/i, 'decel']], list: ['dock', 'test', 'shuttle', 'decel'] },
  coords: { re: [[/patient|casualt|sickbay|stretcher/i, 'patients'], [/cargo|crate|batch|supplies|bulk/i, 'cargo'], [/sample|specimen/i, 'samples'], [/team|away|surveyor|beacon/i, 'team']], list: ['team', 'cargo', 'patients', 'samples'] },
  fix: { list: ['stars'] },
  fly: { re: [[/burst|maximise/i, 'burst'], [/best-speed|stricken|run to/i, 'run'], [/hard turn|turn and stop/i, 'turn'], [/orbit/i, 'orbit'], [/grid|survey pattern/i, 'grid'], [/calibration courses|test series|maneuver test/i, 'courses'], [/launch/i, 'launch'], [/hold|deviation/i, 'hold']], list: ['grid', 'run', 'turn', 'orbit', 'courses', 'hold', 'launch', 'burst'] },
  standby: { re: [[/beam-?out|beam out/i, 'beam'], [/launch/i, 'launch'], [/foam|clamps|damage/i, 'damage'], [/hologram|grid in case/i, 'holo'], [/\block\b/i, 'lock'], [/core|reactor/i, 'core'], [/sweep|hazards|watch for|passive/i, 'sensors'], [/recovery/i, 'recover'], [/intruder|lockdown/i, 'lockdown'], [/drill|injur|standby|time and note/i, 'drill']], list: ['beam', 'launch', 'damage', 'holo', 'lock', 'core', 'sensors', 'recover', 'lockdown', 'drill'] },
  decide: { re: [[/survey|extend/i, 'survey'], [/request|department/i, 'cmd'], [/readiness|accept or reject/i, 'ready'], [/approach|sensor power/i, 'approach'], [/program|calm|relax/i, 'holo']], list: ['cmd', 'survey', 'ready', 'approach', 'holo'] },
  assay: { re: [[/blood|tissue/i, 'blood'], [/culture|pathogen/i, 'culture'], [/deep scan|lifesign|lifeform|target vessel/i, 'scan'], [/thruster/i, 'thrusters'], [/\blift\b|dummy|weighted/i, 'lift'], [/hologram|matrix/i, 'matrix'], [/long-range|calibration/i, 'spectrum'], [/force field/i, 'field'], [/core|stress|diagnostic|power-up|under load/i, 'diag']], list: ['assay', 'blood', 'culture', 'scan', 'diag', 'thrusters', 'lift', 'matrix', 'spectrum', 'field'] },
  counsel: { re: [[/fatigue|exhaustion|long scan|loading/i, 'fatigue'], [/medical staff|triage|medical team/i, 'staff'], [/evacuee|relief|families/i, 'grief'], [/new crew|trials|drills?\b|after a fault/i, 'nerves'], [/lonely|walkabout|open-door|wellness|peace/i, 'lonely']], list: ['general', 'fatigue', 'grief', 'nerves', 'staff', 'lonely'] },
};
THEMES.post = { re: THEMES.badge.re, list: THEMES.badge.list };
THEMES.calibrate.list.push('aim');
for (const k of DEPT_THEMED) THEMES[k] = { re: DEPT_RE, list: ['eng', 'med', 'flight', 'sec', 'sci', 'ops', 'stores', 'cmd'], room: true };
export function themeFor(kind, label = '', room = null) {
  const T = THEMES[kind]; if (!T) return null;
  for (const [re, th] of T.re || []) if (re.test(label)) return th;
  if (T.room && ROOM_THEME[room]) return ROOM_THEME[room];
  return T.list[labelHash(label) % T.list.length];
}

// ---- which game a job plays. Exact labels first (OVERRIDES), then RULES in order (label + sys text, room filter), then the spot's own tool.
const MED = ['sickbay'], ENG = ['engineering', 'plant', 'workshop'], SCI = ['lab', 'datacore'], SEC = ['brig', 'armory'], GAL = ['mess', 'arboretum'], CAR = ['cargo', 'stores'], BRI = ['bridge', 'readyroom'];
export const OVERRIDES = {
  'Pharmacy and controlled meds count': 'meds', 'Medical stores and drug audit': 'meds', 'Medicine and supply count': 'meds', 'Drug audit and requisition': 'meds',
  'Sterilise instruments and surgical bay': 'tray', 'Sterile field sweep and tray check': 'tray', 'Restock hypos, dressings and trays': 'tray', 'Prepare away-team medical kits': 'tray',
  'Scheduled counselling sessions': 'counsel', 'Wellness walkabout': 'counsel', 'Crew morale report to the captain': 'counsel', 'Counsel the evacuees on arrival': 'counsel',
  'Dispense meds and update patient list': 'hypo', 'Run rapid scans and bloodwork for the doctor': 'vitals', 'Crew health screening': 'vitals', 'Relay lifesign data to sickbay': 'vitals',
  'Captain\'s refreshment and comfort': 'cook', 'Deliver coffee and sandwiches to lab and sensor stations': 'cook', 'Carry trays to sickbay': 'cook', 'Deliver trays to sickbay': 'cook',
  'Prepare medicinal herbs and extracts for sickbay': 'nutrient', 'Deliver extracts to sickbay': 'nutrient', 'Hydroponics O2 balance': 'nutrient', 'O2 reclamation check': 'nutrient',
  'Balance grid load against reactor output': 'power', 'Count and verify cargo against manifest': 'manifest', 'Plot orbit and transporter-range hold': 'course',
  'Lifeform scanner spot check': 'classify', 'Locate the target vessel and lifesign count': 'classify', 'Carry samples to the lab': 'samples', 'Beam samples to lab': 'transporter',
  'Audit the program archive': 'doorlog', 'Audit the archive for corrupted programs': 'doorlog', 'Routine core sweep and log review': 'doorlog',
  'Hold post at brig or transporter': 'badge', 'Issue and returns desk': 'badge', 'Reconcile returns after the handoff': 'manifest', 'Requisition round': 'manifest',
  'Move cargo sleds': 'loadbal', 'Stage cargo for the pads or shuttlebay': 'loadbal', 'Fuel and stock shuttles': 'loadbal', 'Watch temperature and humidity of stores': 'fresh',
  'Coil wear check and swap': 'coils', 'Charge-rack round': 'armscheck', 'Report power draw anomalies from the units': 'power', 'Report junction margins': 'power', 'Report all margins': 'power',
  'Check sickbay power and medical hologram readiness': 'emh', 'Test sickbay power, bed monitors and hologram trigger': 'emh', 'Stand by with the grid in case the medical hologram needs emitter help': 'power',
  'Prep radiation and sensor-exposure screening kit': 'tray', 'Test emergency medical systems': 'emh', 'Check crew fatigue after drills': 'counsel', 'Watch for fatigue in the science shift': 'counsel',
  'Report load-crew exhaustion to the quartermaster': 'counsel', 'Debrief the sensor team after a long scan': 'counsel', 'Brief cargo crew on lifting injuries': 'counsel',
  'Sickbay air filtration to isolation grade': 'valve', 'Re-balance atmosphere after bay opens': 'valve', 'Raise air handling for extra lab and sensor load': 'valve',
  'Ventilation check on cargo bay before loading': 'valve', 'Visit the cargo handlers during loading': 'counsel', 'Order departure and debrief': 'signoff', 'Stock splints and burn gel': 'tray',
  'Reconcile sensor data with master chart': 'classify', 'Stage survey grid and target list': 'classify', 'Rotate expiring stock to the galley': 'fresh', 'Restock galley and replicator stores': 'fresh',
  'Lock cargo bay after loading': 'doorlog', 'Check on crew on lonely posts': 'counsel', 'Check on the engineering crew after a fault': 'counsel', 'Inspect cargo handlers for strain injuries': 'vitals',
  'Run helm and damper checks': 'course', 'Keep order among the evacuees': 'badge', 'Scan cargo for hazardous signatures': 'samples', 'Live-fire calibration at the range': 'armscheck',
  'Assign watch officers so sensors stay manned': 'signoff', 'Give sensors priority power and bandwidth': 'power', 'Check hull plates and sensor mounts before maneuvers': 'preflight', 'Secure the lab and sensor spaces': 'badge',
  'Pattern buffer check after sensor power draw': 'replicator', 'Brief sensor, carto and botany on survey targets': 'classify', 'Seal-check sickbay isolation doors': 'door', 'Decontaminate buffer': 'transporter',
  'Scan subspace bands for signals': 'comms',
  // second pass (job audit, docs/job-audit.md): labels whose words would mislead a rule
  'Sign the log and review reports': 'signoff', 'Captain\'s log and standing orders': 'signoff', 'Accept or reject ship readiness': 'signoff', 'Approve approach and sensor power': 'signoff', 'Cold-start drill': 'coldstart', 'Authorise transfer and docking': 'signoff',
  'Watch temperature and humidity of stores': 'trend', 'Power the cargo lifts and tractor gear': 'power', 'Report junction margins': 'report', 'Report all margins': 'report', 'Divert power to sickbay on request': 'power',
  'Replicator feedstock and queue': 'fresh', 'Run the full ops systems test sequence': 'trend', 'Duty roster and deficiency review': 'roster', 'Assign watch officers so sensors stay manned': 'roster',
  'Pattern buffer check after sensor power draw': 'backup', 'Relay sickbay requests to captain and bridge': 'decode', 'Report power draw anomalies from the units': 'trend', 'Run full pre-launch checklist on all craft': 'preflight',
  'Run helm and damper checks': 'burn', 'Align navigational deflector': 'sensors', 'Reserve power for sensor arrays': 'power', 'O2 reclamation check': 'trend', 'Reconcile sensor data with master chart': 'backup',
  'Debrief the medical team after the relief': 'counsel', 'Hold steady output during scan': 'trim', 'Hold steady power for transporter': 'trim', 'Constrictor and output trim': 'trim', 'Test sickbay power, bed monitors and hologram trigger': 'power', 'Check the holographic medic and scanners': 'scanner', 'Audit the program archive': 'backup', 'Audit the archive for corrupted programs': 'backup', 'Inspect incoming medical stores and log expiry': 'fresh',
  'Transporter readiness sign-off': 'signoff', 'Sign off the transfer log': 'signoff', 'Work the ops board': 'console',
  'Print pallet straps and crate seals': 'printer', 'Print medical consumables and sterile packs': 'printer', 'Spare parts printed for engineering': 'printer', 'Prepare sample containers and lab consumables on industrial replicator': 'printer',
  'Hail the receiving station and confirm the schedule': 'decode', 'Approve cargo manifest and transfer schedule': 'manifest', 'Serial audit of the zapper locker': 'manifest', 'Prepare and tag survey specimens': 'manifest',
  'Issue probes and sample containers to science': 'manifest', 'Reconcile matter stores against manifest': 'manifest', 'Repair locker audit': 'manifest',
  'Write up fix accuracy results': 'report', 'Crew morale report to the captain': 'report', 'Report load-crew exhaustion to the quartermaster': 'report', 'Deliver results to sickbay': 'report',
  'Move stable patients to recovery and chart handoff': 'report', 'Verify alert drill and station times': 'report', 'Print drill checklist for captain': 'report', 'Request cleaning stock from stores': 'report',
  'Hand updated plot to navigation': 'report', 'Present finished chart to bridge': 'report', 'Confirm sickbay needs and clear the route': 'report', 'Log survey briefing and tasking': 'report',
  'Set up triage beds and sort incoming patients by urgency': 'queue', 'Stage survey grid and target list': 'queue', 'Command the bridge watch': 'queue', 'Run the system test checklist with each department': 'queue',
  'Mark hazards along the route': 'classify', 'Scan the relief destination for pathogens and radiation': 'samples', 'Analyse sensor-collected samples': 'samples', 'Culture and pathogen ID': 'samples', 'Review lab samples for biohazard': 'samples',
  'Decide whether to extend the survey': 'classify', 'Brief sensor, carto and botany on survey targets': 'classify', 'Update charts with the latest sensor data': 'classify',
  'Test all galley equipment, hot plates and replicator lines': 'galleytest', 'Replicator and galley equipment round': 'galleytest', 'Test galley backups: manual stoves and spare stock': 'galleytest', 'Routine pattern checks on all food units': 'galleytest', 'Run full diagnostics on every replicator unit': 'galleytest',
  'Test lab instruments under load': 'labtest', 'Verify nutrient pump power draw': 'bench', 'Full systems stress test': 'bench',
  'Boost O2 output for sensor crew on extended shifts': 'nutrient', 'Inspect incoming medical stores and log expiry': 'fresh', 'Medicine and supply count': 'meds', 'Prepare treatment batches and quarantine bay': 'hypo', 'Prepare for lifting injuries and strains': 'tray',
  'Meet returning shuttle with medical team': 'vitals', 'Stand ready for launch': 'preflight', 'Ready the medical shuttle': 'preflight', 'Launch and fly survey pattern': 'course', 'Clear the approach with nav': 'course', 'Run the full set of calibration courses': 'course',
  'Recover samples and team': 'beam', 'Clear transporter for patient transfers': 'beam', 'Pre-load surveyor pads and lock beacon': 'beam', 'Beam medical supplies out': 'beam', 'Beam samples to lab': 'beam',
  'Test emergency lock with a weighted dummy load': 'transporter', 'Drill the technician': 'transporter', 'Switch grid emitters to a calm recovery program for patients\' families': 'holocube', 'Cycle the emitters through every program class': 'holocube',
  'Open bookings and run the standard grid sweep': 'schedule', 'Reserve computer time for data processing': 'schedule', 'Clear priority transport and berths for patients': 'schedule',
  'Keep the probe relay link open': 'comms', 'Open a priority channel to the destination': 'comms', 'Keep transporter and cargo scanning links responsive': 'comms', 'Route extra power to science arrays': 'power',
  'Extra scrubber capacity for crowded sickbay': 'valve', 'Tune dampers and EPS after stress': 'valve', 'Test emergency atmosphere isolation and lights': 'valve', 'Sickbay air filtration to isolation grade': 'valve',
  'Post a guard at the lab': 'roster', 'Post an officer at the shuttlebay for away-team traffic': 'roster', 'Brief a landing party if a site is chosen': 'roster', 'Authorise medical stores and surge staff': 'roster',
  'Run an intruder lockdown drill': 'pa', 'Run a security alert drill': 'pa', 'Clear bay and cycle doors for launch': 'pa', 'Order departure and debrief': 'pa', 'Test comm relays and PA zones': 'pa',
  'Alert-tone and fault-warning drill': 'decode', 'Relay lifesign data to sickbay': 'decode', 'Keep the sickbay link prioritised': 'junction', 'Link cargo and transporter channels': 'junction', 'Add backup tap for sickbay': 'junction',
  'Allocate core capacity to sensor data intake': 'power', 'Cycle every environmental subsystem under load': 'power', 'Stage a controlled power-up test': 'power', 'Stress-test grid under high load': 'power', 'Hold steady output during scan': 'power',
  'Stand ready for injuries during drills': 'hypo', 'Be on standby during drills': 'vitals', 'Fitness-for-duty review': 'vitals', 'Inspect cargo handlers for strain injuries': 'vitals', 'Help sickbay with crowd control and logistics': 'badge',
  'Escort stretcher teams from transporter': 'badge', 'Escort medical supplies from stores': 'badge', 'Escort valuables to the transporter': 'badge', 'Test armory release and badge locks': 'badge',
  'Check internal sensors and force fields': 'fieldtest', 'Test brig force field and sensors': 'fieldtest', 'Check force-field board': 'fieldtest', 'Test brig force-field panel': 'fieldtest', 'Verify armory chargers hold full charge': 'armscheck', 'Run a full weapons and emitter test': 'armscheck',
  'Check transporter and cargo handling are certified': 'coils', 'Full transporter system test': 'coils', 'Test pad-to-pad transfer with inert mass': 'coils', 'Run full transporter test cycle': 'coils', 'Coil and buffer maintenance': 'coils',
  'Help the cargo handlers stack crates in the playroom': 'loadbal', 'Verify pad weight limits and cargo manifest': 'loadbal', 'Beam cargo crates in batches': 'loadbal', 'Test the cargo lift and sled': 'loadbal', 'Clear and load cargo shuttle with cargo handlers': 'loadbal',
  'Verify manifest and buffer purge': 'manifest', 'Reconcile arrivals with cargo bay': 'manifest', 'Confirm cargo manifest and route': 'manifest', 'Clear space and verify the cargo manifest': 'manifest', 'Verify spares kits against the stress-test plan': 'manifest',
  'Ingest sensor sweep and render the survey chart': 'classify', 'Run patient blood and tissue panels': 'samples', 'Assess route for sensor hazards': 'course', 'Calibrate chart database against sensor test pattern': 'sensors', 'Full sensor array diagnostic': 'sensors',
  'Prepare special-diet and soft-food trays': 'cook', 'Keep the mess open through drills': 'cook', 'Prepare extra meals and water for evacuees': 'cook', 'Bland meal batch for relief patients': 'cook', 'Extra rations for long lab shifts': 'fresh', 'Stock check and shopping list for the Galley Chief': 'fresh',
  'Ready quarantine environment controls': 'valve', 'Raise air handling for extra lab and sensor load': 'valve', 'Re-balance atmosphere after bay opens': 'valve', 'Check inertial dampers and sensors': 'valve', 'Deflector and damper readout check': 'valve', 'Run injector stress test': 'valve',
  'Keep the peace in mess and lounge': 'counsel', 'Brief cargo crew on lifting injuries': 'counsel', 'Keep order among the evacuees': 'badge', 'Armory sign-out and charge check': 'badge', 'Arm escort for away team': 'badge', 'Monitor hails and ship traffic': 'decode', 'Keep the science team\'s comm channel clear': 'comms', 'Hold clean relay link to the sickbay and bridge': 'comms', 'Align the subspace transceiver': 'comms', 'Subspace transceiver range test': 'comms',
  // third pass (the jobs rated weak or mismatched in the human-work review, docs/job-audit.md): spoken briefs, decisions, flying, posts, instrument runs, triage, standby
  'Department status review': 'brief', 'Captain\'s log and standing orders': 'brief', 'Decide on requests from departments': 'decide', 'Approve approach and sensor power': 'decide',
  'Decide whether to extend the survey': 'decide', 'Order departure and debrief': 'brief', 'Authorise transfer and docking': 'brief', 'Sign receipt and close out': 'backup', 'Declare relief complete': 'brief',
  'Review trial results with heads': 'bench', 'Accept or reject ship readiness': 'decide', 'Brief a landing party if a site is chosen': 'brief', 'Sign off the transfer log': 'backup',
  'Command the bridge watch': 'brief', 'Clear deficiency list with chiefs': 'signoff', 'Assign survey priorities to science and flight': 'schedule', 'Pre-brief transporter and shuttlebay': 'brief',
  'Brief chiefs on test sequence': 'brief', 'Collect fault list from all departments': 'brief', 'Review helm and nav status': 'brief', 'Hold course and report': 'fly',
  'Brief helm and nav on slow approach': 'brief', 'Report pass complete': 'brief', 'Report arrival': 'brief', 'Report ETA to the bridge': 'brief', 'Brief helm on test manoeuvres': 'brief',
  'Test shuttle launch': 'fly', 'Report results': 'brief', 'Drill emergency recovery with the pilot': 'standby', 'Brief captain on schedule': 'brief', 'Relay sickbay requests to captain and bridge': 'brief',
  'Time and note each drill result': 'standby', 'Hold course and log deviations': 'fly', 'Attitude thruster pre-check': 'selftest', 'Thruster pre-check': 'selftest',
  'Fly the survey grid at slow, steady speed': 'fly', 'Best-speed run to the stricken site': 'fly', 'Run the helm maneuver test series': 'fly', 'Hard turn and stop test': 'fly',
  'Update charts with the latest sensor data': 'backup', 'Merge survey fixes into the chart': 'backup', 'Plot orbit and transporter-range hold': 'fly', 'Run the full set of calibration courses': 'fly',
  'Stand ready for launch': 'standby', 'Launch and fly survey pattern': 'fly', 'Keep the science team\'s comm channel clear': 'junction', 'Hail the receiving station and confirm the schedule': 'brief',
  'Relay medical updates to the bridge': 'brief', 'Core diagnostic sweep': 'coretest', 'Routine core sweep and log review': 'trend', 'Full core diagnostic and stress test': 'coretest',
  'Prioritise comms with the receiving station': 'brief', 'Watch reactor margin during scans': 'standby', 'Hold transporter lock on team': 'standby', 'Stand by for emergency beam-out': 'standby',
  'Hold standby lock on away team': 'standby', 'Clear pads and hold lock on casualty group': 'standby', 'Test emergency lock with a weighted dummy load': 'loadtest', 'Engineering status to the XO': 'brief',
  'Stage a controlled power-up test': 'coretest', 'Stand by with foam and clamps at loading': 'standby', 'Hold steady output during scan': 'trim', 'Maximise burst output for speed': 'fly',
  'Watch core temps at high output': 'standby', 'Security status to XO': 'brief', 'Guard hold during loading': 'post', 'Escort and control the sickbay entrance': 'post', 'Keep order among the evacuees': 'counsel',
  'Restrict lab and sensor access to survey personnel': 'post', 'Post an officer at the shuttlebay for away-team traffic': 'post', 'Guard transporter pad during transfers': 'post',
  'Control access to quarantine area': 'post', 'Test armory release and badge locks': 'post', 'Hold post at brig or transporter': 'post', 'Hold post at brig door': 'post',
  'Guard the science lab entrance during sensor sweeps': 'post', 'Station for intruder drill': 'standby', 'Quarantine-check samples against the beds': 'samples', 'Hand updated plot to navigation': 'brief',
  'Send updated plot to navigation': 'brief', 'Present finished chart to bridge': 'brief', 'Check internal sensors and force fields': 'fieldpulse', 'Check force-field board': 'backup',
  'Check long-range sensor calibration': 'sensorcal', 'Routine passive sweep and log': 'standby', 'Sensor officer reviews cartography updates': 'chartcheck',
  'Brief sensor, carto and botany on survey targets': 'brief', 'Run primary deep scan of target': 'deepscan', 'Analyse samples for the medical team': 'assay',
  'Scan the relief destination for pathogens and radiation': 'sensors', 'Full sensor array diagnostic': 'coretest', 'Routine sample queue and calibration': 'assay', 'Analyse sensor-collected samples': 'assay',
  'Send summary to bridge': 'brief', 'Log inspection results': 'backup', 'Run patient blood and tissue panels': 'bloodpanel', 'Culture and pathogen ID': 'culture', 'Deliver results to sickbay': 'brief',
  'Test lab instruments under load': 'coretest', 'Lifeform scanner spot check': 'deepscan', 'Routine sweep and drift check': 'standby', 'Report all-clear to bridge': 'brief', 'Aim arrays at survey target': 'aim',
  'Run full-spectrum scan and bracket': 'sensors', 'Package survey data for the bridge': 'report', 'Sweep approach lanes for debris': 'standby', 'Locate the target vessel and lifesign count': 'deepscan',
  'Relay lifesign data to sickbay': 'brief', 'Watch for hazards around the vessel': 'standby', 'Report range and resolution figures': 'brief', 'Crew health screening': 'trend',
  'Health summary to captain': 'brief', 'Receive and triage arriving patients': 'triage', 'Brief captain on capacity and supplies': 'brief', 'Request transporter and cargo support': 'roster',
  'Stand ready for injuries during drills': 'standby', 'Report medical readiness to captain': 'brief', 'Crew morale report to the captain': 'brief', 'Report load-crew exhaustion to the quartermaster': 'brief',
  'Triage incoming patients': 'triage', 'Daily status to bridge on casualties': 'brief', 'Be on standby during drills': 'standby', 'Test the cargo lift and sled': 'loadtest',
  'Run rapid scans and bloodwork for the doctor': 'bloodpanel', 'Check medical hologram matrix': 'matrix', 'Run a calm relaxation program for off-shift survey crew': 'decide',
  'Switch grid emitters to a calm recovery program for patients\' families': 'decide', 'Stand by with the grid in case the medical hologram needs emitter help': 'standby',
  'Spare parts printed for engineering': 'bench',
};
// [tool id, label/sys regex, rooms (optional)]. Order matters: the first match wins.
export const RULES = [
  // paperwork / command / helm / transporter targeting (second pass): what the job's verb is, before the department rules
  ['queue', /(compile|collect|submit) fault list|work orders|backlog|deficienc|\bqueue\b|decide on requests|route science requests|order system trials|log every fault|assign survey priorities|test sequence|prioritise (medical records|comms)/i, null],
  ['roster', /roster|staffing|assign (shuttle|watch)|watch bill|reassign|personnel reassign|surge staff/i, null],
  ['schedule', /schedule|calendar|bookings|arrival window|berths/i, null],
  ['pa', /announce|declare relief|\bpa\b|cycle doors/i, null],
  ['backup', /back ?up|backup|mirror|index and archive|seal records|archive|pattern buffer (diagnostics|check after|and biofilter)|flush pattern|reconcile sensor data|cross-check results|package survey data/i, null],
  ['beam', /^beam|process beam/i, null],
  ['station', /hold (course|station|steady for|position)|steady drift/i, null],
  ['burn', /thruster|docking approach|ease to|deceleration|maneuver test|hard turn|launch|recover shuttle|smooth recovery|emergency recovery|damper checks|test flight/i, null],
  ['fix', /position fix|position-fix|fix accuracy|plot and fixes|survey fixes/i, null],
  ['trend', /^watch (core|grid|tap|reactor|temperature)|baseline core log|status board|review helm and nav status|department status review|chart audit|reviews cartography|o2 (reclamation|reserve)|o2 output test|coolant for sensor|compare dampers|core diagnostic|ops systems test|keep log|observe reactor|sensor power draw|power draw anomalies|review trial results|time and note/i, null],
  ['report', /^(?!.*(cargo crew|on lifting)).*(report|summary|status to|findings|write up|draft|submit|file defect|defect list for|log (inspection|consumed)|update load sheet|send (summary|updated plot|the delivery)|present|brief|request|fuel and flight log|confirm all ops)/i, null],
  // medical
  ['counsel', /counsel|morale|wellness|fatigue|exhaustion|support medical staff|debrief the (medical|sensor)/i, null],
  ['meds', /controlled meds|pharmac|drug|medicine|meds count/i, null],
  ['hypo', /\btreat|dose|dispens|treatment|injur|\bburns?\b/i, MED],
  ['tray', /steril|tray|kit|instrument|decon|isolation (bay|bed)|trauma|splint|prepare (biobeds|sickbay)|triage and isolation/i, MED],
  ['emh', /hologra|holographic medic/i, MED],
  ['vitals', /vital|ward|patient|triage|screen|physical|fitness|health|baseline|charting|rounds|exposure|casualt|standby|stand ready|surge|needs/i, MED],
  ['scanner', /scan|monitor/i, MED],
  // security
  ['badge', /badge|guard|escort|hold post|control (the |access)|entrance|quarantine line|restrict|visitors|sign-out|\bissue\b|sidearm|arm escort|post an? |intruder|lockdown|crowd control|clear a (corridor|stretcher)|stretcher lane/i, null],
  ['fieldtest', /force.?field|field-check|emitter test|field board|fields and/i, null],
  ['armscheck', /charger|charge/i, null],
  ['doorlog', /patrol|walk (the|crew)|door checks|cell check|serial|audit|roster and readiness|security status|readiness drill|alert drill|security alert|count\b/i, SEC.concat(['quarters', 'lounge', 'corridor'])],
  // galley / hydroponics
  ['cook', /cook|meal|\bserve|refreshment|coffee|sanitis|scrub|sanitation|trays/i, null],
  ['nutrient', /hydropon|hydro\b|nutrient|grow bed|harvest|botan|herb|plant stock|soil|\bo2\b/i, null],
  ['fresh', /pantry|cold.?store|food|\brations?\b|rotate|expir|restock|stock check|stores count|stock\b|feedstock|shopping|matter stores|consumed/i, null],
  ['cook', /galley/i, GAL],
  // cargo / stores
  ['loadbal', /lash|strap|tie-down|pallet|stack|sled|stow|secure|weight|\bbulk\b|load and|loading|re-secure|unload|batches|clear and load/i, CAR.concat(['shuttlebay', 'transporter'])],
  ['manifest', /manifest|crate|tally|requisition|reconcile (arrivals|returns|matter|the manifest)|receive|shelve|stage (crates|sensor)|pre-stage|issue probes|inventory|spares|spare cells|supplies|supply|count/i, null],
  // engineering
  ['power', /power|grid|\bload\b|eps|tap load|output|divert|budget|burst|margin|cruise efficiency|constrictor|surge|cold-start/i, ENG.concat(['holodeck', 'transporter', 'sickbay'])],
  ['valve', /coolant|valve|pressure|injector|core temp|reactor|damper|fire suppression|atmosphere|\bair\b|ventilation|scrubber|quarantine environment/i, ENG.concat(['bridge', 'cargo', 'plant'])],
  ['bench', /repair|replace|part|bench|ticket|backlog|defect|fault list|work orders|test series|stress|drill|maintenance sweep|instruments under load|systems test|lab tech|walk sciences/i, ENG.concat(['lab', 'workshop', 'engineering'])],
  ['coils', /coil|pad (and emitter )?diagnostic|pad diagnostics|weight limits|test cycle|system test|dummy|inert mass|certified|emitters at the transporter/i, ['transporter']],
  ['preflight', /preflight|pre-flight|walk-?round|walkaround|walk-around|fod|deck walk|systems test|pre-launch|ready (the|casualty)|prep a|prep survey|readiness|launch|bay door|defect list/i, ['shuttlebay']],
  // bridge helm (before science: survey legs and station-keeping are flying, not sensing)
  ['course', /plot|course|route|\bleg\b|helm|nav\b|navigat|position fix|fix accuracy|approach|thruster|maneuv|manoeuv|turn and stop|orbit|hold station|drift|speed|deceleration|fly|\beta\b|arrival|hold (course|steady|position)|docking|transit|hazards along|survey grid|flight to|rendezvous|smooth recovery|emergency recovery/i, BRI.concat(['shuttlebay'])],
  // science
  ['samples', /sample|specimen|pathogen|culture|biohazard|spore|contaminat|swab|bloodwork|blood|herb/i, null],
  ['sensors', /calibrat|array|deflector|align|resolution|range|power draw|sweep and drift|passive sweep/i, SCI.concat(['bridge'])],
  ['course', /plot|course|route/i, ['lab']],
  ['classify', /contact|anomal|lifeform|hazard|scan|target|survey|debris|lifesign|chart|sweep/i, ['lab', 'bridge']],
  // bridge comms + the rest
  ['decode', /hail|channel|comm\b|comms|relay|message|signal|transmi|traffic|subspace|\bpa\b|broadcast|alert|announce|relief complete|medical updates/i, null],
  ['sensors', /sensor|calibrat|transceiver/i, null],
  ['transporter', /beam|pattern|transport|lock on|buffer|biofilter|emergency lock|stand by for emergency/i, ['transporter', 'shuttlebay']],
  ['signoff', /log\b|sign|report|brief|confirm|order|authoris|approve|declare|decide|roster|schedule|status|review|assign|draft|compile|print|calendar|backlog|paperwork|receipt|findings|summary/i, null],
];
// no label rule matched: the duty's system says what it is (duties.json loop.sys), before falling back to the station itself
export const BY_SYS = { reactor: 'valve', coolant: 'valve', eps: 'power', sensors: 'sensors', helm: 'course', comms: 'decode', security: 'doorlog', sickbay: 'vitals', emh: 'emh', hydro: 'nutrient', replicators: 'fresh', transport: 'transporter', armory: 'armscheck', holo: 'holocube', life: 'valve' };
export function gameFor(it) {
  if (!it) return null; const base = toolFor(it.spot); if (!base) return null;   // a place, not a station: the job just runs
  const label = it.label || it.task || '', ov = OVERRIDES[label], themed = (t) => t.theme || !THEMES[t.kind] ? t : { ...t, theme: themeFor(t.kind, label, it.room) };
  if (ov && TOOLS[ov]) return themed(TOOLS[ov]);
  for (const [id, re, rooms] of RULES) if ((!rooms || rooms.includes(it.room)) && re.test(label)) return themed(TOOLS[id]);
  const bySys = BY_SYS[it.sys]; if (bySys && TOOLS[bySys] && !(it.spot === 'junction' || it.spot === 'door' || it.spot === 'corridor')) return themed(TOOLS[bySys]);   // a junction / door panel stays wiring
  return themed(base);
}
// ---- every duty loop + mission task in duties.json -> its game: counts per kind (tests and the TODO report)
export function coverage(duties) {
  const kinds = {}, tools = {}, missing = [], byDept = {}; let total = 0;
  const add = (it, label) => { total++; const t = gameFor(it); if (!t) { missing.push(label); return; } kinds[t.kind] = (kinds[t.kind] || 0) + 1; tools[t.id] = (tools[t.id] || 0) + 1; (byDept[it.room] ||= {})[t.kind] = 1; };
  for (const b of Object.values(duties.billets || {})) { for (const l of b.loops || []) add(l, l.label); for (const ts of Object.values(b.tasks || {})) for (const t of ts) add(t, t.task); }
  const share = Math.max(0, ...Object.values(kinds)) / Math.max(1, total);
  return { total, kinds, tools, missing, share, byRoom: Object.fromEntries(Object.entries(byDept).map(([r, k]) => [r, Object.keys(k)])) };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DIG = (code) => { const m = /^(?:Digit|Numpad)([1-9])$/.exec(code || ''); return m ? +m[1] : 0; };
const ri = (rnd, a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
const shuffle = (rnd, a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const ARROW = { ArrowUp: 'U', KeyW: 'U', ArrowDown: 'D', KeyS: 'D', ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R' };

// ---- content banks (procedural, original)
const SURN = ['Adeyemi', 'Brandt', 'Castell', 'Dorrin', 'Esk', 'Falk', 'Gaudin', 'Holt', 'Ibarra', 'Jansen', 'Kaur', 'Lind', 'Moreau', 'Nakai', 'Okafor', 'Petrov', 'Quist', 'Rao', 'Sato', 'Tamm', 'Ueda', 'Voss', 'Wren', 'Yilmaz', 'Zeller', 'Abara', 'Cho', 'Delacroix', 'Mbeki', 'Novak'];
const RANKS = ['Ens.', 'Lt.', 'Lt. Cmdr.', 'Crewman', 'PO'];
const DEPTS = ['Command', 'Science', 'Medical', 'Engineering', 'Security', 'Operations'];
const DRUGS = ['Cardiostim', 'Analgene', 'Tri-ox', 'Sedorin', 'Neurocalm', 'Coagulex', 'Febrinol', 'Hydrolase'];
const INSTR = ['scalpel', 'forceps', 'clamp', 'probe', 'hypo', 'suture'];
const VITAL = { HR: [60, 100, 'bpm'], SpO2: [95, 100, '%'], Temp: [36.1, 37.5, '°C'], BP: [100, 140, 'mmHg'] };
const COUNSEL = [
  ['I can\'t sleep since the drill. I keep hearing the alarm.', 'That\'s a normal reaction. Tell me what it\'s like, and let\'s set up a sleep plan.', 'Take something for it and you\'ll be fine.', 'Everyone heard the alarm. You\'ll get over it.'],
  ['My section chief never notices anything I do.', 'What would you want them to notice? We can plan how to raise it with them.', 'Maybe you should work harder.', 'Chiefs are busy. Don\'t take it personally.'],
  ['I miss home. I didn\'t think it would hit this hard.', 'That\'s hard. What do you miss most? Have you been able to call home?', 'You signed up for a long tour.', 'Keep busy and you won\'t think about it.'],
  ['I froze during the hull-breach drill.', 'Freezing is common the first time. Let\'s walk through it and practise the steps.', 'That could get someone killed.', 'Don\'t tell anyone and it\'s fine.'],
  ['My bunkmate and I keep arguing.', 'What do the arguments start over? Would a talk with me there help?', 'Ask for a new bunk.', 'Just ignore them.'],
  ['I made a mistake on the log and nobody caught it.', 'Thank you for telling me. Let\'s work out how to correct it with your chief.', 'If nobody caught it, forget it.', 'That\'s a disciplinary matter.'],
  ['I\'m fine. The captain sent me.', 'Okay. We can just talk about how your watch is going. No pressure.', 'If you\'re fine, why are you here?', 'Then sign here and go.'],
  ['I keep thinking about the crew we lost.', 'Grief takes time. Would you like to tell me about them?', 'They knew the risks.', 'Try not to dwell on it.'],
  ['I want a transfer off this ship.', 'Let\'s look at what\'s driving that before you decide anything.', 'Transfers take months. Forget it.', 'Fine, I\'ll sign it now.'],
  ['I\'ve been drinking a lot on my off hours.', 'Thanks for being honest. How much, and what\'s going on when you do?', 'Everyone unwinds somehow.', 'That goes on your record.'],
  ['Nobody talks to me at mess.', 'That sounds lonely. Shall we find a group or an activity you\'d like?', 'Talk to them first, then.', 'Mess is for eating.'],
  ['I don\'t think I\'m good enough for this posting.', 'What makes you feel that? Let\'s look at what you\'ve actually done.', 'Then ask for a lower post.', 'Everyone thinks that. Move on.'],
  ['The new rota means I never see my partner.', 'That matters. Let\'s see whether the rota can be adjusted, and how you two can keep in touch.', 'Duty comes first.', 'Rotas change. Wait it out.'],
  ['I snapped at a junior crewman today.', 'It\'s good you noticed. What was going on for you, and how might you put it right?', 'They probably deserved it.', 'Rank has its privileges.'],
];
// themed conversations (counsel themes: the job's situation), mixed with the general bank above
const COUNSEL_T = {
  fatigue: [['I\'ve been on this console fourteen hours. I\'m fine.', 'You\'ve done a long stretch. Let\'s get you relieved for a proper rest; I\'ll square it with your chief.', 'Then keep going.', 'Coffee helps.'],
    ['My hands keep shaking on the lifts.', 'That\'s your body telling you to stop. Sit down with me, drink something, and we\'ll swap you out.', 'Grip harder.', 'Everyone\'s tired.'],
    ['I keep making small mistakes on the readings.', 'That happens when you\'re worn out. Let\'s get a second pair of eyes on it and get you a break.', 'Be more careful.', 'Nobody will notice.']],
  grief: [['We lost everything down there. Our home is gone.', 'I\'m so sorry. You\'re safe here now. Tell me who is with you, and what you need first.', 'At least you\'re alive.', 'The captain will sort it out.'],
    ['My daughter is in your sickbay and nobody tells me anything.', 'That waiting is awful. Let me find out how she is and come back to you myself.', 'The doctors are busy.', 'Please calm down.'],
    ['I watched people not make it out.', 'That\'s a lot to carry. You don\'t have to tell me everything now; I\'m here when you want to.', 'Try not to think about it.', 'It wasn\'t your fault, so move on.']],
  nerves: [['What if I freeze when the trials start?', 'Most people feel that. Let\'s run through your steps together so they\'re automatic.', 'Then don\'t freeze.', 'It\'s only a test.'],
    ['Everyone here seems to know what they\'re doing except me.', 'You\'re new, and that\'s fine. Who\'s your buddy on shift? Let\'s make sure you have one.', 'You\'ll learn.', 'Fake it.'],
    ['The alarms make my heart race even in drills.', 'That\'s a normal stress response. A slow breath on each alarm helps; let\'s practise one now.', 'Ignore them.', 'Ask to skip the drills.']],
  staff: [['I had to choose who got the bed first.', 'That\'s one of the hardest calls there is. You made it with what you knew. How are you holding up?', 'That\'s the job.', 'Don\'t second-guess yourself.'],
    ['I haven\'t eaten since the casualties came in.', 'Then that comes first. Ten minutes and a meal; I\'ll cover the desk while you go.', 'Eat later.', 'Patients come first.'],
    ['I snapped at a patient\'s family.', 'You\'re running on empty. Let\'s get you a break, and you can talk to them again when you\'re ready.', 'They\'ll get over it.', 'Report yourself.']],
  lonely: [['I\'m the only one on this post all watch.', 'That\'s isolating. Would a check-in call each watch help? I can set one up.', 'Some people like quiet.', 'It\'s only eight hours.'],
    ['I eat alone most days.', 'Would you like me to introduce you to the night-shift table? They\'re a good crowd.', 'Eat faster.', 'Bring a PADD.']],
};
const CONTACT = [
  { name: 'Debris', size: 'small', em: 'none', mo: 'tumbling' }, { name: 'Asteroid', size: 'large', em: 'none', mo: 'drifting' },
  { name: 'Shuttle', size: 'small', em: 'steady', mo: 'powered' }, { name: 'Freighter', size: 'large', em: 'steady', mo: 'powered' },
  { name: 'Probe', size: 'small', em: 'pulsing', mo: 'drifting' }, { name: 'Ion storm', size: 'large', em: 'pulsing', mo: 'tumbling' },
];
const BIO = [
  { name: 'Inert', size: 'clear', em: 'none', mo: 'still' }, { name: 'Spore', size: 'clear', em: 'glowing', mo: 'still' },
  { name: 'Bacterial', size: 'cloudy', em: 'none', mo: 'dividing' }, { name: 'Viral', size: 'clear', em: 'none', mo: 'dividing' },
  { name: 'Toxin', size: 'cloudy', em: 'glowing', mo: 'still' }, { name: 'Fungal', size: 'cloudy', em: 'glowing', mo: 'dividing' },
];
const BENCH = {
  eng: [['EPS power tap', 'kV', 4.2, 5.0], ['Plasma coupling', 'MPa', 1.8, 2.4], ['Isolinear relay', 'ms', 3, 6], ['Field coil', 'Ω', 11, 14], ['Gravity plate driver', 'Hz', 48, 52], ['Coolant pump', 'L/s', 22, 28]],
  craft: [['Port thruster', '% thrust', 92, 100], ['Landing strut', 'mm play', 0, 3], ['Hull plate seal', 'kPa', 98, 104], ['Fuel cell', '% charge', 85, 100], ['Nav beacon', 'dB', 40, 55], ['Life-support scrubber', '% eff.', 90, 100]],
  arms: [['Hand zapper charger', '% hold', 95, 100], ['Rifle cell', '% hold', 92, 100], ['Tracker battery', 'h', 30, 40], ['Charger rack bus', 'V', 23, 25], ['Holster lock', 'N', 40, 60]],
  field: [['Cell 1 emitter', 'MJ', 4.0, 4.8], ['Cell 2 emitter', 'MJ', 4.0, 4.8], ['Corridor emitter', 'MJ', 3.2, 3.8], ['Field node', '% stable', 96, 100], ['Isolation emitter', 'MJ', 2.6, 3.1]],
  galley: [['Hot plate', '°C', 220, 260], ['Replicator line', '% fidelity', 97, 100], ['Cold store', '°C', 1, 4], ['Dishwasher rinse', '°C', 80, 90], ['Food unit pattern', '% match', 98, 100], ['Manual stove', 'kPa', 3, 5]],
  lab: [['Spectrometer', 'nm error', 0, 2], ['Centrifuge', 'rpm ×1000', 11, 13], ['Fume hood flow', 'm/s', 0.4, 0.6], ['Sample fridge', '°C', 2, 6], ['Microscope stage', 'µm drift', 0, 3], ['Gas analyser', '% span', 98, 102]],
  chart: [['Point A-12', 'AU off', 0, 0.4], ['Beacon Kell-3', 'AU off', 0, 0.3], ['Dust edge, sector 9', 'AU off', 0, 0.6], ['Nav buoy 4', 'km off', 0, 50], ['Hazard marker 7', 'km off', 0, 80], ['Survey point C', 'AU off', 0, 0.5]],
  coil: [['Primary energizing coil', '% wear', 0, 20], ['Phase transition coil', '% wear', 0, 25], ['Pattern buffer coil', '% wear', 0, 15], ['Emitter array coil', '% wear', 0, 20], ['Targeting scanner coil', '% wear', 0, 30]],
};
const SHELF = [['Ration packs', 'pack'], ['Fresh greens', 'tray'], ['Protein cubes', 'tin'], ['Milk substitute', 'carton'], ['Bread loaves', 'bag'], ['Spice paste', 'jar'], ['Med gel', 'tube'], ['Breather filters', 'box'], ['Reagent kit', 'case'], ['Soup concentrate', 'pouch']];
const SHELFSET = { feedstock: [['Protein base', 'cask'], ['Carb base', 'cask'], ['Trace minerals', 'tin'], ['Flavour matrix', 'cart.'], ['Fibre stock', 'drum'], ['Lipid base', 'cask']],
  medical: [['Med gel', 'tube'], ['Burn dressing', 'pack'], ['Hypo ampoules', 'box'], ['Splint foam', 'can'], ['Saline', 'bag'], ['Antibiotic', 'vial']],
  rations: [['Field ration A', 'pack'], ['Field ration B', 'pack'], ['Water pouch', 'case'], ['Energy bar', 'box'], ['Soup concentrate', 'pouch'], ['Hard biscuit', 'tin']] };
const COOK = ['Clear broth', 'Root hash', 'Flatbread', 'Spiced rice', 'Bean stew', 'Noodles', 'Vegetable curry', 'Omelette'];
const COOKSET = { bland: ['Plain rice', 'Soft oats', 'Steamed fish', 'Mashed roots', 'Clear broth'], bulk: ['Bean stew', 'Big pasta bake', 'Root hash', 'Chili pot', 'Flatbread stack'], field: ['Sealed wraps', 'Rice parcels', 'Bean pouches', 'Flatbread rolls'], broth: ['Bone broth', 'Vegetable stock', 'Miso', 'Clear broth', 'Barley water'] };
const BUSES = { power: ['Life support', 'Sickbay', 'Sensors', 'Shields', 'Impulse', 'Replicators', 'Holodeck', 'Transporter', 'Lifts'], nutrient: ['Nitrate', 'Phosphate', 'Potash'] };
const MSGS = ['Hail', 'Docking request', 'Distress call', 'Traffic advisory', 'Course change', 'Medical priority', 'Cargo schedule', 'All clear'];
const MSGSET = { medical: ['Bed count', 'Casualty inbound', 'Supply request', 'Quarantine', 'Doctor to bridge', 'All stable'], alert: ['Yellow alert', 'Red alert', 'Stand down', 'Drill start', 'Drill end', 'Fault tone', 'Lockdown'],
  relay: ['Link test', 'Relay up', 'Relay down', 'Failover', 'Echo', 'Data burst', 'Resync'] };
// one line under the title: what this particular job's version of the game is (theme -> subtitle)
const SUB = { counsel: { fatigue: 'Tired crew', grief: 'Survivors and families', nerves: 'Nervous crew', staff: 'Staff under strain', lonely: 'Isolated crew' }, course: { debris: 'Debris field', ion: 'Ion storm cells', traffic: 'Traffic lanes', survey: 'Survey grid', asteroids: 'Asteroid field' }, decode: { hail: 'Ship traffic', medical: 'Medical channel', alert: 'Alert net', relay: 'Relay test' },
  tune: { array: 'Sensor array · GHz', comms: 'Subspace band · MHz', deflector: 'Deflector harmonic', core: 'Core data bus' }, calibrate: { lock: 'Pattern lock', buffer: 'Pattern buffer purge', holo: 'Emitter matrix', emh: 'Hologram matrix', core: 'Reactor output' },
  dial: { coolant: 'Coolant loop', injector: 'Plasma injector', damper: 'Inertial damper', air: 'Air handler', matter: 'Matter stream', water: 'Reclamation line' }, cook: { meal: 'Main meal', bland: 'Patient diet', bulk: 'Bulk batch', field: 'Sealed field meals', broth: 'Broth and water' },
  manifest: { cargo: 'Cargo hold', medical: 'Medical supplies', science: 'Science cases', pads: 'Pad staging', spares: 'Spares and kits' }, loadbal: { crates: 'Hold trim', sleds: 'Sled loading', pads: 'Pad weight limits', shuttle: 'Shuttle hold' },
  fresh: { pantry: 'Pantry', feedstock: 'Replicator feedstock', medical: 'Medical stores', rations: 'Ration packs' }, station: { scan: 'Hold for the scan', transfer: 'Hold for transfer', orbit: 'Orbit hold', hold: 'Station keeping' },
  burn: { dock: 'Docking approach', test: 'Manoeuvre test', shuttle: 'Shuttle recovery', decel: 'Deceleration run' }, coords: { team: 'Away team', cargo: 'Cargo', patients: 'Patients to sickbay', samples: 'Samples to the lab' },
  power: Object.fromEntries(['Sickbay', 'Sensors', 'Transporter', 'Lifts', 'Holodeck', 'Impulse'].map(b => [b, `${b} priority`])), badge: {},
  fly: { grid: 'Survey grid at slow, steady speed', run: 'Best-speed run', turn: 'Hard turn and stop', orbit: 'Orbit hold', courses: 'Calibration courses', hold: 'Hold course against drift', launch: 'Lift-off and climb-out', burst: 'Burst output' },
  standby: { beam: 'Emergency beam-out', launch: 'Ready for launch', damage: 'Damage-control standby', holo: 'Emitter standby', lock: 'Standby lock', core: 'Core watch', sensors: 'Quiet sweep watch', recover: 'Recovery drill', lockdown: 'Intruder drill', drill: 'Drill standby' },
  decide: { cmd: 'Department requests', survey: 'Extend the survey?', ready: 'Readiness call', approach: 'Approach and sensor power', holo: 'Program for the request' },
  assay: { assay: 'Sample assay', blood: 'Blood and tissue panel', culture: 'Culture ID', scan: 'Deep scan integration', diag: 'Diagnostic under load', thrusters: 'Thruster self-test', lift: 'Load test', matrix: 'Hologram matrix self-test', spectrum: 'Calibration against a reference star', field: 'Force-field pulse test' } };
SUB.calibrate.aim = 'Array on a moving target';
SUB.post = Object.fromEntries(THEMES.badge.list.map(d => [d, `${d} door`]));
const CODECH = 'ABCDEFGHKMNPRSTVXZ';
// paperwork content per department theme (eng / med / flight / sec / sci / ops / stores / cmd): readings, posts, queue items, volumes, PA lines, bookings, logs
const FORMS = {
  eng: { to: 'Chief Engineer', rd: [['Core temp', 'K', 1900, 2100], ['EPS load', '%', 40, 85], ['Coolant flow', 'L/s', 22, 28], ['Injector wear', '%', 0, 30], ['Grid margin', '%', 15, 40], ['Gravity plating', 'g', 0.9, 1.1], ['Open defects', '', 0, 6]] },
  med: { to: 'CMO', rd: [['Beds occupied', '', 0, 6], ['Hypo stock', 'units', 20, 60], ['Isolation pressure', 'kPa', 96, 99], ['Staff on watch', '', 3, 6], ['Pending scans', '', 0, 4], ['Blood stock', 'units', 8, 20]] },
  flight: { to: 'Bridge', rd: [['Position error', 'km', 0, 40], ['Heading drift', '°', 0, 1.5], ['Fuel', '%', 60, 100], ['Damper lag', 'ms', 0, 12], ['ETA error', 'min', 0, 5], ['Thruster output', '%', 92, 100]] },
  sec: { to: 'Deputy', rd: [['Doors checked', '', 40, 60], ['Field strength', 'MJ', 4.0, 5.2], ['Incidents', '', 0, 2], ['Cells occupied', '', 0, 3], ['Sidearms out', '', 0, 8], ['Drill time', 'min', 2, 6]] },
  sci: { to: 'Science', rd: [['Array gain', 'dB', 30, 45], ['Contacts logged', '', 0, 12], ['Chart drift', 'AU', 0, 1.5], ['Sample backlog', '', 0, 8], ['Resolution', 'm', 2, 9], ['Scan coverage', '%', 80, 100]] },
  ops: { to: 'Ops', rd: [['Relay uptime', '%', 97, 100], ['Buffer integrity', '%', 95, 100], ['Ticket queue', '', 0, 9], ['Core load', '%', 20, 70], ['Pad alignment', 'mm', 0, 1.5], ['Link latency', 'ms', 4, 20]] },
  stores: { to: 'Quartermaster', rd: [['Crates logged', '', 20, 60], ['Rations on hand', 'days', 20, 45], ['Cold store', '°C', 1, 4], ['Feedstock', '%', 40, 100], ['Spares kits', '', 6, 12], ['Water reserve', '%', 60, 100]] },
  cmd: { to: 'Captain', rd: [['Departments green', '', 5, 8], ['Open defects', '', 0, 6], ['Crew on duty', '', 30, 45], ['Drills run', '', 1, 4], ['Requests pending', '', 0, 5], ['Readiness', '%', 85, 100]] },
};
const RECIPS = [[/captain/i, 'Captain'], [/\bxo\b|first officer/i, 'First Officer'], [/deputy/i, 'Deputy'], [/quartermaster/i, 'Quartermaster'], [/\bops\b/i, 'Ops'], [/navigation|\bnav\b/i, 'Navigation'], [/\byard\b/i, 'Starbase yard'], [/the chief\b|chief engineer/i, 'Chief Engineer'], [/sickbay|doctor/i, 'CMO'], [/bridge/i, 'Bridge'], [/\blog\b/i, 'Ship\'s log'], [/^$/, 'Science']];
const QUALS = { eng: ['Reactor', 'EPS', 'Damage control', 'Environmental', 'Lifts'], med: ['Nurse', 'Medic', 'Surgeon', 'Orderly', 'Lab'], flight: ['Pilot', 'Deck crew', 'Navigator', 'Fuelling', 'Recovery'], sec: ['Guard', 'Armory', 'Patrol', 'Brig', 'Escort'],
  sci: ['Sensors', 'Cartography', 'Lab tech', 'Botany', 'Survey'], ops: ['Transporter', 'Comms', 'Core', 'Cargo', 'Relay'], stores: ['Cargo', 'Galley', 'Stores', 'Sled driver', 'Hazmat'], cmd: ['Helm', 'Ops', 'Sensors', 'Tactical', 'Comms'] };
const QITEMS = { eng: ['Coolant leak, deck 4', 'Lift 2 brake squeal', 'Replace hot tap J-12', 'Gravity plate flicker', 'Door 7 sticks', 'Repaint conduit tags', 'Plasma vent alarm', 'Lighting fault, aft'], med: ['Isolation seal alarm', 'Restock burn gel', 'Biobed 2 sensor drift', 'Chart audit', 'Hypo recall check', 'New linen order'],
  flight: ['Damper fault on shuttle 2', 'Fuel log mismatch', 'Bay door seal wear', 'Nav beacon update', 'Repaint deck lines', 'Suit locker latch'], sec: ['Cell field flicker', 'Expired badge in use', 'Armory door latch', 'Patrol route change', 'Update visitor list', 'Locker key audit'],
  sci: ['Array overheat warning', 'Unknown contact bearing 090', 'Sample fridge temp', 'Chart drift correction', 'Recalibrate spectrometer', 'Rename survey files'], ops: ['Relay node down', 'Pattern buffer error', 'Core cache full', 'PA zone 3 quiet', 'Ticket from galley', 'Update console skins'],
  stores: ['Leaking hazmat crate', 'Cold store warm', 'Short delivery, sickbay', 'Feedstock low', 'Relabel shelf C', 'Order spare mops'], cmd: ['Hull breach report', 'Away-team medical clearance', 'Survey priority call', 'Shore leave request', 'Award citation', 'Mess menu complaint', 'Uniform reorder'] };
const VOLS = { eng: ['Engineering logs', 'Defect database', 'Load sheets'], med: ['Medical records', 'Patient charts', 'Pharmacy ledger'], flight: ['Flight logs', 'Nav charts', 'Shuttle telemetry'], sec: ['Security logs', 'Door logs', 'Armory ledger'],
  sci: ['Chart database', 'Survey data', 'Sensor archive'], ops: ['Program archive', 'Pattern buffer', 'Core stack', 'Relay config'], stores: ['Manifest records', 'Stores ledger', 'Feedstock log'], cmd: ['Ship\'s log', 'Standing orders', 'Crew records'] };
const PAZ = ['Bridge', 'Engineering', 'Sickbay', 'Science', 'Cargo', 'Crew decks'];
const PAMSG = { eng: ['Power test in five minutes', 'Lift 2 out of service', 'Coolant venting, keep clear'], med: ['Medical team to sickbay', 'Sickbay at capacity', 'Blood donors please report'], flight: ['Shuttle launch, clear the bay', 'Stand by for manoeuvres', 'Recovery in progress'],
  sec: ['Lockdown drill begins', 'Corridor closed for transfer', 'All clear, drill ends'], sci: ['Sensor sweep: hold transmissions', 'Survey begins', 'Lab sealed'], ops: ['Transporter in use', 'Comms test, ignore tones', 'Network restart'], stores: ['Loading in the cargo bay', 'Meal service open', 'Stores closed for count'],
  cmd: ['Green alert, quiet watch', 'Yellow alert drill', 'Relief operation complete', 'All hands: shakedown begins'] };
const SCHED = { eng: ['Power trial', 'Core inspection', 'Lift service'], med: ['Physicals', 'Surgery', 'Staff briefing'], flight: ['Shuttle flight', 'Launch window', 'Deck drill'], sec: ['Patrol', 'Drill', 'Armory audit'], sci: ['Deep scan', 'Survey pass', 'Lab cleanup'],
  ops: ['Transfer window', 'Backup', 'Relay test'], stores: ['Delivery', 'Stock count', 'Loading'], cmd: ['Captain\'s briefing', 'Heads meeting', 'Inspection', 'Station call'] };
const TRENDS = { eng: [['Core temp', 'K', 1900, 2100], ['Grid load', '%', 40, 85], ['Tap load J-7', 'A', 20, 60], ['Reactor margin', '%', 15, 40]], med: [['Patient HR', 'bpm', 60, 100], ['Isolation pressure', 'kPa', 96, 99], ['Ward temp', '°C', 19, 23]],
  flight: [['Course deviation', 'm', -50, 50], ['Damper error', 'ms', 0, 12], ['Heading drift', '°', -1, 1]], sec: [['Field strength', 'MJ', 4, 5], ['Door cycle rate', '/h', 0, 30], ['Sensor coverage', '%', 90, 100]],
  sci: [['Array temp', 'K', 70, 90], ['Signal noise', 'dB', -90, -70], ['Chart residual', 'AU', 0, 1]], ops: [['Relay latency', 'ms', 4, 20], ['Core load', '%', 20, 70], ['Buffer error rate', 'ppm', 0, 5]],
  stores: [['Cold store temp', '°C', 1, 4], ['Humidity', '%', 40, 60], ['Feedstock draw', 'kg/h', 2, 6]], cmd: [['Alert response', 's', 30, 90], ['Crew fatigue index', '', 1, 4], ['Hull stress', '%', 0, 60]] };
const DESTS = { medical: ['Sickbay', 'Isolation', 'Med stores', 'Medical shuttle'], science: ['Lab', 'Shuttle 2', 'Sample fridge', 'Probe rack'], pads: ['Pad 1', 'Pad 2', 'Pad 3', 'Pad 4', 'Pad 5', 'Pad 6'], spares: ['Workshop', 'Repair locker', 'Engineering', 'DC locker'] };

// third-pass content: decision boards, flight legs, post arrivals, instrument references, triage casualties, standby calls
const DECIDE = {
  cmd: { a: ['Crew hours', 'h', 'max'], b: ['Power', 'MW', 'max'], val: 'Priority', opts: ['Engineering refit', 'Science deep scan', 'Security drill', 'Medical stores run', 'Shore leave rota', 'Cargo transfer'] },
  survey: { a: ['Fuel left', '%', 'min'], b: ['Back by', 'h', 'max'], val: 'Finds', opts: ['Go home now', 'Extend 6 h', 'Extend 12 h', 'One more sector', 'Deep pass', 'Probe only'] },
  ready: { a: ['Open faults', '', 'max'], b: ['Waivers needed', '', 'max'], val: 'Readiness', opts: ['Accept', 'Accept with waivers', 'Reject: refit', 'Accept after retest', 'Partial accept'] },
  approach: { a: ['Sensor draw', 'MW', 'max'], b: ['Stand-off', 'km', 'min'], val: 'Resolution', opts: ['Close pass', 'Standard pass', 'Far orbit', 'Slow drift', 'Two passes'] },
  holo: { a: ['Intensity', '/10', 'max'], b: ['Length', 'min', 'max'], val: 'Match', opts: ['Shoreline', 'Forest rain', 'Night sky', 'Walled garden', 'Mountain lake', 'Quiet library'] },
};
const POSTS = ['Prisoner transfer', 'Sample cases', 'Patient on a stretcher', 'Weapons crate', 'Away-team kit', 'Evidence locker'];
const ASSAY = {   // [setting name, unit, lo, hi], reference names (4 shown, one matches the trace)
  assay: [['Column temp', '°C', 20, 60], ['Tri-ox', 'Sedorin', 'Coagulex', 'Hydrolase', 'Neurocalm', 'Saline blank']],
  blood: [['Panel', 'no.', 1, 12], ['Normal', 'Anaemia', 'Infection', 'Dehydration', 'Radiation dose', 'Clotting fault']],
  culture: [['Incubation', 'h', 6, 36], ['Bacterial', 'Fungal', 'Viral', 'Sterile', 'Spore former', 'Mixed growth']],
  scan: [['Integration', 's', 10, 60], ['Freighter', 'Shuttle', 'Probe', 'Lifeforms ×12', 'Lifeforms ×30', 'Debris cloud']],
  diag: [['Test load', '%', 50, 100], ['Stack A failing', 'Stack B failing', 'Stack C failing', 'All nominal', 'Bus noise', 'Cooling lag']],
  thrusters: [['Test pulse', 'ms', 20, 80], ['Port aft weak', 'Starboard aft weak', 'Port fore weak', 'Starboard fore weak', 'All nominal', 'Valve sticking']],
  lift: [['Test weight', 't', 1, 9], ['Holds', 'Brake slipping', 'Cable stretch', 'Motor stall', 'Lock creeps', 'Sensor fault']],
  matrix: [['Test level', '', 1, 10], ['Nominal', 'Emitter 2 fault', 'Old version', 'Memory fault', 'Trigger lag', 'Audio fault']],
  spectrum: [['Reference star', 'ch', 1, 24], ['In calibration', 'Drift +', 'Drift −', 'Noisy', 'Gain low', 'Offset']],
  field: [['Pulse', 'MJ', 1, 8], ['Cell 1 weak', 'Cell 2 weak', 'Corridor weak', 'All holding', 'Node flicker', 'Isolation weak']],
};
const STANDBY = {   // [call, right action, two wrong actions]; idle: lamps that are not your call
  beam: { calls: [['Away team 2: emergency beam-out!', 'Energise pad 2', 'Energise pad 1', 'Hold for orders'], ['Casualty on the surface, beacon 4', 'Lock beacon 4 and energise', 'Lock beacon 1', 'Call sickbay first'], ['Team reports hostile contact, beam now', 'Energise all pads', 'Energise pad 1 only', 'Ask for confirmation']], idle: ['Lamp test', 'Call for transporter 2', 'Comm check, no action'] },
  launch: { calls: [['Bridge: launch shuttle 1', 'Release clamps, launch', 'Open the wrong bay door', 'Wait for the deck chief'], ['Launch hold: debris on the pad', 'Hold and report', 'Launch anyway', 'Close the bay'], ['Flight: go for launch, shuttle 2', 'Launch shuttle 2', 'Launch shuttle 1', 'Re-run the checklist']], idle: ['Bay lighting test', 'Call for shuttle 3', 'Clock check'] },
  damage: { calls: [['Spill at loading bay 2!', 'Foam bay 2', 'Foam bay 1', 'Call engineering'], ['Hose split on the lift', 'Clamp the hose', 'Foam the lift', 'Stop the loading log'], ['Small fire, crate 7', 'Extinguish crate 7', 'Evacuate the deck', 'Move crate 6']], idle: ['Alarm test', 'Call for damage team 2', 'Lift chime'] },
  holo: { calls: [['Sickbay: hologram emitter 3 failing', 'Route power to emitter 3', 'Reset the grid', 'Wait for the nurse'], ['Medical hologram flickering', 'Boost the matrix feed', 'Shut the grid down', 'Restart the program'], ['Sickbay needs a second emitter', 'Bring emitter 2 online', 'Bring the grid down', 'Log it for later']], idle: ['Program end chime', 'Booking request', 'Lamp test'] },
  lock: { calls: [['Beacon 2 fading', 'Switch to the backup beacon', 'Drop the lock', 'Boost beacon 1'], ['Team signal noisy', 'Narrow the lock', 'Energise now', 'Widen the lock'], ['Lock drifting, team moving', 'Re-centre on the team', 'Hold position', 'Drop the lock']], idle: ['Pad lamp test', 'Call for transporter 2', 'Buffer cycle chime'] },
  core: { calls: [['Core temp spiking!', 'Call a throttle-back', 'Raise output', 'Vent coolant'], ['Margin under 10 %', 'Shed the burst load', 'Hold steady', 'Add a power tap'], ['Injector 3 running hot', 'Trim injector 3', 'Trim injector 1', 'Ignore it']], idle: ['Gauge lamp test', 'Call for the plant', 'Shift chime'] },
  sensors: { calls: [['Faint return, bearing 040', 'Tag and log bearing 040', 'Log bearing 400', 'Ignore it'], ['Closing contact, 2 km/s', 'Warn the helm', 'Log it for later', 'Raise shields'], ['Drift past the limit', 'Log drift and recalibrate', 'Shut down the array', 'Raise the gain']], idle: ['Sensor lamp test', 'Self-test chime', 'Call for the lab'] },
  recover: { calls: [['Shuttle on final', 'Paddles: come ahead', 'Paddles: wave off', 'Open the wrong bay'], ['Shuttle over the mark', 'Signal stop', 'Signal come ahead', 'Chock the wrong wheel'], ['Skids down', 'Chock and tie down', 'Start fuelling', 'Wave off']], idle: ['Bay lamp test', 'Call for deck 2', 'Comm check'] },
  lockdown: { calls: [['Intruder drill: seal deck 4', 'Seal the deck 4 doors', 'Seal deck 2', 'Announce it first'], ['Drill: hold the transporter room', 'Lock the room and hold', 'Leave to help', 'Open the door'], ['All clear from security', 'Unseal and report', 'Stay sealed', 'Ask again']], idle: ['Door lamp test', 'Call for brig post', 'Comm check'] },
  drill: { calls: [['Drill casualty, deck 3', 'Send the team to deck 3', 'Send them to deck 5', 'Wait for more'], ['Burn injury, galley', 'Burn kit to the galley', 'Splint kit to the galley', 'Ask for details'], ['Station reports ready', 'Stop the clock and log it', 'Reset the drill', 'Log it later']], idle: ['Alarm test', 'Call for sickbay 2', 'Comm chime'] },
};

// ---- games
export function createGame(kind, seed = 1, opts = {}) {
  const K = KINDS[kind]; if (!K) throw new Error('no mini-game ' + kind);
  const rnd = mulberry32((seed >>> 0) || 1), calm = !!opts.calm, slow = calm ? 0.6 : 1, theme = opts.theme || null;
  const g = { kind, title: K.title, rule: K.rule, state: 'play', strikes: 0, maxStrikes: K.strikes, t: 0, limit: K.limit * (calm ? 1.5 : 1), events: [], held: {}, theme, sub: SUB[kind]?.[theme] || '' };
  const ev = (type, extra = {}) => { g.events.push({ type, t: +g.t.toFixed(2), ...extra }); if (g.events.length > 40) g.events.shift(); };
  const strike = (why) => { g.strikes++; ev('strike', { why }); if (g.maxStrikes && g.strikes >= g.maxStrikes) end('fail', 'strikes'); };
  const end = (state, why) => { if (g.state !== 'play') return; g.state = state; g.why = why; ev(state, { why }); };
  g.cancel = () => end('cancel', 'cancelled');
  g.result = () => ({ state: g.state, strikes: g.strikes, t: +g.t.toFixed(2), why: g.why || null });
  g.hint = () => []; g.bad = () => null;
  // a "pick" game: rounds of choices, one right answer each (keys 1..n; Y / N for two-way judgements). gen(i) -> { n, answer, why, ... }
  const rounds = (n, gen, yn = false) => {
    g.round = 0; g.rounds = n; g.cur = gen(0);
    g.key = (code, down = true) => {
      if (!down || g.state !== 'play') return false; const d = yn && code === 'KeyY' ? 1 : yn && code === 'KeyN' ? 2 : DIG(code); if (!d || d > g.cur.n) return false;
      if (d - 1 === g.cur.answer) { ev('hit', { round: g.round, d }); g.round++; if (g.round >= g.rounds) end('win', 'done'); else g.cur = gen(g.round); }
      else { g.cur.missed = (g.cur.missed || 0) + 1; strike(g.cur.why || 'wrong'); }
      return true;
    };
    g.solve = () => g.cur.answer + 1; g.hint = () => [['Digit' + (g.cur.answer + 1), true]]; g.bad = () => 'Digit' + ((g.cur.answer + 1) % g.cur.n + 1);
    g.view = () => ({ round: g.round, rounds: g.rounds, cur: g.cur });
  };
  if (kind === 'sequence') {
    g.code = Array.from({ length: 5 }, () => 1 + Math.floor(rnd() * 4)); g.pos = 0;
    g.key = (code, down = true) => { if (!down || g.state !== 'play') return false; const d = DIG(code); if (!d || d > 4) return false; if (d === g.code[g.pos]) { g.pos++; ev('hit', { d }); if (g.pos >= g.code.length) end('win', 'code'); } else strike('wrong key'); return true; };
    g.solve = () => g.code[g.pos];   // the right key now (tests / auto-play)
    g.hint = () => [['Digit' + g.solve(), true]]; g.bad = () => 'Digit' + (g.solve() % 4 + 1);
    g.view = () => ({ code: g.code, pos: g.pos });
  } else if (kind === 'wires') {
    const n = 4, perm = [0, 1, 2, 3]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    if (perm.every((p, i) => p === i)) [perm[0], perm[1]] = [perm[1], perm[0]];   // never already wired
    g.right = perm;   // right[k] = which lead colour sits at terminal k
    g.done = [false, false, false, false]; g.sel = 0;
    const next = () => { const i = g.done.findIndex(x => !x); g.sel = i < 0 ? 0 : i; };
    g.key = (code, down = true) => {
      if (!down || g.state !== 'play') return false;
      if (code === 'ArrowUp' || code === 'KeyW') { let s = g.sel; for (let k = 0; k < n; k++) { s = (s + n - 1) % n; if (!g.done[s]) break; } g.sel = s; return true; }
      if (code === 'ArrowDown' || code === 'KeyS') { let s = g.sel; for (let k = 0; k < n; k++) { s = (s + 1) % n; if (!g.done[s]) break; } g.sel = s; return true; }
      const d = DIG(code); if (!d || d > n) return false;
      if (g.right[d - 1] === g.sel && !g.done[g.sel]) { g.done[g.sel] = true; ev('hit', { lead: g.sel, term: d }); if (g.done.every(Boolean)) end('win', 'wired'); else next(); } else strike('spark');
      return true;
    };
    g.solve = () => 1 + g.right.indexOf(g.sel);
    g.hint = () => [['Digit' + g.solve(), true]]; g.bad = () => 'Digit' + (g.solve() % 4 + 1);
    g.view = () => ({ right: g.right, done: g.done, sel: g.sel });
  } else if (kind === 'dial') {
    g.need = 3; g.hits = 0; g.x = 0; g.dir = 1; g.speed = (0.55 + rnd() * 0.15) * slow; g.band = [0, 0];
    const place = () => { const w = (0.22 - g.hits * 0.04) * (calm ? 1.3 : 1), c = 0.25 + rnd() * 0.5; g.band = [clamp(c - w / 2, 0.02, 0.98 - w), 0]; g.band[1] = g.band[0] + w; };
    place();
    g.key = (code, down = true) => { if (!down || g.state !== 'play' || (code !== 'Space' && code !== 'Enter')) return false; if (g.x >= g.band[0] && g.x <= g.band[1]) { g.hits++; ev('hit', { x: +g.x.toFixed(3) }); if (g.hits >= g.need) end('win', 'held'); else { place(); g.speed *= 1.12; } } else strike('spike'); return true; };
    g.step = (dt) => { g.x += g.dir * g.speed * dt; if (g.x > 1) { g.x = 2 - g.x; g.dir = -1; } if (g.x < 0) { g.x = -g.x; g.dir = 1; } };
    g.inBand = () => g.x >= g.band[0] && g.x <= g.band[1];
    g.hint = () => g.inBand() ? [['Space', true]] : []; g.bad = () => g.inBand() ? null : 'Space';
    g.view = () => ({ x: g.x, band: g.band, hits: g.hits, need: g.need });
  } else if (kind === 'calibrate') {
    g.need = 3; g.fill = 0; g.m = 0; g.target = 0.5; g.tw = (calm ? 0.16 : 0.11); g.ph = rnd() * 6.28; g.f1 = (0.35 + rnd() * 0.2) * slow; g.f2 = (0.9 + rnd() * 0.3) * slow;   // the marker starts parked at the left stop: the reading (0.17..0.83) never drifts onto it, so doing nothing never calibrates
    g.key = (code, down = true) => { const k = { ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R' }[code]; if (!k) return false; g.held[k] = !!down; return true; };
    g.step = (dt) => {
      g.target = clamp(0.5 + 0.25 * Math.sin(g.t * g.f1 * 2 + g.ph) + 0.08 * Math.sin(g.t * g.f2 * 2 + g.ph * 2), 0.17, 0.83);
      g.m = clamp(g.m + ((g.held.R ? 1 : 0) - (g.held.L ? 1 : 0)) * 0.55 * dt, 0, 1);
      if (Math.abs(g.m - g.target) <= g.tw) g.fill += dt; else g.fill = Math.max(0, g.fill - dt * 0.35);
      if (g.fill >= g.need) end('win', 'calibrated');
    };
    g.inBand = () => Math.abs(g.m - g.target) <= g.tw;
    g.hint = () => [['ArrowRight', g.target > g.m + 0.02], ['ArrowLeft', g.target < g.m - 0.02]];
    g.view = () => ({ m: g.m, target: g.target, tw: g.tw, fill: g.fill, need: g.need });
  }
  // ---------------------------------------------------------------- medical
  else if (kind === 'vitals') {   // four beds, one reading out of range per round
    const val = (k, lo, hi) => k === 'Temp' ? +(lo + rnd() * (hi - lo)).toFixed(1) : ri(rnd, Math.ceil(lo), Math.floor(hi));
    rounds(3, () => {
      const beds = Array.from({ length: 4 }, () => ({ name: `${pick(rnd, RANKS)} ${pick(rnd, SURN)}`, v: { HR: val('HR', 64, 96), SpO2: val('SpO2', 96, 99), Temp: val('Temp', 36.3, 37.3), BP: val('BP', 104, 136) } }));
      const answer = ri(rnd, 0, 3), k = pick(rnd, Object.keys(VITAL)), [lo, hi] = VITAL[k], high = k === 'SpO2' ? false : rnd() < 0.5;
      beds[answer].v[k] = k === 'HR' ? (high ? ri(rnd, 122, 148) : ri(rnd, 38, 48)) : k === 'SpO2' ? ri(rnd, 84, 90) : k === 'Temp' ? (high ? +(38.6 + rnd()).toFixed(1) : +(34.6 + rnd() * 0.6).toFixed(1)) : (high ? ri(rnd, 162, 184) : ri(rnd, 74, 86));
      return { n: 4, answer, beds, flag: k, why: 'wrong bed' };
    });
  } else if (kind === 'hypo') {   // dial the prescribed dose, Space to give it
    g.max = 30; g.need = 3; g.hits = 0;
    const next = () => { g.drug = pick(rnd, DRUGS); g.dose = ri(rnd, 3, 27); g.patient = `${pick(rnd, RANKS)} ${pick(rnd, SURN)}`; do { g.v = ri(rnd, 0, 30); } while (Math.abs(g.v - g.dose) < 4); };
    next();
    g.key = (code, down = true) => {
      if (!down || g.state !== 'play') return false; const a = ARROW[code];
      if (a) { g.v = clamp(g.v + (a === 'R' ? 1 : a === 'L' ? -1 : a === 'U' ? 5 : -5), 0, g.max); return true; }
      if (code !== 'Space' && code !== 'Enter') return false;
      if (g.v === g.dose) { g.hits++; ev('hit', { dose: g.dose }); if (g.hits >= g.need) end('win', 'dosed'); else next(); } else strike(g.v > g.dose ? 'overdose' : 'underdose');
      return true;
    };
    g.hint = () => { const d = g.dose - g.v; return d === 0 ? [['Space', true]] : [[Math.abs(d) >= 5 ? (d > 0 ? 'ArrowUp' : 'ArrowDown') : (d > 0 ? 'ArrowRight' : 'ArrowLeft'), true]]; };
    g.bad = () => g.v === g.dose ? null : 'Space';
    g.view = () => ({ v: g.v, dose: g.dose, drug: g.drug, hits: g.hits, need: g.need, patient: g.patient });
  } else if (kind === 'tray') {   // layout card vs the tray: one slot empty or wrong
    rounds(3, () => {
      const layout = shuffle(rnd, INSTR), tray = layout.slice(), answer = ri(rnd, 0, 5), missing = rnd() < 0.5;
      tray[answer] = missing ? null : pick(rnd, INSTR.filter(x => x !== layout[answer]));
      return { n: 6, answer, layout, tray, missing, why: 'that slot is fine' };
    });
  } else if (kind === 'meds') {   // count one drug in the drawer; the manifest may be off by one or two
    rounds(3, (i) => {
      const drugs = shuffle(rnd, DRUGS), drug = drugs[0], other = drugs[1], count = ri(rnd, 2, 8), off = i === 0 || rnd() < 0.5 ? pick(rnd, [-2, -1, 1, 2]) : 0;
      let manifest = count + off; if (manifest < 1 || manifest > 9) manifest = count - off; const extra = ri(rnd, 2, 5);
      const slots = shuffle(rnd, Array.from({ length: 24 }, (_, k) => k)).slice(0, count + extra).map((s, k) => ({ s, drug: k < count ? 0 : 1, rot: rnd() * 0.6 - 0.3 }));
      return { n: 9, answer: count - 1, drug, other, count, manifest, vials: slots, why: 'count off' };
    });
  } else if (kind === 'counsel') {   // three short conversations, choose the reply that listens
    const bank = [...(COUNSEL_T[theme] || []), ...(COUNSEL_T[theme] ? shuffle(rnd, COUNSEL).slice(0, 2) : COUNSEL)], order = [...(COUNSEL_T[theme] ? shuffle(rnd, COUNSEL_T[theme].map((_, i) => i)).slice(0, 2) : []), ...shuffle(rnd, bank.map((_, i) => i).filter(i => !COUNSEL_T[theme] || i >= COUNSEL_T[theme].length))].slice(0, 3);
    rounds(3, (i) => { const c = bank[order[i]], opt = shuffle(rnd, [0, 1, 2]); return { n: 3, answer: opt.indexOf(0), prompt: c[0], who: `${pick(rnd, RANKS)} ${pick(rnd, SURN)}`, replies: opt.map(k => c[1 + k]), why: 'they close up' }; });
  }
  // ---------------------------------------------------------------- engineering + hydroponics: move units between a reserve and bars, Enter commits
  else if (kind === 'power' || kind === 'nutrient') {
    const nb = kind === 'power' ? 4 : 3; g.need = kind === 'power' ? 1 : 2; g.hits = 0; g.sel = 0; g.cap = 6;
    const next = () => {
      g.names = kind === 'power' ? (BUSES.power.includes(theme) ? [theme, ...shuffle(rnd, BUSES.power.filter(b => b !== theme)).slice(0, nb - 1)] : shuffle(rnd, BUSES.power).slice(0, nb)) : BUSES.nutrient.slice(); g.bed = kind === 'nutrient' ? pick(rnd, ['Tomato bed', 'Lettuce bed', 'Bean bed', 'Herb bed', 'Root bed', 'Algae tank']) : null;
      g.target = Array.from({ length: nb }, () => ri(rnd, 1, 5)); g.cur = g.target.map(t => clamp(t + ri(rnd, -3, 3), 0, g.cap));
      if (g.cur.every((c, i) => c === g.target[i])) g.cur[0] = g.target[0] === 0 ? 1 : 0;
      g.total = Math.max(g.target.reduce((a, b) => a + b, 0), g.cur.reduce((a, b) => a + b, 0)) + ri(rnd, 0, 2); g.reserve = g.total - g.cur.reduce((a, b) => a + b, 0); g.sel = 0;
    };
    next();
    g.key = (code, down = true) => {
      if (!down || g.state !== 'play') return false; const a = ARROW[code];
      if (a === 'U' || a === 'D') { g.sel = (g.sel + (a === 'D' ? 1 : nb - 1)) % nb; return true; }
      if (a === 'R') { if (g.reserve > 0 && g.cur[g.sel] < g.cap) { g.cur[g.sel]++; g.reserve--; } return true; }
      if (a === 'L') { if (g.cur[g.sel] > 0) { g.cur[g.sel]--; g.reserve++; } return true; }
      if (code !== 'Enter' && code !== 'Space') return false;
      if (g.cur.every((c, i) => c === g.target[i])) { g.hits++; ev('hit', {}); if (g.hits >= g.need) end('win', 'routed'); else next(); } else strike(kind === 'power' ? 'breaker trip' : 'bad mix');
      return true;
    };
    g.hint = () => {
      const over = g.cur.findIndex((c, i) => c > g.target[i]), under = g.cur.findIndex((c, i) => c < g.target[i]), want = over >= 0 ? over : under;
      if (want < 0) return [['Enter', true]]; if (want !== g.sel) return [[want > g.sel ? 'ArrowDown' : 'ArrowUp', true]]; return [[over >= 0 ? 'ArrowLeft' : 'ArrowRight', true]];
    };
    g.bad = () => g.cur.every((c, i) => c === g.target[i]) ? null : 'Enter';
    g.view = () => ({ cur: g.cur, target: g.target, reserve: g.reserve, sel: g.sel, hits: g.hits, need: g.need, names: g.names });
  } else if (kind === 'bench') {   // five parts: pass (1) or reject (2) against the spec
    const pool = BENCH[theme] || BENCH.eng;
    rounds(5, (i) => {
      const [name, unit, lo, hi] = pick(rnd, pool), bad = i === 0 ? rnd() < 0.5 : rnd() < 0.45, span = hi - lo || 1, dec = span < 3 ? 1 : 0;
      let v = lo + span * (0.15 + rnd() * 0.7); if (bad) v = rnd() < 0.5 && lo > 0 ? lo - span * (0.2 + rnd() * 0.4) : hi + span * (0.2 + rnd() * 0.4);
      v = +v.toFixed(dec); if (!bad) v = clamp(v, lo, hi);
      return { n: 2, answer: bad ? 1 : 0, name, unit, lo, hi, v, serial: `${pick(rnd, CODECH.split(''))}${ri(rnd, 100, 999)}`, why: bad ? 'passed a bad part' : 'rejected a good part' };
    }, true);
  }
  // ---------------------------------------------------------------- science
  else if (kind === 'tune') {   // hidden carrier: sweep with the hold keys, Space locks near the peak
    g.need = 3; g.hits = 0; g.x = 0.5; g.speed = 0.38; g.tol = calm ? 0.05 : 0.035;
    const next = () => { do { g.peak = 0.06 + rnd() * 0.88; } while (Math.abs(g.peak - g.x) < 0.25); g.noise = Array.from({ length: 64 }, () => rnd()); };
    next();
    g.strength = () => Math.exp(-Math.pow((g.x - g.peak) / 0.09, 2));
    g.locked = () => Math.abs(g.x - g.peak) <= g.tol;
    g.key = (code, down = true) => {
      const a = ARROW[code]; if (a === 'L' || a === 'R') { g.held[a] = !!down; return true; }
      if (!down || g.state !== 'play' || (code !== 'Space' && code !== 'Enter')) return false;
      if (g.locked()) { g.hits++; ev('hit', {}); if (g.hits >= g.need) end('win', 'locked'); else next(); } else strike('static');
      return true;
    };
    g.step = (dt) => { g.x = clamp(g.x + ((g.held.R ? 1 : 0) - (g.held.L ? 1 : 0)) * g.speed * dt, 0, 1); };
    g.hint = () => g.locked() && Math.abs(g.x - g.peak) < g.tol * 0.7 ? [['ArrowRight', false], ['ArrowLeft', false], ['Space', true]] : [['ArrowRight', g.peak > g.x], ['ArrowLeft', g.peak < g.x]];
    g.bad = () => g.locked() ? null : 'Space';
    g.view = () => ({ x: g.x, peak: +g.peak.toFixed(3), hits: g.hits, need: g.need, s: +g.strength().toFixed(3) });
  } else if (kind === 'classify') {   // a legend of four classes; read each contact's three traits
    const pool = theme === 'bio' ? BIO : CONTACT; g.legend = shuffle(rnd, pool).slice(0, 4);
    rounds(4, () => { const answer = ri(rnd, 0, 3); return { n: 4, answer, c: g.legend[answer], bearing: ri(rnd, 0, 359), range: ri(rnd, 2, 90), why: 'misclassified' }; });
  }
  // ---------------------------------------------------------------- security
  else if (kind === 'badge') {   // the door rule, then five badges: admit (1) or deny (2)
    const doors = [['Armory', ['Security', 'Command'], 3], ['Science lab', ['Science', 'Command', 'Medical'], 2], ['Main engineering', ['Engineering', 'Command'], 2], ['Isolation ward', ['Medical'], 3], ['Shuttlebay', ['Operations', 'Command', 'Engineering'], 2], ['Brig', ['Security'], 2],
      ['Transporter room', ['Operations', 'Security', 'Command'], 2], ['Cargo bay', ['Operations', 'Engineering', 'Security'], 1], ['Bridge', ['Command', 'Security'], 4]];
    const [door, depts, min] = doors.find(d => d[0] === theme) || pick(rnd, doors); g.rule = { door, depts, min };
    rounds(5, (i) => {
      const deny = i === 0 ? rnd() < 0.5 : rnd() < 0.5, why = deny ? pick(rnd, ['dept', 'clear', 'expired']) : null;
      const dept = why === 'dept' ? pick(rnd, DEPTS.filter(d => !depts.includes(d))) : pick(rnd, depts), clear = why === 'clear' ? ri(rnd, 1, min - 1) : ri(rnd, min, 5), expired = why === 'expired';
      return { n: 2, answer: deny ? 1 : 0, name: `${pick(rnd, RANKS)} ${pick(rnd, SURN)}`, dept, clear, expired, face: ri(rnd, 0, 999), denyWhy: why, why: deny ? 'let the wrong person in' : 'turned away crew who belong' };
    }, true);
  } else if (kind === 'doorlog') {   // six log lines: who opened the restricted door without being on the list
    rounds(2, () => {
      const people = shuffle(rnd, SURN).slice(0, 6), ok = people.slice(0, 3), restricted = pick(rnd, ['Armory', 'Brig control', 'Computer core', 'Isolation ward', 'Torpedo room']), others = ['Mess', 'Deck 4 corridor', 'Cargo bay', 'Lounge', 'Lift 2'];
      const answer = ri(rnd, 0, 5); let t = ri(rnd, 0, 300);
      const lines = Array.from({ length: 6 }, (_, k) => { t += ri(rnd, 3, 40); const hm = `${String(Math.floor(t / 60) % 24).padStart(2, '0')}${String(t % 60).padStart(2, '0')}`;
        if (k === answer) return { hm, who: pick(rnd, people.slice(3)), door: restricted };
        return rnd() < 0.5 ? { hm, who: pick(rnd, ok), door: restricted } : { hm, who: pick(rnd, people), door: pick(rnd, others) }; });
      return { n: 6, answer, lines, ok, restricted, why: 'that entry is fine' };
    });
  }
  // ---------------------------------------------------------------- galley
  else if (kind === 'cook') {   // three pans: pull each while it sits in the DONE window
    g.win = [0.72, 0.92]; g.dishes = shuffle(rnd, COOKSET[theme] || COOK).slice(0, 3);
    g.pans = [0, 1, 2].map(i => ({ p: -i * (0.22 + rnd() * 0.1), rate: (0.1 + rnd() * 0.05) * slow, done: false }));
    g.inWin = (i) => !g.pans[i].done && g.pans[i].p >= g.win[0] && g.pans[i].p <= g.win[1];
    g.key = (code, down = true) => {
      if (!down || g.state !== 'play') return false; const d = DIG(code); if (!d || d > 3) return false; const pan = g.pans[d - 1]; if (pan.done) return true;
      if (g.inWin(d - 1)) { pan.done = true; ev('hit', { pan: d }); if (g.pans.every(x => x.done)) end('win', 'served'); } else strike('raw');
      return true;
    };
    g.step = (dt) => { for (const pan of g.pans) { if (pan.done) continue; pan.p += pan.rate * dt; if (pan.p > 1) { pan.p = 0.15; strike('burnt'); if (g.state !== 'play') return; } } };
    g.hint = () => { const i = g.pans.findIndex((_, k) => g.inWin(k) && g.pans[k].p > g.win[0] + 0.02); return i >= 0 ? [['Digit' + (i + 1), true]] : []; };
    g.bad = () => { const i = g.pans.findIndex((x, k) => !x.done && !g.inWin(k)); return i >= 0 ? 'Digit' + (i + 1) : null; };
    g.view = () => ({ pans: g.pans.map(x => ({ p: +x.p.toFixed(3), done: x.done })), win: g.win });
  } else if (kind === 'fresh') {   // one item on each shelf is past its use-by day
    rounds(3, () => {
      const today = ri(rnd, 40, 330), items = shuffle(rnd, SHELFSET[theme] || SHELF).slice(0, 5), answer = ri(rnd, 0, 4);
      return { n: 5, answer, today, items: items.map(([name, unit], k) => ({ name, unit, day: k === answer ? today - ri(rnd, 1, 9) : today + ri(rnd, 0, 40), qty: ri(rnd, 2, 12) })), why: 'still in date' };
    });
  }
  // ---------------------------------------------------------------- cargo
  else if (kind === 'manifest') {   // the crate whose code matches the manifest line exactly
    const code = () => `${pick(rnd, CODECH.split(''))}${pick(rnd, CODECH.split(''))}-${ri(rnd, 10, 99)}-${pick(rnd, CODECH.split(''))}`;
    const near = (c) => { const a = c.split(''), m = rnd(); if (m < 0.33) { const i = pick(rnd, [3, 4]); a[i] = String((+a[i] + ri(rnd, 1, 8)) % 10); } else if (m < 0.66) { if (a[3] !== a[4]) [a[3], a[4]] = [a[4], a[3]]; else a[3] = String((+a[3] + 1) % 10); } else { const i = pick(rnd, [0, 1, 6]); let ch; do { ch = pick(rnd, CODECH.split('')); } while (ch === a[i]); a[i] = ch; } return a.join(''); };
    rounds(4, () => {
      const want = code(), set = new Set([want]); while (set.size < 4) set.add(near(want));
      const crates = shuffle(rnd, [...set]); return { n: 4, answer: crates.indexOf(want), want, crates, dest: pick(rnd, DESTS[theme] || ['Bay 1', 'Bay 2', 'Hold A', 'Hold B', 'Sickbay', 'Lab', 'Galley']), why: 'wrong crate' };
    });
  } else if (kind === 'loadbal') {   // stow six crates port / starboard, keep the trim within the limit
    g.queue = Array.from({ length: 6 }, () => ri(rnd, 1, 3)); g.L = ri(rnd, 0, 2); g.R = ri(rnd, 0, 2); g.lim = 3; g.i = 0; g.sides = theme === 'pads' ? ['PAD BANK A', 'PAD BANK B'] : theme === 'sleds' ? ['SLED 1', 'SLED 2'] : ['PORT', 'STARBOARD'];
    g.key = (code, down = true) => {
      if (!down || g.state !== 'play') return false; const a = ARROW[code]; if (a !== 'L' && a !== 'R') return false; const w = g.queue[g.i];
      const L = g.L + (a === 'L' ? w : 0), R = g.R + (a === 'R' ? w : 0);
      if (Math.abs(L - R) > g.lim) { strike('list'); return true; }
      g.L = L; g.R = R; ev('hit', { w, side: a }); if (++g.i >= g.queue.length) end('win', 'stowed'); return true;
    };
    g.hint = () => [[g.L <= g.R ? 'ArrowLeft' : 'ArrowRight', true]];
    g.bad = () => { const w = g.queue[g.i], heavy = g.L > g.R ? 'L' : 'R'; return Math.abs((g.L + (heavy === 'L' ? w : 0)) - (g.R + (heavy === 'R' ? w : 0))) > g.lim ? (heavy === 'L' ? 'ArrowLeft' : 'ArrowRight') : null; };
    g.view = () => ({ L: g.L, R: g.R, i: g.i, queue: g.queue, lim: g.lim });
  }
  // ---------------------------------------------------------------- bridge
  else if (kind === 'course') {   // step a plot through a hazard field to two waypoints
    const W = 9, H = 5; g.W = W; g.H = H; g.need = 2; g.hits = 0; g.nHaz = { debris: 12, ion: 10, traffic: 9, survey: 8, asteroids: 11 }[theme] || 11; g.hazName = { debris: 'debris', ion: 'ion cell', traffic: 'traffic', survey: 'unsurveyed', asteroids: 'rock' }[theme] || 'hazard';
    const key = (x, y) => y * W + x, nb = (x, y) => [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < W && b < H);
    const bfs = (sx, sy, tx, ty) => { const prev = new Map([[key(sx, sy), null]]), q = [[sx, sy]]; while (q.length) { const [x, y] = q.shift(); if (x === tx && y === ty) break; for (const [a, b] of nb(x, y)) if (!g.haz.has(key(a, b)) && !prev.has(key(a, b))) { prev.set(key(a, b), [x, y]); q.push([a, b]); } } if (!prev.has(key(tx, ty))) return null; const path = []; let c = [tx, ty]; while (c && !(c[0] === sx && c[1] === sy)) { path.unshift(c); c = prev.get(key(c[0], c[1])); } return path; };
    g.pos = [0, ri(rnd, 0, H - 1)];
    const leg = () => {
      const tx = g.pos[0] < W / 2 ? W - 1 : 0, ty = ri(rnd, 0, H - 1); g.goal = [tx, ty];
      for (let tries = 0; tries < 30; tries++) { g.haz = new Set(); while (g.haz.size < g.nHaz) { const x = ri(rnd, 1, W - 2), y = ri(rnd, 0, H - 1); if (!(x === g.pos[0] && y === g.pos[1])) g.haz.add(key(x, y)); } const p = bfs(g.pos[0], g.pos[1], tx, ty); if (p && p.length >= 8) return; }
      g.haz = new Set();   // never unsolvable
    };
    leg();
    g.isHaz = (x, y) => g.haz.has(key(x, y));
    g.key = (code, down = true) => {
      if (!down || g.state !== 'play') return false; const a = ARROW[code]; if (!a) return false; const [dx, dy] = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] }[a], x = g.pos[0] + dx, y = g.pos[1] + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) return true; if (g.haz.has(key(x, y))) { strike('hazard'); return true; }
      g.pos = [x, y]; if (x === g.goal[0] && y === g.goal[1]) { g.hits++; ev('hit', {}); if (g.hits >= g.need) end('win', 'plotted'); else leg(); } return true;
    };
    const dirKey = (x, y) => { const dx = x - g.pos[0], dy = y - g.pos[1]; return dx > 0 ? 'ArrowRight' : dx < 0 ? 'ArrowLeft' : dy > 0 ? 'ArrowDown' : 'ArrowUp'; };
    g.hint = () => { const p = bfs(g.pos[0], g.pos[1], g.goal[0], g.goal[1]); return p && p.length ? [[dirKey(...p[0]), true]] : []; };
    g.bad = () => { const h = nb(...g.pos).find(([a, b]) => g.haz.has(key(a, b))); return h ? dirKey(...h) : null; };
    g.view = () => ({ pos: g.pos, goal: g.goal, haz: [...g.haz], hits: g.hits });
  } else if (kind === 'decode') {   // a codebook of four 8-pulse patterns; static flips one pulse in the received one
    const dist = (a, b) => { let d = 0, x = a ^ b; while (x) { d += x & 1; x >>= 1; } return d; };
    rounds(3, () => {
      const codes = []; for (let tries = 0; codes.length < 4 && tries < 500; tries++) { const c = ri(rnd, 1, 254); if (codes.every(o => dist(o, c) >= 3)) codes.push(c); }
      const names = shuffle(rnd, MSGSET[theme] || MSGS).slice(0, 4), answer = ri(rnd, 0, 3), flip = ri(rnd, 0, 7), rx = codes[answer] ^ (1 << flip);
      return { n: 4, answer, codes, names, rx, flip, why: 'misread' };
    });
  }
  // ---------------------------------------------------------------- helm: station keeping, braking burn, position fix
  else if (kind === 'station') {   // a current pushes the ship outward from the mark; hold arrows to thrust back into the box and keep it there
    g.need = 4; g.fill = 0; g.box = calm ? 0.34 : 0.26; g.thrust = 0.5; g.drift = (0.15 + rnd() * 0.04) * slow; g.rot = (rnd() - 0.5) * 1.6; g.ph = rnd() * 6.28;
    const a0 = rnd() * 6.28; g.pos = [Math.cos(a0) * 0.62, Math.sin(a0) * 0.62];
    g.key = (code, down = true) => { const a = ARROW[code]; if (!a) return false; g.held[a] = !!down; return true; };
    g.inBox = () => Math.abs(g.pos[0]) <= g.box && Math.abs(g.pos[1]) <= g.box;
    g.step = (dt) => {
      const r = Math.hypot(...g.pos) || 1e-3, ang = Math.atan2(g.pos[1], g.pos[0]) + g.rot * Math.sin(g.t * 0.5 + g.ph);   // outward, swinging
      const tx = (g.held.R ? 1 : 0) - (g.held.L ? 1 : 0), ty = (g.held.D ? 1 : 0) - (g.held.U ? 1 : 0);
      g.pos = g.pos.map((p, i) => clamp(p + (Math.cos(ang - (i ? Math.PI / 2 : 0)) * g.drift * Math.min(1, r * 4) + (i ? ty : tx) * g.thrust) * dt, -1, 1));
      if (g.inBox()) g.fill += dt; else g.fill = Math.max(0, g.fill - dt * 0.4);
      if (g.fill >= g.need) end('win', 'held');
    };
    g.hint = () => { const [x, y] = g.pos, e = 0.04; return [['ArrowRight', x < -e], ['ArrowLeft', x > e], ['ArrowDown', y < -e], ['ArrowUp', y > e]]; };
    g.view = () => ({ pos: g.pos.map(v => +v.toFixed(3)), box: g.box, fill: +g.fill.toFixed(2), need: g.need });
  } else if (kind === 'burn') {   // brake (hold Space) so the ship reaches the marker inside the speed band; too fast = wave-off (go round), stalled short = fault
    g.need = 3; g.hits = 0; g.acc = 0.16 * (calm ? 0.8 : 1); g.band = calm ? [0.015, 0.1] : [0.02, 0.08];
    const next = () => { g.d0 = 0.75 + rnd() * 0.15; g.d = g.d0; g.v = (0.26 + rnd() * 0.06) * (calm ? 0.8 : 1); };
    next(); g.waveoffs = 0;
    g.key = (code, down = true) => { if (code !== 'Space') return false; g.held.S = !!down; return true; };
    g.step = (dt) => {
      if (g.held.S) g.v = Math.max(0, g.v - g.acc * dt); g.d -= g.v * dt;
      if (g.v <= 0.004 && g.d > 0.02) { strike('stalled'); if (g.state === 'play') next(); return; }
      if (g.d <= 0) { if (g.v >= g.band[0] && g.v <= g.band[1]) { g.hits++; ev('hit', { v: +g.v.toFixed(3) }); if (g.hits >= g.need) end('win', 'docked'); else next(); } else { g.waveoffs++; ev('waveoff', {}); next(); } }
    };
    const tgt = () => (g.band[0] + g.band[1]) / 2;
    g.hint = () => [['Space', g.v * g.v - tgt() * tgt() >= 2 * g.acc * Math.max(0, g.d) * 0.9 && g.v > tgt()]];
    g.bad = () => 'Space';
    g.view = () => ({ d: +g.d.toFixed(3), d0: g.d0, v: +g.v.toFixed(3), band: g.band, hits: g.hits, need: g.need });
  } else if (kind === 'fix') {   // three bearing lines from reference stars cross at the ship; three decoys sit on one line each
    const STARS = ['Vega', 'Deneb', 'Altair', 'Rigel', 'Sirius', 'Arcturus', 'Capella', 'Antares', 'Spica', 'Canopus', 'Polaris', 'Aldebaran'];
    rounds(3, () => {
      const P = [0.3 + rnd() * 0.4, 0.3 + rnd() * 0.4], names = shuffle(rnd, STARS).slice(0, 3), base = rnd() * 6.28;
      const stars = names.map((name, i) => { const a = base + i * 2.09 + (rnd() - 0.5) * 0.5; return { name, a, x: P[0] + Math.cos(a) * 0.9, y: P[1] + Math.sin(a) * 0.9 }; });
      const pts = [P]; for (let i = 0, tries = 0; pts.length < 4 && tries < 200; tries++) { const s = stars[i % 3], t = (rnd() < 0.5 ? -1 : 1) * (0.14 + rnd() * 0.16), q = [P[0] - Math.cos(s.a) * t, P[1] - Math.sin(s.a) * t]; if (q.every(v => v > 0.06 && v < 0.94) && pts.every(o => Math.hypot(o[0] - q[0], o[1] - q[1]) > 0.1)) { pts.push(q); i++; } }
      while (pts.length < 4) pts.push([0.1 + 0.25 * pts.length, 0.12]);
      const order = shuffle(rnd, [0, 1, 2, 3]); return { n: 4, answer: order.indexOf(0), stars, cands: order.map(k => pts[k]), why: 'bad fix' };
    });
  }
  // ---------------------------------------------------------------- transporter targeting
  else if (kind === 'coords') {   // dial three axes onto drifting target coordinates, Enter energises
    g.need = 2; g.hits = 0; g.sel = 0; g.every = calm ? 4.5 : 3; g.next = g.every;
    const next = () => { g.target = [0, 1, 2].map(() => ri(rnd, 10, 89)); g.cur = g.target.map(t => t + pick(rnd, [-1, 1]) * ri(rnd, 2, 6)); g.sel = 0; };
    next();
    g.step = () => { if (g.t >= g.next) { g.next += g.every; const ax = ri(rnd, 0, 2); g.target[ax] = clamp(g.target[ax] + pick(rnd, [-1, 1]), 0, 99); ev('drift', { ax }); } };
    g.key = (code, down = true) => {
      if (!down || g.state !== 'play') return false; const a = ARROW[code];
      if (a === 'U' || a === 'D') { g.sel = (g.sel + (a === 'D' ? 1 : 2)) % 3; return true; }
      if (a === 'L' || a === 'R') { g.cur[g.sel] = clamp(g.cur[g.sel] + (a === 'R' ? 1 : -1), 0, 99); return true; }
      if (code !== 'Enter' && code !== 'Space') return false;
      if (g.cur.every((c, i) => c === g.target[i])) { g.hits++; ev('hit', {}); if (g.hits >= g.need) end('win', 'energised'); else next(); } else strike('scattered pattern');
      return true;
    };
    g.hint = () => { const i = g.cur.findIndex((c, k) => c !== g.target[k]); if (i < 0) return [['Enter', true]]; if (i !== g.sel) return [[(i - g.sel + 3) % 3 === 1 ? 'ArrowDown' : 'ArrowUp', true]]; return [[g.cur[i] < g.target[i] ? 'ArrowRight' : 'ArrowLeft', true]]; };
    g.bad = () => g.cur.every((c, i) => c === g.target[i]) ? null : 'Enter';
    g.view = () => ({ target: g.target.slice(), cur: g.cur.slice(), sel: g.sel, hits: g.hits, need: g.need });
  }
  // ---------------------------------------------------------------- paperwork and command (theme = department, from the job)
  else if (kind === 'form') {   // copy a reading, set the status, address it; Enter files. Two reports
    const T = FORMS[theme] || FORMS.cmd, to = (opts.label && RECIPS.find(([re]) => re.test(opts.label))?.[1]) || T.to; g.need = 2; g.hits = 0; g.sel = 0;
    const fmt = (v, step) => step < 1 ? v.toFixed(1) : String(Math.round(v));
    const next = () => {
      const rd = shuffle(rnd, T.rd).slice(0, 4).map(([name, unit, lo, hi]) => { const step = Number.isInteger(lo) && Number.isInteger(hi) ? 1 : 0.1, v = lo + (hi - lo) * (0.1 + rnd() * 0.8); return { name, unit, lo, hi, step, v: +fmt(v, step) }; });
      const out = rnd() < 0.55 ? ri(rnd, 0, 3) : -1; if (out >= 0) { const r = rd[out], span = r.hi - r.lo; r.v = +fmt(rnd() < 0.5 ? r.hi + span * (0.15 + rnd() * 0.3) : Math.max(0, r.lo - span * (0.15 + rnd() * 0.3)), r.step); if (r.v >= r.lo && r.v <= r.hi) r.v = +fmt(r.hi + span * 0.3, r.step); }
      const k = ri(rnd, 0, 3), r = rd[k], val = fmt(r.v, r.step), vals = new Set([val]);
      for (let t = 0; vals.size < 4 && t < 40; t++) vals.add(t < 30 ? fmt(Math.max(0, r.v + pick(rnd, [-3, -2, -1, 1, 2, 3, 10, -10]) * r.step * (t < 10 ? 1 : 3)), r.step) : String(t));
      const outs = shuffle(rnd, rd.map(x => x.name).filter((_, i) => i !== out)).slice(0, out >= 0 ? 2 : 3), st = ['All in limits', ...[...(out >= 0 ? [rd[out].name] : []), ...outs].map(n => `${n} out of limits`)];
      const tos = [to, ...shuffle(rnd, RECIPS.map(x => x[1]).filter(x => x !== to)).slice(0, 3)];
      g.rd = rd; g.fields = [{ name: `${r.name}${r.unit ? ` (${r.unit})` : ''}`, opts: shuffle(rnd, [...vals]), want: val }, { name: 'Status', opts: shuffle(rnd, st), want: out >= 0 ? `${rd[out].name} out of limits` : 'All in limits' }, { name: 'To', opts: shuffle(rnd, tos), want: to }];
      for (const f of g.fields) f.i = ri(rnd, 0, f.opts.length - 1); if (g.fields.every(f => f.opts[f.i] === f.want)) g.fields[0].i = (g.fields[0].i + 1) % g.fields[0].opts.length; g.sel = 0; g.bads = [];
    };
    next();
    const ok = (f) => f.opts[f.i] === f.want;
    g.key = (code, down = true) => {
      if (!down || g.state !== 'play') return false; const a = ARROW[code], f = g.fields[g.sel];
      if (a === 'U' || a === 'D') { g.sel = (g.sel + (a === 'D' ? 1 : g.fields.length - 1)) % g.fields.length; return true; }
      if (a === 'L' || a === 'R') { f.i = (f.i + (a === 'R' ? 1 : f.opts.length - 1)) % f.opts.length; return true; }
      if (code !== 'Enter') return false;
      if (g.fields.every(ok)) { g.hits++; ev('hit', {}); if (g.hits >= g.need) end('win', 'filed'); else next(); } else { g.bads = g.fields.map((x, i) => ok(x) ? -1 : i).filter(i => i >= 0); strike('form bounced'); }
      return true;
    };
    g.hint = () => { const i = g.fields.findIndex(x => !ok(x)); if (i < 0) return [['Enter', true]]; if (i !== g.sel) return [[i > g.sel ? 'ArrowDown' : 'ArrowUp', true]]; return [['ArrowRight', true]]; };
    g.bad = () => g.fields.every(ok) ? null : 'Enter';
    g.view = () => ({ rd: g.rd, fields: g.fields.map(f => ({ name: f.name, v: f.opts[f.i] })), sel: g.sel, hits: g.hits, need: g.need });
  } else if (kind === 'roster') {   // three posts, five people: exactly one qualified + free person per post
    const quals = shuffle(rnd, QUALS[theme] || QUALS.cmd).slice(0, 3), watches = shuffle(rnd, ['First watch', 'Second watch', 'Night watch', 'Day relief', 'Swing shift']).slice(0, 3), names = shuffle(rnd, SURN).slice(0, 5);
    const spare = (QUALS[theme] || QUALS.cmd).find(q => !quals.includes(q)) || 'Admin';
    const people = [0, 1, 2].map(i => ({ name: `${pick(rnd, RANKS)} ${names[i]}`, quals: rnd() < 0.5 ? [quals[i], spare] : [quals[i]], note: 'free' }));
    people.push({ name: `${pick(rnd, RANKS)} ${names[3]}`, quals: [quals[0], quals[1]].slice(0, ri(rnd, 1, 2)), note: pick(rnd, ['on leave', 'in sickbay', 'over hours']) });
    people.push({ name: `${pick(rnd, RANKS)} ${names[4]}`, quals: [quals[ri(rnd, 1, 2)]], note: pick(rnd, ['on another watch', 'on away team']) });
    g.people = shuffle(rnd, people); g.posts = quals.map((q, i) => ({ q, watch: watches[i], who: -1 }));
    rounds(3, (i) => ({ n: 5, answer: g.people.findIndex(p => p.note === 'free' && p.quals[0] === quals[i]), post: i, why: 'cannot take that post' }));
    const k0 = g.key; g.key = (code, down = true) => { const r0 = g.round, ok = k0(code, down); if (g.round > r0) g.posts[r0].who = g.people.findIndex(p => p.note === 'free' && p.quals[0] === quals[r0]); return ok; };
    g.view = () => ({ round: g.round, rounds: g.rounds, cur: g.cur, posts: g.posts.map(p => ({ ...p })), people: g.people });
  } else if (kind === 'queue') {   // five items: severity first, then age; press them in order
    const pool = shuffle(rnd, QITEMS[theme] || QITEMS.cmd), ages = shuffle(rnd, Array.from({ length: 30 }, (_, i) => i + 1));
    g.items = pool.slice(0, 5).map((title, i) => ({ title, sev: i === 0 ? 0 : ri(rnd, 0, 2), age: ages[i], done: false }));
    g.order = g.items.map((_, i) => i).sort((a, b) => g.items[a].sev - g.items[b].sev || g.items[b].age - g.items[a].age); g.k = 0;
    g.key = (code, down = true) => {
      if (!down || g.state !== 'play') return false; const d = DIG(code); if (!d || d > 5) return false; const it = g.items[d - 1]; if (it.done) return true;
      if (d - 1 === g.order[g.k]) { it.done = true; g.k++; ev('hit', { d }); if (g.k >= 5) end('win', 'cleared'); } else strike('out of order');
      return true;
    };
    g.hint = () => [['Digit' + (g.order[g.k] + 1), true]]; g.bad = () => { const i = g.items.findIndex((x, k) => !x.done && k !== g.order[g.k]); return i >= 0 ? 'Digit' + (i + 1) : null; };
    g.view = () => ({ items: g.items.map(x => ({ ...x })), k: g.k });
  } else if (kind === 'verify') {   // eight blocks: flag the ones whose copy checksum differs, Enter re-sends. Two volumes
    g.need = 2; g.hits = 0; const vols = shuffle(rnd, VOLS[theme] || VOLS.cmd), hex = () => ri(rnd, 0, 0xffff).toString(16).toUpperCase().padStart(4, '0');
    const next = () => {
      g.vol = vols[g.hits % vols.length]; const nb = ri(rnd, 1, 3), badSet = new Set(shuffle(rnd, [0, 1, 2, 3, 4, 5, 6, 7]).slice(0, nb));
      g.blocks = Array.from({ length: 8 }, (_, i) => { const src = hex(); let cp = src; if (badSet.has(i)) { const a = cp.split(''), j = ri(rnd, 0, 3); let ch; do { ch = '0123456789ABCDEF'[ri(rnd, 0, 15)]; } while (ch === a[j]); a[j] = ch; cp = a.join(''); } return { src, cp, bad: badSet.has(i), flag: false }; });
    };
    next();
    const right = () => g.blocks.every(b => b.flag === b.bad);
    g.key = (code, down = true) => {
      if (!down || g.state !== 'play') return false; const d = DIG(code);
      if (d && d <= 8) { g.blocks[d - 1].flag = !g.blocks[d - 1].flag; return true; }
      if (code !== 'Enter' && code !== 'Space') return false;
      if (right()) { g.hits++; ev('hit', {}); if (g.hits >= g.need) end('win', 'verified'); else next(); } else strike('checksum mismatch');
      return true;
    };
    g.hint = () => { const i = g.blocks.findIndex(b => b.flag !== b.bad); return i < 0 ? [['Enter', true]] : [['Digit' + (i + 1), true]]; };
    g.bad = () => right() ? null : 'Enter';
    g.view = () => ({ vol: g.vol, blocks: g.blocks.map(b => ({ ...b })), hits: g.hits, need: g.need });
  } else if (kind === 'pa') {   // pick the decks the message is for, then Space while the channel is clear. Two announcements
    g.need = 2; g.hits = 0; g.period = calm ? 3.2 : 2.6; g.ph = rnd() * g.period;
    const all = opts.label && /every zone|all hands|shipwide|alert|drill|quiet watch|relief complete|shakedown|announce/i.test(opts.label);
    const next = () => {
      const m = pick(rnd, PAMSG[theme] || PAMSG.cmd), want = all && g.hits === 0 ? PAZ.map((_, i) => i) : shuffle(rnd, [0, 1, 2, 3, 4, 5]).slice(0, ri(rnd, 1, 3)).sort();
      g.msg = { text: m, to: want }; g.on = PAZ.map(() => rnd() < 0.3); if (g.on.every((o, i) => o === want.includes(i))) g.on[want[0]] = !g.on[want[0]];
    };
    next();
    g.clear = () => ((g.t + g.ph) % g.period) / g.period < 0.45;
    const right = () => g.on.every((o, i) => o === g.msg.to.includes(i));
    g.key = (code, down = true) => {
      if (!down || g.state !== 'play') return false; const d = DIG(code);
      if (d && d <= 6) { g.on[d - 1] = !g.on[d - 1]; return true; }
      if (code !== 'Space' && code !== 'Enter') return false;
      if (!right()) strike('wrong decks'); else if (!g.clear()) strike('talked over traffic'); else { g.hits++; ev('hit', {}); if (g.hits >= g.need) end('win', 'announced'); else next(); }
      return true;
    };
    g.hint = () => { const i = g.on.findIndex((o, k) => o !== g.msg.to.includes(k)); if (i >= 0) return [['Digit' + (i + 1), true]]; const ph = ((g.t + g.ph) % g.period) / g.period; return ph > 0.05 && ph < 0.38 ? [['Space', true]] : []; };
    g.bad = () => !right() || !g.clear() ? 'Space' : null;
    g.view = () => ({ msg: g.msg, on: g.on.slice(), hits: g.hits, need: g.need, clear: g.clear() });
  } else if (kind === 'schedule') {   // slide each block into free time inside its window; Enter books it. Three blocks
    g.H = 12; g.need = 3; g.hits = 0; const names = shuffle(rnd, SCHED[theme] || SCHED.cmd);
    g.busy = []; for (let k = 0; k < 2; k++) { const s = ri(rnd, 0, 10), l = ri(rnd, 1, 2); g.busy.push({ s, l: Math.min(l, g.H - s), name: pick(rnd, ['Drill', 'Meal', 'Briefing', 'Watch change', 'Maintenance']) }); }
    const taken = (s, l) => [...g.busy].some(b => s < b.s + b.l && b.s < s + l);
    const next = () => {
      for (let tries = 0; tries < 60; tries++) {
        const l = ri(rnd, 1, 3), free = []; for (let s = 0; s + l <= g.H; s++) if (!taken(s, l)) free.push(s); if (!free.length) continue;
        const s0 = pick(rnd, free), a = Math.max(0, s0 - ri(rnd, 0, 2)), b = Math.min(g.H, s0 + l + ri(rnd, 0, 2));
        const bad = []; for (let s = 0; s + l <= g.H; s++) if (taken(s, l) || s < a || s + l > b) bad.push(s); if (!bad.length) continue;
        g.blk = { name: names[g.hits % names.length], l, win: [a, b] }; g.pos = pick(rnd, bad); return;
      }
      g.busy = []; g.blk = { name: names[0], l: 1, win: [0, g.H] }; g.pos = 0;   // never unsolvable
    };
    next();
    g.valid = (s = g.pos) => s >= g.blk.win[0] && s + g.blk.l <= g.blk.win[1] && !taken(s, g.blk.l);
    g.key = (code, down = true) => {
      if (!down || g.state !== 'play') return false; const a = ARROW[code];
      if (a === 'L' || a === 'R') { g.pos = clamp(g.pos + (a === 'R' ? 1 : -1), 0, g.H - g.blk.l); return true; }
      if (code !== 'Enter' && code !== 'Space') return false;
      if (g.valid()) { g.busy.push({ s: g.pos, l: g.blk.l, name: g.blk.name, mine: true }); g.hits++; ev('hit', {}); if (g.hits >= g.need) end('win', 'booked'); else next(); } else strike('clash');
      return true;
    };
    g.hint = () => { if (g.valid()) return [['Enter', true]]; let best = -1; for (let s = 0; s + g.blk.l <= g.H; s++) if (g.valid(s) && (best < 0 || Math.abs(s - g.pos) < Math.abs(best - g.pos))) best = s; return best < 0 ? [] : [[best > g.pos ? 'ArrowRight' : 'ArrowLeft', true]]; };
    g.bad = () => g.valid() ? null : 'Enter';
    g.view = () => ({ busy: g.busy.map(b => ({ ...b })), blk: { ...g.blk }, pos: g.pos, hits: g.hits, need: g.need });
  }
  else if (kind === 'sign') {   // five log entries: sign the complete ones, query the rest (missing initials, time out of order, reading out of limits with no note)
    const T = FORMS[theme] || FORMS.cmd, names = shuffle(rnd, SURN); let last = ri(rnd, 60, 600);
    g.entries = Array.from({ length: 5 }, (_, i) => {
      const [name, unit, lo, hi] = pick(rnd, T.rd), step = Number.isInteger(lo) && Number.isInteger(hi) ? 1 : 0.1, fmt = (v) => step < 1 ? v.toFixed(1) : String(Math.round(v));
      const bad = i === 0 ? rnd() < 0.5 : rnd() < 0.45, why = bad ? pick(rnd, i === 0 ? ['initials', 'limits'] : ['initials', 'time', 'limits']) : null;
      const e = { hm: why === 'time' ? last - ri(rnd, 5, 40) : last + ri(rnd, 5, 50), name, unit, lo, hi, v: fmt(lo + (hi - lo) * (0.15 + rnd() * 0.7)), who: names[i].slice(0, 2).toUpperCase(), note: '', why };
      if (!bad && rnd() < 0.3) { e.v = fmt(hi + (hi - lo) * 0.6); e.note = pick(rnd, ['fault logged', 'reported to chief', 'retest booked']); }
      if (why === 'initials') e.who = ''; if (why === 'limits') e.v = fmt(hi + (hi - lo) * (0.5 + rnd() * 0.5));
      last = e.hm; return e;
    });
    for (const e of g.entries) e.t = `${String(Math.floor(e.hm / 60) % 24).padStart(2, '0')}${String(e.hm % 60).padStart(2, '0')}`;
    rounds(5, (i) => ({ n: 2, answer: g.entries[i].why ? 1 : 0, i, why: g.entries[i].why ? 'signed an incomplete entry' : 'queried a good entry' }), true);
    g.view = () => ({ round: g.round, rounds: g.rounds, entries: g.entries.map(e => ({ t: e.t, name: e.name, v: e.v, who: e.who, note: e.note })) });
  }
  else if (kind === 'trend') {   // a 24-sample log: the segment (of six) where the trace first leaves its limits. Three logs
    const pool = shuffle(rnd, TRENDS[theme] || TRENDS.cmd);
    rounds(3, (i) => {
      const [name, unit, lo, hi] = pool[i % pool.length], onset = ri(rnd, 3, 22), up = rnd() < 0.5, pts = [];
      let v = 0.5 + (rnd() - 0.5) * 0.2; for (let k = 0; k < 24; k++) { if (k < onset) { v = clamp(v + (rnd() - 0.5) * 0.12 + (up ? 0.012 : -0.012), 0.36, 0.64); } else v = up ? Math.max(v, 0.74) + rnd() * 0.08 : Math.min(v, 0.26) - rnd() * 0.08; pts.push(+v.toFixed(3)); }
      return { n: 6, answer: Math.floor(onset / 4), name, unit, lo, hi, pts, onset, why: 'wrong segment' };
    });
  }
  // ---------------------------------------------------------------- third pass: spoken brief, decision, flying, guard post, instrument run, triage, standby
  else if (kind === 'brief') {   // address the right person, give four items most urgent first, then catch the wrong figure in their read-back
    const T = FORMS[theme] || FORMS.cmd, to = (opts.label && RECIPS.find(([re]) => re.test(opts.label))?.[1]) || T.to, fmt = (v, step) => step < 1 ? v.toFixed(1) : String(Math.round(v));
    g.need = 3; g.hits = 0; g.to = to; g.recips = shuffle(rnd, [to, ...shuffle(rnd, RECIPS.map(x => x[1]).filter(x => x !== to)).slice(0, 3)]);
    const rd = shuffle(rnd, T.rd).slice(0, 4).map(([name, unit, lo, hi], i) => { const step = Number.isInteger(lo) && Number.isInteger(hi) ? 1 : 0.1, span = hi - lo, v = lo + span * (0.25 + rnd() * 0.5); return { name, unit, lo, hi, step, v: +fmt(v, step), kind: i === 0 ? 'out' : i === 1 ? 'changed' : 'steady' }; });
    { const r = rd[0], span = r.hi - r.lo; r.v = +fmt(rnd() < 0.5 ? r.hi + span * (0.2 + rnd() * 0.3) : Math.max(0, r.lo - span * (0.2 + rnd() * 0.3)), r.step); if (r.v >= r.lo && r.v <= r.hi) r.v = +fmt(r.hi + span * 0.3 + r.step, r.step); }
    { const r = rd[1], span = r.hi - r.lo; r.prev = +fmt(Math.min(r.hi, Math.max(r.lo, r.v + (rnd() < 0.5 ? -1 : 1) * Math.max(r.step * 2, span * 0.25))), r.step); if (r.prev === r.v) r.prev = +fmt(r.v + r.step * 2, r.step); }
    g.items = shuffle(rnd, rd); const at = (k) => g.items.findIndex(x => x.kind === k);
    g.order = [at('out'), at('changed'), ...g.items.map((x, i) => x.kind === 'steady' ? i : -1).filter(i => i >= 0)]; g.k = 0; g.said = [];
    g.rb = g.order.map(i => ({ name: g.items[i].name, unit: g.items[i].unit, v: fmt(g.items[i].v, g.items[i].step) })); g.wrong = ri(rnd, 0, 3);
    { const r = g.items[g.order[g.wrong]], d = pick(rnd, [-3, -2, 2, 3, 10, -10]) * r.step; g.rb[g.wrong].v = fmt(Math.max(0, r.v + d) === r.v ? r.v + r.step * 4 : Math.max(0, r.v + d), r.step); }
    g.phase = 0; g.answer = () => g.phase === 0 ? g.recips.indexOf(to) : g.phase === 1 ? g.order[g.k] : g.wrong;
    g.key = (code, down = true) => {
      if (!down || g.state !== 'play') return false; const d = DIG(code); if (!d || d > 4) return false;
      if (g.phase === 1 && g.said.includes(d - 1)) return true;
      if (d - 1 === g.answer()) { ev('hit', { phase: g.phase, d });
        if (g.phase === 0) { g.phase = 1; g.hits = 1; } else if (g.phase === 1) { g.said.push(d - 1); g.k++; if (g.k >= 4) { g.phase = 2; g.hits = 2; } } else { g.hits = 3; end('win', 'briefed'); } }
      else strike(g.phase === 0 ? 'wrong person' : g.phase === 1 ? 'buried the lead' : 'missed the wrong figure');
      return true;
    };
    g.hint = () => [['Digit' + (g.answer() + 1), true]];
    g.bad = () => { const a = g.answer(); for (let k = 1; k <= 4; k++) { const i = (a + k) % 4; if (i !== a && !(g.phase === 1 && g.said.includes(i))) return 'Digit' + (i + 1); } return null; };
    g.view = () => ({ phase: g.phase, to, recips: g.recips, items: g.items.map(x => ({ ...x })), said: g.said.slice(), rb: g.phase === 2 ? g.rb.map(x => ({ ...x })) : null, hits: g.hits, need: g.need });
  } else if (kind === 'decide') {   // three options against two limits: the best one inside both
    const D = DECIDE[theme] || DECIDE.cmd, names = shuffle(rnd, D.opts);
    rounds(3, (i) => {
      const L = [ri(rnd, 20, 60), ri(rnd, 20, 60)], ok = (lim, kind) => kind === 'max' ? ri(rnd, Math.max(1, lim - 15), lim) : ri(rnd, lim, lim + 15), bad = (lim, kind) => kind === 'max' ? ri(rnd, lim + 3, lim + 15) : ri(rnd, Math.max(0, lim - 15), Math.max(0, lim - 3));
      const best = ri(rnd, 6, 9), breaks = rnd() < 0.5 ? 0 : 1;
      const o = [{ a: ok(L[0], D.a[2]), b: ok(L[1], D.b[2]), v: best }, { a: ok(L[0], D.a[2]), b: ok(L[1], D.b[2]), v: best - ri(rnd, 2, 4) }, { a: breaks === 0 ? bad(L[0], D.a[2]) : ok(L[0], D.a[2]), b: breaks === 1 ? bad(L[1], D.b[2]) : ok(L[1], D.b[2]), v: Math.min(10, best + ri(rnd, 1, 2)) }];
      o.forEach((x, k) => { x.name = names[(i * 3 + k) % names.length]; }); const order = shuffle(rnd, [0, 1, 2]);
      return { n: 3, answer: order.indexOf(0), opts: order.map(k => o[k]), lim: L, A: D.a, B: D.b, val: D.val, why: 'bad call' };
    });
  } else if (kind === 'fly') {   // hold ← / → to turn onto the heading bug, ↑ / ↓ to set the throttle; hold each leg until its meter fills
    const T = theme || 'courses', ang = (a) => ((a % 360) + 540) % 360 - 180, tol = calm ? 12 : 8;
    g.hdg = Math.floor(rnd() * 360); g.spd = 0.4; g.thr = 0.4; g.heat = 0; g.leg = 0; g.fill = 0; g.rate = 45 * slow; g.acc = 0.3 * slow; g.red = 0.96; g.tol = tol;
    const L = (dh, band, hold, name = '') => ({ hdg: (g.hdg + dh + 360) % 360, band, hold, name }), sg = () => (rnd() < 0.5 ? -1 : 1);
    if (T === 'grid') { const s0 = sg(); g.legs = [L(s0 * ri(rnd, 60, 120), [0.2, 0.34], 1.4, 'leg 1')]; g.legs.push({ ...g.legs[0], hdg: (g.legs[0].hdg + 90 * s0) % 360, name: 'turn' }, { ...g.legs[0], hdg: (g.legs[0].hdg + 180) % 360, name: 'leg 2' }); }
    else if (T === 'run' || T === 'burst') g.legs = [L(sg() * ri(rnd, 20, 50), [0.82, 0.91], T === 'burst' ? 3 : 2, T === 'burst' ? 'burst' : 'run'), ...(T === 'run' ? [L(sg() * ri(rnd, 20, 50), [0.82, 0.91], 2, 'run')] : [])];
    else if (T === 'turn') { const h = sg() * ri(rnd, 110, 150); g.legs = [L(h, [0.45, 0.6], 1, 'hard turn'), L(h, [0, 0.08], 1.2, 'stop')]; }
    else if (T === 'orbit') g.legs = [L(sg() * ri(rnd, 20, 40), [0.46, 0.6], 4, 'orbit')];
    else if (T === 'hold') g.legs = [L(sg() * ri(rnd, 10, 25), [0.5, 0.64], 4, 'hold')];
    else if (T === 'launch') { g.spd = g.thr = 0; g.legs = [L(sg() * ri(rnd, 0, 10), [0.15, 0.28], 1.2, 'lift'), L(sg() * ri(rnd, 40, 70), [0.45, 0.6], 1.2, 'climb out')]; }
    else g.legs = [0, 1, 2].map(i => { const lo = rnd() < 0.3 ? 0.12 + rnd() * 0.12 : 0.46 + rnd() * 0.3; /* never around the starting 0.4 */ return L(sg() * ri(rnd, 40, 120) * (i + 1) / 2, [+lo.toFixed(2), +(lo + 0.14).toFixed(2)], 1.2, 'course ' + (i + 1)); });
    g.ph = rnd() * 6.28; g.heats = T === 'run' || T === 'burst';
    g.key = (code, down = true) => { const a = ARROW[code]; if (!a) return false; g.held[a] = !!down; return true; };
    g.diff = () => ang(g.legs[Math.min(g.leg, g.legs.length - 1)].hdg - g.hdg);
    g.step = (dt) => {
      const Lg = g.legs[g.leg]; if (!Lg) return;
      if (T === 'orbit') Lg.hdg = (Lg.hdg + 12 * slow * dt) % 360;
      if (T === 'hold') g.hdg = (g.hdg + 9 * slow * Math.sin(g.t * 0.9 + g.ph) * dt + 360) % 360;
      g.hdg = (g.hdg + ((g.held.R ? 1 : 0) - (g.held.L ? 1 : 0)) * g.rate * dt + 360) % 360;
      g.thr = clamp(g.thr + ((g.held.U ? 1 : 0) - (g.held.D ? 1 : 0)) * 0.45 * dt, 0, 1);
      g.spd += clamp(g.thr - g.spd, -g.acc * dt, g.acc * dt);
      if (g.heats) { if (g.spd > 0.93) g.heat += dt * 0.35; else g.heat = Math.max(0, g.heat - dt * 0.25); if (g.heat >= 1) { strike('overheat'); g.heat = 0.4; g.thr = Math.min(g.thr, 0.7); } }
      if (g.spd > g.red) { strike('overspeed'); g.spd = 0.8; g.thr = 0.7; }
      if (g.state !== 'play') return;
      const onH = Math.abs(g.diff()) <= tol, onS = g.spd >= Lg.band[0] && g.spd <= Lg.band[1];
      if (onH && onS) g.fill += dt; else g.fill = Math.max(0, g.fill - dt * 0.5);
      if (g.fill >= Lg.hold) { g.fill = 0; g.leg++; ev('hit', { leg: g.leg }); if (g.leg >= g.legs.length) end('win', 'flown'); }
    };
    g.hint = () => { const Lg = g.legs[Math.min(g.leg, g.legs.length - 1)], d = g.diff(), mid = (Lg.band[0] + Lg.band[1]) / 2; return [['ArrowLeft', d < -tol * 0.4], ['ArrowRight', d > tol * 0.4], ['ArrowUp', g.thr < mid - 0.02], ['ArrowDown', g.thr > mid + 0.02]]; };
    g.bad = () => 'ArrowUp';
    g.view = () => ({ hdg: +g.hdg.toFixed(1), spd: +g.spd.toFixed(3), thr: +g.thr.toFixed(3), heat: +g.heat.toFixed(2), leg: g.leg, legs: g.legs.map(x => ({ ...x, hdg: +x.hdg.toFixed(1) })), fill: +g.fill.toFixed(2), tol, red: g.red });
  } else if (kind === 'post') {   // people walk up to the door; read them at the line: admit + log, refuse, or hold a transfer without signed orders
    const door = theme || 'Armory', ds = shuffle(rnd, DEPTS); g.rule = { door, depts: ds.slice(0, 2), min: ri(rnd, 2, 4), today: ri(rnd, 120, 300) };
    g.walk = calm ? 6.5 : 4.5; g.reach = 0.4; g.log = [];
    const person = () => ({ name: `${pick(rnd, RANKS)} ${pick(rnd, SURN)}`, dept: pick(rnd, g.rule.depts), clear: ri(rnd, g.rule.min, 5), exp: g.rule.today + ri(rnd, 1, 200), tail: false, orders: null });
    const kinds = shuffle(rnd, ['ok', 'bad', 'tail', 'hold', 'orders']);
    g.queue = kinds.map(k => { const p = person();
      if (k === 'bad') { const w = pick(rnd, ['dept', 'clear', 'exp']); if (w === 'dept') p.dept = ds[ri(rnd, 2, ds.length - 1)]; else if (w === 'clear') p.clear = g.rule.min - 1; else p.exp = g.rule.today - ri(rnd, 1, 60); p.answer = 1; }
      else if (k === 'tail') { p.tail = true; p.answer = 1; }
      else if (k === 'hold' || k === 'orders') { p.orders = { what: pick(rnd, POSTS), signed: k === 'orders', date: k === 'orders' || rnd() < 0.5 ? g.rule.today : g.rule.today - ri(rnd, 1, 5) }; if (k === 'hold' && p.orders.date === g.rule.today) p.orders.signed = false; p.answer = k === 'orders' ? 0 : 2; }
      else p.answer = 0;
      return { ...p, pos: 0 }; });
    g.need = g.queue.length; g.hits = 0; g.cur = g.queue[0];
    const next = () => { g.hits++; if (g.hits >= g.need) end('win', 'post held'); else g.cur = g.queue[g.hits]; };
    g.step = (dt) => { const c = g.cur; if (!c) return; c.pos += dt / g.walk; if (c.pos >= 1) { g.log.push({ name: c.tail ? 'tailgater' : c.name, act: 'walked past' }); strike('walked past'); if (g.state === 'play') next(); } };
    g.key = (code, down = true) => {
      if (!down || g.state !== 'play') return false; const d = DIG(code); if (!d || d > 3) return false; const c = g.cur; if (c.pos < g.reach) return true;   // too far off to read yet
      if (d - 1 === c.answer) { g.log.push({ name: c.tail ? 'tailgater' : c.name, act: ['admitted', 'refused', 'held'][d - 1] }); ev('hit', { d }); next(); }
      else strike(d === 1 ? 'let the wrong person in' : d === 2 ? 'turned away crew who belong' : 'held them for nothing');
      return true;
    };
    g.hint = () => g.cur && g.cur.pos >= g.reach + 0.02 ? [['Digit' + (g.cur.answer + 1), true]] : [];
    g.bad = () => g.cur && g.cur.pos >= g.reach + 0.02 ? 'Digit' + ((g.cur.answer + 1) % 3 + 1) : null;
    g.view = () => ({ rule: g.rule, cur: g.cur && { ...g.cur }, hits: g.hits, need: g.need, log: g.log.slice(-4) });
  } else if (kind === 'assay') {   // set the protocol value, run (wait), match the trace to one of four references. Two runs
    const A = ASSAY[theme] || ASSAY.assay, [set, refs] = A; g.need = 2; g.hits = 0; g.dur = calm ? 3.4 : 2.4;
    const pat = () => Array.from({ length: 3 }, () => ({ x: 0.08 + rnd() * 0.84, h: 0.35 + rnd() * 0.6, w: 0.03 + rnd() * 0.03 }));
    const dist = (a, b) => a.reduce((m, p, i) => m + Math.abs(p.x - b[i].x) + Math.abs(p.h - b[i].h) * 0.5, 0);
    const next = () => {
      const [, unit, lo, hi] = set; g.proto = ri(rnd, lo, hi); g.v = clamp(g.proto + pick(rnd, [-1, 1]) * ri(rnd, 2, 5), lo, hi); if (g.v === g.proto) g.v = g.proto + (g.proto < hi ? 1 : -1);
      g.set = { name: set[0], unit, lo, hi }; g.phase = 'set'; g.prog = 0;
      const names = shuffle(rnd, refs).slice(0, 4), ps = []; for (let k = 0, tries = 0; ps.length < 4 && tries < 200; tries++) { const p = pat().sort((a, b) => a.x - b.x); if (ps.every(q => dist(p, q) > 0.45)) ps.push(p); } while (ps.length < 4) ps.push(pat().sort((a, b) => a.x - b.x));
      g.refs = names.map((name, i) => ({ name, peaks: ps[i] })); g.answer = ri(rnd, 0, 3);
      g.trace = Array.from({ length: 60 }, (_, k) => { const x = k / 59; return +clamp(ps[g.answer].reduce((m, p) => m + p.h * Math.exp(-((x - p.x) ** 2) / (2 * p.w * p.w)), 0) + (rnd() - 0.5) * 0.06, 0, 1.2).toFixed(3); });
    };
    next();
    g.step = (dt) => { if (g.phase === 'run') { g.prog += dt / g.dur; if (g.prog >= 1) { g.prog = 1; g.phase = 'read'; ev('done', {}); } } };
    g.key = (code, down = true) => {
      if (!down || g.state !== 'play') return false; const a = ARROW[code], d = DIG(code);
      if (g.phase === 'set') { if (a === 'L' || a === 'R') { g.v = clamp(g.v + (a === 'R' ? 1 : -1), g.set.lo, g.set.hi); return true; } if (code === 'Enter' || code === 'Space') { if (g.v === g.proto) { g.phase = 'run'; ev('start', {}); } else strike('wrong protocol'); return true; } return false; }
      if (g.phase === 'run') return !!(a || d || code === 'Enter');   // the run is going: nothing to do but wait
      if (!d || d > 4) return false;
      if (d - 1 === g.answer) { g.hits++; ev('hit', {}); if (g.hits >= g.need) end('win', 'matched'); else next(); } else strike('misread trace');
      return true;
    };
    g.hint = () => g.phase === 'set' ? [[g.v < g.proto ? 'ArrowRight' : g.v > g.proto ? 'ArrowLeft' : 'Enter', true]] : g.phase === 'read' ? [['Digit' + (g.answer + 1), true]] : [];
    g.bad = () => g.phase === 'set' ? (g.v !== g.proto ? 'Enter' : null) : g.phase === 'read' ? 'Digit' + ((g.answer + 1) % 4 + 1) : null;
    g.view = () => ({ phase: g.phase, v: g.v, proto: g.proto, set: g.set, prog: +g.prog.toFixed(2), refs: g.refs, trace: g.trace, answer: g.phase === 'read' ? g.answer : null, hits: g.hits, need: g.need });
  } else if (kind === 'triage') {   // tag four casualties by the rule; two of them change and need re-tagging
    const mk = (cat) => { const p = { name: `${pick(rnd, RANKS)} ${pick(rnd, SURN)}`, walks: cat === 3, rr: ri(rnd, 14, 26), pulse: true, cap: ri(rnd, 1, 2), obeys: true, tag: 0, changed: false };
      if (cat === 1) { const w = pick(rnd, ['rr', 'pulse', 'cap', 'obeys']); if (w === 'rr') p.rr = ri(rnd, 32, 40); else if (w === 'pulse') p.pulse = false; else if (w === 'cap') p.cap = ri(rnd, 3, 4); else p.obeys = false; }
      return p; };
    g.truth = (p) => p.walks ? 3 : (p.rr > 30 || !p.pulse || p.cap > 2 || !p.obeys) ? 1 : 2;
    g.pts = shuffle(rnd, [1, 2, 3, pick(rnd, [1, 2, 3])]).map(mk); g.sel = 0; g.need = 3; g.hits = 0; g.wait = -1; g.gap = calm ? 2.2 : 1.4;   // three sorts: the first, then after each of two changes
    const fix = (p) => p.tag === g.truth(p), allOk = () => g.pts.every(fix);
    const change = () => {   // someone gets worse: green -> yellow (stops walking), yellow -> red (breathing climbs / refill slows)
      const c = g.pts.map((p, i) => g.truth(p) > 1 ? i : -1).filter(i => i >= 0), i = c.length ? pick(rnd, c) : 0, p = g.pts[i];
      if (g.truth(p) === 3) p.walks = false; else if (g.truth(p) === 2) { if (rnd() < 0.5) p.rr = ri(rnd, 32, 38); else p.cap = 3; } else { p.obeys = false; p.rr = ri(rnd, 32, 38); p.tag = 2; }
      p.changed = true; g.wait = -1; ev('change', { i });
    };
    g.step = () => { if (g.wait >= 0 && g.t >= g.wait) change(); };
    g.key = (code, down = true) => {
      if (!down || g.state !== 'play') return false; const a = ARROW[code];
      if (a === 'U' || a === 'D') { g.sel = (g.sel + (a === 'D' ? 1 : 3)) % 4; return true; }
      const d = DIG(code); if (!d || d > 3) return false; const p = g.pts[g.sel];
      if (d !== g.truth(p)) { strike('mistagged'); return true; }
      const was = fix(p); p.tag = d; p.changed = false; if (was) return true; ev('hit', { i: g.sel, d });
      const nx = g.pts.findIndex(q => !fix(q)); if (nx >= 0) { g.sel = nx; return true; }
      g.hits++; if (g.hits >= g.need) end('win', 'sorted'); else g.wait = g.t + g.gap;
      return true;
    };
    g.hint = () => { const i = g.pts.findIndex(p => !fix(p)); if (i < 0) return []; if (i !== g.sel) return [[((i - g.sel + 4) % 4) <= 2 ? 'ArrowDown' : 'ArrowUp', true]]; return [['Digit' + g.truth(g.pts[i]), true]]; };
    g.bad = () => 'Digit' + (g.truth(g.pts[g.sel]) % 3 + 1);
    g.view = () => ({ pts: g.pts.map(p => ({ ...p, truth: g.truth(p) })), sel: g.sel, hits: g.hits, need: g.need, waiting: g.wait >= 0 });
  } else if (kind === 'standby') {   // quiet watch: lamps that are not yours come and go; your call wants one action, fast
    const S = STANDBY[theme] || STANDBY.drill, calls = shuffle(rnd, S.calls), k = calm ? 1.3 : 1; g.need = 2; g.hits = 0; g.ev = null; g.win = (calm ? 4.8 : 3.2); g.n = 0;
    g.nextAt = (2 + rnd() * 1.2) * k; g.falses = ri(rnd, 0, 1);
    const spawn = () => {
      if (g.falses > 0) { g.falses--; g.ev = { real: false, text: pick(rnd, S.idle), until: g.t + 1.4 }; return; }
      const c = calls[g.n++ % calls.length], order = shuffle(rnd, [0, 1, 2]); g.ev = { real: true, text: c[0], opts: order.map(j => c[1 + j]), answer: order.indexOf(0), until: g.t + g.win }; g.falses = ri(rnd, 0, 1);
    };
    const quiet = () => { g.ev = null; g.nextAt = g.t + (1.5 + rnd()) * k; };
    g.step = () => { if (!g.ev && g.t >= g.nextAt) spawn(); else if (g.ev && g.t >= g.ev.until) { const missed = g.ev.real; quiet(); if (missed) strike('missed call'); } };
    g.key = (code, down = true) => {
      if (!down || g.state !== 'play') return false; const d = DIG(code); if (!d || d > 3) return false;
      if (!g.ev?.real) { strike('false start'); return true; }
      if (d - 1 === g.ev.answer) { g.hits++; ev('hit', {}); quiet(); if (g.hits >= g.need) end('win', 'responded'); } else { strike('wrong action'); quiet(); }
      return true;
    };
    g.hint = () => g.ev?.real ? [['Digit' + (g.ev.answer + 1), true]] : [];
    g.bad = () => g.ev?.real ? 'Digit' + ((g.ev.answer + 1) % 3 + 1) : 'Digit1';
    g.view = () => ({ ev: g.ev && { ...g.ev }, hits: g.hits, need: g.need, quiet: !g.ev, next: +g.nextAt.toFixed(2), calls: calls.map(c => c[0]) });
  }
  g.tick = (dt) => { if (g.state !== 'play') return; g.t += dt; g.step?.(dt); if (g.state === 'play' && g.t >= g.limit) end('fail', 'time'); };
  return g;
}

// ---- rushing a job never plays a game: one line about the corner you cut (by kind)
const RUSH = {
  sequence: ['Skipped the readback and signed it.', 'Keyed the code without checking the panel.'], wires: ['Twisted the leads together and closed the panel.', 'Reseated what was loose, did not test it.'],
  dial: ['Cracked the valve and walked away.', 'Bled it once, called it good.'], calibrate: ['Eyeballed the reading.', 'Called the drift close enough.'],
  vitals: ['Glanced at the monitors from the doorway.', 'Read one bed in two.'], hypo: ['Gave a standard dose without checking the chart.'], tray: ['Counted the tray at a glance.'],
  meds: ['Signed the count without opening the drawer.'], counsel: ['Kept it short: "Hang in there."', 'Checked the box, not the person.'], power: ['Left the load where it was and logged it balanced.'],
  bench: ['Passed the lot without the meter.'], tune: ['Logged the strongest static as the signal.'], classify: ['Logged every contact as debris.'], badge: ['Waved everyone through.'],
  doorlog: ['Skimmed the log for anything obvious.'], cook: ['Served it a little early.', 'Turned the heat up and hoped.'], nutrient: ['Topped up every line the same.'], fresh: ['Pushed the old stock to the back.'],
  manifest: ['Scanned the pallet, not each crate.'], loadbal: ['Stacked it where there was room.'], course: ['Took the straight line and trusted the deflector.'], decode: ['Logged the first close match.'],
  station: ['Let her drift and logged "holding".'], burn: ['Came in hot and let the dampers eat it.'], fix: ['Used the dead-reckoning position.'], coords: ['Energised on the nearest lock.'],
  form: ['Copied last watch\'s figures into the form.', 'Ticked "all in limits" without reading.'], roster: ['Put the same three names on every watch.'], queue: ['Took the easy items first.'], verify: ['Skipped the verify pass.'],
  pa: ['Announced it on whatever channel was open.'], sign: ['Signed the whole page without reading it.'], schedule: ['Double-booked and hoped nobody noticed.'], trend: ['Glanced at the last reading only.'],
  brief: ['Read the numbers out in whatever order and did not wait for the read-back.', 'Said "all fine" and left.'], decide: ['Picked the option with the biggest number.'], fly: ['Set the autopilot and looked away.', 'Flew it on the dampers.'],
  post: ['Waved them through in a group.', 'Let the door hold itself.'], assay: ['Ran it on the default setting and logged the first match.'], triage: ['Tagged everyone yellow.'], standby: ['Stood down early and listened from the mess.'],
};
export function rushNote(tool, seed = 1) { const a = RUSH[tool?.kind] || RUSH.sequence; return a[(seed >>> 0) % a.length]; }

// ---- what the result does to the job: a win is a proper job done 40 % faster (a clean, no-strike win: 50 %); a fail still gets the job done,
// rushed (the duty's own rushed debt / score; a mission task counts as rushed). Cancel is not an outcome: the job stays due.
export function outcome(game) {
  const r = game.result ? game.result() : game;
  if (r.state === 'win') { const perfect = r.strikes === 0; return { quality: 'proper', timeMul: perfect ? 0.5 : 0.6, perfect, label: perfect ? 'Clean work' : 'Done properly' }; }
  if (r.state === 'fail') return { quality: 'rushed', timeMul: 1, perfect: false, label: r.why === 'time' ? 'Ran out of time — the job is logged as rushed' : 'Fumbled it — the job is logged as rushed' };
  return null;
}

// ---- which tools the player has been shown (persisted in the settings blob, CFG.learned in fb_cfg)
export function learnedStore(get, set) {
  const cur = () => { const v = get(); return v && typeof v === 'object' ? v : {}; };
  return { has: (id) => !!cur()[id], mark: (id) => { const v = { ...cur(), [id]: 1 }; set(v); return v; }, reset: () => set({}), list: () => Object.keys(cur()) };
}
