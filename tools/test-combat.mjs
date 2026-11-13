// Grapple + melee (Systems Nominal): node unit tests for js/combat.js and a browser block for js/grapple.js.  node tools/test-combat.mjs
//   unit: action table integrity, outcome maths (deterministic by seed), injury model, grapple state machine, reactions by tags / social
//   graph, consequences (trust / chain / alert / security / sabotage), armory gating, security responders.
//   browser (tools/test.mjs): strike a crew member -> reaction clip + stun + trust + witnesses + security response; grab -> the body follows
//   the hold point -> release -> they resume; an operator at a console handled; the player's own HP / stagger / knock-down (never death);
//   madness mode keeps its zapper and its right-mouse hook (combat stays out of it).
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

export async function combatTests(fail) {
  const CB = await imp('js/combat.js'), HH = await imp('js/handhelds.js'), { SHIPS } = await imp('js/ships.js'), Cr = await imp('js/crew.js'), V = await imp('js/voice.js'), { AlertState } = await imp('js/alerts.js');
  try { await V.loadPersonas?.(); } catch (e) { /* personas are optional for the tags */ }
  const ck = (c, m) => { if (!c) fail('combat: ' + m); return !!c; };
  // ---- action table integrity
  const CLIPS = new Set(['punch_jab', 'punch_cross', 'push', 'interact', 'crouch_idle', 'hit_chest', 'hit_head', null]), KINDS = new Set(['strike', 'shove', 'grab', 'hold', 'release', 'throw', 'ko', 'guard', 'evade', 'drag']);
  for (const k of ['jab', 'cross', 'shove', 'grab', 'restrain', 'release', 'drag', 'trip', 'subdue', 'guard', 'evade']) ck(CB.ACTIONS[k], 'missing action ' + k);
  for (const [k, a] of Object.entries(CB.ACTIONS)) {
    ck(a.key === k && KINDS.has(a.kind) && a.label, `${k}: key / kind / label`);
    ck([a.range, a.windup, a.recover, a.stamina, a.dmg, a.stun, a.knock, a.noise].every(v => Number.isFinite(v) && v >= 0) && a.acc > 0 && a.acc <= 1, `${k}: numbers`);
    ck(CLIPS.has(a.clip) && CLIPS.has(a.react), `${k}: clips ${a.clip}/${a.react}`); ck(a.dmg <= 0.25, `${k}: bare hands never maim (${a.dmg})`);
  }
  ck(CB.ACTIONS.jab.windup < CB.ACTIONS.cross.windup && CB.ACTIONS.jab.dmg < CB.ACTIONS.cross.dmg, 'jab is quicker and lighter than a cross');
  for (const id of HH.HANDHELD_IDS) { const s = CB.swingAction(HH.HANDHELDS[id].weapon.melee, id); ck(s.kind === 'strike' && s.item === id && s.range > 0 && s.windup > 0 && s.dmg > 0 && s.dmg <= 0.35 && Number.isFinite(s.stun), `${id}: improvised swing ${JSON.stringify(s)}`); }
  ck(CB.swingAction(HH.HANDHELDS.crowbar.weapon.melee).dmg > CB.swingAction(HH.HANDHELDS.padd.weapon.melee).dmg, 'a pry bar hits harder than a PADD');
  // ---- fighters + outcome maths
  const R = Cr.makeComplement(SHIPS[0], 3), ppl = R.people, sec = ppl.find(p => p.dept === 'security'), sci = ppl.find(p => p.dept === 'sciences') || ppl[ppl.length - 1], heavy = ppl.find(p => p.body === 'crew_heavy');
  const A = CB.fighter(sci), D = CB.fighter(sec); ck(D.trained === 1 && A.trained < 1, 'security is trained');
  if (heavy) ck(CB.fighter(heavy).build > CB.fighter(ppl.find(p => /crew_f/.test(p.body))).build, 'build from body');
  ck(CB.chance('jab', A, D, { behind: true }) > CB.chance('jab', A, D), 'from behind is easier'); ck(CB.chance('jab', A, D, { held: true }) > CB.chance('jab', A, D), 'a held target is easier');
  ck(CB.chance('jab', { ...A, stamina: 10 }, D) < CB.chance('jab', A, D), 'a tired attacker misses more'); ck(CB.chance('jab', A, { ...D, state: 'stunned' }) === 1, 'a stunned target is always hit');
  ck(CB.chance('grab', D, A) > CB.chance('grab', A, D), 'security grabs better than a scientist');
  { const a = [], b = []; for (let n = 0; n < 20; n++) { a.push(JSON.stringify(CB.resolve('cross', A, D, { n }, 7))); b.push(JSON.stringify(CB.resolve('cross', A, D, { n }, 7))); } ck(a.join() === b.join(), 'resolve is deterministic for a seed'); ck(new Set(a).size > 3, 'attempts differ'); const hits = a.map(x => JSON.parse(x)).filter(o => o.hit); ck(hits.length > 3 && hits.length < 20, 'some cross hits ' + hits.length); }
  { let blk = 0, ev = 0; for (let n = 0; n < 40; n++) { const o = CB.resolve('cross', D, A, { n, blocking: true }, 3); if (o.blocked) { blk++; ck(o.dmg < CB.ACTIONS.cross.dmg * 0.5, 'a block soaks most of it'); } const e2 = CB.resolve('jab', A, D, { n, evading: true }, 4); if (e2.evaded) ev++; } ck(blk > 5 && ev > 3, `blocks ${blk} evades ${ev}`); }
  ck(CB.isBehind(0, 0, -1) && !CB.isBehind(0, 0, 1), 'behind = opposite the facing');
  // ---- injury model: hurt -> dazed -> stunned -> out; never dead unless lethal; recovers
  { const inj = CB.newInjury(); ck(CB.stateOf(inj) === 'ok', 'fresh'); CB.hurt(inj, { dmg: 0.1, stun: 0.4 }); ck(inj.state === 'dazed', 'a jab dazes ' + inj.state); CB.hurt(inj, { dmg: 0.25, stun: 2 }); ck(inj.state === 'stunned', 'stacked hits stun');
    for (let i = 0; i < 10; i++) CB.hurt(inj, { dmg: 0.3, stun: 1 }); ck(inj.state === 'out' && inj.hp >= CB.INJURY.floor && !inj.dead, 'a beating knocks out, never kills ' + JSON.stringify(inj));
    ck(CB.speedMul(inj) === 0 && CB.workMul(inj) === 0, 'out cold: no walking, no work'); let woke = null; for (let t = 0; t < 120; t += 0.5) { CB.recover(inj, 0.5); if (!woke && inj.state !== 'out') woke = inj.state; } ck(woke === 'dazed' || woke === 'stunned', 'wakes dazed ' + woke); ck(['hurt', 'ok'].includes(inj.state), 'recovers ' + inj.state);
    const d2 = CB.newInjury(); CB.hurt(d2, { dmg: 0.6 }, { lethal: true }); CB.hurt(d2, { dmg: 0.6 }, { lethal: true }); ck(d2.dead && CB.stateOf(d2) === 'dead', 'only a lethal item kills');
    const h = CB.newInjury(); h.hp = 0.5; ck(CB.stateOf(h) === 'hurt' && CB.speedMul(h) < 1 && CB.speedMul(h) > 0.5 && CB.workMul(h) < 1, 'hurt slows walking and work');
    const s = CB.newInjury(); CB.hurt(s, { dmg: 0, stun: 6, ko: 30 }); ck(s.state === 'out' && s.out === 30, 'subdue = out cold without injury'); }
  // ---- grapple state machine
  { const g = CB.newGrapple(1, 2); ck(g.state === 'idle' && CB.gReach(g) && g.state === 'reach' && !CB.gReach(g), 'idle -> reach once');
    const Pl = CB.fighter(sec, { player: true }), calm = CB.fighter(sci, { reaction: 'freeze' }); let evs = []; for (let i = 0; i < 200 && !CB.gTerminal(g); i++) { const e = CB.gStep(g, 1 / 30, Pl, calm, { keep: true }, 11); if (e) evs.push(e); if (g.state === 'idle') { CB.gReach(g); } if (g.state === 'held') break; }
    ck(evs.includes('grabbed') && g.state === 'held', 'grab -> grabbed -> held (restrained) ' + evs + ' ' + g.log.join(','));
    ck(Pl.stamina < 100, 'holding costs the holder stamina'); ck(CB.gStep(g, 0.1, Pl, calm, { keep: false }, 1) === 'released' && g.state === 'released', 'let go -> released');
    // a trained fighter breaks a weak hold; an unconscious body never does
    const g2 = CB.newGrapple(); g2.state = 'grabbed'; const weak = CB.fighter(sci, { player: true }), strong = CB.fighter(sec, { reaction: 'fight' }); let broke = false; for (let i = 0; i < 30 * 20 && !broke; i++) broke = CB.gStep(g2, 1 / 30, weak, strong, { keep: true }, 5) === 'broken'; ck(broke && g2.state === 'broken', 'security breaks a scientist\'s hold');
    const g3 = CB.newGrapple(); g3.state = 'grabbed'; let b3 = false; for (let i = 0; i < 30 * 30; i++) if (CB.gStep(g3, 1 / 30, weak, CB.fighter(sec, { state: 'out' }), { keep: true }, 5) === 'broken') b3 = true; ck(!b3 && CB.breakRate(g3, weak, CB.fighter(sec, { state: 'out' })) === 0, 'out cold never struggles free');
    ck(CB.breakRate({ state: 'held' }, weak, strong) < CB.breakRate({ state: 'grabbed' }, weak, strong), 'restrained is harder to break than grabbed');
    const g4 = CB.newGrapple(); g4.state = 'held'; const o4 = CB.gThrow(g4, weak, strong, 2); ck(o4.hit && g4.state === 'thrown' && o4.stun >= 2, 'throw down from a hold always lands');
    const g5 = CB.newGrapple(); g5.state = 'grabbed'; ck(CB.gSubdue(g5, weak, strong, 1) === null, 'subdue needs a restraint first'); g5.state = 'held'; const o5 = CB.gSubdue(g5, weak, CB.fighter(sec, { stamina: 20 }), 1); ck(o5.hit && o5.ko >= 20 && g5.state === 'released', 'subdue a tired body: out cold');
    const g6 = CB.newGrapple(); g6.state = 'grabbed'; let ok6 = false; for (let s = 0; s < 8 && !ok6; s++) ok6 = CB.gRestrain(g6, Pl, calm, s); ck(ok6 && g6.state === 'held', 'forced restrain'); ck(CB.gRelease(g6) && g6.state === 'released' && !CB.gRelease(g6), 'release once'); }
  // ---- reactions by tags and relationships
  { const vic = {}, wit = {}, witF = {}; for (const p of ppl) { const r = CB.react(p, { role: 'victim' }, 3); vic[r.kind] = (vic[r.kind] || 0) + 1; ck(r.delay >= 0.2 && r.delay <= 1.8, 'reaction delay'); ck(JSON.stringify(r) === JSON.stringify(CB.react(p, { role: 'victim' }, 3)), 'react deterministic'); const w = CB.react(p, { role: 'witness' }, 3).kind; wit[w] = (wit[w] || 0) + 1; const wf = CB.react(p, { role: 'witness', friendOfVictim: 0.9 }, 3).kind; witF[wf] = (witF[wf] || 0) + 1; }
    ck(Object.keys(vic).length >= 3 && vic.fight > 0 && (vic.flee || 0) + (vic.cower || 0) + (vic.call || 0) > 0, 'victims react variously ' + JSON.stringify(vic));
    ck((witF.defend || 0) > (wit.defend || 0), `friends defend more ${witF.defend} > ${wit.defend}`);
    const secs = ppl.filter(p => p.dept === 'security'); ck(secs.filter(p => CB.react(p, { role: 'victim' }, 3).kind === 'fight').length >= secs.length * 0.6, 'security fights back');
    const mk = (tags) => ({ id: 900, dept: 'services', rank: 1, tags });
    ck(['flee', 'cower', 'call', 'freeze'].includes(CB.react(mk(['combat:panics', 'combat:hides']), { role: 'victim' }, 1).kind), 'a panicker does not fight');
    ck(CB.react(mk(['combat:aggressive', 'combat:reckless']), { role: 'victim' }, 1).kind === 'fight', 'an aggressive one fights');
    ck(CB.react(mk(['combat:negotiates', 'combat:stoic']), { role: 'victim', handsUp: true }, 1).kind !== 'fight', 'hands up talks them down');
    ck(CB.react(mk(['combat:aggressive']), { role: 'victim', injury: 'stunned' }, 1).kind === 'cower', 'stunned people cower');
    ck(CB.react(mk(['combat:protective']), { role: 'witness', friendOfVictim: 1 }, 1).kind === 'defend', 'protective friend defends'); }
  // ---- consequences
  { const vic = ppl.find(p => p.dept === 'engineering') || ppl[3], w1 = ppl.find(p => p !== vic && p.dept === vic.dept), w2 = ppl.find(p => p !== vic && p.dept !== vic.dept && p.dept !== 'security');
    const wit = [{ person: w1, friend: 0.8, sameDept: true }, { person: w2, friend: 0, sameDept: false }];
    const fx = CB.consequence({ act: 'strike', victim: vic, witnesses: wit, provoked: 'none', offences: 0, roster: R, room: 'mess', seed: 3 }), bump = (id) => fx.bumps.filter(b => b[0] === id).reduce((a, b) => a + b[1], 0);
    ck(bump(vic.id) < -0.2 && bump(w1.id) < bump(w2.id) && bump(w2.id) < 0, 'victim and witnesses lose trust (friends most) ' + JSON.stringify(fx.bumps.slice(0, 4)));
    ck(fx.chain.some(c => /struck .* unprovoked/.test(c)) && fx.security && fx.alert?.id === 'intruder' && fx.record.kind === 'assault', 'assault: chain + intruder alert + security');
    ck(fx.bumps.length > wit.length + 1, 'gossip reaches the victim\'s department');
    const rep = CB.consequence({ act: 'strike', victim: vic, witnesses: wit, provoked: 'none', offences: 2, roster: R, seed: 3 }); ck(rep.bumps[0][1] < fx.bumps[0][1], 'repeat offences cost more');
    const shove = CB.consequence({ act: 'shove', victim: vic, witnesses: wit, provoked: 'none', roster: R, seed: 3 }); ck(!shove.security && !shove.chain.length && shove.bumps[0][1] > fx.bumps[0][1], 'a shove is minor');
    const sd = CB.consequence({ act: 'strike', victim: vic, witnesses: wit, provoked: 'self-defence', roster: R }); ck(!sd.security && sd.bumps.every(b => b[1] > -0.05), 'self-defence is not an assault');
    const sab = CB.consequence({ act: 'restrain', victim: vic, witnesses: wit, provoked: 'saboteur', roster: R }); ck(sab.sabotage === 'clear' && sab.good && sab.bumps.every(b => b[1] > 0) && sab.bumps.some(b => ppl[b[0]]?.dept === 'security') && /saboteur/.test(sab.chain[0]), 'subduing the saboteur earns trust and clears sabotage');
    const hos = CB.consequence({ act: 'ko', victim: vic, witnesses: wit, provoked: 'hostile', roster: R }); ck(hos.good && !hos.security && hos.bumps.every(b => b[1] > 0), 'subduing a crazed crew member earns trust');
    // applied to a duty-like ledger, real alerts and a phases-like object
    const trust = new Map(), duty = { roster: R, chain: [], stats: {}, _bump(p, d) { trust.set(p.id, (trust.get(p.id) || 0) + d); } }, alerts = new AlertState(), phases = { saboteur: vic, severity: 0.6, ev: [], emit(e) { this.ev.push(e); } };
    const n = CB.applyConsequence(fx, { duty, alerts, roster: R, deckNo: 3 }); ck(n === fx.bumps.length && trust.get(vic.id) < 0 && duty.chain.length === 1 && duty.stats.assaults === 1 && alerts.has('intruder') && alerts.get('intruder').deck === 3, 'applyConsequence: trust, chain, deck alert');
    CB.applyConsequence(sab, { duty, alerts, phases, roster: R }); ck(phases.saboteur === null && phases.severity < 0.3 && phases.ev.some(e => e.type === 'sabotage_stopped'), 'sabotage progress cleared'); }
  // ---- armory gating, responders, security moves
  { const crewman = ppl.find(p => p.dept === 'services' && p.rank <= 1) || ppl.find(p => p.dept !== 'security' && !['co', 'xo'].includes(p.billet)), co = ppl.find(p => p.billet === 'co');
    ck(CB.canDraw(sec).authorised && (!co || CB.canDraw(co).authorised) && CB.canDraw(crewman, { alertSev: 4 }).authorised && CB.canDraw(crewman, { order: 'Capt. X' }).authorised, 'authorised draws');
    const no = CB.canDraw(crewman); ck(!no.authorised && no.penalty.trust < 0 && /without authority/.test(no.penalty.chain), 'unauthorised draw: penalty');
    const rs = CB.responders(R, { n: 3 }); ck(rs.length >= 2 && rs.every(p => p.dept === 'security' && !p.isPlayer) && rs[0].rank <= rs[1].rank, 'responders: security, guards first');
    ck(!CB.responders(R, { exclude: [rs[0]], n: 3 }).includes(rs[0]), 'the suspect is never their own responder');
    ck(CB.securityMove(sec, { violent: true }) === 'stun' && CB.securityMove(sec, { violent: true }, false) === 'restrain' && CB.securityMove(sec, { violent: true, handsUp: true }) === 'restrain', 'stun the violent, restrain the compliant');
    const lo = HH.loadoutFor(sec); ck(lo.some(i => i.startsWith('phaser')) && HH.newInstance('phaser1').setting === 'stun', 'security wears a phaser, stun by default'); }
  ck(CB.heard(6, 5) && !CB.heard(6, 5, false) && CB.heard(6, 2.9, false), 'noise through walls carries half as far');
  return { actions: CB.ACTION_KEYS.length };
}

// ---- browser block: the real game (page = the Systems Nominal page, mad = the madness page)
export async function combatBrowser(page, mad, fail) {
  const r = await page.evaluate(async () => {
    const g = __game, G = g.G, P = g.P, out = {}; G.forceShip = 0; g.newRun(); g.setQuality('low'); document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); G.phase = 'play'; G.hp = G.maxHp = 100;
    let t = 0; const tick = (n) => { for (let i = 0; i < n; i++) { t += 1 / 30; G.phase = 'play'; g.step(1 / 30, t); } };
    tick(10); g.simBodies(0, true); if (g.ents.filter(x => x.simmed).length < 5) { const dn = G.shipDecks.findIndex((d, i) => g.sim.onDeck(i + 1).length >= 6); if (dn >= 0) { g.loadDeck(dn + 1); tick(5); G.phase = 'play'; g.simBodies(0, true); } }
    G.simT = 1e9; if (g.haul) g.haul.t = 1e9; const M = G.combat, W = g.world, hum = (x) => x.mesh.userData.human; out.have = !!M;
    const es = g.ents.filter(x => x.simmed && x.mesh?.userData.human && x.person.dept !== 'security'); out.n = es.length; if (es.length < 3) return out;
    const open = (x, z) => { const [tx, ty] = W.tile(x, z); return !W.solid(tx, ty) && !W.isTube(tx, ty); };
    const clear = (e, r = 3.5) => { for (const o of g.ents) if (o !== e && o.simmed && Math.hypot(o.x - e.x, o.z - e.z) < r) { o.x += 60; o.mesh.position.x = o.x; } };
    const stand = (e, d = 0.85) => { const y0 = e.mesh.rotation.y; let px = e.x, pz = e.z; for (const da of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.5, -2.5, 3.14]) { px = e.x + Math.sin(y0 + da) * d; pz = e.z + Math.cos(y0 + da) * d; if (open(px, pz) && W.los(px, pz, e.x, e.z)) break; } P.x = px; P.z = pz; P.vx = P.vz = 0; P.kbx = P.kbz = 0; P.yaw = Math.atan2(-(e.x - P.x), -(e.z - P.z)); };
    const trust0 = new Map(G.roster.people.map(p => [p.id, g.duty.trust(p)]));
    // 1) strike: reaction clip + stun, trust, witnesses, chain, security call
    const e = es[0]; clear(e); const w = es.find(x => x !== e); if (w) { const ang = Math.atan2(P.x - e.x, P.z - e.z); w.walk = null; if (w.op) g.opEnd(w); for (const [dx, dz] of [[2.2, 0], [-2.2, 0], [0, 2.2], [0, -2.2], [1.6, 1.6], [-1.6, -1.6]]) if (open(e.x + dx, e.z + dz) && W.los(e.x + dx, e.z + dz, e.x, e.z)) { w.x = e.x + dx; w.z = e.z + dz; w.mesh.position.set(w.x, 0, w.z); break; } }
    stand(e); const clips = new Set(); let stunned = false, swings = 0;
    for (; swings < 8 && !(e.cb?.inj.hits > 0); swings++) { M.cool = 0; M.act = null; M.primary(); for (let i = 0; i < 20; i++) { tick(1); stand(e); if (hum(e).current) clips.add(hum(e).current); if (e.cb && e.cb.inj.stun > 0) stunned = true; } }
    for (let i = 0; i < 4 && e.cb?.inj.hits < 2; i++) { M.cool = 0; M.act = null; M.primary(); for (let k = 0; k < 15; k++) { tick(1); stand(e); clips.add(hum(e).current); if (e.cb?.inj.stun > 0) stunned = true; } }
    const dT = (p) => +(g.duty.trust(p) - trust0.get(p.id)).toFixed(3);
    out.strike = { swings, hits: e.cb?.inj.hits || 0, clips: [...clips].filter(c => /hit_|death|crouch/.test(c)), stunned, victimTrust: dT(e.person), witnessTrust: w ? dT(w.person) : null, lost: G.roster.people.filter(p => p !== e.person && !p.isPlayer && g.duty.trust(p) < trust0.get(p.id) - 1e-6).length, chain: g.duty.chain.some(c => /unprovoked/.test(c)), sec: !!M.sec, alert: g.alerts.has('intruder'), log: M.log.slice(-2), react: e.cb?.ai || e.cb?.pend?.kind || null, ctl: !!e.cb?.ctl };
    // 2) security response to the unprovoked assault: they come (sim redirect, real bodies), restrain the player, release; never game over
    G.simT = 0; let restrained = false, n = 0; for (; n < 30 * 120 && (M.sec || restrained); n++) { tick(1); if (M.restrained > 0) restrained = true; if (!M.sec) break; }
    G.simT = 1e9; out.security = { restrained, secs: +(n / 30).toFixed(1), chain: g.duty.chain.filter(c => /[Ss]ecurity/.test(c)).slice(-2), phase: G.phase, over: !M.sec, slow: P.cbSlow };
    // 3) grab another crew member at a console: their work stops, the body follows the hold point, release -> they resume
    const f = es.find(x => x !== e && x !== w && !x.cb) || es[2]; clear(f); const cp = W.d.props.find(p => p.kind === 'console' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => open(...W.center(p.tx + a, p.ty + b))));
    if (cp) { const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [cp.tx + a, cp.ty + b]).find(([x, y]) => open(...W.center(x, y))), [x, z] = W.center(nb[0], nb[1]); f.walk = null; f.x = x; f.z = z; f.mesh.position.set(x, 0, z); f.faceAt = W.center(cp.tx, cp.ty); f.spot = 'console'; g.opEnd(f); g.opStart(f); clear(f); }
    tick(5); const wasOp = !!f.op; stand(f, 0.85); let grabbed = false, tries = 0;
    for (; tries < 8 && !grabbed; tries++) { if (!M.g) { stand(f, 0.85); M.secondary(true); } for (let i = 0; i < 25 && !grabbed; i++) { tick(1); grabbed = ['grabbed', 'held'].includes(M.g?.gs.state) && M.g.e === f; } }
    const g0 = { x: f.x, z: f.z }; let maxGap = 0, moved = 0, slow = 1, hud = null; if (grabbed) { const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); for (let i = 0; i < 45 && M.g; i++) { const nx = P.x - fx * 0.025, nz = P.z - fz * 0.025; if (open(nx, nz)) { P.x = nx; P.z = nz; } tick(1); if (M.g) { maxGap = Math.max(maxGap, Math.hypot(f.x - P.x, f.z - P.z)); moved = Math.hypot(f.x - g0.x, f.z - g0.z); slow = Math.min(slow, P.cbSlow); hud = hud || document.getElementById('cb-ring')?.dataset.state || null; } } }
    out.grab = { wasOp, tries, grabbed, opEnded: !f.op, state: M.g?.gs.state || 'broke free / let go', follows: +moved.toFixed(2), gap: +maxGap.toFixed(2), slow, hud, cower: !!f.cower, dbg: grabbed ? null : { restrained: M.restrained, ko: M.ko, g: M.g?.e.person.short || null, gs: M.g?.gs.state || null, front: M.front(1.35, 0.55)?.person.short || null, f: f.person.short, fst: f.cb ? [f.cb.inj.state, f.cb.ai, f.cb.ctl] : null, d: +Math.hypot(f.x - P.x, f.z - P.z).toFixed(2), sec: !!M.sec, carry: !!G.carry, push: !!P.pushing } };
    M.secondary(false); tick(3); out.grab.released = !M.g;
    let resumed = false; for (let i = 0; i < 30 * 40 && !resumed; i++) { tick(1); resumed = !f.cb?.ctl && !f.cb?.fleeT && (!!f.op || !!f.walk || !f.cower); } out.grab.resumed = resumed; out.grab.update = !hum(f)._cbOrig;
    // 4) the player gets hit: HP, stagger, knock-down instead of death
    const h = es.find(x => x !== e && x !== f && x !== w) || w; clear(h); M.release?.(); g.sim.release(h.person); if (h.op) g.opEnd(h); h.walk = null; stand(h, 1.0); M.takeOver(h); M.start(h, 'fight'); const hp0 = G.hp; let minSlow = 1, flash = false, hpLow = G.hp;
    const trace = []; for (let i = 0; i < 30 * 12 && G.hp > hp0 - 15; i++) { tick(1); if (i % 45 === 0) trace.push([h.cb.ai, h.cb.pend?.kind, +Math.hypot(h.x - P.x, h.z - P.z).toFixed(1), +h.cb.cd.toFixed(1), h.cb.inj.state, !!h.cb.ctl, h.cb.fleeT || 0, M.stance, M.ko > 0, !!h.walk].join(':')); minSlow = Math.min(minSlow, P.cbSlow); if (M.flashT > 0) flash = true; hpLow = Math.min(hpLow, G.hp); }
    let downed = false; for (let i = 0; i < 30 * 20 && !downed; i++) { G.hp = Math.min(G.hp, 3); if (h.cb.ai !== 'fight') { M.start(h, 'fight'); } tick(1); downed = M.ko > 0; }
    out.hurt = { hp0, hpLow: +hpLow.toFixed(1), staggered: minSlow < 1, flash, downed, hpAfter: +G.hp.toFixed(1), phase: G.phase, alive: G.hp > 0 && G.phase === 'play', grabbedYou: !!M.grabbedBy, h: h.person.short, trace };
    M.grabbedBy = null; M.calm(h);
    // 5) quick wheel 'Hands' kids + armory gating
    out.wheel = M.wheelKids().map(k => k.id); const S = G.menus.sectors().find(s => s.id === 'tools'); out.toolsHands = !!S?.kids.some(k => k.id === 't.hands');
    out.hudIds = ['cb-hud', 'cb-stance', 'cb-ring', 'cb-target', 'cb-restrained', 'cb-hint'].every(id => document.getElementById(id));
    return out;
  });
  console.log('combat browser:', JSON.stringify(r));
  if (!r.have || r.n < 3) { fail('combat browser: no crew to test with ' + JSON.stringify(r)); return r; }
  const s = r.strike; if (!(s.hits > 0 && s.clips.length && s.stunned && s.victimTrust < -0.15 && s.lost >= 1 && s.chain && s.sec && s.alert && s.ctl)) fail('combat: strike -> reaction / stun / trust / witnesses / security ' + JSON.stringify(s));
  if (s.witnessTrust !== null && !(s.witnessTrust < 0)) fail('combat: a witness standing by lost no trust ' + JSON.stringify(s));
  const gr = r.grab; if (!(gr.grabbed && gr.opEnded && gr.follows > 0.4 && gr.gap < 1.3 && gr.slow < 1 && gr.hud && gr.released && gr.resumed && gr.update)) fail('combat: grab / hold / drag / release / resume ' + JSON.stringify(gr));
  if (!gr.wasOp) console.log('combat: note — no console operator to grab on this layout');
  const h = r.hurt; if (!(h.hpLow < h.hp0 && h.staggered && h.flash && h.downed && h.alive && h.hpAfter > 0)) fail('combat: player HP / stagger / knock-down ' + JSON.stringify(h));
  const sc = r.security; if (!(sc.over && sc.phase === 'play' && (sc.restrained || sc.chain.some(c => /logged/.test(c))) && sc.chain.length)) fail('combat: security response ' + JSON.stringify(sc));
  if (!(r.wheel.length >= 6 && ['h.grab', 'h.release', 'h.restrain', 'h.subdue', 'h.fists', 'h.up'].every(k => r.wheel.includes(k)) && r.toolsHands && r.hudIds)) fail('combat: wheel / HUD ids ' + JSON.stringify({ w: r.wheel, t: r.toolsHands, h: r.hudIds }));
  // madness mode: no hand-to-hand, the zapper still fires (right mouse stays the grapple hook)
  if (mad) {
    const m = await mad.evaluate(async () => { const g = __game, G = g.G; g.newRun(); document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); G.phase = 'play'; let t = 0; for (let i = 0; i < 5; i++) { t += 1 / 30; g.step(1 / 30, t); } G.phaser = Math.max(1, G.phaser); const p0 = G.phaser; g.fire(); return { mode: G.mode, fired: G.phaser === p0 - 1, prim: G.combat?.primary?.() === false, sec: G.combat?.secondary?.(true) === false, hud: document.getElementById('cb-hud')?.style.display ?? 'none' }; });
    console.log('combat madness:', JSON.stringify(m)); if (!(m.mode === 'madness' && m.fired && m.prim && m.sec)) fail('combat: madness mode zapper / no hand-to-hand ' + JSON.stringify(m));
  }
  return r;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) { let bad = 0; const r = await combatTests((m) => { bad++; console.log('FAIL', m); }); console.log('combat unit:', JSON.stringify(r), bad ? 'FAILED' : 'OK'); process.exit(bad ? 1 : 0); }
