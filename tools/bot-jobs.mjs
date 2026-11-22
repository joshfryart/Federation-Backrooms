// Job bot: plays one role's shift (billet x mission: 3-4 duty loops + 2-4 mission tasks, each a js/jobs module) end to end in the real game, headless.
//   node tools/bot-jobs.mjs --role id|random|all --mission m|all --seed N --ship i --port 0 --out results/bots/<runId> --repeat 1 --shots --task <id> [--walk] [--cap 60]
// Per task: loops first, then mission tasks by `at`; made available (due / active), routed with goJob, teleported into the room (--walk: reserved,
// currently the same), startJob, played with the module's own hint, capped by wall time (--cap seconds, default 60). Pass = started + win + proper +
// overlay closed + Duty state advanced. Failures are re-run 3x (flaky vs consistent) and the module checked with tools/check-jobs.mjs (module vs integration).
// Writes <out>/<role>/<mission>.json (+ <role>/summary.json, <out>/summary.json) and PNGs with --shots. Exit 1 when any task is not pass/skip.
// One Chromium + one static server (own port) per process: run several processes in parallel for concurrency.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { startServer, launch, openShift, runShift, allBillets, MISSIONS, ROOT } from './bot-lib.mjs';

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] ?? d); }, flag = (k) => argv.includes('--' + k);
const seed = +arg('seed', 1) >>> 0, ship = arg('ship', null) == null ? null : +arg('ship'), repeat = Math.max(1, +arg('repeat', 1)), shots = flag('shots'), cap = +arg('cap', 60) * 1000, taskSel = arg('task', null);
const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19), out = resolve(ROOT, arg('out', `results/bots/${runId}`));
const billets = allBillets(); let rolesArg = arg('role', 'random'), missArg = arg('mission', 'all');
const hash = (s) => { let h = seed ^ 0x9e3779b9; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0; return h; };
const roles = rolesArg === 'all' ? billets : rolesArg === 'random' ? [billets[hash('role') % billets.length]] : rolesArg.split(',');
const missions = missArg === 'all' ? MISSIONS : missArg === 'random' ? [MISSIONS[hash('mission') % MISSIONS.length]] : missArg.split(',');
for (const r of roles) if (!billets.includes(r)) { console.error('unknown role ' + r + ' (' + billets.join(' ') + ')'); process.exit(2); }
for (const m of missions) if (!MISSIONS.includes(m)) { console.error('unknown mission ' + m + ' (' + MISSIONS.join(' ') + ')'); process.exit(2); }

const { server, port: P } = await startServer(+arg('port', 0)), browser = await launch();
const count = (ts) => ts.reduce((a, t) => (a[t.status] = (a[t.status] || 0) + 1, a), {});
const all = []; let bad = 0;
console.log(`bot-jobs: roles=${roles.join(',')} missions=${missions.join(',')} seed=${seed} ship=${ship ?? 'auto'} port=${P} out=${relative(ROOT, out)}`);
try {
  for (const role of roles) {
    const roleSum = { role, shifts: {} }; mkdirSync(join(out, role), { recursive: true });
    for (const mission of missions) for (let rep = 0; rep < repeat; rep++) {
      const s = (seed + rep) >>> 0, tag = rep ? `.r${rep}` : '', t0 = Date.now(); let page = null, res;
      const replay = (it) => `node tools/bot-jobs.mjs --role ${role} --mission ${mission} --seed ${s}${ship != null ? ' --ship ' + ship : ''} --task ${it.id}${shots ? ' --shots' : ''}`;
      try {
        const o = await openShift(browser, P, { role, mission, seed: s, ship }); page = o.page;
        const shot = async (pg, it, name) => { const dir = join(out, role, mission + tag); mkdirSync(dir, { recursive: true }); const f = join(dir, `${it.id}-${name}.png`); await pg.screenshot({ path: f }); return relative(out, f); };
        res = await runShift(page, { mission, task: taskSel, shots, shot, capMs: cap, walk: flag('walk'), replay, log: (r) => console.log(`  ${role}/${mission} ${r.kind} ${r.id} ${r.status}${r.flaky ? ' (' + r.flaky + ', ' + r.category + ')' : ''} q=${r.quality} faults=${r.faults} ${r.host || '-'} ${r.wallMs}ms  ${r.label}`) });
        res.errors = o.errs.slice(0, 20);
        if (res.meta.billet !== role) { res.skipped = `billet ${role} not aboard this ship (got ${res.meta.billet}); tasks ran as ${res.meta.billet}`; for (const t of res.tasks) { t.status = 'skip'; t.notes.push(res.skipped); } }
      } catch (e) { res = { meta: { billet: role, mission }, tasks: [], fatal: String(e.message || e).split('\n')[0] }; bad++; console.log(`  ${role}/${mission} FATAL ${res.fatal}`); }
      finally { await page?.evaluate(() => __bot?.stop?.()).catch(() => { }); await page?.close().catch(() => { }); }
      const rec = { role, mission, seed: s, ship, runId, wallMs: Date.now() - t0, counts: count(res.tasks), ...res };
      writeFileSync(join(out, role, `${mission}${tag}.json`), JSON.stringify(rec, null, 1)); all.push(rec); roleSum.shifts[mission + tag] = rec.counts;
      bad += res.tasks.filter(t => !['pass', 'skip'].includes(t.status)).length;
    }
    writeFileSync(join(out, role, 'summary.json'), JSON.stringify(roleSum, null, 1));
  }
} finally { await browser.close().catch(() => { }); server.close(); }
const total = count(all.flatMap(r => r.tasks)); writeFileSync(join(out, 'summary.json'), JSON.stringify({ runId, seed, ship, counts: total, shifts: all.map(r => ({ role: r.role, mission: r.mission, counts: r.counts, fatal: r.fatal })) }, null, 1));
console.log('summary:', JSON.stringify(total), '->', relative(ROOT, out)); process.exit(bad ? 1 : 0);
