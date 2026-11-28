// Graphics gate: node tools/gfx-gate.mjs [--skip-test] [--skip-load] [--skip-perf]
// Runs (1) node tools/test.mjs --gate, (2) tools/perf.mjs (draw calls, tris, programs, lights), (3) tools/loadtime.mjs (title load, begin -> Enter) and prints PASS / FAIL per
// limit from tools/gfx-budget.json. Browser steps run one at a time under flock /tmp/gfx-probe.lock when `flock` exists. Exit 1 on any FAIL.
// Draw calls: average of the perf rows (the 6 spot rows, as perf.mjs AVG) must stay within baseline +drawCallsPct%. Time limits scale with env GFX_TIME_SCALE (default 1) for slower boxes.
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), argv = process.argv.slice(2), B = JSON.parse(readFileSync(join(ROOT, 'tools/gfx-budget.json'), 'utf8')), L = B.limits, SC = +(process.env.GFX_TIME_SCALE || 1);
const hasFlock = spawnSync('flock', ['--version']).status === 0;
const sh = (cmd, args, capture) => { const a = hasFlock ? ['/tmp/gfx-probe.lock', cmd, ...args] : null; const r = spawnSync(hasFlock ? 'flock' : cmd, a || args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' }); return r; };
const rows = []; const check = (name, ok, detail) => { rows.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`); };
if (!argv.includes('--skip-test')) { const r = sh('node', ['tools/test.mjs', '--gate'], false); check('test --gate', r.status === 0, `exit ${r.status}`); }
if (!argv.includes('--skip-perf')) {
  const r = sh('node', ['tools/perf.mjs'], true), out = (r.stdout || '').split('\n'); const data = out.filter(l => l.startsWith('{')).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const spots = data.filter(d => !d.people), avg = k => spots.reduce((a, d) => a + d[k], 0) / (spots.length || 1);
  if (!spots.length) check('perf', false, 'no perf rows (perf.mjs failed)');
  else {
    const calls = avg('calls'), maxCalls = B.baseline.perf.avgCalls * (1 + L.drawCallsPct / 100), progs = Math.max(...spots.map(d => d.programs)), tris = avg('tris');
    check('draw calls (avg of spots)', calls <= maxCalls, `${calls.toFixed(1)} <= ${maxCalls.toFixed(1)} (baseline ${B.baseline.perf.avgCalls} +${L.drawCallsPct}%)`);
    check('programs (max)', progs <= L.maxPrograms, `${progs} <= ${L.maxPrograms} (baseline ${B.baseline.perf.maxPrograms})`);
    const lights = Math.max(...spots.map(d => d.sceneLights)); check('scene lights (must not change)', lights === L.lights, `${lights} == ${L.lights}`);
    console.log(`info  tris avg ${tris.toFixed(0)} (baseline ${B.baseline.perf.avgTris}), crowd rows ${data.filter(d => d.people).map(d => d.calls + 'c/' + d.tris + 't').join(' ')}`);
  }
}
if (!argv.includes('--skip-load')) {
  const f = join(mkdtempSync(join(tmpdir(), 'gfx-')), 'load.json'); sh('node', ['tools/loadtime.mjs', '--json', f], true);
  if (!existsSync(f)) check('load', false, 'loadtime.mjs wrote no result');
  else { let r = JSON.parse(readFileSync(f, 'utf8')); r = Array.isArray(r) ? r[0] : r;
    check('title load', r.bootWallS <= L.titleLoadS * SC, `${r.bootWallS}s <= ${(L.titleLoadS * SC).toFixed(2)}s (baseline ${B.baseline.load.titleLoadS}s)`);
    check('begin -> Enter', r.boardWallS <= L.beginToEnterS * SC, `${r.boardWallS}s <= ${(L.beginToEnterS * SC).toFixed(2)}s (baseline ${B.baseline.load.beginToEnterS}s)`); }
}
console.log(rows.every(Boolean) ? 'GATE PASS' : 'GATE FAIL'); process.exit(rows.every(Boolean) ? 0 : 1);
