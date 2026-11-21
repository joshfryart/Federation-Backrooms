// Cargo: strap down everything in the bay before maneuvers. Five pallets show a height and a weight; risk is height times weight. The ship will
// lurch every few seconds and shifts the riskiest loose pallet. Press a pallet's digit to strap it (takes a moment), highest risk first.
import { define, machine, DIG, ri, shuffle, txt, box, COL } from './kit.js';

export default define({
  job: { billet: 'cargo', label: 'Strap down everything in the bay before maneuvers', type: 'task:shakedown' },
  title: 'Strap the worst first', dept: 'services', host: 'console', tool: 'Bay pallet board',
  how: 'Each pallet has a height and weight; risk is height x weight. Press a pallet\'s digit to strap it, highest risk first. Each lurch shifts the riskiest pallet still loose.',
  keys: ['1-5 strap that pallet'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'strap worst first', input: 'digits',
    win: 'all five pallets strapped before the maneuvers, the riskiest always strapped first',
    fail: 'a lurch finding the riskiest pallet still loose, repeatedly, so it shifts and strikes the bulkhead',
    rule: 'Risk is height times weight on each pallet tag. Press its digit to strap it; strapping takes about a second. At each lurch the riskiest pallet that is still loose shifts: strap in descending risk order.' },
  rush: 'Strapped the pallets nearest the door and left the tall ones.',
  captions: { shifted: 'pallet slams into bulkhead' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, busyT = m.calm ? 1.0 : 1.3, gap = m.calm ? 1.4 : 1.5;
    const risks = shuffle(r, [2, 4, 6, 9, 12, 15, 18, 24, 30, 36]).slice(0, 5);
    m.pal = risks.map(k => { const h = [1, 2, 3, 4, 6].filter(x => k % x === 0 && k / x <= 9 && k / x >= 1); const hh = h[ri(r, 0, h.length - 1)] || 1; return { h: hh, w: Math.max(1, Math.min(9, Math.round(k / hh))), risk: 0, on: false }; });
    m.pal.forEach(p => { p.risk = p.h * p.w; }); m.busy = 0; m.target = -1; m.next = gap; m.lt = 0; m.rounds = 5; m.round = 0;
    const loose = () => m.pal.map((p, k) => k).filter(k => !m.pal[k].on).sort((a, b) => m.pal[b].risk - m.pal[a].risk);
    m.key = (code, down = true) => {
      const d = DIG(code); if (m.state !== 'play' || !down || d < 1 || d > 5) return false; if (m.busy > 0 || m.pal[d - 1].on) return true; m.busy = busyT; m.target = d - 1; return true;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; if (m.busy > 0) { m.busy -= dt; if (m.busy <= 0) { m.pal[m.target].on = true; m.round++; if (m.pal.every(p => p.on)) { m.win(); return; } } }
      m.lt += dt; if (m.lt >= m.next) { m.lt = 0; const L = loose().filter(k => !(m.busy > 0 && k === m.target)); if (L.length && L[0] === loose()[0]) m.fault('shifted'); }
    };
    m.hint = () => { const L = loose(); return m.busy > 0 || !L.length ? [] : [['Digit' + (L[0] + 1), true]]; };
    m.bad = () => { const L = loose(); return 'Digit' + ((L[L.length - 1] ?? 0) + 1); };
    m.view = () => ({ pal: m.pal.map(p => [p.h, p.w]) });
    m.buttons = () => [1, 2, 3, 4, 5].map(k => ['Digit' + k, String(k)]);
    m.draw = (c, W, H, P) => {
      txt(c, `LURCH IN ${Math.max(0, m.next - m.lt).toFixed(1)} s`, 12, 18, { size: 12, col: COL.peri });
      m.pal.forEach((p, k) => { const x = 10 + k * 78; box(c, x, 30, 70, 100, p.on ? 'rgba(79,208,106,.12)' : 'rgba(255,255,255,.06)', m.busy > 0 && m.target === k ? COL.gold : COL.dim, 6);
        txt(c, String(k + 1), x + 8, 50, { size: 15 }); txt(c, `h ${p.h}`, x + 35, 76, { size: 12, align: 'center' }); txt(c, `w ${p.w}`, x + 35, 96, { size: 12, align: 'center' }); txt(c, p.on ? 'STRAPPED' : 'loose', x + 35, 120, { size: 10, align: 'center', col: p.on ? P.good : P.bad }); });
      txt(c, m.busy > 0 ? 'strapping...' : 'risk = height x weight', W / 2, H - 10, { size: 11, align: 'center', col: COL.pale });
    };
    return m;
  },
});
