// Ops: give the sensors priority power and bandwidth. Raise the allocation one notch at a time; the bus headroom figure only catches up a
// moment after each notch. Find the highest notch that keeps headroom above the margin line and confirm it. A notch too far trips the bus
// breaker (allocation back to zero); confirming over the line, or well short of the best notch, is a fault.
import { define, machine, ARROW, ENTER, rf, txt, bar, COL } from './kit.js';

export default define({
  job: { billet: 'ops', label: 'Give sensors priority power and bandwidth', type: 'task:survey' },
  title: 'Sensor priority step-up', dept: 'operations', host: 'console', tool: 'Ops power and bandwidth sliders',
  how: 'Step the sensor allocation up a notch at a time (↑), wait for the headroom figure to settle, and confirm (Enter) at the last notch above the margin.',
  keys: ['↑ notch up', '↓ notch down', 'Enter confirm'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'step up', input: 'arrows+enter', win: 'power and bandwidth each confirmed at the highest notch whose settled headroom clears the margin',
    fail: 'stepping past the trip line so the breaker drops the bus, or confirming over the margin or far below the best notch',
    rule: 'Each ↑ adds a notch; the headroom figure lags behind and settles after a second. Stop at the last notch where the settled headroom is still above the dashed margin, then Enter.' },
  rush: 'Pushed the slider to full and let the breakers sort it out.',
  captions: { 'breaker trip': 'breaker clunk', 'over margin': 'bus warning tone', 'left headroom unused': 'science officer grumbles' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, lag = m.calm ? 0.6 : 0.8;
    const mk = (name) => { const costs = Array.from({ length: 10 }, () => rf(r, 4, 11)), h0 = rf(r, 70, 85), margin = rf(r, 18, 26), head = (n) => h0 - costs.slice(0, n).reduce((a, b) => a + b, 0); let best = 0; while (best < 10 && head(best + 1) >= margin) best++; return { name, head, margin, best, trip: margin - 12 }; };
    m.subs = [mk('Sensor power'), mk('Bandwidth')]; m.k = 0; m.notch = 0; m.shown = m.subs[0].head(0); m.since = 9; m.rounds = 2; m.round = 0;
    const S = () => m.subs[Math.min(m.k, 1)];
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a === 'U' || a === 'D') { m.notch = Math.max(0, Math.min(10, m.notch + (a === 'U' ? 1 : -1))); m.since = 0; return true; }
      if (ENTER(code)) { const s = S(), h = s.head(m.notch); if (h < s.margin) m.fault('over margin'); else if (m.notch < s.best - 1) m.fault('left headroom unused'); else { m.k++; m.round++; if (m.k >= 2) m.win(); else { m.notch = 0; m.shown = S().head(0); m.since = 9; } } return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.since += dt; const s = S(), h = s.head(m.notch); m.shown += (h - m.shown) * Math.min(1, dt * 4 / lag);
      if (m.since > lag && h < s.trip) { m.fault('breaker trip'); m.notch = 0; m.since = 9; }
    };
    m.hint = () => { if (m.since < lag + 0.15) return []; const s = S(); return [[m.notch < s.best ? 'ArrowUp' : m.notch > s.best ? 'ArrowDown' : 'Enter', true]]; };
    m.bad = () => (m.since < 0.3 ? null : 'ArrowUp');
    m.view = () => ({ subs: m.subs.map(s => [s.best, +s.margin.toFixed(1), +s.head(3).toFixed(1)]) });
    m.buttons = () => [['ArrowUp', '▲ notch'], ['ArrowDown', '▼ notch'], ['Enter', 'Confirm']];
    m.draw = (c, W, H, P) => {
      const s = S(); txt(c, `${s.name.toUpperCase()}  ·  notch ${m.notch} / 10`, 14, 24, { size: 13, col: COL.gold });
      bar(c, 14, 36, W - 28, 14, m.notch / 10, { col: COL.peri });
      txt(c, 'Bus headroom', 14, 76, { size: 11, col: COL.dim }); txt(c, `${m.shown.toFixed(1)} %`, W - 14, 76, { size: 16, col: m.shown < s.margin ? P.bad : P.good, align: 'right' });
      bar(c, 14, 84, W - 28, 16, m.shown / 100, { mark: s.margin / 100, col: m.shown < s.margin ? P.bad : P.good });
      txt(c, `margin ${s.margin.toFixed(0)} %  ·  breaker trips under ${s.trip.toFixed(0)} %`, 14, 118, { size: 10, col: COL.pale });
      txt(c, m.since < lag ? 'settling…' : 'settled', 14, H - 14, { size: 11, col: m.since < lag ? COL.warn : COL.ink });
    };
    return m;
  },
});
