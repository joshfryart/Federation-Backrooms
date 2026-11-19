// Sensor officer: watch for hazards around the vessel (medical relief). The proximity display rings the vessel with the alarm radius and a
// range ring inside it. Each new object closes on the vessel. Time its track: press and HOLD Space as it crosses the alarm radius and let go
// as it crosses the range ring; the display turns that time into a closing speed. Faster than the threshold: flag it to the bridge (Enter)
// before it reaches the vessel. A sloppy timing, a flag on a slow drifter, or a fast closer that arrives unflagged are faults.
import { define, machine, SPACE, ENTER, rf, shuffle, txt, lamp, bar, COL } from './kit.js';

export default define({
  job: { billet: 'sensor', label: 'Watch for hazards around the vessel', type: 'task:medical_relief' },
  title: 'Ring-to-ring closing speed timing', dept: 'sciences', host: 'console', tool: 'Proximity display',
  how: 'Hold Space from the moment an object crosses the alarm radius until it crosses the range ring to time its closing speed; flag it to the bridge (Enter) if the speed beats the threshold.',
  keys: ['Space hold: time ring to ring', 'Enter flag to the bridge'], limit: 36, maxFaults: 3,
  fingerprint: { verb: 'time the closing', input: 'enter+space-hold', win: 'every object entering the alarm radius timed ring to ring and each fast closer flagged to the bridge before it reaches the vessel',
    fail: 'starting or stopping the timer off the rings so the speed estimate is wrong, flagging a slow drifter, or letting a fast closer reach the vessel unflagged',
    rule: 'Space down as the object touches the outer ring, up as it touches the inner range ring. Read the speed against the threshold: over it, Enter at once; under it, leave it.' },
  rush: 'Set the proximity alarm and went back to the lifesign count.',
  captions: { 'bad estimate': 'track timer buzz', 'false alarm': 'bridge stands down', 'surprise hazard': 'collision alarm', untracked: 'track lost tone' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, R0 = 66, R1 = 38, R2 = 10, sc = m.calm ? 0.75 : 1, thr = 30 * sc, tol = 0.25, N = 4;
    const kinds = shuffle(r, [true, false, r() < 0.5, r() < 0.5]);
    m.obj = kinds.map(f => ({ fast: f, v: (f ? rf(r, 40, 58) : rf(r, 12, 21)) * sc, a: rf(r, 0, 6.283), r0: R0 + rf(r, 10, 26) }));
    m.i = 0; m.o = null; m.hold = false; m.round = 0; m.rounds = N;
    const spawn = () => { const d = m.obj[m.i]; m.o = { ...d, rr: d.r0, t0: -1, tm: -1, est: -1, flag: false, fade: -1, timed: false }; };
    const est = (o) => (R0 - R1) / o.tm, done = () => { m.i++; m.round = m.i; m.o = null; if (m.i >= N) m.win(); else spawn(); };
    spawn();
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const o = m.o;
      if (SPACE(code)) { if (down && !m.hold) { m.hold = true; if (o && !o.timed) o.t0 = m.t; } else if (!down && m.hold) { m.hold = false;
        if (o && !o.timed && o.t0 >= 0) { o.timed = true; o.tm = m.t - o.t0; o.est = est(o);
          if (Math.abs(o.est - o.v) / o.v > tol) { m.fault('bad estimate'); o.est = o.v; } if (!o.fast) o.fade = 0.8; } } return true; }
      if (ENTER(code)) { if (!down || !o || o.flag) return true; if (!o.timed || !o.fast) { m.fault('false alarm'); return true; } o.flag = true; o.fade = 0.6; return true; }
      return false;
    };
    m.tick = (dt) => {
      if (!m.live(dt)) return; const o = m.o; if (!o) return; if (o.fade >= 0) { o.fade -= dt; if (o.fade < 0) done(); return; }
      o.rr -= o.v * dt; if (o.rr < R1 - 6 && !o.timed && !(m.hold && o.t0 >= 0)) { m.fault('untracked'); o.timed = true; o.est = o.v; if (!o.fast) o.fade = 0.5; }
      if (o.rr <= R2) { if (o.fast && !o.flag) m.fault('surprise hazard'); done(); }
    };
    m.hint = () => { const o = m.o; if (!o || o.fade >= 0) return m.hold ? [['Space', false]] : [];
      if (!o.timed) { if (!m.hold && o.rr <= R0) return [['Space', true]]; if (m.hold && o.rr <= R1) return [['Space', false]]; return []; }
      return o.fast && !o.flag ? [['Enter', true]] : []; };
    m.bad = () => (m.o && m.o.fade < 0 ? 'Enter' : null);
    m.view = () => ({ o: m.obj.map(o => [o.fast, +o.v.toFixed(1)]) });
    m.buttons = () => [['Space', 'Hold: time track'], ['Enter', 'Flag to bridge']];
    m.draw = (c, W, H, P) => {
      const cx = 92, cy = 85; c.lineWidth = 2; for (const [R, col] of [[R0, P.bad], [R1, COL.peri], [R2, COL.ink]]) { c.strokeStyle = col; c.beginPath(); c.arc(cx, cy, R, 0, 6.283); c.stroke(); }
      txt(c, 'ALARM', cx + R0 - 18, cy - R0 + 6, { size: 8, col: P.bad }); lamp(c, cx, cy, 6, COL.pale, 'square');
      const o = m.o; if (o) { const x = cx + Math.cos(o.a) * o.rr, y = cy + Math.sin(o.a) * o.rr; c.globalAlpha = o.fade >= 0 ? 0.4 : 1; lamp(c, x, y, 5, o.flag ? P.bad : COL.gold, o.flag ? 'triangle' : 'circle'); c.globalAlpha = 1; }
      txt(c, `OBJECT ${Math.min(N, m.i + 1)} / ${N}`, 190, 26, { size: 11, col: COL.gold });
      txt(c, 'TRACK TIMER', 190, 48, { size: 10, col: COL.dim }); bar(c, 190, 54, 190, 10, o && o.t0 >= 0 ? Math.min(1, ((o.timed ? o.tm : m.t - o.t0)) / 3) : 0, { col: m.hold ? COL.gold : COL.peri });
      if (o && o.timed) { const e = o.est; txt(c, `closing ${e.toFixed(0)} m/s`, 190, 88, { size: 15, col: e > thr ? COL.warn : COL.ink }); txt(c, e > thr ? 'OVER threshold — flag it' : 'under threshold — log only', 190, 106, { size: 10, col: e > thr ? COL.warn : COL.dim }); }
      txt(c, `threshold ${thr.toFixed(0)} m/s`, 190, 128, { size: 11, col: COL.pale }); txt(c, 'Space: outer ring → range ring · Enter flag', 190, 150, { size: 9, col: COL.dim });
    };
    return m;
  },
});
