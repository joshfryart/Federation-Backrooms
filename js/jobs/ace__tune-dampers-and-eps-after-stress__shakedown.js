// Assistant Chief Engineer: tune dampers and EPS after stress. Each damper handwheel starts off-null. The creak meter is SIGNED: leaning one way
// reads positive, over-correcting reads negative (the louver now loads the opposite way). Turn one notch at a time, let the needle settle, and
// push the locking pin (Enter) only when the meter sits at null. Pinning off null, or turning on while the needle still moves, is a fault.
import { define, machine, ARROW, ENTER, ri, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'ace', label: 'Tune dampers and EPS after stress', type: 'task:shakedown' },
  title: 'Notch the creak to null', dept: 'engineering', host: 'console', tool: 'Damper handwheel and creak meter',
  how: 'Left/Right turns the handwheel one notch. The signed creak meter lags: let it settle, then turn again. Press Enter to pin the damper when the meter reads null.',
  keys: ['Left / Right one notch', 'Enter push the locking pin'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'notch to null', input: 'arrows+enter',
    win: 'two damper handwheels turned a notch at a time until the signed creak meter read null and each pinned there',
    fail: 'turning on while the creak needle is still moving, or pinning a damper that is not at null',
    rule: 'The creak meter is signed and lags the wheel. Turn one notch toward zero, wait for the needle to stop, repeat; pin only at 0.' },
  rush: 'Spun the handwheels to the sheet value and pinned them without watching the creak meter.',
  captions: { overturned: 'louver loads the hull', 'off null': 'pin seated off null' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, tau = m.calm ? 0.35 : 0.25; m.rounds = 2; m.round = 0;
    const mk = () => { const w = ri(r, 3, 5) * (r() < 0.5 ? 1 : -1); return { w, shown: w }; }; m.ds = [mk(), mk()]; m.d = m.ds[0];
    m.moving = () => Math.abs(m.d.shown - m.d.w) > 0.2;
    m.key = (code, down = true) => { if (m.state !== 'play' || !down) return false; const a = ARROW(code), d = m.d;
      if (a === 'L' || a === 'R') { if (m.moving()) { m.fault('overturned'); return true; } d.w += a === 'L' ? -1 : 1; return true; }
      if (ENTER(code)) { if (d.w !== 0) m.fault('off null'); else { m.round++; if (m.round >= m.rounds) m.win(); else m.d = m.ds[m.round]; } return true; } return false; };
    m.tick = (dt) => { if (m.live(dt)) m.d.shown += (m.d.w - m.d.shown) * Math.min(1, dt / tau); };
    m.hint = () => m.moving() ? [] : m.d.w === 0 ? [['Enter', true]] : [[m.d.w > 0 ? 'ArrowLeft' : 'ArrowRight', true]];
    m.bad = () => (m.d.w ? 'Enter' : null);
    m.view = () => ({ w: m.ds.map(d => d.w) });
    m.buttons = () => [['ArrowLeft', '◀ notch'], ['ArrowRight', 'notch ▶'], ['Enter', 'Pin']];
    m.draw = (c) => { txt(c, `DAMPER ${m.round + 1} / ${m.rounds}   CREAK METER`, 14, 22, { size: 12, col: COL.dim }); box(c, 14, 40, 372, 30, COL.panel, COL.peri);
      c.fillStyle = COL.gold; c.fillRect(200 + Math.max(-6, Math.min(6, m.d.shown)) * 30 - 2, 36, 4, 38); c.fillStyle = '#fff'; c.fillRect(199, 32, 2, 46);
      txt(c, '− loads other side', 20, 92, { size: 10, col: COL.dim }); txt(c, 'leans this way +', 380, 92, { size: 10, col: COL.dim, align: 'right' });
      txt(c, `reading ${m.d.shown.toFixed(1)}`, 14, 125, { size: 18, col: Math.abs(m.d.shown) < 0.2 ? COL.pale : COL.ink }); txt(c, m.moving() ? 'needle moving' : 'steady', 14, 148, { size: 11, col: m.moving() ? COL.warn : COL.pale }); };
    return m;
  },
});
