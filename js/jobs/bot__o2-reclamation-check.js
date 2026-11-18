// Botanist: O2 reclamation check. The trace viewer overlays twelve hours of arboretum O2 output on the crew load board. Night-cycle dips open a
// gap that closes again; a failing reclaimer opens a gap that keeps widening. Scrub the cursor along the timeline (hold ← / →) and drop the onset
// marker (Enter) where the creeping gap begins. Marking a night dip is a false alarm; marking far from the onset is a vague drift note.
import { define, machine, ARROW, ENTER, rf, ri, clamp, txt, box, COL } from './kit.js';

const BAYS = ['Reclaimer A', 'Reclaimer B', 'Reclaimer C', 'Reclaimer D'];
export default define({
  job: { billet: 'bot', label: 'O2 reclamation check', type: 'loop' },
  title: 'O2 drift onset marker', dept: 'sciences', host: 'console', tool: 'O2 trace viewer',
  how: 'Hold ← / → to scrub the cursor along twelve hours of O2 output against crew load. Press Enter at the hour where the gap starts widening for good, not at a night dip that recovers.',
  keys: ['← / → hold: scrub', 'Enter: drop onset marker'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'mark the onset', input: 'arrows-hold+enter', win: 'the start of each creeping output gap pinned within half an hour on three reclaimer traces',
    fail: 'pinning a recovering night-cycle dip as a false alarm, or pinning far from where the drift began',
    rule: 'Two curves share one timeline. Scrub the cursor with held arrows; the shaded gap between them dips and recovers at night but a failing reclaimer opens it steadily. Enter at the first hour of the steady widening.' },
  rush: 'Wrote "slight drift, check later" without reading the trace.',
  captions: { 'false alarm': 'environmental pings back: night cycle', 'vague note': 'drift note rejected' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, tol = m.calm ? 0.7 : 0.5, speed = m.calm ? 2.4 : 3.2;
    m.traces = Array.from({ length: 3 }, (_, k) => {
      const onset = rf(r, 4.5, 10), dips = [];
      for (let n = ri(r, 1, 2), tries = 0; dips.length < n && tries < 20; tries++) { const a = rf(r, 0.8, onset - 1.6); if (dips.every(d => Math.abs(d - a) > 1.6)) dips.push(a); }
      return { bay: BAYS[k], onset, dips, slope: rf(r, 0.9, 1.4), load: rf(r, 0.45, 0.6), marked: null };
    });
    m.k = 0; m.c = 0; m.rounds = 3; m.round = 0;
    const T = () => m.traces[m.k];
    m.gap = (tr, h) => { let g = 0; for (const d of tr.dips) { const x = (h - d) / 0.7; if (x > -1 && x < 1) g += 0.9 * (1 - x * x); } if (h > tr.onset) g += (h - tr.onset) * tr.slope; return g * 0.07; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'L' || a === 'R') { m.held[a] = down; return true; }
      if (ENTER(code)) { if (!down) return true; const tr = T();
        if (Math.abs(m.c - tr.onset) <= tol) { tr.marked = m.c; m.k++; m.round++; m.c = 0; m.held = {}; if (m.k >= m.traces.length) m.win(); return true; }
        m.fault(tr.dips.some(d => Math.abs(m.c - d) < 0.9) ? 'false alarm' : 'vague note'); return true; }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.c = clamp(m.c + ((m.held.R ? 1 : 0) - (m.held.L ? 1 : 0)) * speed * dt, 0, 12); };
    m.hint = () => { const tr = T(); if (!tr) return []; const d = tr.onset - m.c;
      if (d > 0.15) return [['ArrowLeft', false], ['ArrowRight', true]]; if (d < -0.15) return [['ArrowRight', false], ['ArrowLeft', true]];
      return m.held.L || m.held.R ? [['ArrowLeft', false], ['ArrowRight', false]] : [['Enter', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ traces: m.traces.map(t => [+t.onset.toFixed(2), t.dips.map(d => +d.toFixed(2))]) });
    m.buttons = () => [['ArrowLeft', '◀ scrub'], ['ArrowRight', 'scrub ▶'], ['Enter', 'Mark onset']];
    m.draw = (c, W, H, P) => {
      const tr = T() || m.traces[m.traces.length - 1], x0 = 16, x1 = 300, y0 = 22, y1 = 138, X = h => x0 + (x1 - x0) * h / 12, Y = v => y1 - (y1 - y0) * v;
      box(c, x0 - 4, y0 - 6, x1 - x0 + 8, y1 - y0 + 12, 'rgba(255,255,255,.04)', null, 6);
      c.fillStyle = 'rgba(244,194,91,.18)'; c.beginPath(); c.moveTo(X(0), Y(tr.load));
      for (let h = 0; h <= 12; h += 0.1) c.lineTo(X(h), Y(tr.load)); for (let h = 12; h >= 0; h -= 0.1) c.lineTo(X(h), Y(tr.load - m.gap(tr, h))); c.fill();
      c.lineWidth = 2; c.strokeStyle = COL.peri; c.beginPath(); c.moveTo(X(0), Y(tr.load)); c.lineTo(X(12), Y(tr.load)); c.stroke();
      c.strokeStyle = COL.gold; c.beginPath(); for (let h = 0; h <= 12; h += 0.1) { const y = Y(tr.load - m.gap(tr, h)); h ? c.lineTo(X(h), y) : c.moveTo(X(h), y); } c.stroke();
      c.fillStyle = '#fff'; c.fillRect(X(m.c) - 1, y0 - 4, 3, y1 - y0 + 8);
      txt(c, `${String(Math.floor(m.c)).padStart(2, '0')}:${String(Math.floor((m.c % 1) * 60)).padStart(2, '0')}`, X(m.c), y0 - 8, { size: 10, align: 'center' });
      for (let h = 0; h <= 12; h += 3) txt(c, `${h}h`, X(h), y1 + 14, { size: 9, col: COL.dim, align: 'center' });
      txt(c, '— crew load', 310, 30, { size: 10, col: COL.peri }); txt(c, '— O2 output', 310, 44, { size: 10, col: COL.gold }); txt(c, '▒ gap', 310, 58, { size: 10, col: COL.pale });
      m.traces.forEach((t, i) => txt(c, `${t.bay}${t.marked != null ? ' ✓' : i === m.k ? ' ◀' : ''}`, 310, 88 + i * 16, { size: 10, col: t.marked != null ? P.good : i === m.k ? COL.orange : COL.dim }));
    };
    return m;
  },
});
