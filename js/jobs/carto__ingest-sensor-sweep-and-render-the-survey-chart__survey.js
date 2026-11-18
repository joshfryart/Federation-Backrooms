// Cartographer, survey: ingest the sensor sweep and render the survey chart. Each imported cluster has a six-band signature, but the band
// filter only shows energy inside its narrow window: hold ← / → to slide the window across all six bands, read the shape, then class it:
// 1 star (one peak in band 5-6), 2 planet (two peaks with a gap), 3 debris (three neighbouring bands up), 4 unknown (one peak in band 1-4).
// Classing before the whole band has been swept is guessing from position.
import { define, machine, ARROW, DIG, ri, rf, pick, clamp, txt, box, lamp, COL } from './kit.js';

const NB = 6, CL = ['star', 'planet', 'debris', 'unknown'];
function sig(r, k) {
  const e = Array.from({ length: NB }, () => rf(r, 0.05, 0.18)), up = (b) => { e[b] = rf(r, 0.7, 1); };
  if (k === 0) up(ri(r, 4, 5)); else if (k === 1) { const a = ri(r, 0, 2); up(a); up(ri(r, a + 2, 5)); }
  else if (k === 2) { const a = ri(r, 0, 3); up(a); up(a + 1); up(a + 2); } else up(ri(r, 0, 3));
  return e.map(v => +v.toFixed(2));
}
export default define({
  job: { billet: 'carto', label: 'Ingest sensor sweep and render the survey chart', type: 'task:survey' },
  title: 'Band-window cluster classing', dept: 'sciences', host: 'console', tool: 'Lab console signature band filter',
  how: 'Hold ← / → to slide the band window over all six bands of each cluster, then class it with 1 star, 2 planet, 3 debris or 4 unknown from the shape of its signature.',
  keys: ['← / → hold: slide window', '1 star', '2 planet', '3 debris', '4 unknown'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'window and class', input: 'arrows-hold+digits', win: 'four imported clusters each swept across all six signature bands and classed from the shape of their energy',
    fail: 'classing a cluster before its whole band is swept, or calling the wrong class, worst of all debris rendered as a planet',
    rule: 'Energy shows only inside the sliding band window: hold an arrow to sweep it across all six bands, then press 1-4 by the rule card (peaks, gaps, neighbours).' },
  rush: 'Classed every cluster by where it sat on the grid and rendered the chart.',
  captions: { guessed: 'classifier query beep', 'false planet': 'false-course warning', misclassed: 'chart warning chime' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, n = 4, rate = m.calm ? 2.4 : 3.2;
    const kinds = [pick(r, [1, 2]), ...Array.from({ length: n - 1 }, () => ri(r, 0, 3))];
    m.cl = kinds.map(k => ({ k, e: sig(r, k), id: `C${ri(r, 10, 99)}` })); m.i = 0; m.w = rf(r, 0, NB - 0.01); m.seen = new Set(); m.done = []; m.rounds = n; m.round = 1;
    const band = () => clamp(Math.floor(m.w), 0, NB - 1);
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), d = DIG(code);
      if (a === 'L' || a === 'R') { m.held[a] = down; return true; } if (a) return true;
      if (!d) return false; if (!down || d > 4) return true;
      const c = m.cl[m.i]; if (m.seen.size < NB) { m.fault('guessed'); return true; }
      if (d - 1 !== c.k) { m.fault(c.k === 2 && d === 2 ? 'false planet' : 'misclassed'); return true; }
      m.done.push(d - 1); m.i++; m.seen = new Set([band()]); if (m.i >= n) m.win(); else m.round = m.i + 1; return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const v = (m.held.R ? 1 : 0) - (m.held.L ? 1 : 0); m.w = clamp(m.w + v * rate * dt, 0, NB - 0.001); m.seen.add(band()); };
    m.hint = () => {
      const c = m.cl[m.i]; if (!c) return [];
      if (m.seen.size >= NB) return [['ArrowLeft', false], ['ArrowRight', false], [`Digit${c.k + 1}`, true]];
      const lo = [...Array(NB).keys()].some(b => b < band() && !m.seen.has(b)), goR = !lo;
      return goR ? [['ArrowLeft', false], ['ArrowRight', true]] : [['ArrowRight', false], ['ArrowLeft', true]];
    };
    m.bad = () => 'Digit2';
    m.view = () => ({ cl: m.cl.map(c => [c.k, c.e]) });
    m.buttons = () => [['ArrowLeft', '◀ window'], ['ArrowRight', 'window ▶'], ['Digit1', '1 star'], ['Digit2', '2 planet'], ['Digit3', '3 debris'], ['Digit4', '4 unknown']];
    m.draw = (c, W, H, P) => {
      const cl = m.cl[m.i]; txt(c, `SURVEY CHART · cluster ${cl ? cl.id : '—'} (${Math.min(m.i + 1, n)}/${n})`, 14, 16, { size: 11, col: COL.dim });
      const x0 = 20, bw = 42, y0 = 130, hh = 90;
      for (let b = 0; b < NB; b++) { const x = x0 + b * bw; box(c, x, y0 - hh, bw - 4, hh, 'rgba(255,255,255,.04)', null, 2); txt(c, `B${b + 1}`, x + 12, y0 + 14, { size: 10, col: m.seen.has(b) ? COL.ink : COL.dim });
        if (cl && Math.abs(b + 0.5 - m.w) < 0.6) { const v = cl.e[b]; c.fillStyle = v > 0.5 ? COL.gold : COL.peri; c.fillRect(x + 6, y0 - v * hh, bw - 16, v * hh); } }
      c.strokeStyle = COL.ink; c.lineWidth = 2; c.strokeRect(x0 + (m.w - 0.6) * bw, y0 - hh - 4, 1.2 * bw, hh + 8);
      txt(c, `swept ${m.seen.size}/${NB}`, 20, 162, { size: 10, col: m.seen.size >= NB ? P.good : COL.warn });
      ['1 star: one peak B5-6', '2 planet: two peaks, gap', '3 debris: 3 neighbours up', '4 unknown: one peak B1-4'].forEach((s, k) => txt(c, s, 282, 46 + k * 18, { size: 9, col: COL.dim }));
      m.done.forEach((k, j) => lamp(c, 290 + j * 18, 130, 6, COL.lav, ['circle', 'diamond', 'triangle', 'square'][k]));
    };
    return m;
  },
});
