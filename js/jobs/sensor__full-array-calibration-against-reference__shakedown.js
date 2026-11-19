// Sensor officer: full array calibration against the reference (shakedown). The array is pointed at the reference target and six elements
// show their return bar against the tolerance band. Pick an element (digit) and step its alignment control (↑ / ↓). The elements share a
// mounting, so every step also pushes the two NEIGHBOURS a third of the way: fixing one can knock the next out. Work through all six, go
// back over any that moved, and sign the calibration record (Space) only when every bar sits in the band at once.
import { define, machine, ARROW, DIG, SPACE, rf, txt, bar, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'sensor', label: 'Full array calibration against reference', type: 'task:shakedown' },
  title: 'Coupled element calibration pass', dept: 'sciences', host: 'console', tool: 'Full array console',
  how: 'Pick an element (1-6) and step its alignment (↑ / ↓) into the tolerance band; each step nudges its neighbours too, so recheck them. Sign (Space) only when all six are in band together.',
  keys: ['1-6 pick element', '↑ / ↓ step alignment', 'Space sign the record'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'chase the coupling', input: 'arrows+digits+space', win: 'all six array elements inside the reference band at the same moment after neighbour crosstalk is worked out, then the record signed',
    fail: 'signing the calibration record while any one element still sits outside its band, often one knocked out by fixing its neighbour',
    rule: 'Each ↑ / ↓ step moves the picked element and drags its neighbours a third as far. Fix the worst bar, look again at the ones beside it, and only press Space when every bar is green at once.' },
  rush: 'Trimmed the first element that read off and signed the record.',
  captions: { 'bad element signed': 'calibration record rejects' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, band = m.calm ? 0.06 : 0.05, step = 0.04, cpl = 0.34, N = 6;
    m.v = Array.from({ length: N }, () => 0.5 + (r() < 0.5 ? -1 : 1) * rf(r, 0.06, 0.3)); m.v[Math.floor(r() * N)] = 0.5 + rf(r, -0.02, 0.02);
    m.sel = -1; m.steps = 0; m.round = 1; m.rounds = 1;
    const off = (i) => m.v[i] - 0.5, ok = (i) => Math.abs(off(i)) < band, allOk = () => m.v.every((_, i) => ok(i));
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), d = DIG(code); if (!(a === 'U' || a === 'D') && !(d >= 1 && d <= N) && !SPACE(code)) return !!a; if (!down) return true;
      if (d) { m.sel = d - 1; return true; }
      if (SPACE(code)) { if (allOk()) m.win(); else m.fault('bad element signed'); return true; }
      if (m.sel < 0) return true; const dv = a === 'U' ? step : -step; m.v[m.sel] += dv; m.steps++;
      for (const j of [m.sel - 1, m.sel + 1]) if (j >= 0 && j < N) m.v[j] += dv * cpl; m.v = m.v.map(x => Math.max(0, Math.min(1, x))); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => {
      if (allOk()) return [['Space', true]]; let w = 0; for (let i = 1; i < N; i++) if (Math.abs(off(i)) > Math.abs(off(w))) w = i;
      if (m.sel !== w) return [['Digit' + (w + 1), true]]; return [[off(w) > 0 ? 'ArrowDown' : 'ArrowUp', true]];
    };
    m.bad = () => 'Space';
    m.view = () => ({ v: m.v.map(x => +x.toFixed(3)) });
    m.buttons = () => [...Array.from({ length: N }, (_, i) => ['Digit' + (i + 1), String(i + 1)]), ['ArrowUp', '▲ step'], ['ArrowDown', '▼ step'], ['Space', 'Sign']];
    m.draw = (c, W, H, P) => {
      txt(c, 'REFERENCE RETURN · element by element', 14, 18, { size: 11, col: COL.gold });
      for (let i = 0; i < N; i++) { const y = 28 + i * 20, g = ok(i); txt(c, String(i + 1), 18, y + 11, { size: 12, col: i === m.sel ? COL.gold : COL.ink });
        bar(c, 34, y, 250, 12, m.v[i], { band: [0.5 - band, 0.5 + band], col: g ? P.good : P.bad, mark: 0.5 });
        lamp(c, 298, y + 6, 6, g ? P.good : P.bad, g ? 'circle' : 'triangle'); if (i === m.sel) txt(c, '◀', 310, y + 11, { size: 12, col: COL.gold }); }
      const n = m.v.filter((_, i) => ok(i)).length; txt(c, `${n} / ${N} in band`, 330, 40, { size: 12, col: n === N ? COL.ink : COL.warn });
      txt(c, `steps ${m.steps}`, 330, 62, { size: 10, col: COL.dim }); txt(c, 'neighbours move ⅓ with each step', 14, 160, { size: 10, col: COL.dim });
    };
    return m;
  },
});
