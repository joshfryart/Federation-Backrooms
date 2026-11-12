// Phase machine and failure modes (Systems Nominal). Pure logic: no three.js, no DOM.
// A run starts NOMINAL and slides through ANOMALIES -> DEGRADED -> CRISIS -> COLLAPSE. Time pushes it along, and so does the duty debt
// the player (and everyone else) lets pile up. One hidden failure mode grows underneath; the "director" is this class raising alerts.
//   new Phases({ shipState, alerts, roster, duty, seed, say })     say(text, kind) posts to the ship log / comms
//   .tick(dt)  .onRepair(sysId)  .hazard(deckNo, zoneInfo)  .status()   emits via .on(fn): phase | mode | pulse | alert | sabotage | end
import { hash, hash01 } from './clock.js';

export const PHASES = ['nominal', 'anomalies', 'degraded', 'crisis', 'collapse'];
export const PHASE_AT = [0, 150, 330, 540, 780];     // run seconds when time alone pushes the next phase (20 min = 1200 s)
export const RUN_LENGTH = 1200;
export const PHASE_TEXT = {
  anomalies: 'Minor anomalies are showing up in the logs.', degraded: 'Several systems are running degraded.',
  crisis: 'The ship is in crisis. Systems are failing faster than they are fixed.', collapse: 'The ship is coming apart. Survive.',
};
// failure modes: the systems they eat, the alert they raise in a crisis, how fast they grow, and what the crew sees first
export const FAILURE_MODES = {
  reactor_drift: { label: 'Reactor drift', systems: ['reactor', 'coolant', 'eps'], alert: 'power_failure', rate: 0.07, watch: 'reactor', first: 'Engineering: core temperature is drifting out of tolerance.', lethal: { rate: 5, cause: 'radiation burns in Engineering', zone: 'engineering' } },
  contamination: { label: 'Contamination', systems: ['life', 'hydro', 'sickbay'], alert: 'contamination', rate: 0.06, watch: 'life', first: 'Life support: scrubbers are reporting a contaminant in the air.', lethal: { rate: 2.2, cause: 'toxic atmosphere' } },
  computer_rot: { label: 'Computer rot', systems: ['computer', 'comms', 'lifts', 'sensors'], alert: 'yellow', rate: 0.075, watch: 'computer', first: 'Computer: isolinear stacks are returning corrupted records.', lethal: null },
  hull_fatigue: { label: 'Hull fatigue', systems: ['dampers', 'gravity', 'lighting'], alert: 'hull_breach', rate: 0.06, watch: 'dampers', first: 'Operations: stress readings on the hull are above tolerance.', lethal: { rate: 9, cause: 'decompression', breach: true } },
  sabotage: { label: 'Sabotage', systems: ['security', 'lifts', 'lighting', 'coolant'], alert: 'intruder', rate: 0.08, watch: 'security', first: 'Security: someone has tampered with a junction panel.', lethal: null },
  psychological: { label: 'Cabin fever', systems: ['holo', 'replicators', 'lighting'], alert: 'yellow', rate: 0.065, watch: 'holo', first: 'Medical: crew are reporting sleeplessness and paranoia.', lethal: null },
};
const MODE_KEYS = Object.keys(FAILURE_MODES);

export class Phases {
  constructor({ shipState, alerts = null, roster, duty = null, seed = 1, say = () => {}, enabled = true }) {
    Object.assign(this, { shipState, alerts, roster, duty, seed, say, enabled });
    this.t = 0; this.index = 0; this.mode = null; this.severity = 0; this.pulseT = 0; this.listeners = []; this.ended = false; this.log = [];
    this.saboteur = null; this.breachDeck = null; this.stress = 0; this.fixed = 0;
  }
  on(fn) { this.listeners.push(fn); return this; }
  emit(ev) { this.log.push(ev); if (this.log.length > 60) this.log.shift(); for (const f of this.listeners) f(ev); }
  get phase() { return PHASES[this.index]; }
  get modeDef() { return this.mode ? FAILURE_MODES[this.mode] : null; }
  pressure() {   // 0..4: the later of the clock and the debt
    const byTime = PHASE_AT.reduce((n, at, i) => this.t >= at ? i : n, 0), debt = this.duty?.debt ?? 0, faults = this.shipState.faulted().length;
    return Math.min(4, Math.max(byTime, Math.floor(debt / 5), Math.floor(faults / 3)));
  }
  chooseMode() {
    // the system with the most neglect decides; otherwise the seed does
    const led = Object.entries(this.duty?.ledger || {}).filter(([k, v]) => k !== 'misc' && v > 0.5).sort((a, b) => b[1] - a[1]);
    for (const [sys] of led) { const m = MODE_KEYS.find(k => FAILURE_MODES[k].systems[0] === sys || FAILURE_MODES[k].systems.includes(sys)); if (m) return m; }
    return MODE_KEYS[hash('mode', this.seed) % MODE_KEYS.length];
  }
  tick(dt) {
    if (!this.enabled || this.ended) return; this.t += dt;
    const want = this.pressure();
    if (want > this.index) this.advance(want);
    if (this.mode) {
      this.pulseT -= dt; const def = this.modeDef;
      if (this.pulseT <= 0) { this.pulseT = Math.max(9, 34 - this.index * 7 - this.severity * 8); this.pulse(def); }
    }
    if (this.t >= RUN_LENGTH) { this.ended = true; this.emit({ type: 'end', phase: this.phase, mode: this.mode, severity: this.severity }); }
  }
  advance(to) {
    const from = this.index; this.index = to;
    if (!this.mode && to >= 1) { this.mode = this.chooseMode(); const def = this.modeDef; this.pulseT = 6; this.emit({ type: 'mode', mode: this.mode, label: def.label }); this.say(def.first, 'warn'); if (this.mode === 'sabotage') this.pickSaboteur(); if (this.mode === 'hull_fatigue') this.breachDeck = 2 + (hash('breach', this.seed) % 4); }
    if (to >= 2 && this.alerts && !this.alerts.has('yellow')) this.alerts.raise('yellow', { source: 'auto', reason: 'The ship is degrading.' });
    this.emit({ type: 'phase', from: PHASES[from], to: PHASES[to], text: PHASE_TEXT[PHASES[to]] }); if (PHASE_TEXT[PHASES[to]]) this.say(PHASE_TEXT[PHASES[to]], to >= 3 ? 'warn' : 'comp');
    if (to >= 3 && this.alerts && this.modeDef) this.alerts.raise(this.modeDef.alert, { source: 'auto', reason: this.modeDef.label });
    if (to >= 4 && this.alerts) { this.alerts.raise('red', { source: 'auto', reason: 'Collapse' }); }
  }
  pickSaboteur() { const pool = this.roster.people.filter(p => !p.isPlayer && !['dead', 'crazed'].includes(p.status) && p.rank <= 3); this.saboteur = pool[hash('sab', this.seed) % Math.max(1, pool.length)] || null; }
  pulse(def) {
    const sys = def.systems[Math.floor(hash01('pulse', this.seed, Math.floor(this.t)) * def.systems.length)];
    this.severity = Math.min(1, this.severity + def.rate * (0.6 + this.index * 0.35));
    const amt = 0.12 + this.index * 0.08 + this.severity * 0.1;
    if (this.index >= 1 && this.shipState.sys[sys] && this.shipState.status(sys) !== 'offline') { const ev = this.shipState.damage(sys, amt); this.emit({ type: 'pulse', sys, status: ev.status, name: ev.name, part: ev.part }); }
    if (this.mode === 'sabotage' && this.saboteur && this.index >= 2 && this.severity > 0.2) { this.emit({ type: 'sabotage', who: this.saboteur.short, sys }); }
    if (this.mode === 'psychological') { this.stress += 1; this.duty?.roster?.people?.forEach?.(p => { if (!p.isPlayer && this.duty) this.duty._bump(p, -0.02); }); if (this.index >= 2) this.say(['“Did you hear that?” — a crewman nervously checks the corridor.', 'Someone in the mess is crying quietly.', 'Two crew argue over a replicator order and neither will back down.'][this.stress % 3], 'warn'); }
  }
  // called when any ship system is repaired
  onRepair(sysId) {
    if (!this.mode) return; const def = this.modeDef;
    if (def.systems.includes(sysId)) { this.severity = Math.max(0, this.severity - (sysId === def.watch ? 0.22 : 0.1)); this.fixed++; if (this.severity === 0 && this.index > 1 && this.shipState.faulted().length === 0) { this.index = Math.max(1, this.index - 1); this.emit({ type: 'recover', to: this.phase }); this.say('The worst seems to be past.', 'good'); } }
  }
  // damage per second the player takes right now (collapse only)
  hazard(deckNo, zones = {}) {
    if (this.index < 4 || !this.mode) return null; const l = this.modeDef.lethal; if (!l) return null;
    if (this.mode === 'contamination' && this.shipState.status('life') === 'nominal') return null;
    if (l.breach && deckNo !== this.breachDeck) return null;
    if (l.zone && zones.zone !== l.zone) return null;
    if (this.mode === 'reactor_drift' && this.shipState.status('reactor') === 'nominal') return null;
    return { rate: l.rate * (0.6 + this.severity * 0.6), cause: l.cause };
  }
  status() { return { phase: this.phase, index: this.index, mode: this.mode, label: this.modeDef?.label || null, severity: +this.severity.toFixed(2), t: Math.round(this.t) }; }
}
