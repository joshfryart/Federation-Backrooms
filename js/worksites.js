// Work sites (Systems Nominal): physical jobs are done IN the room, not on a console. A ward round is a walk from bed to bed with the medical
// tricorder, a galley clean is mopping the grimy patches, lashing cargo is ratcheting each strap into the band. Pure logic (no DOM, no three.js),
// node-testable (tools/test-jobgames.mjs); the 3D markers + LCARS checklist are js/worksite-ui.js, the glue is goJob / startJob in js/main.js.
//   SITE_DEFS                     id -> { name, dept, item[], props[], n:[min,max], floor, act, order, site, how, verb }
//   siteJobFor(item)              -> def | null  (SITE_OVERRIDES by exact label, then SITE_RULES: label regex + room filter)
//   jobFor(item)                  -> { type: 'sites', def, kind } | { type: 'game', tool, kind } | null   (sites first, then the console game)
//   resolveSites(def, ctx, seed)  -> [{ tx, ty, kind, name, prop }]   ctx: { rect, props: [{kind, tx, ty}], free(tx, ty) }; props first, then free
//                                    floor tiles spread over the room (every room resolves); fetch: one supply prop (or floor) for the item
//   createSiteRun(def, seed, sites, opts) -> run { sites[], state 'work'|'win'|'fail'|'cancel', faults, t, limit, next, step(dt, inp), result(),
//                                    outcome(), cancel(), fetched(), hint(i) -> the input that works at site i now (tests / auto-play) }
//       inp: { at: site index the player stands at and faces (-1: none), hold: E held, press: E went down this frame, look: view yaw minus the
//              bearing to the site (rad), wipe: view turn speed (rad/s), hasItem, away: outside the room (the clock stops) }
//   coverageAll(duties)           -> { total, kinds, sites, games, share, missing }   per kind over every loop + mission task (sites + console)
// Acts (the per-site skill element; E is the work key, the mouse / arrow keys aim):
//   scrub   hold E and move your view back and forth: strokes clean ~5x faster than holding still
//   scan    hold E and sweep the view: a strength meter peaks at a hidden bearing; hold the peak ~1 s to lock
//   timing  hold E to charge (dose / torque / fill / strap), let go inside the band; over or under is a fault, go again
//   count   tap E once per item (n shown on the site), then pause: the count is checked; a miscount is a fault, start again
//   fetch   (added when the required item is not on the belt) E at the supply point issues one
// Result: every site done with < 3 faults = proper (the walk was the work: the busy time after is short); 3+ faults or the time limit = rushed,
// still done. Cancel (phase change, J "Stop working") = nothing happens, the job stays due. Rushing never plays a site job.
import { gameFor } from './jobgames.js';
import { mulberry32 } from './data.js';

const P = (props) => props;   // readability
// ---- the definitions. item: any of these in hand does the job (the first is issued at a fetch site). props: room prop kinds, in preference order
export const SITE_DEFS = {
  // medical
  ward: { name: 'Ward round', dept: 'medical', item: ['tricorder_med'], props: P(['biobed', 'exam_couch', 'surgical_table', 'infusion_stand']), n: [3, 4], act: 'scan', order: 'seq', site: 'Bed', verb: 'Scan',
    how: 'Walk the beds in order. At each one hold E and sweep the medical tricorder over the patient; the reading peaks over the problem: hold it there to lock.' },
  dose: { name: 'Medication round', dept: 'medical', item: ['hypospray'], props: P(['biobed', 'exam_couch', 'infusion_stand']), n: [3, 3], act: 'timing', order: 'seq', site: 'Bed', verb: 'Dose', need: 1,
    how: 'At each bed hold E to draw the dose into the hypospray and let go inside the band on the chart. Over or under and you draw again.' },
  sterile: { name: 'Sterile sweep', dept: 'medical', item: [], props: P(['surgical_table', 'biobed', 'exam_couch', 'steriliser', 'nursestation', 'autopsy_table']), n: [3, 4], act: 'scrub', order: 'any', site: 'Surface', verb: 'Sterilise',
    how: 'Wipe down each marked surface: hold E and move your view back and forth across it. Long strokes clean fastest.' },
  restock: { name: 'Restock', dept: 'medical', item: [], props: P(['med_dispenser', 'shelving', 'reachin_cooler', 'drawers', 'samplefridge', 'injector_crate', 'servery', 'suitrack', 'weaponrack']), n: [2, 3], act: 'count', order: 'any', site: 'Shelf', verb: 'Stock',
    how: 'Each shelf shows how many it is short. Tap E once per item you put in, then pause: the shelf checks the count.' },
  // galley / hydroponics
  clean: { name: 'Galley clean', dept: 'galley', item: ['mop'], props: P(['range', 'servery', 'dishwasher', 'counter', 'sinkunit', 'table', 'wastebin', 'bar']), n: [3, 4], floor: true, act: 'scrub', order: 'any', site: 'Patch', verb: 'Scrub',
    how: 'Mop each grimy patch: hold E and swing your view back and forth over it until it shines. Holding still barely cleans.' },
  growbed: { name: 'Grow-bed round', dept: 'galley', item: [], props: P(['growbed', 'tree', 'nutrient_tanks', 'plant', 'specimen_tank']), n: [3, 4], act: 'timing', order: 'seq', site: 'Bed', verb: 'Feed', need: 1,
    how: 'At each bed hold E to open the feed valve and let go when the level sits in the band. Overfill or underfill and you go again.' },
  harvest: { name: 'Harvest', dept: 'galley', item: [], props: P(['growbed', 'tree', 'plant']), n: [3, 3], act: 'count', order: 'any', site: 'Bed', verb: 'Pick',
    how: 'Each bed shows how many are ripe. Tap E once per pick, then pause: pick exactly the ripe ones.' },
  serve: { name: 'Table service', dept: 'galley', item: [], props: P(['table', 'card_table', 'bar', 'briefing_table', 'charttable', 'servery']), n: [2, 3], floor: true, act: 'count', order: 'any', site: 'Table', verb: 'Serve',
    how: 'Each table shows how many places to set. Tap E once per plate, then pause.' },
  // science
  samples: { name: 'Sample collection', dept: 'science', item: ['tricorder_sci', 'tricorder_atmo'], props: P(['labbench', 'fumehood', 'samplefridge', 'specimen_tank', 'growbed', 'spectrometer', 'crate', 'scrubber']), n: [3, 3], act: 'scan', order: 'any', site: 'Sample point', verb: 'Sample',
    how: 'At each sample point hold E and sweep the science tricorder; lock on where the trace peaks.' },
  // engineering
  inspect: { name: 'Systems inspection', dept: 'engineering', item: ['tricorder_eng', 'tricorder_geo'], props: P(['fieldgen', 'fieldgen_damp', 'reactorstation', 'warpcore', 'heatexch', 'pumpskid', 'scrubber', 'tank', 'relayrack', 'servers', 'buffertank', 'beampedestal', 'baycontrol']), n: [3, 4], floor: true, act: 'scan', order: 'seq', site: 'Check point', verb: 'Inspect',
    how: 'Walk the check points in order. Hold E and sweep the engineering tricorder along the hardware; lock on the hot spot when the meter peaks.' },
  repair: { name: 'Repair round', dept: 'engineering', item: ['hydrospanner', 'spanner', 'toolbag', 'plasma_torch'], props: P(['workbench', 'fabricator', 'lathe', 'drill_press', 'pumpskid', 'fieldgen', 'maint_stand', 'heatexch', 'console']), n: [3, 3], act: 'timing', order: 'any', site: 'Fitting', verb: 'Torque', need: 2,
    how: 'Two bolts per fitting: hold E to torque and let go inside the band. Too loose or stripped and you redo it.' },
  // cargo / stores
  lash: { name: 'Lashing check', dept: 'cargo', item: ['cargo_hook', 'crowbar'], props: P(['crate', 'pallet_loaded', 'pallet', 'hoversled', 'cart', 'injector_crate', 'feedstock_silo']), n: [3, 4], act: 'timing', order: 'any', site: 'Strap', verb: 'Tension', need: 1,
    how: 'Hook each strap and hold E to ratchet it; let go when the tension sits in the band. Slack or snapped and you go again.' },
  tally: { name: 'Stock tally', dept: 'cargo', item: ['padd'], props: P(['crate', 'pallet_loaded', 'shelving', 'injector_crate', 'cart', 'reachin_cooler', 'feedstock_silo']), n: [3, 3], act: 'count', order: 'any', site: 'Stack', verb: 'Count',
    how: 'Count each stack on the PADD: tap E once per crate shown on the stack, then pause to log it.' },
  // security / deck
  patrol: { name: 'Patrol', dept: 'security', item: ['tricorder_sec', 'flashlight'], props: P(['cellfield', 'cell', 'scan_arch', 'weaponrack', 'airlock_doors', 'suitrack']), n: [3, 4], floor: true, act: 'scan', order: 'seq', site: 'Post', verb: 'Sweep',
    how: 'Walk the posts in order. At each one hold E and sweep the area; lock on whatever reads wrong.' },
  hatch: { name: 'Seal and hatch round', dept: 'security', item: ['flashlight', 'tricorder_eng', 'tricorder_sec'], props: P(['airlock_doors', 'cellfield', 'suitrack', 'shuttle', 'crate', 'scan_arch']), n: [3, 3], floor: true, act: 'scan', order: 'seq', site: 'Seal', verb: 'Check',
    how: 'At each seal hold E and run the lamp along the edge; lock on the gap when the meter peaks.' },
  walkround: { name: 'Walk-round', dept: 'flight', item: ['flashlight', 'tricorder_geo', 'tricorder_eng'], props: P(['shuttle', 'workpod', 'maint_stand', 'fuelbowser', 'pallet_loaded', 'hoversled']), n: [3, 4], floor: true, act: 'scan', order: 'seq', site: 'Station', verb: 'Look',
    how: 'Walk round the craft station by station. Hold E and sweep the lamp; lock on any debris or damage you find.' },
  // ---- more hands-on work (second pass: every department's physical jobs get their own site with the item they really use)
  // medical
  regen: { name: 'Dermal treatment', dept: 'medical', item: ['dermal'], props: P(['biobed', 'exam_couch', 'surgical_table']), n: [2, 3], act: 'scrub', order: 'seq', site: 'Patient', verb: 'Treat',
    how: 'At each patient hold E and pass the dermal regenerator slowly back and forth over the burn or bruise until the skin knits.' },
  bedprep: { name: 'Bed prep', dept: 'medical', item: [], props: P(['biobed', 'exam_couch', 'surgical_table', 'infusion_stand', 'shuttle', 'workpod']), n: [3, 4], floor: true, act: 'count', order: 'any', site: 'Bed', verb: 'Lay out',
    how: 'Each bed card lists the kit it needs (sheets, monitor leads, hypo tray…). Tap E once per item you lay out, then pause: the card checks it.' },
  // engineering / environmental
  valves: { name: 'Valve walk', dept: 'engineering', item: ['spanner', 'hydrospanner'], props: P(['pumpskid', 'heatexch', 'tank', 'buffertank', 'scrubber', 'warpcore', 'reactorstation', 'fieldgen_damp', 'nutrient_tanks']), n: [3, 4], floor: true, act: 'turn', order: 'seq', site: 'Valve', verb: 'Turn', need: 1,
    how: 'At each valve hold E and turn your view (mouse or arrow keys) to crank the spanner; let go when the gauge sits in the band. Over-tighten or leave it loose and you redo it.' },
  breakers: { name: 'Breaker round', dept: 'engineering', item: [], props: P(['relayrack', 'servers', 'baycontrol', 'reactorstation', 'fieldgen', 'console', 'commsstation', 'beampedestal']), n: [3, 4], floor: true, act: 'count', order: 'seq', site: 'Panel', verb: 'Reset',
    how: 'Open each panel: it shows how many breakers have tripped. Tap E once per breaker you reset, then pause to close the panel.' },
  weld: { name: 'Hull patch', dept: 'engineering', item: ['plasma_torch'], props: P(['maint_stand', 'workpod', 'pumpskid', 'tank', 'workbench']), n: [2, 3], floor: true, act: 'scrub', order: 'any', site: 'Seam', verb: 'Weld',
    how: 'Hold E and run the plasma torch back and forth along each scored seam until the bead is continuous. Holding still just heats the plate.' },
  filters: { name: 'Filter change', dept: 'engineering', item: ['spanner', 'toolbag'], props: P(['scrubber', 'heatexch', 'fumehood', 'pumpskid', 'console']), n: [2, 3], floor: true, act: 'turn', order: 'any', site: 'Housing', verb: 'Unscrew', need: 2,
    how: 'Each housing has two clamp bolts. Hold E and turn your view to crank each one; let go when the torque gauge sits in the band.' },
  firecheck: { name: 'Suppression test', dept: 'engineering', item: ['extinguisher'], props: P(['pumpskid', 'tank', 'fuelbowser', 'warpcore', 'range', 'shuttle', 'crate']), n: [3, 3], floor: true, act: 'timing', order: 'seq', site: 'Station', verb: 'Test',
    how: 'At each suppression point hold E to pressurise the extinguisher and let go when the gauge is in the band. Over-pressure or a weak test and you go again.' },
  airflow: { name: 'Air-flow check', dept: 'engineering', item: ['tricorder_atmo'], props: P(['scrubber', 'fumehood', 'heatexch', 'pumpskid', 'airlock_doors', 'suitrack', 'console']), n: [3, 4], floor: true, act: 'scan', order: 'seq', site: 'Vent', verb: 'Sniff',
    how: 'At each vent hold E and sweep the atmospheric tricorder across the grille; lock on where the flow (or the contaminant) peaks.' },
  // operations: transporter + holodeck
  padscan: { name: 'Pad diagnostic', dept: 'ops', item: ['tricorder_eng'], props: P(['pad', 'beampedestal', 'buffertank', 'workbench']), n: [3, 4], floor: true, act: 'scan', order: 'seq', site: 'Emitter', verb: 'Scan',
    how: 'Walk the pad emitters in order. Hold E and sweep the engineering tricorder over each; lock on the weak coil when the meter peaks.' },
  padalign: { name: 'Pad alignment', dept: 'ops', item: ['hydrospanner', 'spanner'], props: P(['pad', 'beampedestal', 'buffertank']), n: [3, 3], floor: true, act: 'turn', order: 'seq', site: 'Pad', verb: 'Align', need: 1,
    how: 'At each pad hold E and turn your view to wind the alignment screw; let go when the pad\'s alignment gauge sits in the band.' },
  emitters: { name: 'Emitter sweep', dept: 'ops', item: ['tricorder_eng'], props: P(['holocube', 'holodesk']), n: [3, 4], floor: true, act: 'scan', order: 'seq', site: 'Emitter', verb: 'Check',
    how: 'Walk the grid emitters in order. Hold E and sweep the tricorder over each panel; lock on the hot emitter when the meter peaks.' },
  // security
  charge: { name: 'Cell charging', dept: 'security', item: [], props: P(['chargerack', 'weaponrack', 'issuecounter', 'shelving', 'suitrack']), n: [3, 3], floor: true, act: 'timing', order: 'any', site: 'Charger', verb: 'Charge', need: 1,
    how: 'Seat a cell in each charger and hold E while it charges; let go at the full mark (in the band). Overcharge or pull it early and you start again.' },
  fieldsweep: { name: 'Field-emitter sweep', dept: 'security', item: ['tricorder_sec'], props: P(['cellfield', 'cell', 'scan_arch', 'secdesk', 'beampedestal', 'baycontrol', 'airlock_doors']), n: [3, 4], floor: true, act: 'scan', order: 'seq', site: 'Emitter', verb: 'Sweep',
    how: 'Walk the field emitters in order. Hold E and sweep the security tricorder along each field edge; lock on the weak spot when the meter peaks.' },
  lockup: { name: 'Lock-up round', dept: 'security', item: [], props: P(['airlock_doors', 'cellfield', 'weaponrack', 'samplefridge', 'specimen_tank', 'shuttle', 'crate', 'holodesk', 'suitrack']), n: [3, 3], floor: true, act: 'turn', order: 'seq', site: 'Lock', verb: 'Dog', need: 1,
    how: 'At each hatch or locker hold E and turn your view to spin the locking wheel; let go when it seats in the band. Too far jams it, too little leaves it open.' },
  armcount: { name: 'Armory count', dept: 'security', item: ['padd'], props: P(['weaponrack', 'chargerack', 'issuecounter', 'shelving', 'suitrack']), n: [2, 3], floor: true, act: 'count', order: 'any', site: 'Rack', verb: 'Count',
    how: 'Each rack shows how many items should be in it. Tap E once per serial you check off on the PADD, then pause.' },
  escort: { name: 'Escort route', dept: 'security', item: ['tricorder_sec', 'flashlight'], props: P(['beampedestal', 'pad', 'shelving', 'airlock_doors', 'crate']), n: [3, 3], floor: true, act: 'scan', order: 'seq', site: 'Corner', verb: 'Clear',
    how: 'Walk the route ahead of the escort. At each marked corner hold E and sweep the area; lock on anything that reads wrong before you wave them through.' },
  // flight deck
  sweep: { name: 'Deck sweep', dept: 'flight', item: ['broom'], props: P(['shuttle', 'workpod', 'maint_stand', 'fuelbowser', 'hoversled']), n: [3, 4], floor: true, act: 'scrub', order: 'any', site: 'Patch', verb: 'Sweep',
    how: 'Sweep each marked patch of deck with the push broom: hold E and swing your view back and forth until it is clear. Loose debris on a flight deck wrecks engines.' },
  washdown: { name: 'Wash-down', dept: 'flight', item: ['mop'], props: P(['shuttle', 'workpod', 'crate', 'maint_stand']), n: [2, 3], floor: true, act: 'scrub', order: 'any', site: 'Probe', verb: 'Wash',
    how: 'Wash down each returned probe or hull panel: hold E and work the mop back and forth until the residue is gone.' },
  fuel: { name: 'Fuelling', dept: 'flight', item: [], props: P(['fuelbowser', 'shuttle', 'workpod']), n: [2, 3], floor: true, act: 'timing', order: 'seq', site: 'Tank', verb: 'Fuel', need: 1,
    how: 'Couple the hose at each tank and hold E to pump; let go when the gauge sits in the band. Overfill or short-fill and you go again.' },
  // carrying (pick up at one point, put down at the others, or the reverse): the act is the walk, E to lift, hold E to set down square
  deliver: { name: 'Delivery', dept: 'galley', item: [], carry: 'out', hub: P(['servery', 'galley_trolley', 'counter', 'med_dispenser', 'shelving', 'cart', 'issuecounter']), hubName: 'Trolley',
    props: P(['table', 'biobed', 'console', 'labbench', 'desk', 'briefing_table', 'charttable', 'bar', 'nursestation', 'sensorstation', 'helm']), n: [2, 3], floor: true, act: 'carry', order: 'any', site: 'Drop', verb: 'Deliver',
    how: 'Lift one load at the marked trolley (E), walk it to a marked drop point and hold E to set it down. Repeat until every drop is served.' },
  cases: { name: 'Sample cases', dept: 'science', item: [], carry: 'out', hub: P(['cart', 'crate', 'hoversled', 'console']), hubName: 'Case cart', props: P(['samplefridge', 'specimen_tank', 'labbench', 'fumehood', 'spectrometer']), n: [2, 3], floor: true, act: 'carry', order: 'any', site: 'Shelf', verb: 'Stow',
    how: 'Take one sample case at a time from the cart (E), carry it to its marked fridge or bench and hold E to stow it. Keep them level.' },
  seedlings: { name: 'Move seedlings', dept: 'galley', item: [], carry: 'out', hub: P(['cart', 'specimen_tank', 'nutrient_tanks']), hubName: 'Seedling tray', props: P(['growbed', 'tree', 'plant']), n: [2, 3], floor: true, act: 'carry', order: 'any', site: 'Bed', verb: 'Plant',
    how: 'Lift a seedling tray (E), carry it to a marked grow bed and hold E to set it in. One tray at a time.' },
  shelve: { name: 'Shelve stock', dept: 'cargo', item: ['cargo_hook'], carry: 'out', hub: P(['hoversled', 'cart', 'pallet_loaded', 'crate']), hubName: 'Sled', props: P(['shelving', 'reachin_cooler', 'med_dispenser', 'drawers', 'crate', 'pallet']), n: [3, 3], floor: true, act: 'carry', order: 'any', site: 'Shelf', verb: 'Shelve',
    how: 'Hook a crate off the sled (E), carry it to a marked shelf and hold E to set it down square. Three crates.' },
  stage: { name: 'Stage cargo', dept: 'cargo', item: ['cargo_hook'], carry: 'out', hub: P(['crate', 'pallet_loaded', 'pallet', 'shelving', 'injector_crate']), hubName: 'Stack', props: P(['pad', 'beampedestal', 'hoversled', 'cart', 'shuttle', 'cargo_pad', 'workpod']), n: [2, 3], floor: true, act: 'carry', order: 'any', site: 'Spot', verb: 'Stage',
    how: 'Hook a crate from the stack (E), carry it to a marked staging spot (pad, sled or hold) and hold E to set it down.' },
  clearout: { name: 'Clear the way', dept: 'cargo', item: [], carry: 'in', hub: P(['hoversled', 'pallet', 'cart', 'crate']), hubName: 'Stack point', props: P(['crate', 'cart', 'pallet_loaded', 'shelving', 'injector_crate', 'hoversled']), n: [3, 3], floor: true, act: 'carry', order: 'any', site: 'Clutter', verb: 'Clear',
    how: 'Lift each marked obstruction (E) and carry it to the stack point; hold E to set it down out of the way. Keep the lane clear.' },
  // galley / stores
  pack: { name: 'Ration packing', dept: 'galley', item: [], props: P(['servery', 'counter', 'table', 'shelving', 'crate', 'cart']), n: [2, 3], floor: true, act: 'count', order: 'any', site: 'Case', verb: 'Pack',
    how: 'Each case label says how many packs it takes. Tap E once per pack you put in, then pause: the case is sealed and counted.' },
  wipedown: { name: 'Wipe-down', dept: 'galley', item: [], props: P(['workbench', 'weaponrack', 'issuecounter', 'replicator', 'med_dispenser', 'beampedestal', 'labbench', 'counter']), n: [2, 3], floor: true, act: 'scrub', order: 'any', site: 'Surface', verb: 'Wipe',
    how: 'Wipe down each marked surface: hold E and move your view back and forth across it until it is clean.' },
  // science
  blight: { name: 'Plant health check', dept: 'science', item: ['tricorder_sci'], props: P(['growbed', 'tree', 'plant', 'specimen_tank', 'crate', 'nutrient_tanks']), n: [3, 4], floor: true, act: 'scan', order: 'seq', site: 'Bed', verb: 'Scan',
    how: 'At each bed hold E and sweep the science tricorder along the leaves; lock on the blight or pest when the meter peaks.' },
  benchcal: { name: 'Bench calibration', dept: 'science', item: [], props: P(['labbench', 'spectrometer', 'fumehood', 'sensorstation', 'charttable']), n: [3, 3], floor: true, act: 'turn', order: 'any', site: 'Instrument', verb: 'Adjust', need: 1,
    how: 'At each instrument hold E and turn your view to wind the fine-adjust knob; let go when the needle sits on the reference band.' },
  extracts: { name: 'Extract prep', dept: 'science', item: [], props: P(['labbench', 'fumehood', 'specimen_tank', 'samplefridge', 'growbed']), n: [2, 3], floor: true, act: 'count', order: 'any', site: 'Batch', verb: 'Measure',
    how: 'Each batch card lists how many measures of extract it takes. Tap E once per measure, then pause to seal the vial.' },
  // command: supervisors walk the stations with a PADD
  // ---- third pass (docs/job-audit.md "Second pass: weak and mismatched"): read-and-compare walks, counted carries, handheld sweeps, hands-on exams
  // read act: let the needle settle, then call it. Tap E = the first call (in limits / leave it / fit), hold E = the second (out: call it in / throw it / refer)
  gauges: { name: 'Gauge walk', dept: 'engineering', item: [], props: P(['reactorstation', 'warpcore', 'heatexch', 'pumpskid', 'tank', 'scrubber', 'fieldgen', 'fieldgen_damp', 'console', 'opsstation', 'sensorstation', 'helm', 'nursestation', 'growbed', 'reachin_cooler', 'labbench', 'servers', 'baycontrol', 'cellfield']), n: [3, 4], floor: true, act: 'read', order: 'seq', site: 'Gauge', verb: 'Read', calls: ['In limits', 'Out: call it in'],
    how: 'Walk the instruments in order. At each one let the needle settle and read it against the spec on its plate: tap E if it is in limits, hold E to call it out of limits.' },
  relays: { name: 'Relay check', dept: 'ops', item: ['tricorder_eng'], props: P(['relayrack', 'servers', 'commsstation', 'opsstation', 'console', 'baycontrol']), n: [3, 4], floor: true, act: 'read', order: 'seq', site: 'Relay', verb: 'Test', calls: ['Good', 'Bad: reseat it'],
    how: 'Walk the relays in order. Hold the tricorder probe on each card until the signal-loss reading settles: tap E if it is inside the spec, hold E to pull and reseat a bad card.' },
  switches: { name: 'Switch round', dept: 'engineering', item: [], props: P(['relayrack', 'baycontrol', 'reactorstation', 'fieldgen', 'console', 'servers', 'scrubber']), n: [3, 4], floor: true, act: 'read', order: 'seq', site: 'Panel', verb: 'Set', calls: ['Leave it', 'Throw it'], reads: 'switch',
    how: 'Walk the junction panels in order. Read each switch against the order on its placard: tap E to leave one that is already right, hold E to throw one that is wrong.' },
  exam: { name: 'Fitness check', dept: 'medical', item: ['tricorder_med'], props: P(['exam_couch', 'biobed', 'nursestation', 'desk', 'labbench', 'console']), n: [3, 3], floor: true, act: 'read', order: 'any', site: 'Crew member', verb: 'Examine', calls: ['Fit', 'Refer'],
    how: 'Examine each crew member in turn: hold the tricorder on them until the reading settles, compare it with their baseline, then tap E to pass them fit or hold E to refer them.' },
  checkin: { name: 'Wellness check-in', dept: 'medical', item: [], props: P(['bunk', 'table', 'card_table', 'desk', 'bar', 'console', 'labbench']), n: [3, 3], floor: true, act: 'read', order: 'any', site: 'Crew member', verb: 'Check in', calls: ['Doing fine', 'Follow up'],
    how: 'Stop by each marked crew member. Let them talk until you have the read on them, then tap E if they are doing fine or hold E to book a follow-up.' },
  formcheck: { name: 'Technique watch', dept: 'medical', item: [], props: P(['crate', 'pallet_loaded', 'pad', 'beampedestal', 'hoversled', 'console', 'cart']), n: [3, 3], floor: true, act: 'read', order: 'seq', site: 'Station', verb: 'Watch', calls: ['Good form', 'Correct them'],
    how: 'Stand by each station while the crewman does the move. When you have seen it, tap E if the technique is right or hold E to stop them and show the correction.' },
  kitcheck: { name: 'Kit check', dept: 'security', item: [], props: P(['issuecounter', 'weaponrack', 'chargerack', 'shelving', 'suitrack']), n: [3, 3], floor: true, act: 'read', order: 'any', site: 'Item', verb: 'Check', calls: ['Good: issue it', 'Pull it'],
    how: 'Check each item at the counter before it goes out: read its lamp or tag, then tap E to issue it or hold E to pull it from service.' },
  screening: { name: 'Crew screening', dept: 'medical', item: ['tricorder_med'], props: P(['scan_arch', 'exam_couch', 'pad', 'nursestation', 'airlock_doors', 'biobed']), n: [3, 4], floor: true, act: 'scan', order: 'seq', site: 'Crew member', verb: 'Screen',
    how: 'Each marked crew member stands for a screen. Hold E and sweep the medical tricorder head to foot; lock on the reading when the meter peaks.' },
  hazsweep: { name: 'Hazard sweep', dept: 'security', item: ['tricorder_sec', 'tricorder_atmo'], props: P(['crate', 'injector_crate', 'pallet_loaded', 'pad', 'specimen_tank', 'samplefridge', 'cart']), n: [3, 4], floor: true, act: 'scan', order: 'seq', site: 'Case', verb: 'Sweep',
    how: 'Walk the cases (or pads) in order. Hold E and sweep the tricorder along every seam; lock on the leak or hot spot when the meter peaks.' },
  decon: { name: 'Buffer clean', dept: 'ops', item: [], props: P(['buffertank', 'pad', 'beampedestal']), n: [3, 3], floor: true, act: 'scrub', order: 'any', site: 'Contact', verb: 'Wipe',
    how: 'Open each buffer port and wipe the contacts clean: hold E and work back and forth over the residue until it is gone.' },
  hazmat: { name: 'Hazmat seal', dept: 'cargo', item: [], props: P(['crate', 'injector_crate', 'pallet_loaded', 'specimen_tank', 'feedstock_silo', 'shelving']), n: [3, 3], floor: true, act: 'timing', order: 'any', site: 'Lid', verb: 'Crimp', need: 1,
    how: 'Thread the seal wire through each lid and hold E to squeeze the crimper; let go when the crimp gauge sits in the band. Loose or cut and you thread a new one.' },
  zero: { name: 'Range zeroing', dept: 'security', item: [], props: P(['weaponrack', 'chargerack', 'workbench', 'issuecounter']), n: [3, 3], floor: true, act: 'turn', order: 'seq', site: 'Lane', verb: 'Zero', need: 1,
    how: 'At each lane check the group on the target, then hold E and turn your view to wind the zero screw; let go when the sight sits in the band.' },
  splint: { name: 'Splinting', dept: 'medical', item: [], props: P(['biobed', 'exam_couch', 'surgical_table']), n: [2, 3], floor: true, act: 'timing', order: 'seq', site: 'Patient', verb: 'Splint', need: 2,
    how: 'At each patient support the limb and hold E to tighten each splint strap; let go when the pressure sits in the band. Too tight cuts circulation, too loose does nothing.' },
  patientmove: { name: 'Patient transfer', dept: 'medical', item: [], carry: 'in', hub: P(['infusion_stand', 'exam_couch', 'nursestation']), hubName: 'Recovery', props: P(['biobed', 'surgical_table', 'exam_couch']), n: [2, 3], floor: true, act: 'carry', order: 'any', site: 'Bed', verb: 'Move',
    how: 'Unclip each stable patient (E), wheel them to the recovery bay and hold E to settle them and hand over the chart.' },
  // carry and count: lift at the stock point, then count the load onto its shelf with E taps (pause to check the count)
  stockup: { name: 'Carry and count', dept: 'cargo', item: [], carry: 'out', drop: 'count', hub: P(['hoversled', 'cart', 'pallet_loaded', 'crate', 'issuecounter']), hubName: 'Stock', props: P(['shelving', 'reachin_cooler', 'med_dispenser', 'drawers', 'pad', 'beampedestal', 'pallet', 'issuecounter', 'suitrack']), n: [2, 3], floor: true, act: 'carry', order: 'any', site: 'Shelf', verb: 'Count in',
    how: 'Lift a load at the stock point (E), carry it to a marked shelf and count it in: tap E once per item the shelf card asks for, then pause. A miscount and you count it again.' },
  hoppers: { name: 'Hopper refill', dept: 'galley', item: [], carry: 'out', drop: 'count', hub: P(['feedstock_silo', 'crate', 'cart', 'shelving']), hubName: 'Feedstock', props: P(['replicator', 'feedstock_silo', 'servery', 'counter', 'fabricator']), n: [2, 3], floor: true, act: 'carry', order: 'any', site: 'Hopper', verb: 'Fill',
    how: 'Take a feedstock cartridge from the store (E), carry it to a marked hopper and seat it: tap E once per measure the gauge is short, then pause.' },
  checklist: { name: 'Walk-round checklist', dept: 'bridge', item: ['padd'], props: P(['console', 'opsstation', 'sensorstation', 'commsstation', 'navstation', 'helm', 'reactorstation', 'workbench', 'labbench', 'secdesk', 'nursestation', 'servers', 'baycontrol', 'warpcore']), n: [3, 4], floor: true, act: 'count', order: 'seq', site: 'Station', verb: 'Tick',
    how: 'Walk the stations in order. Each one shows its open checklist items: tap E once per item you check and tick on the PADD, then pause to sign it.' },
};
export const ACTS = { scrub: 'Scrub', scan: 'Scan sweep', timing: 'Charge and release', count: 'Tap count', turn: 'Turn and release', carry: 'Lift and carry', read: 'Read and call', fetch: 'Collect item' };
// what the read act's instruments show (def.reads or the def id): [name, unit, lo, hi]; 'switch' is a placard vs switch position
export const READS = {
  gauges: [['Pressure', 'kPa', 96, 104], ['Temperature', 'K', 290, 310], ['Coolant flow', 'L/s', 22, 28], ['Load', '%', 40, 85], ['Bus voltage', 'kV', 4.2, 5.0], ['Tank level', '%', 60, 95], ['Damper lag', 'ms', 0, 12], ['Moisture', '%', 35, 60]],
  relays: [['Signal loss', 'dB', 0, 3], ['Link margin', 'dB', 12, 20], ['Error rate', 'ppm', 0, 5], ['Echo delay', 'ms', 4, 20]],
  exam: [['Reaction', 'ms', 180, 260], ['Grip', 'kg', 30, 55], ['Pulse', 'bpm', 60, 100], ['Balance', 's', 20, 40], ['Pupil response', 's', 0.2, 0.5], ['Resp. rate', '/min', 12, 20]],
  checkin: [['Mood', '/10', 5, 10], ['Sleep', 'h', 6, 9], ['Stress', '/10', 0, 5], ['Appetite', '/10', 5, 10]],
  formcheck: [['Back angle', '°', 0, 20], ['Knee bend', '°', 60, 100], ['Load held at', 'cm', 0, 25], ['Hand off the lever', 's', 0, 1], ['Step timing', 's', 1, 3]],
  kitcheck: [['Cell charge', '%', 92, 100], ['Tracker battery', 'h', 30, 40], ['Spec tag fit', '%', 98, 102], ['Safety catch', 'N', 40, 60]],
};
const SWITCHES = ['Science', 'Lifts', 'Sickbay', 'Reserve', 'Tractor', 'Lights', 'Shields', 'Holodeck'];
for (const [id, d] of Object.entries(SITE_DEFS)) d.id = id;
// where the item is issued when the player does not carry one (fetch site): supply props, in preference order
export const SUPPLY = ['shelving', 'med_dispenser', 'weaponrack', 'suitrack', 'drawers', 'reachin_cooler', 'issuecounter', 'workbench', 'servery', 'nursestation', 'secdesk', 'desk', 'crate'];

// ---- which jobs are physical. Exact labels first, then rules (label regex, rooms or null). Everything else keeps its console game.
const MED = ['sickbay'], GAL = ['mess', 'arboretum', 'lounge'], CAR = ['cargo', 'stores', 'shuttlebay'];
// exact labels whose words would mislead a rule (job audit, docs/job-audit.md)
export const SITE_OVERRIDES = {
  'Ward rounds': 'ward', 'Patient rounds': 'ward', 'Vitals round on occupied beds': 'ward', 'Routine rounds and charting': 'ward', 'Routine physicals and rounds': 'ward',
  'Dispense meds and update patient list': 'dose', 'Sterile field sweep and tray check': 'sterile', 'Sterilise instruments and surgical bay': 'sterile',
  'Restock hypos, dressings and trays': 'restock', 'Stock splints and burn gel': 'restock', 'Grow bed round': 'growbed', 'Routine bed round and logs': 'growbed',
  'Harvest for galley': 'harvest', 'Scrub and sanitise the galley': 'clean', 'Sanitation and waste sweep': 'clean', 'Sanitise the galley against contamination': 'clean',
  'Check straps, seals and nets': 'lash', 'Re-secure loose pallets': 'lash', 'Strap down everything in the bay before maneuvers': 'lash', 'Patrol the ship': 'patrol',
  'Deck patrol and door checks': 'patrol', 'Pressure door and hatch rounds': 'hatch', 'Routine seal and hatch rounds': 'hatch', 'Serve the regular meals on time': 'serve',
  'Count and verify cargo against manifest': 'tally',
  // second pass
  'Walk-round of all departments': 'checklist', 'Review reactor and env crews': 'checklist', 'Run systems drill with all crews': 'checklist', 'Run a readiness drill': 'checklist',
  'Reactor and injector walk-round': 'valves', 'Shuttle walkaround and FOD sweep': 'sweep', 'Supply botanical medicinal stock if required': 'harvest',
  'Raise O2 output for the extra patients': 'growbed', 'Check quarantine readiness with life support': 'airflow', 'Confirm contamination isolation of ventilation': 'airflow',
  'Keep spare cells ready for sickbay': 'charge', 'Inspect armory and chargers': 'charge', 'Routine patrol and armory count': 'armcount', 'Serial-number audit': 'armcount',
  'Check internal sensors cover the main corridors': 'fieldsweep', 'Sweep sensors before the away team beams out': 'patrol', 'Brig cell check': 'fieldsweep',
  'Inspect cargo seals with the QM': 'hatch', 'Inspect manifest and seals with the deck chief': 'hatch', 'Inspect and seal cargo bay': 'hatch', 'Inspect and seal cargo-bay hazard lockers': 'lockup',
  'Drill intruder lockdown with security staff': 'lockup', 'Ready the shuttle for casualty transport': 'bedprep', 'Ready casualty shuttle with biobeds': 'bedprep',
  'Pre-position emergency rations and repair stock': 'deliver', 'Pre-stage patch kits near the lab': 'deliver', 'Stage emergency ration packs by the lifeboats': 'pack',
  'Unload returning crates': 'clearout', 'Draw fresh stock from incoming cargo': 'clearout', 'Draw medical supplies and bedding to sickbay': 'clearout', 'Pull medical supply crates from the bay': 'stage',
  'Test suppression and leak patching on mock breach': 'weld', 'Run a damage-control drill': 'firecheck', 'Test bay door, forcefield and fire suppression': 'firecheck', 'Bay door and forcefield check': 'fieldsweep',
  'Verify lab and hydroponics systems': 'checklist', 'Repair locker and breather audit': 'tally', 'Inventory suits and tool lockers': 'tally',
  // third pass (the 250 jobs rated weak or mismatched in the human-work review; docs/job-audit.md "Second pass: weak and mismatched"). null: a console
  // game in js/jobgames.js OVERRIDES although a site rule would match the words
  'Department status review': null, 'Captain\'s log and standing orders': null, 'Decide on requests from departments': null, 'Approve approach and sensor power': null, 'Decide whether to extend the survey': null,
  'Order departure and debrief': null, 'Authorise transfer and docking': null, 'Sign receipt and close out': null, 'Declare relief complete': null, 'Review trial results with heads': null,
  'Accept or reject ship readiness': null, 'Read the bridge status board': 'gauges', 'Stand officer of the watch; keep log': 'gauges', 'Brief a landing party if a site is chosen': null,
  'Sign off the transfer log': null, 'Run the system test checklist with each department': 'gauges', 'Command the bridge watch': null, 'Alert and comm net check': 'relays',
  'Clear deficiency list with chiefs': null, 'Assign survey priorities to science and flight': null, 'Confirm sickbay needs and clear the route': 'clearout', 'Pre-brief transporter and shuttlebay': null,
  'Brief chiefs on test sequence': null, 'Observe reactor and eps trial': 'gauges', 'Collect fault list from all departments': null, 'Verify alert drill and station times': 'gauges',
  'Review helm and nav status': null, 'Hold course and report': null, 'Brief helm and nav on slow approach': null, 'Report pass complete': null, 'Report arrival': null, 'Ready the medical shuttle': 'bedprep',
  'Report ETA to the bridge': null, 'Brief helm on test manoeuvres': null, 'Test shuttle launch': null, 'Report results': null, 'Move cargo sleds': 'stockup', 'Clear bay and cycle doors for launch': 'clearout',
  'Meet returning shuttle with medical team': 'screening', 'Run full pre-launch checklist on all craft': 'walkround', 'Drill emergency recovery with the pilot': null, 'Brief captain on schedule': null,
  'Relay sickbay requests to captain and bridge': null, 'Print drill checklist for captain': 'deliver', 'Time and note each drill result': null, 'Hold course and log deviations': null,
  'Attitude thruster pre-check': null, 'Thruster pre-check': null, 'Fly the survey grid at slow, steady speed': null, 'Best-speed run to the stricken site': null, 'Run the helm maneuver test series': null,
  'Hard turn and stop test': null, 'Deflector and damper readout check': 'gauges', 'Update charts with the latest sensor data': null, 'Merge survey fixes into the chart': null,
  'Plot orbit and transporter-range hold': null, 'Run the full set of calibration courses': null, 'Stand ready for launch': null, 'Launch and fly survey pattern': null, 'Test comm relays and PA zones': 'relays',
  'Routine relay sweep': 'relays', 'Keep the science team\'s comm channel clear': null, 'Hail the receiving station and confirm the schedule': null, 'Relay medical updates to the bridge': null,
  'Full PA and relay test, every zone': 'relays', 'Subspace transceiver range test': 'relays', 'Alert-tone and fault-warning drill': 'gauges', 'Core diagnostic sweep': null,
  'Routine core sweep and log review': null, 'Full core diagnostic and stress test': null, 'Test relay failover and network redundancy': 'relays', 'Check comm junctions': 'relays',
  'Keep the probe relay link open': 'relays', 'Prioritise comms with the receiving station': null, 'Run the full ops systems test sequence': 'gauges', 'Review reactor and env crews': 'gauges',
  'Coolant and damper walk': 'gauges', 'Watch reactor margin during scans': null, 'Pattern buffer and biofilter check': 'filters', 'Drill the technician': 'formcheck', 'Clean pattern buffer': 'decon',
  'Hold transporter lock on team': null, 'Stand by for emergency beam-out': null, 'Decontaminate buffer': 'decon', 'Hold standby lock on away team': null, 'Beam cargo crates in batches': 'stockup',
  'Clear pads and hold lock on casualty group': null, 'Test emergency lock with a weighted dummy load': null, 'Reactor and injector walk-round': 'gauges', 'Engineering status to the XO': null,
  'Stage a controlled power-up test': null, 'Stand by with foam and clamps at loading': null, 'Full life support and coolant sweep': 'gauges', 'Extra scrubber capacity for crowded sickbay': 'filters',
  'Cycle every environmental subsystem under load': 'switches', 'Test emergency atmosphere isolation and lights': 'switches', 'Issue and returns desk': 'kitcheck', 'Serial audit of the zapper locker': 'armcount',
  'Issue sidearms and trackers to the landing party': 'kitcheck', 'Issue escort weapons for the handoff': 'kitcheck', 'Reconcile returns after the handoff': 'armcount',
  'Live-fire calibration at the range': 'zero', 'Route extra power to science arrays': 'switches', 'Power the cargo lifts and tractor gear': 'switches', 'Coolant loop cross-check': 'gauges',
  'Hold steady output during scan': null, 'Maximise burst output for speed': null, 'Watch core temps at high output': null, 'Security status to XO': null, 'Test brig force field and sensors': 'fieldsweep',
  'Post a guard at the lab': 'escort', 'Sweep sensors before the away team beams out': 'hazsweep', 'Arm escort for away team': 'kitcheck', 'Guard hold during loading': null,
  'Escort and control the sickbay entrance': null, 'Keep order among the evacuees': null, 'Run an intruder lockdown drill': 'lockup', 'Armory audit': 'armcount',
  'Restrict lab and sensor access to survey personnel': null, 'Post an officer at the shuttlebay for away-team traffic': null, 'Guard transporter pad during transfers': null,
  'Control access to quarantine area': null, 'Test armory release and badge locks': null, 'Hold post at brig or transporter': null, 'Armory sign-out and charge check': 'kitcheck', 'Hold post at brig door': null,
  'Guard the science lab entrance during sensor sweeps': null, 'Test brig force-field panel': 'gauges', 'Station for intruder drill': null, 'Routine bed round and logs': 'gauges',
  'Quarantine-check samples against the beds': null, 'Hand updated plot to navigation': null, 'Send updated plot to navigation': null, 'Present finished chart to bridge': null,
  'Check internal sensors and force fields': null, 'Check force-field board': null, 'Sweep returned specimens for hazards': 'hazsweep', 'Check long-range sensor calibration': null,
  'Routine passive sweep and log': null, 'Sensor officer reviews cartography updates': null, 'Brief sensor, carto and botany on survey targets': null, 'Run primary deep scan of target': null,
  'Analyse samples for the medical team': null, 'Scan the relief destination for pathogens and radiation': null, 'Full sensor array diagnostic': null, 'Verify lab and hydroponics systems': 'gauges',
  'Routine sample queue and calibration': null, 'Analyse sensor-collected samples': null, 'Send summary to bridge': null, 'Log inspection results': null, 'Run patient blood and tissue panels': null,
  'Culture and pathogen ID': null, 'Deliver results to sickbay': null, 'Test lab instruments under load': null, 'Lifeform scanner spot check': null, 'Routine sweep and drift check': null,
  'Report all-clear to bridge': null, 'Aim arrays at survey target': null, 'Run full-spectrum scan and bracket': null, 'Package survey data for the bridge': null, 'Sweep approach lanes for debris': null,
  'Scan cargo for hazardous signatures': 'hazsweep', 'Locate the target vessel and lifesign count': null, 'Relay lifesign data to sickbay': null, 'Watch for hazards around the vessel': null,
  'Report range and resolution figures': null, 'Crew health screening': null, 'Health summary to captain': null, 'Brief cargo crew on lifting injuries': 'formcheck', 'Receive and triage arriving patients': null,
  'Brief captain on capacity and supplies': null, 'Request transporter and cargo support': null, 'Stand ready for injuries during drills': null, 'Check crew fatigue after drills': 'exam',
  'Report medical readiness to captain': null, 'Crew morale report to the captain': null, 'Fitness-for-duty review': 'exam', 'Watch for fatigue in the science shift': 'checkin',
  'Report load-crew exhaustion to the quartermaster': null, 'Walk-in clinic and fitness checks': 'exam', 'Routine physicals and rounds': 'exam', 'Inspect cargo handlers for strain injuries': 'exam',
  'Triage incoming patients': null, 'Daily status to bridge on casualties': null, 'Be on standby during drills': null, 'Clear a quarantine corner in the bay': 'hazmat', 'Test the cargo lift and sled': null,
  'Check sickbay power and medical hologram readiness': 'gauges', 'Run baseline scans on duty crew on request': 'screening', 'Screen away-team members on return': 'screening',
  'Prepare for lifting injuries and strains': 'bedprep', 'Run rapid scans and bloodwork for the doctor': null, 'Move stable patients to recovery and chart handoff': 'patientmove',
  'Check medical hologram matrix': null, 'Wellness walk to quarters': 'checkin', 'Screen returning survey team': 'screening', 'Treat crush and strain injuries from cargo bay': 'splint',
  'Stage trauma kit near bridge-deck lift': 'stockup', 'Check galley replicator base stock and feed lines': 'hoppers', 'Check cold store and dry stores': 'gauges',
  'Stock check and shopping list for the Galley Chief': 'tally', 'Keep the mess open through drills': 'serve', 'Reset a booked session': 'clearout', 'Open bookings and run the standard grid sweep': 'emitters',
  'Run a calm relaxation program for off-shift survey crew': null, 'Help the cargo handlers stack crates in the playroom': 'shelve', 'Switch grid emitters to a calm recovery program for patients\' families': null,
  'Stand by with the grid in case the medical hologram needs emitter help': null, 'Cycle the emitters through every program class': 'emitters', 'Audit food and spares stores': 'tally',
  'Replicator feedstock and queue': 'hoppers', 'Requisition round': 'stockup', 'Issue probes and sample containers to science': 'deliver', 'Seal hazmat and secure cargo': 'hazmat',
  'Draw medical supplies and bedding to sickbay': 'stockup', 'Verify spares kits against the stress-test plan': 'kitcheck', 'Routine pattern checks on all food units': 'gauges',
  'Stores count and refill': 'hoppers', 'Extra rations for long lab shifts': 'pack', 'Spare parts printed for engineering': null,
};
// [def id, label regex, rooms or null]. Order matters: the first match wins; everything unmatched keeps its console game (js/jobgames.js).
export const SITE_RULES = [
  ['switches', /^prioritise sickbay power$/i, ['sickbay']],   // the EPS tech throws the sickbay junction switches; the reactor specialist's job of the same name is the console
  // carrying: deliveries out from a trolley / stack, clutter in to a stack point
  ['deliver', /^(?!.*(results|data|summary|lifesign|updates|requests|messages|extracts? and|manifest)).*(deliver|carry trays|send hot meals|night-shift plates|pre-stage|pre-position)/i, null],
  ['cases', /(carry|move( returned)?) (samples|specimen)/i, null],
  ['seedlings', /seedling/i, null],
  ['shelve', /shelve|haul crates/i, null],
  ['clearout', /clear (a |the )?(sample storage|quarantine corner|corridor|stretcher)|stretcher lane|clear a corridor|keep it clear|supply route|corridor to sickbay/i, null],
  ['stage', /stage (cargo|crates|sensor drones)|probe pods|sensor pod|prep a survey shuttle/i, null],
  // medical: hands-on at the beds
  ['regen', /bumps and burns/i, MED],
  ['bedprep', /set up triage and isolation|prepare (biobeds|sickbay for|isolation bed)/i, MED],
  ['ward', /^(?!.*\bkit\b).*(\brounds?\b|vitals|physicals|screen|baseline scan|fitness check|check on triage|charting)/i, MED],
  ['dose', /\btreat|dispens|\bdose\b/i, MED],
  ['sterile', /steril|decontam|\bdecon\b/i, MED],
  ['restock', /restock|stock (splints|the)|top-up|replenish|prepare .*kits|stage trauma kit|escort kits/i, null],
  // engineering / environmental, on foot with the tool
  ['valves', /coolant (and damper walk|loop check|loop cross-check)|life support and coolant sweep|valve walk/i, null],
  ['breakers', /junction round|lighting controller|grid, gravity and life support rounds|pre-check eps|power feed|pad feed|relay sweep|check comm junctions/i, null],
  ['weld', /patch scrapes|leak patching|hull patch/i, null],
  ['filters', /\bfilter/i, null],
  ['firecheck', /fire suppression|foam and clamps/i, null],
  ['airflow', /ventilation|life support sweep/i, null],
  // transporter room + holodeck
  ['padscan', /pad (and emitter )?diagnostic/i, ['transporter']],
  ['padalign', /prep away team pads|calibrate for bulk/i, ['transporter']],
  ['emitters', /emitter sweep|safeties at full power/i, ['holodeck']],
  // security
  ['charge', /charge-rack|charger (round|load)|charger check|full charger/i, null],
  ['fieldsweep', /force-?field emitter test|field-check|emitters at the transporter|door force-?fields|every security field|^test (internal sensors|force fields)/i, null],
  ['lockup', /lock cargo bay|secure (the lab|samples)|return and secure|close the playroom|bulkhead drill/i, null],
  ['armcount', /armory (inventory|count|readiness)/i, null],
  ['escort', /^escort (valuables|medical supplies|stretcher|away team|patients)/i, null],
  // flight deck
  ['sweep', /\bfod\b/i, ['shuttlebay']],
  ['washdown', /wash down/i, null],
  ['fuel', /^fuel and stock/i, ['shuttlebay']],
  // galley / stores
  ['pack', /field rations|stage (extra|emergency) ration/i, null],
  ['wipedown', /clean gear|feedstock clean/i, null],
  ['clean', /^(?!.*(relay|request|capacity|pattern buffer|cleaning stock)).*(scrub|sanitis|sanitation|\bclean\b|mop|waste sweep|wipe|spill)/i, null],
  ['harvest', /harvest|pick|gather/i, null],
  ['growbed', /grow.?bed|bed round|hydroponic beds/i, ['arboretum', 'atrium']],
  ['serve', /^(?!.*\bcook).*(\bserve\b|feed the|meal service|trays to|refreshment)/i, GAL.concat(['bridge', 'lab', 'sickbay', 'readyroom'])],
  // science
  ['blight', /hydroponics health|plant stock/i, null],
  ['benchcal', /^calibrate instruments/i, ['lab']],
  ['extracts', /herbs and extracts/i, null],
  ['samples', /^(?!.*(stage|issue|prepare|carry|move|beam|recover|secure|analyse|review|culture|relief destination|tag)).*(sample|specimen|swab|contaminant|contamination|biohazard|hazardous signatures|pathogen|culture|purity)/i, ['lab', 'cargo', 'plant', 'airlock', 'arboretum']],
  // cargo
  ['lash', /lash|strap|tie-down|re-secure|\bnets?\b|secure (cargo|loose|the bay|everything)|seal hazmat/i, CAR.concat(['transporter'])],
  ['tally', /tally|count\b|inventory|verify (cargo|manifest against)|stores count/i, CAR],
  // engineering hands-on
  ['repair', /^(?!.*(review|write|file|assign)).*(repair|patch|replace|fix|ticket|backlog|bolt|torque|fitting|work order with)/i, ['engineering', 'workshop', 'plant', 'shuttlebay', 'cargo']],
  ['inspect', /^(?!.*(handlers|expiry)).*(inspect|engineering rounds|plant rounds|walk the (plant|deck)|conduit|plating|hull plate|leak|thermal|walk-?round of|maintenance sweep|survey the|check (gravity|hull|the plant)|seals? and (ports|lines)|tap inspection|injector (rounds|wear)|core and grid walk|post-maneuver inspection)/i, ['engineering', 'plant', 'workshop', 'transporter', 'datacore', 'cargo']],
  // flight deck
  ['walkround', /walk-?round|walkaround|walk-around|preflight|pre-flight|deck walk|inspect (the )?(shuttle|craft)/i, ['shuttlebay']],
  // supervisors: walk the stations with a PADD
  ['checklist', /walk sciences|department walk-?round|walk of departments|deck round notes|walk the comm junctions|spot-check logs|check data handling|review lab tech|readiness for transfers|shuttlebay and transporter readiness/i, null],
  // security / deck: on foot
  ['patrol', /^(?!.*notes).*(patrol|walk (the|crew)|door checks|sweep the deck|guard hold|walkabout of|security sweep)/i, null],
  ['hatch', /hatch|seal-?check|seals?\b|bulkhead|airlock|pressure door|door and pressure/i, ['cargo', 'airlock', 'shuttlebay', 'brig', 'armory', 'sickbay', 'stores']],
];
export function siteJobFor(it) {
  if (!it) return null; const label = it.label || it.task || '', ov = SITE_OVERRIDES[label];
  if (ov === null) return null;   // a console job whose words would trip a site rule
  if (ov && SITE_DEFS[ov]) return SITE_DEFS[ov];
  for (const [id, re, rooms] of SITE_RULES) if ((!rooms || rooms.includes(it.room)) && re.test(label)) return SITE_DEFS[id];
  return null;
}
// variety inside a site kind, keyed by the job's label: which of the def's items the supply point issues, which props come first, how many
// sites, the act's band / rate / repeats. Two jobs on the same def walk to different places with different tools and feel.
const lh = (s) => { let h = 2166136261; for (const ch of String(s || '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
export function siteVariant(def, label = '') {
  const h = lh(label + '|' + def.id), item = def.item?.length ? def.item[h % def.item.length] : null, span = def.n[1] - def.n[0];
  return { h, item, rot: (h >>> 4) % Math.max(1, Math.min(3, def.props.length)), n: def.n[0] + ((h >>> 8) % (span + 1)), band: ((h >>> 12) % 5) / 5, rate: 0.9 + ((h >>> 16) % 5) * 0.06, extra: def.need === 1 && (h >>> 20) % 3 === 0 ? 1 : 0, countBase: 2 + ((h >>> 22) % 2) };
}
export function jobFor(it) {
  const def = siteJobFor(it); if (def) return { type: 'sites', def, kind: 'site:' + def.id, variant: siteVariant(def, it.label || it.task) };
  const tool = gameFor(it); return tool ? { type: 'game', tool, kind: tool.kind } : null;
}
// ---- every loop + mission task -> console game kind or site job: counts (tests, TODO / README coverage table)
export function coverageAll(duties) {
  const kinds = {}, missing = []; let total = 0, sites = 0, games = 0;
  const add = (it, label) => { total++; const j = jobFor({ ...it, label }); if (!j) { missing.push(label); return; } kinds[j.kind] = (kinds[j.kind] || 0) + 1; if (j.type === 'sites') sites++; else games++; };
  for (const b of Object.values(duties.billets || {})) { for (const l of b.loops || []) add(l, l.label); for (const ts of Object.values(b.tasks || {})) for (const t of ts) add(t, t.task); }
  return { total, kinds, sites, games, missing, share: Math.max(0, ...Object.values(kinds)) / Math.max(1, total) };
}

// ---- sites in a room: the def's props (preference order, spread out), topped up with free floor tiles; a fetch site first when needed
const NAMES = { biobed: 'Biobed', exam_couch: 'Exam couch', surgical_table: 'Surgical table', infusion_stand: 'Infusion stand', steriliser: 'Steriliser', nursestation: "Nurses' station", autopsy_table: 'Autopsy table',
  med_dispenser: 'Med dispenser', shelving: 'Shelving', reachin_cooler: 'Cooler', drawers: 'Drawers', samplefridge: 'Sample fridge', injector_crate: 'Injector crate', servery: 'Servery', suitrack: 'Suit rack', weaponrack: 'Weapon rack',
  range: 'Range', dishwasher: 'Dishwasher', counter: 'Counter', sinkunit: 'Sink', table: 'Table', wastebin: 'Waste bin', bar: 'Bar', growbed: 'Grow bed', tree: 'Tree', nutrient_tanks: 'Nutrient tanks', plant: 'Planter', specimen_tank: 'Specimen tank',
  card_table: 'Card table', briefing_table: 'Briefing table', charttable: 'Chart table', labbench: 'Lab bench', fumehood: 'Fume hood', spectrometer: 'Spectrometer', crate: 'Crate', scrubber: 'Scrubber',
  fieldgen: 'Field generator', fieldgen_damp: 'Damper field', reactorstation: 'Reactor station', warpcore: 'Core', heatexch: 'Heat exchanger', pumpskid: 'Pump skid', tank: 'Tank', relayrack: 'Relay rack', servers: 'Server stack', buffertank: 'Buffer tank',
  beampedestal: 'Beam pedestal', baycontrol: 'Bay control', workbench: 'Workbench', fabricator: 'Fabricator', lathe: 'Lathe', drill_press: 'Drill press', maint_stand: 'Maintenance stand', console: 'Console', pallet_loaded: 'Pallet', pallet: 'Pallet',
  hoversled: 'Sled', cart: 'Cart', feedstock_silo: 'Feedstock silo', cellfield: 'Cell field', cell: 'Cell', scan_arch: 'Scan arch', airlock_doors: 'Airlock door', shuttle: 'Shuttle', workpod: 'Work pod', fuelbowser: 'Fuel bowser',
  issuecounter: 'Issue counter', secdesk: 'Security desk', desk: 'Desk' };
export const propName = (k) => NAMES[k] || (k ? k.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) : 'Floor');
export function resolveSites(def, ctx, seed = 1, opts = {}) {
  const rnd = mulberry32(seed >>> 0), { rect, props = [], free = () => true } = ctx, V = opts.variant, inR = (p) => p.tx >= rect.x && p.tx < rect.x + rect.w && p.ty >= rect.y && p.ty < rect.y + rect.h;
  const n = V ? V.n : def.n[0] + Math.floor(rnd() * (def.n[1] - def.n[0] + 1)), out = [], far = (tx, ty, d = 1.5) => out.every(s => Math.hypot(s.tx - tx, s.ty - ty) >= d);
  const mine = props.filter(inR);
  const prefs = V?.rot ? def.props.slice(V.rot).concat(def.props.slice(0, V.rot)) : def.props;
  for (const k of prefs) for (const p of mine.filter(q => q.kind === k).sort((a, b) => (a.tx * 7 + a.ty * 13) % 5 - (b.tx * 7 + b.ty * 13) % 5)) { if (out.length >= n) break; if (far(p.tx, p.ty, 1)) out.push({ tx: p.tx, ty: p.ty, kind: k, prop: true }); }
  if (out.length < n) {   // floor fallback: free tiles inside the room, away from the walls where possible, spread apart
    const tiles = []; for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) if (free(x, y) && !mine.some(p => p.tx === x && p.ty === y)) tiles.push([x, y, (x > rect.x && x < rect.x + rect.w - 1 && y > rect.y && y < rect.y + rect.h - 1) ? 0 : 1]);
    tiles.sort((a, b) => a[2] - b[2] || rnd() - 0.5);
    for (const d of [2.5, 1.5, 1, 0]) for (const [x, y] of tiles) { if (out.length >= n) break; if (far(x, y, d)) out.push({ tx: x, ty: y, kind: 'floor', prop: false }); }
  }
  // sequence order: a walk, nearest-neighbour from the first
  if (out.length > 2) { const o = [out.shift()]; while (out.length) { const l = o[o.length - 1]; out.sort((a, b) => Math.hypot(a.tx - l.tx, a.ty - l.ty) - Math.hypot(b.tx - l.tx, b.ty - l.ty)); o.push(out.shift()); } out.push(...o); }
  out.forEach((s, i) => { s.name = `${def.site} ${i + 1}${s.prop ? ' · ' + propName(s.kind) : ''}`; s.act = def.act; });
  if (def.act === 'carry') {   // the hub: one pick-up point ('out': lift there, set down at each site) or one put-down point ('in': lift at each site, set down there)
    const hp = (def.hub || []).map(k => mine.find(p => p.kind === k && !out.some(s => s.tx === p.tx && s.ty === p.ty))).find(Boolean); let hub = hp ? { tx: hp.tx, ty: hp.ty, kind: hp.kind, prop: true } : null;
    if (!hub) for (const d of [2, 1, 0]) { for (let y = rect.y; y < rect.y + rect.h && !hub; y++) for (let x = rect.x; x < rect.x + rect.w && !hub; x++) if (free(x, y) && far(x, y, d) && !mine.some(p => p.tx === x && p.ty === y)) hub = { tx: x, ty: y, kind: 'floor', prop: false }; if (hub) break; }
    hub ||= { ...out[0], prop: false, kind: 'floor' };
    for (const s of out) s.role = def.carry === 'in' ? 'pick' : 'drop';
    const h = { ...hub, act: 'carry', role: def.carry === 'in' ? 'drop' : 'pick', hub: true, trips: out.length, name: `${def.hubName || 'Hub'}${hub.prop ? ' · ' + propName(hub.kind) : ''}` };
    if (def.carry === 'in') out.push(h); else out.unshift(h);
  }
  if (opts.fetch && def.item?.length) {   // the item is not on the belt: the room's supply point issues one
    const sp = SUPPLY.map(k => mine.find(p => p.kind === k)).find(Boolean); let f = sp ? { tx: sp.tx, ty: sp.ty, kind: sp.kind, prop: true } : null;
    if (!f) for (let y = rect.y; y < rect.y + rect.h && !f; y++) for (let x = rect.x; x < rect.x + rect.w && !f; x++) if (free(x, y) && far(x, y, 1)) f = { tx: x, ty: y, kind: 'floor', prop: false };
    if (f) out.unshift({ ...f, act: 'fetch', name: `Supply · ${propName(f.kind === 'floor' ? 'locker' : f.kind)}` });
  }
  return out;
}

// ---- one work-site run: per-site skill state + the job's faults, clock and result
const clamp01 = (v) => Math.max(0, Math.min(1, v));
export function createSiteRun(def, seed = 1, sites = [], opts = {}) {
  const rnd = mulberry32((seed ^ 0x51735) >>> 0), calm = !!opts.calm, k = calm ? 1.5 : 1, V = opts.variant || null;
  const run = { def, state: 'work', faults: 0, t: 0, limit: Math.round((40 + 25 * sites.length) * k), events: [], calm, why: null, prev: false, carrying: false, item: V?.item || def.item?.[0] || null, variant: V };
  run.sites = sites.map((s) => {
    const o = { ...s, prog: 0, done: false, act: s.act || def.act };
    if (o.act === 'scan') { o.bearing = (rnd() * 2 - 1) * 0.5; o.sig = 0; o.lock = 0; o.tol = calm ? 0.5 : 0.35; }
    if (o.act === 'timing' || o.act === 'turn') { const w = calm ? 0.24 : 0.16, c = 0.45 + (V ? (V.band * 0.7 + rnd() * 0.3) : rnd()) * 0.35; o.band = [c - w / 2, c + w / 2]; o.m = 0; o.hits = 0; o.need = (def.need || 1) + (V?.extra || 0); o.rate = (calm ? 0.38 : 0.55) * (V?.rate || 1); o.wait = false; o.k = (calm ? 1 / 1.6 : 1 / 2.2) * (V?.rate || 1); }
    if (o.act === 'count') { const b = V?.countBase || 2; o.n = b + Math.floor(rnd() * 4); o.c = 0; o.idle = 0; }
    if (o.act === 'carry') { o.c = 0; o.set = 0; o.trips = o.trips || 1; if (def.drop === 'count' && o.role === 'drop' && !o.hub) { const b = V?.countBase || 2; o.n = b + Math.floor(rnd() * 4); o.idle = 0; } }
    if (o.act === 'read') { o.settle = 0; o.need = calm ? 1.1 : 0.8; o.ht = 0; o.fired = false; mkRead(o); }
    if (o.act === 'scrub') { o.strokes = 0; }
    return o;
  });
  function mkRead(o) {   // the reading at a read site: in limits or out (about 45 % out), never on the edge
    if (def.reads === 'switch') { const a = SWITCHES[Math.floor(rnd() * SWITCHES.length)], out = rnd() < 0.45, b = out ? SWITCHES.filter(x => x !== a)[Math.floor(rnd() * (SWITCHES.length - 1))] : a; o.read = { name: 'Placard', want: a, v: b, unit: '', out, txt: `Placard: ${a} · switch at ${b}` }; return; }
    const R = READS[def.reads || def.id] || READS.gauges, [name, unit, lo, hi] = R[Math.floor(rnd() * R.length)], span = hi - lo || 1, out = rnd() < 0.45, step = Number.isInteger(lo) && Number.isInteger(hi) ? 1 : 0.1;
    let v = out ? (rnd() < 0.5 && lo - span * 0.2 > 0 ? lo - span * (0.2 + rnd() * 0.3) : hi + span * (0.2 + rnd() * 0.3)) : lo + span * (0.15 + rnd() * 0.7); v = step < 1 ? +v.toFixed(1) : Math.round(v);
    o.read = { name, unit, lo, hi, v, out: v < lo || v > hi, txt: `${name} ${v}${unit ? ' ' + unit : ''} · spec ${lo}–${hi}` };
  }
  const ev = (type, x = {}) => { const e = { type, t: run.t, ...x }; run.events.push(e); if (run.events.length > 40) run.events.shift(); return e; };
  const fault = (s, why) => { run.faults++; ev('fault', { site: run.sites.indexOf(s), why }); };
  const wantRole = () => run.carrying ? 'drop' : 'pick';
  run.nextIndex = () => { const f = run.sites.findIndex(s => !s.done && s.act === 'fetch'); if (f >= 0) return f; if (def.act === 'carry') { const r = wantRole(); return run.sites.findIndex(s => !s.done && s.role === r); } return run.sites.findIndex(s => !s.done); };
  Object.defineProperty(run, 'next', { get: () => run.nextIndex() });
  Object.defineProperty(run, 'left', { get: () => run.sites.filter(s => !s.done).length });
  const finish = (state, why) => { if (run.state !== 'work') return; run.state = state; run.why = why || null; ev(state, { why }); };
  // may the player work site i now? (sequence order; the fetch site first) -> null or a reason
  run.blocked = (i) => { const s = run.sites[i]; if (!s || s.done) return 'done'; const f = run.sites.findIndex(x => !x.done && x.act === 'fetch'); if (f >= 0 && f !== i) return 'fetch'; if (def.order === 'seq' && s.act !== 'fetch' && run.next !== i) return 'order'; if (s.act === 'carry' && s.role !== wantRole()) return run.carrying ? 'hands' : 'empty'; return null; };
  run.fetched = () => { const f = run.sites.find(x => !x.done && x.act === 'fetch'); if (f) { f.done = true; f.prog = 1; ev('site', { site: run.sites.indexOf(f) }); } };
  const complete = (s) => { s.done = true; s.prog = 1; ev('site', { site: run.sites.indexOf(s) }); if (run.sites.every(x => x.done)) finish('win'); };
  run.step = (dt, inp = {}) => {
    if (run.state !== 'work') return null; if (!inp.away) run.t += dt;
    const hold = !!inp.hold, released = run.prev && !hold; run.prev = hold;
    if (run.t >= run.limit) { finish('fail', 'time'); return null; }
    const i = inp.at ?? -1, s = run.sites[i]; let out = null;
    for (const x of run.sites) if (x !== s && (x.act === 'count' || x.n != null && x.act === 'carry') && x.c > 0 && !x.done) { x.c = 0; x.idle = 0; }   // walked off mid-count: start over there
    if (!s || s.done) return null;
    const why = run.blocked(i); if (why) { if (inp.press) out = ev('blocked', { site: i, why }); return out; }
    if (s.act === 'fetch') { if (inp.press) out = ev('fetch', { site: i }); return out; }
    if (def.item?.length && !inp.hasItem) { if (inp.press) out = ev('needItem', { site: i }); return out; }
    if (s.act === 'scrub') { if (hold) { const w = Math.min(1, Math.abs(inp.wipe || 0) / 1.2); s.prog = clamp01(s.prog + dt * (0.06 + 0.3 * w) * (calm ? 1.3 : 1)); if (w > 0.4) s.strokes += dt; } if (s.prog >= 1) complete(s); }
    else if (s.act === 'scan') { const sig = clamp01(1 - Math.abs((inp.look || 0) - s.bearing) / s.tol); s.sig += (sig - s.sig) * Math.min(1, dt * 10); if (hold && s.sig > 0.8) s.lock += dt; else if (hold) s.lock = Math.max(0, s.lock - dt * 0.5); s.prog = clamp01(s.lock / 1); if (s.prog >= 1) complete(s); }
    else if (s.act === 'timing') {
      if (s.wait) { if (!hold) s.wait = false; }
      else if (hold) { s.m += dt * s.rate; if (s.m > 1) { fault(s, 'over'); s.m = 0; s.wait = true; } }
      else if (released && s.m > 0.03) { if (s.m >= s.band[0] && s.m <= s.band[1]) { s.hits++; ev('hit', { site: i }); } else fault(s, s.m < s.band[0] ? 'under' : 'over'); s.m = 0; }
      s.prog = s.hits / s.need; if (s.hits >= s.need) complete(s);
    }
    else if (s.act === 'turn') {   // crank with the view: E held, the view's turn speed (either way) winds the gauge; let go in the band
      if (s.wait) { if (!hold) s.wait = false; }
      else if (hold) { s.m += Math.abs(inp.turn || 0) * dt * s.k; if (s.m > 1) { fault(s, 'over'); s.m = 0; s.wait = true; } }
      else if (released && s.m > 0.03) { if (s.m >= s.band[0] && s.m <= s.band[1]) { s.hits++; ev('hit', { site: i }); } else fault(s, s.m < s.band[0] ? 'loose' : 'over'); s.m = 0; }
      s.prog = s.hits / s.need; if (s.hits >= s.need) complete(s);
    }
    else if (s.act === 'carry') {   // pick: one E lifts a load; drop: hold E ~0.6 s to set it down square (letting go early starts the set-down again)
      if (s.role === 'pick') { if (inp.press) { run.carrying = true; s.c++; ev('lift', { site: i }); if (s.hub) { s.prog = s.c / s.trips; if (s.c >= s.trips) complete(s); } else complete(s); } }
      else if (s.n != null) {   // counted drop: tap E once per item, pause; a miscount is a fault and you count again
        if (inp.press) { s.c++; s.idle = 0; ev('tap', { site: i, c: s.c }); } else if (s.c > 0) { s.idle += dt; if (s.idle >= 0.9) { if (s.c === s.n) { run.carrying = false; ev('drop', { site: i }); complete(s); } else { fault(s, 'miscount'); s.c = 0; } s.idle = 0; } }
        if (!s.done) s.prog = Math.min(0.95, s.c / s.n);
      }
      else { if (hold) { s.set += dt; if (s.set >= 0.6) { s.set = 0; run.carrying = false; ev('drop', { site: i }); if (s.hub) { s.c++; s.prog = s.c / s.trips; if (s.c >= s.trips) complete(s); } else complete(s); } } else s.set = 0; if (!s.done && !s.hub) s.prog = s.set / 0.6 * 0.95; }
    }
    else if (s.act === 'read') {   // the needle settles while you stand there; then tap E (first call) or hold E 0.7 s (second call)
      s.settle = Math.min(s.need, s.settle + dt); const call = (second) => { if (second === s.read.out) { ev('hit', { site: i }); complete(s); } else { fault(s, 'misread'); mkRead(s); s.settle = 0; } };
      if (s.settle < s.need) { s.ht = 0; s.fired = false; }
      else if (hold) { s.ht += dt; if (!s.fired && s.ht >= 0.7) { s.fired = true; call(true); } }
      else if (released && s.ht > 0 && !s.fired) call(false);
      if (!hold) { s.ht = 0; s.fired = false; }
      if (!s.done) s.prog = 0.5 * s.settle / s.need + (s.fired ? 0 : Math.min(0.45, s.ht / 0.7 * 0.45));
    }
    else if (s.act === 'count') {
      if (inp.press) { s.c++; s.idle = 0; ev('tap', { site: i, c: s.c }); } else if (s.c > 0) { s.idle += dt; if (s.idle >= 0.9) { if (s.c === s.n) complete(s); else { fault(s, 'miscount'); s.c = 0; } s.idle = 0; } }
      s.prog = s.done ? 1 : Math.min(0.95, s.c / s.n);
    }
    return out;
  };
  run.cancel = () => finish('cancel');
  run.result = () => ({ state: run.state, faults: run.faults, t: run.t, why: run.why, sites: run.sites.length });
  run.outcome = () => {
    if (run.state === 'win' && run.faults < 3) { const perfect = run.faults === 0; return { quality: 'proper', timeMul: perfect ? 0.05 : 0.08, perfect, label: perfect ? 'Clean work' : 'Done properly' }; }
    if (run.state === 'win') return { quality: 'rushed', timeMul: 0.1, perfect: false, label: 'Done, but sloppy — logged as rushed' };
    if (run.state === 'fail') return { quality: 'rushed', timeMul: 0.5, perfect: false, label: 'Ran long — the job is logged as rushed' };
    return null;
  };
  // the input that makes progress at site i right now (tests / auto-play). bad = an input that faults (or null for acts without faults)
  run.hint = (i, frame = 0) => {
    const s = run.sites[i]; if (!s || s.done) return { at: i }; const base = { at: i, hasItem: true };
    if (s.act === 'fetch') return { ...base, press: frame % 2 === 0 };
    if (s.act === 'scrub') return { ...base, hold: true, wipe: 2 };
    if (s.act === 'scan') return { ...base, hold: true, look: s.bearing };
    if (s.act === 'timing') { const mid = (s.band[0] + s.band[1]) / 2; return { ...base, hold: !s.wait && s.m < mid }; }
    if (s.act === 'count') return { ...base, press: s.c < s.n && frame % 3 === 0 };
    if (s.act === 'turn') { const mid = (s.band[0] + s.band[1]) / 2; return { ...base, hold: !s.wait && s.m < mid, turn: 1.2 }; }
    if (s.act === 'carry') return s.role === 'pick' ? { ...base, press: frame % 2 === 0 } : s.n != null ? { ...base, press: s.c < s.n && frame % 3 === 0 } : { ...base, hold: true };
    if (s.act === 'read') return s.settle < s.need ? base : s.read.out ? { ...base, hold: true } : { ...base, hold: frame % 2 === 0 };
    return base;
  };
  run.bad = (i, frame = 0) => { const s = run.sites[i]; if (!s || s.done) return { at: i }; const base = { at: i, hasItem: true };
    if (s.act === 'timing') return { ...base, hold: !s.wait && s.m < s.band[0] * 0.5 };
    if (s.act === 'turn') return { ...base, hold: !s.wait && s.m < s.band[0] * 0.5, turn: 1.2 };
    if (s.act === 'carry' && s.role === 'pick' && def.drop === 'count') return { ...base, press: frame % 2 === 0 };   // lift fine, then miscount at the shelf
    if (s.act === 'count' || (s.act === 'carry' && s.n != null)) return { ...base, press: s.c < s.n + 1 && frame % 3 === 0 };
    if (s.act === 'read') return s.settle < s.need ? base : s.read.out ? { ...base, hold: frame % 2 === 0 } : { ...base, hold: true };
    return { ...base, hold: true, look: s.bearing + 1, wipe: 0 }; };
  return run;
}
const RUSH = { scrub: ['Wiped the middle and left the corners.', 'Gave it one pass with a dry mop.'], scan: ['Waved the scanner in the general direction.', 'Logged the first reading.'],
  turn: ['Hand-tight and moved on.', 'Gave each one a quarter turn and called it done.'], carry: ['Left it all in one pile by the door.', 'Dropped the lot where it was nearest.'],
  timing: ['Close enough on every one.', 'Eyeballed the gauge.'], count: ['Called it full without counting.', 'Wrote the expected number down.'], read: ['Wrote "in limits" against every gauge from the doorway.', 'Ticked them all without waiting for the needles.'] };
export function siteRushNote(def, seed = 1) { const a = RUSH[def?.act] || RUSH.scan; return a[(seed >>> 0) % a.length]; }
