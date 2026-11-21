// Cook: ordinary meal, keep the line moving. Two pots on one hot plate row, one spoon. Hold Left to stir the stew, hold Right to stir the rice;
// only one at a time. Whichever pot goes unstirred catches. Both pots must cook through without either burning at the bottom.
import { define, machine, ARROW, rf, txt, bar, COL } from './kit.js';

export default define({
  job: { billet: 'cook', label: 'Cook the ordinary meal and keep the line moving', type: 'task:quiet_watch' },
  title: 'One spoon, two pots', dept: 'services', host: 'console', tool: 'Hot plate and two pots',
  how: 'Hold Left to stir the stew pot or Right to stir the rice pot. You have one spoon, so give each pot its turn before its base catches.',
  keys: ['Left hold: stir stew', 'Right hold: stir rice'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'juggle two pots', input: 'arrows-hold', win: 'both pots cooked through with neither base burned while one spoon moved between them',
    fail: 'leaving a pot unstirred until its base burns, three times',
    rule: 'Each pot heats its base at its own pace. Hold Left to stir pot A, Right to stir pot B; the spoon is only in one at a time. A base at full is a burnt pot.' },
  rush: 'Turned both plates up high and left the stew to look after itself.',
  captions: { burnt: 'scorched smell alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; m.pots = [0, 1].map(() => ({ s: rf(r, 0.1, 0.35), heat: rf(r, 0.09, 0.14), done: 0 }));
    m.tick = (dt) => {
      if (!m.live(dt)) return; const L = !!m.held.L, R = !!m.held.R;
      m.pots.forEach((p, i) => { const stir = (i === 0 ? L && !R : R && !L); p.s = Math.max(0, p.s + dt * (stir ? -0.45 : p.heat)); p.done = Math.min(1, p.done + dt / 13);
        if (p.s >= 1) { p.s = 0.45; p.done = 0; m.fault('burnt'); } });
      if (m.pots.every(p => p.done >= 1)) m.win();
    };
    m.key = (code, down = true) => { const a = ARROW(code); if (a === 'L' || a === 'R') { m.held[a] = down; return true; } return false; };
    m.hint = () => { const a = m.pots[0].s >= m.pots[1].s; return [['ArrowLeft', a && m.pots[0].s > 0.3], ['ArrowRight', !a && m.pots[1].s > 0.3]]; };
    m.bad = () => ['ArrowLeft', true];
    m.view = () => ({ heat: m.pots.map(p => +p.heat.toFixed(3)) });
    m.buttons = () => [['ArrowLeft', 'Stew'], ['ArrowRight', 'Rice']];
    m.draw = (c, W, H, P) => m.pots.forEach((p, i) => { const x = 24 + i * 190;
      txt(c, i ? 'RICE (Right)' : 'STEW (Left)', x, 26, { size: 12, col: COL.pale }); bar(c, x, 36, 160, 12, p.s, { col: p.s > 0.7 ? P.bad : COL.gold }); txt(c, 'base', x, 64, { size: 10, col: COL.dim });
      bar(c, x, 74, 160, 10, p.done, { col: COL.peri }); txt(c, 'cooked', x, 98, { size: 10, col: COL.dim }); txt(c, (i ? m.held.R : m.held.L) ? 'stirring' : '', x, 122, { size: 14, col: P.good }); });
    return m;
  },
});
