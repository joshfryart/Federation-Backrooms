// Cargo: check straps, seals and nets. Each ratchet strap has its own click size. Tap Space to ratchet it tighter, watch the gauge needle and
// stop with the needle inside the green band: the strap locks by itself after a pause. Locked slack or over-tight is a fault and the strap resets.
import { define, machine, SPACE, rf, txt, bar, COL } from './kit.js';

export default define({
  job: { billet: 'cargo', label: 'Check straps, seals and nets', type: 'loop' },
  title: 'Ratchet to the band and stop', dept: 'services', host: 'console', tool: 'Ratchet strap and tension gauge',
  how: 'Tap Space to ratchet the strap click by click. Stop when the needle sits in the green band; after a short pause the strap locks. Slack or over-tight both fail.',
  keys: ['Space ratchet one click'], limit: 26, maxFaults: 3,
  fingerprint: { verb: 'ratchet and stop', input: 'space',
    win: 'three straps each locked with the gauge needle inside its green band',
    fail: 'letting a strap lock slack, or ratcheting past the band so it crushes the seal',
    rule: 'Each tap clicks the strap tighter by an amount that differs per strap. Stop tapping with the needle in the band: after a pause the strap locks. Locked outside the band is a fault.' },
  rush: 'Gave each strap a quick tug and moved on.',
  captions: { slack: 'strap slips', crushed: 'seal crunches' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, wait = m.calm ? 1.3 : 0.85;
    m.straps = [0, 1, 2].map(() => { const b0 = rf(r, 0.5, 0.65); return { b0, b1: b0 + 0.16, c: rf(r, 0.06, m.calm ? 0.1 : 0.13) }; });
    m.i = 0; m.v = 0; m.idle = 0; m.lt = -9; m.rounds = 3; m.round = 0;
    m.key = (code, down = true) => { if (m.state !== 'play' || !down || !SPACE(code)) return false; if (m.t - m.lt < 0.12) return true; m.lt = m.t; m.v += m.straps[m.i].c; m.idle = 0; m.ev('click'); return true; };
    m.tick = (dt) => {
      if (!m.live(dt) || m.v <= 0) return; m.idle += dt; if (m.idle < wait) return; const s = m.straps[m.i], v = m.v; m.v = 0; m.idle = 0;
      if (v < s.b0) m.fault('slack'); else if (v > s.b1) m.fault('crushed'); else { m.i++; m.round = m.i; if (m.i >= 3) m.win(); }
    };
    m.hint = () => { const s = m.straps[m.i]; return s && m.v < s.b0 && m.t - m.lt > 0.3 ? [['Space', true]] : []; };
    m.bad = () => 'Space';
    m.view = () => ({ straps: m.straps.map(s => [+s.b0.toFixed(2), +s.c.toFixed(3)]) });
    m.buttons = () => [['Space', 'Ratchet']];
    m.draw = (c, W, H, P) => {
      const s = m.straps[m.i] || m.straps[2]; txt(c, `STRAP ${Math.min(3, m.i + 1)} OF 3`, 12, 18, { size: 11, col: COL.peri });
      bar(c, 20, 56, 360, 22, Math.min(1.2, m.v) / 1.2, { band: [s.b0 / 1.2, s.b1 / 1.2], col: m.v > s.b1 ? P.bad : COL.gold });
      txt(c, 'SLACK', 20, 100, { size: 10, col: COL.dim }); txt(c, 'GREEN BAND', 20 + 360 * (s.b0 + 0.08) / 1.2, 100, { size: 10, col: P.good, align: 'center' }); txt(c, 'CRUSH', 380, 100, { size: 10, col: P.bad, align: 'right' });
      txt(c, m.v > 0 ? `locking in ${Math.max(0, 1 - m.idle / wait).toFixed(1)}` : 'tap to ratchet', 200, 140, { size: 12, col: COL.pale, align: 'center' });
    };
    return m;
  },
});
