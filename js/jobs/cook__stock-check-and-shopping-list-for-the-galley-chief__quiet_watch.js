// Cook: stock check and shopping list for the Galley Chief. Four shelf lines run down by a day every second and a half. One courier carries the
// orders, and he takes two and a half seconds per run and can carry only one line at a time: press a line's digit to send him for it (it comes
// back as a week's stock). Keep every line above zero days until the galley chief takes the list. A line already on the pending slip is on its way.
import { define, machine, DIG, ri, txt, box, bar, COL } from './kit.js';

const NAMES = ['Flour', 'Protein paste', 'Coffee', 'Fresh greens'], DUR = 22;
export default define({
  job: { billet: 'cook', label: 'Stock check and shopping list for the Galley Chief', type: 'task:quiet_watch' },
  title: 'One courier, four emptying shelves', dept: 'services', host: 'console', tool: 'Stock card and courier slip',
  how: 'Four shelves empty a day at a time. Press a line\'s number to send the courier for it (one run at a time, 2.5 s each). Keep every line above zero until the list is taken.',
  keys: ['1-4 send the courier for that line'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'dispatch courier', input: 'digits',
    win: 'four draining shelf lines all kept above zero days for twenty-two seconds by dispatching the single courier in time',
    fail: 'letting a shelf reach zero, or sending the courier while he is still out on a run',
    rule: 'Days left drop one every 1.5 s on each line. A courier run takes 2.5 s and restocks one line to seven days; press a digit only when he is back, for the line that is closest to empty.' },
  rush: 'Wrote down whatever looked low and ordered the same bags twice.',
  captions: { 'ran out': 'shelf empty: the galley ran out', 'courier busy': 'courier is still out on a run' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, day = m.calm ? 2 : 1.5, run = m.calm ? 3 : 2.5; m.cur = -1; m.cd = 0; m.ac = 0;
    const start = [ri(r, 4, 5), ri(r, 6, 7), ri(r, 8, 9), ri(r, 10, 11)].sort(() => r() - 0.5);
    m.l = start.map((d, i) => ({ n: NAMES[i], d, f: 0, z: false })); const pend = ri(r, 0, 3); m.cur = pend; m.cd = 1.2;
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const d = DIG(code); if (d < 1 || d > 4) return false; if (!down) return true;
      if (m.cur >= 0) { m.fault('courier busy'); return true; } m.cur = d - 1; m.cd = run; return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; m.ac += dt; if (m.cur >= 0) { m.cd -= dt; if (m.cd <= 0) { m.l[m.cur].d += 7; m.cur = -1; } }
      for (const q of m.l) { q.f += dt; while (q.f >= day) { q.f -= day; q.d--; if (q.d <= 0 && !q.z) { q.z = true; m.fault('ran out'); q.d = 3; } } if (q.d > 0) q.z = false; }
      if (m.state === 'play' && m.t >= DUR) m.win();
    };
    m.hint = () => { if (m.state !== 'play' || m.cur >= 0) return []; let w = 0; m.l.forEach((q, i) => { if (q.d - q.f / day < m.l[w].d - m.l[w].f / day) w = i; }); return m.l[w].d <= 6 ? [['Digit' + (w + 1), true]] : []; };
    m.bad = () => 'Digit1';
    m.view = () => ({ l: m.l.map(q => q.d), p: m.cur });
    m.buttons = () => [['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4']];
    m.draw = (c, W, H, P) => {
      m.l.forEach((q, i) => { const y = 10 + i * 34; box(c, 8, y, 300, 30, COL.panel, m.cur === i ? COL.gold : null, 4); txt(c, `${i + 1} ${q.n}`, 16, y + 19, { size: 12 }); bar(c, 150, y + 9, 140, 12, q.d / 14, { col: q.d <= 2 ? P.bad : COL.peri }); txt(c, `${Math.max(0, q.d)}d`, 300, y + 20, { size: 11, align: 'right', col: q.d <= 2 ? P.bad : COL.ink }); });
      box(c, 320, 10, 72, 56, '#14202a', COL.peri, 6); txt(c, 'COURIER', 356, 26, { size: 9, align: 'center', col: COL.dim }); txt(c, m.cur >= 0 ? `line ${m.cur + 1}` : 'in', 356, 44, { size: 11, align: 'center', col: m.cur >= 0 ? COL.gold : P.good }); if (m.cur >= 0) bar(c, 326, 52, 60, 6, 1 - m.cd / run, {});
      txt(c, `list taken in ${Math.max(0, DUR - m.t).toFixed(0)} s`, 320, 158, { size: 10, col: COL.dim });
    };
    return m;
  },
});
