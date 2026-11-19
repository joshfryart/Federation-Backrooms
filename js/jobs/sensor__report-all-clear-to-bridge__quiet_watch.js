// Sensor officer: report all-clear to the bridge (quiet watch). The sweep log shows how far the last clear sweep reached in each of eight
// sectors; one corner often came up short. Set the range you will state (↑ / ↓) to the reach the WHOLE sweep covers: the shortest sector,
// within two thousand km under it. Then hold Space on the bridge comm to give the all-clear and keep holding until the officer of the watch
// acknowledges. Overstating the reach, underselling it badly, or letting go of the comm before the acknowledgement are faults.
import { define, machine, ARROW, SPACE, ri, rf, txt, box, bar, lamp, COL } from './kit.js';

const OFFICERS = ['Lt Vance', 'Lt Cmdr Osei', 'Ens Marchetti', 'Lt Ruiz', 'Lt Kowal', 'Cmdr Adeyemi'];
export default define({
  job: { billet: 'sensor', label: 'Report all-clear to bridge', type: 'task:quiet_watch' },
  title: 'All-clear stated to the shortest sector', dept: 'sciences', host: 'console', tool: 'Bridge sensor console',
  how: 'Wind the stated range (↑ / ↓) down to the shortest sector the sweep actually covered, then hold Space on the comm to give the all-clear until the bridge acknowledges.',
  keys: ['↑ / ↓ stated range', 'Space hold: give the all-clear'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'state the reach', input: 'arrows+space-hold', win: 'three all-clears given with a stated range no further than the shortest swept sector, comm held open until each acknowledgement',
    fail: 'claiming a range that leaves a sector unscanned, quoting far less than the sweep covered, or stepping off the comm before the bridge acknowledges',
    rule: 'Find the shortest bar in the sector chart. Step the stated range to it (up to 2 under is fine). Hold Space to transmit and keep holding until ACK lights, then let go.' },
  rush: 'Called all-clear at the array’s rated range and walked off before anyone answered.',
  captions: { overstated: 'bridge acknowledges a blind corner', undersold: 'bridge queries the short range', 'stepped away': 'comm cuts off mid-report' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, N = 3;
    m.logs = Array.from({ length: N }, () => { const base = ri(r, 30, 42), sec = Array.from({ length: 8 }, () => base + ri(r, 0, 6)); if (r() < 0.8) sec[ri(r, 0, 7)] = base - ri(r, 6, 14);
      return { sec, min: Math.min(...sec), ack: rf(r, 0.8, 1.5) * (m.calm ? 0.8 : 1), who: OFFICERS[ri(r, 0, OFFICERS.length - 1)], time: `${String(ri(r, 0, 23)).padStart(2, '0')}${String(ri(r, 0, 59)).padStart(2, '0')}` }; });
    m.k = 0; m.said = 48; m.sp = false; m.tx = 0; m.acked = false; m.round = 1; m.rounds = N; m.cool = 0;
    const L = () => m.logs[m.k];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'U' || a === 'D') { if (down && !m.sp) m.said = Math.max(5, Math.min(60, m.said + (a === 'U' ? 1 : -1))); return true; }
      if (!SPACE(code)) return !!a;
      if (down && !m.sp) { m.sp = true; m.tx = 0; m.acked = false; if (m.said > L().min) { m.fault('overstated'); m.sp = false; m.cool = 0.4; } else if (m.said < L().min - 2) { m.fault('undersold'); m.sp = false; m.cool = 0.4; } }
      else if (!down && m.sp) { m.sp = false; if (!m.acked) m.fault('stepped away'); else { m.k++; m.said = 48; if (m.k >= N) m.win(); else m.round++; } }
      return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.cool = Math.max(0, m.cool - dt); if (m.sp) { m.tx += dt; if (m.tx >= L().ack) m.acked = true; } };
    m.hint = () => { const l = L(); if (!l) return []; if (m.sp) return m.acked ? [['Space', false]] : [];
      if (m.said > l.min) return [['ArrowDown', true]]; if (m.said < l.min - 1) return [['ArrowUp', true]]; return m.cool > 0 ? [] : [['Space', true]]; };
    m.bad = () => ['Space', !m.sp];
    m.view = () => ({ l: m.logs.map(l => l.sec) });
    m.buttons = () => [['ArrowUp', 'Range ↑'], ['ArrowDown', 'Range ↓'], ['Space', 'Hold: all-clear']];
    m.draw = (c, W, H, P) => {
      const l = L(); if (!l) return; txt(c, `SWEEP LOG ${l.time}  ·  report ${m.k + 1}/${N}`, 14, 18, { size: 11, col: COL.gold });
      box(c, 14, 26, 200, 120, 'rgba(255,255,255,.04)', null, 4); const sx = 200 / 60;
      l.sec.forEach((v, i) => { const y = 32 + i * 14; bar(c, 34, y, 170, 9, v / 60, { col: v === l.min ? COL.warn : COL.peri }); txt(c, `S${i + 1}`, 16, y + 8, { size: 9, col: COL.dim }); });
      const x = 34 + Math.min(1, m.said / 60) * 170; c.fillStyle = m.said > l.min ? P.bad : P.good; c.fillRect(x - 1, 28, 3, 116);
      txt(c, 'STATED RANGE', 232, 30, { size: 10, col: COL.dim }); txt(c, `${m.said} 000 km`, 232, 52, { size: 18, col: m.said > l.min ? COL.warn : COL.ink });
      txt(c, m.said > l.min ? 'beyond a sector!' : 'covered by every sector', 232, 68, { size: 10, col: m.said > l.min ? COL.warn : COL.dim });
      txt(c, 'BRIDGE COMM', 232, 92, { size: 10, col: COL.dim }); bar(c, 232, 98, 150, 10, m.sp ? Math.min(1, m.tx / l.ack) : 0, { col: COL.gold });
      lamp(c, 244, 128, 9, m.acked ? P.good : COL.panel, m.acked ? 'circle' : 'square'); txt(c, m.acked ? `ACK ${l.who} — let go` : m.sp ? 'transmitting… hold' : 'hold Space to report', 258, 132, { size: 10, col: m.acked ? COL.ink : COL.dim });
    };
    return m;
  },
});
