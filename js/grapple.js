// Systems Nominal hand-to-hand: the game glue for js/combat.js (rules) and js/combat-hud.js (DOM). Controls, the procedural grapple lock,
// NPC reactions in the world, security response, the armory, the player's own hits. Uses the js/haul.js context (initHaul in js/main.js).
//   G.combat = new Melee()     tick(dt) from step();  primary() = left mouse (strike / swing / throw down);  secondary(down) = right mouse
//   (grab while held, let go on release; no one in reach = block);  interact() = E on the arms locker;  prompt();  wheelKids() = quick wheel
//   'Hands' (js/menus.js);  onKitHit(e, r) = a phaser shot / thrown handheld from js/kit.js lands on a crew member.
// Bodies: a crew member in a fight is taken over (opEnd / walk stopped / haul dropped / e.cower) and its Human.update is wrapped so the
// clip, the additive struggle layer and the position at the player's hold point are set after the main loop's own animation code.
// Afterwards they get up, walk back to their spot and resume (opStart). Madness mode never creates this (its zapper / Q hook stay).
import * as THREE from 'three';
import * as CB from './combat.js';
import { HANDHELDS, strike as hhStrike, isBroken, newInstance, loadoutFor } from './handhelds.js';
import { ctx as hctx, opStart, opEnd } from './haul.js';
import { holdItem, dropItem } from './carry.js';
import { CombatHUD } from './combat-hud.js';
import { hash01 } from './clock.js';
import { toBones } from './movement.js';

const ang = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const CTL = new Set(['fight', 'defend', 'negotiate', 'freeze', 'cower', 'call', 'arrest', 'hostile', 'watch']);   // behaviours where combat drives the body (flee uses the normal walker)
const FEAR = { JawDrop: 0.45, LeftInnerBrowUp: 1, RightInnerBrowUp: 1, LeftUpperLidOpen: 0.8, RightUpperLidOpen: 0.8 }, ANGER = { LeftBrowDown: 0.9, RightBrowDown: 0.9, JawDrop: 0.1 }, OUT = { LeftUpperLidClosed: 1, RightUpperLidClosed: 1, JawDrop: 0.25 };
const HP_SCALE = 60;   // player HP lost per point of health damage (a jab ~6, a cross ~12, a spanner ~14)

export class Melee {
  constructor() {
    this.hud = new CombatHUD(); this.active = new Set(); this.n = 0; this.offences = 0; this.provokers = new Map(); this.log = []; this.stance = 'relaxed'; this.vm = null;
    this.reset(true);
    addEventListener('mouseup', (e) => { if (e.button === 2) this.secondary(false); });
    addEventListener('keydown', (e) => { if (e.code === 'KeyC' && !e.repeat && this.g && this.on()) this.subdue(); });
  }
  get C() { return hctx(); }
  on() { const C = this.C; return !!C && C.G.mode !== 'madness' && C.G.phase === 'play' && !!C.G.player; }
  reset(first = false) {
    if (!first) for (const e of [...this.active]) this.letGo(e, true);
    this.active = new Set(); this.g = null; this.act = null; this.cool = 0; this.guarding = false; this.grabbedBy = null; this.restrained = 0; this.ko = 0; this.stagger = 0; this.flashT = 0; this.sec = null; this.lastAssault = -99; this.lastTarget = null; this.secEnd = null; this.snapT = 120; this.combo = 0; this.lastStrike = -9; this.vmPose = null;
    const C = this.C; if (C?.P) { C.P.cbSlow = 1; } this.world = C?.world || null; this.who = C?.G?.player || null; this.beam = null;
  }
  crew() { return this.C.ents.filter(e => e.kind === 'crew' && e.person && e.mesh && !e.fake && e.person.status !== 'dead'); }
  // the crew member in front of the player within range (line of sight), nearest first
  front(range, dot = 0.6) { const C = this.C, P = C.P, fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); let best = null, bd = range; for (const e of this.crew()) { if (e === this.g?.e) continue; const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz); if (d < bd && (dx * fx + dz * fz) / (d || 1) > dot && C.world.los(P.x, P.z, e.x, e.z)) { bd = d; best = e; } } return best; }
  pf() { const G = this.C.G; return CB.fighter(G.player, { player: true, stamina: G.stamina, hp: G.hp / G.maxHp, stress: Math.min(1, (G.comms?.alerts?.top()?.def.severity ?? 0) / 4), blocking: this.guarding, state: this.restrained > 0 || this.ko > 0 ? 'stunned' : 'ok', reaction: 'fight' }); }
  nf(e) { const c = this.cb(e); return CB.fighter(e.person, { stamina: c.stam, hp: c.inj.hp, state: CB.stateOf(c.inj), reaction: c.ai || 'watch', blocking: c.guard > 0 }); }
  cb(e) { return e.cb || (e.cb = { inj: CB.newInjury(), stam: 100, ai: null, pend: null, t: 0, cd: 0, clip: null, one: null, sevDone: 0, engT: -99, n: 0, face: e.mesh?.rotation.y || 0, moving: 0, guard: 0, hostile: false, struck: 0 }); }

  // ---------------------------------------------------------------- the body: take over, wrap Human.update, hand back
  takeOver(e, { sim = true } = {}) {
    const c = this.cb(e), H = e.mesh.userData.human; this.active.add(e); c.fleeT = 0; if (c.ctl) return c; c.ctl = true;
    if (e.op) opEnd(e); e.walk = null; e.turning = undefined; e.retT = 0; e.returnTo = null; e.dodgeCool = 1e9; e.cower = true; c.faceAt = e.faceAt; e.faceAt = null; c.face = e.mesh.rotation.y; e.v = 0;
    if (H) { if (e.carrying) { dropItem(H, 'hand_r'); e.carrying = null; } if (e.repTool) { dropItem(H, 'hand_r'); e.repTool = false; } H.standing = false;
      if (!H._cbOrig) { const orig = H.update; H._cbOrig = orig; H.update = (dt) => { this.pre(e, H, dt); orig(dt); this.post(e, H, dt); }; } }
    if (sim) this.holdSim(e, true); return c;
  }
  // stop driving the body; it gets up, walks back to its spot and resumes its work (opStart) / schedule
  letGo(e, quiet = false) {
    const c = e.cb, H = e.mesh?.userData.human; if (!c) return; c.ctl = false; c.ai = null; c.pend = null; c.one = null;
    if (H?._cbOrig) { H.update = H._cbOrig; delete H._cbOrig; H.add = null; H.face({ JawDrop: 0, LeftInnerBrowUp: 0, RightInnerBrowUp: 0, LeftBrowDown: 0, RightBrowDown: 0, LeftUpperLidClosed: 0, RightUpperLidClosed: 0, LeftUpperLidOpen: 0, RightUpperLidOpen: 0 }); }
    if (H?.held?.hand_r && c.gun) { dropItem(H, 'hand_r'); c.gun = false; }
    e.cower = false; e.dodgeCool = 3; e.faceAt = c.faceAt || null; this.holdSim(e, false); if (CB.stateOf(c.inj) === 'ok' && !c.detained) this.active.delete(e);
    if (quiet || !e.mesh?.parent) return; const C = this.C;
    if (c.detained) { H?.play('crouch_idle', { fade: 0.4 }); return; }
    const a = e.opAnchor, back = a && Math.hypot(a[0] - e.x, a[1] - e.z) < 1.3;
    if (back && opStart(e)) return; const t = C.simTileFor?.(e.person, e); if (t) { e.faceAt = t.face || e.faceAt; C.startWalk(e, t[0], t[1], false, {}); } else H?.play('idle', { fade: 0.4 });
  }
  // a sim override keeps an incapacitated / detained person where they are (and suspends their repair job: js/repair.js suspended())
  holdSim(e, on, secs, activity = 'recovering') {
    const S = this.C.G.sim, p = e.person; if (!S || !p) return; const c = e.cb;
    if (on) { const s = S.st?.get(p.id); if (!s || c.simHeld) return; c.simHeld = true; S.redirect(p, s.room, s.spot, secs, activity, { prio: 2, site: { deckNo: s.deckNo, tx: s.tx, ty: s.ty } }); }
    else if (c.simHeld && !c.detained) { c.simHeld = false; S.release(p, 2); }
  }
  pre(e, H, dt) {
    const c = e.cb; if (!c) return; const st = CB.stateOf(c.inj), held = this.g?.e === e ? this.g.gs.state : null, t = (e.t || 0);
    let want = 'idle', loop = true, speed = 1;
    if (c.one && c.one.t > 0) { want = c.one.clip; loop = false; }
    else if (st === 'out' || st === 'dead') { want = 'death01'; loop = false; }
    else if (st === 'stunned' || c.detained) want = 'crouch_idle';
    else if (held === 'reach' || held === 'grabbed' || held === 'held') want = 'idle';
    else if (c.moving > 0.2) { want = c.moving > 2 ? 'jog_fwd' : 'walk'; speed = Math.max(0.6, Math.min(1.6, c.moving / (c.moving > 2 ? 3.2 : 1.2))); }
    else if (c.ai === 'cower') want = 'crouch_idle';
    else if (c.ai === 'negotiate') want = 'idle_talking';
    else if (c.ai === 'call') want = 'interact';
    if (!H.has(want)) want = 'idle';
    if (H.current !== want || c.one?.restart) { H.play(want, { loop, fade: c.one?.restart ? 0.08 : 0.2, speed, restart: !!c.one?.restart }); if (c.one) c.one.restart = false; } else if (loop) H.play(want, { speed });
    // additive layer (js/movement.js rig channels): struggling in a hold (waist / arms / head noise), arms pinned behind the back when restrained, a guard when squaring up
    const n = (k, f) => Math.sin(t * f + k * 1.7 + e.person.id) * 0.5 + Math.sin(t * f * 2.3 + k) * 0.5, fight = held && held !== 'reach' && st !== 'out' ? (c.ai === 'freeze' ? 0.25 : 1) * (this.g?.gs.struggle > 0.6 ? 1.4 : 1) : 0, ch = {};
    if (fight) Object.assign(ch, { waist_twist: n(1, 5) * 0.3 * fight, spine_bow: n(2, 7) * 0.1 * fight, spine_lean: n(3, 6) * 0.08 * fight, arm_out_l: n(4, 8) * 0.25 * fight, arm_out_r: n(5, 8) * 0.25 * fight, arm_fwd_l: n(6, 7) * 0.3 * fight, arm_fwd_r: n(7, 7) * 0.3 * fight, head_turn: n(8, 3) * 0.35 * fight, head_nod: n(9, 4) * 0.12 });
    if (held === 'held' && st !== 'out') { const k = 0.3; Object.assign(ch, { arm_fwd_l: -0.5 + (ch.arm_fwd_l || 0) * k, arm_fwd_r: -0.5 + (ch.arm_fwd_r || 0) * k, arm_out_l: (ch.arm_out_l || 0) * k, arm_out_r: (ch.arm_out_r || 0) * k, elbow_l: 1.0, elbow_r: 1.0, spine_bow: 0.22 + (ch.spine_bow || 0), shrug_l: 0.15, shrug_r: 0.15 }); }
    if (!held && (c.ai === 'fight' || c.ai === 'hostile' || c.ai === 'defend' || (c.ai === 'arrest' && !c.gun)) && !(c.one?.t > 0) && c.moving < 0.2) Object.assign(ch, { arm_fwd_l: 0.55, arm_fwd_r: 0.45, elbow_l: 1.8, elbow_r: 1.7, arm_twist_l: -0.5, arm_twist_r: -0.5, arm_out_l: 0.12, arm_out_r: 0.12, spine_bow: 0.06 });
    if (!held && c.ai === 'cower' && st !== 'out') Object.assign(ch, { arm_fwd_l: 0.9, arm_fwd_r: 0.9, elbow_l: 1.9, elbow_r: 1.9, head_nod: 0.35 });
    const add = toBones(ch);
    H.add = Object.keys(add).length ? add : null;
  }
  post(e, H, dt) {
    const c = e.cb; if (!c) return; const P = this.C.P, st = CB.stateOf(c.inj), held = this.g?.e === e && ['grabbed', 'held'].includes(this.g.gs.state);
    if (held) c.face = this.g.gs.state === 'held' ? P.yaw + Math.PI : P.yaw;   // restrained: back to you, facing where you face; grabbed: facing you
    const r = e.mesh.rotation; if (st !== 'out' || held) r.y += ang(c.face - r.y) * Math.min(1, dt * (held ? 14 : 6));
    e.mesh.position.x = e.x; e.mesh.position.z = e.z; e.mesh.position.y += ((e.y || 0) - e.mesh.position.y) * Math.min(1, dt * 8);
    H.face(st === 'out' ? OUT : (c.ai === 'fight' || c.ai === 'hostile') ? ANGER : (held || c.ai === 'cower' || st === 'stunned' || st === 'dazed') ? FEAR : {});
  }

  // ---------------------------------------------------------------- player controls
  // left mouse. false = not ours (madness, a phaser with charge in hand: js/kit.js fires it)
  primary() {
    if (!this.on()) return false; const C = this.C, G = C.G, K = G.kit, it = K?.inst, h = it && HANDHELDS[it.id];
    if (h?.weapon.ranged && !isBroken(it) && it.charge > 0 && !this.g) return false;
    if (this.restrained > 0 || this.ko > 0) { G.say(this.restrained > 0 ? 'You are restrained.' : 'You are still on the deck.', 'warn'); return true; }
    if (this.grabbedBy) { this.grabbedBy.gs.struggle = Math.min(1, this.grabbedBy.gs.struggle + 0.16); C.sound?.thud?.(0.15); this.vmPose = { k: 'elbow', t: 0.25 }; return true; }
    if (this.g) { if (this.g.gs.state === 'held') this.throwDown(); else if (this.g.gs.state === 'grabbed') this.shoveOff(); return true; }
    if (this.act || this.cool > 0) return true;
    if (G.carry || C.P.pushing) { G.say(G.carry ? `Hands full — [G] put the ${G.carry.name} down first.` : 'Let go of the cart first.', 'warn'); return true; }
    if (this.stance === 'handsup') this.setStance('fists', true);
    const item = h && !(h.weapon.ranged && it.charge > 0) ? it : null, a = item ? CB.swingAction(h.weapon.melee, it.id) : (G.time - this.lastStrike < 0.9 && this.combo % 2 === 0) ? CB.ACTIONS.cross : CB.ACTIONS.jab;
    this.combo = a.key === 'jab' ? 0 : this.combo + 1; if (a.key === 'jab') this.combo = 0; this.lastStrike = G.time;
    const tired = G.stamina < a.stamina; G.stamina = Math.max(0, G.stamina - a.stamina);
    this.act = { a, t: a.windup * (tired ? 1.5 : 1), phase: 'windup', item, hand: !item && a.key === 'jab' ? 'l' : 'r' }; this.n++;
    if (item) { K.swing = 1; } C.sound?.noise?.(0.14, 0.05, 1100, 1.4, 'bandpass'); return true;
  }
  // right mouse: down = grab the person in reach (hold to keep holding) or raise a guard; up = let go
  secondary(down) {
    if (!this.on()) return false; const C = this.C, G = C.G;
    if (!down) { if (this.g) this.release('let go'); this.guarding = false; return true; }
    if (this.restrained > 0 || this.ko > 0) return true;
    if (this.grabbedBy) { this.grabbedBy.gs.struggle = Math.min(1, this.grabbedBy.gs.struggle + 0.12); return true; }
    if (this.g) return true;
    const e = this.front(CB.ACTIONS.grab.range + 0.15, 0.55); if (e) { this.grab(e); return true; }
    this.guarding = true; if (this.stance === 'relaxed') this.setStance('fists', true); return true;
  }
  setStance(s, quiet = false) { this.stance = s; if (!quiet) this.C.G.say(s === 'fists' ? 'You square up. [LMB] strike · [RMB] grab / block' : s === 'handsup' ? 'Hands up — you back off. Most people calm down.' : 'You lower your hands.', ''); }
  grab(e) {
    const C = this.C, G = C.G; if (this.g) return false; if (G.carry || C.P.pushing) { G.say(G.carry ? `Hands full — [G] put the ${G.carry.name} down first.` : 'Let go of the cart first.', 'warn'); return false; }
    const c = this.takeOver(e); c.engT = G.time; const gs = CB.newGrapple(G.player.id, e.person.id); CB.gReach(gs); this.g = { e, gs, keep: true, t: 0 };
    G.stamina = Math.max(0, G.stamina - CB.ACTIONS.grab.stamina); if (this.stance !== 'fists') this.stance = 'fists'; this.noise(e, CB.ACTIONS.grab.noise); return true;
  }
  release(why = 'let go') {
    const g = this.g; if (!g) return; this.g = null; const e = g.e, c = e.cb, C = this.C, G = C.G; CB.gRelease(g.gs, why);
    const [tx, ty] = C.world.tile(e.x, e.z), room = C.world.d.room[ty]?.[tx], st = CB.stateOf(c.inj), wasHeld = g.gs.log.some(l => /held/.test(l));
    if (room === 'brig' && (wasHeld || st === 'out' || st === 'stunned')) return this.detain(e);
    if (st === 'ok' || st === 'hurt') this.afterHold(e);
  }
  // detained: let go of a restrained / knocked-out person inside the brig -> they stay there for a while (sim override, prio 2)
  detain(e) {
    const C = this.C, G = C.G, c = e.cb, S = G.sim; c.detained = true; c.ai = null; this.holdSim(e, false); c.simHeld = false;
    const s = S?.st?.get(e.person.id); if (S && s) { S.redirect(e.person, 'brig', 'cell', 240, 'detained', { prio: 2, site: { deckNo: G.shipDeck + 1, tx: s.tx, ty: s.ty } }); c.simHeld = true; }
    const prov = this.provoked(e); G.say(`${e.person.short} is locked in the brig.${prov === 'saboteur' || prov === 'hostile' ? ' Security: "Good work."' : ''}`, prov === 'none' ? 'warn' : 'good');
    if (prov === 'saboteur' || prov === 'hostile') { G.duty?.chain.push(`You delivered ${e.person.short} to the brig`); c.hostile = false; }
    else this.assault(e, 'restrain');
    c.detainT = 240; return true;
  }
  afterHold(e) { const c = e.cb; if (!c) return; const r = this.reaction(e, 'held'); this.begin(e, r.kind === 'freeze' ? 'cower' : r.kind, 0.15); }
  throwDown() {
    const g = this.g, C = this.C, G = C.G; if (!g) return; const e = g.e, D = this.nf(e), o = CB.gThrow(g.gs, this.pf(), D, G.runSeed + this.n++); G.stamina = Math.max(0, G.stamina - CB.ACTIONS.trip.stamina); this.g = null; this.vmPose = { k: 'shove', t: 0.3 };
    if (o?.hit) { this.hitNPC(e, o, { act: 'throw', from: C.P }); G.say(`You put ${e.person.short} on the deck.`, ''); } else { G.say(`${e.person.short} slips out of your hold!`, 'warn'); this.afterHold(e); }
  }
  // LMB while only grabbed (not yet restrained): shove them off you
  shoveOff() {
    const g = this.g, C = this.C, G = C.G; if (!g) return; const e = g.e; this.g = null; CB.gRelease(g.gs, 'shoved'); this.vmPose = { k: 'shove', t: 0.3 }; G.stamina = Math.max(0, G.stamina - CB.ACTIONS.shove.stamina);
    const o = CB.resolve('shove', this.pf(), this.nf(e), { held: true, n: this.n++ }, G.runSeed); this.hitNPC(e, o, { act: 'shove' });
  }
  restrain() { const g = this.g, G = this.C.G; if (!g) { const e = this.front(1.4); if (e) this.grab(e); return; } if (g.gs.state === 'held') return; if (CB.gRestrain(g.gs, this.pf(), this.nf(g.e), G.runSeed + this.n++)) { G.say(`You pin ${g.e.person.short}'s arms.`, ''); this.assault(g.e, 'restrain'); } else G.say(`${g.e.person.short} fights the hold.`, 'warn'); }
  subdue() {
    const g = this.g, C = this.C, G = C.G; if (!g) return; if (g.gs.state === 'grabbed') { this.restrain(); return; } if (g.gs.state !== 'held') return;
    const e = g.e, o = CB.gSubdue(g.gs, this.pf(), this.nf(e), G.runSeed + this.n++); G.stamina = Math.max(0, G.stamina - CB.ACTIONS.subdue.stamina);
    if (o?.hit) { this.g = null; this.hitNPC(e, o, { act: 'ko', quiet: true }); G.say(`${e.person.short} goes limp. Out cold — they will come round.`, ''); } else G.say(`${e.person.short} is still fighting you.`, 'warn');
  }
  // E: the arms locker in the armory (phasers for security; js/combat.js canDraw), or a word about someone who is down
  interact() {
    if (!this.on()) return false; const C = this.C, G = C.G, P = C.P, W = C.world;
    const down = this.front(2.2, 0.6); if (down?.cb && (CB.incapacitated(down.cb.inj) || down.cb.ctl || down.cb.fleeT > 0)) { G.say(CB.incapacitated(down.cb.inj) ? `${down.person.short} is ${CB.stateOf(down.cb.inj) === 'out' ? 'out cold' : 'stunned'}.` : `${down.person.short} is in no mood to talk.`, ''); return true; }
    const rack = this.rack(); if (!rack) return false; const K = G.kit; if (!K) return false;
    if (K.belt.some(x => x.id.startsWith('phaser'))) { G.say('You already carry a phaser.', ''); return true; }
    const a = CB.canDraw(G.player, { alertSev: G.comms?.alerts?.top()?.def.severity ?? 0, order: G.combatOrder || null }), inst = newInstance('phaser1', G.runSeed + 77);
    if (!K.add(inst)) { G.say('Your belt is full.', 'warn'); return true; }
    C.sound?.pickup?.();
    if (a.authorised) G.say(`You sign out a type-1 phaser (${a.why}). Set to stun. [click] fire · Shift+V setting`, 'good');
    else { for (const p of G.roster.people) if (p.dept === 'security' && !p.isPlayer) G.duty?._bump(p, a.penalty.trust); G.duty?.chain.push(a.penalty.chain); G.say('You take a phaser from the arms locker. There is no authorisation on file — security will not like this. (−trust)', 'warn'); this.armed = true; }
    return true;
  }
  rack() { const C = this.C, W = C.world, P = C.P; if (!W?.d) return null; const [tx, ty] = W.tile(P.x, P.z); if (W.d.room[ty]?.[tx] !== 'armory') return null; return W.d.props.find(p => p.kind === 'weaponrack' && Math.hypot(W.center(p.tx, p.ty)[0] - P.x, W.center(p.tx, p.ty)[1] - P.z) < 2.6) || null; }
  prompt() {
    if (!this.on()) return ''; if (this.rack()) return this.C.G.kit?.belt.some(x => x.id.startsWith('phaser')) ? 'Arms locker' : '[E] Draw a phaser from the arms locker';
    return '';
  }
  // quick wheel 'Hands' (js/menus.js): grab / release / restrain / subdue / throw, stance
  wheelKids() {
    const it = (id, icon, label, desc, run, o = {}) => ({ id, icon, label, desc, run, ...o }), g = this.g, e = this.front(1.5);
    return [
      it('h.grab', 'grab', 'Grab', e ? `Grab ${e.person.short}` : 'No one in reach', () => e && this.grab(e), { off: !e || !!g, why: g ? 'Already holding someone' : 'No one in reach', def: !g }),
      it('h.release', 'hand', 'Release', g ? `Let go of ${g.e.person.short}` : 'Not holding anyone', () => this.release('let go'), { off: !g, why: 'Not holding anyone', def: !!g }),
      it('h.restrain', 'lock', 'Restrain', 'Pin their arms (hold)', () => this.restrain(), { off: !g && !e, why: 'No one in reach' }),
      it('h.subdue', 'down', 'Subdue', 'Pin them until they pass out', () => this.subdue(), { off: g?.gs.state !== 'held', why: 'Restrain them first' }),
      it('h.throw', 'down', 'Throw down', 'Put them on the deck', () => this.throwDown(), { off: !g, why: 'Not holding anyone' }),
      it('h.fists', 'security', this.stance === 'fists' ? 'Lower fists' : 'Fists up', 'Stance: guard', () => this.setStance(this.stance === 'fists' ? 'relaxed' : 'fists')),
      it('h.up', 'hand', this.stance === 'handsup' ? 'Lower hands' : 'Hands up', 'Back off / surrender', () => this.setStance(this.stance === 'handsup' ? 'relaxed' : 'handsup')),
    ];
  }

  // ---------------------------------------------------------------- hits, reactions, consequences
  provoked(e) { const G = this.C.G, c = e.cb; if (G.phases?.saboteur === e.person) return 'saboteur'; if (c?.hostile) return 'hostile'; const t = this.provokers.get(e.person.id); return t !== undefined && G.time - t < 25 ? 'self-defence' : 'none'; }
  // a hit outcome lands on a crew member. o: { act: strike|shove|throw|ko|phaser|lethal, by: 'player' | ent, lethal, quiet, item }
  hitNPC(e, out, o = {}) {
    const C = this.C, G = C.G, c = this.takeOver(e), by = o.by || 'player', src = by === 'player' ? C.P : by, pr = e.person; c.engT = G.time; this.lastTarget = e; this.lastTargetT = G.time;
    if (!out.hit) { if (by === 'player') { G.say(out.evaded ? `${pr.short} ducks out of the way.` : `You miss ${pr.short}.`, ''); this.assault(e, 'shove', 0.6); if (!c.ai) this.begin(e, this.reaction(e, 'victim').kind, 0.2); } return; }
    const before = CB.stateOf(c.inj), st = CB.hurt(c.inj, out, { lethal: !!o.lethal }); c.struck = G.time;
    if (out.knock && src) { const dx = e.x - src.x, dz = e.z - src.z, d = Math.hypot(dx, dz) || 1, k = Math.min(1.2, out.knock * 0.18), q = { x: e.x + dx / d * k, z: e.z + dz / d * k, y: 0 }; C.world.resolve(q, 0.27); e.x = q.x; e.z = q.z; }
    if (st !== 'out' && st !== 'dead') c.one = { clip: out.blocked ? 'hit_chest' : (CB.ACTIONS[out.action]?.react || (out.dmg > 0.15 ? 'hit_head' : 'hit_chest')), t: 0.55, restart: true };
    if (src) c.face = Math.atan2(src.x - e.x, src.z - e.z); c.target = by === 'player' ? null : by;
    C.sound?.hit?.(); if (out.dmg > 0.12) C.sound?.thud?.(0.3); if (by === 'player') C.P.shake = Math.max(C.P.shake || 0, 0.12 + out.knock * 0.03);
    if (st === 'out' && before !== 'out') { C.sound?.thud?.(0.45); if (this.g?.e === e) this.g = null; c.ai = null; c.pend = null; }
    if (st === 'dead') { pr.status = 'dead'; G.sim?.drop?.(pr); c.ai = null; G.say(`${pr.short} is dead.`, 'warn'); }
    if (CB.incapacitated(c.inj)) { c.ai = null; c.pend = null; }
    if (by === 'player') { if (!o.quiet) G.say(`${out.blocked ? `${pr.short} blocks` : `You ${o.act === 'shove' ? 'shove' : o.act === 'throw' ? 'throw' : o.act === 'phaser' ? 'stun' : 'hit'} ${pr.short}`}${st === 'out' ? ' — out cold' : st === 'stunned' ? ' — stunned' : st === 'dazed' ? ' — dazed' : ''}.`, ''); this.assault(e, o.act || 'strike'); }
    if (!CB.incapacitated(c.inj) && (!c.ai || c.ai === 'watch' || c.ai === 'freeze' || c.ai === 'negotiate')) { const r = this.reaction(e, 'victim', by !== 'player' ? by : null); this.begin(e, r.kind, Math.min(r.delay, 0.6)); }
  }
  reaction(e, role, attacker = null) {
    const C = this.C, G = C.G, c = this.cb(e), S = G.social, vic = this.lastTarget?.person, me = e.person;
    const rel = attacker?.person ? S?.relation?.(me, attacker.person) : S?.relation?.(me, G.player), rival = !!rel && rel.valence < 0, fr = vic && vic !== me ? S?.relation?.(me, vic) : null;
    const ctx = { role, rankDiff: me.rank - (attacker?.person || G.player).rank, rival, provoked: attacker ? false : this.provoked(e) !== 'none' || (vic && this.provoked(this.lastTarget) !== 'none'), hostile: c.hostile, friendOfVictim: fr && fr.valence > 0 ? fr.strength : 0, injury: CB.stateOf(c.inj), handsUp: this.stance === 'handsup', alert: G.comms?.alerts?.top()?.def.severity ?? 0, stress: Math.min(1, (G.phases?.index || 0) / 4), n: c.n++ };
    if (role === 'witness' && this.lastTarget?.cb?.hostile) { ctx.provoked = false; ctx.hostile = true; ctx.friendOfVictim = 0.4; }
    return CB.react(me, ctx, G.runSeed);
  }
  // start a behaviour after a delay (reaction time); says a line when it starts
  begin(e, kind, delay = 0.3) { const c = this.takeOver(e); if (kind === 'flee' && c.ai === 'flee') return; c.pend = { kind, t: delay }; }
  start(e, kind) {
    const C = this.C, G = C.G, c = e.cb, pr = e.person, d = Math.hypot(e.x - C.P.x, e.z - C.P.z); if (kind !== 'flee' && (!c.ctl || c.fleeT > 0)) this.takeOver(e); c.ai = kind; c.t = 0; c.cd = 0.4 + hash01('cd0', G.runSeed, pr.id, c.n) * 0.5;
    const l = CB.line(kind === 'hostile' ? 'fight' : kind, G.runSeed + c.n, pr.id); if (l && d < 16) { G.say(`${pr.short}: "${l}"`, 'npc'); try { C.speak?.(pr, l); } catch (er) { } }
    if (kind === 'flee') { this.flee(e); }
    if (kind === 'call' && this.provoked(this.lastTarget || e) === 'none' && G.time - this.lastAssault < 30) this.callSecurity('player', `${pr.short} called it in`);
    if (kind === 'watch') c.t = -2;
  }
  flee(e) {
    const C = this.C, W = C.world, P = C.P, c = e.cb, [ex, ey] = W.tile(e.x, e.z); let best = null, bv = -1;
    for (let k = 0; k < 40; k++) { const t = W.d.openTiles[Math.floor(hash01('flee', C.G.runSeed, e.person.id, k, c.n) * W.d.openTiles.length)]; if (!t || W.isTube(t[0], t[1]) || W.d.grid[t[1]][t[0]] !== 0) continue; const [cx, cz] = W.center(t[0], t[1]), dp = Math.hypot(cx - P.x, cz - P.z), de = Math.hypot(cx - e.x, cz - e.z); if (de > 18) continue; const v = dp - de * 0.3; if (v > bv && dp > 9) { bv = v; best = t; } }
    c.ctl = false; const H = e.mesh.userData.human; if (H?._cbOrig) { H.update = H._cbOrig; delete H._cbOrig; H.add = null; }
    e.cower = true; if (best) C.startWalk(e, best[0], best[1], false, { run: true }); c.fleeT = 14;
  }
  // everyone who saw or heard it: bodies on the deck within sight (14 m) or hearing, plus people the sim has in the same room
  witnesses(victim, noise = 6) {
    const C = this.C, G = C.G, P = C.P, out = [], seen = new Set([victim.person.id, G.player.id]);
    for (const w of this.crew()) { if (seen.has(w.person.id)) continue; const d = Math.hypot(w.x - P.x, w.z - P.z), los = C.world.los(P.x, P.z, w.x, w.z); if (!((d < 14 && los) || CB.heard(noise, d, los))) continue; if (w.cb && CB.incapacitated(w.cb.inj)) continue; seen.add(w.person.id); out.push({ person: w.person, e: w }); }
    const room = G.duty?.place.room; for (const o of G.sim?.onDeck(G.shipDeck + 1) || []) if (o.room === room && room && !seen.has(o.person.id)) { seen.add(o.person.id); out.push({ person: o.person, e: null }); }
    const S = G.social; for (const w of out) { const r = S?.relation?.(w.person, victim.person); w.friend = r && r.valence > 0 ? r.strength : 0; w.sameDept = w.person.dept === victim.person.dept; }
    return out;
  }
  noise(e, n) { for (const w of this.crew()) if (w !== e && !w.cb?.ai && Math.hypot(w.x - e.x, w.z - e.z) < n && !(w.cb && CB.incapacitated(w.cb.inj))) { const c = this.cb(w); c.heard = this.C.G.time; } }
  // the player did something to e: trust, log, alert, security (js/combat.js consequence). Escalation only: the same act twice is not counted twice.
  assault(e, act, scale = 1) {
    const C = this.C, G = C.G, c = this.cb(e), sev = (CB.SEVERITY[act] ?? 0.5) * scale; if (sev <= c.sevDone + 0.05 && G.time - c.sevT < 20) return null;
    const first = c.sevDone === 0; c.sevDone = Math.max(c.sevDone, sev); c.sevT = G.time; const prov = this.provoked(e), wit = this.witnesses(e, CB.ACTIONS[act]?.noise ?? 6);
    const [tx, ty] = C.world.tile(e.x, e.z), room = C.world.d.room[ty]?.[tx] || 'corridor';
    const fx = CB.consequence({ act, attempt: scale < 1, victim: e.person, witnesses: wit, provoked: prov, offences: this.offences, roster: G.roster, room, seed: G.runSeed + this.n++ });
    CB.applyConsequence(fx, { duty: G.duty, phases: G.phases, alerts: G.comms?.alerts, roster: G.roster, deckNo: G.shipDeck + 1 }); this.log.push({ t: +G.time.toFixed(1), act, who: e.person.short, prov, sev: +sev.toFixed(2), wit: wit.length, security: fx.security }); if (this.log.length > 40) this.log.shift();
    if (fx.record?.kind === 'assault') { this.lastAssault = G.time; if (fx.security) this.offences++; if (wit.length || fx.security) G.say(`People saw that. (−trust${fx.security ? ' · security called' : ''})`, 'warn'); }
    if (fx.good && fx.chain.length) G.say(prov === 'saboteur' ? `${e.person.short} is down. Security: "That's our saboteur. Good work."` : `${e.person.short} is subdued. The crew breathe again. (+trust)`, 'good');
    if (fx.security) this.callSecurity('player', fx.alert?.reason);
    if (first || sev >= 0.7) for (const w of wit) if (w.e && !w.e.cb?.ai && !w.e.cb?.pend) { const r = this.reaction(w.e, 'witness'); if (r.kind !== 'watch' || hash01('wl', G.runSeed, w.person.id) < 0.3) this.begin(w.e, r.kind, r.delay); }
    return fx;
  }
  // js/kit.js: a phaser shot or a thrown handheld hits a crew member (melee swings in Nominal come through primary())
  onKitHit(e, r) {
    if (!this.on() || !e?.person || r.mode === 'melee') return false;
    const lethal = r.mode === 'ranged' && r.setting === 'kill', out = { hit: true, action: r.mode === 'ranged' ? 'phaser' : 'throw', dmg: lethal ? (r.dmg || 1) * 0.6 : (r.dmg || 0) * CB.DMG_PER_HP, stun: r.mode === 'ranged' && r.stun >= 4 ? Math.max(r.stun, 5) : r.stun || 0, knock: r.knock || 0, noise: r.noise || 6 };
    if (r.mode === 'ranged' && !lethal) out.ko = r.stun >= 7 ? 12 : 0;
    this.hitNPC(e, out, { act: lethal ? 'lethal' : r.mode === 'ranged' ? 'phaser' : 'strike', lethal }); return true;
  }

  // ---------------------------------------------------------------- security response
  callSecurity(suspect, reason = '') {
    const C = this.C, G = C.G, S = G.sim; if (this.sec && this.sec.suspect === suspect) return this.sec; if (suspect === 'player' && this.secEnd != null && this.lastAssault <= this.secEnd) return null;   // already dealt with: only a new assault brings them back
    const sp = suspect === 'player' ? G.player : suspect.person;
    const ppl = CB.responders(G.roster, { exclude: [sp], n: 2 }); if (!ppl.length) return null;
    const [tx, ty] = C.world.tile(suspect === 'player' ? C.P.x : suspect.x, suspect === 'player' ? C.P.z : suspect.z), room = C.world.d.room[ty]?.[tx] || G.duty?.place.room || 'corridor';
    for (const p of ppl) S?.redirect(p, room, 'door', 120, 'responding', { prio: 2, site: { deckNo: G.shipDeck + 1, tx, ty } });
    this.sec = { suspect, people: ppl, t: 0, phase: 'coming', deadline: 70, room, reason };
    if (suspect !== 'player') G.comms?.alerts?.raise('intruder', { scope: 'deck', deck: G.shipDeck + 1, source: 'security', reason: reason || `A violent crew member on deck ${G.shipDeck + 1}` });
    G.say(`Security (comm): "${ppl[0].short} responding${reason ? ' — ' + reason.replace(/ — security responding$/, '') : ''}."`, 'comp'); return this.sec;
  }
  secStep(dt) {
    const C = this.C, G = C.G, P = C.P, s = this.sec; if (!s) return; s.t += dt; const sp = s.suspect === 'player' ? P : s.suspect;
    if (s.suspect !== 'player' && (!C.ents.includes(s.suspect) || !s.suspect.cb?.hostile)) { if (!s.suspect.cb?.hostile && s.phase !== 'done') this.endSec(false); return; }
    if (s.phase === 'restraining') { s.rt -= dt; if (s.rt <= 0) this.endSec(true); return; }
    let arrived = null;
    for (const p of s.people) { const e = C.ents.find(x => x.simmed && x.person === p); if (!e) continue; const d = Math.hypot(e.x - sp.x, e.z - sp.z);
      if (!e.cb?.ctl || e.cb.ai !== 'arrest') {
        if (d > 7 || !C.world.los(e.x, e.z, sp.x, sp.z)) { const c = this.cb(e); if (G.time - (c.secWalkT ?? -99) > 3) { c.secWalkT = G.time; if (e.op) opEnd(e); const [tx, ty] = C.world.tile(sp.x, sp.z); C.startWalk(e, tx, ty, false, { run: true }); } continue; }   // home in on the suspect along real paths
        if (d < 22 && C.world.los(e.x, e.z, sp.x, sp.z)) { const c = this.takeOver(e, { sim: false }); c.ai = 'arrest'; c.pend = null; c.t = 0; } else continue; }
      if (CB.incapacitated(e.cb.inj)) continue; if (this.steer(e, sp.x, sp.z, 3.4, dt, 1.25)) arrived = arrived || e; }
    if (arrived && s.phase === 'coming') this.arrest(arrived);
    if (s.phase === 'coming' && s.t > s.deadline) { if (s.suspect === 'player') { G.duty?.chain.push('Security logged an assault report against you'); if (G.duty) G.duty.maxScore += 1; G.say('Security (comm): "We have your name. The captain will hear about this."', 'warn'); } this.endSec(false); }
  }
  arrest(sec) {
    const C = this.C, G = C.G, P = C.P, s = this.sec, c = sec.cb, H = sec.mesh.userData.human, pr = sec.person; s.phase = 'restraining'; s.by = sec;
    const l = CB.line('security', G.runSeed + s.t, pr.id); G.say(`${pr.short}: "${l}"`, 'npc'); try { C.speak?.(pr, l); } catch (er) { }
    const gun = loadoutFor(pr).find(i => i.startsWith('phaser'));
    if (s.suspect === 'player') {
      const violent = G.time - this.lastAssault < 8 || !!this.g, move = CB.securityMove(pr, { violent, handsUp: this.stance === 'handsup', state: this.ko > 0 ? 'stunned' : 'ok' }, !!gun);
      if (this.g) this.release('security');
      if (move === 'stun') { this.zap(sec, P.x, 1.3, P.z, gun); this.ko = Math.max(this.ko, 3); this.flashT = 0.6; P.shake = 0.5; G.say('A phaser stun bolt drops you to the deck.', 'warn'); }
      this.restrained = move === 'stun' ? 9 : 6; s.rt = this.restrained; this.stance = 'handsup';
    } else {
      const e = s.suspect, move = CB.securityMove(pr, { violent: true, state: CB.stateOf(e.cb.inj) }, !!gun);
      if (move === 'stun') { this.zap(sec, e.x, 1.2, e.z, gun); this.hitNPC(e, { hit: true, action: 'phaser', dmg: 0, stun: 7, knock: 0, ko: 12 }, { by: sec }); }
      else this.hitNPC(e, { hit: true, action: 'subdue', dmg: 0, stun: 6, ko: 12 }, { by: sec });
      if (this.g?.e === e) this.g = null; s.rt = 5;
    }
    c.face = Math.atan2(sp(s, P).x - sec.x, sp(s, P).z - sec.z); c.one = { clip: 'interact', t: 1.2, restart: true };
  }
  zap(sec, x, y, z, gun) {
    const C = this.C, H = sec.mesh.userData.human; C.sound?.phaser?.(); if (gun && H && !H.held?.hand_r) { holdItem(H, HANDHELDS[gun].model, 'hand_r'); sec.cb.gun = true; }
    const a = new THREE.Vector3(sec.x, 1.3, sec.z), b = new THREE.Vector3(x, y, z); if (!this.beam) { this.beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0xff9a3a, transparent: true })); this.beam.frustumCulled = false; C.scene.add(this.beam); } else this.beam.geometry.setFromPoints([a, b]);
    this.beam.visible = true; this.beamT = 0.18;
  }
  endSec(done) {
    const C = this.C, G = C.G, s = this.sec; if (!s) return; this.sec = null; if (s.suspect === 'player') this.secEnd = G.time;
    for (const p of s.people) { G.sim?.release(p, 2); const e = C.ents.find(x => x.simmed && x.person === p); if (e?.cb?.ai === 'arrest') { if (done) { const l = CB.line('securityDone', G.runSeed, p.id); G.say(`${p.short}: "${l}"`, 'npc'); } this.letGo(e); } }
    if (done && s.suspect === 'player') { G.duty?.chain.push('Security restrained you after an assault; the incident is logged for the captain'); if (G.duty) { G.duty.maxScore += 1; G.duty.stats.restrained = (G.duty.stats.restrained || 0) + 1; } G.say('Security lets you go with a warning. The incident is on your record.', 'warn'); this.restrained = 0; this.stance = 'relaxed'; }
    if (done && s.suspect !== 'player') { s.suspect.cb.hostile = false; G.duty?.chain.push(`Security restrained ${s.suspect.person.short}`); }
    const A = G.comms?.alerts; if (A?.get?.('intruder')?.source === 'security') A.clear('intruder');
  }
  // cabin fever (js/phases.js psychological mode, crisis): now and then someone on this deck snaps and lashes out; security comes for them
  snapStep(dt) {
    const C = this.C, G = C.G, ph = G.phases; if (!ph || ph.mode !== 'psychological' || ph.index < 2) return; this.snapT -= dt; if (this.snapT > 0) return; this.snapT = 110 + hash01('snap', G.runSeed, Math.floor(G.time)) * 90;
    const cand = this.crew().filter(e => e.simmed && !e.cb?.ai && !e.walk && Math.hypot(e.x - C.P.x, e.z - C.P.z) < 26 && (e.person.tags || []).some(t => /combat:(aggressive|reckless|panics)|stress:(snappy|short-tempered|brittle)/.test(t)));
    if (!cand.length) return; const e = cand[Math.floor(hash01('snapw', G.runSeed, G.time) * cand.length)], c = this.takeOver(e); c.hostile = true; this.provokers.set(e.person.id, G.time); c.pend = null; c.ai = 'hostile'; c.t = 0; c.cd = 1;
    const l = CB.line('snap', G.runSeed, e.person.id); G.say(`${e.person.short} snaps: "${l}"`, 'warn'); try { C.speak?.(e.person, l); } catch (er) { } this.callSecurity(e, `${e.person.short} is out of control`);
  }

  // ---------------------------------------------------------------- NPC behaviour
  steer(e, tx, tz, speed, dt, stop) {
    const c = e.cb, W = this.C.world, d0 = Math.hypot(tx - e.x, tz - e.z);
    // no clear straight line (a console, a wall corner, a doorway): follow the path field toward the target's tile one tile at a time
    if (d0 > stop + 0.3 && ![[0, 0], [0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]].every(([ox, oz]) => W.los(e.x + ox, e.z + oz, tx + ox, tz + oz))) {
      const [gx, gy] = W.tile(tx, tz), [ex, ey] = W.tile(e.x, e.z), f = this.C.pathField?.(gx, gy); let best = null, bv = f ? f[ex + ey * W.W] : -1;
      if (f) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const v = f[ex + a + (ey + b) * W.W]; if (v >= 0 && (bv < 0 || v < bv)) { bv = v; best = [ex + a, ey + b]; } }
      if (best) { const [cx, cz] = W.center(best[0], best[1]); const dx = cx - e.x, dz = cz - e.z, d = Math.hypot(dx, dz) || 1, s = Math.min(d, speed * CB.speedMul(c.inj) * dt), q = { x: e.x + dx / d * s, z: e.z + dz / d * s, y: 0 }; W.resolve(q, 0.27); e.x = q.x; e.z = q.z; c.face = Math.atan2(dx, dz); c.moving = speed * CB.speedMul(c.inj); return false; }
    }
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz); c.face = Math.atan2(dx, dz);
    if (d <= stop) { c.moving = 0; return true; } const s = Math.min(d - stop, speed * CB.speedMul(c.inj) * dt), q = { x: e.x + dx / d * s, z: e.z + dz / d * s, y: 0 }; this.C.world.resolve(q, 0.27); e.x = q.x; e.z = q.z; c.moving = speed * CB.speedMul(c.inj); return false;
  }
  npcStep(e, dt) {
    const C = this.C, G = C.G, P = C.P, c = e.cb; if (!c) return; if (!C.ents.includes(e)) { this.active.delete(e); return; }
    const st = CB.recover(c.inj, dt, { medic: false }); c.stam = Math.min(100, c.stam + dt * 6); c.cd -= dt; c.t += dt; if (c.one) c.one.t -= dt; c.guard = Math.max(0, c.guard - dt); c.moving = 0;
    if (c.detained) { c.detainT -= dt; if (c.detainT <= 0) { c.detained = false; c.simHeld = true; this.holdSim(e, false); this.letGo(e); } else if (c.ctl) { e.walk = null; } return; }
    if (c.wasOut && st !== 'out') { c.wasOut = false; if (c.hostile) { c.hostile = false; c.ai = null; this.C.G.say(`${e.person.short} comes round, shaking. The fight has gone out of them.`, ''); } } if (st === 'out') c.wasOut = true;
    if (c.fleeT > 0) { c.fleeT -= dt; if (!e.walk || c.fleeT <= 0) { c.fleeT = 0; c.ai = null; e.cower = false; this.holdSim(e, false); if (st === 'ok') this.active.delete(e); } return; }
    if (!c.ctl && CB.incapacitated(c.inj)) this.takeOver(e);
    if (!c.ctl) { if (e.walk && st === 'hurt') e.v = Math.min(e.v || 0, 1.3 * CB.speedMul(c.inj)); if (st === 'ok' || (st === 'hurt' && G.time - c.struck > 60)) { if (!c.ai) this.active.delete(e); } return; }
    e.walk = null; e.turning = undefined; if (e.op) opEnd(e);
    if (CB.incapacitated(c.inj)) { this.holdSim(e, true); return; }
    if (this.g?.e === e) return;   // in the player's hands: the grapple step moves it
    if (c.pend) { c.pend.t -= dt; if (c.pend.t <= 0) { const k = c.pend.kind; c.pend = null; this.start(e, k); } return; }
    const tgt = c.target && C.ents.includes(c.target) && !CB.incapacitated(c.target.cb?.inj || CB.newInjury()) ? c.target : null, d = Math.hypot(e.x - P.x, e.z - P.z);
    switch (c.ai) {
      case 'fight': case 'hostile': {
        const foe = tgt || (c.ai === 'hostile' ? this.nearestFoe(e) : null), fx = foe ? foe.x : P.x, fz = foe ? foe.z : P.z, fd = Math.hypot(e.x - fx, e.z - fz);
        if (c.ai === 'fight' && (st === 'hurt' && c.inj.hp < 0.45)) { this.start(e, 'flee'); break; }
        if (c.ai === 'fight' && this.stance === 'handsup' && !c.hostile && c.t > 1) { G.say(`${e.person.short}: "Fine. Stay away from me."`, 'npc'); this.calm(e); break; }
        if (this.ko > 0 && !foe) { if (c.t > 2) { G.say(`${e.person.short}: "Stay down."`, 'npc'); this.calm(e); } break; }
        if ((c.ai === 'fight' && (c.t > 28 || fd > 14)) || (c.ai === 'hostile' && c.t > 90)) { this.calm(e); break; }
        if (!this.steer(e, fx, fz, fd > 3 ? 3.0 : 1.6, dt, 0.95) && fd > 1.2) break;   // close in (a prop in the way: swing from where they are)
        if (c.cd <= 0 && !(c.one?.t > 0)) this.npcAttack(e, foe);
        break;
      }
      case 'defend': {
        const vic = this.g?.e; if (c.t > 12 || d > 14) { this.calm(e); break; }
        if (!this.steer(e, P.x, P.z, 3.0, dt, 1.0)) break; if (c.cd <= 0) { c.cd = 2.2; c.one = { clip: 'push', t: 0.6, restart: true }; const o = CB.resolve('shove', this.nf(e), this.pf(), { n: c.n++, blocking: this.guarding }, G.runSeed); if (o.hit) { this.hitPlayer(e, o); if (vic && this.g) { this.g.gs.struggle = Math.min(1, this.g.gs.struggle + 0.5); } } if (!vic && c.t > 3) this.calm(e); }
        break;
      }
      case 'negotiate': { if (d > 2.2) this.steer(e, P.x, P.z, 1.2, dt, 2.0); else c.face = Math.atan2(P.x - e.x, P.z - e.z); if (c.t > 6 && G.time - this.lastAssault > 4) { if (this.stance === 'handsup') G.duty?._bump(e.person, 0.02); this.calm(e); } break; }
      case 'freeze': c.face = Math.atan2(P.x - e.x, P.z - e.z); if (c.t > 1.6 + hash01('fz', e.person.id) * 1.2) { const r = this.reaction(e, 'witness'); this.start(e, r.kind === 'freeze' || r.kind === 'watch' ? 'cower' : r.kind); } break;
      case 'cower': c.face = Math.atan2(P.x - e.x, P.z - e.z); if (c.t > 7 && G.time - this.lastAssault > 4 && !this.g) this.calm(e); break;
      case 'call': if (c.t > 1.8) this.start(e, hash01('cf', e.person.id) < 0.5 ? 'cower' : 'flee'); break;
      case 'watch': c.face = Math.atan2(P.x - e.x, P.z - e.z); if (c.t > 4) this.calm(e); break;
      case 'arrest': break;   // secStep drives it
      default: if (!c.pend && G.time - c.struck > 1.2) this.calm(e);
    }
  }
  nearestFoe(e) { let best = null, bd = 9; for (const o of this.crew()) { if (o === e || (o.cb && CB.incapacitated(o.cb.inj))) continue; const d = Math.hypot(o.x - e.x, o.z - e.z); if (d < bd && this.C.world.los(e.x, e.z, o.x, o.z)) { bd = d; best = o; } } const dp = Math.hypot(this.C.P.x - e.x, this.C.P.z - e.z); return dp < bd + 1.5 ? null : best; }
  calm(e) { const c = e.cb; if (!c) return; c.ai = null; c.pend = null; this.letGo(e); }
  // an NPC swings at the player (foe = null) or at another crew member
  npcAttack(e, foe) {
    const C = this.C, G = C.G, P = C.P, c = e.cb, A = this.nf(e), w = A.w, roll = hash01('npca', G.runSeed, e.person.id, c.n++);
    const behind = foe ? CB.isBehind(foe.mesh.rotation.y, e.x - foe.x, e.z - foe.z) : CB.isBehind(P.yaw + Math.PI, e.x - P.x, e.z - P.z);
    const key = !foe && behind && (c.hostile || (w.fight || 0) > 0.5) && !this.grabbedBy && roll < 0.45 ? 'grab' : roll < 0.55 ? 'jab' : roll < 0.82 ? 'cross' : 'shove', a = CB.ACTIONS[key];
    c.cd = a.windup + a.recover + 0.5 + hash01('npccd', e.person.id, c.n) * 0.8; c.stam = Math.max(0, c.stam - a.stamina); c.one = { clip: a.clip || 'punch_jab', t: Math.max(0.5, a.windup + 0.35), restart: true };
    const land = () => {
      if (!C.ents.includes(e) || CB.incapacitated(c.inj) || this.g?.e === e) return;
      if (foe) { if (Math.hypot(foe.x - e.x, foe.z - e.z) > a.range + 0.3) return; const o = CB.resolve(key === 'grab' ? 'cross' : key, A, this.nf(foe), { behind, n: c.n }, G.runSeed); this.hitNPC(foe, o, { by: e }); return; }
      if (Math.hypot(P.x - e.x, P.z - e.z) > a.range + 0.35) return;
      const evading = P.mode === 'slide' || Math.hypot(P.vx || 0, P.vz || 0) > 4.2, o = CB.resolve(key, A, this.pf(), { behind, aware: !behind, n: c.n, blocking: this.guarding, evading }, G.runSeed);
      if (key === 'grab') { if (o.hit) { const gs = CB.newGrapple(e.person.id, G.player.id); gs.state = 'grabbed'; this.grabbedBy = { e, gs, t: 0 }; G.say(`${e.person.short} grabs you from behind! [click] to break free`, 'warn'); P.shake = 0.3; } return; }
      if (o.hit) this.hitPlayer(e, o); else if (o.evaded) G.say('You slip the punch.', ''); else if (o.blocked) G.say('You block it.', '');
    };
    c.landT = a.windup + 0.12; c.land = land;
  }
  hitPlayer(e, o) {
    const C = this.C, G = C.G, P = C.P; if (!o.hit) return; const dmg = o.dmg * HP_SCALE; G.hp = Math.max(0, G.hp - dmg); this.flashT = 0.35; P.shake = Math.max(P.shake || 0, 0.22 + o.knock * 0.06); C.sound?.hit?.();
    const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz) || 1; P.kbx = (P.kbx || 0) + dx / d * o.knock * 1.4; P.kbz = (P.kbz || 0) + dz / d * o.knock * 1.4; this.stagger = Math.max(this.stagger, 0.25 + o.stun * 0.4);
    if (!(this.provokers.has(e.person.id)) && (e.cb?.sevDone || 0) === 0) this.provokers.set(e.person.id, G.time);   // they started it: hitting back is self-defence
    if (G.hp <= 1) { G.hp = 12; this.ko = 4; this.flashT = 1; if (this.g) this.release('knocked down'); G.say(`${e.person.short} knocks you to the deck. You are winded, not dead.`, 'warn'); G.duty?.chain.push(`${e.person.short} knocked you down in a fight`); }
    else G.say(`${e.person.short} ${o.action === 'shove' ? 'shoves' : 'hits'} you${o.blocked ? ' (blocked)' : ''}.`, 'warn');
  }

  // ---------------------------------------------------------------- tick
  tick(dt) {
    const C = this.C; if (!C?.G) return; const G = C.G, P = C.P;
    if (G.mode === 'madness') { this.hud.update(null); return; }
    if (C.world !== this.world || G.player !== this.who) { this.reset(); }
    if (G.phase !== 'play') { this.hud.update(null); return; }
    this.cool = Math.max(0, this.cool - dt); this.stagger = Math.max(0, this.stagger - dt); this.flashT = Math.max(0, this.flashT - dt); this.ko = Math.max(0, this.ko - dt); if (this.restrained > 0 && this.sec?.phase !== 'restraining') this.restrained = Math.max(0, this.restrained - dt);
    if (this.beamT > 0) { this.beamT -= dt; if (this.beamT <= 0 && this.beam) this.beam.visible = false; }
    // the player's strike: windup -> contact -> recover
    const a = this.act; if (a) { a.t -= dt; if (a.phase === 'windup' && a.t <= 0) { this.contact(a); a.phase = 'recover'; a.t = a.a.recover; } else if (a.phase === 'recover' && a.t <= 0) { this.act = null; this.cool = 0.05; } }
    // the grapple: hold point, struggle, drag
    if (this.g) this.holdStep(dt);
    if (this.grabbedBy) this.grabbedStep(dt);
    for (const e of [...this.active]) { this.npcStep(e, dt); const c = e.cb; if (c?.landT > 0) { c.landT -= dt; if (c.landT <= 0) { const f = c.land; c.land = null; f?.(); } } }
    this.secStep(dt); this.snapStep(dt); this.workStep(dt);
    const hold = this.g ? (this.g.gs.state === 'held' ? 0.55 : 0.62) * (this.g.e.cb && CB.incapacitated(this.g.e.cb.inj) ? 0.75 : 1) : 1;
    P.cbSlow = this.restrained > 0 || this.ko > 0 ? 0 : this.grabbedBy ? 0.12 : Math.min(hold, this.stagger > 0 ? 0.45 : 1, this.guarding ? 0.7 : 1);
    const hs = this.hudState(); if (hs.engaged && G.hud2 && hs.hint) { G.hud2.setHint(hs.hint); hs.hint = ''; }   // in a fight the duty hint line carries the controls; otherwise our own quiet #cb-hint
    this.vmStep(dt); this.hud.update(hs);
  }
  contact(a) {
    const C = this.C, G = C.G, P = C.P, act = a.a, e = this.front(act.range + 0.25, 0.55); this.vmPose = { k: 'punch', t: 0.22, hand: a.hand };
    if (a.item) { const r = hhStrike(a.item, 'melee', G.runSeed + this.n++); if (r.broke) G.say(`The ${HANDHELDS[a.item.id].name} cracks — it will not ${HANDHELDS[a.item.id].job.verbs[0]} any more.`, 'warn'); if (isBroken(a.item)) act.dmg *= 0.6; }
    if (!e) { if (!this.missSaid) { this.missSaid = true; G.say('You swing at the air.', ''); } return; }
    const behind = CB.isBehind(e.mesh.rotation.y, P.x - e.x, P.z - e.z), c = this.cb(e), aware = !!c.ai || G.time - (c.heard || -99) < 6;
    const out = CB.resolve(act, this.pf(), this.nf(e), { behind, aware, held: false, blocking: c.guard > 0, n: this.n++ }, G.runSeed);
    if (out.hit && behind && !aware && act.kind === 'strike' && !a.item && out.stun < 1.2) out.stun = 1.2;   // a sucker punch from behind dazes
    this.hitNPC(e, out, { act: act.kind === 'shove' ? 'shove' : 'strike', item: a.item?.id });
  }
  holdStep(dt) {
    const C = this.C, G = C.G, P = C.P, g = this.g, e = g.e, c = e.cb; if (!C.ents.includes(e)) { this.g = null; return; } g.t += dt;
    const A = this.pf(), D = this.nf(e); A.stamina = G.stamina; const behind = CB.isBehind(e.mesh.rotation.y, P.x - e.x, P.z - e.z);
    const ev = CB.gStep(g.gs, dt, A, D, { keep: g.keep, behind, aware: !!c.ai }, G.runSeed + this.n); G.stamina = A.stamina; c.stam = D.stamina;
    if (ev === 'miss') { G.say(`${e.person.short} twists out of reach.`, ''); this.g = null; this.assault(e, 'grab', 0.6); this.afterHold(e); return; }
    if (ev === 'grabbed') { C.sound?.thud?.(0.18); const r = this.reaction(e, 'held'); c.ai = r.kind; c.pend = null; c.t = 0; const l = CB.line('held', G.runSeed + c.n, e.person.id); if (!CB.incapacitated(c.inj)) { G.say(`${e.person.short}: "${l}"`, 'npc'); try { C.speak?.(e.person, l); } catch (er) { } } this.assault(e, 'grab'); }
    if (ev === 'held') { G.say(`You pin ${e.person.short}'s arms behind their back.`, ''); this.assault(e, 'restrain'); }
    if (ev === 'broken') { this.g = null; G.say(`${e.person.short} breaks free!`, 'warn'); const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz) || 1; P.kbx = dx / d * 3; P.kbz = dz / d * 3; this.stagger = 0.4; c.ai = null; this.afterHold(e); return; }
    if (ev === 'released' || CB.gTerminal(g.gs)) { this.g = null; return; }
    if (g.gs.state === 'reach') return;
    // the hold point: in front of you; the body follows (dragged when out cold), walls stop it; lose the grip if it snags far behind
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), k = g.gs.state === 'held' ? 0.62 : 0.72, hx = P.x + fx * k, hz = P.z + fz * k, q = { x: e.x + (hx - e.x) * Math.min(1, dt * 12), z: e.z + (hz - e.z) * Math.min(1, dt * 12), y: 0 };
    C.world.resolve(q, 0.25); e.x = q.x; e.z = q.z; if (Math.hypot(e.x - hx, e.z - hz) > 1.3) { G.say(`You lose your grip on ${e.person.short}.`, 'warn'); this.release('snagged'); }
  }
  grabbedStep(dt) {
    const C = this.C, G = C.G, P = C.P, b = this.grabbedBy, e = b.e; b.t += dt;
    if (!C.ents.includes(e) || CB.incapacitated(e.cb?.inj || CB.newInjury())) { this.grabbedBy = null; return; }
    const A = this.nf(e), D = this.pf(); D.reaction = 'fight'; const ev = CB.gStep(b.gs, dt, A, D, { keep: true }, G.runSeed); G.stamina = D.stamina; e.cb.stam = A.stamina;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), q = { x: P.x - fx * 0.55, z: P.z - fz * 0.55, y: 0 }; C.world.resolve(q, 0.25); e.x += (q.x - e.x) * Math.min(1, dt * 10); e.z += (q.z - e.z) * Math.min(1, dt * 10); e.cb.face = Math.atan2(P.x - e.x, P.z - e.z); P.shake = Math.max(P.shake || 0, 0.06);
    if (ev === 'broken') { this.grabbedBy = null; G.say(`You break ${e.person.short}'s grip!`, 'good'); e.cb.inj.stun = Math.max(e.cb.inj.stun, 0.8); e.cb.one = { clip: 'hit_chest', t: 0.5, restart: true }; e.cb.cd = 1.2; return; }
    if (b.t > 3.6) { this.grabbedBy = null; this.hitPlayer(e, { hit: true, action: 'trip', dmg: CB.ACTIONS.trip.dmg, stun: 1.5, knock: 2 }); G.say(`${e.person.short} throws you down.`, 'warn'); e.cb.cd = 1.5; }
  }
  // injured crew work slower: a repair job led by someone hurt loses part of its progress (js/repair.js jobs)
  workStep(dt) {
    const R = this.C.G.repair; if (!R?.jobs) return;
    for (const j of R.jobs.values()) { if (j.state !== 'working' || !j.lead) continue; const e = [...this.active].find(x => x.person === j.lead.person); if (e?.cb) j.progress = Math.max(0, j.progress - dt * (1 - CB.workMul(e.cb.inj))); }
  }
  engaged() { return !!(this.g || this.act || this.grabbedBy || this.restrained > 0 || this.ko > 0 || this.guarding || this.stance !== 'relaxed' || [...this.active].some(e => e.cb?.ctl && (e.cb.ai === 'fight' || e.cb.ai === 'hostile' || e.cb.ai === 'arrest'))); }
  hudState() {
    const C = this.C, G = C.G, g = this.g, inReach = !g && this.front(1.5);
    const tgt = g?.e || (this.lastTarget && G.time - this.lastTargetT < 8 && C.ents.includes(this.lastTarget) ? this.lastTarget : null) || inReach;
    let hint = '';
    if (this.restrained > 0) hint = 'Restrained by security'; else if (this.ko > 0) hint = 'Knocked down — getting up…';
    else if (this.grabbedBy) hint = 'Grabbed! [click] to break free';
    else if (g?.gs.state === 'reach') hint = 'Reaching…';
    else if (g?.gs.state === 'grabbed') hint = 'Holding — keep [RMB] held to restrain · [LMB] throw down · let go of [RMB] to release';
    else if (g?.gs.state === 'held') hint = 'Restrained — walk to drag · [LMB] throw down · [C] subdue · let go of [RMB] to release';
    else if (inReach) hint = this.stance === 'handsup' ? 'Hands up · [LMB] fists' : '[LMB] strike · [RMB] grab';
    else if (this.guarding) hint = 'Blocking';
    this.hint = hint; const tc = tgt?.cb, ti = tc?.inj;
    return { stance: this.stance, hint, engaged: this.engaged(), grab: g ? { state: g.gs.state, struggle: +g.gs.struggle.toFixed(2), who: g.e.person.short } : null, grabbedYou: this.grabbedBy ? { struggle: +this.grabbedBy.gs.struggle.toFixed(2), who: this.grabbedBy.e.person.short } : null,
      target: tgt ? { name: tgt.person.short, hp: ti ? +ti.hp.toFixed(2) : 1, stun: ti ? +Math.min(1, ti.stun / 6 + (ti.out > 0 ? 1 : 0)).toFixed(2) : 0, state: ti ? CB.stateOf(ti) : 'ok', restrained: g?.e === tgt && g.gs.state === 'held' || !!tc?.detained, ai: tc?.ai || null } : null,
      restrained: this.restrained > 0, ko: this.ko > 0, hit: this.flashT > 0, guarding: this.guarding };
  }

  // ---------------------------------------------------------------- first-person hands (capsule forearms + fists, like js/actors.js makeViewmodel)
  vmBuild() {
    const C = this.C; if (!C.vmScene || this.vm) return; const g = new THREE.Group(), skin = new THREE.MeshStandardMaterial({ color: 0xd9a47c, roughness: 0.6 }), cloth = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.9 });
    const arm = (s) => { const a = new THREE.Group(), sl = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.22, 4, 10), cloth), fist = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), skin), th = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.03, 3, 6), skin);
      sl.rotation.x = Math.PI / 2; sl.position.z = 0.14; fist.scale.set(1, 0.85, 1.15); th.position.set(-0.03 * s, 0.015, -0.01); th.rotation.z = 0.9 * s; a.add(sl, fist, th); a.traverse(o => { if (o.isMesh) o.renderOrder = 10; }); return a; };
    this.vmL = arm(-1); this.vmR = arm(1); g.add(this.vmL, this.vmR); g.visible = false; C.vmScene.add(g); this.vm = g;
  }
  vmStep(dt) {
    const C = this.C, G = C.G, P = C.P; this.vmBuild(); if (!this.vm) return; if (this.vmPose) { this.vmPose.t -= dt; if (this.vmPose.t <= 0) this.vmPose = null; }
    const item = !!(G.kit?.inst && !G.carry), show = G.phase === 'play' && !P.cart && !G.carry && (this.stance !== 'relaxed' || this.g || this.act || this.grabbedBy || this.vmPose || this.guarding); this.vm.visible = show; if (!show) return;
    const b = Math.sin((P.bob || 0) * 1.1) * 0.01, A = this.act, wind = A && A.phase === 'windup' ? 1 - Math.max(0, A.t) / Math.max(0.01, A.a.windup) : 0, vp = this.vmPose;
    const L = { x: -0.17, y: -0.2, z: -0.4, rx: 0.2 }, R = { x: 0.17, y: -0.21, z: -0.38, rx: 0.2 };
    if (this.stance === 'handsup' && !this.g) { L.y = R.y = -0.02; L.z = R.z = -0.42; L.x = -0.24; R.x = 0.24; L.rx = R.rx = -1.2; }
    if (this.g || this.grabbedBy) { L.x = -0.12; R.x = 0.12; L.y = R.y = -0.16 - (this.g?.gs.state === 'held' ? 0.05 : 0); L.z = R.z = -0.52; const s = this.g ? this.g.gs.struggle : this.grabbedBy.gs.struggle, j = Math.sin(G.time * 31) * 0.02 * s; L.x += j; R.x -= j; }
    if (this.guarding) { L.y = R.y = -0.1; L.z = R.z = -0.33; L.x = -0.1; R.x = 0.1; }
    const strikeR = (A && A.hand === 'r') || vp?.hand === 'r' || vp?.k === 'shove', strikeL = (A && A.hand === 'l') || vp?.hand === 'l' || vp?.k === 'shove' || vp?.k === 'elbow';
    const reach = vp?.k === 'punch' || vp?.k === 'shove' ? Math.max(0, vp.t / 0.22) : wind * 0.25;
    if (strikeR) { R.z -= reach * 0.26; R.x -= reach * 0.08; R.y += reach * 0.06; } if (strikeL) { L.z -= reach * 0.26; L.x += reach * 0.08; L.y += reach * 0.06; }
    this.vmR.visible = !item; for (const [m, p] of [[this.vmL, L], [this.vmR, R]]) { m.position.x += (p.x - m.position.x) * Math.min(1, dt * 18); m.position.y += (p.y + b - m.position.y) * Math.min(1, dt * 18); m.position.z += (p.z - m.position.z) * Math.min(1, dt * 22); m.rotation.x += (p.rx - m.rotation.x) * Math.min(1, dt * 12); }
  }
}
const sp = (s, P) => s.suspect === 'player' ? P : s.suspect;
