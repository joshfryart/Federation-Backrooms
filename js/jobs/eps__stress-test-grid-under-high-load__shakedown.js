// EPS tech: stress-test the grid under high load (shakedown). The load bank is on a dead-man switch: while you hold Space it soaks each
// ten-percent step for a full count and then climbs to the next. Watch the four tap temperatures; the moment one reads HOT, let go and the bank
// sheds to zero. Then log the breaking point (the step number, 1-9). Letting go before anything goes hot cuts the test short and it starts over.
import { define, machine, SPACE, DIG, ri, rf, clamp, txt, bar, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'eps', label: 'Stress-test grid under high load', type: 'task:shakedown' },
  title: 'Dead-man load bank ramp', dept: 'engineering', host: 'console', tool: 'Load bank panel',
  how: 'Hold Space to run the load bank up in soaked ten-percent steps. Let go the instant a tap reads HOT, then press the step number it broke at (1-9).',
  keys: ['Space hold: run the bank', '1-9 log the breaking step'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'dead-man ramp', input: 'space-hold+digits', win: 'the load bank ramped step by step until the first hot tap, released at once and the breaking step logged',
    fail: 'holding the bank on after a tap goes hot so it trips, letting go before anything gives, or logging the wrong breaking step',
    rule: 'While Space is held the bank soaks each step for its count, then climbs ten percent. A tap lamp turning to a triangle with HOT means let go within a moment. Afterwards type the step it broke at.' },
  rush: 'Ran the bank straight to ninety and wrote down whatever tripped first.',
  captions: { 'tap tripped': 'breaker bangs', 'cut short': 'bank spins down', 'wrong step': 'log rejected tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, soakT = 1.6, late = m.calm ? 1.0 : 0.7;
    m.B = ri(r, 4, 8); m.weak = ri(r, 0, 3); m.hotAt = rf(r, 0.4, 1.2); m.base = [0, 1, 2, 3].map(() => rf(r, 0.25, 0.35));
    m.lv = 0; m.soak = 0; m.hot = -1; m.ph = 'run';
    const shed = () => { m.lv = 0; m.soak = 0; m.held.S = false; };
    m.temp = (k) => clamp(m.base[k] + m.lv * 0.05 + (k === m.weak ? (m.lv >= m.B - 1 ? 0.12 : 0) + (m.lv >= m.B ? 0.25 * clamp(m.soak / m.hotAt) : 0) : 0));
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code);
      if (d) { if (!down) return true; if (m.ph !== 'record') { m.fault('wrong step'); return true; } if (d === m.B) m.win(); else m.fault('wrong step'); return true; }
      if (!SPACE(code)) return false; if (m.ph === 'record') return true;
      if (down && !m.held.S) { m.held.S = true; if (!m.lv) m.lv = 1; return true; }
      if (!down && m.held.S) { if (m.hot >= 0) { m.ph = 'record'; shed(); } else { m.fault('cut short'); shed(); } }
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt) || m.ph === 'record' || !m.held.S) return; m.soak += dt;
      if (m.lv >= m.B && m.soak >= m.hotAt && m.hot < 0) { m.hot = m.t; m.ev('hot', { tap: m.weak }); }
      if (m.hot >= 0 && m.t - m.hot > late) { m.fault('tap tripped'); m.ph = 'record'; shed(); return; }
      if (m.soak >= soakT && m.hot < 0) { m.lv = Math.min(9, m.lv + 1); m.soak = 0; }
    };
    m.hint = () => m.ph === 'record' ? [['Digit' + m.B, true]] : m.hot >= 0 ? [['Space', false]] : [['Space', true]];
    m.bad = () => m.held.S && m.lv >= 2 ? ['Space', false] : ['Space', true];
    m.view = () => ({ B: m.B, weak: m.weak });
    m.buttons = () => [['Space', 'Hold: run bank'], ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ['Digit' + n, String(n)])];
    m.draw = (c, W, H, P) => {
      txt(c, 'LOAD BANK', 12, 18, { size: 11, col: COL.peri }); txt(c, m.ph === 'record' ? 'SHED · log the breaking step' : m.held.S ? `step ${m.lv} · ${m.lv * 10} %` : 'idle: hold Space', 12, 38, { size: 14, col: m.ph === 'record' ? COL.warn : COL.ink });
      bar(c, 12, 46, 170, 10, m.lv / 9); txt(c, 'soak', 12, 72, { size: 10, col: COL.dim }); bar(c, 44, 64, 138, 8, m.soak / soakT, { col: COL.peri });
      for (let k = 0; k < 4; k++) {
        const x = 220 + k * 44, t = m.temp(k), hot = k === m.weak && m.hot >= 0;
        lamp(c, x, 40, 13, hot ? P.bad : t > 0.6 ? COL.warn : P.good, hot ? 'triangle' : 'circle');
        txt(c, `T${k + 1}`, x, 72, { size: 10, align: 'center', col: COL.dim }); txt(c, hot ? 'HOT' : `${Math.round(40 + t * 60)}°`, x, 88, { size: 11, align: 'center', col: hot ? P.bad : COL.ink });
      }
      txt(c, `faults ${m.strikes}/${m.maxStrikes}`, W - 12, H - 10, { size: 10, align: 'right', col: COL.dim });
    };
    return m;
  },
});
