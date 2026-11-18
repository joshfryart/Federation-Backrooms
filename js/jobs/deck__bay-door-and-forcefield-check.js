// Deck crew: bay door and forcefield check. Hold the test switch (Space) to run the door through a full open-close cycle while the seal
// pressure trace draws. The field light stays green every time; what matters is whether the needle held. After each cycle judge it: Up for
// HOLDS, Down for LEAKS. Passing a leaking seal (a bay that holds pressure only on paper) or condemning a sound one is a fault.
import { define, machine, SPACE, ARROW, rf, shuffle, txt, box, bar, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'deck', label: 'Bay door and forcefield check', type: 'loop' },
  title: 'Bay door seal-trace verdict', dept: 'flight', host: 'console', tool: 'Bay door test switch and seal gauge',
  how: 'Hold Space to cycle the door; the seal-pressure trace draws as it runs. Ignore the green field light: when the cycle ends, press Up if the needle held, Down if it sagged.',
  keys: ['Space hold: cycle the door', 'Up: seal HOLDS', 'Down: seal LEAKS'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'cycle and judge', input: 'space-hold+arrows', win: 'four door cycles run to the end and each seal correctly judged holding or leaking from its pressure trace',
    fail: 'passing a seal whose needle sagged through the cycle because the field lamp looked fine, or condemning a seal that held',
    rule: 'Holding Space drives the door; letting go mid-travel stalls it. Once the cycle completes, read the trace: a dip of more than 2 kPa below the start line is a leak (Down), a wobble inside the band is sound (Up).' },
  rush: 'Saw the green field lamp and signed the door off.',
  captions: { 'passed a leak': 'pressure alarm chirps', 'false condemn': 'console buzz', 'stalled': 'door grinds' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, cyc = m.calm ? 2.0 : 2.6;
    const leaks = shuffle(r, [true, true, false, false, r() < 0.5]).slice(0, 4);
    m.doors = leaks.map(l => ({ leak: l, dip: l ? rf(r, 2.6, 4.2) : rf(r, 0.4, 1.3), at: rf(r, 0.3, 0.7), ph: rf(r, 0, 6), p: 0, trace: [] }));
    m.k = 0; m.rounds = 4; m.round = 1; m.stall = 0;
    const d = () => m.doors[m.k];
    m.kpa = (x) => { const D = d(); const w = D.leak ? Math.exp(-((x - D.at) ** 2) / 0.03) : Math.sin(x * 9 + D.ph) * 0.5 + 0.5; return 101.3 - D.dip * w + 0.15 * Math.sin(x * 31 + D.ph); };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (SPACE(code)) { m.held.S = down; return true; }
      if (!down || (a !== 'U' && a !== 'D')) return a ? true : false; const D = d(); if (D.p < 1) return true;
      const say = a === 'D'; if (say !== D.leak) m.fault(D.leak ? 'passed a leak' : 'false condemn');
      m.ev('verdict', { door: m.k, leak: say }); m.k++; m.round = Math.min(4, m.k + 1); if (m.k >= 4 && m.state === 'play') m.win(); return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const D = d(); if (!D) return;
      if (m.held.S && D.p < 1) { D.p = Math.min(1, D.p + dt / cyc); D.trace.push(m.kpa(D.p)); m.stall = 0; }
      else if (D.p > 0 && D.p < 1) { m.stall += dt; if (m.stall > 1.5) { m.fault('stalled'); m.stall = 0; D.p = 0; D.trace = []; } }
    };
    m.hint = () => { const D = d(); if (!D) return []; if (D.p < 1) return [['Space', true]]; return [['Space', false], [D.leak ? 'ArrowDown' : 'ArrowUp', true]]; };
    m.bad = () => { const D = d(); if (!D) return null; if (D.p < 1) return ['Space', true]; return D.leak ? 'ArrowUp' : 'ArrowDown'; };
    m.view = () => ({ doors: m.doors.map(D => [D.leak, +D.dip.toFixed(2)]) });
    m.buttons = () => [['Space', 'Cycle (hold)'], ['ArrowUp', 'HOLDS'], ['ArrowDown', 'LEAKS']];
    m.draw = (c, W, H, P) => {
      const D = d(); if (!D) return; txt(c, `Door cycle ${m.k + 1} / 4`, 16, 22, { size: 13, col: COL.gold });
      lamp(c, 360, 18, 9, P.good, 'circle'); txt(c, 'FIELD', 330, 40, { size: 10, col: COL.dim });
      box(c, 16, 34, 290, 100, 'rgba(255,255,255,.04)', COL.peri, 4);
      const y = (k) => 84 - (k - 101.3) * 12; c.fillStyle = 'rgba(79,208,106,.18)'; c.fillRect(16, y(101.3 + 0.2), 290, y(101.3 - 2) - y(101.3 + 0.2));
      c.strokeStyle = COL.dim; c.setLineDash?.([4, 4]); c.beginPath(); c.moveTo(16, y(101.3 - 2)); c.lineTo(306, y(101.3 - 2)); c.stroke(); c.setLineDash?.([]);
      txt(c, '−2 kPa', 270, y(101.3 - 2) + 12, { size: 9, col: COL.dim });
      c.strokeStyle = COL.gold; c.lineWidth = 2; c.beginPath(); D.trace.forEach((v, j) => { const x = 16 + 290 * j / Math.max(1, D.trace.length - 1) * D.p; j ? c.lineTo(x, y(v)) : c.moveTo(x, y(v)); }); c.stroke();
      bar(c, 16, 142, 290, 8, D.p, { col: COL.peri });
      txt(c, D.p < 1 ? (m.held.S ? 'door travelling…' : 'hold Space to cycle') : 'judge: Up HOLDS / Down LEAKS', 16, 164, { size: 11, col: D.p < 1 ? COL.dim : COL.warn });
      const lo = D.trace.length ? Math.min(...D.trace) : 101.3; txt(c, `low ${lo.toFixed(1)}`, 320, 80, { size: 12, col: lo < 99.3 ? P.bad : COL.ink });
    };
    return m;
  },
});
