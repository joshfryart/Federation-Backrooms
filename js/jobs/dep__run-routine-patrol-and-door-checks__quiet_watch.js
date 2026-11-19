// Deputy security chief, quiet watch: a solo patrol of the cargo corridor with nobody to double-check. A door can look latched and still give,
// so a gentle hand on the handle proves nothing: hold E and YANK (turn the view sharply while holding) to put a firm pull on it. When the test
// is done the panel says LATCHED or GIVES. A door that gives must be flagged with a tap of E before you walk on; leave it unflagged and the
// test has to be redone. The wall log panel at the end takes the section as secure.
import { define, machine, room, rf, shuffle } from './kit.js';

export default define({
  job: { billet: 'dep', label: 'Run routine patrol and door checks', type: 'task:quiet_watch' },
  title: 'Solo firm-pull handle yank', dept: 'security', host: 'room', siteName: 'Door', verb: 'Yank',
  how: 'At each door hold E and yank the handle by turning sharply; a slow hand does not count. If the door GIVES, tap E to flag it before moving on. Log the section on the wall panel.',
  keys: ['E hold + sharp turn: firm pull', 'E tap: flag a door that gave / log'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'yank the handle', input: 'e-hold+e-tap+swing', win: 'every corridor door given a firm sharp pull and each one that gives flagged before the wall log is marked',
    fail: 'walking past a door that gave without flagging it, so it is logged latched',
    rule: 'Hold E and turn fast (a sharp swing) to load the handle: the pull meter only fills while the swing is sharp. At the end it reads LATCHED or GIVES; on GIVES tap E within two seconds to flag it.' },
  rush: 'Rested a hand on each handle and called the corridor secure.',
  captions: { unflagged: 'door drifts open behind you', gives: 'latch clunks' },
  says: { unflagged: 'That door gave and you did not flag it — tap E to flag a door that gives. Test it again.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Bay-side door', prop: 'airlock_doors' }, { name: 'Alcove locker door', prop: 'locker' }, { name: 'Junction door', prop: 'airlock_doors' }, { name: 'Wall log panel', prop: 'console' }]), r = m.rnd;
    const giv = new Set(shuffle(r, [0, 1, 2]).slice(0, 1 + Math.floor(r() * 2))), win = m.calm ? 3 : 2, yank = 1.2;
    m.doors = [0, 1, 2].map(i => ({ gives: giv.has(i), need: rf(r, 0.6, 0.9), pull: 0, ph: 'test', t: 0 }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next;
      if (i === 3) { if (inp.press) m.finish(3); return; }
      const d = m.doors[i];
      if (d.ph === 'test') { if (inp.hold && Math.abs(inp.swing || 0) >= yank) { d.pull += dt / d.need; if (d.pull >= 1) { if (!d.gives) { m.finish(i); return; } d.ph = 'gave'; d.t = 0; m.ev('gives', { site: i }); } } }
      else { d.t += dt; if (inp.press) { m.ev('flagged', { site: i }); m.finish(i); return; } if (d.t > win) { m.fault('unflagged'); d.ph = 'test'; d.pull = 0; } }
      s.prog = d.ph === 'gave' ? 0.9 : 0.85 * Math.min(1, d.pull);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; if (i === 3 || m.doors[i].ph === 'gave') { const p = f % 4 === 0; return { at: i, press: p, hold: p }; } return { at: i, hold: true, swing: f % 20 < 10 ? 1.7 : -1.7 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: true, swing: f % 20 < 10 ? 1.7 : -1.7 });
    m.view = () => ({ doors: m.doors.map(d => [d.gives, +d.need.toFixed(2)]) });
    m.panel = (i) => { if (i === 3) return { label: 'Wall log', value: 'mark secure', bar: 0 }; const d = m.doors[i]; return d ? (d.ph === 'gave' ? { label: 'GIVES', value: 'flag it!', bar: 1 - d.t / win } : { label: 'Firm pull', value: `${Math.round(Math.min(1, d.pull) * 100)} %`, bar: Math.min(1, d.pull) }) : null; };
    m.prompt = (i) => { if (i === 3) return 'Tap [E] to log the section secure'; const d = m.doors[i]; return !d ? '' : d.ph === 'gave' ? 'It gave — tap [E] to flag this door' : 'Hold [E] and yank: turn sharply to put a firm pull on the handle'; };
    return m;
  },
});
