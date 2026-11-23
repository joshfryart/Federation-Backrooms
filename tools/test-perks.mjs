// Perk synergies + career milestones (js/perks.js, SYNERGIES / META_UNLOCKS in js/data.js): node only.
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), imp = (p) => import(pathToFileURL(join(ROOT, p)).href);

export async function perkTests(fail) {
  const { PERKS, SYNERGIES, META_UNLOCKS } = await imp('js/data.js');
  const P = await imp('js/perks.js');
  const ck = (c, m) => { if (!c) fail('perks: ' + m); return !!c; };
  const ids = new Set(PERKS.map(p => p.id));
  const known = new Set(Object.keys(P.synergyFx({})));
  ck(new Set(SYNERGIES.map(s => s.id)).size === SYNERGIES.length, 'synergy ids unique');
  for (const s of SYNERGIES) {
    ck(Object.keys(s.needs).length >= 2 || Object.values(s.needs).some(n => n > 1), `${s.id}: needs more than one thing`);
    for (const [id, n] of Object.entries(s.needs)) ck(ids.has(id) && n >= 1 && n <= PERKS.find(p => p.id === id).max, `${s.id}: need ${id} x${n} is a real, reachable perk level`);
    for (const k of Object.keys(s.fx)) ck(known.has(k), `${s.id}: effect ${k} is known`);
    ck(P.activeSynergies(s.needs).some(a => a.id === s.id), `${s.id}: active at exactly its needs`);
    for (const [id, n] of Object.entries(s.needs)) ck(!P.synergyActive(s, { ...s.needs, [id]: n - 1 }), `${s.id}: inactive without ${id} x${n}`);
  }
  for (const u of META_UNLOCKS) ck(ids.has(u.perk) && ['runs', 'bestDeck', 'kills', 'wins'].includes(u.key), `meta ${u.perk}: real perk and a fb_meta counter`);
  const n0 = P.synergyFx({}); ck(n0.stepNoise === 1 && n0.stunBonus === 0 && n0.lifeScanR === 18 && n0.knockMul === 1, 'no perks: neutral effects');
  ck(P.synergyFx(null).staminaRegen === 1, 'null perks tolerated');
  ck(P.synergyFx({ boots: 2, ghost: 1 }).stepNoise === 0.6 && P.synergyFx({ boots: 1, ghost: 1 }).stepNoise === 1, 'ghost protocol needs 2 boots + silent running');
  const all = Object.fromEntries(PERKS.map(p => [p.id, p.max])), f = P.synergyFx(all);
  ck(P.activeSynergies(all).length === SYNERGIES.length, 'every synergy active with every perk maxed');
  ck(Math.abs(f.knockMul - 0.5) < 1e-9 && f.stunBonus === 2 && f.tearBonus === 0.5 && f.lifeScanR === 26 && Math.abs(f.lureMul - 1.2) < 1e-9 && Math.abs(f.staminaRegen - 1.25) < 1e-9, 'maxed: combined effect values');
  ck(P.completes({ boots: 1, ghost: 1 }, 'boots').some(s => s.id === 'ghost_protocol'), 'completes: second boots finishes Ghost Protocol');
  ck(P.completes({ boots: 2, ghost: 1 }, 'boots').length === 0, 'completes: already active is not reported again');
  ck(P.completes({}, 'ghost').length === 0, 'completes: nothing on a first pick');
  const sw = SYNERGIES.find(s => s.id === 'second_wind'), miss = P.synergyMissing(sw, { legs: 1 });
  ck(miss.hypo === 2 && miss.legs === 1, 'missing levels listed');
  ck(P.metaUnlocked({ runs: 0, bestDeck: 0, kills: 0, wins: 0 }).length === 0, 'fresh career: nothing unlocked');
  ck(P.metaUnlocked({ runs: 5, bestDeck: 3, kills: 8, wins: 1 }).length === META_UNLOCKS.length, 'full career: all unlocked');
  ck(P.metaUnlocked({ bestDeck: 3 }).map(u => u.perk).join() === 'boots', 'deck 3 alone grants boots');
  const c = P.careerSummary({ runs: 2, bestDeck: 2, kills: 20, wins: 0 }, 4), cell = c.milestones.find(m => m.perk === 'cell');
  ck(c.bestDeck === 4 && c.runs === 2 && cell.done && cell.have === 8 && !c.milestones.find(m => m.perk === 'boots').done, 'careerSummary: best deck from save.best, progress capped, done flags');
  const html = P.careerHTML({ runs: 1, bestDeck: 1, kills: 0, wins: 0 }, 1);
  ck(html.includes('Soft-Soled Boots') && html.includes('Ghost Protocol') && html.includes('0 / 8'), 'careerHTML lists milestones, progress and synergies');
  ck(P.careerHTML(undefined, undefined).includes('cr-stats'), 'careerHTML tolerates no data');
}
