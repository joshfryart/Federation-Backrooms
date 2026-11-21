// Galley: sanitise the galley against contamination. Work the surfaces in order from clean to dirty. Space sprays the current section; the
// sanitiser must then sit for its dwell time (the ring fills and the lamp goes green) before Enter wipes it. Wiping early cuts the contact time
// short and leaves the surface unsafe; leaving it too long lets the spray dry out. Four sections.
import { define, machine, SPACE, ENTER, rf, txt, box, bar, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'galley', label: 'Sanitise the galley against contamination', type: 'task:medical_relief' },
  title: 'Spray, dwell and wipe in order', dept: 'services', host: 'console', tool: 'Sanitiser spray and cloths',
  how: 'Press Space to spray the lit section. Wait until its dwell ring is full and the lamp turns green, then press Enter to wipe it. Do not wipe early and do not leave it to dry.',
  keys: ['Space spray the section', 'Enter wipe it once green'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'spray, dwell, wipe', input: 'space+enter', win: 'four counter sections each sprayed, left for the full sanitiser dwell time and then wiped before the spray dried',
    fail: 'wiping a section before its dwell time is up, or leaving a sprayed section so long that the sanitiser dries',
    rule: 'Space sprays the current section and starts its dwell ring. Enter only when the ring is full and the lamp is green, and within a few seconds after, or the spray dries and must be redone.' },
  rush: 'Wiped everything over in one pass while the spray was still wet.',
  captions: { 'wiped early': 'cloth squeak', 'dried on': 'faint hiss' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, dw = rf(r, 2.2, 2.8) * (m.calm ? 0.85 : 1), keep = dw + (m.calm ? 5 : 3.5);
    m.names = ['Prep counter', 'Hot shelf rail', 'Tap heads', 'Floor edge']; m.i = 0; m.sp = -1; m.rounds = 4; m.round = 0; m.dw = dw;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false;
      if (SPACE(code)) { if (m.sp < 0) m.sp = 0; return true; }
      if (!ENTER(code)) return false; if (m.sp < 0 || m.sp < dw) { m.fault('wiped early'); m.sp = -1; return true; }
      m.i++; m.round++; m.sp = -1; if (m.i >= 4) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.sp >= 0) { m.sp += dt; if (m.sp > keep) { m.fault('dried on'); m.sp = -1; } } };
    m.hint = () => (m.sp < 0 ? [['Space', true]] : m.sp >= dw + 0.1 ? [['Enter', true]] : []);
    m.bad = () => 'Enter';
    m.view = () => ({ dw: +dw.toFixed(2) });
    m.buttons = () => [['Space', 'Spray'], ['Enter', 'Wipe']];
    m.draw = (c, W, H, P) => {
      m.names.forEach((n, k) => { const y = 14 + k * 28, cur = k === m.i; box(c, 20, y, 200, 22, k < m.i ? 'rgba(125,200,140,.2)' : cur ? 'rgba(125,151,232,.25)' : 'rgba(255,255,255,.05)', cur ? COL.peri : null, 4); txt(c, `${k + 1} ${n}`, 28, y + 16, { size: 13 }); if (k < m.i) txt(c, 'clean', 180, y + 16, { size: 11, col: P.good }); });
      const ready = m.sp >= dw; txt(c, m.sp < 0 ? 'bare: Space' : ready ? 'ready: Enter' : 'dwelling...', 250, 40, { size: 13, col: ready ? P.good : COL.warn });
      lamp(c, 270, 80, 12, ready ? P.good : COL.dim, ready ? 'circle' : 'square'); bar(c, 240, 108, 130, 10, m.sp < 0 ? 0 : Math.min(1, m.sp / dw), { col: COL.peri });
    };
    return m;
  },
});
