// Cargo: stage cargo for the pads or shuttlebay. Push the grav sled up the ramp (hold E) and lean your view against the sideways drift that
// tries to slide the load off-centre. Keep the load near the centreline until the sled reaches the pad footprint. An off-centre load tips.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'cargo', label: 'Stage cargo for the pads or shuttlebay', type: 'loop' },
  title: 'Sled drift trim', dept: 'services', host: 'room', siteName: 'Ramp', verb: 'Push',
  how: 'Hold E to push the sled along the ramp. The load drifts sideways; turn your view the opposite way to bring it back to the centre. Do not let it slide off the line.',
  keys: ['E hold: push the sled', 'look: lean against the drift'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'steer the sled', input: 'e-hold+look',
    win: 'every sled pushed the full ramp to its pad with the load held near the centre line',
    fail: 'letting the sideways drift carry the load past the tip line so the crate topples',
    rule: 'Holding E pushes the sled along the ramp. The offset gauge slides left or right with the ramp camber; turn your view the other way to cancel it. Off-centre too long and the load tips.' },
  rush: 'Shoved the sled through the door and hoped it stayed straight.',
  captions: { tipped: 'crate thuds over' },
  says: { tipped: 'The load slid off-centre and the crate tipped.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Bay ramp', prop: 'pallet_loaded' }, { name: 'Transporter pad', prop: 'cargo_pad' }]), r = m.rnd, lim = m.calm ? 0.8 : 0.65;
    m.ramps = m.sites.map(() => ({ a: rf(r, 0.85, 1.1), w: rf(r, 1.0, 1.8), ph: rf(r, 0, 6), off: 0, x: 0, bad: 0 }));
    const drift = (q) => q.a * Math.sin(m.t * q.w + q.ph);
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, q = m.ramps[i];
      if (inp.hold) q.x = clamp(q.x + dt / 6, 0, 1);
      q.off = clamp(drift(q) - (inp.look || 0) * 2, -1, 1) * (inp.hold ? 1 : 0.4);
      if (Math.abs(q.off) > lim) { q.bad += dt; if (q.bad > 0.4) { m.fault('tipped'); q.bad = 0; q.x = Math.max(0, q.x - 0.25); } } else q.bad = Math.max(0, q.bad - dt);
      s.prog = s.done ? 1 : q.x * 0.95; if (q.x >= 1 && m.state === 'play') m.finish(i);
    };
    m.hint = () => { const i = m.next; return i < 0 ? { at: -1 } : { at: i, hold: true, look: clamp(drift(m.ramps[i]) / 2, -0.5, 0.5) }; };
    m.bad = () => ({ at: m.next, hold: true, look: 0 });
    m.view = () => ({ ramps: m.ramps.map(q => [+q.a.toFixed(2), +q.w.toFixed(2)]) });
    m.panel = (i) => { const q = m.ramps[i]; return q ? { label: 'Load offset', value: q.off < -0.15 ? '< left' : q.off > 0.15 ? 'right >' : 'centred', bar: (q.off + 1) / 2, band: [0.5 - lim / 2, 0.5 + lim / 2] } : null; };
    m.prompt = (i) => 'Hold [E] to push the sled and turn your view against the drift';
    return m;
  },
});
