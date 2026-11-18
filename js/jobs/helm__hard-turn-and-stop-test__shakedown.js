// Helm: hard turn and stop test. Hold the yaw key the test card names until the turn rate reaches the rate line, then let go (going past
// the red limit over-stresses the frame). Out of the turn the ship runs at the stop marker: coast, then hold the brake (Space) so it comes
// to rest on the marker, judging stopping distance from speed. Meanwhile watch the damper lamp: if it goes amber during the stop, log it
// (Enter) before it clears. Stopping short or long, or a missed amber, is a fault.
import { define, machine, ARROW, SPACE, ENTER, rf, pick, txt, box, bar, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'helm', label: 'Hard turn and stop test', type: 'task:shakedown' },
  title: 'Turn-to-rate then stop-on-marker test', dept: 'flight', host: 'console', tool: 'Yaw keys, brake lever, stop ruler and damper lamp',
  how: 'Hold the named yaw arrow until the turn rate reaches the rate line and let go; then hold Space to brake so the ship stops on the marker. Press Enter whenever the damper lamp goes amber.',
  keys: ['← / → hold: hard turn', 'Space hold: brake', 'Enter log damper amber'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'turn then stop', input: 'arrows-hold+space-hold+enter', win: 'both hard turns released on the rate line and both stops brought to rest on the marker with every amber damper logged',
    fail: 'releasing the turn short of the rate line or holding it past the limit, stopping short of or past the marker, or missing an amber damper lamp',
    rule: 'Holding the yaw arrow raises the turn rate; release between the rate line and the limit. Then the ship closes on the marker at speed: Space brakes, release coasts; it must come to rest on the marker. Enter logs an amber damper.' },
  rush: 'Stopped roughly near the marker and wrote "dampers fine" on the card.',
  captions: { 'turn short': 'rate tone drops', 'over-rate': 'frame strain alarm', 'stopped short': 'stop ruler: short', overshot: 'stop ruler: long', 'damper missed': 'damper lamp clears unlogged', 'false damper': 'damper lamp is green' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, tol = m.calm ? 0.06 : 0.04, A = 0.3;
    m.runs = [0, 1].map(i => ({ dir: i ? pick(r, ['L', 'R']) : pick(r, ['L', 'R']), d: rf(r, 0.6, 0.9), v: rf(r, 0.45, 0.55), amb: r() < 0.6 ? rf(r, 0.4, 0.9) : null }));
    if (m.runs.every(x => x.amb == null)) m.runs[1].amb = 0.6;
    m.n = 0; m.rounds = 2; m.round = 0; m.held = {};
    const load = () => { const u = m.runs[m.n]; m.phase = 'turn'; m.rate = 0; m.d = u.d; m.v = u.v; m.st = 0; m.logged = false; }; load();
    const amber = () => { const u = m.runs[m.n]; return m.phase === 'stop' && u.amb != null && m.st >= u.amb && m.st < u.amb + 0.6; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'L' || a === 'R') { m.held[a] = down; if (!down && m.phase === 'turn' && a === m.runs[m.n].dir && m.rate > 0) { if (m.rate < 0.8) { m.fault('turn short'); m.rate = 0; } else m.phase = 'stop'; } return true; }
      if (SPACE(code)) { m.held.S = down; return true; }
      if (ENTER(code)) { if (down) { if (amber()) m.logged = true; else m.fault('false damper'); } return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const u = m.runs[m.n];
      if (m.phase === 'turn') { if (m.held[u.dir]) { m.rate += 0.6 * dt; if (m.rate > 1) { m.fault('over-rate'); m.rate = 0; m.held[u.dir] = false; } } return; }
      m.st += dt; if (u.amb != null && !m.logged && m.st >= u.amb + 0.6) { m.fault('damper missed'); m.logged = true; }
      m.v = Math.max(0, m.v - (m.held.S ? A : 0) * dt); m.d -= m.v * dt;
      if (m.d < -tol) { m.fault('overshot'); load(); return; }
      if (m.v === 0) { if (m.d > tol) { m.fault('stopped short'); load(); return; } if (u.amb != null && !m.logged) return; m.n++; m.round = m.n; m.held.S = false; if (m.n >= 2) m.win(); else load(); }
    };
    m.hint = () => {
      const u = m.runs[m.n]; if (!u) return [];
      if (m.phase === 'turn') return [['Arrow' + (u.dir === 'L' ? 'Left' : 'Right'), m.rate < 0.86]];
      const out = [['Space', m.v * m.v / (2 * A) >= m.d - 0.004]]; if (amber() && !m.logged) out.push(['Enter', true]); return out;
    };
    m.bad = () => (m.phase === 'turn' ? ['Arrow' + (m.runs[m.n].dir === 'L' ? 'Left' : 'Right'), true] : ['Space', true]);
    m.view = () => ({ runs: m.runs.map(u => [u.dir, +u.d.toFixed(3), u.amb == null ? -1 : +u.amb.toFixed(2)]) });
    m.buttons = () => [['ArrowLeft', '◀ yaw'], ['ArrowRight', 'yaw ▶'], ['Space', 'Brake (hold)'], ['Enter', 'Log damper']];
    m.draw = (c, W, H, P) => {
      const u = m.runs[Math.min(1, m.n)]; box(c, 10, 10, 170, 64, COL.panel, null, 6);
      txt(c, `RUN ${Math.min(2, m.n + 1)}/2 · turn ${u.dir === 'L' ? '◀ port' : 'starboard ▶'}`, 20, 28, { size: 11, col: COL.pale });
      txt(c, 'TURN RATE', 20, 46, { size: 9, col: COL.dim }); bar(c, 20, 52, 150, 10, m.rate, { band: [0.8, 1], col: m.rate > 0.95 ? COL.warn : COL.gold });
      const x0 = 20, x1 = 330, sc = (x1 - x0) / 1.0, px = x1 - m.d * sc; txt(c, 'STOP RULER', x0, 98, { size: 9, col: COL.dim });
      c.fillStyle = 'rgba(79,208,106,.25)'; c.fillRect(x1 - tol * sc, 104, tol * sc * 2, 24); c.fillStyle = P.good; c.fillRect(x1 - 1, 100, 3, 32);
      c.fillStyle = COL.gold; c.beginPath(); c.moveTo(px + 10, 116); c.lineTo(px - 6, 108); c.lineTo(px - 6, 124); c.closePath(); c.fill();
      txt(c, m.phase === 'turn' ? 'turning…' : `speed ${(m.v * 10).toFixed(2)} · to marker ${(m.d * 100).toFixed(0)} m${m.held.S ? ' · BRAKING' : ''}`, x0, 150, { size: 12, col: COL.ink });
      const am = amber(); box(c, 200, 10, 186, 64, COL.panel, null, 6); lamp(c, 222, 42, 12, am ? COL.warn : P.good, am ? 'triangle' : 'circle');
      txt(c, am ? (m.logged ? 'AMBER · logged' : 'AMBER · log it (Enter)') : 'dampers green', 242, 47, { size: 12, col: am ? COL.warn : COL.pale });
    };
    return m;
  },
});
