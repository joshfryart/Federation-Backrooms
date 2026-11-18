// Environmental tech: balance hydro O2 against the longer sensor watch (survey). Three nutrient pumps feed the tree bank, each giving a different
// O2 yield per flow step and each with a cavitation limit. Pick a pump (1-3) and step its flow (Up/Down) until the summed O2 output sits on the
// LONG-watch draw line, not the lower short-term load line, then log the balance (Enter). While output is under the long draw the reserve drains.
import { define, machine, ARROW, DIG, ENTER, ri, rf, pick, clamp, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'env', label: 'Balance hydro O2 against the longer sensor watch', type: 'task:survey' },
  title: 'Three-pump O2 share for the long watch', dept: 'engineering', host: 'console', tool: 'Nutrient pump board',
  how: 'Select a pump (1-3) and step its flow with Up/Down. Each pump yields a different amount of O2 per step and must stay under its limit. Bring the total onto the long-watch draw line and log it (Enter).',
  keys: ['1-3 select pump', 'Up / Down flow step', 'Enter log the balance'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'share the draw', input: 'arrows+digits+enter', win: 'summed pump O2 output brought onto the long-watch draw within tolerance and logged before the reserve hits its floor',
    fail: 'balancing to the short-term load line, driving a pump past its cavitation limit, or letting the reserve drain to its floor',
    rule: 'Total output = sum of each pump\'s steps × its yield. Match the dashed LONG WATCH line (the solid line is only today\'s load). A pump stepped past its red limit cavitates.' },
  rush: 'Matched the pumps to the current load reading and logged it.',
  captions: { 'short balance': 'log rejected', 'off balance': 'log rejected', cavitation: 'pump rattles', 'reserve floor': 'low reserve alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, tol = m.calm ? 0.6 : 0.45;
    m.p = [0, 1, 2].map(() => { const e = pick(r, [0.5, 1, 1.5, 2]), max = ri(r, 4, 7), sol = ri(r, 2, max); return { e, max, sol, s: ri(r, 0, Math.min(2, sol - 1)) }; });
    m.long = m.p.reduce((a, p) => a + p.e * p.sol, 0) + rf(r, -0.2, 0.2); m.short = m.long - rf(r, 2.2, 3.2);
    m.sel = 0; m.res = 1; m.cd = 0;
    m.out = () => m.p.reduce((a, p) => a + p.e * p.s, 0);
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code), a = ARROW(code);
      if (d >= 1 && d <= 3) { m.sel = d - 1; m.cd = 0.12; return true; }
      if (a === 'U' || a === 'D') { const p = m.p[m.sel]; m.cd = 0.12; p.s = clamp(p.s + (a === 'U' ? 1 : -1), 0, 9); if (p.s > p.max) { m.fault('cavitation'); p.s = p.max; } return true; }
      if (ENTER(code)) { m.cd = 0.3; const o = m.out(); if (Math.abs(o - m.long) <= tol) m.win(); else m.fault(Math.abs(o - m.short) <= tol + 0.3 ? 'short balance' : 'off balance'); return true; }
      return !!a;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.cd -= dt; const def = m.long - m.out(); if (def > tol) m.res -= (def * 0.02 + 0.03) * dt; if (m.res <= 0.2) { m.fault('reserve floor'); m.res = 0.5; } };
    m.hint = () => {
      if (m.cd > 0) return []; const i = m.p.findIndex(p => p.s !== p.sol); if (i < 0) return [['Enter', true]];
      if (m.sel !== i) return [[`Digit${i + 1}`, true]]; return [[m.p[i].s < m.p[i].sol ? 'ArrowUp' : 'ArrowDown', true]];
    };
    m.bad = () => m.cd > 0 ? null : 'ArrowUp';
    m.view = () => ({ p: m.p.map(p => [p.e, p.max, p.sol]) });
    m.buttons = () => [['Digit1', 'Pump 1'], ['Digit2', 'Pump 2'], ['Digit3', 'Pump 3'], ['ArrowUp', 'Flow +'], ['ArrowDown', 'Flow −'], ['Enter', 'Log balance']];
    m.draw = (c, W, H, P) => {
      m.p.forEach((p, i) => {
        const x = 14 + i * 74; box(c, x, 12, 66, 112, COL.panel, i === m.sel ? COL.gold : null, 5); txt(c, `PUMP ${i + 1}`, x + 8, 28, { size: 11, col: i === m.sel ? COL.gold : COL.pale });
        txt(c, `×${p.e} O2`, x + 8, 44, { size: 11, col: COL.dim }); const h = 64, y0 = 52;
        c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(x + 22, y0, 20, h); c.fillStyle = COL.peri; c.fillRect(x + 22, y0 + h - p.s / 9 * h, 20, p.s / 9 * h);
        c.fillStyle = P.bad; c.fillRect(x + 16, y0 + h - p.max / 9 * h - 1, 32, 3); txt(c, `${p.s}`, x + 50, y0 + h, { size: 11 });
      });
      const sc = (v) => clamp(v / 22), X = 246, o = m.out();
      txt(c, 'O2 OUTPUT', X, 24, { size: 10, col: COL.dim }); txt(c, o.toFixed(1), X, 46, { size: 18, col: Math.abs(o - m.long) <= tol ? P.good : COL.ink });
      bar(c, X, 56, 140, 12, sc(o), { band: [sc(m.long - tol), sc(m.long + tol)], col: COL.gold });
      c.fillStyle = COL.dim; c.fillRect(X + sc(m.short) * 140 - 1, 52, 2, 20); txt(c, `short load ${m.short.toFixed(1)}`, X, 86, { size: 10, col: COL.dim });
      txt(c, `LONG WATCH draw ${m.long.toFixed(1)} (band)`, X, 100, { size: 10, col: P.good });
      txt(c, 'RESERVE', X, 122, { size: 10, col: COL.dim }); bar(c, X, 128, 140, 10, m.res, { mark: 0.2, col: m.res < 0.35 ? P.bad : P.good });
    };
    return m;
  },
});
