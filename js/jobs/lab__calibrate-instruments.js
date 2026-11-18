// Lab technician: calibrate instruments. The reference standard sits in the port and the readout chases the instrument's true value with a
// lag. Each arrow press turns the adjustment screw one click; the readout only shows where that click landed after it settles. Click, wait
// for the reading to hold, click again: stack clicks before it settles and the screw runs past the certificate (over-tuned, the screw is
// backed off to where it started). When the settled reading sits within tolerance of the card value, lock the screw (Enter).
import { define, machine, ARROW, ENTER, ri, rf, pick, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'lab', label: 'Calibrate instruments', type: 'loop' },
  title: 'Click the screw, let it settle', dept: 'sciences', host: 'console', tool: 'Calibration console',
  how: 'Each arrow press turns the adjustment screw one click. The readout lags behind: wait for it to hold still before the next click. Lock the screw (Enter) once the steady reading is inside the certificate tolerance.',
  keys: ['← → one screw click', 'Enter lock the screw'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'click and settle', input: 'arrows+enter', win: 'three instruments brought onto their certificate value one lagging screw click at a time and locked while holding steady',
    fail: 'stacking clicks before the readout settles so the screw runs past the certificate, or locking on a reading that is still moving or off-card',
    rule: 'Press an arrow for one click, watch the readout creep to its new value and stop, then click again. Enter locks once the steady reading sits inside the tolerance marks.' },
  rush: 'Cranked the screw until the number looked about right and walked off.',
  captions: { 'over-tuned': 'screw grinds past', 'locked moving': 'lock rejected', 'off certificate': 'lock rejected' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, lag = m.calm ? 2.2 : 2.8;
    m.inst = [0, 1, 2].map(() => { const step = pick(r, [0.5, 1, 2]), n = ri(r, 3, 5) * pick(r, [1, -1]), cert = Math.round(rf(r, 40, 90) * 10) / 10; return { name: pick(r, ['Mass spectrometer', 'pH probe', 'Gas chromatograph', 'Thermal cycler', 'Photometer']), step, cert, start: cert - n * step, batch: `RS-${ri(r, 100, 999)}` }; });
    m.k = 0; m.rounds = 3; m.round = 1;
    const load = () => { const I = m.inst[m.k]; m.truth = I.start; m.read = I.start; m.still = 1; };
    load();
    const I = () => m.inst[m.k], tol = () => I().step * 0.5, settled = () => Math.abs(m.read - m.truth) < I().step * 0.06;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a === 'L' || a === 'R') {
        m.truth += (a === 'R' ? 1 : -1) * I().step;
        const over = (m.truth - I().cert) * Math.sign(I().cert - I().start);
        if (over > I().step * 1.5) { m.fault('over-tuned'); m.truth = I().start; }
        return true;
      }
      if (ENTER(code)) {
        if (!settled()) { m.fault('locked moving'); return true; }
        if (Math.abs(m.read - I().cert) > tol()) { m.fault('off certificate'); return true; }
        m.ev('locked', { k: m.k }); m.k++; m.round = Math.min(3, m.k + 1); if (m.k >= 3) m.win(); else load(); return true;
      }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.read += (m.truth - m.read) * Math.min(1, dt * lag); };
    m.hint = () => { if (m.state !== 'play' || !settled()) return []; const d = I().cert - m.read; if (Math.abs(d) <= tol()) return [['Enter', true]]; return [[d > 0 ? 'ArrowRight' : 'ArrowLeft', true]]; };
    m.bad = () => (I().cert > I().start ? 'ArrowRight' : 'ArrowLeft');
    m.view = () => ({ inst: m.inst.map(i => [i.step, i.cert, i.start]) });
    m.buttons = () => [['ArrowLeft', 'Click −'], ['ArrowRight', 'Click +'], ['Enter', 'Lock']];
    m.draw = (c, W, H, P) => {
      const i = I(); if (!i) return; const lo = Math.min(i.start, i.cert) - i.step * 3, hi = Math.max(i.start, i.cert) + i.step * 3, f = (v) => (v - lo) / (hi - lo);
      txt(c, i.name.toUpperCase(), 14, 20, { size: 12, col: COL.gold }); txt(c, `standard ${i.batch}`, 386, 20, { size: 10, col: COL.dim, align: 'right' });
      box(c, 14, 30, 180, 44, COL.panel, COL.peri); txt(c, 'CERTIFICATE', 22, 46, { size: 9, col: COL.dim }); txt(c, `${i.cert.toFixed(1)} ± ${tol().toFixed(2)}`, 22, 66, { size: 16 });
      const st = settled(); txt(c, m.read.toFixed(2), 300, 66, { size: 26, col: st ? COL.ink : COL.warn, align: 'center' });
      txt(c, st ? 'steady' : 'settling…', 300, 84, { size: 11, col: st ? P.good : COL.warn, align: 'center' });
      bar(c, 14, 104, 372, 14, f(m.read), { band: [f(i.cert - tol()), f(i.cert + tol())], col: COL.peri });
      txt(c, `one click = ${i.step}`, 14, 140, { size: 11, col: COL.pale }); txt(c, 'wait for steady before the next click', 386, 140, { size: 11, col: COL.dim, align: 'right' });
    };
    return m;
  },
});
