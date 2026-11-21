// Cook: check the replicator base stock. The paper chart has a red band; five gauge readings are shown. Circle every reading that falls inside
// the red band (digits toggle a circle) and sign off with Enter. Circling a reading outside the band, or missing one inside, is a fault.
import { define, machine, DIG, ENTER, ri, txt, COL } from './kit.js';

export default define({
  job: { billet: 'cook', label: 'Check galley replicator base stock and feed lines', type: 'loop' },
  title: 'Circle the red-band gauge values', dept: 'services', host: 'console', tool: 'Replicator gauge chart',
  how: 'Compare each reading with the red band on the chart. Press its digit to circle every reading inside the band, then press Enter to log the sheet.',
  keys: ['1-5 circle or un-circle a reading', 'Enter log the sheet'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'circle red band', input: 'digits+enter', win: 'three charts logged with exactly the in-band readings circled',
    fail: 'logging a sheet that circles a normal reading or leaves an in-band reading uncircled',
    rule: 'Each chart shows a red band and five readings. Toggle a circle on every reading inside the band with its digit, no others, then Enter logs the sheet.' },
  rush: 'Skimmed the gauge and signed the sheet without circling anything.',
  captions: { 'bad log': 'clipboard rejects entry' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; m.rounds = 3; m.round = 0; m.circ = [0, 0, 0, 0, 0];
    const deal = () => { const lo = ri(r, 30, 55), hi = lo + ri(r, 16, 22); const v = []; const n = ri(r, 1, 2);
      for (let i = 0; i < 5; i++) { let x; do x = ri(r, 10, 95); while (x >= lo - 3 && x <= hi + 3); v.push(x); }
      const idx = [0, 1, 2, 3, 4].sort(() => r() - 0.5).slice(0, n); for (const i of idx) v[i] = ri(r, lo + 2, hi - 2); m.lo = lo; m.hi = hi; m.v = v; m.circ = [0, 0, 0, 0, 0]; };
    deal(); m.want = () => m.v.map(x => x >= m.lo && x <= m.hi ? 1 : 0);
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code);
      if (d >= 1 && d <= 5) { m.circ[d - 1] ^= 1; return true; }
      if (ENTER(code)) { if (m.circ.join() === m.want().join()) { m.round++; if (m.round >= m.rounds) m.win(); else deal(); } else { m.fault('bad log'); m.circ = [0, 0, 0, 0, 0]; } return true; }
      return false;
    };
    m.hint = () => { const w = m.want(), i = w.findIndex((x, k) => x !== m.circ[k]); return i >= 0 ? [['Digit' + (i + 1), true]] : [['Enter', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ lo: m.lo, hi: m.hi, v: m.v.slice() });
    m.buttons = () => [1, 2, 3, 4, 5].map(i => ['Digit' + i, String(i)]).concat([['Enter', 'Log']]);
    m.draw = (c, W, H, P) => {
      c.fillStyle = 'rgba(255,90,70,.28)'; c.fillRect(20, 150 - m.hi * 1.3, 360, (m.hi - m.lo) * 1.3); txt(c, 'RED BAND', 322, 150 - m.hi * 1.3 + 12, { size: 10, col: P.bad });
      m.v.forEach((x, i) => { const bx = 36 + i * 70, h = x * 1.3; c.fillStyle = COL.peri; c.fillRect(bx, 150 - h, 36, h); txt(c, `${i + 1}`, bx + 18, 164, { size: 12, align: 'center' });
        txt(c, x, bx + 18, 146 - h, { size: 11, align: 'center', col: COL.pale }); if (m.circ[i]) { c.strokeStyle = P.good; c.lineWidth = 3; c.strokeRect(bx - 4, 142 - h, 44, 20); } });
      txt(c, `chart ${m.round + 1} / ${m.rounds}`, 20, 14, { size: 11, col: COL.dim });
    };
    return m;
  },
});
