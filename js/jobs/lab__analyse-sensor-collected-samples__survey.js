// Lab technician, survey: analyse sensor-collected samples. The assay's response curve climbs and settles; the profile card's expected curve
// is a transparent overlay that starts out of step with it. Hold an arrow to slide the overlay along until its rise sits on the trace's rise;
// only then does the difference strip under the plot read true and show whether the trace carries a contamination shoulder. Report it clean
// (Space) or flag the shoulder (Enter). Judging before the overlay is aligned, or the wrong verdict, is a fault.
import { define, machine, ARROW, SPACE, ENTER, rf, pick, txt, COL } from './kit.js';

const sig = (x) => 1 / (1 + Math.exp(-x));
export default define({
  job: { billet: 'lab', label: 'Analyse sensor-collected samples', type: 'task:survey' },
  title: 'Slide the profile over the curve', dept: 'sciences', host: 'console', tool: 'Analysis cell and profile cards',
  how: 'Hold ← or → to slide the profile card overlay until it sits on the response curve\'s rise. Then read the difference strip: report clean (Space) or flag a shoulder (Enter).',
  keys: ['← → hold: slide the overlay', 'Space clean', 'Enter flag shoulder'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'overlay and diff', input: 'arrows-hold+space+enter', win: 'each assay curve overlaid on its profile card and reported clean or shouldered from the aligned difference',
    fail: 'giving a verdict before the profile overlay is lined up with the rise, or calling a shouldered curve clean',
    rule: 'Hold an arrow to slide the dashed profile left or right. When ALIGNED shows, the strip below shows the true difference: a bump means a shoulder (Enter), flat means clean (Space).' },
  rush: 'Glanced at the curve, said it looked like the card, and sent it.',
  captions: { unaligned: 'card not lined up', 'wrong verdict': 'error chime' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, tol = m.calm ? 0.035 : 0.025, speed = m.calm ? 0.22 : 0.3;
    const sh = new Set(); const n = pick(r, [1, 2]); while (sh.size < n) sh.add(Math.floor(r() * 3));
    m.cur = [0, 1, 2].map(k => ({ type: pick(r, ['Ice core', 'Regolith', 'Plasma trap', 'Aerosol', 'Brine']), mid: rf(r, 0.35, 0.6), off: rf(r, 0.12, 0.3) * pick(r, [1, -1]), shoulder: sh.has(k), sx: rf(r, 0.62, 0.82), id: `SC-${Math.floor(rf(r, 100, 999))}` }));
    m.k = 0; m.pos = 0; m.rounds = 3; m.round = 1;
    const C = () => m.cur[m.k];
    m.load = () => { m.pos = C().off; m.held = {}; }; m.load();
    m.trace = (x) => { const c = C(); return sig((x - c.mid) * 14) * 0.8 + (c.shoulder ? 0.12 * Math.exp(-((x - c.sx) ** 2) / 0.003) : 0); };
    m.prof = (x) => sig((x - C().mid - m.pos) * 14) * 0.8;
    const aligned = () => Math.abs(m.pos) < tol;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'L' || a === 'R') { m.held[a] = down; return true; }
      if (!down) return SPACE(code) || ENTER(code);
      if (SPACE(code) || ENTER(code)) {
        if (!aligned()) { m.fault('unaligned'); return true; }
        if (ENTER(code) !== C().shoulder) { m.fault('wrong verdict'); return true; }
        m.ev('report', { k: m.k }); m.k++; m.round = Math.min(3, m.k + 1); if (m.k >= 3) m.win(); else m.load(); return true;
      }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.held.L) m.pos -= speed * dt; if (m.held.R) m.pos += speed * dt; m.pos = Math.max(-0.45, Math.min(0.45, m.pos)); };
    m.hint = () => {
      if (m.state !== 'play') return []; const out = [];
      if (!(Math.abs(m.pos) < tol * 0.5)) { const d = m.pos > 0 ? 'L' : 'R'; out.push([d === 'L' ? 'ArrowLeft' : 'ArrowRight', true], [d === 'L' ? 'ArrowRight' : 'ArrowLeft', false]); return out; }
      out.push(['ArrowLeft', false], ['ArrowRight', false], [C().shoulder ? 'Enter' : 'Space', true]); return out;
    };
    m.bad = () => 'Space';
    m.view = () => ({ c: m.cur.map(c => [+c.mid.toFixed(2), +c.off.toFixed(2), c.shoulder]) });
    m.buttons = () => [['ArrowLeft', '◀ slide'], ['ArrowRight', 'slide ▶'], ['Space', 'Clean'], ['Enter', 'Shoulder']];
    m.draw = (c, W, H, P) => {
      const cc = C(); if (!cc) return; const x0 = 20, w = 300, y0 = 110, h = 90, al = aligned();
      txt(c, `${cc.id} · ${cc.type}`, x0, 14, { size: 11, col: COL.gold });
      c.lineWidth = 2; c.strokeStyle = COL.gold; c.beginPath(); for (let i = 0; i <= 60; i++) { const x = i / 60; c.lineTo(x0 + x * w, y0 - m.trace(x) * h); } c.stroke();
      c.setLineDash?.([5, 4]); c.strokeStyle = COL.peri; c.beginPath(); for (let i = 0; i <= 60; i++) { const x = i / 60; c.lineTo(x0 + x * w, y0 - m.prof(x) * h); } c.stroke(); c.setLineDash?.([]);
      c.strokeStyle = al ? COL.lav : 'rgba(255,255,255,.25)'; c.beginPath();
      for (let i = 0; i <= 60; i++) { const x = i / 60, d = al ? m.trace(x) - m.prof(x) : (m.trace(x) - m.prof(x)) * 0.15 + 0.03 * Math.sin(i * 1.7 + m.t * 6); c.lineTo(x0 + x * w, 150 - d * 120); } c.stroke();
      txt(c, 'diff', x0 + w + 6, 152, { size: 9, col: COL.dim });
      txt(c, al ? 'ALIGNED' : 'not aligned', 390, 40, { size: 12, col: al ? P.good : COL.warn, align: 'right' });
      txt(c, `offset ${(m.pos * 100).toFixed(0)}`, 390, 58, { size: 10, col: COL.dim, align: 'right' });
    };
    return m;
  },
});
