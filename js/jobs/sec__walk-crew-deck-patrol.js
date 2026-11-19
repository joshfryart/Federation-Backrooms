// Security: walk the crew deck patrol. Every crew door has a status light. A sealed door's light burns steady; a door held open blinks its
// light off for a moment once a cycle, and the cycle is long enough that a glance looks steady. Stand at each door and watch the light for a
// full cycle (the watch bar fills), then give the verdict: one tap of E logs the door sound, two quick taps log it held open on the board.
// Judging before a full cycle, passing an open door, or reporting a sealed door open are faults.
import { define, machine, room, rf, shuffle } from './kit.js';

export default define({
  job: { billet: 'sec', label: 'Walk crew deck patrol', type: 'loop' },
  title: 'Door light blink watch', dept: 'security', host: 'room', siteName: 'Door', verb: 'Watch',
  how: 'At each door watch its status light for one full cycle. Steady the whole time: tap E once (sound). It blinked off: tap E twice quickly (held open).',
  keys: ['E tap once: door sound', 'E tap twice: door held open'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'watch the blink', input: 'e-tap', win: 'each door light watched for a full cycle, held-open doors double-tapped onto the board and steady ones single-tapped',
    fail: 'judging a door on a glance, single-tapping a door whose light blinked, or double-tapping a steady door',
    rule: 'Stand at a door until the watch bar is full; a held-open door blinks its light dark once per cycle. One tap = sound, two quick taps = held open.' },
  rush: 'Walked the corridor at pace and glanced at each light in passing.',
  captions: { glanced: 'slate buzzes: watch longer', 'open missed': 'door alarm from the board', 'false breach': 'board shows a breach that is not there' },
  says: { glanced: 'You judged that door on a glance. Watch the light for a full cycle first.', 'open missed': 'That light blinked: the door was held open and you logged it sound.', 'false breach': 'That light never blinked. The door was sealed.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Cabin 1 door', prop: 'airlock_doors' }, { name: 'Cabin 2 door', prop: 'bunk' }, { name: 'Cabin 3 door', prop: 'locker' }, { name: 'Alcove locker', prop: 'shelving' }, { name: 'Airlock suit locker', prop: 'suitrack' }]), r = m.rnd;
    const nOpen = 1 + Math.floor(r() * 2), open = new Set(shuffle(r, [0, 1, 2, 3, 4]).slice(0, nOpen)), gap = m.calm ? 0.6 : 0.42;
    m.doors = m.sites.map((_, i) => ({ open: open.has(i), per: rf(r, 1.3, 1.8), ph: rf(r, 0, 1), off: m.calm ? 0.45 : 0.32, w: 0, pend: -1, seenOff: false }));
    const lit = (d) => !d.open || ((d.w / d.per + d.ph) % 1) > d.off / d.per;
    const verdict = (i, dbl) => { const d = m.doors[i];
      if (d.w < d.per) { m.fault('glanced'); d.w = 0; d.seenOff = false; return; }
      if (d.open && !dbl) { m.fault('open missed'); m.finish(i); return; }
      if (!d.open && dbl) { m.fault('false breach'); d.w = 0; return; }
      m.ev(dbl ? 'logged open' : 'sound', { site: i }); m.finish(i); };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, d = m.doors[i];
      d.w += dt; if (!lit(d)) d.seenOff = true;
      if (d.pend >= 0) { d.pend += dt; if (inp.press && d.pend > 0.03) { d.pend = -1; verdict(i, true); return; } if (d.pend > gap) { d.pend = -1; verdict(i, false); return; } }
      else if (inp.press) d.pend = 0;
      s.prog = Math.min(0.9, d.w / d.per * 0.9);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const d = m.doors[i];
      if (d.w < d.per + 0.15) return { at: i };
      if (d.pend < 0) return { at: i, press: true, hold: true };
      return d.open && d.pend > 0.1 ? { at: i, press: true, hold: true } : { at: i }; };
    m.bad = (f = 0) => ({ at: m.next, press: f % 30 === 0, hold: f % 30 === 0 });
    m.view = () => ({ doors: m.doors.map(d => [d.open, +d.per.toFixed(2), +d.ph.toFixed(2)]) });
    m.panel = (i) => { const d = m.doors[i]; if (!d) return null; const on = lit(d);
      return { label: on ? 'Light: ON (steady?)' : 'Light: OFF — blink!', value: d.w >= d.per ? 'cycle watched' : `watching ${Math.round(Math.min(1, d.w / d.per) * 100)} %`, bar: Math.min(1, d.w / d.per), band: [0.99, 1] }; };
    m.prompt = (i) => { const d = m.doors[i]; if (!d) return '';
      return d.w < d.per ? 'Watch the door light for a full cycle — does it ever blink off?' : d.seenOff ? 'It blinked: tap [E] twice quickly to log the door held open' : 'Steady the whole cycle: tap [E] once to log it sound'; };
    return m;
  },
});
