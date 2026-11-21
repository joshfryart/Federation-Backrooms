// Assistant Chief Engineer: watch reactor margin during scans. Scan bursts push the core needle up fast. A burst that peaks under the red mark
// falls back by itself; a runaway climbs on through red toward the top of the dial. Wait for the needle to cross red before throttling (Enter):
// throttling a safe spike is a false call, and a runaway left to reach the top of the dial is a hot core.
import { define, machine, ENTER, shuffle, txt, bar, COL } from './kit.js';

export default define({
  job: { billet: 'ace', label: 'Watch reactor margin during scans', type: 'task:survey' },
  title: 'Throttle past the red mark', dept: 'engineering', host: 'console', tool: 'Core rail gauge',
  how: 'Scan bursts push the needle up. Let a spike that stays under the red mark fall back; when the needle crosses red, throttle with Enter before it tops out.',
  keys: ['Enter throttle call'], limit: 30, maxFaults: 2,
  fingerprint: { verb: 'throttle past red', input: 'enter',
    win: 'every runaway burst throttled after crossing red and before the top of the dial, with the safe spikes left to fall back',
    fail: 'throttling a burst before it crosses red, or a runaway left to run to the top of the dial',
    rule: 'Fast spikes peak under the red mark and fall back. A runaway keeps climbing past red. Press Enter once it has crossed red, before the top.' },
  rush: 'Throttled every burst on sight and left the scans starved.',
  captions: { 'early call': 'needless throttle alarm', 'hot core': 'core over-temperature alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, rise = m.calm ? 3.8 : 2.8; m.ev4 = shuffle(r, [true, true, false, false]); m.i = 0; m.u = 0; m.gap = 1; m.v = 0.4; m.RED = 0.82;
    const sig = (run, u) => run ? 0.4 + 0.62 * u / rise : (u < 0.35 ? 0.4 + 0.38 * u / 0.35 : Math.max(0.4, 0.78 - 0.38 * (u - 0.35) / 0.5));
    m.fin = () => { m.i++; m.u = 0; m.gap = 0.9; m.v = 0.4; if (m.i >= 4) m.win(); };
    m.key = (code, down = true) => { if (m.state !== 'play' || !down || !ENTER(code)) return false; if (m.gap > 0 || m.v <= m.RED) { m.fault('early call'); return true; } if (m.state === 'play' && m.ev4[m.i]) m.fin(); else m.fault('early call'); return true; };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.gap > 0) { m.gap -= dt; return; } m.u += dt; m.v = sig(m.ev4[m.i], m.u);
      if (m.ev4[m.i] && m.v >= 1) { m.fault('hot core'); if (m.state === 'play') m.fin(); } else if (!m.ev4[m.i] && m.u > 0.9) m.fin(); };
    m.hint = () => m.gap <= 0 && m.ev4[m.i] && m.v > m.RED + 0.03 ? [['Enter', true]] : [];
    m.bad = () => (m.gap <= 0 && m.v < 0.7 ? 'Enter' : null);
    m.view = () => ({ ev: m.ev4 });
    m.buttons = () => [['Enter', 'Throttle']];
    m.draw = (c) => { txt(c, 'CORE TEMPERATURE', 14, 20, { size: 10, col: COL.dim }); bar(c, 14, 28, 360, 18, m.v, { col: m.v > m.RED ? COL.warn : COL.pale, mark: m.RED }); txt(c, 'RED', 14 + m.RED * 360 - 10, 62, { size: 10, col: COL.warn });
      txt(c, `${Math.round(1500 + m.v * 1000)} K`, 14, 100, { size: 26, col: m.v > m.RED ? COL.warn : COL.ink }); txt(c, `bursts handled ${m.i}/4`, 14, 130, { size: 12, col: COL.pale }); };
    return m;
  },
});
