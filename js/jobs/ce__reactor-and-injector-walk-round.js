// Chief engineer: reactor and injector walk-round. Hold the infrared thermometer on each injector port (E held, view on the port) and let it
// take four readings. Warm-up drift rises and flattens; a real trend keeps creeping by the same step. Then give the verdict: keep holding to
// initial the reading as nominal, or let go and tap E to flag the drift in the log. Releasing before four readings logs a stale figure.
import { define, machine, room, ri, rf, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'ce', label: 'Reactor and injector walk-round', type: 'loop' },
  title: 'Injector port trend reading', dept: 'engineering', host: 'room', item: 'tricorder_eng', siteName: 'Port', verb: 'Read',
  how: 'Hold E with the thermometer on each injector port until it has four readings. If the steps shrink it is warm-up: keep holding to initial it nominal. If they keep climbing, let go and tap E to flag the drift.',
  keys: ['E hold, view on the port: read', 'keep holding: log nominal', 'let go, tap E: flag drift'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'trend-read', input: 'e-hold+e-tap+look', win: 'every injector port sampled four times and logged with the right verdict, settling warm-up initialled and creeping trends flagged',
    fail: 'initialling a creeping port as nominal, flagging a settling one, or logging before the fourth sample (a stale figure)',
    rule: 'Keep the view on the port with E held: a sample lands every half second. After four, compare the steps: shrinking steps mean warm-up (keep holding to initial), equal steps mean a trend (release and tap to flag).' },
  rush: 'Glanced at the four gauges from the railing and copied last watch\'s trims into the log.',
  captions: { 'drift logged nominal': 'logbook snaps shut', 'false drift': 'XO sighs over comm', 'stale reading': 'thermometer beeps twice' },
  says: { 'drift logged nominal': 'That port is still creeping — the steps were not shrinking. Re-read it and flag the drift.', 'false drift': 'That was warm-up: the steps were settling. Re-read it and initial it nominal.', 'stale reading': 'Released before the fourth reading — that figure is stale. Hold on the port until all four are in.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Injector port 1', prop: 'warpcore' }, { name: 'Injector port 2', prop: 'reactorstation' }, { name: 'Injector port 3', prop: 'warpcore' }, { name: 'Injector port 4', prop: 'fieldgen' }]), r = m.rnd;
    const tol = m.calm ? 0.3 : 0.2, gap = 0.5, initial = m.calm ? 0.8 : 1.0, drifting = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 1, 2)));
    m.ports = m.sites.map((_, i) => ({ drift: drifting.has(i), base: ri(r, 380, 460), step: rf(r, 2.4, 3.6), first: rf(r, 4, 6), s: [], acc: 0, phase: 'read', held: 0 }));
    const sample = (p, n) => p.drift ? p.base + p.step * (n + 1) : p.base + p.first * (1 - Math.pow(0.35, n + 1)) / 0.65;
    const reset = (p) => { p.s = []; p.acc = 0; p.phase = 'read'; p.held = 0; };
    m.was = false;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) { m.was = !!inp.hold; return; }
      const i = m.next, p = m.ports[i], down = inp.hold && !m.was; m.was = !!inp.hold;
      if (p.phase === 'read') {
        if (inp.hold) {
          if (Math.abs(inp.look || 0) > tol) { p.s = []; p.acc = 0; }
          else if (p.s.length < 4) { p.acc += dt; if (p.acc >= gap) { p.acc = 0; p.s.push(Math.round(sample(p, p.s.length) * 10) / 10); } }
          else { p.held += dt; if (p.held >= initial) { if (p.drift) { m.fault('drift logged nominal'); reset(p); } else m.finish(i); } }
        }
        if (rel) { if (p.s.length >= 4) { p.phase = 'verdict'; p.held = 0; } else if (p.s.length > 0) { m.fault('stale reading'); reset(p); } }
      } else {
        if (down) p.held = 0; if (inp.hold) p.held += dt;
        if (inp.hold && p.held >= initial) { if (p.drift) { m.fault('drift logged nominal'); reset(p); } else m.finish(i); }
        else if (rel && p.held < 0.4) { if (p.drift) m.finish(i); else { m.fault('false drift'); reset(p); } }
      }
      if (!s.done) s.prog = clamp(p.s.length / 4 * 0.8, 0, 0.9);
    };
    const steps = (p) => p.s.slice(1).map((v, k) => +(v - p.s[k]).toFixed(1));
    m.hint = (f = 0) => {
      const i = m.next; if (i < 0) return { at: -1 }; const p = m.ports[i];
      if (p.phase === 'read' && p.s.length < 4) return { at: i, hold: true, look: 0 };
      const st = steps(p), creeping = st[2] >= st[0] * 0.8;
      if (!creeping) return { at: i, hold: true, look: 0 };
      if (p.phase === 'read') return { at: i, hold: false, look: 0 };
      const tap = f % 6 === 0; return { at: i, hold: tap, press: tap, look: 0 };
    };
    m.bad = () => ({ at: m.next, hold: true, look: 0 });
    m.view = () => ({ ports: m.ports.map(p => [p.drift, p.base]) });
    m.panel = (i) => { const p = m.ports[i]; if (!p) return null; const st = steps(p);
      return { label: p.s.length < 4 ? `Port ${i + 1} reading ${p.s.length}/4` : `steps ${st.map(x => '+' + x).join(' ')}`, value: p.s.length ? p.s.map(v => v.toFixed(1)).join(' → ') + ' K' : 'aim at the port', bar: p.phase === 'verdict' ? p.held / initial : p.s.length / 4 }; };
    m.prompt = (i) => { const p = m.ports[i]; return !p ? '' : p.s.length < 4 ? 'Hold [E] with the thermometer on the port: four readings' : p.phase === 'read' ? 'Steps shrinking: keep holding [E] to initial nominal. Still climbing: let go, then tap [E] to flag the drift' : 'Tap [E] to flag the drift, or hold [E] to initial nominal'; };
    return m;
  },
});
