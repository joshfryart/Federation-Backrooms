// Environmental tech: full life support and coolant sweep (quiet watch). Walk the junction loop stop by stop with the sweep tablet. Each stop
// adds a CO2 figure and an exchanger temperature to the tablet's columns. When a column has gone up at three stops running (since you last
// reported it), report that creep to the ACE (1 = CO2, 2 = exchanger) before walking on (Enter). A single rise, or a rise then a dip, is noise.
import { define, machine, DIG, ENTER, txt, box, COL } from './kit.js';

const creepAt = (v, n, since) => n - 2 > since && v[n - 2] < v[n - 1] && v[n - 1] < v[n];
export default define({
  job: { billet: 'env', label: 'Full life support and coolant sweep', type: 'task:quiet_watch' },
  title: 'Three-stop creep on the sweep tablet', dept: 'engineering', host: 'console', tool: 'Junction sweep tablet',
  how: 'At each stop read the new CO2 and exchanger figures. If a column has risen at three stops in a row, report it (1 CO2, 2 exchanger) to the ACE, then walk on with Enter.',
  keys: ['1 report CO2 creep', '2 report exchanger creep', 'Enter walk to the next stop'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'flag the creep', input: 'digits+enter', win: 'the whole junction loop walked with every three-stop rise in CO2 or exchanger temperature reported at the stop it appeared',
    fail: 'walking on past a column that has risen three stops running, reporting noise as a creep, or stalling at a stop',
    rule: 'A creep is three readings in a row each higher than the last, counted from after your last report on that column. Press 1 or 2 at that stop, then Enter.' },
  rush: 'Glanced at the first air sensor, ticked the whole loop and handed the tablet back.',
  captions: { 'creep missed': 'ACE comm buzz', 'false report': 'ACE sighs', stalled: 'tablet timeout tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, NS = 9, dwell = m.calm ? 6.5 : 5;
    const gen = () => { const a = [0]; for (let i = 1; i < NS; i++) a.push(a[i - 1] + (r() < 0.58 ? 1 + Math.floor(r() * 2) : -1 - Math.floor(r() * 2))); return a; };
    const count = (v) => { let s = -1, c = 0; for (let n = 0; n < NS; n++) if (creepAt(v, n, s)) { c++; s = n; } return c; };
    let tries = 0; do { m.co2 = gen(); m.ex = gen(); tries++; } while ((count(m.co2) + count(m.ex) < 2 || count(m.co2) + count(m.ex) > 4) && tries < 60);
    m.stop = 0; m.since = [-1, -1]; m.rep = [false, false]; m.wait = 0; m.cd = 0; m.rounds = NS; m.round = 1;
    const cols = () => [m.co2, m.ex];
    m.creep = (c) => creepAt(cols()[c], m.stop, m.since[c]);
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code);
      if (d === 1 || d === 2) { const c = d - 1; m.cd = 0.25; if (m.rep[c]) return true; if (m.creep(c)) { m.rep[c] = true; m.since[c] = m.stop; } else m.fault('false report'); return true; }
      if (ENTER(code)) {
        m.cd = 0.25; for (const c of [0, 1]) if (m.creep(c) && !m.rep[c]) { m.fault('creep missed'); m.since[c] = m.stop; }
        m.stop++; m.rep = [false, false]; m.wait = 0; m.round = Math.min(NS, m.stop + 1); if (m.stop >= NS && m.state === 'play') m.win(); return true;
      }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.cd -= dt; m.wait += dt; if (m.wait > dwell) { m.fault('stalled'); m.wait = 0; } };
    m.hint = () => { if (m.cd > 0 || m.wait < 0.5) return []; for (const c of [0, 1]) if (m.creep(c) && !m.rep[c]) return [[`Digit${c + 1}`, true]]; return [['Enter', true]]; };
    m.bad = () => { if (m.cd > 0) return null; for (const c of [0, 1]) if (!m.creep(c) && !m.rep[c]) return `Digit${c + 1}`; return 'Enter'; };
    m.view = () => ({ co2: m.co2, ex: m.ex });
    m.buttons = () => [['Digit1', '1 CO2 creep'], ['Digit2', '2 Exch creep'], ['Enter', 'Walk on']];
    m.draw = (c, W, H, P) => {
      txt(c, 'STOP', 16, 22, { size: 10, col: COL.dim }); txt(c, 'CO2 %', 16, 62, { size: 10, col: COL.dim }); txt(c, 'EXCH °C', 16, 102, { size: 10, col: COL.dim });
      for (let n = 0; n <= Math.min(m.stop, NS - 1); n++) {
        const x = 66 + n * 36, here = n === m.stop; if (here) box(c, x - 4, 8, 34, 112, 'rgba(244,194,91,.12)', COL.gold, 4);
        txt(c, String(n + 1), x + 10, 22, { size: 11, col: here ? COL.gold : COL.dim });
        [[m.co2, 62, (v) => (0.32 + v * 0.03).toFixed(2), 0], [m.ex, 102, (v) => (41 + v * 1.4).toFixed(0), 1]].forEach(([v, y, f, ci]) => {
          const up = n > 0 && v[n] > v[n - 1]; txt(c, f(v[n]), x, y, { size: 11, col: up ? COL.warn : COL.ink }); txt(c, n > 0 ? (up ? '▲' : '▼') : '', x + 8, y + 14, { size: 9, col: up ? COL.warn : COL.dim });
          if (m.since[ci] === n) txt(c, '⚑', x + 22, y - 10, { size: 10, col: P.bad });
        });
      }
      txt(c, `stop ${Math.min(NS, m.stop + 1)} of ${NS}${m.rep[0] ? ' · CO2 reported' : ''}${m.rep[1] ? ' · exchanger reported' : ''}`, 16, 146, { size: 11, col: COL.pale });
      txt(c, 'three rises in a row = creep', 16, 162, { size: 10, col: COL.dim });
    };
    return m;
  },
});
