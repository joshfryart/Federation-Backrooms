// Quartermaster: supervise loading. Pallets slide toward the pad edge marker. Call the stop (Space) as the corner lands flush; then wait for the
// strap-set light before signalling the next pallet (Enter). A call off the mark leaves it crooked; signalling before the strap is set is a fault.
import { define, machine, SPACE, ENTER, rf, txt, box, COL } from './kit.js';
const EDGE = 0.8;

export default define({
  job: { billet: 'qm', label: 'Supervise loading and lashing', type: 'task:cargo_run' },
  title: 'Flush stop and strap-set signal', dept: 'services', host: 'console', tool: 'Loader headset call',
  how: 'Press Space to call the stop as the pallet corner meets the edge marker. When the strap light comes on, press Enter to signal the next pallet. Not before.',
  keys: ['Space call stop', 'Enter next pallet'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'stop flush', input: 'space+enter', win: 'four pallets each stopped with the corner flush to the edge marker and the next one signalled only after its strap was set',
    fail: 'stopping a pallet crooked off the marker, letting it overrun the edge, or signalling the next before the strap light',
    rule: 'The pallet slides at its own speed. Space as its corner meets the edge marker. Then wait for STRAP SET and press Enter to bring in the next pallet.' },
  rush: 'Called every pallet in on the loader\'s say-so and lashed them after.',
  captions: { crooked: 'pallet skews on the pad', overran: 'pallet hits the stop', early: 'loader jams the strap' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, tol = m.calm ? 0.06 : 0.04;
    m.sp = [0, 1, 2, 3].map(() => rf(r, 0.22, 0.34)); m.k = 0; m.x = 0; m.st = 'slide'; m.set = 0; m.round = 0; m.rounds = 4;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false;
      if (SPACE(code)) { if (m.st !== 'slide') return true; if (Math.abs(m.x - EDGE) <= tol) { m.st = 'strap'; m.set = 0; } else { m.fault('crooked'); m.x = 0; } return true; }
      if (ENTER(code)) { if (m.st === 'ready') { m.k++; m.round = m.k; if (m.k >= 4) m.win(); else { m.st = 'slide'; m.x = 0; } } else if (m.st === 'strap') m.fault('early'); return true; }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.st === 'slide') { m.x += m.sp[m.k] * dt; if (m.x > EDGE + tol + 0.04) { m.fault('overran'); m.x = 0; } } else if (m.st === 'strap') { m.set += dt; if (m.set >= 1.1) m.st = 'ready'; } };
    m.hint = () => m.st === 'slide' ? (m.x >= EDGE - 0.01 ? [['Space', true]] : []) : m.st === 'ready' ? [['Enter', true]] : [];
    m.bad = () => m.st === 'slide' ? ['Space', true] : ['Enter', true];
    m.view = () => ({ sp: m.sp.map(s => +s.toFixed(3)) });
    m.buttons = () => [['Space', 'Stop'], ['Enter', 'Next']];
    m.draw = (c, W, H, P) => {
      c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(10, 60, 380, 50); c.fillStyle = COL.gold; c.fillRect(10 + 380 * EDGE - 2, 50, 4, 70); txt(c, 'EDGE', 10 + 380 * EDGE, 44, { size: 10, align: 'center', col: COL.gold });
      box(c, 10 + 380 * m.x - 50, 66, 50, 38, COL.panel, COL.peri, 4); txt(c, `pallet ${m.k + 1}/4`, 14, 18, { size: 12, col: COL.pale });
      txt(c, m.st === 'slide' ? 'call the stop at the marker' : m.st === 'strap' ? 'strapping...' : 'STRAP SET: Enter for next', 14, 150, { size: 12, col: m.st === 'ready' ? P.good : COL.dim });
    };
    return m;
  },
});
