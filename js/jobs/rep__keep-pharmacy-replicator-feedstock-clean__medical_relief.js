// Replicator tech: keep the pharmacy replicator feedstock clean. Each wipe is ONE stroke: hold E for about half a second and let go. The swab shows how
// much residue it picked up. When a swab comes away clean (under 15 %) that nozzle is done. Dry dabs and long drags are faults.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'rep', label: 'Keep pharmacy replicator feedstock clean', type: 'task:medical_relief' },
  title: 'Single-stroke nozzle swab', dept: 'services', host: 'room', siteName: 'Nozzle', verb: 'Swab',
  how: 'Hold E for one steady stroke of about half a second, then let go. Read the swab. Repeat until a swab comes away clean (under 15 %).',
  keys: ['E hold 0.4 to 0.9 s: one stroke'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'single-stroke swab', input: 'e-hold', win: 'two feed nozzles each wiped in single timed strokes until a swab comes away clean',
    fail: 'a dabbed stroke under 0.4 s or a dragged stroke over 0.9 s that smears residue back',
    rule: 'Each stroke is a hold of 0.4 to 0.9 s. The swab reading is the residue it took; a reading under 15 % ends that nozzle.' },
  rush: 'Wiped the nozzle once, called it clean and closed the hatch.',
  captions: { 'dry dab': 'swab squeaks dry', dragged: 'swab drags across nozzle' }, says: { 'dry dab': 'Too short: a dab does not wipe. Hold for a full stroke.', dragged: 'You dragged it too long and smeared residue back.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Feed nozzle A', prop: 'console' }, { name: 'Feed nozzle B', prop: 'locker' }]), r = m.rnd, lo = m.calm ? 0.3 : 0.4, hi = m.calm ? 1.2 : 0.9;
    m.nz = m.sites.map(() => ({ res: 1, f: rf(r, 0.3, 0.5) })); m.hh = 0; m.swab = 1;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const rel = m.released(inp), s = m.cur(inp); if (!s) { m.hh = 0; return; } const n = m.nz[m.next], i = m.next;
      if (inp.hold) { m.hh += dt; if (m.hh > hi + 0.15) { m.fault('dragged'); n.res = Math.min(1, n.res + 0.2); m.hh = 0; } }
      if (rel && m.hh > 0) { const h = m.hh; m.hh = 0; if (h < lo) m.fault('dry dab'); else if (h <= hi) { m.swab = n.res; n.res *= n.f; if (m.swab < 0.15) { m.finish(i); return; } } }
      s.prog = clamp(1 - n.res) * 0.9;
    };
    m.hint = () => ({ at: m.next, hold: m.hh < (lo + hi) / 2 - 0.05 + 0.1 });
    m.bad = () => ({ at: m.next, hold: m.hh < 0.1 });
    m.view = () => ({ f: m.nz.map(n => +n.f.toFixed(2)) });
    m.panel = (i) => ({ label: `swab ${Math.round(m.swab * 100)} %`, value: m.hh > 0 ? `stroke ${m.hh.toFixed(1)} s` : 'ready', bar: clamp(m.hh / hi), band: [lo / hi, 1] });
    m.prompt = () => 'Hold [E] for one stroke (about half a second) and let go';
    return m;
  },
});
