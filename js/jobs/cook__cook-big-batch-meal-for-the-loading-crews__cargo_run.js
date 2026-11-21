// Cook: big batch meal. Salt the batch by tasting: each Space adds a pinch, but the taste only catches up after stirring, a second or two
// later. Add pinches until the pinch tally lands in the target zone, then let the taste settle in the band. Oversalting is a fault.
import { define, machine, SPACE, rf, txt, bar, COL } from './kit.js';

export default define({
  job: { billet: 'cook', label: 'Cook big batch meal for the loading crews', type: 'task:cargo_run' },
  title: 'Salt the batch by lagging taste', dept: 'services', host: 'console', tool: 'Two pots and tasting spoon',
  how: 'Press Space to add a pinch of salt. The taste meter lags behind, so count pinches against the zone and let the taste settle inside the band.',
  keys: ['Space add a pinch'], limit: 25, maxFaults: 3,
  fingerprint: { verb: 'salt to taste', input: 'space', win: 'taste meter settled inside the target band for a full second without oversalting',
    fail: 'adding pinches faster than the taste shows until the batch is oversalted',
    rule: 'Each pinch lifts salt by a step; the taste meter follows slowly. Stop adding when the pinch tally reaches the band and wait for the taste to settle in it.' },
  rush: 'Threw in a big handful of salt without tasting and hoped for the best.',
  captions: { oversalted: 'pot hisses' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; m.lo = rf(r, 0.42, 0.58); m.hi = m.lo + 0.2; m.salt = 0.08; m.taste = 0.08; m.pinches = 0; m.ok = 0; const step = 0.12;
    m.key = (code, down = true) => { if (m.state !== 'play' || !down || !SPACE(code)) return false; m.salt += step; m.pinches++; if (m.salt > m.hi) { m.fault('oversalted'); m.salt = Math.max(0.1, m.salt - 0.3); } return true; };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.taste += (m.salt - m.taste) * Math.min(1, dt / (m.calm ? 1.2 : 1.6));
      if (m.taste >= m.lo && m.taste <= m.hi && m.salt >= m.lo && m.salt <= m.hi) { m.ok += dt; if (m.ok >= 1) m.win(); } else m.ok = 0;
    };
    m.hint = () => m.salt < m.lo ? [['Space', true]] : [];
    m.bad = () => 'Space';
    m.view = () => ({ lo: +m.lo.toFixed(3) });
    m.buttons = () => [['Space', 'Pinch']];
    m.draw = (c, W, H, P) => {
      txt(c, 'TASTE', 24, 30, { size: 11, col: COL.dim }); bar(c, 24, 38, 340, 14, m.taste / 0.9, { band: [m.lo / 0.9, m.hi / 0.9], col: COL.gold });
      txt(c, 'PINCH TALLY (salt in pot)', 24, 80, { size: 11, col: COL.dim }); bar(c, 24, 88, 340, 14, m.salt / 0.9, { band: [m.lo / 0.9, m.hi / 0.9], col: COL.peri });
      txt(c, `pinches ${m.pinches}`, 24, 130, { size: 14, col: COL.pale }); txt(c, m.ok > 0 ? 'settled in band' : '', 200, 130, { size: 13, col: P.good });
    };
    return m;
  },
});
