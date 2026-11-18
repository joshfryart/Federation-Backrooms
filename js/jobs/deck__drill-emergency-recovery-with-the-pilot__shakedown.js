// Deck crew: drill emergency recovery with the pilot. The shuttle comes down the glide path and drifts high or low. Signal with the paddles:
// Up = "come up", Down = "go down". The pilot answers each signal about a third of a second later, so signal early and once; signalling
// again and again over-corrects. Off the glide band too long is a rough approach. After touchdown the craft skids: call STOP (Space) while the
// skid is on the marker, then set the chocks (Enter) before it rolls back.
import { define, machine, ARROW, SPACE, ENTER, rf, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'deck', label: 'Drill emergency recovery with the pilot', type: 'task:shakedown' },
  title: 'Paddle in, stop on the mark, chock', dept: 'flight', host: 'console', tool: 'Signal paddles and pad marker',
  how: 'Tap Up or Down to signal the pilot back onto the glide band (the pilot reacts after a short delay). After touchdown press Space as the skid crosses the marker, then Enter to chock.',
  keys: ['Up / Down: paddle signal', 'Space: STOP', 'Enter: chocks in'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'paddle in', input: 'arrows+space+enter', win: 'three emergency approaches guided inside the glide band, stopped with the skid on the pad marker and chocked',
    fail: 'letting the craft wander off the glide path, calling stop off the marker, or chocking too late so it rolls',
    rule: 'Each paddle tap nudges the approach after a lag; watch the trend, not just the position. Space stops the skid where it is: it must be inside the marker. Enter within a second after the stop sets the chocks.' },
  rush: 'Waved the shuttle in vaguely and threw the chocks at it.',
  captions: { 'rough approach': 'hull scrapes', 'off the marker': 'skid screeches', rolled: 'craft rolls back' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, band = m.calm ? 0.3 : 0.24, mk = m.calm ? 0.09 : 0.065;
    const app = () => ({ e: rf(r, -0.12, 0.12), drift: rf(r, 0.07, 0.13) * (r() < 0.5 ? 1 : -1), flip: rf(r, 1.2, 2.4), x: 0, glide: rf(r, 4.5, 5.5), mark: rf(r, 0.45, 0.75), v: rf(r, 0.32, 0.4), stage: 'glide', q: [], c: 0, out: 0, wait: 0 });
    m.apps = [app(), app(), app()]; m.k = 0; m.t0 = 0; m.rounds = 3; m.round = 1;
    const A = () => m.apps[m.k];
    const next = () => { m.k++; m.round = Math.min(3, m.k + 1); if (m.k >= 3) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), p = A(); if (!p) return false;
      if (a === 'U' || a === 'D') { if (down && !m.held[a] && p.stage === 'glide') p.q.push({ at: 0.33, d: a === 'U' ? 1 : -1 }); m.held[a] = down; return true; }
      if (SPACE(code)) { if (!down || p.stage !== 'skid') return true; if (Math.abs(p.x - p.mark) > mk) { m.fault('off the marker'); next(); return true; } p.stage = 'chock'; p.wait = 0; return true; }
      if (ENTER(code)) { if (!down || p.stage !== 'chock') return true; m.ev('chocked', { n: m.k }); next(); return true; }
      return a ? true : false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const p = A(); if (!p) return;
      if (p.stage === 'glide') { p.x += dt / p.glide; p.flip -= dt; if (p.flip <= 0) { p.drift = -p.drift; p.flip = rf(r, 1.2, 2.4); }
        for (const s of p.q) { s.at -= dt; if (s.at <= 0 && !s.done) { s.done = true; p.c += s.d * 0.42; } } p.q = p.q.filter(s => !s.done);
        p.e += (p.drift + p.c) * dt; p.c *= Math.exp(-dt / 0.45);
        if (Math.abs(p.e) > band) { p.out += dt; if (p.out > 0.7) { m.fault('rough approach'); p.out = 0; p.e = 0; } } else p.out = 0;
        if (p.x >= 1) { p.stage = 'skid'; p.x = 0; } }
      else if (p.stage === 'skid') { p.x += p.v * dt; if (p.x > 1) { m.fault('off the marker'); next(); } }
      else if (p.stage === 'chock') { p.wait += dt; if (p.wait > (m.calm ? 1.5 : 1.1)) { m.fault('rolled'); next(); } }
    };
    m.hint = () => { const p = A(); if (!p) return []; const rel = [['ArrowUp', false], ['ArrowDown', false]];
      if (p.stage === 'glide') { if (m.held.U || m.held.D) return rel; const pend = p.q.reduce((a, s) => a + s.d, 0); const fut = p.e + (p.drift + p.c) * 0.5 + pend * 0.18;
        if (fut < -0.08) return [['ArrowUp', true]]; if (fut > 0.08) return [['ArrowDown', true]]; return []; }
      if (p.stage === 'skid') return Math.abs(p.x - p.mark) < mk * 0.5 ? [['Space', true]] : [];
      return [['Enter', true]]; };
    m.bad = () => { const p = A(); if (!p) return null; if (p.stage === 'glide') return ['ArrowUp', !m.held.U]; return p.stage === 'skid' && p.x < p.mark - 2 * mk ? 'Space' : null; };
    m.view = () => ({ apps: m.apps.map(p => [+p.mark.toFixed(2), +p.drift.toFixed(2)]) });
    m.buttons = () => [['ArrowUp', '▲ come up'], ['ArrowDown', '▼ go down'], ['Space', 'STOP'], ['Enter', 'Chocks']];
    m.draw = (c, W, H, P) => {
      const p = A(); if (!p) return; txt(c, `Approach ${m.k + 1} / 3 — ${p.stage}`, 16, 18, { size: 12, col: COL.gold });
      if (p.stage === 'glide') { const x = 30 + p.x * 340, y = 30 + (1 - p.x) * 90; c.strokeStyle = 'rgba(79,208,106,.5)'; c.lineWidth = band * 160; c.globalAlpha = 0.25; c.beginPath(); c.moveTo(30, 30); c.lineTo(370, 120); c.stroke(); c.globalAlpha = 1;
        c.strokeStyle = '#4fd06a'; c.lineWidth = 1; c.beginPath(); c.moveTo(30, 30); c.lineTo(370, 120); c.stroke();
        const sy = y - p.e * 160, ok = Math.abs(p.e) <= band; box(c, x - 12, sy - 6, 24, 12, ok ? COL.peri : P.bad, '#fff', 3); txt(c, ok ? 'ON PATH' : p.e > 0 ? 'HIGH ▼' : 'LOW ▲', 300, 160, { size: 12, col: ok ? P.good : P.bad }); return; }
      c.fillStyle = COL.dim; c.fillRect(20, 110, 360, 4); const mx = 20 + p.mark * 360; c.strokeStyle = '#4fd06a'; c.lineWidth = 2; c.strokeRect(mx - mk * 360, 96, 2 * mk * 360, 26);
      box(c, 20 + p.x * 360 - 14, 92, 28, 16, COL.peri, '#fff', 3); txt(c, p.stage === 'skid' ? 'STOP on the marker (Space)' : 'CHOCKS (Enter)!', 200, 50, { size: 14, align: 'center', col: p.stage === 'chock' ? COL.warn : COL.ink });
      if (p.stage === 'chock') bar(c, 120, 140, 160, 8, 1 - p.wait / (m.calm ? 1.5 : 1.1), { col: COL.orange });
    };
    return m;
  },
});
