// Assistant Chief Engineer: ready quarantine environment controls. Three dials (pressure differential, temperature, humidity). Every turn of
// the temperature or humidity dial jolts the pressure differential, which then settles back. The negative pressure must stay in its band: out of
// band for more than a second is a leak into the corridor. Set all three to the quarantine card, with the pressure back in band at the end.
import { define, machine, ARROW, ri, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'ace', label: 'Ready quarantine environment controls', type: 'task:medical_relief' },
  title: 'Trim around the pressure lock', dept: 'engineering', host: 'console', tool: 'Environment dials',
  how: 'Left/Right picks a dial; Up/Down turns it a click. Turning temperature or humidity jolts the pressure; wait for it to settle back in its band between clicks.',
  keys: ['Left / Right pick a dial', 'Up / Down turn it'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'trim the dials', input: 'arrows',
    win: 'temperature and humidity set to the quarantine card while the pressure differential stays locked in its band',
    fail: 'turning other dials in a rush so the pressure differential stays out of band long enough to leak',
    rule: 'Each click on temperature or humidity knocks the pressure differential off; it recovers slowly. Click again only once it is back in band.' },
  rush: 'Spun all three dials to the card in one go and checked the seal light after.',
  captions: { leak: 'seal indicator drops' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd; m.sel = 1; m.v = [5, ri(r, 2, 4), ri(r, 2, 4)]; m.tg = [5, ri(r, 6, 8), ri(r, 6, 8)]; m.jolt = 0; m.out = 0;
    const dec = m.calm ? 0.8 : 0.6, tol = m.calm ? 0.7 : 0.5; m.d = () => m.v[0] - m.jolt; m.inband = () => Math.abs(m.d() - m.tg[0]) <= tol;
    m.key = (code, down = true) => { if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a === 'L') { m.sel = (m.sel + 2) % 3; return true; } if (a === 'R') { m.sel = (m.sel + 1) % 3; return true; }
      if (a === 'U' || a === 'D') { const s = a === 'U' ? 1 : -1; m.v[m.sel] = Math.max(0, Math.min(10, m.v[m.sel] + s)); if (m.sel) m.jolt += 0.6; return true; } return false; };
    m.tick = (dt) => { if (!m.live(dt)) return; m.jolt = Math.max(0, m.jolt - dec * dt); m.out = m.inband() ? 0 : m.out + dt; if (m.out > 1) { m.fault('leak'); m.out = 0; m.jolt = 0; }
      if (m.v[1] === m.tg[1] && m.v[2] === m.tg[2] && m.inband()) m.win(); };
    m.hint = () => { const i = m.v[1] !== m.tg[1] ? 1 : 2; if (m.jolt > 0.05) return []; if (m.sel !== i) return [['ArrowRight', true]]; return [[m.v[i] < m.tg[i] ? 'ArrowUp' : 'ArrowDown', true]]; };
    m.bad = () => { m.sel = 1; return 'ArrowUp'; };
    m.view = () => ({ tg: m.tg, v: m.v });
    m.buttons = () => [['ArrowLeft', '◀'], ['ArrowRight', '▶'], ['ArrowUp', 'Up'], ['ArrowDown', 'Down']];
    m.draw = (c) => { ['Pressure', 'Temp', 'Humidity'].forEach((n, i) => { const x = 14 + i * 128; box(c, x, 10, 118, 76, COL.panel, m.sel === i ? COL.gold : COL.peri);
      txt(c, n, x + 8, 28, { size: 12 }); txt(c, i ? `${m.v[i]} / ${m.tg[i]}` : `diff ${m.d().toFixed(1)}`, x + 8, 62, { size: i ? 20 : 17, col: i && m.v[i] === m.tg[i] ? COL.pale : COL.ink }); });
      txt(c, 'DIFFERENTIAL', 14, 110, { size: 10, col: COL.dim }); bar(c, 14, 116, 370, 12, m.d() / 10, { band: [(m.tg[0] - 0.5) / 10, (m.tg[0] + 0.5) / 10], col: m.inband() ? COL.pale : COL.warn });
      txt(c, m.inband() ? 'seal holds' : 'LEAKING', 14, 148, { size: 12, col: m.inband() ? COL.pale : COL.warn }); };
    return m;
  },
});
