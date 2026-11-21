// Galley: plan, cook and serve a meal. The queue slip shows which dish each crewman will want and when they reach the hatch. Each dish has its
// own cook time, so a pot must be fired (digit 1 to 3) cook-time ahead of its order: too early and it overcooks waiting, too late and the crewman
// waits too long. Dishes the stock sheet shows at zero cannot be fired.
import { define, machine, DIG, rf, ri, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'galley', label: 'Plan, cook and serve a meal', type: 'loop' },
  title: 'Fire the pots ahead of the queue', dept: 'services', host: 'console', tool: 'Menu board and queue slip',
  how: 'The queue slip lists dish and arrival time for each crewman. Press 1, 2 or 3 to fire that pot a cook-time before its order arrives, so it comes ready as they reach the hatch.',
  keys: ['1 2 3 fire that dish'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'fire the pots', input: 'digits', win: 'five queued crew each served their dish from a pot fired a cook-time ahead so nobody waits and nothing overcooks',
    fail: 'a pot left ready with nobody to serve it, a crewman kept waiting at the hatch, or firing a dish the stock sheet has run out of',
    rule: 'Each dish cooks for a different time (shown on its pot). Count back from the arrival time on the queue slip and press that dish key then. A pot that is ready serves the next waiting crewman of that dish.' },
  rush: 'Cooked a big pot of one dish and ladled it to whoever came.',
  captions: { overcooked: 'pot boils dry', waited: 'crowd mutters', 'no stock': 'empty-bin thud' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, pat = m.calm ? 8 : 6;
    m.cook = [1.4, 2.0, 2.6].map(c => c + rf(r, -0.2, 0.2)); m.stock = [3, 3, 3]; m.pot = [null, null, null]; m.Q = []; let t = rf(r, 3.5, 4.5);
    for (let k = 0; k < 5; k++) { const d = ri(r, 0, 2); m.Q.push({ d, a: t, done: false }); t += rf(r, 2.8, 3.6); }
    m.Q.forEach((q, k) => { if (m.Q.filter((x, j) => j <= k && x.d === q.d).length > 3) q.d = (q.d + 1) % 3; });
    m.rounds = 5; m.round = 0; m.Dg = [...new Set(m.Q.map(q => q.d))];
    m.key = (code, down = true) => {
      const d = DIG(code) - 1; if (m.state !== 'play' || !down || d < 0 || d > 2) return false;
      if (m.pot[d] !== null) return true; if (m.stock[d] <= 0) { m.fault('no stock'); return true; } m.pot[d] = m.t + m.cook[d]; return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return;
      for (let d = 0; d < 3; d++) { const p = m.pot[d]; if (p === null || m.t < p) continue;
        const q = m.Q.find(x => !x.done && x.d === d && x.a <= m.t);
        if (q) { q.done = true; m.pot[d] = null; m.stock[d]--; m.round++; if (m.round >= 5) m.win(); } else if (m.t > p + 1.5) { m.pot[d] = null; m.fault('overcooked'); } }
      for (const q of m.Q) if (!q.done && m.t > q.a + pat) { q.done = true; m.round++; m.fault('waited'); } };
    m.hint = () => { const out = []; for (let d = 0; d < 3; d++) if (m.pot[d] === null && m.Q.some(q => !q.done && q.d === d && m.t >= q.a - m.cook[d] + 0.3)) out.push(['Digit' + (d + 1), true]); return out; };
    m.bad = () => 'Digit1';
    m.view = () => ({ Q: m.Q.map(q => [q.d, +q.a.toFixed(2)]), cook: m.cook.map(c => +c.toFixed(2)) });
    m.buttons = () => [['Digit1', 'Dish 1'], ['Digit2', 'Dish 2'], ['Digit3', 'Dish 3']];
    m.draw = (c, W, H, P) => {
      for (let d = 0; d < 3; d++) { const x = 16 + d * 70; box(c, x, 12, 62, 70, 'rgba(255,255,255,.06)', m.pot[d] !== null ? COL.gold : COL.dim, 6);
        txt(c, `${d + 1}  stock ${m.stock[d]}`, x + 31, 30, { size: 11, align: 'center' }); txt(c, `${m.cook[d].toFixed(1)} s`, x + 31, 50, { size: 13, col: COL.pale, align: 'center' });
        bar(c, x + 6, 62, 50, 8, m.pot[d] === null ? 0 : Math.min(1, 1 - (m.pot[d] - m.t) / m.cook[d]), { col: m.pot[d] !== null && m.t >= m.pot[d] ? P.good : COL.gold }); }
      txt(c, 'QUEUE SLIP', 250, 22, { size: 11, col: COL.dim }); m.Q.filter(q => !q.done).slice(0, 4).forEach((q, k) => txt(c, `dish ${q.d + 1}  in ${Math.max(0, q.a - m.t).toFixed(1)} s`, 250, 42 + k * 20, { size: 13, col: q.a <= m.t ? COL.warn : COL.ink }));
      txt(c, `served ${m.round} / 5`, 20, 120, { size: 13, col: COL.pale });
    };
    return m;
  },
});
