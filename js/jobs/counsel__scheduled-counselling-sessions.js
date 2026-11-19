// Counsellor: scheduled counselling sessions. The crewman talks in phrases with gaps between them. Nod (Space) in each gap to show you are
// listening, never while they are mid-phrase (that is interrupting). One gap runs longer than the rest: that is where they trailed off, the
// thing they avoid. When they finish, reflect back (1 – 3) the line that names THAT topic in their own words, not the duty complaint.
import { define, machine, SPACE, DIG, pick, shuffle, rf, txt, box, bar, COL } from './kit.js';

const WHO = ['Ensign Tal', 'Crewman Oduya', 'Lt. Brandt', 'Ensign Kowal', 'Petty Officer Reyes', 'Crewman Haas'];
const DUTY = ['the new rota is fine, I suppose', 'work has been busy', 'my section chief is fair enough', 'the drills run long'];
const TOPICS = [['since the letter from my sister', 'the letter from your sister'], ['I keep thinking about the hull breach', 'the hull breach'], ['my bunkmate moved out', 'your bunkmate moving out'],
  ['I missed my father\'s birthday call', 'missing your father\'s call'], ['I have stopped going to the mess', 'not going to the mess'], ['the transfer request was turned down', 'the turned-down transfer']];
const FILL = ['I sleep late most nights', 'I eat at my station', 'it is not a big thing', 'I have been tired'];
export default define({
  job: { billet: 'counsel', label: 'Scheduled counselling sessions', type: 'loop' },
  title: 'Listen, nod, reflect', dept: 'medical', host: 'console', tool: 'Counselling chair, note pad',
  how: 'Let them talk: nod with Space in each gap, never mid-phrase. The longest gap marks what they avoid. At the end, reflect back that topic with 1 – 3.',
  keys: ['Space nod (in a gap)', '1 – 3 reflect back'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'nod and reflect', input: 'space+digits', win: 'two sessions heard through with a nod in every gap and the avoided topic reflected back accurately',
    fail: 'nodding over their words, letting a gap pass unacknowledged, or reflecting the duty complaint instead of the avoided topic',
    rule: 'Phrases appear one at a time. Press Space only in the silences between them. The silence that runs longest follows the avoided topic; at the end pick the reflection that names it.' },
  rush: 'Read out last week\'s plan and booked them in again.',
  captions: { interrupted: 'crewman stops mid-sentence', unheard: 'awkward silence', 'missed it': 'crewman shrugs' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, gap = m.calm ? 1.3 : 1.0;
    const mk = () => {
      const [said, refl] = pick(r, TOPICS), d = pick(r, DUTY), f = shuffle(r, FILL).slice(0, 2), hi = 1 + Math.floor(r() * 2);
      const ph = [d, ...f]; ph.splice(hi, 0, said);
      const seq = ph.map((p, k) => ({ p, talk: rf(r, 1.1, 1.6), gap: k === hi ? gap + 1.2 : gap, nod: false, avoid: k === hi }));
      const opts3 = shuffle(r, [[`It sounds like ${refl} is weighing on you.`, true], [`It sounds like ${d.split(',')[0]} is the problem.`, false], ['So the main thing is getting back on top of your duties.', false]]);
      return { who: pick(r, WHO), seq, opts3, ans: opts3.findIndex(o => o[1]) + 1 };
    };
    m.ses = [mk(), mk()]; m.k = 0; m.i = 0; m.ph = 'talk'; m.c = 0; m.rounds = 2; m.round = 0; m.said = [];
    const S = () => m.ses[m.k];
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code), s = S();
      if (SPACE(code)) { if (m.ph === 'talk') { m.fault('interrupted'); m.c = 0; } else if (m.ph === 'gap') s.seq[m.i].nod = true; return true; }
      if (d >= 1 && d <= 3) { if (m.ph !== 'reflect') return true; if (d !== s.ans) { m.fault('missed it'); return true; } m.k++; m.round++; m.i = 0; m.ph = 'talk'; m.c = 0; m.said = []; if (m.k >= 2) m.win(); return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt) || m.ph === 'reflect') return; const s = S(), q = s.seq[m.i]; m.c += dt;
      if (m.ph === 'talk' && m.c >= q.talk) { m.ph = 'gap'; m.c = 0; m.said.push([q.p, 0]); }
      else if (m.ph === 'gap') { m.said[m.said.length - 1][1] = m.c; if (m.c >= q.gap) { if (!q.nod) m.fault('unheard'); m.i++; m.c = 0; m.ph = m.i >= s.seq.length ? 'reflect' : 'talk'; } }
    };
    m.hint = () => { const s = S(); if (!s) return []; if (m.ph === 'gap' && !s.seq[m.i].nod && m.c > 0.2) return [['Space', true]]; if (m.ph === 'reflect') return [['Digit' + s.ans, true]]; return []; };
    m.bad = () => (m.ph === 'talk' && m.c > 0.3 ? 'Space' : null);
    m.view = () => ({ ses: m.ses.map(s => [s.who, s.seq.map(q => q.p).join('|'), s.ans]) });
    m.buttons = () => [['Space', 'Nod'], ['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3']];
    m.draw = (c, W, H, P) => {
      const s = S() || m.ses[1]; txt(c, `${s.who}  ·  session ${Math.min(m.k + 1, 2)} / 2`, 14, 18, { size: 12, col: COL.gold });
      txt(c, m.ph === 'talk' ? 'speaking… (stay quiet)' : m.ph === 'gap' ? 'silence — nod' : 'reflect back', 386, 18, { size: 10, align: 'right', col: m.ph === 'talk' ? COL.warn : P.good });
      if (m.ph === 'reflect') { s.opts3.forEach(([t], j) => { box(c, 14, 30 + j * 44, 372, 38, 'rgba(255,255,255,.06)', COL.lav); txt(c, `${j + 1}`, 26, 54 + j * 44, { size: 14, col: COL.gold }); txt(c, t, 44, 54 + j * 44, { size: 11 }); }); return; }
      m.said.slice(-4).forEach(([p, g], j) => { txt(c, `"${p}"`, 20, 42 + j * 26, { size: 11, col: COL.pale }); txt(c, '·'.repeat(Math.max(1, Math.round(g * 3))), 20, 54 + j * 26, { size: 12, col: COL.dim }); });
      if (m.ph === 'talk') bar(c, 20, 150, 360, 8, m.c / s.seq[m.i].talk, { col: COL.warn });
      else bar(c, 20, 150, 360, 8, m.c / 3.5, { col: P.good }); txt(c, 'gap length (dots)', 20, 145, { size: 9, col: COL.dim });
    };
    return m;
  },
});
