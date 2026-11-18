// Helm: run the helm maneuver test series on the shakedown. Work down the test card: command each manoeuvre with its arrow, watch the
// response trace, and see where the ship's response lands against the normal-lag tick. Then log it: 1 passed, 2 handling fault. A response
// past the tick is sluggish and must be logged as a fault, however small. Wait for the baseline light before the next test.
import { define, machine, ARROW, DIG, rf, shuffle, txt, box, lamp, COL } from './kit.js';

const T = { U: ['Forward', 'ArrowUp', '▲'], D: ['Reverse', 'ArrowDown', '▼'], L: ['Port turn', 'ArrowLeft', '◀'], R: ['Starboard turn', 'ArrowRight', '▶'] };
export default define({
  job: { billet: 'helm', label: 'Run the helm maneuver test series', type: 'task:shakedown' },
  title: 'Maneuver response lag test card', dept: 'flight', host: 'console', tool: 'Maneuver test card and response trace',
  how: 'Command each test on the card with its arrow when the baseline light is on, watch where the response lands on the trace, then press 1 (passed) or 2 (handling fault, past the lag tick).',
  keys: ['arrows command the test', '1 passed', '2 handling fault'], limit: 28, maxFaults: 3,
  fingerprint: { verb: 'judge the lag', input: 'arrows+digits', win: 'every test on the card commanded in order from baseline and logged pass or handling fault by where its response landed',
    fail: 'passing a manoeuvre whose response landed past the normal-lag tick, commanding the wrong test, or starting one before the baseline light',
    rule: 'An arrow commands the current test. The trace marks the command, then the ship\'s response; the tick is the normal lag limit. Press 1 if it responded inside the tick, 2 if after it.' },
  rush: 'Ticked the whole card passed because the ship turned each time.',
  captions: { 'sluggish passed': 'test pilot: that one lagged', 'wrong test': 'card says otherwise', 'not at baseline': 'baseline lamp still dark' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, tick = 0.5;
    const order = shuffle(r, ['U', 'D', 'L', 'R', ...shuffle(r, ['L', 'R']).slice(0, 1)]), slow = new Set(shuffle(r, [0, 1, 2, 3, 4]).slice(0, 1 + Math.floor(r() * 2)));
    m.tests = order.map((k, i) => ({ k, lag: slow.has(i) ? rf(r, 0.62, 0.95) : rf(r, 0.18, 0.4), res: null }));
    m.i = 0; m.phase = 'ready'; m.pt = 1; m.rounds = 5; m.round = 0; const base = m.calm ? 0.5 : 0.6;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code), d = DIG(code), t = m.tests[m.i];
      if (a) { if (!down) return true; if (m.phase !== 'ready') return true; if (m.pt < base) { m.fault('not at baseline'); return true; }
        if (a !== t.k) { m.fault('wrong test'); return true; } m.phase = 'wait'; m.pt = 0; return true; }
      if (d === 1 || d === 2) { if (!down || m.phase !== 'log') return true; const sl = t.lag > tick;
        if (sl && d === 1) { m.fault('sluggish passed'); return true; } if (!sl && d === 2) { m.fault('false fault'); return true; }
        t.res = d; m.i++; m.round = m.i; if (m.i >= m.tests.length) { m.win(); return true; } m.phase = 'ready'; m.pt = 0; return true; }
      return false;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; m.pt += dt; if (m.phase === 'wait' && m.pt >= Math.max(1.0, m.tests[m.i].lag + 0.2)) m.phase = 'log'; };
    m.hint = () => { const t = m.tests[m.i]; if (!t) return []; if (m.phase === 'ready' && m.pt >= base + 0.05) return [[T[t.k][1], true]]; if (m.phase === 'log') return [['Digit' + (t.lag > tick ? 2 : 1), true]]; return []; };
    m.bad = () => { const t = m.tests[m.i]; if (!t) return null; if (m.phase === 'log') return 'Digit' + (t.lag > tick ? 1 : 2); if (m.phase === 'ready') return T[t.k === 'U' ? 'D' : 'U'][1]; return null; };
    m.view = () => ({ tests: m.tests.map(t => [t.k, +t.lag.toFixed(2)]) });
    m.buttons = () => [['ArrowUp', '▲ fwd'], ['ArrowDown', '▼ rev'], ['ArrowLeft', '◀ port'], ['ArrowRight', 'stbd ▶'], ['Digit1', '1 passed'], ['Digit2', '2 fault']];
    m.draw = (c, W, H, P) => {
      box(c, 10, 10, 140, 150, COL.panel, null, 6); txt(c, 'TEST CARD', 20, 26, { size: 10, col: COL.dim });
      m.tests.forEach((t, i) => txt(c, `${i + 1}. ${T[t.k][2]} ${T[t.k][0]}${t.res ? (t.res === 1 ? '  pass' : '  FAULT') : ''}`, 20, 46 + i * 20, { size: 11, col: i === m.i ? COL.gold : t.res ? COL.dim : COL.ink }));
      const x0 = 166, w = 220, sc = w / 1.2, y = 64; txt(c, 'RESPONSE TRACE', x0, 26, { size: 10, col: COL.dim });
      c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(x0, y - 2, w, 4); c.fillStyle = P.bad; c.fillRect(x0 + tick * sc - 1, y - 14, 3, 28); txt(c, 'lag tick', x0 + tick * sc + 4, y - 8, { size: 9, col: P.bad });
      const t = m.tests[m.i];
      if (t && m.phase !== 'ready') { lamp(c, x0, y, 5, COL.peri, 'circle'); const e = Math.min(m.pt, 1.2); c.fillStyle = COL.peri; c.fillRect(x0, y - 1, e * sc, 2);
        if (m.pt >= t.lag) lamp(c, x0 + t.lag * sc, y, 7, t.lag > tick ? COL.warn : P.good, t.lag > tick ? 'triangle' : 'circle'); }
      lamp(c, x0 + 10, 112, 8, m.phase === 'ready' && m.pt >= base ? P.good : COL.dim, m.phase === 'ready' && m.pt >= base ? 'circle' : 'square');
      txt(c, m.phase === 'log' ? 'log it: 1 passed · 2 fault' : m.phase === 'wait' ? 'watching response…' : m.pt >= base ? 'baseline · command the test' : 'resetting to baseline…', x0 + 24, 116, { size: 12, col: COL.pale });
    };
    return m;
  },
});
