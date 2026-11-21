// Galley: keep the mess open through drills. Crew join the line steadily. Space serves one bowl (the ladle needs a beat between bowls). The
// drill board announces alarm windows: during an alarm nobody may be served and the line keeps growing, so serve ahead of the alarm and catch the
// queue up after. Serving in an alarm, or letting the line pass six crew, is a fault. Ten bowls to win.
import { define, machine, SPACE, rf, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'galley', label: 'Keep the mess open through drills', type: 'task:shakedown' },
  title: 'Serve ahead of the drill alarms', dept: 'services', host: 'console', tool: 'Drill board and hot shelf',
  how: 'Press Space to serve the next crewman in line. The drill board counts down to each alarm: serve before it, stop while it sounds, and clear the backlog after.',
  keys: ['Space serve one bowl'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'serve between alarms', input: 'space', win: 'ten bowls served from the line, all of them outside the drill alarm windows and with the queue kept short',
    fail: 'serving a bowl while a drill alarm is sounding, or letting the line grow past six crew while the mess is stalled',
    rule: 'One Space serves one bowl, with a short ladle delay. When the board says ALARM, press nothing until it ends; the line keeps filling, so work it down afterwards.' },
  rush: 'Served from the line through the alarms and let the board go unread.',
  captions: { 'in alarm': 'drill klaxon', 'line stalled': 'crowd mutters' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, gap = m.calm ? 1.8 : 1.4; let a = rf(r, 4.5, 6);
    m.al = []; for (let k = 0; k < 2; k++) { m.al.push([a, a + rf(r, 2.2, 2.8)]); a += rf(r, 8, 9.5); }
    m.q = 2; m.arr = gap; m.cool = 0; m.rounds = 10; m.round = 0;
    const alarm = () => m.al.some(([x, y]) => m.t >= x && m.t < y), next = () => m.al.find(([x]) => x > m.t);
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down || !SPACE(code)) return false; if (m.cool > 0) return true;
      if (alarm()) { m.fault('in alarm'); m.cool = 0.7; return true; } if (m.q < 1) return true;
      m.q--; m.cool = 0.7; m.round++; if (m.round >= 10) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.cool = Math.max(0, m.cool - dt); m.arr -= dt; if (m.arr <= 0) { m.arr += gap; m.q++; if (m.q > 6) { m.fault('line stalled'); m.q = 3; } } };
    m.hint = () => (!alarm() && m.cool <= 0 && m.q > 0 && !m.al.some(([x]) => x - m.t < 0.8 && x > m.t) ? [['Space', true]] : []);
    m.bad = () => (alarm() ? 'Space' : null);
    m.view = () => ({ al: m.al.map(x => x.map(v => +v.toFixed(2))) });
    m.buttons = () => [['Space', 'Serve']];
    m.draw = (c, W, H, P) => {
      const al = alarm(), nx = next(); box(c, 20, 14, 360, 40, al ? 'rgba(255,140,60,.25)' : 'rgba(255,255,255,.05)', al ? COL.warn : COL.dim, 6);
      txt(c, al ? 'ALARM - hold the ladle' : nx ? `ALARM in ${(nx[0] - m.t).toFixed(1)} s` : 'no more alarms', 30, 40, { size: 16, col: al ? COL.warn : COL.ink });
      for (let k = 0; k < 7; k++) box(c, 30 + k * 28, 70, 22, 22, k < m.q ? (k >= 6 ? COL.warn : COL.pale) : null, COL.dim, 4);
      txt(c, `line ${m.q}`, 30, 112, { size: 12, col: COL.dim }); bar(c, 120, 104, 150, 8, 1 - m.cool / 0.7, { col: COL.peri }); txt(c, `bowls ${m.round} / 10`, 290, 112, { size: 13, col: COL.pale });
    };
    return m;
  },
});
