// Transporter tech: verify the pad weight limits and split the cargo batch. The corner weight testers read each pad corner's load against
// the per-corner limit on the placard; the batch arrives stacked unevenly so one corner is over. Re-stack: press a corner's number to lift
// its TOP crate, then another corner's number to set it there (only the top crate of a stack can move). When no corner is over the limit,
// sign the check (Enter). Signing an overloaded pad is a fault, and piling a corner past the tipping load drops the crate back.
import { define, machine, DIG, ENTER, ri, shuffle, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'ttech', label: 'Verify pad weight limits and cargo manifest', type: 'task:cargo_run' },
  title: 'Pad corner load re-stacking', dept: 'operations', host: 'console', tool: 'Pad corner load diagram',
  how: 'Press a corner (1-4) to lift its top crate, then another corner to set it there. When every corner reads under the limit, press Enter to sign.',
  keys: ['1-4 lift top crate / set it down', 'Enter sign the weight check'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'restack corners', input: 'digits+enter', win: 'top crates shifted between pad corners until every corner sits under the placard limit, then signed',
    fail: 'signing while a corner is over its limit, or stacking a corner past the tipping load',
    rule: 'Only the top crate of a stack moves: press its corner, then the corner to drop it on. Watch the four corner readouts against the limit line and press Enter once none is over.' },
  rush: 'Added the manifest weights, saw the total under the placard and signed.',
  captions: { 'signed overloaded': 'overload klaxon', 'tipping load': 'crate scrapes back' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    const ws = Array.from({ length: 8 }, () => ri(r, 6, 18) * 5).sort((a, b) => b - a);
    m.c = [[], [], [], []]; const sum = (i) => m.c[i].reduce((a, b) => a + b, 0);
    for (const w of ws) { let lo = 0; for (let i = 1; i < 4; i++) if (sum(i) < sum(lo)) lo = i; m.c[lo].push(w); }
    m.L = Math.max(...[0, 1, 2, 3].map(sum)) + ri(r, 1, 3) * 5; m.tip = Math.round(m.L * 1.45);
    const T = ri(r, 0, 3), src = shuffle(r, [0, 1, 2, 3].filter(i => i !== T)).slice(0, 2); m.fix = [];
    for (const s of src) { m.c[T].push(m.c[s].pop()); m.fix.unshift([T, s]); }
    m.pick = -1; m.rounds = 0; m.sum = sum;
    const over = () => [0, 1, 2, 3].some(i => sum(i) > m.L);
    m.key = (code, down = true) => {
      const d = DIG(code), en = ENTER(code); if (!(d >= 1 && d <= 4) && !en) return false; if (m.state !== 'play' || !down) return true;
      if (en) { if (over()) m.fault('signed overloaded'); else m.win(); return true; }
      const i = d - 1; if (m.pick < 0) { if (m.c[i].length) m.pick = i; return true; } if (m.pick === i) { m.pick = -1; return true; }
      const w = m.c[m.pick][m.c[m.pick].length - 1]; if (sum(i) + w > m.tip) { m.fault('tipping load'); m.pick = -1; return true; }
      m.c[i].push(m.c[m.pick].pop()); m.pick = -1; if (m.fix.length && m.fix[0][1] === i) m.fix.shift(); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { if (!over()) return [['Enter', true]]; const f = m.fix[0]; if (!f) return []; return [['Digit' + ((m.pick < 0 ? f[0] : f[1]) + 1), true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ c: m.c.map(s => s.slice()), L: m.L });
    m.buttons = () => [1, 2, 3, 4].map(i => ['Digit' + i, 'Corner ' + i]).concat([['Enter', 'Sign']]);
    m.draw = (c, W, H, P) => {
      txt(c, `PLACARD: ${m.L} kg per corner   tipping ${m.tip} kg`, 16, 18, { size: 11, col: COL.pale });
      const pos = [[40, 28], [220, 28], [40, 98], [220, 98]];
      pos.forEach(([x, y], i) => { const s = sum(i), ov = s > m.L, sel = m.pick === i; box(c, x, y, 150, 64, ov ? 'rgba(255,90,72,.12)' : 'rgba(255,255,255,.05)', sel ? COL.peri : ov ? P.bad : null, 6);
        txt(c, `${i + 1}`, x + 8, y + 16, { size: 12, col: COL.dim }); txt(c, `${s} kg${ov ? ' OVER' : ''}`, x + 142, y + 16, { size: 12, col: ov ? P.bad : P.good, align: 'right' });
        m.c[i].forEach((w, j) => { const top = j === m.c[i].length - 1; box(c, x + 8 + j * 34, y + 28, 30, 26, top ? COL.gold : COL.orange, sel && top ? '#fff' : null, 3); txt(c, w, x + 23 + j * 34, y + 46, { size: 10, col: COL.dark, align: 'center' }); }); });
      if (m.pick >= 0) txt(c, `lifting ${m.c[m.pick][m.c[m.pick].length - 1]} kg from corner ${m.pick + 1}: pick a corner`, 200, 166, { size: 10, col: COL.peri, align: 'center' });
    };
    return m;
  },
});
