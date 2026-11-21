// Cargo: move returned specimen cases to the lab. Every case has a temperature strip that creeps up on the trolley. Press a case's digit to move
// it to lab intake while it still reads cool. A strip at or over 8 C means spoiled: hold Space and press its digit to flag it for the lab tech.
// A cool strip that creeps over 8 C before you move it spoils too.
import { define, machine, DIG, SPACE, ri, shuffle, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'cargo', label: 'Move returned specimen cases to the lab', type: 'task:survey' },
  title: 'Cool cases to intake, warm flagged', dept: 'services', host: 'console', tool: 'Temperature strips and lab intake',
  how: 'Read each strip. Cool (under 8 C): press its digit to move it to intake before it warms. Warm: hold Space and press its digit to flag it. Handle all four.',
  keys: ['1-4 move case to intake', 'Space+digit flag warm case'], limit: 26, maxFaults: 3,
  fingerprint: { verb: 'move or flag', input: 'digits+space-hold',
    win: 'every case either moved to lab intake while cool or flagged to the lab tech when its strip reads warm',
    fail: 'moving a warm case as good, flagging a cool one, or letting a cool strip creep over the limit unmoved',
    rule: 'Strips creep upward over time. Press a case digit to move a case under 8 C. Hold Space while pressing the digit to flag a case at or over 8 C. Waiting too long spoils a cool case.' },
  rush: 'Wheeled the whole trolley to the lab without reading the strips.',
  captions: { spoiled: 'spoilage alarm', 'false flag': 'flag rejected', warmed: 'strip turns warm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, nw = ri(r, 1, 2), warm = shuffle(r, [0, 1, 2, 3]).slice(0, nw), rate = 0.3, slack = m.calm ? 1.5 : 0;
    m.cs = [0, 1, 2, 3].map(k => { const w = warm.includes(k), tc = ri(r, 5, 13) + slack + k * 0; return { w, done: false, t0: w ? 8 + ri(r, 1, 30) / 10 : 8 - rate * tc, tc, crossed: w }; });
    m.rounds = 4; m.round = 0; const temp = (c) => c.t0 + rate * (m.t * (c.w ? 0.1 : 1));
    const mark = (c) => { c.done = true; m.round++; if (m.cs.every(x => x.done)) m.win(); };
    m.key = (code, down = true) => {
      if (SPACE(code)) { if (m.state !== 'play') return false; m.held.S = down; return true; } const d = DIG(code);
      if (m.state !== 'play' || !down || d < 1 || d > 4) return false; const c = m.cs[d - 1]; if (c.done) return true;
      const hot = temp(c) >= 8; if (m.held.S) { if (!hot) m.fault('false flag'); else mark(c); } else if (hot) m.fault('spoiled'); else mark(c); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; for (const c of m.cs) if (!c.done && !c.w && !c.crossed && temp(c) >= 8) { c.crossed = true; c.w = true; m.fault('warmed'); } };
    m.hint = () => {
      let best = -1, bt = -1; m.cs.forEach((c, k) => { if (!c.done && temp(c) > bt) { bt = temp(c); best = k; } }); if (best < 0) return [];
      return [['Space', temp(m.cs[best]) >= 8], ['Digit' + (best + 1), true]];
    };
    m.bad = () => { m.held.S = false; const k = m.cs.findIndex(c => !c.done && temp(c) >= 8); return k >= 0 ? 'Digit' + (k + 1) : null; };
    m.view = () => ({ cases: m.cs.map(c => [+c.t0.toFixed(1), c.tc, c.w]) });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['Space', 'Flag (hold)']];
    m.draw = (c, W, H, P) => {
      txt(c, 'RETURNED CASES   limit 8.0 C', 12, 18, { size: 11, col: COL.peri });
      m.cs.forEach((k, i) => { const x = 14 + i * 96, t = temp(k), hot = t >= 8; box(c, x, 30, 88, 100, k.done ? 'rgba(255,255,255,.02)' : 'rgba(255,255,255,.07)', hot ? P.bad : COL.dim, 6);
        txt(c, String(i + 1), x + 10, 52, { size: 16 }); txt(c, t.toFixed(1) + ' C', x + 44, 76, { size: 14, col: hot ? P.bad : COL.ink, align: 'center' }); txt(c, k.done ? 'handled' : hot ? 'WARM' : 'cool', x + 44, 112, { size: 11, align: 'center', col: hot ? P.bad : P.good }); });
      txt(c, m.held.S ? 'FLAG mode: press a digit' : 'MOVE mode', W / 2, H - 8, { size: 11, col: COL.pale, align: 'center' });
    };
    return m;
  },
});
