// Quartermaster: seal a hazmat drum. Hold E to squeeze the crimp tool: a click comes at a point you feel for, no band shown. Let go within a
// moment of the click, then swing the view hard to tug the seal. Letting go before the click leaves it uncrimped; holding on far past it crushes the wire.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'qm', label: 'Seal hazmat and secure cargo', type: 'task:cargo_run' },
  title: 'Crimp until the click then tug', dept: 'services', host: 'room', siteName: 'Drum', verb: 'Seal',
  how: 'Hold E to squeeze the crimp trigger until you hear the click, then let go. Then swing the view hard to tug-test the seal. Too early is uncrimped, far too late crushes it.',
  keys: ['E hold: crimp until click', 'let go', 'swing: tug the seal'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'crimp till click', input: 'e-hold+swing', win: 'two drum seals each squeezed to the click, released promptly, then tug-tested',
    fail: 'letting go before the crimp clicks, or squeezing on well past the click until the wire is crushed',
    rule: 'Hold E: the click comes after a variable squeeze, shown only as CLICK. Release within a second of it. Then swing the view sharply to tug the finished seal.' },
  rush: 'Gave the lid wire one quick pinch and slapped the placard on.',
  captions: { uncrimped: 'seal wire springs loose', crushed: 'crimp crushes wire', click: 'crimp click' }, says: { uncrimped: 'Let go before the click. The seal is not crimped.', crushed: 'Held on past the click and crushed the wire.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Drum 1 seal', prop: 'locker' }, { name: 'Drum 2 seal', prop: 'shelving' }]), r = m.rnd, grace = m.calm ? 1.2 : 0.8;
    m.d = [0, 1].map(() => ({ click: rf(r, 0.9, 1.5), h: 0, crimped: false, lock: false })); m.li = -1;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, d = m.d[i];
      if (m.li !== i) { m.li = i; d.lock = false; d.h = 0; }
      if (d.crimped) { if (Math.abs(inp.swing || 0) > 1.0 && !inp.hold) m.finish(i); s.prog = 0.85; return; }
      if (inp.hold && !d.lock) { d.h += dt; if (d.h === dt || d.h - dt < d.click && d.h >= d.click) m.ev('click', { site: i }); if (d.h > d.click + grace) { m.fault('crushed'); d.lock = true; } }
      if (rel) { if (d.lock) d.lock = false; else if (d.h >= d.click) d.crimped = true; else if (d.h > 0.1) m.fault('uncrimped'); d.h = d.crimped ? d.h : 0; }
      s.prog = clamp(d.h / (d.click + grace)) * 0.7;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const d = m.d[i]; if (d.crimped) return { at: i, hold: false, swing: 1.6 }; return { at: i, hold: d.h < d.click + 0.1 && !d.lock }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 30 < 12 });
    m.view = () => ({ click: m.d.map(d => +d.click.toFixed(2)) });
    m.panel = (i) => { const d = m.d[i]; return d ? { label: d.crimped ? 'Crimped: tug it' : 'Crimp trigger', value: d.crimped ? 'swing to tug' : d.h >= d.click ? 'CLICK' : d.h > 0 ? 'squeezing...' : 'idle', bar: clamp(d.h / 2) } : null; };
    m.prompt = (i) => m.d[i]?.crimped ? 'Swing the view hard to tug-test the seal' : 'Hold [E] to crimp, let go just after the click';
    return m;
  },
});
