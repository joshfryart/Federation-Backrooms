// Counsellor: report load-crew exhaustion to the quartermaster. Your hours notes are on the left; the exhaustion form on the right. For each
// handler, key their lifting hours (digit), mark them OVER with Space if they lifted more than eight hours without a break, and Enter the line.
// Then choose the recommendation with ← / → (one handler over: a two-hour rotation; two or more: an extra pair of hands on the rig) and Enter
// to hand it over for signature. A misread line, an unfair or missing OVER mark, or a form with no fitting recommendation gets waved away.
import { define, machine, ARROW, SPACE, ENTER, DIG, ri, shuffle, txt, box, COL } from './kit.js';

const NAMES = ['Brodie', 'Akande', 'Fitch', 'Ramires', 'Hollis', 'Ngata', 'Lusk', 'Oyelaran'];
const RECS = ['(none)', 'two-hour rotation', 'extra pair of hands on the rig', 'stand the shift down'];
export default define({
  job: { billet: 'counsel', label: 'Report load-crew exhaustion to the quartermaster', type: 'task:cargo_run' },
  title: 'Exhaustion form for the quartermaster', dept: 'medical', host: 'console', tool: 'Hours notes, exhaustion form',
  how: 'Copy each handler\'s hours from your notes with a digit, press Space to mark OVER if they lifted 9 + hours without a break, Enter the line. Then pick the recommendation with ← / → and Enter.',
  keys: ['1 – 9 hours', 'Space mark OVER', '← / → recommendation', 'Enter line / submit'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'transcribe and recommend', input: 'arrows+digits+enter+space', win: 'every handler\'s hours copied onto the exhaustion form, the over-eight-hour lifters marked, and a fitting relief recommendation signed',
    fail: 'copying the wrong hours, marking someone unfairly or leaving an over-worked lifter unmarked, or submitting with no fitting recommendation',
    rule: 'Each line: type the hours digit from the notes, Space toggles OVER (more than 8 h with no break), Enter commits. Last, ← / → picks rotation (one OVER) or extra hands (two or more), Enter submits.' },
  rush: 'Told the quartermaster "they look tired" over the manifest call.',
  captions: { misread: 'quartermaster checks the notes', 'unfair mark': 'quartermaster bristles', buried: 'quartermaster shrugs', 'waved away': 'form pushed back' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, nOver = r() < 0.5 ? 1 : 2;
    const rows = shuffle(r, NAMES).slice(0, 4).map((n, k) => { const over = k < nOver, brk = !over && r() < 0.4; return { n, h: over ? 9 : brk ? ri(r, 8, 9) : ri(r, 4, 8), brk, over: false, typed: 0 }; });
    m.rows = shuffle(r, rows); m.rows.forEach(x => { x.over = false; x.isOver = x.h > 8 && !x.brk; });
    m.k = 0; m.rec = 0; m.want = m.rows.filter(x => x.isOver).length >= 2 ? 2 : 1; m.rounds = 5; m.round = 0;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), d = DIG(code), x = m.rows[m.k];
      if (x) {
        if (d) { x.typed = d; return true; } if (SPACE(code)) { x.over = !x.over; return true; }
        if (ENTER(code)) { if (x.typed !== x.h) { m.fault('misread'); return true; } if (x.over && !x.isOver) { m.fault('unfair mark'); return true; } if (!x.over && x.isOver) { m.fault('buried'); return true; }
          m.k++; m.round = m.k; return true; }
        return !!a;
      }
      if (a === 'L' || a === 'R') { m.rec = (m.rec + (a === 'R' ? 1 : 3)) % 4; return true; }
      if (ENTER(code)) { if (m.rec !== m.want) m.fault('waved away'); else m.win(); return true; }
      return !!a || SPACE(code) || !!d;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const x = m.rows[m.k]; if (x) { if (x.typed !== x.h) return [['Digit' + x.h, true]]; if (x.over !== x.isOver) return [['Space', true]]; return [['Enter', true]]; } return [[m.rec === m.want ? 'Enter' : 'ArrowRight', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ rows: m.rows.map(x => [x.n, x.h, x.brk]), want: m.want });
    m.buttons = () => [...[4, 5, 6, 7, 8, 9].map(n => ['Digit' + n, String(n)]), ['Space', 'OVER'], ['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['Enter', 'Enter']];
    m.draw = (c, W, H, P) => {
      box(c, 8, 8, 150, 154, 'rgba(247,201,162,.07)', COL.pale); txt(c, 'HOURS NOTES', 16, 24, { size: 10, col: COL.dim });
      m.rows.forEach((x, i) => { txt(c, `${x.n}: ${x.h} h`, 16, 46 + i * 28, { size: 12, col: COL.pale }); txt(c, x.brk ? 'took a break' : 'no break', 16, 60 + i * 28, { size: 9, col: x.brk ? COL.dim : COL.warn }); });
      txt(c, 'EXHAUSTION FORM', 172, 24, { size: 10, col: COL.dim });
      m.rows.forEach((x, i) => { const y = 32 + i * 24, on = i === m.k; box(c, 168, y, 222, 20, on ? 'rgba(125,151,232,.16)' : 'rgba(255,255,255,.03)', on ? COL.peri : null, 4);
        txt(c, x.n, 176, y + 14, { size: 11 }); txt(c, i < m.k || x.typed ? `${x.typed || '-'} h` : '_ h', 290, y + 14, { size: 11, col: COL.gold }); if (x.over) txt(c, 'OVER ▲', 384, y + 14, { size: 10, align: 'right', col: COL.warn }); if (i < m.k) txt(c, '✓', 330, y + 14, { size: 11, col: P.good }); });
      const y = 136; box(c, 168, y, 222, 24, m.k >= m.rows.length ? 'rgba(244,194,91,.15)' : 'rgba(255,255,255,.03)', m.k >= m.rows.length ? COL.gold : null, 4);
      txt(c, `Rec: ◀ ${RECS[m.rec]} ▶`, 176, y + 16, { size: 10, col: COL.gold }); txt(c, '1 OVER: rotation · 2+: extra hands', 390, y + 34 > 168 ? 166 : y + 34, { size: 8, align: 'right', col: COL.dim });
    };
    return m;
  },
});
