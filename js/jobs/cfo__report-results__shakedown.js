// CFO: report shakedown results. Each test row shows its gauge value against its pass limit, rounded on the summary sheet. A row whose rounded
// value sits right on the limit is an edge reading: pull the raw figure (↑ adds a decimal place; it takes a moment to come up) until it is
// clearly one side of the limit, then mark the row pass (←) or fail (→). Rows go to the XO as you mark them.
import { define, machine, ARROW, ri, rf, shuffle, txt, box, lamp, COL } from './kit.js';

const TESTS = [['Damper bank 1 load', 'g'], ['Damper bank 2 load', 'g'], ['Turn rate error', '°/s'], ['Thrust at hover', 'MN'], ['Hatch seal leak', 'kPa/min'], ['Inertial lag', 's'], ['Stop distance', 'km']];
export default define({
  job: { billet: 'cfo', label: 'Report results', type: 'task:shakedown' },
  title: 'Edge readings judged at full precision', dept: 'flight', host: 'console', tool: 'Test sheets and pass band table',
  how: 'Mark each test row pass (←) or fail (→) against its limit. If the rounded value sits on the limit, press ↑ to pull another decimal place until it is clearly one side, then mark it.',
  keys: ['← pass', '→ fail', '↑ more precision'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'zoom and judge', input: 'arrows', win: 'every shakedown test row marked pass or fail on its true value, with each edge reading pulled to enough decimals to decide',
    fail: 'marking an edge reading while it still rounds onto the limit, or marking a row on the wrong side of its limit',
    rule: 'Pass means at or under the limit. If the shown value equals the limit at this precision, ↑ and wait for the next decimal; only then ← pass or → fail.' },
  rush: 'Rounded every reading in the crew\'s favour and sent the sheet up.',
  captions: { 'edge glossed': 'XO queries the edge row', 'wrong mark': 'XO rejects the row' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, slow = m.calm ? 0.4 : 0.55;
    const kinds = shuffle(r, ['clear', 'clear', 'edge1', 'edge2', r() < 0.5 ? 'edge1' : 'clear']);
    m.rows = shuffle(r, TESTS).slice(0, 5).map(([n, u], i) => {
      const lim = ri(r, 12, 60) / 10, k = kinds[i], s = r() < 0.5 ? -1 : 1;
      const v = k === 'clear' ? lim + s * rf(r, 0.2, 0.9) : k === 'edge1' ? lim + s * rf(r, 0.012, 0.045) : lim + s * rf(r, 0.0012, 0.0045);
      return { n, u, lim, v: +v.toFixed(4), z: 0, mark: null };
    });
    m.i = 0; m.zt = 0; m.rounds = 5; m.round = 1;
    const shown = (row) => row.v.toFixed(1 + row.z), onEdge = (row) => +shown(row) === row.lim;
    m.shown = shown; m.onEdge = onEdge;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code); if (!a) return false; const row = m.rows[m.i]; if (!row) return true;
      if (a === 'U') { if (m.zt <= 0 && row.z < 3) { m.zt = slow; } return true; } if (a === 'D') return true; if (m.zt > 0) return true;
      const pass = a === 'L'; if (onEdge(row)) { m.fault('edge glossed'); return true; }
      if (pass !== row.v <= row.lim) { m.fault('wrong mark'); return true; }
      row.mark = pass ? 'pass' : 'fail'; m.i++; m.round = Math.min(5, m.i + 1); m.zt = 0; if (m.i >= m.rows.length) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.zt > 0) { m.zt -= dt; if (m.zt <= 0) m.rows[m.i].z++; } };
    m.hint = () => { const row = m.rows[m.i]; if (!row || m.zt > 0) return []; if (onEdge(row)) return [['ArrowUp', true]]; return [[row.v <= row.lim ? 'ArrowLeft' : 'ArrowRight', true]]; };
    m.bad = () => { const row = m.rows[m.i]; if (!row) return null; return row.v <= row.lim ? 'ArrowRight' : 'ArrowLeft'; };
    m.view = () => ({ r: m.rows.map(x => [x.n, x.lim, x.v]) });
    m.buttons = () => [['ArrowLeft', '◀ Pass'], ['ArrowRight', 'Fail ▶'], ['ArrowUp', '▲ Precision']];
    m.draw = (c, W, H, P) => {
      txt(c, 'TEST', 18, 14, { size: 10, col: COL.dim }); txt(c, 'READING', 190, 14, { size: 10, col: COL.dim }); txt(c, 'LIMIT ≤', 270, 14, { size: 10, col: COL.dim });
      m.rows.forEach((row, k) => {
        const y = 20 + k * 29, cur = k === m.i; box(c, 12, y, 376, 25, cur ? COL.panel : null, cur ? COL.gold : null, 5);
        txt(c, row.n, 18, y + 17, { size: 11, col: row.mark ? COL.dim : COL.ink }); txt(c, cur && m.zt > 0 ? 'pulling…' : `${shown(row)} ${row.u}`, 190, y + 17, { size: 12, col: COL.pale });
        txt(c, row.lim.toFixed(1), 270, y + 17, { size: 12, col: COL.pale });
        if (row.mark) { lamp(c, 330, y + 12, 7, row.mark === 'pass' ? P.good : P.bad, row.mark === 'pass' ? 'circle' : 'triangle'); txt(c, row.mark, 342, y + 17, { size: 10 }); }
        else if (onEdge(row)) txt(c, 'EDGE', 330, y + 17, { size: 10, col: COL.warn });
      });
    };
    return m;
  },
});
