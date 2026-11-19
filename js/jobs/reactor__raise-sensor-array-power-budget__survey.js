// Reactor specialist: raise the sensor array power budget. Each step up on the sensor slider costs more headroom than the last, and the
// headroom readout takes a moment to catch up. Probe upward one step at a time; when the settled headroom dips under the margin line, back off
// one step and commit (Enter). Committing under the margin browns the sensors out; committing while another step would still have fitted
// short-changes the scan; lingering under the margin too long browns them out anyway. Two arrays to budget.
import { define, machine, ARROW, ENTER, rf, txt, bar, box, COL } from './kit.js';

export default define({
  job: { billet: 'reactor', label: 'Raise sensor array power budget', type: 'task:survey' },
  title: 'Sensor budget probe-and-back-off', dept: 'engineering', host: 'console', tool: 'Power budget panel',
  how: 'Raise the sensor budget a step at a time (Up) and let the headroom readout settle. When it settles under the margin line, step back (Down) and commit with Enter.',
  keys: ['Up raise a step', 'Down back off a step', 'Enter commit the budget'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'probe-and-back-off', input: 'arrows+enter', win: 'each array budget committed at the highest step whose settled headroom stays above the margin line',
    fail: 'committing a budget under the margin, committing a step short of the real limit, or idling under the margin until the sensors brown out',
    rule: 'Step costs grow and are hidden; only the lagging headroom readout tells you. Step up until it settles below the line, step back once, Enter. Do not sit under the line for more than about two seconds.' },
  rush: 'Pushed the sensor slider to the top and let the breakers decide.',
  captions: { brownout: 'sensor hum sags', 'short budget': 'science query chime' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, under = m.calm ? 3 : 2;
    const mk = (name) => { const cost = []; let c = rf(r, 2.5, 4); for (let k = 0; k < 14; k++) { cost.push(+c.toFixed(1)); c *= rf(r, 1.12, 1.3); } return { name, H0: rf(r, 48, 62), cost, margin: rf(r, 14, 22) }; };
    m.arr = [mk('Long-range array'), mk('Lateral array')]; m.round = 1; m.rounds = 2; m.b = 0; m.uT = 0;
    const A = () => m.arr[m.round - 1], H = (b) => { const a = A(); let h = a.H0; for (let k = 0; k < b; k++) h -= a.cost[k]; return h; };
    const best = () => { let b = 0; while (b < 14 && H(b + 1) >= A().margin) b++; return b; };
    m.disp = H(0);
    const settled = () => Math.abs(m.disp - H(m.b)) < 0.4;
    m.key = (code, down = true) => {
      const a = ARROW(code), e = ENTER(code); if (m.state !== 'play' || (!e && a !== 'U' && a !== 'D')) return false; if (!down) return true;
      if (a === 'U') m.b = Math.min(14, m.b + 1); else if (a === 'D') m.b = Math.max(0, m.b - 1);
      else { if (H(m.b) < A().margin) { m.fault('brownout'); return true; } if (m.b < best()) { m.fault('short budget'); return true; }
        m.ev('commit', { b: m.b }); if (m.round >= 2) { m.win(); return true; } m.round++; m.b = 0; m.disp = H(0); m.uT = 0; }
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.disp += (H(m.b) - m.disp) * Math.min(1, dt * (m.calm ? 4 : 5));
      if (H(m.b) < A().margin) { m.uT += dt; if (m.uT > under) { m.fault('brownout'); m.uT = 0; } } else m.uT = 0;
    };
    m.hint = () => { if (!settled()) return []; const h = H(m.b), mg = A().margin; if (h < mg) return [['ArrowDown', true]]; if (m.b < best()) return [['ArrowUp', true]]; return [['Enter', true]]; };
    m.bad = () => 'ArrowUp';
    m.view = () => ({ arr: m.arr.map(a => [+a.H0.toFixed(1), a.cost[0], +a.margin.toFixed(1)]) });
    m.buttons = () => [['ArrowUp', 'Step up'], ['ArrowDown', 'Back off'], ['Enter', 'Commit']];
    m.draw = (c, W, H2, P) => {
      const a = A(), mg = a.margin, low = m.disp < mg; txt(c, `${a.name}   (${m.round} / 2)`, 20, 20, { size: 12, col: COL.gold });
      for (let k = 0; k < 14; k++) box(c, 20 + k * 13, 34, 10, 18, k < m.b ? COL.peri : 'rgba(255,255,255,.08)', null, 2);
      txt(c, `sensor budget step ${m.b}`, 20, 70, { size: 12, col: COL.ink });
      txt(c, 'HEADROOM', 230, 34, { size: 10, col: COL.dim }); txt(c, `${m.disp.toFixed(1)} MW`, 230, 60, { size: 24, col: low ? COL.warn : COL.ink });
      txt(c, low ? '▼ UNDER MARGIN' : settled() ? '● settled' : '… reading', 230, 80, { size: 11, col: low ? P.bad : settled() ? P.good : COL.dim });
      bar(c, 20, 100, 360, 12, m.disp / 70, { col: low ? COL.warn : COL.gold, mark: mg / 70 }); txt(c, `margin ${mg.toFixed(1)} MW`, 20, 128, { size: 10, col: COL.pale });
      if (m.uT > 0) { txt(c, 'browning out', 230, 128, { size: 10, col: P.bad }); bar(c, 300, 121, 80, 7, m.uT / under, { col: P.bad }); }
    };
    return m;
  },
});
