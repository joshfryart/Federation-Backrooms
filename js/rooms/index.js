// Per-room layout registry (docs/rooms/README.md). js/gen.js builds a ctx per room and calls ROOM_LAYOUTS[type].layout(ctx); tall rooms then get _tall.js.
// One file per room type so parallel work on different rooms never touches the same file. Pure data, no three.js: loaded by node tools and the game alike.
//
// ctx (built in js/gen.js generate()):
//   r                 the room { type, x, y, w, h, big, required }; ix0 / iy0 / ix1 / iy1 its interior box, cx / cy its centre tile
//   interior          [[x, y]] interior tiles (the centre tile only for rooms under 5 wide and tall); freeIn() those still open and not reserved
//   rnd               this room's own random stream: mulberry32(seed ^ hash(type, r.x, r.y)). Never use another stream.
//   put(x, y, kind, extra)              bare placement, no checks (only for a 1-tile centrepiece in a 3x3 room)
//   safePut(r, x, y, kind, extra)       place only if the room stays one walkable piece and every prop keeps a reachable side
//   ringPut(r, kind, o)                 against the wall on the edge ring (o.face / door / corner / only / free / along / ok / extra, see gen.js)
//   anyPut(r, interior, kind, o)        on any free interior tile (o.near / min / rot / extra); wallPut(r, interior, kind, o) ring first, else interior
//   has(r, kind), reserved (Set of 'x,y' kept clear), faceTo(dx, dy), faceOpen(x, y, px, py), inRect(r, x, y), shuffle(arr, rnd)
//   grid (0 open, 1 wall, 2 prop), props (all props so far), deck, opts (generate() options)
//
// Optional per-room dressing for js/world.js: export const dress = { decor, fit, floor, ceil, light, wall } from a room module. Each key is either a value
// that replaces that room's entry in the world.js table (ROOM_DECOR wall-fixture pool, FIT guaranteed searchable fixtures, FLOOR_OF floor
// texture kind, CEIL_OF ceiling texture kind, ROOM_LIGHT colour, WALL_OF bulkhead set), or a function (current, ctx) => new value. world.js applies it through dressTable().
import * as airlock from './airlock.js';
import * as arboretum from './arboretum.js';
import * as armory from './armory.js';
import * as atrium from './atrium.js';
import * as bridge from './bridge.js';
import * as brig from './brig.js';
import * as cargo from './cargo.js';
import * as datacore from './datacore.js';
import * as engineering from './engineering.js';
import * as gym from './gym.js';
import * as holodeck from './holodeck.js';
import * as lab from './lab.js';
import * as laundry from './laundry.js';
import * as lounge from './lounge.js';
import * as mess from './mess.js';
import * as morgue from './morgue.js';
import * as plant from './plant.js';
import * as quarters from './quarters.js';
import * as readyroom from './readyroom.js';
import * as shuttlebay from './shuttlebay.js';
import * as sickbay from './sickbay.js';
import * as stores from './stores.js';
import * as transporter from './transporter.js';
import * as washroom from './washroom.js';
import * as workshop from './workshop.js';
import * as tall from './_tall.js';
import * as corridor from './corridor.js';   // dressing only (no layout)

export const ROOM_LAYOUTS = { airlock, arboretum, armory, atrium, bridge, brig, cargo, datacore, engineering, gym, holodeck, lab, laundry, lounge, mess, morgue, plant, quarters, readyroom, shuttlebay, sickbay, stores, transporter, washroom, workshop };
export const TALL = tall;
// every module that may export `dress` (room layouts plus areas that are not rooms)
export const ROOM_DRESS = { ...ROOM_LAYOUTS, corridor };

// per-room random stream: a string hash of (type, x, y) mixed into the deck seed
export function roomHash(type, x, y) { let h = 0x811c9dc5; for (const c of `${type}@${x},${y}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193); } return h >>> 0; }
export const roomSeed = (seed, type, x, y) => ((seed ^ roomHash(type, x, y)) >>> 0);

// apply the rooms' optional `dress` overrides to one of world.js's per-room tables (in place); a no-op for rooms that export none
export function dressTable(key, table, ctx) {
  for (const [type, mod] of Object.entries(ROOM_DRESS)) {
    const v = mod.dress?.[key]; if (v === undefined) continue;
    table[type] = typeof v === 'function' ? v(table[type], ctx) : v;
  }
  return table;
}
