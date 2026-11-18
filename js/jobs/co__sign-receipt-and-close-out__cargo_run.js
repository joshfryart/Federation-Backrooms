// Captain: sign receipt and close out. Go down the receipt row by row against the bay tally: → passes a row whose received count matches,
// ← marks a short row in red, which calls the quartermaster for an explanation. When every row is judged and every short has its answer,
// pick the commanding officer's line (↑ ↓) and press firmly (hold Space) until the ink registers. A misjudged row, signing on the wrong
// line, signing before the quartermaster has answered, or lifting the stylus before the ink registers is a fault.
import { define, machine, ARROW, SPACE, ri, shuffle, txt, box, bar, COL } from './kit.js';

const ITEMS = ['Medical stores', 'Ration packs', 'Spare isolinear chips', 'Coolant canisters', 'Dermal regenerators', 'Field rations', 'Thermal blankets', 'Water casks'];
const LINES = ['Delivered by: station master', 'Received: commanding officer', 'Witness: quartermaster'];

export default define({
  job: { billet: 'co', label: 'Sign receipt and close out', type: 'task:cargo_run' },
  title: 'Receipt reconcile and countersign', dept: 'command', host: 'console', tool: 'Receipt form, tally card and stylus',
  how: 'Compare each receipt row with the bay tally, mark the short ones for the quartermaster, then press firmly on your own signature line once every short is explained.',
  keys: ['→ row matches', '← mark short', '↑ ↓ signature line', 'Space hold: sign'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'reconcile and countersign', input: 'arrows+space-hold', win: 'every receipt row judged against the tally, each short explained by the quartermaster, then a full-pressure signature on the commanding officer line',
    fail: 'passing a short row or marking a full one, signing on the wrong line or before shortages are explained, or lifting the stylus too soon',
    rule: 'For each row compare received with the tally: → if equal, ← if short. Wait until the quartermaster has answered every red mark, choose the CO line with ↑ ↓, then hold Space until the ink bar fills.' },
  rush: 'Signed the receipt at the bottom without reading the counts.',
  captions: { 'passed a short': 'quartermaster coughs', 'false short': 'quartermaster: "that one is all there"', 'wrong line': 'stylus skids', 'unexplained short': 'red ink still wet', smudged: 'signature smudges' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, ink = m.calm ? 1.0 : 1.2, qm = m.calm ? 0.9 : 1.2, its = shuffle(r, ITEMS).slice(0, 5), sh = new Set(shuffle(r, [0, 1, 2, 3, 4]).slice(0, ri(r, 1, 3)));
    m.rows = its.map((it, i) => { const tally = ri(r, 8, 60); return { it, tally, got: sh.has(i) ? tally - ri(r, 1, 4) : tally, short: sh.has(i), mark: 0, ans: null, at: 0 }; });
    m.ri = 0; m.line = ri(r, 0, 2) === 1 ? 0 : 2; m.ink = 0; m.rounds = 6; m.round = 0;
    const pending = () => m.rows.some(w => w.short && !w.ans);
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (SPACE(code)) {
        const was = m.held.S; m.held.S = down; if (m.ri < 5) return true;
        if (!was && down) { if (m.line !== 1) { m.fault('wrong line'); m.held.S = false; } else if (pending()) { m.fault('unexplained short'); m.held.S = false; } m.ink = 0; }
        if (was && !down && m.ink > 0 && m.ink < 1) { m.fault('smudged'); m.ink = 0; }
        return true;
      }
      if (!down || !a) return false;
      if (m.ri < 5 && (a === 'L' || a === 'R')) {
        const w = m.rows[m.ri]; if (a === 'R' && w.short) { m.fault('passed a short'); return true; } if (a === 'L' && !w.short) { m.fault('false short'); return true; }
        if (a === 'L') { w.mark = 1; w.at = m.t; } m.ri++; m.round++; return true;
      }
      if (m.ri >= 5 && (a === 'U' || a === 'D')) { m.line = (m.line + (a === 'D' ? 1 : 2)) % 3; return true; }
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; for (const w of m.rows) if (w.mark && !w.ans && m.t - w.at >= qm) w.ans = r() < 0.5 ? 'late item, next run' : 'logged as transit loss';
      if (m.held.S && m.ri >= 5 && m.line === 1 && !pending()) { m.ink += dt / ink; if (m.ink >= 1) { m.round = 6; m.win(); } }
    };
    m.hint = () => {
      if (m.ri < 5) return [[m.rows[m.ri].short ? 'ArrowLeft' : 'ArrowRight', true]];
      if (pending()) return []; if (m.line !== 1) return [['ArrowDown', true]]; return [['Space', true]];
    };
    m.bad = () => m.ri < 5 ? (m.rows[m.ri].short ? 'ArrowRight' : 'ArrowLeft') : m.held.S ? ['Space', false] : ['Space', true];
    m.view = () => ({ rows: m.rows.map(w => [w.it, w.tally, w.got]), line: m.line });
    m.buttons = () => [['ArrowLeft', '◀ Short'], ['ArrowRight', 'Matches ▶'], ['ArrowUp', '▲ Line'], ['ArrowDown', '▼ Line'], ['Space', 'Hold: sign']];
    m.draw = (c, W, H, P) => {
      txt(c, 'item', 12, 12, { size: 9, col: COL.dim }); txt(c, 'tally', 170, 12, { size: 9, col: COL.dim }); txt(c, 'received', 210, 12, { size: 9, col: COL.dim });
      m.rows.forEach((w, i) => {
        const y = 16 + i * 18, on = i === m.ri; box(c, 6, y, W - 12, 16, on ? 'rgba(240,147,58,.2)' : 'rgba(255,255,255,.04)', on ? COL.orange : null, 6);
        txt(c, w.it, 12, y + 12, { size: 10 }); txt(c, w.tally, 170, y + 12, { size: 10 }); txt(c, w.got, 214, y + 12, { size: 10, col: w.mark ? P.bad : COL.ink });
        if (i < m.ri) txt(c, w.mark ? (w.ans ? `✗ QM: ${w.ans}` : '✗ short — QM calling…') : '✓', W - 12, y + 12, { size: 9, col: w.mark ? COL.warn : P.good, align: 'right' });
      });
      LINES.forEach((l, j) => { const y = 112 + j * 16, on = m.ri >= 5 && j === m.line; txt(c, (on ? '▶ ' : '  ') + l, 12, y, { size: 10, col: on ? COL.pale : COL.dim }); c.fillStyle = COL.dim; c.fillRect(200, y + 2, 120, 1); });
      bar(c, 330, 120, 60, 10, m.ink, { col: COL.peri }); txt(c, 'ink', 330, 144, { size: 9, col: COL.dim });
    };
    return m;
  },
});
