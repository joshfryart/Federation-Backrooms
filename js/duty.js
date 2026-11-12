// The player's billet, duty loops, duty-debt ledger, orders / delegation / reports, witness-and-belief model, mission task board.
// Pure logic (no three.js, no DOM). Data: assets/data/duties.json (node tools/build-duties.mjs).  Time: 1 ship minute = 10/3 real seconds
// (ShipClock), but duty loops are stretched (period = clamp(every_min*8, 90, 400) s) so a 20 minute run holds a handful of rounds.
//   pickBillet(roster, seed, forceBillet)  -> a random living crew member becomes the player
//   new Duty({ player, roster, clock, sim, duties, shipState, say, seed, mission })
//     .tick(dt)  .perform(loopId, quality)  .report(loopId, honest)  .order(person, loopId)  .delegate(person, loopId)
//     .board()   duty + task board rows for the HUD     .ledger / .debt / .chain / .trust(person)
import { hash, hash01 } from './clock.js';
import { RANK_SHORT } from './crew.js';

export const QUALITIES = ['proper', 'rushed', 'faked', 'skipped'];
export const Q_LABEL = { proper: 'Do it properly', rushed: 'Rush it', faked: 'Fake the log', skipped: 'Skip it' };
export const SHIP_SEC_PER_MIN = 10 / 3;
export const MISSION_ORDER = ['quiet_watch', 'survey', 'cargo_run', 'medical_relief', 'shakedown'];
const LIVE = (p) => p && !['dead', 'corpse', 'crazed', 'evacuated'].includes(p.status);

export function pickBillet(roster, seed, forceBillet = null) {
  const pool = roster.people.filter(p => LIVE(p) && p.billet !== 'player' && (!forceBillet || p.billet === forceBillet));
  const list = pool.length ? pool : roster.people.filter(LIVE);
  return list[hash('billet', seed) % list.length];
}
export function pickMission(seed) { return MISSION_ORDER[hash('mission', seed) % MISSION_ORDER.length]; }
export const subordinates = (roster, boss) => roster.people.filter(p => LIVE(p) && p !== boss && chainOf(roster, p).includes(boss.id));
export function chainOf(roster, p) { const out = []; let c = p, g = 0; while (c && c.reportsTo != null && g++ < 12) { out.push(c.reportsTo); c = roster.people[c.reportsTo]; } return out; }

export function briefing(player, roster, mission, duties, MISSIONS) {
  const d = duties.billets?.[player.billet], boss = player.reportsTo != null ? roster.people[player.reportsTo] : null, subs = subordinates(roster, player);
  return {
    name: player.full || player.short, title: player.title, rank: RANK_SHORT[player.rank], mission, missionText: MISSIONS?.[mission] || mission,
    role: d?.role || 'You keep the ship running.', boss: boss ? `${boss.short} (${boss.title})` : 'no one — you have the conn', subs: subs.length,
    loops: (d?.loops || []).map(l => l.label), tasks: (d?.tasks?.[mission] || []).map(t => `${Math.round(t.at)}:00  ${t.task}`),
    tempt: (d?.tempt || [])[0] || null, can: ['Do the job properly', 'Cut corners to save time', 'Fake the log', 'Skip it and hope nobody notices'],
  };
}

export class Duty {
  constructor({ player, roster, clock, sim = null, duties, shipState = null, say = () => {}, seed = 1, mission = 'quiet_watch' }) {
    Object.assign(this, { player, roster, clock, sim, duties, shipState, say, seed, mission });
    this.t = 0; this.place = { deckNo: 1, room: null }; this.busy = null; this.listeners = [];
    const d = duties.billets?.[player.billet] || { loops: [], tasks: {} };
    this.d = d;
    this.loops = d.loops.map((l, i) => ({ ...l, period: Math.min(400, Math.max(90, l.every * 8)), next: 30 + i * 20 + hash01('duty', seed, l.id) * 30, state: 'idle', done: 0, last: null }));
    this.tasks = (d.tasks[mission] || []).map((t, i) => ({ ...t, id: 't' + i, state: 'pending', at_s: t.at * 60, window: 240, by: null }));
    this.ledger = {}; this.debt = 0; this.entries = []; this.chain = []; this.score = 0; this.maxScore = 0; this.trustMap = new Map(); this.audit = 100; this.stats = { proper: 0, rushed: 0, faked: 0, skipped: 0, delegated: 0, orders: 0, refused: 0, caught: 0 };
    this.events = []; this.jobs = [];   // pending delegated / ordered jobs
  }
  on(fn) { this.listeners.push(fn); return this; }
  emit(ev) { this.events.push(ev); if (this.events.length > 60) this.events.shift(); for (const f of this.listeners) f(ev); }
  setPlace(deckNo, room) { this.place = { deckNo, room }; }
  trust(p) { return this.trustMap.get(p.id ?? p) ?? (0.5 + (hash01('trust', this.seed, p.id) - 0.5) * 0.2); }
  _bump(p, d) { const k = p.id; this.trustMap.set(k, Math.max(0, Math.min(1, this.trust(p) + d))); }
  get avgTrust() { const l = this.roster.people.filter(p => LIVE(p) && p !== this.player); return l.reduce((a, p) => a + this.trust(p), 0) / Math.max(1, l.length); }
  loop(id) { return this.loops.find(l => l.id === id); }
  status(l) { return l.state === 'doing' ? 'doing' : l.state === 'due' ? (this.t - l.dueAt > 60 ? 'overdue' : 'due') : 'idle'; }

  tick(dt) {
    this.t += dt;
    for (const l of this.loops) if (l.state === 'idle' && this.t >= l.next) { l.state = 'due'; l.dueAt = this.t; this.emit({ type: 'due', loop: l.id, label: l.label, room: l.room }); }
    for (const l of this.loops) if (l.state === 'due' && this.t - l.dueAt > l.period * 0.9) this._finish(l, 'skipped', { auto: true });   // never got to it: counts as a skip
    for (const t of this.tasks) {
      if (t.state === 'pending' && this.t >= t.at_s) { t.state = 'active'; this.emit({ type: 'task', task: t.task, id: t.id, room: t.room }); }
      else if (t.state === 'active' && this.t > t.at_s + t.window) { t.state = 'missed'; this.maxScore += 1; this.chain.push(`Missed task: ${t.task} — ${t.neglect}`); this.emit({ type: 'missed', task: t.task, neglect: t.neglect }); }
    }
    if (this.busy) { this.busy.left -= dt; if (this.place.room !== this.busy.loop.room && this.busy.loop.room !== 'any') { const l = this.busy.loop; this.busy = null; this._finish(l, 'skipped', { walkedOff: true }); } else if (this.busy.left <= 0) { const b = this.busy; this.busy = null; this._finish(b.loop, b.q); } }
    for (const j of this.jobs.slice()) { j.left -= dt; if (j.left <= 0) { this.jobs.splice(this.jobs.indexOf(j), 1); this._jobDone(j); } }
    this.audit -= dt; if (this.audit <= 0) { this.audit = 70 + hash01('audit', this.seed, Math.floor(this.t)) * 60; this._audit(); }
  }

  // Start a duty in the right room. quality: proper | rushed | faked | skipped (skipped and faked are instant / near-instant).
  perform(id, quality) {
    const l = this.loop(id); if (!l || l.state === 'doing') return { ok: false, why: 'busy' };
    if (l.state !== 'due' && l.state !== 'idle') return { ok: false, why: 'not due' };
    if (l.room !== this.place.room) return { ok: false, why: `Do this in the ${l.room}` };
    if (quality === 'skipped') { this._finish(l, 'skipped'); return { ok: true, secs: 0 }; }
    const secs = Math.max(2.5, l.dur * SHIP_SEC_PER_MIN * l.q[quality][0] * 1.2);
    l.state = 'doing'; this.busy = { loop: l, q: quality, left: secs, total: secs };
    this.emit({ type: 'start', loop: l.id, quality, secs }); return { ok: true, secs };
  }
  cancel() { if (this.busy) { const l = this.busy.loop; this.busy = null; this._finish(l, 'skipped', { cancelled: true }); } }

  _finish(l, q, opt = {}, by = null) {
    const debt = l.q[q][1] * (opt.scale || 1); l.state = 'idle'; l.next = this.t + l.period; l.done++; l.last = q; this._record(l, q, debt, by);
    if (!by) { this.stats[q]++; this.emit({ type: 'done', loop: l.id, label: l.label, quality: q, debt, auto: !!opt.auto }); this._witness(l, q); }
    return debt;
  }
  _record(l, q, debt, by) {
    const sys = l.sys || 'misc'; this.ledger[sys] = (this.ledger[sys] || 0) + debt; this.debt += debt;
    this.entries.push({ t: this.t, loop: l.id, label: l.label, q, debt, sys, by: by?.short || null, found: false });
    if (q === 'proper' && this.ledger[sys] > 0) this.ledger[sys] = Math.max(0, this.ledger[sys] - 0.5);
    this.maxScore += 1; this.score += { proper: 1, rushed: 0.55, faked: 0.2, skipped: 0 }[q];
    // neglect catches up with the ship: every 3 points of debt on a system damages it
    if (sys !== 'misc' && this.ledger[sys] >= 3 && this.shipState?.sys[sys]) {
      this.ledger[sys] -= 3; const ev = this.shipState.damage(sys, 0.3 + (this.ledger[sys] > 2 ? 0.2 : 0));
      const sources = this.entries.filter(e => e.sys === sys && e.debt > 0).slice(-3).map(e => `${e.label} (${e.q})`);
      this.chain.push(`${ev.name} ${ev.status}: neglected duty — ${sources.join(', ')}`); this.emit({ type: 'consequence', sys, status: ev.status, name: ev.name });
    }
  }
  // who saw you do it: everyone the sim has in your room, plus (for fakes) the crew who know the job
  _witness(l, q) {
    const here = this.sim ? this.sim.onDeck(this.place.deckNo).filter(o => o.room === this.place.room && o.person !== this.player) : [];
    for (const o of here) {
      const p = o.person, mine = p.dept === this.player.dept;
      if (q === 'proper') this._bump(p, mine ? 0.06 : 0.03);
      else if (q === 'rushed') this._bump(p, mine ? -0.03 : -0.01);
      else if ((q === 'faked' || q === 'skipped') && hash01('see', this.seed, p.id, Math.floor(this.t)) < (mine ? 0.55 : 0.25)) { this._bump(p, -0.18); this._caught(p, l, q); }
    }
  }
  _caught(p, l, q) {
    const key = q === 'faked' ? 'player_fakes_report' : 'player_neglects_duty', prose = this.duties.billets?.[p.billet]?.react?.[key];
    this.stats.caught++; const e = [...this.entries].reverse().find(x => x.loop === l.id); if (e) e.found = true;
    this.emit({ type: 'witness', who: p.short, text: prose || (q === 'faked' ? 'Saw the log was faked and said nothing — yet.' : 'Saw you skip it.'), loop: l.id, q });
    for (const o of this.roster.people) if (LIVE(o) && o !== p && o.dept === p.dept && hash01('gossip', this.seed, p.id, o.id) < 0.5) this._bump(o, -0.07);   // word gets round the department
    if (this.player.reportsTo != null && hash01('boss', this.seed, p.id, l.id) < 0.5) { const b = this.roster.people[this.player.reportsTo]; if (b && LIVE(b)) { this._bump(b, -0.15); this.chain.push(`${b.short} heard you ${q === 'faked' ? 'faked' : 'skipped'} "${l.label}"`); } }
  }
  // periodic audit: a supervisor checks the logs; undiscovered fakes are found when numbers do not match the system
  _audit() {
    const fakes = this.entries.filter(e => e.q === 'faked' && !e.found); if (!fakes.length) return; const e = fakes[0];
    const bad = e.sys !== 'misc' && this.shipState && this.shipState.status(e.sys) !== 'nominal';
    if (!bad && hash01('audit2', this.seed, e.t) > 0.35) return; e.found = true; this.stats.caught++;
    const boss = this.player.reportsTo != null ? this.roster.people[this.player.reportsTo] : null; if (boss) this._bump(boss, -0.25);
    for (const p of this.roster.people) if (LIVE(p) && p.dept === this.player.dept) this._bump(p, -0.08);
    this.chain.push(`Audit found "${e.label}" was faked${bad ? ' — and ' + e.sys + ' is failing' : ''}`);
    this.emit({ type: 'audit', label: e.label, who: boss?.short || 'The log audit', text: `${e.label}: the entry does not match the system${bad ? ' — and it is failing' : ''}.` });
  }

  // reports: honest or not. False reports raise trust now and cost far more when found out.
  report(id, honest = true) {
    const l = this.loop(id); if (!l) return null; const last = l.last, truthful = honest || last === 'proper';
    const text = (honest && last && last !== 'proper') ? `Bridge, ${this.player.short}. ${l.label}: I ${last === 'skipped' ? 'did not get to it' : 'cut it short'}.` : (l.report || `Bridge, ${this.player.short}. ${l.label} complete.`);
    if (!truthful) { const e = [...this.entries].reverse().find(x => x.loop === id); if (e) e.falseReport = true; for (const p of this.roster.people) if (LIVE(p) && p.dept === this.player.dept) this._bump(p, 0.01); }
    else if (honest && last && last !== 'proper') { const b = this.player.reportsTo != null ? this.roster.people[this.player.reportsTo] : null; if (b) this._bump(b, 0.04); }
    this.say({ from: this.player, text, kind: 'report', truthful, loop: id }); return { text, truthful };
  }

  // ---- orders and delegation
  subs() { return subordinates(this.roster, this.player); }
  willObey(p) {
    const diligent = (this.duties.billets?.[p.billet]?.traits || []).some(t => /diligent|punctual|careful|loyal|dutiful|formal|methodical/i.test(t)), lazy = (this.duties.billets?.[p.billet]?.traits || []).some(t => /lazy|cynical|rebel|slack|sarcastic|reluctant/i.test(t));
    const pr = 0.45 + (this.trust(p) - 0.5) * 0.9 + (diligent ? 0.15 : 0) - (lazy ? 0.2 : 0) + Math.max(0, this.player.rank - p.rank) * 0.04;
    return { p: Math.max(0.05, Math.min(0.97, pr)), roll: hash01('obey', this.seed, p.id, Math.floor(this.t / 5)) };
  }
  // order a subordinate to do one of *their* duty loops now (a task from the player's board is ordered by task id)
  order(p, jobId, { delegateOf = null } = {}) {
    const subs = this.subs(); if (!subs.includes(p)) return { ok: false, why: `${p.short} does not report to you` };
    const bl = this.duties.billets?.[p.billet]; const lp = (delegateOf ? this.loop(delegateOf) : null) || bl?.loops?.find(l => l.id === jobId) || bl?.loops?.[0]; if (!lp) return { ok: false, why: 'nothing to order' };
    const w = this.willObey(p); this.stats.orders++;
    if (w.roll > w.p) { this.stats.refused++; this._bump(p, -0.03); this.emit({ type: 'refused', who: p.short, text: `${p.short}: "${lp.label}? I've got my own work, ${RANK_SHORT[this.player.rank]}."` }); return { ok: false, refused: true }; }
    const rel = 0.55 + this.trust(p) * 0.4, q = hash01('q', this.seed, p.id, Math.floor(this.t)) < rel ? 'proper' : 'rushed';
    const job = { person: p, loop: lp, q, left: Math.max(6, lp.dur * SHIP_SEC_PER_MIN * 1.6), delegateOf }; this.jobs.push(job);
    this.emit({ type: 'ordered', who: p.short, label: lp.label, delegated: !!delegateOf }); return { ok: true, job };
  }
  delegate(p, loopId) {
    const l = this.loop(loopId); if (!l || l.state === 'doing') return { ok: false, why: 'cannot delegate that now' };
    const r = this.order(p, l.id, { delegateOf: l.id }); if (r.ok) { l.state = 'delegated'; this.stats.delegated++; } return r;
  }
  _jobDone(j) {
    const own = j.delegateOf ? this.loop(j.delegateOf) : null, l = own || { ...j.loop, q: j.loop.q, sys: j.loop.sys };
    if (own) { own.state = 'idle'; own.next = this.t + own.period; own.done++; own.last = j.q; }
    const debt = (l.q[j.q] || [0, 0])[1]; this._record(l, j.q, debt * (own ? 1 : 0.5), j.person); this._bump(j.person, j.q === 'proper' ? 0.02 : -0.01);
    this.emit({ type: 'jobdone', who: j.person.short, label: l.label, quality: j.q, delegated: !!own });
  }

  // ---- mission task board: the player does their own tasks in the right room
  doTask(id, quality = 'proper') {
    const t = this.tasks.find(x => x.id === id); if (!t || t.state !== 'active') return { ok: false, why: 'not active' };
    if (t.room !== this.place.room) return { ok: false, why: `Go to the ${t.room}` };
    t.state = 'done'; t.by = quality; this.maxScore += 1; this.score += { proper: 1, rushed: 0.6, faked: 0.25, skipped: 0 }[quality] ?? 1;
    if (quality !== 'proper') this.chain.push(`Task "${t.task}" ${quality}`);
    this.emit({ type: 'taskdone', task: t.task, quality }); return { ok: true };
  }
  // the rest of the ship does its tasks off-screen: most land on time, a few slip (seeded)
  // Continue as another crew member: their loops start fresh, but the ship's debt, history and the crew's opinion of "you" stay.
  inherit(old) {
    this.t = old.t; for (const l of this.loops) l.next += old.t; this.tasks = this.tasks.map(t => ({ ...t, state: old.tasks.find(o => o.task === t.task)?.state === 'done' || old.t > t.at_s + t.window ? (old.tasks.find(o => o.task === t.task)?.state || 'missed') : t.state }));
    Object.assign(this, { ledger: old.ledger, debt: old.debt, entries: old.entries, chain: old.chain, score: old.score, maxScore: old.maxScore, trustMap: old.trustMap, stats: old.stats, audit: old.audit });
    this.listeners = old.listeners; return this;
  }
  // The whole ship's mission tasks: every living crew member has some; they mostly get done, fewer when the ship is falling apart or neglected.
  missionProgress(phaseIndex = 0) {
    let due = 0, done = 0, total = 0;
    for (const p of this.roster.people) {
      if (!LIVE(p) || p === this.player) continue; const ts = this.duties.billets?.[p.billet]?.tasks?.[this.mission] || [];
      ts.forEach((t, i) => { total++; if (t.at * 60 <= this.t) { due++; const pr = Math.max(0.2, 0.95 - phaseIndex * 0.12 - Math.min(0.3, this.debt * 0.015)); if (hash01('crewtask', this.seed, p.id, i) < pr) done++; } });
    }
    const mine = this.tasks.filter(t => t.state === 'done' || t.state === 'missed'), mdone = mine.filter(t => t.state === 'done').length;
    const d2 = due + mine.length, n2 = done + mdone;
    return { due: d2, done: n2, total: total + this.tasks.length, pct: d2 ? Math.round(n2 / d2 * 100) : 100 };
  }

  board() {
    const rows = [];
    for (const l of this.loops) rows.push({ kind: 'duty', id: l.id, label: l.label, room: l.room, status: this.status(l), eta: l.state === 'idle' ? Math.max(0, Math.round(l.next - this.t)) : 0, last: l.last, left: this.busy?.loop === l ? Math.max(0, this.busy.left) : 0, total: this.busy?.loop === l ? this.busy.total : 0 });
    for (const t of this.tasks) rows.push({ kind: 'task', id: t.id, label: t.task, room: t.room, status: t.state, eta: Math.max(0, Math.round(t.at_s - this.t)), by: t.by });
    return rows;
  }
  summary() { return { score: this.maxScore ? Math.round(this.score / this.maxScore * 100) : 100, debt: +this.debt.toFixed(1), stats: { ...this.stats }, trust: +this.avgTrust.toFixed(2), chain: this.chain.slice(-8) }; }
}
