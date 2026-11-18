// Captain: decide whether to extend the survey. At each decision point ask the science officer about the strongest find (Space): is it a
// new reading or a repeat sample? Extend (1) only when it is new AND the fuel left after the extra hours stays above the amber band;
// otherwise depart (2). Deciding before the answer is in, or the wrong way, is a fault. Four decision points.
import { define, machine, DIG, SPACE, ri, pick, shuffle, txt, box, bar, COL } from './kit.js';

const FINDS = ['dilithium trace', 'organic film', 'magnetic anomaly', 'subsurface ice', 'thermal vent', 'ring resonance', 'spore cloud', 'buried structure'];

export default define({
  job: { billet: 'co', label: 'Decide whether to extend the survey', type: 'task:survey' },
  title: 'Extend-or-depart fuel call', dept: 'command', host: 'console', tool: 'Sensor summary and fuel bar',
  how: 'Ask science whether the strongest find is new, then extend only if it is new and the fuel after the extra hours stays out of the amber band; otherwise depart.',
  keys: ['Space ask science', '1 extend', '2 depart'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'extend or depart', input: 'digits+space', win: 'four decision points called after hearing science, extending only on a new find with fuel to spare',
    fail: 'deciding before science answers, extending on a repeat sample or into the amber band, or leaving a new find with fuel to spare',
    rule: 'Space asks science about the top find; the answer comes a moment later. Then 1 extends if it is NEW and the hatched cost leaves fuel above the amber line; anything else, 2 departs.' },
  rush: 'Extended on the first exciting blip and burned into the fuel margin.',
  captions: { unverified: 'science officer: "one moment, sir"', 'wrong call': 'helm repeats the order back uncertainly' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, wait = m.calm ? 0.6 : 0.8;
    const want = shuffle(r, [1, 1, 2, 2]);
    m.pts = want.map(w => {
      const cost = ri(r, 8, 16), amber = ri(r, 20, 35), isNew = w === 1 ? true : r() < 0.5, fits = w === 1 ? true : !isNew ? r() < 0.5 : false;
      const f = Math.max(amber + (fits ? cost + ri(r, 1, 6) : ri(r, 0, cost - 1)), 25); const fl = Math.min(95, f);
      return { find: pick(r, FINDS), isNew, cost, amber, fuel: fl, ext: fl - cost >= amber && isNew ? 1 : 2, hrs: ri(r, 3, 9) };
    });
    m.pi = 0; m.asked = -1; m.rounds = 4; m.round = 0;
    const P0 = () => m.pts[m.pi], heard = () => m.asked >= 0 && m.t - m.asked >= wait;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code);
      if (SPACE(code)) { if (m.asked < 0) m.asked = m.t; return true; }
      if (d === 1 || d === 2) {
        if (!heard()) { m.fault('unverified'); return true; }
        if (d !== P0().ext) { m.fault('wrong call'); return true; }
        m.round++; m.pi++; m.asked = -1; if (m.pi >= 4) m.win(); return true;
      }
      return !!d;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { if (m.pi >= 4) return []; if (m.asked < 0) return [['Space', true]]; return heard() ? [['Digit' + P0().ext, true]] : []; };
    m.bad = () => 'Digit1';
    m.view = () => ({ pts: m.pts.map(p => [p.find, p.isNew, p.cost, p.amber, p.fuel]) });
    m.buttons = () => [['Space', 'Ask science'], ['Digit1', '1 Extend'], ['Digit2', '2 Depart']];
    m.draw = (c, W, H, P) => {
      if (m.pi >= 4) return; const p = P0();
      txt(c, `DECISION ${m.pi + 1} / 4`, 10, 16, { size: 11, col: COL.gold });
      box(c, 8, 24, 240, 50, 'rgba(255,255,255,.05)', COL.peri, 8);
      txt(c, `Strongest find: ${p.find}`, 16, 42, { size: 12 }); txt(c, `extension costs ${p.hrs} h and ${p.cost} % fuel`, 16, 62, { size: 10, col: COL.dim });
      const ans = m.asked < 0 ? 'not asked' : heard() ? (p.isNew ? '“A NEW reading, sir.”' : '“A repeat of the last sample.”') : 'asking…';
      txt(c, `Science: ${ans}`, 260, 42, { size: 10, col: heard() ? (p.isNew ? P.good : COL.warn) : COL.dim });
      txt(c, 'FUEL', 10, 100, { size: 10, col: COL.dim }); bar(c, 50, 92, 320, 12, p.fuel / 100, { mark: p.amber / 100, col: COL.peri });
      c.fillStyle = 'rgba(255,179,71,.45)'; c.fillRect(50 + (p.fuel - p.cost) / 100 * 320, 94, p.cost / 100 * 320, 8);
      txt(c, `${p.fuel} % now · ${p.fuel - p.cost} % after · amber below ${p.amber} %`, 50, 124, { size: 10, col: p.fuel - p.cost >= p.amber ? COL.ink : COL.warn });
      txt(c, '1 extend   2 depart', 10, 152, { size: 11, col: COL.pale });
    };
    return m;
  },
});
