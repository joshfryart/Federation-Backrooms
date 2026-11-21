// Doc: review lab samples for biohazard. Each sample sits blurred under the lens. Hold Left/Right to wind the focus knob until the cell layer
// is sharp, then read it: any odd-shaped cell means hazard (2), a plain layer is safe (1). Marking before the layer is sharp, or marking wrong, is a fault.
import { define, machine, ARROW, DIG, rf, ri, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'doc', label: 'Review lab samples for biohazard', type: 'task:survey' },
  title: 'Focus the cell layer and mark', dept: 'medical', host: 'console', tool: 'Microscope and custody form',
  how: 'Hold Left/Right to wind the lens until the cell layer is sharp. If one cell is a different shape, press 2 (hazard); if all are round, press 1 (safe).',
  keys: ['Left/Right hold: wind focus', '1 mark safe', '2 mark hazard'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'focus and grade', input: 'arrows-hold+digits', win: 'three lab samples each brought into sharp focus and marked safe or hazard on the custody form correctly',
    fail: 'marking a sample while it is still blurred, or marking a hazard safe or a plain sample hazard',
    rule: 'Hold Left or Right to wind the knob; the picture is sharp only near one setting. Once sharp, count odd cells: any odd cell means press 2, none means press 1.' },
  rush: 'Glanced at the slide and signed the custody form from the label alone.',
  captions: { blurred: 'form stamp thud', 'wrong mark': 'form stamp thud' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, band = m.calm ? 0.07 : 0.05;
    m.S = [0, 1, 2].map(() => ({ t: rf(r, 0.2, 0.8), haz: r() < 0.5, odd: ri(r, 0, 5) })); m.S[ri(r, 0, 2)].haz = true;
    m.i = 0; m.f = 0.5; m.rounds = 3; m.round = 0;
    const sharp = () => Math.abs(m.f - m.S[Math.min(2, m.i)].t) <= band;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'L' || a === 'R') { m.held[a] = !!down; return true; }
      const d = DIG(code); if (!down || (d !== 1 && d !== 2)) return false;
      if (!sharp()) { m.fault('blurred'); return true; }
      if ((d === 2) !== m.S[m.i].haz) { m.fault('wrong mark'); return true; }
      m.i++; m.round++; m.f = rf(r, 0.1, 0.9); if (m.i >= 3) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.f = Math.max(0, Math.min(1, m.f + ((m.held.R ? 1 : 0) - (m.held.L ? 1 : 0)) * 0.5 * dt)); };
    m.hint = () => { const s = m.S[Math.min(2, m.i)], e = m.f - s.t;
      if (e < -band / 2) return [['ArrowRight', true], ['ArrowLeft', false]]; if (e > band / 2) return [['ArrowLeft', true], ['ArrowRight', false]];
      return [['ArrowLeft', false], ['ArrowRight', false], [s.haz ? 'Digit2' : 'Digit1', true]]; };
    m.bad = () => 'Digit1';
    m.view = () => ({ S: m.S.map(s => [+s.t.toFixed(2), s.haz, s.odd]) });
    m.buttons = () => [['ArrowLeft', 'Focus -'], ['ArrowRight', 'Focus +'], ['Digit1', 'Safe'], ['Digit2', 'Hazard']];
    m.draw = (c, W, H, P) => {
      const s = m.S[Math.min(2, m.i)], blur = Math.min(1, Math.abs(m.f - s.t) / 0.25); box(c, 20, 12, 170, 146, '#0d0c18', COL.dim);
      for (let k = 0; k < 6; k++) { const x = 55 + (k % 3) * 50, y = 55 + Math.floor(k / 3) * 60, hz = s.haz && k === s.odd; c.globalAlpha = 1 - 0.8 * blur; c.strokeStyle = hz ? P.bad : COL.pale; c.lineWidth = 2; c.beginPath();
        if (hz) { c.moveTo(x, y - 16); c.lineTo(x + 15, y + 12); c.lineTo(x - 15, y + 12); c.closePath(); } else c.arc(x, y, 14 + blur * 5, 0, 7); c.stroke(); } c.globalAlpha = 1;
      txt(c, 'FOCUS', 215, 40, { size: 12, col: COL.dim }); bar(c, 215, 48, 160, 10, m.f, { mark: s.t, col: COL.peri });
      txt(c, sharp() ? 'SHARP - read it' : 'blurred', 215, 84, { size: 14, col: sharp() ? P.good : COL.warn });
      txt(c, `sample ${Math.min(3, m.i + 1)} / 3`, 215, 112, { size: 12, col: COL.pale });
    };
    return m;
  },
});
