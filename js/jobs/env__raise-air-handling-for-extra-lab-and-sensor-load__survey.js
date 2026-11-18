// Environmental tech: raise air handling for the extra lab and sensor load (survey). Each notch up on the air handler dial (Up) jumps the lab
// pressure and makes it ring for a moment before it settles. Notch again while it is still ringing and the swings stack until they pull the door
// seal. Step, let it settle, step again, until the slow-falling CO2 reaches its band; then ask the lab crew (Enter). Down backs a notch off.
import { define, machine, ARROW, ENTER, ri, rf, clamp, txt, bar, COL } from './kit.js';

export default define({
  job: { billet: 'env', label: 'Raise air handling for extra lab and sensor load', type: 'task:survey' },
  title: 'Air handler notch and settle', dept: 'engineering', host: 'console', tool: 'Lab air handler dial',
  how: 'Press Up for one notch on the air handler, then wait for the pressure swing to settle before the next notch. Once the CO2 has come down into its band, ask the lab crew (Enter).',
  keys: ['Up one notch', 'Down back a notch off', 'Enter ask the lab crew'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'step and settle', input: 'arrows+enter', win: 'lab airflow raised notch by notch until CO2 is in band with the pressure settled under the door seal mark',
    fail: 'notching up while the pressure is still ringing so the stacked swing pulls the door seal, or signing off while the lab air is still stale',
    rule: 'Each notch makes the pressure needle swing; the SETTLING lamp stays on until it calms. Only notch again once it reads SETTLED. Stop when the CO2 sits in its band and press Enter.' },
  rush: 'Wound the air handler up to full and let the lab door hiss.',
  captions: { 'seal pulled': 'door seal pops', 'stale air': 'lab crew coughs' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, need = ri(r, 3, 5), dP = 0.045, ring = 0.05, tau = m.calm ? 0.45 : 0.55;
    const base = rf(r, 0.25, 0.35), c0 = rf(r, 0.75, 0.85), dC = 0.07;
    m.P = (s) => base + s * dP; m.C = (s) => c0 - s * dC; m.seal = m.P(need) + (m.calm ? 0.075 : 0.065); m.cMax = m.C(need) + 0.03;
    m.s = 0; m.A = 0; m.co2 = m.C(0); m.cd = 0; m.need = need;
    m.settled = () => m.A < 0.012; m.co2ok = () => m.co2 <= m.cMax;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code); m.cd = 0.2;
      if (a === 'U') { m.s = Math.min(10, m.s + 1); m.A = m.A * 1.0 + ring; return true; }
      if (a === 'D') { m.s = Math.max(0, m.s - 1); m.A = Math.max(m.A, ring * 0.5); return true; }
      if (ENTER(code)) { if (m.co2ok() && m.settled() && m.P(m.s) + 0.01 < m.seal) m.win(); else m.fault('stale air'); return true; }
      return !!a;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.cd -= dt; m.A *= Math.exp(-dt / tau); m.co2 += (m.C(m.s) - m.co2) * Math.min(1, dt / 1.2);
      if (m.P(m.s) + m.A > m.seal) { m.fault('seal pulled'); m.s = Math.max(0, m.s - 1); m.A = 0; }
    };
    m.hint = () => { if (m.cd > 0 || !m.settled()) return []; if (m.s < need) return [['ArrowUp', true]]; if (m.s > need) return [['ArrowDown', true]]; return m.co2ok() ? [['Enter', true]] : []; };
    m.bad = () => m.cd > 0 ? null : 'ArrowUp';
    m.view = () => ({ need, base: +base.toFixed(3), c0: +c0.toFixed(3) });
    m.buttons = () => [['ArrowUp', 'Notch up'], ['ArrowDown', 'Notch down'], ['Enter', 'Ask lab crew']];
    m.draw = (c, W, H, P) => {
      const p = m.P(m.s) + m.A * Math.abs(Math.sin(m.t * 11));
      txt(c, 'LAB PRESSURE', 20, 26, { size: 11, col: COL.dim }); bar(c, 20, 34, 360, 14, p, { band: [m.P(need) - 0.02, m.seal], mark: m.seal, col: COL.peri });
      txt(c, 'door seal', 20 + m.seal * 360 - 20, 64, { size: 9, col: P.bad });
      txt(c, m.settled() ? '● SETTLED' : '▲ SETTLING', 20, 84, { size: 14, col: m.settled() ? P.good : COL.warn });
      txt(c, `dial notch ${m.s}`, 160, 84, { size: 14, col: COL.gold });
      txt(c, 'LAB CO2', 20, 112, { size: 11, col: COL.dim }); bar(c, 20, 120, 360, 12, m.co2, { band: [0.05, m.cMax], col: m.co2ok() ? P.good : COL.warn });
      txt(c, m.co2ok() ? 'CO2 in band — ask the lab crew' : 'CO2 high: air is stale', 20, 154, { size: 12, col: m.co2ok() ? P.good : COL.pale });
    };
    return m;
  },
});
