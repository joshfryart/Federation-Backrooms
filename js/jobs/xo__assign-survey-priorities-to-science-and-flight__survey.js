// XO: assign survey priorities to science and flight. The shared plan is a timeline: steady-heading stretches with turns between them, and
// each survey target has a window when it can be seen. Hold an arrow to slide the target's scan block along the timeline and Enter to drop it.
// It must sit wholly inside its window and wholly on a steady heading; a scan dropped inside a turn or outside its window is refused.
import { define, machine, ARROW, ENTER, shuffle, rf, ri, txt, box, COL } from './kit.js';

const TG = ['Ion plume K-7', 'Dust ring arc', 'Rogue moonlet', 'Magnetar flare', 'Comet tail', 'Gas giant aurora'];
const SPAN = 60;
export default define({
  job: { billet: 'xo', label: 'Assign survey priorities to science and flight', type: 'task:survey' },
  title: 'Survey window slot planner', dept: 'command', host: 'console', tool: 'Shared science and helm plan',
  how: 'Slide each target\'s scan block along the timeline and drop it where the target\'s window and a steady heading overlap, clear of turns.',
  keys: ['← → hold: slide', 'Enter drop'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'slot into overlap', input: 'arrows-hold+enter', win: 'every target scan block dropped wholly inside both its sighting window and a steady-heading stretch',
    fail: 'dropping a scan across a helm turn, outside the target window, or on top of another scan',
    rule: 'Hold ← or → to glide the scan block along the 60-minute plan; Enter drops it. The block must lie inside the target window (bracket) and on a solid steady-heading bar, not a hatched turn.' },
  rush: 'Gave science the target list and let helm fly whatever course it liked.',
  captions: { 'inside a turn': 'helm objects', 'outside window': 'science objects', 'double booked': 'plan conflict tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, speed = m.calm ? 14 : 18;
    const t1 = ri(r, 14, 18), t2 = ri(r, 36, 40), tw = ri(r, 4, 6);
    m.steady = [[0, t1], [t1 + tw, t2], [t2 + tw, SPAN]];
    m.tg = shuffle(r, TG).slice(0, 3).map((name, k) => { const p = m.steady[k], d = ri(r, 5, 7), room = Math.min(p[1] - p[0], d + ri(r, 4, 8)), s = p[0] + rf(r, 0, p[1] - p[0] - room);
      return { name, d, win: [Math.max(0, +(s - rf(r, 3, 9)).toFixed(1)), +(s + room + (k < 2 ? rf(r, 4, 9) : 0)).toFixed(1)].map(v => Math.min(SPAN, v)), at: null }; });
    m.tg = shuffle(r, m.tg); m.i = 0; m.x = 0; m.rounds = 3; m.round = 0;
    const cur = () => m.tg[m.i], inside = (a, b, iv) => a >= iv[0] - 1e-6 && b <= iv[1] + 1e-6;
    const feas = (t) => { for (const p of m.steady) { const lo = Math.max(p[0], t.win[0]), hi = Math.min(p[1], t.win[1]) - t.d; if (hi - lo >= 0) return [lo, hi]; } return null; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'L' || a === 'R') { m.held[a] = down; return true; }
      if (!ENTER(code) || !down) return false; const t = cur(), a0 = m.x, b0 = m.x + t.d;
      if (!inside(a0, b0, t.win)) { m.fault('outside window'); return true; }
      if (!m.steady.some(p => inside(a0, b0, p))) { m.fault('inside a turn'); return true; }
      if (m.tg.some(o => o.at != null && a0 < o.at + o.d && b0 > o.at)) { m.fault('double booked'); return true; }
      t.at = +m.x.toFixed(1); m.ev('drop', { i: m.i, at: t.at }); m.i++; m.round++; if (m.i >= m.tg.length) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const t = cur(); if (!t) return; m.x += ((m.held.R ? 1 : 0) - (m.held.L ? 1 : 0)) * speed * dt; m.x = Math.max(0, Math.min(SPAN - t.d, m.x)); };
    m.hint = () => { const t = cur(); if (!t) return []; const f = feas(t), g = (f[0] + f[1]) / 2, tol = Math.max(0.4, (f[1] - f[0]) / 2 - 0.3);
      if (m.x < g - tol) return [['ArrowLeft', false], ['ArrowRight', true]]; if (m.x > g + tol) return [['ArrowRight', false], ['ArrowLeft', true]]; return [['ArrowLeft', false], ['ArrowRight', false], ['Enter', true]]; };
    m.bad = () => 'Enter';
    m.view = () => ({ steady: m.steady, tg: m.tg.map(t => [t.name, t.d, t.win]) });
    m.buttons = () => [['ArrowLeft', '◀ slide'], ['ArrowRight', 'slide ▶'], ['Enter', 'Drop']];
    m.draw = (c, W, H, P) => {
      const X = (v) => 14 + v / SPAN * (W - 28), t = cur();
      txt(c, 'HELM: steady heading ▬   turn ▨', 14, 18, { size: 10, col: COL.dim });
      c.fillStyle = 'rgba(255,179,71,.25)'; c.fillRect(X(0), 28, W - 28, 14); for (const p of m.steady) box(c, X(p[0]), 28, X(p[1]) - X(p[0]), 14, P.good, null, 2);
      for (let v = 0; v <= SPAN; v += 10) txt(c, `${v}`, X(v), 56, { size: 9, col: COL.dim, align: 'center' });
      m.tg.forEach((o, k) => { const y = 66 + k * 24; txt(c, o.name, 14, y + 12, { size: 10, col: k === m.i ? COL.gold : COL.ink });
        c.strokeStyle = COL.peri; c.lineWidth = 2; c.strokeRect(X(o.win[0]), y + 2, X(o.win[1]) - X(o.win[0]), 16);
        const at = o.at != null ? o.at : k === m.i ? m.x : null; if (at != null) box(c, X(at), y + 5, X(at + o.d) - X(at), 10, o.at != null ? P.good : COL.orange, null, 3); });
      if (t) txt(c, `${t.name}: ${t.d} min scan at ${m.x.toFixed(1)}–${(m.x + t.d).toFixed(1)}  ·  window ${t.win[0]}–${t.win[1]}`, 14, H - 6, { size: 10, col: COL.pale });
    };
    return m;
  },
});
