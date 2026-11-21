// Replicator tech: pattern buffer check after a sensor power draw. The meter spikes and the trace wobbles harmlessly while it settles. Wait for the
// power to fall below the settle mark, lock the trace (Space), then flush (Enter) only if the locked trace sits outside the baseline band.
import { define, machine, SPACE, ENTER, rf, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'rep', label: 'Pattern buffer check after sensor power draw', type: 'task:survey' },
  title: 'Settle, lock, then flush', dept: 'services', host: 'console', tool: 'Power meter and probe',
  how: 'Wait until the power meter falls under the settle mark. Press Space to lock the trace. If it is outside the baseline band press Enter to flush, otherwise press Space again to pass it.',
  keys: ['Space lock / pass', 'Enter flush'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'wait out spike', input: 'space+enter', win: 'three buffers each trace locked after the power spike settled then flushed only when the locked trace was outside the baseline band',
    fail: 'locking while the spike still wobbles the trace, flushing a trace inside the band or passing one outside it',
    rule: 'Power decays after the spike. Space locks the trace once power is under the settle mark. Then Enter flushes a trace beyond the band and Space passes one inside.' },
  rush: 'Flushed every buffer straight after the spike to be safe.',
  captions: { 'early lock': 'probe static burst', 'needless flush': 'buffer flush thump', 'corrupt passed': 'meal print wrong tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, decay = m.calm ? 2.4 : 3.2; m.k = 0; m.clk = 0; m.locked = false; m.rounds = 3; m.round = 0;
    m.bufs = [0, 1, 2].map(i => ({ amp: i === 1 || r() < 0.4 ? rf(r, 0.4, 0.55) : rf(r, 0.05, 0.15) })); m.band = 0.25;
    m.power = () => Math.max(0, 1 - m.clk / decay);
    m.trace = () => { const b = m.bufs[Math.min(m.k, 2)]; return m.locked ? b.amp : b.amp + m.power() * 0.5; };
    const done = () => { m.k++; m.round = m.k; m.clk = 0; m.locked = false; if (m.k >= 3) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || (!SPACE(code) && !ENTER(code))) return false; if (!down) return true; const b = m.bufs[Math.min(m.k, 2)], out = b.amp > m.band;
      if (!m.locked) { if (!SPACE(code)) return true; if (m.power() > 0.15) m.fault('early lock'); else m.locked = true; return true; }
      if (ENTER(code)) { if (out) done(); else m.fault('needless flush'); } else { if (out) m.fault('corrupt passed'); else done(); } return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (!m.locked) m.clk += dt; };
    m.hint = () => { const b = m.bufs[Math.min(m.k, 2)]; if (!m.locked) return m.power() <= 0.12 ? [['Space', true]] : []; return [[b.amp > m.band ? 'Enter' : 'Space', true]]; };
    m.bad = () => 'Space';
    m.view = () => ({ amp: m.bufs.map(b => +b.amp.toFixed(2)) });
    m.buttons = () => [['Space', 'Lock / pass'], ['Enter', 'Flush']];
    m.draw = (c, W, H, P) => {
      txt(c, `Buffer ${Math.min(m.k + 1, 3)} / 3`, 14, 22, { size: 14, col: COL.gold }); txt(c, 'power', 14, 50, { size: 11, col: COL.dim }); bar(c, 60, 40, 300, 12, m.power(), { mark: 0.15, col: COL.orange });
      txt(c, 'trace', 14, 82, { size: 11, col: COL.dim }); bar(c, 60, 72, 300, 12, Math.min(1, m.trace() / 1), { band: [0, m.band], col: m.locked ? COL.peri : COL.pale });
      txt(c, m.locked ? 'LOCKED: flush (Enter) or pass (Space)' : m.power() > 0.15 ? 'spike settling...' : 'settled: lock with Space', 14, 130, { size: 12, col: COL.dim });
    };
    return m;
  },
});
