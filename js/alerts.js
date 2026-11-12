// Ship-wide alert conditions: what each one is, what it means to the player, and the live set of active alerts.
// Pure data/logic, no three.js and no DOM: used by the HUD (js/hud-comms.js), the comm simulation (js/comms.js)
// and tools/test.mjs (which runs it straight in node).
//
//   ALERTS[id]      static definition (label, meaning, what to do, PA text, klaxon pattern, severity 0-5, ...)
//   AlertState      raise / clear / active() / on('raise'|'clear') / autoFromShip(shipState) / tick(dt)

export const ALERT_IDS = ['yellow', 'red', 'fire', 'hull_breach', 'contamination', 'power_failure', 'gravity_failure', 'intruder', 'medical_emergency', 'abandon_ship'];

// colour: HUD colour; severity: 0 (green) .. 5 (abandon ship); klaxon: pattern id for Sound.alertTone();
// scope: the usual reach ('ship' or 'deck'); crewEvent: key the crew simulation listens to.
const A = (id, label, short, colour, severity, meaning, doThis, pa, klaxon, scope) =>
  ({ id, label, short, colour, severity, meaning, doThis, pa, klaxon, scope, crewEvent: 'alert:' + id });

export const ALERTS = {
  nominal: A('nominal', 'Condition Green', 'Systems nominal', '#4fd18b', 0,
    'Nothing is wrong. The ship is at normal readiness and every department is running its routine.',
    'Carry on with your duties. Check in with the bridge if you notice anything unusual.',
    'All decks, condition green. Systems nominal.', 'none', 'ship'),
  yellow: A('yellow', 'Yellow Alert', 'Heightened readiness', '#ffd23f', 1,
    'The bridge has raised readiness because something might be wrong or is about to be. Nothing is confirmed yet, but stations are being checked.',
    'Stay near your post, keep your comm badge on, and report anything odd to the bridge.',
    'Attention all hands. Yellow alert. Heightened readiness. Check your stations.', 'chime', 'ship'),
  red: A('red', 'Red Alert', 'All hands to stations', '#ff3b30', 4,
    'The ship is in danger or about to be. The captain has ordered all crew to battle stations; non-essential activity stops.',
    'Go to your duty station, or to the nearest safe compartment if you have none. Do not block corridors or lifts; follow orders from the bridge.',
    'Red alert. Red alert. All hands to stations.', 'red', 'ship'),
  fire: A('fire', 'Fire', 'Fire aboard', '#ff7a1a', 4,
    'A fire has been detected. Suppression and damage control are responding and the affected compartment may be sealed and vented.',
    'Move away from the fire, close doors behind you, and leave the section if told to. Do not use the lifts near the fire.',
    'Fire alarm. Fire reported. Damage control teams respond. Seal the compartment.', 'fire', 'deck'),
  hull_breach: A('hull_breach', 'Hull Breach', 'Loss of pressure', '#ff4d6d', 4,
    'The hull has been breached and air is escaping. Emergency bulkheads are closing to isolate the damaged section.',
    'Get clear of the breached section before the bulkheads seal. Reach a pressurised compartment and put on a suit if one is within reach.',
    'Hull breach. Pressure loss. Emergency bulkheads are sealing. Evacuate the section.', 'breach', 'deck'),
  contamination: A('contamination', 'Contamination', 'Quarantine / bad air', '#b0d94a', 3,
    'Something harmful is in the air, the water or a compartment: a spill, a pathogen or failed life support. The area is being isolated.',
    'Stay out of the affected area. Obey quarantine doors, and report to sickbay if you feel unwell.',
    'Contamination alert. Quarantine protocol is in effect. Remain in your compartment.', 'contam', 'deck'),
  power_failure: A('power_failure', 'Power Failure', 'Main power down', '#c9a227', 3,
    'The main reactor or power grid has failed. Lights, doors, lifts and consoles are on emergency power or dark.',
    'Use emergency lighting. Engineering needs reactor and EPS repairs; stay out of their way and avoid the lifts.',
    'Warning. Main power failure. Emergency power only. Engineering to the reactor.', 'power', 'ship'),
  gravity_failure: A('gravity_failure', 'Gravity Failure', 'Artificial gravity lost', '#6f9bff', 2,
    'The graviton plating has failed or lost power, so gravity is reduced or gone. Footing, loose objects and lifts are unreliable.',
    'Hold on to something, move slowly and avoid heavy loose cargo. Engineering is working on the gravity plating.',
    'Gravity failure. Secure loose objects and hold on. Engineering to gravity plating.', 'gravity', 'ship'),
  intruder: A('intruder', 'Intruder Alert', 'Security lockdown', '#d94cff', 3,
    'An unauthorised or hostile person has been detected aboard. Security is locking down sections and sweeping decks.',
    'Stay in a secure compartment away from the reported area. If you meet an unknown person, do not engage; call security.',
    'Intruder alert. Intruder alert. Security lockdown in effect.', 'intruder', 'deck'),
  medical_emergency: A('medical_emergency', 'Medical Emergency', 'Casualties / outbreak', '#40d9c8', 2,
    'One or more crew are badly hurt or ill, or there is an outbreak. Sickbay is taking casualties and may call for help.',
    'Keep corridors toward sickbay clear. If you are trained or standing near someone hurt, help and call sickbay.',
    'Medical emergency. Medical teams to the casualty. Clear the corridors for sickbay.', 'medical', 'deck'),
  abandon_ship: A('abandon_ship', 'Abandon Ship', 'Evacuate the ship', '#ff2d95', 5,
    'The ship cannot be saved. The captain has ordered everyone off by shuttle, pod or transporter.',
    'Go to the nearest shuttlebay, escape pod or transporter room now. Take the injured with you and do not go back for belongings.',
    'Abandon ship. Abandon ship. All hands to escape pods and shuttles.', 'abandon', 'ship'),
};

export const ALERT_ORDER = ['nominal', ...ALERT_IDS];
export const SEVERITY_NAME = ['Normal', 'Advisory', 'Caution', 'Warning', 'Danger', 'Critical'];

// Which real ship faults imply an alert (only where it makes sense). status: 'offline' for the single-system ones.
export const AUTO_RULES = [
  { id: 'power_failure', sys: 'reactor', reason: 'Main reactor offline' },
  { id: 'gravity_failure', sys: 'gravity', reason: 'Gravity plating offline' },
  { id: 'contamination', sys: 'life', reason: 'Life support offline: bad air' },
];

export class AlertState {
  constructor() { this.t = 0; this.seq = 0; this.map = new Map(); this.handlers = { raise: [], clear: [], change: [] }; this.history = []; }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return () => { this.handlers[ev] = this.handlers[ev].filter(f => f !== fn); }; }
  emit(ev, a) { for (const f of this.handlers[ev] || []) f(a, this); for (const f of this.handlers.change) f(ev, a, this); }
  tick(dt) { this.t += dt; }
  // raise(id, {scope, deck, source, reason, byPerson}): returns the active alert record. Raising an alert that is already up
  // keeps the original record (so "elapsed" is not reset) but refreshes its reason/deck and does not fire a second event.
  raise(id, o = {}) {
    const def = ALERTS[id]; if (!def || id === 'nominal') return null;
    const cur = this.map.get(id);
    if (cur) { Object.assign(cur, o.reason ? { reason: o.reason } : {}, o.deck != null ? { deck: o.deck } : {}); return cur; }
    const scope = o.scope || def.scope, a = { id, def, scope, deck: scope === 'deck' ? (o.deck ?? null) : null, source: o.source || 'bridge', reason: o.reason || '', byPerson: o.byPerson || null, since: this.t, seq: ++this.seq };
    this.map.set(id, a); this.history.push({ ev: 'raise', id, t: this.t }); this.emit('raise', a); return a;
  }
  clear(id) {
    const a = this.map.get(id); if (!a) return null;
    this.map.delete(id); this.history.push({ ev: 'clear', id, t: this.t }); this.emit('clear', a); return a;
  }
  clearAll() { for (const id of [...this.map.keys()]) this.clear(id); }
  has(id) { return this.map.has(id); }
  get(id) { return this.map.get(id) || null; }
  elapsed(a) { return Math.max(0, this.t - a.since); }
  // active alerts, highest severity first (older first on ties)
  active() { return [...this.map.values()].sort((x, y) => y.def.severity - x.def.severity || x.seq - y.seq); }
  top() { return this.active()[0] || null; }
  // the condition to show: the most severe active alert, or green
  condition() { return this.top()?.def || ALERTS.nominal; }
  // real faults -> alerts. Alerts raised here (source 'auto', fromShip) are cleared again when the fault is repaired.
  // Manual (bridge / debug) alerts are never cleared by this.
  autoFromShip(ship) {
    const out = [];
    const want = new Map();
    for (const r of AUTO_RULES) if (ship.status(r.sys) === 'offline') want.set(r.id, r.reason);
    if (ship.faulted().length >= 3) want.set('yellow', `${ship.faulted().length} ship systems faulted`);
    for (const [id, reason] of want) if (!this.map.has(id)) { const a = this.raise(id, { source: 'auto', reason }); a.fromShip = true; out.push(a); }
    for (const a of this.active()) if (a.fromShip && !want.has(a.id)) this.clear(a.id);
    return out;
  }
}

export const fmtElapsed = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
