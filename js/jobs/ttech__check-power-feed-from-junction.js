// Transporter tech: check the power feed from the junction. The static reading on every feed looks fine; the fault only shows under load.
// At each feed tap E to switch the coil load on and watch the voltage needle for one full cycle. A weak feed sags under the band for a
// moment somewhere in the cycle: tap E while it is down to radio EPS. Good feeds only wobble inside the band; let their cycle finish.
// Tapping on a wobble is a false report; letting a sag recover uncalled is a missed sag.
import { define, machine, room, rf, shuffle, clamp } from './kit.js';

export default define({
  job: { billet: 'ttech', label: 'Check power feed from junction', type: 'loop' },
  title: 'Feed sag call under coil load', dept: 'operations', host: 'room', item: 'tricorder_eng', siteName: 'Feed', verb: 'Load-test',
  how: 'Tap E to put the coil load on, then watch the needle for one cycle. If it sags below the band, tap E while it is down; if it only wobbles, let the cycle run out.',
  keys: ['E tap: coil load on', 'E tap during a sag: radio EPS'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'catch the sag', input: 'e-tap', win: 'each junction feed load-cycled and every under-load sag radioed while the needle was below the band',
    fail: 'reporting a feed that only wobbled inside the band, or letting a sag recover without calling it',
    rule: 'First tap switches the coil load on and a three-second cycle runs. A sag drops the needle under the band for about half a second: tap during it. A wobble stays inside the band: do nothing and the cycle logs the feed good.' },
  rush: 'Read the cold static voltage at each point and logged it against the sticker.',
  captions: { 'false report': 'EPS: say again?', 'missed sag': 'needle kicks back' },
  says: { 'false report': 'That was a wobble inside the band: no sag. EPS is annoyed.', 'missed sag': 'The needle went under the band and you let it go. Tap while it is down.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Junction feed A', prop: 'buffertank' }, { name: 'Junction feed B', prop: 'console' }, { name: 'Pad feed', prop: 'pad' }]), r = m.rnd;
    const C = 3, dipLen = m.calm ? 0.9 : 0.6, lo = 0.42; let sag = shuffle(r, [true, false, r() < 0.5]);
    m.feeds = m.sites.map((_, i) => ({ sag: sag[i], at: rf(r, 0.6, C - dipLen - 0.3), wob: rf(r, 0.4, 2.2), base: rf(r, 0.62, 0.72), on: false, c: 0 }));
    const volt = (f) => { if (!f.on) return f.base; const x = f.c; let v = f.base + 0.04 * Math.sin(x * 7 + f.wob);
      if (Math.abs(x - f.wob) < 0.3) v -= 0.12 * (1 - Math.abs(x - f.wob) / 0.3);
      if (f.sag && x >= f.at && x <= f.at + dipLen) v = lo - 0.1 - 0.06 * Math.sin((x - f.at) / dipLen * Math.PI); return clamp(v); };
    const dipping = (f) => f.on && f.sag && f.c >= f.at && f.c <= f.at + dipLen;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; const i = m.next, f = m.feeds[i];
      if (!f.on) { if (inp.press) { f.on = true; f.c = 0; } return; }
      f.c += dt; s.prog = clamp(f.c / C * 0.95);
      if (inp.press) { if (dipping(f)) { m.ev('sag called', { site: i }); m.finish(i); return; } m.fault('false report'); }
      if (m.state !== 'play') return;
      if (f.sag && f.c > f.at + dipLen) { m.fault('missed sag'); f.on = false; return; }
      if (f.c >= C) m.finish(i);
    };
    m.hint = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const d = m.feeds[i]; return { at: i, press: !d.on ? f % 6 === 0 : dipping(d) && d.c - d.at > 0.15 && f % 3 === 0 }; };
    m.bad = (f = 0) => { const i = m.next; if (i < 0) return { at: -1 }; const d = m.feeds[i]; return { at: i, press: f % 8 === 0 && !dipping(d) }; };
    m.view = () => ({ feeds: m.feeds.map(f => [f.sag, +f.at.toFixed(2), +f.wob.toFixed(2)]) });
    m.panel = (i) => { const f = m.feeds[i]; if (!f) return null; const v = volt(f);
      return { label: f.on ? 'Feed under coil load' : 'Feed (static)', value: `${Math.round(380 + v * 140)} V${v < lo ? ' SAG' : ''}`, bar: v, band: [lo, 0.9] }; };
    m.prompt = (i) => { const f = m.feeds[i]; return !f ? '' : !f.on ? 'Tap [E] to switch the coil load on' : volt(f) < lo ? 'SAG — tap [E] now to radio EPS' : 'Watch the needle: tap [E] only if it drops below the band'; };
    return m;
  },
});
