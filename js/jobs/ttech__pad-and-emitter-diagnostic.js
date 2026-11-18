// Transporter tech: pad and emitter diagnostic. The emitter probe sweeps in fast mode and each emitter's peak crosses the scope in turn,
// drawn over its timing band and its width bracket. Judge each peak while it is on the scope: Up passes a peak that sits inside its band and
// is no wider than the bracket; Down tags one that runs late (past the band) or wide (spills the bracket). Let a peak scroll off unjudged and
// it is missed; a wrong call sends a failing emitter back into service or pulls a good one.
import { define, machine, ARROW, rf, shuffle, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'ttech', label: 'Pad and emitter diagnostic', type: 'loop' },
  title: 'Emitter peak tagging on the sweep', dept: 'operations', host: 'console', tool: 'Emitter probe waveform',
  how: 'Each emitter peak crosses the scope over its band. Up passes a peak inside its band and bracket; Down tags a peak that is late or wide.',
  keys: ['Up pass the peak', 'Down tag late / wide'], limit: 26, maxFaults: 3,
  fingerprint: { verb: 'tag peaks', input: 'arrows', win: 'six emitter peaks judged on the sweep, every late or wide one tagged and every clean one passed',
    fail: 'passing a late or wide peak, tagging a clean one, or letting a peak scroll off unjudged',
    rule: 'A peak sits on the scope for about two seconds. If its crest is inside the timing band and its skirt fits inside the width bracket press Up; if the crest is past the band or the skirt spills the bracket press Down.' },
  rush: 'Glanced at the waveform, saw peaks, and wrote the pad up green.',
  captions: { 'passed a bad peak': 'low warning tone', 'tagged a good peak': 'error buzz', 'missed peak': 'sweep tick' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, gap = m.calm ? 3.3 : 2.4, win = m.calm ? 3.0 : 2.1, N = 6;
    const badIdx = new Set(shuffle(r, [0, 1, 2, 3, 4, 5]).slice(0, 2 + Math.floor(r() * 2)));
    m.peaks = Array.from({ length: N }, (_, k) => {
      const bad = badIdx.has(k), kind = bad ? (r() < 0.5 ? 'late' : 'wide') : 'ok';
      return { a: 0.8 + k * gap, kind, off: kind === 'late' ? rf(r, 1.15, 1.5) : rf(r, -0.7, 0.7), wid: kind === 'wide' ? rf(r, 1.25, 1.55) : rf(r, 0.5, 0.82), judged: false };
    });
    m.k = 0; m.rounds = N; m.round = 0;
    const live = () => { const p = m.peaks[m.k]; return p && m.t >= p.a && m.t <= p.a + win ? p : null; };
    const done = () => { m.k++; m.round++; if (m.k >= N) m.win(); };
    m.key = (code, down = true) => {
      const a = ARROW(code); if (a !== 'U' && a !== 'D') return false; if (m.state !== 'play' || !down) return true;
      const p = live(); if (!p) { m.fault('no peak'); return true; }
      if (a === 'U' && p.kind !== 'ok') m.fault('passed a bad peak'); else if (a === 'D' && p.kind === 'ok') m.fault('tagged a good peak');
      p.judged = true; done(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const p = m.peaks[m.k]; if (p && m.t > p.a + win) { m.fault('missed peak'); if (m.state === 'play') done(); } };
    m.hint = () => { const p = live(); return p && m.t >= p.a + 0.4 ? [[p.kind === 'ok' ? 'ArrowUp' : 'ArrowDown', true]] : []; };
    m.bad = () => { const p = live(); return p ? (p.kind === 'ok' ? 'ArrowDown' : 'ArrowUp') : null; };
    m.view = () => ({ peaks: m.peaks.map(p => [p.kind, +p.off.toFixed(2), +p.wid.toFixed(2)]) });
    m.buttons = () => [['ArrowUp', 'Pass'], ['ArrowDown', 'Tag']];
    m.draw = (c, W, H, P) => {
      const p = m.peaks[m.k], base = 128, cx = 200, bw = 46;
      txt(c, `EMITTER ${Math.min(m.k + 1, N)} / ${N}   sweep: FAST`, 16, 20, { size: 12, col: COL.pale });
      c.fillStyle = 'rgba(79,208,106,.16)'; c.fillRect(cx - bw, 30, bw * 2, base - 30); c.strokeStyle = P.good; c.lineWidth = 2; c.strokeRect(cx - bw, 30, bw * 2, base - 30);
      txt(c, 'BAND', cx, 44, { size: 10, col: P.good, align: 'center' });
      c.strokeStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.moveTo(14, base); c.lineTo(W - 14, base); c.stroke();
      if (!p) return; const shown = m.t >= p.a && m.t <= p.a + win, slide = shown ? 0 : 160;
      const px = cx + p.off * bw + slide, sig = p.wid * 22;
      c.setLineDash?.([4, 3]); c.strokeStyle = COL.lav; c.beginPath(); c.moveTo(px - 22, 60); c.lineTo(px - 22, base); c.moveTo(px + 22, 60); c.lineTo(px + 22, base); c.stroke(); c.setLineDash?.([]);
      txt(c, 'width bracket', px, 58, { size: 9, col: COL.lav, align: 'center' });
      c.strokeStyle = COL.gold; c.lineWidth = 2; c.beginPath();
      for (let x = 14; x <= W - 14; x += 2) { const y = base - 62 * Math.exp(-((x - px) ** 2) / (2 * (sig / 2) ** 2)) - 2 * Math.sin(x * 0.4 + m.t * 9); x === 14 ? c.moveTo(x, y) : c.lineTo(x, y); }
      c.stroke();
      if (shown) { const left = p.a + win - m.t; box(c, 16, 140, 120 * left / win, 6, COL.peri); txt(c, `on scope ${left.toFixed(1)} s`, 16, 160, { size: 10, col: COL.dim }); }
      else txt(c, 'next peak coming…', 16, 160, { size: 10, col: COL.dim });
      txt(c, 'Up pass · Down tag', W - 16, 160, { size: 10, col: COL.dim, align: 'right' });
    };
    return m;
  },
});
