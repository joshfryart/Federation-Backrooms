// Holodeck tech: safeties at full power. Press a digit to trip that emitter's interlock; a second later it reads DROPPED or STILL LIVE. A live
// emitter that failed to cut must be logged (Space) before the next trip. Logging a dropped one is a fault, so is leaving a live one unlogged.
import { define, machine, DIG, SPACE, ri, rf, txt, COL } from './kit.js';

export default define({
  job: { billet: 'holo', label: 'Test the safeties at full power and log the result', type: 'task:shakedown' },
  title: 'Trip each interlock, log the live one', dept: 'services', host: 'console', tool: 'Interlock test board',
  how: 'Press an emitter number to trip its interlock. If it still reads LIVE a moment later, press Space to log it. Test all four emitters.',
  keys: ['1-4 trip that emitter', 'Space log a live emitter'], limit: 28, maxFaults: 3,
  fingerprint: { verb: 'trip and log', input: 'digits+space', win: 'all four interlocks tripped and the one emitter that stayed live logged as a failure',
    fail: 'logging an emitter that dropped, or tripping another before logging the one still live',
    rule: 'A digit trips an interlock; about a second later it reads DROPPED or STILL LIVE. Space logs a live one. Do not log a dropped emitter or trip another while one is live.' },
  rush: 'Tripped them all together at full power and logged a pass without reading any.',
  captions: { 'false log': 'log rejected', 'live ignored': 'live emitter flagged by safety' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; m.dl = [0, 1, 2, 3].map(() => +rf(r, 0.8, 1.3).toFixed(2)); m.stuck = ri(r, 0, 3); m.tested = [false, false, false, false]; m.cur = -1; m.at = 0; m.logged = false;
    const out = () => m.cur >= 0 && m.t - m.at >= m.dl[m.cur] ? (m.cur === m.stuck ? 'live' : 'dropped') : null;
    const check = () => { if (m.tested.every(Boolean) && m.logged) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code);
      if (d >= 1 && d <= 4) { if (m.cur >= 0 && !(out() === 'dropped' || (out() === 'live' && m.logged))) { return true; } if (out() === 'live' && !m.logged) { m.fault('live ignored'); return true; } if (m.tested[d - 1]) return true; m.cur = d - 1; m.at = m.t; m.tested[d - 1] = true; check(); return true; }
      if (SPACE(code)) { if (out() === 'live' && !m.logged) { m.logged = true; check(); } else m.fault('false log'); return true; } return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (out() === 'live' && !m.logged && m.t - m.at > m.dl[m.cur] + 2.5) { m.fault('live ignored'); m.logged = true; check(); } };
    m.hint = () => { const o = out(); if (o === 'live' && !m.logged) return [['Space', true]]; if (m.cur >= 0 && o === null) return []; const n = m.tested.findIndex(x => !x); return n >= 0 ? [['Digit' + (n + 1), true]] : []; };
    m.bad = () => 'Space';
    m.view = () => ({ stuck: m.stuck, dl: m.dl });
    m.buttons = () => [1, 2, 3, 4].map(i => ['Digit' + i, 'Trip ' + i]).concat([['Space', 'Log']]);
    m.draw = (c, W, H, P) => { for (let i = 0; i < 4; i++) { const x = 50 + i * 90, o = m.cur === i ? out() : null; c.fillStyle = m.tested[i] ? (o === 'live' ? P.bad : COL.dim) : COL.peri; c.fillRect(x - 24, 36, 48, 48); txt(c, i + 1, x, 66, { size: 20, align: 'center', col: '#111' });
      txt(c, !m.tested[i] ? 'untested' : m.cur === i ? (o ? o.toUpperCase() : 'tripping') : 'DROPPED', x, 104, { size: 10, align: 'center', col: o === 'live' ? P.bad : COL.pale }); }
      txt(c, m.logged ? 'failure logged' : '', 200, 140, { size: 12, align: 'center', col: P.good }); };
    return m;
  },
});
