// Chief engineer: watch the grid load during the sensor sweeps. Each sweep pulse pushes the load line up; when it crosses the warning mark,
// shed a circuit to bring it down. Never shed a protected circuit (life support, sickbay), never shed while the load is comfortably low, and
// never let it reach the red line (the breakers trip on their own and drop the sweep).
import { define, machine, DIG, rf, shuffle, txt, box, bar, COL } from './kit.js';

const SHED = ['Holodeck', 'Replicators', 'Lab heaters', 'Corridor lights', 'Gym', 'Arboretum lamps', 'Cargo lift'], KEEP = ['Life support', 'Sickbay'];
export default define({
  job: { billet: 'ce', label: 'Watch grid load during sweeps', type: 'task:survey' },
  title: 'Sweep load shedding', dept: 'engineering', host: 'console', tool: 'Plant grid board',
  how: 'Watch the grid load while the sweep runs; when it climbs over the warning mark, shed one non-essential circuit (its number). Keep it under the red line until the sweep ends.',
  keys: ['1 – 5 shed a circuit'], limit: 26, maxFaults: 3,
  fingerprint: { verb: 'shed load', input: 'digits', win: 'the sweep runs to the end with the load never reaching the red line and only spare circuits shed',
    fail: 'letting the load hit the red line, shedding a protected circuit, or shedding while the load is still low',
    rule: 'The load climbs with each sweep pulse. Over the warning mark, press the number of a non-essential circuit to shed it. Life support and sickbay are protected. Shedding below the warning band is wasteful.' },
  rush: 'Shed everything that was not life support before the sweep started.',
  captions: { overload: 'breakers trip, lights flicker', 'shed protected': 'sickbay alarm', 'shed early': 'engineer tuts' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, dur = 16, W = 75, R = m.calm ? 96 : 92;
    const names = shuffle(r, SHED).slice(0, 3).concat(KEEP).slice(0, 5); m.circ = shuffle(r, names).map(n => ({ n, kw: KEEP.includes(n) ? rf(r, 10, 14) : rf(r, 11, 16), keep: KEEP.includes(n), off: false }));
    m.pulses = []; for (let t = 1; t < dur - 1; t += rf(r, 1.4, 2.2)) m.pulses.push([t, rf(r, 4.5, 7)]);
    m.L = rf(r, 52, 58); m.p = 0; m.W = W; m.R = R; m.trace = [];
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const d = DIG(code); if (!d || d > 5) return false; const c = m.circ[d - 1]; if (c.off) return true;
      if (c.keep) { m.fault('shed protected'); return true; } if (m.L < W - 10) { m.fault('shed early'); return true; }
      c.off = true; m.L -= c.kw; return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; while (m.p < m.pulses.length && m.t >= m.pulses[m.p][0]) { m.L += m.pulses[m.p][1]; m.p++; }
      m.L += dt * 0.5; if (m.L >= R) { m.strikes++; m.fail('overload'); return; }
      if ((m.trace.length < m.t * 8)) m.trace.push(m.L); if (m.t >= dur) m.win();
    };
    m.hint = () => { if (m.L <= W) return []; const i = m.circ.findIndex(c => !c.keep && !c.off); return i >= 0 ? [['Digit' + (i + 1), true]] : []; };
    m.bad = () => { const i = m.circ.findIndex(c => c.keep); return 'Digit' + (i + 1); };
    m.view = () => ({ circ: m.circ.map(c => c.n), pulses: m.pulses.map(p => +p[1].toFixed(1)) });
    m.buttons = () => m.circ.map((c, i) => ['Digit' + (i + 1), `${i + 1} ${c.n}`]);
    m.draw = (c, Wd, H, P) => {
      const gx = 12, gy = 12, gw = 240, gh = 110, Y = (v) => gy + gh - (v - 30) / 70 * gh; box(c, gx, gy, gw, gh, 'rgba(255,255,255,.04)', null, 4);
      c.strokeStyle = COL.warn; c.setLineDash?.([4, 3]); c.beginPath(); c.moveTo(gx, Y(W)); c.lineTo(gx + gw, Y(W)); c.stroke(); c.strokeStyle = P.bad; c.beginPath(); c.moveTo(gx, Y(R)); c.lineTo(gx + gw, Y(R)); c.stroke(); c.setLineDash?.([]);
      c.strokeStyle = COL.gold; c.lineWidth = 2; c.beginPath(); m.trace.forEach((v, k) => { const x = gx + k / (dur * 8) * gw; if (!k) c.moveTo(x, Y(v)); else c.lineTo(x, Y(v)); }); c.stroke();
      txt(c, `Load ${m.L.toFixed(0)} %`, gx, gy + gh + 18, { size: 13, col: m.L > W ? COL.warn : COL.ink }); txt(c, `sweep ${Math.min(100, Math.round(m.t / dur * 100))} %`, gx + gw, gy + gh + 18, { size: 11, align: 'right', col: COL.peri });
      m.circ.forEach((q, i) => { const y = 14 + i * 26; box(c, 262, y, 128, 22, q.off ? 'rgba(255,255,255,.03)' : q.keep ? 'rgba(79,208,106,.14)' : 'rgba(125,151,232,.16)', null, 10); txt(c, `${i + 1} ${q.n}${q.keep ? ' ⛨' : ''}`, 270, y + 15, { size: 10, col: q.off ? COL.dim : COL.ink }); txt(c, q.off ? 'off' : `${q.kw.toFixed(0)}`, 384, y + 15, { size: 10, align: 'right', col: COL.dim }); });
      bar(c, 12, H - 12, 240, 6, m.L / 100, { col: m.L > W ? COL.warn : P.good });
    };
    return m;
  },
});
