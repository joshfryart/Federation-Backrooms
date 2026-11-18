// XO: walk-round of all departments. At each department door, count the staff at their stations: aim at one station, hold E and keep your
// eyes on it until the count registers (manned, or an empty post logged), then let go before looking at the next. Sliding your gaze to
// another station while still counting loses the count (a fault): a walk-round counts heads one station at a time.
import { define, machine, room, ri, rf, shuffle } from './kit.js';

export default define({
  job: { billet: 'xo', label: 'Walk-round of all departments', type: 'task:quiet_watch' },
  title: 'Department doorway headcount', dept: 'command', host: 'room', siteName: 'Doorway', verb: 'Count',
  how: 'At each department door aim at one station at a time and hold E until it is counted, then let go and aim at the next. Every station must be counted, empty posts included.',
  keys: ['Aim with the view', 'E hold: count a station', 'let go between stations'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'headcount', input: 'e-hold+look', win: 'every station at every department door counted one at a time and each empty post logged on the walk',
    fail: 'sliding the gaze to another station while still counting, so the tally is lost',
    rule: 'Aim at a station marker and hold E: the count bar fills while your eyes stay on it. When it reads MANNED or EMPTY, let go and aim at the next. Moving to a different station with E still held loses the count.' },
  rush: 'Glanced in each doorway and wrote "all present".',
  captions: { 'lost count': 'pad stylus slips', counted: 'pad tick' }, says: { 'lost count': 'Lost count — let go before looking at the next station.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Cargo bay doorway', prop: 'pallet_loaded' }, { name: 'Shuttlebay doorway', prop: 'cargo_pad' }, { name: 'Mess doorway', prop: 'crate' }]), r = m.rnd;
    const tol = m.calm ? 0.09 : 0.07, need = 0.45;
    m.rooms = m.sites.map(() => { const n = ri(r, 3, 4), empty = new Set(shuffle(r, [...Array(n).keys()]).slice(0, ri(r, 0, 2))), off = rf(r, -0.05, 0.05);
      return { posts: Array.from({ length: n }, (_, k) => ({ b: off - 0.42 + 0.84 * k / (n - 1), empty: empty.has(k), got: 0, done: false })), on: -1 }; });
    const aim = (u, look) => { let best = -1, bd = tol; u.posts.forEach((p, k) => { const d = Math.abs((look || 0) - p.b); if (d < bd) { bd = d; best = k; } }); return best; };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, u = m.rooms[i];
      if (rel) { if (u.on >= 0 && !u.posts[u.on].done) u.posts[u.on].got = 0; u.on = -1; }
      if (!inp.hold) return; const k = aim(u, inp.look);
      if (u.on >= 0 && k !== u.on) { if (!u.posts[u.on].done || k >= 0) m.fault('lost count'); if (!u.posts[u.on].done) u.posts[u.on].got = 0; u.on = -2; return; }
      if (u.on === -2 || k < 0) return; const p = u.posts[k]; if (p.done) { u.on = k; return; }
      u.on = k; p.got += dt; if (p.got >= need) { p.done = true; m.ev('counted', { site: i, post: k, empty: p.empty }); }
      s.prog = u.posts.filter(q => q.done).length / u.posts.length * 0.9; if (u.posts.every(q => q.done)) m.finish(i);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const u = m.rooms[i]; if (u.on >= 0 && u.posts[u.on].done) return { at: i, hold: false, look: u.posts[u.on].b }; const k = u.posts.findIndex(p => !p.done); return { at: i, hold: u.on !== -2, look: u.posts[k].b }; };
    m.bad = (f = 0) => { const i = m.next, u = m.rooms[i]; return { at: i, hold: true, look: u.posts[f % 2 ? 0 : u.posts.length - 1].b }; };
    m.view = () => ({ rooms: m.rooms.map(u => u.posts.map(p => [+p.b.toFixed(2), p.empty])) });
    m.panel = (i) => { const u = m.rooms[i]; if (!u) return null; const p = u.on >= 0 ? u.posts[u.on] : null;
      return { label: p ? (p.done ? (p.empty ? 'EMPTY POST — logged' : 'MANNED') : `Counting station ${u.on + 1}`) : 'Aim at a station', value: u.posts.map((q, k) => `${k + 1}${q.done ? (q.empty ? '○' : '●') : '?'}`).join(' '), bar: p ? Math.min(1, p.got / need) : 0 }; };
    m.prompt = (i) => { const u = m.rooms[i]; if (!u) return ''; const left = u.posts.filter(p => !p.done).length; return u.on >= 0 && u.posts[u.on].done ? 'Counted — let go of [E] before the next station' : `Aim at a station and hold [E] to count it · ${left} to count`; };
    return m;
  },
});
