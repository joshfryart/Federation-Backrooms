// Environmental tech: watch temperature and humidity of the stores (cargo run). One louvre wheel works against two readings: opening the vent
// louvres dries the locker but lets warm corridor air in. Through the day (and the loading-door surges of damp air) hold Left/Right to trim the
// louvres so the hygrometer stays in its band under the temperature ceiling; when evening comes, close them down before the night heat builds.
import { define, machine, ARROW, rf, clamp, txt, bar, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'env', label: 'Watch temperature and humidity of stores', type: 'task:cargo_run' },
  title: 'Stores louvre trim through the night', dept: 'engineering', host: 'console', tool: 'Stores locker louvre wheel',
  how: 'Hold Right to open the louvres (drier, warmer) and Left to close them (damper, cooler). Keep the humidity in its band and the temperature under the ceiling through the day, and close down for the night.',
  keys: ['Right hold: open louvres', 'Left hold: close louvres'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'trim louvres', input: 'arrows-hold', win: 'the stores held in the humidity band under the temperature ceiling from morning through the night with no wilting',
    fail: 'damp air left to sit on the perishables, or the louvres left open into the night so the stores heat up',
    rule: 'One wheel, two readings: open = humidity down and temperature up. Door surges push humidity up in the day; at night the corridor is warm, so the louvres must come nearly closed.' },
  rush: 'Propped the louvres open and left the stores to sort themselves out overnight.',
  captions: { wilting: 'perishables alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, D = Math.round(m.limit * 0.66 * 10) / 10, grace = m.calm ? 3 : 2, HB = [0.35, 0.55], CEIL = 0.6;
    m.D = D; m.night = D * rf(r, 0.55, 0.65); m.base = rf(r, 0.74, 0.8);
    m.surge = [rf(r, 0.12, 0.25) * D, rf(r, 0.32, 0.45) * D].map(a => ({ a, b: a + rf(r, 2.5, 3.5), up: rf(r, 0.08, 0.11) }));
    m.u = 0.2; m.h = m.base - 0.1; m.T = 0.3; m.bad_t = 0; m.spoil = 0;
    const ramp = (t, a, b) => clamp((t - a) / 0.8) * clamp((b - t) / 0.8);
    m.src = (t) => (t >= m.night ? m.base - 0.28 * clamp((t - m.night) / 1.5) : m.base) + m.surge.reduce((s, g) => s + g.up * ramp(t, g.a, g.b), 0);
    m.Tb = (t) => 0.2 + 0.25 * clamp((t - m.night) / 1.5);
    m.key = (code, down = true) => { if (m.state !== 'play') return false; const a = ARROW(code); if (a === 'L' || a === 'R') { m.held[a] = down; return true; } return !!a; };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.u = clamp(m.u + ((m.held.R ? 1 : 0) - (m.held.L ? 1 : 0)) * 0.55 * dt);
      const k = Math.min(1, dt / 0.9); m.h += (m.src(m.t) - 0.5 * m.u - m.h) * k; m.T += (m.Tb(m.t) + 0.35 * m.u - m.T) * k;
      const off = m.h < HB[0] || m.h > HB[1] || m.T > CEIL; m.bad_t = off ? m.bad_t + dt : 0; m.spoil = Math.max(m.spoil, m.bad_t / grace);
      if (m.bad_t > grace) { m.fault('wilting'); m.bad_t = 0; }
      if (m.t >= D) m.win();
    };
    m.want = () => { const t = m.t + 0.4; return clamp(Math.min((m.src(t) - 0.45) / 0.5, (CEIL - 0.05 - m.Tb(t)) / 0.35)); };
    m.hint = () => { const d = m.want() - m.u; return [['ArrowRight', d > 0.03], ['ArrowLeft', d < -0.03]]; };
    m.bad = () => ['ArrowRight', true];
    m.view = () => ({ night: +m.night.toFixed(2), s: m.surge.map(g => +g.a.toFixed(2)) });
    m.buttons = () => [['ArrowLeft', 'Close ◀'], ['ArrowRight', 'Open ▶']];
    m.draw = (c, W, H, P) => {
      const hOk = m.h >= HB[0] && m.h <= HB[1], tOk = m.T <= CEIL, isNight = m.t >= m.night;
      txt(c, 'HUMIDITY', 20, 24, { size: 11, col: COL.dim }); bar(c, 20, 30, 250, 12, m.h, { band: HB, col: hOk ? P.good : P.bad }); txt(c, hOk ? 'in band' : 'OUT', 280, 41, { size: 11, col: hOk ? P.good : P.bad });
      txt(c, 'TEMPERATURE', 20, 66, { size: 11, col: COL.dim }); bar(c, 20, 72, 250, 12, m.T, { mark: CEIL, col: tOk ? P.good : P.bad }); txt(c, tOk ? 'under ceiling' : 'OVER', 280, 83, { size: 11, col: tOk ? P.good : P.bad });
      txt(c, 'LOUVRES', 20, 108, { size: 11, col: COL.dim }); bar(c, 20, 114, 250, 10, m.u, { col: COL.peri });
      txt(c, isNight ? 'NIGHT — corridor warm' : m.surge.some(g => m.t > g.a && m.t < g.b) ? 'DAY — loading door open, damp' : 'DAY', 20, 146, { size: 12, col: isNight ? COL.lav : COL.gold });
      bar(c, 230, 140, 150, 8, m.t / D, { mark: m.night / D, col: COL.dim });
      lamp(c, 360, 40, 9, m.bad_t > 0 ? P.bad : P.good, m.bad_t > 0 ? 'triangle' : 'circle'); txt(c, 'shelf', 345, 64, { size: 9, col: COL.dim });
    };
    return m;
  },
});
