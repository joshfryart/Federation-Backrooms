// Medical technician: vitals round on the occupied beds. Each bed's monitor streams a reading every beat of the round. Single readings jitter
// (normal noise); what matters is the trend. Chart a bed stable (Space) only after watching eight readings with the running average inside
// the inner band; flag it to the nurse (Enter) the moment the running average leaves the band. A drift left alone reaches the alarm line.
import { define, machine, SPACE, ENTER, ri, rf, pick, shuffle, txt, box, COL } from './kit.js';

const MET = [['HR', 'bpm', 62, 96, 6], ['SpO₂', '%', 95, 98, 1.6], ['Resp', '/min', 13, 18, 2.4], ['Temp', '°C', 36.6, 37.1, 0.25]];
export default define({
  job: { billet: 'medtech', label: 'Vitals round on occupied beds', type: 'loop' },
  title: 'Bedside trend versus noise', dept: 'medical', host: 'console', tool: 'Bed monitor trend strip',
  how: 'Watch each bed\'s readings come in. Noise jitters around the baseline; a drift creeps away. Chart it stable (Space) after eight readings, or tell the nurse (Enter) once the 4-reading average leaves the band.',
  keys: ['Space chart stable', 'Enter flag to the nurse'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'read the trend', input: 'space+enter', win: 'every occupied bed charted stable after a full watch or flagged as soon as its running average drifts out',
    fail: 'charting a drifting patient as stable, flagging plain noise, or letting a drift reach the alarm line',
    rule: 'Readings arrive one by one. The dot is the 4-reading average. Enter once the dot leaves the inner band; Space only after eight readings with the dot inside it.' },
  rush: 'Glanced at each monitor once and wrote "stable" down the column.',
  captions: { 'false flag': 'nurse sighs', 'charted drift': 'chart pen scratch', 'too soon': 'chart pen scratch', 'line flagged': 'bed alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, gap = m.calm ? 0.45 : 0.35, beds = 4;
    const drifts = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 1, 2)));
    m.beds = Array.from({ length: beds }, (_, k) => { const [name, unit, lo, hi, a] = pick(r, MET); const dir = r() < 0.5 ? 1 : -1;
      return { bed: k + 1 + ri(r, 0, 1) * 4, name, unit, base: +rf(r, lo, hi).toFixed(1), a, drift: drifts.has(k), s: drifts.has(k) ? a * rf(r, 0.19, 0.26) * dir : 0, ph: r() < 0.5 ? 1 : -1, nz: Array.from({ length: 30 }, () => rf(r, 0.35, 0.9)) }; });
    m.k = 0; m.rd = []; m.clk = 0; m.rounds = beds; m.round = 0;
    const B = () => m.beds[m.k];
    const avg = () => { if (m.rd.length < 4) return 0; const l = m.rd.slice(-4); return l.reduce((x, y) => x + y, 0) / 4; };
    const out = () => m.rd.length >= 4 && Math.abs(avg()) > 0.5 * B().a;
    const next = () => { m.k++; m.round++; m.rd = []; m.clk = 0; if (m.k >= beds) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const b = B();
      if (ENTER(code)) { if (!b.drift || !out()) m.fault('false flag'); else next(); return true; }
      if (SPACE(code)) { if (m.rd.length < 8) m.fault('too soon'); else if (b.drift) { m.fault('charted drift'); next(); } else next(); return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const b = B(); m.clk += dt;
      if (m.clk >= gap) { m.clk -= gap; const n = m.rd.length; m.rd.push(b.s * n + b.nz[n % 30] * b.a * 0.5 * (n % 2 ? b.ph : -b.ph)); }
      if (Math.abs(avg()) > 1.6 * b.a) { m.fault('line flagged'); if (m.state === 'play') next(); }
    };
    m.hint = () => out() ? [['Enter', true]] : m.rd.length >= 8 ? [['Space', true]] : [];
    m.bad = () => (!out() ? 'Enter' : null);
    m.view = () => ({ b: m.beds.map(b => [b.name, b.base, b.drift, +b.s.toFixed(2)]) });
    m.buttons = () => [['Space', 'Chart stable'], ['Enter', 'Flag to nurse']];
    m.draw = (c, W, H, P) => {
      const b = B() || m.beds[beds - 1], x0 = 18, y0 = 30, w = 250, h = 120, cy = y0 + h / 2, sc = h / 2 / (1.8 * b.a), Y = (v) => cy - v * sc;
      txt(c, `BED ${b.bed} · ${b.name} · baseline ${b.base} ${b.unit}`, x0, 18, { size: 12, col: COL.gold });
      box(c, x0, Y(0.5 * b.a), w, 0.5 * b.a * sc * 2, 'rgba(79,208,106,.12)', P.good, 2);
      c.fillStyle = P.bad; c.fillRect(x0, Y(1.6 * b.a), w, 2); c.fillRect(x0, Y(-1.6 * b.a), w, 2); txt(c, 'ALARM', x0 + w - 2, Y(1.6 * b.a) - 3, { size: 9, align: 'right', col: P.bad });
      m.rd.slice(-16).forEach((v, j) => { c.fillStyle = COL.ink; c.fillRect(x0 + 8 + j * 15, Y(v) - 2, 4, 4); });
      if (m.rd.length >= 4) { const v = avg(), xa = x0 + 8 + (Math.min(16, m.rd.length) - 1) * 15; c.beginPath(); c.arc(xa + 2, Y(v), 6, 0, 6.283); c.strokeStyle = out() ? COL.warn : COL.peri; c.lineWidth = 2; c.stroke(); }
      const shown = m.rd.length ? (b.base + m.rd.at(-1)).toFixed(1) : '--';
      txt(c, `${shown}`, 290, 60, { size: 24 }); txt(c, b.unit, 290, 76, { size: 10, col: COL.dim });
      txt(c, `readings ${Math.min(m.rd.length, 8)} / 8`, 290, 100, { size: 11, col: m.rd.length >= 8 ? P.good : COL.pale });
      txt(c, out() ? 'AVERAGE OUT ▲' : 'average in band', 290, 118, { size: 11, col: out() ? COL.warn : COL.dim });
      txt(c, `bed ${Math.min(m.k + 1, beds)} of ${beds}`, 290, 140, { size: 10, col: COL.dim });
    };
    return m;
  },
});
