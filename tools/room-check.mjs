// Per-room layout check (node only, no browser): node tools/room-check.mjs <type> [--n 160] [--baseline [file]] [--compare [file]] [--strict]
//   <type>       a key of ROOM_LAYOUTS (js/rooms/index.js), or _tall for the tall-room shell (pillars / catwalks)
//   default      generates many decks (every ship, every deck, require on/off, liminal on some, plus decks weighted toward <type>) and asserts, for
//                every room of that type: chips and the exit reachable,
//                no prop on a doorway, every wall prop keeps a reachable side, and the same seed gives the same layout.
//   --baseline   write every room's props on the same deck set (all types) to file (default /tmp/room-baseline.json); run this BEFORE editing
//   --strict     also fail on room tiles walled over because props boxed them in (legacy layouts with bare put() still do this: WARN by default)
//   --compare    regenerate and fail if any room of ANOTHER type changed (props, or where rooms landed); run after editing <type>
// Exit code 1 on any failure. See docs/rooms/README.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { generate } = await import('../js/gen.js');
const { SHIPS, deckOptions } = await import('../js/ships.js');
const { ROOMS } = await import('../js/data.js');
const { ROOM_LAYOUTS, TALL } = await import('../js/rooms/index.js');

const argv = process.argv.slice(2), flag = (k) => argv.includes('--' + k);
const val = (k, d) => { const i = argv.indexOf('--' + k); if (i < 0) return d; const v = argv[i + 1]; return v && !v.startsWith('--') ? v : d; };
const type = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && ['n', 'baseline', 'compare'].includes(argv[i - 1].replace(/^--/, '')) && argv[i - 1].startsWith('--')));
if (!type || (!ROOM_LAYOUTS[type] && type !== '_tall')) { console.log(`usage: node tools/room-check.mjs <type> [--n N] [--baseline [file]] [--compare [file]]\n  types: ${Object.keys(ROOM_LAYOUTS).join(' ')} _tall`); process.exit(2); }
const N = +val('n', 160), BASE = val('baseline', null) ?? (flag('baseline') ? join(tmpdir(), 'room-baseline.json') : null), CMP = val('compare', null) ?? (flag('compare') ? join(tmpdir(), 'room-baseline.json') : null);
const STRICT = flag('strict'), D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const mine = (r) => type === '_tall' ? TALL.isTall(r) : r.type === type;
const boostTypes = type === '_tall' ? [...TALL.TALL_TYPES] : [type];

// the deck set: fixed (same for --baseline and --compare, independent of <type> except the boosted half, which every type's baseline includes)
function cases() {
  const out = [];
  for (let i = 0; i < N; i++) {
    const ship = SHIPS[i % SHIPS.length], sd = i % ship.decks, seed = i * 4057 + 17;
    out.push({ id: `n${i}`, deck: sd, seed, opts: { ...deckOptions(ship, sd, { require: i % 2 === 0 }), liminal: i % 4 === 3 } });
  }
  // decks weighted toward each room type, so rare types get enough samples; all types are always built so a baseline covers every type
  for (const t of [...Object.keys(ROOM_LAYOUTS)]) for (let i = 0; i < Math.max(8, N >> 4); i++) {
    const ship = SHIPS[(i * 3 + 1) % SHIPS.length], sd = i % ship.decks, o = deckOptions(ship, sd), w = { ...(o.weights || Object.fromEntries(Object.entries(ROOMS).map(([k, v]) => [k, v.weight]))) };
    w[t] = (w[t] || 0) + 6; delete w.jefferies;
    out.push({ id: `${t}${i}`, deck: sd + (i % 3), seed: i * 7919 + t.length * 131 + 5, opts: { ...o, weights: w } });
  }
  return out;
}
const snap = (d) => d.rooms.map(r => ({ key: `${r.type}@${r.x},${r.y},${r.w}x${r.h}`, type: r.type, tall: TALL.isTall(r),
  props: d.props.filter(p => p.tx >= r.x && p.tx < r.x + r.w && p.ty >= r.y && p.ty < r.y + r.h).map(p => `${p.kind}:${p.tx},${p.ty}:${(+p.rot || 0).toFixed(3)}`).sort() }));

const bad = [], warn = []; let decks = 0, rooms = 0, propsN = 0, walled = 0, loose = 0;
const all = {};
const t0 = Date.now();
for (const c of cases()) {
  const d = generate(c.deck, c.seed, c.opts); decks++; all[c.id] = snap(d);
  const ours = d.rooms.filter(mine); if (!ours.length) continue;
  const W = d.W, H = d.H, seen = new Uint8Array(W * H), q = [d.start]; seen[d.start[0] + d.start[1] * W] = 1;
  while (q.length) { const [x, y] = q.pop(); for (const [a, b] of D4) { const nx = x + a, ny = y + b; if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[nx + ny * W] || d.grid[ny][nx] !== 0) continue; seen[nx + ny * W] = 1; q.push([nx, ny]); } }
  const reach = ([x, y]) => seen[x + y * W] || D4.some(([a, b]) => seen[x + a + (y + b) * W]);
  const where = `${c.id} (generate(${c.deck}, ${c.seed}, …))`;
  if (!d.chips.every(reach) || !reach(d.exit)) bad.push(`${where}: a chip or the exit is unreachable`);
  const again = snap(generate(c.deck, c.seed, c.opts)); if (JSON.stringify(again) !== JSON.stringify(all[c.id])) bad.push(`${where}: same seed gave a different layout`);
  for (const r of ours) {
    rooms++; const inR = (x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h, at = `${where} ${r.type}@${r.x},${r.y} ${r.w}x${r.h}${r.big ? ' big' : ''}`;
    const ps = d.props.filter(p => inR(p.tx, p.ty)); propsN += ps.length;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (d.grid[y][x] === 1) { walled++; (STRICT ? bad : warn).push(`${at}: tile ${x},${y} cut off by props (walled over)`); }
    for (const p of ps) {
      const edge = p.tx === r.x || p.ty === r.y || p.tx === r.x + r.w - 1 || p.ty === r.y + r.h - 1;
      if (edge && D4.some(([a, b]) => !inR(p.tx + a, p.ty + b) && d.grid[p.ty + b]?.[p.tx + a] === 0 && !d.tubeAxis[p.tx + a + (p.ty + b) * W] && !(d.exit[0] === p.tx + a && d.exit[1] === p.ty + b))) bad.push(`${at}: ${p.kind} at ${p.tx},${p.ty} stands in a doorway`);
      const side = D4.some(([a, b]) => seen[p.tx + a + (p.ty + b) * W]);
      if (p.wall && !side) bad.push(`${at}: wall prop ${p.kind} at ${p.tx},${p.ty} has no reachable side`);
      if (!side) loose++;
    }
  }
}
if (BASE && !CMP) { writeFileSync(BASE, JSON.stringify({ n: N, cases: all })); console.log(`room-check: baseline of ${decks} decks written to ${BASE}`); }
if (CMP) {
  const base = JSON.parse(readFileSync(CMP, 'utf8')); let other = 0, same = 0;
  if (base.n !== N) bad.push(`--compare: baseline was made with --n ${base.n}, this run uses --n ${N}`);
  for (const [id, rs] of Object.entries(base.cases)) {
    const now = all[id]; if (!now) continue;
    const allowed = (s) => type === '_tall' ? s.tall : s.type === type;
    const a = rs.filter(s => !allowed(s)), b = now.filter(s => !allowed(s));
    if (JSON.stringify(a.map(s => s.key)) !== JSON.stringify(b.map(s => s.key))) { bad.push(`${id}: rooms moved (room placement must not depend on layouts)`); continue; }
    a.forEach((s, i) => { other++; if (JSON.stringify(s.props) === JSON.stringify(b[i].props)) same++; else bad.push(`${id}: ${s.key} changed (another room type's props must not change when editing ${type})`); });
  }
  console.log(`room-check --compare: ${same}/${other} rooms of other types unchanged`);
}
console.log(`room-check ${type}: ${decks} decks, ${rooms} rooms checked, ${propsN} props, ${walled} walled-over tiles, ${loose} props with no reachable side (blocking clusters; only wall props fail), ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (warn.length) console.log(`WARN ${warn.length} (legacy bare put() layouts that box a tile in: the deck walls it over; fail with --strict):\n  ` + warn.slice(0, 8).join('\n  ') + (warn.length > 8 ? `\n  … ${warn.length - 8} more` : ''));
if (bad.length) { console.log(`FAIL ${bad.length}:\n  ` + bad.slice(0, 25).join('\n  ') + (bad.length > 25 ? `\n  … ${bad.length - 25} more` : '')); process.exit(1); }
console.log('OK');
