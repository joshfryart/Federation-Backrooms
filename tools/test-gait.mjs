// Node unit tests: gait patterns.  node tools/test-gait.mjs
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
export async function gaitTests(fail) {
  const { SHIPS } = await imp('js/ships.js'), C = await imp('js/crew.js'), V = await imp('js/voice.js'), Gt = await imp('js/gait.js'); await V.loadPersonas?.().catch?.(() => {});
  const ck = (c, m) => { if (!c) fail('gait: ' + m); return !!c; }, seen = { pace: new Set(), style: new Set(), car: new Set(), habit: new Set(), combo: new Set() };
  for (const ship of [SHIPS[0], SHIPS[3], SHIPS[6]]) { const r = C.makeComplement(ship, 4); for (const p of r.people) {
    const g = Gt.makeGait(p, 4); seen.pace.add(g.pace); seen.style.add(g.style); seen.car.add(g.carriage); seen.habit.add(g.habit); seen.combo.add(Gt.describeGait(g).split(' (')[0]);
    ck(g.v > 0.7 && g.v < 2.4, 'speed range ' + g.v); const n = Gt.gaitNow(g, {}), a = Gt.gaitNow(g, { alert: 3 }); ck(n.clip === (g.style === 'formal' ? 'walk_formal' : 'walk'), 'clip'); ck(a.clip === 'jog' && a.v > n.v, 'alert jogs');
    ck(n.timeScale >= 0.5 && n.timeScale <= 1.7, 'timeScale'); ck(JSON.stringify(Gt.makeGait(p, 4)) === JSON.stringify(g), 'deterministic');
  } }
  ck(seen.pace.size >= 4 && seen.style.size === 2 && seen.car.size >= 4 && seen.habit.size >= 3, `parts all used ${[...seen.pace]} ${[...seen.car]}`); ck(seen.combo.size >= 25, 'many distinct combinations ' + seen.combo.size);
  return { combos: seen.combo.size };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) { const errs = []; const r = await gaitTests(m => errs.push(m)); console.log(errs.length ? errs.join('\n') : 'gait OK ' + JSON.stringify(r)); process.exit(errs.length ? 1 : 0); }
