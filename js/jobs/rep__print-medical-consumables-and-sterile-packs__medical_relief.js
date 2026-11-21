// Replicator tech: print medical consumables and sterile packs. Lay the seal strip across each pack flap: hold E and sweep the view steadily to the
// right at an even pace. Too slow leaves gaps and too fast tears the strip. Letting go before the flap is covered lifts the strip.
import { define, machine, room, clamp } from './kit.js';

export default define({
  job: { billet: 'rep', label: 'Print medical consumables and sterile packs', type: 'task:medical_relief' },
  title: 'Sweep the seal strip', dept: 'services', host: 'room', siteName: 'Pack', verb: 'Seal',
  how: 'Hold E at the pack and sweep your view to the right at a steady, moderate pace. The panel shows the speed band. Keep to it until the strip covers the flap.',
  keys: ['E hold', 'sweep view right at an even pace'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'lay seal strip', input: 'e-hold+swing', win: 'three packs each with the seal strip laid along the flap by a steady rightward sweep inside the speed band',
    fail: 'sweeping too fast so the strip tears, or letting go of E before the flap is covered',
    rule: 'While holding E, rightward view speed between the slow mark and the fast mark lays the strip. Faster tears it; slower than the mark lays nothing.' },
  rush: 'Slapped one strip across each tray and sent them to sickbay unchecked.',
  captions: { 'torn strip': 'strip tears', 'lifted strip': 'seal strip peels' }, says: { 'torn strip': 'Too fast: the strip tore. Sweep right more slowly.', 'lifted strip': 'You let go before the flap was covered. Keep holding E.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Pack 1', prop: 'shelving' }, { name: 'Pack 2', prop: 'locker' }, { name: 'Pack 3', prop: 'console' }]), r = m.rnd;
    const lo = m.calm ? 0.2 : 0.3, hi = m.calm ? 1.0 : 0.85; m.len = m.sites.map(() => 0.5 + r() * 0.5); m.p = 0; m.fast = 0;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const rel = m.released(inp), s = m.cur(inp); if (!s) { m.p = 0; return; } const v = -(inp.swing || 0), i = m.next;
      if (inp.hold) { if (v > hi) { m.fast += dt; if (m.fast > 0.15) { m.fault('torn strip'); m.p = 0; m.fast = 0; } } else { m.fast = 0; if (v >= lo) m.p += v * dt / m.len[i]; } if (m.p >= 1) { m.p = 0; m.finish(i); return; } }
      if (rel && m.p > 0.02) { m.fault('lifted strip'); m.p = 0; }
      s.prog = clamp(m.p) * 0.95;
    };
    m.hint = () => ({ at: m.next, hold: true, swing: -(lo + hi) / 2 });
    m.bad = () => ({ at: m.next, hold: true, swing: -hi * 2.5 });
    m.view = () => ({ len: m.len.map(x => +x.toFixed(2)), band: [lo, hi] });
    m.panel = () => ({ label: 'Strip', value: `${Math.round(clamp(m.p) * 100)} %  pace ${lo}-${hi}`, bar: clamp(m.p) });
    m.prompt = () => 'Hold [E] and sweep your view right at an even pace';
    return m;
  },
});
