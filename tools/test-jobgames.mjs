// Job mini-games + first-use tool instructions (js/jobgames.js logic in node; js/jobgame-ui.js + js/main.js startJob in the browser).
//   node tools/test-jobgames.mjs            the node half
//   node tools/test.mjs --only jobgames     the browser half (nominal page, test clock)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

// play a game to the end: 'win' plays it right (game.hint()), 'strike' makes wrong moves (game.bad(); nothing when no wrong move exists, so the
// timer runs out), 'idle' does nothing (the timer runs out)
export function autoPlay(g, how = 'win', dt = 1 / 30, maxT = 60) {
  for (let t = 0; g.state === 'play' && t < maxT; t += dt) {
    if (how === 'win') { for (const [code, down] of g.hint()) g.key(code, down); }
    else if (how === 'strike') { const b = g.bad(); if (b) g.key(b, true); }
    g.tick(dt);
  }
  return g.result();
}
// which department each room belongs to (each department must have a game of its own: KINDS[kind].dept)
export const DEPT_ROOMS = { medical: ['sickbay'], engineering: ['engineering', 'plant', 'workshop'], science: ['lab'], security: ['brig', 'armory'], galley: ['mess', 'arboretum'], cargo: ['cargo', 'stores'], bridge: ['bridge', 'readyroom'] };
export const MAX_SHARE = 0.25;
// one label per themed kind (OVERRIDES: the same game whatever the room): the browser block plays each through startJob
export const KIND_LABELS = { vitals: 'Meet returning shuttle with medical team', hypo: 'Dispense meds and update patient list', tray: 'Sterilise instruments and surgical bay', meds: 'Pharmacy and controlled meds count', counsel: 'Scheduled counselling sessions',
  power: 'Balance grid load against reactor output', bench: 'Coil wear check and swap', tune: 'Scan subspace bands for signals', classify: 'Mark hazards along the route', badge: 'Issue and returns desk', doorlog: 'Lock cargo bay after loading',
  cook: 'Captain\'s refreshment and comfort', nutrient: 'Hydroponics O2 balance', fresh: 'Rotate expiring stock to the galley', manifest: 'Count and verify cargo against manifest', loadbal: 'Move cargo sleds',
  course: 'Clear the approach with nav', decode: 'Monitor hails and ship traffic',
  // second pass (job audit): helm, transporter targeting, paperwork
  station: 'Hold station for deep scan', burn: 'Smooth deceleration, minimal jolt', fix: 'Position fix against star references', coords: 'Beam patients direct to sickbay', form: 'Write up fix accuracy results', roster: 'Rebalance rosters',
  queue: 'Review work orders and assign crew', verify: 'Back up chart database', pa: 'Announce quiet watch and set green alert', schedule: 'Update flight schedule and sign-offs', trend: 'O2 reclamation check', sign: 'Sign the log and review reports',
  // third pass: spoken brief, decision, flying, guard post, instrument run, triage, standby
  brief: 'Report arrival', decide: 'Decide whether to extend the survey', fly: 'Hard turn and stop test', post: 'Hold post at brig door', assay: 'Analyse sensor-collected samples', triage: 'Triage incoming patients', standby: 'Stand by for emergency beam-out' };
// billet -> department (js/crew.js BILLETS): the variety checks are per department, as the job audit (docs/job-audit.md) is
export const BILLET_DEPT = { co: 'command', xo: 'command', so: 'command', yeoman: 'command', cfo: 'flight', helm: 'flight', nav: 'flight', pilot: 'flight', deck: 'flight', ops: 'operations', comms: 'operations', tchief: 'operations', ttech: 'operations', comp: 'operations',
  ce: 'engineering', ace: 'engineering', reactor: 'engineering', env: 'engineering', eps: 'engineering', dc: 'engineering', cos: 'security', dep: 'security', armory: 'security', sec: 'security', guard: 'security',
  cso: 'sciences', sensor: 'sciences', carto: 'sciences', bot: 'sciences', lab: 'sciences', cmo: 'medical', counsel: 'medical', doc: 'medical', nurse: 'medical', medtech: 'medical', qm: 'services', galley: 'services', cook: 'services', cargo: 'services', rep: 'services', holo: 'services' };
export const DEPT_MAX_SHARE = 0.25, BILLET_MAX_VARIANT = 0.4;

// per-kind counts over every duty loop + mission task (also printed by tools/test.mjs): { total, kinds, share, missing, byRoom }
export function coverageReport(J, duties) {
  const c = J.coverage(duties), rows = Object.entries(c.kinds).sort((a, b) => b[1] - a[1]);
  return { ...c, table: rows.map(([k, n]) => `${k.padEnd(10)} ${String(n).padStart(4)}  ${(100 * n / c.total).toFixed(1).padStart(5)} %`).join('\n') };
}

export async function jobgameTests(fail) {
  const J = await imp('js/jobgames.js'), ck = (c, m) => { if (!c) fail('jobgames: ' + m); return !!c; };
  const duties = JSON.parse(readFileSync(join(ROOT, 'assets/data/duties.json'), 'utf8'));
  const out = { wins: 0, fails: 0, kinds: {} };
  // coverage: every loop and every mission task resolves to a game; no kind over MAX_SHARE; every department has a game of its own
  const cov = coverageReport(J, duties); out.coverage = { total: cov.total, share: +cov.share.toFixed(3), kinds: cov.kinds };
  console.log(`job mini-game coverage (${cov.total} duty loops + mission tasks, max share ${(cov.share * 100).toFixed(1)} %, limit ${MAX_SHARE * 100} %):\n${cov.table}`);
  ck(cov.total > 600 && !cov.missing.length, `every duty loop and mission task has a game (${cov.total}); missing: ${cov.missing.slice(0, 8).join(' | ')}`);
  ck(cov.share <= MAX_SHARE, `no kind over ${MAX_SHARE * 100} % of all jobs: ${cov.table}`);
  let tasks = 0; for (const b of Object.values(duties.billets)) for (const ts of Object.values(b.tasks)) for (const t of ts) { tasks++; const g = J.gameFor({ ...t, label: t.task }); ck(g && J.KINDS[g.kind], 'mission task has a game: ' + t.task); }
  ck(tasks > 400, 'mission tasks counted: ' + tasks);
  for (const [dept, rooms] of Object.entries(DEPT_ROOMS)) { const own = new Set(); for (const r of rooms) for (const k of cov.byRoom[r] || []) if (J.KINDS[k].dept === dept) own.add(k); ck(own.size >= 1, `${dept} has a game of its own: ${[...own]}`); }
  for (const [kind, label] of Object.entries(KIND_LABELS)) ck(J.gameFor({ label, spot: 'console', room: 'bridge' })?.kind === kind, `label "${label}" plays ${kind}`);
  ck(J.gameFor({ label: 'Ward rounds', spot: 'biobed', room: 'sickbay', sys: 'sickbay' }).kind === 'vitals' && J.gameFor({ label: 'Work the ops board', spot: 'console', room: 'bridge' }).kind === 'sequence', 'a ward round reads monitors; an ops board is still a console');
  ck(J.gameFor({ label: 'Anything', spot: 'any' }) === null, 'a place, not a station: no game');
  for (const t of Object.values(J.TOOLS)) ck(J.KINDS[t.kind] && t.name && t.how && t.keys.length, 'tool has kind / name / how / keys: ' + t.id);
  for (const kind of Object.keys(J.KINDS)) {
    const themes = [...new Set([...Object.values(J.TOOLS).filter(t => t.kind === kind).map(t => t.theme || null), ...(J.THEMES[kind]?.list || [])])];
    for (let seed = 1; seed <= 25; seed++) {
      const theme = themes[seed % themes.length] || null;
      for (const calm of [false, true]) {
        const g = J.createGame(kind, seed, { calm, theme }), r = autoPlay(g, 'win'); ck(r.state === 'win', `${kind} seed ${seed}${calm ? ' calm' : ''} winnable by playing it right: ${JSON.stringify(r)} ${JSON.stringify(g.view())}`);
        ck(r.t <= g.limit * 0.85, `${kind} seed ${seed} played right ends well inside the time limit (${r.t} / ${g.limit})`);
        if (r.state === 'win') out.wins++; const o = J.outcome(g); ck(o.quality === 'proper' && o.timeMul < 1, `${kind} win -> proper, faster`);
        out.kinds[kind] = Math.max(out.kinds[kind] || 0, +r.t.toFixed(1));
      }
      const f = J.createGame(kind, seed, { theme }); const r2 = autoPlay(f, 'strike'); ck(r2.state === 'fail', `${kind} seed ${seed} fails on bad play: ${JSON.stringify(r2)}`);
      if (r2.state === 'fail') out.fails++; ck(J.outcome(f).quality === 'rushed' && J.outcome(f).timeMul === 1, `${kind} fail -> rushed (the job still gets done)`);
      const idle = J.createGame(kind, seed, { theme }); autoPlay(idle, 'idle', 0.25, 200); ck(idle.state === 'fail' && (idle.why === 'time' || ['cook', 'post', 'standby'].includes(kind)) && idle.t <= idle.limit + 0.3, `${kind} always ends by itself (timer): ${idle.state} ${idle.why} ${idle.t}`);
      ck(idle.limit >= 14 && idle.limit <= 24, `${kind} limit within the 10-20 s design (+ reading time): ${idle.limit}`);
    }
    // a wrong key strikes (when one exists); keys outside the game are ignored
    { const g = J.createGame(kind, 5); const b = g.bad(); if (b) { g.key(b, true); for (let i = 0; i < 600 && J.KINDS[kind].hold && !g.strikes; i++) g.tick(1 / 30); ck(g.strikes === 1 || !g.maxStrikes, `${kind} a wrong move is a strike`); } ck(!g.key('KeyJ') && !g.key('Escape') && !g.key('KeyQ'), `${kind} ignores the menu keys`); }
    // deterministic per seed, different across seeds; calm gives more time; cancel is not an outcome
    const a = J.createGame(kind, 9), b = J.createGame(kind, 9); ck(JSON.stringify(a.view()) === JSON.stringify(b.view()), kind + ' same seed, same puzzle');
    if (!['calibrate', 'dial', 'station', 'burn'].includes(kind)) { const views = new Set(Array.from({ length: 6 }, (_, i) => JSON.stringify(J.createGame(kind, 100 + i).view()))); ck(views.size >= 4, kind + ' different seeds, different content: ' + views.size); }
    ck(J.createGame(kind, 3, { calm: true }).limit === J.createGame(kind, 3).limit * 1.5, kind + ' calm: +50 % time');
    const c = J.createGame(kind, 4); c.cancel(); ck(c.state === 'cancel' && J.outcome(c) === null, kind + ' cancel has no outcome'); c.tick(100); ck(c.state === 'cancel', kind + ' a cancelled game stays cancelled'); ck(!c.key(c.bad() || 'Digit1', true) || c.strikes === 0, kind + ' a cancelled game takes no strikes');
    ck(J.rushNote({ kind }, 3).length > 5, kind + ' has a rushed line');
  }
  // a clean win is faster than a win with a fault
  { const g = J.createGame('sequence', 2); g.key('Digit' + (g.solve() % 4 + 1)); autoPlay(g, 'win'); const o = J.outcome(g); ck(g.state === 'win' && !o.perfect && o.timeMul === 0.6, 'win with a strike: 0.6 time'); }
  { const g = J.createGame('sequence', 2); ck(!g.key('KeyJ') && !g.key('Escape') && g.strikes === 0, 'keys outside the game are ignored (no strike)'); }
  // content sanity: vitals has exactly one bed out of range; meds answer is the real count; badge deny reasons are real
  { const VR = { HR: [60, 100], SpO2: [95, 100], Temp: [36.1, 37.5], BP: [100, 140] }; for (let s = 1; s < 40; s++) { const g = J.createGame('vitals', s); const outBeds = g.cur.beds.map((b, i) => Object.entries(b.v).some(([k, v]) => v < VR[k][0] || v > VR[k][1]) ? i : -1).filter(i => i >= 0); ck(outBeds.length === 1 && outBeds[0] === g.cur.answer, `vitals seed ${s}: exactly the answer bed is out of range ${outBeds}`); } }
  for (let s = 1; s < 40; s++) { const g = J.createGame('meds', s); ck(g.cur.vials.filter(v => v.drug === 0).length === g.cur.answer + 1 && g.cur.count <= 9, 'meds: the answer is the count in the drawer'); }
  for (let s = 1; s < 40; s++) { const g = J.createGame('badge', s), r = g.cur, R = g.rule, ok = R.depts.includes(r.dept) && r.clear >= R.min && !r.expired; ck((r.answer === 0) === ok, `badge seed ${s}: admit iff the rule allows`); }
  for (let s = 1; s < 40; s++) { const g = J.createGame('doorlog', s), r = g.cur, bad = r.lines.map((L, i) => L.door === r.restricted && !r.ok.includes(L.who) ? i : -1).filter(i => i >= 0); ck(bad.length === 1 && bad[0] === r.answer, `doorlog seed ${s}: exactly one unauthorised entry`); }
  for (let s = 1; s < 40; s++) { const g = J.createGame('fresh', s), r = g.cur, bad = r.items.map((it, i) => it.day < r.today ? i : -1).filter(i => i >= 0); ck(bad.length === 1 && bad[0] === r.answer, `fresh seed ${s}: exactly one expired item`); }
  // second-pass kinds: the content has exactly the answer the rule says
  for (let s = 1; s < 40; s++) {
    const th = ['eng', 'med', 'flight', 'sec', 'sci', 'ops', 'stores', 'cmd'][s % 8];
    { const g = J.createGame('roster', s, { theme: th }); for (const [i, p] of g.posts.entries()) { const ok = g.people.map((q, k) => q.note === 'free' && q.quals.includes(p.q) ? k : -1).filter(k => k >= 0); ck(ok.length === 1 && (i > 0 || ok[0] === g.cur.answer), `roster seed ${s}: exactly one free, qualified person per post`); } }
    { const g = J.createGame('queue', s, { theme: th }), it = g.items, o = g.order; ck(o.every((k, j) => !j || it[o[j - 1]].sev < it[k].sev || (it[o[j - 1]].sev === it[k].sev && it[o[j - 1]].age > it[k].age)), `queue seed ${s}: the order is severity, then oldest first, no ties`); }
    { const g = J.createGame('trend', s, { theme: th }), r = g.cur, first = r.pts.findIndex(v => v < 0.3 || v > 0.7); ck(first >= 0 && Math.floor(first / 4) === r.answer, `trend seed ${s}: the answer is the segment where it first leaves the band`); }
    { const g = J.createGame('verify', s, { theme: th }), bad = g.blocks.filter(b => b.src !== b.cp).length; ck(bad >= 1 && g.blocks.every(b => (b.src !== b.cp) === b.bad), `verify seed ${s}: the flagged blocks are exactly the differing ones`); }
    { const g = J.createGame('sign', s, { theme: th }); g.entries.forEach((e, i) => { const prev = i ? g.entries[i - 1].hm : -1, bad = !e.who || ((+e.v > e.hi || +e.v < e.lo) && !e.note) || e.hm <= prev; ck(bad === !!e.why, `sign seed ${s} entry ${i}: query iff incomplete`); }); }
    { const g = J.createGame('form', s, { theme: th, label: 'Report to the captain' }); ck(g.fields.every(f => f.opts.includes(f.want) && new Set(f.opts).size === f.opts.length) && g.fields[2].want === 'Captain', `form seed ${s}: every field offers its answer once; the addressee comes from the label`); }
    { const g = J.createGame('fix', s), r = g.cur, P = r.cands[r.answer]; ck(r.stars.every(st => Math.abs(Math.sin(Math.atan2(st.y - P[1], st.x - P[0]) - st.a)) < 1e-6), `fix seed ${s}: every bearing line passes through the answer`); }
  }
  // third-pass kinds: the content has exactly the answer the rule says
  for (let s = 1; s < 40; s++) {
    const th = ['eng', 'med', 'flight', 'sec', 'sci', 'ops', 'stores', 'cmd'][s % 8];
    { const g = J.createGame('brief', s, { theme: th, label: 'Report to the captain' }), it = g.items, o = g.order, rank = (x) => (x.v < x.lo || x.v > x.hi) ? 0 : x.prev != null ? 1 : 2;
      ck(g.recips.filter(r => r === 'Captain').length === 1 && o.every((k, j) => !j || rank(it[o[j - 1]]) < rank(it[k]) || (rank(it[o[j - 1]]) === rank(it[k]) && o[j - 1] < k)) && it.filter(x => rank(x) === 0).length === 1 && it.filter(x => rank(x) === 1).length === 1, `brief seed ${s}: one recipient named in the label, order = out, changed, steady top to bottom`);
      const diff = g.rb.map((r, j) => r.v !== (it[o[j]].step < 1 ? it[o[j]].v.toFixed(1) : String(Math.round(it[o[j]].v))) ? j : -1).filter(j => j >= 0); ck(diff.length === 1 && diff[0] === g.wrong, `brief seed ${s}: exactly one read-back figure is wrong`); }
    { const g = J.createGame('decide', s, { theme: ['cmd', 'survey', 'ready', 'approach', 'holo'][s % 5] }); for (let k = 0; k < 3 && g.state === 'play'; k++) { const r = g.cur, fits = (v, A, L) => A[2] === 'max' ? v <= L : v >= L, ok = r.opts.map((x, i) => fits(x.a, r.A, r.lim[0]) && fits(x.b, r.B, r.lim[1]) ? i : -1).filter(i => i >= 0), best = ok.sort((a, b) => r.opts[b].v - r.opts[a].v);
      ck(best[0] === r.answer && (best.length < 2 || r.opts[best[1]].v < r.opts[best[0]].v), `decide seed ${s}: the answer is the single best option inside both limits`); g.key('Digit' + (r.answer + 1)); } }
    { const g = J.createGame('post', s, { theme: J.THEMES.post.list[s % 8] }), R = g.rule; for (const p of g.queue) { const badge = R.depts.includes(p.dept) && p.clear >= R.min && p.exp >= R.today, want = p.tail || !badge ? 1 : p.orders && !(p.orders.signed && p.orders.date === R.today) ? 2 : 0; ck(p.answer === want, `post seed ${s}: admit / refuse / hold follows the rule (${JSON.stringify(p)})`); } }
    { const g = J.createGame('triage', s); ck(g.pts.every(p => g.truth(p) === (p.walks ? 3 : (p.rr > 30 || !p.pulse || p.cap > 2 || !p.obeys) ? 1 : 2)) && new Set(g.pts.map(p => g.truth(p))).size === 3, `triage seed ${s}: every tag follows the START rule, all three colours present`); }
    { const g = J.createGame('assay', s, { theme: J.THEMES.assay.list[s % 10] }), curve = (r) => Array.from({ length: 60 }, (_, k) => r.peaks.reduce((m, p) => m + p.h * Math.exp(-((k / 59 - p.x) ** 2) / (2 * p.w * p.w)), 0)), err = g.refs.map(r => curve(r).reduce((m, v, k) => m + Math.abs(v - g.trace[k]), 0));
      ck(err.indexOf(Math.min(...err)) === g.answer && g.proto !== g.v, `assay seed ${s}: the trace is closest to the answer reference; the setting starts off protocol`); }
  }
  // variety: a theme per job (labels with different words get different content), and per department no mechanic dominates
  ck(J.themeFor('badge', 'Guard the science lab entrance during sensor sweeps') === 'Science lab' && J.themeFor('badge', 'Badge check at shuttlebay') === 'Shuttlebay', 'badge: the door comes from the job');
  ck(J.themeFor('form', 'Health summary to captain', 'bridge') === 'med' && J.themeFor('form', 'Engineering status to the XO', 'engineering') === 'eng', 'report form: the department comes from the job');
  ck(J.gameFor({ label: 'Plot survey course', spot: 'console', room: 'bridge' }).theme !== J.gameFor({ label: 'Plot fastest safe route', spot: 'console', room: 'bridge' }).theme || true, 'course themes by label');

  { let v = null; const s = J.learnedStore(() => v, (x) => { v = x; }); ck(!s.has('console'), 'nothing learned at first'); s.mark('console'); ck(s.has('console') && !s.has('junction') && v.console === 1, 'mark persists through set()'); s.reset(); ck(!s.has('console'), 'reset'); }
  // ---- work sites (js/worksites.js): physical jobs done in the room. Every job resolves (sites or console), no kind over the cap, every site
  //      definition has an interactive act, every act wins on hinted play and faults on bad play, nothing waits forever
  const W = await imp('js/worksites.js'), all = W.coverageAll(duties), rows = Object.entries(all.kinds).sort((a, b) => b[1] - a[1]);
  out.sites = { total: all.total, sites: all.sites, games: all.games, share: +all.share.toFixed(3) };
  console.log(`job coverage incl. work sites (${all.total} jobs: ${all.sites} work-site jobs, ${all.games} console games; max share ${(all.share * 100).toFixed(1)} %):\n` + rows.map(([k, n]) => `${k.padEnd(16)} ${String(n).padStart(4)}  ${(100 * n / all.total).toFixed(1).padStart(5)} %`).join('\n'));
  ck(all.total > 600 && !all.missing.length, 'every loop and task resolves to a site job or a console game; missing: ' + all.missing.slice(0, 5).join(' | '));
  ck(all.share <= MAX_SHARE, 'no kind (site or console) over the cap: ' + all.share);
  ck(all.sites >= 100 && Object.keys(all.kinds).filter(k => k.startsWith('site:')).length >= 14, `physical jobs are work sites (${all.sites}, ${Object.keys(all.kinds).filter(k => k.startsWith('site:')).length} site kinds)`);
  for (const [label, room, id] of [['Coolant loop check', 'plant', 'valves'], ['Routine junction round', 'engineering', 'breakers'], ['Patch scrapes after unload', 'cargo', 'weld'], ['Charge-rack round', 'armory', 'charge'], ['Brig and cell field-check', 'brig', 'fieldsweep'],
    ['Lock cargo bay after loading', 'cargo', 'lockup'], ['Shuttle walkaround and FOD sweep', 'shuttlebay', 'sweep'], ['Fuel and stock shuttles', 'shuttlebay', 'fuel'], ['Carry trays to sickbay', 'sickbay', 'deliver'], ['Stage crates on the transporter pads', 'transporter', 'stage'],
    ['Clear a stretcher lane to sickbay', 'shuttlebay', 'clearout'], ['Pad and emitter diagnostic', 'transporter', 'padscan'], ['Treat shakedown bumps and burns on the engineering crew', 'sickbay', 'regen'], ['Walk sciences stations', 'lab', 'checklist'], ['Calibrate instruments', 'lab', 'benchcal'],
    ['Ward rounds', 'sickbay', 'ward'], ['Scrub and sanitise the galley', 'mess', 'clean'], ['Re-secure loose pallets', 'cargo', 'lash'], ['Grow bed round', 'arboretum', 'growbed'], ['Deck patrol and door checks', 'cargo', 'patrol'], ['Swab and contamination log', 'lab', 'samples'], ['Treat drill injuries and bruises', 'sickbay', 'dose'], ['Shuttle preflight walk-around', 'shuttlebay', 'walkround']])
    ck(W.jobFor({ label, room, spot: 'console' })?.def?.id === id, `"${label}" is the ${id} work site`);
  ck(W.jobFor({ label: 'Balance grid load against reactor output', room: 'engineering', spot: 'console' })?.type === 'game' && W.jobFor({ label: 'Plot orbit and transporter-range hold', room: 'bridge', spot: 'console' })?.type === 'game', 'console work stays a console game');
  const rect = { x: 2, y: 2, w: 6, h: 5 }, free = (x, y) => x >= 2 && x < 8 && y >= 2 && y < 7;
  for (const def of Object.values(W.SITE_DEFS)) {
    ck(['scrub', 'scan', 'timing', 'count', 'turn', 'carry', 'read'].includes(def.act) && def.how && def.name && def.props.length && def.n[0] >= 2 && (def.act !== 'carry' || (def.hub?.length && ['in', 'out'].includes(def.carry))), `${def.id}: an interactive act, how-to, props, at least 2 sites`);
    // sites: from props when the room has them, from the floor when it has none, plus a fetch point when the item is not carried
    const props = def.props.slice(0, 3).map((k, i) => ({ kind: k, tx: 3 + i * 2, ty: 3 }));
    const s1 = W.resolveSites(def, { rect, props, free }, 7), s0 = W.resolveSites(def, { rect, props: [], free }, 7), sf = W.resolveSites(def, { rect, props: [{ kind: 'shelving', tx: 7, ty: 6 }], free }, 7, { fetch: true });
    ck(s1.length >= def.n[0] && s1.some(s => s.prop) && s0.length >= def.n[0] && s0.every(s => !s.prop && free(s.tx, s.ty)), `${def.id}: sites resolve from props and fall back to free floor`);
    ck(!def.item.length || (sf[0].act === 'fetch' && sf[0].kind === 'shelving'), `${def.id}: missing item -> fetch site at the supply shelf first`);
    for (let seed = 1; seed <= 12; seed++) for (const calm of [false, true]) {
      const sites = W.resolveSites(def, { rect, props, free }, seed, { fetch: seed % 3 === 0 }), r = W.createSiteRun(def, seed, sites, { calm });
      for (let f = 0; f < 30 * 400 && r.state === 'work'; f++) { const e = r.step(1 / 30, r.hint(r.next, f)); if (e?.type === 'fetch') r.fetched(); }   // the UI issues the item on a fetch event
      ck(r.state === 'win' && r.faults === 0 && r.outcome().quality === 'proper' && r.outcome().perfect && r.t < r.limit * 0.6, `${def.id} seed ${seed}${calm ? ' calm' : ''}: hinted play wins clean (${r.state} ${r.faults} ${r.t.toFixed(1)}/${r.limit})`);
    }
    // order / item rules: wrong site in a sequence and no item in hand make no progress (and are not faults)
    { const sites = W.resolveSites(def, { rect, props, free }, 3), r = W.createSiteRun(def, 3, sites); const last = sites.length - 1; const e = r.step(0.1, { at: last, press: true, hold: true, hasItem: true, look: r.sites[last].bearing, wipe: 2 }); if (def.order === 'seq') ck(e?.type === 'blocked' && r.sites[last].prog === 0, `${def.id}: sequence: the next site first`);
      if (def.item.length) { const e2 = r.step(0.1, { at: 0, press: true, hold: true, hasItem: false, look: r.sites[0].bearing, wipe: 2 }); ck(e2?.type === 'needItem' && r.sites[0].prog === 0 && r.faults === 0, `${def.id}: no item in hand -> needItem, no progress`); } }
    // bad play: timing / count fault; scrub / scan without the skill crawl; idle times out -> rushed (still done)
    { const r = W.createSiteRun(def, 5, W.resolveSites(def, { rect, props, free }, 5)); for (let f = 0; f < 30 * 10 && r.state === 'work'; f++) r.step(1 / 30, r.bad(r.next, f));
      if (['timing', 'count', 'turn', 'read'].includes(def.act) || def.drop === 'count') ck(r.faults >= 1, `${def.id}: bad play is a fault (${r.faults})`); else ck(r.sites[r.next]?.prog < 0.7 && r.sites.filter(s => s.done).length === 0, `${def.id}: no skill, slow progress (${r.sites[r.next]?.prog})`); }
    { const r = W.createSiteRun(def, 6, W.resolveSites(def, { rect, props, free }, 6)); for (let f = 0; f < 30 * 600 && r.state === 'work'; f++) r.step(1 / 30, { at: -1 }); ck(r.state === 'fail' && r.why === 'time' && r.outcome().quality === 'rushed', `${def.id}: idle ends by itself, rushed`); }
    { const r = W.createSiteRun(def, 6, W.resolveSites(def, { rect, props, free }, 6)); r.step(10, { at: -1, away: true }); ck(r.t === 0, `${def.id}: the clock stops outside the room`); r.cancel(); ck(r.outcome() === null, `${def.id}: cancel has no outcome`); }
    ck(W.siteRushNote(def, 2).length > 5, `${def.id}: has a rushed line`);
  }
  // turn: holding E without turning the view does nothing; turning past the top is a fault. carry: lift first, then set down (hold); a hub serves every trip
  { const def = W.SITE_DEFS.valves, r = W.createSiteRun(def, 2, W.resolveSites(def, { rect, props: [], free }, 2)); const s = r.sites[0]; for (let f = 0; f < 60; f++) r.step(1 / 30, { at: 0, hold: true, hasItem: true, turn: 0 }); ck(s.m === 0 && !r.faults, 'turn: no view turn, no progress');
    for (let f = 0; f < 120; f++) r.step(1 / 30, { at: 0, hold: true, hasItem: true, turn: 1.5 }); ck(r.faults === 1, 'turn: cranking past the top is a fault'); }
  { const def = W.SITE_DEFS.deliver, sites = W.resolveSites(def, { rect, props: [], free }, 3), r = W.createSiteRun(def, 3, sites); ck(sites[0].hub && sites[0].role === 'pick' && sites[0].trips === sites.length - 1 && sites.slice(1).every(x => x.role === 'drop'), 'carry out: one pick-up hub, a drop per trip');
    const e = r.step(0.1, { at: 1, press: true, hold: true, hasItem: true }); ck(e?.type === 'blocked' && e.why === 'empty' && !sites[1].done, 'carry: nothing to set down before lifting');
    r.step(0.05, { at: 0, press: true, hasItem: true }); ck(r.carrying && r.next >= 1, 'carry: E at the hub lifts a load, the next site is a drop');
    const e2 = r.step(0.05, { at: 0, press: true, hasItem: true }); ck(e2?.why === 'hands', 'carry: hands full at the hub');
    for (let f = 0; f < 10; f++) r.step(1 / 30, { at: 1, hold: f < 5, hasItem: true }); ck(!r.sites[1].done, 'carry: letting go early does not set it down');
    for (let f = 0; f < 30; f++) r.step(1 / 30, { at: 1, hold: true, hasItem: true }); ck(r.sites[1].done && !r.carrying, 'carry: holding E sets the load down'); }
  { const def = W.SITE_DEFS.clearout, sites = W.resolveSites(def, { rect, props: [], free }, 3); ck(sites.at(-1).hub && sites.at(-1).role === 'drop' && sites.slice(0, -1).every(x => x.role === 'pick'), 'carry in: clutter to one stack point'); }
  // variants: the same def on two jobs differs (item, prop order, site count or band)
  { let differ = 0; for (const def of Object.values(W.SITE_DEFS)) { const a = W.siteVariant(def, 'Job A ' + def.id), b = W.siteVariant(def, 'Another job ' + def.id); if (JSON.stringify({ ...a, h: 0 }) !== JSON.stringify({ ...b, h: 0 })) differ++; } ck(differ >= Object.keys(W.SITE_DEFS).length * 0.8, 'site variants differ between jobs: ' + differ); }
  { const def = W.SITE_DEFS.valves, items = new Set(['Coolant loop check', 'Coolant and damper walk', 'Coolant loop cross-check', 'Full life support and coolant sweep', 'Reactor and injector walk-round', 'A', 'B'].map(l => W.siteVariant(def, l).item)); ck(items.size === 2, 'valves: some jobs issue a spanner, some a hydrospanner'); }
  // per department (billet -> dept): no mechanic over DEPT_MAX_SHARE, plenty of different kinds, hands-on work in every department; per billet no
  // single kind + theme (the same game with the same content set) over BILLET_MAX_VARIANT
  { const dep = {}, bil = {};
    for (const [bk, b] of Object.entries(duties.billets)) for (const it of [...(b.loops || []).map(l => ({ ...l })), ...Object.values(b.tasks || {}).flat().map(t => ({ ...t, label: t.task }))]) {
      const j = W.jobFor(it), d = BILLET_DEPT[bk] || '?', key = j.type === 'sites' ? j.kind : j.kind + ':' + (j.tool.theme || ''); (dep[d] ||= {})[j.kind] = (dep[d][j.kind] || 0) + 1; (bil[bk] ||= {})[key] = (bil[bk][key] || 0) + 1; }
    out.depts = {};
    for (const [d, k] of Object.entries(dep)) { const n = Object.values(k).reduce((a, b) => a + b, 0), top = Object.entries(k).sort((a, b) => b[1] - a[1])[0], sites = Object.entries(k).filter(([x]) => x.startsWith('site:')).reduce((a, [, v]) => a + v, 0); out.depts[d] = { jobs: n, kinds: Object.keys(k).length, top: top[0], share: +(top[1] / n).toFixed(2), sites };
      ck(d !== '?' && top[1] / n <= DEPT_MAX_SHARE && Object.keys(k).length >= 12 && sites >= 8, `${d}: no mechanic over ${DEPT_MAX_SHARE * 100} % (${top.join(' ')} of ${n}), ${Object.keys(k).length} kinds, ${sites} hands-on`); }
    for (const [bk, k] of Object.entries(bil)) { const n = Object.values(k).reduce((a, b) => a + b, 0), top = Object.entries(k).sort((a, b) => b[1] - a[1])[0]; ck(top[1] / n <= BILLET_MAX_VARIANT, `billet ${bk}: no single game + content set over ${BILLET_MAX_VARIANT * 100} % (${top.join(' ')} of ${n})`); }
    console.log('per department: ' + Object.entries(out.depts).map(([d, o]) => `${d} ${o.jobs} jobs, ${o.kinds} kinds, ${o.sites} hands-on, top ${o.top} ${Math.round(o.share * 100)} %`).join(' · ')); }
  { const def = W.SITE_DEFS.lash, r = W.createSiteRun(def, 2, W.resolveSites(def, { rect, props: [], free }, 2)); const s = r.sites[0]; for (let f = 0; f < 80; f++) r.step(1 / 30, { at: 0, hold: true, hasItem: true }); ck(r.faults === 1 && s.prog === 0, 'timing: holding past the top is a fault'); }
  { const def = W.SITE_DEFS.tally, r = W.createSiteRun(def, 2, W.resolveSites(def, { rect, props: [], free }, 2)); const s = r.sites[0]; for (let k = 0; k <= s.n; k++) r.step(1 / 30, { at: 0, press: true, hasItem: true }); for (let f = 0; f < 40; f++) r.step(1 / 30, { at: 0, hasItem: true }); ck(r.faults === 1 && !s.done && s.c === 0, 'count: one too many is a miscount; start again'); }
  return out;
}
// a key press through the real window listeners (the menus router in capture, then main.js), as tools/test-ui.mjs does
const press = (page, code) => page.evaluate((code) => { window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })); }, code);
// browser half: the instruction card shows once per tool (persisted in fb_cfg), win / fail set quality + time, Esc cancels (job stays due), no soft-lock
export async function jobgameBrowser(page, fail) {
  // pointer lock is off for this section (tools/test-ui.mjs covers the lock / Esc / relock rules): headless Chromium grants and drops locks
  // asynchronously, and opening + closing layers within one test frame races those events into a pause screen no player can reach
  await page.evaluate(() => { document.exitPointerLock?.(); window.__jgLock = __game.G.menus.lock; __game.G.menus.lock = () => null; });
  const r = await page.evaluate(() => {
    const g = __game, G = g.G, CFG = g.CFG, J = g.jobgame, out = {}, hide = () => document.querySelectorAll('.screen').forEach(s => s.classList.remove('show'));
    g.newRun(); hide(); g.setQuality('low'); G.phase = 'play'; G.hp = G.maxHp = 1e6; CFG.learned = {}; CFG.calm = false; CFG.cb = false; CFG.caps = false;
    const D = g.duty, deck = G.shipDeck + 1, l = D.loops[0], base = (q) => Math.max(2.5, l.dur * (10 / 3) * l.q[q][0] * 1.2 * (g.pace.performMul ?? 1));
    const due = (spot, label = 'Work the ops board') => { if (D.busy) D.busy = null; l.spot = spot; l.label = label; l.sys = ''; l.state = 'due'; l.dueAt = D.t; D.setPlace(deck, l.room); };
    const play = (how) => { const gm = J.game; for (let i = 0; i < 2000 && gm.state === 'play'; i++) { if (how === 'win') { for (const [c, d] of gm.hint()) J.key(c, d); } else if (how === 'strike') { const b = gm.bad(); if (b) J.key(b); } J.tick(1 / 30); } J.tick(1); return gm.result(); };
    // 1) first use of the console: the instruction card, the layer is up and the world is frozen
    due('console'); const r1 = g.startJob(l, { console: true }); out.first = { ok: r1.ok, game: !!r1.game, phase: J.phase, layer: G.ui.has('jobgame'), frozen: G.menuPause, card: /New tool/.test(document.getElementById('jobgame')?.textContent || ''), keys: document.querySelectorAll('#jobgame kbd').length };
    return out;
  });
  // the real keyboard path: Enter through the menus router begins the game (learned + persisted)
  await press(page, 'Enter');
  const r2 = await page.evaluate(() => {
    const g = __game, G = g.G, CFG = g.CFG, J = g.jobgame, out = {}, D = g.duty, l = D.loops[0], deck = G.shipDeck + 1;
    const base = (q) => Math.max(2.5, l.dur * (10 / 3) * l.q[q][0] * 1.2 * (g.pace.performMul ?? 1));
    const due = (spot, label = 'Work the ops board') => { if (D.busy) D.busy = null; l.spot = spot; l.label = label; l.sys = ''; l.state = 'due'; l.dueAt = D.t; D.setPlace(deck, l.room); };
    const play = (how) => { const gm = J.game; for (let i = 0; i < 2000 && gm.state === 'play'; i++) { if (how === 'win') { for (const [c, d] of gm.hint()) J.key(c, d); } else if (how === 'strike') { const b = gm.bad(); if (b) J.key(b); } J.tick(1 / 30); } J.tick(1); return gm.result(); };
    out.begun = { phase: J.phase, kind: J.game?.kind, learned: !!CFG.learned?.console, stored: !!JSON.parse(localStorage.getItem('fb_cfg') || '{}').learned?.console };
    // 2) win: the job runs properly, at half time (clean), the layer is gone
    const w = play('win'); out.win = { res: w.state, closed: !J.active && !G.ui.has('jobgame'), busy: D.busy?.loop === l, q: D.busy?.q, total: +(D.busy?.total || 0).toFixed(2), base: +base('proper').toFixed(2) };
    // 3) second use of the same tool: no card; a fumbled game still does the job, rushed
    due('console'); g.startJob(l, { console: true }); out.second = { phase: J.phase }; const f = play('strike'); out.fail = { res: f.state, strikes: f.strikes, busy: D.busy?.loop === l, q: D.busy?.q, total: +(D.busy?.total || 0).toFixed(2), base: +base('rushed').toFixed(2) };
    // 4) another tool kind (warp core valve): its own card; idle play runs out of time -> rushed, never stuck
    due('warpcore', 'Core temperature and injector rounds'); g.startJob(l, { console: true }); out.dial = { phase: J.phase }; J.key('Enter'); let n = 0; while (J.active && n++ < 30 * 40) J.tick(1 / 30); out.dial.timeout = { active: J.active, q: D.busy?.q, frames: n, why: J.game?.why };
    // 5) calibration (biobed): hold-key game wins; calm visuals give 50 % more time
    CFG.calm = true; due('console', 'Test emergency medical systems'); g.startJob(l, { console: true }); J.key('Enter'); out.cal = { limit: J.game.limit, kind: J.game.kind }; const c = play('win'); out.cal.res = c.state; out.cal.q = D.busy?.q; CFG.calm = false;
    // 6) colour-blind palette + captions: a strike leaves a caption line
    CFG.cb = true; CFG.caps = true; due('junction', 'Routine junction round'); g.startJob(l, { console: true }); J.key('Enter'); out.cb = { good: J.palette.good, leads: J.palette.wires.join(',') }; const gm = J.game; J.key('Digit' + (gm.solve() % 4 + 1)); out.cb.caption = [...document.querySelectorAll('#caps div')].map(d => d.textContent).join('|'); out.cb.strikes = gm.strikes;
    return out;
  });
  // 7) Esc through the real keyboard router: cancel; the job stays due, nothing performed, the layer stack is empty
  await press(page, 'Escape');
  const r3 = await page.evaluate(() => {
    const g = __game, G = g.G, CFG = g.CFG, J = g.jobgame, D = g.duty, l = D.loops[0], deck = G.shipDeck + 1, out = {};
    out.cancel = { active: J.active, state: l.state, busy: !!D.busy, stack: G.ui.stack.length, frozen: G.menuPause, log: J.log.slice(-1)[0] };
    CFG.cb = false; CFG.caps = false;
    // 8) a mission task at a junction 
    const t = D.tasks[0]; if (t) { t.state = 'active'; t.spot = 'junction'; t.task = 'Routine junction round'; D.setPlace(deck, t.room); const rt = g.startJob({ ...t, label: t.task }, { console: true }); out.task = { game: !!rt.game }; }
    return out;
  });
  const r4 = await page.evaluate(() => {
    const g = __game, G = g.G, J = g.jobgame, D = g.duty, l = D.loops[0], deck = G.shipDeck + 1, out = {}, t = D.tasks[0];
    if (t) { const gm = J.game; for (let i = 0; i < 2000 && gm.state === 'play'; i++) { for (const [c, d] of gm.hint()) J.key(c, d); J.tick(1 / 30); } J.tick(1); out.task = { state: t.state, by: t.by, phase: G.phase }; }
    // 9) no tool at the spot: the job just runs (no game); a job that cannot start here never opens a game
    if (D.busy) D.busy = null; l.spot = 'any'; l.label = 'Walk about'; l.state = 'due'; D.setPlace(deck, l.room); const r = g.startJob(l, { console: true }); out.plain = { ok: r.ok, game: !!r.game, active: J.active, busy: D.busy?.loop === l };
    if (D.busy) D.busy = null; l.spot = 'console'; l.state = 'due'; D.setPlace(deck, 'nowhere'); const r2 = g.startJob(l, { console: true }); out.away = { ok: r2.ok, active: J.active };
    // 10) a phase change (death, lift) while a game is up closes it (cancel), never leaves the layer up
    D.setPlace(deck, l.room); g.startJob(l, { console: true }); G.phase = 'dying'; J.tick(0.1); out.phase = { active: J.active, stack: G.ui.stack.length }; G.phase = 'play';
    return out;
  });
  // 11) every themed kind through startJob: its own card once, win -> proper, fail -> rushed, Esc -> still due; a mission task plays its game too;
  //     rushing never opens a game (one key, one line about the corner cut). Captions + colour-blind on for a strike caption per kind.
  const r5 = await page.evaluate((LABELS) => {
    const g = __game, G = g.G, CFG = g.CFG, J = g.jobgame, D = g.duty, l = D.loops[0], deck = G.shipDeck + 1, out = { kinds: {} };
    const due = (label) => { if (D.busy) D.busy = null; l.spot = 'console'; l.label = label; l.sys = ''; l.state = 'due'; l.dueAt = D.t; D.setPlace(deck, l.room); };
    const run = (how) => { const gm = J.game; if (!gm) return null; for (let i = 0; i < 2000 && gm.state === 'play'; i++) { if (how === 'win') { for (const [c, d] of gm.hint()) J.key(c, d); } else { const b = gm.bad(); if (b) J.key(b); } J.tick(1 / 30); } J.tick(1); return gm.result(); };
    CFG.caps = true; CFG.cb = true;
    for (const [kind, label] of Object.entries(LABELS)) {
      const o = out.kinds[kind] = {};
      due(label); g.startJob(l, { console: true }); o.card = J.phase === 'intro' && /New tool/.test(document.getElementById('jobgame')?.textContent || ''); J.key('Enter'); o.kind = J.game?.kind; o.canvas = !!document.querySelector('#jobgame canvas'); o.btns = document.querySelectorAll('#jobgame [data-k]').length;
      J.tick(1 / 30); const w = run('win'); o.win = w?.state; o.q = D.busy?.q; o.closed = !J.active && !G.ui.has('jobgame');
      due(label); g.startJob(l, { console: true }); o.again = J.phase; const f = run('fail'); o.fail = f?.state; o.fq = D.busy?.q; o.fclosed = !J.active;
      due(label); g.startJob(l, { console: true }); const b = J.game?.bad(); if (b) J.key(b); o.caption = [...document.querySelectorAll('#caps div')].map(d => d.textContent).slice(-1)[0] || ''; J.cancel(); o.cancel = { state: l.state, busy: !!D.busy, layer: G.ui.has('jobgame') };
    }
    // a mission task with a themed game
    const t = D.tasks[0]; if (t) { if (D.busy) D.busy = null; t.state = 'active'; t.spot = 'biobed'; t.task = 'Counsel the evacuees on arrival'; D.setPlace(deck, t.room); const rt = g.startJob({ ...t, label: t.task }, { console: true }); out.task = { game: !!rt.game, kind: J.game?.kind ?? (J.phase === 'intro' ? 'intro' : null) }; if (J.phase === 'intro') J.key('Enter'); out.task.kind2 = J.game?.kind; run('win'); out.task.state = t.state; out.task.by = t.by; }
    // rushed: no game, one line
    due(LABELS.vitals); const before = J.active; const rr = D.perform(l.id, 'rushed'); out.rushed = { ok: rr.ok, game: !!J.active || !!before, q: D.busy?.q };
    CFG.caps = false; CFG.cb = false; if (D.busy) D.busy = null;
    return out;
  }, KIND_LABELS);
  await page.evaluate(() => { __game.G.menus.lock = window.__jgLock; });
  const R = { ...r, ...r2, ...r3, ...r4, task: r4.task && { ...r3.task, ...r4.task }, themed: r5 }; console.log('jobgames:', JSON.stringify(R));
  const chk = (c, m) => { if (!c) fail('jobgames browser: ' + m + ' ' + JSON.stringify(R)); };
  chk(R.first.ok && R.first.game && R.first.phase === 'intro' && R.first.layer && R.first.frozen && R.first.card && R.first.keys >= 3, 'first use shows the instruction card on a frozen world');
  chk(R.begun.phase === 'play' && R.begun.kind === 'sequence' && R.begun.learned && R.begun.stored, 'Enter begins; the tool is learned and persisted (fb_cfg)');
  chk(R.win.res === 'win' && R.win.closed && R.win.busy && R.win.q === 'proper' && Math.abs(R.win.total - Math.max(1.25, R.win.base * 0.5)) < 0.05, 'win: proper at half time, layer closed');
  chk(R.second.phase === 'play', 'instruction card shown only once per tool');
  chk(R.fail.res === 'fail' && R.fail.strikes === 3 && R.fail.busy && R.fail.q === 'rushed' && Math.abs(R.fail.total - R.fail.base) < 0.05, 'fail: the job still runs, rushed, normal time');
  chk(R.dial.phase === 'intro' && !R.dial.timeout.active && R.dial.timeout.q === 'rushed' && R.dial.timeout.why === 'time', 'a new tool gets its own card; doing nothing times out (no soft-lock)');
  chk(R.cal.kind === 'calibrate' && R.cal.limit === 24 && R.cal.res === 'win' && R.cal.q === 'proper', 'calibration hold-key game (medical hologram) wins; calm gives +50 % time');
  chk(R.cb.good !== '#4fd06a' && !/#4fd06a|#ff5a48/.test(R.cb.leads) && R.cb.strikes === 1 && /sparks/.test(R.cb.caption), 'colour-blind palette + sound caption on a strike');
  chk(R.cancel.active === null && R.cancel.state === 'due' && !R.cancel.busy && R.cancel.stack === 0 && !R.cancel.frozen && /cancel/.test(R.cancel.log), 'Esc cancels: job still due, nothing performed, layer gone');
  chk(!R.task || (R.task.state === 'done' && R.task.by === 'proper'), 'mission task at a junction done properly through the game');
  chk(R.plain.ok && !R.plain.game && !R.plain.active && R.plain.busy, 'no tool at the spot: the job runs directly');
  chk(!R.away.ok && !R.away.active, 'a job that cannot start here opens no game');
  chk(!R.phase.active && R.phase.stack === 0, 'a phase change closes the game');
  for (const [kind, o] of Object.entries(R.themed.kinds)) {
    chk(o.card && o.kind === kind && o.canvas && o.btns >= 2, `${kind}: its own instruction card, then its game with on-screen buttons`);
    chk(o.win === 'win' && o.q === 'proper' && o.closed, `${kind}: win -> proper, layer closed`);
    chk(o.again === 'play' && o.fail === 'fail' && o.fq === 'rushed' && o.fclosed, `${kind}: second time no card; fail -> rushed, never stuck`);
    chk(o.cancel.state === 'due' && !o.cancel.busy && !o.cancel.layer, `${kind}: cancel -> still due, nothing performed`);
  }
  chk(!R.themed.task || (R.themed.task.game && R.themed.task.kind2 === 'counsel' && R.themed.task.state === 'done' && R.themed.task.by === 'proper'), 'mission task plays its themed game (counsel) and is done properly');
  chk(R.themed.rushed.ok && !R.themed.rushed.game && R.themed.rushed.q === 'rushed', 'rushing opens no game');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) { const errs = []; const r = await jobgameTests(m => errs.push(m)); console.log(errs.length ? errs.join('\n') : 'jobgames OK ' + JSON.stringify(r)); process.exit(errs.length ? 1 : 0); }

// ---- browser: the J paths always lead to the job (regression: "when I did J to do the job it didn't direct me to a mini game"), and a work-site
//      job end to end (walk to each site, item required: draw it at the supply point, do each act, completion -> proper)
export async function jobsiteBrowser(page, fail) {
  const { installHelpers } = await import('./test-helpers.mjs'); await installHelpers(page);
  await page.evaluate(() => { document.exitPointerLock?.(); window.__jgLock2 = __game.G.menus.lock; __game.G.menus.lock = () => null; });
  const R = await page.evaluate(() => {
    const g = __game, G = g.G, CFG = g.CFG, P = g.P, out = {}, hide = () => document.querySelectorAll('.screen').forEach(s => s.classList.remove('show'));
    g.newRun(); hide(); g.setQuality('low'); G.phase = 'play'; G.hp = G.maxHp = 1e6; CFG.learned = {}; CFG.calm = false; const restore = __T.quiet();
    const D = g.duty, w = g.world, d = w.d, deck = G.shipDeck + 1; let t = 0; const step = (n = 1) => { for (let i = 0; i < n; i++) { t += 1 / 30; g.step(1 / 30, t); } };
    const inRoom = (r) => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { const [cx, cz] = w.center(x, y); if (__T.open(cx, cz, 0.3)) return [cx, cz]; } return null; };
    const goTo = ([x, z], yaw = P.yaw) => { P.x = x; P.z = z; P.vx = P.vz = 0; P.yaw = yaw; };
    const roomOf = (type) => d.rooms.find(r => r.type === type && inRoom(r));
    // a room with a console (console job) and another room to start from
    const cp = d.props.find(p => p.kind === 'console' && d.room[p.ty]?.[p.tx] && roomOf(d.room[p.ty][p.tx])), croom = cp && d.room[cp.ty][cp.tx];
    const other = d.rooms.find(r => r.type !== croom && inRoom(r)); out.setup = { croom, other: other?.type };
    // 1) J board, a console job in another room: Properly pins the route, starts nothing, closes the board; arriving at the console opens the game
    const l = D.loops[0]; if (D.busy) D.busy = null; Object.assign(l, { label: 'Work the ops board', room: croom, spot: 'console', sys: '', state: 'due', dueAt: D.t });
    goTo(inRoom(other)); step(2);
    const H = G.hud2; H.openBoard(); const blk = (H._tl = H.timeline()).lanes.flatMap(L => L.blocks).find(b => b.ref.loop === l.id && (b.st === 'due' || b.st === 'overdue' || b.ref.live)); H.pop = blk?.k; H.renderPanel();
    const btn = document.querySelector('#duty-panel [data-do="q:proper"], [data-do="q:proper"]'); out.btn = { found: !!btn, off: btn?.classList.contains('off'), sub: btn?.querySelector('em')?.textContent };
    btn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    out.routed = { go: G.jobGo?.id === l.id, pin: G.nav?.pin?.kind, game: !!g.jobgame.active, board: H.boardOpen, state: l.state, hint: H.hintEl?.textContent || '' }; step(2); out.routed.hint = H.hintEl?.textContent || '';
    const [sx, sz] = w.center(cp.tx, cp.ty), side = __T.openSideOf(sx, sz, 1.9, 1.3); goTo([side.x, side.z], side.yaw); step(3);
    out.arrive = { go: !!G.jobGo, game: !!g.jobgame.active, phase: g.jobgame.phase, pin: G.nav?.pin?.kind || null }; g.jobgame.cancel();
    // 2) the J menu path (Duty menu -> Do a duty or task -> the job -> Do it properly) from another room routes the same way
    goTo(inRoom(other)); step(2); l.state = 'due'; g.G.menus.c.dutyMenu(); H.choose(H.menuStack.at(-1).opts.findIndex(o => /^Do a duty/.test(o.label)));
    const li = H.menuStack.at(-1).opts.findIndex(o => o.label === l.label); H.choose(li); H.choose(0); out.menu = { go: G.jobGo?.id === l.id, game: !!g.jobgame.active, open: H.menuOpen };
    g.G.clearJobGo();
    // 3) a work-site job: galley clean (mop). Mop off the belt -> a fetch site first. Routed from elsewhere, starts on entering the room.
    const room = d.rooms.find(r => r.w >= 3 && r.h >= 3 && r.type !== croom && inRoom(r)) || other, type = room.type;
    if (D.busy) D.busy = null; Object.assign(l, { label: 'Scrub and sanitise the galley', room: type, spot: 'console', sys: '', state: 'due', dueAt: D.t });
    G.kit.belt = G.kit.belt.filter(b => b.id !== 'mop'); G.kit.hand = -1;
    const start = d.rooms.find(r => r.type !== type && inRoom(r)); goTo(inRoom(start)); step(2);
    const rg = g.goJob(l); out.site0 = { routed: !!rg.routed, go: !!G.jobGo, active: g.sites.active };
    goTo(inRoom(room)); step(3); const S = g.sites, run = S.run;
    out.site = { active: S.active, type, def: run?.def.id, n: run?.sites.length, fetch: run?.sites[0]?.act === 'fetch', marks: g.scene.children.filter(o => o.userData.worksite != null).length, panel: document.getElementById('wsite')?.classList.contains('on'), pin: G.nav?.pin?.kind, hint: H.hintEl?.textContent || '' };
    if (run) {
      // walking up to a site and facing it puts it in reach (no input override)
      const stand = (s) => { const [cx, cz] = w.center(s.tx, s.ty), o = s.prop ? __T.openSideOf(cx, cz, 1.6, 1.3) : { x: cx + 0.6, z: cz, yaw: Math.atan2(-(cx - cx - 0.6), 0) }; if (o) goTo([o.x, o.z], o.yaw ?? Math.atan2(-(cx - o.x), -(cz - o.z))); };
      stand(run.sites[1]); step(2); out.reach = { at: S.at, want: 1 };
      // wrong order: a scrub site before the supply point -> blocked; then the fetch site issues a mop into the hand
      S.inputOverride = { at: 1, press: true, hold: true, wipe: 2 }; step(1); S.inputOverride = null; out.blocked = run.events.some(e => e.type === 'blocked' && e.why === 'fetch') && run.sites[1].prog === 0;
      stand(run.sites[0]); step(1); S.inputOverride = { at: 0, press: true }; step(1); S.inputOverride = null; out.fetch = { done: run.sites[0].done, hand: G.kit.inst?.id, pin: G.nav?.pin?.id };
      // every other site: scrub (hold E + view motion) until clean; hasItem comes from the real hand
      for (let i = 1; i < run.sites.length; i++) { stand(run.sites[i]); for (let f = 0; f < 30 * 30 && !run.sites[i].done && S.run; f++) { S.inputOverride = { at: i, hold: true, wipe: 2 }; step(1); } }
      S.inputOverride = null; step(2);
    }
    out.done = { active: S.active, run: !!S.run, busy: D.busy?.loop === l, q: D.busy?.q, marks: g.scene.children.filter(o => o.userData.worksite != null).length, panel: document.getElementById('wsite')?.classList.contains('on'), log: S.log.slice(-1)[0] };
    // 4) a site job with the item on the belt (not in hand): the first E at a site takes it out; phase change cancels, job stays due
    if (D.busy) D.busy = null; Object.assign(l, { state: 'due', label: 'Re-secure loose pallets' }); G.kit.hand = -1; if (!G.kit.belt.some(b => b.id === 'cargo_hook')) G.kit.belt[1] = { id: 'cargo_hook', dur: 300, charge: 0, uses: 0, broken: false };
    goTo(inRoom(room)); step(1); const r4 = g.startJob(l); const run4 = S.run; out.belt = { ok: r4.ok, fetch: run4?.sites[0]?.act === 'fetch' };
    if (run4) { S.inputOverride = { at: 0, press: true, hold: true }; step(1); S.inputOverride = null; out.belt.hand = G.kit.inst?.id; G.phase = 'dying'; step(1); G.phase = 'play'; out.belt.cancel = { active: S.active, state: l.state, marks: g.scene.children.filter(o => o.userData.worksite != null).length }; }
    // 5) the second-pass acts through the real UI tick: a valve walk (turn: crank with the view, spanner issued at the supply point) and a delivery
    //    (carry: lift at the trolley, set down at each drop). Hinted input via inputOverride; markers, checklist and the result as for the clean.
    out.more = {};
    for (const [label, id] of [['Coolant loop check', 'valves'], ['Carry trays to sickbay', 'deliver'], ['Lock cargo bay after loading', 'lockup'], ['Coolant and damper walk', 'gauges'], ['Requisition round', 'stockup'], ['Screen away-team members on return', 'screening']]) {
      if (D.busy) D.busy = null; G.phase = 'play'; Object.assign(l, { label, room: type, spot: 'console', sys: '', state: 'due', dueAt: D.t }); G.kit.belt = G.kit.belt.filter(b => !['spanner', 'hydrospanner'].includes(b.id)); G.kit.hand = -1;
      goTo(inRoom(room)); step(1); const rs = g.startJob(l), run = S.run, o = out.more[id] = { ok: rs.ok, def: run?.def.id, n: run?.sites.length, acts: [...new Set(run?.sites.map(x => x.act) || [])].join(','), marks: g.scene.children.filter(m => m.userData.worksite != null).length, hints: new Set() };
      for (let f = 0; f < 30 * 400 && S.run; f++) { const i = run.next; S.inputOverride = run.hint(i, f); step(1); if (f % 15 === 0) o.hints.add(S.hint().replace(/ · .*$/, '')); }
      S.inputOverride = null; step(2); o.hints = [...o.hints].join('|'); o.done = { active: S.active, busy: D.busy?.loop === l, q: D.busy?.q, faults: run?.faults, marks: g.scene.children.filter(m => m.userData.worksite != null).length, item: run?.item, hand: G.kit.inst?.id };
    }
    restore(); if (D.busy) D.busy = null; return out;
  });
  await page.evaluate(() => { __game.G.menus.lock = window.__jgLock2; });
  console.log('jobsites:', JSON.stringify(R));
  const chk = (c, m) => { if (!c) fail('jobsites browser: ' + m + ' ' + JSON.stringify(R)); };
  chk(R.btn.found && !R.btn.off && /route/.test(R.btn.sub || ''), 'board: Properly is live from another room and says it will route');
  chk(R.routed.go && R.routed.pin === 'job' && !R.routed.game && !R.routed.board && /starts when you get there/.test(R.routed.hint), 'J board Properly from another room: route pinned, hint shown, no game yet, board closed');
  chk(!R.arrive.go && R.arrive.game && R.arrive.pin !== 'job', 'arriving at the station opens the mini-game by itself and clears the pin');
  chk(R.menu.go && !R.menu.game && !R.menu.open, 'J menu "Do it properly" from another room routes too');
  chk(R.site0.routed && R.site0.go && !R.site0.active, 'site job from elsewhere: routed, not started');
  chk(R.site.active && R.site.def === 'clean' && R.site.fetch && R.site.n >= 4 && R.site.marks === R.site.n && R.site.panel && R.site.pin === 'site', 'entering the room starts the work sites: markers, checklist, fetch site (no mop), next site pinned');
  chk(R.reach.at === R.reach.want, 'walking up to a site and facing it puts it in reach');
  chk(R.blocked && R.fetch.done && R.fetch.hand === 'mop', 'supply point first; it issues a mop into the hand');
  chk(!R.done.active && !R.done.run && R.done.busy && R.done.q === 'proper' && R.done.marks === 0 && !R.done.panel, 'every site scrubbed: the job is done properly; markers and checklist gone');
  for (const [id, o] of Object.entries(R.more)) chk(o.ok && o.def === id && o.marks === o.n && o.done.q === 'proper' && !o.done.active && o.done.marks === 0 && o.done.faults === 0, `${id}: the site job starts in the room, plays through the UI to a proper result, markers gone`);
  chk(R.more.valves.acts.includes('turn') && (R.more.valves.done.hand === R.more.valves.done.item), 'valve walk: the turn act, the spanner it issued is in hand');
  chk(R.more.gauges.acts === 'read' && /Tap \[E\]: in limits/.test(R.more.gauges.hints) && /Reading/.test(R.more.gauges.hints), 'gauge walk: the read act, settle then tap / hold to call it');
  chk(R.more.stockup.acts === 'carry' && /count it in/.test(R.more.stockup.hints), 'carry and count: lift at the stock point, count it onto each shelf');
  chk(R.more.screening.acts.includes('scan') && R.more.screening.done.hand === 'tricorder_med', 'crew screening: the medical tricorder is issued and swept over each crew member');
  chk(R.more.deliver.acts === 'carry' && /lift a load/.test(R.more.deliver.hints) && /set it down/.test(R.more.deliver.hints), 'delivery: the carry act, lift / set-down hints');
  chk(R.belt.ok && !R.belt.fetch && R.belt.hand === 'cargo_hook' && !R.belt.cancel.active && R.belt.cancel.state === 'due' && R.belt.cancel.marks === 0, 'item on the belt: first E takes it out; a phase change cancels, the job stays due');
}
