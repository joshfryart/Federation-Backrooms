// Navigator: compute the arrival window against the cargo schedule. The red pencil runs along the schedule strip at a steady pace. Mark the
// earliest arrival (Space) as it clears the transit block AND the approach braking block, and the latest arrival (Space) as it reaches the
// first cargo team's ready-by limit. Marking at the end of transit forgets the braking time; letting the pencil run past a mark misses it.
import { define, machine, SPACE, rf, ri, shuffle, txt, box, COL } from './kit.js';

const TEAMS = ['Bay 1 lifters', 'Bay 2 sleds', 'Cold store crew', 'Hazmat handlers', 'Manifest clerks'];
export default define({
  job: { billet: 'nav', label: 'Compute arrival window with the cargo schedule', type: 'task:cargo_run' },
  title: 'Arrival window pencil marks', dept: 'flight', host: 'console', tool: 'Schedule strip and red pencil',
  how: 'As the pencil runs along the strip, press Space where transit plus braking ends (earliest arrival), then again at the first team\'s ready-by limit (latest arrival).',
  keys: ['Space mark earliest, then latest'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'pencil the window', input: 'space', win: 'three arrival windows marked on the moving strip, opening after transit plus braking and closing at the tightest team limit',
    fail: 'marking the earliest arrival before the braking block ends, marking the latest before its limit, or letting the pencil run past a mark',
    rule: 'The pencil sweeps left to right. First Space: just after the end of the braking block. Second Space: just before the earliest ready-by tick among the teams. Each mark has a short tolerance.' },
  rush: 'Wrote down the transit time as the arrival and let ops sort out the teams.',
  captions: { 'no braking margin': 'pencil tap', 'short window': 'pencil tap', missed: 'ops buzzer' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, spd = m.calm ? 0.18 : 0.25, tol = m.calm ? 0.08 : 0.06; m.rounds = 3; m.round = 0;
    m.newStrip = () => {
      const tr = rf(r, 0.2, 0.32), br = rf(r, 0.07, 0.12), E = tr + br, teams = shuffle(r, TEAMS).slice(0, 3).map(name => ({ name, a: rf(r, 0.05, E - 0.04), b: rf(r, E + 0.25, 0.92) }));
      m.s = { tr, br, E, L: Math.min(...teams.map(t => t.b)), teams, x: 0, ph: 0, me: null, ml: null };
    };
    m.newStrip();
    const lo = () => m.s.ph === 0 ? m.s.E : m.s.L - tol, hi = () => m.s.ph === 0 ? m.s.E + tol : m.s.L;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down || !SPACE(code)) return false; const s = m.s;
      if (s.x < lo()) { m.fault(s.ph === 0 ? 'no braking margin' : 'short window'); return true; }
      if (s.ph === 0) { s.me = s.x; s.ph = 1; return true; }
      s.ml = s.x; m.round++; m.ev('window'); if (m.round >= 3) m.win(); else m.newStrip(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const s = m.s; s.x += spd * dt; if (s.x > hi()) { m.fault('missed'); s.x = 0; s.ph = 0; s.me = null; } };
    m.hint = () => { const s = m.s; return s.x > lo() + 0.012 && s.x < hi() - 0.005 ? [['Space', true]] : []; };
    m.bad = () => 'Space';
    m.view = () => ({ E: +m.s.E.toFixed(3), L: +m.s.L.toFixed(3) });
    m.buttons = () => [['Space', 'Mark']];
    m.draw = (c, W, H, P) => {
      const s = m.s, x0 = 20, w = 360, X = (v) => x0 + v * w;
      txt(c, `SCHEDULE ${m.round + 1} / 3 · mark ${s.ph === 0 ? 'EARLIEST arrival' : 'LATEST arrival'}`, x0, 18, { size: 11, col: COL.peri });
      box(c, X(0), 28, s.tr * w, 18, 'rgba(125,151,232,.35)', null, 2); txt(c, 'transit', X(0) + 4, 41, { size: 9 });
      box(c, X(s.tr), 28, s.br * w, 18, 'rgba(240,147,58,.4)', COL.orange, 2); txt(c, 'braking', X(s.tr) + 3, 41, { size: 9 });
      s.teams.forEach((t, i) => { const y = 60 + i * 24; box(c, X(t.a), y, (t.b - t.a) * w, 14, 'rgba(79,208,106,.18)', null, 2); c.fillStyle = P.bad; c.fillRect(X(t.b) - 1, y - 2, 3, 18); txt(c, t.name, X(t.a) + 4, y + 11, { size: 9, col: COL.pale }); });
      for (const v of [s.me, s.ml]) if (v != null) { c.fillStyle = COL.gold; c.fillRect(X(v) - 1, 26, 3, 112); }
      c.fillStyle = '#ff5a48'; c.fillRect(X(s.x) - 1, 24, 2, 120); txt(c, '✎', X(s.x), 156, { size: 12, col: '#ff5a48', align: 'center' });
    };
    return m;
  },
});
