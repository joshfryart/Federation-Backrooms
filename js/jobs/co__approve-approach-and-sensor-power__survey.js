// Captain: approve approach and sensor power. The sensor power dial is coupled to both limits: more power drains the EPS reserve toward its
// safe line, less power forces the stop point closer to the target, into its gravity well. Trim the dial (← →) until BOTH gauges sit inside
// their limits, then approve (Space). Approving with either gauge over its line is a fault. Three approach legs.
import { define, machine, ARROW, SPACE, ri, rf, txt, bar, lamp, COL } from './kit.js';

const TGT = ['Kappa IV', 'the ice moon', 'the ringed giant', 'Theta Prime', 'the dust ring'];

export default define({
  job: { billet: 'co', label: 'Approve approach and sensor power', type: 'task:survey' },
  title: 'Coupled approach and power trim', dept: 'command', host: 'console', tool: 'Sensor power dial and approve key',
  how: 'Turn the sensor power dial until the EPS reserve stays above its safe line and the stop point stays outside the gravity well, then approve.',
  keys: ['← → sensor power', 'Space approve'], limit: 28, maxFaults: 3,
  fingerprint: { verb: 'co-trim', input: 'arrows+space', win: 'three approach legs approved with one dial setting that keeps both reserve and stop point inside their limits',
    fail: 'approving while the reserve is under the safe line or the stop point sits inside the gravity well',
    rule: 'Raising power lowers the reserve gauge but pushes the stop point out; lowering does the opposite. Find the setting where both gauges show inside, then press Space.' },
  rush: 'Approved the vector off the helm display without looking at the power budget.',
  captions: { 'approved red': 'helm hesitates on comm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    m.legs = [0, 1, 2].map(() => {
      const smin = ri(r, 2, 6), w = m.calm ? ri(r, 1, 2) : ri(r, 0, 1), smax = smin + w, per = ri(r, 6, 9), S = 100 - per * smax - ri(r, 0, per - 1), g = rf(r, 0.8, 1.4), W = g * smin - rf(r, 0.05, 0.3);
      let s0 = ri(r, 1, 10); if (s0 >= smin && s0 <= smax) s0 = s0 > 5 ? 1 : 10;
      return { smin, smax, per, S, g, W: +W.toFixed(2), s0, tgt: TGT[ri(r, 0, TGT.length - 1)], close: ri(r, 40, 90) };
    });
    m.li = 0; m.s = m.legs[0].s0; m.rounds = 3; m.round = 0;
    const L = () => m.legs[m.li], res = () => 100 - L().per * m.s, stop = () => +(L().g * m.s).toFixed(2), ok = () => res() >= L().S && stop() >= L().W;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code);
      if (a === 'L' || a === 'R') { m.s = Math.max(1, Math.min(10, m.s + (a === 'R' ? 1 : -1))); return true; }
      if (SPACE(code)) { if (!ok()) { m.fault('approved red'); return true; } m.round++; m.li++; if (m.li >= 3) m.win(); else m.s = L().s0; return true; }
      return !!a;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { if (m.li >= 3) return []; return m.s < L().smin ? [['ArrowRight', true]] : m.s > L().smax ? [['ArrowLeft', true]] : [['Space', true]]; };
    m.bad = () => 'Space';
    m.view = () => ({ legs: m.legs.map(l => [l.smin, l.smax, l.s0]) });
    m.buttons = () => [['ArrowLeft', '◀ Less power'], ['ArrowRight', 'More power ▶'], ['Space', 'Approve']];
    m.draw = (c, W, H, P) => {
      if (m.li >= 3) return; const l = L(), rv = res(), sp = stop(), okR = rv >= l.S, okS = sp >= l.W;
      txt(c, `LEG ${m.li + 1} / 3 · approach to ${l.tgt} · closing ${l.close} km/s`, 10, 16, { size: 11, col: COL.gold });
      txt(c, 'SENSOR POWER', 10, 40, { size: 10, col: COL.dim });
      for (let k = 1; k <= 10; k++) { c.fillStyle = k <= m.s ? COL.orange : 'rgba(255,255,255,.1)'; c.fillRect(10 + (k - 1) * 22, 46, 18, 14); }
      txt(c, `${m.s} / 10`, 236, 58, { size: 12 });
      txt(c, 'EPS RESERVE', 10, 84, { size: 10, col: COL.dim }); bar(c, 100, 76, 200, 10, rv / 100, { mark: l.S / 100, col: okR ? COL.peri : COL.warn });
      lamp(c, 316, 81, 7, okR ? P.good : P.bad, okR ? 'circle' : 'square'); txt(c, `${rv} % (safe ${l.S})`, 328, 85, { size: 9 });
      txt(c, 'STOP POINT', 10, 112, { size: 10, col: COL.dim }); bar(c, 100, 104, 200, 10, sp / 15, { mark: l.W / 15, col: okS ? COL.peri : COL.warn });
      lamp(c, 316, 109, 7, okS ? P.good : P.bad, okS ? 'circle' : 'square'); txt(c, `${sp} AU (well ${l.W})`, 328, 113, { size: 9 });
      txt(c, okR && okS ? 'both inside limits — approve' : !okR ? 'reserve under the safe line' : 'stop point inside the gravity well', 10, 146, { size: 11, col: okR && okS ? P.good : COL.warn });
    };
    return m;
  },
});
