// EPS tech: balance grid load against reactor output. One conduit runs hot over the 80 % line and keeps warming. Pick a section (1-4) and
// push a 10 % block of its load (lights, lifts) to the section beside it (← / →). Every block lands with a surge that takes a moment to die
// away; drop a second block onto a section before its readout settles and the surge stacks over the trip line.
import { define, machine, DIG, ARROW, ri, clamp, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'eps', label: 'Balance grid load against reactor output', type: 'loop' },
  title: 'Shift load blocks off the hot conduit', dept: 'engineering', host: 'console', tool: 'Grid section sliders',
  how: 'Select the hot section (1-4) and push 10 % blocks of its load to a cooler neighbour (← / →). Let each surge settle before the next block lands there.',
  keys: ['1-4 select section', '← → shift a 10 % block'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'shift and settle', input: 'digits+arrows', win: 'every grid section held under the 80 percent line with all surges settled',
    fail: 'stacking blocks onto a section before its surge dies so it crosses the trip line, or leaving the hot conduit to creep until it trips',
    rule: 'Number keys pick the section; arrows move 10 % of its load to the left or right neighbour. Each block lands with a surge spike that decays over a second: wait for SETTLED before landing another.' },
  rush: 'Threw the lift load onto whichever section looked emptiest and walked off.',
  captions: { 'rolling trip': 'breaker clacks', 'conduit tripped': 'conduit alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, kick = m.calm ? 9 : 12, tau = m.calm ? 0.45 : 0.55, creep = m.calm ? 0.8 : 1.2;
    const h = ri(r, 0, 3), nb = [h - 1, h + 1].filter(j => j >= 0 && j < 4), c = nb[ri(r, 0, nb.length - 1)];
    m.L = [0, 1, 2, 3].map(i => i === h ? ri(r, 84, 92) : i === c ? ri(r, 30, 50) : ri(r, 45, 72)); m.S = [0, 0, 0, 0];
    m.sel = -1; m.ok = 0; m.reactor = ri(r, 300, 340);
    const D = (i) => m.L[i] + m.S[i];
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code), a = ARROW(code);
      if (d >= 1 && d <= 4) { if (down) m.sel = d - 1; return true; }
      if (a !== 'L' && a !== 'R') return false; if (!down || m.sel < 0) return true;
      const j = m.sel + (a === 'L' ? -1 : 1); if (j < 0 || j > 3 || m.L[m.sel] < 10) return true;
      m.L[m.sel] -= 10; m.L[j] += 10; m.S[j] += kick; m.ev('shift', { from: m.sel, to: j }); return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return;
      for (let i = 0; i < 4; i++) {
        m.S[i] *= Math.exp(-dt / tau); if (m.S[i] < 0.2) m.S[i] = 0;
        if (m.L[i] > 80) m.L[i] += creep * dt;
        if (D(i) >= 100) { m.fault(m.S[i] > 0 ? 'rolling trip' : 'conduit tripped'); m.S[i] = 0; if (m.L[i] >= 100) m.L[i] = 90; }
      }
      const calmGrid = m.L.every((v, i) => D(i) <= 80) && m.S.every(v => v < 0.5);
      m.ok = calmGrid ? m.ok + dt : 0; if (m.ok >= 1.5) m.win();
    };
    m.hint = () => {
      let best = null; for (let i = 0; i < 4; i++) if (m.L[i] > 80) for (const j of [i - 1, i + 1]) if (j >= 0 && j < 4 && m.L[j] + 10 <= 78 && m.S[j] < 1.5 && (!best || m.L[j] < m.L[best[1]])) best = [i, j];
      if (!best) return []; if (m.sel !== best[0]) return [['Digit' + (best[0] + 1), true]]; return [[best[1] < best[0] ? 'ArrowLeft' : 'ArrowRight', true]];
    };
    m.bad = () => { const j = nb[0]; if (m.sel !== j) return 'Digit' + (j + 1); return j < h ? 'ArrowRight' : 'ArrowLeft'; };
    m.view = () => ({ L: m.L.map(Math.round), h });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['ArrowLeft', '◀ shift'], ['ArrowRight', 'shift ▶']];
    m.draw = (c, W, H, P) => {
      const y0 = 22, hh = 110, y80 = y0 + hh - 0.8 * hh;
      txt(c, `GRID ${Math.round(m.L.reduce((a, b) => a + b, 0))} / REACTOR ${m.reactor}`, 12, 14, { size: 11, col: COL.peri });
      for (let i = 0; i < 4; i++) {
        const x = 20 + i * 70, v = clamp(D(i) / 100), hot = D(i) > 80;
        box(c, x, y0, 46, hh, 'rgba(255,255,255,.07)', m.sel === i ? COL.gold : null, 4);
        c.fillStyle = hot ? P.bad : P.good; c.fillRect(x + 6, y0 + hh - v * hh, 34, v * hh);
        txt(c, `${i + 1}`, x + 23, y0 + hh + 14, { size: 12, align: 'center', col: m.sel === i ? COL.gold : COL.ink });
        txt(c, m.S[i] > 0.5 ? 'SURGE' : hot ? 'HOT ▲' : 'settled', x + 23, y0 + hh + 28, { size: 9, align: 'center', col: m.S[i] > 0.5 || hot ? COL.warn : COL.dim });
        txt(c, `${Math.round(D(i))}`, x + 23, y0 - 2 + hh - v * hh, { size: 10, align: 'center' });
      }
      c.fillStyle = COL.warn; c.fillRect(14, y80, 280, 2); txt(c, '80 %', 298, y80 + 4, { size: 10, col: COL.warn });
      txt(c, m.ok > 0 ? `holding ${m.ok.toFixed(1)} s` : 'balance the grid', W - 12, H - 12, { size: 11, align: 'right', col: COL.pale });
    };
    return m;
  },
});
