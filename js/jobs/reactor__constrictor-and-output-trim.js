// Reactor specialist: constrictor and output trim. The output needle is on a sprung movement: every notch of the constrictor trim dial sets it
// swinging, and it only reads true once it has rung down. Notch toward the EPS demand band one click at a time and wait for the needle to settle
// before each next click. Clicking while it is still swinging is hunting; a click that carries the output past the far side of the band is an
// overshoot. Once it rests in the band it is watched through the stability count and recorded.
import { define, machine, ARROW, ri, rf, clamp, txt, bar, box, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'reactor', label: 'Constrictor and output trim', type: 'loop' },
  title: 'Constrictor notch-and-settle trim', dept: 'engineering', host: 'console', tool: 'Constrictor trim dial',
  how: 'Click the trim dial one notch toward the demand band (Up adds output, Down sheds it), then wait until the needle stops swinging before the next notch. Leave it settled in the band.',
  keys: ['Up add a notch', 'Down shed a notch'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'notch and settle', input: 'arrows', win: 'output needle rung down and resting inside the demand band for the stability count, on two demands',
    fail: 'clicking the dial while the needle still swings, or notching past the far edge of the band',
    rule: 'Each arrow press moves the dial one notch and sets the sprung needle ringing. The SETTLED lamp lights when it has rung down; only then click again. Rest inside the band through the count.' },
  rush: 'Spun the trim dial straight to the demand figure and walked off while the needle was still swinging.',
  captions: { hunting: 'needle chatters', overshoot: 'output over-demand buzz' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, step = 0.06, half = m.calm ? 0.04 : 0.032, hold = 1.0;
    m.rounds = 2; m.round = 1; m.x = 0.5; m.v = 0; m.watch = 0;
    m.plan = [0, 1].map(() => { const n = ri(r, 3, 4) * (r() < 0.5 ? -1 : 1); return n; });
    m.demand = clamp(0.5 + m.plan[0] * step + rf(r, -0.008, 0.008), 0.18, 0.82); m.tgt = 0.5;
    const settled = () => Math.abs(m.v) < 0.03 && Math.abs(m.x - m.tgt) < 0.015;
    const inBand = (y) => Math.abs(y - m.demand) <= half;
    m.key = (code, down = true) => {
      const a = ARROW(code); if (m.state !== 'play' || (a !== 'U' && a !== 'D')) return false; if (!down) return true;
      if (!settled()) m.fault('hunting');
      const before = m.tgt; m.tgt = clamp(m.tgt + (a === 'U' ? step : -step), 0.05, 0.95); m.watch = 0;
      const far = (m.tgt - m.demand) * Math.sign(m.tgt - before); if (far > half) { m.fault('overshoot'); }
      m.ev('notch', { dir: a }); return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const k = 14, c = m.calm ? 5 : 4.4;
      for (let s = 0; s < 3; s++) { const h = dt / 3; m.v += (k * (m.tgt - m.x) - c * m.v) * h; m.x += m.v * h; }
      if (settled() && inBand(m.x)) { m.watch += dt; if (m.watch >= hold) { m.ev('recorded', { round: m.round }); if (m.round >= 2) { m.win(); return; } m.round++; m.demand = clamp(m.tgt + m.plan[1] * step + rf(r, -0.008, 0.008), 0.12, 0.88); m.watch = 0; } } else m.watch = 0;
    };
    m.hint = () => { if (!settled() || inBand(m.tgt)) return []; return [[m.demand > m.tgt ? 'ArrowUp' : 'ArrowDown', true]]; };
    m.bad = () => 'ArrowUp';
    m.view = () => ({ plan: m.plan, d: +m.demand.toFixed(3) });
    m.buttons = () => [['ArrowUp', 'Notch up'], ['ArrowDown', 'Notch down']];
    m.draw = (c, W, H, P) => {
      const cx = 110, cy = 140, R = 100, ang = (y) => Math.PI + y * Math.PI;
      c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 8; c.beginPath(); c.arc(cx, cy, R, Math.PI, 2 * Math.PI); c.stroke();
      c.strokeStyle = P.good; c.lineWidth = 10; c.beginPath(); c.arc(cx, cy, R, ang(m.demand - half), ang(m.demand + half)); c.stroke();
      txt(c, 'DEMAND', cx + Math.cos(ang(m.demand)) * (R + 14), cy + Math.sin(ang(m.demand)) * (R + 14), { size: 9, col: P.good, align: 'center' });
      c.strokeStyle = COL.warn; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(ang(m.x)) * (R - 6), cy + Math.sin(ang(m.x)) * (R - 6)); c.stroke();
      const st = settled(); box(c, 230, 18, 150, 40, COL.panel, st ? P.good : COL.dim); lamp(c, 250, 38, 9, st ? P.good : P.bad, st ? 'circle' : 'triangle'); txt(c, st ? 'SETTLED' : 'SWINGING', 266, 43, { size: 13, col: st ? P.good : COL.warn });
      txt(c, `output ${Math.round(m.x * 1000)} MW · demand ${Math.round(m.demand * 1000)}`, 230, 80, { size: 11, col: COL.pale });
      txt(c, `trim notch ${Math.round((m.tgt - 0.5) / step)}   demand ${m.round} / 2`, 230, 100, { size: 11, col: COL.dim });
      txt(c, 'stability count', 230, 122, { size: 10, col: COL.dim }); bar(c, 230, 128, 150, 8, m.watch / hold, { col: COL.peri });
    };
    return m;
  },
});
