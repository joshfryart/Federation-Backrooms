// Sensor officer: scan cargo for hazardous signatures (cargo run). Hazard scanner in hand, work along the crate line. At each crate hold E
// to run the scanner head and sweep your view steadily across the door seam: the slow, even swing moves the head along the seam; a fast
// swing skips seam and is a fault. Where the signature light ticks AMBER, stop dead and hold the head there until the light settles: that
// crate is marked on the ticket and held at the door. Sweeping on past an amber tick lets a leaking container load (a fault).
import { define, machine, room, rf, ri, shuffle, clamp } from './kit.js';

const SIGS = ['plasma residue', 'coolant vapour', 'ionising trace', 'volatile organics', 'bio-aerosol'];
export default define({
  job: { billet: 'sensor', label: 'Scan cargo for hazardous signatures', type: 'task:cargo_run' },
  title: 'Crate seam sweep and amber stop', dept: 'sciences', host: 'room', siteName: 'Crate', verb: 'Scan', item: 'tricorder_atmo',
  how: 'Hold E and swing your view slowly and evenly along each crate seam; if the signature light goes amber, stop still and keep holding until it settles to mark the crate.',
  keys: ['E hold: scanner on', 'slow even swing: move along the seam', 'stop still on amber'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'seam sweep', input: 'e-hold+swing', win: 'every crate door seam swept end to end at a steady scanner pace with each amber signature stopped on and settled before marking',
    fail: 'swinging the scanner head so fast it skips seam, or carrying on past an amber tick so a leaking crate loads',
    rule: 'Hold E: your swing speed is the scanner head speed along the seam. Keep it slow (under the pace mark). On AMBER, freeze until the light settles, then carry on to the next crate.' },
  rush: 'Waved the scanner at the stack from the hatch and signed the ticket clean.',
  captions: { 'too fast': 'scanner skips', 'missed leak': 'signature fades behind you', marked: 'ticket stamp' },
  says: { 'too fast': 'Too fast — the head skipped seam. Slow, even sweeps.', 'missed leak': 'You swept past an amber tick. Back up and stop on it.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Crate line 1', prop: 'crate' }, { name: 'Crate line 2', prop: 'pallet_loaded' }, { name: 'Crate line 3', prop: 'crate' }]), r = m.rnd;
    const fast = m.calm ? 1.9 : 1.6, k = 0.28, settleT = m.calm ? 1.0 : 1.2, leaks = new Set(shuffle(r, [0, 1, 2]).slice(0, ri(r, 1, 2)));
    m.cr = m.sites.map((_, i) => ({ id: `CX-${ri(r, 1000, 9999)}`, leak: leaks.has(i), a: rf(r, 0.3, 0.75), sig: SIGS[ri(r, 0, SIGS.length - 1)], p: 0, st: 0, ok: false, cool: 0 }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, c = m.cr[i], sw = Math.abs(inp.swing || 0); c.cool = Math.max(0, c.cool - dt);
      if (!inp.hold) { c.st = 0; return; }
      if (sw > fast) { if (c.cool <= 0) { m.fault('too fast'); c.cool = 1; c.p = Math.max(0, c.p - 0.15); } return; }
      const amber = c.leak && !c.ok && c.p >= c.a;
      if (amber && sw < 0.15) { c.st += dt; if (c.st >= settleT) { c.ok = true; m.ev('marked', { site: i }); m.finish(i); return; } }
      else { c.st = 0; c.p = clamp(c.p + sw * k * dt); if (amber && c.p > c.a + 0.12) { m.fault('missed leak'); c.p = Math.max(0, c.a - 0.15); } if (!c.leak && c.p >= 1) { m.finish(i); return; } }
      s.prog = clamp(c.p * 0.9, 0, 0.9);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const c = m.cr[i], amber = c.leak && !c.ok && c.p >= c.a; return { at: i, hold: true, swing: amber ? 0 : 1.0 }; };
    m.bad = () => ({ at: m.next, hold: true, swing: 3 });
    m.view = () => ({ c: m.cr.map(c => [c.leak, +c.a.toFixed(2)]) });
    m.panel = (i) => { const c = m.cr[i]; if (!c) return null; const amber = c.leak && !c.ok && c.p >= c.a;
      return { label: amber ? `AMBER · ${c.sig}` : `${c.id} seam`, value: amber ? `settling ${Math.round(100 * c.st / settleT)} %` : `${Math.round(c.p * 100)} % swept · light clear`, bar: amber ? c.st / settleT : c.p }; };
    m.prompt = (i) => { const c = m.cr[i]; if (!c) return ''; return c.leak && !c.ok && c.p >= c.a ? 'AMBER — stop moving and keep holding [E] until the light settles' : 'Hold [E] and swing the view slowly and evenly along the seam'; };
    return m;
  },
});
