// Captain: order departure and debrief. Debrief notes slide across the desk tray one at a time; read each finding line as it passes and
// star the ones that need follow-up (Space) before they drop into the outgoing tray. Announce departure on the desk PA (Enter) only once the
// science note has been filed. Starring a routine note, letting a follow-up go unstarred, or announcing before science has filed is a fault.
import { define, machine, SPACE, ENTER, ri, pick, shuffle, txt, box, COL } from './kit.js';

const DEPT = ['Science', 'Flight', 'Engineering', 'Medical', 'Operations', 'Security'];
const FOLLOW = ['sample seal cracked — re-check', 'reading unconfirmed, needs a second pass', 'probe two lost telemetry at 0340', 'one crewman reports headaches', 'hull scuff on shuttle — inspect', 'chart gap near the ring'];
const ROUTINE = ['all samples sealed and logged', 'flight times nominal', 'no faults during survey', 'no injuries reported', 'telemetry archived', 'no contacts detected'];
const HEAD = ['heading 214 mark 3', 'heading 090 mark 0', 'heading 331 mark 12', 'heading 147 mark 5'];

export default define({
  job: { billet: 'co', label: 'Order departure and debrief', type: 'task:survey' },
  title: 'Debrief tray starring', dept: 'command', host: 'console', tool: 'Desk PA panel and debrief tray',
  how: 'Debrief notes slide past one by one: star each finding that needs follow-up before it drops into the tray, and announce departure only after science has filed.',
  keys: ['Space star the note', 'Enter announce departure'], limit: 26, maxFaults: 3,
  fingerprint: { verb: 'star follow-ups', input: 'space+enter', win: 'every follow-up note starred as it passes, no routine note starred, departure announced after the science data is filed',
    fail: 'starring a routine finding, letting a follow-up slide into the tray unstarred, or announcing departure before science has filed',
    rule: 'Each note crosses the reading window in about two seconds. Space stars the note in the window; star only findings that need action. Enter announces departure once the Science note shows FILED.' },
  rush: 'Announced departure from the bridge and let the notes pile up unread.',
  captions: { 'starred routine': 'marker squeak', 'missed follow-up': 'note drops into tray', 'data not filed': 'science officer: "not yet, Captain"' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, T = m.calm ? 3.0 : 2.2, gap = 0.4, order = shuffle(r, DEPT.slice(1)), si = ri(r, 1, 3);
    order.splice(si, 0, 'Science'); const fu = shuffle(r, [0, 1, 2, 3, 4, 5]).slice(0, ri(r, 2, 3));
    m.notes = order.map((d, i) => { const f = fu.includes(i); return { d, f, line: f ? pick(r, FOLLOW) : pick(r, ROUTINE), a: 0.6 + i * (T + gap), star: false, gone: false }; });
    m.head = pick(r, HEAD); m.T = T; m.ann = false; m.rounds = m.notes.length; m.round = 0;
    const inWin = () => m.notes.find(n => m.t >= n.a && m.t < n.a + T), sci = () => m.notes.find(n => n.d === 'Science');
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false;
      if (SPACE(code)) { const n = inWin(); if (!n || n.star) return true; if (!n.f) { m.fault('starred routine'); return true; } n.star = true; return true; }
      if (ENTER(code)) { if (m.ann) return true; if (!sci().gone) { m.fault('data not filed'); return true; } m.ann = true; m.ev('announce'); return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return;
      for (const n of m.notes) if (!n.gone && m.t >= n.a + T) { n.gone = true; m.round++; if (n.f && !n.star) m.fault('missed follow-up'); }
      if (m.state === 'play' && m.ann && m.notes.every(n => n.gone)) m.win();
    };
    m.hint = () => { const n = inWin(); if (n && n.f && !n.star && m.t - n.a > 0.3) return [['Space', true]]; if (!m.ann && sci().gone) return [['Enter', true]]; return []; };
    m.bad = () => 'Enter';
    m.view = () => ({ notes: m.notes.map(n => [n.d, n.f, n.line]), head: m.head });
    m.buttons = () => [['Space', '★ Star'], ['Enter', 'Announce departure']];
    m.draw = (c, W, H, P) => {
      box(c, 120, 30, 160, 66, 'rgba(125,151,232,.12)', COL.peri, 8); txt(c, 'READING WINDOW', 200, 26, { size: 9, col: COL.dim, align: 'center' });
      for (const n of m.notes) {
        if (m.t < n.a - 1.2 || n.gone) continue; const k = (m.t - n.a) / T, x = 120 + 160 * (1 - k) - 70;
        box(c, x, 38, 160, 50, n.star ? 'rgba(240,147,58,.3)' : 'rgba(247,201,162,.12)', n.star ? COL.orange : COL.dim, 6);
        txt(c, (n.star ? '★ ' : '') + n.d, x + 6, 52, { size: 10, col: COL.gold });
        const w = n.line.length > 28 ? [n.line.slice(0, 28), n.line.slice(28)] : [n.line]; w.forEach((s, j) => txt(c, s, x + 6, 66 + j * 12, { size: 9 }));
      }
      const s = sci(); txt(c, `Science note: ${s.gone ? '● FILED' : '○ not filed'}`, 10, 120, { size: 11, col: s.gone ? P.good : COL.dim });
      txt(c, m.ann ? `▲ Departure announced: ${m.head}` : `Departure ready: ${m.head}`, 10, 140, { size: 11, col: m.ann ? P.good : COL.pale });
      txt(c, `filed ${m.notes.filter(n => n.gone).length} / ${m.notes.length}`, W - 10, 140, { size: 10, col: COL.dim, align: 'right' });
    };
    return m;
  },
});
