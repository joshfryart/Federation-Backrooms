// Reactor specialist: hold steady output during a scan. Take the output lever in hand (hold E) and keep it for the whole scan countdown. The
// core output wanders; you counter it by leaning the lever, which here is the view: turn left to push output down, right to lift it, and keep
// the needle in the scan band. Let go mid-scan and the scan data is torn; let the needle sit outside the band and it fluctuates; when the count
// ends, release to neutral promptly or the lever kicks.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'reactor', label: 'Hold steady output during scan', type: 'task:survey' },
  title: 'Output lever hold through the scan', dept: 'engineering', host: 'room', siteName: 'Scan', verb: 'Hold',
  how: 'Hold E on the output lever for the whole scan count. The needle wanders: turn your view against it (left lowers output, right raises it) to keep it in the band. When the count ends, let go.',
  keys: ['E hold: grip the lever', 'turn the view to lean it', 'let go when the scan ends'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'lean the lever', input: 'e-hold+look', win: 'output needle kept inside the scan band for every full scan countdown, lever released to neutral at the end',
    fail: 'letting go of the lever mid-scan, letting the needle wander out of the band, or hanging on past the count',
    rule: 'While E is held the needle reads drift plus your lean: aim the view opposite the drift to centre it. Out of the band for under half a second is tolerated. Release within a second of SCAN DONE.' },
  rush: 'Jammed the output lever in its notch with a spanner and logged the scan.',
  captions: { torn: 'scan tone breaks', fluctuation: 'output warble', kick: 'lever clunks' },
  says: { torn: 'You let go mid-scan: the scan data tore. Hold the lever through the count.', fluctuation: 'Output fluctuated outside the band: lean against the drift.', kick: 'Scan was done: release the lever to neutral.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Output lever, scan pass 1', prop: 'warpcore' }, { name: 'Output lever, scan pass 2', prop: 'reactorstation' }]), r = m.rnd;
    const band = m.calm ? 0.2 : 0.14, dur = m.calm ? 5 : 5.5, gain = 2;
    m.sc = m.sites.map(() => ({ a: rf(r, 0.22, 0.3), w: rf(r, 0.9, 1.4), p: rf(r, 0, 6), b: rf(r, 0.12, 0.18), w2: rf(r, 2.2, 3.1), p2: rf(r, 0, 6), cnt: 0, out: 0, after: 0, t0: 0, done: false, peak: 0 }));
    m.drift = (i) => { const s = m.sc[i], u = m.t; return s.a * Math.sin(s.w * u + s.p) + s.b * Math.sin(s.w2 * u + s.p2); };
    m.needle = 0;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const st = m.cur(inp), rel = m.released(inp); if (!st) return; const i = m.next, s = m.sc[i];
      m.needle = m.drift(i) + gain * (inp.hold ? (inp.look || 0) : 0);
      if (s.done) { if (rel || !inp.hold) { m.finish(i); return; } s.after += dt; if (s.after > 1) { m.fault('kick'); s.after = 0; } return; }
      if (rel && s.cnt > 0.2) { m.fault('torn'); s.cnt = 0; s.out = 0; }
      if (inp.hold) { s.cnt += dt; s.peak = Math.max(s.peak, Math.abs(m.needle));
        if (Math.abs(m.needle) > band) { s.out += dt; if (s.out > 0.5) { m.fault('fluctuation'); s.out = 0; s.cnt = 0; } } else s.out = 0;
        if (s.cnt >= dur) { s.done = true; m.ev('scan done', { site: i }); } }
      st.prog = clamp(s.cnt / dur) * 0.9;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const s = m.sc[i]; return { at: i, hold: !s.done, look: -m.drift(i) / gain }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 40 < 30, look: 0 });
    m.view = () => ({ sc: m.sc.map(s => [+s.a.toFixed(3), +s.w.toFixed(3)]) });
    m.panel = (i) => { const s = m.sc[i]; if (!s) return null; if (s.done) return { label: 'SCAN DONE', value: 'release to neutral', bar: 1 };
      const n = m.needle; return { label: `Output ${n > band ? 'HIGH' : n < -band ? 'LOW' : 'in band'} ${n >= 0 ? '+' : ''}${n.toFixed(2)}`, value: `scan ${Math.max(0, dur - s.cnt).toFixed(1)} s`, bar: clamp(0.5 + n), band: [0.5 - band, 0.5 + band] }; };
    m.prompt = (i) => { const s = m.sc[i]; return !s ? '' : s.done ? 'Scan done: let go of [E]' : 'Hold [E] on the lever; turn your view against the needle drift to keep it in the band'; };
    return m;
  },
});
