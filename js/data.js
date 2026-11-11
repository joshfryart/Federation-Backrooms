// Static game data: ships, room types, perks, NPC lines.

export { SHIPS } from './ships.js';   // ten province-named ships in five hull classes

// Room types. weight = spawn weight, size = [minTiles, maxTiles]
export const ROOMS = {
  bridge:      { label: 'Bridge',            floor: 0x3a3f55, weight: 1, size: [5, 5] },
  engineering: { label: 'Engineering',       floor: 0x555a4a, weight: 2, size: [5, 5], big: [7, 7], bigP: 0.35 },
  sickbay:     { label: 'Sickbay',           floor: 0x9fc5c0, weight: 2, size: [3, 5] },
  mess:        { label: 'Galley',            floor: 0x7a6650, weight: 2, size: [3, 5], big: [7, 9], bigP: 0.7 },
  transporter: { label: 'Beam Room',  floor: 0x444a55, weight: 2, size: [3, 3] },
  shuttlebay:  { label: 'Shuttlebay',        floor: 0x4a4d52, weight: 2, size: [5, 5], big: [7, 9], bigP: 0.4 },
  cargo:       { label: 'Cargo Bay',         floor: 0x5a5448, weight: 3, size: [3, 5], big: [7, 9], bigP: 0.3 },
  holodeck:    { label: 'Holo-Playroom',          floor: 0x111111, weight: 2, size: [5, 5] },
  quarters:    { label: 'Crew Quarters',     floor: 0x6a5a58, weight: 3, size: [3, 3] },
  arboretum:   { label: 'Arboretum',         floor: 0x3d5a35, weight: 1, size: [5, 5], big: [7, 9], bigP: 0.5 },
  jefferies:   { label: 'Jiffy Tube',          floor: 0x3a3d42, weight: 0, size: [1, 1] },   // crawl ducts; carved by generate(), never rolled as a room
};

// Fleet ranks: [title, solid pips, hollow pips] — worn on the right side of the collar
export const RANKS = [['Crewman', 0, 0], ['Ensign', 1, 0], ['Lieutenant J.G.', 1, 1], ['Lieutenant', 2, 0], ['Lt. Commander', 2, 1], ['Commander', 3, 0], ['Captain', 4, 0]];

export const PERKS = [
  { id: 'boots',    name: 'Soft-Soled Boots',     desc: 'Your footsteps are much quieter.', max: 2 },
  { id: 'hypo',     name: 'Hypospray Upgrade',    desc: '+25 max health and heal 25 now.', max: 3 },
  { id: 'cell',     name: 'Extended Power Cell',  desc: '+1 max zapper charge.', max: 3 },
  { id: 'overload', name: 'Zapper Overcharge',    desc: 'Stun lasts +3 seconds.', max: 3 },
  { id: 'legs',     name: 'Cardio Regimen',       desc: 'Stamina lasts longer and regenerates faster.', max: 3 },
  { id: 'tricorder',name: 'Scan-O-Matic Mk II',   desc: 'Scan-O-Matic reveals nearby chips and the lift from further away.', max: 3 },
  { id: 'dampener', name: 'Inertial Dampener',    desc: 'Hostile lunges knock you back less and you recover 1s faster.', max: 1 },
  { id: 'shield',   name: 'Personal Deflector',   desc: 'Absorb the next hit each deck.', max: 1 },
  { id: 'scan',     name: 'Lifeform Scanner',     desc: 'The scan-o-matic shows hostiles when within 18m.', max: 1 },
  { id: 'luck',     name: 'Supply Requisition',   desc: 'More batteries and medkits on each deck.', max: 2 },
];

export const REDSHIRT_LINES = [
  'Ensign: "It came through the cargo bay. It was... green. Please, keep moving."',
  'Crewman: "It hunts by sound! Walk quietly, hold C to creep."',
  'Ensign: "I\'ve been walking these corridors for hours. They all look the same."',
  'Crewman: "Logic chips power the tubelift. Find them all."',
  'Lt. Torque: "A zapper will only stun it. Aim carefully and RUN."',
  'Ensign: "Don\'t sprint unless you must. It can hear you across the deck."',
  'Crewman: "The scan-o-matic shows where things are. It\'s the map, top right."',
  'Ensign: "Is this the same corridor? Didn\'t we pass that sealed door already?"',
  'Yeoman: "Captain says it\'s a Gronk. Captain isn\'t answering comms."',
  'Crewman: "Furbles. In the vents. Of course there are furbles."',
  'Ensign: "Don\'t trust the cheerful hologram. Don\'t look away from the cheerful hologram."',
  'Crewman: "Check the ceiling. No. Don\'t. Actually, do."',
  'Ensign: "If a crewman asks you for a hug, say no."',
];

export const DEATH_LINES = [
  'The Gronk found you in the quiet.',
  'Your last log entry will be a scream.',
  'Fleet Command will list you as "missing, presumed lunch".',
  'Another redshirt for the memorial wall.',
  'Strange new corridors. Strange new teeth.',
  'You were assimilated. Gently. With paperwork.',
  'Compliance was not optional.',
];

export function pick(arr, rnd = Math.random) { return arr[Math.floor(rnd() * arr.length)]; }

// Seedable PRNG
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
