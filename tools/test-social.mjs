// Node unit tests for the social tracker (js/social.js) and its sim/duty hooks: node tools/test-social.mjs (also imported by tools/test.mjs)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

export async function socialTests(fail) {
  const { SHIPS } = await imp('js/ships.js'), C = await imp('js/crew.js'), K = await imp('js/clock.js'), G = await imp('js/gen.js'), S = await imp('js/social.js'), { CrewSim } = await imp('js/sim.js'), { Duty } = await imp('js/duty.js');
  const data = JSON.parse(readFileSync(join(ROOT, 'assets/data/comms.json'), 'utf8')), duties = JSON.parse(readFileSync(join(ROOT, 'assets/data/duties.json'), 'utf8'));
  const ck = (c, m) => { if (!c) fail('social: ' + m); return !!c; };
  const make = (ship, seed, plan) => { const roster = C.makeComplement(ship, seed), clock = new K.ShipClock({ seed }); clock.assign(roster); return { roster, clock, plan, g: S.generateSocial(roster, { seed, plan, data, clock, ship }) }; };
  const STRONG = new Set(Object.keys(S.REL_TYPES).filter(k => S.REL_TYPES[k].strong));
  const keyOf = (roster) => { const k = {}; for (const [b, l] of Object.entries(roster.byBillet)) l.forEach((p, i) => { k[p.id] = b + i; }); return k; };
  const edges = (x) => { const k = keyOf(x.roster), s = new Set(); for (const l of x.g.out) for (const r of l.values()) if (STRONG.has(r.type) && r.a < r.b) s.add([k[r.a], k[r.b]].sort().join('~') + ':' + r.type); return s; };
  const stats = { ships: 0, graphs: 0, cargoSeeds: 0, cargoOut: 0, bridgeRatio: [], xrank: [0, 0], offOfficer: [0, 0], ms: [], dist: [], convene: [0, 0], coupleMeet: [0, 0], tri: 0, camps: 0, cool: [0, 0], brief: [0, 0], oneWay: 0, hooks: 0 };
  const WE = /^(are|were|get|share|trade|keep|work|hit|came|bonded|grew|sat|covered|argue|shared|both|served|confide|stand|meet|learned|split|called|ended)\b/, BAD = /undefined|NaN|\[object|null/;
  const HOOK_KINDS = new Set(['exes', 'triangle', 'crush', 'passed-over', 'camps', 'feud', 'lineage', 'secret', 'favour', 'beloved', 'distrusted', 'newcomer', 'old-shipmates']);
  for (const ship of SHIPS) {
    const plan = G.shipPlan(ship, 1); stats.ships++; const times = [];
    for (let seed = 1; seed <= 10; seed++) {
      const roster = C.makeComplement(ship, seed), clock = new K.ShipClock({ seed }); clock.assign(roster);
      const t0 = performance.now(), g = S.generateSocial(roster, { seed, plan, data, clock, ship }); times.push(performance.now() - t0); stats.graphs++;
      const P = roster.people, n = P.length, tag = `${ship.name} seed ${seed}`;
      // relation consistency, degree caps, orphans
      for (let a = 0; a < n; a++) {
        let strong = 0;
        for (const r of g.out[a].values()) {
          const T = S.REL_TYPES[r.type], q = g.relation(r.b, a); if (!ck(T && q, `${tag}: ${r.type} ${a}->${r.b} has no reverse`)) continue;
          if (T.sym) ck(q.type === r.type, `${tag}: symmetric ${r.type} ${a}->${r.b} but reverse is ${q.type}`); else ck(q.type === T.inverse, `${tag}: ${r.type} reverse should be ${T.inverse}, is ${q.type}`);
          ck(r.strength >= 0 && r.strength <= 1 && r.valence >= -1 && r.valence <= 1 && typeof r.reason === 'string' && r.reason.length > 3, `${tag}: bad relation fields ${JSON.stringify(r)}`);
          if (STRONG.has(r.type)) strong++;
        }
        const pr = g.profiles[a];
        ck(strong <= S.LIMITS.strongCap, `${tag}: ${P[a].short} has ${strong} strong ties (cap ${S.LIMITS.strongCap})`);
        ck(pr.loner || strong >= 1, `${tag}: ${P[a].short} (${P[a].billet}) is orphaned and not a loner`);
        ck(pr.extroversion > 0 && pr.extroversion < 1 && pr.seek.length <= 3, `${tag}: profile ranges`);
        if (!pr.loner && P[a].rank >= 1) { stats.xrank[1]++; if ([...g.out[a].values()].some(r => STRONG.has(r.type) && (P[r.b].rank === 0 || Math.abs(P[r.b].rank - P[a].rank) >= 2))) stats.xrank[0]++; }
        if (P[a].rank >= 2) for (const r of g.out[a].values()) if (STRONG.has(r.type)) { stats.offOfficer[1]++; if (P[r.b].rank >= 1) stats.offOfficer[0]++; }
      }
      ck(g.profiles.some(p => p.loner), `${tag}: no loners`);
      // spouses share quarters; groups are well formed and meet in rooms the ship has
      for (const p of P) for (const r of g.out[p.id].values()) if (r.type === 'spouse') ck(g.quartersOf(p) === g.quartersOf(r.b), `${tag}: spouses ${p.id}/${r.b} in different quarters`);
      for (const gr of g.groups) {
        ck(gr.members.length >= 2 && gr.members.every(m => m >= 0 && m < n), `${tag}: group ${gr.name} members`);
        if (gr.meet) ck(gr.meet.from >= 0 && gr.meet.from < 24 && gr.meet.to > gr.meet.from && plan[gr.meet.room]?.length && gr.site, `${tag}: group ${gr.name} meeting ${JSON.stringify(gr.meet)}`);
      }
      const kinds = new Set(g.groups.map(x => x.kind)); for (const k of ['bridge-circle', 'department-cell', 'route-crew', 'couple', 'hobby', 'mentor-pair']) ck(kinds.has(k), `${tag}: no ${k} group`);
      // bridge circle is denser than the ship at large
      const tie = (a, b) => { const r = g.relation(a, b); return r ? r.strength * Math.max(0, r.valence) : 0; };
      const br = P.filter(p => S.BRIDGE.has(p.billet)).map(p => p.id); let bs = 0, bc = 0, as = 0, ac = 0;
      for (const a of br) for (const b of br) if (a < b) { bs += tie(a, b); bc++; }
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) { as += tie(a, b); ac++; }
      stats.bridgeRatio.push((bs / bc) / (as / ac));
      // cargo handlers: off-work friends outside services
      const cargo = P.filter(p => p.billet === 'cargo'); stats.cargoSeeds++;
      if (cargo.some(c => [...g.out[c.id].values()].some(r => STRONG.has(r.type) && P[r.b].dept !== 'services'))) stats.cargoOut++;
      for (const c of cargo) ck([...g.out[c.id].values()].filter(r => STRONG.has(r.type) && P[r.b].dept !== 'services' && r.type === 'friend').length <= S.LIMITS.offworkMax + 1, `${tag}: cargo handler with too many outside friends`);
      // --- shapes: reasons read after "we ...", one-way attitudes, no romance up or down a reporting line, mentors within reach
      const above = (a, b) => { for (let x = P[a].reportsTo, k = 0; x != null && k < 8; x = P[x]?.reportsTo, k++) if (x === b) return true; return false; };
      for (let a = 0; a < n; a++) for (const r of g.out[a].values()) {
        if (['friend', 'close-friend', 'old-shipmate'].includes(r.type)) ck(WE.test(r.reason), `${tag}: ${r.type} reason does not read after "we": ${r.reason}`);
        if (r.attitude) { ck(S.ATTITUDES[r.attitude], `${tag}: unknown attitude ${r.attitude}`); if (!S.ATTITUDES[r.attitude].inverse && g.relation(r.b, a).attitude !== r.attitude) stats.oneWay++; }
        if (r.type === 'spouse' || r.type === 'romance') ck(!above(a, r.b) && !above(r.b, a) && P[a].billet !== 'co', `${tag}: couple ${P[a].billet}/${P[r.b].billet} inside a reporting line`);
        if (r.type === 'mentor') ck(P[r.b].rank > P[a].rank && P[r.b].rank - P[a].rank <= S.LIMITS.mentorGap && P[r.b].dept === P[a].dept, `${tag}: mentor ${P[r.b].billet} -> ${P[a].billet} out of reach`);
        if (r.attitude === 'sweet-on') ck(g.profiles[a].partner !== r.b && !above(a, r.b) && !above(r.b, a), `${tag}: crush on a partner or inside a reporting line`);
        if (r.attitude === 'resents') ck(P[r.b].dept === P[a].dept && P[r.b].rank === P[a].rank + 1, `${tag}: passed-over tie between the wrong people`);
        if (r.history) ck(r.history === 'ex' && g.relation(r.b, a).history === 'ex' && g.profiles[a].partner !== r.b, `${tag}: ex history not mutual`);
      }
      // --- gatherings actually convene: at some half hour of the window two members choose this group
      const peak = new Map(); for (let s = 0; s < 48; s++) { const c = new Map(); for (const p of P) { const m = g.meetingFor(p, s / 2 + 0.25, false); if (m) c.set(m.group, (c.get(m.group) || 0) + 1); } for (const [k, v] of c) peak.set(k, Math.max(peak.get(k) || 0, v)); }
      for (const gr of g.groups) if (gr.meet) { const ok = (peak.get(gr.id) || 0) >= 2; stats.convene[1]++; if (ok) stats.convene[0]++; if (gr.kind === 'couple') { stats.coupleMeet[1]++; if (ok) stats.coupleMeet[0]++; } }
      // --- story hooks: well formed, in range, about real people; a triangle is an admirer, a partnered target and the partner
      const hk = {}; for (const h of g.hooks) {
        hk[h.kind] = (hk[h.kind] || 0) + 1; stats.hooks++;
        ck(HOOK_KINDS.has(h.kind) && typeof h.text === 'string' && h.text.length > 12 && !BAD.test(h.text) && h.people.length && h.people.every(m => m >= 0 && m < n) && typeof h.secret === 'boolean', `${tag}: bad hook ${JSON.stringify(h)}`);
        if (h.kind === 'triangle') { const [a, b, c] = h.people; ck(g.relation(a, b)?.attitude === 'sweet-on' && g.profiles[b].partner === c && a !== c, `${tag}: triangle hook is not a triangle`); }
        if (h.kind === 'camps') { const [a, b] = h.people, fa = g.groups.find(x => x.kind === 'faction' && x.leader === a && x.activity === 'taking_sides'), fb = g.groups.find(x => x.kind === 'faction' && x.leader === b && x.activity === 'taking_sides'); ck(g.relation(a, b)?.type === 'feud' && fa && fb && !fa.members.some(m => fb.members.includes(m)), `${tag}: camps overlap or lack a feud`); }
      }
      for (const k of ['exes', 'feud', 'favour', 'beloved', 'distrusted', 'newcomer']) ck(hk[k] >= 1, `${tag}: no ${k} hook`);
      ck((hk.triangle || 0) <= 3 && (hk.exes || 0) <= S.LIMITS.exes[1] && (hk['passed-over'] || 0) <= S.LIMITS.passedOver[1] && (hk.feud || 0) <= 2 && (hk.lineage || 0) <= 2, `${tag}: too much drama ${JSON.stringify(hk)}`);
      if (hk.triangle) stats.tri++; if (hk.camps) stats.camps++;
      // --- any crew member can be dealt as the player: lines about them never break, rumours never name the teller or the asker
      for (const p of P) {
        const brief = g.playerBrief(p); stats.brief[1]++; if (brief.length) stats.brief[0]++; ck(brief.length <= 7 && brief.every(x => x.text && !BAD.test(x.text) && x.id !== p.id && g.relation(p, x.id)), `${tag}: playerBrief ${p.billet}`);
        stats.cool[1]++; if (P.some(q => q !== p && g.trustBias(p, q) < -0.02)) stats.cool[0]++;
        for (const h of g.rumours(p, { n: 3, asker: P[(p.id + 1) % n] })) ck(!h.people.includes(p.id) && !h.people.slice(0, 3).includes((p.id + 1) % n) && (!h.secret || g.profiles[p.id].gossip || h.people.some(x => STRONG.has(g.relation(p, x)?.type))), `${tag}: rumour ${h.kind} told by the wrong person`);
      }
      const you = P[seed % n]; for (const q of P) { const y = g.aboutYou(q, you), r = g.relation(q, you); ck(y === null || (typeof y === 'string' && y.length > 8 && !BAD.test(y)), `${tag}: aboutYou`); if (r && STRONG.has(r.type)) ck(y, `${tag}: no aboutYou line for a ${r.type}`); ck(!BAD.test(g.talkLine(q, you)), `${tag}: talkLine to the player`); if (r) ck(!BAD.test(g.storyOf(q, you)), `${tag}: storyOf`); }
      // UI text
      const d = g.describe(P[3]); ck(Array.isArray(d) && d.length >= 1 && d.every(l => typeof l === 'string'), `${tag}: describe`); ck(typeof g.talkLine(P[5], P[0]) === 'string' && g.talkLine(P[5], P[0]).length > 5, `${tag}: talkLine`);
    }
    times.sort((a, b) => a - b); stats.ms.push(+times[5].toFixed(1)); ck(times[5] < 150, `${ship.name}: median generateSocial ${times[5].toFixed(0)} ms (budget 150)`);
  }
  ck(stats.bridgeRatio.every(r => r > 2), `bridge circle density not above 2x baseline: min ${Math.min(...stats.bridgeRatio).toFixed(2)}`);
  ck(stats.cargoOut >= stats.cargoSeeds * 0.8, `cargo handlers lack outside friends in too many runs (${stats.cargoOut}/${stats.cargoSeeds})`);
  ck(stats.xrank[0] >= stats.xrank[1] * 0.7, `too few officers keep a cross-rank friend (${stats.xrank[0]}/${stats.xrank[1]})`);
  ck(stats.convene[0] >= stats.convene[1] * 0.9, `too many gatherings never convene (${stats.convene[0]}/${stats.convene[1]})`);
  ck(stats.coupleMeet[0] >= stats.coupleMeet[1] * 0.85, `couples miss their own time together (${stats.coupleMeet[0]}/${stats.coupleMeet[1]})`);
  ck(stats.tri >= stats.graphs * 0.5 && stats.camps >= stats.graphs * 0.7, `too few triangles / camps (${stats.tri}, ${stats.camps} of ${stats.graphs})`);
  ck(stats.brief[0] >= stats.brief[1] * 0.95, `too many billets with nobody they already know (${stats.brief[0]}/${stats.brief[1]})`);
  ck(stats.cool[0] >= stats.cool[1] * 0.12 && stats.cool[0] <= stats.cool[1] * 0.4, `share of billets somebody starts cool towards out of range (${stats.cool[0]}/${stats.cool[1]})`);
  ck(stats.oneWay >= stats.graphs * 15, `too few one-way attitudes (${stats.oneWay})`);
  ck(stats.offOfficer[0] / stats.offOfficer[1] > 0.6, `officers do not mostly mix with officers (${stats.offOfficer[0]}/${stats.offOfficer[1]})`);

  // determinism, seed variety, JSON round trip, dynamics
  const ship = SHIPS[0], plan = G.shipPlan(ship, 3);
  const a1 = make(ship, 7, plan), a2 = make(ship, 7, plan), b = make(ship, 8, plan);
  ck(JSON.stringify(a1.g.toJSON()) === JSON.stringify(a2.g.toJSON()), 'same seed gives a different graph');
  const e1 = edges(a1), e2 = edges(b); let inter = 0; for (const e of e1) if (e2.has(e)) inter++; const jd = 1 - inter / (e1.size + e2.size - inter); stats.dist.push(+jd.toFixed(2));
  ck(jd > 0.5, `seeds 7 and 8 share too many strong ties (Jaccard distance ${jd.toFixed(2)})`);
  const rt = S.SocialGraph.fromJSON(JSON.parse(JSON.stringify(a1.g))); ck(JSON.stringify(rt.toJSON()) === JSON.stringify(a1.g.toJSON()), 'toJSON/fromJSON round trip differs');
  ck(rt.describe(4).join('|') === a1.g.describe(4).join('|'), 'describe differs after fromJSON');
  ck(rt.hooks.length === a1.g.hooks.length && rt.hooks.length >= 6 && JSON.stringify(rt.playerBrief(9)) === JSON.stringify(a1.g.playerBrief(9)) && JSON.stringify(rt.rumours(9)) === JSON.stringify(a1.g.rumours(9)), 'hooks / playerBrief / rumours differ after fromJSON');
  ck(JSON.stringify(a1.g.hooks) !== JSON.stringify(b.g.hooks), 'seeds 7 and 8 deal the same story hooks');
  { const pl = a1.roster.people.find(p => a1.g.ties(p).some(r => r.type === 'rival' || r.type === 'feud')), foe = pl && a1.g.ties(pl).find(r => r.type === 'rival' || r.type === 'feud'); if (ck(foe, 'a rival to talk to')) ck(a1.g.talkLine(foe.b, pl).includes(a1.g.aboutYou(foe.b, pl)), 'talkLine does not close on the history with the asker'); }
  const P0 = a1.roster.people, x = P0.find(p => !a1.g.relation(p.id, 0) && p.id !== 0 && a1.g.profiles[p.id].strong < 7);
  if (ck(x, 'someone without a tie to the captain')) { for (let i = 0; i < 8; i++) { a1.g.onTrustEvent(x, P0[0], 0.06, 'test'); a1.g.tick(1); } ck(['friend', 'acquaintance'].includes(a1.g.relation(x, 0)?.type) && a1.g.relation(0, x), 'trust events did not create a tie'); ck(a1.g.events().length >= 1, 'no social events logged'); }

  // sim: off duty, friends end up in the same room more often with the graph; deterministic; nobody lost
  const run = (social) => {
    const { roster, clock, g } = make(ship, 11, plan), sim = new CrewSim({ roster, clock, plan, data, seed: 11, decks: ship.decks }); if (social) sim.setSocial(g);
    let together = 0, samples = 0;
    for (let t = 0; t < 1500; t += 0.5) {
      sim.tick(0.5); clock.advance(0.5);
      if (t % 30 === 0) for (const p of roster.people) { const w = sim.where(p); if (!w || w.transit) continue; for (const f of g.friendsOf(p)) { if (f.id < p.id) continue; const v = sim.where(roster.people[f.id]); if (!v || v.transit) continue; if (!g.isFree(p, clock.hour) || !g.isFree(f.id, clock.hour)) continue; samples++; if (v.deckNo === w.deckNo && v.room === w.room) together++; } }
    }
    let on = 0; for (let d = 1; d <= ship.decks; d++) on += sim.onDeck(d).length; ck(on + sim.inTransit().length === sim.st.size, 'sim headcount with social');
    return { rate: together / Math.max(1, samples), log: sim.log.join(','), census: JSON.stringify(sim.census()) };
  };
  const w1 = run(true), w2 = run(true), wo = run(false); stats.together = [+wo.rate.toFixed(3), +w1.rate.toFixed(3)];
  ck(w1.log === w2.log, 'sim with social is not deterministic'); ck(w1.rate > wo.rate * 1.2, `friends do not cluster more with the graph (${wo.rate.toFixed(3)} -> ${w1.rate.toFixed(3)})`);

  // duty: the player's friends start warmer than rivals and strangers
  {
    const { roster, clock, g } = make(ship, 12, plan), sim = new CrewSim({ roster, clock, plan, data, seed: 12, decks: ship.decks }); sim.setSocial(g);
    const player = roster.people.find(p => g.friendsOf(p).length >= 2 && g.ties(p).some(r => g.relation(r.b, p).valence < 0)) || roster.people[1];
    const D = new Duty({ player, roster, clock, sim, duties, seed: 12 }), plain = new Duty({ player, roster, clock, duties, seed: 12 });
    const fr = g.friendsOf(player).map(f => roster.people[f.id]), foes = g.ties(player).filter(r => g.relation(r.b, player).valence < 0).map(r => roster.people[r.b]);   // trust is their view of you
    ck(fr.every(f => D.trust(f) > plain.trust(f)), 'friends of the player do not start warmer');
    ck(foes.length && foes.every(f => D.trust(f) < plain.trust(f)), 'rivals of the player do not start cooler');
  }
  // socialui: briefing lines + rumours (gated by trust, never repeated, never about the speaker)
  {
    const U = await imp('js/socialui.js'), { roster, g } = make(ship, 12, plan), me = roster.people[2];
    const L = U.briefLines(g, me); ck(L.length > 0 && L.length <= 5 && L.every(l => l.text && !BAD.test(l.text)), 'briefLines empty or malformed'); ck(U.briefLines(null, me).length === 0, 'briefLines without graph');
    const gos = roster.people.find(p => p !== me && g.profiles[p.id].gossip) || roster.people[5];
    ck(U.rumourFor(g, gos, me, 0.05).none, 'rumour given to someone with no trust');
    const seen = new Set(); let r, n = 0;
    while ((r = U.rumourFor(g, gos, me, 0.95)).hook && n++ < 60) { ck(!seen.has(r.hook), 'rumour repeated'); seen.add(r.hook); ck(!r.hook.people.includes(gos.id) && !r.hook.people.slice(0, 3).includes(me.id), 'rumour about speaker or asker'); }
    ck(seen.size > 0 && r.none, 'rumours never ran out / none given to a gossip with high trust');
    const g2 = make(ship, 12, plan).g, lo = U.rumourFor(g2, gos, me, 0.5); ck(!lo.hook || !lo.hook.secret, 'secret told at middling trust');
  }
  return { graphs: stats.graphs, medianMs: stats.ms, bridgeVsBaseline: +Math.min(...stats.bridgeRatio).toFixed(1), cargoOut: `${stats.cargoOut}/${stats.cargoSeeds}`, crossRank: `${stats.xrank[0]}/${stats.xrank[1]}`, seedDistance: stats.dist, friendsTogether: stats.together, convene: `${stats.convene[0]}/${stats.convene[1]}`, coupleMeet: `${stats.coupleMeet[0]}/${stats.coupleMeet[1]}`, triangleRuns: stats.tri, campRuns: stats.camps, hooksPerRun: +(stats.hooks / stats.graphs).toFixed(1), billetsWithBrief: `${stats.brief[0]}/${stats.brief[1]}`, billetsSomeoneCool: `${stats.cool[0]}/${stats.cool[1]}`, oneWayPerRun: +(stats.oneWay / stats.graphs).toFixed(1) };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) { const errs = []; const r = await socialTests(m => errs.push(m)); console.log(errs.length ? errs.slice(0, 40).join('\n') + (errs.length > 40 ? `\n... ${errs.length} failures` : '') : 'social OK ' + JSON.stringify(r)); process.exit(errs.length ? 1 : 0); }
