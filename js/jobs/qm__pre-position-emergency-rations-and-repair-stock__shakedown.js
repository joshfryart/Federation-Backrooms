// Quartermaster: stage emergency stock. At each staging mark hold E to set the case down, aiming the view at the bulkhead side marked on the
// panel. Drifting to the corridor centre while setting down puts the case in the exit path and starts it over.
import { define, machine, room, pick, clamp } from './kit.js';

export default define({
  job: { billet: 'qm', label: 'Pre-position emergency rations and repair stock', type: 'task:shakedown' },
  title: 'Set cases against the bulkhead', dept: 'services', host: 'room', siteName: 'Staging mark', verb: 'Stage',
  how: 'The panel says which side the bulkhead is on. Hold E to lower the case and keep the view aimed at that side. If you drift toward the corridor centre the case blocks the exit.',
  keys: ['E hold: set the case down', 'look: keep on the bulkhead side'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'set against bulkhead', input: 'e-hold+look', win: 'three staging cases lowered against the marked bulkhead side without ever crossing the exit path',
    fail: 'drifting the view toward the corridor centre while setting down so the case sits in the exit path',
    rule: 'Hold E to lower the case for about a second while the view stays on the bulkhead side the panel names. Looking back toward the centre line blocks the exit and resets it.' },
  rush: 'Dropped the cases in the doorway for speed and stamped the staging log.',
  captions: { blocked: 'exit path blocked' }, says: { blocked: 'The case went down in the exit path. Keep it against the bulkhead.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [0, 1, 2].map(i => ({ name: `Staging mark ${i + 1}`, prop: i === 1 ? 'locker' : 'shelving' }))), r = m.rnd, tol = m.calm ? 0.2 : 0.15;
    m.c = [0, 1, 2].map(() => ({ side: pick(r, [-0.4, 0.4]), h: 0 }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); m.released(inp); if (!s) return; const i = m.next, c = m.c[i];
      if (!inp.hold) { c.h = Math.max(0, c.h - dt * 2); s.prog = c.h * 0.9; return; }
      if (Math.abs((inp.look || 0) - c.side) > tol && c.h > 0.05) { m.fault('blocked'); c.h = 0; } else if (Math.abs((inp.look || 0) - c.side) <= tol) c.h += dt / 1.0;
      if (c.h >= 1) m.finish(i); else s.prog = c.h * 0.9;
    };
    m.hint = () => { const i = m.next; return i < 0 ? { at: -1 } : { at: i, hold: true, look: m.c[i].side }; };
    m.bad = (f = 0) => ({ at: m.next, hold: true, look: f % 12 < 6 ? m.c[m.next].side : 0 });
    m.view = () => ({ side: m.c.map(c => c.side) });
    m.panel = (i) => { const c = m.c[i]; return c ? { label: 'Bulkhead on the ' + (c.side > 0 ? 'LEFT' : 'RIGHT'), value: Math.round(c.h * 100) + ' % lowered', bar: clamp(c.h) } : null; };
    m.prompt = (i) => `Hold [E] to lower the case, keep looking ${m.c[i]?.side > 0 ? 'left' : 'right'} at the bulkhead`;
    return m;
  },
});
