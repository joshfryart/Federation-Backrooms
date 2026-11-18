// EPS tech: watch tap load during long scans (survey). Three tap trend lines scroll across the graph. Most climbs are bumps from the scan
// pulses that crest and fall back by themselves; a real fault is a line that bends upward and KEEPS rising toward the upper mark. Select the
// tap (↑ / ↓) and shed its non-essential section (Space) once the climb has run a full second, before it crosses. Shedding a bump wastes power.
import { define, machine, ARROW, SPACE, ri, rf, txt, COL } from './kit.js';

const TAPS = ['Tap 2-A', 'Tap 2-B', 'Tap 3-A'];
export default define({
  job: { billet: 'eps', label: 'Watch tap load during long scans', type: 'task:survey' },
  title: 'Catch the bend on the tap trend', dept: 'engineering', host: 'console', tool: 'Tap load trend graph',
  how: 'Watch the three tap trends. A bump crests within a second and falls back; a bend keeps rising. Select that tap (↑ ↓) and shed it (Space) after a full second of climb, before it reaches the upper mark.',
  keys: ['↑ ↓ select tap', 'Space shed its section'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'extrapolate and shed', input: 'arrows+space', win: 'three sustained trend bends caught after their climb is confirmed and shed before reaching the upper mark',
    fail: 'shedding a tap on a pulse bump or flat line, or letting a bending trend run over the upper mark',
    rule: 'Each line has a climb timer. Bumps never climb past 0.8 s. Once a line has climbed for a second it is a bend: put the cursor on it with ↑ ↓ and press Space before it touches the dashed upper mark.' },
  rush: 'Shed every non-essential section before the scan began.',
  captions: { 'needless shed': 'section drops', 'tap tripped': 'tap breaker trips' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, conf = 1.0, rise = m.calm ? 0.1 : 0.13, top = 0.86;
    m.evs = []; let t = 1.2, bends = 0; while (bends < 3) { const bend = m.evs.length >= 1 && (r() < 0.5 || m.evs.length - bends >= 3); m.evs.push({ tap: ri(r, 0, 2), a: t, bend, shed: null, tripped: false }); if (bend) bends++; t += bend ? rf(r, 3.4, 4.2) : rf(r, 1.6, 2.4); }
    m.base = TAPS.map(() => rf(r, 0.38, 0.5)); m.sel = 0; m.rounds = 3; m.round = 0;
    const contrib = (e, x) => { if (x < e.a) return 0; const d = x - e.a; if (!e.bend) return d < 0.8 ? rise * d : Math.max(0, rise * (1.6 - d)); if (e.shed != null && x >= e.shed) return Math.max(-0.12, -0.3 * (x - e.shed)); if (e.tripped) return 0; return rise * d; };
    m.val = (i, x) => m.base[i] + 0.02 * Math.sin(x * 3 + i * 2) + m.evs.filter(e => e.tap === i).reduce((s, e) => s + contrib(e, x), 0);
    const climbing = (i) => m.evs.find(e => e.tap === i && e.bend && e.shed == null && !e.tripped && m.t >= e.a);
    const climbT = (i) => { const e = m.evs.find(e => e.tap === i && m.t >= e.a && e.shed == null && !e.tripped && (e.bend || m.t - e.a < 0.8)); return e ? m.t - e.a : 0; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'U' || a === 'D') { if (down) m.sel = (m.sel + (a === 'D' ? 1 : 2)) % 3; return true; }
      if (!SPACE(code)) return false; if (!down) return true; const e = climbing(m.sel);
      if (!e || m.t - e.a < conf) { m.fault('needless shed'); return true; }
      e.shed = m.t; m.round++; if (m.evs.filter(x => x.bend).every(x => x.shed != null || x.tripped)) m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; for (const e of m.evs) if (e.bend && e.shed == null && !e.tripped && m.val(e.tap, m.t) >= top) { e.tripped = true; m.fault('tap tripped'); if (m.state === 'play' && m.evs.filter(x => x.bend).every(x => x.shed != null || x.tripped)) m.fail('tap tripped'); } };
    m.hint = () => { for (let i = 0; i < 3; i++) { const e = climbing(i); if (e && m.t - e.a >= conf + 0.1) return m.sel !== i ? [[(i - m.sel + 3) % 3 === 1 ? 'ArrowDown' : 'ArrowUp', true]] : [['Space', true]]; } return []; };
    m.bad = () => 'Space';
    m.view = () => ({ evs: m.evs.map(e => [e.tap, +e.a.toFixed(2), e.bend]) });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['Space', 'Shed']];
    m.draw = (c, W, H, P) => {
      const x0 = 96, w = 290, y0 = 14, h = 130, span = 6, Y = (v) => y0 + h - v * h, cols = [COL.gold, COL.peri, COL.lav];
      c.strokeStyle = P.bad; c.setLineDash([5, 4]); c.beginPath(); c.moveTo(x0, Y(top)); c.lineTo(x0 + w, Y(top)); c.stroke(); c.setLineDash([]);
      txt(c, 'UPPER', x0 + w - 2, Y(top) - 4, { size: 9, align: 'right', col: P.bad });
      for (let i = 0; i < 3; i++) {
        c.strokeStyle = cols[i]; c.lineWidth = m.sel === i ? 3 : 1.5; c.beginPath();
        for (let k = 0; k <= 60; k++) { const x = m.t - span + k * span / 60, v = x < 0 ? m.base[i] : m.val(i, x); if (!k) c.moveTo(x0 + k / 60 * w, Y(v)); else c.lineTo(x0 + k / 60 * w, Y(v)); } c.stroke();
        const ct = climbT(i), y = 30 + i * 38;
        txt(c, `${m.sel === i ? '▶ ' : '  '}${TAPS[i]}`, 8, y, { size: 11, col: cols[i] });
        txt(c, ct > 0 ? `climb ${ct.toFixed(1)} s` : 'steady', 14, y + 14, { size: 10, col: ct >= conf ? COL.warn : COL.dim });
      }
      txt(c, `bends shed ${m.evs.filter(e => e.shed != null).length} / 3`, W - 12, H - 8, { size: 11, align: 'right', col: COL.pale });
    };
    return m;
  },
});
