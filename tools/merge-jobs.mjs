// Registry builder for job modules: scans js/jobs/<billet>__<slug>.js, refuses id / title / file-name problems and fingerprint collisions
// (near-duplicate mechanics) between any two modules or with the old shared mechanics, then writes js/jobs/index.js (every module bundled into
// that one file, so the browser and node load the same registry in one request). Run after merging a batch of authored modules:
//   node tools/merge-jobs.mjs            check + write js/jobs/index.js
//   node tools/merge-jobs.mjs --check    check only (exit 1 on a collision)
// Full validation (auto-play etc.) of a batch is tools/check-jobs.mjs; this tool only needs the modules to import.
import { writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { listJobFiles, imp, nearDup, BASE, JOBDIR, catalogue, bundleSource } from './jobcheck-lib.mjs';

const files = listJobFiles(), mods = [], errs = [], cat = await catalogue(), K = await imp('js/jobs/kit.js');
for (const f of files) { try { const m = (await imp(f)).default; if (!m?.id || !m.fingerprint) { errs.push(`${basename(f)}: not a job module (define({...}) with a fingerprint)`); continue; } mods.push({ m, file: basename(f) }); } catch (e) { errs.push(`${basename(f)}: does not import: ${e.message}`); } }
const ids = new Map(), titles = new Map();
for (const { m, file } of mods) {
  const key = `${m.job.billet}|${m.job.label}|${m.job.type}`; if (!cat.jobs.has(key)) errs.push(`${file}: job ${key} is not in duties.json`);
  if (file !== K.fileFor(m.job.billet, m.job.label, m.job.type)) errs.push(`${file}: file name should be ${K.fileFor(m.job.billet, m.job.label, m.job.type)}`);
  if (ids.has(m.id)) errs.push(`${file}: same job as ${ids.get(m.id)}`); ids.set(m.id, file);
  if (titles.has(m.title)) errs.push(`${file}: title "${m.title}" also used by ${titles.get(m.title)}`); titles.set(m.title, file);
  for (const b of BASE) { const d = nearDup(m.fingerprint, b); if (d) errs.push(`${file}: near duplicate of the old mechanic ${b.id} (${d})`); }
}
for (let i = 0; i < mods.length; i++) for (let j = i + 1; j < mods.length; j++) { const d = nearDup(mods[i].m.fingerprint, mods[j].m.fingerprint); if (d) errs.push(`fingerprint collision: ${mods[i].file} vs ${mods[j].file} (${d})`); }
if (errs.length) { console.log('merge refused:\n  - ' + errs.join('\n  - ')); process.exit(1); }
if (!process.argv.includes('--check')) {
  const src = bundleSource(mods.map(({ file }) => join(JOBDIR, file)));   // one file, every module inlined (tools/jobcheck-lib.mjs bundleSource)
  writeFileSync(join(JOBDIR, 'index.js'), src);
}
console.log(`${mods.length} job modules, no collisions${process.argv.includes('--check') ? '' : ' — wrote js/jobs/index.js'}`);
