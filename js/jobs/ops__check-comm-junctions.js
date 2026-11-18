// Ops: check the comm junctions. Every relay lamp shows green, but the lamp lies. At each relay clip the meter on (hold E) and let the signal
// loss figure settle before letting go. Loss at or under the baseline: the relay is logged fine. Over it: the card is drifting, so tap E to
// reseat it and meter it again. Letting go before the figure settles is reporting off the lamp alone.
import { define, machine, room, rf, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'ops', label: 'Check comm junctions', type: 'loop' },
  title: 'Relay signal-loss metering', dept: 'operations', host: 'room', item: 'tricorder_eng', siteName: 'Relay', verb: 'Meter',
  how: 'At each relay hold E to clip the meter on and wait for the loss figure to settle, then let go. If it reads over the baseline, tap E to reseat the card and meter it again.',
  keys: ['E hold: meter until steady', 'E tap: reseat a drifting card'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'meter and reseat', input: 'e-hold+e-tap', win: 'every relay metered to a steady loss figure, and each drifting card reseated and re-metered under baseline',
    fail: 'letting go before the loss figure settles, so a relay is passed on its lamp alone',
    rule: 'Hold E: the loss figure climbs and settles after about a second (STEADY). Let go then. Over baseline means DRIFT: tap E once to reseat, then hold again to re-read.' },
  rush: 'Glanced at the green lamps and signed the junction sheet.',
  captions: { 'lamp only': 'meter clip snaps off' }, says: { 'lamp only': 'You let go before the figure settled — the lamp is not a reading. Hold E until it says STEADY.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Relay 1', prop: 'relayrack' }, { name: 'Relay 2', prop: 'servers' }, { name: 'Relay 3', prop: 'relayrack' }, { name: 'Relay 4', prop: 'servers' }]), r = m.rnd;
    const settle = m.calm ? 0.8 : 1.0, B = +rf(r, 2.6, 3.4).toFixed(1), drift = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, 1 + Math.floor(r() * 2)));
    m.base = B; m.rel = m.sites.map((_, i) => ({ loss: drift.has(i) ? +(B + rf(r, 1.2, 3)).toFixed(1) : +(B - rf(r, 0.3, 1.4)).toFixed(1), held: 0, rd: 0, phase: 'read', seated: false }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, q = m.rel[i];
      if (q.phase === 'reseat') { if (inp.press) { q.phase = 'read'; q.loss = +(B - rf(m.rnd, 0.3, 1)).toFixed(1); q.seated = true; q.held = 0; q.rd = 0; m.ev('reseat', { site: i }); } s.prog = 0.5; return; }
      if (inp.hold) { q.held += dt; q.rd = q.loss * clamp(q.held / settle); }
      if (rel) {
        if (q.held < settle) m.fault('lamp only');
        else if (q.loss > B) { q.phase = 'reseat'; m.ev('drift', { site: i }); }
        else { m.finish(i); return; }
        q.held = 0; q.rd = 0;
      }
      s.prog = clamp((q.seated ? 0.5 : 0) + q.held / settle * 0.45, 0, 0.95);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const q = m.rel[i]; if (q.phase === 'reseat') return { at: i, press: true, hold: false }; return { at: i, hold: q.held < settle + 0.1 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 12 < 6, press: f % 12 === 0 });
    m.view = () => ({ base: m.base, loss: m.rel.map(q => q.loss) });
    m.panel = (i) => { const q = m.rel[i]; if (!q) return null; if (q.phase === 'reseat') return { label: 'DRIFT', value: `over ${B} dB — tap to reseat`, bar: 1 }; const st = q.held >= settle; return { label: st ? 'STEADY' : 'Loss', value: `${q.rd.toFixed(1)} dB (baseline ${B})`, bar: clamp(q.rd / (B * 2)), band: [0, 0.5] }; };
    m.prompt = (i) => { const q = m.rel[i]; return !q ? '' : q.phase === 'reseat' ? 'Loss over baseline — tap [E] to reseat the relay card' : q.held >= settle ? 'Figure is steady — let go of [E] to log it' : 'Hold [E] to clip the meter on; wait for the figure to settle'; };
    return m;
  },
});
