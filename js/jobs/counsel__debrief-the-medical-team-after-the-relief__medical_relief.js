// Counsellor: debrief the medical team after the relief. Sit the team at the desk and give each person the floor in turn (1 – 4) to name the
// worst moment of the relief. While someone speaks, others sometimes lean in to cut across them: hold Space (a raised hand) through the
// lean-in to keep the floor for the speaker, but do not keep your hand up when nobody is interrupting. When everyone has spoken, press Enter
// to offer the quiet room and close the debrief. Closing with someone unheard leaves their worst memory unspoken.
import { define, machine, SPACE, ENTER, DIG, rf, pick, shuffle, txt, box, bar, COL } from './kit.js';

const TEAM = ['Dr. Halloran', 'Nurse Okeke', 'Nurse Brandvold', 'Med-tech Sahin', 'Dr. Rusu', 'Nurse Tamm', 'Med-tech Corr'];
const WORST = ['the child with no family aboard', 'running out of blankets', 'the bed we lost at 0300', 'the man who would not stop shouting', 'triaging my own friend', 'the smell of the burns'];
export default define({
  job: { billet: 'counsel', label: 'Debrief the medical team after the relief', type: 'task:medical_relief' },
  title: 'Holding the floor in the debrief', dept: 'medical', host: 'console', tool: 'Debrief log, quiet room key',
  how: 'Press a number to give that person the floor. While they speak, hold Space only while someone leans in to interrupt. When all have spoken, press Enter to offer the quiet room.',
  keys: ['1 – 4 give the floor', 'Space hold: hand up', 'Enter close'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'hold the floor', input: 'digits+space-hold+enter', win: 'every team member given an uninterrupted turn to voice their worst moment before the quiet room is offered',
    fail: 'letting someone be talked over, hushing the room when nobody is interrupting, or closing with a member unheard',
    rule: 'A number starts that person\'s turn. When another member shows LEANING IN, hold Space until it passes; holding Space with no lean-in for over 0.6 s shushes the room. Enter after all have spoken.' },
  rush: 'Thanked everyone for their hard work and dismissed them.',
  captions: { 'talked over': 'two voices at once', shushed: 'room goes stiff', 'left unheard': 'someone stares at the floor' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, shush = m.calm ? 0.9 : 0.6;
    m.team = shuffle(r, TEAM).slice(0, 4).map(n => ({ n, worst: pick(r, WORST), heard: false, len: rf(r, 2.2, 3.0), lean: r() < 0.8 ? rf(r, 0.5, 1.3) : null }));
    m.cur = -1; m.p = 0; m.lean = null; m.calmed = 0; m.idleHand = 0; m.rounds = 4; m.round = 0;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code);
      if (SPACE(code)) { m.held.S = down; return true; }
      if (!down) return (d >= 1 && d <= 4) || ENTER(code);
      if (d >= 1 && d <= 4) { if (m.cur < 0 && !m.team[d - 1].heard) { m.cur = d - 1; m.p = 0; m.lean = null; } return true; }
      if (ENTER(code)) { if (m.cur >= 0) return true; if (m.team.every(x => x.heard)) m.win(); else m.fault('left unheard'); return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return;
      const leaning = m.lean && m.lean.c > 0; if (m.held.S && !leaning) { m.idleHand += dt; if (m.idleHand > shush) { m.fault('shushed'); m.idleHand = -1.0; } } else if (!m.held.S) m.idleHand = 0;
      if (m.cur < 0) return; const x = m.team[m.cur]; m.p += dt;
      if (x.lean != null && !m.lean && m.p >= x.lean) { const others = m.team.map((_, i) => i).filter(i => i !== m.cur); m.lean = { who: pick(r, others), c: m.calm ? 1.2 : 0.9, held: 0 }; x.lean = null; }
      if (m.lean && m.lean.c > 0) { m.lean.c -= dt; if (m.held.S) m.lean.held += dt; if (m.lean.c <= 0) { if (m.lean.held < 0.3) { m.fault('talked over'); m.p = Math.max(0, m.p - 1); } m.idleHand = 0; } }
      if (m.p >= x.len && !(m.lean && m.lean.c > 0)) { x.heard = true; m.cur = -1; m.round++; m.lean = null; }
    };
    m.hint = () => {
      const leaning = m.lean && m.lean.c > 0; if (m.cur >= 0) return [['Space', !!leaning]];
      if (m.held.S) return [['Space', false]]; const i = m.team.findIndex(x => !x.heard); return [[i < 0 ? 'Enter' : 'Digit' + (i + 1), true]];
    };
    m.bad = () => ['Space', true];
    m.view = () => ({ team: m.team.map(x => [x.n, x.worst, +x.len.toFixed(2)]) });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['Space', 'Hand up (hold)'], ['Enter', 'Offer quiet room']];
    m.draw = (c, W, H, P) => {
      const leaning = m.lean && m.lean.c > 0;
      m.team.forEach((x, i) => { const y = 10 + i * 30, on = i === m.cur, ln = leaning && m.lean.who === i; box(c, 10, y, 380, 26, on ? 'rgba(244,194,91,.14)' : 'rgba(255,255,255,.04)', on ? COL.gold : ln ? P.bad : null, 5);
        txt(c, `${i + 1} ${x.n}`, 18, y + 17, { size: 11, col: COL.pale });
        txt(c, ln ? 'LEANING IN ▲' : on ? 'speaking…' : x.heard ? `"${x.worst}" ✓` : 'not heard yet', 382, y + 17, { size: 10, align: 'right', col: ln ? P.bad : x.heard ? P.good : COL.dim }); });
      if (m.cur >= 0) bar(c, 10, 134, 380, 8, m.p / m.team[m.cur].len, { col: COL.gold });
      txt(c, m.held.S ? '✋ hand up' : m.cur >= 0 ? 'listening' : 'give someone the floor (1 – 4)', 10, 160, { size: 11, col: m.held.S ? COL.warn : COL.dim });
    };
    return m;
  },
});
