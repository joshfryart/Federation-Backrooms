// Player handheld kit (belt slots + one in hand) and NPC worn kit — the game glue for js/handhelds.js.
//   new Kit(person)     belt from loadoutFor(person); hand = index into belt or -1 (empty hand; in madness the zapper)
//   kit.cycle()  [V]    next item in hand;   kit.useJob() [X]  the item's job;   kit.attack()  left mouse: shoot (phasers) or swing;   kit.throwIt() [T]
//   kit.repairMul()     multiplier on hold-E repair speed from the item in hand (and a carried toolbox);  kit.tick(dt) / prompt()
//   wearKit(e)          NPC: hang the billet's handhelds on the body (hip / back) once
// Uses the context handed to initHaul (js/haul.js) plus { gorns, killMad, nearestRepair } from js/main.js.
import * as THREE from 'three';
import { HANDHELDS, newInstance, isBroken, useJob, strike, cycleSetting, displayName, loadoutFor } from './handhelds.js';
import { ITEMS } from './equipment.js';
import { makeItemMesh, holsterItem } from './carry.js';
import { ctx as hctx, opStart, opEnd } from './haul.js';

const press = (code) => { for (const t of ['keydown', 'keyup']) dispatchEvent(new KeyboardEvent(t, { code })); };   // the badge / PADD / lamp reuse the existing key handlers
const SLOT_OF = (id) => { const h = HANDHELDS[id]; return h.holster === 'back' ? 'back' : h.holster === 'belt' ? (id.startsWith('phaser') ? 'hip_r' : id.startsWith('tricorder') ? 'hip_l' : 'belt_back') : null; };
export function wearKit(e) {
  const H = e.mesh?.userData.human; if (!H || e.kitWorn || !e.person) return; e.kitWorn = {};
  for (const id of loadoutFor(e.person)) { const slot = SLOT_OF(id); if (!slot || e.kitWorn[slot]) continue; const h = holsterItem(H, HANDHELDS[id].model, slot); if (h) e.kitWorn[slot] = { id, model: HANDHELDS[id].model, holder: h }; }
}
// hide the holstered copy while the same model is in the hand
export function syncWorn(e, inHand) { for (const w of Object.values(e.kitWorn || {})) w.holder.visible = w.model !== inHand; }

export class Kit {
  constructor(person, seed = 1, ids = null) { this.belt = (ids || (person ? loadoutFor(person) : ['commbadge'])).map((id, i) => newInstance(id, seed + i)); this.hand = -1; this.cd = 0; this.swing = 0; this.vm = null; this.vmId = null; this.timers = []; this.seed = seed; this.n = 0; }
  get C() { return hctx(); }
  cycleSetting() { return cycleSetting(this.inst); }
  get inst() { return this.hand >= 0 ? this.belt[this.hand] : null; }
  add(inst) { if (this.belt.length >= 5) return false; this.belt.push(inst); this.hand = this.belt.length - 1; return true; }
  cycle() { this.hand = this.hand + 1 >= this.belt.length ? -1 : this.hand + 1; const G = this.C.G; G.say(this.inst ? `In hand: ${displayName(this.inst)}` : 'Hands empty.', ''); return this.inst; }
  equip(id) { const i = this.belt.findIndex(x => x.id === id); if (i < 0) return null; this.hand = i; return this.inst; }
  repairMul() { const it = this.inst, h = HANDHELDS[it?.id], carry = ITEMS[this.C.G.carry?.item]?.tool || 1; return Math.max(carry, h && !isBroken(it) ? (h.job.repairMul || 1) : 1); }
  front(list, range, dot = 0.75) { const P = this.C.P, fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); let best = null, bd = range; for (const t of list) { const dx = t.x - P.x, dz = t.z - P.z, d = Math.hypot(dx, dz); if (d < bd && (dx * fx + dz * fz) / (d || 1) > dot && this.C.world.los(P.x, P.z, t.x, t.z)) { bd = d; best = t; } } return best; }
  crew() { return this.C.ents.filter(e => e.kind === 'crew' && e.person && e.mesh); }
  // ---- the job: what each item does when used (X)
  useJob() {
    const C = this.C, G = C.G, P = C.P, it = this.inst; if (!it) { G.say('Nothing in hand. [V] takes something off your belt.', 'warn'); return null; }
    const h = HANDHELDS[it.id], r = useJob(it); if (!r.ok) { G.say(r.why, 'warn'); return r; }
    const say = (t, k = 'comp') => G.say(`${h.name}: ${t}`, k), S = G.shipState, near = this.front(this.crew(), 2.4, 0.5);
    switch (r.effect) {
      case 'faults': { const f = S?.faulted?.() || []; const rp = C.nearestRepair?.(true); say(rp ? `${rp.sys} — ${S.status(rp.sys)}. Hold E: repairs ${Math.round((h.job.repairMul - 1) * 100)}% faster with this in hand.` : f.length ? `faults: ${f.map(s => s.name).slice(0, 4).join(', ')}` : 'all readings nominal.'); break; }
      case 'vitals': if (near) { G.duty?._bump(near.person, r.heal); say(`${near.person.short}: pulse ${62 + (near.person.id % 30)}, stress ${near.cower ? 'high' : 'normal'}.`); } else say(`you: ${Math.round(G.hp)}% — ${G.hp < 50 ? 'see a medic' : 'fit for duty'}.`); break;
      case 'heal': if (near) { G.duty?._bump(near.person, r.heal); near.stunT = 0; say(`you treat ${near.person.short}. (+trust)`, 'good'); } else { G.hp = Math.min(G.maxHp, G.hp + r.selfHeal); say(`+${r.selfHeal} health.`, 'good'); } break;
      case 'room': { C.world.reveal(P.x, P.z, 9); const [tx, ty] = C.world.tile(P.x, P.z), room = C.world.d.room[ty]?.[tx]; const items = (C.world.clutter || []).filter(c => Math.hypot(c.x - P.x, c.z - P.z) < 9).map(c => c.name); say(`${room || 'corridor'}: ${items.length ? items.slice(0, 4).join(', ') : 'nothing loose'}${items.length > 4 ? '…' : ''}. Map updated.`); break; }
      case 'people': { const c = this.crew(), fake = c.filter(e => e.fake && Math.hypot(e.x - P.x, e.z - P.z) < 14); say(`${c.length} life signs on this deck${fake.length ? ` — one ${Math.round(Math.hypot(fake[0].x - P.x, fake[0].z - P.z))} m away does not read human` : ''}.`, fake.length ? 'warn' : 'comp'); break; }
      case 'hull': { const ph = G.phases?.status?.(); say(ph?.mode === 'hull_fatigue' ? `microfractures — ${Math.round((ph.severity || 0) * 100)}% fatigue.` : 'hull plating within tolerance.'); break; }
      case 'air': say(`life support ${S?.status?.('life') || 'nominal'}; O2 ${S?.status?.('life') === 'nominal' ? '20.9' : '18.4'}%.`); break;
      case 'radio': press('KeyH'); break;
      case 'duty': press('KeyJ'); break;
      case 'light': press('KeyF'); break;
      case 'fire': { const a = G.comms?.alerts; if (a?.active?.().some(x => x.id === 'fire')) { a.clear?.('fire'); say('fire knocked down.', 'good'); } else say('a cloud of powder. Nothing was burning.'); break; }
      case 'clean': if (near) G.duty?._bump(near.person, 0.01); say('you mop the deck. Someone notices.'); break;
      case 'heat': if (G.carry && ['cup', 'tray', 'ration'].includes(G.carry.item)) { G.carry.warm = true; say(`you warm the ${G.carry.name}.`, 'good'); } else say(`set to ${it.setting}: a precise cutting beam.`); break;
      default: say(`${r.verbs.join(' / ')} — keep it in hand while you work (hold E).`);
    }
    if (r.broke) G.say(`The ${h.name} gives out.`, 'warn'); return r;
  }
  // ---- as a weapon: phasers shoot (setting cycles with Shift+V), everything else swings; T throws
  attack() {
    const C = this.C, G = C.G, it = this.inst; if (!it || this.cd > 0) return !!it; const h = HANDHELDS[it.id];
    const mode = h.weapon.ranged && !isBroken(it) && it.charge > 0 ? 'ranged' : 'melee', r = strike(it, mode, this.seed + this.n++); this.cd = r.cd || 0.6; this.swing = 1;
    if (!r.ok) { G.say(`${h.name}: ${r.why}.`, 'warn'); return true; }
    if (r.consumed) { this.arm(r, it); return true; }
    if (mode === 'ranged') C.sound?.phaser?.(); else C.sound?.hit?.();
    const t = this.target(r.range); if (t) this.apply(t, r); else if (mode === 'melee') G.say('You swing at nothing.');
    if (r.broke) { G.say(`The ${h.name} cracks — it will not ${h.job.verbs[0]} any more.`, 'warn'); } return true;
  }
  throwIt() {
    const C = this.C, G = C.G, P = C.P, it = this.inst; if (!it) return false; const h = HANDHELDS[it.id], r = strike(it, 'throw', this.seed + this.n++); this.swing = 1;
    const t = this.target(r.range, 0.9); if (t) this.apply(t, r);
    const W = C.world; let x = P.x, z = P.z; for (let d = 0.5; d <= (t ? Math.hypot(t.x - P.x, t.z - P.z) : r.range); d += 0.25) { const nx = P.x - Math.sin(P.yaw) * d, nz = P.z - Math.cos(P.yaw) * d; if (W.solidAt(nx, nz)) break; x = nx; z = nz; }
    this.belt.splice(this.hand, 1); this.hand = -1; const mesh = makeItemMesh(h.model); mesh.position.set(x, mesh.userData.rest || 0.03, z); if (mesh.userData.lie) mesh.rotation.z = Math.PI / 2; C.scene.add(mesh);
    G.haul?.dropped.push({ mesh, x, z, carry: null, inst: it, name: displayName(it) }); G.say(`You throw the ${h.name}${t ? '' : '.'}${r.broke ? ' It breaks.' : ''}`, r.broke ? 'warn' : ''); return true;
  }
  target(range, dot = 0.8) { const C = this.C, G = C.G, hostile = (C.gorns || []).filter(g => g.active && !g.dead && g.mesh?.visible !== false); return this.front([...hostile, ...this.crew().filter(e => !e.fake || G.mode !== 'madness')], range, dot); }
  // apply a hit profile to a hostile (madness: stun, hit points via the existing killMad path) or a crew member (nominal: stunned, trust)
  apply(t, r) {
    const C = this.C, G = C.G, P = C.P, dx = t.x - P.x, dz = t.z - P.z, d = Math.hypot(dx, dz) || 1;
    if (t.stunFor) {   // a hostile from js/enemies.js
      if (r.stun > 0 && t.state !== undefined) t.stunFor(r.stun, G); if (r.knock) { t.x += dx / d * r.knock * 0.15; t.z += dz / d * r.knock * 0.15; }
      if (t.mad && r.dmg > 0) { t.hp = (t.hp ?? 2) - (r.dmg >= 1 ? Math.round(r.dmg) : 1); if (t.hp <= 0) C.killMad?.(t); }
      G.say(`${r.mode === 'ranged' ? 'Hit' : 'You strike'} ${t.name || 'it'}${r.stun ? ` — stunned ${r.stun.toFixed(1)} s` : ''}.`, 'good'); this.last = { target: t.name || t.kind, ...r }; return;
    }
    const H = t.mesh.userData.human, pr = t.person; if (t.op) opEnd(t); t.walk = null; t.stunT = Math.max(t.stunT || 0, r.sedate ? 20 : r.stun * 3); t.cower = true; if (H) { H.play('hit_chest', { fade: 0.1, loop: false }); H.standing = false; }
    if (r.knock) { t.x += dx / d * r.knock * 0.12; t.z += dz / d * r.knock * 0.12; t.mesh.position.x = t.x; t.mesh.position.z = t.z; }
    const sab = G.phases?.saboteur === pr; if (sab) { G.phases.saboteur = null; G.say(`${pr.short} goes down. Security: "We've got the saboteur. Good work."`, 'good'); for (const p of G.roster?.people || []) if (p.dept === 'security') G.duty?._bump(p, 0.04); }
    else { G.duty?._bump(pr, -0.25); for (const e of this.crew()) if (e !== t && Math.hypot(e.x - t.x, e.z - t.z) < 10) G.duty?._bump(e.person, -0.06); G.say(`You ${r.sedate ? 'sedate' : r.mode === 'ranged' ? 'stun' : 'hit'} ${pr.short}. People saw that. (−trust)`, 'warn'); }
    this.last = { target: pr.short, ...r };
  }
  // phaser overload: a grenade with a fuse, the phaser is gone
  arm(r, it) { const C = this.C, P = C.P, x = P.x - Math.sin(P.yaw) * 3, z = P.z - Math.cos(P.yaw) * 3; this.belt.splice(this.belt.indexOf(it), 1); this.hand = -1; this.timers.push({ t: r.fuse, x, z, r }); C.G.say(`The ${HANDHELDS[it.id].name} whines up to overload — ${r.fuse} s!`, 'warn'); }
  tick(dt) {
    const C = this.C; this.cd = Math.max(0, this.cd - dt); this.swing = Math.max(0, this.swing - dt * 3.5);
    for (const tm of [...this.timers]) { tm.t -= dt; if (tm.t <= 0) { this.timers.splice(this.timers.indexOf(tm), 1); C.sound?.zap?.(); for (const g of [...(C.gorns || []), ...this.crew()]) if (Math.hypot(g.x - tm.x, g.z - tm.z) < tm.r.radius) this.apply(g, { ...tm.r, mode: 'ranged' }); C.G.say('The overloaded phaser goes off.', 'warn'); } }
    for (const e of this.crew()) if (e.stunT > 0) { e.stunT -= dt; const H = e.mesh.userData.human; if (H && H.current === 'hit_chest' && e.stunT > 0.5) H.play('crouch_idle', { fade: 0.4 }); if (e.stunT <= 0) { e.cower = false; e.stunT = 0; opStart(e) || H?.play('idle', { fade: 0.4 }); } }
    this.vmStep();
  }
  prompt() { const it = this.inst; if (!it) return ''; const h = HANDHELDS[it.id]; return `In hand: ${displayName(it)} — [X] ${h.job.verbs[0]}${isBroken(it) ? ' (broken)' : ''} · [click] ${h.weapon.ranged && !isBroken(it) ? 'fire' : 'strike'} · [T] throw · [V] switch`; }
  vmStep() {
    const C = this.C, G = C.G, P = C.P, it = this.inst, id = it && !G.carry ? HANDHELDS[it.id].model : null; if (!C.vmScene) return;
    if (id !== this.vmId) { if (this.vm) C.vmScene.remove(this.vm); this.vm = null; this.vmId = id; if (id) { const m = makeItemMesh(id), g = new THREE.Group(); g.add(m); if (m.userData.lie) m.rotation.x = -Math.PI / 2; m.traverse(o => { if (o.isMesh) o.renderOrder = 10; }); C.vmScene.add(g); this.vm = g; } }
    if (this.vm) { const b = Math.sin((P.bob || 0) * 1.1), s = this.swing; this.vm.position.set(0.2 - s * 0.12, -0.2 + Math.abs(b) * 0.008 + s * 0.06, -0.42 - s * 0.1); this.vm.rotation.set(-s * 1.2, 0.2 + s * 0.6, b * 0.02); this.vm.visible = G.phase === 'play' && !P.cart; }
  }
  dispose() { if (this.vm) this.C.vmScene?.remove(this.vm); this.vm = null; this.vmId = null; }
}
export { cycleSetting, HANDHELDS };
