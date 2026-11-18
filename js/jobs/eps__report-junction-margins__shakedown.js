// EPS tech: report junction margins (shakedown). The margin form comes up one junction at a time with its rating and its load from the load
// sheet. Work out the headroom to the ninety percent line as a share of the rating: under ten percent goes in the flag box (Space), anything
// else is entered clean (Enter). A weak junction entered clean leaves the bridge unaware; a flag on a healthy one sends a repair crew for nothing.
import { define, machine, SPACE, ENTER, ri, pick, shuffle, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'eps', label: 'Report junction margins', type: 'task:shakedown' },
  title: 'Headroom to the ninety line', dept: 'engineering', host: 'console', tool: 'Junction margin form',
  how: 'For each junction take its load away from 90 % of its rating. If what is left is under a tenth of the rating, flag it (Space); otherwise enter it clean (Enter).',
  keys: ['Space flag', 'Enter clean'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'work the headroom', input: 'space+enter', win: 'five junction rows filed with every one under ten percent headroom flagged and no healthy one flagged',
    fail: 'filing a thin junction clean so the bridge misses it, or flagging a junction that has room',
    rule: 'Row shows rating in amps and load in amps. Headroom is ninety percent of the rating minus the load, compared with one tenth of the rating. Under it: Space. Otherwise: Enter.' },
  rush: 'Filed every junction as fine and sent the form.',
  captions: { 'thin filed clean': 'bridge query chime', 'false flag': 'repair call tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, names = shuffle(r, ['J-4 fwd', 'J-7 aft', 'J-9 port', 'J-12 stbd', 'J-15 lab', 'J-18 cargo', 'J-21 sickbay']);
    const hs = shuffle(r, [ri(r, 2, 8), ri(r, 3, 9), pick(r, [12, 14, 16]), ri(r, 11, 13), ri(r, 15, 28)]);
    m.rows = hs.map((h, k) => { const R = pick(r, [200, 250, 300, 400, 500]), load = Math.round(0.9 * R - h * R / 100), head = (0.9 * R - load) / R * 100; return { n: names[k], R, load, thin: head < 10, done: null }; });
    m.cur = 0; m.rounds = 5; m.round = 1;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const sp = SPACE(code), en = ENTER(code); if (!sp && !en) return false; if (!down) return true;
      const w = m.rows[m.cur]; if (sp !== w.thin) { m.fault(w.thin ? 'thin filed clean' : 'false flag'); return true; }
      w.done = sp ? 'FLAG' : 'ok'; m.cur++; m.round = Math.min(5, m.cur + 1); if (m.cur >= 5) m.win(); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { const w = m.rows[m.cur]; return w && m.t > m.cur * 0.8 + 0.5 ? [[w.thin ? 'Space' : 'Enter', true]] : []; };
    m.bad = () => { const w = m.rows[m.cur]; return w ? (w.thin ? 'Enter' : 'Space') : null; };
    m.view = () => ({ rows: m.rows.map(w => [w.R, w.load]) });
    m.buttons = () => [['Space', 'Flag'], ['Enter', 'Clean']];
    m.draw = (c, W, H, P) => {
      txt(c, 'JUNCTION MARGIN REPORT · to bridge', 12, 16, { size: 11, col: COL.peri });
      txt(c, 'junction', 16, 34, { size: 9, col: COL.dim }); txt(c, 'rating', 150, 34, { size: 9, col: COL.dim, align: 'right' }); txt(c, 'load', 220, 34, { size: 9, col: COL.dim, align: 'right' }); txt(c, 'flag', 300, 34, { size: 9, col: COL.dim, align: 'center' });
      m.rows.forEach((w, k) => {
        const y = 52 + k * 22, on = k === m.cur; if (on) box(c, 10, y - 15, 360, 20, 'rgba(244,194,91,.13)', COL.gold, 4);
        txt(c, w.n, 16, y, { size: 12, col: on ? COL.gold : COL.ink }); txt(c, `${w.R} A`, 150, y, { size: 12, align: 'right' }); txt(c, `${w.load} A`, 220, y, { size: 12, align: 'right' });
        txt(c, w.done == null ? (on ? '?' : '') : w.done === 'FLAG' ? '⚑ FLAG' : '✓ clean', 300, y, { size: 11, align: 'center', col: w.done === 'FLAG' ? P.bad : P.good });
      });
      txt(c, 'headroom = 90 % of rating − load; flag if under 10 % of rating', 12, H - 8, { size: 9, col: COL.dim });
    };
    return m;
  },
});
