// Navigator: write up fix accuracy results. The fix log reads out each shakedown run's position errors one at a time. Keep the run's worst
// fix honest: press Space whenever an error is larger than the worst so far (watch for transposed digits: 1.42 then 1.24 is not worse),
// and file the run's row (Enter) once its END card shows. A worse fix let past is a dropped worst; a row filed before the run ends leaves
// fixes out.
import { define, machine, SPACE, ENTER, ri, rf, txt, box, bar, COL } from './kit.js';

const f2 = (v) => v.toFixed(2);
export default define({
  job: { billet: 'nav', label: 'Write up fix accuracy results', type: 'task:shakedown' },
  title: 'Running worst-fix tally', dept: 'flight', host: 'console', tool: 'Fix log and accuracy table',
  how: 'As each fix error is read out, press Space if it is worse than the run\'s worst so far; press Enter to file the row when the END card shows.',
  keys: ['Space new worst fix', 'Enter file the run\'s row'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'tally the worst', input: 'space+enter', win: 'three run rows filed with every fix counted and the true worst error carried beside the average',
    fail: 'letting a worse fix go by unmarked, marking one that is not worse (a transposed digit), or filing a row before its run ends',
    rule: 'Each new error stays up briefly. Compare it digit by digit with the WORST box: if larger, Space before the next one. At END OF RUN, Enter files the row.' },
  rush: 'Averaged the fixes that looked tidy and left the worst one off the report.',
  captions: { 'dropped worst': 'report buzz', 'wrong worst': 'pencil tap', 'filed short': 'form buzz', unfiled: 'form timeout tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, gap = m.calm ? 1.3 : 0.9; m.rounds = 3; m.round = 0;
    m.runs = [0, 1, 2].map(() => { const e = []; for (let k = 0; k < 4; k++) { const prev = e[k - 1]; if (prev && prev >= 1 && r() < 0.5) { const s = f2(prev), sw = +(s[0] + '.' + s[3] + s[2]); e.push(sw !== prev ? sw : +rf(r, 0.2, 2.9).toFixed(2)); } else e.push(+rf(r, 0.2, 2.9).toFixed(2)); } return e; });
    m.ri = 0; m.k = 0; m.ct = 0; m.worst = 0; m.marked = false; m.end = false; m.filed = [];
    const run = () => m.runs[m.ri], cur = () => run()[m.k], isNew = () => !m.end && cur() > m.worst;
    const advance = () => {
      if (m.end) { m.filed.push(m.worst); m.round++; m.ri++; m.k = 0; m.worst = 0; m.end = false; m.ct = 0; m.marked = false; if (m.ri >= 3 && m.state === 'play') m.win(); return; }
      if (isNew() && !m.marked) { m.fault('dropped worst'); m.worst = cur(); }
      m.k++; m.ct = 0; m.marked = false; if (m.k >= 4) m.end = true;
    };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const sp = SPACE(code); if (!sp && !ENTER(code)) return false;
      if (sp) { if (m.end || m.marked) return true; if (!isNew()) { m.fault('wrong worst'); return true; } m.worst = cur(); m.marked = true; return true; }
      if (!m.end) { m.fault('filed short'); return true; }
      m.ev('filed', { worst: m.worst }); advance(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.ct += dt; if (m.ct >= (m.end ? gap * 3 : gap)) { if (m.end) m.fault('unfiled'); if (m.state === 'play') advance(); } };
    m.hint = () => { if (m.ct < 0.15) return []; if (m.end) return [['Enter', true]]; return isNew() && !m.marked ? [['Space', true]] : []; };
    m.bad = () => (m.end ? null : 'Enter');
    m.view = () => ({ runs: m.runs });
    m.buttons = () => [['Space', 'New worst'], ['Enter', 'File row']];
    m.draw = (c, W, H, P) => {
      if (m.ri >= 3) return; const e = run();
      txt(c, `FIX LOG · RUN ${m.ri + 1} / 3 · fix ${Math.min(4, m.k + 1)} / 4`, 14, 20, { size: 11, col: COL.peri });
      box(c, 14, 30, 170, 70, 'rgba(0,0,0,.3)', COL.peri, 4);
      if (m.end) txt(c, 'END OF RUN', 99, 72, { size: 18, col: COL.gold, align: 'center' }); else txt(c, `${f2(cur())} nm`, 99, 74, { size: 26, col: m.marked ? COL.gold : COL.ink, align: 'center' });
      bar(c, 14, 108, 170, 6, m.ct / (m.end ? gap * 3 : gap), { col: COL.dim });
      box(c, 204, 30, 180, 70, 'rgba(244,194,91,.08)', COL.gold, 4); txt(c, 'WORST this run', 214, 48, { size: 10, col: COL.dim }); txt(c, m.worst ? `${f2(m.worst)} nm` : '—', 214, 80, { size: 22, col: COL.gold });
      txt(c, 'ACCURACY TABLE', 14, 134, { size: 10, col: COL.dim });
      m.filed.forEach((w, i) => txt(c, `Run ${i + 1}: avg ${f2(m.runs[i].reduce((a, b) => a + b, 0) / 4)} · worst ${f2(w)}`, 14 + i * 128, 152, { size: 9, col: P.good }));
      e.slice(0, m.k).forEach((v, i) => txt(c, f2(v), 214 + i * 42, 118, { size: 9, col: COL.dim }));
    };
    return m;
  },
});
