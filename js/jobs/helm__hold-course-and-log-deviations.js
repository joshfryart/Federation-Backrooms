// Helm: hold course and log deviations. The drift needle settles slowly after every click of the attitude trim lever, so the skill is
// patience: one click, wait for the needle to come to rest, judge again. Clicking on before it settles overshoots past the centre tick.
// Once the needle has sat still on the centre for two seconds, write the deviation (Space). Logging while it is off-centre is a fault.
import { define, machine, ARROW, SPACE, ri, pick, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'helm', label: 'Hold course and log deviations', type: 'loop' },
  title: 'Trim-click course hold and deviation log', dept: 'flight', host: 'console', tool: 'Heading ring, drift needle and trim lever',
  how: 'Click the trim lever (← / →) one step, wait for the drift needle to settle, then judge again. When it has rested on the centre tick for two seconds, log it (Space).',
  keys: ['← / → one trim click', 'Space write the log line'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'click-trim', input: 'arrows+space', win: 'three course legs trimmed to a settled centred needle and each deviation logged only once it held still',
    fail: 'clicking on before the needle settles so it overshoots the centre, or writing a log line while the needle is off the tick',
    rule: 'Each ← / → is one trim click; the needle glides to its new rest over about a second. Click, wait for it to stop, click again. Space logs once the STILL timer reaches two seconds.' },
  rush: 'Wrote "holding course" in the log without looking at the needle.',
  captions: { overshoot: 'needle swings past centre', 'logged off-centre': 'log rejected chirp' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, tau = m.calm ? 0.45 : 0.5, U = 0.12;
    m.legs = Array.from({ length: 3 }, () => pick(r, [-1, 1]) * ri(r, 1, 3)); m.hdg = ri(r, 10, 350);
    m.leg = 0; m.trim = 0; m.p = m.legs[0] * U; m.dp = 0; m.still = 0; m.side = Math.sign(m.p); m.over = false; m.log = []; m.rounds = 3; m.round = 0;
    const tgt = () => (m.legs[m.leg] - m.trim) * U;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'L' || a === 'R') { if (down) { m.trim += a === 'R' ? 1 : -1; m.still = 0; } return true; }
      if (SPACE(code)) {
        if (!down) return true;
        if (m.still < 2 || Math.abs(m.p) > 0.04) { m.fault('logged off-centre'); return true; }
        m.log.push([m.hdg, m.legs[m.leg], m.trim]); m.leg++; m.round = m.leg; m.still = 0; m.over = false;
        if (m.leg >= 3) { m.win(); return true; } m.side = Math.sign(tgt()); return true;
      }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const np = m.p + (tgt() - m.p) * Math.min(1, dt / tau); m.dp = (np - m.p) / dt; m.p = np;
      if (!m.over && m.side && Math.sign(m.p) === -m.side && Math.abs(m.p) > 0.14) { m.over = true; m.fault('overshoot'); }
      if (Math.abs(m.p) < 0.05) m.over = false;
      if (Math.abs(m.p) < 0.04 && Math.abs(m.dp) < 0.03) m.still += dt; else m.still = 0;
    };
    m.hint = () => {
      if (m.still >= 2.05) return [['Space', true]];
      if (Math.abs(m.dp) < 0.02 && Math.abs(m.p) >= 0.04) return [[m.p > 0 ? 'ArrowRight' : 'ArrowLeft', true]];
      return [];
    };
    m.bad = () => (Math.abs(m.p) > 0.04 ? 'Space' : 'ArrowRight');
    m.view = () => ({ legs: m.legs, hdg: m.hdg });
    m.buttons = () => [['ArrowLeft', '◀ trim'], ['Space', 'Log line'], ['ArrowRight', 'trim ▶']];
    m.draw = (c, W, H, P) => {
      const cx = 110, cy = 92, R = 66; c.strokeStyle = COL.peri; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, R, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
      c.fillStyle = P.good; c.fillRect(cx - 2, cy - R - 8, 4, 14); txt(c, '0', cx, cy - R - 12, { size: 10, align: 'center', col: P.good });
      const a = -Math.PI / 2 + Math.max(-0.75, Math.min(0.75, m.p * 1.6)); c.strokeStyle = Math.abs(m.p) < 0.04 ? P.good : COL.warn; c.lineWidth = 3;
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * (R - 6), cy + Math.sin(a) * (R - 6)); c.stroke();
      txt(c, `HDG ${String(m.hdg).padStart(3, '0')}°  leg ${Math.min(3, m.leg + 1)}/3`, cx, cy + 22, { size: 12, align: 'center', col: COL.pale });
      txt(c, `error ${(m.p / U).toFixed(1)}°`, cx, cy + 40, { size: 12, align: 'center', col: COL.ink });
      box(c, 210, 14, 176, 40, COL.panel, null, 6); txt(c, `TRIM ${m.trim > 0 ? '+' : ''}${m.trim} clicks`, 222, 39, { size: 14, col: COL.gold });
      txt(c, Math.abs(m.dp) < 0.03 ? 'needle at rest' : 'needle moving…', 222, 74, { size: 12, col: Math.abs(m.dp) < 0.03 ? COL.ink : COL.warn });
      txt(c, 'STILL on centre', 222, 96, { size: 11, col: COL.dim }); bar(c, 222, 102, 160, 10, m.still / 2, { col: m.still >= 2 ? P.good : COL.peri });
      m.log.forEach((l, i) => txt(c, `${i + 1}. err ${l[1]}°  trim ${l[2]}`, 222, 130 + i * 13, { size: 10, col: COL.dim }));
    };
    return m;
  },
});
