// Botanist: weigh out medicinal herbs for sickbay. Add or take away leaf on the balance pan in pinches and sprinkles; the beam swings after
// every change and only settles after a moment. Record the dose (Enter) only once the beam is still and reads the target from the dose sheet.
import { define, machine, ARROW, ENTER, ri, pick, txt, box, COL } from './kit.js';

const HERBS = ['Willow bark', 'Feverfew', 'Comfrey leaf', 'Valerian root', 'Yarrow', 'Calendula', 'Chamomile', 'Echinacea'];
export default define({
  job: { billet: 'bot', label: 'Prepare medicinal herbs and extracts for sickbay', type: 'task:medical_relief' },
  title: 'Herb balance dosing', dept: 'sciences', host: 'console', tool: 'Beam balance',
  how: 'Weigh each herb to the gram on the dose sheet: → pinch (+0.3 g), ↑ sprinkle (+0.1 g), ← / ↓ take away. Wait for the beam to stop swinging, then Enter records it.',
  keys: ['→ +0.3 g', '↑ +0.1 g', '← −0.3 g', '↓ −0.1 g', 'Enter record'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'weigh out', input: 'arrows+enter', win: 'three herb doses recorded exactly on target with the balance beam at rest',
    fail: 'recording while the beam is still swinging, or recording a dose that is off the sheet',
    rule: 'Each change sets the beam swinging; the pointer only reads true when it has stopped. Build the dose from 0.3 g pinches and 0.1 g sprinkles, then Enter when the beam is still on the target.' },
  rush: 'Measured by the handful and wrote the sheet figures down.',
  captions: { 'read a swinging beam': 'balance rattles', 'wrong dose': 'pharmacist frowns' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, still = m.calm ? 0.06 : 0.04;
    m.doses = Array.from({ length: 3 }, () => ({ herb: pick(r, HERBS), want: ri(r, 12, 34), got: null }));
    m.k = 0; m.w = 0; m.pos = 0; m.vel = 0; m.rounds = 3; m.round = 0;
    const D = () => m.doses[m.k];
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a) { m.w = Math.max(0, m.w + { R: 3, U: 1, L: -3, D: -1 }[a]); m.vel += (a === 'R' || a === 'U' ? 1 : -1) * 0.8; return true; }
      if (ENTER(code)) { if (Math.abs(m.vel) > still || Math.abs(m.pos - (m.w - D().want) / 10) > 0.05) { m.fault('read a swinging beam'); return true; } if (m.w !== D().want) { m.fault('wrong dose'); return true; } D().got = m.w; m.k++; m.round++; m.w = 0; m.pos = -D0(); m.vel = 0; if (m.k >= 3) m.win(); return true; }
      return false;
    };
    const D0 = () => (D() ? D().want / 10 : 0);
    m.pos = -D0();
    m.tick = (dt) => { if (!m.live(dt) || !D()) return; const target = (m.w - D().want) / 10; m.vel += (-(m.pos - target) * 16 - m.vel * 3.4) * dt; m.pos += m.vel * dt; };
    m.hint = () => { const d = D(); if (!d) return []; const diff = d.want - m.w; if (diff >= 3) return [['ArrowRight', true]]; if (diff > 0) return [['ArrowUp', true]]; if (diff < 0) return [['ArrowDown', true]]; return Math.abs(m.vel) < still * 0.6 && Math.abs(m.pos) < 0.03 ? [['Enter', true]] : []; };
    m.bad = () => (D() && m.w === D().want ? (Math.abs(m.vel) > still ? 'Enter' : 'ArrowUp') : 'Enter');
    m.view = () => ({ doses: m.doses.map(d => [d.herb, d.want]) });
    m.buttons = () => [['ArrowLeft', '−0.3'], ['ArrowDown', '−0.1'], ['ArrowUp', '+0.1'], ['ArrowRight', '+0.3'], ['Enter', 'Record']];
    m.draw = (c, W, H, P) => {
      const cx = 130, cy = 70, ang = Math.max(-0.5, Math.min(0.5, m.pos * 0.6));
      c.save(); c.translate(cx, cy); c.rotate(ang); c.fillStyle = COL.ink; c.fillRect(-90, -3, 180, 6); c.fillStyle = COL.gold; c.fillRect(-96, 6, 30, 6); c.fillRect(66, 6, 30, 6); c.restore();
      c.fillStyle = COL.lav; c.beginPath(); c.moveTo(cx - 10, cy + 60); c.lineTo(cx + 10, cy + 60); c.lineTo(cx, cy + 4); c.closePath(); c.fill();
      c.strokeStyle = Math.abs(m.vel) < still ? P.good : COL.warn; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.sin(ang) * 50, cy - Math.cos(ang) * 50); c.stroke();
      txt(c, Math.abs(m.vel) < still ? 'at rest' : 'swinging', cx, 156, { size: 11, align: 'center', col: Math.abs(m.vel) < still ? P.good : COL.warn });
      m.doses.forEach((d, i) => { box(c, 262, 12 + i * 34, 128, 28, i === m.k ? 'rgba(240,147,58,.2)' : 'rgba(255,255,255,.04)', i === m.k ? COL.orange : null, 10); txt(c, d.herb, 270, 24 + i * 34, { size: 10, col: COL.gold }); txt(c, `${(d.want / 10).toFixed(1)} g${d.got != null ? ' ✓' : ''}`, 270, 36 + i * 34, { size: 10, col: d.got != null ? P.good : COL.ink }); });
      txt(c, `pan ${(m.w / 10).toFixed(1)} g`, 262, H - 12, { size: 12, col: COL.pale });
    };
    return m;
  },
});
