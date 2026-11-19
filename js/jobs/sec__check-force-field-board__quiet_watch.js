// Security, quiet watch: check the force-field board. Every emitter's power line reads comfortably inside spec, so no single number looks
// wrong. The slow failure only shows against yesterday's slate. The console shows today's lines; hold Space to flip to yesterday's slate
// (which hides today's). Compare from memory, mark each emitter that has drifted down (its digit toggles the mark) and log the list (Enter).
import { define, machine, DIG, SPACE, ENTER, rf, ri, shuffle, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'sec', label: 'Check force-field board', type: 'task:quiet_watch' },
  title: 'Overnight drift against the slate', dept: 'security', host: 'console', tool: 'Brig force-field summary',
  how: 'Today\'s emitter power is on the board; hold Space to flip to yesterday\'s slate. Mark (1-6) each emitter that has dropped by a point or more since yesterday, then log (Enter).',
  keys: ['Space hold flip to yesterday', '1-6 mark / unmark drift', 'Enter log'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'flip the slate', input: 'digits+space-hold+enter', win: 'every emitter that sank a point or more since yesterday marked from memory and the drift list logged',
    fail: 'logging the board with a slow drift unmarked, or marking an emitter that only wobbled a fraction',
    rule: 'Only one page shows at a time: today on the board, yesterday while Space is held. Remember the pairs; a drop of 1.0 or more is drift, a wobble under 0.4 is not.' },
  rush: 'Saw every line was in spec and logged the board as steady.',
  captions: { 'wrong log': 'deputy returns the log' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, nd = ri(r, 1, 3), drift = new Set(shuffle(r, [0, 1, 2, 3, 4, 5]).slice(0, nd));
    m.em = [0, 1, 2, 3, 4, 5].map(i => { const y = +rf(r, 91, 98).toFixed(1), d = drift.has(i) ? rf(r, 1.1, 2.6) : rf(r, -0.35, 0.35); return { y, t: +(y - d).toFixed(1), drift: drift.has(i), mark: false }; });
    m.flip = false; m.flipT = 0;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false;
      if (SPACE(code)) { m.flip = !!down; return true; }
      if (!down) return false; const n = DIG(code);
      if (n >= 1 && n <= 6) { m.em[n - 1].mark = !m.em[n - 1].mark; return true; }
      if (ENTER(code)) { const bad = m.em.filter(e => e.mark !== e.drift).length; if (bad) m.fault('wrong log'); else m.win(); return true; }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.flip) m.flipT += dt; };
    m.hint = () => { if (m.flipT < 0.8) return [['Space', true]]; if (m.flip) return [['Space', false]];
      const k = m.em.findIndex(e => e.mark !== e.drift); return k >= 0 ? [['Digit' + (k + 1), true]] : [['Enter', true]]; };
    m.bad = () => (m.t > 0.3 && Math.floor(m.t * 30) % 10 === 0 ? 'Enter' : null);
    m.view = () => ({ em: m.em.map(e => [e.y, e.t]) });
    m.buttons = () => [['Space', 'Hold: yesterday'], ...m.em.map((_, i) => ['Digit' + (i + 1), String(i + 1)]), ['Enter', 'Log']];
    m.draw = (c, W, H, P) => {
      box(c, 14, 8, 372, 22, m.flip ? 'rgba(185,155,230,.25)' : 'rgba(125,151,232,.18)', null, 5);
      txt(c, m.flip ? 'YESTERDAY\'S SLATE (paper)' : 'TODAY — force-field summary', 22, 24, { size: 12, col: m.flip ? COL.lav : COL.peri });
      m.em.forEach((e, i) => { const y = 48 + i * 19;
        txt(c, `${i + 1}  Emitter ${String.fromCharCode(65 + i)}`, 24, y, { size: 12, col: COL.ink });
        txt(c, `${(m.flip ? e.y : e.t).toFixed(1)} %`, 210, y, { size: 13, col: m.flip ? COL.lav : COL.gold, align: 'right' });
        txt(c, 'in spec', 230, y, { size: 10, col: COL.dim });
        if (e.mark) { box(c, 300, y - 12, 76, 16, null, P.bad, 4); txt(c, '▼ DRIFT', 338, y, { size: 10, col: P.bad, align: 'center' }); } });
    };
    return m;
  },
});
