// Nurse: screen the returning survey team. Each member stands in the sickbay gate while you sweep the dosimeter wand along their outline. Hold
// Left / Right to move the wand: the reading climbs near a hot spot (contaminated kit or skin) and sits flat otherwise. If there is a hot spot, put
// the wand on its peak and press Enter to mark it for the biobed. If the whole sweep stays flat, sweep both ends then press Space to clear them.
import { define, machine, ARROW, SPACE, ENTER, ri, rf, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'nurse', label: 'Screen returning survey team', type: 'task:survey' },
  title: 'Sweep the wand to the hot spot', dept: 'medical', host: 'console', tool: 'Dosimeter wand and body outline',
  how: 'Hold Left / Right to sweep the wand along each member. Enter marks a hot spot when the reading peaks under the wand; Space clears a member after a flat sweep of both ends.',
  keys: ['hold Left / Right: sweep', 'Enter: mark the peak', 'Space: clear (flat sweep)'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'sweep for peak', input: 'arrows-hold+enter+space',
    win: 'four returning members each either marked at the exact peak of a hot spot or cleared after the wand had swept both ends flat',
    fail: 'marking beside the peak, clearing a member who has a hot spot, or clearing one before both ends were swept',
    rule: 'The wand moves only while Left or Right is held; the reading rises toward a hot spot. Enter with the wand on the peak marks it; Space clears a member only after the wand has touched both ends.' },
  rush: 'Waved the team through and asked them to report symptoms later.',
  captions: { 'off peak': 'mark placed beside the hot spot', 'false clear': 'member cleared with a hot spot', 'unswept': 'cleared before a full sweep' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, sp = m.calm ? 0.4 : 0.55, tol = m.calm ? 0.06 : 0.045; m.x = 0.5; m.n = 0; m.rounds = 4; m.held = { L: false, R: false };
    m.crew = Array.from({ length: 4 }, (_, i) => ({ hot: i === 1 ? false : r() < 0.7, px: rf(r, 0.15, 0.85), amp: rf(r, 5, 9), w: rf(r, 0.07, 0.12) })); if (!m.crew.some(q => q.hot)) m.crew[0].hot = true; m.vis = { lo: false, hi: false };
    const q = () => m.crew[m.n], rd = (x) => 1.1 + (q().hot ? q().amp * Math.exp(-(((x - q().px) / q().w) ** 2)) : 0.3 * Math.sin(x * 9));
    const next = () => { m.n++; m.round = m.n; m.vis = { lo: false, hi: false }; if (m.n >= m.crew.length) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code); if (a === 'L' || a === 'R') { m.held[a] = down; return true; } if (a) return true;
      if (!down) return SPACE(code) || ENTER(code);
      if (ENTER(code)) { if (q().hot && Math.abs(m.x - q().px) <= tol) next(); else m.fault('off peak'); return true; }
      if (SPACE(code)) { if (q().hot) m.fault('false clear'); else if (!(m.vis.lo && m.vis.hi)) m.fault('unswept'); else next(); return true; } return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.x = Math.max(0, Math.min(1, m.x + ((m.held.R ? 1 : 0) - (m.held.L ? 1 : 0)) * sp * dt)); if (m.x < 0.05) m.vis.lo = true; if (m.x > 0.95) m.vis.hi = true; };
    m.hint = () => {
      if (m.state !== 'play') return []; const c = q();
      if (c.hot) { const dx = c.px - m.x; return Math.abs(dx) < tol * 0.5 ? [['ArrowLeft', false], ['ArrowRight', false], ['Enter', true]] : dx > 0 ? [['ArrowLeft', false], ['ArrowRight', true]] : [['ArrowRight', false], ['ArrowLeft', true]]; }
      if (!m.vis.lo) return [['ArrowRight', false], ['ArrowLeft', true]]; if (!m.vis.hi) return [['ArrowLeft', false], ['ArrowRight', true]]; return [['ArrowLeft', false], ['ArrowRight', false], ['Space', true]];
    };
    m.bad = () => 'Enter';
    m.view = () => ({ crew: m.crew.map(c => [c.hot, +c.px.toFixed(2), +c.amp.toFixed(1)]) });
    m.buttons = () => [['ArrowLeft', '◀ sweep'], ['ArrowRight', 'sweep ▶'], ['Enter', 'Mark'], ['Space', 'Clear']];
    m.draw = (c, W, H, P) => {
      if (m.n >= m.crew.length) return; txt(c, `member ${m.n + 1}/4`, 14, 16, { size: 11, col: COL.gold }); box(c, 30, 40, 340, 46, COL.panel, COL.dim, 8);
      c.strokeStyle = COL.peri; c.lineWidth = 2; c.beginPath(); for (let i = 0; i <= 68; i++) { const x = i / 68; c[i ? 'lineTo' : 'moveTo'](30 + x * 340, 134 - rd(x) * 8); } c.stroke();
      c.fillStyle = COL.gold; c.fillRect(30 + m.x * 340 - 2, 36, 4, 56); txt(c, `${rd(m.x).toFixed(1)} mSv`, 30 + m.x * 340, 106, { size: 11, align: 'center', col: COL.gold });
      txt(c, m.vis.lo ? '◀ head end swept' : '◀ head end', 30, 160, { size: 9, col: m.vis.lo ? P.good : COL.dim }); txt(c, m.vis.hi ? 'foot end swept ▶' : 'foot end ▶', 370, 160, { size: 9, align: 'right', col: m.vis.hi ? P.good : COL.dim });
    };
    return m;
  },
});
