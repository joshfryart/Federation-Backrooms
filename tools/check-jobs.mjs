// Job-module validator (docs/procedures.md "Validator workflow").
//   node tools/check-jobs.mjs js/jobs/a.js js/jobs/b.js ...   check these files (each against every other module in js/jobs + the old mechanics)
//   node tools/check-jobs.mjs --all                            check every module
//   node tools/check-jobs.mjs --report                         coverage: jobs without a module, per department / host / input mix
//   node tools/check-jobs.mjs --brief co,xo                    what to author: the human-work notes + file name of each job of these billets still without a module
//   --seeds N  (default 25)   --quiet  (errors only)
// Exit code 1 on any error. Each file is checked in isolation (its own imports, its own auto-play), so parallel authors can run it on their
// own batch; the fingerprint check reads the other modules' metadata only.
import { basename, resolve } from 'node:path';
import { listJobFiles, checkFile, catalogue, imp, BILLET_DEPT, DEPTS, inputSet } from './jobcheck-lib.mjs';

const args = process.argv.slice(2), flag = (f) => args.includes(f), seeds = +(args[args.indexOf('--seeds') + 1] || 0) || 25;
const files = flag('--all') ? listJobFiles() : args.filter(a => a.endsWith('.js')).map(a => resolve(a));
async function meta(fs) { const out = []; for (const f of fs) { try { const m = (await imp(f)).default; if (m?.id) out.push({ id: m.id, title: m.title, fingerprint: m.fingerprint, file: basename(f), host: m.host, dept: m.dept, job: m.job }); } catch { /* reported when that file is checked */ } } return out; }

let bad = 0;
if (files.length) {
  const others = await meta([...new Set([...listJobFiles(), ...files])]), t0 = Date.now();
  for (const f of files) {
    const r = await checkFile(f, { others, seeds });
    if (r.errors.length) { bad++; console.log(`✗ ${basename(f)}\n  - ${r.errors.join('\n  - ')}`); }
    else if (!flag('--quiet')) console.log(`✓ ${basename(f)}  ${r.mod.host} · ${r.mod.fingerprint.verb} · ${r.mod.fingerprint.input}  (wins ${r.stats.win}, bad ${r.stats.bad}, idle ${r.stats.idle}, slowest win ${Math.round(r.stats.maxT * 100)} % of limit, ${r.stats.ms} ms)`);
    if (r.warnings.length && !flag('--quiet')) console.log(`  ! ${r.warnings.join('\n  ! ')}`);
  }
  console.log(`${files.length - bad}/${files.length} modules OK (${Date.now() - t0} ms)`);
}
if (flag('--report')) {
  const cat = await catalogue(), mods = await meta(listJobFiles()), have = new Set(mods.map(m => `${m.job.billet}|${m.job.label}|${m.job.type}`));
  const per = {}; for (const [k, j] of cat.jobs) { const d = BILLET_DEPT[j.billet]; (per[d] ||= { jobs: 0, done: 0, console: 0, room: 0 }).jobs++; if (have.has(k)) { per[d].done++; per[d][mods.find(m => `${m.job.billet}|${m.job.label}|${m.job.type}` === k).host]++; } }
  console.log(`coverage: ${have.size} / ${cat.jobs.size} jobs have their own module (${cat.jobs.size - have.size} still on the old shared mechanics)`);
  for (const d of DEPTS) { const p = per[d] || {}; console.log(`  ${d.padEnd(12)} ${String(p.done || 0).padStart(3)} / ${String(p.jobs || 0).padStart(3)}   console ${p.console || 0} · room ${p.room || 0}`); }
  const inputs = {}; for (const m of mods) { const k = inputSet(m.fingerprint?.input); inputs[k] = (inputs[k] || 0) + 1; }
  console.log('input schemes: ' + Object.entries(inputs).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · '));
  const top = Object.entries(inputs).sort((a, b) => b[1] - a[1])[0]; if (top && mods.length >= 20 && top[1] / mods.length > 0.25) console.log(`  ! input scheme '${top[0]}' is ${Math.round(100 * top[1] / mods.length)} % of modules (keep any one scheme under 25 %)`);
  if (flag('--missing')) for (const [k] of cat.jobs) if (!have.has(k)) console.log('  missing: ' + k);
}
// --brief co,xo : the human-work notes (tools/job-human.json) for every job of these billets that has no module yet, with its file name
if (flag('--brief')) {
  const { readFileSync } = await import('node:fs'), K = await imp('js/jobs/kit.js'), want = (args[args.indexOf('--brief') + 1] || '').split(','), mods = await meta(listJobFiles()), have = new Set(mods.map(m => m.id));
  for (const j of JSON.parse(readFileSync(new URL('./job-human.json', import.meta.url), 'utf8'))) if (want.includes(j.billet) && !have.has(K.jobId(j.billet, j.label, j.type)))
    console.log(`\n## ${K.fileFor(j.billet, j.label, j.type)}\njob: { billet: '${j.billet}', label: ${JSON.stringify(j.label)}, type: '${j.type}' }  room: ${j.room}  dept: ${BILLET_DEPT[j.billet]}  (today: ${j.current})\nsteps:\n${j.human_steps.map(x => '  - ' + x).join('\n')}\ntools: ${j.tools.join('; ')}\nhard: ${j.what_makes_it_hard}\nideal: ${j.ideal_interaction}`);
}
if (!files.length && !flag('--report') && !flag('--brief')) console.log('usage: node tools/check-jobs.mjs <files...> | --all | --report [--missing] [--seeds N] [--quiet]');
process.exit(bad ? 1 : 0);
