// Guard: check the internal sensors cover the main corridors. Hold E to walk the wall with the coverage meter at chest height; let go to stop.
// Where the needle drops to zero you are in a blind spot: stop inside it and tap E to mark the wall panel. At the far end you walk back the other
// way: a real blind spot drops the needle again and must be confirmed with another mark; a dip that does not come back was interference, so walk
// on through it. Walking through a blind spot without marking it, or marking a wall that reads fine, are faults.
import { define, machine, room, rf, ri } from './kit.js';

const HW = 0.045;
export default define({
  job: { billet: 'guard', label: 'Check internal sensors cover the main corridors', type: 'task:survey' },
  title: 'Two-way corridor blind-spot walk', dept: 'security', host: 'room', item: 'tricorder_sec', siteName: 'Corridor', verb: 'Walk',
  how: 'Hold E to walk the corridor wall with the coverage meter, let go to stop. When the needle drops to zero, stop inside the dip and tap E to mark it. Walk back and mark each spot again only if it dips again.',
  keys: ['E hold: walk', 'release + E tap: mark a blind spot'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'two-way dip walk', input: 'e-hold+e-tap',
    win: 'each corridor walked out and back, every zero-coverage blind spot marked on the way out and reconfirmed on the return, one-way interference left unmarked',
    fail: 'walking straight through a coverage dip without marking it, or marking a stretch of wall that reads normal',
    rule: 'Hold E to advance; the needle shows coverage at your spot. Stop inside a zero dip and tap E. On the return pass only dips that read zero again need a second mark.' },
  rush: 'Walked the corridor once at a jog with the meter at hip height.',
  captions: { 'missed dip': 'meter ticks past zero', 'false mark': 'grease pencil squeak' },
  says: { 'missed dip': 'You walked through a blind spot. Stop where the needle hits zero and mark it.', 'false mark': 'Coverage is fine there. Mark only where the needle is at zero.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Main corridor, port wall', prop: 'locker' }, { name: 'Main corridor, starboard wall', prop: 'bunk' }]), r = m.rnd, v = m.calm ? 0.27 : 0.33;
    m.walls = m.sites.map(() => { const a = rf(r, 0.18, 0.4), b = rf(r, 0.6, 0.84), g = ri(r, -1, 1);   // g: which dip (0/1) is one-way interference, -1 none
      return { x: 0, dir: 1, dips: [a, b].map((c, k) => ({ c, ghost: k === g, m1: false, m2: false, gone: false })) }; });
    const dipAt = (w) => w.dips.find(d => Math.abs(w.x - d.c) < HW && (w.dir > 0 || !d.ghost));
    m.read = (i) => { const w = m.walls[i]; if (!w) return 0; return dipAt(w) ? 0 : 0.62 + 0.18 * Math.abs(Math.sin(w.x * 37 + i)); };
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, w = m.walls[i];
      if (inp.press && !m.was) { const d = dipAt(w); if (!d) m.fault('false mark'); else if (w.dir > 0) d.m1 = true; else d.m2 = true; }
      m.was = !!inp.hold;
      if (inp.hold) { const x0 = w.x; w.x = Math.max(0, Math.min(1, w.x + w.dir * v * dt));
        for (const d of w.dips) { const edge = d.c + w.dir * HW, crossed = (x0 - edge) * (w.x - edge) <= 0 && x0 !== edge; if (!crossed) continue;
          if (w.dir > 0 && !d.m1) { m.fault('missed dip'); d.m1 = true; } if (w.dir < 0 && !d.ghost && !d.m2) { m.fault('missed dip'); d.m2 = true; } }
        if (w.dir > 0 && w.x >= 1) w.dir = -1; else if (w.dir < 0 && w.x <= 0) { m.finish(i); return; } }
      s.prog = (w.dir > 0 ? w.x : 2 - w.x) / 2 * 0.95;
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const w = m.walls[i], d = dipAt(w), need = d && (w.dir > 0 ? !d.m1 : !d.m2);
      if (!need) return { at: i, hold: true }; if (Math.abs(w.x - d.c) > HW * 0.5 && m.was) return { at: i, hold: true };
      return m.was ? { at: i, hold: false } : { at: i, hold: true, press: true }; };
    m.bad = () => ({ at: m.next, hold: true });
    m.view = () => ({ walls: m.walls.map(w => w.dips.map(d => [+d.c.toFixed(2), d.ghost])) });
    m.panel = (i) => { const w = m.walls[i]; if (!w) return null; const v0 = m.read(i);
      return { label: `${w.dir > 0 ? 'Out' : 'Back'} · coverage`, value: v0 === 0 ? 'ZERO: blind spot' : `${Math.round(v0 * 100)} %`, bar: v0, band: [0, 0.05] }; };
    m.prompt = (i) => { const w = m.walls[i]; if (!w) return ''; return m.read(i) === 0 ? 'Needle at zero: stop and tap [E] to mark the panel'
      : w.dir > 0 ? 'Hold [E] to walk the wall slowly; watch the needle' : 'Walk back: re-mark only the spots that dip again'; };
    return m;
  },
});
