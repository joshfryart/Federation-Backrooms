// Reactor specialist: watch core temperatures at high output. The gauge wanders and throws short spikes over the warning tick that fall back
// on their own. Call the crossing (Space) only when the reading has really gone over and stayed there; calling a spike is a false alarm, and
// sitting on a real crossing too long is a miss.
import { define, machine, SPACE, rf, txt, bar, COL } from './kit.js';

export default define({
  job: { billet: 'reactor', label: 'Watch core temps at high output', type: 'task:medical_relief' },
  title: 'Core temperature crossing call', dept: 'engineering', host: 'console', tool: 'Core temperature rail',
  how: 'Watch the core temperature. Short spikes over the warning tick drop back by themselves; when it goes over and stays over, call it (Space).',
  keys: ['Space call the crossing'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'call the crossing', input: 'space', win: 'three sustained warning crossings called promptly with no false alarms',
    fail: 'calling a transient spike or a reading under the tick, or letting a sustained crossing run uncalled',
    rule: 'A reading that pokes over the warning tick and falls back within half a second is a spike: ignore it. Once it has stayed over for about half a second, press Space; wait more than two seconds and it is a miss.' },
  rush: 'Called every flicker over the line and let the reactor crew sort it out.',
  captions: { 'false call': 'false-alarm tone', missed: 'core alarm sounds' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, late = m.calm ? 2.6 : 2.0;
    m.seg = []; let t = 0.8; for (let k = 0; k < 3; k++) { const sp = 1 + Math.floor(r() * 2); for (let j = 0; j < sp; j++) { t += rf(r, 1.0, 1.8); m.seg.push({ a: t, b: t + rf(r, 0.2, 0.35), spike: true }); } t += rf(r, 1.0, 1.6); m.seg.push({ a: t, b: t + 3.5, spike: false, called: false }); t += 3.5 + rf(r, 0.3, 0.6); }
    m.wob = rf(r, 0, 6); m.hits = 0; m.rounds = 3; m.round = 0;
    const segAt = (x) => m.seg.find(s => x >= s.a && x <= s.b && !(s.called || s.missed));
    m.read = () => { const s = segAt(m.t); return s ? 0.62 + 0.05 * Math.sin(m.t * 9 + m.wob) : 0.42 + 0.08 * Math.sin(m.t * 2.3 + m.wob) + 0.04 * Math.sin(m.t * 7.1); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down || !SPACE(code)) return false; const s = segAt(m.t);
      if (!s || s.spike || m.t - s.a < 0.3) { m.fault('false call'); return true; }
      s.called = true; m.hits++; m.round++; if (m.hits >= 3) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; for (const s of m.seg) if (!s.spike && !s.called && !s.missed && m.t > s.a + late) { s.missed = true; m.fault('missed'); m.hits++; if (m.hits >= 3 && m.state === 'play') m.fail('missed'); } };
    m.hint = () => { const s = segAt(m.t); return s && !s.spike && m.t - s.a >= 0.5 ? [['Space', true]] : []; };
    m.bad = () => { const s = segAt(m.t); return s && s.spike ? 'Space' : null; };
    m.view = () => ({ seg: m.seg.map(s => [+s.a.toFixed(2), s.spike]) });
    m.buttons = () => [['Space', 'Call it']];
    m.draw = (c, W, H, P) => {
      const v = m.read(), x0 = 40, y0 = 14, h = 120; c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(x0, y0, 34, h);
      c.fillStyle = v > 0.6 ? COL.warn : COL.gold; c.fillRect(x0 + 6, y0 + h - v * h, 22, v * h);
      c.fillStyle = P.bad; c.fillRect(x0 - 8, y0 + h - 0.6 * h - 1, 50, 3); txt(c, 'WARN', x0 + 46, y0 + h - 0.6 * h + 4, { size: 10, col: P.bad });
      txt(c, `${Math.round(1600 + v * 900)} K`, 130, 50, { size: 26, col: v > 0.6 ? COL.warn : COL.ink });
      txt(c, `crossings called ${m.seg.filter(s => s.called).length} / 3`, 130, 84, { size: 12, col: COL.pale });
      const s = segAt(m.t); txt(c, s ? `over the tick ${(m.t - s.a).toFixed(1)} s` : 'below the tick', 130, 108, { size: 12, col: s ? COL.warn : COL.dim });
      bar(c, 130, 120, 240, 8, s && !s.spike ? Math.min(1, (m.t - s.a) / late) : 0, { col: COL.peri });
    };
    return m;
  },
});
