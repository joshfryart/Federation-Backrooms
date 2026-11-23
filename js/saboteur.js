// The physical saboteur (Systems Nominal, failure mode 'sabotage'). Pure logic: no three.js, no DOM. js/phases.js picks WHO (phases.saboteur, a crew
// member of rank <= 3); this module makes them DO it with a body the player can notice, chase and subdue:
//   lurk -> travel (sim override, prio 1, activity 'tampering', walks to a junction / panel) -> tamper (dwell, sparks + a kneeling pose through the
//   repair body glue in js/main.js) -> the damage lands, the badge log names them -> flee (hop between rooms, runs from the player when exposed) -> lurk
// The player NOTICES them by watching the dwell (seen(person) callback from main: same deck, close, in front, line of sight) or from the badge log.
// Once exposed (phases.saboteurExposed) combat counts them as a saboteur (js/combat.js consequence 'saboteur': trust up, security helps, sabotage
// 'clear'); before that, grabbing a crew member on a hunch is an unprovoked assault with the usual trust cost (js/grapple.js provoked()).
//   new Saboteur({ phases, sim, shipState, sites, duty, say, seed, pace, seen, bodyState, playerDeck })   .tick(dt)  .jobOf(p)  .status()  .on(fn)
// Numbers marked (guess) were never tuned on real hardware.
import { hash01 } from './clock.js';
const LIVE = (p) => p && !['dead', 'corpse', 'crazed', 'evacuated'].includes(p.status);

export const SAB = { first: 14, gap: [28, 50], travelMax: 120, dwell: 9, noticeAfter: 2.5, fleeFor: 35, damage: 0.18, sameDeckBias: 0.6, seeRange: 9 };   // seconds / metres (guess)

export class Saboteur {
  constructor({ phases, sim, shipState, sites = {}, duty = null, say = () => {}, seed = 1, pace = {}, seen = () => false, bodyState = () => null, playerDeck = () => null }) {
    Object.assign(this, { phases, sim, shipState, sites, duty, say, seed, pace, seen, bodyState, playerDeck });
    this.T = pace.T || 1; this.state = 'idle'; this.t = 0; this.who = null; this.site = null; this.n = 0; this.listeners = []; this.walkLeft = null; this.seenFor = 0;
    this.stats = { tampers: 0, seen: 0, chases: 0 }; this.log = [];
    phases.physical = true;   // phases.pulse() stops naming the culprit itself: the badge log now follows an actual tamper
  }
  on(fn) { this.listeners.push(fn); return this; }
  emit(ev) { this.log.push(ev); if (this.log.length > 40) this.log.shift(); for (const f of this.listeners) f(ev); }
  r() { return hash01('sab', this.seed, this.n++, Math.floor(this.t)); }
  get culprit() { return this.phases.saboteur; }
  // the covert "job" the repair body glue reads (same shape as RepairCrew.jobOf) while they travel to / work the panel
  jobOf(p) {
    if (!this.site || this.culprit !== p || !['travel', 'tamper'].includes(this.state)) return null;
    return { sys: this.site.sys, site: this.site, role: 'lead', state: this.state === 'tamper' ? 'working' : 'travel', progress: this.state === 'tamper' ? Math.min(1, this.t / (SAB.dwell * this.T)) : 0, tool: null, urgent: false, suspended: false, covert: true, main: false };
  }
  pickSite() {
    const mode = this.phases.modeDef, sys = mode?.systems || [], list = sys.map(s => this.sites[s]).filter(Boolean), pd = this.playerDeck();
    if (!list.length) return null; const near = list.filter(s => s.deckNo === pd);
    return near.length && this.r() < SAB.sameDeckBias ? near[Math.floor(this.r() * near.length)] : list[Math.floor(this.r() * list.length)];   // (guess) lean towards the player's deck so a watchful player can catch it
  }
  _go(state, secs) { this.state = state; this.t = 0; this.limit = secs; }
  stand() { const p = this.culprit; if (p) this.sim.release?.(p, 1); }
  tick(dt) {
    const ph = this.phases, p = this.culprit;
    if (!ph.enabled || ph.ended) return;
    if (!p || !LIVE(p) || p.isPlayer) { if (this.who) this.release(); return; }   // caught (phases.saboteur cleared by combat) or gone
    if (this.who !== p) { this.who = p; this._go('lurk', SAB.first * this.T); }
    if (ph.index < 2) return;   // the first anomalies are just the ship; sabotage starts in the degraded phase
    this.t += dt;
    switch (this.state) {
      case 'lurk': if (this.t >= this.limit) { const s = this.pickSite(); if (s) { this.site = s; this.walkLeft = null; this.sim.redirect(p, s.room, 'repair', undefined, 'tampering', { prio: 1, site: { deckNo: s.deckNo, tx: s.stand[0], ty: s.stand[1] } }); this._go('travel', SAB.travelMax * this.T); } else this._go('lurk', 20); } break;
      case 'travel': if (this.arrived(p, dt) || this.t > this.limit) this._go('tamper', SAB.dwell * this.T); break;
      case 'tamper': this.tamper(p, dt); break;
      case 'flee': if (this.t >= this.limit) { this.sim.release?.(p, 1); this._go('lurk', (SAB.gap[0] + this.r() * (SAB.gap[1] - SAB.gap[0])) * this.T); } break;
    }
  }
  arrived(p, dt) {
    const s = this.site, w = this.sim.where(p); if (!w || w.transit || w.deckNo !== s.deckNo || w.room !== s.room) return false;
    const b = this.bodyState(p); if (b === 'walking') return false; if (b === 'arrived') return true;
    if (this.walkLeft == null) this.walkLeft = 4 + this.r() * 6; this.walkLeft -= dt;   // off-screen: the last few metres take a few seconds (guess)
    return this.walkLeft <= 0;
  }
  tamper(p, dt) {
    const ph = this.phases;
    if (!this.exposed() && this.seen(p, this.site)) { this.seenFor += dt; if (this.seenFor >= SAB.noticeAfter) this.expose('seen'); } else if (!this.exposed()) this.seenFor = Math.max(0, this.seenFor - dt);
    if (this.t < SAB.dwell * this.T) return;
    // the panel is done: damage lands, the badge log names them, they slip away
    const s = this.site, amt = (SAB.damage + ph.index * 0.05) * (this.shipState.status(s.sys) === 'offline' ? 0 : 1);
    if (amt > 0 && this.shipState.sys[s.sys]) { const ev = this.shipState.damage(s.sys, amt); ph.emit({ type: 'pulse', sys: s.sys, status: ev.status, name: ev.name, part: ev.part }); }
    ph.severity = Math.min(1, ph.severity + 0.05); this.stats.tampers++;
    ph.emit({ type: 'sabotage', who: p.short, sys: s.sys, deck: s.deckNo, badge: true });
    this.emit({ type: 'tamper', who: p.short, sys: s.sys, deck: s.deckNo });
    if (!this.exposed()) this.expose('badge');
    this.leave(p);
  }
  exposed() { return !!this.phases.saboteurExposed; }
  expose(how) {
    const p = this.culprit; this.phases.saboteurExposed = how; if (how === 'seen') this.stats.seen++;
    const d = this.duty; if (d) { d.chain.push(how === 'seen' ? `You caught ${p.short} tampering with a junction panel` : `The badge log names ${p.short} at a junction panel`); d.stats.sabotageSeen = (d.stats.sabotageSeen || 0) + 1; }
    this.emit({ type: 'exposed', how, who: p.short });
    if (how === 'seen') this.say(`${p.short} is tampering with the panel!`, 'warn');
  }
  leave(p) {   // hop to a random other room for a while; main.js makes them run from the player while exposed
    const rooms = Object.values(this.sites).map(s => s.room).filter(r => r && r !== this.site?.room);
    const room = rooms.length ? rooms[Math.floor(this.r() * rooms.length)] : 'corridor';
    this.sim.redirect(p, room, 'door', SAB.fleeFor * this.T, 'tampering', { prio: 1 }); this._go('flee', SAB.fleeFor * this.T); this.site = null; this.seenFor = 0; this.stats.chases++;
  }
  release() { const p = this.who; if (p) this.sim.release?.(p, 1); this.who = null; this.site = null; this.state = 'idle'; this.t = 0; }
  status() { return { state: this.state, who: this.culprit?.short || null, exposed: this.phases.saboteurExposed || false, site: this.site ? { sys: this.site.sys, deck: this.site.deckNo } : null, ...this.stats }; }
}
