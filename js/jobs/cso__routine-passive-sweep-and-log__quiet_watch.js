// Chief science officer: routine passive sweep and log. A slow drift trace scrolls across the passive console. Every time it crosses the
// marked centre line, press the log key (Space) promptly. When the watch timer chimes, log a status entry (Enter). The trace slowly creeps
// upward; only once its peaks breach the drift line may you lift the gain cover and make one correction (Down). Logging when nothing crossed,
// touching gain before the breach, or letting a crossing, a chime or a breach go unlogged is a fault. Survive the watch.
import { define, machine, ARROW, SPACE, ENTER, rf, txt, box, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'cso', label: 'Routine passive sweep and log', type: 'task:quiet_watch' },
  title: 'Passive drift crossing log', dept: 'sciences', host: 'console', tool: 'Passive sweep console',
  how: 'Press Space each time the trace crosses the centre line, Enter whenever the watch timer chimes, and Down (one gain correction) only once the trace peaks breach the drift line. Keep your hands off otherwise until the watch ends.',
  keys: ['Space log a crossing', 'Enter status on chime', '▼ gain correction (breach only)'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'log the crossings', input: 'space+enter+arrows', win: 'a whole passive watch kept with every centre-line crossing and chime logged and the one drift breach corrected',
    fail: 'missing a crossing or chime, logging a crossing that never happened, or touching gain before the drift breaches',
    rule: 'Space within a second of each centre-line crossing; Enter within two seconds of a chime; Down only while the BREACH lamp is lit. Nothing else.' },
  rush: 'Left the array on passive and wrote the log up from memory at the end.',
  captions: { 'missed crossing': 'soft tick', 'false log': 'log error buzz', 'missed chime': 'watch chime repeats', 'needless trim': 'gain cover clack', 'drift unlogged': 'drift alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, P = rf(r, 3.6, 4.6), ph = rf(r, 0, 6.28), amp = 0.6, d = rf(r, 0.03, 0.04), win = m.calm ? 1.3 : 0.9, chimeWin = m.calm ? 3 : 2.2, breachT = m.calm ? 4.5 : 3;
    m.watch = 22; m.bias = 0; m.cross = null; m.chime = null; m.breach = 0; m.dn = {}; m.bf = 0; m.logs = 0; m.hist = [];
    m.chimes = [rf(r, 4, 6), rf(r, 11, 13), rf(r, 17.5, 19)];
    const y = (t) => amp * Math.sin(6.283 * t / P + ph) + m.bias; m.prevY = y(0);
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code); if (!SPACE(code) && !ENTER(code) && a !== 'D') return !!a;
      const e = down && !m.dn[code]; m.dn[code] = down; if (!e) return true;
      if (SPACE(code)) { if (m.cross != null) { m.cross = null; m.logs++; } else m.fault('false log'); }
      else if (ENTER(code)) { if (m.chime != null) m.chime = null; else m.fault('false log'); }
      else { if (m.bias > 0.3) { m.bias -= 0.3; m.breach = 0; m.prevY = y(m.t); } else m.fault('needless trim'); }
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.bias += d * dt; const v = y(m.t);
      if (Math.sign(v) !== Math.sign(m.prevY)) { if (m.cross != null) m.fault('missed crossing'); m.cross = 0; } m.prevY = v;
      if (m.cross != null) { m.cross += dt; if (m.cross > win) { m.cross = null; m.fault('missed crossing'); } }
      if (m.chimes.length && m.t >= m.chimes[0]) { m.chimes.shift(); m.chime = 0; }
      if (m.chime != null) { m.chime += dt; if (m.chime > chimeWin) { m.chime = null; m.fault('missed chime'); } }
      if (m.bias > 0.3) { m.breach += dt; if (m.breach > breachT) { m.fault('drift unlogged'); m.bias = 0; m.breach = 0; m.prevY = y(m.t); } }
      m.hist.push(v); if (m.hist.length > 240) m.hist.shift();
      if (m.t >= m.watch) m.win();
    };
    const tap = (code) => [[code, !m.dn[code]]];
    m.hint = () => { if (m.cross != null && m.cross > 0.1) return tap('Space'); if (m.chime != null && m.chime > 0.2) return tap('Enter'); if (m.bias > 0.3) return tap('ArrowDown'); return [['Space', false], ['Enter', false], ['ArrowDown', false]]; };
    m.bad = () => ['Space', ++m.bf % 2 === 0];
    m.view = () => ({ P: +P.toFixed(2), ph: +ph.toFixed(2), d: +d.toFixed(3), ch: m.chimes.map(t => +t.toFixed(1)) });
    m.buttons = () => [['Space', 'Log crossing'], ['Enter', 'Status'], ['ArrowDown', '▼ Gain']];
    m.draw = (c, W, H, P2) => {
      const x0 = 14, w = 260, cy = 80, sc = 50; box(c, x0, 20, w, 120, 'rgba(255,255,255,.04)', COL.dim, 4);
      c.fillStyle = COL.gold; c.fillRect(x0, cy - 1, w, 2); c.setLineDash?.([4, 4]); c.strokeStyle = P2.bad; c.lineWidth = 1; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(x0, cy - s * 0.9 * sc); c.lineTo(x0 + w, cy - s * 0.9 * sc); c.stroke(); } c.setLineDash?.([]);
      c.strokeStyle = COL.peri; c.lineWidth = 2; c.beginPath(); m.hist.forEach((v, k) => { const x = x0 + w - (m.hist.length - k) * (w / 240), yy = cy - v * sc; k ? c.lineTo(x, yy) : c.moveTo(x, yy); }); c.stroke();
      txt(c, 'marked line', x0 + 4, cy - 4, { size: 9, col: COL.gold }); txt(c, 'drift line', x0 + 4, cy - 0.9 * sc - 3, { size: 9, col: COL.dim });
      lamp(c, 296, 34, 8, m.cross != null ? COL.gold : '#333', 'circle'); txt(c, 'CROSSING', 310, 38, { size: 10, col: m.cross != null ? COL.ink : COL.dim });
      lamp(c, 296, 60, 8, m.chime != null ? COL.gold : '#333', 'diamond'); txt(c, 'CHIME', 310, 64, { size: 10, col: m.chime != null ? COL.ink : COL.dim });
      lamp(c, 296, 86, 8, m.bias > 0.3 ? P2.bad : '#333', 'triangle'); txt(c, 'BREACH', 310, 90, { size: 10, col: m.bias > 0.3 ? COL.warn : COL.dim });
      txt(c, `watch ${Math.max(0, m.watch - m.t).toFixed(0)} s left`, 288, 118, { size: 11, col: COL.pale }); txt(c, `logged ${m.logs}`, 288, 134, { size: 10, col: COL.dim });
    };
    return m;
  },
});
