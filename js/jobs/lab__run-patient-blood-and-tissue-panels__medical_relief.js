// Lab technician, medical relief: run patient blood and tissue panels. The pipette tip drifts with your hand over the panel plate. Hold the
// arrows to keep the tip centred over the patient's well while you hold Space to depress the plunger; let go of Space when the liquid reaches
// the well's fill line. Dispensing while the tip has wandered off the well puts a drop in the neighbour (another patient's well); pushing past
// the line over-fills it. Either way the well is wiped and refilled.
import { define, machine, ARROW, SPACE, ri, rf, pick, shuffle, clamp, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'lab', label: 'Run patient blood and tissue panels', type: 'task:medical_relief' },
  title: 'Steady tip, fill to the line', dept: 'sciences', host: 'console', tool: 'Pipette over the panel plate',
  how: 'Hold ← → to keep the drifting pipette tip over the well, and hold Space to dispense. Let go of Space when the liquid reaches the fill line. Dispensing off the well spills into the neighbour.',
  keys: ['← → hold: steady the tip', 'Space hold: dispense'], limit: 38, maxFaults: 3,
  fingerprint: { verb: 'steady and dispense', input: 'arrows-hold+space-hold', win: 'each patient well filled to its line from a pipette tip held over the well against hand drift',
    fail: 'dispensing while the drifting tip is off the well so a drop lands in another patient\'s well, or pushing past the fill line',
    rule: 'The tip wanders on its own. Hold the opposite arrow to bring it back inside the well rim, hold Space to dispense only while it is inside, and release Space as the level meets the line.' },
  rush: 'Squirted each well by eye and let the reader sort it out.',
  captions: { spilled: 'drop in the next well', overfilled: 'well brims over' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, rim = m.calm ? 0.16 : 0.12, band = m.calm ? 0.06 : 0.045, rate = m.calm ? 0.3 : 0.38;
    const pts = shuffle(r, ['P-0412', 'P-0417', 'P-0471', 'P-1047', 'P-0714', 'P-4071']);
    m.wells = [0, 1, 2, 3].map(k => ({ pt: pts[k], marker: pick(r, ['Hb', 'WBC', 'CRP', 'Na', 'Lactate', 'Troponin']), line: rf(r, 0.55, 0.8), fill: 0 }));
    m.k = 0; m.tip = rf(r, -0.2, 0.2); m.v = 0; m.drift = rf(r, 0.1, 0.16) * (m.calm ? 0.75 : 1); m.ph = rf(r, 0, 6); m.rounds = 4; m.round = 1;
    const W = () => m.wells[m.k], on = () => Math.abs(m.tip) < rim;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'L' || a === 'R') { m.held[a] = down; return true; }
      if (SPACE(code)) {
        const was = m.held.S; m.held.S = down;
        if (was && !down) { const w = W(); if (w.fill >= w.line - band) { m.ev('filled', { k: m.k }); m.k++; m.round = Math.min(4, m.k + 1); if (m.k >= 4) m.win(); } }
        return true;
      }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return;
      m.v = Math.sin(m.t * 0.9 + m.ph) * m.drift + Math.sin(m.t * 2.3 + m.ph * 2) * m.drift * 0.4;
      m.tip = clamp(m.tip + (m.v + (m.held.L ? -0.42 : 0) + (m.held.R ? 0.42 : 0)) * dt, -0.6, 0.6);
      if (m.held.S) {
        const w = W(); if (!w) return;
        if (!on()) { m.fault('spilled'); w.fill = 0; m.held.S = false; return; }
        w.fill += rate * dt; if (w.fill > w.line + band) { m.fault('overfilled'); w.fill = 0; m.held.S = false; }
      }
    };
    m.hint = () => {
      if (m.state !== 'play') return []; const w = W(), out = [], c = rim * 0.35;
      out.push(['ArrowLeft', m.tip > c], ['ArrowRight', m.tip < -c]);
      out.push(['Space', Math.abs(m.tip) < rim * 0.6 && w.fill < w.line]);
      return out;
    };
    m.bad = () => ['Space', true];
    m.view = () => ({ w: m.wells.map(w => [w.pt, +w.line.toFixed(2)]), d: +m.drift.toFixed(3) });
    m.buttons = () => [['ArrowLeft', '◀ steady'], ['ArrowRight', 'steady ▶'], ['Space', 'Dispense (hold)']];
    m.draw = (c, W2, H, P) => {
      const w = W(); if (!w) return; const cx = 200, sc = 300, wy = 70, wh = 80, ww = rim * 2 * sc;
      txt(c, `${w.pt} · ${w.marker}`, 12, 16, { size: 12, col: COL.gold }); txt(c, `well ${m.k + 1} / 4`, 388, 16, { size: 11, col: COL.dim, align: 'right' });
      for (const dx of [-1, 1]) box(c, cx + dx * (ww + 20) - ww / 2, wy, ww, wh, null, 'rgba(255,255,255,.18)', 4);
      box(c, cx - ww / 2, wy, ww, wh, COL.panel, COL.peri, 4);
      c.fillStyle = COL.pale; c.fillRect(cx - ww / 2 + 2, wy + wh - w.fill * wh, ww - 4, w.fill * wh);
      c.fillStyle = P.good; c.fillRect(cx - ww / 2 - 6, wy + wh - w.line * wh - 1, ww + 12, 2); txt(c, 'line', cx + ww / 2 + 8, wy + wh - w.line * wh + 4, { size: 9, col: P.good });
      const tx = cx + m.tip * sc, ok = on(); c.strokeStyle = ok ? COL.ink : COL.warn; c.lineWidth = 3; c.beginPath(); c.moveTo(tx, 22); c.lineTo(tx, wy - 4); c.stroke();
      txt(c, ok ? 'over the well' : 'OFF THE WELL', 12, 160, { size: 12, col: ok ? P.good : COL.warn });
    };
    return m;
  },
});
