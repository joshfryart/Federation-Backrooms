// Botanist: harvest for galley. Move along the fruiting rack pod by pod. The panel holds each pod against the ripeness colour chart. A ripe pod
// (chart 5 or 6) is twisted off: hold E to grip it and swing your view gently to turn it on the stalk until it comes free. Twist too fast and the
// pod bruises and drops in the reject bin (a fault, next one along). An unripe pod is left on the stem with a quick tap of E; twisting one is a
// premature pick (a fault), and tapping past a ripe pod leaves it to rot (a fault).
import { define, machine, room, ri, clamp } from './kit.js';

const SHADE = ['pale green', 'green', 'lime', 'yellow-green', 'gold', 'amber'];
export default define({
  job: { billet: 'bot', label: 'Harvest for galley', type: 'loop' },
  title: 'Gentle twist harvest', dept: 'sciences', host: 'room', siteName: 'Pod', verb: 'Pick',
  how: 'Read each pod against the colour chart. Ripe (5 or 6): hold E and swing your view slowly to twist it off the stalk. Unripe: tap E to leave it.',
  keys: ['E hold + slow swing: twist off', 'E tap: leave on the stem'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'twist off', input: 'e-hold+e-tap+swing', win: 'every ripe pod twisted free with a slow turn and every unripe pod left growing',
    fail: 'a twist so quick the pod bruises and drops, picking an unripe pod early, or passing a ripe one',
    rule: 'Chart 5-6 is ripe: hold E and turn the view slowly (the twist meter fills only under the speed line). Chart 1-4: tap E and move on.' },
  rush: 'Stripped the rack by the handful, green pods and all.',
  captions: { bruised: 'pod thuds into the bin', 'picked early': 'stalk snaps green', 'left ripe': 'overripe pod splits' },
  says: { bruised: 'Twisted too hard: the pod bruised and dropped in the bin. Turn slowly.', 'picked early': 'That pod was not ripe yet. Check the colour chart and tap E to leave it.', 'left ripe': 'That pod was ripe and you left it. Twist it off next time.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Rack pod 1', prop: 'tree' }, { name: 'Rack pod 2', prop: 'plant' }, { name: 'Rack pod 3', prop: 'tree' }, { name: 'Rack pod 4', prop: 'plant' }]), r = m.rnd;
    const vmax = m.calm ? 2.6 : 2.0;
    const ripe = [true, false, ri(r, 0, 1) === 1, ri(r, 0, 1) === 1]; for (let i = 3; i > 0; i--) { const j = ri(r, 0, i); [ripe[i], ripe[j]] = [ripe[j], ripe[i]]; }
    m.pods = m.sites.map((_, i) => ({ ripe: ripe[i], chart: ripe[i] ? ri(r, 5, 6) : ri(r, 1, 4), twist: 0, held: 0, need: ri(r, 3, 5) * 0.3 }));
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp), rel = m.released(inp); if (!s) return; const i = m.next, p = m.pods[i];
      if (inp.hold) { p.held += dt; const v = Math.abs(inp.swing || 0);
        if (v > vmax) { m.fault('bruised'); m.finish(i); return; }
        if (v > 0.3) { p.twist += v * dt; if (!p.ripe && p.twist > 0.25) { m.fault('picked early'); m.finish(i); return; } if (p.ripe && p.twist >= p.need) { m.ev('picked', { site: i }); m.finish(i); return; } } }
      if (rel) { if (p.held < 0.4 && p.twist < 0.1) { if (p.ripe) m.fault('left ripe'); m.finish(i); return; } p.held = 0; }
      s.prog = clamp(p.twist / p.need, 0, 0.95);
    };
    m.hint = () => { const i = m.next; if (i < 0) return { at: -1 }; const p = m.pods[i];
      if (p.ripe) return { at: i, hold: true, press: p.held === 0, swing: vmax * 0.6 };
      return p.held === 0 ? { at: i, hold: true, press: true } : { at: i, hold: false }; };
    m.bad = (f = 0) => { const i = m.next; return { at: i, hold: true, press: f % 30 === 0, swing: 5 }; };
    m.view = () => ({ pods: m.pods.map(p => [p.chart, +p.need.toFixed(2)]) });
    m.panel = (i) => { const p = m.pods[i]; return p ? { label: `Chart ${p.chart}/6 ${SHADE[p.chart - 1]}`, value: p.chart >= 5 ? 'ripe: twist' : 'unripe: leave', bar: clamp(p.twist / p.need), band: [0.95, 1] } : null; };
    m.prompt = (i) => { const p = m.pods[i]; return !p ? '' : p.chart >= 5 ? 'Ripe: hold [E] and swing your view slowly to twist it off' : 'Not ripe: tap [E] to leave it on the stem'; };
    return m;
  },
});
