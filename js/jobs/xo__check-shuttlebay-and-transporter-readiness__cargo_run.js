// XO: check shuttlebay and transporter readiness. Don't trust the ready lamps: sight each pad mark along the floor grid and read each
// shuttle's pressure gauge through the door port. Hold E and keep your head still while the reading settles; any turn of the view blurs it
// and the read starts over (a fault). A reading that comes up LOW or OUT OF LINE must be tagged with a tap of E before you move on.
import { define, machine, room, rf, shuffle, ri } from './kit.js';

export default define({
  job: { billet: 'xo', label: 'Check shuttlebay and transporter readiness', type: 'task:cargo_run' },
  title: 'Steady-sight readiness check', dept: 'command', host: 'room', siteName: 'Check point', verb: 'Sight',
  how: 'At each mark or gauge hold E and keep the view perfectly still until the reading settles, then let go. If it reads LOW or OUT OF LINE, tap E once more to tag it not ready.',
  keys: ['E hold: sight (keep still)', 'E tap: tag not ready'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'steady sight', input: 'e-hold+e-tap+turn', win: 'every pad mark and shuttle gauge read with a still head, and each low or misaligned one tagged not ready',
    fail: 'turning the head while sighting so the reading blurs, letting go before it settles, or walking on from a low gauge untagged',
    rule: 'Hold E without turning: the settle bar fills over about a second. Turning more than a tiny amount blurs it. Let go when it settles; a LOW or OUT OF LINE result needs one more tap of E to tag it.' },
  rush: 'Read five green lamps off the shuttlebay console and called the bay ready.',
  captions: { blurred: 'reading smears', 'half read': 'needle still swinging', untagged: 'chief coughs' }, says: { blurred: 'You moved — the reading blurred. Keep your head still while it settles.', 'half read': 'It had not settled yet. Hold still until the bar fills.', untagged: 'That one read low — tag it before moving on.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Transporter pad marks', prop: 'pad' }, { name: 'Shuttle 1 pressure gauge', prop: 'shuttle' }, { name: 'Shuttle 2 pressure gauge', prop: 'workpod' }]), r = m.rnd;
    const still = m.calm ? 0.5 : 0.35, bad = new Set(shuffle(r, [0, 1, 2]).slice(0, ri(r, 1, 2)));
    m.pts = m.sites.map((s, i) => ({ bad: bad.has(i), need: rf(r, 0.9, 1.3), got: 0, read: false, val: i === 0 ? (bad.has(i) ? `${ri(r, 4, 9)} mm off line` : 'on line') : `${bad.has(i) ? ri(r, 61, 78) : ri(r, 96, 103)} kPa`, cool: 0 }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, p = m.pts[i]; p.cool = Math.max(0, p.cool - dt);
      if (p.read) { if (inp.press) { m.ev('tagged', { site: i }); m.finish(i); } return; }
      if (inp.hold) { if ((inp.turn || 0) > still) { if (!p.cool && p.got > 0.05) { m.fault('blurred'); p.cool = 0.6; } p.got = 0; } else p.got = Math.min(p.need, p.got + dt); }
      if (rel) { if (p.got >= p.need) { if (p.bad) p.read = true; else m.finish(i); } else if (p.got > 0.1) m.fault('half read'); p.got = 0; }
      s.prog = p.read ? 0.9 : p.got / p.need * 0.85;
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const p = m.pts[i]; if (p.read) return { at: i, hold: f % 2 === 0, press: f % 2 === 0, turn: 0 }; return { at: i, hold: p.got < p.need, turn: 0.05 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: true, turn: f % 20 < 10 ? 0 : 2 });
    m.view = () => ({ pts: m.pts.map(p => [p.bad, p.val]) });
    m.panel = (i) => { const p = m.pts[i]; if (!p) return null; const done = p.got >= p.need || p.read;
      return { label: p.read ? (i === 0 ? 'OUT OF LINE — tap to tag' : 'LOW — tap to tag') : done ? 'Settled: let go' : 'Settling… keep still', value: done ? p.val : '—', bar: p.read ? 1 : p.got / p.need, band: [0.97, 1] }; };
    m.prompt = (i) => { const p = m.pts[i]; return !p ? '' : p.read ? 'Reading is bad — tap [E] to tag it not ready' : 'Hold [E] and keep your head still until the reading settles, then let go'; };
    return m;
  },
});
