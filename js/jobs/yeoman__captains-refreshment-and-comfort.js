// Yeoman: the captain's refreshment. Carry a full cup from the mess to the ready room: every bend in the corridor sloshes the tea, and you
// tilt the cup into the turn to keep the surface inside the rim marks. A spill is a fault (you go back for a fresh cup).
import { define, machine, ARROW, clamp, rf, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'yeoman', label: 'Captain\'s refreshment and comfort', type: 'loop' },
  title: 'Full cup to the ready room', dept: 'command', host: 'console', tool: 'Cup and saucer',
  how: 'Walk the cup up the corridor: lean it into each bend (hold ← / →) so the tea stays level inside the rim marks.',
  keys: ['← hold', '→ hold'], limit: 24, maxFaults: 3,
  fingerprint: { verb: 'counter-tilt', input: 'arrows-hold', win: 'the cup reaches the ready room without the surface ever passing the rim',
    fail: 'leaning late or the wrong way so the tea slops over the rim',
    rule: 'The corridor bends ahead are drawn on the strip. Hold ← or → to lean the cup into each bend before you reach it; the tea surface must stay between the rim marks.' },
  rush: 'Carried it at a jog and wiped the saucer on the way in.',
  captions: { spill: 'tea splashes' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, A = m.calm ? 5.2 : 6.5, len = 14;
    m.bends = []; for (let x = 1.6; x < len - 0.5;) { const w = rf(r, 1.4, 2.2), a = (r() < 0.5 ? -1 : 1) * rf(r, 0.65, 1); m.bends.push([x, w, a]); x += w + rf(r, 0.4, 1.0); }
    const curv = (x) => { for (const [x0, w, a] of m.bends) if (x >= x0 && x <= x0 + w) return a * Math.sin(Math.PI * (x - x0) / w); return 0; };
    m.x = 0; m.tilt = 0; m.s = 0; m.v = 0; m.speed = 1; m.curv = curv;
    m.key = (code, down = true) => { if (m.state !== 'play') return false; const a = ARROW(code); if (a !== 'L' && a !== 'R') return false; m.held[a] = down; return true; };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const dir = (m.held.R ? 1 : 0) - (m.held.L ? 1 : 0);
      m.tilt = clamp(m.tilt + (dir ? dir * 2.6 : -Math.sign(m.tilt) * Math.min(Math.abs(m.tilt), 0.6)) * dt, -1, 1);
      const force = (curv(m.x) - m.tilt) * A; m.v += (force - 9 * m.s - 3.2 * m.v) * dt; m.s += m.v * dt; m.x += m.speed * dt;
      if (Math.abs(m.s) > 0.35) { m.fault('spill'); m.s = 0; m.v = 0; m.x = Math.max(0, m.x - 1.5); }
      if (m.x >= len && m.state === 'play') m.win();
    };
    m.hint = () => { const want = curv(m.x + 0.2), e = want - m.tilt; return [['ArrowRight', e > 0.04], ['ArrowLeft', e < -0.04]]; };
    m.bad = () => { const want = curv(m.x + 0.2); m.held = {}; return want > 0 ? 'ArrowLeft' : 'ArrowRight'; };
    m.view = () => ({ bends: m.bends.map(b => b.map(v => +v.toFixed(2))) });
    m.buttons = () => [['ArrowLeft', '◀ lean'], ['ArrowRight', 'lean ▶']];
    m.draw = (c, W, H, P) => {
      txt(c, 'CORRIDOR AHEAD', 12, 18, { size: 11, col: COL.peri }); const x0 = 12, w = W - 24, sc = w / 5;
      c.strokeStyle = COL.lav; c.lineWidth = 3; c.beginPath(); for (let k = 0; k <= 60; k++) { const xx = m.x + k / 12, y = 44 - curv(xx) * 18; if (!k) c.moveTo(x0 + k / 12 * sc, y); else c.lineTo(x0 + k / 12 * sc, y); } c.stroke();
      c.fillStyle = COL.gold; c.beginPath(); c.arc(x0, 44 - curv(m.x) * 18, 5, 0, 6.283); c.fill();
      const cx = W / 2, cy = 118; c.save(); c.translate(cx, cy); c.rotate(m.tilt * 0.4); box(c, -46, -28, 92, 52, 'rgba(255,255,255,.07)', COL.ink, 8);
      c.fillStyle = 'rgba(244,194,91,.55)'; c.beginPath(); c.moveTo(-44, 6 + m.s * 60); c.lineTo(44, 6 - m.s * 60); c.lineTo(44, 22); c.lineTo(-44, 22); c.closePath(); c.fill();
      c.fillStyle = Math.abs(m.s) > 0.25 ? P.bad : P.good; c.fillRect(-50, -10, 4, 4); c.fillRect(46, -10, 4, 4); c.restore();
      txt(c, 'Lean', 12, H - 26, { size: 10, col: COL.dim }); bar(c, 12, H - 20, 120, 10, (m.tilt + 1) / 2, { mark: (curv(m.x) + 1) / 2 });
      txt(c, `${Math.round(Math.min(1, m.x / 14) * 100)} % of the way`, W - 12, H - 12, { size: 11, col: COL.pale, align: 'right' });
    };
    return m;
  },
});
