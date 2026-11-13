// Grapple and melee rules for Systems Nominal: hands, shoves, holds, improvised strikes. Pure data + logic (no three.js, no DOM):
// node-testable (tools/test-combat.mjs). Game glue (controls, bodies, NPC behaviour, security) is js/grapple.js; HUD js/combat-hud.js.
// Docs + tuning: docs/combat.md.  Owner direction: fights aboard are about grabbing, holding, restraining, shoving and the odd punch or
// spanner swing — never gore. Crew are hurt -> dazed -> stunned -> knocked out and get up again; nobody dies unless a lethal item
// (a phaser on kill) is deliberately used. Phasers stay with security / the armory (canDraw).
//   ACTIONS              one table: every verb with range, windup / recover (s), stamina cost, damage (health 0..1), stun (s), knockback
//                        (m/s), noise (hearing radius m), base accuracy, clip.   swingAction(profile) adds the held handheld's swing.
//   fighter(person, o)   -> stats from build / training / rank / combat tags (js/voice.js weightsOf) / stress / stamina
//   chance(a, A, D, ctx) / resolve(key, A, D, ctx, seed)  deterministic outcomes (hash-seeded), ctx { behind, aware, held, blocking, evading }
//   newInjury() hurt(inj, out) recover(inj, dt) stateOf(inj) speedMul(inj) workMul(inj)      ok -> hurt -> dazed -> stunned -> out (-> dead only if lethal)
//   newGrapple() gReach gStep gRestrain gRelease gThrow gSubdue breakRate     idle -> reach -> grabbed -> held -> released | thrown | broken
//   react(person, ctx, seed)  fight / flee / cower / call / defend / negotiate / freeze / watch with a believable delay
//   consequence(ev) -> effects { bumps, chain, alert, security, sabotage }   applyConsequence(fx, sys)  (Duty._bump / chain, alerts, phases)
//   canDraw(player, ctx)  armory phaser gating;  responders(roster, o)  who security sends;  securityMove(sec, suspect)  stun or restrain
import { hash01 } from './clock.js';
import { weightsOf } from './voice.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const LIVE = (p) => p && !['dead', 'corpse', 'crazed', 'evacuated'].includes(p.status);

// ---- the action table. kind: strike | shove | grab | hold | release | throw | ko | guard | evade | drag.  dmg = health (crew have 1.0);
//      stun = seconds; knock = m/s shove; noise = hearing radius in metres (footsteps 7, sprint 15); acc = base hit chance.
const A = (key, kind, o) => ({ key, kind, range: 1.3, windup: 0.2, recover: 0.4, stamina: 8, dmg: 0, stun: 0, knock: 0, noise: 4, acc: 0.75, clip: null, react: 'hit_chest', ...o });
export const ACTIONS = {
  jab: A('jab', 'strike', { label: 'Jab', range: 1.25, windup: 0.12, recover: 0.3, stamina: 6, dmg: 0.1, stun: 0.4, knock: 0.6, noise: 5, acc: 0.82, clip: 'punch_jab', react: 'hit_head' }),
  cross: A('cross', 'strike', { label: 'Cross', range: 1.3, windup: 0.24, recover: 0.5, stamina: 11, dmg: 0.2, stun: 0.8, knock: 1.4, noise: 6, acc: 0.7, clip: 'punch_cross', react: 'hit_head' }),
  shove: A('shove', 'shove', { label: 'Shove', range: 1.3, windup: 0.15, recover: 0.45, stamina: 9, dmg: 0.02, stun: 0.5, knock: 3.2, noise: 4, acc: 0.8, clip: 'push', react: 'hit_chest' }),
  grab: A('grab', 'grab', { label: 'Grab', range: 1.2, windup: 0.25, recover: 0.5, stamina: 8, noise: 3, acc: 0.68, clip: 'push', react: 'hit_chest' }),
  restrain: A('restrain', 'hold', { label: 'Restrain', range: 1.0, windup: 0.6, recover: 0.3, stamina: 6, noise: 3, acc: 0.6, clip: 'interact', react: null, drain: 2.5 }),
  release: A('release', 'release', { label: 'Release', range: 1.2, windup: 0, recover: 0.3, stamina: 0, noise: 1, acc: 1, clip: null, react: null }),
  drag: A('drag', 'drag', { label: 'Drag', range: 1.0, windup: 0, recover: 0, stamina: 0, noise: 3, acc: 1, clip: 'push', react: null, drain: 5, speed: 0.5 }),
  trip: A('trip', 'throw', { label: 'Throw down', range: 1.2, windup: 0.35, recover: 0.6, stamina: 14, dmg: 0.12, stun: 2.4, knock: 1.6, noise: 7, acc: 0.72, clip: 'push', react: 'hit_chest' }),
  subdue: A('subdue', 'ko', { label: 'Subdue', range: 1.0, windup: 1.2, recover: 0.6, stamina: 18, dmg: 0.05, stun: 6, noise: 4, acc: 0.55, clip: 'crouch_idle', react: null, ko: 30 }),
  guard: A('guard', 'guard', { label: 'Block', range: 0, windup: 0.05, recover: 0.25, stamina: 4, noise: 0, acc: 1, mitig: 0.65, clip: null, react: null }),
  evade: A('evade', 'evade', { label: 'Evade', range: 0, windup: 0.05, recover: 0.5, stamina: 10, noise: 2, acc: 1, iframes: 0.35, clip: null, react: null }),
};
export const ACTION_KEYS = Object.keys(ACTIONS);
// an improvised weapon: the held handheld's melee profile from js/handhelds.js WEAPON_TABLE (dmg in hostile hit points, stun s, knock, range,
// noise, cd). Crew health takes 0.32 x the hit points (a pry bar 0.32, a spanner 0.22, a PADD 0.1); windup / recover follow the cool-down.
export function swingAction(w, id = 'item') {
  if (!w) return ACTIONS.cross;
  return A('swing', 'strike', { label: 'Swing', item: id, range: w.range || 1.4, windup: +(0.16 + (w.cd || 0.8) * 0.18).toFixed(2), recover: +((w.cd || 0.8) * 0.6).toFixed(2), stamina: Math.round(7 + (w.knock || 1) * 2),
    dmg: +((w.dmg || 0.2) * 0.32).toFixed(3), stun: w.stun || 0.6, knock: w.knock || 1, noise: w.noise || 6, acc: 0.74, clip: 'punch_cross', react: 'hit_head', sedate: !!w.sedate, burn: !!w.burn, lethal: false });
}
export const DMG_PER_HP = 0.32;   // crew health per hostile hit point (handhelds WEAPON_TABLE units)

// ---- fighters: what a person brings to a scuffle. build ~0.9 (slight) .. 1.25 (heavy); trained 0..1 (security 1, senior officers some)
export function fighter(p, o = {}) {
  const w = p ? weightsOf(p) : {}, body = p?.body || 'crew_m';
  const build = (body === 'crew_heavy' ? 1.22 : /crew_f/.test(body) ? 0.92 : 1) + (o.build || 0);
  const trained = p?.dept === 'security' ? 1 : (p?.rank ?? 0) >= 4 ? 0.35 : p?.dept === 'command' ? 0.2 : 0;
  return { id: p?.id ?? -1, person: p || null, build, trained, rank: p?.rank ?? 0, w, stress: clamp(o.stress ?? 0, 0, 1), stamina: o.stamina ?? 100, hp: o.hp ?? 1, state: o.state || 'ok', reaction: o.reaction || null, blocking: !!o.blocking, player: !!o.player };
}
const DOWN = new Set(['stunned', 'out', 'dead']);

// ---- success: one number in 0.05..0.97 (a body that is down is hit for sure)
export function chance(a, Att, Def, ctx = {}) {
  if (typeof a === 'string') a = ACTIONS[a];
  if (DOWN.has(Def.state)) return 1;
  let p = a.acc + (Att.trained - Def.trained) * 0.12 + (Att.build - Def.build) * 0.3 + (Att.w.fight || 0) * 0.05 + (Att.w.improv && a.item ? 0.05 : 0) - Att.stress * 0.1;
  if (Att.stamina < 25) p -= 0.15; if (Def.stamina < 25) p += 0.1;
  if (ctx.behind) p += 0.25; if (ctx.aware === false) p += 0.15; if (ctx.held) p += 0.3; if (Def.state === 'dazed') p += 0.15;
  if (a.kind === 'grab' || a.kind === 'hold') p -= (Def.w.flee || 0) * 0.06 - (Att.rank - Def.rank) * 0.01;
  return clamp(p, 0.05, 0.97);
}
// outcome of one attempt, deterministic for (seed, action, attacker, defender). ctx.n = attempt counter (so repeated swings differ)
export function resolve(key, Att, Def, ctx = {}, seed = 1) {
  const a = typeof key === 'string' ? ACTIONS[key] : key, p = chance(a, Att, Def, ctx), r = hash01('cb', seed, a.key, Att.id, Def.id, ctx.n || 0), r2 = hash01('cb2', seed, a.key, Att.id, Def.id, ctx.n || 0);
  const out = { action: a.key, kind: a.kind, p: +p.toFixed(3), hit: r < p, blocked: false, evaded: false, dmg: 0, stun: 0, knock: 0, noise: a.noise, behind: !!ctx.behind, roll: +r.toFixed(3) };
  if (!out.hit) return out;
  if (ctx.evading && !ctx.held && !DOWN.has(Def.state) && r2 < 0.55) { out.hit = false; out.evaded = true; return out; }
  const tired = Att.stamina < 25 ? 0.7 : 1, back = ctx.behind ? 1.3 : 1, reck = 1 + (Att.w.fight || 0) * 0.1;
  out.dmg = a.dmg * (0.85 + 0.3 * r2) * Math.sqrt(Att.build) * tired * back * reck; out.stun = a.stun * (ctx.behind ? 1.4 : 1) * (Def.stamina < 25 ? 1.3 : 1); out.knock = a.knock * Math.sqrt(Att.build / Def.build);
  if ((ctx.blocking || Def.blocking) && !ctx.behind && (a.kind === 'strike' || a.kind === 'shove')) { out.blocked = true; const m = ACTIONS.guard.mitig; out.dmg *= 1 - m; out.stun *= 1 - m; out.knock *= 0.5; }
  if (a.sedate) out.stun = Math.max(out.stun, 6); if (a.ko && !out.blocked) { out.ko = a.ko; }
  out.dmg = +out.dmg.toFixed(3); out.stun = +out.stun.toFixed(2); out.knock = +out.knock.toFixed(2); return out;
}

// ---- injury: health 1 -> 0.05 (never 0 unless lethal), stun seconds, knocked-out seconds. Recovers on its own (a medic speeds it).
export const INJURY = { hurtBelow: 0.7, koBelow: 0.15, koSecs: 18, wakeDazed: 4, regen: 0.004, stunStack: 0.35, floor: 0.05 };
export function newInjury() { return { hp: 1, stun: 0, out: 0, hits: 0, dead: false, state: 'ok' }; }
export function stateOf(inj) { return inj.dead ? 'dead' : inj.out > 0 ? 'out' : inj.stun >= 1.5 ? 'stunned' : inj.stun > 0 ? 'dazed' : inj.hp < INJURY.hurtBelow ? 'hurt' : 'ok'; }
export function hurt(inj, out, { lethal = false } = {}) {
  if (inj.dead) return 'dead'; const I = INJURY;
  inj.hp = Math.max(lethal ? 0 : I.floor, inj.hp - (out.dmg || 0)); inj.stun = Math.max(inj.stun, out.stun || 0) + (out.stun || 0) * I.stunStack; inj.hits++;
  if (out.ko) inj.out = Math.max(inj.out, out.ko); else if (inj.hp <= I.koBelow) inj.out = Math.max(inj.out, I.koSecs);
  if (lethal && inj.hp <= 0) inj.dead = true;
  return inj.state = stateOf(inj);
}
export function recover(inj, dt, { medic = false } = {}) {
  if (inj.dead) return 'dead'; const k = medic ? 3 : 1;
  inj.stun = Math.max(0, inj.stun - dt * k); if (inj.out > 0) { inj.out -= dt * k; if (inj.out <= 0) { inj.out = 0; inj.stun = Math.max(inj.stun, INJURY.wakeDazed); } }
  inj.hp = Math.min(1, inj.hp + dt * INJURY.regen * k); return inj.state = stateOf(inj);
}
export const speedMul = (inj) => ({ ok: 1, hurt: 0.55 + 0.45 * inj.hp, dazed: 0.4, stunned: 0, out: 0, dead: 0 })[stateOf(inj)];
export const workMul = (inj) => ({ ok: 1, hurt: 0.6 + 0.4 * inj.hp, dazed: 0, stunned: 0, out: 0, dead: 0 })[stateOf(inj)];
export const incapacitated = (inj) => ['stunned', 'out', 'dead'].includes(stateOf(inj));

// ---- the grapple: one grab at a time per attacker. struggle 0..1 (1 = breaks free); ctrl = seconds of steady control (restrain at ctrlNeed)
export const GRAPPLE = { reach: ACTIONS.grab.windup, ctrlNeed: 1.0, restrainBelow: 0.55, drainAtt: { grabbed: 4, held: 2.5 }, drainDef: { fight: 7, calm: 2 }, bleed: 0.12 };
export const G_STATES = ['idle', 'reach', 'grabbed', 'held', 'released', 'thrown', 'broken'];
export function newGrapple(attId = -1, defId = -1) { return { state: 'idle', t: 0, struggle: 0, ctrl: 0, n: 0, attId, defId, log: [] }; }
const gset = (g, s, why = '') => { g.log.push(`${g.state}>${s}${why ? ':' + why : ''}`); if (g.log.length > 24) g.log.shift(); g.state = s; g.t = 0; return s; };
export function gReach(g) { if (g.state !== 'idle') return false; g.struggle = 0; g.ctrl = 0; gset(g, 'reach'); g.t = GRAPPLE.reach; return true; }
// how hard the held person fights the hold, per second (0 when out cold). want: 1 fighting / fleeing, 0.5 scared, 0.2 frozen, 0 out
export const WANT_FREE = { fight: 1, flee: 1, defend: 1, call: 0.7, negotiate: 0.4, cower: 0.5, watch: 0.5, freeze: 0.2 };
export function breakRate(g, Att, Def) {
  if (DOWN.has(Def.state)) return 0; const want = WANT_FREE[Def.reaction] ?? 0.6, stamK = Def.stamina < 10 ? 0.15 : Def.stamina < 30 ? 0.55 : 1;
  const r = want * (0.22 + 0.34 * Def.build / Att.build) * stamK * (Def.state === 'dazed' ? 0.4 : 1) + Def.trained * 0.12 - Att.trained * 0.14 - (g.state === 'held' ? 0.12 : 0) - (Att.stamina < 20 ? -0.15 : 0);
  return Math.max(0, r);
}
// advance one tick. ctx.keep: the attacker is still holding on (mouse held); returns an event string or null
export function gStep(g, dt, Att, Def, ctx = {}, seed = 1) {
  if (g.state === 'reach') { g.t -= dt; if (g.t > 0) return null; g.n++; const o = resolve('grab', Att, Def, { ...ctx, n: g.n }, seed); g.lastOut = o; if (o.hit) { gset(g, 'grabbed'); return 'grabbed'; } gset(g, 'idle', o.evaded ? 'evaded' : 'miss'); return 'miss'; }
  if (g.state !== 'grabbed' && g.state !== 'held') return null;
  g.t += dt;
  if (ctx.keep === false) { gset(g, 'released', 'let go'); return 'released'; }
  const pulse = 0.55 + 0.9 * hash01('st', seed, g.defId, Math.floor(g.n * 7 + g.t * 2)), rate = breakRate(g, Att, Def) * pulse;
  g.struggle = clamp(g.struggle + (rate - GRAPPLE.bleed * (rate < 0.05 ? 2 : 0.5)) * dt, 0, 1);
  const fighting = rate > 0.1; Att.stamina = Math.max(0, Att.stamina - dt * GRAPPLE.drainAtt[g.state] * (Def.build / Att.build)); Def.stamina = Math.max(0, Def.stamina - dt * (fighting ? GRAPPLE.drainDef.fight : GRAPPLE.drainDef.calm));
  if (g.struggle >= 1) { gset(g, 'broken', 'broke free'); return 'broken'; }
  if (g.state === 'grabbed') { g.ctrl = g.struggle < GRAPPLE.restrainBelow ? g.ctrl + dt : Math.max(0, g.ctrl - dt); if (ctx.keep && g.ctrl >= GRAPPLE.ctrlNeed) { gset(g, 'held', 'restrained'); g.struggle *= 0.6; return 'held'; } }
  return null;
}
// a forced restrain attempt (wheel / key): grabbed -> held on success, else the struggle jumps
export function gRestrain(g, Att, Def, seed = 1) { if (g.state !== 'grabbed') return g.state === 'held'; g.n++; const o = resolve('restrain', Att, Def, { held: true, n: g.n }, seed); if (o.hit || DOWN.has(Def.state)) { gset(g, 'held', 'restrained'); g.struggle *= 0.5; return true; } g.struggle = clamp(g.struggle + 0.2, 0, 1); return false; }
export function gRelease(g, why = 'released') { if (g.state !== 'grabbed' && g.state !== 'held' && g.state !== 'reach') return false; gset(g, 'released', why); return true; }
// throw down / trip out of a hold: always lands from 'held', usually from 'grabbed'. Returns the hit outcome (stun on the floor)
export function gThrow(g, Att, Def, seed = 1) {
  if (g.state !== 'grabbed' && g.state !== 'held') return null; g.n++; const o = resolve('trip', Att, Def, { held: true, n: g.n }, seed);
  if (g.state === 'held' && !o.hit) { o.hit = true; o.dmg = ACTIONS.trip.dmg; o.stun = ACTIONS.trip.stun; o.knock = ACTIONS.trip.knock; }
  gset(g, o.hit ? 'thrown' : 'broken', o.hit ? 'thrown' : 'slipped'); return o;
}
// subdue (pin / choke-hold to unconscious, no injury): only from 'held'; works on a tired or dazed body, otherwise the struggle jumps
export function gSubdue(g, Att, Def, seed = 1) {
  if (g.state !== 'held') return null; g.n++; const o = resolve('subdue', Att, Def, { held: true, n: g.n }, seed), easy = Def.stamina < 40 || ['dazed', 'stunned', 'out'].includes(Def.state);
  if (easy && !o.hit) { o.hit = true; o.ko = ACTIONS.subdue.ko; o.stun = ACTIONS.subdue.stun; o.dmg = ACTIONS.subdue.dmg; }
  if (o.hit) gset(g, 'released', 'subdued'); else g.struggle = clamp(g.struggle + 0.3, 0, 1); return o;
}
export const gTerminal = (g) => ['released', 'thrown', 'broken'].includes(g.state);

// ---- NPC reactions to a fight. role: victim | witness | held. Scores from combat tags (weightsOf: fight, flee, hide, help, call, freeze, talk,
//      command, obey), department, rank, the social graph (friend of the victim / rival of the attacker) and the situation; seeded jitter.
export const REACTIONS = ['fight', 'flee', 'cower', 'call', 'defend', 'negotiate', 'freeze', 'watch'];
export function react(p, ctx = {}, seed = 1) {
  const w = weightsOf(p), sec = p.dept === 'security', med = (w.help || 0) > 0.5 && p.dept === 'medical', inj = ctx.injury || 'ok', role = ctx.role || 'witness';
  const s = { fight: 0, flee: 0.25 + (w.flee || 0) + (w.hide || 0) * 0.4, cower: 0.12 + (w.freeze || 0) * 0.4 + (w.hide || 0) * 0.5 + (ctx.stress || 0) * 0.3, call: 0.2 + (w.call || 0) + (w.command || 0) * 0.3,
    defend: 0, negotiate: 0.12 + (w.talk || 0), freeze: 0.06 + (w.freeze || 0) * 0.8, watch: role === 'witness' ? 0.3 : -1 };
  if (role === 'victim' || role === 'held') {
    s.fight = 0.3 + (w.fight || 0) + (sec ? 0.6 : 0) + (ctx.rankDiff > 0 ? 0.15 : 0) + (ctx.rival ? 0.3 : 0) + (ctx.provoked ? -0.4 : 0) + (ctx.hostile ? 1.5 : 0);
    if (role === 'held') { s.call += 0.1; s.flee += 0.2; s.watch = -1; }
  } else {
    const f = ctx.friendOfVictim || 0; s.defend = (f > 0 ? 0.35 + f * 0.5 : 0) + (w.help || 0) * 0.5 + (w.fight || 0) * 0.3 + (sec ? 0.9 : 0) + (med ? 0.2 : 0) - (ctx.provoked ? 0.8 : 0);
    if (ctx.provoked) { s.watch += 0.5; s.call -= 0.2; } if (ctx.hostile) { s.call += 0.4; s.flee += 0.3; }
    s.fight = -1;
  }
  if (inj === 'hurt') { s.fight -= 0.4; s.flee += 0.2; } if (inj === 'dazed' || inj === 'stunned' || inj === 'out') { for (const k in s) s[k] = -1; s.cower = 1; }
  if (ctx.handsUp) { s.fight -= 0.6; s.defend -= 0.4; s.negotiate += 0.3; s.watch += 0.3; }
  if ((ctx.alert || 0) >= 3) { s.call -= 0.2; s.fight += 0.1; }
  let best = 'watch', bv = -9; for (const k of REACTIONS) { const v = s[k] + hash01('react', seed, p.id, k, ctx.n || 0) * 0.25; if (v > bv) { bv = v; best = k; } }
  const delay = clamp(0.35 + (w.freeze || 0) * 0.9 - (w.command || 0) * 0.2 - (sec ? 0.15 : 0) + (w.flee || 0) * -0.1 + hash01('rdelay', seed, p.id, ctx.n || 0) * 0.4, 0.2, 1.8);
  return { kind: best, delay: +delay.toFixed(2), scores: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, +v.toFixed(2)])) };
}
// lines people say when it kicks off (spoken through js/speech.js; never threatening, never gory)
export const LINES = {
  fight: ['Hey! Back off!', 'You want to do this? Fine.', 'Hands off me!'], flee: ['Somebody help!', 'I am out of here!', 'Not my fight!'], cower: ['Please — stop!', 'Okay, okay!', "Don't!"],
  call: ['Security to my location!', 'Security, we have a fight!', 'Bridge, I need security here!'], defend: ['Leave them alone!', 'Break it up!', 'That is enough!'],
  negotiate: ['Whoa, easy. Let\'s talk.', 'Hey — whatever this is, we can sort it out.', 'Breathe. Nobody needs to get hurt.'], freeze: ['…', 'What—', 'Uh—'],
  held: ['Let go of me!', 'Get off!', 'Ow — fine, fine!'], out: [], snap: ['They are watching us. All of them!', 'I can\'t take this ship any more!', 'Get away from me!'],
  security: ['Security! Stand down!', 'Hands where I can see them!', 'On the deck. Now.'], securityDone: ['You are restrained. Walk with me.', 'Stay put. You are done for today.'],
};
export const line = (kind, seed = 1, id = 0) => { const l = LINES[kind] || []; return l.length ? l[Math.floor(hash01('line', seed, kind, id) * l.length)] : ''; };

// ---- consequences. ev: { act, victim, witnesses: [{ person, friend (0..1), sameDept }], provoked: 'none' | 'self-defence' | 'hostile' | 'saboteur',
//      offences (prior assaults this watch), roster, room, seed }. Pure: returns what should happen; applyConsequence does it.
export const SEVERITY = { shove: 0.3, grab: 0.35, restrain: 0.55, strike: 0.7, throw: 0.8, ko: 1, phaser: 0.9, lethal: 3 };
export function consequence(ev) {
  const sev = (SEVERITY[ev.act] ?? 0.5) * (ev.attempt ? 0.6 : 1), v = ev.victim, fx = { sev, bumps: [], chain: [], alert: null, security: false, sabotage: false, record: null, good: false };
  const name = v?.short || 'a crew member', where = ev.room ? ` in the ${ev.room}` : '';
  if (ev.provoked === 'saboteur' || ev.provoked === 'hostile') {
    const subdued = ['restrain', 'ko', 'throw', 'lethal'].includes(ev.act); fx.good = true;
    for (const w of ev.witnesses || []) fx.bumps.push([w.person.id, subdued ? 0.05 : 0.02, 'stopped a dangerous crew member']);
    if (subdued) { for (const p of ev.roster?.people || []) if (LIVE(p) && p.dept === 'security' && !p.isPlayer) fx.bumps.push([p.id, 0.04, 'helped security']); fx.chain.push(`You subdued ${name}${ev.provoked === 'saboteur' ? ' — the saboteur' : ' (cabin fever)'}${where}`); }
    if (ev.provoked === 'saboteur' && subdued) fx.sabotage = 'clear';
    if (ev.act === 'lethal') { fx.chain.push(`${name} was killed${where}`); fx.bumps = fx.bumps.map(([id, d, w]) => [id, d - 0.15, w]); }
    fx.record = { kind: 'subdue', who: name }; return fx;
  }
  if (ev.provoked === 'self-defence') { for (const w of ev.witnesses || []) fx.bumps.push([w.person.id, -0.01, 'saw a scuffle']); if (ev.act === 'ko' || ev.act === 'lethal') fx.chain.push(`You knocked out ${name} in a fight${where}`); fx.record = { kind: 'defence', who: name }; return fx; }
  const rep = 1 + Math.min(2, ev.offences || 0) * 0.5;   // repeat offenders lose more
  if (v) fx.bumps.push([v.id, -(0.12 + 0.25 * sev) * rep, 'you attacked them']);
  for (const w of ev.witnesses || []) fx.bumps.push([w.person.id, -(0.04 + 0.1 * sev) * (w.friend > 0 ? 1.6 : 1) * (w.sameDept ? 1.2 : 1) * rep, 'saw you attack ' + name]);
  if (v && sev >= 0.5) for (const p of ev.roster?.people || []) if (LIVE(p) && p !== v && !p.isPlayer && p.dept === v.dept && !(ev.witnesses || []).some(w => w.person === p) && hash01('cbgossip', ev.seed || 1, v.id, p.id) < 0.5) fx.bumps.push([p.id, -(0.03 + 0.04 * sev), 'heard you attacked ' + name]);
  const VERB = { shove: 'shoved', grab: 'grabbed', restrain: 'restrained', strike: 'struck', throw: 'threw down', ko: 'knocked out', phaser: 'stunned', lethal: 'killed' }, verb = ev.attempt ? `tried to ${ev.act === 'strike' ? 'hit' : ev.act}` : VERB[ev.act] || 'attacked';
  if (sev >= 0.55 || (ev.offences || 0) >= 1) { fx.chain.push(`You ${verb} ${name}${where}, unprovoked`); fx.security = true; fx.alert = { id: 'intruder', reason: `Assault on ${name}${where} — security responding` }; }
  fx.record = { kind: 'assault', who: name, sev }; return fx;
}
// sys: { duty, phases, alerts, roster, deckNo, say }. Returns the number of trust bumps applied.
export function applyConsequence(fx, sys = {}) {
  const { duty, phases, alerts, roster } = sys; let n = 0;
  if (duty) { const byId = new Map((roster?.people || duty.roster?.people || []).map(p => [p.id, p])); for (const [id, d] of fx.bumps) { const p = byId.get(id); if (p && !p.isPlayer) { duty._bump(p, d); n++; } } for (const c of fx.chain) duty.chain.push(c); if (fx.record?.kind === 'assault') duty.stats.assaults = (duty.stats.assaults || 0) + 1; }
  if (fx.alert && alerts) alerts.raise(fx.alert.id, { scope: 'deck', deck: sys.deckNo ?? null, source: 'security', reason: fx.alert.reason });
  if (fx.sabotage === 'clear' && phases) { phases.saboteur = null; phases.severity = +(phases.severity * 0.4).toFixed(3); phases.emit?.({ type: 'sabotage_stopped' }); if (alerts?.get?.('intruder')?.source === 'auto') alerts.clear('intruder'); }
  return n;
}

// ---- armory: anyone can lift a phaser from the arms locker, but only a security billet, the captain / XO (or their order) or a red
//      alert makes it authorised. Unauthorised: security loses trust in you and it goes in the log.
export function canDraw(player, { alertSev = 0, order = null } = {}) {
  if (!player) return { authorised: false, why: 'nobody' };
  if (player.dept === 'security') return { authorised: true, why: 'security billet' };
  if (['co', 'xo'].includes(player.billet)) return { authorised: true, why: 'command authority' };
  if (order) return { authorised: true, why: `ordered by ${order}` };
  if (alertSev >= 4) return { authorised: true, why: 'red alert' };
  return { authorised: false, why: 'no authority', penalty: { trust: -0.08, chain: 'Drew a phaser from the armory without authority' } };
}
// security responders: living security crew (not the player, not the suspect), guards first (low rank), then by id; n of them
export function responders(roster, { exclude = [], n = 2 } = {}) {
  return (roster?.people || []).filter(p => LIVE(p) && !p.isPlayer && p.dept === 'security' && !exclude.includes(p)).sort((a, b) => a.rank - b.rank || a.id - b.id).slice(0, n);
}
// what a security officer does on arrival: stun a violent suspect if they carry a phaser, otherwise restrain; a compliant one is just restrained
export function securityMove(sec, suspect = {}, carriesPhaser = true) {
  if (suspect.compliant || suspect.handsUp || DOWN.has(suspect.state)) return 'restrain';
  return suspect.violent && carriesPhaser ? 'stun' : 'restrain';
}
// hearing: noise radius in metres, halved through walls
export const heard = (noise, d, los = true) => d <= noise * (los ? 1 : 0.5);
// attacker behind the defender? (defender yaw = facing angle, atan2(x, z) convention used by meshes)
export function isBehind(defYaw, dx, dz) { const a = Math.atan2(dx, dz), da = Math.atan2(Math.sin(a - defYaw), Math.cos(a - defYaw)); return Math.abs(da) > 1.9; }
