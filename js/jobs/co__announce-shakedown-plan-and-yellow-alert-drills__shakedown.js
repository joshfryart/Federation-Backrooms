// Captain: announce shakedown plan and yellow alert drills. Announce the plan and throw the alert switch to yellow (Space). Each department
// lamp should follow within two seconds; any lamp still green after that shows NO ACK and must be chased on the comm (its number). Only when
// every lamp is yellow, set the drill timer to the first drill on the card (↑ ↓) and start it (Enter). Chasing a department that has not
// had its two seconds or has already followed is nagging; starting the drill with a lamp still green, or with the wrong time, is a fault.
import { define, machine, SPACE, DIG, ARROW, ENTER, ri, rf, shuffle, pick, txt, box, lamp, COL } from './kit.js';

const DEPT = ['Engineering', 'Operations', 'Medical', 'Security', 'Science'];
const DRILL = ['Damage control', 'Hull breach', 'Fire suppression', 'Evacuation', 'Boarding repel'];

export default define({
  job: { billet: 'co', label: 'Announce shakedown plan and yellow alert drills', type: 'task:shakedown' },
  title: 'Yellow-alert lamp chase', dept: 'command', host: 'console', tool: 'PA key, alert switch and drill timer',
  how: 'Announce and switch to yellow, chase any department lamp that has not followed after two seconds, then set the drill timer from the plan card and start it.',
  keys: ['Space announce + yellow', '1-5 chase dept', '↑ ↓ timer', 'Enter start drill'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'chase the lamps', input: 'space+digits+arrows+enter', win: 'every department lamp brought to yellow, laggards chased only once overdue, drill timer started at the card time',
    fail: 'nagging a department before it is overdue or after it followed, or starting the drill with a lamp still green or the timer wrong',
    rule: 'Space announces and throws the switch. Watch the five lamps: one still green after two seconds reads NO ACK, press its number. When all show yellow, ↑ ↓ to the card minutes and Enter.' },
  rush: 'Went to yellow alert and started the drill without checking a single lamp.',
  captions: { nagging: 'department head: "already on it"', 'drill on green': 'drill klaxon over a green lamp', 'wrong timer': 'drill timer buzz' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, stuck = new Set(shuffle(r, [0, 1, 2, 3, 4]).slice(0, ri(r, 1, 2))), od = 2.0;
    m.dep = DEPT.map((d, i) => ({ d, lag: rf(r, 0.3, 1.6), stuck: stuck.has(i), ping: -1 }));
    m.plan = shuffle(r, DRILL).slice(0, 3).map(n => ({ n, min: ri(r, 3, 12) })); m.sw = -1; m.min = ri(r, 1, 15); m.rounds = 3; m.round = 0;
    const el = () => m.sw < 0 ? 0 : m.t - m.sw;
    const yellow = (x) => m.sw >= 0 && (x.stuck ? x.ping >= 0 && m.t - x.ping >= 0.3 : el() >= x.lag), noack = (x) => !yellow(x) && el() >= od && x.ping < 0;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code), a = ARROW(code);
      if (SPACE(code)) { if (m.sw < 0) { m.sw = m.t; m.round = 1; m.ev('yellow'); } return true; }
      if (d >= 1 && d <= 5) { const x = m.dep[d - 1]; if (!noack(x)) { m.fault('nagging'); return true; } x.ping = m.t; return true; }
      if (a === 'U' || a === 'D') { m.min = Math.max(1, Math.min(20, m.min + (a === 'U' ? 1 : -1))); return true; }
      if (ENTER(code)) { if (!m.dep.every(yellow)) { m.fault('drill on green'); return true; } if (m.min !== m.plan[0].min) { m.fault('wrong timer'); return true; } m.round = 3; m.win(); return true; }
      return !!d || !!a;
    };
    m.tick = (dt) => { if (m.live(dt) && m.sw >= 0 && m.dep.every(yellow)) m.round = Math.max(m.round, 2); };
    m.hint = () => {
      if (m.sw < 0) return [['Space', true]]; const i = m.dep.findIndex(noack); if (i >= 0) return [['Digit' + (i + 1), true]];
      if (!m.dep.every(yellow)) return []; if (m.min !== m.plan[0].min) return [[m.min < m.plan[0].min ? 'ArrowUp' : 'ArrowDown', true]]; return [['Enter', true]];
    };
    m.bad = () => 'Enter';
    m.view = () => ({ dep: m.dep.map(x => [+x.lag.toFixed(2), x.stuck]), plan: m.plan.map(p => [p.n, p.min]) });
    m.buttons = () => [['Space', 'Announce + yellow'], ...DEPT.map((d, i) => ['Digit' + (i + 1), `${i + 1} ${d.slice(0, 4)}`]), ['ArrowUp', 'Timer ▲'], ['ArrowDown', 'Timer ▼'], ['Enter', 'Start drill']];
    m.draw = (c, W, H, P) => {
      txt(c, 'PLAN CARD', 10, 16, { size: 10, col: COL.gold });
      m.plan.forEach((p, j) => txt(c, `${j + 1}. ${p.n} — ${p.min} min`, 10, 34 + j * 15, { size: 10, col: j ? COL.dim : COL.ink }));
      txt(c, m.sw < 0 ? 'switch: GREEN (Space to announce)' : `switch: YELLOW · ${el().toFixed(1)} s`, 10, 92, { size: 10, col: m.sw < 0 ? COL.dim : COL.warn });
      box(c, 10, 104, 150, 40, 'rgba(255,255,255,.05)', COL.peri, 6); txt(c, 'DRILL TIMER', 18, 118, { size: 9, col: COL.dim }); txt(c, `${m.min} min`, 18, 138, { size: 15 });
      m.dep.forEach((x, i) => {
        const y = 18 + i * 28, yl = yellow(x), na = noack(x);
        lamp(c, 196, y, 9, yl ? COL.warn : P.good, yl ? 'triangle' : 'circle'); txt(c, `${i + 1} ${x.d}`, 212, y + 4, { size: 11 });
        txt(c, yl ? 'yellow' : na ? '▲ NO ACK' : x.ping >= 0 ? 'chased…' : 'green', W - 10, y + 4, { size: 10, col: na ? P.bad : yl ? COL.warn : COL.dim, align: 'right' });
      });
    };
    return m;
  },
});
