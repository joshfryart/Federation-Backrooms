// Ship's company and ship's systems for one run.
//  - DEPARTMENTS / BILLETS: who serves aboard, in which department, at what rank, reporting to whom.
//  - SYSTEMS: each department's equipment ("loadout"), where its main hardware lives, what breaks when it fails.
//  - ShipState: system health, faults, a fault director (things break down over time, faster under tension),
//    and effects() — the single place the game reads gameplay consequences from.
// Pure data/logic, no three.js: used by the game (js/main.js) and the review page (crew.html).
import { RANKS, mulberry32 } from './data.js';
import { zoneOf } from './ships.js';

// uniform colours by division (matches js/humans.js DIVISIONS)
export const DIVISION = {
  command: { name: 'Command', color: 0xc79a1e },
  operations: { name: 'Operations', color: 0xa3231c },
  sciences: { name: 'Sciences', color: 0x2456a6 },
};
export const RANK_SHORT = ['Crewman', 'Ensign', 'Lt. J.G.', 'Lt.', 'Lt. Cmdr.', 'Cmdr.', 'Capt.'];

export const DEPARTMENTS = [
  { id: 'command', name: 'Command', division: 'command', zone: 'Command', blurb: 'Commands the ship; runs the alert network.' },
  { id: 'flight', name: 'Flight Control', division: 'command', zone: 'Command', blurb: 'Helm, navigation, inertial dampers and small craft.' },
  { id: 'operations', name: 'Operations', division: 'operations', zone: 'Services', blurb: 'Computer core, internal comms and transporters.' },
  { id: 'engineering', name: 'Engineering', division: 'operations', zone: 'Engineering', blurb: 'Power, gravity, lifts and environmental systems.' },
  { id: 'security', name: 'Security', division: 'operations', zone: 'Services', blurb: 'Internal security, force fields and the armory.' },
  { id: 'sciences', name: 'Sciences', division: 'sciences', zone: 'Habitat', blurb: 'Sensors, labs, cartography and hydroponics.' },
  { id: 'medical', name: 'Medical', division: 'sciences', zone: 'Habitat', blurb: 'Sickbay, the medical hologram and counselling.' },
  { id: 'services', name: 'Support Services', division: 'operations', zone: 'Habitat', blurb: 'Galley, replicators, cargo and recreation.' },
];
export const DEPT = Object.fromEntries(DEPARTMENTS.map(d => [d.id, d]));

// billets: [department, key, title, rank index, count, reports-to billet key, count scales with hull size]
const B = (dept, key, title, rank, n, reports, scale = false) => ({ dept, key, title, rank, n, reports, scale });
export const BILLETS = [
  B('command', 'co', 'Commanding Officer', 6, 1, null),
  B('command', 'xo', 'First Officer', 5, 1, 'co'),
  B('command', 'so', 'Second Officer', 4, 1, 'xo'),
  B('command', 'yeoman', "Captain's Yeoman", 0, 1, 'co'),
  B('flight', 'cfo', 'Chief Flight Officer', 3, 1, 'xo'),
  B('flight', 'helm', 'Helm Officer', 2, 2, 'cfo'),
  B('flight', 'nav', 'Navigator', 1, 2, 'cfo', true),
  B('flight', 'pilot', 'Shuttle Pilot', 1, 2, 'cfo', true),
  B('flight', 'deck', 'Flight Deck Crew', 0, 3, 'pilot', true),
  B('operations', 'ops', 'Operations Manager', 4, 1, 'xo'),
  B('operations', 'comms', 'Communications Officer', 2, 1, 'ops'),
  B('operations', 'tchief', 'Transporter Chief', 1, 1, 'ops'),
  B('operations', 'ttech', 'Transporter Technician', 0, 2, 'tchief', true),
  B('operations', 'comp', 'Computer Specialist', 0, 3, 'comms', true),
  B('engineering', 'ce', 'Chief Engineer', 4, 1, 'xo'),
  B('engineering', 'ace', 'Assistant Chief Engineer', 3, 1, 'ce'),
  B('engineering', 'reactor', 'Reactor Specialist', 2, 2, 'ace'),
  B('engineering', 'env', 'Environmental Systems Officer', 1, 2, 'ace'),
  B('engineering', 'eps', 'EPS Technician', 0, 4, 'reactor', true),
  B('engineering', 'dc', 'Damage Control Crew', 0, 4, 'env', true),
  B('security', 'cos', 'Chief of Security', 4, 1, 'xo'),
  B('security', 'dep', 'Deputy Chief of Security', 2, 1, 'cos'),
  B('security', 'armory', 'Armory Officer', 1, 1, 'dep'),
  B('security', 'sec', 'Security Officer', 1, 3, 'dep', true),
  B('security', 'guard', 'Security Crewman', 0, 5, 'sec', true),
  B('sciences', 'cso', 'Chief Science Officer', 4, 1, 'xo'),
  B('sciences', 'sensor', 'Sensor Officer', 2, 1, 'cso'),
  B('sciences', 'carto', 'Stellar Cartographer', 1, 1, 'cso'),
  B('sciences', 'bot', 'Botanist', 1, 1, 'cso'),
  B('sciences', 'lab', 'Laboratory Technician', 0, 3, 'sensor', true),
  B('medical', 'cmo', 'Chief Medical Officer', 4, 1, 'co'),
  B('medical', 'counsel', "Ship's Counselor", 3, 1, 'co'),
  B('medical', 'doc', 'Physician', 2, 2, 'cmo'),
  B('medical', 'nurse', 'Nurse', 1, 3, 'doc', true),
  B('medical', 'medtech', 'Medical Technician', 0, 2, 'nurse', true),
  B('services', 'qm', 'Quartermaster', 3, 1, 'xo'),
  B('services', 'galley', 'Galley Chief', 1, 1, 'qm'),
  B('services', 'cook', 'Cook', 0, 2, 'galley', true),
  B('services', 'rep', 'Replicator Technician', 0, 2, 'qm', true),
  B('services', 'cargo', 'Cargo Handler', 0, 3, 'qm', true),
  B('services', 'holo', 'Holo-Recreation Technician', 0, 1, 'qm'),
];
const CREW_SCALE = { cairn: 1.4, longhouse: 1.0, tandem: 1.3, cruller: 0.8, plough: 1.1 };

// systems: what each department runs. host = where its main hardware is on a deck:
//   a prop kind ('warpcore', 'biobed', …, 'console@bridge' = a console in a bridge), 'lift' (the tubelift), or 'junction'
//   (distributed; serviced from yellow maintenance junctions on every deck). Every system can also be reached from a
//   junction on any deck that lacks its main hardware, but junction repairs take longer.
const SY = (id, dept, name, host, parts, eff, o = {}) => ({ id, dept, name, host, parts, eff, repair: 5, weight: 1, ...o });
export const SYSTEMS = [
  SY('alert', 'command', 'Alert & Command Network', 'console@bridge', ['Command chair interface', 'Alert relays ×6', 'Bridge command console'], { deg: 'Alert lighting lags', off: 'No klaxon or red alert when you are hunted' }, { home: 'Command' }),
  SY('helm', 'flight', 'Helm & Navigation', 'console@bridge', ['Helm console', 'Navigational deflector control', 'Attitude thrusters ×12'], { deg: 'Ship yaws — the deck lurches now and then', off: 'Uncontrolled drift — the deck lurches often' }, { home: 'Command', weight: 1.4 }),
  SY('dampers', 'flight', 'Inertial Dampers', 'junction', ['Damper field generators ×2', 'Field coils ×8'], { deg: 'Hits and lurches knock you further', off: 'Hits and lurches throw you and hurt' }, { home: 'Engineering', weight: 1.3 }),
  SY('computer', 'operations', 'Computer Core', 'console', ['Isolinear core stacks ×3', 'Optical data network', 'Operations console'], { deg: 'Scan-o-matic loses item markers', off: 'Scan-o-matic offline' }, { home: 'Services', weight: 1.3 }),
  SY('comms', 'operations', 'Internal Comms', 'junction', ['Comm relays ×10', 'Subspace transceiver'], { deg: 'Announcements and fault warnings garbled', off: 'No announcements or fault warnings' }, { home: 'Services', weight: 1.6 }),
  SY('transport', 'operations', 'Transporters', 'pad', ['Transporter pads ×6', 'Pattern buffers ×2', 'Emitter array'], { deg: 'Survivors cannot be beamed to safety', off: 'Survivors cannot be beamed to safety' }, { home: 'Services' }),
  SY('reactor', 'engineering', 'Main Reactor', 'warpcore', ['Reaction chamber', 'Plasma injectors ×4', 'Magnetic constrictors ×12', 'Reactor control console'], { deg: 'Lights run dim', off: 'Brownout — emergency lighting only' }, { home: 'Engineering', repair: 8, weight: 1.2 }),
  SY('eps', 'engineering', 'EPS Power Grid', 'junction', ['EPS conduits', 'Power taps ×24', 'Junction breakers'], { deg: 'Rolling blackouts', off: 'Frequent blackouts' }, { home: 'Engineering', weight: 2.6 }),
  SY('gravity', 'engineering', 'Gravity Plating', 'junction', ['Graviton generators ×4', 'Deck plating grid'], { deg: 'Gravity at 60% — you jump higher, land harder', off: 'Gravity at 30%' }, { home: 'Engineering', weight: 1.6 }),
  SY('lifts', 'engineering', 'Tubelift Network', 'lift', ['Lift cars ×4', 'Lift shafts', 'Lift controller'], { deg: 'Lift controller unstable', off: 'Tubelift locked out until repaired' }, { home: 'Engineering', weight: 0.8 }),
  SY('life', 'engineering', 'Life Support', 'junction', ['Atmosphere processors ×2', 'CO₂ scrubbers ×6', 'Circulation fans'], { deg: 'Thin air — stamina recovers slowly', off: 'CO₂ build-up — you slowly suffocate' }, { home: 'Services', section: 'Environmental', weight: 1.6, repair: 6 }),
  SY('coolant', 'engineering', 'Coolant & Plumbing', 'junction', ['Coolant pumps ×4', 'Heat exchangers ×2', 'Water reclamation'], { deg: 'Steam leaks — noisy', off: 'Scalding steam vents' }, { home: 'Engineering', section: 'Environmental', weight: 2.2 }),
  SY('lighting', 'engineering', 'Lighting Grid', 'junction', ['Light panels', 'Lighting controllers ×8'], { deg: 'Panels flicker', off: 'Most panels dead' }, { home: 'Services', section: 'Environmental', weight: 2.4, repair: 4 }),
  SY('security', 'security', 'Internal Security', 'junction', ['Internal sensors', 'Force-field emitters ×20', 'Security console'], { deg: 'Lifeform scanner blind', off: 'Lifeform scanner blind' }, { home: 'Services' }),
  SY('armory', 'security', 'Armory Chargers', 'junction', ['Charging racks ×2', 'Zapper locker'], { deg: 'Power cells half charged (+1)', off: 'Power cells half charged (+1)' }, { home: 'Services' }),
  SY('sensors', 'sciences', 'Sensor Arrays', 'console', ['Long-range sensor pallet', 'Lateral arrays ×2', 'Science console'], { deg: 'Tubelift not shown on the scan-o-matic', off: 'Scan range halved, lift hidden' }, { home: 'Habitat', weight: 1.2 }),
  SY('hydro', 'sciences', 'Hydroponics', 'tree', ['Grow beds ×12', 'Nutrient pumps', 'O₂ reclamation'], { deg: 'O₂ reserve low — life-support faults hit harder', off: 'O₂ reserve gone — life-support faults hit harder' }, { home: 'Habitat', weight: 0.8 }),
  SY('sickbay', 'medical', 'Sickbay', 'biobed', ['Biobeds ×6', 'Surgical bay', 'Pharmacy replicator'], { deg: 'Medkits heal less (+22)', off: 'Medkits heal little (+12)' }, { home: 'Habitat' }),
  SY('emh', 'medical', 'Medical Hologram', 'biobed', ['Holo-emitters ×4', 'Medical program matrix'], { deg: 'Medical hologram unreliable', off: 'Medical hologram unavailable' }, { home: 'Habitat', weight: 0.8 }),
  SY('replicators', 'services', 'Replicators', 'replicator', ['Food replicators ×8', 'Industrial replicator', 'Matter stores'], { deg: 'Fewer supplies on new decks', off: 'Far fewer supplies on new decks' }, { home: 'Habitat' }),
  SY('holo', 'services', 'Holo-Playroom Safeties', 'holocube', ['Safety interlocks', 'Holo-grid emitters', 'Program archive'], { deg: 'Mr. Grinsworth moves faster', off: 'Mr. Grinsworth moves much faster' }, { home: 'Habitat' }),
];
export const SYS = Object.fromEntries(SYSTEMS.map(s => [s.id, s]));
export const HOST_LABEL = { 'console@bridge': 'bridge consoles', console: 'consoles', warpcore: 'reactor core', biobed: 'biobeds', pad: 'transporter pad', tree: 'grow beds', replicator: 'replicators', holocube: 'holo-grid', lift: 'tubelift controls', junction: 'maintenance junctions' };

// ---------------------------------------------------------------- crew roster
const GIVEN = ['Alex', 'Sam', 'Jordan', 'Morgan', 'Taylor', 'Casey', 'Riley', 'Jamie', 'Avery', 'Quinn', 'Rowan', 'Elliot', 'Noor', 'Amara', 'Kenji', 'Mei', 'Priya', 'Arjun', 'Sofia', 'Mateo', 'Chloé', 'Étienne', 'Malik', 'Ifeoma', 'Kwame', 'Leila', 'Omar', 'Hana', 'Yuki', 'Ines', 'Tomás', 'Aroha', 'Sila', 'Nuka', 'Desmond', 'Wren', 'Felix', 'Isla', 'Ravi', 'Dana', 'Gabriel', 'Marguerite', 'Olu', 'Freya', 'Henrik', 'Lucia', 'Bao', 'Saoirse', 'Tariq', 'Zainab'];
const FAMILY = ['Tremblay', 'Gagnon', 'Roy', 'Côté', 'Bouchard', 'Gauthier', 'Morin', 'Lavoie', 'Pelletier', 'Leblanc', 'MacDonald', 'Campbell', 'Fraser', 'MacLeod', 'Stewart', 'Singh', 'Kaur', 'Nguyen', 'Chen', 'Wong', 'Li', 'Kim', 'Park', 'Sato', 'Okafor', 'Mensah', 'Haddad', 'Ahmed', 'Hussain', 'Ferreira', 'Santos', 'Novak', 'Kowalski', 'Ivanova', 'Petrov', 'Bérubé', 'Thibodeau', 'Cardinal', 'Paquette', 'Arsenault', 'Doucet', 'Boudreau', 'Kaplan', 'Rosen', 'Osei', 'Adeyemi', 'Lindqvist', 'Bianchi', 'Moreau', 'Delacroix', 'Ikeda', 'Tanaka', 'Ramirez', 'Castillo', 'Lalonde', 'Ouellet', 'Bergeron', 'Desjardins', 'Leclerc', 'Poirier', 'Robichaud', 'LeBlanc-Hart', 'McKenna', 'Sinclair', 'Grant', 'Murray', 'Ross', 'Graham', 'Abara', 'Nakamura', 'Yamada', 'Hoang', 'Tran', 'Pham', 'Zhou', 'Huang', 'Liu', 'Choi', 'Jung', 'Gill', 'Dhillon', 'Sandhu', 'Grewal', 'Mahmoud', 'Karimi', 'Rahimi', 'Okonkwo', 'Asante', 'Boateng', 'Nwosu', 'Dubois', 'Fontaine', 'Girard', 'Mercier', 'Rousseau', 'Vasquez', 'Ortiz', 'Silva', 'Costa', 'Sousa', 'Horvat', 'Kovač', 'Nieminen', 'Halvorsen', 'Brandt', 'Weiss', 'Keller', 'Ahenakew', 'Whitecalf', 'Bellegarde'];
const BODIES = ['crew_m', 'crew_f', 'crew_f2', 'crew_heavy'];

export function makeComplement(ship, seed = 1) {
  const rnd = mulberry32((seed * 2654435761) >>> 0 ^ ship.reg.length * 977), k = CREW_SCALE[ship.hull] || 1;
  const people = [], byBillet = {}, used = new Set();
  const fam = FAMILY.slice(); for (let i = fam.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [fam[i], fam[j]] = [fam[j], fam[i]]; }   // unique surnames while they last
  const name = () => { const f = fam.length ? fam.pop() : FAMILY[Math.floor(rnd() * FAMILY.length)]; let g; do g = GIVEN[Math.floor(rnd() * GIVEN.length)]; while (used.has(f + g)); used.add(f + g); return { given: g, family: f }; };
  for (const b of BILLETS) {
    const n = b.scale ? Math.max(1, Math.round(b.n * k)) : b.n; byBillet[b.key] = [];
    for (let i = 0; i < n; i++) {
      const parents = b.reports ? byBillet[b.reports] : null;
      const p = { id: people.length, ...name(), rank: b.rank, title: b.title, billet: b.key, dept: b.dept, reportsTo: parents?.length ? parents[i % parents.length].id : null, body: BODIES[Math.floor(rnd() * BODIES.length)], status: 'unknown' };
      p.rankTitle = RANKS[p.rank][0]; p.short = `${RANK_SHORT[p.rank]} ${p.family}`; p.full = `${p.rankTitle} ${p.given} ${p.family}`;
      people.push(p); byBillet[b.key].push(p);
    }
  }
  const heads = DEPARTMENTS.map(d => people.find(p => p.dept === d.id));   // first billet of each department is its head
  return { people, byBillet, heads, ship, seed, uniformOf: (p) => DIVISION[DEPT[p.dept].division].color };
}
// survivors/corpses on a deck come from that deck's zone first
export function pickCrewFor(roster, zoneLabel, rnd = Math.random) {
  const pool = roster.people.filter(p => p.status === 'unknown' && p.billet !== 'co');
  const local = pool.filter(p => DEPT[p.dept].zone === zoneLabel);
  const from = local.length && rnd() < 0.75 ? local : pool; return from.length ? from[Math.floor(rnd() * from.length)] : null;
}
export const DEPT_LINES = {
  command: ['"The captain went aft to find the chief. Neither came back."', '"Red alert should sound when something hunts you. If it doesn\'t, the command network is down."'],
  flight: ['"If the deck lurches, it\'s the helm. Nobody\'s flying this ship."', '"No dampers means every hit throws you across the corridor. Brace."'],
  operations: ['"Comms relays are cooked. If the computer stops talking, check the junctions."', '"Get the transporters up and I can beam the wounded out."'],
  engineering: ['"The yellow-striped panels are maintenance junctions. Hold the spanner on them — I mean E."', '"If the lights die, it\'s the EPS grid. Fix the junction, they come back."', '"Life support goes, you\'ve got minutes. Find the junction."'],
  security: ['"The armory chargers are down — cells only half charge."', '"Internal sensors used to track intruders. Used to."'],
  sciences: ['"Sensors can find the tubelift for you — if the arrays are working."', '"Hydroponics keeps the O₂ reserve. Lose it and the air goes fast."'],
  medical: ['"Sickbay\'s pharmacy feeds the medkits. Broken sickbay, weak medkits."', '"Breathe slowly. In. Out. Now run."'],
  services: ['"Replicators are what stock the supply lockers. No replicators, no supplies."', '"Whatever you do, don\'t let the holo-playroom safeties fail. He gets… quick."'],
};

// ---------------------------------------------------------------- ship state + fault director
const LEVEL = { nominal: 0, degraded: 1, offline: 2 };
export class ShipState {
  constructor(ship, seed = 1) {
    this.ship = ship; this.rnd = mulberry32((seed * 40503) >>> 0); this.sys = {}; this.log = []; this.nextFault = 45; this.listeners = [];
    for (const s of SYSTEMS) this.sys[s.id] = { hp: 1, faults: [] };
    // the ship is already in trouble when you wake up
    const pre = ['lighting', 'comms', 'coolant', 'eps', 'replicators', 'security', 'armory', 'holo'];
    for (let i = 0, n = 2 + Math.floor(this.rnd() * 2); i < n; i++) this.damage(pre[Math.floor(this.rnd() * pre.length)], 0.3 + this.rnd() * 0.15, { quiet: true });
  }
  on(fn) { this.listeners.push(fn); }
  emit(ev) { this.log.push(ev); if (this.log.length > 40) this.log.shift(); for (const f of this.listeners) f(ev); }
  hp(id) { return this.sys[id].hp; }
  status(id) { const h = this.sys[id].hp; return h >= 0.75 ? 'nominal' : h >= 0.4 ? 'degraded' : 'offline'; }
  level(id) { return LEVEL[this.status(id)]; }
  faulted() { return SYSTEMS.filter(s => this.sys[s.id].hp < 0.75); }
  damage(id, amount, { part = null, quiet = false } = {}) {
    const s = this.sys[id], def = SYS[id], before = this.status(id);
    s.hp = Math.max(0, s.hp - amount); part = part || def.parts[Math.floor(this.rnd() * def.parts.length)].replace(/ ×\d+$/, '');
    s.faults.push({ part, at: Date.now() });
    const ev = { type: 'fault', id, name: def.name, part, status: this.status(id), was: before, quiet };
    this.emit(ev); return ev;
  }
  repair(id) { const s = this.sys[id], was = this.status(id); s.hp = 1; s.faults = []; const ev = { type: 'repair', id, name: SYS[id].name, was }; this.emit(ev); return ev; }
  // call every frame; returns a fault event when something breaks. ctx: { deckTime, tension (0..1), deck }
  tick(dt, ctx) {
    if (ctx.deckTime < 30) return null;
    this.nextFault -= dt * (1 + ctx.tension * 1.5) * (1 + Math.min(ctx.deck, 10) * 0.08);
    if (this.nextFault > 0) return null;
    this.nextFault = 45 + this.rnd() * 55;
    if (this.faulted().length >= 4) return null;
    const pool = SYSTEMS.filter(s => this.sys[s.id].hp > 0.2 && (s.id !== 'lifts' || ctx.deckTime > 90));
    let tot = pool.reduce((a, s) => a + s.weight, 0), r = this.rnd() * tot, pickS = pool[0];
    for (const s of pool) { r -= s.weight; if (r <= 0) { pickS = s; break; } }
    return this.damage(pickS.id, 0.3 + this.rnd() * 0.45);
  }
  // everything the game needs to know, in gameplay terms
  effects() {
    const L = (id) => this.level(id), life = Math.min(2, L('life') + (L('hydro') && L('life') ? 1 : 0));
    return {
      power: [1, 0.55, 0.22][L('reactor')],
      blackoutEvery: [0, 55, 25][L('eps')],
      lightFlicker: L('lighting'),
      gravity: [1, 0.6, 0.3][L('gravity')],
      liftLocked: L('lifts') === 2,
      staminaRegen: [1, 0.55, 0.3][life], suffocate: life === 2 ? 0.35 : 0,
      steam: L('coolant'),
      lurchEvery: [0, 45, 18][L('helm')], lurchMul: [1, 1.6, 2.4][L('dampers')], knockMul: [1, 1.5, 2.1][L('dampers')], lurchHurts: L('dampers') === 2,
      mapItems: L('computer') === 0, mapOff: L('computer') === 2,
      comms: L('comms'),
      evac: L('transport') === 0,
      lifeScan: L('security') === 0,
      cellYield: L('armory') ? 1 : 2,
      liftOnMap: L('sensors') === 0, scanMul: L('sensors') === 2 ? 0.5 : 1,
      medkit: [35, 22, 12][L('sickbay')], emh: L('emh') < 2,
      supplies: -L('replicators'),
      holoMul: [1, 1.3, 1.65][L('holo')],
      alert: L('alert') < 2,
    };
  }
}
// home deck (index on the ship) for a zone label
export function homeDeck(ship, zone) {
  for (let i = 0; i < ship.decks; i++) if (zoneOf(ship.decks > 1 ? i / (ship.decks - 1) : 0).label === zone) return i;
  return ship.decks - 1;
}

// ---------------------------------------------------------------- HTML renderers (in-game status overlay and crew.html)
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STATUS_COL = { nominal: '#5fd38d', degraded: '#ffb347', offline: '#ff5a4a' };
export function statusPill(st) { return `<span class="pill" style="background:${STATUS_COL[st]}">${st.toUpperCase()}</span>`; }
const personChip = (p, roster) => `<div class="pc ${p.status}" style="--u:${hex(roster.uniformOf(p))}"><i>${'●'.repeat(RANKS[p.rank][1])}${'○'.repeat(RANKS[p.rank][2])}</i><b>${esc(p.short)}</b><small>${esc(p.title)}</small></div>`;

// org chart: CO → XO → department heads → staff (grouped by reporting line)
export function renderOrgChart(roster) {
  const P = roster.people, kids = (id) => P.filter(p => p.reportsTo === id);
  const co = P.find(p => p.billet === 'co'), xo = P.find(p => p.billet === 'xo');
  const tree = (p) => { const k = kids(p.id).filter(c => c.dept === p.dept); return `<li>${personChip(p, roster)}${k.length ? `<ul>${k.map(tree).join('')}</ul>` : ''}</li>`; };
  const deptCols = DEPARTMENTS.filter(d => d.id !== 'command').map(d => {
    const head = P.find(p => p.dept === d.id && (p.reportsTo === xo.id || p.reportsTo === co.id) && ['cfo', 'ops', 'ce', 'cos', 'cso', 'cmo', 'qm'].includes(p.billet));
    const extra = P.filter(p => p.dept === d.id && p.reportsTo === co.id && p !== head);
    return `<div class="dcol"><h4 style="--u:${hex(DIVISION[d.division].color)}">${esc(d.name)}</h4><ul class="tree">${tree(head)}${extra.map(e => tree(e)).join('')}</ul></div>`;
  }).join('');
  const cmd = P.filter(p => p.dept === 'command' && !['co', 'xo'].includes(p.billet));
  return `<div class="org"><div class="top">${personChip(co, roster)}<div class="ln"></div>${personChip(xo, roster)}<div class="side">${cmd.map(p => personChip(p, roster)).join('')}</div></div><div class="depts">${deptCols}</div></div>`;
}
// department loadout cards: systems, parts, where the hardware is, who runs it, what happens when it fails
export function renderLoadout(state, roster, { here = null, buttons = false } = {}) {
  const ship = state.ship;
  return DEPARTMENTS.map(d => {
    const staff = roster.people.filter(p => p.dept === d.id), head = staff.find(p => ['co', 'cfo', 'ops', 'ce', 'cos', 'cso', 'cmo', 'qm'].includes(p.billet));
    const counts = {}; for (const p of staff) counts[p.title] = (counts[p.title] || 0) + 1;
    const sys = SYSTEMS.filter(s => s.dept === d.id).map(s => {
      const st = state.status(s.id), f = state.sys[s.id].faults, hd = homeDeck(ship, s.home), loc = here?.[s.id];
      return `<tr class="${st}"><td><b>${esc(s.name)}</b>${s.section ? `<small> · ${s.section}</small>` : ''}<div class="parts">${s.parts.map(esc).join(' · ')}</div></td>
        <td>${statusPill(st)}<div class="sbar"><i style="width:${Math.round(state.hp(s.id) * 100)}%;background:${STATUS_COL[st]}"></i></div>${f.length ? `<div class="flt">⚠ ${esc(f[f.length - 1].part)}</div>` : ''}</td>
        <td>Deck ${String(hd + 1).padStart(2, '0')} · ${esc(s.home)}<br><small>${esc(HOST_LABEL[s.host])}${s.host !== 'junction' ? ' · or any junction' : ''}</small>${loc ? `<div class="here">${esc(loc)}</div>` : ''}</td>
        <td><small><b>Degraded:</b> ${esc(s.eff.deg)}<br><b>Offline:</b> ${esc(s.eff.off)}</small>${buttons ? `<div class="btns"><button data-break="${s.id}">Break</button><button data-fix="${s.id}">Repair</button></div>` : ''}</td></tr>`;
    }).join('');
    return `<section class="dept" style="--u:${hex(DIVISION[DEPT[d.id].division].color)}"><header><h3>${esc(d.name)}</h3><span>${esc(DIVISION[d.division].name)} division · ${staff.length} crew · head: ${head ? esc(head.full) : '—'}</span><p>${esc(d.blurb)}</p></header>
      <div class="billets">${Object.entries(counts).map(([t, n]) => `<span>${n}× ${esc(t)}</span>`).join('')}</div>
      <table><thead><tr><th>System &amp; loadout</th><th>Status</th><th>Main hardware</th><th>If it fails</th></tr></thead><tbody>${sys}</tbody></table></section>`;
  }).join('');
}
export const STATUS_CSS = `
.pill{display:inline-block;padding:1px 7px;border-radius:9px;font-size:10px;letter-spacing:.08em;color:#111;font-weight:bold}
.sbar{height:4px;background:rgba(255,255,255,.12);border-radius:2px;margin-top:4px;width:90px}.sbar i{display:block;height:100%;border-radius:2px}
.flt{color:#ffb347;font-size:11px;margin-top:3px}.here{color:#8fd8ff;font-size:11px;margin-top:3px}
.dept{background:rgba(13,18,32,.92);border:1px solid #232b40;border-left:4px solid var(--u);border-radius:8px;padding:10px 12px;margin-bottom:10px}
.dept header h3{margin:0;font-size:15px;letter-spacing:.12em;text-transform:uppercase;color:var(--u);filter:brightness(1.4)}.dept header span{font-size:11px;opacity:.65}.dept header p{margin:4px 0;font-size:12px;opacity:.75}
.billets{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0}.billets span{font-size:10px;background:rgba(255,255,255,.07);padding:2px 6px;border-radius:4px}
.dept table{width:100%;border-collapse:collapse;font-size:12px}.dept th{text-align:left;font-size:10px;opacity:.5;font-weight:normal;letter-spacing:.1em;text-transform:uppercase;padding:3px}
.dept td{padding:5px 4px;border-top:1px solid rgba(255,255,255,.07);vertical-align:top}.dept .parts{font-size:10px;opacity:.55;margin-top:2px}
.dept tr.degraded td:first-child b{color:#ffb347}.dept tr.offline td:first-child b{color:#ff5a4a}
.btns button{margin:4px 4px 0 0;font-size:10px;background:#1c2438;color:#fff;border:1px solid #3a4560;border-radius:4px;padding:2px 6px;cursor:pointer}
.org .top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}.org .ln{width:24px;height:2px;background:#556}.org .side{display:flex;gap:6px;margin-left:16px;opacity:.85}
.org .depts{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}
.dcol h4{margin:0 0 4px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;border-bottom:2px solid var(--u);padding-bottom:3px}
.tree,.tree ul{list-style:none;margin:0;padding-left:12px}.tree{padding-left:0}.tree li{position:relative;margin:2px 0}.tree ul li::before{content:'';position:absolute;left:-8px;top:0;bottom:50%;border-left:1px solid #445;border-bottom:1px solid #445;width:6px}
.pc{display:inline-flex;align-items:baseline;gap:5px;background:rgba(255,255,255,.05);border-left:3px solid var(--u);padding:2px 6px;border-radius:3px;font-size:11px;white-space:nowrap}
.pc i{color:#e2b23a;font-style:normal;font-size:9px;letter-spacing:-1px;min-width:8px}.pc small{opacity:.55;font-size:9px}
.pc.dead{opacity:.45;text-decoration:line-through}.pc.alive b{color:#5fd38d}.pc.evacuated b{color:#8fd8ff}`;
