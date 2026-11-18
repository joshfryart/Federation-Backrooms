// Helm: hold station and steady the drift on the quiet watch. Grip the helm thruster stick (hold E) and lean it by turning your view a
// little left or right; the mark on the display slides with the current and drifts back under your push. Small leans only: pushing the stick
// hard over (a big turn of the view) rocks the hull. The hold meter fills while the mark sits in the box; if it leaves the box the meter
// empties. Fill it and the bridge order lamp changes.
import { define, machine, room, rf, pick, clamp } from './kit.js';

export default define({
  job: { billet: 'helm', label: 'Hold station and steady drift', type: 'task:quiet_watch' },
  title: 'Thruster stick lean against the current', dept: 'flight', host: 'room', siteName: 'Stick', verb: 'Hold',
  how: 'Hold E to grip the thruster stick and turn your view slightly left or right to lean it against the drift. Keep the mark in the box until the hold meter fills; never push the stick hard over.',
  keys: ['E hold: grip the stick', 'look a little left / right: lean'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'lean the stick', input: 'e-hold+look', win: 'the station mark kept inside its box against current and gusts until the hold meter fills',
    fail: 'letting the mark slide out of the box, or shoving the stick to full deflection so the hull rocks',
    rule: 'While E is held, the view angle is the stick angle: a slight look left pushes the mark left, right pushes it right. Past about a third of a turn is hard over and a fault.' },
  rush: 'Gave the stick a full shove every time the mark wandered.',
  captions: { 'hard over': 'hull groans', 'left the box': 'station alarm pips' },
  says: { 'hard over': 'Full deflection: the hull is rocking. Small leans only.', 'left the box': 'The mark left the box and the hold reset. Lean against the drift earlier.' },
  create(seed, opts) {
    const m = room(machine(this, seed, opts), [{ name: 'Helm thruster stick', prop: 'helm' }]), r = m.rnd, k = m.calm ? 0.75 : 1;
    m.drift = pick(r, [-1, 1]) * rf(r, 0.12, 0.2) * k; m.gusts = Array.from({ length: 12 }, (_, j) => [j * 1.7 + rf(r, 0.5, 1.4), pick(r, [-1, 1]) * rf(r, 0.06, 0.12) * k]);
    m.x = 0; m.v = 0; m.hold = 0; m.need = 7; m.hard = 0; m.gi = 0; m.st = 0;
    m.step = (dt, inp = {}) => {
      if (!m.live(dt, inp.away)) return; const s = m.cur(inp); if (!s) return; m.st += dt;
      const look = inp.hold ? clamp(inp.look || 0, -0.8, 0.8) : 0;
      while (m.gi < m.gusts.length && m.st >= m.gusts[m.gi][0]) { m.v += m.gusts[m.gi][1]; m.gi++; }
      m.v += (m.drift - 1.2 * look - 0.9 * m.v) * dt; m.x = clamp(m.x + m.v * dt, -0.5, 0.5);
      if (Math.abs(look) > 0.42) { m.hard += dt; if (m.hard > 0.25) { m.hard = -0.6; m.fault('hard over'); } } else if (m.hard > 0) m.hard = 0; else m.hard = Math.min(0, m.hard + dt);
      if (Math.abs(m.x) > 0.3) { m.fault('left the box'); m.x = 0; m.v = 0; m.hold = 0; } else m.hold += dt;
      s.prog = clamp(m.hold / m.need) * 0.95; if (m.hold >= m.need) m.finish(0);
    };
    m.hint = () => (m.next < 0 ? { at: -1 } : { at: 0, hold: true, look: clamp(3 * m.x + 1.5 * m.v, -0.35, 0.35) });
    m.bad = (f = 0) => ({ at: 0, hold: true, look: f % 40 < 20 ? 0.6 : -0.6 });
    m.view = () => ({ drift: +m.drift.toFixed(3), g: m.gusts.slice(0, 4).map(g => +g[1].toFixed(3)) });
    m.panel = () => ({ label: `Mark ${m.x < 0 ? '◀' : '▶'} ${Math.abs(m.x * 100).toFixed(0)} m · hold ${Math.round(clamp(m.hold / m.need) * 100)} %`, value: Math.abs(m.x) > 0.22 ? 'near edge' : 'in box', bar: m.x + 0.5, band: [0.2, 0.8] });
    m.prompt = () => (Math.abs(m.x) > 0.15 ? `Hold [E] and lean the stick ${m.x > 0 ? 'left' : 'right'} a little` : 'Hold [E] on the stick; small leans against the drift');
    return m;
  },
});
