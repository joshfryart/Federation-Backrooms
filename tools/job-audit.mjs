// Job audit (docs/job-audit.md): every duty loop + mission task in assets/data/duties.json, by department and billet, with the activity it
// played before this pass and the one it plays now (js/worksites.js jobFor: a work site in the room first, else the console game), and a verdict.
//   node tools/job-audit.mjs --before <dir>      <dir> holds the previous js/ (git archive <ref> js | tar -x -C <dir>); writes docs/job-audit.md
//   node tools/job-audit.mjs                     no "before" column source: prints the current per-kind / per-department counts only
//   --after <file>                               also write every job as [{ billet, label, type, new_activity }] ('In-room: …' / 'Console: …')
// The "Second pass: weak and mismatched" section reads tools/job-review.json: the 250 jobs a human-work review (one model pass over every job's
// real steps, tools and difficulty) rated weak or mismatched against the activity they had, and whether this pass accepted or disputed it.
// Verdicts are computed: "fits" tests below say what each old activity is about; a job whose label does not match its old activity was a
// mismatch. Hand notes per department (NOTES) and the list of jobs still weak (WEAK) are written here, not computed.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BILLET_DEPT } from './test-jobgames.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), argv = process.argv.slice(2), opt = (k) => { const i = argv.indexOf('--' + k); return i < 0 ? null : argv[i + 1]; };
const W = await import(pathToFileURL(join(ROOT, 'js/worksites.js')).href), J = await import(pathToFileURL(join(ROOT, 'js/jobgames.js')).href);
const B = opt('before') ? await import(pathToFileURL(resolve(opt('before'), 'js/worksites.js')).href) : null;
const duties = JSON.parse(readFileSync(join(ROOT, 'assets/data/duties.json'), 'utf8'));
await (await import(pathToFileURL(join(ROOT, 'js/jobs/index.js')).href)).loadAll(duties);   // job modules load on demand: jobFor only sees loaded ones
const REVIEW = JSON.parse(readFileSync(join(ROOT, 'tools/job-review.json'), 'utf8'));
const DEPTS = ['command', 'flight', 'operations', 'engineering', 'security', 'sciences', 'medical', 'services'];
const DNAME = { command: 'Command', flight: 'Flight Control', operations: 'Operations', engineering: 'Engineering', security: 'Security', sciences: 'Sciences', medical: 'Medical', services: 'Support Services' };
const TITLE = { co: 'Commanding Officer', xo: 'First Officer', so: 'Second Officer', yeoman: 'Captain\'s Yeoman', cfo: 'Chief Flight Officer', helm: 'Helm Officer', nav: 'Navigator', pilot: 'Shuttle Pilot', deck: 'Flight Deck Crew',
  ops: 'Operations Manager', comms: 'Communications Officer', tchief: 'Transporter Chief', ttech: 'Transporter Technician', comp: 'Computer Specialist', ce: 'Chief Engineer', ace: 'Assistant Chief Engineer', reactor: 'Reactor Specialist',
  env: 'Environmental Systems Officer', eps: 'EPS Technician', dc: 'Damage Control Crew', cos: 'Chief of Security', dep: 'Deputy Chief of Security', armory: 'Armory Officer', sec: 'Security Officer', guard: 'Security Crewman',
  cso: 'Chief Science Officer', sensor: 'Sensor Officer', carto: 'Stellar Cartographer', bot: 'Botanist', lab: 'Laboratory Technician', cmo: 'Chief Medical Officer', counsel: 'Ship\'s Counselor', doc: 'Physician', nurse: 'Nurse',
  medtech: 'Medical Technician', qm: 'Quartermaster', galley: 'Galley Chief', cook: 'Cook', cargo: 'Cargo Handler', rep: 'Replicator Technician', holo: 'Holodeck Technician' };
// what each OLD activity is about: a label that does not match was a mismatch
const FIT = {
  sequence: /code|sign|authoris|print|ops board|cold-start|start-up/i, bench: /test|bench|part|repair|replace|defect|charger|emitter|coil|stress|instrument|preflight|pre-launch|diagnostic|certified|field|prep .*shuttle|ready .*shuttle/i,
  dial: /coolant|valve|pressure|injector|damper|air|atmos|ventilat|scrubber|filtration|reclamation|core temp|isolation/i, calibrate: /lock|hologra|emitter|program|session|matrix|beam-out|calibrat|output|steady|holographic/i,
  course: /plot|course|route|\bleg\b|fly|flight|approach|transit|orbit|survey grid|navigat|hazards along|run to|speed|rendezvous|hold (station|steady|course|position)|thruster|deflector|deceleration|turn and stop|maneuver|manoeuv/i,
  badge: /badge|guard|post\b|escort|access|entrance|restrict|issue|sign-out|quarantine|order among|control|arm escort|intruder|crowd|station for/i, cook: /cook|meal|broth|food|batch|galley|trays|refreshment|coffee|ration/i,
  nutrient: /hydro|nutrient|feed|\bbeds?\b|o2 balance|herb|o2 output/i, counsel: /counsel|wellness|morale|fatigue|exhaust|debrief|calm|check on|visit|peace|support|open-door|lonely|brief cargo crew/i,
  vitals: /vital|triage|screen|health|patient|casualt|fitness|standby|injur|medical team|lifesign|bloodwork/i, doorlog: /\blog\b|audit|door|serial|lock/i, wires: /junction|wire|lead|\btap\b|link|relay|channel|panel/i,
  classify: /contact|scan|anomal|lifeform|hazard|target|survey|chart|sample|specimen|blood|culture|pathogen|vessel|lifesign|debris|sweep/i, manifest: /manifest|crate|requisition|reconcile|serial|inventory|suppl|spares|stores|kit|cargo|probe|container/i,
  loadbal: /load|stack|sled|stow|crate|batch|weight|strap|lash|cargo|pallet|unload|dummy/i, power: /power|grid|\bload\b|eps|output|surge|margin|burst|cruise|budget|cold-start|\btaps?\b|subsystem|capacity/i,
  tune: /signal|band|channel|comm|link|transceiver|array|sensor|calibrat|deflector|sweep|relay|align/i, decode: /hail|message|signal|relay|comm|channel|traffic|alert|announce|\bpa\b|link|update|request|tone/i,
  fresh: /stock|store|expir|rotate|ration|pantry|cold|food|feedstock|shopping|audit|pattern check/i, tray: /tray|kit|steril|instrument|splint|prep/i, hypo: /dose|dispens|treat|injur|meds|batch/i, meds: /meds|drug|pharm|medicine/i,
  'site:clean': /galley|mess|sanit|scrub|waste|spill|\bclean\b/i, 'site:serve': /serve|meal|refreshment|feed|trays|coffee|plates/i, 'site:growbed': /bed round|grow|o2|feed|hydroponic beds|botanist/i,
};
const GENERIC = new Set(['sequence', 'bench', 'course', 'calibrate', 'badge', 'dial', 'power', 'classify']);
const kindName = (k) => k.startsWith('site:') ? `${W.SITE_DEFS[k.slice(5)]?.name || k.slice(5)} (site)` : (J.KINDS[k]?.title || k);
const short = (k) => k.startsWith('site:') ? `🛠 ${W.SITE_DEFS[k.slice(5)]?.name || k.slice(5)}` : (J.KINDS[k]?.title || k);
function verdict(label, before, after) {
  const fit = FIT[before] ? FIT[before].test(label) : true;
  if (before === after) return 'kept (fits)';
  if (!fit) return 'mismatch fixed';
  if (after.startsWith('site:') && !before.startsWith('site:')) return 'made hands-on';
  if (before.startsWith('site:')) return 'better-fitting site';
  if (GENERIC.has(before)) return `split from the ${J.KINDS[before]?.title.toLowerCase() || before} bucket`;
  return 're-themed';
}
// one row per job
const rows = [];
for (const [bk, b] of Object.entries(duties.billets)) for (const [type, it] of [...(b.loops || []).map(l => ['loop', { ...l }]), ...Object.entries(b.tasks || {}).flatMap(([m, ts]) => ts.map(t => [`task (${m})`, { ...t, label: t.task }]))]) {
  const a = W.jobFor(it), bf = B ? B.jobFor(it) : null, after = a.kind, before = bf ? bf.kind : null;
  const extra = a.type === 'sites' ? `${W.ACTS[a.def.act]}${a.variant?.item ? ` · ${a.variant.item.replace(/_/g, ' ')}` : ''}` : (a.tool.theme ? `theme ${a.tool.theme}` : '');
  rows.push({ bk, dept: BILLET_DEPT[bk], type, label: it.label, room: it.room, before, after, extra, verdict: before ? verdict(it.label, before, after) : '' });
}
const count = (rs, k) => rs.reduce((m, r) => (m[r[k]] = (m[r[k]] || 0) + 1, m), {});
const top = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]);
const sites = (rs, k) => rs.filter(r => r[k]?.startsWith('site:')).length;
if (!B) { const c = top(count(rows, 'after')); console.log(c.map(([k, n]) => `${k} ${n}`).join('\n')); process.exit(0); }

const NOTES = {
  command: 'Paperwork was one identical code-entry game (28 of the ready-room jobs alone). Now: report forms filled from the readings with the addressee taken from the label, roster assignment, priority queues, schedule booking, log trend reviews, PA announcements and log sign-off (read each entry, sign or query); walk-rounds are a PADD checklist walked station by station. Sign-off / authorisation stays a signing game, not a code. Second pass: reports to the captain are spoken briefs (address, most urgent first, catch the read-back), requests / survey extensions / readiness calls are a decision board weighing options against two limits, status boards and drill times are a gauge walk round the stations.',
  flight: 'Course plotting had swallowed every helm job (staffing, reports, holding station, braking). Now plotting stays a plot, holding station is station keeping against a current, approaches / stops / launches / recoveries are a braking-burn game, fixes are a three-bearing position fix, and reports / briefs are report forms. The deck crew sweep the deck with a broom-mop, fuel the shuttles at the bowser, stage probe pods and clear stretcher lanes by carrying. Second pass: flying is a manoeuvre game (hold heading on the bug and speed in the band: survey grid, best-speed run, hard turn and stop, orbit hold, calibration courses, lift-off), thruster pre-checks are a self-test run, launch and recovery standby is a standby watch, reports are spoken briefs, the deck crew clear the bay by carrying and screen returning crew.',
  operations: 'Twenty transporter jobs all played the same pattern lock. Now: holding a lock stays the lock (calibration), beaming is dialling drifting coordinates and energising, pad diagnostics are a walk round the pads with the engineering tricorder, alignment is cranking each pad with a hydrospanner, buffer checks are block-by-block verify, coil tests stay on the bench. Comms keep signal sweep / decode, plus PA zone tests and relay-rack breaker rounds; the computer core gets backup verify and trend review instead of the code. Second pass: relay and junction checks are a relay check with the engineering tricorder (read act), buffer cleaning / decontamination is wiping the contacts, holding a lock and emergency beam-out are a standby watch, core diagnostics are an instrument run, hails and hand-offs are spoken briefs.',
  engineering: 'The valve game had stood in for every walk; power routing for every margin report. Now the coolant / damper / injector walks are a spanner valve walk in the room (turn the view to crank), junction rounds reset breakers panel by panel, hull patches are welded with the plasma torch, filters are unscrewed, fire suppression is pressure-tested with an extinguisher, ventilation is sniffed with the atmospheric tricorder. Load balancing stays power routing; "watch the core" jobs are trend reviews; reports are forms. Second pass: read-and-compare walks (coolant / damper / reactor walk-rounds, life-support sweeps) are a gauge walk calling each gauge in or out of limits, power reroutes at a junction are a switch round against the placard, scrubber capacity and biofilters are filter changes, reactor watches are a standby watch, burst output is flown on the throttle with an engine-heat limit.',
  security: 'Bench tests covered force-field checks, charger rounds and armory audits. Now: chargers are seated and charged at the rack (timing), field emitters are swept with the security tricorder, armory counts are ticked off on a PADD, lock-ups dog each hatch wheel, escorts clear the route corner by corner, guard posts and access control keep the ID check (door chosen from the label), drills are announced on the PA. Second pass: badge posts are a guard post (people walk up; tailgaters, unsigned transfer orders), armory issue / sign-out is a kit check at the counter (read each charge lamp), audits and serial counts are the armory count, the range is zeroing (turn), hazard sweeps of cases and pads use the tricorder, intruder drills are a standby watch or the lock-up round.',
  sciences: 'Classification and signal sweep remain the science console core, but samples are collected in the room, bench calibration turns fine-adjust knobs, plant health is a blight scan with the science tricorder, seedlings and sample cases are carried, extracts are measured at the bench. Chart work is backup verify / trend review / position fix; summaries are report forms. Second pass: assays, blood panels, culture ID, deep scans and diagnostics are an instrument run (set, run, wait, match the trace), quiet sweeps and hazard watches are a standby watch, aiming the arrays tracks a moving target, chart merges are backup verify, summaries are spoken briefs.',
  medical: 'Ward rounds, doses, sterile sweeps and restocking were already hands-on. Added: dermal regenerator treatment (scrub act), bed prep (lay out kit), triage sorting as a priority queue, counselling conversations themed by situation (fatigue, survivors, nervous crew, staff under strain, isolated crew). Hologram checks keep the calibration; reports are forms. Second pass: triage is a triage sort (tag red / yellow / green, re-tag as readings change), walk-in clinics and fitness reviews are a fitness check (read act: fit or refer), returning crews are screened with the tricorder, drills are a standby watch, crush injuries are splinted, stable patients are wheeled to recovery, reports are spoken briefs.',
  services: 'Cooking keeps the range (dishes themed: patient diet, bulk batch, sealed field meals, broth). Deliveries are carried from the trolley to each table / bed / console, crates are shelved and staged with the cargo hook, clutter is cleared to a stack point, ration cases are packed. Equipment tests are a galley bench test, printing on the replicator keys a pattern code, pattern buffers are verified. Holodeck: emitter sweeps with the tricorder, lock-up of the playroom. Second pass: requisitions, spares and medical stock are carried and counted onto the shelves, replicator feedstock refills the hoppers by the measure, hazmat is crimp-sealed, cold stores are a gauge walk, holodeck programs are a decision against the request and the medical-hologram standby is a standby watch.',
};
const WEAK = [
  ['Disputed review ratings', `${REVIEW.filter(r => r.verdict === 'disputed').length} of the ${REVIEW.length} jobs the review rated weak keep their activity, each with the reason in the "Second pass" table (none of them was rated a mismatch). Most are jobs where the note asks for a second step that is its own job elsewhere (the manifest scan beside a tie-down, the suppression test beside a hull patch).`],
  ['Verbal briefs', 'A brief is a console exchange (address, order the items, catch the read-back); there are no crew NPCs to walk up to and speak with in the room, so "walk to the recipient" is the route to the station.'],
  ['Escorts and guard posts', 'Guard posts are now a door watch with people walking up (tailgaters, unsigned transfer orders), but drawn on the console; the escort route still has nobody following you.'],
  ['Report forms', 'About thirty jobs the review rated good stay on the report form (written logs and defect reports), so it is still one of the larger console games.'],
  ['Carry act', 'Carrying has no physical weight, hand pose or speed penalty yet; a load is lifted and set down with E.'],
  ['Turn act', 'Turning the view to crank a spanner / wheel needs mouse or arrow-key turning; on a gamepad there is no mapping yet.'],
];
// ---- write
const L = [];
const kindsBefore = count(rows, 'before'), kindsAfter = count(rows, 'after'), total = rows.length;
L.push('# Job audit — every duty loop and mission task', '');
L.push(`Generated by \`node tools/job-audit.mjs --before <previous js/>\` from \`assets/data/duties.json\` (${total} jobs: ${rows.filter(r => r.type === 'loop').length} duty loops, ${rows.filter(r => r.type !== 'loop').length} mission tasks, ${new Set(rows.map(r => r.label)).size} distinct labels, ${Object.keys(duties.billets).length} billets).`,
  'The owner asked for every job to be unique and interactive: a console screen game, or a physical thing done in the room with the item in hand (scan with a tricorder, crank a spanner, sweep with a broom…).',
  '"Before" is what `jobFor()` returned at the start of this pass (the second audit pass; the first pass moved 38 → 81 activities and is in the git history of this file); "after" is what it returns now. 🛠 marks a work site in the room (js/worksites.js); everything else is an LCARS console game (js/jobgames.js).',
  'Verdicts: **mismatch fixed** (the old activity was not about the job: a computed "fits" test per old activity, `FIT` in the script), **made hands-on** (console → work site), **split from the … bucket** (a fitting but over-used generic game replaced by a more specific one), **better-fitting site**, **re-themed**, **kept (fits)**.', '');
L.push('## Totals', '');
L.push(`| | before | after |`, `|---|---|---|`);
L.push(`| distinct activities (console kinds + site defs) | ${Object.keys(kindsBefore).length} | ${Object.keys(kindsAfter).length} |`);
L.push(`| hands-on work-site jobs | ${sites(rows, 'before')} | ${sites(rows, 'after')} |`);
L.push(`| largest single activity | ${top(kindsBefore)[0][0]} ${top(kindsBefore)[0][1]} (${(100 * top(kindsBefore)[0][1] / total).toFixed(1)} %) | ${top(kindsAfter)[0][0]} ${top(kindsAfter)[0][1]} (${(100 * top(kindsAfter)[0][1] / total).toFixed(1)} %) |`);
const vc = count(rows, 'verdict'); L.push(`| verdicts | | ${top(vc).map(([k, n]) => `${k} ${n}`).join(' · ')} |`, '');
L.push('### Per department', '', '| department | jobs | activities before → after | hands-on before → after | top activity before | top activity after |', '|---|---|---|---|---|---|');
for (const d of DEPTS) { const rs = rows.filter(r => r.dept === d), b = top(count(rs, 'before')), a = top(count(rs, 'after'));
  L.push(`| ${DNAME[d]} | ${rs.length} | ${b.length} → ${a.length} | ${sites(rs, 'before')} → ${sites(rs, 'after')} | ${short(b[0][0])} ${Math.round(100 * b[0][1] / rs.length)} % | ${short(a[0][0])} ${Math.round(100 * a[0][1] / rs.length)} % |`); }
L.push('', '### Per activity (all jobs)', '', '| activity | before | after |', '|---|---|---|');
for (const k of [...new Set([...Object.keys(kindsAfter), ...Object.keys(kindsBefore)])].sort((x, y) => (kindsAfter[y] || 0) - (kindsAfter[x] || 0))) L.push(`| ${kindName(k)} | ${kindsBefore[k] || 0} | ${kindsAfter[k] || 0} |`);
L.push('', '## Still weak', '', ...WEAK.map(([k, v]) => `- **${k}:** ${v}`), '');
// ---- second pass: the review's weak / mismatched jobs, before → after, accepted or disputed
{ const byKey = new Map(rows.map(r => [r.bk + '|' + r.label, r])), acc = REVIEW.filter(r => r.verdict === 'accepted'), mis = REVIEW.filter(r => r.rating === 'mismatch');
  const stillMis = mis.filter(r => { const x = byKey.get(r.billet + '|' + r.label); return !x || x.before === x.after; });
  const newKinds = ['brief', 'decide', 'fly', 'post', 'assay', 'triage', 'standby'], newSites = ['gauges', 'relays', 'switches', 'exam', 'checkin', 'formcheck', 'kitcheck', 'screening', 'hazsweep', 'decon', 'hazmat', 'zero', 'splint', 'patientmove', 'stockup', 'hoppers'];
  L.push('## Second pass: weak and mismatched', '',
    `A human-work review described every job's real steps, tools and difficulty and rated the activity it played: ${REVIEW.length} were weak (${REVIEW.filter(r => r.rating === 'weak').length}) or a mismatch (${mis.length}). This pass built ${newKinds.length} console kinds (${newKinds.map(k => J.KINDS[k].title.toLowerCase()).join(', ')}) and ${newSites.length} work sites (${newSites.map(k => W.SITE_DEFS[k].name.toLowerCase()).join(', ')}), with a new **read** act (let the needle settle, tap E for the first call, hold E for the second) and counted drops for carrying (count the load onto the shelf with E taps), then remapped each job to the activity that mirrors its real work.`,
    `Accepted: ${acc.length} (the activity changed). Disputed: ${REVIEW.length - acc.length} (kept, with the reason). Mismatches left: ${stillMis.length}${stillMis.length ? ' (' + stillMis.map(r => r.label).join('; ') + ')' : ''}.`, '',
    '| billet | job | rating | before | after | review |', '|---|---|---|---|---|---|');
  for (const r of REVIEW) { const x = byKey.get(r.billet + '|' + r.label); L.push(`| ${r.billet} | ${r.label} | ${r.rating} | ${x ? short(x.before) : '?'} | ${x ? short(x.after) : '?'} | ${r.verdict === 'accepted' ? 'accepted' : 'disputed: ' + r.why} |`); }
  L.push(''); }
for (const d of DEPTS) {
  const rs = rows.filter(r => r.dept === d);
  L.push(`## ${DNAME[d]}`, '', NOTES[d], '');
  for (const bk of [...new Set(rs.map(r => r.bk))]) {
    const br = rs.filter(r => r.bk === bk); L.push(`### ${TITLE[bk] || bk} (\`${bk}\`)`, '', '| job | type | room | before | after | verdict |', '|---|---|---|---|---|---|');
    for (const r of br) L.push(`| ${r.label} | ${r.type} | ${r.room} | ${short(r.before)} | ${short(r.after)}${r.extra ? ` <sub>${r.extra}</sub>` : ''} | ${r.verdict} |`);
    L.push('');
  }
}
writeFileSync(join(ROOT, 'docs/job-audit.md'), L.join('\n') + '\n');
if (opt('after')) { const out = rows.map(r => ({ billet: r.bk, label: r.label, type: r.type.replace(/^task \((.+)\)$/, 'task:$1'), new_activity: r.after.startsWith('site:') ? `In-room: ${W.SITE_DEFS[r.after.slice(5)].name}` : `Console: ${J.KINDS[r.after].title}` })); writeFileSync(opt('after'), JSON.stringify(out, null, 1)); console.log(`${opt('after')}: ${out.length} jobs`); }
console.log(`docs/job-audit.md: ${total} jobs, verdicts ${JSON.stringify(vc)}`);
