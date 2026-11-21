// Cook: bulk water and broth. Work the pump handle on the beat: a pulse ring crosses the marker every beat and Space must land on it. A stroke
// that is off the beat sloshes the vat over. Eight good strokes fill the tank.
import { define, machine, SPACE, txt, bar, COL } from './kit.js';

export default define({
  job: { billet: 'cook', label: 'Make extra water and broth in bulk', type: 'task:medical_relief' },
  title: 'Pump the vat on the beat', dept: 'services', host: 'console', tool: 'Bulk vat pump',
  how: 'The pump handle works on a steady beat. Press Space as the beat ring reaches the marker; off-beat strokes slop the vat.',
  keys: ['Space pump stroke on the beat'], limit: 20, maxFaults: 3,
  fingerprint: { verb: 'pump on beat', input: 'rhythm+space', win: 'eight pump strokes landed on the beat to fill the vat',
    fail: 'working the handle off the beat or twice on one beat until the vat slops over',
    rule: 'A ring closes on the marker every beat. Press Space once as it arrives; a press far from a beat, or a second press on the same beat, is a slop.' },
  rush: 'Hauled the handle as fast as you could and let the vat overflow onto the floor.',
  captions: { slop: 'vat slops over' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, p = m.calm ? 1 : 0.8, tol = m.calm ? 0.24 : 0.16, t0 = 1 + r() * 0.5; m.level = 0; m.beats = []; for (let i = 0; i < 12; i++) m.beats.push({ at: t0 + i * p, used: false });
    const nb = () => m.beats.find(b => !b.used && m.t >= b.at - tol);
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down || !SPACE(code)) return false; const b = nb();
      if (!b || Math.abs(m.t - b.at) > tol) { m.fault('slop'); return true; } b.used = true; m.level++; if (m.level >= 8) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; for (const b of m.beats) if (!b.used && m.t > b.at + tol) b.used = true; };
    m.hint = () => { const b = m.beats.find(x => !x.used); return b && m.t >= b.at - 0.02 ? [['Space', true]] : []; };
    m.bad = () => 'Space';
    m.view = () => ({ p, t0: +t0.toFixed(2) });
    m.buttons = () => [['Space', 'Pump']];
    m.draw = (c, W, H, P) => {
      const b = m.beats.find(x => !x.used) || m.beats[m.beats.length - 1], k = Math.max(0, Math.min(1, (b.at - m.t) / p)); const rad = 12 + k * 46;
      c.strokeStyle = COL.gold; c.lineWidth = 3; c.beginPath(); c.arc(110, 80, rad, 0, 6.283); c.stroke(); c.strokeStyle = '#fff'; c.beginPath(); c.arc(110, 80, 12, 0, 6.283); c.stroke();
      txt(c, 'VAT', 220, 40, { size: 11, col: COL.dim }); bar(c, 220, 48, 150, 14, m.level / 8, { col: COL.peri }); txt(c, `${m.level} / 8 strokes`, 220, 90, { size: 13, col: COL.pale });
      txt(c, `beat ${p.toFixed(1)} s`, 220, 120, { size: 11, col: COL.dim }); };
    return m;
  },
});
