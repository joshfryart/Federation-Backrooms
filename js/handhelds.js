// Handheld job equipment that doubles as a weapon: tricorders (all types), phasers, medical, engineering and service tools.
// Pure data + logic (no three.js, no DOM): node-testable. Meshes are in js/carry.js (makeItemMesh(model)), game glue in js/kit.js.
//   HANDHELDS        id -> { name, real (ship-inventory equivalent), carriers { billets, depts, rank }, holster, model, foldable,
//                            job { verbs, effect, repairMul, wear, where, script }, weapon { melee, throw, ranged } , dur }
//   WEAPON_TABLE     one row per item and mode: the damage / stun / knockback profile in one place (docs/handhelds.md prints it)
//   newInstance(id)  { id, dur, charge, setting, uses, broken }   useJob(inst, seed) / strike(inst, mode, seed) -> outcome (durability shared)
//   loadoutFor(person)  which handhelds a crew member carries (belt / hand), deterministic;  toolScript(id) Operator steps for NPC use
import { hash01 } from './clock.js';

// ---- weapon profile helpers. dmg: hostile hit points (madness: a crazed crewman has 2; the zapper does 1); stun: seconds; knock: m/s push;
//      range m; noise (hearing radius m, like the player's footsteps 7 / sprint 15); cd: seconds between uses; wear: durability per use
const melee = (dmg, stun, knock, range = 1.6, noise = 6, cd = 0.7, wear = 2) => ({ dmg, stun, knock, range, noise, cd, wear });
const toss = (dmg, stun, range = 9, wear = 20, breakP = 0.15) => ({ dmg, stun, range, wear, breakP, noise: 5 });
const STD_THROW = toss(0.25, 0.8);
const S = (g, dur, x = {}) => ({ g, dur, ...x });

export const HANDHELDS = {
  // ---- tricorders: flip-open clamshells. Thrown or used as a club they can BREAK and lose the scan (shared durability)
  tricorder_eng: { name: 'engineering tricorder', real: 'clamp meter / multimeter with thermal camera', carriers: { depts: ['engineering'], billets: ['dc', 'ttech', 'rep'] }, holster: 'belt', model: 'tricorder_eng', foldable: true, dur: 100,
    job: { verbs: ['scan', 'diagnose', 'measure'], effect: 'faults', repairMul: 1.3, wear: 1, where: ['warpcore', 'console', 'junction', 'tank', 'servers', 'workbench', 'pad', 'post'], script: [S('scan_sweep', [2.4, 3.4], { cue: 'scan' }), S('check_tablet', [2, 3])] },
    weapon: { melee: melee(0.35, 0.6, 1.5, 1.4, 5, 0.8, 30), throw: toss(0.3, 1.0, 9, 45, 0.35) } },
  tricorder_med: { name: 'medical tricorder', real: 'handheld patient monitor / pulse oximeter', carriers: { depts: ['medical'] }, holster: 'belt', model: 'tricorder_med', foldable: true, dur: 100,
    job: { verbs: ['scan', 'diagnose'], effect: 'vitals', heal: 0.02, wear: 1, where: ['biobed', 'post', 'console', 'desk'], script: [S('scan_sweep', [2.4, 3.4], { cue: 'scan' }), S('inspect_item', [2, 3])] },
    weapon: { melee: melee(0.35, 0.6, 1.5, 1.4, 5, 0.8, 30), throw: toss(0.3, 1.0, 9, 45, 0.35) } },
  tricorder_sci: { name: 'science tricorder', real: 'portable spectrometer / survey meter', carriers: { depts: ['sciences'] }, holster: 'belt', model: 'tricorder_sci', foldable: true, dur: 100,
    job: { verbs: ['scan', 'analyse'], effect: 'room', wear: 1, where: ['labbench', 'console', 'tree', 'tank', 'post'], script: [S('scan_sweep', [2.4, 3.4], { cue: 'scan' }), S('look_around', [2.2, 3])] },
    weapon: { melee: melee(0.35, 0.6, 1.5, 1.4, 5, 0.8, 30), throw: toss(0.3, 1.0, 9, 45, 0.35) } },
  tricorder_sec: { name: 'security tricorder', real: 'handheld thermal imager / bio-sensor', carriers: { depts: ['security'] }, holster: 'belt', model: 'tricorder_sec', foldable: true, dur: 110,
    job: { verbs: ['scan', 'detect'], effect: 'people', wear: 1, where: ['post', 'cell', 'weaponrack', 'console'], script: [S('scan_sweep', [2.4, 3.4], { cue: 'scan' }), S('glance_back', [1, 1.5])] },
    weapon: { melee: melee(0.4, 0.7, 1.6, 1.4, 5, 0.8, 28), throw: toss(0.3, 1.0, 9, 40, 0.3) } },
  tricorder_geo: { name: 'geological tricorder', real: 'ultrasonic thickness gauge / borescope', carriers: { billets: ['carto', 'dc', 'ace'] }, holster: 'belt', model: 'tricorder_eng', foldable: true, dur: 100,
    job: { verbs: ['scan', 'measure'], effect: 'hull', wear: 1, where: ['crate', 'shuttle', 'post', 'junction'], script: [S('reach_low', [1.8, 2.4]), S('scan_sweep', [2.4, 3.2], { cue: 'scan' })] },
    weapon: { melee: melee(0.35, 0.6, 1.5, 1.4, 5, 0.8, 30), throw: toss(0.3, 1.0, 9, 45, 0.35) } },
  tricorder_atmo: { name: 'atmospheric tricorder', real: 'four-gas detector', carriers: { billets: ['env', 'sensor', 'bot', 'reactor'] }, holster: 'belt', model: 'tricorder_sci', foldable: true, dur: 100,
    job: { verbs: ['scan', 'measure'], effect: 'air', wear: 1, where: ['tank', 'tree', 'post', 'junction', 'warpcore'], script: [S('look_up_screen', [1.6, 2.4]), S('scan_sweep', [2.4, 3.2], { cue: 'scan' })] },
    weapon: { melee: melee(0.35, 0.6, 1.5, 1.4, 5, 0.8, 30), throw: toss(0.3, 1.0, 9, 45, 0.35) } },
  commbadge: { name: 'comm badge', real: 'push-to-talk lapel radio', carriers: { all: true }, holster: 'chest', model: 'badge', dur: 60,
    job: { verbs: ['hail'], effect: 'radio', wear: 0, where: [], script: [S('check_badge', [1.4, 2])] },
    weapon: { melee: melee(0.05, 0.1, 0.3, 1.2, 2, 0.6, 5), throw: toss(0.05, 0.3, 10, 15, 0.1) } },
  padd: { name: 'PADD', real: 'rugged tablet', carriers: { depts: ['command', 'operations', 'services', 'flight'], rank: 3 }, holster: 'hand', model: 'padd', foldable: true, dur: 80,
    job: { verbs: ['read', 'log'], effect: 'duty', wear: 0, where: ['desk', 'console', 'post', 'shelving', 'crate'], script: [S('check_tablet', [2.4, 3.6])] },
    weapon: { melee: melee(0.3, 0.5, 1.2, 1.4, 6, 0.7, 25), throw: toss(0.25, 0.8, 10, 40, 0.4) } },
  // ---- phasers: weapons that are also tools (cut, heat, overload as a grenade)
  phaser1: { name: 'type-1 hand phaser', real: 'cordless soldering / hot-air pen (as a tool)', carriers: { depts: ['security'], rank: 0, also: { rank: 4 } }, holster: 'belt', model: 'phaser1', dur: 120,
    job: { verbs: ['heat', 'cut'], effect: 'heat', repairMul: 1.05, wear: 1, where: ['post', 'cell', 'weaponrack'], script: [S('aim_phaser', [1.6, 2.4], { cue: 'beep' })] },
    weapon: { melee: melee(0.2, 0.3, 0.8, 1.3, 4, 0.7, 6), throw: toss(0.15, 0.6, 9, 20, 0.15),
      ranged: { charge: 12, range: 18, cd: 0.6, noise: 10, settings: { stun: { dmg: 0, stun: 5, cost: 1 }, kill: { dmg: 1, stun: 2, cost: 2 }, overload: { dmg: 2, stun: 8, radius: 4, fuse: 3, cost: 'all', consumes: true } } } } },
  phaser2: { name: 'type-2 phaser', real: 'handheld cutting laser (as a tool)', carriers: { billets: ['cos', 'dep', 'armory'] }, holster: 'belt', model: 'phaser2', dur: 160,
    job: { verbs: ['cut', 'weld', 'heat'], effect: 'heat', repairMul: 1.15, wear: 1, where: ['post', 'weaponrack', 'cell'], script: [S('aim_phaser', [1.6, 2.4], { cue: 'beep' })] },
    weapon: { melee: melee(0.4, 0.6, 1.4, 1.4, 5, 0.8, 6), throw: toss(0.3, 0.8, 8, 20, 0.12),
      ranged: { charge: 30, range: 24, cd: 0.45, noise: 12, settings: { stun: { dmg: 0, stun: 7, cost: 1 }, kill: { dmg: 2, stun: 2, cost: 2 }, overload: { dmg: 3, stun: 10, radius: 5, fuse: 3, cost: 'all', consumes: true } } } } },
  phaser_rifle: { name: 'phaser rifle', real: 'industrial laser cutter on a stock (as a tool)', carriers: { billets: ['armory'] }, holster: 'back', model: 'rifle', dur: 220,
    job: { verbs: ['cut'], effect: 'heat', repairMul: 1.1, wear: 2, where: ['weaponrack'], script: [S('aim_phaser', [2, 3], { cue: 'beep' })] },
    weapon: { melee: melee(0.8, 1.2, 3, 1.8, 7, 1.0, 4), throw: toss(0.4, 1, 6, 25, 0.1),
      ranged: { charge: 60, range: 32, cd: 0.35, noise: 15, settings: { stun: { dmg: 0, stun: 9, cost: 1 }, kill: { dmg: 2, stun: 3, cost: 2 }, overload: { dmg: 4, stun: 12, radius: 6, fuse: 4, cost: 'all', consumes: true } } } } },
  // ---- medical
  hypospray: { name: 'hypospray', real: 'auto-injector', carriers: { depts: ['medical'] }, holster: 'belt', model: 'hypospray', dur: 40,
    job: { verbs: ['heal', 'sedate'], effect: 'heal', heal: 0.06, selfHeal: 15, wear: 4, where: ['biobed', 'post'], script: [S('hypo_press', [1.2, 1.8], { cue: 'hiss' })] },
    weapon: { melee: { ...melee(0.1, 6, 0.2, 1.2, 2, 1.5, 10), sedate: true }, throw: toss(0.05, 0.4, 8, 20, 0.3) } },   // jabbed into a neck it SEDATES (long stun, no damage)
  dermal: { name: 'dermal regenerator', real: 'wound-closure light / cold-laser wand', carriers: { billets: ['doc', 'nurse', 'cmo'] }, holster: 'belt', model: 'dermal', dur: 60,
    job: { verbs: ['heal'], effect: 'heal', heal: 0.05, selfHeal: 10, wear: 3, where: ['biobed'], script: [S('scan_sweep', [2.4, 3.2], { cue: 'hum' })] },
    weapon: { melee: melee(0.2, 0.4, 0.8, 1.3, 3, 0.7, 8), throw: STD_THROW } },
  scalpel: { name: 'laser scalpel', real: 'disposable scalpel / cautery pen', carriers: { billets: ['doc', 'cmo'] }, holster: 'pocket', model: 'scalpel', dur: 50,
    job: { verbs: ['cut'], effect: 'cut', wear: 2, where: ['biobed', 'labbench'], script: [S('inspect_item', [2, 3])] },
    weapon: { melee: melee(0.6, 0.2, 0.3, 1.1, 2, 0.5, 6), throw: toss(0.3, 0.2, 7, 10, 0.05) } },
  // ---- engineering and services
  hydrospanner: { name: 'hydrospanner', real: 'cordless impact wrench', carriers: { depts: ['engineering'] }, holster: 'belt', model: 'tool', dur: 150,
    job: { verbs: ['repair', 'turn'], effect: 'repair', repairMul: 1.15, wear: 1, where: ['warpcore', 'junction', 'tank', 'workbench', 'shuttle'], script: [S('tool_work', [2.2, 3.2], { cue: 'clank' })] },
    weapon: { melee: melee(0.6, 0.9, 2.2, 1.5, 7, 0.8, 3), throw: toss(0.4, 1.2, 8, 15, 0.05) } },
  spanner: { name: 'spanner', real: 'combination spanner / adjustable wrench', carriers: { billets: ['dc', 'rep', 'deck', 'ttech'] }, holster: 'belt', model: 'wrench', dur: 400,
    job: { verbs: ['repair', 'turn'], effect: 'repair', repairMul: 1.1, wear: 0.5, where: ['tank', 'junction', 'workbench', 'crate'], script: [S('turn_valve', [2, 3], { cue: 'clank' })] },
    weapon: { melee: melee(0.7, 1.0, 2.4, 1.5, 8, 0.8, 1), throw: toss(0.5, 1.2, 9, 5, 0.01) } },
  plasma_torch: { name: 'plasma torch', real: 'oxy-acetylene / plasma cutting torch', carriers: { billets: ['ace', 'dc', 'reactor'] }, holster: 'back', model: 'torch', dur: 120,
    job: { verbs: ['cut', 'weld'], effect: 'repair', repairMul: 1.2, wear: 2, where: ['warpcore', 'junction', 'workbench', 'shuttle', 'lathe'], script: [S('torch_cut', [2.4, 3.4], { cue: 'sizzle', fx: 'sparks' })] },
    weapon: { melee: { ...melee(0.9, 1.2, 1.0, 1.4, 9, 1.0, 4), burn: true }, throw: toss(0.4, 1, 6, 20, 0.1) } },
  toolbag: { name: 'tool bag', real: 'canvas tool bag', carriers: { billets: ['eps', 'env', 'rep'] }, holster: 'hand', model: 'toolbag', dur: 200,
    job: { verbs: ['repair'], effect: 'repair', repairMul: 1.25, wear: 0.5, where: ['junction', 'workbench'], script: [S('reach_low', [1.8, 2.4]), S('tool_work', [2.2, 3.2])] },
    weapon: { melee: melee(0.6, 1.4, 3.0, 1.5, 8, 1.2, 2), throw: toss(0.6, 1.6, 5, 5, 0.02) } },
  flashlight: { name: 'hand lamp', real: 'LED torch / headlamp', carriers: { depts: ['security', 'engineering'], billets: ['deck', 'cargo'] }, holster: 'belt', model: 'flashlight', dur: 120,
    job: { verbs: ['light'], effect: 'light', wear: 0, where: ['post', 'junction', 'crate'], script: [S('look_around', [2.2, 3.4])] },
    weapon: { melee: melee(0.4, 0.7, 1.6, 1.4, 6, 0.7, 4), throw: toss(0.3, 0.8, 9, 25, 0.2) } },
  extinguisher: { name: 'fire extinguisher', real: 'ABC dry-powder extinguisher', carriers: { billets: ['dc'] }, holster: 'hand', model: 'extinguisher', dur: 30,
    job: { verbs: ['extinguish'], effect: 'fire', wear: 5, where: ['post', 'junction', 'warpcore'], script: [S('aim_phaser', [2, 3], { cue: 'hiss', fx: 'spray' })] },
    weapon: { melee: melee(1.0, 1.6, 3.2, 1.5, 9, 1.4, 2), throw: toss(0.8, 1.8, 5, 4, 0.05), ranged: { charge: 30, range: 4, cd: 0.25, noise: 6, settings: { spray: { dmg: 0, stun: 2.5, cost: 1, blind: true } } } } },
  mop: { name: 'mop', real: 'mop and bucket', carriers: { billets: ['galley', 'cook', 'holo'] }, holster: 'hand', model: 'mop', dur: 200,
    job: { verbs: ['clean'], effect: 'clean', wear: 0.5, where: ['post', 'table', 'counter', 'sinkunit'], script: [S('wipe_surface', [2.4, 3.4], { cue: 'water' })] },
    weapon: { melee: melee(0.3, 0.9, 2.6, 2.2, 5, 1.0, 2), throw: toss(0.2, 0.6, 5, 5, 0.02) } },
  cargo_hook: { name: 'cargo hook', real: 'baling hook', carriers: { billets: ['cargo', 'qm', 'deck'] }, holster: 'belt', model: 'hook', dur: 300,
    job: { verbs: ['hook', 'pull'], effect: 'cargo', wear: 0.5, where: ['crate', 'shelving', 'cart'], script: [S('reach_low', [1.8, 2.4]), S('take_item', [1, 1.4])] },
    weapon: { melee: melee(0.8, 0.6, 1.2, 1.5, 5, 0.8, 1), throw: toss(0.4, 0.4, 7, 5, 0.01) } },
  crowbar: { name: 'pry bar', real: 'crowbar / pry bar', carriers: { billets: ['dc', 'cargo'] }, holster: 'back', model: 'crowbar', dur: 500,
    job: { verbs: ['pry', 'open'], effect: 'pry', repairMul: 1.05, wear: 0.5, where: ['crate', 'junction', 'post'], script: [S('turn_valve', [2, 3], { cue: 'clank' })] },
    weapon: { melee: melee(1.0, 1.2, 3.0, 1.7, 9, 1.0, 1), throw: toss(0.6, 1.2, 7, 5, 0.01) } },
};
export const HANDHELD_IDS = Object.keys(HANDHELDS);
export const MELEE_DEFAULT = melee(0.2, 0.4, 1.0, 1.2, 4, 0.6, 0);   // bare fists
for (const h of Object.values(HANDHELDS)) h.weapon.throw = h.weapon.throw || STD_THROW;

// ---- one table: every item x mode with its numbers (docs/handhelds.md, tests)
export const WEAPON_TABLE = HANDHELD_IDS.flatMap(id => { const w = HANDHELDS[id].weapon, rows = [{ id, mode: 'melee', ...w.melee }, { id, mode: 'throw', ...w.throw }];
  if (w.ranged) for (const [s, v] of Object.entries(w.ranged.settings)) rows.push({ id, mode: 'ranged:' + s, ...v, range: w.ranged.range, cd: w.ranged.cd, noise: w.ranged.noise, charge: w.ranged.charge }); return rows; });

// ---- instances and durability. Durability is SHARED: job use, melee hits and throws all wear the same item; at 0 it is broken:
//      the job no longer works (a cracked tricorder does not scan) and as a weapon it hits at 60%. Foldables (clamshell/flip) can snap
//      outright when clubbed or thrown (breakP per hit). Phasers spend charge on shots; overload consumes the phaser.
export function newInstance(id, seed = 1) { const h = HANDHELDS[id]; if (!h) return null; return { id, dur: h.dur, charge: h.weapon.ranged?.charge ?? 0, setting: h.weapon.ranged ? Object.keys(h.weapon.ranged.settings)[0] : null, uses: 0, broken: false, seed }; }
export const isBroken = (inst) => !inst || inst.broken || inst.dur <= 0;
const wear = (inst, n) => { inst.dur = Math.max(0, inst.dur - n); if (inst.dur <= 0) inst.broken = true; return inst.broken; };
export function useJob(inst) {
  const h = HANDHELDS[inst?.id]; if (!h) return { ok: false, why: 'nothing in hand' }; if (isBroken(inst)) return { ok: false, why: `The ${h.name} is broken.`, broken: true };
  inst.uses++; const broke = wear(inst, h.job.wear || 0); return { ok: true, effect: h.job.effect, verbs: h.job.verbs, heal: h.job.heal || 0, selfHeal: h.job.selfHeal || 0, repairMul: h.job.repairMul || 1, broke };
}
// mode: 'melee' | 'throw' | 'ranged' (uses inst.setting). Returns the hit profile to apply, plus durability / charge bookkeeping.
export function strike(inst, mode = 'melee', seed = 1) {
  const h = HANDHELDS[inst?.id]; if (!h) return { ...MELEE_DEFAULT, mode: 'melee', item: null };
  inst.uses++; const w = h.weapon, k = isBroken(inst) ? 0.6 : 1, roll = hash01('hit', seed, inst.seed, inst.id, inst.uses);
  if (mode === 'ranged') {
    const r = w.ranged; if (!r) return strike(inst, 'melee', seed); const st = r.settings[inst.setting] || Object.values(r.settings)[0], cost = st.cost === 'all' ? inst.charge : st.cost;
    if (isBroken(inst) || inst.charge < (st.cost === 'all' ? 1 : cost)) return { ok: false, mode, why: isBroken(inst) ? 'broken' : 'no charge', dmg: 0, stun: 0, noise: 1 };
    inst.charge -= cost; if (st.consumes) { inst.broken = true; inst.dur = 0; }
    return { ok: true, mode, setting: inst.setting, dmg: st.dmg, stun: st.stun, knock: 0, range: r.range, radius: st.radius || 0, fuse: st.fuse || 0, noise: r.noise, cd: r.cd, blind: !!st.blind, consumed: !!st.consumes, item: inst.id };
  }
  const p = mode === 'throw' ? w.throw : w.melee; const was = isBroken(inst); let broke = wear(inst, p.wear || 0);
  if (!was && (h.foldable || mode === 'throw') && roll < (p.breakP ?? (h.foldable ? 0.25 : 0))) { inst.broken = true; inst.dur = 0; broke = true; }
  return { ok: true, mode, dmg: p.dmg * k, stun: p.stun * k, knock: p.knock || 0, range: p.range, noise: p.noise, cd: p.cd || 0.8, sedate: !!p.sedate, burn: !!p.burn, broke: broke && !was, item: inst.id };
}
export function cycleSetting(inst) { const r = HANDHELDS[inst?.id]?.weapon.ranged; if (!r) return null; const ks = Object.keys(r.settings); inst.setting = ks[(ks.indexOf(inst.setting) + 1) % ks.length]; return inst.setting; }
export const displayName = (inst) => { const h = HANDHELDS[inst?.id]; if (!h) return ''; return (isBroken(inst) ? 'broken ' : '') + h.name + (h.weapon.ranged && !isBroken(inst) ? ` [${inst.setting} ${inst.charge}]` : ''); };

// ---- who carries what. Deterministic per person: everyone has a comm badge; department kit; security wears a phaser; senior officers
//      (rank >= 4) a type-1 phaser; rank gates (PADD for rank >= 3 in command / ops / services / flight)
export function loadoutFor(person) {
  const out = []; if (!person) return out; const b = person.billet, d = person.dept, r = person.rank ?? 0;
  for (const [id, h] of Object.entries(HANDHELDS)) { const c = h.carriers; if (id === 'commbadge') continue;
    const okB = c.billets?.includes(b), okD = c.depts?.includes(d) && (c.rank === undefined || r >= c.rank), okR = c.also && r >= c.also.rank; if (okB || okD || okR) out.push(id); }
  // keep it plausible: one tricorder, at most one phaser (the best), the rest by a stable shuffle, max 4 on the body
  const tric = out.filter(i => i.startsWith('tricorder_')), ph = ['phaser_rifle', 'phaser2', 'phaser1'].find(p => out.includes(p));
  let rest = out.filter(i => !i.startsWith('tricorder_') && !i.startsWith('phaser')); rest.sort((a, b2) => hash01('lo', person.id, a) - hash01('lo', person.id, b2));
  const mainTric = tric.find(t => HANDHELDS[t].carriers.billets?.includes(b)) || tric[0];
  return ['commbadge', ...(mainTric ? [mainTric] : []), ...(ph ? [ph] : []), ...rest].slice(0, 4);
}
// the job item an NPC takes out at a piece of equipment (equipment key from js/equipment.js), or null
export function toolFor(person, equipKey, seed = 1) { const lo = loadoutFor(person).filter(id => id !== 'commbadge' && HANDHELDS[id].job.where.includes(equipKey)); return lo.length ? lo[Math.floor(hash01('tf', seed, person.id, equipKey) * lo.length)] : null; }
// Operator steps for using it: take it out (hold), the job motion, put it back
export function toolScript(id) { const h = HANDHELDS[id]; if (!h) return []; return [{ g: 'take_item', dur: [0.8, 1.1], hold: h.model, tool: id }, ...h.job.script.map(s => ({ ...s })), { g: null, dur: [0.4, 0.7], hold: null }]; }
