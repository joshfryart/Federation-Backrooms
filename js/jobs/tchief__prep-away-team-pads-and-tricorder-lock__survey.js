// Transporter chief: prep the away team pads and the tricorder lock. At each pad, grip the position ring (hold E) and turn it by turning your
// view while the tricorder on the pad centre reads the beacon. The lock strength peaks at one ring position; hold the ring there with your
// head dead still until the board's lock light goes steady, then let go to confirm the beacon channel. Letting go of the ring before the
// lock is steady leaves the pad shifted, and the team would land somewhere else.
import { define, machine, room, rf, clamp } from './kit.js';

export default define({
  job: { billet: 'tchief', label: 'Prep away team pads and tricorder lock', type: 'task:survey' },
  title: 'Position ring to a steady beacon lock', dept: 'operations', host: 'room', item: 'tricorder_eng', siteName: 'Away pad', verb: 'Lock',
  how: 'Hold E to grip each pad\'s position ring and turn your view to rotate it. Find where the beacon signal peaks, keep perfectly still until the lock light is steady, then let go.',
  keys: ['E hold: grip the ring', 'look: rotate it', 'keep still: steady the lock', 'let go when LOCKED'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'tune to lock', input: 'e-hold+look+turn', win: 'every away team pad ring turned to the beacon peak and held still until the board lock light went steady before release',
    fail: 'letting go of the position ring before the lock is steady, so the pad is left shifted off the beacon',
    rule: 'Grip with E; the ring follows your view. The signal bar peaks at one angle. Over 85 % with the view still fills the steady meter; once it reads LOCKED, let go. Moving the head resets the steady meter.' },
  rush: 'Eyeballed each pad marker onto its floor target and called the lock board good.',
  captions: { shifted: 'lock-lost chirp' }, says: { shifted: 'Let go of the ring before the lock was steady: the pad is off its beacon. Grip it and find the peak again.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Away pad 1', prop: 'pad' }, { name: 'Away pad 2', prop: 'pad' }, { name: 'Away pad 3', prop: 'beampedestal' }]), r = m.rnd;
    const w = m.calm ? 0.16 : 0.12, need = m.calm ? 0.8 : 1.0;
    m.pads = m.sites.map(() => ({ tgt: rf(r, -0.42, 0.42), beacon: 'BCN-' + Math.floor(rf(r, 100, 999)), sig: 0, steady: 0, gripT: 0, locked: false }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, p = m.pads[i];
      if (rel) { if (p.locked) { m.ev('confirm', { site: i }); m.finish(i); return; } if (p.gripT > 0.3) m.fault('shifted'); p.gripT = 0; p.steady = 0; }
      if (inp.hold) {
        p.gripT += dt; const d = (inp.look || 0) - p.tgt; p.sig = Math.exp(-((d / w) ** 2));
        if (p.sig > 0.85 && (inp.turn || 0) < 0.2) { p.steady += dt; if (p.steady >= need) p.locked = true; } else if (!p.locked) p.steady = 0;
      }
      s.prog = p.locked ? 0.95 : clamp(p.sig * 0.5 + p.steady / need * 0.4);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const p = m.pads[i]; return p.locked ? { at: i, hold: false } : { at: i, hold: true, look: p.tgt, turn: 0 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 20 < 14, look: 0.5, turn: 0 });
    m.view = () => ({ pads: m.pads.map(p => [+p.tgt.toFixed(2), p.beacon]) });
    m.panel = (i) => { const p = m.pads[i]; if (!p) return null; return { label: p.locked ? `${p.beacon} LOCKED` : `${p.beacon} signal`, value: p.locked ? 'let go to confirm' : `${Math.round(p.sig * 100)} % · steady ${Math.round(p.steady / need * 100)} %`, bar: p.sig, band: [0.85, 1] }; };
    m.prompt = (i) => { const p = m.pads[i]; if (!p) return ''; return p.locked ? 'Lock light steady: let go of [E] to confirm the beacon channel' : 'Hold [E] and turn to find the signal peak, then keep perfectly still'; };
    return m;
  },
});
