// Reads every crew-sim profile and writes assets/data/personas.json = { billet: [{ id, traits, quirk }] } (the browser loads this one small file instead of 41 big ones).
//   node tools/build-voices.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), DIR = join(ROOT, 'docs/crew-sim'), out = {};
for (const f of readdirSync(DIR).filter(f => f.endsWith('.json')).sort()) {
  const d = JSON.parse(readFileSync(join(DIR, f), 'utf8')), key = d.billet || f.replace(/\.json$/, '');
  if (!Array.isArray(d.personas) || d.personas.length < 3) { console.error('profile without 3 personas:', f); process.exit(1); }
  out[f.replace(/\.json$/, '')] = d.personas.map(p => ({ id: p.id, traits: p.traits || [], quirk: p.quirk || '' }));
  if (key !== f.replace(/\.json$/, '')) console.warn(`note: ${f} declares billet "${key}"; keyed by file name`);
}
writeFileSync(join(ROOT, 'assets/data/personas.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`wrote assets/data/personas.json: ${Object.keys(out).length} billets`);
