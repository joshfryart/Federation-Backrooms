// Static game data: ships, room types, perks, NPC lines.

export const SHIPS = [
  { name: 'USF Ambition', reg: 'USF-1702', cls: 'Constipation', wall: 0xb9b2a0, floor: 0x5b6470, light: 0xfff1d6, accent: 0xd9733a, fog: 0x1a1612, fogD: 0.055 },
  { name: 'USF Ambition-D', reg: 'USF-1702-D', cls: 'Gallimaufry', wall: 0xcbbfa6, floor: 0x6b5a4a, light: 0xffe9c4, accent: 0x6a7fd0, fog: 0x17130f, fogD: 0.05 },
  { name: 'USF Defiance', reg: 'USF-74205', cls: 'Stubborn', wall: 0x5d6168, floor: 0x2d2f33, light: 0xd8e6ff, accent: 0xc44a3a, fog: 0x0c0e12, fogD: 0.07 },
  { name: 'USF Wayfarer', reg: 'USF-74656', cls: 'Impudent', wall: 0x9aa4b0, floor: 0x3b4658, light: 0xe6f0ff, accent: 0x4d9fd6, fog: 0x0f1319, fogD: 0.055 },
  { name: 'USF Exceeding', reg: 'USF-2000', cls: 'Exceeds', wall: 0xb4ad9a, floor: 0x4b4f5a, light: 0xfff0d2, accent: 0xc8a13c, fog: 0x15120d, fogD: 0.05 },
  { name: 'USF Dependable', reg: 'USF-1864', cls: 'Veranda', wall: 0xa8a597, floor: 0x5a4f4f, light: 0xffe7c2, accent: 0xb34a3a, fog: 0x15110e, fogD: 0.06 },
  { name: 'USF Ambition-E', reg: 'USF-1702-E', cls: 'Regent', wall: 0x8c8f97, floor: 0x2c3040, light: 0xdbe7ff, accent: 0x8f6fd6, fog: 0x0b0d14, fogD: 0.06 },
  { name: 'USF Sacramento', reg: 'USF-75567', cls: 'Nevada', wall: 0xd7d2c4, floor: 0x7a8794, light: 0xf4f8ff, accent: 0xe08a2f, fog: 0x14161a, fogD: 0.045 },
  { name: 'USF Rediscovery', reg: 'USF-1031', cls: 'Crossfade', wall: 0x6d7681, floor: 0x20262e, light: 0xcfe2ff, accent: 0x38c8c0, fog: 0x080b10, fogD: 0.065 },
  { name: 'USF Promethium', reg: 'USF-59650', cls: 'Proton', wall: 0x808488, floor: 0x1f2125, light: 0xe0e6f0, accent: 0xd64a4a, fog: 0x0a0b0d, fogD: 0.07 },
  { name: 'USF Pasteurized', reg: 'USF-58925', cls: 'Novelty', wall: 0xc2c9cf, floor: 0x587a8c, light: 0xeef8ff, accent: 0x3fae7a, fog: 0x101618, fogD: 0.05 },
  { name: 'USF Gristle', reg: 'USF-638', cls: 'Overth', wall: 0xb1b6b0, floor: 0x4b5a4d, light: 0xf6f3dc, accent: 0x3a8ad0, fog: 0x12150f, fogD: 0.055 },
  { name: 'USF Protocol', reg: 'USF-76884', cls: 'Prototype', wall: 0xdad2c0, floor: 0x7a5aa0, light: 0xfff6e0, accent: 0xf0a030, fog: 0x161216, fogD: 0.048 },
  { name: 'USF Sarasota', reg: 'USF-31911', cls: 'Akimbo', wall: 0x9d9a94, floor: 0x3a3f4a, light: 0xffeed8, accent: 0xc83e3e, fog: 0x100f0f, fogD: 0.06 },
];

// Room types. weight = spawn weight, size = [minTiles, maxTiles]
export const ROOMS = {
  bridge:      { label: 'Bridge',            floor: 0x3a3f55, weight: 1, size: [5, 5] },
  engineering: { label: 'Engineering',       floor: 0x555a4a, weight: 2, size: [5, 5] },
  sickbay:     { label: 'Sickbay',           floor: 0x9fc5c0, weight: 2, size: [3, 5] },
  mess:        { label: 'Mess Hall',         floor: 0x7a6650, weight: 2, size: [3, 5] },
  transporter: { label: 'Beam Room',  floor: 0x444a55, weight: 2, size: [3, 3] },
  shuttlebay:  { label: 'Shuttlebay',        floor: 0x4a4d52, weight: 2, size: [5, 5] },
  cargo:       { label: 'Cargo Bay',         floor: 0x5a5448, weight: 3, size: [3, 5] },
  holodeck:    { label: 'Holo-Playroom',          floor: 0x111111, weight: 2, size: [5, 5] },
  quarters:    { label: 'Crew Quarters',     floor: 0x6a5a58, weight: 3, size: [3, 3] },
  arboretum:   { label: 'Arboretum',         floor: 0x3d5a35, weight: 1, size: [5, 5] },
  jefferies:   { label: 'Maintenance Duct',    floor: 0x333333, weight: 0, size: [1, 1] },
};

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
