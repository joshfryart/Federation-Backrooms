// XO: approve cargo manifest and transfer schedule. The transfer crane swings each pallet on its hook over the transfer pad and the XO's signature
// is the Space bar: release the pallet only while it is swinging over the pad. Heavier pallets swing slower on a longer wire, so each one has its own
// rhythm; a pallet that stays on the hook too long is bumped back to the end of the schedule (a fault).
import { define, machine, SPACE, ri, rf, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'xo', label: 'Approve cargo manifest and transfer schedule', type: 'task:cargo_run' },
  title: 'Release over the transfer pad', dept: 'command', host: 'console', tool: 'Crane hook and transfer pad',
  how: 'Each pallet swings on the crane hook. Press Space to release it while it is over the pad in the middle. Heavy pallets swing slowly; be quicker than the timeout.',
  keys: ['Space: release the pallet'], limit: 28, maxFaults: 3,
  fingerprint: { verb: 'release over pad', input: 'space',
    win: 'four swinging pallets each released from the crane exactly while over the transfer pad',
    fail: 'releasing a pallet while it swings away from the pad, or leaving a pallet on the hook until the schedule bumps it',
    rule: 'The hook swings across the pad; Space releases the pallet. Only a release over the marked pad counts, and each pallet is bumped if it stays on the hook for six seconds.' },
  rush: 'Signed the manifest\'s mass line and let the loaders move pallets in whatever order they reached them.',
  captions: { 'off pad': 'pallet dropped beside the pad', bumped: 'pallet bumped to the end of the schedule' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, tol = m.calm ? 0.1 : 0.07; m.n = 0; m.pt = 0;
    m.pal = Array.from({ length: 4 }, () => { const mass = ri(r, 1, 3); return { mass, P: 1.5 + mass * 0.5 + rf(r, 0, 0.3), ph: rf(r, 0, 6.28), amp: rf(r, 0.34, 0.42) }; });
    m.pos = () => { const p = m.pal[Math.min(m.n, 3)]; return 0.5 + p.amp * Math.sin(6.2832 * m.pt / p.P * (m.calm ? 0.8 : 1) + p.ph); };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; if (!SPACE(code)) return false; if (!down) return true;
      if (Math.abs(m.pos() - 0.5) <= tol) { m.n++; m.pt = 0; if (m.n >= 4) m.win(); } else m.fault('off pad'); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.pt += dt; if (m.pt >= 6) { m.fault('bumped'); m.pt = 0; } };
    m.hint = () => (m.state === 'play' && Math.abs(m.pos() - 0.5) < tol * 0.55 ? [['Space', true]] : []);
    m.bad = () => (Math.abs(m.pos() - 0.5) > 0.2 ? 'Space' : null);
    m.view = () => ({ p: m.pal.map(p => [p.mass, +p.P.toFixed(2), +p.ph.toFixed(2)]) });
    m.buttons = () => [['Space', 'Release']];
    m.draw = (c, W, H, P) => {
      const p = m.pal[Math.min(m.n, 3)], x = m.pos() * 400, near = Math.abs(m.pos() - 0.5) <= tol;
      box(c, 200 - tol * 400, 128, tol * 800, 12, 'rgba(79,208,106,.25)', P.good, 3); txt(c, 'PAD', 200, 152, { size: 9, align: 'center', col: COL.dim });
      c.strokeStyle = COL.dim; c.lineWidth = 2; c.beginPath(); c.moveTo(200, 8); c.lineTo(x, 100); c.stroke(); box(c, x - 14 - p.mass * 3, 100, 28 + p.mass * 6, 22, near ? '#3a5a3a' : '#4a3a22', near ? P.good : COL.pale, 3); txt(c, `${p.mass * 2} t`, x, 116, { size: 10, align: 'center' });
      txt(c, `pallet ${Math.min(m.n + 1, 4)}/4`, 14, 20, { size: 11, col: COL.gold }); txt(c, `on hook ${m.pt.toFixed(1)} s`, 386, 20, { size: 10, align: 'right', col: m.pt > 4.5 ? P.bad : COL.dim });
    };
    return m;
  },
});
