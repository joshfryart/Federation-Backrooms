// Damage control: run the full hatch and bulkhead drill cycle against the stopwatch. At each hatch crank the wheel shut with taps of E, one
// full turn per tap, exactly the number on the hatch placard (a sticky wheel loses a tap snatched before it has come round). Then hold E to
// drive the locking bar home until its lamp reads SEATED. Letting go of the bar early springs it back (a door that looks shut but will not
// seal), an extra crank strips the dogs, and a hatch that overruns its drill time is logged as a stuck door.
import { define, machine, room, ri, clamp } from './kit.js';

export default define({
  job: { billet: 'dc', label: 'Run full hatch and bulkhead drill cycle', type: 'task:shakedown' },
  title: 'Crank-and-dog hatch drill', dept: 'engineering', host: 'room', siteName: 'Hatch', verb: 'Close',
  how: 'Tap E once per wheel turn up to the placard count (wait for a sticky wheel to come round), then hold E to drive the locking bar until it reads SEATED. Each hatch has a drill time.',
  keys: ['E tap: one wheel turn', 'E hold: drive the locking bar'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'crank and dog', input: 'e-hold+e-tap', win: 'every hatch cranked exactly its placard turns and its locking bar held home to SEATED inside the drill time',
    fail: 'letting the locking bar spring back unseated, stripping the dogs with an extra turn, or overrunning a hatch drill time',
    rule: 'Each tap of E is one wheel turn; stop on the placard count. A sticky wheel ignores taps closer than half a second. With the count made, hold E until the bar lamp says SEATED; letting go before that springs it back.' },
  rush: 'Swung the hatches to and called the drill complete.',
  captions: { 'bar unseated': 'bar clanks back', 'over-cranked': 'dogs grind', 'stuck door': 'stopwatch beeps', turn: 'wheel clunk' },
  says: { 'bar unseated': 'The bar sprang back — hold it until the lamp says SEATED.', 'over-cranked': 'One turn too many — the dogs are stripping. Count the placard turns.', 'stuck door': 'Over the drill time on that hatch — logged as stuck.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Fore hatch', prop: 'airlock_doors' }, { name: 'Bay bulkhead', prop: 'baycontrol' }, { name: 'Aft hatch', prop: 'cargo_pad' }]), r = m.rnd;
    const sticky = ri(r, 0, 2), drill = m.calm ? 9 : 7, barT = m.calm ? 0.8 : 0.9;
    m.h = m.sites.map((_, i) => ({ req: ri(r, 3, 5), turns: 0, bar: 0, gap: 9, sticky: i === sticky, t: 0, late: false, pt: 0 }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, h = m.h[i];
      h.gap += dt; h.t += dt; if (h.t > drill && !h.late) { h.late = true; m.fault('stuck door'); }
      if (inp.hold) h.pt += dt;
      if (inp.press) { h.pt = 0; if (h.turns < h.req) { if (!h.sticky || h.gap >= 0.5) { h.turns++; m.ev('turn', { site: i }); } h.gap = 0; } }
      if (h.turns >= h.req && inp.hold && !inp.press && h.pt > 0.15) { h.bar = clamp(h.bar + dt / barT); if (h.bar >= 1) { m.ev('seated', { site: i }); m.finish(i); return; } }
      if (rel) { if (h.turns >= h.req && h.bar > 0) { if (h.bar < 1) { m.fault('bar unseated'); h.bar = 0; } } else if (h.turns >= h.req && h.pt < 0.15 && h.over) { m.fault('over-cranked'); } h.over = h.turns >= h.req; }
      s.prog = s.done ? 1 : clamp(h.turns / h.req * 0.5 + h.bar * 0.45, 0, 0.95);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const h = m.h[i];
      if (h.turns < h.req) { const go = !m.prev && h.gap >= (h.sticky ? 0.55 : 0.12); return { at: i, press: go, hold: go }; }
      if (!h.over) return { at: i, hold: false }; return { at: i, press: !m.prev, hold: true }; };
    m.bad = () => { const i = m.next, h = m.h[i]; const go = !m.prev && h.gap >= 0.55; return { at: i, press: go, hold: go }; };
    m.view = () => ({ h: m.h.map(h => [h.req, h.sticky]) });
    m.panel = (i) => { const h = m.h[i]; if (!h) return null; return h.turns < h.req ? { label: `Placard ${h.req} turns${h.sticky ? ' · STICKY wheel' : ''} · drill ${Math.max(0, drill - h.t).toFixed(1)} s`, value: `${h.turns} / ${h.req}`, bar: h.turns / h.req }
      : { label: `Locking bar ${h.bar >= 1 ? 'SEATED' : 'not seated'} · drill ${Math.max(0, drill - h.t).toFixed(1)} s`, value: `${Math.round(h.bar * 100)} %`, bar: h.bar, band: [0.99, 1] }; };
    m.prompt = (i) => { const h = m.h[i]; return !h ? '' : h.turns < h.req ? `Tap [E] for each wheel turn: ${h.req - h.turns} to go` : 'Hold [E] to drive the locking bar home until SEATED'; };
    return m;
  },
});
