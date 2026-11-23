// Chief of security: post a guard at the lab. The lab door has to be watched for the whole survey, and a guard on the door tires while the others rest
// and recover. Five officers on the roster each show a rest bar. Press an officer's number to relieve the guard on the door with that officer. Never
// let the guard on the door fall under the rest line, and never relieve with an officer who is under it: an exhausted guard sleeps through the door.
import { define, machine, DIG, ri, rf, txt, box, bar, COL } from './kit.js';

const LINE = 0.3, DUR = 20;
export default define({
  job: { billet: 'cos', label: 'Post a guard at the lab', type: 'task:survey' },
  title: 'Rotate the tiring lab guard', dept: 'security', host: 'console', tool: 'Duty roster rest bars',
  how: 'The guard on the lab door tires; the rest recover. Press an officer\'s number to relieve the door guard with them. Keep the door guard above the rest line for the whole watch.',
  keys: ['1-5 relieve the door guard with that officer'], limit: 32, maxFaults: 3,
  fingerprint: { verb: 'rotate guards', input: 'digits',
    win: 'the lab door held for twenty seconds by relieving the tiring guard with rested officers before they fell under the rest line',
    fail: 'leaving the door guard to fall under the rest line, or relieving with an officer who is already under it',
    rule: 'The guard on the door loses rest each second; officers off the door recover. Press a number to swap that officer onto the door. Swap before the bar reaches the line, and only with someone above it.' },
  rush: 'Wrote the first three names on the roster and left the lab to the next watch.',
  captions: { asleep: 'guard asleep on the door', 'too tired': 'relieved with an exhausted officer' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, k = m.calm ? 0.75 : 1; m.post = 0; m.sleep = 0;
    m.o = Array.from({ length: 5 }, (_, i) => ({ rest: i === 0 ? rf(r, 0.6, 0.75) : rf(r, 0.35, 1), n: ['Okafor', 'Reyes', 'Tanaka', 'Voss', 'Lindqvist'][(i + ri(r, 0, 4)) % 5] }));
    m.key = (code, down = true) => { if (m.state !== 'play') return false; const d = DIG(code); if (d < 1 || d > 5) return false; if (!down) return true; const i = d - 1; if (i === m.post) return true; if (m.o[i].rest < LINE) { m.fault('too tired'); return true; } m.post = i; return true; };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.o.forEach((q, i) => { q.rest = Math.max(0, Math.min(1, q.rest + (i === m.post ? -0.06 * k : 0.05 * k) * dt)); });
      if (m.o[m.post].rest < LINE) { m.sleep += dt; if (m.sleep > 0.5) { m.sleep = -1.5; m.fault('asleep'); } } else if (m.sleep > 0) m.sleep = 0; if (m.sleep < 0) m.sleep = Math.min(0, m.sleep + dt);
      if (m.state === 'play' && m.t >= DUR) m.win();
    };
    m.hint = () => { if (m.state !== 'play' || m.o[m.post].rest > 0.5 * 1) return []; let b = -1; m.o.forEach((q, i) => { if (i !== m.post && (b < 0 || q.rest > m.o[b].rest)) b = i; }); return b >= 0 && m.o[b].rest > m.o[m.post].rest ? [['Digit' + (b + 1), true]] : []; };
    m.bad = () => 'Digit5';
    m.view = () => ({ o: m.o.map(q => [+q.rest.toFixed(2), q.n]), p: m.post });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['Digit5', '5']];
    m.draw = (c, W, H, P) => {
      m.o.forEach((q, i) => { const y = 8 + i * 30, on = i === m.post; box(c, 10, y, 380, 26, COL.panel, on ? COL.gold : null, 4); txt(c, `${i + 1} ${q.n}`, 18, y + 17, { size: 12, col: on ? COL.gold : COL.ink }); txt(c, on ? 'ON DOOR' : q.rest < LINE ? 'exhausted' : 'rested', 110, y + 17, { size: 10, col: on ? COL.gold : q.rest < LINE ? P.bad : COL.dim });
        bar(c, 190, y + 7, 190, 12, q.rest, { band: [LINE, 1], mark: LINE, col: q.rest < LINE ? P.bad : COL.peri }); });
      txt(c, `door watch ${Math.min(DUR, m.t).toFixed(0)} / ${DUR} s`, 200, 166, { size: 10, align: 'center', col: COL.dim });
    };
    return m;
  },
});
