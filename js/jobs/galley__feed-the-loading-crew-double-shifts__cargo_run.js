// Galley: feed the loading crew on double shifts. The line forms at the hatch; each loader wants a small, regular or large bowl. Hold Space to
// ladle and let go on their portion line. The counter pot runs down: refill it (2) between servings, never mid-ladle. Nobody waits too long.
import { define, machine, DIG, SPACE, rf, pick, txt, box, bar, COL } from './kit.js';

const SIZE = { S: [0.25, 0.4, 'small'], M: [0.45, 0.6, 'regular'], L: [0.65, 0.8, 'large'] }, WHO = ['Rao', 'Holt', 'Kaur', 'Voss', 'Esk', 'Tamm', 'Nakai', 'Brandt', 'Falk', 'Wren', 'Cho', 'Ueda'];
export default define({
  job: { billet: 'galley', label: 'Feed the loading crew double shifts', type: 'task:cargo_run' },
  title: 'Hatch line ladling', dept: 'services', host: 'console', tool: 'Serving hatch, ladle and pot',
  how: 'Serve the loaders at the hatch: hold Space to ladle and let go on the portion line they asked for; refill the counter pot (2) between bowls before it runs dry.',
  keys: ['Space hold: ladle', '2 refill the pot'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'serve the line', input: 'space-hold+digits', win: 'eight loaders served the portion they asked for before anyone gives up waiting',
    fail: 'slopping over or short-serving a bowl, running the pot dry mid-ladle, or leaving someone waiting too long',
    rule: 'Holding Space fills the bowl; release inside the asked-for band (small, regular, large). Each bowl takes stock from the pot: press 2 to refill it (1.5 s, no serving meanwhile). A loader who waits over seven seconds walks off.' },
  rush: 'Slopped the same scoop into every bowl and let them help themselves.',
  captions: { 'slopped over': 'soup slops', 'short portion': 'loader grumbles', 'pot ran dry': 'ladle scrapes', 'walked off': 'hatch bell' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, rate = m.calm ? 0.42 : 0.55, patience = m.calm ? 10 : 7;
    m.q = []; let t = 0.3; for (let k = 0; k < 8; k++) { m.q.push({ who: pick(r, WHO), want: pick(r, ['S', 'M', 'L']), at: t, served: 0 }); t += rf(r, 1.3, 2.1); }
    m.fill = 0; m.pot = 1; m.refill = 0; m.n = 0; m.rounds = 8; m.round = 0;
    const cur = () => m.q.find(p => !p.served && p.at <= m.t);
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false;
      if (DIG(code) === 2) { if (down && !m.refill && !m.held.S) m.refill = 1.5; return true; }
      if (!SPACE(code)) return false; const was = m.held.S; m.held.S = down && !m.refill;
      if (was && !down) { const p = cur(); if (p && m.fill > 0.05) { const [a, b] = SIZE[p.want]; if (m.fill > b) m.fault('slopped over'); else if (m.fill < a) m.fault('short portion'); else { p.served = 1; m.n++; m.round++; if (m.n >= 8) m.win(); } m.pot -= m.fill * 0.5; } m.fill = 0; }
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return;
      if (m.refill) { m.refill = Math.max(0, m.refill - dt); if (!m.refill) m.pot = 1; }
      if (m.held.S && cur()) { m.fill += rate * dt; if (m.pot - m.fill * 0.5 <= 0) { m.fault('pot ran dry'); m.fill = 0; m.held.S = false; } }
      for (const p of m.q) if (!p.served && m.t - p.at > patience) { p.served = 2; m.fault('walked off'); m.n++; if (m.n >= 8 && m.state === 'play') m.win(); }
    };
    m.hint = () => {
      const p = cur(); if (m.refill) return [['Space', false]]; if (!p) return m.pot < 0.6 ? [['Digit2', true]] : [['Space', false]];
      const [a, b] = SIZE[p.want], mid = (a + b) / 2; if (!m.held.S && m.pot - mid * 0.5 < 0.05) return [['Digit2', true]];
      return [['Space', m.fill < mid]];
    };
    m.bad = () => (m.held.S ? null : 'Space');
    m.view = () => ({ q: m.q.map(p => [p.who, p.want, +p.at.toFixed(2)]) });
    m.buttons = () => [['Space', 'Ladle (hold)'], ['Digit2', '2 Refill pot']];
    m.draw = (c, W, H, P) => {
      const p = cur(); m.q.filter(x => !x.served && x.at <= m.t).slice(0, 5).forEach((x, i) => { box(c, 10 + i * 52, 12, 46, 40, i ? 'rgba(255,255,255,.05)' : 'rgba(240,147,58,.25)', i ? null : COL.orange, 8); txt(c, x.who, 33 + i * 52, 28, { size: 9, align: 'center' }); txt(c, SIZE[x.want][2], 33 + i * 52, 44, { size: 9, align: 'center', col: COL.gold }); });
      const [a, b] = p ? SIZE[p.want] : [0, 0]; txt(c, 'BOWL', 14, 76, { size: 10, col: COL.dim }); bar(c, 14, 82, 260, 16, m.fill, { band: p ? [a, b] : null, col: COL.gold });
      txt(c, 'POT', 14, 118, { size: 10, col: COL.dim }); bar(c, 14, 124, 260, 10, m.pot, { col: m.pot < 0.3 ? COL.warn : COL.peri }); if (m.refill) txt(c, 'refilling…', 280, 133, { size: 10, col: COL.warn });
      txt(c, `served ${m.q.filter(x => x.served === 1).length} / 8`, W - 12, H - 12, { size: 12, align: 'right', col: COL.pale });
    };
    return m;
  },
});
