// Reactor specialist: prep for a transport/lift load surge. The surge panel lists the loads the cargo run will throw on the grid at once. Add
// them up and wind the surge limiter to that total, then pre-raise the output trim so the reserve bar will still sit above its floor once the
// draw comes off it, but no further than the heat line allows. Fire the test pulse (Space) to prove it: a wrong limiter trips, a thin reserve
// sags under the floor, and too much trim overheats the core. Two surges per run.
import { define, machine, ARROW, SPACE, ri, shuffle, clamp, txt, bar, box, COL } from './kit.js';

export default define({
  job: { billet: 'reactor', label: 'Prep for transport/lift load surge', type: 'task:cargo_run' },
  title: 'Surge limiter and reserve pre-load', dept: 'engineering', host: 'console', tool: 'Surge panel',
  how: 'Add up the listed loads and set the surge limiter to the total (Left / Right, 5 MW a click). Raise the output trim (Up / Down) until the reserve after the draw clears the floor, under the heat line. Space fires the test pulse.',
  keys: ['Left / Right limiter', 'Up / Down output trim', 'Space fire the test pulse'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'pre-load and pulse', input: 'arrows+space', win: 'each test pulse fired with the limiter on the summed load draw and the reserve pre-loaded above its floor under the heat line',
    fail: 'a limiter that does not match the summed draw trips, too little trim lets the reserve sag under the floor, too much overheats',
    rule: 'Sum the loads, click the limiter to the total, then add trim steps until the ghost reserve-after-draw clears the floor without the heat marker crossing its line; Space fires and checks all three.' },
  rush: 'Left the limiter where it was and let the transporter take what it could.',
  captions: { trip: 'limiter trip clack', sag: 'transporter whine drops', overheat: 'core heat alarm' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, names = ['Cargo lift 1', 'Cargo lift 2', 'Transporter A', 'Transporter B', 'Gravity sled bay', 'Hoist rail'];
    const mk = () => { const n = ri(r, 2, 3), loads = shuffle(r, names).slice(0, n).map(nm => [nm, 5 * ri(r, 2, 5)]), draw = loads.reduce((a, l) => a + l[1], 0), R0 = 5 * ri(r, 4, 7), floor = 10;
      const need = Math.max(1, Math.ceil((draw + floor - R0) / 6)); return { loads, draw, R0, floor, need, heat: need + (m.calm ? 2 : 1) }; };
    m.s = [mk(), mk()]; m.round = 1; m.rounds = 2; m.lim = 5 * ri(r, 3, 6); m.trim = 0; m.pulse = 0; m.res = null;
    const S = () => m.s[m.round - 1], after = () => S().R0 + 6 * m.trim - S().draw;
    m.key = (code, down = true) => {
      const a = ARROW(code), sp = SPACE(code); if (m.state !== 'play' || (!a && !sp)) return false; if (!down || m.pulse > 0) return true;
      if (a === 'L') m.lim = Math.max(0, m.lim - 5); else if (a === 'R') m.lim = Math.min(120, m.lim + 5);
      else if (a === 'U') m.trim = Math.min(12, m.trim + 1); else if (a === 'D') m.trim = Math.max(0, m.trim - 1);
      else { m.pulse = 1.2; m.res = m.lim !== S().draw ? 'trip' : m.trim > S().heat ? 'overheat' : after() < S().floor ? 'sag' : 'ok'; m.ev('pulse', { res: m.res }); }
      return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; if (m.pulse <= 0) return; m.pulse -= dt; if (m.pulse > 0) return; m.pulse = 0;
      if (m.res !== 'ok') { m.fault(m.res); m.res = null; return; } m.res = null;
      if (m.round >= 2) { m.win(); return; } m.round++; m.trim = 0;
    };
    m.hint = () => { if (m.pulse > 0) return []; const s = S(); if (m.lim !== s.draw) return [[m.lim < s.draw ? 'ArrowRight' : 'ArrowLeft', true]]; if (m.trim !== s.need) return [[m.trim < s.need ? 'ArrowUp' : 'ArrowDown', true]]; return [['Space', true]]; };
    m.bad = () => 'Space';
    m.view = () => ({ s: m.s.map(s => [s.loads, s.R0]) });
    m.buttons = () => [['ArrowLeft', 'Limiter −'], ['ArrowRight', 'Limiter +'], ['ArrowDown', 'Trim −'], ['ArrowUp', 'Trim +'], ['Space', 'Test pulse']];
    m.draw = (c, W, H, P) => {
      const s = S(); txt(c, `SURGE ${m.round} / 2 · expected loads`, 16, 18, { size: 11, col: COL.gold });
      s.loads.forEach(([nm, d], i) => txt(c, `${nm}  ${d} MW`, 16, 36 + i * 15, { size: 11, col: COL.ink }));
      box(c, 16, 88, 150, 26, COL.panel, m.lim === s.draw ? P.good : COL.dim); txt(c, `LIMITER ${m.lim} MW`, 26, 106, { size: 13, col: COL.ink });
      txt(c, `output trim +${m.trim}`, 16, 134, { size: 12, col: COL.pale });
      const sc = (v) => clamp(v / 120); txt(c, 'RESERVE', 200, 18, { size: 10, col: COL.dim });
      bar(c, 200, 24, 180, 12, sc(s.R0 + 6 * m.trim), { col: COL.gold, mark: sc(s.floor) }); txt(c, `after draw ${after()} MW (floor ${s.floor})`, 200, 52, { size: 11, col: after() < s.floor ? COL.warn : COL.ink });
      txt(c, 'CORE HEAT', 200, 74, { size: 10, col: COL.dim }); bar(c, 200, 80, 180, 10, (m.trim + 1) / 14, { col: m.trim > s.heat ? P.bad : COL.peri, mark: (s.heat + 1.5) / 14 });
      txt(c, m.trim > s.heat ? '▲ over the heat line' : 'heat line ▮', 200, 104, { size: 10, col: m.trim > s.heat ? P.bad : COL.dim });
      if (m.pulse > 0) txt(c, `TEST PULSE … ${m.res === 'ok' ? 'holding' : m.res}`, 200, 134, { size: 14, col: m.res === 'ok' ? P.good : P.bad });
    };
    return m;
  },
});
