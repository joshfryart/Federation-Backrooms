// CFO: brief helm and nav on the slow approach. Three figures (bearing, closing speed, cut-off distance) must go over the noisy bridge comms
// whole. Hold Space to speak a figure; it takes a full second of clear air. Static bursts roll across the channel (the strip shows what is
// coming): a figure that a burst lands on is misheard and read back wrong, so start speaking only in a gap long enough to finish.
import { define, machine, SPACE, rf, ri, clamp, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'cfo', label: 'Brief helm and nav on slow approach', type: 'task:survey' },
  title: 'Approach brief through comms static', dept: 'flight', host: 'console', tool: 'Bridge comms panel',
  how: 'Hold Space to speak each approach figure; it needs a full second of clear air. Watch the static strip and start only in a gap long enough to finish the figure.',
  keys: ['Space hold: speak the figure'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'speak in gaps', input: 'space-hold', win: 'bearing, closing speed and cut-off distance each spoken whole in a clear gap and read back correctly by helm and nav',
    fail: 'speaking into a static burst so the figure is misheard and read back wrong',
    rule: 'A figure needs one unbroken second of Space with no static over it. The strip shows the next bursts sliding toward the now line: start right after one passes if the gap is wide enough.' },
  rush: 'Rattled off the three numbers over the hiss and walked away.',
  captions: { misheard: 'garbled read-back' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, need = m.calm ? 0.8 : 1.0;
    m.figs = [['Bearing', `${ri(r, 100, 359)}°`], ['Closing speed', `${ri(r, 12, 40)} m/s`], ['Cut-off', `${ri(r, 3, 9) * 100} m`]].map(([n, v]) => ({ n, v, said: 0, done: false }));
    m.st = []; let t = rf(r, 0.2, 0.6); while (t < 80) { const len = rf(r, 0.45, 0.8); m.st.push([t, t + len]); t += len + (r() < 0.4 ? rf(r, 0.5, 0.9) : rf(r, 1.4, 2.0)); }
    m.i = 0; m.tx = 0; m.rounds = 3; m.round = 1;
    const noisy = (x) => m.st.some(([a, b]) => x >= a && x <= b);
    const gapLeft = () => { const nx = m.st.find(([a]) => a > m.t); return nx ? nx[0] - m.t : 99; };
    m.key = (code, down = true) => { if (m.state !== 'play' || !SPACE(code)) return false; m.held.S = down; if (!down) m.tx = 0; return true; };
    m.tick = (dt) => {
      if (!m.live(dt)) return; if (!m.held.S) return; const f = m.figs[m.i];
      if (noisy(m.t)) { if (m.tx > 0.05) { m.fault('misheard'); m.ev('misheard', { fig: m.i }); } m.tx = 0; m.held.S = false; return; }
      m.tx += dt; if (m.tx >= need) { f.done = true; m.tx = 0; m.held.S = false; m.i++; m.round = Math.min(3, m.i + 1); if (m.i >= 3) m.win(); }
    };
    m.hint = () => { if (m.held.S) return [['Space', true]]; return !noisy(m.t) && gapLeft() > need + 0.15 ? [['Space', true]] : [['Space', false]]; };
    m.bad = () => ['Space', true];
    m.view = () => ({ st: m.st.slice(0, 6).map(([a]) => +a.toFixed(2)), f: m.figs.map(f => f.v) });
    m.buttons = () => [['Space', 'Speak (hold)']];
    m.draw = (c, W, H, P) => {
      m.figs.forEach((f, k) => { const y = 14 + k * 26, cur = k === m.i; box(c, 14, y, 372, 22, cur ? COL.panel : null, cur ? COL.gold : null, 5); txt(c, `${f.n}: ${f.v}`, 22, y + 15, { size: 12, col: f.done ? COL.dim : COL.ink }); txt(c, f.done ? `helm + nav: "${f.v}" ✓` : cur ? (m.tx > 0 ? 'speaking…' : 'ready') : '', 220, y + 15, { size: 11, col: f.done ? P.good : COL.pale }); });
      const x0 = 60, w = 320, span = 4; txt(c, 'static', 14, 112, { size: 10, col: COL.dim }); box(c, x0, 100, w, 16, 'rgba(255,255,255,.06)', null, 3);
      for (const [a, b] of m.st) { const xa = x0 + (a - m.t) / span * w, xb = x0 + (b - m.t) / span * w; if (xb < x0 || xa > x0 + w) continue; c.fillStyle = P.bad; c.fillRect(Math.max(x0, xa), 102, Math.min(x0 + w, xb) - Math.max(x0, xa), 12); }
      c.fillStyle = '#fff'; c.fillRect(x0 - 1, 96, 3, 24); txt(c, 'now', x0 - 8, 132, { size: 10, col: COL.dim });
      bar(c, x0, 140, w * (need / span), 10, clamp(m.tx / need), { col: COL.gold }); txt(c, noisy(m.t) ? 'STATIC ON CHANNEL' : 'clear air', 14, 162, { size: 11, col: noisy(m.t) ? P.bad : P.good });
    };
    return m;
  },
});
