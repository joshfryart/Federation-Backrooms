// Yeoman: clear the captain's calendar for the relief operation. The relief window is fixed on the captain's day; meetings sit across it.
// Pick each movable meeting and slide it (hold ← / →) into free time outside the window, then let go to drop it. Fixed meetings (the
// admiral's call, the medical board) will not move, and a drop on top of another meeting bounces back. Block the window (Space) only when
// nothing is left inside it.
import { define, machine, ARROW, SPACE, ri, shuffle, txt, box, COL } from './kit.js';

const MOV = ['Supply review', 'Crew evals', 'Refit call', 'Science brief', 'Morale report', 'Stores audit'];
const FIX = ['Admiral\'s call', 'Medical board', 'Envoy hail', 'Starbase link'];
const T0 = 480, SPAN = 360, hm = (min) => `${String(Math.floor((T0 + min) / 60)).padStart(2, '0')}${String((T0 + min) % 60).padStart(2, '0')}`;

export default define({
  job: { billet: 'yeoman', label: 'Clear captain\'s calendar for relief op', type: 'task:medical_relief' },
  title: 'Slide meetings out of the relief window', dept: 'command', host: 'console', tool: 'Captain\'s calendar grid',
  how: 'Pick a meeting (↑ ↓), hold ← or → to slide it out of the shaded relief window into free time, and let go to drop it. Fixed meetings will not move. Space blocks the window once it is clear.',
  keys: ['↑ ↓ pick a meeting', '← → hold: slide', 'Space block the window'], limit: 40, maxFaults: 3,
  fingerprint: { verb: 'slide and drop', input: 'arrows-hold+space', win: 'the relief window blocked on a captain\'s day with every movable meeting moved into free time and no overlaps',
    fail: 'dragging a fixed meeting, dropping one on top of another, or blocking while a meeting still sits in the window',
    rule: 'Meetings marked ■ FIXED refuse to move. Hold an arrow to slide the picked meeting along the day; release where it touches nothing. When no meeting overlaps the shaded window, press Space.' },
  rush: 'Blocked the window over the top of everything and let the attendees find out.',
  captions: { 'fixed meeting': 'handset: "the admiral won\'t move"', clash: 'calendar double-chime', 'double-booked': 'two calls ring at once' },
  create(seed, opts) {
    const m = machine(this, seed, opts), r = m.rnd, speed = m.calm ? 40 : 60;
    for (let tries = 0; tries < 40; tries++) {
      const W = ri(r, 7, 10) * 15, mv = shuffle(r, MOV).slice(0, 3).map(n => ({ n, dur: [30, 45, 45, 60][ri(r, 0, 3)], fixed: false })), fx = shuffle(r, FIX).slice(0, 2).map(n => ({ n, dur: [30, 45][ri(r, 0, 1)], fixed: true }));
      const blocks = shuffle(r, [...mv, ...fx]); let cur = 0, ok = true;
      for (const b of blocks) { cur += ri(r, 0, 1) * 15; if (cur + b.dur > W && cur < W + 120) cur = W + 120; if (cur + b.dur > SPAN) { ok = false; break; } b.home = cur; cur += b.dur; }
      if (!ok) continue;
      for (const b of mv) { b.target = b.home; b.s = W + ri(r, 0, (120 - b.dur) / 15) * 15; } for (const b of fx) b.s = b.home;
      m.W = W; m.meet = blocks; break;
    }
    m.sel = m.meet.findIndex(b => !b.fixed); m.from = null; m.rounds = 0;
    const over = (a, b) => a.s < b.s + b.dur && b.s < a.s + a.dur, inWin = (b) => b.s < m.W + 120 && m.W < b.s + b.dur, M = () => m.meet[m.sel];
    const drop = () => { const b = M(); b.s = Math.round(b.s / 15) * 15; if (m.meet.some(o => o !== b && over(o, b))) { m.fault('clash'); b.s = m.from; } m.from = null; };
    m.key = (code, down = true) => {
      if (m.state !== 'play') return false; const a = ARROW(code);
      if (a === 'U' || a === 'D') { if (down && m.from === null) m.sel = (m.sel + (a === 'D' ? 1 : m.meet.length - 1)) % m.meet.length; return true; }
      if (a === 'L' || a === 'R') { const was = m.held[a]; m.held[a] = down; const b = M();
        if (down && !was) { if (b.fixed) m.fault('fixed meeting'); else if (m.from === null) m.from = b.s; }
        if (!down && !m.held.L && !m.held.R && m.from !== null) drop(); return true; }
      if (!SPACE(code)) return false; if (!down) return true;
      if (m.meet.some(inWin)) m.fault('double-booked'); else m.win(); return true;
    };
    m.tick = (dt) => { if (!m.live(dt)) return; const b = M(), d = (m.held.R ? 1 : 0) - (m.held.L ? 1 : 0); if (d && !b.fixed && m.from !== null) b.s = Math.max(0, Math.min(SPAN - b.dur, b.s + d * speed * dt)); };
    m.hint = () => {
      const k = m.meet.findIndex(b => !b.fixed && b.s !== b.target); if (k < 0) return [['ArrowLeft', false], ['ArrowRight', false], ['Space', true]];
      if (m.from === null && k !== m.sel) return [['ArrowDown', true]]; const b = m.meet[k], e = b.target - b.s;
      if (Math.abs(e) < 6) return [['ArrowLeft', false], ['ArrowRight', false]]; return e > 0 ? [['ArrowLeft', false], ['ArrowRight', true]] : [['ArrowRight', false], ['ArrowLeft', true]];
    };
    m.bad = () => { const b = M(); if (!b.fixed) return 'ArrowDown'; return ['ArrowLeft', !m.held.L]; };
    m.view = () => ({ W: m.W, meet: m.meet.map(b => [b.n, b.s, b.dur, b.fixed]) });
    m.buttons = () => [['ArrowUp', '▲'], ['ArrowDown', '▼'], ['ArrowLeft', '◀ slide'], ['ArrowRight', 'slide ▶'], ['Space', 'Block window']];
    m.draw = (c, W, H, P) => {
      const x0 = 12, w = W - 24, X = (min) => x0 + min / SPAN * w; txt(c, 'CAPTAIN\'S DAY', 12, 16, { size: 10, col: COL.peri });
      c.fillStyle = 'rgba(255,90,72,.12)'; c.fillRect(X(m.W), 24, X(m.W + 120) - X(m.W), 112); c.strokeStyle = COL.warn; c.lineWidth = 2; c.strokeRect(X(m.W), 24, X(m.W + 120) - X(m.W), 112);
      txt(c, 'RELIEF WINDOW', (X(m.W) + X(m.W + 120)) / 2, 132, { size: 9, align: 'center', col: COL.warn });
      for (let h = 0; h <= SPAN; h += 60) { c.fillStyle = 'rgba(255,255,255,.15)'; c.fillRect(X(h), 24, 1, 112); txt(c, hm(h), X(h), 148, { size: 8, align: 'center', col: COL.dim }); }
      m.meet.forEach((b, i) => { const y = 28 + i * 20, on = i === m.sel, clash = m.meet.some(o => o !== b && over(o, b)) || inWin(b);
        box(c, X(b.s), y, X(b.s + b.dur) - X(b.s), 17, b.fixed ? 'rgba(125,151,232,.35)' : 'rgba(244,194,91,.3)', on ? COL.ink : clash ? P.bad : null, 4);
        txt(c, `${b.fixed ? '■ FIXED ' : ''}${b.n}`, X(b.s) + 3, y + 12, { size: 8, col: COL.ink }); });
      const left = m.meet.filter(inWin).length; txt(c, left ? `${left} in the window` : 'window clear: Space to block', W - 12, 16, { size: 10, align: 'right', col: left ? COL.warn : P.good });
    };
    return m;
  },
});
