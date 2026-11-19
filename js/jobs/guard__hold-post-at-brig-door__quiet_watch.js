// Guard: hold the post at the brig door on a quiet watch. The post check is due on a slow count: glance through the grille (Space) when the
// due bar has filled past half and before it runs out. A glance shows how the prisoner is lying and the breathing trace. Lying still with a
// rising and falling trace is just rest; a flat trace means they have stopped moving: report it (Enter) before the next glance. Glancing too
// early leaves the corridor unwatched, letting the check lapse, glancing past a fallen prisoner or a false report are faults.
import { define, machine, SPACE, ENTER, ri, rf, pick, txt, box, bar, COL } from './kit.js';

const POSE = ['sitting on the bunk', 'pacing the cell', 'lying still on the bunk', 'leaning on the wall'];
export default define({
  job: { billet: 'guard', label: 'Hold post at brig door', type: 'task:quiet_watch' },
  title: 'Grille glance post check', dept: 'security', host: 'console', tool: 'Brig grille and post slate',
  how: 'Glance through the grille (Space) each time the post check comes due: after half the bar, before it empties. If the breathing trace is flat, report it (Enter) at once.',
  keys: ['Space glance through the grille', 'Enter report the prisoner down'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'glance on schedule', input: 'space+enter',
    win: 'six timed grille checks kept on the post slate and the prisoner who stops breathing reported at the first glance that shows it',
    fail: 'letting the post check lapse, glancing so early the corridor goes unwatched, or glancing past a motionless prisoner',
    rule: 'The due bar fills between checks. Glance with Space once it is past the half mark and before it is full. A flat breathing trace means report with Enter.' },
  rush: 'Wrote the check times on the slate in one go at the end of the post.',
  captions: { early: 'boots scrape at the grille', lapsed: 'post chime', 'false report': 'radio crackle', 'down unseen': 'sickbay alert tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, I = m.calm ? 3.8 : 2.9, N = 6;
    m.fallAt = ri(r, 2, 4); m.poses = Array.from({ length: N }, (_, k) => (k >= m.fallAt ? 'lying still on the bunk' : pick(r, POSE)));
    m.since = rf(r, 1.2, 1.6); m.n = 0; m.open = 0; m.reported = false; m.held = {}; m.rounds = N; m.round = 0;
    const fallen = () => m.n > m.fallAt;   // the glance that shows index n-1 >= fallAt
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !(SPACE(code) || ENTER(code))) return false; if (!down) { m.held[code] = false; return true; } if (m.held[code]) return true; m.held[code] = true;
      if (SPACE(code)) {
        if (m.since < I * 0.45) { m.fault('early'); return true; }
        if (fallen() && !m.reported) m.fault('down unseen');
        m.n++; m.round = m.n; m.since = 0; m.open = 1.3; m.ev('glance', { n: m.n });
        if (m.n >= N && m.reported) m.win();
        return true;
      }
      if (fallen() && !m.reported) { m.reported = true; m.ev('report'); if (m.n >= N) m.win(); } else m.fault('false report');
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.since += dt; m.open = Math.max(0, m.open - dt);
      if (m.since > I + 0.9) { m.fault('lapsed'); m.since = I * 0.5; }
      if (m.n >= N && m.reported) m.win();
    };
    m.hint = () => { const h = Object.keys(m.held).find(k => m.held[k]); if (h) return [[h, false]];
      if (fallen() && !m.reported) return [['Enter', true]]; return m.since >= I * 0.62 ? [['Space', true]] : []; };
    m.bad = () => { const h = Object.keys(m.held).find(k => m.held[k]); return h ? [h, false] : ['Space', true]; };
    m.view = () => ({ fall: m.fallAt, poses: m.poses });
    m.buttons = () => [['Space', 'Glance'], ['Enter', 'Report']];
    m.draw = (c, W, H, P) => {
      txt(c, 'BRIG DOOR POST', 16, 18, { size: 12, col: COL.gold }); txt(c, `slate ${m.n} / ${N}`, 384, 18, { size: 11, align: 'right', col: COL.pale });
      box(c, 16, 30, 200, 100, 'rgba(255,255,255,.04)', COL.peri, 4);
      for (let k = 1; k < 8; k++) { c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(16 + k * 25, 30, 2, 100); }
      if (m.open > 0) { const k = m.n - 1, down = k >= m.fallAt; txt(c, m.poses[k], 116, 60, { size: 12, align: 'center' });
        c.strokeStyle = down ? P.bad : P.good; c.lineWidth = 2; c.beginPath();
        for (let x = 0; x <= 160; x += 4) { const y = 95 + (down ? 0 : 10 * Math.sin(x / 14 + m.t * 4)); x ? c.lineTo(36 + x, y) : c.moveTo(36 + x, y); } c.stroke();
        txt(c, down ? 'breathing: flat ✖' : 'breathing: rising ✓', 116, 124, { size: 10, align: 'center', col: down ? P.bad : P.good });
      } else txt(c, 'grille shut', 116, 84, { size: 12, align: 'center', col: COL.dim });
      const v = Math.min(1, m.since / (I + 0.9)); txt(c, 'post check due', 236, 52, { size: 11, col: COL.dim });
      bar(c, 236, 60, 150, 12, v, { band: [0.45 * I / (I + 0.9), 1], col: v > I / (I + 0.9) ? COL.warn : COL.peri });
      txt(c, m.since < I * 0.45 ? 'too soon: watch the corridor' : 'glance now', 236, 92, { size: 11, col: m.since < I * 0.45 ? COL.dim : COL.ink });
      txt(c, m.reported ? 'prisoner reported ✓' : 'no report made', 236, 116, { size: 11, col: m.reported ? P.good : COL.dim });
    };
    return m;
  },
});
