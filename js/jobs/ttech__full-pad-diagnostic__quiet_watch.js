// Transporter tech: full pad diagnostic. The pad test rig runs four patterns. Pick one with its number and watch the pass light while it
// runs: a sound pattern lights PASS on the first try; an intermittent one blinks FAIL, the rig quietly retries, and then it too reads PASS.
// Once the light settles, file it: Enter for a clean first-try pass, Space to flag a pattern that only passed on the retry. The end state
// looks the same, so the only evidence is what you saw during the run.
import { define, machine, DIG, SPACE, ENTER, shuffle, rf, txt, box, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'ttech', label: 'Full pad diagnostic', type: 'task:quiet_watch' },
  title: 'Retry-pass catch on the pad rig', dept: 'operations', host: 'console', tool: 'Pad test rig selector',
  how: 'Press 1-4 to run a pattern and watch its light. When it settles, Enter files a first-try pass; Space flags one that blinked FAIL before passing.',
  keys: ['1-4 run pattern', 'Enter file clean', 'Space flag retry-pass'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'catch retry-pass', input: 'digits+enter+space', win: 'all four pad patterns run and filed, every one that passed only on the rig retry flagged as intermittent',
    fail: 'filing a retry-pass as clean, flagging a first-try pass, or filing before the light settles',
    rule: 'Run a pattern with its number key and watch the light: a red blink before green means the rig retried. After it settles press Space for a retry-pass or Enter for a clean pass.' },
  rush: 'Ran the four patterns, saw four green lights and saved the report.',
  captions: { 'intermittent filed clean': 'low warning tone', 'false flag': 'error buzz', unsettled: 'rig still running' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, RUN = m.calm ? 2.0 : 1.5;
    const retry = shuffle(r, [true, r() < 0.5, false, r() < 0.3]);
    m.pats = ['Phase lock', 'Matter stream', 'Annular confinement', 'Pattern enhancer'].map((n, i) => ({ n, retry: retry[i], blink: rf(r, 0.25, 0.45), rec: 0, filed: false, run: -1 }));
    m.cur = -1; m.rounds = 4; m.round = 0;
    const settled = (p) => p.run >= RUN;
    const light = (p) => { if (p.run < 0) return 'off'; const x = p.run; if (p.retry) { if (x < p.blink) return 'off'; if (x < p.blink + 0.3) return 'fail'; if (x < RUN * 0.65) return 'off'; return 'pass'; } return x < p.blink + 0.15 ? 'off' : 'pass'; };
    const file = (flag) => {
      const p = m.pats[m.cur]; if (!p || p.filed) return; if (!settled(p)) { m.fault('unsettled'); return; }
      if (!flag && p.retry) m.fault('intermittent filed clean'); else if (flag && !p.retry) m.fault('false flag');
      p.filed = true; m.round++; m.cur = -1; if (m.state === 'play' && m.pats.every(q => q.filed)) m.win();
    };
    m.key = (code, down = true) => {
      const d = DIG(code), sp = SPACE(code), en = ENTER(code); if (!(d >= 1 && d <= 4) && !sp && !en) return false; if (m.state !== 'play' || !down) return true;
      if (d) { const p = m.pats[d - 1]; if (p.filed || (m.cur >= 0 && !m.pats[m.cur].filed)) { m.fault('rig busy'); return true; } m.cur = d - 1; p.run = 0; return true; }
      if (m.cur < 0) return true; file(sp); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const p = m.pats[m.cur]; if (p && p.run >= 0) p.run += dt; };
    m.hint = () => { const p = m.pats[m.cur]; if (!p) { const n = m.pats.findIndex(q => !q.filed); return n >= 0 ? [['Digit' + (n + 1), true]] : []; } return settled(p) ? [[p.retry ? 'Space' : 'Enter', true]] : []; };
    m.bad = () => { const p = m.pats[m.cur]; if (!p) { const n = m.pats.findIndex(q => !q.filed); return n >= 0 ? 'Digit' + (n + 1) : null; } return settled(p) ? (p.retry ? 'Enter' : 'Space') : null; };
    m.view = () => ({ pats: m.pats.map(p => [p.retry, +p.blink.toFixed(2)]) });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['Enter', 'File clean'], ['Space', 'Flag retry']];
    m.draw = (c, W, H, P) => {
      txt(c, 'PAD ONE · FULL DIAGNOSTIC', 16, 20, { size: 12, col: COL.pale });
      m.pats.forEach((p, i) => { const y = 34 + i * 26, sel = i === m.cur; box(c, 16, y, 200, 22, sel ? 'rgba(125,151,232,.25)' : 'rgba(255,255,255,.05)', sel ? COL.peri : null, 4);
        txt(c, `${i + 1}  ${p.n}`, 24, y + 15, { size: 11, col: p.filed ? COL.dim : COL.ink }); if (p.filed) txt(c, 'filed', 208, y + 15, { size: 10, col: COL.dim, align: 'right' }); });
      const p = m.pats[m.cur]; if (!p) { txt(c, 'Pick a pattern (1-4)', 240, 80, { size: 12, col: COL.dim }); return; }
      const L = light(p); lamp(c, 290, 70, 22, L === 'pass' ? P.good : L === 'fail' ? P.bad : '#333', L === 'pass' ? 'circle' : L === 'fail' ? 'triangle' : 'square');
      txt(c, L === 'pass' ? 'PASS' : L === 'fail' ? 'FAIL' : '…', 290, 110, { size: 14, col: L === 'fail' ? P.bad : L === 'pass' ? P.good : COL.dim, align: 'center' });
      txt(c, settled(p) ? 'settled: Enter clean · Space flag' : 'running…', 290, 140, { size: 11, col: settled(p) ? COL.ink : COL.dim, align: 'center' });
    };
    return m;
  },
});
