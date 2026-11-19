// Sensor officer: routine sweep and drift check (quiet watch). A long, quiet sweep with three duties at once. The interval lamp chimes every
// few seconds: log the drift reading (Enter) while it is lit. The drift line creeps up; only when it crosses the limit, step the gain down one
// notch (↓). A faint return builds slowly somewhere on the ring: once it has painted on two passes, mark it for a second look (Space);
// a one-off blip is not a contact. Missing a chime, logging off-interval, touching the gain under the line or letting the contact build
// unmarked are faults.
import { define, machine, ARROW, SPACE, ENTER, rf, ri, txt, box, bar, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'sensor', label: 'Routine sweep and drift check', type: 'task:quiet_watch' },
  title: 'Quiet sweep log, gain and faint mark', dept: 'sciences', host: 'console', tool: 'Sweep console',
  how: 'Log the drift (Enter) each time the interval lamp lights, step the gain down (↓) only once the drift line crosses its limit, and mark (Space) the faint return once it has painted on two passes.',
  keys: ['Enter log drift on the chime', '↓ gain one step', 'Space mark faint return'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'keep the watch log', input: 'arrows+enter+space', win: 'five interval drift readings logged on their chimes, gain stepped only past the limit, and the slowly building return marked after its second pass',
    fail: 'missing an interval chime or logging between chimes, stepping the gain under the limit, marking a one-off blip, or letting the faint return build unmarked',
    rule: 'Three duties on a quiet scope: Enter while the interval lamp is lit, ↓ only when the drift line is over its limit, Space once the faint return has painted twice.' },
  rush: 'Glanced at the scope at the end of the watch and wrote the same drift figure in every interval box.',
  captions: { 'missed log': 'interval chime unanswered', 'off interval': 'log buzz', 'gain fiddled': 'gain click', 'drift ran off': 'drift alarm', 'one-off blip': 'scope chirp', 'missed contact': 'proximity tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, P = m.calm ? 3.6 : 3.0, I = m.calm ? 4.6 : 4.0, Wn = m.calm ? 1.6 : 1.2, LIM = 0.7, N = 5;
    m.cb0 = rf(r, 0, 1); m.ta = P * ri(r, 1, 2) * 0 + rf(r, 0.6, 1.4) * P; m.marked = false; m.blip = { b: rf(r, 0, 1), t: rf(r, 0.3, 1.0) * P + P * 2 };
    m.dr = rf(r, 0.35, 0.45); m.rr = rf(r, 0.04, 0.055); m.over = 0; m.logs = 0; m.win0 = -1; m.logged = false; m.next = rf(r, 2.4, 3.2); m.round = 0; m.rounds = N; m.hist = [];
    const paints = () => (m.t < m.ta ? 0 : Math.floor((m.t - m.ta) / P) + 1), open = () => m.win0 >= 0 && m.t - m.win0 < Wn;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code); if (!down) return !!(a || SPACE(code) || ENTER(code));
      if (ENTER(code)) { if (open()) { if (!m.logged) { m.logged = true; m.logs++; m.round = m.logs; } } else m.fault('off interval'); return true; }
      if (a === 'D') { if (m.dr > LIM) { m.dr -= 0.3; m.over = 0; } else m.fault('gain fiddled'); return true; }
      if (SPACE(code)) { if (m.marked) return true; if (paints() >= 2) m.marked = true; else m.fault('one-off blip'); return true; }
      return !!a;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.dr += m.rr * dt; if (m.dr > LIM) { m.over += dt; if (m.over > 2.5) { m.fault('drift ran off'); m.dr -= 0.3; m.over = 0; } }
      if (m.win0 >= 0 && !open()) { if (!m.logged) m.fault('missed log'); m.win0 = -1; }
      if (m.win0 < 0 && m.t >= m.next) { m.win0 = m.t; m.logged = false; m.next += I; }
      if (!m.marked && paints() >= 5) { m.fault('missed contact'); m.marked = true; }
      if (m.logs >= N && m.marked && m.state === 'play') m.win();
      m.hist.push(m.dr); if (m.hist.length > 120) m.hist.shift();
    };
    m.hint = () => {
      if (open() && !m.logged && m.t - m.win0 > 0.15) return [['Enter', true]]; if (m.dr > LIM && m.over > 0.3) return [['ArrowDown', true]];
      if (!m.marked && paints() >= 2 && (m.t - m.ta) % P > 0.3) return [['Space', true]]; return [];
    };
    m.bad = () => (open() ? null : 'Enter');
    m.view = () => ({ ta: +m.ta.toFixed(2), b: +m.cb0.toFixed(3), rr: +m.rr.toFixed(3) });
    m.buttons = () => [['Enter', 'Log drift'], ['ArrowDown', 'Gain ↓'], ['Space', 'Mark return']];
    m.draw = (c, W, H, P2) => {
      const cx = 80, cy = 85, R = 66, arm = (m.t / P) % 1; c.strokeStyle = 'rgba(125,151,232,.4)'; c.lineWidth = 1;
      for (const k of [0.4, 0.7, 1]) { c.beginPath(); c.arc(cx, cy, R * k, 0, 6.283); c.stroke(); }
      c.strokeStyle = COL.gold; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.sin(arm * 6.283) * R, cy - Math.cos(arm * 6.283) * R); c.stroke();
      const pt = (b, k) => [cx + Math.sin(b * 6.283) * R * k, cy - Math.cos(b * 6.283) * R * k], p = paints();
      if (p > 0) { const [x, y] = pt(m.cb0, 0.85 - p * 0.08); c.globalAlpha = Math.min(1, 0.2 + p * 0.18); lamp(c, x, y, 4 + p, m.marked ? P2.good : COL.pale, m.marked ? 'square' : 'circle'); c.globalAlpha = 1; }
      if (m.t > m.blip.t && m.t < m.blip.t + P * 0.6) { const [x, y] = pt(m.blip.b, 0.55); c.fillStyle = COL.lav; c.fillRect(x - 2, y - 2, 4, 4); }
      box(c, 170, 14, 120, 120, 'rgba(255,255,255,.04)', null, 4); const yv = (v) => 130 - v * 110;
      c.fillStyle = P2.bad; c.fillRect(170, yv(LIM), 120, 2); txt(c, 'LIMIT', 172, yv(LIM) - 4, { size: 9, col: P2.bad });
      c.strokeStyle = COL.peri; c.lineWidth = 2; c.beginPath(); m.hist.forEach((v, i) => (i ? c.lineTo(170 + i, yv(v)) : c.moveTo(170, yv(v)))); c.stroke();
      txt(c, `drift ${(m.dr * 10).toFixed(2)}`, 172, 150, { size: 11, col: m.dr > LIM ? COL.warn : COL.ink });
      const o = open(); lamp(c, 315, 34, 10, o && !m.logged ? COL.gold : COL.panel, o ? 'diamond' : 'circle'); txt(c, o && !m.logged ? 'LOG NOW' : 'interval', 330, 38, { size: 11, col: o ? COL.gold : COL.dim });
      txt(c, `logs ${m.logs} / ${N}`, 305, 70, { size: 12 }); txt(c, m.marked ? 'return marked' : p >= 2 ? 'faint return x' + p : 'no persistent return', 305, 92, { size: 10, col: COL.dim });
      bar(c, 305, 104, 80, 8, Math.min(1, m.over / 2.5), { col: P2.bad }); txt(c, 'over limit', 305, 124, { size: 9, col: COL.dim });
    };
    return m;
  },
});
