// CFO: report arrival. The arrival form comes pre-filled with the planned figures, which is exactly the trap. First stamp the real dock time:
// press Space the moment the dock lock lamp lights on the chronometer (not at the planned time). Then count the crates actually in the hold
// picture, set the crate field to that figure (↑ / ↓) and file the form (Enter). Planned figures filed as actuals mislead the bridge.
import { define, machine, SPACE, ENTER, ARROW, ri, rf, shuffle, txt, box, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'cfo', label: 'Report arrival', type: 'task:cargo_run' },
  title: 'Stamp actual dock time and crate count', dept: 'flight', host: 'console', tool: 'Comms panel arrival form',
  how: 'Press Space the moment the dock lock lamp lights to stamp the actual time. Then count the crates in the hold picture, set the crate field with ↑ / ↓ and file with Enter.',
  keys: ['Space stamp the dock time', '↑ / ↓ crate count', 'Enter file'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'stamp actuals', input: 'space+arrows+enter', win: 'dock time stamped as the lock lamp lit and the crate count corrected from the hold picture before filing',
    fail: 'stamping at the planned time before the lock, stamping late, or filing the planned crate count as the actual',
    rule: 'The chronometer runs past the planned dock time; wait for the lock lamp itself and press Space within a second. Then count the crates in the hold grid, not the manifest, and Enter.' },
  rush: 'Sent the planned arrival time and manifest count straight to the bridge.',
  captions: { 'planned time': 'bridge queries the time', 'late stamp': 'clock overruns', 'planned count': 'quartermaster disputes the count' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, win = m.calm ? 1.4 : 1.0;
    m.plan = ri(r, 0, 23) * 60 + ri(r, 0, 5) * 10; m.dockAt = rf(r, 3, 6); m.start = m.plan - ri(r, 2, 3); m.rate = 0.8; m.lockT = m.dockAt + (r() < 0.5 ? -1 : 1) * rf(r, 1.2, 2.4);
    if (m.lockT < 1.8) m.lockT += 3;
    m.N = 20; m.slots = shuffle(r, Array.from({ length: 20 }, (_, i) => i < ri(r, 1, 3) ? 0 : 1)); m.M = m.slots.filter(Boolean).length;
    m.count = m.N; m.stamp = null; m.phase = 'dock';
    const clock = () => m.start + m.t / m.rate, hm = (x) => { x = Math.floor(x); return `${String(Math.floor(x / 60) % 24).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
    m.hm = hm; m.clock = clock;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (SPACE(code)) { if (m.phase !== 'dock') return true; if (m.t < m.lockT) { m.fault('planned time'); return true; } m.stamp = clock(); m.phase = 'count'; return true; }
      if (a === 'U' || a === 'D') { if (m.phase === 'count') m.count = Math.max(0, Math.min(30, m.count + (a === 'U' ? 1 : -1))); return true; } if (a) return true;
      if (ENTER(code)) { if (m.phase !== 'count') return true; if (m.count !== m.M) { m.fault('planned count'); return true; } m.win(); return true; }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.phase === 'dock' && m.t > m.lockT + win) { m.fault('late stamp'); m.stamp = clock(); m.phase = 'count'; } };
    m.hint = () => { if (m.phase === 'dock') return m.t >= m.lockT + 0.15 ? [['Space', true]] : []; if (m.count > m.M) return [['ArrowDown', true]]; if (m.count < m.M) return [['ArrowUp', true]]; return [['Enter', true]]; };
    m.bad = () => m.phase === 'dock' ? (m.t > 0.5 ? 'Space' : null) : 'Enter';
    m.view = () => ({ p: m.plan, l: +m.lockT.toFixed(2), s: m.slots.join('') });
    m.buttons = () => [['Space', 'Stamp time'], ['ArrowUp', '▲ crates'], ['ArrowDown', '▼ crates'], ['Enter', 'File form']];
    m.draw = (c, W, H, P) => {
      const lit = m.t >= m.lockT;
      txt(c, `CHRONO ${hm(clock())}`, 16, 24, { size: 16 }); txt(c, `planned dock ${hm(m.plan)}`, 16, 42, { size: 11, col: COL.dim });
      lamp(c, 190, 20, 9, lit ? P.good : '#333', lit ? 'circle' : 'square'); txt(c, lit ? 'DOCK LOCK' : 'lock open', 204, 25, { size: 11, col: lit ? P.good : COL.dim });
      box(c, 14, 54, 170, 104, COL.panel, null, 6); txt(c, 'ARRIVAL FORM', 22, 70, { size: 10, col: COL.dim });
      txt(c, `Dock time: ${m.stamp != null ? hm(m.stamp) : hm(m.plan) + ' (planned)'}`, 22, 92, { size: 12, col: m.stamp != null ? COL.ink : COL.dim });
      txt(c, `Crates: ${m.count}${m.count === m.N ? ' (manifest)' : ''}`, 22, 116, { size: 12, col: m.phase === 'count' ? COL.gold : COL.dim });
      txt(c, m.phase === 'dock' ? 'Stamp when the lock lamp lights' : 'Count the hold, then Enter', 22, 146, { size: 10, col: COL.pale });
      txt(c, 'HOLD CAMERA', 210, 60, { size: 10, col: COL.dim });
      m.slots.forEach((s, i) => { const x = 210 + (i % 5) * 34, y = 66 + Math.floor(i / 5) * 24; box(c, x, y, 30, 20, s ? COL.orange : null, s ? null : 'rgba(255,255,255,.18)', 3); if (!s) txt(c, '—', x + 10, y + 14, { size: 10, col: COL.dim }); });
    };
    return m;
  },
});
