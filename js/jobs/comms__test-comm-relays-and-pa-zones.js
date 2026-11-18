// Comms officer: test comm relays and PA zones. Clip the noise probe to each relay card's port (hold E): the needle swings up slowly and
// lags, so keep the probe on until it stops moving. Let go to log the reading. Under the baseline mark the card passes; over it the card is
// rocking in its slot, so tap E to work it out and reseat it, then probe it again. Letting go while the needle is still moving logs a guess.
import { define, machine, room, rf, ri, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'comms', label: 'Test comm relays and PA zones', type: 'loop' },
  title: 'Relay noise probe and reseat', dept: 'operations', host: 'room', siteName: 'Relay', verb: 'Probe',
  how: 'Hold E to clip the noise probe on and wait for the lagging needle to stop, then let go to log it; a card over the baseline must be reseated with taps of E and probed again.',
  keys: ['E hold: probe', 'E taps: reseat a noisy card'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'settle and reseat', input: 'e-hold+e-tap', win: 'each relay and zone logged from a settled needle under the baseline, noisy cards reseated and re-probed first',
    fail: 'logging a reading before the needle has stopped swinging',
    rule: 'Hold E: the needle creeps towards the true hiss level. Release only once it reads STEADY. Over the baseline mark it says RESEAT: tap E a few times, then probe again.' },
  rush: 'Glanced at the lamps, ticked every relay and every zone clean.',
  captions: { unread: 'probe clip snaps off', reseat: 'card clicks into the slot' },
  says: { unread: 'The needle was still moving — that reading is a guess. Hold the probe on until it reads steady.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Relay card A', prop: 'relayrack' }, { name: 'Relay card B', prop: 'servers' }, { name: 'Relay card C', prop: 'relayrack' }, { name: 'PA zone plate', prop: 'commsstation' }]), r = m.rnd;
    const base = 0.5, tol = m.calm ? 0.06 : 0.04, noisy = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 1, 2)));
    m.cards = m.sites.map((_, i) => ({ noise: noisy.has(i) ? rf(r, 0.62, 0.88) : rf(r, 0.15, 0.4), mode: 'read', needle: 0, held: 0, wig: 0, need: ri(r, 2, 4), tau: rf(r, 0.35, 0.5) }));
    const steady = (c) => Math.abs(c.needle - c.noise) < tol;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, c = m.cards[i];
      if (c.mode === 'reseat') { if (inp.press && ++c.wig >= c.need) { c.mode = 'read'; c.noise = rf(r, 0.15, 0.4); c.needle = 0; c.held = 0; m.ev('reseat', { site: i }); } s.prog = 0.3 + 0.3 * c.wig / c.need; return; }
      if (inp.hold) { c.held += dt; c.needle += (c.noise - c.needle) * (1 - Math.exp(-dt / c.tau)); }
      if (rel) {
        if (c.held < 0.15) { c.held = 0; c.needle = 0; return; }
        if (!steady(c)) m.fault('unread'); else if (c.noise < base) { m.finish(i); return; } else { c.mode = 'reseat'; c.wig = 0; }
        c.held = 0; c.needle = 0;
      }
      s.prog = clamp(c.needle * 0.6, 0, 0.6);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const c = m.cards[i]; if (c.mode === 'reseat') return { at: i, hold: f % 2 === 0, press: f % 2 === 0 }; return { at: i, hold: !steady(c) || c.held < 0.2 }; };
    m.bad = (f = 0) => ({ at: m.next, hold: f % 12 < 8 });
    m.view = () => ({ c: m.cards.map(c => [+c.noise.toFixed(2), c.need]) });
    m.panel = (i) => { const c = m.cards[i]; if (!c) return null; if (c.mode === 'reseat') return { label: 'RESEAT', value: `${c.wig} / ${c.need} taps`, bar: c.wig / c.need };
      return { label: 'Hiss', value: c.held < 0.05 ? 'probe off' : steady(c) ? (c.noise < base ? 'STEADY · under baseline' : 'STEADY · over baseline') : 'needle moving…', bar: c.needle, band: [0, base] }; };
    m.prompt = (i) => { const c = m.cards[i]; return !c ? '' : c.mode === 'reseat' ? 'Card is rocking — tap [E] to work it out and reseat it' : 'Hold [E] to clip the probe on; let go once the needle is STEADY'; };
    return m;
  },
});
