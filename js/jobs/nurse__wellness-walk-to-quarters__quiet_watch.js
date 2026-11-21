// Nurse: wellness walk to quarters. At each door ask how they are sleeping, eating and coping (Space, up to three questions). Flat one-word
// answers are the warning. Once you know enough, refer (Up) or leave them be (Down). Deciding before two answers is assuming.
import { define, machine, SPACE, ARROW, pick, shuffle, txt, box, COL } from './kit.js';

const FLAT = ['Fine.', 'Whatever.', 'Busy.', 'Fine, thanks.'], OPEN = ['Slept six hours, bit restless.', 'Had the stew, it was ok.', 'Nervous about the next away team.', 'Missing home but holding up.', 'Tired but chatting with friends.'];
const Q = ['How have you been sleeping?', 'Eating properly this week?', 'How is the work going?'];
export default define({
  job: { billet: 'nurse', label: 'Wellness walk to quarters', type: 'task:quiet_watch' },
  title: 'Door-to-door wellness questions', dept: 'medical', host: 'console', tool: 'Wellness list',
  how: 'Press Space to ask the next question at the door. When two answers agree, Up refers the crew member and Down leaves them be. Two flat answers mean refer.',
  keys: ['Space ask', 'Up refer', 'Down leave'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'ask then refer', input: 'space+arrows', win: 'four crew doors each asked until two answers agree then referred when two answers were flat or left when two were open',
    fail: 'deciding before two answers are heard, referring someone who answered openly or leaving someone who answered flat twice',
    rule: 'Space asks a question and shows the reply. Two flat replies in a row of questions: Up refers. Two open replies: Down leaves. Deciding earlier is a fault.' },
  rush: 'Ticked everyone as fine from the corridor.',
  captions: { assumed: 'door knock echo', 'wrong call': 'wellness list buzz' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; m.k = 0; m.asked = 0; m.rounds = 4; m.round = 0;
    m.crew = Array.from({ length: 4 }, (_, i) => { const withdrawn = i % 2 === 0 ? r() < 0.7 : r() < 0.3, ans = shuffle(r, [0, 1, 2]).map(() => 0); const flat = withdrawn ? [1, 1, r() < 0.5 ? 1 : 0] : [0, 0, r() < 0.5 ? 1 : 0]; return { name: pick(r, ['Ens. Vale', 'PO Tran', 'Lt. Okoro', 'Spc. Brandt', 'Ens. Ito', 'Cpl. Reyes']) + ' ' + (i + 1), withdrawn, a: flat.map((f, q) => f ? pick(r, FLAT) : pick(r, OPEN)), flat }; });
    const C = () => m.crew[Math.min(m.k, 3)], seen = () => C().flat.slice(0, m.asked), nf = () => seen().filter(Boolean).length, no = () => m.asked - nf();
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code); if (!SPACE(code) && a !== 'U' && a !== 'D') return false; if (!down) return true;
      if (SPACE(code)) { if (m.asked < 3) m.asked++; return true; }
      if (nf() < 2 && no() < 2) { m.fault('assumed'); return true; }
      if ((a === 'U') !== (nf() >= 2)) { m.fault('wrong call'); return true; }
      m.k++; m.round = m.k; m.asked = 0; if (m.k >= 4) m.win(); return true;
    };
    m.hint = () => { if (!C()) return []; if (nf() >= 2) return [['ArrowUp', true]]; if (no() >= 2) return [['ArrowDown', true]]; return [['Space', true]]; };
    m.bad = () => 'ArrowDown';
    m.view = () => ({ crew: m.crew.map(c => [c.name, c.a]) });
    m.buttons = () => [['Space', 'Ask'], ['ArrowUp', 'Refer'], ['ArrowDown', 'Leave']];
    m.draw = (c, W, H, P) => {
      const p = C() || m.crew[3]; txt(c, `Door: ${p.name}`, 14, 22, { size: 14, col: COL.gold });
      for (let q = 0; q < 3; q++) { txt(c, q < m.asked ? `${Q[q]}  "${p.a[q]}"` : `${Q[q]}  ...`, 14, 54 + q * 28, { size: 12, col: q < m.asked ? (p.flat[q] ? P.bad : COL.ink) : COL.dim }); }
      txt(c, `flat ${nf()}  open ${no()}`, 14, 150, { size: 12, col: COL.dim });
    };
    return m;
  },
});
