// Helm: hold station for a deep scan. The sensor officer's chit asks for a hold time. The current shifts in steps and the drift needle shows
// how hard it pushes (1 to 9). Set the counter-thrust with the digit keys: when it matches the current the ship stops sliding; one notch more
// or less walks the marker back toward the centre. Thrust changes of more than two notches inside a moment rock the ship and blur the scan;
// a marker outside the centre ring turns the scan light amber and the scan restarts.
import { define, machine, DIG, ri, rf, pick, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'helm', label: 'Hold station for deep scan', type: 'task:survey' },
  title: 'Counter-thrust notch match for deep scan', dept: 'flight', host: 'console', tool: 'Station-hold thrust notches and drift needle',
  how: 'Press 1 to 9 to engage and set counter-thrust to the drift needle so the marker stays in the ring until the scan timer runs out. Never move more than two notches at once.',
  keys: ['1 to 9 counter-thrust notch'], limit: 26, maxFaults: 3,
  fingerprint: { verb: 'match the current', input: 'digits', win: 'the deep scan runs its full requested hold with the marker never leaving the centre ring',
    fail: 'letting the marker slide out of the ring when the current steps up, or jumping the thrust several notches at once so the ship rocks',
    rule: 'The marker slides at the difference between the current (needle) and your thrust notch. Match the needle to stop it; one notch over or under walks it back. More than two notches of change within 0.6 s is a fault.' },
  rush: 'Slammed the thrusters to full against the current and let sensors redo the scan.',
  captions: { 'scan blurred': 'scan light amber tone', 'ship rocked': 'hull creak' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, k = m.calm ? 0.075 : 0.09, R = 0.25;
    m.need = ri(r, 8, 10); m.steps = []; let t = rf(r, 1.5, 2.5), c = ri(r, 3, 7); m.c0 = c;
    while (t < 60) { c = Math.max(2, Math.min(8, c + pick(r, [-3, -2, -1, 1, 2, 3]))); m.steps.push([t, c]); t += rf(r, 2.5, 4); }
    m.thr = 0; m.x = 0; m.scan = 0; m.chg = []; m.si = 0; m.cur = m.c0; m.lastSet = -9;
    m.key = (code, down = true) => {
      const d = DIG(code); if (m.state !== 'play' || !d) return false; if (!down) return true;
      m.chg = m.chg.filter(([tt]) => m.t - tt < 0.6); if (m.thr) m.chg.push([m.t, Math.abs(d - m.thr)]); m.thr = d; m.lastSet = m.t;   // the first notch from zero just engages station-hold
      if (m.chg.reduce((a, [, v]) => a + v, 0) > 2) { m.fault('ship rocked'); m.chg = []; }
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; while (m.si < m.steps.length && m.t >= m.steps[m.si][0]) m.cur = m.steps[m.si++][1];
      m.x += (m.cur - m.thr) * k * dt;
      if (Math.abs(m.x) > R) { m.fault('scan blurred'); m.x = 0; m.scan = 0; } else { m.scan += dt; if (m.scan >= m.need) m.win(); }
    };
    m.hint = () => {
      const want = Math.max(1, Math.min(9, m.cur + (m.x > 0.08 ? 1 : m.x < -0.08 ? -1 : 0)));
      if (want === m.thr || m.t - m.lastSet < 0.65) return []; const step = m.thr === 0 ? want : Math.max(-2, Math.min(2, want - m.thr));
      return [['Digit' + (m.thr === 0 ? want : m.thr + step), true]];
    };
    m.bad = () => (m.thr < 5 ? 'Digit9' : 'Digit1');
    m.view = () => ({ need: m.need, steps: m.steps.slice(0, 5).map(s => s[1]), c0: m.c0 });
    m.buttons = () => Array.from({ length: 9 }, (_, i) => ['Digit' + (i + 1), String(i + 1)]);
    m.draw = (c, W, H, P) => {
      const cx = 90, cy = 84, S = 220; c.strokeStyle = Math.abs(m.x) > R * 0.8 ? COL.warn : P.good; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R * S, 0, 6.283); c.stroke();
      c.fillStyle = COL.gold; c.beginPath(); c.arc(cx + m.x * S, cy, 7, 0, 6.283); c.fill();
      txt(c, 'CURRENT', 200, 24, { size: 10, col: COL.dim }); bar(c, 200, 30, 180, 10, m.cur / 9, { col: COL.lav }); txt(c, String(m.cur), 386, 40, { size: 12, align: 'right' });
      txt(c, 'THRUST', 200, 60, { size: 10, col: COL.dim }); bar(c, 200, 66, 180, 10, m.thr / 9, { col: COL.peri }); txt(c, String(m.thr), 386, 76, { size: 12, align: 'right' });
      box(c, 200, 92, 186, 56, COL.panel, null, 6); txt(c, `SCAN ${m.scan.toFixed(1)} / ${m.need} s`, 212, 114, { size: 14, col: Math.abs(m.x) > R * 0.8 ? COL.warn : COL.ink });
      bar(c, 212, 126, 160, 8, m.scan / m.need, { col: P.good }); txt(c, m.cur > m.thr ? 'sliding ▶' : m.cur < m.thr ? '◀ sliding' : 'steady', cx, 160, { size: 11, align: 'center', col: COL.pale });
    };
    return m;
  },
});
