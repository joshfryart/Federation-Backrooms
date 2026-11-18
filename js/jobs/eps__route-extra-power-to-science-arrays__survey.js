// EPS tech: route extra power to the science arrays (survey). Meter the array bus first (Enter), then ease the bus switch from main toward the
// array feed (hold ↑). Every bit of travel sags the main bus gauge, and the sag only recovers while the switch rests: move in short nudges and
// let the gauge come back, never in one long throw. Stop at the share on the bridge order slip and log it (Enter).
import { define, machine, ARROW, ENTER, rf, ri, clamp, txt, bar, COL } from './kit.js';

export default define({
  job: { billet: 'eps', label: 'Route extra power to science arrays', type: 'task:survey' },
  title: 'Ease the bus switch to array feed', dept: 'engineering', host: 'console', tool: 'Lab junction bus switch',
  how: 'Press Enter to meter the array bus. Then nudge the bus switch toward array feed (hold ↑ briefly, let the main gauge recover) until it sits on the order slip share; Enter logs it.',
  keys: ['Enter meter / log', '↑ hold: ease toward array', '↓ hold: back toward main'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'ease bus over', input: 'arrows-hold+enter', win: 'the array feed brought to the order slip share in small nudges with the main bus gauge never leaving its band',
    fail: 'throwing the switch in one long pull so the main bus sags out of band, touching it unmetered, or logging off the ordered share',
    rule: 'Enter first to meter. Holding ↑ moves the switch and digs a sag into the main bus gauge that recovers only while you let go. Keep the gauge inside its band; when the switch sits on the slip mark, Enter.' },
  rush: 'Threw the bus switch over in one go and let the lab lights blink.',
  captions: { 'main sag': 'main bus alarm chirps', unmetered: 'meter beeps', 'wrong share': 'bridge query tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, band = m.calm ? 0.16 : 0.12, tol = m.calm ? 0.06 : 0.04, speed = 0.3, k = 1.0, tau = 0.6;
    m.T = rf(r, 0.45, 0.8); m.order = ri(r, 4100, 4999); m.volt = ri(r, 38, 46); m.x = 0; m.sag = 0; m.metered = false;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false;
      if (ENTER(code)) { if (!down) return true; if (!m.metered) { m.metered = true; m.ev('metered'); return true; }
        if (Math.abs(m.x - m.T) <= tol) m.win(); else m.fault('wrong share'); return true; }
      const a = ARROW(code); if (a !== 'U' && a !== 'D') return false;
      if (down && !m.metered) { m.fault('unmetered'); return true; } m.held[a] = down; return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.sag *= Math.exp(-dt / tau);
      if (m.held.U) { const nx = clamp(m.x + speed * dt); m.sag += k * (nx - m.x); m.x = nx; }
      if (m.held.D) m.x = clamp(m.x - speed * dt);
      if (m.sag > band) { m.fault('main sag'); m.x = clamp(m.x - 0.12); m.sag = 0; m.held = {}; }
    };
    m.hint = () => { if (!m.metered) return [['Enter', true]]; if (Math.abs(m.x - m.T) <= tol * 0.5) return [['ArrowUp', false], ['Enter', true]];
      return [['ArrowUp', m.x < m.T && m.sag < band * 0.55], ['ArrowDown', m.x > m.T]]; };
    m.bad = () => 'ArrowUp';
    m.view = () => ({ T: +m.T.toFixed(3), order: m.order });
    m.buttons = () => [['Enter', m.metered ? 'Log' : 'Meter'], ['ArrowUp', '▲ array'], ['ArrowDown', '▼ main']];
    m.draw = (c, W, H, P) => {
      txt(c, `ORDER ${m.order}: array feed to ${Math.round(m.T * 100)} %`, 12, 18, { size: 12, col: COL.pale });
      txt(c, m.metered ? `array bus metered ${m.volt} kV ✓` : 'array bus NOT METERED', 12, 36, { size: 11, col: m.metered ? P.good : COL.warn });
      txt(c, 'Bus switch: main → array', 12, 62, { size: 10, col: COL.dim }); bar(c, 12, 68, 300, 14, m.x, { band: [m.T - tol, m.T + tol] });
      const g = clamp(1 - m.sag / (band * 1.5)); txt(c, 'Main bus gauge', 12, 106, { size: 10, col: COL.dim });
      bar(c, 12, 112, 300, 14, g, { band: [1 - 1 / 1.5, 1], col: m.sag > band * 0.7 ? COL.warn : COL.peri });
      txt(c, m.sag > band * 0.7 ? 'SAGGING: let go' : 'steady', 320, 124, { size: 11, col: m.sag > band * 0.7 ? P.bad : P.good });
      txt(c, `${Math.round(m.x * 100)} %`, 320, 80, { size: 14 });
    };
    return m;
  },
});
