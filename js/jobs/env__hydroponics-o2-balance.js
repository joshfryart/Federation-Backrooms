// Environmental tech: hydroponics O2 balance. The tree bank's reclamation needle follows the nutrient flow wheel only slowly: plants take a
// second or more to answer a change. Hold Up/Down to turn the wheel and lead the lag so the needle settles in the band just above the crew
// load marker. Log the reserve (Enter) only once the needle has stopped moving there; logging a falling needle is a false full reserve.
import { define, machine, ARROW, ENTER, rf, clamp, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'env', label: 'Hydroponics O2 balance', type: 'loop' },
  title: 'Tree bank flow lag balance', dept: 'engineering', host: 'console', tool: 'Nutrient flow wheel',
  how: 'Hold Up/Down to turn the nutrient flow wheel. The O2 needle follows slowly: settle it in the band just above the crew load marker, then log (Enter) once it is steady.',
  keys: ['Up / Down hold: flow wheel', 'Enter log the reserve'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'lead the lag', input: 'arrows-hold+enter', win: 'three crew load changes answered with the reclamation needle settled above the load marker and logged steady',
    fail: 'letting the needle sit under the crew load marker, overfeeding the roots, or logging while the needle is still falling',
    rule: 'The needle chases the wheel with a lag of about a second. Ease off before it arrives, keep it inside the band above the load marker, and press Enter only when STEADY shows.' },
  rush: 'Logged the reserve as full from the last shift\'s figure and opened the nutrient taps wide.',
  captions: { 'reserve drop': 'low-O2 chime', 'root burn': 'nutrient alarm', 'false full': 'log rejected' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, k = 0.9, tau = 1.0, grace = m.calm ? 4.6 : 3.6, BW = 0.16;
    m.loads = []; let L = rf(r, 0.3, 0.7); for (let i = 0; i < 3; i++) { let n; do n = rf(r, 0.25, 0.7); while (Math.abs(n - L) < 0.18); m.loads.push(n); L = n; }
    m.F = clamp((m.loads[0] + (r() < 0.5 ? -0.2 : 0.3)) / k, 0.05, 0.98); m.N = m.F * k; m.dN = 0; m.steady = 0; m.low = 0; m.high = 0; m.round = 0; m.rounds = 3; m.cd = 0;
    m.L = () => m.loads[Math.min(m.round, 2)];
    m.inBand = () => m.N >= m.L() && m.N <= m.L() + BW;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'U' || a === 'D') { m.held[a] = down; return true; }
      if (ENTER(code) && down) {
        m.cd = 0.3;
        if (m.inBand() && m.steady >= 0.8) { m.round++; m.steady = 0; m.low = m.high = 0; if (m.round >= 3) m.win(); }
        else m.fault(m.dN < -0.02 ? 'false full' : 'unsteady log');
        return true;
      }
      return !!a;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.cd -= dt;
      m.F = clamp(m.F + ((m.held.U ? 1 : 0) - (m.held.D ? 1 : 0)) * 0.55 * dt, 0, 1);
      const prev = m.N; m.N += (m.F * k - m.N) * Math.min(1, dt / tau); m.dN = (m.N - prev) / dt;
      m.steady = m.inBand() && Math.abs(m.dN) < 0.03 ? m.steady + dt : 0;
      if (m.N < m.L()) { m.low += dt; if (m.low > grace) { m.fault('reserve drop'); m.low = 0; } } else m.low = 0;
      if (m.N > m.L() + BW + 0.04) { m.high += dt; if (m.high > grace) { m.fault('root burn'); m.high = 0; } } else m.high = 0;
    };
    m.hint = () => {
      const want = (m.L() + BW / 2) / k, d = want - m.F, up = d > 0.02, dn = d < -0.02, out = [['ArrowUp', up], ['ArrowDown', dn]];
      if (!up && !dn && m.inBand() && m.steady >= 1.0 && m.cd <= 0) out.push(['Enter', true]); return out;
    };
    m.bad = () => ['ArrowDown', true];
    m.view = () => ({ loads: m.loads.map(x => +x.toFixed(3)) });
    m.buttons = () => [['ArrowUp', 'Flow +'], ['ArrowDown', 'Flow −'], ['Enter', 'Log reserve']];
    m.draw = (c, W, H, P) => {
      const x0 = 30, y0 = 18, h = 130; box(c, x0, y0, 40, h, 'rgba(255,255,255,.07)', null, 4);
      const yL = y0 + h - m.L() * h, yB = y0 + h - (m.L() + BW) * h; c.fillStyle = 'rgba(79,208,106,.22)'; c.fillRect(x0, yB, 40, yL - yB); c.strokeStyle = P.good; c.strokeRect(x0, yB, 40, yL - yB);
      c.fillStyle = P.bad; c.fillRect(x0 - 8, yL - 1, 56, 3); txt(c, 'CREW LOAD', x0 + 50, yL + 4, { size: 10, col: P.bad });
      const yN = y0 + h - clamp(m.N) * h; c.fillStyle = COL.gold; c.beginPath(); c.moveTo(x0 + 40, yN); c.lineTo(x0 + 52, yN - 6); c.lineTo(x0 + 52, yN + 6); c.fill();
      txt(c, `O2 reclamation ${Math.round(m.N * 100)} %`, 170, 34, { size: 14 });
      txt(c, m.dN < -0.02 ? '▼ falling' : m.dN > 0.02 ? '▲ rising' : m.inBand() ? `● STEADY ${m.steady >= 0.8 ? '— log it' : ''}` : '■ off band', 170, 58, { size: 13, col: m.inBand() && Math.abs(m.dN) < 0.03 ? P.good : COL.warn });
      txt(c, 'nutrient flow wheel', 170, 92, { size: 11, col: COL.dim }); bar(c, 170, 100, 200, 10, m.F, { col: COL.peri });
      txt(c, `reserve logs ${m.round} / 3`, 170, 140, { size: 11, col: COL.pale });
    };
    return m;
  },
});
