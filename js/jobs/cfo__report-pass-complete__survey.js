// CFO: report pass complete. The survey log scrolls target by target past the read bar. For each line compare the recorded sweeps with the
// plan and check the return quality against the 70 % floor: → matches a clean line, ← flags a line with a missing sweep or a poor return.
// Every line must be matched or flagged while it is on the bar; a line that slips past unmarked is glossed over in the report to science.
import { define, machine, ARROW, ri, shuffle, txt, box, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'cfo', label: 'Report pass complete', type: 'task:survey' },
  title: 'Survey log match or flag', dept: 'flight', host: 'console', tool: 'Bridge comms panel survey log',
  how: 'As each target line reaches the read bar, → if its sweeps match the plan and its return is 70 % or better, ← to flag a missing sweep or a poor return. Do not let a line pass unmarked.',
  keys: ['→ matched', '← flag'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'match or flag', input: 'arrows', win: 'every target line in the scrolling survey log matched or flagged on the read bar so science gets an honest pass summary',
    fail: 'matching a line with a missing sweep or a sub-floor return, flagging a clean one, or letting a line scroll past unmarked',
    rule: 'Lines scroll up one by one. On the bar: sweeps equal to plan and quality 70 % or more means →; fewer sweeps or quality under 70 % means ←.' },
  rush: 'Sent science a clean report straight off the sweep counter.',
  captions: { 'gap hidden': 'science flags the gap', 'false flag': 'needless re-fly logged', glossed: 'line scrolls by' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, per = m.calm ? 2.2 : 1.7, n = 8;
    const kinds = shuffle(r, ['ok', 'ok', 'ok', 'ok', 'miss', 'poor', ...shuffle(r, ['miss', 'poor', 'ok']).slice(0, 2)]);
    m.lines = kinds.map((k, i) => { const plan = ri(r, 2, 5); return { name: `Target ${String.fromCharCode(65 + i)}-${ri(r, 10, 99)}`, plan, got: k === 'miss' ? plan - ri(r, 1, Math.min(2, plan - 1)) : plan, q: k === 'poor' ? ri(r, 55, 69) : ri(r, 70, 96), bad: k !== 'ok', mark: null }; });
    m.rounds = n; m.round = 1;
    m.idx = () => Math.floor((m.t - 0.8) / per); const cur = () => { const i = m.idx(); return i >= 0 && i < n ? m.lines[i] : null; };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code); if (a !== 'L' && a !== 'R') return !!a; const l = cur(); if (!l || l.mark) return true;
      l.mark = a === 'L' ? 'flag' : 'match'; if (a === 'R' && l.bad) m.fault('gap hidden'); else if (a === 'L' && !l.bad) m.fault('false flag'); return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const i = m.idx(); m.round = Math.max(1, Math.min(n, i + 1));
      for (let k = 0; k < Math.min(i, n); k++) { const l = m.lines[k]; if (!l.mark) { l.mark = 'glossed'; m.fault('glossed'); } }
      if (i >= n && m.state === 'play') m.win();
    };
    m.hint = () => { const l = cur(); if (!l || l.mark || (m.t - 0.8) % per < 0.3) return []; return [[l.bad ? 'ArrowLeft' : 'ArrowRight', true]]; };
    m.bad = () => cur() && !cur().mark ? 'ArrowRight' : null;
    m.view = () => ({ l: m.lines.map(l => [l.plan, l.got, l.q]) });
    m.buttons = () => [['ArrowLeft', '◀ Flag'], ['ArrowRight', 'Match ▶']];
    m.draw = (c, W, H, P) => {
      const f = (m.t - 0.8) / per, yBar = 70; box(c, 10, yBar - 2, 380, 26, null, COL.gold, 5); txt(c, 'READ BAR', 330, yBar - 6, { size: 9, col: COL.gold });
      txt(c, 'TARGET', 20, 14, { size: 10, col: COL.dim }); txt(c, 'SWEEPS', 150, 14, { size: 10, col: COL.dim }); txt(c, 'RETURN', 240, 14, { size: 10, col: COL.dim });
      m.lines.forEach((l, k) => {
        const y = yBar + (k - f) * 28 + 16; if (y < 26 || y > 168) return; txt(c, l.name, 20, y, { size: 12 });
        txt(c, `${l.got} / ${l.plan}`, 150, y, { size: 12, col: COL.pale }); txt(c, `${l.q} %`, 240, y, { size: 12, col: COL.pale });
        if (l.mark) { const good = l.mark === 'flag' ? l.bad : l.mark === 'match' ? !l.bad : false; lamp(c, 315, y - 4, 7, good ? P.good : P.bad, good ? 'circle' : 'triangle'); txt(c, l.mark, 328, y, { size: 10, col: COL.dim }); }
      });
    };
    return m;
  },
});
