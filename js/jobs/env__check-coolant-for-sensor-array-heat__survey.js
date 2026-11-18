// Environmental tech: check coolant for sensor array heat (survey). The coolant trend chart draws the array temperature as the survey runs, one
// stretch at a time, beside a slope marker. Judge each stretch's climb over at least a second of chart, not the first reading: steeper than the
// marker, raise the array feed flow (Space); at or under it, call it within the chart (Enter). Stretches often start with a misleading kick.
import { define, machine, ENTER, SPACE, rf, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'env', label: 'Check coolant for sensor array heat', type: 'task:survey' },
  title: 'Array heat slope over the stretch', dept: 'engineering', host: 'console', tool: 'Coolant trend chart',
  how: 'Watch each stretch of the array temperature line for at least a second. Climbing faster than the slope marker: raise the feed flow (Space). Within it: Enter.',
  keys: ['Space raise the feed flow', 'Enter within the chart'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'judge the slope', input: 'enter+space', win: 'five stretches of the array heat trend judged against the slope marker over a full second of chart each',
    fail: 'calling a stretch on its first reading, misjudging its climb against the marker, or letting a stretch run out unjudged',
    rule: 'The first half second of each stretch often kicks the wrong way. Wait for the OBSERVED bar to fill, compare the average climb with the marker, then press Space (too steep) or Enter (in chart).' },
  rush: 'Took one temperature at the start of the survey and called the array cool.',
  captions: { 'one reading': 'chart beeps', 'wrong call': 'engineer frowns', unjudged: 'array throttle alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, MARK = 1.2, see = m.calm ? 1.0 : 1.2, segLen = m.calm ? 4.2 : 3.4, N = 5;
    m.segs = Array.from({ length: N }, () => { const steep = r() < 0.5; return { steep, s: steep ? rf(r, 1.8, 2.6) : rf(r, 0.2, 0.75), kick: (steep ? -1 : 1) * rf(r, 0.6, 1.0) }; });
    m.k = 0; m.st = 0; m.T0 = 52; m.T = 52; m.hist = []; m.gap = 0.5; m.round = 0; m.rounds = N;
    const S = () => m.segs[m.k];
    m.temp = (st) => { const g = S(); return m.T0 + g.s * st + g.kick * Math.sin(Math.PI * Math.min(st, 0.6) / 0.6) + 0.06 * Math.sin(st * 13); };
    m.avg = () => m.st > 0.05 ? (m.T - m.T0) / m.st : 0;
    const next = () => { m.k++; m.round = m.k; m.T0 = m.T; m.st = 0; m.gap = 0.4; if (m.k >= N) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down || !(SPACE(code) || ENTER(code))) return false; if (m.gap > 0) return true;
      if (m.st < see) { m.fault('one reading'); return true; }
      if (SPACE(code) !== S().steep) m.fault('wrong call'); else { if (S().steep) m.T -= 2; next(); } return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; if (m.gap > 0) { m.gap -= dt; m.T -= 0.3 * dt; m.T0 = m.T; } else { m.st += dt; m.T = m.temp(m.st); if (m.st >= segLen) { m.fault('unjudged'); next(); } }
      m.hist.push(m.T); if (m.hist.length > 200) m.hist.shift();
    };
    m.hint = () => m.gap > 0 || m.st < see + 0.15 ? [] : [[S().steep ? 'Space' : 'Enter', true]];
    m.bad = () => m.gap <= 0 && m.st > 0.1 && m.st < 0.3 ? 'Space' : null;
    m.view = () => ({ s: m.segs.map(g => +g.s.toFixed(2)) });
    m.buttons = () => [['Space', 'Raise flow'], ['Enter', 'Within chart']];
    m.draw = (c, W, H, P) => {
      box(c, 14, 12, 240, 140, 'rgba(255,255,255,.04)', null, 4); const y = (T) => 140 - (T - 40) * 3;
      c.fillStyle = P.bad; c.fillRect(14, y(78), 240, 2); txt(c, 'WARN', 220, y(78) - 4, { size: 9, col: P.bad });
      c.strokeStyle = COL.gold; c.lineWidth = 2; c.beginPath(); m.hist.forEach((T, i) => { const x = 14 + i * 1.2, yy = Math.max(14, Math.min(150, y(T))); if (i) c.lineTo(x, yy); else c.moveTo(x, yy); }); c.stroke();
      if (m.gap <= 0) { const x1 = 14 + Math.max(0, m.hist.length - 1 - m.st * 30) * 1.2; c.setLineDash?.([4, 4]); c.strokeStyle = COL.ink; c.beginPath(); c.moveTo(x1, y(m.T0)); c.lineTo(x1 + 60, y(m.T0 + MARK * 2)); c.stroke(); c.setLineDash?.([]); }
      const ob = Math.min(1, m.st / see); txt(c, 'OBSERVED', 270, 30, { size: 10, col: COL.dim }); box(c, 270, 36, 110, 8, 'rgba(255,255,255,.1)', null, 3); box(c, 270, 36, 110 * ob, 8, ob >= 1 ? P.good : COL.peri, null, 3);
      txt(c, ob >= 1 ? `climb ${m.avg().toFixed(1)} K/s` : 'climb …', 270, 68, { size: 14, col: ob >= 1 ? (m.avg() > MARK ? P.bad : P.good) : COL.dim });
      txt(c, `marker ${MARK.toFixed(1)} K/s`, 270, 88, { size: 11, col: COL.pale });
      txt(c, `array ${m.T.toFixed(1)} °C`, 270, 116, { size: 12 }); txt(c, `stretches ${m.round} / ${N}`, 270, 146, { size: 11, col: COL.pale });
    };
    return m;
  },
});
