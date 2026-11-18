// Pilot: launch and fly the survey pattern. A lawnmower pattern: four straight legs joined by 180° turns. On each leg a crosswind pushes the
// shuttle across the lane and you hold a little bank against it to stay on the line. At each end you must turn round, and a turn is only as
// fast as your bank is steep: bank past the pod limit and the sensor pod swings off its line (a fault). Shallow, patient turns win.
import { define, machine, rf, pick, clamp, txt, box, bar, COL, ARROW } from './kit.js';

export default define({
  job: { billet: 'pilot', label: 'Launch and fly survey pattern', type: 'task:survey' },
  title: 'Survey legs in a shallow bank', dept: 'flight', host: 'console', tool: 'Survey pattern card',
  how: 'Hold ← or → to bank. On a leg, bank gently into the crosswind to keep the shuttle inside the lane. At each corner hold the turn, but never bank past the POD LIMIT mark.',
  keys: ['← hold bank left', '→ hold bank right'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'bank shallow', input: 'arrows-hold',
    win: 'four survey legs flown inside the lane and three reversals made without passing the pod bank limit',
    fail: 'a steep bank that swings the sensor pod, or drifting out of the survey lane in the crosswind',
    rule: 'Holding an arrow rolls the shuttle into a bank. Bank lightly against the drift on each leg; at corners hold the turn but keep the bank meter under the pod limit.' },
  rush: 'Flew the pattern in steep yanks; half the survey is smeared.',
  captions: { 'pod swung': 'pod mount groans', 'off line': 'lane warning beep' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, LIM = m.calm ? 0.8 : 0.7, LEG = 3;
    m.legs = Array.from({ length: 4 }, () => +(pick(r, [-1, 1]) * rf(r, 0.15, 0.4)).toFixed(2));
    m.turns = [0, 1, 2].map(k => ({ dir: k % 2 ? -1 : 1, need: +rf(r, 1.4, 1.8).toFixed(2) }));
    m.leg = 0; m.phase = 'leg'; m.x = 0; m.y = 0; m.b = 0; m.h = 0; m.swung = false; m.round = 1; m.rounds = 4; m.trail = [];
    m.key = (code, down = true) => { if (m.state !== 'play') return false; const a = ARROW(code); if (a !== 'L' && a !== 'R') return false; m.held[a] = down; return true; };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const dir = (m.held.R ? 1 : 0) - (m.held.L ? 1 : 0);
      m.b = dir ? clamp(m.b + dir * 2.2 * dt, -1, 1) : m.b - Math.sign(m.b) * Math.min(Math.abs(m.b), 2.5 * dt);
      if (Math.abs(m.b) > LIM && !m.swung) { m.swung = true; m.fault('pod swung'); } else if (Math.abs(m.b) < LIM - 0.1) m.swung = false;
      if (m.state !== 'play') return;
      if (m.phase === 'leg') { m.x += dt / LEG; m.y += (m.legs[m.leg] + m.b * 0.9) * dt; if (Math.abs(m.y) > 1) { m.fault('off line'); m.y = 0; }
        if (m.x >= 1) { m.leg++; if (m.leg >= 4) { m.win(); return; } m.phase = 'turn'; m.h = 0; m.x = 0; } }
      else { const t = m.turns[m.leg - 1]; m.h += Math.max(0, m.b * t.dir) * 1.1 * dt; if (m.h >= t.need) { m.phase = 'leg'; m.y = 0; m.round = m.leg + 1; } }
    };
    m.hint = () => {
      if (m.phase === 'turn') { const t = m.turns[m.leg - 1], k = t.dir > 0 ? 'ArrowRight' : 'ArrowLeft', o = t.dir > 0 ? 'ArrowLeft' : 'ArrowRight'; return [[k, Math.abs(m.b) < LIM - 0.12], [o, false]]; }
      const want = clamp(-(m.legs[m.leg] + m.y * 1.5) / 0.9, -LIM + 0.15, LIM - 0.15), e = want - m.b; return [['ArrowRight', e > 0.05], ['ArrowLeft', e < -0.05]];
    };
    m.bad = () => 'ArrowRight';
    m.view = () => ({ legs: m.legs, turns: m.turns.map(t => t.need) });
    m.buttons = () => [['ArrowLeft', '◀ bank'], ['ArrowRight', 'bank ▶']];
    m.draw = (c, W, H, P) => {
      txt(c, m.phase === 'leg' ? `LEG ${m.leg + 1} of 4` : `CORNER ${m.leg}: TURN ${m.turns[m.leg - 1].dir > 0 ? 'RIGHT' : 'LEFT'}`, 12, 18, { size: 11, col: COL.peri });
      box(c, 12, 30, 220, 80, 'rgba(255,255,255,.05)', null, 6); c.strokeStyle = COL.dim; c.setLineDash([4, 4]); c.strokeRect(12, 50, 220, 40); c.setLineDash([]);
      if (m.phase === 'leg') { const px = 12 + 220 * Math.min(1, m.x), py = 70 - m.y * 20; c.fillStyle = Math.abs(m.y) > 0.75 ? P.bad : COL.gold; c.beginPath(); c.moveTo(px + 8, py); c.lineTo(px - 6, py - 6); c.lineTo(px - 6, py + 6); c.closePath(); c.fill();
        txt(c, `wind ${m.legs[m.leg] > 0 ? '↓' : '↑'}`, 226, 44, { size: 10, col: COL.dim, align: 'right' }); }
      else { const t = m.turns[m.leg - 1]; txt(c, 'Heading round', 22, 64, { size: 11, col: COL.pale }); bar(c, 22, 72, 200, 10, m.h / t.need, { band: [0.98, 1] }); }
      txt(c, 'BANK', 252, 40, { size: 11, col: COL.peri }); const cx = 320, cy = 80;
      c.save(); c.translate(cx, cy); c.rotate(m.b * 0.9); c.strokeStyle = COL.ink; c.lineWidth = 3; c.beginPath(); c.moveTo(-40, 0); c.lineTo(40, 0); c.moveTo(0, 0); c.lineTo(0, -10); c.stroke(); c.restore();
      txt(c, Math.abs(m.b) > LIM ? 'POD SWINGING' : 'pod steady', 320, 120, { size: 11, col: Math.abs(m.b) > LIM ? P.bad : P.good, align: 'center' });
      txt(c, 'Bank', 12, H - 26, { size: 10, col: COL.dim }); bar(c, 12, H - 20, 220, 10, (m.b + 1) / 2, { band: [(1 - LIM) / 2, (1 + LIM) / 2], mark: 0.5 });
      txt(c, '◀ pod limit ▶', 122, H - 26, { size: 9, col: COL.dim, align: 'center' });
    };
    return m;
  },
});
