// Cartographer: reconcile sensor data with master chart. The sweep is laid over the master chart; walk the star list row by row. Hold → / ←
// to run the ruler out from the chart position until its tip touches the sweep position (the offset only reads true on contact), then call
// the row: 1 = inside the tolerance card (sensor noise), 2 = flag it as drift. Enter commits the revision once every row has been called.
import { define, machine, ARROW, DIG, ENTER, ri, rf, shuffle, clamp, txt, box, bar, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'carto', label: 'Reconcile sensor data with master chart', type: 'loop' },
  title: 'Sweep-over-chart ruler reconcile', dept: 'sciences', host: 'console', tool: 'Lab console: sweep overlay, ruler tool and tolerance card',
  how: 'Hold → / ← to run the ruler from the chart star to the sweep star, read the offset at contact, press 1 for noise or 2 to flag drift, then Enter to commit.',
  keys: ['→ / ← hold: ruler', '1 noise', '2 flag drift', 'Enter commit'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'rule the offset', input: 'arrows-hold+digits+enter', win: 'every star row ruled to contact and called as noise or drift against the tolerance card before the revision is committed',
    fail: 'calling a row without ruling it, flagging noise as drift or passing a real shift, or committing with rows uncalled',
    rule: 'Hold an arrow to stretch the ruler from chart to sweep position; at contact the offset reads true. Over tolerance press 2, inside press 1. Enter commits when all rows are called.' },
  rush: 'Eyeballed the overlay, called it a match and committed the revision.',
  captions: { unmeasured: 'ruler buzz', 'false drift': 'revision rejected chime', 'missed shift': 'chart error tone', 'early commit': 'commit refused' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, TOL = 5, n = 5, rate = m.calm ? 3 : 4.2, near = 0.3;
    const drift = new Set(shuffle(r, [0, 1, 2, 3, 4]).slice(0, ri(r, 2, 3)));
    m.rows = Array.from({ length: n }, (_, i) => ({ id: `HD ${ri(r, 1000, 9999)}`, d: +(drift.has(i) ? rf(r, 5.6, 7.5) : rf(r, 2.5, 4.4)).toFixed(1), call: 0 }));
    m.cur = 0; m.L = 0; m.rounds = n; m.round = 1;
    const row = () => m.rows[m.cur], touch = () => row() && Math.abs(m.L - row().d) <= near;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), d = DIG(code);
      if (a === 'L' || a === 'R') { m.held[a] = down; return true; } if (a) return true;
      if (!down) return d > 0 || ENTER(code);
      if (d === 1 || d === 2) {
        const w = row(); if (!w) return true;
        if (!touch()) { m.fault('unmeasured'); return true; }
        const isDrift = w.d > TOL; if (d === 2 && !isDrift) m.fault('false drift'); else if (d === 1 && isDrift) m.fault('missed shift');
        else { w.call = d; m.cur++; m.L = 0; m.round = Math.min(n, m.cur + 1); } return true;
      }
      if (ENTER(code)) { if (m.cur >= n) m.win(); else m.fault('early commit'); return true; }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const v = (m.held.R ? 1 : 0) - (m.held.L ? 1 : 0); m.L = clamp(m.L + v * rate * dt, 0, 10); };
    m.hint = () => {
      const w = row(); if (!w) return [['ArrowRight', false], ['Enter', true]];
      if (m.L < w.d - 0.15) return [['ArrowLeft', false], ['ArrowRight', true]];
      if (m.L > w.d + 0.15) return [['ArrowRight', false], ['ArrowLeft', true]];
      return [['ArrowRight', false], ['ArrowLeft', false], [w.d > TOL ? 'Digit2' : 'Digit1', true]];
    };
    m.bad = () => 'Enter';
    m.view = () => ({ rows: m.rows.map(w => [w.id, w.d]) });
    m.buttons = () => [['ArrowLeft', '◀ ruler'], ['ArrowRight', 'ruler ▶'], ['Digit1', '1 noise'], ['Digit2', '2 drift'], ['Enter', 'Commit']];
    m.draw = (c, W, H, P) => {
      txt(c, 'STAR LIST', 14, 18, { size: 10, col: COL.dim });
      m.rows.forEach((w, i) => { const y = 34 + i * 18, on = i === m.cur; if (on) box(c, 8, y - 12, 116, 16, COL.panel, COL.gold, 3);
        txt(c, w.id, 14, y, { size: 11, col: on ? COL.gold : COL.ink });
        if (w.call) { lamp(c, 112, y - 4, 5, w.call === 2 ? P.bad : P.good, w.call === 2 ? 'triangle' : 'circle'); txt(c, w.call === 2 ? 'DRIFT' : 'ok', 76, y, { size: 9, col: COL.dim }); } });
      const w = row(), x0 = 150, sc = 22, y = 80;
      if (w) {
        c.strokeStyle = COL.dim; c.lineWidth = 1; c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + 10 * sc, y); c.stroke();
        for (let k = 0; k <= 10; k++) { c.fillStyle = k === TOL ? COL.warn : COL.dim; c.fillRect(x0 + k * sc, y - (k === TOL ? 10 : 4), k === TOL ? 2 : 1, k === TOL ? 20 : 8); }
        lamp(c, x0, y - 22, 6, COL.peri, 'square'); txt(c, 'chart', x0 - 12, y - 34, { size: 9, col: COL.peri });
        lamp(c, x0 + w.d * sc, y - 22, 6, COL.pale, 'diamond'); txt(c, 'sweep', x0 + w.d * sc - 12, y - 34, { size: 9, col: COL.pale });
        c.fillStyle = touch() ? P.good : COL.gold; c.fillRect(x0, y + 12, m.L * sc, 5);
        txt(c, touch() ? `contact · offset ${w.d.toFixed(1)}` : `ruler ${m.L.toFixed(1)}`, x0, y + 34, { size: 12, col: touch() ? P.good : COL.ink });
        txt(c, `tolerance card: ${TOL}.0`, x0 + 120, y + 34, { size: 10, col: COL.warn });
      } else txt(c, 'Every row called · Enter to commit the revision', 150, 84, { size: 12, col: P.good });
      bar(c, 150, 140, 220, 8, m.cur / n); txt(c, `rows called ${m.cur}/${n}`, 150, 160, { size: 10, col: COL.dim });
    };
    return m;
  },
});
