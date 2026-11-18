// Chief engineer: check gravity plating and lifts for heavy loads (cargo run). Run each cargo lift up to the deck mark with E held. With a test
// pallet at the rated weight the motor heats fast: let go before the motor gauge reaches the stall line, let it cool, then run again. Stop
// the cab inside the deck band and leave it there. An empty run is easy; the loaded runs are the test. Driving into a stall, or running the
// cab past the deck band, fails that run.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'ce', label: 'Check gravity plating and lifts for heavy loads', type: 'task:cargo_run' },
  title: 'Loaded lift duty-cycle run', dept: 'engineering', host: 'room', siteName: 'Run', verb: 'Run',
  how: 'Hold E to run the lift cab up. Under a rated pallet the motor heats quickly: let go before it reaches the stall line, let it cool, run again. Stop the cab inside the deck band.',
  keys: ['E hold: run the cab up', 'let go: motor cools, cab holds'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'pulse the hoist', input: 'e-hold', win: 'the empty call and both rated-load runs brought up and stopped inside the deck band without the motor ever stalling',
    fail: 'running the motor into its stall line under the rated pallet, or overrunning the deck band',
    rule: 'While E is held the cab climbs and the motor gauge rises, much faster with the rated pallet aboard. Released, the cab holds and the motor cools. Work in bursts; finish by resting the cab inside the band for a moment.' },
  rush: 'Sent an empty call up and down and passed both lifts.',
  captions: { 'motor stalled': 'motor groans and grinds', overrun: 'cab bangs the upper stop' },
  says: { 'motor stalled': 'Stalled under load — the cab slid back. Let the motor cool between pushes.', overrun: 'Past the deck band — the cab hit the stop. Brought it back down; ease it in.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Lift A empty call', prop: 'baycontrol' }, { name: 'Lift A rated pallet', prop: 'pallet_loaded' }, { name: 'Lift B rated pallet', prop: 'hoversled' }]), r = m.rnd;
    const speed = 0.16, cool = m.calm ? 0.9 : 0.7, settle = 0.6, bw = m.calm ? 0.09 : 0.06;
    m.runs = m.sites.map((_, i) => { const mid = rf(r, 0.6, 0.85); return { heat: i === 0 ? 0.15 : rf(r, 0.42, 0.52), lo: mid - bw, hi: mid + bw, pos: 0, g: 0, rest: 0 }; });
    m.cooling = false;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const st = m.cur(inp); if (!st) return; const i = m.next, u = m.runs[i];
      if (inp.hold) { u.pos += speed * dt; u.g += u.heat * dt; u.rest = 0;
        if (u.g >= 1) { m.fault('motor stalled'); u.g = 0.6; u.pos = Math.max(0, u.pos - 0.2); }
        if (u.pos > u.hi + 0.02) { m.fault('overrun'); u.pos = Math.max(0, u.lo - 0.25); } }
      else { u.g = Math.max(0, u.g - cool * dt); if (u.pos >= u.lo && u.pos <= u.hi) { u.rest += dt; if (u.rest >= settle) m.finish(i); } else u.rest = 0; }
      if (!st.done) st.prog = clamp(u.pos / u.hi * 0.9, 0, 0.9);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const u = m.runs[i]; const mid = (u.lo + u.hi) / 2;
      if (u.g >= 0.7) m.cooling = true; if (u.g <= 0.3) m.cooling = false;
      return { at: i, hold: !m.cooling && u.pos < mid }; };
    m.bad = () => ({ at: m.next, hold: true });
    m.view = () => ({ runs: m.runs.map(u => [+u.heat.toFixed(2), +u.lo.toFixed(2)]) });
    m.panel = (i) => { const u = m.runs[i]; return u ? { label: `Motor ${Math.round(u.g * 100)} % (stall 100)${u.g > 0.75 ? ' HOT' : ''}`, value: `cab ${Math.round(u.pos * 100)} · deck ${Math.round(u.lo * 100)}–${Math.round(u.hi * 100)}`, bar: u.pos, band: [u.lo, u.hi] } : null; };
    m.prompt = (i) => { const u = m.runs[i]; return !u ? '' : u.g > 0.75 ? 'Motor hot — let go of [E] and let it cool' : u.pos >= u.lo && u.pos <= u.hi ? 'In the deck band — leave it there' : 'Hold [E] to run the cab up; let go before the motor stalls'; };
    return m;
  },
});
