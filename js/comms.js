// Comm bus + crew <-> bridge simulation. Pure logic, no three.js, no DOM; time only moves through tick(dt), so for one seed
// the same sequence of ticks always produces the same log (tools/test.mjs relies on that).
//   CommBus     send({from,to,text,priority,channel,deck}), ring-buffered log, on('msg', fn)
//   CommsSim    drives the traffic from data/comms.json (built by tools/build-comms.mjs): run-start brief, status checks,
//               orders, watch changes, ship faults, alert raise/clear waves, and the player's comm badge (radio menu)
import { mulberry32 } from './data.js';
import { SYS, DEPT, RANK_SHORT } from './crew.js';
import { ALERTS } from './alerts.js';
import { hash } from './clock.js';
import { party, SYSTEM_PARTY, STATION_OF } from './bridge.js';

export const BRIDGE_PARTY = { id: 'bridge', short: 'Bridge', title: 'Bridge', billet: 'bridge', dept: 'command', rank: 9, group: true };
export const ALL_PARTY = { id: 'all', short: 'All hands', title: 'All hands', billet: 'all', group: true };
const PRI = { routine: 0, urgent: 1, emergency: 2 };
const HEADS = ['co', 'xo', 'cfo', 'ops', 'ce', 'cos', 'cso', 'cmo', 'qm'];   // department heads (command first)

export class CommBus {
  constructor({ max = 240 } = {}) { this.log = []; this.max = max; this.nextId = 1; this.t = 0; this.handlers = []; this.hour = 0; }
  on(ev, fn) { if (ev !== 'msg') throw new Error('CommBus only emits msg'); this.handlers.push(fn); return () => { this.handlers = this.handlers.filter(f => f !== fn); }; }
  send(m) {
    const norm = (x) => typeof x === 'string' ? { short: x, title: x, billet: x } : (x || null);
    const msg = { id: this.nextId++, t: this.t, hour: this.hour, from: norm(m.from), to: norm(m.to), text: m.text, priority: PRI[m.priority] != null ? m.priority : 'routine', channel: m.channel || 'comm', deck: m.deck ?? null, kind: m.kind || 'msg', alert: m.alert || null, re: m.re || null, station: m.station || null, sysName: m.sysName || null };
    this.log.push(msg); if (this.log.length > this.max) this.log.shift();
    for (const f of this.handlers) f(msg, this);
    return msg;
  }
  recent(n = 20) { return this.log.slice(-n); }
}

export function makePlayerStub() {
  return { id: 'player', given: 'Sam', family: 'Vale', rank: 1, title: 'Crew member', billet: 'player', dept: 'operations', short: `${RANK_SHORT[1]} Vale`, full: 'Ensign Sam Vale', status: 'alive', stub: true };
}

export class CommsSim {
  constructor({ bus, alerts, bridge, clock, data, roster, shipState = null, seed = 1, mission = 'quiet_watch', player = null, checkEvery = 90, orderEvery = 170 }) {
    Object.assign(this, { bus, alerts, bridge, clock, data, roster, shipState, seed, mission, checkEvery, orderEvery });
    this.t = 0; this.q = []; this.seq = 0; this.rnd = mulberry32(hash('commsim', seed)); this.player = player || makePlayerStub();
    this.cCheck = 0; this.nCheck = 20; this.nOrder = 100; this.nAuto = 1; this.lastSys = {}; this.started = false; this.stats = { sent: 0, alertWaves: 0, unmanned: 0 };
    alerts.on('raise', (a) => this.onRaise(a)); alerts.on('clear', (a) => this.onClear(a));
    shipState?.on?.((ev) => this.onShip(ev));
    bus.on('msg', () => { this.stats.sent++; });
  }
  setPlayer(p) { this.player = p; }
  // ---- plumbing
  after(delay, fn) { this.q.push({ at: this.t + delay, seq: this.seq++, fn }); }
  say(m) { return this.bus.send(m); }
  sayPlan(plan, extra = {}) { for (const { delay, msg } of plan) this.after(delay, () => this.say({ ...msg, ...extra })); return plan.reduce((a, p) => Math.max(a, p.delay), 0); }
  rr() { return this.rnd(); }
  alive(billet) { return this.roster.people.filter(p => p.billet === billet && !['dead', 'corpse', 'crazed', 'evacuated'].includes(p.status)); }
  one(billet) { return this.alive(billet)[0] || null; }
  heads() { return HEADS.map(b => this.one(b)).filter(Boolean); }
  // heads who are not standing on the bridge right now (those on the bridge talk in person, not by comm)
  remoteHeads() { const on = new Set(this.bridge.whoIsOnBridge().occupants.map(o => o.person.id)), h = this.heads().filter(p => p.billet !== 'co'), r = h.filter(p => !on.has(p.id)); return r.length ? r : h; }
  profile(p) { return this.data?.billets?.[p.billet] || null; }
  phase() {
    const f = this.shipState?.faulted().length || 0, top = this.alerts.top()?.def.severity || 0;
    return this.alerts.has('abandon_ship') || f >= 6 ? 'collapse' : top >= 4 || f >= 4 ? 'crisis' : top >= 2 || f >= 2 ? 'degraded' : top >= 1 || f >= 1 ? 'anomalies' : 'nominal';
  }
  ctx() { return { phase: this.phase(), alert: this.alerts.top() }; }
  toBridge(person, text, priority = 'routine', o = {}) { return { from: party(person), to: BRIDGE_PARTY, text, priority, channel: 'comm', ...o }; }
  // a crew message to the bridge, then the bridge's reply (if any)
  callBridge(person, text, priority, o = {}) { const m = this.say(this.toBridge(person, text, priority, o)); this.sayPlan(this.bridge.respond(m, this.ctx())); return m; }

  // ---- clock
  tick(dt) {
    this.t += dt; this.bus.t = this.t; this.alerts.tick(dt);
    const b = this.clock.advance(dt); this.bus.hour = this.clock.hour;
    if (b != null) this.say(this.bridge.watchChange(b));
    if (!this.started) { this.started = true; this.after(1.5, () => this.runStart()); }
    if (this.shipState && (this.nAuto -= dt) <= 0) { this.nAuto = 1; this.alerts.autoFromShip(this.shipState); }
    if (this.q.length < 24) {   // keep the chatter readable: no new routine traffic while the queue is busy
      if ((this.nCheck -= dt) <= 0) { this.nCheck = this.checkEvery * (0.85 + this.rr() * 0.3); this.routineCheck(); }
      if ((this.nOrder -= dt) <= 0) { this.nOrder = this.orderEvery * (0.85 + this.rr() * 0.3); this.routineOrder(); }
    }
    for (let guard = 0; guard < 200; guard++) {
      let bi = -1; for (let i = 0; i < this.q.length; i++) if (this.q[i].at <= this.t && (bi < 0 || this.q[i].at < this.q[bi].at || (this.q[i].at === this.q[bi].at && this.q[i].seq < this.q[bi].seq))) bi = i;
      if (bi < 0) break; const [ev] = this.q.splice(bi, 1); ev.fn();
    }
  }
  // ---- run start: mission announcement, then the department heads report ready
  runStart() {
    let d = 0;
    for (const m of this.bridge.missionAnnouncement(this.mission)) { this.after(m.after || 0, () => this.say(m)); d = Math.max(d, m.after || 0); }
    const heads = this.remoteHeads().slice(0, 5);
    heads.forEach((h, i) => this.after(d + 3 + i * 1.8 + this.rr() * 0.6, () => {
      const c = this.profile(h)?.to.find(x => x.k === 'start' && x.to === 'bridge'), text = c ? c.m : `Bridge, ${h.title}. ${DEPT[h.dept].name} is ready for the watch.`;
      if (i === 0) this.callBridge(h, text, 'routine', { kind: 'ready' }); else this.say(this.toBridge(h, text, 'routine', { kind: 'ready' }));
    }));
  }
  // ---- periodic traffic
  routineCheck() {
    const heads = this.remoteHeads(); if (!heads.length) return;
    const h = heads[this.cCheck % heads.length], even = this.cCheck++ % 2 === 0;
    const reply = this.checkInLine(h);
    if (even) { const m = this.bridge.statusCheck(h); if (!m) return; this.say(m); this.after(2.5 + this.rr() * 2, () => this.callBridge(h, reply.text, reply.priority, { kind: 'checkin', sysName: reply.sysName })); }
    else this.callBridge(h, reply.text, reply.priority, { kind: 'checkin', sysName: reply.sysName });
  }
  // what a department head says on a status check: a fault line if one of their systems is not nominal, else a routine one
  checkInLine(h) {
    const prof = this.profile(h), bad = this.shipState?.faulted().filter(s => s.dept === h.dept)[0];
    if (bad) { const c = prof?.to.find(x => x.sys === bad.id); return { text: c ? c.m : `Bridge, ${h.title}. ${bad.name} is ${this.shipState.status(bad.id)}.`, priority: this.shipState.status(bad.id) === 'offline' ? 'urgent' : 'routine', sysName: bad.name }; }
    const routine = (prof?.to || []).filter(x => x.k === 'checkin' && x.to === 'bridge');
    if (routine.length) { const c = routine[Math.floor(this.rr() * routine.length)]; return { text: c.m, priority: 'routine' }; }
    return { text: `Bridge, ${h.title}. ${DEPT[h.dept].name} reports all quiet.`, priority: 'routine' };
  }
  routineOrder() {
    const pool = [...this.heads().filter(p => p.billet !== 'co'), ...this.roster.people.filter(p => this.profile(p) && p.rank <= 2 && !HEADS.includes(p.billet) && p.status !== 'dead')];
    const p = this.rr() < 0.55 ? this.heads()[Math.floor(this.rr() * this.heads().length)] : pool[Math.floor(this.rr() * pool.length)]; if (!p || p.billet === 'co') return;
    const o = this.bridge.order(p); if (!o) return; this.say(o.msg);
    this.after(2 + this.rr() * 2.5, () => this.say({ from: party(p), to: o.msg.from, text: o.reply, priority: 'routine', channel: 'comm', kind: 'orderreply', re: null }));
  }
  // ---- ship system changes
  onShip(ev) {
    if (!this.started || ev.quiet || (ev.type !== 'fault' && ev.type !== 'repair')) return;
    const id = ev.id, last = this.lastSys[id]; if (last != null && this.t - last < 12) return; this.lastSys[id] = this.t;
    const def = SYS[id], cands = this.roster.people.filter(p => p.dept === def.dept && !['dead', 'corpse', 'crazed', 'evacuated'].includes(p.status));
    const withCall = cands.filter(p => this.profile(p)?.to.some(x => x.sys === id)).sort((a, b) => b.rank - a.rank || a.id - b.id), p = withCall[0] || cands.sort((a, b) => b.rank - a.rank || a.id - b.id)[0]; if (!p) return;
    this.after(1.2 + this.rr() * 2, () => {
      if (ev.type === 'repair') return void this.say(this.toBridge(p, `Bridge, ${p.title}. ${def.name} is back online.`, 'routine', { kind: 'repair', sysName: def.name }));
      const c = this.profile(p)?.to.find(x => x.sys === id), offline = this.shipState?.status(id) === 'offline';
      this.callBridge(p, c && !(offline && c.p === 'r') ? c.m : `Bridge, ${p.title}. ${def.name} is ${this.shipState?.status(id) || ev.status}${ev.part ? ': ' + ev.part : ''}.`, offline ? 'urgent' : 'routine', { kind: 'fault', sysName: def.name });
    });
  }
  // ---- alerts: PA, the bridge's own order, then crew responses staggered by priority (dept heads first)
  onRaise(a) {
    const def = a.def, where = a.scope === 'deck' && a.deck != null ? ` Deck ${a.deck + 1}.` : '', pri = def.severity >= 3 ? 'emergency' : 'urgent', manned = this.bridge.manned;
    this.stats.alertWaves++;
    this.say({ from: SYSTEM_PARTY, to: ALL_PARTY, text: def.pa + where, priority: pri, channel: 'pa', alert: def.id, kind: 'alertpa', deck: a.deck });
    const s = manned ? this.bridge.speaker() : null;
    let spoke = null;
    if (s) { spoke = s; const own = this.profile(s)?.al[def.id]; this.after(1.1, () => this.say({ from: party(s), to: ALL_PARTY, text: own?.l || `All stations, ${def.label.toLowerCase()}. Report to your posts.`, priority: pri, channel: 'comm', alert: def.id, kind: 'alertorder', deck: a.deck })); }
    else this.after(1.1, () => this.say({ from: SYSTEM_PARTY, to: ALL_PARTY, text: 'Bridge unmanned: alert broadcast automatically by the computer.', priority: 'urgent', channel: 'comm', alert: def.id, kind: 'unmanned' }));
    const heads = new Set(HEADS);
    const cands = [];
    for (const [billet, prof] of Object.entries(this.data.billets)) {
      const r = prof.al[def.id]; if (!r) continue; const p = this.one(billet); if (!p || p === spoke) continue;
      cands.push({ p, r, order: [heads.has(billet) ? 0 : 1, r.p, -p.rank, HEADS.indexOf(billet) < 0 ? 99 : HEADS.indexOf(billet), billet] });
    }
    cands.sort((x, y) => { for (let i = 0; i < 4; i++) if (x.order[i] !== y.order[i]) return x.order[i] - y.order[i]; return x.order[4] < y.order[4] ? -1 : 1; });
    const chosen = cands.slice(0, 10);
    chosen.forEach((c, i) => {
      const at = 2.4 + i * 1.5 + (i >= 6 ? 3 : 0) + this.rr() * 0.7;   // first six within ~11 s, the rest after a gap
      this.after(at, () => {
        if (!this.alerts.has(def.id)) return;   // cleared meanwhile
        const m = this.say(this.toBridge(c.p, c.r.l, pri, { kind: 'alertresp', alert: def.id, deck: a.deck }));
        if (manned ? i < 3 : i === 0) this.sayPlan(this.bridge.respond({ ...m, alert: def.id }, this.ctx()));
      });
    });
    if (manned && chosen.length) this.after(2.4 + 6 * 1.5 + 5, () => { if (this.alerts.has(def.id) && this.bridge.manned) { const sp = this.bridge.speaker(); this.say({ from: party(sp), to: ALL_PARTY, text: `${Math.min(chosen.length, 10)} stations reporting. Maintain ${def.label.toLowerCase()} until further notice.`, priority: 'routine', channel: 'comm', alert: def.id, kind: 'alertsummary' }); } });
  }
  onClear(a) {
    const def = a.def, nxt = this.alerts.condition();
    this.say({ from: SYSTEM_PARTY, to: ALL_PARTY, text: `${def.label} cleared. ${nxt.id === 'nominal' ? ALERTS.nominal.pa : nxt.label + ' remains in effect.'}`, priority: 'routine', channel: 'pa', alert: def.id, kind: 'alertclear' });
    if (this.bridge.manned) { const s = this.bridge.speaker(); this.after(1.2, () => this.say({ from: party(s), to: ALL_PARTY, text: `Stand down from ${def.label.toLowerCase()}. Resume normal watch.`, priority: 'routine', channel: 'comm', alert: def.id, kind: 'alertclear' })); }
    this.remoteHeads().slice(0, 3).forEach((p, i) => this.after(2.8 + i * 1.6 + this.rr() * 0.5, () => this.say(this.toBridge(p, `Bridge, ${DEPT[p.dept].name}. Standing down from ${def.label.toLowerCase()}, stations secure.`, 'routine', { kind: 'alertclear', alert: def.id }))));
  }

  // ---- player comm badge (a radio menu; the player is a stub crew member until the billet system exists)
  playerOptions(level = 'top') {
    if (level === 'dept') return this.heads().filter(p => p.billet !== 'co').map((p, i) => ({ key: String(i + 1), id: 'dept', arg: p.billet, label: `${p.title} (${DEPT[p.dept].name})` }));
    return [{ key: '1', id: 'bridge', label: 'Hail the bridge' }, { key: '2', id: 'dept_menu', label: 'Hail a department head' }, { key: '3', id: 'status', label: 'Report status' }, { key: '4', id: 'assist', label: 'Request assistance' }, { key: '5', id: 'fault', label: 'Report a fault' }, { key: '6', id: 'orders', label: 'Ask for orders' }];
  }
  playerChoose(id, arg = null) {
    const pl = this.player, me = party(pl), top = this.alerts.top(), deckTxt = this.deck != null ? ` on Deck ${this.deck + 1}` : '';
    const send = (text, kind, o = {}) => this.say({ from: me, to: BRIDGE_PARTY, text: `Bridge, ${pl.short}. ${text}`, priority: o.priority || (top && top.def.severity >= 3 ? 'urgent' : 'routine'), channel: 'comm', kind, ...o });
    if (id === 'bridge') { const m = send('Requesting a moment.', 'hail'); this.sayPlan(this.bridge.respond(m, this.ctx())); return m; }
    if (id === 'status') {
      const m = send(top ? `Reporting in. I am safe and standing by under ${top.def.label.toLowerCase()}.` : `Reporting in${deckTxt}. All quiet.`, 'report'); const plan = this.bridge.respond({ ...m, kind: 'report' }, this.ctx());
      if (top && this.bridge.manned) this.after(Math.max(...plan.map(p => p.delay)) + 2, () => this.say({ from: plan[0].msg.from, to: me, text: `${top.def.label}: ${top.def.doThis}`, priority: 'routine', channel: 'comm', kind: 'orders' })); this.sayPlan(plan); return m;
    }
    if (id === 'fault') {
      const f = (this.shipState?.faulted() || []).sort((x, y) => this.shipState.hp(x.id) - this.shipState.hp(y.id))[0];
      const m = send(f ? `I am reporting a fault: ${f.name}.` : 'I am reporting a possible fault on my deck.', 'fault', { sysName: f?.name || null, priority: f && this.shipState.status(f.id) === 'offline' ? 'urgent' : 'routine' });
      const plan = this.bridge.respond(m, this.ctx()), last = Math.max(...plan.map(p => p.delay)); this.sayPlan(plan);
      if (this.bridge.manned) {
        const r = plan[0].msg.from;
        if (f) { const head = this.roster.people.filter(p => p.dept === f.dept && p.status !== 'dead').sort((a, b) => b.rank - a.rank)[0]; this.after(last + 2, () => this.say({ from: r, to: me, text: `Confirmed: ${f.name} is ${this.shipState.status(f.id)}. ${head ? head.short + ' is sending a team.' : 'Damage control is on the way.'}`, priority: 'routine', channel: 'comm', kind: 'faultack', sysName: f.name })); }
        else this.after(last + 2, () => this.say({ from: r, to: me, text: 'Sensors show nothing on that report, but we will have a team check it. Thank you for calling it in.', priority: 'routine', channel: 'comm', kind: 'faultack' }));
      }
      return m;
    }
    if (id === 'orders') {
      const m = send('Do you have orders for me?', 'request'), plan = this.bridge.respond(m, this.ctx()); this.sayPlan(plan);
      if (this.bridge.manned) { const f = this.shipState?.faulted()[0]; this.after(Math.max(...plan.map(p => p.delay)) + 2, () => this.say({ from: plan[0].msg.from, to: me, text: top ? `${top.def.label}: ${top.def.doThis}` : f ? `Nothing formal. ${f.name} has a fault; give the repair crew a hand if you are near.` : 'No new orders. Carry on with your duties.', priority: 'routine', channel: 'comm', kind: 'orders' })); }
      return m;
    }
    if (id === 'assist') {
      const m = send('Requesting assistance.', 'request', { priority: 'urgent' }), plan = this.bridge.respond(m, this.ctx()), last = Math.max(...plan.map(p => p.delay)); this.sayPlan(plan);
      if (this.bridge.manned) {
        const want = top?.id === 'intruder' ? 'sec' : ['fire', 'hull_breach'].includes(top?.id) ? 'dc' : ['medical_emergency', 'contamination'].includes(top?.id) ? 'nurse' : 'dc', p = this.one(want) || this.one('dc');
        if (p) { this.after(last + 2, () => this.say({ from: plan[0].msg.from, to: party(p), text: `${p.short}, Bridge. ${pl.short} needs assistance. Respond.`, priority: 'urgent', channel: 'comm', kind: 'order' })); this.after(last + 5, () => this.say({ from: party(p), to: me, text: 'On my way, stand by where you are.', priority: 'urgent', channel: 'comm', kind: 'orderreply' })); }
      }
      return m;
    }
    if (id === 'dept') {
      const h = this.one(arg); if (!h) return null;
      const m = this.say({ from: me, to: party(h), text: `${h.title}, ${pl.short}. Have you got a minute?`, priority: 'routine', channel: 'comm', kind: 'hail' });
      const b = this.profile(h)?.bark, pool = top && b?.alert?.length ? b.alert : h.rank < pl.rank ? b?.greetHi : h.rank > pl.rank ? b?.greetLo : b?.greet, lines = pool?.length ? pool : b?.greet;
      this.after(2 + this.rr(), () => this.say({ from: party(h), to: me, text: lines?.length ? lines[Math.floor(this.rr() * lines.length)] : 'Go ahead.', priority: 'routine', channel: 'comm', kind: 'reply', re: m.id }));
      return m;
    }
    return null;
  }
}

export { STATION_OF };
