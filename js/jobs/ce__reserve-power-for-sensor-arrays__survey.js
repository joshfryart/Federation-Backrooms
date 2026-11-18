// Chief engineer: reserve power for the sensor arrays (survey). Raise each array's bus slider to the level the bridge approved. The slider
// speeds up the longer the key is held, and every bit of speed sags the bus voltage; it recovers when the slider rests. Ease it up in short
// pushes so the voltage never drops under the dip mark, stop on the approved line and confirm. Overshooting the line eats the life support
// reserve; a sag through the dip mark browns the bus out and the slider drops back.
import { define, machine, ARROW, ENTER, ri, shuffle, clamp, txt, bar, COL } from './kit.js';

export default define({
  job: { billet: 'ce', label: 'Reserve power for sensor arrays', type: 'task:survey' },
  title: 'Sensor bus slider easing', dept: 'engineering', host: 'console', tool: 'Power budget console',
  how: 'Hold Up to raise the sensor bus slider toward the approved line, in short pushes: the longer you hold, the faster it moves and the more the voltage sags. Keep the voltage above the dip mark, stop on the line and press Enter.',
  keys: ['Up / Down hold: move slider', 'Enter confirm level'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'ease the slider', input: 'arrows-hold+enter', win: 'three sensor buses raised onto their approved lines with the bus voltage never sagging through the dip mark',
    fail: 'holding the slider so long the voltage sags through the dip mark (a brownout), or pushing past the approved line into the life support margin',
    rule: 'The slider accelerates while the key is held and the voltage sag grows with its speed, then recovers at rest. Push, let the voltage come back, push again. On the approved line press Enter; more than a few points past it is a fault.' },
  rush: 'Slammed the sensor bus to the approved figure in one go.',
  captions: { brownout: 'lights dim, relay clunk', 'past margin': 'life support reserve alarm', 'off the order': 'bridge: "that is not the approved figure"' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, dip = m.calm ? 0.42 : 0.34, tol = m.calm ? 4.5 : 3;
    m.arrays = shuffle(r, ['Long-range array', 'Lateral array', 'Aft array', 'Navigational deflector']).slice(0, 3).map(n => ({ n, ok: ri(r, 38, 72) }));
    m.k = 0; m.S = 10; m.sag = 0; m.hold = 0; m.dir = 0; m.rounds = 3; m.round = 0; m.base = ri(r, 20, 30);
    const A = () => m.arrays[m.k];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'U' || a === 'D') { const d = a === 'U' ? 1 : -1; if (down) { if (m.dir !== d) m.hold = 0; m.dir = d; } else if (m.dir === d) { m.dir = 0; m.hold = 0; } return true; }
      if (!ENTER(code)) return false; if (!down) return true;
      if (Math.abs(m.S - A().ok) <= tol) { m.k++; m.round = m.k; m.S = 10; m.dir = 0; if (m.k >= 3) m.win(); } else m.fault('off the order');
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return;
      if (m.dir) { m.hold += dt; const v = 12 + 34 * m.hold; m.S = clamp(m.S + m.dir * v * dt, 0, 100); m.sag += v * dt * 0.02; }
      m.sag *= Math.exp(-1.6 * dt);
      if (m.sag > dip) { m.fault('brownout'); m.sag = 0; m.S = Math.max(10, m.S - 15); m.dir = 0; m.hold = 0; }
      else if (m.S > A().ok + tol + 4) { m.fault('past margin'); m.S = A().ok - 12; m.dir = 0; m.hold = 0; }
    };
    m.hint = () => { const a = A(); if (!a) return []; const gap = a.ok - m.S;
      if (Math.abs(gap) <= tol * 0.6) return m.dir ? [['ArrowUp', false], ['ArrowDown', false]] : [['Enter', true]];
      const key = gap > 0 ? 'ArrowUp' : 'ArrowDown', go = m.sag < dip * 0.45 && m.hold < 0.35 && Math.abs(gap) > 1.2;
      if (m.dir && !go) return [[m.dir > 0 ? 'ArrowUp' : 'ArrowDown', false]]; return go ? [[key, true]] : []; };
    m.bad = () => ['ArrowUp', true];
    m.view = () => ({ arrays: m.arrays.map(a => [a.n, a.ok]) });
    m.buttons = () => [['ArrowUp', '▲ raise (hold)'], ['ArrowDown', '▼ lower (hold)'], ['Enter', 'Confirm']];
    m.draw = (c, W, H, P) => { const a = A() || m.arrays[2];
      txt(c, `${a.n}: approved ${a.ok} %`, 14, 20, { size: 13, col: COL.gold }); txt(c, `bus ${m.S.toFixed(0)} %`, W - 14, 20, { size: 13, align: 'right' });
      txt(c, 'SENSOR BUS', 14, 42, { size: 10, col: COL.peri }); bar(c, 14, 48, W - 28, 14, m.S / 100, { band: [(a.ok - tol) / 100, (a.ok + tol) / 100], col: COL.gold });
      txt(c, 'BUS VOLTAGE', 14, 82, { size: 10, col: COL.peri }); const v = 1 - m.sag; bar(c, 14, 88, W - 28, 14, v, { mark: 1 - dip, col: m.sag > dip * 0.7 ? P.bad : P.good });
      txt(c, 'dip mark ▲', 14 + (1 - dip) * (W - 28), 116, { size: 9, align: 'center', col: COL.dim });
      txt(c, 'LIFE SUPPORT RESERVE', 14, 136, { size: 10, col: COL.peri }); bar(c, 14, 142, W - 28, 8, clamp(1 - (m.base + Math.max(0, m.S - a.ok)) / 50), { col: COL.lav });
      txt(c, `${m.k}/3 set`, W - 14, 136, { size: 10, align: 'right', col: COL.dim }); };
    return m;
  },
});
