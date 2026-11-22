// Corridors (every open tile outside a room). No layout here: corridor props come from gen.js furnish() (liminal dead-end dressing).
// This module exists for the world.js dressing hook only: export const dress = { decor, fit } overrides ROOM_DECOR.corridor / FIT.corridor.
// Only decor and fit are consulted for corridors (floor / ceil / light / wall follow the hull class in world.js, not these tables).
// Backlog: docs/rooms/corridor.md.
export const dress = {
  // slot 3: a few more service fixtures (framed picture, hose cabinet, gauge cluster) mixed into the pool; the old entries keep their weights
  decor: (pool) => [...pool, 'picture', 'hosecab', 'gauges'],
};
