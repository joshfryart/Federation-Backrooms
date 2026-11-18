// XO: check sensor power draw with engineering. For each planned scan, the grid is already carrying a load that swings up and down. Turn
// the sensor duty-cycle dial so the planned draw plus the grid's PEAK load stays under the safe line, at the highest step that fits, then
// commit. Committing into the red band, or starving the scan a step or more below what the grid can hold, is a fault.
import { define, machine, ARROW, SPACE, shuffle, ri, txt, box, bar, COL } from './kit.js';

const SCANS = ['Gravimetric sweep', 'Deep spectrograph', 'Subspace echo scan', 'Tachyon pulse map', 'Long-range lidar'];
export default define({
  job: { billet: 'xo', label: 'Check sensor power draw with engineering', type: 'task:survey' },
  title: 'Sensor duty-cycle trim', dept: 'command', host: 'console', tool: 'Engineering EPS reserve gauge and duty dial',
  how: 'For each scan turn the duty-cycle dial until the grid\'s peak load plus the sensor draw sits just under the safe line, then commit.',
  keys: ['← → duty cycle', 'Space commit'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'trim duty', input: 'arrows+space', win: 'each scan committed at the highest duty step whose draw plus the grid peak stays under the safe line',
    fail: 'committing a duty cycle that crosses the safe line at the grid peak, or starving a scan below what the grid can carry',
    rule: 'The grid load swings; its peak is marked. ← → set the duty in 10 % steps. Space commits: planned draw × duty + peak must be under the safe line, and one more step must not fit.' },
  rush: 'Ran the sensors at full duty and let engineering shed load if it tripped.',
  captions: { 'red band': 'eps overload chirp', 'starved scan': 'science grumbles' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, line = 100;
    m.scans = shuffle(r, SCANS).slice(0, 3).map(name => { const base = ri(r, 40, 62), swing = ri(r, 6, 14), plan = ri(r, 30, 70); let best = 0; for (let d = 10; d <= 100; d += 10) if (base + swing + plan * d / 100 <= line) best = d; if (!best) return null; return { name, base, swing, plan, best, ph: r() * 6 }; }).filter(Boolean);
    while (m.scans.length < 3) m.scans.push({ name: 'Navigational sweep', base: 50, swing: 8, plan: 40, best: 100, ph: 1 });
    m.i = 0; m.duty = 50; m.rounds = 3; m.round = 0;
    const s = () => m.scans[m.i], tot = (x, d, peak) => x.base + (peak ? x.swing : x.swing * Math.sin(m.t * 2.2 + x.ph)) + x.plan * d / 100;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), x = s();
      if (a === 'L' || a === 'R') { m.duty = Math.max(0, Math.min(100, m.duty + (a === 'R' ? 10 : -10))); return true; }
      if (!SPACE(code)) return false;
      if (tot(x, m.duty, true) > line) { m.fault('red band'); return true; }
      if (m.duty < x.best) { m.fault('starved scan'); return true; }
      x.set = m.duty; m.ev('commit', { i: m.i, duty: m.duty }); m.i++; m.round++; m.duty = 50; if (m.i >= m.scans.length) m.win(); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const x = s(); if (!x) return []; return m.duty < x.best ? [['ArrowRight', true]] : m.duty > x.best ? [['ArrowLeft', true]] : [['Space', true]]; };
    m.bad = () => { const x = s(); if (!x) return null; if (x.best < 100 && m.duty < 100) return 'ArrowRight'; return 'Space'; };
    m.view = () => ({ scans: m.scans.map(x => [x.base, x.swing, x.plan, x.best]) });
    m.buttons = () => [['ArrowLeft', '◀ duty'], ['ArrowRight', 'duty ▶'], ['Space', 'Commit']];
    m.draw = (c, W, H, P) => {
      const x = s(); if (!x) return; const MAX = 160, now = x.base + x.swing * Math.sin(m.t * 2.2 + x.ph), sd = x.plan * m.duty / 100, over = tot(x, m.duty, true) > line;
      txt(c, `${x.name}  ·  scan ${m.i + 1}/3`, 14, 20, { size: 12, col: COL.gold }); txt(c, `planned draw at 100 %: ${x.plan} MW`, W - 14, 20, { size: 11, col: COL.pale, align: 'right' });
      const X = 14, Y = 40, w = W - 28; box(c, X, Y, w, 28, 'rgba(255,255,255,.06)', null, 6);
      c.fillStyle = COL.peri; c.fillRect(X, Y + 3, now / MAX * w, 22); c.fillStyle = over ? P.bad : COL.gold; c.fillRect(X + now / MAX * w, Y + 3, sd / MAX * w, 22);
      c.fillStyle = '#fff'; c.fillRect(X + (x.base + x.swing) / MAX * w - 1, Y - 4, 2, 36); c.fillStyle = P.bad; c.fillRect(X + line / MAX * w - 1, Y - 8, 4, 44);
      txt(c, 'peak', X + (x.base + x.swing) / MAX * w, Y + 44, { size: 9, align: 'center', col: COL.dim }); txt(c, 'SAFE LINE', X + line / MAX * w + 6, Y + 44, { size: 9, col: P.bad });
      txt(c, `grid now ${now.toFixed(0)} MW, peak ${x.base + x.swing}  +  sensors ${sd.toFixed(0)} MW`, 14, 104, { size: 11 });
      txt(c, 'DUTY', 14, 132, { size: 11, col: COL.gold }); bar(c, 60, 122, W - 140, 14, m.duty / 100, { col: COL.orange }); txt(c, `${m.duty} %`, W - 14, 134, { size: 13, align: 'right' });
      txt(c, over ? '▲ at peak this crosses the safe line' : 'under the safe line at peak', 14, 158, { size: 10, col: over ? P.bad : P.good });
    };
    return m;
  },
});
