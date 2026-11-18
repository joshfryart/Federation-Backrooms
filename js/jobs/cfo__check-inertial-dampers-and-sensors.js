// CFO: check inertial dampers and sensors. Bank by bank, hold the reset dial (← / →) to bring each damper needle into its green band and let it
// settle there. A bank whose needle ignores the dial is stuck: lift the reset cover (Space) to free it, rather than winding the dial at it.
// Then the forward sensor self-check counts its returns: log a green lamp (Space), but on amber first hold ↓ to pull the fault code.
import { define, machine, SPACE, ARROW, rf, ri, clamp, txt, box, bar, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'cfo', label: 'Check inertial dampers and sensors', type: 'loop' },
  title: 'Damper bank settle and self-check', dept: 'flight', host: 'console', tool: 'Damper panel and nav sensor console',
  how: 'Hold ← / → on the reset dial to settle each damper needle in its band; if a needle ignores the dial, Space lifts the reset cover. Then log the sensor self-check: on amber hold ↓ for the fault code first.',
  keys: ['← / → hold: reset dial', 'Space: reset cover / log', '↓ hold: pull fault code'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'settle the banks', input: 'arrows-hold+space', win: 'all three damper needles settled inside their bands, the stuck bank freed by its cover, and the self-check logged with any amber fault code pulled',
    fail: 'winding the dial at a stuck needle, lifting the cover on a working bank, or logging an amber self-check as nominal',
    rule: 'Hold ← / → and the needle swings with inertia; ease off early so it settles in the band. If it does not move at all, press Space. Self-check: green, Space; amber, hold ↓ then Space.' },
  rush: 'Logged the three banks green off the first glance at the gauges.',
  captions: { 'forced dial': 'dial grinds', 'needless reset': 'cover clanks', 'amber logged': 'fault chime' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, hw = m.calm ? 0.11 : 0.08, stuck = ri(r, -1, 2);
    m.banks = [0, 1, 2].map(i => ({ x: rf(r, 0.05, 0.95), v: 0, mid: rf(r, 0.3, 0.7), stuck: i === stuck, set: 0, force: 0, done: false }));
    m.banks.forEach(b => { if (Math.abs(b.x - b.mid) < 0.25) b.x = b.mid + (b.x < b.mid ? -0.3 : 0.3); });
    m.b = 0; m.u = 0; m.code = 0; m.phase = 'damp'; m.amber = r() < 0.5; m.count = 0; m.base = ri(r, 180, 260); m.got = m.amber ? m.base - ri(r, 20, 50) : m.base;
    const B = () => m.banks[m.b];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'L' || a === 'R') { if (m.phase === 'damp') m.u = down ? (a === 'R' ? 1 : -1) : 0; return true; }
      if (a === 'D') { m.held.D = down; return true; }
      if (!SPACE(code) || !down) return false;
      if (m.phase === 'damp') { const b = B(); if (b.stuck) { b.stuck = false; m.ev('cover', { bank: m.b }); } else m.fault('needless reset'); return true; }
      if (m.count < m.got) return true;
      if (m.amber && m.code < 1) { m.fault('amber logged'); return true; }
      m.win(); return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return;
      if (m.phase === 'damp') {
        const b = B(); if (b.stuck) { if (m.u) { b.force += dt; if (b.force > 1.2) { m.fault('forced dial'); b.force = 0; } } }
        else { b.v += (m.u * 1.2 - b.v * 1.6) * dt; b.x = clamp(b.x + b.v * dt, 0, 1); }
        if (!b.stuck && Math.abs(b.x - b.mid) < hw && Math.abs(b.v) < 0.08) b.set += dt; else b.set = 0;
        if (b.set >= 0.7) { b.done = true; m.b++; m.u = 0; if (m.b > 2) m.phase = 'check'; }
      } else { m.count = Math.min(m.got, m.count + 140 * dt); if (m.count >= m.got && m.amber && m.held.D) m.code = Math.min(1, m.code + dt); }
    };
    m.hint = () => {
      if (m.phase === 'check') { if (m.count < m.got) return []; if (m.amber && m.code < 1) return [['ArrowDown', true]]; return [['ArrowDown', false], ['Space', true]]; }
      const b = B(); if (b.stuck) return [['Space', true]];
      const e = b.mid - (b.x + b.v * 0.75); return Math.abs(e) < 0.02 ? [['ArrowLeft', false], ['ArrowRight', false]] : e > 0 ? [['ArrowLeft', false], ['ArrowRight', true]] : [['ArrowRight', false], ['ArrowLeft', true]];
    };
    m.bad = () => m.phase === 'damp' ? (B().stuck ? ['ArrowRight', true] : 'Space') : (m.count >= m.got ? 'Space' : null);
    m.view = () => ({ b: m.banks.map(b => [+b.mid.toFixed(3), b.stuck]), a: m.amber, g: m.got });
    m.buttons = () => [['ArrowLeft', '◀ dial'], ['ArrowRight', 'dial ▶'], ['Space', 'Cover / log'], ['ArrowDown', '▼ fault code']];
    m.draw = (c, W, H, P) => {
      m.banks.forEach((b, k) => {
        const y = 22 + k * 30, cur = m.phase === 'damp' && k === m.b; txt(c, `Bank ${k + 1}`, 18, y + 10, { size: 12, col: cur ? COL.gold : COL.dim });
        bar(c, 80, y, 220, 12, 0, { band: [b.mid - hw, b.mid + hw], mark: b.x });
        txt(c, b.done ? 'settled' : cur ? (b.set > 0 ? 'settling…' : 'dial') : '', 312, y + 10, { size: 11, col: b.done ? P.good : COL.pale });
        if (b.done) lamp(c, 380, y + 6, 7, P.good, 'circle');
      });
      if (m.phase === 'check') {
        const done = m.count >= m.got; txt(c, `Sensor self-check returns ${Math.round(m.count)} / baseline ${m.base}`, 18, 128, { size: 12 });
        if (done) { lamp(c, 30, 150, 9, m.amber ? P.bad : P.good, m.amber ? 'triangle' : 'circle'); txt(c, m.amber ? (m.code >= 1 ? 'AMBER — fault code pulled: Space to log' : 'AMBER — hold ↓ to pull the fault code') : 'GREEN — Space to log', 46, 155, { size: 12, col: m.amber ? P.bad : P.good }); }
      } else txt(c, B().stuck ? '' : 'Ease off early: the needle swings on', 18, 128, { size: 11, col: COL.dim });
    };
    return m;
  },
});
