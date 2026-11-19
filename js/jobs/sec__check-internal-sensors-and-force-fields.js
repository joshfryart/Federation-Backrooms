// Security: check internal sensors and force fields. The lifeform board shows eight brig and corridor sectors, each with its crew and visitor
// blips drifting about. A dead sensor does not go blank: it keeps showing its last picture, so its blips sit perfectly still. Live crew also
// stop now and then for a moment, so a still blip is not proof. Watch, flag each frozen sector with its digit, then log the list (Enter).
import { define, machine, DIG, ENTER, ri, rf, shuffle, txt, box, lamp, COL } from './kit.js';

export default define({
  job: { billet: 'sec', label: 'Check internal sensors and force fields', type: 'loop' },
  title: 'Frozen sector on the lifeform board', dept: 'security', host: 'console', tool: 'Lifeform board',
  how: 'Watch the eight sectors. Live blips drift and sometimes pause briefly; a dead sensor freezes its blips for good. Flag each frozen sector (1-8), then log (Enter).',
  keys: ['1-8 flag sector dead', 'Enter log for engineering'], limit: 30, maxFaults: 3,
  fingerprint: { verb: 'spot the frozen', input: 'digits+enter', win: 'every dead sensor flagged by its stuck blips and the list logged without flagging a live sector',
    fail: 'flagging a sector whose crew merely paused, or logging the board with a dead sensor unflagged',
    rule: 'Each sector shows moving blips. A sector whose blips never move for several seconds is a dead sensor: press its digit. Brief pauses are crew standing still. Enter logs.' },
  rush: 'Glanced at the blip count, saw nobody missing and signed it.',
  captions: { 'false flag': 'board beeps: sensor responds', 'gap left': 'engineering finds a dead sensor later' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, nd = ri(r, 1, 2), dead = new Set(shuffle(r, [0, 1, 2, 3, 4, 5, 6, 7]).slice(0, nd)), still = m.calm ? 1.8 : 2.4;
    const names = ['Cell 1', 'Cell 2', 'Cell 3', 'Brig desk', 'Corridor A', 'Corridor B', 'Lift lobby', 'Armory door'];
    m.sec = names.map((name, i) => ({ name, dead: dead.has(i), flag: false, blips: Array.from({ length: ri(r, 1, 3) }, () => ({ x: rf(r, 0.2, 0.8), y: rf(r, 0.25, 0.75), f: rf(r, 0.6, 1.3), p: rf(r, 0, 6), a: rf(r, 0.12, 0.25) })),
      pauses: Array.from({ length: 2 }, () => { const a = rf(r, 0.5, 20); return [a, a + rf(r, 0.4, 0.8)]; }), mt: 0 }));
    const paused = (s, t) => s.dead || s.pauses.some(([a, b]) => t >= a && t <= b);
    m.sec.forEach(s => { s.ft = s.dead ? rf(r, 0, 3) : 0; });
    m.tick = (dt) => { if (!m.live(dt)) return; for (const s of m.sec) if (!paused(s, m.t)) s.mt += dt; };
    m.pos = (s, b) => { const t = s.dead ? s.ft : s.mt; return [b.x + b.a * Math.sin(t * b.f + b.p), b.y + b.a * 0.8 * Math.cos(t * b.f * 0.8 + b.p)]; };
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const n = DIG(code);
      if (n >= 1 && n <= 8) { const s = m.sec[n - 1]; if (s.flag) return true; if (!s.dead) { m.fault('false flag'); return true; } s.flag = true; m.ev('flag', { s: n }); return true; }
      if (ENTER(code)) { const miss = m.sec.filter(s => s.dead && !s.flag).length; if (miss) { m.fault('gap left'); return true; } m.win(); return true; }
      return false;
    };
    m.hint = () => { if (m.t < still + 0.2) return []; const k = m.sec.findIndex(s => s.dead && !s.flag); return k >= 0 ? [['Digit' + (k + 1), true]] : [['Enter', true]]; };
    m.bad = () => (m.t > 0.5 && Math.floor(m.t * 30) % 15 === 0 ? 'Enter' : null);
    m.view = () => ({ dead: m.sec.map(s => s.dead), blips: m.sec.map(s => s.blips.length) });
    m.buttons = () => [...m.sec.map((s, i) => ['Digit' + (i + 1), String(i + 1)]), ['Enter', 'Log']];
    m.draw = (c, W, H, P) => {
      m.sec.forEach((s, i) => { const x = 14 + (i % 4) * 94, y = 10 + Math.floor(i / 4) * 66, w = 86, h = 58;
        box(c, x, y, w, h, COL.panel, s.flag ? P.bad : 'rgba(255,255,255,.18)', 6);
        txt(c, `${i + 1} ${s.name}`, x + 5, y + 12, { size: 9, col: s.flag ? P.bad : COL.dim });
        for (const b of s.blips) { const [bx, by] = m.pos(s, b); lamp(c, x + bx * w, y + 14 + by * (h - 18), 4, COL.peri); }
        if (s.flag) txt(c, 'DEAD', x + w - 6, y + h - 6, { size: 10, col: P.bad, align: 'right' }); });
      txt(c, `flagged ${m.sec.filter(s => s.flag).length}  ·  watching ${m.t.toFixed(1)} s`, 14, 158, { size: 11, col: COL.pale });
    };
    return m;
  },
});
