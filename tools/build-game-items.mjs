// Compiles docs/ship-inventory/*.json into assets/data/ship-items.json: what a player finds when searching each kind of wall fixture,
// per game room type. Keeps the game file small (capped per room × fixture) and deterministic.  usage: node tools/build-game-items.mjs
import fs from 'fs';
const dir = 'docs/ship-inventory/', spaces = {};
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) for (const s of JSON.parse(fs.readFileSync(dir + f, 'utf8')).spaces) spaces[s.id] = s;
// game room type → plan space ids that feed it
const ROOM_SPACES = { bridge: [1, 4], engineering: [44, 46, 47, 48, 52, 53], sickbay: [20, 21, 22], mess: [15, 16, 18], transporter: [40, 41], shuttlebay: [55, 56, 57], cargo: [60, 61, 109], holodeck: [42, 98], quarters: [9, 10, 7, 67, 87], arboretum: [31, 32], corridor: [62, 66, 83, 84], jefferies: [63] };
// searchable fixture kinds → which inventory rows can be inside/on them
const MEDICAL = /bandage|gauze|splint|syringe|hypo|antiseptic|gloves|dressing|medic|first.?aid|ointment|tablet|analges|saline|swab|thermometer|tourniquet|oxygen mask|burn|suture|forceps|cuff/i;
const TOOLS = /wrench|screwdriver|pliers|hammer|spanner|socket|drill|cutter|crimp|multimeter|torch|flashlight|clamp|file\b|chisel|saw|allen|hex key|tape|gauge|probe|solder|driver|bit set|ratchet|level\b/i;
const HOSE = /hose|nozzle|coupling|reel|valve|clamp|fitting|strap|tether|line/i;
const KINDS = {
  locker: r => r[3] === 'locker' || (r[2] === 'inside' && !MEDICAL.test(r[0])),
  medcab: r => MEDICAL.test(r[0]), kit: r => MEDICAL.test(r[0]),
  shelf: r => r[3] === 'shelf', rack: r => r[3] === 'rack' || r[3] === 'shelf',
  toolboard: r => TOOLS.test(r[0]), hose: r => HOSE.test(r[0]),
};
const carry = (r) => !['ceiling', 'built-in', 'floor'].includes(r[3]) && r[4] !== 'huge' && !/\(decor|decor '|emitter, ceiling|ceiling/i.test(r[0]);
const CAP = 40, seed = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const rng = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const out = { v: 1, rooms: {} }; let n = 0;
for (const [room, ids] of Object.entries(ROOM_SPACES)) {
  const rows = ids.flatMap(id => (spaces[id]?.rows || [])).filter(carry);
  out.rooms[room] = {};
  for (const [kind, ok] of Object.entries(KINDS)) {
    let pool = rows.filter(r => ok(r) && r[4] !== 'huge' && r[4] !== 'large'); if (pool.length < 6) pool = rows.filter(r => ok(r));   // small things fit in fixtures; fall back to anything that matches
    if (pool.length < 6 && !['medcab', 'kit', 'toolboard', 'hose'].includes(kind)) pool = rows.filter(r => r[2] === 'inside' || r[3] === 'shelf');
    const R = rng(seed(room + kind)); const a = pool.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    const items = a.slice(0, CAP).map(r => [r[0], Math.min(r[1], 99)]); if (items.length) { out.rooms[room][kind] = items; n += items.length; }
  }
}
fs.writeFileSync('assets/data/ship-items.json', JSON.stringify(out));
console.log('assets/data/ship-items.json', n, 'entries', (fs.statSync('assets/data/ship-items.json').size / 1024).toFixed(0) + ' KB');
for (const [r, k] of Object.entries(out.rooms)) console.log(r.padEnd(12), Object.entries(k).map(([a, b]) => a + ':' + b.length).join(' '));
