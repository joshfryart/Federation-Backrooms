// Validates docs/ship-inventory/*.json: shape, allowed values, duplicate rows within a space. Exit 1 on any problem.
// usage: node tools/check-inventory.mjs [file…]
import fs from 'fs';
const dir = 'docs/ship-inventory/', files = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => dir + f);
const W = (s) => new Set(s.split(' '));
const A = { 2: W('floor low mid eye high ceiling inside'), 3: W('floor wall ceiling table shelf rack locker hanging built-in portable worn'), 4: W('tiny small medium large huge'), 5: W('command flight operations engineering security sciences medical services crew shared'), 6: new Set([...W('alert helm dampers computer comms transport reactor eps gravity lifts life coolant lighting security armory sensors hydro sickbay emh replicators holo'), '']) };
let problems = 0, total = 0;
for (const f of files) {
  let j; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.log(f, 'INVALID JSON', e.message.slice(0, 60)); problems++; continue; }
  let n = 0, bad = 0, dup = 0;
  for (const s of j.spaces) { const seen = new Set(), areas = new Set(s.areas || []);
    for (const r of s.rows) { n++;
      if (r.length !== j.cols.length || typeof r[0] !== 'string' || !Number.isInteger(r[1])) { bad++; console.log(f, s.id, 'shape', JSON.stringify(r).slice(0, 90)); continue; }
      for (const k in A) if (!A[k].has(r[k])) { bad++; console.log(f, s.id, 'col', j.cols[k], JSON.stringify(r[k]), '←', r[0].slice(0, 50)); }
      const key = r[0] + '|' + r[8]; if (seen.has(key)) { dup++; } seen.add(key);
    } }
  total += n; problems += bad;
  console.log(`${f.replace(dir, '')}: ${j.spaces.length} spaces, ${n} rows, ${bad} bad, ${dup} duplicate`);
}
console.log('total rows', total, problems ? `PROBLEMS ${problems}` : 'OK');
process.exit(problems ? 1 : 0);
