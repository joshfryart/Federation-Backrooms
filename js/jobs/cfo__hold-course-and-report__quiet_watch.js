// CFO: hold course and report on a quiet watch. The heading creeps under a slow drift. Turn the course trim knob one notch at a time against it
// (← / →), but the ship answers slowly: wait for the drift figure to show the full effect of a notch before giving another, or you overshoot.
// The drift is read every two seconds; when three readings in a row sit inside the band, speak the heading to the bridge (Enter).
import { define, machine, ENTER, ARROW, rf, ri, clamp, txt, box, bar, COL } from './kit.js';

export default define({
  job: { billet: 'cfo', label: 'Hold course and report', type: 'task:quiet_watch' },
  title: 'Trim notch against slow drift', dept: 'flight', host: 'console', tool: 'Helm course line and trim knob',
  how: 'Give the trim knob one notch at a time against the drift (← / →) and wait for the drift figure to settle before the next. Three readings in the band in a row: report with Enter.',
  keys: ['← / → one trim notch', 'Enter report the heading'], limit: 34, maxFaults: 3,
  fingerprint: { verb: 'notch trim', input: 'arrows+enter', win: 'three drift readings in a row inside the band, reached notch by notch without overshoot, then the heading reported',
    fail: 'stacking notches before the last one has taken so the drift swings past zero, letting the heading wander off, or reporting early',
    rule: 'Each notch moves the drift 0.1°/s but only over a second or two. Notch, watch the figure settle, notch again. Readings come every 2 s; three in the band in a row, then Enter.' },
  rush: 'Wound the trim until the number looked small and logged the watch.',
  captions: { overshoot: 'helm overcorrects', 'drifted off': 'off-course chime', 'early report': 'bridge queries the figure' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, band = m.calm ? 0.06 : 0.05, tau = m.calm ? 0.9 : 1.1;
    const mk = () => (r() < 0.5 ? -1 : 1) * (ri(r, 2, 5) * 0.1 + rf(r, -0.025, 0.025));
    m.c = { b: mk(), trim: 0, eff: 0, e: 0, next: 2, good: 0, last: 0, shiftAt: rf(r, 6, 9), shifted: false, hdg: ri(r, 0, 359), reads: [] };
    const drift = () => m.c.b + m.c.eff;
    m.key = (code, down = true) => {
      if (m.state !== 'play' || !down) return false; const a = ARROW(code), c = m.c;
      if (a === 'L' || a === 'R') { c.trim = clamp(+(c.trim + (a === 'R' ? 0.1 : -0.1)).toFixed(2), -1.5, 1.5); return true; }
      if (ENTER(code)) { if (c.good >= 3) m.win(); else m.fault('early report'); return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const c = m.c; c.eff += (c.trim - c.eff) * Math.min(1, dt / tau * 2.2); c.e += drift() * dt;
      if (!c.shifted && m.t > c.shiftAt) { c.shifted = true; c.b += (r() < 0.5 ? -1 : 1) * 0.2; c.good = 0; m.ev('current shift'); }
      if (Math.abs(c.e) > 3) { m.fault('drifted off'); c.e = 0; }
      if (m.t >= c.next) { c.next += 2; const d = drift(); c.reads.push(+d.toFixed(2)); if (c.reads.length > 6) c.reads.shift();
        if (Math.abs(d) <= band) c.good++; else { if (c.last && Math.sign(d) !== Math.sign(c.last) && Math.abs(c.last) > band) m.fault('overshoot'); c.good = 0; } c.last = d; }
    };
    m.hint = () => {
      const c = m.c; if (c.good >= 3) return [['Enter', true]];
      if (Math.abs(c.trim - c.eff) > 0.02) return []; const need = -c.b - c.trim; if (Math.abs(need) < 0.05) return [];
      return [[need > 0 ? 'ArrowRight' : 'ArrowLeft', true]];
    };
    m.bad = () => 'ArrowRight';
    m.view = () => ({ b: +m.c.b.toFixed(3), s: +m.c.shiftAt.toFixed(2) });
    m.buttons = () => [['ArrowLeft', '◀ notch'], ['ArrowRight', 'notch ▶'], ['Enter', 'Report']];
    m.draw = (c, W, H, P) => {
      const k = m.c, d = drift();
      txt(c, `Heading ${((k.hdg + k.e + 360) % 360).toFixed(1)}°`, 20, 28, { size: 18 }); txt(c, `trim ${k.trim >= 0 ? '+' : ''}${k.trim.toFixed(1)}`, 250, 28, { size: 14, col: COL.pale });
      txt(c, `drift ${d >= 0 ? '+' : ''}${d.toFixed(2)} °/s`, 20, 58, { size: 14, col: Math.abs(d) <= band ? P.good : COL.warn });
      bar(c, 20, 66, 360, 12, 0, { band: [0.5 - band / 1.2, 0.5 + band / 1.2], mark: clamp(0.5 + d / 1.2) });
      bar(c, 20, 90, 360, 6, 0, { mark: clamp(0.5 + k.e / 6), col: COL.peri }); txt(c, 'course error', 20, 110, { size: 10, col: COL.dim });
      txt(c, `readings: ${k.reads.map(x => (x >= 0 ? '+' : '') + x.toFixed(2)).join('  ')}`, 20, 132, { size: 11, col: COL.pale });
      txt(c, `in band in a row ${k.good} / 3   next reading ${Math.max(0, k.next - m.t).toFixed(1)} s`, 20, 154, { size: 12, col: k.good >= 3 ? P.good : COL.ink });
    };
    return m;
  },
});
