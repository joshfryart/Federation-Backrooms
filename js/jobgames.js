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
  signoff: TOOL('signoff', 'Log signature pad', 'sequence', 'Sign the log: key the lit authorisation code, symbol by symbol.'),
  transporter: TOOL('transporter', 'Transporter pattern lock', 'calibrate', 'Keep the targeting scanner on the drifting pattern: hold ← / → until the lock meter fills.'),
};
TOOLS['command chair'] = TOOLS.captain_chair;
export function toolFor(spot) { return (spot && TOOLS[spot]) || null; }

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
  'Scan subspace bands for signals': 'comms', 'Monitor hails and ship traffic': 'decode', 'Keep the science team\'s comm channel clear': 'comms', 'Hold clean relay link to the sickbay and bridge': 'comms', 'Align the subspace transceiver': 'comms', 'Subspace transceiver range test': 'comms',
};
// [tool id, label/sys regex, rooms (optional)]. Order matters: the first match wins.
export const RULES = [
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
  ['cook', /cook|meal|serve|refreshment|coffee|sanitis|scrub|sanitation|trays/i, null],
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
  const label = it.label || it.task || '', ov = OVERRIDES[label]; if (ov && TOOLS[ov]) return TOOLS[ov];
  for (const [id, re, rooms] of RULES) if ((!rooms || rooms.includes(it.room)) && re.test(label)) return TOOLS[id];
  const bySys = BY_SYS[it.sys]; if (bySys && TOOLS[bySys] && !(it.spot === 'junction' || it.spot === 'door' || it.spot === 'corridor')) return TOOLS[bySys];   // a junction / door panel stays wiring
  return base;
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
  coil: [['Primary energizing coil', '% wear', 0, 20], ['Phase transition coil', '% wear', 0, 25], ['Pattern buffer coil', '% wear', 0, 15], ['Emitter array coil', '% wear', 0, 20], ['Targeting scanner coil', '% wear', 0, 30]],
};
const SHELF = [['Ration packs', 'pack'], ['Fresh greens', 'tray'], ['Protein cubes', 'tin'], ['Milk substitute', 'carton'], ['Bread loaves', 'bag'], ['Spice paste', 'jar'], ['Med gel', 'tube'], ['Breather filters', 'box'], ['Reagent kit', 'case'], ['Soup concentrate', 'pouch']];
const COOK = ['Clear broth', 'Root hash', 'Flatbread', 'Spiced rice', 'Bean stew', 'Noodles', 'Vegetable curry', 'Omelette'];
const BUSES = { power: ['Life support', 'Sickbay', 'Sensors', 'Shields', 'Impulse', 'Replicators', 'Holodeck'], nutrient: ['Nitrate', 'Phosphate', 'Potash'] };
const MSGS = ['Hail', 'Docking request', 'Distress call', 'Traffic advisory', 'Course change', 'Medical priority', 'Cargo schedule', 'All clear'];
const CODECH = 'ABCDEFGHKMNPRSTVXZ';

// ---- games
export function createGame(kind, seed = 1, opts = {}) {
  const K = KINDS[kind]; if (!K) throw new Error('no mini-game ' + kind);
  const rnd = mulberry32((seed >>> 0) || 1), calm = !!opts.calm, slow = calm ? 0.6 : 1, theme = opts.theme || null;
  const g = { kind, title: K.title, rule: K.rule, state: 'play', strikes: 0, maxStrikes: K.strikes, t: 0, limit: K.limit * (calm ? 1.5 : 1), events: [], held: {}, theme };
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
    const order = shuffle(rnd, COUNSEL.map((_, i) => i)).slice(0, 3);
    rounds(3, (i) => { const c = COUNSEL[order[i]], opt = shuffle(rnd, [0, 1, 2]); return { n: 3, answer: opt.indexOf(0), prompt: c[0], who: `${pick(rnd, RANKS)} ${pick(rnd, SURN)}`, replies: opt.map(k => c[1 + k]), why: 'they close up' }; });
  }
  // ---------------------------------------------------------------- engineering + hydroponics: move units between a reserve and bars, Enter commits
  else if (kind === 'power' || kind === 'nutrient') {
    const nb = kind === 'power' ? 4 : 3; g.need = kind === 'power' ? 1 : 2; g.hits = 0; g.sel = 0; g.cap = 6;
    const next = () => {
      g.names = kind === 'power' ? shuffle(rnd, BUSES.power).slice(0, nb) : BUSES.nutrient.slice(); g.bed = kind === 'nutrient' ? pick(rnd, ['Tomato bed', 'Lettuce bed', 'Bean bed', 'Herb bed', 'Root bed', 'Algae tank']) : null;
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
    const doors = [['Armory', ['Security', 'Command'], 3], ['Science lab', ['Science', 'Command', 'Medical'], 2], ['Main engineering', ['Engineering', 'Command'], 2], ['Isolation ward', ['Medical'], 3], ['Shuttlebay', ['Operations', 'Command', 'Engineering'], 2], ['Brig', ['Security'], 2]];
    const [door, depts, min] = pick(rnd, doors); g.rule = { door, depts, min };
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
    g.win = [0.72, 0.92]; g.dishes = shuffle(rnd, COOK).slice(0, 3);
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
      const today = ri(rnd, 40, 330), items = shuffle(rnd, SHELF).slice(0, 5), answer = ri(rnd, 0, 4);
      return { n: 5, answer, today, items: items.map(([name, unit], k) => ({ name, unit, day: k === answer ? today - ri(rnd, 1, 9) : today + ri(rnd, 0, 40), qty: ri(rnd, 2, 12) })), why: 'still in date' };
    });
  }
  // ---------------------------------------------------------------- cargo
  else if (kind === 'manifest') {   // the crate whose code matches the manifest line exactly
    const code = () => `${pick(rnd, CODECH.split(''))}${pick(rnd, CODECH.split(''))}-${ri(rnd, 10, 99)}-${pick(rnd, CODECH.split(''))}`;
    const near = (c) => { const a = c.split(''), m = rnd(); if (m < 0.33) { const i = pick(rnd, [3, 4]); a[i] = String((+a[i] + ri(rnd, 1, 8)) % 10); } else if (m < 0.66) { if (a[3] !== a[4]) [a[3], a[4]] = [a[4], a[3]]; else a[3] = String((+a[3] + 1) % 10); } else { const i = pick(rnd, [0, 1, 6]); let ch; do { ch = pick(rnd, CODECH.split('')); } while (ch === a[i]); a[i] = ch; } return a.join(''); };
    rounds(4, () => {
      const want = code(), set = new Set([want]); while (set.size < 4) set.add(near(want));
      const crates = shuffle(rnd, [...set]); return { n: 4, answer: crates.indexOf(want), want, crates, dest: pick(rnd, ['Bay 1', 'Bay 2', 'Hold A', 'Hold B', 'Sickbay', 'Lab', 'Galley']), why: 'wrong crate' };
    });
  } else if (kind === 'loadbal') {   // stow six crates port / starboard, keep the trim within the limit
    g.queue = Array.from({ length: 6 }, () => ri(rnd, 1, 3)); g.L = ri(rnd, 0, 2); g.R = ri(rnd, 0, 2); g.lim = 3; g.i = 0;
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
    const W = 9, H = 5; g.W = W; g.H = H; g.need = 2; g.hits = 0;
    const key = (x, y) => y * W + x, nb = (x, y) => [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < W && b < H);
    const bfs = (sx, sy, tx, ty) => { const prev = new Map([[key(sx, sy), null]]), q = [[sx, sy]]; while (q.length) { const [x, y] = q.shift(); if (x === tx && y === ty) break; for (const [a, b] of nb(x, y)) if (!g.haz.has(key(a, b)) && !prev.has(key(a, b))) { prev.set(key(a, b), [x, y]); q.push([a, b]); } } if (!prev.has(key(tx, ty))) return null; const path = []; let c = [tx, ty]; while (c && !(c[0] === sx && c[1] === sy)) { path.unshift(c); c = prev.get(key(c[0], c[1])); } return path; };
    g.pos = [0, ri(rnd, 0, H - 1)];
    const leg = () => {
      const tx = g.pos[0] < W / 2 ? W - 1 : 0, ty = ri(rnd, 0, H - 1); g.goal = [tx, ty];
      for (let tries = 0; tries < 30; tries++) { g.haz = new Set(); while (g.haz.size < 11) { const x = ri(rnd, 1, W - 2), y = ri(rnd, 0, H - 1); if (!(x === g.pos[0] && y === g.pos[1])) g.haz.add(key(x, y)); } const p = bfs(g.pos[0], g.pos[1], tx, ty); if (p && p.length >= 8) return; }
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
      const names = shuffle(rnd, MSGS).slice(0, 4), answer = ri(rnd, 0, 3), flip = ri(rnd, 0, 7), rx = codes[answer] ^ (1 << flip);
      return { n: 4, answer, codes, names, rx, flip, why: 'misread' };
    });
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
