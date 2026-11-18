// Yeoman: track personnel reassignments to sickbay. Each notice moves a named crew member off their watch to a sickbay shift. Every watch must
// keep at least two on duty, so before moving someone off a thin watch, send it a reserve to cover. Move the notices (1-4); pick a watch
// (← →) and send a reserve (Space). Reserves are counted to the exact need: one sent where no gap was coming is one missing later.
import { define, machine, DIG, ARROW, SPACE, ri, shuffle, txt, box, COL } from './kit.js';

const NAMES = ['Abara', 'Brandt', 'Chen', 'Dasari', 'Eklund', 'Fonseca', 'Gale', 'Huang', 'Ivers', 'Juarez', 'Kowal', 'Lindqvist', 'Mbeki', 'Novak'];
const WATCH = ['Alpha', 'Beta', 'Gamma'], MIN = 2;

export default define({
  job: { billet: 'yeoman', label: 'Track personnel reassignments to sickbay', type: 'task:medical_relief' },
  title: 'Cover the watch before moving to sickbay', dept: 'command', host: 'console', tool: 'Duty roster and reassignment notices',
  how: 'Move each notice\'s crew member to sickbay (1-4). A watch may not drop below two: first pick that watch (← →) and send a reserve (Space), then move them. Reserves are exactly enough.',
  keys: ['1-4 move a notice to sickbay', '← → pick a watch', 'Space send a reserve'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'cover then move', input: 'digits+arrows+space', win: 'all four reassignment notices moved to sickbay with every watch still at two or more and every reserve placed where a gap was due',
    fail: 'moving someone off a watch that drops below two, or spending a reserve on a watch that had no gap coming',
    rule: 'Each watch shows its strength and how many of its people have notices. If moving them would leave fewer than two, select the watch and press Space for a reserve first; then press the notice numbers.' },
  rush: 'Sent the volunteers to sickbay and left the roster for the next shift to fix.',
  captions: { 'watch short': 'roster alarm: watch below strength', 'reserve wasted': 'reserve pool chime' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, nm = shuffle(r, NAMES); let p = 0;
    const thin = ri(r, 0, 2); m.w = WATCH.map(() => ({ crew: [], res: 0 })); WATCH.forEach((_, i) => { const n = i === thin ? 2 : ri(r, 2, 3); for (let k = 0; k < n; k++) m.w[i].crew.push(nm[p++]); });
    const all = m.w.flatMap((w, i) => w.crew.map(n => ({ n, wi: i }))), first = all.find(x => x.wi === thin);
    m.notes = shuffle(r, [first, ...shuffle(r, all.filter(x => x !== first)).slice(0, 3)]).map(x => ({ ...x, moved: false }));
    const need = (i) => Math.max(0, m.notes.filter(x => x.wi === i && !x.moved).length - (m.w[i].crew.length - MIN));
    m.reserves = [0, 1, 2].reduce((a, i) => a + need(i), 0); m.cx = ri(r, 0, 2); m.sick = []; m.rounds = 4; m.round = 0;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), d = DIG(code);
      if (a === 'L' || a === 'R') { if (down) m.cx = (m.cx + (a === 'R' ? 1 : 2)) % 3; return true; }
      if (SPACE(code)) { if (!down) return true; if (!m.reserves) { m.fault('reserve wasted'); return true; } m.reserves--;
        if (need(m.cx) <= 0) m.fault('reserve wasted'); else m.w[m.cx].crew.push('Reserve ' + 'ABCDEF'[m.w[m.cx].res++]); return true; }
      if (d < 1 || d > 4) return false; if (!down) return true; const x = m.notes[d - 1]; if (x.moved) return true;
      const w = m.w[x.wi]; if (w.crew.length - 1 < MIN) { m.fault('watch short'); return true; }
      w.crew = w.crew.filter(n => n !== x.n); x.moved = true; m.sick.push(x.n); m.round = m.sick.length; if (m.notes.every(q => q.moved)) m.win(); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const g = [0, 1, 2].find(i => need(i) > 0); if (g != null) return m.cx === g ? [['Space', true]] : [['ArrowRight', true]];
      const k = m.notes.findIndex(x => !x.moved); return k < 0 ? [] : [[`Digit${k + 1}`, true]]; };
    m.bad = () => { const k = m.notes.findIndex(x => !x.moved && m.w[x.wi].crew.length - 1 < MIN); if (k >= 0) return `Digit${k + 1}`; const j = m.notes.findIndex(x => !x.moved); return j >= 0 ? `Digit${j + 1}` : null; };
    m.view = () => ({ w: m.w.map(w => w.crew.slice()), notes: m.notes.map(x => x.n) });
    m.buttons = () => [...m.notes.map((x, i) => [`Digit${i + 1}`, `${i + 1}`]), ['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['Space', 'Reserve']];
    m.draw = (c, W, H, P) => {
      m.w.forEach((w, i) => { const x = 8 + i * 96, on = i === m.cx, pend = m.notes.filter(q => q.wi === i && !q.moved).length, gap = need(i) > 0;
        box(c, x, 8, 90, 124, 'rgba(255,255,255,.05)', on ? COL.gold : gap ? P.bad : COL.dim, 6); txt(c, `${WATCH[i]} ${w.crew.length}`, x + 6, 22, { size: 11, col: COL.gold });
        w.crew.forEach((n, k) => { const leaving = m.notes.some(q => q.n === n && !q.moved); txt(c, `${leaving ? '→ ' : ''}${n}`, x + 6, 38 + k * 13, { size: 9, col: leaving ? COL.warn : COL.ink }); });
        txt(c, gap ? `▲ short by ${need(i)}` : pend ? 'covered' : 'steady', x + 6, 126, { size: 9, col: gap ? P.bad : COL.dim }); });
      box(c, 300, 8, 92, 124, 'rgba(255,255,255,.05)', COL.lav, 6); txt(c, 'NOTICES', 306, 22, { size: 10, col: COL.lav });
      m.notes.forEach((q, i) => txt(c, `${i + 1} ${q.moved ? '✓' : ''}${q.n}`, 306, 40 + i * 15, { size: 10, col: q.moved ? P.good : COL.ink }));
      txt(c, `sickbay: ${m.sick.length}`, 306, 112, { size: 10, col: COL.pale }); txt(c, `reserves left ${m.reserves}`, 8, H - 14, { size: 11, col: COL.pale });
    };
    return m;
  },
});
