// Botanist, shakedown: full O2 output test of the beds. The test timer runs one cycle; every quarter hour the canopy sensors report in turn and
// a reading is live on the trend for a short spell. Enter each one into the output table while it is live: Space writes it plain, Enter writes it
// in red because it dips under that tray's rated line. A reading that times out unrecorded leaves a gap in the table; a reading filed in the
// wrong ink is a misfiled entry. Both are faults.
import { define, machine, SPACE, ENTER, rf, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'bot', label: 'Full O2 output test of the beds', type: 'task:shakedown' },
  title: 'Quarter-hour output table', dept: 'sciences', host: 'console', tool: 'Test timer and canopy sensors',
  how: 'Each quarter hour one tray’s sensor reading goes live for a moment. Space records it; Enter records it in red if it is under the tray’s rated line. Do not let a reading lapse.',
  keys: ['Space record', 'Enter record in red (under the line)'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'table readings', input: 'enter+space', win: 'a full cycle output table with every quarter-hour reading taken in its window and every dip under the rated line in red',
    fail: 'letting a live reading lapse so the table has a gap, or writing a dip in plain ink',
    rule: 'Readings arrive on a fixed clock, one tray at a time, each live for about a second. Compare it with that tray’s rated tick: over = Space, under = Enter.' },
  rush: 'Took one reading at the end of the cycle and copied it down every row.',
  captions: { gap: 'test timer beeps past a reading', misfiled: 'table cell crossed out' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, P = m.calm ? 3.4 : 2.4, Wn = m.calm ? 1.8 : 1.2;
    m.rated = [0, 1, 2, 3].map(() => rf(r, 0.45, 0.6));
    m.rows = Array.from({ length: 8 }, (_, i) => { const tray = i % 4, low = r() < 0.35; return { tray, at: 1 + i * P, v: m.rated[tray] + (low ? -rf(r, 0.06, 0.18) : rf(r, 0.06, 0.2)), low, got: null }; });
    m.rounds = 8; m.round = 0;
    const live = () => m.rows.find(w => w.got == null && m.t >= w.at && m.t < w.at + Wn);
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down || !(SPACE(code) || ENTER(code))) return false; const w = live(); if (!w) return true;
      const red = ENTER(code); w.got = red ? 'red' : 'ok'; m.round++; if (red !== w.low) m.fault('misfiled'); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return;
      for (const w of m.rows) if (w.got == null && m.t >= w.at + Wn) { w.got = 'gap'; m.round++; m.fault('gap'); }
      if (m.state === 'play' && m.rows.every(w => w.got)) m.win(); };
    m.hint = () => { const w = live(); return w && m.t > w.at + 0.15 ? [[w.low ? 'Enter' : 'Space', true]] : []; };
    m.bad = () => { const w = live(); return w ? (w.low ? 'Space' : 'Enter') : null; };
    m.view = () => ({ rows: m.rows.map(w => [w.tray, +w.v.toFixed(3)]) });
    m.buttons = () => [['Space', 'Record'], ['Enter', 'Record red']];
    m.draw = (c, W, H, P2) => {
      const w = live(), x0 = 14, y0 = 20, y1 = 130;
      box(c, x0, y0 - 6, 190, y1 - y0 + 12, 'rgba(255,255,255,.04)', null, 6);
      m.rated.forEach((v, t) => { const x = x0 + 12 + t * 46, y = y1 - v * (y1 - y0); c.fillStyle = COL.dim; c.fillRect(x, y, 30, 2); txt(c, `T${t + 1}`, x + 15, y1 + 14, { size: 9, align: 'center', col: COL.dim });
        if (w && w.tray === t) { const yy = y1 - w.v * (y1 - y0); c.fillStyle = w.low ? P2.bad : P2.good; c.fillRect(x + 4, yy, 22, y1 - yy); txt(c, w.low ? '▼' : '▲', x + 15, yy - 4, { size: 11, align: 'center' }); } });
      txt(c, w ? `LIVE: tray ${w.tray + 1}` : `next reading in ${Math.max(0, (m.rows.find(q => !q.got)?.at ?? m.t) - m.t).toFixed(1)} s`, x0, 12, { size: 10, col: w ? COL.gold : COL.dim });
      m.rows.forEach((q, i) => { const x = 220 + (i % 2) * 90, y = 14 + Math.floor(i / 2) * 30; box(c, x, y, 84, 24, 'rgba(255,255,255,.05)', q.got === 'red' ? P2.bad : null, 5);
        txt(c, `${(i * 15 / 60 + 0.25).toFixed(2)}h T${q.tray + 1}`, x + 4, y + 15, { size: 9, col: COL.dim }); txt(c, q.got === 'gap' ? '— gap' : q.got ? `${Math.round(q.v * 100)}${q.got === 'red' ? ' R' : ''}` : '', x + 80, y + 15, { size: 10, align: 'right', col: q.got === 'gap' ? COL.warn : COL.ink }); });
    };
    return m;
  },
});
