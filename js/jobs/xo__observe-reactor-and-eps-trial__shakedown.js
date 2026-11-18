// XO: observe the reactor and EPS trial. You hold the trial's dead-man key: while it is held the trial load climbs in steps, and output,
// coolant and EPS gauges climb with it at different rates. Let go (the emergency cut) the moment ANY gauge crosses its red line. Cutting while
// all three are still under the line wastes the trial run; holding on past a crossing sets off the core alarm.
import { define, machine, SPACE, shuffle, ri, rf, txt, box, COL } from './kit.js';

const G = ['Reactor output', 'Coolant flow', 'EPS load'];
export default define({
  job: { billet: 'xo', label: 'Observe reactor and eps trial', type: 'task:shakedown' },
  title: 'Dead-man trial cut', dept: 'command', host: 'console', tool: 'Warp core rail gauges and emergency cut key',
  how: 'Hold Space to run the trial load up in steps and watch all three gauges; let go the instant any one of them crosses its red line.',
  keys: ['Space hold: run the trial', 'release: emergency cut'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'dead-man cut', input: 'space-hold', win: 'three trial runs each cut by releasing the key within moments of the first gauge crossing its red line',
    fail: 'releasing while every gauge is still under its line, or holding on after a gauge has crossed so the core alarms',
    rule: 'Hold Space: every half second the load steps up and the three gauges rise at their own rates. Release as soon as any needle passes its red line; not before, and not more than half a second after.' },
  rush: 'Watched the output gauge alone and let the trial run to full load.',
  captions: { 'cut early': 'trial aborts', 'core alarm': 'core alarm klaxon', step: 'core pitch rises', stutter: 'coolant stutter' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, dtStep = m.calm ? 0.6 : 0.45, late = m.calm ? 0.7 : 0.5;
    m.runs = Array.from({ length: 3 }, () => { const first = ri(r, 0, 2), at = ri(r, 4, 7); return G.map((g, k) => { const cross = k === first ? at : at + ri(r, 1, 3) + rf(r, 0.1, 0.8); return { base: rf(r, 0.15, 0.3), cross }; }); });
    m.i = 0; m.lv = 0; m.acc = 0; m.over = -1; m.on = false; m.rounds = 3; m.round = 0;
    const val = (g) => g.base + (1 - g.base) * m.lv / g.cross, run = () => m.runs[m.i], crossed = () => run().some(g => val(g) > 1);
    const next = () => { m.i++; m.round++; m.lv = 0; m.acc = 0; m.over = -1; if (m.i >= m.runs.length) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !SPACE(code)) return false;
      if (down) { m.on = true; return true; } if (!m.on) return true; m.on = false;
      if (m.over < 0) { if (m.lv > 0) { m.fault('cut early'); m.lv = 0; m.acc = 0; } return true; }
      m.ev('cut', { run: m.i, step: m.lv }); next(); return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt) || !m.on || m.i >= m.runs.length) return;
      if (m.over >= 0) { if (m.t - m.over > late) { m.fault('core alarm'); m.on = false; next(); } return; }
      m.acc += dt; if (m.acc >= dtStep) { m.acc -= dtStep; m.lv++; m.ev('step', { s: m.lv }); if (crossed()) m.over = m.t; }
    };
    m.hint = () => { if (m.i >= m.runs.length) return []; return [['Space', m.over < 0]]; };
    m.bad = () => ['Space', true];
    m.view = () => ({ runs: m.runs.map(rn => rn.map(g => +g.cross.toFixed(2))) });
    m.buttons = () => [['Space', 'Hold: run trial']];
    m.draw = (c, W, H, P) => {
      const rn = run(); if (!rn) return; txt(c, `TRIAL RUN ${m.i + 1}/3   load step ${m.lv}`, 14, 20, { size: 12, col: COL.gold }); txt(c, m.on ? 'KEY HELD' : 'key released', W - 14, 20, { size: 11, col: m.on ? COL.orange : COL.dim, align: 'right' });
      rn.forEach((g, k) => { const y = 36 + k * 40, v = val(g), w = W - 150, red = 120 + w * 0.8; txt(c, G[k], 14, y + 16, { size: 11 });
        box(c, 120, y + 4, w, 18, 'rgba(255,255,255,.06)', null, 4); c.fillStyle = v > 1 ? P.bad : COL.peri; c.fillRect(120, y + 6, Math.min(w, w * 0.8 * v), 14);
        c.fillStyle = P.bad; c.fillRect(red - 1, y, 3, 26); txt(c, v > 1 ? '▲ OVER' : `${Math.round(v * 100)} %`, W - 14, y + 18, { size: 10, col: v > 1 ? P.bad : COL.pale, align: 'right' }); });
      txt(c, 'Release the key the instant any needle passes its red line', 14, H - 6, { size: 10, col: COL.dim });
    };
    return m;
  },
});
