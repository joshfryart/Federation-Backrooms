// Ship inventory in the game: what you find when you search a wall fixture. Data is compiled from docs/ship-inventory by tools/build-game-items.mjs.
// Missing file or room/fixture just means nothing is searchable there.
let DATA = null;
export async function loadItems() {
  try { const r = await fetch('./assets/data/ship-items.json'); if (r.ok) DATA = await r.json(); } catch (e) { console.warn('ship items failed', e); }
}
export const itemsReady = () => !!DATA;
export const SEARCHABLE = new Set(['locker', 'medcab', 'kit', 'shelf', 'rack', 'toolboard', 'hose']);
const NAME = { locker: 'locker', medcab: 'medicine cabinet', kit: 'first-aid kit', shelf: 'shelf', rack: 'storage rack', toolboard: 'tool board', hose: 'hose reel and fittings' };
export const fixtureName = (k) => NAME[k] || k;
const MEDICAL_KINDS = new Set(['medcab', 'kit']);
const TOOL_KINDS = new Set(['toolboard', 'hose', 'rack']);
const clean = (s) => s.replace(/^\w/, c => c.toUpperCase());
// → { text, loot: 'heal' | 'cell' | null } or null when this room/fixture has no data. `rnd` is any () => 0..1.
export function searchFixture(room, kind, rnd = Math.random) {
  const list = DATA?.rooms?.[room]?.[kind] || DATA?.rooms?.corridor?.[kind]; if (!list || !list.length) return null;
  const n = 3 + Math.floor(rnd() * 3), pick = new Set();
  for (let g = 0; g < 30 && pick.size < Math.min(n, list.length); g++) pick.add(Math.floor(rnd() * list.length));
  const found = [...pick].map(i => { const [name, qty] = list[i]; return qty > 1 ? `${name} ×${qty}` : name; });
  const loot = rnd() < (MEDICAL_KINDS.has(kind) ? 0.7 : TOOL_KINDS.has(kind) ? 0.3 : 0.2) ? (MEDICAL_KINDS.has(kind) ? 'heal' : 'cell') : null;
  return { text: `${clean(fixtureName(kind))}: ${found.join(', ')}.`, loot };
}

// examine text for a prop kind in a room: [name, real-world equivalent] (varied by tile), or null
export function examineProp(room, kind, tx = 0, ty = 0) {
  const l = DATA?.examine?.[room]?.[kind] || DATA?.examine?.corridor?.[kind]; if (!l || !l.length) return null;
  return l[Math.abs(tx * 7 + ty * 13) % l.length];
}
// small loose items for a room: [[name, real, shape 0 box | 1 cylinder | 2 flat]]
export const clutterFor = (room) => DATA?.clutter?.[room] || [];
