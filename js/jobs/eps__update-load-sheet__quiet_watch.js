// EPS tech: update the load sheet (quiet watch). For each section row, read its load off the sections panel and work out the margin to the
// ninety percent line in your head. The pen's number drum rolls through the figures; press Space as it shows your margin to ink it in. Inking
// a wrong figure leaves the next shift working blind (a fault, and the drum rolls on for another try).
import { define, machine, SPACE, ri, shuffle, txt, box, COL } from './kit.js';

const SECT = ['Fwd lighting', 'Turbolifts', 'Replicators', 'Deck 4 aux', 'Sensor feed', 'Hab ring'];
export default define({
  job: { billet: 'eps', label: 'Update load sheet', type: 'task:quiet_watch' },
  title: 'Ninety-line margin drum', dept: 'engineering', host: 'console', tool: 'Load sheet and number pen',
  how: 'For each row, take the section load from the panel away from 90 and press Space when the rolling drum shows that margin.',
  keys: ['Space ink the figure'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'subtract and ink', input: 'space', win: 'four section margins to the ninety percent line worked out and inked correctly',
    fail: 'inking a margin that is not ninety minus the section load',
    rule: 'The highlighted row names a section; its load is on the panel. Work out 90 minus that load. The pen drum counts 0 to 39 and wraps; press Space when it shows your answer.' },
  rush: 'Copied last shift\'s margins straight down the column.',
  captions: { 'wrong margin': 'pen scratch' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, rate = m.calm ? 0.2 : 0.14;
    m.rows = shuffle(r, SECT).slice(0, 4).map(n => { const pct = ri(r, 55, 88); return { n, pct, margin: 90 - pct, ink: null }; });
    m.cur = 0; m.drum = ri(r, 0, 39); m.acc = 0; m.rounds = 4; m.round = 1;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !SPACE(code)) return false; if (!down) return true; const row = m.rows[m.cur];
      if (m.drum !== row.margin) { m.fault('wrong margin'); return true; }
      row.ink = m.drum; m.cur++; m.round = Math.min(4, m.cur + 1); if (m.cur >= 4) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.acc += dt; while (m.acc >= rate) { m.acc -= rate; m.drum = (m.drum + 1) % 40; } };
    m.hint = () => m.rows[m.cur] && m.drum === m.rows[m.cur].margin ? [['Space', true], ['Space', false]] : [];
    m.bad = () => m.rows[m.cur] && m.drum !== m.rows[m.cur].margin ? 'Space' : null;
    m.view = () => ({ rows: m.rows.map(w => [w.n, w.pct]) });
    m.buttons = () => [['Space', 'Ink it']];
    m.draw = (c, W, H, P) => {
      txt(c, 'SECTIONS PANEL', 12, 16, { size: 10, col: COL.peri }); txt(c, 'LOAD SHEET · margin to 90 %', 170, 16, { size: 10, col: COL.peri });
      m.rows.forEach((w, i) => {
        const y = 36 + i * 24; txt(c, w.n, 12, y, { size: 11, col: COL.dim }); txt(c, `${w.pct} %`, 140, y, { size: 12, align: 'right' });
        box(c, 168, y - 14, 150, 20, i === m.cur ? 'rgba(244,194,91,.15)' : null, i === m.cur ? COL.gold : 'rgba(255,255,255,.15)', 4);
        txt(c, w.n, 174, y, { size: 11, col: i === m.cur ? COL.gold : COL.ink }); txt(c, w.ink == null ? (i === m.cur ? '▶ ?' : '') : `${w.ink} ✓`, 312, y, { size: 12, align: 'right', col: w.ink == null ? COL.warn : P.good });
      });
      box(c, 330, 40, 58, 60, COL.panel, COL.lav, 6); txt(c, 'PEN', 359, 34, { size: 9, align: 'center', col: COL.dim });
      txt(c, String(m.drum).padStart(2, '0'), 359, 80, { size: 28, align: 'center', col: COL.pale });
      txt(c, `faults ${m.strikes}/${m.maxStrikes}`, W - 12, H - 10, { size: 10, align: 'right', col: COL.dim });
    };
    return m;
  },
});
