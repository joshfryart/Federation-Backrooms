// Navigator: run the full set of calibration courses. The helm flies each test course while the ETA counter runs; only when it stops at
// arrival can the course be judged. Compare the arrival with the planned time from the test card: within the card's tolerance, log it
// calibrated (1); outside it, flag it to the helm (2). Judging while the counter is still running, a wrong call, or letting the log
// window lapse is a fault.
import { define, machine, DIG, ri, rf, pick, txt, box, bar, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'nav', label: 'Run the full set of calibration courses', type: 'task:shakedown' },
  title: 'Calibration course arrival check', dept: 'flight', host: 'console', tool: 'Calibration log and ETA counter',
  how: 'Wait for the ETA counter to stop at arrival, compare it with the planned time: 1 logs it calibrated if within tolerance, 2 flags it if not.',
  keys: ['1 log calibrated', '2 flag to the helm'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'log or flag', input: 'digits', win: 'four calibration courses each judged against the planned arrival only after the counter stops, and logged or flagged correctly',
    fail: 'judging a course while the ETA counter still runs, logging an arrival outside tolerance, flagging a good one, or leaving it unlogged',
    rule: 'Hands off while the counter runs. When it stops, take the difference from the planned time: inside the card tolerance press 1, outside press 2, before the log window closes.' },
  rush: 'Marked every calibration course done from the plan without comparing the arrivals.',
  captions: { uncompared: 'log buzz', 'wrong call': 'helm query chirp', unlogged: 'log timeout tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, tol = pick(r, [1.5, 2, 2.5]), win = m.calm ? 6 : 4; m.rounds = 4; m.round = 0;
    m.cs = [0, 1, 2, 3].map(k => { const plan = +rf(r, 12, 40).toFixed(1), out = r() < 0.5, d = out ? rf(r, tol + 0.3, tol + 2) : rf(r, 0, tol - 0.3); return { no: `CAL-${ri(r, 10, 99)}`, plan, act: +(plan + (r() < 0.5 ? -1 : 1) * d).toFixed(1), out, fly: rf(r, 1.4, 2.4) }; });
    m.k = 0; m.ft = 0; m.lw = 0;
    const cur = () => m.cs[m.k], stopped = () => m.ft >= cur().fly;
    const next = () => { m.k++; m.ft = 0; m.lw = 0; m.round++; if (m.k >= 4 && m.state === 'play') m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code); if (d !== 1 && d !== 2) return false;
      if (!stopped()) { m.fault('uncompared'); return true; }
      if ((d === 2) !== cur().out) { m.fault('wrong call'); return true; }
      m.ev(d === 1 ? 'logged' : 'flagged'); next(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (!stopped()) { m.ft += dt; return; } m.lw += dt; if (m.lw > win) { m.fault('unlogged'); next(); } };
    m.hint = () => (stopped() && m.lw > 0.2 ? [[cur().out ? 'Digit2' : 'Digit1', true]] : []);
    m.bad = () => (stopped() ? null : 'Digit1');
    m.view = () => ({ tol, cs: m.cs.map(c => [c.plan, c.act]) });
    m.buttons = () => [['Digit1', '1 Calibrated'], ['Digit2', '2 Flag']];
    m.draw = (c, W, H, P) => {
      const q = cur(); if (!q) return; const st = stopped(), shown = st ? q.act : q.act * Math.min(1, m.ft / q.fly);
      txt(c, `TEST CARD · tolerance ±${tol} min · course ${m.k + 1} / 4`, 14, 20, { size: 11, col: COL.peri });
      box(c, 14, 32, 180, 80, 'rgba(0,0,0,.3)', COL.peri, 4); txt(c, q.no, 24, 52, { size: 12, col: COL.pale });
      txt(c, `planned  ${q.plan.toFixed(1)} min`, 24, 74, { size: 12 }); txt(c, `ETA ctr  ${shown.toFixed(1)} min`, 24, 98, { size: 14, col: st ? COL.gold : COL.dim });
      lamp(c, 220, 50, 9, st ? P.good : COL.warn, st ? 'square' : 'triangle'); txt(c, st ? 'ARRIVED: judge it' : 'IN FLIGHT: hands off', 236, 54, { size: 11, col: st ? P.good : COL.warn });
      if (st) { txt(c, 'log window', 220, 84, { size: 10, col: COL.dim }); bar(c, 220, 92, 160, 8, 1 - m.lw / win, { col: COL.peri }); }
      m.cs.slice(0, m.k).forEach((x, i) => txt(c, `${x.no} ${x.out ? 'FLAGGED' : 'calibrated'}`, 14 + i * 96, 140, { size: 9, col: x.out ? P.bad : P.good }));
    };
    return m;
  },
});
