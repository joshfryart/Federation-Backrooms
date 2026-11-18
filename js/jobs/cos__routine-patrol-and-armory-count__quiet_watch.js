// Chief of security: routine patrol and armory count. Count the locker cradles by touch, one at a time from left to right: aim at each
// cradle and tap E. A full cradle adds a zapper to the tally; an empty one gets a pencil ring. Touching a cradle twice or skipping past one
// throws the tally off (a fault). At the log slate, compare your tally with the last logged line: tap MATCHES or DISCREPANCY.
import { define, machine, room, ri, shuffle, clamp } from './kit.js';

const K = 6, pos = (k) => 0.4 - k * 0.16, AIM = 0.06, SLATE = { match: 0.25, diff: -0.25 };
export default define({
  job: { billet: 'cos', label: 'Routine patrol and armory count', type: 'task:quiet_watch' },
  title: 'Cradle-by-cradle armory tally', dept: 'security', host: 'room', item: 'padd', siteName: 'Rack', verb: 'Count',
  how: 'Aim at each cradle from left to right and tap E once to count it (empty cradles get a ring). At the log slate aim at MATCHES or DISCREPANCY and tap E.',
  keys: ['look: aim at a cradle', 'E tap: count it'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'touch once along', input: 'look+e-tap', win: 'every cradle on both racks touched exactly once in left-to-right order and the tally reconciled against the logged line',
    fail: 'touching a cradle twice or skipping past one so the tally drifts, or calling a match when the rack is short of the log',
    rule: 'Tap E on each cradle in turn from the left: never the same one twice, never past an untouched one. Then at the slate, tally equal to the logged figure: tap the left mark; short: tap the right mark.' },
  rush: 'Copied last watch\'s count onto the slate from the doorway.',
  captions: { 'double count': 'pencil scratch', skipped: 'pencil scratch', 'wrong reconcile': 'slate buzz' },
  says: { 'double count': 'You touched that cradle already — the tally is one over. Recount from where you were.', skipped: 'You skipped a cradle. Go back to the first one you have not touched.', 'wrong reconcile': 'Check the tally against the log line again.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Locker rack A', prop: 'weaponrack' }, { name: 'Locker rack B', prop: 'suitrack' }, { name: 'Log slate', prop: 'issuecounter' }]), r = m.rnd;
    const empties = shuffle(r, Array.from({ length: 2 * K }, (_, i) => i)).slice(0, ri(r, 0, 2));
    m.racks = [0, 1].map(b => Array.from({ length: K }, (_, k) => ({ full: !empties.includes(b * K + k), seen: false })));
    const present = 2 * K - empties.length; m.logged = present + (r() < 0.5 ? 0 : ri(r, 1, 2)); m.tally = 0;
    const aimAt = (look) => { for (let k = 0; k < K; k++) if (Math.abs(look - pos(k)) < AIM) return k; return -1; };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, look = inp.look || 0;
      if (i === 2) { if (!inp.press) return; const pick = Math.abs(look - SLATE.match) < 0.1 ? 'match' : Math.abs(look - SLATE.diff) < 0.1 ? 'diff' : null; if (!pick) return;
        if ((pick === 'match') === (m.tally === m.logged)) m.finish(i); else m.fault('wrong reconcile'); return; }
      const rack = m.racks[i]; if (!inp.press) return; const k = aimAt(look); if (k < 0) return; const c = rack[k], nxt = rack.findIndex(x => !x.seen);
      if (c.seen) { m.fault('double count'); return; } if (k !== nxt) { m.fault('skipped'); return; }
      c.seen = true; if (c.full) m.tally++; m.ev(c.full ? 'count' : 'ring', { site: i, k });
      s.prog = rack.filter(x => x.seen).length / K * 0.95; if (rack.every(x => x.seen)) m.finish(i);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 2) return { at: 2, look: m.tally === m.logged ? SLATE.match : SLATE.diff, press: f % 4 === 0, hold: f % 4 === 0 };
      const k = m.racks[i].findIndex(x => !x.seen); return { at: i, look: pos(k), press: f % 4 === 0, hold: f % 4 === 0 }; };
    m.bad = (f = 0) => ({ at: m.next, look: m.next === 2 ? SLATE.match : pos(0), press: f % 4 === 0 });
    m.view = () => ({ racks: m.racks.map(b => b.map(c => c.full)), logged: m.logged });
    m.panel = (i) => { if (i === 2) return { label: 'Tally / log', value: `${m.tally} counted · log says ${m.logged}`, bar: clamp(m.tally / m.logged) };
      const b = m.racks[i]; return b ? { label: `Tally ${m.tally}`, value: b.map(c => !c.seen ? '·' : c.full ? '▮' : '○').join(' '), bar: b.filter(c => c.seen).length / K } : null; };
    m.prompt = (i) => i === 2 ? 'Aim at MATCHES (left) or DISCREPANCY (right) on the slate and tap [E]' : 'Aim at the next cradle from the left and tap [E] once';
    return m;
  },
});
