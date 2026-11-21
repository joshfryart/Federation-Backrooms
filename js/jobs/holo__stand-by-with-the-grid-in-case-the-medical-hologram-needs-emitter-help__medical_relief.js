// Holodeck tech: grid standby. Wait quietly: raising power before a call is a fault. When the call marker lights, hold Space to raise the
// requested emitter into the full-power band and keep it there for two and a half seconds; the grid draw swells with the power, so you must
// pulse the key to stay below the limit line.
import { define, machine, SPACE, rf, txt, bar, COL } from './kit.js';

export default define({
  job: { billet: 'holo', label: 'Stand by with the grid in case the medical hologram needs emitter help', type: 'task:medical_relief' },
  title: 'Ride the draw limit on call', dept: 'services', host: 'console', tool: 'Grid power panel',
  how: 'Do nothing until the CALL marker lights. Then hold Space to raise the emitter into the full band; release when the draw nears the limit line.',
  keys: ['Space hold: raise the emitter'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'ride the limit', input: 'space-hold', win: 'the called emitter held in the full-power band for two and a half seconds without crossing the draw limit',
    fail: 'raising power before the call, crossing the draw limit, or answering the call too late',
    rule: 'Hold Space to raise power, let go to lower it. Before the call any raise is a fault; after it, draw above the limit line is a fault, and 3 s without a response is late.' },
  rush: 'Pushed the emitter to full the moment the grid came up and let the draw sort itself out.',
  captions: { early: 'unrequested power change', overload: 'draw limit alarm', late: 'call unanswered' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; m.call = rf(r, 4, 8); m.p = 0; m.acc = 0; m.vio = 0; m.late = 0; const need = 2.5, lim = 0.92;
    const draw = () => 0.38 + 0.5 * m.p + 0.07 * Math.sin(3 * m.t);
    m.key = (code, down = true) => { if (!SPACE(code)) return false; m.held.S = down; return true; };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.p = Math.max(0, Math.min(1, m.p + (m.held.S ? 0.6 : -0.4) * dt)); const called = m.t >= m.call;
      if (!called && m.p > 0.15) { m.vio += dt; if (m.vio > 0.8) { m.fault('early'); m.vio = 0; m.p = 0; } }
      if (called) { if (draw() > lim) { m.fault('overload'); m.p = 0.7; }
        if (m.p >= 0.85 && m.p <= 0.95) { m.acc += dt; if (m.acc >= need) m.win(); } if (m.acc === 0 && m.p < 0.5) { m.late += dt; if (m.late > 3) { m.fault('late'); m.late = 0; } } else m.late = 0; }
    };
    m.hint = () => [['Space', m.t >= m.call && m.p < 0.9]];
    m.bad = () => ['Space', true];
    m.view = () => ({ call: +m.call.toFixed(2) });
    m.buttons = () => [['Space', 'Raise']];
    m.draw = (c, W, H, P) => { const called = m.t >= m.call; txt(c, called ? 'CALL: EMITTER 2 TO FULL' : 'standing by', 20, 26, { size: 14, col: called ? P.bad : COL.dim });
      txt(c, 'POWER', 20, 56, { size: 11, col: COL.dim }); bar(c, 20, 62, 340, 12, m.p, { band: [0.85, 0.95], col: COL.peri }); txt(c, 'GRID DRAW', 20, 98, { size: 11, col: COL.dim }); bar(c, 20, 104, 340, 12, draw(), { mark: lim, col: draw() > lim ? P.bad : COL.gold });
      txt(c, `held in band ${m.acc.toFixed(1)} / 2.5 s`, 20, 138, { size: 12, col: COL.pale }); };
    return m;
  },
});
