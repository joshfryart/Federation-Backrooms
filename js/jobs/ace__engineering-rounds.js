// Assistant Chief Engineer: engineering rounds. Three gauges are re-read every lap and set against yesterday's log. Each reads fine on its own;
// one creeps up lap after lap while the others only jitter. Write the creep into the log only once it has risen three laps in a row:
// too early is a guess, and writing a jittery gauge is a false entry. Let a creep run out of laps unwritten and it is missed.
import { define, machine, DIG, ENTER, rf, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'ace', label: 'Engineering rounds', type: 'loop' },
  title: 'Write the creep into the round log', dept: 'engineering', host: 'console', tool: 'Rounds tablet',
  how: 'Each lap re-reads three gauges. Pick the gauge with 1 to 3 once it has risen three laps in a row, then press Enter to write it in the log.',
  keys: ['1-3 pick a gauge', 'Enter write it in the log'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'write the creep', input: 'digits+enter',
    win: 'two rounds closed by logging the one gauge that rose three laps running, after the third rise',
    fail: 'logging a jittery gauge, logging a creep before three rises, or letting the laps run out with the creep unlogged',
    rule: 'Gauges are re-read each lap. A creep rises every lap; jitter goes up and down. Pick the gauge (1-3) with three rises in a row and press Enter.' },
  rush: 'Initialled the round without comparing today against yesterday.',
  captions: { guess: 'log entry rejected', jitter: 'log entry rejected', missed: 'round closed unmarked' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, gap = m.calm ? 1.5 : 1.1; m.rounds = 2; m.round = 0; m.sel = 0;
    const names = ['Core temp', 'Coolant inlet', 'EPS load'], base = [[1840, 1900], [310, 340], [88, 120]];
    const build = () => { const d = Math.floor(r() * 3); return { d, n: 1, at: 0, g: names.map((_, i) => { const v = [rf(r, base[i][0], base[i][1])], s = r() < 0.5 ? 1 : -1;
      for (let k = 1; k < 6; k++) v.push(i === d ? v[k - 1] + rf(r, 1.5, 2.6) : v[k - 1] + (k % 2 ? s : -s) * rf(r, 0.8, 2.2)); return v; }) }; };
    m.cur = build(); m.old = m.cur.g.map(v => v[0] - 1);
    const run = (v, n) => { let k = 0; for (let i = n - 1; i > 0 && v[i] > v[i - 1]; i--) k++; return k; };
    m.run = (i) => run(m.cur.g[i], m.cur.n);
    const next = () => { m.round++; if (m.round >= m.rounds) m.win(); else { m.cur = build(); m.old = m.cur.g.map(v => v[0] - 1); } };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code); if (d >= 1 && d <= 3) { m.sel = d - 1; return true; }
      if (!ENTER(code)) return false; const c = m.cur;
      if (m.sel !== c.d) m.fault('jitter'); else if (m.run(m.sel) < 3) m.fault('guess'); else next(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const c = m.cur; c.at += dt; if (c.at >= gap) { c.at = 0; if (c.n < 6) c.n++; else { m.fault('missed'); if (m.state === 'play') { m.cur = build(); m.old = m.cur.g.map(v => v[0] - 1); } } } };
    m.hint = () => { const c = m.cur; return m.run(c.d) >= 3 ? [['Digit' + (c.d + 1), true], ['Enter', true]] : []; };
    m.bad = () => { m.sel = (m.cur.d + 1) % 3; return 'Enter'; };
    m.view = () => ({ d: m.cur.d, g: m.cur.g.map(v => v.map(x => +x.toFixed(1))) });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Enter', 'Log it']];
    m.draw = (c) => { const g = m.cur.g; names.forEach((nm, i) => { const y = 14 + i * 46, on = m.sel === i; box(c, 10, y, 380, 40, COL.panel, on ? COL.gold : null);
      txt(c, `${i + 1} ${nm}`, 18, y + 16, { size: 12, col: on ? COL.gold : COL.ink }); txt(c, `yesterday ${m.old[i].toFixed(0)}`, 18, y + 33, { size: 10, col: COL.dim });
      for (let k = 0; k < m.cur.n; k++) txt(c, g[i][k].toFixed(0) + (k && g[i][k] > g[i][k - 1] ? '▲' : k ? '▼' : ''), 130 + k * 42, y + 24, { size: 11 });
      txt(c, `rises ${m.run(i)}`, 350, y + 24, { size: 11, col: COL.pale }); }); txt(c, `round ${m.round + 1}/2`, 330, 10, { size: 10, col: COL.dim }); };
    return m;
  },
});
