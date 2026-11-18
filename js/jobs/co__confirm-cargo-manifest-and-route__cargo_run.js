// Captain: confirm cargo manifest and route. Keep a finger on the nav plot (hold Space) to trace the planned route waypoint by waypoint.
// When the traffic board shows the next waypoint's dock busy, lift the finger before you cross it and swap in a free alternate dock (1-3).
// Tracing through a busy dock, or swapping to another busy one, is a fault. At the end of the route initial the manifest (Enter).
import { define, machine, SPACE, ENTER, DIG, ri, shuffle, txt, box, lamp, COL } from './kit.js';

const PORT = ['Starbase 12', 'Kessik Yard', 'Rigel Depot', 'Tarsas Relay', 'Benzar Dock', 'Outpost 7', 'Vega Hub', 'Ardana Ring'];

export default define({
  job: { billet: 'co', label: 'Confirm cargo manifest and route', type: 'task:cargo_run' },
  title: 'Route trace with dock swaps', dept: 'command', host: 'console', tool: 'Nav plot touchscreen and traffic board',
  how: 'Hold Space to trace the route; lift off before any waypoint whose dock is busy, swap in a free alternate, then carry on and initial the manifest at the end.',
  keys: ['Space hold: trace', '1-3 swap dock', 'Enter initial'], limit: 26, maxFaults: 3,
  fingerprint: { verb: 'trace and swap', input: 'space-hold+digits+enter', win: 'the whole route traced with every busy dock swapped for a free alternate before the finger crosses it, then initialled',
    fail: 'tracing straight through a busy dock, or swapping to an alternate that is also busy',
    rule: 'Holding Space moves the finger along the route. Watch the traffic board: if the next dock is BUSY, let go before the finger reaches it, press the number of a FREE alternate, then hold again. Enter at the end.' },
  rush: 'Initialled the manifest without tracing the route against the traffic board.',
  captions: { 'busy dock': 'traffic control objects', 'not traced': 'plot buzz' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, v = m.calm ? 0.6 : 0.8, names = shuffle(r, PORT), busy = shuffle(r, [1, 2, 3, 4]).slice(0, 2);
    m.wps = [0, 1, 2, 3, 4].map(i => { const b = busy.includes(i) || (i > 0 && r() < 0.15); const free = ri(r, 1, 3); return { name: names[i], dock: ri(r, 1, 9), busy: b, ok: !b, alts: [1, 2, 3].map(k => ({ dock: ri(r, 10, 30), free: k === free })) }; });
    m.pos = 0; m.end = m.wps.length + 0.5; m.rounds = m.wps.length; m.round = 0; m.crates = ri(r, 18, 60);
    const nextBad = () => m.wps.findIndex((w, i) => !w.ok && i + 1 > m.pos - 0.3), at = () => { const i = nextBad(); return i >= 0 && m.pos >= i + 1 - 0.35 ? i : -1; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false;
      if (SPACE(code)) { m.held.S = down; return true; } if (!down) return false; const d = DIG(code);
      if (d >= 1 && d <= 3) { const i = at(); if (i < 0 || m.held.S) return true; const a = m.wps[i].alts[d - 1]; if (!a.free) { m.fault('busy dock'); return true; } m.wps[i].ok = true; m.wps[i].dock = a.dock; m.wps[i].busy = false; return true; }
      if (ENTER(code)) { if (m.pos < m.end) { m.fault('not traced'); return true; } m.win(); return true; }
      return !!d;
    };
    m.tick = (dt) => {
      if (!m.live(dt) || !m.held.S || m.pos >= m.end) return; m.pos = Math.min(m.end, m.pos + v * dt);
      const i = nextBad(); if (i >= 0 && m.pos > i + 1 + 0.15) { m.fault('busy dock'); m.pos = i + 1 - 0.05; }
      m.round = Math.min(m.wps.length, Math.floor(m.pos));
    };
    m.hint = () => {
      if (m.pos >= m.end) return [['Space', false], ['Enter', true]]; const i = nextBad();
      if (i >= 0 && m.pos >= i + 1 - 0.12) { if (m.held.S) return [['Space', false]]; return [['Digit' + (m.wps[i].alts.findIndex(a => a.free) + 1), true]]; }
      return [['Space', true]];
    };
    m.bad = () => ['Space', true];
    m.view = () => ({ w: m.wps.map(w => [w.name, w.busy, w.alts.map(a => a.free)]) });
    m.buttons = () => [['Space', 'Hold: trace'], ['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Enter', 'Initial']];
    m.draw = (c, W, H, P) => {
      const X = (p) => 20 + p / m.end * 250, Y = (p) => 80 + 30 * Math.sin(p * 1.3);
      c.strokeStyle = COL.dim; c.lineWidth = 2; c.beginPath(); for (let p = 0; p <= m.end; p += 0.1) c.lineTo(X(p), Y(p)); c.stroke();
      c.strokeStyle = COL.orange; c.lineWidth = 3; c.beginPath(); for (let p = 0; p <= m.pos; p += 0.05) c.lineTo(X(p), Y(p)); c.stroke();
      m.wps.forEach((w, i) => { const p = i + 1; lamp(c, X(p), Y(p), 7, w.ok ? P.good : P.bad, w.ok ? 'circle' : 'square'); txt(c, w.name, X(p), Y(p) + (i % 2 ? 22 : -14), { size: 8, align: 'center', col: COL.dim }); });
      c.fillStyle = m.held.S ? COL.warn : COL.ink; c.beginPath(); c.arc(X(m.pos), Y(m.pos), 5, 0, 6.283); c.fill();
      txt(c, `MANIFEST · ${m.crates} containers`, 8, 16, { size: 10, col: COL.gold });
      txt(c, 'TRAFFIC BOARD', 290, 16, { size: 10, col: COL.gold });
      m.wps.forEach((w, i) => txt(c, `${w.name.slice(0, 11)} D${w.dock} ${w.ok ? 'free' : 'BUSY'}`, 290, 32 + i * 13, { size: 9, col: w.ok ? COL.ink : P.bad }));
      const i = at(); if (i >= 0 && !m.wps[i].ok) m.wps[i].alts.forEach((a, k) => txt(c, `${k + 1}: D${a.dock} ${a.free ? 'free' : 'BUSY'}`, 290, 112 + k * 13, { size: 10, col: a.free ? P.good : P.bad }));
      if (m.pos >= m.end) txt(c, 'route traced — Enter to initial', 8, 160, { size: 11, col: P.good });
    };
    return m;
  },
});
