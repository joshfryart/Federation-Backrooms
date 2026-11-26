// Alert smoke, per deck and per room (glue in js/main.js `smokeStep`).
// An alert that means smoke (fire / contamination / hull breach / abandon ship) fills ONE source room on ONE deck: the alert's
// own deck when it names one, otherwise the deck the player was on when the smoke was first seen (stored on the alert record
// as `smokeDeck`). The smoke starts thick in the source room and creeps outward over time; other decks stay clear
// (abandon ship adds a thin, harmless haze on every deck). Dense smoke (>= DENSE) makes you cough, drains health, slows you
// and closes the fog in. Pure functions only: node-testable (tools/test.mjs section `smoke-unit`).

export const SMOKE_DEFS = {
  fire: { dense: 1, spread: 0.35, maxR: 16, hurt: 3 },             // thick black smoke from a burning compartment
  contamination: { dense: 0.8, spread: 0.25, maxR: 14, hurt: 2 },  // bad air: a pale haze, hurts less
  hull_breach: { dense: 0.5, spread: 0.5, maxR: 10, hurt: 0 },     // debris / vapour around the breach (the breach itself hurts)
  abandon_ship: { dense: 0.9, spread: 0.3, maxR: 18, hurt: 2.5, haze: 0.2 },
};
export const DENSE = 0.45;   // at and above this the smoke hurts / slows / makes you cough

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// the smoking alerts among the active ones (highest severity first)
export const smokeAlerts = (active) => (active || []).filter(a => SMOKE_DEFS[a.def?.id ?? a.id]);

// which deck (0-based ship deck index, as alert.deck) an alert's smoke is on; pins it on the record the first time (null deck = where the player is now)
export function smokeDeckOf(a, playerDeck) {
  if (a.smokeDeck == null) a.smokeDeck = a.deck != null ? a.deck : playerDeck;
  return a.smokeDeck;
}

// pick the source room of a deck, stable for (run seed, deck, alert id, alert seq). rooms: [{x, y, w, h, type}]
export function pickSourceRoom(rooms, key) {
  const list = (rooms || []).filter(r => r.type !== 'lift' && r.type !== 'jefferies' && r.w * r.h >= 4);
  if (!list.length) return null;
  return list[hash(key) % list.length];
}

// distance (in tiles) from tile point (x, y) to the room rectangle, 0 inside
export function roomDist(r, x, y) {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.w - 1)), dy = Math.max(r.y - y, 0, y - (r.y + r.h - 1));
  return Math.hypot(dx, dy);
}

// smoke density 0..1 at a world point for one source. src: { id, kind: 'room'|'point', room?, x?, z?, age, ts }
// tx, ty: the point's tile; x, z: world metres. Thick inside the source room (ramps up over 6 s), thinner with distance
// from it, out to a radius that grows with age up to maxR metres.
export function densityAt(src, x, z, tx, ty) {
  const def = SMOKE_DEFS[src.id]; if (!def) return 0;
  const ramp = Math.min(1, src.age / 6), r = Math.min(def.maxR, 3 + src.age * def.spread);
  const d = src.kind === 'room' && src.room ? roomDist(src.room, tx, ty) * src.ts : Math.hypot(x - src.x, z - src.z);
  const core = src.kind === 'room' ? 0 : 2.5;   // a point source has a dense core of 2.5 m
  if (d <= core) return def.dense * ramp;
  return def.dense * ramp * Math.max(0, 1 - (d - core) / r) * 0.8;
}

// the effects of a local density. o: { breather, calm }. Returns { dense, drain (hp/s), slow (speed x), fog (density x), cough }
export function smokeEffects(dens, hurt = 3, o = {}) {
  const dense = dens >= DENSE, over = dense ? Math.min(1, (dens - DENSE) / (1 - DENSE)) : 0;
  const drain = dense ? (0.6 + over) * hurt * (o.breather ? 0.25 : 1) : 0;
  const slow = dense ? 1 - (o.breather ? 0.1 : 0.3) * (0.4 + 0.6 * over) : 1;
  const fog = 1 + dens * (o.calm ? 2.5 : 5);   // Calm mode: the fog closes in half as much
  return { dense, drain, slow, fog, cough: dense && !o.breather };
}
