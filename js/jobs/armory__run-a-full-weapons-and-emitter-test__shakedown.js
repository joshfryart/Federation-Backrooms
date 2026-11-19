// Armory, shakedown: full weapons test on the bench rig. Each zapper is clamped in the rig and fired into the target block at low, medium and high
// settings, in that order (1, 2, 3). The meter needle swings after each shot and settles in about half a second; read it then, and do not fire
// again while it is still moving. The spec card gives a different band for each setting. With all three readings logged, sign the test card
// and hang it (Enter) only if every reading sits in its band; otherwise pull the weapon to the workbench (Space).
import { define, machine, DIG, SPACE, ENTER, ri, rf, shuffle, clamp, txt, bar, COL } from './kit.js';

const SET = ['LOW', 'MED', 'HIGH'];
export default define({
  job: { billet: 'armory', label: 'Run a full weapons and emitter test', type: 'task:shakedown' },
  title: 'Three-setting rig ladder', dept: 'security', host: 'console', tool: 'Bench test rig and spec card',
  how: 'Fire each zapper at low, medium then high (1, 2, 3), letting the meter settle after each shot. If all three readings sit in the spec card\'s band for their setting, Enter signs the test card; if any is outside, Space pulls the weapon.',
  keys: ['1 2 3 fire low / med / high', 'Enter sign and hang', 'Space pull to workbench'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'fire the ladder', input: 'digits+space+enter', win: 'each zapper fired up the low, medium, high ladder with every settled meter reading checked against its own spec band, then signed off or pulled',
    fail: 'firing out of order or into a moving needle, signing a weapon with any reading out of spec, pulling a good one, or ruling before all three shots',
    rule: 'Press 1, then 2, then 3, waiting for SETTLED each time. Compare each reading with that setting\'s band on the card. All three in: Enter. Any out: Space.' },
  rush: 'Fired one shot on medium from each zapper and signed the cards.',
  captions: { 'out of order': 'rig interlock buzz', 'needle moving': 'meter clatters', 'passed out of spec': 'Deputy\'s pen stops', 'pulled good': 'workbench bin clunk', 'not finished': 'rig beeps' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, settleT = 0.5;
    m.spec = [rf(r, 0.15, 0.22), rf(r, 0.42, 0.48), rf(r, 0.7, 0.76)].map(a => [a, a + 0.14]);
    const bads = new Set(shuffle(r, [0, 1, 2, 3]).slice(0, ri(r, 1, 2)));
    m.guns = [0, 1, 2, 3].map(i => { const bad = bads.has(i) ? ri(r, 0, 2) : -1; return { bad, val: m.spec.map(([a, b], k) => k === bad ? (r() < 0.5 ? a - rf(r, 0.03, 0.07) : b + rf(r, 0.03, 0.07)) : rf(r, a + 0.015, b - 0.015)), shots: 0, mv: 0 }; });
    m.g = 0; m.rounds = 4; m.round = 0;
    const G = () => m.guns[m.g], next = () => { m.g++; m.round++; if (m.g >= 4) m.win(); };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code), g = G(); if (!g) return false;
      if (d >= 1 && d <= 3) { if (g.mv > 0) { m.fault('needle moving'); return true; } if (d !== g.shots + 1) { m.fault('out of order'); return true; } g.shots++; g.mv = settleT; return true; }
      if (ENTER(code) || SPACE(code)) {
        if (g.shots < 3 || g.mv > 0) { m.fault('not finished'); return true; }
        if (ENTER(code) && g.bad >= 0) { m.fault('passed out of spec'); return true; } if (SPACE(code) && g.bad < 0) { m.fault('pulled good'); return true; }
        next(); return true;
      }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const g = G(); if (g && g.mv > 0) g.mv = Math.max(0, g.mv - dt); };
    m.hint = () => { const g = G(); if (!g || g.mv > 0) return []; if (g.shots < 3) return [[`Digit${g.shots + 1}`, true]]; return [[g.bad >= 0 ? 'Space' : 'Enter', true]]; };
    m.bad = () => { const g = G(); return g && g.shots < 3 ? 'Enter' : 'Digit1'; };
    m.view = () => ({ spec: m.spec.map(b => b.map(x => +x.toFixed(2))), guns: m.guns.map(g => g.bad) });
    m.buttons = () => [['Digit1', '1 Low'], ['Digit2', '2 Med'], ['Digit3', '3 High'], ['Enter', 'Sign card'], ['Space', 'Pull']];
    m.draw = (c, W, H, P) => {
      const g = G() || m.guns[3]; txt(c, `ZAPPER ${Math.min(m.g + 1, 4)} / 4 IN THE RIG`, 14, 20, { size: 12, col: COL.peri });
      SET.forEach((sname, k) => {
        const y = 44 + k * 34, shot = k < g.shots, moving = shot && k === g.shots - 1 && g.mv > 0;
        txt(c, `${k + 1} ${sname}`, 14, y + 10, { size: 12, col: shot ? COL.ink : COL.dim });
        const v = !shot ? 0 : moving ? clamp(g.val[k] + Math.sin(g.mv * 40) * 0.12 * g.mv / settleT) : g.val[k];
        bar(c, 80, y, 250, 14, v, { band: m.spec[k], col: COL.gold });
        txt(c, !shot ? '—' : moving ? 'swinging' : `${Math.round(v * 100)} SETTLED`, 340, y + 11, { size: 10, col: moving ? COL.warn : COL.ink });
      });
      txt(c, 'Green outline = spec card band for that setting', 14, H - 10, { size: 10, col: COL.dim });
    };
    return m;
  },
});
