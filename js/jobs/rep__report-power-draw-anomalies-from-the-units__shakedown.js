// Replicator tech: report power-draw anomalies. Scrub the cursor along each unit's power trace (hold ← / →) and flag (Space) every spike above
// the baseline band, except the start-up surge right after a power-on mark, which is normal. File the trace (Enter) when all are flagged.
import { define, machine, ARROW, SPACE, ENTER, ri, rf, txt, COL } from './kit.js';

const UNITS = ['Galley replicator', 'Industrial replicator', 'Sickbay replicator', 'Mess replicator 2', 'Stores fabricator'], N = 40;
export default define({
  job: { billet: 'rep', label: 'Report power draw anomalies from the units', type: 'task:shakedown' },
  title: 'Power trace spike scrub', dept: 'services', host: 'console', tool: 'Unit power logger',
  how: 'Scrub along each power trace (hold ← / →), flag every spike above the band with Space, leave the start-up surge after a ▲ power-on mark alone, then Enter to file.',
  keys: ['← / → hold: scrub', 'Space flag', 'Enter file'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'scrub and flag', input: 'arrows-hold+space+enter', win: 'every true anomaly spike on three unit traces flagged with no start-up surge or flat sample flagged',
    fail: 'flagging a start-up surge or a flat stretch, or filing a trace with a spike left unflagged',
    rule: 'Move the cursor with ← / → (hold to scrub). Space flags the sample under it if a spike rises above the dashed band. Spikes within three samples after a ▲ power-on mark are start-up surges: never flag them. Enter files the trace.' },
  rush: 'Reported the peak draw figure for each unit and left the traces unread.',
  captions: { 'false flag': 'logger beep', 'missed spike': 'report bounced' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, speed = m.calm ? 9 : 12;
    m.tr = UNITS.slice(ri(r, 0, 2)).slice(0, 3).map(name => {
      const on = [ri(r, 2, 8), ri(r, 20, 26)], v = Array.from({ length: N }, () => rf(r, 0.25, 0.45)), spikes = [];
      for (const o of on) v[o + 1] = rf(r, 0.75, 0.95);
      const n = ri(r, 2, 3); for (let k = 0, tries = 0; k < n && tries < 50; tries++) { const x = ri(r, 1, N - 2); if (on.some(o => x >= o - 1 && x <= o + 4) || spikes.some(s => Math.abs(s - x) < 3)) continue; v[x] = rf(r, 0.7, 0.95); spikes.push(x); k++; }
      return { name, on, v, spikes: spikes.sort((a, b) => a - b), flag: new Set() };
    });
    m.k = 0; m.x = 0; m.rounds = 3; m.round = 0;
    const T = () => m.tr[m.k], near = (t) => t.spikes.find(s => Math.abs(s - m.x) <= 0.8);
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'L' || a === 'R') { m.held[a] = down; return true; }
      if (!down) return SPACE(code) || ENTER(code);
      if (SPACE(code)) { const t = T(), s = near(t); if (s == null) m.fault('false flag'); else t.flag.add(s); return true; }
      if (ENTER(code)) { const t = T(); if (t.spikes.some(s => !t.flag.has(s))) { m.fault('missed spike'); return true; } m.k++; m.round++; m.x = 0; m.held = {}; if (m.k >= 3) m.win(); return true; }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const d = (m.held.R ? 1 : 0) - (m.held.L ? 1 : 0); m.x = Math.max(0, Math.min(N - 1, m.x + d * speed * dt)); };
    m.hint = () => {
      const t = T(); if (!t) return []; const s = t.spikes.find(x => !t.flag.has(x));
      if (s == null) return [['ArrowRight', false], ['ArrowLeft', false], ['Enter', true]];
      if (Math.abs(s - m.x) <= 0.4) return [['ArrowRight', false], ['ArrowLeft', false], ['Space', true]];
      return [['ArrowRight', s > m.x], ['ArrowLeft', s < m.x]];
    };
    m.bad = () => 'Enter';
    m.view = () => ({ tr: m.tr.map(t => [t.name, t.spikes]) });
    m.buttons = () => [['ArrowLeft', '◀ scrub'], ['ArrowRight', 'scrub ▶'], ['Space', 'Flag'], ['Enter', 'File']];
    m.draw = (c, W, H, P) => {
      const t = T() || m.tr[2], x0 = 14, w = W - 28, y0 = 30, h = 100, X = (i) => x0 + i / (N - 1) * w, Y = (v) => y0 + h - v * h;
      txt(c, `${t.name.toUpperCase()}  ·  trace ${Math.min(m.k + 1, 3)} / 3`, 14, 18, { size: 12, col: COL.gold });
      c.strokeStyle = COL.warn; c.setLineDash?.([4, 3]); c.beginPath(); c.moveTo(x0, Y(0.55)); c.lineTo(x0 + w, Y(0.55)); c.stroke(); c.setLineDash?.([]);
      c.strokeStyle = COL.peri; c.lineWidth = 2; c.beginPath(); t.v.forEach((v, i) => { if (!i) c.moveTo(X(i), Y(v)); else c.lineTo(X(i), Y(v)); }); c.stroke();
      for (const o of t.on) txt(c, '▲', X(o), y0 + h + 14, { size: 11, align: 'center', col: COL.lav });
      for (const s of t.flag) txt(c, '⚑', X(s), Y(t.v[s]) - 4, { size: 12, align: 'center', col: P.good });
      c.fillStyle = COL.gold; c.fillRect(X(m.x) - 1, y0, 2, h);
    };
    return m;
  },
});
