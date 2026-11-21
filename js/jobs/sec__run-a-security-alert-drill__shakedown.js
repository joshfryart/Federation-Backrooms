// Security: run a security alert drill. The drill card gives the exact second to sound the alert; sound it early and the drill leaks, miss it and
// there is no drill. Once the alert sounds, the response timer runs and crew drop onto the muster list as they arrive. When the timer ends, mark
// every name still missing (1-6) and submit the log with Space. Marking an arrived name, or missing one, is a faulty log.
import { define, machine, DIG, SPACE, rf, ri, shuffle, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'sec', label: 'Run a security alert drill', type: 'task:shakedown' },
  title: 'Time the alert, log the absent', dept: 'security', host: 'console', tool: 'PA panel and muster list',
  how: 'Press Space at the card time to sound the alert. Watch the muster list for eight seconds, then press the number of each missing name and Space to submit the log.',
  keys: ['Space sound the alert / submit the log', '1-6 mark a name missing'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'time the alert', input: 'digits+space',
    win: 'alert sounded within the drill-card window, then exactly the crew who never reached the muster list logged as missing',
    fail: 'sounding the alert before the card time and leaking the drill, never sounding it, or logging a wrong or incomplete missing list',
    rule: 'Wait for the card time, press Space once. When the response timer ends, mark every name still absent with 1-6 and press Space to submit.' },
  rush: 'Sounded the alert when it suited and counted heads by eye.',
  captions: { leaked: 'drill timing leaked', 'bad log': 'muster log rejected', early: 'log filed before the timer ended' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, tol = m.calm ? 0.6 : 0.4, T = 8; const names = ['Ens. Park', 'Lt. Okoye', 'CPO Ruiz', 'Tech Lund', 'Ens. Vale', 'Sgt. Hale'];
    m.card = rf(r, 2.5, 4.5); m.at = -1; const miss = shuffle(r, [0, 1, 2, 3, 4, 5]).slice(0, ri(r, 1, 2));
    m.cw = names.map((n, i) => ({ n, miss: miss.includes(i), arr: rf(r, 1, 6.5), mark: false })); m.mk = (i) => m.cw[i].mark;
    m.ended = () => m.at >= 0 && m.t - m.at >= T; m.here = (c) => m.at >= 0 && !c.miss && m.t - m.at >= c.arr;
    m.key = (code, down = true) => { if (m.state !== 'play' || !down) return false; const d = DIG(code);
      if (d >= 1 && d <= 6) { m.cw[d - 1].mark = !m.cw[d - 1].mark; return true; }
      if (!SPACE(code)) return false;
      if (m.at < 0) { if (m.t < m.card - tol) { m.fault('leaked'); m.fail('leaked'); } else m.at = m.t; return true; }
      if (!m.ended()) { m.fault('early'); return true; } if (m.cw.every(c => c.mark === c.miss)) m.win(); else { m.fault('bad log'); for (const c of m.cw) c.mark = false; } return true; };
    m.tick = (dt) => { if (!m.live(dt)) return; if (m.at < 0 && m.t > m.card + tol) m.fail('no alert'); };
    m.hint = () => { if (m.at < 0) return m.t >= m.card ? [['Space', true]] : []; if (!m.ended()) return []; const c = m.cw.findIndex(x => x.miss && !x.mark); return c >= 0 ? [['Digit' + (c + 1), true]] : [['Space', true]]; };
    m.bad = () => (m.at < 0 ? 'Space' : null);
    m.view = () => ({ card: +m.card.toFixed(2), cw: m.cw.map(c => [c.miss, +c.arr.toFixed(2)]) });
    m.buttons = () => [['Space', 'Alert / Log'], ['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['Digit5', '5'], ['Digit6', '6']];
    m.draw = (c) => { txt(c, `DRILL CARD: sound alert at T+${m.card.toFixed(1)} s`, 14, 20, { size: 12, col: COL.gold }); txt(c, m.at < 0 ? `clock ${m.t.toFixed(1)} s` : `response timer ${Math.max(0, T - (m.t - m.at)).toFixed(1)} s`, 14, 40, { size: 12, col: COL.pale });
      bar(c, 220, 30, 160, 10, m.at < 0 ? 0 : (m.t - m.at) / T, { col: COL.peri });
      m.cw.forEach((w, i) => { const x = 14 + (i % 3) * 126, y = 56 + Math.floor(i / 3) * 44; box(c, x, y, 118, 38, COL.panel, w.mark ? COL.warn : COL.dim); txt(c, `${i + 1} ${w.n}`, x + 6, y + 16, { size: 11 }); txt(c, w.mark ? '▲ marked absent' : m.here(w) ? '✓ present' : '...', x + 6, y + 31, { size: 10, col: w.mark ? COL.warn : COL.pale }); }); };
    return m;
  },
});
