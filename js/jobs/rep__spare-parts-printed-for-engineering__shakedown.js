// Replicator tech: spare parts printed for engineering. A printed part has five edge segments with burrs of different heights. Pick a segment (Left/Right)
// and hold Space to file it down into the gauge band; filing past zero spoils the edge. When every segment is in band, press Enter to drop it in the fit gauge.
import { define, machine, SPACE, ENTER, ARROW, ri, rf, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'rep', label: 'Spare parts printed for engineering', type: 'task:shakedown' },
  title: 'File each edge to the gauge', dept: 'services', host: 'console', tool: 'Deburring file and fit gauge',
  how: 'Choose a burr with Left/Right and hold Space to file it down until it sits in the band at the bottom. Do not file past zero. Then press Enter to try the part in the fit gauge.',
  keys: ['Left/Right choose burr', 'Space hold: file', 'Enter fit gauge'], limit: 36, maxFaults: 2,
  fingerprint: { verb: 'file to fit', input: 'arrows+space-hold+enter', win: 'two parts each with every burr filed into the fit band then seated in the gauge without play',
    fail: 'filing a burr past zero or trying a part with a burr still above the band, so it rattles in the gauge',
    rule: 'Each segment shows a burr height against a band near zero. Hold Space on the chosen segment to file it down; stop inside the band. Enter fits the part.' },
  rush: 'Filed the edges by feel and boxed the part without gauging it.',
  captions: { overfiled: 'file bites too deep', rattles: 'part rattles in gauge' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, rate = m.calm ? 0.35 : 0.5; m.k = 0; m.cur_ = 0; m.rounds = 2; m.round = 0; m.top = 0.1;
    const mk = () => Array.from({ length: 5 }, () => (r() < 0.25 ? rf(r, 0.03, 0.08) : rf(r, 0.25, 0.9)));
    m.parts = [mk(), mk()]; m.parts.forEach(p => { if (p.every(h => h <= 0.1)) p[2] = 0.6; });
    const P_ = () => m.parts[Math.min(m.k, 1)];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code); if (!SPACE(code) && !ENTER(code) && a !== 'L' && a !== 'R') return false;
      if (SPACE(code)) { m.held.S = down; return true; } if (!down) return true;
      if (a === 'L') m.cur_ = Math.max(0, m.cur_ - 1); else if (a === 'R') m.cur_ = Math.min(4, m.cur_ + 1);
      else if (P_().some(h => h > m.top)) m.fault('rattles'); else { m.k++; m.round = m.k; m.cur_ = 0; m.held.S = false; if (m.k >= 2) m.win(); }
      return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.held.S) { const p = P_(); if (p[m.cur_] > 0) { p[m.cur_] -= rate * dt; if (p[m.cur_] < 0) { m.fault('overfiled'); p[m.cur_] = 0.3; m.held.S = false; } } } };
    m.hint = () => { const p = P_(), i = p.findIndex(h => h > m.top); if (i < 0) return [['Space', false], ['Enter', true]]; if (i !== m.cur_) return [['Space', false], [i > m.cur_ ? 'ArrowRight' : 'ArrowLeft', true]]; return [['Space', p[i] > 0.05]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ parts: m.parts.map(p => p.map(h => +h.toFixed(2))) });
    m.buttons = () => [['ArrowLeft', '<'], ['ArrowRight', '>'], ['Space', 'File (hold)'], ['Enter', 'Fit gauge']];
    m.draw = (c, W, H, P) => {
      txt(c, `Part ${Math.min(m.k + 1, 2)} / 2`, 14, 22, { size: 14, col: COL.gold });
      P_().forEach((h, i) => { const x = 24 + i * 72; box(c, x, 34, 50, 96, 'rgba(255,255,255,.05)', i === m.cur_ ? COL.orange : null, 6); c.fillStyle = h > m.top ? COL.pale : P.good; c.fillRect(x + 8, 126 - Math.max(0, h) * 88, 34, Math.max(2, h * 88)); c.strokeStyle = P.good; c.lineWidth = 2; c.strokeRect(x + 4, 126 - m.top * 88, 42, m.top * 88); txt(c, h > m.top ? 'burr' : 'ok', x + 12, 48, { size: 11, col: h > m.top ? P.bad : P.good }); });
    };
    return m;
  },
});
