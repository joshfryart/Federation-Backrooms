// Replicator tech: pattern buffer diagnostics. Hold Space to flush the buffer until the lamp is dark, and keep holding for a moment in the dark:
// a short flush only pauses the fault and the lamp creeps back on release. Then press Enter to re-run the check, which must read clear.
import { define, machine, SPACE, ENTER, rf, txt, box, bar, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'rep', label: 'Pattern buffer diagnostics', type: 'loop' },
  title: 'Flush the buffer past dark', dept: 'services', host: 'console', tool: 'Buffer probe and flush key',
  how: 'Hold Space to flush: the lamp fades. Keep holding about a second after it goes dark so the fault is really cleared, let go, then press Enter to re-run the check.',
  keys: ['Space hold: flush', 'Enter: re-run check'], limit: 34, maxFaults: 2,
  fingerprint: { verb: 'flush past dark', input: 'space-hold+enter', win: 'two buffers each flushed past dark long enough that the re-run check reads clear',
    fail: 'letting go before the dark dwell so the fault only paused and the re-check relights the lamp',
    rule: 'Hold Space until the lamp is dark, then keep holding for the dwell bar to fill. Let go and press Enter: a check run on a paused fault reads lit and counts a fault.' },
  rush: 'Closed the hatch after one flush without re-running the check.',
  captions: { 'still lit': 'buffer lamp warning tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, dwell = m.calm ? 0.7 : 1.0; m.k = 0; m.rounds = 2; m.round = 0;
    m.bufs = [0, 1].map(() => ({ fade: rf(r, 0.3, 0.45), back: rf(r, 0.25, 0.4) })); m.L = 1; m.d = 0; m.clear = false;
    const B = () => m.bufs[Math.min(m.k, 1)];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; if (SPACE(code)) { m.held.S = down; return true; } if (!ENTER(code)) return false; if (!down) return true;
      if (m.held.S) return true; if (m.clear && m.L < 0.05) { m.k++; m.round = m.k; m.L = 1; m.d = 0; m.clear = false; if (m.k >= 2) m.win(); } else { m.fault('still lit'); } return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const b = B();
      if (m.held.S) { m.L = Math.max(0, m.L - b.fade * dt); if (m.L === 0 && !m.clear) { m.d += dt; if (m.d >= dwell) m.clear = true; } }
      else if (!m.clear) { m.d = 0; m.L = Math.min(1, m.L + b.back * dt); }
    };
    m.hint = () => m.clear ? [['Space', false], ['Enter', true]] : [['Space', true]];
    m.bad = () => 'Enter';
    m.view = () => ({ bufs: m.bufs.map(b => [+b.fade.toFixed(2), +b.back.toFixed(2)]) });
    m.buttons = () => [['Space', 'Flush (hold)'], ['Enter', 'Re-run check']];
    m.draw = (c, W, H, P) => {
      txt(c, `Buffer ${Math.min(m.k + 1, 2)} / 2`, 14, 22, { size: 14, col: COL.gold }); lamp(c, 50, 70, 24, m.L > 0.05 ? `rgba(240,147,58,${(0.3 + m.L * 0.7).toFixed(2)})` : 'rgba(255,255,255,.1)', m.L > 0.05 ? 'triangle' : 'circle');
      txt(c, m.L > 0.05 ? `lamp ${Math.round(m.L * 100)} %` : 'lamp dark', 90, 66, { size: 14 }); bar(c, 90, 82, 280, 12, m.d / dwell, { col: P.good }); txt(c, 'dark dwell', 90, 112, { size: 11, col: COL.dim });
      txt(c, m.held.S ? 'flushing' : m.clear ? 'cleared: re-run the check' : 'flush idle', 14, 146, { size: 12, col: COL.dim });
    };
    return m;
  },
});
