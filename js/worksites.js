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
};
export const ACTS = { scrub: 'Scrub', scan: 'Scan sweep', timing: 'Charge and release', count: 'Tap count', fetch: 'Collect item' };
for (const [id, d] of Object.entries(SITE_DEFS)) d.id = id;
// where the item is issued when the player does not carry one (fetch site): supply props, in preference order
export const SUPPLY = ['shelving', 'med_dispenser', 'weaponrack', 'suitrack', 'drawers', 'reachin_cooler', 'issuecounter', 'workbench', 'servery', 'nursestation', 'secdesk', 'desk', 'crate'];

// ---- which jobs are physical. Exact labels first, then rules (label regex, rooms or null). Everything else keeps its console game.
const MED = ['sickbay'], GAL = ['mess', 'arboretum', 'lounge'], CAR = ['cargo', 'stores', 'shuttlebay'];
export const SITE_OVERRIDES = {
  'Ward rounds': 'ward', 'Patient rounds': 'ward', 'Vitals round on occupied beds': 'ward', 'Routine rounds and charting': 'ward', 'Routine physicals and rounds': 'ward',
  'Dispense meds and update patient list': 'dose', 'Sterile field sweep and tray check': 'sterile', 'Sterilise instruments and surgical bay': 'sterile',
  'Restock hypos, dressings and trays': 'restock', 'Stock splints and burn gel': 'restock', 'Grow bed round': 'growbed', 'Routine bed round and logs': 'growbed',
  'Harvest for galley': 'harvest', 'Scrub and sanitise the galley': 'clean', 'Sanitation and waste sweep': 'clean', 'Sanitise the galley against contamination': 'clean',
  'Check straps, seals and nets': 'lash', 'Re-secure loose pallets': 'lash', 'Strap down everything in the bay before maneuvers': 'lash', 'Patrol the ship': 'patrol',
  'Deck patrol and door checks': 'patrol', 'Pressure door and hatch rounds': 'hatch', 'Routine seal and hatch rounds': 'hatch', 'Serve the regular meals on time': 'serve',
  'Count and verify cargo against manifest': 'tally', 'Walk-round of all departments': 'patrol',
};
export const SITE_RULES = [
  // medical: hands-on at the beds
  ['ward', /^(?!.*\bkit\b).*(\brounds?\b|vitals|physicals|screen|baseline scan|fitness check|check on triage|charting)/i, MED],
  ['dose', /\btreat|dispens|\bdose\b/i, MED],
  ['sterile', /steril|decontam|\bdecon\b|isolation bed|prepare (biobeds|sickbay|isolation)/i, MED],
  ['restock', /restock|stock (splints|the)|top-up|replenish|prepare .*kits|stage trauma kit|shelve/i, null],
  // galley / hydroponics
  ['clean', /^(?!.*(relay|request|capacity|pattern buffer)).*(scrub|sanitis|sanitation|\bclean\b|mop|waste sweep|wipe|spill)/i, null],
  ['harvest', /harvest|pick|gather/i, null],
  ['growbed', /grow.?bed|bed round|seedling|hydroponics health|hydroponic beds|plant stock/i, ['arboretum', 'atrium']],
  ['serve', /^(?!.*\bcook).*(\bserve\b|feed the|meal service|trays to|deliver (coffee|trays|meals)|refreshment)/i, GAL.concat(['bridge', 'lab', 'sickbay', 'readyroom'])],
  // science: collect at the bench / bed / crate
  ['samples', /^(?!.*(stage|issue|prepare|carry|move|beam|recover|secure)).*(sample|specimen|swab|contaminant|contamination|biohazard|hazardous signatures|pathogen|culture)/i, ['lab', 'cargo', 'plant', 'airlock', 'arboretum']],
  // cargo
  ['lash', /lash|strap|tie-down|re-secure|net|secure (cargo|loose|the bay|everything)|seal hazmat/i, CAR.concat(['transporter'])],
  ['tally', /tally|count\b|inventory|verify (cargo|manifest against)|shelve|receive inbound|draw fresh stock|pull .*crates/i, CAR],
  // engineering hands-on
  ['repair', /^(?!.*(review|write|file)).*(repair|patch|replace|fix|ticket|backlog|bolt|torque|fitting)/i, ['engineering', 'workshop', 'plant', 'shuttlebay', 'cargo']],
  ['inspect', /^(?!.*handlers).*(inspect|engineering rounds|plant rounds|walk the (plant|deck)|conduit|plating|hull plate|leak|thermal|walk-?round of|maintenance sweep|survey the|check (gravity|hull|the plant)|seals? and (ports|lines))/i, ['engineering', 'plant', 'workshop', 'transporter', 'datacore', 'cargo']],
  // flight deck
  ['walkround', /walk-?round|walkaround|walk-around|preflight|pre-flight|fod|deck walk|inspect (the )?(shuttle|craft)|hull plates and sensor mounts/i, ['shuttlebay']],
  // security / deck: on foot
  ['patrol', /^(?!.*notes).*(patrol|walk (the|crew)|door checks|sweep the deck|guard hold|cell check|walkabout of|security sweep)/i, null],
  ['hatch', /hatch|seal-?check|seals?\b|bulkhead|airlock|pressure door/i, ['cargo', 'airlock', 'shuttlebay', 'brig', 'armory', 'sickbay', 'stores']],
];
export function siteJobFor(it) {
  if (!it) return null; const label = it.label || it.task || '', ov = SITE_OVERRIDES[label];
  if (ov && SITE_DEFS[ov]) return SITE_DEFS[ov];
  for (const [id, re, rooms] of SITE_RULES) if ((!rooms || rooms.includes(it.room)) && re.test(label)) return SITE_DEFS[id];
  return null;
}
export function jobFor(it) {
  const def = siteJobFor(it); if (def) return { type: 'sites', def, kind: 'site:' + def.id };
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
  const rnd = mulberry32(seed >>> 0), { rect, props = [], free = () => true } = ctx, inR = (p) => p.tx >= rect.x && p.tx < rect.x + rect.w && p.ty >= rect.y && p.ty < rect.y + rect.h;
  const n = def.n[0] + Math.floor(rnd() * (def.n[1] - def.n[0] + 1)), out = [], far = (tx, ty, d = 1.5) => out.every(s => Math.hypot(s.tx - tx, s.ty - ty) >= d);
  const mine = props.filter(inR);
  for (const k of def.props) for (const p of mine.filter(q => q.kind === k).sort((a, b) => (a.tx * 7 + a.ty * 13) % 5 - (b.tx * 7 + b.ty * 13) % 5)) { if (out.length >= n) break; if (far(p.tx, p.ty, 1)) out.push({ tx: p.tx, ty: p.ty, kind: k, prop: true }); }
  if (out.length < n) {   // floor fallback: free tiles inside the room, away from the walls where possible, spread apart
    const tiles = []; for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) if (free(x, y) && !mine.some(p => p.tx === x && p.ty === y)) tiles.push([x, y, (x > rect.x && x < rect.x + rect.w - 1 && y > rect.y && y < rect.y + rect.h - 1) ? 0 : 1]);
    tiles.sort((a, b) => a[2] - b[2] || rnd() - 0.5);
    for (const d of [2.5, 1.5, 1, 0]) for (const [x, y] of tiles) { if (out.length >= n) break; if (far(x, y, d)) out.push({ tx: x, ty: y, kind: 'floor', prop: false }); }
  }
  // sequence order: a walk, nearest-neighbour from the first
  if (out.length > 2) { const o = [out.shift()]; while (out.length) { const l = o[o.length - 1]; out.sort((a, b) => Math.hypot(a.tx - l.tx, a.ty - l.ty) - Math.hypot(b.tx - l.tx, b.ty - l.ty)); o.push(out.shift()); } out.push(...o); }
  out.forEach((s, i) => { s.name = `${def.site} ${i + 1}${s.prop ? ' · ' + propName(s.kind) : ''}`; s.act = def.act; });
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
  const rnd = mulberry32((seed ^ 0x51735) >>> 0), calm = !!opts.calm, k = calm ? 1.5 : 1;
  const run = { def, state: 'work', faults: 0, t: 0, limit: Math.round((40 + 25 * sites.length) * k), events: [], calm, why: null, prev: false };
  run.sites = sites.map((s) => {
    const o = { ...s, prog: 0, done: false, act: s.act || def.act };
    if (o.act === 'scan') { o.bearing = (rnd() * 2 - 1) * 0.5; o.sig = 0; o.lock = 0; o.tol = calm ? 0.5 : 0.35; }
    if (o.act === 'timing') { const w = calm ? 0.24 : 0.16, c = 0.45 + rnd() * 0.35; o.band = [c - w / 2, c + w / 2]; o.m = 0; o.hits = 0; o.need = def.need || 1; o.rate = calm ? 0.38 : 0.55; o.wait = false; }
    if (o.act === 'count') { o.n = 2 + Math.floor(rnd() * 4); o.c = 0; o.idle = 0; }
    if (o.act === 'scrub') { o.strokes = 0; }
    return o;
  });
  const ev = (type, x = {}) => { const e = { type, t: run.t, ...x }; run.events.push(e); if (run.events.length > 40) run.events.shift(); return e; };
  const fault = (s, why) => { run.faults++; ev('fault', { site: run.sites.indexOf(s), why }); };
  run.nextIndex = () => run.sites.findIndex(s => !s.done && s.act === 'fetch') >= 0 ? run.sites.findIndex(s => !s.done && s.act === 'fetch') : def.order === 'seq' ? run.sites.findIndex(s => !s.done) : run.sites.findIndex(s => !s.done);
  Object.defineProperty(run, 'next', { get: () => run.nextIndex() });
  Object.defineProperty(run, 'left', { get: () => run.sites.filter(s => !s.done).length });
  const finish = (state, why) => { if (run.state !== 'work') return; run.state = state; run.why = why || null; ev(state, { why }); };
  // may the player work site i now? (sequence order; the fetch site first) -> null or a reason
  run.blocked = (i) => { const s = run.sites[i]; if (!s || s.done) return 'done'; const f = run.sites.findIndex(x => !x.done && x.act === 'fetch'); if (f >= 0 && f !== i) return 'fetch'; if (def.order === 'seq' && s.act !== 'fetch' && run.next !== i) return 'order'; return null; };
  run.fetched = () => { const f = run.sites.find(x => !x.done && x.act === 'fetch'); if (f) { f.done = true; f.prog = 1; ev('site', { site: run.sites.indexOf(f) }); } };
  const complete = (s) => { s.done = true; s.prog = 1; ev('site', { site: run.sites.indexOf(s) }); if (run.sites.every(x => x.done)) finish('win'); };
  run.step = (dt, inp = {}) => {
    if (run.state !== 'work') return null; if (!inp.away) run.t += dt;
    const hold = !!inp.hold, released = run.prev && !hold; run.prev = hold;
    if (run.t >= run.limit) { finish('fail', 'time'); return null; }
    const i = inp.at ?? -1, s = run.sites[i]; let out = null;
    for (const x of run.sites) if (x !== s && x.act === 'count' && x.c > 0) { x.c = 0; x.idle = 0; }   // walked off mid-count: start over there
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
    return base;
  };
  run.bad = (i, frame = 0) => { const s = run.sites[i]; if (!s || s.done) return { at: i }; const base = { at: i, hasItem: true };
    if (s.act === 'timing') return { ...base, hold: !s.wait && s.m < s.band[0] * 0.5 };
    if (s.act === 'count') return { ...base, press: s.c < s.n + 1 && frame % 3 === 0 };
    return { ...base, hold: true, look: s.bearing + 1, wipe: 0 }; };
  return run;
}
const RUSH = { scrub: ['Wiped the middle and left the corners.', 'Gave it one pass with a dry mop.'], scan: ['Waved the scanner in the general direction.', 'Logged the first reading.'],
  timing: ['Close enough on every one.', 'Eyeballed the gauge.'], count: ['Called it full without counting.', 'Wrote the expected number down.'] };
export function siteRushNote(def, seed = 1) { const a = RUSH[def?.act] || RUSH.scan; return a[(seed >>> 0) % a.length]; }
