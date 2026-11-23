// Holodeck tech: limit sessions to low-power programs so sensors keep power. The program breaker panel is a three by three grid; a lit breaker means
// that program is running. The breakers are cross-wired: flipping one (press its number 1-9) also flips the ones directly above, below and beside it.
// The survey allowance is a pattern, shown beside the panel, of exactly which programs may be running. Reach that pattern in as few flips as you can.
import { define, machine, DIG, ri, shuffle, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'holo', label: 'Limit sessions to low-power programs so sensors keep power', type: 'task:survey' },
  title: 'Cross-wired breaker panel', dept: 'services', host: 'console', tool: 'Program breaker panel',
  how: 'Flipping a breaker (1-9) also flips its neighbours up, down, left and right. Match the allowed pattern shown beside the panel with a few flips; wasting flips draws sensor power.',
  keys: ['1-9 flip that breaker and its neighbours'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'flip breakers', input: 'digits',
    win: 'the cross-wired breaker panel flipped into the allowed power pattern within a small flip budget',
    fail: 'burning the flip budget so the sensors starve, flipping breakers that do not lead to the pattern',
    rule: 'Each flip toggles that breaker and the four beside it. Work out which flips turn the start into the allowed pattern; pressing a number twice undoes it. Flips beyond the budget are faults.' },
  rush: 'Switched every program on and let the sensors fend for themselves.',
  captions: { wasted: 'wasted flip: sensors dim' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, flip = (g, i) => { const x = i % 3, y = Math.floor(i / 3); for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = x + dx, b = y + dy; if (a >= 0 && a < 3 && b >= 0 && b < 3) g[b * 3 + a] ^= 1; } };
    let tgt, g, sol; do { tgt = Array.from({ length: 9 }, () => (r() < 0.45 ? 1 : 0)); g = tgt.slice(); sol = shuffle(r, [0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, ri(r, 3, 4)); for (const i of sol) flip(g, i); } while (g.join('') === tgt.join('') || tgt.every(x => !x));
    m.g = g; m.tgt = tgt; m.need = new Set(sol); m.flips = 0; m.budget = sol.length + 3; m.rounds = m.budget;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code); if (d < 1 || d > 9) return false; if (!down) return true; flip(m.g, d - 1); m.flips++; m.round = m.flips; if (m.need.has(d - 1)) m.need.delete(d - 1); else m.need.add(d - 1);
      if (m.g.join('') === m.tgt.join('')) { m.win(); return true; } if (m.flips > m.budget) m.fault('wasted'); return true;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => (m.state === 'play' && m.need.size ? [['Digit' + ([...m.need][0] + 1), true]] : []);
    m.bad = () => 'Digit1';
    m.view = () => ({ g: m.g.join(''), t: m.tgt.join('') });
    m.buttons = () => Array.from({ length: 9 }, (_, i) => ['Digit' + (i + 1), String(i + 1)]);
    m.draw = (c, W, H, P) => {
      txt(c, 'BREAKERS', 40, 14, { size: 9, col: COL.dim }); txt(c, 'ALLOWED', 270, 14, { size: 9, col: COL.dim });
      for (let i = 0; i < 9; i++) { const x = 20 + (i % 3) * 54, y = 20 + Math.floor(i / 3) * 44, on = m.g[i]; box(c, x, y, 48, 38, on ? '#6a5a22' : COL.panel, on === m.tgt[i] ? P.good : COL.dim, 5); txt(c, `${i + 1}`, x + 24, y + 24, { size: 14, align: 'center', col: on ? COL.gold : COL.dim });
        const X = 250 + (i % 3) * 36, Y = 20 + Math.floor(i / 3) * 34; box(c, X, Y, 32, 30, m.tgt[i] ? '#6a5a22' : COL.panel, COL.dim, 4); }
      txt(c, `flips ${m.flips} / ${m.budget}`, 200, 164, { size: 10, align: 'center', col: m.flips > m.budget ? P.bad : COL.dim });
    };
    return m;
  },
});
