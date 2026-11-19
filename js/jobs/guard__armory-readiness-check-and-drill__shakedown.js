// Guard: armory readiness check and drill. When the drill starts, officers step up to the rack one per drill beat. The rack cursor moves along
// the slots. On each beat, look at the slot under the cursor: a sidearm with a green charger lamp is handed out (Space, on the beat); an amber
// lamp (dead) or an empty cradle is called out as a readiness gap (Enter, on the beat). Pressing off the beat fumbles the hand-off; a beat with
// no answer keeps an officer waiting; handing out a dead one or calling a good one a gap are faults.
import { define, machine, SPACE, ENTER, ri, rf, shuffle, txt, box, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'guard', label: 'Armory readiness check and drill', type: 'task:shakedown' },
  title: 'Drill-beat sidearm issue', dept: 'security', host: 'console', tool: 'Sidearm rack and drill timer',
  how: 'An officer steps up on every drill beat. On the beat, hand out the sidearm under the cursor (Space) if its lamp is green, or call the gap (Enter) if the lamp is amber or the cradle is empty.',
  keys: ['Space issue on the beat', 'Enter call a gap on the beat'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'beat-time issue', input: 'rhythm+space+enter',
    win: 'every rack slot answered on its drill beat: green sidearms issued and each dead or empty cradle called as a gap before the drill clock stops',
    fail: 'fumbling off the beat, leaving an officer waiting through a beat, issuing a dead sidearm or calling a charged one a gap',
    rule: 'The ring pulses on each beat and the cursor shows the slot. Green lamp: Space as the ring closes. Amber or empty: Enter as the ring closes.' },
  rush: 'Counted the rack by eye and started the drill one weapon short.',
  captions: { fumble: 'sidearm clatters', waiting: 'drill whistle', 'dead issued': 'dry trigger click', 'false gap': 'controller frowns' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, N = 7, P_ = m.calm ? 1.25 : 0.95, win = m.calm ? 0.24 : 0.18, t0 = 1.4;
    const gaps = shuffle(r, [0, 1, 2, 3, 4, 5, 6]).slice(0, ri(r, 2, 3));
    m.slots = Array.from({ length: N }, (_, k) => (gaps.includes(k) ? (r() < 0.5 ? 'empty' : 'dead') : 'good'));
    m.serials = m.slots.map(() => ri(r, 100, 999)); m.jit = rf(r, 0, 0.2);
    m.k = 0; m.ans = false; m.held = {}; m.rounds = N; m.round = 0; m.log = [];
    m.beatT = (k) => t0 + m.jit + k * P_;
    const adv = (res) => { m.log.push(res); m.k++; m.round = m.k; m.ans = false; if (m.k >= N) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !(SPACE(code) || ENTER(code))) return false; if (!down) { m.held[code] = false; return true; } if (m.held[code]) return true; m.held[code] = true;
      if (Math.abs(m.t - m.beatT(m.k)) > win) { m.fault('fumble'); return true; }
      const s = m.slots[m.k]; if (SPACE(code) && s !== 'good') m.fault('dead issued'); else if (ENTER(code) && s === 'good') m.fault('false gap');
      adv(SPACE(code) ? 'issued' : 'gap'); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.k < N && m.t > m.beatT(m.k) + win) { m.fault('waiting'); adv('missed'); } };
    m.hint = () => { const h = Object.keys(m.held).find(k => m.held[k]); if (h) return [[h, false]];
      return m.k < N && Math.abs(m.t - m.beatT(m.k)) < 0.04 ? [[m.slots[m.k] === 'good' ? 'Space' : 'Enter', true]] : []; };
    m.bad = () => { const h = Object.keys(m.held).find(k => m.held[k]); if (h) return [h, false]; return m.k < N && Math.abs(m.t - m.beatT(m.k)) > win * 1.5 ? ['Space', true] : null; };
    m.view = () => ({ slots: m.slots, jit: +m.jit.toFixed(2) });
    m.buttons = () => [['Space', 'Issue'], ['Enter', 'Gap']];
    m.draw = (c, W, H, P) => {
      txt(c, 'SIDEARM RACK', 16, 18, { size: 11, col: COL.gold }); txt(c, `answered ${m.k} / ${N}`, 384, 18, { size: 11, align: 'right', col: COL.pale });
      m.slots.forEach((s, k) => { const x = 30 + k * 50, y = 60, cur = k === m.k;
        box(c, x - 18, y - 24, 36, 64, cur ? 'rgba(125,151,232,.18)' : 'rgba(255,255,255,.04)', cur ? COL.peri : null, 4);
        if (k < m.k) txt(c, m.log[k] === 'issued' ? 'issued' : m.log[k] === 'gap' ? 'gap' : 'late', x, y + 54, { size: 9, align: 'center', col: COL.dim });
        if (s === 'empty') txt(c, 'empty', x, y + 4, { size: 10, align: 'center', col: P.bad });
        else { lamp(c, x, y - 6, 8, s === 'good' ? P.good : P.bad, s === 'good' ? 'circle' : 'triangle'); txt(c, `#${m.serials[k]}`, x, y + 22, { size: 9, align: 'center', col: COL.ink }); } });
      if (m.k < N) { const d = m.beatT(m.k) - m.t, rad = 6 + Math.max(0, Math.min(1, d / P_)) * 30, cx = 200, cy = 140;
        c.strokeStyle = Math.abs(d) <= win ? P.good : COL.dim; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, rad, 0, 6.283); c.stroke();
        lamp(c, cx, cy, 6, COL.gold, 'diamond'); txt(c, d > P_ ? 'drill starting…' : 'beat', cx + 44, cy + 4, { size: 11, col: COL.pale }); }
    };
    return m;
  },
});
