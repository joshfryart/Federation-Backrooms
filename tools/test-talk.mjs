// Conversation close-up (js/talk.js): node unit tests for the pure parts (state machine, camera framing / ease / clearance,
// pause rules, jaw envelope, mood, intent availability + lock reasons, trust effects, lines).   node tools/test-talk.mjs
// The browser half (E on a crew member -> phase 'talk', camera close + FOV down, world frozen but the speaker animates,
// an intent moves trust, Esc / E end without the pause screen, camera restored exactly, robustness) is talkBrowser(page, fail).
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

export async function talkTests(fail) {
  const T = await imp('js/talk.js'), SP = await imp('js/speech.js');
  const ck = (c, m) => { if (!c) fail('talk: ' + m); return !!c; }, near = (a, b, e = 1e-3) => Math.abs(a - b) <= e;
  // ---- state machine: idle -> in (0.7 s) -> talk -> out (0.5 s / 0.3 s hurried) -> idle
  { const M = T.createTalkMachine(); ck(M.state === 'idle' && !M.active && !M.inputOk, 'machine starts idle');
    ck(M.begin() && M.state === 'in' && M.active && M.inputOk && !M.begin(), 'begin -> in, once');
    M.tick(0.35); ck(M.k > 0.4 && M.k < 0.6, 'half way in: k ~0.5 (' + M.k.toFixed(2) + ')');
    ck(M.tick(0.36) === 'entered' && M.state === 'talk' && M.k === 1, 'entered after 0.7 s');
    M.tick(5); ck(M.state === 'talk' && M.k === 1, 'talk holds');
    ck(M.end() && M.state === 'out' && !M.inputOk && !M.end(), 'end -> out (no input), once');
    M.tick(0.25); ck(M.k > 0.3 && M.k < 0.7, 'half way out');
    ck(M.tick(0.26) === 'done' && M.state === 'idle' && M.k === 0, 'done after 0.5 s');
    ck(!M.end(), 'end while idle does nothing');
    M.begin(); M.tick(0.2); const k0 = M.k; M.end(true); ck(M.dur === T.TALK.fastT, 'hurried exit is 0.3 s'); M.tick(0.01); ck(M.k <= k0, 'out starts from the current blend (no jump)'); ck(M.tick(0.3) === 'done', 'hurried exit done in 0.3 s');
    M.begin(); M.abort(); ck(M.state === 'idle' && M.k === 0, 'abort resets'); }
  // ---- ease / damp
  ck(T.ease(0) === 0 && T.ease(1) === 1 && near(T.ease(0.5), 0.5) && T.ease(-1) === 0 && T.ease(2) === 1, 'ease is a clamped smoothstep');
  { let mono = true; for (let i = 1; i <= 20; i++) if (T.ease(i / 20) < T.ease((i - 1) / 20)) mono = false; ck(mono, 'ease is monotonic'); }
  ck(near(T.damp(12, 1 / 60) + T.damp(12, 1 / 60) * (1 - T.damp(12, 1 / 60)), T.damp(12, 1 / 30)), 'damp is frame-rate independent');
  // ---- camera framing: the face lands on the left third, a little above the middle, ~0.9 m away, for any heading / aspect
  for (const [fx, fz] of [[0, 1], [1, 0], [-0.6, 0.8], [0, -1]]) for (const aspect of [16 / 9, 4 / 3, 21 / 9]) {
    const face = { x: 3, y: 1.62, z: -2 }, fr = T.framing(face, { x: fx, z: fz }, { aspect }), p = T.project(face, fr.pos, fr.look, T.TALK.fov, aspect), d = Math.hypot(fr.pos.x - face.x, fr.pos.z - face.z);
    ck(near(p.x, T.TALK.third, 0.02), `framing x = left third (${p.x.toFixed(3)}, fwd ${fx},${fz}, aspect ${aspect.toFixed(2)})`);
    ck(p.y > 0.35 && p.y < 0.5, `face a little above the middle (${p.y.toFixed(3)})`);
    ck(d > 0.85 && d < 0.97 && p.depth > 0.8, `camera ~0.9 m in front of the face (${d.toFixed(2)})`);
  }
  { const fr = T.framing({ x: 0, y: 1.6, z: 0 }, { x: 0, z: 1 }, { dist: 0.6 }), p = T.project({ x: 0, y: 1.6, z: 0 }, fr.pos, fr.look, T.TALK.fov, 16 / 9); ck(near(p.x, T.TALK.third, 0.02), 'shorter distance keeps the framing'); }
  // ---- clearance: walls shrink the distance or swing the camera round the speaker
  { const fwd = { x: 0, z: 1 };
    ck(T.pickClearance(fwd, () => Infinity).deg === 0 && T.pickClearance(fwd, () => Infinity).dist === T.TALK.dist, 'free: straight on, full distance');
    const c = T.pickClearance(fwd, (d) => d.deg === 0 ? 0.5 : d.deg === 20 ? Infinity : 0.6); ck(c.deg === 20 && c.dist === T.TALK.dist, 'blocked straight on: swing +20 deg (' + JSON.stringify(c) + ')');
    const s = T.pickClearance(fwd, (d) => d.deg === -35 ? 0.8 : 0.3); ck(s.deg === -35 && near(s.dist, 0.7), 'all blocked: the roomiest direction, shrunk');
    ck(T.pickClearance(fwd, () => 0.2).dist === T.TALK.minDist, 'never closer than minDist');
    ck(T.clearanceCandidates(fwd).every(d => near(Math.hypot(d.x, d.z), 1)), 'candidates are unit vectors'); }
  // ---- pause rules: only the speaker, the camera and the talk UI run
  for (const s of ['speaker', 'camera', 'talk-ui']) ck(T.runsInTalk(s), s + ' runs during talk');
  for (const s of ['sim', 'comms', 'clock', 'phases', 'duty', 'repair', 'npcs', 'enemies', 'particles', 'doors', 'player', 'hazard', 'time']) ck(!T.runsInTalk(s), s + ' is frozen during talk');
  ck(!T.PAUSE.runs.some(s => T.PAUSE.frozen.includes(s)), 'run / frozen lists are disjoint');
  // ---- jaw from the syllable plan; flap fallback
  { const plan = SP.babblePlan('Hello there, sir. All quiet.'), mid = plan.syl[1], j = T.jawAt(plan.syl, mid.at + mid.dur / 2);
    ck(j > 0.2 && j <= 1, 'jaw opens mid-syllable (' + j.toFixed(2) + ')'); ck(T.jawAt(plan.syl, -0.1) === 0 && T.jawAt(plan.syl, plan.total + 1) === 0 && T.jawAt([], 0.3) === 0, 'jaw shut before / after / without a plan');
    let ok = true; for (let t = 0; t < 3; t += 0.01) { const f = T.flapAt(t); if (!(f >= 0 && f <= 1)) ok = false; } ck(ok, 'flap stays in 0..1'); }
  // ---- mood + relationship labels
  ck(T.moodOf({ trust: 0.8 }) === 'warm' && T.moodOf({ trust: 0.5 }) === 'neutral' && T.moodOf({ trust: 0.2 }) === 'edge', 'mood from trust');
  ck(T.moodOf({ trust: 0.7, stress: 1 }) !== 'warm', 'ship stress cools the mood'); ck(T.relLabel(0.9) === 'trusted' && T.relLabel(0.1) === 'cold' && T.relLabel(0.45) === 'neutral', 'relationship labels');
  // ---- intents: availability + lock reasons
  { const base = { npc: { id: 3, family: 'Kaur', tags: [] }, me: { rank: 3 }, trust: 0.5, isSub: false, sameDept: false, carry: null, due: [], hasDuty: true, faults: [], repair: null, gossip: [{ id: 7, family: 'Chen', type: 'friend', valence: 0.6, reason: 'play cards' }], social: true };
    const C = T.buildIntents(base), ids = C.map(c => c.id).join(',');
    ck(C.length === 8 && ids === 'greet,duty,mood,small,help,order,give,social', '8 categories in a fixed order: ' + ids);
    ck(T.lockOf(C, 'order') === T.WHY.notSub && T.lockOf(C, 'order.duty') === T.WHY.notSub, 'order locked: "They do not report to you" (kids too)');
    ck(T.lockOf(C, 'give') === T.WHY.noItem, 'give locked without an item'); ck(T.lockOf(C, 'help') === T.WHY.noReason, 'help locked outside your department / chain');
    ck(T.lockOf(C, 'greet') === null && T.lockOf(C, 'small') === null && T.lockOf(C, 'social.hangs') === null && T.lockOf(C, 'social.gossip.7') === null, 'greet / small talk / friends / gossip open');
    const S = T.buildIntents({ ...base, isSub: true, carry: 'Spanner', sameDept: true, due: [{ id: 'l1', label: 'EPS rounds' }] });
    ck(T.lockOf(S, 'order.duty') === null && T.lockOf(S, 'order.deleg.l1') === null && T.lockOf(S, 'give') === null && T.lockOf(S, 'help.duty') === null, 'a subordinate with an item: order / delegate / give / help open');
    const L = T.buildIntents({ ...base, sameDept: true, trust: 0.1 }); ck(T.lockOf(L, 'help') === T.WHY.noTrust && T.lockOf(L, 'social.gossip.7') === T.WHY.noTrust, 'low trust locks help and gossip');
    const N = T.buildIntents({ ...base, isSub: true, due: [] }); ck(T.lockOf(N, 'order.deleg') === T.WHY.noDue, 'nothing due: delegate locked with a reason');
    const R = T.buildIntents({ ...base, repair: { sys: 'eps', name: 'EPS grid', pct: 40, state: 'working' } }), dk = R[1].kids.map(k => k.id);
    ck(dk[0] === 'duty.fixing' && R[1].kids[0].def && dk.includes('duty.take') && dk.includes('duty.assist') && T.lockOf(R, 'duty.assist') === null, 'repairing: what are you fixing (default) / lend a hand / take over');
    ck(T.lockOf(T.buildIntents({ ...base, repair: { sys: 'eps', name: 'EPS', state: 'travel' } }), 'duty.assist') === T.WHY.notWorking, 'lend a hand locked until they are on site');
    const F = T.buildIntents({ ...base, isSub: true, sameDept: true, faults: [{ sys: 'eps', name: 'EPS grid', status: 'damaged' }] }); ck(T.lockOf(F, 'help.fix.eps') === null && T.lockOf(F, 'order.fix.eps') === null, 'faults: fix-it kids under help and order');
    ck(T.lockOf(C, 'nope') === 'unknown', 'unknown intent is locked'); }
  // ---- trust effects per conversation
  { const m = {}; ck(T.effectFor('greet', m) === 0.01 && T.effectFor('greet', m) === 0, 'greet: +0.01 once');
    ck(T.effectFor('small', m) === 0.03 && T.effectFor('small', m) === 0.015 && T.effectFor('small', m) === 0.0075, 'small talk diminishes x0.5');
    ck(T.effectFor('social.gossip.4', m) === 0.01 && T.effectFor('social.gossip.4', m) === 0 && T.effectFor('social.gossip.5', m) === 0.01, 'gossip: once per person');
    ck(T.effectFor('order.duty', m) === 0 && T.effectFor('duty.status', m) === 0, 'Duty-run intents add nothing here'); }
  // ---- lines
  { const r = () => 0.1, c = { mood: 'neutral', sir: 'sir', trust: 0.5, tags: ['speech:deadpan'], bark: ['Morning, sir.'], board: [{ name: 'EPS grid', status: 'nominal' }], deptName: 'Engineering', shipBad: 0 };
    ck(T.lineFor('greet', c, r).text === 'Morning, sir.', 'greet uses the billet bark pool');
    ck(/green/.test(T.lineFor('duty.status', c, r).text), 'status: all green from their department');
    ck(/EPS grid damaged/.test(T.lineFor('duty.status', { ...c, board: [{ name: 'EPS grid', status: 'damaged' }] }, r).text), 'status: names a damaged system');
    ck(T.lineFor('small', c, r).text === 'The coffee is warm. That is the highlight.', 'small talk from a speech tag');
    ck(T.lineFor('social.gossip.7', { ...c, trust: 0.2, gossip: { family: 'Chen', type: 'friend', reason: 'x' } }, r).gesture === 'shrug', 'cold: gossip is a shrug');
    ck(/Chen/.test(T.lineFor('social.gossip.7', { ...c, trust: 0.8, gossip: { family: 'Chen', type: 'rival', valence: -0.5, reason: 'the poker debt' } }, r).text), 'warm: gossip names the third party');
    ck(/40%/.test(T.lineFor('duty.fixing', { ...c, repair: { name: 'EPS grid', pct: 40, state: 'working' } }, r).text), 'repair: progress in the line');
    for (const id of ['greet', 'duty.ask', 'duty.status', 'mood', 'small', 'social.hangs']) { const l = T.lineFor(id, c, Math.random); ck(l.text && l.text.length < 170 && (l.text.match(/[.!?](\s|$)/g) || []).length <= 3 && l.gesture, id + ': a short line with a gesture'); }
    ck(T.resultLine('order', { ok: true }, c, r).gesture === 'nod' && T.resultLine('order', { refused: true }, c, r).gesture === 'shake_head' && /report/.test(T.resultLine('order', { ok: false, why: 'Kaur does not report to you' }, c, r).text), 'result lines: ok / refused / why');
    ck(T.youLine('social.gossip.7', 'Chen') === 'Heard anything about Chen?' && T.youLine('help.fix.eps').length > 3, 'your own lines'); }
}

/** browser: E -> 'talk', close-up, frozen world, living speaker, trust, Esc / E exit, exact restore, robustness. page = Systems Nominal page */
export async function talkBrowser(page, fail) {
  const r = await page.evaluate(async () => {
    const g = __game, G = g.G, out = {}; const rpl = HTMLCanvasElement.prototype.requestPointerLock; HTMLCanvasElement.prototype.requestPointerLock = function () { return Promise.resolve(); };   // headless: no real pointer lock (see the ui browser block)
    G.forceShip = 0; g.newRun(); g.setQuality('low'); document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); G.phase = 'play'; G.hp = G.maxHp = 1e6;
    let t = 0; const frame = (n) => { for (let i = 0; i < n; i++) { t += 1 / 30; if (G.phase === 'talk') g.talk.step(1 / 30, t); else if (G.phase === 'play') g.step(1 / 30, t); g.menus.frame(1 / 30); if (g.talk.active && G.phase !== 'talk') g.talk.abort(); } };   // = main.js frame()
    const kd = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true })), ku = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })), key = (c) => { kd(c); ku(c); };
    frame(20);
    let e = g.ents.find(x => x.kind === 'crew' && x.simmed && x.mesh?.userData.human && !x.walk && !x.fake) || g.ents.find(x => x.kind === 'crew' && x.simmed && x.mesh?.userData.human);
    if (!e) return { err: 'no crew on the deck' };
    const stand = () => { const P = g.P, y0 = e.mesh.rotation.y; let px = e.x, pz = e.z; for (const da of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.5, -2.5, 3.14]) { px = e.x + Math.sin(y0 + da) * 1.3; pz = e.z + Math.cos(y0 + da) * 1.3; const [tx, ty] = g.world.tile(px, pz); if (!g.world.solid(tx, ty) && g.world.los(px, pz, e.x, e.z)) break; } P.x = px; P.z = pz; P.vx = P.vz = 0; P.yaw = Math.atan2(-(e.x - px), -(e.z - pz)); P.pitch = 0; };
    stand();
    g.step(1 / 30, t); const cam = g.camera, c0 = { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov }, D = G.duty;
    const clocks = () => ({ sim: g.sim.t, duty: D.t, clock: g.clock.hour, ph: g.phases.t ?? g.phases.status?.().t, time: G.time, rep: g.repair?.t });
    // E on the crew member -> phase 'talk' through the real key path (menus router + main keydown -> interact)
    key('KeyE'); out.enter = { phase: G.phase, layer: g.ui.has('talk'), frozen: G.menuPause, body: document.body.classList.contains('talking') };
    if (G.phase !== 'talk') { out.enter.fallback = true; g.talk.begin(e); }
    e = g.talk.e || e; const H = e.mesh.userData.human, pr = e.person;   // whoever E picked (the nearest crew member)
    const others = g.ents.filter(o => o !== e && o.mesh).slice(0, 6).map(o => [o, o.mesh.position.x, o.mesh.position.z, o.mesh.userData.human?.mixer.time]);
    const k0 = clocks(), mx0 = H.mixer.time; frame(45);
    const hp = H.bones.Head.getWorldPosition(cam.position.clone()), k1 = clocks();
    out.cam = { d: +cam.position.distanceTo(hp).toFixed(2), fov: +cam.fov.toFixed(1), moved: +cam.position.distanceTo(c0.p).toFixed(2) };
    out.frozen = { same: JSON.stringify(k0) === JSON.stringify(k1), k0, k1, others: others.every(([o, x, z, m]) => o.mesh.position.x === x && o.mesh.position.z === z && (m === undefined || o.mesh.userData.human.mixer.time === m)), speaker: +(H.mixer.time - mx0).toFixed(2) };
    out.hud = { minimap: getComputedStyle(document.getElementById('minimap')).visibility, tk: document.getElementById('tk').classList.contains('on'), segs: document.querySelectorAll('#tk .wseg').length, plate: document.querySelector('#tk .plate h1').textContent.includes(pr.family), portrait: !!document.querySelector('#tk .plate img').getAttribute('src') };
    out.opener = (document.querySelector('#tk .subt .tx').textContent || '').length > 0;
    // an intent: small talk raises trust, the line is spoken, subtitled and logged; a locked one says why
    const tr0 = D.trust(pr), n0 = G.sayLog.length; const line = g.talk.choose('small'); frame(40);
    out.intent = { d: +(D.trust(pr) - tr0).toFixed(3), line: line?.text, sub: document.querySelector('#tk .subt .tx').textContent, logged: G.sayLog.slice(n0).some(l => l.msg.startsWith(pr.short + ':')), meter: document.querySelector('#tk .rtx').textContent };
    out.lock = D.subs().includes(pr) ? 'sub' : { ok: g.talk.choose('order.duty') === false, why: document.querySelector('#tk .you').textContent };
    const nlog = g.talk.log.length; key('Digit3'); frame(10); out.digit = g.talk.log.length === nlog + 1 && g.talk.log[nlog].id === 'mood';
    // Esc ends it: the layer pops, no pause screen, the camera comes back exactly, the world runs again
    key('Escape'); out.esc = { out: g.talk.M.state, layer: g.ui.has('talk') }; frame(25);
    out.esc = { ...out.esc, phase: G.phase, pause: document.getElementById('pause').classList.contains('show'), frozen: g.ui.frozen, body: document.body.classList.contains('talking'), dp: cam.position.distanceTo(c0.p), dq: 1 - Math.abs(cam.quaternion.dot(c0.q)), fov: cam.fov === c0.fov, clip: H.current, add: H.add === null || G.phase === 'play' };
    const s0 = g.sim.t; frame(5); out.esc.runs = g.sim.t > s0;
    // E ends it too
    stand(); g.step(1 / 30, t); g.talk.begin(e); frame(10); key('KeyE'); frame(25); out.eEnd = G.phase === 'play' && !g.ui.frozen;
    // the speaker vanishes mid-talk -> immediate restore
    stand(); g.step(1 / 30, t); const c1 = cam.position.clone(); g.talk.begin(e); frame(10); const i = g.ents.indexOf(e); g.ents.splice(i, 1); frame(2); out.gone = { phase: G.phase, dp: +cam.position.distanceTo(c1).toFixed(4), active: g.talk.active, frozen: g.ui.frozen }; g.ents.splice(i, 0, e);
    // the phase changes under us (death, lift, end of watch) -> abort; a red alert -> hurried exit
    stand(); g.step(1 / 30, t); g.talk.begin(e); frame(5); G.phase = 'nomend'; frame(1); out.phaseChange = { active: g.talk.active, body: document.body.classList.contains('talking') }; G.phase = 'play';
    stand(); g.step(1 / 30, t); g.talk.begin(e); frame(5); g.talk.save.alert = -1; const A = g.alerts, sev = A?.top?.()?.def?.severity; if (A && A.raise) { try { A.raise('red'); } catch { } } const st = A?.top?.()?.def?.severity || 0; if (st < 3) { g.talk.save.hp = G.hp + 1; } frame(20); out.alert = { phase: G.phase, said: g.talk.lines?.includes?.('I have to go!') ?? null }; try { A?.clear?.('red'); A?.resolve?.('red'); } catch { }
    frame(5); HTMLCanvasElement.prototype.requestPointerLock = rpl; return out;
  });
  console.log('talk browser:', JSON.stringify(r));
  const ck = (c, m) => { if (!c) fail('talk browser: ' + m); };
  if (r.err) { fail('talk browser: ' + r.err); return; }
  ck(r.enter.phase === 'talk' && r.enter.layer && r.enter.frozen && r.enter.body && !r.enter.fallback, 'E on a crew member enters phase talk as a ui layer (world paused, HUD hidden)');
  ck(r.cam.d < 1.2 && r.cam.fov < 45 && r.cam.moved > 0.05, 'camera moves close to the head and the FOV narrows');
  ck(r.frozen.same && r.frozen.others, 'sim / duty / clock / phases / repair / other NPCs do not advance during talk ' + JSON.stringify([r.frozen.k0, r.frozen.k1]));
  ck(r.frozen.speaker > 1, 'the speaker keeps animating');
  ck(r.hud.minimap === 'hidden' && r.hud.tk && r.hud.segs === 8 && r.hud.plate && r.hud.portrait, 'talk HUD: plate with portrait, 8-icon wheel; minimap hidden');
  ck(r.opener, 'they open with a line');
  ck(r.intent.d > 0 && r.intent.line && r.intent.sub === r.intent.line && r.intent.logged, 'small talk raises trust, subtitles the line and logs it in G.sayLog');
  ck(r.lock === 'sub' || (r.lock.ok && /report/.test(r.lock.why)), 'a locked intent says why');
  ck(r.digit, 'digits choose on the wheel');
  ck(r.esc.out === 'out' && !r.esc.layer && r.esc.phase === 'play' && !r.esc.pause && !r.esc.frozen && !r.esc.body && r.esc.dp < 1e-9 && r.esc.dq < 1e-9 && r.esc.fov && r.esc.runs, 'Esc ends it: no pause screen, camera and phase restored exactly, world runs');
  ck(r.eEnd, 'E ends the conversation');
  ck(r.gone.phase === 'play' && r.gone.dp < 1e-6 && !r.gone.active && !r.gone.frozen, 'speaker removed mid-talk: immediate restore');
  ck(!r.phaseChange.active && !r.phaseChange.body, 'phase change mid-talk aborts cleanly');
  ck(r.alert.phase === 'play' && r.alert.said, 'red alert / hazard ends it with a hurried line');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) { let bad = 0; await talkTests((m) => { bad++; console.log('FAIL', m); }); console.log(bad ? 'FAILED' : 'talk unit OK'); process.exit(bad ? 1 : 0); }
