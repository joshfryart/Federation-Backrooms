// Node unit tests for the profile-driven NPC behaviour (js/profiles.js + CrewSim.setWorld): node tools/test-profiles.mjs (also imported by tools/test.mjs)
// activities / needs -> free-time picks, phase_behaviour -> digging in, alert_responses -> where crew go on each alert.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

export async function profileTests(fail) {
  const { SHIPS } = await imp('js/ships.js'), C = await imp('js/crew.js'), K = await imp('js/clock.js'), { CrewSim } = await imp('js/sim.js'), G = await imp('js/gen.js'), P = await imp('js/profiles.js'), { AlertState, ALERT_IDS } = await imp('js/alerts.js');
  const data = JSON.parse(readFileSync(join(ROOT, 'assets/data/comms.json'), 'utf8')), ck = (c, m) => { if (!c) fail('profiles: ' + m); return !!c; };
  const stats = {}, setH = (c, h) => { c.skipped = (((h - c.start) % 24) + 24) % 24; };

  // compiled data carries the three profile fields for every billet
  for (const [k, b] of Object.entries(data.billets)) {
    ck(b.act?.length >= 6, `${k}: >= 6 activities`); ck(b.act.every(a => a[9].length === 3 && a[1].length), `${k}: activity shape`);
    ck(P.PHASE_NAMES.every(n => b.pb?.[n]?.[0]), `${k}: phase mood for every phase`); ck(ALERT_IDS.every(i => b.al?.[i]?.r && b.al[i].p >= 1), `${k}: alert room + priority for every alert`);
  }

  // needs weigh the picks: a hungry person takes the meal far more often than a fed one, a tired one sleeps more
  const act = (id, w, needs, room = 'mess') => [id, [room], 'table', 'idle', 20, 20, w, 'solo', 'off_duty', needs];
  const prof = { act: [act('meal', 1, [0, -1, 0]), act('nap', 1, [-1, 0, 0], 'quarters'), act('cards', 1, [0, 0, -0.1], 'lounge')] };
  const count = (n) => { const c = { meal: 0, nap: 0, cards: 0 }; for (let i = 0; i < 600; i++) c[P.pickActivity(prof, { id: i }, { from: 8, h: 8, ctx: { prof, phase: 0 }, seed: 1, has: () => true }).id]++; return c; };
  const sc = (a, n) => P.scoreActivity(a, n), hungry = { fatigue: 0, hunger: 1, stress: 0 }, fed = { fatigue: 0, hunger: 0, stress: 0 }, tired = { fatigue: 1, hunger: 0, stress: 0 };
  ck(sc(prof.act[0], hungry) > 5 * sc(prof.act[0], fed), 'hunger lifts the meal weight'); ck(sc(prof.act[1], tired) > 5 * sc(prof.act[1], fed), 'fatigue lifts the nap weight');
  const c = count(); ck(c.meal > 0 && c.nap > 0 && c.cards > 0, 'every activity gets picked sometimes ' + JSON.stringify(c));
  // determinism and call-order independence: same inputs, same pick; a later call in the same slot repeats it
  const a1 = P.pickActivity(prof, { id: 7 }, { from: 8, h: 11.1, ctx: { prof, phase: 1 }, seed: 3 }), a2 = P.pickActivity(prof, { id: 7 }, { from: 8, h: 11.1, ctx: { prof, phase: 1 }, seed: 3 }), a3 = P.pickActivity(prof, { id: 7 }, { from: 8, h: 11.2, ctx: { prof, phase: 1 }, seed: 3 });
  ck(a1.id === a2.id && a1.room === a2.room, 'pick is deterministic'); ck(a1.id === a3.id, 'pick holds within a 20-minute slot');
  // rooms the ship lacks are never chosen; nothing fits -> null
  for (let i = 0; i < 100; i++) ck(P.pickActivity(prof, { id: i }, { from: 8, h: 9, ctx: { prof }, has: (r) => r !== 'mess' }).room !== 'mess', 'missing room is not picked');
  ck(P.pickActivity(prof, { id: 1 }, { from: 8, h: 9, ctx: { prof }, has: () => false }) === null, 'no room fits -> null');
  // moods push stress up; later phases are more stressed than nominal
  ck(P.moodStress('panicked') > P.moodStress('grim') && P.moodStress('grim') > P.moodStress('calm'), 'mood stress ordering');
  const pp = { id: 4 }, hb = data.billets.helm; ck(P.needsAt(pp, 10, { prof: hb, phase: 4, sev: 4 }, 1).stress > P.needsAt(pp, 10, { prof: hb, phase: 0, sev: 0 }, 1).stress, 'stress grows with phase and alert');
  ck(P.stayChance(hb, 0) === 0 && P.stayChance(hb, 3) > P.stayChance(hb, 1), 'stay chance grows with the phase');
  ck(P.stayChance({ pb: { crisis: ['grim', 1, 0] } }, 3) > P.stayChance({ pb: { crisis: ['grim', 0, 0] } }, 3), 'digging-in profiles stay more');

  // alert responses: severe vs mild split, priority order, deck scope
  const al = new AlertState(); al.raise('yellow'); al.raise('red'); al.raise('fire', { deck: 2 });
  const rp = { al: { yellow: { r: 'bridge', s: 'console', p: 2 }, red: { r: 'engineering', s: 'warpcore', p: 2, a: 'x', l: 'y' }, fire: { r: 'cargo', s: 'door', p: 1 } } };
  ck(P.alertResponse(rp, al.active(), { severe: true, deckNo: 3 })?.id === 'fire', 'lowest priority number wins (fire p1 over red p2)');
  ck(P.alertResponse(rp, al.active(), { severe: true, deckNo: 1 })?.id === 'red', 'a deck-scoped fire does not reach another deck');
  ck(P.alertResponse(rp, al.active(), { severe: false })?.id === 'yellow', 'mild alerts answered separately');
  ck(P.alertResponse(rp, [], {}) === null, 'no alerts -> no response');

  // sim: profiles on changes free time deterministically; off leaves the template untouched
  const ship = SHIPS[0], seed = 5, roster = C.makeComplement(ship, seed), plan = G.shipPlan(ship, seed), mk = (world) => { const clock = new K.ShipClock({ seed }); clock.assign(roster); const s = new CrewSim({ roster, clock, plan, data, seed, decks: ship.decks }); if (world) s.setWorld(world); return { s, clock }; };
  const alerts = new AlertState(), ctx = { phase: 0 }, world = () => ({ phase: ctx.phase, alerts: alerts.active() });
  const off = mk(null), on = mk(world), on2 = mk(world), tpl = (s, clock) => roster.people.map(p => s.block(p)?.activity);
  const snap = (x, hours) => { const out = []; for (const h of hours) { x.clock.hour = h; out.push(roster.people.map(p => x.s.block(p)?.activity).join()); } return out; };
  const hrs = [4, 5, 6, 8, 10, 14]; let diff = 0, same = 0;
  for (const h of hrs) { setH(off.clock, h); setH(on.clock, h); setH(on2.clock, h); for (const p of roster.people) { const a = off.s.block(p), b = on.s.block(p), c2 = on2.s.block(p); if (a?.activity !== b?.activity) diff++; else same++; ck(b?.activity === c2?.activity && b?.room === c2?.room, 'same seed, same blocks'); } }
  ck(diff > 20, `free time differs from the template once profiles are on (${diff} of ${diff + same})`); ck(same > 20, 'duty blocks are untouched');
  void tpl; void snap;
  // duty hours never change: a person in the first 8 hours keeps the template block
  setH(on.clock, 3); setH(off.clock, 3); let dutyOk = 0; for (const p of roster.people) { const h = on.clock.localHour(p); if (h < 8) { const a = on.s.block(p), b = off.s.block(p); ck(a?.room === b?.room && a?.activity === b?.activity, 'duty block unchanged by profiles'); dutyOk++; } } ck(dutyOk > 0, 'someone was on duty');
  // phase: later phases keep more people at the post during free time
  const away = (phase) => { ctx.phase = phase; let n = 0, t = 0; for (const h of [9, 11, 13, 15, 17, 19]) { setH(on.clock, h); on.s._pc.clear(); for (const p of roster.people) { const b = on.s.block(p), d = on.s._day(p); if (!d || !/^(?!.*(sleep|handover))/.test(d[4]) || on.clock.localHour(p) < 8) continue; t++; if (b?.work) n++; } } return n / Math.max(1, t); };
  const w0 = away(0), w1 = away(1), w3 = away(3); ck(w0 === 0 && w3 > w1 && w3 > 0.15, `more crew dig in as the phase worsens (${w0.toFixed(2)} ${w1.toFixed(2)} ${w3.toFixed(2)})`); stats.dig = +w3.toFixed(2); ctx.phase = 0; on.s._pc.clear();
  // mild alert (yellow): free-time crew go to their yellow response room; severe alert: alertResponse names the room for main.js to send them to
  alerts.raise('yellow'); on.s._pc.clear(); let toPost = 0, freeCt = 0;
  for (const p of roster.people) { const h = on.clock.localHour(p), b = on.s.block(p), r = data.billets[p.billet].al.yellow; if (h < 8) continue; const d = on.s._day(p); if (/sleep|handover|walk_to|pre_watch|pre_duty|prep_for|watch_brief|get_ready|wake/.test(d[4])) continue; freeCt++; if (b.alert === 'yellow' && b.room === r.r && b.spot === r.s) toPost++; else ck(!plan[r.r]?.length, `${p.billet}: free-time crew answer yellow`); }
  ck(toPost > 10, `yellow sends free-time crew to their posts (${toPost}/${freeCt})`); alerts.clear('yellow'); on.s._pc.clear();
  alerts.raise('red'); let sev = 0; for (const p of roster.people) { const r = on.s.alertResponse(p); if (r) { sev++; ck(r.id === 'red' && r.room === data.billets[p.billet].al.red.r, `${p.billet}: red response is the profile's red room`); } } ck(sev === roster.people.length, 'every crew member has a red response');
  alerts.raise('abandon_ship'); const abandon = roster.people.map(p => on.s.alertResponse(p)?.id); ck(abandon.some(x => x === 'abandon_ship'), 'abandon ship gets its own responses'); alerts.clearAll();
  stats.yellowToPost = toPost; stats.sev = sev;
  return stats;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) { const errs = []; const r = await profileTests(m => errs.push(m)); console.log(errs.length ? errs.join('\n') : 'profiles OK ' + JSON.stringify(r)); process.exit(errs.length ? 1 : 0); }
