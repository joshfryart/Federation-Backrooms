// Compiles docs/ship-inventory/*.json into assets/data/ship-items.json: what a player finds when searching each kind of wall fixture,
// per game room type. Keeps the game file small (capped per room × fixture) and deterministic.  usage: node tools/build-game-items.mjs
import fs from 'fs';
const dir = 'docs/ship-inventory/', spaces = {};
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) for (const s of JSON.parse(fs.readFileSync(dir + f, 'utf8')).spaces) spaces[s.id] = s;
// game room type → plan space ids that feed it
const ROOM_SPACES = { bridge: [1, 4], engineering: [44, 46, 47, 48, 52, 53], sickbay: [20, 21, 22], mess: [15, 16, 18], transporter: [40, 41], shuttlebay: [55, 56, 57], cargo: [60, 61, 109], holodeck: [42, 98], quarters: [9, 10, 7, 67, 87], arboretum: [31, 32], corridor: [62, 66, 83, 84], jefferies: [63],
  readyroom: [2, 3, 68, 91], brig: [35, 33, 75], armory: [34, 72], gym: [43], lab: [26, 28, 29, 27], laundry: [12, 88], lounge: [13, 5, 69], workshop: [52, 53, 123], plant: [49, 50, 51], morgue: [25], datacore: [38, 39, 97], stores: [17, 19, 92], washroom: [11, 110, 84], airlock: [58, 122] };
// searchable fixture kinds → which inventory rows can be inside/on them
const MEDICAL = /bandage|gauze|splint|syringe|hypo|antiseptic|gloves|dressing|medic|first.?aid|ointment|tablet|analges|saline|swab|thermometer|tourniquet|oxygen mask|burn|suture|forceps|cuff/i;
const TOOLS = /wrench|screwdriver|pliers|hammer|spanner|socket|drill|cutter|crimp|multimeter|torch|flashlight|clamp|file\b|chisel|saw|allen|hex key|tape|gauge|probe|solder|driver|bit set|ratchet|level\b/i;
const HOSE = /hose|nozzle|coupling|reel|valve|clamp|fitting|strap|tether|line/i;
const KINDS = {
  locker: r => r[3] === 'locker' || (r[2] === 'inside' && !MEDICAL.test(r[0])),
  medcab: r => MEDICAL.test(r[0]), kit: r => MEDICAL.test(r[0]),
  shelf: r => r[3] === 'shelf', rack: r => r[3] === 'rack' || r[3] === 'shelf',
  toolboard: r => TOOLS.test(r[0]), hose: r => HOSE.test(r[0]),
};
const carry = (r) => !['ceiling', 'built-in', 'floor'].includes(r[3]) && r[4] !== 'huge' && !/\(decor|decor '|emitter, ceiling|ceiling/i.test(r[0]);
const CAP = 40, seed = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const rng = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const out = { v: 1, rooms: {} }; let n = 0;
for (const [room, ids] of Object.entries(ROOM_SPACES)) {
  const rows = ids.flatMap(id => (spaces[id]?.rows || [])).filter(carry);
  out.rooms[room] = {};
  for (const [kind, ok] of Object.entries(KINDS)) {
    let pool = rows.filter(r => ok(r) && r[4] !== 'huge' && r[4] !== 'large'); if (pool.length < 6) pool = rows.filter(r => ok(r));   // small things fit in fixtures; fall back to anything that matches
    if (pool.length < 6 && !['medcab', 'kit', 'toolboard', 'hose'].includes(kind)) pool = rows.filter(r => r[2] === 'inside' || r[3] === 'shelf');
    const R = rng(seed(room + kind)); const a = pool.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    const items = a.slice(0, CAP).map(r => [r[0], Math.min(r[1], 99)]); if (items.length) { out.rooms[room][kind] = items; n += items.length; }
  }
}
// examine text per prop kind: the inventory row that best names that prop in this room's spaces → [name, real-world equivalent]
const PROP = { console: /console|workstation|operator station/i, chair: /command chair|captain.?s chair|\bchair\b/i, viewscreen: /view ?screen|main screen|panoramic|observation window|window/i, warpcore: /reactor|core/i,
  shuttle: /shuttle|craft/i, holocube: /holo|emitter/i, pad: /\bpad\b|platform/i, bunk: /bunk|berth|\bbed\b|cot\b/i, table: /table|bench|counter|desk/i, biobed: /bio-?bed|\bbed\b|stretcher|gurney|examination couch/i,
  crate: /crate|container|\bcase\b|drum|pallet|\bbox\b/i, tree: /\btrees?\b(?! (box|storage))|planter|grow bed|potted|\bplants?\b(?! control| status|room| —)/i, lonechair: /armchair|chair|seat/i, plant: /planter|plant/i, cart: /cart|trolley/i, replicator: /replicator/i,
  desk: /desk/i, cell: /cell|bunk|bars/i, weaponrack: /rack|cabinet|locker/i, treadmill: /treadmill/i, weightbench: /bench|barbell|weight/i, labbench: /bench|microscope/i, washer: /washer|washing/i, sofa: /sofa|couch|settee/i,
  lathe: /lathe|milling|machine/i, workbench: /bench/i, tank: /tank|vessel|boiler|dewar/i, drawers: /drawer|cold|refriger|mortuary/i, servers: /server|rack|stack|cabinet/i, shelving: /shelving|shelf|rack/i, suitrack: /suit|locker/i, sinkunit: /sink|basin|wash/i,
  // art batches 1-4 (js/propart-*.js)
  helm: /\bhelm\b|flight control|conn station|pilot.?s? (station|console)/i, baycontrol: /bay control|flight deck (control|console)|launch control|traffic control|control (desk|booth|tower|console|room)|ops console/i, beampedestal: /transporter (console|control)|pedestal|beam control/i,
  secdesk: /security (desk|console|station)|custody|duty desk|guard (desk|station)|booking/i, nursestation: /nurses?.? station|nursing station|charge desk/i, holodesk: /control (desk|booth|console)|operator (desk|station)|programme? console/i,
  reactorstation: /reactor (control|console|station|operator)|control console|master systems/i, range: /\brange\b|stove|\bhob\b|oven|cooker|griddle/i, servery: /servery|serving (line|counter)|hot (pass|well|cupboard)|bain/i, bar: /bar counter|\bbar\b(?! stock| &| foot)|beer tap/i,
  dishwasher: /dish ?wash|dish machine|pot ?wash|glass ?wash/i, wastebin: /\bbins?\b|waste|recycl/i, pumpskid: /\bpumps?\b/i, heatexch: /heat exchanger|exchanger|chiller|cooler\b/i, scrubber: /scrubber|co2|co₂|carbon dioxide|atmosphere processor/i,
  fieldgen: /graviton|gravity generator|field generator|generator synchroniser/i, fieldgen_damp: /damper (field|generator)|inertial damp|field generator/i, fabricator: /fabricat|printer|industrial replicator|cnc|mill\b/i, steriliser: /sterili[sz]|autoclave|instrument wash/i,
  surgical_table: /surgical|operating table|theatre table/i, med_dispenser: /dispens|pharmacy|medication|drug cabinet/i, exam_couch: /couch|exam(ination)? (table|bed)|treatment (table|bed)/i, autopsy_table: /autopsy|post.?mortem|dissection|mortuary table/i,
  infusion_stand: /infusion|iv (pole|stand)|drip stand/i,
  // art batches 5-11 (docs/propart-integration.md "Batches 5-11")
  growbed: /grow ?bed|hydroponic|nft|grow (rack|tray|bench)|growing (bed|rack)/i, nutrient_tanks: /nutrient|dosing|fertili[sz]er tank|reservoir/i, sensorstation: /sensor (station|console|operator)|science (station|console)|sonar|radar/i,
  charttable: /chart table|astrometric|plot(ting)? table|holo-?map|star ?chart/i, spectrometer: /spectromet|spectrograph|mass spec|chromatograph|analy[sz]er/i, samplefridge: /sample (fridge|refrigerator|freezer)|lab(oratory)? (fridge|refrigerator|freezer)|specimen (fridge|freezer)/i,
  fumehood: /fume (hood|cupboard)|extraction hood|glove ?box/i, fuelbowser: /bowser|fuel(l?ing)? (cart|trolley|bowser|rig|truck)|refuel/i, pallet: /^(?!.*(arch|jack|truck|mover|scanner)).*\bpallets?\b/i, pallet_loaded: /^(?!.*(arch|jack|truck|mover|scanner)).*(\bpallets?\b|palletised|palletized)/i,
  hoversled: /sled|anti-?grav|grav(ity)? (lift|cart|pallet)|pallet (jack|truck|mover)|hover/i, reachin_cooler: /reach-?in|cooler|refrigerator|fridge/i,
  navstation: /nav(igation)? (station|console|table)|chart table|plotter/i, opsstation: /ops (station|console)|operations (station|console|desk)/i, commsstation: /comms? (station|console|desk|panel)|communications (station|console)|radio (station|desk|operator)/i,
  relayrack: /relay|transceiver|comm(s)? rack|equipment rack|19.?inch rack/i, buffertank: /pattern buffer|buffer tank|buffer/i, plottable: /plot(ting)? table|master systems display|light table|situation table/i,
  cellfield: /force ?field|cell|detention|holding/i, chargerack: /charg(ing|er) (rack|station|cabinet|bay)|battery (rack|charger)|power ?cell/i, issuecounter: /issue (counter|hatch|window)|armou?ry (counter|hatch|window)|sign-?out/i,
  briefing_table: /briefing|conference table|meeting table|oval table/i, platform_bed: /\bbed\b|bunk|berth|sleeping/i, workpod: /work ?(pod|bee)|pod|eva craft|repair craft/i, maint_stand: /maintenance (stand|platform|scaffold)|work platform|scaffold|step platform/i,
  cargo_pad: /cargo (transporter|pad)|transporter pad|\bpad\b|staging/i, injector_crate: /injector|plasma (injector|coupling)|spare.*crate/i, knee_mill: /milling|mill\b|knee mill/i, drill_press: /drill press|pillar drill|bench drill|drill/i,
  scan_arch: /scan(ner)? arch|walk-?through|metal detector|security scanner|scanning gate/i, specimen_tank: /specimen tank|aquarium|terrarium|vivarium|tank/i, mat: /\bmats?\b|tatami|sparring/i, grapple_dummy: /dummy|grappling|training (bag|post)/i,
  sparring_set: /sparring|\bmats?\b|tatami|dojo/i, galley_trolley: /trolley|tray rack|cart/i, dryer: /dryer|drier|tumble/i, folding_table: /folding (table|bench)|table|sorting/i, linen_cart: /linen|laundry (cart|bin|hamper)|hamper/i,
  pool_table: /pool table|billiard|snooker/i, card_table: /card table|poker|games? table/i, arcade: /arcade|game (cabinet|console|machine)|pinball/i, feedstock_silo: /feedstock|silo|hopper|bulk (store|stock)/i,
  exercise_bike: /exercise bike|stationary bike|bicycle|cycle|spin bike|ergometer/i, rower: /row(ing)? (machine|ergometer)|rower/i, dumbbell_rack: /dumbbell|weights? rack|free weights/i, airlock_doors: /airlock|hatch|inner door|outer door/i };
const bulk = (r) => ({ huge: 4, large: 3, medium: 2, small: 1, tiny: 0 }[r[4]] ?? 1) + (['floor', 'built-in'].includes(r[3]) ? 2 : 0);
out.examine = {}; out.clutter = {};
const CYL = /cup|mug|bottle|can\b|canister|cylinder|flask|jar|tube|pen\b|pens|drum|thermos|roll|candle|vial|tin\b/i, FLAT = /pad\b|tablet|book|paper|card|tray|plate|disc|folder|manual|map|log|binder|clipboard|photo/i;
for (const [room, ids] of Object.entries(ROOM_SPACES)) {
  const allRows = ids.flatMap(id => spaces[id]?.rows || []); out.examine[room] = {};
  for (const [kind, re] of Object.entries(PROP)) {
    const m = allRows.filter(r => re.test(r[0]) && r[2] !== 'inside' && !/\(decor|sticker|label|sign\b|photo|picture/i.test(r[0]) && !/^no /i.test(r[0]) && r[0].length < 70).sort((a, b) => (kind === 'chair' ? (/command|captain/i.test(b[0]) - /command|captain/i.test(a[0])) : 0) || bulk(b) - bulk(a) || a[0].length - b[0].length);
    const seen = new Set(), pick = m.filter(r => !seen.has(r[0].toLowerCase()) && seen.add(r[0].toLowerCase()));
    if (pick.length) out.examine[room][kind] = pick.slice(0, 3).map(r => [r[0], r[7] || '']);
  }
  const small = allRows.filter(r => ['tiny', 'small'].includes(r[4]) && ['table', 'floor', 'portable', 'shelf'].includes(r[3]) && r[0].length < 60 && !/\(decor|stain|smudge|scuff|dust|print/i.test(r[0]));
  const R = rng(seed(room + 'clutter')); for (let i = small.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [small[i], small[j]] = [small[j], small[i]]; }
  out.clutter[room] = small.slice(0, 50).map(r => [r[0], r[7] || '', CYL.test(r[0]) ? 1 : FLAT.test(r[0]) ? 2 : 0]);
}
fs.writeFileSync('assets/data/ship-items.json', JSON.stringify(out));
console.log('assets/data/ship-items.json', n, 'entries', (fs.statSync('assets/data/ship-items.json').size / 1024).toFixed(0) + ' KB');
for (const [r, k] of Object.entries(out.rooms)) console.log(r.padEnd(12), Object.entries(k).map(([a, b]) => a + ':' + b.length).join(' '));
