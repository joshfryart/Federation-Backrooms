// Cook: prepare a sealed, easy meal for the science crew at consoles. The covered tray is carried down the long corridor to the consoles with
// one hand, and the ship leans: a steady list pulls the tray over, plus swells from the corridor. Hold Left / Right to tilt the tray back against
// the lean and keep it level for the whole walk. A tray that tips past the rim spills.
import { define, machine, ARROW, rf, txt, box, COL } from './kit.js';

const WALK = 14;
export default define({
  job: { billet: 'cook', label: 'Prepare a sealed, easy meal for the science crew at consoles', type: 'task:survey' },
  title: 'Carry the tray against the list', dept: 'services', host: 'console', tool: 'Covered tray and tilt gauge',
  how: 'The deck is listing. Hold Left / Right to tilt the tray back level; keep the bubble inside the rim for the whole walk to the consoles.',
  keys: ['hold Left / Right: tilt the tray'], limit: 28, maxFaults: 3,
  fingerprint: { verb: 'tilt level', input: 'arrows-hold',
    win: 'the tray walked fourteen seconds to the consoles with the tilt bubble kept inside the rim against a steady list',
    fail: 'letting the tilt bubble run over the rim so the tray spills, three times',
    rule: 'The list pushes the tilt one way and swells nudge it both. Holding Left or Right pushes back; the tilt carries momentum, so ease off before it passes level.' },
  rush: 'Carried it with a thumb on the soup and mopped the corridor afterwards.',
  captions: { spill: 'tray spills' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, k = m.calm ? 0.7 : 1, bias = rf(r, 1.1, 1.6) * k * (r() < 0.5 ? 1 : -1);
    m.a = [rf(r, 0.5, 1) * k, rf(r, 0.25, 0.6) * k]; m.ph = [rf(r, 0, 6.28), rf(r, 0, 6.28)]; m.th = 0; m.w = 0; m.dir = 0; m.out = false; m.held = { L: false, R: false };
    m.key = (code, down = true) => { if (m.state !== 'play') return false; const a = ARROW(code); if (a === 'L' || a === 'R') { m.held[a] = down; return true; } return !!a; };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const d = (m.held.R ? 1 : 0) - (m.held.L ? 1 : 0), g = bias + m.a[0] * Math.sin(m.t * 1.7 + m.ph[0]) + m.a[1] * Math.sin(m.t * 3.1 + m.ph[1]);
      m.w += (g + d * 5 - m.w * 1.1) * dt; m.th += m.w * dt; if (Math.abs(m.th) > 1 && !m.out) { m.out = true; m.fault('spill'); m.th *= 0.5; m.w = 0; } else if (Math.abs(m.th) < 0.7) m.out = false;
      if (m.state === 'play' && m.t >= WALK) m.win();
    };
    m.hint = () => { if (m.state !== 'play') return []; const e = m.th + 0.45 * m.w; return e > 0.08 ? [['ArrowRight', false], ['ArrowLeft', true]] : e < -0.08 ? [['ArrowLeft', false], ['ArrowRight', true]] : [['ArrowLeft', false], ['ArrowRight', false]]; };
    m.bad = () => null;
    m.view = () => ({ b: +bias.toFixed(2), a: m.a.map(x => +x.toFixed(2)), ph: m.ph.map(x => +x.toFixed(2)) });
    m.buttons = () => [['ArrowLeft', '◀ tilt'], ['ArrowRight', 'tilt ▶']];
    m.draw = (c, W, H, P) => {
      const th = Math.max(-1.2, Math.min(1.2, m.th)); c.save(); c.translate(200, 96); c.rotate(th * 0.35); box(c, -90, -8, 180, 16, '#33304f', COL.gold, 4); c.beginPath(); c.arc(th * 70, -18, 10, 0, 6.283); c.fillStyle = Math.abs(m.th) > 0.7 ? P.bad : COL.pale; c.fill(); c.restore();
      box(c, 60, 20, 280, 12, COL.panel, COL.dim, 6); box(c, 60 + 140 - 98, 20, 196, 12, 'rgba(79,208,106,.2)', null, 6); c.fillStyle = Math.abs(m.th) > 0.7 ? P.bad : COL.gold; c.fillRect(200 + Math.max(-1, Math.min(1, m.th)) * 140 - 3, 17, 6, 18);
      txt(c, `corridor ${Math.min(100, Math.round(m.t / WALK * 100))} %`, 14, 160, { size: 10, col: COL.dim }); txt(c, 'RIM', 52, 30, { size: 9, align: 'right', col: COL.dim });
    };
    return m;
  },
});
