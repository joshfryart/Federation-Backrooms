// Chief of security: work the sickbay entrance as a gate. Arrivals come up the corridor one at a time: staff and patients with a medical pass, stretchers
// that need the gate open all the way through, and people with no pass who must be turned away. Hold Space to open the gate; let go to close it.
// A stretcher caught halfway when the gate closes jams; an unpassed visitor let through is a fault.
import { define, machine, SPACE, shuffle, txt, box, lamp, COL } from './kit.js';

const GATE = 0.5;
export default define({
  job: { billet: 'cos', label: 'Escort and control the sickbay entrance', type: 'task:medical_relief' },
  title: 'Sickbay gate hold', dept: 'security', host: 'console', tool: 'Sickbay gate',
  how: 'Hold Space to open the gate for passes and stretchers, and let go to close it for anyone without a pass. Keep the gate open all the way through every stretcher.',
  keys: ['Space hold: gate open', 'let go: gate closed'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'hold the gate', input: 'space-hold', win: 'every arrival passed or turned away at the gate, with no unpassed visitor let in',
    fail: 'letting an unpassed visitor through, or letting go while a stretcher is halfway through',
    rule: 'Arrivals walk up to the gate. Hold Space to open it for a pass or a stretcher; let go for anyone with no pass. A stretcher needs the gate held open all the way across.' },
  rush: 'Waved the whole queue through the doors and sorted the passes later.',
  captions: { 'let unpassed in': 'gate alarm', 'stretcher jammed': 'stretcher clatters' }, says: {},
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    m.q = shuffle(r, ['pass', 'pass', 'stretcher', 'stretcher', 'nopass', 'nopass', 'nopass']);
    m.idx = 0; m.a = null; m.gap = 0; m.open = false; m.prevOpen = false;
    m.key = (code, down = true) => { if (m.state !== 'play' || !SPACE(code)) return false; m.open = !!down; return true; };
    m.tick = (dt) => {
      if (!m.live(dt)) return;
      const jam = m.prevOpen && !m.open && m.a && m.a.type === 'stretcher' && m.a.x > GATE && m.a.x < 1;
      m.prevOpen = m.open;
      if (jam) m.fault('stretcher jammed');
      if (!m.a) {
        if (m.idx >= m.q.length) { m.win(); return; }
        m.gap += dt; if (m.gap > 0.6) { m.gap = 0; m.a = { type: m.q[m.idx++], x: 0, wait: 0 }; }
        return;
      }
      const a = m.a, speed = 0.5;
      if (a.x < GATE) { a.x = Math.min(GATE, a.x + speed * dt); return; }
      if (a.type === 'nopass') {
        if (m.open) { m.fault('let unpassed in'); m.a = null; return; }
        a.wait += dt; if (a.wait > 0.8) { m.ev('turned away'); m.a = null; }
        return;
      }
      if (m.open) { a.x += speed * (a.type === 'stretcher' ? 0.8 : 1) * dt; if (a.x >= 1) { m.ev('passed'); m.a = null; } }
    };
    m.hint = () => { const a = m.a; const want = !!a && a.type !== 'nopass' && a.x >= GATE - 0.03; return [['Space', want]]; };
    m.bad = () => ['Space', true];
    m.buttons = () => [['Space', 'hold: gate open']];
    m.view = () => ({ q: m.q.slice() });
    m.draw = (c, W, H, P) => {
      box(c, 20, 60, 360, 44, 'rgba(255,255,255,.04)', null, 6);
      const gx = 20 + GATE * 360;
      c.strokeStyle = m.open ? P.good : P.bad; c.lineWidth = 3; c.beginPath(); c.moveTo(gx, 52); c.lineTo(gx, 112); c.stroke();
      txt(c, m.open ? 'GATE OPEN' : 'GATE CLOSED', gx, 48, { size: 10, align: 'center', col: m.open ? P.good : P.bad });
      const a = m.a;
      if (a) {
        const x = 20 + a.x * 360, col = a.type === 'nopass' ? P.bad : P.good;
        if (a.type === 'stretcher') box(c, x - 18, 74, 36, 14, col, null, 4); else lamp(c, x, 81, 9, col, a.type === 'nopass' ? 'triangle' : 'circle');
        txt(c, a.type === 'pass' ? 'pass' : a.type === 'stretcher' ? 'stretcher' : 'no pass', x, 106, { size: 10, align: 'center' });
      }
      txt(c, `Arrivals left ${m.q.length - m.idx + (m.a ? 1 : 0)}`, 200, 150, { size: 11, align: 'center', col: COL.peri });
      txt(c, 'hold Space to open, let go to close', 200, 166, { size: 10, align: 'center', col: COL.dim });
    };
    return m;
  },
});
