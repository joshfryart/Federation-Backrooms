// NPC crew simulation (Systems Nominal). Pure logic, no three.js, no DOM: node-testable.
// Every living crew member follows the `daily_template` of their billet (compiled into comms.json as `day`:
// [from, to, room, spot, activity], hours since their watch began, read through ShipClock.localHour).
// The sim only tracks *where each person is* in the abstract (deck + room + spot, or "in transit"); the game
// (js/main.js) builds bodies for whoever is on the deck the player is standing on (LOD: abstract elsewhere).
//   new CrewSim({ roster, clock, plan, data, seed, decks })
//   sim.tick(dt)            real seconds; dispatches 'depart' / 'arrive' events
//   sim.where(person)       { deckNo, room, spot, activity, transit }  (deckNo null while riding the lift)
//   sim.onDeck(deckNo)      [{ person, room, spot, activity, tx, ty }] people standing on that deck right now
//   sim.bodies(deckNo)      Map id -> { person, room, spot, activity, tx, ty, free, walking } for the body layer: everyone standing on the deck
//                           plus those walking between two rooms of it (already listed at their destination); lift riders are on neither deck
//   sim.estimate(p, room)   seconds to get to that room from here (walk / lift legs as tick() plans them), 0 = there already
//   sim.setPlayer(p)        the player is not simulated
//   sim.redirect(p, room, spot, secs, activity, { prio, site })  priority overrides (evac 3 / orders 2 / repair 1); overrideOf(p), release(p[, prio])
//   Pace (js/pace.js): schedule blocks follow ShipClock.localHour, so the clock's pace rate stretches the schedule; transits stay real seconds.
//   sim.setSocial(graph)    js/social.js: free-time blocks follow friends and groups (same room instance, same spot, group gatherings),
//                           spouses share quarters. Deterministic; without a graph the sim behaves exactly as before.
//   sim.setWorld(fn)        js/profiles.js: fn() -> { phase: 0..4, alerts: [AlertState records] } switches the crew profiles on: free-time blocks pick from each
//                           billet's `activities` weighted by needs; `phase_behaviour` makes crew dig in at the post as the ship degrades; a mild alert
//                           (yellow, gravity, medical) puts free-time crew at their `alert_responses` room. sim.alertResponse(p) = the severe-alert
//                           order (js/main.js alertStations sends them at priority 3). Without setWorld the sim follows the plain template as before.
import { hash, hash01 } from './clock.js';
import { freeBlock } from './social.js';
import { pickActivity, stayChance, alertResponse } from './profiles.js';

const DEAD = new Set(['dead', 'corpse', 'crazed', 'evacuated']);
export const LIFT_BASE = 3.5, LIFT_PER_DECK = 1.4, WALK_TIME = 5, WALK_MAX = 75, TILE_S = 2.5 / 1.0, HOLD_MAX = 60, LADDER_T = 6, LADDER_QUEUE = 3;   // a ladder takes one person at a time: when 3 are already on their way to this deck's ladder, the next goes by lift   // real seconds in transit; a walk on one deck takes about as long as the body needs (tiles * 2.5 m at ~1 m/s, the measured body pace), 3..75 s
// (docs/pathing.md iteration 2: the old 20 s cap counted people as arrived 20-50 s before their body got there). With `lifts` (the lift
// car tile per deck) a lift trip is walk to the car + ride + a walk leg from the car on the new deck; `holdBody(person, transit)` (the body
// layer, js/main.js) keeps a trip open while the person's body on the player's deck is still walking it (at most HOLD_MAX s past the estimate).

export class CrewSim {
  constructor({ roster, clock, plan, data, seed = 1, decks = 8, lifts = null, ladders = null }) {
    Object.assign(this, { roster, clock, plan: plan || {}, data, seed, decks, lifts, ladders }); this.holdBody = null;
    this.world = null; this._pc = new Map(); this.t = 0; this.over = new Map(); this.st = new Map(); this.handlers = {}; this.player = null; this.acc = 0; this.log = [];
    for (const p of roster.people) this._init(p);
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  _emit(ev, a) { for (const f of this.handlers[ev] || []) f(a); }
  setPlayer(p) { this.player = p; if (p) this.st.delete(p.id); }
  setWorld(fn) { this.world = fn || null; this._pc = new Map(); return this; }
  _ctx() { const w = this.world?.() || {}, al = w.alerts || [], idx = w.phase || 0; return { phase: idx, alerts: al, sev: al.reduce((m, a) => Math.max(m, a.def?.severity ?? 0), 0) }; }
  // the severe-alert order for this person now (or null): room, spot, priority, action, comm line (their profile's `alert_responses`)
  alertResponse(p, severe = true) { const w = this._ctx(), st = this.st.get(p.id); return alertResponse(this.data?.billets?.[p.billet], w.alerts, { deckNo: st?.deckNo ?? null, severe }); }
  setSocial(graph) { this.social = graph || null; for (const s of [...this.st.values()]) if (!s.transit) this._init(s.person); return this; }

  // The scheduled block for a person right now: { room, spot, activity } or null
  block(p) {
    const ov = this.overrideOf(p); if (ov) return { room: ov.room, spot: ov.spot || 'door', activity: ov.activity || 'evacuating', site: ov.site || null, prio: ov.prio };
    const b = this._day(p); if (!b) return null;
    let out = { room: b[2], spot: b[3], activity: b[4] }, S = this.social;
    if (this.world && freeBlock(b)) { const o = this._profileBlock(p, b); if (o) { out = o; if (o.work || o.alert) return o; } }   // js/profiles.js: needs-weighted activity / dig in / mild alert
    if (!S || !freeBlock(b) || !S.isFree(p, this.clock.hour)) return out;
    // free time (js/social.js): drop in on a group gathering; else, most of the time, go where your free-time lead goes; else at least
    // stand at the same furniture as your closest same-watch friend when you are in the same room anyway
    out.free = true; const hr = this.clock.hour, m = S.meetingFor(p, hr), live = (q) => q && q !== this.player && !DEAD.has(q.status);
    if (m && this.plan[m.room]?.length) return { room: m.room, spot: m.spot, activity: m.activity, free: true, group: m.group, site: m.site };
    const L = S.leadOf(p), lp = L !== p.id ? this.roster.people[L] : null;
    if (live(lp) && lp.id === L && hash01('tag', this.seed, p.id, Math.floor(hr * 2)) < 0.7) { const lb = this._day(lp); if (lb && freeBlock(lb) && lb[2] !== 'quarters' && this.plan[lb[2]]?.length) return { room: lb[2], spot: lb[3], activity: lb[4], free: true, follow: L }; }
    const c = S.companionOf(p), cp = c != null ? this.roster.people[c] : null;
    if (live(cp) && cp.id === c) { const cb = this._day(cp); if (cb && cb[2] === out.room && cb[3] !== out.spot && freeBlock(cb)) out.spot = cb[3]; }
    return out;
  }
  // profile overlay for a free-time block (js/profiles.js). Cached per person and 20-minute slot; null = the template block stands.
  _profileBlock(p, b) {
    const prof = this.data?.billets?.[p.billet]; if (!prof?.act?.length) return null;
    const c = this._ctx(), h = this.clock.localHour(p), slot = Math.floor((h - b[0]) * 3), key = `${b[0]}|${slot}|${c.phase}|${c.alerts.map(a => a.id).join()}`, hit = this._pc.get(p.id);
    if (hit && hit.key === key) return hit.val ? { ...hit.val } : null;
    const has = (r) => !!this.plan[r]?.length; let val = null;
    const mild = alertResponse(prof, c.alerts, { deckNo: this.st.get(p.id)?.deckNo ?? null, severe: false });
    if (mild && has(mild.room)) val = { room: mild.room, spot: mild.spot, activity: 'alert_' + mild.id, alert: mild.id };   // yellow alert: stay near the post, as the profile says
    else if (c.phase > 0 && hash01('stay', this.seed, p.id, Math.floor(h * 3)) < stayChance(prof, c.phase)) {   // phase_behaviour: dig in at the post rather than take the break
      const w = (this.data.billets[p.billet].day || []).find(x => x[0] < 8 && !/sleep|handover|walk_to|pre_watch|pre_duty|prep_for|watch_brief|get_ready|wake|meal|coffee|break|tea|breakfast/.test(x[4]) && has(x[2]));
      if (w) val = { room: w[2], spot: w[3], activity: w[4], work: true };
    }
    if (!val) { const a = pickActivity(prof, p, { from: b[0], h, ctx: { ...c, prof }, seed: this.seed, has, tmpl: true }); if (a) val = { room: a.room, spot: a.spot, activity: a.activity, free: true }; }
    this._pc.set(p.id, { key, val }); return val ? { ...val } : null;
  }
  _day(p) { const day = this.data?.billets?.[p.billet]?.day; if (!day?.length) return null; const h = this.clock.localHour(p); return day.find(x => h >= x[0] && h < x[1]) || day[day.length - 1]; }
  // Which instance of a room type this person uses. Quarters are personal; others prefer the person's own deck, then the nearest.
  // b = the block (from block()): a group gathering names its own room instance; other free time follows the person's social anchor
  site(p, room, fromDeck = null, b = null) {
    const list = this.plan[room];
    if (b?.site && b.room === room) return list?.find(s => s.deckNo === b.site.deckNo && s.tx === b.site.tx && s.ty === b.site.ty) || b.site;   // a named instance / exact tile (gatherings, repair sites: corridors too)
    if (!list?.length) { const any = this.plan.stores || this.plan.cargo; return any?.[0] || { deckNo: 1, tx: 0, ty: 0 }; }
    const S = this.social;
    if (room === 'quarters') return list[hash('quarters', this.seed, S ? S.quartersOf(p) : p.id) % list.length];   // spouses share quarters
    if (room === 'bridge' || room === 'readyroom') return list[0];
    let who = p.id, home = fromDeck ?? this._home(p);
    if (S && b?.free) { who = S.anchorOf(p); const q = this.plan.quarters; home = q?.length ? q[hash('quarters', this.seed, S.quartersOf(who)) % q.length].deckNo : home; }   // friends converge on one instance
    let best = null, bd = 1e9; for (const s of list) { const d = Math.abs(s.deckNo - home) + hash01('site', this.seed, who, s.deckNo, s.tx, s.ty) * 0.9; if (d < bd) { bd = d; best = s; } }
    return best;
  }
  _home(p) { const s = this.st.get(p.id); return s?.deckNo ?? (this.plan.quarters?.[hash('quarters', this.seed, p.id) % (this.plan.quarters.length || 1)]?.deckNo ?? 1); }

  _init(p) {
    if (p === this.player || DEAD.has(p.status)) return;
    const b = this.block(p) || { room: 'quarters', spot: 'bunk', activity: 'idle' }, s = this.site(p, b.room, null, b);
    this.st.set(p.id, { person: p, deckNo: s.deckNo, tx: s.tx, ty: s.ty, room: b.room, spot: b.spot, activity: b.activity, free: !!b.free, transit: null, target: null });
  }
  where(p) { const s = this.st.get(p.id); return s ? { deckNo: s.transit?.lift ? null : s.deckNo, room: s.transit ? (s.transit.lift ? 'lift' : 'corridor') : s.room, spot: s.spot, activity: s.activity, transit: !!s.transit } : null; }
  onDeck(deckNo) {
    const out = []; for (const s of this.st.values()) if (s.deckNo === deckNo && !s.transit && !DEAD.has(s.person.status)) out.push({ person: s.person, room: s.room, spot: s.spot, activity: s.activity, tx: s.tx, ty: s.ty });
    return out;
  }
  bodies(deckNo) {
    const out = new Map(); for (const s of this.st.values()) { const t = s.transit; if (s.deckNo !== deckNo || t?.lift || DEAD.has(s.person.status)) continue; const a = t ? { ...t, tx: t.to.tx, ty: t.to.ty } : s; out.set(s.person.id, { person: s.person, room: a.room, spot: a.spot, activity: a.activity, tx: a.tx, ty: a.ty, free: !!a.free, walking: !!t, via: t?.via || null }); }
    return out;
  }
  // seconds this person needs to get to `room` from where they are now (the same walk / lift estimate tick() uses; 0 = already there,
  // null = unknown): js/main.js tells the player how long an ordered person will take ("about a minute")
  estimate(p, room, site = null) {
    const s = this.st.get(p.id); if (!s) return null; const t = s.transit, dest = site || this.site(p, room, t?.to?.deckNo ?? s.deckNo, { room });
    if (!t && s.room === room && dest.deckNo === s.deckNo) return 0;
    const at = t ? (t.lift ? { deckNo: t.to.deckNo, tx: (t.ladder ? this.ladders : this.lifts)?.[t.to.deckNo - 1]?.[0] ?? t.to.tx, ty: (t.ladder ? this.ladders : this.lifts)?.[t.to.deckNo - 1]?.[1] ?? t.to.ty } : { deckNo: s.deckNo, tx: t.to.tx, ty: t.to.ty }) : s;
    const pre = t ? Math.max(0, t.eta) : 0, walk = (ax, ay, bx, by) => Math.min(WALK_MAX, Math.max(3, (Math.abs(bx - ax) + Math.abs(by - ay)) * TILE_S || WALK_TIME));
    if (dest.deckNo === at.deckNo) return pre + walk(at.tx, at.ty, dest.tx, dest.ty);
    const L0 = this.lifts?.[at.deckNo - 1], L1 = this.lifts?.[dest.deckNo - 1], LD = this._ladders(at.deckNo, dest.deckNo);
    const viaL = pre + (L0 ? walk(at.tx, at.ty, L0[0], L0[1]) : 0) + LIFT_BASE + LIFT_PER_DECK * Math.abs(dest.deckNo - at.deckNo) + 1 + (L1 ? walk(L1[0], L1[1], dest.tx, dest.ty) : 0);
    if (!LD) return viaL;
    const viaD = pre + walk(at.tx, at.ty, LD[0][0], LD[0][1]) + LADDER_T + walk(LD[1][0], LD[1][1], dest.tx, dest.ty);
    return Math.min(viaL, viaD);
  }
  // how a person on a deck-to-deck trip goes: 'ladder' (the service ladder wells, adjacent decks only) or 'lift' (null when not travelling)
  viaOf(p) { const t = this.st.get(p.id)?.transit; return t?.lift ? (t.ladder ? 'ladder' : 'lift') : null; }
  // ladder route between two decks (adjacent only, both with a well): [from stand tile, to stand tile] or null
  _ladders(a, b) { if (Math.abs(a - b) !== 1) return null; const A = this.ladders?.[a - 1], B = this.ladders?.[b - 1]; return A && B ? [A, B] : null; }
  inTransit() { return [...this.st.values()].filter(s => s.transit).map(s => ({ person: s.person, from: s.transit.from, to: s.transit.to, lift: s.transit.lift })); }
  // the person is removed from the abstract sim (died, or became the player)
  drop(p) { this.st.delete(p.id); }

  // Send a person somewhere else for a while: room type + optional seconds (+ optional exact site {deckNo, tx, ty}). Priority ladder
  // (docs/mockups/pacing-npc.md §2.5): evacuation / alert stations 3 > player orders 2 > repair dispatch 1 > schedule. A lower override
  // is suspended under a higher one, never cancelled: each person has a small stack, one entry per priority. Returns false (and
  // stores nothing) when a higher priority already holds the person. release(p) clears everything; release(p, prio) one level.
  redirect(p, room, spot = 'door', seconds = undefined, activity = 'evacuating', { prio = activity === 'evacuating' ? 3 : 1, site = null } = {}) {
    const live = this._stack(p), top = live[live.length - 1], held = !!top && top.prio > prio;
    this._setStack(p, [...live.filter(o => o.prio !== prio), { room, spot, activity, prio, site, until: seconds === undefined ? undefined : this.t + seconds }].sort((a, b) => a.prio - b.prio));
    return !held;   // stored either way (it resumes when the higher level is released); false = suspended right now
  }
  release(p, prio = null) { if (prio == null) { this.over.delete(p.id); return; } this._setStack(p, this._stack(p).filter(o => o.prio !== prio)); }
  _stack(p) { const s = this.over.get(p.id); return (s?.stack || (s ? [s] : [])).filter(o => o.until === undefined || o.until > this.t); }
  _setStack(p, st) { if (!st.length) this.over.delete(p.id); else { const top = st[st.length - 1]; this.over.set(p.id, { ...top, stack: st }); } }
  // the override in force (highest priority, not expired) or null; overrideAt(p, prio) = that level's entry even while suspended
  overrideOf(p) { const st = this._stack(p); return st.length ? st[st.length - 1] : null; }
  overrideAt(p, prio) { return this._stack(p).find(o => o.prio === prio) || null; }
  overridden(p) { return !!this.overrideOf(p); }
  tick(dt) {
    this.t += dt;
    // finish trips
    for (const s of this.st.values()) {
      if (!s.transit) continue; const t = s.transit, held = this.holdBody?.(s.person, t);
      if (held && t.lift && !t.boarded) { if (t.eta - dt > t.ride) { t.eta -= dt; continue; } t.eta = t.ride; t.hold = (t.hold || 0) + dt; if (t.hold < HOLD_MAX) continue; }   // the body is still walking to / standing in the car: the ride starts when it is gone
      t.boarded = true; t.eta -= dt;
      if (t.eta <= 0 && held && (t.hold = (t.hold || 0) + dt) < HOLD_MAX) continue;   // the body is still on its way: it arrives when it gets there
      if (t.eta <= 0 && t.lift && t.inLeg > 0) {   // off the car on the new deck: the walk from the car to the room (bodies() lists them there, walking)
        s.deckNo = t.to.deckNo; const L = (t.ladder ? this.ladders : this.lifts)[t.to.deckNo - 1]; s.tx = L[0]; s.ty = L[1]; s.transit = { lift: false, eta: t.inLeg, from: t.from, to: t.to, room: t.room, spot: t.spot, activity: t.activity, free: t.free, via: t.ladder ? 'ladder' : null }; continue;
      }
      if (t.eta <= 0) { s.transit = null; Object.assign(s, { deckNo: t.to.deckNo, tx: t.to.tx, ty: t.to.ty, room: t.room, spot: t.spot, activity: t.activity, free: t.free }); this.log.push(`arrive:${s.person.id}:${t.to.deckNo}:${t.room}`); this._emit('arrive', { person: s.person, deckNo: s.deckNo, room: s.room, spot: s.spot, activity: s.activity, from: t.from }); }
    }
    this.acc += dt; if (this.acc < 0.5) return; this.acc = 0;
    // new schedule blocks: a different room (or spot) sends the person there
    for (const s of this.st.values()) {
      const p = s.person; if (s.transit?.lift || DEAD.has(p.status)) { if (DEAD.has(p.status)) this.st.delete(p.id); continue; }
      const b = this.block(p); if (!b) continue;
      const dest = this.site(p, b.room, s.deckNo, b);
      if (s.transit) { const t = s.transit; if (b.room === t.room && b.spot === t.spot && dest.deckNo === t.to.deckNo && dest.tx === t.to.tx && dest.ty === t.to.ty) continue; s.transit = null; }   // walking on this deck and the plan changed (orders, an alert, a repair call): turn round at once
      if (b.room === s.room && b.spot === s.spot && ((!this.social && !b.site) || (dest.deckNo === s.deckNo && dest.tx === s.tx && dest.ty === s.ty))) { s.activity = b.activity; s.free = !!b.free; continue; }
      const lift = dest.deckNo !== s.deckNo, walk = (ax, ay, bx, by) => Math.min(WALK_MAX, Math.max(3, (Math.abs(bx - ax) + Math.abs(by - ay)) * TILE_S || WALK_TIME)) * (0.9 + 0.2 * hash01('walk', this.seed, p.id, b.room));
      const L0 = lift && this.lifts?.[s.deckNo - 1], L1 = lift && this.lifts?.[dest.deckNo - 1];
      const ride = lift ? LIFT_BASE + LIFT_PER_DECK * Math.abs(dest.deckNo - s.deckNo) + hash01('eta', this.seed, p.id, b.room) * 2 : 0, eta = lift ? ride + (L0 ? walk(s.tx, s.ty, L0[0], L0[1]) : 0) : walk(s.tx, s.ty, dest.tx, dest.ty);
      const LD = lift && this._ladders(s.deckNo, dest.deckNo), inLeg = L1 ? walk(L1[0], L1[1], dest.tx, dest.ty) : 0;   // a ladder well beats the lift for someone nearer to it (iteration 7: crew climb the service ladders between adjacent decks)
      if (LD) { const e2 = LADDER_T + walk(s.tx, s.ty, LD[0][0], LD[0][1]), in2 = walk(LD[1][0], LD[1][1], dest.tx, dest.ty); if (e2 + in2 < eta + inLeg && [...this.st.values()].filter(o => o.transit?.ladder && o.transit.from.deckNo === s.deckNo && o.transit.eta > LADDER_T * 0.5).length < LADDER_QUEUE) { s.transit = { lift: true, ladder: true, eta: e2, ride: LADDER_T, from: { deckNo: s.deckNo, room: s.room }, to: dest, room: b.room, spot: b.spot, activity: b.activity, free: !!b.free, inLeg: in2 }; this.log.push(`depart:${p.id}:${s.deckNo}->${dest.deckNo}:${b.room}:ladder`); this._emit('depart', { person: p, from: s.deckNo, to: dest.deckNo, room: b.room, lift: true, ladder: true }); continue; } }
      s.transit = { lift, eta, ride, from: { deckNo: s.deckNo, room: s.room }, to: dest, room: b.room, spot: b.spot, activity: b.activity, free: !!b.free, inLeg };
      this.log.push(`depart:${p.id}:${s.deckNo}->${dest.deckNo}:${b.room}`); this._emit('depart', { person: p, from: s.deckNo, to: dest.deckNo, room: b.room, lift });
    }
    if (this.log.length > 400) this.log.splice(0, this.log.length - 400);
  }
  // headcount by room type, for tests and the debug overlay
  census() { const c = {}; for (const s of this.st.values()) { const k = s.transit ? 'transit' : s.room; c[k] = (c[k] || 0) + 1; } return c; }
}
