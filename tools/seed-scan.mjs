// Seed-set scan for tools/test.mjs (the full run's smoke on fixed ship / run-seed pairs).  node tools/seed-scan.mjs [--seeds 60]
// Generates every ship (js/gen.js genShip, node only) for run seeds 1..N and picks three pairs that stress different layouts:
//   small  the pair whose smallest deck has the fewest open tiles (cramped decks: probes that need free floor fail first here)
//   ring   a ring / twin hull (Cruller, Tandem): the median pair by smallest deck among those hulls
//   large  the pair with the most open tiles over the whole ship, from a hull class not already picked
// Prints the SEED_SET line to paste into tools/test.mjs. Deterministic: same output on every machine (gen.js uses only its seeded streams).
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { genShip } = await imp('js/gen.js'), { SHIPS } = await imp('js/ships.js');
const i = process.argv.indexOf('--seeds'), N = i < 0 ? 60 : +process.argv[i + 1];
const rows = [];
for (let s = 0; s < SHIPS.length; s++) for (let seed = 1; seed <= N; seed++) {
  const ds = genShip(SHIPS[s], seed), open = ds.map(d => d.openTiles.length);
  rows.push({ ship: s, name: SHIPS[s].name, hull: SHIPS[s].hull, seed, min: Math.min(...open), total: open.reduce((a, b) => a + b, 0), decks: ds.length });
}
const small = rows.slice().sort((a, b) => a.min - b.min || a.ship - b.ship || a.seed - b.seed)[0];
const rings = rows.filter(r => r.hull === 'cruller' || r.hull === 'tandem').sort((a, b) => a.min - b.min || a.ship - b.ship || a.seed - b.seed), ring = rings[rings.length >> 1];
const large = rows.filter(r => r.hull !== small.hull && r.hull !== ring.hull).sort((a, b) => b.total - a.total || a.ship - b.ship || a.seed - b.seed)[0];
for (const [k, r] of [['small', small], ['ring', ring], ['large', large]]) console.log(`${k.padEnd(5)} ship ${r.ship} ${r.name} (${r.hull}, ${r.decks} decks) run seed ${r.seed}: smallest deck ${r.min} open tiles, ${r.total} in all`);
console.log(`const SEED_SET = [[${small.ship}, ${small.seed}], [${ring.ship}, ${ring.seed}], [${large.ship}, ${large.seed}]];`);
