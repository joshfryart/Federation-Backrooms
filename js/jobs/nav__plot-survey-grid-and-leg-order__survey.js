// Navigator: plot the survey grid and leg order. Rule the survey legs across the area one by one, left to right, so each sits a sensor
// swath (or a touch less) from the last: wider leaves an unscanned gap, much narrower doubles the scan. A leg ruled through a hazard
// marker must be moved. Move the pen (← →) and rule the leg (Space); the legs run up and down in turn so the ship never doubles back.
import { define, machine, ARROW, SPACE, ri, txt, box, lamp, COL } from './kit.js';

const N = 30;
export default define({
  job: { billet: 'nav', label: 'Plot survey grid and leg order', type: 'task:survey' },
  title: 'Survey leg ruling', dept: 'flight', host: 'console', tool: 'Chart sheet and ruling pen',
  how: 'Move the pen (← →) and rule each survey leg (Space) one swath from the last: no gap, little overlap, and clear of the hazard markers, until the far edge is covered.',
  keys: ['← → move the pen', 'Space rule the leg'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'rule the swaths', input: 'arrows+space', win: 'the survey area covered edge to edge by legs spaced one sensor swath apart, none on a hazard marker',
    fail: 'ruling a leg too far from the last so the sweep leaves a gap, too close so the scans overlap, or through a hazard',
    rule: 'The brief prints the swath width. Each new leg must be that many columns, or one fewer, past the last leg, and not on a hazard column. Space rules the leg under the pen.' },
  rush: 'Ruled the legs by eye at whatever spacing fitted the sheet.',
  captions: { gap: 'coverage gap tone', overlap: 'double-scan tone', hazard: 'hazard buzz' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, Wd = ri(r, 4, 6), lo = Wd - (m.calm ? 2 : 1);
    m.W = Wd; m.legs = [1]; m.pen = 1; m.haz = new Set();
    for (let k = 0; k < 4; k++) { const c = ri(r, 4, N - 3); if (!m.haz.has(c - 1) && !m.haz.has(c + 1)) m.haz.add(c); }
    m.rounds = Math.ceil((N - 2) / Wd); m.round = 0;
    const last = () => m.legs[m.legs.length - 1], target = () => { const a = last() + Wd; return m.haz.has(a) ? a - 1 : a; };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a === 'L' || a === 'R') { m.pen = Math.max(0, Math.min(N - 1, m.pen + (a === 'R' ? 1 : -1))); return true; }
      if (!SPACE(code)) return !!a;
      const gp = m.pen - last();
      if (gp > Wd) { m.fault('gap'); return true; }
      if (gp < lo) { m.fault('overlap'); return true; }
      if (m.haz.has(m.pen)) { m.fault('hazard'); return true; }
      m.legs.push(m.pen); m.round++; m.ev('leg', { x: m.pen }); if (m.pen >= N - 1 - Wd + 1) m.win(); return true;
    };
    m.hint = () => { const t = target(); return [[m.pen < t ? 'ArrowRight' : m.pen > t ? 'ArrowLeft' : 'Space', true]]; };
    m.bad = () => (m.pen < last() + Wd + 2 ? 'ArrowRight' : 'Space');
    m.view = () => ({ W: Wd, haz: [...m.haz] });
    m.buttons = () => [['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['Space', 'Rule leg']];
    m.draw = (c, W, H, P) => {
      const x0 = 14, y0 = 26, cw = 12, h = 118; box(c, x0, y0, N * cw, h, 'rgba(125,151,232,.07)', COL.peri, 3);
      txt(c, `BRIEF: swath ${Wd} columns · legs ${m.legs.length}`, x0, 16, { size: 11, col: COL.peri });
      for (const hz of m.haz) { c.fillStyle = 'rgba(255,90,72,.25)'; c.fillRect(x0 + hz * cw, y0 + 40, cw, 30); lamp(c, x0 + hz * cw + cw / 2, y0 + 55, 5, P.bad, 'triangle'); }
      m.legs.forEach((x, i) => { const cx = x0 + x * cw + cw / 2; c.fillStyle = 'rgba(79,208,106,.10)'; c.fillRect(cx - Wd * cw / 2, y0, Wd * cw, h); c.strokeStyle = COL.gold; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, y0 + 4); c.lineTo(cx, y0 + h - 4); c.stroke(); txt(c, (i % 2 ? '▼' : '▲') + (i + 1), cx, y0 + h + 12, { size: 8, col: COL.pale, align: 'center' }); });
      const px = x0 + m.pen * cw + cw / 2; c.strokeStyle = COL.orange; c.setLineDash?.([3, 3]); c.beginPath(); c.moveTo(px, y0); c.lineTo(px, y0 + h); c.stroke(); c.setLineDash?.([]);
      txt(c, `pen +${m.pen - last()}`, Math.min(px + 4, 340), y0 + 12, { size: 10, col: COL.orange });
    };
    return m;
  },
});
