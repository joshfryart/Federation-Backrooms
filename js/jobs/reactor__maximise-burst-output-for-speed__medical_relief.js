// Reactor specialist: maximise burst output for the run to the stricken site. Holding the burst key piles output on and the run gauge fills,
// but the core temperature has momentum: it keeps climbing for a moment after you ease off. Feather the burst against the temperature line,
// not the output needle that always looks good, so the core never crosses its margin while the run gauge fills.
import { define, machine, SPACE, rf, clamp, txt, bar, COL } from './kit.js';

export default define({
  job: { billet: 'reactor', label: 'Maximise burst output for speed', type: 'task:medical_relief' },
  title: 'Burst feathering against core heat', dept: 'engineering', host: 'console', tool: 'Burst panel',
  how: 'Hold Space to burst: the run gauge fills while you hold. Watch the core temperature, which keeps rising after you let go, and ease off early enough that it never crosses the margin line.',
  keys: ['Space hold burst'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'feather the burst', input: 'space-hold', win: 'run gauge filled by burst time while the lagging core temperature never crosses its margin line',
    fail: 'holding burst until the coasting core temperature overshoots the margin',
    rule: 'Holding Space builds burst and heat rate together; releasing bleeds the heat rate off, so the temperature coasts upward a little after release. Let go before the coast reaches the margin, re-burst once it falls.' },
  rush: 'Held the burst key down and watched the speed figure.',
  captions: { overheat: 'core overtemperature klaxon' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, acc = rf(r, 1.1, 1.5), dec = m.calm ? rf(r, 1.6, 1.9) : rf(r, 1.2, 1.5), cap = rf(r, 0.42, 0.55);
    m.margin = rf(r, 0.78, 0.86); m.T = rf(r, 0.25, 0.4); m.v = 0; m.run = 0; m.need = m.calm ? 8 : 7.5; m.lock = 0; m.out = 0;
    m.key = (code, down = true) => { if (m.state !== 'play' || !SPACE(code)) return false; m.held.S = down; return true; };
    m.peak = () => m.v > 0 ? m.T + m.v * m.v / (2 * dec) : m.T;
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.lock = Math.max(0, m.lock - dt); const on = m.held.S && !m.lock;
      if (on) { m.v = Math.min(cap, m.v + acc * dt); m.run += dt; } else m.v = Math.max(-0.3, m.v - dec * dt);
      m.out += ((on ? 1 : 0.35) - m.out) * Math.min(1, dt * 4); m.T = clamp(m.T + m.v * dt, 0.1, 1);
      if (m.T > m.margin) { m.fault('overheat'); m.T = m.margin - 0.25; m.v = 0; m.lock = 1; }
      if (m.run >= m.need) m.win();
    };
    m.hint = () => [['Space', m.peak() + (m.held.S ? 0.04 : 0.1) < m.margin]];
    m.bad = () => ['Space', true];
    m.view = () => ({ margin: +m.margin.toFixed(3), cap: +cap.toFixed(3), acc: +acc.toFixed(3) });
    m.buttons = () => [['Space', 'Burst (hold)']];
    m.draw = (c, W, H, P) => {
      const x0 = 30, y0 = 14, h = 130; c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(x0, y0, 30, h);
      const hot = m.T > m.margin - 0.08; c.fillStyle = hot ? COL.warn : COL.peri; c.fillRect(x0 + 5, y0 + h - m.T * h, 20, m.T * h);
      c.fillStyle = P.bad; c.fillRect(x0 - 6, y0 + h - m.margin * h - 1, 42, 3); txt(c, 'MARGIN', x0 + 40, y0 + h - m.margin * h + 4, { size: 9, col: P.bad });
      txt(c, `core ${Math.round(1700 + m.T * 900)} K`, 100, 30, { size: 16, col: hot ? COL.warn : COL.ink });
      txt(c, m.v > 0.02 ? '▲ rising' : m.v < -0.02 ? '▼ falling' : '■ steady', 100, 50, { size: 11, col: m.v > 0.02 ? COL.warn : COL.dim });
      txt(c, 'output', 100, 76, { size: 10, col: COL.dim }); bar(c, 150, 68, 220, 9, m.out, { col: COL.gold });
      txt(c, 'run to site', 100, 102, { size: 10, col: COL.dim }); bar(c, 170, 94, 200, 10, m.run / m.need, { col: P.good });
      txt(c, m.lock ? 'BURST LOCKED OUT — core cooling' : m.held.S ? 'BURST' : 'eased', 100, 132, { size: 13, col: m.lock ? P.bad : m.held.S ? COL.gold : COL.dim });
    };
    return m;
  },
});
