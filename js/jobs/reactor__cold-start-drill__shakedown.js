// Reactor specialist: cold-start drill. The checklist card gives the restart order; the panel buttons are laid out by bus, not by order, so
// read the card and find each one. Press a stage only once the stage before it has gone green: coolant feed first, then the injector bank,
// then the constrictors one by one (their fields flicker before they hold). Last, hold the output at its first step (Space held) through the
// stability count. A stage out of order, or pressed while the one before is still amber, stops the drill line.
import { define, machine, DIG, SPACE, rf, shuffle, txt, box, lamp, bar, COL } from './kit.js';

export default define({
  job: { billet: 'reactor', label: 'Cold-start drill', type: 'task:shakedown' },
  title: 'Cold-start stage-by-lamp sequence', dept: 'engineering', host: 'console', tool: 'Cold-start panel',
  how: 'Press the panel buttons (1-5) in the order on the checklist card, each only after the stage before it shows a green lamp. Then hold Space through the stability count.',
  keys: ['1-5 press a panel stage', 'Space hold the first output step'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'stage on green', input: 'digits+space-hold', win: 'every restart stage pressed in checklist order after its predecessor lamp went green, then the first output step held through the stability count',
    fail: 'pressing a stage out of checklist order or while the prior lamp is still amber, or letting go of the output hold early',
    rule: 'Find the next checklist stage among the shuffled panel buttons and press its digit only when the previous lamp is a green circle; amber triangle means wait. Finish with Space held until the count fills.' },
  rush: 'Threw every cold-start switch down the panel left to right.',
  captions: { 'out of order': 'drill whistle', 'not green': 'interlock buzz', 'hold dropped': 'output step drops' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, need = m.calm ? 1.6 : 1.8;
    const names = ['Coolant feed valve', 'Injector bank', 'Constrictor A', 'Constrictor B', 'Constrictor C'];
    m.stages = names.map((n, k) => ({ n, k, delay: rf(r, 0.5, k >= 2 ? 1.4 : 1.0), on: -1 }));
    m.lay = shuffle(r, [0, 1, 2, 3, 4]); m.done = 0; m.hold = 0; m.rounds = 6; m.round = 0;
    const green = (k) => k < 0 || (m.stages[k].on >= 0 && m.t - m.stages[k].on >= m.stages[k].delay);
    m.key = (code, down = true) => {
      const d = DIG(code), sp = SPACE(code); if (m.state !== 'play' || (!(d >= 1 && d <= 5) && !sp)) return false;
      if (sp) { if (down && m.done < 5) { m.fault('out of order'); return true; } if (down) m.held.S = true; else { if (m.held.S && m.hold < need) { m.fault('hold dropped'); m.hold = 0; } m.held.S = false; } return true; }
      if (!down) return true; const k = m.lay[d - 1];
      if (k < m.done) return true; if (k !== m.done) { m.fault('out of order'); return true; } if (!green(k - 1)) { m.fault('not green'); return true; }
      m.stages[k].on = m.t; m.done++; m.round = m.done; m.ev('stage', { k }); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.held.S && m.done >= 5 && green(4)) { m.hold += dt; m.round = 6; if (m.hold >= need) m.win(); } };
    m.hint = () => { if (m.done < 5) return green(m.done - 1) ? [['Digit' + (m.lay.indexOf(m.done) + 1), true]] : []; return green(4) ? [['Space', true]] : []; };
    m.bad = () => { const k = Math.min(4, m.done + 1); return k === m.done ? 'Space' : 'Digit' + (m.lay.indexOf(k) + 1); };
    m.view = () => ({ panel: m.lay, d: m.stages.map(s => +s.delay.toFixed(2)) });
    m.buttons = () => [...m.lay.map((k, i) => ['Digit' + (i + 1), String(i + 1)]), ['Space', 'Hold output']];
    m.draw = (c, W, H, P) => {
      txt(c, 'CHECKLIST', 16, 18, { size: 10, col: COL.gold }); names.forEach((n, k) => txt(c, `${k + 1}. ${n}${k < m.done ? '  ✓' : ''}`, 16, 34 + k * 15, { size: 10, col: k < m.done ? COL.dim : k === m.done ? COL.ink : COL.pale }));
      txt(c, '6. Hold first output step', 16, 34 + 5 * 15, { size: 10, col: m.done >= 5 ? COL.ink : COL.pale });
      m.lay.forEach((k, i) => { const x = 180 + (i % 3) * 72, y = 14 + Math.floor(i / 3) * 52, s = m.stages[k], g = green(k), on = s.on >= 0;
        box(c, x, y, 66, 44, COL.panel, on ? (g ? P.good : COL.warn) : COL.dim, 5); txt(c, `[${i + 1}]`, x + 5, y + 14, { size: 10, col: COL.peri });
        txt(c, s.n.replace('Constrictor', 'Constr.').replace('Coolant feed valve', 'Coolant feed'), x + 5, y + 30, { size: 9, col: COL.ink });
        lamp(c, x + 54, y + 12, 7, on ? (g ? P.good : COL.warn) : '#333', on ? (g ? 'circle' : 'triangle') : 'square');
        if (on && !g && k >= 2 && Math.sin(m.t * 30) > 0) txt(c, '~', x + 44, y + 40, { size: 12, col: COL.warn }); });
      txt(c, 'stability', 180, 138, { size: 10, col: COL.dim }); bar(c, 236, 130, 140, 9, m.hold / need, { col: P.good });
      txt(c, m.held.S ? 'HOLDING' : '', 236, 154, { size: 11, col: COL.gold });
    };
    return m;
  },
});
