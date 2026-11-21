// Quartermaster: full cold/dry store count. At each aisle, tap E once per crate. A back row is hidden behind the stack and only readable
// while looking left around it. When the tally is the whole aisle, hold E to chalk it off. A short tally chalked is rejected.
import { define, machine, room, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'qm', label: 'Full inventory count of cold and dry store', type: 'task:quiet_watch' },
  title: 'Count the hidden back row', dept: 'services', host: 'room', siteName: 'Aisle', verb: 'Count',
  how: 'Tap E once per crate. Look left around the stack to read how many crates hide in the back row and count those too. Then hold E to chalk the aisle off.',
  keys: ['E tap per crate', 'look left: hidden row', 'E hold: chalk aisle'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'count hidden row', input: 'e-tap+e-hold+look', win: 'three aisle tallies chalked at the full crate count including the back row seen only by looking around the stack',
    fail: 'chalking a tally that misses the hidden back row, or one that is over the true count',
    rule: 'Tap E per visible crate. Turn to look left past the stack to read the hidden back row and tap for those. When the tally equals front plus back, hold E to chalk it.' },
  rush: 'Chalked each aisle off from the front row and wrote last count\'s total on the sheet.',
  captions: { 'short tally': 'tally mismatch flagged' }, says: { 'short tally': 'Tally does not match the aisle. Check behind the stack.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [0, 1, 2].map(i => ({ name: `Aisle ${i + 1}`, prop: i === 1 ? 'locker' : 'shelving' }))), r = m.rnd;
    m.a = [0, 1, 2].map(() => ({ f: ri(r, 3, 5), b: ri(r, 1, 3), tally: 0, seen: false, h: 0, lock: false })); m.li = -1;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, a = m.a[i];
      if (m.li !== i) { m.li = i; a.h = 0; a.lock = false; } if ((inp.look || 0) > 0.25) a.seen = true;
      if (inp.hold && !a.lock) { a.h += dt; if (a.h >= 0.6) { a.lock = true; if (a.tally === a.f + a.b) m.finish(i); else { m.fault('short tally'); a.tally = 0; } } }
      if (rel) { if (a.lock) a.lock = false; else if (a.h > 0.01 && a.h < 0.25) a.tally++; a.h = 0; }
      s.prog = s.done ? 1 : clamp(a.tally / (a.f + a.b)) * 0.9;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const a = m.a[i]; if (!a.seen) return { at: i, look: 0.4, hold: false }; return a.tally < a.f + a.b ? { at: i, hold: f % 2 === 0, look: 0.4 } : { at: i, hold: true, look: 0 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 30 < 21, look: 0 });
    m.view = () => ({ a: m.a.map(a => [a.f, a.b]) });
    m.panel = (i) => { const a = m.a[i]; return a ? { label: `Front row ${a.f} crates`, value: `back row ${a.seen ? a.b : '?'} · tally ${a.tally}`, bar: clamp(a.tally / (a.f + a.b)) } : null; };
    m.prompt = () => 'Tap [E] per crate, look left for the back row, hold [E] to chalk the aisle';
    return m;
  },
});
