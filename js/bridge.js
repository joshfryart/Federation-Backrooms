// The bridge as a responsive place. Pure logic, no three.js, no DOM, no timers: functions return *plans*
// ([{ delay, msg }], delay in sim seconds) that the comm simulation (js/comms.js) schedules, so it stays deterministic.
//   whoIsOnBridge(roster, clock, data)   who stands which bridge station right now (from each person's daily_template)
//   Bridge.respond(msg)                  best present responder acknowledges a message, or the honest "bridge unmanned" path
//   Bridge.*                             the bridge originates traffic: mission announcement, status checks, orders, watch changes
import { DEPT, RANK_SHORT } from './crew.js';
import { hash01 } from './clock.js';

export const STATION_OF = { co: 'chair', xo: 'xo', helm: 'helm', nav: 'nav', comms: 'comms', ops: 'ops', sensor: 'sensors' };
export const STATION_LABEL = { chair: 'Command chair', xo: 'First officer', helm: 'Helm', nav: 'Navigation', comms: 'Communications', ops: 'Operations', sensors: 'Sensors', extra: 'Bridge' };
export const SYSTEM_PARTY = { id: 'ship', short: 'Ship Computer', title: 'Ship Computer', billet: 'computer', dept: null, rank: 9, system: true };
// who answers hails / who speaks for the bridge (first present wins)
const RESPONDER_ORDER = ['comms', 'xo', 'ops', 'helm', 'chair', 'nav', 'sensors'];
const SPEAKER_ORDER = ['chair', 'xo', 'ops', 'comms', 'helm', 'nav', 'sensors'];
export const REPLY_DELAY = { routine: 3.2, urgent: 1.6, emergency: 0.7 };
const DEAD = new Set(['dead', 'corpse', 'crazed', 'evacuated']);
export const MISSIONS = {
  quiet_watch: 'a quiet patrol watch, keeping the ship in good order and on schedule',
  survey: 'a survey of the sector, with sensors, charts and a steady course',
  cargo_run: 'a cargo run, securing the holds and keeping to the delivery window',
  medical_relief: 'a medical relief run, with sickbay and stores at full readiness',
  shakedown: 'a shakedown cruise, testing every system and logging every defect',
};

export const party = (p) => p ? { id: p.id, short: p.short, title: p.title, billet: p.billet, dept: p.dept, rank: p.rank, rankShort: RANK_SHORT[p.rank], name: p.full || p.short } : null;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const deptName = (p) => (p && DEPT[p.dept]?.name) || 'crew';

export function whoIsOnBridge(roster, clock, data, seed = 1) {
  const occupants = [], bySt = {}, readyRoom = [];
  for (const p of roster.people) {
    if (DEAD.has(p.status) || p.billet === 'player') continue;
    const day = data?.billets?.[p.billet]?.day; if (!day) continue;
    const h = clock.localHour(p), b = day.find(x => h >= x[0] && h < x[1]); if (!b) continue;
    let room = b[2];
    if (p.billet === 'co' && room === 'bridge' && b[3] !== 'readyroom' && hash01('readyroom', seed, Math.floor(clock.hour * 4)) < 0.2) room = 'readyroom';   // the captain steps into the ready room now and then
    if (room === 'bridge' && b[3] === 'readyroom') room = 'readyroom';
    if (room === 'readyroom') { readyRoom.push(p); continue; }
    if (room !== 'bridge') continue;
    const st = STATION_OF[p.billet] || 'extra'; occupants.push({ person: p, station: st }); if (!bySt[st]) bySt[st] = p;
  }
  const watch = clock.dutyWatch;
  const onDuty = roster.people.filter(p => p.watch === watch && !DEAD.has(p.status) && p.billet !== 'player' && !occupants.some(o => o.person === p));
  const duty = onDuty.sort((a, b) => b.rank - a.rank || a.id - b.id)[0] || null;   // the senior officer on watch, wherever they are
  const senior = occupants.map(o => o.person).sort((a, b) => b.rank - a.rank || a.id - b.id)[0] || null;
  return { occupants, bySt, manned: occupants.length > 0, readyRoom, duty, senior, hour: clock.hour };
}

export class Bridge {
  constructor({ roster, clock, data, seed = 1 }) { this.roster = roster; this.clock = clock; this.data = data; this.seed = seed; this.n = 0; }
  // `without`: a person id to leave out (the caller on a comm line is not answering themselves)
  whoIsOnBridge(without = null) {
    const w = whoIsOnBridge(this.roster, this.clock, this.data, this.seed); if (without == null || !w.occupants.some(o => o.person.id === without)) return w;
    const occ = w.occupants.filter(o => o.person.id !== without), bySt = {}; for (const o of occ) if (!bySt[o.station]) bySt[o.station] = o.person;
    return { ...w, occupants: occ, bySt, manned: occ.length > 0, senior: occ.map(o => o.person).sort((a, b) => b.rank - a.rank || a.id - b.id)[0] || null };
  }
  get manned() { return this.whoIsOnBridge().manned; }
  _pick(w, order) { for (const st of order) if (w.bySt[st]) return w.bySt[st]; return w.senior; }
  responder(w = this.whoIsOnBridge()) { return this._pick(w, RESPONDER_ORDER); }
  speaker(w = this.whoIsOnBridge()) { return this._pick(w, SPEAKER_ORDER); }
  _r(...k) { return hash01('bridge', this.seed, ++this.n, ...k); }

  // Acknowledge `msg` ({ from, to, text, priority, channel, kind, sys, alert }). Returns [{ delay, msg }].
  respond(msg, ctx = {}) {
    const w = this.whoIsOnBridge(msg.from?.id), prio = msg.priority || 'routine', jit = this._r('d') * 0.9, base = (REPLY_DELAY[prio] ?? 3) + jit;
    const to = msg.from, sender = to?.short || 'caller';
    if (w.manned) {
      const r = this.responder(w), p = party(r), phaseLine = this._flavour(r, prio, ctx);
      return [{ delay: base, msg: { from: p, to, text: this._ackText(msg, sender, r) + (phaseLine ? ' ' + phaseLine : ''), priority: prio, channel: msg.channel === 'pa' ? 'comm' : (msg.channel || 'comm'), kind: 'ack', alert: msg.alert || null, station: STATION_OF[r.billet] || 'extra', re: msg.id } }];
    }
    // nobody on the bridge: say so, then route to the ready room or the duty officer
    const plan = [{ delay: 1 + jit * 0.5, msg: { from: SYSTEM_PARTY, to, text: 'No response — bridge unmanned.', priority: 'routine', channel: 'comm', kind: 'unmanned', re: msg.id } }];
    const rr = w.readyRoom[0];
    if (rr) plan.push({ delay: 6 + jit, msg: { from: party(rr), to, text: `Ready room, ${rr.short} here. Bridge is unmanned. I have your message, ${sender}. ${this._ackText(msg, sender, rr, true)}`, priority: prio, channel: 'comm', kind: 'routed', re: msg.id } });
    else if (w.duty) plan.push({ delay: 8 + jit, msg: { from: party(w.duty), to, text: `Duty officer, ${w.duty.short}. Nobody is on the bridge. I have your message, ${sender}. ${this._ackText(msg, sender, w.duty, true)}`, priority: prio, channel: 'comm', kind: 'routed', re: msg.id } });
    else plan.push({ delay: 10, msg: { from: SYSTEM_PARTY, to, text: 'No response from the ready room or the duty officer. Message logged.', priority: 'routine', channel: 'comm', kind: 'unmanned', re: msg.id } });
    return plan;
  }
  _flavour(r, prio, ctx) {
    if (prio === 'routine' || !['co', 'xo'].includes(r.billet) || this._r('f') > 0.45) return '';
    const lines = this.data?.billets?.[r.billet]?.ph?.[ctx.phase || 'nominal']; return lines?.length ? lines[Math.floor(this._r('l') * lines.length)] : '';
  }
  _ackText(msg, sender, r, routed = false) {
    const dn = deptName(msg.from), sys = msg.sysName, k = msg.kind || 'report', pick = (a) => a[Math.floor(this._r('t') * a.length)];
    if (msg.alert) return pick([`Acknowledged, ${dn}. Maintain your alert posture.`, `${cap(dn)}, Bridge copies. Hold your station.`, `Bridge copies, ${sender}. Keep reports coming.`]);
    if (k === 'fault') return pick([`${cap(dn)}, Bridge copies${sys ? ' ' + sys : ''}. ${routed ? 'I will pass it to the bridge.' : 'Do what you can; keep us posted.'}`, `Understood${sys ? ', ' + sys : ''}. ${routed ? 'Passing it on.' : 'Repair teams will back you up.'}`]);
    if (k === 'hail') return pick([`Go ahead, ${sender}.`, `${sender}, Bridge. Go ahead.`, `Bridge here. Go ahead, ${sender}.`]);
    if (msg.priority === 'emergency') return pick([`Understood, ${sender}. All stations alerted.`, `Copy, ${sender}. Help is on the way.`]);
    if (msg.priority === 'urgent') return pick([`Copy that, ${sender}. We are on it.`, `Understood, ${sender}. Stand by for orders.`]);
    return pick([`Acknowledged, ${sender}. Logged.`, `Bridge copies, ${sender}. Carry on.`, `Copy, ${sender}. Thank you.`]);
  }

  // ---- bridge-originated traffic: each returns messages (or null) rather than sending them
  // mission announcement at run start (PA). The captain's own "Run starts" line is used when they are there.
  missionAnnouncement(mission = 'quiet_watch') {
    const w = this.whoIsOnBridge(), s = this.speaker(w), text = MISSIONS[mission] || MISSIONS.quiet_watch;
    if (!w.manned || !s) return [{ from: SYSTEM_PARTY, to: { billet: 'all', short: 'All hands' }, text: `Mission brief posted: ${text}. The bridge is unmanned; ${w.duty ? 'duty officer ' + w.duty.short + ' has the watch' : 'no duty officer is available'}.`, priority: 'routine', channel: 'pa', kind: 'mission' }];
    const own = this.data?.billets?.[s.billet]?.to?.find(c => c.k === 'start');
    return [{ from: party(s), to: { billet: 'all', short: 'All hands' }, text: own ? own.m : `All hands, ${s.short} on the bridge.`, priority: 'routine', channel: 'pa', kind: 'mission' },
      { from: party(s), to: { billet: 'all', short: 'All hands' }, text: `Mission this watch: ${text}. All departments report ready.`, priority: 'routine', channel: 'pa', kind: 'mission', after: 2.2 }];
  }
  statusCheck(head) {
    const w = this.whoIsOnBridge(head.id), s = this.speaker(w); if (!w.manned || !s) return null;
    return { from: party(s), to: party(head), text: `${head.title}, Bridge. Status report, please.`, priority: 'routine', channel: 'comm', kind: 'statuscheck' };
  }
  // an order to `person`, taken from their own calls_from_bridge; returns { msg, reply, minutes, refuses } or null
  order(person) {
    const w = this.whoIsOnBridge(), s = this.speaker(w), list = this.data?.billets?.[person.billet]?.from; if (!w.manned || !s || !list?.length) return null;
    const c = list[Math.floor(this._r('o') * list.length)], body = c.o.replace(/^[A-Za-z]+:\s*/, '').replace(/\.$/, '');
    return { msg: { from: party(s), to: party(person), text: `${person.short}, Bridge. ${cap(body)}.`, priority: 'routine', channel: 'comm', kind: 'order' }, reply: c.r, minutes: c.min, refuses: c.no || null };
  }
  watchChange(boundary) {
    const w = this.whoIsOnBridge(), s = this.speaker(w), name = ['alpha', 'beta', 'gamma'][Math.floor(boundary / 8) % 3];
    return { from: s ? party(s) : SYSTEM_PARTY, to: { billet: 'all', short: 'All hands' }, text: `Watch change: ${name} watch has the deck. Outgoing watch, brief your reliefs.`, priority: 'routine', channel: 'pa', kind: 'watch' };
  }
}
