// Yeoman: draft the survey summary for the log. The survey log runs past the pen, one pass per entry, each with its frame count. A pass that
// came back short of its full frames is a gap and must be stated in the summary: tap Space while that entry is under the pen. A gap that
// slides by unmarked is a hole the debrief cannot explain; marking a full pass as a gap invents one.
import { define, machine, SPACE, ri, pick, shuffle, txt, box, COL } from './kit.js';

const TARGETS = ['Ridge K3', 'Moon 2 basin', 'Storm cell 7', 'Dust lane D', 'Ice cap north', 'Pulsar B-12'];

export default define({
  job: { billet: 'yeoman', label: 'Draft survey summary for the log', type: 'task:survey' },
  title: 'State every gap as the survey log runs past', dept: 'command', host: 'console', tool: 'Survey log and summary template',
  how: 'The survey log scrolls under the pen. When a pass under the pen shows fewer frames than its full count, tap Space to state it as a gap. Full passes are left alone.',
  keys: ['Space state the gap'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'state the gaps', input: 'space', win: 'every short pass marked as a gap in the summary line of its target as the log scrolls by, and no full pass flagged',
    fail: 'a short pass scrolling past unstated, or a complete pass written down as missing',
    rule: 'Entries read "pass n · frames got / full". Tap Space while an entry is inside the pen box if its got figure is below the full figure (0 or partial); ignore entries where they match.' },
  rush: 'Wrote "survey complete" with the pass count and left the gaps out.',
  captions: { 'gap hidden': 'debrief query chime', 'false gap': 'eraser squeak' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, gapW = m.calm ? 1.5 : 1.05, pen = 200, sp = 64 / gapW;
    const tg = shuffle(r, TARGETS).slice(0, 3); m.ents = []; let gaps = 0;
    tg.forEach((t, ti) => { const n = ri(r, 3, 4), full = pick(r, [24, 30, 40, 48]), g = shuffle(r, [...Array(n).keys()]).slice(0, ri(r, 1, 2));
      for (let p = 0; p < n; p++) { const gap = g.includes(p); if (gap) gaps++; m.ents.push({ t, ti, p: p + 1, full, got: gap ? (r() < 0.4 ? 0 : ri(r, 3, full - 4)) : full, gap, mark: false, gone: false }); } });
    if (gaps < 3) for (const e of m.ents) if (!e.gap && gaps < 3 && e.p > 1) { e.gap = true; e.got = ri(r, 2, e.full - 3); gaps++; }
    m.ents.forEach((e, i) => { e.x0 = pen + 120 + i * 64; }); m.rounds = 3; m.round = 1;
    const xs = (e) => e.x0 - m.t * sp, under = () => m.ents.find(e => !e.gone && Math.abs(xs(e) - pen) < 28);
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !SPACE(code)) return false; if (!down) return true; const e = under();
      if (!e || !e.gap || e.mark) { m.fault('false gap'); if (e) e.flag = true; return true; } e.mark = true; return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return;
      for (const e of m.ents) if (!e.gone && xs(e) < pen - 28) { e.gone = true; if (e.gap && !e.mark) m.fault('gap hidden'); m.round = Math.min(3, e.ti + 1); }
      if (m.ents.every(e => e.gone) && m.state === 'play') m.win(); };
    m.hint = () => { const e = under(); return e && e.gap && !e.mark && Math.abs(xs(e) - pen) < 18 ? [['Space', true]] : []; };
    m.bad = () => { const e = under(); return e && !e.gap ? 'Space' : null; };
    m.view = () => ({ ents: m.ents.map(e => [e.t, e.p, e.got, e.full]) });
    m.buttons = () => [['Space', 'State gap']];
    m.draw = (c, W, H, P) => {
      txt(c, 'SURVEY LOG', 10, 16, { size: 10, col: COL.peri }); box(c, pen - 30, 22, 60, 62, null, COL.gold, 6); txt(c, 'PEN', pen, 96, { size: 9, align: 'center', col: COL.gold });
      for (const e of m.ents) { const x = xs(e); if (x < -40 || x > W + 40) continue; const short = e.got < e.full;
        box(c, x - 26, 28, 52, 50, e.mark ? 'rgba(255,179,71,.22)' : 'rgba(255,255,255,.06)', e.flag ? P.bad : null, 5);
        txt(c, e.t.split(' ').pop(), x, 42, { size: 9, align: 'center', col: COL.dim }); txt(c, `pass ${e.p}`, x, 56, { size: 10, align: 'center' });
        txt(c, `${e.got}/${e.full}`, x, 72, { size: 12, align: 'center', col: short ? COL.warn : COL.ink }); if (e.mark) txt(c, 'GAP', x, 24, { size: 9, align: 'center', col: P.bad }); }
      txt(c, 'SUMMARY', 10, 116, { size: 10, col: COL.peri });
      [...new Set(m.ents.map(e => e.t))].forEach((t, i) => { const es = m.ents.filter(e => e.t === t && e.gone), g = es.filter(e => e.mark).map(e => e.p);
        txt(c, `${t}: ${es.length} passes read${g.length ? ', gaps ' + g.join(', ') : ''}`, 10, 132 + i * 14, { size: 10, col: COL.pale }); });
    };
    return m;
  },
});
