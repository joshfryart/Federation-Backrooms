// Ops: divert power to sickbay on request. Ease the sickbay slider up (hold ↑) to the requested draw. Every bit of raise sags the bus voltage,
// and the sag only recovers while you pause, so raise in short pushes and let the bus come back between them. Too fast and the voltage falls
// through the alarm line (the breaker sheds sickbay back); past the request and engineering drops below its floor. Hold steady at the request.
import { define, machine, ARROW, ri, rf, txt, bar, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'ops', label: 'Divert power to sickbay on request', type: 'task:medical_relief' },
  title: 'Sickbay power ease-up', dept: 'operations', host: 'console', tool: 'Engineering power console',
  how: 'Hold ↑ to raise sickbay power, but let go whenever the bus voltage sags toward the alarm line and wait for it to recover. Stop at the requested draw (↓ trims back) and hold it steady.',
  keys: ['↑ hold: raise', '↓ hold: lower'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'ease up', input: 'arrows-hold', win: 'each sickbay request reached in short pushes and held steady with the bus voltage never in alarm and engineering above its floor',
    fail: 'raising so fast the bus voltage sags into the alarm, or overshooting the request so engineering falls below its floor',
    rule: 'Raising sags the voltage in proportion to how long you keep pushing; it recovers when you let go. Push, pause, push. Stop inside the request band and keep hands off until the draw reads steady.' },
  rush: 'Slammed the slider to the request and let the breakers argue.',
  captions: { 'bus alarm': 'bus undervoltage alarm', 'engineering starved': 'engineering floor alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, rate = 5, tau = 0.6, k = m.calm ? 3.2 : 4.3, VN = 100, VA = 92, hold = m.calm ? 1.2 : 1.5;
    m.reqs = [0, 1].map(() => ri(r, 9, 14)); m.floor = ri(r, 38, 44); m.base = ri(r, 4, 8); m.avail = m.floor + m.base + m.reqs[0] + m.reqs[1] + ri(r, 2, 5);
    m.k = 0; m.s = m.base; m.T = m.base + m.reqs[0]; m.sag = 0; m.al = 0; m.steady = 0; m.msg = ''; m.rounds = 2; m.round = 0; m.wob = rf(r, 0, 6);
    m.V = () => VN - m.sag;
    m.key = (code, down = true) => { if (m.state !== 'play') return false; const a = ARROW(code); if (a !== 'U' && a !== 'D') return false; m.held[a] = down; return true; };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const dir = (m.held.U ? 1 : 0) - (m.held.D ? 1 : 0);
      if (dir) { m.s += dir * rate * dt; m.sag += Math.abs(dir) * rate * k * dt; m.steady = 0; }
      m.sag -= m.sag / tau * dt; if (m.sag < 0) m.sag = 0;
      if (m.V() < VA) { m.al += dt; if (m.al > 0.25) { m.fault('bus alarm'); m.msg = 'Undervoltage — breaker shed sickbay back'; m.s = Math.max(m.base, m.s - 3); m.sag = 0; m.al = 0; } } else m.al = 0;
      if (m.avail - m.s < m.floor || m.s > m.T + 1.5) { m.fault('engineering starved'); m.msg = 'Past the request — engineering below its floor'; m.s = m.T - 3; m.sag = 0; }
      if (!dir && Math.abs(m.s - m.T) <= 1 && m.V() >= VA) { m.steady += dt; if (m.steady >= hold) { m.msg = `Sickbay steady at ${m.T} MW — logged`; m.k++; m.round++; if (m.k >= 2) m.win(); else { m.base = m.s; m.T = Math.round(m.s) + m.reqs[1]; m.steady = 0; } } }
    };
    m.hint = () => { const go = m.s < m.T - 0.3 && m.V() > VA + 3.5; return [['ArrowUp', go], ['ArrowDown', false]]; };
    m.bad = () => ['ArrowUp', true];
    m.view = () => ({ reqs: m.reqs, avail: m.avail, floor: m.floor, base: m.base });
    m.buttons = () => [['ArrowUp', '▲ raise (hold)'], ['ArrowDown', '▼ lower (hold)']];
    m.draw = (c, W, H, P) => {
      const V = m.V(), alarm = V < VA; txt(c, `SICKBAY REQUEST ${m.k + 1}/2 · ${m.T} MW`, 14, 20, { size: 13, col: COL.gold });
      txt(c, 'sickbay draw', 14, 42, { size: 10, col: COL.dim }); txt(c, `${m.s.toFixed(1)} MW`, W - 14, 42, { size: 13, align: 'right' });
      bar(c, 14, 48, W - 28, 12, m.s / (m.T + 6), { band: [(m.T - 1) / (m.T + 6), (m.T + 1) / (m.T + 6)], col: COL.peri });
      txt(c, 'bus voltage', 14, 80, { size: 10, col: COL.dim }); txt(c, `${(V * 4.4).toFixed(0)} V`, W - 14, 80, { size: 13, align: 'right', col: alarm ? P.bad : COL.ink });
      bar(c, 14, 86, W - 28, 12, (V - 80) / 22, { mark: (VA - 80) / 22, col: alarm ? P.bad : P.good });
      lamp(c, 24, 120, 8, alarm ? P.bad : COL.dim, alarm ? 'triangle' : 'circle'); txt(c, alarm ? 'ALARM' : 'alarm off', 38, 124, { size: 11, col: alarm ? P.bad : COL.dim });
      txt(c, `engineering ${(m.avail - m.s).toFixed(0)} MW (floor ${m.floor})`, 130, 124, { size: 11, col: COL.pale });
      txt(c, m.steady > 0 ? `holding steady ${m.steady.toFixed(1)} / ${hold} s` : m.msg, 14, H - 12, { size: 11, col: COL.pale });
    };
    return m;
  },
});
