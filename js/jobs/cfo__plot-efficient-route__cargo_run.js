// CFO: plot efficient route for the cargo run. The lane chart has four junctions with three lanes each: fast lanes burn more fuel, slow ones
// cost time, and some lanes run through the debris field. Pick a lane at each junction (1-3) while the fuel bar and arrival clock run up, then
// send the plan to the helm (Enter). It must arrive before the dock slot with the shuttle's reserve still in the tank.
import { define, machine, ENTER, DIG, ri, rf, shuffle, txt, box, bar, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'cfo', label: 'Plot efficient route', type: 'task:cargo_run' },
  title: 'Lane-by-lane fuel and time budget', dept: 'flight', host: 'console', tool: 'Lane chart and fuel estimate panel',
  how: 'Pick a lane at each of four junctions (1-3). Avoid debris lanes. The plan must reach the dock before the slot closes and keep the fuel reserve; Enter sends it to the helm.',
  keys: ['1-3 pick lane', 'Enter send to helm'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'budget the lanes', input: 'digits+enter', win: 'four lanes chosen so the cargo arrives before the dock slot with the fuel reserve untouched and no lane through debris',
    fail: 'choosing a debris lane, or sending a plan that runs into the reserve or arrives after the slot',
    rule: 'Each lane shows fuel and hours. Running totals show against the reserve line and the dock slot. Mix fast and cheap lanes so both totals fit, then Enter.' },
  rush: 'Took the fastest lane at every junction and hoped the tanks held.',
  captions: { 'debris lane': 'collision warning', stranded: 'fuel reserve alarm', late: 'dock slot lost' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd;
    for (let tries = 0; tries < 60; tries++) {
      m.J = [0, 1, 2, 3].map(() => shuffle(r, [{ f: ri(r, 15, 19), h: ri(r, 2, 3) }, { f: ri(r, 10, 13), h: ri(r, 4, 5) }, { f: ri(r, 6, 8), h: ri(r, 6, 8) }]).map(l => ({ ...l, debris: false })));
      const sol = [0, 1, 2, 3].map(() => ri(r, 0, 2)), sf = sol.reduce((s, k, j) => s + m.J[j][k].f, 0), sh = sol.reduce((s, k, j) => s + m.J[j][k].h, 0);
      m.fuelCap = sf + ri(r, 0, 2); m.slot = sh + ri(r, 0, 1);
      const fast = m.J.map(L => L.reduce((a, b) => a.h <= b.h ? a : b)), cheap = m.J.map(L => L.reduce((a, b) => a.f <= b.f ? a : b));
      if (tries < 59 && (fast.reduce((s, l) => s + l.f, 0) <= m.fuelCap || cheap.reduce((s, l) => s + l.h, 0) <= m.slot)) continue;
      const dj = ri(r, 0, 3), opts2 = [0, 1, 2].filter(k => k !== sol[dj]); m.J[dj][opts2[ri(r, 0, 1)]].debris = true; m.sol = sol; break;
    }
    m.pick = []; m.ok = (p) => p.length === 4 && p.reduce((s, k, j) => s + m.J[j][k].f, 0) <= m.fuelCap && p.reduce((s, k, j) => s + m.J[j][k].h, 0) <= m.slot && p.every((k, j) => !m.J[j][k].debris);
    const tot = (p, key) => p.reduce((s, k, j) => s + m.J[j][k][key], 0);
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code);
      if (d >= 1 && d <= 3) { if (m.pick.length >= 4) return true; const L = m.J[m.pick.length][d - 1]; if (L.debris) { m.fault('debris lane'); return true; } m.pick.push(d - 1); return true; }
      if (ENTER(code)) { if (m.pick.length < 4) return true; if (m.ok(m.pick)) { m.win(); return true; } m.fault(tot(m.pick, 'f') > m.fuelCap ? 'stranded' : 'late'); m.pick = []; return true; }
      return false;
    };
    m.tick = (dt) => { m.live(dt); };
    m.hint = () => { if (m.pick.length === 4) return [['Enter', true]]; return [[`Digit${m.sol[m.pick.length] + 1}`, true]]; };
    m.bad = () => { if (m.pick.length === 4) return 'Enter'; const L = m.J[m.pick.length]; const k = L.findIndex(l => l.debris); return `Digit${(k >= 0 ? k : L.reduce((bi, l, i) => l.h < L[bi].h ? i : bi, 0)) + 1}`; };
    m.view = () => ({ J: m.J.map(L => L.map(l => [l.f, l.h, l.debris])), c: m.fuelCap, s: m.slot });
    m.buttons = () => [['Digit1', 'Lane 1'], ['Digit2', 'Lane 2'], ['Digit3', 'Lane 3'], ['Enter', 'Send to helm']];
    m.draw = (c, W, H, P) => {
      m.J.forEach((L, j) => {
        const x = 14 + j * 74, cur = j === m.pick.length; txt(c, `Junction ${j + 1}`, x, 14, { size: 10, col: cur ? COL.gold : COL.dim });
        L.forEach((l, k) => { const y = 20 + k * 30, chosen = m.pick[j] === k; box(c, x, y, 70, 26, chosen ? COL.panel : null, chosen ? COL.gold : l.debris ? P.bad : 'rgba(255,255,255,.15)', 4);
          txt(c, `${k + 1}  ${l.f} t · ${l.h} h`, x + 4, y + 17, { size: 10, col: l.debris ? P.bad : COL.ink }); if (l.debris) txt(c, '✕', x + 60, y + 10, { size: 9, col: P.bad }); });
      });
      const f = tot(m.pick, 'f'), h = tot(m.pick, 'h'); txt(c, `fuel ${f} / ${m.fuelCap} t usable`, 312, 30, { size: 10, col: f > m.fuelCap ? P.bad : COL.pale }); bar(c, 312, 36, 76, 8, f / (m.fuelCap * 1.4), { mark: 1 / 1.4 });
      txt(c, `time ${h} / ${m.slot} h slot`, 312, 70, { size: 10, col: h > m.slot ? P.bad : COL.pale }); bar(c, 312, 76, 76, 8, h / (m.slot * 1.4), { mark: 1 / 1.4, col: COL.peri });
      txt(c, 'Debris lanes (✕) lock the route. Both totals must stay under their marks.', 14, 130, { size: 10, col: COL.dim });
      txt(c, m.pick.length === 4 ? 'Route complete — Enter sends it to the helm' : `Choose lane at junction ${m.pick.length + 1}`, 14, 152, { size: 12 });
    };
    return m;
  },
});
