// NPC repair response (Systems Nominal). Pure logic: no three.js, no DOM, node-testable (tools/test-repair.mjs).
// A fault in a ship system makes the owning department notice it (6-14 s, by pace), pick the best-qualified, nearest trained crew member
// on watch (the head of department is on call), and send them: a priority-1 override in the crew sim (js/sim.js redirect {prio, site})
// walks / lifts them to the system's hardware or junction. There they set up (tool out), work (real seconds, slower than the player),
// report on the comm bus in character, may ask for a part, may fail by skill / stress / tags and escalate to the bridge.
// NPC repairs PATCH, they never restore 100%: hp -> pace.npcHp (0.85 Standard) and only 40% of the failure-mode relief (js/phases.js
// onRepair { npc }), so the player and the specialists still matter.  Design: docs/mockups/pacing-npc.md §2, docs/pacing.md.
//   new RepairCrew({ roster, sim, shipState, clock, duties, decks, ship, seed, pace, phases, duty, social, say, bodyState, player })
//     .tick(dt)        real seconds (work is action time; notice delays are already per-pace real seconds)
//     .assist(sys, dt) the player holds E at the same hardware: +1.0 rate      .assign(person, sys, { byPlayer })  orders (prio 2)
//     .request(sys)    radio "send engineers": notice now       .jobOf(person) / .workingOn(sys) / .hudNote(sys) / .rows() / .markers()
//     .bindJunction(sys, deckNo, stand, face, room)   the real junction tile once its deck is built (js/main.js placeRepairPoints)
//   say(person, text, { priority, to }) -> comm bus;  bodyState(person) -> null (abstract) | 'walking' | 'arrived'  (js/main.js glue)
//   events via .on(fn): notice | assign | arrive | progress | part | fail | escalate | done | abort
import { SYSTEMS, SYS, DEPT, hardwareSites, homeDeck, HOST_LABEL } from './crew.js';
import { hash, hash01 } from './clock.js';
import { mulberry32 } from './data.js';
import { loadoutFor, HANDHELDS } from './handhelds.js';
import { PACES } from './pace.js';

const LIVE = (p) => p && !['dead', 'corpse', 'crazed', 'evacuated'].includes(p.status);
export const ENG_FALLBACK = new Set(['dc', 'eps', 'ace', 'ce']);           // engineering damage control: can patch anything
export const SKILL_TOOLS = new Set(['tricorder_eng', 'hydrospanner']);
export const URGENT_SYS = new Set(['reactor', 'life', 'eps']);
export const NEVER_GENERALIST = new Set(['reactor', 'life']);                // a cook never touches the reactor
export const PRIO = { evac: 3, order: 2, repair: 1 };
const TOOL_PREF = ['tricorder_eng', 'hydrospanner', 'toolbag', 'plasma_torch', 'spanner', 'tricorder_geo', 'tricorder_atmo', 'crowbar'];
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ---- who is trained in what: duties.json loops carry `sys` (the "trained in" table, no new data)
export function trainedIn(billet, duties) { return new Set((duties?.billets?.[billet]?.loops || []).map(l => l.sys).filter(Boolean)); }
// skill 0..1 of a person for a system (docs/mockups/pacing-npc.md §2.2); tags nudge it a little
export function skillOf(p, sys, duties = null, ctx = {}) {
  let k = trainedIn(p.billet, duties).has(sys) ? 1 : p.dept === SYS[sys]?.dept ? 0.7 : (ENG_FALLBACK.has(p.billet) || loadoutFor(p).some(id => SKILL_TOOLS.has(id))) ? 0.5 : (p.rank ?? 0) >= 0 ? 0.2 : 0;
  const T = new Set(p.tags || []);
  if (T.has('combat:takes-charge')) k += 0.05; if (T.has('stress:calm') || T.has('habit:parade-rest')) k += 0.05;
  if (T.has('workstation:distracted') || T.has('habit:fidgets')) k -= 0.05;
  if (ctx.with && ctx.social?.affinity) k += ctx.with.some(q => (ctx.social.affinity(p, q) || 0) > 0.4) ? 0.05 : 0;
  return Math.max(0, Math.min(1, +k.toFixed(3)));
}
// the handheld a repairer takes out: an engineering tricorder first (scan), else the best repair tool they carry
export function toolOf(p) { const lo = loadoutFor(p); return TOOL_PREF.find(id => lo.includes(id)) || null; }
export const toolMul = (id) => HANDHELDS[id]?.job?.repairMul || 1;

// ---- where each system is serviced from: main hardware nearest its home deck, else a junction tile on the home deck.
// { sys, deckNo, tx, ty (hardware or junction floor tile), stand: [x, y] walkable tile to work from, face: [x, y] tile to face, room, main, kind, where }
export function repairSites(decks, ship, seed = 1) {
  const out = {}, hw = decks.map(d => hardwareSites(d)), used = new Set();
  const walk = (d, x, y) => d.grid[y]?.[x] === 0 && !(d.tubeAxis && d.tubeAxis[x + y * d.W]) && !(x === d.exit[0] && y === d.exit[1]);
  for (const s of SYSTEMS) {
    const home = Math.min(decks.length - 1, homeDeck(ship, s.home)); let best = null;
    if (s.host !== 'junction') for (let i = 0; i < decks.length; i++) { const h = hw[i].find(x => x.sys === s.id); if (h && (h.kind !== 'lift' || i === home)) { const dd = Math.abs(i - home); if (!best || dd < best.dd) best = { dd, i, h }; } }
    if (best) {
      const d = decks[best.i], { tx, ty } = best.h, nb = N4.map(([a, b]) => [tx + a, ty + b]).filter(([x, y]) => walk(d, x, y));
      const stand = nb[hash('stand', seed, s.id) % Math.max(1, nb.length)] || [tx, ty];
      out[s.id] = { sys: s.id, deckNo: best.i + 1, tx, ty, stand, face: [tx, ty], room: d.room[stand[1]]?.[stand[0]] || 'corridor', main: true, kind: best.h.kind, where: HOST_LABEL[s.host] };
      continue;
    }
    const d = decks[home], cand = [];
    for (let y = 1; y < d.H - 1; y++) for (let x = 1; x < d.W - 1; x++) { if (!walk(d, x, y) || used.has(home + ':' + x + ':' + y)) continue; const w = N4.find(([a, b]) => d.grid[y + b]?.[x + a] === 1); if (w) cand.push([x, y, x + w[0], y + w[1]]); }
    const pref = cand.filter(c => d.room[c[1]]?.[c[0]]), pool = pref.length > 8 ? pref : cand, c = pool[hash('jct', seed, s.id) % Math.max(1, pool.length)];
    if (!c) { out[s.id] = { sys: s.id, deckNo: home + 1, tx: d.exit[0], ty: d.exit[1], stand: [d.exit[0], d.exit[1]], face: [d.exit[0], d.exit[1]], room: 'corridor', main: false, kind: 'junction', where: 'maintenance junction' }; continue; }
    used.add(home + ':' + c[0] + ':' + c[1]);
    out[s.id] = { sys: s.id, deckNo: home + 1, tx: c[0], ty: c[1], stand: [c[0], c[1]], face: [c[2], c[3]], room: d.room[c[1]]?.[c[0]] || 'corridor', main: false, kind: 'junction', where: `junction, deck ${home + 1}` };
  }
  return out;
}

export class RepairCrew {
  constructor({ roster, sim, shipState, clock, duties = null, decks = null, ship = null, seed = 1, pace = PACES.standard, phases = null, duty = null, social = null, say = () => {}, bodyState = () => null, player = null, sites = null }) {
    Object.assign(this, { roster, sim, shipState, clock, duties, ship, seed, pace, phases, duty, social, say, bodyState, player });
    this.sites = sites || (decks && ship ? repairSites(decks, ship, seed) : {});
    this.jobs = new Map(); this.busy = new Map(); this.t = 0; this.sweepT = 5; this.listeners = []; this.log = []; this.rng = mulberry32(hash('repair', seed));
    this.stats = { jobs: 0, done: 0, failed: 0, parts: 0, escalated: 0, aborted: 0, assists: 0 };
    this.roll = (j, a) => hash01('verify', this.seed, j.sys, a.person.id, j.tries, Math.floor(this.t));   // the success roll (tests swap it)
    shipState.on?.((ev) => this.onShip(ev));
  }
  on(fn) { this.listeners.push(fn); return this; }
  emit(ev) { ev.t = +this.t.toFixed(1); this.log.push(ev); if (this.log.length > 120) this.log.shift(); for (const f of this.listeners) f(ev); }
  r(a, b) { return a + this.rng() * (b - a); }
  head(dept) { return this.roster.people.filter(p => LIVE(p) && p.dept === dept && !p.isPlayer).sort((a, b) => b.rank - a.rank || a.id - b.id)[0] || null; }
  site(sys) { return this.sites[sys] || null; }
  bindJunction(sys, deckNo, stand, face, room) {   // the junction the player sees on that deck is where the crew go
    const s = this.sites[sys]; if (!s || s.main || s.deckNo !== deckNo) return false;
    Object.assign(s, { tx: stand[0], ty: stand[1], stand, face, room: room || 'corridor', bound: true });
    for (const j of this.jobs.values()) if (j.sys === sys) for (const a of this._crew(j)) if (j.state === 'travel') this._send(j, a.person, a.prio);
    return true;
  }

  // ---- events: every fault (quiet, cascades, Phases pulses, neglect consequences) opens a job; a 5 s sweep catches anything missed
  onShip(ev) {
    if (ev.type === 'fault' && this.shipState.status(ev.id) !== 'nominal') this.open(ev.id, ev.cascade ? 'cascade' : ev.quiet ? 'quiet' : 'fault');
  }
  open(sys, cause = 'fault') {
    if (this.jobs.has(sys) || this.shipState.status(sys) === 'nominal' || !this.site(sys)) return null;
    const off = this.shipState.status(sys) === 'offline', comms = this.shipState.status('comms'), [a, b] = this.pace.notice || [6, 14];
    let delay = this.r(a, b); if (comms === 'nominal' && off) delay *= 0.5; else if (comms === 'offline') delay *= 2;
    const j = { sys, dept: SYS[sys].dept, site: this.site(sys), cause, state: 'notice', t: delay, opened: this.t, lead: null, helpers: [], progress: 0, need: 0, tries: 0, assist: 0, idle: 0, travelT: 0, partT: 0, marks: {}, escalated: false, byPlayer: false };
    this.jobs.set(sys, j); this.stats.jobs++; this.emit({ type: 'notice', sys, delay: +delay.toFixed(1), cause }); return j;
  }
  get urgentNow() { return (this.phases?.index ?? 0) >= 4; }
  isUrgent(sys) { return (URGENT_SYS.has(sys) && this.shipState.status(sys) === 'offline') || this.urgentNow; }

  // ---- the "best-qualified, nearest" rule (§2.4)
  score(p, j, { any = false } = {}) {
    if (!LIVE(p) || p.isPlayer || p === this.player || p.status === 'crazed') return null;
    if (this.busy.has(p.id) && this.busy.get(p.id) !== j.sys) return null;   // one job per person
    const w = this.sim.where(p); if (!w) return null;
    const ov = this.sim.overrideOf?.(p); if (ov && ov.prio > PRIO.repair && !(ov.activity === 'repairing')) return null;
    const urgent = this.isUrgent(j.sys), sk = skillOf(p, j.sys, this.duties, { social: this.social, with: this._crew(j).map(a => a.person) });
    if (sk < 0.5 && !any && !(urgent && !NEVER_GENERALIST.has(j.sys))) return null;
    const lh = this.clock.localHour(p), onWatch = lh < 8, head = this.head(j.dept) === p, asleep = (this.sim._day?.(p)?.[4] || '') === 'sleep';
    if (!onWatch && !head && !any) return null; if (asleep && !head) return null;
    const deck = w.deckNo ?? this.sim.st?.get(p.id)?.transit?.to?.deckNo ?? j.site.deckNo, dd = Math.abs(deck - j.site.deckNo);
    return 3 * sk + (dd === 0 ? 0.6 : dd === 1 ? 0.3 : 0) - 0.1 * dd + (p.rank >= 2 && urgent ? 0.1 : 0) - (onWatch ? 0 : 0.5) + hash01('pick', this.seed, p.id, j.sys) * 0.05;
  }
  pick(j, exclude = new Set(), opts = {}) {
    let best = null, bs = -1e9; for (const p of this.roster.people) { if (exclude.has(p.id)) continue; const s = this.score(p, j, opts); if (s != null && s > bs) { bs = s; best = p; } }
    return best;
  }
  _crew(j) { return [j.lead, ...j.helpers].filter(Boolean); }
  _send(j, p, prio) {
    const s = j.site; return this.sim.redirect(p, s.room, 'repair', undefined, 'repairing', { prio, site: { deckNo: s.deckNo, tx: s.stand[0], ty: s.stand[1] } });
  }
  _enlist(j, p, role, prio = PRIO.repair) {
    const a = { person: p, role, prio, skill: skillOf(p, j.sys, this.duties, { social: this.social, with: this._crew(j).map(x => x.person) }), tool: toolOf(p) };
    this._send(j, p, prio); this.busy.set(p.id, j.sys); if (role === 'lead') j.lead = a; else j.helpers.push(a); return a;
  }
  _release(j, a) { if (!a) return; this.sim.release?.(a.person, a.prio); if (this.busy.get(a.person.id) === j.sys) this.busy.delete(a.person.id); }
  _need(j) {
    const a = j.lead, s = j.site; return SYS[j.sys].repair * (this.pace.workPer || 6) * (s.main ? 1 : 1.5) / (0.4 + 0.6 * a.skill) / toolMul(a.tool);
  }
  where(j) { const s = j.site; return s.main ? `${s.where}, deck ${s.deckNo}` : `junction on deck ${s.deckNo}`; }
  assign(j, forced = null, { byPlayer = false } = {}) {
    const lead = forced || this.pick(j) || (j.escalated ? this.pick(j, new Set(), { any: true }) : null);
    if (!lead) { if (j.state !== 'unassigned') { j.state = 'unassigned'; j.t = 5; const h = this.head(j.dept); if (h && !j.saidNone) { j.saidNone = true; this.say(h, `Bridge, ${h.short}. ${SYS[j.sys].name} is down and I have nobody free to send.`, { priority: 'routine' }); } } else j.t = 5; return null; }
    if (j.lead && j.lead.person !== lead) this._release(j, j.lead);
    j.byPlayer = byPlayer; const a = this._enlist(j, lead, 'lead', byPlayer ? PRIO.order : PRIO.repair); j.need = this._need(j); j.state = 'travel'; j.travelT = 0; j.walkLeft = null;
    const off = this.shipState.status(j.sys) === 'offline';
    if ((off && SYS[j.sys].repair >= 6) || a.skill < 0.5) { const h = this.pick(j, new Set([lead.id])); if (h) this._enlist(j, h, 'helper'); }
    const head = this.head(j.dept), dn = DEPT[j.dept].name;
    if (head && head !== lead && !byPlayer) this.say(head, `${dn}, ${head.short}: ${SYS[j.sys].name} fault, deck ${j.site.deckNo}. Sending ${lead.short}.`, { priority: off ? 'urgent' : 'routine' });
    this.say(lead, `${lead.short}, ${dn}: heading to the ${this.where(j)}.`, { priority: 'routine' });
    lead.activity = 'repairing'; this.emit({ type: 'assign', sys: j.sys, who: lead.short, id: lead.id, helpers: j.helpers.map(h => h.person.short), skill: a.skill, need: +j.need.toFixed(1), byPlayer });
    return a;
  }
  // a crew member on their way / at work for a system: their override is still ours and nobody higher holds them
  suspended(a) { const ov = this.sim.overrideOf?.(a.person); return !!ov && ov.prio > a.prio; }
  arrived(j, a) {
    const w = this.sim.where(a.person), s = j.site; if (!w || w.transit || w.deckNo !== s.deckNo || w.room !== s.room) return false;
    const b = this.bodyState(a.person); if (b === 'walking') return false; if (b === 'arrived') return true;
    if (j.walkLeft == null) j.walkLeft = this.r(4, 10) * (this.pace.walkMul ? 1 / this.pace.walkMul : 1);   // the last few metres, off-screen
    return j.walkLeft <= 0;
  }

  tick(dt) {
    this.t += dt;
    if ((this.sweepT -= dt) <= 0) { this.sweepT = 5; for (const s of this.shipState.faulted()) this.open(s.id, 'sweep'); }
    for (const j of [...this.jobs.values()]) this.step(j, dt);
  }
  step(j, dt) {
    const S = this.shipState, name = SYS[j.sys].name;
    if (S.status(j.sys) === 'nominal') return this.abort(j, 'fixed');
    for (const h of j.helpers.slice()) if (!LIVE(h.person)) { this._release(j, h); j.helpers.splice(j.helpers.indexOf(h), 1); }
    if (j.lead && (!LIVE(j.lead.person) || j.lead.person.isPlayer)) { this._release(j, j.lead); j.lead = null; j.state = 'unassigned'; j.t = 0; }
    const a = j.lead;
    if (a && ['travel', 'setup', 'working'].includes(j.state)) {
      if (this.suspended(a)) { j.susp = (j.susp || 0) + dt; return; }   // an order / evacuation / alert holds them: the job waits
      if (!this.sim.overrideAt?.(a.person, a.prio)) this._send(j, a.person, a.prio);   // someone released the sim override: put it back
      if (j.susp && j.state !== 'travel' && this.sim.where(a.person)?.room !== j.site.room) { j.state = 'travel'; j.walkLeft = null; } j.susp = 0;
    }
    switch (j.state) {
      case 'notice': if ((j.t -= dt) <= 0) this.assign(j); break;
      case 'unassigned':
        j.idle += dt; if ((j.t -= dt) <= 0) this.assign(j);
        if (!j.escalated && j.idle > (this.pace.escalate?.[1] ?? 150)) this.escalate(j, 'nobody free');
        break;
      case 'travel':
        j.travelT += dt; if (j.walkLeft != null) j.walkLeft -= dt;
        if (this.arrived(j, a) || j.travelT > 150) { j.state = 'setup'; const [s0, s1] = this.pace.setup || [3, 5]; j.t = this.r(s0, s1); this.emit({ type: 'arrive', sys: j.sys, who: a.person.short, travel: +j.travelT.toFixed(1), forced: j.travelT > 150 }); }
        break;
      case 'setup':
        if ((j.t -= dt) <= 0) { j.state = 'working'; const part = S.sys[j.sys].faults.at(-1)?.part; if (a.tool === 'tricorder_eng' && part) this.say(a.person, `Found it: ${part.toLowerCase()}.`, { priority: 'routine', local: true }); }
        break;
      case 'working': {
        const helpers = j.helpers.filter(h => !this.suspended(h) && this.arrivedHelper(j, h)).length, rate = 1 + 0.6 * helpers + j.assist;
        j.assist = 0; j.progress += rate * dt; const k = j.progress / j.need;
        if (k >= 0.35 && !j.marks.a) { j.marks.a = 1; const part = S.sys[j.sys].faults.at(-1)?.part || 'the coupling'; this.say(a.person, `Bridge, ${a.person.short}: ${part.toLowerCase()} is cooked, replacing.`, { priority: 'routine' }); this.emit({ type: 'progress', sys: j.sys, pct: 35 }); }
        if (k >= 0.7 && !j.marks.b) { j.marks.b = 1; this.say(a.person, 'Almost there.', { priority: 'routine', local: true }); this.emit({ type: 'progress', sys: j.sys, pct: 70 }); }
        if (k >= 1) this.verify(j);
        break;
      }
      case 'part':
        j.partT += dt; if ((j.t -= dt) <= 0) { j.state = 'working'; j.needs = null; this.say(a.person, 'Got the part. Back on it.', { priority: 'routine', local: true }); }
        else if (!j.escalated && j.partT > (this.pace.escalate?.[0] ?? 90)) this.escalate(j, 'part');
        break;
    }
  }
  arrivedHelper(j, h) { const w = this.sim.where(h.person); return !!w && !w.transit && w.deckNo === j.site.deckNo && w.room === j.site.room; }
  verify(j) {
    const a = j.lead, S = this.shipState, T = new Set(a.person.tags || []), sev = S.status(j.sys) === 'offline' ? 1 : 0;
    const p = Math.max(0.2, Math.min(0.97, 0.55 + 0.45 * a.skill - 0.12 * (this.phases?.index ?? 0) - 0.1 * sev - (a.tool ? 0 : 0.1) - (T.has('stress:brittle') || T.has('combat:panics') ? 0.05 : 0) + (j.escalated ? 0.1 : 0)));
    if (this.roll(j, a) < p) return this.done(j);
    j.tries++; this.stats.failed++; S.sys[j.sys].hp = Math.max(S.sys[j.sys].hp, 0.5);   // a failed patch still props it up (degraded), quietly
    this.emit({ type: 'fail', sys: j.sys, who: a.person.short, p: +p.toFixed(2), tries: j.tries });
    if (j.tries >= 2) return this.escalate(j, 'failed twice');
    const specialist = a.skill >= 1, needPart = this.rng() < 0.4 || (sev && (j.sys === 'reactor' || j.sys === 'eps') && !specialist);
    if (needPart) { const part = S.sys[j.sys].faults.at(-1)?.part || SYS[j.sys].parts[0]; j.state = 'part'; j.needs = 'part'; j.t = this.r(40, 70); j.progress = j.need * 0.6; this.stats.parts++; this.say(a.person, `Need a ${part.replace(/ ×\d+$/, '').toLowerCase()} from Stores. Can someone fetch it?`, { priority: 'routine' }); this.emit({ type: 'part', sys: j.sys, who: a.person.short, part }); }
    else { j.progress = j.need * 0.5; this.say(a.person, "That didn't take. Going again.", { priority: 'routine', local: true }); }
  }
  // the player brought the part (conversation 'give'): resolves a NEEDS_PART at once
  deliverPart(sys) { const j = this.jobs.get(sys); if (!j || j.state !== 'part') return false; j.t = 0; return true; }
  escalate(j, why) {
    j.escalated = true; this.stats.escalated++; const h = this.head(j.dept) || j.lead?.person; if (h) this.say(h, `Bridge, ${h.short}. We can't get ${SYS[j.sys].name} back on our own (${why}). Requesting hands.`, { priority: 'urgent' });
    if (this.phases) this.phases.severity = Math.min(1, (this.phases.severity || 0) + 0.03);   // the ship noticing it cannot cope
    const ex = new Set(this._crew(j).map(a => a.person.id)), extra = this.pick(j, ex, { any: true }); if (extra && j.lead) this._enlist(j, extra, 'helper');
    if (!j.lead) { this.assign(j); } else { j.tries = 0; if (j.state === 'part') { j.t = Math.min(j.t, 10); } else if (j.state !== 'working') { /* keep going */ } else j.progress = Math.max(j.progress, j.need * 0.5); }
    this.emit({ type: 'escalate', sys: j.sys, why });
  }
  done(j) {
    const a = j.lead, hp = this.pace.npcHp ?? 0.85; j.state = 'done'; this.stats.done++;
    this.shipState.repair(j.sys, { hp, by: 'npc' }); this.phases?.onRepair?.(j.sys, { npc: true });
    if (this.duty?.ledger?.[j.sys] > 0) this.duty.ledger[j.sys] = Math.max(0, this.duty.ledger[j.sys] - 0.3);   // symptoms treated, not the neglect
    this.say(a.person, `Bridge, ${a.person.short}: ${SYS[j.sys].name} patched, holding at ${Math.round(hp * 100)}%. It wants a proper overhaul.`, { priority: 'routine' });
    this.emit({ type: 'done', sys: j.sys, who: a.person.short, id: a.person.id, secs: +(this.t - j.opened).toFixed(1), hp, helpers: j.helpers.length });
    this.finish(j);
  }
  abort(j, why) {
    if (j.state === 'done') return; const a = j.lead;
    if (a && ['travel', 'setup', 'working', 'part'].includes(j.state)) { this.stats.aborted++; this.say(a.person, 'Looks like someone beat me to it.', { priority: 'routine', local: true }); if (this.duty && this.duty._bump) this.duty._bump(a.person, 0.02); }
    this.emit({ type: 'abort', sys: j.sys, why, who: a?.person.short || null }); this.finish(j);
  }
  finish(j) { for (const a of this._crew(j)) { this._release(j, a); if (a.person.activity === 'repairing') a.person.activity = null; } this.jobs.delete(j.sys); }

  // ---- player agency
  assist(sys, dt = 0) {
    const j = this.jobs.get(sys); if (!j || j.state !== 'working') return false; j.assist += 1;
    if (!j.assisted) { j.assisted = true; this.stats.assists++; this.say(j.lead.person, 'Hold that for me, sir.', { priority: 'routine', local: true }); this.duty?._bump?.(j.lead.person, 0.04); }
    return true;
  }
  // order someone to a fault (talk menu / terminal): priority 2, the player's trust rules decide (subordinates always)
  order(person, sys) {
    if (this.shipState.status(sys) === 'nominal') return { ok: false, why: `${SYS[sys].name} is nominal.` };
    if (this.busy.has(person.id) && this.busy.get(person.id) !== sys) return { ok: false, why: `${person.short} is already on a repair.` };
    if (this.duty && !this.duty.subs?.().includes(person)) { const w = this.duty.willObey(person); if (w.roll > w.p) return { ok: false, refused: true, why: `${person.short}: "Not my system, sir. Ask ${DEPT[SYS[sys].dept].name}."` }; }
    const j = this.jobs.get(sys) || this.open(sys, 'order'); if (!j) return { ok: false, why: 'no site' };
    this.assign(j, person, { byPlayer: true }); return { ok: true, job: j };
  }
  request(sys) { const j = this.jobs.get(sys) || this.open(sys, 'radio'); if (j && j.state === 'notice') j.t = 0; return !!j; }

  // ---- what the game shows
  jobOf(person) { const sys = this.busy.get(person.id); const j = sys && this.jobs.get(sys); if (!j) return null; const a = this._crew(j).find(x => x.person === person); return { sys, state: j.state, role: a?.role, progress: j.need ? Math.min(1, j.progress / j.need) : 0, need: j.need, site: j.site, urgent: this.isUrgent(sys), tool: a?.tool || null, main: j.site.main, suspended: a ? this.suspended(a) : false }; }
  workingOn(sys) { const j = this.jobs.get(sys); return !!j && j.state === 'working'; }
  hudNote(sys) {
    const j = this.jobs.get(sys); if (!j) return ''; const n = j.lead?.person.short;
    if (j.state === 'notice') return 'noticed'; if (j.state === 'unassigned') return 'nobody assigned';
    if (j.state === 'travel') return `${n} en route`; if (j.state === 'setup') return `${n} setting up`;
    if (j.state === 'working') return `${n} working ${Math.round(Math.min(1, j.progress / j.need) * 100)}%`; if (j.state === 'part') return `${n} needs a part`; return '';
  }
  rows() {
    return [...this.jobs.values()].filter(j => j.lead).map(j => ({ kind: 'repair', id: 'r-' + j.sys, label: `${j.lead.person.family}: ${SYS[j.sys].name}`, room: `deck ${j.site.deckNo}`, status: j.state === 'working' || j.state === 'setup' ? 'doing' : j.state === 'part' ? 'needs' : 'enroute', eta: 0, left: j.state === 'working' ? Math.max(0, j.need - j.progress) : 0, total: j.state === 'working' ? j.need : 0, who: j.lead.person.id, sys: j.sys }));
  }
  markers() { return [...this.jobs.values()].flatMap(j => this._crew(j).map(a => ({ person: a.person, sys: j.sys, role: a.role, state: j.state, progress: j.need ? Math.min(1, j.progress / j.need) : 0 }))); }
  status() { return { jobs: [...this.jobs.values()].map(j => ({ sys: j.sys, state: j.state, lead: j.lead?.person.short || null, pct: j.need ? Math.round(j.progress / j.need * 100) : 0 })), ...this.stats }; }
}
