// Transporter chief: full transporter system test. Walk the test script in order: press each subsystem's self-test (1-4), then watch its
// reading while the coil temperature climbs. Every subsystem passes cold; a marginal one drifts out of its band only once it is warm. Log
// the verdict (Enter pass, Space fail) only after the temperature has reached the warm mark.
import { define, machine, DIG, SPACE, ENTER, ri, rf, shuffle, txt, box, bar, COL } from './kit.js';

const SUBS = ['Pattern buffer', 'Emitter coils', 'Lock / beacon', 'Cooling loop'];
export default define({
  job: { billet: 'tchief', label: 'Full transporter system test', type: 'task:shakedown' },
  title: 'Self-test soak to warm', dept: 'operations', host: 'console', tool: 'Self-test panel and test script',
  how: 'Press each subsystem\'s self-test in script order (1-4). Let the coil temperature climb to the warm mark while you watch the reading, then log it: Enter if it stayed in band, Space if it drifted out.',
  keys: ['1-4 run self-test', 'Enter log pass', 'Space log fail'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'soak and judge', input: 'digits+enter+space', win: 'all four subsystems self-tested in script order and each verdict logged only after it had soaked up to the warm mark',
    fail: 'logging a verdict while the subsystem is still cold, passing one that drifts once warm, or running the tests out of order',
    rule: 'Run the next script line with its digit. The temperature bar fills toward WARM; the reading may wander out of its band only near the top. At WARM, Enter if the reading is in band, Space if not.' },
  rush: 'Pressed every self-test, saw four green lights, and logged the system good.',
  captions: { 'logged cold': 'test log reject', 'wrong verdict': 'error tone', 'out of order': 'script buzzer' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, heat = m.calm ? 0.38 : 0.45;
    const drift = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 1, 2)));
    m.order = shuffle(r, [0, 1, 2, 3]);
    m.subs = SUBS.map((n, k) => ({ n, drift: drift.has(k), base: rf(r, 0.42, 0.58), dir: r() < 0.5 ? -1 : 1, amt: rf(r, 0.22, 0.3), temp: 0, run: false, log: 0 }));
    m.k = 0; m.rounds = 4; m.round = 0;
    const S = () => m.subs[m.order[m.k]];
    m.read = (s) => s.base + (s.drift ? s.dir * s.amt * Math.max(0, (s.temp - 0.6) / 0.4) : 0) + 0.02 * Math.sin(m.t * 5 + s.base * 9);
    const inBand = (s) => Math.abs(m.read(s) - 0.5) < 0.15;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code);
      if (!d && !SPACE(code) && !ENTER(code)) return false; if (!down) return true; const s = S(); if (!s) return true;
      if (d) { if (d > 4) return true; if (s.run) return true; if (d - 1 !== m.order[m.k]) { m.fault('out of order'); return true; } s.run = true; m.ev('run', { s: d }); return true; }
      if (!s.run || s.temp < 1) { m.fault('logged cold'); return true; }
      const pass = ENTER(code); if (pass !== inBand(s)) m.fault('wrong verdict');
      s.log = pass ? 1 : 2; m.k++; m.round++; if (m.k >= 4) m.win();
      return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const s = S(); if (s && s.run) s.temp = Math.min(1, s.temp + heat * dt); };
    m.hint = () => { const s = S(); if (!s) return []; if (!s.run) return [['Digit' + (m.order[m.k] + 1), true]]; if (s.temp < 1) return []; return [[inBand(s) ? 'Enter' : 'Space', true]]; };
    m.bad = () => { const s = S(); if (!s) return null; return s.run ? 'Enter' : 'Digit' + (m.order[m.k] + 1); };
    m.view = () => ({ order: m.order, subs: m.subs.map(s => [s.drift, +s.base.toFixed(2)]) });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['Enter', 'Pass'], ['Space', 'Fail']];
    m.draw = (c, W, H, P) => {
      txt(c, 'TEST SCRIPT', 14, 16, { size: 10, col: COL.dim });
      m.order.forEach((k, j) => { const s = m.subs[k], on = j === m.k; box(c, 10, 22 + j * 26, 160, 22, on ? 'rgba(240,147,58,.18)' : 'rgba(255,255,255,.04)', on ? COL.orange : null, 5);
        txt(c, `${k + 1} ${s.n}`, 18, 37 + j * 26, { size: 11, col: on ? COL.gold : COL.ink }); if (s.log) txt(c, s.log === 1 ? 'PASS' : 'FAIL', 164, 37 + j * 26, { size: 10, align: 'right', col: s.log === 1 ? P.good : P.bad }); });
      const s = S(); if (!s) return;
      txt(c, s.run ? `${s.n} self-test running` : `press ${m.order[m.k] + 1} to run ${s.n}`, 186, 30, { size: 11, col: COL.ink });
      txt(c, 'reading', 186, 56, { size: 10, col: COL.dim }); const ok = s.run && inBand(s);
      bar(c, 236, 46, W - 250, 14, s.run ? m.read(s) : 0, { band: [0.35, 0.65], col: s.run ? (ok ? P.good : P.bad) : COL.dim });
      if (s.run) txt(c, ok ? 'in band' : 'OUT OF BAND', W - 14, 76, { size: 10, align: 'right', col: ok ? P.good : COL.warn });
      txt(c, 'coil temp', 186, 102, { size: 10, col: COL.dim }); bar(c, 236, 92, W - 250, 14, s.temp, { mark: 1, col: COL.orange });
      txt(c, s.temp >= 1 ? 'WARM — log it' : s.run ? 'soaking…' : 'cold', W - 14, 124, { size: 11, align: 'right', col: s.temp >= 1 ? COL.gold : COL.dim });
    };
    return m;
  },
});
