// Navigation logic for Systems Nominal (pure: no three.js, no DOM; node-testable, see tools/test-nav.mjs).
// All positions are in TILE units (x = world x / TS, y = world z / TS); a route's `len` is in tiles (x TS for metres).
//   navWorld(data)                          adapter so a generated deck (G.shipDecks[i].data) routes like a World
//   routeTo(world, from{x,y}, [tx,ty])      descend the (cached) distance field from `from`, string-pull to any-angle legs
//                                           -> { pts:[[x,y]..], cum, len, man:[{i,at,kind:'turnL'|'turnR'|'uturn'}], steps, target }
//   planRoute(plan, decks, fromDeck, fromTile, target, o)   cross-deck: [walk to lift, ride, walk] legs, chosen destination, metres, ETA
//   dutyItems(duty) / Pins                  board rows -> urgency-sorted items; auto-pin when due, G cycles due items -> nearest lift -> none
// Caching: one distance field per (deck grid, target tile), small LRU; routes are re-derived on the caller's 0.12 s tick, never per frame.

export const WALK = 3.3, SPRINT = 5.7;          // m/s, as js/move.js
export const RIDE_OVERHEAD = 2;                 // s per ride: doors + deck panel
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// room type -> department category (hue AND badge shape live in js/icons.js CATS / SHAPES)
export const ROOM_CAT = {
  bridge: 'command', readyroom: 'command', datacore: 'science', lab: 'science', arboretum: 'science', sickbay: 'medical', morgue: 'medical',
  engineering: 'engineering', workshop: 'engineering', plant: 'engineering', airlock: 'engineering', jefferies: 'engineering',
  quarters: 'crew', lounge: 'crew', gym: 'crew', washroom: 'crew', lift: 'crew',
  mess: 'services', holodeck: 'services', transporter: 'services', laundry: 'services', stores: 'services', shuttlebay: 'services', cargo: 'services',
  armory: 'security', brig: 'security',
};
// ship system id -> icon name (js/icons.js); duty loops carry `sys`
export const SYS_ICON = { lifts: 'lift', computer: 'datacore', transport: 'transporter', armory: 'charger', hydro: 'arboretum', replicators: 'replicator', alert: 'alert' };
export const sysIcon = (s) => SYS_ICON[s] || s || 'inspect';
// task text -> verb icon
export function taskIcon(text = '') {
  const t = text.toLowerCase();
  for (const [re, ic] of [[/deliver|carry|bring|haul|ferry/, 'deliver'], [/calibrat|align|tune/, 'calib'], [/scan|survey|sweep|sensor/, 'scan'], [/restock|stock|supply|inventor/, 'restock'],
    [/report|brief/, 'report'], [/repair|fix|replace|patch/, 'repair'], [/inspect|check|test|examine/, 'inspect'], [/patrol|walk/, 'patrol'], [/clean|purge|flush/, 'clean'], [/treat|patient|crew|visit|interview/, 'person']]) if (re.test(t)) return ic;
  return 'log';
}

// ---- distance fields ---------------------------------------------------------------------------------------------
// Same rules as World.field(tx, ty) (walkers: floor 1, tube 2, no ladders / upper runs / props; tubes entered end-on only).
export function gridField(d, tx, ty) {
  const W = d.W, H = d.H, g = d.grid, T = d.tubeAxis || [], L = d.tubeLevel || [];
  const out = new Int16Array(W * H).fill(-1); if (tx < 0 || ty < 0 || tx >= W || ty >= H) return out;
  const cost = (x, y, i) => { if (g[y][x] !== 0) return -1; const k = L[i]; if (k === 'up' || k === 'lad') return -1; return T[i] ? 2 : 1; };
  const q0 = tx + ty * W; out[q0] = 0; const buckets = [[q0]];
  for (let c = 0; c < buckets.length; c++) {
    const b = buckets[c]; if (!b) continue;
    for (let j = 0; j < b.length; j++) {
      const id = b[j]; if (out[id] !== c) continue; const x = id % W, y = (id / W) | 0, ta = T[id];
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = nx + ny * W, w = cost(nx, ny, n); if (w < 0) continue; const tb = T[n];
        if ((ta === 'x' || tb === 'x') && dy !== 0) continue; if ((ta === 'y' || tb === 'y') && dx !== 0) continue;
        const nd = c + w; if (out[n] < 0 || nd < out[n]) { out[n] = nd; (buckets[nd] || (buckets[nd] = [])).push(n); }
      }
    }
  }
  return out;
}
const NW = new WeakMap();
/** World-like adapter for a deck's generated data (shared per data object). A real World passes through unchanged. */
export function navWorld(d) {
  if (!d) return null; if (d.field && d.d) return d;
  let w = NW.get(d); if (!w) { w = { d, W: d.W, H: d.H, grid: d.grid, field: (x, y) => gridField(d, x, y) }; NW.set(d, w); } return w;
}
const FIELDS = new WeakMap();   // grid array -> Map(key -> Int16Array), LRU
export function fieldFor(w, tx, ty) {
  let m = FIELDS.get(w.grid); if (!m) { m = new Map(); FIELDS.set(w.grid, m); }
  const k = tx + ',' + ty; let f = m.get(k);
  if (f) { m.delete(k); m.set(k, f); return f; }
  f = w.field(tx, ty); m.set(k, f); if (m.size > 24) m.delete(m.keys().next().value); return f;
}
export function clearFields(w) { if (w) FIELDS.delete(w.grid); }

// ---- geometry -----------------------------------------------------------------------------------------------------
export const walkable = (w, x, y) => { if (w.grid[y]?.[x] !== 0) return false; const k = w.d.tubeLevel?.[x + y * w.W]; return k !== 'up' && k !== 'lad'; };
const tubeAt = (w, x, y) => !!w.d.tubeAxis?.[x + y * w.W];
/** true when a body of radius r (tiles) can walk the straight segment a->b (never through tubes or props) */
export function clearLine(w, ax, ay, bx, by, r = 0.3) {
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy); if (L < 1e-6) return true;
  const n = Math.max(1, Math.ceil(L / 0.25)), nx = -dy / L * r, ny = dx / L * r;
  for (let i = 0; i <= n; i++) { const x = ax + dx * i / n, y = ay + dy * i / n; for (const s of [-1, 0, 1]) { const tx = Math.floor(x + nx * s), ty = Math.floor(y + ny * s); if (!walkable(w, tx, ty) || tubeAt(w, tx, ty)) return false; } }
  return true;
}
export function maneuvers(pts, cum) {
  const man = [];
  for (let k = 1; k < pts.length - 1; k++) {
    const ax = pts[k][0] - pts[k - 1][0], ay = pts[k][1] - pts[k - 1][1], bx = pts[k + 1][0] - pts[k][0], by = pts[k + 1][1] - pts[k][1];
    const a = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);   // y is down (map view): positive = clockwise = right turn
    if (Math.abs(a) > 0.35) man.push({ i: k, at: cum[k], kind: Math.abs(a) > 2.6 ? 'uturn' : a > 0 ? 'turnR' : 'turnL' });
  }
  return man;
}
/** point + heading (radians, tile space) at arclength s along a route */
export function along(r, s) {
  s = Math.max(0, Math.min(r.len, s)); let k = 1; while (k < r.cum.length - 1 && r.cum[k] < s) k++;
  const a = r.pts[k - 1], b = r.pts[k] || a, t = (s - r.cum[k - 1]) / Math.max(1e-6, (r.cum[k] ?? s) - r.cum[k - 1]);
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, a: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}
function finish(pts, steps, target) {
  const cum = [0]; let len = 0; for (let k = 1; k < pts.length; k++) { len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); cum.push(len); }
  return { pts, cum, len, man: maneuvers(pts, cum), steps, target };
}

/** Route from a float tile position to a target tile. null when unreachable. */
export function routeTo(w, from, target) {
  if (!w || !target) return null;
  const W = w.W, [tx, ty] = target, f = fieldFor(w, tx, ty), T = w.d.tubeAxis || [];
  let x = Math.floor(from.x), y = Math.floor(from.y); const raw = [[from.x, from.y]];
  if (!(f[x + y * W] >= 0)) {   // standing in a closed lift car / on a prop edge: step off to the best neighbour
    let b = null; for (const [dx, dy] of D8) { const v = f[x + dx + (y + dy) * W]; if (x + dx >= 0 && x + dx < W && v >= 0 && (!b || v < b.v)) b = { x: x + dx, y: y + dy, v }; }
    if (!b) return null; x = b.x; y = b.y; raw.push([x + 0.5, y + 0.5]);
  }
  const steps = [[x, y]];
  for (let guard = 0; f[x + y * W] > 0 && guard < 4000; guard++) {
    const id = x + y * W, ta = T[id]; let b = null;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= w.H) continue; const n = nx + ny * W, v = f[n], tb = T[n];
      if ((ta === 'x' || tb === 'x') && dy !== 0) continue; if ((ta === 'y' || tb === 'y') && dx !== 0) continue;
      if (v >= 0 && v < f[id] && (!b || v < b.v)) b = { x: nx, y: ny, v };
    }
    if (!b) return null; x = b.x; y = b.y; steps.push([x, y]); raw.push([x + 0.5, y + 0.5]);
  }
  if (f[x + y * W] !== 0) return null;
  if (raw.length === 1) raw.push([tx + 0.5, ty + 0.5]);
  // string-pull, greedy forward: keep a waypoint only where the straight leg from the last anchor stops being walkable
  const out = [raw[0]]; let i = 0;
  while (i < raw.length - 1) {
    let j = i + 1; while (j + 1 < raw.length && j - i < 60 && clearLine(w, raw[i][0], raw[i][1], raw[j + 1][0], raw[j + 1][1])) j++;
    out.push(raw[j]); i = j;
  }
  return finish(out, steps, [tx, ty]);
}

// ---- rooms, lifts ---------------------------------------------------------------------------------------------------
/** walkable tile of a room nearest its centre (room centres are often furniture) */
export function roomTile(d, r) {
  const cx = r.x + r.w / 2 - 0.5, cy = r.y + r.h / 2 - 0.5; let best = null, bd = 1e9;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    if (d.grid[y]?.[x] !== 0 || d.tubeAxis?.[x + y * d.W]) continue; const dd = (x - cx) ** 2 + (y - cy) ** 2; if (dd < bd) { bd = dd; best = [x, y]; }
  }
  return best || [r.x + (r.w >> 1), r.y + (r.h >> 1)];
}
export const roomAt = (d, tx, ty, type) => d.rooms.find(r => (!type || r.type === type) && tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) || null;
export const roomsOf = (d, type) => d.rooms.filter(r => r.type === type);
/** the lift car tile (the deck's exit) and the corridor tile at its mouth */
export const liftTile = (d) => d.exit.slice();
export const liftMouth = (d) => [d.exit[0] + d.exitDir[0], d.exit[1] + d.exitDir[1]];
export function rideSecs(from, to, nDecks) { const k = Math.abs(to - from); return k ? 3 + 5 * (k - 1) / Math.max(1, nDecks - 2) : 0; }
export function etaOf(legs, TS = 2.5, speed = WALK) {
  let m = 0, s = 0, rides = 0;
  for (const l of legs) { if (l.kind === 'walk' && l.route) m += l.route.len * TS; if (l.kind === 'ride') { s += l.secs + RIDE_OVERHEAD; rides++; } }
  return { metres: m, eta: m / speed + s, rides };
}

/** Cross-deck plan. decks: array of deck data (or adapters); target: {type[, deck]} | {deck, tx, ty[, type]} | {lift:true[, deck]} | {deck}.
 *  o.world = the live World for fromDeck (optional), o.TS, o.max = candidate cap. Returns null when nothing is reachable. */
export function planRoute(plan, decks, fromDeck, fromTile, target, o = {}) {
  if (!target || !decks?.length) return null;
  const TS = o.TS || 2.5, N = decks.length, dataOf = (i) => decks[i]?.d || decks[i];
  const wOf = (i) => (i === fromDeck && o.world) ? o.world : navWorld(dataOf(i));
  let cands = [];
  if (target.lift || (target.deck != null && target.tx == null && !target.type)) cands = [{ deck: target.deck ?? fromDeck, lift: true }];
  else if (target.tx != null) cands = [{ deck: target.deck ?? fromDeck, tx: target.tx, ty: target.ty, type: target.type || null }];
  else if (target.type) {
    let list = (plan?.[target.type] || []).map(c => ({ deck: c.deck, tx: c.tx, ty: c.ty }));
    if (!list.length) decks.forEach((_, i) => { for (const r of roomsOf(dataOf(i), target.type)) list.push({ deck: i, tx: r.x + (r.w >> 1), ty: r.y + (r.h >> 1) }); });
    if (target.deck != null) { const same = list.filter(c => c.deck === target.deck); if (same.length) list = same; }
    cands = list.map(c => ({ ...c, type: target.type })).sort((a, b) => Math.abs(a.deck - fromDeck) - Math.abs(b.deck - fromDeck) || Math.hypot(a.tx - fromTile.x, a.ty - fromTile.y) - Math.hypot(b.tx - fromTile.x, b.ty - fromTile.y)).slice(0, o.max || 6);
  }
  let best = null;
  for (const c of cands) {
    const d = dataOf(c.deck); if (!d) continue;
    let dest, room = null;
    if (c.lift) dest = liftTile(d);
    else { room = c.type ? roomAt(d, c.tx, c.ty, c.type) : null; dest = room ? roomTile(d, room) : [c.tx, c.ty]; }
    const legs = [];
    if (c.deck === fromDeck) { const r = routeTo(wOf(fromDeck), fromTile, dest); if (!r) continue; legs.push({ kind: 'walk', deck: fromDeck, route: r, to: { tx: dest[0], ty: dest[1], type: c.lift ? 'lift' : c.type } }); }
    else {
      const d0 = dataOf(fromDeck), lt = liftTile(d0), r1 = routeTo(wOf(fromDeck), fromTile, lt); if (!r1) continue;
      legs.push({ kind: 'walk', deck: fromDeck, route: r1, to: { tx: lt[0], ty: lt[1], type: 'lift' } });
      legs.push({ kind: 'ride', from: fromDeck, to: c.deck, secs: rideSecs(fromDeck, c.deck, N) });
      if (!c.lift) { const l2 = liftTile(d), r2 = routeTo(wOf(c.deck), { x: l2[0] + 0.5, y: l2[1] + 0.5 }, dest); if (!r2) continue; legs.push({ kind: 'walk', deck: c.deck, route: r2, to: { tx: dest[0], ty: dest[1], type: c.type }, future: true }); }
    }
    const e = etaOf(legs, TS);
    if (!best || e.eta < best.eta) best = { legs, ...e, dest: { deck: c.deck, tx: dest[0], ty: dest[1], type: c.lift ? 'lift' : c.type, lift: !!c.lift, room } };
  }
  return best;
}

// ---- duty / task items and the pin manager --------------------------------------------------------------------------
/** Items for guidance from a Duty (js/duty.js). Duties: `left` = seconds until the due window closes. Tasks are due by end of
 *  shift: no countdown (left = null), they are simply 'open' while active. */
export function dutyItems(duty) {
  if (!duty) return [];
  const out = [], t = duty.t || 0;
  for (const l of duty.loops || []) {
    const st = duty.status ? duty.status(l) : l.state, due = l.state === 'due' || l.state === 'doing';
    const total = l.window ?? (l.period ? l.period * 0.9 : 0), dl = l.deadline ?? (l.dueAt != null ? l.dueAt + total : null);
    out.push({ kind: 'duty', id: l.id, label: l.label, room: l.room, icon: sysIcon(l.sys), status: st, due, late: st === 'overdue', left: due && dl != null ? Math.max(0, dl - t) : null, total, eta: l.state === 'idle' ? Math.max(0, (l.next || 0) - t) : 0 });
  }
  (duty.tasks || []).forEach((k, i) => out.push({ kind: 'task', id: k.id, label: k.task, room: k.room, icon: taskIcon(k.task), status: k.state, due: k.state === 'active', late: false, left: null, total: null, eta: Math.max(0, (k.at_s || 0) - t), order: i }));
  return out;
}
/** smaller = more urgent: late duties, then least time left, then open tasks (board order), then the soonest upcoming */
/** lift panel: room types of `types` present on a deck, from the ship plan ({type: [{deck,...}]}) */
export const deckRoomTypes = (plan, deck, types) => types.filter(t => plan?.[t]?.some(r => r.deck === deck));
/** duty-board ring extras for one item: is it the guided pin, and where does the walk ETA land on its time-left ring (0..1 of the window; null = no countdown)? late = you will not make it */
export function ringNav(it, pin, plan) {
  const pinned = !!(it && pin && pin.kind === it.kind && pin.id === it.id); if (!pinned || !plan || it.left == null || !it.total) return { pinned, notch: null, late: false };
  const r = (it.left - plan.eta) / it.total; return { pinned, notch: Math.max(0, Math.min(1, r)), late: r < 0 };
}
export const urgency = (it) => !it.due ? 1e7 + (it.eta || 0) : it.kind === 'task' ? 1e5 + (it.order || 0) : (it.late ? -1e4 : 0) + (it.left ?? 5e4);
export const pinKey = (p) => p ? `${p.kind}:${p.id ?? p.room ?? ''}${p.kind === 'room' || p.kind === 'deck' ? ':' + p.deck + ':' + (p.tx ?? '') + ',' + (p.ty ?? '') : ''}` : '';
const fromItem = (it, auto) => ({ kind: it.kind, id: it.id, room: it.room, label: it.label, icon: it.icon, auto });

export class Pins {
  constructor() { this.pin = null; this.seen = new Set(); this.lastExt = ''; this.cleared = false; this.rev = 0; }
  set(p) { const k = pinKey(this.pin); this.pin = p; if (pinKey(p) !== k) this.rev++; return p; }
  due(items) { return items.filter(it => it.due && it.status !== 'doing' && it.room && it.room !== 'any').sort((a, b) => urgency(a) - urgency(b)); }
  /** per tick: adopt an external pin (G.pin from the tasks agent), drop finished items, auto-pin the most urgent when something comes due */
  update(items, ext = null) {
    const ek = ext ? pinKey({ kind: ext.kind || 'ext', ...ext }) : '';
    if (ek !== this.lastExt) { this.lastExt = ek; if (ext) { this.cleared = false; return this.set({ ...ext, kind: ext.kind || 'room', ext: true, auto: false }); } else if (this.pin?.ext) this.set(null); }
    const p = this.pin;
    if (p && !p.ext && (p.kind === 'duty' || p.kind === 'task')) { const it = items.find(i => i.kind === p.kind && i.id === p.id); if (!it || !it.due) { this.set(null); this.cleared = false; } }
    const due = this.due(items); let fresh = false;
    for (const it of due) { const k = it.kind + ':' + it.id; if (!this.seen.has(k)) { this.seen.add(k); fresh = true; } }
    for (const k of [...this.seen]) if (!due.some(it => it.kind + ':' + it.id === k)) this.seen.delete(k);   // done: its next round counts as fresh again
    if (fresh) this.cleared = false;
    if (due.length && !this.cleared && (!this.pin || (this.pin.auto && fresh))) this.set(fromItem(due[0], true));
    return this.pin;
  }
  /** G: most urgent -> next due ... -> nearest lift -> none -> most urgent */
  cycle(items) {
    const order = [...this.due(items).map(it => fromItem(it, false)), { kind: 'lift', id: 'lift', label: 'Nearest lift', icon: 'lift' }, null];
    const k = pinKey(this.pin), idx = this.pin ? order.findIndex(o => o && pinKey(o) === k) : order.length - 1;
    const next = order[(idx + 1) % order.length]; this.cleared = !next; return this.set(next);
  }
}
