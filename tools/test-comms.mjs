// Tests for ship alerts, the comm bus, the bridge model and the HUD.
//   node tools/test-comms.mjs        runs the node-only unit section on its own
//   tools/test.mjs imports unitTests(fail) (node) and hudTests(page, fail) (headless browser)
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

export async function unitTests(fail) {
  const A = await imp('js/alerts.js'), { SHIPS } = await imp('js/ships.js'), C = await imp('js/crew.js'), K = await imp('js/clock.js'), B = await imp('js/bridge.js');
  const { createShipComms } = await imp('js/shipcomms.js'), BC = await imp('tools/build-comms.mjs');
  const ck = (cond, msg) => { if (!cond) fail('comms: ' + msg); return !!cond; }, out = {};

  // ---- data build + validation
  try { execFileSync(process.execPath, [join(ROOT, 'tools/build-comms.mjs'), '--check'], { stdio: 'pipe' }); } catch (e) { fail('comms: build-comms --check failed: ' + (e.stderr || e.message)); }
  const data = JSON.parse(readFileSync(join(ROOT, 'assets/data/comms.json'), 'utf8')), bad = BC.validate(data);
  ck(!bad.length, 'comms.json invalid: ' + bad.slice(0, 3).join('; '));
  const fresh = JSON.stringify(BC.build().out); ck(fresh === JSON.stringify(data), 'assets/data/comms.json is stale: run node tools/build-comms.mjs');
  out.billets = Object.keys(data.billets).length;

  // ---- alert definitions and state
  const ids = A.ALERT_IDS; ck(ids.length === 10 && ids.every(i => A.ALERTS[i]) && A.ALERTS.nominal, 'ten alerts plus nominal');
  for (const id of ['nominal', ...ids]) { const d = A.ALERTS[id]; for (const f of ['id', 'label', 'short', 'colour', 'meaning', 'doThis', 'pa', 'klaxon', 'scope', 'crewEvent']) ck(d[f], `${id}.${f}`); ck(d.severity >= 0 && d.severity <= 5 && ['ship', 'deck'].includes(d.scope), `${id} severity/scope`); }
  ck(A.ALERTS.nominal.severity === 0 && A.ALERTS.abandon_ship.severity === 5, 'severity range');
  const st = new A.AlertState(), ev = []; st.on('raise', a => ev.push('+' + a.id)); st.on('clear', a => ev.push('-' + a.id));
  st.raise('yellow', { source: 'bridge' }); st.raise('red', { byPerson: { short: 'Capt. X' } }); st.raise('gravity_failure', { source: 'auto', reason: 'x' }); st.raise('red');
  ck(st.active().map(a => a.id).join() === 'red,gravity_failure,yellow', 'active() sorted by severity: ' + st.active().map(a => a.id)); ck(ev.join() === '+yellow,+red,+gravity_failure', 'events once each: ' + ev);
  st.clear('red'); st.clear('red'); ck(st.condition().id === 'gravity_failure' && ev.join().endsWith('-red'), 'clear + condition'); st.clearAll(); ck(st.condition().id === 'nominal' && !st.active().length, 'clearAll -> green');
  const ss = new C.ShipState(SHIPS[1], 3); for (const s of C.SYSTEMS) ss.repair(s.id); const au = new A.AlertState(); au.raise('red', { source: 'bridge' });
  ss.damage('reactor', 1); ss.damage('gravity', 1); ss.damage('life', 1); au.autoFromShip(ss);
  ck(['power_failure', 'gravity_failure', 'contamination'].every(i => au.has(i)), 'autoFromShip maps reactor/gravity/life offline');
  ss.repair('reactor'); ss.repair('life'); au.autoFromShip(ss); ck(!au.has('power_failure') && !au.has('contamination') && au.has('gravity_failure') && au.has('red'), 'auto alerts clear on repair; manual ones stay');
  ck(A.fmtElapsed(125) === '2:05', 'fmtElapsed');

  // ---- clock and watches
  const ck1 = new K.ShipClock({ seed: 1, startHour: 0 }); ck1.advance(1200); ck(Math.abs(ck1.hour - 6) < 1e-6, 'a 20 minute run is 6 ship hours'); ck1.skip(3); ck(Math.abs(ck1.hour - 9) < 1e-6, 'time skip');
  let wbad = 0; for (const ship of SHIPS) for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const r = C.makeComplement(ship, seed), c = new K.ShipClock({ seed }); c.assign(r);
    for (const w of K.WATCHES) if (!r.people.some(p => p.watch === w && K.BRIDGE_BILLETS.includes(p.billet))) wbad++;
    const c2 = new K.ShipClock({ seed }), r2 = C.makeComplement(ship, seed); c2.assign(r2); if (r.people.some((p, i) => p.watch !== r2.people[i].watch)) wbad++;
  }
  ck(wbad === 0, `every watch has a bridge officer and assignment is deterministic (${wbad} problems)`);
  const rA = C.makeComplement(SHIPS[0], 11), cA = new K.ShipClock({ seed: 11 }); cA.assign(rA);
  out.watches = K.WATCHES.map(w => rA.people.filter(p => p.watch === w).length);

  // ---- bridge occupancy follows the clock; find a manned moment and an unmanned one
  const roster = C.makeComplement(SHIPS[0], 7), mk = (hour, r = roster, seed = 7) => createShipComms({ roster: r, shipState: null, seed, data, hud: false, startHour: hour });
  let mannedHour = null, emptyHour = null, stations = new Set();
  for (let h = 0; h < 24; h += 0.25) { const c = mk(h), w = c.bridge.whoIsOnBridge(); w.occupants.forEach(o => stations.add(o.station)); if (w.manned && mannedHour == null) mannedHour = h; if (!w.manned && emptyHour == null) emptyHour = h; }
  ck(mannedHour != null, 'bridge is manned at some hour'); ck(['chair', 'xo', 'helm', 'nav', 'ops', 'comms'].filter(s => stations.has(s)).length >= 5, 'bridge stations occupied from daily templates: ' + [...stations]);
  out.mannedHour = mannedHour; out.emptyHour = emptyHour;
  const first = mk(mannedHour).bridge.whoIsOnBridge(); ck(first.occupants.every(o => data.billets[o.person.billet].day.some(b => b[2] === 'bridge')), 'occupants have a bridge block');

  // ---- every alert: PA, crew lines straight from the profile data, bridge acknowledgement when manned
  const runSim = (c, secs, dt = 1 / 30) => { for (let i = 0; i < secs / dt; i++) c.tick(dt); return c; };
  const per = {};
  for (const id of ids) {
    const c = mk(mannedHour); runSim(c, 3); c.alerts.raise(id, { source: 'debug', deck: 2 }); runSim(c, 45);
    const L = c.bus.log.filter(m => m.alert === id), crew = L.filter(m => m.kind === 'alertresp'), acks = L.filter(m => m.kind === 'ack'), pa = L.filter(m => m.channel === 'pa');
    const fromData = crew.every(m => Object.values(data.billets).some(b => b.al[id].l === m.text));
    per[id] = [pa.length, crew.length, acks.length];
    ck(pa.length >= 1 && pa[0].text.startsWith(A.ALERTS[id].pa), `${id}: PA announcement`); ck(crew.length >= 3 && crew.length <= 10 && fromData, `${id}: crew alert lines from profile data (${crew.length})`);
    ck(acks.length >= 1, `${id}: bridge acknowledgement when manned`); ck(L.some(m => m.kind === 'alertorder'), `${id}: bridge order line`);
    const t0 = crew.map(m => m.t); ck(t0.every((t, i) => i === 0 || t >= t0[i - 1]), `${id}: lines staggered in time`); ck(crew.filter(m => m.t < crew[0].t + 12).length <= 7, `${id}: at most ~6 lines at once`);
    const heads = new Set(['xo', 'cfo', 'ops', 'ce', 'cos', 'cso', 'cmo', 'qm']); if (!crew.slice(0, 3).some(m => heads.has(m.from.billet))) ck(false, `${id}: department heads answer first`);
    c.alerts.clear(id); runSim(c, 12); ck(c.bus.log.some(m => m.kind === 'alertclear'), `${id}: clear announced`);
  }
  out.perAlert = per;

  // ---- unmanned bridge: honest message, then routed to the ready room / duty officer
  const nob = { ...roster, people: roster.people.filter(p => !K.BRIDGE_BILLETS.includes(p.billet) && !['yeoman', 'sensor', 'carto', 'comp', 'cos', 'dep', 'ace', 'cmo'].includes(p.billet)) }, cu = createShipComms({ roster: nob, shipState: null, seed: 7, data, hud: false, startHour: 3 });
  ck(!cu.bridge.whoIsOnBridge().manned, 'synthetic empty bridge is unmanned'); runSim(cu, 2);
  const probe = cu.bus.send({ from: B.party(nob.people.find(p => p.billet === 'ce')), to: 'Bridge', text: 'Bridge, Engineering. Anyone there?', priority: 'urgent' }); for (const x of cu.bridge.respond(probe)) cu.sim.after(x.delay, () => cu.bus.send(x.msg)); runSim(cu, 20);
  const un = cu.bus.log.filter(m => m.kind === 'unmanned' || m.kind === 'routed'); ck(un.some(m => /No response/.test(m.text) && /bridge unmanned/.test(m.text)), 'unmanned bridge says so'); ck(un.some(m => m.kind === 'routed' || /No response from/.test(m.text)), 'unmanned bridge routes to ready room / duty officer');
  cu.alerts.raise('red'); runSim(cu, 30); ck(cu.bus.log.some(m => m.alert === 'red' && m.kind === 'alertresp') && !cu.bus.log.some(m => m.alert === 'red' && m.kind === 'ack'), 'unmanned: crew still respond to an alert, no bridge ack'); out.unmanned = un.map(m => m.text.slice(0, 60));

  // ---- bridge-originated traffic, responders, ship events and the player's badge
  const cm = runSim(mk(mannedHour), 600), kinds = new Set(cm.bus.log.map(m => m.kind));
  ck(['mission', 'ready', 'statuscheck', 'checkin', 'order', 'orderreply'].every(k => kinds.has(k)), 'bridge originates mission/status/orders and crew answer: ' + [...kinds]);
  ck(cm.bus.log.filter(m => m.kind === 'statuscheck').every(m => cm.bus.log.some(r => r.t > m.t && r.t < m.t + 8 && r.from.id === m.to.id)), 'status checks are answered by the head');
  ck(cm.bus.log.length < 160, 'chatter stays readable: ' + cm.bus.log.length + ' lines in 10 min');
  const ssh = new C.ShipState(SHIPS[0], 7); for (const s of C.SYSTEMS) ssh.repair(s.id); const cs = createShipComms({ roster, shipState: ssh, seed: 7, data, hud: false, startHour: mannedHour }); runSim(cs, 5);
  ssh.damage('reactor', 0.9); runSim(cs, 25); ck(cs.bus.log.some(m => m.kind === 'fault' && /reactor|Reactor|core/i.test(m.text)) && cs.alerts.has('power_failure'), 'reactor fault: crew report + power_failure alert');
  const cp = runSim(mk(mannedHour), 5); cp.sim.playerChoose('bridge'); cp.sim.playerChoose('fault'); cp.sim.playerChoose('orders'); cp.sim.playerChoose('status'); cp.sim.playerChoose('assist'); const h1 = cp.sim.playerOptions('dept')[0]; cp.sim.playerChoose('dept', h1.arg); runSim(cp, 30);
  const pl = cp.bus.log.filter(m => m.from?.id === 'player'); ck(pl.length === 6 && cp.bus.log.filter(m => m.to?.id === 'player').length >= 5, 'player comm badge: six exchanges answered'); ck(cp.bus.log.some(m => m.kind === 'faultack' && /no|nothing/i.test(m.text)), 'player fault report with no real fault is answered honestly');
  const cf = runSim(createShipComms({ roster, shipState: ssh, seed: 7, data, hud: false, startHour: mannedHour }), 3); cf.sim.playerChoose('fault'); runSim(cf, 15); ck(cf.bus.log.some(m => m.kind === 'faultack' && /Confirmed/.test(m.text)), 'player fault report acknowledged when a real fault exists');
  const pn = createShipComms({ roster: nob, shipState: null, seed: 7, data, hud: false, startHour: 3 }); runSim(pn, 2); pn.sim.playerChoose('bridge'); runSim(pn, 15); ck(pn.bus.log.some(m => /bridge unmanned/.test(m.text)), 'player hail to an empty bridge: "bridge unmanned"');

  // ---- determinism per seed
  const sig = (c) => JSON.stringify(c.bus.log.map(m => [m.t.toFixed(3), m.from?.id, m.to?.id, m.text, m.priority, m.channel]));
  const go = (seed, hr) => { const r = C.makeComplement(SHIPS[2], seed), c = createShipComms({ roster: r, shipState: null, seed, data, hud: false, startHour: hr }); runSim(c, 40); c.alerts.raise('fire', { deck: 1 }); c.sim.playerChoose('status'); runSim(c, 60); return sig(c); };
  ck(go(9, mannedHour) === go(9, mannedHour), 'same seed gives an identical comm log'); ck(go(9, mannedHour) !== go(10, mannedHour), 'different seeds differ');
  return out;
}

// headless browser: HUD banner, badge, stack, log, radio, debug cycle. `page` is a Systems Nominal page with __game ready.
export async function hudTests(page, fail) {
  const r = await page.evaluate(async () => {
    const g = __game, G = g.G, out = {}; g.G.forceShip = 0; g.newRun(); g.setQuality('low'); document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); G.hp = G.maxHp = 1e6;
    let t = 0; const tick = (n) => { for (let i = 0; i < n; i++) { t += 1 / 30; g.step(1 / 30, t); } }, $ = (s) => document.querySelector(s), key = (code, o = {}) => { for (const ty of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(ty, { code, key: code, bubbles: true, ...o })); };
    out.api = !!(g.alerts && g.comms && g.bridge && g.clock && g.commsSim); tick(60);
    out.green = { badge: $('#ac-badge').textContent, shown: getComputedStyle($('#ac-badge')).display !== 'none', cards: document.querySelectorAll('.ac-card').length, active: g.alerts.active().length, calmFaults: g.shipState.faulted().length, auto: g.alerts.history.length };
    tick(30 * 12); out.traffic = { lines: document.querySelectorAll('#cm-stack .cm-line').length, pa: document.querySelectorAll('#cm-stack .cm-line.pa').length, log: g.comms.log.length, paOn: $('#ac-pa').classList.contains('on') || g.comms.log.some(m => m.channel === 'pa') };
    g.alerts.raise('yellow', { source: 'bridge' }); tick(5); g.alerts.raise('red', { source: 'bridge', byPerson: g.roster.people[0] }); tick(60);
    const cards = [...document.querySelectorAll('.ac-card')];
    out.red = { n: cards.length, first: cards[0]?.querySelector('.n').textContent, second: cards[1]?.querySelector('.n').textContent, meaning: cards[0]?.querySelector('.m').textContent, scope: cards[0]?.querySelector('.sc').textContent, who: cards[0]?.querySelector('.w').textContent, el: cards[0]?.querySelector('.el').textContent, badge: getComputedStyle($('#ac-badge')).display, anim: getComputedStyle(cards[0]).animationName, pulse: cards[0]?.style.getPropertyValue('--p'), lights: g.world.alertTarget, pa: $('#ac-pa').textContent, stack: document.querySelectorAll('#cm-stack .cm-line').length, paStyled: !!$('#cm-stack .cm-line.pa') };
    g.alerts.raise('fire', { deck: 2, source: 'bridge', reason: 'Smoke detected' }); tick(3); out.fireScope = document.querySelector('.ac-card[data-id=fire] .sc').textContent; out.order = [...document.querySelectorAll('.ac-card .n')].map(e => e.textContent).join('|');
    key('KeyK'); out.details = { open: getComputedStyle($('#ac-details')).display !== 'none', legend: document.querySelectorAll('#ac-details .lg > div').length, hasDo: /What you should do/.test($('#ac-details').textContent), meanings: document.querySelectorAll('#ac-details .ad').length }; key('KeyK');
    key('KeyL'); out.log = { open: getComputedStyle($('#cm-log')).display !== 'none', rows: document.querySelectorAll('#cm-log .lr').length, pa: document.querySelectorAll('#cm-log .lr.pa').length, plain: document.querySelectorAll('#cm-log .lr:not(.pa)').length }; key('KeyL');
    out.stackCap = document.querySelectorAll('#cm-stack .cm-line').length;
    key('KeyH'); out.radio = { open: getComputedStyle($('#cm-radio')).display !== 'none', opts: document.querySelectorAll('#cm-radio .opt').length };
    key('Digit2'); out.dept = document.querySelectorAll('#cm-radio .opt').length; key('Backspace'); const before = g.comms.log.length; key('Digit1'); tick(30 * 8);
    out.hail = { closed: getComputedStyle($('#cm-radio')).display === 'none', msgs: g.comms.log.slice(before).map(m => m.from.short + ':' + m.text.slice(0, 40)) };
    key('KeyH'); key('Digit5'); tick(30 * 8); key('KeyH'); key('Digit5'); tick(30 * 8);
    g.alerts.clearAll(); tick(10); out.cleared = { badge: getComputedStyle($('#ac-badge')).display !== 'none', cards: document.querySelectorAll('.ac-card').length, lights: g.world.alertTarget };
    key('F4'); tick(2); const d1 = g.alerts.active().map(a => a.id).join(); key('F4'); tick(2); const d2 = g.alerts.active().map(a => a.id).join(); key('F4', { shiftKey: true }); out.f4 = { d1, d2, after: g.alerts.active().length };
    out.nomCalm = { alertsAtStart: g.alerts.history.filter(h => h.t < 1).length };
    return out;
  });
  console.log('comms hud:', JSON.stringify({ ...r, details: r.details, log: r.log }));
  const ok = r.api && /Condition green/i.test(r.green.badge) && r.green.shown && r.green.cards === 0 && r.green.active === 0 && r.green.auto === 0
    && r.traffic.log >= 4 && r.traffic.lines >= 1 && r.traffic.paOn
    && r.red.n === 2 && r.red.first === 'Red Alert' && r.red.second === 'Yellow Alert' && r.red.meaning.length > 30 && r.red.scope === 'Ship-wide' && /Ordered by/.test(r.red.who) && /^\d+:\d\d$/.test(r.red.el) && r.red.badge === 'none' && r.red.lights === 1 && /Red alert/i.test(r.red.pa) && r.red.stack >= 3 && r.red.paStyled
    && r.fireScope === 'Deck 3' && r.order.startsWith('Red Alert|Fire') && r.details.open && r.details.legend === 11 && r.details.hasDo && r.details.meanings === 3
    && r.log.open && r.log.rows >= 8 && r.log.pa >= 1 && r.log.plain >= 1 && r.stackCap <= 6
    && r.radio.open && r.radio.opts === 6 && r.dept >= 5 && r.hail.closed && r.hail.msgs.length >= 1 && r.hail.msgs[0].startsWith('Ensign')
    && r.cleared.badge && r.cleared.cards === 0 && r.cleared.lights === 0 && r.f4.d1 === 'yellow' && r.f4.d2 === 'red' && r.f4.after === 0;
  if (!ok) fail('comms hud');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const rm = await page.evaluate(() => { __game.alerts.raise('hull_breach', { deck: 4 }); return new Promise(res => setTimeout(() => res(getComputedStyle(document.querySelector('.ac-card')).animationName), 50)); });
  if (rm !== 'none') fail('comms hud: banner animation not disabled under prefers-reduced-motion (' + rm + ')');
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.evaluate(() => __game.alerts.clearAll());
}

if (process.argv[1] && process.argv[1].endsWith('test-comms.mjs')) {
  let failed = false; const o = await unitTests((m) => { failed = true; console.log('FAIL', m); });
  console.log('comms unit:', JSON.stringify({ billets: o.billets, watches: o.watches, mannedHour: o.mannedHour, emptyHour: o.emptyHour, perAlert: o.perAlert }));
  console.log(failed ? 'FAILED' : 'OK'); process.exit(failed ? 1 : 0);
}
