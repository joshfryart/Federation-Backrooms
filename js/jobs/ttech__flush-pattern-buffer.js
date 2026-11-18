// Transporter tech: flush the pattern buffer. Hold the flush key and the fill gauge falls to the empty mark, but the gauge cannot see a faint
// leftover pattern. Send a blank pattern (Enter) and the echo shows a residue light for every trace still in the buffer; each light takes
// about a third of a second more flushing. Flush just enough, echo again, and the bank logs clean on a dark echo. Echoing a bank that is not
// down to empty is a short flush; holding the flush key on a buffer that is already clear dry-runs the flush coils.
import { define, machine, SPACE, ENTER, rf, ri, txt, bar, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'ttech', label: 'Flush pattern buffer', type: 'loop' },
  title: 'Buffer flush and residue echo', dept: 'operations', host: 'console', tool: 'Pattern buffer flush panel',
  how: 'Hold Space to flush until the gauge is empty, then Enter to send a blank pattern. Each residue light in the echo needs about 0.3 s more flushing.',
  keys: ['Space hold flush', 'Enter send blank / read echo'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'flush to echo', input: 'space-hold+enter', win: 'three buffer banks flushed until the blank-pattern echo comes back dark',
    fail: 'echoing before the gauge reads empty, or dry-running the flush on a buffer that is already clear',
    rule: 'Hold Space until the fill gauge reads empty, release, press Enter. The echo lights one residue lamp per trace left; flush about 0.3 s per lamp (watch the burst timer), release, echo again.' },
  rush: 'Watched the gauge hit empty and closed the flush cover without sending a blank.',
  captions: { 'flushed short': 'echo garbled', 'dry flush': 'coil whine' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, rate = m.calm ? 0.4 : 0.5, dryMax = m.calm ? 1.2 : 0.8, Q = 0.3;
    m.banks = ['A', 'B', 'C'].map(n => ({ n, fill: rf(r, 0.45, 0.9), res: ri(r, 0, 3) * Q, lights: null, logged: false }));
    if (m.banks.every(b => !b.res)) m.banks[ri(r, 0, 2)].res = 2 * Q;
    m.k = 0; m.wait = 0; m.burst = 0; m.dry = 0; m.echoed = false; m.rounds = 3; m.round = 0;
    const B = () => m.banks[m.k];
    m.key = (code, down = true) => {
      if (SPACE(code)) { if (m.state === 'play') { if (down && !m.held.S) m.burst = 0; m.held.S = !!down; } return true; }
      if (!ENTER(code)) return false; if (m.state !== 'play' || !down || m.wait > 0) return true;
      const b = B(); if (b.fill > 0.02) { m.fault('flushed short'); return true; }
      b.lights = Math.ceil(b.res / Q - 1e-6); m.echoed = true; m.ev('echo', { lights: b.lights });
      if (!b.lights) { b.logged = true; m.round++; m.wait = 0.5; } return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return;
      if (m.wait > 0) { m.wait -= dt; if (m.wait <= 0) { m.k++; m.echoed = false; m.burst = 0; if (m.k >= 3) m.win(); } return; }
      const b = B(); if (!m.held.S) { m.dry = 0; return; }
      m.burst += dt; m.echoed = false;
      if (b.fill > 0) b.fill = Math.max(0, b.fill - rate * dt); else if (b.res > 0) b.res = Math.max(0, b.res - dt); else { m.dry += dt; if (m.dry > dryMax) { m.dry = 0; m.fault('dry flush'); } }
    };
    m.hint = () => {
      if (m.wait > 0 || m.k >= 3) return [['Space', false]]; const b = B();
      if (b.fill > 0 || (b.lights > 0 && b.res > 0)) return [['Space', true]];
      return m.echoed ? [] : [['Space', false], ['Enter', true]];
    };
    m.bad = () => ['Space', true];
    m.view = () => ({ banks: m.banks.map(b => [+b.fill.toFixed(2), b.res]) });
    m.buttons = () => [['Space', 'Flush (hold)'], ['Enter', 'Send blank']];
    m.draw = (c, W, H, P) => {
      const b = B() || m.banks[2];
      txt(c, `BUFFER BANK ${b.n}   (${m.round} / 3 logged clean)`, 16, 22, { size: 12, col: COL.pale });
      txt(c, 'FILL', 16, 52, { size: 11, col: COL.dim }); bar(c, 60, 42, 220, 12, b.fill, { band: [0, 0.02], col: COL.gold });
      txt(c, b.fill > 0.02 ? `${Math.round(b.fill * 100)} %` : 'EMPTY', 292, 53, { size: 12, col: b.fill > 0.02 ? COL.ink : P.good });
      txt(c, m.held.S ? `FLUSHING  burst ${m.burst.toFixed(1)} s` : 'flush key up', 16, 82, { size: 12, col: m.held.S ? COL.warn : COL.dim });
      txt(c, 'ECHO', 16, 118, { size: 11, col: COL.dim });
      if (b.lights == null || !m.echoed) txt(c, b.lights == null ? 'no blank sent yet' : `last echo: ${b.lights} residue light${b.lights === 1 ? '' : 's'} (stale)`, 60, 118, { size: 11, col: COL.dim });
      else if (!b.lights) txt(c, 'DARK — bank clean, logged', 60, 118, { size: 12, col: P.good });
      else for (let i = 0; i < b.lights; i++) lamp(c, 70 + i * 26, 114, 9, P.bad, 'triangle');
      txt(c, '1 light ≈ 0.3 s more flush', 16, 152, { size: 10, col: COL.dim });
    };
    return m;
  },
});
