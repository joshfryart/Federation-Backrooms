// Chief engineer: stage a controlled power-up test (shakedown). Step the output up one notch at a time (Up). At every notch hold the soak
// (Space held) until the gauges settle: injector temperature and field strength overshoot when the step lands and only the settled figure
// counts. Read them against the sheet's limits. Clean: step up again. Over a limit: drop back one notch (Down) and sign the test off (Enter).
// Stepping before the soak is done, stepping past a limit, or signing off before the ramp has found its top is the test's mistake.
import { define, machine, ARROW, SPACE, ENTER, ri, clamp, txt, box, bar, COL } from './kit.js';

const NOTCH = 6;
export default define({
  job: { billet: 'ce', label: 'Stage a controlled power-up test', type: 'task:shakedown' },
  title: 'Notch-and-soak power ramp', dept: 'engineering', host: 'console', tool: 'Output stepper and checkpoint sheet',
  how: 'Press Up to step the output one notch, then hold Space to soak until the gauges settle. Settled and in limit: step again. Over a limit: press Down to drop back one notch and Enter to sign off. Clean at the top notch: Enter.',
  keys: ['Up step a notch', 'Space hold: soak', 'Down drop back', 'Enter sign off'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'step and soak', input: 'arrows+space-hold+enter', win: 'the output ramped notch by notch with a full soak at each checkpoint, stopped at the first settled limit and dropped back one notch before sign-off',
    fail: 'stepping up before a soak settles, stepping past a settled over-limit reading, or signing off before the ramp reaches its limit or top',
    rule: 'Each notch makes the gauges jump and ring; holding Space runs the soak timer and only when it completes are the settled figures logged against the limits. Over: Down then Enter. In limit: Up. Releasing Space restarts the soak.' },
  rush: 'Ran the stepper straight up to full output and read the gauges there.',
  captions: { 'skipped hold': 'XO: "hold at that checkpoint"', 'pushed past limit': 'containment alarm', 'stopped early': 'XO: "the ramp is not done"', 'needless drop': 'stepper clunks down' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, soakT = m.calm ? 1.3 : 1.6, limT = ri(r, 1180, 1260), limF = ri(r, 88, 96), F = ri(r, 3, NOTCH + 1);
    m.read = Array.from({ length: NOTCH + 1 }, (_, n) => { const over = n >= F, which = over ? (r() < 0.5 ? 0 : 1) : -1;
      return { T: which === 0 ? limT + ri(r, 8, 40) : Math.round(limT * (0.62 + n * 0.055) - ri(r, 4, 20)), Fs: which === 1 ? limF + ri(r, 1, 5) : Math.round(limF * (0.6 + n * 0.06) - ri(r, 1, 3)) }; });
    m.n = 1; m.soak = 0; m.soaked = false; m.dropped = false; m.rounds = NOTCH; m.round = 1;
    const over = () => m.read[m.n].T > limT || m.read[m.n].Fs > limF;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (SPACE(code)) { m.held.S = down; if (!down && !m.soaked) m.soak = 0; return true; }
      if (!down) return a === 'U' || a === 'D' || ENTER(code);
      if (a === 'U') { if (m.dropped) { m.fault('pushed past limit'); return true; } if (!m.soaked) { m.fault('skipped hold'); return true; } if (over()) { m.fault('pushed past limit'); return true; }
        if (m.n < NOTCH) { m.n++; m.round = m.n; m.soak = 0; m.soaked = false; } return true; }
      if (a === 'D') { if (m.soaked && over() && !m.dropped) { m.n--; m.dropped = true; } else m.fault('needless drop'); return true; }
      if (ENTER(code)) { if (m.dropped || (m.n === NOTCH && m.soaked && !over())) m.win(); else m.fault('stopped early'); return true; }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.held.S && !m.soaked && !m.dropped) { m.soak += dt; if (m.soak >= soakT) m.soaked = true; } };
    m.hint = () => {
      if (m.dropped) return [['Space', false], ['Enter', true]];
      if (!m.soaked) return [['Space', true]];
      if (over()) return [['Space', false], ['ArrowDown', true]];
      return m.n === NOTCH ? [['Space', false], ['Enter', true]] : [['Space', false], ['ArrowUp', true]];
    };
    m.bad = () => 'ArrowUp';
    m.view = () => ({ F, limT, limF, read: m.read.map(x => [x.T, x.Fs]) });
    m.buttons = () => [['ArrowUp', '▲ notch'], ['Space', 'Soak (hold)'], ['ArrowDown', '▼ drop back'], ['Enter', 'Sign off']];
    m.draw = (c, W, H, P) => { const x = m.read[m.n], ring = m.soaked ? 0 : (1 - m.soak / soakT) * Math.sin(m.t * 17), k = m.soak / soakT;
      for (let n = 1; n <= NOTCH; n++) box(c, 14 + (n - 1) * 30, 14, 26, 18, n === m.n ? 'rgba(240,147,58,.35)' : n < m.n ? 'rgba(79,208,106,.18)' : 'rgba(255,255,255,.05)', n === m.n ? COL.orange : null, 4);
      for (let n = 1; n <= NOTCH; n++) txt(c, n, 27 + (n - 1) * 30, 27, { size: 10, align: 'center' });
      txt(c, m.dropped ? 'DROPPED BACK — sign off' : `notch ${m.n} · soak ${m.soaked ? 'SETTLED' : Math.round(k * 100) + ' %'}`, 200, 27, { size: 11, col: m.soaked ? COL.warn : COL.ink });
      const Tv = Math.round(x.T * (1 + ring * 0.05) * (m.soaked ? 1 : 0.97 + 0.03 * k)), Fv = Math.round(x.Fs * (1 + ring * 0.06));
      txt(c, `Injector temp ${Tv} K  (limit ${limT})`, 14, 62, { size: 12, col: m.soaked && x.T > limT ? P.bad : COL.ink }); bar(c, 14, 68, W - 28, 10, Tv / (limT * 1.1), { mark: 1 / 1.1, col: COL.gold });
      txt(c, `Field strength ${Fv} MC  (limit ${limF})`, 14, 100, { size: 12, col: m.soaked && x.Fs > limF ? P.bad : COL.ink }); bar(c, 14, 106, W - 28, 10, Fv / (limF * 1.1), { mark: 1 / 1.1, col: COL.peri });
      bar(c, 14, 130, W - 28, 6, clamp(k), { col: P.good }); txt(c, m.soaked ? (x.T > limT || x.Fs > limF ? 'OVER LIMIT ⚠' : 'in limit ✓') : 'hold Space: soak', 14, H - 12, { size: 11, col: COL.dim }); };
    return m;
  },
});
