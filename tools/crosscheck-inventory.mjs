// Cross-checks the ship inventory against what the game actually places (props in js/world.js buildProp, ROOM_DECOR wall fixtures).
// For each game item: a pattern and the plan space ids where it must appear; prints how many inventory rows match there. Exit 1 on any miss.
import fs from 'fs';
const dir = 'docs/ship-inventory/', spaces = {};
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) { const j = JSON.parse(fs.readFileSync(dir + f, 'utf8')); for (const s of j.spaces) spaces[s.id] = s; }
// [game kind, pattern, space ids]
const CHECKS = [
  ['prop console', /console|station/i, [1, 4, 37]], ['prop chair (command chair)', /command chair|captain'?s chair/i, [1]], ['prop viewscreen', /viewscreen|main screen|viewer|panoramic .*window/i, [1, 5]],
  ['prop warpcore', /reactor|core/i, [45]], ['prop shuttle', /shuttle/i, [55]], ['prop holocube', /holo.*(cube|emitter|grid)|emitter/i, [42]], ['prop pad', /transporter pad|pad/i, [40, 41]],
  ['prop bunk', /bunk|berth|bed/i, [9, 10]], ['prop table', /table/i, [16]], ['prop biobed', /bio-?bed|bed, (patient|ward)|patient bed|diagnostic bed/i, [20]], ['prop crate', /crate|container/i, [60]],
  ['prop tree / plant', /tree|plant|shrub/i, [31]], ['prop lonechair', /chair|armchair/i, [9, 13]], ['prop cart', /cart|trolley/i, [60, 15]], ['prop replicator', /replicator/i, [18, 16]],
  ['decor monitor (bridge)', /monitor|display|screen/i, [1]], ['decor comm panel', /comm|intercom/i, [1, 62]], ['decor gauges', /gauge/i, [44]], ['decor pipes', /pipe|conduit/i, [44, 62]],
  ['decor toolboard', /tool ?board|tool wall|pegboard|shadow board/i, [44, 55]], ['decor breaker', /breaker/i, [44, 62]], ['decor medcab', /cabinet/i, [20]], ['decor kit', /first.?aid/i, [20, 62]],
  ['decor locker', /locker/i, [20, 9]], ['decor menu board', /menu/i, [16]], ['decor shelf', /shel(f|ves)/i, [16, 9]], ['decor fountain', /fountain|water (cooler|dispenser)/i, [16, 62]],
  ['decor coil (beam room)', /coil|emitter/i, [40]], ['decor hose', /hose/i, [55]], ['decor rack', /rack/i, [60, 55]], ['decor extinguisher', /extinguisher/i, [55, 60, 62]],
  ['decor picture', /picture|photo|print|poster|painting/i, [9]], ['decor mirror', /mirror/i, [9]], ['decor planter', /planter|grow bed|plant/i, [31]], ['decor vent grille', /vent|grille|grill/i, [62]],
];
let miss = 0;
for (const [name, re, ids] of CHECKS) {
  const parts = ids.map(id => { const s = spaces[id]; if (!s) return `${id}:no-space`; const n = s.rows.filter(r => re.test(r[0])).length; return `${id}:${n}`; });
  const ok = ids.every(id => spaces[id] && spaces[id].rows.some(r => re.test(r[0]))); if (!ok) miss++;
  console.log((ok ? 'ok   ' : 'MISS ') + name.padEnd(28) + parts.join('  '));
}
console.log(miss ? `${miss} game items missing from at least one expected space` : 'all game items covered');
process.exit(miss ? 1 : 0);
